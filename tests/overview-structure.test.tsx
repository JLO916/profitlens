import Decimal from "decimal.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ASSIST_KPI_IDS, assistKpis } from "../src/application/assist-kpi";
import { assistWeeks } from "../src/application/chart-assist-weeks";
import { channelsLabel, formatHeadlineAmount, snapshotResolver } from "../src/application/copy";
import { createReviewSession } from "../src/application/review-session";
import { deltaTone, deltaWord, formatGrowth, formatMetric, formatPeriodL1, formatRatePoints, metricDefinitions } from "../src/application/presentation";
import { achievement, achievementText, mismatchText, parseTargets, targetDisplay, type TargetSet } from "../src/application/targets";
import { buildWeeklySummary, snapshotSentence } from "../src/application/weekly-summary";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "../src/application/workspace";
import { MeetingEntry } from "../src/components/meeting-page";
import { Overview } from "../src/components/overview";
import { KPI_BAND_METRICS, kpiDelta } from "../src/components/overview/kpi-band";
import { copyWeeklySummary, snapshotMeta, writeClipboard } from "../src/components/overview/weekly-snapshot";
import { toneClass } from "../src/components/top-three";
import { compareMoney, percentagePointChange } from "../src/domain/metrics";
import type { Dataset, DatasetInput, Metric } from "../src/domain/types";
import { validateDataset } from "../src/domain/validation";
import { fill, labels } from "../src/i18n";
import { fixture } from "./helpers/fixtures";
import { SYNTHETIC_CHANNEL_SETTINGS } from "./helpers/page-states";
import { synthetic4ChannelInput } from "./helpers/synthetic-4-channel";
import { byTestId, element, escapeAttr, openTag, textOf } from "./helpers/markup";

// V3-4a 經營總覽「首屏與結構」（PRD §7.1 區塊 2、3、9、10；§9.4 C1、C2、C12、C18）：SSR golden 結構測試。
// 期待值一律由 labels、fill 與 presentation／copy 的格式化函式從 snapshot 的精確字串組出，不寫死數字（golden：本期扣廣告後貢獻 255.00、差額 −315.00）。

const noop = () => undefined;
const snapUi = labels.overview.snapshotUi, band = labels.overview.kpiBand, assistUi = labels.overview.assistTable;
type Golden = { input: DatasetInput; dataset: Dataset; snapshot: WorkspaceSnapshot; revision: number };
let golden: Golden;
let targets: TargetSet;
beforeAll(async () => {
  const input = fixture("golden");
  const dataset = validateDataset(input).dataset!;
  golden = { input, dataset, snapshot: await createSnapshot(dataset, {}, await hashInput(input)), revision: 1 };
  const { start, end } = golden.snapshot.report.current.period;
  // 淨營收目標遠高於實際（落後）、扣廣告後貢獻目標低於實際（超前）、商品毛利目標期間不符、廣告費預算遠低於實際（超支＝落後）。
  targets = { filename: "targets.csv", rows: [
    { period_start: start, period_end: end, channel: "ALL", metric: "net_revenue", target: "999999999.00", line: 2 },
    { period_start: start, period_end: end, channel: "ALL", metric: "contribution_after_marketing", target: "100.00", line: 3 },
    { period_start: "2020-01-01", period_end: "2020-01-31", channel: "ALL", metric: "gross_profit", target: "500.00", line: 4 },
    { period_start: start, period_end: end, channel: "ALL", metric: "ad_spend", target: "1.00", line: 5 },
  ] };
});

const actionsSummary = { pending: 2, pinned: [{ problem: "p", owner: "o", deadline: "2026-10-30" }] };
function render(options: { periodOpen?: boolean; withTargets?: boolean; snapshot?: WorkspaceSnapshot; missingItems?: number } = {}): string {
  const snapshot = options.snapshot ?? golden.snapshot;
  const review = createReviewSession(golden, "e", "rev-structure");
  return renderToStaticMarkup(createElement(Overview, {
    snapshot, onEvidence: noop, onCreateAction: noop, periodOpen: options.periodOpen ?? false, onPeriodToggle: noop, targets: options.withTargets ? targets : null, events: null, allChannels: golden.dataset.manifest.channels,
    onBasis: noop, onNavigate: noop, datasetName: labels.shell.devValidation.datasets.golden, missingItems: options.missingItems ?? 0, actionsSummary,
    meetingEntry: createElement(MeetingEntry, { review, history: [], datasetHash: snapshot.dataset_hash, onOpen: noop }),
  }));
}
const link = (aria: string, shown: string) => `<button type="button" class="number-link" aria-label="${escapeAttr(aria)}">${shown}</button>`;

describe("V3-4a／V3-4b 區塊順序（§7.1）", () => {
  // V3-4b：§7.1 順序——一句話 → KPI 帶 → 三件事 → 貢獻變化拆解（#bridge-title）→ 本期利潤結構（profit-waterfall）→ 並排的趨勢與各通路 → 其他常用指標 → 進階。
  it("一句話 → KPI 帶 → 本期三件事 → 並排（每週趨勢、各通路）→ 其他常用指標 → 進階", () => {
    const html = render();
    const markers = ['data-testid="weekly-snapshot"', 'data-testid="kpi-band"', 'data-testid="top-three"', 'aria-labelledby="bridge-title"', 'data-testid="profit-waterfall"', '<div class="pair">', 'aria-labelledby="trend-title"', 'aria-labelledby="channel-title"', 'data-testid="assist-kpis"', 'data-testid="overview-advanced"'];
    const positions = markers.map(marker => html.indexOf(marker));
    for (const [index, position] of positions.entries()) expect(position, markers[index]).toBeGreaterThan(-1);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    // v2 的五張卡、七格與 kpiHint 說明列都已移除。
    for (const old of ['class="kpi-grid"', 'class="kpi-card', 'class="assist-row"', 'class="assist-card', 'class="kpi-change', 'class="change-rate"', 'class="section-heading compact"']) expect(html, old).not.toContain(old);
    // V3-4b：v2 圖表區的 eyebrow、圓點圖例、analysis-grid、通路摘要卡與趨勢面板都已移除（橋接的 v2 markup 一併刪除，新版由 B1 元件負責）。
    for (const old of ['class="eyebrow"', 'legend-dot', 'class="chart-legend"', 'class="analysis-grid"', 'class="channel-summaries"', 'trend-panel', 'class="bridge-summary"', 'bridge-chart']) expect(html, old).not.toContain(old);
  });

  it("KPI 帶之前只有兩個互動元素：複製週會摘要與會議入口（沒有連結，剪貼簿對話框在 SSR 不出現）", () => {
    const html = render();
    const head = html.slice(0, html.indexOf('data-testid="kpi-band"'));
    const buttons = head.match(/<button\b[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toContain('data-testid="copy-summary"');
    expect(buttons[1]).toContain('class="text-button"');
    expect(byTestId(html, "overview-meeting-entry")).toContain(buttons[1]);
    expect(head).not.toMatch(/<a\b/);
    expect(html).not.toContain('data-testid="copy-summary-fallback"');
  });
});

describe("V3-4a 本期一句話（區塊 2）", () => {
  it("一句話來自 snapshotSentence、範圍行是「本期 M/D–M/D · 全部通路 · 金額未稅」；右側是複製週會摘要、會議入口與 role=status", () => {
    const html = render({ missingItems: 0 });
    const block = byTestId(html, "weekly-snapshot");
    expect(openTag(html, 'data-testid="weekly-snapshot"')).toBe('<section class="snapshot" data-testid="weekly-snapshot" aria-labelledby="snapshot-title">');
    expect(block).toContain(`<h2 id="snapshot-title" class="sr-only">${snapUi.heading}</h2>`);
    expect(byTestId(block, "snapshot-sentence")).toBe(`<p class="snapshot-sentence" data-testid="snapshot-sentence">${escapeAttr(snapshotSentence(golden.snapshot, { missingItems: 0 }).text)}</p>`);
    const { start, end } = golden.snapshot.report.current.period;
    const meta = fill(snapUi.meta, { period: formatPeriodL1(start, end, { days: false, anchor: golden.snapshot.data_as_of }), channels: labels.shell.periodBar.filter.allChannels });
    expect(snapshotMeta(golden.snapshot, golden.dataset.manifest.channels)).toBe(meta);
    expect(block).toContain(`<p class="snapshot-meta">${meta}</p>`);
    const copy = byTestId(block, "copy-summary");
    expect(copy).toMatch(/^<button type="button" class="ui-btn ui-btn-secondary" data-testid="copy-summary">/);
    expect(textOf(copy)).toBe(snapUi.copy);
    expect(copy).toContain('aria-hidden="true"');
    expect(byTestId(block, "copy-summary-status")).toBe('<span class="copy-status" role="status" data-testid="copy-summary-status"></span>');
    expect(block).toContain('data-testid="overview-meeting-entry"');
    // 句中金額不做 number-link（同一金額已在 KPI 帶可點）。
    expect(byTestId(block, "snapshot-sentence")).not.toContain("number-link");
  });

  it("只看部分通路時範圍行改列出通路名稱", async () => {
    const dtc = await createSnapshot(golden.dataset, { channels: ["DTC"] }, golden.snapshot.dataset_hash);
    expect(snapshotMeta(dtc, golden.dataset.manifest.channels)).toContain(channelsLabel(["DTC"], snapshotResolver(dtc)));
    expect(snapshotMeta(dtc, golden.dataset.manifest.channels)).not.toContain(labels.shell.periodBar.filter.allChannels);
  });

  it("writeClipboard：寫入成功回傳 true；沒有 Clipboard API 或被拒時回傳 false（改開 textarea 對話框）", async () => {
    const writeText = vi.fn(async () => undefined);
    expect(await writeClipboard("週會", { writeText })).toBe(true);
    expect(writeText).toHaveBeenCalledWith("週會");
    expect(await writeClipboard("週會", undefined)).toBe(false);
    expect(await writeClipboard("週會", null)).toBe(false);
    expect(await writeClipboard("週會", { writeText: async () => { throw new Error("NotAllowedError"); } })).toBe(false);
  });

  it("copyWeeklySummary：寫入 buildWeeklySummary 的純文字版（資料集名、資料待補項數、待辦概況照傳）；失敗時回傳全文給對話框", async () => {
    const input = { snapshot: golden.snapshot, datasetName: labels.shell.devValidation.datasets.golden, missingItems: 0, actions: actionsSummary };
    const expected = buildWeeklySummary(input).text;
    const writeText = vi.fn(async () => undefined);
    expect(await copyWeeklySummary(input, { writeText })).toEqual({ copied: true, text: expected });
    expect(writeText).toHaveBeenCalledWith(expected);
    expect(await copyWeeklySummary(input, undefined)).toEqual({ copied: false, text: expected });
  });
});

describe("V3-4a KPI 帶（C1）", () => {
  it("一個容器 5 格（順序依 D-V3-11），扣廣告後貢獻是唯一的強調格；單位只在 KPI 帶右上寫一次", () => {
    const html = render();
    const section = element(html, 'aria-labelledby="kpi-title"')!;
    expect(section).toMatch(/^<section class="kpi-section" aria-labelledby="kpi-title">/);
    expect(section).toContain(`<div class="kpi-head"><h2 id="kpi-title" class="sr-only">${labels.overview.sections.kpis}</h2><span class="unit-note">${labels.overview.page.kpiHint}</span></div>`);
    const kpiBand = byTestId(html, "kpi-band");
    const cells = [...kpiBand.matchAll(/<div class="kpi(?: [^"]*)?" data-testid="kpi-([a-z_]+)">/g)].map(match => match[1]);
    expect(cells).toEqual([...KPI_BAND_METRICS]);
    expect(kpiBand.match(/class="kpi is-key"/g)).toHaveLength(1);
    expect(openTag(kpiBand, 'data-testid="kpi-contribution_after_marketing"')).toBe('<div class="kpi is-key" data-testid="kpi-contribution_after_marketing">');
  });

  it("每格：名稱＋`?` 定義按鈕、主值 number-link（可及名稱含可見文字）、差額行、上期 number-link", () => {
    const html = render();
    const { report } = golden.snapshot;
    for (const name of KPI_BAND_METRICS) {
      const cell = byTestId(html, `kpi-${name}`);
      const label = metricDefinitions[name].label;
      const before = report.previous.metrics[name], current = report.current.metrics[name];
      const shown = formatMetric(name, current, "L1"), previousShown = formatMetric(name, before, "L1");
      expect(cell, name).toContain(`<div class="kpi-name"><span>${label}</span><button type="button" class="btn-help" aria-label="${escapeAttr(fill(band.helpAria, { metric: label }))}" title="${escapeAttr(metricDefinitions[name].plain)}">`);
      const valueAria = fill(band.valueAria, { metric: label, value: shown });
      expect(valueAria, name).toContain(shown);
      expect(cell, name).toContain(`<div class="kpi-value">${link(valueAria, shown)}</div>`);
      expect(cell, name).toContain(`<p class="kpi-prev">${labels.shell.periods.previous} ${link(fill(band.previousAria, { metric: label, value: previousShown }), previousShown)}</p>`);
      // 顏色只有不利上色（toneClass(deltaTone(...))）。
      const change = kpiDelta(name, before, current);
      expect(cell, name).toContain(`<div class="kpi-delta ${toneClass(deltaTone(name, change.delta, "L1"))}">`);
      expect(cell, name).toContain(link(fill(band.deltaAria, { metric: label, delta: change.text! }), change.text!));
    }
  });

  it("金額格差額行＝「比上期」＋deltaWord＋formatHeadlineAmount（絕對值）＋formatGrowth；比率格＝formatRatePoints，不顯示成長率與「比上期」", () => {
    const html = render();
    const { report } = golden.snapshot;
    for (const name of ["net_revenue", "gross_profit", "contribution_before_marketing", "contribution_after_marketing"] as const) {
      const before = report.previous.metrics[name], current = report.current.metrics[name];
      const delta = compareMoney(before, current).absolute_change.value;
      const word = deltaWord(name, delta, { previous: before.value, layer: "L1" })!;
      const expected = fill(band.deltaLine, { word, amount: formatHeadlineAmount(delta) });
      const deltaLine = element(byTestId(html, `kpi-${name}`), 'class="kpi-delta')!;
      expect(deltaLine, name).toContain(`<span class="dl-long">${band.vsPrevious}</span>`);
      expect(textOf(deltaLine), name).toContain(`${band.vsPrevious}${expected}`);
      const growth = formatGrowth(current.value, before.value, "L1");
      if (growth === null) expect(deltaLine, name).not.toContain('class="pct"');
      else expect(deltaLine, name).toContain(`<span class="pct">${fill(labels.overview.page.growthInline, { value: growth })}</span>`);
    }
    // golden 本期扣廣告後貢獻 255.00、差額 −315.00：少賺＋不利色。
    const key = element(byTestId(html, "kpi-contribution_after_marketing"), 'class="kpi-delta')!;
    expect(textOf(key)).toContain(fill(band.deltaLine, { word: labels.format.earnLess, amount: formatHeadlineAmount("-315.00") }));
    expect(key).toMatch(/^<div class="kpi-delta negative">/);
    const rate = element(byTestId(html, "kpi-contribution_margin"), 'class="kpi-delta')!;
    const points = percentagePointChange(report.previous.metrics.contribution_margin, report.current.metrics.contribution_margin).value!;
    expect(textOf(rate)).toBe(formatRatePoints(new Decimal(points).div(100).toFixed(), "L1"));
    expect(rate).not.toContain('class="pct"');
    expect(rate).not.toContain('class="dl-long"');
  });

  it("kpiDelta：持平只寫「持平」；上期 ≤ 0 轉正、上期 > 0 轉虧寫方向詞且不顯示成長率；差額待確認時沒有文字", () => {
    const money = (value: string | null): Metric => ({ value, reason_codes: value === null ? ["MISSING_COGS"] : [] });
    expect(kpiDelta("contribution_after_marketing", money("100.00"), money("100.00"))).toMatchObject({ text: labels.format.flat, growth: null, long: false });
    expect(kpiDelta("contribution_after_marketing", money("-100.00"), money("50.00"))).toMatchObject({ text: labels.format.turnedPositive, growth: null, long: false });
    expect(kpiDelta("contribution_after_marketing", money("100.00"), money("-50.00"))).toMatchObject({ text: labels.format.turnedLoss, growth: null, long: false });
    expect(kpiDelta("net_revenue", money("0.00"), money("50.00"))).toMatchObject({ text: fill(band.deltaLine, { word: labels.format.more, amount: formatHeadlineAmount("50.00") }), growth: null, long: true });
    expect(kpiDelta("net_revenue", money(null), money("50.00"))).toMatchObject({ delta: null, text: null });
    const rate = kpiDelta("contribution_margin", { value: "0.304", reason_codes: [] }, { value: "0.162", reason_codes: [] });
    expect(rate).toMatchObject({ text: formatRatePoints("-0.142", "L1"), growth: null, long: false });
  });

  it("差額待確認且有資料待補時，差額行改成「先補齊 {n} 項」並連到資料來源", async () => {
    const input = fixture("errors/missing_cogs");
    const dataset = validateDataset(input).dataset!;
    const partial = await createSnapshot(dataset, {}, await hashInput(input));
    const html = render({ snapshot: partial, missingItems: dataset.issues.length });
    const cell = byTestId(html, "kpi-gross_profit");
    expect(partial.report.current.metrics.gross_profit.value).toBeNull();
    expect(cell).toMatch(/^<div class="kpi is-missing" /);
    expect(cell).toContain(`<button type="button" class="text-button">${fill(band.fillMissing, { n: dataset.issues.length })}</button>`);
  });

  it("目標列（C18）：期間相符時加細條（aria-hidden，落後用 is-behind）與既有的達成文字；期間不符只顯示提示；沒有目標的格不出現", () => {
    const html = render({ withTargets: true });
    const { report } = golden.snapshot;
    const revenue = byTestId(html, "kpi-target-net_revenue");
    expect(byTestId(html, "kpi-net_revenue")).toContain('data-testid="kpi-target-net_revenue"');
    expect(revenue).toMatch(/^<p class="kpi-target matched" data-testid="kpi-target-net_revenue"><span class="kpi-bullet is-behind" aria-hidden="true"><span class="kpi-bullet-bar" style="width:[\d.]+%"><\/span><span class="kpi-bullet-target"><\/span><\/span><button class="number-link">/);
    expect(textOf(revenue)).toBe(achievementText(targets.rows[0], report.current.metrics.net_revenue, "L1"));
    const key = byTestId(html, "kpi-target-contribution_after_marketing");
    expect(key).toContain('<span class="kpi-bullet" aria-hidden="true"><span class="kpi-bullet-bar" style="width:100.0%"></span>');
    expect(textOf(key)).toBe(achievementText(targets.rows[1], report.current.metrics.contribution_after_marketing, "L1"));
    const mismatch = byTestId(html, "kpi-target-gross_profit");
    expect(mismatch).toMatch(/^<p class="kpi-target mismatch"/);
    expect(mismatch).not.toContain("kpi-bullet");
    expect(textOf(mismatch)).toBe(mismatchText(targets.rows[2]));
    for (const name of ["contribution_before_marketing", "contribution_margin"]) expect(html, name).not.toContain(`data-testid="kpi-target-${name}"`);
    // 沒有目標檔時完全不出現。
    expect(render()).not.toContain("kpi-target-");
  });
});

describe("V3-4a 其他常用指標（C2 兩欄緊湊表）", () => {
  it("標題＋`?` 說明；兩張表（4＋3 列，順序同 ASSIST_KPI_IDS），表頭由 labels 取字；本期與上期都是 number-link；不加差額欄", () => {
    const html = render();
    const assist = byTestId(html, "assist-kpis");
    const section = labels.overview.sections.assistKpis;
    expect(openTag(html, 'data-testid="assist-kpis"')).toBe('<section class="assist" aria-labelledby="assist-title" data-testid="assist-kpis">');
    expect(assist).toContain(`<h2 id="assist-title">${section}</h2><button type="button" class="btn-help" aria-label="${escapeAttr(fill(assistUi.helpAria, { section }))}" title="${escapeAttr(labels.assist.intro)}">`);
    const tables = assist.match(/<table class="kv"[^>]*>[\s\S]*?<\/table>/g)!;
    expect(tables).toHaveLength(2);
    // V4-2 G7a：兩張表各多一欄「近 {n} 週」sparkline（golden 本期 1 天＝1 週）；本期、上期兩欄不變。
    const header = `<thead><tr><th scope="col">${assistUi.columns.metric}</th><th scope="col" class="num">${assistUi.columns.current}</th><th scope="col" class="num">${assistUi.columns.previous}</th><th scope="col" class="spark-head">${fill(labels.overview.chartsV4.assistSpark.head, { n: assistWeeks(golden.snapshot).weeks.length })}</th></tr></thead>`;
    for (const table of tables) expect(table).toContain(header);
    const rows = tables.map(table => [...table.matchAll(/data-testid="assist-([a-z_]+)"/g)].map(match => match[1]));
    expect(rows.map(ids => ids.length)).toEqual([4, 3]);
    expect(rows.flat()).toEqual([...ASSIST_KPI_IDS]);
    const current = assistKpis(golden.snapshot.report.current), previous = assistKpis(golden.snapshot.report.previous);
    for (const [index, kpi] of current.entries()) {
      const row = byTestId(assist, `assist-${kpi.id}`);
      expect(row, kpi.id).toContain(`<th scope="row" title="${escapeAttr(kpi.plain)}">${kpi.label}</th>`);
      expect(row.match(/class="number-link"/g), kpi.id).toHaveLength(2);
      expect(row, kpi.id).toContain(`<td class="num ${kpi.status}">${link(fill(assistUi.cellAria, { metric: kpi.label, period: assistUi.columns.current, value: kpi.display }), kpi.display)}</td>`);
      expect(row, kpi.id).toContain(`<td class="num prev ${previous[index].status}">${link(fill(assistUi.cellAria, { metric: previous[index].label, period: assistUi.columns.previous, value: previous[index].display }), previous[index].display)}</td>`);
      // V4-2 G7a：第三格是 td.spark-cell（sparkline，aria-hidden、不可點），數字格仍是兩格。
      expect(row.match(/<td\b/g), kpi.id).toHaveLength(3);
      expect(row.match(/<td class="num/g), kpi.id).toHaveLength(2);
      expect(row, kpi.id).toContain('<td class="spark-cell">');
    }
  });

  it("廣告預算達成（kpi-target-ad_spend）放在「廣告佔淨營收」列的下一列，含 C18 細條（超支＝落後）", () => {
    const html = render({ withTargets: true });
    const assist = byTestId(html, "assist-kpis");
    const burden = byTestId(assist, "assist-marketing_burden");
    const after = assist.slice(assist.indexOf(burden) + burden.length);
    // V4-2 G7a：表格多一欄 sparkline，目標列跨四欄。
    expect(after).toMatch(/^<tr class="kv-target"><td colSpan="4"><p class="kpi-target matched" data-testid="kpi-target-ad_spend"><span class="kpi-bullet is-behind" aria-hidden="true">/);
    const budget = byTestId(assist, "kpi-target-ad_spend");
    expect(textOf(budget)).toBe(fill(labels.targets.achievedBudget, { target: targetDisplay(targets.rows[3], "L1"), rate: achievement(golden.snapshot.report.current.metrics.ad_spend, targets.rows[3].target).display }));
    expect(render()).not.toContain('class="kv-target"');
  });
});

describe("V3-4a 進階（收合）：期間合計與日均", () => {
  it("外層 <details class=\"advanced\"> 包住 period-comparison 與 #daily-average-title，兩層都保持掛載；收合時兩層都關著", () => {
    const html = render({ periodOpen: false });
    const advanced = byTestId(html, "overview-advanced");
    expect(openTag(html, 'data-testid="overview-advanced"')).toBe('<details class="advanced" data-testid="overview-advanced">');
    expect(advanced).toMatch(new RegExp(`^<details class="advanced" data-testid="overview-advanced"><summary>${labels.overview.pnlV3.advancedSummary}</summary>`));
    expect(advanced).toContain('data-testid="period-comparison"');
    expect(advanced).toContain('<h2 id="daily-average-title" class="sr-only">');
    expect(openTag(html, 'data-testid="period-comparison"')).not.toMatch(/\sopen=""/);
  });

  it("期間合計與日均原本是展開的（periodOpen）時，外層一起展開", () => {
    const html = render({ periodOpen: true });
    expect(openTag(html, 'data-testid="overview-advanced"')).toMatch(/\sopen=""/);
    expect(openTag(html, 'data-testid="period-comparison"')).toMatch(/\sopen=""/);
  });
});

// ── V42-2a（docs/revamp-v4.2/06_BATCHES.md V42-2a 第 2 到 4 項；DESIGN §4、§5 第 18 條；D-V42-2、D-V42-12）：總覽在群組範圍下——範圍行（snapshotMeta）認得群組、G4 精簡表的「只看這個通路」、KPI 帶之後的目標限制句。
describe("V42-2a 總覽：範圍行、「只看這個通路」與目標限制句", () => {
  const drillCopy = labels.diagnosis.channelsV42;
  const G1 = SYNTHETIC_CHANNEL_SETTINGS.groups.find(group => group.id === "g1")!.label;
  const nameOf = (code: string) => SYNTHETIC_CHANNEL_SETTINGS.channels.find(entry => entry.code === code)!.label!;
  const MEMBER = fill(labels.shell.scopeV42.memberOfGroup, { group: G1, channel: nameOf("DTC") });
  type Loaded = { dataset: Dataset; snapshot: WorkspaceSnapshot };
  let group: Loaded, single: Loaded, all: Loaded;
  let syntheticTargets: TargetSet;
  beforeAll(async () => {
    const load = async (channels: string[]): Promise<Loaded> => { const input = synthetic4ChannelInput(); const dataset = validateDataset(input).dataset!; return { dataset, snapshot: await createSnapshot(dataset, { channels }, await hashInput(input), SYNTHETIC_CHANNEL_SETTINGS) }; };
    group = await load(["DTC", "SOCIAL"]); single = await load(["DTC"]); all = await load(["DTC", "LIVE", "MARKETPLACE", "SOCIAL"]);
    // 比照 tests/helpers/page-states.tsx：本期日期、channel ALL、四個指標。
    const { start, end } = group.snapshot.report.current.period;
    const csv = ["period_start,period_end,channel,metric,target", ...["net_revenue", "gross_profit", "contribution_after_marketing", "ad_spend"].map(metric => `${start},${end},ALL,${metric},${metric === "ad_spend" ? "-50000.00" : "100000.00"}`)].join("\n");
    syntheticTargets = parseTargets({ name: "targets.csv", bytes: new TextEncoder().encode(csv) }, group.dataset.manifest.channels).set!;
  });
  const renderLoaded = (loaded: Loaded, extra: { onDrill?: (channel: string) => void; targets?: TargetSet | null } = {}) => renderToStaticMarkup(createElement(Overview, { snapshot: loaded.snapshot, onEvidence: noop, datasetName: "synthetic", missingItems: 0, actionsSummary: { pending: 0, pinned: [] }, allChannels: loaded.dataset.manifest.channels, targets: extra.targets ?? null, onDrill: extra.onDrill }));
  const drillButtons = (html: string) => [...html.matchAll(/<button type="button" class="ui-btn ui-btn-text channel-drill" data-testid="channel-drill-([^"]+)" aria-label="([^"]*)">([^<]*)<\/button>/g)].map(match => ({ channel: match[1], aria: match[2], text: match[3] }));
  const meta = (loaded: Loaded, channels: string) => fill(snapUi.meta, { period: formatPeriodL1(loaded.snapshot.report.current.period.start, loaded.snapshot.report.current.period.end, { days: false, anchor: loaded.snapshot.data_as_of }), channels });

  it("範圍行（第 18 條）：群組 → 群組名；群組內單一通路 → 自有 · 官網；全部通路 → 全部通路；沒有群組的 golden 單一通路 → channelsLabel（與今天相同）", async () => {
    expect(snapshotMeta(group.snapshot, group.dataset.manifest.channels)).toBe(meta(group, G1));
    expect(renderLoaded(group)).toContain(`<p class="snapshot-meta">${meta(group, G1)}</p>`);
    expect(snapshotMeta(single.snapshot, single.dataset.manifest.channels)).toBe(meta(single, MEMBER));
    expect(snapshotMeta(all.snapshot, all.dataset.manifest.channels)).toBe(meta(all, labels.shell.periodBar.filter.allChannels));
    const dtc = await createSnapshot(golden.dataset, { channels: ["DTC"] }, await hashInput(golden.input));
    expect(snapshotMeta(dtc, golden.dataset.manifest.channels)).toBe(fill(snapUi.meta, { period: formatPeriodL1(dtc.report.current.period.start, dtc.report.current.period.end, { days: false, anchor: dtc.data_as_of }), channels: channelsLabel(["DTC"], snapshotResolver(dtc)) }));
  });

  it("G4 精簡表（D-V42-2）：群組範圍＋onDrill → 每列一個 channel-drill-{code}，在 th[scope=row] 內列名之後；aria-label＝只看這個通路：{顯示名稱}；可見文字＝只看這個通路；只在精簡表內", () => {
    const html = renderLoaded(group, { onDrill: noop });
    const rows = element(byTestId(html, "channel-mix"), 'class="kv channel-kv"')!.match(/<tr>[\s\S]*?<\/tr>/g)!.slice(1);
    expect(rows).toHaveLength(2);
    for (const [index, code] of ["DTC", "SOCIAL"].entries()) {
      const th = /<th scope="row">([\s\S]*?)<\/th>/.exec(rows[index])![1];
      expect(th.startsWith(nameOf(code)), code).toBe(true);
      expect(th.endsWith(`<button type="button" class="ui-btn ui-btn-text channel-drill" data-testid="channel-drill-${code}" aria-label="${escapeAttr(fill(drillCopy.drillChannelAria, { channel: nameOf(code) }))}">${drillCopy.drill}</button>`), code).toBe(true);
    }
    expect(drillButtons(html).map(button => button.channel)).toEqual(["DTC", "SOCIAL"]);
    expect(html.split("channel-drill-").length - 1).toBe(2);
  });

  it("不渲染「只看這個通路」：沒傳 onDrill、群組但單一通路範圍、golden（沒有群組）→ 0 個；全部通路範圍（有群組）→ 每個通路一個；golden 有沒有 onDrill 的 markup 逐位元組相同", () => {
    expect(drillButtons(renderLoaded(group))).toEqual([]);
    expect(drillButtons(renderLoaded(single, { onDrill: noop }))).toEqual([]);
    expect(drillButtons(renderLoaded(all, { onDrill: noop })).map(button => button.channel)).toEqual(["DTC", "LIVE", "MARKETPLACE", "SOCIAL"]);
    expect(render()).not.toContain("channel-drill");
    const props = { snapshot: golden.snapshot, onEvidence: noop, datasetName: "x", missingItems: 0, actionsSummary: { pending: 0, pinned: [] }, allChannels: golden.dataset.manifest.channels };
    expect(renderToStaticMarkup(createElement(Overview, { ...props, onDrill: noop }))).toBe(renderToStaticMarkup(createElement(Overview, props)));
  });

  it("目標限制句（D-V42-12）：群組範圍＋目標檔 → KPI 帶之後緊接一行 note（kpi-targets-note）；沒有目標、群組內單一通路＋目標、全部通路＋目標、golden＋目標 → 都沒有", () => {
    const note = `<p class="note kpi-targets-note">${drillCopy.limits.targets}</p>`;
    const html = renderLoaded(group, { targets: syntheticTargets });
    // KpiBand 的根是 <section class="kpi-section">（kpi-band 在裡面）；限制句緊接在這個 section 之後。
    const section = element(html, 'class="kpi-section"')!;
    expect(section).toContain(byTestId(html, "kpi-band"));
    expect(html).toContain(`${section}${note}`);
    expect(html.split(note).length - 1).toBe(1);
    expect(renderLoaded(group)).not.toContain("kpi-targets-note");
    expect(renderLoaded(single, { targets: syntheticTargets })).not.toContain("kpi-targets-note");
    expect(renderLoaded(all, { targets: syntheticTargets })).not.toContain("kpi-targets-note");
    expect(render({ withTargets: true })).not.toContain("kpi-targets-note");
  });

  it("審查 R2-2：「本期三件事」標題旁的 sec-scope 走 scopeChannelsLabel——群組 → 自有；群組內單一通路 → 自有 · 官網；golden → channelsLabel 的成員清單", () => {
    const scopeOf = (html: string) => /<h2 id="top-three-title">[^<]*<\/h2><span class="sec-scope">([^<]*)<\/span>/.exec(html)![1];
    expect(scopeOf(renderLoaded(group))).toBe(G1);
    expect(scopeOf(renderLoaded(single))).toBe(MEMBER);
    expect(scopeOf(render())).toBe(channelsLabel(golden.snapshot.report.scope.channels, snapshotResolver(golden.snapshot)));
  });

  it("審查 R2-3：只有一個成員的群組、範圍就是那個通路＋目標檔 → 不顯示目標限制句（單一通路照常配對，與 channelSelection 的優先順序一致）", async () => {
    const input = synthetic4ChannelInput();
    const dataset = validateDataset(input).dataset!;
    const solo = { ...SYNTHETIC_CHANNEL_SETTINGS, channels: [{ code: "LIVE", label: nameOf("LIVE"), group: "g9" }], groups: [{ id: "g9", label: "只有直播", order: 0 }] };
    const snapshot = await createSnapshot(dataset, { channels: ["LIVE"] }, await hashInput(input), solo);
    expect(snapshot.channel_groups?.map(group => group.members)).toEqual([["LIVE"]]);
    expect(renderLoaded({ dataset, snapshot }, { targets: syntheticTargets })).not.toContain("kpi-targets-note");
  });
});
