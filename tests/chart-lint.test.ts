import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { AST_RULES, CHART_LINT_RULES, SSR_RULES, checkChartMarkup, lazyLoadedModules, scanChartSource, scanChartTsx, scanChartVarLiterals, type ChartLintRule } from "../scripts/lib/chart-scan.mjs";
import { pageStates, type StateMarkup } from "./helpers/page-states";

// V4-0a chart-lint 護欄（PRD §7.9 CL-1 到 CL-11、§4.7；06_BATCHES V4-0a 第 5 項）。量測在 scripts/lib/chart-scan.mjs：
// AST 規則（CL-2 樣板索引、CL-3 到 CL-8、CL-10）掃 src/components/charts/** 與 src/components/overview/charts/**，CL-3 的 `var(--chart-` 禁令擴到 src/components/**；
// SSR 規則（CL-1、CL-2、CL-9、CL-11）渲染 tests/helpers/page-states.tsx 的頁面狀態（七頁與空、錯誤整頁）後檢查 markup。
// 上限在 tests/fixtures/chart-lint-ceiling.json，採棘輪制：量到的數字只能等於或低於上限，上限只能往下調。
// 同一條違規在多個頁面狀態出現時只算一次（例如總覽四個狀態都缺同一個資料表，算 1）。

const CEILING_FILE = resolve("tests/fixtures/chart-lint-ceiling.json");
const readCeilings = () => (JSON.parse(readFileSync(CEILING_FILE, "utf8")) as { ceilings: Record<string, unknown> }).ceilings;

/** V4-0a 實測的 v3.0.0 基準（2026-10-08，625bfa5 的程式碼）。上限檔永遠不得高於這裡；這份常數只在 V4-0a 寫一次，之後不改。 */
const V4_0A_BASELINE: Record<ChartLintRule, number> = { "CL-1": 0, "CL-2": 0, "CL-3": 0, "CL-4": 0, "CL-5": 0, "CL-6": 0, "CL-7": 0, "CL-8": 0, "CL-9": 0, "CL-10": 0, "CL-11": 0 };
/** 七頁（PRD §7.9「渲染七頁」）；pageStates 另有開發者驗證頁與空、錯誤整頁，一併檢查。 */
const SEVEN_PAGES = ["overview", "diagnosis", "products", "scenarios", "actions", "meeting", "data"];
/** 沒有 ShellState 的整頁（空工作區、錯誤）所在的頁：shell-empty 與 shell-error 停在總覽、shell-empty-data 停在資料來源。 */
const pageOf = ({ name, state }: StateMarkup) => state?.panel ?? (name === "shell-empty-data" ? "data" : "overview");

describe("chart-lint 棘輪（PRD §7.9 CL-1 到 CL-11）", () => {
  const source = scanChartSource();
  let ssr: { violations: Map<ChartLintRule, Map<string, string[]>>; states: StateMarkup[]; mainSections: Map<string, Set<number>>; chartTestIds: number };
  const measured = () => Object.fromEntries(CHART_LINT_RULES.map(rule => [rule, ((source.violations as Record<string, string[]>)[rule]?.length ?? 0) + (ssr.violations.get(rule)?.size ?? 0)])) as Record<ChartLintRule, number>;
  const details = (rule: ChartLintRule) => [...((source.violations as Record<string, string[]>)[rule] ?? []), ...[...(ssr.violations.get(rule) ?? new Map<string, string[]>())].map(([key, states]) => `${key}（狀態：${states.join("、")}）`)];

  beforeAll(async () => {
    const states = await pageStates();
    const violations = new Map<ChartLintRule, Map<string, string[]>>(SSR_RULES.map(rule => [rule, new Map<string, string[]>()]));
    const mainSections = new Map<string, Set<number>>();
    let chartTestIds = 0;
    for (const state of states) {
      const page = pageOf(state);
      const result = checkChartMarkup(state.html, { page });
      for (const rule of SSR_RULES) for (const key of result.violations[rule]) violations.get(rule)!.set(key, [...(violations.get(rule)!.get(key) ?? []), state.name]);
      mainSections.set(page, (mainSections.get(page) ?? new Set()).add(result.mainSections.length));
      chartTestIds += result.chartTestIds.length;
    }
    ssr = { violations, states, mainSections, chartTestIds };
  }, 60_000);

  it.each(CHART_LINT_RULES)("%s 不超過上限", rule => {
    const ceiling = readCeilings()[rule] as number;
    const value = measured()[rule];
    expect(value, `${rule} 實測 ${value}，上限 ${String(ceiling)}；請改回或修正違規，不可調高上限：\n${details(rule).join("\n")}`).toBeLessThanOrEqual(ceiling);
  });

  it("上限檔只含數字、涵蓋每條規則，且每個上限 ≥ 目前實測、≤ V4-0a 基準（棘輪只能往下）", () => {
    const ceilings = readCeilings();
    expect(Object.keys(ceilings).sort()).toEqual([...CHART_LINT_RULES].sort());
    const now = measured();
    for (const [rule, value] of Object.entries(ceilings)) {
      expect(Number.isInteger(value) && (value as number) >= 0, `${rule} 必須是非負整數`).toBe(true);
      expect(value as number, `${rule} 上限低於實測`).toBeGreaterThanOrEqual(now[rule as ChartLintRule]);
      expect(value as number, `${rule} 上限不得高於 V4-0a 基準`).toBeLessThanOrEqual(V4_0A_BASELINE[rule as ChartLintRule]);
    }
  });

  it("掃描範圍真的有內容：AST 掃到圖表目錄與 src/components 的檔案；SSR 涵蓋七頁，總覽主層有 v3 既有的 4 個圖區塊", () => {
    expect(source.files.chartDirs).toBeGreaterThanOrEqual(6);
    expect(source.files.components).toBeGreaterThan(source.files.chartDirs);
    const pages = new Set<string>(ssr.states.map(pageOf));
    for (const page of SEVEN_PAGES) expect(pages.has(page), page).toBe(true);
    // v3.0.0：總覽主層 G1–G4（bridge-section、profit-section、趨勢、各通路）都是 section.chart-section；CL-9 的計數單位真的數得到。
    expect(Math.max(...ssr.mainSections.get("overview")!)).toBeGreaterThanOrEqual(4);
  });
});

describe("chart-scan 口徑（合成輸入：每條規則各一個違規與一個合規）", () => {
  const ast = (code: string, file = "src/components/charts/x.tsx", lazyLoaded = new Set<string>()) => scanChartTsx(code, file, { lazyLoaded });
  const ssr = (body: string, page = "diagnosis") => checkChartMarkup(`<main id="main-content">${body}</main>`, { page }).violations;
  const details = (summary = "表格") => `<details class="data-alternative"><summary>${summary}</summary><table><tr><td>1</td></tr></table></details>`;
  const section = (id: string, inner: string, extra = "") => `<section class="panel chart-section" aria-labelledby="${id}-title" aria-describedby="${id}-sub" data-testid="chart-diagnosis-${id}"${extra}><h2 id="${id}-title">t</h2><p id="${id}-sub">s</p>${inner}</section>`;
  const frame = (inner: string) => `<div class="chart-frame sm" aria-hidden="true">${inner}</div>`;

  it("AST 與 SSR 的規則合起來涵蓋 CL-1 到 CL-11", () => {
    expect([...new Set([...AST_RULES, ...SSR_RULES])].sort()).toEqual([...CHART_LINT_RULES].sort());
  });

  it("CL-1：圖區塊要有 details.data-alternative 或是 table 模式；data-chart-kind 只在表格或清單列內且同列有數字；C25 柱與 profit-waterfall-bar-* 不受約束（反例）", () => {
    expect(ssr(section("share", frame("<svg></svg>")))["CL-1"]).toHaveLength(1);
    expect(ssr(section("share", frame("<svg></svg>") + details()))["CL-1"]).toEqual([]);
    // table 模式（熱表）：固定高容器不設 aria-hidden、內含真的 <table>，表本身就是資料表。
    expect(ssr(section("heat", `<div class="chart-frame lg"><div class="table-scroll" role="region" aria-labelledby="heat-title"><table><tr><td data-testid="chart-diagnosis-heat-cell-DTC-2026-08-01">1.2 萬</td></tr></table></div></div>`))["CL-1"]).toEqual([]);
    // C24 內嵌條：在表格列內、同列有數字為合規；不在表格或清單列、或同列沒有數字為違規。
    const cell = `<svg aria-hidden="true" data-chart-kind="cell" data-testid="chart-overview-bridge-bar-discounts"></svg>`;
    expect(ssr(`<table><tbody><tr><th>折扣</th><td>−1,234.00</td><td>${cell}</td></tr></tbody></table>`, "overview")["CL-1"]).toEqual([]);
    expect(ssr(`<ul><li><span>DTC</span> 12 萬 <svg aria-hidden="true" data-chart-kind="spark"></svg></li></ul>`)["CL-1"]).toEqual([]);
    expect(ssr(`<div class="kpi">${cell}</div>`, "overview")["CL-1"]).toHaveLength(1);
    expect(ssr(`<table><tbody><tr><th>折扣</th><td>${cell}</td></tr></tbody></table>`, "overview")["CL-1"]).toHaveLength(1);
    // 反例：C25 的柱（ChartFrame 的 svg 內）與既有 profit-waterfall-bar-{metric} 也含 -bar-，但沒有 data-chart-kind，不受 CL-1 的列約束。
    const variance = section("variance", frame(`<svg><rect data-testid="chart-products-variance-bar-MARKETPLACE-SKU-020"></rect></svg>`) + details());
    const profit = `<section class="panel chart-section profit-section" aria-describedby="profit-sub"><p id="profit-sub">s</p><div class="chart-frame waterfall" aria-hidden="true"><svg class="waterfall-svg"><rect data-testid="profit-waterfall-bar-net_revenue"></rect></svg></div>${details()}</section>`;
    expect(ssr(variance + profit, "products")["CL-1"]).toEqual([]);
  });

  it("CL-2：chart- testid 符合 §4.7 命名、語意 key 不是純數字；圖內 testid 以 chart- 開頭或在白名單；樣板不得用 ${i}、${index}", () => {
    const testids = (ids: string[]) => ssr(section("x", frame(`<svg>${ids.map(id => `<rect data-testid="${id}"></rect>`).join("")}</svg>`) + details()), "overview")["CL-2"];
    expect(testids(["chart-overview-channels", "chart-overview-channels-bar-DTC", "chart-overview-channels-table", "chart-diagnosis-heat-cell-DTC-2026-08-01", "chart-products-variance-bar-MARKETPLACE-SKU-020", "chart-data-coverage-seg-sales-DTC-2026-08-01", "profit-waterfall-bar-net_revenue", "bridge-waterfall", "kpi-target-net_revenue"])).toEqual([]);
    // 外層 section 的 testid chart-diagnosis-x 合規；以下 5 個各一條違規。
    expect(testids(["chart-overview-channels-bar-0", "chart-overview-channels-bar-12", "chart-shop-channels", "chart-overview-channels-bars-DTC", "wf-bar-1"])).toHaveLength(5);
    expect(ast("export const A = ({ rows }: { rows: string[] }) => <g>{rows.map((row, index) => <rect key={row} data-testid={`chart-overview-x-bar-${index}`} />)}</g>;")["CL-2"]).toHaveLength(1);
    expect(ast("export const A = ({ rows }: { rows: string[] }) => <g>{rows.map((row, i) => <rect key={row} data-testid={`chart-overview-x-bar-${i}`} />)}</g>;")["CL-2"]).toHaveLength(1);
    expect(ast("export const A = ({ rows }: { rows: { channel: string }[] }) => <g>{rows.map(row => <rect key={row.channel} data-testid={`chart-overview-x-bar-${row.channel}`} />)}</g>;")["CL-2"]).toEqual([]);
  });

  it("CL-3：圖表目錄內沒有 hex、漸層、濾鏡、圖樣；src/components/** 沒有 `var(--chart-` 字串常值", () => {
    expect(ast(`export const A = () => <svg><rect fill="#1E3A8A" /><linearGradient id="g" /><filter id="f" /><pattern id="p" /><radialGradient id="r" /></svg>;`)["CL-3"]).toHaveLength(5);
    expect(ast(`import { chartColors } from "@/application/chart-theme";\nexport const A = () => <svg><rect fill={chartColors.current} /></svg>;`)["CL-3"]).toEqual([]);
    expect(scanChartVarLiterals(`export const color = "var(--chart-current)";\nexport const B = () => <i style={{ background: \`var(--chart-cat-\${1})\` }} />;`, "src/components/x.tsx")).toHaveLength(2);
    expect(scanChartVarLiterals(`import { chartColors } from "@/application/chart-theme";\nexport const color = chartColors.current; // var(--chart-current) 只在註解`, "src/components/x.tsx")).toEqual([]);
  });

  it("CL-4：Recharts 根元素 accessibilityLayer={false}、系列 isAnimationActive={false}（含同檔物件 spread）、ResponsiveContainer 有 initialDimension", () => {
    const bad = `import { Line, LineChart, ResponsiveContainer } from "recharts";\nexport const A = () => <ResponsiveContainer width="100%" height="100%"><LineChart data={[]}><Line dataKey="v" /></LineChart></ResponsiveContainer>;`;
    expect(ast(bad)["CL-4"]).toHaveLength(3);
    const good = `import { Bar, BarChart, Line, LineChart, ResponsiveContainer } from "recharts";\nimport { chartHeights } from "@/application/chart-theme";\nconst LINE = { isAnimationActive: false, strokeWidth: 1.5 } as const;\nexport const A = () => <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 520, height: chartHeights.sm }}><LineChart data={[]} accessibilityLayer={false}><Line dataKey="v" {...LINE} /></LineChart></ResponsiveContainer>;\nexport const B = () => <BarChart data={[]} accessibilityLayer={false}><Bar dataKey="v" isAnimationActive={false} /></BarChart>;`;
    expect(ast(good)["CL-4"]).toEqual([]);
  });

  it("CL-5：fontSize 只能是 chartFontSize", () => {
    expect(ast(`export const A = () => <svg fontSize={12}><text style={{ fontSize: "13px" }} /></svg>;\nexport const tick = { fontSize: 12 };`)["CL-5"]).toHaveLength(3);
    expect(ast(`import { chartFontSize } from "@/application/chart-theme";\nexport const A = () => <svg fontSize={chartFontSize} />;\nexport const tick = { fontSize: chartFontSize };`)["CL-5"]).toEqual([]);
  });

  it("CL-6：禁用 import 以完整名稱比對（ReferenceArea 允許）；Scatter 只在以 next/dynamic 載入的 *-lazy.tsx", () => {
    expect(ast(`import { Area, AreaChart, Brush, Pie, PieChart, Treemap } from "recharts";`)["CL-6"]).toHaveLength(6);
    expect(ast(`import { ReferenceArea, ReferenceLine } from "recharts";`)["CL-6"]).toEqual([]);
    const scatter = `import { Scatter, ScatterChart } from "recharts";`;
    expect(ast(scatter, "src/components/charts/products-scatter.tsx")["CL-6"]).toHaveLength(2);
    expect(ast(scatter, "src/components/charts/products-scatter-lazy.tsx")["CL-6"], "*-lazy.tsx 但沒有以 next/dynamic 載入").toHaveLength(2);
    const loaded = lazyLoadedModules([{ path: "src/components/product-comparison-panel.tsx", text: `import dynamic from "next/dynamic";\nconst Scatter = dynamic(() => import("./charts/products-scatter-lazy"), { ssr: false });` }]);
    expect(ast(scatter, "src/components/charts/products-scatter-lazy.tsx", loaded)["CL-6"]).toEqual([]);
    const alsoStatic = lazyLoadedModules([{ path: "a.tsx", text: `const S = dynamic(() => import("./charts/products-scatter-lazy"));` }, { path: "b.tsx", text: `import { ProductsScatter } from "./charts/products-scatter-lazy";` }]);
    expect(ast(scatter, "src/components/charts/products-scatter-lazy.tsx", alsoStatic)["CL-6"], "同時被靜態 import 就不算延遲載入").toHaveLength(2);
  });

  it("CL-7：aria-hidden 容器（含自己）內沒有 tabIndex、onKeyDown、<a>、<button>", () => {
    expect(ast(`export const A = ({ f }: { f: () => void }) => <div aria-hidden="true"><button type="button" /><a href="#x">x</a><svg><rect tabIndex={-1} onKeyDown={f} /></svg></div>;`)["CL-7"]).toHaveLength(4);
    expect(ast(`export const A = ({ f, on }: { f: () => void; on: boolean }) => <div><div aria-hidden={on ? true : undefined}><svg><rect onClick={f} /></svg></div><button type="button" onClick={f}>x</button></div>;`)["CL-7"]).toEqual([]);
  });

  it("CL-8：每個 Recharts 圖的數值軸 ≤ 1（不做雙數值軸）", () => {
    expect(ast(`import { LineChart, YAxis } from "recharts";\nexport const A = () => <LineChart accessibilityLayer={false}><YAxis yAxisId="l" /><YAxis yAxisId="r" orientation="right" /></LineChart>;`)["CL-8"]).toHaveLength(1);
    expect(ast(`import { BarChart, XAxis, YAxis } from "recharts";\nexport const A = () => <BarChart layout="vertical" accessibilityLayer={false}><XAxis type="number" /><YAxis type="category" dataKey="label" /></BarChart>;`)["CL-8"]).toEqual([]);
    expect(ast(`import { BarChart, XAxis, YAxis } from "recharts";\nexport const A = () => <BarChart layout="vertical" accessibilityLayer={false}><XAxis type="number" /><XAxis type="number" xAxisId="b" /><YAxis type="category" /></BarChart>;`)["CL-8"]).toHaveLength(1);
  });

  it("CL-9：每頁主層（<details>、hidden 祖先之外）的 section.chart-section ≤ 3，總覽 4", () => {
    const four = ["a", "b", "c", "d"].map(id => section(id, frame("") + details())).join("");
    expect(ssr(four, "diagnosis")["CL-9"]).toHaveLength(1);
    expect(ssr(four, "overview")["CL-9"]).toEqual([]);
    expect(ssr(four + section("e", frame("") + details()), "overview")["CL-9"]).toHaveLength(1);
    // 收進 <details>（例如 G8、G12、G16）與 hidden 的試算工作台不算主層。
    const folded = ["a", "b", "c"].map(id => section(id, frame("") + details())).join("") + `<details><summary>更多</summary>${section("d", frame("") + details())}</details><div hidden="">${section("e", frame("") + details())}</div>`;
    expect(ssr(folded, "diagnosis")["CL-9"]).toEqual([]);
  });

  it("CL-10：固定高容器只用 chartHeights（或整數倍）、依列計高的 svg 只用 chartRowHeights 的倍數或其和，不得有數字常值；height=\"100%\" 與圖例線段不在範圍", () => {
    const bad = `import { ResponsiveContainer } from "recharts";\nexport const A = ({ rows }: { rows: number }) => <div><div className="chart-frame sm" style={{ height: 180 }} /><svg className="chart-cell" height={rows * 24} /><svg data-chart-kind="spark" height={16} /><ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 520, height: 180 }} /></div>;`;
    expect(ast(bad)["CL-10"]).toHaveLength(4);
    const good = `import { ResponsiveContainer } from "recharts";\nimport { chartHeights, chartRowHeights } from "@/application/chart-theme";\nexport const A = ({ rows, count, height }: { rows: number; count: number; height: "sm" | "lg" }) => <div><div className={\`chart-frame \${height}\`} style={{ height: chartHeights[height] }} /><div className="chart-frame multiples" style={{ height: chartHeights.sm * count }} /><div className="chart-frame" style={{ height: 2 * chartHeights.sm }} /><svg className="chart-pareto" height={rows * chartRowHeights.row24 + chartRowHeights.axis} /><svg className="legend-dash" width={12} height={2} /><ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 520, height: chartHeights.sm }} /></div>;`;
    expect(ast(good)["CL-10"]).toEqual([]);
  });

  it("CL-11：柱、點、段、sparkline 與 data-chart-kind 元素本身或祖先 aria-hidden（table 模式的格除外）；aria-describedby 指到存在的 id", () => {
    const loose = section("x", `<div class="chart-frame sm"><svg><rect data-testid="chart-diagnosis-x-bar-DTC"></rect><circle data-testid="chart-diagnosis-x-point-2026-08-01"></circle></svg></div>` + details());
    expect(ssr(loose)["CL-11"]).toHaveLength(2);
    expect(ssr(`<table><tr><td>1</td><td><svg data-chart-kind="cell"></svg></td></tr></table>`)["CL-11"]).toHaveLength(1);
    expect(ssr(section("x", frame(`<svg><rect data-testid="chart-diagnosis-x-bar-DTC"></rect><path data-testid="chart-diagnosis-x-seg-DTC-fees"></path></svg>`) + details()))["CL-11"]).toEqual([]);
    // table 模式的格是表格內容（可聚焦），不得 aria-hidden，本條除外。
    const heatCell = `<td data-chart-kind="cell" data-testid="chart-diagnosis-heat-cell-DTC-2026-08-01"><button class="number-link">1.2 萬</button></td>`;
    expect(ssr(section("heat", `<div class="chart-frame lg"><div class="table-scroll" role="region"><table><tr><th>8/1</th>${heatCell}</tr></table></div></div>`))["CL-11"]).toEqual([]);
    expect(ssr(section("heat", `<div class="chart-frame lg"><table><tr><th>8/1</th>${heatCell}</tr></table></div>`).replace("<table>", "<div><table>").replace("</table>", "</table></div>").replace('class="chart-frame lg"', 'class="heat-wrap"'))["CL-11"], "不在 table 模式的固定高容器內就不豁免").toHaveLength(1);
    expect(ssr(`<section class="panel chart-section" aria-describedby="nowhere"><p id="sub">s</p>${details()}</section><section class="panel chart-section"><p>s</p>${details()}</section>`)["CL-11"]).toHaveLength(2);
  });
});
