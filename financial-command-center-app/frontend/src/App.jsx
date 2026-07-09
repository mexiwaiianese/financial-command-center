import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie } from "recharts";
import { uploadTransactions, getDashboard, getTransactions } from "./lib/api";
import "./styles.css";

function fmt(v){ return Number(v||0).toLocaleString(undefined,{style:"currency",currency:"USD"}); }
function KpiCard({label, value}){ return <div className="card"><div className="label">{label}</div><div className="kpi">{value}</div></div>; }

function App(){
  const [dashboard,setDashboard]=useState(null); const [transactions,setTransactions]=useState([]); const [message,setMessage]=useState("");
  async function refresh(){ setDashboard(await getDashboard()); setTransactions(await getTransactions()); }
  async function handleUpload(e){ try{ setMessage("Importing..."); await uploadTransactions(e.target.files); await refresh(); setMessage("Import complete."); }catch(err){ setMessage(String(err)); } }
  useEffect(()=>{ refresh().catch(()=>{}); },[]);
  const k=dashboard?.kpis||{}; const adu=dashboard?.adu||{}; const categoryData=dashboard?.category_spending||[];
  return <main>
    <header><div><h1>Financial Command Center</h1><p>Household CFO dashboard for cash flow, spending, debt, and ADU tracking.</p></div><label className="upload">Upload CSVs<input type="file" multiple accept=".csv" onChange={handleUpload}/></label></header>
    {message && <div className="notice">{message}</div>}
    <section className="grid kpis"><KpiCard label="Total Income" value={fmt(k.total_income)}/><KpiCard label="Total Spending" value={fmt(k.total_spending)}/><KpiCard label="Net Cash Flow" value={fmt(k.net_cash_flow)}/><KpiCard label="Savings Rate" value={`${k.savings_rate||0}%`}/><KpiCard label="Health Score" value={`${dashboard?.financial_health_score||0}/100`}/></section>
    <section className="two-col"><div className="panel"><h2>Spending by Category</h2><ResponsiveContainer width="100%" height={320}><BarChart data={categoryData}><XAxis dataKey="category" hide/><YAxis/><Tooltip formatter={(v)=>fmt(v)}/><Bar dataKey="total"/></BarChart></ResponsiveContainer></div><div className="panel"><h2>Category Share</h2><ResponsiveContainer width="100%" height={320}><PieChart><Pie data={categoryData} dataKey="total" nameKey="category" outerRadius={110} label/><Tooltip formatter={(v)=>fmt(v)}/></PieChart></ResponsiveContainer></div></section>
    <section className="two-col"><div className="panel"><h2>ADU Investment Tracker</h2><div className="adu-grid"><KpiCard label="Budget" value={fmt(adu.budget)}/><KpiCard label="Tracked Spend" value={fmt(adu.estimated_spend_tracked)}/><KpiCard label="Remaining" value={fmt(adu.remaining_budget)}/><KpiCard label="Expected Rent" value={`${fmt(adu.expected_monthly_rent)}/mo`}/></div><div className="progress-wrap"><div className="progress-label">Completion: {adu.completion_percent||0}%</div><div className="progress"><div style={{width:`${Math.min(adu.completion_percent||0,100)}%`}} /></div></div><p>Expected rental income start: {adu.expected_rent_start||"September 2026"}</p></div><div className="panel"><h2>Category Detail</h2><table><thead><tr><th>Category</th><th>Total</th><th>Avg</th><th>Txns</th></tr></thead><tbody>{categoryData.map(r=><tr key={r.category}><td>{r.category}</td><td>{fmt(r.total)}</td><td>{fmt(r.average)}</td><td>{r.transactions}</td></tr>)}</tbody></table></div></section>
    <section className="panel"><h2>Recent Transactions</h2><table><thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Category</th><th>Subcategory</th></tr></thead><tbody>{transactions.slice(0,30).map((t,i)=><tr key={i}><td>{t.date}</td><td>{t.description}</td><td>{fmt(t.amount)}</td><td>{t.major_category}</td><td>{t.subcategory}</td></tr>)}</tbody></table></section>
  </main>;
}
createRoot(document.getElementById("root")).render(<App/>);
