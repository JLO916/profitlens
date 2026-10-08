import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { checkChartMarkup, SSR_RULES } from "../scripts/lib/chart-scan.mjs";
import { scanCssText } from "../scripts/lib/ui-scan.mjs";
import { chartColors } from "../src/application/chart-theme";
import { deltaTone, formatEmpty } from "../src/application/presentation";
import { bridgeWaterfall, type BridgeRow } from "../src/application/waterfall";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "../src/application/workspace";
import { BarCell, barCellFill, barCellGeometry, barCellScale, BAR_CELL_HEIGHT, BAR_CELL_WIDTH } from "../src/components/charts/bar-cell";
import type { EvidenceSelection } from "../src/components/evidence-drawer";
import { BridgeSection, bridgeEvidence, bridgeRowTarget } from "../src/components/overview/charts/bridge-section";
import { toneClass } from "../src/components/top-three";
import { AMOUNT_FIELDS, type AmountField, type MetricName } from "../src/domain/types";
import { validateDataset } from "../src/domain/validation";
import { fixture } from "./helpers/fixtures";
import { byTestId, element } from "./helpers/markup";

// V4-1 代理 C：G6 橋接表內嵌變異條（PRD §4.1–4.7 G6、§7.2、§7.7、§8.7；CHART_CATALOG G6；D-V4-33＝B、D-V4-14）的 SSR 結構測試。
// 九個差額列（缺值列除外）各一個 C24 variance 條：testid chart-overview-bridge-bar-{field}、在 bridge-table 的 tr[data-row={field}] 金額格內、number-link 之前；
// 共同尺度＝九項 |值| 最大值（barCellScale）、方向與色依 deltaTone（只有不利上色，有利是灰的 chartColors.favorable）；條 aria-hidden、不可聚焦。
// 點條與點同列 number-link 開同一個抽屜（bridgeEvidence），點條另記 chart_clicked（只有事件名）：用「在 React render 內呼叫 BridgeSection 取回元素樹」的方式
// 拿到兩個 onClick 直接呼叫，比對 onEvidence 收到的物件 toEqual（SSR 不輸出事件處理器）。期待值一律由 waterfall.ts、bar-cell.tsx、presentation.ts 的函式算出。
// 只在 ≤ 767px 顯示：≥ 768 與列印由 globals.css「V4-1 C」錨點以 display: none 隱藏、元素保持掛載（M1 另見 tests/mounted-testids.test.tsx 的 V4-1 錨點）。

const CM: MetricName = "contribution_after_marketing";
const TESTID = (field: AmountField) => `chart-overview-bridge-bar-${field}`;
const noop = () => undefined;

async function load(name: string): Promise<WorkspaceSnapshot> {
  const input = fixture(name);
  const dataset = validateDataset(input).dataset!;
  return createSnapshot(dataset, {}, await hashInput(input));
}
const snapshots: Record<"golden" | "demo" | "zeroAd" | "refundOnly" | "missingCogs", WorkspaceSnapshot> = {} as never;
beforeAll(async () => {
  Object.assign(snapshots, { golden: await load("golden"), demo: await load("demo"), zeroAd: await load("zero_ad"), refundOnly: await load("refund_only"), missingCogs: await load("errors/missing_cogs") });
});
afterEach(() => { vi.unstubAllGlobals(); });

const renderBridge = (snapshot: WorkspaceSnapshot) => renderToStaticMarkup(createElement(BridgeSection, { snapshot, onEvidence: noop }));
const deltaRows = (snapshot: WorkspaceSnapshot): BridgeRow[] => bridgeWaterfall(snapshot).rows.filter(row => row.kind === "delta");
/** 開始標籤的屬性（只取第一個元素）。 */
const attrs = (html: string) => Object.fromEntries([...html.slice(0, html.indexOf(">")).matchAll(/\s([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
/** 橋接表的某一列（tr[data-row=…]）。 */
const rowOf = (html: string, id: string) => element(byTestId(html, "bridge-table"), `data-row="${id}"`)!;

/** 在 React render 內呼叫 BridgeSection（hooks 隨外層元件執行），取回它回傳的元素樹；SSR 不輸出 onClick，只能從元素樹拿。 */
function bridgeTree(snapshot: WorkspaceSnapshot, onEvidence: (evidence: EvidenceSelection) => void): ReactElement {
  let tree: ReactElement | null = null;
  function Capture() { tree = BridgeSection({ snapshot, onEvidence }) as ReactElement; return null; }
  renderToStaticMarkup(createElement(Capture));
  return tree!;
}
/** 走訪元素樹（children 與 ChartFrame 的 aside），依出現順序回傳所有元素。 */
function elementsOf(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elementsOf);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  const { children, aside } = node.props;
  return [node, ...elementsOf(aside as ReactNode), ...elementsOf(children as ReactNode)];
}
/** 橋接表每一列（tr[data-row]）的 G6 條與 number-link 的 onClick。 */
function rowHandlers(tree: ReactElement) {
  const out = new Map<string, { bar?: () => void; link: () => void }>();
  for (const tr of elementsOf(tree).filter(item => item.type === "tr" && typeof item.props["data-row"] === "string")) {
    const inside = elementsOf(tr.props.children as ReactNode);
    const bar = inside.find(item => item.type === BarCell);
    const link = inside.find(item => item.type === "button")!;
    out.set(tr.props["data-row"] as string, { bar: bar?.props.onClick as (() => void) | undefined, link: link.props.onClick as () => void });
  }
  return out;
}

describe("G6 橋接表內嵌變異條：結構與掛載（PRD §4.7、§7.5；CHART_CATALOG G6）", () => {
  it("golden／demo：九個 chart-overview-bridge-bar-{field} 各一個，都在 bridge-table 的 tr[data-row={field}] 金額格內、number-link 之前；上期、本期、總差額、平衡檢核列沒有條", () => {
    for (const snapshot of [snapshots.golden, snapshots.demo]) {
      const html = renderBridge(snapshot);
      const table = byTestId(html, "bridge-table");
      expect((html.match(/data-testid="chart-overview-bridge-bar-/g) ?? []).length).toBe(AMOUNT_FIELDS.length);
      expect((table.match(/data-chart-kind="cell"/g) ?? []).length).toBe(AMOUNT_FIELDS.length);
      for (const field of AMOUNT_FIELDS) {
        const row = rowOf(html, field);
        const cell = element(row, '<td class="num"')!;
        expect(cell, field).toContain(`data-testid="${TESTID(field)}"`);
        expect(cell.indexOf("<svg"), field).toBeLessThan(cell.indexOf('<button type="button" class="number-link'));
        expect((cell.match(/<button\b/g) ?? []).length, field).toBe(1);
      }
      for (const id of ["previous", "current", "total"]) expect(rowOf(html, id), id).not.toContain("<svg");
      expect(byTestId(html, "bridge-balance-check")).not.toContain("data-chart-kind");
      // 條在旁欄（.frame-aside 內的 .bridge-table-wrap），不在瀑布的 svg 裡。
      expect(element(html, 'class="frame-aside"')).toContain(`data-testid="${TESTID("gross_sales")}"`);
      expect(byTestId(html, "bridge-waterfall")).not.toContain("chart-overview-bridge-bar-");
    }
  });

  it("條本身 aria-hidden、focusable=false、沒有 tabindex、沒有文字與 role；data-chart-kind=\"cell\"、可點（is-clickable）；鍵盤路徑是同列的 number-link（button）", () => {
    const html = renderBridge(snapshots.demo);
    for (const field of AMOUNT_FIELDS) {
      const svg = byTestId(html, TESTID(field));
      const tag = attrs(svg);
      expect(tag["aria-hidden"], field).toBe("true");
      expect(tag.focusable, field).toBe("false");
      expect(tag["data-chart-kind"], field).toBe("cell");
      expect(tag.class, field).toBe("bar-cell is-variance is-clickable");
      expect(svg, field).not.toMatch(/tabindex|role=|<text|<title|<a\b|<button/i);
      expect(svg.replace(/<[^>]*>/g, ""), field).toBe("");
      expect(element(rowOf(html, field), "<button")!, field).toMatch(/^<button type="button" class="number-link/);
    }
  });

  it("chart-lint 的 SSR 規則（CL-1、CL-2、CL-9、CL-11）對 bridge-section 0 違規", () => {
    for (const snapshot of Object.values(snapshots)) {
      const { violations } = checkChartMarkup(`<main id="main-content">${renderBridge(snapshot)}</main>`, { page: "overview" });
      for (const rule of SSR_RULES) expect(violations[rule], rule).toEqual([]);
    }
  });
});

describe("G6 編碼：共同尺度、方向、只有不利上色（PRD §4.4、§7.1、§7.2）", () => {
  it("每條的幾何＝barCellGeometry（共同尺度＝九項 |值| 最大值）；色＝barCellFill(deltaTone)，與同列 number-link 的有利／不利相同；零線同一個 x", () => {
    for (const snapshot of [snapshots.golden, snapshots.demo]) {
      const html = renderBridge(snapshot);
      const rows = deltaRows(snapshot);
      const max = barCellScale(rows.map(row => row.metric.value));
      expect(max).not.toBeNull();
      for (const row of rows) {
        const field = row.field!;
        const svg = byTestId(html, TESTID(field));
        const geometry = barCellGeometry({ mode: "variance", value: row.metric.value, max });
        const tone = deltaTone(CM, row.metric.value, "L3");
        expect(attrs(svg), field).toMatchObject({ viewBox: `0 0 ${BAR_CELL_WIDTH} ${BAR_CELL_HEIGHT}`, "data-tone": tone, preserveAspectRatio: "none" });
        const rect = attrs(element(svg, "<rect")!);
        expect(rect, field).toMatchObject({ class: "bar-cell-bar", x: String(geometry.bar!.x), y: String(geometry.bar!.y), width: String(geometry.bar!.width), height: String(geometry.bar!.height), fill: barCellFill(tone) });
        expect(attrs(element(svg, "<line")!), field).toMatchObject({ x1: String(BAR_CELL_WIDTH / 2), x2: String(BAR_CELL_WIDTH / 2), stroke: chartColors.axis });
        // 只有不利上色（D-V3-7）：不利＝chartColors.unfavorable；有利是灰的 chartColors.favorable。
        expect(rect.fill === chartColors.unfavorable, field).toBe(tone === "unfavorable");
        if (tone === "favorable") expect(rect.fill, field).toBe(chartColors.favorable);
        // 與同列 number-link 同方向：負值往左（不利）、正值往右（有利）。
        expect(element(rowOf(html, field), "<button")!, field).toContain(`class="number-link ${toneClass(tone)}"`);
        expect(geometry.direction, field).toBe(row.metric.value!.startsWith("-") ? "left" : "right");
      }
    }
  });

  it("示範資料：原價收入（+3,161,970.00）是九項 |值| 最大值、滿半寬且是有利灰；不利色條中最寬的是商品成本（−1,575,080.55）", () => {
    const html = renderBridge(snapshots.demo);
    const widths = Object.fromEntries(AMOUNT_FIELDS.map(field => [field, attrs(element(byTestId(html, TESTID(field)), "<rect")!)]));
    expect(Number(barCellScale(deltaRows(snapshots.demo).map(row => row.metric.value)))).toBe(Number(snapshots.demo.report.bridge.components.gross_sales.value));
    expect(Number(widths.gross_sales.width)).toBe(BAR_CELL_WIDTH / 2);
    expect(widths.gross_sales.fill).toBe(chartColors.favorable);
    const unfavorable = AMOUNT_FIELDS.filter(field => widths[field].fill === chartColors.unfavorable);
    expect(unfavorable).toEqual(AMOUNT_FIELDS.filter(field => field !== "gross_sales"));
    const widest = unfavorable.reduce((best, field) => Number(widths[field].width) > Number(widths[best].width) ? field : best);
    expect(widest).toBe("cogs_net");
    // 示範資料的值（fixtures/demo/computed_summary.json；CHART_CATALOG G6 的 E2E 草案以它為準）。
    expect([snapshots.demo.report.bridge.components.gross_sales.value, snapshots.demo.report.bridge.components.cogs_net.value]).toEqual(["3161970.00", "-1575080.55"]);
  });

  it("缺值列不畫條（missing_cogs：商品成本差額待補，九列只有 8 條，尺度取其餘 8 項）；值為 0 的列只畫零線（zero_ad 廣告費）；九項全為 0 時九條都只畫零線（refund_only）", () => {
    const missing = renderBridge(snapshots.missingCogs);
    const rows = deltaRows(snapshots.missingCogs);
    expect(rows.find(row => row.field === "cogs_net")!.metric.value).toBeNull();
    expect((missing.match(/data-testid="chart-overview-bridge-bar-/g) ?? []).length).toBe(AMOUNT_FIELDS.length - 1);
    expect(rowOf(missing, "cogs_net")).not.toContain("<svg");
    expect(element(rowOf(missing, "cogs_net"), "<button")).toContain(`>${formatEmpty("missing")}</button>`);
    const max = barCellScale(rows.map(row => row.metric.value));
    for (const row of rows.filter(item => item.metric.value !== null)) expect(attrs(element(byTestId(missing, TESTID(row.field!)), "<rect")!).width, row.field).toBe(String(barCellGeometry({ mode: "variance", value: row.metric.value, max }).bar!.width));

    const zeroAd = renderBridge(snapshots.zeroAd);
    expect(snapshots.zeroAd.report.bridge.components.ad_spend.value).toBe("0.00");
    const ad = byTestId(zeroAd, TESTID("ad_spend"));
    expect(ad).not.toContain("<rect");
    expect(ad).toContain('class="bar-cell-zero"');
    expect(attrs(ad)["data-tone"]).toBe("neutral");

    const refundOnly = renderBridge(snapshots.refundOnly);
    expect(barCellScale(deltaRows(snapshots.refundOnly).map(row => row.metric.value))).toBeNull();
    for (const field of AMOUNT_FIELDS) {
      const svg = byTestId(refundOnly, TESTID(field));
      expect(svg, field).not.toContain("<rect");
      expect(svg, field).toContain('class="bar-cell-zero"');
    }
  });
});

describe("G6 可追溯性與分析事件（PRD §8.7、D-V4-14）", () => {
  it("點條與點同列 number-link 開同一個抽屜：兩者 onEvidence 收到的物件 toEqual，且等於 bridgeEvidence(snapshot, bridgeRowTarget(row))", () => {
    for (const snapshot of [snapshots.golden, snapshots.demo, snapshots.missingCogs]) {
      const received: EvidenceSelection[] = [];
      const handlers = rowHandlers(bridgeTree(snapshot, evidence => received.push(evidence)));
      const rows = deltaRows(snapshot);
      for (const row of rows) {
        const handler = handlers.get(row.id)!;
        if (row.metric.value === null) { expect(handler.bar, row.id).toBeUndefined(); continue; }
        received.length = 0;
        handler.bar!();
        handler.link();
        expect(received, row.id).toHaveLength(2);
        expect(received[0], row.id).toEqual(received[1]);
        expect(received[0], row.id).toEqual(bridgeEvidence(snapshot, bridgeRowTarget(row)));
        expect(received[0].metric, row.id).toBe(snapshot.report.bridge.components[row.field!]);
      }
      // 上期、本期、總差額三列只有 number-link，沒有條。
      for (const id of ["previous", "current", "total"]) expect(handlers.get(id)!.bar, id).toBeUndefined();
    }
  });

  it("點條記 chart_clicked 一次（payload 只有 name）；點同列 number-link 不記（沿用 v3）；沒有 window.va 時不丟錯", () => {
    const va = vi.fn();
    vi.stubGlobal("window", { va });
    const handlers = rowHandlers(bridgeTree(snapshots.demo, noop));
    handlers.get("cogs_net")!.link();
    expect(va).not.toHaveBeenCalled();
    handlers.get("cogs_net")!.bar!();
    expect(va).toHaveBeenCalledTimes(1);
    expect(va).toHaveBeenCalledWith("event", { name: "chart_clicked" });
    expect(Object.keys(va.mock.calls[0][1])).toEqual(["name"]);
    vi.unstubAllGlobals();
    expect(() => handlers.get("gross_sales")!.bar!()).not.toThrow();
  });
});

describe("globals.css「V4-1 C」錨點：≤ 767 顯示、≥ 768 與列印隱藏但掛載（D-V4-33＝B、M1）", () => {
  const css = readFileSync(resolve("src/app/globals.css"), "utf8");
  const start = css.indexOf("/* ── V4-1 C：");
  const end = css.indexOf("/* ── V4-1 C 錨點結束 ── */");
  const block = css.slice(start, end);
  const rules = block.replace(/\/\*[\s\S]*?\*\//g, "").trim();

  it("只有一條規則：@media print, (min-width: 768px) 內 .bridge-table .bar-cell { display: none; }；不用 visibility、寬高歸零或 hidden 屬性", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(rules).toBe("@media print, (min-width: 768px) {\n  .bridge-table .bar-cell { display: none; }\n}");
    const declarations = [...rules.matchAll(/\{([^{}]*)\}/g)].map(match => match[1].trim());
    expect(declarations).toEqual(["display: none;"]);
  });

  it("只用 token（本段沒有色碼、字級、圓角、陰影、var(--chart-*)）；全檔其他地方沒有藏 .bar-cell 的規則（≤ 767 的螢幕一定看得到）", () => {
    const scan = scanCssText(block, "globals.css#V4-1-C");
    for (const key of ["hex", "fontSize", "borderRadius", "boxShadow"] as const) expect(scan[key], key).toEqual([]);
    expect(rules).not.toContain("var(--chart-");
    const outside = css.slice(0, start) + css.slice(end);
    const hiding = [...outside.matchAll(/([^{}]*bar-cell[^{}]*)\{([^}]*)\}/g)].filter(match => /display:\s*none|visibility:\s*hidden/.test(match[2])).map(match => match[1].trim());
    expect(hiding).toEqual([]);
  });

  it("元件不依視窗寬度條件渲染（沒有 matchMedia、innerWidth）：九條在任何寬度都掛載，顯示與否只由 CSS 決定", () => {
    const source = readFileSync(resolve("src/components/overview/charts/bridge-section.tsx"), "utf8");
    expect(source).not.toMatch(/matchMedia|innerWidth|useMediaQuery/);
  });
});
