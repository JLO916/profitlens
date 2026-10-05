import { describe, expect, it } from "vitest";
import golden from "../fixtures/golden/expected.json";
import { csvHeader, csvHeaderKey } from "../src/application/copy";
import { encodeCsv, exportIssuesCsv, exportProductsCsv, exportSnapshotCsv, type CsvCell } from "../src/application/export";
import { createSnapshot, hashInput } from "../src/application/workspace";
import { labels } from "../src/i18n";
import { validateDataset } from "../src/domain/validation";
import { parseCsv } from "../src/lib/csv";
import type { DatasetInput, ProductRow, ValidationIssue } from "../src/domain/types";
import { fixture } from "./helpers/fixtures";

const text = (value: string): CsvCell => ({ kind: "text", value });
const number = (value: string): CsvCell => ({ kind: "number", value });
/** R2：匯出標題列為「中文名稱 (english_key)」；測試以 english key 讀欄位，所以把標題透過 csvHeaderKey 還原。 */
function records(csv: string): Record<string, string>[] {
  const result = parseCsv(csv);
  return result.rows.map(row => Object.fromEntries(result.headers.map((header, index) => [csvHeaderKey(header), row.values[index]])));
}
function headerRow(csv: string): string[] {
  return parseCsv(csv).headers;
}
async function setup(input: DatasetInput = fixture()) {
  const result = validateDataset(input);
  expect(result.dataset).not.toBeNull();
  const dataset = result.dataset!;
  return { dataset, snapshot: await createSnapshot(dataset, {}, await hashInput(input)) };
}

describe("M3 typed safe CSV encoder", () => {
  it("writes UTF-8 BOM, quoted comma-delimited fields, CRLF records and inert embedded delimiters", () => {
    const result = encodeCsv([[text("label"), text("value")], [text('a,"b"'), text("line1\r\nline2")]]);
    expect(result).toBe('\uFEFF"label","value"\r\n"a,""b""","line1\r\nline2"\r\n');
    expect(records(result)).toEqual([{ label: 'a,"b"', value: "line1\r\nline2" }]);
  });

  it.each(["=1+1", "+SUM(A1)", "-1+2", "@SUM(A1)", "\t=1+1", "\r=1", "\n=1", " \t +1", "\ufeff=1", "\u0000@x", "\u200b=1", "-315.00"])("neutralizes untrusted text beginning with a formula/control prefix: %j", value => {
    const csv = encodeCsv([[text("value")], [text(value)]]);
    expect(records(csv)[0].value).toBe(`'${value}`);
    expect(csv).toContain(`"'${value.replaceAll('"', '""')}"`);
  });

  it("preserves strictly typed negative, very large and long decimal values exactly", () => {
    const values = ["-315.00", "9007199254740993.01", "-9007199254740993.01", "0.12345678901234567890123456789", "0.00"];
    const result = records(encodeCsv([[text("value")], ...values.map(value => [number(value)])]));
    expect(result.map(row => row.value)).toEqual(values);
    expect(encodeCsv([[number("-315.00")]])).toBe('\uFEFF"-315.00"\r\n');
  });

  it.each(["1e3", "+1", "NaN", "Infinity", "-1+2", "=1", "1,000", " 1", "", "1."])("rejects a non-decimal numeric payload instead of exporting it: %j", value => {
    expect(() => encodeCsv([[number(value)]])).toThrow("INVALID_NUMERIC_CELL");
  });

  it("rejects runtime Number payloads and leaves null empty rather than zero", () => {
    expect(() => encodeCsv([[{ kind: "number", value: 1 } as never]])).toThrow("INVALID_NUMERIC_CELL");
    expect(records(encodeCsv([[text("value")], [{ kind: "null" }]]))[0].value).toBe("");
  });
});

describe("M3 exact snapshot exports", () => {
  it("exports fixed golden period totals, channel facts, weeks and all bridge components", async () => {
    const { dataset, snapshot } = await setup();
    const csv = exportSnapshotCsv(dataset, snapshot);
    const headers = headerRow(csv);
    expect(headers.every(header => header === csvHeader(csvHeaderKey(header)))).toBe(true);
    expect(headers).toContain(`${labels.csvColumns.row_type} (row_type)`);
    expect(headers).toContain(`${labels.csvColumns.metric} (metric)`);
    const rows = records(csv);
    for (const period of ["previous", "current"] as const) {
      for (const [metric, value] of Object.entries(golden[period])) {
        expect(rows.find(row => row.row_type === "period_summary" && row.period === period && row.metric === metric)?.value).toBe(value);
      }
    }
    for (const [channel, expected] of Object.entries(golden.current_channels)) {
      expect(rows.find(row => row.row_type === "channel" && row.period === "current" && row.channel === channel && row.metric === "contribution_after_marketing")?.value).toBe(expected.contribution_after_marketing);
    }
    expect(rows.find(row => row.row_type === "weekly" && row.period === "current" && row.metric === "contribution_after_marketing")?.value).toBe("255.00");
    for (const [metric, value] of Object.entries(golden.bridge)) expect(rows.find(row => row.row_type === "bridge" && row.metric === metric)?.value).toBe(value);
  });

  it("carries the active filter metadata, raw string rates and actual source filenames", async () => {
    const { dataset, snapshot: original } = await setup();
    const snapshot = await createSnapshot(dataset, { channels: ["DTC"] }, original.dataset_hash);
    const rows = records(exportSnapshotCsv(dataset, snapshot, { "sales_daily.csv": "營運銷售.csv" }));
    // R4：assist_kpi 列的版本欄是 assist-kpi-v1（輔助指標獨立版本），其餘列仍是 contribution-v1。
    expect(rows.every(row => row.dataset_id === "golden-v1" && row.dataset_hash === snapshot.dataset_hash && row.filter_hash === snapshot.filter_hash && row.metric_version === (row.row_type === "assist_kpi" ? "assist-kpi-v1" : "contribution-v1") && row.as_of === "2026-08-03")).toBe(true);
    expect(rows.every(row => JSON.parse(row.scope).channels.length === 1 && JSON.parse(row.scope).channels[0] === "DTC")).toBe(true);
    expect(rows.filter(row => row.row_type === "channel").every(row => row.channel === "DTC")).toBe(true);
    expect(rows.find(row => row.row_type === "period_summary" && row.period === "current" && row.metric === "contribution_after_marketing")?.value).toBe("270.00");
    const revenue = rows.find(row => row.row_type === "period_summary" && row.period === "current" && row.metric === "net_revenue")!;
    expect(JSON.parse(revenue.source_refs).some((source: { file: string; logical_file: string }) => source.file === "營運銷售.csv" && source.logical_file === "sales_daily.csv")).toBe(true);
    expect(rows.find(row => row.row_type === "period_summary" && row.period === "current" && row.metric === "discount_rate")?.value).toBe(snapshot.report.current.metrics.discount_rate.value);
  });

  it("exports null with missing-data reason instead of a usable zero", async () => {
    const { dataset, snapshot } = await setup(fixture("errors/missing_cogs"));
    const rows = records(exportSnapshotCsv(dataset, snapshot));
    const contribution = rows.find(row => row.row_type === "period_summary" && row.period === "current" && row.metric === "contribution_after_marketing")!;
    expect(contribution.value).toBe("");
    expect(JSON.parse(contribution.reason_codes)).toContain("MISSING_COGS");
    expect(rows.find(row => row.row_type === "period_summary" && row.period === "current" && row.metric === "net_revenue")?.value).toBe("2470.00");
    expect(rows.find(row => row.row_type === "bridge" && row.metric === "sum")?.value).toBe("");
  });

  it("treats dataset metadata as untrusted text and never mutates the snapshot", async () => {
    const input = fixture();
    input.manifest = { ...(input.manifest as object), dataset_id: "=1+1" };
    const { dataset, snapshot } = await setup(input);
    const before = structuredClone({ dataset, snapshot });
    expect(records(exportSnapshotCsv(dataset, snapshot))[0].dataset_id).toBe("'=1+1");
    expect({ dataset, snapshot }).toEqual(before);
  });
});

describe("M3 scoped product and issue exports", () => {
  it("exports only supplied visible product rows, with category/search scope and no channel contribution", async () => {
    const { dataset, snapshot } = await setup();
    const product = snapshot.products.rows.filter(row => row.channel === "DTC" && row.sku === "A");
    const rows = records(exportProductsCsv(dataset, snapshot, product, { category: "HOME", query: "A" }));
    expect(rows.every(row => row.row_type === "product" && row.channel === "DTC" && row.sku === "A" && row.category === "HOME" && row.product_category === "HOME" && row.product_query === "A")).toBe(true);
    expect(rows.find(row => row.metric === "net_revenue")?.value).toBe("1120.00");
    expect(rows.find(row => row.metric === "gross_profit")?.value).toBe("540.00");
    expect(rows.some(row => ["ad_spend", "contribution_after_marketing", "contribution_before_marketing"].includes(row.metric))).toBe(false);
    expect(rows.every(row => JSON.parse(row.source_refs).every((source: { logical_file: string }) => source.logical_file === "sales_daily.csv"))).toBe(true);
  });

  it("protects SKU/category/query text and excludes injected non-product metric keys", async () => {
    const input = fixture();
    input.files["sales_daily.csv"] = (input.files["sales_daily.csv"] as string).replaceAll(",A,HOME,", ",=1+1,@HOME,");
    const { dataset, snapshot } = await setup(input);
    const products = snapshot.products.rows.filter(row => row.sku === "=1+1").map(row => ({ ...row, metrics: { ...row.metrics, contribution_after_marketing: { value: "999.00", reason_codes: [] } } })) as ProductRow[];
    const rows = records(exportProductsCsv(dataset, snapshot, products, { category: "@HOME", query: "=1+1" }));
    expect(rows.every(row => row.sku === "'=1+1" && row.category === "'@HOME" && row.product_category === "'@HOME" && row.product_query === "'=1+1")).toBe(true);
    expect(rows.some(row => row.metric === "contribution_after_marketing")).toBe(false);
  });

  it("an empty product selection exports metadata without inventing product totals", async () => {
    const { dataset, snapshot } = await setup();
    const rows = records(exportProductsCsv(dataset, snapshot, [], { query: "NO_MATCH" }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ row_type: "selection", product_query: "NO_MATCH", value: "", metric: "" });
    expect(JSON.parse(rows[0].reason_codes)).toContain("NO_MATCHING_PRODUCTS");
  });

  it("issue CSV keeps logical/actual files and escapes untrusted error fields", () => {
    const issues: ValidationIssue[] = [{ severity: "blocking", file: "sales_daily.csv", line: 12, field: "=BAD", reason_code: "INVALID_MONEY", message: '含逗號,引號"與換行\n的文字', date: "2026-08-02", channel: "+DTC", sku: "-SKU" }];
    const csv = exportIssuesCsv(issues, { "sales_daily.csv": "@actual.csv" });
    // R3：多一欄白話說明；V3-2a 起 labels.importErrors 查不到的代碼顯示「問題代碼 XXX」，不退回 domain 的原訊息。
    expect(headerRow(csv)).toEqual(["severity", "file", "logical_file", "line", "field", "reason_code", "message", "message_plain", "date", "channel", "sku"].map(csvHeader));
    expect(headerRow(csv)[0]).toBe(`${labels.csvColumns.severity} (severity)`);
    const rows = records(csv);
    expect(rows).toEqual([{ severity: "blocking", file: "'@actual.csv", logical_file: "sales_daily.csv", line: "12", field: "'=BAD", reason_code: "INVALID_MONEY", message: '含逗號,引號"與換行\n的文字', message_plain: `${labels.ui.issueList.reasonCodeSummary} INVALID_MONEY`, date: "2026-08-02", channel: "'+DTC", sku: "'-SKU" }]);
    expect(records(exportIssuesCsv([]))).toEqual([]);
  });
});
