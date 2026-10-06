import { describe, expect, it } from "vitest";
import baseline from "./fixtures/export-numeric-baseline.json";
import { goldenExportNumerics } from "./helpers/export-numeric";
import { MINUS } from "@/application/presentation";

// V3-2b §3.3、§8.5 規則 2：CSV／JSON 只有 L3（到分、ASCII 負號、不加千分位與單位）。
// tests/fixtures/export-numeric-baseline.json 是 V3-2b 開工前（commit dbcb1b0）的 golden 匯出投影；
// 數值欄必須逐字相同，只有 V3-2a 的標題列與說明文字可以不同（不在投影內）。
describe("V3-2b CSV/JSON exports stay machine-readable L3", () => {
  it("golden numeric columns are byte-identical to the pre-V3-2b exports", async () => {
    const current = await goldenExportNumerics();
    for (const key of Object.keys(baseline) as (keyof typeof baseline)[]) expect(current[key], key).toEqual(baseline[key]);
  });

  it("numbers keep cents and ASCII minus; no U+2212, thousands separators or 萬 in machine exports", async () => {
    const current = JSON.stringify(await goldenExportNumerics());
    expect(current).not.toContain(MINUS);
    expect(current).toContain('"value":"-315.00"');
    expect(current).toContain('"value":"255.00"');
    expect(current).toContain('"value":"284.00"');
    expect(current).toContain('"value":"264.00"');
    expect(current).not.toMatch(/"\d{1,3}(,\d{3})+(\.\d+)?"/);
  });
});
