import { expect, test, type Page } from "@playwright/test";
import { clickReplacing, openDownloads, ruleHeadline } from "./replacement-helpers";
import { labels } from "../../src/i18n";
import { csvHeaderKey } from "../../src/application/copy";

// R2 語言與文案層：口徑說明的三個入口、怎麼算的階梯、商品證據不畫階梯、示範通路 alias、CSV 標題列、規則卡模板標題。
async function loadDemo(page: Page) {
  await page.goto("/");
  await clickReplacing(page, page.getByRole("button", { name: labels.buttons.loadDemo, exact: true }));
  await expect(page.getByTestId("kpi-contribution_after_marketing")).toContainText("1,269,792.73");
}
async function loadGolden(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: labels.nav.validation.label, exact: true }).click();
  await page.getByLabel(labels.ui.dashboard.validation.datasetLabel, { exact: true }).selectOption("golden");
  await clickReplacing(page, page.getByRole("button", { name: labels.ui.dashboard.validation.loadButton, exact: true }));
  await expect(page.getByTestId("kpi-contribution_after_marketing")).toContainText("255.00");
}
const basis = (page: Page) => page.getByRole("dialog", { name: labels.basis.title });
const drawer = (page: Page) => page.getByRole("dialog", { name: new RegExp(`${labels.sections.evidence}$`) });

test.describe("R2 口徑說明與怎麼算的", () => {
  test("basis dialog opens from the top bar, the footer and the evidence drawer, and Escape returns focus", async ({ page }) => {
    await loadDemo(page);
    const topbar = page.locator("header.topbar").getByRole("button", { name: labels.buttons.basis, exact: true });
    await topbar.click();
    await expect(basis(page)).toBeVisible();
    await expect(basis(page).getByRole("listitem")).toHaveCount(9);
    await expect(basis(page)).toContainText(labels.basis.items[2]);
    await page.keyboard.press("Escape");
    await expect(basis(page)).toBeHidden();
    await expect(topbar).toBeFocused();
    const footer = page.locator("footer.main-footer").getByRole("button", { name: labels.buttons.basis, exact: true });
    await expect(page.locator("footer.main-footer")).toContainText(labels.basis.footer);
    await footer.click();
    await expect(basis(page)).toBeVisible();
    await basis(page).getByRole("button", { name: labels.buttons.close, exact: true }).click();
    await expect(basis(page)).toBeHidden();
    await expect(footer).toBeFocused();
    await page.getByTestId("kpi-contribution_after_marketing").locator(".kpi-value button").click();
    await expect(drawer(page)).toBeVisible();
    await drawer(page).getByRole("button", { name: labels.buttons.basis, exact: true }).click();
    await expect(basis(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(basis(page)).toBeHidden();
    await expect(drawer(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer(page)).toBeHidden();
  });

  test("the drawer shows the four-level ladder for a KPI and no ladder for a product", async ({ page }) => {
    await loadGolden(page);
    await page.getByTestId("kpi-contribution_after_marketing").locator(".kpi-value button").click();
    const rows = drawer(page).locator(".ladder-table tbody tr");
    await expect(rows).toHaveCount(13);
    await expect(rows.first()).toContainText(labels.metrics.gross_sales.label);
    await expect(rows.last()).toContainText(labels.metrics.contribution_after_marketing.label);
    await expect(rows.last()).toContainText("255.00");
    await expect(drawer(page).locator(".ladder-table tr.current")).toHaveCount(1);
    await expect(drawer(page).getByRole("group", { name: labels.ui.evidenceDrawer.sourceTabsAria })).toBeVisible();
    await expect(drawer(page).locator("details.evidence-technical")).not.toHaveAttribute("open", /.*/);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: labels.nav.products.label, exact: true }).click();
    const table = page.getByTestId("product-table");
    await table.locator("tbody tr").first().getByRole("button").first().click();
    await expect(drawer(page)).toBeVisible();
    await expect(drawer(page).locator(".ladder-table")).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  test("demo channels show the Taiwanese alias while golden keeps raw codes", async ({ page }) => {
    await loadDemo(page);
    await expect(page.getByLabel(labels.ui.dashboard.filter.channel, { exact: true }).locator("option")).toContainText([labels.ui.dashboard.filter.allChannels, labels.demoChannelAlias.DTC, labels.demoChannelAlias.MARKETPLACE]);
    await expect(page.locator(".scope-note")).toContainText(labels.demoChannelAlias.DTC);
    await loadGolden(page);
    await expect(page.locator(".scope-note")).not.toContainText(labels.demoChannelAlias.DTC);
    await expect(page.locator(".scope-note")).toContainText("DTC");
  });

  test("rule cards use glossary headlines and the analysis CSV header reads 中文 (key)", async ({ page }) => {
    await loadGolden(page);
    await page.getByRole("button", { name: labels.nav.diagnosis.label, exact: true }).click();
    await expect(page.getByRole("heading", { name: ruleHeadline("REV_UP_CM_DOWN") }).first()).toBeVisible();
    await expect(page.locator(".diagnostic-card").first()).toContainText(labels.sections.cause);
    await expect(page.locator(".diagnostic-card").first()).toContainText(labels.sections.caution);
    await expect(page.locator(".diagnostic-card").first()).toContainText(labels.rules.REV_UP_CM_DOWN.caution);
    const [download] = await Promise.all([page.waitForEvent("download"), (await openDownloads(page)).getByRole("button", { name: labels.downloads.analysisCsv, exact: true }).click()]);
    const text = await (await import("node:fs/promises")).readFile((await download.path())!, "utf8");
    const header = text.replace(/^﻿/, "").split(/\r?\n/)[0].split(",").map(cell => cell.replace(/^"|"$/g, ""));
    expect(header).toContain(`${labels.csvColumns.row_type} (row_type)`);
    expect(header.map(csvHeaderKey)).toContain("metric_label");
  });
});
