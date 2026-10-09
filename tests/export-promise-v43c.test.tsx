import { createRef, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fixture } from "./helpers/fixtures";
import { validateDataset } from "@/domain/validation";
import { createSnapshot, hashInput } from "@/application/workspace";
import { emptyDecisionWorkspace, type DecisionWorkspaceState } from "@/application/decision";
import { addActionDraft, emptyActionWorkspace, type ActionSource, type ActionWorkspace } from "@/application/action-workspace";
import { ActionsWorkbench } from "@/components/actions-workbench";
import { DecisionWorkbench } from "@/components/decision-workbench";
import { ExportMenu, type ExportMenuProps } from "@/components/shell/export-menu";
import { labels } from "@/i18n";

/*
 * V4-3c（D-V4-42＝A）：決策匯出改成按下時 import()，所以 onExport／onDecision 可以回傳 promise。
 * 這裡驗三個呼叫端的 promise 分支：待辦頁「匯出本頁」（ActionsWorkbench.exportAs）、試算頁「匯出本頁」（DecisionWorkbench.download）、
 * 頂欄「匯出」選單的決策工作稿（ExportMenu.decide）——完成才寫成功通知、失敗寫失敗通知或交給 reportError，不留未處理的 rejection；同步的 handler 照舊。
 * 沒有 DOM 套件：沿用 tests/meeting-page.test.tsx 的 hooks harness（直接呼叫元件函式取得元素樹，再呼叫樹上的 onClick）。
 */
const hooks = vi.hoisted(() => ({ active: false, states: [] as unknown[], refs: [] as { current: unknown }[], cursor: 0, refCursor: 0, dirty: false }));
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
    useRef: (initial: unknown) => {
      if (!hooks.active) return actual.useRef(initial);
      const index = hooks.refCursor++;
      hooks.refs[index] ??= { current: initial };
      return hooks.refs[index];
    },
    useMemo: (factory: () => unknown, deps: readonly unknown[]) => hooks.active ? factory() : actual.useMemo(factory, deps),
    useCallback: (callback: unknown, deps: readonly unknown[]) => hooks.active ? callback : actual.useCallback(callback as () => void, deps),
    useId: () => hooks.active ? ":test:" : actual.useId(),
    useEffect: (effect: () => void, deps?: readonly unknown[]) => hooks.active ? undefined : actual.useEffect(effect, deps),
    useLayoutEffect: (effect: () => void, deps?: readonly unknown[]) => hooks.active ? undefined : actual.useLayoutEffect(effect, deps),
    // usePageSlot：沒有 DOM，取伺服器端的值（null），頁首動作渲染在元件內（與 SSR 相同）。
    useSyncExternalStore: (subscribe: () => () => void, getSnapshot: () => unknown, getServerSnapshot?: () => unknown) => hooks.active ? (getServerSnapshot ?? getSnapshot)() : actual.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot),
  };
});
const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
afterEach(() => { hooks.active = false; hooks.states = []; hooks.refs = []; process.off("unhandledRejection", onUnhandled); unhandled.length = 0; vi.unstubAllGlobals(); });

type TreeElement = ReactElement<Record<string, unknown>>;
function mount<P>(component: (props: P) => ReactNode) {
  hooks.active = true; hooks.states = []; hooks.refs = [];
  return (props: P): ReactNode => {
    let tree: ReactNode, rounds = 0;
    do { hooks.dirty = false; hooks.cursor = 0; hooks.refCursor = 0; tree = component(props); } while (hooks.dirty && ++rounds < 10);
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
function one(node: ReactNode, match: (element: TreeElement) => boolean, name: string): TreeElement {
  const [element] = findAll(node, match);
  expect(element, name).toBeDefined();
  return element;
}
const byTestId = (node: ReactNode, testid: string) => one(node, element => element.props["data-testid"] === testid, testid);
const textOf = (node: ReactNode): string => Array.isArray(node) ? node.map(textOf).join("") : typeof node === "string" || typeof node === "number" ? String(node) : node !== null && typeof node === "object" && "props" in node ? textOf((node as TreeElement).props.children as ReactNode) : "";
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
function deferred() {
  let resolve!: () => void, reject!: (error: unknown) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const noop = () => undefined;
const CHUNK_ERROR = new Error("CHUNK_LOAD_FAILED");

let source: ActionSource;
let actions: ActionWorkspace;
beforeAll(async () => {
  const input = fixture("golden");
  const dataset = validateDataset(input).dataset!;
  source = { input, dataset, snapshot: await createSnapshot(dataset, {}, await hashInput(input)), revision: 1 };
  actions = addActionDraft(emptyActionWorkspace(), source, "draft-1");
});

describe("V4-3c 決策匯出回傳 promise：待辦頁「匯出本頁」", () => {
  const ui = labels.actions.workbench;
  const notice = (tree: ReactNode) => findAll(tree, element => element.props["data-testid"] === "action-notice").map(element => textOf(element.props.children as ReactNode));
  const props = (onExport: (format: "md" | "csv" | "json") => void | Promise<void>) => ({ workspace: actions, onChange: noop, source, onEvidence: noop, onExport });

  it("載入中不先寫「已匯出」；完成後才寫，失敗寫 exportFailed，沒有未處理的 rejection", async () => {
    process.on("unhandledRejection", onUnhandled);
    const view = mount(ActionsWorkbench);
    const pending = deferred();
    const onExport = vi.fn(() => pending.promise);
    let tree = view(props(onExport));
    (byTestId(tree, "actions-export-csv").props.onClick as () => void)();
    expect(onExport).toHaveBeenCalledWith("csv");
    tree = view(props(onExport));
    expect(notice(tree), "還在載入決策匯出程式").toEqual([]);
    pending.resolve();
    await settle();
    tree = view(props(onExport));
    expect(notice(tree)).toEqual([ui.exportDone]);

    const failing = vi.fn(() => Promise.reject(CHUNK_ERROR));
    tree = view(props(failing));
    (byTestId(tree, "actions-export-json").props.onClick as () => void)();
    await settle();
    tree = view(props(failing));
    expect(notice(tree)).toEqual([ui.exportFailed]);
    await settle();
    expect(unhandled).toEqual([]);
  });

  it("同步的 onExport 照舊：立刻寫「已匯出」；同步擲錯寫 exportFailed", () => {
    const view = mount(ActionsWorkbench);
    const sync = vi.fn();
    let tree = view(props(sync));
    (byTestId(tree, "actions-export-md").props.onClick as () => void)();
    tree = view(props(sync));
    expect(notice(tree)).toEqual([ui.exportDone]);
    const throwing = vi.fn(() => { throw CHUNK_ERROR; });
    tree = view(props(throwing));
    (byTestId(tree, "actions-export-md").props.onClick as () => void)();
    tree = view(props(throwing));
    expect(notice(tree)).toEqual([ui.exportFailed]);
  });
});

describe("V4-3c 決策匯出回傳 promise：試算頁「匯出本頁」", () => {
  const dw = labels.scenarios.decision;
  const notice = (tree: ReactNode) => textOf(byTestId(tree, "decision-notice").props.children as ReactNode);
  const props = (onExport: (format: "md" | "csv" | "json") => void | Promise<void>) => {
    const state: DecisionWorkspaceState = { ...emptyDecisionWorkspace(), source_input: source.input };
    return { dataset: source.dataset, snapshot: source.snapshot, revision: 1, input: source.input, state, setState: noop, onEvidence: noop, onExport };
  };

  it("載入中不先寫下載通知；完成後寫 noticeDownloadedActions，失敗寫 noticeExportFailed，沒有未處理的 rejection", async () => {
    process.on("unhandledRejection", onUnhandled);
    const view = mount(DecisionWorkbench);
    const pending = deferred();
    const onExport = vi.fn(() => pending.promise);
    let tree = view(props(onExport));
    (byTestId(tree, "scenario-export-md").props.onClick as () => void)();
    expect(onExport).toHaveBeenCalledWith("md");
    tree = view(props(onExport));
    expect(notice(tree), "還在載入決策匯出程式").toBe("");
    pending.resolve();
    await settle();
    tree = view(props(onExport));
    expect(notice(tree)).toBe(dw.noticeDownloadedActions);

    const failing = vi.fn(() => Promise.reject(CHUNK_ERROR));
    tree = view(props(failing));
    (byTestId(tree, "scenario-export-csv").props.onClick as () => void)();
    await settle();
    tree = view(props(failing));
    expect(notice(tree)).toBe(dw.noticeExportFailed);
    await settle();
    expect(unhandled).toEqual([]);
  });

  it("同步的 onExport 照舊：立刻寫 noticeDownloadedActions", () => {
    const view = mount(DecisionWorkbench);
    const sync = vi.fn();
    let tree = view(props(sync));
    (byTestId(tree, "scenario-export-json").props.onClick as () => void)();
    tree = view(props(sync));
    expect(notice(tree)).toBe(dw.noticeDownloadedActions);
  });
});

describe("V4-3c 決策匯出回傳 promise：頂欄「匯出」選單的決策工作稿", () => {
  const menuProps = (onDecision: ExportMenuProps["onDecision"]): ExportMenuProps => ({
    source: { dataset: source.dataset, snapshot: source.snapshot }, busy: null, error: null, summaryRef: createRef<HTMLElement>(),
    onDecision, onPrint: noop, onExport: noop, onMeetingNotes: noop, onCopySummary: async () => ({ copied: true, text: "" }),
  });
  const decisionItem = (tree: ReactNode, format: "md" | "csv" | "json") => one(tree, element => element.props.id === `download-decision-${format}`, `download-decision-${format}`);

  it("載入失敗交給 reportError（與 v3 事件處理同步擲錯時相同），不留未處理的 rejection；成功不呼叫 reportError", async () => {
    process.on("unhandledRejection", onUnhandled);
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    const view = mount(ExportMenu);
    const failing = vi.fn(() => Promise.reject(CHUNK_ERROR));
    let tree = view(menuProps(failing));
    (decisionItem(tree, "md").props.onClick as () => void)();
    expect(failing).toHaveBeenCalledWith("md");
    await settle();
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(CHUNK_ERROR);

    const pending = deferred();
    const ok = vi.fn(() => pending.promise);
    tree = view(menuProps(ok));
    (decisionItem(tree, "json").props.onClick as () => void)();
    expect(ok).toHaveBeenCalledWith("json");
    pending.resolve();
    await settle();
    expect(reportError).toHaveBeenCalledTimes(1);
    await settle();
    expect(unhandled).toEqual([]);
  });

  it("沒有 reportError 的環境：失敗也不留未處理的 rejection；同步的 onDecision 照舊被呼叫", async () => {
    process.on("unhandledRejection", onUnhandled);
    vi.stubGlobal("reportError", undefined);
    const view = mount(ExportMenu);
    let tree = view(menuProps(() => Promise.reject(CHUNK_ERROR)));
    (decisionItem(tree, "csv").props.onClick as () => void)();
    await settle(); await settle();
    expect(unhandled).toEqual([]);
    const sync = vi.fn();
    tree = view(menuProps(sync));
    (decisionItem(tree, "csv").props.onClick as () => void)();
    expect(sync).toHaveBeenCalledWith("csv");
  });
});
