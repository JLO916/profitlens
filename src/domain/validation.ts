import { z } from "zod";
import { CsvParseError, MAX_CSV_ROWS, parseCsv } from "@/lib/csv";
import { dateRange, dayCount, isBusinessDate, validatePeriods } from "./date";
import { parseCents } from "./money";
import { COST_FIELDS, SALES_FIELDS } from "./types";
import type { AdRow, CostRow, DatasetInput, FileName, Manifest, SalesRow, SourceRef, ValidationIssue, ValidationResult } from "./types";

const dateSchema = z.string().refine(isBusinessDate, "日期必須是有效的 YYYY-MM-DD 商業日期。");
const periodSchema = z.strictObject({ start: dateSchema, end: dateSchema });
const manifestSchema = z.object({
  schema_version: z.literal("1.0"),
  dataset_id: z.string().refine((value) => value.trim().length > 0),
  source_type: z.enum(["synthetic", "user_provided"]),
  currency: z.literal("TWD"),
  timezone: z.literal("Asia/Taipei"),
  data_as_of: dateSchema,
  coverage_start: dateSchema,
  coverage_end: dateSchema,
  channels: z.array(z.string().refine((value) => value.trim().length > 0)).min(1)
    .refine((channels) => new Set(channels).size === channels.length, "通路不可重複。"),
  comparison_mode: z.enum(["same_days", "calendar_months"]).default("same_days"),
  previous_period: periodSchema,
  current_period: periodSchema,
  sales_coverage_confirmed: z.boolean(),
  amount_basis: z.literal("product_amounts_excluding_tax_and_customer_shipping_income"),
});
const expectedColumns = {
  "sales_daily.csv": ["date", "channel", "sku", "category", "units_sold", ...SALES_FIELDS, "currency"],
  "channel_costs_daily.csv": ["date", "channel", ...COST_FIELDS, "currency"],
  "ad_spend_daily.csv": ["date", "channel", "ad_spend", "currency"],
} satisfies Record<FileName, readonly string[]>;
const fileNames = Object.keys(expectedColumns) as FileName[];

/** Validates a fresh candidate. Blocking results cannot be committed and never mutate earlier datasets. */
export function validateDataset(input: DatasetInput): ValidationResult {
  const issues: ValidationIssue[] = [];
  const unknownColumns: ValidationResult["unknownColumns"] = {};
  const sales: SalesRow[] = [];
  const costs: CostRow[] = [];
  const ads: AdRow[] = [];
  const manifestResult = manifestSchema.safeParse(input.manifest);
  if (!manifestResult.success) {
    for (const error of manifestResult.error.issues) {
      issues.push({ file: "manifest.json", line: null, field: error.path.join(".") || "$manifest", severity: "blocking", reason_code: "INVALID_MANIFEST", message: "資料集必要設定缺漏或格式不符，請依資料契約確認。" });
    }
    return { classification: "blocking", dataset: null, issues, unknownColumns };
  }
  // Zod strips extra manifest metadata (for example fixture note/seed/expected_shape).
  const manifest = manifestResult.data;
  const periodErrors = validatePeriods(manifest);
  for (const reason_code of periodErrors) {
    issues.push({ file: "manifest.json", line: null, field: "periods", severity: "blocking", reason_code, message: "前期須早於本期，兩期須在 coverage 與資料截至日內；相同天數模式須等長，完整自然月模式每期須恰為一個完整月份。" });
  }
  if (periodErrors.length > 0) return { classification: "blocking", dataset: null, issues, unknownColumns };
  if (!manifest.sales_coverage_confirmed) {
    issues.push({ file: "manifest.json", line: null, field: "sales_coverage_confirmed", severity: "partial", reason_code: "SALES_COVERAGE_UNCONFIRMED", message: "銷售涵蓋範圍尚未確認，沒有銷售列不能解讀為零銷售，總計保持未知。" });
  }

  const categories = new Map<string, string>();
  for (const file of fileNames) {
    const raw = input.files[file];
    if (raw === undefined) {
      issues.push({ file, line: null, field: "$file", severity: "blocking", reason_code: "MISSING_FILE", message: "請提供必要的標準 CSV 檔案。" });
      continue;
    }
    let csv: ReturnType<typeof parseCsv>;
    try { csv = parseCsv(raw); }
    catch (error) {
      if (!(error instanceof CsvParseError)) throw error;
      issues.push({ file, line: error.line, field: error.field, severity: "blocking", reason_code: error.reason_code, message: error.message });
      continue;
    }
    const required: readonly string[] = expectedColumns[file];
    const missingColumns = required.filter((name) => !csv.headers.includes(name));
    for (const field of missingColumns) issues.push({ file, line: csv.headerLine, field, severity: "blocking", reason_code: "MISSING_COLUMN", message: "CSV 缺少必要標準欄位。" });
    const unknown = csv.headers.filter((name) => !required.includes(name));
    if (unknown.length > 0) {
      unknownColumns[file] = unknown;
      for (const field of unknown) {
        const confirmed = input.confirmedUnknownColumns?.[file]?.includes(field) ?? false;
        issues.push({ file, line: csv.headerLine, field, severity: confirmed ? "warning" : "blocking", reason_code: confirmed ? "UNKNOWN_COLUMN_IGNORED" : "UNKNOWN_COLUMN_UNCONFIRMED", message: confirmed ? "已確認忽略未定義欄位，其內容不會進入資料集。" : "請先確認忽略此未定義欄位。" });
      }
    }
    if (missingColumns.length > 0) continue;
    const seen = new Set<string>();
    for (const record of csv.rows) {
      // Only contract fields are copied. Unknown-column values remain outside the domain object.
      const values: Record<string, string> = Object.fromEntries(required.map((field) => [field, record.values[csv.headers.indexOf(field)]]));
      const source: SourceRef = { file, line: record.line, date: values.date, channel: values.channel, ...(file === "sales_daily.csv" ? { sku: values.sku } : {}) };
      const add = (severity: ValidationIssue["severity"], reason_code: string, field: string, message: string) => {
        issues.push({ ...source, severity, reason_code, field, message });
      };
      for (const field of file === "sales_daily.csv" ? ["date", "channel", "sku"] : ["date", "channel"]) {
        if (values[field].trim() === "") add("blocking", "MISSING_KEY", field, "必要識別鍵不可空白。");
      }
      if (!isBusinessDate(values.date)) add("blocking", "INVALID_DATE", "date", "日期必須是有效的 YYYY-MM-DD 商業日期。");
      else if (values.date < manifest.coverage_start || values.date > manifest.coverage_end) add("blocking", "OUTSIDE_COVERAGE", "date", "此列日期超出資料集涵蓋範圍。");
      if (!manifest.channels.includes(values.channel)) add("blocking", "UNKNOWN_CHANNEL", "channel", "通路必須符合資料集設定，不能以媒體平台代替銷售目的通路。");
      if (values.currency !== "TWD") add("blocking", "MIXED_CURRENCY", "currency", "所有列的幣別必須明確為 TWD，不自動換匯。");
      const key = JSON.stringify(file === "sales_daily.csv" ? [values.date, values.channel, values.sku] : [values.date, values.channel]);
      const duplicateReason = file === "sales_daily.csv" ? "DUPLICATE_SALES_KEY" : file === "channel_costs_daily.csv" ? "DUPLICATE_COST_KEY" : "DUPLICATE_AD_KEY";
      if (seen.has(key)) add("blocking", duplicateReason, "$key", "同一資料粒度的唯一鍵重複，請回來源確認，不自動去重。");
      seen.add(key);
      const amount = (field: string, nonNegative = false): bigint | null => {
        let value: bigint | null;
        try { value = parseCents(values[field]); }
        catch { add("blocking", "INVALID_AMOUNT", field, "金額須為不含符號或千分位的十進位數字，最多兩位小數。"); return null; }
        if (value === null) add("partial", field === "cogs_net" ? "MISSING_COGS" : `MISSING_${field.toUpperCase()}`, field, "金額缺漏；保留 null，相關總計不得補零。");
        else if (nonNegative && value < 0n) add("blocking", "NEGATIVE_AMOUNT", field, "此欄位不可為負值。");
        return value;
      };
      const base = { date: values.date, channel: values.channel, currency: "TWD" as const, source };
      if (file === "sales_daily.csv") {
        if (categories.has(values.sku) && categories.get(values.sku) !== values.category) add("blocking", "INCONSISTENT_CATEGORY", "category", "同一 SKU 在各日期與通路的品類必須一致。");
        categories.set(values.sku, values.category);
        let units_sold: bigint | null = null;
        if (values.units_sold.trim() === "") add("partial", "MISSING_UNITS_SOLD", "units_sold", "售出件數缺漏，不當作零。");
        else if (!/^\d+$/.test(values.units_sold.trim())) add("blocking", "INVALID_UNITS", "units_sold", "售出件數必須是非負整數。");
        else units_sold = BigInt(values.units_sold.trim());
        const gross_sales = amount("gross_sales", true);
        const discounts = amount("discounts", true);
        const refunds = amount("refunds", true);
        const cogs_net = amount("cogs_net");
        if (gross_sales !== null && discounts !== null && discounts > gross_sales) add("blocking", "DISCOUNT_EXCEEDS_GROSS", "discounts", "折扣不可大於同列折扣前商品收入。");
        sales.push({ ...base, sku: values.sku, category: values.category, units_sold, gross_sales, discounts, refunds, cogs_net });
      } else if (file === "channel_costs_daily.csv") {
        costs.push({ ...base, platform_fees: amount("platform_fees"), payment_fees: amount("payment_fees"), fulfillment_costs: amount("fulfillment_costs"), other_variable_costs: amount("other_variable_costs") });
      } else ads.push({ ...base, ad_spend: amount("ad_spend", true) });
    }
  }
  if (issues.some((issue) => issue.severity === "blocking")) return { classification: "blocking", dataset: null, issues, unknownColumns };
  appendMissingDays(manifest, costs, ads, issues);
  const classification = issues.some((issue) => issue.severity === "partial") ? "partial" : "valid";
  return { classification, dataset: { manifest, sales, costs, ads, issues }, issues, unknownColumns };
}

function appendMissingDays(manifest: Manifest, costs: CostRow[], ads: AdRow[], issues: ValidationIssue[]) {
  const expectedCount = dayCount({ start: manifest.coverage_start, end: manifest.coverage_end }) * manifest.channels.length;
  const requirements = [
    { file: "channel_costs_daily.csv" as const, rows: costs, reason_code: "MISSING_CHANNEL_COST_DAY" },
    { file: "ad_spend_daily.csv" as const, rows: ads, reason_code: "MISSING_AD_DAY" },
  ];
  // No permitted 50,000-row file can cover this grid. Report a range-level gap without
  // allocating millions of synthetic rows or introducing a stricter blocking policy.
  if (expectedCount > MAX_CSV_ROWS) {
    for (const { file, reason_code } of requirements) issues.push({ file, line: null, field: "$coverage", severity: "partial", reason_code, message: "涵蓋日期與通路所需列數超過每檔上限；此範圍費用不完整，缺列不得視為零。" });
    return;
  }
  const dates = dateRange(manifest.coverage_start, manifest.coverage_end);
  for (const { file, rows, reason_code } of requirements) {
    const keys = new Set(rows.map((row) => JSON.stringify([row.date, row.channel])));
    for (const date of dates) for (const channel of manifest.channels) {
      if (!keys.has(JSON.stringify([date, channel]))) issues.push({ file, line: null, date, channel, field: "$row", severity: "partial", reason_code, message: "缺少此日期及通路的費用列，不能當作零費用或零投放。" });
    }
  }
}
