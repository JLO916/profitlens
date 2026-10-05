import { clickReplacing, dismissSavePrompt, openDownloads, openMeeting, openValidation } from "./replacement-helpers";
import { fill, labels } from "../../src/i18n";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test as base, type Page } from "@playwright/test";

// R2: every visible string comes from labels; compose evidence titles the way manager-summary.ts does.
const copy = labels.ui.managerSummary;
const contribution = labels.metrics.contribution_after_marketing.label;
const netRevenue = labels.metrics.net_revenue.label;
/** metricComparison(): all-channel scope is `${sections.total}（${channelsLabel(...)}）`; golden keeps raw channel codes. */
const totalScope = (channels: string[]) => `${labels.sections.total}（${channels.join("、")}）`;
const changeTitle = (channels: string[], metric: string) => fill(copy.evidenceChange, { scope: totalScope(channels), metric });
/** V3-2a：狀態列「資料到 {date}」— 以模板組 RegExp，{date} 對應 YYYY-MM-DD（各驗證資料集的 data_as_of 不同）。 */
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const readyRe = escapeRe(labels.status.ready).replace(escapeRe("{date}"), "\\d{4}-\\d{2}-\\d{2}");
const technicalHeading = `## ${labels.sections.technicalDetails}`;
/** 三件事一列「標題 · 範圍 · 金額」的分隔符（取自 mdPriorityRow 模板 {scope} 與 {amount} 之間；列印版用同一個分隔符，§8.4 第 5 點）。 */
const prioritySep = copy.mdPriorityRow.split("{scope}")[1].split("{amount}")[0];
/** Markdown meta line is mdMeta（V3-2a 分隔符改「 · 」，與 prioritySep 相同）; assert only the segment that carries {channels}. */
const mdScope = (channels: string) => fill(copy.mdMeta.split(prioritySep).find(part => part.includes("{channels}"))!, { channels });
// R5 修正後列印列是「 · 影響金額 -315.00」：分隔符後接影響標籤（labels.sections.impact）再接金額。
const endsWithAmount = (amount: string) => new RegExp(`${escapeRe(prioritySep)}${escapeRe(labels.sections.impact)}\\s*${escapeRe(amount)}`);
/** R6：會議紀錄頁的匯出集中在「輸出」列（meeting-outputs）：匯出 PDF、Markdown、通路寬表 CSV、Excel、PPT。 */
const meetingOutput = (page: Page, name: string) => page.getByTestId("meeting-outputs").getByRole("button", { name, exact: true });

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
  await openValidation(page);
  await page.getByLabel(labels.ui.dashboard.validation.datasetLabel, { exact: true }).selectOption(name);
  await clickReplacing(page, page.getByRole("button", { name: labels.ui.dashboard.validation.loadButton, exact: true }));
  await expect(page.getByTestId("workspace-status")).toContainText(new RegExp(`${readyRe}|${escapeRe(labels.status.partial)}`));
  await dismissSavePrompt(page);
  // R6：主管摘要（會議稿）在獨立分頁「會議紀錄」。
  await openMeeting(page);
  await expect(page.getByTestId("manager-summary")).toBeVisible();
}

test("PL06 golden management summary, drilldown, threshold, scope and wide export", async ({ page }, testInfo) => {
  await load(page);
  const summary = page.getByTestId("manager-summary");
  await expect(summary.getByRole("button", { name: changeTitle(["DTC", "MARKETPLACE"], netRevenue), exact: true })).toHaveText("+220.00");
  const cm = summary.getByRole("button", { name: changeTitle(["DTC", "MARKETPLACE"], contribution), exact: true });
  await expect(cm).toHaveText("-315.00");
  const marketplace = summary.getByRole("row").filter({ has: page.getByRole("rowheader", { name: /^MARKETPLACE/ }) });
  await expect(marketplace).toContainText("170.00");
  await expect(marketplace).toContainText("-15.00");
  await expect(marketplace).toContainText("-185.00");
  await expect(summary.getByTestId("manager-priority-REV_UP_CM_DOWN")).toHaveCount(1);
  await cm.click();
  await expect(page.getByRole("dialog")).toContainText(fill(copy.changeFormula, { metric: contribution }));
  await expect(page.getByRole("dialog")).toContainText("sales_daily.csv");
  await page.getByRole("dialog").getByRole("button", { name: labels.buttons.close, exact: true }).click();
  await summary.getByLabel(labels.meeting.threshold).fill("315.01");
  await summary.getByRole("button", { name: labels.buttons.apply, exact: true }).click();
  await expect(summary.getByTestId("manager-priority-REV_UP_CM_DOWN")).toHaveCount(0);
  await expect(summary).toContainText(labels.notes.noPriorities);
  await summary.getByLabel(labels.meeting.threshold).fill("-1");
  await summary.getByRole("button", { name: labels.buttons.apply, exact: true }).click();
  await expect(summary.getByRole("alert")).toContainText(labels.notes.thresholdInvalid);
  await summary.getByLabel(labels.meeting.threshold).fill("0");
  await summary.getByRole("button", { name: labels.buttons.apply, exact: true }).click();
  await expect(summary.getByTestId("manager-priority-REV_UP_CM_DOWN")).toBeVisible();
  const csvEvent = page.waitForEvent("download");
  await meetingOutput(page, labels.downloads.channelTableCsv).click();
  const download = await csvEvent;
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain('"170.00","-15.00","-185.00"');
  expect(csv).toContain('"400.00","270.00","-130.00"');
  await page.getByLabel(labels.ui.dashboard.filter.channel, { exact: true }).selectOption("DTC");
  await expect(summary.getByRole("button", { name: changeTitle(["DTC", "MARKETPLACE"], contribution), exact: true })).toHaveText("-315.00");
  await page.getByRole("button", { name: labels.buttons.updateMeetingSource, exact: true }).click();
  await expect(summary.getByRole("button", { name: changeTitle(["DTC"], contribution), exact: true })).toHaveText("-130.00");
  await expect(summary.getByRole("rowheader", { name: /MARKETPLACE/ })).toHaveCount(0);
  const markdownEvent = page.waitForEvent("download");
  await meetingOutput(page, labels.buttons.exportMarkdown).click();
  const markdown = await readFile((await (await markdownEvent).path())!, "utf8");
  expect(markdown.split(technicalHeading)[0]).toContain(mdScope("DTC"));
  expect(markdown.split(technicalHeading)[0]).not.toContain("MARKETPLACE");
  // R5（05 §7）：Markdown 三件事的金額是「對貢獻影響」；golden DTC：折扣 -130.00、營收增貢獻減 -130.00（同值依規則代號）、廣告 -70.00。
  const topThree = markdown.split(`## ${labels.sections.topThree}`)[1].split(copy.mdDecisions)[0];
  expect(topThree.split("\n").filter(line => /^\d+\. /.test(line)).map(line => line.split(prioritySep).at(-1))).toEqual(["-130.00", "-130.00", "-70.00"]);
  await page.screenshot({ path: resolve(`verification/review-v2-a-regression-summary-${testInfo.project.name}.png`), fullPage: true });
});

test("PL06 unknown priorities survive a high threshold without zero contribution", async ({ page }) => {
  await load(page, "missing-cogs");
  const summary = page.getByTestId("manager-summary");
  await summary.getByLabel(labels.meeting.threshold).fill("99999999");
  await summary.getByRole("button", { name: labels.buttons.apply, exact: true }).click();
  await expect(summary.getByTestId("manager-priority-MISSING_CRITICAL_DATA")).toBeVisible();
  await expect(summary.getByRole("button", { name: changeTitle(["DTC", "MARKETPLACE"], contribution), exact: true })).toHaveText(labels.status.missing);
  await expect(summary.getByTestId("manager-priority-MISSING_CRITICAL_DATA")).toContainText(copy.missingDataNote);
});

test("PL09 print uses a dedicated manager draft and retains technical audit downloads", async ({ page }, testInfo) => {
  // Replaces only the blocking OS print dialog; print-media layout is still real.
  await page.addInitScript(() => { window.print = () => { document.documentElement.dataset.printInvoked = "true"; }; });
  await load(page);
  // R6：會議頁的列印改由輸出列的「匯出 PDF」（同一個列印版面，window.print()）。
  await meetingOutput(page, labels.buttons.exportPdf).click();
  await expect(page.locator("html")).toHaveAttribute("data-print-invoked", "true");
  await page.emulateMedia({ media: "print" });
  const print = page.getByTestId("manager-summary-print");
  await expect(print).toBeVisible();
  // Print context shows either the meeting decision state or copy.draftDecision; both contain the draft label.
  await expect(print).toContainText(labels.meeting.decisions.draft);
  await expect(print).toContainText("+220.00");
  await expect(print).toContainText("-315.00");
  // R5（05 §7）：三件事顯示「對貢獻影響」——費用類規則（折扣、廣告增加）為負號，不再是排序用的 +250.00／+150.00。
  const priorities = print.locator("ol > li");
  await expect(priorities).toHaveCount(3);
  await expect(priorities.nth(0)).toContainText(endsWithAmount("-315.00"));
  await expect(priorities.nth(1)).toContainText(endsWithAmount("-250.00"));
  await expect(priorities.nth(2)).toContainText(endsWithAmount("-150.00"));
  await expect(print.locator("ol")).not.toContainText(/\+250\.00|\+150\.00/);
  await expect(page.getByTestId("manager-summary")).toBeHidden();
  await page.screenshot({ path: resolve(`verification/review-v2-a-regression-summary-print-${testInfo.project.name}.png`), fullPage: true });
  if (testInfo.project.name === "desktop") await page.pdf({ path: resolve("verification/review-v2-a-regression-summary-print.pdf"), format: "A4", printBackground: true });
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.getByTestId("manager-summary-print")).toHaveCount(0);
  await openDownloads(page);
  await expect(page.getByRole("button", { name: labels.downloads.analysisCsv, exact: true })).toBeVisible();
});
