import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { fixture } from "./helpers/fixtures";
import { validateDataset } from "@/domain/validation";
import { createSnapshot, hashInput } from "@/application/workspace";
import { diagnosisGroups } from "@/application/diagnosis-group";
import { Dashboard } from "@/components/dashboard";
import { DataStatus, type DataStatusProps } from "@/components/shell/data-status";
import { ExportMenu } from "@/components/shell/export-menu";
import { PageHeader, ShellFooter } from "@/components/shell/page-chrome";
import { ShellFrame, type ShellFrameProps } from "@/components/shell/shell-frame";
import { WorkspaceStorage } from "@/components/workspace-storage";
import { fill, labels } from "@/i18n";

// V3-3 A1 殼層（PRD §6.1、§6.3 #1–#23、§6.4 M1／M6、§6.5、§7.0）：SSR markup 檢查結構、掛載與唯一性。
const noop = () => undefined;
const count = (html: string, needle: string) => html.split(needle).length - 1;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** 取出某個 data-testid 元素開頭到同層結束標籤之間的 markup（只用在沒有同名巢狀標籤的元素）。 */
function section(html: string, testid: string, tag = "div"): string {
  const start = html.search(new RegExp(`<${tag}[^>]*data-testid="${escape(testid)}"`));
  expect(start, testid).toBeGreaterThanOrEqual(0);
  let depth = 0;
  const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, "g");
  re.lastIndex = start;
  for (let match = re.exec(html); match; match = re.exec(html)) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(start, match.index + match[0].length);
  }
  throw new Error(`unclosed ${testid}`);
}

async function demo() {
  const input = fixture("demo");
  const dataset = validateDataset(input).dataset!;
  return { input, dataset, snapshot: await createSnapshot(dataset, {}, await hashInput(input)) };
}

const statusProps = (overrides: Partial<DataStatusProps> = {}): DataStatusProps => ({
  state: "ready",
  data: { local: false, datasetName: labels.ui.dashboard.datasets.demo, dataAsOf: "2026-08-24", coverageStart: "2026-06-01", issueCount: 0 },
  statusText: fill(labels.status.ready, { date: "2026-08-24" }),
  statusDetail: labels.ui.dashboard.datasets.demo,
  publicDemo: true,
  onGoData: noop, onImport: noop,
  ...overrides,
});
const frameProps = (overrides: Partial<ShellFrameProps> = {}): ShellFrameProps => ({
  panel: "overview", showValidation: false, onNavigate: noop, dataStatus: statusProps(),
  ai: { headline: labels.status.aiOff, detail: labels.ui.dashboard.aiDetail.publicDemo, open: false, onToggle: noop },
  aiContainerRef: createRef<HTMLDivElement>(), aiButtonRef: createRef<HTMLButtonElement>(),
  onBasis: noop, storage: null, exportMenu: null, badges: { snapshot: null, issues: 0, meetingDraft: false },
  ...overrides,
});

describe("V3-3 殼層：Dashboard 的單一實例（M6）與常駐掛載（M1）", () => {
  const html = renderToStaticMarkup(createElement(Dashboard, { analytics: true }));

  it("頂欄控制、選單與 popover 在 DOM 各只有一份", () => {
    for (const id of ["download-menu", "workspace-storage", "data-status", "data-status-popover", "data-status-import", "workspace-status", "ai-availability", "topbar-more", "mobile-tabbar", "mobile-more", "download-templates", "analytics-note"]) expect(count(html, `data-testid="${id}"`), id).toBe(1);
    for (const id of ["main-content", "ai-availability-detail", "data-status-popover", "topbar-cluster", "mobile-more"]) expect(count(html, ` id="${id}"`), id).toBe(1);
    expect(count(html, "<header")).toBe(1);
    expect(count(html, "<footer")).toBe(1);
  });

  it("搬進 popover／「更多」的內容保持掛載，用 hidden 收起", () => {
    expect(html).toMatch(/<div id="data-status-popover"[^>]*hidden=""/);
    expect(html).toMatch(/<div id="ai-availability-detail"[^>]*hidden=""/);
    expect(html).toMatch(/<div class="mobile-more" id="mobile-more"[^>]*hidden=""/);
    // 儲存與匯出選單、指標定義在頂欄同一個群組裡（手機由 topbar-more 以 CSS 重新定位，不複製）。
    const cluster = html.slice(html.indexOf('id="topbar-cluster"'), html.indexOf('data-testid="topbar-more"'));
    for (const id of ["ai-availability", "workspace-storage", "download-menu"]) expect(cluster).toContain(`data-testid="${id}"`);
    expect(cluster).toContain(`aria-label="${labels.buttons.basis}"`);
    expect(html).toMatch(/aria-controls="topbar-cluster mobile-more"/);
  });

  it("跳至主要內容、主要導覽、手機導覽（不同 aria-label 的第二個 nav）都在；頂欄沒有麵包屑、模式徽章與裝飾點", () => {
    expect(html).toContain('<a class="skip-link" href="#main-content">');
    expect(count(html, `<nav aria-label="${labels.ui.dashboard.mainNavAria}"`)).toBe(1);
    expect(count(html, `aria-label="${labels.shell.mobileNav.aria}"`)).toBe(1);
    expect(html).not.toContain(labels.ui.dashboard.breadcrumbRoot);
    expect(html).not.toContain('class="mode-badge"');
    expect(html).not.toMatch(/nav-dot|green-dot|sidebar-note|sidebar-footer|workspace-label/);
    expect(html).not.toContain('class="eyebrow">' + labels.brand.tagline);
  });

  it("空工作區：資料狀態寫「還沒有資料」，sr-only 狀態鏡像保留 role=status＋aria-live；頁尾一句口徑、指標定義與新台幣 · 台北時間", () => {
    expect(html).toMatch(new RegExp(`data-testid="data-status"[^>]*>.*?${escape(labels.status.empty)}`));
    expect(html).toMatch(/<span class="sr-only" role="status" aria-live="polite" data-testid="workspace-status">/);
    const footer = html.slice(html.indexOf("<footer"), html.indexOf("</footer>"));
    for (const text of [labels.basis.footer, labels.buttons.basis, labels.ui.dashboard.sidebarFooter]) expect(footer).toContain(text);
  });

  it("頁首「匯入資料」（page-import）只在資料來源頁；其他頁經資料狀態 popover 的「匯入新資料」", () => {
    expect(html).not.toContain('data-testid="page-import"');
    expect(html).toContain('data-testid="data-status-import"');
    const data = renderToStaticMarkup(createElement(PageHeader, { title: labels.nav.data.label, description: labels.nav.data.description, isData: true, showLoadDemo: true, onLoadDemo: noop, onImport: noop }));
    expect(count(data, 'data-testid="page-import"')).toBe(1);
    expect(data).toContain(`<h1>${labels.nav.data.label}</h1>`);
    expect(data).toContain(labels.buttons.loadDemo);
    const overview = renderToStaticMarkup(createElement(PageHeader, { title: labels.nav.overview.label, description: labels.nav.overview.description, isData: false, showLoadDemo: true, onLoadDemo: noop, onImport: noop }));
    expect(overview).not.toContain("page-import");
    expect(overview).not.toContain(labels.buttons.loadDemo);
  });

  it("表單 id 與期間欄位 id 在元件原始碼裡各只產生一次（同一個控制只有一個 DOM 實例）", () => {
    const dir = resolve("src/components");
    const sources = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter(name => name.endsWith(".tsx")).map(name => readFileSync(resolve(dir, name), "utf8")).join("\n");
    for (const id of ["previous-start", "previous-end", "current-start", "current-end", "ai-availability-detail", "data-status-popover", "main-content"]) expect(count(sources, ` id="${id}"`), id).toBe(1);
    for (const id of ["download-menu", "workspace-storage", "data-status", "workspace-status", "mobile-tabbar", "topbar-more"]) expect(count(sources, `data-testid="${id}"`), id).toBe(1);
  });
});

describe("V3-3 資料狀態按鈕與 popover（§6.3 #5、#6、#9、#11）", () => {
  it("示範資料 ready：按鈕「示範資料 · 資料到 8/24」；popover 有資料集、資料到（天數）、資料問題、前往資料來源、公開示範站說明與匯入新資料", () => {
    const html = renderToStaticMarkup(createElement(DataStatus, statusProps()));
    const button = html.slice(0, html.indexOf("</button>"));
    expect(button).toContain(fill(labels.shell.dataStatus.button, { source: labels.status.demo, date: "8/24" }));
    expect(button).toContain('data-state="ready"');
    expect(button).toContain('aria-haspopup="dialog"');
    expect(button).toContain('aria-expanded="false"');
    expect(button).toContain('aria-controls="data-status-popover"');
    const popover = section(html, "data-status-popover");
    expect(popover).toContain('role="dialog"');
    expect(popover).toContain(`aria-label="${labels.shell.dataStatus.popoverAria}"`);
    for (const text of [labels.shell.dataStatus.demoTitle, labels.ui.dashboard.sidebarNote.demo, labels.ui.dashboard.datasets.demo, fill(labels.shell.dataStatus.dataAsOfValue, { date: "2026-08-24", days: 85 }), fill(labels.shell.dataStatus.issuesValue, { n: 0 }), labels.shell.dataStatus.goToData, labels.ui.dashboard.aiDetail.publicDemo, labels.shell.dataStatus.importNew]) expect(popover, text).toContain(text);
    expect(popover).toContain('data-testid="data-status-import"');
    // v2 的狀態列文字（含資料集名稱）保留在 sr-only 的 role=status。
    expect(html).toContain(`data-testid="workspace-status">${fill(labels.status.ready, { date: "2026-08-24" })} · ${labels.ui.dashboard.datasets.demo}</span>`);
    // 「示範資料」在畫面上只出現在按鈕（popover 預設收起）。
    expect(count(html.replace(popover, ""), labels.status.demo)).toBe(2); // 按鈕＋sr-only 鏡像的資料集名稱
  });

  it("本機匯入、部分資料待補、空、載入中、錯誤的按鈕文字與狀態點", () => {
    const local = renderToStaticMarkup(createElement(DataStatus, statusProps({ data: { ...statusProps().data!, local: true }, publicDemo: false })));
    expect(local).toContain(fill(labels.shell.dataStatus.button, { source: labels.status.local, date: "8/24" }));
    expect(local).toContain(labels.shell.dataStatus.localTitle);
    expect(local).not.toContain(labels.ui.dashboard.aiDetail.publicDemo);
    const partial = renderToStaticMarkup(createElement(DataStatus, statusProps({ state: "partial", statusText: labels.status.partial })));
    expect(partial).toContain(fill(labels.shell.dataStatus.button, { source: labels.status.partial, date: "8/24" }));
    expect(partial).toContain('data-state="partial"');
    for (const state of ["empty", "loading", "error"] as const) {
      const html = renderToStaticMarkup(createElement(DataStatus, statusProps({ state, data: state === "empty" ? null : statusProps().data, statusText: labels.status[state], statusDetail: null })));
      expect(html.slice(0, html.indexOf("</button>")), state).toContain(labels.status[state]);
      expect(html).toContain(`data-state="${state}"`);
      expect(html).toContain('data-testid="data-status-import"');
    }
  });
});

describe("V3-3 側欄分組（D-V3-14＝A）與手機底部分頁列", () => {
  it("四組依序：看結果／找原因／做決定／管資料，頁面順序維持 v2；active 用 aria-current", () => {
    const html = renderToStaticMarkup(createElement(ShellFrame, frameProps({ panel: "diagnosis" })));
    const sidebar = html.slice(html.indexOf("<aside"), html.indexOf("</aside>"));
    const groups = [...sidebar.matchAll(/data-testid="nav-group-([a-z]+)"/g)].map(match => match[1]);
    expect(groups).toEqual(["results", "causes", "decisions", "data"]);
    for (const id of groups) expect(sidebar).toContain(labels.shell.sidebarV3.groups[id as keyof typeof labels.shell.sidebarV3.groups]);
    const order = [...sidebar.matchAll(/<span>([^<]+)<\/span>/g)].map(match => match[1]);
    expect(order).toEqual((["overview", "diagnosis", "products", "scenarios", "actions", "meeting", "data"] as const).map(id => labels.nav[id].label));
    expect(count(sidebar, 'aria-current="page"')).toBe(1);
    expect(sidebar).toMatch(new RegExp(`aria-current="page"[^>]*>.*?<span>${labels.nav.diagnosis.label}</span>`));
    expect(sidebar).not.toContain("nav-group-developer");
    expect(html).not.toContain(labels.nav.validation.label);
  });

  it("開發者組只在 #validation 時出現，位於分隔線下；手機「更多」面板也只在那時有開發者驗證", () => {
    const html = renderToStaticMarkup(createElement(ShellFrame, frameProps({ showValidation: true, panel: "validation" })));
    const sidebar = html.slice(html.indexOf("<aside"), html.indexOf("</aside>"));
    expect(sidebar).toContain('data-testid="nav-group-developer"');
    expect(sidebar.indexOf("nav-group-developer")).toBeGreaterThan(sidebar.indexOf("nav-group-data"));
    expect(sidebar).toContain(labels.shell.sidebarV3.groups.developer);
    const more = html.slice(html.indexOf('id="mobile-more"'));
    expect(more).toContain(labels.nav.validation.label);
    expect(more).toMatch(new RegExp(`aria-current="page"[^>]*>.*?<span>${labels.nav.validation.label}</span>`));
  });

  it("徽章：健檢的不利列數、資料問題數、會議草稿；按鈕的可及名稱仍是頁名，完整意思由 aria-describedby 提供", async () => {
    const { snapshot } = await demo();
    const unfavorable = diagnosisGroups(snapshot).groups.filter(group => !group.missing).length;
    expect(unfavorable).toBeGreaterThan(0);
    const html = renderToStaticMarkup(createElement(ShellFrame, frameProps({ badges: { snapshot, issues: 3, meetingDraft: true } })));
    expect(html).toContain(`data-mark="${unfavorable}" data-testid="nav-mark-diagnosis" aria-hidden="true"`);
    expect(html).toContain(`<span id="nav-mark-diagnosis" hidden="">${fill(labels.shell.sidebarV3.unfavorableBadge, { n: unfavorable })}</span>`);
    expect(html).toContain(`<span id="nav-mark-data" hidden="">${fill(labels.shell.sidebarV3.issuesBadge, { n: 3 })}</span>`);
    expect(html).toContain(`data-mark="${labels.shell.sidebarV3.meetingDraft}"`);
    expect(html).toMatch(/aria-describedby="nav-mark-diagnosis"/);
    // 徽章數字不進 textContent：nav 按鈕的文字仍只有頁名（E2E 的 toHaveText 與 getByRole name 不受影響）。
    expect(html).toMatch(new RegExp(`<span>${labels.nav.diagnosis.label}</span><span class="ui-count-badge nav-end"[^>]*></span>`));
    const none = renderToStaticMarkup(createElement(ShellFrame, frameProps()));
    expect(none).not.toContain("nav-mark-");
  });

  it("手機底部分頁列：總覽、健檢、待辦、會議、更多；可及名稱是完整頁名；「更多」面板列出商品毛利、假設試算、資料來源", () => {
    const html = renderToStaticMarkup(createElement(ShellFrame, frameProps({ panel: "products" })));
    const tabbar = html.slice(html.indexOf('<nav class="mobile-tabbar"'), html.indexOf('id="mobile-more"'));
    const tabs = [...tabbar.matchAll(/<button[^>]*>.*?<span>([^<]+)<\/span><\/button>/g)].map(match => match[1]);
    expect(tabs).toEqual([labels.shell.mobileNav.tabs.overview, labels.shell.mobileNav.tabs.diagnosis, labels.shell.mobileNav.tabs.actions, labels.shell.mobileNav.tabs.meeting, labels.shell.mobileNav.more]);
    for (const id of ["overview", "diagnosis", "actions", "meeting"] as const) expect(tabbar).toContain(`aria-label="${labels.nav[id].label}"`);
    expect(tabbar).toContain('data-active="true"');
    const more = html.slice(html.indexOf('id="mobile-more"'), html.indexOf("</nav>", html.indexOf('id="mobile-more"')));
    expect([...more.matchAll(/<span>([^<]+)<\/span>/g)].map(match => match[1])).toEqual([labels.nav.products.label, labels.nav.scenarios.label, labels.nav.data.label]);
    expect(more).toMatch(new RegExp(`aria-current="page"[^>]*>.*?<span>${labels.nav.products.label}</span>`));
  });
});

describe("V3-3 匯出選單分組（§6.5）與儲存選單三段（§6.3 #14）", () => {
  it("匯出：目前檢視 → 一頁摘要 → 決策工作稿 → 會議（V3-7 新增）→ 匯入範本（3×3 表）；17 個下載項（含資料問題 CSV 條件項）＋複製週會摘要", async () => {
    const input = fixture("errors/missing_cogs");
    const dataset = validateDataset(input).dataset!;
    const snapshot = await createSnapshot(dataset, {}, await hashInput(input));
    expect(dataset.issues.length).toBeGreaterThan(0);
    const html = renderToStaticMarkup(createElement(ExportMenu, { source: { dataset, snapshot }, busy: null, error: null, summaryRef: createRef<HTMLElement>(), onCopySummary: async () => ({ copied: true, text: "" }), onDecision: noop, onPrint: noop, onExport: noop, onMeetingNotes: noop }));
    expect(html).toMatch(new RegExp(`<summary[^>]*>${labels.shell.topbarV3.export}<svg`));
    const order = [labels.sections.downloadCurrentView, labels.sections.meetingSummary, labels.sections.downloadDecision, labels.exports.menuV3.groupMeeting, labels.downloads.templatesHeading].map(text => html.indexOf(`>${text}</p>`));
    expect(order.every(index => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const items = [labels.downloads.analysisCsv, labels.downloads.channelTableCsv, labels.downloads.manifestJson, labels.downloads.issuesCsv, labels.buttons.exportPdf, labels.buttons.exportExcel, labels.buttons.exportPptx, labels.meetingPage.menuMarkdown, labels.downloads.decisionMd, labels.downloads.decisionCsv, labels.downloads.decisionJson];
    // V3-7 C：每項是兩行選單項目，可見名稱在 .export-item-name（可及名稱 aria-labelledby 指到它，與 v2 相同）。
    for (const item of [...items, labels.overview.snapshotUi.copy]) expect(count(html, `class="export-item-name">${item}</span>`), item).toBe(1);
    const templates = section(html, "download-templates");
    for (const text of Object.values(labels.shell.topbarV3.templateColumns)) expect(templates).toContain(`<th scope="col">${text}</th>`);
    expect(count(templates, "<tr>")).toBe(4);
    for (const role of ["sales", "costs", "ads"] as const) {
      const file = labels.importWizard.files[role];
      expect(templates).toContain(`aria-label="${fill(labels.downloads.blankTemplate, { file })}"`);
      expect(templates).toContain(`aria-label="${fill(labels.downloads.exampleTemplate, { file })}"`);
    }
    expect(items.length + 6).toBe(17);
    expect(html).toContain('data-testid="download-meeting-section"');
  });

  it("沒有可看的資料時只剩匯入範本", () => {
    const html = renderToStaticMarkup(createElement(ExportMenu, { source: null, busy: null, error: null, summaryRef: createRef<HTMLElement>(), onDecision: noop, onPrint: noop, onExport: noop, onMeetingNotes: noop }));
    expect(html).toContain(labels.downloads.menuEmpty);
    expect(html).toContain('data-testid="download-templates"');
    expect(html).not.toContain(labels.downloads.analysisCsv);
  });

  it("儲存：本機保存 → 備份檔 → 危險區；清空目前資料在危險區（只有傳入 onClear 時）", () => {
    const html = renderToStaticMarkup(createElement(WorkspaceStorage, { source: null, version: 0, dirty: false, onRestore: noop, onSaved: noop, onDeleted: noop, consent: true, onConsentChange: noop, onClear: noop }));
    const groups = labels.shell.topbarV3.storageGroups;
    const at = (text: string) => html.indexOf(text);
    const heading = (text: string) => at(`>${text}</h3>`);
    const button = (text: string) => at(`>${text}</button>`);
    expect(heading(groups.local)).toBeGreaterThan(0);
    expect(heading(groups.local)).toBeLessThan(heading(groups.backup));
    expect(heading(groups.backup)).toBeLessThan(heading(groups.danger));
    for (const text of [labels.buttons.saveLocal, labels.buttons.restorePreview]) { expect(button(text), text).toBeGreaterThan(heading(groups.local)); expect(button(text), text).toBeLessThan(heading(groups.backup)); }
    expect(button(labels.buttons.downloadBackup)).toBeGreaterThan(heading(groups.backup));
    expect(button(labels.buttons.downloadBackup)).toBeLessThan(heading(groups.danger));
    for (const text of [labels.buttons.deleteLocal, labels.buttons.clear]) expect(button(text), text).toBeGreaterThan(heading(groups.danger));
    for (const id of ["workspace-storage", "autosave-toggle", "autosave-status", "local-save-announce"]) expect(html).toContain(`data-testid="${id}"`);
    expect(renderToStaticMarkup(createElement(WorkspaceStorage, { source: null, version: 0, dirty: false, onRestore: noop, onSaved: noop, onDeleted: noop, consent: false, onConsentChange: noop }))).not.toContain(labels.buttons.clear);
  });

  it("頁尾：正式站才有使用分析揭露", () => {
    expect(renderToStaticMarkup(createElement(ShellFooter, { analytics: true, onBasis: noop }))).toContain('data-testid="analytics-note"');
    expect(renderToStaticMarkup(createElement(ShellFooter, { analytics: false, onBasis: noop }))).not.toContain("analytics-note");
  });
});
