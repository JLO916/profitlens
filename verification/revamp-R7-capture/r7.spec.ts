import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { fill, labels } from "../../src/i18n";

// R7 上線前人工走查的四尺寸截圖（08 §4 第 4 條）：示範 → 三件事 → 看證據 → 加入待辦 → 試算一個方案 → 會議紀錄 → 匯出 PDF／Excel／Markdown。
// 只拍照，expect 只用來等畫面到位；對應的行為斷言在 tests/e2e/*.spec.ts。
async function shoot(page: Page, dir: string, name: string, anchor?: Locator) {
  if (anchor) await anchor.evaluate(element => element.scrollIntoView({ block: "start" }));
  else await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${dir}/${name}-viewport.png` });
  await page.screenshot({ path: `${dir}/${name}-full.jpg`, fullPage: true, type: "jpeg", quality: 70 });
}
const nav = (page: Page, id: keyof typeof labels.nav) => page.getByRole("button", { name: labels.nav[id].label, exact: true });

test("R7 走查截圖", async ({ page }, testInfo) => {
  const dir = resolve("verification/revamp-R7");
  await mkdir(dir, { recursive: true });
  const suffix = testInfo.project.name;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

  await page.goto("/");
  await shoot(page, dir, `0-landing-${suffix}`);
  await page.getByRole("button", { name: labels.buttons.loadDemo, exact: true }).first().click();
  await expect(page.getByTestId("workspace-status")).toContainText(labels.status.ready.replace("{date}", ""));
  const prompt = page.getByTestId("local-save-prompt");
  await expect(prompt).toBeVisible();
  await shoot(page, dir, `1-demo-save-prompt-${suffix}`);
  await prompt.getByRole("button", { name: labels.autoSave.decline, exact: true }).click();
  await expect(page.getByTestId("top-three")).toBeVisible();
  // 總覽首屏（README 首圖與 public/og.png 的來源：desktop 1440×1000）。
  await shoot(page, dir, `1b-overview-${suffix}`);
  await shoot(page, dir, `2-top-three-${suffix}`, page.getByTestId("top-three"));

  // 看證據：第一個三件事的「看證據」開抽屜。
  await page.getByTestId("top-three").getByRole("button", { name: labels.buttons.viewEvidence, exact: true }).first().click();
  const drawer = page.getByRole("dialog").filter({ hasNot: page.getByTestId("local-save-prompt") }).first();
  await expect(drawer).toBeVisible();
  await shoot(page, dir, `3-evidence-${suffix}`);
  await page.keyboard.press("Escape");

  // 加入待辦：回到看板。
  await page.getByTestId("top-three").getByRole("button", { name: labels.buttons.addToActions, exact: true }).first().click();
  await expect(page.getByTestId("board-card-1")).toBeVisible();
  await shoot(page, dir, `4-action-board-${suffix}`, page.getByTestId("actions-workbench"));

  // 試算一個方案：範本「維持現況」→ 同意 → 計算。
  await nav(page, "scenarios").click();
  await page.getByTestId("decision-workbench").waitFor({ state: "visible" });
  await page.getByTestId("scenario-1").waitFor({ state: "visible" });
  const card = page.getByTestId("scenario-1");
  await card.getByTestId("scenario-preset").selectOption("keep");
  await card.getByTestId("scenario-preset-apply").click();
  await card.getByLabel(labels.scenario.acceptAssumptions, { exact: true }).check();
  await card.getByRole("button", { name: labels.buttons.calculate, exact: true }).click();
  await expect(card.getByTestId("scenario-contribution")).toBeVisible();
  await shoot(page, dir, `5-scenario-${suffix}`, card);

  // 會議紀錄：議程與輸出列。
  await nav(page, "meeting").click();
  await page.getByTestId("meeting-page").waitFor({ state: "visible" });
  await expect(page.getByTestId("manager-summary")).toBeVisible();
  await shoot(page, dir, `6-meeting-${suffix}`);

  // 匯出：Markdown 與 Excel 實際下載；PDF 以替換的 window.print 觸發列印版面。
  const outputs = page.getByTestId("meeting-outputs");
  const [markdown] = await Promise.all([page.waitForEvent("download"), outputs.getByRole("button", { name: labels.buttons.exportMarkdown, exact: true }).click()]);
  expect(markdown.suggestedFilename()).toMatch(/\.md$/);
  const [excel] = await Promise.all([page.waitForEvent("download"), outputs.getByRole("button", { name: labels.buttons.exportExcel, exact: true }).click()]);
  expect(excel.suggestedFilename()).toMatch(/\.xlsx$/);
  await page.evaluate(() => { window.print = () => { document.documentElement.dataset.printInvoked = "true"; }; });
  await outputs.getByRole("button", { name: labels.buttons.exportPdf, exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-print-invoked", "true");
  await page.emulateMedia({ media: "print" });
  await expect(page.getByTestId("manager-summary-print")).toBeVisible();
  await shoot(page, dir, `7-print-${suffix}`);
  await page.emulateMedia({ media: "screen" });
  expect(errors, fill("{n} console／page errors", { n: errors.length })).toEqual([]);
});
