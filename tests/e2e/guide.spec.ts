// V41-1（docs/revamp-v4.1/06_BATCHES.md V41-1 第 9 項；01_PRD.md §3.1、§3.2、§3.3、§3.6、§3.10）：說明首頁 /guide 與工作台「使用說明」入口的 E2E，四尺寸都跑。
import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { labels } from "../../src/i18n";
import { guideLabels } from "../../src/i18n/guide.zh-TW";
import { GUIDE_AREAS, GUIDE_HUB_SECTIONS, resolveUiRefs } from "../../src/application/guide";
import { formatAmountL1 } from "../../src/application/presentation";
import { DEMO_RESULT, hideDevOverlay, loadDemo } from "./launch-helpers-v310";
import { isMobile, openMobileMore } from "./replacement-helpers";

/*
 * A. /guide：回應 200；h1 恰好一個＝guide.hub.title；guide-hub、guide-toc 看得到；目錄每個錨點都跳到自己的段落（網址 #id、段落標題進到視窗）；
 *    頁面不橫向捲動（document.scrollingElement.scrollWidth ≤ 視窗寬）；axe（與 tests/e2e/axe-sweep.spec.ts 同一組 tag 與設定）serious、critical 為 0。
 * B. 工作台入口（D-V41-5）：四個入口都是 <a href="/guide" target="_blank" rel="noopener">；看得到的入口可及名稱＝可見文字＋shell.guideV41.newTab（sr-only）。
 *    首頁空狀態的入口另開分頁到 /guide；載入示範資料後，側欄（≥ 768）或「更多」最後一列（≤ 767）、頁尾的入口都另開分頁到 /guide，原分頁的示範資料仍在（同分頁換頁會丟掉記憶體裡的資料）。
 * 字串一律取 labels 與 guideLabels（{ui:…} 以 resolveUiRefs 換成 labels 原字串），定位以 testid 為主；非 testid 的定位器登記在 verification/revamp-v41/e2e-text-assertions.csv。
 */
const g = guideLabels.guide;
const text = (value: string) => resolveUiRefs(value, labels);
const entry = labels.shell.guideV41;
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** 可及名稱＝可見文字＋「（另開分頁）」：.sr-only 是 position:absolute，Chromium 計算名稱時在兩段之間補一個空白（代理 B 實測），所以允許中間有空白。 */
const entryName = (visible: string) => new RegExp(`^${escape(visible)}\\s?${escape(entry.newTab)}$`);
/** 本批（GUIDE_AREAS 是空的）目錄只有 why、who、unique、quickstart；功能區頁上線後多 areas。 */
const tocSections = GUIDE_HUB_SECTIONS.filter(id => id !== "areas" || GUIDE_AREAS.length > 0);

/** 收集 console error 與 pageerror；每個測試最後斷言為空。 */
function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(`pageerror:${error.message}`));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  return errors;
}

/** 連結中看得到的文字（拿掉 .sr-only 與 aria-hidden 的子節點，例如「更多」列的圖示）。 */
const visibleText = (link: Locator) => link.evaluate(element => {
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (!(node instanceof Element) || node.classList.contains("sr-only") || node.getAttribute("aria-hidden") === "true") return "";
    return [...node.childNodes].map(walk).join("");
  };
  return walk(element).trim();
});

/** 入口的屬性：href=/guide、target=_blank、rel=noopener（四個入口在每個狀態都掛載，手機的側欄、關著的「更多」也一樣）。 */
async function expectEntryAttributes(link: Locator) {
  await expect(link).toHaveCount(1);
  await expect(link).toHaveAttribute("href", "/guide");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener");
}

/** 點看得到的入口：可見文字、可及名稱正確；另開一個分頁到 /guide（說明首頁渲染），原分頁的網址不變。回傳後關掉新分頁。 */
async function openEntry(page: Page, context: BrowserContext, link: Locator, visible: string) {
  await expect(link).toBeVisible();
  expect(await visibleText(link)).toBe(visible);
  await expect(link).toHaveAccessibleName(entryName(visible));
  const before = page.url();
  const [opened] = await Promise.all([context.waitForEvent("page"), link.click()]);
  await opened.waitForLoadState("domcontentloaded");
  expect(new URL(opened.url()).pathname).toBe("/guide");
  await expect(opened.getByTestId("guide-hub")).toBeVisible();
  await opened.close();
  expect(page.url(), "入口另開分頁，原分頁不換頁").toBe(before);
}

/** axe-core（與 tests/e2e/axe-sweep.spec.ts 同一份 axe.min.js、同一組 tag、同樣排除 nextjs-portal）；回傳 serious 與 critical 的違規。 */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function axeBlocking(page: Page) {
  if (!await page.evaluate(() => "axe" in window)) await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  const violations = await page.evaluate(async tags => {
    const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: { id: string; impact: string | null; nodes: { target: unknown[] }[] }[] }> } }).axe;
    const result = await axe.run({ exclude: [["nextjs-portal"]] }, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] });
    return result.violations.map(item => ({ id: item.id, impact: item.impact, targets: item.nodes.slice(0, 5).map(node => JSON.stringify(node.target)) }));
  }, TAGS);
  return violations.filter(item => item.impact === "serious" || item.impact === "critical").map(item => `${item.impact} ${item.id}：${item.targets.join(" ")}`);
}

test.describe("V41-1 說明首頁與入口", () => {
  test("/guide：200、h1 唯一、說明首頁與目錄、目錄錨點跳到段落、不橫向捲動、axe 0 serious", async ({ page }) => {
    const errors = collectErrors(page);
    await hideDevOverlay(page);
    const response = await page.goto("/guide");
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveText(text(g.hub.title));
    const hub = page.getByTestId("guide-hub");
    await expect(hub).toBeVisible();
    await expect(hub.getByRole("heading", { level: 1 })).toHaveText(text(g.hub.title));
    const toc = page.getByTestId("guide-toc");
    await expect(toc).toBeVisible();
    await expect(toc).toHaveAccessibleName(text(g.hub.tocAria));

    // 目錄：依閱讀順序列出段落；每個錨點都跳到自己的段落（網址帶 #id、段落的 h2 進到視窗內）。
    const links = toc.getByRole("link");
    await expect(links).toHaveCount(tocSections.length);
    for (const [index, id] of tocSections.entries()) {
      const link = links.nth(index);
      await expect(link).toHaveText(text(g.sections[id]));
      await expect(link).toHaveAttribute("href", `#${id}`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await link.click();
      await expect(page).toHaveURL(new RegExp(`#${id}$`));
      const heading = page.locator(`#${id}`).getByRole("heading", { level: 2 });
      await expect(heading).toHaveText(text(g.sections[id]));
      await expect(heading).toBeInViewport();
    }

    // 不橫向捲動（四尺寸）。
    await page.evaluate(() => window.scrollTo(0, 0));
    const scroll = await page.evaluate(() => ({ scrollWidth: document.scrollingElement!.scrollWidth, width: window.innerWidth }));
    expect(scroll.scrollWidth, `scrollWidth ${scroll.scrollWidth} ≤ 視窗寬 ${scroll.width}`).toBeLessThanOrEqual(scroll.width);

    expect(await axeBlocking(page), "/guide：axe serious／critical 必須為 0").toEqual([]);
    expect(errors, `${errors.length} console／page errors`).toEqual([]);
  });

  test("入口：首頁空狀態、側欄或「更多」、頁尾都另開分頁到 /guide，原分頁的示範資料仍在", async ({ page, context }) => {
    test.setTimeout(90_000);
    const errors = collectErrors(page);
    await hideDevOverlay(page);
    await page.goto("/");
    await expect(page.getByTestId("empty-state")).toBeVisible();
    for (const id of ["sidebar", "more", "home", "footer"]) await expectEntryAttributes(page.getByTestId(`guide-entry-${id}`));

    // 首頁空狀態：按鈕列下方一行（陳述句），另開分頁；原分頁仍是空狀態。
    await openEntry(page, context, page.getByTestId("guide-entry-home"), entry.homeHint);
    await expect(page.getByTestId("empty-state")).toBeVisible();

    await loadDemo(page);
    const demoValue = page.getByTestId("kpi-contribution_after_marketing").locator(".kpi-value");
    await expect(page.getByTestId("guide-entry-home")).toHaveCount(0);
    for (const id of ["sidebar", "more", "footer"]) await expectEntryAttributes(page.getByTestId(`guide-entry-${id}`));

    // 側欄（≥ 768）或手機「更多」面板最後一列（≤ 767）。
    if (isMobile(page)) {
      await expect(page.getByTestId("guide-entry-sidebar")).toBeHidden();
      await openMobileMore(page);
      await openEntry(page, context, page.getByTestId("guide-entry-more"), entry.entry);
      // 收起「更多」再點頁尾（面板固定在底部分頁列之上）。
      await page.getByTestId("mobile-tabbar-more").click();
      await expect(page.getByTestId("mobile-tabbar-more")).toHaveAttribute("aria-expanded", "false");
    } else {
      await expect(page.getByTestId("guide-entry-more")).toBeHidden();
      await openEntry(page, context, page.getByTestId("guide-entry-sidebar"), entry.entry);
    }
    await expect(page.getByTestId("kpi-band")).toBeVisible();
    await expect(demoValue).toHaveText(formatAmountL1(DEMO_RESULT));

    // 頁尾「指標定義」旁。
    await openEntry(page, context, page.getByTestId("guide-entry-footer"), entry.entry);
    await expect(page.getByTestId("kpi-band")).toBeVisible();
    await expect(demoValue).toHaveText(formatAmountL1(DEMO_RESULT));
    expect(errors, `${errors.length} console／page errors`).toEqual([]);
  });
});
