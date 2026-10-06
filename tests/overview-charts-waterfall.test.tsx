import Decimal from "decimal.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { scanCssText, scanTsxText } from "../scripts/lib/ui-scan.mjs";
import { chartColors, chartHeights } from "../src/application/chart-theme";
import { deltaTone, formatAmountL1, formatAmountL3, formatEmpty, formatMetric, formatRateL2, formatSignedDelta, metricDefinitions, MINUS } from "../src/application/presentation";
import { bridgeWaterfall, PROFIT_WATERFALL_METRICS, profitWaterfall, profitWaterfallScopes, waterfallToneColor, type WaterfallBar } from "../src/application/waterfall";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "../src/application/workspace";
import { BridgeSection, bridgeBarTarget, bridgeEvidence, bridgeRowTarget, bridgeRowText, bridgeUnitNote } from "../src/components/overview/charts/bridge-section";
import { ProfitSection, profitEvidence, profitRowAmount, profitRowLabel, profitRowShare } from "../src/components/overview/charts/profit-section";
import { splitWaterfallLabel, WaterfallSvg, waterfallGeometry, waterfallTickLabels } from "../src/components/overview/charts/waterfall-svg";
import { toneClass } from "../src/components/top-three";
import { AMOUNT_FIELDS, type Dataset, type Metric, type MetricName } from "../src/domain/types";
import { validateDataset } from "../src/domain/validation";
import { fill, labels } from "../src/i18n";
import { fixture } from "./helpers/fixtures";
import { byTestId, element, openTag, textOf } from "./helpers/markup";

// V3-4b 代理 B1：總覽區塊 5「貢獻變化拆解」（C17）與區塊 6「本期利潤結構」（F2，§10.3）的 SSR 結構測試，以及瀑布 SVG 的幾何。
// 期待值一律由 labels、fill、presentation 的格式化函式與 waterfall.ts 的資料組裝從 snapshot 的精確字串組出，不寫死數字
// （golden：上期扣廣告後貢獻 570.00、本期 255.00、差額 −315.00）。加總檢查用 decimal.js 到分。

const CM: MetricName = "contribution_after_marketing";
const bridgeCopy = labels.overview.bridgeV3;
const profitCopy = labels.overview.profit;
const page = labels.overview.page;
const periods = labels.shell.periods;
const noop = () => undefined;

type Loaded = { dataset: Dataset; snapshot: WorkspaceSnapshot };
async function load(name: string): Promise<Loaded> {
  const input = fixture(name);
  const dataset = validateDataset(input).dataset!;
  return { dataset, snapshot: await createSnapshot(dataset, {}, await hashInput(input)) };
}
let golden: Loaded;
let demo: Loaded;
beforeAll(async () => { golden = await load("golden"); demo = await load("demo"); });
const both = () => [golden, demo];

const renderBridge = (snapshot: WorkspaceSnapshot) => renderToStaticMarkup(createElement(BridgeSection, { snapshot, onEvidence: noop }));
const renderProfit = (snapshot: WorkspaceSnapshot, allChannels?: readonly string[]) => renderToStaticMarkup(createElement(ProfitSection, { snapshot, onEvidence: noop, allChannels }));
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;
const missing = (code = "MISSING_COGS"): Metric => ({ value: null, reason_codes: [code] });
/** 畫面上的 L3 金額（U+2212、千分位、+ 號）轉回精確小數，用來驗證「顯示出來的數字」加總到分。 */
const shown = (text: string) => new Decimal(text.replaceAll(MINUS, "-").replaceAll(",", "").replace(/^\+/, ""));
/** <button …>文字</button> 的文字（依出現順序）。 */
const buttonTexts = (html: string) => [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map(match => match[1]);
/** 瀑布柱上標值（依出現順序）。 */
const valueTexts = (svg: string) => [...svg.matchAll(/<text class="wf-value[^"]*"[^>]*>([^<]*)<\/text>/g)].map(match => match[1]);
/** 每個 <rect> 的屬性（依出現順序）。 */
const rects = (svg: string) => [...svg.matchAll(/<rect\b([^>]*)>/g)].map(match => Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(attr => [attr[1], attr[2]])));
const rowsOf = (table: string) => { const body = element(table, "<tbody")!; return [...body.matchAll(/<tr\b[\s\S]*?<\/tr>/g)].map(match => match[0]); };

describe("BridgeSection：貢獻變化拆解（C17，§7.1 第 5 點）", () => {
  it("golden／demo：標題是結論句、副標是標準名稱＋期間＋L2 說明（aria 描述）、右側單位說明", () => {
    for (const { snapshot } of both()) {
      const html = renderBridge(snapshot);
      const data = bridgeWaterfall(snapshot);
      const section = openTag(html, 'data-testid="bridge-section"')!;
      expect(section).toContain('aria-labelledby="bridge-title"');
      expect(section).toContain('aria-describedby="bridge-sub"');
      expect(section).toMatch(/^<section class="panel chart-section/);
      expect(textOf(element(html, 'id="bridge-title"')!)).toBe(data.title);
      expect(textOf(element(html, 'id="bridge-sub"')!)).toBe(fill(bridgeCopy.subtitleWithNote, { subtitle: data.subtitle, note: page.bridgeNote }));
      expect(textOf(element(html, 'class="unit-note"')!)).toBe(bridgeUnitNote(data.bars));
    }
    // golden 金額都不到 1 萬（柱上標元）；demo 是萬元。
    expect(bridgeUnitNote(bridgeWaterfall(golden.snapshot).bars)).toBe(bridgeCopy.unitNoteYuan);
    expect(bridgeUnitNote(bridgeWaterfall(demo.snapshot).bars)).toBe(bridgeCopy.unitNote);
  });

  it("瀑布：11 根（上期 → 九項 → 本期），圖與外框 aria-hidden、外框固定 320px；柱色是 chart-theme token、柱上標值是 bar.display", () => {
    for (const { snapshot } of both()) {
      const html = renderBridge(snapshot);
      const data = bridgeWaterfall(snapshot);
      const svg = byTestId(html, "bridge-waterfall");
      const svgTag = svg.slice(0, svg.indexOf(">") + 1);
      expect(svgTag).toContain('aria-hidden="true"');
      expect(svgTag).toContain('focusable="false"');
      expect(svgTag).toContain(`viewBox="0 0 800 ${chartHeights.lg}"`);
      const frame = openTag(html, 'class="chart-frame waterfall"')!;
      expect(frame).toContain('aria-hidden="true"');
      expect(frame).toContain(`style="height:${chartHeights.lg}px"`);
      expect(count(svg, /<rect\b/g)).toBe(11);
      const fills = rects(svg).map(rect => rect.fill);
      expect(fills).toEqual(data.bars.map(bar => waterfallToneColor[bar.tone]));
      expect([fills[0], fills[10]]).toEqual([chartColors.total, chartColors.total]);
      for (const value of fills) expect(Object.values(chartColors)).toContain(value);
      expect(valueTexts(svg)).toEqual(data.bars.map(bar => bar.display));
      // x 標籤是柱的短名（放不下時拆兩行，拼回來相同）。
      const xGroup = element(svg, 'class="wf-x"')!;
      expect([...xGroup.matchAll(/<text\b[\s\S]*?<\/text>/g)].map(match => textOf(match[0]))).toEqual(data.bars.map(bar => bar.shortLabel));
      // 只有水平格線（y1＝y2）；第一條刻度是 0。
      for (const line of element(svg, 'class="wf-grid"')!.matchAll(/<line\b([^>]*)>/g)) expect(/y1="([^"]+)"/.exec(line[1])![1]).toBe(/y2="([^"]+)"/.exec(line[1])![1]);
      expect(textOf(element(svg, 'class="wf-axis"')!).startsWith("0")).toBe(true);
    }
  });

  it("橋接表：12 列金額（上期 → 九項 → 本期 → 總差額）都是 number-link，最後一列平衡檢核；顯示的九項加總到分等於總差額", () => {
    for (const { snapshot } of both()) {
      const html = renderBridge(snapshot);
      const { report } = snapshot;
      const data = bridgeWaterfall(snapshot);
      const table = byTestId(html, "bridge-table");
      expect(openTag(html, 'data-testid="bridge-table"')).toMatch(/class="kv l3 bridge-table"/);
      expect(textOf(element(table, "<thead")!)).toBe(`${bridgeCopy.table.item}${bridgeCopy.table.amount}`);
      const rows = rowsOf(table);
      expect(rows).toHaveLength(13);
      expect(rows.slice(0, 12).map(row => textOf(element(row, "<th")!))).toEqual([bridgeCopy.rows.previous, ...AMOUNT_FIELDS.map(field => bridgeCopy.rows[field]), bridgeCopy.rows.current, bridgeCopy.rows.total]);
      const expected = [
        formatAmountL3(report.previous.metrics[CM].value),
        ...AMOUNT_FIELDS.map(field => formatSignedDelta(report.bridge.components[field].value, "L3")),
        formatAmountL3(report.current.metrics[CM].value),
        formatSignedDelta(report.bridge.sum.value, "L3"),
      ];
      expect(buttonTexts(table)).toEqual(expected);
      expect(data.rows.map(bridgeRowText)).toEqual(expected);
      // 用畫面上的字串加總（decimal.js 到分）：九項 = 總差額；上期 + 總差額 = 本期。
      const nine = expected.slice(1, 10).reduce((sum, text) => sum.plus(shown(text)), new Decimal(0));
      expect(nine.toFixed(2)).toBe(shown(expected[11]).toFixed(2));
      expect(shown(expected[0]).plus(shown(expected[11])).toFixed(2)).toBe(shown(expected[10]).toFixed(2));
      // 總差額的 number-link 帶 .bridge-total（E2E 既有定位器）與有利／不利色；本期列粗體加線。
      expect(table).toContain(`<button type="button" class="number-link ${toneClass(deltaTone(CM, report.bridge.sum.value, "L3"))} bridge-total">${formatSignedDelta(report.bridge.sum.value, "L3")}</button>`);
      expect(count(html, /bridge-total/g)).toBe(1);
      expect(rows[10]).toMatch(/^<tr class="is-total"/);
      // 平衡檢核：已平衡＝check icon＋「已平衡（差 0.00）」。
      const balance = byTestId(html, "bridge-balance-check");
      expect(textOf(balance)).toBe(`${bridgeCopy.balance.label}${data.balanceText}`);
      expect(data.balanceText).toBe(fill(bridgeCopy.balance.balanced, { difference: formatAmountL3("0.00") }));
      expect(balance).toContain('data-tone="balanced"');
      expect(balance).toContain('d="M5 12l5 5 9-10"');
    }
    expect(buttonTexts(byTestId(renderBridge(golden.snapshot), "bridge-table")).at(-1)).toBe(formatSignedDelta("-315.00", "L3"));
  });

  it("保留 v2 數據表 <details class=\"data-alternative\">：4 欄（項目／上期／本期／影響金額）、九列 number-link、tfoot 取位說明", () => {
    for (const { snapshot } of both()) {
      const html = renderBridge(snapshot);
      const { report } = snapshot;
      const details = element(html, 'class="data-alternative"')!;
      expect(details.startsWith("<details")).toBe(true);
      expect(details).not.toMatch(/^<details[^>]*\sopen/);
      expect(textOf(element(details, "<summary")!)).toBe(fill(page.dataTable, { title: labels.overview.sections.bridge }));
      expect(openTag(details, 'role="region"')).toContain(`aria-label="${page.bridgeTableAria}"`);
      const head = element(details, "<thead")!;
      expect([...head.matchAll(/<th>([^<]*)<\/th>/g)].map(match => match[1])).toEqual([page.colItem, periods.previous, periods.current, labels.overview.sections.impact]);
      const rows = rowsOf(details);
      expect(rows).toHaveLength(9);
      AMOUNT_FIELDS.forEach((field, index) => {
        expect(buttonTexts(rows[index]), field).toEqual([formatMetric(field, report.previous.metrics[field], "L3"), formatMetric(field, report.current.metrics[field], "L3"), formatSignedDelta(report.bridge.components[field].value, "L3")]);
      });
      expect(details).toContain(`<tfoot><tr><td colSpan="4" class="note">${labels.format.roundingNote}</td></tr></tfoot>`);
    }
  });

  it("點瀑布柱與點橋接表列開同一個抽屜（bridgeEvidence），內容與 v2 總覽相同", () => {
    for (const { snapshot } of both()) {
      const { report } = snapshot;
      const data = bridgeWaterfall(snapshot);
      const channels = [...report.scope.channels];
      for (const bar of data.bars) {
        const row = data.rows.find(item => item.id === bar.id)!;
        expect(bridgeBarTarget(bar), bar.id).toBe(bridgeRowTarget(row));
        expect(bridgeEvidence(snapshot, bridgeBarTarget(bar))).toEqual(bridgeEvidence(snapshot, bridgeRowTarget(row)));
      }
      for (const period of ["previous", "current"] as const) {
        const evidence = bridgeEvidence(snapshot, period);
        expect(evidence).toEqual({ name: CM, metric: report[period].metrics[CM], period: report[period].period, sources: report[period].sources, channels, title: metricDefinitions[CM].label });
        expect(evidence.metric).toBe(report[period].metrics[CM]);
      }
      const periodBoth = { start: [report.previous.period.start, report.current.period.start].sort()[0], end: [report.previous.period.end, report.current.period.end].sort()[1] };
      const sourcesBoth = [...report.previous.sources, ...report.current.sources];
      for (const field of AMOUNT_FIELDS) {
        const evidence = bridgeEvidence(snapshot, field);
        expect(evidence).toEqual({
          title: fill(page.bridgeRowTitle, { metric: metricDefinitions[field].label }), name: field, metric: report.bridge.components[field], period: periodBoth, channels, sources: sourcesBoth,
          formula: field === "gross_sales" ? page.amountDeltaFormula : page.costDeltaFormula,
          components: [{ label: periods.previous, metric: report.previous.metrics[field] }, { label: periods.current, metric: report.current.metrics[field] }],
        });
        expect(evidence.metric).toBe(report.bridge.components[field]);
      }
      const total = bridgeEvidence(snapshot, "total");
      expect(total.metric).toBe(report.bridge.sum);
      expect(total).toMatchObject({ title: `${metricDefinitions[CM].label}${page.bridgeTotal}`, name: CM, period: periodBoth, channels, sources: sourcesBoth, formula: AMOUNT_FIELDS.map(field => `${metricDefinitions[field].label}${labels.exports.csv.suffix.change}`).join(" − ") });
      expect(total.components).toEqual(AMOUNT_FIELDS.map(field => ({ label: metricDefinitions[field].label, metric: report.bridge.components[field] })));
      expect(bridgeRowTarget(data.rows[11])).toBe("total");
    }
  });

  it("缺值：商品成本差額待補 → 該柱虛線框＋資料待補、之後無法定位的柱不畫（只留 x 標籤）；表格與平衡檢核寫資料待補", () => {
    const snap = structuredClone(golden.snapshot);
    snap.report.bridge.components.cogs_net = missing();
    snap.report.bridge.sum = missing();
    snap.report.bridge.contribution_change = missing();
    snap.report.bridge.reconciled = null;
    const html = renderBridge(snap);
    const data = bridgeWaterfall(snap);
    expect(textOf(element(html, 'id="bridge-title"')!)).toBe(bridgeCopy.title.missing);
    const svg = byTestId(html, "bridge-waterfall");
    const drawn = rects(svg);
    // 上期、原價收入、折扣、退款照畫；商品成本是虛線框；之後 6 根無法定位不畫。
    expect(drawn).toHaveLength(5);
    expect(drawn[4]).toMatchObject({ class: "wf-bar is-missing is-clickable", fill: "none", stroke: chartColors.axis, "stroke-dasharray": "4 3" });
    expect(drawn.slice(0, 4).every(rect => rect.fill !== "none" && rect["stroke-dasharray"] === undefined)).toBe(true);
    expect(valueTexts(svg)).toEqual([...data.bars.slice(0, 4).map(bar => bar.display), formatEmpty("missing")]);
    expect(count(element(svg, 'class="wf-x"')!, /<text\b/g)).toBe(11);
    expect(openTag(html, 'class="chart-frame waterfall"')).toContain(`style="height:${chartHeights.lg}px"`);
    const texts = buttonTexts(byTestId(html, "bridge-table"));
    expect(texts[4]).toBe(formatEmpty("missing"));
    expect(texts[11]).toBe(formatEmpty("missing"));
    const balance = byTestId(html, "bridge-balance-check");
    expect(balance).toContain('data-tone="missing"');
    expect(textOf(balance)).toBe(`${bridgeCopy.balance.label}${bridgeCopy.balance.missing}`);
    expect(balance).not.toContain("<svg");
  });

  it("不平衡（防呆）：平衡檢核改 warning 色寫「差 {x} 元」，沒有 check icon", () => {
    const snap = structuredClone(golden.snapshot);
    snap.report.bridge.sum = { value: "-300.00", reason_codes: [] };
    snap.report.bridge.reconciled = false;
    const balance = byTestId(renderBridge(snap), "bridge-balance-check");
    expect(balance).toContain('data-tone="warning"');
    expect(textOf(balance)).toBe(`${bridgeCopy.balance.label}${fill(bridgeCopy.balance.unbalanced, { difference: formatAmountL3("15.00") })}`);
    expect(balance).not.toContain("<svg");
  });
});

describe("ProfitSection：本期利潤結構（F2，§10.3）", () => {
  it("golden／demo：標題（每 100 元淨營收）、副標（全部通路）、範圍分段按鈕＝通路數＋1、預設合計", () => {
    for (const { snapshot, dataset } of both()) {
      const allChannels = dataset.manifest.channels;
      const html = renderProfit(snapshot, allChannels);
      const data = profitWaterfall(snapshot, "all", { allChannels });
      const section = openTag(html, 'data-testid="profit-waterfall"')!;
      expect(section).toMatch(/^<section class="panel chart-section/);
      expect(section).toContain('aria-labelledby="profit-title"');
      expect(section).toContain('aria-describedby="profit-sub"');
      expect(textOf(element(html, 'id="profit-title"')!)).toBe(data.title);
      expect(textOf(element(html, 'id="profit-sub"')!)).toBe(data.subtitle);
      expect(data.scopeLabel).toBe(labels.shell.periodBar.filter.allChannels);
      const group = byTestId(html, "profit-waterfall-scope");
      expect(openTag(html, 'data-testid="profit-waterfall-scope"')).toContain(`role="group" aria-label="${profitCopy.scope.aria}"`);
      expect(count(group, /<button\b/g)).toBe(snapshot.report.scope.channels.length + 1);
      expect(buttonTexts(group)).toEqual(profitWaterfallScopes(snapshot).map(item => item.label));
      expect([...group.matchAll(/aria-pressed="(true|false)"/g)].map(match => match[1])).toEqual(["true", ...snapshot.report.scope.channels.map(() => "false")]);
    }
    // 不給 allChannels 時副標寫「合計」。
    expect(textOf(element(renderProfit(demo.snapshot), 'id="profit-sub"')!)).toBe(profitWaterfall(demo.snapshot, "all").subtitle);
  });

  it("瀑布：10 根 profit-waterfall-bar-{metric}（§10.3 柱序），淨營收與小計 --chart-total、扣廣告後貢獻 --chart-current、扣項不利色", () => {
    for (const { snapshot } of both()) {
      const html = renderProfit(snapshot);
      const data = profitWaterfall(snapshot, "all");
      const svg = element(html, 'class="waterfall-svg"')!;
      expect(openTag(html, 'class="chart-frame waterfall"')).toContain('aria-hidden="true"');
      expect(svg.slice(0, svg.indexOf(">"))).toContain('aria-hidden="true"');
      const drawn = rects(svg);
      expect(drawn.map(rect => rect["data-testid"])).toEqual(PROFIT_WATERFALL_METRICS.map(item => `profit-waterfall-bar-${item.metric}`));
      expect(count(html, /data-testid="profit-waterfall-bar-/g)).toBe(10);
      const fillOf = (metric: MetricName) => drawn.find(rect => rect["data-testid"] === `profit-waterfall-bar-${metric}`)!.fill;
      for (const metric of ["net_revenue", "gross_profit", "contribution_before_marketing"] as const) expect(fillOf(metric), metric).toBe(chartColors.total);
      expect(fillOf(CM)).toBe(chartColors.current);
      for (const metric of ["cogs_net", "platform_fees", "payment_fees", "fulfillment_costs", "other_variable_costs", "ad_spend"] as const) expect(fillOf(metric), metric).toBe(chartColors.unfavorable);
      expect(valueTexts(svg)).toEqual(data.bars.map(bar => bar.display));
      expect(openTag(html, 'class="chart-frame waterfall"')).toContain(`style="height:${chartHeights.lg}px"`);
    }
  });

  it("資料表 <details>：10 列，扣項寫「減：」，金額 L3 number-link、佔淨營收 L2；淨營收減全部扣項＝扣廣告後貢獻（畫面數字到分）", () => {
    for (const { snapshot } of both()) {
      const html = renderProfit(snapshot);
      const { report } = snapshot;
      const data = profitWaterfall(snapshot, "all");
      const details = element(html, 'class="data-alternative"')!;
      expect(details).not.toMatch(/^<details[^>]*\sopen/);
      expect(textOf(element(details, "<summary")!)).toBe(fill(labels.overview.chartFrame.dataTableSummary, { title: profitCopy.section }));
      expect(openTag(details, 'role="region"')).toContain(`aria-label="${profitCopy.table.aria}"`);
      expect(textOf(element(details, "<thead")!)).toBe(`${profitCopy.table.item}${profitCopy.table.amount}${profitCopy.table.share}`);
      const rows = rowsOf(details);
      expect(rows).toHaveLength(10);
      PROFIT_WATERFALL_METRICS.forEach(({ metric, kind }, index) => {
        const row = rows[index];
        const label = kind === "delta" ? fill(profitCopy.rowDeduct, { label: metricDefinitions[metric].label }) : metricDefinitions[metric].label;
        expect(textOf(element(row, "<th")!), metric).toBe(label);
        expect(profitRowLabel(data.rows[index])).toBe(label);
        expect(buttonTexts(row), metric).toEqual([formatAmountL3(report.current.metrics[metric].value)]);
        expect(row).toContain(`<td class="num">${formatRateL2(data.rows[index].share)}</td>`);
        expect(row).toMatch(kind === "result" ? /^<tr class="is-total"/ : kind === "subtotal" ? /^<tr class="is-subtotal"/ : /^<tr data-row=/);
      });
      expect(rows[0]).toContain(`<td class="num">${formatRateL2("1")}</td>`);
      expect(rows[9]).toContain(`<td class="num">${formatRateL2(report.current.metrics.contribution_margin.value)}</td>`);
      const amounts = rows.map(row => shown(buttonTexts(row)[0]));
      const deductions = PROFIT_WATERFALL_METRICS.map((item, index) => item.kind === "delta" ? amounts[index] : new Decimal(0)).reduce((sum, value) => sum.plus(value), new Decimal(0));
      expect(amounts[0].minus(deductions).toFixed(2)).toBe(amounts[9].toFixed(2));
    }
  });

  it("點柱與點資料表列開同一個抽屜（profitEvidence）：合計用全部範圍與本期來源，單一通路用該通路的指標與來源", () => {
    for (const { snapshot } of both()) {
      const { report } = snapshot;
      for (const scope of ["all", ...report.scope.channels]) {
        const data = profitWaterfall(snapshot, scope);
        const metrics = scope === "all" ? report.current.metrics : report.current.channels[scope].metrics;
        const sources = scope === "all" ? report.current.sources : report.current.channels[scope].sources;
        for (const row of data.rows) {
          const evidence = profitEvidence(snapshot, scope, row);
          expect(evidence, `${scope} ${row.metric}`).toEqual({ name: row.metric, metric: metrics[row.metric], period: report.current.period, sources, channels: scope === "all" ? [...report.scope.channels] : [scope], title: metricDefinitions[row.metric].label });
          expect(evidence.metric).toBe(metrics[row.metric]);
          // 柱子以 metric 對到同一列（onBar 用 rows.find(metric)）。
          expect(data.bars.find(bar => bar.metric === row.metric)!.id).toBe(row.id);
        }
      }
    }
  });

  it("通路範圍的瀑布：demo 平台通路扣完廣告為負，結果柱從 0 往下畫、標值不利色", () => {
    const data = profitWaterfall(demo.snapshot, "MARKETPLACE");
    expect(new Decimal(data.bars[9].value!).isNegative()).toBe(true);
    const geometry = waterfallGeometry(data.bars, 800, chartHeights.lg);
    const result = geometry.shapes[9];
    expect(result.rect!.y).toBe(geometry.zeroY);
    expect(result.value!.tone).toBe("neg");
    expect(geometry.ticks.some(tick => tick.value < 0 && tick.label.startsWith(MINUS))).toBe(true);
    const html = renderToStaticMarkup(createElement(WaterfallSvg, { bars: data.bars, height: chartHeights.lg, testIdPrefix: "profit-waterfall-bar-" }));
    expect(html).toContain('class="wf-value is-neg"');
    expect(rects(html).at(-1)!.fill).toBe(chartColors.current);
  });

  it("缺值（商品成本與之後的小計待補）：受影響的柱虛線框＋資料待補，之後無法定位的扣項不畫；資料表寫資料待補", () => {
    const snap = structuredClone(golden.snapshot);
    const metrics = snap.report.current.metrics;
    for (const name of ["cogs_net", "gross_profit", "contribution_before_marketing", "contribution_after_marketing", "gross_margin", "contribution_margin"] as const) metrics[name] = missing();
    const html = renderProfit(snap);
    const data = profitWaterfall(snap, "all");
    expect(textOf(element(html, 'id="profit-title"')!)).toBe(profitCopy.section);
    const svg = element(html, 'class="waterfall-svg"')!;
    const drawn = rects(svg);
    expect(drawn.map(rect => rect["data-testid"])).toEqual(["net_revenue", "cogs_net", "gross_profit", "contribution_before_marketing", CM].map(metric => `profit-waterfall-bar-${metric}`));
    expect(drawn[0]).toMatchObject({ fill: chartColors.total });
    for (const rect of drawn.slice(1)) expect(rect).toMatchObject({ class: "wf-bar is-missing is-clickable", fill: "none", stroke: chartColors.axis, "stroke-dasharray": "4 3" });
    expect(valueTexts(svg)).toEqual([formatAmountL1(metrics.net_revenue.value), ...Array.from({ length: 4 }, () => formatEmpty("missing"))]);
    expect(openTag(html, 'class="chart-frame waterfall"')).toContain(`style="height:${chartHeights.lg}px"`);
    const rows = rowsOf(element(html, 'class="data-alternative"')!);
    const netRevenue = data.rows[0].value;
    expect(buttonTexts(rows[1])).toEqual([formatEmpty("missing")]);
    expect(profitRowAmount(data.rows[1])).toBe(formatEmpty("missing"));
    expect(profitRowShare(data.rows[1], netRevenue)).toBe(formatEmpty("missing"));
    expect(rows[1]).toContain(`<td class="num">${formatEmpty("missing")}</td>`);
    // 其他費用照列金額與佔比。
    expect(buttonTexts(rows[3])).toEqual([formatAmountL3(metrics.platform_fees.value)]);
    expect(profitRowShare(data.rows[3], netRevenue)).toBe(formatRateL2(data.rows[3].share));
  });

  it("四態等高（C16）：有資料、缺值、範圍不在本期資料中（全部資料待補）的外框都是 320px", () => {
    for (const bars of [profitWaterfall(demo.snapshot, "all").bars, profitWaterfall(golden.snapshot, "UNKNOWN").bars, [] as WaterfallBar[]]) {
      const html = renderToStaticMarkup(createElement(WaterfallSvg, { bars, height: chartHeights.lg }));
      expect(openTag(html, 'class="chart-frame waterfall"')).toContain(`style="height:${chartHeights.lg}px"`);
      expect(html).toContain(`height="${chartHeights.lg}"`);
    }
  });
});

describe("WaterfallSvg 幾何（C17、§9.5）", () => {
  /** 由刻度反推每元的像素（刻度是等距的整齊數字）。 */
  const pxPerUnit = (ticks: { value: number; y: number }[]) => (ticks[0].y - ticks[1].y) / (ticks[1].value - ticks[0].value);

  it("Y 軸從 0 起、刻度是整數萬元（≥ 1 萬時）或元；柱高與水位成比例；連接線接在前一根的 end 水位", () => {
    for (const { snapshot } of both()) for (const bars of [bridgeWaterfall(snapshot).bars, profitWaterfall(snapshot, "all").bars]) {
      const geometry = waterfallGeometry(bars, 800, chartHeights.lg);
      expect(geometry.ticks[0].value).toBe(0);
      expect(geometry.ticks[0].label).toBe("0");
      expect(geometry.ticks[0].y).toBe(geometry.zeroY);
      const step = geometry.ticks[1].value - geometry.ticks[0].value;
      expect(geometry.ticks.map(tick => tick.label)).toEqual(waterfallTickLabels(geometry.ticks.map(tick => tick.value), step));
      const scale = pxPerUnit(geometry.ticks);
      for (const shape of geometry.shapes) {
        const start = shape.bar.kind === "delta" ? Number(shape.bar.start) : 0;
        const end = Number(shape.bar.end);
        const expected = Math.abs(end - start) * scale;
        expect(Math.abs(shape.rect!.height - Math.max(expected, 1)), shape.bar.id).toBeLessThan(0.25);
        if (shape.bar.kind !== "delta") expect(Math.abs(shape.rect!.y + shape.rect!.height - geometry.zeroY), shape.bar.id).toBeLessThan(0.25);
      }
      expect(geometry.connectors).toHaveLength(bars.length - 1);
      geometry.connectors.forEach((line, index) => {
        expect(Math.abs(line.y - (geometry.zeroY - Number(bars[index].end) * scale)), line.key).toBeLessThan(0.25);
        expect(line.x1).toBeLessThan(line.x2);
      });
    }
    const demoTicks = waterfallGeometry(bridgeWaterfall(demo.snapshot).bars, 800, chartHeights.lg).ticks;
    expect(demoTicks.slice(1).every(tick => tick.value % 10_000 === 0 && tick.label === fill(labels.units.wan, { value: String(tick.value / 10_000) }))).toBe(true);
  });

  it("負水位往下畫：起點與終點都為負時，柱從 start 畫到 end、起訖柱從 0 往下", () => {
    const bar = (id: string, kind: WaterfallBar["kind"], value: string, start: string, end: string, tone: WaterfallBar["tone"]): WaterfallBar => ({ id, metric: CM, label: id, shortLabel: id, kind, value, start, end, tone, display: kind === "delta" ? formatSignedDelta(value, "L1") : formatAmountL1(value), reasonCodes: [] });
    const bars = [bar("a", "total", "-100.00", "-100.00", "-100.00", "total"), bar("b", "delta", "-50.00", "-100.00", "-150.00", "unfavorable"), bar("c", "delta", "30.00", "-150.00", "-120.00", "favorable"), bar("d", "result", "-120.00", "-120.00", "-120.00", "result")];
    const geometry = waterfallGeometry(bars, 600, chartHeights.lg);
    const scale = pxPerUnit(geometry.ticks.slice().sort((a, b) => a.value - b.value));
    const y = (value: number) => geometry.zeroY - value * scale;
    expect(geometry.ticks.some(tick => tick.value === 0)).toBe(true);
    expect(geometry.ticks.every(tick => tick.value <= 0)).toBe(true);
    expect(geometry.ticks.filter(tick => tick.value < 0).every(tick => tick.label.startsWith(MINUS))).toBe(true);
    const [a, b, c, d] = geometry.shapes;
    expect(a.rect!.y).toBe(geometry.zeroY);
    expect(Math.abs(a.rect!.y + a.rect!.height - y(-100))).toBeLessThan(0.25);
    expect(Math.abs(b.rect!.y - y(-100))).toBeLessThan(0.25);
    expect(Math.abs(b.rect!.y + b.rect!.height - y(-150))).toBeLessThan(0.25);
    expect(Math.abs(c.rect!.y - y(-120))).toBeLessThan(0.25);
    expect(Math.abs(c.rect!.y + c.rect!.height - y(-150))).toBeLessThan(0.25);
    expect(d.rect!.y).toBe(geometry.zeroY);
    expect([a, b, c, d].map(shape => shape.value!.tone)).toEqual(["neg", "neg", "muted", "neg"]);
    expect(geometry.connectors.map(line => line.key)).toEqual(["a-b", "b-c", "c-d"]);
  });

  it("缺值：value 為 null 畫虛線框並標資料待補；value 有值但 start／end 為 null 不畫柱、不標值，只留 x 標籤", () => {
    const snap = structuredClone(golden.snapshot);
    snap.report.bridge.components.cogs_net = missing();
    const bars = bridgeWaterfall(snap).bars;
    const geometry = waterfallGeometry(bars, 800, chartHeights.lg);
    expect(geometry.shapes[4].rect!.dashed).toBe(true);
    expect(geometry.shapes[4].value!.tone).toBe("missing");
    expect(geometry.shapes[4].bar.display).toBe(formatEmpty("missing"));
    for (const shape of geometry.shapes.slice(5)) {
      expect(shape.bar.value, shape.bar.id).not.toBeNull();
      expect(shape.rect, shape.bar.id).toBeNull();
      expect(shape.value, shape.bar.id).toBeNull();
      expect(shape.xLabel.join("")).toBe(shape.bar.shortLabel);
    }
    expect(geometry.connectors.map(line => line.key)).toEqual(["previous-gross_sales", "gross_sales-discounts", "discounts-refunds"]);
  });

  it("柱寬約 60%、標值避讓：最小寬下相鄰標值不重疊；x 標籤放不下時從中間拆兩行", () => {
    for (const { snapshot } of both()) for (const [bars, width] of [[bridgeWaterfall(snapshot).bars, 520], [profitWaterfall(snapshot, "all").bars, 600]] as const) {
      const geometry = waterfallGeometry(bars, width, chartHeights.lg);
      const slot = (geometry.plot.right - geometry.plot.left) / bars.length;
      for (const shape of geometry.shapes) expect(Math.abs(shape.width - slot * 0.6)).toBeLessThan(0.1);
      const placed = geometry.shapes.filter(shape => shape.value).map(shape => ({ cx: shape.cx, y: shape.value!.y, text: shape.bar.display }));
      for (let index = 1; index < placed.length; index++) {
        const [left, right] = [placed[index - 1], placed[index]];
        const overlapX = right.cx - left.cx < 0.5 * (left.text.length + right.text.length) * 6;
        if (overlapX) expect(Math.abs(right.y - left.y), `${left.text} / ${right.text}`).toBeGreaterThanOrEqual(12);
      }
    }
    const cogs = metricDefinitions.cogs_net.shortLabel;
    expect(splitWaterfallLabel(cogs, 200)).toEqual([cogs]);
    const split = splitWaterfallLabel(cogs, 30);
    expect(split).toHaveLength(2);
    expect(split.join("")).toBe(cogs);
    const other = metricDefinitions.other_variable_costs.shortLabel;
    expect(splitWaterfallLabel(other, 40)).toEqual([Array.from(other).slice(0, 2).join(""), Array.from(other).slice(2).join("")]);
  });

  it("刻度文字：0 只寫「0」、萬元整數、負值 U+2212、不到 1 萬交給 formatAmountL1", () => {
    expect(waterfallTickLabels([0, 500_000, 1_000_000], 500_000)).toEqual(["0", fill(labels.units.wan, { value: "50" }), fill(labels.units.wan, { value: "100" })]);
    expect(waterfallTickLabels([-1_000_000, 0, 1_000_000], 1_000_000)).toEqual([`${MINUS}${fill(labels.units.wan, { value: "100" })}`, "0", fill(labels.units.wan, { value: "100" })]);
    expect(waterfallTickLabels([0, 5_000, 10_000], 5_000)).toEqual(["0", fill(labels.units.wan, { value: "0.5" }), fill(labels.units.wan, { value: "1.0" })]);
    expect(waterfallTickLabels([0, 500, 1_000], 500)).toEqual(["0", formatAmountL1("500.00"), formatAmountL1("1000.00")]);
  });
});

describe("B1 元件與樣式只用 token（PRD §9.5「元件內不得出現 hex」）", () => {
  const files = ["waterfall-svg.tsx", "bridge-section.tsx", "profit-section.tsx"].map(name => `src/components/overview/charts/${name}`);

  it("三個元件沒有 hex、沒有中文字串常值或 JSX 文字（字串都從 labels 取）", () => {
    for (const file of files) {
      const text = readFileSync(resolve(file), "utf8");
      expect(text, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      const scan = scanTsxText(text, file);
      expect(scan.hex, file).toEqual([]);
      expect(scan.jsxCjk, file).toEqual([]);
      expect(scan.cjkLiterals, file).toEqual([]);
      expect(scan.fontSize, file).toEqual([]);
    }
  });

  it("渲染出來的瀑布只用 chart-theme 的 var() 色：rect 的 fill／stroke、格線與連接線", () => {
    const allowed = new Set<string>([...Object.values(chartColors), "none"]);
    for (const html of [renderBridge(demo.snapshot), renderProfit(demo.snapshot)]) {
      const svg = element(html, 'class="waterfall-svg"')!;
      for (const match of svg.matchAll(/\s(fill|stroke)="([^"]*)"/g)) expect(allowed.has(match[2]), match[0]).toBe(true);
    }
  });

  it("globals.css 錨點 B1 的規則只用 token：沒有 hex，字級 var(--text-*)，圓角 var(--radius-*)", () => {
    const css = readFileSync(resolve("src/app/globals.css"), "utf8");
    const start = css.indexOf("/* ── V3-4b 錨點 B1");
    const end = css.indexOf("/* ── V3-4b 錨點 B2");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const scan = scanCssText(css.slice(start, end), "globals.css#B1");
    expect(scan.hex).toEqual([]);
    for (const entry of scan.fontSize as { value: string }[]) expect(entry.value).toMatch(/^(var\(--text-\d+\)|inherit)$/);
    for (const entry of scan.borderRadius as { value: string }[]) expect(entry.value).toMatch(/^var\(--radius-[a-z]+\)$/);
    expect(scan.boxShadow).toEqual([]);
  });
});

