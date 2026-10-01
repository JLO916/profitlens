import { appendFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { test, expect, type Page } from "@playwright/test";

async function openPlan(page: Page, investment = "0") {
  await page.goto("/");
  await page.getByRole("button", { name: "進階驗證", exact: true }).click();
  await page.getByLabel("資料集", { exact: true }).selectOption("golden");
  await page.getByRole("button", { name: "載入資料集", exact: true }).click();
  await expect(page.getByTestId("workspace-status")).toContainText("資料已就緒");
  await page.getByLabel("通路", { exact: true }).selectOption("DTC");
  await page.getByRole("button", { name: "情境試算", exact: true }).click();
  await page.getByRole("button", { name: "新增方案", exact: true }).click();
  const card = page.getByTestId("scenario-1");
  await card.getByLabel("方案名稱", { exact: true }).fill("履約改善條件檢核");
  for (const [label, value] of Object.entries({
    "售出量變化（相對 %）": "0", "折扣率變化（百分點）": "0", "單位履約成本變化（相對 %）": "-10",
    "總廣告支出變化（相對 %）": "0", "一次性投入（TWD）": investment,
  })) await card.getByLabel(label, { exact: true }).fill(value);
  await expect(card.getByTestId("scenario-sensitivity")).toHaveCount(0);
  await card.getByLabel("我接受此方案的全部固定假設", { exact: true }).check();
  await card.getByRole("button", { name: "計算方案", exact: true }).click();
  await expect(card.getByTestId("scenario-contribution")).toHaveText(investment === "0" ? "284.00" : "264.00");
  const sensitivity = card.getByTestId("scenario-sensitivity");
  await sensitivity.locator(":scope > summary").focus();
  await page.keyboard.press("Enter");
  await expect(sensitivity.getByTestId("threshold-maintain_baseline")).toBeVisible();
  return { card, sensitivity };
}

test("PL-08 分開零貢獻與維持 baseline 目標，三組 v 明填後獨立重算", async ({ page }, testInfo) => {
  const events: { kind: string; type: string }[] = [];
  page.on("pageerror", error => events.push({ kind: "pageerror", type: error.name }));
  page.on("console", event => { if (event.type() === "error") events.push({ kind: "console", type: event.type() }); });
  const { sensitivity } = await openPlan(page);
  await expect(sensitivity.getByTestId("threshold-zero_contribution")).toContainText("-51.263537906137%");
  await expect(sensitivity.getByTestId("threshold-maintain_baseline")).toContainText("-2.527075812274%");
  await expect(sensitivity.getByTestId("threshold-maintain_baseline")).toContainText("大於或等於精確門檻");
  await expect(sensitivity).toContainText("並非公司淨利損益兩平");
  await expect(sensitivity).toContainText("平台／金流維持原有效淨營收費率");
  await expect(sensitivity).toContainText("不提供成功機率");
  for (const name of ["A", "B", "C"]) await expect(sensitivity.getByLabel(`敏感度 ${name} 售出量變化（相對 %）`, { exact: true })).toHaveValue("");
  await sensitivity.getByRole("button", { name: "重算三組敏感度", exact: true }).click();
  await expect(sensitivity.getByTestId("sensitivity-result")).toContainText("三個售出量假設皆須明填");
  await expect(sensitivity.getByRole("table")).toHaveCount(0);
  for (const [index, value] of ["-3", "-2.5", "0"].entries()) await sensitivity.getByLabel(`敏感度 ${String.fromCharCode(65 + index)} 售出量變化（相對 %）`, { exact: true }).fill(value);
  await sensitivity.getByRole("button", { name: "重算三組敏感度", exact: true }).click();
  const table = sensitivity.getByRole("table");
  await expect(table.getByRole("row", { name: /假設 A/ })).toContainText("267.38");
  await expect(table.getByRole("row", { name: /假設 B/ })).toContainText("270.15");
  await expect(table.getByRole("row", { name: /假設 C/ })).toContainText("284.00");
  await expect(sensitivity).toContainText("不可相加改善額");
  const region = sensitivity.getByRole("region", { name: "三組敏感度條件比較，可水平捲動" });
  await region.focus(); await expect(region).toBeFocused();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", await page.locator("body").evaluate(element => element.clientWidth));
  await mkdir(resolve("verification"), { recursive: true });
  await page.screenshot({ path: resolve(`verification/manager-batch3-regression-sensitivity-${testInfo.project.name}.png`), fullPage: true });
  await appendFile(resolve("verification/manager-batch3-regression-sensitivity-browser.jsonl"), `${JSON.stringify({ project: testInfo.project.name, title: testInfo.title, recorded_at: new Date().toISOString(), events })}\n`);
  expect(events).toEqual([]);
});

test("PL-08 一次性投入門檻跨越原貢獻，非法 v 保留未知而不外插", async ({ page }) => {
  const { sensitivity } = await openPlan(page, "20");
  await expect(sensitivity.getByTestId("threshold-maintain_baseline")).toContainText("1.083032490975%");
  for (const [index, value] of ["1", "1.1", "0"].entries()) await sensitivity.getByLabel(`敏感度 ${String.fromCharCode(65 + index)} 售出量變化（相對 %）`, { exact: true }).fill(value);
  await sensitivity.getByRole("button", { name: "重算三組敏感度", exact: true }).click();
  await expect(sensitivity.getByRole("table")).toContainText("269.54");
  await expect(sensitivity.getByRole("table")).toContainText("270.09");
  await expect(sensitivity.getByRole("table")).toContainText("264.00");
  await sensitivity.getByLabel("敏感度 B 售出量變化（相對 %）", { exact: true }).fill("100.1");
  await expect(sensitivity.getByRole("table")).toHaveCount(0);
  await sensitivity.getByRole("button", { name: "重算三組敏感度", exact: true }).click();
  await expect(sensitivity.getByTestId("sensitivity-result")).toContainText("假設 2");
  await expect(sensitivity.getByRole("table")).toHaveCount(0);
});

test("PL-08 換通路後不顯示可用的舊門檻，未填銷量或未同意仍無衍生分析", async ({ page }) => {
  const { card, sensitivity } = await openPlan(page);
  await card.getByLabel("售出量變化（相對 %）", { exact: true }).fill("");
  await card.getByRole("button", { name: "計算方案", exact: true }).click();
  await expect(card.getByTestId("scenario-contribution")).toHaveCount(0);
  await expect(sensitivity).toHaveCount(0);
  await card.getByLabel("售出量變化（相對 %）", { exact: true }).fill("0");
  await card.getByRole("button", { name: "計算方案", exact: true }).click();
  await sensitivity.locator(":scope > summary").click();
  await page.getByLabel("通路", { exact: true }).selectOption("MARKETPLACE");
  await expect(card).toContainText("已過期");
  await expect(sensitivity.getByTestId("threshold-maintain_baseline")).toHaveCount(0);
  await expect(sensitivity).toContainText("快照已過期");
});
