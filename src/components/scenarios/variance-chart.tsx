"use client";

import Decimal from "decimal.js";
import { MAX_SCENARIOS, type ScenarioPlan } from "@/application/decision";
import { formatHeadlineAmount } from "@/application/copy";
import { deltaTone, formatAmountL1, formatSignedDelta, metricDefinitions } from "@/application/presentation";
import { fill, labels } from "@/i18n";
import { chartDataTable, type ChartDataCell, type ChartDataColumn } from "../charts/chart-data-table";
import { RankedBars, type RankedBarRow, type RankedBarTone } from "../charts/ranked-bars";
import { ChartFrame } from "../overview/charts/chart-frame";

// V4-5 代理 B：G15 方案差額（PRD §4.1–§4.7 G15、§5.4 第 3 列、§8.7；CHART_CATALOG G15；06_BATCHES V4-5）。
// 試算頁 DecisionWorkbench 內、方案欄 scenario-columns 之後、方案比較表 section.scenario-compare 之前，每個 DecisionWorkbench 一份（頁面同時只渲染目前通路的一份，全頁唯一，M6）。
// 資料：plans[].result（status "valid" 的 contribution、delta）、plans[].name、plans[].id、本期基準的扣廣告後貢獻（現況）；結果尚未產生（或不能試算）的方案不畫柱，
// 與方案比較表的 planCell 同規則（資料表照列：還沒試算寫「尚未試算」、試算後沒有結果寫「不適用」，V4-5 代理 C 依審查 B-R1 改）。只重新呈現 domain 算好的值（A 級），不做任何跨方案、跨通路的加總；golden 284.00／264.00／19.70 不變。
// C25 RankedBars variance：≤ 3 根、列高 row24、柱列之後 1 列軸列（零線＝現況，「現況 {amount}」），（根數＋1）× 24 ≤ sm 180；從 0 起，正負都有時零線在中間。
// 色依 deltaTone(contribution_after_marketing, delta, "L1")：少賺 unfavorable、多賺 favorable（D-V3-7 有利不用綠），與方案欄的「與現況相比」同一個判斷；方案名在左、值在條端 L1 帶號。
// 柱不可點（PRD §8.7 例外：試算結果是假設、不是 CSV 彙總；v3 的 scenario-contribution、scenario-delta 與比較表本來就是純文字），不記 chart_clicked；
// 圖容器 aria-hidden、圖內 0 個可聚焦元素；鍵盤經資料表（C33，L2 純文字）。現況基準的抽屜沿用基準列既有的 baseline-* number-link。
// 模型是純函式（scenarioVarianceModel），區塊元件沒有 hook：DecisionWorkbench 的 hooks harness（tests/scenario-page-v3.test.tsx、scenario-form.test.tsx）
// 只接管 useState／useMemo／useId／useEffect，量寬的 ResizeObserver 留在 RankedBars 裡。沒有任何有效結果時是空狀態（不掛 RankedBars，載入示範資料時的成本只有框與 1–3 列的資料表）。

const copy = labels.scenarios.chartsV4.variance;
const ui = labels.scenarios.decision;
const METRIC = metricDefinitions.contribution_after_marketing.label;
const yuanColumn = (label: string) => fill(labels.format.units.yuanColumn, { label });

export const SCENARIOS_VARIANCE_TESTID = "chart-scenarios-variance";
export const SCENARIOS_VARIANCE_BAR_PREFIX = "chart-scenarios-variance-bar-";
export const SCENARIOS_VARIANCE_TABLE_TESTID = "chart-scenarios-variance-table";

/** 模型的輸入（呼叫端 DecisionWorkbench 傳入頁面已有的值；不讀全域、不存模組層級的使用者資料）。 */
export interface ScenarioVarianceInput {
  /** 本通路的方案（含進頁草稿）；只取前 MAX_SCENARIOS 個。 */
  plans: readonly Pick<ScenarioPlan, "id" | "name" | "result">[];
  /** 現況：本期基準的扣廣告後貢獻（domain 精確字串；不能試算的基準可能是 null）。 */
  baseline: string | null;
  /** 試算通路（channelsLabel，示範資料用 alias）。 */
  channels: string;
  /** 本期起訖（formatPeriodL1，M/D–M/D）。 */
  period: string;
  /** 過期時接在副標後面的既有「（已過期）」；不過期時空字串。 */
  staleSuffix: string;
}

/**
 * 資料表的一列（每個方案一列）：valid 時是 domain 的精確字串，否則 null。
 * V4-5 代理 C（審查 B-R1；PRD §4.3 G15「結果尚未產生的方案不畫（與比較表同規則）；結果 null 時寫『不適用』」）：status 分三種——
 * valid（有結果）、pending（還沒按「試算」，plan.result 是 null，格寫比較表同一句「尚未試算」）、notApplicable（試算過但 invalid／ineligible，格寫「不適用」）。
 */
export interface ScenarioVarianceTableRow {
  id: string;
  name: string;
  status: "valid" | "pending" | "notApplicable";
  contribution: string | null;
  delta: string | null;
}

export interface ScenarioVarianceModel {
  /** 結論標題；沒有任何有效結果時是區塊標準名。 */
  title: string;
  titleKind: "more" | "less" | "flat" | "empty";
  /** 標題取用的方案 id（差額絕對值最大者）；沒有有效結果時 null。 */
  leadId: string | null;
  subtitle: string;
  section: string;
  /** 每個有效結果一根柱（plan 順序；不可點，evidence 為 null）。 */
  bars: RankedBarRow<null>[];
  /** 軸列文字「現況 {amount}」。 */
  axis: string;
  tableRows: ScenarioVarianceTableRow[];
}

const validResult = (plan: Pick<ScenarioPlan, "result">) => plan.result?.status === "valid" ? plan.result : null;
/** 與方案欄的 scenario-delta 同一個判斷（L1：取位到元後為 0 的差額不上色、標題用持平）。 */
const toneOf = (delta: string): RankedBarTone => {
  const tone = deltaTone("contribution_after_marketing", delta, "L1");
  return tone === "neutral" ? "total" : tone;
};
/** 方案名稱是空白時（進頁草稿被清空名稱）列名改用「方案 {n}」，資料表的列名欄不會是空的。 */
const planLabel = (name: string, index: number) => name.trim() === "" ? fill(ui.planLegend, { n: index + 1 }) : name;

/**
 * G15 的模型（純函式）：柱＝有效結果（plan 順序），標題取差額絕對值最大的方案（同值取排在前面的；只挑選，不相加），資料表列出全部方案。
 * 只用 domain 的 result.contribution、result.delta 與基準值，不產生新數字。
 */
export function scenarioVarianceModel({ plans, baseline, channels, period, staleSuffix }: ScenarioVarianceInput): ScenarioVarianceModel {
  const shown = plans.slice(0, MAX_SCENARIOS);
  const section = copy.section;
  const tableRows = shown.map((plan, index): ScenarioVarianceTableRow => {
    const result = validResult(plan);
    return { id: plan.id, name: planLabel(plan.name, index), status: result ? "valid" : plan.result ? "notApplicable" : "pending", contribution: result?.contribution ?? null, delta: result?.delta ?? null };
  });
  const valid = tableRows.filter((row): row is ScenarioVarianceTableRow & { delta: string } => row.delta !== null);
  const bars = valid.map((row): RankedBarRow<null> => ({ key: row.id, label: row.name, value: row.delta, tone: toneOf(row.delta), display: formatSignedDelta(row.delta, "L1"), evidence: null }));
  let lead: (typeof valid)[number] | null = null;
  for (const row of valid) if (lead === null || new Decimal(row.delta).abs().gt(new Decimal(lead.delta).abs())) lead = row;
  const tone = lead === null ? null : deltaTone("contribution_after_marketing", lead.delta, "L1");
  const titleKind: ScenarioVarianceModel["titleKind"] = tone === null ? "empty" : tone === "favorable" ? "more" : tone === "unfavorable" ? "less" : "flat";
  const title = lead === null || titleKind === "empty" ? section : fill(copy.title[titleKind], { plan: lead.name, amount: formatHeadlineAmount(lead.delta) });
  return {
    title, titleKind, leadId: lead?.id ?? null, section, bars, tableRows,
    subtitle: `${fill(copy.subtitle, { section, metric: METRIC, baseline: formatAmountL1(baseline), channels, period })}${staleSuffix}`,
    axis: fill(copy.axis, { amount: formatAmountL1(baseline) }),
  };
}

type VarianceColumn = "contribution" | "delta";
/** G15 資料表欄（CHART_CATALOG G15）：試算後的扣廣告後貢獻（元）、與現況相比（元），沿用 scenarios.inputs 既有字串；L2 純文字。 */
export const SCENARIO_VARIANCE_COLUMNS: readonly ChartDataColumn<VarianceColumn>[] = [
  { key: "contribution", label: yuanColumn(labels.scenarios.inputs.resultTitle), unit: "money", layer: "L2", data: "contribution" },
  { key: "delta", label: yuanColumn(labels.scenarios.inputs.vsBaseline), unit: "signed", layer: "L2", data: "delta" },
];
/**
 * 格：還沒試算寫「尚未試算」（同 planCell）、試算後沒有結果寫「不適用」（V4-5 代理 C，審查 B-R1）；差額不利時上不利色（只有不利上色，D-V3-7；同 V4-4 C33 的 unfavorable）。
 */
function varianceCell(row: ScenarioVarianceTableRow, column: VarianceColumn): ChartDataCell {
  const value = row[column];
  return { value, emptyText: row.status === "notApplicable" ? labels.shell.status.notApplicable : ui.notCalculated, unfavorable: column === "delta" && deltaTone("contribution_after_marketing", value, "L2") === "unfavorable" };
}
/** 資料表格都不是 number-link（PRD §8.7 例外）。 */
const noEvidence = () => null;

export interface ScenarioVarianceSectionProps {
  /** scenarioVarianceModel(...) 的輸出。 */
  model: ScenarioVarianceModel;
  /**
   * V4-5 代理 C（審查 B-R3）：空狀態的說明；不給時用 copy.empty（「填好假設並按『試算』後…」）。
   * 使用者不能填或不能試算時（基準不適用、試算已過期），DecisionWorkbench 傳既有的 scenarios.decision.unavailableTitle／staleTitle。
   */
  emptyMessage?: string;
}

/** 試算頁 G15：ChartFrame（id scenarios-variance、testid chart-scenarios-variance、h2、sm）＋C25 variance（row24＋軸列）＋C33 資料表（L2 純文字）。 */
export function ScenarioVarianceSection({ model, emptyMessage }: ScenarioVarianceSectionProps) {
  const empty = model.bars.length === 0;
  const dataTable = chartDataTable<ScenarioVarianceTableRow, VarianceColumn>({
    title: model.section,
    testId: SCENARIOS_VARIANCE_TABLE_TESTID,
    caption: yuanColumn(model.section),
    rowHeaderLabel: ui.planName,
    rows: model.tableRows,
    rowKey: row => row.id,
    rowHeader: row => ({ label: row.name }),
    columns: SCENARIO_VARIANCE_COLUMNS,
    valueOf: (row, column) => varianceCell(row, column.data),
    evidenceOf: noEvidence,
    onEvidence: noEvidence,
    notes: [copy.tableNote],
    className: "scenarios-variance-table",
  });
  return <ChartFrame id="scenarios-variance" page="scenarios" testId={SCENARIOS_VARIANCE_TESTID} className="scenario-variance" title={model.title} subtitle={model.subtitle}
    height="sm" state={empty ? "empty" : undefined} message={empty ? emptyMessage ?? copy.empty : undefined} dataTable={dataTable}>
    {empty ? null : <RankedBars mode="variance" rows={model.bars} rowHeight="row24" axis={model.axis} testIdPrefix={SCENARIOS_VARIANCE_BAR_PREFIX} />}
  </ChartFrame>;
}
