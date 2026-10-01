"use client";

import { useRef, useState, type FormEvent } from "react";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import { validateDataset } from "@/domain/validation";
import type { AnalysisFilters, Dataset, DatasetInput, SourceRef, ValidationIssue } from "@/domain/types";
import { EvidenceDrawer, type EvidenceSelection } from "./evidence-drawer";
import { Overview } from "./overview";
import { DataWorkspace, Diagnosis, Products } from "./workspace-panels";
import { AiPanel } from "./ai-panel";
import { IssueList } from "./issue-list";
import { ImportPanel } from "./import-panel";
import type { PreparedImport } from "@/application/import";
import { downloadText } from "@/application/download";
import { exportSnapshotCsv } from "@/application/export";
import { AnalysisChannelLimitError, AnalysisPeriodLimitError } from "@/application/limits";
import { DecisionWorkbench } from "./decision-workbench";

type Panel = "overview" | "diagnosis" | "products" | "data" | "scenarios" | "actions";
type Status = "empty" | "loading" | "error" | "partial" | "ready";
type Active = { dataset: Dataset; snapshot: WorkspaceSnapshot; id: string; revision: number; filenames?: Partial<Record<SourceRef["file"], string>>; mappings?: Partial<Record<SourceRef["file"], Record<string, string>>> };
const panels: { id: Panel; label: string; description: string }[] = [
  { id: "overview", label: "經營總覽", description: "掌握營收、成本與行銷後貢獻的變化。" },
  { id: "diagnosis", label: "通路診斷", description: "從可核查的事實，找到下一個需要確認的問題。" },
  { id: "products", label: "商品毛利", description: "回到商品收入與已入帳成本，查看毛利明細。" },
  { id: "scenarios", label: "情境試算", description: "明示假設，從同一通路基準比較條件結果。" },
  { id: "actions", label: "行動摘要", description: "把證據、驗證方式與停止條件整理成可執行的工作稿。" },
  { id: "data", label: "資料工作區", description: "確認來源、口徑與完整性，再開始營運檢討。" },
];
const datasetLabels: Record<string, string> = {
  demo: "營運示範｜12 週合成資料", golden: "Golden｜小型對帳資料",
  "missing-cogs": "缺漏案例｜商品成本", "missing-ad": "缺漏案例｜廣告日期", duplicate: "錯誤案例｜重複銷售鍵",
};
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    diagnosis: "M4 19V9 M10 19V4 M16 19v-6 M22 19V7",
    products: "m3 7 9-4 9 4-9 4-9-4z M3 7v10l9 4 9-4V7 M12 11v10",
    data: "M4 4h16v16H4z M4 9h16 M9 4v16 M4 14h16",
    scenarios: "M4 4v16h16 M8 16l4-5 4 2 4-8",
    actions: "M8 5h12 M8 12h12 M8 19h12 M3 5h1 M3 12h1 M3 19h1",
    arrow: "M5 12h14 M13 6l6 6-6 6", lens: "M4 18V6h5v12 M13 18V3h6v15 M3 21h18",
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.data} /></svg>;
}
const afterPaint = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

export function Dashboard() {
  const [panel, setPanel] = useState<Panel>("overview");
  const [status, setStatus] = useState<Status>("empty");
  const [selected, setSelected] = useState("demo");
  const [showImport, setShowImport] = useState(false);
  const [active, setActive] = useState<Active | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [error, setError] = useState("");
  const [filterError, setFilterError] = useState("");
  const [evidence, setEvidence] = useState<EvidenceSelection | null>(null);
  const requestId = useRef(0);
  const revision = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const [dates, setDates] = useState({ previousStart: "", previousEnd: "", currentStart: "", currentEnd: "" });
  const currentPanel = panels.find(item => item.id === panel)!;

  async function load(id: string) {
    const ticket = ++requestId.current;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setShowImport(false); setSelected(id); setStatus("loading"); setError(""); setFilterError(""); setIssues([]); setEvidence(null);
    try {
      const response = await fetch(`/api/datasets/${encodeURIComponent(id)}`, { signal: abort.signal, cache: "no-store" });
      if (!response.ok) throw new Error("無法取得合成資料，請確認本機服務後重試。");
      const input: DatasetInput = await response.json();
      await afterPaint();
      if (ticket !== requestId.current) return;
      const validation = validateDataset(input);
      if (!validation.dataset) { setIssues(validation.issues); throw new Error("新資料未通過檢核。請查看問題清單，先前成功的資料仍保留。"); }
      const snapshot = await createSnapshot(validation.dataset, {}, await hashInput(input));
      if (ticket !== requestId.current) return;
      setActive({ dataset: validation.dataset, snapshot, id, revision: ++revision.current }); setIssues(validation.issues);
      setDates({ previousStart: snapshot.report.previous.period.start, previousEnd: snapshot.report.previous.period.end, currentStart: snapshot.report.current.period.start, currentEnd: snapshot.report.current.period.end });
      setStatus(validation.classification === "partial" ? "partial" : "ready"); setPanel("overview");
    } catch (caught) {
      if (ticket !== requestId.current || abort.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : "資料處理失敗，請重試。"); setStatus("error");
    }
  }
  function startImport() {
    requestId.current++; controller.current?.abort(); setEvidence(null); setError(""); setFilterError("");
    setStatus(active ? (active.dataset.issues.some(i => i.severity === "partial") ? "partial" : "ready") : "empty");
    setPanel("data"); setShowImport(true);
  }
  function cancelImport() {
    requestId.current++; controller.current?.abort(); setShowImport(false); setError("");
    setStatus(active ? (active.dataset.issues.some(i => i.severity === "partial") ? "partial" : "ready") : "empty");
  }
  async function commitImport(prepared: PreparedImport, manifestName?: string) {
    if (!prepared.input || !prepared.validation.dataset || prepared.validation.classification === "blocking") return;
    const ticket = ++requestId.current;
    controller.current?.abort(); setStatus("loading"); setEvidence(null); setError(""); setFilterError("");
    try {
      await afterPaint();
      const dataset = prepared.validation.dataset;
      const snapshot = await createSnapshot(dataset, {}, await hashInput(prepared.input));
      if (ticket !== requestId.current) return;
      setActive({ dataset, snapshot, id: `import-${snapshot.dataset_hash}`, revision: ++revision.current, mappings: prepared.columnMappings, filenames: { ...prepared.originalNames, ...(manifestName ? { "manifest.json": manifestName } : {}) } });
      setDates({ previousStart: snapshot.report.previous.period.start, previousEnd: snapshot.report.previous.period.end, currentStart: snapshot.report.current.period.start, currentEnd: snapshot.report.current.period.end });
      setIssues(prepared.validation.issues);
      setStatus(prepared.validation.classification === "partial" ? "partial" : "ready");
      setShowImport(false); setPanel("overview");
    } catch {
      if (ticket !== requestId.current) return;
      setError("匯入計算未完成，尚未取代先前資料。請重試或取消匯入。"); setStatus("error");
    }
  }
  async function applyFilters(filters: AnalysisFilters) {
    if (!active) return;
    const ticket = ++requestId.current;
    setFilterError(""); setEvidence(null); setStatus("loading");
    try {
      await afterPaint();
      const snapshot = await createSnapshot(active.dataset, filters, active.snapshot.dataset_hash);
      if (ticket !== requestId.current) return;
      setActive({ ...active, snapshot, revision: snapshot.filter_hash === active.snapshot.filter_hash ? active.revision : ++revision.current });
      setStatus(active.dataset.issues.some(i => i.severity === "partial") ? "partial" : "ready");
    } catch (caught) {
      if (ticket !== requestId.current) return;
      setFilterError(caught instanceof AnalysisPeriodLimitError || caught instanceof AnalysisChannelLimitError ? caught.message : "期間未套用：前後期須為有效日期、等長、不重疊，且落在資料涵蓋範圍內。目前仍顯示上次成功的範圍。");
      setStatus(active.dataset.issues.some(i => i.severity === "partial") ? "partial" : "ready");
    }
  }
  function submitDates(event: FormEvent) {
    event.preventDefault();
    if (active) void applyFilters({ channels: active.snapshot.report.scope.channels, previous_period: { start: dates.previousStart, end: dates.previousEnd }, current_period: { start: dates.currentStart, end: dates.currentEnd } });
  }
  function clear() {
    requestId.current++; controller.current?.abort(); setActive(null); setIssues([]); setEvidence(null);
    setStatus("empty"); setError(""); setFilterError(""); setShowImport(false);
  }
  const visible = active && (status === "ready" || status === "partial");
  const local = active?.dataset.manifest.source_type === "user_provided";

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">跳至主要內容</a>
    <aside className="sidebar">
      <a className="brand" href="#main-content"><span className="brand-mark"><Icon name="lens" size={24} /></span><span>ProfitLens<small>營運決策工作台</small></span></a>
      <div className="workspace-label">我的工作區 <span className="tiny-tag">{local ? "LOCAL" : "DEMO"}</span></div>
      <nav aria-label="主要導覽">{panels.map(item => <button key={item.id} className={`nav-item ${panel === item.id ? "active" : ""}`} aria-current={panel === item.id ? "page" : undefined} onClick={() => { setPanel(item.id); setEvidence(null); }}><Icon name={item.id} /><span>{item.label}</span>{panel === item.id && <span className="nav-dot" />}</button>)}</nav>
      <div className="sidebar-note"><span className="green-dot" /> {local ? "本機匯入資料" : "合成資料示範"}<p>{local ? "檔案只留在此分頁記憶體，不上傳伺服器。" : "資料只用於功能驗證，不代表真實商業成果。"}</p></div>
      <footer className="sidebar-footer">TWD · Asia/Taipei<small>contribution-v1</small></footer>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb">工作區 <span>/</span> <strong>{currentPanel.label}</strong></div><span className="mode-badge"><span className="green-dot" /> {local ? "本機資料模式" : "本機示範模式"}</span></header>
      <main id="main-content" tabIndex={-1}>
        <div className="page-heading"><div><p className="eyebrow">PROFITLENS / OPERATIONS</p><h1>{currentPanel.label}</h1><p className="subtitle">{currentPanel.description}</p></div><div className="load-controls"><label>資料集<select aria-label="資料集" value={selected} onChange={event => setSelected(event.target.value)}>{Object.entries(datasetLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><button className="button primary" onClick={() => void load(selected)}>載入資料集 <Icon name="arrow" size={16} /></button><button className="button quiet" onClick={startImport}>匯入標準 CSV</button></div></div>
        <div className="status-line" role="status" aria-live="polite" data-testid="workspace-status"><span className={`status-dot ${status}`} />{({ empty: "尚未載入資料", loading: "正在載入與計算…", error: "資料載入失敗", partial: "部分資料待補", ready: "資料已就緒" })[status]}{active && status !== "empty" && <span className="muted">{datasetLabels[active.id] ?? active.dataset.manifest.dataset_id} · 資料截至 {active.dataset.manifest.data_as_of}</span>}<button className="text-button clear-button" onClick={clear}>清空工作區</button></div>
        {showImport && <div hidden={panel !== "data"}><ImportPanel onCommit={commitImport} onCancel={cancelImport} busy={status === "loading"} /></div>}
        {visible && <>
          <div className="filter-bar">
            <label className="channel-field">通路<select aria-label="通路" value={active.snapshot.report.scope.channels.length > 1 ? "" : active.snapshot.report.scope.channels[0]} onChange={event => void applyFilters({ ...active.snapshot.report.scope, channels: event.target.value === "" ? active.dataset.manifest.channels : [event.target.value] })}><option value="">全部通路</option>{active.dataset.manifest.channels.map(channel => <option key={channel}>{channel}</option>)}</select></label>
            <form className="period-form" onSubmit={submitDates}>
              <fieldset><legend>前期</legend><label className="sr-only" htmlFor="previous-start">前期開始</label><input id="previous-start" type="date" required value={dates.previousStart} onChange={e => setDates({ ...dates, previousStart: e.target.value })} /><span>—</span><label className="sr-only" htmlFor="previous-end">前期結束</label><input id="previous-end" type="date" required value={dates.previousEnd} onChange={e => setDates({ ...dates, previousEnd: e.target.value })} /></fieldset>
              <fieldset><legend>本期</legend><label className="sr-only" htmlFor="current-start">本期開始</label><input id="current-start" type="date" required value={dates.currentStart} onChange={e => setDates({ ...dates, currentStart: e.target.value })} /><span>—</span><label className="sr-only" htmlFor="current-end">本期結束</label><input id="current-end" type="date" required value={dates.currentEnd} onChange={e => setDates({ ...dates, currentEnd: e.target.value })} /></fieldset>
              <button className="button quiet" type="submit">套用期間</button>
            </form>
          </div>
          {filterError && <p role="alert" className="alert error">{filterError}</p>}
          {status === "partial" && <div className="alert partial"><strong>部分資料待補</strong><span>受影響指標保留未知；不以零代替缺漏。</span><button className="text-button" onClick={() => setPanel("data")}>查看 {active.dataset.issues.length} 項來源問題 →</button></div>}
          <p className="scope-note">目前範圍：{active.snapshot.report.scope.channels.join("、")} · 前期 {active.snapshot.report.previous.period.start} — {active.snapshot.report.previous.period.end} · 本期 {active.snapshot.report.current.period.start} — {active.snapshot.report.current.period.end}</p>
        </>}
        {status === "empty" && !showImport && <section className="empty-state"><div className="empty-illustration"><Icon name="lens" size={56} /></div><p className="eyebrow">從一份完整的資料開始</p><h2>看清營收背後的貢獻</h2><p>載入銷售、通路費用與廣告的合成資料，<br />從整體變化一路追溯到每筆來源。</p><button className="button primary large" onClick={() => void load("demo")}>載入示範資料 <Icon name="arrow" size={18} /></button><div className="empty-steps"><span>01　確認資料</span><span>02　查看貢獻</span><span>03　追溯變化</span></div></section>}
        {status === "loading" && <section className="loading-state" aria-busy="true"><div className="spinner" /><h2>正在檢核資料與計算指標</h2><p>銷售先彙總，再合併通路費用與廣告。請稍候。</p><div className="skeleton-grid">{[0, 1, 2, 3].map(i => <div className="skeleton" key={i} />)}</div></section>}
        {status === "error" && <section className="error-state"><span className="error-icon">!</span><h2>資料載入失敗</h2><p role="alert">{error}</p><div className="button-row"><button className="button primary" onClick={() => void load(selected)}>重新載入</button>{active && <button className="button quiet" onClick={() => { setStatus(active.dataset.issues.some(i => i.severity === "partial") ? "partial" : "ready"); setIssues(active.dataset.issues); }}>返回前次成功資料</button>}</div>{issues.length > 0 && <IssueList issues={issues} />}</section>}
        {visible && <div key={active.id} className="view-content">{!["products", "scenarios", "actions"].includes(panel) && <div className="export-actions"><button className="button quiet" onClick={() => downloadText(exportSnapshotCsv(active.dataset, active.snapshot, active.filenames), "profitlens-analysis.csv")}>下載目前分析 CSV</button><button className="text-button" onClick={() => downloadText(JSON.stringify(active.dataset.manifest, null, 2), "profitlens-manifest.json", "application/json;charset=utf-8")}>下載資料集設定 JSON</button><span className="note">依目前期間與通路匯出；不含原始 CSV。</span></div>}{panel === "overview" && <Overview snapshot={active.snapshot} onEvidence={setEvidence} />}{panel === "diagnosis" && <><Diagnosis snapshot={active.snapshot} onEvidence={setEvidence} /><AiPanel snapshot={active.snapshot} revision={active.revision} onEvidence={setEvidence} /></>}{panel === "products" && <Products dataset={active.dataset} snapshot={active.snapshot} onEvidence={setEvidence} filenames={active.filenames} />}{panel === "data" && <DataWorkspace dataset={active.dataset} snapshot={active.snapshot} filenames={active.filenames} mappings={active.mappings} />}</div>}
        {active && <div hidden={!visible || !["scenarios", "actions"].includes(panel)}><DecisionWorkbench dataset={active.dataset} snapshot={active.snapshot} revision={active.revision} filenames={active.filenames} view={panel === "actions" ? "actions" : "scenarios"} onEvidence={setEvidence} /></div>}
        <footer className="main-footer"><p>行銷後貢獻不等於公司淨利，不含未輸入的固定費與所得稅。</p><p>{local ? "本機記憶體資料" : "合成資料"} · 重新整理會清空工作區 · AI 僅在預覽同意後選配使用</p></footer>
      </main>
    </div>
    {active && <EvidenceDrawer dataset={active.dataset} filenames={active.filenames} mappings={active.mappings} evidence={evidence} onClose={() => setEvidence(null)} />}
  </div>;
}
