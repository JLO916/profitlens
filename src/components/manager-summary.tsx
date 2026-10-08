"use client";

import { useMemo, useState, type ReactNode } from "react";
import { buildManagerSummary, exportChannelComparisonCsv, exportManagerSummaryMarkdown, priorityEvidence, summaryDecisionState, withSummaryScenarioSelection, type ManagerSummary as SummaryData, type SummaryDecisionContext, type SummaryEvidence, type SummaryMetric } from "@/application/manager-summary";
import { channelLabel, channelsLabel, demoAlias, formatHeadlineAmount, ruleCopy, scopeLabel } from "@/application/copy";
import { downloadText } from "@/application/download";
import { deltaTone, deltaWord, emptyKindOf, formatAmountL1, formatAmountL2, formatAmountL3, formatEmpty, formatGrowth, formatSignedDelta, metricDefinitions, type DeltaTone } from "@/application/presentation";
import { snapshotSentence } from "@/application/weekly-summary";
import type { WorkspaceSnapshot } from "@/application/workspace";
import type { TaxConversion } from "@/application/tax-basis";
import type { TargetSet } from "@/application/targets";
import type { Diagnostic } from "@/domain/types";
import { fill, labels } from "@/i18n";
import type { EvidenceSelection } from "./evidence-drawer";
import { ChannelWideTable } from "./channel-table";
import { alertStatus, ImpactAmount, impactEvidence } from "./top-three";
import { ShellIcon } from "./shell/shell-icon";
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
  /**
   * V3-7（PRD §7.6 第 4 點）：會議紀錄頁的議程 1–3。給了這個 prop 時改成渲染三個 `<li>`（AgendaItem：關鍵數字、本期重點、各通路表現），
   * 由會議頁放進同一個議程 `<ol>`；channelSummary 是「完整通路寬表」的收合標題，missingItems 給本期一句話的「資料待補」句型。
   */
  agenda?: { kpis: string; priorities: string; channels: string; channelSummary?: string; missingItems?: number };
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

/**
 * V3-7（PRD §7.6 第 4 點、§6.4 M2）：議程的一項——`<li>` 內一個 section（id 與 data-testid 都是 meeting-agenda-{n}，供議程目錄錨點與 E2E），
 * 標題 h3 的 id 是 meeting-agenda-{n}-title；會議頁的 4–6 與這裡的 1–3 共用。
 */
export function AgendaItem({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  const id = `meeting-agenda-${n}`;
  return <li className="meeting-agenda-entry"><section className="meeting-agenda-item" id={id} data-testid={id} aria-labelledby={`${id}-title`}><h3 id={`${id}-title`} className="meeting-agenda-title">{title}</h3>{children}</section></li>;
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
  // V3-10（WCAG 2.5.3）：可及名稱＝抽屜標題＋可見文字（meeting.pageV3.linkAria），可見文字逐字包含在名稱裡。
  const amount = (evidence: SummaryEvidence, signed = false, text?: string, tone: DeltaTone = "neutral") => { const shown = text ?? (signed ? formatSignedDelta(evidence.metric.value, "L1", emptyKindOf(evidence.metric.reason_codes)) : formatAmountL1(evidence.metric.value, emptyKindOf(evidence.metric.reason_codes))); return <button type="button" className={tone === "neutral" ? "number-link" : `number-link ${toneClass(tone)}`} onClick={() => onEvidence(evidence)} aria-label={fill(labels.meeting.pageV3.linkAria, { title: evidence.title, value: shown })}>{shown}</button>; };
  // 門檻表單（總覽三件事的門檻是另一份 state，兩者不共用；會議門檻經 reviewControls 存進會議稿的 importance_threshold）。
  const submitThreshold = (event: { preventDefault: () => void }) => { event.preventDefault(); try { const checked = buildManagerSummary(snapshot, { importanceThreshold: thresholdInput }); setThreshold(checked.importance_threshold); reviewControls?.onThresholdChange(checked.importance_threshold); setThresholdInput(checked.importance_threshold); setError(""); } catch { setError(labels.notes.thresholdInvalid); } };
  if (agenda) return <AgendaSummary summary={summary} snapshot={snapshot} agenda={agenda} threshold={thresholdInput} onThresholdInput={setThresholdInput} onThresholdSubmit={submitThreshold} error={error} persistNote={reviewControls ? copy.persistNoteManaged : copy.persistNoteLocal} amount={amount} onEvidence={onEvidence} onCreateAction={onCreateAction} />;
  return <section className={`panel ${styles.summary}`} data-testid="manager-summary" aria-labelledby="manager-summary-title">
    <div className="section-heading"><div><h2 id="manager-summary-title">{copy.title}</h2></div><span className="tag">{decisionContext?.decisionState ?? copy.draftDecision}</span></div>
    <p className={styles.context}>{fill(copy.context, { asOf: summary.data_as_of, channels: channelsLabel(summary.scope.channels, alias) })}</p>
    <p className="note">{fill(copy.periodLine, periodValues(summary))}</p>
    <div className={styles.headlines}>{summary.headlines.map(row => <div key={row.metric}><h3>{metricDefinitions[row.metric].label}</h3><p className={styles.change}>{amount(row.evidence.change, true, headlineChangeText(row), deltaTone(row.metric, row.change.value, "L1"))}</p><p className="note">{amount(row.evidence.previous)} → {amount(row.evidence.current)}</p></div>)}</div>
    <p className="note">{copy.headlineNote}</p>
    <div className={styles.priorityHeader}><h3>{labels.sections.topThree}</h3><form className={styles.threshold} onSubmit={submitThreshold}><label>{labels.meeting.threshold}<input aria-describedby="manager-threshold-help" value={thresholdInput} onChange={event => setThresholdInput(event.target.value)} inputMode="decimal" maxLength={30} /></label><button type="submit" className="button quiet">{labels.buttons.apply}</button></form></div>
    <p className="note" id="manager-threshold-help">{fill(labels.diagnosisList.thresholdHelp, { amount: formatAmountL3(summary.importance_threshold) })}</p>
    {error && <p role="alert">{error}</p>}
    {summary.priorities.length ? <ol className={styles.priorities}>{summary.priorities.map(item => { const rule = ruleCopy(snapshot, item.primary, alias); return <li key={item.code} data-testid={`manager-priority-${item.code}`}><div className={styles.priorityTitle}><h4>{rule.headline}</h4></div><p className="top-three-impact"><span>{labels.sections.impact}</span>{item.code === "MISSING_CRITICAL_DATA" ? amount(item.evidence, true) : <ImpactAmount snapshot={snapshot} diagnostic={item.primary} onEvidence={onEvidence} />}</p><p className="note">{scopeLabel(item.primary.scope, alias)} · {item.code === "MISSING_CRITICAL_DATA" ? copy.missingDataNote : copy.rankingNote}</p><p>{rule.nextStep}</p>{item.members.length > 1 && <details><summary>{fill(copy.relatedScopes, { n: item.members.length - 1 })}</summary><ul>{item.members.slice(1).map(member => <li key={member.id}>{scopeLabel(member.scope, alias)}：{item.code === "MISSING_CRITICAL_DATA" ? amount(priorityEvidence(snapshot, member), true) : <ImpactAmount snapshot={snapshot} diagnostic={member} onEvidence={onEvidence} />}</li>)}</ul><p className="note">{labels.notes.scopesNotAdditive}</p></details>}{onCreateAction && <button type="button" className="button quiet" onClick={() => onCreateAction(item.primary)}>{labels.buttons.addToActions}</button>}</li>; })}</ol> : <p role="status">{labels.notes.noPriorities}</p>}
    <p className="note">{fill(labels.notes.omittedGroups, { n: summary.omitted_group_count })}</p>
    <details className={styles.wideTable} open><summary>{copy.channelTableSummary}</summary><ChannelWideTable summary={summary} onEvidence={onEvidence} ariaLabel={labels.sections.channelTableAria} caption={labels.sections.channelTableCaption} /></details>
    {showDecisions && <><div className={styles.decisions}><h3>{copy.decisionsHeading}</h3>{!selectionManaged && decisions.scenarios.length > 0 && <label>{copy.selectedScenario}<select aria-label={copy.selectedScenario} value={decisions.selected?.id ?? ""} onChange={event => setSelected(event.target.value)}><option value="">{copy.noneSelected}</option>{decisions.scenarios.map(plan => <option key={plan.id} value={plan.id} disabled={plan.status !== "current"}>{fill(copy.scenarioOption, { name: plan.name, statusOrScope: plan.status === "current" ? plan.scopeLabel : plan.status === "stale" ? copy.scenarioStale : labels.meeting.decisions.draft })}</option>)}</select></label>}{decisions.selectedScenarios.length ? <>{decisions.selectedScenarios.map(plan => <div key={plan.id}><p>{fill(copy.scenarioLine, { name: plan.name, scope: plan.scopeLabel, baseline: formatAmountL1(plan.baseline ?? null), contribution: formatAmountL1(plan.contribution ?? null), delta: formatSignedDelta(plan.delta ?? null, "L1") })}</p><details><summary>{labels.sections.scenarioAssumptions}</summary><ul>{plan.assumptions.map((assumption, index) => <li key={index}>{assumption}</li>)}</ul></details></div>)}<p className="note">{copy.scenarioNote}</p></> : <p className="note">{copy.noScenario}</p>}{decisions.mainActions.length ? <ActionSummaryList actions={decisions.mainActions} /> : <p className="note">{decisions.appendixActions.length ? copy.unpinnedNotice : copy.noActions}</p>}</div>
    {decisions.appendixActions.length > 0 && <details><summary>{fill(copy.appendixActions, { n: decisions.appendixActions.length })}</summary><ActionSummaryList actions={decisions.appendixActions} /></details>}</>}
    <details><summary>{labels.sections.technicalDetails}</summary><ul>{summary.assumptions.map(item => <li key={item}>{item}</li>)}</ul></details>
    {outputs && <><div className={styles.controls}><button type="button" className="button quiet" onClick={() => downloadText(exportManagerSummaryMarkdown(summary, effectiveContext), "profitlens-manager-summary.md", "text/markdown;charset=utf-8")}>{labels.buttons.exportMarkdown}</button><button type="button" className="button quiet" onClick={() => downloadText(exportChannelComparisonCsv(summary), "profitlens-channel-comparison.csv")}>{labels.downloads.channelTableCsv}</button><button type="button" className="button quiet" onClick={() => setPrinting(true)}>{labels.buttons.print}</button><button type="button" className="button quiet" aria-describedby="manager-summary-pdf-hint" onClick={() => setPrinting(true)}>{labels.buttons.exportPdf}</button>{printing && <button type="button" className="button quiet" onClick={() => setPrinting(false)}>{copy.exitPrint}</button>}</div>
    <p className="note" id="manager-summary-pdf-hint">{labels.meetingPage.pdfHint}</p></>}
    <p className="note">{reviewControls ? copy.persistNoteManaged : copy.persistNoteLocal}</p>
    {printing && <PrintSummaryPortal summary={summary} decisionContext={effectiveContext} snapshot={snapshot} meeting={meeting} onDone={() => setPrinting(false)} />}
  </section>;
}

type AmountLink = (evidence: SummaryEvidence, signed?: boolean, text?: string, tone?: DeltaTone) => ReactNode;
interface AgendaSummaryProps {
  summary: SummaryData; snapshot: WorkspaceSnapshot; agenda: NonNullable<ManagerSummaryProps["agenda"]>;
  threshold: string; onThresholdInput: (value: string) => void; onThresholdSubmit: (event: { preventDefault: () => void }) => void; error: string; persistNote: string;
  amount: AmountLink; onEvidence: (evidence: EvidenceSelection) => void; onCreateAction?: (diagnostic: Diagnostic) => void;
}

/**
 * V3-7（PRD §7.6 第 4 點 1–3）：會議紀錄頁議程的前三項，精簡唯讀摘要；完整的表收合（M1：一律保持掛載）。
 * 1 關鍵數字：兩個 L1 數字並排（C1 精簡版 2 格、--num-24），差額行用 headlineChangeText，下方一行本期一句話；不再用 v2 的 36／28px 大卡。
 * 2 本期重點：C9 清單型（summary 一行＝狀態標籤＋L1 標題＋影響金額；展開＝影響金額 number-link、原因與下一步、限制、相關範圍、看明細、加入待辦）；
 *   門檻表單收在「調整門檻」details（會議自己的 importance_threshold，與總覽三件事的門檻互不影響）。
 * 3 各通路表現：精簡表（通路、本期扣廣告後貢獻、差額，L2 number-link）＋「完整通路寬表」details（ChannelWideTable default 變體）。
 */
function AgendaSummary({ summary, snapshot, agenda, threshold, onThresholdInput, onThresholdSubmit, error, persistNote, amount, onEvidence, onCreateAction }: AgendaSummaryProps) {
  const alias = demoAlias(summary.dataset_id);
  const sentence = snapshotSentence(snapshot, { importanceThreshold: summary.importance_threshold, missingItems: agenda.missingItems });
  const alerts = labels.overview.alerts;
  const contribution = metricDefinitions.contribution_after_marketing.label;
  // 精簡表的數字（L2 整數元、單位只在表頭）；開同一份計算與來源，可及名稱＝抽屜標題＋可見文字（V3-10，同 amount）。
  const tableLink = (evidence: SummaryEvidence, signed: boolean, tone: DeltaTone = "neutral") => { const shown = evidence.metric.value === null ? formatEmpty(emptyKindOf(evidence.metric.reason_codes)) : signed ? formatSignedDelta(evidence.metric.value, "L2") : formatAmountL2(evidence.metric.value); return <button type="button" className={tone === "neutral" ? "number-link" : `number-link ${toneClass(tone)}`} onClick={() => onEvidence(evidence)} aria-label={fill(labels.meeting.pageV3.linkAria, { title: evidence.title, value: shown })}>{shown}</button>; };
  return <>
    {/* 議程 1 關鍵數字（C1 精簡版）：名稱 → 本期（24px number-link）→ 差額行 13px → 上期 12px；下方一行本期一句話。 */}
    <AgendaItem n={1} title={agenda.kpis}>
      <dl className="meeting-kpis">{summary.headlines.map(row => <div key={row.metric} className="meeting-kpi">
        <dt>{metricDefinitions[row.metric].label}</dt>
        <dd className="meeting-kpi-value">{amount(row.evidence.current)}</dd>
        <dd className="meeting-kpi-change">{amount(row.evidence.change, true, headlineChangeText(row), deltaTone(row.metric, row.change.value, "L1"))}</dd>
        <dd className="meeting-kpi-previous">{labels.periods.previous} {amount(row.evidence.previous)}</dd>
      </div>)}</dl>
      <p className="meeting-sentence" data-testid="meeting-sentence">{sentence.text}</p>
      <p className="meeting-agenda-note">{copy.headlineNote}</p>
    </AgendaItem>
    {/* 議程 2 本期重點（C9 清單型）＋收合的「調整門檻」（threshold-form-meeting）。 */}
    <AgendaItem n={2} title={agenda.priorities}>
      <details className="meeting-threshold">
        <summary className="ui-btn ui-btn-text">{labels.sections.adjustThreshold}</summary>
        <div className="meeting-threshold-body">
          <form className="meeting-threshold-form" data-testid="threshold-form-meeting" onSubmit={onThresholdSubmit}><label className="ui-field"><span className="ui-field-label">{labels.meeting.threshold}</span><input className="ui-field-control" aria-describedby="manager-threshold-help" aria-invalid={error ? true : undefined} value={threshold} onChange={event => onThresholdInput(event.target.value)} inputMode="decimal" maxLength={30} /></label><button type="submit" className="ui-btn ui-btn-secondary">{labels.buttons.apply}</button></form>
          <p className="ui-field-hint" id="manager-threshold-help">{fill(labels.diagnosisList.thresholdHelp, { amount: formatAmountL3(summary.importance_threshold) })}</p>
          <p className="ui-field-hint">{persistNote}</p>
        </div>
      </details>
      {error && <p role="alert" className="ui-field-error">{error}</p>}
      {summary.priorities.length ? <ol className="alert-list meeting-priorities">{summary.priorities.map(item => {
        const rule = ruleCopy(snapshot, item.primary, alias);
        const missing = item.code === "MISSING_CRITICAL_DATA";
        const status = alertStatus({ missing, impact_cents: item.impact_cents });
        const impactValue = item.impact?.value ?? null;
        const impactText = impactValue === null ? (missing ? labels.status.missing : labels.status.notApplicable) : formatSignedDelta(impactValue, "L1");
        const impactTone = impactValue === null ? "neutral" : toneClass(deltaTone("contribution_after_marketing", impactValue, "L1"));
        return <li key={item.code} className="alert-row meeting-priority" data-testid={`manager-priority-${item.code}`}>
          <details className="alert meeting-priority-row">
            {/* summary 只放非互動內容（同健檢列）：展開指示、狀態標籤、L1 標題、影響金額純文字。 */}
            <summary><ShellIcon name="chevron-right" size={16} className="alert-chev" />{status && <span className="alert-loz"><span className="ui-lozenge" data-tone={status.tone}>{status.text}</span></span>}<h4 className="alert-title">{rule.headline}</h4><span className={`meeting-priority-impact impact-amount ${impactTone}`}><span className="sr-only">{labels.sections.impact}</span>{impactText}</span></summary>
            <div className="alert-body meeting-priority-body">
              <p className="top-three-impact"><span>{labels.sections.impact}</span>{missing ? amount(item.evidence, true) : <ImpactAmount snapshot={snapshot} diagnostic={item.primary} onEvidence={onEvidence} />}</p>
              <p className="meeting-agenda-note">{scopeLabel(item.primary.scope, alias)} · {missing ? copy.missingDataNote : copy.rankingNote}</p>
              <dl className="meeting-priority-copy">
                <div><dt>{labels.sections.cause}</dt><dd>{rule.cause}</dd></div>
                <div><dt>{labels.sections.nextStep}</dt><dd>{rule.nextStep}</dd></div>
                <div><dt>{alerts.limitation}</dt><dd>{rule.caution}</dd></div>
              </dl>
              {item.members.length > 1 && <details className="meeting-priority-scopes"><summary>{fill(copy.relatedScopes, { n: item.members.length - 1 })}</summary><ul>{item.members.slice(1).map(member => <li key={member.id}>{scopeLabel(member.scope, alias)}：{missing ? amount(priorityEvidence(snapshot, member), true) : <ImpactAmount snapshot={snapshot} diagnostic={member} onEvidence={onEvidence} />}</li>)}</ul><p className="meeting-agenda-note">{labels.notes.scopesNotAdditive}</p></details>}
              <div className="meeting-priority-actions"><button type="button" className="ui-btn ui-btn-secondary" onClick={() => onEvidence(impactEvidence(snapshot, item.primary) ?? priorityEvidence(snapshot, item.primary))}>{labels.buttons.viewEvidence}</button>{onCreateAction && <button type="button" className="ui-btn ui-btn-secondary" onClick={() => onCreateAction(item.primary)}>{labels.buttons.addToActions}</button>}</div>
            </div>
          </details>
        </li>;
      })}</ol> : <p role="status" className="meeting-agenda-note">{labels.notes.noPriorities}</p>}
      <p className="meeting-agenda-note">{fill(labels.notes.omittedGroups, { n: summary.omitted_group_count })}</p>
    </AgendaItem>
    {/* 議程 3 各通路表現：精簡表（C3 精簡列）＋「完整通路寬表」收合（region aria-label 與 v2 相同）＋技術細節。 */}
    <AgendaItem n={3} title={agenda.channels}>
      <table className="ui-table meeting-channel-table">
        <caption>{fill(copy.printChannelCaption, { metric: contribution })}</caption>
        <thead><tr><th scope="col">{copy.channelColumn}</th><th scope="col" className="num">{fill(labels.units.yuanColumn, { label: labels.periods.current })}</th><th scope="col" className="num">{fill(labels.units.yuanColumn, { label: copy.changeColumn })}</th></tr></thead>
        <tbody>{summary.channels.map(row => <tr key={row.channel}><th scope="row">{channelLabel(row.channel, alias)}</th><td className="num">{tableLink(row.contribution.evidence.current, false)}</td><td className="num">{tableLink(row.contribution.evidence.change, true, row.contribution.change.value === null ? "neutral" : deltaTone("contribution_after_marketing", row.contribution.change.value, "L2"))}</td></tr>)}</tbody>
      </table>
      <details className="meeting-wide-table"><summary>{agenda.channelSummary ?? copy.channelTableSummary}</summary><ChannelWideTable summary={summary} onEvidence={onEvidence} ariaLabel={labels.sections.channelTableAria} caption={labels.sections.channelTableCaption} /></details>
      <details className="meeting-technical"><summary>{labels.sections.technicalDetails}</summary><ul>{summary.assumptions.map(item => <li key={item}>{item}</li>)}</ul></details>
    </AgendaItem>
  </>;
}
