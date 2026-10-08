"use client";

import type { ReactNode } from "react";
import Decimal from "decimal.js";
import { formatHeadlineAmount } from "@/application/copy";
import { deltaTone, deltaWord, emptyKindOf, formatGrowth, formatMetric, formatRatePoints, metricDefinitions } from "@/application/presentation";
import type { WorkspaceSnapshot } from "@/application/workspace";
import { compareMoney, percentagePointChange } from "@/domain/metrics";
import type { Metric } from "@/domain/types";
import { fill, labels } from "@/i18n";
import type { EvidenceSelection } from "../evidence-drawer";
import { ShellIcon } from "../shell/shell-icon";
import { toneClass } from "../top-three";

/** C1 KPI 帶的 5 格，順序依 D-V3-11；扣廣告後貢獻是強調格（is-key）。 */
export const KPI_BAND_METRICS = ["net_revenue", "gross_profit", "contribution_before_marketing", "contribution_after_marketing", "contribution_margin"] as const;
export type KpiBandMetric = typeof KPI_BAND_METRICS[number];
export const KPI_KEY_METRIC: KpiBandMetric = "contribution_after_marketing";

const ui = labels.overview.kpiBand;
const page = labels.overview.page;
/** KPI 的主值與上期：L1（萬／億、U+2212）；空值依原因碼寫「資料待補」或「不適用」。 */
const valueText = (name: KpiBandMetric, metric: Metric) => formatMetric(name, metric, "L1");

export interface KpiDelta {
  /** 差額的精確值（比率格已換回比率小數，交給 formatRatePoints）；null 表示差額待確認。 */
  delta: string | null;
  /** number-link 的可見文字：「少賺 59.9 萬」「持平」「由負轉正」「降 14.3 個百分點」。 */
  text: string | null;
  /** 成長率（只有金額格、上期 > 0、不是持平或轉正／轉虧時才有），已含括號。 */
  growth: string | null;
  /** 可見的「比上期」前綴（390 寬隱藏）。持平、轉正／轉虧與比率格不加。 */
  long: boolean;
}

/**
 * 差額行（PRD §7.1 區塊 3、§8.2）：金額格「比上期{方向詞} {絕對值 L1}（{±%}）」；上期 ≤ 0 改「由負轉正／轉為虧損」、不顯示成長率；
 * 持平只寫「持平」；比率格「降 14.3 個百分點」（formatRatePoints），不顯示成長率。
 */
export function kpiDelta(name: KpiBandMetric, previous: Metric, current: Metric): KpiDelta {
  if (name === "contribution_margin") {
    const change = percentagePointChange(previous, current).value;
    // domain 的差額單位是百分點，換回比率小數再交給 formatRatePoints（÷ 100 在十進位下是精確的）。
    const delta = change === null ? null : new Decimal(change).div(100).toFixed();
    return { delta, text: delta === null ? null : formatRatePoints(delta, "L1"), growth: null, long: false };
  }
  const delta = compareMoney(previous, current).absolute_change.value;
  if (delta === null) return { delta, text: null, growth: null, long: false };
  const word = deltaWord(name, delta, { previous: previous.value, layer: "L1" });
  if (word === labels.format.flat || word === labels.format.turnedPositive || word === labels.format.turnedLoss) return { delta, text: word, growth: null, long: false };
  const growth = formatGrowth(current.value, previous.value, "L1");
  return { delta, text: fill(ui.deltaLine, { word, amount: formatHeadlineAmount(delta) }), growth: growth === null ? null : fill(page.growthInline, { value: growth }), long: true };
}

export interface KpiBandProps {
  snapshot: WorkspaceSnapshot;
  onEvidence: (evidence: EvidenceSelection) => void;
  /** `?` 定義按鈕：開指標定義對話框。 */
  onBasis?: () => void;
  /** 差額待補時的「先補齊 {n} 項」連到資料來源。 */
  onNavigate?: (id: "diagnosis" | "meeting" | "data") => void;
  missingItems?: number;
  /** 各格的目標列（kpi-target-{metric}，含 C18 細條或期間不符提示）；沒有目標時不給。 */
  targets?: Partial<Record<KpiBandMetric, ReactNode>>;
}

/** 總覽區塊 3「KPI 帶」（C1）：一個容器 5 格；主值、差額、上期都是 number-link，開「計算與來源」抽屜。 */
export function KpiBand({ snapshot, onEvidence, onBasis, onNavigate, missingItems = 0, targets = {} }: KpiBandProps) {
  const { report } = snapshot;
  const channels = report.scope.channels;
  const periodBoth = { start: [report.previous.period.start, report.current.period.start].sort()[0], end: [report.previous.period.end, report.current.period.end].sort()[1] };
  const sourcesBoth = [...report.previous.sources, ...report.current.sources];
  return <section className="kpi-section" aria-labelledby="kpi-title">
    <div className="kpi-head"><h2 id="kpi-title" className="sr-only">{labels.overview.sections.kpis}</h2><span className="unit-note">{page.kpiHint}</span></div>
    <div className="kpi-band" data-testid="kpi-band">
      {KPI_BAND_METRICS.map(name => {
        const before = report.previous.metrics[name], current = report.current.metrics[name];
        const label = metricDefinitions[name].label;
        const rate = name === "contribution_margin";
        const shown = valueText(name, current), previousShown = valueText(name, before);
        const change = kpiDelta(name, before, current);
        const tone = change.delta === null ? "" : toneClass(deltaTone(name, change.delta, "L1"));
        const missing = current.value === null && emptyKindOf(current.reason_codes) === "missing";
        const openValue = () => onEvidence({ name, metric: current, period: report.current.period, sources: report.current.sources, channels, title: label });
        const openPrevious = () => onEvidence({ name, metric: before, period: report.previous.period, sources: report.previous.sources, channels, title: label });
        const openDelta = () => {
          const metric = rate ? percentagePointChange(before, current) : compareMoney(before, current).absolute_change;
          onEvidence({ title: fill(page.changeTitle, { metric: label }), unitOverride: rate ? "percentage-point" : undefined, name, metric, period: periodBoth, channels, sources: sourcesBoth, formula: rate ? page.ratePointFormula : page.amountDeltaFormula, scopeLabel: rate ? page.ratePointScope : page.amountDeltaScope, components: rate ? undefined : [{ label: labels.shell.periods.previous, metric: before }, { label: labels.shell.periods.current, metric: current }] });
        };
        return <div className={`kpi${name === KPI_KEY_METRIC ? " is-key" : ""}${missing ? " is-missing" : ""}`} key={name} data-testid={`kpi-${name}`}>
          <div className="kpi-name"><span>{label}</span><button type="button" className="btn-help" aria-label={fill(ui.helpAria, { metric: label })} title={metricDefinitions[name].plain} onClick={onBasis}><ShellIcon name="help" size={16} /></button></div>
          <div className="kpi-value"><button type="button" className="number-link" aria-label={fill(ui.valueAria, { metric: label, value: shown })} onClick={openValue}>{shown}</button></div>
          <div className={`kpi-delta ${tone}`.trim()}>
            {change.text === null
              ? missingItems > 0 && onNavigate ? <button type="button" className="text-button" onClick={() => onNavigate("data")}>{fill(ui.fillMissing, { n: missingItems })}</button> : <span>{page.changePending}</span>
              : <>{change.long && <span className="dl-long">{ui.vsPrevious}</span>}<button type="button" className="number-link" aria-label={fill(ui.deltaAria, { metric: label, delta: change.text })} onClick={openDelta}>{change.text}</button>{change.growth !== null && <span className="pct">{change.growth}</span>}</>}
          </div>
          <p className="kpi-prev">{labels.shell.periods.previous} <button type="button" className="number-link" aria-label={fill(ui.previousAria, { metric: label, value: previousShown })} onClick={openPrevious}>{previousShown}</button></p>
          {targets[name]}
        </div>;
      })}
    </div>
  </section>;
}
