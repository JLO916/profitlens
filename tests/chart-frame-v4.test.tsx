import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type SyntheticEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { scanChartTsx } from "../scripts/lib/chart-scan.mjs";
import { scanCssText, scanTsxText } from "../scripts/lib/ui-scan.mjs";
import { track, type AnalyticsEvent } from "../src/application/analytics";
import { chartColors, chartHeights } from "../src/application/chart-theme";
import { ChartFrame, ChartLegend, onChartTableToggle, scrollFrameTabIndex, type ChartFrameState, type ChartLegendItem } from "../src/components/overview/charts/chart-frame";
import { fill, labels } from "../src/i18n";
import { element, openTag } from "./helpers/markup";

// V4-1 代理 A：C16 ChartFrame 擴充（PRD §6.1；CHART_CATALOG §1.1、§9.1）。新 props：aside、unitNote、frameClassName、legend[].shape、mode（型別）、page、scrollLabel；
// 資料表 <details> 展開記 chart_table_opened（D-V4-14）。沒有給新 props 時輸出與 V3 逐字相同（既有斷言在 tests/overview-charts-frame.test.tsx，本檔另驗向下相容的關鍵片段）。
// 字串一律取自 labels；測試用的標題、副標以 labels 既有字串代入。

const frameCopy = labels.overview.chartFrame;
const TITLE = labels.overview.sections.bridge;
const SUBTITLE = labels.overview.page.bridgeNote;
type Props = Parameters<typeof ChartFrame>[0];
const render = (props: Partial<Props> = {}) => renderToStaticMarkup(createElement(ChartFrame, { id: "demo-chart", title: TITLE, subtitle: SUBTITLE, ...props }));
const svgChild = () => createElement("svg", { "aria-hidden": "true" });
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;
const legendCurrent: ChartLegendItem = { key: "current", label: labels.shell.periods.current, color: chartColors.current };

afterEach(() => { vi.unstubAllGlobals(); });

describe("向下相容：沒有給 V4-1 新 props 時輸出與 V3 相同", () => {
  it("固定高容器、標題列、資料表的 markup 與 V3 逐字相同；沒有 frame-grid、role、data-mode", () => {
    const html = render({ testId: "demo-chart", legend: [legendCurrent], extra: createElement("span", null, "x"), children: svgChild(), dataTable: { summary: "s", content: createElement("table") } });
    expect(openTag(html, 'class="chart-frame ')).toBe(`<div class="chart-frame sm" style="height:${chartHeights.sm}px" aria-hidden="true" data-state="ready">`);
    expect(element(html, 'class="sec-end"')).toBe(`<div class="sec-end"><div class="legend"><span><i aria-hidden="true" style="background:${chartColors.current}"></i>${labels.shell.periods.current}</span></div><span>x</span></div>`);
    expect(openTag(html, "<section")).toBe('<section class="panel chart-section" aria-labelledby="demo-chart-title" aria-describedby="demo-chart-sub" data-testid="demo-chart">');
    expect(html).toContain('<details class="data-alternative"><summary>s</summary><table></table></details>');
    for (const absent of ["frame-grid", "frame-aside", "role=\"region\"", "data-mode", "unit-note", "tabindex"]) expect(html, absent).not.toContain(absent);
  });

  it("沒有圖例、extra、單位註記時沒有 .sec-end；四態同高、空與錯誤不 aria-hidden（V3 規則不變）", () => {
    expect(render({ children: svgChild() })).not.toContain("sec-end");
    for (const state of ["ready", "loading", "empty", "error"] as ChartFrameState[]) {
      const tag = openTag(render({ state, height: "lg", children: svgChild() }), 'class="chart-frame ')!;
      expect(tag).toContain(`style="height:${chartHeights.lg}px"`);
      expect(tag.includes('aria-hidden="true"'), state).toBe(state === "ready" || state === "loading");
    }
  });

  it("圖例沒給 shape 時沿用 V3：有 dash 是 svg.legend-dash（保留原 dasharray），沒有是 12×2 的 <i>", () => {
    const html = renderToStaticMarkup(createElement(ChartLegend, { items: [legendCurrent, { key: "yoy", label: labels.overview.trendYoyV3.legend, color: chartColors.yoy, dash: "2 2", testId: "yoy" }] }));
    expect(html).toBe(`<div class="legend"><span><i aria-hidden="true" style="background:${chartColors.current}"></i>${labels.shell.periods.current}</span><span data-testid="yoy"><svg class="legend-dash" width="12" height="2" viewBox="0 0 12 2" aria-hidden="true" focusable="false"><line x1="0" y1="1" x2="12" y2="1" stroke="${chartColors.yoy}" stroke-width="2" stroke-dasharray="2 2"></line></svg>${labels.overview.trendYoyV3.legend}</span></div>`);
  });
});

describe("page：預設 testid chart-{page}-{id}（D-V4-25）", () => {
  it("只給 page 時是 chart-{page}-{id}；明確的 testId 優先；都沒給時沒有 data-testid", () => {
    expect(openTag(render({ page: "overview", id: "cumulative" }), "<section")).toContain('data-testid="chart-overview-cumulative"');
    expect(openTag(render({ page: "overview", id: "bridge", testId: "bridge-section" }), "<section")).toContain('data-testid="bridge-section"');
    expect(openTag(render(), "<section")).not.toContain("data-testid");
  });
});

describe("unitNote：標題列右側的單位註記", () => {
  it("在 .sec-end 最前面（圖例與 extra 之前）；空字串不輸出", () => {
    const note = labels.overview.bridgeV3.unitNote;
    const html = render({ unitNote: note, legend: [legendCurrent], extra: createElement("span", null, "x"), children: svgChild() });
    const end = element(html, 'class="sec-end"')!;
    expect(end.startsWith(`<div class="sec-end"><span class="unit-note">${note}</span><div class="legend">`)).toBe(true);
    expect(end.endsWith("<span>x</span></div>")).toBe(true);
    expect(render({ unitNote: note, children: svgChild() })).toContain(`<div class="sec-end"><span class="unit-note">${note}</span></div>`);
    expect(render({ unitNote: "", children: svgChild() })).not.toContain("sec-end");
  });
});

describe("aside：圖旁欄（DOM 在圖之前，不在 aria-hidden 內）", () => {
  it("輸出 .frame-grid.has-aside > .frame-aside（在前）＋.frame-main（固定高容器）；資料表、after 在格線之後", () => {
    const aside = createElement("div", { className: "bridge-table-wrap" }, createElement("table", { "data-testid": "aside-table" }));
    const html = render({ aside, height: "lg", frameClassName: "waterfall", children: svgChild(), after: createElement("p", { className: "note" }, "n"), dataTable: { summary: "s", content: createElement("table") } });
    const grid = element(html, 'class="frame-grid has-aside"')!;
    expect(grid).toBe(`<div class="frame-grid has-aside"><div class="frame-aside"><div class="bridge-table-wrap"><table data-testid="aside-table"></table></div></div><div class="frame-main"><div class="chart-frame lg waterfall" style="height:${chartHeights.lg}px" aria-hidden="true" data-state="ready"><svg aria-hidden="true"></svg></div></div></div>`);
    expect(html.indexOf("frame-grid")).toBeLessThan(html.indexOf('<p class="note">'));
    expect(html.indexOf('<p class="note">')).toBeLessThan(html.indexOf('class="data-alternative"'));
    expect(count(html, /class="chart-frame[ "]/g)).toBe(1);
  });

  it("aside 是 null、false 時與沒給相同", () => {
    for (const aside of [null, false]) expect(render({ aside, children: svgChild() })).toBe(render({ children: svgChild() }));
  });
});

describe("frameClassName、scrollLabel：可水平捲動的瀑布外框（390 鍵盤修正）", () => {
  it("frameClassName 加在固定高容器上（.chart-frame.lg.waterfall）", () => {
    expect(openTag(render({ height: "lg", frameClassName: "waterfall", children: svgChild() }), 'class="chart-frame ')).toBe(`<div class="chart-frame lg waterfall" style="height:${chartHeights.lg}px" aria-hidden="true" data-state="ready">`);
  });

  it("scrollLabel：外框不帶 aria-hidden、改 role=region＋aria-label（labels.shell.chartsV4.common.chartRegion）；SSR 不帶 tabindex；四態同高", () => {
    const label = fill(labels.shell.chartsV4.common.chartRegion, { title: TITLE });
    for (const state of ["ready", "loading", "empty", "error"] as ChartFrameState[]) {
      const html = render({ state, height: "lg", frameClassName: "waterfall", scrollLabel: label, children: svgChild() });
      expect(openTag(html, 'class="chart-frame ')).toBe(`<div class="chart-frame lg waterfall" style="height:${chartHeights.lg}px" role="region" aria-label="${label}" data-state="${state}">`);
    }
    const ready = render({ height: "lg", frameClassName: "waterfall", scrollLabel: label, children: svgChild() });
    expect(element(ready, 'class="chart-frame ')).toContain('<svg aria-hidden="true"></svg>');
    expect(render({ state: "empty", scrollLabel: label })).toContain(`<p class="chart-frame-message">${frameCopy.noData}</p>`);
    expect(label).toContain(TITLE);
  });

  it("scrollFrameTabIndex：內容比可視寬多 1px 以上才是 Tab 停留點（390 的 520／600px 瀑布在約 324px 的框內）", () => {
    expect(scrollFrameTabIndex(600, 324)).toBe(0);
    expect(scrollFrameTabIndex(520, 450)).toBe(0);
    expect(scrollFrameTabIndex(1122, 1122)).toBeUndefined();
    expect(scrollFrameTabIndex(801, 800)).toBeUndefined();
    expect(scrollFrameTabIndex(803, 800)).toBe(0);
  });
});

describe("mode（型別；V4-3b 的 G11、G21 第一次使用）", () => {
  it("table：固定高容器不設 aria-hidden、帶 data-mode=\"table\"；chart（明確給）與預設相同", () => {
    expect(openTag(render({ mode: "table", children: createElement("table") }), 'class="chart-frame ')).toBe(`<div class="chart-frame sm" style="height:${chartHeights.sm}px" data-state="ready" data-mode="table">`);
    expect(render({ mode: "chart", children: svgChild() })).toBe(render({ children: svgChild() }));
  });
});

describe("legend[].shape：line、dash、tick、ring、rect（X32：沒有實心圓點或方塊）", () => {
  const items: ChartLegendItem[] = (["line", "dash", "tick", "ring", "rect"] as const).map(shape => ({ key: shape, label: shape, color: chartColors.total, shape }));
  const html = renderToStaticMarkup(createElement(ChartLegend, { items }));
  const spans = [...html.matchAll(/<span>([\s\S]*?)<\/span>/g)].map(match => match[1]);

  it("每個形狀一個記號，文字在記號之後", () => {
    expect(spans).toHaveLength(5);
    expect(spans[0]).toBe(`<i aria-hidden="true" style="background:${chartColors.total}"></i>line`);
    expect(spans[1]).toBe(`<svg class="legend-dash" width="12" height="2" viewBox="0 0 12 2" aria-hidden="true" focusable="false"><line x1="0" y1="1" x2="12" y2="1" stroke="${chartColors.total}" stroke-width="2" stroke-dasharray="4 3"></line></svg>dash`);
    expect(spans[2]).toBe(`<svg class="legend-mark" data-shape="tick" width="2" height="12" viewBox="0 0 2 12" aria-hidden="true" focusable="false"><line x1="1" y1="0" x2="1" y2="12" stroke="${chartColors.total}" stroke-width="2"></line></svg>tick`);
    expect(spans[3]).toBe(`<svg class="legend-mark" data-shape="ring" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><circle cx="5" cy="5" r="4" fill="none" stroke="${chartColors.total}" stroke-width="1.5"></circle></svg>ring`);
    expect(spans[4]).toBe(`<svg class="legend-mark" data-shape="rect" width="12" height="8" viewBox="0 0 12 8" aria-hidden="true" focusable="false"><rect x="0.5" y="0.5" width="11" height="7" fill="none" stroke="${chartColors.total}" stroke-width="1"></rect></svg>rect`);
  });

  it("圓與矩形一律空心（fill=\"none\"），記號都 aria-hidden；沒有 legend-dot", () => {
    for (const match of html.matchAll(/<(circle|rect)\b([^>]*)>/g)) expect(match[2], match[0]).toContain('fill="none"');
    expect(count(html, /<svg\b/g)).toBe(count(html, /<svg\b[^>]*aria-hidden="true"/g));
    expect(html).not.toContain("legend-dot");
  });
});

describe("分析事件（D-V4-14）：只記事件名", () => {
  const toggle = (open: boolean) => onChartTableToggle({ currentTarget: { open } } as unknown as SyntheticEvent<HTMLDetailsElement>);

  it("資料表 <details> 展開時記 chart_table_opened 一次，payload 只有 name；收合不記", () => {
    const va = vi.fn();
    vi.stubGlobal("window", { va });
    toggle(false);
    expect(va).not.toHaveBeenCalled();
    toggle(true);
    expect(va).toHaveBeenCalledTimes(1);
    expect(va).toHaveBeenCalledWith("event", { name: "chart_table_opened" });
    expect(Object.keys(va.mock.calls[0][1])).toEqual(["name"]);
  });

  it("chart_clicked、chart_table_opened 是固定代號；沒有 window.va 時不丟錯", () => {
    const events: AnalyticsEvent[] = ["chart_clicked", "chart_table_opened"];
    const va = vi.fn();
    vi.stubGlobal("window", { va });
    for (const name of events) track(name);
    expect(va.mock.calls.map(([, payload]) => payload)).toEqual(events.map(name => ({ name })));
    for (const name of events) expect(name).toMatch(/^[a-z_]+$/);
    vi.unstubAllGlobals();
    expect(() => toggle(true)).not.toThrow();
  });
});

describe("原始碼與樣式護欄", () => {
  it("chart-frame.tsx：沒有 hex、中文字串或 JSX 中文、fontSize 常值；chart-lint 的 AST 規則（含 CL-7 aria-hidden 容器內的 tabIndex、CL-10 高度）0 違規", () => {
    const file = "src/components/overview/charts/chart-frame.tsx";
    const text = readFileSync(resolve(file), "utf8");
    const scan = scanTsxText(text, file);
    expect(scan.hex).toEqual([]);
    expect(scan.jsxCjk).toEqual([]);
    expect(scan.cjkLiterals).toEqual([]);
    expect(scan.fontSize).toEqual([]);
    const lint = scanChartTsx(text, file) as Record<string, string[]>;
    for (const [rule, found] of Object.entries(lint)) expect(found, rule).toEqual([]);
  });

  it("globals.css 錨點 V4-1 A 的規則只用 token：沒有 hex、字級與圓角、陰影", () => {
    const css = readFileSync(resolve("src/app/globals.css"), "utf8");
    const start = css.indexOf("/* ── V4-1 A：");
    const end = css.indexOf("/* ── V4-1 A 錨點結束 ── */");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = css.slice(start, end);
    const scan = scanCssText(block, "globals.css#V4-1-A");
    expect(scan.hex).toEqual([]);
    expect(scan.fontSize).toEqual([]);
    expect(scan.borderRadius).toEqual([]);
    expect(scan.boxShadow).toEqual([]);
    // 旁欄排法用 grid-template-areas，不用 order（Tab 順序＝DOM 順序）。
    expect(block).toContain('grid-template-areas: "main aside"');
    expect(block).toContain('grid-template-areas: "aside" "main"');
    expect(block).not.toMatch(/\border\s*:/);
  });
});
