"use client";

import type { RefObject } from "react";
import type { Dataset, SourceRef } from "@/domain/types";
import type { WorkspaceSnapshot } from "@/application/workspace";
import type { TaxConversion } from "@/application/tax-basis";
import type { TargetSet } from "@/application/targets";
import { downloadText } from "@/application/download";
import { exportIssuesCsv, exportSnapshotCsv } from "@/application/export";
import { buildManagerSummary, exportChannelComparisonCsv } from "@/application/manager-summary";
import { exampleTemplateUrl, FILE_ROLES } from "@/application/import-wizard";
import { standardCsvTemplate } from "@/application/import-guidance";
import { preloadExcelWriter } from "@/application/excel-export";
import { fill, labels } from "@/i18n";
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
  /** V3-7 開工錨點（§6.5 新分組「會議」）：複製週會摘要到剪貼簿（與總覽同一份文字；回傳 copied=false 時顯示可選取文字的備案）。C 代理接線。 */
  onCopySummary?: () => Promise<{ copied: boolean; text: string }>;
}

const fileLabel = (role: (typeof FILE_ROLES)[number]) => labels.importWizard.files[role === "sales_daily.csv" ? "sales" : role === "channel_costs_daily.csv" ? "costs" : "ads"];

/**
 * V3-3 A1 頂欄「匯出」選單（v2「下載」，§6.3 #16、§6.5）：依對象分組——目前檢視／一頁摘要（目前檢視）／決策工作稿／匯入範本（3×3 表）。
 * 17 個下載項、條件項（資料問題 CSV）、testid（download-menu、download-meeting-section、download-templates）與 handler 都和 v2 相同，只搬位置與分組；
 * 每個按鈕的可及名稱不變（E2E 以名稱定位）。Esc／點外面關閉沿用 Dashboard 的 `.topbar-menu.auto-close`。
 */
export function ExportMenu({ source, busy, error, summaryRef, onDecision, onPrint, onExport, onMeetingNotes }: ExportMenuProps) {
  const copy = labels.shell.topbarV3;
  return <details className="topbar-menu auto-close download-menu" data-testid="download-menu" onToggle={event => { if (event.currentTarget.open) void preloadExcelWriter(); }}>
    <summary ref={summaryRef} className="topbar-summary">{copy.export}<ShellIcon name="chevron" size={16} className="chevron" /></summary>
    <div className="menu-panel ui-menu export-panel">{source ? <div className="menu-list">
      <p className="menu-section ui-menu-group">{labels.sections.downloadCurrentView}</p>
      <div className="menu-item"><button type="button" onClick={() => downloadText(exportSnapshotCsv(source.dataset, source.snapshot, source.filenames, source.conversion ?? null, source.targets ?? null), "profitlens-analysis.csv")}>{labels.downloads.analysisCsv}</button><small>{labels.downloads.analysisCsvHint}</small></div>
      <button type="button" onClick={() => downloadText(exportChannelComparisonCsv(buildManagerSummary(source.snapshot, { conversion: source.conversion, targets: { set: source.targets ?? null, allChannels: source.dataset.manifest.channels } })), "profitlens-channel-comparison.csv")}>{labels.downloads.channelTableCsv}</button>
      <button type="button" onClick={() => downloadText(JSON.stringify(source.dataset.manifest, null, 2), "profitlens-manifest.json", "application/json;charset=utf-8")}>{labels.downloads.manifestJson}</button>
      {source.dataset.issues.length > 0 && <div className="menu-item"><button type="button" onClick={() => downloadText(exportIssuesCsv(source.dataset.issues, source.filenames), "profitlens-issues.csv")}>{labels.downloads.issuesCsv}</button><small>{labels.downloads.issuesCsvHint.replace("{n}", String(source.dataset.issues.length))}</small></div>}
      <hr className="ui-menu-divider" />
      <p className="menu-section ui-menu-group" data-testid="download-meeting-section">{labels.sections.meetingSummary}</p>
      <div className="menu-item"><button type="button" aria-describedby="download-pdf-hint" onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); onPrint(); }}>{labels.buttons.exportPdf}</button><small id="download-pdf-hint">{labels.meetingPage.pdfHint}</small></div>
      <button type="button" aria-disabled={busy !== null || undefined} onClick={() => onExport("excel")}>{labels.buttons.exportExcel}</button>
      <button type="button" aria-disabled={busy !== null || undefined} onClick={() => onExport("pptx")}>{labels.buttons.exportPptx}</button>
      <div className="menu-item"><button type="button" aria-disabled={busy !== null || undefined} onClick={onMeetingNotes}>{labels.meetingPage.menuMarkdown}</button><small>{labels.meetingPage.menuMarkdownHint}</small></div>
      {busy && <p className="menu-note" role="status">{labels.meetingPage.exporting}</p>}
      {error && <p className="menu-note menu-error" role="alert">{error === "markdown" ? labels.meetingPage.markdownError : labels.meetingPage.exportError}</p>}
      <p className="menu-note">{labels.meetingPage.menuViewNote}</p>
      <hr className="ui-menu-divider" />
      <p className="menu-section ui-menu-group">{labels.sections.downloadDecision}</p>
      <button type="button" onClick={() => onDecision("md")}>{labels.downloads.decisionMd}</button>
      <button type="button" onClick={() => onDecision("csv")}>{labels.downloads.decisionCsv}</button>
      <button type="button" onClick={() => onDecision("json")}>{labels.downloads.decisionJson}</button>
      <p className="menu-note">{labels.downloads.menuNote}</p>
    </div> : <p className="menu-note">{labels.status.empty}；{labels.downloads.menuEmpty}</p>}
    <hr className="ui-menu-divider" />
    <div className="menu-section" data-testid="download-templates">
      <p className="menu-heading ui-menu-group">{labels.downloads.templatesHeading}</p>
      {/* §6.5：3×3 表「檔案｜空白範本｜範例檔」，修正 v2 範本列錯位；格內可見「下載」，可及名稱沿用 v2 的完整說法。 */}
      <table className="template-table"><thead><tr><th scope="col">{copy.templateColumns.file}</th><th scope="col">{copy.templateColumns.blank}</th><th scope="col">{copy.templateColumns.example}</th></tr></thead>
        <tbody>{FILE_ROLES.map(role => { const file = fileLabel(role); return <tr key={role}><th scope="row">{file}</th>
          <td><button type="button" className="ui-btn ui-btn-text" aria-label={fill(labels.downloads.blankTemplate, { file })} onClick={() => downloadText(standardCsvTemplate(role), role)}>{copy.templateCell}</button></td>
          <td><a className="ui-btn ui-btn-text" href={exampleTemplateUrl(role)} download={role} aria-label={fill(labels.downloads.exampleTemplate, { file })}>{copy.templateCell}</a></td></tr>; })}</tbody></table>
    </div></div>
  </details>;
}
