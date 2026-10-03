import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceBackupSource } from "../src/application/workspace-backup";
import { WorkspaceStorage } from "../src/components/workspace-storage";
import { fill, labels } from "../src/i18n";

/*
 * R6-6 儲存選單的自動保存與首次同意對話框（沒有 DOM 套件）：
 * hooks.active 時接管 useState／useRef／useId／useEffect（effect 依 deps 在每次 render 後執行，卸載時跑 cleanup），
 * 直接呼叫元件函式取得元素樹，再呼叫樹上的 onClick／onChange；其餘時間交給真正的 React（SSR 測試）。
 * IndexedDB 與備份序列化以 mock 取代：這裡驗證的是「何時存、存哪一版、畫面顯示什麼」，寫入與驗證本身由 auto-save.test.ts 與既有測試負責。
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
const store = vi.hoisted(() => ({
  save: vi.fn(async (text: string) => { void text; }),
  savedAt: vi.fn(async (): Promise<string | null> => null),
  remove: vi.fn(async () => undefined),
  load: vi.fn(async (): Promise<string | null> => null),
}));
vi.mock("@/application/local-store", () => ({ saveLocalWorkspace: store.save, localWorkspaceSavedAt: store.savedAt, deleteLocalWorkspace: store.remove, loadLocalWorkspace: store.load }));
const backup = vi.hoisted(() => ({ exported: [] as unknown[] }));
vi.mock("@/application/workspace-backup", async importOriginal => ({
  ...(await importOriginal<typeof import("@/application/workspace-backup")>()),
  exportWorkspaceBackup: vi.fn(async (source: { tag: string }) => { backup.exported.push(source); return `backup:${source.tag}`; }),
}));

type TreeElement = ReactElement<Record<string, unknown>>;
type Props = Parameters<typeof WorkspaceStorage>[0];
function mount(component: (props: Props) => ReactNode) {
  hooks.active = true; hooks.slots = [];
  const slots = hooks.slots;
  return {
    render(props: Props): ReactNode {
      hooks.active = true;
      let tree: ReactNode, rounds = 0;
      do { hooks.dirty = false; hooks.cursor = 0; hooks.effects = []; tree = component(props); } while (hooks.dirty && ++rounds < 10);
      const effects = hooks.effects; hooks.effects = [];
      for (const run of effects) run();
      return tree;
    },
    unmount() { for (const slot of slots) if (slot && typeof slot === "object" && (slot as EffectSlot).kind === "effect" && typeof (slot as EffectSlot).cleanup === "function") ((slot as EffectSlot).cleanup as () => void)(); },
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
const textOf = (node: ReactNode): string => Array.isArray(node) ? node.map(textOf).join("") : typeof node === "string" || typeof node === "number" ? String(node) : node !== null && typeof node === "object" && "props" in node ? textOf((node as TreeElement).props.children as ReactNode) : "";
const byTestId = (tree: ReactNode, testid: string) => findAll(tree, element => element.props["data-testid"] === testid)[0];
const button = (tree: ReactNode, text: string) => {
  const found = findAll(tree, element => element.type === "button" && textOf(element.props.children as ReactNode) === text);
  expect(found, text).toHaveLength(1);
  return found[0];
};
const click = (element: TreeElement) => (element.props.onClick as () => void)();
const summaryTag = (tree: ReactNode) => textOf(findAll(tree, element => element.type === "summary")[0].props.children as ReactNode);

const auto = labels.autoSave;
const AT = new Date("2026-10-03T06:32:00.000Z");
const source = (tag: string) => ({ tag }) as unknown as WorkspaceBackupSource;

/** 模擬 Dashboard：version 每次變更 +1；onSaved 只在存的是最新版時記為已保存（與 dashboard.tsx 相同）。 */
function host(options: { source?: WorkspaceBackupSource | null; consent?: boolean } = {}) {
  const state = { source: options.source === undefined ? source("v1") : options.source, consent: options.consent ?? false, version: 1, savedVersion: 0 };
  const onSaved = vi.fn((saved: number) => { if (saved === state.version) state.savedVersion = saved; });
  const onConsentChange = vi.fn((value: boolean) => { state.consent = value; });
  const onDeleted = vi.fn(() => { if (state.source) state.version++; });
  const view = mount(WorkspaceStorage);
  const render = () => view.render({ source: state.source, version: state.version, dirty: state.source !== null && state.version !== state.savedVersion, consent: state.consent, onConsentChange, onSaved, onDeleted, onRestore: vi.fn() });
  return { state, render, onSaved, onConsentChange, onDeleted, unmount: view.unmount, change() { state.version++; state.source = source(`v${state.version}`); return render(); } };
}
const settle = () => vi.advanceTimersByTimeAsync(0);
let mounted: { unmount: () => void }[] = [];
function track<T extends { unmount: () => void }>(view: T): T { mounted.push(view); return view; }

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT);
  store.save.mockReset().mockImplementation(async () => undefined);
  store.savedAt.mockReset().mockImplementation(async () => null);
  store.remove.mockReset().mockImplementation(async () => undefined);
  backup.exported = [];
});
afterEach(async () => {
  for (const view of mounted) view.unmount();
  mounted = [];
  await vi.runOnlyPendingTimersAsync();
  vi.useRealTimers();
  hooks.active = false; hooks.slots = [];
});

describe("R6-6 首次同意對話框（D7＝A：問一次，同意後自動保存）", () => {
  it("有資料且未同意時顯示非 modal 對話框：標題、說明、共用電腦提醒、兩個按鈕，不自動 focus", () => {
    const view = track(host());
    const tree = view.render();
    const prompt = byTestId(tree, "local-save-prompt");
    expect(prompt).toBeDefined();
    expect(prompt.type).toBe("section");
    expect(prompt.props.role).toBe("dialog");
    expect(prompt.props["aria-modal"]).toBeUndefined();
    const heading = findAll(prompt, element => element.type === "h2")[0];
    expect(heading.props.id).toBe(prompt.props["aria-labelledby"]);
    expect(textOf(heading.props.children as ReactNode)).toBe(auto.promptTitle);
    const body = findAll(prompt, element => element.props.id === prompt.props["aria-describedby"])[0];
    expect(textOf(body.props.children as ReactNode)).toBe(auto.promptBody);
    expect(textOf(prompt)).toContain(labels.ui.workspaceStorage.caution);
    for (const text of [auto.accept, auto.decline]) expect(button(prompt, text).props.autoFocus).toBeUndefined();
    // 對話框在 <details> 之外：儲存選單收合時仍看得到。
    const details = findAll(tree, element => element.type === "details")[0];
    expect(findAll(details, element => element.props["data-testid"] === "local-save-prompt")).toEqual([]);
  });

  it("沒有資料時不問；資料載入後才問", () => {
    const view = track(host({ source: null }));
    expect(byTestId(view.render(), "local-save-prompt")).toBeUndefined();
    view.state.source = source("v1");
    expect(byTestId(view.render(), "local-save-prompt")).toBeDefined();
  });

  it("「先不要」：關閉、維持手動、不保存，之後的變更也不再問", async () => {
    const view = track(host());
    click(button(view.render(), auto.decline));
    let tree = view.render();
    expect(byTestId(tree, "local-save-prompt")).toBeUndefined();
    expect(view.onConsentChange).not.toHaveBeenCalled();
    tree = view.change();
    await vi.advanceTimersByTimeAsync(10_000);
    tree = view.render();
    expect(store.save).not.toHaveBeenCalled();
    expect(byTestId(tree, "local-save-prompt")).toBeUndefined();
    expect(summaryTag(tree)).toContain(labels.status.unsaved);
    expect(textOf(byTestId(tree, "autosave-status"))).toBe(auto.statusOff);
  });

  it("在對話框按 Escape 等同「先不要」", () => {
    const view = track(host());
    const prompt = byTestId(view.render(), "local-save-prompt");
    (prompt.props.onKeyDown as (event: { key: string }) => void)({ key: "Tab" });
    expect(byTestId(view.render(), "local-save-prompt")).toBeDefined();
    (prompt.props.onKeyDown as (event: { key: string }) => void)({ key: "Escape" });
    expect(byTestId(view.render(), "local-save-prompt")).toBeUndefined();
    expect(view.onConsentChange).not.toHaveBeenCalled();
  });

  it("用按鈕關閉時，焦點原本在對話框內就移到「儲存」選單；焦點在別處則不動", () => {
    const view = track(host());
    const tree = view.render();
    const prompt = byTestId(tree, "local-save-prompt");
    const summary = findAll(tree, element => element.type === "summary")[0];
    const inside = { id: "inside" };
    const focus = vi.fn();
    (prompt.props.ref as { current: unknown }).current = { contains: (node: unknown) => node === inside };
    (summary.props.ref as { current: unknown }).current = { focus };
    vi.stubGlobal("document", { activeElement: { id: "elsewhere" } });
    try {
      click(button(prompt, auto.decline));
      expect(focus).not.toHaveBeenCalled();
      const other = track(host());
      const otherTree = other.render();
      const otherPrompt = byTestId(otherTree, "local-save-prompt");
      (otherPrompt.props.ref as { current: unknown }).current = { contains: (node: unknown) => node === inside };
      (findAll(otherTree, element => element.type === "summary")[0].props.ref as { current: unknown }).current = { focus };
      vi.stubGlobal("document", { activeElement: inside });
      click(button(otherPrompt, auto.decline));
      expect(focus).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); }
  });

  it("「存在這台電腦」：同意、立即保存一次、關閉；頂欄顯示「已保存 14:32」", async () => {
    const view = track(host());
    // 按鈕文字與儲存選單內的手動按鈕相同（兩者都是「存在這台電腦」），以對話框為範圍查找。
    click(button(byTestId(view.render(), "local-save-prompt"), auto.accept));
    expect(view.onConsentChange).toHaveBeenCalledWith(true);
    await settle();
    expect(store.save.mock.calls).toEqual([["backup:v1"]]);
    expect(view.onSaved).toHaveBeenCalledWith(1);
    const tree = view.render();
    expect(byTestId(tree, "local-save-prompt")).toBeUndefined();
    expect(summaryTag(tree)).toContain(fill(labels.status.savedAt, { time: "14:32" }));
    expect(textOf(byTestId(tree, "autosave-status"))).toBe(`${auto.statusOn} · ${fill(auto.lastSaved, { time: "14:32" })}`);
    // 立即保存後不會在 2 秒後再存同一版。
    await vi.advanceTimersByTimeAsync(10_000);
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it("這台電腦已有保存的工作區：提醒同意會改存成目前的（臺北時間）；讀不到時不提醒也不出錯", async () => {
    store.savedAt.mockResolvedValueOnce("2026-10-01T06:32:00.000Z");
    const view = track(host());
    view.render();
    await settle();
    const warning = byTestId(view.render(), "local-save-replace-warning");
    expect(textOf(warning)).toBe(fill(auto.replaceWarning, { time: "2026-10-01 14:32" }));

    store.savedAt.mockRejectedValueOnce(new Error("LOCAL_STORAGE_UNAVAILABLE"));
    const other = track(host());
    other.render();
    await settle();
    const tree = other.render();
    expect(byTestId(tree, "local-save-prompt")).toBeDefined();
    expect(byTestId(tree, "local-save-replace-warning")).toBeUndefined();
  });
});

describe("R6-6 自動保存（同意後每次變更 2 秒內）", () => {
  it("已同意：變更後 1999 ms 不存、2000 ms 存最新版本；連續變更只存最後一版", async () => {
    const view = track(host({ consent: true }));
    let tree = view.render();
    expect(byTestId(tree, "local-save-prompt")).toBeUndefined();
    expect(textOf(byTestId(tree, "autosave-status"))).toBe(auto.statusOn);
    await vi.advanceTimersByTimeAsync(1000);
    view.change();
    await vi.advanceTimersByTimeAsync(1000);
    view.change();
    await vi.advanceTimersByTimeAsync(1999);
    expect(store.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(store.save.mock.calls).toEqual([["backup:v3"]]);
    expect(view.onSaved).toHaveBeenCalledWith(3);
    tree = view.render();
    expect(summaryTag(tree)).toContain(fill(labels.status.savedAt, { time: "14:32" }));
    expect(summaryTag(tree)).not.toContain(labels.status.unsaved);
  });

  it("每次自動保存都經過 exportWorkspaceBackup（重新序列化目前的工作區）", async () => {
    const view = track(host({ consent: true }));
    view.render();
    await vi.advanceTimersByTimeAsync(2000);
    view.change();
    await vi.advanceTimersByTimeAsync(2000);
    expect(backup.exported.map(item => (item as { tag: string }).tag)).toEqual(["v1", "v2"]);
    expect(store.save.mock.calls).toEqual([["backup:v1"], ["backup:v2"]]);
  });

  it("沒有變更（已保存）時不排程", async () => {
    const view = track(host({ consent: true }));
    view.state.savedVersion = 1;
    const tree = view.render();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(store.save).not.toHaveBeenCalled();
    expect(summaryTag(tree)).toContain(labels.status.savedVersion);
  });

  it("失敗：role=alert 顯示說明、不重試；下次變更再試，成功後警示消失", async () => {
    store.save.mockRejectedValueOnce(new Error("QUOTA_EXCEEDED"));
    const view = track(host({ consent: true }));
    view.render();
    await vi.advanceTimersByTimeAsync(2000);
    let tree = view.render();
    const alert = byTestId(tree, "autosave-error");
    expect(alert).toBeDefined();
    const message = findAll(alert, element => element.props.role === "alert")[0];
    expect(textOf(message)).toBe(auto.failed);
    expect(summaryTag(tree)).toContain(labels.status.unsaved);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(store.save).toHaveBeenCalledTimes(1);
    view.change();
    await vi.advanceTimersByTimeAsync(2000);
    expect(store.save).toHaveBeenCalledTimes(2);
    tree = view.render();
    expect(byTestId(tree, "autosave-error")).toBeUndefined();
  });

  it("失敗警示可以按「知道了」關閉", async () => {
    store.save.mockRejectedValueOnce(new Error("DENIED"));
    const view = track(host({ consent: true }));
    view.render();
    await vi.advanceTimersByTimeAsync(2000);
    click(button(byTestId(view.render(), "autosave-error"), auto.dismiss));
    expect(byTestId(view.render(), "autosave-error")).toBeUndefined();
  });

  it("取消勾選同意會停止排程；勾選框下方說明勾選後會自動保存", async () => {
    const view = track(host({ consent: true }));
    const tree = view.render();
    expect(findAll(tree, element => element.type === "p" && textOf(element) === auto.consentNote)).toHaveLength(1);
    const checkbox = findAll(tree, element => element.type === "input" && element.props.type === "checkbox")[0];
    await vi.advanceTimersByTimeAsync(1000);
    (checkbox.props.onChange as (event: unknown) => void)({ target: { checked: false } });
    expect(view.onConsentChange).toHaveBeenCalledWith(false);
    const after = view.render();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(store.save).not.toHaveBeenCalled();
    // 手動取消後不會再跳出首次同意對話框。
    expect(byTestId(after, "local-save-prompt")).toBeUndefined();
    expect(textOf(byTestId(after, "autosave-status"))).toBe(auto.statusOff);
  });

  it("卸載（例如清空工作區重掛）會取消排程", async () => {
    const view = host({ consent: true });
    view.render();
    await vi.advanceTimersByTimeAsync(1000);
    view.unmount();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(store.save).not.toHaveBeenCalled();
  });

  it("資料清空（source 變成 null）時取消排程", async () => {
    const view = track(host({ consent: true }));
    view.render();
    await vi.advanceTimersByTimeAsync(1000);
    view.state.source = null;
    view.render();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(store.save).not.toHaveBeenCalled();
  });

  it("刪除本機資料：停止自動保存，並等進行中的寫入完成後才刪除（不會被寫回）", async () => {
    let finish: () => void = () => undefined;
    store.save.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const view = track(host({ consent: true }));
    view.render();
    await vi.advanceTimersByTimeAsync(2000);
    expect(store.save).toHaveBeenCalledTimes(1);
    view.change();
    click(button(view.render(), labels.buttons.deleteLocal));
    expect(view.onConsentChange).toHaveBeenCalledWith(false);
    await settle();
    expect(store.remove).not.toHaveBeenCalled();
    finish();
    await settle();
    expect(store.remove).toHaveBeenCalledTimes(1);
    expect(store.save.mock.invocationCallOrder[0]).toBeLessThan(store.remove.mock.invocationCallOrder[0]);
    const tree = view.render();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(store.save).toHaveBeenCalledTimes(1);
    expect(byTestId(tree, "local-save-prompt")).toBeUndefined();
    expect(textOf(byTestId(tree, "storage-notice"))).toBe(labels.ui.workspaceStorage.deletedNotice);
  });

  it("手動「存在這台電腦」仍可立即保存：顯示新的提示句並更新保存時間", async () => {
    const view = track(host({ consent: true }));
    const details = findAll(view.render(), element => element.type === "details")[0];
    click(button(details, labels.buttons.saveLocal));
    await settle();
    expect(store.save.mock.calls).toEqual([["backup:v1"]]);
    const tree = view.render();
    expect(textOf(byTestId(tree, "storage-notice"))).toBe(auto.savedLocalNotice);
    expect(summaryTag(tree)).toContain(fill(labels.status.savedAt, { time: "14:32" }));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(store.save).toHaveBeenCalledTimes(1);
  });
});

describe("R6-6 SSR：既有 testid 與同意文案保留", () => {
  beforeEach(() => { hooks.active = false; });
  const base = { version: 1, dirty: true, onRestore: () => undefined, onSaved: () => undefined, onDeleted: () => undefined, onConsentChange: () => undefined };

  it("沒有資料：不出現對話框，保留 workspace-storage、同意勾選文字與自動保存狀態", () => {
    const html = renderToStaticMarkup(createElement(WorkspaceStorage, { ...base, source: null, dirty: false, consent: false }));
    expect(html).toContain('data-testid="workspace-storage"');
    expect(html).toContain(labels.ui.workspaceStorage.consent);
    expect(html).toContain(auto.consentNote);
    expect(html).toContain('data-testid="autosave-status"');
    expect(html).toContain(auto.statusOff);
    expect(html).toContain(labels.status.noWorkspace);
    expect(html).not.toContain("local-save-prompt");
    expect(html).not.toContain('role="alert"');
  });

  it("有資料且未同意：對話框在 </details> 之後、aria 指向標題與說明、沒有 autofocus", () => {
    const html = renderToStaticMarkup(createElement(WorkspaceStorage, { ...base, source: source("v1"), consent: false }));
    expect(html.indexOf('data-testid="local-save-prompt"')).toBeGreaterThan(html.indexOf("</details>"));
    const labelledBy = /role="dialog" aria-labelledby="([^"]+)" aria-describedby="([^"]+)"/.exec(html);
    expect(labelledBy).not.toBeNull();
    expect(html).toContain(`<h2 id="${labelledBy![1]}">${auto.promptTitle}</h2>`);
    expect(html).toContain(`<p id="${labelledBy![2]}">${auto.promptBody}</p>`);
    expect(html).not.toMatch(/autofocus/i);
    expect(html).toContain(labels.status.unsaved);
  });

  it("已同意：不出現對話框，狀態顯示已開啟自動保存", () => {
    const html = renderToStaticMarkup(createElement(WorkspaceStorage, { ...base, source: source("v1"), consent: true }));
    expect(html).not.toContain("local-save-prompt");
    expect(html).toContain(auto.statusOn);
  });
});
