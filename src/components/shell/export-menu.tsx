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
import { preloadExcelWriter } from "@/application/excel-export";
import { fill, labels } from "@/i18n";
import { COPY_STATUS_MS } from "../overview/weekly-snapshot";
import { ShellIcon } from "./shell-icon";
import { TemplateTable } from "./template-table";
import { DEFAULT_EXPORT_VARIANT, EXPORT_VARIANTS, type ExportVariant } from "@/application/export-variants";

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
  /** V3-9b 開工錨點（F14）：變體由選單內的選擇器決定，由 B 代理實作；沒給＝standard。 */
  onPrint: (variant?: ExportVariant) => void;
  onExport: (kind: "excel" | "pptx", variant?: ExportVariant) => void;
  onMeetingNotes: () => void;
  /** V3-7（§6.5 新分組「會議」）：複製週會摘要到剪貼簿（與總覽同一份文字；回傳 copied=false 時在項目下方顯示可選取文字的備案）。沒有給就不渲染「會議」分組。 */
  onCopySummary?: () => Promise<{ copied: boolean; text: string }>;
}

type AsyncItem = NonNullable<ExportMenuProps["busy"]>;

const menu = labels.exports.menuV3;

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
 * V3-9b F14（PRD §10.1 F14、§7.9）：「一頁摘要（目前檢視）」分組標題下的版本切換——標準版／老闆一頁版／客戶報告版三個 aria-pressed 按鈕，
 * 各自一行 12px 說明（aria-describedby）；只影響同一分組的 PDF、Excel、PPT 三項，會議紀錄 Markdown 不受影響。每個按鈕在 DOM 只有一份（M6）。
 */
function VariantPicker({ value, onChange }: { value: ExportVariant; onChange: (variant: ExportVariant) => void }) {
  const copy = labels.exports.variantsV3;
  return <div className="ui-segmented export-variant-picker" role="group" aria-label={copy.pickerAria} data-testid="download-variant-picker">
    {EXPORT_VARIANTS.map(variant => <button key={variant} type="button" className="export-variant" aria-pressed={value === variant} data-testid={`download-variant-${variant}`} aria-labelledby={`download-variant-${variant}-name`} aria-describedby={`download-variant-${variant}-hint`} onClick={() => onChange(variant)}>
      <span id={`download-variant-${variant}-name`} className="export-variant-name">{copy.names[variant]}</span><small id={`download-variant-${variant}-hint`}>{copy.descriptions[variant]}</small>
    </button>)}
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
  // V3-9b F14：一頁摘要的版本（預設標準版）；選單是常駐掛載的 details，關閉再開會維持上次選擇（元件 state，不存）。
  const [variant, setVariant] = useState<ExportVariant>(DEFAULT_EXPORT_VARIANT);
  const errorText = (item: AsyncItem) => errorItem !== item ? null : error === "markdown" ? labels.meeting.page.markdownError : labels.meeting.page.exportError;

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
      <ExportGroup id="download-group-current" testId="download-group-current" title={labels.shell.sections.downloadCurrentView}>
        <ExportItem id="download-analysis" name={labels.exports.downloads.analysisCsv} description={describe.analysisCsv} onClick={() => downloadText(exportSnapshotCsv(source.dataset, source.snapshot, source.filenames, source.conversion ?? null, source.targets ?? null), "profitlens-analysis.csv")} />
        <ExportItem id="download-channels" name={labels.exports.downloads.channelTableCsv} description={describe.channelTableCsv} onClick={() => downloadText(exportChannelComparisonCsv(buildManagerSummary(source.snapshot, { conversion: source.conversion, targets: { set: source.targets ?? null, allChannels: source.dataset.manifest.channels } })), "profitlens-channel-comparison.csv")} />
        <ExportItem id="download-manifest" name={labels.exports.downloads.manifestJson} description={describe.manifestJson} onClick={() => downloadText(JSON.stringify(source.dataset.manifest, null, 2), "profitlens-manifest.json", "application/json;charset=utf-8")} />
        {source.dataset.issues.length > 0 && <ExportItem id="download-issues" name={labels.exports.downloads.issuesCsv} description={fill(describe.issuesCsv, { n: source.dataset.issues.length })} onClick={() => downloadText(exportIssuesCsv(source.dataset.issues, source.filenames), "profitlens-issues.csv")} />}
      </ExportGroup>
      <hr className="ui-menu-divider" />
      <ExportGroup id="download-group-summary" testId="download-group-summary" summarySection title={labels.meeting.sections.meetingSummary}>
        <VariantPicker value={variant} onChange={setVariant} />
        <ExportItem id="download-pdf" name={labels.exports.buttons.exportPdf} description={fill(describe.exportPdf, { hint: labels.meeting.page.pdfHint })} onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); onPrint(variant); }} />
        <ExportItem id="download-excel" buttonRef={excelRef} name={labels.exports.buttons.exportExcel} description={describe.exportExcel} disabled={busy !== null} busy={busy === "excel"} error={errorText("excel")} onClick={() => runAsync("excel", () => onExport("excel", variant))} />
        <ExportItem id="download-pptx" buttonRef={pptxRef} name={labels.exports.buttons.exportPptx} description={describe.exportPptx} disabled={busy !== null} busy={busy === "pptx"} error={errorText("pptx")} onClick={() => runAsync("pptx", () => onExport("pptx", variant))} />
        <ExportItem id="download-meeting-md" buttonRef={mdRef} name={labels.meeting.page.menuMarkdown} description={describe.menuMarkdown} disabled={busy !== null} busy={busy === "md"} error={errorText("md")} onClick={() => runAsync("md", onMeetingNotes)} />
        {/* 處理中的文字只給輔助科技（畫面上是項目右側的 spinner）；live region 常駐，內容隨 busy 換。 */}
        <p className="sr-only" role="status">{busy ? labels.meeting.page.exporting : ""}</p>
      </ExportGroup>
      <hr className="ui-menu-divider" />
      <ExportGroup id="download-group-decision" testId="download-group-decision" title={labels.shell.sections.downloadDecision}>
        <ExportItem id="download-decision-md" name={labels.exports.downloads.decisionMd} description={describe.decisionMd} onClick={() => onDecision("md")} />
        <ExportItem id="download-decision-csv" name={labels.exports.downloads.decisionCsv} description={describe.decisionCsv} onClick={() => onDecision("csv")} />
        <ExportItem id="download-decision-json" name={labels.exports.downloads.decisionJson} description={describe.decisionJson} onClick={() => onDecision("json")} />
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
    </div> : <p className="menu-note">{labels.shell.status.empty}；{labels.exports.downloads.menuEmpty}</p>}
    <hr className="ui-menu-divider" />
    <div className="menu-group" role="group" aria-labelledby="download-templates-title" data-testid="download-group-templates">
      <div className="menu-section" data-testid="download-templates">
        <p id="download-templates-title" className="menu-heading ui-menu-group">{labels.exports.downloads.templatesHeading}</p>
        {/* §6.5：3×3 表「檔案｜空白範本｜範例檔」，修正 v2 範本列錯位；格內可見「下載」，可及名稱沿用 v2 的完整說法。 */}
        <TemplateTable />
      </div>
    </div></div>
  </details>;
}
