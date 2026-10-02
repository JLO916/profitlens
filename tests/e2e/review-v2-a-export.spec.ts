import { openMeeting } from "./replacement-helpers";
import { fill, labels } from "../../src/i18n";
import { metricDefinitions } from "../../src/application/presentation";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test as base, type Locator, type Page, type TestInfo } from "@playwright/test";

const test = base.extend<{ audit: string[] }>({
  audit: [async ({ page }, use, info) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(`pageerror:${error.message}`));
    page.on("console", event => { if (event.type() === "error") errors.push(`console:${event.text()}`); });
    await use(errors);
    await mkdir(resolve("verification"), { recursive: true });
    await appendFile(resolve("verification/review-v2-a-decision-browser.jsonl"), `${JSON.stringify({ test: info.title, project: info.project.name, status: info.status, errors })}\n`);
    expect(errors).toEqual([]);
  }, { auto: true }],
});

const summaryCopy = labels.ui.managerSummary;
const contributionLabel = metricDefinitions.contribution_after_marketing.label;
const netRevenueLabel = metricDefinitions.net_revenue.label;
/** R2: the "no pinned actions" notice and the "no actions at all" message both come from labels.ui.managerSummary. */
const notice = summaryCopy.unpinnedNotice;
const noActions = summaryCopy.noActions;
const actionName = (index: number) => `匯出驗收行動第${index}項`;
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** R2 moved the Markdown technical appendix under labels.sections.technicalDetails ("## 技術細節"). */
const technicalHeading = `## ${labels.sections.technicalDetails}`;
/** review-workbench renders `改用這個待辦的最新數據：{name}`; match by the template prefix. */
const refreshActionRef = new RegExp(`^${escapeRegExp(labels.ui.reviewWorkbench.refreshActionRef.split("{name}")[0])}`);
/** Golden keeps raw channel codes (demo alias applies only to synthetic-demo datasets); scope kind "all" renders as labels.sections.total. */
const goldenFactLabel = fill(labels.ui.actionsWorkbench.factLabel, { start: "2026-08-02", end: "2026-08-02", metric: contributionLabel, scope: "DTC、MARKETPLACE", scopeKind: labels.sections.total, value: "255.00" });

async function saveDownload(page: Page, button: Locator, path: string) {
  const pending = page.waitForEvent("download");
  await button.click();
  const download = await pending;
  const destination = resolve(path);
  await download.saveAs(destination);
  return readFile(destination, "utf8");
}

/** R2 CSV headers are「中文名稱 (english_key)」; keep the machine key so cell lookups stay on the English field names. */
const csvKey = (header: string) => /\(([^()]+)\)\s*$/.exec(header)?.[1] ?? header;

/** Independent quote-aware reader; inspect downloaded cells rather than substring matches. */
function csvRecords(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  const value = text.replace(/^﻿/, "");
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (character === '"') {
      if (quoted && value[index + 1] === '"') { cell += '"'; index++; } else quoted = !quoted;
    } else if (character === "," && !quoted) { row.push(cell); cell = ""; }
    else if (!quoted && (character === "\r" || character === "\n")) {
      if (character === "\r" && value[index + 1] === "\n") index++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += character;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  expect(quoted).toBe(false);
  const headers = rows.shift()!.map(csvKey);
  return rows.map(values => { expect(values).toHaveLength(headers.length); return Object.fromEntries(headers.map((key, index) => [key, values[index]])); });
}

async function checkPrint(page: Page, info: TestInfo, pinned: boolean) {
  const summary = page.getByTestId("manager-summary");
  await summary.getByRole("button", { name: labels.buttons.print, exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-print-invoked", "true");
  await page.emulateMedia({ media: "print" });
  const print = page.getByTestId("manager-summary-print");
  await expect(print).toBeVisible();
  await expect(summary).toBeHidden();
  await expect(print).toContainText(fill(summaryCopy.printThresholdLine, { amount: "1,000.00" }));
  await expect(print).toContainText("-315.00");
  await expect(print).toContainText("+220.00");
  const main = print.locator(":scope > ul > li");
  const appendix = print.locator(":scope > section").filter({ has: page.getByRole("heading", { name: summaryCopy.appendixHeading, exact: true }) });
  await expect(main).toHaveCount(pinned ? 3 : 0);
  await expect(appendix.locator(":scope > ul > li")).toHaveCount(pinned ? 5 : 8);
  for (let index = 1; index <= 8; index++) await expect((pinned && index <= 3 ? main : appendix).getByText(actionName(index), { exact: true })).toBeVisible();
  if (!pinned) {
    await expect(print).toContainText(notice);
    await expect(print).not.toContainText(noActions);
  }
  const suffix = `${pinned ? "pinned" : "unpinned"}-${info.project.name}`;
  await page.screenshot({ path: resolve(`verification/review-v2-a-decision-print-${suffix}.png`), fullPage: true });
  if (info.project.name === "desktop") await page.pdf({ path: resolve(`verification/review-v2-a-decision-print-${suffix}.pdf`), format: "A4", printBackground: true });
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(print).toHaveCount(0);
  await expect(summary).toBeVisible();
}

test("A1/A2 三置頂五附錄的實際匯出與列印；取消置頂後不自動選取", async ({ page }, info) => {
  test.setTimeout(120_000);
  await mkdir(resolve("verification"), { recursive: true });
  // Stub only the blocking OS dialog; the app's portal and real print-media layout still run.
  await page.addInitScript(() => { window.print = () => { document.documentElement.dataset.printInvoked = "true"; }; });
  await page.goto("/");
  await page.getByRole("button", { name: labels.nav.validation.label, exact: true }).click();
  await page.getByLabel(labels.ui.dashboard.validation.datasetLabel, { exact: true }).selectOption("golden");
  await page.getByRole("button", { name: labels.ui.dashboard.validation.loadButton, exact: true }).click();
  await expect(page.getByTestId("workspace-status")).toContainText(labels.status.ready);
  await page.getByRole("button", { name: labels.nav.actions.label, exact: true }).click();
  for (let index = 1; index <= 8; index++) {
    await page.getByRole("button", { name: labels.buttons.addAction, exact: true }).click();
    const card = page.getByTestId(`action-${index}`);
    await card.getByLabel(labels.actions.problem, { exact: true }).fill(actionName(index));
    await card.getByLabel(labels.actions.step, { exact: true }).fill("核對已入帳費用與來源");
    await card.getByLabel(labels.actions.owner, { exact: true }).fill("營運主管");
    const evidence = card.getByLabel(labels.ui.actionsWorkbench.evidencePicker, { exact: true });
    const id = await evidence.locator("option").filter({ hasText: goldenFactLabel }).getAttribute("value");
    expect(id).toBeTruthy();
    await evidence.selectOption(id!);
    if (index <= 3) await card.getByRole("button", { name: labels.buttons.pin, exact: true }).click();
  }
  await page.getByRole("button", { name: labels.nav.overview.label, exact: true }).click();
  await openMeeting(page);
  const updates = page.getByRole("button", { name: refreshActionRef });
  while (await updates.count()) await updates.first().click();
  const summary = page.getByTestId("manager-summary");
  await summary.getByLabel(labels.meeting.threshold, { exact: true }).fill("1000");
  await summary.getByRole("button", { name: labels.buttons.apply, exact: true }).click();
  await expect(summary.getByLabel(labels.meeting.threshold, { exact: true })).toHaveValue("1000.00");
  const main = summary.getByRole("heading", { name: summaryCopy.decisionsHeading, exact: true }).locator("..").locator(":scope > ul > li");
  await expect(main).toHaveCount(3);
  const appendix = summary.locator(":scope > details").filter({ has: page.getByText(fill(summaryCopy.appendixActions, { n: 5 }), { exact: true }) });
  await appendix.locator(":scope > summary").click();
  await expect(appendix.locator(":scope > ul > li")).toHaveCount(5);
  for (let index = 1; index <= 8; index++) await expect((index <= 3 ? main : appendix).getByText(actionName(index), { exact: true })).toBeVisible();

  const prefix = `verification/review-v2-a-decision-${info.project.name}`;
  const markdown = await saveDownload(page, summary.getByRole("button", { name: labels.buttons.exportMarkdown, exact: true }), `${prefix}.md`);
  const [body, technical] = markdown.split(technicalHeading);
  expect(body.match(/匯出驗收行動第/g)).toHaveLength(3);
  expect(technical.match(/匯出驗收行動第/g)).toHaveLength(5);
  // Threshold sentence is the tail of mdComparison after the comparison mode; assert that part so the mode label stays independent.
  expect(body).toContain(fill(summaryCopy.mdComparison.split("{mode}")[1], { threshold: "1000.00" }));
  expect(body).toContain(fill(summaryCopy.mdHeadlineRow, { metric: contributionLabel, previous: "570.00", current: "255.00", change: "-315.00" }));
  expect(body).toContain(fill(summaryCopy.mdHeadlineRow, { metric: netRevenueLabel, previous: "2250.00", current: "2470.00", change: "+220.00" }));
  await page.screenshot({ path: resolve(`verification/review-v2-a-decision-ui-pinned-${info.project.name}.png`), fullPage: true });
  await checkPrint(page, info, true);

  await page.getByRole("button", { name: labels.nav.actions.label, exact: true }).click();
  const json = JSON.parse(await saveDownload(page, page.getByRole("button", { name: labels.downloads.decisionJson, exact: true }), `${prefix}.json`));
  const csv = csvRecords(await saveDownload(page, page.getByRole("button", { name: labels.downloads.decisionCsv, exact: true }), `${prefix}.csv`));
  expect(json.export_version).toBe("workspace-decision-v2");
  expect(json.session).toMatchObject({ dataset_id: "golden-v1", metric_version: "contribution-v1", data_as_of: "2026-08-03", period: { start: "2026-08-02", end: "2026-08-02" } });
  expect(json.session.dataset_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(technical).toContain(json.session.dataset_hash);
  expect(technical).toContain(json.session.filter_hash);
  expect(json.review).toMatchObject({ dataset_hash: json.session.dataset_hash, importance_threshold: "1000.00", metric_version: "contribution-v1" });
  expect(json.review.pinned_action_ids).toHaveLength(3);
  expect(json.actions).toHaveLength(8);
  for (let index = 0; index < 8; index++) {
    const action = json.actions[index];
    expect(action).toMatchObject({ problem: actionName(index + 1), pinned: index < 3, binding: { dataset_hash: json.session.dataset_hash, filter_hash: json.session.filter_hash, metric_version: "contribution-v1" } });
    expect(action.evidence).toHaveLength(1);
    expect(action.evidence[0]).toMatchObject({ metric: "contribution_after_marketing", value: "255.00", period: { start: "2026-08-02", end: "2026-08-02" }, scope: { kind: "all", channels: ["DTC", "MARKETPLACE"] } });
    expect(action.evidence[0].sources.length).toBeGreaterThan(0);
    const rows = csv.filter(row => row.item_id === action.id);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(row => row.dataset_hash === action.binding.dataset_hash && row.filter_hash === action.binding.filter_hash && row.metric_version === "contribution-v1")).toBe(true);
    expect(rows.find(row => row.row_type === "manual_action" && row.field === "pinned")?.value).toBe(index < 3 ? "true" : "false");
    const fact = rows.find(row => row.row_type === "action_fact" && row.field === "contribution_after_marketing")!;
    expect(fact.value).toBe("255.00");
    expect(JSON.parse(fact.source_refs).length).toBeGreaterThan(0);
  }

  for (let index = 0; index < 3; index++) await page.getByRole("button", { name: labels.ui.actionsWorkbench.unpin, exact: true }).first().click();
  await expect(page.getByRole("button", { name: labels.ui.actionsWorkbench.unpin, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: labels.nav.overview.label, exact: true }).click();
  await openMeeting(page);
  await expect(main).toHaveCount(0);
  await expect(summary).toContainText(notice);
  await expect(summary).not.toContainText(noActions);
  const allAppendix = summary.locator(":scope > details").filter({ has: page.getByText(fill(summaryCopy.appendixActions, { n: 8 }), { exact: true }) });
  await allAppendix.locator(":scope > summary").click();
  await expect(allAppendix.locator(":scope > ul > li")).toHaveCount(8);
  const unpinned = await saveDownload(page, summary.getByRole("button", { name: labels.buttons.exportMarkdown, exact: true }), `verification/review-v2-a-decision-unpinned-${info.project.name}.md`);
  const [unpinnedBody, unpinnedAppendix] = unpinned.split(technicalHeading);
  expect(unpinnedBody).toContain(notice);
  expect(unpinnedBody).not.toMatch(new RegExp(`${escapeRegExp(noActions)}|匯出驗收行動第`));
  expect(unpinnedAppendix.match(/匯出驗收行動第/g)).toHaveLength(8);
  await page.screenshot({ path: resolve(`verification/review-v2-a-decision-ui-unpinned-${info.project.name}.png`), fullPage: true });
  await checkPrint(page, info, false);
});
