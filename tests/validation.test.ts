import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateDataset } from "@/domain/validation";
import { parseCsv } from "@/lib/csv";
import type { DatasetInput, FileName } from "@/domain/types";

const files: FileName[] = ["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"];
function fixture(name = "golden"): DatasetInput {
  const dir = join(process.cwd(), "fixtures", name);
  return {
    manifest: JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")),
    files: Object.fromEntries(files.map((file) => [file, readFileSync(join(dir, file), "utf8")])),
  };
}
function manifest(input: DatasetInput): Record<string, unknown> {
  return input.manifest as Record<string, unknown>;
}
function textFile(input: DatasetInput, file: FileName): string {
  return input.files[file] as string;
}
function changeCell(input: DatasetInput, file: FileName, row: number, field: string, value: string) {
  const rows = textFile(input, file).trimEnd().split(/\r?\n/).map((line) => line.split(","));
  rows[row][rows[0].indexOf(field)] = value;
  input.files[file] = rows.map((line) => line.join(",")).join("\n") + "\n";
}
function omitRow(input: DatasetInput, file: FileName, row: number) {
  const lines = textFile(input, file).trimEnd().split(/\r?\n/);
  lines.splice(row, 1);
  input.files[file] = lines.join("\n") + "\n";
}

// All expected values below are literal contract expectations or immutable fixture answers.
describe("CSV records and traceability", () => {
  it("reads UTF-8 BOM, commas, escaped quotes, CRLF and quoted multiline with physical source lines", () => {
    const parsed = parseCsv(new TextEncoder().encode('\uFEFFkey,note\r\nA,"two,\r\n""quoted"""\r\nB,\r\n'));
    expect(parsed.headers).toEqual(["key", "note"]);
    expect(parsed.rows).toEqual([
      { line: 2, values: ["A", 'two,\r\n"quoted"'] },
      { line: 4, values: ["B", ""] },
    ]);
  });
  it.each([
    ['key,note\nA,"unterminated', "MALFORMED_CSV"],
    ['key,note\nA,un"quoted', "MALFORMED_CSV"],
    ['key,note\nA,"quoted"tail', "MALFORMED_CSV"],
    ['key,note\nA,one,extra', "COLUMN_COUNT_MISMATCH"],
    ['key,note\nA', "COLUMN_COUNT_MISMATCH"],
    ['key,key\nA,B', "DUPLICATE_COLUMN"],
    ['', "EMPTY_CSV"],
  ])("rejects malformed input %j", (csv, code) => {
    expect(() => parseCsv(csv)).toThrow(expect.objectContaining({ reason_code: code }));
  });
  it("rejects invalid UTF-8 rather than replacing bytes", () => {
    expect(() => parseCsv(new Uint8Array([0x61, 0x0a, 0xc3, 0x28])))
      .toThrow(expect.objectContaining({ reason_code: "INVALID_UTF8" }));
  });
  it("accepts 50,000 data rows and rejects 50,001 instead of truncating", () => {
    expect(parseCsv("key\n" + "A\n".repeat(50_000)).rows).toHaveLength(50_000);
    expect(() => parseCsv("key\n" + "A\n".repeat(50_001)))
      .toThrow(expect.objectContaining({ reason_code: "ROW_LIMIT_EXCEEDED" }));
  });
  it("rejects over 5 MiB measured as UTF-8 bytes", () => {
    expect(() => parseCsv("key\n" + "商".repeat(Math.ceil(5 * 1024 * 1024 / 3))))
      .toThrow(expect.objectContaining({ reason_code: "FILE_TOO_LARGE" }));
  });
});

describe("dataset validation and immutable bad fixtures", () => {
  it.each(["golden", "demo", "zero_ad", "refund_only"])("accepts %s and preserves source precision", (name) => {
    const result = validateDataset(fixture(name));
    expect(result.classification).toBe("valid");
    expect(result.dataset).not.toBeNull();
    expect(result.dataset!.sales[0].source).toEqual(expect.objectContaining({ file: "sales_daily.csv", line: 2 }));
    expect(typeof result.dataset!.sales[0].gross_sales).toBe("bigint");
  });
  it.each(["duplicate_sales_key", "mixed_currency", "missing_cogs", "missing_ad_day"])("matches errors/%s reference without repairs", (name) => {
    const expected = JSON.parse(readFileSync(join(process.cwd(), "fixtures", "errors", name, "expected_validation.json"), "utf8"));
    const result = validateDataset(fixture(`errors/${name}`));
    expect(result.classification).toBe(expected.classification);
    expect(result.issues).toContainEqual(expect.objectContaining({ reason_code: expected.reason_code }));
    if (expected.affected_csv_line) {
      expect(result.issues).toContainEqual(expect.objectContaining({ line: expected.affected_csv_line, reason_code: expected.reason_code }));
    }
    if (expected.classification === "blocking") expect(result.dataset).toBeNull();
    if (name === "missing_cogs") expect(result.dataset!.sales.some((row) => row.cogs_net === null)).toBe(true);
    if (name === "missing_ad_day") expect(result.dataset!.ads).toHaveLength(3);
  });
  it("requires all contract columns even when other columns are explicitly ignored", () => {
    const input = fixture();
    input.files["sales_daily.csv"] = textFile(input, "sales_daily.csv").replace("gross_sales", "revenue");
    input.confirmedUnknownColumns = { "sales_daily.csv": ["revenue"] };
    expect(validateDataset(input).issues).toContainEqual(expect.objectContaining({
      severity: "blocking", file: "sales_daily.csv", field: "gross_sales", reason_code: "MISSING_COLUMN", line: 1,
    }));
  });
  it("reports the actual header line after blank lines", () => {
    const input = fixture();
    input.files["sales_daily.csv"] = "\n" + textFile(input, "sales_daily.csv").replace("gross_sales", "revenue");
    expect(validateDataset(input).issues).toContainEqual(expect.objectContaining({
      field: "gross_sales", reason_code: "MISSING_COLUMN", line: 2,
    }));
  });
  it("reports large coverage gaps without enumerating or creating millions of rows", () => {
    const input = fixture();
    Object.assign(manifest(input), { coverage_start: "0001-01-01", coverage_end: "9999-12-31" });
    const result = validateDataset(input);
    expect(result.classification).toBe("partial");
    expect(result.dataset!.costs).toHaveLength(4);
    expect(result.dataset!.ads).toHaveLength(4);
    expect(result.issues.filter((issue) => issue.reason_code === "MISSING_CHANNEL_COST_DAY")).toHaveLength(1);
    expect(result.issues.filter((issue) => issue.reason_code === "MISSING_AD_DAY")).toHaveLength(1);
  });
  it("does not coerce missing units to zero", () => {
    const input = fixture(); changeCell(input, "sales_daily.csv", 1, "units_sold", "");
    const result = validateDataset(input);
    expect(result.classification).toBe("partial");
    expect(result.dataset!.sales[0].units_sold).toBeNull();
  });
  it("does not mutate or replace a previously loaded dataset on blocking input", () => {
    const good = validateDataset(fixture()).dataset;
    const copy = structuredClone(good);
    expect(validateDataset(fixture("errors/mixed_currency")).dataset).toBeNull();
    expect(good).toEqual(copy);
  });
  it("does not invent costs when required files are absent", () => {
    const input = fixture(); delete input.files["channel_costs_daily.csv"];
    expect(validateDataset(input)).toEqual(expect.objectContaining({ classification: "blocking", dataset: null }));
  });
  it("quotes are parsed before financial and source validation", () => {
    const input = fixture();
    input.files["sales_daily.csv"] = "\uFEFF" + textFile(input, "sales_daily.csv").replaceAll("HOME", '"HO,\r\n""ME"""');
    const result = validateDataset(input);
    expect(result.classification).toBe("valid");
    expect(result.dataset!.sales[0].category).toBe('HO,\r\n"ME"');
    expect(result.dataset!.sales[1].source.line).toBe(4);
  });
  it("reports parser errors with file and physical line", () => {
    const input = fixture(); input.files["ad_spend_daily.csv"] += "2026-08-02,DTC,1.00,TWD,extra\n";
    expect(validateDataset(input).issues).toContainEqual(expect.objectContaining({
      severity: "blocking", file: "ad_spend_daily.csv", line: 6, reason_code: "COLUMN_COUNT_MISMATCH",
    }));
  });
  it("lists unknown columns, blocks until explicit confirmation, then drops their values", () => {
    const input = fixture();
    input.files["sales_daily.csv"] = textFile(input, "sales_daily.csv").trimEnd().split(/\r?\n/)
      .map((line, index) => `${line},${index === 0 ? "private_note" : "=DO_NOT_EXECUTE()"}`).join("\n");
    const unconfirmed = validateDataset(input);
    expect(unconfirmed.classification).toBe("blocking");
    expect(unconfirmed.unknownColumns).toEqual({ "sales_daily.csv": ["private_note"] });
    input.confirmedUnknownColumns = { "sales_daily.csv": ["private_note"] };
    const confirmed = validateDataset(input);
    expect(confirmed.classification).toBe("valid");
    expect(confirmed.dataset!.sales[0]).not.toHaveProperty("private_note");
    expect(JSON.stringify(confirmed.unknownColumns)).not.toContain("DO_NOT_EXECUTE");
  });
  it.each([
    ["sales_daily.csv", "date", "", "MISSING_KEY"],
    ["sales_daily.csv", "sku", " ", "MISSING_KEY"],
    ["sales_daily.csv", "date", "2026-02-30", "INVALID_DATE"],
    ["sales_daily.csv", "date", "2026-8-01", "INVALID_DATE"],
    ["sales_daily.csv", "date", "2026-07-31", "OUTSIDE_COVERAGE"],
    ["sales_daily.csv", "channel", "Meta", "UNKNOWN_CHANNEL"],
    ["sales_daily.csv", "currency", "USD", "MIXED_CURRENCY"],
    ["sales_daily.csv", "gross_sales", "NaN", "INVALID_AMOUNT"],
    ["sales_daily.csv", "gross_sales", "1e3", "INVALID_AMOUNT"],
    ["sales_daily.csv", "gross_sales", "0.001", "INVALID_AMOUNT"],
    ["sales_daily.csv", "gross_sales", "-1", "NEGATIVE_AMOUNT"],
    ["sales_daily.csv", "discounts", "1001", "DISCOUNT_EXCEEDS_GROSS"],
    ["sales_daily.csv", "refunds", "-1", "NEGATIVE_AMOUNT"],
    ["sales_daily.csv", "units_sold", "1.5", "INVALID_UNITS"],
    ["sales_daily.csv", "units_sold", "-1", "INVALID_UNITS"],
    ["ad_spend_daily.csv", "ad_spend", "-0.01", "NEGATIVE_AMOUNT"],
  ] as const)("blocks invalid %s %s=%s", (file, field, value, reason) => {
    const input = fixture(); changeCell(input, file, 1, field, value);
    const result = validateDataset(input);
    expect(result.classification).toBe("blocking");
    expect(result.dataset).toBeNull();
    expect(result.issues).toContainEqual(expect.objectContaining({ reason_code: reason, file, field, line: 2 }));
  });
  it.each([
    ["channel_costs_daily.csv", "DUPLICATE_COST_KEY"], ["ad_spend_daily.csv", "DUPLICATE_AD_KEY"],
  ] as const)("blocks duplicate %s keys", (file, reason) => {
    const input = fixture(); input.files[file] += textFile(input, file).split(/\r?\n/)[1] + "\n";
    expect(validateDataset(input).issues).toContainEqual(expect.objectContaining({ severity: "blocking", reason_code: reason, line: 6 }));
  });
  it("requires a consistent category for the same SKU across channels and dates", () => {
    const input = fixture(); changeCell(input, "sales_daily.csv", 3, "category", "DIFFERENT");
    expect(validateDataset(input).issues).toContainEqual(expect.objectContaining({ reason_code: "INCONSISTENT_CATEGORY", field: "category", line: 4 }));
  });
  it.each([
    ["sales_daily.csv", "cogs_net", "MISSING_COGS"],
    ["sales_daily.csv", "gross_sales", "MISSING_GROSS_SALES"],
    ["channel_costs_daily.csv", "platform_fees", "MISSING_PLATFORM_FEES"],
    ["ad_spend_daily.csv", "ad_spend", "MISSING_AD_SPEND"],
  ] as const)("preserves blank %s %s as null with scoped partial issue", (file, field, reason) => {
    const input = fixture(); changeCell(input, file, 1, field, "  ");
    const result = validateDataset(input);
    expect(result.classification).toBe("partial");
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: "partial", reason_code: reason, field, line: 2, date: "2026-08-01", channel: "DTC" }));
    const rows = file === "sales_daily.csv" ? result.dataset!.sales : file === "channel_costs_daily.csv" ? result.dataset!.costs : result.dataset!.ads;
    expect(rows[0]).toHaveProperty(field, null);
  });
  it("preserves negative booked COGS and cost credits; does not reverse COGS from refunds", () => {
    const input = fixture();
    changeCell(input, "sales_daily.csv", 1, "refunds", "2000.00");
    changeCell(input, "sales_daily.csv", 1, "cogs_net", "-40.10");
    changeCell(input, "channel_costs_daily.csv", 1, "platform_fees", "-0.20");
    const result = validateDataset(input);
    expect(result.classification).toBe("valid");
    expect(result.dataset!.sales[0].refunds).toBe(200000n);
    expect(result.dataset!.sales[0].cogs_net).toBe(-4010n);
    expect(result.dataset!.costs[0].platform_fees).toBe(-20n);
  });
  it("enumerates missing day/channel expenses without synthesizing zero rows", () => {
    const input = fixture(); omitRow(input, "channel_costs_daily.csv", 2);
    const result = validateDataset(input);
    expect(result.classification).toBe("partial");
    expect(result.dataset!.costs).toHaveLength(3);
    expect(result.issues).toContainEqual(expect.objectContaining({ reason_code: "MISSING_CHANNEL_COST_DAY", line: null, date: "2026-08-01", channel: "MARKETPLACE" }));
  });
  it("marks unconfirmed sales coverage as unknown even without missing expense rows", () => {
    const input = fixture(); manifest(input).sales_coverage_confirmed = false;
    omitRow(input, "sales_daily.csv", 1); omitRow(input, "sales_daily.csv", 1);
    const result = validateDataset(input);
    expect(result.classification).toBe("partial");
    expect(result.issues).toContainEqual(expect.objectContaining({ reason_code: "SALES_COVERAGE_UNCONFIRMED", severity: "partial" }));
    expect(result.dataset!.manifest.sales_coverage_confirmed).toBe(false);
  });
});

describe("manifest validation", () => {
  it("strips extra manifest metadata without accepting it as domain configuration", () => {
    const input = fixture(); manifest(input).unexpected_setting = "inert metadata";
    const result = validateDataset(input);
    expect(result.classification).toBe("valid");
    expect(result.dataset!.manifest).not.toHaveProperty("unexpected_setting");
    expect(result.dataset!.manifest).not.toHaveProperty("note");
  });
  it.each([
    ["schema_version", "2.0"], ["dataset_id", ""], ["source_type", "made_up"],
    ["currency", "USD"], ["timezone", "UTC"], ["data_as_of", "2026-02-30"],
    ["coverage_start", "2026-8-01"], ["coverage_end", "2026-08-00"],
    ["channels", []], ["channels", ["DTC", "DTC"]], ["channels", [""]],
    ["sales_coverage_confirmed", "true"], ["amount_basis", "including_tax"],
    ["previous_period", { start: "2026-02-29", end: "2026-02-29" }],
  ])("blocks invalid %s", (key, value) => {
    const input = fixture(); manifest(input)[key] = value;
    const result = validateDataset(input);
    expect(result.classification).toBe("blocking"); expect(result.dataset).toBeNull();
    expect(result.issues).toContainEqual(expect.objectContaining({ file: "manifest.json", severity: "blocking" }));
  });
  it.each(["amount_basis", "sales_coverage_confirmed", "data_as_of", "channels"])("requires %s without guessing defaults", (field) => {
    const input = fixture(); delete manifest(input)[field];
    expect(validateDataset(input).classification).toBe("blocking");
  });
  it.each([
    { previous_period: { start: "2026-08-01", end: "2026-08-02" } },
    { current_period: { start: "2026-08-01", end: "2026-08-01" } },
    { current_period: { start: "2026-08-03", end: "2026-08-03" } },
    { coverage_start: "2026-08-03", coverage_end: "2026-08-02" },
  ])("blocks unequal, overlapping, outside or reversed periods %j", (override) => {
    const input = fixture(); Object.assign(manifest(input), override);
    expect(validateDataset(input).classification).toBe("blocking");
  });
});
