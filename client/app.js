/* ---------- State ---------- */
let state = { user: null, departments: [], doctors: [] };
let currentTab = null;

/* ---------- Utilities ---------- */
function escapeHtml(s){ return String(s??"").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function todayStr(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function niceDate(dateStr){
  if(!dateStr) return "";
  const [y,m,d] = dateStr.split("-").map(Number);
  return new Date(y,m-1,d).toLocaleDateString(undefined,{ weekday:"short", month:"short", day:"numeric", year:"numeric" });
}
function money(n){ return `₹${Number(n||0).toFixed(2)}`; }

/* ---------- Nav config per role ---------- */
const TABS_BY_ROLE = {
  admin: [
    { key:"dashboard", label:"Dashboard" },
    { key:"departments", label:"Departments" },
    { key:"staff", label:"Staff" },
    { key:"patients", label:"Patients" },
    { key:"appointments", label:"Appointments" },
    { key:"billing", label:"Billing" }
  ],
  receptionist: [
    { key:"appointments", label:"Appointments" },
    { key:"patients", label:"Patients" },
    { key:"billing", label:"Billing" },
    { key:"doctors", label:"Doctors" }
  ],
  doctor: [
    { key:"appointments", label:"My Schedule" },
    { key:"patients", label:"My Patients" },
    { key:"prescriptions", label:"Prescriptions" }
  ],
  patient: [
    { key:"book", label:"Book Appointment" },
    { key:"appointments", label:"My Appointments" },
    { key:"prescriptions", label:"Prescriptions" },
    { key:"billing", label:"Billing" }
  ]
};

function renderNav(){
  const tabsEl = document.getElementById("tabs");
  const tabs = TABS_BY_ROLE[state.user.role] || [];
  tabsEl.innerHTML = tabs.map(t=>`<button class="tab" data-tab="${t.key}">${t.label}</button>`).join("");
  tabsEl.querySelectorAll(".tab").forEach(btn=>{
    btn.addEventListener("click", ()=> switchTab(btn.dataset.tab));
  });
  document.getElementById("userChip").innerHTML =
    `<strong>${escapeHtml(state.user.name)}</strong><span class="role-badge">${state.user.role}</span>`;
}

async function switchTab(tab){
  currentTab = tab;
  document.querySelectorAll(".tab").forEach(t=> t.classList.toggle("active", t.dataset.tab===tab));
  const main = document.getElementById("main");
  main.innerHTML = `<div class="empty-state">Loading…</div>`;
  const renderer = RENDERERS[tab];
  if(!renderer){ main.innerHTML = `<div class="empty-state"><h3>Not available</h3></div>`; return; }
  try{ await renderer(); }
  catch(err){ main.innerHTML = `<div class="empty-state"><h3>Something went wrong</h3><p>${escapeHtml(err.message)}</p></div>`; }
}

function emptyState(title, sub){
  return `<div class="empty-state"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(sub||"")}</p></div>`;
}

/* ================= DASHBOARD (admin) ================= */
let deptChartInstance = null;
async function renderDashboard(){
  const main = document.getElementById("main");
  const stats = await Api.dashboardStats();
  const s = stats.appointmentsByStatus || {};
  main.innerHTML = `
    <div class="section-head"><h1>Dashboard</h1><span class="meta">Overview</span></div>
    <div class="stat-grid">
      <div class="stat-card"><div class="num">${stats.totalPatients}</div><div class="label">Total patients</div></div>
      <div class="stat-card"><div class="num">${stats.totalDoctors}</div><div class="label">Total doctors</div></div>
      <div class="stat-card"><div class="num">${stats.todaysAppointments}</div><div class="label">Appointments today</div></div>
      <div class="stat-card"><div class="num">${money(stats.revenueLast30Days)}</div><div class="label">Revenue (30d)</div></div>
      <div class="stat-card"><div class="num">${money(stats.pendingInvoicesTotal)}</div><div class="label">Pending invoices</div></div>
      <div class="stat-card"><div class="num">${s.scheduled||0} / ${s.completed||0} / ${s.cancelled||0}</div><div class="label">Scheduled / Completed / Cancelled</div></div>
    </div>
    <div class="chart-card">
      <h3>Appointments by department</h3>
      <canvas id="deptChart" height="90"></canvas>
    </div>
  `;
  if(deptChartInstance) deptChartInstance.destroy();
  const ctx = document.getElementById("deptChart");
  deptChartInstance = new Chart(ctx, {
    type:"bar",
    data:{
      labels: stats.appointmentsByDepartment.map(d=>d.department),
      datasets:[{ label:"Appointments", data: stats.appointmentsByDepartment.map(d=>d.count), backgroundColor:"#2f5f8f" }]
    },
    options:{ plugins:{ legend:{display:false} }, scales:{ y:{ beginAtZero:true, ticks:{ stepSize:1 } } } }
  });
}

/* ================= DEPARTMENTS (admin) ================= */
async function renderDepartments(){
  const main = document.getElementById("main");
  const depts = await Api.listDepartments();
  state.departments = depts;
  main.innerHTML = `
    <div class="section-head"><h1>Departments</h1><span class="meta">${depts.length} total</span></div>
    <div class="record-card">
      <form id="deptForm" class="field-row" style="margin-bottom:0; align-items:flex-end;">
        <label>Name <input id="deptName" required placeholder="e.g. Neurology"></label>
        <label>Description <input id="deptDesc" placeholder="Optional"></label>
        <button class="btn primary" type="submit">Add</button>
      </form>
    </div>
    ${depts.length===0 ? emptyState("No departments yet","Add your first department above.") : depts.map(d=>`
      <div class="record-card record-row">
        <div>
          <div class="record-title">${escapeHtml(d.name)}</div>
          <div class="record-sub">${escapeHtml(d.description||"")}</div>
        </div>
        <button class="btn danger" data-id="${d.id}">Delete</button>
      </div>
    `).join("")}
  `;
  document.getElementById("deptForm").addEventListener("submit", async e=>{
    e.preventDefault();
    try{
      await Api.createDepartment({ name: document.getElementById("deptName").value.trim(), description: document.getElementById("deptDesc").value.trim() });
      renderDepartments();
    }catch(err){ alert(err.message); }
  });
  main.querySelectorAll("button[data-id]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      if(!confirm("Delete this department?")) return;
      try{ await Api.deleteDepartment(btn.dataset.id); renderDepartments(); }
      catch(err){ alert(err.message); }
    });
  });
}

/* ================= STAFF (admin) ================= */
async function renderStaff(){
  const main = document.getElementById("main");
  const [staff, depts] = await Promise.all([ Api.listStaff(), Api.listDepartments() ]);
  state.departments = depts;
  main.innerHTML = `
    <div class="section-head">
      <h1>Staff</h1><span class="meta">${staff.length} accounts</span>
      <div class="actions"><button class="btn primary" id="addStaffBtn">+ Add staff account</button></div>
    </div>
    ${staff.length===0 ? emptyState("No staff yet","Add a doctor or receptionist account.") : staff.map(s=>`
      <div class="record-card record-row">
        <div>
          <div class="record-title">${escapeHtml(s.name)} <span class="badge ${s.role}">${s.role}</span></div>
          <div class="record-sub">${escapeHtml(s.email)}${s.department_name ? " · "+escapeHtml(s.department_name):""}${s.specialization ? " · "+escapeHtml(s.specialization):""}</div>
        </div>
        <button class="btn danger" data-id="${s.id}">Remove</button>
      </div>
    `).join("")}
  `;
  document.getElementById("addStaffBtn").addEventListener("click", openStaffModal);
  main.querySelectorAll("button[data-id]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      if(!confirm("Remove this staff account? This cannot be undone.")) return;
      try{ await Api.deleteStaff(btn.dataset.id); renderStaff(); }
      catch(err){ alert(err.message); }
    });
  });
}

function openStaffModal(){
  const depts = state.departments;
  openModal("Add staff account", `
    <form id="staffForm">
      <div class="field-row">
        <label>Full name <input id="sfName" required></label>
        <label>Role
          <select id="sfRole">
            <option value="doctor">Doctor</option>
            <option value="receptionist">Receptionist</option>
          </select>
        </label>
      </div>
      <div class="field-row">
        <label>Email <input id="sfEmail" type="email" required></label>
        <label>Temporary password <input id="sfPassword" type="text" required placeholder="At least 8 characters" minlength="8"></label>
      </div>
      <label class="full">Phone <input id="sfPhone" placeholder="Optional"></label>
      <div id="doctorFields">
        <div class="field-row">
          <label>Department
            <select id="sfDept"><option value="">—</option>${depts.map(d=>`<option value="${d.id}">${escapeHtml(d.name)}</option>`).join("")}</select>
          </label>
          <label>Specialization <input id="sfSpecialization" placeholder="e.g. Cardiologist"></label>
        </div>
        <label class="full">Consultation fee (₹) <input id="sfFee" type="number" min="0" value="300"></label>
      </div>
      <div class="modal-actions">
        <div class="spacer"></div>
        <button type="button" class="btn ghost" id="staffCancel">Cancel</button>
        <button type="submit" class="btn primary">Create account</button>
      </div>
    </form>
  `);
  const roleSelect = document.getElementById("sfRole");
  const doctorFields = document.getElementById("doctorFields");
  roleSelect.addEventListener("change", ()=>{ doctorFields.style.display = roleSelect.value==="doctor" ? "block":"none"; });
  document.getElementById("staffCancel").addEventListener("click", closeModal);
  document.getElementById("staffForm").addEventListener("submit", async e=>{
    e.preventDefault();
    try{
      await Api.createStaff({
        name: document.getElementById("sfName").value.trim(),
        role: roleSelect.value,
        email: document.getElementById("sfEmail").value.trim(),
        password: document.getElementById("sfPassword").value,
        phone: document.getElementById("sfPhone").value.trim(),
        departmentId: document.getElementById("sfDept").value || null,
        specialization: document.getElementById("sfSpecialization").value.trim(),
        consultationFee: Number(document.getElementById("sfFee").value)||0
      });
      closeModal();
      renderStaff();
    }catch(err){ alert(err.message); }
  });
}

/* ================= DOCTORS DIRECTORY (receptionist, read-only) ================= */
async function renderDoctorsDirectory(){
  const main = document.getElementById("main");
  const doctors = await Api.listDoctors();
  main.innerHTML = `
    <div class="section-head"><h1>Doctors</h1><span class="meta">${doctors.length} on staff</span></div>
    ${doctors.length===0 ? emptyState("No doctors yet","") : doctors.map(d=>`
      <div class="record-card">
        <div class="record-title">${escapeHtml(d.name)}</div>
        <div class="record-sub">${escapeHtml(d.specialization||"")}${d.department_name ? " · "+escapeHtml(d.department_name):""} · ${money(d.consultation_fee)} consultation</div>
      </div>
    `).join("")}
  `;
}

/* ================= PATIENTS ================= */
async function renderPatients(){
  const main = document.getElementById("main");
  const patients = await Api.listPatients();
  const canRegister = ["admin","receptionist"].includes(state.user.role);
  main.innerHTML = `
    <div class="section-head">
      <h1>${state.user.role==="doctor" ? "My Patients" : "Patients"}</h1>
      <span class="meta">${patients.length} total</span>
      ${canRegister ? `<div class="actions"><button class="btn primary" id="registerPatientBtn">+ Register patient</button></div>` : ""}
    </div>
    ${patients.length===0 ? emptyState("No patients yet", canRegister ? "Register a walk-in patient to get started." : "You haven't treated any patients yet.") : patients.map(p=>`
      <div class="record-card">
        <div class="record-title">${escapeHtml(p.name)}</div>
        <div class="record-sub">${escapeHtml(p.email)}${p.phone ? " · "+escapeHtml(p.phone):""}${p.bloodGroup ? " · "+escapeHtml(p.bloodGroup):""}${p.gender ? " · "+escapeHtml(p.gender):""}</div>
      </div>
    `).join("")}
  `;
  if(canRegister){
    document.getElementById("registerPatientBtn").addEventListener("click", openRegisterPatientModal);
  }
}

function openRegisterPatientModal(){
  openModal("Register patient", `
    <form id="regPatientForm">
      <div class="field-row">
        <label>Full name <input id="rpName" required></label>
        <label>Phone <input id="rpPhone"></label>
      </div>
      <div class="field-row">
        <label>Email <input id="rpEmail" type="email" required></label>
        <label>Temporary password <input id="rpPassword" required minlength="8"></label>
      </div>
      <div class="field-row">
        <label>Date of birth <input id="rpDob" type="date"></label>
        <label>Gender
          <select id="rpGender"><option value="">—</option><option>Female</option><option>Male</option><option>Other</option></select>
        </label>
      </div>
      <div class="field-row">
        <label>Blood group <input id="rpBlood" placeholder="e.g. O+"></label>
        <label>Address <input id="rpAddress"></label>
      </div>
      <div class="modal-actions">
        <div class="spacer"></div>
        <button type="button" class="btn ghost" id="rpCancel">Cancel</button>
        <button type="submit" class="btn primary">Register</button>
      </div>
    </form>
  `);
  document.getElementById("rpCancel").addEventListener("click", closeModal);
  document.getElementById("regPatientForm").addEventListener("submit", async e=>{
    e.preventDefault();
    try{
      await Api.createPatient({
        name: document.getElementById("rpName").value.trim(),
        phone: document.getElementById("rpPhone").value.trim(),
        email: document.getElementById("rpEmail").value.trim(),
        password: document.getElementById("rpPassword").value,
        dateOfBirth: document.getElementById("rpDob").value || null,
        gender: document.getElementById("rpGender").value || null,
        bloodGroup: document.getElementById("rpBlood").value.trim(),
        address: document.getElementById("rpAddress").value.trim()
      });
      closeModal();
      renderPatients();
    }catch(err){ alert(err.message); }
  });
}

/* ================= APPOINTMENTS ================= */
async function renderAppointments(){
  const main = document.getElementById("main");
  const appts = await Api.listAppointments();
  const canBook = ["admin","receptionist"].includes(state.user.role);
  const canWriteRx = state.user.role === "doctor";
  const canModerate = ["admin","receptionist","doctor"].includes(state.user.role);

  main.innerHTML = `
    <div class="section-head">
      <h1>${state.user.role==="doctor" ? "My Schedule" : "Appointments"}</h1>
      <span class="meta">${appts.length} total</span>
      ${canBook ? `<div class="actions"><button class="btn primary" id="bookApptBtn">+ Book appointment</button></div>` : ""}
    </div>
    ${appts.length===0 ? emptyState("No appointments yet","") : appts.map(a=>`
      <div class="record-card">
        <div class="record-row">
          <div>
            <div class="record-title">${escapeHtml(a.patientName)} <span class="muted">with</span> Dr. ${escapeHtml(a.doctorName)}</div>
            <div class="record-sub">${niceDate(a.date)} at ${escapeHtml(a.time)}${a.departmentName ? " · "+escapeHtml(a.departmentName):""}${a.reason ? " · "+escapeHtml(a.reason):""}</div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="badge ${a.status}">${a.status}</span>
          </div>
        </div>
        ${(canModerate && a.status==="scheduled") || canWriteRx ? `
        <div class="record-actions" style="margin-top:10px;">
          ${canModerate && a.status==="scheduled" ? `<button class="btn ghost" data-complete="${a.id}">Mark completed</button><button class="btn danger" data-cancel="${a.id}">Cancel</button>` : ""}
          ${canWriteRx ? `<button class="btn primary" data-rx="${a.id}" data-patient="${a.patientId}" data-patientname="${escapeHtml(a.patientName)}">Write prescription</button>` : ""}
        </div>` : ""}
      </div>
    `).join("")}
  `;

  if(canBook) document.getElementById("bookApptBtn").addEventListener("click", ()=> openBookAppointmentModal(null));
  main.querySelectorAll("[data-complete]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      try{ await Api.updateAppointmentStatus(btn.dataset.complete, "completed"); renderAppointments(); }
      catch(err){ alert(err.message); }
    });
  });
  main.querySelectorAll("[data-cancel]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      if(!confirm("Cancel this appointment?")) return;
      try{ await Api.updateAppointmentStatus(btn.dataset.cancel, "cancelled"); renderAppointments(); }
      catch(err){ alert(err.message); }
    });
  });
  main.querySelectorAll("[data-rx]").forEach(btn=>{
    btn.addEventListener("click", ()=> openPrescriptionModal(btn.dataset.rx, btn.dataset.patient, btn.dataset.patientname));
  });
}

async function openBookAppointmentModal(){
  const [patients, doctors] = await Promise.all([ Api.listPatients(), Api.listDoctors() ]);
  openModal("Book appointment", `
    <form id="bookForm">
      <label class="full">Patient
        <select id="bkPatient" required>${patients.map(p=>`<option value="${p.id}">${escapeHtml(p.name)} — ${escapeHtml(p.email)}</option>`).join("")}</select>
      </label>
      <label class="full">Doctor
        <select id="bkDoctor" required>${doctors.map(d=>`<option value="${d.id}">${escapeHtml(d.name)} — ${escapeHtml(d.specialization||"")}</option>`).join("")}</select>
      </label>
      <div class="field-row">
        <label>Date <input id="bkDate" type="date" required min="${todayStr()}"></label>
        <label>Time <input id="bkTime" type="time" required></label>
      </div>
      <label class="full">Reason <textarea id="bkReason" placeholder="Optional"></textarea></label>
      <div class="modal-actions">
        <div class="spacer"></div>
        <button type="button" class="btn ghost" id="bkCancel">Cancel</button>
        <button type="submit" class="btn primary">Book</button>
      </div>
    </form>
  `);
  document.getElementById("bkCancel").addEventListener("click", closeModal);
  document.getElementById("bookForm").addEventListener("submit", async e=>{
    e.preventDefault();
    try{
      await Api.createAppointment({
        patientId: document.getElementById("bkPatient").value,
        doctorId: document.getElementById("bkDoctor").value,
        date: document.getElementById("bkDate").value,
        time: document.getElementById("bkTime").value,
        reason: document.getElementById("bkReason").value.trim()
      });
      closeModal();
      renderAppointments();
    }catch(err){ alert(err.message); }
  });
}

/* ================= BOOK (patient tab) ================= */
async function renderBook(){
  const main = document.getElementById("main");
  const [depts, doctors] = await Promise.all([ Api.listDepartments(), Api.listDoctors() ]);
  main.innerHTML = `
    <div class="section-head"><h1>Book an appointment</h1></div>
    <div class="record-card">
      <form id="patBookForm">
        <div class="field-row">
          <label>Department
            <select id="pbDept"><option value="">Any</option>${depts.map(d=>`<option value="${d.id}">${escapeHtml(d.name)}</option>`).join("")}</select>
          </label>
          <label>Doctor
            <select id="pbDoctor" required>${doctors.map(d=>`<option value="${d.id}" data-dept="${d.department_id||''}">${escapeHtml(d.name)} — ${escapeHtml(d.specialization||"")}</option>`).join("")}</select>
          </label>
        </div>
        <div class="field-row">
          <label>Date <input id="pbDate" type="date" required min="${todayStr()}"></label>
          <label>Time <input id="pbTime" type="time" required></label>
        </div>
        <label class="full">Reason for visit <textarea id="pbReason" placeholder="Briefly describe your symptoms or reason"></textarea></label>
        <button class="btn primary" type="submit">Request appointment</button>
      </form>
    </div>
    <div class="section-head" style="margin-top:28px;"><h1 style="font-size:19px;">Upcoming</h1></div>
    <div id="upcomingList">${emptyState("Loading…","")}</div>
  `;
  const deptSelect = document.getElementById("pbDept");
  const doctorSelect = document.getElementById("pbDoctor");
  deptSelect.addEventListener("change", ()=>{
    const val = deptSelect.value;
    Array.from(doctorSelect.options).forEach(opt=>{
      opt.hidden = val && opt.dataset.dept !== val;
    });
  });
  document.getElementById("patBookForm").addEventListener("submit", async e=>{
    e.preventDefault();
    try{
      await Api.createAppointment({
        doctorId: doctorSelect.value,
        departmentId: deptSelect.value || null,
        date: document.getElementById("pbDate").value,
        time: document.getElementById("pbTime").value,
        reason: document.getElementById("pbReason").value.trim()
      });
      alert("Appointment requested!");
      renderBook();
    }catch(err){ alert(err.message); }
  });

  const upcoming = (await Api.listAppointments({ status:"scheduled" }));
  document.getElementById("upcomingList").innerHTML = upcoming.length===0
    ? emptyState("No upcoming appointments","Book one above.")
    : upcoming.map(a=>`
      <div class="record-card record-row">
        <div>
          <div class="record-title">Dr. ${escapeHtml(a.doctorName)}</div>
          <div class="record-sub">${niceDate(a.date)} at ${escapeHtml(a.time)}${a.departmentName ? " · "+escapeHtml(a.departmentName):""}</div>
        </div>
        <span class="badge ${a.status}">${a.status}</span>
      </div>`).join("");
}

/* ================= PRESCRIPTIONS ================= */
async function renderPrescriptions(){
  const main = document.getElementById("main");
  const rx = await Api.listPrescriptions();
  main.innerHTML = `
    <div class="section-head"><h1>Prescriptions</h1><span class="meta">${rx.length} total</span></div>
    ${rx.length===0 ? emptyState("No prescriptions yet","") : rx.map(r=>`
      <div class="record-card">
        <div class="record-title">${state.user.role==="doctor" ? escapeHtml(r.patientName) : "Dr. "+escapeHtml(r.doctorName)}</div>
        <div class="record-sub">${niceDate(r.createdAt?.slice(0,10))}${r.diagnosis ? " · "+escapeHtml(r.diagnosis):""}</div>
        <div class="tag-list">${(r.medicines||[]).map(m=>`<span class="tag">${escapeHtml(m.name)}${m.dosage ? " — "+escapeHtml(m.dosage):""}</span>`).join("")}</div>
        ${r.notes ? `<div class="record-sub" style="margin-top:8px;">${escapeHtml(r.notes)}</div>` : ""}
      </div>
    `).join("")}
  `;
}

function openPrescriptionModal(appointmentId, patientId, patientName){
  openModal(`Prescription for ${patientName}`, `
    <form id="rxForm">
      <label class="full">Diagnosis <input id="rxDiagnosis" placeholder="e.g. Mild hypertension"></label>
      <div id="medLines"></div>
      <button type="button" class="link-btn" id="addMedLine">+ Add medicine</button>
      <label class="full" style="margin-top:14px;">Notes <textarea id="rxNotes" placeholder="Follow-up instructions, etc."></textarea></label>
      <div class="modal-actions">
        <div class="spacer"></div>
        <button type="button" class="btn ghost" id="rxCancel">Cancel</button>
        <button type="submit" class="btn primary">Save prescription</button>
      </div>
    </form>
  `);
  const medLines = document.getElementById("medLines");
  function addLine(){
    const row = document.createElement("div");
    row.className = "med-line";
    row.innerHTML = `
      <input placeholder="Medicine name" class="med-name">
      <input placeholder="Dosage" class="med-dosage">
      <input placeholder="Instructions" class="med-instr">
      <button type="button" class="remove-line">&times;</button>`;
    row.querySelector(".remove-line").addEventListener("click", ()=> row.remove());
    medLines.appendChild(row);
  }
  addLine();
  document.getElementById("addMedLine").addEventListener("click", addLine);
  document.getElementById("rxCancel").addEventListener("click", closeModal);
  document.getElementById("rxForm").addEventListener("submit", async e=>{
    e.preventDefault();
    const medicines = Array.from(medLines.querySelectorAll(".med-line")).map(row=>({
      name: row.querySelector(".med-name").value.trim(),
      dosage: row.querySelector(".med-dosage").value.trim(),
      instructions: row.querySelector(".med-instr").value.trim()
    })).filter(m=>m.name);
    if(medicines.length===0){ alert("Add at least one medicine."); return; }
    try{
      await Api.createPrescription({
        appointmentId, patientId,
        diagnosis: document.getElementById("rxDiagnosis").value.trim(),
        medicines,
        notes: document.getElementById("rxNotes").value.trim()
      });
      closeModal();
      if(currentTab==="appointments") renderAppointments(); else renderPrescriptions();
    }catch(err){ alert(err.message); }
  });
}

/* ================= BILLING ================= */
async function renderBilling(){
  const main = document.getElementById("main");
  const invoices = await Api.listInvoices();
  const canCreate = ["admin","receptionist"].includes(state.user.role);
  const canPay = canCreate;
  main.innerHTML = `
    <div class="section-head">
      <h1>Billing</h1><span class="meta">${invoices.length} invoices</span>
      ${canCreate ? `<div class="actions"><button class="btn primary" id="newInvoiceBtn">+ Create invoice</button></div>` : ""}
    </div>
    ${invoices.length===0 ? emptyState("No invoices yet","") : invoices.map(inv=>`
      <div class="record-card record-row">
        <div>
          <div class="record-title">${escapeHtml(inv.patientName)} — ${money(inv.total)}</div>
          <div class="record-sub">${niceDate(inv.createdAt?.slice(0,10))} · ${(inv.items||[]).map(i=>escapeHtml(i.label)).join(", ")}</div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="badge ${inv.status}">${inv.status}</span>
          ${canPay && inv.status==="pending" ? `<button class="btn ghost" data-pay="${inv.id}">Mark paid</button>` : ""}
        </div>
      </div>
    `).join("")}
  `;
  if(canCreate) document.getElementById("newInvoiceBtn").addEventListener("click", openInvoiceModal);
  main.querySelectorAll("[data-pay]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      try{ await Api.payInvoice(btn.dataset.pay); renderBilling(); }
      catch(err){ alert(err.message); }
    });
  });
}

async function openInvoiceModal(){
  const patients = await Api.listPatients();
  openModal("Create invoice", `
    <form id="invForm">
      <label class="full">Patient
        <select id="ivPatient" required>${patients.map(p=>`<option value="${p.id}">${escapeHtml(p.name)} — ${escapeHtml(p.email)}</option>`).join("")}</select>
      </label>
      <div id="itemLines"></div>
      <button type="button" class="link-btn" id="addItemLine">+ Add line item</button>
      <div class="record-sub" style="margin-top:10px;">Total: <strong id="ivTotal">₹0.00</strong></div>
      <div class="modal-actions">
        <div class="spacer"></div>
        <button type="button" class="btn ghost" id="ivCancel">Cancel</button>
        <button type="submit" class="btn primary">Create invoice</button>
      </div>
    </form>
  `);
  const itemLines = document.getElementById("itemLines");
  const totalEl = document.getElementById("ivTotal");
  function recalc(){
    const total = Array.from(itemLines.querySelectorAll(".med-line")).reduce((sum,row)=>{
      return sum + (Number(row.querySelector(".item-amount").value)||0);
    },0);
    totalEl.textContent = money(total);
  }
  function addLine(){
    const row = document.createElement("div");
    row.className = "med-line";
    row.innerHTML = `
      <input placeholder="Description" class="item-label">
      <input placeholder="Amount" type="number" min="0" step="0.01" class="item-amount">
      <button type="button" class="remove-line">&times;</button>`;
    row.querySelector(".remove-line").addEventListener("click", ()=>{ row.remove(); recalc(); });
    row.querySelector(".item-amount").addEventListener("input", recalc);
    itemLines.appendChild(row);
  }
  addLine();
  document.getElementById("addItemLine").addEventListener("click", addLine);
  document.getElementById("ivCancel").addEventListener("click", closeModal);
  document.getElementById("invForm").addEventListener("submit", async e=>{
    e.preventDefault();
    const items = Array.from(itemLines.querySelectorAll(".med-line")).map(row=>({
      label: row.querySelector(".item-label").value.trim(),
      amount: Number(row.querySelector(".item-amount").value)||0
    })).filter(i=>i.label && i.amount>0);
    if(items.length===0){ alert("Add at least one line item with an amount."); return; }
    try{
      await Api.createInvoice({ patientId: document.getElementById("ivPatient").value, items });
      closeModal();
      renderBilling();
    }catch(err){ alert(err.message); }
  });
}

/* ---------- Renderer registry ---------- */
const RENDERERS = {
  dashboard: renderDashboard,
  departments: renderDepartments,
  staff: renderStaff,
  doctors: renderDoctorsDirectory,
  patients: renderPatients,
  appointments: renderAppointments,
  book: renderBook,
  prescriptions: renderPrescriptions,
  billing: renderBilling
};

/* ---------- Modal helpers ---------- */
function openModal(title, bodyHtml){
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").innerHTML = bodyHtml;
  document.getElementById("modalBackdrop").classList.add("open");
}
function closeModal(){ document.getElementById("modalBackdrop").classList.remove("open"); }
document.getElementById("modalClose").addEventListener("click", closeModal);

/* ---------- Auth flow ---------- */
let authMode = "login";

function initAuthScreenValues(){ document.getElementById("apiBaseInput").value = getApiBase(); }

document.getElementById("apiBaseSave").addEventListener("click", ()=>{
  const val = document.getElementById("apiBaseInput").value.trim();
  if(val) setApiBase(val);
  alert("Backend URL saved.");
});

document.getElementById("authToggle").addEventListener("click", ()=>{
  authMode = authMode === "login" ? "signup" : "login";
  document.getElementById("authTitle").textContent = authMode==="login" ? "Log in" : "Create a patient account";
  document.getElementById("authNameField").style.display = authMode==="signup" ? "flex" : "none";
  document.getElementById("patientExtraFields").style.display = authMode==="signup" ? "block" : "none";
  document.getElementById("authSubmit").textContent = authMode==="login" ? "Log in" : "Sign up";
  document.getElementById("authToggleText").textContent = authMode==="login" ? "New patient?" : "Already have an account?";
  document.getElementById("authToggle").textContent = authMode==="login" ? "Create a patient account" : "Log in";
  document.getElementById("authError").textContent = "";
});

document.getElementById("authForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  const errEl = document.getElementById("authError");
  errEl.textContent = "";
  const submitBtn = document.getElementById("authSubmit");
  submitBtn.disabled = true;
  try{
    let result;
    if(authMode==="login"){
      result = await Api.login(email, password);
    } else {
      result = await Api.signup({
        email, password,
        name: document.getElementById("authName").value.trim(),
        phone: document.getElementById("authPhone").value.trim(),
        dateOfBirth: document.getElementById("authDob").value || null,
        gender: document.getElementById("authGender").value || null,
        bloodGroup: document.getElementById("authBlood").value.trim(),
        address: document.getElementById("authAddress").value.trim()
      });
    }
    setAuthToken(result.token);
    await bootApp();
  }catch(err){
    errEl.textContent = err.message || "Something went wrong.";
  }finally{
    submitBtn.disabled = false;
  }
});

document.getElementById("logoutBtn").addEventListener("click", ()=>{
  clearAuthToken();
  document.getElementById("app").style.display = "none";
  document.getElementById("authScreen").style.display = "flex";
  document.getElementById("authForm").reset();
});

async function bootApp(){
  try{
    const { user } = await Api.me();
    state.user = user;
    renderNav();
    document.getElementById("authScreen").style.display = "none";
    document.getElementById("app").style.display = "block";
    const firstTab = (TABS_BY_ROLE[user.role]||[])[0]?.key;
    if(firstTab) switchTab(firstTab);
  }catch(err){
    console.error("Boot failed:", err);
    clearAuthToken();
    document.getElementById("authScreen").style.display = "flex";
    document.getElementById("app").style.display = "none";
    document.getElementById("authError").textContent = "Your session expired — please log in again.";
  }
}

/* ---------- Init ---------- */
initAuthScreenValues();
if(getAuthToken()) bootApp();
