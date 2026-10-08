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
    // 不載入外部資源。
    expect(html, `${entry.file} 載入外部資源`).not.toMatch(/(?:src|href)="https?:/i);
    // 圖內沒有可聚焦元素：每個 aria-hidden 的圖容器（依 <div> 配對找出結尾）內沒有 tabindex、a、button（CL-7 的設計稿版）。
    for (const inner of ariaHiddenFrames(html)) expect(inner, `${entry.file} 的 aria-hidden 圖內有可聚焦元素`).not.toMatch(/tabindex=|<a\b|<button\b/);
  }
  await selfCheck(result.data);
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
