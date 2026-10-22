import type { CellObject, WorkSheet } from "xlsx";
import { parseCents } from "../domain/money";
import type { ProductComparisonRow } from "../domain/product-comparison";
import { AMOUNT_FIELDS, type Dataset, type Metric, type Period } from "../domain/types";
import { fill, labels } from "../i18n";
import { heatSectionModel } from "../components/diagnosis/heat-section";
import { ratesModel, RATES_TABLE_COLUMNS } from "../components/diagnosis/rates-section";
import { sharePerHundredText, shareSectionModel, shareTableCell, SHARE_TABLE_COLUMNS } from "../components/diagnosis/share-section";
import { paretoSectionModel, PARETO_TABLE_COLUMNS, varianceSectionModel, VARIANCE_TABLE_COLUMNS, type ProductChartScope } from "../components/products/highlight-charts";
import { actionDocuments, type ActionExecutionStatus, type ActionWorkspace } from "./action-workspace";
import { ASSIST_KPI_VERSION, type AssistKpi, type AssistUnit } from "./assist-kpi";
import { ASSIST_WEEKS_VERSION, assistWeeks } from "./chart-assist-weeks";
import { CHANNEL_WEEKS_VERSION, channelWeeks, channelWeeksAvailable, recentChannelWeeks } from "./chart-channel-weeks";
import { CUMULATIVE_DAILY_VERSION, cumulativeConclusion, cumulativeDaily } from "./chart-cumulative";
import type { HeatCell } from "./chart-heatmap";
import { PRODUCT_PARETO_LIMIT, PRODUCT_PARETO_VERSION, productPareto } from "./chart-pareto";
import { CHANNEL_STRUCTURE_VERSION } from "./chart-structure";
import { channelConclusion } from "./chart-takeaways";
import { variantHeaderLines, variantKpis, variantOneLiner, variantSpec, type ExcelSheetKey, type ExportVariant, type ExportVariantSpec } from "./export-variants";
import { BREAKEVEN_MER_VERSION, breakevenMer, type BreakevenMer } from "./breakeven-mer";
import { categoryLabel, channelLabel, channelsLabel, conversionSentence, csvHeader, scopeLabel, snapshotResolver } from "./copy";
import { makeResolver, type NameResolver } from "./channel-settings";
import { downloadBinary } from "./download";
import { buildExportHeader } from "./export-header";
import { argb, EXPORT_THEME } from "./export-theme";
import { metricComparison, type ManagerSummary, type SummaryMetric } from "./manager-summary";
import { pnlExportTable } from "./pnl-table";
import { dataStatus, productHighlights } from "./product-highlights";
import type { TaxConversion } from "./tax-basis";
import { formatEmpty, formatMultiple, formatPeriodExport, formatPeriodL1, metricDefinitions } from "./presentation";
import { bridgeWaterfall, profitWaterfall } from "./waterfall";
import type { WorkspaceSnapshot } from "./workspace";

// R6-4 Excel 匯出（D4＝A：SheetJS xlsx 0.18.5）。
// buildExcelWorkbook 是純資料層：只讀既有的摘要、快照、商品比較與待辦，不重算任何財務公式，也不碰 xlsx。
// writeExcel 才動態載入 xlsx（主 bundle 不含）；文字一律寫成字串格、絕不產生公式格，並沿用 CSV 的防注入規則。

/** number 格的 format（V4-9b）：同一欄混放不同單位的工作表（「圖表資料」）逐格指定數字格式；沒有時用工作表的欄格式。 */
export type ExcelCell = { kind: "text"; value: string } | { kind: "number"; value: number; format?: ExcelNumberFormat } | { kind: "null" };
/**
 * 數字格的顯示格式（只影響 Excel 顯示，不改數值；格子仍是數字，可加總、可排序）。V3-2b §3.3：Excel 有 L2 與 L3。
 * money_l2：摘要、通路表用整數元（L2）；money：拆解、商品明細到分（L3）；ratio：百分比兩位小數（L3）；count：件數整數。
 * 負號一律用 U+2212（Excel 是給人看的文件；CSV／JSON 才保留 ASCII「-」）。金額欄的表頭加「（元）」，儲存格內不帶單位。
 * V3-9b money_paren：只用在管理損益表工作表（D-V3-8，PRD §9.6）——到分、負數用括號 (1,234.00)。
 */
export type ExcelNumberFormat = "money" | "money_l2" | "money_paren" | "ratio" | "count";
export interface ExcelSheet {
  name: string; header: string[]; rows: ExcelCell[][];
  /** 每欄的數字格式（與 header 等長）；沒有就是一般格式。只套在 number 格。 */
  formats?: (ExcelNumberFormat | null)[];
}
export interface ExcelWorkbook { sheets: ExcelSheet[] }
export interface ExcelMeeting { name: string; date: string; decision: string; notes: string }
export interface ExcelExportInput {
  /** V3-9b 開工錨點（F14）：匯出範本變體；B 代理實作版面差異，預設 standard。 */
  variant?: ExportVariant;
  /** buildManagerSummary(snapshot, …) 的結果；必須來自同一個 snapshot（資料版本與範圍版本相同）。 */
  summary: ManagerSummary;
  snapshot: WorkspaceSnapshot;
  dataset: Dataset;
  actions: ActionWorkspace;
  /** compareProducts(dataset, snapshot.report.scope).rows；沒給就是只有表頭的商品比較表。 */
  products?: readonly ProductComparisonRow[];
  conversion?: TaxConversion | null;
  meeting?: ExcelMeeting | null;
  /** V3-7 版頭的產出時間（預設現在；測試注入固定時間）。 */
  generatedAt?: Date;
  /** V3-7 版頭第 1 行；預設 dataset_id。 */
  datasetName?: string;
}

export const EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/** Excel 單格文字上限（字元數）；超過時 Excel 會說檔案有問題。 */
export const EXCEL_CELL_TEXT_LIMIT = 32767;
/** Excel 工作表名稱上限。 */
export const EXCEL_SHEET_NAME_LIMIT = 31;
/**
 * Excel 自訂格式：「正;負;零」三段，負段用字面的 U+2212。L2 用條件段：|值| < 0.5 元顯示 0（與 formatAmountL2 取位後為零不帶符號一致）。
 * Excel 顯示取位是四捨五入（.5 遠離零），與 HALF_UP 相同。
 */
export const EXCEL_NUMBER_FORMATS: Record<ExcelNumberFormat, string> = {
  money: '#,##0.00;"−"#,##0.00;0.00',
  money_l2: '[>=0.5]#,##0;[<=-0.5]"−"#,##0;0',
  money_paren: "#,##0.00;(#,##0.00)",
  ratio: '0.00%;"−"0.00%;0.00%',
  count: '#,##0;"−"#,##0;0',
};
const NUMBER_FORMATS = EXCEL_NUMBER_FORMATS;
const isMoneyFormat = (format: ExcelNumberFormat | null | undefined): boolean => format === "money" || format === "money_l2" || format === "money_paren";

const text = (value: string): ExcelCell => ({ kind: "text", value });
const EMPTY: ExcelCell = { kind: "null" };
/** 有限數字才寫得進 Excel；-0 一律寫成 0。 */
function finite(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError("INVALID_EXCEL_NUMBER");
  return value === 0 ? 0 : value;
}
const numeric = (value: number): ExcelCell => ({ kind: "number", value: finite(value) });
/** 超過 10 兆元（10^15 分）時，Number 不保證能換回同一個「分」，改寫原字串（文字格），不偷偷四捨五入。 */
const MONEY_NUMBER_LIMIT_CENTS = 10n ** 15n;
/** 金額（domain 的兩位小數字串）→ 數字格；null → 空格；不是金額字串就丟 INVALID_MONEY。 */
export function moneyCell(value: string | null): ExcelCell {
  const cents = parseCents(value);
  if (cents === null) return EMPTY;
  if (cents >= MONEY_NUMBER_LIMIT_CENTS || cents <= -MONEY_NUMBER_LIMIT_CENTS) return text(value!);
  return numeric(Number(value));
}
/** 比率（分子 ÷ 分母的小數字串，不是百分比）→ 小數數字格，例如 "0.482142857143" → 0.482142857143。 */
export function ratioCell(value: string | null): ExcelCell {
  if (value === null) return EMPTY;
  if (typeof value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(value)) throw new TypeError("INVALID_RATIO");
  return numeric(Number(value));
}
/** 件數（整數字串）→ 整數數字格；超過安全整數時改寫原字串，不失真。 */
export function countCell(value: string | null): ExcelCell {
  if (value === null) return EMPTY;
  if (typeof value !== "string" || !/^-?\d+$/.test(value)) throw new TypeError("INVALID_COUNT");
  const count = Number(value);
  return Number.isSafeInteger(count) ? numeric(count) : text(value);
}

type Columns = Readonly<Record<string, string>>;
type SheetRecord<C extends Columns> = Partial<Record<keyof C & string, ExcelCell>>;
/** 欄位順序＝labels 物件的 key 順序；每列依 key 取值，缺的欄位是空格。金額欄的表頭加「（元）」（§8.5 規則 5：單位只標一次）。 */
function sheet<C extends Columns>(name: string, columns: C, records: readonly SheetRecord<C>[], formats: Partial<Record<keyof C & string, ExcelNumberFormat>> = {}): ExcelSheet {
  const keys = Object.keys(columns) as (keyof C & string)[];
  return { name, header: keys.map(key => excelHeader(columns[key], formats[key])), rows: records.map(record => keys.map(key => record[key] ?? EMPTY)), formats: keys.map(key => formats[key] ?? null) };
}
/** 工作表表頭：金額欄加「（元）」，其他欄沿用 labels。 */
export function excelHeader(label: string, format?: ExcelNumberFormat | null): string {
  return isMoneyFormat(format) ? fill(labels.exports.common.moneyColumn, { label }) : label;
}
/** labels 的對照表只認自己的 key（避免 "constructor" 之類的原型屬性）；查不到就原樣顯示。 */
function lookup(table: Readonly<Record<string, string>>, key: string): string {
  return Object.hasOwn(table, key) ? table[key] : key;
}

const copy = labels.exports.excel;
const EXECUTION_STATUS: Record<ActionExecutionStatus, string> = {
  not_started: labels.actions.form.statuses.not_started, in_progress: labels.actions.form.statuses.in_progress, blocked: labels.actions.form.statuses.blocked, completed: labels.actions.form.statuses.done,
};

function summarySheet(input: ExcelExportInput, spec: ExportVariantSpec): ExcelSheet {
  const { summary, dataset, meeting } = input;
  const resolver = snapshotResolver(input.snapshot);
  const s = copy.summary;
  const info = (section: string, item: string, detail: string) => ({ section: text(section), item: text(item), detail: text(detail) });
  // 版頭的期間用匯出格式「2026-07-13 至 2026-08-23（42 天）」（§8.6；天數含頭尾，與 domain 的 previous_days／current_days 相同）。
  const period = (range: Period) => formatPeriodExport(range.start, range.end);
  const missing = (metrics: Metric[]) => {
    const reasons = [...new Set(metrics.filter(metric => metric.value === null).flatMap(metric => metric.reason_codes))];
    return metrics.some(metric => metric.value === null) ? text(fill(labels.meeting.managerSummary.missingWithReasons, { reasons: reasons.join("、") })) : EMPTY;
  };
  // V3-7 §7.9／§9.6：摘要工作表最前面是版頭四列（區塊「版頭」，內容欄放各行），之後才是既有的資料範圍與關鍵數字（列與數值不變）。
  const header = buildExportHeader({
    datasetName: input.datasetName ?? summary.dataset_id, metricVersion: summary.metric_version, generatedAt: input.generatedAt ?? new Date(),
    amountBasis: input.conversion || summary.conversion_note ? "inclusive" : "exclusive",
    scope: { previous: summary.scope.previous_period, current: summary.scope.current_period, previousDays: summary.previous_days, currentDays: summary.current_days },
  });
  // V3-9b F14：客戶報告版在版頭第 1 行之後多一列客戶行（variantHeaderLines）；標準版與老闆一頁版是原本四列。
  const records: SheetRecord<typeof copy.columns.summary>[] = variantHeaderLines(header, spec).map(line => ({ section: text(labels.exports.headerV3.excelSection), detail: text(line) }));
  const total = scopeLabel({ kind: "all", channels: summary.scope.channels }, resolver);
  // V3-9b F14 老闆一頁版：只留 L1——本期一句話、四個關鍵數字、三件事的標題與影響金額、決議一列；數字與標準版同一個 summary／snapshot。
  if (spec.sections.kpis === "four") {
    if (spec.sections.oneLiner) records.push({ section: text(labels.overview.snapshotUi.heading), detail: text(variantOneLiner(summary, input.snapshot)) });
    for (const row of variantKpis(summary, input.snapshot.report)) records.push({
      section: text(s.sections.keyDeltas), item: text(labels.metrics[row.metric].headline), scope: text(total),
      previous: moneyCell(row.previous.value), current: moneyCell(row.current.value), change: moneyCell(row.change.value), detail: missing([row.previous, row.current, row.change]),
    });
    if (!summary.priorities.length) records.push({ section: text(s.sections.topThree), detail: text(labels.overview.notes.noPriorities) });
    for (const [index, item] of summary.priorities.entries()) records.push({ section: text(s.sections.topThree), item: text(fill(s.priorityItem, { n: index + 1, headline: item.title })), impact: moneyCell((item.impact ?? item.ranking_amount).value) });
    if (meeting) records.push(info(s.sections.meeting, s.items.decision, lookup(labels.meeting.form.decisions, meeting.decision)));
    return sheet(copy.sheets.summary, copy.columns.summary, records, { previous: "money_l2", current: "money_l2", change: "money_l2", impact: "money_l2" });
  }
  records.push(
    info(s.sections.scope, s.items.dataset, dataset.manifest.dataset_id),
    info(s.sections.scope, s.items.source, lookup(s.sourceTypes, dataset.manifest.source_type)),
    info(s.sections.scope, s.items.asOf, summary.data_as_of),
    info(s.sections.scope, s.items.previous, period(summary.scope.previous_period)),
    info(s.sections.scope, s.items.current, period(summary.scope.current_period)),
    info(s.sections.scope, s.items.comparison, summary.scope.comparison_mode === "calendar_months" ? labels.shell.periods.calendarMonths : labels.shell.periods.sameDays),
    info(s.sections.scope, s.items.channels, channelsLabel(summary.scope.channels, resolver)),
  );
  for (const row of summary.headlines) records.push({
    section: text(s.sections.keyDeltas), item: text(labels.metrics[row.metric].headline), scope: text(total),
    previous: moneyCell(row.previous.value), current: moneyCell(row.current.value), change: moneyCell(row.change.value), detail: missing([row.previous, row.current, row.change]),
  });
  // V3-9a F12：損益兩平 MER 一列（區塊「其他常用指標」，接在關鍵差額之後；既有各列與數值不變）。摘要表的本期／上期欄是金額格式（money_l2），
  // 倍數寫成文字格「3.50 倍」（L3），不套金額格式；12 位小數的系統原值在分析 CSV。不適用／資料待補附原因碼。
  const breakeven = summary.breakeven ?? { version: BREAKEVEN_MER_VERSION, previous: breakevenMer(input.snapshot.report.previous), current: breakevenMer(input.snapshot.report.current) };
  const multiple = (item: BreakevenMer) => text(item.value === null ? formatEmpty(item.status === "not_applicable" ? "notApplicable" : "missing", { layer: "L3", reasonCodes: item.reason_codes }) : formatMultiple(item.value, "L3"));
  records.push({ section: text(labels.overview.sections.assistKpis), item: text(breakeven.current.label), scope: text(total), previous: multiple(breakeven.previous), current: multiple(breakeven.current), detail: text(fill(labels.assist.breakevenV3.excelDetail, { version: breakeven.version })) });
  if (!summary.priorities.length) records.push({ section: text(s.sections.topThree), detail: text(labels.overview.notes.noPriorities) });
  for (const [index, item] of summary.priorities.entries()) {
    const impact = item.impact ?? item.ranking_amount;
    records.push({
      section: text(s.sections.topThree), item: text(fill(s.priorityItem, { n: index + 1, headline: item.title })), scope: text(scopeLabel(item.primary.scope, resolver)),
      impact: moneyCell(impact.value), detail: text(fill(s.nextStep, { text: item.recommendation })),
    });
  }
  if (meeting) records.push(
    info(s.sections.meeting, s.items.meetingName, meeting.name),
    info(s.sections.meeting, s.items.meetingDate, meeting.date),
    info(s.sections.meeting, s.items.decision, lookup(labels.meeting.form.decisions, meeting.decision)),
    // V3-9b F14：決策備註是內部備註，客戶報告版不放。
    ...(spec.internal.decisionNotes ? [info(s.sections.meeting, s.items.notes, meeting.notes)] : []),
  );
  return sheet(copy.sheets.summary, copy.columns.summary, records, { previous: "money_l2", current: "money_l2", change: "money_l2", impact: "money_l2" });
}

function channelSheet(summary: ManagerSummary, resolver: NameResolver): ExcelSheet {
  const headline = (name: SummaryMetric["metric"]) => {
    const row = summary.headlines.find(entry => entry.metric === name);
    if (!row) throw new Error("EXCEL_SUMMARY_HEADLINE_MISSING");
    return row;
  };
  const record = (channel: string, revenue: SummaryMetric, contribution: SummaryMetric): SheetRecord<typeof copy.columns.channels> => {
    const metrics = [revenue.previous, revenue.current, revenue.change, contribution.previous, contribution.current, contribution.change];
    return {
      channel: text(channel),
      previous_net_revenue: moneyCell(revenue.previous.value), current_net_revenue: moneyCell(revenue.current.value), net_revenue_change: moneyCell(revenue.change.value),
      previous_contribution: moneyCell(contribution.previous.value), current_contribution: moneyCell(contribution.current.value), contribution_change: moneyCell(contribution.change.value),
      data_status: text(metrics.some(metric => metric.value === null) ? labels.shell.status.partial : fill(labels.shell.status.ready, { date: summary.data_as_of })),
    };
  };
  // 最後一列合計＝兩個關鍵差額（同一個來源）；各通路差額不能再加總（口徑說明第 5 條）。
  const records = [...summary.channels.map(row => record(channelLabel(row.channel, resolver), row.revenue, row.contribution)), record(labels.overview.sections.total, headline("net_revenue"), headline("contribution_after_marketing"))];
  // 通路表是摘要層（§3.3 通路寬表 L2）：整數元；到分的值在 CSV 與「貢獻變化拆解」。
  const money = "money_l2" as const;
  return sheet(copy.sheets.channels, copy.columns.channels, records, { previous_net_revenue: money, current_net_revenue: money, net_revenue_change: money, previous_contribution: money, current_contribution: money, contribution_change: money });
}

function bridgeSheet(snapshot: WorkspaceSnapshot): ExcelSheet {
  const { bridge, previous, current } = snapshot.report;
  const contribution = labels.metrics.contribution_after_marketing.headline;
  const overview = labels.overview.page;
  const records: SheetRecord<typeof copy.columns.bridge>[] = [
    // 第一列：上期與本期扣廣告後貢獻，以及實際差額；下面九項的對貢獻影響加總應等於這個差額。
    { item: text(contribution), previous: moneyCell(previous.metrics.contribution_after_marketing.value), current: moneyCell(current.metrics.contribution_after_marketing.value), impact: moneyCell(bridge.contribution_change.value), formula: text(fill(labels.meeting.managerSummary.changeFormula, { metric: contribution })) },
    ...AMOUNT_FIELDS.map(field => ({
      item: text(labels.metrics[field].headline), previous: moneyCell(previous.metrics[field].value), current: moneyCell(current.metrics[field].value),
      impact: moneyCell(bridge.components[field].value), formula: text(field === "gross_sales" ? overview.amountDeltaFormula : overview.costDeltaFormula),
    })),
    { item: text(labels.exports.common.bridgeSumLabel), impact: moneyCell(bridge.sum.value), formula: text(bridge.reconciled === true ? overview.bridgeReconciled : bridge.reconciled === null ? labels.shell.status.missing : copy.bridge.mismatch) },
  ];
  return sheet(copy.sheets.bridge, copy.columns.bridge, records, { previous: "money", current: "money", impact: "money" });
}

function productSheet(rows: readonly ProductComparisonRow[], resolver: NameResolver): ExcelSheet {
  const blank = labels.products.comparison.blankCategory;
  const records = rows.map(row => ({
    channel: text(channelLabel(row.channel, resolver)), sku: text(row.sku), category: text(row.category.trim() ? categoryLabel(row.category, resolver) : blank),
    current_units: countCell(row.current.metrics.units_sold.value),
    previous_net_revenue: moneyCell(row.previous.metrics.net_revenue.value), current_net_revenue: moneyCell(row.current.metrics.net_revenue.value),
    previous_gross_profit: moneyCell(row.previous.metrics.gross_profit.value), current_gross_profit: moneyCell(row.current.metrics.gross_profit.value),
    current_gross_margin: ratioCell(row.current.metrics.gross_margin.value), gross_profit_change: moneyCell(row.changes.gross_profit.value),
    data_status: text(labels.products.highlights.status[dataStatus(row)]),
  }));
  return sheet(copy.sheets.products, copy.columns.products, records, {
    current_units: "count", previous_net_revenue: "money", current_net_revenue: "money", previous_gross_profit: "money", current_gross_profit: "money", current_gross_margin: "ratio", gross_profit_change: "money",
  });
}

/** V3-9b F13／F14：待辦工作表最後一欄「廣告決策」（使用者自選的暫停／調整／加碼；沒標是空格）；列數與既有欄位不變。 */
const AD_DECISION_COLUMN = { ad_decision: labels.actions.adDecisionV3.csvColumn } as const;
function actionSheet(workspace: ActionWorkspace, spec: ExportVariantSpec, snapshot: WorkspaceSnapshot): ExcelSheet {
  const board = labels.actions.board;
  const records = actionDocuments(workspace).map(doc => ({
    priority: numeric(doc.priority), problem: text(doc.problem), step: text(doc.action),
    owner: text(doc.owner_role.trim() || board.unassigned), due: text(doc.deadline || board.noDeadline),
    status: text(EXECUTION_STATUS[doc.execution_status]), status_updated_at: doc.status_updated_at ? text(doc.status_updated_at) : EMPTY,
    pinned: text(doc.pinned ? copy.actions.pinned : copy.actions.notPinned), evidence_count: numeric(doc.fact_ids.length),
    // V42-1a：與活頁簿同一版本資料的待辦讀快照的 channel_names（與摘要／通路工作表同一個解析器）；引用其他資料的歷史綁定維持該資料集的隱含預設。
    scope: text(scopeLabel(doc.binding.scope, doc.binding.dataset_hash === snapshot.dataset_hash ? snapshotResolver(snapshot) : makeResolver(undefined, doc.binding.dataset_id))),
    // 引用的是較早的資料（或舊資料待重新核對）時提醒，與待辦頁的「引用較早資料」同一句。
    caution: doc.status === "stale" || doc.evidence_relation === "historical" ? text(labels.actions.form.staleBadge) : EMPTY,
    ad_decision: doc.ad_decision ? text(lookup(labels.actions.adDecisionV3.options, doc.ad_decision)) : EMPTY,
  }));
  // 客戶報告版拿掉內部備註：狀態更新日（待辦進度紀錄）與「引用較早資料」（引用歷史）兩欄；其他欄與列不變，廣告決策一律在最後。
  const hidden = new Set<string>([...(spec.internal.actionProgress ? [] : ["status_updated_at"]), ...(spec.internal.citationHistory ? [] : ["caution"])]);
  const columns: Columns = Object.fromEntries([...Object.entries(copy.columns.actions).filter(([key]) => !hidden.has(key)), ...Object.entries(AD_DECISION_COLUMN)]);
  return sheet(copy.sheets.actions, columns, records, { priority: "count", evidence_count: "count" });
}

function basisSheet(input: ExcelExportInput, spec: ExportVariantSpec, charts: readonly ChartDataSection[] = []): ExcelSheet {
  const { summary, snapshot, dataset } = input;
  const b = copy.basis;
  const row = (section: string, item: string | null, detail: string) => ({ section: text(section), item: item === null ? EMPTY : text(item), detail: text(detail) });
  const converted = conversionSentence(input.conversion) ?? summary.conversion_note;
  // V3-9b F14：技術細節（版本與雜湊）只在 spec.appendix.technical 時放；客戶報告版的版本字串在版頭第 4 行。
  const technical = (item: string, detail: string) => spec.appendix.technical ? [row(b.sections.technical, item, detail)] : [];
  const records = [
    ...labels.glossary.basis.items.map(item => row(b.sections.basis, null, item)),
    row(b.sections.basis, b.alias, labels.glossary.basis.aliasNote),
    ...(converted ? [row(b.sections.preprocessing, b.conversion, converted)] : []),
    ...technical(csvHeader("dataset_id"), snapshot.report.dataset_id),
    ...technical(csvHeader("dataset_hash"), snapshot.dataset_hash),
    ...technical(csvHeader("filter_hash"), snapshot.filter_hash),
    ...technical(csvHeader("metric_version"), snapshot.metric_version),
    ...technical(b.assistVersion, ASSIST_KPI_VERSION),
    // V3-9a F12：損益兩平 MER 的版本（breakeven-mer-v1）接在輔助指標版本之後。
    ...technical(labels.assist.breakevenV3.excelVersion, BREAKEVEN_MER_VERSION),
    ...technical(csvHeader("currency"), dataset.manifest.currency),
    ...technical(csvHeader("timezone"), dataset.manifest.timezone),
    // V4-9b（D-V4-12＝A）：「圖表資料」用到的每個 B 級版本常數（整理函式的版本），與技術細節同樣只在 spec.appendix.technical 時列（客戶報告版不列）。
    // 區塊寫「圖表資料」、放在技術細節各列之後：技術細節區的既有各列逐列不變（tests/breakeven-mer.test.ts 斷言那一區恰好 8 列）。
    ...(spec.appendix.technical ? charts.filter(chart => chart.arranged).map(chart => row(labels.exports.chartsV4.excel.sheet, fill(labels.exports.chartsV4.excel.basisVersion, { section: chart.section }), chart.version)) : []),
  ];
  return sheet(copy.sheets.basis, copy.columns.basis, records);
}

/**
 * V3-9b F9／F14（D-V3-8，PRD §9.6）：管理損益表工作表——buildPnlTable(snapshot, "week") 的值原樣寫成數字格。
 * 列＝13 列（PNL_ROWS 的固定順序，費用列「減：」前綴，零值列也列出）；欄＝項目、本期每週、合計、佔淨營收 %。
 * 金額格式 #,##0.00;(#,##0.00)（負數括號），比率 0.00%（精確比率小數）；缺值是空格。表頭樣式與凍結列同其他工作表（styleHeaderRows）。
 */
function pnlSheet(snapshot: WorkspaceSnapshot): ExcelSheet {
  const { table, rowLabels, columnLabels } = pnlExportTable(snapshot);
  const pnl = labels.overview.pnlV3.columns;
  const formats: (ExcelNumberFormat | null)[] = [null, ...table.columns.map(() => "money_paren" as const), "money_paren", "ratio"];
  const header = [pnl.item, ...columnLabels, pnl.total, pnl.share].map((label, index) => excelHeader(label, formats[index]));
  const rows = table.rows.map((row, index) => [text(rowLabels[index]), ...row.cells.map(cell => moneyCell(cell.metric.value)), moneyCell(row.total.metric.value), ratioCell(row.share.value)]);
  return { name: labels.exports.variantsV3.pnlSheet, header, rows, formats };
}

// ── V4-9b C34「圖表資料」工作表（PRD §5.10、§6.3 C34；CHART_CATALOG §9.5 與各圖卡的「匯出」列；D-V4-12＝A）──
// 每張圖一段：段名（畫面資料表的標題）、標題列（畫面同一個 builder 的結論句；G7、G12 沒有結論句，用段名）、欄名列（＝該圖資料表的欄，金額欄帶「（元）」）、
// 資料列（值取自畫面同一個函式，不產生新數字）、段末一列「版本與算法」（只在 spec.appendix.technical）。G15、G16 不放：ExcelExportInput 沒有試算資料。
// 欄 A 是段名（可篩選）；同一欄混放不同單位，所以數字格逐格帶 format（L2 money_l2、L3 money、比率 ratio、件數 count；倍數照摘要工作表寫成「3.50 倍」文字格）。

/** 「圖表資料」的一段（一張圖）。rows 的每一列與 columns 等長，第一格是列名。 */
interface ChartDataSection {
  /** 圖的代號（對照 CHART_CATALOG，不輸出）。 */
  chart: "G1" | "G2" | "G4" | "G7a" | "G7b" | "G8" | "G10" | "G11" | "G12" | "G13" | "G14";
  section: string;
  title: string;
  columns: string[];
  rows: ExcelCell[][];
  /** 「版本與算法」列的內容：B 級段＝整理函式的版本常數，A 級段＝snapshot.metric_version（contribution-v1）。 */
  version: string;
  /** B 級（版本是整理函式的）：指標定義工作表的技術區另列一行。 */
  arranged: boolean;
}
const MISSING_METRIC: Metric = { value: null, reason_codes: ["MISSING_VALUE"] };
const withFormat = (cell: ExcelCell, format: ExcelNumberFormat): ExcelCell => cell.kind === "number" ? { ...cell, format } : cell;
const chartMoney = (value: string | null, format: "money" | "money_l2"): ExcelCell => withFormat(moneyCell(value), format);
const chartRatio = (value: string | null): ExcelCell => withFormat(ratioCell(value), "ratio");
/** 週的欄名或列名：與管理損益表的週欄同一個寫法「{週名} {起日} 至 {迄日}」。 */
const weekName = (label: string, period: Period) => fill(labels.exports.variantsV3.pnlWeekColumn, { label, range: fill(labels.exports.variantsV3.pnlWeekRange, { start: period.start, end: period.end }) });

/** 依 CHART_CATALOG 的順序組出各段（G1、G2、G4、G7a、G7b、G8、G10、G11、G12、G13、G14）；沒有資料或超過上限的圖不放（G7b、G11 通路 > 8，G8 任一期超過 92 天，G14 沒有商品毛利為負）。 */
function chartDataSections(input: ExcelExportInput): ChartDataSection[] {
  const { summary, snapshot, dataset } = input;
  const { report } = snapshot;
  const resolver = snapshotResolver(snapshot);
  const metricVersion = snapshot.metric_version;
  const sections: ChartDataSection[] = [];

  // G1 貢獻變化拆解：11 根柱的起點、終點（L3），九項另列差額（G6 併入本段）。
  const bridge = bridgeWaterfall(snapshot);
  const chartColumns = labels.exports.chartsV4.excel.columns;
  sections.push({
    chart: "G1", section: labels.overview.sections.bridge, title: bridge.title,
    columns: [chartColumns.bar, excelHeader(chartColumns.start, "money"), excelHeader(chartColumns.end, "money"), excelHeader(labels.exports.csv.suffix.change, "money")],
    rows: bridge.bars.map(bar => [text(bar.label), chartMoney(bar.start, "money"), chartMoney(bar.end, "money"), bar.kind === "delta" ? chartMoney(bar.value, "money") : EMPTY]),
    version: metricVersion, arranged: false,
  });

  // G2 本期利潤結構（合計）：10 列（項目、金額 L3、佔淨營收）＋每 100 元一列（與 G10 資料表同一句「剩／虧 {n} 元」）。
  const profit = profitWaterfall(snapshot, "all", { resolver, allChannels: dataset.manifest.channels });
  const profitCopy = labels.overview.profit;
  const perHundred = sharePerHundredText(profit.perHundred);
  sections.push({
    chart: "G2", section: profitCopy.section, title: profit.title,
    columns: [profitCopy.table.item, profitCopy.table.amount, profitCopy.table.share],
    rows: [
      ...profit.rows.map(row => [text(row.kind === "delta" ? fill(profitCopy.rowDeduct, { label: row.label }) : row.label), chartMoney(row.value.value, "money"), chartRatio(row.share)]),
      [text(labels.diagnosis.chartsV4.share.columns.perHundred), perHundred === null ? EMPTY : text(perHundred), EMPTY],
    ],
    version: metricVersion, arranged: false,
  });

  // G4 各通路：上期、本期、差額（L2；差額＝metricComparison 的 change，與緊湊表差額欄同一個值）。
  const channels = channelConclusion(snapshot, { resolver });
  const change = (channel: string): Metric => Object.hasOwn(report.previous.channels, channel) && Object.hasOwn(report.current.channels, channel) ? metricComparison(snapshot, "contribution_after_marketing", channel).change : MISSING_METRIC;
  sections.push({
    chart: "G4", section: labels.overview.sections.channelMix, title: channels.title,
    columns: [labels.overview.channelsV3.table.channel, excelHeader(labels.shell.periods.previous, "money_l2"), excelHeader(labels.shell.periods.current, "money_l2"), excelHeader(labels.exports.csv.suffix.change, "money_l2")],
    rows: channels.rows.map(row => [text(row.label), chartMoney(row.previous.value, "money_l2"), chartMoney(row.current.value, "money_l2"), chartMoney(change(row.channel).value, "money_l2")]),
    version: metricVersion, arranged: false,
  });

  // G7a 各指標每週（assist-weeks-v1）：列＝其他常用指標（件數、件均的單位寫在列名），欄＝本期最後 ≤ 8 週。
  const assist = assistWeeks({ weeks: snapshot.weeks });
  if (assist.weeks.length) {
    const spark = labels.overview.chartsV4.assistSpark;
    const rowLabel = (kpi: AssistKpi) => kpi.unit === "count" ? fill(spark.rowUnit.count, { label: kpi.label }) : kpi.unit === "money_per_unit" ? fill(spark.rowUnit.perUnit, { label: kpi.label }) : kpi.label;
    const cell = (unit: AssistUnit, value: string | null): ExcelCell => unit === "count" ? withFormat(countCell(value), "count") : unit === "money_per_unit" ? chartMoney(value, "money_l2") : unit === "percent" ? chartRatio(value) : value === null ? EMPTY : text(formatMultiple(value, "L3"));
    sections.push({
      chart: "G7a", section: spark.tableTitle, title: spark.tableTitle,
      columns: [labels.overview.assistTable.columns.metric, ...assist.weeks.map(week => weekName(week.label, week.period))],
      rows: summary.assist.current.flatMap(kpi => { const series = assist.series.find(item => item.id === kpi.id); return series ? [[text(rowLabel(kpi)), ...series.values.map(value => cell(kpi.unit, value.value))]] : []; }),
      version: ASSIST_WEEKS_VERSION, arranged: true,
    });
  }

  // G7b 各通路每週（channel-weeks-v1）：excel-export 自行呼叫 channelWeeks，通路 ≤ 8 才放；列＝通路，欄＝本期最後 ≤ 8 週（L2）。
  const weekly = channelWeeksAvailable(snapshot) ? channelWeeks(snapshot) : null;
  if (weekly !== null && weekly.weeks.length) {
    const data = recentChannelWeeks(weekly);
    const spark = labels.diagnosis.chartsV4.channelsSpark;
    sections.push({
      chart: "G7b", section: spark.tableTitle, title: spark.tableTitle,
      columns: [labels.overview.channelTable.channelHeader, ...data.weeks.map(week => excelHeader(weekName(week.label, week.period), "money_l2"))],
      rows: data.channels.map(series => [text(channelLabel(series.channel, resolver)), ...series.values.map(value => chartMoney(value.metric.value, "money_l2"))]),
      version: CHANNEL_WEEKS_VERSION, arranged: true,
    });
  }

  // V4-10 G8 兩期每日累計（cumulative-daily-v1）：列＝上期、本期的每一天（上期在前，同畫面資料表），欄＝日期、當日、累計（L3）；任一期超過 92 天不畫時不放。
  const cumulative = cumulativeDaily(snapshot, "contribution_after_marketing");
  if (cumulative.drawable) {
    const cumulativeCopy = labels.overview.chartsV4.cumulative;
    sections.push({
      chart: "G8", section: cumulativeCopy.tableTitle, title: cumulativeConclusion(cumulative, snapshot).title,
      columns: [cumulativeCopy.columns.date, excelHeader(cumulativeCopy.columns.daily, "money"), excelHeader(cumulativeCopy.columns.cumulative, "money")],
      rows: [cumulative.previous, cumulative.current].flatMap(series => series.points.map(point => [text(point.date), chartMoney(point.daily.value, "money"), chartMoney(point.cumulative.value, "money")])),
      version: CUMULATIVE_DAILY_VERSION, arranged: true,
    });
  }

  // G10 每 100 元淨營收去向（channel-structure-v1）：資料表同一組欄與格（shareTableCell）；每 100 元是「剩／虧 {n} 元」文字。
  const share = shareSectionModel(snapshot, { resolver });
  sections.push({
    chart: "G10", section: labels.diagnosis.chartsV4.share.section, title: share.title,
    columns: [labels.overview.channelsV3.table.channel, ...SHARE_TABLE_COLUMNS.map(column => column.label)],
    rows: share.rows.map(row => [text(row.label), ...SHARE_TABLE_COLUMNS.map(column => { const value = shareTableCell(snapshot, row, column).value; return column.unit === "money" ? chartMoney(value, "money_l2") : value === null ? EMPTY : text(value); })]),
    version: CHANNEL_STRUCTURE_VERSION, arranged: true,
  });

  // G11 日 × 通路（daily-heatmap-v1）：列＝日（超過 92 天時是週），欄＝通路（順序同畫面：標題所指的通路在前），格＝L3；通路 > 8 等不計算時不放。
  const heat = heatSectionModel(snapshot, { resolver });
  const heatmap = heat.result.heatmap;
  if (heatmap !== null && heatmap.channels.length) {
    const heatCopy = labels.diagnosis.chartsV4.heat;
    const weeklyHeat = heatmap.mode === "weekly";
    const amount = (cell: HeatCell): ExcelCell => cell.kind === "value" ? chartMoney(cell.metric.value, "money") : EMPTY;
    const [first] = heatmap.channels;
    sections.push({
      chart: "G11", section: fill(weeklyHeat ? heatCopy.sectionWeekly : heatCopy.section, { metric: metricDefinitions.contribution_after_marketing.label }), title: heat.title,
      columns: [weeklyHeat ? heatCopy.weekHead : labels.exports.csv.columns.date, ...heatmap.channels.map(channel => excelHeader(channelLabel(channel.channel, resolver), "money"))],
      rows: weeklyHeat
        ? heatmap.weeks.map((week, index) => [text(weekName(week.label, week.period)), ...heatmap.channels.map(channel => amount(channel.rows[index].cells[0]))])
        : first.rows.flatMap((row, index) => row.cells.flatMap((cell, day) => cell.kind === "outside" ? [] : [[text(cell.key), ...heatmap.channels.map(channel => amount(channel.rows[index].cells[day]))]])),
      version: heatmap.version, arranged: true,
    });
  }

  // G12 五項比率每週走勢（A 級）：列＝上期、本期、去年同期的週（與資料表同一組列），欄＝週、起訖日、五項比率。
  const rates = ratesModel(snapshot);
  if (rates.rows.length) {
    const ratesCopy = labels.diagnosis.chartsV4.rates;
    sections.push({
      chart: "G12", section: ratesCopy.title, title: ratesCopy.title,
      columns: [labels.overview.page.colPeriod, ...RATES_TABLE_COLUMNS.map(column => column.label)],
      rows: rates.rows.map(week => [text(week.label), ...RATES_TABLE_COLUMNS.map(column => column.data.kind === "range" ? text(fill(labels.exports.variantsV3.pnlWeekRange, { start: week.start, end: week.end })) : chartRatio(week.metrics[column.data.rate].value))]),
      version: metricVersion, arranged: false,
    });
  }

  // G13、G14 商品（同商品頁：compareProducts 的列，不受品類與搜尋篩選影響）；SKU 與通路分兩欄。
  const products = input.products ?? [];
  const scope = report.scope;
  const everyChannel = dataset.manifest.channels.length > 0 && dataset.manifest.channels.every(channel => scope.channels.includes(channel));
  const chartScope: ProductChartScope = {
    ctx: { previous: scope.previous_period, current: scope.current_period, resolver },
    current: formatPeriodL1(scope.current_period.start, scope.current_period.end, { days: false, anchor: snapshot.data_as_of }),
    previous: formatPeriodL1(scope.previous_period.start, scope.previous_period.end, { days: false, anchor: snapshot.data_as_of }),
    channels: everyChannel ? labels.shell.periodBar.filter.allChannels : channelsLabel(scope.channels, resolver),
  };
  const productColumns = [copy.columns.products.sku, copy.columns.products.channel];
  const top = productHighlights(products), all = productHighlights(products, products.length);
  const variance = varianceSectionModel({ decrease: top.worstChange, increase: top.bestChange, allDecrease: all.worstChange, allIncrease: all.bestChange }, chartScope);
  sections.push({
    chart: "G13", section: variance.section, title: variance.title,
    columns: [...productColumns, ...VARIANCE_TABLE_COLUMNS.map(column => column.label)],
    rows: variance.tableRows.map(row => [text(row.sku), text(channelLabel(row.channel, resolver)), ...VARIANCE_TABLE_COLUMNS.map(column => chartMoney(column.data === "change" ? row.changes.gross_profit.value : row[column.data].metrics.gross_profit.value, "money_l2"))]),
    version: metricVersion, arranged: false,
  });
  const pareto = productPareto(products, "gross_profit", PRODUCT_PARETO_LIMIT);
  if (pareto.count > 0) {
    const model = paretoSectionModel(pareto, chartScope);
    sections.push({
      chart: "G14", section: model.section, title: model.title,
      columns: [...productColumns, ...PARETO_TABLE_COLUMNS.map(column => column.label)],
      rows: pareto.allRows.map(entry => [text(entry.row.sku), text(channelLabel(entry.row.channel, resolver)), ...PARETO_TABLE_COLUMNS.map(column => column.data === "share" ? chartRatio(entry.share.value) : chartMoney(column.data === "cumulative" ? entry.cumulative.value : entry.value.value, "money_l2"))]),
      version: PRODUCT_PARETO_VERSION, arranged: true,
    });
  }
  return sections;
}

/** 「圖表資料」工作表：表頭＝區塊、內容；每段依序是標題列、欄名列、資料列，標準版另有段末的「版本與算法」列（客戶報告版依 spec.appendix.technical 省略）。 */
function chartDataSheet(sections: readonly ChartDataSection[], spec: ExportVariantSpec): ExcelSheet {
  const width = 1 + Math.max(2, ...sections.map(item => item.columns.length));
  const pad = (cells: readonly ExcelCell[]): ExcelCell[] => [...cells, ...Array.from({ length: width - cells.length }, () => EMPTY)];
  const rows = sections.flatMap(item => {
    const section = text(item.section);
    return [
      pad([section, text(item.title)]),
      pad([section, ...item.columns.map(text)]),
      ...item.rows.map(row => pad([section, ...row])),
      ...(spec.appendix.technical ? [pad([section, text(labels.exports.chartsV4.excel.versionRow), text(item.version)])] : []),
    ];
  });
  return { name: labels.exports.chartsV4.excel.sheet, header: [copy.columns.basis.section, copy.columns.basis.detail, ...Array.from({ length: width - 2 }, () => "")], rows };
}

/**
 * 工作表：摘要、通路、貢獻變化拆解、商品比較、待辦、指標定義，V3-9b 起最後加管理損益表；老闆一頁版只有摘要與管理損益表（variantSpec）。
 * V4-9b：標準與客戶版在管理損益表之前多一張「圖表資料」（C34）。
 * 只讀既有計算結果；摘要必須來自同一個 snapshot。三個變體的數字都來自同一個 summary／snapshot。
 */
export function buildExcelWorkbook(input: ExcelExportInput): ExcelWorkbook {
  const { summary, snapshot, dataset } = input;
  if (summary.dataset_hash !== snapshot.dataset_hash || summary.filter_hash !== snapshot.filter_hash || snapshot.report.dataset_id !== dataset.manifest.dataset_id) throw new Error("EXCEL_SOURCE_MISMATCH");
  const spec = variantSpec(input.variant);
  const charts = spec.excelSheets.includes("chartData") ? chartDataSections(input) : [];
  const build: Record<ExcelSheetKey, () => ExcelSheet> = {
    summary: () => summarySheet(input, spec), channels: () => channelSheet(summary, snapshotResolver(snapshot)), bridge: () => bridgeSheet(snapshot),
    products: () => productSheet(input.products ?? [], snapshotResolver(snapshot)), actions: () => actionSheet(input.actions, spec, snapshot), basis: () => basisSheet(input, spec, charts),
    chartData: () => chartDataSheet(charts, spec), pnl: () => pnlSheet(snapshot),
  };
  return { sheets: spec.excelSheets.map(key => build[key]()) };
}

/** 與 export.ts encodeCsv 同一條防注入規則：開頭是 = + - @、空白或控制／零寬／方向字元時前面加 '。 */
const FORMULA_PREFIX = /^[=+\-@\s\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u;
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
/** XML 不允許的非字元 U+FFFE／U+FFFF：SheetJS 照原樣寫入，Excel 會說檔案有問題，直接移除。 */
const NONCHARACTER = /[\ufffe\uffff]/g;
/** DEL 與 C1 控制字元（U+007F–U+009F）：SheetJS 不跳脫、讀回時被丟掉；改成 U+FFFD，看得出原本有字元。 */
const C1_CONTROL = /[\u007f-\u009f]/g;
/**
 * 字面上的 _xHHHH_ 會被 Excel 解碼成一個字元，所以把開頭的 _ 寫成 _x005F_。
 * 用 lookahead 逐一檢查每個 _（不吃掉後面的字），重疊的 _x005F_x0041_ 兩個 _ 都會跳脫，讀回才與原文相同。
 */
const LITERAL_ESCAPE = /_(?=x[0-9a-fA-F]{4}_)/g;
const ESCAPED_UNDERSCORE = "_x005F_";
/**
 * 不可信文字 → 安全的字串格內容：補不成對的代理字元、移除非字元、C1 控制字元改成 U+FFFD、套 CSV 防注入規則，
 * 把字面上的 _xHHHH_ 跳脫成 _x005F_xHHHH_；跳脫後超過 32,767 字才截斷（不切斷代理對與跳脫序列），最終長度不超過上限。
 */
export function excelText(value: string): string {
  if (typeof value !== "string") throw new TypeError("INVALID_TEXT_CELL");
  let result = value.replace(LONE_SURROGATE, "�").replace(NONCHARACTER, "").replace(C1_CONTROL, "�");
  if (FORMULA_PREFIX.test(result)) result = `'${result}`;
  const escaped = result.replace(LITERAL_ESCAPE, ESCAPED_UNDERSCORE);
  if (escaped.length <= EXCEL_CELL_TEXT_LIMIT) return escaped;
  return `${escapedPrefix(result, EXCEL_CELL_TEXT_LIMIT - copy.truncated.length)}${copy.truncated}`;
}
/**
 * 取 text 開頭最長的一段，跳脫後長度不超過 budget，回傳跳脫後的結果。
 * 切點不落在代理對中間，也不落在字面 _xHHHH_ 之內（跳脫後的 _x005F_xHHHH_ 整段保留或整段捨去）。
 */
function escapedPrefix(text: string, budget: number): string {
  const escapes = new Uint8Array(text.length);
  const inside = new Uint8Array(text.length + 1);
  for (const match of text.matchAll(LITERAL_ESCAPE)) {
    escapes[match.index] = 1;
    inside.fill(1, match.index + 1, match.index + 7);
  }
  let used = 0;
  let end = 0;
  for (let index = 0; index < text.length; index += 1) {
    used += escapes[index] ? ESCAPED_UNDERSCORE.length : 1;
    if (used > budget) break;
    const code = text.charCodeAt(index);
    // 不成對的代理字元已先換掉，所以高位代理後面一定是低位代理，不能切在兩者之間。
    if (!inside[index + 1] && !(code >= 0xd800 && code <= 0xdbff)) end = index + 1;
  }
  return text.slice(0, end).replace(LITERAL_ESCAPE, ESCAPED_UNDERSCORE);
}

/** 工作表名稱：去掉 [ ] : * ? / \ 與控制字元、頭尾的 '，最多 31 字；空的或保留字 History 改用 fallback。 */
export function excelSheetName(name: string, fallback: string): string {
  const result = truncateSheetName(stripSheetName(typeof name === "string" ? name : ""), EXCEL_SHEET_NAME_LIMIT);
  return !result || result.toLowerCase() === "history" ? fallback : result;
}
function stripSheetName(value: string): string {
  return value.replace(/[[\]:*?/\\\u0000-\u001f\u007f]/g, "").trim().replace(/^'+|'+$/g, "").trim();
}
/** 依 UTF-16 長度截到 limit 以內，不切斷代理對；截斷後再去掉頭尾的空白與 '。 */
function truncateSheetName(value: string, limit: number): string {
  let result = "";
  for (const character of value) {
    if (result.length + character.length > limit) break;
    result += character;
  }
  return stripSheetName(result);
}
/** 同一本活頁簿內名稱不分大小寫不可重複：重複時加「 (2)」等，仍在 31 字內。 */
function uniqueSheetName(name: string, index: number, used: Set<string>): string {
  const base = excelSheetName(name, `Sheet${index + 1}`);
  let candidate = base;
  for (let n = 2; used.has(candidate.toLowerCase()); n += 1) candidate = `${truncateSheetName(base, EXCEL_SHEET_NAME_LIMIT - ` (${n})`.length)} (${n})`;
  used.add(candidate.toLowerCase());
  return candidate;
}

function columnName(index: number): string {
  let name = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) name = String.fromCharCode(65 + (value - 1) % 26) + name;
  return name;
}
/** 顯示寬度：CJK 與全形字算 2 格。 */
function displayWidth(value: string): number {
  let width = 0;
  for (const character of value) width += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]|[\u{20000}-\u{3fffd}]/u.test(character) ? 2 : 1;
  return width;
}
function cellObject(cell: ExcelCell, format: ExcelNumberFormat | null): CellObject | null {
  if (!cell || typeof cell !== "object") throw new TypeError("INVALID_EXCEL_CELL");
  if (cell.kind === "null") return null;
  if (cell.kind === "number") return format ? { t: "n", v: finite(cell.value), z: NUMBER_FORMATS[format] } : { t: "n", v: finite(cell.value) };
  if (cell.kind === "text") return { t: "s", v: excelText(cell.value) };
  throw new TypeError("INVALID_EXCEL_CELL");
}
/** V4-9b：number 格自帶的數字格式（「圖表資料」逐格指定）；其他格與沒帶的回傳 null，改用工作表的欄格式。 */
const cellFormat = (cell: ExcelCell): ExcelNumberFormat | null => cell && typeof cell === "object" && cell.kind === "number" && cell.format !== undefined && Object.hasOwn(NUMBER_FORMATS, cell.format) ? cell.format : null;
/** 純函式：ExcelSheet → SheetJS 工作表物件（只有 s／n 兩種格，沒有公式）。 */
function worksheet(sheet: ExcelSheet): WorkSheet {
  const width = sheet.header.length;
  if (!Array.isArray(sheet.header) || width === 0) throw new RangeError("EXCEL_EMPTY_HEADER");
  if (sheet.formats !== undefined && sheet.formats.length !== width) throw new RangeError("EXCEL_FORMAT_WIDTH");
  const rows: ExcelCell[][] = [sheet.header.map(text), ...sheet.rows];
  const ws: WorkSheet = {};
  const widths = new Array<number>(width).fill(0);
  rows.forEach((row, r) => {
    if (!Array.isArray(row) || row.length !== width) throw new RangeError("EXCEL_ROW_WIDTH");
    row.forEach((cell, c) => {
      const object = cellObject(cell, r === 0 ? null : cellFormat(cell) ?? sheet.formats?.[c] ?? null);
      if (!object) return;
      ws[`${columnName(c)}${r + 1}`] = object;
      widths[c] = Math.max(widths[c], object.t === "n" ? String(Math.trunc(Number(object.v))).length + 5 : displayWidth(String(object.v)));
    });
  });
  ws["!ref"] = `A1:${columnName(width - 1)}${rows.length}`;
  ws["!cols"] = widths.map(value => ({ wch: Math.min(Math.max(value + 2, 8), 60) }));
  return ws;
}

type XlsxModule = typeof import("xlsx");
/** 動態載入 SheetJS：瀏覽器（webpack，xlsx.mjs）是命名匯出；Node 的 CJS 互通另有 default，兩種都接受。 */
async function loadXlsx(): Promise<XlsxModule> {
  const loaded = (await import("xlsx")) as Partial<XlsxModule> & { default?: Partial<XlsxModule> };
  const usable = (candidate: Partial<XlsxModule> | undefined): candidate is XlsxModule => typeof candidate?.write === "function" && typeof candidate?.utils?.book_new === "function" && typeof candidate?.utils?.book_append_sheet === "function";
  const found = [loaded, loaded.default].find(usable);
  if (!found) throw new Error("XLSX_UNAVAILABLE");
  return found;
}
/** 給「下載 ▾」選單打開時預先載入，縮短按下匯出到開始下載的時間；失敗不影響之後的匯出重試。 */
export async function preloadExcelWriter(): Promise<void> {
  try { await loadXlsx(); } catch { /* 匯出時再試一次並顯示錯誤 */ }
}

/** ExcelWorkbook → .xlsx 位元組。文字格一律 type "s"、數字格 type "n"、空值不寫格；絕不寫入公式（cell.f）。 */
export async function writeExcel(workbook: ExcelWorkbook): Promise<Uint8Array> {
  if (!workbook || !Array.isArray(workbook.sheets) || workbook.sheets.length === 0) throw new RangeError("EXCEL_EMPTY_WORKBOOK");
  // 先把所有格子轉好（不可信文字逃逸、型別檢查），有錯就不載入 xlsx。
  const used = new Set<string>();
  const sheets = workbook.sheets.map((entry, index) => ({ name: uniqueSheetName(entry.name, index, used), sheet: worksheet(entry) }));
  const XLSX = await loadXlsx();
  const book = XLSX.utils.book_new();
  for (const { name, sheet } of sheets) XLSX.utils.book_append_sheet(book, sheet, name);
  book.Props = { Title: labels.brand.name };
  const output: unknown = XLSX.write(book, { type: "array", bookType: "xlsx", bookSST: true, compression: true });
  if (output instanceof ArrayBuffer) return styleHeaderRows(XLSX, new Uint8Array(output));
  if (output instanceof Uint8Array) return styleHeaderRows(XLSX, output);
  throw new Error("XLSX_WRITE_FAILED");
}

/** SheetJS 附的 CFB（zip 讀寫）：只用到這幾個介面。 */
interface CfbEntry { content?: Uint8Array | number[]; size?: number }
interface CfbModule {
  read(data: Uint8Array, options: { type: "array" }): { FullPaths: string[] };
  find(container: unknown, path: string): CfbEntry | null;
  write(container: unknown, options: { fileType: "zip"; type: "array"; compression: boolean }): Uint8Array | number[];
}
/** 表頭列（第 1 列）的樣式：粗體主文字色、export-theme 的 headerFill 底（#f1f3f3）。 */
const HEADER_FONT = `<font><b/><sz val="12"/><color rgb="${argb(EXPORT_THEME.ink)}"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>`;
const HEADER_FILL = `<fill><patternFill patternType="solid"><fgColor rgb="${argb(EXPORT_THEME.headerFill)}"/><bgColor indexed="64"/></patternFill></fill>`;
/** 凍結第 1 列（表頭）：往下捲時表頭留在畫面上。 */
const FROZEN_HEADER = '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>';
/**
 * V3-7 §9.6：表頭粗體＋headerFill 底、凍結表頭列。SheetJS 社群版（0.18.5）寫不出儲存格樣式與凍結窗格，
 * 寫檔後用同一個套件附的 CFB 打開 zip，改 styles.xml（加一個粗體字型、一個底色、一個表頭樣式）與每張工作表的第 1 列及 sheetView。
 * 只動樣式與檢視：格子的值、型別、數字格式都不變。找不到預期的 XML 片段（例如套件改版）時保留原檔，不讓匯出失敗。
 */
function styleHeaderRows(XLSX: XlsxModule, bytes: Uint8Array): Uint8Array {
  const CFB = (XLSX as unknown as { CFB?: CfbModule }).CFB;
  if (!CFB || typeof CFB.read !== "function" || typeof CFB.find !== "function" || typeof CFB.write !== "function") return bytes;
  const zip = CFB.read(bytes, { type: "array" });
  const decoder = new TextDecoder(), encoder = new TextEncoder();
  const edit = (path: string, change: (xml: string) => string): void => {
    const entry = CFB.find(zip, path);
    if (!entry?.content) return;
    const before = decoder.decode(Uint8Array.from(entry.content));
    const after = change(before);
    if (after === before) return;
    entry.content = encoder.encode(after);
    entry.size = entry.content.length;
  };
  let headerStyle = -1;
  edit("/xl/styles.xml", xml => {
    const fonts = /<fonts count="(\d+)">([\s\S]*?)<\/fonts>/.exec(xml), fills = /<fills count="(\d+)">([\s\S]*?)<\/fills>/.exec(xml), xfs = /<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/.exec(xml);
    if (!fonts || !fills || !xfs) return xml;
    const fontId = Number(fonts[1]), fillId = Number(fills[1]), xfId = Number(xfs[1]);
    headerStyle = xfId;
    return xml
      .replace(fonts[0], () => `<fonts count="${fontId + 1}">${fonts[2]}${HEADER_FONT}</fonts>`)
      .replace(fills[0], () => `<fills count="${fillId + 1}">${fills[2]}${HEADER_FILL}</fills>`)
      .replace(xfs[0], () => `<cellXfs count="${xfId + 1}">${xfs[2]}<xf numFmtId="0" fontId="${fontId}" fillId="${fillId}" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>`);
  });
  if (headerStyle < 0) return bytes;
  for (const path of zip.FullPaths.map(full => full.replace(/^Root Entry/, "")).filter(path => /^\/xl\/worksheets\/sheet\d+\.xml$/.test(path))) edit(path, xml => xml
    .replace(/<row r="1"([^>]*)>([\s\S]*?)<\/row>/, (_, attributes: string, cells: string) => `<row r="1"${attributes}>${cells.replace(/<c ([^>]*?)(\/?)>/g, (__, cell: string, close: string) => `<c ${cell.replace(/\s*\bs="\d+"/, "")} s="${headerStyle}"${close}>`)}</row>`)
    .replace(/<sheetView ([^>]*?)\/>/, (_, attributes: string) => `<sheetView ${attributes}>${FROZEN_HEADER}</sheetView>`));
  const written = CFB.write(zip, { fileType: "zip", type: "array", compression: true });
  return Uint8Array.from(written);
}

/** 使用者按「匯出 Excel」時呼叫：組活頁簿 → 寫檔 → 在瀏覽器本機下載；不上傳。 */
export async function exportExcel(input: ExcelExportInput, filename = "profitlens.xlsx"): Promise<void> {
  const bytes = await writeExcel(buildExcelWorkbook(input));
  downloadBinary(bytes, filename, EXCEL_MIME);
}
