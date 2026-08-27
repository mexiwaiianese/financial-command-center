import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { AlertTriangle, ArrowLeftRight, CheckCircle2, ChevronRight, Columns3, Download, FileJson, FileSpreadsheet, Landmark, RefreshCw, RotateCcw, Sparkles, Upload } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { addProjectAccount, applyCategoryRule, assignTransactionProject, createAsset, createCategory, createGoal, createProject, createTag, deleteCategoryRule, downloadBackup, exportProject, getBudgetAnalysis, getCategoryRules, getDashboard, getInstitutions, getPlanning, getProjects, getTags, getTellerStatus, getTransactions, previewCategory, registerTellerEnrollment, renameInstitution, requestPlanningAssistant, resetAreas, resetSession, restoreBackup, saveCategoryMatches, syncTellerNow, updateCategory, updateProject, updateTag, updateTransaction, updateTransactionCategory, uploadBudget, uploadReceipt, uploadTransactions } from "./lib/api";
import "./styles.css";
import DemoApp from "./DemoApp";

function money(value) {
  return Number(value || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function transactionSpendImpact(transaction) {
  if (transaction.spending_amount != null) return transaction.spending_amount;
  const amount = Number(transaction.amount || 0);
  return transaction.source_kind === "credit_card" || transaction.source_account === "AMEX" ? amount : -amount;
}

function chartColor(index) {
  return `hsl(${Math.round((index * 137.508 + 18) % 360)} 64% ${index % 3 === 0 ? 43 : index % 3 === 1 ? 51 : 58}%)`;
}

function planningSeries(planning, interval) {
  const history=planning.history||[]; const projection=planning.projection||[];
  if(interval==="year") { const years={}; history.forEach(row=>{const key=String(row.period).slice(0,4);years[key]??={period:key,income:0,expenses:0,net_worth:row.net_worth||0};years[key].income+=row.income||0;years[key].expenses+=row.expenses||0;years[key].net_worth=row.net_worth||years[key].net_worth}); return [...Object.values(years),...projection]; }
  const size=interval==="quarter"?4:12; const projected=projection.flatMap(row=>Array.from({length:size},(_,part)=>({period:interval==="quarter"?`${row.period} Q${part+1}`:`${row.period}-${String(part+1).padStart(2,"0")}`,income:(row.income||0)/size,expenses:(row.expenses||0)/size,net_worth:row.net_worth,projected:true}))).slice(0,size*3);
  if(interval==="month") return [...history,...projected];
  const quarters={}; history.forEach(row=>{const [year,month]=String(row.period).split("-").map(Number);const key=`${year} Q${Math.ceil(month/3)}`;quarters[key]??={period:key,income:0,expenses:0,net_worth:row.net_worth||0};quarters[key].income+=row.income||0;quarters[key].expenses+=row.expenses||0;quarters[key].net_worth=row.net_worth||quarters[key].net_worth}); return [...Object.values(quarters),...projected];
}

function KpiCard({ label, value, note, tone = "" }) {
  return <div className={`card ${tone}`}><div className="label">{label}</div><div className="kpi">{value}</div>{note && <div className="note">{note}</div>}</div>;
}

function AccessGate({ onUnlock }) {
  const [name,setName]=useState(""); const [email,setEmail]=useState(""); const [error,setError]=useState("");
  const users=JSON.parse(localStorage.getItem("fcc-authorized-users") || "[]");
  const registering=!users.length || sessionStorage.getItem("fcc-register-invite")==="1";
  async function register(){
    try { if(!email.trim()) throw new Error("Enter an email address.");
      const credential=await navigator.credentials.create({publicKey:{challenge:crypto.getRandomValues(new Uint8Array(32)),rp:{name:"Financial Control Center"},user:{id:crypto.getRandomValues(new Uint8Array(16)),name:email,displayName:name||email},pubKeyCredParams:[{alg:-7,type:"public-key"},{alg:-257,type:"public-key"}],authenticatorSelection:{userVerification:"required"},timeout:60000}});
      const invite=JSON.parse(sessionStorage.getItem("fcc-invite")||"null"); const role=users.length?(invite?.role||"viewer"):"superadmin"; const credentialId=btoa(String.fromCharCode(...new Uint8Array(credential.rawId))); const next=[...users.filter(item=>item.email!==email),{email,name:name||email,credentialId,role,permissions:invite?.permissions||[]}]; localStorage.setItem("fcc-authorized-users",JSON.stringify(next)); localStorage.setItem("fcc-session",email); sessionStorage.removeItem("fcc-register-invite"); sessionStorage.removeItem("fcc-invite"); onUnlock();
    } catch(e){setError(e.message || "Passkey registration was cancelled.")}
  }
  async function login(){
    try { if(!users.length) throw new Error("Register the first authorized user."); await navigator.credentials.get({publicKey:{challenge:crypto.getRandomValues(new Uint8Array(32)),allowCredentials:users.map(item=>({type:"public-key",id:Uint8Array.from(atob(item.credentialId),c=>c.charCodeAt(0))})),userVerification:"required",timeout:60000}}); localStorage.setItem("fcc-session",users[0].email); onUnlock(); }
    catch(e){setError(e.message || "Passkey sign-in was cancelled.")}
  }
  return <main className="login-screen"><section className="login-card"><p className="eyebrow dark">Private household workspace</p><h1>Financial Control Center</h1><p>Use Touch ID, Windows Hello, or your device PIN. Your biometric never leaves your device.</p>{registering ? <><input value={name} onChange={e=>setName(e.target.value)} placeholder="Your name"/><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email address" type="email"/><button onClick={register}>Register this device</button></> : <button onClick={login}>Sign in with a passkey</button>}{error&&<div className="notice">{error}</div>}<small>Additional users can be registered after sign-in. Production hosting should validate WebAuthn challenges on the server.</small></section></main>;
}

function ExistingWorkspace() {
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
  const [quickFilters, setQuickFilters] = useState([]);
  const [planning, setPlanning] = useState({assets:[],goals:[],history:[],projection:[],recommendations:[]});
  const [planningTab, setPlanningTab] = useState("path");
  const [activeView,setActiveView]=useState("dashboard");
  const [searchTerm,setSearchTerm]=useState(""); const [dateRange,setDateRange]=useState("all");
  const [customStart,setCustomStart]=useState(""); const [customEnd,setCustomEnd]=useState(""); const [entityFilter,setEntityFilter]=useState("all");
  const [manualMode,setManualMode]=useState(false); const [draftCategories,setDraftCategories]=useState({});
  const [timeBox,setTimeBox]=useState("month"); const [goalPrompt,setGoalPrompt]=useState(false);
  const [unlocked,setUnlocked]=useState(Boolean(localStorage.getItem("fcc-session")));
  const [institutions,setInstitutions]=useState([]); const [rules,setRules]=useState([]); const [settingsOpen,setSettingsOpen]=useState(false); const [rulesOpen,setRulesOpen]=useState(false);
  const [noteTransaction,setNoteTransaction]=useState(null); const [noteText,setNoteText]=useState(""); const [noteMentions,setNoteMentions]=useState([]); const [invitePrompt,setInvitePrompt]=useState(null);
  const [matchReview,setMatchReview]=useState(null); const [selectedMatchIds,setSelectedMatchIds]=useState([]); const [alwaysApply,setAlwaysApply]=useState(false);
  const [draftProjects,setDraftProjects]=useState({}); const [secondaryDraft,setSecondaryDraft]=useState({});
  const [researchTransaction,setResearchTransaction]=useState(null);
  const [,setSettingsVersion]=useState(0);
  const [visibleColumns,setVisibleColumns]=useState({date:true,description:true,impact:true,category:true,secondary:true,classification:true,tracking:true,note:true,provider:false});
  const [columnMenuOpen,setColumnMenuOpen]=useState(false); const [tableSort,setTableSort]=useState({key:"date",direction:"desc"}); const [activeTransactionId,setActiveTransactionId]=useState(null);
  const [resetPrompt,setResetPrompt]=useState(false); const [resetSelections,setResetSelections]=useState({transactions:true,budget:true,categorization:true,projects:true,project_definitions:true,notes:true,portfolio:true,goals:true,rules:true});
  const [matchSearch,setMatchSearch]=useState(""); const [matchMin,setMatchMin]=useState(""); const [matchMax,setMatchMax]=useState(""); const [matchStart,setMatchStart]=useState(""); const [matchEnd,setMatchEnd]=useState(""); const [matchSort,setMatchSort]=useState("relevance"); const [matchSecondary,setMatchSecondary]=useState([]);
  const [searchProvider,setSearchProvider]=useState(""); const [receiptReview,setReceiptReview]=useState(null);
  const [tags,setTags]=useState([]); const [tagSearch,setTagSearch]=useState(""); const [chartParent,setChartParent]=useState("");
  const [categoryCreator,setCategoryCreator]=useState(null); const [newCategoryName,setNewCategoryName]=useState(""); const [newCategoryParent,setNewCategoryParent]=useState(""); const [newParentName,setNewParentName]=useState("");
  const [categorySearch,setCategorySearch]=useState(""); const [categoryEdits,setCategoryEdits]=useState({}); const [planningRequest,setPlanningRequest]=useState(""); const [planningScope,setPlanningScope]=useState("household"); const [planningAnswer,setPlanningAnswer]=useState(null);
  const clientBackupSettings=()=>({category_sort:localStorage.getItem("fcc-category-sort")||"alphabetical",visible_columns:visibleColumns,privacy:{confirm_web_search:true}});

  async function refresh() {
    const [nextDashboard, nextTransactions, nextAnalysis, nextTellerStatus, nextProjects, nextPlanning,nextInstitutions,nextRules,nextTags] = await Promise.all([getDashboard(), getTransactions(), getBudgetAnalysis(), getTellerStatus(), getProjects(), getPlanning(),getInstitutions(),getCategoryRules(),getTags()]);
    setDashboard(nextDashboard);
    setTransactions(nextTransactions);
    setAnalysis(nextAnalysis);
    setTellerStatus(nextTellerStatus);
    setProjects(nextProjects);
    setPlanning(nextPlanning);
    setInstitutions(nextInstitutions); setRules(nextRules); setTags(nextTags);
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
      await downloadBackup(clientBackupSettings());
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
      await downloadBackup(clientBackupSettings());
      const reconciliation = transactionResult?.reconciliation;
      const reconciliationSummary = reconciliation
        ? ` ${reconciliation.total_reconciled_pairs??reconciliation.matched_pairs} transfer/payment pairs reconciled (${reconciliation.matched_internal_transfer_pairs||0} between financial providers); ${reconciliation.excluded_payment_transactions} payment entries excluded from spending; ${reconciliation.unmatched_payments} unmatched payments flagged for review.`
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
      if(result.client_settings?.category_sort)localStorage.setItem("fcc-category-sort",result.client_settings.category_sort);
      if(result.client_settings?.visible_columns)setVisibleColumns(result.client_settings.visible_columns);
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
    setResetPrompt(true);
  }

  async function confirmReset() {
    try {
      setBusy(true);
      await resetAreas(resetSelections);
      setStatementFiles([]);
      setBudgetFile(null);
      setDrilldown(null);
      await refresh();
      setResetPrompt(false); setMessage("Selected FCC areas were reset.");
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
      if (classification) { await updateTransactionCategory(transaction.id, category, budgetRow?.parent_category || "", classification); await refresh(); return; }
      const result=await previewCategory(transaction.id,category,budgetRow?.parent_category||""); const matches=[...(result.exact_matches||[]),...(result.fuzzy_matches||[])];
      setSelectedMatchIds((result.exact_matches||[]).map(row=>row.id)); setAlwaysApply(false); setMatchReview({...result,sourceTransaction:transaction});
      setMessage(`${matches.length} potential match${matches.length===1?"":"es"} ready for review.`);
    } catch (error) {
      setMessage(`Category update failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveManualAssignments() {
    try {
      setBusy(true);
      await Promise.all(Object.entries(draftCategories).map(([id, category]) => {
        const budgetRow = (analysis?.budget || []).find((row) => row.category === category);
        return updateTransactionCategory(id, category, budgetRow?.parent_category || "", "");
      }));
      await Promise.all(Object.entries(draftProjects).map(([id,project_id])=>updateTransaction(id,{project_id})));
      await Promise.all(Object.entries(secondaryDraft).map(([id,value])=>updateTransaction(id,{secondary_categories:Array.isArray(value)?value:value.split(",").map(item=>item.trim()).filter(Boolean)})));
      setDraftCategories({}); setDraftProjects({}); setSecondaryDraft({}); setManualMode(false); await refresh(); setMessage("Manual transaction changes saved.");
    } catch (error) { setMessage(`Manual assignment failed: ${error.message}`); }
    finally { setBusy(false); }
  }

  async function saveCreatedCategory(event) {
    event.preventDefault();
    const parent=newCategoryParent==="__new__"?newParentName.trim():newCategoryParent;
    if(!newCategoryName.trim()||!parent)return;
    await createCategory({category:newCategoryName.trim(),parent_category:parent});
    await refresh();
    if(categoryCreator?.transaction){
      if(manualMode)setDraftCategories(current=>({...current,[categoryCreator.transaction.id]:newCategoryName.trim()}));
      else {await updateTransactionCategory(categoryCreator.transaction.id,newCategoryName.trim(),parent);await refresh();}
    }
    setCategoryCreator(null);setNewCategoryName("");setNewCategoryParent("");setNewParentName("");setMessage("Category created.");
  }

  async function saveAllCategories(){if(!Object.keys(categoryEdits).length)return; if(!window.confirm(`Save ${Object.keys(categoryEdits).length} category changes?`))return;await Promise.all(Object.entries(categoryEdits).map(([name,payload])=>updateCategory(name,payload)));setCategoryEdits({});await refresh();setMessage("All category changes saved.")}

  async function confirmMatches(){try{setBusy(true);await saveCategoryMatches({transaction_ids:selectedMatchIds,category:matchReview.category,parent_category:matchReview.parent_category,secondary_categories:matchSecondary,always_apply:alwaysApply});setMatchReview(null);setSelectedMatchIds([]);setMatchSecondary([]);await refresh();setMessage(`Saved ${selectedMatchIds.length} categorization${selectedMatchIds.length===1?"":"s"}.`)}catch(error){setMessage(`Could not save matches: ${error.message}`)}finally{setBusy(false)}}
  async function saveNote(){try{await updateTransaction(noteTransaction.id,{user_note:noteText,note_mentions:noteMentions});setNoteTransaction(null);await refresh();setMessage("Transaction note saved.")}catch(error){setMessage(`Note save failed: ${error.message}`)}}

  async function handleReceipt(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setBusy(true);
      setMessage("Reading receipt and matching it to imported transactions…");
      const result = await uploadReceipt(file);
      setReceiptReview(result);
      setMessage("Receipt analyzed. Confirm the matching transaction and suggested category.");
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
      setReviewIds([]); setDrilldown(null);
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

  useEffect(() => { if (unlocked) refresh().catch(() => {}); }, [unlocked]);
  useEffect(()=>{if(!message)return;const timer=window.setTimeout(()=>setMessage(""),4500);return()=>window.clearTimeout(timer)},[message]);
  useEffect(()=>{if(!unlocked)return;const users=JSON.parse(localStorage.getItem("fcc-authorized-users")||"[]");if(!users.length)return;let changed=false;const migrated=users.map((user,index)=>{if(user.role)return user;changed=true;return {...user,role:index===0?"superadmin":"viewer",permissions:user.permissions||[]}});if(changed){localStorage.setItem("fcc-authorized-users",JSON.stringify(migrated));setSettingsVersion(value=>value+1)}},[unlocked]);
  useEffect(()=>{if(!unlocked||localStorage.getItem("fcc-request-log-version")==="2026-08-05-13")return;const link=document.createElement("a");link.href="/FCC_REQUEST_LOG.md";link.download="FCC-Living-Request-Log.md";document.body.appendChild(link);link.click();link.remove();localStorage.setItem("fcc-request-log-version","2026-08-05-13")},[unlocked]);

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
      if (drilldown.value === "return" || drilldown.value === "reimbursement") return transaction.manual_classification === drilldown.value;
      if (drilldown.value === "transfer") return transaction.is_transfer;
      if (drilldown.value === "income") return transaction.is_income && !["return","reimbursement"].includes(transaction.manual_classification);
      return transaction.is_spending && !transaction.is_transfer && !transaction.is_income;
    }
    return true;
  });
  const unbudgetedCategories = new Set(categories.filter((row)=>row.status === "unbudgeted").map((row)=>row.category));
  const filteredTransactions = drilldownTransactions.filter((transaction) => {
    if (quickFilters.includes("uncategorized") && (transaction.budget_category || !transaction.is_spending || transaction.is_transfer || transaction.is_income)) return false;
    if (quickFilters.includes("unbudgeted") && !unbudgetedCategories.has(transaction.budget_category || transaction.major_category)) return false;
    if (quickFilters.includes("outliers") && !outlierIds.has(transaction.id)) return false;
    if (quickFilters.includes("receipts") && !transaction.receipt_filename) return false;
    if (quickFilters.includes("projects") && !transaction.project_id) return false;
    if (searchTerm && !`${transaction.description || ""} ${transaction.source_account || ""}`.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (entityFilter !== "all") { const [kind,id]=entityFilter.split(":"); if(kind==="category"&&(transaction.budget_category||transaction.major_category)!==id)return false; if(kind==="parent"&&(transaction.budget_parent_category||"Other")!==id)return false; if(kind==="project"&&(id?transaction.project_id!==id:Boolean(transaction.project_id)))return false; }
    if (dateRange !== "all") { const stamp=new Date(`${transaction.date}T00:00:00`); const now=new Date(); let start=null; if(dateRange==="30d")start=new Date(now.getFullYear(),now.getMonth(),now.getDate()-30); if(dateRange==="month")start=new Date(now.getFullYear(),now.getMonth(),1); if(dateRange==="quarter")start=new Date(now.getFullYear(),now.getMonth()-2,1); if(dateRange==="year")start=new Date(now.getFullYear(),0,1); if(dateRange==="custom"&&customStart)start=new Date(`${customStart}T00:00:00`); if(start&&stamp<start)return false; if(dateRange==="custom"&&customEnd&&stamp>new Date(`${customEnd}T23:59:59`))return false; }
    return true;
  });
  const sortedTransactions=[...filteredTransactions].sort((a,b)=>{let left=tableSort.key==="impact"?transactionSpendImpact(a):String(a[tableSort.key]??"").toLowerCase();let right=tableSort.key==="impact"?transactionSpendImpact(b):String(b[tableSort.key]??"").toLowerCase();return (left<right?-1:left>right?1:0)*(tableSort.direction==="asc"?1:-1)});
  const visibleTransactions = rowLimit === "all" ? sortedTransactions : sortedTransactions.slice(0, Number(rowLimit));
  const trendLabel=row=>chartParent?(row.budget_category||row.major_category||"Uncategorized"):(row.budget_parent_category||"Other");
  const filteredTrend=Object.values(filteredTransactions.reduce((result,row)=>{const month=String(row.date||"").slice(0,7);if(!month)return result;const category=trendLabel(row);result[month]??={month};result[month][category]=(result[month][category]||0)+Math.abs(transactionSpendImpact(row));return result},{})).sort((a,b)=>a.month.localeCompare(b.month));
  const filteredTrendCategories=[...new Set(filteredTransactions.map(trendLabel))];
  const overBudgetChartData=categories.filter(row=>row.monthly_budget!=null&&row.latest_actual>row.monthly_budget).map(row=>({category:row.category,actual:row.latest_actual,budget:row.monthly_budget}));
  const toggleSort=key=>setTableSort(current=>({key,direction:current.key===key&&current.direction==="asc"?"desc":"asc"}));
  const sortMark=key=>tableSort.key===key?(tableSort.direction==="asc"?" ▲":" ▼"):"";
  const matchRows=[...(matchReview?.exact_matches||[]),...(matchReview?.fuzzy_matches||[])].filter(row=>{const amount=Math.abs(Number(row.amount||0));return (!matchSearch||String(row.description||"").toLowerCase().includes(matchSearch.toLowerCase()))&&(!matchMin||amount>=Number(matchMin))&&(!matchMax||amount<=Number(matchMax))&&(!matchStart||row.date>=matchStart)&&(!matchEnd||row.date<=matchEnd)}).sort((a,b)=>matchSort==="date"?String(b.date).localeCompare(String(a.date)):matchSort==="amount"?Math.abs(Number(b.amount))-Math.abs(Number(a.amount)):Number(b.relevance??b.confidence)-Number(a.relevance??a.confidence));
  const safeResearchTerms=transaction=>String(transaction?.description||"").replace(/\b\d[\d.-]*\b/g,"").replace(/\b(account|acct|card|checking|savings)\b/gi,"").replace(/\s+/g," ").trim();
  const selectedProject = projects.find((project) => project.id === selectedProjectId) || projects[0];
  const planningChartData = planningSeries(planning,timeBox);
  const registeredUsers=JSON.parse(localStorage.getItem("fcc-authorized-users")||"[]"); const currentUser=registeredUsers.find(user=>user.email===localStorage.getItem("fcc-session"))||registeredUsers[0];
  const effectiveRole=currentUser?.role||(registeredUsers[0]?.email===currentUser?.email?"superadmin":"viewer"); const isAdmin=["superadmin","admin"].includes(effectiveRole); const canUpload=isAdmin||currentUser?.permissions?.includes("upload_files"); const canConnect=isAdmin||currentUser?.permissions?.includes("connect_providers");
  const sortedCategories=[...categories].sort((a,b)=>a.category.localeCompare(b.category)); const sortedProjects=[...projects].sort((a,b)=>a.name.localeCompare(b.name));
  const categorySuggestions=newCategoryName.trim().length<2?[]:sortedCategories.map(row=>{const query=newCategoryName.toLowerCase();const name=row.category.toLowerCase();const shared=[...new Set(query)].filter(char=>name.includes(char)).length/Math.max(new Set(query).size,1);return {...row,score:name.includes(query)||query.includes(name)?1:shared}}).filter(row=>row.score>.55).sort((a,b)=>b.score-a.score).slice(0,5);
  const openDrilldown = (type, value, label) => {
    setDrilldown({ type, value, label });
    setActiveView("transactions"); window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(()=>{const remaining=transactions.filter(row=>!row.budget_category&&row.is_spending&&!row.is_transfer&&!row.is_income).length;if(transactions.length&&remaining===0&&!planning.goals?.length&&!sessionStorage.getItem("fcc-goal-prompt")){sessionStorage.setItem("fcc-goal-prompt","1");setGoalPrompt(true)}},[transactions,planning.goals]);

  if (!unlocked) return <AccessGate onUnlock={()=>setUnlocked(true)}/>;

  return <main className={reviewIds.length ? "review-mode" : ""}>
    <header className="hero">
      <div><p className="eyebrow">Household CFO System</p><h1>Financial Command Center</h1><p>Upload twelve months of statements and your current budget to find recurring overspending, recent spikes, and expenses with no budget baseline.</p></div>
    </header>

    <nav className="top-nav" aria-label="Financial Control Center sections"><button className={activeView==="dashboard"?"active":""} onClick={()=>setActiveView("dashboard")}>Dashboard</button><button className={activeView==="budget"?"active":""} onClick={()=>setActiveView("budget")}>Budget comparison</button><button className={activeView==="transactions"?"active":""} onClick={()=>setActiveView("transactions")}>Transaction Explorer</button><button className={activeView==="settings"?"active":""} onClick={()=>setActiveView("settings")}>Account settings</button><button onClick={()=>{localStorage.removeItem("fcc-session");setUnlocked(false)}}>Sign out</button></nav>
    {message&&<div className="save-toast" role="status"><CheckCircle2 size={18}/><span>{message}</span></div>}

    {activeView === "dashboard" && <><details className="collapsible" open><summary>Import statements and compare your spending plan</summary><section className="import-panel">
      <div className="import-heading"><div><p className="eyebrow dark">Budget variance analysis</p><h2>Compare actual spending with your plan</h2></div><span className="local-badge">Local processing</span></div>
      <div className="upload-grid">
        <label className={`drop-zone ${!canUpload?"disabled":""}`} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();if(canUpload)setStatementFiles(Array.from(event.dataTransfer.files||[]))}}><Upload size={24}/><strong>1. Upload or drop statements</strong><span>{canUpload?"Choose CSV or Excel exports covering the past 12 months.":"An admin must grant file-upload access."}</span><input disabled={!canUpload} type="file" multiple accept=".csv,.xlsx,.xls" onChange={(event)=>setStatementFiles(Array.from(event.target.files || []))}/><em>{statementFiles.length ? `${statementFiles.length} file${statementFiles.length === 1 ? "" : "s"} selected` : "Drop files here or browse"}</em></label>
        <label className={`drop-zone ${!canUpload?"disabled":""}`} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();if(canUpload)setBudgetFile(event.dataTransfer.files?.[0]||null)}}><FileSpreadsheet size={24}/><strong>2. Upload or drop current budget</strong><span>{canUpload?"Use Category and Monthly Budget columns in CSV or Excel.":"An admin must grant file-upload access."}</span><input disabled={!canUpload} type="file" accept=".csv,.xlsx,.xls" onChange={(event)=>setBudgetFile(event.target.files?.[0] || null)}/><em>{budgetFile?.name || "Drop a file here or browse"}</em></label>
      </div>
      <div className="receipt-upload"><label className={!canUpload?"disabled":""}><FileSpreadsheet size={17}/> Analyze Receipt<input disabled={!canUpload} type="file" accept="image/*,.txt,text/plain" onChange={handleReceipt}/></label><span>{canUpload?"Matches merchant, date, and total; line items refine ambiguous retail categories.":"An admin must grant file-upload access."}</span></div>
      <div className="analysis-actions"><button className="analyze-button" disabled={busy||!canUpload} onClick={()=>analyze(false)}>{busy ? "Analyzing…" : transactions.length ? "Add Files & Reanalyze" : "Analyze Spending"}</button><button className="new-analysis-button" disabled={busy || !canUpload || (!statementFiles.length && !budgetFile)} onClick={()=>analyze(true)}><RefreshCw size={17}/> New Analysis</button></div>
      <div className="backup-actions">
        <label className={`restore-button ${!canUpload?"disabled":""}`}><FileJson size={17}/> Restore FCC Backup<input disabled={!canUpload} type="file" accept=".json,application/json" onChange={handleRestore}/></label>
        <button className="backup-button" disabled={busy || (!transactions.length && !categories.length)} onClick={()=>downloadBackup(clientBackupSettings()).catch((error)=>setMessage(`Backup failed: ${error.message}`))}><Download size={17}/> Download Backup Now</button>
        <button className="reset-button" disabled={busy || (!transactions.length && !categories.length)} onClick={startOver}><RotateCcw size={17}/> Start Over</button>
        <span>Backups contain normalized session data and your budget baseline.</span>
      </div>
      {message && <div className="notice">{message}</div>}
    </section></details>

    <section className="projects-panel">
      <div className="projects-toolbar"><div><p className="eyebrow dark">Projects & investments</p><h2>{selectedProject?.name || "No projects"}</h2></div><div className="project-controls"><select value={selectedProjectId} onChange={(event)=>setSelectedProjectId(event.target.value)}>{projects.map((project)=><option value={project.id} key={project.id}>{project.name}</option>)}</select><button onClick={()=>setShowProjectForm((value)=>!value)}>{showProjectForm ? "Cancel" : "New Project"}</button></div></div>
      {selectedProject && <div className="project-metrics"><div><span>Invested</span><strong>{money(selectedProject.invested)}</strong></div><div><span>Projected revenue</span><strong>{money(selectedProject.projected_revenue)}</strong></div><div><span>Projected ROI</span><strong>{selectedProject.projected_roi_percent == null ? "—" : `${selectedProject.projected_roi_percent}%`}</strong></div><div><span>Realized revenue</span><strong>{money(selectedProject.realized_revenue)}</strong></div><div><span>Realized ROI</span><strong>{selectedProject.realized_roi_percent == null ? "—" : `${selectedProject.realized_roi_percent}%`}</strong></div><button onClick={()=>{setQuickFilters(filters=>[...new Set([...filters,"projects"])]);openDrilldown("ids",transactions.filter((row)=>row.project_id===selectedProject.id).map((row)=>row.id),selectedProject.name)}}>View {selectedProject.transaction_count} transactions</button></div>}
      {selectedProject && <div className="project-dashboard-tools"><form onSubmit={handleProjectAccount}><input name="name" required placeholder="Account name"/><input name="institution" placeholder="Financial provider"/><select name="account_type"><option value="checking">Checking</option><option value="savings">Savings</option><option value="credit_card">Credit card</option><option value="investment">Investment</option></select><input name="balance" type="number" step="0.01" placeholder="Balance"/><label><input name="teller_sync" type="checkbox"/> Sync with Teller</label><button type="submit">Add project account</button></form><button onClick={()=>exportProject(selectedProject.id)}><Download size={16}/> Export dashboard</button><span>{selectedProject.accounts?.length || 0} dedicated accounts</span></div>}
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
    {categoryCreator&&<div className="modal-backdrop" role="dialog" aria-modal="true"><form className="dialog-card" onSubmit={saveCreatedCategory}><h2>Create a budget category</h2><label>Subcategory name<input autoFocus value={newCategoryName} onChange={event=>setNewCategoryName(event.target.value)} required placeholder="New subcategory"/></label>{categorySuggestions.length>0&&<div className="category-suggestions"><strong>Potential existing matches</strong>{categorySuggestions.map(row=><button type="button" key={row.category} onClick={()=>{setCategoryCreator(null);if(manualMode)setDraftCategories(current=>({...current,[categoryCreator.transaction.id]:row.category}));else assignCategory(categoryCreator.transaction,row.category)}}>{row.category}<small>{row.parent_category}</small></button>)}</div>}<label>Parent category<select value={newCategoryParent} onChange={event=>setNewCategoryParent(event.target.value)} required>{Object.keys(budgetGroups).sort().map(parent=><option key={parent} value={parent}>{parent}</option>)}<option value="__new__">＋ Create a new parent category</option></select></label>{newCategoryParent==="__new__"&&<label>New parent category<input value={newParentName} onChange={event=>setNewParentName(event.target.value)} required placeholder="Parent category name"/></label>}<div className="dialog-actions"><button type="submit">Create and assign</button><button type="button" className="secondary" onClick={()=>setCategoryCreator(null)}>Cancel</button></div></form></div>}

    <section className="planning-panel">
      <div className="planning-header"><div><p className="eyebrow dark">Portfolio & goals</p><h2>{money(planning.net_worth)} net worth</h2></div><div className="planning-actions"><label>Time box <select value={timeBox} onChange={event=>setTimeBox(event.target.value)}><option value="month">Monthly</option><option value="quarter">Quarterly</option><option value="year">Yearly</option></select></label><button onClick={()=>setGoalPrompt(true)}>Help me decide</button><div className="planning-tabs"><button className={planningTab==="path"?"active":""} onClick={()=>setPlanningTab("path")}>Financial path</button><button className={planningTab==="portfolio"?"active":""} onClick={()=>setPlanningTab("portfolio")}>Portfolio</button><button className={planningTab==="goals"?"active":""} onClick={()=>setPlanningTab("goals")}>Goals</button></div></div></div>
      {planningTab === "path" && <div className="planning-path"><div className="wealth-kpis"><span>Assets <strong>{money(planning.assets_total)}</strong></span><span>Liabilities <strong>{money(planning.liabilities_total)}</strong></span><span>Goals <strong>{planning.goals?.length || 0}</strong></span></div><ResponsiveContainer width="100%" height={300}><LineChart data={planningChartData}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="period"/><YAxis/><Tooltip formatter={(value)=>money(value)}/><Legend/><Line type="monotone" dataKey="income" stroke="#167047" dot={false}/><Line type="monotone" dataKey="expenses" stroke="#c43b3b" dot={false}/><Line type="monotone" dataKey="net_worth" stroke="#315bce" strokeWidth={3}/></LineChart></ResponsiveContainer></div>}
      {planningTab === "portfolio" && <div className="planning-grid"><form className="planning-form" onSubmit={handleAsset}><h3>Add financial instrument</h3><input name="name" required placeholder="Name"/><select name="kind"><option value="stock">Stock</option><option value="bond">Bond</option><option value="private_equity">Private entity shares</option><option value="real_estate">Real estate</option><option value="cash">Cash</option><option value="life_insurance">Life insurance</option><option value="other">Other investment</option><option value="debt">Debt / liability</option></select><input name="institution" placeholder="Institution"/><input name="current_value" type="number" min="0" step="0.01" placeholder="Current value or balance"/><input name="cost_basis" type="number" min="0" step="0.01" placeholder="Cost basis"/><input name="annual_rate" type="number" step="0.01" placeholder="Annual growth/interest %"/><input name="monthly_contribution" type="number" step="0.01" placeholder="Monthly contribution/payment"/><select name="linked_goal_id"><option value="">No linked goal</option>{planning.goals?.map(goal=><option key={goal.id} value={goal.id}>Track toward: {goal.name}</option>)}</select><button type="submit">Add instrument</button></form><div className="instrument-list">{planning.assets?.map((asset)=><div key={asset.id}><strong>{asset.name}</strong><span>{asset.kind.replaceAll("_"," ")} · {money(asset.current_value)}{asset.linked_goal_id?` · linked to ${planning.goals?.find(goal=>goal.id===asset.linked_goal_id)?.name||"goal"}`:""}</span></div>)}</div></div>}
      {planningTab === "goals" && <div className="planning-grid"><form className="planning-form" onSubmit={handleGoal}><h3>Create a plan or goal</h3><input name="name" required placeholder="Goal name"/><select name="goal_type"><option value="savings">Savings / cash flow</option><option value="investment">Investment</option><option value="debt_payoff">Debt payoff plan</option><option value="net_worth">Net worth plan</option></select><input name="target_amount" type="number" min="0" step="0.01" placeholder="Target amount (0 for debt payoff)"/><input name="current_amount" type="number" min="0" step="0.01" placeholder="Current amount or debt balance"/><input name="monthly_contribution" type="number" min="0" step="0.01" placeholder="Monthly contribution/payment"/><input name="annual_rate" type="number" step="0.01" placeholder="Annual growth/interest %"/><input name="target_date" type="date"/><select name="priority"><option value="high">High priority</option><option value="medium">Medium priority</option><option value="low">Low priority</option></select><select name="pursuit_mode"><option value="parallel">Pursue alongside other goals</option><option value="sequence">Sequence after higher-priority goals</option></select><button type="submit">Create plan</button></form><div className="goal-list">{planning.goals?.map((goal)=><div key={goal.id}><strong>{goal.name}</strong><span>{goal.priority} priority · {goal.pursuit_mode}</span><span>{goal.progress_percent}% projected progress</span><span>{goal.projected_completion_date ? `Projected: ${goal.projected_completion_date}` : "Contribution does not currently reach target"}</span></div>)}</div></div>}
      <div className="recommendations">{planning.recommendations?.map((item)=><a href={item.source} target="_blank" rel="noreferrer" key={item.title}><strong>{item.title}</strong><span>{item.reason}</span></a>)}</div>
      <form className="planning-assistant" onSubmit={async event=>{event.preventDefault();setBusy(true);try{setPlanningAnswer(await requestPlanningAssistant({request:planningRequest,scope:planningScope}))}catch(error){setMessage(`Planning assistant failed: ${error.message}`)}finally{setBusy(false)}}}><div><Sparkles size={20}/><h3>Planning assistant</h3><p>Describe an outcome, date, constraints, and whether income or spending may change.</p></div><select value={planningScope} onChange={event=>setPlanningScope(event.target.value)}><option value="household">Household plan</option>{sortedProjects.map(project=><option key={project.id} value={`project:${project.id}`}>{project.name} plan</option>)}</select><textarea value={planningRequest} onChange={event=>setPlanningRequest(event.target.value)} required placeholder="I want to accomplish X by Y date while maintaining current constraints…"/><button disabled={busy}>Build coordinated plan</button>{planningAnswer&&<div className="assistant-answer"><strong>{planningAnswer.strategy==="sequence"?"Recommended sequence":"Recommended parallel plan"}</strong><p>Estimated monthly capacity: {money(planningAnswer.monthly_capacity)}</p>{planningAnswer.sequence?.length>0&&<p>Goal order: {planningAnswer.sequence.join(" → ")}</p>}<ol>{planningAnswer.steps.map(step=><li key={step}>{step}</li>)}</ol><p>{planningAnswer.constraint_note}</p></div>}</form>
    </section></>}

    {activeView === "dashboard" && <section className="dashboard-layout">
      <div className="panel large"><h2>Monthly spending trend</h2><p className="section-note">Yellow is above budget, orange is above the rolling average, and red is above both.</p><ResponsiveContainer width="100%" height={320}><BarChart data={analysis?.monthly_spending || []} onClick={(event)=>event?.activePayload?.[0]?.payload && openDrilldown("month", event.activePayload[0].payload.month, event.activePayload[0].payload.month)}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="month"/><YAxis/><Tooltip formatter={(value)=>money(value)}/><ReferenceLine y={summary.monthly_budget||0} stroke="#7c5b00" strokeDasharray="6 4" label="Monthly budget"/><Bar dataKey="total" radius={[6,6,0,0]}>{(analysis?.monthly_spending || []).map((row)=>{const overBudget=row.total>row.monthly_budget;const overAverage=row.total>row.rolling_average;return <Cell cursor="pointer" fill={overBudget&&overAverage?"#c43b3b":overAverage?"#e67e22":overBudget?"#e5b700":"#315bce"} key={row.month}/>})}</Bar></BarChart></ResponsiveContainer></div>
      <div className="panel"><h2>Attention needed</h2><p className="section-note">Select an issue to review and reconcile its transactions.</p><div className="alert-list">{exceptions.length || outliers.length ? <>{exceptions.slice(0,6).map((row)=><button className={`alert-row ${row.status}`} key={row.category} onClick={()=>openDrilldown("category", row.category, `${row.category}: ${row.status.replace("_", " ")}`)}><AlertTriangle/><div><strong>{row.category}</strong><span>{row.status === "unbudgeted" ? `${money(row.average_actual)}/mo with no baseline` : `${money(row.average_actual)}/mo vs ${money(row.monthly_budget)} budget`}</span></div></button>)}{outliers.slice(0,4).map((row)=><button className="alert-row high" key={row.transaction_id} onClick={()=>openDrilldown("outlier", true, "Transaction outliers")}><AlertTriangle/><div><strong>{row.description}</strong><span>{money(row.amount)} in {row.category}</span></div></button>)}</> : <div className="empty">Upload statements and a budget to identify exceptions.</div>}</div></div>
    </section>}

    {activeView === "budget" && <section className="panel table-panel"><div className="table-heading"><div><h2>Budget comparison by category</h2><p className="section-note">Select any category row to inspect its transactions.</p></div></div><div className="table-scroll"><table><thead><tr><th>Category</th><th>Status</th><th>Budget / mo</th><th>Suggested budget</th><th>Average actual</th><th>Variance</th><th>Latest month</th><th>Historical normal</th><th>Months over</th></tr></thead><tbody>{categories.map((row)=><tr className={`clickable-row ${row.status === "high" || outlierCategories.has(row.category) ? "outlier-row" : ""}`} key={row.category} onClick={()=>openDrilldown("category", row.category, row.category)}><td><strong>{row.category}</strong></td><td><span className={`status ${row.status}`}>{row.status.replace("_"," ")}</span></td><td>{row.monthly_budget == null ? "—" : money(row.monthly_budget)}</td><td>{money(row.suggested_budget)}</td><td>{money(row.average_actual)}</td><td className={row.variance > 0 ? "negative" : "positive"}>{row.variance == null ? "—" : money(row.variance)}</td><td>{money(row.latest_actual)}</td><td>{money(row.historical_normal)}</td><td>{row.monthly_budget == null ? "—" : `${row.over_budget_months}/${row.months_analyzed}`}</td></tr>)}</tbody></table></div></section>}

    {activeView === "settings" && <section className="settings-grid">
      <details className="panel settings-card provider-settings collapsible" open>
<summary>Financial providers</summary>
<p>Rename and classify banks, credit unions, card issuers, brokerages, crypto platforms, and other providers.</p>{institutions.map(provider=>{const connected=(tellerStatus?.connected_institutions||[]).some(item=>(item.institution_name||item.name||"").toLowerCase().includes(provider.name.toLowerCase()));return <form key={provider.name} onSubmit={async event=>{event.preventDefault();const form=new FormData(event.currentTarget);if(!window.confirm(`Save changes to ${provider.name}?`))return;await renameInstitution(provider.name,{name:form.get("name"),provider_type:form.get("provider_type")});await refresh();setMessage("Financial provider settings saved.")}}><input name="name" defaultValue={provider.name}/><select name="provider_type" defaultValue={provider.provider_type}><option value="bank">Bank</option><option value="credit_union">Credit union</option><option value="credit_card">Credit card</option><option value="brokerage">Brokerage</option><option value="crypto">Crypto</option><option value="loan_servicer">Loan servicer</option><option value="other">Other</option></select><span className={`connection-icon ${connected?"connected":""}`} title={connected?"Connected through Teller":"Not connected through Teller"}><ArrowLeftRight size={18}/></span><button type="button" className="icon-button" title="Sync this provider" disabled={!connected||busy} onClick={async()=>{await syncBankNow();setMessage(`${provider.name} sync requested.`)}}><RefreshCw size={17}/></button><button>Save</button></form>})}<details className="collapsible embedded"><summary>Connect and sync financial providers</summary><section className="bank-panel"><div className="bank-icon"><Landmark size={24}/></div><div className="bank-copy"><h3>Teller connections</h3><p>Connect providers and refresh transaction data securely.</p><div className="bank-meta"><span>{tellerStatus?.connected_institutions?.length||0} connected</span><span>Last sync: {tellerStatus?.last_successful_sync?new Date(tellerStatus.last_successful_sync).toLocaleString():"Never"}</span></div></div><div className="bank-actions"><button onClick={connectBank} disabled={busy||!canConnect}><Landmark size={16}/> Connect provider</button><button onClick={syncBankNow} disabled={busy||!tellerStatus?.connected_institutions?.length}><RefreshCw size={16}/> Sync all</button></div></section></details>
</details>
      <details className="panel settings-card category-settings collapsible">
<summary>Categories & subcategories</summary>
<p>Create subcategories, rename them, or move them to an entirely different parent category.</p><div className="category-toolbar"><input type="search" value={categorySearch} onChange={event=>setCategorySearch(event.target.value)} placeholder="Search categories and subcategories…"/><button className="save-button" disabled={!Object.keys(categoryEdits).length} onClick={saveAllCategories}>Save all {Object.keys(categoryEdits).length||""} changes</button></div><datalist id="parent-category-options">{Object.keys(budgetGroups).sort().map(parent=><option key={parent} value={parent}/>)}</datalist><form onSubmit={async event=>{event.preventDefault();const form=new FormData(event.currentTarget);await createCategory(Object.fromEntries(form));event.currentTarget.reset();await refresh();setMessage("Category added.")}}><input list="parent-category-options" name="parent_category" placeholder="Parent category" required/><input name="category" placeholder="Subcategory" required/><input name="monthly_budget" type="number" min="0" step=".01" placeholder="Monthly budget"/><button>Create category</button></form><div className="category-catalog">{Object.entries(budgetGroups).filter(([parent,rows])=>!categorySearch||`${parent} ${rows.map(row=>row.category).join(" ")}`.toLowerCase().includes(categorySearch.toLowerCase())).sort(([a],[b])=>a.localeCompare(b)).map(([parent,rows])=><details key={parent}><summary><strong>{parent}</strong><span>{rows.length} subcategories</span></summary><div className="category-edit-list">{[...rows].filter(row=>!categorySearch||`${parent} ${row.category}`.toLowerCase().includes(categorySearch.toLowerCase())).sort((a,b)=>a.category.localeCompare(b.category)).map(row=>{const edit=categoryEdits[row.category]||{};const stage=(key,value)=>setCategoryEdits(current=>({...current,[row.category]:{category:edit.category??row.category,parent_category:edit.parent_category??row.parent_category??parent,monthly_budget:edit.monthly_budget??row.monthly_budget??0,[key]:value}}));return <form className="category-edit-row" key={row.category} onSubmit={event=>event.preventDefault()}><input value={edit.category??row.category} onChange={event=>stage("category",event.target.value)} aria-label="Subcategory name"/><input list="parent-category-options" value={edit.parent_category??row.parent_category??parent} onChange={event=>stage("parent_category",event.target.value)} aria-label="Move to parent category"/><input type="number" min="0" step=".01" value={edit.monthly_budget??row.monthly_budget??0} onChange={event=>stage("monthly_budget",event.target.value)} aria-label="Monthly budget"/><span>{categoryEdits[row.category]?"Unsaved":""}</span></form>})}</div></details>)}</div>
</details>
      <details className="panel settings-card collapsible">
<summary>Projects</summary>
<p>Edit project names, status, budgets, and revenue assumptions.</p>{projects.map(project=><form className="project-edit-row" key={project.id} onSubmit={async event=>{event.preventDefault();if(!window.confirm(`Save changes to ${project.name}?`))return;await updateProject(project.id,Object.fromEntries(new FormData(event.currentTarget)));await refresh();setMessage("Project saved.")}}><label>Project name<input name="name" defaultValue={project.name}/></label><label>Status<select name="status" defaultValue={project.status}><option value="active">Active</option><option value="paused">Paused</option><option value="complete">Complete</option></select></label><label>Target budget<input name="target_budget" type="number" step=".01" defaultValue={project.target_budget}/></label><label>Projected revenue<input name="projected_revenue" type="number" step=".01" defaultValue={project.projected_revenue}/></label><button>Save</button></form>)}
</details>
      <details className="panel settings-card collapsible">
<summary>Secondary tags</summary>
<p>Create and edit cross-cutting tags independently from budget categories.</p><form onSubmit={async event=>{event.preventDefault();await createTag({name:new FormData(event.currentTarget).get("name")});event.currentTarget.reset();await refresh();setMessage("Tag added.")}}><input name="name" required placeholder="New tag"/><button>Create tag</button></form>{tags.map(tag=><form className="tag-edit-row" key={tag} onSubmit={async event=>{event.preventDefault();if(!window.confirm(`Rename ${tag}?`))return;await updateTag(tag,{name:new FormData(event.currentTarget).get("name")});await refresh();setMessage("Tag saved.")}}><input name="name" defaultValue={tag}/><button>Save</button></form>)}
</details>
      <details className="panel settings-card collapsible">
<summary>Users & access</summary>
<p>Superadmin owns the account. Admins manage users. Analysts can categorize and report. Contributors can add notes. Viewers are read-only.</p>{registeredUsers.map(user=><div className="user-row" key={user.email}><span><strong>{user.name}</strong><small>{user.email}</small></span><select disabled={!isAdmin||user.role==="superadmin"} value={user.role||"viewer"} onChange={event=>{const next=registeredUsers.map(item=>item.email===user.email?{...item,role:event.target.value}:item);localStorage.setItem("fcc-authorized-users",JSON.stringify(next));setSettingsVersion(value=>value+1)}}><option value="superadmin">Superadmin</option><option value="admin">Admin</option><option value="analyst">Analyst</option><option value="contributor">Contributor</option><option value="viewer">Viewer</option></select>{isAdmin&&user.role!=="superadmin"&&<label><input type="checkbox" checked={user.permissions?.includes("upload_files")} onChange={event=>{const permissions=new Set(user.permissions||[]);event.target.checked?permissions.add("upload_files"):permissions.delete("upload_files");const next=registeredUsers.map(item=>item.email===user.email?{...item,permissions:[...permissions]}:item);localStorage.setItem("fcc-authorized-users",JSON.stringify(next));setSettingsVersion(value=>value+1)}}/> Upload files</label>}{isAdmin&&user.role!=="superadmin"&&<label><input type="checkbox" checked={user.permissions?.includes("connect_providers")} onChange={event=>{const permissions=new Set(user.permissions||[]);event.target.checked?permissions.add("connect_providers"):permissions.delete("connect_providers");const next=registeredUsers.map(item=>item.email===user.email?{...item,permissions:[...permissions]}:item);localStorage.setItem("fcc-authorized-users",JSON.stringify(next));setSettingsVersion(value=>value+1)}}/> Connect providers</label>}</div>)}{isAdmin&&<button onClick={()=>setInvitePrompt({fromSettings:true})}>Invite/register user</button>}
</details>
      <details className="panel settings-card collapsible">
<summary>Automation & privacy</summary>
<label><input type="checkbox" defaultChecked/> Ask before applying exact or fuzzy matches</label><label><input type="checkbox" defaultChecked/> Proactively recommend category realignment</label><label><input type="checkbox" defaultChecked/> Keep transaction research local until I approve a web search</label><button onClick={()=>setRulesOpen(true)}>Review categorization rules</button><a href="/FCC_REQUEST_LOG.md" download>Download living request log</a>
</details>
    </section>}

    {activeView === "transactions" && <section className="panel table-panel">
      <div className="drilldown-heading"><div><h2>{drilldown ? `Transaction Explorer: ${drilldown.label}` : "Transaction Explorer"}</h2>
<p className="section-note">Search, analyze, annotate, and organize transactions without leaving this view.</p></div>{drilldown && <button className="clear-filter" onClick={()=>setDrilldown(null)}>Clear selection</button>}</div>
      <form className="ai-rule transaction-rule" onSubmit={handleCategoryRule}><Sparkles size={18}/><strong>Find & Assign</strong><textarea rows={rulePrompt.length>80?3:1} value={rulePrompt} onChange={(event)=>setRulePrompt(event.target.value)} placeholder="Example: Assign transactions containing ‘Avanti’ to Clothing" aria-label="Find and Assign rule"/><button disabled={busy || !rulePrompt.trim()} type="submit">Apply Rule</button><button className="link-button" type="button" onClick={()=>setRulesOpen(true)}>See rules ({rules.length})</button></form>
      <div className="advanced-filters"><input type="search" value={searchTerm} onChange={event=>setSearchTerm(event.target.value)} placeholder="Search description or financial provider…"/><select value={dateRange} onChange={event=>setDateRange(event.target.value)}><option value="all">All dates</option><option value="30d">Last 30 days</option><option value="month">This month</option><option value="quarter">This quarter</option><option value="year">This year</option><option value="custom">Custom range</option></select>{dateRange==="custom"&&<><input type="date" value={customStart} onChange={event=>setCustomStart(event.target.value)}/><input type="date" value={customEnd} onChange={event=>setCustomEnd(event.target.value)}/></>}<select value={entityFilter} onChange={event=>setEntityFilter(event.target.value)}><option value="all">All categories & projects</option>{sortedCategories.map(row=><option key={row.category} value={`category:${row.category}`}>Category: {row.category}</option>)}{sortedProjects.map(row=><option key={row.id} value={`project:${row.id}`}>Project: {row.name}</option>)}</select><button onClick={()=>setManualMode(value=>!value)} type="button">{manualMode?"Cancel manual assignment":"Assign manually"}</button>{manualMode&&<button className="save-button" type="button" disabled={(!Object.keys(draftCategories).length&&!Object.keys(draftProjects).length&&!Object.keys(secondaryDraft).length)||busy} onClick={saveManualAssignments}>Save {Object.keys(draftCategories).length+Object.keys(draftProjects).length+Object.keys(secondaryDraft).length||""} changes</button>}</div>
      <div className="transaction-controls"><div className="quick-filter-groups"><div><strong>Review status</strong><div className="filter-chips"><button className={!quickFilters.length&&entityFilter==="all"?"active":""} onClick={()=>{setQuickFilters([]);setEntityFilter("all");setChartParent("")}}>All</button>{[["uncategorized","Uncategorized"],["unbudgeted","Unbudgeted"],["outliers","Outliers"],["receipts","Has receipt"]].map(([value,label])=><button key={value} className={`${quickFilters.includes(value)?"active":""} ${value==="outliers"?"outlier-chip":""}`} onClick={()=>setQuickFilters(filters=>filters.includes(value)?filters.filter(item=>item!==value):[...filters,value])}>{label}</button>)}</div></div><div><strong>Tracking area</strong><div className="filter-chips"><button className={entityFilter==="project:"?"active":""} onClick={()=>setEntityFilter("project:")}>Household</button>{sortedProjects.map(project=><button key={project.id} className={entityFilter===`project:${project.id}`?"active":""} onClick={()=>setEntityFilter(`project:${project.id}`)}>{project.name}</button>)}</div></div></div><div className="result-toolbar"><div className="active-filter-list">{quickFilters.map(filter=><button key={filter} onClick={()=>setQuickFilters(items=>items.filter(item=>item!==filter))}>{filter} ×</button>)}{entityFilter!=="all"&&<button onClick={()=>{setEntityFilter("all");setChartParent("")}}>{entityFilter.split(":")[1]||"Household"} ×</button>}</div><strong>{filteredTransactions.length} matching</strong><div className="column-picker"><button onClick={()=>setColumnMenuOpen(value=>!value)}><Columns3 size={15}/> Columns</button>{columnMenuOpen&&<div>{Object.entries({date:"Date",description:"Description",impact:"Spend impact",category:"Primary category",secondary:"Secondary tags",classification:"Classification",tracking:"Tracking area",note:"Note",provider:"Financial provider"}).map(([key,label])=><label key={key}><input type="checkbox" checked={visibleColumns[key]} onChange={event=>setVisibleColumns(columns=>({...columns,[key]:event.target.checked}))}/>{label}</label>)}</div>}</div><label className="row-limit">Rows<select value={rowLimit} onChange={(event)=>setRowLimit(event.target.value)}><option value="25">25</option><option value="50">50</option><option value="100">100</option><option value="250">250</option><option value="all">All</option></select></label></div></div>
      {drilldown?.type==="attention"&&overBudgetChartData.length>0&&<div className="filtered-chart"><h3>Categories over budget</h3><ResponsiveContainer width="100%" height={260}><ComposedChart data={overBudgetChartData}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="category"/><YAxis/><Tooltip formatter={value=>money(value)}/><Legend/><Bar dataKey="actual" name="Actual spending" fill="#e05252"/><Line dataKey="budget" name="Budgeted amount" stroke="#315bce" strokeWidth={3}/></ComposedChart></ResponsiveContainer></div>}
      <div className="filter-chips secondary"><button onClick={()=>openDrilldown("classification","expense","Expenses")}>Expenses</button><button onClick={()=>openDrilldown("classification","transfer","Transfers")}>Transfers</button><button onClick={()=>openDrilldown("classification","income","Income / paychecks")}>Income</button><button onClick={()=>openDrilldown("classification","return","Returns")}>Returns</button><button onClick={()=>openDrilldown("classification","reimbursement","Reimbursements")}>Reimbursements</button>{[...new Set(transactions.map((row)=>row.source_account).filter(Boolean))].map((source)=><button key={source} onClick={()=>openDrilldown("source",source,source)}>{source}</button>)}</div>
      {filteredTrend.length>0&&<div className="filtered-chart"><div className="chart-heading"><h3>{chartParent?`${chartParent} subcategories`:"Spending trend by category"}</h3>{chartParent&&<button onClick={()=>{setChartParent("");setEntityFilter("all")}}>Back to categories</button>}</div><p>Click a stacked section to filter the transactions and drill from categories into subcategories.</p><ResponsiveContainer width="100%" height={240}><BarChart data={filteredTrend}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="month"/><YAxis/><Tooltip formatter={value=>money(value)}/><Legend/>{filteredTrendCategories.map((category,index)=>
<Bar className="clickable-chart-section" onClick={()=>{if(chartParent){setEntityFilter(`category:${category}`)}else{setChartParent(category);setEntityFilter(`parent:${category}`)}}} key={category} dataKey={category} stackId="spending" fill={chartColor(index)}/>)}</BarChart></ResponsiveContainer></div>}
      <div className="table-scroll"><table><thead><tr>{visibleColumns.date&&<th onClick={()=>toggleSort("date")}>Date{sortMark("date")}</th>}{visibleColumns.description&&<th onClick={()=>toggleSort("description")}>Description{sortMark("description")}</th>}{visibleColumns.impact&&<th onClick={()=>toggleSort("impact")}>Spend impact{sortMark("impact")}</th>}{visibleColumns.category&&<th>Primary category</th>}{visibleColumns.secondary&&<th>Secondary tags</th>}{visibleColumns.classification&&<th>Transaction type</th>}{visibleColumns.tracking&&<th>Tracking area</th>}{visibleColumns.note&&<th>Note</th>}{visibleColumns.provider&&<th onClick={()=>toggleSort("source_account")}>Financial provider{sortMark("source_account")}</th>}</tr></thead><tbody>{visibleTransactions.map((transaction,index)=>{const category=transaction.budget_category||transaction.major_category||"";const classification=transaction.manual_classification||(transaction.is_transfer?"transfer":transaction.is_income?"income":"expense");const impactTone=transaction.is_transfer?"transfer":transaction.is_income?"deposit":"expense";const movingOut=classification==="expense"||(classification==="transfer"&&transactionSpendImpact(transaction)>0);return <tr onClick={()=>setActiveTransactionId(transaction.id)} onFocusCapture={()=>setActiveTransactionId(transaction.id)} className={`${outlierIds.has(transaction.id)?"outlier-row":""} ${activeTransactionId===transaction.id?"active-row":""}`} key={transaction.id||`${transaction.date}-${index}`}>{visibleColumns.date&&<td>{transaction.date}</td>}
{visibleColumns.description&&<td>{transaction.description}{!transaction.budget_category&&<sup><button className="research-help" title="Research description" onClick={()=>setResearchTransaction(transaction)}>?</button></sup>}{transaction.reconciliation_match_id&&<button className="reconciled-badge" title="View the corresponding transfer entry" onClick={()=>openDrilldown("ids",transactions.filter(row=>row.reconciliation_match_id===transaction.reconciliation_match_id).map(row=>row.id),"Reconciled transfer pair")}>↔ Reconciled with {transactions.find(row=>row.id!==transaction.id&&row.reconciliation_match_id===transaction.reconciliation_match_id)?.source_account||"another provider"}</button>}{outlierIds.has(transaction.id)&&<button className={`rolling-toggle ${transaction.exclude_from_rolling_average?"excluded":""}`} onClick={async()=>{const excluding=!transaction.exclude_from_rolling_average;if(!window.confirm(`${excluding?"Exclude":"Include"} this outlier ${excluding?"from":"in"} rolling-average calculations?`))return;await updateTransaction(transaction.id,{exclude_from_rolling_average:excluding});await refresh();setMessage(excluding?"Outlier excluded from rolling averages.":"Outlier restored to rolling averages.")}}>{transaction.exclude_from_rolling_average?"Include in average":"Exclude from average"}</button>}</td>}
{visibleColumns.impact&&<td className={`impact-${impactTone}`}>{money(movingOut?-Math.abs(transactionSpendImpact(transaction)):Math.abs(transactionSpendImpact(transaction)))}</td>}
{visibleColumns.category&&<td><div className="category-cell"><select className="category-select"
 disabled={busy}
 value={draftCategories[transaction.id]??transaction.budget_category??""} onChange={async event=>{
if(event.target.value==="__new__"){setCategoryCreator({transaction});setNewCategoryName("");setNewCategoryParent(Object.keys(budgetGroups).sort()[0]||"__new__");setNewParentName("");return}manualMode?setDraftCategories(current=>({...current,[transaction.id]:event.target.value})):assignCategory(transaction,event.target.value)}}><option value="">Automatic / unassigned</option>{Object.entries(budgetGroups).sort(([a],[b])=>a.localeCompare(b)).map(([parent,rows])=><optgroup label={parent} key={parent}>{[...rows].sort((a,b)=>a.category.localeCompare(b.category)).map(row=><option value={row.category} key={`${parent}-${row.category}`}>{row.category}</option>)}</optgroup>)}<option value="__new__">＋ Create new budget category</option></select>{category&&<button className="only-this" onClick={()=>setEntityFilter(`category:${category}`)}>Only this</button>}</div></td>}
{visibleColumns.secondary&&<td><div className="tag-multiselect"><input type="search" value={tagSearch} onChange={event=>setTagSearch(event.target.value)} placeholder="Search tags…"/><select multiple className="secondary-category" value={secondaryDraft[transaction.id]??transaction.secondary_categories??[]} onChange={event=>setSecondaryDraft(current=>({...current,[transaction.id]:[...event.target.selectedOptions].map(option=>option.value)}))}>{tags.filter(tag=>tag.toLowerCase().includes(tagSearch.toLowerCase())).map(tag=><option key={tag} value={tag}>{tag}</option>)}</select><button type="button" onClick={async()=>{const name=window.prompt("New secondary tag");if(name){await createTag({name});await refresh();setSecondaryDraft(current=>({...current,[transaction.id]:[...new Set([...(current[transaction.id]||transaction.secondary_categories||[]),name])]}))}}}>＋ Create tag</button></div></td>}
{visibleColumns.classification&&<td><select value={classification} onChange={async event=>{if(!window.confirm(`Change this transaction to ${event.target.value}?`))return;await updateTransaction(transaction.id,{classification:event.target.value});await refresh();setMessage("Transaction type saved.")}}><option value="expense">Expense</option><option value="income">Income / paycheck</option><option value="return">Return</option><option value="reimbursement">Reimbursement</option><option value="transfer">Transfer</option></select></td>}
{visibleColumns.tracking&&<td><select className="project-select" disabled={busy} value={transaction.portfolio_item_id?`asset:${transaction.portfolio_item_id}`:(draftProjects[transaction.id]??transaction.project_id??"")} onChange={async event=>{if(event.target.value.startsWith("asset:")){if(!window.confirm("Relate this transaction to the selected portfolio item?"))return;await updateTransaction(transaction.id,{portfolio_item_id:event.target.value.slice(6),project_id:""});await refresh();setMessage("Portfolio relationship saved.");return}manualMode?setDraftProjects(current=>({...current,[transaction.id]:event.target.value})):handleProjectAssignment(transaction,event.target.value)}}><option value="">Household</option><optgroup label="Projects">{sortedProjects.map(project=><option value={project.id} key={project.id}>{project.name}</option>)}</optgroup><optgroup label="Portfolio items">{planning.assets?.map(asset=><option value={`asset:${asset.id}`} key={asset.id}>{asset.name}</option>)}</optgroup></select></td>}
{visibleColumns.note&&<td><button className="note-link" onClick={()=>{setNoteTransaction(transaction);setNoteText(transaction.user_note||"");setNoteMentions(transaction.note_mentions||[])}}>{transaction.user_note?"View note":"Add note"}</button></td>}
{visibleColumns.provider&&<td><button className="table-filter" onClick={()=>openDrilldown("source",transaction.source_account,transaction.source_account)}>{transaction.source_account}</button></td>}
</tr>})}</tbody></table></div>
    </section>}
    {categoryCreator&&<div className="modal-backdrop" role="dialog" aria-modal="true"><form className="dialog-card" onSubmit={saveCreatedCategory}><h2>Create a budget category</h2><label>Subcategory name<input autoFocus value={newCategoryName} onChange={event=>setNewCategoryName(event.target.value)} required placeholder="New subcategory"/></label>{categorySuggestions.length>0&&<div className="category-suggestions"><strong>Potential existing matches</strong>{categorySuggestions.map(row=><button type="button" key={row.category} onClick={()=>{setCategoryCreator(null);if(manualMode)setDraftCategories(current=>({...current,[categoryCreator.transaction.id]:row.category}));else assignCategory(categoryCreator.transaction,row.category)}}>{row.category}<small>{row.parent_category}</small></button>)}</div>}<label>Parent category<select value={newCategoryParent} onChange={event=>setNewCategoryParent(event.target.value)} required>{Object.keys(budgetGroups).sort().map(parent=><option key={parent} value={parent}>{parent}</option>)}<option value="__new__">＋ Create a new parent category</option></select></label>{newCategoryParent==="__new__"&&<label>New parent category<input value={newParentName} onChange={event=>setNewParentName(event.target.value)} required placeholder="Parent category name"/></label>}<div className="dialog-actions"><button type="submit">Create and assign</button><button type="button" className="secondary" onClick={()=>setCategoryCreator(null)}>Cancel</button></div></form></div>}
    {matchReview&&<div className="modal-backdrop" role="dialog" aria-modal="true"><div className="dialog-card wide"><h2>Confirm similar transactions</h2><p>Description relevance is weighted more heavily than amount. Choose each transaction to categorize as <strong>{matchReview.category}</strong>.</p><div className="match-tools"><input value={matchSearch} onChange={event=>setMatchSearch(event.target.value)} placeholder="Filter description"/><input type="number" value={matchMin} onChange={event=>setMatchMin(event.target.value)} placeholder="Min amount"/><input type="number" value={matchMax} onChange={event=>setMatchMax(event.target.value)} placeholder="Max amount"/><input type="date" value={matchStart} onChange={event=>setMatchStart(event.target.value)}/><input type="date" value={matchEnd} onChange={event=>setMatchEnd(event.target.value)}/><select value={matchSort} onChange={event=>setMatchSort(event.target.value)}><option value="relevance">Relevance</option><option value="date">Newest date</option><option value="amount">Largest amount</option></select></div><button className="secondary" onClick={()=>setSelectedMatchIds(matchRows.map(row=>row.id))}>Select all {matchRows.length}</button><label>Secondary tags<select multiple value={matchSecondary} onChange={event=>setMatchSecondary([...event.target.selectedOptions].map(option=>option.value))}>{sortedCategories.map(row=><option key={row.category} value={row.category}>{row.category}</option>)}</select></label><div className="match-list">{matchRows.map(row=><label key={row.id}><input type="checkbox" checked={selectedMatchIds.includes(row.id)} onChange={event=>setSelectedMatchIds(ids=>event.target.checked?[...new Set([...ids,row.id])]:ids.filter(id=>id!==row.id))}/><span><strong>{row.description}</strong><small>{row.date} · {money(row.amount)} · {row.match_type} match ({Math.round((row.relevance??row.confidence)*100)}%)</small></span></label>)}</div><label className="always-rule"><input type="checkbox" checked={alwaysApply} onChange={event=>setAlwaysApply(event.target.checked)}/> Always apply this rule automatically; otherwise ask me again next time.</label><div className="dialog-actions"><button disabled={!selectedMatchIds.length||busy} onClick={confirmMatches}>Save {selectedMatchIds.length} assignments</button><button className="secondary" onClick={()=>setMatchReview(null)}>Cancel</button></div></div></div>}
    {noteTransaction&&<div className="modal-backdrop" role="dialog" aria-modal="true"><div className="dialog-card"><h2>{noteTransaction.user_note?"Transaction note":"Add a transaction note"}</h2><p><strong>{noteTransaction.description}</strong><br/>{noteTransaction.date} · {money(noteTransaction.amount)}</p><textarea autoFocus rows="6" value={noteText} onChange={event=>setNoteText(event.target.value)} placeholder="Add context, a reminder, or a question…"/><label>Tag people<select multiple value={noteMentions} onChange={event=>{const values=Array.from(event.target.selectedOptions,option=>option.value);if(values.includes("__invite__")){setInvitePrompt({forNote:true});return}setNoteMentions(values)}}>{registeredUsers.map(user=><option key={user.email} value={user.email}>{user.name} ({user.email})</option>)}<option value="__invite__">＋ Tag an unregistered person</option></select></label><div className="dialog-actions"><button onClick={saveNote}>Save note</button><button className="secondary" onClick={()=>setNoteTransaction(null)}>Cancel</button></div></div></div>}
    {invitePrompt&&<div className="modal-backdrop nested" role="dialog" aria-modal="true"><form className="dialog-card" onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);const invite={name:form.get("name"),email:form.get("email"),role:form.get("role"),permissions:[]};sessionStorage.setItem("fcc-invite",JSON.stringify(invite));if(invitePrompt.forNote)setNoteMentions(values=>[...new Set([...values,invite.email])]);setInvitePrompt(null);setMessage(`${invite.name} is tagged and has a pending ${invite.role} registration.`)}}><h2>Invite a new person</h2><p>Enter the required registration details and least-privilege access level.</p><input name="name" required placeholder="Full name"/><input name="email" required type="email" placeholder="Email address"/><select name="role"><option value="viewer">Viewer — read only</option><option value="contributor">Contributor — notes and tags</option><option value="analyst">Analyst — categorize and report</option>{isAdmin&&<option value="admin">Admin — users and configuration</option>}</select><div className="dialog-actions"><button>Save invitation</button><button type="button" className="secondary" onClick={()=>setInvitePrompt(null)}>Cancel</button></div></form></div>}
    {rulesOpen&&<div className="modal-backdrop" role="dialog" aria-modal="true"><div className="dialog-card"><h2>Find & Assign rules</h2>{rules.length?rules.map(rule=><div className="rule-row" key={rule.merchant}><span><strong>{rule.merchant}</strong><small>{rule.parent_category} → {rule.category}</small></span><button onClick={async()=>{if(!window.confirm(`Delete the rule for ${rule.merchant}?`))return;await deleteCategoryRule(rule.merchant);await refresh();setMessage("Rule deleted.")}}>Delete</button></div>):<p>No saved rules yet.</p>}<div className="dialog-actions"><button onClick={()=>setRulesOpen(false)}>Done</button></div></div></div>}
    {researchTransaction&&<div className="modal-backdrop" role="dialog" aria-modal="true"><div className="dialog-card"><h2>Help identify this transaction</h2><p><strong>{researchTransaction.description}</strong></p><p className="privacy-warning">Only the sanitized description keywords below will be shared—never the amount, account, or provider.</p><code>{safeResearchTerms(researchTransaction)} merchant</code><select value={searchProvider} onChange={event=>setSearchProvider(event.target.value)}><option value="">Choose a search provider</option><option value="google">Google</option><option value="bing">Bing</option><option value="duckduckgo">DuckDuckGo</option></select><div className="dialog-actions"><button onClick={async()=>{await navigator.clipboard.writeText(`${safeResearchTerms(researchTransaction)} merchant`);setMessage("Lookup copied to clipboard.")}}>Copy lookup</button><button disabled={!searchProvider} onClick={()=>{const terms=`${safeResearchTerms(researchTransaction)} merchant`;if(!window.confirm(`Approve sharing only “${terms}” with ${searchProvider}?`))return;const bases={google:"https://www.google.com/search?q=",bing:"https://www.bing.com/search?q=",duckduckgo:"https://duckduckgo.com/?q="};window.open(`${bases[searchProvider]}${encodeURIComponent(terms)}`,"_blank","noopener,noreferrer");setMessage("Approved web search opened in your browser.")}}>Approve & search</button><button className="secondary" onClick={()=>setResearchTransaction(null)}>Close</button></div></div></div>}
    {receiptReview&&<div className="modal-backdrop" role="dialog" aria-modal="true"><div className="dialog-card"><h2>Confirm receipt match</h2><p>Best match: <strong>{receiptReview.merchant||"Unknown merchant"}</strong>. Suggested category: <strong>{receiptReview.suggested_category||"Needs review"}</strong>.</p><p>{receiptReview.matched_transaction_id?"A matching transaction was found.":`${receiptReview.match_candidates?.length||0} possible transactions were found.`}</p><div className="dialog-actions"><button onClick={async()=>{const id=receiptReview.matched_transaction_id||receiptReview.match_candidates?.[0]?.transaction_id;if(id&&receiptReview.suggested_category){const budgetRow=categories.find(row=>row.category===receiptReview.suggested_category);await updateTransactionCategory(id,receiptReview.suggested_category,budgetRow?.parent_category||"")};setReceiptReview(null);await refresh();setMessage("Receipt match and category confirmed.")}}>Confirm match</button><button className="secondary" onClick={()=>setReceiptReview(null)}>Review later</button></div></div></div>}
    {resetPrompt&&<div className="modal-backdrop" role="dialog" aria-modal="true"><div className="dialog-card"><h2>Start over?</h2><p>Select exactly what FCC should reset. This cannot be undone.</p><div className="reset-list">{Object.entries({transactions:"Imported transactions",budget:"Budget",categorization:"Categorization",projects:"Transaction tracking assignments",project_definitions:"Projects and project accounts",notes:"Transaction notes",portfolio:"Portfolio",goals:"Goals",rules:"Find & Assign rules"}).map(([key,label])=><label key={key}><input type="checkbox" checked={resetSelections[key]} onChange={event=>setResetSelections(current=>({...current,[key]:event.target.checked}))}/>{label}</label>)}</div><div className="dialog-actions"><button className="danger-button" onClick={confirmReset}>Reset selected areas</button><button className="secondary" onClick={()=>setResetPrompt(false)}>Cancel</button></div></div></div>}
    {goalPrompt&&<div className="modal-backdrop" role="dialog" aria-modal="true"><div className="goal-dialog"><Sparkles size={28}/><h2>You’re all done. Ready to set some goals?</h2><p>Your transactions are categorized. FCC can recommend a practical starting set based on cash flow, debt, savings, and planned investments.</p><div><button onClick={()=>{setGoalPrompt(false);setActiveView("dashboard");setPlanningTab("goals")}}>Help me decide</button><button className="secondary" onClick={()=>setGoalPrompt(false)}>Not now</button></div></div></div>}
  </main>;
}

function App() {
  const params = new URLSearchParams(window.location.search);
  return params.get("workspace") === "1" ? <ExistingWorkspace /> : <DemoApp />;
}

createRoot(document.getElementById("root")).render(<App />);
