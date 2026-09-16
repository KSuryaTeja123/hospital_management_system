const express = require("express");
const pool = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// GET /api/departments — any authenticated user (needed for booking dropdowns)
router.get("/", async (req, res) => {
  const result = await pool.query("SELECT * FROM departments ORDER BY name");
  res.json(result.rows);
});

router.post("/", requireRole("admin"), async (req, res) => {
  const { name, description } = req.body || {};
  if (!name) return res.status(400).json({ error: "Department name is required." });
  try {
    const result = await pool.query(
      "INSERT INTO departments (name, description) VALUES ($1,$2) RETURNING *",
      [name, description || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "A department with that name already exists." });
    console.error(err);
    res.status(500).json({ error: "Could not create department." });
  }
});

router.put("/:id", requireRole("admin"), async (req, res) => {
  const { name, description } = req.body || {};
  try {
    const result = await pool.query(
      "UPDATE departments SET name = $1, description = $2 WHERE id = $3 RETURNING *",
      [name, description || null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Department not found." });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update department." });
  }
});

router.delete("/:id", requireRole("admin"), async (req, res) => {
  const result = await pool.query("DELETE FROM departments WHERE id = $1 RETURNING id", [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: "Department not found." });
  res.status(204).send();
});

module.exports = router;
