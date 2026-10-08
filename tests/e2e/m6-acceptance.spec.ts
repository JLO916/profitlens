import { clearWorkspace, closePeriodSheet, dismissSavePrompt, isMobile, navigateTo, openPeriodSheet, ruleHeadline, startChannelContext, switchActionsView } from "./replacement-helpers";
import { backToFiles, chooseBasis, commitButton, commitWizard, confirmAndCheck, confirmMappingIfShown, nextFromFiles, openWizard, setWizardFiles, setWizardManifest, wizard, wizardStatus } from "./import-wizard-helpers";
import { acceptAssumptions, decisionExportButton } from "./actions-helpers-v3";
import { labels, fill } from "../../src/i18n";
import { formatAmountL1, formatMetric, formatSignedDelta } from "../../src/application/presentation";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test, expect, type Page } from "@playwright/test";

// R3：匯入改走四步精靈（data-testid="import-wizard"）；舊的單頁匯入面板只在 #legacy-import 掛載，這裡不使用。
const alternative = resolve("tests/fixtures/alternative");
const golden = resolve("fixtures/golden");
const wizardCopy = labels.importWizard;
const scenarioCopy = labels.scenarios.decision;
const actionCopy = labels.actions.workbench;
const status = (page: Page) => page.getByTestId("workspace-status");
const kpi = (page: Page, metric: string) => page.getByTestId(`kpi-${metric}`).locator(".kpi-value");
// V3-2b（PRD §8.5）：KPI 卡與試算結果是 L1；手算精確值交給格式化函式轉成畫面文字。
const inputLabels = [labels.scenarios.inputs.volume.label, labels.scenarios.inputs.discount.label, labels.scenarios.inputs.fulfillmentUnit.label, labels.scenarios.inputs.adSpend.label, labels.scenarios.inputs.oneOff.label];
/** V3-2a：「資料到 {date}」由套用資料集的 data_as_of 填入。 */
const ready = (dataAsOf: string) => fill(labels.shell.status.ready, { date: dataAsOf });
/** V3-3：通路下拉在期間列裡；手機期間列收成 period-toggle，要先開底部面板、選完按「完成」收起（桌機兩步都不動）。 */
async function selectChannel(page: Page, channel: string) {
  await openPeriodSheet(page);
  await page.getByLabel(labels.shell.periodBar.filter.channel, { exact: true }).selectOption(channel);
  await closePeriodSheet(page);
}
/** V3-6：決策下載的三顆按鈕（名稱 labels.exports.downloads.decision*）搬進待辦頁／假設試算頁頁首的「匯出本頁」選單（export-page-actions／export-page-scenarios）。 */
const decisionFormats = { JSON: "json", CSV: "csv", Markdown: "md" } as const;

interface DecisionDocument {
  scenario_contexts: (DecisionDocument & {context_status:string})[];
  status: string;
  session: {
    dataset_id: string; dataset_hash: string; filter_hash: string; snapshot_signature: string;
    schema_version: string; scenario_version: string; metric_version: string; data_as_of: string;
    period: { start: string; end: string }; scope: { channels: string[] };
    filenames: Record<string, string>; stale: boolean;
    baseline: { amounts: Record<string, string | null> };
    facts: { id: string; value: string | null; metric: string; scope: { channels: string[] } }[];
  };
  fixed_assumptions: string[]; formulas: Record<string, string>;
  scenarios: { name: string; inputs: Record<string, string | boolean>; result: { contribution: string; delta: string; amounts: Record<string, string> } | null }[];
  actions: { status: string; problem: string; fact_ids: string[]; evidence: { id: string; value: string; sources: unknown[] }[] }[];
}

async function stage(page: Page, directory: string) {
  await openWizard(page);
  // V3-8（§7.7.2 全版專注模式）：匯入中頁首 h1＝「匯入資料」、描述＝隱私一句（PageHeader .page-heading .subtitle，桌機看得見）；
  // 手機頁首文字收成 sr-only，改由精靈內一行 p.wizard-privacy（aria-hidden）顯示同一句，桌機這一行隱藏。
  await expect(page.getByRole("heading", { level: 1, name: wizardCopy.title, exact: true })).toHaveCount(1);
  const privacy = page.locator(".page-heading .subtitle");
  await expect(privacy).toHaveText(wizardCopy.privacyNote);
  const inlinePrivacy = wizard(page).locator(".wizard-privacy");
  await expect(inlinePrivacy).toHaveText(wizardCopy.privacyNote);
  if (isMobile(page)) await expect(inlinePrivacy).toBeVisible();
  else {
    await expect(privacy).toBeVisible();
    await expect(inlinePrivacy).toBeHidden();
  }
  await setWizardFiles(page, directory);
  const manifest = JSON.parse(await readFile(resolve(directory, "manifest.json"), "utf8")) as { dataset_id: string };
  await setWizardManifest(page, resolve(directory, "manifest.json"));
  await nextFromFiles(page);
  await confirmMappingIfShown(page);
  await expect(wizard(page).getByLabel(wizardCopy.datasetName, { exact: true })).toHaveValue(manifest.dataset_id);
  // R3 contract: the amount-basis confirmation is no longer a checkbox; it is a stated sentence confirmed by
  // the single「我確認口徑與期間，開始檢核」button, which stays disabled until an amount basis is chosen.
  const step = page.getByTestId("import-step-3");
  await expect(step.getByText(wizardCopy.amountConfirm, { exact: true })).toBeVisible();
  await expect(step.getByRole("checkbox", { name: wizardCopy.amountConfirm })).toHaveCount(0);
  const confirm = wizard(page).getByRole("button", { name: wizardCopy.confirmAndCheck, exact: true });
  await expect(confirm).toBeDisabled();
  await chooseBasis(page, "exclusive");
  await expect(confirm).toBeEnabled();
}
async function validate(page: Page) {
  await confirmAndCheck(page, "valid");
  await expect(commitButton(page)).toBeVisible();
}
async function importDataset(page: Page, directory: string) {
  await stage(page, directory);
  await validate(page);
  await commitWizard(page);
  const { data_as_of } = JSON.parse(await readFile(resolve(directory, "manifest.json"), "utf8")) as { data_as_of: string };
  await expect(status(page)).toContainText(ready(data_as_of));
  await expect(wizard(page)).toHaveCount(0);
  // R6：載入資料後右下角（手機底部滿版）出現非 modal 的首次保存提示，會擋住頁尾附近的按鈕；本流程不測自動保存，先按「先不要」。
  await dismissSavePrompt(page);
}
/** R5: one nav click opens the form (no start button); the page's channel defaults to the single channel of the global filter, and plan 1 is the ready draft (no "add scenario" click). */
async function scenario(page: Page, name: string, fulfillment: string, investment: string, expected: string) {
  await navigateTo(page, "scenarios");
  await startChannelContext(page);
  await expect(page.getByTestId("scenario-channel")).toHaveValue("DTC");
  const card = page.getByTestId("scenario-1");
  await card.getByLabel(scenarioCopy.planName, { exact: true }).fill(name);
  for (const [index, value] of ["0", "0", fulfillment, "0", investment].entries()) await card.getByLabel(inputLabels[index], { exact: true }).fill(value);
  // V3-6（D-V3-12＝B）：本流程每個工作區只試算一次，這裡一定是第一次勾聲明；勾下去就記住、checkbox 換成「已了解」。
  await acceptAssumptions(card, "first");
  await card.getByRole("button", { name: labels.scenarios.buttons.calculate, exact: true }).click();
  await expect(card.getByTestId("scenario-contribution")).toHaveText(formatAmountL1(expected));
}
async function download(page: Page, format: "JSON" | "CSV" | "Markdown") {
  const button = await decisionExportButton(page, decisionFormats[format]);
  const [file] = await Promise.all([page.waitForEvent("download"), button.click()]);
  expect(file.suggestedFilename()).toBe(`profitlens-decision.${{ JSON: "json", CSV: "csv", Markdown: "md" }[format]}`);
  const path = await file.path();
  expect(path).not.toBeNull();
  return readFile(path!, "utf8");
}
async function decision(page: Page) { return JSON.parse(await download(page, "JSON")) as DecisionDocument; }

/** Test-only CSV reader: financial expectations below are fixed hand calculations. */
function csvRecords(input: string): Record<string, string>[] {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [], value = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (!quoted && character === ",") { row.push(value); value = ""; }
    else if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value); rows.push(row); row = []; value = "";
    } else value += character;
  }
  expect(quoted).toBe(false);
  if (value || row.length) { row.push(value); rows.push(row); }
  // R2 CSV headers are「中文 (key)」; keep records keyed by the machine key.
  const headers = (rows.shift() ?? []).map(header => /\(([^()]+)\)\s*$/.exec(header)?.[1] ?? header);
  expect(headers.length).toBeGreaterThan(0);
  return rows.map(values => {
    expect(values.length).toBe(headers.length);
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}

const expectedBeforeUnload = new WeakSet<Page>();
const dialogEvents = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const events: string[] = [];
  dialogEvents.set(page, events);
  page.on("dialog", dialog => {
    if (dialog.type() === "beforeunload" && expectedBeforeUnload.delete(page)) {
      events.push("unsaved-changes-warning:beforeunload");
      void dialog.accept();
    } else {
      events.push(`dialog:${dialog.type()}`);
      void dialog.dismiss();
    }
  });
  await page.goto("/");
});
test.afterEach(async ({ page }) => {
  expect((dialogEvents.get(page) ?? []).filter(event => event !== "unsaved-changes-warning:beforeunload"), "除明確驗證的未保存離頁提醒外，不可執行輸入文字或出現其他 JavaScript 對話").toEqual([]);
});

test("M6 alternative 真匯入、診斷、44.00 條件試算、行動及三格式快照完整鏈", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.name));
  await importDataset(page, alternative);
  await expect(kpi(page, "net_revenue")).toHaveText(formatAmountL1("600.00"));
  await expect(kpi(page, "contribution_after_marketing")).toHaveText(formatAmountL1("10.00"));
  await selectChannel(page, "DTC");
  await expect(kpi(page, "net_revenue")).toHaveText(formatAmountL1("400.00"));
  await expect(kpi(page, "contribution_after_marketing")).toHaveText(formatAmountL1("40.00"));
  await navigateTo(page, "diagnosis");
  // R5: one list row per rule (details.diagnosis-row); the headline is the row's summary heading.
  await expect(page.getByTestId("diagnosis-row-REV_UP_CM_DOWN").getByRole("heading", { name: ruleHeadline("REV_UP_CM_DOWN") })).toBeVisible();
  await expect(page.getByTestId("diagnosis-row-MARKETING_BURDEN_UP").getByRole("heading", { name: ruleHeadline("MARKETING_BURDEN_UP") })).toBeVisible();

  // Two DTC days: N=400, C=200, P=10, Q=6, F=14, O=0, A=130.
  // v=0, delta=0, f=-50%, a=0, K=3 => 400-200-10-6-7-0-130-3=44.
  await scenario(page, "M6 合成履約條件方案", "-50", "3", "44.00");
  await expect(page.getByTestId("scenario-1").getByTestId("scenario-delta")).toHaveText(formatSignedDelta("4.00", "L1"));
  // V3-6（D-V3-12＝B）：勾過的聲明記住後，方案改顯示「已了解這是試算，不是預測。」（不再有 checkbox）。
  await expect(page.getByTestId("decision-workbench")).toContainText(labels.scenarios.pageV3.acknowledged);
  await expect(page.getByTestId("scenario-1").getByTestId("scenario-accept")).toHaveCount(0);
  await navigateTo(page, "actions");
  // R5: the actions page opens on the board; the full edit form is filled in the list view.
  await switchActionsView(page, "list");
  await page.getByRole("button", { name: labels.actions.buttons.addAction, exact: true }).click();
  const action = page.getByTestId("action-1");
  const fields = { [labels.actions.form.problem]: "營收上升但行銷後貢獻下降，需核對成本", [labels.actions.form.step]: "核對履約計價條款並設計有限範圍測試", [labels.actions.form.owner]: "營運主管", [labels.actions.form.metric]: "同範圍履約費用與行銷後貢獻", [labels.actions.form.due]: "2026-10-15", [labels.actions.form.stop]: "若服務品質下降即停止測試", [labels.actions.form.extraData]: "物流實際報價與服務品質資料" };
  for (const [label, value] of Object.entries(fields)) await action.getByLabel(label, { exact: true }).fill(value);
  // R5: evidence is a checkbox list; each checkbox is named by its fact label and carries the fact id as value.
  const evidence = action.getByTestId("evidence-checklist").getByRole("checkbox", { name: fill(actionCopy.factLabel, { start: "2026-09-03", end: "2026-09-04", metric: labels.metrics.contribution_after_marketing.headline, scope: "DTC", scopeKind: labels.exports.csv.columns.channel, value: formatMetric("contribution_after_marketing", { value: "40.00" }, "L1") }), exact: true });
  await expect(evidence).toHaveCount(1);
  const factId = await evidence.getAttribute("value");
  expect(factId).toBeTruthy();
  await evidence.check();
  await expect(action.getByTestId("evidence-checklist").locator("input[type=checkbox]:checked")).toHaveCount(1);
  await action.getByRole("button", { name: labels.shell.buttons.confirm, exact: true }).click();
  await expect(action).toContainText(actionCopy.tagConfirmed);

  const document = await decision(page);
  expect(document.status).toBe("current");
  expect(document.session).toMatchObject({ dataset_id: "alternative-import-synthetic-v1", metric_version: "contribution-v1", schema_version: "decision-v1", scenario_version: "scenario-v1", data_as_of: "2026-09-05", period: { start: "2026-09-03", end: "2026-09-04" }, scope: { channels: ["DTC"] }, stale: false });
  expect(document.session.dataset_hash.length).toBeGreaterThan(10);
  expect(document.session.filter_hash.length).toBeGreaterThan(10);
  expect(document.session.snapshot_signature).toContain(document.session.dataset_hash);
  expect(document.session.filenames).toMatchObject({ "sales_daily.csv": "sales_daily.csv", "manifest.json": "manifest.json" });
  expect(document.session.baseline.amounts).toMatchObject({ net_revenue: "400.00", cogs_net: "200.00", platform_fees: "10.00", payment_fees: "6.00", fulfillment_costs: "14.00", ad_spend: "130.00", contribution_after_marketing: "40.00" });
  expect(document.scenarios).toHaveLength(1);
  expect(document.scenarios[0]).toMatchObject({ inputs: { volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "-50", ad_change_pct: "0", one_time_cost: "3", assumptions_accepted: true }, result: { contribution: "44.00", delta: "4.00", amounts: { fulfillment_costs: "7.00", one_time_cost: "3.00" } } });
  expect(document.fixed_assumptions.length).toBeGreaterThanOrEqual(5);
  expect(document.formulas).toHaveProperty("contribution_after_marketing");
  expect(document.actions[0]).toMatchObject({ status: "confirmed", fact_ids: [factId], evidence: [{ id: factId, value: "40.00" }] });
  expect(document.actions[0].evidence[0].sources.length).toBeGreaterThan(0);
  expect(document.session.facts.find(fact => fact.id === factId)).toMatchObject({ metric: "contribution_after_marketing", value: "40.00", scope: { channels: ["DTC"] } });

  const csv = csvRecords(await download(page, "CSV"));
  expect(csv.every(row => row.dataset_id === document.session.dataset_id && row.dataset_hash === document.session.dataset_hash && row.filter_hash === document.session.filter_hash && row.metric_version === "contribution-v1" && row.as_of === "2026-09-05" && row.snapshot_status === "current")).toBe(true);
  const summary = csv.filter(row => row.row_type !== "fact");
  expect(summary.every(row => JSON.parse(row.scope).channels.join() === "DTC" && JSON.parse(row.period).start === "2026-09-03" && JSON.parse(row.period).end === "2026-09-04")).toBe(true);
  expect(csv.find(row => row.row_type === "scenario_result" && row.field === "contribution")?.value).toBe("44.00");
  expect(csv.find(row => row.row_type === "scenario_result" && row.field === "delta")?.value).toBe("4.00");
  expect(csv.filter(row => row.row_type === "scenario_input")).toHaveLength(6);
  expect(csv.filter(row => row.row_type === "fixed_assumption")).toHaveLength(document.fixed_assumptions.length);
  expect(csv.find(row => row.row_type === "manual_action" && row.field === "problem")?.fact_ids).toBe(JSON.stringify([factId]));
  const markdown = await download(page, "Markdown");
  // Markdown escapes punctuation; decode only for test assertions, never render input HTML.
  const readableMarkdown = markdown.replace(/\\([\\`*_{}[\]()#+.!|~:\-])/g, "$1");
  for (const value of [document.session.dataset_hash, document.session.filter_hash, "contribution-v1", "2026-09-05", "2026-09-03", "2026-09-04", "DTC", "44.00", "4.00", labels.scenarios.sections.scenarioAssumptions, `${labels.scenarios.inputs.fulfillmentUnit.label}：-50`, `${labels.scenarios.inputs.oneOff.label}：3`, fields[labels.actions.form.problem]]) expect(readableMarkdown).toContain(value);
  await expect(page.locator("img[src='x']")).toHaveCount(0);
  expect(errors).toEqual([]);
  await mkdir(resolve("verification"), { recursive: true });
  await page.screenshot({ path: resolve(`verification/review-v2-a-regression-regression-m6-${testInfo.project.name}-complete-flow.png`), fullPage: true });
  await testInfo.attach("m6-synthetic-decision-json", { body: JSON.stringify(document, null, 2), contentType: "application/json" });
  await appendFile(resolve("verification/review-v2-a-regression-regression-m6-ui-flow-meta.jsonl"), `${JSON.stringify({ project: testInfo.project.name, status: "passed", synthetic_only: true, dataset_id: document.session.dataset_id, baseline: "40.00", scenario: "44.00", delta: "4.00", exports: ["JSON", "CSV", "Markdown"], browser_errors: errors })}\n`);
});

test("M6 獨立 browser context 各自匯入與操作，清空或重新整理不影響另一方", async ({ page, browser }, testInfo) => {
  // Two browser contexts, three real wizard imports, two scenarios and five downloads: the 45s default left no headroom
  // (laptop took 43.4s in verification/review-v2-a-e2e-full-results.json), so this chain gets an explicit budget like the A1 chains.
  test.setTimeout(90_000);
  await importDataset(page, alternative);
  await selectChannel(page, "DTC");
  await expect(kpi(page, "contribution_after_marketing")).toHaveText(formatAmountL1("40.00"));
  await scenario(page, "甲分頁獨立假設", "-50", "3", "44.00");
  const first = await decision(page);
  // A separate context has independent cookie/storage partitions and a new page.
  const otherContext = await browser.newContext({ locale: "zh-TW", timezoneId: "Asia/Taipei", viewport: page.viewportSize()! });
  try {
    const other = await otherContext.newPage();
    await other.goto(page.url());
    await expect(status(other)).toContainText(labels.shell.status.empty);
    await expect(other.getByTestId("decision-workbench")).toHaveCount(0);
    await importDataset(other, golden);
    await selectChannel(other, "DTC");
    await expect(kpi(other, "contribution_after_marketing")).toHaveText(formatAmountL1("270.00"));
    await scenario(other, "乙分頁獨立假設", "-10", "0", "284.00");
    const second = await decision(other);
    expect(second.session.dataset_id).toBe("golden-v1");
    expect(second.session.dataset_hash).not.toBe(first.session.dataset_hash);
    expect(second.session.baseline.amounts.contribution_after_marketing).toBe("270.00");
    expect(second.scenarios[0].name).toBe("乙分頁獨立假設");
    expect(await decision(page)).toEqual(first);
    // V3-3：v2 頂欄的「清空」搬進儲存選單的「危險區」；有未保存的試算，一定會出現取代確認對話框。
    const replaceDialog = await clearWorkspace(other);
    await replaceDialog.getByRole("button", { name: labels.storage.replacement.discardAndContinue, exact: true }).click();
    await expect(status(other)).toContainText(labels.shell.status.empty);
    expect(await decision(page)).toEqual(first);
    await importDataset(other, golden);
    expectedBeforeUnload.add(page);
    await page.reload();
    expect(dialogEvents.get(page)).toEqual(["unsaved-changes-warning:beforeunload"]);
    await expect(status(page)).toContainText(labels.shell.status.empty);
    await expect(page.getByTestId("decision-workbench")).toHaveCount(0);
    await expect(kpi(other, "contribution_after_marketing")).toHaveText(formatAmountL1("255.00"));
    expect(await otherContext.storageState()).toEqual({ cookies: [], origins: [] });
    await mkdir(resolve("verification"), { recursive: true });
    await appendFile(resolve("verification/review-v2-a-regression-regression-m6-context-isolation-meta.jsonl"), `${JSON.stringify({ project: testInfo.project.name, status: "passed", independent_contexts: 2, synthetic_only: true, mutual_update_clear_reload_isolation: true, dialog_events: dialogEvents.get(page) })}\n`);
  } finally { await otherContext.close(); }
});

test("M6 檢核後改設定與換錯檔均撤銷可提交候選，取消保留原資料及有效決策", async ({ page }) => {
  await importDataset(page, golden);
  await selectChannel(page, "DTC");
  await expect(kpi(page, "contribution_after_marketing")).toHaveText(formatAmountL1("270.00"));
  await scenario(page, "尚未被取代的工作稿", "-10", "0", "284.00");
  const before = await decision(page);
  await stage(page, alternative);
  await validate(page);
  // R3: settings live in step 3. Going back from the check result and editing a setting drops the checked
  // candidate (no commit button, no check result) until the user confirms and checks again.
  const back = wizard(page).getByRole("button", { name: wizardCopy.back, exact: true });
  await back.click();
  await expect(page.getByTestId("import-step-3")).toBeVisible();
  await wizard(page).getByLabel(wizardCopy.datasetName, { exact: true }).fill("m6-edited-import-candidate");
  await expect(commitButton(page)).toHaveCount(0);
  await expect(wizardStatus(page)).toHaveCount(0);
  await expect(page.getByTestId("import-stepper").locator("li").nth(3)).toHaveClass(/todo/);
  await validate(page);
  // Swapping in a malformed sales CSV (back to step 1; step 2 was skipped for standard headers) revokes the
  // candidate again. The wizard blocks it at read time: the slot shows the plain message + code and
  // 「下一步」stays disabled, so no check can run and nothing can be committed (old: status.blocking after check).
  await back.click();
  await expect(page.getByTestId("import-step-3")).toBeVisible();
  await backToFiles(page);
  await expect(commitButton(page)).toHaveCount(0);
  await wizard(page).getByLabel(wizardCopy.files.sales, { exact: true }).setInputFiles({ name: "m6-malformed.csv", mimeType: "text/csv", buffer: Buffer.from('date,channel,sku\n"unclosed') });
  const salesSlot = page.getByTestId("import-file-sales_daily.csv");
  await expect(salesSlot).toContainText("m6-malformed.csv");
  // V3-2a：{file} 由 application 帶入標準檔名（SourceRef.file），不是上傳的檔名。
  await expect(salesSlot.getByRole("alert")).toContainText(fill(labels.errors.import.MALFORMED_CSV, { file: "sales_daily.csv", line: 2 }));
  await expect(salesSlot.getByRole("alert").locator("code")).toHaveText("MALFORMED_CSV");
  await expect(wizard(page).getByRole("button", { name: wizardCopy.next, exact: true })).toBeDisabled();
  await expect(wizard(page).getByRole("button", { name: wizardCopy.confirmAndCheck, exact: true })).toHaveCount(0);
  await expect(commitButton(page)).toHaveCount(0);
  await wizard(page).getByRole("button", { name: wizardCopy.cancel, exact: true }).click();
  await expect(wizard(page)).toHaveCount(0);
  // 取消後仍是原本的 golden 資料（data_as_of 2026-08-03）。
  await expect(status(page)).toContainText(ready("2026-08-03"));
  await navigateTo(page, "scenarios");
  await expect(page.getByTestId("decision-freshness")).toContainText(scenarioCopy.freshTitle);
  expect(await decision(page)).toEqual(before);
  await importDataset(page, alternative);
  await navigateTo(page, "scenarios");
  await expect(page.getByTestId("multi-scenario-workbench")).toContainText(labels.scenarios.workbench.historyHeading);
  const exported = await decision(page);
  const historical = exported.scenario_contexts.find(context => context.context_status === "historical")!;
  expect(historical.status).toBe("stale");
  expect(historical.session.dataset_hash).toBe(before.session.dataset_hash);
  expect(historical.session.dataset_id).toBe("golden-v1");
  expect(historical.scenarios[0].result?.contribution).toBe("284.00");
});
