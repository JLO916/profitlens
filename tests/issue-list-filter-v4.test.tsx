import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixture } from "./helpers/fixtures";
import { validateDataset } from "@/domain/validation";
import type { ValidationIssue } from "@/domain/types";
import type { IssueFilter } from "@/application/issue-filter";
import { IssueList } from "@/components/issue-list";
import { createSnapshot, hashInput } from "@/application/workspace";
import { DataWorkspace } from "@/components/workspace-panels";
import { CoverageChart } from "@/components/data/coverage-chart";
import { IssuesChart } from "@/components/data/issues-chart";
import { fill, labels } from "@/i18n";

/*
 * V4-7a 審查補測：問題表（IssueList）選填篩選的互動（PRD §6.4；CHART_CATALOG §7 開頭、G20、G21「鍵盤」）。
 * SSR 測不到 state 與 effect，這裡沿用 tests/meeting-page.test.tsx 一類的 hooks harness（沒有 DOM 套件：直接呼叫元件函式取得元素樹，同一組 hook 槽位＝同一個掛載實例；
 * render 中 setState 時立即重渲染，與 React 相同；渲染後把 ref 接上假節點、再跑 effect）。
 * 斷言：換了篩選（含清除、回到先前用過的篩選）頁碼回到第 1 頁；第一次掛載不搶焦點，換了篩選焦點移到篩選片語，清除後焦點移到問題表的捲動區。
 */

const hooks = vi.hoisted(() => ({ active: false, cursor: 0, slots: [] as unknown[], effects: [] as (() => void)[], dirty: false }));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useId: () => (hooks.active ? "issue-table" : actual.useId()),
    useState: (initial: unknown) => {
      if (!hooks.active) return actual.useState(initial);
      const index = hooks.cursor++;
      if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      const set = (next: unknown) => {
        const value = typeof next === "function" ? (next as (value: unknown) => unknown)(hooks.slots[index]) : next;
        if (!Object.is(value, hooks.slots[index])) { hooks.slots[index] = value; hooks.dirty = true; }
      };
      return [hooks.slots[index], set];
    },
    useRef: (initial: unknown) => {
      if (!hooks.active) return actual.useRef(initial);
      const index = hooks.cursor++;
      if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
      return hooks.slots[index];
    },
    useEffect: (effect: () => void, deps: unknown[]) => {
      if (!hooks.active) return actual.useEffect(effect, deps);
      const index = hooks.cursor++;
      const previous = hooks.slots[index] as unknown[] | undefined;
      if (previous === undefined || deps.some((dep, at) => !Object.is(dep, previous[at]))) { hooks.slots[index] = deps; hooks.effects.push(effect); }
    },
  };
});
afterEach(() => { hooks.active = false; hooks.cursor = 0; hooks.slots = []; hooks.effects = []; hooks.dirty = false; });

type TreeElement = ReactElement<Record<string, unknown>>;
function findAll(node: ReactNode, match: (element: TreeElement) => boolean, found: TreeElement[] = []): TreeElement[] {
  if (Array.isArray(node)) for (const child of node) findAll(child, match, found);
  else if (node !== null && typeof node === "object" && "props" in node) {
    const element = node as TreeElement;
    if (match(element)) found.push(element);
    findAll(element.props.children as ReactNode, match, found);
  }
  return found;
}
type FakeNode = { focus: ReturnType<typeof vi.fn> };

/** 渲染 IssueList 內的表格元件（IssueList 本身沒有 hook，回傳表格元素）；render 中 setState 立即重渲染；之後接上 ref、跑 effect。 */
function renderTable(props: Parameters<typeof IssueList>[0]): ReactNode {
  const element = IssueList(props) as TreeElement;
  const Table = element.type as (props: unknown) => ReactNode;
  let tree: ReactNode;
  let passes = 0;
  hooks.active = true;
  do { hooks.dirty = false; hooks.cursor = 0; tree = Table(element.props); } while (hooks.dirty && ++passes < 5);
  hooks.active = false;
  expect(hooks.dirty, "render 中 setState 沒有收斂").toBe(false);
  for (const node of findAll(tree, item => item.props.ref !== undefined)) {
    const ref = node.props.ref as { current: FakeNode | null };
    ref.current ??= { focus: vi.fn() };
  }
  for (const effect of hooks.effects.splice(0)) effect();
  return tree;
}
const byTestId = (tree: ReactNode, id: string) => findAll(tree, item => item.props["data-testid"] === id)[0];
const refOf = (element: TreeElement) => (element.props.ref as { current: FakeNode }).current;
/** 分頁列的頁碼文字（nav 內的 span）。 */
const pageStatus = (tree: ReactNode) => findAll(findAll(tree, item => item.type === "nav")[0], item => item.type === "span")[0].props.children;
const pageText = (page: number, pages: number) => fill(labels.data.issues.pageStatus, { page, pages });
/** 按分頁列的「下 50 項」。 */
const nextPage = (tree: ReactNode) => {
  const buttons = findAll(findAll(tree, item => item.type === "nav")[0], item => item.type === "button");
  (buttons[buttons.length - 1].props.onClick as () => void)();
};

describe("V4-7a 問題表篩選：換了篩選回到第 1 頁", () => {
  const cogs = validateDataset(fixture("errors/missing_cogs")).dataset!.issues[0];
  // 120 項（3 頁）；兩組篩選都符合全部 120 項，頁數不變，只看頁碼。
  const many: ValidationIssue[] = Array.from({ length: 120 }, (_, at) => ({ ...cogs, line: at + 2 }));
  const byReason: IssueFilter = { reason: "MISSING_COGS" };
  const byFile: IssueFilter = { file: "sales_daily.csv" };

  it("沒有篩選時翻到第 2 頁 → 套用篩選 → 清除：回到第 1 頁（不回到篩選前的第 2 頁）", () => {
    let tree = renderTable({ issues: many });
    expect(pageStatus(tree)).toBe(pageText(1, 3));
    nextPage(tree);
    tree = renderTable({ issues: many });
    expect(pageStatus(tree)).toBe(pageText(2, 3));
    tree = renderTable({ issues: many, filter: byReason, onClearFilter: () => undefined });
    expect(pageStatus(tree)).toBe(pageText(1, 3));
    tree = renderTable({ issues: many });
    expect(pageStatus(tree)).toBe(pageText(1, 3));
  });

  it("篩選 A 翻到第 2 頁 → 換篩選 B → 換回 A：第 1 頁（不保留 A 先前的頁碼）；同一組條件重新渲染時頁碼不變", () => {
    let tree = renderTable({ issues: many, filter: byReason });
    nextPage(tree);
    tree = renderTable({ issues: many, filter: { ...byReason } });
    expect(pageStatus(tree)).toBe(pageText(2, 3));
    tree = renderTable({ issues: many, filter: byFile });
    expect(pageStatus(tree)).toBe(pageText(1, 3));
    tree = renderTable({ issues: many, filter: byReason });
    expect(pageStatus(tree)).toBe(pageText(1, 3));
  });

  it("沒有篩選時翻頁照舊（鍵永遠是空字串，不重設）", () => {
    let tree = renderTable({ issues: many });
    nextPage(tree);
    tree = renderTable({ issues: many });
    nextPage(tree);
    tree = renderTable({ issues: many });
    expect(pageStatus(tree)).toBe(pageText(3, 3));
  });
});

describe("V4-7a 問題表篩選：焦點", () => {
  const issues = validateDataset(fixture("errors/missing_ad_day")).dataset!.issues;
  const cell: IssueFilter = { file: "ad_spend_daily.csv", reason: "MISSING_AD_DAY" };

  it("第一次掛載（已有篩選）不搶焦點；同一組條件重新渲染不移焦點；換了篩選焦點移到篩選片語；按「清除篩選」呼叫 onClearFilter、焦點移到問題表的捲動區，片語不再取得焦點", () => {
    const onClearFilter = vi.fn();
    let tree = renderTable({ issues, filter: cell, onClearFilter });
    const phrase = refOf(byTestId(tree, "data-issues-filter"));
    expect(phrase.focus).not.toHaveBeenCalled();
    tree = renderTable({ issues, filter: { ...cell }, onClearFilter });
    expect(phrase.focus).not.toHaveBeenCalled();
    tree = renderTable({ issues, filter: { ...cell, channel: "MARKETPLACE" }, onClearFilter });
    expect(phrase.focus).toHaveBeenCalledTimes(1);
    const region = refOf(findAll(tree, item => item.props.role === "region")[0]);
    (byTestId(tree, "data-issues-filter-clear").props.onClick as () => void)();
    expect(onClearFilter).toHaveBeenCalledTimes(1);
    expect(region.focus).toHaveBeenCalledTimes(1);
    tree = renderTable({ issues, onClearFilter });
    expect(byTestId(tree, "data-issues-filter")).toBeUndefined();
    expect(phrase.focus).toHaveBeenCalledTimes(1);
  });

  it("沒有篩選換成有篩選（片語新出現）：焦點移到片語", () => {
    let tree = renderTable({ issues });
    expect(byTestId(tree, "data-issues-filter")).toBeUndefined();
    tree = renderTable({ issues, filter: cell });
    expect(refOf(byTestId(tree, "data-issues-filter")).focus).toHaveBeenCalledTimes(1);
  });
});

// ── V4-7a 整合（代理 C）：審查 B-2——同一組條件再套用一次（DataWorkspace 每按一次 filterRequest 加 1）也把焦點移到篩選片語；
// request 不變的重新渲染不搶焦點。
describe("V4-7a 問題表篩選：再按同一個缺列段或格（filterRequest）", () => {
  const issues = validateDataset(fixture("errors/missing_ad_day")).dataset!.issues;
  const segment: IssueFilter = { file: "ad_spend_daily.csv", channel: "MARKETPLACE", reason: "MISSING_AD_DAY" };

  it("filterRequest 遞增時焦點每次都移到片語（鍵不變）；request 不變時重新渲染不移；清除後再套用同一組條件也移", () => {
    const onClearFilter = vi.fn();
    let tree = renderTable({ issues, filter: segment, onClearFilter, filterRequest: 1 });
    const phrase = refOf(byTestId(tree, "data-issues-filter"));
    expect(phrase.focus, "第一次掛載不搶焦點").not.toHaveBeenCalled();
    tree = renderTable({ issues, filter: { ...segment }, onClearFilter, filterRequest: 2 });
    expect(phrase.focus, "再按同一個缺列段").toHaveBeenCalledTimes(1);
    tree = renderTable({ issues, filter: { ...segment }, onClearFilter, filterRequest: 2 });
    expect(phrase.focus, "request 不變的重新渲染").toHaveBeenCalledTimes(1);
    tree = renderTable({ issues, filter: segment, onClearFilter, filterRequest: 3 });
    expect(phrase.focus, "第三次").toHaveBeenCalledTimes(2);
    (byTestId(tree, "data-issues-filter-clear").props.onClick as () => void)();
    tree = renderTable({ issues, onClearFilter });
    expect(byTestId(tree, "data-issues-filter")).toBeUndefined();
    tree = renderTable({ issues, filter: segment, onClearFilter, filterRequest: 1 });
    expect(refOf(byTestId(tree, "data-issues-filter")).focus, "清除後再套用").toHaveBeenCalledTimes(3);
  });
});

// ── V4-7a 整合（代理 C）：DataWorkspace 持有問題表的篩選（CHART_CATALOG §7 開頭、G20、G21「抽屜」「鍵盤」）。
// DataWorkspace 只用 useState、useRef（本檔 harness 都接管）；直接呼叫取得元素樹，子元件（CoverageChart、IssuesChart、IssueList）不執行，只看傳下去的 props。
describe("V4-7a DataWorkspace：G20、G21 設定問題表篩選、捲到 data-issues", () => {
  type Props = Parameters<typeof DataWorkspace>[0];
  const load = async (name: string) => {
    const input = fixture(name);
    const dataset = validateDataset(input).dataset!;
    return { dataset, snapshot: await createSnapshot(dataset, {}, await hashInput(input)) };
  };
  /** 同一個掛載實例渲染一次：回傳元素樹；ref 接上假節點（scrollIntoView 可觀察）。 */
  function renderPage(props: Props): ReactNode {
    let tree: ReactNode;
    let passes = 0;
    hooks.active = true;
    do { hooks.dirty = false; hooks.cursor = 0; tree = DataWorkspace(props); } while (hooks.dirty && ++passes < 5);
    hooks.active = false;
    for (const node of findAll(tree, item => item.props.ref !== undefined)) {
      const ref = node.props.ref as { current: unknown };
      ref.current ??= { scrollIntoView: vi.fn(), focus: vi.fn() };
    }
    return tree;
  }
  const ofType = <T,>(tree: ReactNode, type: T) => findAll(tree, item => item.type === type)[0];
  const issueList = (tree: ReactNode) => ofType(tree, IssueList).props as Parameters<typeof IssueList>[0];
  const issuesSection = (tree: ReactNode) => byTestId(tree, "data-issues");

  it("G20 在狀態一行之後、data-issues 之前；G21 在 data-issues 內、問題表之前；三者共用同一個 onFilter，問題表一開始沒有篩選", async () => {
    const { dataset, snapshot } = await load("errors/missing_ad_day");
    const tree = renderPage({ dataset, snapshot });
    const top = (tree as TreeElement).props.children as ReactNode[];
    const order = top.filter(item => item !== null && typeof item === "object").map(item => { const element = item as TreeElement; return element.type === CoverageChart ? "G20" : (element.props["data-testid"] as string | undefined) ?? String(element.type); });
    expect(order.slice(0, 3)).toEqual(["data-status-line", "G20", "data-issues"]);
    const section = issuesSection(tree);
    const children = (section.props.children as ReactNode[]).filter(item => item !== null && typeof item === "object") as TreeElement[];
    expect(children.map(child => child.type === IssuesChart ? "G21" : child.type === IssueList ? "IssueList" : child.props.className)).toEqual(["ui-section-head", "G21", "IssueList"]);
    const onCoverage = ofType(tree, CoverageChart).props.onFilter, onIssues = ofType(tree, IssuesChart).props.onFilter;
    expect(onCoverage).toBeTypeOf("function");
    expect(onIssues).toBe(onCoverage);
    expect(issueList(tree).filter).toBeNull();
    expect(issueList(tree).filterRequest).toBeUndefined();
    expect(issueList(tree).download).toEqual({ filename: "profitlens-issues.csv", testId: "data-issues-download" });
  });

  it("點 G20 缺列段（或資料表的篩選按鈕）：問題表收到 { file, channel, reason } 與 filterRequest 1，data-issues 捲進畫面（scrollIntoView block start，不用平滑捲動）；再按同一段 filterRequest 2；點 G21 的格換成 { file, reason }；清除後沒有篩選", async () => {
    const { dataset, snapshot } = await load("errors/missing_ad_day");
    const props: Props = { dataset, snapshot };
    let tree = renderPage(props);
    const section = (issuesSection(tree).props.ref as { current: { scrollIntoView: ReturnType<typeof vi.fn> } }).current;
    const segment = { file: "ad_spend_daily.csv", channel: "MARKETPLACE", reason: "MISSING_AD_DAY" } as const;
    (ofType(tree, CoverageChart).props.onFilter as (filter: IssueFilter) => void)(segment);
    expect(section.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(section.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    tree = renderPage(props);
    expect(issueList(tree).filter).toEqual(segment);
    expect(issueList(tree).filterRequest).toBe(1);
    (ofType(tree, CoverageChart).props.onFilter as (filter: IssueFilter) => void)({ ...segment });
    tree = renderPage(props);
    expect(issueList(tree).filter).toEqual(segment);
    expect(issueList(tree).filterRequest, "再按同一段：焦點要再移一次（審查 B-2）").toBe(2);
    expect(section.scrollIntoView).toHaveBeenCalledTimes(2);
    (ofType(tree, IssuesChart).props.onFilter as (filter: IssueFilter) => void)({ file: "ad_spend_daily.csv", reason: "MISSING_AD_DAY" });
    tree = renderPage(props);
    expect(issueList(tree).filter).toEqual({ file: "ad_spend_daily.csv", reason: "MISSING_AD_DAY" });
    expect(issueList(tree).filterRequest).toBe(3);
    expect(section.scrollIntoView).toHaveBeenCalledTimes(3);
    issueList(tree).onClearFilter!();
    tree = renderPage(props);
    expect(issueList(tree).filter).toBeNull();
    expect(issueList(tree).filterRequest).toBeUndefined();
    expect(section.scrollIntoView, "清除不捲動").toHaveBeenCalledTimes(3);
  });

  it("換了資料集（問題清單不同）時舊的篩選不再套用（不留下篩不到任何列的篩選）", async () => {
    const adDay = await load("errors/missing_ad_day"), cogs = await load("errors/missing_cogs");
    let tree = renderPage(adDay);
    (ofType(tree, CoverageChart).props.onFilter as (filter: IssueFilter) => void)({ file: "ad_spend_daily.csv", channel: "MARKETPLACE", reason: "MISSING_AD_DAY" });
    tree = renderPage(adDay);
    expect(issueList(tree).filter).not.toBeNull();
    tree = renderPage(cogs);
    expect(issueList(tree).filter).toBeNull();
    expect(issueList(tree).filterRequest).toBeUndefined();
  });
});
