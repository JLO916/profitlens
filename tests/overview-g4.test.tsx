import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Decimal from "decimal.js";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { checkChartMarkup, SSR_RULES } from "../scripts/lib/chart-scan.mjs";
import { scanCssText } from "../scripts/lib/ui-scan.mjs";
import { channelConclusion } from "../src/application/chart-takeaways";
import { chartColors } from "../src/application/chart-theme";
import { metricComparison } from "../src/application/manager-summary";
import { deltaTone, formatAxisWan, formatEmpty, formatSignedDelta, metricDefinitions } from "../src/application/presentation";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "../src/application/workspace";
import { BarCell, barCellFill, barCellGeometry, barCellScale, BAR_CELL_HEIGHT, BAR_CELL_WIDTH } from "../src/components/charts/bar-cell";
import type { EvidenceSelection } from "../src/components/evidence-drawer";
import { Overview } from "../src/components/overview";
import { axisTicks } from "../src/components/overview/charts/chart-frame";
import { channelAxis, channelChangeEvidence, channelChangeText, channelEvidence, ChannelSection } from "../src/components/overview/charts/channel-section";
import type { Metric } from "../src/domain/types";
import { validateDataset } from "../src/domain/validation";
import { fill, labels } from "../src/i18n";
import { fixture } from "./helpers/fixtures";
import { byTestId, element, escapeAttr } from "./helpers/markup";

// V4-2 代理 B：G4 各通路緊湊表差額欄與 C24 差額條（PRD §4.1–4.7 G4、§7.1、§7.2、§7.6、§8.7；CHART_CATALOG G4；D-V4-16＝A、D-V4-14）的 SSR 結構測試。
// 差額欄在 table.channel-kv 的第四欄（td.channel-change）：L2 帶號的 number-link，前面是 variance 條 chart-overview-channels-bar-{通路代號}；
// 條長＝|差額| ÷ 各通路 |差額| 最大值（barCellScale）、不利 chartColors.unfavorable、有利 chartColors.total（不用和上期長條同為 gray-400 的 chartColors.favorable）。
// 差額由本測試用 Decimal 從 report 的兩期精確字串獨立算出（不經 compareMoney），再與畫面、抽屜比對；抽屜：條與差額 number-link 同一個 builder（channelChangeEvidence，
// 帶兩期 components），長條沿用 channelEvidence（水準值，不帶 components）。點擊用「在 React render 內呼叫 ChannelSection 取回元素樹」拿 onClick（SSR 不輸出事件處理器）。

const CM = "contribution_after_marketing" as const;
const TESTID = (channel: string) => `chart-overview-channels-bar-${channel}`;
const copy = labels.overview.channelsV3, chartsCopy = labels.overview.chartsV4.channels;
const noop = () => undefined;

async function load(name: string): Promise<WorkspaceSnapshot> {
  const input = fixture(name);
  const dataset = validateDataset(input).dataset!;
  return createSnapshot(dataset, {}, await hashInput(input));
}
const snapshots: Record<"golden" | "demo" | "zeroAd" | "refundOnly", WorkspaceSnapshot> = {} as never;
beforeAll(async () => {
  Object.assign(snapshots, { golden: await load("golden"), demo: await load("demo"), zeroAd: await load("zero_ad"), refundOnly: await load("refund_only") });
});
afterEach(() => { vi.unstubAllGlobals(); });

const renderChannel = (snapshot: WorkspaceSnapshot) => renderToStaticMarkup(createElement(ChannelSection, { snapshot, onEvidence: noop }));
const renderOverview = (snapshot: WorkspaceSnapshot) => renderToStaticMarkup(createElement(Overview, { snapshot, onEvidence: noop, datasetName: "demo", missingItems: 0, actionsSummary: { pending: 0, pinned: [] } }));
/** 開始標籤的屬性（只取第一個元素）。 */
const attrs = (html: string) => Object.fromEntries([...html.slice(0, html.indexOf(">")).matchAll(/\s([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
/** 緊湊表的資料列（略過表頭列），順序同 report.scope.channels。 */
const kvRows = (html: string) => element(byTestId(html, "channel-mix"), 'class="kv channel-kv"')!.match(/<tr>[\s\S]*?<\/tr>/g)!.slice(1);
/** 一列的差額格（td.channel-change）。 */
const changeCell = (tr: string) => element(tr, 'class="num channel-change')!;
/** 獨立手算的差額：本期 − 上期（Decimal，兩期任一缺值為 null）。 */
function handChange(snapshot: WorkspaceSnapshot, channel: string): string | null {
  const previous = snapshot.report.previous.channels[channel].metrics[CM].value, current = snapshot.report.current.channels[channel].metrics[CM].value;
  return previous === null || current === null ? null : new Decimal(current).minus(previous).toFixed(2);
}
/** 把某通路某期的扣廣告後貢獻換成缺值（深拷貝，不動原快照）。 */
function withMissing(snapshot: WorkspaceSnapshot, channel: string, period: "previous" | "current"): WorkspaceSnapshot {
  const copied = structuredClone(snapshot);
  copied.report[period].channels[channel].metrics[CM] = { value: null, reason_codes: ["MISSING_VALUE"] };
  return copied;
}

/** 在 React render 內呼叫 ChannelSection（useMemo 隨外層元件執行），取回它回傳的元素樹。 */
function channelTree(snapshot: WorkspaceSnapshot, onEvidence: (evidence: EvidenceSelection) => void): ReactElement {
  let tree: ReactElement | null = null;
  function Capture() { tree = ChannelSection({ snapshot, onEvidence }) as ReactElement; return null; }
  renderToStaticMarkup(createElement(Capture));
  return tree!;
}
/** 走訪元素樹（children 與 ChartFrame 的 after），依出現順序回傳所有元素。 */
function elementsOf(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elementsOf);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  const { children, after } = node.props;
  return [node, ...elementsOf(after as ReactNode), ...elementsOf(children as ReactNode)];
}
/** 緊湊表每一列（依通路）差額格的條與 number-link 的 onClick，以及本期金額 number-link 的 onClick。 */
function changeHandlers(tree: ReactElement, channels: readonly string[]) {
  const table = elementsOf(tree).find(item => item.type === "table" && item.props.className === "kv channel-kv")!;
  const rows = elementsOf(table.props.children as ReactNode).filter(item => item.type === "tr").slice(1);
  expect(rows).toHaveLength(channels.length);
  return new Map(rows.map((tr, index) => {
    const cells = elementsOf(tr.props.children as ReactNode).filter(item => item.type === "td");
    const change = elementsOf(cells[2].props.children as ReactNode);
    const bar = change.find(item => item.type === BarCell);
    const link = change.find(item => item.type === "button")!;
    const amount = elementsOf(cells[0].props.children as ReactNode).find(item => item.type === "button")!;
    return [channels[index], { bar: bar?.props.onClick as (() => void) | undefined, link: link.props.onClick as () => void, amount: amount.props.onClick as () => void }];
  }));
}

describe("G4 緊湊表差額欄：結構與掛載（PRD §4.5、§4.7；CHART_CATALOG G4）", () => {
  it("golden／demo／zero_ad／refund_only：表頭第四欄「差額（元）」（沿用 channelsV3.dataTable.change）；每個通路一列、四格，差額格是 td.num.channel-change；條數＝差額有值的通路數，testid 用通路代號、整頁各一個", () => {
    for (const [name, snapshot] of Object.entries(snapshots)) {
      const html = renderOverview(snapshot);
      const kv = element(byTestId(html, "channel-mix"), 'class="kv channel-kv"')!;
      expect(kv, name).toContain(`<th scope="col" class="num">${copy.table.margin}</th><th scope="col" class="num">${copy.dataTable.change}</th></tr></thead>`);
      const rows = kvRows(html);
      const channels = snapshot.report.scope.channels;
      expect(rows, name).toHaveLength(channels.length);
      let bars = 0;
      for (const [index, channel] of channels.entries()) {
        const tr = rows[index];
        expect((tr.match(/<td\b/g) ?? []).length, `${name} ${channel}`).toBe(3);
        const cell = changeCell(tr);
        expect((cell.match(/<button\b/g) ?? []).length, `${name} ${channel}`).toBe(1);
        if (handChange(snapshot, channel) === null) { expect(cell, `${name} ${channel}`).not.toContain("<svg"); continue; }
        bars++;
        expect(cell, `${name} ${channel}`).toContain(`data-testid="${TESTID(channel)}"`);
        // 條在數字之前（DOM 順序；390 由 CSS 排成獨立一行）。
        expect(cell.indexOf("<svg"), `${name} ${channel}`).toBeLessThan(cell.indexOf('<button type="button" class="number-link"'));
        expect(html.split(`data-testid="${TESTID(channel)}"`), `${name} ${channel}：整頁恰好一個`).toHaveLength(2);
      }
      expect((html.match(/data-testid="chart-overview-channels-bar-/g) ?? []).length, name).toBe(bars);
      // 條只在緊湊表內，不在 Recharts 圖框（aria-hidden 的 .chart-frame）或五欄資料表裡。
      expect(element(byTestId(html, "channel-mix"), "<details")!, name).not.toContain("chart-overview-channels-bar-");
    }
  });

  it("條本身 aria-hidden、focusable=false、沒有 tabindex、沒有文字與 role；data-chart-kind=\"cell\"、可點（is-clickable）；鍵盤路徑是同格的 number-link", () => {
    const html = renderChannel(snapshots.demo);
    for (const channel of snapshots.demo.report.scope.channels) {
      const svg = byTestId(html, TESTID(channel));
      const tag = attrs(svg);
      expect(tag["aria-hidden"], channel).toBe("true");
      expect(tag.focusable, channel).toBe("false");
      expect(tag["data-chart-kind"], channel).toBe("cell");
      expect(tag.class, channel).toBe("bar-cell is-variance is-clickable");
      expect(svg, channel).not.toMatch(/tabindex|role=|<text|<title|<a\b|<button/i);
      expect(svg.replace(/<[^>]*>/g, ""), channel).toBe("");
    }
  });

  it("chart-lint 的 SSR 規則（CL-1、CL-2、CL-9、CL-11）對各通路區塊與整個總覽 0 違規", () => {
    for (const snapshot of Object.values(snapshots)) {
      for (const html of [renderChannel(snapshot), renderOverview(snapshot)]) {
        const { violations } = checkChartMarkup(`<main id="main-content">${html}</main>`, { page: "overview" });
        for (const rule of SSR_RULES) expect(violations[rule], rule).toEqual([]);
      }
    }
  });
});

describe("G4 差額欄的值與編碼：獨立手算、共同尺度、只有不利上色（PRD §4.3、§4.4、§7.1、§7.2）", () => {
  it("差額＝本期 − 上期（到分，Decimal 獨立手算）；number-link 顯示 L2 帶號、可及名稱含畫面上的值；不利時 td 帶 negative", () => {
    for (const snapshot of [snapshots.golden, snapshots.demo, snapshots.zeroAd]) {
      const rows = kvRows(renderChannel(snapshot));
      const conclusion = channelConclusion(snapshot);
      for (const [index, channel] of snapshot.report.scope.channels.entries()) {
        const change = handChange(snapshot, channel)!;
        expect(channelChangeEvidence(snapshot, channel).metric.value, channel).toBe(change);
        const shown = formatSignedDelta(change, "L2");
        expect(channelChangeText({ value: change, reason_codes: [] }), channel).toBe(shown);
        const cell = changeCell(rows[index]);
        const aria = fill(chartsCopy.changeAria, { channel: conclusion.rows[index].label, metric: metricDefinitions[CM].label, value: shown });
        expect(cell, channel).toContain(`<button type="button" class="number-link" aria-label="${escapeAttr(aria)}">${shown}</button>`);
        expect(aria, channel).toContain(shown);
        expect(cell.startsWith('<td class="num channel-change negative">'), channel).toBe(deltaTone(CM, change, "L2") === "unfavorable");
      }
    }
  });

  it("示範資料：官網 +183,437（有利，灰 chartColors.total、往右）、平台 −782,271（不利色、往左、滿半寬）；兩通路差額相加＝fixtures/demo 合計的兩期差額 −598,833.95", () => {
    const demo = snapshots.demo;
    expect(handChange(demo, "DTC")).toBe("183436.86");
    expect(handChange(demo, "MARKETPLACE")).toBe("-782270.81");
    const summary = JSON.parse(readFileSync(resolve("fixtures/demo/computed_summary.json"), "utf8")) as Record<"previous" | "current", Record<string, string>>;
    const total = new Decimal(summary.current[CM]).minus(summary.previous[CM]);
    expect(total.toFixed(2)).toBe("-598833.95");
    expect(new Decimal(handChange(demo, "DTC")!).plus(handChange(demo, "MARKETPLACE")!).toFixed(2)).toBe(total.toFixed(2));
    const html = renderChannel(demo);
    const dtc = attrs(element(byTestId(html, TESTID("DTC")), "<rect")!);
    const marketplace = attrs(element(byTestId(html, TESTID("MARKETPLACE")), "<rect")!);
    expect(dtc.fill).toBe(chartColors.total);
    expect(dtc.fill).not.toBe(chartColors.favorable);
    expect(dtc.fill).not.toBe(chartColors.previous);
    expect(Number(dtc.x)).toBe(BAR_CELL_WIDTH / 2);
    expect(marketplace.fill).toBe(chartColors.unfavorable);
    expect(Number(marketplace.width)).toBe(BAR_CELL_WIDTH / 2);
    expect(Number(marketplace.x)).toBe(0);
    expect(Number(dtc.width)).toBeLessThan(Number(marketplace.width));
    const rows = kvRows(html);
    expect(changeCell(rows[0])).toContain(`>${formatSignedDelta("183436.86", "L2")}</button>`);
    expect(changeCell(rows[1])).toContain(`>${formatSignedDelta("-782270.81", "L2")}</button>`);
  });

  it("每條的幾何＝barCellGeometry（共同尺度＝各通路 |差額| 最大值）；色＝barCellFill(deltaTone(L2), \"total\")；零線同一個 x", () => {
    for (const snapshot of [snapshots.golden, snapshots.demo, snapshots.zeroAd]) {
      const html = renderChannel(snapshot);
      const channels = snapshot.report.scope.channels;
      const max = barCellScale(channels.map(channel => handChange(snapshot, channel)));
      expect(max).not.toBeNull();
      for (const channel of channels) {
        const value = handChange(snapshot, channel)!;
        const svg = byTestId(html, TESTID(channel));
        const tone = deltaTone(CM, value, "L2");
        const geometry = barCellGeometry({ mode: "variance", value, max });
        expect(attrs(svg), channel).toMatchObject({ viewBox: `0 0 ${BAR_CELL_WIDTH} ${BAR_CELL_HEIGHT}`, "data-tone": tone, preserveAspectRatio: "none" });
        expect(attrs(element(svg, "<line")!), channel).toMatchObject({ x1: String(BAR_CELL_WIDTH / 2), x2: String(BAR_CELL_WIDTH / 2), stroke: chartColors.axis });
        if (geometry.bar === null) { expect(svg, channel).not.toContain("<rect"); continue; }
        expect(attrs(element(svg, "<rect")!), channel).toMatchObject({ x: String(geometry.bar.x), width: String(geometry.bar.width), fill: barCellFill(tone, "total") });
        expect(geometry.direction, channel).toBe(value.startsWith("-") ? "left" : "right");
        // 只有不利上色（D-V3-7）；有利用 chartColors.total（同框的上期長條是 chartColors.previous＝gray-400，與 chartColors.favorable 同色）。
        expect(barCellFill(tone, "total") === chartColors.unfavorable, channel).toBe(tone === "unfavorable");
        if (tone === "favorable") expect(barCellFill(tone, "total"), channel).toBe(chartColors.total);
      }
    }
  });

  it("缺值：任一期扣廣告後貢獻缺值時不畫條，格內寫「資料待補」（number-link，可及名稱用 changeEmptyAria、不加「元」），td 不帶 negative；其餘通路照畫、尺度只取有值的通路", () => {
    for (const period of ["previous", "current"] as const) {
      const snapshot = withMissing(snapshots.demo, "MARKETPLACE", period);
      const html = renderChannel(snapshot);
      const rows = kvRows(html);
      const cell = changeCell(rows[1]);
      const missing = formatEmpty("missing");
      expect(channelChangeEvidence(snapshot, "MARKETPLACE").metric.value, period).toBeNull();
      expect(channelChangeText(channelChangeEvidence(snapshot, "MARKETPLACE").metric), period).toBe(missing);
      expect(cell, period).not.toContain("<svg");
      expect(cell.startsWith('<td class="num channel-change">'), period).toBe(true);
      const aria = fill(chartsCopy.changeEmptyAria, { channel: channelConclusion(snapshot).rows[1].label, metric: metricDefinitions[CM].label, value: missing });
      expect(cell, period).toContain(`aria-label="${escapeAttr(aria)}">${missing}</button>`);
      expect(html.match(/data-testid="chart-overview-channels-bar-/g), period).toHaveLength(1);
      // 唯一有值的官網：自己就是最大值，滿半寬。
      expect(Number(attrs(element(byTestId(html, TESTID("DTC")), "<rect")!).width), period).toBe(BAR_CELL_WIDTH / 2);
    }
  });

  it("refund_only：兩期扣廣告後貢獻相同時差額 0，條只畫零線、tone 為 neutral、數字不帶正負號", () => {
    const snapshot = snapshots.refundOnly;
    const html = renderChannel(snapshot);
    for (const [index, channel] of snapshot.report.scope.channels.entries()) {
      const change = handChange(snapshot, channel);
      if (change === null || !new Decimal(change).isZero()) continue;
      const svg = byTestId(html, TESTID(channel));
      expect(svg, channel).not.toContain("<rect");
      expect(attrs(svg)["data-tone"], channel).toBe("neutral");
      expect(changeCell(kvRows(html)[index]), channel).toContain(`>${formatSignedDelta(change, "L2")}</button>`);
    }
  });
});

describe("G4 可追溯性與分析事件（PRD §4.5、§8.7、D-V4-14）", () => {
  it("channelChangeEvidence＝metricComparison(...).evidence.change 加 filter.channel：差額公式、components＝[上期, 本期]（兩期水準值）、期間＝上期起日到本期迄日、範圍＝單一通路", () => {
    for (const snapshot of [snapshots.golden, snapshots.demo, snapshots.zeroAd, snapshots.refundOnly]) {
      const { report } = snapshot;
      for (const channel of report.scope.channels) {
        const evidence = channelChangeEvidence(snapshot, channel);
        expect(evidence, channel).toEqual({ ...metricComparison(snapshot, CM, channel).evidence.change, filter: { channel } });
        expect(evidence.name, channel).toBe(CM);
        expect(evidence.formula, channel).toBeTruthy();
        expect(evidence.components, channel).toEqual([
          { label: labels.shell.periods.previous, metric: report.previous.channels[channel].metrics[CM] },
          { label: labels.shell.periods.current, metric: report.current.channels[channel].metrics[CM] },
        ]);
        expect(evidence.period, channel).toEqual({ start: report.previous.period.start, end: report.current.period.end });
        expect(evidence.channels, channel).toEqual([channel]);
        expect(evidence.filter, channel).toEqual({ channel });
        expect(evidence.metric.value, channel).toBe(handChange(snapshot, channel));
      }
    }
    // 未知通路（防呆）：缺值差額、不丟錯，範圍與篩選仍是該通路。
    expect(channelChangeEvidence(snapshots.demo, "UNKNOWN")).toMatchObject({ name: CM, metric: { value: null }, sources: [], channels: ["UNKNOWN"], filter: { channel: "UNKNOWN" } });
  });

  it("兩個 builder 分開：長條（channelEvidence）是該期水準值，不帶 components 與 formula（抽屜大數字不帶正負號、畫四層階梯，與 v3 相同）；差額的 builder 一定帶 components", () => {
    for (const channel of snapshots.demo.report.scope.channels) {
      for (const period of ["previous", "current"] as const) {
        const level = channelEvidence(snapshots.demo, channel, period);
        expect(level, `${channel} ${period}`).not.toHaveProperty("components");
        expect(level, `${channel} ${period}`).not.toHaveProperty("formula");
        expect(level.metric, `${channel} ${period}`).toBe(snapshots.demo.report[period].channels[channel].metrics[CM]);
      }
      expect(channelChangeEvidence(snapshots.demo, channel).components, channel).toHaveLength(2);
    }
  });

  it("點差額條與點同格 number-link 開同一個抽屜（onEvidence 收到的物件 toEqual，且等於 channelChangeEvidence）；本期金額 number-link 仍是 channelEvidence（水準值）", () => {
    for (const snapshot of [snapshots.golden, snapshots.demo, withMissing(snapshots.demo, "MARKETPLACE", "previous")]) {
      const received: EvidenceSelection[] = [];
      const handlers = changeHandlers(channelTree(snapshot, evidence => received.push(evidence)), snapshot.report.scope.channels);
      for (const channel of snapshot.report.scope.channels) {
        const handler = handlers.get(channel)!;
        received.length = 0;
        if (handChange(snapshot, channel) === null) {
          expect(handler.bar, channel).toBeUndefined();
          handler.link();
          expect(received, channel).toEqual([channelChangeEvidence(snapshot, channel)]);
          continue;
        }
        handler.bar!();
        handler.link();
        expect(received, channel).toHaveLength(2);
        expect(received[0], channel).toEqual(received[1]);
        expect(received[0], channel).toEqual(channelChangeEvidence(snapshot, channel));
        received.length = 0;
        handler.amount();
        expect(received, channel).toEqual([channelEvidence(snapshot, channel, "current")]);
      }
    }
  });

  it("點條記 chart_clicked 一次（payload 只有 name）；點同格 number-link 不記；沒有 window.va 時不丟錯", () => {
    const va = vi.fn();
    vi.stubGlobal("window", { va });
    const handlers = changeHandlers(channelTree(snapshots.demo, noop), snapshots.demo.report.scope.channels);
    handlers.get("MARKETPLACE")!.link();
    expect(va).not.toHaveBeenCalled();
    handlers.get("MARKETPLACE")!.bar!();
    expect(va).toHaveBeenCalledTimes(1);
    expect(va).toHaveBeenCalledWith("event", { name: "chart_clicked" });
    expect(Object.keys(va.mock.calls[0][1])).toEqual(["name"]);
    vi.unstubAllGlobals();
    expect(() => handlers.get("DTC")!.bar!()).not.toThrow();
  });
});

describe("G4 刻度：formatAxisWan（PRD §4.4 G4、§6.4、§7.2）", () => {
  it("範圍與刻度沿用 axisTicks（含 0、不向外延伸）；刻度文字＝formatAxisWan(ticks, 步長)；示範資料步長是整萬，沒有「.0 萬」也沒有小數", () => {
    for (const snapshot of Object.values(snapshots)) {
      const values = channelConclusion(snapshot).rows.flatMap(row => [row.previous, row.current].map((metric: Metric) => metric.value === null ? null : Number(metric.value)));
      const axis = channelAxis(values);
      const scale = axisTicks(values);
      expect(axis.domain).toEqual(scale.domain);
      expect(axis.ticks).toEqual(scale.ticks);
      expect(axis.labels).toEqual(formatAxisWan(scale.ticks, axis.step));
      expect(axis.labels[axis.ticks.indexOf(0)]).toBe("0");
      for (const text of axis.labels) expect(text).not.toMatch(/\.0\s*萬/);
    }
    const demoValues = channelConclusion(snapshots.demo).rows.flatMap(row => [Number(row.previous.value), Number(row.current.value)]);
    const demo = channelAxis(demoValues);
    expect(demo.step % 10_000).toBe(0);
    for (const text of demo.labels) expect(text).not.toContain(".");
    const wan = fill(labels.format.units.wan, { value: "" }).trim();
    expect(demo.labels.slice(1).every(text => text.endsWith(wan))).toBe(true);
  });

  it("只有一個刻度（全部缺值或全為 0）時步長為 1、刻度只有「0」", () => {
    expect(channelAxis([null, null])).toEqual({ domain: [0, 1], ticks: [0], step: 1, labels: ["0"] });
  });
});

describe("globals.css「V4-2 B」錨點與元件規則", () => {
  const css = readFileSync(resolve("src/app/globals.css"), "utf8");
  const start = css.indexOf("/* ── V4-2 B：");
  const end = css.indexOf("/* ── V4-2 B 錨點結束 ── */");
  const block = css.slice(start, end);
  const rules = block.replace(/\/\*[\s\S]*?\*\//g, "").trim();

  it("≤ 767 時差額條改成獨立一行、靠右（display: block、float: none、margin-left auto）；≥ 768 沒有規則（沿用「V4-1 B」：條與數字同一行）；不藏條", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(rules.startsWith("@media (max-width: 767px) {")).toBe(true);
    expect(rules).toContain(".chart-section .channel-kv td.channel-change > .bar-cell { display: block; float: none; margin: 0 0 var(--space-1) auto; }");
    expect(rules).not.toMatch(/display:\s*none|visibility:\s*hidden/);
  });

  it("只用 token（本段沒有色碼、字級、圓角、陰影、var(--chart-*)）；元件不依視窗寬度條件渲染、沒有 var(--chart- 字串常值與色碼", () => {
    const scan = scanCssText(block, "globals.css#V4-2-B");
    for (const key of ["hex", "fontSize", "borderRadius", "boxShadow"] as const) expect(scan[key], key).toEqual([]);
    expect(rules).not.toContain("var(--chart-");
    const source = readFileSync(resolve("src/components/overview/charts/channel-section.tsx"), "utf8");
    expect(source).not.toMatch(/matchMedia|innerWidth|useMediaQuery/);
    expect(source).not.toContain("var(--chart-");
    expect(source).toContain('favorableFill="total"');
  });
});
