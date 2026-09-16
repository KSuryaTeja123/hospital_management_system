const express = require("express");
const pool = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

function serialize(row) {
  return {
    id: row.id,
    appointmentId: row.appointment_id,
    patientId: row.patient_id,
    patientName: row.patient_name,
    doctorId: row.doctor_id,
    doctorName: row.doctor_name,
    diagnosis: row.diagnosis,
    medicines: row.medicines,
    notes: row.notes,
    createdAt: row.created_at
  };
}
const BASE_SELECT = `
  SELECT pr.*, p.name AS patient_name, d.name AS doctor_name
  FROM prescriptions pr
  JOIN users p ON p.id = pr.patient_id
  JOIN users d ON d.id = pr.doctor_id
`;

// GET /api/prescriptions — role-aware, optional ?patientId= (for staff/doctor lookup)
router.get("/", async (req, res) => {
  const { patientId } = req.query;
  const params = [];
  let where = [];

  if (req.role === "patient") { params.push(req.userId); where.push(`pr.patient_id = $${params.length}`); }
  else if (req.role === "doctor") { params.push(req.userId); where.push(`pr.doctor_id = $${params.length}`); }
  else if (patientId) { params.push(patientId); where.push(`pr.patient_id = $${params.length}`); }

  const query = BASE_SELECT + (where.length ? ` WHERE ${where.join(" AND ")}` : "") + " ORDER BY pr.created_at DESC";
  const result = await pool.query(query, params);
  res.json(result.rows.map(serialize));
});

// POST /api/prescriptions — doctors only
router.post("/", requireRole("doctor"), async (req, res) => {
  const { appointmentId, patientId, diagnosis, medicines, notes } = req.body || {};
  if (!patientId || !Array.isArray(medicines) || medicines.length === 0) {
    return res.status(400).json({ error: "patientId and at least one medicine are required." });
  }
  try {
    const result = await pool.query(
      `INSERT INTO prescriptions (appointment_id, patient_id, doctor_id, diagnosis, medicines, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [appointmentId || null, patientId, req.userId, diagnosis || null, JSON.stringify(medicines), notes || null]
    );
    const full = await pool.query(BASE_SELECT + " WHERE pr.id = $1", [result.rows[0].id]);
    res.status(201).json(serialize(full.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create prescription." });
  }
});

module.exports = router;
