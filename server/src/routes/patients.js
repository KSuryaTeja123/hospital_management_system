const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

function serializePatient(row) {
  return {
    id: row.id, email: row.email, name: row.name, phone: row.phone,
    dateOfBirth: row.date_of_birth, gender: row.gender, address: row.address, bloodGroup: row.blood_group
  };
}

// GET /api/patients — admin & receptionist see all; doctors see only patients they've treated
router.get("/", requireRole("admin", "receptionist", "doctor"), async (req, res) => {
  try {
    let query, params = [];
    if (req.role === "doctor") {
      query = `SELECT DISTINCT u.id, u.email, u.name, u.phone, p.date_of_birth, p.gender, p.address, p.blood_group
               FROM users u JOIN patients p ON p.user_id = u.id
               JOIN appointments a ON a.patient_id = u.id
               WHERE a.doctor_id = $1 ORDER BY u.name`;
      params = [req.userId];
    } else {
      query = `SELECT u.id, u.email, u.name, u.phone, p.date_of_birth, p.gender, p.address, p.blood_group
               FROM users u JOIN patients p ON p.user_id = u.id ORDER BY u.name`;
    }
    const result = await pool.query(query, params);
    res.json(result.rows.map(serializePatient));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load patients." });
  }
});

// GET /api/patients/:id — self, or admin/receptionist, or doctor who has treated them
router.get("/:id", async (req, res) => {
  const targetId = Number(req.params.id);
  if (req.role === "patient" && req.userId !== targetId) {
    return res.status(403).json({ error: "You can only view your own record." });
  }
  if (req.role === "doctor") {
    const treated = await pool.query(
      "SELECT 1 FROM appointments WHERE doctor_id = $1 AND patient_id = $2 LIMIT 1",
      [req.userId, targetId]
    );
    if (!treated.rows.length) return res.status(403).json({ error: "You haven't treated this patient." });
  }
  const result = await pool.query(
    `SELECT u.id, u.email, u.name, u.phone, p.date_of_birth, p.gender, p.address, p.blood_group
     FROM users u JOIN patients p ON p.user_id = u.id WHERE u.id = $1`,
    [targetId]
  );
  if (!result.rows.length) return res.status(404).json({ error: "Patient not found." });
  res.json(serializePatient(result.rows[0]));
});

// POST /api/patients — receptionist/admin walk-in registration
router.post("/", requireRole("admin", "receptionist"), async (req, res) => {
  const { email, password, name, phone, dateOfBirth, gender, address, bloodGroup } = req.body || {};
  if (!email || !password || !name) return res.status(400).json({ error: "Email, password and name are required." });
  const normalizedEmail = String(email).trim().toLowerCase();

  const client = await pool.connect();
  try {
    const existing = await client.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
    if (existing.rows.length) return res.status(409).json({ error: "An account with that email already exists." });
    const hash = await bcrypt.hash(password, 10);
    await client.query("BEGIN");
    const userResult = await client.query(
      "INSERT INTO users (email, password_hash, role, name, phone) VALUES ($1,$2,'patient',$3,$4) RETURNING id, email, name, phone",
      [normalizedEmail, hash, name, phone || null]
    );
    const user = userResult.rows[0];
    await client.query(
      "INSERT INTO patients (user_id, date_of_birth, gender, address, blood_group) VALUES ($1,$2,$3,$4,$5)",
      [user.id, dateOfBirth || null, gender || null, address || null, bloodGroup || null]
    );
    await client.query("COMMIT");
    res.status(201).json(serializePatient({ ...user, date_of_birth: dateOfBirth, gender, address, blood_group: bloodGroup }));
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Could not register patient." });
  } finally {
    client.release();
  }
});

// PUT /api/patients/:id — self, admin, or receptionist
router.put("/:id", async (req, res) => {
  const targetId = Number(req.params.id);
  if (req.role === "patient" && req.userId !== targetId) {
    return res.status(403).json({ error: "You can only edit your own record." });
  }
  if (!["patient", "admin", "receptionist"].includes(req.role)) {
    return res.status(403).json({ error: "You don't have permission to do that." });
  }
  const { name, phone, dateOfBirth, gender, address, bloodGroup } = req.body || {};
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE users SET name = $1, phone = $2 WHERE id = $3", [name, phone || null, targetId]);
    await client.query(
      "UPDATE patients SET date_of_birth=$1, gender=$2, address=$3, blood_group=$4 WHERE user_id=$5",
      [dateOfBirth || null, gender || null, address || null, bloodGroup || null, targetId]
    );
    await client.query("COMMIT");
    res.json({ id: targetId, name, phone, dateOfBirth, gender, address, bloodGroup });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Could not update patient." });
  } finally {
    client.release();
  }
});

module.exports = router;
