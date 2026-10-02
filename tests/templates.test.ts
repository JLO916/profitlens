import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateDataset } from "@/domain/validation";
import { parseCsv } from "@/lib/csv";
import type { DatasetInput, FileName } from "@/domain/types";

const files: FileName[] = ["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"];
const templatesDir = join(process.cwd(), "templates");
const examplesDir = join(templatesDir, "examples");
const BOM = "﻿";

const read = (dir: string, name: string) => readFileSync(join(dir, name), "utf8");
const firstLine = (text: string) => text.replace(/^﻿/, "").split(/\r?\n/)[0];

function exampleInput(): DatasetInput {
  return {
    manifest: JSON.parse(read(examplesDir, "manifest.json")),
    files: Object.fromEntries(files.map((file) => [file, read(examplesDir, file)])),
  };
}

describe("example templates (R3-8)", () => {
  it("validate as a fully valid dataset with no blocking or partial issues", () => {
    const result = validateDataset(exampleInput());
    expect(result.issues.filter((issue) => issue.severity !== "warning")).toEqual([]);
    expect(result.classification).toBe("valid");
    expect(result.dataset).not.toBeNull();
    expect(result.unknownColumns).toEqual({});
  });

  it.each(files)("%s has exactly three data rows", (file) => {
    expect(parseCsv(read(examplesDir, file)).rows).toHaveLength(3);
  });

  it.each(files)("%s keeps the blank template header order (ignoring BOM)", (file) => {
    const example = read(examplesDir, file);
    const blank = read(templatesDir, file);
    expect(firstLine(example)).toBe(firstLine(blank));
    expect(parseCsv(example).headers).toEqual(parseCsv(blank).headers);
  });

  it.each(files)("%s is UTF-8 with BOM and TWD-only, two-decimal amounts", (file) => {
    const text = read(examplesDir, file);
    expect(text.startsWith(BOM)).toBe(true);
    const csv = parseCsv(text);
    const currency = csv.headers.indexOf("currency");
    const amountColumns = csv.headers.filter((name) => !["date", "channel", "sku", "category", "units_sold", "currency"].includes(name));
    for (const row of csv.rows) {
      expect(row.values[currency]).toBe("TWD");
      for (const name of amountColumns) expect(row.values[csv.headers.indexOf(name)]).toMatch(/^\d+\.\d{2}$/);
    }
  });

  it("cost and ad files cover every coverage date x manifest channel exactly once", () => {
    const input = exampleInput();
    const manifest = input.manifest as { channels: string[]; coverage_start: string; coverage_end: string };
    const expected: string[] = [];
    for (let day = new Date(`${manifest.coverage_start}T00:00:00Z`); day <= new Date(`${manifest.coverage_end}T00:00:00Z`); day.setUTCDate(day.getUTCDate() + 1)) {
      for (const channel of manifest.channels) expected.push(`${day.toISOString().slice(0, 10)}|${channel}`);
    }
    for (const file of ["channel_costs_daily.csv", "ad_spend_daily.csv"] as const) {
      const csv = parseCsv(input.files[file]!);
      const keys = csv.rows.map((row) => `${row.values[csv.headers.indexOf("date")]}|${row.values[csv.headers.indexOf("channel")]}`);
      expect(keys.sort()).toEqual([...expected].sort());
    }
  });

  it("does not alter the blank templates (header only, no data rows)", () => {
    for (const file of files) expect(parseCsv(read(templatesDir, file)).rows).toHaveLength(0);
  });
});

describe("example templates are served from public/ for the wizard download links (R3-8)", () => {
  it("keeps public/templates/examples byte-identical to templates/examples", () => {
    const publicDir = join(process.cwd(), "public", "templates", "examples");
    for (const name of [...files, "manifest.json"]) expect(readFileSync(join(publicDir, name)), name).toEqual(readFileSync(join(examplesDir, name)));
  });
});

describe("the order-aggregation guide is served from public/docs for the wizard link (R3-9)", () => {
  it("keeps public/docs/ORDER_AGGREGATION.md byte-identical to docs/ORDER_AGGREGATION.md", () => {
    expect(readFileSync(join(process.cwd(), "public", "docs", "ORDER_AGGREGATION.md"))).toEqual(readFileSync(join(process.cwd(), "docs", "ORDER_AGGREGATION.md")));
  });
});
