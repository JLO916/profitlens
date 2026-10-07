import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSnapshot, hashInput } from "../src/application/workspace";
import { emptyDecisionWorkspace, saveScenario, type DecisionWorkspaceState, type ScenarioPlan } from "../src/application/decision";
import { acknowledgeScenarioAssumptions, emptyScenarioWorkspace, ensureScenarioContext, scenarioContextDecision, scenarioSelectionRef, updateScenarioContext, type ScenarioSource, type ScenarioWorkspace } from "../src/application/scenario-workspace";
import { formatAmountL1, formatAmountL2, formatAmountL3, formatPeriodL1, formatSignedDelta } from "../src/application/presentation";
import { DecisionWorkbench } from "../src/components/decision-workbench";
import { MultiScenarioWorkbench } from "../src/components/multi-scenario-workbench";
import { AMOUNT_FIELDS, type AnalysisFilters } from "../src/domain/types";
import type { ScenarioInputs } from "../src/domain/scenarios";
import { validateDataset } from "../src/domain/validation";
import { fill, labels } from "../src/i18n";
import { fixture } from "./helpers/fixtures";

/*
 * V3-6 代理 A：假設試算頁（PRD §7.4、§6.3 #37–#39、D-V3-12＝B）。
 * SSR（renderToStaticMarkup）檢查版面與掛載（M1／M6）；互動沿用 tests/scenario-form.test.tsx 的 hooks harness（沒有 DOM 套件）：
 * hooks.active 時接管 useState／useMemo／useId／useEffect，直接呼叫元件函式取得元素樹，再呼叫樹上的 onClick／onChange。
 */
const hooks = vi.hoisted(() => ({ active: false, states: [] as unknown[], cursor: 0, dirty: false }));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (!hooks.active) return actual.useState(initial);
      const index = hooks.cursor++;
      if (!(index in hooks.states)) hooks.states[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      const set = (next: unknown) => {
        const previous = hooks.states[index];
        const value = typeof next === "function" ? (next as (value: unknown) => unknown)(previous) : next;
        if (!Object.is(value, previous)) { hooks.states[index] = value; hooks.dirty = true; }
      };
      return [hooks.states[index], set];
    },
    useMemo: (factory: () => unknown, deps: readonly unknown[]) => hooks.active ? factory() : actual.useMemo(factory, deps),
    useId: () => hooks.active ? ":test:" : actual.useId(),
    useEffect: (effect: () => void, deps?: readonly unknown[]) => hooks.active ? undefined : actual.useEffect(effect, deps),
  };
});
afterEach(() => { hooks.active = false; hooks.states = []; });
type TreeElement = ReactElement<Record<string, unknown>>;
function mount<P>(component: (props: P) => ReactNode) {
  hooks.active = true; hooks.states = []; hooks.cursor = 0;
  return (props: P): ReactNode => {
    let tree: ReactNode, rounds = 0;
    do { hooks.dirty = false; hooks.cursor = 0; tree = component(props); } while (hooks.dirty && ++rounds < 10);
    return tree;
  };
}
function findAll(node: ReactNode, match: (element: TreeElement) => boolean, found: TreeElement[] = []): TreeElement[] {
  if (Array.isArray(node)) for (const child of node) findAll(child, match, found);
  else if (node !== null && typeof node === "object" && "props" in node) {
    const element = node as TreeElement;
    if (match(element)) found.push(element);
    findAll(element.props.children as ReactNode, match, found);
  }
  return found;
}
function byTestId(node: ReactNode, testid: string): TreeElement {
  const [element] = findAll(node, item => item.props["data-testid"] === testid);
  expect(element, testid).toBeDefined();
  return element;
}
const textOf = (node: ReactNode): string => Array.isArray(node) ? node.map(textOf).join("") : typeof node === "string" || typeof node === "number" ? String(node) : node !== null && typeof node === "object" && "props" in node ? textOf((node as TreeElement).props.children as ReactNode) : "";
const button = (tree: ReactNode, name: string) => { const [element] = findAll(tree, item => item.type === "button" && textOf(item.props.children as ReactNode) === name); expect(element, name).toBeDefined(); return element; };
const input = (tree: ReactNode, label: string) => { const [element] = findAll(tree, item => item.type === "input" && item.props["aria-label"] === label); expect(element, label).toBeDefined(); return element; };

const page = labels.scenarios.pageV3;
const dw = labels.ui.decisionWorkbench;
const form = labels.scenarioForm;
const noop = () => undefined;
const FIELDS = ["volume_change_pct", "discount_change_pp", "fulfillment_change_pct", "ad_change_pct", "one_time_cost"] as const;
const ABSOLUTE = ["volume_change_pct", "discount_change_pp", "ad_change_pct"] as const;

async function source(name = "golden", filters: AnalysisFilters = { channels: ["DTC"] }): Promise<ScenarioSource> {
  const input = fixture(name);
  const dataset = validateDataset(input).dataset!;
  const snapshot = await createSnapshot(dataset, filters, await hashInput(input));
  return { input, dataset, snapshot, revision: 1 };
}
const accepted = (patch: Partial<ScenarioInputs> = {}): ScenarioInputs => ({ volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "0", ad_change_pct: "0", one_time_cost: "0", assumptions_accepted: true, ...patch });
/** 以 application 層 API 建一個單通路 context 並寫入方案（與頁面上「試算」相同的路徑）。 */
function withPlans(src: ScenarioSource, plans: Omit<ScenarioPlan, "result">[], workspace: ScenarioWorkspace = emptyScenarioWorkspace("e")): ScenarioWorkspace {
  let ws = ensureScenarioContext(workspace, src);
  const context = ws.contexts[ws.contexts.length - 1];
  const decision = scenarioContextDecision(context);
  for (const plan of plans) decision.scenarios = saveScenario(context.session, decision.scenarios, plan);
  ws = updateScenarioContext(ws, context.id, decision);
  return ws;
}
function render(src: ScenarioSource, state: ScenarioWorkspace = emptyScenarioWorkspace("e")) {
  return renderToStaticMarkup(createElement(MultiScenarioWorkbench, { source: src, state, setState: noop, onEvidence: noop, onSelectForReview: noop, onExport: noop }));
}

/* ---------- markup 工具（renderToStaticMarkup 的輸出是良構的） ---------- */
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const text = (html: string) => html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&");
/** 含有 attr 的元素（開始標籤到對應的結束標籤）。 */
function element(html: string, attr: string): string {
  const at = html.indexOf(attr);
  expect(at, attr).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<", at);
  const tag = /^<([a-zA-Z][\w-]*)/.exec(html.slice(start))![1];
  const re = new RegExp(`<(/?)${escapeRe(tag)}(?=[\\s>/])[^>]*?(/?)>`, "g");
  re.lastIndex = start;
  let depth = 0;
  for (let match = re.exec(html); match; match = re.exec(html)) {
    if (match[1]) depth--; else if (!match[2]) depth++;
    if (depth === 0) return html.slice(start, re.lastIndex);
  }
  throw new Error(`元素沒有結束標籤：${attr}`);
}
const openTag = (html: string, attr: string) => { const el = element(html, attr); return el.slice(0, el.indexOf(">") + 1); };
const count = (html: string, needle: string) => html.split(needle).length - 1;
const VOID = new Set(["input", "br", "img", "hr", "meta", "link", "area", "base", "col", "embed", "source", "track", "wbr"]);
const CONTROL = new Set(["button", "input", "select", "textarea", "summary"]);

/**
 * 可見控制數（PRD §7.4 驗收）：不在 [hidden] 祖先內、不在未展開 <details> 內（該 details 的 <summary> 本身算 1）的
 * button／input／select／textarea／summary；role=group 的分段鈕整組算 1（組內的按鈕不另計）。停用的控制也算（看得到）。
 */
function visibleControls(html: string): { total: number; list: string[] } {
  type Frame = { tag: string; hidden: boolean; closedDetails: boolean; summaryOfClosed: boolean; group: boolean };
  const stack: Frame[] = [];
  const list: string[] = [];
  const re = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:="[^"]*")?)*)\s*(\/?)>/g;
  for (let match = re.exec(html); match; match = re.exec(html)) {
    const [, closing, rawTag, attrs, selfClosing] = match;
    const tag = rawTag.toLowerCase();
    if (closing) { while (stack.length && stack.pop()!.tag !== tag) { /* 良構輸出不會走到 */ } continue; }
    const parent = stack[stack.length - 1];
    // 在關著的 details 內：只有它的直接 <summary> 看得到。
    const insideClosed = stack.some((frame, index) => frame.closedDetails && !(index === stack.length - 1 && tag === "summary")) && !stack.some(frame => frame.summaryOfClosed);
    const hiddenAncestor = stack.some(frame => frame.hidden);
    const inGroup = stack.some(frame => frame.group);
    const isGroup = /\srole="group"/.test(attrs);
    const visible = !hiddenAncestor && !insideClosed && !/\shidden=""/.test(attrs) && !/\stype="hidden"/.test(attrs);
    if (visible && !inGroup && (isGroup || CONTROL.has(tag))) list.push(isGroup ? `group:${/aria-label="([^"]*)"/.exec(attrs)?.[1] ?? ""}` : `${tag}:${/aria-label="([^"]*)"/.exec(attrs)?.[1] ?? /data-testid="([^"]*)"/.exec(attrs)?.[1] ?? ""}`);
    if (VOID.has(tag) || selfClosing) continue;
    stack.push({ tag, hidden: /\shidden=""/.test(attrs), closedDetails: tag === "details" && !/\sopen=""/.test(attrs), summaryOfClosed: tag === "summary" && !!parent?.closedDetails, group: isGroup });
  }
  return { total: list.length, list };
}

describe("V3-6 假設試算頁（PRD §7.4）", () => {
  it("(a) 首次進入（golden DTC、空工作區）：方案表單的可見控制 ≤ 14；整頁數字記錄在案", async () => {
    const html = render(await source());
    const plan = element(html, 'data-testid="scenario-1"');
    const form = visibleControls(plan);
    // 方案名稱、範本 select、套用範本、範本 ?、5 個輸入、3 組分段鈕、聲明勾選、試算 ＝ 14（草稿方案沒有「移除方案」）。
    expect(form.list).toHaveLength(14);
    expect(form.total).toBeLessThanOrEqual(14);
    const whole = visibleControls(html);
    // 整頁另有：試算通路 select、通路 ?、匯出本頁（summary）、本期基準 2 個 number-link、假設清單與技術細節 2 個 summary、新增方案、其他通路（summary）。
    expect(whole.total).toBe(form.total + 9);
    expect(whole.list.filter(item => item.startsWith("summary:")).length).toBe(4);
    // 範本 ? 說明的內容、匯出的三項、範圍提示都不計（hidden 或收合）。
    expect(whole.list.some(item => item.includes("scenario-export-"))).toBe(false);
  });

  it("(c) §6.3 #37–#39 的 testid 都在 SSR markup（含 hidden 掛載的範本說明與範圍提示；有效方案的敏感度）", async () => {
    const src = await source();
    const scenarios = withPlans(src, [{ id: "p", name: "履約", inputs: accepted({ fulfillment_change_pct: "-10" }) }, { id: "q", name: "超出範圍", inputs: accepted({ fulfillment_change_pct: "-10", volume_change_pct: "250" }) }]);
    const html = [render(src, scenarios), render(src), render(await source("zero_ad")), renderToStaticMarkup(createElement(DecisionWorkbench, { dataset: src.dataset, snapshot: (await source("golden", {})).snapshot, revision: 1, input: src.input, state: emptyDecisionWorkspace(), setState: noop, onEvidence: noop }))].join("");
    const ids = [
      "multi-scenario-workbench", "scenario-channel", "decision-workbench", "decision-freshness", "baseline-net_revenue", "baseline-contribution_after_marketing", "scenario-unavailable", "scenario-assumptions",
      "scenario-1", "scenario-2", "scenario-preset", "scenario-preset-apply", "scenario-preset-overwrite", "scenario-preset-purpose", "scenario-template-note",
      ...ABSOLUTE.map(field => `scenario-mode-${field}`), ...ABSOLUTE.map(field => `scenario-equivalent-${field}`), ...ABSOLUTE.map(field => `scenario-absolute-error-${field}`),
      ...FIELDS.map(field => `scenario-range-${field}`), "scenario-unavailable-ad_change_pct", "scenario-unavailable-volume_change_pct",
      "scenario-result", "scenario-version", "scenario-draft", "scenario-contribution", "scenario-delta",
      "scenario-sensitivity", "threshold-zero_contribution", "threshold-maintain_baseline", "threshold-pct", "sensitivity-result",
      "scenario-comparison", "scenario-other-channels", "decision-notice",
      "export-page-scenarios", "scenario-export-md", "scenario-export-csv", "scenario-export-json", "scenario-columns", "scenario-add", "scenario-accept", "scenario-select-1",
    ];
    const missing = ids.filter(id => !html.includes(`data-testid="${id}"`));
    expect(missing).toEqual([]);
    // 範本說明（用途、只是起點）在 ? popover 內，關著時 hidden；範圍提示沒有超出時 hidden、超出時看得到。
    const valid = render(src, scenarios);
    for (const n of [1, 2]) {
      const plan = element(valid, `data-testid="scenario-${n}"`);
      const help = element(plan, 'class="ui-popover ui-help-content scenario-help-panel"');
      expect(help).toMatch(/^<div[^>]*\shidden=""/);
      expect(help).toContain('data-testid="scenario-preset-purpose"');
      expect(help).toContain('data-testid="scenario-template-note"');
    }
    expect(openTag(element(valid, 'data-testid="scenario-1"'), 'data-testid="scenario-range-volume_change_pct"')).toMatch(/\shidden=""/);
    const outOfRange = openTag(element(valid, 'data-testid="scenario-2"'), 'data-testid="scenario-range-volume_change_pct"');
    expect(outOfRange).not.toMatch(/\shidden=""/);
    expect(outOfRange).toContain('role="status"');
    // 「選入會議」只在有效方案的結果下（方案 1）；方案 2 沒有結果可選。
    expect(element(valid, 'data-testid="scenario-1"')).toContain('data-testid="scenario-select-1"');
    expect(element(valid, 'data-testid="scenario-2"')).not.toContain("scenario-select-");
    expect(text(openTag(valid, 'data-testid="scenario-select-1"'))).toBe("");
    expect(openTag(valid, 'data-testid="scenario-select-1"')).toContain(`aria-label="${fill(labels.ui.multiScenarioWorkbench.selectPlanButton, { selectForMeeting: labels.buttons.selectForMeeting, plan: "履約" })}"`);
    expect(text(element(valid, 'data-testid="scenario-select-1"'))).toBe(labels.buttons.selectForMeeting);
    // v2 的獨立「選入會議」區、「本通路的試算」標題與說明、決策輸出區都不在了。
    expect(valid).not.toContain(labels.ui.multiScenarioWorkbench.heading);
    expect(valid).not.toContain(labels.ui.multiScenarioWorkbench.selectHint);
    expect(valid).not.toContain(form.channelHint);
    expect(valid).not.toContain("decision-export");
  }, 30_000);

  it("(b) 從範本到結果 3 個動作（選範本 → 套用 → 試算）：維持現況 270.00；手填物流費 −10 → 284.00", async () => {
    const src = await source();
    let state: DecisionWorkspaceState = { ...emptyDecisionWorkspace(), source_input: src.input };
    const setState = vi.fn((next: DecisionWorkspaceState | ((previous: DecisionWorkspaceState) => DecisionWorkspaceState)) => { state = typeof next === "function" ? next(state) : next; });
    const run = mount(DecisionWorkbench);
    const props = () => ({ dataset: src.dataset, snapshot: src.snapshot, revision: 1, input: src.input, state, setState, onEvidence: noop, acknowledged: true });
    let tree = run(props());
    // 1. 選範本
    (byTestId(tree, "scenario-preset").props.onChange as (event: unknown) => void)({ target: { value: "keep" } });
    tree = run(props());
    expect(textOf(byTestId(tree, "scenario-preset-purpose"))).toBe(labels.scenarioPresets.items.keep.purpose);
    // 2. 套用
    (byTestId(tree, "scenario-preset-apply").props.onClick as () => void)();
    tree = run(props());
    expect(state.scenarios[0].inputs).toMatchObject({ volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "0", ad_change_pct: "0", one_time_cost: "0" });
    // 3. 試算（工作區已記住聲明：不用再勾，試算時聲明以 true 計算並寫回方案）
    (button(tree, labels.buttons.calculate).props.onClick as (event?: unknown) => void)();
    tree = run(props());
    expect(state.scenarios[0].result).toMatchObject({ status: "valid", contribution: "270.00", delta: "0.00" });
    expect(state.scenarios[0].inputs.assumptions_accepted).toBe(true);
    expect(textOf(byTestId(tree, "scenario-contribution"))).toBe(formatAmountL1("270.00"));
    expect(textOf(byTestId(tree, "scenario-delta"))).toBe(formatSignedDelta("0.00", "L1"));
    // 手填物流費 −10，再按一次試算 → 284.00（比現況多 14.00）。
    (input(tree, labels.scenario.fulfillmentUnit.label).props.onChange as (event: unknown) => void)({ target: { value: "-10" } });
    tree = run(props());
    expect(textOf(byTestId(tree, "scenario-draft"))).toBe(labels.scenario.draft);
    (button(tree, labels.buttons.calculate).props.onClick as (event?: unknown) => void)();
    tree = run(props());
    expect(state.scenarios[0].result?.contribution).toBe("284.00");
    expect(formatAmountL3(state.scenarios[0].result?.contribution)).toBe(formatAmountL3("284.00"));
    expect(textOf(byTestId(tree, "scenario-contribution"))).toBe(formatAmountL1("284.00"));
    expect(textOf(byTestId(tree, "scenario-delta"))).toBe(formatSignedDelta("14.00", "L1"));
    // 第二個方案：一次性費用 20 → 264.00（新增方案時聲明直接視為已勾）。
    (byTestId(tree, "scenario-add").props.onClick as () => void)();
    tree = run(props());
    expect(state.scenarios).toHaveLength(2);
    expect(state.scenarios[1].inputs.assumptions_accepted).toBe(true);
    const second = byTestId(tree, "scenario-2");
    (byTestId(second, "scenario-preset").props.onChange as (event: unknown) => void)({ target: { value: "keep" } });
    tree = run(props());
    (byTestId(byTestId(tree, "scenario-2"), "scenario-preset-apply").props.onClick as () => void)();
    tree = run(props());
    (input(byTestId(tree, "scenario-2"), labels.scenario.fulfillmentUnit.label).props.onChange as (event: unknown) => void)({ target: { value: "-10" } });
    tree = run(props());
    (input(byTestId(tree, "scenario-2"), labels.scenario.oneOff.label).props.onChange as (event: unknown) => void)({ target: { value: "20" } });
    tree = run(props());
    (button(byTestId(tree, "scenario-2"), labels.buttons.calculate).props.onClick as (event?: unknown) => void)();
    tree = run(props());
    expect(state.scenarios.map(plan => plan.result?.contribution)).toEqual(["284.00", "264.00"]);
  });

  it("(d) 其他通路 MARKETPLACE 19.70 與比較表數字不變（L2 表格、L3 取位調整）", async () => {
    const marketplace = await source("golden", { channels: ["MARKETPLACE"] });
    const inputs = accepted({ volume_change_pct: "20", discount_change_pp: "2", fulfillment_change_pct: "-10", ad_change_pct: "-20", one_time_cost: "20" });
    const ws = withPlans(marketplace, [{ id: "m", name: "M", inputs }]);
    const plan = ws.contexts[0].plans[0];
    expect(plan.result?.contribution).toBe("19.70");
    const html = render(marketplace, ws);
    expect(text(element(html, 'data-testid="scenario-contribution"'))).toBe(formatAmountL1("19.70"));
    const table = element(html, 'data-testid="scenario-comparison"');
    const rows = [...table.matchAll(/<tr[^>]*><th>([^<]*)<\/th>((?:<td[^>]*>[^<]*<\/td>)+)<\/tr>/g)].map(match => [match[1], [...match[2].matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map(cell => cell[1].replace(/&amp;/g, "&"))]);
    const baseline = ws.contexts[0].session.baseline.amounts;
    const expected = [
      ...AMOUNT_FIELDS.map(field => [labels.metrics[field].label, [formatAmountL2(baseline[field]), formatAmountL2(plan.result?.amounts?.[field] ?? null)]]),
      [labels.scenario.oneOff.label, [labels.status.notApplicable, formatAmountL2(plan.result?.amounts?.one_time_cost ?? null)]],
      [dw.roundingAdjustment, [labels.status.notApplicable, formatAmountL3(plan.result?.rounding_adjustment ?? null)]],
      [labels.metrics.contribution_after_marketing.label, [formatAmountL2(baseline.contribution_after_marketing), formatAmountL2("19.70")]],
      [fill(dw.netRevenueSummaryRow, { metric: labels.metrics.net_revenue.label }), [formatAmountL2(baseline.net_revenue), formatAmountL2(plan.result?.amounts?.net_revenue ?? null)]],
    ];
    expect(rows).toEqual(expected);
    // 比較表預設展開（不在 <details> 內），數字欄右對齊。
    expect(html.slice(0, html.indexOf('data-testid="scenario-comparison"'))).not.toMatch(/<details(?![^>]*\sopen)[^>]*>(?![\s\S]*<\/details>)/);
    expect(table).toContain('<td class="num">');
    // DTC 頁看 MARKETPLACE 的方案：在「其他通路的方案」<details> 內，金額 L1。
    const dtc = render(await source(), ws);
    expect(element(dtc, 'data-testid="scenario-other-channels"')).toContain(fill(labels.ui.multiScenarioWorkbench.planSummary, { plan: "M", resultLabel: labels.scenario.resultTitle, amount: formatAmountL1("19.70") }));
  }, 30_000);

  it("(e) 聲明（D-V3-12＝B）：沒記住時每個方案都有勾選框；記住後沒有勾選框而有一行說明；第一次勾選呼叫 onAcknowledge 一次", async () => {
    const src = await source();
    const ws = withPlans(src, [{ id: "a", name: "A", inputs: accepted() }, { id: "b", name: "B", inputs: { ...accepted(), assumptions_accepted: false } }]);
    const before = render(src, ws);
    for (const n of [1, 2]) {
      const plan = element(before, `data-testid="scenario-${n}"`);
      expect(plan).toMatch(new RegExp(`<input type="checkbox" class="ui-check" data-testid="scenario-accept"[^>]*/>${labels.scenario.acceptAssumptions}</label>`));
      expect(plan).not.toContain('data-testid="scenario-acknowledged"');
    }
    const after = render(src, acknowledgeScenarioAssumptions(ws, "2026-10-07T00:00:00.000Z"));
    for (const n of [1, 2]) {
      const plan = element(after, `data-testid="scenario-${n}"`);
      expect(plan).not.toContain('type="checkbox"');
      expect(text(element(plan, 'data-testid="scenario-acknowledged"'))).toBe(page.acknowledged);
    }
    // 互動：第一次勾選＝寫入方案＋記住；記住之後同一個工作區不再出現勾選框（由 MultiScenarioWorkbench 傳入 acknowledged）。
    let state: DecisionWorkspaceState = { ...emptyDecisionWorkspace(), source_input: src.input };
    const setState = vi.fn((next: DecisionWorkspaceState | ((previous: DecisionWorkspaceState) => DecisionWorkspaceState)) => { state = typeof next === "function" ? next(state) : next; });
    const onAcknowledge = vi.fn();
    const run = mount(DecisionWorkbench);
    const props = { dataset: src.dataset, snapshot: src.snapshot, revision: 1, input: src.input, get state() { return state; }, setState, onEvidence: noop, onAcknowledge };
    let tree = run(props);
    (byTestId(tree, "scenario-accept").props.onChange as (event: unknown) => void)({ target: { checked: true } });
    expect(onAcknowledge).toHaveBeenCalledTimes(1);
    expect(state.scenarios[0].inputs.assumptions_accepted).toBe(true);
    tree = run(props);
    (byTestId(tree, "scenario-accept").props.onChange as (event: unknown) => void)({ target: { checked: false } });
    expect(onAcknowledge).toHaveBeenCalledTimes(1);
    // MultiScenarioWorkbench：acknowledged＝工作區有 assumptions_acknowledged_at；onAcknowledge 寫入 ISO 時間，已記住時不再改。
    let workspace = emptyScenarioWorkspace("e");
    const setWorkspace = vi.fn((next: ScenarioWorkspace | ((previous: ScenarioWorkspace) => ScenarioWorkspace)) => { workspace = typeof next === "function" ? next(workspace) : next; });
    const page2 = mount(MultiScenarioWorkbench);
    const msw = () => byTestId(page2({ source: src, state: workspace, setState: setWorkspace, onEvidence: noop }), "multi-scenario-workbench");
    const workbench = () => findAll(msw(), item => item.type === DecisionWorkbench)[0];
    expect(workbench().props.acknowledged).toBe(false);
    (workbench().props.onAcknowledge as () => void)();
    expect(workspace.assumptions_acknowledged_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const first = workspace.assumptions_acknowledged_at;
    expect(workbench().props.acknowledged).toBe(true);
    (workbench().props.onAcknowledge as () => void)();
    expect(workspace.assumptions_acknowledged_at).toBe(first);
  }, 30_000);

  it("「選入會議」：只有已寫入工作區的有效方案；MultiScenarioWorkbench 傳出 scenarioSelectionRef", async () => {
    const src = await source();
    const ws = withPlans(src, [{ id: "p", name: "履約", inputs: accepted({ fulfillment_change_pct: "-10" }) }]);
    const onSelectForReview = vi.fn();
    const run = mount(MultiScenarioWorkbench);
    const tree = run({ source: src, state: ws, setState: noop, onEvidence: noop, onSelectForReview });
    const [workbench] = findAll(tree, item => item.type === DecisionWorkbench);
    (workbench.props.onSelectPlan as (id: string) => void)("p");
    expect(onSelectForReview).toHaveBeenCalledWith(scenarioSelectionRef(ws.contexts[0], "p"));
    // 還沒寫入工作區（進頁草稿）時沒有「選入會議」。
    const fresh = mount(MultiScenarioWorkbench)({ source: src, state: emptyScenarioWorkspace("e"), setState: noop, onEvidence: noop, onSelectForReview });
    expect(findAll(fresh, item => item.type === DecisionWorkbench)[0].props.onSelectPlan).toBeUndefined();
  });

  it("(f) 頁首動作：SSR 時放在工作台頂端（scenario-page-actions-inline），匯出三項在收合的 details 內，? 說明 hidden 掛載；各只有一份", async () => {
    const src = await source();
    const html = render(src);
    const inline = [...html.matchAll(/<div class="scenario-page-actions-inline">/g)];
    expect(inline).toHaveLength(2);
    const channelSlot = element(html, '<div class="scenario-page-actions-inline">');
    expect(channelSlot).toContain('data-testid="scenario-channel"');
    expect(channelSlot).toContain(`aria-label="${form.channel}"`);
    const channelHelp = element(channelSlot, 'class="ui-popover ui-help-content scenario-help-panel"');
    expect(channelHelp).toMatch(/^<div[^>]*\shidden=""/);
    expect(text(channelHelp)).toBe(page.channelHelp);
    expect(channelSlot).toContain(`aria-label="${page.channelHelpAria}" aria-expanded="false"`);
    const menu = element(html, 'data-testid="scenario-export-menu"');
    expect(openTag(html, 'data-testid="scenario-export-menu"')).toMatch(/^<details class="topbar-menu auto-close export-page scenario-export"/);
    expect(openTag(html, 'data-testid="scenario-export-menu"')).not.toMatch(/\sopen=""/);
    expect(text(element(menu, 'data-testid="export-page-scenarios"'))).toBe(labels.products.pageV3.exportPage);
    for (const [format, label] of [["md", labels.downloads.decisionMd], ["csv", labels.downloads.decisionCsv], ["json", labels.downloads.decisionJson]] as const) {
      expect(text(element(menu, `data-testid="scenario-export-${format}"`))).toBe(label);
      expect(count(html, `data-testid="scenario-export-${format}"`)).toBe(1);
    }
    expect(element(html, '<div class="decision-workbench"')).toContain('data-testid="scenario-export-menu"');
    for (const id of ["scenario-channel", "export-page-scenarios", "decision-freshness", "scenario-columns"]) expect(count(html, `data-testid="${id}"`), id).toBe(1);
    // 下載仍走 v2 的同一個 handler：有 onExport 時呼叫 onExport，通知寫到 decision-notice。
    const onExport = vi.fn();
    const state: DecisionWorkspaceState = { ...emptyDecisionWorkspace(), source_input: src.input };
    const run = mount(DecisionWorkbench);
    const props = { dataset: src.dataset, snapshot: src.snapshot, revision: 1, input: src.input, state, setState: noop, onEvidence: noop, onExport };
    let tree = run(props);
    (byTestId(tree, "scenario-export-csv").props.onClick as () => void)();
    expect(onExport).toHaveBeenCalledWith("csv");
    tree = run(props);
    expect(textOf(byTestId(tree, "decision-notice"))).toBe(dw.noticeDownloadedActions);
  });

  it("(g) 基準列、分段鈕「增減／改成」、單位後綴、placeholder 與只有改成時才出現的等值換算", async () => {
    const src = await source();
    const html = render(src);
    const row = element(html, 'class="baseline-row"');
    const session = withPlans(src, []).contexts[0].session;
    expect(text(element(row, 'class="baseline-title"'))).toBe(fill(page.baselineTitle, { channels: "DTC", period: formatPeriodL1(session.period.start, session.period.end, { days: false, anchor: session.data_as_of }) }));
    expect(row).toMatch(/<dl class="baseline-list"><div><dt>[^<]+<\/dt><dd><button type="button" class="number-link" data-testid="baseline-net_revenue">/);
    expect(text(element(row, 'data-testid="baseline-contribution_after_marketing"'))).toBe(formatAmountL1("270.00"));
    expect(text(element(row, 'data-testid="decision-freshness"'))).toBe(dw.freshTitle);
    expect(row).not.toContain(dw.rebuildButton);
    const plan = element(html, 'data-testid="scenario-1"');
    for (const field of ABSOLUTE) {
      const group = element(plan, `data-testid="scenario-mode-${field}"`);
      expect(group).toMatch(/^<div class="ui-segmented scenario-mode" role="group"/);
      expect([...group.matchAll(/<button type="button" aria-pressed="(true|false)"[^>]*>([^<]*)<\/button>/g)].map(match => [match[1], match[2]])).toEqual([["true", page.modeRelative], ["false", page.modeAbsolute]]);
    }
    const units: Record<(typeof FIELDS)[number], string> = { volume_change_pct: page.unitPercent, discount_change_pp: page.unitPoints, fulfillment_change_pct: page.unitPercent, ad_change_pct: page.unitPercent, one_time_cost: page.unitYuan };
    const helps: Record<(typeof FIELDS)[number], string> = { volume_change_pct: dw.volumeHelp, discount_change_pp: dw.discountHelp, fulfillment_change_pct: dw.fulfillmentHelp, ad_change_pct: dw.adHelp, one_time_cost: labels.scenario.oneOff.hint };
    for (const field of FIELDS) {
      const row = element(plan, `id="${/id="([^"]+)-volume_change_pct"/.exec(plan)![1]}-${field}"`);
      expect(row).toContain(`placeholder="${helps[field]}"`);
      const box = element(plan, `class="scenario-input-row"><input id="${/id="([^"]+)-volume_change_pct"/.exec(plan)![1]}-${field}"`);
      expect(box).toContain(`<span class="scenario-unit">${units[field]}</span>`);
    }
    // 廣告欄下方保留一行「調廣告不會自動帶動銷量」。
    expect(plan).toContain(`<small class="ui-field-hint scenario-ad-note">${dw.adVolumeNote}</small>`);
    // 方案欄是 grid（1 個方案時 data-count=1，右側是新增區）。
    expect(openTag(html, 'data-testid="scenario-columns"')).toContain('data-count="1"');
    expect(element(html, 'class="scenario-add ui-empty-block"')).toContain(page.addNote);
  });

  it("(g2) 改成模式：等值換算出現、單位換成絕對單位、說明看得到；增減模式時 hidden", async () => {
    const src = await source();
    const ws = withPlans(src, [{ id: "p", name: "P", inputs: accepted({ volume_change_pct: "50" }) }]);
    const context = ws.contexts[0];
    const run = mount(DecisionWorkbench);
    const props = { dataset: src.dataset, snapshot: src.snapshot, revision: context.session.revision, input: context.source_input, state: scenarioContextDecision(context), setState: noop, onEvidence: noop };
    let tree = run(props);
    const equivalent = () => byTestId(tree, "scenario-equivalent-volume_change_pct");
    expect(equivalent().props.hidden).toBe(true);
    const mode = findAll(byTestId(tree, "scenario-mode-volume_change_pct"), item => item.type === "button");
    (mode[1].props.onClick as () => void)();
    tree = run(props);
    expect(equivalent().props.hidden).toBe(false);
    const field = findAll(tree, item => item.props.className === "scenario-unit");
    expect(textOf(field[0])).toBe(page.unitCount);
    expect(input(tree, labels.scenario.volume.label).props.value).toBe("6");
    const describedby = String(input(tree, labels.scenario.volume.label).props["aria-describedby"]);
    expect(describedby.split(" ")).toEqual([":test:-1-volume_change_pct-help", ":test:-1-volume_change_pct-equivalent"]);
  });
});
