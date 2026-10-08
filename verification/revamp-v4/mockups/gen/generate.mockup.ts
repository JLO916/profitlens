import Decimal from "decimal.js";
import { expect, it } from "vitest";
import { buildAll, writeAll } from "./build";
import { loadSource, SOURCES } from "./source";

// H5 設計稿產生器（V4-0b 第 3 項）。只由 vitest.mockups.config.mts 執行，預設的 `npm test` 不會跑到。
// 沒給 MOCKUP_WRITE=1 時只計算與自我檢查、不寫檔；給了才改寫 ../*.html、../index.html、../mockup-data.json。
//   MOCKUP_WRITE=1 npx vitest run --config verification/revamp-v4/mockups/gen/vitest.mockups.config.mts

it("產生 H5 設計稿並自我檢查", async () => {
  const result = await buildAll();
  expect(result.pages.length).toBeGreaterThan(0);
  for (const { entry, output } of result.pages) {
    const html = output.html;
    // 色只用 token：頁面內不得寫死色碼（tokens.css 的 :root 例外）。
    expect(html, `${entry.file} 有寫死的色碼`).not.toMatch(/(?:fill|stroke|color|background)\s*[=:]\s*"?#[0-9a-f]{3,8}/i);
    // 不用箭頭字元、全形驚嘆號、「注意：」（v3 語言規範）。
    expect(html, `${entry.file} 有箭頭字元`).not.toMatch(/[←→↑↓⇐⇒⇑⇓➔➜⟵⟶⌄]/u);
    expect(html, `${entry.file} 有驚嘆號`).not.toMatch(/！/u);
    expect(html, `${entry.file} 有「注意：」`).not.toMatch(/注意：/u);
    // 商品頁只寫「商品毛利為負」，不寫「賠錢」「虧損」（AGENTS.md：商品畫面只呈現商品毛利；copy-scan 對 products.chartsV4.* 擋這兩個詞）。
    if (entry.file.startsWith("products")) expect(html, `${entry.file} 有「賠錢」或「虧損」`).not.toMatch(/賠錢|虧損/u);
    // 不載入外部資源。
    expect(html, `${entry.file} 載入外部資源`).not.toMatch(/(?:src|href)="https?:/i);
    // 圖內沒有可聚焦元素：每個 aria-hidden 的圖容器（依 <div> 配對找出結尾）內沒有 tabindex、a、button（CL-7 的設計稿版）。
    for (const inner of ariaHiddenFrames(html)) expect(inner, `${entry.file} 的 aria-hidden 圖內有可聚焦元素`).not.toMatch(/tabindex=|<a\b|<button\b/);
  }
  await selfCheck(result.data);
  selfCheckC2(result.data);
  if (process.env.MOCKUP_WRITE === "1") {
    const written = writeAll(result);
    expect(written.length).toBeGreaterThan(0);
  }
});

/** 找出每個 aria-hidden 的 .chart-frame 容器內容（以 <div> 開關配對）。 */
function ariaHiddenFrames(html: string): string[] {
  const frames: string[] = [];
  for (const match of html.matchAll(/<div class="chart-frame[^"]*" aria-hidden="true"[^>]*>/g)) {
    const start = match.index + match[0].length;
    let depth = 1, cursor = start;
    const tag = /<\/?div\b[^>]*>/g;
    tag.lastIndex = start;
    for (let next = tag.exec(html); next && depth > 0; next = tag.exec(html)) {
      depth += next[0].startsWith("</") ? -1 : 1;
      cursor = next.index;
    }
    frames.push(html.slice(start, cursor));
  }
  return frames;
}

/**
 * 設計稿試算的自我核對（不是正式 golden；正式 golden 由各批 B 級函式的單元測試承擔）：
 * 逐週件數加總＝期間件數；各通路逐週扣廣告後貢獻加總＝通路期間合計；G10 每列商品成本＋通路費用合計＋廣告費＋扣廣告後貢獻＝淨營收；
 * G1、G2 共同尺度涵蓋所有範圍的柱；G11 每通路逐日加總＝通路期間合計。
 */
async function selfCheck(data: Record<string, unknown>): Promise<void> {
  const demo = await loadSource(SOURCES.demo);
  const { report } = demo.snapshot;
  const overview = data["overview.html"] as { assistWeeks: { values: { units_sold: (string | null)[] } }; waterfallScale: { common: { lo: number; hi: number } }; bridge: { bars: { start: string | null; end: string | null }[] }; profit: { bars: { start: string | null; end: string | null }[] }[] };
  const diagnosis = data["diagnosis.html"] as { g7b: Record<string, { value: string | null }[]>; g10: { rows: { key: string; feesAmount: string | null }[] } };
  const sum = (values: readonly (string | null)[]) => values.reduce((total, value) => total.plus(value ?? "0"), new Decimal(0));
  expect(sum(overview.assistWeeks.values.units_sold).toFixed(0), "逐週件數加總＝期間件數").toBe(report.current.units_sold.value?.toString());
  for (const [channel, points] of Object.entries(diagnosis.g7b)) {
    expect(sum(points.map(point => point.value)).toFixed(2), `${channel} 逐週加總＝期間合計`).toBe(new Decimal(report.current.channels[channel].metrics.contribution_after_marketing.value!).toFixed(2));
  }
  for (const row of diagnosis.g10.rows) {
    const metrics = row.key === "total" ? report.current.metrics : report.current.channels[row.key].metrics;
    const parts = sum([metrics.cogs_net.value, row.feesAmount, metrics.ad_spend.value, metrics.contribution_after_marketing.value]);
    expect(parts.toFixed(2), `${row.key} 七段加總＝淨營收`).toBe(new Decimal(metrics.net_revenue.value!).toFixed(2));
  }
  const levels = [...overview.bridge.bars, ...overview.profit.flatMap(scope => scope.bars)].flatMap(bar => [bar.start, bar.end]).filter((value): value is string => value !== null).map(Number);
  expect(Math.min(...levels), "共同尺度下界涵蓋所有柱").toBeGreaterThanOrEqual(overview.waterfallScale.common.lo);
  expect(Math.max(...levels), "共同尺度上界涵蓋所有柱").toBeLessThanOrEqual(overview.waterfallScale.common.hi);
  for (const channel of report.scope.channels) {
    const daily = report.current.daily.filter(day => day.channel === channel).map(day => day.metrics.contribution_after_marketing.value);
    expect(sum(daily).toFixed(2), `${channel} 逐日加總＝期間合計`).toBe(new Decimal(report.current.channels[channel].metrics.contribution_after_marketing.value!).toFixed(2));
  }
}

/**
 * 代理 C2（商品毛利、資料來源）的設計稿試算核對：數字對照 tests/fixtures/synthetic-4-channel/README.md 第 3、5 節的手算值（代理 B 手算，
 * 與 tests/synthetic-4-channel.test.ts 的常數相同），以及 PRD §4.2 的示範資料例句；幾何對照 CHART_CATALOG 的列數上限（列數 × 16 ≤ sm 180）。
 */
function selfCheckC2(data: Record<string, unknown>): void {
  type G13 = { decrease: { channel: string; sku: string; change: string; shown: boolean }[]; increase: { channel: string; sku: string; change: string; shown: boolean }[]; zeroRows: number; geometry: Record<string, Record<string, { height: number; rows: number }>> };
  type G14 = { count: number; total: string | null; rows: { channel: string; sku: string; value: string; cumulative: string; share: string | null }[]; geometry?: Record<string, { height: number }> };
  const demo = data["products.html"] as { g13: G13; g14: G14 };
  const synthetic = data["products-synthetic.html"] as { g13: G13; g14: G14 };
  // 示範資料：沒有商品毛利為負（不渲染 G14）；G13 減少 15 列，最多的是 SKU-020 · MARKETPLACE −30,198.96（PRD §4.2 G13）。
  expect(demo.g14.count, "示範資料沒有商品毛利為負").toBe(0);
  expect(demo.g13.decrease.length, "示範資料減少 15 列").toBe(15);
  expect(demo.g13.decrease[0], "示範資料減少最多").toMatchObject({ channel: "MARKETPLACE", sku: "SKU-020", change: "-30198.96" });
  // 合成資料 G14（README §5.1）：5 個、負值合計 −8,940.00，逐筆累計；末筆累計＝負值合計、末筆累計佔比＝100%。
  expect(synthetic.g14.rows.map(row => [row.sku, row.channel, row.value, row.cumulative]), "G14 逐筆手算").toEqual([
    ["SKU-201", "MARKETPLACE", "-3400.00", "-3400.00"], ["SKU-301", "SOCIAL", "-2040.00", "-5440.00"], ["SKU-203", "MARKETPLACE", "-1800.00", "-7240.00"], ["SKU-202", "MARKETPLACE", "-850.00", "-8090.00"], ["SKU-302", "SOCIAL", "-850.00", "-8940.00"],
  ]);
  expect(synthetic.g14.total, "G14 負值合計").toBe("-8940.00");
  expect(synthetic.g14.rows.at(-1)?.cumulative, "末筆累計＝負值合計").toBe(synthetic.g14.total);
  expect(synthetic.g14.rows.at(-1)?.share, "末筆累計佔比 100%（不是 null）").toBe("1.000000000000");
  expect(synthetic.g14.rows.map(row => new Decimal(row.share!).times(100).toDecimalPlaces(1, Decimal.ROUND_HALF_UP).toFixed(1)), "累計佔比約 38.0／60.9／81.0／90.5／100").toEqual(["38.0", "60.9", "81.0", "90.5", "100.0"]);
  // 合成資料 G13（README §5.2）：減少 6 列（圖畫前 5）、增加 4 列、差額 0 的 2 列不列入。
  expect(synthetic.g13.decrease.map(row => `${row.sku}·${row.channel} ${row.change}`), "G13 減少欄").toEqual(["SKU-203·MARKETPLACE -8600.00", "SKU-101·MARKETPLACE -8500.00", "SKU-201·MARKETPLACE -3400.00", "SKU-301·SOCIAL -3060.00", "SKU-202·MARKETPLACE -1700.00", "SKU-302·SOCIAL -1360.00"]);
  expect(synthetic.g13.decrease.filter(row => row.shown).length, "減少欄畫前 5").toBe(5);
  expect(synthetic.g13.increase.map(row => `${row.sku}·${row.channel} ${row.change}`), "G13 增加欄").toEqual(["SKU-101·DTC 9350.00", "SKU-401·LIVE 6800.00", "SKU-103·DTC 3060.00", "SKU-103·SOCIAL 2550.00"]);
  expect(synthetic.g13.zeroRows, "差額 0 的列").toBe(2);
  // 幾何：依列計高的 svg（列數 × 16）放得進 sm 180。
  for (const g13 of [demo.g13, synthetic.g13]) for (const layout of Object.values(g13.geometry)) for (const geometry of Object.values(layout)) expect(geometry.height, "G13 列數 × 16 ≤ 180").toBeLessThanOrEqual(180);
  for (const geometry of Object.values(synthetic.g14.geometry ?? {})) expect(geometry.height, "G14 列數 × 16 ≤ 180").toBeLessThanOrEqual(180);

  type Segment = { file: string; channel: string; reason: string; start: string; end: string; days: number };
  const page = data["data.html"] as { g20: { segments: Segment[]; salesNoRows: { start: string; end: string }[]; geometry: Record<string, Record<string, { height: number }>> }; g21: { cells: Record<string, Record<string, number>>; rowLevel: number; rangeLevel: number; maxReason: Record<string, string | null> }; g22: { totals: Record<string, { raw: string; converted: string }>; rate: string } };
  // G20（README §3）：缺列區段依檔 × 通路合併；每段天數加總＝該檔 × 通路的缺列問題筆數；銷售只有 8/20 無列。
  expect(page.g20.segments.map(segment => `${segment.file} ${segment.channel} ${segment.start}..${segment.end} ${segment.days}`), "G20 缺列區段").toEqual([
    "channel_costs_daily.csv LIVE 2026-09-14..2026-09-19 6", "ad_spend_daily.csv LIVE 2026-08-30..2026-09-02 4", "ad_spend_daily.csv LIVE 2026-09-22..2026-09-22 1",
  ]);
  const days = (file: string) => page.g20.segments.filter(segment => segment.file === file).reduce((sum, segment) => sum + segment.days, 0);
  expect(days("channel_costs_daily.csv"), "缺費用列天數＝問題筆數").toBe(page.g21.cells["channel_costs_daily.csv"].MISSING_CHANNEL_COST_DAY);
  expect(days("ad_spend_daily.csv"), "缺廣告列天數＝問題筆數").toBe(page.g21.cells["ad_spend_daily.csv"].MISSING_AD_DAY);
  expect(page.g20.salesNoRows, "銷售無列").toEqual([{ start: "2026-08-20", end: "2026-08-20" }]);
  for (const state of Object.values(page.g20.geometry)) for (const geometry of Object.values(state)) expect(geometry.height, "G20（1＋4 軌＋日期軸）× 24 ≤ 180").toBeLessThanOrEqual(180);
  // G21（README §3）：格加總＝列級問題筆數 11；兩格都是各自檔案最多的原因；沒有範圍級問題。
  const cellSum = Object.values(page.g21.cells).flatMap(row => Object.values(row)).reduce((sum, n) => sum + n, 0);
  expect(cellSum, "格加總＝列級問題筆數").toBe(page.g21.rowLevel);
  expect(page.g21.rowLevel, "列級問題 11 筆").toBe(11);
  expect(page.g21.rangeLevel, "沒有範圍級問題").toBe(0);
  expect(page.g21.maxReason, "各檔最多的原因").toEqual({ "sales_daily.csv": null, "channel_costs_daily.csv": "MISSING_CHANNEL_COST_DAY", "ad_spend_daily.csv": "MISSING_AD_DAY" });
  // G22 示意：把未稅的合成資料當含稅 5% 匯入，含稅原值合計就是 CSV 原值（README §2.1：折扣前收入 17 ×（19,000＋19,600）＝656,200）；換算值都小於原值。
  expect(page.g22.totals.gross_sales.raw, "原價收入原值合計").toBe("656200.00");
  for (const [field, total] of Object.entries(page.g22.totals)) expect(new Decimal(total.converted).lte(total.raw), `${field} 換算值 ≤ 原值`).toBe(true);
}
