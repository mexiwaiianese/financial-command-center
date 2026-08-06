import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { AlertTriangle, CheckCircle2, Download, FileJson, FileSpreadsheet, Landmark, RefreshCw, RotateCcw, Sparkles, Upload } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { addProjectAccount, applyCategoryRule, assignTransactionProject, createAsset, createGoal, createProject, downloadBackup, exportProject, getBudgetAnalysis, getDashboard, getPlanning, getProjects, getTellerStatus, getTransactions, registerTellerEnrollment, resetSession, restoreBackup, syncTellerNow, updateTransactionCategory, uploadBudget, uploadReceipt, uploadTransactions } from "./lib/api";
import "./styles.css";

function money(value) {
  return Number(value || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function transactionSpendImpact(transaction) {
  if (transaction.spending_amount != null) return transaction.spending_amount;
  const amount = Number(transaction.amount || 0);
  return transaction.source_kind === "credit_card" || transaction.source_account === "AMEX" ? amount : -amount;
}

function KpiCard({ label, value, note, tone = "" }) {
  return <div className={`card ${tone}`}><div className="label">{label}</div><div className="kpi">{value}</div>{note && <div className="note">{note}</div>}</div>;
}

function App() {
  const [dashboard, setDashboard] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [statementFiles, setStatementFiles] = useState([]);
  const [budgetFile, setBudgetFile] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [tellerStatus, setTellerStatus] = useState(null);
  const [drilldown, setDrilldown] = useState(null);
  const [reviewIds, setReviewIds] = useState([]);
  const [rulePrompt, setRulePrompt] = useState("");
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("adu");
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [rowLimit, setRowLimit] = useState(50);
  const [quickFilter, setQuickFilter] = useState("all");
  const [planning, setPlanning] = useState({assets:[],goals:[],history:[],projection:[],recommendations:[]});
  const [planningTab, setPlanningTab] = useState("path");

  async function refresh() {
    const [nextDashboard, nextTransactions, nextAnalysis, nextTellerStatus, nextProjects, nextPlanning] = await Promise.all([getDashboard(), getTransactions(), getBudgetAnalysis(), getTellerStatus(), getProjects(), getPlanning()]);
    setDashboard(nextDashboard);
    setTransactions(nextTransactions);
    setAnalysis(nextAnalysis);
    setTellerStatus(nextTellerStatus);
    setProjects(nextProjects);
    setPlanning(nextPlanning);
  }

  function connectBank() {
    const applicationId = import.meta.env.VITE_TELLER_APPLICATION_ID;
    if (!applicationId || !window.TellerConnect) {
      setMessage("Add your Teller application ID to frontend/.env.local, then restart FCC to connect a bank.");
      return;
    }
    const teller = window.TellerConnect.setup({
      applicationId,
      environment: import.meta.env.VITE_TELLER_ENVIRONMENT || "development",
      products: ["transactions"],
      onSuccess: async (enrollment) => {
        try {
          setBusy(true);
          await registerTellerEnrollment(enrollment);
          await refresh();
          setMessage("Bank connected securely. The access token is stored in macOS Keychain.");
        } catch (error) {
          setMessage(`Connection save failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
          setBusy(false);
        }
      },
      onExit: () => {},
    });
    teller.open();
  }

  async function syncBankNow() {
    try {
      setBusy(true);
      setMessage("Syncing connected bank transactions…");
      const result = await syncTellerNow();
      await refresh();
      await downloadBackup();
      setMessage(`Bank sync complete: ${result.synced_transactions} transactions processed. A backup was downloaded.`);
    } catch (error) {
      setMessage(`Bank sync failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function analyze(startFresh = false) {
    if (!statementFiles.length && !budgetFile) {
      setMessage("Choose statement files, a budget file, or both before running a new analysis.");
      return;
    }
    try {
      setBusy(true);
      if (startFresh) await resetSession();
      setMessage("Importing files and comparing spending against your budget…");
      if (budgetFile) await uploadBudget(budgetFile);
      const transactionResult = statementFiles.length
        ? await uploadTransactions(statementFiles)
        : null;
      await refresh();
      await downloadBackup();
      const reconciliation = transactionResult?.reconciliation;
      const reconciliationSummary = reconciliation
        ? ` ${reconciliation.matched_pairs} card-payment pairs matched; ${reconciliation.excluded_payment_transactions} payment entries excluded from spending; ${reconciliation.unmatched_payments} unmatched payments flagged for review.`
        : "";
      setMessage(`Analysis complete.${reconciliationSummary} A restorable FCC backup was downloaded automatically.`);
    } catch (error) {
      setMessage(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setBusy(true);
      setMessage("Restoring your FCC session…");
      const result = await restoreBackup(file);
      await refresh();
      setMessage(`Session restored: ${result.restored_transactions} transactions and ${result.restored_budget_categories} budget categories.`);
    } catch (error) {
      setMessage(`Restore failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      event.target.value = "";
      setBusy(false);
    }
  }

  async function startOver() {
    if (!window.confirm("Clear the current transactions, budget, and analysis? This cannot be undone unless you downloaded a backup.")) return;
    try {
      setBusy(true);
      await resetSession();
      setStatementFiles([]);
      setBudgetFile(null);
      setDrilldown(null);
      await refresh();
      setMessage("Analysis reset. Upload statements and a budget to start over.");
    } catch (error) {
      setMessage(`Reset failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function assignCategory(transaction, category, classification = "") {
    const budgetRow = (analysis?.budget || []).find((row) => row.category === category);
    try {
      setBusy(true);
      const result = await updateTransactionCategory(transaction.id, category, budgetRow?.parent_category || "", classification);
      await refresh();
      setReviewIds(result.review_candidate_ids || []);
      if (result.review_candidate_ids?.length) {
        openDrilldown("ids", result.review_candidate_ids, `Verify ${result.review_candidate_ids.length} similar transactions`);
      }
      setMessage(`Updated ${result.auto_assigned_ids?.length || 1} matching transactions to ${category || "Automatic / unassigned"}. ${result.review_candidate_ids?.length || 0} fuzzy matches need verification.`);
    } catch (error) {
      setMessage(`Category update failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleReceipt(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setBusy(true);
      setMessage("Reading receipt and matching it to imported transactions…");
      const result = await uploadReceipt(file);
      await refresh();
      if (result.matched_transaction_id) {
        setReviewIds([result.matched_transaction_id]);
        openDrilldown("transaction", result.matched_transaction_id, `Receipt: ${result.merchant}`);
      } else if (result.match_candidates?.length) {
        const ids = result.match_candidates.map((row) => row.transaction_id);
        setReviewIds(ids);
        openDrilldown("ids", ids, `Verify receipt match: ${result.merchant}`);
      }
      setMessage(`Receipt analyzed: ${result.merchant}${result.total != null ? `, ${money(result.total)}` : ""}. Suggested category: ${result.suggested_category || "Needs review"}.`);
    } catch (error) {
      setMessage(`Receipt analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      event.target.value = "";
      setBusy(false);
    }
  }

  async function handleCategoryRule(event) {
    event.preventDefault();
    if (!rulePrompt.trim()) return;
    try {
      setBusy(true);
      const result = await applyCategoryRule(rulePrompt);
      await refresh();
      const ids = result.matched_transaction_ids || [];
      setReviewIds(ids);
      if (ids.length) openDrilldown("ids", ids, `${result.rule.merchant} → ${result.rule.category}`);
      setMessage(`Rule applied: descriptions containing “${result.rule.merchant}” → ${result.rule.category} under ${result.rule.parent_category || "Other"}. ${ids.length} transactions updated.`);
      setRulePrompt("");
    } catch (error) {
      setMessage(`Category rule failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateProject(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      setBusy(true);
      const project = await createProject({
        name: form.get("name"),
        target_budget: form.get("target_budget"),
        projected_revenue: form.get("projected_revenue"),
        actual_revenue: form.get("actual_revenue"),
      });
      await refresh();
      setSelectedProjectId(project.id);
      setShowProjectForm(false);
      setMessage(`Project created: ${project.name}.`);
    } catch (error) {
      setMessage(`Project creation failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleProjectAssignment(transaction, projectId) {
    try {
      setBusy(true);
      await assignTransactionProject(transaction.id, projectId);
      await refresh();
      setMessage(projectId ? `Assigned transaction to ${projects.find((project)=>project.id===projectId)?.name || "project"}.` : "Removed transaction from project.");
    } catch (error) {
      setMessage(`Project assignment failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleAsset(event) {
    event.preventDefault(); const form=new FormData(event.currentTarget);
    try { setBusy(true); await createAsset(Object.fromEntries(form)); event.currentTarget.reset(); await refresh(); setMessage("Portfolio item added."); }
    catch(error){setMessage(`Portfolio update failed: ${error.message}`)} finally{setBusy(false)}
  }

  async function handleGoal(event) {
    event.preventDefault(); const form=new FormData(event.currentTarget);
    try { setBusy(true); await createGoal(Object.fromEntries(form)); event.currentTarget.reset(); await refresh(); setMessage("Goal added and projected."); }
    catch(error){setMessage(`Goal creation failed: ${error.message}`)} finally{setBusy(false)}
  }

  async function handleProjectAccount(event) {
    event.preventDefault(); if(!selectedProject)return; const form=new FormData(event.currentTarget);
    try { setBusy(true); await addProjectAccount(selectedProject.id,Object.fromEntries(form)); event.currentTarget.reset(); await refresh(); setMessage("Project account added."); }
    catch(error){setMessage(`Account creation failed: ${error.message}`)} finally{setBusy(false)}
  }

  useEffect(() => { refresh().catch(() => {}); }, []);

  const kpis = dashboard?.kpis || {};
  const summary = analysis?.summary || {};
  const coverage = analysis?.coverage || {};
  const categories = analysis?.categories || [];
  const exceptions = categories.filter((row) => row.status !== "on_track");
  const outliers = analysis?.outliers || [];
  const outlierIds = new Set(outliers.map((row) => row.transaction_id));
  const outlierCategories = new Set(outliers.map((row) => row.category));
  const trends = analysis?.trends || [];
  const savingsOpportunities = analysis?.savings_opportunities || [];
  const budgetGroups = (analysis?.budget || []).reduce((groups, row) => {
    const parent = row.parent_category || "Other";
    if (!groups[parent]) groups[parent] = [];
    groups[parent].push(row);
    return groups;
  }, {});
  const drilldownTransactions = transactions.filter((transaction) => {
    if (!drilldown) return true;
    if (drilldown.type === "month") return transaction.date?.startsWith(drilldown.value);
    if (drilldown.type === "category") return (transaction.budget_category || transaction.major_category) === drilldown.value;
    if (drilldown.type === "source") return transaction.source_account === drilldown.value;
    if (drilldown.type === "outlier") return outlierIds.has(transaction.id);
    if (drilldown.type === "transaction") return transaction.id === drilldown.value;
    if (drilldown.type === "ids") return drilldown.value.includes(transaction.id);
    if (drilldown.type === "attention") {
      return outlierIds.has(transaction.id) || drilldown.value.includes(transaction.budget_category || transaction.major_category);
    }
    if (drilldown.type === "classification") {
      if (drilldown.value === "transfer") return transaction.is_transfer;
      if (drilldown.value === "income") return transaction.is_income;
      return transaction.is_spending && !transaction.is_transfer && !transaction.is_income;
    }
    return true;
  });
  const unbudgetedCategories = new Set(categories.filter((row)=>row.status === "unbudgeted").map((row)=>row.category));
  const filteredTransactions = drilldownTransactions.filter((transaction) => {
    if (quickFilter === "uncategorized") return !transaction.budget_category && transaction.is_spending && !transaction.is_transfer && !transaction.is_income;
    if (quickFilter === "unbudgeted") return unbudgetedCategories.has(transaction.budget_category || transaction.major_category);
    if (quickFilter === "outliers") return outlierIds.has(transaction.id);
    if (quickFilter === "receipts") return Boolean(transaction.receipt_filename);
    if (quickFilter === "projects") return Boolean(transaction.project_id);
    return true;
  });
  const visibleTransactions = rowLimit === "all" ? filteredTransactions : filteredTransactions.slice(0, Number(rowLimit));
  const selectedProject = projects.find((project) => project.id === selectedProjectId) || projects[0];
  const openDrilldown = (type, value, label) => {
    setDrilldown({ type, value, label });
    window.setTimeout(() => document.querySelector(".table-panel:last-of-type")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  return <main className={reviewIds.length ? "review-mode" : ""}>
    <header className="hero">
      <div><p className="eyebrow">Household CFO System</p><h1>Financial Command Center</h1><p>Upload twelve months of statements and your current budget to find recurring overspending, recent spikes, and expenses with no budget baseline.</p></div>
    </header>

    <section className="import-panel">
      <div className="import-heading"><div><p className="eyebrow dark">Budget variance analysis</p><h2>Compare actual spending with your plan</h2></div><span className="local-badge">Local processing</span></div>
      <div className="upload-grid">
        <label className="drop-zone"><Upload size={24}/><strong>1. Upload statements</strong><span>Choose all CSV or Excel exports covering the past 12 months.</span><input type="file" multiple accept=".csv,.xlsx,.xls" onChange={(event)=>setStatementFiles(Array.from(event.target.files || []))}/><em>{statementFiles.length ? `${statementFiles.length} file${statementFiles.length === 1 ? "" : "s"} selected` : "No files selected"}</em></label>
        <label className="drop-zone"><FileSpreadsheet size={24}/><strong>2. Upload current budget</strong><span>Use Category and Monthly Budget columns in CSV or Excel.</span><input type="file" accept=".csv,.xlsx,.xls" onChange={(event)=>setBudgetFile(event.target.files?.[0] || null)}/><em>{budgetFile?.name || "No file selected"}</em></label>
      </div>
      <div className="receipt-upload"><label><FileSpreadsheet size={17}/> Analyze Receipt<input type="file" accept="image/*,.txt,text/plain" onChange={handleReceipt}/></label><span>Matches merchant, date, and total; line items refine ambiguous retail categories.</span></div>
      <form className="ai-rule" onSubmit={handleCategoryRule}><Sparkles size={18}/><input value={rulePrompt} onChange={(event)=>setRulePrompt(event.target.value)} placeholder="avanti = clothing" aria-label="Natural-language category rule"/><button disabled={busy || !rulePrompt.trim()} type="submit">Apply Rule</button></form>
      <div className="analysis-actions"><button className="analyze-button" disabled={busy} onClick={()=>analyze(false)}>{busy ? "Analyzing…" : transactions.length ? "Add Files & Reanalyze" : "Analyze Spending"}</button><button className="new-analysis-button" disabled={busy || (!statementFiles.length && !budgetFile)} onClick={()=>analyze(true)}><RefreshCw size={17}/> New Analysis</button></div>
      <div className="backup-actions">
        <label className="restore-button"><FileJson size={17}/> Restore FCC Backup<input type="file" accept=".json,application/json" onChange={handleRestore}/></label>
        <button className="backup-button" disabled={busy || (!transactions.length && !categories.length)} onClick={()=>downloadBackup().catch((error)=>setMessage(`Backup failed: ${error.message}`))}><Download size={17}/> Download Backup Now</button>
        <button className="reset-button" disabled={busy || (!transactions.length && !categories.length)} onClick={startOver}><RotateCcw size={17}/> Start Over</button>
        <span>Backups contain normalized session data and your budget baseline.</span>
      </div>
      {message && <div className="notice">{message}</div>}
    </section>

    <section className="bank-panel">
      <div className="bank-icon"><Landmark size={24}/></div>
      <div className="bank-copy"><p className="eyebrow dark">Automatic bank sync</p><h2>Teller connections</h2><p>FCC checks on startup and downloads transactions the first time it runs on any Saturday or Sunday in America/Denver.</p><div className="bank-meta"><span>{tellerStatus?.connected_institutions?.length || 0} connected</span><span>Last sync: {tellerStatus?.last_successful_sync ? new Date(tellerStatus.last_successful_sync).toLocaleString() : "Never"}</span>{tellerStatus?.last_sync_error && <span className="sync-error">Last error: {tellerStatus.last_sync_error}</span>}</div></div>
      <div className="bank-actions"><button onClick={connectBank} disabled={busy}><Landmark size={16}/> Connect Bank</button><button onClick={syncBankNow} disabled={busy || !tellerStatus?.connected_institutions?.length}><RefreshCw size={16}/> Sync Now</button></div>
    </section>

    <section className="projects-panel">
      <div className="projects-toolbar"><div><p className="eyebrow dark">Projects & investments</p><h2>{selectedProject?.name || "No projects"}</h2></div><div className="project-controls"><select value={selectedProjectId} onChange={(event)=>setSelectedProjectId(event.target.value)}>{projects.map((project)=><option value={project.id} key={project.id}>{project.name}</option>)}</select><button onClick={()=>setShowProjectForm((value)=>!value)}>{showProjectForm ? "Cancel" : "New Project"}</button></div></div>
      {selectedProject && <div className="project-metrics"><div><span>Invested</span><strong>{money(selectedProject.invested)}</strong></div><div><span>Projected revenue</span><strong>{money(selectedProject.projected_revenue)}</strong></div><div><span>Projected ROI</span><strong>{selectedProject.projected_roi_percent == null ? "—" : `${selectedProject.projected_roi_percent}%`}</strong></div><div><span>Realized revenue</span><strong>{money(selectedProject.realized_revenue)}</strong></div><div><span>Realized ROI</span><strong>{selectedProject.realized_roi_percent == null ? "—" : `${selectedProject.realized_roi_percent}%`}</strong></div><button onClick={()=>{setQuickFilter("projects");openDrilldown("ids",transactions.filter((row)=>row.project_id===selectedProject.id).map((row)=>row.id),selectedProject.name)}}>View {selectedProject.transaction_count} transactions</button></div>}
      {selectedProject && <div className="project-dashboard-tools"><form onSubmit={handleProjectAccount}><input name="name" required placeholder="Account name"/><input name="institution" placeholder="Institution"/><select name="account_type"><option value="checking">Checking</option><option value="savings">Savings</option><option value="credit_card">Credit card</option><option value="investment">Investment</option></select><input name="balance" type="number" step="0.01" placeholder="Balance"/><button type="submit">Add account</button></form><button onClick={()=>exportProject(selectedProject.id)}><Download size={16}/> Export dashboard</button><span>{selectedProject.accounts?.length || 0} dedicated accounts</span></div>}
      {showProjectForm && <form className="project-form" onSubmit={handleCreateProject}><input name="name" required placeholder="Project name"/><input name="target_budget" type="number" min="0" step="0.01" placeholder="Target budget"/><input name="projected_revenue" type="number" min="0" step="0.01" placeholder="Projected revenue"/><input name="actual_revenue" type="number" min="0" step="0.01" placeholder="Actual revenue"/><button disabled={busy} type="submit">Create</button></form>}
    </section>

    <section className="grid kpis">
      <KpiCard label="Monthly Budget" value={money(summary.monthly_budget)} />
      <KpiCard label="Average Monthly Spend" value={money(summary.average_monthly_spending)} />
      <KpiCard label="Average Variance" value={money(summary.average_variance)} tone={summary.average_variance > 0 ? "danger" : "success"} />
      <button className="kpi-button" onClick={()=>openDrilldown("attention", exceptions.map((row)=>row.category), "Outliers and attention items")}><KpiCard label="Categories Over Budget" value={summary.categories_over_budget || 0} note={`${outliers.length} transaction outliers`} /></button>
      <KpiCard label="Months Analyzed" value={coverage.month_count || 0} note={coverage.start_date ? `${coverage.start_date} to ${coverage.end_date}` : "Upload data to begin"} />
    </section>

    {(trends.length > 0 || savingsOpportunities.length > 0) && <section className="insights-grid">
      <div className="panel"><h2>Spending trending up</h2><div className="alert-list">{trends.slice(0,6).map((row)=><button className="alert-row high" key={row.category} onClick={()=>openDrilldown("category",row.category,`${row.category}: trending up`)}><AlertTriangle/><div><strong>{row.category}</strong><span>{money(row.trend_change)}/mo increase ({row.trend_percent}%)</span></div></button>)}</div></div>
      <div className="panel"><h2>Savings opportunities</h2><div className="alert-list">{savingsOpportunities.slice(0,6).map((row)=><button className={`alert-row ${row.confidence === "strong" ? "high" : "watch"}`} key={row.category} onClick={()=>openDrilldown("category",row.category,`${row.category}: savings opportunity`)}><AlertTriangle/><div><strong>{row.category}: {money(row.estimated_monthly_savings)}/mo potential</strong><span>{row.recommendation}</span></div></button>)}</div></div>
    </section>}

    <section className="planning-panel">
      <div className="planning-header"><div><p className="eyebrow dark">Portfolio & goals</p><h2>{money(planning.net_worth)} net worth</h2></div><div className="planning-tabs"><button className={planningTab==="path"?"active":""} onClick={()=>setPlanningTab("path")}>Financial path</button><button className={planningTab==="portfolio"?"active":""} onClick={()=>setPlanningTab("portfolio")}>Portfolio</button><button className={planningTab==="goals"?"active":""} onClick={()=>setPlanningTab("goals")}>Goals</button></div></div>
      {planningTab === "path" && <div className="planning-path"><div className="wealth-kpis"><span>Assets <strong>{money(planning.assets_total)}</strong></span><span>Liabilities <strong>{money(planning.liabilities_total)}</strong></span><span>Goals <strong>{planning.goals?.length || 0}</strong></span></div><ResponsiveContainer width="100%" height={300}><LineChart data={[...(planning.history || []),...(planning.projection || [])]}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="period"/><YAxis/><Tooltip formatter={(value)=>money(value)}/><Legend/><Line type="monotone" dataKey="income" stroke="#167047" dot={false}/><Line type="monotone" dataKey="expenses" stroke="#c43b3b" dot={false}/><Line type="monotone" dataKey="net_worth" stroke="#315bce" strokeWidth={3}/></LineChart></ResponsiveContainer></div>}
      {planningTab === "portfolio" && <div className="planning-grid"><form className="planning-form" onSubmit={handleAsset}><h3>Add financial instrument</h3><input name="name" required placeholder="Name"/><select name="kind"><option value="stock">Stock</option><option value="bond">Bond</option><option value="private_equity">Private entity shares</option><option value="real_estate">Real estate</option><option value="cash">Cash</option><option value="life_insurance">Life insurance</option><option value="other">Other investment</option><option value="debt">Debt / liability</option></select><input name="institution" placeholder="Institution"/><input name="current_value" type="number" min="0" step="0.01" placeholder="Current value or balance"/><input name="cost_basis" type="number" min="0" step="0.01" placeholder="Cost basis"/><input name="annual_rate" type="number" step="0.01" placeholder="Annual growth/interest %"/><input name="monthly_contribution" type="number" step="0.01" placeholder="Monthly contribution/payment"/><button type="submit">Add instrument</button></form><div className="instrument-list">{planning.assets?.map((asset)=><div key={asset.id}><strong>{asset.name}</strong><span>{asset.kind.replaceAll("_"," ")} · {money(asset.current_value)}</span></div>)}</div></div>}
      {planningTab === "goals" && <div className="planning-grid"><form className="planning-form" onSubmit={handleGoal}><h3>Create measurable goal</h3><input name="name" required placeholder="Goal name"/><select name="goal_type"><option value="savings">Savings</option><option value="investment">Investment</option><option value="debt_payoff">Debt payoff</option><option value="net_worth">Net worth</option></select><input name="target_amount" type="number" min="0" step="0.01" placeholder="Target amount (0 for debt payoff)"/><input name="current_amount" type="number" min="0" step="0.01" placeholder="Current amount or debt balance"/><input name="monthly_contribution" type="number" min="0" step="0.01" placeholder="Monthly contribution/payment"/><input name="annual_rate" type="number" step="0.01" placeholder="Annual growth/interest %"/><input name="target_date" type="date"/><button type="submit">Create goal</button></form><div className="goal-list">{planning.goals?.map((goal)=><div key={goal.id}><strong>{goal.name}</strong><span>{goal.progress_percent}% projected progress</span><span>{goal.projected_completion_date ? `Projected: ${goal.projected_completion_date}` : "Contribution does not currently reach target"}</span></div>)}</div></div>}
      <div className="recommendations">{planning.recommendations?.map((item)=><a href={item.source} target="_blank" rel="noreferrer" key={item.title}><strong>{item.title}</strong><span>{item.reason}</span></a>)}</div>
    </section>

    <section className="dashboard-layout">
      <div className="panel large"><h2>Monthly spending trend</h2><p className="section-note">Select a column to inspect that month. Red columns contain transaction outliers.</p><ResponsiveContainer width="100%" height={320}><BarChart data={analysis?.monthly_spending || []} onClick={(event)=>event?.activePayload?.[0]?.payload && openDrilldown("month", event.activePayload[0].payload.month, event.activePayload[0].payload.month)}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="month"/><YAxis/><Tooltip formatter={(value)=>money(value)}/><Bar dataKey="total" radius={[6,6,0,0]}>{(analysis?.monthly_spending || []).map((row)=><Cell cursor="pointer" fill={row.has_outlier ? "#c43b3b" : "#315bce"} key={row.month}/>)}</Bar></BarChart></ResponsiveContainer></div>
      <div className="panel"><h2>Attention needed</h2><p className="section-note">Select an issue to review and reconcile its transactions.</p><div className="alert-list">{exceptions.length || outliers.length ? <>{exceptions.slice(0,6).map((row)=><button className={`alert-row ${row.status}`} key={row.category} onClick={()=>openDrilldown("category", row.category, `${row.category}: ${row.status.replace("_", " ")}`)}><AlertTriangle/><div><strong>{row.category}</strong><span>{row.status === "unbudgeted" ? `${money(row.average_actual)}/mo with no baseline` : `${money(row.average_actual)}/mo vs ${money(row.monthly_budget)} budget`}</span></div></button>)}{outliers.slice(0,4).map((row)=><button className="alert-row high" key={row.transaction_id} onClick={()=>openDrilldown("outlier", true, "Transaction outliers")}><AlertTriangle/><div><strong>{row.description}</strong><span>{money(row.amount)} in {row.category}</span></div></button>)}</> : <div className="empty">Upload statements and a budget to identify exceptions.</div>}</div></div>
    </section>

    <section className="panel table-panel"><div className="table-heading"><div><h2>Budget comparison by category</h2><p className="section-note">Select any category row to inspect and reconcile its transactions.</p></div></div><div className="table-scroll"><table><thead><tr><th>Category</th><th>Status</th><th>Budget / mo</th><th>Average actual</th><th>Variance</th><th>Latest month</th><th>Historical normal</th><th>Months over</th></tr></thead><tbody>{categories.map((row)=><tr className={`clickable-row ${row.status === "high" || outlierCategories.has(row.category) ? "outlier-row" : ""}`} key={row.category} onClick={()=>openDrilldown("category", row.category, row.category)}><td><strong>{row.category}</strong></td><td><span className={`status ${row.status}`}>{row.status.replace("_"," ")}</span></td><td>{row.monthly_budget == null ? "—" : money(row.monthly_budget)}</td><td>{money(row.average_actual)}</td><td className={row.variance > 0 ? "negative" : "positive"}>{row.variance == null ? "—" : money(row.variance)}</td><td>{money(row.latest_actual)}</td><td>{money(row.historical_normal)}</td><td>{row.monthly_budget == null ? "—" : `${row.over_budget_months}/${row.months_analyzed}`}</td></tr>)}</tbody></table></div></section>

    <section className="panel table-panel">
      <div className="drilldown-heading"><div><h2>{drilldown ? `Transaction drill-down: ${drilldown.label}` : "All imported transactions"}</h2><p className="section-note">Filter, categorize, classify, or assign transactions to an investment project.</p></div>{drilldown && <button className="clear-filter" onClick={()=>setDrilldown(null)}>Clear drill-down</button>}</div>
      <div className="transaction-controls"><div className="filter-chips"><button className={quickFilter === "all" ? "active" : ""} onClick={()=>setQuickFilter("all")}>All</button><button className={quickFilter === "uncategorized" ? "active" : ""} onClick={()=>setQuickFilter("uncategorized")}>Uncategorized</button><button className={quickFilter === "unbudgeted" ? "active" : ""} onClick={()=>setQuickFilter("unbudgeted")}>Unbudgeted</button><button className={quickFilter === "outliers" ? "active outlier-chip" : "outlier-chip"} onClick={()=>setQuickFilter("outliers")}>Outliers</button><button className={quickFilter === "receipts" ? "active" : ""} onClick={()=>setQuickFilter("receipts")}>Receipts</button><button className={quickFilter === "projects" ? "active" : ""} onClick={()=>setQuickFilter("projects")}>Project investments</button></div><label className="row-limit">Rows<select value={rowLimit} onChange={(event)=>setRowLimit(event.target.value)}><option value="25">25</option><option value="50">50</option><option value="100">100</option><option value="250">250</option><option value="all">All</option></select></label></div>
      <div className="filter-chips secondary"><button onClick={()=>openDrilldown("classification","expense","Expenses")}>Expenses</button><button onClick={()=>openDrilldown("classification","transfer","Transfers")}>Transfers</button><button onClick={()=>openDrilldown("classification","income","Income")}>Income</button>{[...new Set(transactions.map((row)=>row.source_account).filter(Boolean))].map((source)=><button key={source} onClick={()=>openDrilldown("source",source,source)}>{source}</button>)}</div>
      <div className="table-scroll"><table><thead><tr><th>Date</th><th>Description</th><th>Spend impact</th><th>Budget category</th><th>Classification</th><th>Project</th><th>Institution</th></tr></thead><tbody>{visibleTransactions.map((transaction,index)=><tr className={outlierIds.has(transaction.id) ? "outlier-row" : ""} key={transaction.id || `${transaction.date}-${index}`}><td>{transaction.date}</td><td>{transaction.description}</td><td>{transaction.is_transfer || transaction.is_income ? "—" : money(transaction.spending_amount ?? transaction.amount)}</td><td><select className="category-select" disabled={busy || transaction.is_transfer || transaction.is_income} value={transaction.budget_category || ""} onChange={(event)=>assignCategory(transaction,event.target.value)}><option value="">Automatic / unassigned</option>{Object.entries(budgetGroups).map(([parent, rows])=><optgroup label={parent} key={parent}>{rows.map((row)=><option value={row.category} key={`${parent}-${row.category}`}>{row.category}</option>)}</optgroup>)}</select></td><td><select className="classification-select" disabled={busy} value={transaction.is_transfer ? "transfer" : transaction.is_income ? "income" : "expense"} onChange={(event)=>assignCategory(transaction,transaction.budget_category || "",event.target.value)}><option value="expense">Expense</option><option value="transfer">Transfer</option><option value="income">Income</option></select></td><td><select className="project-select" disabled={busy} value={transaction.project_id || ""} onChange={(event)=>handleProjectAssignment(transaction,event.target.value)}><option value="">Household</option>{projects.map((project)=><option value={project.id} key={project.id}>{project.name}</option>)}</select></td><td><button className="table-filter" onClick={()=>openDrilldown("source",transaction.source_account,transaction.source_account)}>{transaction.source_account}</button></td></tr>)}</tbody></table></div>
      <p className="result-count">Showing {visibleTransactions.length} of {filteredTransactions.length} matching transactions.</p>
    </section>
  </main>;
}

createRoot(document.getElementById("root")).render(<App />);
