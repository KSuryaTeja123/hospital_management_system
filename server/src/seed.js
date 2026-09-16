const bcrypt = require("bcryptjs");
const pool = require("./db");

const ADMIN_EMAIL = "admin@hospital.local";
const ADMIN_PASSWORD = "Admin@12345";

async function seed() {
  const existing = await pool.query("SELECT id FROM users WHERE email = $1", [ADMIN_EMAIL]);
  if (!existing.rows.length) {
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await pool.query(
      "INSERT INTO users (email, password_hash, role, name) VALUES ($1,$2,'admin',$3)",
      [ADMIN_EMAIL, hash, "System Admin"]
    );
    console.log(`Admin account created: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  } else {
    console.log("Admin account already exists, skipping.");
  }

  const departments = ["General Medicine", "Cardiology", "Orthopedics", "Pediatrics", "Dermatology"];
  for (const name of departments) {
    await pool.query(
      "INSERT INTO departments (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
      [name]
    );
  }
  console.log("Starter departments ensured.");
  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
