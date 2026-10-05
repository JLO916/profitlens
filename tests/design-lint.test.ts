import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { scanCssText, scanTsxText, scanUi, type UiScanMetrics } from "../scripts/lib/ui-scan.mjs";

// V3-0 護欄（PRD §5.2、§5.4）：CSS 與 JSX 的設計違規採棘輪制。量測與 scripts/ui-audit.mjs 共用 scripts/lib/ui-scan.mjs。
// 上限在 tests/fixtures/design-lint-ceiling.json；量到的數字變低時，請在同一批把上限調到新數字（只能往下）。

const CEILING_FILE = resolve("tests/fixtures/design-lint-ceiling.json");
const readCeilings = () => (JSON.parse(readFileSync(CEILING_FILE, "utf8")) as { ceilings: Record<string, unknown> }).ceilings;

/** V3-0 實測的 v2 基準（2026-10-05）。上限檔永遠不得高於這裡；這份常數只在 V3-0 寫一次，之後不改。 */
const V3_0_BASELINE: UiScanMetrics = {
  hexOutsideRoot: 201, borderRadiusValues: 18, fontSizeValues: 32, letterSpacingNonZero: 13, decorativeRotate: 1, jsxArrowTextNodes: 6, jsxAllCapsEyebrow: 3, jsxDecorativeChars: 1,
  cssDecorativeContent: 2, buttonRowCentered: 1, nestedCardSelectors: 0, linearGradient: 0, boxShadow: 7, jsxCjkTextNodes: 15, cjkStringLiterals: 7,
};

describe("design-lint 棘輪（CSS 與 JSX）", () => {
  const { metrics } = scanUi();

  it.each(Object.keys(V3_0_BASELINE) as (keyof UiScanMetrics)[])("%s 不超過上限", key => {
    const ceiling = readCeilings()[key];
    expect(metrics[key], `${key} 實測 ${metrics[key]}，上限 ${String(ceiling)}；請改回或修正違規，不可調高上限`).toBeLessThanOrEqual(ceiling as number);
  });

  it("上限檔只含數字、涵蓋每個指標，且每個上限 ≥ 目前實測、≤ V3-0 基準（棘輪只能往下）", () => {
    const ceilings = readCeilings();
    expect(Object.keys(ceilings).sort()).toEqual(Object.keys(metrics).sort());
    for (const [key, value] of Object.entries(ceilings)) {
      expect(Number.isInteger(value) && (value as number) >= 0, `${key} 必須是非負整數`).toBe(true);
      expect(value as number, `${key} 上限低於實測`).toBeGreaterThanOrEqual(metrics[key as keyof UiScanMetrics]);
      expect(value as number, `${key} 上限不得高於 V3-0 基準`).toBeLessThanOrEqual(V3_0_BASELINE[key as keyof UiScanMetrics]);
    }
  });
});

describe("ui-scan 口徑（合成輸入）", () => {
  it("把 :root token 定義區與其餘規則分開計 hex，且不分大小寫", () => {
    const result = scanCssText(":root { --ink: #ABCDEF; background: var(--paper); }\n.a { color: #abcdef; border: 1px solid #FFF; }", "x.css");
    expect(result.tokenHex).toEqual(["#abcdef"]);
    expect((result.hex as { hex: string }[]).map(entry => entry.hex)).toEqual(["#abcdef", "#fff"]);
  });

  it("rotate( 只豁免 @keyframes spin 與 disclosure 指示", () => {
    const css = "@keyframes spin { to { transform: rotate(360deg); } }\n@keyframes wobble { to { transform: rotate(3deg); } }\n.diagnosis-summary::before { transform: rotate(-45deg); }\n.diagnosis-row[open] > .diagnosis-summary::before { transform: rotate(45deg); }\n.empty-illustration { transform: rotate(-4deg); }";
    expect(scanCssText(css, "x.css").rotate).toHaveLength(2);
  });

  it("計入 .button-row 置中、巢狀卡片、非 0 字距、--shadow-overlay 以外的陰影與 linear-gradient", () => {
    const css = ".button-row { justify-content: center; }\n.board-card .button-row { justify-content: flex-start; }\n.panel .panel, .panel .kpi-card, .panel .board-card { margin: 0; }\nh1 { letter-spacing: -.6px; }\nh2 { letter-spacing: 0; }\n.a { box-shadow: var(--shadow-overlay); }\n.b { box-shadow: 0 1px 2px #000; }\n.c { box-shadow: none; background: linear-gradient(#fff, #000); }";
    const result = scanCssText(css, "x.css");
    expect(result.buttonRowCentered).toHaveLength(1);
    expect(result.nestedCard).toHaveLength(2);
    expect(result.letterSpacing).toHaveLength(1);
    expect(result.boxShadow).toHaveLength(1);
    expect(result.linearGradient).toHaveLength(1);
  });

  it("JSX 文字節點的箭頭、全大寫 eyebrow、中文與靜態 testid（註解不計）", () => {
    const tsx = `// 註解裡的 → 與中文不計\nexport const A = () => <div data-testid="a"><p className="eyebrow">TREND</p><span>→</span>{"中文"}<b data-testid={"b"} /><i data-testid={\`c-\${1}\`} /><u style={{ fontSize: 12, letterSpacing: 1 }} /></div>;`;
    const result = scanTsxText(tsx, "x.tsx");
    expect(result.jsxAllCaps).toHaveLength(1);
    expect(result.jsxArrow).toHaveLength(1);
    expect(result.jsxCjk).toHaveLength(1);
    expect(result.staticTestIds).toEqual(["a", "b"]);
    expect(result.dynamicTestIds).toHaveLength(1);
    expect(result.fontSize).toEqual([{ value: "12px", where: "x.tsx:2 fontSize: 12px" }]);
    expect(result.letterSpacing).toHaveLength(1);
  });
});
