import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseCss, splitSelectors } from "../scripts/lib/ui-scan.mjs";
import { fixture } from "./helpers/fixtures";
import { validateDataset } from "@/domain/validation";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import { createReviewSession } from "@/application/review-session";
import { channelsLabel, demoAlias } from "@/application/copy";
import { fill, labels } from "@/i18n";
import { PageHeader } from "@/components/shell/page-chrome";
import { periodSummary } from "@/components/shell/period-bar";
import { presentEscapeExits, presentPeriodText, usePresentMode } from "@/components/shell/present-mode";

/*
 * V3-9b C（F22 投影模式，PRD §9.7、§10.1 F22、D-V3-23＝A）。
 * 1. usePresentMode：沒有 DOM 套件，用最小 hooks 執行環境（同 tests/scenario-form.test.tsx 的做法，另外接管 useCallback／useRef，
 *    並在每次 render 後依 deps 執行 useEffect 與 cleanup）＋假的 document（documentElement.dataset、keydown 監聽、activeElement、querySelector）。
 * 2. presentEscapeExits：Esc 只在沒有浮層開著時離開投影（M3）。
 * 3. presentPeriodText：投影中頁首的一行期間文字（期間列的期間摘要＋通路；會議頁用會議固定的範圍）。
 * 4. PageHeader（SSR）：present-period 只在傳入時出現（投影中），按鈕在 .page-present。
 * 5. globals.css 的 C 區段：token 重新對應、隱藏側欄與期間列、最大寬 1280px、只顯示 L1、只在 @media screen、不新增字級原值、沒有動畫。
 */

const hooks = vi.hoisted(() => ({
  active: false, cursor: 0, refCursor: 0, effectCursor: 0, dirty: false,
  states: [] as unknown[], refs: [] as { current: unknown }[],
  effects: [] as { deps?: readonly unknown[]; cleanup?: void | (() => void) }[],
  pending: [] as { index: number; effect: () => void | (() => void); deps?: readonly unknown[] }[],
}));
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
    useCallback: (callback: unknown, deps: readonly unknown[]) => hooks.active ? callback : actual.useCallback(callback as () => void, deps),
    useRef: (initial: unknown) => {
      if (!hooks.active) return actual.useRef(initial);
      const index = hooks.refCursor++;
      if (!(index in hooks.refs)) hooks.refs[index] = { current: initial };
      return hooks.refs[index];
    },
    useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => {
      if (!hooks.active) return actual.useEffect(effect, deps);
      hooks.pending.push({ index: hooks.effectCursor++, effect, deps });
    },
  };
});

type Hook = ReturnType<typeof usePresentMode>;
/** 測試環境直接呼叫 hook 函式（同 scenario-form 直接呼叫元件函式）；用別名呼叫，hooks 的呼叫順序由 mountHook 每次歸零的游標保證。 */
const presentHook: typeof usePresentMode = usePresentMode;
/** 掛上 hook：render(enabled) 會重跑到狀態穩定（render 期間的 setState 立刻重跑），再依 deps 執行 effect（先 cleanup 舊的）。 */
function mountHook() {
  hooks.active = true; hooks.states = []; hooks.refs = []; hooks.effects = [];
  let last: Hook | null = null;
  const render = (enabled: boolean): Hook => {
    let rounds = 0;
    do { hooks.dirty = false; hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0; hooks.pending = []; last = presentHook(enabled); } while (hooks.dirty && ++rounds < 10);
    for (const { index, effect, deps } of hooks.pending) {
      const previous = hooks.effects[index];
      const changed = !previous || !deps || !previous.deps || deps.length !== previous.deps.length || deps.some((dep, at) => !Object.is(dep, previous.deps![at]));
      if (!changed) continue;
      if (typeof previous?.cleanup === "function") previous.cleanup();
      hooks.effects[index] = { deps, cleanup: effect() };
    }
    return last!;
  };
  const unmount = () => { for (const entry of hooks.effects) if (typeof entry?.cleanup === "function") entry.cleanup(); hooks.effects = []; };
  return { render, unmount };
}

type Listener = (event: KeyboardEvent) => void;
/** 假的 document：只提供 hook 用到的部分。overlay＝true 時 querySelector 找得到開著的浮層。 */
function fakeDocument() {
  const listeners = new Set<Listener>();
  const doc = {
    documentElement: { dataset: {} as Record<string, string | undefined> },
    activeElement: null as unknown,
    overlay: false,
    selectors: [] as string[],
    querySelector(selector: string) { doc.selectors.push(selector); return doc.overlay ? {} : null; },
    addEventListener(type: string, listener: Listener) { if (type === "keydown") listeners.add(listener); },
    removeEventListener(type: string, listener: Listener) { if (type === "keydown") listeners.delete(listener); },
    listenerCount: () => listeners.size,
    key(key: string, init: { target?: unknown; defaultPrevented?: boolean } = {}) {
      const event = { key, target: init.target ?? null, defaultPrevented: init.defaultPrevented ?? false } as unknown as KeyboardEvent;
      for (const listener of [...listeners]) listener(event);
    },
  };
  return doc;
}
const button = (name: string) => ({ name, focus: vi.fn(), isConnected: true });
const globals = globalThis as unknown as { document?: unknown };

afterEach(() => { hooks.active = false; hooks.states = []; hooks.refs = []; hooks.effects = []; delete globals.document; });

describe("usePresentMode（F22：進入、離開、Esc、回焦、自動退出）", () => {
  it("不可用的頁面（enabled=false）一律不是投影中：按了進入也不設 data-mode、不掛 Esc 監聽", () => {
    const doc = fakeDocument(); globals.document = doc;
    const { render } = mountHook();
    let hook = render(false);
    expect(hook.active).toBe(false);
    hook.enter({ currentTarget: button("toggle") });
    hook = render(false);
    expect(hook.active).toBe(false);
    expect(doc.documentElement.dataset.mode).toBeUndefined();
    expect(doc.listenerCount()).toBe(0);
  });

  it("按鈕進入：<html data-mode=\"present\">＋一個 keydown 監聽；按鈕離開：屬性與監聽都移除，焦點回到按鈕", () => {
    const doc = fakeDocument(); globals.document = doc;
    const toggle = button("toggle");
    const { render } = mountHook();
    let hook = render(true);
    expect(hook.active).toBe(false);
    expect(doc.documentElement.dataset.mode).toBeUndefined();
    hook.enter({ currentTarget: toggle });
    hook = render(true);
    expect(hook.active).toBe(true);
    expect(doc.documentElement.dataset.mode).toBe("present");
    expect(doc.listenerCount()).toBe(1);
    hook.exit();
    hook = render(true);
    expect(hook.active).toBe(false);
    expect(doc.documentElement.dataset.mode).toBeUndefined();
    expect(doc.listenerCount()).toBe(0);
    expect(toggle.focus).toHaveBeenCalledTimes(1);
  });

  it("Esc 離開並回焦到進入時的按鈕；其他鍵、已被處理的 Esc、浮層開著或焦點在對話框裡的 Esc 都不離開", () => {
    const doc = fakeDocument(); globals.document = doc;
    const toggle = button("toggle");
    const { render } = mountHook();
    let hook = render(true);
    hook.enter({ currentTarget: toggle });
    hook = render(true);
    doc.key("Enter");
    doc.key("Escape", { defaultPrevented: true });
    doc.key("Escape", { target: { closest: (selector: string) => selector.includes("dialog") ? {} : null } });
    doc.overlay = true;
    doc.key("Escape");
    hook = render(true);
    expect(hook.active).toBe(true);
    expect(toggle.focus).not.toHaveBeenCalled();
    doc.overlay = false;
    doc.key("Escape");
    hook = render(true);
    expect(hook.active).toBe(false);
    expect(doc.documentElement.dataset.mode).toBeUndefined();
    expect(toggle.focus).toHaveBeenCalledTimes(1);
  });

  it("沒有 currentTarget（例如鍵盤捷徑呼叫）時記住目前焦點；離開時元素已不在頁面上就不搬焦點", () => {
    const doc = fakeDocument(); globals.document = doc;
    const focused = button("focused");
    doc.activeElement = focused;
    const { render } = mountHook();
    let hook = render(true);
    hook.enter();
    hook = render(true);
    hook.exit();
    expect(focused.focus).toHaveBeenCalledTimes(1);
    const gone = { focus: vi.fn(), isConnected: false };
    hook = render(true);
    hook.enter({ currentTarget: gone });
    hook = render(true);
    doc.key("Escape");
    expect(gone.focus).not.toHaveBeenCalled();
  });

  it("切到其他頁（enabled 變 false）自動退出、不搬焦點；回到總覽或會議頁不會自己又進入投影", () => {
    const doc = fakeDocument(); globals.document = doc;
    const toggle = button("toggle");
    const { render } = mountHook();
    let hook = render(true);
    hook.enter({ currentTarget: toggle });
    hook = render(true);
    expect(doc.documentElement.dataset.mode).toBe("present");
    hook = render(false);
    expect(hook.active).toBe(false);
    expect(doc.documentElement.dataset.mode).toBeUndefined();
    expect(doc.listenerCount()).toBe(0);
    hook = render(true);
    expect(hook.active).toBe(false);
    expect(doc.documentElement.dataset.mode).toBeUndefined();
    expect(toggle.focus).not.toHaveBeenCalled();
  });

  it("卸載時移除屬性與監聽", () => {
    const doc = fakeDocument(); globals.document = doc;
    const { render, unmount } = mountHook();
    const hook = render(true);
    hook.enter({ currentTarget: button("toggle") });
    render(true);
    expect(doc.documentElement.dataset.mode).toBe("present");
    unmount();
    expect(doc.documentElement.dataset.mode).toBeUndefined();
    expect(doc.listenerCount()).toBe(0);
  });
});

describe("presentEscapeExits（§9.7 Esc 離開；M3 浮層先收 Esc）", () => {
  const root = (open: boolean) => { const selectors: string[] = []; return { selectors, querySelector: (selector: string) => { selectors.push(selector); return open ? ({} as Element) : null; } }; };
  const key = (value: string, extra: { defaultPrevented?: boolean; target?: unknown } = {}) => ({ key: value, defaultPrevented: extra.defaultPrevented ?? false, target: (extra.target ?? null) as EventTarget | null });

  it("只有沒被處理的 Esc、焦點不在對話框、沒有開著的浮層時才離開", () => {
    expect(presentEscapeExits(key("Escape"), root(false))).toBe(true);
    expect(presentEscapeExits(key("Esc"), root(false))).toBe(false);
    expect(presentEscapeExits(key("Enter"), root(false))).toBe(false);
    expect(presentEscapeExits(key("Escape", { defaultPrevented: true }), root(false))).toBe(false);
    expect(presentEscapeExits(key("Escape", { target: { closest: () => ({}) } }), root(false))).toBe(false);
    expect(presentEscapeExits(key("Escape", { target: { closest: () => null } }), root(false))).toBe(true);
    expect(presentEscapeExits(key("Escape"), root(true))).toBe(false);
  });

  it("檢查的浮層涵蓋抽屜與對話框、頂欄與頁內下拉、調整門檻、aria-expanded 的 popover；關著的 data-status popover（hidden）不算", () => {
    const probe = root(false);
    presentEscapeExits(key("Escape"), probe);
    const [selector] = probe.selectors;
    for (const part of ["dialog[open]", "[role=\"dialog\"]:not([hidden])", "details.topbar-menu[open]", "details.threshold-popover[open]", "[aria-expanded=\"true\"]"]) expect(selector).toContain(part);
  });
});

describe("presentPeriodText（投影中頁首的一行期間文字）", () => {
  async function load(name: string): Promise<{ snapshot: WorkspaceSnapshot; channels: string[] }> {
    const input = fixture(name);
    const dataset = validateDataset(input).dataset!;
    return { snapshot: await createSnapshot(dataset, {}, await hashInput(input)), channels: dataset.manifest.channels };
  }

  it("總覽：期間列的期間摘要（本期與上期、天數）＋全部通路", async () => {
    const { snapshot, channels } = await load("golden");
    const { report } = snapshot;
    const summary = periodSummary({ previous: report.previous.period, current: report.current.period, previousDays: report.comparison.previous_days, currentDays: report.comparison.current_days, comparisonMode: report.comparison.mode, channelsText: "", dataAsOf: snapshot.data_as_of }).text;
    const text = presentPeriodText(snapshot, null, channels);
    expect(text).toBe(fill(labels.shell.presentV3.period, { period: summary, channels: labels.shell.periodBar.filter.allChannels }));
  });

  it("會議紀錄：用會議固定的範圍（期間與通路），不用目前檢視", async () => {
    const { snapshot, channels } = await load("golden");
    const review = createReviewSession({ input: fixture("golden"), dataset: validateDataset(fixture("golden")).dataset!, snapshot, revision: 1 }, "e", "rev-present");
    const meeting = { ...review, meeting_filters: { ...review.meeting_filters, channels: [channels[0]], previous_period: { start: "2026-01-01", end: "2026-01-07" }, current_period: { start: "2026-01-08", end: "2026-01-14" } } };
    const text = presentPeriodText(snapshot, meeting, channels);
    const summary = periodSummary({ previous: meeting.meeting_filters.previous_period, current: meeting.meeting_filters.current_period, previousDays: 7, currentDays: 7, comparisonMode: meeting.meeting_filters.comparison_mode, channelsText: "", dataAsOf: review.data_as_of }).text;
    expect(text).toBe(fill(labels.shell.presentV3.period, { period: summary, channels: channelsLabel([channels[0]], demoAlias(snapshot.report.dataset_id)) }));
    expect(text).not.toBe(presentPeriodText(snapshot, null, channels));
  });
});

describe("PageHeader（SSR）：投影模式按鈕與一行期間文字", () => {
  const noop = () => undefined;
  const toggle = createElement("button", { type: "button", "data-testid": "present-toggle", "aria-pressed": false }, labels.shell.presentV3.enter);
  const base = { title: labels.nav.overview.label, description: labels.nav.overview.description, isData: false, showLoadDemo: true, onLoadDemo: noop, onImport: noop };

  it("不在投影中：按鈕在 .page-present、本頁動作之前；沒有 present-period", () => {
    const html = renderToStaticMarkup(createElement(PageHeader, { ...base, presentToggle: toggle }));
    expect(html).toContain('<div class="page-present"><button type="button" data-testid="present-toggle" aria-pressed="false">');
    expect(html.indexOf('class="page-present"')).toBeLessThan(html.indexOf('data-testid="page-actions"'));
    expect(html).not.toContain("present-period");
  });

  it("投影中：h1 與描述之後多一行 p.present-period（data-testid present-period），在頁首文字區內", () => {
    const period = fill(labels.shell.presentV3.period, { period: "x", channels: labels.shell.periodBar.filter.allChannels });
    const html = renderToStaticMarkup(createElement(PageHeader, { ...base, presentToggle: toggle, presentPeriod: period }));
    const text = html.slice(html.indexOf('class="page-heading-text"'), html.indexOf('data-testid="page-title-addon"'));
    expect(text).toContain(`<p class="present-period" data-testid="present-period">${period}</p>`);
    expect(text.indexOf("<h1>")).toBeLessThan(text.indexOf("present-period"));
    expect(text.indexOf('class="subtitle"')).toBeLessThan(text.indexOf("present-period"));
  });

  it("沒有傳按鈕的頁面（總覽與會議頁以外）沒有 .page-present", () => {
    expect(renderToStaticMarkup(createElement(PageHeader, base))).not.toContain("page-present");
  });
});

describe("globals.css 的 C 區段（:root[data-mode=\"present\"]）", () => {
  const css = readFileSync(resolve("src/app/globals.css"), "utf8");
  const start = css.indexOf("/* ── V3-9b 錨點（代理 C");
  const end = css.indexOf("/* ── V3-9b 錨點結束 ── */");
  const section = css.slice(start, end);
  const rules = parseCss(section);
  const present = rules.filter(rule => rule.selector.includes('[data-mode="present"]'));
  const decl = (selector: string, prop: string) => rules.find(rule => rule.selector === selector)?.declarations.find(item => item.prop === prop)?.value;
  const hidden = present.filter(rule => rule.declarations.some(item => item.prop === "display" && item.value === "none")).flatMap(rule => splitSelectors(rule.selector));

  it("投影規則只寫在 C 區段，而且只在 @media screen 內（列印不受影響）", () => {
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    expect(css.slice(0, start).includes("data-mode")).toBe(false);
    expect(css.slice(end).includes("data-mode")).toBe(false);
    expect(present.length).toBeGreaterThan(5);
    for (const rule of present) {
      expect(rule.context.some(prelude => /^@media screen\b/.test(prelude)), rule.selector).toBe(true);
      expect(rule.context.some(prelude => /\bprint\b/.test(prelude)), rule.selector).toBe(false);
    }
  });

  it("token 重新對應（§9.7）：--text-14 → 16px、--text-16 → 20px、--num-28 → 40px、--num-32 → 48px；內容最大寬 1280px", () => {
    const root = ':root[data-mode="present"]';
    expect(decl(root, "--text-14")).toBe("16px");
    expect(decl(root, "--text-16")).toBe("20px");
    expect(decl(root, "--num-28")).toBe("40px");
    expect(decl(root, "--num-32")).toBe("48px");
    expect(decl(root, "--content-max")).toBe("1280px");
    expect(decl(':root[data-mode="present"] .app-shell main', "margin")).toBe("0 auto");
    expect(decl(':root[data-mode="present"] .app-shell', "grid-template-columns")).toBe("minmax(0, 1fr)");
  });

  it("不新增字級原值：C 區段的 font-size 一律引用既有的 --text-* token，投影規則不寫 font-size；沒有動畫與 transition", () => {
    const sizes = rules.flatMap(rule => rule.declarations.filter(item => item.prop === "font-size").map(item => item.value));
    for (const size of sizes) expect(size).toMatch(/^var\(--text-(12|13|14|16|20|24|28)\)$/);
    expect(present.flatMap(rule => rule.declarations.filter(item => item.prop === "font-size"))).toEqual([]);
    expect(section).not.toMatch(/\b(transition|animation)\s*:/);
  });

  it("投影中隱藏側欄、期間列與手機底部分頁列；總覽只留 L1（本期一句話、KPI 帶、三件事、利潤結構瀑布圖）", () => {
    for (const selector of [':root[data-mode="present"] .app-shell > .sidebar', ':root[data-mode="present"] .period-bar', ':root[data-mode="present"] .mobile-tabbar']) expect(hidden).toContain(selector);
    expect(hidden).toContain(':root[data-mode="present"] .view-content > :not(.snapshot, .kpi-section, .top-three, .profit-section, .meeting-page)');
    // 三件事每列只留標題與影響金額。
    for (const part of [".alert-body", ".alert-actions", ".alert-explain", ".alert-chev"]) expect(hidden).toContain(`:root[data-mode="present"] ${part}`);
  });

  it("會議紀錄：目錄、範圍行、議程 3–6、備註、比較與歷史隱藏；頁首動作列只留決議", () => {
    for (const part of [".meeting-toc", ".meeting-info", ".meeting-agenda-list > .meeting-agenda-entry:nth-child(n+3)", ".meeting-notes-block", ".meeting-compare", ".meeting-history", ".meeting-head-field", ".meeting-head-actions > :not(.meeting-decision)"]) expect(hidden).toContain(`:root[data-mode="present"] ${part}`);
  });

  it("按鈕在手機（≤ 767px）不顯示，投影中才顯示（讓使用者能離開）", () => {
    const mobile = rules.filter(rule => rule.context.some(prelude => prelude.includes("max-width: 767px")));
    expect(mobile.some(rule => rule.selector === ".page-present" && rule.declarations.some(item => item.prop === "display" && item.value === "none"))).toBe(true);
    expect(mobile.some(rule => rule.selector === ':root[data-mode="present"] .page-present' && rule.declarations.some(item => item.prop === "display" && item.value === "flex"))).toBe(true);
  });
});
