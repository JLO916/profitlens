// V3-10 上線檢查（06_BATCHES V3-10「四尺寸走查與鍵盤走查；網路紀錄」；PRD §2.3 B／C、§11.1、§11.3）的 E2E 共用小工具（代理 C）：網路紀錄、鍵盤走查、axe 三個 spec 共用。
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { expect, type Page, type TestInfo } from "@playwright/test";
import { labels } from "../../src/i18n";
import { formatAmountL1 } from "../../src/application/presentation";
import { clickReplacing, dismissSavePrompt, navigateTo } from "./replacement-helpers";

// 字串一律取 labels 的新路徑（V3-2c 第 2 部分：shell／overview／exports／storage…），不用 V3-10 移除的舊鍵 alias（nav、buttons、downloads、ui…）。
export const copy = {
  loadDemo: labels.shell.buttons.loadDemo,
  ready: labels.shell.status.ready,
  analysisCsv: labels.exports.downloads.analysisCsv,
  decisionJson: labels.exports.downloads.decisionJson,
  exportPdf: labels.exports.buttons.exportPdf,
  exportExcel: labels.exports.buttons.exportExcel,
  exportPptx: labels.exports.buttons.exportPptx,
  downloadBackup: labels.storage.buttons.downloadBackup,
  calculate: labels.scenarios.buttons.calculate,
} as const;

/** 七頁（側欄順序）。開發者驗證頁（#validation）不在上線檢查範圍。 */
export const LAUNCH_PAGES = ["overview", "diagnosis", "products", "scenarios", "actions", "meeting", "data"] as const;
export type LaunchPage = typeof LAUNCH_PAGES[number];
/** 頁名（側欄可見文字）：labels.shell.nav.{id}.headline。 */
export const pageName = (id: LaunchPage) => labels.shell.nav[id].headline;

/** fixtures/demo：本期扣廣告後貢獻 1269792.73（KPI 帶 L1）。 */
export const DEMO_RESULT = "1269792.73";
/** 載入示範資料（空狀態的「載入示範資料」），等 KPI 帶出現示範資料的扣廣告後貢獻，再關掉首次保存提示（不同意本機保存）。 */
export async function loadDemo(page: Page) {
  await clickReplacing(page, page.getByRole("button", { name: copy.loadDemo, exact: true }).first());
  await expect(page.getByTestId("kpi-contribution_after_marketing").locator(".kpi-value")).toHaveText(formatAmountL1(DEMO_RESULT));
  await dismissSavePrompt(page);
  await expect(page.getByTestId("local-save-prompt")).toHaveCount(0);
}
/** 切頁（桌機側欄；手機底部分頁列或「更多」），等頁面的主要區塊出現。 */
export async function gotoPage(page: Page, id: LaunchPage) {
  await navigateTo(page, id);
  await expect(page.locator("main h1")).toHaveText(pageName(id));
}

/** KPI 帶「扣廣告後貢獻」的本期數字（number-link）：開「計算與來源」抽屜。 */
export const kpiLink = (page: Page) => page.getByTestId("kpi-contribution_after_marketing").locator(".kpi-value button.number-link");
/** 「計算與來源」抽屜（dialog.evidence-drawer；只在開啟時渲染）。 */
export const evidenceDrawer = (page: Page) => page.locator("dialog.evidence-drawer");

/**
 * next dev 的開發者浮層（<nextjs-portal>，左下角的 N 指示器）會蓋住手機底部分頁列、也會被 axe 掃到；只在 dev 存在，production 沒有這個元素。
 * 在第一次 goto 之前呼叫：隱藏浮層，不改產品的任何元素。
 */
export async function hideDevOverlay(page: Page) {
  await page.addInitScript(() => {
    const hide = () => { if (!document.getElementById("v310-hide-dev-overlay")) { const style = document.createElement("style"); style.id = "v310-hide-dev-overlay"; style.textContent = "nextjs-portal { display: none !important; }"; document.head.append(style); } };
    if (document.head) hide(); else document.addEventListener("DOMContentLoaded", hide, { once: true });
  });
}

/** 只替換系統列印對話框（記錄呼叫次數），列印版面與 print media 照常運作；要在第一次 goto 之前呼叫。 */
export async function stubPrint(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __v310PrintCalls: number };
    w.__v310PrintCalls = 0;
    window.print = () => { w.__v310PrintCalls++; };
  });
}
export const printCalls = (page: Page) => page.evaluate(() => (window as unknown as { __v310PrintCalls?: number }).__v310PrintCalls ?? 0);

/**
 * 結果 JSON：有環境變數（例如 NETWORK_LOG_OUT）就合併寫到該路徑（同一檔以 Playwright 專案名為鍵，desktop 與 mobile 寫在同一份；
 * 舊的其他專案鍵保留），沒給就只寫到 test-results（testInfo.outputPath），平常跑 E2E 不會動到 verification/。回傳實際寫入的路徑。
 */
export async function writeLaunchJson(envName: string, fallbackName: string, testInfo: TestInfo, value: unknown): Promise<string> {
  const target = process.env[envName];
  const key = testInfo.project.name;
  const path = target ? resolve(target) : testInfo.outputPath(fallbackName);
  let merged: Record<string, unknown> = {};
  if (target && existsSync(path)) {
    try { merged = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>; } catch { merged = {}; }
  }
  merged[key] = value;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(merged, null, 2)}\n`);
  return path;
}

/** postData 前 80 字元的 SHA-256（只記雜湊與長度，不把內容寫進紀錄）。 */
export const postDataDigest = (body: string) => ({ bytes: Buffer.byteLength(body, "utf8"), head80_sha256: body ? createHash("sha256").update(body.slice(0, 80)).digest("hex") : null });

/** golden 三份 CSV 的每一行（含表頭）＋ 通路名 MARKETPLACE：拿來檢查請求本文與網址有沒有夾帶原始資料。 */
export async function goldenProbes(): Promise<{ lines: string[]; tokens: string[] }> {
  const root = resolve("fixtures/golden");
  const texts = await Promise.all(["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"].map(name => readFile(resolve(root, name), "utf8")));
  const lines = texts.flatMap(text => text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0));
  return { lines, tokens: ["MARKETPLACE"] };
}

/** 頁面內：目前焦點元素的描述與焦點樣式、或整頁的純 DOM 可及性檢查。函式自足（page.evaluate 會序列化），不引用外部變數。 */
/**
 * 一個 Tab 停留點。nativeComposite：日期等原生複合欄位（Chromium 的 Tab 會依序停在月／日／年與日曆按鈕，activeElement 都是同一個 input；
 * 停在日曆按鈕時 input 本身不再 :focus，焦點框由瀏覽器畫在 shadow DOM 內，記為 focusRing "native"）。
 */
export interface FocusStop { tag: string; role: string | null; name: string; testid: string | null; focusVisible: boolean; focusRing: "self" | "related" | "native" | "none"; isBody: boolean; inMain: boolean; inDialog: boolean; nativeComposite: boolean; key: string }
export interface DomA11y {
  h1: string[]; headingSkips: string[]; unnamedControls: string[]; imagesWithoutAlt: string[]; focusableCount: number;
  duplicateIds: string[]; focusRuleExists: boolean;
}
export function inPageA11y(mode: "active" | "dom"): FocusStop | DomA11y {
  const hidden = (el: Element) => el.closest("[aria-hidden='true']") !== null;
  const text = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (!(node instanceof Element) || node.getAttribute("aria-hidden") === "true" || ["STYLE", "SCRIPT", "TEMPLATE"].includes(node.tagName)) return "";
    if (node.tagName === "IMG") return node.getAttribute("alt") ?? "";
    if (node instanceof SVGElement) return node.querySelector("title")?.textContent ?? "";
    return [...node.childNodes].map(text).join(" ");
  };
  const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
  const accName = (el: Element): string => {
    const ids = el.getAttribute("aria-labelledby");
    if (ids) { const value = clean(ids.split(/\s+/).map(id => { const target = document.getElementById(id); return target ? text(target) : ""; }).join(" ")); if (value) return value; }
    const aria = clean(el.getAttribute("aria-label")); if (aria) return aria;
    const labelled = (el as HTMLInputElement).labels;
    if (labelled && labelled.length) { const value = clean([...labelled].map(text).join(" ")); if (value) return value; }
    if (el instanceof HTMLInputElement && ["button", "submit", "reset"].includes(el.type)) return clean(el.value);
    if (el.tagName === "IMG") return clean(el.getAttribute("alt"));
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) { const value = clean(text(el)); if (value) return value; }
    return clean(el.getAttribute("title")) || clean(el.getAttribute("placeholder"));
  };
  const ringOf = (el: Element) => {
    const style = getComputedStyle(el);
    return (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) || (style.boxShadow !== "" && style.boxShadow !== "none");
  };
  if (mode === "active") {
    const el = document.activeElement;
    const isBody = !el || el === document.body || el === document.documentElement;
    if (isBody || !el) return { tag: "body", role: null, name: "", testid: null, focusVisible: false, focusRing: "none", isBody: true, inMain: false, inDialog: false, nativeComposite: false, key: "body" };
    const nativeComposite = el instanceof HTMLInputElement && ["date", "time", "datetime-local", "month", "week"].includes(el.type);
    const shadowFocus = nativeComposite && !el.matches(":focus");
    let focusRing: FocusStop["focusRing"] = shadowFocus ? "native" : ringOf(el) ? "self" : "none";
    // 視覺上隱藏的控制（例如檔案欄位）由外層或同一組的按鈕畫焦點框（.file-pick:has(input:focus-visible) .button）：往上三層找有外框的元素。
    if (focusRing === "none") {
      let scope: Element | null = el.parentElement;
      for (let depth = 0; scope && depth < 3 && focusRing === "none"; depth++, scope = scope.parentElement) {
        if (ringOf(scope) || [...scope.querySelectorAll("*")].some(ringOf)) focusRing = "related";
      }
    }
    const path: string[] = [];
    for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) path.unshift(`${node.tagName.toLowerCase()}:${[...(node.parentElement?.children ?? [])].indexOf(node)}`);
    return {
      tag: el.tagName.toLowerCase(), role: el.getAttribute("role"), name: accName(el).slice(0, 120), testid: (el as HTMLElement).dataset?.testid ?? null,
      focusVisible: shadowFocus || (el.matches(":focus-visible") && focusRing !== "none"), focusRing, isBody: false,
      inMain: !!el.closest("main"), inDialog: !!el.closest("dialog,[role=dialog]"), nativeComposite, key: path.join("/"),
    };
  }
  const visible = (el: Element) => (el as HTMLElement).checkVisibility?.({ checkOpacity: false, checkVisibilityCSS: true }) ?? true;
  const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(h => visible(h) && !hidden(h));
  const headingSkips: string[] = [];
  let previous = 0;
  for (const heading of headings) {
    const level = Number(heading.tagName[1]);
    if (previous && level > previous + 1) headingSkips.push(`h${previous}→h${level}「${clean(heading.textContent).slice(0, 30)}」`);
    previous = level;
  }
  const controls = [...document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab], [role=menuitem], [role=checkbox], [role=switch]")]
    .filter(el => visible(el) && !hidden(el));
  const unnamedControls = controls.filter(el => !accName(el)).map(el => `${el.tagName.toLowerCase()}${(el as HTMLElement).dataset?.testid ? `[${(el as HTMLElement).dataset.testid}]` : ""}${el.id ? `#${el.id}` : ""}`);
  const imagesWithoutAlt = [...document.querySelectorAll("img")].filter(img => !img.hasAttribute("alt") && !hidden(img)).map(img => img.getAttribute("src") ?? "img");
  const ids = [...document.querySelectorAll("[id]")].map(el => el.id);
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  let focusRuleExists = false;
  for (const sheet of [...document.styleSheets]) {
    try { if ([...sheet.cssRules].some(rule => rule.cssText.includes(":focus-visible"))) { focusRuleExists = true; break; } } catch { /* 跨來源樣式表讀不到規則，略過 */ }
  }
  return { h1: [...document.querySelectorAll("h1")].filter(visible).map(h => clean(h.textContent)), headingSkips, unnamedControls, imagesWithoutAlt, focusableCount: controls.length, duplicateIds, focusRuleExists };
}
export const activeStop = (page: Page) => page.evaluate(inPageA11y, "active" as const) as Promise<FocusStop>;
export const domA11y = (page: Page) => page.evaluate(inPageA11y, "dom" as const) as Promise<DomA11y>;
