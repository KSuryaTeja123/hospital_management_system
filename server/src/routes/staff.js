const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth, requireRole("admin"));

// GET /api/staff?role=doctor|receptionist
router.get("/", async (req, res) => {
  const { role } = req.query;
  try {
    let query = `SELECT u.id, u.email, u.name, u.phone, u.role, u.created_at,
                 d.department_id, d.specialization, d.consultation_fee, dep.name AS department_name
                 FROM users u
                 LEFT JOIN doctors d ON d.user_id = u.id
                 LEFT JOIN departments dep ON dep.id = d.department_id
                 WHERE u.role IN ('doctor','receptionist')`;
    const params = [];
    if (role) { params.push(role); query += ` AND u.role = $${params.length}`; }
    query += " ORDER BY u.created_at DESC";
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load staff." });
  }
});

// POST /api/staff — create a doctor or receptionist account
router.post("/", async (req, res) => {
  const { email, password, name, phone, role, departmentId, specialization, consultationFee } = req.body || {};
  if (!email || !password || !name || !["doctor", "receptionist"].includes(role)) {
    return res.status(400).json({ error: "Email, password, name and a valid role (doctor/receptionist) are required." });
  }
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
  const normalizedEmail = String(email).trim().toLowerCase();

  const client = await pool.connect();
  try {
    const existing = await client.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
    if (existing.rows.length) return res.status(409).json({ error: "An account with that email already exists." });

    const hash = await bcrypt.hash(password, 10);
    await client.query("BEGIN");
    const userResult = await client.query(
      "INSERT INTO users (email, password_hash, role, name, phone) VALUES ($1,$2,$3,$4,$5) RETURNING id, email, name, role, phone",
      [normalizedEmail, hash, role, name, phone || null]
    );
    const user = userResult.rows[0];
    if (role === "doctor") {
      await client.query(
        "INSERT INTO doctors (user_id, department_id, specialization, consultation_fee) VALUES ($1,$2,$3,$4)",
        [user.id, departmentId || null, specialization || null, consultationFee || 0]
      );
    }
    await client.query("COMMIT");
    res.status(201).json(user);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Could not create staff account." });
  } finally {
    client.release();
  }
});

// DELETE /api/staff/:id
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM users WHERE id = $1 AND role IN ('doctor','receptionist') RETURNING id",
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Staff member not found." });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not remove staff member." });
  }
});

module.exports = router;
