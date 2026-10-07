"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react";
import type { Dataset, SourceRef } from "@/domain/types";
import type { WorkspaceSnapshot } from "@/application/workspace";
import type { TaxConversion } from "@/application/tax-basis";
import type { TargetSet } from "@/application/targets";
import { track } from "@/application/analytics";
import { downloadText } from "@/application/download";
import { exportIssuesCsv, exportSnapshotCsv } from "@/application/export";
import { buildManagerSummary, exportChannelComparisonCsv } from "@/application/manager-summary";
import { exampleTemplateUrl, FILE_ROLES } from "@/application/import-wizard";
import { standardCsvTemplate } from "@/application/import-guidance";
import { preloadExcelWriter } from "@/application/excel-export";
import { fill, labels } from "@/i18n";
import { COPY_STATUS_MS } from "../overview/weekly-snapshot";
import { ShellIcon } from "./shell-icon";

export interface ExportMenuSource {
  dataset: Dataset;
  snapshot: WorkspaceSnapshot;
  filenames?: Partial<Record<SourceRef["file"], string>>;
  conversion?: TaxConversion | null;
  targets?: TargetSet | null;
}
export interface ExportMenuProps {
  /** 有可看的資料（ready／partial）時才給；null 時只剩匯入範本。 */
  source: ExportMenuSource | null;
  busy: "excel" | "pptx" | "md" | null;
  error: "export" | "markdown" | null;
  summaryRef: RefObject<HTMLElement | null>;
  onDecision: (format: "md" | "csv" | "json") => void;
  onPrint: () => void;
  onExport: (kind: "excel" | "pptx") => void;
  onMeetingNotes: () => void;
  /** V3-7（§6.5 新分組「會議」）：複製週會摘要到剪貼簿（與總覽同一份文字；回傳 copied=false 時在項目下方顯示可選取文字的備案）。沒有給就不渲染「會議」分組。 */
  onCopySummary?: () => Promise<{ copied: boolean; text: string }>;
}

type AsyncItem = NonNullable<ExportMenuProps["busy"]>;

const menu = labels.exports.menuV3;
const fileLabel = (role: (typeof FILE_ROLES)[number]) => labels.importWizard.files[role === "sales_daily.csv" ? "sales" : role === "channel_costs_daily.csv" ? "costs" : "ads"];

// §7.9／C14 匯出項目：14px 名稱＋一行 12px 說明（data-lines="2"）；可及名稱只取名稱（aria-labelledby，E2E 以名稱定位），說明與失敗訊息以 aria-describedby 連結。
function ExportItem({ id, name, description, onClick, disabled, busy, error, buttonRef, testId }: { id: string; name: string; description: string; onClick: (event: MouseEvent<HTMLButtonElement>) => void; disabled?: boolean; busy?: boolean; error?: string | null; buttonRef?: RefObject<HTMLButtonElement | null>; testId?: string }) {
  const nameId = `${id}-name`, hintId = `${id}-hint`, errorId = `${id}-error`;
  return <div className="menu-item">
    <button ref={buttonRef} type="button" className="ui-menu-item export-item" data-lines="2" data-testid={testId} data-busy={busy || undefined} aria-labelledby={nameId} aria-describedby={error ? `${hintId} ${errorId}` : hintId} aria-disabled={disabled || undefined} onClick={onClick}>
      <span className="export-item-text"><span id={nameId} className="export-item-name">{name}</span><small id={hintId}>{description}</small></span>
      {busy && <span className="export-spinner" aria-hidden="true" />}
    </button>
    {error && <p id={errorId} className="export-item-error" role="alert">{error}</p>}
  </div>;
}

// §6.5 分組：role=group＋分組標題（12／500 --text-tertiary，.ui-menu-group）；一頁摘要分組的標題保留 v2 的 testid。
function ExportGroup({ id, title, testId, summarySection, children }: { id: string; title: string; testId: string; summarySection?: boolean; children: ReactNode }) {
  return <div className="menu-group" role="group" aria-labelledby={`${id}-title`} data-testid={testId}>
    <p id={`${id}-title`} className="menu-section ui-menu-group" data-testid={summarySection ? "download-meeting-section" : undefined}>{title}</p>
    {children}
  </div>;
}

/**
 * V3-7 頂欄「匯出」選單（v2「下載」，§6.3 #16、§6.5、§7.9；選單寬 400px）：目前檢視／一頁摘要（目前檢視）／決策工作稿／會議／匯入範本（3×3 表）。
 * 每項 14px 名稱＋12px 說明（範圍差異寫在說明行，取代 v2 的 menuNote 與 menuViewNote）；handler、檔名、條件項（資料問題 CSV）與 testid 都和 v2 相同。
 * 處理中：該項右側 16px spinner，三個非同步項目 aria-disabled；失敗：該項下方一行錯誤（role=alert），焦點回到該項。開啟選單時照常預載 Excel writer。
 * Esc／點外面關閉沿用 Dashboard 的 `.topbar-menu.auto-close`；內容一律掛在收合的 details 內（M1）。
 */
export function ExportMenu({ source, busy, error, summaryRef, onDecision, onPrint, onExport, onMeetingNotes, onCopySummary }: ExportMenuProps) {
  const copy = labels.shell.topbarV3;
  // 最後點的非同步項目：失敗訊息放在它下方；dashboard 結束時先把焦點交給 summary，這裡在錯誤出現後再移回該項。
  const [lastAsync, setLastAsync] = useState<AsyncItem | null>(null);
  const excelRef = useRef<HTMLButtonElement>(null), pptxRef = useRef<HTMLButtonElement>(null), mdRef = useRef<HTMLButtonElement>(null);
  const errorItem: AsyncItem | null = error === "markdown" ? "md" : error === "export" ? (lastAsync === "pptx" ? "pptx" : "excel") : null;
  useEffect(() => {
    if (!errorItem) return;
    (errorItem === "md" ? mdRef : errorItem === "pptx" ? pptxRef : excelRef).current?.focus();
  }, [errorItem]);
  const runAsync = (item: AsyncItem, run: () => void) => { if (busy) return; setLastAsync(item); run(); };
  const errorText = (item: AsyncItem) => errorItem !== item ? null : error === "markdown" ? labels.meetingPage.markdownError : labels.meetingPage.exportError;

  // 會議分組「複製週會摘要」：成功在 role=status 顯示一句（2 秒後清空，同總覽）；剪貼簿不可用時在項目下方放唯讀文字框（已全選）。
  const [copyStatus, setCopyStatus] = useState<{ text: string; key: number }>({ text: "", key: 0 });
  const [fallback, setFallback] = useState<{ text: string; key: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const pending = timer;
    return () => { if (pending.current) clearTimeout(pending.current); };
  }, []);
  useEffect(() => {
    if (!fallback) return;
    fallbackRef.current?.focus();
    fallbackRef.current?.select();
  }, [fallback]);
  const copySummary = async () => {
    if (!onCopySummary) return;
    let result: { copied: boolean; text: string };
    try { result = await onCopySummary(); } catch { return; }
    if (!result.copied) { const text = result.text; setFallback(previous => ({ text, key: (previous?.key ?? 0) + 1 })); return; }
    setFallback(null);
    track("summary_copied");
    setCopyStatus(previous => ({ text: menu.copied, key: previous.key + 1 }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; setCopyStatus(previous => ({ ...previous, text: "" })); }, COPY_STATUS_MS);
  };

  const describe = menu.descriptions;
  return <details className="topbar-menu auto-close download-menu" data-testid="download-menu" onToggle={event => { if (event.currentTarget.open) void preloadExcelWriter(); }}>
    <summary ref={summaryRef} className="topbar-summary">{copy.export}<ShellIcon name="chevron" size={16} className="chevron" /></summary>
    <div className="menu-panel ui-menu export-panel">{source ? <div className="menu-list">
      <ExportGroup id="download-group-current" testId="download-group-current" title={labels.sections.downloadCurrentView}>
        <ExportItem id="download-analysis" name={labels.downloads.analysisCsv} description={describe.analysisCsv} onClick={() => downloadText(exportSnapshotCsv(source.dataset, source.snapshot, source.filenames, source.conversion ?? null, source.targets ?? null), "profitlens-analysis.csv")} />
        <ExportItem id="download-channels" name={labels.downloads.channelTableCsv} description={describe.channelTableCsv} onClick={() => downloadText(exportChannelComparisonCsv(buildManagerSummary(source.snapshot, { conversion: source.conversion, targets: { set: source.targets ?? null, allChannels: source.dataset.manifest.channels } })), "profitlens-channel-comparison.csv")} />
        <ExportItem id="download-manifest" name={labels.downloads.manifestJson} description={describe.manifestJson} onClick={() => downloadText(JSON.stringify(source.dataset.manifest, null, 2), "profitlens-manifest.json", "application/json;charset=utf-8")} />
        {source.dataset.issues.length > 0 && <ExportItem id="download-issues" name={labels.downloads.issuesCsv} description={fill(describe.issuesCsv, { n: source.dataset.issues.length })} onClick={() => downloadText(exportIssuesCsv(source.dataset.issues, source.filenames), "profitlens-issues.csv")} />}
      </ExportGroup>
      <hr className="ui-menu-divider" />
      <ExportGroup id="download-group-summary" testId="download-group-summary" summarySection title={labels.sections.meetingSummary}>
        <ExportItem id="download-pdf" name={labels.buttons.exportPdf} description={fill(describe.exportPdf, { hint: labels.meetingPage.pdfHint })} onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); onPrint(); }} />
        <ExportItem id="download-excel" buttonRef={excelRef} name={labels.buttons.exportExcel} description={describe.exportExcel} disabled={busy !== null} busy={busy === "excel"} error={errorText("excel")} onClick={() => runAsync("excel", () => onExport("excel"))} />
        <ExportItem id="download-pptx" buttonRef={pptxRef} name={labels.buttons.exportPptx} description={describe.exportPptx} disabled={busy !== null} busy={busy === "pptx"} error={errorText("pptx")} onClick={() => runAsync("pptx", () => onExport("pptx"))} />
        <ExportItem id="download-meeting-md" buttonRef={mdRef} name={labels.meetingPage.menuMarkdown} description={describe.menuMarkdown} disabled={busy !== null} busy={busy === "md"} error={errorText("md")} onClick={() => runAsync("md", onMeetingNotes)} />
        {/* 處理中的文字只給輔助科技（畫面上是項目右側的 spinner）；live region 常駐，內容隨 busy 換。 */}
        <p className="sr-only" role="status">{busy ? labels.meetingPage.exporting : ""}</p>
      </ExportGroup>
      <hr className="ui-menu-divider" />
      <ExportGroup id="download-group-decision" testId="download-group-decision" title={labels.sections.downloadDecision}>
        <ExportItem id="download-decision-md" name={labels.downloads.decisionMd} description={describe.decisionMd} onClick={() => onDecision("md")} />
        <ExportItem id="download-decision-csv" name={labels.downloads.decisionCsv} description={describe.decisionCsv} onClick={() => onDecision("csv")} />
        <ExportItem id="download-decision-json" name={labels.downloads.decisionJson} description={describe.decisionJson} onClick={() => onDecision("json")} />
      </ExportGroup>
      {onCopySummary && <><hr className="ui-menu-divider" />
        {/* §6.5 新分組「會議」：複製週會摘要（與總覽本期一句話旁、會議頁頁首同一份文字）。 */}
        <ExportGroup id="download-group-meeting" testId="download-group-meeting" title={menu.groupMeeting}>
          <ExportItem id="download-copy-summary" testId="download-copy-summary" name={labels.overview.snapshotUi.copy} description={describe.copySummary} onClick={() => void copySummary()} />
          <p className="copy-status export-copy-status" role="status" data-testid="download-copy-summary-status">{copyStatus.text && <span key={copyStatus.key} className="copy-status-text">{copyStatus.text}</span>}</p>
          {fallback && <div className="export-copy-fallback" data-testid="download-copy-summary-fallback">
            <p id="download-copy-summary-fallback-note" className="export-copy-note">{menu.copyFallback}</p>
            <textarea key={fallback.key} ref={fallbackRef} className="ui-field-control export-copy-text" readOnly value={fallback.text} rows={6} aria-label={labels.overview.snapshotUi.fallbackTextAria} aria-describedby="download-copy-summary-fallback-note" onFocus={event => event.currentTarget.select()} />
          </div>}
        </ExportGroup></>}
    </div> : <p className="menu-note">{labels.status.empty}；{labels.downloads.menuEmpty}</p>}
    <hr className="ui-menu-divider" />
    <div className="menu-group" role="group" aria-labelledby="download-templates-title" data-testid="download-group-templates">
      <div className="menu-section" data-testid="download-templates">
        <p id="download-templates-title" className="menu-heading ui-menu-group">{labels.downloads.templatesHeading}</p>
        {/* §6.5：3×3 表「檔案｜空白範本｜範例檔」，修正 v2 範本列錯位；格內可見「下載」，可及名稱沿用 v2 的完整說法。 */}
        <table className="template-table"><thead><tr><th scope="col">{copy.templateColumns.file}</th><th scope="col">{copy.templateColumns.blank}</th><th scope="col">{copy.templateColumns.example}</th></tr></thead>
          <tbody>{FILE_ROLES.map(role => { const file = fileLabel(role); return <tr key={role}><th scope="row">{file}</th>
            <td><button type="button" className="ui-btn ui-btn-text" aria-label={fill(labels.downloads.blankTemplate, { file })} onClick={() => downloadText(standardCsvTemplate(role), role)}>{copy.templateCell}</button></td>
            <td><a className="ui-btn ui-btn-text" href={exampleTemplateUrl(role)} download={role} aria-label={fill(labels.downloads.exampleTemplate, { file })}>{copy.templateCell}</a></td></tr>; })}</tbody></table>
      </div>
    </div></div>
  </details>;
}
