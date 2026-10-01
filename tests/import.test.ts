import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { inspectImportFile, inspectManifestFile, prepareImport } from "@/application/import";
import type { ImportFileDraft } from "@/application/import";
import type { FileName } from "@/domain/types";

const names: FileName[] = ["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"];
const encoder = new TextEncoder();
function file(name: string, text: string) {
  const bytes = encoder.encode(text);
  return { name, bytes, size: bytes.byteLength };
}
function csv(folder: string, name: FileName) { return readFileSync(join(process.cwd(), "fixtures", folder, name), "utf8"); }
function manifest(folder = "golden"): Record<string, unknown> {
  return JSON.parse(readFileSync(join(process.cwd(), "fixtures", folder, "manifest.json"), "utf8"));
}
function drafts(folder = "golden"): Record<FileName, ImportFileDraft> {
  return Object.fromEntries(names.map(name => [name, inspectImportFile(name, file(`原始_${name}`, csv(folder, name)))])) as Record<FileName, ImportFileDraft>;
}
const confirmed = { amountBasisConfirmed: true };
const salesName = "sales_daily.csv";

describe("local CSV inspection", () => {
  it("keeps original filename, physical lines and exactly matched standard columns", () => {
    const inspected = inspectImportFile(salesName, file("營運銷售.CSV", "\uFEFF" + csv("golden", salesName)));
    expect(inspected.file).toBe(salesName);
    expect(inspected.name).toBe("營運銷售.CSV");
    expect(inspected.issues).toEqual([]);
    expect(inspected.parsed!.rows).toHaveLength(8);
    expect(inspected.preview).toHaveLength(8);
    expect(inspected.preview[0].line).toBe(2);
    expect(inspected.mapping.gross_sales).toBe("gross_sales");
    expect(inspected.mappingConfirmed).toBe(false);
    expect(inspected.ignoredColumnsConfirmed).toBe(false);
  });
  it("previews only the first ten records without discarding the remaining parsed source", () => {
    const inspected = inspectImportFile(salesName, file("sample.csv", csv("demo", salesName)));
    expect(inspected.preview).toHaveLength(10);
    expect(inspected.preview.at(-1)!.line).toBe(11);
    expect(inspected.parsed!.rows).toHaveLength(3360);
  });
  it("never guesses revenue or cost column aliases", () => {
    const inspected = inspectImportFile(salesName, file("sales.csv", csv("golden", salesName).replace("gross_sales", "revenue").replace("cogs_net", "成本")));
    expect(inspected.mapping.gross_sales).toBe("");
    expect(inspected.mapping.cogs_net).toBe("");
    expect(inspected.mapping.refunds).toBe("refunds");
  });
  it.each(["sales.xlsx", "sales.csv.exe", "sales", "sales.json"])("rejects unsupported extension %s before parsing", name => {
    const result = inspectImportFile(salesName, file(name, csv("golden", salesName)));
    expect(result.parsed).toBeNull();
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: "blocking", reason_code: "INVALID_FILE_EXTENSION" }));
  });
  it("checks both declared file size and actual bytes without truncation", () => {
    const normal = file("sales.csv", "date\n");
    expect(inspectImportFile(salesName, { ...normal, size: 5 * 1024 * 1024 + 1 }).issues)
      .toContainEqual(expect.objectContaining({ reason_code: "FILE_TOO_LARGE" }));
    expect(inspectImportFile(salesName, { name: "sales.csv", size: 1, bytes: new Uint8Array(5 * 1024 * 1024 + 1) }).issues)
      .toContainEqual(expect.objectContaining({ reason_code: "FILE_TOO_LARGE" }));
    expect(inspectImportFile(salesName, { ...normal, size: normal.size + 1 }).issues)
      .toContainEqual(expect.objectContaining({ reason_code: "FILE_SIZE_MISMATCH" }));
  });
  it("rejects invalid UTF-8 and preserves parser error source line", () => {
    expect(inspectImportFile(salesName, { name: "sales.csv", bytes: new Uint8Array([0xc3, 0x28]), size: 2 }).issues)
      .toContainEqual(expect.objectContaining({ reason_code: "INVALID_UTF8" }));
    const malformed = inspectImportFile(salesName, file("sales.csv", 'date,channel\n2026-08-01,"broken'));
    expect(malformed.issues).toContainEqual(expect.objectContaining({ file: salesName, line: 2, reason_code: "MALFORMED_CSV" }));
  });
  it("rejects over 50,000 records rather than previewing a truncated successful dataset", () => {
    const result = inspectImportFile(salesName, file("sales.csv", "date\n" + "2026-08-01\n".repeat(50_001)));
    expect(result.parsed).toBeNull();
    expect(result.preview).toEqual([]);
    expect(result.issues).toContainEqual(expect.objectContaining({ reason_code: "ROW_LIMIT_EXCEEDED" }));
  });
});

describe("explicit import preparation and M1 validation", () => {
  it("prepares golden source values as a local user-provided dataset and retains filename metadata", () => {
    const source = manifest();
    const pending = drafts();
    const copy = structuredClone(pending);
    const result = prepareImport(source, pending, confirmed);
    expect(result.validation.classification).toBe("valid");
    expect(result.validation.dataset!.manifest.source_type).toBe("user_provided");
    expect(source.source_type).toBe("synthetic");
    expect(result.originalNames[salesName]).toBe("原始_sales_daily.csv");
    expect(result.input!.files[salesName]).toContain("1000.00,100.00,0.00,400.00");
    expect(result.validation.dataset!.sales[0].gross_sales).toBe(100000n);
    expect(result.validation.dataset!.sales[0].source.line).toBe(2);
    expect(pending).toEqual(copy);
  });
  it("copies only confirmed standard-to-original column mappings for durable source traceability", () => {
    const pending = drafts();
    const withExtra = csv("golden", salesName).replace("gross_sales", "原始營收").trimEnd().split(/\r?\n/)
      .map((line, index) => `${line},${index === 0 ? "unused_note" : "private-value"}`).join("\n");
    pending[salesName] = inspectImportFile(salesName, file("sales.csv", withExtra));
    pending[salesName].mapping.gross_sales = "原始營收";
    expect(prepareImport(manifest(), pending, confirmed).columnMappings[salesName]).toBeUndefined();
    pending[salesName].mappingConfirmed = true;
    pending[salesName].ignoredColumnsConfirmed = true;
    const result = prepareImport(manifest(), pending, confirmed);
    expect(result.validation.classification).toBe("valid");
    expect(result.columnMappings[salesName]).toMatchObject({ date: "date", gross_sales: "原始營收", cogs_net: "cogs_net" });
    expect(result.columnMappings[salesName]).not.toHaveProperty("unused_note");
    expect(JSON.stringify(result.columnMappings)).not.toContain("private-value");
    pending[salesName].mapping.gross_sales = "changed later";
    expect(result.columnMappings[salesName]!.gross_sales).toBe("原始營收");
    result.columnMappings[salesName]!.cogs_net = "change result copy";
    expect(pending[salesName].mapping.cogs_net).toBe("cogs_net");
  });
  it("requires fresh explicit amount-basis confirmation even when a JSON flag claims consent", () => {
    const source = { ...manifest(), amountBasisConfirmed: true };
    const result = prepareImport(source, drafts(), { amountBasisConfirmed: false });
    expect(result.input).toBeNull();
    expect(result.validation.dataset).toBeNull();
    expect(result.validation.issues).toContainEqual(expect.objectContaining({ reason_code: "AMOUNT_BASIS_UNCONFIRMED" }));
  });
  it.each([["currency", "USD"], ["timezone", "UTC"], ["amount_basis", "including_tax"]])("does not rewrite an invalid %s setting", (field, value) => {
    const result = prepareImport({ ...manifest(), [field]: value }, drafts(), confirmed);
    expect(result.input).toBeNull();
    expect(result.validation.classification).toBe("blocking");
    expect(result.validation.issues).toContainEqual(expect.objectContaining({ file: "manifest.json", field }));
  });
  it("requires manual mapping confirmation for renamed standard fields", () => {
    const pending = drafts();
    pending[salesName] = inspectImportFile(salesName, file("銷售.csv", csv("golden", salesName).replace("gross_sales", "revenue")));
    expect(prepareImport(manifest(), pending, confirmed).validation.issues).toContainEqual(expect.objectContaining({ reason_code: "MISSING_COLUMN_MAPPING", field: "gross_sales" }));
    pending[salesName].mapping.gross_sales = "revenue";
    expect(prepareImport(manifest(), pending, confirmed).validation.issues).toContainEqual(expect.objectContaining({ reason_code: "COLUMN_MAPPING_UNCONFIRMED" }));
    pending[salesName].mappingConfirmed = true;
    const accepted = prepareImport(manifest(), pending, confirmed);
    expect(accepted.validation.classification).toBe("valid");
    expect(accepted.validation.dataset!.sales[0].gross_sales).toBe(100000n);
  });
  it("requires explicit ignore confirmation and excludes ignored header and content from submitted input", () => {
    const pending = drafts();
    const withExtra = csv("golden", salesName).trimEnd().split(/\r?\n/).map((line, index) => `${line},${index === 0 ? "private_note" : "=NEVER_EXECUTE()"}`).join("\n");
    pending[salesName] = inspectImportFile(salesName, file("sales.csv", withExtra));
    expect(prepareImport(manifest(), pending, confirmed).validation.issues).toContainEqual(expect.objectContaining({ reason_code: "UNKNOWN_COLUMN_UNCONFIRMED", field: "private_note" }));
    pending[salesName].ignoredColumnsConfirmed = true;
    const accepted = prepareImport(manifest(), pending, confirmed);
    expect(accepted.validation.classification).toBe("valid");
    expect(accepted.validation.unknownColumns[salesName]).toEqual(["private_note"]);
    expect(accepted.input!.files[salesName]).not.toContain("private_note");
    expect(accepted.input!.files[salesName]).not.toContain("NEVER_EXECUTE");
  });
  it.each([
    ["discounts", "gross_sales", "DUPLICATE_SOURCE_MAPPING"],
    ["gross_sales", "not_a_column", "MISSING_SOURCE_COLUMN"],
    ["gross_sales", "", "MISSING_COLUMN_MAPPING"],
    ["unexpected_target", "gross_sales", "UNKNOWN_MAPPING_TARGET"],
  ])("blocks invalid mapping %s to %s", (target, source, reason_code) => {
    const pending = drafts(); pending[salesName].mapping[target] = source; pending[salesName].mappingConfirmed = true;
    const result = prepareImport(manifest(), pending, confirmed);
    expect(result.validation.classification).toBe("blocking");
    expect(result.input).toBeNull();
    expect(result.validation.issues).toContainEqual(expect.objectContaining({ reason_code }));
  });
  it("does not silently substitute an absent file or a malformed file", () => {
    const pending: Partial<Record<FileName, ImportFileDraft>> = drafts(); delete pending["ad_spend_daily.csv"];
    expect(prepareImport(manifest(), pending, confirmed).validation.issues).toContainEqual(expect.objectContaining({ reason_code: "MISSING_FILE", file: "ad_spend_daily.csv" }));
    pending["ad_spend_daily.csv"] = inspectImportFile("ad_spend_daily.csv", file("broken.csv", 'ad_spend\n"bad'));
    expect(prepareImport(manifest(), pending, confirmed).validation.issues).toContainEqual(expect.objectContaining({ reason_code: "MALFORMED_CSV", file: "ad_spend_daily.csv", line: 2 }));
  });
  it.each([
    ["errors/duplicate_sales_key", "blocking", "DUPLICATE_SALES_KEY"],
    ["errors/missing_cogs", "partial", "MISSING_COGS"],
    ["errors/missing_ad_day", "partial", "MISSING_AD_DAY"],
    ["errors/mixed_currency", "blocking", "MIXED_CURRENCY"],
  ])("keeps %s classification and does not repair deliberately bad data", (folder, classification, reason_code) => {
    const result = prepareImport(manifest(folder), drafts(folder), confirmed);
    expect(result.validation.classification).toBe(classification);
    expect(result.validation.issues).toContainEqual(expect.objectContaining({ reason_code }));
    if (classification === "blocking") expect(result.input).toBeNull();
    if (folder.endsWith("duplicate_sales_key")) expect(result.validation.issues).toContainEqual(expect.objectContaining({ reason_code, line: 10 }));
    if (folder.endsWith("missing_cogs")) expect(result.validation.dataset!.sales.some(row => row.cogs_net === null)).toBe(true);
    if (folder.endsWith("missing_ad_day")) expect(result.validation.dataset!.ads).toHaveLength(3);
  });
  it("preserves original physical row lines after dropping quoted multiline columns and mapping", () => {
    const pending = drafts();
    const original = csv("golden", salesName).trimEnd().split(/\r?\n/);
    const text = "\n" + original.map((line, index) => index === 0 ? `${line.replace("gross_sales", "營收")},extra` : `${line},"discarded\r\ntext"`).join("\r\n");
    pending[salesName] = inspectImportFile(salesName, file("multiline.csv", text));
    pending[salesName].mapping.gross_sales = "營收";
    pending[salesName].mappingConfirmed = true;
    pending[salesName].ignoredColumnsConfirmed = true;
    const result = prepareImport(manifest(), pending, confirmed);
    expect(result.validation.classification).toBe("valid");
    expect(result.validation.dataset!.sales.map(row => row.source.line)).toEqual([3, 5, 7, 9, 11, 13, 15, 17]);
    expect(result.input!.files[salesName]).not.toContain("discarded");
  });
  it("preserves data line numbers when an ignored header itself spans multiple lines", () => {
    const pending = drafts();
    const original = csv("golden", salesName).trimEnd().split(/\r?\n/);
    const text = original.map((line, index) => index === 0 ? `${line},"ignored\nheader"` : `${line},unused`).join("\n");
    pending[salesName] = inspectImportFile(salesName, file("multiline-header.csv", text));
    pending[salesName].ignoredColumnsConfirmed = true;
    const result = prepareImport(manifest(), pending, confirmed);
    expect(result.validation.classification).toBe("valid");
    expect(result.validation.dataset!.sales.map(row => row.source.line)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
  });
  it("preserves multiline required text values and error lines instead of flattening records", () => {
    const pending = drafts();
    const text = csv("golden", salesName).replaceAll("HOME", '"HO\nME"').replace("400.00,TWD", "NaN,TWD");
    pending[salesName] = inspectImportFile(salesName, file("multiline.csv", text));
    const result = prepareImport(manifest(), pending, confirmed);
    expect(result.validation.classification).toBe("blocking");
    expect(result.validation.issues).toContainEqual(expect.objectContaining({ reason_code: "INVALID_AMOUNT", field: "cogs_net", line: 2 }));
  });
});

describe("optional manifest JSON prefill", () => {
  it("reads a valid synthetic manifest for form prefill but never grants amount-basis confirmation", () => {
    const source = { ...manifest(), amountBasisConfirmed: true };
    const result = inspectManifestFile(file("設定.JSON", JSON.stringify(source)));
    expect(result.manifest).toEqual(source);
    expect(result.issues.filter(issue => issue.severity === "blocking")).toEqual([]);
    expect(result.amountBasisConfirmed).toBe(false);
    expect(result.name).toBe("設定.JSON");
  });
  it.each(["null", "[]", '"value"', "{bad-json", '{"currency":"USD"}'])
    ("rejects malformed or incomplete manifest structure %s", text => {
      const result = inspectManifestFile(file("manifest.json", text));
      expect(result.manifest).toBeNull();
      expect(result.issues.some(issue => issue.severity === "blocking")).toBe(true);
    });
  it("checks JSON extension, size and UTF-8 before reading structure", () => {
    expect(inspectManifestFile(file("manifest.txt", JSON.stringify(manifest()))).issues).toContainEqual(expect.objectContaining({ reason_code: "INVALID_FILE_EXTENSION" }));
    expect(inspectManifestFile({ name: "manifest.json", size: 5 * 1024 * 1024 + 1, bytes: new Uint8Array() }).issues).toContainEqual(expect.objectContaining({ reason_code: "FILE_TOO_LARGE" }));
    expect(inspectManifestFile({ name: "manifest.json", size: 2, bytes: new Uint8Array([0xc3, 0x28]) }).issues).toContainEqual(expect.objectContaining({ reason_code: "INVALID_UTF8" }));
  });
});
