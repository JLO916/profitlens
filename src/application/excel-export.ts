import type { CellObject, WorkSheet } from "xlsx";
import { parseCents } from "../domain/money";
import type { ProductComparisonRow } from "../domain/product-comparison";
import { AMOUNT_FIELDS, type Dataset, type Metric, type Period } from "../domain/types";
import { fill, labels } from "../i18n";
import { actionDocuments, type ActionExecutionStatus, type ActionWorkspace } from "./action-workspace";
import { ASSIST_KPI_VERSION } from "./assist-kpi";
import { categoryLabel, channelLabel, channelsLabel, conversionSentence, csvHeader, demoAlias, scopeLabel } from "./copy";
import { downloadBinary } from "./download";
import type { ManagerSummary, SummaryMetric } from "./manager-summary";
import { dataStatus } from "./product-highlights";
import type { TaxConversion } from "./tax-basis";
import { formatPeriodExport } from "./presentation";
import type { WorkspaceSnapshot } from "./workspace";

// R6-4 Excel 匯出（D4＝A：SheetJS xlsx 0.18.5）。
// buildExcelWorkbook 是純資料層：只讀既有的摘要、快照、商品比較與待辦，不重算任何財務公式，也不碰 xlsx。
// writeExcel 才動態載入 xlsx（主 bundle 不含）；文字一律寫成字串格、絕不產生公式格，並沿用 CSV 的防注入規則。

export type ExcelCell = { kind: "text"; value: string } | { kind: "number"; value: number } | { kind: "null" };
/**
 * 數字格的顯示格式（只影響 Excel 顯示，不改數值；格子仍是數字，可加總、可排序）。V3-2b §3.3：Excel 有 L2 與 L3。
 * money_l2：摘要、通路表用整數元（L2）；money：拆解、商品明細到分（L3）；ratio：百分比兩位小數（L3）；count：件數整數。
 * 負號一律用 U+2212（Excel 是給人看的文件；CSV／JSON 才保留 ASCII「-」）。金額欄的表頭加「（元）」，儲存格內不帶單位。
 */
export type ExcelNumberFormat = "money" | "money_l2" | "ratio" | "count";
export interface ExcelSheet {
  name: string; header: string[]; rows: ExcelCell[][];
  /** 每欄的數字格式（與 header 等長）；沒有就是一般格式。只套在 number 格。 */
  formats?: (ExcelNumberFormat | null)[];
}
export interface ExcelWorkbook { sheets: ExcelSheet[] }
export interface ExcelMeeting { name: string; date: string; decision: string; notes: string }
export interface ExcelExportInput {
  /** buildManagerSummary(snapshot, …) 的結果；必須來自同一個 snapshot（資料版本與範圍版本相同）。 */
  summary: ManagerSummary;
  snapshot: WorkspaceSnapshot;
  dataset: Dataset;
  actions: ActionWorkspace;
  /** compareProducts(dataset, snapshot.report.scope).rows；沒給就是只有表頭的商品比較表。 */
  products?: readonly ProductComparisonRow[];
  conversion?: TaxConversion | null;
  meeting?: ExcelMeeting | null;
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
  ratio: '0.00%;"−"0.00%;0.00%',
  count: '#,##0;"−"#,##0;0',
};
const NUMBER_FORMATS = EXCEL_NUMBER_FORMATS;
const isMoneyFormat = (format: ExcelNumberFormat | null | undefined): boolean => format === "money" || format === "money_l2";

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
  return isMoneyFormat(format) ? fill(labels.ui.export.moneyColumn, { label }) : label;
}
/** labels 的對照表只認自己的 key（避免 "constructor" 之類的原型屬性）；查不到就原樣顯示。 */
function lookup(table: Readonly<Record<string, string>>, key: string): string {
  return Object.hasOwn(table, key) ? table[key] : key;
}

const copy = labels.excelExport;
const EXECUTION_STATUS: Record<ActionExecutionStatus, string> = {
  not_started: labels.actions.statuses.not_started, in_progress: labels.actions.statuses.in_progress, blocked: labels.actions.statuses.blocked, completed: labels.actions.statuses.done,
};

function summarySheet(input: ExcelExportInput): ExcelSheet {
  const { summary, dataset, meeting } = input;
  const alias = demoAlias(summary.dataset_id);
  const s = copy.summary;
  const info = (section: string, item: string, detail: string) => ({ section: text(section), item: text(item), detail: text(detail) });
  // 版頭的期間用匯出格式「2026-07-13 至 2026-08-23（42 天）」（§8.6；天數含頭尾，與 domain 的 previous_days／current_days 相同）。
  const period = (range: Period) => formatPeriodExport(range.start, range.end);
  const missing = (metrics: Metric[]) => {
    const reasons = [...new Set(metrics.filter(metric => metric.value === null).flatMap(metric => metric.reason_codes))];
    return metrics.some(metric => metric.value === null) ? text(fill(labels.ui.managerSummary.missingWithReasons, { reasons: reasons.join("、") })) : EMPTY;
  };
  const records: SheetRecord<typeof copy.columns.summary>[] = [
    info(s.sections.scope, s.items.dataset, dataset.manifest.dataset_id),
    info(s.sections.scope, s.items.source, lookup(s.sourceTypes, dataset.manifest.source_type)),
    info(s.sections.scope, s.items.asOf, summary.data_as_of),
    info(s.sections.scope, s.items.previous, period(summary.scope.previous_period)),
    info(s.sections.scope, s.items.current, period(summary.scope.current_period)),
    info(s.sections.scope, s.items.comparison, summary.scope.comparison_mode === "calendar_months" ? labels.periods.calendarMonths : labels.periods.sameDays),
    info(s.sections.scope, s.items.channels, channelsLabel(summary.scope.channels, alias)),
  ];
  const total = scopeLabel({ kind: "all", channels: summary.scope.channels }, alias);
  for (const row of summary.headlines) records.push({
    section: text(s.sections.keyDeltas), item: text(labels.metrics[row.metric].label), scope: text(total),
    previous: moneyCell(row.previous.value), current: moneyCell(row.current.value), change: moneyCell(row.change.value), detail: missing([row.previous, row.current, row.change]),
  });
  if (!summary.priorities.length) records.push({ section: text(s.sections.topThree), detail: text(labels.notes.noPriorities) });
  for (const [index, item] of summary.priorities.entries()) {
    const impact = item.impact ?? item.ranking_amount;
    records.push({
      section: text(s.sections.topThree), item: text(fill(s.priorityItem, { n: index + 1, headline: item.title })), scope: text(scopeLabel(item.primary.scope, alias)),
      impact: moneyCell(impact.value), detail: text(fill(s.nextStep, { text: item.recommendation })),
    });
  }
  if (meeting) records.push(
    info(s.sections.meeting, s.items.meetingName, meeting.name),
    info(s.sections.meeting, s.items.meetingDate, meeting.date),
    info(s.sections.meeting, s.items.decision, lookup(labels.meeting.decisions, meeting.decision)),
    info(s.sections.meeting, s.items.notes, meeting.notes),
  );
  return sheet(copy.sheets.summary, copy.columns.summary, records, { previous: "money_l2", current: "money_l2", change: "money_l2", impact: "money_l2" });
}

function channelSheet(summary: ManagerSummary): ExcelSheet {
  const alias = demoAlias(summary.dataset_id);
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
      data_status: text(metrics.some(metric => metric.value === null) ? labels.status.partial : fill(labels.status.ready, { date: summary.data_as_of })),
    };
  };
  // 最後一列合計＝兩個關鍵差額（同一個來源）；各通路差額不能再加總（口徑說明第 5 條）。
  const records = [...summary.channels.map(row => record(channelLabel(row.channel, alias), row.revenue, row.contribution)), record(labels.sections.total, headline("net_revenue"), headline("contribution_after_marketing"))];
  // 通路表是摘要層（§3.3 通路寬表 L2）：整數元；到分的值在 CSV 與「貢獻變化拆解」。
  const money = "money_l2" as const;
  return sheet(copy.sheets.channels, copy.columns.channels, records, { previous_net_revenue: money, current_net_revenue: money, net_revenue_change: money, previous_contribution: money, current_contribution: money, contribution_change: money });
}

function bridgeSheet(snapshot: WorkspaceSnapshot): ExcelSheet {
  const { bridge, previous, current } = snapshot.report;
  const contribution = labels.metrics.contribution_after_marketing.label;
  const overview = labels.ui.overview;
  const records: SheetRecord<typeof copy.columns.bridge>[] = [
    // 第一列：上期與本期扣廣告後貢獻，以及實際差額；下面九項的對貢獻影響加總應等於這個差額。
    { item: text(contribution), previous: moneyCell(previous.metrics.contribution_after_marketing.value), current: moneyCell(current.metrics.contribution_after_marketing.value), impact: moneyCell(bridge.contribution_change.value), formula: text(fill(labels.ui.managerSummary.changeFormula, { metric: contribution })) },
    ...AMOUNT_FIELDS.map(field => ({
      item: text(labels.metrics[field].label), previous: moneyCell(previous.metrics[field].value), current: moneyCell(current.metrics[field].value),
      impact: moneyCell(bridge.components[field].value), formula: text(field === "gross_sales" ? overview.amountDeltaFormula : overview.costDeltaFormula),
    })),
    { item: text(labels.ui.export.bridgeSumLabel), impact: moneyCell(bridge.sum.value), formula: text(bridge.reconciled === true ? overview.bridgeReconciled : bridge.reconciled === null ? labels.status.missing : copy.bridge.mismatch) },
  ];
  return sheet(copy.sheets.bridge, copy.columns.bridge, records, { previous: "money", current: "money", impact: "money" });
}

function productSheet(rows: readonly ProductComparisonRow[], alias: boolean): ExcelSheet {
  const blank = labels.ui.productComparisonPanel.blankCategory;
  const records = rows.map(row => ({
    channel: text(channelLabel(row.channel, alias)), sku: text(row.sku), category: text(row.category.trim() ? categoryLabel(row.category, alias) : blank),
    current_units: countCell(row.current.metrics.units_sold.value),
    previous_net_revenue: moneyCell(row.previous.metrics.net_revenue.value), current_net_revenue: moneyCell(row.current.metrics.net_revenue.value),
    previous_gross_profit: moneyCell(row.previous.metrics.gross_profit.value), current_gross_profit: moneyCell(row.current.metrics.gross_profit.value),
    current_gross_margin: ratioCell(row.current.metrics.gross_margin.value), gross_profit_change: moneyCell(row.changes.gross_profit.value),
    data_status: text(labels.productHighlights.status[dataStatus(row)]),
  }));
  return sheet(copy.sheets.products, copy.columns.products, records, {
    current_units: "count", previous_net_revenue: "money", current_net_revenue: "money", previous_gross_profit: "money", current_gross_profit: "money", current_gross_margin: "ratio", gross_profit_change: "money",
  });
}

function actionSheet(workspace: ActionWorkspace): ExcelSheet {
  const board = labels.actionBoard;
  const records = actionDocuments(workspace).map(doc => ({
    priority: numeric(doc.priority), problem: text(doc.problem), step: text(doc.action),
    owner: text(doc.owner_role.trim() || board.unassigned), due: text(doc.deadline || board.noDeadline),
    status: text(EXECUTION_STATUS[doc.execution_status]), status_updated_at: doc.status_updated_at ? text(doc.status_updated_at) : EMPTY,
    pinned: text(doc.pinned ? copy.actions.pinned : copy.actions.notPinned), evidence_count: numeric(doc.fact_ids.length),
    scope: text(scopeLabel(doc.binding.scope, demoAlias(doc.binding.dataset_id))),
    // 引用的是較早的資料（或舊資料待重新核對）時提醒，與待辦頁的「引用較早資料」同一句。
    caution: doc.status === "stale" || doc.evidence_relation === "historical" ? text(labels.actions.staleBadge) : EMPTY,
  }));
  return sheet(copy.sheets.actions, copy.columns.actions, records, { priority: "count", evidence_count: "count" });
}

function basisSheet(input: ExcelExportInput): ExcelSheet {
  const { summary, snapshot, dataset } = input;
  const b = copy.basis;
  const row = (section: string, item: string | null, detail: string) => ({ section: text(section), item: item === null ? EMPTY : text(item), detail: text(detail) });
  const converted = conversionSentence(input.conversion) ?? summary.conversion_note;
  const records = [
    ...labels.basis.items.map(item => row(b.sections.basis, null, item)),
    row(b.sections.basis, b.alias, labels.basis.aliasNote),
    ...(converted ? [row(b.sections.preprocessing, b.conversion, converted)] : []),
    row(b.sections.technical, csvHeader("dataset_id"), snapshot.report.dataset_id),
    row(b.sections.technical, csvHeader("dataset_hash"), snapshot.dataset_hash),
    row(b.sections.technical, csvHeader("filter_hash"), snapshot.filter_hash),
    row(b.sections.technical, csvHeader("metric_version"), snapshot.metric_version),
    row(b.sections.technical, b.assistVersion, ASSIST_KPI_VERSION),
    row(b.sections.technical, csvHeader("currency"), dataset.manifest.currency),
    row(b.sections.technical, csvHeader("timezone"), dataset.manifest.timezone),
  ];
  return sheet(copy.sheets.basis, copy.columns.basis, records);
}

/** 六個工作表：摘要、通路、貢獻變化拆解、商品比較、行動、口徑。只讀既有計算結果；摘要必須來自同一個 snapshot。 */
export function buildExcelWorkbook(input: ExcelExportInput): ExcelWorkbook {
  const { summary, snapshot, dataset } = input;
  if (summary.dataset_hash !== snapshot.dataset_hash || summary.filter_hash !== snapshot.filter_hash || snapshot.report.dataset_id !== dataset.manifest.dataset_id) throw new Error("EXCEL_SOURCE_MISMATCH");
  return { sheets: [summarySheet(input), channelSheet(summary), bridgeSheet(snapshot), productSheet(input.products ?? [], demoAlias(dataset.manifest.dataset_id)), actionSheet(input.actions), basisSheet(input)] };
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
      const object = cellObject(cell, r === 0 ? null : sheet.formats?.[c] ?? null);
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
  if (output instanceof ArrayBuffer) return new Uint8Array(output);
  if (output instanceof Uint8Array) return output;
  throw new Error("XLSX_WRITE_FAILED");
}

/** 使用者按「匯出 Excel」時呼叫：組活頁簿 → 寫檔 → 在瀏覽器本機下載；不上傳。 */
export async function exportExcel(input: ExcelExportInput, filename = "profitlens.xlsx"): Promise<void> {
  const bytes = await writeExcel(buildExcelWorkbook(input));
  downloadBinary(bytes, filename, EXCEL_MIME);
}
