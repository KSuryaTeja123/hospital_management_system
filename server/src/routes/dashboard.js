const express = require("express");
const pool = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth, requireRole("admin"));

router.get("/stats", async (req, res) => {
  try {
    const [patients, doctors, todayAppts, apptsByStatus, revenue, apptsByDept] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM users WHERE role = 'patient'"),
      pool.query("SELECT COUNT(*) FROM users WHERE role = 'doctor'"),
      pool.query("SELECT COUNT(*) FROM appointments WHERE appointment_date = CURRENT_DATE"),
      pool.query("SELECT status, COUNT(*) FROM appointments GROUP BY status"),
      pool.query("SELECT COALESCE(SUM(total),0) AS total FROM invoices WHERE status = 'paid' AND created_at >= NOW() - INTERVAL '30 days'"),
      pool.query(`SELECT dep.name, COUNT(*) FROM appointments a
                  LEFT JOIN departments dep ON dep.id = a.department_id
                  GROUP BY dep.name ORDER BY COUNT(*) DESC`)
    ]);
    const pendingInvoices = await pool.query("SELECT COALESCE(SUM(total),0) AS total FROM invoices WHERE status = 'pending'");

    res.json({
      totalPatients: Number(patients.rows[0].count),
      totalDoctors: Number(doctors.rows[0].count),
      todaysAppointments: Number(todayAppts.rows[0].count),
      appointmentsByStatus: Object.fromEntries(apptsByStatus.rows.map(r => [r.status, Number(r.count)])),
      revenueLast30Days: Number(revenue.rows[0].total),
      pendingInvoicesTotal: Number(pendingInvoices.rows[0].total),
      appointmentsByDepartment: apptsByDept.rows.map(r => ({ department: r.name || "Unassigned", count: Number(r.count) }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load dashboard stats." });
  }
});

module.exports = router;
