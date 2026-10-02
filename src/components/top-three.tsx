"use client";

import { useMemo, useState } from "react";
import { buildManagerSummary, contributionImpact, priorityEvidence, type SummaryPriority } from "@/application/manager-summary";
import { channelsLabel, demoAlias, ruleCopy, scopeLabel } from "@/application/copy";
import { formatMoney, formatSignedMoney, metricDefinitions } from "@/application/presentation";
import { parseCents } from "@/domain/money";
import type { WorkspaceSnapshot } from "@/application/workspace";
import type { Diagnostic } from "@/domain/types";
import { fill, labels } from "@/i18n";
import type { EvidenceSelection } from "./evidence-drawer";

const BURDEN = new Set<Diagnostic["code"]>(["DISCOUNT_BURDEN_UP", "REFUND_BURDEN_UP", "FULFILLMENT_BURDEN_UP", "MARKETING_BURDEN_UP"]);

/** 以「對貢獻影響」開啟抽屜：費用類規則把排序金額取負並說明，來源列與前後期事實不變。標題與通路名稱只做呈現（示範資料套 alias）。 */
export function impactEvidence(snapshot: Pick<WorkspaceSnapshot, "report">, diagnostic: Diagnostic): EvidenceSelection | null {
  const impact = contributionImpact(diagnostic);
  if (!impact) return null;
  const alias = demoAlias(snapshot.report.dataset_id);
  const base = priorityEvidence(snapshot, diagnostic);
  const values = { impact: labels.sections.impact, metric: metricDefinitions[base.name].label };
  const formula = BURDEN.has(diagnostic.code) ? fill(labels.notes.impactFormulaBurden, values) : base.formula ?? fill(labels.notes.impactFormulaDefault, values);
  const title = fill(labels.ui.topThree.impactEvidenceTitle, { impact: labels.sections.impact, scope: scopeLabel(diagnostic.scope, alias), title: ruleCopy(snapshot, diagnostic, alias).headline });
  return { ...base, title, metric: impact, formula };
}

/** 紅＝不利、綠＝有利；零與未知為中性（以分為單位比較，不看字串正負號）。 */
export function amountTone(value: string | null): "negative" | "positive" | "neutral" {
  const cents = parseCents(value);
  return cents === null || cents === 0n ? "neutral" : cents < 0n ? "negative" : "positive";
}

export function ImpactAmount({ snapshot, diagnostic, onEvidence }: { snapshot: Pick<WorkspaceSnapshot, "report">; diagnostic: Diagnostic; onEvidence: (evidence: EvidenceSelection) => void }) {
  const evidence = impactEvidence(snapshot, diagnostic);
  if (!evidence) return <span className="impact-amount neutral">{diagnostic.code === "MISSING_CRITICAL_DATA" ? labels.status.missing : labels.status.notApplicable}</span>;
  const value = evidence.metric.value;
  const tone = amountTone(value);
  return <button type="button" className={`number-link impact-amount ${tone}`} aria-label={evidence.title} onClick={() => onEvidence(evidence)}>{value === null ? labels.status.missing : formatSignedMoney(value)}</button>;
}

export interface TopThreeProps { snapshot: WorkspaceSnapshot; onEvidence: (evidence: EvidenceSelection) => void; onCreateAction?: (diagnostic: Diagnostic) => void }

/** 總覽第二區：目前檢視（非會議固定來源）的前三個優先群組；門檻收合，數字可追溯。卡片文案取自 labels.rules（ruleCopy），排序與金額仍用原始值。 */
export function TopThree({ snapshot, onEvidence, onCreateAction }: TopThreeProps) {
  const [thresholdInput, setThresholdInput] = useState("0.00");
  const [threshold, setThreshold] = useState("0.00");
  const [error, setError] = useState("");
  const summary = useMemo(() => buildManagerSummary(snapshot, { importanceThreshold: threshold }), [snapshot, threshold]);
  const alias = demoAlias(snapshot.report.dataset_id);
  const member = (item: SummaryPriority, diagnostic: Diagnostic) => <li key={diagnostic.id}>{fill(labels.ui.topThree.memberRow, { scope: scopeLabel(diagnostic.scope, alias), amount: "" })}<ImpactAmount snapshot={snapshot} diagnostic={diagnostic} onEvidence={onEvidence} />{item.code === "MISSING_CRITICAL_DATA" && <span className="note">{formatMoney(null)}</span>}</li>;
  return <section className="panel top-three" aria-labelledby="top-three-title" data-testid="top-three">
    <div className="section-heading"><div><h2 id="top-three-title">{labels.sections.topThree}</h2><p className="note">{labels.sections.impactLegend}</p></div><span className="tag">{channelsLabel(summary.scope.channels, alias)}</span></div>
    {summary.priorities.length ? <ol className="top-three-list">{summary.priorities.map(item => { const copy = ruleCopy(snapshot, item.primary, alias); return <li key={item.code} data-testid={`overview-priority-${item.code}`}>
      <div className="top-three-head"><h3>{copy.headline}</h3><span className="tag">{scopeLabel(item.primary.scope, alias)}</span></div>
      <p className="top-three-impact"><span>{labels.sections.impact}</span><ImpactAmount snapshot={snapshot} diagnostic={item.primary} onEvidence={onEvidence} /></p>
      <p className="note"><strong>{labels.sections.cause}</strong>：{copy.cause}</p>
      <p className="note"><strong>{labels.sections.nextStep}</strong>：{copy.nextStep}</p>
      <p className="note">{labels.sections.caution}：{copy.caution}</p>
      {item.members.length > 1 && <details><summary>{fill(labels.ui.topThree.relatedScopesCount, { n: item.members.length - 1 })}</summary><ul>{item.members.slice(1).map(row => member(item, row))}</ul></details>}
      <div className="top-three-actions"><button type="button" className="button quiet" onClick={() => onEvidence(impactEvidence(snapshot, item.primary) ?? item.evidence)}>{labels.buttons.viewEvidence}</button>{onCreateAction && <button type="button" className="button quiet" onClick={() => onCreateAction(item.primary)}>{labels.buttons.addToActions}</button>}</div>
    </li>; })}</ol> : <p role="status">{labels.notes.noPriorities}</p>}
    <p className="note">{fill(labels.notes.omittedGroups, { n: summary.omitted_group_count })}</p>
    <details className="top-three-threshold"><summary>{labels.sections.adjustThreshold}</summary>
      <form className="threshold-form" onSubmit={event => { event.preventDefault(); try { const checked = buildManagerSummary(snapshot, { importanceThreshold: thresholdInput }); setThreshold(checked.importance_threshold); setThresholdInput(checked.importance_threshold); setError(""); } catch { setError(labels.notes.thresholdInvalid); } }}>
        <label>{labels.meeting.threshold}<input aria-describedby="top-three-threshold-help" value={thresholdInput} onChange={event => setThresholdInput(event.target.value)} inputMode="decimal" maxLength={30} /></label><button type="submit" className="button quiet">{labels.buttons.apply}</button>
      </form>
      <p className="note" id="top-three-threshold-help">{fill(labels.notes.thresholdHelp, { amount: formatMoney(summary.importance_threshold) })}</p>
      {error && <p role="alert">{error}</p>}
    </details>
  </section>;
}
