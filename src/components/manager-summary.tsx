"use client";

import { useMemo, useState } from "react";
import { buildManagerSummary, exportChannelComparisonCsv, exportManagerSummaryMarkdown, priorityEvidence, summaryDecisionState, withSummaryScenarioSelection, type SummaryDecisionContext, type SummaryEvidence, type SummaryMetric } from "@/application/manager-summary";
import { channelsLabel, demoAlias, formatHeadlineAmount, ruleCopy, scopeLabel } from "@/application/copy";
import { downloadText } from "@/application/download";
import { deltaTone, deltaWord, emptyKindOf, formatAmountL1, formatAmountL3, formatEmpty, formatGrowth, formatSignedDelta, metricDefinitions, type DeltaTone } from "@/application/presentation";
import type { WorkspaceSnapshot } from "@/application/workspace";
import type { TaxConversion } from "@/application/tax-basis";
import type { TargetSet } from "@/application/targets";
import type { Diagnostic } from "@/domain/types";
import { fill, labels } from "@/i18n";
import type { EvidenceSelection } from "./evidence-drawer";
import { ChannelWideTable } from "./channel-table";
import { ImpactAmount } from "./top-three";
import styles from "./manager-summary.module.css";
import { PrintSummaryPortal } from "./print-summary";
import { ActionSummaryList, periodValues, type PrintMeeting } from "./summary-shared";
// V3-7 開工錨點：列印版與共用小件搬到 print-summary.tsx／summary-shared.tsx；舊匯入路徑保留。
export { ActionSummaryList, PRINT_NOTES_LIMIT, periodValues, type PrintMeeting } from "./summary-shared";
export { PrintSummary, PrintSummaryPortal, type PrintSummaryProps } from "./print-summary";

const copy = labels.ui.managerSummary;

export interface ManagerSummaryProps {
  snapshot: WorkspaceSnapshot;
  onEvidence: (evidence: EvidenceSelection) => void;
  decisionContext?: SummaryDecisionContext;
  onCreateAction?: (diagnostic: Diagnostic) => void;
  reviewControls?: { importanceThreshold: string; onThresholdChange: (value: string) => void };
  selectionManaged?: boolean;
  /** R3：含稅換算一句併入口徑說明與 Markdown。 */
  conversion?: TaxConversion | null;
  /** R4：目標達成小節。 */
  targets?: { set: TargetSet | null; allChannels: readonly string[] } | null;
  /** R6-2：false 時不顯示匯出列（會議紀錄頁另有「輸出」區）。預設 true。 */
  outputs?: boolean;
  /** R6-2：在會議紀錄頁以議程 ①②③ 標示關鍵差額、三件事與通路表；channelSummary 取代通路表收合標題（避免與 ③ 重複）。 */
  agenda?: { kpis: string; priorities: string; channels: string; channelSummary?: string };
  /** R6-3：列印頁首的會議名稱與日期。 */
  meeting?: PrintMeeting | null;
  /** R6-2：false 時不顯示「方案與待辦」與其他待辦附錄（會議紀錄頁改在議程 ⑤⑥ 列出）。預設 true。 */
  decisions?: boolean;
}

/** V3-2b：有利／不利的顏色 class（依 favorableDirection，不依數學正負號）；顏色一定搭配正負號或方向詞。 */
export const toneClass = (tone: DeltaTone): "positive" | "negative" | "neutral" => tone === "favorable" ? "positive" : tone === "unfavorable" ? "negative" : "neutral";
/**
 * V3-2b 關鍵差額（L1）：「少賺 59.9 萬（−32.0%）」。方向詞後接絕對值；成長率只在上期 > 0 時附上；差額為零只寫「持平」。
 * 缺值依原因碼寫資料待補或不適用。成長率從精確值一次取位（formatGrowth）。
 */
export function headlineChangeText(row: Pick<SummaryMetric, "metric" | "previous" | "current" | "change">): string {
  const value = row.change.value;
  if (value === null) return formatEmpty(emptyKindOf(row.change.reason_codes));
  const word = deltaWord(row.metric, value, { previous: row.previous.value, layer: "L1" }) ?? "";
  if (word === labels.format.flat) return word;
  const amount = formatHeadlineAmount(value);
  const growth = formatGrowth(row.current.value, row.previous.value, "L1");
  return growth ? fill(copy.changePhraseGrowth, { word, amount, growth }) : fill(copy.changePhrase, { word, amount });
}

export function ManagerSummary({ snapshot, onEvidence, decisionContext, onCreateAction, reviewControls, selectionManaged = false, conversion = null, targets = null, outputs = true, agenda, meeting = null, decisions: showDecisions = true }: ManagerSummaryProps) {
  const [thresholdInput, setThresholdInput] = useState(reviewControls?.importanceThreshold ?? "0.00");
  const [threshold, setThreshold] = useState("0.00");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const appliedThreshold = reviewControls?.importanceThreshold ?? threshold;
  const summary = useMemo(() => buildManagerSummary(snapshot, { importanceThreshold: appliedThreshold, conversion, targets: targets ?? undefined }), [snapshot, appliedThreshold, conversion, targets]);
  const alias = demoAlias(summary.dataset_id);
  const effectiveContext = selectionManaged ? decisionContext : withSummaryScenarioSelection(decisionContext, selected);
  const decisions = summaryDecisionState(summary, effectiveContext);
  // V3-2b：主層金額一律 L1（萬／億）；精確值在「計算與來源」抽屜。
  const amount = (evidence: SummaryEvidence, signed = false, text?: string, tone: DeltaTone = "neutral") => <button type="button" className={tone === "neutral" ? "number-link" : `number-link ${toneClass(tone)}`} onClick={() => onEvidence(evidence)} aria-label={evidence.title}>{text ?? (signed ? formatSignedDelta(evidence.metric.value, "L1", emptyKindOf(evidence.metric.reason_codes)) : formatAmountL1(evidence.metric.value, emptyKindOf(evidence.metric.reason_codes)))}</button>;
  // 議程模式下「① 兩個關鍵差額」是 h3，指標名降一級。
  const MetricHeading = agenda ? "h4" : "h3";
  return <section className={`panel ${styles.summary}`} data-testid="manager-summary" aria-labelledby="manager-summary-title">
    <div className="section-heading"><div><h2 id="manager-summary-title">{copy.title}</h2></div><span className="tag">{decisionContext?.decisionState ?? copy.draftDecision}</span></div>
    <p className={styles.context}>{fill(copy.context, { asOf: summary.data_as_of, channels: channelsLabel(summary.scope.channels, alias) })}</p>
    <p className="note">{fill(copy.periodLine, periodValues(summary))}</p>
    {agenda && <h3 className={styles.agendaStep} data-testid="meeting-agenda-1">{agenda.kpis}</h3>}
    <div className={styles.headlines}>{summary.headlines.map(row => <div key={row.metric}><MetricHeading>{metricDefinitions[row.metric].label}</MetricHeading><p className={styles.change}>{amount(row.evidence.change, true, headlineChangeText(row), deltaTone(row.metric, row.change.value, "L1"))}</p><p className="note">{amount(row.evidence.previous)} → {amount(row.evidence.current)}</p></div>)}</div>
    <p className="note">{copy.headlineNote}</p>
    <div className={styles.priorityHeader}><h3 data-testid={agenda ? "meeting-agenda-2" : undefined}>{agenda?.priorities ?? labels.sections.topThree}</h3><form className={styles.threshold} data-testid={agenda ? "threshold-form-meeting" : undefined} onSubmit={event => { event.preventDefault(); try { const checked = buildManagerSummary(snapshot, { importanceThreshold: thresholdInput }); setThreshold(checked.importance_threshold); reviewControls?.onThresholdChange(checked.importance_threshold); setThresholdInput(checked.importance_threshold); setError(""); } catch { setError(labels.notes.thresholdInvalid); } }}><label>{labels.meeting.threshold}<input aria-describedby="manager-threshold-help" value={thresholdInput} onChange={event => setThresholdInput(event.target.value)} inputMode="decimal" maxLength={30} /></label><button type="submit" className="button quiet">{labels.buttons.apply}</button></form></div>
    <p className="note" id="manager-threshold-help">{fill(labels.diagnosisList.thresholdHelp, { amount: formatAmountL3(summary.importance_threshold) })}</p>
    {error && <p role="alert">{error}</p>}
    {summary.priorities.length ? <ol className={styles.priorities}>{summary.priorities.map(item => { const rule = ruleCopy(snapshot, item.primary, alias); return <li key={item.code} data-testid={`manager-priority-${item.code}`}><div className={styles.priorityTitle}><h4>{rule.headline}</h4></div><p className="top-three-impact"><span>{labels.sections.impact}</span>{item.code === "MISSING_CRITICAL_DATA" ? amount(item.evidence, true) : <ImpactAmount snapshot={snapshot} diagnostic={item.primary} onEvidence={onEvidence} />}</p><p className="note">{scopeLabel(item.primary.scope, alias)} · {item.code === "MISSING_CRITICAL_DATA" ? copy.missingDataNote : copy.rankingNote}</p><p>{rule.nextStep}</p>{item.members.length > 1 && <details><summary>{fill(copy.relatedScopes, { n: item.members.length - 1 })}</summary><ul>{item.members.slice(1).map(member => <li key={member.id}>{scopeLabel(member.scope, alias)}：{item.code === "MISSING_CRITICAL_DATA" ? amount(priorityEvidence(snapshot, member), true) : <ImpactAmount snapshot={snapshot} diagnostic={member} onEvidence={onEvidence} />}</li>)}</ul><p className="note">{labels.notes.scopesNotAdditive}</p></details>}{onCreateAction && <button type="button" className="button quiet" onClick={() => onCreateAction(item.primary)}>{labels.buttons.addToActions}</button>}</li>; })}</ol> : <p role="status">{labels.notes.noPriorities}</p>}
    <p className="note">{fill(labels.notes.omittedGroups, { n: summary.omitted_group_count })}</p>
    {agenda && <h3 className={styles.agendaStep} data-testid="meeting-agenda-3">{agenda.channels}</h3>}
    <details className={styles.wideTable} open><summary>{agenda?.channelSummary ?? copy.channelTableSummary}</summary><ChannelWideTable summary={summary} onEvidence={onEvidence} ariaLabel={labels.sections.channelTableAria} caption={labels.sections.channelTableCaption} /></details>
    {showDecisions && <><div className={styles.decisions}><h3>{copy.decisionsHeading}</h3>{!selectionManaged && decisions.scenarios.length > 0 && <label>{copy.selectedScenario}<select aria-label={copy.selectedScenario} value={decisions.selected?.id ?? ""} onChange={event => setSelected(event.target.value)}><option value="">{copy.noneSelected}</option>{decisions.scenarios.map(plan => <option key={plan.id} value={plan.id} disabled={plan.status !== "current"}>{fill(copy.scenarioOption, { name: plan.name, statusOrScope: plan.status === "current" ? plan.scopeLabel : plan.status === "stale" ? copy.scenarioStale : labels.meeting.decisions.draft })}</option>)}</select></label>}{decisions.selectedScenarios.length ? <>{decisions.selectedScenarios.map(plan => <div key={plan.id}><p>{fill(copy.scenarioLine, { name: plan.name, scope: plan.scopeLabel, baseline: formatAmountL1(plan.baseline ?? null), contribution: formatAmountL1(plan.contribution ?? null), delta: formatSignedDelta(plan.delta ?? null, "L1") })}</p><details><summary>{labels.sections.scenarioAssumptions}</summary><ul>{plan.assumptions.map((assumption, index) => <li key={index}>{assumption}</li>)}</ul></details></div>)}<p className="note">{copy.scenarioNote}</p></> : <p className="note">{copy.noScenario}</p>}{decisions.mainActions.length ? <ActionSummaryList actions={decisions.mainActions} /> : <p className="note">{decisions.appendixActions.length ? copy.unpinnedNotice : copy.noActions}</p>}</div>
    {decisions.appendixActions.length > 0 && <details><summary>{fill(copy.appendixActions, { n: decisions.appendixActions.length })}</summary><ActionSummaryList actions={decisions.appendixActions} /></details>}</>}
    <details><summary>{labels.sections.technicalDetails}</summary><ul>{summary.assumptions.map(item => <li key={item}>{item}</li>)}</ul></details>
    {outputs && <><div className={styles.controls}><button type="button" className="button quiet" onClick={() => downloadText(exportManagerSummaryMarkdown(summary, effectiveContext), "profitlens-manager-summary.md", "text/markdown;charset=utf-8")}>{labels.buttons.exportMarkdown}</button><button type="button" className="button quiet" onClick={() => downloadText(exportChannelComparisonCsv(summary), "profitlens-channel-comparison.csv")}>{labels.downloads.channelTableCsv}</button><button type="button" className="button quiet" onClick={() => setPrinting(true)}>{labels.buttons.print}</button><button type="button" className="button quiet" aria-describedby="manager-summary-pdf-hint" onClick={() => setPrinting(true)}>{labels.buttons.exportPdf}</button>{printing && <button type="button" className="button quiet" onClick={() => setPrinting(false)}>{copy.exitPrint}</button>}</div>
    <p className="note" id="manager-summary-pdf-hint">{labels.meetingPage.pdfHint}</p></>}
    <p className="note">{reviewControls ? copy.persistNoteManaged : copy.persistNoteLocal}</p>
    {printing && <PrintSummaryPortal summary={summary} decisionContext={effectiveContext} snapshot={snapshot} meeting={meeting} onDone={() => setPrinting(false)} />}
  </section>;
}

