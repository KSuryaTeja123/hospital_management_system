const express = require("express");
const pool = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

function serialize(row) {
  return {
    id: row.id,
    patientId: row.patient_id,
    patientName: row.patient_name,
    appointmentId: row.appointment_id,
    items: row.items,
    total: Number(row.total),
    status: row.status,
    createdAt: row.created_at
  };
}
const BASE_SELECT = `SELECT i.*, u.name AS patient_name FROM invoices i JOIN users u ON u.id = i.patient_id`;

// GET /api/invoices — role-aware
router.get("/", async (req, res) => {
  const { patientId } = req.query;
  const params = [];
  let where = [];
  if (req.role === "patient") { params.push(req.userId); where.push(`i.patient_id = $${params.length}`); }
  else if (patientId) { params.push(patientId); where.push(`i.patient_id = $${params.length}`); }

  const query = BASE_SELECT + (where.length ? ` WHERE ${where.join(" AND ")}` : "") + " ORDER BY i.created_at DESC";
  const result = await pool.query(query, params);
  res.json(result.rows.map(serialize));
});

// POST /api/invoices — receptionist/admin
router.post("/", requireRole("admin", "receptionist"), async (req, res) => {
  const { patientId, appointmentId, items } = req.body || {};
  if (!patientId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "patientId and at least one line item are required." });
  }
  const total = items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
  try {
    const result = await pool.query(
      "INSERT INTO invoices (patient_id, appointment_id, items, total) VALUES ($1,$2,$3,$4) RETURNING id",
      [patientId, appointmentId || null, JSON.stringify(items), total]
    );
    const full = await pool.query(BASE_SELECT + " WHERE i.id = $1", [result.rows[0].id]);
    res.status(201).json(serialize(full.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create invoice." });
  }
});

// PUT /api/invoices/:id/pay — receptionist/admin
router.put("/:id/pay", requireRole("admin", "receptionist"), async (req, res) => {
  const result = await pool.query("UPDATE invoices SET status = 'paid' WHERE id = $1 RETURNING id", [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: "Invoice not found." });
  const full = await pool.query(BASE_SELECT + " WHERE i.id = $1", [result.rows[0].id]);
  res.json(serialize(full.rows[0]));
});

module.exports = router;
