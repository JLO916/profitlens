import Decimal from "decimal.js";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { track, type AnalyticsEvent } from "../src/application/analytics";
import { channelsLabel, demoAlias, formatHeadlineAmount } from "../src/application/copy";
import { diagnosisGroups } from "../src/application/diagnosis-group";
import { deltaWord, formatAmountL1, formatDateL1, formatGrowth, formatMetric, formatPeriodL1, formatPointsValue, MINUS, metricDefinitions } from "../src/application/presentation";
import { buildWeeklySummary, snapshotSentence, type WeeklySummaryInput } from "../src/application/weekly-summary";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "../src/application/workspace";
import { compareMoney, percentagePointChange } from "../src/domain/metrics";
import type { Metric, RuleCode } from "../src/domain/types";
import { validateDataset } from "../src/domain/validation";
import { fill, labels } from "../src/i18n";
import { fixture } from "./helpers/fixtures";

// V3-4a 本期一句話（PRD §7.1 區塊 2）與 F1 週會摘要（PRD §10.2）。
// 期待值一律由 labels 模板＋格式化函式＋snapshot 的精確字串組出，不寫死數字（golden：本期扣廣告後貢獻 255.00、差額 −315.00，不改）。
// 其餘情境用 structuredClone(golden snapshot) 只改 report.previous／current.metrics 的呈現層輸入，不改 domain。

const sentences = labels.overview.snapshot.sentence;
const weekly = labels.summary.weekly;

async function snapshot(name = "golden"): Promise<WorkspaceSnapshot> {
  const input = fixture(name);
  const dataset = validateDataset(input).dataset!;
  return createSnapshot(dataset, {}, await hashInput(input));
}
let golden: WorkspaceSnapshot;
let demo: WorkspaceSnapshot;
beforeAll(async () => { golden = await snapshot("golden"); demo = await snapshot("demo"); });

const money = (value: string | null): Metric => value === null ? { value: null, reason_codes: ["MISSING_COGS"] } : { value, reason_codes: [] };
/** 改兩期的淨營收與扣廣告後貢獻（只改呈現層輸入）；diagnostics 可以另外篩選，用來做「沒有最大一項」與不足 3 件的情境。 */
function variant(values: { prevN?: string; curN?: string; prevCM?: string; curCM?: string | null }, keepRules?: readonly RuleCode[]): WorkspaceSnapshot {
  const snap = structuredClone(golden);
  const { previous, current } = snap.report;
  if (values.prevN !== undefined) previous.metrics.net_revenue = money(values.prevN);
  if (values.curN !== undefined) current.metrics.net_revenue = money(values.curN);
  if (values.prevCM !== undefined) previous.metrics.contribution_after_marketing = money(values.prevCM);
  if (values.curCM !== undefined) current.metrics.contribution_after_marketing = money(values.curCM);
  if (keepRules) snap.report.diagnostics = snap.report.diagnostics.filter(item => keepRules.includes(item.code));
  return snap;
}
const deltas = (snap: WorkspaceSnapshot) => {
  const { previous, current } = snap.report;
  return {
    revenue: compareMoney(previous.metrics.net_revenue, current.metrics.net_revenue).absolute_change.value!,
    contribution: compareMoney(previous.metrics.contribution_after_marketing, current.metrics.contribution_after_marketing).absolute_change.value!,
  };
};
/** 本期三件事中第一個不是「淨營收多卻少賺」也不是資料缺漏的項目。 */
const firstItem = (snap: WorkspaceSnapshot, importanceThreshold?: string) => diagnosisGroups(snap, { importanceThreshold }).priorities.find(group => group.rule !== "REV_UP_CM_DOWN" && group.rule !== "MISSING_CRITICAL_DATA");

describe("snapshotSentence：本期一句話的 7 種 kind（PRD §7.1 表格）", () => {
  it("golden 是「淨營收多、扣廣告後貢獻少」：差額與 KPI 帶同源（compareMoney），最大一項跳過與本句重複的 REV_UP_CM_DOWN", () => {
    const { revenue, contribution } = deltas(golden);
    const groups = diagnosisGroups(golden).priorities;
    // golden 的三件事第一列就是 REV_UP_CM_DOWN（標題「淨營收多…卻少賺…」），放進句子會重複，所以取下一個項目。
    expect(groups[0].rule).toBe("REV_UP_CM_DOWN");
    const top = firstItem(golden)!;
    expect(top.rule).toBe("DISCOUNT_BURDEN_UP");
    const result = snapshotSentence(golden);
    expect(result).toEqual({
      kind: "revenueUpContributionDown",
      text: fill(sentences.revenueUpContributionDown, { revenueDelta: formatHeadlineAmount(revenue), contributionDelta: formatHeadlineAmount(contribution), top: top.headline }),
      topHeadline: top.headline,
    });
    expect(result.text).not.toContain(groups[0].headline);
    expect(result.text).not.toContain(MINUS);
    expect(result.text).not.toContain("-");
  });

  it("示範資料：最大一項就是三件事第一列（折扣），與 PRD 範例同一個句型", () => {
    const { revenue, contribution } = deltas(demo);
    const groups = diagnosisGroups(demo).priorities;
    expect(groups[0].rule).toBe("DISCOUNT_BURDEN_UP");
    expect(snapshotSentence(demo)).toEqual({
      kind: "revenueUpContributionDown",
      text: fill(sentences.revenueUpContributionDown, { revenueDelta: formatHeadlineAmount(revenue), contributionDelta: formatHeadlineAmount(contribution), top: groups[0].headline }),
      topHeadline: groups[0].headline,
    });
  });

  it("沒有可列的最大一項時用 NoTop 句型；門檻把其他項目濾掉時也一樣", () => {
    const onlySelf = variant({}, ["REV_UP_CM_DOWN"]);
    const { revenue, contribution } = deltas(onlySelf);
    const values = { revenueDelta: formatHeadlineAmount(revenue), contributionDelta: formatHeadlineAmount(contribution) };
    expect(snapshotSentence(onlySelf)).toEqual({ kind: "revenueUpContributionDown", text: fill(sentences.revenueUpContributionDownNoTop, values), topHeadline: null });
    // 門檻高於折扣與廣告的影響金額、低於總差額：只剩 REV_UP_CM_DOWN。
    const threshold = new Decimal(contribution).abs().minus("0.01").toFixed(2);
    expect(firstItem(golden, threshold)).toBeUndefined();
    expect(snapshotSentence(golden, { importanceThreshold: threshold })).toEqual({ kind: "revenueUpContributionDown", text: fill(sentences.revenueUpContributionDownNoTop, values), topHeadline: null });
    // 不合法的門檻不讓句子中斷，沿用預設門檻。
    expect(snapshotSentence(golden, { importanceThreshold: "abc" })).toEqual(snapshotSentence(golden));
  });

  it("兩者都多（bothUp）", () => {
    const snap = variant({ prevN: "2000.00", prevCM: "100.00" });
    const { revenue, contribution } = deltas(snap);
    expect(snapshotSentence(snap)).toEqual({ kind: "bothUp", text: fill(sentences.bothUp, { revenueDelta: formatHeadlineAmount(revenue), contributionDelta: formatHeadlineAmount(contribution) }), topHeadline: null });
  });

  it("兩者都少（bothDown）：附最大一項；沒有項目時用 NoTop", () => {
    const snap = variant({ prevN: "3000.00" });
    const { revenue, contribution } = deltas(snap);
    expect(new Decimal(revenue).isNegative() && new Decimal(contribution).isNegative()).toBe(true);
    const values = { revenueDelta: formatHeadlineAmount(revenue), contributionDelta: formatHeadlineAmount(contribution) };
    const top = firstItem(snap)!;
    expect(snapshotSentence(snap)).toEqual({ kind: "bothDown", text: fill(sentences.bothDown, { ...values, top: top.headline }), topHeadline: top.headline });
    const none = variant({ prevN: "3000.00" }, []);
    expect(snapshotSentence(none)).toEqual({ kind: "bothDown", text: fill(sentences.bothDownNoTop, values), topHeadline: null });
  });

  it("淨營收少、扣廣告後貢獻多（revenueDownContributionUp）", () => {
    const snap = variant({ prevN: "3000.00", prevCM: "100.00" });
    const { revenue, contribution } = deltas(snap);
    expect(snapshotSentence(snap)).toEqual({ kind: "revenueDownContributionUp", text: fill(sentences.revenueDownContributionUp, { revenueDelta: formatHeadlineAmount(revenue), contributionDelta: formatHeadlineAmount(contribution) }), topHeadline: null });
  });

  it("任一差額取位後為 0（flat）：持平的一側不帶金額，另一側用方向詞＋前置空格的 L1 金額", () => {
    const current = golden.report.current.metrics;
    // 淨營收差 0.40 元：L1 取到整元為 0，視為持平（與 KPI 帶的方向詞相同的取位）。
    const almost = new Decimal(current.net_revenue.value!).minus("0.40").toFixed(2);
    const snap = variant({ prevN: almost });
    const { revenue, contribution } = deltas(snap);
    expect(deltaWord("net_revenue", revenue, { layer: "L1" })).toBe(labels.format.flat);
    expect(snapshotSentence(snap)).toEqual({
      kind: "flat",
      text: fill(sentences.flat, { revenueWord: labels.format.flat, revenueDelta: "", contributionWord: labels.format.earnLess, contributionDelta: ` ${formatHeadlineAmount(contribution)}` }),
      topHeadline: null,
    });
    const both = variant({ prevN: current.net_revenue.value!, prevCM: current.contribution_after_marketing.value! });
    expect(snapshotSentence(both).text).toBe(fill(sentences.flat, { revenueWord: labels.format.flat, revenueDelta: "", contributionWord: labels.format.flat, contributionDelta: "" }));
    const cmFlat = variant({ prevCM: current.contribution_after_marketing.value! });
    expect(snapshotSentence(cmFlat).text).toBe(fill(sentences.flat, { revenueWord: labels.format.more, revenueDelta: ` ${formatHeadlineAmount(deltas(cmFlat).revenue)}`, contributionWord: labels.format.flat, contributionDelta: "" }));
  });

  it("上期 ≤ 0 轉正與轉為虧損（turned）：本期值 L1，可為負且用 U+2212", () => {
    const positive = variant({ prevCM: "-100.00" });
    expect(snapshotSentence(positive)).toEqual({ kind: "turned", text: fill(sentences.turned, { word: labels.format.turnedPositive, contribution: formatAmountL1(positive.report.current.metrics.contribution_after_marketing.value) }), topHeadline: null });
    const loss = variant({ curCM: "-61000.00" });
    const result = snapshotSentence(loss);
    expect(result).toEqual({ kind: "turned", text: fill(sentences.turned, { word: labels.format.turnedLoss, contribution: formatAmountL1("-61000.00") }), topHeadline: null });
    expect(result.text).toContain(MINUS);
    expect(result.text).not.toContain("-");
  });

  it("資料待補（missing）：任一相關值為 null；有項目數時帶數字，沒有時用不帶數字的句型", () => {
    const snap = variant({ curCM: null });
    expect(snapshotSentence(snap, { missingItems: 3 })).toEqual({ kind: "missing", text: fill(sentences.missing, { n: 3 }), topHeadline: null });
    expect(snapshotSentence(snap)).toEqual({ kind: "missing", text: sentences.missingNoCount, topHeadline: null });
    expect(snapshotSentence(snap, { missingItems: 0 }).text).toBe(sentences.missingNoCount);
    expect(snapshotSentence(snap, { missingItems: Number.NaN }).text).toBe(sentences.missingNoCount);
  });
});

describe("buildWeeklySummary：F1 週會摘要（PRD §10.2）", () => {
  const actions: WeeklySummaryInput["actions"] = {
    pending: 5,
    pinned: [
      { problem: "檢討折扣檔期", owner: "王小明", deadline: "2026-09-30" },
      { problem: "核對廣告預算", owner: "", deadline: "" },
    ],
  };
  const input = (snap: WorkspaceSnapshot, extra: Partial<WeeklySummaryInput> = {}): WeeklySummaryInput => ({ snapshot: snap, datasetName: "golden 驗證資料", actions, ...extra });
  const span = (snap: WorkspaceSnapshot, which: "previous" | "current") => {
    const period = snap.report[which].period;
    return `${formatPeriodL1(period.start, period.end, { days: false })}${fill(labels.format.units.periodDays, { days: snap.report.comparison[which === "current" ? "current_days" : "previous_days"] })}`;
  };
  const keyLines = (snap: WorkspaceSnapshot) => {
    const { previous, current } = snap.report;
    const { revenue, contribution } = deltas(snap);
    const moneyLine = (metric: "net_revenue" | "contribution_after_marketing", change: string) => fill(weekly.keyLine, {
      metric: metricDefinitions[metric].label, value: formatMetric(metric, current.metrics[metric], "L1"),
      word: deltaWord(metric, change, { previous: previous.metrics[metric].value, layer: "L1" }), amount: formatHeadlineAmount(change),
      growth: formatGrowth(current.metrics[metric].value, previous.metrics[metric].value, "L1"),
    });
    const points = percentagePointChange(previous.metrics.contribution_margin, current.metrics.contribution_margin).value;
    return [
      moneyLine("net_revenue", revenue),
      moneyLine("contribution_after_marketing", contribution),
      fill(weekly.rateLine, { metric: metricDefinitions.contribution_margin.label, value: formatMetric("contribution_margin", current.metrics.contribution_margin, "L1"), points: formatPointsValue(points, "L1") }),
    ];
  };

  it("純文字版：快照比對，並逐行以 labels 與格式化函式核對", () => {
    const summary = buildWeeklySummary(input(golden));
    expect(summary.text).toMatchSnapshot();
    expect(summary.sentence).toEqual(snapshotSentence(golden));
    const lines = summary.text.split("\n");
    const groups = diagnosisGroups(golden).priorities;
    expect(groups).toHaveLength(3);
    const anchor = golden.data_as_of;
    expect(lines).toEqual([
      weekly.title,
      "golden 驗證資料",
      fill(weekly.period, { current: span(golden, "current"), previous: span(golden, "previous"), channels: channelsLabel(golden.report.scope.channels, demoAlias(golden.report.dataset_id)) }),
      "",
      ...keyLines(golden),
      "",
      labels.overview.sections.topThree,
      ...groups.map((group, index) => fill(weekly.topThreeItem, { n: index + 1, headline: group.headline, nextStep: group.next_step })),
      "",
      fill(weekly.actionsPinned, { pending: 5, pinned: [
        fill(weekly.pinnedItem, { problem: "檢討折扣檔期", owner: "王小明", deadline: formatDateL1("2026-09-30", { anchor }) }),
        fill(weekly.pinnedItem, { problem: "核對廣告預算", owner: weekly.ownerUnassigned, deadline: weekly.deadlineUnassigned }),
      ].join(weekly.pinnedSeparator) }),
      fill(weekly.footer, { date: formatDateL1(anchor, { anchor }), brand: labels.brand.name }),
    ]);
    // 標題用換行，不用「｜」；負號一律 U+2212（golden 的扣廣告後貢獻成長率為負）。
    expect(summary.text).not.toContain("｜");
    expect(summary.text).toContain(MINUS);
    expect(summary.text).not.toMatch(/-\d/);
  });

  it("Markdown 版：快照比對；用 ## 與 -，負號 U+2212", () => {
    const summary = buildWeeklySummary(input(golden));
    expect(summary.markdown).toMatchSnapshot();
    const lines = summary.markdown.split("\n");
    expect(lines[0]).toBe(`## ${weekly.title}`);
    expect(lines).toContain(`## ${labels.overview.sections.topThree}`);
    for (const line of keyLines(golden)) expect(lines).toContain(`- ${line}`);
    expect(lines.slice(-1)[0]).toBe(fill(weekly.footer, { date: formatDateL1(golden.data_as_of, { anchor: golden.data_as_of }), brand: labels.brand.name }));
    expect(summary.markdown).toContain(MINUS);
    expect(summary.markdown).not.toMatch(/-\d/);
    expect(summary.markdown).not.toContain("｜");
  });

  it("示範資料：期間行寫兩期日期與天數（formatPeriodL1 不帶天數＋units.periodDays）", () => {
    const summary = buildWeeklySummary(input(demo, { datasetName: "示範資料" }));
    const lines = summary.text.split("\n");
    expect(lines[2]).toBe(fill(weekly.period, { current: span(demo, "current"), previous: span(demo, "previous"), channels: channelsLabel(demo.report.scope.channels, true) }));
    expect(lines.slice(4, 7)).toEqual(keyLines(demo));
    expect(lines[8]).toBe(labels.overview.sections.topThree);
    expect(lines[9]).toBe(fill(weekly.topThreeItem, { n: 1, headline: diagnosisGroups(demo).priorities[0].headline, nextStep: diagnosisGroups(demo).priorities[0].next_step }));
  });

  it("資料待補：三行關鍵數字改成同一句「部分資料待補…」", () => {
    const snap = variant({ curCM: null });
    const summary = buildWeeklySummary(input(snap, { missingItems: 3 }));
    const lines = summary.text.split("\n");
    expect(summary.sentence.kind).toBe("missing");
    expect(lines.slice(3, 6)).toEqual(["", fill(sentences.missing, { n: 3 }), ""]);
    expect(summary.markdown.split("\n")).toContain(`- ${fill(sentences.missing, { n: 3 })}`);
  });

  it("上期 ≤ 0、持平：扣廣告後貢獻用「轉為虧損，本期 …」；差額為 0 寫「與上期持平」", () => {
    const loss = variant({ curCM: "-61000.00" });
    const lossLines = buildWeeklySummary(input(loss)).text.split("\n");
    expect(lossLines[5]).toBe(fill(weekly.keyLineTurned, { metric: metricDefinitions.contribution_after_marketing.label, word: labels.format.turnedLoss, value: formatAmountL1("-61000.00") }));
    const current = golden.report.current.metrics;
    const flat = variant({ prevN: current.net_revenue.value! });
    const flatLines = buildWeeklySummary(input(flat)).text.split("\n");
    expect(flatLines[4]).toBe(fill(weekly.keyLineFlat, { metric: metricDefinitions.net_revenue.label, value: formatAmountL1(current.net_revenue.value) }));
    const rateFlat = structuredClone(golden);
    rateFlat.report.previous.metrics.contribution_margin = { ...rateFlat.report.current.metrics.contribution_margin };
    expect(buildWeeklySummary(input(rateFlat)).text.split("\n")[6]).toBe(fill(weekly.keyLineFlat, { metric: metricDefinitions.contribution_margin.label, value: formatMetric("contribution_margin", current.contribution_margin, "L1") }));
  });

  it("三件事不足 3 件改標題、0 件寫「本期沒有需要先看的事。」", () => {
    const two = buildWeeklySummary(input(variant({}, ["REV_UP_CM_DOWN", "DISCOUNT_BURDEN_UP"]))).text.split("\n");
    expect(two[8]).toBe(fill(weekly.topThreeFew, { n: 2 }));
    expect(two.slice(9, 11)).toHaveLength(2);
    expect(two[11]).toBe("");
    const none = buildWeeklySummary(input(variant({}, []))).text.split("\n");
    expect(none.slice(8, 11)).toEqual([labels.overview.sections.topThree, weekly.topThreeNone, ""]);
    expect(buildWeeklySummary(input(variant({}, []))).markdown).toContain(`## ${labels.overview.sections.topThree}\n\n${weekly.topThreeNone}`);
  });

  it("待辦：沒有置頂只寫未完成數；置頂最多 3 項；使用者文字在 Markdown 版跳脫、換行收成空格", () => {
    const plain = buildWeeklySummary(input(golden, { actions: { pending: 0, pinned: [] } })).text.split("\n");
    expect(plain.slice(-2)[0]).toBe(fill(weekly.actions, { pending: 0 }));
    const many = Array.from({ length: 5 }, (_, index) => ({ problem: `待辦 ${index + 1}`, owner: "A", deadline: "" }));
    const capped = buildWeeklySummary(input(golden, { actions: { pending: 5, pinned: many } })).text;
    expect(capped).toContain(fill(weekly.pinnedItem, { problem: "待辦 3", owner: "A", deadline: weekly.deadlineUnassigned }));
    expect(capped).not.toContain("待辦 4");
    const tricky = buildWeeklySummary(input(golden, { datasetName: "a*b_c #1", actions: { pending: 1, pinned: [{ problem: "第一行\n第二行 [連結](x)", owner: "  ", deadline: "2027-01-05" }] } }));
    expect(tricky.text.split("\n")[1]).toBe("a*b_c #1");
    expect(tricky.text).toContain(fill(weekly.pinnedItem, { problem: "第一行 第二行 [連結](x)", owner: weekly.ownerUnassigned, deadline: formatDateL1("2027-01-05", { anchor: golden.data_as_of }) }));
    expect(tricky.markdown).toContain("a\\*b\\_c \\#1");
    expect(tricky.markdown).toContain("第一行 第二行 \\[連結\\](x)");
  });
});

describe("D-V3-15 分析事件：只記事件名", () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it("summary_copied、waterfall_clicked 是固定代號", () => {
    const events: AnalyticsEvent[] = ["summary_copied", "waterfall_clicked"];
    const va = vi.fn();
    vi.stubGlobal("window", { va });
    for (const name of events) track(name);
    expect(va.mock.calls.map(([, payload]) => payload)).toEqual(events.map(name => ({ name })));
    for (const name of events) expect(name).toMatch(/^[a-z_]+$/);
  });
});
