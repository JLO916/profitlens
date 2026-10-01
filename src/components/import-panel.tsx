"use client";

import { useEffect, useRef, useState } from "react";
import { importColumns, inspectImportFile, inspectManifestFile, prepareImport, type ImportFileDraft, type PreparedImport } from "@/application/import";
import { downloadText } from "@/application/download";
import { exportIssuesCsv } from "@/application/export";
import { MAX_CSV_BYTES } from "@/lib/csv";
import { ANALYSIS_CHANNEL_LIMIT_MESSAGE, ANALYSIS_PERIOD_LIMIT_MESSAGE } from "@/application/limits";
import type { FileName, ValidationIssue } from "@/domain/types";
import { IssueList } from "./issue-list";

const fileLabels: Record<FileName, string> = {
  "sales_daily.csv": "商品銷售 CSV",
  "channel_costs_daily.csv": "通路費用 CSV",
  "ad_spend_daily.csv": "廣告支出 CSV",
};
const blankSettings = {
  dataset_id: "", data_as_of: "", coverage_start: "", coverage_end: "",
  previous_start: "", previous_end: "", current_start: "", current_end: "", channels: "",
  sales_coverage_confirmed: false,
};
type Settings = typeof blankSettings;
const dateFields: { key: keyof Pick<Settings, "data_as_of" | "coverage_start" | "coverage_end" | "previous_start" | "previous_end" | "current_start" | "current_end">; label: string }[] = [
  { key: "data_as_of", label: "資料截至日" }, { key: "coverage_start", label: "涵蓋開始" }, { key: "coverage_end", label: "涵蓋結束" },
  { key: "previous_start", label: "匯入前期開始" }, { key: "previous_end", label: "匯入前期結束" },
  { key: "current_start", label: "匯入本期開始" }, { key: "current_end", label: "匯入本期結束" },
];

export function ImportPanel({ onCommit, onCancel, busy }: {
  onCommit: (prepared: PreparedImport, manifestName?: string) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
}) {
  const [settings, setSettings] = useState<Settings>(blankSettings);
  const [basisConfirmed, setBasisConfirmed] = useState(false);
  const [drafts, setDrafts] = useState<Partial<Record<FileName, ImportFileDraft>>>({});
  const [fileIssues, setFileIssues] = useState<Partial<Record<FileName | "manifest.json", ValidationIssue[]>>>({});
  const [reading, setReading] = useState<Record<string, boolean>>({});
  const [candidate, setCandidate] = useState<PreparedImport | null>(null);
  const [checking, setChecking] = useState(false);
  const [manifestName, setManifestName] = useState<string>();
  const [originalNames, setOriginalNames] = useState<Partial<Record<FileName | "manifest.json", string>>>({});
  const sequence = useRef<Record<string, number>>({});
  const generation = useRef(0);
  const settingsRevision = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  function invalidate() { generation.current++; setCandidate(null); }
  function changeSetting(key: keyof Settings, value: string | boolean) {
    settingsRevision.current++;
    invalidate(); setSettings(previous => ({ ...previous, [key]: value }));
  }
  async function read(file: File | undefined, role: FileName | "manifest.json") {
    const ticket = (sequence.current[role] ?? 0) + 1;
    sequence.current[role] = ticket;
    const settingsTicket = settingsRevision.current;
    invalidate();
    setOriginalNames(previous => ({ ...previous, [role]: file?.name }));
    setReading(previous => ({ ...previous, [role]: false }));
    setFileIssues(previous => ({ ...previous, [role]: [] }));
    if (role !== "manifest.json") setDrafts(previous => { const next = { ...previous }; delete next[role]; return next; });
    else { setManifestName(undefined); setBasisConfirmed(false); }
    if (!file) return;
    setReading(previous => ({ ...previous, [role]: true }));
    try {
      // Reject before allocating the file body; the parser checks the bytes again.
      if (file.size > MAX_CSV_BYTES) throw new Error("檔案超過 5 MiB，請縮小來源資料；不會截斷或取代先前資料。");
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!mounted.current || sequence.current[role] !== ticket) return;
      if (role === "manifest.json") {
        if (settingsRevision.current !== settingsTicket) { setOriginalNames(previous => ({ ...previous, "manifest.json": undefined })); return; }
        const result = inspectManifestFile({ name: file.name, size: file.size, bytes });
        // Nonblocking completeness is evaluated from the editable form at check
        // time. A prefill warning must not become a stale blocking file error.
        setFileIssues(previous => ({ ...previous, [role]: result.issues.filter(issue => issue.severity === "blocking") }));
        if (result.manifest) {
          const manifest = result.manifest;
          const previous = manifest.previous_period as { start: string; end: string };
          const current = manifest.current_period as { start: string; end: string };
          setSettings({ dataset_id: String(manifest.dataset_id), data_as_of: String(manifest.data_as_of), coverage_start: String(manifest.coverage_start), coverage_end: String(manifest.coverage_end), previous_start: previous.start, previous_end: previous.end, current_start: current.start, current_end: current.end, channels: (manifest.channels as string[]).join("\n"), sales_coverage_confirmed: manifest.sales_coverage_confirmed === true });
          setManifestName(file.name);
          setBasisConfirmed(false);
        }
      } else {
        const draft = inspectImportFile(role, { name: file.name, size: file.size, bytes });
        setDrafts(previous => ({ ...previous, [role]: draft }));
      }
    } catch (error) {
      if (!mounted.current || sequence.current[role] !== ticket) return;
      setFileIssues(previous => ({ ...previous, [role]: [{ file: role, field: "$file", line: null, severity: "blocking", reason_code: file.size > MAX_CSV_BYTES ? "FILE_TOO_LARGE" : "FILE_READ_FAILED", message: error instanceof Error ? error.message : "無法讀取檔案，請重新選擇。" }] }));
    } finally {
      if (mounted.current && sequence.current[role] === ticket) setReading(previous => ({ ...previous, [role]: false }));
    }
  }
  function updateDraft(role: FileName, patch: Partial<ImportFileDraft>) {
    invalidate(); setDrafts(previous => ({ ...previous, [role]: { ...previous[role]!, ...patch } }));
  }
  const readIssues = Object.values(fileIssues).flatMap(value => value ?? []);
  const busyReading = Object.values(reading).some(Boolean);
  const sourceNames = originalNames;
  async function check() {
    const ticket = ++generation.current;
    setCandidate(null); setChecking(true);
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    if (!mounted.current) return;
    if (ticket !== generation.current) { setChecking(false); return; }
    const manifest = {
      schema_version: "1.0", source_type: "user_provided", currency: "TWD", timezone: "Asia/Taipei",
      dataset_id: settings.dataset_id, data_as_of: settings.data_as_of,
      coverage_start: settings.coverage_start, coverage_end: settings.coverage_end,
      previous_period: { start: settings.previous_start, end: settings.previous_end },
      current_period: { start: settings.current_start, end: settings.current_end },
      channels: settings.channels.split(/\r?\n/).map(value => value.trim()).filter(Boolean),
      sales_coverage_confirmed: settings.sales_coverage_confirmed,
      amount_basis: "product_amounts_excluding_tax_and_customer_shipping_income",
    };
    const prepared = prepareImport(manifest, drafts, { amountBasisConfirmed: basisConfirmed });
    if (readIssues.length) {
      prepared.input = null;
      prepared.validation = { ...prepared.validation, dataset: null, classification: "blocking", issues: [...readIssues, ...prepared.validation.issues] };
    }
    setCandidate(prepared); setChecking(false);
  }
  const issues = candidate?.validation.issues ?? [...readIssues, ...Object.values(drafts).flatMap(draft => draft.issues)];
  const statusText = checking || busyReading ? "正在讀取與檢核…" : candidate ? ({ valid: "檢核通過，可套用資料", partial: "部分資料待補，可套用已知範圍", blocking: "檢核未通過，未取代目前資料" })[candidate.validation.classification] : "匯入草稿，尚未提交";
  return <section className="panel import-panel" aria-labelledby="import-heading" data-testid="import-panel">
    <div className="section-heading"><div><p className="eyebrow">LOCAL DATA</p><h2 id="import-heading">匯入標準 CSV</h2><p className="note">檔案只在此分頁記憶體讀取與計算，不上傳伺服器。重新整理會清空資料與匯入草稿。</p></div><button className="button quiet" type="button" onClick={onCancel}>取消匯入</button></div>
    <p className="alert">請選擇已獲授權且不含客戶個資的三份資料。檢核通過後再套用；目前已成功載入的資料會保留。</p>
    <fieldset className="import-fields" disabled={busy || checking}>
      <legend className="sr-only">匯入檔案與資料集設定</legend>
      <h3>1. 選擇三份 CSV</h3><p className="note">UTF-8／UTF-8 BOM、逗號分隔，每份最多 5 MiB／50,000 筆。檔名可不同，請指定正確的資料角色；空白金額不是零。</p>
      <div className="import-files">{(Object.keys(fileLabels) as FileName[]).map(role => <label key={role}>{fileLabels[role]}<input aria-label={fileLabels[role]} type="file" accept=".csv,text/csv" onChange={event => void read(event.target.files?.[0], role)} /><small>{role}{reading[role] ? " · 讀取中" : ""}</small></label>)}</div>
      <h3>2. 設定資料範圍與金額口徑</h3>
      <label>讀取 manifest JSON<input aria-label="讀取 manifest JSON" type="file" accept=".json,application/json" onChange={event => void read(event.target.files?.[0], "manifest.json")} /><small>選填；會帶入下列表單供核對，金額口徑仍須自行確認。所有本機匯入標示為使用者提供資料。</small></label>
      {(manifestName || fileIssues["manifest.json"]?.length) ? <button type="button" className="text-button" onClick={() => { invalidate(); sequence.current["manifest.json"] = (sequence.current["manifest.json"] ?? 0) + 1; setManifestName(undefined); setFileIssues(previous => ({ ...previous, "manifest.json": [] })); setReading(previous => ({ ...previous, "manifest.json": false })); setOriginalNames(previous => ({ ...previous, "manifest.json": undefined })); setBasisConfirmed(false); }}>改用手動設定（保留目前表單）</button> : null}
      {manifestName && <p className="note">已讀取設定：{manifestName}</p>}
      <div className="import-settings"><label>資料集名稱<input aria-label="資料集名稱" value={settings.dataset_id} onChange={e => changeSetting("dataset_id", e.target.value)} /></label>{dateFields.map(({ key, label }) => <label key={key}>{label}<input aria-label={label} type="date" value={settings[key]} onChange={e => changeSetting(key, e.target.value)} /></label>)}<label>銷售通路（每行一個）<textarea aria-label="銷售通路（每行一個）" rows={3} value={settings.channels} onChange={e => changeSetting("channels", e.target.value)} placeholder="與 CSV channel 欄位一致" /></label></div>
      <p className="note">固定支援 TWD／Asia/Taipei；前後期須等長、不重疊且在涵蓋範圍內。通路是銷售目的通路，不是 Meta／Google 等媒體平台。</p>
      <details><summary>本機分析範圍上限</summary><p className="note">{ANALYSIS_PERIOD_LIMIT_MESSAGE}</p><p className="note">{ANALYSIS_CHANNEL_LIMIT_MESSAGE}</p></details>
      <label className="check-label"><input type="checkbox" checked={settings.sales_coverage_confirmed} onChange={e => changeSetting("sales_coverage_confirmed", e.target.checked)} />資料提供者確認銷售涵蓋範圍完整</label><p className="note">這是資料提供者的確認，不是系統獨立查核。未確認時，沒有銷售列的範圍保持未知。</p>
      <label className="check-label"><input type="checkbox" checked={basisConfirmed} onChange={e => { settingsRevision.current++; invalidate(); setBasisConfirmed(e.target.checked); }} />我已確認未稅商品金額與費用口徑</label>
      <p className="note">商品收入與費用不含營業稅、消費者支付的運費收入、固定月租及其他未建模收入。退款按入帳日；銷貨成本採已入帳淨額，不依退款推算或回填。</p>
      <h3>3. 預覽欄位與前十列</h3>
      {(Object.keys(fileLabels) as FileName[]).map(role => {
        const draft = drafts[role];
        if (!draft?.parsed) return null;
        const parsed = draft.parsed;
        const unused = parsed.headers.filter(header => !Object.values(draft.mapping).includes(header));
        const needsMapping = importColumns[role].some(field => draft.mapping[field] !== field);
        return <article className="file-card" key={role} data-testid={`import-preview-${role}`}>
          <h4>{draft.name} <span className="tag">{parsed.rows.length} 列</span></h4><p className="note">標準角色：{role} · 預覽前 {draft.preview.length} 列；套用時檢查全部資料，不截斷。</p>
          <details open={needsMapping || undefined}><summary>確認 {role} 標準欄位對照</summary><p className="note">只按相同標準欄名預選；不會推測收入、折扣或成本的含義。請逐項確認來源符合資料契約。</p><div className="mapping-grid">{importColumns[role].map(field => <label key={field}>{field}<select aria-label={`${role} ${field} 對應欄位`} value={draft.mapping[field] ?? ""} onChange={e => updateDraft(role, { mapping: { ...draft.mapping, [field]: e.target.value }, mappingConfirmed: false, ignoredColumnsConfirmed: false })}><option value="">請選擇來源欄位</option>{parsed.headers.map(header => <option key={header} value={header}>{header}</option>)}</select></label>)}</div></details>
          {needsMapping && <label className="check-label"><input type="checkbox" aria-label={`確認 ${role} 欄位對照`} checked={draft.mappingConfirmed} onChange={e => updateDraft(role, { mappingConfirmed: e.target.checked })} />我已逐欄確認 {role} 的標準欄位對照</label>}
          {unused.length > 0 && <label className="check-label"><input type="checkbox" aria-label={`確認忽略 ${role} 未使用欄位`} checked={draft.ignoredColumnsConfirmed} onChange={e => updateDraft(role, { ignoredColumnsConfirmed: e.target.checked })} />確認忽略未使用欄位：{unused.join("、")}；其內容不進入分析資料集</label>}
          <div className="table-scroll" role="region" aria-label={`${draft.name} 匯入預覽`} tabIndex={0}><table><caption>{draft.name} 原始欄位與資料前十列</caption><thead><tr><th>原始行號</th>{parsed.headers.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{draft.preview.map(row => <tr key={row.line}><th>{row.line}</th>{row.values.map((value, index) => <td key={index}>{value === "" ? "空白（未知）" : value}</td>)}</tr>)}</tbody></table></div>
        </article>;
      })}
      <button type="button" className="button primary" disabled={busyReading} onClick={() => void check()}>檢核匯入資料</button>
    </fieldset>
    <p role="status" data-testid="import-status" className="import-result">{statusText}</p>
    {issues.length > 0 && <><button className="button quiet" onClick={() => downloadText(exportIssuesCsv(issues, sourceNames), "profitlens-import-issues.csv")}>下載問題清單 CSV</button><IssueList issues={issues} filenames={sourceNames} mappings={candidate?.columnMappings} /></>}
    {candidate?.validation.dataset && <div className="alert"><p>{candidate.validation.classification === "partial" ? "受影響的毛利或貢獻保持未知；可計算的收入仍保留。" : "檔案與設定已通過檢核。"}按下方按鈕才會取代目前工作區。</p><button className="button primary" disabled={busy || busyReading || checking} onClick={() => void onCommit(candidate, manifestName)}>套用匯入資料</button></div>}
  </section>;
}
