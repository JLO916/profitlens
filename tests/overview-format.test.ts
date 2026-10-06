import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { assistKpis } from "../src/application/assist-kpi";
import { buildManagerSummary } from "../src/application/manager-summary";
import { formatHeadlineAmount } from "../src/application/copy";
import { deltaTone, deltaWord, formatAmountL2, formatAmountL3, formatGrowth, formatMetric, formatRateChange, formatSignedDelta, metricDefinitions, MINUS } from "../src/application/presentation";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "../src/application/workspace";
import { ChannelWideTable } from "../src/components/channel-table";
import { Overview } from "../src/components/overview";
import { toneClass } from "../src/components/top-three";
import { compareMoney } from "../src/domain/metrics";
import { validateDataset } from "../src/domain/validation";
import { AMOUNT_FIELDS } from "../src/domain/types";
import { fill, labels } from "../src/i18n";
import { fixture } from "./helpers/fixtures";
import { byTestId, escapeAttr, textOf } from "./helpers/markup";

// V3-2b 數字格式接到總覽與通路表（PRD §3.3、§7.1、§8.5）：KPI 與輔助指標 L1、期間合計與日均 L2、橋接 L3、通路表 L2。
// 所有期待值都由格式化函式從 snapshot 的精確字串算出，不寫死數字（golden：本期扣廣告後貢獻 255.00、差額 −315.00）。
async function snapshot(name = "golden"): Promise<WorkspaceSnapshot> {
  const input = fixture(name);
  const dataset = validateDataset(input).dataset!;
  return createSnapshot(dataset, {}, await hashInput(input));
}
const noop = () => undefined;
const render = (snap: WorkspaceSnapshot) => renderToStaticMarkup(createElement(Overview, { snapshot: snap, onEvidence: noop, periodOpen: true, datasetName: "golden", missingItems: 0, actionsSummary: { pending: 0, pinned: [] } }));
/** V3-4a：KPI 帶的格（<div class="kpi" data-testid="kpi-…">）與其他常用指標表的列（<tr data-testid="assist-…">）。 */
const card = (html: string, testid: string) => byTestId(html, testid);
const text = textOf;
const section = (html: string, marker: string, end = "</section>") => { const start = html.indexOf(marker); expect(start, marker).toBeGreaterThan(-1); return html.slice(start, html.indexOf(end, start)); };
const band = labels.overview.kpiBand;
const link = (aria: string, shown: string) => `<button type="button" class="number-link" aria-label="${escapeAttr(aria)}">${shown}</button>`;

describe("V3-2b overview KPI band uses L1 (萬／億, U+2212, growth only when previous > 0)", () => {
  it("money KPI: big number, 上期 and delta line are all L1 in the same cell; direction word + absolute amount; growth in parentheses", async () => {
    const snap = await snapshot();
    const html = render(snap);
    for (const name of ["net_revenue", "gross_profit", "contribution_before_marketing", "contribution_after_marketing"] as const) {
      const before = snap.report.previous.metrics[name], current = snap.report.current.metrics[name];
      const label = metricDefinitions[name].label;
      const body = card(html, `kpi-${name}`);
      const shown = formatMetric(name, current, "L1"), previousShown = formatMetric(name, before, "L1");
      expect(body, name).toContain(`<div class="kpi-value">${link(fill(band.valueAria, { metric: label, value: shown }), shown)}</div>`);
      expect(body, name).toContain(`<p class="kpi-prev">${labels.periods.previous} ${link(fill(band.previousAria, { metric: label, value: previousShown }), previousShown)}</p>`);
      const delta = compareMoney(before, current).absolute_change.value;
      const deltaText = fill(band.deltaLine, { word: deltaWord(name, delta, { previous: before.value, layer: "L1" }), amount: formatHeadlineAmount(delta) });
      expect(body, name).toContain(`<span class="dl-long">${band.vsPrevious}</span>${link(fill(band.deltaAria, { metric: label, delta: deltaText }), deltaText)}`);
      const growth = formatGrowth(current.value, before.value, "L1");
      if (growth === null) expect(body, name).not.toContain('class="pct"');
      else expect(body, name).toContain(`<span class="pct">${fill(labels.ui.overview.growthInline, { value: growth })}</span>`);
      // 只有不利上色（D-V3-7＝A），依 favorableDirection；有利或持平是無色的 positive。
      expect(body, name).toContain(`<div class="kpi-delta ${toneClass(deltaTone(name, delta, "L1"))}">`);
    }
  });

  it("golden contribution after marketing: −315.00 is unfavourable, shown as 少賺 + L1 amount; the growth rate carries U+2212 and no ASCII minus", async () => {
    const snap = await snapshot();
    const body = card(render(snap), "kpi-contribution_after_marketing");
    expect(snap.report.bridge.sum.value).toBe("-315.00");
    expect(body).toContain('<div class="kpi-delta negative">');
    expect(text(body)).toContain(fill(band.deltaLine, { word: labels.format.earnLess, amount: formatHeadlineAmount("-315.00") }));
    expect(formatSignedDelta("-315.00", "L1").startsWith(MINUS)).toBe(true);
    const growth = formatGrowth(snap.report.current.metrics.contribution_after_marketing.value, snap.report.previous.metrics.contribution_after_marketing.value, "L1")!;
    expect(growth.startsWith(MINUS)).toBe(true);
    expect(text(body)).toContain(growth);
    expect(text(body)).not.toMatch(/-\d/);
  });

  it("rate KPI shows 個百分點 from the exact difference and never a growth rate", async () => {
    const snap = await snapshot();
    const before = snap.report.previous.metrics.contribution_margin, current = snap.report.current.metrics.contribution_margin;
    const body = card(render(snap), "kpi-contribution_margin");
    const shown = formatMetric("contribution_margin", current, "L1");
    expect(body).toContain(`<div class="kpi-value">${link(fill(band.valueAria, { metric: metricDefinitions.contribution_margin.label, value: shown }), shown)}</div>`);
    expect(text(body)).toContain(formatRateChange(current.value, before.value, "L1"));
    expect(body).not.toContain('class="pct"');
    expect(body).not.toContain('class="dl-long"');
  });

  it("assist KPIs show their L1 display for both periods (C2 table rows, both cells are number-links)", async () => {
    const snap = await snapshot();
    const html = render(snap);
    const current = assistKpis(snap.report.current), previous = assistKpis(snap.report.previous);
    const columns = labels.overview.assistTable.columns;
    for (const [index, kpi] of current.entries()) {
      const body = card(html, `assist-${kpi.id}`);
      expect(body, kpi.id).toMatch(/^<tr data-testid=/);
      expect(body, kpi.id).toContain(`>${link(fill(labels.overview.assistTable.cellAria, { metric: kpi.label, period: columns.current, value: kpi.display }), kpi.display)}</td>`);
      expect(body, kpi.id).toContain(`>${link(fill(labels.overview.assistTable.cellAria, { metric: previous[index].label, period: columns.previous, value: previous[index].display }), previous[index].display)}</td>`);
    }
  });
});

describe("V3-2b overview tables: period totals L2, bridge L3 with rounding note", () => {
  it("期間合計與日均 uses integer yuan (L2) for totals, daily averages and daily deltas", async () => {
    const snap = await snapshot();
    const table = section(render(snap), 'data-testid="period-comparison"', "</details>");
    for (const name of ["net_revenue", "gross_profit", "contribution_before_marketing", "contribution_after_marketing"] as const) {
      expect(table, name).toContain(`>${formatAmountL2(snap.report.previous.metrics[name].value)}</button>`);
      expect(table, name).toContain(`>${formatAmountL2(snap.report.current.metrics[name].value)}</button>`);
      expect(table, name).toContain(`>${formatAmountL2(snap.report.comparison.current_daily_average[name].value)}</button>`);
      expect(table, name).toContain(`>${formatSignedDelta(snap.report.comparison.daily_average_changes[name].value, "L2")}</button>`);
    }
  });

  it("bridge summary, total and table are L3 to cents; the table ends with the rounding note", async () => {
    const snap = await snapshot();
    const bridge = section(render(snap), 'aria-labelledby="bridge-title"');
    expect(bridge).toContain(`>${formatAmountL3(snap.report.previous.metrics.contribution_after_marketing.value)}</button>`);
    expect(bridge).toContain(`>${formatAmountL3(snap.report.current.metrics.contribution_after_marketing.value)}</button>`);
    expect(bridge).toContain(`<button class="number-link negative">${formatSignedDelta("-315.00", "L3")}</button>`);
    for (const field of AMOUNT_FIELDS) expect(bridge, field).toContain(`>${formatSignedDelta(snap.report.bridge.components[field].value, "L3")}</button>`);
    expect(bridge).toContain(`<tfoot><tr><td colSpan="4" class="note">${labels.format.roundingNote}</td></tr></tfoot>`);
  });

  it("channel mix panel: unit written once, per-channel amounts L2", async () => {
    const snap = await snapshot();
    const panel = section(render(snap), 'aria-labelledby="channel-title"');
    expect(panel).toContain(`<span class="unit">${labels.ui.overview.kpiHint}</span>`);
    expect(panel).not.toContain("TWD");
    for (const [channel, row] of Object.entries(snap.report.current.channels)) expect(panel, channel).toContain(`>${formatAmountL2(row.metrics.contribution_after_marketing.value)}</button>`);
  });
});

describe("V3-2b channel wide table (健檢、會議摘要) is L2", () => {
  it("integer yuan, signed deltas, unit once in the caption, only unfavourable deltas coloured", async () => {
    const snap = await snapshot();
    const summary = buildManagerSummary(snap);
    const html = renderToStaticMarkup(createElement(ChannelWideTable, { summary, onEvidence: noop, ariaLabel: labels.sections.channelTableAria, caption: labels.sections.channelTableCaption }));
    expect(html).toContain(`<caption>${fill(labels.ui.channelTable.unitCaption, { caption: labels.sections.channelTableCaption })}</caption>`);
    for (const row of summary.channels) for (const metric of [row.revenue, row.contribution]) {
      expect(html).toContain(`>${formatAmountL2(metric.evidence.previous.metric.value)}</button>`);
      expect(html).toContain(`>${formatAmountL2(metric.evidence.current.metric.value)}</button>`);
      const change = metric.evidence.change.metric.value;
      expect(html).toContain(`<td class="${toneClass(deltaTone(metric.metric, change, "L2"))}"><button type="button" class="number-link" aria-label="${metric.evidence.change.title}">${formatSignedDelta(change, "L2")}</button></td>`);
    }
    expect(text(html)).not.toMatch(/-\d/);
  });
});
