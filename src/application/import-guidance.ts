import Decimal from "decimal.js";
import { aggregatePeriod } from "@/domain/aggregation";
import { dayCount, isBusinessDate } from "@/domain/date";
import { AMOUNT_FIELDS, COST_FIELDS, SALES_FIELDS, type AmountField, type ComparisonMode, type FileName, type Metrics, type Period, type ValidationIssue } from "@/domain/types";
import { importColumns, type ImportFileDraft, type PreparedImport } from "./import";

export const columnGuidance: Record<string, { label: string; meaning: string }> = {
  date: { label: "商業入帳日", meaning: "YYYY-MM-DD；不是必然等於訂單成立日，退款與費用採同一入帳政策。" },
  channel: { label: "銷售目的通路", meaning: "例：官網、商城；不是 Meta／Google 等媒體平台，不自動分攤跨通路投放。" },
  sku: { label: "商品代碼", meaning: "同一商品固定代碼；不可放入姓名、Email 或訂單個資。" },
  category: { label: "商品品類", meaning: "同一 SKU 各列的品類必須一致。" },
  units_sold: { label: "入帳售出件數", meaning: "非負整數，不含退回件數；不能用來推算退貨率。" },
  gross_sales: { label: "折扣前、退款前商品收入", meaning: "未稅、未扣折扣退款及費用；不可直接用淨收款、平台結算或含稅營業額，避免重複扣除。" },
  discounts: { label: "商品折扣", meaning: "正數、不得超過同列折扣前收入；來源須先區分平台補助與商家折扣。" },
  refunds: { label: "已入帳商品退款", meaning: "正數，可大於當日收入；按入帳日扣除，不再自行推算成本沖回。" },
  cogs_net: { label: "銷貨成本淨額", meaning: "採來源已入帳淨額，成本為正、實際回收入庫成本沖回為負；缺漏保持未知。" },
  platform_fees: { label: "平台費用", meaning: "已入帳金額，不是費率；實際抵扣可負值，不含其他已列成本。" },
  payment_fees: { label: "金流費用", meaning: "已入帳金額，不是費率；實際抵扣可負值。" },
  fulfillment_costs: { label: "履約費用", meaning: "已入帳物流與履約支出；模型會扣此費用，但不含消費者支付的運費收入。" },
  other_variable_costs: { label: "其他變動費用", meaning: "不含商品成本、廣告費及其他欄已列費用；不含固定月租。" },
  ad_spend: { label: "通路廣告支出", meaning: "歸屬銷售目的通路的非負已入帳費用；每個日期通路都需列出，無投放明確填 0。" },
  currency: { label: "幣別", meaning: "僅接受 TWD；不做匯率換算。" },
};
export const roleGuidance: Record<FileName, string> = {
  "sales_daily.csv": "一列＝入帳日 × 銷售通路 × SKU。訂單級匯出需先在來源端按此粒度明確彙總，並保留金額對帳；系統不自動合併重複鍵。",
  "channel_costs_daily.csv": "一列＝入帳日 × 銷售通路。涵蓋範圍每天、每通路都要一列；零費用填 0，未知留白，禁止按 SKU 複製費用。",
  "ad_spend_daily.csv": "一列＝入帳日 × 銷售通路。涵蓋範圍每天、每通路都要一列；零投放填 0，缺列不是零。",
};
export function standardCsvTemplate(role: FileName): string { return "\uFEFF" + importColumns[role].join(",") + "\r\n"; }
const roles = Object.keys(importColumns) as FileName[];
type Drafts = Partial<Record<FileName, ImportFileDraft>>;
export interface ImportSettingsProposal {
  coverage_start: string; coverage_end: string; data_as_of: string; channels: string[];
  previous_period: Period | null; current_period: Period | null; comparison_mode: ComparisonMode;
}
function shifted(date: string, offset: number) { return new Date(Date.parse(date + "T00:00:00Z") + offset * 86_400_000).toISOString().slice(0, 10); }

/** Inspect only explicitly mapped keys. Never infer financial meaning or coverage completeness. */
export function proposeImportSettings(drafts: Drafts): { proposal: ImportSettingsProposal | null; issues: ValidationIssue[]; notes: string[] } {
  const issues: ValidationIssue[] = [], dates: string[] = [];
  const channels = new Set<string>();
  for (const file of roles) {
    const draft = drafts[file];
    const add = (field: string, message: string, line: number | null = null) => issues.push({ file, field, line, severity: "blocking", reason_code: "PROPOSAL_KEYS_INVALID", message });
    if (!draft?.parsed || draft.file !== file || draft.issues.some(item => item.severity === "blocking")) { add("$file", "請先成功讀取三份 CSV，再提議範圍。"); continue; }
    const parsed = draft.parsed;
    const dateIndex = parsed.headers.indexOf(draft.mapping.date), channelIndex = parsed.headers.indexOf(draft.mapping.channel);
    if (dateIndex < 0 || channelIndex < 0 || dateIndex === channelIndex) { add("$mapping", "請先選擇不同的日期與通路來源欄位。"); continue; }
    if ((draft.mapping.date !== "date" || draft.mapping.channel !== "channel") && !draft.mappingConfirmed) { add("$mapping", "請先確認自訂日期及通路欄位的含義。"); continue; }
    for (const row of parsed.rows) {
      const date = row.values[dateIndex], channel = row.values[channelIndex];
      if (!isBusinessDate(date)) add("date", "日期須為有效的 YYYY-MM-DD；不能從錯誤日期提議範圍。", row.line);
      else dates.push(date);
      if (!channel.trim() || channel !== channel.trim() || channel.length > 200 || /[\u0000-\u001f\u007f]/.test(channel)) add("channel", "通路不得空白、含前後空白、超長或含控制字元。", row.line);
      else channels.add(channel);
    }
  }
  if (issues.length || dates.length === 0) return { proposal: null, issues, notes: dates.length ? [] : ["尚無可辨識的日期記錄。"] };
  dates.sort();
  const start = dates[0], end = dates[dates.length - 1], days = dayCount({ start, end }), half = Math.floor(days / 2);
  const proposal: ImportSettingsProposal = {
    coverage_start: start, coverage_end: end, data_as_of: end, channels: [...channels].sort(), comparison_mode: "same_days",
    previous_period: half ? { start, end: shifted(start, half - 1) } : null,
    current_period: half ? { start: shifted(end, -(half - 1)), end } : null,
  };
  const notes = ["涵蓋範圍取三檔最早至最晚入帳日，不代表中間每天的資料已完整。通路取三檔聯集，請排除誤用的媒體平台名稱。", "資料截至日先提議為最新入帳日；請核對實際來源快照日期後調整，不代表系統已查核來源。"];
  const monthStart = start.slice(0, 7) + "-01";
  const nextMonth = new Date(start + "T00:00:00Z"); nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1, 1);
  const afterNext = new Date(nextMonth); afterNext.setUTCMonth(afterNext.getUTCMonth() + 1, 1);
  if (start === monthStart && shifted(afterNext.toISOString().slice(0, 10), -1) === end) {
    const nextStart = nextMonth.toISOString().slice(0, 10);
    proposal.comparison_mode = "calendar_months";
    proposal.previous_period = { start, end: shifted(nextStart, -1) };
    proposal.current_period = { start: nextStart, end };
    notes.push("提議比較相鄰的兩個完整自然月；天數可能不同，合計與日均值分開呈現。");
  } else if (half && days % 2) notes.push(`等天數提議的前後期各 ${half} 天；中間日 ${shifted(start, half)} 保留在涵蓋範圍與對帳，但不屬於兩個比較期間，請核對或手動調整。`);
  else if (!half) notes.push("目前只有一天，無法提議不重疊的前後期；請補齊資料並自行設定。");
  else notes.push(`等天數提議的前後期各 ${half} 天；這只是待確認的比較方式。`);
  return { proposal, issues, notes };
}
export interface ReconciliationField {
  file: FileName; filename: string; source_column: string; field: AmountField;
  source_total: string | null; known_subtotal: string; missing_values: number; standard_total: string | null;
  difference: string | null; reason_codes: string[];
}
export interface ImportReconciliation {
  period: Period; channels: string[]; fields: ReconciliationField[]; metrics: Metrics; excluded: string[];
}
/** Validated full-coverage reconciliation, before workspace commit; raw sums stay independent from model aggregation. */
export function buildImportReconciliation(prepared: PreparedImport, drafts: Drafts): ImportReconciliation | null {
  const dataset = prepared.validation.dataset;
  if (!dataset || prepared.validation.classification === "blocking") return null;
  const period = { start: dataset.manifest.coverage_start, end: dataset.manifest.coverage_end };
  const summary = aggregatePeriod(dataset, period, dataset.manifest.channels);
  let maxAmountLength = 1;
  for (const file of roles) {
    const draft = drafts[file];
    if (!draft?.parsed) continue;
    for (const field of AMOUNT_FIELDS) {
      const source = prepared.columnMappings[file]?.[field];
      const index = source ? draft.parsed.headers.indexOf(source) : -1;
      if (index < 0) continue;
      for (const row of draft.parsed.rows) maxAmountLength = Math.max(maxAmountLength, row.values[index].length);
    }
  }
  const ExactDecimal = Decimal.clone({ precision: maxAmountLength + 20, rounding: Decimal.ROUND_HALF_UP });
  const fields: ReconciliationField[] = [];
  for (const field of AMOUNT_FIELDS) {
    const file: FileName = (SALES_FIELDS as readonly string[]).includes(field) ? "sales_daily.csv" : (COST_FIELDS as readonly string[]).includes(field) ? "channel_costs_daily.csv" : "ad_spend_daily.csv";
    const draft = drafts[file], source_column = prepared.columnMappings[file]?.[field];
    if (!draft?.parsed || !source_column) return null;
    const sourceIndex = draft.parsed.headers.indexOf(source_column);
    if (sourceIndex < 0) return null;
    let sum = new ExactDecimal(0), missing_values = 0;
    for (const row of draft.parsed.rows) {
      const value = row.values[sourceIndex].trim();
      if (!value) missing_values++;
      else if (!/^-?\d+(?:\.\d{1,2})?$/.test(value)) return null;
      else sum = sum.plus(value);
    }
    const source_total = missing_values ? null : sum.toFixed(2), standard = summary.metrics[field];
    fields.push({ file, filename: draft.name, source_column, field, source_total, known_subtotal: sum.toFixed(2), missing_values,
      standard_total: standard.value, difference: source_total !== null && standard.value !== null ? new ExactDecimal(standard.value).minus(source_total).toFixed(2) : null, reason_codes: [...standard.reason_codes] });
  }
  return { period, channels: [...dataset.manifest.channels], fields, metrics: summary.metrics,
    excluded: ["消費者支付的運費收入：未建模，不是零；履約支出仍依已入帳金額扣除。", "營業稅：本模型只接受已整理的未稅商品金額與費用，不自動除以任何稅率。", "平台補助及其他未建模收入：未納入；不可混入商品收入或當成商家折扣。", "固定月租、其他固定費及所得稅：未納入。行銷後貢獻只代表定義範圍內的商品貢獻，不是公司淨利。"] };
}
