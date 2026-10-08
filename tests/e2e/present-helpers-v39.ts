import { expect, type Locator, type Page } from "@playwright/test";
import { fill, labels } from "../../src/i18n";
import { formatAmountL1 } from "../../src/application/presentation";
import { clickReplacing, dismissSavePrompt, periodSummaryVisibleText } from "./replacement-helpers";

// V3-9b F22 投影模式（PRD §9.7、D-V3-23＝A）的 E2E 小工具（代理 E3）。共用的 replacement-helpers 不動；這裡只放投影模式的定位與期待值組字。
const copy = labels.shell.presentV3;
// fixtures/demo：本期扣廣告後貢獻 1269792.73（KPI 帶 L1）。
const DEMO_RESULT = "1269792.73";

/** 頁首「投影模式／離開投影」按鈕（div.page-present 內；只有總覽與會議頁在有資料時才渲染；≤ 767px 用 CSS 隱藏但掛載）。 */
export const presentToggle = (page: Page) => page.getByTestId("present-toggle");
/** <html>：投影中帶 data-mode="present"。 */
export const htmlRoot = (page: Page) => page.locator("html");

/** 載入示範資料（同 pnl-table.spec 的做法）：等 KPI 帶出現本期扣廣告後貢獻，再關掉首次保存提示。 */
export async function loadDemoForPresent(page: Page) {
  await page.goto("/");
  await clickReplacing(page, page.getByRole("button", { name: labels.shell.buttons.loadDemo, exact: true }));
  await expect(page.getByTestId("kpi-contribution_after_marketing").locator(".kpi-value")).toHaveText(formatAmountL1(DEMO_RESULT));
  await expect(page.getByTestId("local-save-prompt")).toBeVisible();
  await dismissSavePrompt(page);
  await expect(page.getByTestId("local-save-prompt")).toHaveCount(0);
}

/** 平常的按鈕狀態：aria-pressed=false、文字「投影模式」、沒有 aria-keyshortcuts，<html> 沒有 data-mode。 */
export async function expectPresentOff(page: Page) {
  const toggle = presentToggle(page);
  await expect(toggle).toHaveCount(1);
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(toggle).toHaveText(copy.enter);
  await expect(toggle).not.toHaveAttribute("aria-keyshortcuts", /.*/);
  await expect(htmlRoot(page)).not.toHaveAttribute("data-mode", /.*/);
}

/** 點按鈕進入投影：<html data-mode=present>、aria-pressed=true、文字「離開投影」、aria-keyshortcuts=Escape。 */
export async function enterPresent(page: Page) {
  await expectPresentOff(page);
  await presentToggle(page).click();
  await expectPresentOn(page);
}
export async function expectPresentOn(page: Page) {
  const toggle = presentToggle(page);
  await expect(htmlRoot(page)).toHaveAttribute("data-mode", "present");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toHaveText(copy.exit);
  await expect(toggle).toHaveAttribute("aria-keyshortcuts", "Escape");
}

/**
 * 投影中頁首的一行期間文字：fill(presentV3.period, { period, channels })。period 取期間列（隱藏但掛載）的期間摘要可見文字（不含 sr-only 的範圍說明），
 * 不寫死日期；channels 預設「全部通路」（labels.shell.periodBar.filter.allChannels）。
 */
export async function expectedPresentPeriod(page: Page, channels: string = labels.shell.periodBar.filter.allChannels) {
  const period = await periodSummaryVisibleText(page);
  expect(period.length).toBeGreaterThan(0);
  return fill(copy.period, { period, channels });
}

/** M1：投影中隱藏的區塊仍掛載（toBeAttached），但看不到（toBeHidden）。 */
export async function expectMountedHidden(locator: Locator) {
  await expect(locator.first()).toBeAttached();
  const count = await locator.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) await expect(locator.nth(index)).toBeHidden();
}

/** 量測：KPI 主值字級（is-key 一格與其他格）、body 與 h2 字級、main 的寬與左緣、文件有沒有橫向溢出。 */
export async function presentMetrics(page: Page) {
  return page.evaluate(() => {
    const px = (element: Element | null) => element ? getComputedStyle(element).fontSize : "";
    const key = document.querySelector(".kpi.is-key .kpi-value");
    const others = [...document.querySelectorAll(".kpi:not(.is-key) .kpi-value")].map(px);
    const main = document.querySelector(".app-shell main")!.getBoundingClientRect();
    const root = document.documentElement;
    return {
      keyKpi: px(key), otherKpis: others, body: px(document.body), h2: px(document.querySelector(".kpi-section ~ .top-three h2, .top-three h2")),
      mainWidth: Math.round(main.width), mainLeft: Math.round(main.left),
      scrollWidth: root.scrollWidth, clientWidth: root.clientWidth,
    };
  });
}

/** :root 上 token 的計算值（例如 --text-14）。 */
export const rootToken = (page: Page, name: string) => page.evaluate(token => getComputedStyle(document.documentElement).getPropertyValue(token).trim(), name);
