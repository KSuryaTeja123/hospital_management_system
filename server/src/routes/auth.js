const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function issueToken(userId, role) {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

// Public signup — patients only. Staff accounts are created by an admin (see /api/staff).
router.post("/signup", async (req, res) => {
  const { email, password, name, phone, dateOfBirth, gender, address, bloodGroup } = req.body || {};
  if (!email || !password || !name) {
    return res.status(400).json({ error: "Email, password and name are required." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }
  const normalizedEmail = String(email).trim().toLowerCase();

  const client = await pool.connect();
  try {
    const existing = await client.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
    if (existing.rows.length) {
      return res.status(409).json({ error: "An account with that email already exists." });
    }
    const hash = await bcrypt.hash(password, 10);
    await client.query("BEGIN");
    const userResult = await client.query(
      "INSERT INTO users (email, password_hash, role, name, phone) VALUES ($1,$2,'patient',$3,$4) RETURNING id, email, name, role",
      [normalizedEmail, hash, name, phone || null]
    );
    const user = userResult.rows[0];
    await client.query(
      "INSERT INTO patients (user_id, date_of_birth, gender, address, blood_group) VALUES ($1,$2,$3,$4,$5)",
      [user.id, dateOfBirth || null, gender || null, address || null, bloodGroup || null]
    );
    await client.query("COMMIT");

    const token = issueToken(user.id, user.role);
    res.status(201).json({ token, user });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Could not create account." });
  } finally {
    client.release();
  }
});

// Login — works for all roles (patient, doctor, receptionist, admin)
router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Email and password are required." });
  const normalizedEmail = String(email).trim().toLowerCase();

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [normalizedEmail]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: "Incorrect email or password." });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Incorrect email or password." });

    const token = issueToken(user.id, user.role);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed." });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  const result = await pool.query("SELECT id, email, name, role, phone FROM users WHERE id = $1", [req.userId]);
  if (!result.rows.length) return res.status(404).json({ error: "User not found." });
  res.json({ user: result.rows[0] });
});

module.exports = router;
