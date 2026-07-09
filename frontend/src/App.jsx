import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
} from "recharts";
import { uploadTransactions, getDashboard, getTransactions } from "./lib/api";
import "./styles.css";

function money(value) {
  return Number(value || 0).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
}

function KpiCard({ label, value, note }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="kpi">{value}</div>
      {note && <div className="note">{note}</div>}
    </div>
  );
}

function App() {
  const [dashboard, setDashboard] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [message, setMessage] = useState("");

  async function refresh() {
    const d = await getDashboard();
    const t = await getTransactions();
    setDashboard(d);
    setTransactions(t);
  }

  async function handleUpload(e) {
    try {
      setMessage("Importing transactions...");
      await uploadTransactions(e.target.files);
      await refresh();
      setMessage("Import complete.");
    } catch (err) {
      setMessage(String(err));
    }
  }

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  const kpis = dashboard?.kpis || {};
  const adu = dashboard?.adu || {};
  const categories = dashboard?.category_spending || [];

  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">Household CFO System</p>
          <h1>Financial Command Center</h1>
          <p>
            Cash flow, spending, ADU investment tracking, and category insights
            in one local-first dashboard.
          </p>
        </div>

        <label className="upload">
          Upload Amex + AFCU CSVs
          <input type="file" multiple accept=".csv" onChange={handleUpload} />
        </label>
      </header>

      {message && <div className="notice">{message}</div>}

      <section className="grid kpis">
        <KpiCard label="Total Income" value={money(kpis.total_income)} />
        <KpiCard label="Total Spending" value={money(kpis.total_spending)} />
        <KpiCard label="Net Cash Flow" value={money(kpis.net_cash_flow)} />
        <KpiCard label="Savings Rate" value={`${kpis.savings_rate || 0}%`} />
        <KpiCard
          label="Financial Health"
          value={`${dashboard?.financial_health_score || 0}/100`}
        />
      </section>

      <section className="dashboard-layout">
        <div className="panel large">
          <h2>Spending by Major Category</h2>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={categories}>
              <XAxis dataKey="category" />
              <YAxis />
              <Tooltip formatter={(v) => money(v)} />
              <Bar dataKey="total" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="panel">
          <h2>Category Share</h2>
          <ResponsiveContainer width="100%" height={340}>
            <PieChart>
              <Pie
                data={categories}
                dataKey="total"
                nameKey="category"
                outerRadius={120}
                label
              />
              <Tooltip formatter={(v) => money(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="dashboard-layout">
        <div className="panel">
          <h2>ADU Investment Tracker</h2>

          <div className="mini-grid">
            <KpiCard label="Budget" value={money(adu.budget)} />
            <KpiCard label="Tracked Spend" value={money(adu.estimated_spend_tracked)} />
            <KpiCard label="Remaining" value={money(adu.remaining_budget)} />
            <KpiCard label="Expected Rent" value={`${money(adu.expected_monthly_rent)}/mo`} />
          </div>

          <div className="progress-wrap">
            <div className="progress-label">
              ADU Completion: {adu.completion_percent || 0}%
            </div>
            <div className="progress">
              <div
                style={{
                  width: `${Math.min(adu.completion_percent || 0, 100)}%`,
                }}
              />
            </div>
          </div>

          <p className="note">
            Expected rental income start: {adu.expected_rent_start || "September 2026"}
          </p>
        </div>

        <div className="panel">
          <h2>Category Detail</h2>
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Total</th>
                <th>Average</th>
                <th>Txns</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((row) => (
                <tr key={row.category}>
                  <td>{row.category}</td>
                  <td>{money(row.total)}</td>
                  <td>{money(row.average)}</td>
                  <td>{row.transactions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Recent Transactions</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Amount</th>
              <th>Category</th>
              <th>Subcategory</th>
            </tr>
          </thead>
          <tbody>
            {transactions.slice(0, 40).map((t, index) => (
              <tr key={index}>
                <td>{t.date}</td>
                <td>{t.description}</td>
                <td>{money(t.amount)}</td>
                <td>{t.major_category}</td>
                <td>{t.subcategory}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);