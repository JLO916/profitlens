import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import type { Diagnostic, Scope } from "@/domain/types";
import { addActionDraft, emptyActionWorkspace, setAdDecision } from "@/application/action-workspace";
import { inspectImportFile } from "@/application/import";
import { initialWizardState, runCheck, wizardReducer, type WizardState } from "@/application/import-wizard";
import { periodPresets } from "@/application/period-presets";
import { fill, labels } from "@/i18n";
import { Diagnosis } from "@/components/workspace-panels";
import { AiPanel } from "@/components/ai-panel";
import { AiCollapse } from "@/components/ai-collapse";
import { ActionsWorkbench } from "@/components/actions-workbench";
import { ImportWizard } from "@/components/import-wizard";
import { EvidenceDrawer } from "@/components/evidence-drawer";
import { channelChangeEvidence, channelEvidence } from "@/components/overview/charts/channel-section";
import { asyncNoop, bytes, load, noop, pageStates, roles, wizardFiles, type StateMarkup } from "./helpers/page-states";

/*
 * V3-3 掛載規則測試（PRD §6.4 M1／M6、§11.7）。
 * M1：搬進 popover、底部面板、`<details>`、「更多」的內容一律保持掛載——各頁狀態的 SSR markup（所有彈出層都是關著的）必須含有
 *     §6.3 #1–#23 的殼層 testid 與錨點（data-status-popover、period-custom-panel、download-menu 各項、workspace-storage 各控制、mobile-more、
 *     mobile-tabbar、ai-availability、指標定義按鈕、需要處理橫幅…），而且彈出層確實是「關著但掛載」（hidden／未帶 data-open）。
 * M6：同一個控制在 DOM 只有一個實例——每個 testid、每個 id（含 #previous-start 等日期欄位、期間列通路 select、儲存選單的 checkbox）
 *     在每個狀態只出現一次（每張卡、每個方案、每筆歷史各一份的樣板 testid 依實例數計）；兩個 nav 各一個且 aria-label 不同；
 *     桌機頂欄群組（topbar-cluster）與手機「更多」面板（mobile-more）沒有共用任何 testid；aria-controls／label for 都指到唯一的元素。
 *
 * 頁面狀態（shellPage、load、wizardFiles、pageStates、statusShells）在 V4-0a 原樣搬到 tests/helpers/page-states.tsx 並匯出（chart-lint 也用同一組）；
 * 為什麼要自己組殼層、「── V3-n／V4-n 新增頁面狀態」錨點都在那個檔。「Dashboard 的組法沒有漂移」仍由本檔最後一組測試直接讀 dashboard.tsx 原始碼檢查。
 */

/* ---------- markup 工具（renderToStaticMarkup 的輸出是良構的；只需要成對的同名標籤）。 ---------- */
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escapeAttr = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function counts(html: string, pattern: RegExp): Map<string, number> {
  const out = new Map<string, number>();
  for (const match of html.matchAll(pattern)) out.set(match[1], (out.get(match[1]) ?? 0) + 1);
  return out;
}
const testIdCounts = (html: string) => counts(html, /\sdata-testid="([^"]+)"/g);
const idCounts = (html: string) => counts(html, /\sid="([^"]+)"/g);
const occurrences = (html: string, text: string) => html.split(text).length - 1;
/** 回傳含有 `attr` 的那個元素（開始標籤到對應的結束標籤）；找不到回傳 null，有多個時回傳第一個。 */
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

/* ---------- §6.3 #1–#23 的殼層 testid／錨點 ---------- */
/** 每個有資料的頁面狀態都要掛著（不論彈出層開關）。 */
const SHELL_TESTIDS = [
  "data-status", "data-status-popover", "data-status-go-data", "data-status-import", "workspace-status", // #5 #6 #9 #11 #23
  "ai-availability", // #13
  "workspace-storage", "autosave-status", "local-save-announce", // #14 #15
  "download-menu", "download-meeting-section", "download-templates", // #16
  "topbar-more", "mobile-tabbar", "mobile-tabbar-more", "mobile-more", // #2 手機
  "nav-group-results", "nav-group-causes", "nav-group-decisions", "nav-group-data", // #2 側欄分組
  "period-bar", "period-toggle", "period-presets", "period-summary", "period-custom", "period-custom-panel", // #18 #19
  "analytics-note", // #57（頁尾）
] as const;
/** 空工作區（真正的 Dashboard SSR）：沒有資料時仍掛著的殼層。 */
const EMPTY_SHELL_TESTIDS = ["data-status", "data-status-popover", "data-status-import", "workspace-status", "ai-availability", "workspace-storage", "autosave-status", "local-save-announce", "download-menu", "download-templates", "topbar-more", "mobile-tabbar", "mobile-tabbar-more", "mobile-more", "nav-group-results", "nav-group-causes", "nav-group-decisions", "nav-group-data", "analytics-note"] as const;
/** 表單 id 與錨點（#1、#13、#18；手機底部面板與自訂期間是同一個 #period-bar-panel）。 */
const SHELL_IDS = ["main-content", "ai-availability-detail", "data-status-popover", "topbar-cluster", "mobile-more", "period-bar-panel", "period-custom-panel", "previous-start", "previous-end", "current-start", "current-end"] as const;
/**
 * 每個實例各一份的樣板容器（§6.4 M6 的例外：「每個方案、每張卡各一份的樣板 testid 依實例數計」）：
 * 試算方案欄 `scenario-{n}`、看板卡 `board-card-{n}`、清單項 `action-{n}`、敏感度的門檻區塊 `threshold-{id}`（§6.3 #38）。
 * 容器內的 testid（scenario-preset、scenario-result、threshold-pct、sensitivity-result…）在「每個容器內」各只能一次，容器外整頁只能一次。
 */
const INSTANCE_CONTAINER = /^(?:(?:scenario|board-card|action)-\d+|threshold-(?!form-|pct$)[\w-]+)$/;
/** 把 html 切成「樣板容器外」（含容器自己的開始標籤）與各容器的內容（只切最外層；巢狀容器由呼叫端遞迴）。 */
function splitInstances(html: string): { outside: string; inner: { id: string; body: string }[] } {
  let outside = "", rest = html;
  const inner: { id: string; body: string }[] = [];
  for (;;) {
    const match = [...rest.matchAll(/\sdata-testid="([^"]+)"/g)].find(found => INSTANCE_CONTAINER.test(found[1]));
    if (!match) { outside += rest; break; }
    const body = element(rest, match[0].trim())!;
    const start = rest.indexOf(body);
    const open = body.slice(0, body.indexOf(">") + 1);
    outside += rest.slice(0, start) + open;
    inner.push({ id: match[1], body: body.slice(open.length) });
    rest = rest.slice(start + body.length);
  }
  return { outside, inner };
}
/** 回傳 html 中重複的 testid（`路徑 > testid×次數`）；樣板容器的內容另外遞迴檢查。 */
function duplicateTestIds(html: string, path = ""): string[] {
  const { outside, inner } = splitInstances(html);
  const here = [...testIdCounts(outside)].filter(([, count]) => count > 1).map(([id, count]) => `${path}${id}×${count}`);
  return [...here, ...inner.flatMap(({ id, body }) => duplicateTestIds(body, `${path}${id} > `))];
}
/**
 * V4-0a M6（PRD §8.6）：`chart-` 開頭的 testid 只要出現在樣板容器（INSTANCE_CONTAINER）外，就必須恰好一次，而且容器內不得再有同名的一份
 * （G15 這類全頁唯一的圖）；只出現在容器內的（例如 G16 在每個 scenario-{n} 內各一份）依容器計，由 duplicateTestIds 檢查。
 * 圖的柱、點、段、格是葉節點，不加進 INSTANCE_CONTAINER（加了不是永遠比對不到，就是放寬本條）。回傳違規（`testid×容器外次數（全頁 n）`）。
 */
function chartTestIdViolations(html: string): string[] {
  const all = testIdCounts(html);
  return [...testIdCounts(splitInstances(html).outside)].filter(([id, count]) => id.startsWith("chart-") && (count !== 1 || all.get(id) !== 1)).map(([id, count]) => `${id}×${count}（全頁 ${all.get(id)}）`);
}

/**
 * V4-6（06_BATCHES V4-6；M6 的「每筆歷史各一份的樣板 testid 依實例數計」）：v3 的兩個列表每列一份、但列本身沒有帶編號的容器 testid——
 * 歷史清單每筆一個 <li data-testid="meeting-history-item">（內含 meeting-snapshot-note）、議程 5 每個選入方案的通路一個 meeting-scenario-result。
 * V4-6 為了掃到有圖的 G19（≥ 2 筆歷史）與 7 個通路的 G15 會議實例而新增的兩個狀態會讓它們重複；INSTANCE_CONTAINER 自 V4-0a 起不改（加了會放寬其他頁），
 * 改在這裡逐狀態列出「預期的重複」（testid×次數，次數＝列數）：下方 M6 只略過完全相符的項目，其他重複或次數不符照樣失敗；
 * chart- testid 的唯一性（chartTestIdViolations）不受影響、照常檢查；V4-6 M1 測試另外斷言這些項目確實出現（清單不會過期）。
 */
const V4_6_REPEATED_V3_ROWS: Record<string, string[]> = {
  "meeting-history-g19": ["meeting-history-item×6", "meeting-snapshot-note×6"],
  "meeting-seven-channels": ["meeting-scenario-result×7"],
};

describe("V3-3 mounted-testids（PRD §6.4 M1／M6）", () => {
  let states: StateMarkup[];
  beforeAll(async () => { states = await pageStates(); }, 60_000);
  const loaded = () => states.filter(state => state.state);

  describe("M1：搬進彈出層的殼層內容保持掛載", () => {
    it("各頁狀態都掛著 §6.3 #1–#23 的殼層 testid（彈出層全部關著）", () => {
      for (const { name, html } of loaded()) {
        const ids = testIdCounts(html);
        const missing = SHELL_TESTIDS.filter(id => !ids.has(id));
        expect(missing, `${name} 少了：${missing.join(", ")}`).toEqual([]);
        const anchors = idCounts(html);
        expect(SHELL_IDS.filter(id => !anchors.has(id)), name).toEqual([]);
      }
    });

    it("空工作區（真正的 Dashboard SSR）也掛著殼層的彈出層與兩個 nav", () => {
      const { html } = states.find(state => state.name === "shell-empty")!;
      const ids = testIdCounts(html);
      expect(EMPTY_SHELL_TESTIDS.filter(id => !ids.has(id))).toEqual([]);
      for (const id of ["main-content", "ai-availability-detail", "data-status-popover", "topbar-cluster", "mobile-more"]) expect(idCounts(html).get(id), id).toBe(1);
      expect(occurrences(html, 'class="skip-link"'), "skip-link").toBe(1);
      expect(occurrences(html, 'class="brand-mark"'), "brand-mark").toBe(1);
    });

    it("彈出層預設關著但仍在 DOM：data-status-popover、mobile-more、AI 說明用 hidden；自訂期間面板不帶 data-open；選單是收合的 <details>", () => {
      for (const { name, html } of states) {
        for (const attr of ['data-testid="data-status-popover"', 'data-testid="mobile-more"', 'id="ai-availability-detail"']) expect(openTag(html, attr), `${name} ${attr}`).toMatch(/\shidden=""/);
        for (const attr of ['data-testid="download-menu"', 'data-testid="workspace-storage"']) {
          const tag = openTag(html, attr)!;
          expect(tag, `${name} ${attr}`).toMatch(/^<details\s/);
          expect(tag, `${name} ${attr}`).not.toMatch(/\sopen=""/);
          expect(tag, `${name} ${attr}`).toContain("topbar-menu");
        }
        if (!html.includes('data-testid="period-bar"')) continue;
        expect(openTag(html, 'data-testid="period-custom-panel"'), name).not.toMatch(/data-open/);
        expect(openTag(html, 'data-testid="period-bar"'), name).not.toMatch(/data-sheet-open/);
        expect(openTag(html, 'data-testid="period-toggle"'), name).toMatch(/aria-expanded="false"/);
        expect(openTag(html, 'data-testid="period-custom"'), name).toMatch(/aria-expanded="false"/);
      }
    });

    it("關著的彈出層裡仍有完整內容：自訂期間（比較方式、4 個日期、套用）、資料狀態（前往資料來源、匯入新資料）、「更多」頁面、匯出選單各組、儲存選單三段", () => {
      for (const { name, html, state } of loaded()) {
        const custom = element(html, 'data-testid="period-custom-panel"')!;
        for (const id of ["previous-start", "previous-end", "current-start", "current-end"]) expect(custom, `${name} #${id}`).toContain(`id="${id}"`);
        expect(custom, name).toContain(`aria-label="${escapeAttr(labels.shell.periodBar.filter.comparisonMode)}"`);
        expect(custom, name).toContain('type="submit"');
        const popover = element(html, 'data-testid="data-status-popover"')!;
        for (const id of ["data-status-go-data", "data-status-import"]) expect(popover, `${name} ${id}`).toContain(`data-testid="${id}"`);
        const more = element(html, 'data-testid="mobile-more"')!;
        const moreItems = [labels.shell.nav.products.headline, labels.shell.nav.scenarios.headline, labels.shell.nav.data.headline, ...(state!.showValidation ? [labels.shell.nav.validation.headline] : [])];
        expect([...more.matchAll(/<button[^>]*class="more-item"[^>]*>.*?<span>([^<]+)<\/span><\/button>/g)].map(match => match[1]), name).toEqual(moreItems);
        const menu = element(html, 'data-testid="download-menu"')!;
        for (const id of ["download-meeting-section", "download-templates"]) expect(menu, `${name} ${id}`).toContain(`data-testid="${id}"`);
        // V3-7 C：每項是 button.ui-menu-item[data-lines="2"]，可見名稱在 .export-item-name（可及名稱以 aria-labelledby 指到它，名稱不變）。
        for (const text of [labels.exports.downloads.analysisCsv, labels.exports.downloads.channelTableCsv, labels.exports.downloads.manifestJson, labels.exports.buttons.exportPdf, labels.exports.buttons.exportExcel, labels.exports.buttons.exportPptx, labels.meeting.page.menuMarkdown, labels.exports.downloads.decisionMd, labels.exports.downloads.decisionCsv, labels.exports.downloads.decisionJson]) expect(menu, `${name} 匯出：${text}`).toContain(`class="export-item-name">${escapeAttr(text)}</span>`);
        const storage = element(html, 'data-testid="workspace-storage"')!;
        expect(storage, `${name} 清空目前資料在儲存選單的危險區`).toMatch(/storage-danger[\s\S]*clear-button/);
        for (const id of ["autosave-status", ...(state!.consent ?? true ? ["autosave-toggle"] : [])]) expect(storage, `${name} ${id}`).toContain(`data-testid="${id}"`);
        expect(occurrences(storage, 'class="storage-group'), `${name} 儲存選單三段`).toBe(3);
      }
    });

    it("需要處理橫幅只在需要時出現；出現時是期間列下方的單一插槽（篩選錯誤 role=alert、部分資料、去年同期理由）", () => {
      for (const { name, html, state } of loaded()) {
        const report = state!.active;
        const yoy = periodPresets(report.dataset.manifest, { previous: report.snapshot.report.previous.period, current: report.snapshot.report.current.period, comparison_mode: report.snapshot.report.scope.comparison_mode }).find(preset => preset.id === "yoy");
        const expectYoy = yoy?.status === "unavailable";
        const needed = !!state!.filterError || state!.status === "partial" || expectYoy;
        const ids = testIdCounts(html);
        expect(ids.get("needs-attention") ?? 0, name).toBe(needed ? 1 : 0);
        expect(ids.get("banner-filter-error") ?? 0, name).toBe(state!.filterError ? 1 : 0);
        expect(ids.get("banner-partial") ?? 0, name).toBe(state!.status === "partial" ? 1 : 0);
        expect(ids.get("preset-reason-visible-yoy") ?? 0, name).toBe(expectYoy ? 1 : 0);
        if (state!.filterError) expect(openTag(html, 'data-testid="banner-filter-error"'), name).toContain('role="alert"');
        if (needed) expect(html.indexOf('data-testid="needs-attention"'), `${name} 橫幅在期間列之後`).toBeGreaterThan(html.indexOf('data-testid="period-bar"'));
      }
      // 至少有一個狀態真的走到每一種橫幅（避免條件全部沒觸發而空過）。
      const all = loaded().map(({ html }) => testIdCounts(html));
      for (const id of ["needs-attention", "banner-filter-error", "banner-partial", "preset-reason-visible-yoy"]) expect(all.some(ids => ids.has(id)), id).toBe(true);
    });

    it("頁首「匯入資料」（page-import）只在資料來源頁；其他頁由資料狀態 popover 的「匯入新資料」進入（§6.3 #23）", () => {
      for (const { name, html, state } of loaded()) expect(testIdCounts(html).get("page-import") ?? 0, name).toBe(state!.panel === "data" ? 1 : 0);
      expect(testIdCounts(states.find(state => state.name === "shell-empty")!.html).get("page-import") ?? 0).toBe(0);
    });

    it("V3-4a 總覽：進階 <details> 收合時期間合計與日均仍掛著；會議入口在本期一句話區塊內、只有一個", () => {
      const { html } = states.find(state => state.name === "overview")!;
      const advanced = element(html, 'data-testid="overview-advanced"')!;
      expect(openTag(html, 'data-testid="overview-advanced"')).toMatch(/^<details\s/);
      expect(openTag(html, 'data-testid="overview-advanced"')).not.toMatch(/\sopen=""/);
      expect(advanced).toContain('data-testid="period-comparison"');
      expect(advanced).toContain('id="daily-average-title"');
      expect(element(html, 'data-testid="weekly-snapshot"')).toContain('data-testid="overview-meeting-entry"');
      for (const id of ["weekly-snapshot", "snapshot-sentence", "copy-summary", "copy-summary-status", "overview-meeting-entry", "kpi-band", "assist-kpis", "overview-advanced", "period-comparison"]) expect(testIdCounts(html).get(id), id).toBe(1);
    });

    it("V3-5 通路健檢：健檢結果在前、各通路兩期比較在後、AI 區最後；AI 區收合（<details data-testid=ai-collapsed>）時 ai-panel 與 ai-* testid 仍掛著，summary 只有文字", () => {
      const { html } = states.find(state => state.name === "diagnosis")!;
      const order = ['data-testid="diagnosis-panel"', 'data-testid="channel-compare"', 'data-testid="ai-collapsed"'].map(attr => html.indexOf(attr));
      expect(order.every(index => index > -1)).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      const tag = openTag(html, 'data-testid="ai-collapsed"')!;
      expect(tag).toMatch(/^<details\s/);
      expect(tag).not.toMatch(/\sopen=""/);
      const collapsed = element(html, 'data-testid="ai-collapsed"')!;
      const summary = collapsed.slice(collapsed.indexOf("<summary"), collapsed.indexOf("</summary>") + "</summary>".length);
      expect(summary).not.toMatch(/<button|<a\s|<input|<select|<details|tabindex/i);
      const copy = labels.diagnosis.aiCollapse;
      expect(summary.replace(/<[^>]*>/g, "")).toBe(`${fill(copy.summary, { status: copy.status.off })}${copy.publicNote}`);
      // 公開示範站（能力不可用）時 SSR 會出現的 ai-* testid 全部在收合的 details 裡（與 testid 基準的 diagnosis-ai 情境同一組）。
      for (const id of ["ai-panel", "ai-mode", "ai-status"]) {
        expect(collapsed, id).toContain(`data-testid="${id}"`);
        expect(testIdCounts(html).get(id), id).toBe(1);
      }
      // 每一列健檢的 id 唯一，通路寬表備註欄的同頁連結都指到存在的列。
      const anchors = idCounts(html);
      const links = [...html.matchAll(/\shref="#(diagnosis-row-[A-Z_]+)"/g)].map(match => match[1]);
      expect(links.length).toBeGreaterThan(0);
      for (const id of links) expect(anchors.get(id), id).toBe(1);
    });

    it("V3-5 AI 可用時（需先預覽並同意）：預覽、進階、payload、request、對照等 ai-* testid 也都在收合的 details 裡；summary 不寫公開示範站", async () => {
      const { snapshot } = await load("demo", "demo");
      const capability = { available: true, reason: "AVAILABLE", provider: "openai" as const };
      const html = renderToStaticMarkup(<AiCollapse capability={capability}><AiPanel capability={capability} snapshot={snapshot} revision={1} onEvidence={noop} /></AiCollapse>);
      const collapsed = element(html, 'data-testid="ai-collapsed"')!;
      expect(openTag(html, 'data-testid="ai-collapsed"')).not.toMatch(/\sopen=""/);
      for (const id of ["ai-panel", "ai-mode", "ai-status", "ai-readable-preview", "ai-facts-preview", "ai-advanced", "ai-payload-preview", "ai-request-preview", "ai-local-mapping"]) expect(collapsed, id).toContain(`data-testid="${id}"`);
      const copy = labels.diagnosis.aiCollapse;
      const summary = collapsed.slice(collapsed.indexOf("<summary"), collapsed.indexOf("</summary>"));
      expect(summary.replace(/<[^>]*>/g, "")).toBe(fill(copy.summary, { status: copy.status.needsConsent }));
      expect(html).not.toContain(copy.publicNote);
    });

    it("V3-5 健檢列範圍超過 4 個：其餘 chips 收進「更多範圍」popover，<details> 收合時仍掛著，而且仍是同一組 role=group 的範圍切換", async () => {
      const golden = await load("golden", "golden");
      const scope = (index: number): Scope => ({ kind: "sku", channels: ["DTC"], sku: `S${String(index).padStart(2, "0")}` });
      const diagnostics: Diagnostic[] = Array.from({ length: 9 }, (_, index) => ({ id: `sku-${index}`, code: "SKU_NEGATIVE_GP", scope: scope(index), title: "", fact_ids: [], hypothesis: "", recommendation: "", limitations: [], ranking_amount: { value: `-${index + 1}.00`, reason_codes: [] } }));
      const snapshot = { ...golden.snapshot, report: { ...golden.snapshot.report, diagnostics } };
      const html = renderToStaticMarkup(<Diagnosis snapshot={snapshot} onEvidence={noop} onCreateAction={noop} />);
      const row = element(html, 'data-testid="diagnosis-row-SKU_NEGATIVE_GP"')!;
      const more = element(row, 'class="scope-more ui-popover-host"')!;
      expect(more).toMatch(/^<details\s/);
      expect(more.slice(0, more.indexOf(">") + 1)).not.toMatch(/\sopen=""/);
      expect(more).toContain(`>${fill(labels.diagnosis.listV3.moreScopes, { n: 5 })}</summary>`);
      expect(more.match(/class="scope-chip" aria-pressed=/g)).toHaveLength(5);
      expect(row.match(/class="scope-chip" aria-pressed=/g)).toHaveLength(9);
      expect(occurrences(row, `role="group" aria-label="${escapeAttr(labels.diagnosis.list.scopeSwitch)}"`)).toBe(2);
      const duplicates = [...idCounts(html)].filter(([, count]) => count > 1);
      expect(duplicates).toEqual([]);
    });

    it("開發者分組只在 #validation 時出現（§6.3 #3）", () => {
      for (const { name, html, state } of loaded()) expect(testIdCounts(html).get("nav-group-developer") ?? 0, name).toBe(state!.showValidation ? 1 : 0);
    });

    it("匯入精靈步驟 1 與資料來源頁同時掛著，期間列與殼層不重複", () => {
      const { html } = states.find(state => state.name === "import-step-1")!;
      const ids = testIdCounts(html);
      for (const id of ["import-wizard", "import-stepper", "import-step-1", "page-import", "period-bar"]) expect(ids.get(id), id).toBe(1);
    });

    // ── V3-6 A（假設試算）的 M1 掛載測試在此之後新增（範本 ? popover 的 scenario-preset-purpose／scenario-template-note、範圍提示 hidden 掛載、匯出選單）──
    it("V3-6 假設試算：範本 ? 說明（用途、只是起點）與範圍提示 hidden 掛載；匯出本頁三項在收合的 details 內；每個方案欄內各一份", () => {
      for (const name of ["scenarios", "scenarios-first-visit"]) {
        const { html } = states.find(state => state.name === name)!;
        const plans = [...html.matchAll(/\sdata-testid="(scenario-\d+)"/g)].map(match => match[1]);
        expect(plans.length, name).toBe(name === "scenarios" ? 2 : 1);
        for (const plan of plans) {
          const column = element(html, `data-testid="${plan}"`)!;
          const ids = testIdCounts(column);
          for (const id of ["scenario-preset", "scenario-preset-apply", "scenario-preset-purpose", "scenario-template-note", "scenario-range-volume_change_pct", "scenario-range-one_time_cost", "scenario-equivalent-volume_change_pct", "scenario-absolute-error-volume_change_pct", "scenario-mode-volume_change_pct", "scenario-result"]) expect(ids.get(id), `${name} ${plan} ${id}`).toBe(1);
          // 範本說明在 ? popover（role=region、hidden）內；觸發器的 aria-controls 指到它。
          const help = element(column, 'class="ui-popover ui-help-content scenario-help-panel"')!;
          expect(help, `${name} ${plan}`).toMatch(/^<div id="[^"]+" role="region"[^>]*\shidden=""/);
          for (const id of ["scenario-preset-purpose", "scenario-template-note"]) expect(help, `${name} ${plan} ${id}`).toContain(`data-testid="${id}"`);
          const helpId = /^<div id="([^"]+)"/.exec(help)![1];
          expect(column, `${name} ${plan}`).toContain(`aria-expanded="false" aria-controls="${helpId}"`);
          expect(idCounts(html).get(helpId), helpId).toBe(1);
        }
        // 範圍提示沒有超出時 hidden（方案 1 都在範圍內）；第 2 個方案銷量 250% 超出，提示看得到。
        expect(openTag(element(html, 'data-testid="scenario-1"')!, 'data-testid="scenario-range-volume_change_pct"'), name).toMatch(/\shidden=""/);
        if (name === "scenarios") expect(openTag(element(html, 'data-testid="scenario-2"')!, 'data-testid="scenario-range-volume_change_pct"')).not.toMatch(/\shidden=""/);
        // 頁首「匯出本頁」：SSR 時在工作台頂端；收合的 details（auto-close），三項各一份。
        const menuTag = openTag(html, 'data-testid="scenario-export-menu"')!;
        expect(menuTag, name).toMatch(/^<details class="topbar-menu auto-close export-page/);
        expect(menuTag, name).not.toMatch(/\sopen=""/);
        const menu = element(html, 'data-testid="scenario-export-menu"')!;
        for (const id of ["export-page-scenarios", "scenario-export-md", "scenario-export-csv", "scenario-export-json"]) {
          expect(menu, `${name} ${id}`).toContain(`data-testid="${id}"`);
          expect(testIdCounts(html).get(id), `${name} ${id}`).toBe(1);
        }
        // 試算通路的 ? 說明也是 hidden 掛載；試算通路 select 只有一份。
        expect(testIdCounts(html).get("scenario-channel"), name).toBe(1);
        expect(occurrences(html, `aria-label="${escapeAttr(labels.scenarios.pageV3.channelHelpAria)}" aria-expanded="false"`), name).toBe(1);
      }
      // 其他頁也掛著試算工作台（hidden 切換）：試算通路 select 與頁首插槽各只有一份。
      for (const { name, html } of loaded()) {
        expect(testIdCounts(html).get("scenario-channel") ?? 0, name).toBe(1);
        expect(testIdCounts(html).get("page-actions"), name).toBe(1);
      }
    });


    // ── V3-6 B（待辦）的 M1 掛載測試在此之後新增（頁首 ? 說明、匯出選單 actions-export-*、看板卡「移到」列）──
    it("V3-6 B 待辦：頁首 ? 說明 hidden 掛載；匯出本頁三項在收合的 <details> 內；SSR 時頁首節點 inline 一份、頁首插槽是空的", () => {
      for (const name of ["actions", "actions-list", "actions-empty"]) {
        const { html } = states.find(state => state.name === name)!;
        const ids = testIdCounts(html);
        for (const id of ["actions-workbench", "actions-count", "actions-help", "actions-export-menu", "export-page-actions", "actions-export-md", "actions-export-csv", "actions-export-json"]) expect(ids.get(id), `${name} ${id}`).toBe(1);
        // 「新增待辦」全頁唯一：有待辦時在頁首（actions-add），空狀態時只在空狀態區（actions-empty-add）。
        expect(ids.get("actions-add"), `${name} actions-add`).toBe(name === "actions-empty" ? undefined : 1);
        expect(ids.get("actions-empty-add"), `${name} actions-empty-add`).toBe(name === "actions-empty" ? 1 : undefined);
        expect(openTag(html, 'data-testid="actions-help"'), name).toMatch(/\shidden=""/);
        expect(openTag(html, `aria-controls="actions-help-panel"`), name).toMatch(/aria-expanded="false"/);
        const menu = openTag(html, 'data-testid="actions-export-menu"')!;
        expect(menu, name).toMatch(/^<details\s/);
        expect(menu, name).not.toMatch(/\sopen=""/);
        expect(menu, name).toContain("topbar-menu auto-close export-page");
        const body = element(html, 'data-testid="actions-export-menu"')!;
        for (const format of ["md", "csv", "json"]) expect(body, `${name} actions-export-${format}`).toContain(`data-testid="actions-export-${format}"`);
        const inline = element(html, 'class="actions-page-head-inline"')!;
        for (const id of ["actions-count", "actions-help", "actions-export-menu", ...(name === "actions-empty" ? [] : ["actions-add"])]) expect(inline, `${name} ${id} inline`).toContain(`data-testid="${id}"`);
        expect(element(html, 'id="page-actions"'), name).toBe('<div class="page-actions" id="page-actions" data-testid="page-actions"></div>');
        expect(element(html, 'id="page-title-addon"'), name).toBe('<div class="page-title-addon" id="page-title-addon" data-testid="page-title-addon"></div>');
        // 試算工作台每頁都掛著（hidden），所以只數待辦工作台內的主要按鈕；清單檢視的內嵌編輯器自成一個容器（C12 每個容器最多 1 顆），不在此計。
        if (name !== "actions-list") expect(occurrences(element(html, 'data-testid="actions-workbench"')!, "ui-btn-primary"), `${name} 待辦頁唯一主要按鈕`).toBe(1);
      }
    });

    it("V3-6 B 待辦看板：每張卡的「移到」三個文字按鈕與「編輯」各一份、可及名稱是「移到{狀態}」；看板不渲染 action-{n}；清單不渲染看板；空狀態不渲染看板（工具列仍在）", () => {
      const { html } = states.find(state => state.name === "actions")!;
      const ids = testIdCounts(html);
      const moves: Record<string, string[]> = { "board-card-1": ["not_started", "blocked", "completed"], "board-card-2": ["in_progress", "blocked", "completed"] };
      const statusName: Record<string, string> = { not_started: labels.actions.form.statuses.not_started, in_progress: labels.actions.form.statuses.in_progress, blocked: labels.actions.form.statuses.blocked, completed: labels.actions.form.statuses.done };
      for (const [card, statuses] of Object.entries(moves)) {
        const body = element(html, `data-testid="${card}"`)!;
        for (const status of statuses) {
          expect(ids.get(`${card}-move-${status}`), `${card}-move-${status}`).toBe(1);
          expect(openTag(body, `data-testid="${card}-move-${status}"`), status).toContain(`aria-label="${escapeAttr(fill(labels.actions.board.moveTo, { status: statusName[status] }))}"`);
        }
        expect(ids.get(`${card}-edit`), `${card}-edit`).toBe(1);
        expect(body, card).not.toMatch(/<details|<dl/);
      }
      for (const id of ["actions-toolbar", "actions-view-board", "actions-view-list", "action-board", "board-column-not_started", "board-column-in_progress", "board-column-blocked", "board-column-completed"]) expect(ids.get(id), id).toBe(1);
      expect([...ids.keys()].filter(id => /^action-\d+$/.test(id)), "看板不渲染 action-{n}").toEqual([]);
      expect(ids.has("evidence-checklist")).toBe(false);
      expect(ids.has("action-drawer"), "抽屜是條件渲染的 dialog（同 v2）").toBe(false);
      const list = testIdCounts(states.find(state => state.name === "actions-list")!.html);
      for (const id of ["action-1", "action-2", "actions-view-list"]) expect(list.get(id), `actions-list ${id}`).toBe(1);
      expect([...list.keys()].filter(id => /^(?:board-card-|board-column-|action-board$)/.test(id)), "清單不渲染看板").toEqual([]);
      const empty = testIdCounts(states.find(state => state.name === "actions-empty")!.html);
      // 空狀態：工具列仍在（可先選檢視，同 v2），看板與「新增待辦」頁首鈕不渲染。
      for (const id of ["actions-empty", "actions-empty-add", "actions-toolbar", "actions-view-board", "actions-view-list"]) expect(empty.get(id), `actions-empty ${id}`).toBe(1);
      for (const id of ["action-board", "actions-add"]) expect(empty.has(id), `actions-empty ${id}`).toBe(false);
    });


    // ── V3-6 C（待辦編輯抽屜）的 M1 掛載測試在此之後新增（清單檢視的內嵌編輯器三段仍常駐；抽屜是條件渲染的 dialog，同 v2）──
    it("V3-6 C：看板狀態沒有 action-{n}、evidence-checklist 與待辦編輯抽屜（抽屜是條件渲染的 dialog，同 v2；看板與清單不同時渲染）", () => {
      const { html } = states.find(state => state.name === "actions")!;
      const ids = testIdCounts(html);
      expect([...ids.keys()].filter(id => /^action-\d+$/.test(id))).toEqual([]);
      for (const id of ["evidence-checklist", "action-drawer", "action-drawer-close", "action-drawer-remove"]) expect(ids.get(id) ?? 0, id).toBe(0);
      expect(html).not.toContain('<dialog class="action-drawer"');
      for (const id of ["board-card-1", "board-card-2"]) expect(ids.get(id), id).toBe(1);
    });

    it("V3-6 C：清單檢視每個 action-{n} 內嵌同一個編輯器的三段（內容／引用的數字／歷史），evidence-checklist 各一份；收合的限制與技術細節仍掛著；id 不重複", async () => {
      const golden = await load("golden", "golden");
      const diagnostic = golden.snapshot.report.diagnostics.find(row => row.code === "REV_UP_CM_DOWN" && row.scope.kind === "all")!;
      const workspace = addActionDraft(addActionDraft(emptyActionWorkspace(), golden, "a1", diagnostic.id), golden, "a2");
      const html = renderToStaticMarkup(<ActionsWorkbench workspace={workspace} onChange={noop} source={golden} onEvidence={noop} onExport={noop} view="list" onViewChange={noop} />);
      const copy = labels.actions.drawerV3;
      for (const n of [1, 2]) {
        const item = element(html, `data-testid="action-${n}"`)!;
        const regions = [copy.content, copy.evidence, copy.history].map(name => element(item, `role="region" aria-label="${escapeAttr(name)}"`));
        expect(regions.every(Boolean), `action-${n}`).toBe(true);
        expect(regions.map(region => item.indexOf(region!)), `action-${n}`).toEqual([...regions.map(region => item.indexOf(region!))].sort((a, b) => a - b));
        expect(testIdCounts(item).get("evidence-checklist"), `action-${n}`).toBe(1);
        expect(regions[1], `action-${n}`).toContain('data-testid="evidence-checklist"');
        expect(regions[2], `action-${n}`).toContain(`<summary>${labels.evidence.sections.technicalDetails}</summary>`);
        for (const region of regions) expect(region, `action-${n}`).not.toMatch(/<details[^>]*\sopen=""/);
      }
      expect(element(html, `data-testid="action-1"`)).toContain(`<summary>${labels.actions.workbench.limitations}</summary>`);
      expect(testIdCounts(html).get("action-drawer") ?? 0).toBe(0);
      expect([...idCounts(html)].filter(([, count]) => count > 1)).toEqual([]);
      expect(duplicateTestIds(html)).toEqual([]);
    });

    // ── V3-7 A（會議紀錄頁）的 M1 掛載測試在此之後新增（頁首「匯出會議」下拉五項在收合 details 內、議程目錄 <ol>、與上次會議比較 details、歷史在最底）──
    it("V3-7 A：會議紀錄頁的「匯出會議」五項在收合的 details 內、議程目錄 6 個連結各一份、與上次會議比較收合、門檻表單收合、歷史在最底", () => {
      const pageV3 = labels.meeting.pageV3;
      for (const name of ["meeting", "meeting-v2-record"]) {
        const html = states.find(state => state.name === name)!.html;
        // 頁首動作列（review-workbench）只有一份；「匯出會議」是收合的 <details class="topbar-menu auto-close">，五項保持掛載、各一份。
        expect(testIdCounts(html).get("review-workbench"), name).toBe(1);
        const menuTag = openTag(html, 'data-testid="meeting-outputs"')!;
        expect(menuTag, name).toMatch(/^<details\s/);
        expect(menuTag, name).not.toMatch(/\sopen=""/);
        expect(menuTag, name).toContain("topbar-menu auto-close");
        const menu = element(html, 'data-testid="meeting-outputs"')!;
        expect(openTag(menu, 'data-testid="export-page-meeting"'), name).toMatch(/^<summary\s/);
        for (const id of ["meeting-export-pdf", "meeting-export-markdown", "meeting-export-csv", "meeting-export-excel", "meeting-export-pptx"]) {
          expect(menu, `${name} ${id}`).toContain(`data-testid="${id}"`);
          expect(testIdCounts(html).get(id), `${name} ${id}`).toBe(1);
        }
        // 議程目錄：nav（議程目錄）> ol，6 個錨點連結各一份、每個目標 id 各一份；SSR 沒有 aria-current。
        const toc = element(html, `aria-label="${escapeAttr(pageV3.tocAria)}"`)!;
        expect(toc, name).toMatch(/^<nav class="meeting-toc"[^>]*><ol>/);
        expect(toc, name).not.toContain("aria-current");
        for (let n = 1; n <= 6; n++) {
          expect(occurrences(html, `href="#meeting-agenda-${n}"`), `${name} 連結 ${n}`).toBe(1);
          expect(idCounts(html).get(`meeting-agenda-${n}`), `${name} #meeting-agenda-${n}`).toBe(1);
          expect(testIdCounts(html).get(`meeting-agenda-${n}`), `${name} meeting-agenda-${n}`).toBe(1);
        }
        // 議程是 <ol>；議程 2 的門檻表單在收合的「調整門檻」details 內；與上次會議比較是收合的 details。
        expect(openTag(html, 'class="meeting-agenda-list"'), name).toMatch(/^<ol\s/);
        expect(openTag(html, 'class="meeting-threshold"'), name).toBe('<details class="meeting-threshold">');
        expect(element(html, 'class="meeting-threshold"'), name).toContain('data-testid="threshold-form-meeting"');
        expect(openTag(html, 'data-testid="meeting-compare"'), name).toBe('<details class="meeting-compare" data-testid="meeting-compare">');
        // 會議歷史在最底：比較之後，而且只有一份。
        expect(html.indexOf('data-testid="meeting-history"'), name).toBeGreaterThan(html.indexOf('data-testid="meeting-compare"'));
        expect(testIdCounts(html).get("meeting-history"), name).toBe(1);
      }
      const v2 = element(states.find(state => state.name === "meeting-v2-record")!.html, 'data-testid="meeting-history-item"')!;
      expect(testIdCounts(v2).get("meeting-snapshot-note")).toBe(1);
      expect(testIdCounts(v2).get("meeting-v2-note")).toBe(1);
      expect(v2).toContain(escapeAttr(pageV3.v2Note));
    });



    // ── V3-7 C（頂欄匯出選單）的 M1 掛載測試在此之後新增（分組與每項說明、會議分組「複製週會摘要」、3×3 範本表）──
    it("V3-7 C：各頁狀態的頂欄匯出選單仍是收合的 details，五個分組依序（目前檢視、一頁摘要、決策工作稿、會議、匯入範本）與每一項都掛在裡面；每項名稱與說明的 id 都在選單內", () => {
      const groups = ["download-group-current", "download-group-summary", "download-group-decision", "download-group-meeting", "download-group-templates"];
      for (const { name, html, state } of loaded()) {
        const menu = element(html, 'data-testid="download-menu"')!;
        expect(openTag(html, 'data-testid="download-menu"'), name).not.toMatch(/\sopen=""/);
        const at = groups.map(id => menu.indexOf(`data-testid="${id}"`));
        expect(at.every(index => index >= 0), `${name} 五個分組`).toBe(true);
        expect([...at].sort((a, b) => a - b), `${name} 分組順序`).toEqual(at);
        const names = (id: string) => [...element(menu, `data-testid="${id}"`)!.matchAll(/class="export-item-name">([^<]+)<\/span>/g)].map(match => match[1]);
        expect(names("download-group-current"), name).toEqual([labels.exports.downloads.analysisCsv, labels.exports.downloads.channelTableCsv, labels.exports.downloads.manifestJson, ...(state!.active.dataset.issues.length > 0 ? [labels.exports.downloads.issuesCsv] : [])].map(escapeAttr));
        expect(names("download-group-summary"), name).toEqual([labels.exports.buttons.exportPdf, labels.exports.buttons.exportExcel, labels.exports.buttons.exportPptx, labels.meeting.page.menuMarkdown].map(escapeAttr));
        expect(names("download-group-decision"), name).toEqual([labels.exports.downloads.decisionMd, labels.exports.downloads.decisionCsv, labels.exports.downloads.decisionJson].map(escapeAttr));
        expect(names("download-group-meeting"), name).toEqual([escapeAttr(labels.overview.snapshotUi.copy)]);
        expect(element(menu, 'data-testid="download-group-summary"'), name).toContain('data-testid="download-meeting-section"');
        const meeting = element(menu, 'data-testid="download-group-meeting"')!;
        for (const id of ["download-copy-summary", "download-copy-summary-status"]) expect(meeting, `${name} ${id}`).toContain(`data-testid="${id}"`);
        const templates = element(menu, 'data-testid="download-group-templates"')!;
        expect(templates, name).toContain('data-testid="download-templates"');
        expect(occurrences(templates, "<tr>"), `${name} 3×3 範本表（含表頭列）`).toBe(4);
        const ids = idCounts(menu);
        for (const button of menu.matchAll(/<button[^>]*class="ui-menu-item export-item"[^>]*>/g)) {
          const refs = [/aria-labelledby="([^"]+)"/.exec(button[0])![1], ...(/aria-describedby="([^"]+)"/.exec(button[0])![1].split(/\s+/))];
          for (const ref of refs) expect(ids.get(ref), `${name} ${ref}`).toBe(1);
        }
        for (const text of [labels.exports.downloads.menuNote, labels.meeting.page.menuViewNote]) expect(menu, `${name} v2 說明已拿掉`).not.toContain(escapeAttr(text));
      }
    });

    it("V3-7 C：空工作區（真正的 Dashboard SSR）的匯出選單只有匯入範本分組與一句 menuEmpty", () => {
      const { html } = states.find(state => state.name === "shell-empty")!;
      const menu = element(html, 'data-testid="download-menu"')!;
      for (const id of ["download-group-templates", "download-templates"]) expect(testIdCounts(menu).get(id), id).toBe(1);
      for (const id of ["download-group-current", "download-group-summary", "download-group-decision", "download-group-meeting", "download-meeting-section", "download-copy-summary"]) expect(testIdCounts(menu).has(id), id).toBe(false);
      expect(menu).toContain(escapeAttr(labels.exports.downloads.menuEmpty));
    });

    // ── V3-8 A（資料來源頁）的 M1 掛載測試在此之後新增（問題表在第二段、版本與來源資訊 details、來源預覽三個 details、範本 3×3）──
    it("V3-8 A：資料來源頁依 §7.7.1 排序（資料狀態一行 → 資料問題 → … → 範本下載）；來源預覽三個 details 與版本與來源資訊 details 收合但內容掛載；範本 3×3 與頂欄 download-templates 各一份", () => {
      const sections = ["data-status-line", "data-issues", "data-scope", "data-preprocessing", "data-optional", "data-preview", "data-version-info", "data-templates"];
      for (const name of ["data", "data-partial", "data-with-issues"]) {
        const { html, state } = states.find(entry => entry.name === name)!;
        const view = element(html, 'class="view-content"')!;
        const order = sections.map(id => view.indexOf(`data-testid="${id}"`));
        expect(order.every(index => index >= 0), `${name} ${order.join()}`).toBe(true);
        expect([...order].sort((a, b) => a - b), name).toEqual(order);
        for (const id of [...sections, "targets-entry", "events-entry"]) expect(testIdCounts(html).get(id), `${name} ${id}`).toBe(1);
        // 版本與來源資訊：收合的 details（L3），資料版本與指標版本（snapshot.metric_version）都在裡面。
        expect(openTag(view, 'data-testid="data-version-info"'), name).toBe('<details class="panel data-section data-version" data-testid="data-version-info">');
        const version = element(view, 'data-testid="data-version-info"')!;
        expect(version, name).toContain(state!.active.snapshot.dataset_hash);
        expect(version, name).toContain(state!.active.snapshot.metric_version);
        // 來源檔案預覽：三個收合的 details，前 10 列表格（caption、region）保持掛載。
        for (const role of ["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"]) {
          expect(openTag(view, `data-testid="data-preview-${role}"`), `${name} ${role}`).toBe(`<details class="data-preview-file" data-testid="data-preview-${role}">`);
          expect(element(view, `data-testid="data-preview-${role}"`), `${name} ${role}`).toContain(escapeAttr(fill(labels.data.panel.previewCaption, { fileName: role })));
        }
        // 範本下載：資料來源頁一份 3×3（含表頭 4 列），頂欄匯出選單的 download-templates 仍只有一份（M6：兩處是不同容器，沒有共用 testid）。
        const templates = element(view, 'data-testid="data-templates"')!;
        expect(occurrences(templates, "<tr>"), `${name} 3×3`).toBe(4);
        expect(testIdCounts(html).get("download-templates"), name).toBe(1);
        expect(element(html, 'data-testid="download-menu"'), name).not.toContain('data-testid="data-templates"');
      }
    });

    it("V3-8 A：有問題的資料集——問題表在第二段（資料狀態一行之後、範圍之前），六欄、原因碼欄 hidden 但掛載；工具列的下載鈕只有一份", () => {
      for (const name of ["data-partial", "data-with-issues"]) {
        const { html, state } = states.find(entry => entry.name === name)!;
        const issues = element(html, 'data-testid="data-issues"')!;
        expect(html.indexOf('data-testid="data-status-line"'), name).toBeLessThan(html.indexOf('data-testid="data-issues"'));
        expect(html.indexOf('data-testid="data-issues"'), name).toBeLessThan(html.indexOf('data-testid="data-scope"'));
        expect(occurrences(issues, '<th scope="col"'), name).toBe(6);
        expect(issues, name).toContain(`<th scope="col" class="issue-code" hidden="">${escapeAttr(labels.data.pageV3.issueTable.columns.code)}</th>`);
        for (const issue of state!.active.dataset.issues) expect(issues, `${name} ${issue.reason_code}`).toContain(`<code>${issue.reason_code}</code>`);
        expect(occurrences(issues, '<td class="issue-code" hidden="">'), name).toBe(state!.active.dataset.issues.length);
        expect(testIdCounts(html).get("data-issues-download"), name).toBe(1);
        // aria-controls（顯示原因碼）指到唯一的表格 id。
        const controls = /class="ui-btn ui-btn-text issue-codes-toggle" aria-pressed="false" aria-controls="([^"]+)"/.exec(issues)![1];
        expect(idCounts(html).get(controls), name).toBe(1);
      }
      const uploaded = element(states.find(entry => entry.name === "data-with-issues")!.html, 'data-testid="data-issues"')!;
      expect(uploaded).toContain('<span class="ui-mono">=uploaded-sales.csv</span>');
      expect(testIdCounts(states.find(entry => entry.name === "data")!.html).get("data-issues-download") ?? 0).toBe(0);
    });


    // ── V3-8 B（匯入精靈）的 M1 掛載測試在此之後新增（stepper、步驟 2 收合的已對照欄、步驟 3 收合的換算欄位、匯入中頁面內容 hidden 仍掛載）──
    // shellPage() 的 <ImportWizard> 不帶起始狀態（那一行在錨點外），所以第 2–4 步用 initialState 渲染精靈，再換進 import-step-1 整頁的精靈位置，整頁一起檢查 M1／M6。
    it("V3-8 B 匯入精靈：第 1–4 步嵌在匯入中的資料來源頁，每個 testid／id 只有一份；取消匯入與套用各一份；收合的範本、已對照欄、? 說明、換算欄位、比較期間與通路都掛載", () => {
      const base = states.find(state => state.name === "import-step-1")!.html;
      const wizardHtml = element(base, 'data-testid="import-wizard"')!;
      const alternativeDir = resolve("tests/fixtures/alternative");
      const renamed = readFileSync(resolve(alternativeDir, "sales_daily.csv"), "utf8").trimEnd().split(/\r?\n/).map((line, index) => index === 0 ? line.replace("gross_sales", "revenue") + ",private_note" : line + ",X").join("\n") + "\n";
      let mapping = initialWizardState();
      for (const role of roles) {
        const content = role === "sales_daily.csv" ? bytes(renamed) : new Uint8Array(readFileSync(resolve(alternativeDir, role)));
        mapping = wizardReducer(mapping, { type: "fileRead", role, draft: inspectImportFile(role, { name: role, size: content.byteLength, bytes: content }), encoding: "utf8", memory: null });
      }
      mapping = wizardReducer(mapping, { type: "next" });
      const basis = wizardReducer(wizardReducer(wizardFiles(alternativeDir), { type: "next" }), { type: "basis", basis: "inclusive" });
      const confirmed = wizardReducer(basis, { type: "confirm" });
      const checked = wizardReducer(confirmed, { type: "checked", candidate: runCheck(confirmed) });
      expect([mapping.step, basis.step, checked.step]).toEqual([2, 3, 4]);
      const page = (wizard: WizardState) => base.replace(wizardHtml, renderToStaticMarkup(createElement(ImportWizard, { onCommit: asyncNoop, onCancel: noop, busy: false, localSaveConsented: false, initialState: wizard })));
      const pages: Record<string, string> = { "import-step-1": base, "import-step-2": page(mapping), "import-step-3": page(basis), "import-step-4": page(checked) };
      for (const [name, html] of Object.entries(pages)) {
        expect(duplicateTestIds(html), name).toEqual([]);
        expect([...idCounts(html)].filter(([, count]) => count > 1), name).toEqual([]);
        const ids = testIdCounts(html);
        for (const id of ["import-wizard", "import-stepper", name, "page-import", "period-bar"]) expect(ids.get(id), `${name} ${id}`).toBe(1);
        expect(SHELL_TESTIDS.filter(id => !ids.has(id)), name).toEqual([]);
        expect(occurrences(html, `>${labels.importWizard.cancel}</button>`), `${name} 取消匯入`).toBe(1);
        expect(ids.get("import-commit") ?? 0, `${name} 套用`).toBe(name === "import-step-4" ? 1 : 0);
        const wizard = element(html, 'data-testid="import-wizard"')!;
        for (const match of wizard.matchAll(/aria-controls="([^"]+)"/g)) expect(idCounts(wizard).get(match[1]), `${name} aria-controls ${match[1]}`).toBe(1);
        // 版頭 h2 只寫步驟名（§7.7.2），一頁一個 h1 由 PageHeader 提供。
        expect(element(wizard, 'id="import-heading"'), name).not.toContain("｜");
      }
      // 第 1 步：範本 3×3、欄位說明、進階設定檔收在關著的 <details>，內容掛載。
      const step1 = element(pages["import-step-1"], 'data-testid="import-step-1"')!;
      const step1Details = [...step1.matchAll(/<details class="wizard-details">/g)];
      expect(step1Details).toHaveLength(3);
      expect(step1).toContain('<table class="template-table">');
      expect(step1).toContain(`aria-label="${escapeAttr(labels.importWizard.manifestLabel)}"`);
      // 第 2 步：已對照的 9 欄收在關著的 details 內（select 掛載）；? 說明 hidden 掛載。
      const sales = element(pages["import-step-2"], 'data-testid="import-mapping-sales_daily.csv"')!;
      const done = element(sales, 'class="wizard-details mapping-done"')!;
      expect(openTag(done, 'class="wizard-details mapping-done"')).toBe('<details class="wizard-details mapping-done">');
      expect(done.match(/<select /g)).toHaveLength(9);
      expect(occurrences(pages["import-step-2"], 'field-help-panel" hidden=""')).toBe(21);
      // 第 3 步：9 個換算欄位、比較期間（比較方式＋兩期日期）、通路（2 個，收合）都在關著的 details 內。
      const conversion = element(pages["import-step-3"], 'data-testid="import-conversion"')!;
      const convertDetails = element(conversion, 'class="wizard-details convert-details"')!;
      expect(openTag(convertDetails, 'class="wizard-details convert-details"')).toBe('<details class="wizard-details convert-details">');
      expect(occurrences(convertDetails, 'type="checkbox"')).toBe(9);
      const proposal = element(pages["import-step-3"], 'data-testid="import-settings-proposal"')!;
      const closed = proposal.split('<details class="wizard-details">').slice(1).map(part => part.split("</details>")[0]);
      expect(closed.some(part => part.includes(`aria-label="${escapeAttr(labels.importWizard.comparisonMode)}"`) && part.includes(`aria-label="${escapeAttr(labels.exports.csv.columns.current_end)}"`))).toBe(true);
      expect(closed.some(part => part.includes('aria-label="DTC"') && part.includes('aria-label="MARKETPLACE"'))).toBe(true);
    });


    // ── V3-8 C（空狀態）的 M1 掛載測試在此之後新增（空狀態的需要的檔案表、四種狀態等高容器）──
    it("V3-8 C：首次進入與錯誤共用同一個頁面型容器；空狀態兩個動作與「需要的檔案」表各一份，錯誤狀態的動作列與問題清單保持掛載", () => {
      for (const name of ["shell-empty", "shell-empty-data"]) {
        const { html } = states.find(state => state.name === name)!;
        const ids = testIdCounts(html);
        expect(ids.get("empty-state"), `${name} empty-state`).toBe(1);
        // V3-8 收尾（M6）：總覽的空狀態有兩顆動作；資料來源頁的頁首已有「載入示範資料／匯入資料」（page-import），空狀態不重複按鈕列。
        for (const id of ["empty-load-demo", "empty-import"]) expect(ids.get(id), `${name} ${id}`).toBe(name === "shell-empty" ? 1 : undefined);
        expect(occurrences(html, `>${labels.shell.buttons.loadDemo}<`), `${name} 載入示範資料只有一顆`).toBe(1);
        expect(ids.get("page-import"), `${name} page-import`).toBe(name === "shell-empty-data" ? 1 : undefined);
        for (const id of ["loading-state", "error-state", "error-retry"]) expect(ids.has(id), `${name} ${id}`).toBe(false);
        const section = element(html, 'data-testid="empty-state"')!;
        expect(section, name).toMatch(/^<section class="ui-empty-page state-page first-run-state" data-testid="empty-state" aria-labelledby="empty-state-title">/);
        expect(idCounts(html).get("empty-state-title"), name).toBe(1);
        // 「需要的檔案」表（TemplateTable guide）：表頭＋三列；空白範本與範例檔的可及名稱與頂欄匯出選單相同（頂欄那份在收合的 details 裡）。
        const table = element(section, 'aria-labelledby="empty-state-files"')!;
        expect(table, name).toMatch(/^<table class="template-table template-guide"/);
        expect(occurrences(table, "<tr>"), name).toBe(4);
        for (const file of [labels.importWizard.files.sales, labels.importWizard.files.costs, labels.importWizard.files.ads]) {
          expect(occurrences(table, `aria-label="${escapeAttr(fill(labels.exports.downloads.blankTemplate, { file }))}"`), `${name} ${file}`).toBe(1);
          expect(occurrences(table, `aria-label="${escapeAttr(fill(labels.exports.downloads.exampleTemplate, { file }))}"`), `${name} ${file}`).toBe(1);
        }
        // 頁面只有一個 h1（頁首），空狀態標題是 h2（M6）。
        expect(occurrences(html, "<h1"), name).toBe(1);
        expect(section, name).toContain(`<h2 id="empty-state-title">${escapeAttr(labels.empty.title)}</h2>`);
      }
      // 頁首「匯入資料」（page-import）仍只在資料來源頁的頁首；空狀態的「匯入資料」是另一個 testid（empty-import）。
      expect(testIdCounts(states.find(state => state.name === "shell-empty-data")!.html).get("page-import")).toBe(1);
      expect(testIdCounts(states.find(state => state.name === "shell-empty")!.html).get("page-import") ?? 0).toBe(0);

      const { html } = states.find(state => state.name === "shell-error")!;
      const ids = testIdCounts(html);
      for (const id of ["error-state", "error-retry", "error-view-issues", "error-issues"]) expect(ids.get(id), id).toBe(1);
      // 沒有上次成功的資料時不出現「回到上次成功的資料」；不再有 v2 的「!」圖示。
      expect(ids.has("error-back")).toBe(false);
      const section = element(html, 'data-testid="error-state"')!;
      expect(section).toMatch(/^<section class="ui-empty-page state-page error-state" data-testid="error-state" aria-labelledby="error-state-title">/);
      expect(section).not.toContain("error-icon");
      expect(section).toContain(`<p role="alert">${escapeAttr(labels.shell.state.errors.validationFailed)}</p>`);
      // 問題清單（IssueList 的 region）掛在錯誤容器的動作列之後。
      const issues = element(section, 'data-testid="error-issues"')!;
      expect(issues).toContain(`role="region" aria-label="${escapeAttr(labels.data.issues.regionAria)}"`);
      expect(section.indexOf('data-testid="error-issues"')).toBeGreaterThan(section.indexOf('data-testid="error-view-issues"'));
      for (const name of ["shell-empty", "shell-empty-data", "shell-error"]) expect(testIdCounts(states.find(state => state.name === name)!.html).has("period-bar"), name).toBe(false);
    });

    // ── V3-9a A（損益兩平 MER）的 M1 掛載測試在此之後新增（其他常用指標內的獨立列／段、? 說明掛載）──
    it("V3-9a A：總覽的其他常用指標內有損益兩平 MER 一段（各控制一份）；`?` 說明關著但掛著（hidden、role=region、兩句說明），觸發器 aria-expanded=false 指到它", async () => {
      const { BREAKEVEN_MER_VERSION, breakevenMer, breakevenNote } = await import("@/application/breakeven-mer");
      const copy = labels.assist.breakevenV3;
      const overviews = loaded().filter(({ state }) => state!.panel === "overview");
      // V3-9b A 加了 overview-yoy（兩年合成資料）狀態，V4-2 加了 overview-synthetic（4 通路合成資料），同樣檢查。
      expect(overviews.map(({ name }) => name)).toEqual(["overview", "overview-zero-ad", "overview-refund-only", "overview-yoy", "overview-synthetic"]);
      for (const { name, html, state } of overviews) {
        const ids = testIdCounts(html);
        for (const id of ["assist-breakeven-mer", "assist-breakeven-current", "assist-breakeven-previous", "assist-breakeven-note", "assist-breakeven-help", "assist-breakeven-help-trigger"]) expect(ids.get(id), `${name} ${id}`).toBe(1);
        for (const id of ["assist-breakeven-help", "assist-breakeven-name"]) expect(idCounts(html).get(id), `${name} #${id}`).toBe(1);
        expect(element(html, 'data-testid="assist-kpis"'), name).toContain('data-testid="assist-breakeven-mer"');
        const help = openTag(html, 'data-testid="assist-breakeven-help"')!;
        expect(help, name).toMatch(/\shidden=""/);
        expect(help, name).toContain('role="region"');
        const body = element(html, 'data-testid="assist-breakeven-help"')!;
        expect(body, name).toContain(`<p>${escapeAttr(copy.help.definition)}</p><p>${escapeAttr(fill(copy.help.version, { version: BREAKEVEN_MER_VERSION }))}</p>`);
        const trigger = openTag(html, 'data-testid="assist-breakeven-help-trigger"')!;
        expect(trigger, name).toContain('aria-expanded="false"');
        expect(trigger, name).toContain('aria-controls="assist-breakeven-help"');
        const note = element(html, 'data-testid="assist-breakeven-note"')!.replace(/<[^>]*>/g, "");
        expect(note, name).toBe(breakevenNote(breakevenMer(state!.active.snapshot.report.current)));
      }
      const note = (state: string) => element(overviews.find(({ name }) => name === state)!.html, 'data-testid="assist-breakeven-note"')!.replace(/<[^>]*>/g, "");
      expect(note("overview-zero-ad")).toBe(copy.note.zeroAds);
      expect(note("overview-refund-only")).toBe(copy.note.nonPositiveRevenue);
    });


    // ── V3-9a B（廣告決策標籤）的 M1 掛載測試在此之後新增（編輯器 select 在抽屜與清單各一份、卡片徽章）──
    it("V3-9a B 廣告決策（F13）：看板卡的徽章只在有標的卡、各一份；看板沒有編輯器 select；清單每項一份 select（不標／暫停／調整／加碼）、徽章只在有標的項目", () => {
      const ad = labels.actions.adDecisionV3;
      const badgeText = fill(ad.badge, { decision: ad.options.increase });
      const board = states.find(state => state.name === "actions-ad-decision")!.html;
      const boardIds = testIdCounts(board);
      expect(boardIds.get("board-card-1-ad-decision")).toBe(1);
      expect(boardIds.has("board-card-2-ad-decision"), "沒標的卡不渲染徽章").toBe(false);
      expect(boardIds.has("action-ad-decision"), "看板沒有內嵌編輯器（抽屜是條件渲染）").toBe(false);
      const card = element(board, 'data-testid="board-card-1"')!;
      const badge = element(card, 'data-testid="board-card-1-ad-decision"')!;
      expect(badge).toMatch(/^<span class="ui-lozenge action-ad-decision-badge"/);
      expect(badge).toContain(`>${badgeText}</span>`);
      // 在狀態標籤旁：同一個 board-card-tags 段落、緊接在狀態標籤之後。
      const tags = element(card, 'class="board-card-tags"')!;
      expect(tags.indexOf(labels.actions.form.statuses.in_progress)).toBeLessThan(tags.indexOf('data-testid="board-card-1-ad-decision"'));
      expect(testIdCounts(states.find(state => state.name === "actions")!.html).has("board-card-1-ad-decision"), "沒有標時不渲染").toBe(false);

      const list = states.find(state => state.name === "actions-ad-decision-list")!.html;
      const listIds = testIdCounts(list);
      expect(listIds.get("action-ad-decision"), "每個 action-{n} 一份").toBe(2);
      expect(listIds.get("action-1-ad-decision")).toBe(1);
      expect(listIds.has("action-2-ad-decision")).toBe(false);
      expect(element(element(list, 'data-testid="action-1"')!, 'class="section-heading"')).toContain(`data-testid="action-1-ad-decision">${badgeText}</span>`);
      for (const [n, selected] of [[1, "increase"], [2, ""]] as const) {
        const item = element(list, `data-testid="action-${n}"`)!;
        const select = element(item, 'data-testid="action-ad-decision"')!;
        expect(testIdCounts(item).get("action-ad-decision"), `action-${n}`).toBe(1);
        expect([...select.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map(match => [match[1], match[2]]), `action-${n}`).toEqual([["", ad.none], ["pause", ad.options.pause], ["adjust", ad.options.adjust], ["increase", ad.options.increase]]);
        expect(select, `action-${n}`).toMatch(new RegExp(`<option value="${selected}" selected=""`));
        const id = /\sid="([^"]+)"/.exec(openTag(item, 'data-testid="action-ad-decision"')!)![1];
        expect(occurrences(item, `for="${id}"`), `action-${n} label for`).toBe(1);
        expect(idCounts(list).get(id), `action-${n} id`).toBe(1);
        expect(openTag(item, 'data-testid="action-ad-decision"'), `action-${n}`).toContain(`aria-label="${escapeAttr(ad.field)}"`);
        // 「內容」段的狀態 select 之後、進度紀錄之前。
        const content = element(item, `aria-label="${escapeAttr(labels.actions.drawerV3.content)}"`)!;
        const order = [`aria-label="${escapeAttr(labels.actions.form.status)}"`, 'data-testid="action-ad-decision"', `aria-label="${escapeAttr(labels.actions.form.progress)}"`].map(attr => content.indexOf(attr));
        expect(order.every(at => at >= 0) && order[0] < order[1] && order[1] < order[2], `action-${n} 欄位順序 ${order.join(",")}`).toBe(true);
      }
    });

    it("V3-9a B 抽屜：看板檢視開著待辦編輯抽屜時，廣告決策 select 只在抽屜裡一份（M6），徽章仍在卡片上一份", async () => {
      const golden = await load("golden", "golden");
      const workspace = setAdDecision(addActionDraft(addActionDraft(emptyActionWorkspace(), golden, "a1"), golden, "a2"), "a2", "pause");
      const html = renderToStaticMarkup(<ActionsWorkbench workspace={workspace} onChange={noop} source={golden} onEvidence={noop} onExport={noop} view="board" onViewChange={noop} initial={{ editing: "a2" }} />);
      const ids = testIdCounts(html);
      expect(ids.get("action-drawer")).toBe(1);
      expect(ids.get("action-ad-decision")).toBe(1);
      expect(element(html, 'data-testid="action-drawer"')).toContain('data-testid="action-ad-decision"');
      expect(element(element(html, 'data-testid="action-drawer"')!, 'data-testid="action-ad-decision"')).toMatch(/<option value="pause" selected=""/);
      expect(ids.get("board-card-2-ad-decision")).toBe(1);
      expect(ids.has("board-card-1-ad-decision")).toBe(false);
      expect([...idCounts(html)].filter(([, count]) => count > 1), "id 不重複").toEqual([]);
    });


    // ── V3-9a C（管理損益表）的 M1 掛載測試在此之後新增（進階區收合時表格掛載、日／週切換只一份、零值列 hidden 掛載）──
    it("V3-9a C 總覽：管理損益表在收合的「進階」內、期間合計與日均之後，自己也收合但表格掛載；日／週切換與顯示零值列各一份；零值列 hidden 掛載", () => {
      for (const name of ["overview", "overview-refund-only"]) {
        const { html } = states.find(state => state.name === name)!;
        const ids = testIdCounts(html);
        for (const id of ["pnl-table", "pnl-granularity-day", "pnl-granularity-week", "pnl-show-zero"]) expect(ids.get(id), `${name} ${id}`).toBe(1);
        const advanced = element(html, 'data-testid="overview-advanced"')!;
        expect(openTag(html, 'data-testid="overview-advanced"'), name).not.toMatch(/\sopen=""/);
        expect(advanced.indexOf('data-testid="pnl-table"'), name).toBeGreaterThan(advanced.indexOf('data-testid="period-comparison"'));
        const pnl = element(html, 'data-testid="pnl-table"')!;
        expect(openTag(html, 'data-testid="pnl-table"'), name).toMatch(/^<details class="panel pnl-table"/);
        expect(openTag(html, 'data-testid="pnl-table"'), name).not.toMatch(/\sopen=""/);
        for (const id of ["pnl-granularity-day", "pnl-granularity-week", "pnl-show-zero"]) expect(pnl, `${name} ${id} 在面板內`).toContain(`data-testid="${id}"`);
        // 表格（13 列）與每格的 number-link 都在收合的 details 裡。
        expect(occurrences(pnl, '<tr class="pnl-row-'), name).toBe(13);
        expect(occurrences(pnl, 'class="number-link"'), name).toBeGreaterThanOrEqual(26);
        expect(pnl, name).toContain(`role="region" aria-label="${escapeAttr(labels.overview.pnlV3.tableAria)}"`);
      }
      // 零值列：hidden 屬性隱藏、不卸載（refund_only 的原價收入、折扣、四項費用、廣告投放費）。
      const pnl = element(states.find(state => state.name === "overview-refund-only")!.html, 'data-testid="pnl-table"')!;
      const hidden = [...pnl.matchAll(/<tr class="pnl-row-item" data-row="([^"]+)" data-zero="true" hidden="">/g)].map(match => match[1]);
      expect(hidden).toEqual(["gross_sales", "discounts", "platform_fees", "payment_fees", "fulfillment_costs", "other_variable_costs", "ad_spend"]);
      expect(openTag(states.find(state => state.name === "overview-refund-only")!.html, 'data-testid="pnl-show-zero"')).toMatch(/aria-pressed="false"/);
    });

    // ── V3-9b A（三線趨勢與下鑽）的 M1 掛載測試在此之後新增（第三線圖例、不可用原因、抽屜篩選片語各一份）──
    it("V3-9b A 總覽：趨勢圖的去年同期圖例項每個狀態一份；不可用時原因句一份（在趨勢區塊內），可用時沒有原因句、資料表多兩欄", () => {
      const overviews = states.filter(entry => entry.state?.panel === "overview");
      // V4-2 加了 overview-synthetic（4 通路合成資料，去年同期不可用），同樣檢查。
      expect(overviews.map(entry => entry.name).sort()).toEqual(["overview", "overview-refund-only", "overview-synthetic", "overview-yoy", "overview-zero-ad"]);
      for (const { name, html, state } of overviews) {
        const ids = testIdCounts(html);
        expect(ids.get("trend-legend-yoy"), name).toBe(1);
        const trend = element(html, 'data-testid="trend"')!;
        expect(trend, name).toContain('data-testid="trend-legend-yoy"');
        const yoy = state!.active.snapshot.yoy!;
        if (yoy.status === "ready") {
          expect(ids.has("trend-yoy-note"), name).toBe(false);
          expect(element(trend, 'data-testid="trend-legend-yoy"'), name).not.toContain("<small>");
        } else {
          expect(ids.get("trend-yoy-note"), name).toBe(1);
          expect(trend, name).toContain(`data-testid="trend-yoy-note">${escapeAttr(fill(labels.overview.trendYoyV3.unavailable, { reason: yoy.reason }))}</p>`);
          expect(element(trend, 'data-testid="trend-legend-yoy"'), name).toContain(`<small>${labels.overview.chartFrame.noData}</small>`);
        }
        // 資料表（收合的 <details>）照樣掛載，表頭 7 欄。
        const details = element(trend, 'class="data-alternative"')!;
        expect(openTag(trend, 'class="data-alternative"'), name).not.toMatch(/\sopen=""/);
        expect(details.match(/<thead>[\s\S]*<\/thead>/)![0].match(/<th>/g), name).toHaveLength(7);
      }
      expect(states.find(entry => entry.name === "overview-yoy")!.state!.active.snapshot.yoy!.status).toBe("ready");
      expect(states.find(entry => entry.name === "overview")!.state!.active.snapshot.yoy!.status).toBe("unavailable");
    });

    it("V3-9b A 抽屜：下鑽（通路長條）開的抽屜篩選片語與清除鈕各一份；沒有篩選的抽屜沒有；抽屜關著時都不在 DOM（維持 v2 條件渲染）", async () => {
      const demo = await load("demo", "demo");
      const drawer = (evidence: Parameters<typeof EvidenceDrawer>[0]["evidence"]) => renderToStaticMarkup(<EvidenceDrawer dataset={demo.dataset} snapshot={demo.snapshot} evidence={evidence} onClose={noop} onBasis={noop} />);
      const filtered = testIdCounts(drawer(channelEvidence(demo.snapshot, "DTC", "current")));
      expect(filtered.get("evidence-filter")).toBe(1);
      expect(filtered.get("evidence-filter-clear")).toBe(1);
      expect(filtered.has("evidence-filter-apply")).toBe(false);
      const { filter: _filter, ...plain } = channelEvidence(demo.snapshot, "DTC", "current");
      void _filter;
      expect(testIdCounts(drawer(plain)).has("evidence-filter")).toBe(false);
      for (const { name, html } of states) expect(testIdCounts(html).has("evidence-filter"), name).toBe(false);
    });



    // ── V3-9b B（匯出變體）的 M1 掛載測試在此之後新增（選單內變體選擇器一份、三個格式項目不變）──
    it("V3-9b B 匯出變體（F14）：各頁狀態的頂欄匯出選單（收合的 details）內，「一頁摘要」分組標題之後有一列版本切換；三顆 download-variant-* 各一份、預設標準版，PDF／Excel／PPT／會議紀錄 Markdown 四項不變", () => {
      for (const { name, html } of loaded()) {
        expect(openTag(html, 'data-testid="download-menu"'), name).not.toMatch(/\sopen=""/);
        const menu = element(html, 'data-testid="download-menu"')!;
        const group = element(menu, 'data-testid="download-group-summary"')!;
        expect(testIdCounts(html).get("download-variant-picker"), name).toBe(1);
        expect(openTag(group, 'data-testid="download-variant-picker"'), name).toMatch(/^<div class="ui-segmented export-variant-picker" role="group" aria-label="[^"]+" data-testid="download-variant-picker">$/);
        expect(group.indexOf('data-testid="download-meeting-section"'), name).toBeLessThan(group.indexOf('data-testid="download-variant-picker"'));
        expect(group.indexOf('data-testid="download-variant-picker"'), name).toBeLessThan(group.indexOf('aria-labelledby="download-pdf-name"'));
        for (const variant of ["standard", "boss", "client"]) {
          expect(testIdCounts(html).get(`download-variant-${variant}`), `${name} ${variant}`).toBe(1);
          expect(openTag(group, `data-testid="download-variant-${variant}"`), `${name} ${variant}`).toContain(`aria-pressed="${variant === "standard"}"`);
          for (const id of [`download-variant-${variant}-name`, `download-variant-${variant}-hint`]) expect(idCounts(html).get(id), `${name} #${id}`).toBe(1);
        }
        const names = [...group.matchAll(/class="export-item-name">([^<]+)<\/span>/g)].map(match => match[1]);
        expect(names, name).toEqual([labels.exports.buttons.exportPdf, labels.exports.buttons.exportExcel, labels.exports.buttons.exportPptx, labels.meeting.page.menuMarkdown].map(escapeAttr));
      }
      // 空工作區（沒有可看的資料）沒有一頁摘要分組，也就沒有版本切換。
      const { html } = states.find(state => state.name === "shell-empty")!;
      expect(html).not.toContain("download-variant");
    });


    // ── V3-9b C（投影模式）的 M1 掛載測試在此之後新增（present-toggle 只在總覽與會議頁各一份、投影中內容仍掛載）──
    it("V3-9b C 投影模式（F22）：present-toggle 只在總覽與會議頁、各一份、在頁首 .page-present、aria-pressed=false；SSR 不在投影中，沒有 present-period", () => {
      for (const { name, html, state } of states) {
        const allowed = state !== null && (state.panel === "overview" || state.panel === "meeting");
        expect(testIdCounts(html).get("present-toggle") ?? 0, name).toBe(allowed ? 1 : 0);
        expect(testIdCounts(html).has("present-period"), name).toBe(false);
        if (!allowed) continue;
        expect(element(html, 'class="page-heading"'), name).toContain('<div class="page-present"><button type="button" class="ui-btn ui-btn-secondary" data-testid="present-toggle" aria-pressed="false">');
        expect(element(html, 'data-testid="present-toggle"'), name).toContain(`>${labels.shell.presentV3.enter}</button>`);
      }
    });

    it("V3-9b C 投影模式只靠 CSS 隱藏（M1）：總覽的 L2／L3 區塊與會議頁的議程 3–6、備註、比較、歷史都還在 markup 裡；CSS 用到的容器與 class 都在", () => {
      const overview = states.find(state => state.name === "overview")!.html;
      // 投影中只顯示的 L1 是 .view-content 的直接子元素（CSS 用 .view-content > :not(...) 隱藏其餘區塊）。
      const view = element(overview, 'class="view-content"')!;
      const children: string[] = [];
      let depth = 0;
      for (const match of view.slice(view.indexOf(">") + 1).matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g)) {
        if (match[1]) { depth--; continue; }
        if (depth === 0) children.push(/\sclass="([^"]*)"/.exec(match[3])?.[1] ?? match[2]);
        if (!match[4] && !["input", "br", "img", "hr", "meta", "link", "col", "source", "wbr"].includes(match[2])) depth++;
      }
      const l1 = ["snapshot", "kpi-section", "top-three", "profit-section"];
      for (const name of l1) expect(children.some(item => item.split(/\s+/).includes(name)), `L1 ${name}`).toBe(true);
      for (const id of ["weekly-snapshot", "kpi-band", "top-three", "profit-waterfall", "bridge-section", "assist-kpis", "overview-advanced", "pnl-table"]) expect(testIdCounts(overview).get(id), id).toBe(1);
      expect(children.filter(item => !l1.some(name => item.split(/\s+/).includes(name))).length, "投影中隱藏的區塊").toBeGreaterThanOrEqual(4);
      for (const part of ["snapshot-meta", "snapshot-actions", "alert-body", "alert-actions", "alert-explain", "alert-chev", "sec-tools", "data-alternative"]) expect(overview, part).toContain(part);
      const meeting = states.find(state => state.name === "meeting")!.html;
      for (const id of ["meeting-agenda-1", "meeting-agenda-2", "meeting-agenda-3", "meeting-agenda-4", "meeting-agenda-5", "meeting-agenda-6", "meeting-compare", "meeting-history", "meeting-decision", "meeting-finalize"]) expect(testIdCounts(meeting).get(id), id).toBe(1);
      for (const part of ["meeting-head-field", "meeting-head-actions", "meeting-info", "meeting-toc", "meeting-notes-block", "meeting-threshold", "meeting-kpis", "meeting-agenda-head", "meeting-agenda-entry"]) expect(meeting, part).toContain(`class="${part}`);
      expect(occurrences(element(meeting, 'class="meeting-agenda-list"')!, 'class="meeting-agenda-entry"')).toBe(6);
    });


    // ── V4-1 新增 M1 測試在此之後（頁面狀態寫在 tests/helpers/page-states.tsx 的「V4-1 新增頁面狀態」錨點後；收進 <details>、投影隱藏的圖保持掛載）──
    it("V4-1 A 總覽：G1、G2 搬進 ChartFrame——各恰好 1 個 .chart-frame（瀑布外框不帶 aria-hidden、svg 自己 aria-hidden）；橋接表在 aside、DOM 在圖之前；兩個資料表 <details> 收合但表格掛載", () => {
      const { html } = states.find(state => state.name === "overview")!;
      const bridge = element(html, 'data-testid="bridge-section"')!, profit = element(html, 'data-testid="profit-waterfall"')!;
      for (const [name, section] of [["bridge-section", bridge], ["profit-waterfall", profit]] as const) {
        expect(occurrences(section, 'class="chart-frame '), name).toBe(1);
        const frame = openTag(section, 'class="chart-frame lg waterfall"')!;
        expect(frame, name).toContain('role="region"');
        expect(frame, name).not.toContain("aria-hidden");
        expect(openTag(section, 'class="waterfall-svg"'), name).toContain('aria-hidden="true"');
        const details = element(section, 'class="data-alternative"')!;
        expect(details, name).toMatch(/^<details class="data-alternative">/);
        expect(details, name).toContain("<table");
      }
      const aside = element(bridge, 'class="frame-aside"')!;
      for (const id of ["bridge-table", "bridge-balance-check"]) expect(aside, id).toContain(`data-testid="${id}"`);
      expect(bridge.indexOf('data-testid="bridge-table"')).toBeLessThan(bridge.indexOf('data-testid="bridge-waterfall"'));
      for (const id of ["bridge-section", "bridge-waterfall", "bridge-table", "bridge-balance-check", "profit-waterfall", "profit-waterfall-scope"]) expect(testIdCounts(html).get(id), id).toBe(1);
      expect(occurrences(bridge, 'class="unit-note"')).toBe(1);
    });

    it("V4-1 C 總覽：G6 九條（chart-overview-bridge-bar-{field}）在 1440 隱藏但掛載——每個總覽狀態都有（缺值列除外）、各在 bridge-table 的 tr[data-row={field}] 內、全頁恰好一次（M6）；隱藏只靠 globals.css 的 display: none，不卸載、不帶 hidden", () => {
      const overviews = loaded().filter(({ state }) => state!.panel === "overview");
      expect(overviews.length).toBeGreaterThanOrEqual(4);
      for (const { name, html, state } of overviews) {
        const { components } = state!.active.snapshot.report.bridge;
        const fields = (Object.keys(components) as (keyof typeof components)[]).filter(field => components[field].value !== null);
        const table = element(html, 'data-testid="bridge-table"')!;
        expect(occurrences(html, 'data-testid="chart-overview-bridge-bar-'), name).toBe(fields.length);
        for (const field of fields) {
          const id = `chart-overview-bridge-bar-${field}`;
          expect(testIdCounts(html).get(id), `${name} ${id}`).toBe(1);
          expect(element(table, `data-row="${field}"`), `${name} ${id}`).toContain(`data-testid="${id}"`);
          const svg = openTag(html, `data-testid="${id}"`)!;
          expect(svg, `${name} ${id}`).toContain('aria-hidden="true"');
          expect(svg, `${name} ${id}`).not.toMatch(/\shidden=""|tabindex/);
        }
        // 橋接表（含 G6）在旁欄、不在任何 hidden 或 aria-hidden 的祖先內（1440 只靠 CSS 隱藏條本身）。
        expect(openTag(html, 'class="frame-aside"'), name).not.toMatch(/\shidden=""|aria-hidden/);
        expect(chartTestIdViolations(html).filter(found => found.startsWith("chart-overview-bridge-bar-")), name).toEqual([]);
      }
      const css = readFileSync(resolve("src/app/globals.css"), "utf8");
      const block = css.slice(css.indexOf("/* ── V4-1 C："), css.indexOf("/* ── V4-1 C 錨點結束 ── */"));
      expect(block.replace(/\/\*[\s\S]*?\*\//g, "").trim()).toBe("@media print, (min-width: 768px) {\n  .bridge-table .bar-cell { display: none; }\n}");
    });

    // ── V4-2 新增 M1 測試在此之後（頁面狀態寫在 tests/helpers/page-states.tsx 的「V4-2 新增頁面狀態」錨點後；收進 <details>、投影隱藏的圖保持掛載）──
    it("V4-2 A 總覽：G7a sparkline（chart-overview-assist-spark-{kpiId}）在該列 td.spark-cell 內、aria-hidden、不可聚焦、全頁各一份；「各指標每週」<details> 收合但表格掛載（.assist-panel 最後、損益兩平段之後），表格全頁一份；合成資料的件數最後一週未滿 7 天畫空心點", async () => {
      const { assistKpis } = await import("@/application/assist-kpi");
      const { assistWeeks } = await import("@/application/chart-assist-weeks");
      const { chartColors } = await import("@/application/chart-theme");
      const spark = labels.overview.chartsV4.assistSpark;
      const overviews = loaded().filter(({ state }) => state!.panel === "overview");
      expect(overviews.map(({ name }) => name)).toContain("overview-synthetic");
      for (const { name, html, state } of overviews) {
        const { snapshot } = state!.active;
        const weekly = assistWeeks({ weeks: snapshot.weeks });
        expect(weekly.weeks.length, name).toBeGreaterThan(0);
        // 本期值缺漏或整列沒有週值時不畫（代理 A 偏差 2）；其餘每列一條。
        const drawn = assistKpis(snapshot.report.current).filter(kpi => kpi.value !== null && weekly.series.find(series => series.id === kpi.id)!.values.some(value => value.value !== null)).map(kpi => kpi.id);
        expect(occurrences(html, 'data-testid="chart-overview-assist-spark-'), name).toBe(drawn.length);
        for (const id of drawn) {
          const testId = `chart-overview-assist-spark-${id}`;
          expect(testIdCounts(html).get(testId), `${name} ${testId}`).toBe(1);
          expect(element(element(html, `data-testid="assist-${id}"`)!, 'class="spark-cell"'), `${name} ${testId}`).toContain(`data-testid="${testId}"`);
          const svg = openTag(html, `data-testid="${testId}"`)!;
          expect(svg, `${name} ${testId}`).toContain('aria-hidden="true"');
          expect(svg, `${name} ${testId}`).toContain('focusable="false"');
          expect(element(html, `data-testid="${testId}"`), `${name} ${testId}`).not.toMatch(/tabindex|<button|\shidden=""/);
        }
        // 兩張緊湊表的欄名「近 {n} 週」各一個。
        expect(occurrences(html, `<th scope="col" class="spark-head">${escapeAttr(fill(spark.head, { n: weekly.weeks.length }))}</th>`), name).toBe(2);
        // 「各指標每週」：.assist-panel 的最後一個子元素、在損益兩平段之後；收合（沒有 open）但表格掛載，表格全頁一份、7 列。
        const panel = element(html, 'class="panel assist-panel"')!;
        const details = element(panel, '<details class="data-alternative"')!;
        expect(panel.endsWith(`${details}</div>`), `${name}：資料表是 .assist-panel 最後一個子元素`).toBe(true);
        expect(panel.indexOf('data-testid="assist-breakeven-mer"'), name).toBeLessThan(panel.indexOf(details));
        expect(openTag(details, "<details"), name).not.toMatch(/\sopen=""/);
        expect(details, name).toContain(`<summary>${escapeAttr(fill(labels.overview.page.dataTable, { title: spark.tableTitle }))}</summary>`);
        expect(testIdCounts(html).get("chart-overview-assist-table"), name).toBe(1);
        const table = element(details, 'data-testid="chart-overview-assist-table"')!;
        expect(element(table, "<tbody>")!.match(/<tr>/g), name).toHaveLength(7);
        expect(occurrences(html, 'class="data-alternative"'), `${name}：其他常用指標只有這一個資料表`).toBe(occurrences(html.replace(element(html, 'data-testid="assist-kpis"')!, ""), 'class="data-alternative"') + 1);
        // 未滿 7 天的週：件數畫空心點（X40）；示範資料本期 6 個完整週，沒有空心點。
        const units = element(html, 'data-testid="chart-overview-assist-spark-units_sold"')!;
        if (weekly.weeks.every(week => week.full)) expect(units, name).not.toContain('data-kind="hollow"');
      }
      const synthetic = overviews.find(({ name }) => name === "overview-synthetic")!.html;
      const units = element(synthetic, 'data-testid="chart-overview-assist-spark-units_sold"')!;
      expect(openTag(units, "<svg"), "合成資料本期 3 週").toContain('data-points="3"');
      const dots = [...units.matchAll(/<circle [^>]*>/g)].map(match => match[0]);
      expect(dots, "件數只有最後一週一個空心點（不另畫實心的最後一點）").toHaveLength(1);
      expect(dots[0]).toContain('data-kind="hollow"');
      expect(dots[0]).toContain(`fill="${chartColors.surface}"`);
      expect(dots[0]).toContain(`stroke="${chartColors.current}"`);
      expect(element(overviews.find(({ name }) => name === "overview")!.html, 'data-testid="chart-overview-assist-spark-units_sold"')).toContain(`data-kind="last"`);
    });

    it("V4-2 B 總覽：G4 差額條（chart-overview-channels-bar-{channel}）在各通路緊湊表的 td.channel-change 內、同格差額 number-link 之前，aria-hidden、不可聚焦、全頁各一份；差額缺值的通路不畫條但差額格照樣有 number-link", () => {
      const overviews = loaded().filter(({ state }) => state!.panel === "overview");
      for (const { name, html, state } of overviews) {
        const { snapshot } = state!.active;
        const kv = element(element(html, 'data-testid="channel-mix"')!, 'class="kv channel-kv"')!;
        const rows = element(kv, "<tbody>")!.match(/<tr>/g)!.length;
        expect(occurrences(kv, '<td class="num channel-change'), `${name}：每個通路一格差額`).toBe(rows);
        expect(kv.match(/<td class="num channel-change[^"]*">(?:<svg [^>]*>[\s\S]*?<\/svg>)?<button type="button" class="number-link"/g), `${name}：每格一個 number-link（條在它之前）`).toHaveLength(rows);
        const withChange = snapshot.report.scope.channels.filter(channel => channelChangeEvidence(snapshot, channel).metric.value !== null);
        expect(occurrences(html, 'data-testid="chart-overview-channels-bar-'), name).toBe(withChange.length);
        for (const channel of withChange) {
          const testId = `chart-overview-channels-bar-${channel}`;
          expect(testIdCounts(html).get(testId), `${name} ${testId}`).toBe(1);
          expect(kv, `${name} ${testId}`).toMatch(new RegExp(`<td class="num channel-change[^"]*"><svg [^>]*data-testid="${testId}"[^>]*>[\\s\\S]*?</svg><button type="button" class="number-link"`));
          const svg = openTag(html, `data-testid="${testId}"`)!;
          expect(svg, `${name} ${testId}`).toContain('aria-hidden="true"');
          expect(svg, `${name} ${testId}`).toContain('focusable="false"');
          expect(svg, `${name} ${testId}`).not.toMatch(/tabindex|\shidden=""/);
        }
      }
      // 合成資料：LIVE 兩期扣廣告後貢獻資料待補，差額缺值不畫條；其餘三個通路各一條。
      const synthetic = overviews.find(({ name }) => name === "overview-synthetic")!.html;
      expect([...synthetic.matchAll(/data-testid="chart-overview-channels-bar-([^"]+)"/g)].map(match => match[1])).toEqual(["DTC", "MARKETPLACE", "SOCIAL"]);
      expect([...overviews.find(({ name }) => name === "overview")!.html.matchAll(/data-testid="chart-overview-channels-bar-([^"]+)"/g)].map(match => match[1])).toEqual(["DTC", "MARKETPLACE"]);
    });

    it("V4-2 C 總覽：G5 chart-overview-bullet-bar-mer 在損益兩平段（表格之外、一句結論之後、說明之前）、aria-hidden、全頁一份；畫不出來時整行不出現；KPI 帶內沒有 chart- testid 與 data-chart-kind（細條沿用 v3 markup）", async () => {
      const { breakevenMer } = await import("@/application/breakeven-mer");
      const { favorableDirectionOf } = await import("@/application/presentation");
      const { bulletGeometry } = await import("@/components/overview/charts/bullet");
      const overviews = loaded().filter(({ state }) => state!.panel === "overview");
      const withBullet: string[] = [];
      for (const { name, html, state } of overviews) {
        const current = breakevenMer(state!.active.snapshot.report.current);
        const drawn = bulletGeometry(current.actual.value, current.value, favorableDirectionOf("mer")) !== null;
        expect(testIdCounts(html).get("chart-overview-bullet-bar-mer") ?? 0, name).toBe(drawn ? 1 : 0);
        expect(occurrences(html, 'class="assist-breakeven-bullet"'), name).toBe(drawn ? 1 : 0);
        const band = element(html, 'data-testid="kpi-band"')!;
        expect(band, `${name}：KPI 帶沒有 chart- testid`).not.toContain('data-testid="chart-');
        expect(band, `${name}：KPI 帶沒有 data-chart-kind`).not.toContain("data-chart-kind");
        if (!drawn) continue;
        withBullet.push(name);
        const section = element(html, 'data-testid="assist-breakeven-mer"')!;
        expect(element(section, 'class="kv assist-breakeven-table"'), name).not.toContain("chart-overview-bullet-bar-mer");
        const line = element(section, 'class="assist-breakeven-bullet"')!;
        expect(line, name).toContain('data-testid="chart-overview-bullet-bar-mer"');
        expect(section.indexOf('data-testid="assist-breakeven-note"'), name).toBeLessThan(section.indexOf(line));
        expect(section.indexOf(line), name).toBeLessThan(section.indexOf('data-testid="assist-breakeven-help"'));
        const bullet = openTag(section, 'data-testid="chart-overview-bullet-bar-mer"')!;
        expect(bullet, name).toContain('aria-hidden="true"');
        expect(element(section, 'data-testid="chart-overview-bullet-bar-mer"'), name).not.toMatch(/tabindex|<button/);
      }
      expect(withBullet, "示範資料與兩年合成資料畫 bullet；廣告費為 0、淨營收為負與 4 通路合成資料（本期實際 MER 資料待補）不畫").toEqual(["overview", "overview-yoy"]);
    });

    // ── V4-3a 新增 M1 測試在此之後（頁面狀態寫在 tests/helpers/page-states.tsx 的「V4-3a 新增頁面狀態」錨點後；收進 <details>、投影隱藏的圖保持掛載）──
    const diagnosisStates = () => loaded().filter(({ state }) => state!.panel === "diagnosis");

    it("V4-3a A 健檢：G10 chart-diagnosis-share 全頁一份、在 diagnosis-panel 之後與 channel-compare 之前；主層獨立圖區塊是 G10、G11（V4-3b 起 CL-9＝2）；圖框 aria-hidden、svg 高＝（通路數＋2）× 24 ≤ 所選固定高、每個 ready 列 4 段；資料表 <details> 收合但表格掛載；通路 > 8 只留資料表", async () => {
      const { checkChartMarkup } = await import("../scripts/lib/chart-scan.mjs");
      const { chartHeights, chartRowHeights } = await import("@/application/chart-theme");
      const { shareSectionModel } = await import("@/components/diagnosis/share-section");
      const copy = labels.diagnosis.chartsV4.share;
      const states = diagnosisStates();
      // V4-3b 核對：多了本期超過 92 天的 diagnosis-weekly（G11 週 × 通路矩陣）；G10 的斷言對它照常成立（2 通路、sm）。
      expect(states.map(({ name }) => name)).toEqual(["diagnosis", "diagnosis-synthetic", "diagnosis-many-channels", "diagnosis-weekly"]);
      for (const { name, html, state } of states) {
        const model = shareSectionModel(state!.active.snapshot);
        for (const id of ["chart-diagnosis-share", "chart-diagnosis-share-table"]) expect(testIdCounts(html).get(id), `${name} ${id}`).toBe(1);
        const order = ['data-testid="diagnosis-panel"', 'data-testid="chart-diagnosis-share"', 'data-testid="channel-compare"'].map(attr => html.indexOf(attr));
        expect([...order].sort((a, b) => a - b), `${name}：清單、G10、通路寬表的順序`).toEqual(order);
        // V4-3b：G11 熱表接在 G10 之後，主層獨立圖區塊＝2（G10、G11；G12 在 <details> 內不計）。
        expect(checkChartMarkup(html, { page: "diagnosis" }).mainSections, `${name}：健檢頁主層獨立圖區塊是 G10、G11`).toEqual(["chart-diagnosis-share", "chart-diagnosis-heat"]);
        const section = element(html, 'data-testid="chart-diagnosis-share"')!;
        expect(openTag(section, "<section"), name).toBe('<section class="panel chart-section share-section" aria-labelledby="share-title" aria-describedby="share-sub" data-testid="chart-diagnosis-share">');
        expect(section, name).toContain(`<h2 id="share-title">${escapeAttr(model.title)}</h2>`);
        const frame = openTag(section, 'class="chart-frame')!;
        expect(frame, name).toContain(`class="chart-frame ${model.height}"`);
        // 有圖時框 aria-hidden（語意在副標與資料表）；通路 > 8 時框內是一句說明（state="empty"），不藏。
        expect(frame, name).toContain(model.chartable ? 'aria-hidden="true"' : 'data-state="empty"');
        const details = element(section, '<details class="data-alternative"')!;
        expect(openTag(details, "<details"), `${name}：資料表收合`).not.toMatch(/\sopen=""/);
        expect(details, name).toContain(`<summary>${escapeAttr(fill(labels.overview.page.dataTable, { title: copy.section }))}</summary>`);
        expect(details, `${name}：收合時表格仍掛載`).toContain('data-testid="chart-diagnosis-share-table"');
        expect(element(element(details, 'data-testid="chart-diagnosis-share-table"')!, "<tbody")!.match(/<tr[\s>]/g), `${name}：資料表列＝通路＋合計`).toHaveLength(state!.active.snapshot.report.scope.channels.length + 1);
        const segIds = [...section.matchAll(/data-testid="(chart-diagnosis-share-seg-[^"]+)"/g)].map(match => match[1]);
        if (!model.chartable) {
          expect(section, `${name}：通路 > 8 不畫圖`).not.toContain("chart-share-stack");
          expect(segIds, name).toEqual([]);
          expect(section, name).toContain(escapeAttr(fill(copy.tooMany, { count: state!.active.snapshot.report.scope.channels.length, n: 8 })));
          continue;
        }
        const svg = openTag(section, 'class="chart-share-stack"')!;
        const height = Number(/\sheight="(\d+)"/.exec(svg)![1]);
        expect(height, `${name}：svg 高＝（通路數＋2）× row24`).toBe((model.rows.length + 1) * chartRowHeights.row24);
        expect(height, `${name}：≤ 所選固定高 ${model.height}`).toBeLessThanOrEqual(chartHeights[model.height]);
        expect(svg, name).toContain('aria-hidden="true"');
        expect(svg, name).toContain('focusable="false"');
        expect(element(section, 'class="chart-share-stack"'), `${name}：圖內沒有停留點`).not.toMatch(/tabindex|<button|<a\s/);
        const ready = model.rows.filter(row => row.structure.status === "ready");
        expect(segIds, `${name}：每個 ready 列 4 段（cogs、fees、ad，加 remain 或 over）`).toHaveLength(ready.length * 4);
        for (const id of segIds) expect(testIdCounts(html).get(id), `${name} ${id}`).toBe(1);
        for (const row of model.rows.filter(item => item.structure.status !== "ready")) expect(segIds.some(id => id.startsWith(`chart-diagnosis-share-seg-${row.key}-`)), `${name}：${row.key} 不適用或資料待補，沒有段`).toBe(false);
      }
      // 示範資料：MARKETPLACE 超過 100（over），DTC 與合計有剩（remain）；合成資料的 SOCIAL（不適用）、LIVE（資料待補）沒有段。
      expect([...element(states[0].html, 'data-testid="chart-diagnosis-share"')!.matchAll(/data-testid="chart-diagnosis-share-seg-([^"]+)"/g)].map(match => match[1])).toEqual(["DTC-cogs", "DTC-fees", "DTC-ad", "DTC-remain", "MARKETPLACE-cogs", "MARKETPLACE-fees", "MARKETPLACE-ad", "MARKETPLACE-over", "total-cogs", "total-fees", "total-ad", "total-remain"]);
      const synthetic = element(states[1].html, 'data-testid="chart-diagnosis-share"')!;
      for (const channel of ["SOCIAL", "LIVE"]) expect(synthetic, channel).not.toContain(`chart-diagnosis-share-seg-${channel}-`);
    });

    it("V4-3a B 健檢：G7b sparkline（chart-diagnosis-channels-spark-{通路}）在 channel-compare 寬表的 td.spark-cell 內、aria-hidden、不可聚焦、全頁各一份；「各通路每週」<details> 收合但表格掛載（全頁一份，在寬表之後）；通路 > 8 不畫欄、不掛表，改一句說明", async () => {
      const { channelWeeksState } = await import("@/components/channel-table");
      const spark = labels.diagnosis.chartsV4.channelsSpark;
      for (const { name, html, state } of diagnosisStates()) {
        const { snapshot } = state!.active;
        const g7b = channelWeeksState(snapshot);
        const compare = element(html, 'data-testid="channel-compare"')!;
        if (g7b.status !== "ready") {
          expect(g7b.status, name).toBe("tooMany");
          expect(html, name).not.toContain("chart-diagnosis-channels-spark-");
          expect(html, name).not.toContain('data-testid="chart-diagnosis-channels-table"');
          expect(compare, name).not.toContain('class="spark-head"');
          expect(testIdCounts(html).get("channel-weeks-too-many"), name).toBe(1);
          expect(compare.indexOf('data-testid="channel-weeks-too-many"'), `${name}：說明在寬表之後`).toBeGreaterThan(compare.indexOf("</table>"));
          expect(element(compare, 'data-testid="channel-weeks-too-many"'), name).toContain(escapeAttr(fill(spark.tooMany, { max: 8 })));
          continue;
        }
        expect(testIdCounts(html).get("channel-weeks-too-many") ?? 0, name).toBe(0);
        const drawn = snapshot.report.scope.channels.filter(channel => {
          const series = g7b.data.channels.find(item => item.channel === channel)!;
          return snapshot.report.current.channels[channel].metrics.contribution_after_marketing.value !== null && series.values.some(value => value.metric.value !== null);
        });
        expect([...compare.matchAll(/data-testid="chart-diagnosis-channels-spark-([^"]+)"/g)].map(match => match[1]).sort(), name).toEqual([...drawn].sort());
        for (const channel of drawn) {
          const testId = `chart-diagnosis-channels-spark-${channel}`;
          expect(testIdCounts(html).get(testId), `${name} ${testId}`).toBe(1);
          expect(compare, `${name} ${testId}`).toMatch(new RegExp(`<td role="cell" class="spark-cell"[^>]*><svg [^>]*data-testid="${testId}"`));
          const svg = openTag(html, `data-testid="${testId}"`)!;
          expect(svg, `${name} ${testId}`).toContain('aria-hidden="true"');
          expect(svg, `${name} ${testId}`).toContain('focusable="false"');
          expect(element(html, `data-testid="${testId}"`), `${name} ${testId}`).not.toMatch(/tabindex|<button|\shidden=""/);
        }
        expect(occurrences(compare, `class="spark-head">${escapeAttr(fill(spark.head, { n: g7b.data.weeks.length }))}</th>`), name).toBe(1);
        expect(testIdCounts(html).get("chart-diagnosis-channels-table"), name).toBe(1);
        const details = element(compare, '<details class="data-alternative"')!;
        expect(compare.indexOf(details), `${name}：資料表在寬表之後`).toBeGreaterThan(compare.indexOf("</table>"));
        expect(openTag(details, "<details"), `${name}：收合`).not.toMatch(/\sopen=""/);
        expect(details, name).toContain(`<summary>${escapeAttr(fill(labels.overview.page.dataTable, { title: spark.tableTitle }))}</summary>`);
        expect(details, `${name}：收合時表格仍掛載`).toContain('data-testid="chart-diagnosis-channels-table"');
        expect(element(element(details, 'data-testid="chart-diagnosis-channels-table"')!, "<tbody")!.match(/<tr[\s>]/g), name).toHaveLength(snapshot.report.scope.channels.length);
      }
    });

    it("V4-3a C 健檢：G9 影響金額條（chart-diagnosis-impact-bar-{規則}）只在差額類規則的 summary 內、影響金額之後，aria-hidden、不可聚焦、全頁各一份；水準類規則沒有條（同寬空位）；空心條只有 REV_UP_CM_DOWN，畫了它才有清單下方的註明", async () => {
      const { buildManagerSummary } = await import("@/application/manager-summary");
      const { hasImpactBar, impactBarTestId, IMPACT_BAR_TOTAL_RULE } = await import("@/components/diagnosis-list");
      const drawnByState: Record<string, string[]> = {};
      for (const { name, html, state } of diagnosisStates()) {
        const groups = buildManagerSummary(state!.active.snapshot).diagnosis;
        const list = element(html, 'data-testid="diagnosis-list"');
        if (!list) { expect(groups, name).toEqual([]); continue; }
        const drawn = groups.filter(hasImpactBar).map(group => group.rule);
        drawnByState[name] = drawn;
        expect(occurrences(html, 'data-testid="chart-diagnosis-impact-bar-'), name).toBe(drawn.length);
        expect(openTag(html, 'data-testid="diagnosis-list"'), name).toMatch(drawn.length ? /\sdata-impact-bars=""/ : /^(?![\s\S]*data-impact-bars)/);
        for (const group of groups) {
          const summary = element(element(html, `data-testid="diagnosis-row-${group.rule}"`)!, "<summary")!;
          const impact = element(summary, 'class="diagnosis-impact"')!;
          if (!hasImpactBar(group)) {
            expect(summary, `${name} ${group.rule}：沒有條`).not.toContain("chart-diagnosis-impact-bar-");
            if (drawn.length) expect(impact, `${name} ${group.rule}：同寬空位`).toContain('<span class="impact-bar is-empty" aria-hidden="true"></span>');
            continue;
          }
          const testId = impactBarTestId(group.rule);
          expect(testIdCounts(html).get(testId), `${name} ${testId}`).toBe(1);
          expect(impact.indexOf('class="impact-amount"'), `${name} ${testId}：條在影響金額之後`).toBeLessThan(impact.indexOf(`data-testid="${testId}"`));
          const svg = openTag(impact, `data-testid="${testId}"`)!;
          expect(svg, `${name} ${testId}`).toContain('aria-hidden="true"');
          expect(svg, `${name} ${testId}`).toContain('focusable="false"');
          expect(svg, `${name} ${testId}`).toContain('data-chart-kind="cell"');
          expect(/\sclass="([^"]+)"/.exec(svg)![1].split(" ").includes("is-outline"), `${name} ${testId}：只有總差額規則是空心條`).toBe(group.rule === IMPACT_BAR_TOTAL_RULE);
          expect(element(impact, `data-testid="${testId}"`), `${name} ${testId}`).not.toMatch(/tabindex|<button|\shidden=""/);
        }
        expect(occurrences(html, 'class="note impact-note"'), `${name}：畫了空心條才有註明`).toBe(drawn.includes(IMPACT_BAR_TOTAL_RULE) ? 1 : 0);
        for (const rule of ["NEGATIVE_CHANNEL_CM", "SKU_NEGATIVE_GP"]) expect(html, `${name} ${rule}：水準類規則沒有條`).not.toContain(`chart-diagnosis-impact-bar-${rule}`);
      }
      expect(drawnByState.diagnosis, "示範資料：差額類五條").toEqual(["DISCOUNT_BURDEN_UP", "REV_UP_CM_DOWN", "MARKETING_BURDEN_UP", "REFUND_BURDEN_UP", "FULFILLMENT_BURDEN_UP"]);
    });

    it("V4-3a 總覽：管理損益表「佔淨營收 %」13 格都是 number-link（pnl-share-{指標}，全頁各一份），收在 overview-advanced <details> 內、收合時保持掛載", async () => {
      const { PNL_ROWS } = await import("@/application/pnl-table");
      for (const { name, html } of loaded().filter(({ state }) => state!.panel === "overview")) {
        const advanced = element(html, 'data-testid="overview-advanced"')!;
        expect(openTag(html, 'data-testid="overview-advanced"'), name).not.toMatch(/\sopen=""/);
        expect(occurrences(html, 'data-testid="pnl-share-'), name).toBe(PNL_ROWS.length);
        for (const { metric } of PNL_ROWS) {
          expect(testIdCounts(html).get(`pnl-share-${metric}`), `${name} pnl-share-${metric}`).toBe(1);
          expect(element(advanced, `data-testid="pnl-row-${metric}"`) ?? element(advanced, `data-row="${metric}"`), `${name} ${metric}`).toMatch(new RegExp(`<td class="num" data-col="share"><button type="button" class="number-link" data-testid="pnl-share-${metric}"`));
        }
      }
    });

    // ── V4-3b 新增 M1 測試在此之後（頁面狀態寫在 tests/helpers/page-states.tsx 的「V4-3b 新增頁面狀態」錨點後；收進 <details>、投影隱藏的圖保持掛載）──
    it("V4-3b A 健檢：G11 chart-diagnosis-heat 全頁一份、在 G10 之後與 G12、通路寬表之前；mode=table 的框不設 aria-hidden、熱表內沒有 aria-hidden；整張熱表恰好 1 個 tabindex=0、其餘可聚焦的格 −1；每格 testid 全頁一份；本期超過 92 天是週 × 通路矩陣；通路 > 8 不輸出任何格", async () => {
      const { heatSectionModel } = await import("@/components/diagnosis/heat-section");
      const states = diagnosisStates();
      expect(states.map(({ name }) => name)).toEqual(["diagnosis", "diagnosis-synthetic", "diagnosis-many-channels", "diagnosis-weekly"]);
      const layouts: Record<string, string | null> = {};
      for (const { name, html, state } of states) {
        const model = heatSectionModel(state!.active.snapshot);
        expect(testIdCounts(html).get("chart-diagnosis-heat"), name).toBe(1);
        const order = ['data-testid="chart-diagnosis-share"', 'data-testid="chart-diagnosis-heat"', 'class="chart-more rates-more"', 'data-testid="channel-compare"'].map(attr => html.indexOf(attr));
        expect(order.every(index => index >= 0), name).toBe(true);
        expect([...order].sort((a, b) => a - b), `${name}：G10、G11、G12、通路寬表的順序`).toEqual(order);
        const section = element(html, 'data-testid="chart-diagnosis-heat"')!;
        expect(openTag(section, "<section"), name).toBe('<section class="panel chart-section heat-section" aria-labelledby="heat-title" aria-describedby="heat-sub" data-testid="chart-diagnosis-heat">');
        const frame = openTag(section, 'class="chart-frame')!;
        expect(frame, `${name}：table 模式的框`).toContain('data-mode="table"');
        expect(frame, `${name}：table 模式的框不設 aria-hidden`).not.toContain("aria-hidden");
        expect(section, `${name}：熱表內沒有 aria-hidden（格是停留點）`).not.toContain('aria-hidden="true"');
        expect(section, `${name}：表本身就是資料表，不另設 <details>`).not.toContain("<details");
        const heatmap = model.result.heatmap;
        layouts[name] = heatmap === null ? null : heatmap.mode;
        if (heatmap === null) {
          expect(section, `${name}：不計算時沒有熱表與格`).not.toContain("heat-grid");
          expect(section, name).not.toContain("chart-diagnosis-heat-cell-");
          expect(frame, name).toContain('data-state="empty"');
          expect(section, name).toContain(escapeAttr(model.message!));
          continue;
        }
        expect(openTag(section, 'class="table-scroll"'), `${name}：捲動區以標題命名、不加 tabindex`).toBe('<div class="table-scroll" role="region" aria-labelledby="heat-title">');
        expect(openTag(section, 'class="heat-grid"'), name).toBe(`<div class="heat-grid" data-layout="${heatmap.mode === "weekly" ? "matrix" : "calendar"}">`);
        expect(occurrences(section, '<table class="heat-table" role="grid">'), `${name}：每張表 role=grid`).toBe(model.tables.length);
        const cells = model.tables.flatMap(table => table.rows.flatMap(row => row.cells)).filter(cell => cell.tier !== "outside");
        expect(occurrences(section, 'tabindex="0"'), `${name}：整張熱表恰好 1 個 tabindex=0`).toBe(1);
        expect(occurrences(section, 'tabindex="-1"'), `${name}：其餘可聚焦的格 tabindex=-1`).toBe(cells.length - 1);
        expect(occurrences(section, 'data-tier="outside"'), `${name}：期間外的格留白`).toBe(model.tables.flatMap(table => table.rows.flatMap(row => row.cells)).length - cells.length);
        for (const cell of cells) expect(testIdCounts(html).get(cell.testId!), `${name} ${cell.testId}`).toBe(1);
        if (heatmap.mode === "weekly") {
          expect(model.tables, `${name}：週 × 通路一張表`).toHaveLength(1);
          expect(cells.map(cell => cell.testId), `${name}：格的 key 是週起日`).toEqual(heatmap.weeks.flatMap(week => heatmap.channels.map(channel => `chart-diagnosis-heat-cell-${channel.channel}-${week.period.start}`)));
        }
      }
      expect(layouts, "示範與合成資料是日月曆、9 通路不計算、本期 98 天改週").toEqual({ diagnosis: "daily", "diagnosis-synthetic": "daily", "diagnosis-many-channels": null, "diagnosis-weekly": "weekly" });
    });

    it("V4-3b B 健檢圖區收合：G12 的 <details class=\"chart-more rates-more\"> 沒有 open，chart-diagnosis-rates 與 chart-diagnosis-rates-table 仍掛載（全頁各一份）；圖框 aria-hidden、裡面沒有 <details>、按鈕、連結、tabindex；五張子圖依序；≤ 767px 框高變數＝sm × 5", async () => {
      const { chartHeights } = await import("@/application/chart-theme");
      const { RATE_METRICS } = await import("@/components/diagnosis/rates-section");
      for (const { name, html } of diagnosisStates()) {
        const details = element(html, 'class="chart-more rates-more"')!;
        expect(details, name).not.toBeNull();
        const open = openTag(html, 'class="chart-more rates-more"')!;
        expect(open, `${name}：收合`).not.toMatch(/\sopen=""/);
        expect(open, `${name}：≤ 767px 的框高變數`).toContain(`--multiples-h:${chartHeights.sm * RATE_METRICS.length}px`);
        expect(details, name).toContain(`<summary>${escapeAttr(labels.diagnosis.chartsV4.rates.summary)}</summary>`);
        for (const id of ["chart-diagnosis-rates", "chart-diagnosis-rates-table"]) {
          expect(testIdCounts(html).get(id), `${name} ${id}`).toBe(1);
          expect(details, `${name}：${id} 收合時仍掛載`).toContain(`data-testid="${id}"`);
        }
        const frame = element(element(details, 'data-testid="chart-diagnosis-rates"')!, 'class="chart-frame')!;
        expect(openTag(frame, 'class="chart-frame')!, name).toContain('aria-hidden="true"');
        expect(frame, `${name}：圖容器內沒有停留點與收合`).not.toMatch(/<details|<button|<a\s|tabindex/);
        expect([...frame.matchAll(/class="multiple" data-panel="([^"]+)"/g)].map(match => match[1]), `${name}：五張子圖依序`).toEqual([...RATE_METRICS]);
      }
    });

    // ── V4-4 新增 M1 測試在此之後（頁面狀態寫在 tests/helpers/page-states.tsx 的「V4-4 新增頁面狀態」錨點後；收進 <details>、投影隱藏的圖保持掛載）──
    it("V4-4 C 商品：G13 chart-products-variance 每個商品狀態一份（product-best 是它的 after）；G14 chart-products-pareto 只在有商品毛利為負時出現（product-worst 是它的 after），沒有時 product-worst 照 v3 是第一格；兩張圖的資料表 <details> 收合但表格掛載；圖框內沒有停留點；主層獨立圖區塊：示範 1、有負值 2；chart- testid 全頁唯一", async () => {
      const { checkChartMarkup } = await import("../scripts/lib/chart-scan.mjs");
      const products = states.filter(state => state.state?.panel === "products");
      expect(products.map(({ name }) => name)).toEqual(["products", "products-synthetic", "products-refund-only"]);
      const expected: Record<string, string[]> = { products: ["chart-products-variance"], "products-synthetic": ["chart-products-pareto", "chart-products-variance"], "products-refund-only": ["chart-products-pareto", "chart-products-variance"] };
      for (const { name, html } of products) {
        const pareto = expected[name].includes("chart-products-pareto");
        expect(checkChartMarkup(html, { page: "products" }).mainSections, `${name}：主層獨立圖區塊`).toEqual(expected[name]);
        for (const id of ["chart-products-variance", "chart-products-variance-table", "product-worst", "product-best"]) expect(testIdCounts(html).get(id), `${name} ${id}`).toBe(1);
        for (const id of ["chart-products-pareto", "chart-products-pareto-table"]) expect(testIdCounts(html).get(id) ?? 0, `${name} ${id}`).toBe(pareto ? 1 : 0);
        expect(occurrences(html, 'id="product-highlights-heading"'), name).toBe(1);
        const grid = element(html, 'class="product-highlight-grid"')!;
        const firstChild = openTag(grid.slice(grid.indexOf(">") + 1), "<section")!;
        expect(firstChild, `${name}：第一格`).toContain(pareto ? 'data-testid="chart-products-pareto"' : 'data-testid="product-worst"');
        expect(element(html, 'data-testid="chart-products-variance"'), `${name}：product-best 是 G13 的 after`).toContain('data-testid="product-best"');
        if (pareto) expect(element(html, 'data-testid="chart-products-pareto"'), `${name}：product-worst 是 G14 的 after`).toContain('data-testid="product-worst"');
        for (const [block, table] of [["chart-products-variance", "chart-products-variance-table"], ...(pareto ? [["chart-products-pareto", "chart-products-pareto-table"]] : [])]) {
          const section = element(html, `data-testid="${block}"`)!;
          const details = element(section, '<details class="data-alternative"')!;
          expect(openTag(details, "<details"), `${name} ${block}：收合`).not.toMatch(/\sopen=""/);
          expect(details, `${name} ${block}：收合時表格仍掛載`).toContain(`data-testid="${table}"`);
          const frame = element(section, 'class="chart-frame sm"')!;
          expect(frame, `${name} ${block}：圖框內沒有停留點`).not.toMatch(/tabindex|<button|<a\s|<details/);
          if (openTag(section, 'class="chart-frame sm"')!.includes('data-state="ready"')) expect(openTag(section, 'class="chart-frame sm"'), `${name} ${block}`).toContain('aria-hidden="true"');
        }
        expect(chartTestIdViolations(html).filter(found => found.startsWith("chart-products-")), name).toEqual([]);
      }
    });

    // ── V4-5 新增 M1 測試在此之後（頁面狀態寫在 tests/helpers/page-states.tsx 的「V4-5 新增頁面狀態」錨點後；收進 <details>、投影隱藏的圖保持掛載）──
    it("V4-5 C 試算：G15 chart-scenarios-variance 全頁一份、不在任何 scenario-{n} 內；G16 chart-scenarios-threshold 在每個有 scenario-sensitivity 的 scenario-{n} 內恰好一份（INSTANCE_CONTAINER scenario-\\d+，不改規則），收在收合的 <details> 內但掛載；圖框內沒有停留點；試算頁主層獨立圖區塊＝1", async () => {
      const { checkChartMarkup } = await import("../scripts/lib/chart-scan.mjs");
      const scenarios = states.filter(state => state.state?.panel === "scenarios");
      expect(scenarios.map(({ name }) => name)).toEqual(["scenarios", "scenarios-first-visit", "scenarios-sensitivity", "scenarios-synthetic-out-of-range"]);
      // 每個狀態的方案欄數與有 G16 的方案欄（有效結果才有 scenario-sensitivity；scenarios 的方案 2「超出範圍」不能試算）。
      const expected: Record<string, { cards: number; g16: number[]; points: Record<number, string[]> }> = {
        scenarios: { cards: 2, g16: [1], points: { 1: ["zero_contribution", "maintain_baseline"] } },
        "scenarios-first-visit": { cards: 1, g16: [], points: {} },
        "scenarios-sensitivity": { cards: 2, g16: [1, 2], points: { 1: ["a", "b", "c", "zero_contribution", "maintain_baseline"], 2: ["zero_contribution", "maintain_baseline"] } },
        "scenarios-synthetic-out-of-range": { cards: 2, g16: [1, 2], points: { 1: ["maintain_baseline"], 2: ["a", "b", "c", "maintain_baseline"] } },
      };
      for (const { name, html } of scenarios) {
        const want = expected[name];
        expect(testIdCounts(html).get("chart-scenarios-variance"), `${name}：G15 全頁一份（M6）`).toBe(1);
        expect(checkChartMarkup(html, { page: "scenarios" }).mainSections, `${name}：主層獨立圖區塊`).toEqual(["chart-scenarios-variance"]);
        expect(chartTestIdViolations(html).filter(found => found.startsWith("chart-scenarios-")), name).toEqual([]);
        for (let n = 1; n <= want.cards; n++) {
          const card = element(html, `data-testid="scenario-${n}"`)!;
          expect(card, `${name} scenario-${n}`).not.toContain('data-testid="chart-scenarios-variance"');
          const has = want.g16.includes(n);
          expect(occurrences(card, 'data-testid="chart-scenarios-threshold"'), `${name} scenario-${n}：G16 份數`).toBe(has ? 1 : 0);
          expect(occurrences(card, 'data-testid="chart-scenarios-threshold-table"'), `${name} scenario-${n}：G16 資料表`).toBe(has ? 1 : 0);
          if (!has) continue;
          const sensitivity = element(card, 'data-testid="scenario-sensitivity"')!;
          expect(openTag(sensitivity, "<details"), `${name} scenario-${n}：要賣到多少才划算收合`).not.toMatch(/\sopen=""/);
          const section = element(sensitivity, 'data-testid="chart-scenarios-threshold"')!;
          expect(openTag(section, "<section"), `${name} scenario-${n}`).toMatch(/^<section class="chart-section is-inline scenario-threshold" aria-labelledby="scenarios-threshold-[\w-]+-title" aria-describedby="scenarios-threshold-[\w-]+-sub"/);
          expect(section, `${name} scenario-${n}：標題 h4`).toMatch(/<h4 id="scenarios-threshold-[\w-]+-title">/);
          const details = element(section, '<details class="data-alternative"')!;
          expect(openTag(details, "<details"), `${name} scenario-${n}：資料表收合`).not.toMatch(/\sopen=""/);
          expect(details, `${name} scenario-${n}：收合時表格仍掛載`).toContain('data-testid="chart-scenarios-threshold-table"');
          const frame = element(section, 'class="chart-frame sm"')!;
          expect(frame, `${name} scenario-${n}：圖框內沒有停留點、沒有連線`).not.toMatch(/tabindex|<button|<a\s|<details|<path|<polyline/);
          expect(openTag(section, 'class="chart-frame sm"'), `${name} scenario-${n}`).toContain('aria-hidden="true"');
          expect([...section.matchAll(/data-testid="chart-scenarios-threshold-point-([^"]+)"/g)].map(match => match[1]).sort(), `${name} scenario-${n}：點`).toEqual([...want.points[n]].sort());
        }
      }
      // 超出範圍（合成資料 MARKETPLACE）：零貢獻點不畫，圖下兩個方案各一行「超出範圍」（在 aria-hidden 的圖框之外）。
      const synthetic = scenarios.find(({ name }) => name === "scenarios-synthetic-out-of-range")!.html;
      expect(occurrences(synthetic, 'class="threshold-out-of-range"')).toBe(2);
      expect(synthetic).not.toContain('data-testid="chart-scenarios-threshold-point-zero_contribution"');
    });

    // ── V4-6 新增 M1 測試在此之後（頁面狀態寫在 tests/helpers/page-states.tsx 的「V4-6 新增頁面狀態」錨點後；收進 <details>、投影隱藏的圖保持掛載）──
    // V4-6 頁面狀態：meeting（沒有歷史）、meeting-v2-record（1 筆）、meeting-history-g19（6 筆，G19 有圖：5 點 3 段）、meeting-seven-channels（7 個通路各選一個方案、沒有歷史）。
    // 有圖的 G19 與 7 個通路的 G15 會讓 v3 列表樣板每列一份（meeting-history-item、meeting-snapshot-note、meeting-scenario-result）：M6 依 V4_6_REPEATED_V3_ROWS 逐字略過，
    // chart- testid 唯一性照常檢查（INSTANCE_CONTAINER 不改）。圖形細節（斷線、間隙標、6 根柱的值）另見 charts-meeting-g19.test 與 charts-meeting-scenarios-v4.test。
    it("V4-6 A 會議歷史：G19 chart-meeting-history 每個會議頁狀態一份、在 meeting-history 內——有歷史時在說明句之後、清單之前，沒有歷史時接在 v3 空狀態區塊之後（審查 A-4；區塊 DOM 不變）；保留不到 2 次＝等高空狀態、≥ 2 次＝有圖；inline（沒有 .panel 套 .panel）、h3；資料表 <details> 收合但掛載；圖框內沒有停留點、沒有 chartColors.current", async () => {
      const { chartColors, chartHeights } = await import("@/application/chart-theme");
      const meetings = states.filter(state => state.state?.panel === "meeting");
      const expected: Record<string, "empty" | "ready"> = { meeting: "empty", "meeting-v2-record": "empty", "meeting-history-g19": "ready", "meeting-seven-channels": "empty" };
      expect(meetings.map(({ name }) => name)).toEqual(Object.keys(expected));
      for (const { name, html, state } of meetings) {
        const want = expected[name], count = state!.history?.length ?? 0;
        for (const id of ["chart-meeting-history", "chart-meeting-history-table", "meeting-history"]) expect(testIdCounts(html).get(id) ?? 0, `${name} ${id}`).toBe(1);
        const history = element(html, 'data-testid="meeting-history"')!;
        const wrapper = element(history, 'class="meeting-history-chart"')!;
        expect(openTag(history, 'class="meeting-history-chart"'), `${name}：≤ 767px 框高變數＝sm × 2`).toBe(`<div class="meeting-history-chart" style="--multiples-h:${chartHeights.sm * 2}px">`);
        if (count > 0) {
          expect(history.indexOf(escapeAttr(labels.meeting.page.historyNote)), `${name}：說明句之後`).toBeLessThan(history.indexOf(wrapper));
          expect(history.indexOf(wrapper) + wrapper.length, `${name}：清單之前`).toBe(history.indexOf('<ul class="meeting-history-list">'));
          expect(occurrences(history, 'data-testid="meeting-history-item"'), `${name}：歷史清單筆數不變`).toBe(count);
          expect(history, name).not.toContain("meeting-history-empty");
        } else {
          // 審查 A-4：v3 的空狀態區塊逐字不變，G19 的等高空狀態緊接在它之後、是區塊最後一個子元素。
          const empty = `<div class="ui-empty-block meeting-history-empty"><p class="ui-empty-title">${labels.empty.stateV3.meetingHistoryTitle}</p><p>${labels.empty.stateV3.meetingHistoryBody}</p></div>`;
          expect(history, `${name}：v3 空狀態區塊不變`).toContain(`${empty}${wrapper}</section>`);
          expect(history, name).not.toContain('<ul class="meeting-history-list">');
        }
        expect([...history.matchAll(/class="[^"]*\bpanel\b[^"]*"/g)], `${name}：只有外層一個 .panel`).toHaveLength(1);
        const section = element(history, 'data-testid="chart-meeting-history"')!;
        expect(openTag(section, "<section"), name).toMatch(/^<section class="chart-section is-inline" aria-labelledby="meeting-history-chart-title" aria-describedby="meeting-history-chart-sub"/);
        expect(section, `${name}：標題 h3`).toContain('<h3 id="meeting-history-chart-title">');
        const details = element(section, '<details class="data-alternative"')!;
        expect(openTag(details, "<details"), `${name}：資料表收合`).not.toMatch(/\sopen=""/);
        expect(details, `${name}：收合時表格仍掛載`).toContain('data-testid="chart-meeting-history-table"');
        const frameTag = openTag(section, 'class="chart-frame sm multiples"')!;
        expect(frameTag, name).toContain(`data-state="${want}"`);
        expect(frameTag, name).toContain(`style="height:${chartHeights.sm}px"`);
        const frame = element(section, 'class="chart-frame sm multiples"')!;
        expect(frame, `${name}：圖框內沒有停留點`).not.toMatch(/tabindex|<button|<a\s|<details|chart-point-hit/);
        expect(section, `${name}：沒有強調色`).not.toContain(chartColors.current);
        if (want === "ready") {
          expect(frameTag, name).toContain('aria-hidden="true"');
          // 5 點（第三週重開只畫較晚結束的一次）、兩個空位置（斷段）：每張子圖 5 個點、只有 3 次週會連成一條線。
          expect(occurrences(frame, "multiple-point") + occurrences(frame, "multiple-last"), `${name}：兩張子圖各 5 點`).toBe(10);
          expect([...frame.matchAll(/<polyline[^>]*points="([^"]+)"/g)].map(match => match[1].split(" ").length), `${name}：只有同一段的 3 次週會相連`).toEqual([3, 3]);
          expect(occurrences(element(section, 'data-testid="chart-meeting-history-table"')!, '<th scope="row">'), `${name}：資料表 5 列`).toBe(5);
        } else expect(frame, `${name}：空狀態沒有 svg`).not.toContain("<svg");
        expect(chartTestIdViolations(html).filter(found => found.startsWith("chart-meeting-")), name).toEqual([]);
      }
    });

    it("V4-6 B 議程 5：G15 chart-meeting-scenarios 每個有選入方案的會議頁狀態一份，在 meeting-agenda-5 內、說明句之後、meeting-scenario-results 之前；inline、h4、不可點；7 個通路各選一個方案時 6 根、資料表 7 列；會議頁主層獨立圖區塊＝2（G15 會議實例、G19）；與上次比較（meeting-compare-kpis）沒有新 testid；M6 略過的 v3 列表樣板確實出現", async () => {
      const { checkChartMarkup } = await import("../scripts/lib/chart-scan.mjs");
      const { chartColors } = await import("@/application/chart-theme");
      const meetings = states.filter(state => state.state?.panel === "meeting");
      const seven = ["DTC", "MARKETPLACE", "SOCIAL", "LIVE", "B2B", "POPUP", "WHOLESALE"];
      const bars: Record<string, string[]> = { meeting: ["p"], "meeting-v2-record": ["p"], "meeting-history-g19": ["p"], "meeting-seven-channels": [] };
      for (const { name, html, state } of meetings) {
        const scope = state!.review!.meeting_filters.channels;
        const want = name === "meeting-seven-channels" ? scope.slice(0, 6).map(channel => `plan-${channel}`) : bars[name];
        if (name === "meeting-seven-channels") expect([...scope].sort(), name).toEqual([...seven].sort());
        expect(checkChartMarkup(html, { page: "meeting" }).mainSections, `${name}：主層獨立圖區塊`).toEqual(["chart-meeting-scenarios", "chart-meeting-history"]);
        for (const id of ["chart-meeting-scenarios", "chart-meeting-scenarios-table"]) expect(testIdCounts(html).get(id), `${name} ${id}`).toBe(1);
        const five = element(html, 'data-testid="meeting-agenda-5"')!;
        const section = element(five, 'data-testid="chart-meeting-scenarios"')!;
        expect(five.indexOf(section), `${name}：說明句之後`).toBeGreaterThan(five.indexOf(escapeAttr(labels.meeting.page.scenariosNote)));
        expect(five.indexOf(section) + section.length, `${name}：每通路選入列之前`).toBeLessThanOrEqual(five.indexOf('data-testid="meeting-scenario-results"'));
        expect(openTag(section, "<section"), name).toMatch(/^<section class="chart-section is-inline meeting-scenarios-chart" aria-labelledby="meeting-scenarios-title" aria-describedby="meeting-scenarios-sub"/);
        expect(section, `${name}：標題 h4`).toContain('<h4 id="meeting-scenarios-title">');
        expect([...element(html, 'data-testid="meeting-agenda"')!.matchAll(/class="[^"]*\bpanel\b[^"]*"/g)].length, `${name}：議程內沒有 .panel 套 .panel`).toBeLessThanOrEqual(1);
        expect([...section.matchAll(/data-testid="chart-meeting-scenarios-bar-([^"]+)"/g)].map(match => match[1]), `${name}：柱`).toEqual(want);
        const rows = occurrences(element(section, 'data-testid="chart-meeting-scenarios-table"')!, '<th scope="row">');
        expect(rows, `${name}：資料表列數＝選入方案數`).toBe(state!.review!.selected_scenarios.length);
        if (name === "meeting-seven-channels") expect(rows, name).toBe(7);
        const details = element(section, '<details class="data-alternative"')!;
        expect(openTag(details, "<details"), `${name}：資料表收合`).not.toMatch(/\sopen=""/);
        const frame = element(section, 'class="chart-frame sm"')!;
        expect(openTag(section, 'class="chart-frame sm"'), name).toContain('aria-hidden="true"');
        expect(frame, `${name}：柱不可點、圖框內沒有停留點`).not.toMatch(/tabindex|<button|<a\s|<details|<input|<select|ranked-hit|is-clickable/);
        expect(section, `${name}：不是 number-link`).not.toContain("number-link");
        expect(section, `${name}：沒有強調色`).not.toContain(chartColors.current);
        // G18 取消：與上次會議比較維持 v3（沒有 chart- testid、沒有圖區塊）。
        const compare = element(html, 'data-testid="meeting-compare"');
        if (compare) expect(compare, `${name}：與上次比較沒有圖`).not.toMatch(/data-testid="chart-|chart-section/);
        expect(chartTestIdViolations(html).filter(found => found.startsWith("chart-meeting-scenarios")), name).toEqual([]);
        // M6 略過的 v3 列表樣板確實以列數出現（清單不會過期）。
        for (const found of V4_6_REPEATED_V3_ROWS[name] ?? []) { const [id, times] = found.split("×"); expect(testIdCounts(html).get(id), `${name} ${found}`).toBe(Number(times)); }
      }
      expect(Object.keys(V4_6_REPEATED_V3_ROWS).every(name => meetings.some(state => state.name === name))).toBe(true);
    });

    // ── V4-7a 新增 M1 測試在此之後（頁面狀態寫在 tests/helpers/page-states.tsx 的「V4-7a 新增頁面狀態」錨點後；收進 <details>、投影隱藏的圖保持掛載）──
    // V4-7a 頁面狀態：data-missing-ad-day（G20 一個缺列框、G21 一格）、data-synthetic（G20 三段、G21 兩格）；既有的 data、import-step-1、data-partial、data-with-issues 也掛著 G20（沒有缺列段），
    // 有問題的狀態另有 G21。圖形與標題細節另見 tests/data-workspace-v3.test.tsx、charts-data-coverage-v4.test.tsx、charts-data-issues-v4.test.tsx。
    it("V4-7a 資料來源頁：G20 chart-data-coverage 每個狀態一份（狀態一行之後、data-issues 之前；資料表收合時掛載、每個缺列區段一列一個篩選按鈕；圖框 aria-hidden、框內沒有停留點）；G21 chart-data-issues 只在有問題時、在 data-issues 內（table 模式、不在 aria-hidden 內、每格一個按鈕）；主層獨立圖區塊：沒有問題 1、有問題 2", async () => {
      const { checkChartMarkup } = await import("../scripts/lib/chart-scan.mjs");
      const { chartColors } = await import("@/application/chart-theme");
      const data = states.filter(state => state.state?.panel === "data");
      const segments: Record<string, string[]> = {
        "data-missing-ad-day": ["ads-MARKETPLACE-2026-08-02"],
        "data-synthetic": ["costs-LIVE-2026-09-14", "ads-LIVE-2026-08-30", "ads-LIVE-2026-09-22"],
      };
      const cells: Record<string, string[]> = { "data-missing-ad-day": ["ads-MISSING_AD_DAY"], "data-synthetic": ["costs-MISSING_CHANNEL_COST_DAY", "ads-MISSING_AD_DAY"], "data-partial": ["sales-MISSING_COGS"], "data-with-issues": ["sales-MISSING_COGS"] };
      expect(data.map(({ name }) => name)).toEqual(expect.arrayContaining(Object.keys(segments)));
      for (const { name, html, state } of data) {
        const issues = state!.active.dataset.issues.length;
        const view = element(html, 'class="view-content"')!;
        for (const id of ["chart-data-coverage", "chart-data-coverage-table"]) expect(testIdCounts(html).get(id), `${name} ${id}`).toBe(1);
        const status = element(view, 'data-testid="data-status-line"')!, g20 = element(view, 'data-testid="chart-data-coverage"')!;
        expect(view.indexOf(status) + status.length, `${name}：G20 緊接在狀態一行之後`).toBe(view.indexOf(g20));
        expect(view.indexOf(g20) + g20.length, `${name}：G20 之後是 data-issues`).toBe(view.indexOf('<section class="panel data-section" aria-labelledby="quality-heading" data-testid="data-issues">'));
        const details = element(g20, '<details class="data-alternative"')!;
        expect(openTag(details, "<details"), `${name}：資料表收合`).not.toMatch(/\sopen=""/);
        const table = element(details, 'data-testid="chart-data-coverage-table"')!;
        const want = segments[name] ?? [];
        expect([...g20.matchAll(/data-testid="chart-data-coverage-seg-([^"]+)"/g)].map(match => match[1]), `${name}：缺列框`).toEqual(want);
        expect(occurrences(table, '<th scope="row">'), `${name}：資料表列數＝缺列區段數`).toBe(want.length);
        expect(occurrences(table, 'class="ui-btn ui-btn-text coverage-filter"'), `${name}：每列一個篩選按鈕`).toBe(want.length);
        const frameTag = openTag(g20, 'class="chart-frame sm"')!;
        expect(frameTag, name).toContain('aria-hidden="true"');
        expect(frameTag, name).toContain('data-state="ready"');
        const frame = element(g20, 'class="chart-frame sm"')!;
        expect(frame, `${name}：圖框內沒有停留點`).not.toMatch(/tabindex|<button|<a\s|<details|<input|<select/);
        expect(g20, `${name}：沒有強調色`).not.toContain(chartColors.current);
        const section = element(view, 'data-testid="data-issues"')!;
        const g21 = element(section, 'data-testid="chart-data-issues"');
        if (issues === 0) {
          expect(g21, `${name}：沒有問題時不渲染 G21`).toBeNull();
          expect(html, name).not.toContain("chart-data-issues");
        } else {
          expect(g21, `${name}：G21 在 data-issues 內`).not.toBeNull();
          for (const id of ["chart-data-issues", "chart-data-issues-table"]) expect(testIdCounts(html).get(id), `${name} ${id}`).toBe(1);
          expect(openTag(g21!, 'class="chart-frame sm"'), `${name}：table 模式的框不 aria-hidden`).not.toContain("aria-hidden");
          expect(g21!, name).not.toContain('aria-hidden="true"');
          const found = [...g21!.matchAll(/data-testid="chart-data-issues-cell-([^"]+)"><button type="button" class="heat-count"/g)].map(match => match[1]);
          expect(found, `${name}：格（每格一個計數按鈕）`).toEqual(cells[name] ?? found);
          expect(occurrences(g21!, '<button type="button" class="heat-count"'), name).toBe(found.length);
        }
        expect(checkChartMarkup(html, { page: "data" }).mainSections, `${name}：主層獨立圖區塊`).toEqual(issues === 0 ? ["chart-data-coverage"] : ["chart-data-coverage", "chart-data-issues"]);
        expect(chartTestIdViolations(html).filter(found => found.startsWith("chart-data-")), name).toEqual([]);
        // 問題表在 SSR 沒有篩選：沒有片語與清除鈕；有問題時下載鈕一份。
        expect(html, name).not.toContain('data-testid="data-issues-filter"');
        if (issues > 0) expect(testIdCounts(html).get("data-issues-download"), name).toBe(1);
      }
    });


    // ── V4-7b 新增 M1 測試在此之後（頁面狀態寫在 tests/helpers/page-states.tsx 的「V4-7b 新增頁面狀態」錨點後；收進 <details>、投影隱藏的圖保持掛載）──

    // ── V4-8 新增 M1 測試在此之後（頁面狀態寫在 tests/helpers/page-states.tsx 的「V4-8 新增頁面狀態」錨點後；收進 <details>、投影隱藏的圖保持掛載）──

    // ── V4-9a 新增 M1 測試在此之後（頁面狀態寫在 tests/helpers/page-states.tsx 的「V4-9a 新增頁面狀態」錨點後；收進 <details>、投影隱藏的圖保持掛載）──

    // ── V4-9b 新增 M1 測試在此之後（頁面狀態寫在 tests/helpers/page-states.tsx 的「V4-9b 新增頁面狀態」錨點後；收進 <details>、投影隱藏的圖保持掛載）──

    // ── V4-10 新增 M1 測試在此之後（頁面狀態寫在 tests/helpers/page-states.tsx 的「V4-10 新增頁面狀態」錨點後；收進 <details>、投影隱藏的圖保持掛載）──

  });

  describe("M6：同一個控制在 DOM 只有一個實例", () => {
    it("每個 testid 在每個狀態只出現一次（方案欄、看板卡、門檻區塊內的 testid 依實例數計）", () => {
      for (const { name, html } of states) {
        // V4-6：只略過 V4_6_REPEATED_V3_ROWS 逐字列出的 v3 列表樣板（testid×列數）；其他重複照樣失敗。
        const duplicates = duplicateTestIds(html).filter(found => !(V4_6_REPEATED_V3_ROWS[name] ?? []).includes(found));
        expect(duplicates, `${name} 重複：${duplicates.join(", ")}`).toEqual([]);
      }
      // 樣板容器真的有被拆開檢查（試算兩個方案欄、看板兩張卡）。
      const scenarios = states.find(state => state.name === "scenarios")!.html, actions = states.find(state => state.name === "actions")!.html;
      for (const id of ["scenario-1", "scenario-2"]) expect(testIdCounts(scenarios).get(id), id).toBe(1);
      for (const id of ["board-card-1", "board-card-2"]) expect(testIdCounts(actions).get(id), id).toBe(1);
    });

    it("V4-0a：chart- 開頭的 testid 在樣板容器外恰好出現一次，且容器內沒有同名的另一份（只在容器內的依容器計）", () => {
      for (const { name, html } of states) {
        const violations = chartTestIdViolations(html);
        expect(violations, `${name} chart- testid 不唯一：${violations.join(", ")}`).toEqual([]);
      }
    });

    it("V4-0a：chart- 唯一性規則抓得到違規（合成 markup）", () => {
      const block = (id: string) => `<section data-testid="${id}"><svg aria-hidden="true"><rect data-testid="${id}-bar-DTC"></rect></svg></section>`;
      const plan = (n: number, inner: string) => `<article data-testid="scenario-${n}">${inner}</article>`;
      // 容器外重複兩份。
      expect(chartTestIdViolations(`<main>${block("chart-overview-channels")}${block("chart-overview-channels")}</main>`)).toEqual(["chart-overview-channels×2（全頁 2）", "chart-overview-channels-bar-DTC×2（全頁 2）"]);
      // 全頁唯一的圖（G15）同時出現在容器外與某個方案欄內。
      expect(chartTestIdViolations(`<main>${block("chart-scenarios-variance")}${plan(1, block("chart-scenarios-variance"))}</main>`)).toEqual(["chart-scenarios-variance×1（全頁 2）", "chart-scenarios-variance-bar-DTC×1（全頁 2）"]);
      // 合規：容器外各一份；每個方案欄內各一份（G16）不受本條限制，由 duplicateTestIds 依容器計。
      const ok = `<main>${block("chart-scenarios-variance")}${plan(1, block("chart-scenarios-threshold"))}${plan(2, block("chart-scenarios-threshold"))}</main>`;
      expect(chartTestIdViolations(ok)).toEqual([]);
      expect(duplicateTestIds(ok)).toEqual([]);
      expect(duplicateTestIds(`<main>${plan(1, block("chart-scenarios-threshold") + block("chart-scenarios-threshold"))}</main>`)).toEqual(["scenario-1 > chart-scenarios-threshold×2", "scenario-1 > chart-scenarios-threshold-bar-DTC×2"]);
    });

    it("§6.3 #1–#23 的殼層 testid 與表單 id 各恰好一次", () => {
      for (const { name, html } of loaded()) {
        const ids = testIdCounts(html), anchors = idCounts(html);
        for (const id of SHELL_TESTIDS) expect(ids.get(id), `${name} data-testid=${id}`).toBe(1);
        for (const id of SHELL_IDS) expect(anchors.get(id), `${name} #${id}`).toBe(1);
      }
    });

    it("每個 id 屬性在每個狀態都唯一（label for／aria-controls 不會指錯元素）", () => {
      for (const { name, html } of states) {
        const duplicates = [...idCounts(html)].filter(([, count]) => count > 1).map(([id, count]) => `${id}×${count}`);
        expect(duplicates, `${name} 重複 id：${duplicates.join(", ")}`).toEqual([]);
      }
    });

    it("殼層的 aria-controls 與 label for 都指到唯一存在的元素", () => {
      for (const { name, html } of states) {
        const anchors = idCounts(html);
        const shellRegion = [element(html, '<header class="topbar"') ?? "", element(html, 'data-testid="mobile-tabbar"') ?? "", element(html, 'data-testid="period-bar"') ?? ""].join("");
        for (const match of shellRegion.matchAll(/\saria-controls="([^"]+)"/g)) for (const id of match[1].split(/\s+/)) expect(anchors.get(id), `${name} aria-controls=${id}`).toBe(1);
        for (const match of shellRegion.matchAll(/\sfor="([^"]+)"/g)) expect(anchors.get(match[1]), `${name} for=${match[1]}`).toBe(1);
      }
    });

    it("期間列的通路 select、比較方式 select、4 個日期欄位各只有一份（桌機 popover 與手機底部面板共用 #period-bar-panel）", () => {
      for (const { name, html } of loaded()) {
        const bar = element(html, 'data-testid="period-bar"')!;
        expect(occurrences(html, `aria-label="${escapeAttr(labels.shell.periodBar.filter.channel)}"`), `${name} 通路 select`).toBe(1);
        expect(occurrences(bar, "<select"), `${name} 期間列 select 數`).toBe(2);
        expect(occurrences(bar, 'type="date"'), `${name} 期間列日期欄位數`).toBe(4);
        expect(occurrences(html, 'id="period-bar-panel"'), name).toBe(1);
        expect(element(html, 'id="period-bar-panel"'), `${name} 自訂期間在期間面板內`).toContain('data-testid="period-custom-panel"');
        expect(occurrences(bar, 'class="period-bar"'), name).toBe(1);
      }
    });

    it("儲存選單的 checkbox 各一個（同意本機保存、自動保存；自動保存在同意後才出現，同 v2）", () => {
      for (const { name, html, state } of states) {
        const storage = element(html, 'data-testid="workspace-storage"')!;
        const consent = state ? state.consent ?? true : false;
        expect(occurrences(storage, 'type="checkbox"'), `${name} 儲存選單 checkbox 數`).toBe(consent ? 2 : 1);
        expect(occurrences(html, 'class="local-save-consent"'), `${name} 同意本機保存`).toBe(1);
        expect(testIdCounts(html).get("autosave-toggle") ?? 0, `${name} 自動保存`).toBe(consent ? 1 : 0);
        expect(occurrences(html, "clear-button"), `${name} 清空目前資料`).toBe(1);
        expect(occurrences(html, 'data-testid="workspace-storage"'), name).toBe(1);
      }
    });

    it("兩個 nav 各一個，aria-label 不同（桌機「主要導覽」、手機「手機導覽」）", () => {
      for (const { name, html } of states) {
        const navs = [...html.matchAll(/<nav\b[^>]*>/g)].map(match => /aria-label="([^"]*)"/.exec(match[0])?.[1] ?? "");
        const main = escapeAttr(labels.shell.sidebar.mainNavAria), mobile = escapeAttr(labels.shell.mobileNav.aria);
        expect(main, name).not.toBe(mobile);
        expect(navs.filter(label => label === main).length, `${name} 主要導覽`).toBe(1);
        expect(navs.filter(label => label === mobile).length, `${name} 手機導覽`).toBe(1);
        expect(openTag(html, `aria-label="${mobile}"`), name).toContain('data-testid="mobile-tabbar"');
        expect(element(html, `aria-label="${main}"`), `${name} 側欄 nav 在 aside 內`).toContain('data-testid="nav-group-results"');
        // 兩個 nav 指向同一組頁面，但手機列只放前四頁＋更多；aria-current 各自只有一個（或在「更多」面板內）。
        const mainNav = element(html, `aria-label="${main}"`)!, mobileNav = element(html, `aria-label="${mobile}"`)!;
        expect(occurrences(mainNav, 'aria-current="page"'), `${name} 側欄 aria-current`).toBe(1);
        expect(occurrences(mobileNav, 'aria-current="page"'), `${name} 手機 aria-current`).toBe(1);
      }
    });

    it("桌機頂欄群組與手機「更多」面板沒有重複任何控制（同一份 DOM，CSS 重新定位）", () => {
      for (const { name, html } of states) {
        const cluster = element(html, 'id="topbar-cluster"')!, more = element(html, 'data-testid="mobile-more"')!;
        const clusterIds = [...testIdCounts(cluster).keys()], moreIds = new Set(testIdCounts(more).keys());
        expect(clusterIds.filter(id => moreIds.has(id)), name).toEqual([]);
        for (const id of ["ai-availability", "workspace-storage", "download-menu"]) {
          expect(cluster, `${name} ${id} 在頂欄群組`).toContain(`data-testid="${id}"`);
          expect(occurrences(html, `data-testid="${id}"`), `${name} ${id}`).toBe(1);
        }
        // 指標定義（icon 按鈕）只有頂欄一個；頁尾的「指標定義」是另一個入口（§6.3 #12 三個入口都保留）。
        expect(occurrences(html, "basis-button"), `${name} 頂欄指標定義`).toBe(1);
        expect(cluster, name).toContain(`aria-label="${escapeAttr(labels.shell.buttons.basis)}"`);
        expect(occurrences(html, "footer-basis"), `${name} 頁尾指標定義`).toBe(1);
        // 「更多」面板只放頁面導覽，不放頂欄的控制；topbar-more 同時控制兩者。
        expect(more, name).not.toMatch(/topbar-menu|ai-availability|basis-button/);
        expect(openTag(html, 'data-testid="topbar-more"'), name).toMatch(/aria-controls="topbar-cluster mobile-more"/);
        expect(occurrences(html, 'data-testid="mobile-tabbar-more"'), name).toBe(1);
      }
    });
  });

  describe("Dashboard 的組法與本測試一致（防漂移）", () => {
    const source = readFileSync(resolve("src/components/dashboard.tsx"), "utf8");
    it("每個殼層元件在 Dashboard 只實例化一次", () => {
      for (const component of ["ShellFrame", "ExportMenu", "WorkspaceStorage", "PageHeader", "PeriodBar", "NeedsAttention", "ShellFooter", "ImportWizard", "MultiScenarioWorkbench", "ActionsWorkbench", "EvidenceDrawer", "BasisDialog", "Overview", "Diagnosis", "AiCollapse", "AiPanel", "ProductComparisonPanel", "DataWorkspace", "MeetingPage", "MeetingEntry"]) expect(source.match(new RegExp(`<${component}[\\s/>]`, "g"))?.length ?? 0, component).toBe(1);
    });
    it("V3-5：通路健檢的 AI 區包在 AiCollapse 裡（預設收合），與 shellPage() 的組法相同", () => {
      expect(source).toMatch(/<AiCollapse capability=\{aiCapability\}><AiPanel key=\{restoreEpoch\} capability=\{aiCapability\} /);
    });
    it("掛載條件與 shellPage() 相同：試算工作台每頁都掛著（hidden 切換）、匯入精靈只在資料來源頁顯示、期間列與橫幅在有資料或套用中時掛著", () => {
      expect(source).toMatch(/\{active && <div hidden=\{!visible \|\| panel !== "scenarios"\}><MultiScenarioWorkbench /);
      expect(source).toMatch(/\{showImport && <div hidden=\{panel !== "data"\}><ImportWizard /);
      // V3-8 開工錨點：匯入中（importing）期間列、橫幅與頁面內容保持掛載但 hidden（§7.7.2 全版專注模式）。
      expect(source).toMatch(/\{active && \(visible \|\| status === "loading"\) && <div className="period-wrap" hidden=\{importing \|\| undefined\}>\s*<PeriodBar/);
      expect(source).toMatch(/const importing = showImport && panel === "data";/);
      expect(source).toMatch(/\{visible && <NeedsAttention /);
      expect(source).toMatch(/storage=\{<WorkspaceStorage /);
      expect(source).toMatch(/exportMenu=\{<ExportMenu /);
      expect(source).toMatch(/<BasisDialog open=\{basisOpen\}/);
      // V3-4a：會議入口搬進總覽的本期一句話區塊（Overview 的 meetingEntry），不再在 Overview 外渲染。
      expect(source).toMatch(/meetingEntry=\{<MeetingEntry /);
      // V3-9b C（F22）：投影模式按鈕只在總覽與會議頁、有資料時（與 shellPage() 的 presentToggle 相同）；期間文字只在投影中傳入。
      expect(source).toMatch(/const presentToggle = visible && \(panel === "overview" \|\| panel === "meeting"\) \? <button type="button" className="ui-btn ui-btn-secondary" data-testid="present-toggle" aria-pressed=\{present\.active\}/);
      expect(source).toMatch(/presentPeriod=\{present\.active && visible \? presentPeriodText\(/);
    });
  });
});
