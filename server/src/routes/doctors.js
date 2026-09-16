const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// GET /api/doctors — any authenticated user (patients need this to book)
router.get("/", async (req, res) => {
  const { departmentId } = req.query;
  let query = `SELECT u.id, u.name, u.email, u.phone, d.department_id, dep.name AS department_name,
               d.specialization, d.bio, d.consultation_fee
               FROM doctors d
               JOIN users u ON u.id = d.user_id
               LEFT JOIN departments dep ON dep.id = d.department_id`;
  const params = [];
  if (departmentId) { params.push(departmentId); query += ` WHERE d.department_id = $${params.length}`; }
  query += " ORDER BY u.name";
  const result = await pool.query(query, params);
  res.json(result.rows);
});

router.get("/:id", async (req, res) => {
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.phone, d.department_id, dep.name AS department_name,
     d.specialization, d.bio, d.consultation_fee
     FROM doctors d JOIN users u ON u.id = d.user_id
     LEFT JOIN departments dep ON dep.id = d.department_id
     WHERE u.id = $1`,
    [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: "Doctor not found." });
  res.json(result.rows[0]);
});

module.exports = router;
