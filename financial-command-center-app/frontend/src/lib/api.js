const API_BASE = "http://localhost:8000";
export async function uploadTransactions(files) {
  const form = new FormData();
  Array.from(files).forEach(file => form.append("files", file));
  const res = await fetch(`${API_BASE}/api/import`, { method: "POST", body: form });
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
