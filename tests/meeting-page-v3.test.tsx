import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { expected, fixture } from "./helpers/fixtures";
import { validateDataset } from "@/domain/validation";
import type { AnalysisFilters } from "@/domain/types";
import { createSnapshot, hashInput } from "@/application/workspace";
import { saveScenario } from "@/application/decision";
import { emptyScenarioWorkspace, ensureScenarioContext, scenarioContextDecision, scenarioSelectionRef, updateScenarioContext, type ScenarioWorkspace } from "@/application/scenario-workspace";
import { createReviewSession, rebuildReviewSnapshot, selectReviewScenario, syncReviewPins, updateReviewSession, type ReviewSession } from "@/application/review-session";
import { addActionDraft, editActionManagement, emptyActionWorkspace, pinAction, taipeiToday, type ActionWorkspace } from "@/application/action-workspace";
import { finalizeMeeting, freezeMeeting, validateMeeting, type Meeting } from "@/application/meeting";
import { buildManagerSummary } from "@/application/manager-summary";
import { snapshotSentence } from "@/application/weekly-summary";
import { formatAmountL1, formatAmountL2, formatDateL1, formatSignedDelta } from "@/application/presentation";
import { MeetingHistory, MeetingPage, type MeetingPageProps } from "@/components/meeting-page";
import { TopThree } from "@/components/top-three";
import { PrintSummary } from "@/components/print-summary";
import { headlineChangeText } from "@/components/manager-summary";
import styles from "@/components/manager-summary.module.css";
import { fill, labels } from "@/i18n";

/*
 * V3-7 代理 A：會議紀錄頁文件式版面（PRD §7.6、§6.3 #43–#50、§6.4 M1／M6、D-V3-22）的 SSR 驗收。
 * golden fixture 的手算值：淨營收 2,250.00 → 2,470.00（+220.00）、扣廣告後貢獻 570.00 → 255.00（−315.00）；
 * DTC 270.00（差額 −130.00）、MARKETPLACE −15.00（差額 −185.00）；DTC 方案 p（物流費 −10%）試算後 284.00（+14.00）。
 */
const pageV3 = labels.meeting.pageV3, page = labels.meeting.page, record = labels.meeting.record, copy = labels.meeting.review, summaryCopy = labels.meeting.managerSummary;
const NOW = "2026-10-03T06:00:00.000Z";
const inputs = { volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "-10", ad_change_pct: "0", one_time_cost: "0", assumptions_accepted: true };
const noop = () => undefined;
async function source(name = "golden", filters: AnalysisFilters = {}) {
  const input = fixture(name); const dataset = validateDataset(input).dataset!;
  return { input, dataset, snapshot: await createSnapshot(dataset, filters, await hashInput(input)), revision: 1 };
}
/** 與 tests/meeting-page.test.tsx 相同：DTC 方案 p 選入會議；待辦 a1（置頂、進行中）與 a2（未置頂）。 */
async function setup() {
  const s = await source();
  let scenarios: ScenarioWorkspace = ensureScenarioContext(emptyScenarioWorkspace("e"), await source("golden", { channels: ["DTC"] }));
  const context = scenarios.contexts[0], draft = scenarioContextDecision(context);
  draft.scenarios = saveScenario(context.session, [], { id: "p", name: "履約", inputs });
  scenarios = updateScenarioContext(scenarios, context.id, draft);
  const diagnostic = s.snapshot.report.diagnostics.find(row => row.code === "REV_UP_CM_DOWN" && row.scope.kind === "all")!;
  let actions: ActionWorkspace = addActionDraft(emptyActionWorkspace(), s, "a1", diagnostic.id);
  actions = addActionDraft(actions, s, "a2");
  actions = pinAction(actions, "a1", true);
  actions = editActionManagement(actions, "a1", { execution_status: "in_progress" }, "2026-10-01");
  let review: ReviewSession = createReviewSession(s, "e", "rev-1");
  review = selectReviewScenario(review, scenarios, scenarioSelectionRef(scenarios.contexts[0], "p"));
  review = syncReviewPins(review, actions);
  review = updateReviewSession(review, { name: "十月例會", decision_state: "adopted", notes: "照做", meeting_date: "2026-10-03" });
  return { s, scenarios, actions, review };
}
async function finalized() {
  const state = await setup();
  const meeting = finalizeMeeting({ review: state.review, snapshot: await rebuildReviewSnapshot(state.review), scenarios: state.scenarios, actions: state.actions, date: "2026-10-03", now: NOW });
  return { ...state, meeting };
}
/** v2 結束的紀錄：和 v3 的紀錄一樣，只是沒有 copy_version（D-V3-22）。 */
function asV2(meeting: Meeting): Meeting {
  const { copy_version: _version, ...rest } = structuredClone(meeting);
  void _version;
  return freezeMeeting(rest);
}
const summaryContext = { datasetName: "golden", missingItems: 0, allChannels: ["DTC", "MARKETPLACE"] };
function props(state: Awaited<ReturnType<typeof setup>>, extra: Partial<MeetingPageProps> = {}): MeetingPageProps {
  return { source: state.s, scenarioWorkspace: state.scenarios, actionWorkspace: state.actions, review: state.review, history: [], onChange: noop, onEvidence: noop, onFinalize: async () => undefined, onRemoveMeeting: noop, onCreateAction: noop, ...extra };
}
const render = (value: MeetingPageProps) => renderToStaticMarkup(createElement(MeetingPage, value));
/** 依某個屬性取出整個元素（同名標籤以巢狀深度配對）。 */
function element(html: string, attr: string): string {
  const at = html.indexOf(attr);
  expect(at, attr).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<", at);
  const tag = /^<([a-z0-9]+)/.exec(html.slice(start))![1];
  const pattern = new RegExp(`<${tag}[\\s>]|</${tag}>`, "g");
  pattern.lastIndex = start;
  let depth = 0;
  for (let match = pattern.exec(html); match; match = pattern.exec(html)) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(start, match.index + match[0].length);
  }
  throw new Error(`unclosed ${attr}`);
}
const block = (html: string, testId: string) => element(html, `data-testid="${testId}"`);
const openTag = (html: string, attr: string) => { const el = element(html, attr); return el.slice(0, el.indexOf(">") + 1); };
const text = (html: string) => html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#x27;/g, "'");
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("V3-7 §7.6 會議紀錄頁：不再有第二套 KPI 大卡，議程是 <ol>", () => {
  it("關鍵數字是兩個 L1 數字並排（C1 精簡版），沒有 v2 的 .headlines／.change 大卡；下方一行本期一句話", async () => {
    const state = await setup();
    const golden = expected();
    const html = render(props(state));
    for (const className of [styles.headlines, styles.change, styles.summary, styles.agendaStep]) expect(html, className).not.toContain(className);
    // class 屬性裡沒有獨立的 change／headlines token（meeting-kpi-change 這種複合名稱不算）。
    expect([...html.matchAll(/class="([^"]*)"/g)].flatMap(match => match[1].split(" ")).filter(token => token === "change" || token === "headlines")).toEqual([]);
    const one = block(html, "meeting-agenda-1");
    const kpis = element(one, 'class="meeting-kpis"');
    expect(kpis).toMatch(/^<dl class="meeting-kpis">/);
    const cells = [...kpis.matchAll(/<div class="meeting-kpi"><dt>([^<]+)<\/dt><dd class="meeting-kpi-value">([\s\S]*?)<\/dd><dd class="meeting-kpi-change">([\s\S]*?)<\/dd><dd class="meeting-kpi-previous">([\s\S]*?)<\/dd><\/div>/g)].map(match => match.slice(1).map(text));
    expect(golden.current.net_revenue).toBe("2470.00");
    expect(golden.current.contribution_after_marketing).toBe("255.00");
    expect(cells.map(row => [row[0], row[1], row[3]])).toEqual([
      [labels.metrics.net_revenue.headline, formatAmountL1("2470.00"), `${labels.shell.periods.previous} ${formatAmountL1("2250.00")}`],
      [labels.metrics.contribution_after_marketing.headline, formatAmountL1("255.00"), `${labels.shell.periods.previous} ${formatAmountL1("570.00")}`],
    ]);
    // 差額行沿用 headlineChangeText（方向詞＋萬＋成長率）；數字都是 number-link，可開「計算與來源」。
    expect(cells[1][2]).toContain(formatAmountL1("315.00"));
    expect(kpis.match(/<button type="button" class="number-link[^"]*"/g)).toHaveLength(6);
    expect(kpis).toContain('class="number-link negative"');
    expect(text(block(one, "meeting-sentence"))).toBe(snapshotSentence(state.s.snapshot, { importanceThreshold: "0.00", missingItems: 0 }).text);
  });

  it("議程是 <ol class=meeting-agenda-list>，6 個 <li> 依序是關鍵數字、本期重點、各通路表現、上次決議追蹤、選入方案、置頂待辦；每項 section＋h3 有對應的 id", async () => {
    const state = await setup();
    const html = render(props(state));
    const agenda = block(html, "meeting-agenda");
    const list = element(agenda, 'class="meeting-agenda-list"');
    expect(list).toMatch(/^<ol class="meeting-agenda-list" data-testid="manager-summary">/);
    const items = [...list.matchAll(/<li class="meeting-agenda-entry"><section class="meeting-agenda-item" id="(meeting-agenda-\d)" data-testid="(meeting-agenda-\d)" aria-labelledby="(meeting-agenda-\d-title)"><h3 id="(meeting-agenda-\d-title)" class="meeting-agenda-title">([^<]+)<\/h3>/g)];
    expect(items.map(match => match[1])).toEqual([1, 2, 3, 4, 5, 6].map(n => `meeting-agenda-${n}`));
    for (const match of items) { expect(match[2]).toBe(match[1]); expect(match[3]).toBe(`${match[1]}-title`); expect(match[4]).toBe(match[3]); }
    expect(items.map(match => match[5])).toEqual([record.agenda.kpis, record.agenda.priorities, record.agenda.channels, record.agenda.followUp, record.agenda.scenarios, record.agenda.actions]);
    // <ol> 的直接子元素只有 <li>（axe list 規則）；不用圈數字。
    expect(count(list, '<li class="meeting-agenda-entry">')).toBe(6);
    expect(text(agenda)).not.toMatch(/[①-⑳]/);
  });

  it("議程目錄：nav（議程目錄）> ol 的 6 個錨點連結 #meeting-agenda-{n}；SSR 時沒有 aria-current", async () => {
    const state = await setup();
    const html = render(props(state));
    const toc = element(html, `aria-label="${pageV3.tocAria}"`);
    expect(toc).toMatch(/^<nav class="meeting-toc"/);
    const links = [...toc.matchAll(/<a href="#(meeting-agenda-\d)">([^<]+)<\/a>/g)].map(match => [match[1], match[2]]);
    expect(links).toEqual([record.agenda.kpis, record.agenda.priorities, record.agenda.channels, record.agenda.followUp, record.agenda.scenarios, record.agenda.actions].map((title, index) => [`meeting-agenda-${index + 1}`, title]));
    expect(toc).not.toContain("aria-current");
    for (let n = 1; n <= 6; n++) expect(count(html, ` id="meeting-agenda-${n}"`), `#meeting-agenda-${n}`).toBe(1);
    // 目錄在議程之前（< 1280 收成頁首下方一列；≥ 1280 是左欄）。
    expect(html.indexOf('class="meeting-toc"')).toBeLessThan(html.indexOf('data-testid="meeting-agenda"'));
  });

  it("載入中（會議用另一個範圍、還在重建）：議程 1–3 仍有 section 與標題（目錄錨點不落空），沒有 manager-summary", async () => {
    const state = await setup();
    const html = render(props(state, { source: await source("golden", { channels: ["DTC"] }) }));
    for (let n = 1; n <= 6; n++) expect(html).toContain(`data-testid="meeting-agenda-${n}"`);
    expect(html).not.toContain('data-testid="manager-summary"');
    expect(text(block(html, "meeting-agenda-1"))).toContain(copy.rebuilding);
  });
});

describe("V3-7 §7.6 第 1 點：頁首動作列", () => {
  it("順序是標題、名稱、日期、決議 select、結束會議、複製週會摘要、匯出會議；殼層 h1 之外本頁只用 h2", async () => {
    const state = await setup();
    const html = render(props(state, { summaryContext }));
    const head = block(html, "review-workbench");
    expect(head).toMatch(/^<div class="meeting-head" data-testid="review-workbench">/);
    const marks = ['data-testid="meeting-title"', 'value="十月例會"', 'type="date"', `aria-label="${labels.meeting.form.decision}"`, 'data-testid="meeting-finalize"', 'data-testid="meeting-copy-summary"', 'data-testid="export-page-meeting"'];
    const positions = marks.map(mark => head.indexOf(mark));
    expect(positions.every(position => position > -1), marks.join()).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(openTag(head, 'data-testid="meeting-title"')).toBe('<h2 id="meeting-title" class="meeting-title" data-testid="meeting-title" tabindex="-1">');
    expect(text(block(head, "meeting-title"))).toBe(pageV3.title);
    expect(html).not.toContain("<h1");
    // 決議容器包住 select 與「結束會議」（主要按鈕，提示用 aria-describedby）；「複製週會摘要」是次要按鈕，旁邊一個 role=status。
    const decision = block(head, "meeting-decision");
    expect(decision).toContain("<select");
    expect(openTag(decision, 'data-testid="meeting-finalize"')).toBe('<button type="button" class="ui-btn ui-btn-primary" data-testid="meeting-finalize" aria-describedby="meeting-finalize-hint">');
    expect(text(element(decision, 'id="meeting-finalize-hint"'))).toBe(page.finalizeHint);
    expect(openTag(head, 'data-testid="meeting-copy-summary"')).toBe('<button type="button" class="ui-btn ui-btn-secondary" data-testid="meeting-copy-summary">');
    expect(text(block(head, "meeting-copy-summary"))).toBe(labels.overview.snapshotUi.copy);
    expect(openTag(head, 'data-testid="meeting-copy-summary-status"')).toBe('<span class="copy-status meeting-copy-status" role="status" data-testid="meeting-copy-summary-status">');
    // 全頁只有一顆主要按鈕（結束會議）；確認區、錯誤還沒出現。
    expect(count(html, "ui-btn-primary")).toBe(1);
    expect(html).not.toContain('data-testid="meeting-finalize-confirm"');
  });

  it("沒有 summaryContext 時不渲染「複製週會摘要」；會議資料還在重建時按鈕停用", async () => {
    const state = await setup();
    expect(render(props(state))).not.toContain("meeting-copy-summary");
    const loading = render(props(state, { summaryContext, source: await source("golden", { channels: ["DTC"] }) }));
    expect(openTag(loading, 'data-testid="meeting-copy-summary"')).toContain('disabled=""');
  });

  it("「匯出會議」是收合的頁內下拉（內容保持掛載），五項在 details 內；結束列印不在下拉內", async () => {
    const state = await setup();
    const html = render(props(state));
    const menu = block(html, "meeting-outputs");
    expect(openTag(html, 'data-testid="meeting-outputs"')).not.toMatch(/\sopen=""/);
    for (const id of ["meeting-export-pdf", "meeting-export-markdown", "meeting-export-csv", "meeting-export-excel", "meeting-export-pptx"]) {
      expect(menu, id).toContain(`data-testid="${id}"`);
      expect(count(html, `data-testid="${id}"`), id).toBe(1);
    }
    expect(html).not.toContain(summaryCopy.exitPrint);
  });
});

describe("V3-7 §7.6 第 3 點：固定範圍與差異橫幅", () => {
  it("範圍不同時是 C22 橫幅：一句話＋「檢視差異」（收合）＋「用目前資料更新會議」；技術細節收合；同範圍時不出現", async () => {
    const state = await setup();
    const html = render(props(state, { source: await source("golden", { channels: ["DTC"] }) }));
    const banner = block(html, "review-view-difference");
    expect(banner.startsWith('<div class="ui-banner meeting-banner" data-testid="review-view-difference">')).toBe(true);
    expect(text(banner)).toMatch(new RegExp(`^${pageV3.viewDifferenceBanner}${pageV3.viewDifferenceToggle}`));
    expect(openTag(banner, 'class="topbar-menu auto-close meeting-banner-detail"')).not.toMatch(/\sopen=""/);
    expect(text(element(html, 'class="meeting-technical"'))).toBe(`${labels.evidence.sections.technicalDetails}${copy.refreshHint}`);
    expect(render(props(state))).not.toContain("review-view-difference");
  });
});

describe("V3-7 §7.6 第 4 點：議程 2、3、5 的精簡呈現", () => {
  it("本期重點是 C9 清單型（li.alert-row > details.alert）：summary 只有狀態標籤、L1 標題與影響金額（沒有按鈕）；展開才有原因與下一步、看明細、加入待辦", async () => {
    const state = await setup();
    const html = render(props(state));
    const two = block(html, "meeting-agenda-2");
    const summary = buildManagerSummary(state.s.snapshot);
    expect(summary.priorities.map(row => row.code)).toEqual(["REV_UP_CM_DOWN", "DISCOUNT_BURDEN_UP", "MARKETING_BURDEN_UP"]);
    for (const [code, impact] of [["REV_UP_CM_DOWN", "-315.00"], ["DISCOUNT_BURDEN_UP", "-250.00"], ["MARKETING_BURDEN_UP", "-150.00"]] as const) {
      const row = block(two, `manager-priority-${code}`);
      expect(row).toMatch(new RegExp(`^<li class="alert-row meeting-priority" data-testid="manager-priority-${code}"><details class="alert meeting-priority-row"><summary>`));
      const head = element(row, "<summary>");
      expect(head).not.toContain("<button");
      expect(head).toContain('class="ui-lozenge" data-tone="unfavorable"');
      expect(text(head)).toContain(formatSignedDelta(impact, "L1"));
      const body = row.slice(row.indexOf("</summary>"));
      for (const label of [labels.diagnosis.sections.cause, labels.diagnosis.sections.nextStep, labels.overview.alerts.limitation]) expect(text(body)).toContain(label);
      expect(body).toContain(`>${labels.evidence.buttons.viewEvidence}</button>`);
      expect(body).toContain(`>${labels.actions.buttons.addToActions}</button>`);
    }
    expect(text(two)).toContain(fill(labels.overview.notes.omittedGroups, { n: summary.omitted_group_count }));
  });

  it("會議門檻與總覽門檻互不影響：會議稿的 importance_threshold 只改會議議程 2，總覽三件事（TopThree）仍用自己的 state", async () => {
    const state = await setup();
    const review = updateReviewSession(state.review, { importance_threshold: "315.01" });
    expect(review.importance_threshold).toBe("315.01");
    const html = render(props(state, { review }));
    const two = block(html, "meeting-agenda-2");
    expect(two).not.toContain("manager-priority-");
    expect(text(two)).toContain(labels.overview.notes.noPriorities);
    // 門檻表單在收合的「調整門檻」裡，值是會議稿自己的門檻。
    const threshold = element(two, 'class="meeting-threshold"');
    expect(openTag(two, 'class="meeting-threshold"')).toBe('<details class="meeting-threshold">');
    expect(threshold).toContain('data-testid="threshold-form-meeting"');
    expect(threshold).toContain('value="315.01"');
    // 同一份資料的總覽三件事：門檻仍是 0.00，三列都在。
    const overview = renderToStaticMarkup(createElement(TopThree, { snapshot: state.s.snapshot, onEvidence: noop }));
    expect(overview).toContain('data-testid="threshold-form-overview"');
    expect(element(overview, 'data-testid="threshold-form-overview"')).toContain('value="0.00"');
    for (const code of ["REV_UP_CM_DOWN", "DISCOUNT_BURDEN_UP", "MARKETING_BURDEN_UP"]) expect(overview).toContain(`data-testid="overview-priority-${code}"`);
    // 反過來：總覽門檻設很高，不會改到會議議程。
    const strict = renderToStaticMarkup(createElement(TopThree, { snapshot: state.s.snapshot, onEvidence: noop, initialThreshold: "999999.00" }));
    expect(strict).not.toContain("overview-priority-REV_UP_CM_DOWN");
    expect(render(props(state))).toContain('data-testid="manager-priority-REV_UP_CM_DOWN"');
  });

  it("各通路表現：精簡表（通路、本期、差額；L2 number-link，單位只在表頭）＋收合的「完整通路寬表」（region 與 v2 相同）", async () => {
    const state = await setup();
    const three = block(render(props(state)), "meeting-agenda-3");
    const table = element(three, 'class="ui-table meeting-channel-table"');
    expect(text(element(table, "<thead>"))).toBe([summaryCopy.channelColumn, fill(labels.format.units.yuanColumn, { label: labels.shell.periods.current }), fill(labels.format.units.yuanColumn, { label: summaryCopy.changeColumn })].join(""));
    const rows = [...table.matchAll(/<tr><th scope="row">([^<]+)<\/th><td class="num">([\s\S]*?)<\/td><td class="num">([\s\S]*?)<\/td><\/tr>/g)].map(match => match.slice(1).map(text));
    expect(rows).toEqual([["DTC", formatAmountL2("270.00"), formatSignedDelta("-130.00", "L2")], ["MARKETPLACE", formatAmountL2("-15.00"), formatSignedDelta("-185.00", "L2")]]);
    expect(table.match(/class="number-link/g)).toHaveLength(4);
    const wide = element(three, 'class="meeting-wide-table"');
    expect(wide).toMatch(new RegExp(`^<details class="meeting-wide-table"><summary>${pageV3.fullChannelTable}</summary>`));
    expect(wide).toContain(`role="region" aria-label="${labels.overview.sections.channelTableAria}"`);
  });

  it("V3-10 可及名稱（WCAG 2.5.3、Lighthouse label-content-name-mismatch）：議程 1 的 6 個與精簡表的 4 個 number-link，名稱＝抽屜標題＋可見文字（meeting.pageV3.linkAria）", async () => {
    const state = await setup();
    const html = render(props(state));
    const summary = buildManagerSummary(state.s.snapshot);
    /** 一段 markup 內每個 number-link 的可及名稱（aria-label）與可見文字（都解開 HTML 跳脫）。 */
    const links = (part: string) => [...part.matchAll(/<button type="button" class="number-link[^"]*" aria-label="([^"]*)">([\s\S]*?)<\/button>/g)].map(match => ({ name: text(match[1]), shown: text(match[2]) }));
    const link = (title: string, value: string) => ({ name: fill(pageV3.linkAria, { title, value }), shown: value });
    const kpis = links(element(block(html, "meeting-agenda-1"), 'class="meeting-kpis"'));
    const table = links(element(block(html, "meeting-agenda-3"), 'class="ui-table meeting-channel-table"'));
    // 議程 1：每個指標依序是本期（L1）、差額行（headlineChangeText）、上期（L1）；抽屜標題（evidence.title）不變。
    expect(kpis).toEqual(summary.headlines.flatMap(row => [
      link(row.evidence.current.title, formatAmountL1(row.current.value)),
      link(row.evidence.change.title, headlineChangeText(row)),
      link(row.evidence.previous.title, formatAmountL1(row.previous.value)),
    ]));
    // 精簡表：每通路的本期與差額（L2 整數元、U+2212）。
    expect(table).toEqual(summary.channels.flatMap(row => [
      link(row.contribution.evidence.current.title, formatAmountL2(row.contribution.current.value)),
      link(row.contribution.evidence.change.title, formatSignedDelta(row.contribution.change.value, "L2")),
    ]));
    // golden 手算：本期扣廣告後貢獻 255.00；抽屜標題是「一頁摘要 · 全部（DTC、MARKETPLACE） 本期扣廣告後貢獻」。
    const metric = labels.metrics.contribution_after_marketing.headline;
    const title = fill(labels.meeting.managerSummary.evidenceCurrent, { scope: `${labels.overview.sections.total}（DTC、MARKETPLACE）`, metric });
    expect(kpis[3]).toEqual({ name: fill(pageV3.linkAria, { title, value: formatAmountL1("255.00") }), shown: formatAmountL1("255.00") });
    expect(table[3]).toEqual(link(fill(labels.meeting.managerSummary.evidenceChange, { scope: "MARKETPLACE", metric }), formatSignedDelta("-185.00", "L2")));
    // Lighthouse 的 10 個節點：每個名稱都逐字包含可見文字（含 U+2212），也仍包含抽屜標題（E2E 用非 exact 的名稱子字串定位仍可用）。
    expect(kpis.length + table.length).toBe(10);
    for (const entry of [...kpis, ...table]) expect(entry.name, entry.shown).toContain(entry.shown);
    expect([...kpis, ...table].filter(entry => entry.shown.includes("\u2212")).length).toBeGreaterThan(0);
  });

  it("選入方案：每通路一列；已選入的列有試算後扣廣告後貢獻與差額，假設收合；過期方案有 warning 狀態標籤", async () => {
    const state = await setup();
    const five = block(render(props(state)), "meeting-agenda-5");
    const result = block(five, "meeting-scenario-result");
    expect(text(result)).toContain(formatAmountL1("284.00"));
    expect(text(result)).toContain(formatSignedDelta("14.00", "L1"));
    expect(openTag(result, 'class="meeting-scenario-assumptions"')).toBe('<details class="meeting-scenario-assumptions">');
    expect(result).not.toContain("ui-lozenge");
    for (const channel of ["DTC", "MARKETPLACE"]) expect(five).toContain(`data-testid="meeting-scenario-select-${channel}"`);
    const context = state.scenarios.contexts[0], draft = scenarioContextDecision(context);
    draft.scenarios = saveScenario(context.session, draft.scenarios, { id: "p", name: "履約加碼", inputs: { ...inputs, fulfillment_change_pct: "-20" } });
    const stale = block(render(props(state, { scenarioWorkspace: updateScenarioContext(state.scenarios, context.id, draft), review: updateReviewSession(state.review, { decision_state: "draft" }) })), "meeting-scenario-result");
    expect(stale).toContain(`<span class="ui-lozenge" data-tone="warning">${copy.staleScenarios}</span>`);
  });
});

describe("V3-7 §7.6 第 5–7 點：備註、比較收合、歷史在最底", () => {
  it("決議備註在議程之後；與上次會議比較是預設收合的 details（testid 在 details 上）；會議歷史在最底", async () => {
    const state = await finalized();
    const html = render(props(state, { history: [state.meeting] }));
    expect(openTag(html, 'data-testid="meeting-compare"')).toBe('<details class="meeting-compare" data-testid="meeting-compare">');
    const compare = block(html, "meeting-compare");
    for (const id of ["meeting-compare-same_scope", "meeting-compare-note", "meeting-compare-kpis"]) expect(compare).toContain(`data-testid="${id}"`);
    expect(text(element(compare, "<summary"))).toBe(labels.meeting.sections.meetingCompare);
    const order = ['data-testid="meeting-agenda"', 'class="meeting-notes-block"', 'data-testid="meeting-compare"', 'data-testid="meeting-history"'].map(mark => html.indexOf(mark));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html.lastIndexOf("</section>", html.lastIndexOf("</section>") - 1)).toBeGreaterThan(html.indexOf('data-testid="meeting-history"'));
  });

  it("沒有會議稿時是 C10 頁面型空狀態：標題、既有說明、主要按鈕「建立這次的會議紀錄」（meeting-create）", async () => {
    const state = await setup();
    const html = render(props(state, { review: null }));
    const empty = block(html, "review-workbench");
    expect(empty).toMatch(/^<div class="ui-empty-page meeting-empty" data-testid="review-workbench"><h2>/);
    expect(text(element(empty, "<h2>"))).toBe(pageV3.emptyTitle);
    expect(text(empty)).toContain(copy.createIntro);
    expect(openTag(empty, 'data-testid="meeting-create"')).toBe('<button type="button" class="ui-btn ui-btn-primary" data-testid="meeting-create">');
    expect(html).toContain('data-testid="meeting-history"');
  });
});

describe("V3-7 §7.6 第 2 點、D-V3-22：已結束會議的結束標示與 v2 加註", () => {
  it("finalizeMeeting 寫 copy_version: \"v3\"；validateMeeting 接受沒有這個欄位的舊紀錄，拒絕其他值", async () => {
    const { meeting } = await finalized();
    expect(meeting.copy_version).toBe("v3");
    expect(() => validateMeeting(asV2(meeting))).not.toThrow();
    expect(asV2(meeting).copy_version).toBeUndefined();
    expect(() => validateMeeting({ ...structuredClone(meeting), copy_version: "v2" })).toThrow("INVALID_MEETING");
  });

  it("每筆歷史展開內容頂部一行結束標示（formatDateL1）；沒有 copy_version 的紀錄再加一行 v2 加註，數字與決議照紀錄", async () => {
    const { meeting } = await finalized();
    const note = fill(pageV3.snapshotNote, { date: formatDateL1(meeting.date, { today: taipeiToday() }) });
    const v3 = renderToStaticMarkup(createElement(MeetingHistory, { history: [meeting] }));
    expect(text(block(v3, "meeting-snapshot-note"))).toBe(note);
    expect(v3).not.toContain("meeting-v2-note");
    const old = renderToStaticMarkup(createElement(MeetingHistory, { history: [asV2(meeting)] }));
    const item = block(old, "meeting-history-item");
    // 兩行都在 summary 之後（展開內容頂部），summary 文字不變。
    const afterSummary = item.slice(item.indexOf("</summary>") + "</summary>".length);
    expect(afterSummary.startsWith(`<p class="meeting-snapshot-note" data-testid="meeting-snapshot-note">${note}</p><p class="meeting-snapshot-note" data-testid="meeting-v2-note">${pageV3.v2Note}</p>`)).toBe(true);
    expect(text(element(item, "<summary>"))).toBe(text(element(v3, "<summary>")));
    expect(text(item)).toContain(fill(page.historyKpiRow, { metric: labels.metrics.contribution_after_marketing.headline, previous: formatAmountL1("570.00"), current: formatAmountL1("255.00"), change: formatSignedDelta("-315.00", "L1") }));
    // 主層不出現版本字串（metric_version、schema）。
    expect(text(item)).not.toMatch(/contribution-v1|meeting-v1|copy_version/);
  });
});

describe("V3-7 §6.3 #43–#50 的 testid 全部存在（SSR）", () => {
  it("草稿、有歷史、範圍不同、沒有會議稿、空議程與列印版合起來涵蓋 #43–#50", async () => {
    const state = await finalized();
    const next = updateReviewSession(createReviewSession(state.s, "e", "rev-2"), { name: "十一月例會", meeting_date: "2026-11-03" });
    const second = finalizeMeeting({ review: next, snapshot: await rebuildReviewSnapshot(next), scenarios: state.scenarios, actions: state.actions, history: [state.meeting], date: "2026-11-03", now: "2026-11-03T06:00:00.000Z" });
    const markups = [
      render(props(state, { history: [state.meeting, second], summaryContext })),
      render(props(state, { source: await source("golden", { channels: ["DTC"] }) })),
      render(props(state, { review: null })),
      render(props(state, { scenarioWorkspace: emptyScenarioWorkspace("e"), actionWorkspace: emptyActionWorkspace(), review: createReviewSession(state.s, "e", "rev-3") })),
      renderToStaticMarkup(createElement(PrintSummary, { summary: buildManagerSummary(state.s.snapshot), decisionContext: undefined, snapshot: state.s.snapshot, meeting: { name: "十月例會", date: "2026-10-03" } })),
    ].join("");
    const ids = [
      "meeting-page", "meeting-status", "review-workbench", "review-view-difference", // #43
      "meeting-create", // #43a
      "meeting-agenda", "manager-summary", ...[1, 2, 3, 4, 5, 6].map(n => `meeting-agenda-${n}`), "manager-priority-REV_UP_CM_DOWN", "meeting-followup", "meeting-scenario-results", "meeting-scenario-result", "meeting-scenario-results-empty", "meeting-pinned-actions", "meeting-pinned-actions-empty", // #44
      "meeting-scenario-select-DTC", "meeting-scenario-select-MARKETPLACE", // #44a
      "threshold-form-meeting", // #45
      "meeting-decision", "meeting-finalize", // #46（確認區與錯誤在 tests/meeting-page.test.tsx 以元素樹驗證）
      "meeting-compare", "meeting-compare-same_scope", "meeting-compare-note", "meeting-compare-kpis", // #47
      "meeting-history", "meeting-history-item", "meeting-history-followup", "meeting-history-kpis", `meeting-history-remove-${second.id}`, "meeting-history-status", // #48
      "meeting-outputs", "meeting-export-excel", "meeting-export-pptx", // #49
      "manager-summary-print", // #50
    ];
    expect(ids.filter(id => !markups.includes(`data-testid="${id}"`))).toEqual([]);
    // #49：Excel／PPT 在「匯出會議」下拉（meeting-outputs）內。
    const outputs = block(markups, "meeting-outputs");
    for (const id of ["meeting-export-excel", "meeting-export-pptx"]) expect(outputs).toContain(`data-testid="${id}"`);
  });
});
