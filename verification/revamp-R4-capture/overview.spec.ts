import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { labels } from "../../src/i18n";
import { chooseBasis, commitWizard, confirmAndCheck, confirmMappingIfShown, nextFromFiles, openWizard, setWizardFiles } from "../../tests/e2e/import-wizard-helpers";

// R4 截圖：輔助指標橫列、KPI 達成率、趨勢檔期區帶、去年同期快捷（按下後的表單）、資料頁目標／檔期入口；四尺寸。
// 合成資料與 tests/e2e/revamp-r4.spec.ts 相同（2025-06-01～2026-08-31）。
function days(start: string, end: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
function synthetic() {
  const all = days("2025-06-01", "2026-08-31");
  const buffer = (text: string) => Buffer.from(text, "utf8");
  return {
    "sales_daily.csv": { name: "sales_daily.csv", mimeType: "text/csv", buffer: buffer(["date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency", ...all.map(day => `${day},官網,SKU-1,服飾,2,${day < "2026" ? "100.00" : "200.00"},0.00,0.00,40.00,TWD`)].join("\n")) },
    "channel_costs_daily.csv": { name: "channel_costs_daily.csv", mimeType: "text/csv", buffer: buffer(["date,channel,platform_fees,payment_fees,fulfillment_costs,other_variable_costs,currency", ...all.map(day => `${day},官網,5.00,2.00,3.00,0.00,TWD`)].join("\n")) },
    "ad_spend_daily.csv": { name: "ad_spend_daily.csv", mimeType: "text/csv", buffer: buffer(["date,channel,ad_spend,currency", ...all.map(day => `${day},官網,${day < "2026" ? "10.00" : "40.00"},TWD`)].join("\n")) },
  } as const;
}
async function shoot(page: Page, dir: string, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${dir}/${name}-viewport.png` });
  await page.screenshot({ path: `${dir}/${name}-full.jpg`, fullPage: true, type: "jpeg", quality: 70 });
}
const preset = (page: Page, name: string) => page.getByRole("group", { name: labels.shell.sections.presetGroup }).getByRole("button", { name, exact: true });

test("R4 截圖", async ({ page }, testInfo) => {
  const dir = resolve("verification/revamp-R4");
  await mkdir(dir, { recursive: true });
  const suffix = testInfo.project.name;
  await page.goto("/");
  await openWizard(page);
  await setWizardFiles(page, "", synthetic());
  await nextFromFiles(page);
  await confirmMappingIfShown(page);
  await chooseBasis(page, "exclusive");
  await confirmAndCheck(page, "valid");
  await commitWizard(page);
  await preset(page, labels.shell.periods.presets.monthVsPrev).click();
  await page.locator("form.period-form").getByRole("button", { name: labels.shell.buttons.apply, exact: true }).click();
  await expect(page.getByTestId("kpi-net_revenue").locator(".kpi-value")).toHaveText("6,200.00");
  await page.getByRole("button", { name: labels.shell.nav.data.headline, exact: true }).click();
  await page.getByLabel(labels.targets.upload, { exact: true }).setInputFiles({ name: "targets.csv", mimeType: "text/csv", buffer: Buffer.from("period_start,period_end,channel,metric,target\n2026-08-01,2026-08-31,ALL,net_revenue,8000.00\n2026-08-01,2026-08-31,ALL,contribution_after_marketing,4000.00\n2026-07-01,2026-07-31,ALL,gross_profit,5000.00\n") });
  await page.getByLabel(labels.events.upload, { exact: true }).setInputFiles({ name: "events.csv", mimeType: "text/csv", buffer: Buffer.from("start,end,label\n2026-08-10,2026-08-16,夏季特賣\n2026-07-01,2026-07-07,七月慶\n") });
  await expect(page.getByTestId("events-table").locator("tbody tr")).toHaveCount(2);
  await shoot(page, dir, `3-data-targets-events-${suffix}`);
  await page.getByRole("button", { name: labels.shell.nav.overview.headline, exact: true }).click();
  await expect(page.getByTestId("kpi-target-net_revenue")).toBeVisible();
  await shoot(page, dir, `1-overview-assist-targets-${suffix}`);
  await preset(page, labels.shell.periods.presets.yoy).click();
  await expect(page.locator("#previous-start")).toHaveValue("2025-08-01");
  await page.locator("form.period-form").getByRole("button", { name: labels.shell.buttons.apply, exact: true }).click();
  await expect(page.getByTestId("kpi-net_revenue").locator(".kpi-previous")).toContainText("3,100.00");
  await shoot(page, dir, `2-overview-yoy-${suffix}`);
});
