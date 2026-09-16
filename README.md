# MedCore — Hospital Management System

A full-stack, role-based hospital management app. Node.js + Express + PostgreSQL
backend with JWT authentication, and a vanilla JavaScript frontend — no build step,
no framework, deploy anywhere that serves static files.

## Roles

| Role | Can do |
|---|---|
| **Admin** | Manage departments, create doctor/receptionist accounts, view all patients/appointments/billing, see analytics dashboard |
| **Doctor** | View their own schedule, mark appointments completed/cancelled, view patients they've treated, write prescriptions |
| **Receptionist** | Register walk-in patients, book/manage appointments on behalf of patients, create and collect invoices |
| **Patient** | Self-signup, book appointments, view their own appointments/prescriptions/invoices |

Staff accounts (doctor, receptionist) are **not** self-signup — they're created by
an admin. This mirrors how real hospitals provision access, and is enforced at the
API level (not just hidden in the UI).

## Architecture
```
hospital-mgmt/
├── client/            Static site — index.html, style.css, app.js, api.js
└── server/
    ├── src/
    │   ├── index.js          Express app entry point
    │   ├── db.js              PostgreSQL connection pool
    │   ├── schema.sql         Table definitions
    │   ├── migrate.js         Applies schema.sql
    │   ├── seed.js            Creates a default admin account + starter departments
    │   ├── middleware/auth.js JWT verification + role-based access control
    │   └── routes/            auth, staff, departments, doctors, patients,
    │                          appointments, prescriptions, invoices, dashboard
    └── package.json
```

## Running it locally

### 1. Backend
Requires Node.js and a PostgreSQL server (local install, or a free hosted one —
see Neon/Supabase note below).

```bash
cd server
npm install
cp .env.example .env        # then edit .env — see below
npm run migrate             # creates the tables
npm run seed                # creates a default admin account + starter departments
npm start                   # starts the API on http://localhost:4001
```

Edit `.env`:
```
PORT=4001
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DBNAME
JWT_SECRET=<a long random string>
CORS_ORIGIN=http://localhost:8081
```

**Default admin login** (created by `npm run seed`):
```
Email:    admin@hospital.local
Password: Admin@12345
```
Change this password (or delete/recreate the account) before deploying anywhere public.

### 2. Frontend
From the `hospital-mgmt/client` folder:
```bash
python3 -m http.server 8081
```
Open `http://localhost:8081`. Log in with the admin account above, or sign up as
a new patient. If your backend isn't at `http://localhost:4001/api`, expand
**"API server address"** on the login screen and point it elsewhere.

## Typical first session
1. Log in as admin → **Departments** → add a department (e.g. "Cardiology")
2. **Staff** → "+ Add staff account" → create a doctor in that department
3. Log out → sign up as a new patient
4. **Book Appointment** → pick the doctor you just created → book a slot
5. Log out → log in as the doctor → **My Schedule** → mark the appointment
   completed → **Write prescription**
6. Log in as admin → **Dashboard** to see the numbers update

## Deploying for real

### Option A: One-click deploy with Render Blueprint
This repo includes a `render.yaml` — a Render "Blueprint" that defines the API
service, the static client, and a free Postgres database all in one file. Push
this repo to GitHub, then in Render: **New → Blueprint**, connect the repo, and
Render provisions all three pieces automatically (including running `migrate`
and `seed` as part of the API's build step). Once it finishes, open the client
service's URL, expand "API server address" on the login screen, and paste in
the API service's URL (e.g. `https://hospital-mgmt-api.onrender.com/api`) —
Render assigns each service its own subdomain so they need to be linked manually
this one time.

### Option B: Manual setup
**Backend + database (Render, free tier):**
1. Push this repo to GitHub
2. Render → New Web Service → connect the repo, root directory `server`
3. Build command: `npm install`, Start command: `npm start`
4. Add a free Render PostgreSQL instance, copy its connection string into `DATABASE_URL`
5. After first deploy, open Render's Shell tab and run `npm run migrate && npm run seed`
6. Set `CORS_ORIGIN` to your deployed frontend's URL once you have it

**Frontend (Netlify Drop, easiest):**
1. https://app.netlify.com/drop — drag in the `client` folder's contents
   (`index.html`, `style.css`, `app.js`, `api.js`)
2. Open the live URL, expand "API server address," paste in your Render backend URL
   (e.g. `https://your-api.onrender.com/api`)

## What to highlight in interviews
- **Role-based access control enforced server-side**, not just hidden UI — every
  route checks the JWT's role claim (`middleware/auth.js`'s `requireRole`), and a
  doctor's patient list is scoped via a SQL join to only patients they've actually
  treated (see `routes/patients.js`), not filtered client-side.
- **Staff provisioning model**: only admins can create doctor/receptionist accounts;
  public signup is patient-only. This is a common real-world pattern worth being
  able to explain.
- **Transactional writes**: creating a doctor account (`users` + `doctors` rows) and
  patient registration (`users` + `patients` rows) both use `BEGIN`/`COMMIT`/`ROLLBACK`
  so a failure partway through never leaves an orphaned row.
- **Known limitation worth naming**: patients can reschedule their own appointments
  but can't cancel them directly (only staff can change appointment status) — a
  deliberate scope decision mirroring how many clinics require a phone call to
  cancel, but also a reasonable "what would you add next" answer in an interview.

## Notes
- This is a learning/portfolio project, not a real clinical system — no HIPAA-grade
  encryption, audit logging, or data retention policy is implemented.
- The JWT secret and database credentials in `.env` are secrets — never commit a
  real `.env` file (`.env.example` is the template to commit; `.gitignore` already
  excludes `.env` and `node_modules/`).
