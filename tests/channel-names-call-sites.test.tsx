import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHANNEL_SETTINGS_VERSION, type ChannelSettings } from "@/application/channel-settings";
import { addActionDraft, confirmBoundAction, editBoundAction, emptyActionWorkspace, previewActionRebind, type ActionSource } from "@/application/action-workspace";
import { createReviewSession, rebuildReviewSnapshot } from "@/application/review-session";
import { emptyScenarioWorkspace, type ScenarioSource } from "@/application/scenario-workspace";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import { DecisionWorkbench } from "@/components/decision-workbench";
import { ManagerSummary } from "@/components/manager-summary";
import { MeetingPage } from "@/components/meeting-page";
import { MultiScenarioWorkbench } from "@/components/multi-scenario-workbench";
import { validateDataset } from "@/domain/validation";
import { labels } from "@/i18n";
import { synthetic4ChannelInput } from "./helpers/synthetic-4-channel";

/*
 * V42-1a（PRD §3.4 的 10 個 createSnapshot 呼叫點；06_BATCHES V42-1a 第 2 項）：非備份的五個呼叫點都要把 Active.channel_settings 傳給
 * createSnapshot 的第 4 個參數，否則同一個通路會在總覽顯示名稱、在試算頁／會議頁／待辦重綁／會議重算後顯示代碼。
 * 這裡對 createSnapshot 加 spy（包住真的實作）直接看第 4 個參數，並讓元件的 useEffect 真的跑（沒有 DOM 套件：hooks.active 時接管
 * useState／useRef／useMemo／useId／useEffect，effect 依 deps 在每次 render 後執行），其餘時間交給真正的 React（SSR 檢查）。
 * 另含 F1：會議摘要與議程的通路寬表（ChannelWideTable default 變體）讀快照的 channel_names，與相鄰的精簡表同一組名稱。
 */
const hooks = vi.hoisted(() => ({ active: false, slots: [] as unknown[], cursor: 0, dirty: false, effects: [] as (() => void)[] }));
interface EffectSlot { kind: "effect"; deps?: readonly unknown[]; cleanup?: void | (() => void) }
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (!hooks.active) return actual.useState(initial);
      const slots = hooks.slots; const index = hooks.cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      const set = (next: unknown) => {
        const previous = slots[index];
        const value = typeof next === "function" ? (next as (value: unknown) => unknown)(previous) : next;
        if (!Object.is(value, previous)) { slots[index] = value; hooks.dirty = true; }
      };
      return [slots[index], set];
    },
    useRef: (initial: unknown) => {
      if (!hooks.active) return actual.useRef(initial);
      const index = hooks.cursor++;
      if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
      return hooks.slots[index];
    },
    useMemo: (factory: () => unknown, deps: readonly unknown[]) => hooks.active ? factory() : actual.useMemo(factory, deps),
    useId: () => hooks.active ? "_r1_" : actual.useId(),
    useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => {
      if (!hooks.active) return actual.useEffect(effect, deps);
      const slots = hooks.slots; const index = hooks.cursor++;
      const slot = slots[index] as EffectSlot | undefined;
      const changed = !slot || !deps || !slot.deps || deps.length !== slot.deps.length || deps.some((dep, i) => !Object.is(dep, slot.deps![i]));
      if (!slot) slots[index] = { kind: "effect" } satisfies EffectSlot;
      if (changed) hooks.effects.push(() => {
        const current = slots[index] as EffectSlot;
        if (typeof current.cleanup === "function") current.cleanup();
        current.cleanup = effect(); current.deps = deps;
      });
    },
  };
});
// createSnapshot 的 spy 包住真的實作：review-session.ts、action-workspace.ts 與元件都經同一個模組 id 拿到它。
vi.mock("@/application/workspace", async importOriginal => {
  const actual = await importOriginal<typeof import("@/application/workspace")>();
  return { ...actual, createSnapshot: vi.fn(actual.createSnapshot) };
});
const spy = vi.mocked(createSnapshot);

type TreeElement = ReactElement<Record<string, unknown>>;
function mount<P>(component: (props: P) => ReactNode) {
  hooks.active = true; hooks.slots = [];
  return (props: P): ReactNode => {
    hooks.active = true;
    let tree: ReactNode, rounds = 0;
    do { hooks.dirty = false; hooks.cursor = 0; hooks.effects = []; tree = component(props); } while (hooks.dirty && ++rounds < 10);
    const effects = hooks.effects; hooks.effects = [];
    for (const run of effects) run();
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
afterEach(() => { hooks.active = false; hooks.slots = []; hooks.effects = []; spy.mockClear(); });

const SETTINGS: ChannelSettings = { version: CHANNEL_SETTINGS_VERSION, channels: [{ code: "DTC", label: "官網" }], groups: [] };
const NAME = "官網";
const noop = () => undefined;
const page = labels.scenarios.pageV3;
const record = labels.meeting.record;

async function prepared() {
  const input = synthetic4ChannelInput();
  const dataset = validateDataset(input).dataset!;
  const hash = await hashInput(input);
  const all = await createSnapshot(dataset, {}, hash, SETTINGS);
  const dtc = await createSnapshot(dataset, { channels: ["DTC"] }, hash);
  spy.mockClear();
  return { input, dataset, hash, all, dtc };
}
const lastSettings = () => spy.mock.calls.at(-1)![3];
const lastSnapshot = (): Promise<WorkspaceSnapshot> => spy.mock.results.at(-1)!.value as Promise<WorkspaceSnapshot>;

describe("V42-1a createSnapshot 的呼叫點都傳 Active.channel_settings", () => {
  it("試算頁：非單一通路範圍下自建的單一通路快照帶設定，基準標題的範圍文字是顯示名稱", async () => {
    const { input, dataset, all } = await prepared();
    const source: ScenarioSource = { input, dataset, snapshot: all, revision: 1, channel_settings: SETTINGS };
    const props = { source, state: emptyScenarioWorkspace("e"), setState: noop, onEvidence: noop, onSelectForReview: noop, onExport: noop };
    const view = mount(MultiScenarioWorkbench);
    let tree = view(props);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][1].channels).toEqual(["DTC"]);
    expect(lastSettings()).toBe(SETTINGS);
    const single = await lastSnapshot();
    expect(single.channel_names).toEqual({ DTC: NAME });
    // 單一通路快照建好後，頁面以它渲染 DecisionWorkbench：基準標題「本期基準（官網，…）」。
    tree = view(props);
    const [workbench] = findAll(tree, element => element.type === DecisionWorkbench);
    expect(workbench).toBeDefined();
    expect((workbench.props.snapshot as WorkspaceSnapshot).channel_names).toEqual({ DTC: NAME });
    hooks.active = false;
    const markup = renderToStaticMarkup(createElement(DecisionWorkbench, workbench.props as Parameters<typeof DecisionWorkbench>[0]));
    expect(markup).toContain(`${page.baselineTitle.split("{channels}")[0]}${NAME}`);
    expect(markup).not.toContain(`${page.baselineTitle.split("{channels}")[0]}DTC`);
  });

  it("會議頁：會議範圍與目前範圍不同時重算來源快照帶設定", async () => {
    const { input, dataset, all, dtc } = await prepared();
    const review = createReviewSession({ input, dataset, snapshot: dtc, revision: 1 }, "e", "rev-names");
    const source: ScenarioSource = { input, dataset, snapshot: all, revision: 1, channel_settings: SETTINGS };
    const view = mount(MeetingPage);
    view({ source, scenarioWorkspace: emptyScenarioWorkspace("e"), actionWorkspace: emptyActionWorkspace(), review, history: [], onChange: noop, onEvidence: noop, onFinalize: async () => undefined });
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0][1].channels).toEqual(["DTC"]);
    expect(lastSettings()).toBe(SETTINGS);
    expect((await lastSnapshot()).channel_names).toEqual({ DTC: NAME });
  });

  it("待辦重綁預覽：目標來源的快照帶呼叫端傳入的設定", async () => {
    const { input, dataset, dtc } = await prepared();
    const source: ActionSource = { input, dataset, snapshot: dtc, revision: 1 };
    let workspace = addActionDraft(emptyActionWorkspace(), source, "A");
    const fact = workspace.contexts[0].session.facts.find(entry => entry.metric === "contribution_after_marketing" && entry.scope.kind === "channel")!;
    workspace = confirmBoundAction(editBoundAction(workspace, "A", { fact_ids: [fact.id] }), "A");
    spy.mockClear();
    const preview = await previewActionRebind(workspace, "A", { ...source, revision: 2 }, SETTINGS);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(lastSettings()).toBe(SETTINGS);
    expect((await lastSnapshot()).channel_names).toEqual({ DTC: NAME });
    expect(preview.target_context.session.dataset_hash).toBe(dtc.dataset_hash);
  });

  it("會議來源重算：rebuildReviewSnapshot 帶設定時快照有 channel_names，沒帶時沒有", async () => {
    const { input, dataset, dtc } = await prepared();
    const review = createReviewSession({ input, dataset, snapshot: dtc, revision: 1 }, "e", "rev-rebuild");
    const named = await rebuildReviewSnapshot(review, SETTINGS);
    expect(named.channel_names).toEqual({ DTC: NAME });
    expect(named.filter_hash).toBe(review.filter_hash);
    const plain = await rebuildReviewSnapshot(review);
    expect("channel_names" in plain).toBe(false);
  });

  it("總覽 applyFilters：換範圍重算時傳 active.channel_settings（dashboard 沒有可在 node 下掛載的殼層，直接對原始碼斷言）", () => {
    const dashboard = readFileSync(resolve("src/components/dashboard.tsx"), "utf8");
    const start = dashboard.indexOf("async function applyFilters(");
    expect(start).toBeGreaterThan(-1);
    const following = ["\n  async function ", "\n  function "].map(marker => dashboard.indexOf(marker, start + 1)).filter(index => index > start);
    const body = dashboard.slice(start, Math.min(...following));
    expect(body).toContain("createSnapshot(active.dataset, filters, active.snapshot.dataset_hash, active.channel_settings ?? null)");
  });
});

describe("V42-1a 會議摘要的通路寬表讀快照的 channel_names（F1）", () => {
  it("會議摘要（default）與議程（agenda）的寬表列標題都是顯示名稱，與精簡表同一組；沒有設定時是代碼", async () => {
    const { dataset, hash, all } = await prepared();
    hooks.active = false;
    const summaryMarkup = renderToStaticMarkup(createElement(ManagerSummary, { snapshot: all, onEvidence: noop }));
    expect(summaryMarkup).toContain(`<th scope="row">${NAME}`);
    expect(summaryMarkup).not.toContain('<th scope="row">DTC');
    const agendaMarkup = renderToStaticMarkup(createElement(ManagerSummary, { snapshot: all, onEvidence: noop, agenda: { kpis: record.agenda.kpis, priorities: record.agenda.priorities, channels: record.agenda.channels } }));
    expect(agendaMarkup.split(`<th scope="row">${NAME}`).length - 1).toBe(2);
    expect(agendaMarkup).not.toContain('<th scope="row">DTC');
    const plain = await createSnapshot(dataset, {}, hash);
    expect(renderToStaticMarkup(createElement(ManagerSummary, { snapshot: plain, onEvidence: noop }))).toContain('<th scope="row">DTC');
  });
});
