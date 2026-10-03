import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { importColumns } from "@/application/import";
import { detectPreset, getPreset, isOrderLevel, suggestMapping } from "@/application/source-presets";
import { parseCsv } from "@/lib/csv";
import type { FileName } from "@/domain/types";

/**
 * 去識別化樣本（tests/fixtures/source-samples/）：標題列依平台公開文件重建、資料列為合成值，不含任何真實個資或訂單。
 * index.json 每筆：{ file, presetId, role, expectMapping: { 標準欄位: 來源欄名 }, note }。
 * 真實匯出檔驗證通過後，把對應 preset 的 evidence 改為 "real_export" 並記錄日期；這裡的樣本仍要繼續通過。
 */
interface Sample { file: string; presetId: string; role: FileName; expectMapping: Record<string, string>; note?: string }
const dir = resolve("tests/fixtures/source-samples");
const samples: Sample[] = JSON.parse(readFileSync(resolve(dir, "index.json"), "utf8"));

describe("R3 source presets detect the documented export headers", () => {
  it("lists at least the Shopee / momo / 91APP samples", () => {
    expect(samples.map(sample => sample.presetId)).toEqual(expect.arrayContaining(["shopee_orders", "shopee_income", "momo_settlement", "91app_orders"]));
  });
  for (const sample of samples) {
    it(`${sample.presetId}: ${sample.file} is detected and the key columns are suggested`, () => {
      const parsed = parseCsv(readFileSync(resolve(dir, sample.file)));
      expect(parsed.rows.length, "sample has data rows").toBeGreaterThanOrEqual(8);
      const detected = detectPreset(parsed.headers);
      expect(detected?.preset.id, `detectPreset(${sample.file})`).toBe(sample.presetId);
      const preset = getPreset(sample.presetId)!;
      expect(preset.evidence, "evidence level").not.toBe("none");
      expect(isOrderLevel(preset)).toBe(preset.grain !== "daily_campaign");
      const suggestion = suggestMapping(sample.role, parsed.headers, importColumns[sample.role], preset);
      for (const [field, source] of Object.entries(sample.expectMapping)) expect(suggestion.mapping[field], `${sample.presetId} ${field}`).toBe(source);
      const used = Object.values(suggestion.mapping).filter(Boolean);
      expect(new Set(used).size, "no source column used twice").toBe(used.length);
      // 樣本不得含個資樣式（電話、Email）；地址／姓名欄只允許遮罩值。
      const text = readFileSync(resolve(dir, sample.file), "utf8");
      expect(text).not.toMatch(/09\d{8}|@[a-z0-9-]+\.(com|tw)/i);
    });
  }
  it("never mistakes the three standard files for a platform export", () => {
    for (const role of Object.keys(importColumns) as FileName[]) expect(detectPreset([...importColumns[role]])).toBeNull();
  });
});
