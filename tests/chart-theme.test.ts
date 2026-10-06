import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chartCategoryColors, chartColors, chartFontSize, chartHeights, chartTokenName, readChartColors } from "../src/application/chart-theme";

// V3-4b 圖表色集中在 chart-theme.ts（PRD §9.5）：值一律是 :root 的 var() token，不寫色碼；瀏覽器端用 getComputedStyle 讀實際值。

const KEYS = ["current", "previous", "yoy", "total", "unfavorable", "favorable", "other", "grid", "axis", "band", "connector", "surface"];
const ROOT_TOKENS = (() => {
  const css = readFileSync(resolve("src/app/globals.css"), "utf8");
  const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
  return new Set([...root.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]));
})();

afterEach(() => { vi.unstubAllGlobals(); });

describe("chart-theme：圖表色 token", () => {
  it("鍵齊全、值都是單一 var(--…)，而且每個 token 都定義在 globals.css 的 :root", () => {
    expect(Object.keys(chartColors)).toEqual(KEYS);
    for (const value of [...Object.values(chartColors), ...chartCategoryColors, chartFontSize]) {
      expect(value).toMatch(/^var\(--[\w-]+\)$/);
      expect(ROOT_TOKENS.has(chartTokenName(value)!), value).toBe(true);
    }
    expect(chartCategoryColors).toHaveLength(4);
    expect(JSON.stringify(chartColors)).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("圖高對應 --chart-h-sm／--chart-h-lg（180／320px）", () => {
    const css = readFileSync(resolve("src/app/globals.css"), "utf8");
    expect(chartHeights).toEqual({ sm: 180, lg: 320 });
    expect(css).toContain(`--chart-h-sm: ${chartHeights.sm}px;`);
    expect(css).toContain(`--chart-h-lg: ${chartHeights.lg}px;`);
  });

  it("沒有 document（伺服器端、單元測試）時 readChartColors 回傳 var() 字串本身", () => {
    expect(typeof document).toBe("undefined");
    expect(readChartColors()).toEqual(chartColors);
    expect(readChartColors(null)).toEqual(chartColors);
  });

  it("瀏覽器端用 getComputedStyle 讀 token 並 trim；讀不到的 token 退回 var() 字串", () => {
    const root = { tagName: "HTML" } as unknown as Element;
    const values: Record<string, string> = { "--chart-current": "  #1f5a4f ", "--chart-unfavorable": "#b03a2e" };
    const getComputedStyle = vi.fn(() => ({ getPropertyValue: (name: string) => values[name] ?? "" }));
    vi.stubGlobal("document", { documentElement: root });
    vi.stubGlobal("getComputedStyle", getComputedStyle);
    const colors = readChartColors();
    expect(getComputedStyle).toHaveBeenCalledWith(root);
    expect(colors.current).toBe("#1f5a4f");
    expect(colors.unfavorable).toBe("#b03a2e");
    expect(colors.previous).toBe(chartColors.previous);

    const other = { tagName: "DIV" } as unknown as Element;
    readChartColors(other);
    expect(getComputedStyle).toHaveBeenLastCalledWith(other);
  });

  it("getComputedStyle 丟錯時整組退回 var() 字串", () => {
    vi.stubGlobal("document", { documentElement: {} });
    vi.stubGlobal("getComputedStyle", () => { throw new Error("not attached"); });
    expect(readChartColors()).toEqual(chartColors);
  });
});
