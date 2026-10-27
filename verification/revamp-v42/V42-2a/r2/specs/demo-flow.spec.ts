// R2 review: demo data (no groups) — select unchanged, no drill buttons anywhere, targets loaded → no limit sentence; then a one-member group (自有＝DTC) edge.
import { expect, test } from "@playwright/test";
import { groupOptionValue } from "/Users/j-work/ProfitLens/src/application/channel-settings";
import { hideDevOverlay, loadDemo } from "/Users/j-work/ProfitLens/tests/e2e/launch-helpers-v310";
import { Obs, applySettings, box, chooseScope, closePeriodSheet, collectConsole, drillButtons, editor, fill, groupNameInput, groupSelect, isMobile, kpiValues, labels, meetingOnCurrentScope, navigateTo, openDetails, openEditor, openPeriodSheet, periodBar, scopeSelect, selectModel, shot, shotOf, summaryTitle, ui, viewContent } from "./r2-helpers";

test.describe.configure({ timeout: 600_000 });
const TARGETS = "/Users/j-work/ProfitLens/verification/revamp-v4-capture/targets.csv";

test("R2 demo flow", async ({ page }, testInfo) => {
  const obs = new Obs(`demo-${testInfo.project.name}`);
  const mobile = isMobile(page);
  collectConsole(page, obs);
  page.on("dialog", dialog => { if (dialog.type() === "beforeunload") void dialog.accept(); else void dialog.dismiss(); });
  await hideDevOverlay(page);
  try {
    await page.goto("/");
    await loadDemo(page);
    obs.set("select.demo", await selectModel(page));
    obs.set("pb.demo", await box(periodBar(page)));
    obs.set("kpiBand.demo", await box(page.getByTestId("kpi-band")));
    obs.set("drills.overview", await page.locator("[data-testid^='channel-drill-']").count());
    await openPeriodSheet(page);
    await shotOf(mobile ? page.locator("#period-bar-panel") : periodBar(page), testInfo, "d1-periodbar-demo");
    await closePeriodSheet(page);
    // targets (demo period) → kpi-target rows, no limit sentence
    await navigateTo(page, "data");
    await page.getByLabel(labels.targets.upload, { exact: true }).setInputFiles(TARGETS);
    await expect(page.getByTestId("targets-table").locator("tbody tr")).toHaveCount(3);
    await navigateTo(page, "overview");
    obs.set("targets.demo", { kpiTargets: await page.locator("[data-testid^='kpi-target-']").count(), note: await page.locator(".kpi-targets-note").count(), noteText: await page.getByText(labels.diagnosis.channelsV42.limits.targets, { exact: true }).count() });
    await navigateTo(page, "diagnosis");
    obs.set("drills.diagnosis", await page.locator("[data-testid^='channel-drill-']").count());
    const meeting = await meetingOnCurrentScope(page);
    obs.set("drills.meeting", await drillButtons(meeting).count());
    obs.set("drills.meetingPage", await page.locator("[data-testid^='channel-drill-']").count());
    // single-channel scope in demo (no groups): still no drill buttons, title plain
    const pickInfo = await chooseScope(page, { value: "DTC" }, "DTC");
    obs.set("single.noGroup", { pickInfo, select: await selectModel(page), title: await summaryTitle(page), drills: await page.locator("[data-testid^='channel-drill-']").count() });
    await chooseScope(page, { value: "" }, "");
    // one-member group 自有＝DTC (as baseline 18)
    await openEditor(page);
    await editor(page).getByRole("button", { name: ui.buttons.addGroup, exact: true }).click();
    await expect(editor(page).getByTestId("channel-settings-group-g1")).toBeVisible();
    await groupNameInput(page, 1).fill("自有");
    await groupSelect(page, "DTC").selectOption("g1");
    await applySettings(page);
    await navigateTo(page, "overview");
    await expect(page.getByTestId("kpi-band")).toBeVisible();
    obs.set("oneMember.all", { select: await selectModel(page), pb: await box(periodBar(page)), drills: await page.locator("[data-testid^='channel-drill-']").count(), note: await page.locator(".kpi-targets-note").count(), kpiTargets: await page.locator("[data-testid^='kpi-target-']").count() });
    await openPeriodSheet(page);
    await scopeSelect(page).selectOption({ label: "自有" });
    await expect(scopeSelect(page)).toHaveValue("DTC");
    await expect(viewContent(page)).not.toHaveAttribute("aria-busy", "true");
    await closePeriodSheet(page);
    obs.set("oneMember.pickedGroup", { select: await selectModel(page), title: await summaryTitle(page), drills: await page.locator("[data-testid^='channel-drill-']").count(), note: await page.locator(".kpi-targets-note").count(), noteText: await page.locator(".kpi-targets-note").textContent().catch(() => null), kpiTargets: await page.locator("[data-testid^='kpi-target-']").count(), kpiTargetTexts: await page.locator("[data-testid^='kpi-target-']").allTextContents(), pb: await box(periodBar(page)) });
    await shot(page, testInfo, "d2-overview-one-member-group");
    // ungrouped member (平台 · MARKETPLACE) under 未分組
    await chooseScope(page, { value: "MARKETPLACE" }, "MARKETPLACE");
    obs.set("oneMember.ungroupedPick", { select: await selectModel(page), title: await summaryTitle(page), note: await page.locator(".kpi-targets-note").count() });
    await chooseScope(page, { value: "" }, "");
    obs.set("oneMember.backToAll", { select: await selectModel(page), title: await summaryTitle(page), drills: await page.locator("[data-testid^='channel-drill-']").count(), note: await page.locator(".kpi-targets-note").count() });
    obs.set("kpiAll", await kpiValues(page));
  } finally {
    obs.save();
  }
});
