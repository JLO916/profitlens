"use client";

import { channelLabel } from "@/application/copy";
import type { SummaryScenario } from "@/application/manager-summary";
import { deltaTone, formatSignedDelta, metricDefinitions } from "@/application/presentation";
import type { ScenarioSelectionRef } from "@/application/scenario-workspace";
import { fill, labels } from "@/i18n";
import { chartDataTable, type ChartDataCell } from "../charts/chart-data-table";
import { RankedBars, hbarMaxRows, type RankedBarRow } from "../charts/ranked-bars";
import { ChartFrame } from "../overview/charts/chart-frame";
import { SCENARIO_VARIANCE_COLUMNS, varianceBarTone } from "../scenarios/variance-chart";

// V4-6 代理 B：G15 會議實例（PRD §4.1–§4.7 G15「會議／議程 5（第二實例）」、§6.1 variant／headingLevel、§8.7；CHART_CATALOG G15；06_BATCHES V4-6）。
// 位置：會議頁議程 5（AgendaItem n=5，h3）內、說明句之後、每通路選入列 meeting-scenario-results 之前（src/components/meeting-page.tsx）；
// 只在會議有選入方案（context.scenarios 非空）時渲染——沒有選入方案時議程 5 維持 v3 的區段型空狀態（meeting-scenario-results-empty），DOM 不變，也不重複一句空狀態。
// 資料：buildReviewDecisionContext 的 context.scenarios[i]（SummaryScenario：id、name、status、baseline、contribution、delta）與 review.selected_scenarios[i]（通路、方案 id），
// 兩者同一個順序（同 meeting-page.tsx 的 scenarioRows）。會議每通路最多選一個已試算的方案（docs/SCENARIOS.md:76），所以每個通路最多一根。
// 只重新呈現 domain 算好的試算結果（A 級；不重算、不跨通路相加、不挑跨通路的最大值），也不改會議凍結資料、備份與匯出（manager-summary.ts、meeting.ts 只讀）。
// C25 RankedBars variance：列序＝會議範圍的通路順序（同議程 5 的每通路列）；status＝stale 的方案不畫柱，只列在資料表並在列名後標既有的「過期」；
// 最多 MEETING_SCENARIOS_MAX_BARS（6）根，其餘只列在資料表，最後一列寫「另 {n} 個」。零線＝每個通路自己的現況（各通路基準不同，軸文字「各通路現況」不寫金額）；
// 軸文字與「另 n 個」共用最後一列（RankedBars axisWithMore），（6＋1）× row24＝168 ≤ sm 180。
// 色依 deltaTone(contribution_after_marketing, delta, "L1")：少賺 unfavorable、多賺 favorable（D-V3-7 有利不用綠），取位到元後為 0 時 total——與試算頁 G15 同一個判斷（varianceBarTone）；
// 試算是假設、不是本期資料，不用強調色 chartColors.current。柱不可點（PRD §8.7 例外：試算結果與會議凍結值在 v3 就不是 number-link），沒有 onBarClick、不記 chart_clicked；
// 圖容器 aria-hidden、圖內 0 個可聚焦元素；鍵盤經資料表（C33，L2 純文字，全部列，含超過 6 根與過期的）。
// 投影：議程 5 在投影中隱藏（globals.css 的 :root[data-mode="present"] .meeting-agenda-list > .meeting-agenda-entry:nth-child(n+3)），只顯示議程 1–2。
// 本檔只給會議頁（隨頁載入的 chunk）用，不在首載（tests/lazy-panels.test.tsx 的拆分清單）；沒有 hook（會議頁的 hooks harness 不呼叫子元件，量寬的 ResizeObserver 留在 RankedBars）。

const copy = labels.meeting.chartsV4.scenarios;
const METRIC = metricDefinitions.contribution_after_marketing.label;
const yuanColumn = (label: string) => fill(labels.format.units.yuanColumn, { label });

export const MEETING_SCENARIOS_TESTID = "chart-meeting-scenarios";
export const MEETING_SCENARIOS_BAR_PREFIX = "chart-meeting-scenarios-bar-";
export const MEETING_SCENARIOS_TABLE_TESTID = "chart-meeting-scenarios-table";
/** 柱數上限：sm 180 ÷ row24 24＝7 列，留 1 列給軸文字（有「另 n 個」時兩者共用這一列）→ 6（PRD §4.4 G15）。 */
export const MEETING_SCENARIOS_MAX_BARS = hbarMaxRows("sm", "row24", 1);

/** 模型的輸入（呼叫端 MeetingPage 傳入頁面已有的值；不讀全域、不存模組層級的使用者資料）。 */
export interface MeetingScenariosInput {
  /** 會議選入的方案（buildReviewDecisionContext(...).scenarios），與 references 同一個順序。 */
  scenarios: readonly SummaryScenario[];
  /** review.selected_scenarios：每一項的通路與方案 id（柱的 testid 尾段＝方案 id）。 */
  references: readonly Pick<ScenarioSelectionRef, "channel" | "plan_id">[];
  /** 會議範圍的通路（review.meeting_filters.channels）：列的順序。 */
  channels: readonly string[];
  /** 通路名稱是否用示範別名（會議固定來源的 demoAlias）。 */
  alias: boolean;
  /** 會議本期（formatPeriodL1，M/D–M/D）。 */
  period: string;
}

/** 資料表的一列（每個選入方案一列）。 */
export interface MeetingScenarioRow {
  /** SummaryScenario.id（context::plan::revision，會議內唯一）：React key 與資料表列 key。 */
  key: string;
  /** 方案 id（柱的 testid 尾段；方案 id 由 crypto.randomUUID 產生，跨通路唯一）。 */
  planId: string;
  channel: string;
  /** 「{方案} · {通路}」。 */
  label: string;
  stale: boolean;
  /** domain 的精確字串（試算後的扣廣告後貢獻、與現況相比）；沒有時 null。 */
  contribution: string | null;
  delta: string | null;
}

export interface MeetingScenariosModel {
  /** 結論標題「{n} 個通路的選入方案」；沒有可畫的方案時是區塊標準名。 */
  title: string;
  section: string;
  subtitle: string;
  /** 可畫的方案數（目前資料、有差額；過期的不算）＝標題的 n。 */
  count: number;
  /** 柱（列序；最多 MEETING_SCENARIOS_MAX_BARS 根；不可點，evidence 為 null）。 */
  bars: RankedBarRow<null>[];
  /** 「另 {n} 個」（只在可畫的方案超過上限時）。 */
  more: string | undefined;
  axis: string;
  /** 過期方案數（副標註記）。 */
  staleCount: number;
  /** 資料表列：全部選入方案（含超過上限與過期的）。 */
  tableRows: MeetingScenarioRow[];
}

/**
 * G15 會議實例的模型（純函式）：列序＝會議範圍的通路順序（不在範圍內的接在後面，維持原順序）；可畫＝不是過期、而且有差額；
 * 柱＝前 MEETING_SCENARIOS_MAX_BARS 個可畫的列。只挑選與排列 domain 的值，不產生新數字（標題的 n 是列數）。
 */
export function meetingScenariosModel({ scenarios, references, channels, alias, period }: MeetingScenariosInput): MeetingScenariosModel {
  const position = (channel: string) => { const index = channels.indexOf(channel); return index < 0 ? channels.length : index; };
  const selected = scenarios.map((scenario, index): MeetingScenarioRow => {
    const reference = references[index];
    const channel = reference?.channel ?? "";
    return {
      key: scenario.id, planId: reference?.plan_id ?? scenario.id, channel,
      label: fill(copy.row, { plan: scenario.name, channel: channelLabel(channel, alias) }),
      stale: scenario.status === "stale", contribution: scenario.contribution ?? null, delta: scenario.delta ?? null,
    };
  });
  // 穩定排序：同一個位置（不在範圍內的通路）維持選入順序。
  const rows = selected.map((row, index) => ({ row, index })).sort((a, b) => position(a.row.channel) - position(b.row.channel) || a.index - b.index).map(item => item.row);
  const drawable = rows.filter((row): row is MeetingScenarioRow & { delta: string } => !row.stale && row.delta !== null);
  const shown = drawable.slice(0, MEETING_SCENARIOS_MAX_BARS);
  const hidden = drawable.length - shown.length;
  const staleCount = rows.filter(row => row.stale).length;
  const section = copy.section;
  const subtitle = fill(copy.subtitle, { section, metric: METRIC, period });
  return {
    title: drawable.length ? fill(copy.title, { n: drawable.length }) : section,
    section, count: drawable.length, staleCount,
    subtitle: staleCount ? `${subtitle} · ${fill(copy.staleNote, { n: staleCount })}` : subtitle,
    bars: shown.map((row): RankedBarRow<null> => ({ key: row.key, label: row.label, value: row.delta, tone: varianceBarTone(row.delta), display: formatSignedDelta(row.delta, "L1"), evidence: null, testId: `${MEETING_SCENARIOS_BAR_PREFIX}${row.planId}` })),
    more: hidden > 0 ? fill(copy.more, { n: hidden }) : undefined,
    axis: copy.axis,
    tableRows: rows,
  };
}

type ScenarioColumn = (typeof SCENARIO_VARIANCE_COLUMNS)[number]["data"];
/** 格：domain 的值（L2 純文字）；沒有值時寫「不適用」；差額不利時上不利色（只有不利上色，D-V3-7；同試算頁 G15 資料表）。 */
function scenarioCell(row: MeetingScenarioRow, column: ScenarioColumn): ChartDataCell {
  const value = row[column];
  return { value, emptyText: labels.shell.status.notApplicable, unfavorable: column === "delta" && deltaTone("contribution_after_marketing", value, "L2") === "unfavorable" };
}
/** 列名：過期的方案在列名後面接既有的「過期」（meeting.managerSummary.scenarioStale）。 */
const rowName = (row: MeetingScenarioRow) => row.stale ? fill(copy.rowStatus, { row: row.label, status: labels.meeting.managerSummary.scenarioStale }) : row.label;
/** 資料表格都不是 number-link（PRD §8.7 例外）。 */
const noEvidence = () => null;

/** G15 會議實例的區塊（沒有 hook）：ChartFrame（id meeting-scenarios、testid chart-meeting-scenarios、inline、h4、sm）＋C25 variance（row24＋軸文字）＋C33 資料表。 */
export function MeetingScenariosSection({ model }: { model: MeetingScenariosModel }) {
  const empty = model.bars.length === 0;
  const dataTable = chartDataTable<MeetingScenarioRow, ScenarioColumn>({
    title: model.section,
    testId: MEETING_SCENARIOS_TABLE_TESTID,
    caption: yuanColumn(model.section),
    rowHeaderLabel: copy.planColumn,
    rows: model.tableRows,
    rowKey: row => row.key,
    rowHeader: row => ({ label: rowName(row) }),
    columns: SCENARIO_VARIANCE_COLUMNS,
    valueOf: (row, column) => scenarioCell(row, column.data),
    evidenceOf: noEvidence,
    onEvidence: noEvidence,
    notes: [copy.tableNote],
    className: "meeting-scenarios-table",
  });
  return <ChartFrame id="meeting-scenarios" page="meeting" testId={MEETING_SCENARIOS_TESTID} className="meeting-scenarios-chart" variant="inline" headingLevel={4} title={model.title} subtitle={model.subtitle}
    height="sm" state={empty ? "empty" : undefined} message={empty ? copy.empty : undefined} dataTable={dataTable}>
    {empty ? null : <RankedBars mode="variance" rows={model.bars} rowHeight="row24" axis={model.axis} more={model.more} axisWithMore testIdPrefix={MEETING_SCENARIOS_BAR_PREFIX} />}
  </ChartFrame>;
}

/** 會議頁用的進入點（沒有 hook）：組模型後渲染區塊。 */
export function MeetingScenariosChart(props: MeetingScenariosInput) {
  return <MeetingScenariosSection model={meetingScenariosModel(props)} />;
}
