import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { fixture } from "./helpers/fixtures";
import { validateDataset } from "@/domain/validation";
import { createSnapshot, hashInput } from "@/application/workspace";
import { ExportMenu, type ExportMenuProps, type ExportMenuSource } from "@/components/shell/export-menu";
import { fill, labels } from "@/i18n";
import { scanLabels } from "../scripts/lib/copy-scan.mjs";

// V3-7 C 頂欄「匯出」選單（PRD §7.9、§6.5、§6.3 #16、C14）：SSR markup 檢查分組、每項名稱＋說明、處理中與失敗、空資料、文案與 CSS 錨點。
const noop = () => undefined;
const menu = labels.exports.menuV3;
const describeCopy = menu.descriptions;
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escapeText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const count = (html: string, needle: string) => html.split(needle).length - 1;

/** 含有 `attr` 的元素（開始標籤到對應結束標籤）；renderToStaticMarkup 的輸出是良構的。 */
function element(html: string, attr: string): string {
  const at = html.indexOf(attr);
  expect(at, attr).toBeGreaterThanOrEqual(0);
  const start = html.lastIndexOf("<", at);
  const tag = /^<([a-zA-Z][\w-]*)/.exec(html.slice(start))![1];
  const re = new RegExp(`<(/?)${escapeRe(tag)}(?=[\\s>/])[^>]*?(/?)>`, "g");
  re.lastIndex = start;
  let depth = 0;
  for (let match = re.exec(html); match; match = re.exec(html)) {
    if (match[1]) depth--; else if (!match[2]) depth++;
    if (depth === 0) return html.slice(start, re.lastIndex);
  }
  throw new Error(`沒有結束標籤：${attr}`);
}
const openTag = (html: string, attr: string) => { const el = element(html, attr); return el.slice(0, el.indexOf(">") + 1); };
const attrOf = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;

/** 依 dashboard.tsx 傳入的 props（onCopySummary 一律給）。 */
const props = (source: ExportMenuSource | null, overrides: Partial<ExportMenuProps> = {}): ExportMenuProps => ({
  source, busy: null, error: null, summaryRef: createRef<HTMLElement>(), onDecision: noop, onPrint: noop, onExport: noop, onMeetingNotes: noop,
  onCopySummary: async () => ({ copied: true, text: "" }), ...overrides,
});
const render = (source: ExportMenuSource | null, overrides: Partial<ExportMenuProps> = {}) => renderToStaticMarkup(createElement(ExportMenu, props(source, overrides)));

/** 每一項：[名稱元素 id 前綴, 可見名稱（既有 labels）, 說明（menuV3.descriptions）]。 */
type Item = [id: string, name: string, description: string];
const GROUPS = ["download-group-current", "download-group-summary", "download-group-decision", "download-group-meeting", "download-group-templates"] as const;

describe("V3-7 C 頂欄匯出選單（§7.9、§6.5）", () => {
  let withIssues: ExportMenuSource, clean: ExportMenuSource;
  beforeAll(async () => {
    const partialInput = fixture("errors/missing_cogs");
    const partial = validateDataset(partialInput).dataset!;
    withIssues = { dataset: partial, snapshot: await createSnapshot(partial, {}, await hashInput(partialInput)) };
    const demoInput = fixture("demo");
    const demo = validateDataset(demoInput).dataset!;
    clean = { dataset: demo, snapshot: await createSnapshot(demo, {}, await hashInput(demoInput)) };
    expect(withIssues.dataset.issues.length).toBeGreaterThan(0);
    expect(clean.dataset.issues).toHaveLength(0);
  });

  const itemsFor = (source: ExportMenuSource): Record<(typeof GROUPS)[number], Item[]> => ({
    "download-group-current": [
      ["download-analysis", labels.exports.downloads.analysisCsv, describeCopy.analysisCsv],
      ["download-channels", labels.exports.downloads.channelTableCsv, describeCopy.channelTableCsv],
      ["download-manifest", labels.exports.downloads.manifestJson, describeCopy.manifestJson],
      ...(source.dataset.issues.length > 0 ? [["download-issues", labels.exports.downloads.issuesCsv, fill(describeCopy.issuesCsv, { n: source.dataset.issues.length })] as Item] : []),
    ],
    "download-group-summary": [
      ["download-pdf", labels.exports.buttons.exportPdf, fill(describeCopy.exportPdf, { hint: labels.meeting.page.pdfHint })],
      ["download-excel", labels.exports.buttons.exportExcel, describeCopy.exportExcel],
      ["download-pptx", labels.exports.buttons.exportPptx, describeCopy.exportPptx],
      ["download-meeting-md", labels.meeting.page.menuMarkdown, describeCopy.menuMarkdown],
    ],
    "download-group-decision": [
      ["download-decision-md", labels.exports.downloads.decisionMd, describeCopy.decisionMd],
      ["download-decision-csv", labels.exports.downloads.decisionCsv, describeCopy.decisionCsv],
      ["download-decision-json", labels.exports.downloads.decisionJson, describeCopy.decisionJson],
    ],
    "download-group-meeting": [["download-copy-summary", labels.overview.snapshotUi.copy, describeCopy.copySummary]],
    "download-group-templates": [],
  });
  const titles: Record<(typeof GROUPS)[number], string> = {
    "download-group-current": labels.shell.sections.downloadCurrentView,
    "download-group-summary": labels.meeting.sections.meetingSummary,
    "download-group-decision": labels.shell.sections.downloadDecision,
    "download-group-meeting": menu.groupMeeting,
    "download-group-templates": labels.exports.downloads.templatesHeading,
  };

  it("五個分組依序：目前檢視、一頁摘要（目前檢視）、決策工作稿、會議、匯入範本；分組是 role=group，以 aria-labelledby 指到 12px 分組標題（.ui-menu-group）", () => {
    const html = render(withIssues);
    expect(openTag(html, 'data-testid="download-menu"')).toMatch(/^<details class="topbar-menu auto-close download-menu" data-testid="download-menu">$/);
    const at = GROUPS.map(id => html.indexOf(`data-testid="${id}"`));
    expect(at.every(index => index >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    for (const id of GROUPS) {
      const group = element(html, `data-testid="${id}"`);
      const open = group.slice(0, group.indexOf(">") + 1);
      expect(attrOf(open, "role"), id).toBe("group");
      const titleId = attrOf(open, "aria-labelledby")!;
      expect(group, id).toMatch(new RegExp(`<p id="${escapeRe(titleId)}" class="[^"]*\\bui-menu-group\\b[^"]*"[^>]*>${escapeRe(escapeText(titles[id]))}</p>`));
      expect(count(html, `data-testid="${id}"`), id).toBe(1);
    }
    // 一頁摘要的分組標題保留 v2 的 download-meeting-section；範本表保留 download-templates。
    expect(openTag(html, 'data-testid="download-meeting-section"')).toMatch(/^<p id="download-group-summary-title" class="menu-section ui-menu-group" data-testid="download-meeting-section">$/);
    expect(element(html, 'data-testid="download-group-templates"')).toContain('data-testid="download-templates"');
    // 分組之間是 1px 分隔線（.ui-menu-divider），共 4 條。
    expect(count(html, '<hr class="ui-menu-divider"/>')).toBe(4);
  });

  for (const [label, pick] of [["有資料問題（含條件項資料問題 CSV）", () => withIssues], ["沒有資料問題（不出現資料問題 CSV）", () => clean]] as const) {
    it(`每項是 button.ui-menu-item[data-lines="2"]：可見名稱＝既有 labels（aria-labelledby），一行 12px 說明（small，aria-describedby 指到它）——${label}`, () => {
      const source = pick();
      const html = render(source);
      const items = itemsFor(source);
      for (const id of GROUPS) {
        const group = element(html, `data-testid="${id}"`);
        const buttons = [...group.matchAll(/<button[^>]*class="ui-menu-item export-item"[^>]*>/g)].map(match => match[0]);
        expect(buttons, id).toHaveLength(items[id].length);
        items[id].forEach(([itemId, name, description], index) => {
          const button = buttons[index];
          expect(attrOf(button, "data-lines"), itemId).toBe("2");
          expect(attrOf(button, "type"), itemId).toBe("button");
          expect(attrOf(button, "aria-labelledby"), itemId).toBe(`${itemId}-name`);
          expect(attrOf(button, "aria-describedby"), itemId).toBe(`${itemId}-hint`);
          expect(attrOf(button, "aria-label"), `${itemId} 不用 aria-label（名稱就是可見文字）`).toBeNull();
          expect(attrOf(button, "aria-disabled"), itemId).toBeNull();
          const body = element(group, button);
          // 名稱與說明各一個元素；說明不在可及名稱內（名稱只取 aria-labelledby 指到的 span）。
          expect(body, itemId).toContain(`<span id="${itemId}-name" class="export-item-name">${escapeText(name)}</span>`);
          expect(body, itemId).toContain(`<small id="${itemId}-hint">${escapeText(description)}</small>`);
          expect(body, itemId).not.toContain("export-spinner");
        });
      }
      expect(count(html, 'class="export-item-name"')).toBe(Object.values(items).flat().length);
      expect(html.includes(labels.exports.downloads.issuesCsv)).toBe(source.dataset.issues.length > 0);
      // PDF 的說明行帶列印提示；v2 的 aria-describedby id 沿用。
      expect(html).toContain('aria-describedby="download-pdf-hint"');
    });
  }

  it("17 個 v2 下載項的名稱都還在（目前檢視 4、一頁摘要 4、決策工作稿 3、範本 6），加上會議分組的「複製週會摘要」", () => {
    const html = render(withIssues);
    const names = [...html.matchAll(/class="export-item-name">([^<]+)<\/span>/g)].map(match => match[1]);
    expect(names).toEqual([labels.exports.downloads.analysisCsv, labels.exports.downloads.channelTableCsv, labels.exports.downloads.manifestJson, labels.exports.downloads.issuesCsv, labels.exports.buttons.exportPdf, labels.exports.buttons.exportExcel, labels.exports.buttons.exportPptx, labels.meeting.page.menuMarkdown, labels.exports.downloads.decisionMd, labels.exports.downloads.decisionCsv, labels.exports.downloads.decisionJson, labels.overview.snapshotUi.copy].map(escapeText));
    const templates = element(html, 'data-testid="download-templates"');
    const controls = [...templates.matchAll(/aria-label="([^"]+)"/g)].map(match => match[1]);
    expect(controls).toEqual((["sales", "costs", "ads"] as const).flatMap(role => [fill(labels.exports.downloads.blankTemplate, { file: labels.importWizard.files[role] }), fill(labels.exports.downloads.exampleTemplate, { file: labels.importWizard.files[role] })]));
    expect(names.length - 1 + controls.length).toBe(17);
  });

  it("匯入範本是 3×3 表：欄頭「檔案｜空白範本｜範例檔」，三列是銷售、通路費用、廣告；空白範本是按鈕、範例檔是 <a download>", () => {
    const templates = element(render(clean), 'data-testid="download-templates"');
    const columns = labels.shell.topbarV3.templateColumns;
    expect([...templates.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map(match => match[1])).toEqual([columns.file, columns.blank, columns.example]);
    expect([...templates.matchAll(/<th scope="row">([^<]+)<\/th>/g)].map(match => match[1])).toEqual([labels.importWizard.files.sales, labels.importWizard.files.costs, labels.importWizard.files.ads]);
    expect(count(templates, "<tr>")).toBe(4);
    expect(count(templates, '<button type="button" class="ui-btn ui-btn-text"')).toBe(3);
    for (const role of ["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"]) expect(templates).toContain(`download="${role}"`);
  });

  it("v2 的 menuNote 與 menuViewNote 兩段說明不再出現；範圍差異寫在每項的說明行（一頁摘要 Excel／PPT：目前畫面、不含會議決議；會議紀錄 Markdown：最近一次已結束會議）", () => {
    for (const html of [render(withIssues), render(clean), render(null)]) {
      expect(html).not.toContain(escapeText(labels.exports.downloads.menuNote));
      expect(html).not.toContain(escapeText(labels.meeting.page.menuViewNote));
      expect(html).not.toContain('class="menu-note" role="status"');
    }
    expect(describeCopy.exportExcel).toContain("不含會議決議");
    expect(describeCopy.exportPptx).toContain("不含會議決議");
    expect(describeCopy.menuMarkdown).toContain("已結束會議");
  });

  it("沒有可看的資料（source 為 null）：只有匯入範本分組與一句 menuEmpty；即使有 onCopySummary 也不出現會議分組", () => {
    const html = render(null);
    expect(html).toContain(`${labels.shell.status.empty}；${labels.exports.downloads.menuEmpty}`);
    for (const id of ["download-menu", "download-group-templates", "download-templates"]) expect(count(html, `data-testid="${id}"`), id).toBe(1);
    for (const id of ["download-group-current", "download-group-summary", "download-group-decision", "download-group-meeting", "download-meeting-section", "download-copy-summary", "download-copy-summary-status"]) expect(html, id).not.toContain(`data-testid="${id}"`);
    expect(html).not.toContain("export-item-name");
    expect(count(html, '<hr class="ui-menu-divider"/>')).toBe(1);
  });

  it("會議分組：沒有 onCopySummary 時不渲染；有時是「複製週會摘要」一項＋常駐的 role=status（空），剪貼簿備案（textarea）只在複製失敗後出現", () => {
    const without = render(clean, { onCopySummary: undefined });
    expect(without).not.toContain('data-testid="download-group-meeting"');
    expect(without).not.toContain(escapeText(menu.groupMeeting) + "</p>");
    expect(count(without, '<hr class="ui-menu-divider"/>')).toBe(3);
    const html = render(clean);
    const group = element(html, 'data-testid="download-group-meeting"');
    expect(openTag(group, 'data-testid="download-copy-summary"')).toMatch(/^<button type="button" class="ui-menu-item export-item" data-lines="2" data-testid="download-copy-summary" aria-labelledby="download-copy-summary-name" aria-describedby="download-copy-summary-hint">$/);
    expect(element(group, 'data-testid="download-copy-summary-status"')).toBe('<p class="copy-status export-copy-status" role="status" data-testid="download-copy-summary-status"></p>');
    expect(group).not.toContain("download-copy-summary-fallback");
    expect(group).not.toContain("<textarea");
  });

  for (const [busy, id] of [["excel", "download-excel"], ["pptx", "download-pptx"], ["md", "download-meeting-md"]] as const) {
    it(`處理中（busy=${busy}）：該項右側 16px spinner（aria-hidden）；三個非同步項目都 aria-disabled；處理中文字在常駐的 sr-only role=status`, () => {
      const html = render(clean, { busy });
      const summary = element(html, 'data-testid="download-group-summary"');
      for (const other of ["download-excel", "download-pptx", "download-meeting-md"]) {
        const tag = openTag(summary, `aria-labelledby="${other}-name"`);
        expect(attrOf(tag, "aria-disabled"), other).toBe("true");
        expect(attrOf(tag, "data-busy"), other).toBe(other === id ? "true" : null);
        const body = element(summary, `aria-labelledby="${other}-name"`);
        expect(count(body, '<span class="export-spinner" aria-hidden="true"></span>'), other).toBe(other === id ? 1 : 0);
      }
      // 同步項目（PDF、目前檢視、決策工作稿）不受影響。
      expect(attrOf(openTag(html, 'aria-labelledby="download-pdf-name"'), "aria-disabled")).toBeNull();
      expect(attrOf(openTag(html, 'aria-labelledby="download-analysis-name"'), "aria-disabled")).toBeNull();
      expect(summary).toContain(`<p class="sr-only" role="status">${labels.meeting.page.exporting}</p>`);
      expect(html).not.toContain('role="alert"');
    });
  }

  it("沒有處理中時 sr-only role=status 仍掛著但沒有字", () => {
    expect(element(render(clean), 'data-testid="download-group-summary"')).toContain('<p class="sr-only" role="status"></p>');
  });

  for (const [error, id, text] of [["export", "download-excel", labels.meeting.page.exportError], ["markdown", "download-meeting-md", labels.meeting.page.markdownError]] as const) {
    it(`失敗（error=${error}）：錯誤一行（role=alert）緊接在該項按鈕下方、同一個 .menu-item 內，按鈕的 aria-describedby 也指到它；其他項目沒有錯誤行`, () => {
      const html = render(clean, { error });
      expect(count(html, 'role="alert"')).toBe(1);
      const button = openTag(html, `aria-labelledby="${id}-name"`);
      expect(attrOf(button, "aria-describedby")).toBe(`${id}-hint ${id}-error`);
      const item = element(html, `<div class="menu-item"><button type="button" class="ui-menu-item export-item" data-lines="2" aria-labelledby="${id}-name"`);
      expect(item).toMatch(new RegExp(`</button><p id="${id}-error" class="export-item-error" role="alert">${escapeRe(escapeText(text))}</p></div>$`));
      for (const other of ["download-excel", "download-pptx", "download-meeting-md"].filter(other => other !== id)) expect(attrOf(openTag(html, `aria-labelledby="${other}-name"`), "aria-describedby")).toBe(`${other}-hint`);
    });
  }

  it("labels.exports.menuV3 沒有黑名單詞、注意前綴、箭頭、「｜」、驚嘆號、emoji；每句 ≤ 20 字；說明行是標籤不加句號，狀態句才加", () => {
    const { metrics, details } = scanLabels({ exports: { menuV3: menu } });
    expect(metrics, JSON.stringify(details, null, 2)).toEqual({ noticePrefix: 0, noticeAnywhere: 0, arrows: 0, circledNumbers: 0, decorativeChars: 0, exclamations: 0, emoji: 0, allCaps: 0, pipes: 0, blacklistSynonym: 0, blacklistJargon: 0, blacklistTone: 0, blacklistEmotion: 0, placeholderMalformed: 0, placeholderVariantMismatch: 0, l1ClauseOverLimit: 0 });
    const cjk = (text: string) => (text.replace(/\{\w+\}/g, "").match(/[㐀-䶿一-鿿豈-﫿]/g) ?? []).length;
    const strings = [menu.groupMeeting, menu.copied, menu.copyFallback, ...Object.values(describeCopy)];
    for (const text of strings) for (const sentence of text.split("。").filter(Boolean)) expect(cjk(sentence), sentence).toBeLessThanOrEqual(20);
    for (const text of Object.values(describeCopy)) expect(text.endsWith("。"), text).toBe(false);
    for (const text of [menu.copied, menu.copyFallback]) expect(text.endsWith("。"), text).toBe(true);
    // 「JSON」只允許出現在 exports.downloads（v2 的下載項名稱）；說明行不寫。
    expect(JSON.stringify(menu)).not.toMatch(/\bJSON\b/);
  });

  it("globals.css 的 V3-7 代理 C 區段：選單寬 400px、兩行項目、16px spinner（沿用 @keyframes spin，reduced-motion 不轉）、失敗訊息；只用 token", () => {
    const css = readFileSync(resolve("src/app/globals.css"), "utf8");
    const start = css.indexOf("/* ── V3-7 錨點（代理 C：");
    const end = css.indexOf("/* ── V3-7 錨點結束 ── */");
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const block = css.slice(start, end);
    expect(block).toContain(".topbar .download-menu .menu-panel { width: min(400px, calc(100vw - 32px)); }");
    expect(block).toMatch(/\.export-item\[data-lines="2"\][^{]*\{[^}]*min-height: var\(--menu-item-h-2\)/);
    const spinner = /\.download-menu \.export-spinner \{([^}]*)\}/.exec(block)![1];
    expect(spinner).toContain("width: 16px");
    expect(spinner).toContain("height: 16px");
    expect(spinner).toMatch(/animation: spin\b/);
    expect(spinner).toContain("border-radius: var(--radius-full)");
    expect(block).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ \.download-menu \.export-spinner \{ animation: none; \} \}/);
    expect(block).toMatch(/\.export-item-error \{[^}]*color: var\(--unfavorable\)/);
    expect(block).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    for (const match of block.matchAll(/font-size:\s*([^;]+);/g)) expect(match[1]).toMatch(/^var\(--text-\d+\)$/);
    for (const match of block.matchAll(/border-radius:\s*([^;]+);/g)) expect(match[1]).toMatch(/^var\(--radius-[a-z]+\)$/);
  });
});
