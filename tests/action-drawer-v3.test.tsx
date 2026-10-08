import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { fixture } from "./helpers/fixtures";
import { validateDataset } from "@/domain/validation";
import { createSnapshot, hashInput } from "@/application/workspace";
import { demoAlias } from "@/application/copy";
import { formatDateL1 } from "@/application/presentation";
import { actionDocuments, addActionDraft, commitActionRebind, confirmBoundAction, contextFor, editActionManagement, editBoundAction, emptyActionWorkspace, knownOwners, previewActionRebind, taipeiToday, type ActionRebindPreview, type ActionSource, type ActionWorkspace } from "@/application/action-workspace";
import { ActionEditor, factLabel, statusLabels, type EditorProps } from "@/components/action-editor";
import { ActionDrawer, actionDrawerSubtitle } from "@/components/action-drawer";
import { fill, labels } from "@/i18n";
import { scanLabels } from "../scripts/lib/copy-scan.mjs";

// V3-6 代理 C（PRD §7.5 第 4 點、§6.3 #41、§9.4 C6／C11／C12）：待辦編輯器三段（內容／引用的數字／歷史，不用分頁）與待辦編輯抽屜。
// golden 資料：一項由健檢 REV_UP_CM_DOWN（合計）建立、帶引用數字的待辦，加一項手動待辦。期待值一律由 labels／fill 與格式化函式組出，不新增任何計算。

const copy = labels.actions.drawerV3;
const ui = labels.actions.workbench;
const board = labels.actions.board;
const noop = () => undefined;
let source: ActionSource;
let workspace: ActionWorkspace;

beforeAll(async () => {
  const input = fixture("golden");
  const dataset = validateDataset(input).dataset!;
  source = { input, dataset, revision: 1, snapshot: await createSnapshot(dataset, {}, await hashInput(input)) };
  const diagnostic = source.snapshot.report.diagnostics.find(row => row.code === "REV_UP_CM_DOWN" && row.scope.kind === "all")!;
  workspace = addActionDraft(addActionDraft(emptyActionWorkspace(), source, "cited", diagnostic.id), source, "manual");
});

function props(w: ActionWorkspace, index: number, extra: Partial<EditorProps> = {}): EditorProps {
  return { workspace: w, item: w.items[index], index, document: actionDocuments(w)[index], owners: knownOwners(w), showPin: true, query: "", onQuery: noop, change: noop, onConfirm: noop, onStatus: noop, busy: null, preview: null, onPrepareRebind: noop, onCommitRebind: noop, onCancelRebind: noop, onEvidence: noop, ...extra };
}
const editor = (p: EditorProps) => renderToStaticMarkup(<ActionEditor {...p} />);
const drawer = (w: ActionWorkspace, index: number, extra: Partial<Parameters<typeof ActionDrawer>[0]> = {}, editorExtra: Partial<EditorProps> = {}) => renderToStaticMarkup(
  <ActionDrawer item={w.items[index]} index={index} title={w.items[index].card.problem.trim() || fill(ui.itemHeading, { kind: ui.item, n: index + 1 })} onClose={noop} pinned={w.items[index].pinned} onPin={noop} canMoveUp={index > 0} onMoveUp={noop} onRemove={noop} {...extra}>
    <ActionEditor {...props(w, index, { variant: "drawer", showPin: false, ...editorExtra })} />
  </ActionDrawer>);

/* ---------- markup 工具（renderToStaticMarkup 的輸出是良構的；只需要成對的同名標籤）。 ---------- */
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escapeAttr = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** React SSR 的文字跳脫（& < > " '）。 */
const escapeText = (text: string) => escapeAttr(text).replace(/'/g, "&#x27;");
const occurrences = (html: string, text: string) => html.split(text).length - 1;
/** 回傳含有 `attr` 的那個元素（開始標籤到對應的結束標籤）；找不到回傳 null。 */
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
const section = (html: string, name: string) => element(html, `role="region" aria-label="${escapeAttr(name)}"`)!;
const regionNames = (html: string) => [...html.matchAll(/<section class="action-editor-section[^"]*" role="region" aria-label="([^"]+)">/g)].map(match => match[1]);
const headings = (html: string) => [...html.matchAll(/<h3 class="action-editor-heading">([^<]*)<\/h3>/g)].map(match => match[1]);
const buttons = (html: string) => [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(match => ({ attrs: match[1], text: match[2].replace(/<[^>]*>/g, "") }));
const idCounts = (html: string) => { const out = new Map<string, number>(); for (const match of html.matchAll(/\sid="([^"]+)"/g)) out.set(match[1], (out.get(match[1]) ?? 0) + 1); return out; };

describe("ActionEditor 三段（§7.5 第 4 點、§6.3 #41）", () => {
  it("清單與抽屜兩種 variant 都是同一頁捲動的三段：內容 → 引用的數字 → 歷史（region 名稱與段名＝labels.actions.drawerV3），不用分頁", () => {
    for (const variant of ["list", "drawer"] as const) for (const index of [0, 1]) {
      const html = editor(props(workspace, index, { variant }));
      expect(regionNames(html), `${variant} ${index}`).toEqual([copy.content, copy.evidence, copy.history]);
      expect(headings(html), `${variant} ${index}`).toEqual([copy.content, copy.evidence, copy.history]);
      expect(html).not.toMatch(/role="tab(list|panel)?"/);
    }
    // 未傳 variant 時同清單（v2 行為）。
    const { variant: omitted, ...rest } = props(workspace, 0, { variant: "list" }); void omitted;
    expect(editor(rest)).toBe(editor(props(workspace, 0, { variant: "list" })));
  });

  it("內容段：範圍一行 → 7 欄（C11：label 在上、for 指到輸入）→ 狀態 select＋狀態更新日 → 廣告決策 select（V3-9a F13）→ 進度紀錄；fieldset 與 sr-only legend 保留", () => {
    const w = editActionManagement(editBoundAction(workspace, "cited", { owner_role: "營運", deadline: "2026-10-20" }), "cited", { execution_status: "blocked" }, "2026-10-02");
    const html = editor(props(w, 0));
    const content = section(html, copy.content);
    expect(content.indexOf('<p class="action-editor-scope">')).toBeGreaterThan(content.indexOf('class="action-editor-heading"'));
    expect(content).toContain(`<legend class="sr-only">${fill(ui.editLegend, { n: 1 })}</legend>`);
    const fieldLabels = [...content.matchAll(/<label class="ui-field-label" for="([^"]+)">([^<]*)<\/label>/g)];
    expect(fieldLabels.map(match => match[2])).toEqual([labels.actions.form.problem, labels.actions.form.step, labels.actions.form.owner, labels.actions.form.metric, labels.actions.form.due, labels.actions.form.stop, labels.actions.form.extraData, labels.actions.form.status, labels.actions.adDecisionV3.field, labels.actions.form.progress]);
    const ids = idCounts(html);
    for (const [, id, label] of fieldLabels) {
      expect(ids.get(id), label).toBe(1);
      // 每個輸入保留 aria-label（E2E 以 getByLabel 定位），class 是 C11 的 ui-field-control。
      expect(new RegExp(`<(input|textarea|select) id="${escapeRe(id)}" class="ui-field-control[^"]*" aria-label="${escapeRe(escapeAttr(label))}"`).test(content), label).toBe(true);
    }
    expect(occurrences(content, 'rows="2"')).toBe(5);
    expect(occurrences(content, 'rows="3"')).toBe(1);
    expect(content).toContain('type="date" value="2026-10-20"');
    expect(content).toContain('list="action-owners-cited"');
    expect(content).toContain('<datalist id="action-owners-cited"><option value="營運"></option></datalist>');
    expect(content).toContain(`class="ui-field-hint">${board.ownerListHint}</small>`);
    const select = new RegExp(`<select id="[^"]+" class="ui-field-control action-status-select" aria-label="${escapeRe(labels.actions.form.status)}" aria-describedby="([^"]+)">`).exec(content)!;
    expect(content).toContain(`<option value="blocked" selected="">${statusLabels.blocked}</option>`);
    expect(content).toContain(`<small id="${select[1]}" class="ui-field-hint">${fill(board.statusUpdated, { date: "2026-10-02" })}</small>`);
    expect(ids.get(select[1])).toBe(1);
    // 狀態沒改過時沒有狀態更新日，也不帶 aria-describedby。
    expect(section(editor(props(workspace, 1)), copy.content)).toMatch(new RegExp(`class="ui-field-control action-status-select" aria-label="${escapeRe(labels.actions.form.status)}">`));
    // 引用的數字、確認、重新核對都不在內容段。
    expect(content).not.toContain('data-testid="evidence-checklist"');
    expect(content).not.toContain("<button");
  });

  it("引用的數字段：確認的意思一行（不加「注意：」前綴）→ 搜尋與勾選（evidence-checklist、搜尋框 aria-label 不變）→ 確認（唯一主要按鈕）→ 看明細 → 重新核對（次要）→ 限制", () => {
    const html = editor(props(workspace, 0));
    const evidence = section(html, copy.evidence);
    expect(evidence).toContain(`<p class="action-editor-note">${labels.actions.form.confirmedNote}${ui.evidenceChangeNote}</p>`);
    expect(html).not.toContain(`${labels.diagnosis.sections.caution}：`);
    expect(html).not.toContain(`class="alert"`);
    const checklist = element(evidence, 'data-testid="evidence-checklist"')!;
    expect(checklist).toMatch(new RegExp(`^<fieldset class="evidence-checklist" aria-label="${escapeRe(ui.evidencePicker)}" data-testid="evidence-checklist">`));
    expect(checklist).toContain(`<legend class="sr-only">${ui.evidencePicker}</legend>`);
    expect(checklist).toMatch(new RegExp(`<input id="[^"]+" class="ui-field-control" aria-label="${escapeRe(labels.actions.form.searchEvidence)}" aria-describedby="[^"]+" type="search"`));
    expect(checklist).toContain(fill(board.evidenceSelected, { n: workspace.items[0].card.fact_ids.length }));
    expect(occurrences(checklist, '<label class="evidence-option ui-check-label"><input type="checkbox" class="ui-check"')).toBeGreaterThan(0);
    // 確認是整個編輯器唯一的主要按鈕（C12：每個容器最多 1 顆）。
    const primary = buttons(html).filter(button => button.attrs.includes("ui-btn-primary"));
    expect(primary.map(button => button.text)).toEqual([labels.shell.buttons.confirm]);
    // 看明細：每個引用的數字一顆文字按鈕，名稱沿用「看明細 · …」。
    const context = contextFor(workspace, workspace.items[0]);
    const facts = workspace.items[0].card.fact_ids.map(id => context.session.facts.find(fact => fact.id === id)!);
    expect(facts.length).toBeGreaterThan(0);
    const links = element(evidence, 'class="action-evidence"')!;
    expect(buttons(links).map(button => button.text)).toEqual(facts.map(fact => escapeText(fill(ui.viewEvidenceItem, { fact: factLabel(fact, demoAlias(context.session.dataset_id)) }))));
    expect(buttons(links).every(button => button.attrs.includes('class="ui-btn ui-btn-text"'))).toBe(true);
    const rebind = buttons(evidence).find(button => button.text === labels.actions.buttons.rebind)!;
    expect(rebind.attrs).toContain('class="ui-btn ui-btn-secondary"');
    expect(rebind.attrs).not.toContain("disabled");
    const order = ['data-testid="evidence-checklist"', `>${labels.shell.buttons.confirm}</button>`, 'class="action-evidence"', `>${labels.actions.buttons.rebind}</button>`].map(text => evidence.indexOf(text));
    expect(order.every(index => index > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const limitations = actionDocuments(workspace)[0].data_limitations;
    if (limitations.length) expect(evidence.indexOf(`<summary>${ui.limitations}</summary>`)).toBeGreaterThan(order[3]);
    // 手動待辦沒有引用：沒有看明細列，重新核對停用，仍有確認。
    const manual = section(editor(props(workspace, 1)), copy.evidence);
    expect(manual).not.toContain('class="action-evidence"');
    expect(buttons(manual).find(button => button.text === labels.actions.buttons.rebind)!.attrs).toContain('disabled=""');
    expect(manual).toContain(`>${labels.shell.buttons.confirm}</button>`);
  });

  it("較早資料與待重新確認的警示是 inline notice（ui-notice、warning），放在引用的數字段開頭；核對中是 role=status", () => {
    const historical = { ...workspace, active_dataset_hash: "another-dataset" };
    const review = { ...workspace, items: workspace.items.map((item, index) => index === 0 ? { ...item, legacy_review_required: true } : item) };
    const historicalHtml = section(editor(props(historical, 0)), copy.evidence);
    expect(historicalHtml).toContain(`<p class="ui-notice" data-tone="warning">${ui.historicalAlert}</p>`);
    expect(historicalHtml.indexOf('class="ui-notice"')).toBeLessThan(historicalHtml.indexOf('data-testid="evidence-checklist"'));
    expect(section(editor(props(review, 0)), copy.evidence)).toContain(`<p class="ui-notice" data-tone="warning">${ui.reviewRequiredAlert}</p>`);
    expect(section(editor(props(workspace, 0)), copy.evidence)).not.toContain("ui-notice");
    const checking = section(editor(props(workspace, 0, { busy: "cited" })), copy.evidence);
    expect(checking).toContain(`<p role="status" class="action-editor-note">${ui.rebindChecking}</p>`);
    expect(buttons(checking).find(button => button.text === labels.actions.buttons.rebind)!.attrs).toContain('disabled=""');
  });

  it("用目前資料重新核對的預覽：region 名稱不變、表格是 ui-table，預覽區自己的主要按鈕「改用目前資料」與取消；預覽外仍只有「確認」一顆主要按鈕", async () => {
    const confirmed = confirmBoundAction(workspace, "cited");
    const preview: ActionRebindPreview = await previewActionRebind(confirmed, "cited", source);
    const html = editor(props(confirmed, 0, { preview }));
    const region = element(html, `aria-label="${ui.rebindRegion}"`)!;
    expect(region).toMatch(new RegExp(`^<section role="region" aria-label="${escapeRe(ui.rebindRegion)}" class="action-rebind-preview">`));
    expect(section(html, copy.evidence)).toContain(region);
    expect(region).toContain('<table class="ui-table">');
    expect(region).not.toContain('class="panel"');
    expect(buttons(region).map(button => [button.text, button.attrs.match(/class="([^"]+)"/)![1]])).toEqual([[ui.rebindCommit, "ui-btn ui-btn-primary"], [labels.shell.buttons.cancel, "ui-btn ui-btn-secondary"]]);
    const outside = html.replace(region, "");
    expect(buttons(outside).filter(button => button.attrs.includes("ui-btn-primary")).map(button => button.text)).toEqual([labels.shell.buttons.confirm]);
  });

  it("歷史段：引用歷史（較早的引用）與技術細節都是預設收合、仍然掛著的 <details>（M1）", async () => {
    const confirmed = confirmBoundAction(workspace, "cited");
    const rebound = await commitActionRebind(confirmed, "cited", await previewActionRebind(confirmed, "cited", source), source, true);
    const history = section(editor(props(rebound, 0)), copy.history);
    const summaries = [...history.matchAll(/<details class="action-editor-details"><summary>([^<]*)<\/summary>/g)].map(match => match[1]);
    expect(summaries).toEqual([fill(ui.historySummary, { n: 1 }), labels.evidence.sections.technicalDetails]);
    expect(history).not.toMatch(/<details[^>]*\sopen/);
    expect(history).toContain('class="action-history-entry"');
    expect(history).toMatch(/<button type="button" class="ui-btn ui-btn-text">/);
    // 沒有引用歷史時只剩技術細節；技術細節仍列出引用的數字代號（收合）。
    const fresh = section(editor(props(workspace, 0)), copy.history);
    expect([...fresh.matchAll(/<summary>([^<]*)<\/summary>/g)].map(match => match[1])).toEqual([labels.evidence.sections.technicalDetails]);
    for (const id of workspace.items[0].card.fact_ids) expect(fresh).toContain(`<code>${escapeAttr(id)}</code>`);
  });

  it("清單 variant 在三段之後保留置頂、往上移、移除按鈕列（不含重新核對）；抽屜 variant 不渲染這一列", () => {
    const list = editor(props(workspace, 1));
    const row = element(list, 'class="button-row ui-actions action-editor-actions"')!;
    expect(list.indexOf(row)).toBeGreaterThan(list.indexOf(section(list, copy.history)));
    expect(buttons(row).map(button => button.text)).toEqual([labels.actions.buttons.pin, labels.actions.buttons.moveUp, labels.actions.buttons.remove]);
    expect(buttons(row).map(button => button.attrs.match(/class="([^"]+)"/)![1])).toEqual(["ui-btn ui-btn-secondary", "ui-btn ui-btn-secondary", "ui-btn ui-btn-text"]);
    expect(buttons(row)[0].attrs).toContain('aria-pressed="false"');
    expect(row).not.toContain(labels.actions.buttons.rebind);
    expect(occurrences(list, `>${labels.actions.buttons.rebind}</button>`)).toBe(1);
    // 第一項不能往上移；showPin=false 時沒有置頂。
    expect(buttons(element(editor(props(workspace, 0)), 'class="button-row ui-actions action-editor-actions"')!)[1].attrs).toContain('disabled=""');
    expect(buttons(element(editor(props(workspace, 1, { showPin: false })), 'class="button-row ui-actions action-editor-actions"')!).map(button => button.text)).toEqual([labels.actions.buttons.moveUp, labels.actions.buttons.remove]);
    const inDrawer = editor(props(workspace, 1, { variant: "drawer" }));
    expect(inDrawer).not.toContain("action-editor-actions");
    for (const text of [labels.actions.buttons.pin, ui.unpin, labels.actions.buttons.moveUp, labels.actions.buttons.remove]) expect(inDrawer, text).not.toContain(`>${text}</button>`);
  });

  it("M6：同一份編輯器內每個 id 唯一，label for 與 aria-describedby 都指到存在的元素；兩份編輯器並列時 id 也不重複", () => {
    for (const variant of ["list", "drawer"] as const) {
      const html = editor(props(workspace, 0, { variant }));
      const ids = idCounts(html);
      expect([...ids].filter(([, count]) => count > 1)).toEqual([]);
      for (const match of html.matchAll(/\s(?:for|aria-describedby|list)="([^"]+)"/g)) expect(ids.get(match[1]), match[0]).toBe(1);
    }
    const both = renderToStaticMarkup(<>{[0, 1].map(index => <article key={index} data-testid={`action-${index + 1}`}><ActionEditor {...props(workspace, index)} /></article>)}</>);
    expect([...idCounts(both)].filter(([, count]) => count > 1)).toEqual([]);
    expect(occurrences(both, 'data-testid="evidence-checklist"')).toBe(2);
  });
});

describe("ActionDrawer（C6 待辦編輯抽屜）", () => {
  it("dialog.action-drawer：testid、aria-labelledby 指向 h2（卡片標題）、aria-describedby 指向副標", () => {
    const html = drawer(workspace, 0);
    const open = /^<dialog[^>]*>/.exec(html)![0];
    expect(open).toMatch(/^<dialog class="action-drawer" data-testid="action-drawer" aria-labelledby="([^"]+)" aria-describedby="([^"]+)"/);
    const [, labelledBy, describedBy] = /aria-labelledby="([^"]+)" aria-describedby="([^"]+)"/.exec(open)!;
    expect(html).toContain(`<h2 id="${labelledBy}">${escapeText(workspace.items[0].card.problem)}</h2>`);
    expect(html).toMatch(new RegExp(`<p id="${escapeRe(describedBy)}" class="action-drawer-sub">`));
    expect(open).not.toMatch(/\srole=|\stabindex=|\sopen=/);
    expect(idCounts(html).get(labelledBy)).toBe(1);
    expect(idCounts(html).get(describedBy)).toBe(1);
    // 手動待辦沒有標題時用「待辦 n」。
    expect(drawer(workspace, 1)).toContain(`>${fill(ui.itemHeading, { kind: ui.item, n: 2 })}</h2>`);
  });

  it("副標「負責人 · 期限 到期 · 狀態」：期限用 formatDateL1；負責人空白寫「未指定」，沒有期限寫「未定」", () => {
    const w = editActionManagement(editBoundAction(workspace, "cited", { owner_role: "  王小明 ", deadline: "2026-09-30" }), "cited", { execution_status: "in_progress" }, "2026-09-25");
    const expected = fill(copy.subtitle, { owner: "王小明", due: fill(copy.due, { date: formatDateL1("2026-09-30", { today: taipeiToday() }) }), status: statusLabels.in_progress });
    expect(actionDrawerSubtitle(w.items[0])).toBe(expected);
    expect(drawer(w, 0)).toContain(`class="action-drawer-sub">${expected}</p>`);
    expect(actionDrawerSubtitle(w.items[0], "2026-10-07")).toBe(fill(copy.subtitle, { owner: "王小明", due: fill(copy.due, { date: "9/30" }), status: statusLabels.in_progress }));
    expect(actionDrawerSubtitle(w.items[0], "2027-01-02")).toBe(fill(copy.subtitle, { owner: "王小明", due: fill(copy.due, { date: "2026/9/30" }), status: statusLabels.in_progress }));
    expect(actionDrawerSubtitle(workspace.items[1])).toBe(fill(copy.subtitle, { owner: board.unassigned, due: board.noDeadline, status: statusLabels.not_started }));
  });

  it("關閉 icon 按鈕在標題列右側，是抽屜裡第一個可聚焦的控制（autofocus、aria-label＝關閉、action-drawer-close）", () => {
    const html = drawer(workspace, 0);
    const first = /<(button|input|select|textarea|summary|a)\b[^>]*>/.exec(html)![0];
    expect(first).toContain('class="ui-btn ui-btn-icon action-drawer-close"');
    expect(first).toContain(`aria-label="${labels.shell.buttons.close}"`);
    expect(first).toContain('data-testid="action-drawer-close"');
    expect(first).toContain("autofocus");
    expect(element(html, 'class="action-drawer-head"')).toContain("<svg");
  });

  it("底部動作列：關閉、置頂（aria-pressed）、往上移（不能移時停用）是次要按鈕；移除是危險文字按鈕放最右", () => {
    const foot = element(drawer(workspace, 1), 'class="action-drawer-foot"')!;
    const list = buttons(foot);
    expect(list.map(button => button.text)).toEqual([labels.shell.buttons.close, labels.actions.buttons.pin, labels.actions.buttons.moveUp, labels.actions.buttons.remove]);
    expect(list.map(button => button.attrs.match(/class="([^"]+)"/)![1])).toEqual(["ui-btn ui-btn-secondary", "ui-btn ui-btn-secondary", "ui-btn ui-btn-secondary", "ui-btn ui-btn-text ui-btn-danger"]);
    expect(list.map(button => button.attrs.match(/data-testid="([^"]+)"/)![1])).toEqual(["action-drawer-dismiss", "action-drawer-pin", "action-drawer-move-up", "action-drawer-remove"]);
    expect(list[1].attrs).toContain('aria-pressed="false"');
    expect(list[2].attrs).not.toContain("disabled");
    const pinnedFirst = buttons(element(drawer(workspace, 0, { pinned: true, canMoveUp: false }), 'class="action-drawer-foot"')!);
    expect(pinnedFirst[1].text).toBe(ui.unpin);
    expect(pinnedFirst[1].attrs).toContain('aria-pressed="true"');
    expect(pinnedFirst[2].attrs).toContain('disabled=""');
  });

  it("內容是 drawer variant 的三段編輯器：三段都在 action-drawer-body 內，置頂／往上移／移除只有底部動作列一組", () => {
    const html = drawer(workspace, 0);
    const body = element(html, 'class="action-drawer-body"')!;
    expect(regionNames(body)).toEqual([copy.content, copy.evidence, copy.history]);
    expect(body).toContain('data-testid="evidence-checklist"');
    for (const text of [labels.actions.buttons.pin, labels.actions.buttons.moveUp, labels.actions.buttons.remove]) expect(occurrences(html, `>${text}</button>`), text).toBe(1);
    expect(html.indexOf('class="action-drawer-head"')).toBeLessThan(html.indexOf('class="action-drawer-body"'));
    expect(html.indexOf('class="action-drawer-body"')).toBeLessThan(html.indexOf('class="action-drawer-foot"'));
    expect([...idCounts(html)].filter(([, count]) => count > 1)).toEqual([]);
  });

  it("notice 有值才以 role=status 顯示在內容頂端；空字串與未傳入都不渲染", () => {
    const withNotice = element(drawer(workspace, 0, { notice: ui.confirmDone }), 'class="action-drawer-body"')!;
    expect(withNotice).toMatch(new RegExp(`^<div class="action-drawer-body"><p role="status" class="ui-notice action-drawer-notice">${escapeRe(ui.confirmDone)}</p>`));
    expect(drawer(workspace, 0, { notice: "" })).not.toContain('role="status"');
    expect(drawer(workspace, 0)).not.toContain("action-drawer-notice");
  });
});

describe("globals.css 代理 C 區段與 labels.actions.drawerV3", () => {
  const css = readFileSync(resolve("src/app/globals.css"), "utf8");
  const start = css.indexOf("/* ── V3-6 錨點（代理 C");
  const block = css.slice(start, css.indexOf("/* ── V3-6 錨點結束 ── */", start));

  it("抽屜寬度用 --drawer-w／-wide／-narrow、手機 100vw；標題列 56px 黏頂、底部動作列 64px 黏底；遮罩 --scrim；滑入動畫與 reduced-motion", () => {
    expect(start).toBeGreaterThan(-1);
    expect(block).toMatch(/\.action-drawer \{[^}]*width: var\(--drawer-w\);[^}]*height: 100dvh;[^}]*border-left: var\(--border-w\) solid var\(--border-subtle\);[^}]*box-shadow: var\(--shadow-overlay\);[^}]*overflow-y: auto;/);
    expect(block).toMatch(/@media \(min-width: 1440px\) \{ \.action-drawer \{ width: var\(--drawer-w-wide\); \} \}/);
    expect(block).toMatch(/@media \(max-width: 1279px\) \{ \.action-drawer \{ width: var\(--drawer-w-narrow\); \} \}/);
    expect(block).toMatch(/@media \(max-width: 767px\) \{ \.action-drawer \{ width: 100vw;/);
    expect(block).toMatch(/\.action-drawer::backdrop \{ background: var\(--scrim\); \}/);
    expect(block).toMatch(/\.action-drawer-head \{ position: sticky; top: 0;[^}]*min-height: 56px;/);
    expect(block).toMatch(/\.action-drawer-foot \{ position: sticky; bottom: 0;[^}]*justify-content: flex-end;[^}]*min-height: 64px;[^}]*background: var\(--bg-surface\);[^}]*border-top: var\(--border-w\) solid var\(--border-subtle\);/);
    expect(block).toMatch(/\.action-drawer\[open\] \{[^}]*animation: action-drawer-in var\(--dur-base\)/);
    expect(block).toMatch(/@keyframes action-drawer-in \{/);
    expect(block).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ \.action-drawer\[open\] \{ animation: none; \} \}/);
    expect(block).toMatch(/\.action-drawer-head h2 \{[^}]*font-size: var\(--text-20\);[^}]*font-weight: var\(--weight-semibold\);/);
    expect(block).toMatch(/\.action-editor-heading \{[^}]*font-size: var\(--text-13\);[^}]*font-weight: var\(--weight-semibold\);[^}]*color: var\(--text-secondary\);/);
  });

  it("只用 token：沒有 hex、px 字級、圓角原值、字距與 content 裝飾字", () => {
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(block).not.toMatch(/font-size:\s*\d/);
    expect(block).not.toMatch(/border-radius: (?!0;|var\()/);
    expect(block).not.toMatch(/letter-spacing/);
    expect(block).not.toMatch(/(^|[\s;{])content:/);
  });

  it("新鍵沒有黑名單詞、注意前綴、箭頭、｜、驚嘆號；每句 ≤ 20 字", () => {
    const { metrics } = scanLabels({ actions: { drawerV3: copy } });
    expect(Object.entries(metrics).filter(([, value]) => value > 0)).toEqual([]);
    const values = Object.values(copy) as string[];
    expect(values).toHaveLength(5);
    for (const value of values) {
      expect(value).not.toMatch(/行動|看證據|怎麼算的|公式與來源|數據|變化|通路貢獻|口徑|工作區|資料就緒|(?<!淨)營收|危險/);
      for (const sentence of value.replace(/\{\w+\}/g, "").split(/[。；]/)) expect([...sentence.replace(/[\s·]/g, "")].length, value).toBeLessThanOrEqual(20);
    }
    expect([copy.content, copy.evidence, copy.history]).toEqual(["內容", "引用的數字", "歷史"]);
  });
});
