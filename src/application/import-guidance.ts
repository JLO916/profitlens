import Decimal from "decimal.js";
import { aggregatePeriod } from "@/domain/aggregation";
import { dayCount, isBusinessDate } from "@/domain/date";
import { AMOUNT_FIELDS, COST_FIELDS, SALES_FIELDS, type AmountField, type ComparisonMode, type FileName, type Metrics, type Period, type ValidationIssue } from "@/domain/types";
import { importColumns, type ImportFileDraft, type PreparedImport } from "./import";
import { convertInclusiveAmount } from "./tax-basis";
import { fill, labels } from "@/i18n";

const { guidance: guide } = labels.importWizard;
const { fields: fieldLabels } = labels.evidence;
export const columnGuidance: Record<string, { label: string; meaning: string }> = {
  date: { label: fieldLabels.date, meaning: guide.columnMeaning.date },
  channel: { label: fieldLabels.channel, meaning: guide.columnMeaning.channel },
  sku: { label: fieldLabels.sku, meaning: guide.columnMeaning.sku },
  category: { label: fieldLabels.category, meaning: guide.columnMeaning.category },
  units_sold: { label: fieldLabels.units_sold, meaning: guide.columnMeaning.unitsSold },
  gross_sales: { label: labels.metrics.gross_sales.headline, meaning: guide.columnMeaning.grossSales },
  discounts: { label: labels.metrics.discounts.headline, meaning: guide.columnMeaning.discounts },
  refunds: { label: labels.metrics.refunds.headline, meaning: guide.columnMeaning.refunds },
  cogs_net: { label: labels.metrics.cogs_net.headline, meaning: guide.columnMeaning.cogsNet },
  platform_fees: { label: labels.metrics.platform_fees.headline, meaning: guide.columnMeaning.platformFees },
  payment_fees: { label: labels.metrics.payment_fees.headline, meaning: guide.columnMeaning.paymentFees },
  fulfillment_costs: { label: labels.metrics.fulfillment_costs.headline, meaning: guide.columnMeaning.fulfillmentCosts },
  other_variable_costs: { label: labels.metrics.other_variable_costs.headline, meaning: guide.columnMeaning.otherVariableCosts },
  ad_spend: { label: labels.metrics.ad_spend.headline, meaning: guide.columnMeaning.adSpend },
  currency: { label: fieldLabels.currency, meaning: guide.columnMeaning.currency },
};
export const roleGuidance: Record<FileName, string> = {
  "sales_daily.csv": guide.roleHint.sales,
  "channel_costs_daily.csv": guide.roleHint.costs,
  "ad_spend_daily.csv": guide.roleHint.ads,
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
    if (!draft?.parsed || draft.file !== file || draft.issues.some(item => item.severity === "blocking")) { add("$file", guide.issue.readAllFiles); continue; }
    const parsed = draft.parsed;
    const dateIndex = parsed.headers.indexOf(draft.mapping.date), channelIndex = parsed.headers.indexOf(draft.mapping.channel);
    if (dateIndex < 0 || channelIndex < 0 || dateIndex === channelIndex) { add("$mapping", guide.issue.dateChannelSameColumn); continue; }
    if ((draft.mapping.date !== "date" || draft.mapping.channel !== "channel") && !draft.mappingConfirmed) { add("$mapping", guide.issue.mappingUnconfirmed); continue; }
    for (const row of parsed.rows) {
      const date = row.values[dateIndex], channel = row.values[channelIndex];
      if (!isBusinessDate(date)) add("date", guide.issue.invalidDate, row.line);
      else dates.push(date);
      if (!channel.trim() || channel !== channel.trim() || channel.length > 200 || /[\u0000-\u001f\u007f]/.test(channel)) add("channel", guide.issue.invalidChannel, row.line);
      else channels.add(channel);
    }
  }
  if (issues.length || dates.length === 0) return { proposal: null, issues, notes: dates.length ? [] : [guide.note.noDates] };
  dates.sort();
  const start = dates[0], end = dates[dates.length - 1], days = dayCount({ start, end }), half = Math.floor(days / 2);
  const proposal: ImportSettingsProposal = {
    coverage_start: start, coverage_end: end, data_as_of: end, channels: [...channels].sort(), comparison_mode: "same_days",
    previous_period: half ? { start, end: shifted(start, half - 1) } : null,
    current_period: half ? { start: shifted(end, -(half - 1)), end } : null,
  };
  const notes: string[] = [guide.note.coverageProposed, guide.note.asOfProposed];
  const monthStart = start.slice(0, 7) + "-01";
  const nextMonth = new Date(start + "T00:00:00Z"); nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1, 1);
  const afterNext = new Date(nextMonth); afterNext.setUTCMonth(afterNext.getUTCMonth() + 1, 1);
  if (start === monthStart && shifted(afterNext.toISOString().slice(0, 10), -1) === end) {
    const nextStart = nextMonth.toISOString().slice(0, 10);
    proposal.comparison_mode = "calendar_months";
    proposal.previous_period = { start, end: shifted(nextStart, -1) };
    proposal.current_period = { start: nextStart, end };
    notes.push(guide.note.calendarMonths);
  } else if (half && days % 2) notes.push(fill(guide.note.sameDaysOdd, { days: half, date: shifted(start, half) }));
  else if (!half) notes.push(guide.note.singleDay);
  else notes.push(fill(guide.note.sameDays, { days: half }));
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
      // R3：含稅匯入時來源總額採逐列換算後的值（與 domain 收到的一致）；含稅原值合計另列在前處理摘要。
      const raw = prepared.conversion ? prepared.raw_values[file]?.[row.line]?.[field] : undefined;
      const value = raw !== undefined ? convertInclusiveAmount(raw, prepared.conversion!.rate) : row.values[sourceIndex].trim();
      if (!value) missing_values++;
      else if (!/^-?\d+(?:\.\d{1,2})?$/.test(value)) return null;
      else sum = sum.plus(value);
    }
    const source_total = missing_values ? null : sum.toFixed(2), standard = summary.metrics[field];
    fields.push({ file, filename: draft.name, source_column, field, source_total, known_subtotal: sum.toFixed(2), missing_values,
      standard_total: standard.value, difference: source_total !== null && standard.value !== null ? new ExactDecimal(standard.value).minus(source_total).toFixed(2) : null, reason_codes: [...standard.reason_codes] });
  }
  return { period, channels: [...dataset.manifest.channels], fields, metrics: summary.metrics,
    excluded: [guide.excluded.shippingIncome, guide.excluded.platformSubsidy, guide.excluded.fixedAndTax] };
}
