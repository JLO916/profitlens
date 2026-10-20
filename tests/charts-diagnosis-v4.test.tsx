import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CHANNEL_WEEKS_VERSION } from "@/application/chart-channel-weeks";
import { DAILY_HEATMAP_MAX_CHANNELS, DAILY_HEATMAP_MAX_DAYS, DAILY_HEATMAP_VERSION, DAILY_HEATMAP_WORST, dailyHeatmap, type DailyHeatmap, type HeatValueCell } from "@/application/chart-heatmap";
import { chartHeights } from "@/application/chart-theme";
import { channelLabel, snapshotResolver } from "@/application/copy";
import { formatAmountL1, formatAmountL2, formatDateL1, formatHeatCell, formatPeriodL1, metricDefinitions } from "@/application/presentation";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import { heatMove, heatPositions, type HeatPosition, type HeatTableSpec } from "@/components/charts/heat-table";
import { HEAT_LAYOUT, HeatSection, heatCellEvidence, heatCellTestId, heatColumnsNeeded, heatEvidenceAt, heatSectionModel } from "@/components/diagnosis/heat-section";
import { Diagnosis } from "@/components/workspace-panels";
import type { AnalysisFilters, DatasetInput, Manifest } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { fill, labels } from "@/i18n";
import { fixture } from "./helpers/fixtures";
import { byTestId, element, openTag, textOf } from "./helpers/markup";
import { synthetic4ChannelInput } from "./helpers/synthetic-4-channel";

// V4-3b 健檢頁新圖的 SSR 結構測試（CHART_CATALOG §1.6：tests/charts-diagnosis-v4.test.tsx）。
// ── V4-3b 代理 A：G11 日 × 通路月曆熱表（PRD §4.1–§4.7 G11、§6.1 mode、§6.3 C28、§7.5、§8.1、§8.2；D-V4-17＝A）。
// 斷言只用 testid、labels 與格式化函式（數字不寫死成顯示字）；抽屜只斷言傳出的 EvidenceSelection（過濾結果由 tests/evidence-filter.test.ts 負責）。

const copy = labels.diagnosis.chartsV4.heat;
const METRIC_LABEL = metricDefinitions.contribution_after_marketing.label;
const HEAT = "chart-diagnosis-heat";

async function snapshotOf(input: DatasetInput, filters: AnalysisFilters = {}): Promise<WorkspaceSnapshot> {
  const dataset = validateDataset(input).dataset!;
  return createSnapshot(dataset, filters, await hashInput(input));
}
const renderDiagnosis = (snapshot: WorkspaceSnapshot) => renderToStaticMarkup(createElement(Diagnosis, { snapshot, onEvidence: () => undefined }));
const renderHeat = (snapshot: WorkspaceSnapshot) => renderToStaticMarkup(createElement(HeatSection, { snapshot, onEvidence: () => undefined }));
const count = (html: string, needle: string) => html.split(needle).length - 1;
const captions = (html: string) => [...html.matchAll(/<caption>([^<]*)<\/caption>/g)].map(match => match[1]);
const cellOf = (html: string, channel: string, key: string) => byTestId(html, heatCellTestId(channel, key));
const heatmapOf = (snapshot: WorkspaceSnapshot): DailyHeatmap => dailyHeatmap(snapshot).heatmap!;

const DAY_MS = 86_400_000;
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
/** 記憶體中的 N 通路 × D 天合成資料（不寫檔；數字同 tests/chart-channel-weeks.test.ts 的 helper，扣廣告後貢獻每天都是正的）。 */
function manyChannelsInput(channelCount: number, days: number): DatasetInput {
  const base = fixture("golden").manifest as Manifest;
  const start = "2026-01-01";
  const channels = Array.from({ length: channelCount }, (_, at) => `CH${String(at + 1).padStart(2, "0")}`);
  const dates = Array.from({ length: days * 2 }, (_, at) => shift(start, at));
  const sales = dates.flatMap((date, day) => channels.map((channel, at) => `${date},${channel},SKU-${at + 1},HOME,2,${(1000 + day + at).toFixed(2)},50.00,0.00,400.00,TWD`));
  const costs = dates.flatMap(date => channels.map(channel => `${date},${channel},30.00,10.00,20.00,5.00,TWD`));
  const ads = dates.flatMap(date => channels.map(channel => `${date},${channel},100.00,TWD`));
  return {
    manifest: {
      ...base, dataset_id: `synthetic-many-channels-${channelCount}x${days}`, data_as_of: shift(start, days * 2), coverage_start: start, coverage_end: shift(start, days * 2 - 1),
      channels, previous_period: { start, end: shift(start, days - 1) }, current_period: { start: shift(start, days), end: shift(start, days * 2 - 1) },
    },
    files: {
      "sales_daily.csv": ["date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency", ...sales].join("\n"),
      "channel_costs_daily.csv": ["date,channel,platform_fees,payment_fees,fulfillment_costs,other_variable_costs,currency", ...costs].join("\n"),
      "ad_spend_daily.csv": ["date,channel,ad_spend,currency", ...ads].join("\n"),
    },
  };
}

describe("G11 熱表：ChartFrame mode=\"table\" 的結構（示範資料）", () => {
  it("在健檢頁 G10 之後、通路寬表之前；section.chart-section（CL-9 第 2 張）；固定高 lg、不設 aria-hidden、data-mode=table；表在 .table-scroll[role=region][aria-labelledby=heat-title] 內，捲動區不加 tabindex；不另設 <details>", async () => {
    const html = renderDiagnosis(await snapshotOf(fixture("demo")));
    expect(html.indexOf('data-testid="chart-diagnosis-share"')).toBeLessThan(html.indexOf(`data-testid="${HEAT}"`));
    expect(html.indexOf(`data-testid="${HEAT}"`)).toBeLessThan(html.indexOf('data-testid="channel-compare"'));
    const section = byTestId(html, HEAT);
    expect(openTag(section, `data-testid="${HEAT}"`)).toBe(`<section class="panel chart-section heat-section" aria-labelledby="heat-title" aria-describedby="heat-sub" data-testid="${HEAT}">`);
    expect(openTag(section, 'class="chart-frame ')).toBe(`<div class="chart-frame lg heat" style="height:${chartHeights.lg}px" data-state="ready" data-mode="table">`);
    expect(openTag(section, 'class="table-scroll"')).toBe('<div class="table-scroll" role="region" aria-labelledby="heat-title">');
    expect(section).not.toContain("aria-hidden");
    expect(section).not.toContain("<details");
    expect(section).toContain('<h2 id="heat-title">');
    expect(section).toContain('<p class="sub" id="heat-sub">');
  });

  it("整張熱表只有 1 個 Tab 停留點：84 格（2 通路 × 42 天）都是 button.number-link，只有第一個有值的格 tabindex=0，其餘 −1；role=grid、th scope 齊全", async () => {
    const section = byTestId(renderDiagnosis(await snapshotOf(fixture("demo"))), HEAT);
    expect(count(section, "<button")).toBe(84);
    expect(count(section, 'class="number-link heat-link"')).toBe(84);
    expect(count(section, 'tabindex="0"')).toBe(1);
    expect(count(section, 'tabindex="-1"')).toBe(83);
    expect(cellOf(section, "MARKETPLACE", "2026-07-13")).toContain('tabindex="0"');
    expect(count(section, '<table class="heat-table" role="grid">')).toBe(2);
    expect(count(section, '<th scope="col">')).toBe(2 * 8);
    expect(count(section, '<th scope="row">')).toBe(2 * 6);
  });

  it("標題＝最差一天（「虧」＝取位到元後仍為負）；標題所指的通路（MARKETPLACE）排第一張；caption 寫通路與單位；欄頭是週與星期（從期間起日週一起）", async () => {
    const snapshot = await snapshotOf(fixture("demo"));
    const section = byTestId(renderDiagnosis(snapshot), HEAT);
    const anchor = snapshot.data_as_of;
    expect(textOf(element(section, 'id="heat-title"')!)).toBe(fill(copy.title.loss, { channel: channelLabel("MARKETPLACE", snapshotResolver(snapshot)), n: 32, date: formatDateL1("2026-08-22", { anchor }), amount: formatAmountL1("-4510.74") }));
    expect(captions(section)).toEqual(["MARKETPLACE", "DTC"].map(channel => fill(copy.caption, { channel: channelLabel(channel, snapshotResolver(snapshot)) })));
    const head = element(section, "<thead>")!;
    expect([...head.matchAll(/<th scope="col">([^<]*)<\/th>/g)].map(match => match[1])).toEqual([copy.weekHead, ...(["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const).map(day => copy.weekdays[day])]);
    const period = snapshot.report.current.period;
    const subtitle = element(section, 'id="heat-sub"')!;
    expect(subtitle).toContain(fill(copy.subtitle, { section: fill(copy.section, { metric: METRIC_LABEL }), period: formatPeriodL1(period.start, period.end, { days: false, anchor }), n: DAILY_HEATMAP_WORST }));
  });

  it("格：階 2 三格（8/22、7/19、8/16）、階 1 其餘 29 格；DTC 沒有上色的格；格內是 formatHeatCell（8/22「−0.45」），可及名稱含格內數字與 L2", async () => {
    const snapshot = await snapshotOf(fixture("demo"));
    const section = byTestId(renderDiagnosis(snapshot), HEAT);
    // 依 DOM 順序切成兩張表：第 1 張是 MARKETPLACE、第 2 張是 DTC（上一個測試已斷言 caption 順序）。
    const tables = section.split('<table class="heat-table"');
    expect(count(tables[1], 'data-tier="2"')).toBe(3);
    expect(count(tables[1], 'data-tier="1"')).toBe(29);
    expect(count(tables[2], 'data-tier="1"') + count(tables[2], 'data-tier="2"')).toBe(0);
    const worst = cellOf(section, "MARKETPLACE", "2026-08-22");
    expect(openTag(worst, "<td")).toBe(`<td data-tier="2" data-testid="${heatCellTestId("MARKETPLACE", "2026-08-22")}">`);
    expect(textOf(worst)).toBe(formatHeatCell("-4510.74"));
    const aria = fill(copy.cellAria, { channel: channelLabel("MARKETPLACE", snapshotResolver(snapshot)), date: formatDateL1("2026-08-22", { anchor: snapshot.data_as_of }), metric: METRIC_LABEL, cell: formatHeatCell("-4510.74"), value: formatAmountL2("-4510.74") });
    expect(worst).toContain(`aria-label="${aria}"`);
    expect(aria).toContain(formatHeatCell("-4510.74"));
    for (const date of ["2026-07-19", "2026-08-16"]) expect(cellOf(section, "MARKETPLACE", date)).toContain('data-tier="2"');
    // 每格的可見文字＝formatHeatCell(該日扣廣告後貢獻)，testid 一一對應（2 × 42 格）。
    for (const row of snapshot.report.current.daily) expect(textOf(cellOf(section, row.channel, row.date)), `${row.channel} ${row.date}`).toBe(formatHeatCell(row.metrics.contribution_after_marketing.value));
  });

  it("格寬：≥ 1280 為 44px、其餘 40px（.chart-frame.heat 的 --heat-cell）；月曆寬＝週欄 40＋7 × 格寬；每列張數用 auto-fill（不用 CSS order）", () => {
    const css = readFileSync(resolve("src/app/globals.css"), "utf8");
    const block = css.slice(css.indexOf("/* ── V4-3b A："), css.indexOf("/* ── V4-3b A 錨點結束 ── */"));
    expect(block).toContain(".chart-frame.heat { --heat-cell: 40px; --heat-week: 40px; --heat-table-w: calc(var(--heat-week) + 7 * var(--heat-cell)); }");
    expect(block).toContain("@media (min-width: 1280px) { .chart-frame.heat { --heat-cell: 44px; } }");
    expect(block).toContain("grid-template-columns: repeat(auto-fill, var(--heat-table-w))");
    expect(block).not.toMatch(/\border\s*:/);
    expect(block).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("副標尾的「其餘通路在框內捲動」：框高 lg 放不下全部月曆時（不必捲動所需的每列張數 > 1）放在 span.heat-scroll-note[data-columns]，由 CSS container query 依框寬顯示；放得下時不輸出", async () => {
    const section = byTestId(renderDiagnosis(await snapshotOf(fixture("demo"))), HEAT);
    expect(element(section, 'id="heat-sub"')).toContain(`<span class="heat-scroll-note" data-columns="2">${fill(copy.scrollNoteJoin, { note: copy.scrollNote })}</span>`);
    expect(renderHeat(await snapshotOf(fixture("refund_only")))).not.toContain("heat-scroll-note");
    // golden：2 張 1 週的月曆（各 76px）上下疊也放得下 320，不必捲動。
    expect(renderHeat(await snapshotOf(fixture("golden")))).not.toContain("heat-scroll-note");
    const css = readFileSync(resolve("src/app/globals.css"), "utf8");
    // 每列 2 張：格寬 40 時 2 × 320＋24＝664，格寬 44 時 2 × 348＋24＝720。
    expect(css).toContain('@container heat (min-width: 664px) { .heat-scroll-note[data-columns="2"] { display: none; } }');
    expect(css).toContain('@container heat (min-width: 720px) { .heat-scroll-note[data-columns="2"] { display: none; } }');
    expect(css).toContain(".heat-section { container: heat / inline-size; }");
  });

  it("heatColumnsNeeded：月曆高＝caption 20＋欄頭 24＋週數 × 32（與 globals.css 相同），框高 320 放得下幾列就分幾列；6 週 1 列、3 週 2 列、1 週 3 列", () => {
    expect(HEAT_LAYOUT).toEqual({ caption: 20, head: 24, week: 32, gap: 16 });
    const css = readFileSync(resolve("src/app/globals.css"), "utf8");
    expect(css).toContain(".heat-table caption { padding: 0 0 var(--space-1);");
    expect(css).toContain(".heat-table { width: var(--heat-table-w); table-layout: fixed; border-collapse: separate; border-spacing: 0; font-size: var(--text-12); line-height: var(--leading-12); }");
    expect(css).toMatch(/\.heat-table th \{[^}]*height: 24px;/);
    expect(css).toMatch(/\.heat-table tbody td \{[^}]*height: 32px;/);
    expect(css).toContain("gap: var(--space-4) var(--space-5);");
    expect([heatColumnsNeeded(1, 6), heatColumnsNeeded(2, 6), heatColumnsNeeded(3, 6), heatColumnsNeeded(8, 14)]).toEqual([1, 2, 3, 8]);
    expect([heatColumnsNeeded(2, 3), heatColumnsNeeded(4, 3), heatColumnsNeeded(5, 3)]).toEqual([1, 2, 3]);
    expect([heatColumnsNeeded(3, 1), heatColumnsNeeded(4, 1), heatColumnsNeeded(8, 1)]).toEqual([1, 2, 3]);
  });
});

describe("G11 熱表：4 通路合成資料、通路上限、超過 92 天", () => {
  it("合成資料：MARKETPLACE 排第一（9 天虧，最差 9/11）；LIVE 缺列的 7 天是虛線框「資料待補」（data-tier=missing，可及名稱 cellAriaMissing）；第 3 週的週四到週日是期間外（留白、不可聚焦）", async () => {
    const snapshot = await snapshotOf(synthetic4ChannelInput());
    const section = byTestId(renderDiagnosis(snapshot), HEAT);
    expect(captions(section)).toEqual(["MARKETPLACE", "DTC", "LIVE", "SOCIAL"].map(channel => fill(copy.caption, { channel })));
    expect(textOf(element(section, 'id="heat-title"')!)).toBe(fill(copy.title.loss, { channel: "MARKETPLACE", n: 9, date: formatDateL1("2026-09-11", { anchor: snapshot.data_as_of }), amount: formatAmountL1("-1300.00") }));
    for (const date of ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-22"]) {
      const cell = cellOf(section, "LIVE", date);
      expect(openTag(cell, "<td")).toBe(`<td data-tier="missing" data-testid="${heatCellTestId("LIVE", date)}">`);
      expect(textOf(cell)).toBe(labels.shell.status.missing);
      expect(cell).toContain(`aria-label="${fill(copy.cellAriaMissing, { channel: "LIVE", date: formatDateL1(date, { anchor: snapshot.data_as_of }), metric: METRIC_LABEL, status: labels.shell.status.missing })}"`);
    }
    expect(count(section, 'data-tier="missing"')).toBe(7);
    expect(count(section, '<td data-tier="outside"></td>')).toBe(4 * 4);
    expect(count(section, "<button")).toBe(4 * 17);
    expect(count(section, 'tabindex="0"')).toBe(1);
    // 3 週的月曆高 140，框高 320 放得下 2 列，4 張每列 2 張就不必捲動（1280、1440 不顯示捲動說明；768、390 顯示）。
    expect(element(section, 'id="heat-sub"')).toContain('data-columns="2"');
    expect(count(section, '<span class="heat-missing">')).toBe(7);
  });

  it("50 通路 × 92 天（記憶體合成資料）：不計算、不渲染任何格；圖區 state=empty 寫 tooMany（仍是 table 模式的框，沒有表與捲動區）", async () => {
    const snapshot = await snapshotOf(manyChannelsInput(50, 92));
    const section = byTestId(renderDiagnosis(snapshot), HEAT);
    expect(section).not.toContain("chart-diagnosis-heat-cell-");
    expect(section).not.toContain("<table");
    expect(section).not.toContain("<button");
    expect(section).not.toContain("table-scroll");
    expect(openTag(section, 'class="chart-frame ')).toBe(`<div class="chart-frame lg heat" style="height:${chartHeights.lg}px" data-state="empty" data-mode="table">`);
    expect(section).toContain(`<p class="chart-frame-message">${fill(copy.tooMany, { count: 50, n: DAILY_HEATMAP_MAX_CHANNELS })}</p>`);
    expect(textOf(element(section, 'id="heat-title"')!)).toBe(fill(copy.section, { metric: METRIC_LABEL }));
  }, 60_000);

  it("本期超過 92 天改週 × 通路：一張表（列＝週、欄＝通路），格的 key 是週起日；標題與副標用 …Weekly；沒有捲動說明；格的抽屜與「各通路每週」相同（filter.week、channel-weeks-v1）", async () => {
    const snapshot = await snapshotOf(manyChannelsInput(2, 93));
    const model = heatSectionModel(snapshot);
    const heatmap = model.result.heatmap!;
    expect(heatmap.mode).toBe("weekly");
    const section = byTestId(renderHeat(snapshot), HEAT);
    const section_ = fill(copy.sectionWeekly, { metric: METRIC_LABEL });
    expect(captions(section)).toEqual([fill(copy.captionWeekly, { section: section_ })]);
    expect(count(section, '<table class="heat-table" role="grid">')).toBe(1);
    expect(section).toContain('data-layout="matrix"');
    expect(count(section, "<button")).toBe(2 * 14);
    expect(count(section, 'tabindex="0"')).toBe(1);
    const anchor = snapshot.data_as_of;
    const last = heatmap.weeks.at(-1)!;
    expect(model.title).toBe(fill(copy.title.noneWeekly, { channel: heatmap.headline!.channel, week: formatPeriodL1(last.period.start, last.period.end, { days: false, anchor }), amount: formatAmountL1(heatmap.headline!.value) }));
    expect(model.subtitle).toBe(fill(copy.subtitleWeekly, { section: section_, period: formatPeriodL1(snapshot.report.current.period.start, snapshot.report.current.period.end, { days: false, anchor }), days: DAILY_HEATMAP_MAX_DAYS, n: DAILY_HEATMAP_WORST }));
    expect(section).not.toContain("heat-scroll-note");
    expect(section).toContain(labels.overview.trendV3.incompleteShort);
    const first = heatmap.weeks[0];
    expect(section).toContain(`data-testid="${heatCellTestId("CH01", first.period.start)}"`);
    const evidence = heatEvidenceAt(heatmap, { table: 0, row: 0, cell: 1 })!;
    expect(evidence.channels).toEqual(["CH02"]);
    expect(evidence.filter).toEqual({ week: { start: first.period.start, end: first.period.end, label: first.label }, channel: "CH02" });
    expect(evidence.arrangeVersion).toBe(CHANNEL_WEEKS_VERSION);
    expect(evidence.metricVersion).toBeUndefined();
  }, 30_000);
});

describe("G11 格的抽屜：點格、Enter、空白鍵都經由同一個 builder（heatCellEvidence）", () => {
  it("示範資料 MARKETPLACE 8/22：值與來源逐字取自 report.current.daily；period 單日；filter＝{ channel, date }；arrangeVersion daily-heatmap-v1；不給 metricVersion（抽屜顯示 contribution-v1）", async () => {
    const snapshot = await snapshotOf(fixture("demo"));
    const heatmap = heatmapOf(snapshot);
    const row = snapshot.report.current.daily.find(item => item.channel === "MARKETPLACE" && item.date === "2026-08-22")!;
    // MARKETPLACE 是第一張（table 0）；8/22（週六）在第 6 列（8/17 那週）第 6 格。
    const evidence = heatEvidenceAt(heatmap, { table: 0, row: 5, cell: 5 });
    expect(evidence).toEqual({
      name: "contribution_after_marketing", metric: row.metrics.contribution_after_marketing, period: { start: "2026-08-22", end: "2026-08-22" }, channels: ["MARKETPLACE"],
      sources: row.sources, title: METRIC_LABEL, filter: { channel: "MARKETPLACE", date: "2026-08-22" }, arrangeVersion: DAILY_HEATMAP_VERSION,
    });
    expect(evidence).not.toHaveProperty("metricVersion");
    expect(evidence).not.toHaveProperty("components");
    expect(snapshot.metric_version).toBe("contribution-v1");
  });

  it("每個有值或缺值的格：位置換出的抽屜與該格資料直接呼叫 builder 相同（toEqual），filter.date＝testid 的日期；期間外的格沒有抽屜", async () => {
    for (const input of [fixture("demo"), synthetic4ChannelInput(), fixture("golden")]) {
      const snapshot = await snapshotOf(input);
      const heatmap = heatmapOf(snapshot);
      heatmap.channels.forEach((channel, table) => channel.rows.forEach((row, rowIndex) => row.cells.forEach((cell, cellIndex) => {
        const position: HeatPosition = { table, row: rowIndex, cell: cellIndex };
        if (cell.kind === "outside") { expect(heatEvidenceAt(heatmap, position)).toBeNull(); return; }
        const evidence = heatEvidenceAt(heatmap, position)!;
        expect(evidence).toEqual(heatCellEvidence(heatmap, channel.channel, row, cell as HeatValueCell));
        expect(evidence.filter).toEqual({ channel: channel.channel, date: cell.key });
        expect(evidence.channels).toEqual([channel.channel]);
      })));
    }
  }, 30_000);
});

describe("C28 鍵盤（grid 型 roving tabindex，純函式）", () => {
  // 兩張 2 列 × 3 格的表；第 1 張第 2 列第 3 格是期間外，第 2 張第 1 列第 1 格是資料待補。
  const cell = (key: string, tier: HeatTableSpec["rows"][number]["cells"][number]["tier"] = 1) => ({ key, tier, text: key });
  const tables: HeatTableSpec[] = [
    { key: "A", caption: "A", corner: "w", columns: [], rows: [{ key: "1", head: "1", cells: [cell("a11"), cell("a12"), cell("a13")] }, { key: "2", head: "2", cells: [cell("a21"), cell("a22"), cell("a23", "outside")] }] },
    { key: "B", caption: "B", corner: "w", columns: [], rows: [{ key: "1", head: "1", cells: [cell("b11", "missing"), cell("b12"), cell("b13")] }, { key: "2", head: "2", cells: [cell("b21"), cell("b22"), cell("b23")] }] },
  ];
  const { positions, initial } = heatPositions(tables);
  const keyAt = (at: number) => tables[positions[at].table].rows[positions[at].row].cells[positions[at].cell].key;
  const indexOf = (key: string) => positions.findIndex((_, at) => keyAt(at) === key);
  const move = (from: string, key: string, ctrl = false) => { const to = heatMove(positions, indexOf(from), key, ctrl); return to === null ? null : keyAt(to); };

  it("可聚焦的格依 DOM 順序、略過期間外；預設停留點是第一個有值的格（資料待補的格可聚焦，但不是預設）", () => {
    expect(positions.map((_, at) => keyAt(at))).toEqual(["a11", "a12", "a13", "a21", "a22", "b11", "b12", "b13", "b21", "b22", "b23"]);
    expect(keyAt(initial)).toBe("a11");
    const only = heatPositions([tables[1]]);
    const first = only.positions[only.initial];
    expect(tables[1].rows[first.row].cells[first.cell].key).toBe("b12");
    expect(heatPositions([]).initial).toBe(-1);
  });

  it("左右沿 DOM 順序（跨列、跨表），到頭尾留在原格；上下找同一欄（同一張表沒有了就接到下一張或上一張表的同一欄）", () => {
    expect([move("a13", "ArrowRight"), move("a22", "ArrowRight"), move("b23", "ArrowRight"), move("a11", "ArrowLeft"), move("b11", "ArrowLeft")]).toEqual(["a21", "b11", "b23", "a11", "a22"]);
    expect([move("a11", "ArrowDown"), move("a21", "ArrowDown"), move("a13", "ArrowDown"), move("b23", "ArrowDown")]).toEqual(["a21", "b11", "b13", "b23"]);
    expect([move("b13", "ArrowUp"), move("b11", "ArrowUp"), move("a11", "ArrowUp")]).toEqual(["a13", "a21", "a11"]);
  });

  it("Home／End 到該列首尾，加 Ctrl（或 Cmd）到整個熱表首尾；其他鍵（Tab、Enter、空白鍵）不處理，交給瀏覽器", () => {
    expect([move("a22", "Home"), move("a21", "End"), move("b12", "End"), move("b22", "Home", true), move("a12", "End", true)]).toEqual(["a21", "a22", "b13", "a11", "b23"]);
    for (const key of ["Tab", "Enter", " ", "PageDown", "a"]) expect(move("a11", key), key).toBeNull();
    expect(heatMove(positions, 99, "ArrowRight")).toBeNull();
  });
});
