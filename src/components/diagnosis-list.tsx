"use client";

import { useMemo, useState } from "react";
import Decimal from "decimal.js";
import { diagnosisGroups, summaryScopes, type DiagnosisGroup, type DiagnosisScope } from "@/application/diagnosis-group";
import { priorityEvidence } from "@/application/manager-summary";
import { channelsLabel, demoAlias, ruleCopy, scopeLabel } from "@/application/copy";
import { eventSuffix, type EventSet } from "@/application/events";
import { formatMoney, formatRate, formatSignedMoney, metricDefinitions } from "@/application/presentation";
import type { WorkspaceSnapshot } from "@/application/workspace";
import type { Diagnostic, Fact, Metric, MetricName, RuleCode } from "@/domain/types";
import { fill, labels } from "@/i18n";
import type { EvidenceSelection } from "./evidence-drawer";
import { ImpactAmount, impactEvidence } from "./top-three";

// R5-1 健檢清單（02_IA_LAYOUT.md §4）：一個規則一列，<summary> 只放標題、範圍標籤與影響金額；按鈕與數據放在展開內容。
const ui = labels.ui.workspacePanels;
const copy = labels.diagnosisList;
/** 預設展開前幾列。 */
export const DIAGNOSIS_DEFAULT_OPEN = 3;

export interface DiagnosisListProps {
  snapshot: WorkspaceSnapshot;
  onEvidence: (evidence: EvidenceSelection) => void;
  onCreateAction?: (diagnostic: Diagnostic) => void;
  /** 已算好的 group（例如 buildManagerSummary(...).diagnosis）；省略時以 diagnosisGroups(snapshot) 計算，門檻 0。 */
  groups?: DiagnosisGroup[];
  /** R4 檔期：本期與檔期重疊時標題加「（○○期間）」。 */
  events?: EventSet | null;
}

/** 未知值：比率分母 ≤ 0 是「不適用」，其餘（缺列、空白、未確認完整）是「資料待補」——缺的不是零。 */
export function displayMetric(name: MetricName, metric: Metric): string {
  if (metric.value === null) return metric.reason_codes.length > 0 && metric.reason_codes.every(code => code === "NON_POSITIVE_DENOMINATOR") ? labels.status.notApplicable : labels.status.missing;
  const unit = metricDefinitions[name].unit;
  if (unit === "percent") return formatRate(metric.value);
  if (unit === "multiple") return `${new Decimal(metric.value).toFixed(2, Decimal.ROUND_HALF_UP)} ${labels.evidence.times}`;
  return formatMoney(metric.value);
}
/** 數據列的範圍文字：合計「所選通路合計（…）」、通路名、SKU「通路／SKU」。 */
function factScope(fact: Fact, alias: boolean): string {
  if (fact.scope.kind === "all") return fill(ui.scopeAllWith, { channels: channelsLabel(fact.scope.channels, alias) });
  return scopeLabel(fact.scope, alias);
}
function factSelection(fact: Fact, alias: boolean): EvidenceSelection {
  return { sku: fact.scope.sku, title: metricDefinitions[fact.metric].label, name: fact.metric, metric: fact, period: fact.period, channels: fact.scope.channels, sources: fact.sources, scopeLabel: fact.scope.kind === "all" ? ui.scopeAll : scopeLabel(fact.scope, alias) };
}

const RANKING_METRIC: Partial<Record<RuleCode, MetricName>> = {
  REV_UP_CM_DOWN: "contribution_after_marketing", NEGATIVE_CHANNEL_CM: "contribution_after_marketing", DISCOUNT_BURDEN_UP: "discounts", REFUND_BURDEN_UP: "refunds",
  FULFILLMENT_BURDEN_UP: "fulfillment_costs", MARKETING_BURDEN_UP: "ad_spend", SKU_NEGATIVE_GP: "gross_profit",
};
const CURRENT_ONLY = new Set<RuleCode>(["NEGATIVE_CHANNEL_CM", "SKU_NEGATIVE_GP"]);
/** 技術細節「排序用已觀察金額差」的標籤：本期值規則顯示「本期…」，其餘為兩期差額。 */
export function rankingLabel(code: RuleCode): string {
  return code === "NEGATIVE_CHANNEL_CM" ? ui.rankingCurrent : code === "SKU_NEGATIVE_GP" ? copy.skuRanking : labels.sections.rankingAmount;
}
/** 排序金額的抽屜內容：沿用 R1 健檢卡的行為（差額規則附公式與上期／本期組成，本期值規則只列本期）。 */
export function rankingSelection(snapshot: Pick<WorkspaceSnapshot, "report">, row: DiagnosisScope, alias: boolean): EvidenceSelection | null {
  const { diagnostic } = row;
  const name = RANKING_METRIC[diagnostic.code];
  if (!name || !diagnostic.ranking_amount) return null;
  const { previous, current } = snapshot.report;
  const referenced = row.facts.filter(fact => fact.metric === name);
  const currentOnly = CURRENT_ONLY.has(diagnostic.code);
  const metric = metricDefinitions[name].label;
  return {
    title: currentOnly ? metric : fill(ui.metricDelta, { metric }), name, metric: diagnostic.ranking_amount, sku: diagnostic.scope.sku,
    period: currentOnly ? current.period : { start: [previous.period.start, current.period.start].sort()[0], end: [previous.period.end, current.period.end].sort()[1] },
    channels: diagnostic.scope.channels, sources: referenced.flatMap(fact => fact.sources), scopeLabel: diagnostic.scope.kind === "all" ? ui.scopeAll : scopeLabel(diagnostic.scope, alias),
    ...(currentOnly ? {} : { formula: fill(ui.deltaFormula, { metric }), components: referenced.map(fact => ({ label: fact.period.start === previous.period.start ? labels.periods.previous : labels.periods.current, metric: fact })) }),
  };
}

export function DiagnosisList({ snapshot, onEvidence, onCreateAction, groups, events = null }: DiagnosisListProps) {
  const rows = useMemo(() => groups ?? diagnosisGroups(snapshot).groups, [groups, snapshot]);
  const suffix = eventSuffix(events, snapshot.report.current.period);
  return <section className="panel diagnosis-panel" aria-labelledby="diagnosis-heading" data-testid="diagnosis-panel">
    <div className="section-heading"><div><h2 id="diagnosis-heading">{labels.sections.diagnosisList}</h2><p className="note">{ui.diagnosisNote}</p></div><span className="diagnosis-heading-tags"><span className="tag">{labels.sections.autoCheck}</span><span className="tag">{fill(ui.itemCount, { n: rows.length })}</span></span></div>
    {rows.length ? <ol className="diagnosis-list" data-testid="diagnosis-list" aria-label={copy.listAria}>{rows.map((group, index) => <DiagnosisRow key={group.rule} group={group} defaultOpen={index < DIAGNOSIS_DEFAULT_OPEN} snapshot={snapshot} suffix={suffix} onEvidence={onEvidence} onCreateAction={onCreateAction} />)}</ol> : <p role="status">{ui.noDiagnostics}</p>}
  </section>;
}

function DiagnosisRow({ group, defaultOpen, snapshot, suffix, onEvidence, onCreateAction }: { group: DiagnosisGroup; defaultOpen: boolean; snapshot: WorkspaceSnapshot; suffix: string; onEvidence: (evidence: EvidenceSelection) => void; onCreateAction?: (diagnostic: Diagnostic) => void }) {
  const [selectedId, setSelectedId] = useState(group.primary.id);
  const selected = group.scopes.find(row => row.diagnostic.id === selectedId) ?? group.scopes[0];
  const alias = demoAlias(snapshot.report.dataset_id);
  const { previous } = snapshot.report;
  const { shown, more } = summaryScopes(group);
  const facts = new Map(selected.facts.map(fact => [fact.id, fact]));
  const isPrimary = selected.diagnostic.id === group.primary.id;
  const ranking = selected.diagnostic.ranking_amount;
  const rankingEvidence = rankingSelection(snapshot, selected, alias);
  const chip = (row: DiagnosisScope) => <button key={row.diagnostic.id} type="button" className="scope-chip" aria-pressed={row.diagnostic.id === selected.diagnostic.id} onClick={() => setSelectedId(row.diagnostic.id)}>{row.label}</button>;
  return <li className="diagnosis-item">
    <details className={`diagnosis-row${group.missing ? " missing" : ""}`} data-testid={`diagnosis-row-${group.rule}`} open={defaultOpen}>
      <summary className="diagnosis-summary">
        <h3 className="diagnosis-headline">{group.headline}{suffix}</h3>
        <span className="diagnosis-scopes">{group.missing && <span className="tag blocking">{ui.tagMissingData}</span>}{shown.map(row => <span key={row.diagnostic.id} className="scope-tag">{row.label}</span>)}{more > 0 && <span className="scope-tag more">{fill(copy.moreScopes, { n: more })}</span>}</span>
        <span className="diagnosis-impact"><span className="diagnosis-impact-label">{labels.sections.impact}</span><ImpactAmount snapshot={snapshot} diagnostic={group.primary} onEvidence={onEvidence} /></span>
      </summary>
      <div className="diagnosis-body">
        <div className="diagnosis-actions"><button type="button" className="button quiet" onClick={() => onEvidence(impactEvidence(snapshot, selected.diagnostic) ?? priorityEvidence(snapshot, selected.diagnostic))}>{labels.buttons.viewEvidence}</button>{onCreateAction && <button type="button" className="button quiet" onClick={() => onCreateAction(selected.diagnostic)}>{labels.buttons.addToActions}</button>}</div>
        {group.scopes.length > 1 && <div className="scope-switch">
          <div className="scope-chips" role="group" aria-label={copy.scopeSwitch}>{group.scopes.slice(0, shown.length).map(chip)}</div>
          {more > 0 && <details className="scope-more"><summary>{fill(copy.moreScopes, { n: more })}</summary><div className="scope-chips" role="group" aria-label={copy.scopeSwitch}>{group.scopes.slice(shown.length).map(chip)}</div></details>}
          <p className="impact-line"><span>{fill(copy.scopeImpact, { impact: labels.sections.impact, scope: selected.label })}</span><ImpactAmount snapshot={snapshot} diagnostic={selected.diagnostic} onEvidence={onEvidence} /></p>
          {!isPrimary && <p className="diagnosis-scope-headline">{fill(copy.scopeHeadline, { scope: selected.label, headline: ruleCopy(snapshot, selected.diagnostic, alias).headline })}</p>}
        </div>}
        <h4>{group.scopes.length > 1 ? fill(copy.dataFor, { data: labels.sections.data, scope: selected.label }) : labels.sections.data}</h4>
        <ul className="fact-list">{selected.diagnostic.fact_ids.map(id => {
          const fact = facts.get(id);
          if (!fact) return <li key={id}>{ui.factNotFound}</li>;
          const period = fact.period.start === previous.period.start && fact.period.end === previous.period.end ? labels.periods.previous : labels.periods.current;
          const scope = factScope(fact, alias);
          const metric = metricDefinitions[fact.metric].label;
          return <li key={id}><span>{fill(ui.factLine, { period, metric, scope })}</span><button type="button" className="number-link" onClick={() => onEvidence(factSelection(fact, alias))} aria-label={fill(ui.factAria, { period, metric, value: displayMetric(fact.metric, fact), scope })}>{displayMetric(fact.metric, fact)}</button></li>;
        })}</ul>
        <dl className="diagnosis-copy">
          <div><dt>{labels.sections.cause}</dt><dd>{group.cause}</dd></div>
          <div><dt>{labels.sections.nextStep}</dt><dd>{group.next_step}</dd></div>
          <div><dt>{labels.sections.caution}</dt><dd>{group.caution}</dd></div>
        </dl>
        <details className="diagnosis-technical"><summary>{labels.sections.technicalDetails}</summary>
          <dl className="diagnosis-tech-list">
            <div><dt>{copy.ruleCode}</dt><dd><code>{selected.diagnostic.code}</code></dd></div>
            {ranking && <div><dt>{rankingLabel(selected.diagnostic.code)}</dt><dd>TWD {rankingEvidence ? <button type="button" className="number-link" onClick={() => onEvidence(rankingEvidence)} aria-label={fill(ui.rankingAria, { title: ruleCopy(snapshot, selected.diagnostic, alias).headline, amount: formatSignedMoney(ranking.value) })}>{formatSignedMoney(ranking.value)}</button> : formatSignedMoney(ranking.value)}</dd></div>}
            <div><dt>{copy.metricVersion}</dt><dd><code>{snapshot.metric_version}</code></dd></div>
          </dl>
          <p className="note">{copy.factIds}</p>
          <ul>{selected.diagnostic.fact_ids.map(id => <li key={id}><code>{id}</code></li>)}</ul>
          <p className="note">{copy.limitations}</p>
          <ul className="note">{selected.diagnostic.limitations.map(limit => <li key={limit}>{limit}</li>)}</ul>
        </details>
      </div>
    </details>
  </li>;
}
