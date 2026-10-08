"use client";

import { ASSIST_KPI_VERSION, type AssistKpi, type AssistUnit } from "@/application/assist-kpi";
import { ASSIST_WEEKS_VERSION, type AssistWeek, type AssistWeeks, type AssistWeekSeries, type AssistWeekValue } from "@/application/chart-assist-weeks";
import { formatCount, formatMultiple, formatPerUnit, formatPeriodL1, formatRateL1 } from "@/application/presentation";
import type { Period } from "@/domain/types";
import { fill, labels } from "@/i18n";
import { ChartDataDetails, type ChartDataColumn, type ChartDataUnit } from "../charts/chart-data-table";
import { Sparkline } from "../charts/sparkline";
import type { EvidenceSelection } from "../evidence-drawer";

// V4-2 代理 A：G7a 其他常用指標表「近 {n} 週」sparkline 與「各指標每週」資料表（PRD §4.1–§4.7 G7、§5.1 第 8 列；CHART_CATALOG G7（a）；D-V4-6）。
// 資料由 assistWeeks（assist-weeks-v1）整理；這裡只組畫面與抽屜內容：
// - sparkline（C19）放在兩張 table.kv 每列的新欄，aria-hidden、不可點，語意由同列的本期、上期數字承擔；testid chart-overview-assist-spark-{kpiId}；
// - 「各指標每週」（C33）放在 .assist-panel 最後（損益兩平段之後）的收合 <details>，收合時保持掛載（M1）；表 testid chart-overview-assist-table；
// - 每格的抽屜與本期、上期兩格同一套寫法（assistEvidence），period＝該週、sources＝週列 sources，另帶 arrangeVersion: "assist-weeks-v1"；
//   metricVersion 不變（domain 值 contribution-v1，件數、件均 assist-kpi-v1）。
// 損益兩平 MER 段（BreakevenRow）不畫 sparkline、不進資料表（D-V4-6）。

const spark = labels.overview.chartsV4.assistSpark;
const ui = labels.overview.assistTable;

/** sparkline 的 testid（PRD §4.7：chart-{page}-{id}-spark-{語意 key}；不以 kpi- 開頭）。 */
export const assistSparkTestId = (id: AssistKpi["id"]) => `chart-overview-assist-spark-${id}`;
/** 「各指標每週」資料表的 testid（PRD §4.7：chart-{page}-{id}-table）。 */
export const ASSIST_TABLE_TESTID = "chart-overview-assist-table";

/**
 * 其他常用指標表一格的「計算與來源」（本期、上期與各週共用；V3 AssistTable 的 open 原樣搬出來，輸出不變）。
 * name 用既有 domain 指標（件數、件均借 net_revenue，並以 unitOverride 不畫階梯）；件數、件均自帶公式與版本 assist-kpi-v1。
 */
export function assistEvidence(item: AssistKpi, period: Period, channels: string[]): EvidenceSelection {
  return { title: item.label, name: item.metric ?? "net_revenue", metric: { value: item.value, reason_codes: item.reason_codes }, period, channels, sources: item.sources, formula: item.formula, formulaTechnical: item.formulaTechnical, metricVersion: item.metric ? undefined : ASSIST_KPI_VERSION, nullDisplay: item.status === "not_applicable" ? labels.assist.notApplicable : undefined, unitOverride: item.unit === "count" ? "count" : item.unit === "money_per_unit" ? "money_per_unit" : undefined };
}

/** 與 assistKpis 同規則（assist-kpi.ts 的 status）：缺資料（MISSING_*、涵蓋未確認）是資料待補，其餘 null（分母 ≤ 0、件數 0）是不適用。 */
function weekStatus(value: AssistWeekValue): AssistKpi["status"] {
  if (value.value !== null) return "ok";
  return value.reason_codes.length === 0 || value.reason_codes.some(reason => reason.startsWith("MISSING") || reason === "SALES_COVERAGE_UNCONFIRMED") ? "missing" : "not_applicable";
}
/** 與本期、上期兩格相同的 L1 顯示（可及名稱用；資料表的格是 L2，見 C33）。 */
function weekDisplay(unit: AssistUnit, value: AssistWeekValue, status: AssistKpi["status"]): string {
  if (value.value === null) return status === "not_applicable" ? labels.assist.notApplicable : labels.shell.status.missing;
  switch (unit) {
    case "count": return formatCount(value.value, "L1");
    case "money_per_unit": return formatPerUnit(value.value, "L1");
    case "percent": return formatRateL1(value.value);
    case "multiple": return formatMultiple(value.value, "L1");
  }
}
/** 一週一個指標的格：沿用本期那一格的名稱、公式與版本，只換成該週的值、原因碼與來源列。 */
export function assistWeekItem(kpi: AssistKpi, value: AssistWeekValue, week: AssistWeek): AssistKpi {
  const status = weekStatus(value);
  return { ...kpi, value: value.value, reason_codes: [...value.reason_codes], status, display: weekDisplay(kpi.unit, value, status), sources: week.sources };
}
/** 資料表一格的抽屜（PRD §8.7）：值取自 domain，metric_version 不變；整理函式的版本放 arrangeVersion。 */
export function assistWeekEvidence(kpi: AssistKpi, value: AssistWeekValue, week: AssistWeek, channels: string[]): EvidenceSelection {
  return { ...assistEvidence(assistWeekItem(kpi, value, week), week.period, channels), arrangeVersion: ASSIST_WEEKS_VERSION };
}

/** 欄名「近 {n} 週」（n＝實際週數，上限 8）。 */
export const assistSparkHead = (data: AssistWeeks) => fill(spark.head, { n: data.weeks.length });

/**
 * 一列的 sparkline：圖形座標用 Number 近似值；件數的未滿 7 天的點空心（X40）。
 * 語意由同列的本期數字承擔（CL-1），所以本期值是資料待補或不適用時不畫（例如廣告費為 0 時的 MER、某天缺廣告列時的廣告佔比）；
 * 整列沒有任何週值時也不畫。這兩種情況各週的數字仍在「各指標每週」資料表裡。
 */
export function AssistSparkCell({ data, kpi }: { data: AssistWeeks; kpi: AssistKpi }) {
  const series = data.series.find(item => item.id === kpi.id);
  if (!series || kpi.value === null || series.values.every(value => value.value === null)) return null;
  const points = series.values.map((value, index) => ({ value: value.value === null ? null : Number(value.value), incomplete: !data.weeks[index].full }));
  return <Sparkline points={points} hollowIncomplete={series.level} testId={assistSparkTestId(kpi.id)} />;
}

const CELL_UNIT: Record<AssistUnit, ChartDataUnit> = { count: "count", money_per_unit: "per_unit", percent: "rate", multiple: "multiple" };
type Row = { kpi: AssistKpi; series: AssistWeekSeries };

/**
 * 「各指標每週」（C33）：列＝7 個指標（順序同兩張緊湊表），欄＝近 {n} 週（週名＋起訖；未滿 7 天的週欄頭加「未滿 7 天」），格＝L2，可開抽屜。
 * 件數與件均的單位寫在列名（rowUnit），比率與倍數的格本身帶 % 與倍。收合的 <details class="data-alternative">，保持掛載（M1）。
 */
export function AssistWeeksDetails({ data, kpis, channels, anchor, onEvidence }: { data: AssistWeeks; kpis: readonly AssistKpi[]; channels: string[]; anchor: string; onEvidence: (evidence: EvidenceSelection) => void }) {
  if (data.weeks.length === 0) return null;
  const rows: Row[] = kpis.flatMap(kpi => { const series = data.series.find(item => item.id === kpi.id); return series ? [{ kpi, series }] : []; });
  // 每一欄是一週（data＝週的索引）；欄的 unit 只讓欄頭與格靠右（數字欄），每格的單位由 valueOf 依列覆寫。
  const columns: ChartDataColumn<number>[] = data.weeks.map((week, index) => ({
    key: week.period.start, label: week.label, unit: "rate", layer: "L2", data: index,
    notes: [formatPeriodL1(week.period.start, week.period.end, { anchor, days: false }), ...(week.full ? [] : [labels.overview.trendV3.incompleteShort])],
  }));
  const value = (row: Row, column: ChartDataColumn<number>) => row.series.values[column.data];
  const rowLabel = (kpi: AssistKpi) => kpi.unit === "count" ? fill(spark.rowUnit.count, { label: kpi.label }) : kpi.unit === "money_per_unit" ? fill(spark.rowUnit.perUnit, { label: kpi.label }) : kpi.label;
  const incomplete = data.weeks.some(week => !week.full);
  return <ChartDataDetails<Row, number>
    title={spark.tableTitle}
    testId={ASSIST_TABLE_TESTID}
    caption={fill(spark.caption, { n: data.weeks.length })}
    rowHeaderLabel={ui.columns.metric}
    rows={rows}
    rowKey={row => row.kpi.id}
    rowHeader={row => ({ label: rowLabel(row.kpi), title: row.kpi.plain })}
    columns={columns}
    valueOf={(row, column) => { const cell = value(row, column); const status = weekStatus(cell); return { value: cell.value, reasonCodes: cell.reason_codes, unit: CELL_UNIT[row.kpi.unit], emptyText: status === "not_applicable" ? labels.assist.notApplicable : labels.shell.status.missing }; }}
    evidenceOf={(row, column) => assistWeekEvidence(row.kpi, value(row, column), data.weeks[column.data], channels)}
    onEvidence={onEvidence}
    cellAria={(row, column) => { const item = assistWeekItem(row.kpi, value(row, column), data.weeks[column.data]); return fill(ui.cellAria, { metric: item.label, period: data.weeks[column.data].label, value: item.display }); }}
    notes={incomplete ? [spark.incompleteNote] : []}
  />;
}
