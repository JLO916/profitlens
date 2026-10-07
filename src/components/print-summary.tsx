"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { variantKpis, variantOneLiner, variantSpec, type ExportVariant } from "@/application/export-variants";
import { createPortal } from "react-dom";
import { summaryDecisionState, summaryExportHeader, type ManagerSummary as SummaryData, type SummaryDecisionContext } from "@/application/manager-summary";
import { channelLabel, channelsLabel, demoAlias, ruleCopy, scopeLabel } from "@/application/copy";
import { clientHeaderLine } from "@/application/export-header";
import { pnlExportAmount, pnlExportShare, pnlExportTable, type PnlRow } from "@/application/pnl-table";
import { formatAmountL1, formatAmountL2, formatAmountL3, formatSignedDelta, metricDefinitions } from "@/application/presentation";
import type { WorkspaceSnapshot } from "@/application/workspace";
import { fill, labels } from "@/i18n";
import { ActionSummaryList, PRINT_NOTES_LIMIT, periodValues, type PrintMeeting } from "./summary-shared";
import styles from "./manager-summary.module.css";

// V3-7 開工錨點：A4 列印版（「列印」與「匯出 PDF」共用）自 manager-summary.tsx 原樣搬出（markup 不變）。
// B 代理在此檔落實 §7.9 的台灣報表版頭四行與 §9.6 的列印 token（manager-summary.module.css 的 @media print）；A 代理不改本檔。
const copy = labels.ui.managerSummary;
const scopeCopy = labels.exports.headerV3;
const variants = labels.exports.variantsV3;
/** V3-9b F14：列印附錄的每週管理損益表每張表最多幾個資料欄（週欄＋合計＋佔淨營收 %），超過就分成幾張表，A4 直式放得下到分的金額。 */
export const PRINT_PNL_COLUMNS = 5;

export interface PrintSummaryProps {
  /** V3-9b：每週管理損益表（附錄）要用 snapshot.weeks；只給 report 時不放這張表。 */
  summary: SummaryData; decisionContext?: SummaryDecisionContext; snapshot?: Pick<WorkspaceSnapshot, "report"> & Partial<Pick<WorkspaceSnapshot, "weeks">>; meeting?: PrintMeeting | null;
  /** V3-7 版頭第 1 行；預設 dataset_id（V3-10 可由呼叫端傳畫面上的資料集名稱）。 */
  datasetName?: string;
  /** V3-7 版頭的產出時間；預設掛上列印版面的當下（測試注入固定時間）。 */
  generatedAt?: Date;
  /** V3-9b 開工錨點（F14）：列印／PDF 的範本變體；B 代理實作版面差異，預設 standard。 */
  variant?: ExportVariant;
}

/**
 * R6-3「列印」與「匯出 PDF」共用同一流程：把 PrintSummary 放到 body 後呼叫 window.print()（使用者在列印對話框選「另存為 PDF」）；
 * afterprint 時呼叫 onDone 回到畫面。只在需要列印時掛上；reactStrictMode 的重複 effect 不會開兩次列印對話框。
 */
export function PrintSummaryPortal({ onDone, ...props }: PrintSummaryProps & { onDone: () => void }) {
  const done = useRef(onDone);
  const printed = useRef(false);
  useEffect(() => { done.current = onDone; });
  useEffect(() => {
    const stop = () => done.current();
    window.addEventListener("afterprint", stop);
    if (!printed.current) { printed.current = true; window.print(); }
    return () => window.removeEventListener("afterprint", stop);
  }, []);
  return createPortal(<PrintSummary {...props} />, document.body);
}

/**
 * V3-9b F14（D-V3-8，PRD §9.6）：附錄的每週管理損益表——列＝13 列（「減：」前綴），欄＝本期每週＋合計＋佔淨營收 %，
 * 每 PRINT_PNL_COLUMNS 個資料欄一張表；金額到分、負數用括號 (1,234.00)（只有這張表用括號），字級 --print-note、表格線 0.5pt。
 */
function PrintPnlAppendix({ snapshot }: { snapshot: Pick<WorkspaceSnapshot, "report" | "weeks"> }) {
  const { table, rowLabels } = pnlExportTable(snapshot);
  const pnl = labels.overview.pnlV3;
  const columns: { key: string; header: ReactNode; cell: (row: PnlRow) => string }[] = [
    ...table.columns.map((column, index) => ({ key: column.id, header: <>{column.label}<br />{fill(variants.pnlWeekRange, { start: column.period.start, end: column.period.end })}</>, cell: (row: PnlRow) => pnlExportAmount(row.cells[index].metric) })),
    { key: "total", header: pnl.columns.total, cell: (row: PnlRow) => pnlExportAmount(row.total.metric) },
    { key: "share", header: pnl.columns.share, cell: (row: PnlRow) => pnlExportShare(row) },
  ];
  const chunks = Array.from({ length: Math.ceil(columns.length / PRINT_PNL_COLUMNS) }, (_, index) => columns.slice(index * PRINT_PNL_COLUMNS, (index + 1) * PRINT_PNL_COLUMNS));
  return <section className={styles.printAppendix} data-testid="print-appendix-pnl"><h2>{variants.pnlHeading}</h2>
    {chunks.map((chunk, index) => <table key={index} className={styles.printPnl} data-testid="print-pnl-table"><caption>{fill(pnl.caption, { granularity: pnl.granularity.week })}</caption>
      <thead><tr><th scope="col">{pnl.columns.item}</th>{chunk.map(column => <th scope="col" key={column.key} data-col={column.key}>{column.header}</th>)}</tr></thead>
      <tbody>{table.rows.map((row, rowIndex) => <tr key={row.metric} data-row={row.metric} className={row.kind === "item" ? undefined : styles.printPnlStrong}><th scope="row">{rowLabels[rowIndex]}</th>{chunk.map(column => <td key={column.key} data-col={column.key}>{column.cell(row)}</td>)}</tr>)}</tbody>
    </table>)}
    <p className={styles.printPnlNote}>{variants.pnlNote}</p>
  </section>;
}

/**
 * A4 直式：第一頁＝標題、關鍵差額、決議與備註一行、三件事、通路表、選入方案（每個一行）與置頂行動；
 * 附錄（方案的完整假設、超過 200 字的備註全文、未置頂待辦、V3-9b 每週管理損益表、技術資訊）從新的一頁開始。
 * V3-9b F14：版面依 variantSpec(variant)——老闆一頁版只留 L1（版頭四行、本期一句話、四個關鍵數字、三件事標題與影響金額、決議一行），
 * 客戶報告版加客戶行、拿掉內部備註與技術細節；標準版只多每週管理損益表。數字都來自同一個 summary／snapshot。
 */
export function PrintSummary({ summary, decisionContext, snapshot, meeting = null, datasetName, generatedAt, variant }: PrintSummaryProps) {
  const spec = variantSpec(variant);
  // 產出時間在掛上時決定一次（重新渲染不變）。
  const [printedAt] = useState(() => generatedAt ?? new Date());
  const header = summaryExportHeader(summary, { generatedAt: generatedAt ?? printedAt, datasetName });
  const decisions = summaryDecisionState(summary, decisionContext);
  const alias = demoAlias(summary.dataset_id);
  const page = labels.meetingPage;
  // V3-2b：一頁摘要的句子用 L1（萬），通路表用 L2（整數元）；門檻沿用輸入值到分（L3）。
  const signedL1 = (value: string | null) => formatSignedDelta(value, "L1");
  const priorityCopy = (item: SummaryData["priorities"][number]) => snapshot ? ruleCopy(snapshot, item.primary, alias) : { headline: item.title, nextStep: item.recommendation };
  const notes = decisionContext?.notes ?? "";
  const noteChars = Array.from(notes);
  const notesTruncated = noteChars.length > PRINT_NOTES_LIMIT;
  const firstPageNotes = notesTruncated ? fill(page.printNotesTruncated, { text: noteChars.slice(0, PRINT_NOTES_LIMIT).join("") }) : notes;
  const assumptions = decisions.selectedScenarios.filter(plan => plan.assumptions.length > 0);
  // V3-9b F14：老闆一頁版是四個關鍵數字（淨營收、扣廣告後貢獻沿用 headlines；商品毛利、扣廣告前貢獻取同一個 snapshot）；其他變體沿用 headlines。
  const kpis = spec.sections.kpis === "four" ? variantKpis(summary, snapshot?.report) : summary.headlines;
  // V3-9b 收尾：會議範圍的列印（meeting 不為 null）維持 V3-7 版面、不加每週管理損益表附錄——PRD §7.6 規定會議 PDF 頁數不增加（E2E 代理實測加附錄會變 3 頁）；一頁摘要（目前檢視）的標準版與客戶版才加。
  const pnlSource = spec.appendix.pnl && !meeting && snapshot?.weeks ? { report: snapshot.report, weeks: snapshot.weeks } : null;
  return <article className={styles.printSurface} data-testid="manager-summary-print" data-variant={spec.variant === "standard" ? undefined : spec.variant}>
    {/* V3-7 §7.9／§6.3 #50：版頭改成台灣報表格式四行（資料集、報表名、兩期與單位、指標版本與產出時間；8pt 附註字級，報表名是 14pt 標題），之後是會議名稱與日期一行（有會議時）與範圍一行；其後內容順序不變。 */}
    <header className={styles.printHeader} data-testid="print-report-header"><p className={styles.printNote} data-testid="print-header-dataset">{header.datasetName}</p>{spec.header.clientLine && <p className={styles.printNote} data-testid="print-header-client">{clientHeaderLine(header)}</p>}<h1>{header.title}</h1><p className={styles.printPeriod} data-testid="print-header-period"><span>{header.periodLine}</span><span>{header.unitLine}</span></p><p className={styles.printNote} data-testid="print-header-version">{header.versionLine}</p>{spec.sections.scope && meeting && <p className={styles.printMeta} data-testid="print-header-meeting">{fill(page.printHeader, { name: meeting.name, date: meeting.date, asOf: summary.data_as_of })}</p>}{spec.sections.scope && <p className={styles.printScope} data-testid="print-header-scope">{fill(meeting ? scopeCopy.printScopeMeeting : scopeCopy.printScope, { state: decisionContext?.decisionState ?? copy.draftDecision, asOf: summary.data_as_of, channels: channelsLabel(summary.scope.channels, alias), mode: periodValues(summary).mode })}</p>}</header>
    {spec.sections.oneLiner && snapshot && <p className={styles.printOneLiner} data-testid="print-one-liner">{variantOneLiner(summary, snapshot)}</p>}
    <div className={styles.printHeadlines} data-testid={spec.sections.kpis === "four" ? "print-kpis" : undefined}>{kpis.map(row => <p key={row.metric}><strong>{metricDefinitions[row.metric].label}</strong><br />{fill(copy.printHeadline, { prev: formatAmountL1(row.previous.value), cur: formatAmountL1(row.current.value), change: signedL1(row.change.value) })}</p>)}</div>
    {/* V3-9b F14：決策備註是內部備註——老闆一頁版與客戶報告版的決議一行不帶備註。 */}
    {decisionContext?.reviewName && <p className={styles.printDecision} data-testid="print-decision-line">{spec.internal.decisionNotes ? fill(copy.printMeetingLine, { name: decisionContext.reviewName, state: decisionContext.decisionState ?? copy.draftDecision, notes: firstPageNotes }) : fill(variants.printDecisionLine, { name: decisionContext.reviewName, state: decisionContext.decisionState ?? copy.draftDecision })}</p>}
    {spec.sections.priorityDetail ? <><h2>{labels.sections.topThree}</h2><p>{fill(copy.printThresholdLine, { amount: formatAmountL3(summary.importance_threshold) })}</p>
    <ol>{summary.priorities.map(item => { const rule = priorityCopy(item); return <li key={item.code}><strong>{rule.headline}</strong> · {scopeLabel(item.primary.scope, alias)} · <span>{labels.sections.impact}</span> {signedL1(item.impact?.value ?? null)}<p>{rule.nextStep}</p></li>; })}</ol></>
      : <><h2>{labels.sections.topThree}</h2><ol data-testid="print-top-three">{summary.priorities.map(item => <li key={item.code}><strong>{priorityCopy(item).headline}</strong> · <span>{labels.sections.impact}</span> {signedL1(item.impact?.value ?? null)}</li>)}</ol></>}{!summary.priorities.length && <p>{labels.notes.noPriorities}</p>}
    {spec.sections.channels && <table><caption>{fill(copy.printChannelCaption, { metric: metricDefinitions.contribution_after_marketing.label })}</caption><thead><tr><th>{copy.channelColumn}</th><th>{fill(labels.units.yuanColumn, { label: labels.periods.previous })}</th><th>{fill(labels.units.yuanColumn, { label: labels.periods.current })}</th><th>{fill(labels.units.yuanColumn, { label: copy.changeColumn })}</th></tr></thead><tbody>{summary.channels.map(row => <tr key={row.channel}><th>{channelLabel(row.channel, alias)}</th><td>{formatAmountL2(row.contribution.previous.value)}</td><td>{formatAmountL2(row.contribution.current.value)}</td><td>{formatSignedDelta(row.contribution.change.value, "L2")}</td></tr>)}</tbody></table>}
    {spec.sections.decisions && <><h2>{copy.printDecisionsHeading}</h2>
    {/* 第一頁每個選入方案只印一行；完整假設在附錄。 */}
    {decisions.selectedScenarios.length ? decisions.selectedScenarios.map(plan => <div key={plan.id} data-testid="print-scenario-line"><p>{fill(copy.printScenarioLine, { name: plan.name, scope: plan.scopeLabel, baseline: formatAmountL1(plan.baseline ?? null), contribution: formatAmountL1(plan.contribution ?? null), delta: formatSignedDelta(plan.delta ?? null, "L1") })}</p></div>) : <p>{copy.noScenario}</p>}
    {decisions.mainActions.length ? <ActionSummaryList actions={decisions.mainActions} variant={spec.variant} /> : <p>{decisions.appendixActions.length ? copy.unpinnedNotice : copy.noActions}</p>}</>}
    {spec.sections.footer && <footer><p>{labels.basis.footer}</p></footer>}
    {spec.appendix.assumptions && assumptions.length > 0 && <section className={styles.printAppendix} data-testid="print-appendix-assumptions"><h2>{page.printAssumptionsHeading}</h2>{assumptions.map(plan => <div key={plan.id}><h3>{fill(page.printAssumptionsItem, { name: plan.name, scope: plan.scopeLabel })}</h3><ul>{plan.assumptions.map((text, index) => <li key={index}>{text}</li>)}</ul></div>)}</section>}
    {spec.appendix.notes && notesTruncated && decisionContext?.reviewName && <section className={styles.printAppendix} data-testid="print-appendix-notes"><h2>{page.printNotesHeading}</h2><p className={styles.printNotes}>{notes}</p></section>}
    {spec.appendix.otherActions && decisions.appendixActions.length > 0 && <section className={styles.printAppendix}><h2>{copy.appendixHeading}</h2><ActionSummaryList actions={decisions.appendixActions} variant={spec.variant} /></section>}
    {pnlSource && <PrintPnlAppendix snapshot={pnlSource} />}
    {spec.appendix.technical && <section className={styles.printAppendix}><h2>{labels.sections.technicalDetails}</h2><ul>{summary.assumptions.map(item => <li key={item}>{item}</li>)}<li><code>metric_version</code> {summary.metric_version} · <code>dataset_id</code> {summary.dataset_id}</li><li><code>dataset_hash</code> {summary.dataset_hash}</li><li><code>filter_hash</code> {summary.filter_hash}</li></ul></section>}
  </article>;
}

