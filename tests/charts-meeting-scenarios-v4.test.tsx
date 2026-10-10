import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { checkChartMarkup } from "../scripts/lib/chart-scan.mjs";
import { l1ClauseLengths, L1_MAX_CJK, channelAliasTerms } from "../scripts/lib/copy-scan.mjs";
import { chartColors, chartHeights, chartRowHeights } from "@/application/chart-theme";
import { emptyActionWorkspace } from "@/application/action-workspace";
import { buildManagerSummary, exportManagerSummaryMarkdown, type SummaryScenario } from "@/application/manager-summary";
import { formatAmountL2, formatPeriodL1, formatSignedDelta, metricDefinitions } from "@/application/presentation";
import { buildReviewDecisionContext } from "@/application/review-session";
import { RANKED_AXIS_TICK, RANKED_TEXT_PAD, hbarGeometry, hbarMaxRows, rankedTextWidth, type RankedBarRow } from "@/components/charts/ranked-bars";
import { MEETING_SCENARIOS_BAR_PREFIX, MEETING_SCENARIOS_MAX_BARS, MEETING_SCENARIOS_TABLE_TESTID, MEETING_SCENARIOS_TESTID, MeetingScenariosSection, meetingScenariosModel, type MeetingScenariosInput } from "@/components/meeting/scenarios-chart";
import { MeetingPage, type MeetingPageProps } from "@/components/meeting-page";
import { PrintSummary } from "@/components/print-summary";
import { fill, labels } from "@/i18n";
import { element, openTag, textOf } from "./helpers/markup";
import { SCENARIOS_VARIANCE_BASELINE_FILE, scenariosVarianceBaseline } from "./helpers/scenarios-variance-baseline";
import { CHANNELS, DELTA, planId, planName, sevenChannelMeeting, supersede, type Meeting7 } from "./helpers/seven-channel-meeting";

/*
 * V4-6 代理 B：G15 會議實例（06_BATCHES V4-6「驗收重點」；CHART_CATALOG G15 會議實例；PRD §4.1–§4.7 G15、§6.1 variant／headingLevel、§8.7）。
 * - chart-meeting-scenarios 在議程 5（meeting-agenda-5）內、每通路選入列 meeting-scenario-results 之前；section.chart-section.is-inline（沒有 .panel，不套卡片）、標題 h4（議程項 h3 之下）、固定高 sm。
 * - 每個通路一根（列序＝會議範圍的通路順序），最多 6 根；7 個通路各選一個方案時畫 6 根、資料表 7 列、最後一列「另 1 個」與軸文字共用，（6＋1）× row24 ≤ sm。
 * - status＝stale 的方案不畫柱，只列在資料表並在列名後標同頁議程 5 每通路列既有的 v3 用語「較早的方案（不列入這次決議）」（meeting.review.staleScenarios；
 *   V4-6 整合審查 B-V46-R1：同一頁同一個狀態只用一個名稱，不寫「過期」）；全部 stale 時空狀態（資料表照列）。
 * - 標題「{n} 個通路的選入方案」：不含任何方案名、不挑跨通路的最大值；零線＝各通路自己的現況（軸文字不寫金額）。
 * - 柱不可點（PRD §8.7 例外）：沒有熱區、沒有 onClick、資料表沒有 number-link；圖容器 aria-hidden 且內部 0 個可聚焦元素；不用強調色 chartColors.current。
 * - 試算頁 G15（chart-scenarios-variance）的輸出與 V4-6 開工錨點逐字相同（tests/fixtures/scenarios-variance-v4-5.json）；會議的匯出（Markdown、PDF）不含這張圖。
 * 斷言只用 testid、labels 與格式化函式。
 */

const copy = labels.meeting.chartsV4.scenarios;
const noop = () => undefined;
const count = (html: string, needle: string) => html.split(needle).length - 1;
const matches = (html: string, re: RegExp) => [...html.matchAll(re)].map(match => match[1]);
const rowsOf = (table: string) => matches(table, /<tr><th scope="row">([^<]*)<\/th>/g);

// 7 通路會議的資料與建法（sevenChannelMeeting、supersede…）在 V4-6 整合時原樣搬到 tests/helpers/seven-channel-meeting.ts（page-states 的 meeting-seven-channels 共用）。
const pageProps = ({ all, ws, review }: Meeting7): MeetingPageProps => ({ source: all, scenarioWorkspace: ws, actionWorkspace: emptyActionWorkspace(), review, history: [], onChange: noop, onEvidence: noop, onFinalize: async () => undefined });
const renderPage = (state: Meeting7) => renderToStaticMarkup(createElement(MeetingPage, pageProps(state)));

/** 模型單元測試用的選入方案（只填 G15 讀的欄位）。 */
const scenario = (channel: string, delta: string | null, status: SummaryScenario["status"] = "current"): SummaryScenario => ({ id: `ctx-${channel}::${planId(channel)}::1`, name: planName(channel), status, scopeLabel: channel, baseline: "270.00", contribution: delta === null ? null : String(270 + Number(delta)), delta, assumptions: [] });
const modelInput = (rows: [string, string | null, SummaryScenario["status"]?][], patch: Partial<MeetingScenariosInput> = {}): MeetingScenariosInput => ({
  scenarios: rows.map(([channel, delta, status]) => scenario(channel, delta, status)), references: rows.map(([channel]) => ({ channel, plan_id: planId(channel) })),
  channels: [...CHANNELS], alias: false, period: "8/2–8/2", ...patch,
});

describe("G15 會議實例模型（純函式）", () => {
  it("7 個通路各選一個方案：只畫 6 根（MEETING_SCENARIOS_MAX_BARS）、資料表 7 列、「另 1 個」；標題是通路數、不含方案名", () => {
    expect(MEETING_SCENARIOS_MAX_BARS).toBe(6);
    expect(hbarMaxRows("sm", "row24", 1)).toBe(MEETING_SCENARIOS_MAX_BARS);
    const model = meetingScenariosModel(modelInput(CHANNELS.map(channel => [channel, DELTA[channel]])));
    expect(model.bars.map(bar => bar.testId)).toEqual(CHANNELS.slice(0, 6).map(channel => `${MEETING_SCENARIOS_BAR_PREFIX}${planId(channel)}`));
    expect(model.tableRows.map(row => row.channel)).toEqual([...CHANNELS]);
    expect(model.more).toBe(fill(copy.more, { n: 1 }));
    expect(model.count).toBe(7);
    expect(model.title).toBe(fill(copy.title, { n: 7 }));
    for (const channel of CHANNELS) expect(model.title).not.toContain(planName(channel));
    // 柱只帶 domain 的差額（不相加、不挑最大值）：值、條端 L1 帶號、方案名＋通路。
    for (const [index, bar] of model.bars.entries()) {
      const channel = CHANNELS[index];
      expect([bar.value, bar.display, bar.label, bar.evidence]).toEqual([DELTA[channel], formatSignedDelta(DELTA[channel], "L1"), fill(copy.row, { plan: planName(channel), channel }), null]);
    }
  });

  it("色依 deltaTone（多賺 favorable、少賺 unfavorable、取位後為 0 total）；沒有任何柱用強調色", () => {
    const model = meetingScenariosModel(modelInput(CHANNELS.slice(0, 6).map(channel => [channel, DELTA[channel]])));
    expect(model.bars.map(bar => bar.tone)).toEqual(["favorable", "favorable", "unfavorable", "total", "favorable", "unfavorable"]);
    expect(model.more).toBeUndefined();
    const html = renderToStaticMarkup(createElement(MeetingScenariosSection, { model }));
    expect(html).not.toContain(chartColors.current);
    for (const fillColor of matches(html, /<rect class="ranked-bar[^"]*"[^>]*fill="([^"]+)"/g)) expect([chartColors.favorable, chartColors.unfavorable, chartColors.total]).toContain(fillColor);
  });

  it("列序＝會議範圍的通路順序（與選入順序無關）；不在範圍內的通路接在後面", () => {
    const model = meetingScenariosModel(modelInput([["POPUP", "-28.00"], ["DTC", "14.00"], ["OTHER", "5.00"], ["MARKETPLACE", "28.00"]]));
    expect(model.tableRows.map(row => row.channel)).toEqual(["DTC", "MARKETPLACE", "POPUP", "OTHER"]);
    expect(model.bars.map(bar => bar.key)).toEqual(model.tableRows.map(row => row.key));
  });

  it("stale 不畫柱、只列在資料表並在列名後標同頁每通路列的 v3 用語（較早的方案）；標題的 n 不算 stale 的；副標加註記；G15 的字串都不寫「過期」", () => {
    const model = meetingScenariosModel(modelInput([["DTC", "14.00"], ["MARKETPLACE", "28.00", "stale"], ["SOCIAL", "-14.00"]]));
    expect(model.bars.map(bar => bar.key)).toEqual([scenario("DTC", "14.00").id, scenario("SOCIAL", "-14.00").id]);
    expect(model.tableRows).toHaveLength(3);
    expect(model.title).toBe(fill(copy.title, { n: 2 }));
    expect(model.staleCount).toBe(1);
    expect(model.subtitle).toBe(`${fill(copy.subtitle, { section: copy.section, metric: metricDefinitions.contribution_after_marketing.label, period: "8/2–8/2" })} · ${fill(copy.staleNote, { n: 1 })}`);
    expect(model.message).toBeUndefined();
    const table = element(renderToStaticMarkup(createElement(MeetingScenariosSection, { model })), `data-testid="${MEETING_SCENARIOS_TABLE_TESTID}"`)!;
    expect(rowsOf(table)).toEqual([fill(copy.row, { plan: planName("DTC"), channel: "DTC" }), fill(copy.rowStatus, { row: fill(copy.row, { plan: planName("MARKETPLACE"), channel: "MARKETPLACE" }), status: labels.meeting.review.staleScenarios }), fill(copy.row, { plan: planName("SOCIAL"), channel: "SOCIAL" })]);
    // B-V46-R1：同一頁同一個狀態只用一個名稱——G15 會議實例的字串都不寫 managerSummary 的「過期」。
    for (const text of [copy.staleNote, copy.empty, copy.tableNote, copy.rowStatus]) expect(text).not.toContain(labels.meeting.managerSummary.scenarioStale);
  });

  it("全部過期：空狀態（同高 sm、說明 copy.empty、標題用區塊標準名），資料表照列；副標＝subtitleEmpty——不重複標題、不再接 staleNote（審查 R1-V46-S3：較早的方案只由圖區說明講一次）", () => {
    const model = meetingScenariosModel(modelInput([["DTC", "14.00", "stale"]]));
    const html = renderToStaticMarkup(createElement(MeetingScenariosSection, { model }));
    expect(model.title).toBe(copy.section);
    expect(model.subtitle).toBe(fill(copy.subtitleEmpty, { period: "8/2–8/2" }));
    expect(model.message).toBe(copy.empty);
    expect(openTag(html, 'class="chart-frame sm"')).toContain(`style="height:${chartHeights.sm}px"`);
    expect(openTag(html, 'class="chart-frame sm"')).toContain('data-state="empty"');
    expect(textOf(element(html, 'class="chart-frame-message"')!)).toBe(copy.empty);
    const sub = textOf(element(html, 'id="meeting-scenarios-sub"')!);
    expect(sub).toBe(model.subtitle);
    expect(sub).not.toContain(copy.section);
    expect(sub).not.toContain(fill(copy.staleNote, { n: 1 }));
    expect(html).not.toContain(MEETING_SCENARIOS_BAR_PREFIX);
    expect(rowsOf(element(html, `data-testid="${MEETING_SCENARIOS_TABLE_TESTID}"`)!)).toHaveLength(1);
    expect(matches(element(html, '<details class="data-alternative"')!, /<p class="note">([^<]*)<\/p>/g)).toEqual([copy.tableNote]);
  });

  it("沒有選入方案（審查 R1-V46-S1）：照樣渲染等高空狀態——標題＝區塊標準名、副標＝subtitleEmpty、圖區說明 emptyNone；資料表 0 列、表後只有 tableEmpty；沒有柱、沒有 svg", () => {
    const model = meetingScenariosModel(modelInput([]));
    expect([model.title, model.subtitle, model.message, model.count, model.staleCount, model.bars, model.more, model.tableRows]).toEqual([copy.section, fill(copy.subtitleEmpty, { period: "8/2–8/2" }), copy.emptyNone, 0, 0, [], undefined, []]);
    const html = renderToStaticMarkup(createElement(MeetingScenariosSection, { model }));
    expect(openTag(html, 'class="chart-frame sm"')).toContain(`style="height:${chartHeights.sm}px"`);
    expect(openTag(html, 'class="chart-frame sm"')).toContain('data-state="empty"');
    expect(openTag(html, 'class="chart-frame sm"')).not.toContain("aria-hidden");
    expect(textOf(element(html, 'class="chart-frame-message"')!)).toBe(copy.emptyNone);
    expect(html).not.toContain("<svg");
    expect(element(element(html, `data-testid="${MEETING_SCENARIOS_TABLE_TESTID}"`)!, "<tbody>")).toBe("<tbody></tbody>");
    expect(matches(element(html, '<details class="data-alternative"')!, /<p class="note">([^<]*)<\/p>/g)).toEqual([copy.tableEmpty]);
    // 與議程 5 下方 v3 的區段型空狀態互補，不重複同一句。
    for (const text of [labels.empty.stateV3.meetingNoScenarioTitle, labels.empty.stateV3.meetingNoScenarioBody]) expect(textOf(html)).not.toContain(text);
  });
});

describe("C25 axisWithMore：軸文字與「另 n 個」共用最後一列", () => {
  const rows = (values: string[]): RankedBarRow<null>[] => values.map((value, index) => ({ key: `k${index}`, label: `P${index} · CH`, value, tone: "total", display: value, evidence: null }));
  const six = ["14.00", "28.00", "-14.00", "0.00", "42.00", "-28.00"];
  const row = chartRowHeights.row24;

  it("6 根＋「另 1 個」：列數 7、高 168 ≤ sm；軸文字與「另 n 個」同一條基線、在「另 n 個」之後；刻度從柱列底往下 RANKED_AXIS_TICK", () => {
    for (const width of [324, 560, 1000]) {
      const geometry = hbarGeometry(rows(six), width, "variance", { rowHeight: "row24", axis: copy.axis, more: fill(copy.more, { n: 1 }), axisWithMore: true });
      expect(geometry.rowCount, `@${width}`).toBe(7);
      expect(geometry.height).toBe(7 * row);
      expect(geometry.height).toBeLessThanOrEqual(chartHeights.sm);
      const block = geometry.blocks[0];
      expect(geometry.axis!.label.y).toBe(block.more!.y);
      expect(geometry.axis!.tick).toEqual({ y1: 6 * row, y2: 6 * row + RANKED_AXIS_TICK });
      const half = rankedTextWidth(copy.axis) / 2;
      expect(geometry.axis!.label.x - half).toBeGreaterThanOrEqual(rankedTextWidth(block.more!.text) + RANKED_TEXT_PAD - 0.05);
      expect(geometry.axis!.label.x + half).toBeLessThanOrEqual(geometry.width + 0.05);
    }
  });

  it("沒有「另 n 個」或沒給 axisWithMore 時與 V4-5 相同（軸列另佔一列）", () => {
    const options = { rowHeight: "row24" as const, axis: copy.axis };
    expect(hbarGeometry(rows(six), 560, "variance", { ...options, axisWithMore: true })).toEqual(hbarGeometry(rows(six), 560, "variance", options));
    const withMore = { ...options, more: fill(copy.more, { n: 1 }) };
    const separate = hbarGeometry(rows(six), 560, "variance", withMore);
    expect(separate.rowCount).toBe(8);
    expect(separate.axis!.tick).toEqual({ y1: 6 * row, y2: 7 * row + RANKED_AXIS_TICK });
  });

  it("試算頁 G15 與帶軸列的 RankedBars 輸出和 V4-6 開工錨點（6142950）逐字相同", async () => {
    const expected = JSON.parse(readFileSync(SCENARIOS_VARIANCE_BASELINE_FILE, "utf8")) as Record<string, string>;
    const actual = await scenariosVarianceBaseline();
    expect(Object.keys(actual)).toEqual(Object.keys(expected));
    for (const key of Object.keys(expected)) expect(actual[key], key).toBe(expected[key]);
    // 基準確實涵蓋試算頁三種狀態（兩個有效＋一個不能試算、只有一個、還沒有方案）。
    expect(expected["page golden-dtc three-plans"]).toContain('data-testid="chart-scenarios-variance-bar-q"');
    expect(expected["page golden-dtc first-visit"]).toContain('data-state="empty"');
  }, 60_000);
});

describe("G15 會議實例：7 個通路各選一個方案的會議頁", () => {
  let state: Meeting7, html: string, five: string, section: string;
  /** 會議範圍的通路順序（review.meeting_filters.channels；快照的範圍依代碼排序）＝圖與資料表的列序。 */
  let scope: (typeof CHANNELS)[number][];
  beforeAll(async () => {
    state = await sevenChannelMeeting();
    scope = state.review.meeting_filters.channels as (typeof CHANNELS)[number][];
    html = renderPage(state);
    five = element(html, 'data-testid="meeting-agenda-5"')!;
    section = element(html, `data-testid="${MEETING_SCENARIOS_TESTID}"`)!;
  }, 60_000);

  it("試算值不變：每個通路的現況 270.00、差額＝−140 × 物流費增減", () => {
    const context = buildReviewDecisionContext(state.review, state.ws, emptyActionWorkspace());
    expect(context.scenarios).toHaveLength(7);
    for (const row of context.scenarios) {
      const channel = CHANNELS.find(item => row.id.includes(`::${planId(item)}::`))!;
      expect([row.baseline, row.delta, row.status]).toEqual(["270.00", DELTA[channel], "current"]);
    }
  });

  it("全頁 1 個，在議程 5 內、說明句之後、每通路選入列 meeting-scenario-results 之前；inline（沒有 .panel）、h4、固定高 sm", () => {
    expect(count(html, `data-testid="${MEETING_SCENARIOS_TESTID}"`)).toBe(1);
    expect(five).toContain(section);
    expect(five.indexOf(section)).toBeGreaterThan(five.indexOf(labels.meeting.page.scenariosNote));
    expect(five.indexOf(section) + section.length).toBeLessThanOrEqual(five.indexOf('data-testid="meeting-scenario-results"'));
    const open = openTag(html, `data-testid="${MEETING_SCENARIOS_TESTID}"`)!;
    expect(open).toMatch(/^<section class="chart-section is-inline meeting-scenarios-chart"/);
    expect(open).not.toMatch(/class="[^"]*\bpanel\b/);
    for (const attr of ['aria-labelledby="meeting-scenarios-title"', 'aria-describedby="meeting-scenarios-sub"']) expect(open).toContain(attr);
    // 議程項標題 h3 → 圖的標題 h4（不跳級）；議程項不是 .panel，圖區塊也不是。
    expect(five).toMatch(/^<section class="meeting-agenda-item"[^>]*><h3 /);
    expect(section).toContain(`<h4 id="meeting-scenarios-title">${fill(copy.title, { n: 7 })}</h4>`);
    expect(openTag(section, 'class="chart-frame sm"')).toContain(`style="height:${chartHeights.sm}px"`);
  });

  it("只畫 6 根（會議範圍通路順序的前 6 個）、資料表 7 列、最後一列「另 1 個」與軸文字共用；svg 高 (6＋1) × row24 ≤ sm", () => {
    expect([...scope].sort()).toEqual([...CHANNELS].sort());
    expect(matches(section, /data-testid="(chart-meeting-scenarios-bar-[^"]+)"/g)).toEqual(scope.slice(0, 6).map(channel => `${MEETING_SCENARIOS_BAR_PREFIX}${planId(channel)}`));
    expect(section).not.toContain(`${MEETING_SCENARIOS_BAR_PREFIX}${planId(scope[6])}`);
    const svg = openTag(section, 'class="chart-ranked-bars"')!;
    expect(svg).toContain('data-rows="7"');
    expect(svg).toContain(`height="${7 * chartRowHeights.row24}"`);
    expect(7 * chartRowHeights.row24).toBeLessThanOrEqual(chartHeights.sm);
    expect(textOf(element(section, 'class="ranked-more"')!)).toBe(fill(copy.more, { n: 1 }));
    expect(textOf(element(section, 'class="ranked-axis-label"')!)).toBe(copy.axis);
    // 條端 L1 帶號、方案名在左（含通路）。
    expect(matches(section, /<text class="chart-value ranked-value[^"]*"[^>]*>([^<]+)<\/text>/g)).toEqual(scope.slice(0, 6).map(channel => formatSignedDelta(DELTA[channel], "L1")));
    expect(matches(section, /<text class="ranked-label"[^>]*>([^<]+)<\/text>/g)).toEqual(scope.slice(0, 6).map(channel => fill(copy.row, { plan: planName(channel), channel })));
    // 資料表：全部 7 列（含沒畫成柱的第 7 個通路），L2 純文字。
    const table = element(section, `data-testid="${MEETING_SCENARIOS_TABLE_TESTID}"`)!;
    expect(rowsOf(table)).toEqual(scope.map(channel => fill(copy.row, { plan: planName(channel), channel })));
    const cells = matches(table, /<td class="num[^"]*">([^<]+)<\/td>/g);
    expect(cells).toEqual(scope.flatMap(channel => [formatAmountL2(String(270 + Number(DELTA[channel]))), formatSignedDelta(DELTA[channel], "L2")]));
    // 欄名沿用試算頁 G15（scenarios.inputs.resultTitle、vsBaseline），列名欄是 copy.planColumn。
    for (const name of [copy.planColumn, fill(labels.format.units.yuanColumn, { label: labels.scenarios.inputs.resultTitle }), fill(labels.format.units.yuanColumn, { label: labels.scenarios.inputs.vsBaseline })]) expect(table).toContain(`<th scope="col"${name === copy.planColumn ? "" : ' class="num"'}>${name}</th>`);
  });

  it("標題與副標：通路數、不含方案名、不挑最大值；副標寫零線是各通路自己的現況與會議本期", () => {
    const title = textOf(element(section, 'id="meeting-scenarios-title"')!);
    expect(title).toBe(fill(copy.title, { n: 7 }));
    for (const channel of CHANNELS) expect(title).not.toContain(planName(channel));
    const period = formatPeriodL1(state.review.meeting_filters.current_period.start, state.review.meeting_filters.current_period.end, { days: false, anchor: state.review.data_as_of });
    expect(textOf(element(section, 'id="meeting-scenarios-sub"')!)).toBe(fill(copy.subtitle, { section: copy.section, metric: metricDefinitions.contribution_after_marketing.label, period }));
  });

  it("柱不可點、圖內 0 個可聚焦元素、資料表沒有 number-link；圖不用強調色", () => {
    const frame = element(section, 'class="chart-frame sm"')!;
    expect(openTag(section, 'class="chart-frame sm"')).toContain('aria-hidden="true"');
    expect(frame).not.toMatch(/tabindex|<a[\s>]|<button|<input|<select|<details|ranked-hit|is-clickable/);
    expect(section).not.toContain("number-link");
    expect(frame).not.toContain(chartColors.current);
  });

  it("chart-lint SSR（CL-1、CL-2、CL-9、CL-11）沒有違規；會議頁主層獨立圖區塊含 G15 會議實例、≤ 3", () => {
    const result = checkChartMarkup(html, { page: "meeting" });
    for (const [rule, violations] of Object.entries(result.violations)) expect(violations, rule).toEqual([]);
    expect(result.mainSections).toContain(MEETING_SCENARIOS_TESTID);
    expect(result.mainSections.length).toBeLessThanOrEqual(3);
  });

  it("一個通路的方案過期（stale）：該通路不畫、資料表列名後標 v3 用語（較早的方案）；可畫的 6 個剛好 6 根、沒有「另 n 個」，標題 6", async () => {
    const stale = { ...state, ws: supersede(state.ws, "LIVE") };
    const markup = element(renderPage(stale), `data-testid="${MEETING_SCENARIOS_TESTID}"`)!;
    expect(matches(markup, /data-testid="chart-meeting-scenarios-bar-([^"]+)"/g)).toEqual(scope.filter(channel => channel !== "LIVE").map(planId));
    expect(markup).not.toContain('class="ranked-more"');
    expect(textOf(element(markup, 'id="meeting-scenarios-title"')!)).toBe(fill(copy.title, { n: 6 }));
    const table = element(markup, `data-testid="${MEETING_SCENARIOS_TABLE_TESTID}"`)!;
    expect(rowsOf(table)).toHaveLength(7);
    expect(rowsOf(table)[scope.indexOf("LIVE")]).toBe(fill(copy.rowStatus, { row: fill(copy.row, { plan: planName("LIVE"), channel: "LIVE" }), status: labels.meeting.review.staleScenarios }));
  });

  it("匯出不含這張圖：會議 Markdown 與列印（PDF）沒有 G15 會議實例的字串與 testid", () => {
    const context = buildReviewDecisionContext(state.review, state.ws, emptyActionWorkspace());
    const summary = buildManagerSummary(state.all.snapshot);
    const markdown = exportManagerSummaryMarkdown(summary, context);
    for (const text of [copy.section, copy.axis, fill(copy.title, { n: 7 })]) expect(markdown).not.toContain(text);
    const print = renderToStaticMarkup(createElement(PrintSummary, { summary, decisionContext: context, snapshot: state.all.snapshot, meeting: { name: state.review.name, date: "2026-10-03" } }));
    expect(print).not.toContain(MEETING_SCENARIOS_TESTID);
    expect(print).not.toContain(copy.section);
  });
});

describe("G15 會議實例：labels 與投影", () => {
  it("標題子句 ≤ 14 字、不含方案名占位符；主層字串沒有否定句樣板（B8）、沒有「預測」", () => {
    for (const clause of l1ClauseLengths(copy.title, channelAliasTerms(labels))) expect(clause).toBeLessThanOrEqual(L1_MAX_CJK);
    expect(copy.title).not.toMatch(/\{plan\}|\{name\}/);
    for (const text of [copy.title, copy.section, copy.subtitle, copy.staleNote, copy.empty, copy.axis, copy.more]) {
      expect(text).not.toMatch(/不是|不代表|不等於|不可/);
      expect(text).not.toContain("預測");
    }
  });

  it("議程 5 是議程清單的第 5 項，投影只顯示議程 1–2（present 規則隱藏 nth-child(n+3)，G15 會議實例跟著隱藏）", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain(':root[data-mode="present"] .meeting-agenda-list > .meeting-agenda-entry:nth-child(n+3)');
    // 會議實例的樣式只在 V4-6 B 錨點內，沒有任何 present 規則把它放回來。
    const anchor = css.slice(css.indexOf("/* ── V4-6 B："), css.indexOf("/* ── V4-6 B 錨點結束 ── */"));
    expect(anchor).toContain(".meeting-scenarios-chart");
    expect(css.match(/meeting-scenarios-chart/g)).toHaveLength(anchor.match(/meeting-scenarios-chart/g)!.length);
    expect(anchor).not.toContain("present");
  });
});
