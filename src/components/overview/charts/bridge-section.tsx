"use client";

import { useMemo } from "react";
import { track } from "@/application/analytics";
import { chartHeights } from "@/application/chart-theme";
import { deltaTone, formatAmountL3, formatEmpty, formatMetric, formatSignedDelta, metricDefinitions, type Layer } from "@/application/presentation";
import { bridgeWaterfall, type BridgeRow, type WaterfallBar } from "@/application/waterfall";
import type { WorkspaceSnapshot } from "@/application/workspace";
import { AMOUNT_FIELDS, type AmountField, type Metric, type MetricName } from "@/domain/types";
import { fill, labels } from "@/i18n";
import type { EvidenceSelection } from "../../evidence-drawer";
import { ShellIcon } from "../../shell/shell-icon";
import { toneClass } from "../../top-three";
import { WaterfallSvg } from "./waterfall-svg";

// V3-4b 代理 B1：總覽區塊 5「貢獻變化拆解」（C16＋C17；PRD §7.1 第 5 點）。
// 標題是 L1 結論句（bridgeWaterfall().title），標準名稱與期間放副標（同時是 aria 描述）；左 7/12 瀑布、右 5/12 橋接表（L3 到分）＋平衡檢核。
// 點瀑布柱與點橋接表列呼叫同一個 handler（bridgeEvidence），抽屜內容沿用 v2 總覽的寫法；鍵盤經由表格的 number-link。
// v2 的 4 欄數據表保留在 <details class="data-alternative">（無障礙替代）。

const CM: MetricName = "contribution_after_marketing";
const copy = labels.overview.bridgeV3;
const page = labels.overview.page;
const periods = labels.shell.periods;
/** 瀑布 SVG 最小寬：11 根柱；1280 寬時左欄約 548px，最小寬 520 讓 1280 以上不出現水平捲動，較窄（平板單欄、手機）才捲動。 */
const BRIDGE_MIN_WIDTH = 520;

/** 開抽屜的對象：上期／本期扣廣告後貢獻、九項之一、總差額。 */
export type BridgeEvidenceTarget = "previous" | "current" | "total" | AmountField;

const nullLabel = (metric: Metric) => formatEmpty(metric.reason_codes.some(code => code.startsWith("MISSING") || code === "SALES_COVERAGE_UNCONFIRMED") ? "missing" : "notApplicable");
const metricText = (name: MetricName, metric: Metric, layer: Layer) => metric.value === null ? nullLabel(metric) : formatMetric(name, metric, layer);

/**
 * 拆解各數字的抽屜內容（與 v2 總覽相同）：上期／本期是該期的扣廣告後貢獻；九項是「{指標}拆解差額」＋兩期金額；
 * 總差額是九項加總（公式「各項差額相減」、九項為組成）。瀑布柱與橋接表列都經由這裡，內容一定一致。
 */
export function bridgeEvidence(snapshot: WorkspaceSnapshot, target: BridgeEvidenceTarget): EvidenceSelection {
  const { report } = snapshot;
  const channels = [...report.scope.channels];
  if (target === "previous" || target === "current") {
    const summary = report[target];
    return { name: CM, metric: summary.metrics[CM], period: summary.period, sources: summary.sources, channels, title: metricDefinitions[CM].label };
  }
  const periodBoth = { start: [report.previous.period.start, report.current.period.start].sort()[0], end: [report.previous.period.end, report.current.period.end].sort()[1] };
  const sourcesBoth = [...report.previous.sources, ...report.current.sources];
  if (target === "total") {
    const formula = AMOUNT_FIELDS.map(name => `${metricDefinitions[name].label}${labels.exports.csv.suffix.change}`).join(" − ");
    return { title: `${metricDefinitions[CM].label}${page.bridgeTotal}`, name: CM, metric: report.bridge.sum, period: periodBoth, channels, sources: sourcesBoth, formula, components: AMOUNT_FIELDS.map(field => ({ label: metricDefinitions[field].label, metric: report.bridge.components[field] })) };
  }
  return {
    title: fill(page.bridgeRowTitle, { metric: metricDefinitions[target].label }), name: target, metric: report.bridge.components[target], period: periodBoth, channels, sources: sourcesBoth,
    formula: target === "gross_sales" ? page.amountDeltaFormula : page.costDeltaFormula,
    components: [{ label: periods.previous, metric: report.previous.metrics[target] }, { label: periods.current, metric: report.current.metrics[target] }],
  };
}

/** 橋接表列 → 開抽屜的對象。 */
export const bridgeRowTarget = (row: BridgeRow): BridgeEvidenceTarget => row.kind === "start" ? "previous" : row.kind === "end" ? "current" : row.kind === "total" ? "total" : row.field!;
/** 瀑布柱 → 開抽屜的對象（第一根上期、最後一根本期、中間九項）。 */
export const bridgeBarTarget = (bar: WaterfallBar): BridgeEvidenceTarget => bar.id === "previous" ? "previous" : bar.id === "current" ? "current" : bar.id as AmountField;
/** 橋接表金額：上期／本期 L3 金額；九項與總差額 L3 帶號差額。缺值依原因碼寫資料待補／不適用。 */
export const bridgeRowText = (row: BridgeRow): string => row.metric.value === null ? nullLabel(row.metric) : row.kind === "start" || row.kind === "end" ? formatAmountL3(row.metric.value) : formatSignedDelta(row.metric.value, "L3");
/** 圖上金額都不到 1 萬元時，柱上標值是元（formatAmountL1），單位說明改用 unitNoteYuan。 */
export const bridgeUnitNote = (bars: readonly WaterfallBar[]): string => bars.some(bar => [bar.value, bar.start, bar.end].some(value => value !== null && Math.abs(Number(value)) >= 10_000)) ? copy.unitNote : copy.unitNoteYuan;

export interface BridgeSectionProps {
  snapshot: WorkspaceSnapshot;
  onEvidence: (evidence: EvidenceSelection) => void;
}

/** 總覽區塊 5：貢獻變化拆解（瀑布＋橋接表＋平衡檢核＋資料表替代）。保留 #bridge-title 與 v2 數據表 <details>。 */
export function BridgeSection({ snapshot, onEvidence }: BridgeSectionProps) {
  const { report } = snapshot;
  const data = useMemo(() => bridgeWaterfall(snapshot), [snapshot]);
  const open = (target: BridgeEvidenceTarget) => onEvidence(bridgeEvidence(snapshot, target));
  const onBar = (bar: WaterfallBar) => { track("waterfall_clicked"); open(bridgeBarTarget(bar)); };
  const number = (name: MetricName, metric: Metric, period: "previous" | "current") => <button className="number-link" onClick={() => onEvidence({ name, metric, period: report[period].period, sources: report[period].sources, channels: [...report.scope.channels], title: metricDefinitions[name].label })}>{metricText(name, metric, "L3")}</button>;

  return <section className="panel chart-section bridge-section" aria-labelledby="bridge-title" aria-describedby="bridge-sub" data-testid="bridge-section">
    <div className="sec-head">
      <div className="sec-title"><h2 id="bridge-title">{data.title}</h2><p className="sub" id="bridge-sub">{fill(copy.subtitleWithNote, { subtitle: data.subtitle, note: data.note })}</p></div>
      <span className="unit-note">{bridgeUnitNote(data.bars)}</span>
    </div>
    <div className="bridge-grid">
      <WaterfallSvg bars={data.bars} height={chartHeights.lg} testId="bridge-waterfall" minWidth={BRIDGE_MIN_WIDTH} onBarClick={onBar} />
      <div className="bridge-table-wrap">
        <table className="kv l3 bridge-table" data-testid="bridge-table">
          <caption className="sr-only">{page.bridgeCaption}</caption>
          <thead><tr><th scope="col">{copy.table.item}</th><th scope="col" className="num">{copy.table.amount}</th></tr></thead>
          <tbody>
            {data.rows.map(row => {
              const signed = row.kind === "delta" || row.kind === "total";
              const tone = signed && row.metric.value !== null ? ` ${toneClass(deltaTone(CM, row.metric.value, "L3"))}` : "";
              return <tr key={row.id} className={row.kind === "end" ? "is-total" : row.kind === "total" ? "is-sum" : undefined} data-row={row.id}>
                <th scope="row">{row.label}</th>
                <td className="num"><button type="button" className={`number-link${tone}${row.kind === "total" ? " bridge-total" : ""}`} onClick={() => open(bridgeRowTarget(row))}>{bridgeRowText(row)}</button></td>
              </tr>;
            })}
            <tr className="bridge-balance-row" data-testid="bridge-balance-check">
              <th scope="row">{copy.balance.label}</th>
              <td className="num">{data.balanced === true
                ? <span className="bridge-balance" data-tone="balanced"><ShellIcon name="check" size={16} />{data.balanceText}</span>
                : <span className="bridge-balance" data-tone={data.balanced === false ? "warning" : "missing"}>{data.balanceText}</span>}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <details className="data-alternative"><summary>{fill(page.dataTable, { title: labels.overview.sections.bridge })}</summary><div className="table-scroll" tabIndex={0} role="region" aria-label={page.bridgeTableAria}><table><caption>{page.bridgeCaption}</caption><thead><tr><th>{page.colItem}</th><th>{periods.previous}</th><th>{periods.current}</th><th>{labels.overview.sections.impact}</th></tr></thead><tbody>{AMOUNT_FIELDS.map(field => <tr key={field}><th>{metricDefinitions[field].label}</th><td>{number(field, report.previous.metrics[field], "previous")}</td><td>{number(field, report.current.metrics[field], "current")}</td><td><button className="number-link" onClick={() => open(field)}>{report.bridge.components[field].value === null ? labels.shell.status.missing : formatSignedDelta(report.bridge.components[field].value, "L3")}</button></td></tr>)}</tbody><tfoot><tr><td colSpan={4} className="note">{labels.format.roundingNote}</td></tr></tfoot></table></div></details>
  </section>;
}
