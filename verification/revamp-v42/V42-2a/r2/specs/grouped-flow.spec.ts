// R2 review: grouped flow on the 4-channel synthetic fixture (items 1–6, 8 of the brief). Observations go to obs/grouped-<project>.json; screenshots to shots/<project>/.
import { expect, test } from "@playwright/test";
import { groupOptionValue, SUBSET_OPTION_VALUE } from "/Users/j-work/ProfitLens/src/application/channel-settings";
import { importSynthetic } from "/Users/j-work/ProfitLens/tests/e2e/chart-helpers-v4";
import { hideDevOverlay } from "/Users/j-work/ProfitLens/tests/e2e/launch-helpers-v310";
import { startChannelContext } from "/Users/j-work/ProfitLens/tests/e2e/replacement-helpers";
import { Obs, R2, activeDesc, applySettings, axeRun, backup, box, chooseScope, closePeriodSheet, collectConsole, configureGroups, drillButtons, editor, fill, G1, G2, groupNameInput, groupSelect, hiddenFocusables, isMobile, kpiValues, labels, meetingOnCurrentScope, metaValue, NAMES, navigateTo, openDetails, openEditor, openPeriodSheet, periodBar, periodSummaryVisibleText, reloadAndRestore, scopeSelect, selectModel, selectTextFit, shot, shotOf, summaryTitle, tabTo, textOwners, ui, v42, viewContent, withoutGroups } from "./r2-helpers";

test.describe.configure({ timeout: 900_000 });
const G1_VALUE = groupOptionValue("g1");
const LONG_NAME = "自有通路群組名稱測試".repeat(4); // 40 chars

test("R2 grouped flow", async ({ page }, testInfo) => {
  const obs = new Obs(`grouped-${testInfo.project.name}`);
  const mobile = isMobile(page);
  obs.set("viewport", page.viewportSize());
  collectConsole(page, obs);
  page.on("dialog", dialog => { if (dialog.type() === "beforeunload") void dialog.accept(); else void dialog.dismiss(); });
  await hideDevOverlay(page);
  try {
    await page.goto("/");
    // ── S1 no groups (fresh import) ──
    await importSynthetic(page);
    const kpiAll = await kpiValues(page);
    obs.set("kpiAll", kpiAll);
    obs.set("pb.noGroup", await box(periodBar(page)));
    obs.set("kpiBand.noGroup", await box(page.getByTestId("kpi-band")));
    obs.set("select.noGroup", await selectModel(page));
    obs.set("g4.noGroup", { rows: await page.getByTestId("channel-mix").locator("th[scope='row']").count(), firstRow: await box(page.getByTestId("channel-mix").locator("th[scope='row']").first()), table: await box(page.getByTestId("channel-mix").locator("table").first()), drills: await drillButtons(page.getByTestId("channel-mix")).count() });
    await openPeriodSheet(page);
    obs.set("pb.noGroup.sheetOpen", mobile ? await box(page.locator("#period-bar-panel")) : null);
    await shotOf(mobile ? page.locator("#period-bar-panel") : periodBar(page), testInfo, "s1-periodbar-nogroup");
    await closePeriodSheet(page);

    // ── S2 groups configured, scope still all ──
    await configureGroups(page);
    await navigateTo(page, "overview");
    await expect(page.getByTestId("kpi-band")).toBeVisible();
    obs.set("pb.groupedAll", await box(periodBar(page)));
    obs.set("kpiBand.groupedAll", await box(page.getByTestId("kpi-band")));
    obs.set("select.groupedAll", await selectModel(page));
    obs.set("g4.groupedAll", { rows: await page.getByTestId("channel-mix").locator("th[scope='row']").count(), firstRow: await box(page.getByTestId("channel-mix").locator("th[scope='row']").first()), table: await box(page.getByTestId("channel-mix").locator("table").first()), drills: await drillButtons(page.getByTestId("channel-mix")).count() });
    await openPeriodSheet(page);
    obs.set("pb.groupedAll.sheetOpen", mobile ? await box(page.locator("#period-bar-panel")) : null);
    await shotOf(mobile ? page.locator("#period-bar-panel") : periodBar(page), testInfo, "s2-periodbar-grouped-all");
    await closePeriodSheet(page);
    await shot(page, testInfo, "s2-overview-grouped-all");

    // ── S3 select 自有 ──
    const visibleBefore = await periodSummaryVisibleText(page);
    const titleBefore = await summaryTitle(page);
    const panelChildrenBefore = await page.locator("#period-bar-panel").evaluate(el => el.children.length);
    const chooseInfo = await chooseScope(page, { label: G1 }, G1_VALUE);
    obs.set("choose.g1", chooseInfo);
    const visibleAfter = await periodSummaryVisibleText(page);
    const titleAfter = await summaryTitle(page);
    obs.set("summary", { visibleBefore, visibleAfter, titleBefore, titleAfter, panelChildrenBefore, panelChildrenAfter: await page.locator("#period-bar-panel").evaluate(el => el.children.length) });
    expect.soft(visibleAfter, "period summary visible text unchanged").toBe(visibleBefore);
    expect.soft(titleAfter).toContain(fill(labels.shell.scopeV42.groupWithMembers, { group: G1, members: `${NAMES.DTC}、${NAMES.SOCIAL}` }));
    const kpiGroup = await kpiValues(page);
    obs.set("kpiGroup", kpiGroup);
    expect.soft(kpiGroup.net_revenue, "net revenue recomputed for group").not.toBe(kpiAll.net_revenue);
    obs.set("pb.groupScope", await box(periodBar(page)));
    obs.set("kpiBand.groupScope", await box(page.getByTestId("kpi-band")));
    obs.set("select.groupScope", await selectModel(page));
    await openPeriodSheet(page);
    obs.set("pb.groupScope.sheetOpen", mobile ? await box(page.locator("#period-bar-panel")) : null);
    await shotOf(mobile ? page.locator("#period-bar-panel") : periodBar(page), testInfo, "s3-periodbar-group-scope");
    await closePeriodSheet(page);
    await shot(page, testInfo, "s3-overview-group-scope");

    // ── S4 seven pages in group scope ──
    const pages: Record<string, unknown> = {};
    pages.overview = { g4Rows: await page.getByTestId("channel-mix").locator("th[scope='row']").allTextContents(), drills: await drillButtons(page.getByTestId("channel-mix")).count(), targetsNote: await page.locator(".kpi-targets-note").count(), owners蝦皮: await textOwners(page, NAMES.MARKETPLACE), owners直播: await textOwners(page, NAMES.LIVE) };
    await navigateTo(page, "diagnosis");
    pages.diagnosis = { secScope: await page.getByTestId("channel-compare").locator(".sec-scope").textContent(), rows: await page.getByTestId("channel-compare").locator("th[scope='row']").count(), drills: await drillButtons(page.getByTestId("channel-compare")).count(), owners蝦皮: await textOwners(page, NAMES.MARKETPLACE), owners直播: await textOwners(page, NAMES.LIVE) };
    await shot(page, testInfo, "s4-diagnosis-group", { fullPage: true });
    await navigateTo(page, "products");
    pages.products = { scope: await page.getByTestId("product-scope").textContent(), owners蝦皮: await textOwners(page, NAMES.MARKETPLACE), owners直播: await textOwners(page, NAMES.LIVE) };
    await navigateTo(page, "scenarios");
    await startChannelContext(page);
    const scenarioOptions = await page.getByTestId("scenario-channel").locator("option").allTextContents();
    pages.scenarios = { options: scenarioOptions, value: await page.getByTestId("scenario-channel").inputValue() };
    // pick the second member → baseline recomputed for that channel
    await page.getByTestId("scenario-channel").selectOption("SOCIAL");
    await startChannelContext(page);
    await expect(page.getByRole("alert", { name: labels.scenarios.baselineFailed ?? "__none__" })).toHaveCount(0).catch(() => undefined);
    const alerts = await page.getByTestId("decision-workbench").getByRole("alert").allTextContents();
    (pages.scenarios as Record<string, unknown>).afterSocial = { value: await page.getByTestId("scenario-channel").inputValue(), alerts, cardText: ((await page.getByTestId("scenario-1").textContent()) ?? "").slice(0, 300), others: await page.getByTestId("scenario-other-channels").count() ? await page.getByTestId("scenario-other-channels").textContent() : null };
    await shot(page, testInfo, "s4-scenarios-group", { fullPage: true });
    await navigateTo(page, "actions");
    pages.actions = { mainText: ((await page.locator("main").innerText()) ?? "").slice(0, 400), owners蝦皮: await textOwners(page, NAMES.MARKETPLACE), owners直播: await textOwners(page, NAMES.LIVE) };
    const meeting = await meetingOnCurrentScope(page);
    pages.meeting = { scopeLine: await meeting.locator(".meeting-scope-line").textContent(), agenda3Rows: await meeting.getByTestId("meeting-agenda-3").locator("th[scope='row']").count(), agenda3Drills: await drillButtons(meeting.getByTestId("meeting-agenda-3")).count(), allDrills: await drillButtons(meeting).count(), owners蝦皮: await textOwners(page, NAMES.MARKETPLACE), owners直播: await textOwners(page, NAMES.LIVE) };
    await shot(page, testInfo, "s4-meeting-group", { fullPage: true });
    await navigateTo(page, "data");
    pages.data = { scopeChannels: await metaValue(page, labels.data.panel.meta.scopeChannels).textContent(), channels: await metaValue(page, labels.data.panel.meta.channels).textContent() };
    obs.set("pages.group", pages);

    // ── S5 drill buttons: overview (Tab + Enter), diagnosis (Tab + Enter), meeting (click) ──
    await navigateTo(page, "overview");
    const g4 = page.getByTestId("channel-mix");
    const drillDTC = g4.getByTestId("channel-drill-DTC");
    const drillAttrs = { text: await drillDTC.textContent(), aria: await drillDTC.getAttribute("aria-label"), inTh: await g4.locator("th[scope='row']").filter({ has: page.getByTestId("channel-drill-DTC") }).count(), box: await box(drillDTC) };
    const tab = await tabTo(page, drillDTC);
    const b = await drillDTC.boundingBox();
    if (b) await shot(page, testInfo, "s5-drill-focus-overview", { clip: { x: Math.max(0, b.x - 40), y: Math.max(0, b.y - 16), width: Math.min(b.width + 200, page.viewportSize()!.width), height: b.height + 32 } });
    await page.keyboard.press("Enter");
    await expect(scopeSelect(page)).toHaveValue("DTC");
    await expect(viewContent(page)).not.toHaveAttribute("aria-busy", "true");
    obs.set("drill.overview", { ...drillAttrs, tab, afterEnter: { select: await selectModel(page), title: await summaryTitle(page), drillsLeft: await drillButtons(g4).count(), pb: await box(periodBar(page)), kpi: await kpiValues(page), focusAfter: await activeDesc(page) } });
    await shot(page, testInfo, "s5-overview-after-drill");
    // back to group, then diagnosis drill (SOCIAL) via keyboard
    await chooseScope(page, { label: G1 }, G1_VALUE);
    await navigateTo(page, "diagnosis");
    const compare = page.getByTestId("channel-compare");
    const drillSOCIAL = compare.getByTestId("channel-drill-SOCIAL");
    const drillSocialAria = await drillSOCIAL.getAttribute("aria-label");
    const tab2 = await tabTo(page, drillSOCIAL);
    await page.keyboard.press("Enter");
    await expect(scopeSelect(page)).toHaveValue("SOCIAL");
    await expect(viewContent(page)).not.toHaveAttribute("aria-busy", "true");
    obs.set("drill.diagnosis", { aria: drillSocialAria, tab: tab2, afterEnter: { select: await selectModel(page), title: await summaryTitle(page), secScope: await compare.locator(".sec-scope").textContent(), drillsLeft: await drillButtons(compare).count(), focusAfter: await activeDesc(page) } });
    await shot(page, testInfo, "s5-diagnosis-after-drill", { fullPage: true });
    // back to group, meeting drill (click; agenda 3 wide table is in a <details>)
    await chooseScope(page, { label: G1 }, G1_VALUE);
    const meeting2 = await meetingOnCurrentScope(page);
    const wide = meeting2.getByTestId("meeting-agenda-3").locator("details.meeting-wide-table");
    await openDetails(wide);
    const drillM = meeting2.getByTestId("meeting-agenda-3").getByTestId("channel-drill-DTC");
    await drillM.scrollIntoViewIfNeeded();
    const mb = await drillM.boundingBox();
    await drillM.click();
    await expect(scopeSelect(page)).toHaveValue("DTC");
    await expect(viewContent(page)).not.toHaveAttribute("aria-busy", "true");
    obs.set("drill.meeting", { buttonBox: mb, afterClick: { select: await selectModel(page), title: await summaryTitle(page), banner: await meeting2.getByTestId("review-view-difference").count(), scopeLine: await meeting2.locator(".meeting-scope-line").textContent(), drillsLeft: await drillButtons(meeting2).count() } });
    await shot(page, testInfo, "s5-meeting-after-drill", { fullPage: true });
    await chooseScope(page, { label: G1 }, G1_VALUE);

    // ── S6 subset without a matching group (restore a backup with groups emptied) ──
    await navigateTo(page, "overview");
    const text = await backup(page);
    const wire = JSON.parse(text);
    obs.set("backup", { schema: wire.schema_version, channel_settings: wire.payload.channel_settings, filters: wire.payload.active.filters.channels });
    await reloadAndRestore(page, withoutGroups(text));
    await expect(scopeSelect(page)).toHaveValue(SUBSET_OPTION_VALUE);
    const subsetModel = await selectModel(page);
    const subsetAria = await scopeSelect(page).ariaSnapshot();
    const subsetKpi = await kpiValues(page);
    obs.set("subset", { select: subsetModel, ariaSnapshot: subsetAria, title: await summaryTitle(page), visible: await periodSummaryVisibleText(page), kpi: subsetKpi, kpiEqualsGroup: JSON.stringify(subsetKpi) === JSON.stringify(kpiGroup), drills: await page.locator("[data-testid^='channel-drill-']").count(), pb: await box(periodBar(page)), textFit: await selectTextFit(page) });
    expect.soft(subsetKpi, "subset KPI equals group-scope KPI").toEqual(kpiGroup);
    await shotOf(periodBar(page), testInfo, "s6-periodbar-subset-closed");
    if (mobile) { await openPeriodSheet(page); await shotOf(page.locator("#period-bar-panel"), testInfo, "s6-sheet-subset"); obs.set("subset.sheetOpen", await box(page.locator("#period-bar-panel"))); await closePeriodSheet(page); }
    // try to pick the disabled option
    await openPeriodSheet(page);
    let pickError: string | null = null;
    try { await scopeSelect(page).selectOption({ value: SUBSET_OPTION_VALUE }, { timeout: 3000 }); } catch (error) { pickError = String((error as Error).message).split("\n")[0]; }
    const valueAfterPick = await scopeSelect(page).inputValue();
    // leave the state by picking another option (macOS Chromium opens the popup on ArrowUp, so use selectOption)
    await scopeSelect(page).focus();
    await scopeSelect(page).selectOption({ value: "SOCIAL" });
    await expect(scopeSelect(page)).toHaveValue("SOCIAL");
    await expect(viewContent(page)).not.toHaveAttribute("aria-busy", "true");
    const afterArrow = await selectModel(page);
    obs.set("subset.leave", { pickError, valueAfterPick, afterPickSocial: { value: afterArrow.value, selected: afterArrow.selected, optionTexts: afterArrow.optionTexts, focus: await activeDesc(page) }, title: await summaryTitle(page) });
    await scopeSelect(page).selectOption({ value: "" });
    await expect(scopeSelect(page)).toHaveValue("");
    await expect(viewContent(page)).not.toHaveAttribute("aria-busy", "true");
    await closePeriodSheet(page);
    const kpiAllAgain = await kpiValues(page);
    obs.set("subset.leaveAll", { kpiEqualsAll: JSON.stringify(kpiAllAgain) === JSON.stringify(kpiAll), select: await selectModel(page) });
    // restore the full backup → group scope
    await reloadAndRestore(page, text);
    await expect(scopeSelect(page)).toHaveValue(G1_VALUE);
    obs.set("restoreFull", { select: await selectModel(page), title: await summaryTitle(page), kpiEqualsGroup: JSON.stringify(await kpiValues(page)) === JSON.stringify(kpiGroup) });

    // ── S7 targets: synthetic-period targets.csv → note only in group scope ──
    await navigateTo(page, "data");
    await page.getByLabel(labels.targets.upload, { exact: true }).setInputFiles(`${R2}/data/targets-synthetic.csv`);
    await expect(page.getByTestId("targets-table").locator("tbody tr")).toHaveCount(3);
    const targetIssues = await page.getByTestId("targets-issues").count();
    await navigateTo(page, "overview");
    const noteGroup = { count: await page.locator(".kpi-targets-note").count(), text: await page.locator(".kpi-targets-note").textContent().catch(() => null), kpiTargets: await page.locator("[data-testid^='kpi-target-']").count(), box: await box(page.locator(".kpi-targets-note")) };
    await shot(page, testInfo, "s7-overview-group-targets-note");
    await chooseScope(page, { value: "" }, "");
    const noteAll = { count: await page.locator(".kpi-targets-note").count(), kpiTargets: await page.locator("[data-testid^='kpi-target-']").count() };
    await chooseScope(page, { value: "DTC" }, "DTC");
    const noteSingle = { count: await page.locator(".kpi-targets-note").count(), kpiTargets: await page.locator("[data-testid^='kpi-target-']").count() };
    await chooseScope(page, { label: G1 }, G1_VALUE);
    obs.set("targets", { issues: targetIssues, noteGroup, noteAll, noteSingle, expectedText: v42.limits.targets });
    expect.soft(noteGroup.count, "note in group scope with targets").toBe(1);
    expect.soft(noteAll.count, "no note in all scope").toBe(0);
    expect.soft(noteSingle.count, "no note in single scope").toBe(0);

    // ── S8 variants: one channel ungrouped; 40-char group name ──
    await openEditor(page);
    await groupSelect(page, "LIVE").selectOption("");
    await applySettings(page);
    await navigateTo(page, "overview");
    obs.set("ungrouped", { select: await selectModel(page), pb: await box(periodBar(page)) });
    await openPeriodSheet(page);
    await shotOf(mobile ? page.locator("#period-bar-panel") : periodBar(page), testInfo, "s8-periodbar-ungrouped-variant");
    await closePeriodSheet(page);
    await openEditor(page);
    await groupNameInput(page, 1).fill(LONG_NAME);
    await applySettings(page);
    await navigateTo(page, "overview");
    await expect(scopeSelect(page)).toHaveValue(G1_VALUE);
    obs.set("longName", { select: await selectModel(page), pb: await box(periodBar(page)), pbPanel: await box(page.locator("#period-bar-panel")), selectBox: await box(scopeSelect(page)), textFit: await selectTextFit(page), title: await summaryTitle(page), summaryBox: await box(page.getByTestId("period-summary")) });
    await openPeriodSheet(page);
    obs.set("longName.sheetOpen", mobile ? { panel: await box(page.locator("#period-bar-panel")), textFit: await selectTextFit(page) } : null);
    await shotOf(mobile ? page.locator("#period-bar-panel") : periodBar(page), testInfo, "s8-periodbar-longname");
    await closePeriodSheet(page);
    await shot(page, testInfo, "s8-overview-longname");
    // restore names/groups
    await openEditor(page);
    await groupNameInput(page, 1).fill(G1);
    await groupSelect(page, "LIVE").selectOption("g2");
    await applySettings(page);
    await navigateTo(page, "overview");
    await expect(scopeSelect(page)).toHaveValue(G1_VALUE);
    obs.set("restoredSettings", { select: await selectModel(page) });

    // ── S10 要注意 four sentences ──
    await openEditor(page);
    const notes = editor(page).locator("details.channel-settings-notes");
    await openDetails(notes);
    const sentences = await notes.locator("p").allTextContents();
    obs.set("notes", { sentences, summary: await notes.locator("summary").textContent(), expected: [ui.notes.names, v42.limits.rules, v42.limits.scenario, v42.limits.targets] });
    await shotOf(notes, testInfo, "s10-notes-open");

    // ── S9 axe + hidden focusables: group scope then single channel (drill) ──
    const axe: Record<string, unknown> = {};
    const runPages = async (tag: string) => {
      for (const id of ["overview", "diagnosis", "meeting", "scenarios", "data"] as const) {
        if (id === "meeting") await meetingOnCurrentScope(page); else await navigateTo(page, id);
        if (id === "scenarios") await startChannelContext(page);
        if (id === "overview") await expect(page.getByTestId("kpi-band")).toBeVisible();
        const result = await axeRun(page);
        axe[`${tag}.${id}`] = { blocking: result.blocking, others: result.all.filter(r => !result.blocking.includes(r)).map(r => `${r.impact} ${r.id} (${r.targets.length})`), hiddenFocusables: await hiddenFocusables(page) };
      }
    };
    await navigateTo(page, "overview");
    await runPages("group");
    await navigateTo(page, "overview");
    await page.getByTestId("channel-mix").getByTestId("channel-drill-DTC").click();
    await expect(scopeSelect(page)).toHaveValue("DTC");
    await expect(viewContent(page)).not.toHaveAttribute("aria-busy", "true");
    await runPages("drilled");
    // also the subset state once more (axe on overview)
    await reloadAndRestore(page, withoutGroups(text));
    await expect(scopeSelect(page)).toHaveValue(SUBSET_OPTION_VALUE);
    if (mobile) await openPeriodSheet(page);
    const subsetAxe = await axeRun(page);
    axe["subset.overview"] = { blocking: subsetAxe.blocking, others: subsetAxe.all.map(r => `${r.impact} ${r.id}`), hiddenFocusables: await hiddenFocusables(page) };
    obs.set("axe", axe);
    for (const [key, value] of Object.entries(axe)) expect.soft((value as { blocking: unknown[] }).blocking, `axe ${key}`).toEqual([]);
  } finally {
    obs.save();
  }
});
