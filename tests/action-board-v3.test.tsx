import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fixture } from "./helpers/fixtures";
import { validateDataset } from "@/domain/validation";
import { createSnapshot, hashInput } from "@/application/workspace";
import { addActionDraft, editActionManagement, editBoundAction, emptyActionWorkspace, pinAction, type ActionSource, type ActionWorkspace } from "@/application/action-workspace";
import { formatDateL1 } from "@/application/presentation";
import { fill, labels } from "@/i18n";
import type { ActionDrawerProps } from "@/components/action-drawer";
import type { EditorProps } from "@/components/action-editor";
import { ActionsWorkbench, type ActionsView } from "@/components/actions-workbench";
import { scanLabels } from "../scripts/lib/copy-scan.mjs";

/*
 * V3-6 代理 B（PRD §7.5 第 1–6 點、§6.3 #40／#42、C8／C10／C13／C15）：待辦頁的頁首、工具列、看板、C13 卡片、清單檢視、空狀態、匯出本頁。
 * SSR golden 兩張卡（同 tests/mounted-testids.test.tsx 的 pageStates 組法）：卡 1＝健檢帶入、置頂、進行中（狀態日 2026-10-01）；卡 2＝手動草稿。
 * 待辦編輯抽屜（ActionDrawer）是代理 C 的檔：這裡把它換成記錄 props 的替身，只驗 B 的接線（介面契約固定），不驗抽屜本身的版面。
 */
const drawer = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock("@/components/action-drawer", async () => {
  const { createElement } = await import("react");
  return { ActionDrawer: (props: { children: ReactNode }) => { drawer.calls.push(props); return createElement("dialog", { "data-testid": "action-drawer" }, props.children); } };
});

const page = labels.actions.pageV3;
const board = labels.actionBoard;
const ui = labels.ui.actionsWorkbench;
const statusName = { not_started: labels.actions.statuses.not_started, in_progress: labels.actions.statuses.in_progress, blocked: labels.actions.statuses.blocked, completed: labels.actions.statuses.done } as const;
type Status = keyof typeof statusName;
const STATUSES = Object.keys(statusName) as Status[];

/* ---------- markup 工具（同 tests/mounted-testids.test.tsx）---------- */
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escapeAttr = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function element(html: string, attr: string): string | null {
  const at = html.indexOf(attr);
  if (at < 0) return null;
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
const openTag = (html: string, attr: string) => { const el = element(html, attr); return el ? el.slice(0, el.indexOf(">") + 1) : null; };
const text = (html: string) => html.replace(/<[^>]*>/g, "");
const occurrences = (html: string, needle: string) => html.split(needle).length - 1;
/** 卡片的直接子元素（四列）：回傳每列開始標籤的 class。 */
function rows(card: string): string[] {
  const inner = card.slice(card.indexOf(">") + 1, card.lastIndexOf("</article>"));
  const out: string[] = [];
  let rest = inner;
  while (rest.length) {
    const tag = /^<([a-z]+)[^>]*>/.exec(rest);
    if (!tag) throw new Error(`非預期的內容：${rest.slice(0, 40)}`);
    const el = element(rest, tag[0])!;
    out.push(`${tag[1]}.${/class="([^"]+)"/.exec(tag[0])?.[1] ?? ""}`);
    rest = rest.slice(el.length);
  }
  return out;
}

let golden: ActionSource;
let actions: ActionWorkspace;
beforeAll(async () => {
  const input = fixture("golden");
  const dataset = validateDataset(input).dataset!;
  golden = { input, dataset, snapshot: await createSnapshot(dataset, {}, await hashInput(input)), revision: 1 };
  const diagnostic = golden.snapshot.report.diagnostics.find(row => row.code === "REV_UP_CM_DOWN" && row.scope.kind === "all")!;
  actions = addActionDraft(emptyActionWorkspace(), golden, "a1", diagnostic.id);
  actions = addActionDraft(actions, golden, "a2");
  actions = pinAction(actions, "a1", true);
  actions = editActionManagement(actions, "a1", { execution_status: "in_progress" }, "2026-10-01");
}, 60_000);
afterEach(() => { vi.useRealTimers(); drawer.calls.length = 0; });

const render = (workspace: ActionWorkspace, view: ActionsView = "board", extra: Partial<Parameters<typeof ActionsWorkbench>[0]> = {}) =>
  renderToStaticMarkup(<ActionsWorkbench workspace={workspace} onChange={() => undefined} source={golden} onEvidence={() => undefined} onExport={() => undefined} view={view} {...extra} />);
/** 臺北 2026-10-07 中午（逾期判定用固定的今天）。 */
const atToday = () => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-07T04:00:00.000Z")); };

describe("V3-6 B 頁首：計數徽章、? 說明、新增待辦、匯出本頁（§7.5 第 1 點、§6.3 #42）", () => {
  it("SSR 時兩組頁首節點 inline 放在工作台最上方，各只有一份", () => {
    const html = render(actions);
    const inline = element(html, 'class="actions-page-head-inline"')!;
    expect(html.indexOf('class="actions-page-head-inline"')).toBeLessThan(html.indexOf('data-testid="actions-toolbar"'));
    for (const id of ["actions-count", "actions-help", "actions-add", "actions-export-menu", "export-page-actions", "actions-export-md", "actions-export-csv", "actions-export-json"]) {
      expect(inline, id).toContain(`data-testid="${id}"`);
      expect(occurrences(html, `data-testid="${id}"`), id).toBe(1);
    }
    expect(openTag(html, 'data-testid="actions-workbench"')).toContain(`aria-label="${labels.nav.actions.label}"`);
    // v2 的 h2、說明段落、計數段落、看板說明、底部匯出區都移除（舊鍵保留不用）。
    for (const gone of [labels.sections.actionBoard, ui.intro, board.boardIntro, `<h2>${ui.exportHeading}</h2>`, ui.exportNote, fill(ui.countSummary, { total: 2, pinned: 1 }) + "</p>"]) expect(html, gone).not.toContain(gone);
  });

  it("計數徽章：可見「2 · 置頂 1」，aria-label 寫完整意思", () => {
    const tag = openTag(render(actions), 'data-testid="actions-count"')!;
    expect(tag).toContain('class="ui-count-badge actions-count"');
    expect(tag).toContain(`aria-label="${fill(ui.countSummary, { total: 2, pinned: 1 })}"`);
    expect(text(element(render(actions), 'data-testid="actions-count"')!)).toBe(fill(page.countBadge, { total: 2, pinned: 1 }));
  });

  it("? 說明：觸發器 aria-expanded／aria-controls，內容 hidden 掛載（M1、M3）", () => {
    const html = render(actions);
    const trigger = openTag(html, `aria-label="${page.helpAria}" aria-expanded`)!;
    expect(trigger).toMatch(/^<button type="button" class="ui-help-trigger"/);
    expect(trigger).toContain('aria-expanded="false"');
    expect(trigger).toContain('aria-controls="actions-help-panel"');
    const help = openTag(html, 'data-testid="actions-help"')!;
    expect(help).toContain('id="actions-help-panel"');
    expect(help).toContain('role="region"');
    expect(help).toContain(`aria-label="${page.helpAria}"`);
    expect(help).toMatch(/\shidden=""/);
    expect(text(element(html, 'data-testid="actions-help"')!)).toBe(page.help);
    expect(occurrences(html, 'id="actions-help-panel"')).toBe(1);
  });

  it("新增待辦是全頁唯一的主要按鈕；匯出本頁是收合的 <details>，三項都在裡面", () => {
    const html = render(actions);
    expect(occurrences(html, "ui-btn-primary")).toBe(1);
    expect(openTag(html, 'data-testid="actions-add"')).toBe('<button type="button" class="ui-btn ui-btn-primary" data-testid="actions-add">');
    expect(text(element(html, 'data-testid="actions-add"')!)).toBe(labels.buttons.addAction);
    const menu = element(html, 'data-testid="actions-export-menu"')!;
    expect(menu).toMatch(/^<details class="topbar-menu auto-close export-page"/);
    expect(openTag(html, 'data-testid="actions-export-menu"')).not.toMatch(/\sopen=""/);
    expect(openTag(menu, "<summary")).toBe('<summary class="ui-btn ui-btn-secondary" data-testid="export-page-actions">');
    expect(text(element(menu, "<summary")!)).toBe(labels.products.pageV3.exportPage);
    const names = { md: labels.downloads.decisionMd, csv: labels.downloads.decisionCsv, json: labels.downloads.decisionJson };
    for (const [format, name] of Object.entries(names)) expect(menu, format).toContain(`<button type="button" class="ui-menu-item" data-testid="actions-export-${format}">${escapeAttr(name)}</button>`);
  });
});

describe("V3-6 B 工具列與看板（§7.5 第 2–3 點、C15）", () => {
  it("工具列是 ui-toolbar＋ui-segmented（role=group），兩顆按鈕用 aria-pressed", () => {
    const html = render(actions);
    const toolbar = element(html, 'data-testid="actions-toolbar"')!;
    expect(openTag(html, 'data-testid="actions-toolbar"')).toContain('class="ui-toolbar actions-toolbar"');
    expect(toolbar).toContain(`<div class="ui-segmented" role="group" aria-label="${board.viewToggle}">`);
    expect(toolbar).toContain(`<button type="button" aria-pressed="true" data-testid="actions-view-board">${board.viewBoard}</button>`);
    expect(toolbar).toContain(`<button type="button" aria-pressed="false" data-testid="actions-view-list">${board.viewList}</button>`);
  });

  it("四欄：h3 欄名＋計數徽章（數字，aria-label 寫完整意思）；空欄是 C10 區段型空狀態「沒有待辦」", () => {
    const html = render(actions);
    const counts: Record<Status, number> = { not_started: 1, in_progress: 1, blocked: 0, completed: 0 };
    for (const status of STATUSES) {
      const column = element(html, `data-testid="board-column-${status}"`)!;
      expect(openTag(html, `data-testid="board-column-${status}"`)).toContain(`aria-labelledby="board-column-${status}-heading"`);
      expect(column).toContain(`<h3 id="board-column-${status}-heading">${statusName[status]} <span class="ui-count-badge" role="img" aria-label="${fill(board.columnCount, { n: counts[status] })}">${counts[status]}</span></h3>`);
      expect(occurrences(column, `<div class="ui-empty-block board-empty">${page.columnEmpty}</div>`), status).toBe(counts[status] ? 0 : 1);
    }
    expect(html).not.toContain(board.columnEmpty);
  });

  it("看板與清單只渲染一種（M6）：看板沒有 action-{n}，清單沒有看板卡", () => {
    const boardHtml = render(actions, "board"), listHtml = render(actions, "list");
    expect(boardHtml).toContain('data-testid="action-board"');
    expect(boardHtml).not.toMatch(/data-testid="action-\d+"/);
    expect(boardHtml).not.toContain('data-testid="evidence-checklist"');
    expect(listHtml).not.toContain('data-testid="action-board"');
    expect(listHtml).not.toMatch(/data-testid="board-card-\d+/);
    for (const n of [1, 2]) expect(occurrences(listHtml, `data-testid="action-${n}"`)).toBe(1);
    // 清單檢視：v2 的每項 article＋內嵌編輯器；標題列的引用狀態改成 ui-lozenge。
    const first = element(listHtml, 'data-testid="action-1"')!;
    expect(openTag(listHtml, 'data-testid="action-1"')).toContain('class="panel action-card"');
    expect(first).toContain(`<h3>${fill(ui.itemHeading, { kind: labels.buttons.pin, n: 1 })}</h3><span class="ui-lozenge">${ui.tagDraft}</span>`);
    expect(first).toContain('data-testid="evidence-checklist"');
    expect(occurrences(listHtml, 'data-testid="evidence-checklist"')).toBe(2);
  });
});

describe("V3-6 B C13 看板卡（§7.5 第 4 點）", () => {
  it("四列結構與 class：置頂＋標題｜負責人 · 到期 · 更新｜狀態標籤＋引用數｜移到：… 編輯", () => {
    atToday();
    const html = render(actions);
    for (const n of [1, 2]) {
      const card = element(html, `data-testid="board-card-${n}"`)!;
      expect(openTag(html, `data-testid="board-card-${n}"`)).toBe(`<article class="board-card" data-testid="board-card-${n}" aria-labelledby="board-card-${n}-title" tabindex="-1">`);
      expect(rows(card)).toEqual(["div.board-card-head", "p.board-card-meta", "p.board-card-tags", "div.board-card-foot"]);
      const head = element(card, 'class="board-card-head"')!;
      expect(head).toMatch(/^<div class="board-card-head"><button type="button" class="ui-btn ui-btn-icon board-pin" aria-pressed="(true|false)" aria-label="[^"]+"><svg[^>]*>.*?<\/svg><\/button><h4 class="board-card-heading"><button type="button" class="board-card-title" id="board-card-\d-title"><span class="board-card-title-text">[^<]+<\/span><\/button><\/h4><\/div>$/);
      expect(head).not.toMatch(/[★☆]/);
      const foot = element(card, 'class="board-card-foot"')!;
      expect(foot).toContain(`<div class="board-move" role="group" aria-label="${fill(board.moveGroup, { n })}"><span class="board-move-prefix" aria-hidden="true">${page.movePrefix}</span>`);
      expect(foot).toMatch(new RegExp(`<button type="button" class="ui-btn ui-btn-text board-card-edit" data-testid="board-card-${n}-edit" aria-describedby="board-card-${n}-title">${page.edit}</button></div>$`));
      // v2 的 dl.board-card-meta、details.board-edit、文字星號都移除。
      expect(card).not.toMatch(/<dl|<details|board-edit|pin-star/);
    }
    // 卡 1（a1）：置頂（實心星、aria-pressed=true、名稱「取消置頂」）、進行中（accent）、未指定負責人、沒有期限、10/1 更新、草稿。
    const card1 = element(html, 'data-testid="board-card-1"')!;
    const a1 = actions.items[0];
    expect(card1).toContain(`aria-pressed="true" aria-label="${ui.unpin}"`);
    expect(card1).toContain('class="icon-filled"');
    expect(text(element(card1, 'class="board-card-title"')!)).toBe(a1.card.problem.trim());
    expect(text(element(card1, 'class="board-card-meta"')!)).toBe(`${board.unassigned} · ${board.noDeadline} · ${fill(page.updated, { date: "10/1" })}`);
    expect(element(card1, 'class="board-card-tags"')).toBe(`<p class="board-card-tags"><span class="ui-lozenge" data-tone="accent">${statusName.in_progress}</span><span class="board-card-evidence">${fill(page.evidenceCount, { n: a1.card.fact_ids.length, state: page.evidenceDraft })}</span></p>`);
    expect(a1.card.fact_ids.length).toBeGreaterThan(0);
    // 卡 2（a2）：未置頂（線框星）、未開始（中性）、沒有更新日、引用 0 個數字。
    const card2 = element(html, 'data-testid="board-card-2"')!;
    expect(card2).toContain(`aria-pressed="false" aria-label="${labels.buttons.pin}"`);
    expect(card2).not.toContain("icon-filled");
    expect(text(element(card2, 'class="board-card-title"')!)).toBe(board.untitled);
    expect(text(element(card2, 'class="board-card-meta"')!)).toBe(`${board.unassigned} · ${board.noDeadline}`);
    expect(element(card2, 'class="board-card-tags"')).toBe(`<p class="board-card-tags"><span class="ui-lozenge">${statusName.not_started}</span><span class="board-card-evidence">${fill(page.evidenceCount, { n: 0, state: page.evidenceDraft })}</span></p>`);
  });

  it("「移到」每個文字按鈕：可見文字＝狀態名、可及名稱＝「移到{狀態}」，testid 各一份；目前狀態不出現", () => {
    const html = render(actions);
    const current: Record<number, Status> = { 1: "in_progress", 2: "not_started" };
    for (const n of [1, 2]) {
      const group = element(html, `aria-label="${fill(board.moveGroup, { n })}"`)!;
      for (const status of STATUSES) {
        const id = `board-card-${n}-move-${status}`;
        if (status === current[n]) { expect(html, id).not.toContain(`data-testid="${id}"`); continue; }
        expect(occurrences(html, `data-testid="${id}"`), id).toBe(1);
        expect(group, id).toContain(`<button type="button" class="ui-btn ui-btn-text" data-testid="${id}" aria-label="${fill(board.moveTo, { status: statusName[status] })}">${statusName[status]}</button>`);
      }
      // 三個狀態之間以 aria-hidden 的「·」分隔（兩個）。
      expect(occurrences(group, '<span class="board-move-sep" aria-hidden="true">·</span>')).toBe(2);
    }
  });

  it("逾期：期限早於今天（臺北）而且未完成才算，期限用 --unfavorable 並接「逾期」；完成或當天到期都不算", () => {
    atToday();
    let w = editBoundAction(editBoundAction(actions, "a1", { deadline: "2026-10-05", owner_role: "營運" }), "a2", { deadline: "2026-10-07" });
    let html = render(w);
    const due1 = element(element(html, 'data-testid="board-card-1"')!, 'class="board-card-due"')!;
    expect(due1).toBe(`<span class="board-card-due" data-overdue="true">${fill(page.due, { date: formatDateL1("2026-10-05", { today: "2026-10-07" }) })} <span class="board-card-overdue">${page.overdue}</span></span>`);
    expect(text(element(element(html, 'data-testid="board-card-1"')!, 'class="board-card-meta"')!)).toBe(`營運 · ${fill(page.due, { date: "10/5" })} ${page.overdue} · ${fill(page.updated, { date: "10/1" })}`);
    const due2 = element(element(html, 'data-testid="board-card-2"')!, 'class="board-card-due"')!;
    expect(due2).toBe(`<span class="board-card-due">${fill(page.due, { date: "10/7" })}</span>`);
    // 已完成的卡片即使期限已過也不算逾期；已完成的狀態標籤是中性並帶 check icon。
    w = editActionManagement(editBoundAction(w, "a2", { deadline: "2026-09-30" }), "a2", { execution_status: "completed" }, "2026-10-06");
    html = render(w);
    const done = element(html, 'data-testid="board-column-completed"')!;
    expect(done).toContain('data-testid="board-card-2"');
    expect(done).not.toContain("data-overdue");
    expect(done).toContain(`<span class="ui-lozenge"><svg`);
    expect(text(element(done, 'class="ui-lozenge"')!)).toBe(statusName.completed);
    // 跨年的期限寫年份（formatDateL1）。
    html = render(editBoundAction(actions, "a1", { deadline: "2025-12-29" }));
    expect(text(element(element(html, 'data-testid="board-card-1"')!, 'class="board-card-due"')!)).toBe(`${fill(page.due, { date: "2025/12/29" })} ${page.overdue}`);
  });

  it("受阻是 warning 標籤；條件徽章：需要重新核對優先於過期，兩者都沒有時不出現", () => {
    const blocked = editActionManagement(actions, "a2", { execution_status: "blocked" }, "2026-10-02");
    expect(element(render(blocked), 'data-testid="board-column-blocked"')).toContain(`<span class="ui-lozenge" data-tone="warning">${statusName.blocked}</span>`);
    // 換了資料（active_dataset_hash 不同）＝過期；a2 另外被標為需要重新核對。
    const flagged: ActionWorkspace = { ...actions, active_dataset_hash: "another-dataset", items: actions.items.map(item => item.card.id === "a2" ? { ...item, legacy_review_required: true } : item) };
    const html = render(flagged);
    const tags1 = element(element(html, 'data-testid="board-card-1"')!, 'class="board-card-tags"')!;
    const tags2 = element(element(html, 'data-testid="board-card-2"')!, 'class="board-card-tags"')!;
    expect(tags1).toContain(`<span class="ui-lozenge" data-tone="warning">${page.stale}</span>`);
    expect(tags2).toContain(`<span class="ui-lozenge" data-tone="warning">${page.reviewRequired}</span>`);
    expect(tags2).not.toContain(page.stale);
    expect(element(render(actions), 'data-testid="action-board"')).not.toContain('data-tone="warning"');
  });
});

describe("V3-6 B 待辦編輯抽屜接線（§7.5 第 4 點；ActionDrawer 的 props 契約）", () => {
  const lastDrawer = () => drawer.calls.at(-1) as ActionDrawerProps;
  const editorOf = (props: ActionDrawerProps) => (props.children as ReactElement<EditorProps>).props;
  it("看板檢視、編輯中的卡片存在時才渲染抽屜；清單檢視或卡片不存在時不渲染", () => {
    expect(render(actions)).not.toContain('data-testid="action-drawer"');
    expect(render(actions, "board", { initial: { editing: "a2" } })).toContain('data-testid="action-drawer"');
    expect(render(actions, "list", { initial: { editing: "a2" } })).not.toContain('data-testid="action-drawer"');
    expect(render(actions, "board", { initial: { editing: "missing" } })).not.toContain('data-testid="action-drawer"');
  });

  it("標題、置頂、往上移的可用性與編輯器（variant=drawer、不顯示編輯器內的置頂）", () => {
    let w = addActionDraft(actions, golden, "a3");
    render(w, "board", { initial: { editing: "a2" } });
    let props = lastDrawer();
    expect(props).toMatchObject({ index: 1, title: fill(ui.itemHeading, { kind: ui.item, n: 2 }), pinned: false, canMoveUp: false });
    expect(props.item.card.id).toBe("a2");
    expect(editorOf(props)).toMatchObject({ variant: "drawer", showPin: false, index: 1 });
    render(w, "board", { initial: { editing: "a1" } });
    props = lastDrawer();
    expect(props).toMatchObject({ index: 0, title: actions.items[0].card.problem.trim(), pinned: true, canMoveUp: false });
    render(w, "board", { initial: { editing: "a3" } });
    expect(lastDrawer()).toMatchObject({ index: 2, canMoveUp: true });
    w = editBoundAction(w, "a3", { problem: "  檢討折扣檔期  " });
    render(w, "board", { initial: { editing: "a3" } });
    expect(lastDrawer().title).toBe("檢討折扣檔期");
  });

  it("抽屜的置頂、往上移、移除與狀態改變都經 onChange 回報（同 v2 的 action-workspace 函式）", () => {
    const w = addActionDraft(actions, golden, "a3");
    const onChange = vi.fn();
    render(w, "board", { initial: { editing: "a3" }, onChange });
    const props = lastDrawer();
    props.onMoveUp();
    expect((onChange.mock.lastCall![0] as ActionWorkspace).items.map(item => item.card.id)).toEqual(["a1", "a3", "a2"]);
    props.onPin();
    expect((onChange.mock.lastCall![0] as ActionWorkspace).items.map(item => [item.card.id, item.pinned])).toEqual([["a1", true], ["a3", true], ["a2", false]]);
    props.onRemove();
    expect((onChange.mock.lastCall![0] as ActionWorkspace).items.map(item => item.card.id)).toEqual(["a1", "a2"]);
    editorOf(props).onStatus("blocked");
    expect((onChange.mock.lastCall![0] as ActionWorkspace).items.find(item => item.card.id === "a3")!.execution_status).toBe("blocked");
    expect(typeof props.fallbackFocus).toBe("function");
    expect(props.notice).toBe("");
  });

  it("清單檢視的內嵌編輯器顯示置頂（showPin，同 v2）；看板卡的置頂只有卡片上的 icon 按鈕", () => {
    expect(element(render(actions, "list"), 'data-testid="action-2"')).toContain(`>${labels.buttons.pin}</button>`);
    expect(element(render(actions), 'data-testid="action-board"')).not.toContain(`>${labels.buttons.pin}</button>`);
  });
});

describe("V3-6 B 空狀態（§7.5 第 6 點、C10 頁面型）", () => {
  it("沒有待辦：actions-empty（h2＋說明＋次要按鈕「新增待辦」），工具列與看板不渲染；頁首仍有新增待辦與匯出", () => {
    const html = render(emptyActionWorkspace());
    const empty = element(html, 'data-testid="actions-empty"')!;
    expect(openTag(html, 'data-testid="actions-empty"')).toBe('<div class="ui-empty-page actions-empty" data-testid="actions-empty">');
    expect(empty).toBe(`<div class="ui-empty-page actions-empty" data-testid="actions-empty"><h2>${page.emptyTitle}</h2><p>${page.emptyBody}</p><button type="button" class="ui-btn ui-btn-secondary" data-testid="actions-empty-add">${labels.buttons.addAction}</button></div>`);
    for (const id of ["actions-toolbar", "actions-view-board", "actions-view-list", "action-board"]) expect(html, id).not.toContain(`data-testid="${id}"`);
    for (const id of ["actions-add", "actions-count", "actions-help", "actions-export-md", "actions-export-csv", "actions-export-json"]) expect(occurrences(html, `data-testid="${id}"`), id).toBe(1);
    expect(text(element(html, 'data-testid="actions-count"')!)).toBe(fill(page.countBadge, { total: 0, pinned: 0 }));
    expect(html).not.toContain(ui.empty);
  });
});

describe("V3-6 B 樣式與文案護欄", () => {
  const css = readFileSync(resolve("src/app/globals.css"), "utf8");
  const start = css.indexOf("/* ── V3-6 錨點（代理 B：");
  const section = css.slice(start, css.indexOf("/* ── V3-6 錨點（代理 C："));
  it("globals.css 的 B 區段：卡片標題 line-clamp 2、≤ 1100 兩欄、≤ 640 單欄、C13 卡片 token（只用 token，不寫 hex、px 字級）", () => {
    expect(start).toBeGreaterThan(-1);
    expect(section).toMatch(/\.board-card-title-text \{[^}]*-webkit-line-clamp: 2;[^}]*line-clamp: 2;/);
    expect(section).toMatch(/@media \(max-width: 1100px\) \{ \.action-board \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \} \}/);
    expect(section).toMatch(/@media \(max-width: 640px\) \{ \.action-board \{ grid-template-columns: minmax\(0, 1fr\); \}/);
    expect(section).toMatch(/\.board-card \{[^}]*background: var\(--bg-surface\);[^}]*border: var\(--border-w\) solid var\(--border-default\);[^}]*border-radius: var\(--radius-md\);/);
    expect(section).toMatch(/\.board-card:hover \{ border-color: var\(--border-strong\); \}/);
    expect(section).toMatch(/\.board-column \{[^}]*background: var\(--bg-subtle\);[^}]*border: 0;/);
    expect(section).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(section).not.toMatch(/font-size:\s*\d/);
    expect(section).not.toMatch(/border-radius:\s*\d/);
    expect(section).not.toMatch(/(^|[\s;{])content:/);
  });

  it("labels.actions.pageV3 沒有黑名單詞、箭頭、｜、驚嘆號、「注意：」或超長 L1", () => {
    const { metrics, details } = scanLabels({ actions: { pageV3: page } });
    expect(Object.entries(metrics).filter(([, value]) => value > 0), JSON.stringify(details)).toEqual([]);
    for (const value of Object.values(page)) expect(value).not.toMatch(/行動|看證據|怎麼算的|公式與來源|數據|變化|通路貢獻|口徑|工作區|資料就緒|(?<!淨)營收/);
  });
});
