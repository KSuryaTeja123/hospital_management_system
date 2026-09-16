const API_BASE_KEY = "hospitalMgmt.apiBase";
const AUTH_TOKEN_KEY = "hospitalMgmt.authToken";

function getApiBase(){ return localStorage.getItem(API_BASE_KEY) || "http://localhost:4001/api"; }
function setApiBase(url){ localStorage.setItem(API_BASE_KEY, url.replace(/\/+$/,"")); }
function getAuthToken(){ return localStorage.getItem(AUTH_TOKEN_KEY); }
function setAuthToken(t){ localStorage.setItem(AUTH_TOKEN_KEY, t); }
function clearAuthToken(){ localStorage.removeItem(AUTH_TOKEN_KEY); }

async function apiRequest(path, { method="GET", body, auth=true } = {}){
  const headers = { "Content-Type":"application/json" };
  if(auth){ const t = getAuthToken(); if(t) headers["Authorization"] = `Bearer ${t}`; }
  const resp = await fetch(`${getApiBase()}${path}`, { method, headers, body: body?JSON.stringify(body):undefined });
  if(resp.status === 204) return null;
  let data = null; try{ data = await resp.json(); }catch(e){}
  if(!resp.ok){ const err = new Error(data?.error || `Request failed (${resp.status})`); err.status = resp.status; throw err; }
  return data;
}

const Api = {
  signup: (payload) => apiRequest("/auth/signup", { method:"POST", body:payload, auth:false }),
  login: (email, password) => apiRequest("/auth/login", { method:"POST", body:{email,password}, auth:false }),
  me: () => apiRequest("/auth/me"),

  listDepartments: () => apiRequest("/departments"),
  createDepartment: (d) => apiRequest("/departments", { method:"POST", body:d }),
  deleteDepartment: (id) => apiRequest(`/departments/${id}`, { method:"DELETE" }),

  listStaff: (role) => apiRequest(`/staff${role ? `?role=${role}`:""}`),
  createStaff: (payload) => apiRequest("/staff", { method:"POST", body:payload }),
  deleteStaff: (id) => apiRequest(`/staff/${id}`, { method:"DELETE" }),

  listDoctors: (departmentId) => apiRequest(`/doctors${departmentId ? `?departmentId=${departmentId}`:""}`),

  listPatients: () => apiRequest("/patients"),
  getPatient: (id) => apiRequest(`/patients/${id}`),
  createPatient: (payload) => apiRequest("/patients", { method:"POST", body:payload }),
  updatePatient: (id, payload) => apiRequest(`/patients/${id}`, { method:"PUT", body:payload }),

  listAppointments: (params={}) => {
    const qs = new URLSearchParams(params).toString();
    return apiRequest(`/appointments${qs ? `?${qs}`:""}`);
  },
  createAppointment: (payload) => apiRequest("/appointments", { method:"POST", body:payload }),
  updateAppointmentStatus: (id, status) => apiRequest(`/appointments/${id}/status`, { method:"PUT", body:{status} }),
  rescheduleAppointment: (id, payload) => apiRequest(`/appointments/${id}`, { method:"PUT", body:payload }),

  listPrescriptions: (patientId) => apiRequest(`/prescriptions${patientId ? `?patientId=${patientId}`:""}`),
  createPrescription: (payload) => apiRequest("/prescriptions", { method:"POST", body:payload }),

  listInvoices: (patientId) => apiRequest(`/invoices${patientId ? `?patientId=${patientId}`:""}`),
  createInvoice: (payload) => apiRequest("/invoices", { method:"POST", body:payload }),
  payInvoice: (id) => apiRequest(`/invoices/${id}/pay`, { method:"PUT" }),

  dashboardStats: () => apiRequest("/dashboard/stats")
};
