import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { addActionDraft, editActionManagement, editBoundAction, emptyActionWorkspace, taipeiToday, type ActionExecutionStatus, type ActionSource, type ActionWorkspace } from "@/application/action-workspace";
import { ACTION_DUE_BUCKET_KEYS, ACTION_DUE_BUCKETS_VERSION, ACTION_DUE_WEEK_DAYS, actionDueBucketOf, actionDueBuckets, type ActionDueBucketKey } from "@/application/chart-actions";
import { chartColors, chartRowHeights } from "@/application/chart-theme";
import { formatCount } from "@/application/presentation";
import { createSnapshot, hashInput } from "@/application/workspace";
import { ActionsDue } from "@/components/actions-due";
import { BAR_CELL_EDGE_ZERO_X, BAR_CELL_HEIGHT, BAR_CELL_WIDTH } from "@/components/charts/bar-cell";
import { validateDataset } from "@/domain/validation";
import { fill, labels } from "@/i18n";
import { checkChartMarkup } from "../scripts/lib/chart-scan.mjs";
import { fixture } from "./helpers/fixtures";
import { element, openTag } from "./helpers/markup";

// V4-10 代理 B：G17 待辦期限分布的 B 級整理函式 actionDueBuckets（action-due-buckets-v1；PRD §4.1–§4.7 G17、§6.4；CHART_CATALOG G17、§9.2；D-V4-15）與小表 ActionsDue 的 SSR。
// 手算 golden（台北今天 2026-10-13；7 天內＝10/13–10/19，含今天共 7 天；之後＝10/20 起）：
//   c1 期限 10/12 未開始 → 逾期；c2 期限 10/13（今天）進行中 → 7 天內；c3 期限 10/19（今天＋6）受阻 → 7 天內；c4 期限 10/20（今天＋7）未開始 → 之後；
//   c5 沒有期限（空字串）未開始 → 未填期限；c6 期限 10/01 已完成、c7 沒有期限已完成 → 不計。
//   四桶＝逾期 1、7 天內 2、之後 1、未填期限 1；加總 5＝未完成待辦數（7 − 2 張已完成）；四桶最大值 2（C24 count 的共用尺度）。

const TODAY = "2026-10-13";
type Card = { id: string; deadline: string; status: ActionExecutionStatus };
const GOLDEN_CARDS: Card[] = [
  { id: "c1", deadline: "2026-10-12", status: "not_started" },
  { id: "c2", deadline: "2026-10-13", status: "in_progress" },
  { id: "c3", deadline: "2026-10-19", status: "blocked" },
  { id: "c4", deadline: "2026-10-20", status: "not_started" },
  { id: "c5", deadline: "", status: "not_started" },
  { id: "c6", deadline: "2026-10-01", status: "completed" },
  { id: "c7", deadline: "", status: "completed" },
];

let source: ActionSource;
beforeAll(async () => {
  const input = fixture("golden");
  const dataset = validateDataset(input).dataset!;
  source = { input, dataset, snapshot: await createSnapshot(dataset, {}, await hashInput(input)), revision: 1 };
}, 60_000);

/** 依卡片清單建工作區：手動草稿 → 填期限（空字串不填）→ 改執行狀態（未開始不改）。 */
function workspaceOf(cards: readonly Card[]): ActionWorkspace {
  let workspace = emptyActionWorkspace();
  for (const card of cards) {
    workspace = addActionDraft(workspace, source, card.id);
    if (card.deadline) workspace = editBoundAction(workspace, card.id, { deadline: card.deadline });
    if (card.status !== "not_started") workspace = editActionManagement(workspace, card.id, { execution_status: card.status }, "2026-10-01");
  }
  return workspace;
}
const countsOf = (workspace: ActionWorkspace, today: string) => Object.fromEntries(actionDueBuckets(workspace, today).buckets.map(bucket => [bucket.key, bucket.count])) as Record<ActionDueBucketKey, number>;

describe("actionDueBuckets：手算 golden（action-due-buckets-v1）", () => {
  it("版本常數、四桶的固定順序、7 天內＝7 天", () => {
    expect(ACTION_DUE_BUCKETS_VERSION).toBe("action-due-buckets-v1");
    expect(ACTION_DUE_BUCKET_KEYS).toEqual(["overdue", "week", "later", "none"]);
    expect(ACTION_DUE_WEEK_DAYS).toBe(7);
  });

  it("台北今天 2026-10-13：逾期 1、7 天內 2、之後 1、未填期限 1；加總 5＝未完成待辦數；最大值 2；7 天內到 10/19", () => {
    const workspace = workspaceOf(GOLDEN_CARDS);
    const result = actionDueBuckets(workspace, TODAY);
    expect(result).toEqual({
      version: "action-due-buckets-v1", today: TODAY, weekEnd: "2026-10-19",
      buckets: [{ key: "overdue", count: 1 }, { key: "week", count: 2 }, { key: "later", count: 1 }, { key: "none", count: 1 }],
      open: 5, max: 2,
    });
    // golden：四桶加總＝未完成待辦數。
    expect(result.buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(result.open);
    expect(result.open).toBe(workspace.items.filter(item => item.execution_status !== "completed").length);
    // 結果可序列化。
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("期限＝今天算 7 天內；期限＝今天＋6 天仍是 7 天內；期限＝今天＋7 天算之後；期限＝昨天算逾期", () => {
    expect(actionDueBucketOf("2026-10-13", TODAY, "2026-10-19")).toBe("week");
    expect(actionDueBucketOf("2026-10-19", TODAY, "2026-10-19")).toBe("week");
    expect(actionDueBucketOf("2026-10-20", TODAY, "2026-10-19")).toBe("later");
    expect(actionDueBucketOf("2026-10-12", TODAY, "2026-10-19")).toBe("overdue");
    for (const [deadline, bucket] of [["2026-10-13", "week"], ["2026-10-19", "week"], ["2026-10-20", "later"], ["2026-10-12", "overdue"]] as const) {
      expect(countsOf(workspaceOf([{ id: "x", deadline, status: "not_started" }]), TODAY)[bucket], deadline).toBe(1);
    }
  });

  it("空字串期限算未填期限；已完成不計（逾期或沒有期限都一樣）；沒有狀態的舊資料視為未開始（與看板分欄相同）", () => {
    expect(actionDueBucketOf("", TODAY, "2026-10-19")).toBe("none");
    expect(countsOf(workspaceOf([{ id: "x", deadline: "", status: "in_progress" }]), TODAY)).toEqual({ overdue: 0, week: 0, later: 0, none: 1 });
    const done = actionDueBuckets(workspaceOf([{ id: "x", deadline: "2026-10-01", status: "completed" }, { id: "y", deadline: "", status: "completed" }]), TODAY);
    expect(done.buckets.map(bucket => bucket.count)).toEqual([0, 0, 0, 0]);
    expect(done).toMatchObject({ open: 0, max: 0 });
    const legacy = workspaceOf([{ id: "x", deadline: "2026-10-12", status: "not_started" }]);
    const withoutStatus: ActionWorkspace = { ...legacy, items: legacy.items.map(item => ({ ...item, execution_status: undefined })) };
    expect(countsOf(withoutStatus, TODAY)).toEqual({ overdue: 1, week: 0, later: 0, none: 0 });
    expect(actionDueBuckets(emptyActionWorkspace(), TODAY)).toMatchObject({ open: 0, max: 0, buckets: [{ key: "overdue", count: 0 }, { key: "week", count: 0 }, { key: "later", count: 0 }, { key: "none", count: 0 }] });
  });

  it("台北日期邊界：UTC 15:59:59 仍是台北 10/12（期限 10/12 算 7 天內、10/19 算之後），UTC 16:00 起是台北 10/13（期限 10/12 算逾期、10/19 算 7 天內）", () => {
    const before = taipeiToday(new Date("2026-10-12T15:59:59Z")), after = taipeiToday(new Date("2026-10-12T16:00:00Z"));
    expect(before).toBe("2026-10-12");
    expect(after).toBe("2026-10-13");
    const workspace = workspaceOf([{ id: "a", deadline: "2026-10-12", status: "not_started" }, { id: "b", deadline: "2026-10-19", status: "not_started" }]);
    expect(countsOf(workspace, before)).toEqual({ overdue: 0, week: 1, later: 1, none: 0 });
    expect(countsOf(workspace, after)).toEqual({ overdue: 1, week: 1, later: 0, none: 0 });
    expect(actionDueBuckets(workspace, before).weekEnd).toBe("2026-10-18");
  });

  it("跨月、跨年：7 天內的最後一天以日曆日計（12/28 → 1/03；2/26 → 3/04，2028 閏年 → 3/03）", () => {
    expect(actionDueBuckets(emptyActionWorkspace(), "2026-12-28").weekEnd).toBe("2027-01-03");
    expect(actionDueBuckets(emptyActionWorkspace(), "2027-02-26").weekEnd).toBe("2027-03-04");
    expect(actionDueBuckets(emptyActionWorkspace(), "2028-02-26").weekEnd).toBe("2028-03-03");
    expect(countsOf(workspaceOf([{ id: "a", deadline: "2027-01-03", status: "not_started" }, { id: "b", deadline: "2027-01-04", status: "blocked" }]), "2026-12-28")).toEqual({ overdue: 0, week: 1, later: 1, none: 0 });
  });

  it("預設 today＝taipeiToday()；today 不是有效的 YYYY-MM-DD 時丟 RangeError", () => {
    expect(actionDueBuckets(emptyActionWorkspace()).today).toBe(taipeiToday());
    for (const bad of ["", "2026-10-32", "2026/10/13", "20261013"]) expect(() => actionDueBuckets(emptyActionWorkspace(), bad), bad).toThrow(RangeError);
  });

  it("加總不變式：各種期限與狀態的組合，四桶加總都＝未完成待辦數，最大值＝四桶最大的件數", () => {
    const deadlines = ["", "2026-09-30", "2026-10-12", "2026-10-13", "2026-10-16", "2026-10-19", "2026-10-20", "2026-11-30"];
    const statuses: ActionExecutionStatus[] = ["not_started", "in_progress", "blocked", "completed"];
    const cards = deadlines.flatMap((deadline, i) => statuses.filter((_, j) => (i + j) % 3 !== 0).map((status, j) => ({ id: `k${i}-${j}`, deadline, status })));
    const workspace = workspaceOf(cards);
    const result = actionDueBuckets(workspace, TODAY);
    expect(result.open).toBe(cards.filter(card => card.status !== "completed").length);
    expect(result.buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(result.open);
    expect(result.max).toBe(Math.max(...result.buckets.map(bucket => bucket.count)));
    const expected = (key: ActionDueBucketKey) => cards.filter(card => card.status !== "completed" && actionDueBucketOf(card.deadline, TODAY, "2026-10-19") === key).length;
    for (const key of ACTION_DUE_BUCKET_KEYS) expect(result.buckets.find(bucket => bucket.key === key)!.count, key).toBe(expected(key));
  });
});

describe("ActionsDue：G17 小表的 SSR（4 列 th＋td.num、C24 count 條、caption 結論句）", () => {
  const due = labels.actions.chartsV4.due;
  const render = (workspace: ActionWorkspace, today = TODAY) => renderToStaticMarkup(createElement(ActionsDue, { workspace, today }));
  const text = (html: string) => html.replace(/<[^>]*>/g, "");

  it("golden：caption「1 件逾期，2 件 7 天內到期」；列序逾期、7 天內、之後、未填期限；件數 L2；逾期條 unfavorable、其餘 total；共用尺度＝最大值 2（7 天內滿寬 96、其他 48）", () => {
    const html = render(workspaceOf(GOLDEN_CARDS));
    expect(openTag(html, "<table")).toBe('<table class="chart-actions-due" data-testid="chart-actions-due">');
    expect(text(element(html, "<caption")!)).toBe(fill(due.caption, { n: formatCount(1, "L2"), m: formatCount(2, "L2") }));
    expect([...html.matchAll(/<tr data-bucket="([a-z]+)">/g)].map(match => match[1])).toEqual(["overdue", "week", "later", "none"]);
    const widths: Record<ActionDueBucketKey, number> = { overdue: 48, week: BAR_CELL_WIDTH, later: 48, none: 48 };
    const counts: Record<ActionDueBucketKey, number> = { overdue: 1, week: 2, later: 1, none: 1 };
    for (const key of ACTION_DUE_BUCKET_KEYS) {
      const row = element(html, `<tr data-bucket="${key}">`)!;
      expect(element(row, "<th")).toBe(`<th scope="row">${due.buckets[key]}</th>`);
      const tone = key === "overdue" ? "unfavorable" : "total";
      const fillColor = key === "overdue" ? chartColors.unfavorable : chartColors.total;
      expect(element(row, "<td")).toBe(`<td class="num"><svg class="bar-cell is-count" data-chart-kind="cell" data-testid="chart-actions-due-bar-${key}" data-tone="${tone}" viewBox="0 0 ${BAR_CELL_WIDTH} ${BAR_CELL_HEIGHT}" width="${BAR_CELL_WIDTH}" height="${BAR_CELL_HEIGHT}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect class="bar-cell-bar" x="0" y="${(BAR_CELL_HEIGHT - chartRowHeights.cell) / 2}" width="${widths[key]}" height="${chartRowHeights.cell}" fill="${fillColor}"></rect><line class="bar-cell-zero" x1="${BAR_CELL_EDGE_ZERO_X}" x2="${BAR_CELL_EDGE_ZERO_X}" y1="0" y2="${BAR_CELL_HEIGHT}" stroke="${chartColors.axis}" stroke-width="1" vector-effect="non-scaling-stroke" shape-rendering="crispEdges"></line></svg>${formatCount(counts[key], "L2")}</td>`);
    }
  });

  it("件數 0 的列只有零線（沒有 rect）；只有一張沒有期限的卡時 caption 是「0 件逾期，0 件 7 天內到期」", () => {
    const html = render(workspaceOf([{ id: "n1", deadline: "", status: "not_started" }]));
    expect(text(element(html, "<caption")!)).toBe(fill(due.caption, { n: formatCount(0, "L2"), m: formatCount(0, "L2") }));
    for (const key of ["overdue", "week", "later"] as const) {
      const row = element(html, `<tr data-bucket="${key}">`)!;
      expect(row, key).not.toContain("<rect");
      expect(row).toContain('class="bar-cell-zero"');
      expect(text(row)).toBe(`${due.buckets[key]}${formatCount(0, "L2")}`);
    }
    expect(element(html, '<tr data-bucket="none">')).toContain(`width="${BAR_CELL_WIDTH}"`);
  });

  it("表內沒有可聚焦元素；chart-lint SSR（CL-1、CL-2、CL-9、CL-11）0 違規：條在表格列內、同列有件數，條 aria-hidden，不是 section.chart-section", () => {
    const html = render(workspaceOf(GOLDEN_CARDS));
    expect(html).not.toMatch(/tabindex/i);
    expect(html).not.toMatch(/<(button|a|input|select|textarea)[\s>]/);
    expect(html).not.toMatch(/onclick|is-clickable/i);
    const { violations, mainSections } = checkChartMarkup(`<main id="main-content">${html}</main>`, { page: "actions" });
    for (const rule of ["CL-1", "CL-2", "CL-9", "CL-11"] as const) expect(violations[rule], rule).toEqual([]);
    expect(mainSections).toEqual([]);
  });
});
