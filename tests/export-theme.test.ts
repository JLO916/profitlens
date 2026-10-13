import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { argb, EXPORT_THEME, EXPORT_THEME_TOKENS } from "@/application/export-theme";
import { buildManagerSummary } from "@/application/manager-summary";
import { MINUS } from "@/application/presentation";
import { createSnapshot, hashInput } from "@/application/workspace";
import { validateDataset } from "@/domain/validation";
import { PRINT_BAR_STYLES, PRINT_LEGEND_ORDER, printBarStyle } from "@/components/charts/print-chart";
import { PrintSummary } from "@/components/print-summary";
import { fixture } from "./helpers/fixtures";

// V3-7 PRD §9.6：PDF、PPT、Excel 用到的色碼集中在 src/application/export-theme.ts，值與 globals.css :root 的語意 token 一一對應；
// 匯出程式碼的其他地方不得出現 hex。這裡解析 :root（把 --xxx: var(--yyy) 解到底）逐一比對。

const GLOBALS = readFileSync(resolve("src/app/globals.css"), "utf8");
/** 第一個 :root { … } 區塊的自訂屬性（不含 @media 內的覆寫）。 */
function rootTokens(css: string): Map<string, string> {
  const start = css.indexOf(":root {");
  expect(start).toBeGreaterThanOrEqual(0);
  const end = css.indexOf("\n}", start);
  const body = css.slice(start + ":root {".length, end).replace(/\/\*[\s\S]*?\*\//g, "");
  return new Map([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]));
}
/** var(--a) → var(--b) → #hex：解到底（循環或找不到就丟錯）。 */
function resolveToken(tokens: Map<string, string>, name: string, seen: string[] = []): string {
  if (seen.includes(name)) throw new Error(`token 循環：${[...seen, name].join(" → ")}`);
  const value = tokens.get(name);
  if (value === undefined) throw new Error(`:root 沒有 ${name}`);
  const reference = /^var\((--[\w-]+)\)$/.exec(value);
  return reference ? resolveToken(tokens, reference[1], [...seen, name]) : value;
}
const hex = (value: string) => value.replace(/^#/, "").toUpperCase();

describe("V3-7 export-theme：匯出色碼與 globals.css :root 一一對應", () => {
  const tokens = rootTokens(GLOBALS);

  it("每個顏色都對到一個 :root token，解到底的 hex 相同", () => {
    expect(Object.keys(EXPORT_THEME_TOKENS).sort()).toEqual(Object.keys(EXPORT_THEME).sort());
    for (const [key, token] of Object.entries(EXPORT_THEME_TOKENS)) {
      const resolved = resolveToken(tokens, token);
      expect(resolved, `${key} ← ${token}`).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(EXPORT_THEME[key as keyof typeof EXPORT_THEME], `${key} ← ${token}（${resolved}）`).toBe(hex(resolved));
    }
  });

  it("§9.6 指定值：品牌 #1f5a4f、不利 #b03a2e、Excel 表頭底 #f1f3f3；有利不上色（D-V3-7：同主文字色）", () => {
    expect(EXPORT_THEME.brand).toBe("1F5A4F");
    expect(resolveToken(tokens, "--accent")).toBe("#1f5a4f");
    expect(EXPORT_THEME.unfavorable).toBe("B03A2E");
    expect(EXPORT_THEME.headerFill).toBe("F1F3F3");
    expect(EXPORT_THEME.favorable).toBe(EXPORT_THEME.ink);
    expect(tokens.get("--favorable")).toBe("var(--text-primary)");
    for (const value of Object.values(EXPORT_THEME)) expect(value).toMatch(/^[0-9A-F]{6}$/);
    expect(argb(EXPORT_THEME.headerFill)).toBe("FFF1F3F3");
  });

  it("V4-9a 圖表色：chartCurrent…chartSeg3 對到 --chart-*（解到底與畫面同色；本期＝品牌色、不利＝unfavorable、有利是灰不是綠）", () => {
    expect(EXPORT_THEME_TOKENS).toMatchObject({
      chartCurrent: "--chart-current", chartPrevious: "--chart-previous", chartTotal: "--chart-total", chartUnfavorable: "--chart-unfavorable", chartFavorable: "--chart-favorable",
      chartSeg1: "--chart-seg-1", chartSeg2: "--chart-seg-2", chartSeg3: "--chart-seg-3",
    });
    for (const key of ["chartCurrent", "chartPrevious", "chartTotal", "chartUnfavorable", "chartFavorable", "chartSeg1", "chartSeg2", "chartSeg3"] as const) {
      expect(EXPORT_THEME[key], key).toBe(hex(resolveToken(tokens, EXPORT_THEME_TOKENS[key])));
    }
    expect(EXPORT_THEME.chartCurrent).toBe(EXPORT_THEME.brand);
    expect(EXPORT_THEME.chartUnfavorable).toBe(EXPORT_THEME.unfavorable);
    expect(EXPORT_THEME.chartFavorable).toBe(hex(resolveToken(tokens, "--gray-400")));
  });

  it("V4-9a C31 PDF 灰階：起訖與小計（paper 底＋ink 外框）、有利（chartFavorable）、不利（ink）三種填色兩兩不同；chartTotal 與 chartSeg1 同色，不拿來區分小計與不利", () => {
    expect(new Set([EXPORT_THEME.paper, EXPORT_THEME.chartFavorable, EXPORT_THEME.ink]).size).toBe(3);
    expect(EXPORT_THEME.chartTotal).toBe(EXPORT_THEME.chartSeg1);
  });

  // ── V4-9a 代理 A：C31 PrintChart 實際用的填色（src/components/charts/print-chart.tsx 的 PRINT_BAR_STYLES 與渲染結果）──
  /** 灰階亮度（ITU-R BT.601，0–255）：黑白列印時看到的深淺。 */
  const gray = (value: string) => { const [r, g, b] = [0, 2, 4].map(at => Number.parseInt(value.slice(at, at + 2), 16)); return 0.299 * r + 0.587 * g + 0.114 * b; };

  it("V4-9a C31 PRINT_BAR_STYLES：起訖與小計＝paper 底＋ink 外框、有利＝chartFavorable、不利＝ink；三種填色灰階兩兩相差 ≥ 32／255；資料待補不填色", () => {
    expect(PRINT_BAR_STYLES).toEqual({ level: { fill: "paper", stroke: "ink" }, favorable: { fill: "chartFavorable", stroke: null }, unfavorable: { fill: "ink", stroke: null } });
    expect(PRINT_LEGEND_ORDER).toEqual(["level", "favorable", "unfavorable"]);
    const levels = PRINT_LEGEND_ORDER.map(style => gray(EXPORT_THEME[PRINT_BAR_STYLES[style].fill]));
    for (const [index, a] of levels.entries()) for (const b of levels.slice(index + 1)) expect(Math.abs(a - b), `${a} vs ${b}`).toBeGreaterThanOrEqual(32);
    // 柱的語意色 → 列印樣式：結果柱（畫面是品牌色）在列印與起訖同一種；資料待補是虛線框（null）。
    expect((["total", "result", "favorable", "unfavorable", "missing"] as const).map(printBarStyle)).toEqual(["level", "level", "favorable", "unfavorable", null]);
  });

  it("V4-9a C31 實際渲染（demo 標準版 PDF）：每根柱與圖例記號的 fill／stroke 正好是它那種樣式的 EXPORT_THEME 色；三種樣式都出現且填色兩兩不同；不利柱的標值以「−」開頭", async () => {
    const input = fixture("demo");
    const snapshot = await createSnapshot(validateDataset(input).dataset!, {}, await hashInput(input));
    const html = renderToStaticMarkup(createElement(PrintSummary, { summary: buildManagerSummary(snapshot), snapshot, variant: "standard", generatedAt: new Date("2026-10-05T06:32:00Z") }));
    const svgs = [...html.matchAll(/<svg [^>]*data-print-chart="([a-z]+)"[\s\S]*?<\/svg><\/svg>/g)];
    expect(svgs.map(match => match[1])).toEqual(["bridge", "profit"]);
    const attrs = (tag: string) => Object.fromEntries([...tag.matchAll(/\s([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
    const expected = (style: keyof typeof PRINT_BAR_STYLES) => { const { fill, stroke } = PRINT_BAR_STYLES[style]; return { fill: `#${EXPORT_THEME[fill]}`, stroke: stroke === null ? undefined : `#${EXPORT_THEME[stroke]}` }; };
    const seen = new Map<string, string>();
    for (const [svg] of svgs) {
      const values = new Map([...svg.matchAll(/<text data-bar="([^"]+)"[^>]*>([^<]*)<\/text>/g)].map(match => [match[1], match[2]]));
      const bars = [...svg.matchAll(/<rect data-bar="[^"]+"[^>]*>/g)].map(match => attrs(match[0]));
      expect(bars.length).toBeGreaterThan(0);
      for (const bar of bars) {
        const style = bar["data-fill"] as keyof typeof PRINT_BAR_STYLES;
        expect({ fill: bar.fill, stroke: bar.stroke }, `${bar["data-bar"]}`).toEqual(expected(style));
        seen.set(style, bar.fill);
        if (style === "unfavorable") expect(values.get(bar["data-bar"])!.startsWith(MINUS), bar["data-bar"]).toBe(true);
      }
      for (const match of svg.matchAll(/<g data-legend="([a-z]+)">(<rect [^>]*>)/g)) {
        const mark = attrs(match[2]);
        expect({ fill: mark.fill, stroke: mark.stroke }, `圖例 ${match[1]}`).toEqual(expected(match[1] as keyof typeof PRINT_BAR_STYLES));
      }
    }
    // 示範資料的 G1 有起訖、有利（原價收入增加）與不利（各項費用）三種；渲染出的三種填色兩兩不同。
    expect([...seen.keys()].sort()).toEqual(["favorable", "level", "unfavorable"]);
    expect(new Set(seen.values()).size).toBe(3);
  });

  it("列印字級 token：--print-title 14pt、--print-body 10pt、--print-note 8pt，放在 :root", () => {
    expect([tokens.get("--print-title"), tokens.get("--print-body"), tokens.get("--print-note")]).toEqual(["14pt", "10pt", "8pt"]);
  });

  it("匯出程式碼與列印版面不寫死色碼：PPT、Excel、列印版元件與其 CSS 都沒有 hex（只在 export-theme.ts 與 :root）", () => {
    const HEX = /#?\b[0-9a-fA-F]{6}\b/g;
    const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const file of ["src/application/pptx-export.ts", "src/application/excel-export.ts", "src/application/export-header.ts", "src/components/print-summary.tsx", "src/components/manager-summary.module.css", "src/components/charts/print-chart.tsx"]) {
      const found = (strip(readFileSync(resolve(file), "utf8")).match(HEX) ?? []).filter(value => /[a-fA-F]/.test(value) || value.startsWith("#"));
      expect(found, file).toEqual([]);
    }
  });
});
