"use client";

import { SENSITIVITY_POINT_IDS, thresholdPoints, type ThresholdPointId, type ThresholdPointKind } from "@/application/chart-threshold";
import { scenarioReasonText } from "@/application/decision-export";
import { formatPercentNumber, metricDefinitions } from "@/application/presentation";
import { thresholdDescription, thresholdTargetLabel } from "@/application/scenario-threshold-text";
import type { ContributionThreshold, ScenarioSensitivityAnalysis } from "@/domain/scenario-sensitivity";
import { fill, labels } from "@/i18n";
import { chartDataTable, type ChartDataCell, type ChartDataColumn } from "../charts/chart-data-table";
import { ThresholdLine, type ThresholdLinePoint } from "../charts/threshold-line";
import { ChartFrame } from "../overview/charts/chart-frame";

// V4-5 代理 C：G16 要賣到多少才划算（PRD §4.1–§4.7 G16、§5.4 第 2 列、§7.4、§8.7、X29；CHART_CATALOG G16；D-V4-20＝A′；06_BATCHES V4-5）。
// 每個方案欄 scenario-{n} 的「要賣到多少才划算」<details>（scenario-sensitivity）內、門檻說明 threshold-{id} 之後、技術細節之前，每個方案一份（INSTANCE_CONTAINER scenario-\d+）。
// 資料：同一次 analyzeScenarioSensitivity() 的結果經 thresholdPoints（A 級，只組既有點）：門檻點 y＝目標值本身、使用者點 y＝敏感度表同列的試算結果，逐字相同；
// 只畫 [−90%, +100%] 內的既有點、不連線（D-V4-20＝A′）、不外插、不代填（三個假設沒有明填並試算時沒有使用者點，docs/SCENARIOS.md:12、64、68）。
// 邊界：門檻超出範圍時不畫該點，圖下（after）寫「超出範圍」與範圍內是否達標；L＝0（constant_*）不畫門檻點，副標改用既有恆等／恆高／恆低說明句；
// 快照過期（stale）與母方案不能試算時整張改 C16 空狀態，說明沿用既有原因句（STALE_SCENARIO 等，與上方 alert 同一句）；圖上一個點都沒有時也是空狀態。
// 點不可點（PRD §8.7 例外：試算結果是假設，v3 的門檻說明與敏感度表都是純文字），不記 chart_clicked；圖容器 aria-hidden、圖內 0 個可聚焦元素；鍵盤經 C33 資料表（純文字）。
// 標題：零貢獻目標的既有說明句（thresholdDescription，字不改）；ChartFrame variant="inline"（方案欄已是卡片，不套 .panel）、headingLevel 4（與同一個 <details> 內的
// 「兩個目標」「自己填三個銷量假設」h4 同層，門檻目標的 h5 在它之前，往上回到 h4 不跳級）、height sm。
// V4-5 審查修正：過期（非 valid）分支的 <details> 內 G16 是唯一的標題，前一個標題是基準列 h2，改用 h3（R2-A11Y-1；valid 分支維持 h4，v3 標題層級不動）；
// 空狀態的副標不寫圖例句（R1-V45-W1）；零貢獻門檻點的短名保留「{metric} = 0」（R1-V45-W2）；資料表 caption 帶方案名稱（R2-A11Y-2）；區塊代號無損跳脫（R2-A11Y-3）。
// 模型是純函式、區塊元件沒有 hook：ScenarioSensitivity 只多呼叫一次 scenarioThresholdModel，量寬的 ResizeObserver 留在 ThresholdLine 裡
// （DecisionWorkbench 的 hooks harness 只接管 useState／useMemo／useId／useEffect，不會執行子元件）。

const g16 = labels.scenarios.chartsV4.threshold;
const sensitivityCopy = labels.scenarios.sensitivity;
const METRIC = metricDefinitions.contribution_after_marketing.label;
const yuanColumn = (label: string) => fill(labels.format.units.yuanColumn, { label });

export const SCENARIOS_THRESHOLD_TESTID = "chart-scenarios-threshold";
export const SCENARIOS_THRESHOLD_POINT_PREFIX = "chart-scenarios-threshold-point-";
export const SCENARIOS_THRESHOLD_TABLE_TESTID = "chart-scenarios-threshold-table";

/** 資料表的一列（每個門檻目標、每個使用者點一列）：volume 是顯示字（L2 帶號百分比或「超出範圍」）、contribution 是 domain 的精確字串。 */
export interface ScenarioThresholdTableRow {
  id: ThresholdPointId;
  kind: ThresholdPointKind;
  name: string;
  volume: string;
  contribution: string;
}
/** 圖下一行「超出範圍」（不畫點的門檻目標）。 */
export interface ScenarioThresholdOutOfRange {
  id: ContributionThreshold["id"];
  text: string;
}
export interface ScenarioThresholdModel {
  /** 結論標題：零貢獻目標的既有說明句；沒有門檻（過期、不能試算）時是區塊標準名。 */
  title: string;
  subtitle: string;
  section: string;
  /** 資料表 caption（捲動區 region 的名稱）：「{方案名稱} · {區塊標準名}」；沒給方案名稱時是區塊標準名（審查 R2-A11Y-2）。 */
  caption: string;
  /** ready：至少一個點；empty：過期、不能試算或圖上沒有任何點。 */
  state: "ready" | "empty";
  /** 空狀態的說明（過期或不能試算時沿用既有原因句）；ready 時 null。 */
  message: string | null;
  /** 要畫的點（thresholdPoints 的輸出加上標籤；只有範圍內的既有點）。 */
  points: ThresholdLinePoint[];
  outOfRange: ScenarioThresholdOutOfRange[];
  tableRows: ScenarioThresholdTableRow[];
  flat: boolean;
  stale: boolean;
}

const letterOf = (id: ThresholdPointId) => String.fromCharCode(65 + (SENSITIVITY_POINT_IDS as readonly string[]).indexOf(id));
const pct = (value: string, layer: "L1" | "L2") => formatPercentNumber(value, layer, { signed: true });
const outcomeOf = (target: ContributionThreshold) => target.range_outcome === "all_at_or_above" ? sensitivityCopy.outcomeAllAtOrAbove : sensitivityCopy.outcomeAllBelow;

/**
 * G16 的模型（純函式）：只讀 analysis（與上方門檻說明、下方三個假設表同一次 analyzeScenarioSensitivity 的結果），點由 thresholdPoints 組出，不產生新數字。
 * 點標籤：門檻點寬版「{門檻短名}：{L1 百分比}」（零貢獻短名「扣廣告後貢獻 = 0」）、窄版（< 480px）只寫百分比；使用者點只標 A／B／C（與三個假設表的列名對應，避免和門檻標籤擠在一起）。
 */
export function scenarioThresholdModel(analysis: ScenarioSensitivityAnalysis, planName?: string): ScenarioThresholdModel {
  const arranged = thresholdPoints(analysis);
  const section = g16.section;
  const target = (id: ContributionThreshold["id"]) => analysis.targets.find(item => item.id === id);
  const zero = target("zero_contribution"), maintain = target("maintain_baseline");
  const valid = analysis.status === "valid";
  // D-V4-46＝B：標題前加零貢獻門檻的既有目標名（說明句字不改）；過期與不能試算時仍是區塊標準名。
  const title = valid && zero ? fill(g16.title, { target: thresholdTargetLabel("zero_contribution"), description: thresholdDescription(zero) }) : section;
  const points: ThresholdLinePoint[] = arranged.points.map(point => point.kind === "threshold"
    ? { ...point, label: fill(g16.pointLabel, { name: fill(g16.pointNames[point.id as ContributionThreshold["id"]], { metric: METRIC }), pct: pct(point.v, "L1") }), shortLabel: pct(point.v, "L1") }
    : { ...point, label: letterOf(point.id), shortLabel: letterOf(point.id) });
  const empty = !valid || points.length === 0;
  // 副標：L＝0 用維持現況的恆等／恆高／恆低句；空狀態（過期、不能試算、圖上沒有點）只寫區塊名與軸，不寫圖上沒有的空心圈與實心點（審查 R1-V45-W1）。
  const subtitle = valid && arranged.flat && maintain
    ? fill(g16.subtitleFlat, { section, target: thresholdTargetLabel("maintain_baseline"), description: thresholdDescription(maintain) })
    : fill(empty ? g16.subtitleEmpty : g16.subtitle, { section, axis: fill(g16.axis, { metric: METRIC }) });
  const caption = planName !== undefined && planName.trim() !== "" ? fill(g16.caption, { plan: planName, section }) : section;
  const outOfRange = arranged.outOfRange.flatMap(id => {
    const found = target(id);
    return found ? [{ id, text: fill(g16.outOfRange, { target: thresholdTargetLabel(id), outcome: outcomeOf(found) }) }] : [];
  });
  // 資料表：門檻目標在前（範圍內寫門檻、超出範圍寫「超出範圍」；L＝0 沒有單一門檻，不列），使用者點在後；列數＝資料長度，金額是 domain 的精確字串。
  const tableRows: ScenarioThresholdTableRow[] = [];
  if (valid && !arranged.flat) for (const item of analysis.targets) {
    const drawn = arranged.points.find(point => point.id === item.id);
    if (drawn) tableRows.push({ id: item.id, kind: "threshold", name: thresholdTargetLabel(item.id), volume: pct(drawn.v, "L2"), contribution: item.target });
    else if (arranged.outOfRange.includes(item.id)) tableRows.push({ id: item.id, kind: "threshold", name: thresholdTargetLabel(item.id), volume: g16.outOfRangeCell, contribution: item.target });
  }
  for (const point of arranged.points) if (point.kind === "user") tableRows.push({ id: point.id, kind: "user", name: fill(sensitivityCopy.rowLabel, { letter: letterOf(point.id) }), volume: pct(point.v, "L2"), contribution: point.y });
  const message = !valid ? analysis.reasons.map(scenarioReasonText).join(" ") : points.length === 0 ? g16.empty : null;
  return { title, subtitle, section, caption, state: empty ? "empty" : "ready", message, points, outOfRange, tableRows, flat: arranged.flat, stale: arranged.stale };
}

type ThresholdColumn = "volume" | "contribution" | "kind";
/** G16 資料表欄（CHART_CATALOG G16）：銷量增減（%）、扣廣告後貢獻（元）、種類；純文字（PRD §8.7 例外，沒有 number-link）。 */
export const SCENARIO_THRESHOLD_COLUMNS: readonly ChartDataColumn<ThresholdColumn>[] = [
  { key: "volume", label: fill(g16.columns.volume, { volume: labels.scenarios.inputs.volume.label }), unit: "text", data: "volume" },
  { key: "contribution", label: yuanColumn(METRIC), unit: "money", layer: "L2", data: "contribution" },
  { key: "kind", label: g16.columns.kind, unit: "text", data: "kind" },
];
function thresholdCell(row: ScenarioThresholdTableRow, column: ThresholdColumn): ChartDataCell {
  if (column === "kind") return { value: g16.pointKinds[row.kind] };
  return { value: row[column] };
}
const noEvidence = () => null;

export interface ScenarioThresholdSectionProps {
  /** scenarioThresholdModel(...) 的輸出。 */
  model: ScenarioThresholdModel;
  /** 區塊代號（scenarios-threshold-{planId}）：h4#{id}-title、p#{id}-sub；每個方案欄唯一。 */
  chartId: string;
  /**
   * 標題層級（預設 4）：valid 分支與「兩個目標」「自己填三個銷量假設」h4 同層；過期（非 valid）分支的 <details> 內 G16 是唯一的標題、
   * 前一個標題是基準列 h2，ScenarioSensitivity 傳 3，不新增 h2→h4 跳級（審查 R2-A11Y-1）。
   */
  headingLevel?: 3 | 4;
}

/** 方案欄 G16：ChartFrame（inline、h4（過期分支 h3）、sm；testid chart-scenarios-threshold）＋C29 ThresholdLine（只畫點）＋圖下「超出範圍」＋C33 資料表（純文字）。 */
export function ScenarioThresholdSection({ model, chartId, headingLevel = 4 }: ScenarioThresholdSectionProps) {
  const dataTable = chartDataTable<ScenarioThresholdTableRow, ThresholdColumn>({
    title: model.section,
    testId: SCENARIOS_THRESHOLD_TABLE_TESTID,
    caption: model.caption,
    rowHeaderLabel: g16.columns.point,
    rows: model.tableRows,
    rowKey: row => row.id,
    rowHeader: row => ({ label: row.name }),
    columns: SCENARIO_THRESHOLD_COLUMNS,
    valueOf: (row, column) => thresholdCell(row, column.data),
    evidenceOf: noEvidence,
    onEvidence: noEvidence,
    notes: [g16.tableNote],
    className: "scenarios-threshold-table",
  });
  const after = model.outOfRange.length > 0 ? <div className="threshold-out-of-range">{model.outOfRange.map(item => <p key={item.id} className="note" data-target={item.id}>{item.text}</p>)}</div> : undefined;
  return <ChartFrame id={chartId} page="scenarios" testId={SCENARIOS_THRESHOLD_TESTID} className="scenario-threshold" variant="inline" headingLevel={headingLevel} title={model.title} subtitle={model.subtitle}
    height="sm" state={model.state === "empty" ? "empty" : undefined} message={model.message ?? undefined} after={after} dataTable={dataTable}>
    {model.state === "empty" ? null : <ThresholdLine points={model.points} testIdPrefix={SCENARIOS_THRESHOLD_POINT_PREFIX} />}
  </ChartFrame>;
}

/**
 * 區塊代號：scenarios-threshold-{planId}。plan id 平常是 UUID（英數與 -，原樣保留）；讀入的備份可以是任何 1–500 字的字串（workspace-backup.ts），
 * 所以 [A-Za-z0-9-] 以外的字元（含 _ 本身）無損跳脫成「_{碼位 16 進位}_」：不同的 id 一定得到不同的代號（審查 R2-A11Y-3：「甲」「乙」、「plan 1」「plan_1」不再撞號），
 * 結果只含 [\w-]，aria-labelledby 不會被空白切開。
 */
export const scenarioThresholdChartId = (planId: string) => `scenarios-threshold-${Array.from(planId, char => /[A-Za-z0-9-]/.test(char) ? char : `_${char.codePointAt(0)!.toString(16)}_`).join("")}`;
