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
    doctorId: row.doctor_id,
    doctorName: row.doctor_name,
    departmentId: row.department_id,
    departmentName: row.department_name,
    date: row.appointment_date instanceof Date ? row.appointment_date.toISOString().slice(0,10) : row.appointment_date,
    time: row.appointment_time,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at
  };
}

const BASE_SELECT = `
  SELECT a.*, p.name AS patient_name, d.name AS doctor_name, dep.name AS department_name
  FROM appointments a
  JOIN users p ON p.id = a.patient_id
  JOIN users d ON d.id = a.doctor_id
  LEFT JOIN departments dep ON dep.id = a.department_id
`;

// GET /api/appointments — role-aware, optional ?date= & ?status= filters
router.get("/", async (req, res) => {
  const { date, status } = req.query;
  const params = [];
  let where = [];

  if (req.role === "patient") { params.push(req.userId); where.push(`a.patient_id = $${params.length}`); }
  else if (req.role === "doctor") { params.push(req.userId); where.push(`a.doctor_id = $${params.length}`); }
  // admin & receptionist see everything unless filtered

  if (date) { params.push(date); where.push(`a.appointment_date = $${params.length}`); }
  if (status) { params.push(status); where.push(`a.status = $${params.length}`); }

  const query = BASE_SELECT + (where.length ? ` WHERE ${where.join(" AND ")}` : "") + " ORDER BY a.appointment_date DESC, a.appointment_time";
  try {
    const result = await pool.query(query, params);
    res.json(result.rows.map(serialize));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load appointments." });
  }
});

// POST /api/appointments — patient books for self, or receptionist/admin books on behalf of a patient
router.post("/", async (req, res) => {
  const { patientId, doctorId, departmentId, date, time, reason } = req.body || {};
  if (!doctorId || !date || !time) return res.status(400).json({ error: "doctorId, date and time are required." });

  let effectivePatientId;
  if (req.role === "patient") {
    effectivePatientId = req.userId;
  } else if (["admin", "receptionist"].includes(req.role)) {
    if (!patientId) return res.status(400).json({ error: "patientId is required when staff books an appointment." });
    effectivePatientId = patientId;
  } else {
    return res.status(403).json({ error: "You don't have permission to book appointments." });
  }

  try {
    const doctorCheck = await pool.query("SELECT department_id FROM doctors WHERE user_id = $1", [doctorId]);
    if (!doctorCheck.rows.length) return res.status(404).json({ error: "Doctor not found." });
    const resolvedDept = departmentId || doctorCheck.rows[0].department_id;

    const result = await pool.query(
      `INSERT INTO appointments (patient_id, doctor_id, department_id, appointment_date, appointment_time, reason)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [effectivePatientId, doctorId, resolvedDept, date, time, reason || null]
    );
    const full = await pool.query(BASE_SELECT + " WHERE a.id = $1", [result.rows[0].id]);
    res.status(201).json(serialize(full.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not book appointment." });
  }
});

// PUT /api/appointments/:id/status — doctor (their own), receptionist, or admin
router.put("/:id/status", requireRole("admin", "receptionist", "doctor"), async (req, res) => {
  const { status } = req.body || {};
  if (!["scheduled", "completed", "cancelled"].includes(status)) {
    return res.status(400).json({ error: "Invalid status." });
  }
  try {
    const existing = await pool.query("SELECT * FROM appointments WHERE id = $1", [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: "Appointment not found." });
    if (req.role === "doctor" && existing.rows[0].doctor_id !== req.userId) {
      return res.status(403).json({ error: "You can only update your own appointments." });
    }
    const result = await pool.query("UPDATE appointments SET status = $1 WHERE id = $2 RETURNING id", [status, req.params.id]);
    const full = await pool.query(BASE_SELECT + " WHERE a.id = $1", [result.rows[0].id]);
    res.json(serialize(full.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update appointment." });
  }
});

// PUT /api/appointments/:id — reschedule (receptionist/admin, or patient for own upcoming appointment)
router.put("/:id", async (req, res) => {
  const { date, time, reason } = req.body || {};
  try {
    const existing = await pool.query("SELECT * FROM appointments WHERE id = $1", [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: "Appointment not found." });
    const appt = existing.rows[0];
    if (req.role === "patient" && appt.patient_id !== req.userId) {
      return res.status(403).json({ error: "You can only reschedule your own appointments." });
    }
    if (!["patient", "admin", "receptionist"].includes(req.role)) {
      return res.status(403).json({ error: "You don't have permission to do that." });
    }
    const result = await pool.query(
      "UPDATE appointments SET appointment_date = $1, appointment_time = $2, reason = $3 WHERE id = $4 RETURNING id",
      [date || appt.appointment_date, time || appt.appointment_time, reason ?? appt.reason, req.params.id]
    );
    const full = await pool.query(BASE_SELECT + " WHERE a.id = $1", [result.rows[0].id]);
    res.json(serialize(full.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not reschedule appointment." });
  }
});

module.exports = router;
