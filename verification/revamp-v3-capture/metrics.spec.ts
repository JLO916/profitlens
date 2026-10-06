import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { labels } from "../../src/i18n";
import { formatAmountL1 } from "../../src/application/presentation";
import { chooseBasis, commitButton, wizard, wizardStatus, setWizardFiles } from "../../tests/e2e/import-wizard-helpers";
import { FIXED_NOW, loadDemo, nav } from "./shared";

// V3-0 ⑦：PRD §2.3 B 的 v2 基準量測，寫入 verification/revamp-v3/V3-0/metrics.json（只量、不改畫面）。
// 量測狀態（§2.3 B）：新訪客、示範資料 ready、拒絕本機保存提示後（v2 沒有 F23 改名提示與 C22 橫幅）。
// 只在 desktop（1440×1000）與 mobile（390×844）兩個 project 執行；1280×900 頂欄在 desktop project 內把視窗改成 1280×900 量。
const OUT = resolve(process.env.METRICS_OUT ?? "verification/revamp-v3/V3-0/metrics.json");
const copy = labels.importWizard;
const inclusive = resolve("tests/fixtures/inclusive_tax");
/** V3-4a 起是 KPI 帶的五格（C1）；V3-0 基準量的是 .kpi-grid 的五張卡，口徑相同（第一格頂端、五格底邊）。 */
const KPI_CARDS = ".kpi-band [data-testid^='kpi-']";

/** 依路徑合併寫入（Lighthouse 腳本也寫同一個檔的 lighthouse 鍵）。 */
async function record(path: string[], value: unknown) {
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(await readFile(OUT, "utf8")); } catch { json = {}; }
  let node = json;
  for (const key of path.slice(0, -1)) node = (node[key] ??= {}) as Record<string, unknown>;
  node[path.at(-1)!] = value;
  json._meta = { batch: process.env.CAPTURE_BATCH ?? "V3-0", note: "PRD §2.3 B／C 的 v2 基準（EC ProfitLens 2.0.0，revamp/v2）。由 verification/revamp-v3-capture/metrics.spec.ts 與 scripts/lighthouse-pages.mjs 產生；說明見 verification/revamp-v3/V3-0-baseline.md。", clock: FIXED_NOW.toISOString(), server: "本機 production（APP_MODE=PUBLIC_DEMO、PUBLIC_DEMO=true、ENABLE_LIVE_AI=false）" };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(json, null, 2)}\n`);
}

const round = (value: number) => Math.round(value * 10) / 10;
async function box(page: Page, selector: string) {
  const rect = await page.locator(selector).first().boundingBox();
  if (!rect) throw new Error(`${selector} 沒有 boundingBox`);
  return { top: round(rect.y), bottom: round(rect.y + rect.height), height: round(rect.height) };
}

/** main 內、第一張 KPI 卡之前、可見且可聚焦的元素（元素數，不是 Tab 停駐點；type=date 的年月日分段算 1 個）。 */
function focusableBeforeFirstKpi(page: Page) {
  return page.evaluate(selector => {
    const main = document.querySelector("main")!;
    const first = main.querySelector(selector)!;
    const candidates = main.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, summary, iframe, [tabindex], [contenteditable='true']");
    const items: { tag: string; text: string }[] = [];
    for (const element of candidates) {
      if (element === main) continue;
      if (!(first.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_PRECEDING)) continue;
      if ((element as HTMLButtonElement).disabled || element.tabIndex < 0 || element.closest("[inert]")) continue;
      if (element instanceof HTMLInputElement && element.type === "hidden") continue;
      if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) continue;
      const text = (element.getAttribute("aria-label") ?? element.textContent ?? (element as HTMLInputElement).value ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
      items.push({ tag: element instanceof HTMLInputElement ? `input[type=${element.type}]` : element.tagName.toLowerCase(), text: text || (element as HTMLInputElement).id || "" });
    }
    return items;
  }, KPI_CARDS);
}

/** 參考值：從 main 開始按 Tab，到焦點進入第一張 KPI 卡（或之後）為止的按鍵數；date 輸入每個年／月／日分段各算一次。 */
async function tabStopsBeforeFirstKpi(page: Page) {
  await page.locator("main").focus();
  for (let presses = 1; presses <= 120; presses++) {
    await page.keyboard.press("Tab");
    const reached = await page.evaluate(selector => { const first = document.querySelector(selector)!; const active = document.activeElement; return !!active && (first.contains(active) || !!(first.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_FOLLOWING)); }, KPI_CARDS);
    if (reached) return presses - 1;
  }
  throw new Error("120 次 Tab 內沒有到達第一張 KPI 卡");
}

test.beforeEach(() => { test.skip(!["desktop", "mobile"].includes(test.info().project.name), "§2.3 B 只量 1440 與 390"); });

test("首屏位置與內容前控制項數", async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  await loadDemo(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  const cards = await page.locator(KPI_CARDS).evaluateAll(elements => elements.map(element => { const rect = element.getBoundingClientRect(); return { id: element.getAttribute("data-testid"), top: rect.top + window.scrollY, bottom: rect.bottom + window.scrollY }; }));
  expect(cards).toHaveLength(5);
  // V3-4a：三件事改成警示列（.alert-list > li.alert-row），標題是列內的 h3.alert-title。
  const firstRow = await box(page, "[data-testid='top-three'] .alert-list > li:first-child");
  const firstRowTitle = await box(page, "[data-testid='top-three'] .alert-list > li:first-child h3");
  const contribution = await box(page, "[data-testid='kpi-contribution_after_marketing'] .kpi-value");
  const focusable = await focusableBeforeFirstKpi(page);
  const snapshotSentence = await page.getByTestId("snapshot-sentence").count();
  await record([project, "firstScreen"], {
    viewport: page.viewportSize(),
    snapshotSentenceTop: snapshotSentence ? (await box(page, "[data-testid='snapshot-sentence']")).top : null,
    snapshotSentenceNote: snapshotSentence ? undefined : "v2 沒有 snapshot-sentence（本期一句話是 V3-4 新增）",
    firstKpiTop: round(Math.min(...cards.map(card => card.top))),
    kpiCardsBottom: round(Math.max(...cards.map(card => card.bottom))),
    kpiCards: cards.map(card => ({ id: card.id, top: round(card.top), bottom: round(card.bottom) })),
    contributionAfterMarketingValueTop: contribution.top,
    contributionAfterMarketingValueBottom: contribution.bottom,
    topThreeFirstRowTitleBottom: firstRowTitle.bottom,
    topThreeFirstRowBottom: firstRow.bottom,
    viewportHeight: page.viewportSize()!.height,
    numbersVisibleInFirstScreen: contribution.top < page.viewportSize()!.height,
  });
  const tabStops = await tabStopsBeforeFirstKpi(page);
  await record([project, "focusableBeforeFirstKpi"], { count: focusable.length, tabStops, method: "main 內、文件順序在第一張 KPI 卡之前、checkVisibility 可見、未 disabled、tabIndex ≥ 0、大於 1×1 px 的 a[href]／button／input／select／textarea／summary／[tabindex]；以元素計（date 輸入的年月日分段算 1 個）。tabStops 是參考值：從 main 按 Tab 到第一張 KPI 卡的按鍵數（date 每個分段各一次）", elements: focusable });
});

test("1280×900 頂欄高度與列數", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "頂欄在 desktop project 內改成 1280×900 量");
  await page.setViewportSize({ width: 1280, height: 900 });
  await loadDemo(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  const topbar = await page.locator("header.topbar").evaluate(element => {
    const rect = element.getBoundingClientRect();
    const boxes = (Array.from(element.children) as HTMLElement[]).filter(child => getComputedStyle(child).position !== "absolute").map(child => child.getBoundingClientRect()).filter(box => box.width > 0 && box.height > 0).sort((a, b) => a.top - b.top);
    const rows: { top: number; bottom: number }[] = [];
    for (const box of boxes) {
      const row = rows.at(-1);
      if (row && box.top < row.bottom - 1) row.bottom = Math.max(row.bottom, box.bottom);
      else rows.push({ top: box.top, bottom: box.bottom });
    }
    return { height: Math.round(rect.height * 10) / 10, rows: rows.length, children: element.children.length };
  });
  await record(["laptop", "topbar"], { viewport: { width: 1280, height: 900 }, ...topbar, method: "header.topbar 的高度；列數＝可見、非 absolute 的直接子元素依垂直範圍分群（與上一列垂直範圍重疊者同列）" });
});

test("各頁頁首到匯入精靈步驟 1 的點擊數", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "點擊路徑與尺寸無關，只在 1440 量");
  await loadDemo(page);
  const pages = ["overview", "diagnosis", "products", "scenarios", "actions", "meeting", "data"] as const;
  const result: Record<string, number> = {};
  for (const id of pages) {
    await nav(page, id).click();
    await expect(page.getByRole("heading", { level: 1, name: labels.nav[id].label, exact: true })).toBeVisible();
    let clicks = 0;
    // V3-3（§6.3 #23）：「匯入資料」只留在資料來源頁首（page-import）；其他頁走頂欄資料狀態 → popover 的「匯入新資料」（data-status → data-status-import）。
    if (await page.getByTestId("page-import").count()) { clicks += 1; await page.getByTestId("page-import").click(); }
    else { clicks += 1; await page.getByTestId("data-status").click(); clicks += 1; await page.getByTestId("data-status-import").click(); }
    await expect(page.getByTestId("import-step-1")).toBeVisible();
    result[id] = clicks;
    await wizard(page).getByRole("button", { name: copy.cancel, exact: true }).click();
    await expect(wizard(page)).toHaveCount(0);
  }
  await record(["desktop", "importEntryClicks"], { perPage: result, max: Math.max(...Object.values(result)), method: "先用側欄切到該頁（不計），再數到 import-step-1 可見為止的點擊（V3-3：資料來源頁 page-import 1 次，其他頁 data-status → data-status-import 2 次）；每頁量完按「取消」關閉精靈" });
});

test("含稅匯入（tests/fixtures/inclusive_tax）經精靈完成的最少點擊數", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "點擊路徑與尺寸無關，只在 1440 量");
  await page.clock.setFixedTime(FIXED_NOW);
  await page.goto("/");
  const steps: string[] = [];
  const click = async (name: string, action: () => Promise<void>) => { steps.push(name); await action(); };
  // V3-3：空狀態首頁沒有頁首「匯入資料」，走頂欄資料狀態 → 「匯入新資料」（2 次）。
  await click("頂欄「資料狀態」", () => page.getByTestId("data-status").click());
  await click("「匯入新資料」", () => page.getByTestId("data-status-import").click());
  await expect(wizard(page)).toBeVisible();
  await setWizardFiles(page, inclusive); // setInputFiles 不算點擊（使用者選檔的檔案對話框另計，見基準文件）
  await click("下一步", () => wizard(page).getByRole("button", { name: copy.next, exact: true }).click());
  if (await page.getByTestId("import-step-2").count()) await click("確認對照", () => wizard(page).getByRole("button", { name: copy.confirmMapping, exact: true }).click());
  await expect(page.getByTestId("import-step-3")).toBeVisible();
  await click("口徑：含稅", () => chooseBasis(page, "inclusive"));
  await click("確認並檢核", () => wizard(page).getByRole("button", { name: copy.confirmAndCheck, exact: true }).click());
  await expect(wizardStatus(page)).toHaveText(copy.result.valid, { timeout: 20_000 });
  await click("套用", () => commitButton(page).click());
  const replacement = page.getByRole("dialog", { name: labels.ui.replacementDialog.heading });
  if (await replacement.isVisible()) await click("取代確認", () => replacement.getByRole("button", { name: labels.ui.replacementDialog.discardAndContinue, exact: true }).click());
  await expect(wizard(page)).toHaveCount(0);
  // V3-2b 起 KPI 大數字是 L1（< 1 萬寫整數元）；golden 精確值仍是真相來源。
  await expect(page.getByTestId("kpi-net_revenue").locator(".kpi-value")).toHaveText(formatAmountL1("2150.00"));
  await expect(page.getByTestId("kpi-contribution_after_marketing").locator(".kpi-value")).toHaveText(formatAmountL1("518.05"));
  await record(["desktop", "inclusiveTaxImportClicks"], { count: steps.length, steps, fileInputs: 3, start: "空狀態首頁（新訪客）", end: "總覽 KPI 淨營收 2,150.00、扣廣告後貢獻 518.05（與 tests/fixtures/inclusive_tax/README.md 手算相同）", method: "只數點擊；三個檔案用 setInputFiles 放入，不計點擊（實際使用者另有 3 次選檔對話框或 1 次拖放）；含稅換算的稅率 5% 與勾選欄位用精靈預設值" });
});

test("First Load JS（/ 的 HTML 所引用的 /_next/static 腳本）", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "與尺寸無關");
  const html = await (await request.get("/")).text();
  const tags = [...html.matchAll(/<script([^>]*)\ssrc="([^"]+)"([^>]*)>/g)].map(match => ({ src: match[2], nomodule: /\snoModule|\snomodule/i.test(`${match[1]} ${match[3]}`) })).filter(tag => tag.src.includes("/_next/static/"));
  const sources = [...new Map(tags.map(tag => [tag.src, tag])).values()];
  expect(sources.length).toBeGreaterThan(0);
  const files: { src: string; nomodule: boolean; bytes: number; gzip: number }[] = [];
  for (const { src, nomodule } of sources) {
    const body = await (await request.get(src)).body();
    files.push({ src: src.replace(/^.*\/_next\//, "/_next/"), nomodule, bytes: body.length, gzip: gzipSync(body).length });
  }
  const sum = (key: "bytes" | "gzip", list = files) => list.reduce((total, file) => total + file[key], 0);
  const modern = files.filter(file => !file.nomodule);
  await record(["firstLoadJs"], { scripts: modern.length, bytes: sum("bytes", modern), kib: round(sum("bytes", modern) / 1024), gzipBytes: sum("gzip", modern), gzipKiB: round(sum("gzip", modern) / 1024), nomoduleExcluded: files.filter(file => file.nomodule).map(file => ({ src: file.src, bytes: file.bytes, gzip: file.gzip })), allScripts: { scripts: files.length, bytes: sum("bytes"), gzipBytes: sum("gzip") }, files, method: "GET / 的 HTML 中 <script src> 指向 /_next/static/ 的檔案（去重）；主數字排除 nomodule（polyfills，現代瀏覽器不下載），allScripts 為含 nomodule 的總和；bytes＝未壓縮大小，gzip＝Node zlib gzipSync 預設等級（next start 也以 gzip 傳送）" });
});
