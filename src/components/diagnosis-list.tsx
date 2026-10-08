"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { diagnosisGroups, summaryScopes, type DiagnosisGroup, type DiagnosisScope } from "@/application/diagnosis-group";
import { priorityEvidence } from "@/application/manager-summary";
import { channelsLabel, demoAlias, ruleCopy, scopeLabel } from "@/application/copy";
import { overlapping, type EventSet } from "@/application/events";
import { deltaTone, formatEmpty, formatMetric, formatSignedDelta, metricDefinitions, type Layer } from "@/application/presentation";
import type { WorkspaceSnapshot } from "@/application/workspace";
import type { Diagnostic, Fact, Metric, MetricName, RuleCode } from "@/domain/types";
import { fill, labels } from "@/i18n";
import type { EvidenceSelection } from "./evidence-drawer";
import { ShellIcon } from "./shell/shell-icon";
import { DiagnosisEmpty } from "./diagnosis-empty";
import { alertStatus, ImpactAmount, impactEvidence, toneClass } from "./top-three";

// V3-5 A 健檢結果（PRD §7.2 第 2 點、§9.4 C9 清單型警示列）：一個規則一列 <li.alert-row> > <details.alert.diagnosis-row>。
// <summary>（L1，一行）只放非互動內容：展開指示、狀態標籤、標題、（與頁面範圍不同時的）範圍標籤、影響金額純文字。
// 展開內容（L2）：影響金額（可點）、範圍切換 chips（超過 4 個收進「更多範圍」popover，內容保持掛載）、相關數字、可能原因／下一步／限制、
// 動作列（看明細、加入待辦），最底是收合的技術細節（L3）。
const ui = labels.diagnosis.panel;
const copy = labels.diagnosis.list;
const listV3 = labels.diagnosis.listV3;
const alerts = labels.overview.alerts;
/** 預設展開前幾列。 */
export const DIAGNOSIS_DEFAULT_OPEN = 3;
/** 範圍切換 chips 直接顯示幾個；超過時其餘收進「更多範圍」popover（PRD §7.2）。 */
export const DIAGNOSIS_SCOPE_CHIPS = 4;

export interface DiagnosisListProps {
  snapshot: WorkspaceSnapshot;
  onEvidence: (evidence: EvidenceSelection) => void;
  onCreateAction?: (diagnostic: Diagnostic) => void;
  /** 已算好的 group（例如 buildManagerSummary(...).diagnosis）；省略時以 diagnosisGroups(snapshot) 計算，門檻 0。 */
  groups?: DiagnosisGroup[];
  /** R4 檔期：本期與檔期重疊時，每列展開內容多一行「檔期」（V3-5 起不再接在標題後）。 */
  events?: EventSet | null;
}

/**
 * 未知值：比率分母 ≤ 0 是「不適用」，其餘（缺列、空白、未確認完整）是「資料待補」——缺的不是零。
 * V3-2b：展開列的相關數字是 L2（整數元、16.2%、11.4 倍）；layer 可指定其他層。
 */
export function displayMetric(name: MetricName, metric: Metric, layer: Layer = "L2"): string {
  if (metric.value === null) return formatEmpty(metric.reason_codes.length > 0 && metric.reason_codes.every(code => code === "NON_POSITIVE_DENOMINATOR") ? "notApplicable" : "missing");
  return formatMetric(name, metric, layer);
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
  return code === "NEGATIVE_CHANNEL_CM" ? ui.rankingCurrent : code === "SKU_NEGATIVE_GP" ? copy.skuRanking : labels.overview.sections.rankingAmount;
}
/** 技術細節的排序金額：L3 到分、帶正負號與單位「+250.00 元」（TWD 只出現在匯出 metadata，§8.5 規則 5）。 */
export function rankingText(value: string | null): string {
  return value === null ? formatEmpty("missing") : fill(labels.format.units.yuan, { value: formatSignedDelta(value, "L3") });
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
    ...(currentOnly ? {} : { formula: fill(ui.deltaFormula, { metric }), components: referenced.map(fact => ({ label: fact.period.start === previous.period.start ? labels.shell.periods.previous : labels.shell.periods.current, metric: fact })) }),
  };
}

/**
 * 標題列的計數徽章（PRD §7.2、§9.4 C8）：直接數每列的狀態標籤（alertStatus），不做新的分類；中性（沒有方向）的列不計。
 * 回傳的數字一定等於列內同色調狀態標籤的個數。
 */
export function diagnosisCounts(groups: readonly Pick<DiagnosisGroup, "missing" | "impact_cents">[]): { missing: number; unfavorable: number; favorable: number } {
  const tones = groups.map(group => alertStatus(group)?.tone ?? null);
  return { missing: tones.filter(tone => tone === "warning").length, unfavorable: tones.filter(tone => tone === "unfavorable").length, favorable: tones.filter(tone => tone === "favorable").length };
}

/** <summary> 內的影響金額：純文字（summary 不放互動元件）；L1（萬）與色調同 ImpactAmount，可點的按鈕在展開內容第一行。 */
function ImpactText({ snapshot, diagnostic }: { snapshot: Pick<WorkspaceSnapshot, "report">; diagnostic: Diagnostic }) {
  const evidence = impactEvidence(snapshot, diagnostic);
  if (!evidence) return <span className="impact-amount neutral">{diagnostic.code === "MISSING_CRITICAL_DATA" ? labels.shell.status.missing : labels.shell.status.notApplicable}</span>;
  const value = evidence.metric.value;
  return <span className={`impact-amount ${value === null ? "neutral" : toneClass(deltaTone("contribution_after_marketing", value, "L1"))}`}>{value === null ? labels.shell.status.missing : formatSignedDelta(value, "L1")}</span>;
}

/** C14／M3（同 top-three.tsx 的 useDismiss）：彈出層開著時，Esc 關閉（焦點在裡面時回到觸發器）、點外面關閉；在 modal dialog（抽屜、對話框）裡的操作不算外面。 */
function useDismiss(open: boolean, close: () => void, rootRef: RefObject<HTMLElement | null>, triggerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const inDialog = (target: EventTarget | null) => target instanceof Element && target.closest("dialog") !== null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || inDialog(event.target)) return;
      const inside = rootRef.current?.contains(document.activeElement) ?? false;
      close();
      if (inside) triggerRef.current?.focus();
    };
    const onPointer = (event: MouseEvent) => {
      if (inDialog(event.target)) return;
      const target = event.target instanceof Node ? event.target : null;
      if (!target || !rootRef.current?.contains(target)) close();
    };
    document.addEventListener("keydown", onKey); document.addEventListener("mousedown", onPointer);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onPointer); };
  }, [open, close, rootRef, triggerRef]);
}

type CountKind = keyof ReturnType<typeof diagnosisCounts>;
const BADGES: { kind: CountKind; tone: "warning" | "unfavorable" | "favorable"; text: string; aria: string }[] = [
  { kind: "missing", tone: "warning", text: labels.shell.status.missing, aria: listV3.countMissing },
  { kind: "unfavorable", tone: "unfavorable", text: labels.format.unfavorable, aria: listV3.countUnfavorable },
  { kind: "favorable", tone: "favorable", text: labels.format.favorable, aria: listV3.countFavorable },
];

export function DiagnosisList({ snapshot, onEvidence, onCreateAction, groups, events = null }: DiagnosisListProps) {
  const rows = useMemo(() => groups ?? diagnosisGroups(snapshot).groups, [groups, snapshot]);
  const alias = demoAlias(snapshot.report.dataset_id);
  const counts = diagnosisCounts(rows);
  // R4 檔期提示：本期與檔期重疊時，每列展開內容多一行「檔期」；不改任何數字。
  const eventNames = [...new Set(overlapping(events, snapshot.report.current.period).map(row => row.label))];
  const eventText = eventNames.length ? fill(alerts.eventValue, { label: eventNames.join(labels.events.joiner) }) : "";
  // 計數徽章（C8）：可見的是狀態字＋數字；可及名稱是完整意思「3 項不利」（狀態字對輔助科技隱藏，避免念兩次）。0 項不顯示。
  const badges = BADGES.filter(item => counts[item.kind] > 0);
  return <section className="panel diagnosis-panel" aria-labelledby="diagnosis-heading" data-testid="diagnosis-panel">
    <div className="sec-head">
      <div className="sec-title"><h2 id="diagnosis-heading">{labels.diagnosis.sections.diagnosisList}</h2>{badges.length > 0 && <span className="diagnosis-badges">{badges.map(item => <span key={item.kind} className="diagnosis-badge" data-testid={`diagnosis-count-${item.kind}`}><span className="diagnosis-badge-text" data-tone={item.tone} aria-hidden="true">{item.text}</span><span className="ui-count-badge" role="img" aria-label={fill(item.aria, { n: counts[item.kind] })}>{counts[item.kind]}</span></span>)}</span>}</div>
      <span className="sec-scope">{channelsLabel(snapshot.report.scope.channels, alias)}</span>
    </div>
    <p className="sub">{ui.diagnosisNote}</p>
    {rows.length ? <ol className="alert-list diagnosis-list" data-testid="diagnosis-list" aria-label={copy.listAria}>{rows.map((group, index) => <DiagnosisRow key={group.rule} group={group} defaultOpen={index < DIAGNOSIS_DEFAULT_OPEN} snapshot={snapshot} eventText={eventText} onEvidence={onEvidence} onCreateAction={onCreateAction} />)}</ol> : <DiagnosisEmpty />}
  </section>;
}

function DiagnosisRow({ group, defaultOpen, snapshot, eventText, onEvidence, onCreateAction }: { group: DiagnosisGroup; defaultOpen: boolean; snapshot: WorkspaceSnapshot; eventText: string; onEvidence: (evidence: EvidenceSelection) => void; onCreateAction?: (diagnostic: Diagnostic) => void }) {
  const [selectedId, setSelectedId] = useState(group.primary.id);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDetailsElement>(null);
  const moreTriggerRef = useRef<HTMLElement>(null);
  const closeMore = useCallback(() => { if (moreRef.current) moreRef.current.open = false; setMoreOpen(false); }, []);
  useDismiss(moreOpen, closeMore, moreRef, moreTriggerRef);
  const selected = group.scopes.find(row => row.diagnostic.id === selectedId) ?? group.scopes[0];
  const alias = demoAlias(snapshot.report.dataset_id);
  const { previous } = snapshot.report;
  const { shown, more } = summaryScopes(group, DIAGNOSIS_SCOPE_CHIPS);
  const hidden = group.scopes.slice(shown.length);
  const facts = new Map(selected.facts.map(fact => [fact.id, fact]));
  const isPrimary = selected.diagnostic.id === group.primary.id;
  const ranking = selected.diagnostic.ranking_amount;
  const rankingEvidence = rankingSelection(snapshot, selected, alias);
  const status = alertStatus(group);
  // 範圍標籤只在這一列的範圍和頁面範圍不同時顯示（合計與頁面範圍相同，不重複；頁面範圍只在標題列寫一次）。
  const primaryScope = group.scopes[0];
  const chip = (row: DiagnosisScope, inMore = false) => <button key={row.diagnostic.id} type="button" className="scope-chip" aria-pressed={row.diagnostic.id === selected.diagnostic.id} onClick={() => { setSelectedId(row.diagnostic.id); if (inMore) { closeMore(); moreTriggerRef.current?.focus(); } }}>{row.label}</button>;
  return <li className="alert-row">
    <details className={`alert diagnosis-row${group.missing ? " missing" : ""}`} data-testid={`diagnosis-row-${group.rule}`} id={`diagnosis-row-${group.rule}`} open={defaultOpen}>
      <summary>
        <ShellIcon name="chevron-right" size={16} className="alert-chev" />
        {status && <span className="alert-loz"><span className="ui-lozenge" data-tone={status.tone}>{status.text}</span></span>}
        <h3 className="alert-title diagnosis-headline">{group.headline}</h3>
        {primaryScope.scope.kind !== "all" && <span className="scope-tag">{primaryScope.label}</span>}
        <span className="diagnosis-impact"><span className="sr-only">{labels.overview.sections.impact}</span><ImpactText snapshot={snapshot} diagnostic={group.primary} /></span>
      </summary>
      <div className="alert-body diagnosis-body">
        <p className="impact-line"><span>{fill(copy.scopeImpact, { impact: labels.overview.sections.impact, scope: selected.label })}</span><ImpactAmount snapshot={snapshot} diagnostic={selected.diagnostic} onEvidence={onEvidence} /></p>
        {group.scopes.length > 1 && <div className="scope-switch">
          <div className="scope-chips" role="group" aria-label={copy.scopeSwitch}>{shown.map(row => chip(row))}
            {more > 0 && <details ref={moreRef} className="scope-more ui-popover-host" data-active={hidden.some(row => row.diagnostic.id === selected.diagnostic.id) || undefined} onToggle={event => setMoreOpen(event.currentTarget.open)}><summary ref={moreTriggerRef} className="scope-chip scope-more-trigger">{fill(listV3.moreScopes, { n: more })}</summary>
              <div className="ui-popover scope-more-panel"><div className="scope-chips" role="group" aria-label={copy.scopeSwitch}>{hidden.map(row => chip(row, true))}</div></div>
            </details>}
          </div>
          {!isPrimary && <p className="diagnosis-scope-headline">{fill(copy.scopeHeadline, { scope: selected.label, headline: ruleCopy(snapshot, selected.diagnostic, alias).headline })}</p>}
        </div>}
        <h4 className="kv-heading">{group.scopes.length > 1 ? fill(copy.dataFor, { data: labels.diagnosis.sections.data, scope: selected.label }) : labels.diagnosis.sections.data}</h4>
        <dl className="kv-list fact-list">{selected.diagnostic.fact_ids.map(id => {
          const fact = facts.get(id);
          if (!fact) return <div key={id}><dt>{ui.factNotFound}</dt><dd /></div>;
          const period = fact.period.start === previous.period.start && fact.period.end === previous.period.end ? labels.shell.periods.previous : labels.shell.periods.current;
          const scope = factScope(fact, alias);
          const metric = metricDefinitions[fact.metric].label;
          return <div key={id}><dt>{fill(ui.factLine, { period, metric, scope })}</dt><dd><button type="button" className="number-link" onClick={() => onEvidence(factSelection(fact, alias))} aria-label={fill(ui.factAria, { period, metric, value: displayMetric(fact.metric, fact), scope })}>{displayMetric(fact.metric, fact)}</button></dd></div>;
        })}</dl>
        <dl className="diagnosis-copy">
          <div><dt>{labels.diagnosis.sections.cause}</dt><dd>{group.cause}</dd></div>
          <div><dt>{labels.diagnosis.sections.nextStep}</dt><dd>{group.next_step}</dd></div>
          <div className="diagnosis-limit"><dt>{alerts.limitation}</dt><dd>{group.caution}</dd></div>
          {eventText && <div className="diagnosis-event"><dt>{alerts.eventPeriod}</dt><dd>{eventText}</dd></div>}
        </dl>
        <div className="diagnosis-actions"><button type="button" className="ui-btn ui-btn-secondary" onClick={() => onEvidence(impactEvidence(snapshot, selected.diagnostic) ?? priorityEvidence(snapshot, selected.diagnostic))}>{labels.evidence.buttons.viewEvidence}</button>{onCreateAction && <button type="button" className="ui-btn ui-btn-secondary" onClick={() => onCreateAction(selected.diagnostic)}>{labels.actions.buttons.addToActions}</button>}</div>
        <details className="diagnosis-technical"><summary>{labels.evidence.sections.technicalDetails}</summary>
          <dl className="diagnosis-tech-list">
            <div><dt>{copy.ruleCode}</dt><dd><code>{selected.diagnostic.code}</code></dd></div>
            {ranking && <div><dt>{rankingLabel(selected.diagnostic.code)}</dt><dd>{rankingEvidence ? <button type="button" className="number-link" onClick={() => onEvidence(rankingEvidence)} aria-label={fill(ui.rankingAria, { title: ruleCopy(snapshot, selected.diagnostic, alias).headline, amount: rankingText(ranking.value) })}>{rankingText(ranking.value)}</button> : rankingText(ranking.value)}</dd></div>}
            <div><dt>{copy.metricVersion}</dt><dd><code>{snapshot.metric_version}</code></dd></div>
            <div><dt>{labels.exports.csv.columns.dataset_hash}</dt><dd><code>{snapshot.dataset_hash}</code></dd></div>
            <div><dt>{labels.exports.csv.columns.filter_hash}</dt><dd><code>{snapshot.filter_hash}</code></dd></div>
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
