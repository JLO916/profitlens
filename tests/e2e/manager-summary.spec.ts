import { clickReplacing } from "./replacement-helpers";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test as base, type Page } from "@playwright/test";

const test = base.extend<{ audit: string[] }>({
  audit: [async ({ page }, use, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(`pageerror:${error.message}`));
    page.on("console", event => { if (event.type() === "error") errors.push(`console:${event.text()}`); });
    await use(errors);
    await mkdir(resolve("verification"), { recursive: true });
    await appendFile(resolve("verification/review-v2-a-regression-summary-browser.jsonl"), `${JSON.stringify({ test: testInfo.title, project: testInfo.project.name, status: testInfo.status, errors })}\n`);
    expect(errors).toEqual([]);
  }, { auto: true }],
});
async function load(page: Page, name = "golden") {
  await page.goto("/");
  await page.getByRole("button", { name: "進階驗證", exact: true }).click();
  await page.getByLabel("資料集", { exact: true }).selectOption(name);
  await clickReplacing(page, page.getByRole("button", { name: "載入資料集", exact: true }));
  await expect(page.getByTestId("workspace-status")).toContainText(/資料已就緒|部分資料待補/);
  await page.getByRole("button", { name: "經營總覽", exact: true }).click();
  await expect(page.getByTestId("manager-summary")).toBeVisible();
}

test("PL06 golden management summary, drilldown, threshold, scope and wide export", async ({ page }, testInfo) => {
  await load(page);
  const summary = page.getByTestId("manager-summary");
  await expect(summary.getByRole("button", { name: "主管摘要｜合計（DTC、MARKETPLACE） 商品淨營收差額", exact: true })).toHaveText("+220.00");
  const cm = summary.getByRole("button", { name: "主管摘要｜合計（DTC、MARKETPLACE） 行銷後貢獻差額", exact: true });
  await expect(cm).toHaveText("-315.00");
  const marketplace = summary.getByRole("row").filter({ has: page.getByRole("rowheader", { name: /^MARKETPLACE/ }) });
  await expect(marketplace).toContainText("170.00");
  await expect(marketplace).toContainText("-15.00");
  await expect(marketplace).toContainText("-185.00");
  await expect(summary.getByTestId("manager-priority-REV_UP_CM_DOWN")).toHaveCount(1);
  await cm.click();
  await expect(page.getByRole("dialog")).toContainText("本期行銷後貢獻 − 前期行銷後貢獻");
  await expect(page.getByRole("dialog")).toContainText("sales_daily.csv");
  await page.getByRole("button", { name: "關閉公式與來源", exact: true }).click();
  await summary.getByLabel("金額重要性門檻（TWD）").fill("315.01");
  await summary.getByRole("button", { name: "套用摘要門檻" }).click();
  await expect(summary.getByTestId("manager-priority-REV_UP_CM_DOWN")).toHaveCount(0);
  await expect(summary).toContainText("沒有達到此門檻的規則訊號");
  await summary.getByLabel("金額重要性門檻（TWD）").fill("-1");
  await summary.getByRole("button", { name: "套用摘要門檻" }).click();
  await expect(summary.getByRole("alert")).toContainText("大於或等於零");
  await summary.getByLabel("金額重要性門檻（TWD）").fill("0");
  await summary.getByRole("button", { name: "套用摘要門檻" }).click();
  await expect(summary.getByTestId("manager-priority-REV_UP_CM_DOWN")).toBeVisible();
  const csvEvent = page.waitForEvent("download");
  await summary.getByRole("button", { name: "下載通路寬表 CSV", exact: true }).click();
  const download = await csvEvent;
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain('"170.00","-15.00","-185.00"');
  expect(csv).toContain('"400.00","270.00","-130.00"');
  await page.getByLabel("通路", { exact: true }).selectOption("DTC");
  await expect(summary.getByRole("button", { name: "主管摘要｜合計（DTC、MARKETPLACE） 行銷後貢獻差額", exact: true })).toHaveText("-315.00");
  await page.getByRole("button", { name: "以目前資料與範圍更新會議來源", exact: true }).click();
  await expect(summary.getByRole("button", { name: "主管摘要｜合計（DTC） 行銷後貢獻差額", exact: true })).toHaveText("-130.00");
  await expect(summary.getByRole("rowheader", { name: /MARKETPLACE/ })).toHaveCount(0);
  const markdownEvent = page.waitForEvent("download");
  await summary.getByRole("button", { name: "下載主管摘要 Markdown", exact: true }).click();
  const markdown = await readFile((await (await markdownEvent).path())!, "utf8");
  expect(markdown.split("## 技術稽核附錄")[0]).toContain("範圍：DTC");
  expect(markdown.split("## 技術稽核附錄")[0]).not.toContain("MARKETPLACE");
  await page.screenshot({ path: resolve(`verification/review-v2-a-regression-summary-${testInfo.project.name}.png`), fullPage: true });
});

test("PL06 unknown priorities survive a high threshold without zero contribution", async ({ page }) => {
  await load(page, "missing-cogs");
  const summary = page.getByTestId("manager-summary");
  await summary.getByLabel("金額重要性門檻（TWD）").fill("99999999");
  await summary.getByRole("button", { name: "套用摘要門檻" }).click();
  await expect(summary.getByTestId("manager-priority-MISSING_CRITICAL_DATA")).toBeVisible();
  await expect(summary.getByRole("button", { name: "主管摘要｜合計（DTC、MARKETPLACE） 行銷後貢獻差額", exact: true })).toHaveText("資料待補");
  await expect(summary.getByTestId("manager-priority-MISSING_CRITICAL_DATA")).toContainText("不能估算金額");
});

test("PL09 print uses a dedicated manager draft and retains technical audit downloads", async ({ page }, testInfo) => {
  // Replaces only the blocking OS print dialog; print-media layout is still real.
  await page.addInitScript(() => { window.print = () => { document.documentElement.dataset.printInvoked = "true"; }; });
  await load(page);
  await page.getByTestId("manager-summary").getByRole("button", { name: "列印主管摘要", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-print-invoked", "true");
  await page.emulateMedia({ media: "print" });
  const print = page.getByTestId("manager-summary-print");
  await expect(print).toBeVisible();
  await expect(print).toContainText("草稿");
  await expect(print).toContainText("+220.00");
  await expect(print).toContainText("-315.00");
  await expect(page.getByTestId("manager-summary")).toBeHidden();
  await page.screenshot({ path: resolve(`verification/review-v2-a-regression-summary-print-${testInfo.project.name}.png`), fullPage: true });
  if (testInfo.project.name === "desktop") await page.pdf({ path: resolve("verification/review-v2-a-regression-summary-print.pdf"), format: "A4", printBackground: true });
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.getByTestId("manager-summary-print")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "下載目前分析 CSV", exact: true })).toBeVisible();
});
