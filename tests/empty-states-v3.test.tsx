import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixture } from "./helpers/fixtures";
import { validateDataset } from "@/domain/validation";
import { createSnapshot, hashInput } from "@/application/workspace";
import { createDecisionSession, emptyDecisionWorkspace } from "@/application/decision";
import { emptyActionWorkspace } from "@/application/action-workspace";
import { fill, labels } from "@/i18n";
import { Dashboard } from "@/components/dashboard";
import { ErrorState, FirstRunState, LoadingState } from "@/components/shell/page-states";
import { TemplateTable } from "@/components/shell/template-table";
import { DecisionWorkbench } from "@/components/decision-workbench";
import { ProductComparisonPanel } from "@/components/product-comparison-panel";
import { ActionsWorkbench } from "@/components/actions-workbench";
import { MeetingHistory } from "@/components/meeting-page";

/*
 * V3-8 C（PRD §7.10 空狀態與示範、§9.4 C10）：
 * - 首次進入、載入中、錯誤共用同一個頁面型容器 section.ui-empty-page.state-page（靠左、寬上限 640px、padding 24px、高度＝總覽首屏 --empty-min-h）。
 * - 首次進入：h2「還沒有資料」＋一句說明＋「載入示範資料」（主要）「匯入資料」（次要）＋「需要的檔案」3×3＋內容欄；不放插圖、eyebrow、步驟列、箭頭、問句。
 * - 載入中：spinner＋標題＋說明＋骨架（一行＋四格，--bg-subtle，不做 pulse）。錯誤：「資料無法載入。」＋原因（role=alert）＋三個動作（依條件出現）＋問題清單。
 * - 區段空狀態（C10 區段型／篩選型）：.ui-empty-block（虛線、radius、padding token），標題 p.ui-empty-title 句尾句號、說明 ≤ 14 字、動作「動詞＋名詞」。
 */

// 只模擬 useRef（ErrorState 的「查看問題清單」要拿到問題清單容器）；hooks.active 為 false 時一律交給真正的 React（SSR 照常）。
const hooks = vi.hoisted(() => ({ active: false, refs: [] as { current: unknown }[], cursor: 0 }));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useRef: (initial: unknown) => {
      if (!hooks.active) return actual.useRef(initial);
      const index = hooks.cursor++;
      hooks.refs[index] ??= { current: initial };
      return hooks.refs[index];
    },
  };
});
afterEach(() => { hooks.active = false; hooks.refs = []; hooks.cursor = 0; });

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
const byTestId = (tree: ReactNode, id: string) => findAll(tree, element => element.props["data-testid"] === id);

const noop = () => undefined;
const copy = labels.empty.stateV3;
const escapeAttr = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const text = (html: string) => html.replace(/<[^>]*>/g, "");
const occurrences = (html: string, needle: string) => html.split(needle).length - 1;
/** 回傳含有 `attr` 的那個元素（開始標籤到對應的結束標籤）。 */
function element(html: string, attr: string): string {
  const at = html.indexOf(attr);
  expect(at, attr).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<", at);
  const tag = /^<([a-zA-Z][\w-]*)/.exec(html.slice(start))![1];
  const re = new RegExp(`<(/?)${tag}(?=[\\s>/])[^>]*?(/?)>`, "g");
  re.lastIndex = start;
  let depth = 0;
  for (let match = re.exec(html); match; match = re.exec(html)) {
    if (match[1]) depth--; else if (!match[2]) depth++;
    if (depth === 0) return html.slice(start, re.lastIndex);
  }
  throw new Error(`元素沒有結束標籤：${attr}`);
}
const buttonsIn = (html: string) => [...html.matchAll(/<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/g)].map(match => ({ tag: match[1], attrs: match[2], text: text(match[3]) }));
/** §7.10 不用問句、不用箭頭（含 JSX 文字節點）、不用驚嘆號。 */
const FORBIDDEN = /[?？!！→←⇒⇐▸▾▶◀]/;

describe("V3-8 C 首次進入（§7.10，C10 頁面型）", () => {
  const html = renderToStaticMarkup(<FirstRunState onLoadDemo={noop} onImport={noop} />);

  it("同一個頁面型容器：section.ui-empty-page.state-page[data-testid=empty-state]，h2 是 labels.emptyState.title，下一句是 body", () => {
    expect(html).toMatch(/^<section class="ui-empty-page state-page first-run-state" data-testid="empty-state" aria-labelledby="empty-state-title"><h2 id="empty-state-title">/);
    expect(html).toContain(`<h2 id="empty-state-title">${labels.emptyState.title}</h2><p>${labels.emptyState.body}</p>`);
    // 頁面 h1 由 PageHeader 提供（M6 一個 h1）；這裡只有 h2 與「需要的檔案」h3。
    expect(html).not.toContain("<h1");
    expect(occurrences(html, "<h2")).toBe(1);
    expect(html).toContain(`<h3 class="state-files-title" id="empty-state-files">${copy.filesHeading}</h3>`);
  });

  it("不放插圖、eyebrow、步驟列、箭頭 icon 與問句（§7.10）", () => {
    for (const banned of ["empty-illustration", "eyebrow", "empty-steps", "<svg", "button primary large"]) expect(html, banned).not.toContain(banned);
    expect(text(html)).not.toMatch(FORBIDDEN);
    for (const step of labels.emptyState.steps) expect(text(html), step).not.toContain(`1 ${step}`);
    expect(text(html)).not.toContain(labels.emptyState.eyebrow);
  });

  it("按鈕列：「載入示範資料」主要在前、「匯入資料」次要在後（C12：主要按鈕放最前面、每個容器最多 1 顆主要）", () => {
    const actions = element(html, 'class="state-actions"');
    const list = buttonsIn(actions);
    expect(list.map(item => item.text)).toEqual([labels.buttons.loadDemo, labels.buttons.importData]);
    expect(list[0].attrs).toContain('class="ui-btn ui-btn-primary" data-testid="empty-load-demo"');
    expect(list[1].attrs).toContain('class="ui-btn ui-btn-secondary" data-testid="empty-import"');
    expect(occurrences(html, "ui-btn-primary")).toBe(1);
    // page-import 只在頁首（PageHeader），空狀態的「匯入資料」是另一個 testid。
    expect(html).not.toContain('data-testid="page-import"');
  });

  it("「需要的檔案」表：檔案｜內容｜匯入範本，三列的內容說明＝stateV3.fileDescriptions，空白範本與範例檔的可及名稱沿用 labels.downloads", () => {
    const table = element(html, 'aria-labelledby="empty-state-files"');
    expect(table).toMatch(/^<table class="template-table template-guide" aria-labelledby="empty-state-files">/);
    const head = [...element(table, "<thead").matchAll(/<th scope="col">([^<]*)<\/th>/g)].map(match => match[1]);
    expect(head).toEqual([labels.shell.topbarV3.templateColumns.file, labels.exports.excel.columns.summary.detail, labels.downloads.templatesHeading]);
    const rows = [...element(table, "<tbody").matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(match => match[1]);
    expect(rows).toHaveLength(3);
    const files = [labels.importWizard.files.sales, labels.importWizard.files.costs, labels.importWizard.files.ads];
    const roles = ["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"];
    const descriptions = [copy.fileDescriptions.sales, copy.fileDescriptions.costs, copy.fileDescriptions.ads];
    rows.forEach((row, index) => {
      const file = files[index];
      expect(row).toContain(`<th scope="row"><span class="template-file-label">${file}</span><code class="template-file-name">${roles[index]}</code></th><td>${descriptions[index]}</td>`);
      const links = buttonsIn(row);
      expect(links.map(link => link.text)).toEqual([labels.shell.topbarV3.templateColumns.blank, labels.shell.topbarV3.templateColumns.example]);
      expect(links[0].tag).toBe("button");
      expect(links[0].attrs).toContain(`aria-label="${escapeAttr(fill(labels.downloads.blankTemplate, { file }))}"`);
      expect(links[1].tag).toBe("a");
      expect(links[1].attrs).toContain(`download="${roles[index]}"`);
      expect(links[1].attrs).toContain(`aria-label="${escapeAttr(fill(labels.downloads.exampleTemplate, { file }))}"`);
      expect(row).toContain('<span class="template-links">');
    });
  });

  it("兩顆按鈕分別呼叫載入示範資料與匯入（dashboard 傳 load(\"demo\") 與 startImport）", () => {
    const onLoadDemo = vi.fn(), onImport = vi.fn();
    const tree = FirstRunState({ onLoadDemo, onImport });
    (byTestId(tree, "empty-load-demo")[0].props.onClick as () => void)();
    expect(onLoadDemo).toHaveBeenCalledTimes(1);
    expect(onImport).not.toHaveBeenCalled();
    (byTestId(tree, "empty-import")[0].props.onClick as () => void)();
    expect(onImport).toHaveBeenCalledTimes(1);
  });

  it("「需要的檔案」說明句都在 labels（stateV3），不含問句、箭頭、黑名單詞", () => {
    for (const value of [copy.filesHeading, ...Object.values(copy.fileDescriptions)]) {
      expect(value).not.toMatch(FORBIDDEN);
      for (const word of ["數據", "口徑", "工作區", "快照", "JSON"]) expect(value, word).not.toContain(word);
    }
    expect(copy.fileDescriptions).toEqual({ sales: "每日、每通路、每商品的原價、折扣、退款、成本", costs: "每日、每通路的平台抽成、金流、物流、其他費用", ads: "每日、每通路的廣告投放費" });
  });
});

describe("V3-8 C 載入中與錯誤（同一個容器）", () => {
  it("載入中：section.ui-empty-page.state-page.loading-state[aria-busy]，spinner＋標題＋說明＋骨架（一行＋四格），沒有 pulse 動畫 class", () => {
    const html = renderToStaticMarkup(<LoadingState />);
    expect(html).toMatch(/^<section class="ui-empty-page state-page loading-state" data-testid="loading-state" aria-busy="true"><div class="spinner" aria-hidden="true"><\/div>/);
    expect(html).toContain(`<h2>${labels.ui.dashboard.loading.heading}</h2><p>${labels.ui.dashboard.loading.body}</p>`);
    const skeleton = element(html, 'class="state-skeleton"');
    expect(skeleton).toMatch(/^<div class="state-skeleton" aria-hidden="true">/);
    expect(occurrences(skeleton, 'class="ui-skeleton-line state-skeleton-line"')).toBe(1);
    expect(occurrences(element(skeleton, 'class="state-skeleton-grid"'), 'class="ui-skeleton-block"')).toBe(4);
    for (const banned of ['class="skeleton"', 'class="skeleton-grid"', "pulse", "shimmer"]) expect(html, banned).not.toContain(banned);
  });

  it("錯誤：h2「資料無法載入。」＋原因 p[role=alert]＋「重新載入」主要；有上次成功的資料才有「回到上次成功的資料」、有問題才有「查看問題清單」與問題清單；沒有「!」圖示", async () => {
    const issues = validateDataset(fixture("errors/duplicate_sales_key")).issues;
    expect(issues.length).toBeGreaterThan(0);
    const reason = labels.ui.dashboard.errors.validationFailed;
    const full = renderToStaticMarkup(<ErrorState error={reason} issues={issues} onRetry={noop} onBack={noop} />);
    expect(full).toMatch(/^<section class="ui-empty-page state-page error-state" data-testid="error-state" aria-labelledby="error-state-title"><h2 id="error-state-title">/);
    expect(full).toContain(`<h2 id="error-state-title">${copy.errorTitle}</h2><p role="alert">${reason}</p>`);
    const actions = buttonsIn(element(full, 'class="state-actions"'));
    expect(actions.map(item => item.text)).toEqual([labels.ui.dashboard.errorState.retry, labels.ui.dashboard.errorState.back, copy.viewIssues]);
    expect(actions.map(item => /class="ui-btn ([^"]+)"/.exec(item.attrs)![1])).toEqual(["ui-btn-primary", "ui-btn-secondary", "ui-btn-text"]);
    expect(element(full, 'data-testid="error-issues"')).toContain(`role="region" aria-label="${escapeAttr(labels.ui.issueList.regionAria)}"`);
    for (const banned of ["error-icon", ">!<", "button quiet"]) expect(full, banned).not.toContain(banned);

    const firstLoad = renderToStaticMarkup(<ErrorState error={reason} issues={issues} onRetry={noop} />);
    expect(buttonsIn(element(firstLoad, 'class="state-actions"')).map(item => item.text)).toEqual([labels.ui.dashboard.errorState.retry, copy.viewIssues]);
    const noIssues = renderToStaticMarkup(<ErrorState error={labels.ui.dashboard.errors.fetchFailed} issues={[]} onRetry={noop} onBack={noop} />);
    expect(buttonsIn(element(noIssues, 'class="state-actions"')).map(item => item.text)).toEqual([labels.ui.dashboard.errorState.retry, labels.ui.dashboard.errorState.back]);
    expect(noIssues).not.toContain('data-testid="error-issues"');
    expect(noIssues).not.toContain('role="region"');
  });

  it("「查看問題清單」把焦點移到問題清單的 region 並捲過去；「重新載入」「回到上次成功的資料」呼叫各自的 handler", () => {
    const issues = validateDataset(fixture("errors/duplicate_sales_key")).issues;
    const onRetry = vi.fn(), onBack = vi.fn();
    hooks.active = true; hooks.cursor = 0;
    const tree = ErrorState({ error: "x", issues, onRetry, onBack });
    const region = { scrollIntoView: vi.fn(), focus: vi.fn() };
    const container = { querySelector: vi.fn((selector: string) => selector === '[role="region"]' ? region : null), scrollIntoView: vi.fn(), focus: vi.fn() };
    const wrapper = byTestId(tree, "error-issues")[0];
    expect(wrapper.props.ref).toBe(hooks.refs[0]);
    hooks.refs[0].current = container;
    (byTestId(tree, "error-view-issues")[0].props.onClick as () => void)();
    expect(region.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(region.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(container.focus).not.toHaveBeenCalled();
    // 找不到 region 時退回外層容器（tabIndex=-1）。
    container.querySelector.mockReturnValue(null);
    (byTestId(tree, "error-view-issues")[0].props.onClick as () => void)();
    expect(container.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(wrapper.props.tabIndex).toBe(-1);
    (byTestId(tree, "error-retry")[0].props.onClick as () => void)();
    (byTestId(tree, "error-back")[0].props.onClick as () => void)();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe("V3-8 C Dashboard 接線（真正的 Dashboard SSR 與原始碼）", () => {
  const source = readFileSync(resolve("src/components/dashboard.tsx"), "utf8");

  it("空工作區的 Dashboard 首頁渲染首次進入的容器（沒有 v2 的插圖、eyebrow、步驟列、大按鈕與箭頭 icon）", () => {
    const html = renderToStaticMarkup(createElement(Dashboard, { analytics: true }));
    const section = element(html, 'data-testid="empty-state"');
    expect(section).toMatch(/^<section class="ui-empty-page state-page first-run-state"/);
    for (const id of ["empty-load-demo", "empty-import"]) expect(occurrences(html, `data-testid="${id}"`), id).toBe(1);
    for (const banned of ["empty-illustration", "empty-steps", 'class="eyebrow"', "button primary large", "M4 18V6h5v12", "M13 6l6 6-6 6"]) expect(section, banned).not.toContain(banned);
    expect(occurrences(html, "<h1")).toBe(1);
  });

  it("三種狀態各由一個元件實例化一次，掛載條件不變（空狀態在匯入中與開發者驗證頁不出現、載入中排除套用篩選、錯誤狀態有資料才給 onBack）", () => {
    for (const component of ["FirstRunState", "LoadingState", "ErrorState"]) expect(source.match(new RegExp(`<${component}[\\s/>]`, "g"))?.length ?? 0, component).toBe(1);
    expect(source).toContain('{status === "empty" && !showImport && panel !== "validation" && <FirstRunState onLoadDemo={() => void load("demo")} onImport={startImport} />}');
    expect(source).toContain('{status === "loading" && !refiltering && <LoadingState />}');
    expect(source).toMatch(/\{status === "error" && <ErrorState error=\{error\} issues=\{issues\} onRetry=\{\(\) => void load\(selected\)\} onBack=\{active \? \(\) => \{ setStatus\(/);
    // v2 的三段 inline JSX 與 lens 圖形已移除；問題清單由 ErrorState 掛載。
    for (const banned of ['className="empty-state"', 'className="loading-state"', 'className="error-state"', 'name="lens"', "lens:", "<IssueList"]) expect(source, banned).not.toContain(banned);
  });
});

describe("V3-8 C 樣式（globals.css）", () => {
  const raw = readFileSync(resolve("src/app/globals.css"), "utf8");
  const start = raw.indexOf("/* ── V3-8 錨點（代理 C");
  // 規則比對時去掉註解（錨點註解本身會提到舊 class 名）。
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");
  const section = raw.slice(start, raw.indexOf("/* ── V3-8 錨點結束 ── */", start)).replace(/\/\*[\s\S]*?\*\//g, "");

  it("代理 C 區段定義 --empty-min-h（桌機與 ≤ 767px）並套在頁面型容器：padding 24px、寬上限沿用 .ui-empty-page 的 640px", () => {
    expect(start).toBeGreaterThan(-1);
    expect(section).toMatch(/\.state-page \{ --empty-min-h: calc\(100svh - var\(--topbar-h\) - var\(--page-header-h\) - var\(--space-2\)\); \}/);
    expect(section).toMatch(/@media \(max-width: 767px\) \{ \.state-page \{ --empty-min-h: calc\(100svh - var\(--topbar-h\) - var\(--space-2\)\); \} \}/);
    const rule = /\.ui-empty-page\.state-page \{([^}]*)\}/.exec(section)![1];
    expect(rule).toContain("min-height: var(--empty-min-h)");
    expect(rule).toContain("padding: var(--space-5)");
    expect(css).toMatch(/\.ui-empty-page \{ max-width: 640px;/);
    // --empty-min-h 不在 :root（只屬於這個容器）。
    const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
    expect(root).not.toContain("--empty-min-h");
  });

  it("v2 的空狀態、骨架與錯誤樣式整條刪除：沒有 .empty-state／.empty-illustration／.empty-steps／.error-icon／.skeleton-grid／.skeleton 的 pulse 與 @keyframes pulse", () => {
    for (const selector of [".empty-state", ".empty-illustration", ".empty-steps", ".error-icon", ".skeleton-grid", ".skeleton {", ".empty-note"]) expect(css, selector).not.toContain(selector);
    expect(css).not.toMatch(/@keyframes pulse/);
    expect(css).not.toMatch(/animation:\s*pulse/);
    // 骨架色塊：--bg-subtle、沒有動畫。
    const block = /\.ui-skeleton-block \{([^}]*)\}/.exec(css)![1];
    expect(block).toContain("background: var(--bg-subtle)");
    expect(block).not.toContain("animation");
    expect(section).not.toContain("animation");
  });

  it("C10 區段型：.ui-empty-block 是 1px 虛線 --border-default、--radius-md、padding 16px、14px；標題 p.ui-empty-title 用正文色", () => {
    const block = /\.ui-empty-block \{([^}]*)\}/.exec(css)![1];
    expect(block).toContain("border: var(--border-w) dashed var(--border-default)");
    expect(block).toContain("border-radius: var(--radius-md)");
    expect(block).toContain("padding: var(--space-4)");
    expect(block).toContain("font-size: var(--text-14)");
    expect(block).toContain("min-height: var(--block-h, var(--chart-h-sm))");
    expect(section).toContain(".ui-empty-block > .ui-empty-title { color: var(--text-primary); }");
  });
});

describe("V3-8 C 區段空狀態（§7.10 表、C10）", () => {
  /** §7.10 表（本代理負責的列＋錯誤列；「健檢沒有結果」由代理 A 在通路健檢實作）。動作為 null 表示表中寫「—」或會議頁沒有切頁的 prop（見回報 notes）。 */
  const rows = [
    { name: "尚無待辦", title: labels.actions.pageV3.emptyTitle, body: labels.actions.pageV3.emptyBody, actions: [labels.buttons.addAction] },
    { name: "篩選無結果", title: labels.products.panel.noProducts, body: null, actions: [labels.products.pageV3.clearFilters] },
    { name: "沒有方案", title: copy.noPlansTitle, body: copy.noPlansBody, actions: [labels.buttons.addScenario] },
    { name: "會議沒有選入方案", title: copy.meetingNoScenarioTitle, body: copy.meetingNoScenarioBody, actions: [] },
    { name: "會議歷史為空", title: copy.meetingHistoryTitle, body: copy.meetingHistoryBody, actions: [] },
    { name: "錯誤", title: copy.errorTitle, body: null, actions: [labels.ui.dashboard.errorState.retry, labels.ui.dashboard.errorState.back, copy.viewIssues] },
  ];
  /** 動作「動詞＋名詞」：動詞白名單＋後面還有名詞（「重新載入」是 PRD 指定的動作，受詞是資料本身）。 */
  const VERBS = ["新增", "清除", "前往", "回到", "查看", "載入", "匯入", "重新載入"];

  it.each(rows)("$name：標題在 labels 且句尾句號、說明 ≤ 14 字、動作是動詞＋名詞", ({ title, body, actions }) => {
    expect(title).toMatch(/。$/);
    expect(title).not.toMatch(FORBIDDEN);
    if (body !== null) {
      expect([...body].length).toBeLessThanOrEqual(14);
      expect(body).toMatch(/。$/);
      expect(body).not.toMatch(FORBIDDEN);
    }
    for (const action of actions) {
      expect(action).not.toMatch(/[。，？！]$/);
      const verb = VERBS.find(candidate => action.startsWith(candidate));
      expect(verb, action).toBeDefined();
      if (verb !== "重新載入") expect(action.length, action).toBeGreaterThan(verb!.length);
    }
  });

  it("首次進入的標題沿用 v2 鍵（V3-10 前不改字），說明句含「示範資料（虛構）」——§7.10 允許「（虛構）」出現的第二處", () => {
    expect(labels.emptyState.title).toBe("還沒有資料");
    expect(labels.emptyState.body).toContain("示範資料（虛構）");
    expect(labels.shell.dataStatus.demoTitle).toBe("示範資料（虛構）");
    expect(labels.status.demo).toBe("示範資料");
  });

  it("沒有方案：0 個方案時（基準已過期、沒有寫入的方案）新增格就是空狀態（標題＋說明＋「新增方案」），有方案時才顯示最多 3 個的說明；v2 的 empty-note 移除", async () => {
    const input = fixture("golden");
    const dataset = validateDataset(input).dataset!;
    const snapshot = await createSnapshot(dataset, { channels: ["DTC"] }, await hashInput(input));
    // 進頁時會先顯示本地草稿「方案 1」；只有基準過期（換了資料）而且沒有寫入的方案時，方案數才是 0。
    const state = { ...emptyDecisionWorkspace(), captured: createDecisionSession(dataset, snapshot, 1) };
    const html = renderToStaticMarkup(createElement(DecisionWorkbench, { dataset, snapshot, revision: 2, input, state, setState: noop, onEvidence: noop }));
    expect(element(html, 'data-testid="scenario-columns"')).toMatch(/^<div class="scenario-columns" data-testid="scenario-columns" data-count="0">/);
    const block = element(html, 'class="scenario-add ui-empty-block scenario-add-empty"');
    expect(block).toMatch(new RegExp(`^<div class="scenario-add ui-empty-block scenario-add-empty"><p class="ui-empty-title">${copy.noPlansTitle}</p><p>${copy.noPlansBody}</p><button type="button" class="ui-btn ui-btn-secondary" data-testid="scenario-add"[^>]*>${labels.buttons.addScenario}</button></div>$`));
    expect(html).not.toContain("empty-note");
    expect(html).not.toContain(labels.ui.decisionWorkbench.emptyPlans);
    expect(html).not.toContain(labels.scenarios.pageV3.addNote);
  });

  it("篩選無結果：product-empty 的標題是 p.ui-empty-title，有篩選時才有「清除篩選」", async () => {
    const input = fixture("golden");
    const dataset = validateDataset(input).dataset!;
    const snapshot = await createSnapshot(dataset, {}, await hashInput(input));
    const html = renderToStaticMarkup(createElement(ProductComparisonPanel, { dataset, snapshot, onEvidence: noop, initial: { query: "zzz" } }));
    const block = element(html, 'data-testid="product-empty"');
    expect(block).toMatch(new RegExp(`^<div class="ui-empty-block product-empty" data-testid="product-empty"><p class="ui-empty-title">${labels.products.panel.noProducts}</p><button type="button" class="ui-btn ui-btn-secondary" data-testid="product-clear-filters">${labels.products.pageV3.clearFilters}</button></div>$`));
  });

  it("尚無待辦：頁面型空狀態（§7.5 第 6 點）的標題、說明與「新增待辦」與 §7.10 表一致", async () => {
    const input = fixture("golden");
    const dataset = validateDataset(input).dataset!;
    const golden = { input, dataset, snapshot: await createSnapshot(dataset, {}, await hashInput(input)), revision: 1 };
    const html = renderToStaticMarkup(createElement(ActionsWorkbench, { workspace: emptyActionWorkspace(), onChange: noop, source: golden, onEvidence: noop, onExport: noop, view: "board", onViewChange: noop }));
    const block = element(html, 'data-testid="actions-empty"');
    expect(text(block)).toBe(`${labels.actions.pageV3.emptyTitle}${labels.actions.pageV3.emptyBody}${labels.buttons.addAction}`);
  });

  it("會議歷史為空：.ui-empty-block（區段型、與內容同高）＝標題＋說明；合起來仍是 v2 的 historyEmpty", () => {
    const html = renderToStaticMarkup(createElement(MeetingHistory, { history: [] }));
    expect(html).toContain(`<div class="ui-empty-block meeting-history-empty"><p class="ui-empty-title">${copy.meetingHistoryTitle}</p><p>${copy.meetingHistoryBody}</p></div>`);
    expect(`${copy.meetingHistoryTitle}${copy.meetingHistoryBody}`).toBe(labels.meetingPage.historyEmpty);
  });
});

describe("V3-8 C TemplateTable guide 版（menu 版不變）", () => {
  it("沒給 descriptions 時退回匯入精靈的 fileHints；labelledBy 只在 guide 版", () => {
    const guide = renderToStaticMarkup(<TemplateTable layout="guide" />);
    expect(guide).toMatch(/^<table class="template-table template-guide">/);
    for (const hint of Object.values(labels.importWizard.fileHints)) expect(guide).toContain(`<td>${escapeAttr(hint)}</td>`);
    const menu = renderToStaticMarkup(<TemplateTable />);
    expect(menu).toMatch(/^<table class="template-table"><thead><tr><th scope="col">/);
    expect(menu).not.toContain("template-file-name");
    expect(menu).not.toContain("template-links");
    expect(menu).not.toContain("aria-labelledby");
  });
});
