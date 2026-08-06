const API_BASE = "http://localhost:8000";
export async function uploadTransactions(files) {
  const form = new FormData();
  Array.from(files).forEach(file => form.append("files", file));
  const res = await fetch(`${API_BASE}/api/import`, { method: "POST", body: form });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function uploadBudget(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/budget`, { method: "POST", body: form });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function getBudgetAnalysis() {
  const res = await fetch(`${API_BASE}/api/budget-analysis`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function getDashboard() {
  const res = await fetch(`${API_BASE}/api/dashboard`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function getTransactions() {
  const res = await fetch(`${API_BASE}/api/transactions`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function updateTransactionCategory(transactionId, category, parentCategory, classification = "") {
  const res = await fetch(`${API_BASE}/api/transactions/${transactionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category, parent_category: parentCategory, classification }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function resetSession() {
  const res = await fetch(`${API_BASE}/api/session`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function uploadReceipt(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/receipts`, { method: "POST", body: form });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function applyCategoryRule(prompt) {
  const res = await fetch(`${API_BASE}/api/category-rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function getProjects() {
  const res = await fetch(`${API_BASE}/api/projects`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function createProject(project) {
  const res = await fetch(`${API_BASE}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function assignTransactionProject(transactionId, projectId) {
  const res = await fetch(`${API_BASE}/api/transactions/${transactionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function getPlanning() {
  const res = await fetch(`${API_BASE}/api/planning`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function createAsset(asset) {
  const res = await fetch(`${API_BASE}/api/assets`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(asset) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function createGoal(goal) {
  const res = await fetch(`${API_BASE}/api/goals`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(goal) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function addProjectAccount(projectId, account) {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/accounts`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(account) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function exportProject(projectId) {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/export`);
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href=url; link.download=`fcc-project-${projectId}.json`; link.click(); URL.revokeObjectURL(url);
}
export async function downloadBackup() {
  const res = await fetch(`${API_BASE}/api/backup`);
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") || "";
  const filename = disposition.match(/filename="?([^";]+)"?/)?.[1] || "fcc-backup.json";
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
export async function restoreBackup(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/restore`, { method: "POST", body: form });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function getTellerStatus() {
  const res = await fetch(`${API_BASE}/api/teller/status`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function registerTellerEnrollment(enrollment) {
  const res = await fetch(`${API_BASE}/api/teller/enrollments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      enrollment_id: enrollment.enrollment.id,
      institution_name: enrollment.enrollment.institution.name,
      access_token: enrollment.accessToken,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function syncTellerNow() {
  const res = await fetch(`${API_BASE}/api/teller/sync`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
