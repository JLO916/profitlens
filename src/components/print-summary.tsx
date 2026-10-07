"use client";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { summaryDecisionState, type ManagerSummary as SummaryData, type SummaryDecisionContext } from "@/application/manager-summary";
import { channelLabel, channelsLabel, demoAlias, ruleCopy, scopeLabel } from "@/application/copy";
import { formatAmountL1, formatAmountL2, formatAmountL3, formatSignedDelta, metricDefinitions } from "@/application/presentation";
import type { WorkspaceSnapshot } from "@/application/workspace";
import { fill, labels } from "@/i18n";
import { ActionSummaryList, PRINT_NOTES_LIMIT, periodValues, type PrintMeeting } from "./summary-shared";
import styles from "./manager-summary.module.css";

// V3-7 開工錨點：A4 列印版（「列印」與「匯出 PDF」共用）自 manager-summary.tsx 原樣搬出（markup 不變）。
// B 代理在此檔落實 §7.9 的台灣報表版頭四行與 §9.6 的列印 token（manager-summary.module.css 的 @media print）；A 代理不改本檔。
const copy = labels.ui.managerSummary;

export interface PrintSummaryProps { summary: SummaryData; decisionContext?: SummaryDecisionContext; snapshot?: Pick<WorkspaceSnapshot, "report">; meeting?: PrintMeeting | null }

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
 * A4 直式：第一頁＝標題、關鍵差額、決議與備註一行、三件事、通路表、選入方案（每個一行）與置頂行動；
 * 附錄（方案的完整假設、超過 200 字的備註全文、未置頂待辦、技術資訊）從新的一頁開始。
 */
export function PrintSummary({ summary, decisionContext, snapshot, meeting = null }: PrintSummaryProps) {
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
  return <article className={styles.printSurface} data-testid="manager-summary-print">
    <header>{meeting && <p className={styles.printMeta}>{fill(page.printHeader, { name: meeting.name, date: meeting.date, asOf: summary.data_as_of })}</p>}<h1>{copy.printTitle}</h1><p>{fill(copy.printContext, { state: decisionContext?.decisionState ?? copy.draftDecision, asOf: summary.data_as_of, channels: channelsLabel(summary.scope.channels, alias) })}</p><p>{fill(copy.printPeriodLine, periodValues(summary))}</p></header>
    <div className={styles.printHeadlines}>{summary.headlines.map(row => <p key={row.metric}><strong>{metricDefinitions[row.metric].label}</strong><br />{fill(copy.printHeadline, { prev: formatAmountL1(row.previous.value), cur: formatAmountL1(row.current.value), change: signedL1(row.change.value) })}</p>)}</div>
    {decisionContext?.reviewName && <p className={styles.printDecision} data-testid="print-decision-line">{fill(copy.printMeetingLine, { name: decisionContext.reviewName, state: decisionContext.decisionState ?? copy.draftDecision, notes: firstPageNotes })}</p>}
    <h2>{labels.sections.topThree}</h2><p>{fill(copy.printThresholdLine, { amount: formatAmountL3(summary.importance_threshold) })}</p>
    <ol>{summary.priorities.map(item => { const rule = priorityCopy(item); return <li key={item.code}><strong>{rule.headline}</strong> · {scopeLabel(item.primary.scope, alias)} · <span>{labels.sections.impact}</span> {signedL1(item.impact?.value ?? null)}<p>{rule.nextStep}</p></li>; })}</ol>{!summary.priorities.length && <p>{labels.notes.noPriorities}</p>}
    <table><caption>{fill(copy.printChannelCaption, { metric: metricDefinitions.contribution_after_marketing.label })}</caption><thead><tr><th>{copy.channelColumn}</th><th>{fill(labels.units.yuanColumn, { label: labels.periods.previous })}</th><th>{fill(labels.units.yuanColumn, { label: labels.periods.current })}</th><th>{fill(labels.units.yuanColumn, { label: copy.changeColumn })}</th></tr></thead><tbody>{summary.channels.map(row => <tr key={row.channel}><th>{channelLabel(row.channel, alias)}</th><td>{formatAmountL2(row.contribution.previous.value)}</td><td>{formatAmountL2(row.contribution.current.value)}</td><td>{formatSignedDelta(row.contribution.change.value, "L2")}</td></tr>)}</tbody></table>
    <h2>{copy.printDecisionsHeading}</h2>
    {/* 第一頁每個選入方案只印一行；完整假設在附錄。 */}
    {decisions.selectedScenarios.length ? decisions.selectedScenarios.map(plan => <div key={plan.id} data-testid="print-scenario-line"><p>{fill(copy.printScenarioLine, { name: plan.name, scope: plan.scopeLabel, baseline: formatAmountL1(plan.baseline ?? null), contribution: formatAmountL1(plan.contribution ?? null), delta: formatSignedDelta(plan.delta ?? null, "L1") })}</p></div>) : <p>{copy.noScenario}</p>}
    {decisions.mainActions.length ? <ActionSummaryList actions={decisions.mainActions} /> : <p>{decisions.appendixActions.length ? copy.unpinnedNotice : copy.noActions}</p>}
    <footer><p>{labels.basis.footer}</p></footer>
    {assumptions.length > 0 && <section className={styles.printAppendix} data-testid="print-appendix-assumptions"><h2>{page.printAssumptionsHeading}</h2>{assumptions.map(plan => <div key={plan.id}><h3>{fill(page.printAssumptionsItem, { name: plan.name, scope: plan.scopeLabel })}</h3><ul>{plan.assumptions.map((text, index) => <li key={index}>{text}</li>)}</ul></div>)}</section>}
    {notesTruncated && decisionContext?.reviewName && <section className={styles.printAppendix} data-testid="print-appendix-notes"><h2>{page.printNotesHeading}</h2><p className={styles.printNotes}>{notes}</p></section>}
    {decisions.appendixActions.length > 0 && <section className={styles.printAppendix}><h2>{copy.appendixHeading}</h2><ActionSummaryList actions={decisions.appendixActions} /></section>}
    <section className={styles.printAppendix}><h2>{labels.sections.technicalDetails}</h2><ul>{summary.assumptions.map(item => <li key={item}>{item}</li>)}<li><code>metric_version</code> {summary.metric_version} · <code>dataset_id</code> {summary.dataset_id}</li><li><code>dataset_hash</code> {summary.dataset_hash}</li><li><code>filter_hash</code> {summary.filter_hash}</li></ul></section>
  </article>;
}

