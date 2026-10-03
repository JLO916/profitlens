import { appendFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { fill, labels } from "../../src/i18n";
import { AUTO_SAVE_DELAY_MS } from "../../src/application/auto-save";
import { dismissSavePrompt, selectScenarioChannel, startChannelContext, switchActionsView } from "./replacement-helpers";

const dw = labels.ui.decisionWorkbench, aw = labels.ui.actionsWorkbench, msw = labels.ui.multiScenarioWorkbench, dash = labels.ui.dashboard;
const cmAfter = labels.metrics.contribution_after_marketing.label;
const inputLabels = [
  labels.scenario.volume.label, labels.scenario.discount.label, labels.scenario.fulfillmentUnit.label,
  labels.scenario.adSpend.label, labels.scenario.oneOff.label,
] as const;
const consentLabel = labels.scenario.acceptAssumptions;
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** evidence-drawer.tsx names the dialog `${title}｜${labels.sections.evidence}`. */
const evidenceDialogName = (title: string) => `${title}｜${labels.sections.evidence}`;
/** evidence-drawer.tsx scope line: `{scope}；{start} 至 {end}；通路：{channels}。` — the period/channel tail only. */
const evidencePeriodLine = (start: string, end: string, channels: string) => `${start} 至 ${end}；${labels.evidence.channels}：${channels}`;
/** evidence-drawer.tsx lists source rows per file behind `${labels.evidence.sourceTabs[tab]}（{count}）` buttons; rows of a file appear only on its tab. */
const sourceTabFiles = { sales: "sales_daily.csv", costs: "channel_costs_daily.csv", ads: "ad_spend_daily.csv" } as const;
async function showSourceTab(dialog: Locator, tab: keyof typeof sourceTabFiles) {
  const button = dialog.getByRole("button", { name: new RegExp(`^${escapeRegExp(labels.evidence.sourceTabs[tab])}（\\d+）$`) });
  await expect(button, `${sourceTabFiles[tab]} 的來源列必須在抽屜內可切換`).toBeVisible();
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  return button;
}
/** actions-workbench.tsx factLabel for a channel-scoped fact. */
const factText = (start: string, end: string, metric: string, scope: string, value: string) => fill(aw.factLabel, { start, end, metric, scope, scopeKind: labels.csvColumns.channel, value });
/** multi-scenario-workbench.tsx strips the inventory tail after a full-width paren before filling history templates. */
/** 「開始試算 {channel}」按鈕已依規格移除（R5-3），用模板開頭比對確認不存在。 */
const startButtonPrefix = new RegExp(`^${escapeRegExp(msw.startButton.split("{channel}")[0])}`);
const historyPlanLine = (plan: string, amount: string) => fill(msw.historyPlanSummary.split("（")[0], { plan, resultLabel: labels.scenario.resultTitle, amount });
const periodFieldLabel = (edge: "start" | "end", period: string) => fill(edge === "start" ? dash.filter.periodStart : dash.filter.periodEnd, { period });
const workspaceStatus = (page: Page) => page.getByTestId("workspace-status");
const workbench = (page: Page) => page.getByTestId("decision-workbench");
const actionsWorkbench = (page: Page) => page.getByTestId("actions-workbench");
const scenario = (page: Page, index = 1) => page.getByTestId(`scenario-${index}`);
const action = (page: Page, index = 1) => page.getByTestId(`action-${index}`);
const kpi = (page: Page, metric: string) => page.getByTestId(`kpi-${metric}`).locator(".kpi-value");

interface AuditEvent { kind: string; type?: string; errorName?: string }
const expectedBeforeUnload = new WeakSet<Page>();
const test = base.extend<{ browserAudit: AuditEvent[] }>({
  browserAudit: [async ({ page }, use, testInfo) => {
    const events: AuditEvent[] = [];
    // Never persist manual text, imported rows, console arguments, or request bodies.
    page.on("console", message => events.push({ kind: "console", type: message.type() }));
    page.on("pageerror", error => events.push({ kind: "pageerror", errorName: error.name }));
    page.on("dialog", dialog => {
      if (dialog.type() === "beforeunload" && expectedBeforeUnload.delete(page)) {
        events.push({ kind: "unsaved-changes-warning", type: dialog.type() });
        void dialog.accept();
      } else {
        events.push({ kind: "javascript-dialog", type: dialog.type() });
        void dialog.dismiss();
      }
    });
    await use(events);
    const record = { recorded_at: new Date().toISOString(), project: testInfo.project.name, test: testInfo.title, status: testInfo.status, events };
    await mkdir(resolve("verification"), { recursive: true });
    await appendFile(resolve("verification/review-v2-a-regression-regression-m6-regression-browser-meta.jsonl"), `${JSON.stringify(record)}\n`);
    await testInfo.attach("browser-metadata", { body: JSON.stringify(record, null, 2), contentType: "application/json" });
    expect(events.filter(event => event.kind === "pageerror" || event.kind === "javascript-dialog" || event.type === "error"), "情境與行動不執行輸入文字，不產生未處理的瀏覽器錯誤").toEqual([]);
  }, { auto: true }],
});

async function loadDataset(page: Page, id = "golden", classification: string = labels.status.ready, keepSavePrompt = false) {
  await page.getByRole("button", { name: labels.nav.validation.label, exact: true }).click();
  await page.getByLabel(dash.validation.datasetLabel, { exact: true }).selectOption(id);
  const response = page.waitForResponse(response => response.url().endsWith(`/api/datasets/${id}`) && response.status() === 200);
  await page.getByRole("button", { name: dash.validation.loadButton, exact: true }).click();
  const replacement = page.getByRole("dialog", { name: labels.ui.replacementDialog.heading });
  if (await Promise.race([response.then(() => false), replacement.waitFor({ state: "visible" }).then(() => true)])) {
    await replacement.getByRole("button", { name: labels.ui.replacementDialog.discardAndContinue, exact: true }).click();
  }
  await response;
  await expect(workspaceStatus(page)).toContainText(classification);
  // R6：載入資料後右下角（手機底部滿版）出現非 modal 的首次保存提示，會擋住頁尾附近的按鈕；本流程不測自動保存，先按「先不要」。
  // 零持久化案例自己按「先不要」並驗證之後沒有資料庫，所以可選擇保留提示。
  if (!keepSavePrompt) await dismissSavePrompt(page);
}
async function selectChannel(page: Page, channel: string, classification: string = labels.status.ready) {
  await page.getByLabel(dash.filter.channel, { exact: true }).selectOption(channel);
  await expect(workspaceStatus(page)).toContainText(classification);
}
/** R5-3 進頁即表單：點側欄「假設試算」一次就出現方案 1 的表單（沒有「開始試算」按鈕；全站多通路時先等單通路基準重算完成）。 */
async function showScenarios(page: Page) {
  await page.getByRole("button", { name: labels.nav.scenarios.label, exact: true }).click();
  await expect(page.getByTestId("multi-scenario-workbench")).toBeVisible();
  await startChannelContext(page);
}
async function openGolden(page: Page, channel = "DTC") {
  await loadDataset(page);
  await selectChannel(page, channel);
  await showScenarios(page);
  // 全站只有一個通路時，試算頁的通路單選預設就是它。
  await expect(page.getByTestId("scenario-channel")).toHaveValue(channel);
  await expect(page.getByTestId("baseline-contribution_after_marketing")).toHaveText(channel === "DTC" ? "270.00" : "-15.00");
}
/** 進頁草稿「方案 1」：預設名稱、五格空白、未勾同意、沒有結果與版本號。 */
async function expectFreshDraft(page: Page) {
  const card = scenario(page);
  await expect(card.getByLabel(dw.planName, { exact: true })).toHaveValue(fill(dw.defaultPlanName, { n: 1 }));
  for (const label of inputLabels) await expect(card.getByLabel(label, { exact: true })).toHaveValue("");
  await expect(card.getByLabel(consentLabel)).not.toBeChecked();
  await expect(card.getByTestId("scenario-draft")).toHaveText(labels.scenario.draft);
  await expect(card.getByTestId("scenario-contribution")).toHaveCount(0);
  await expect(card.getByTestId("scenario-version")).toHaveCount(0);
  await expect(scenario(page, 2)).toHaveCount(0);
}
/** R5-3：方案 1 是進頁就有的草稿（不必按「新增方案」）；第 2、3 個方案才按「新增方案」。 */
async function addScenario(page: Page, index = 1, name = `獨立方案 ${index}`) {
  if (index > 1) await page.getByRole("button", { name: labels.buttons.addScenario, exact: true }).click();
  const card = scenario(page, index);
  await expect(card).toBeVisible();
  await card.getByLabel(dw.planName, { exact: true }).fill(name);
  return card;
}
async function fillScenario(card: Locator, values: readonly string[], accepted = true) {
  expect(values).toHaveLength(inputLabels.length);
  for (const [index, label] of inputLabels.entries()) await card.getByLabel(label, { exact: true }).fill(values[index]);
  await card.getByLabel(consentLabel, { exact: true }).setChecked(accepted);
}
async function calculate(card: Locator, contribution?: string, delta?: string) {
  await card.getByRole("button", { name: labels.buttons.calculate, exact: true }).click();
  if (contribution !== undefined) await expect(card.getByTestId("scenario-contribution")).toHaveText(contribution);
  if (delta !== undefined) await expect(card.getByTestId("scenario-delta")).toHaveText(delta);
}
/** R5-5：行動頁預設看板；這裡用清單檢視的 action-<n> 編輯表單（期限 type=date、負責人 datalist、證據 checkbox 清單）。 */
async function showActionList(page: Page) {
  await page.getByRole("button", { name: labels.nav.actions.label, exact: true }).click();
  await expect(actionsWorkbench(page)).toBeVisible();
  await switchActionsView(page, "list");
  await expect(page.getByTestId("actions-view-list")).toHaveAttribute("aria-pressed", "true");
}
/** 證據選取是 fieldset（role=group，名稱＝evidencePicker）內每個 fact 一個 checkbox，value＝fact id。 */
const evidenceChecklist = (card: Locator) => card.getByRole("group", { name: aw.evidencePicker, exact: true });
async function addConfirmedAction(page: Page, index = 1, problem = `待驗證問題 ${index}`) {
  await showActionList(page);
  await expect(actionsWorkbench(page).getByLabel(consentLabel)).toHaveCount(0);
  await page.getByRole("button", { name: labels.buttons.addAction, exact: true }).click();
  const card = action(page, index);
  const fields: Record<string, string> = {
    [labels.actions.problem]: problem, [labels.actions.step]: `檢查履約流程 ${index}`, [labels.actions.owner]: "營運負責人",
    [labels.actions.metric]: "同期間履約費用與行銷後貢獻", [labels.actions.due]: "2026-09-15",
    [labels.actions.stop]: "若服務品質下降立即停止", [labels.actions.extraData]: "訂單件數與物流計價條款",
  };
  for (const [label, value] of Object.entries(fields)) await card.getByLabel(label, { exact: true }).fill(value);
  await expect(card.getByLabel(labels.actions.due, { exact: true })).toHaveAttribute("type", "date");
  const evidence = evidenceChecklist(card);
  await expect(evidence).toHaveAttribute("data-testid", "evidence-checklist");
  const option = evidence.getByRole("checkbox", { name: factText("2026-08-02", "2026-08-02", cmAfter, "DTC", "270.00"), exact: true });
  const factId = await option.getAttribute("value");
  expect(factId, "引用本期 DTC 270.00 的系統事實，而非人工結果").toBeTruthy();
  expect(JSON.parse(factId!)[4]).toBe("channel");
  await expect(evidence).not.toContainText('["fact"');
  await option.check();
  await expect(evidence.locator("input[type=checkbox]:checked")).toHaveCount(1);
  await card.getByRole("button", { name: labels.buttons.confirm, exact: true }).click();
  await expect(card).toContainText(aw.tagConfirmed);
  return { card, factId: factId! };
}
async function downloadText(page: Page, format: "Markdown" | "CSV" | "JSON") {
  const extension = { Markdown: "md", CSV: "csv", JSON: "json" }[format];
  const buttonName = { Markdown: labels.downloads.decisionMd, CSV: labels.downloads.decisionCsv, JSON: labels.downloads.decisionJson }[format];
  const [download] = await Promise.all([
    page.waitForEvent("download"), page.getByRole("button", { name: buttonName, exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`profitlens-decision.${extension}`);
  const path = await download.path();
  expect(path).not.toBeNull();
  return readFile(path!, "utf8");
}
interface DecisionDocument {
  status: string;
  scenario_contexts: (DecisionDocument & { context_id: string; context_status: "current" | "historical" })[];
  session: {
    schema_version: string; scenario_version: string; metric_version: string; dataset_id: string;
    dataset_hash: string; filter_hash: string; data_as_of: string; revision: number;
    currency: string; timezone: string; amount_basis: string;
    period: { start: string; end: string }; scope: { channels: string[] };
    baseline: { amounts: Record<string, string | null> }; stale: boolean; stale_reasons: string[];
    sources: { file: string; line: number | null; channel?: string }[];
  };
  fixed_assumptions: string[]; formulas: Record<string, string>; rounding: string; limitations: string[];
  scenarios: { name: string; status: string; inputs: Record<string, string | boolean>; result: null | {
    contribution: string | null; delta: string | null; rounding_adjustment: string | null;
    amounts: Record<string, string> | null;
  } }[];
  actions: { priority: number; problem: string; action: string; owner_role: string; validation_metric: string;
    deadline: string; stop_condition: string; required_data: string; origin: string; status: string;
    evidence_confirmed: boolean; fact_ids: string[]; evidence: { id: string; value: string | null; sources: unknown[] }[] }[];
}
async function downloadJson(page: Page) { return JSON.parse(await downloadText(page, "JSON")) as DecisionDocument; }

/** Independent CSV reader for downloaded bytes; no application parser or formula is imported. */
function csvRecords(input: string): Record<string, string>[] {
  const text = input.replace(/^﻿/, "");
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
  const headers = rows.shift() ?? [];
  expect(headers.length).toBeGreaterThan(0);
  return rows.map(values => {
    expect(values.length).toBe(headers.length);
    return Object.fromEntries(headers.map((header, index) => [header.replace(/^.*\(([^()]+)\)\s*$/, "$1"), values[index]]));
  });
}

// 每個案例都是多段流程（載入→試算→行動→下載）；比照 review-v2-a 長流程把逾時放寬到 120 秒（平行代理共用伺服器時單步明顯變慢），斷言不放寬。
test.describe.configure({ timeout: 120_000 });
test.beforeEach(async ({ page }) => { await page.goto("/"); });

test("僅單一通路可試算，明填零變動重現 270.00 並可鍵盤查看基準證據", async ({ page }) => {
  await loadDataset(page);
  // R5-3：全站為全部通路時，點側欄一次（≤2 次點擊）就到表單；本頁通路單選只有個別通路（沒有「全部通路」），預設第一個，全站篩選不變。
  await page.getByRole("button", { name: labels.nav.scenarios.label, exact: true }).click();
  await startChannelContext(page);
  await expect(scenario(page).getByLabel(inputLabels[0], { exact: true })).toBeEditable();
  const channelSelect = page.getByTestId("scenario-channel");
  await expect(channelSelect).toHaveAccessibleName(labels.scenarioForm.channel);
  await expect(channelSelect.locator("option")).toHaveText(["DTC", "MARKETPLACE"]);
  await expect(channelSelect.locator("option")).not.toContainText([labels.evidence.allChannels]);
  await expect(channelSelect).toHaveValue("DTC");
  await expect(page.getByLabel(dash.filter.channel, { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: startButtonPrefix })).toHaveCount(0);
  await expect(page.getByTestId("baseline-contribution_after_marketing")).toHaveText("270.00");
  await expect(page.getByTestId("scenario-unavailable")).toHaveCount(0);
  await expectFreshDraft(page);
  const card = await addScenario(page);
  // 「全部填 0」已依規格移除：零變動要逐格明填 0。
  await expect(page.getByRole("button", { name: labels.buttons.fillZero, exact: true })).toHaveCount(0);
  for (const label of inputLabels) await card.getByLabel(label, { exact: true }).fill("0");
  for (const label of inputLabels) await expect(card.getByLabel(label, { exact: true })).toHaveValue("0");
  await expect(card.getByLabel(consentLabel)).not.toBeChecked();
  await card.getByLabel(consentLabel).check();
  await calculate(card, "270.00", "0.00");
  await expect(card.getByTestId("scenario-version")).toHaveText(fill(labels.scenarioForm.version, { n: 1 }));
  await expect(card.getByTestId("scenario-draft")).toHaveCount(0);
  const opener = page.getByTestId("baseline-contribution_after_marketing");
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: evidenceDialogName(fill(dw.baselineEvidenceTitle, { metric: cmAfter })), exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("p.number")).toHaveText("NT$ 270.00");
  await expect(dialog).toContainText(evidencePeriodLine("2026-08-02", "2026-08-02", "DTC"));
  await expect(dialog).toContainText(fill(labels.evidence.lineN, { n: 6 }));
  for (const tab of ["sales", "costs", "ads"] as const) {
    await showSourceTab(dialog, tab);
    await expect(dialog).toContainText(sourceTabFiles[tab]);
  }
  for (let index = 0; index < 5; index += 1) {
    await page.keyboard.press(index % 2 ? "Shift+Tab" : "Tab");
    expect(await page.evaluate(() => document.activeElement?.closest("dialog") !== null)).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("三個方案各自從 270.00 重算為 270／284／264，不串接或相加", async ({ page }, testInfo) => {
  await openGolden(page);
  const cases = [
    { values: ["0", "0", "0", "0", "0"], contribution: "270.00", delta: "0.00" },
    { values: ["0", "0", "-10", "0", "0"], contribution: "284.00", delta: "+14.00" },
    { values: ["0", "0", "-10", "0", "20"], contribution: "264.00", delta: "-6.00" },
  ];
  for (const [index, item] of cases.entries()) {
    const card = await addScenario(page, index + 1);
    await fillScenario(card, item.values);
    await calculate(card, item.contribution, item.delta);
    await expect(card.getByTestId("scenario-version")).toHaveText(fill(labels.scenarioForm.version, { n: 1 }));
  }
  await expect(page.getByRole("button", { name: labels.buttons.addScenario, exact: true })).toBeDisabled();
  await expect(page.getByTestId("scenario-4")).toHaveCount(0);
  const total = page.getByTestId("scenario-comparison").locator("tbody tr").filter({ has: page.locator("th").filter({ hasText: new RegExp(`^${escapeRegExp(cmAfter)}$`) }) });
  await expect(total.getByRole("cell")).toHaveText(["270.00", "270.00", "284.00", "264.00"]);
  await expect(page.getByTestId("scenario-comparison")).toContainText(dw.compareTableCaption);
  await mkdir(resolve("verification"), { recursive: true });
  await page.screenshot({ path: resolve(`verification/review-v2-a-regression-regression-m6-regression-${testInfo.project.name}-scenarios.png`), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "頁面本身不可橫向溢出；比較表可在自己的區域捲動").toBe(true);
  await scenario(page, 2).getByLabel(inputLabels[2], { exact: true }).fill("-5");
  await expect(scenario(page, 2).getByTestId("scenario-contribution")).toHaveCount(0);
  // R5-3：修改後顯示「草稿（未重新計算）」，版本徽章只在結果有效時出現。
  await expect(scenario(page, 2).getByTestId("scenario-draft")).toHaveText(labels.scenario.draft);
  await expect(scenario(page, 2).getByTestId("scenario-version")).toHaveCount(0);
  await expect(scenario(page, 1).getByTestId("scenario-contribution")).toHaveText("270.00");
  await expect(scenario(page, 3).getByTestId("scenario-contribution")).toHaveText("264.00");
  // 版本號只在計算成功時前進：改回與最新版本相同的假設再算 → 維持版本 1；
  await scenario(page, 2).getByLabel(inputLabels[2], { exact: true }).fill("-10");
  await calculate(scenario(page, 2), "284.00", "+14.00");
  await expect(scenario(page, 2).getByTestId("scenario-version")).toHaveText(fill(labels.scenarioForm.version, { n: 1 }));
  // 假設不同 → 版本 2。手算：DTC 本期物流費 140.00（−10% 省 14.00），−5% 省 7.00 → 270.00 + 7.00 = 277.00；
  await scenario(page, 2).getByLabel(inputLabels[2], { exact: true }).fill("-5");
  await calculate(scenario(page, 2), "277.00", "+7.00");
  await expect(scenario(page, 2).getByTestId("scenario-version")).toHaveText(fill(labels.scenarioForm.version, { n: 2 }));
  // 未通過檢核的計算不前進版本號、也不顯示版本徽章；同樣假設重算仍是版本 2。
  await scenario(page, 2).getByLabel(inputLabels[2], { exact: true }).fill("-101");
  await calculate(scenario(page, 2));
  await expect(scenario(page, 2).getByTestId("scenario-result")).toContainText(dw.cannotCalculate);
  await expect(scenario(page, 2).getByTestId("scenario-version")).toHaveCount(0);
  await scenario(page, 2).getByLabel(inputLabels[2], { exact: true }).fill("-5");
  await calculate(scenario(page, 2), "277.00", "+7.00");
  await expect(scenario(page, 2).getByTestId("scenario-version")).toHaveText(fill(labels.scenarioForm.version, { n: 2 }));
  await expect(scenario(page, 1).getByTestId("scenario-version")).toHaveText(fill(labels.scenarioForm.version, { n: 1 }));
  await expect(scenario(page, 3).getByTestId("scenario-version")).toHaveText(fill(labels.scenarioForm.version, { n: 1 }));
});

test("減少廣告仍必須明填銷量，拒絕固定假設不得顯示精確增益", async ({ page }) => {
  await openGolden(page);
  const card = await addScenario(page);
  await fillScenario(card, ["", "0", "0", "-20", "0"]);
  await calculate(card);
  await expect(card.getByTestId("scenario-result")).toContainText(dw.cannotCalculate);
  await expect(card.getByTestId("scenario-result")).toContainText(labels.scenario.volume.label);
  await expect(card.getByTestId("scenario-contribution")).toHaveCount(0);
  await expect(card.getByTestId("scenario-delta")).toHaveCount(0);
  await card.getByLabel(inputLabels[0], { exact: true }).fill("0");
  await calculate(card, "324.00", "+54.00");
  await card.getByLabel(consentLabel).uncheck();
  await expect(card.getByTestId("scenario-contribution")).toHaveCount(0);
  await calculate(card);
  await expect(card.getByTestId("scenario-result")).toContainText(dw.planUnavailable);
  await expect(card.getByTestId("scenario-delta")).toHaveCount(0);
  const document = await downloadJson(page);
  expect(document.scenarios[0].inputs.assumptions_accepted).toBe(false);
  expect(document.scenarios[0].result?.contribution).toBeNull();
  expect(document.scenarios[0].result?.delta).toBeNull();
});

test("輸入超界、負投入與過度精度不得默默修正為可用試算", async ({ page }) => {
  await openGolden(page);
  const card = await addScenario(page);
  for (const [index, invalid] of [[0, "-91"], [1, "100"], [2, "-101"], [3, "201"], [4, "-1"], [4, "0.001"]] as const) {
    await fillScenario(card, ["0", "0", "0", "0", "0"]);
    await card.getByLabel(inputLabels[index], { exact: true }).fill(invalid);
    await calculate(card);
    await expect(card.getByTestId("scenario-result")).toContainText(dw.cannotCalculate);
    await expect(card.getByTestId("scenario-contribution")).toHaveCount(0);
    await expect(card.getByLabel(inputLabels[index], { exact: true })).toHaveValue(invalid);
  }
});

test("百分點、各成本與取分閉合：負基準 MARKETPLACE 可得 19.70 與差額 34.70", async ({ page }) => {
  await openGolden(page, "MARKETPLACE");
  const card = await addScenario(page);
  await fillScenario(card, ["20", "2", "-10", "-20", "20"]);
  await calculate(card, "19.70", "+34.70");
  // Independently derived rational anchor: CM = 4433/225 = 19.70222…;
  // displayed components sum to 19.71, so adjustment must be -0.01.
  const m = labels.metrics;
  const expected: Record<string, string> = {
    [m.gross_sales.label]: "1,560.00", [m.discounts.label]: "295.20", [m.refunds.label]: "105.40",
    [m.cogs_net.label]: "702.00", [m.platform_fees.label]: "140.53", [m.payment_fees.label]: "25.76",
    [m.fulfillment_costs.label]: "91.80", [m.other_variable_costs.label]: "15.60", [m.ad_spend.label]: "144.00",
    [labels.scenario.oneOff.label]: "20.00", [dw.roundingAdjustment]: "-0.01", [fill(dw.netRevenueSummaryRow, { metric: m.net_revenue.label })]: "1,159.40",
  };
  for (const [label, amount] of Object.entries(expected)) {
    const row = page.getByTestId("scenario-comparison").locator("tbody tr").filter({ has: page.locator("th").filter({ hasText: new RegExp(`^${escapeRegExp(label)}`) }) });
    await expect(row.getByRole("cell").last()).toHaveText(amount);
  }
  const document = await downloadJson(page);
  expect(document.session.baseline.amounts.contribution_after_marketing).toBe("-15.00");
  expect(document.scenarios[0].result).toMatchObject({ contribution: "19.70", delta: "34.70", rounding_adjustment: "-0.01" });
  const rows = csvRecords(await downloadText(page, "CSV"));
  expect(rows.find(row => row.row_type === "scenario_result" && row.field === "rounding_adjustment")?.value).toBe("-0.01");
  expect(rows.find(row => row.row_type === "baseline_amount" && row.field === "contribution_after_marketing")?.value).toBe("-15.00");
});

for (const incomplete of [
  { dataset: "missing-cogs", channel: "DTC", revenue: "1,480.00" },
  { dataset: "missing-ad", channel: "MARKETPLACE", revenue: "990.00" },
]) {
  test(`${incomplete.dataset} 缺漏通路保留營收，禁止情境補零或顯示 NaN`, async ({ page }) => {
    await loadDataset(page, incomplete.dataset, labels.status.partial);
    await selectChannel(page, incomplete.channel, labels.status.partial);
    await expect(kpi(page, "net_revenue")).toHaveText(incomplete.revenue);
    await expect(kpi(page, "contribution_after_marketing")).toHaveText(labels.status.missing);
    await showScenarios(page);
    await expect(page.getByTestId("scenario-unavailable")).toBeVisible();
    await expect(page.getByTestId("baseline-net_revenue")).toHaveText(incomplete.revenue);
    await expect(page.getByTestId("baseline-contribution_after_marketing")).toHaveText("—");
    await expect(page.getByRole("button", { name: labels.buttons.addScenario, exact: true })).toBeDisabled();
    // R5-3：進頁草稿仍顯示，但整張表單停用，不能補零計算。
    await expect(page.getByTestId("scenario-channel")).toHaveValue(incomplete.channel);
    await expect(scenario(page).getByRole("button", { name: labels.buttons.calculate, exact: true })).toBeDisabled();
    for (const label of inputLabels) await expect(scenario(page).getByLabel(label, { exact: true })).toBeDisabled();
    await expect(scenario(page).getByTestId("scenario-contribution")).toHaveCount(0);
    await expect(workbench(page)).not.toContainText(/NaN|Infinity/);
  });
}

test("切換通路保留個別方案與行動原始引用，管理欄位更新不撤銷引用確認", async ({ page }) => {
  await openGolden(page);
  const card = await addScenario(page, 1, "保留名稱的履約測試");
  await fillScenario(card, ["0", "0", "-10", "0", "20"]);
  await calculate(card, "264.00", "-6.00");
  const original = await addConfirmedAction(page, 1, "保留人工問題");
  const before = await downloadJson(page);
  await selectChannel(page, "MARKETPLACE");
  await showScenarios(page);
  await expect(page.getByTestId("scenario-channel")).toHaveValue("MARKETPLACE");
  await expect(page.getByTestId("baseline-contribution_after_marketing")).toHaveText("-15.00");
  // R5-3：MARKETPLACE 只有進頁草稿「方案 1」，DTC 的方案不帶過來，而是列在「其他通路的方案」。
  await expectFreshDraft(page);
  const others = page.getByTestId("scenario-other-channels");
  await others.locator(":scope > summary").click();
  await expect(others).toContainText(fill(msw.planSummary, { plan: "保留名稱的履約測試", resultLabel: labels.scenario.resultTitle, amount: "264.00" }));
  // 本頁通路單選只換本頁：切到 DTC 看得到原方案，全站篩選仍是 MARKETPLACE；再切回 MARKETPLACE 仍是草稿。
  await selectScenarioChannel(page, "DTC");
  await expect(page.getByLabel(dash.filter.channel, { exact: true })).toHaveValue("MARKETPLACE");
  await expect(card.getByTestId("scenario-contribution")).toHaveText("264.00");
  await selectScenarioChannel(page, "MARKETPLACE");
  await expectFreshDraft(page);
  await selectChannel(page, "DTC");
  await showScenarios(page);
  await expect(page.getByTestId("scenario-channel")).toHaveValue("DTC");
  await expect(page.getByTestId("decision-freshness")).toContainText(dw.freshTitle);
  await expect(card.getByRole("button", { name: labels.buttons.calculate, exact: true })).toBeEnabled();
  await expect(card.getByTestId("scenario-contribution")).toHaveText("264.00");
  await expect(card.getByLabel(dw.planName, { exact: true })).toHaveValue("保留名稱的履約測試");
  await expect(card.getByLabel(inputLabels[2], { exact: true })).toHaveValue("-10");
  await expect(scenario(page, 2)).toHaveCount(0);
  const current = await downloadJson(page);
  expect(current.status).toBe("current");
  expect(current.session.dataset_hash).toBe(before.session.dataset_hash);
  expect(current.session.filter_hash).toBe(before.session.filter_hash);
  expect(current.scenarios[0].result?.contribution).toBe("264.00");
  expect(current.scenario_contexts.every(context => context.context_status === "current")).toBe(true);
  await showActionList(page);
  const checked = evidenceChecklist(action(page)).locator("input[type=checkbox]:checked");
  await expect(checked).toHaveCount(1);
  await expect(checked).toHaveAttribute("value", original.factId);
  await expect(action(page)).toContainText(aw.tagConfirmed);
  await action(page).getByLabel(labels.actions.owner, { exact: true }).fill("物流主管");
  const taipeiDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
  const statusDay = taipeiDay();
  await action(page).getByLabel(labels.actions.status, { exact: true }).selectOption("in_progress");
  await action(page).getByLabel(labels.actions.progress, { exact: true }).fill("已索取報價，尚待核對");
  await expect(action(page)).toContainText(aw.tagConfirmed);
  await action(page).getByRole("button", { name: new RegExp(`^${escapeRegExp(aw.viewEvidenceItem.split("{fact}")[0])}`) }).click();
  await expect(page.getByRole("dialog").locator("p.number")).toHaveText("NT$ 270.00");
  await page.getByRole("dialog").getByRole("button", { name: labels.buttons.close, exact: true }).click();
  const document = await downloadJson(page);
  expect(document.actions[0]).toMatchObject({ status: "confirmed", owner_role: "物流主管", evidence_confirmed: true, fact_ids: [original.factId], execution_status: "in_progress", progress_notes: "已索取報價，尚待核對" });
  // R5-5：狀態改變記下 status_updated_at（臺北日曆日；跨午夜時容許前後一天）。
  expect([statusDay, taipeiDay()]).toContain((document.actions[0] as { status_updated_at?: string }).status_updated_at);
  expect(document.actions[0].evidence[0].value).toBe("270.00");
});

test("試算頁自選通路後，全站通路範圍改變再改回，本頁回到新範圍的預設通路", async ({ page }) => {
  // R5 修 E2E 時發現的產品 bug（已修）：本頁的通路選擇原本以「全站範圍簽章」記住，範圍 A→B→A 時舊選擇復活；
  // 現在全站範圍一改變就回到新範圍的預設通路（02 §6）。
  await openGolden(page);
  await selectScenarioChannel(page, "MARKETPLACE");
  await expect(page.getByLabel(dash.filter.channel, { exact: true })).toHaveValue("DTC");
  await expect(page.getByTestId("baseline-contribution_after_marketing")).toHaveText("-15.00");
  await selectChannel(page, "MARKETPLACE");
  await startChannelContext(page);
  await expect(page.getByTestId("scenario-channel")).toHaveValue("MARKETPLACE");
  await selectChannel(page, "DTC");
  await startChannelContext(page);
  await expect(page.getByTestId("scenario-channel"), "全站範圍改成 DTC 後，試算頁應回到新範圍的預設通路 DTC").toHaveValue("DTC");
  await expect(page.getByTestId("baseline-contribution_after_marketing")).toHaveText("270.00");
});

test("資料集切換再回相同 golden，舊方案仍為歷史；複製只保留名稱並清空假設", async ({ page }) => {
  await openGolden(page);
  const card = await addScenario(page, 1, "歷史履約方案");
  await fillScenario(card, ["0", "0", "-10", "0", "0"]);
  await calculate(card, "284.00", "+14.00");
  const oldContext = (await downloadJson(page)).scenario_contexts[0].context_id;
  await loadDataset(page, "demo");
  await showScenarios(page);
  await page.getByText(msw.historyHeading, { exact: true }).click();
  await expect(page.getByTestId("multi-scenario-workbench")).toContainText(historyPlanLine("歷史履約方案", "284.00"));
  await loadDataset(page);
  await selectChannel(page, "DTC");
  await showScenarios(page);
  // R5-3：同一 golden 回來只有新的進頁草稿，舊方案不復活。
  await expectFreshDraft(page);
  const historical = (await downloadJson(page)).scenario_contexts.find(context => context.context_id === oldContext)!;
  expect(historical).toMatchObject({ context_status: "historical", status: "stale" });
  expect(historical.scenarios[0].result?.contribution).toBe("284.00");
  const history = page.getByTestId("multi-scenario-workbench").locator("details").filter({ has: page.locator("summary").filter({ hasText: new RegExp(`^${escapeRegExp(msw.historyHeading)}$`) }) });
  if (await history.getAttribute("open") === null) await history.locator("summary").click();
  await page.getByRole("button", { name: msw.copyToCurrent, exact: true }).click();
  await expect(scenario(page).getByLabel(dw.planName, { exact: true })).toHaveValue("歷史履約方案");
  for (const label of inputLabels) await expect(scenario(page).getByLabel(label, { exact: true })).toHaveValue("");
  await expect(scenario(page).getByLabel(consentLabel)).not.toBeChecked();
  await expect(scenario(page).getByTestId("scenario-contribution")).toHaveCount(0);
  expect((await downloadJson(page)).scenarios[0]).toMatchObject({ status: "draft", result: null });
});

test("有效期間切換再回原期間，歷史結果不復活或自動沿用假設", async ({ page }) => {
  await loadDataset(page, "demo");
  await selectChannel(page, "DTC");
  await showScenarios(page);
  const card = await addScenario(page);
  await fillScenario(card, ["0", "0", "0", "0", "0"]);
  await calculate(card);
  await expect(card.getByTestId("scenario-contribution")).toBeVisible();
  const original = (await downloadJson(page)).scenario_contexts[0];
  const ranges = [
    ["2026-06-01", "2026-06-01", "2026-07-13", "2026-07-13"],
    ["2026-06-01", "2026-07-12", "2026-07-13", "2026-08-23"],
  ];
  const dateLabels = [
    periodFieldLabel("start", labels.periods.previous), periodFieldLabel("end", labels.periods.previous),
    periodFieldLabel("start", labels.periods.current), periodFieldLabel("end", labels.periods.current),
  ];
  for (const values of ranges) {
    for (const [index, label] of dateLabels.entries()) await page.getByLabel(label, { exact: true }).fill(values[index]);
    await page.getByRole("button", { name: labels.buttons.apply, exact: true }).click();
    await expect(workspaceStatus(page)).toContainText(labels.status.ready);
    await showScenarios(page);
    // R5-3：新期間只有進頁草稿，原期間的結果與假設不沿用。
    await expectFreshDraft(page);
    const document = await downloadJson(page);
    const historical = document.scenario_contexts.find(context => context.context_id === original.context_id)!;
    expect(historical).toMatchObject({ context_status: "historical", status: "stale" });
    expect(historical.scenarios[0].result?.contribution).toBe(original.scenarios[0].result?.contribution);
    expect(document.scenarios).toHaveLength(0);
  }
});

test("四項人工行動可新增但僅三項置頂，鍵盤排序及人類可讀證據保留來源與返回焦點", async ({ page }, testInfo) => {
  await openGolden(page);
  const first = await addConfirmedAction(page, 1, "第一個人工問題");
  await addConfirmedAction(page, 2, "第二個人工問題");
  await addConfirmedAction(page, 3, "第三個人工問題");
  for (const index of [1, 2, 3]) await action(page, index).getByRole("button", { name: labels.buttons.pin, exact: true }).click();
  await expect(page.getByRole("button", { name: labels.buttons.addAction, exact: true })).toBeEnabled();
  await addConfirmedAction(page, 4, "第四個人工問題");
  await action(page, 4).getByRole("button", { name: labels.buttons.pin, exact: true }).click();
  await expect(page.getByTestId("action-notice")).toContainText(aw.maxPinned);
  await expect(action(page, 4).getByRole("button", { name: labels.buttons.pin, exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(actionsWorkbench(page).getByRole("button", { name: aw.unpin, exact: true })).toHaveCount(3);
  await expect(page.getByTestId("action-4")).toBeVisible();
  await expect(action(page, 1).getByRole("button", { name: labels.buttons.moveUp, exact: true })).toBeDisabled();
  await action(page, 2).getByRole("button", { name: labels.buttons.moveUp, exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(action(page, 1).getByLabel(labels.actions.problem, { exact: true })).toHaveValue("第二個人工問題");
  await expect(action(page, 2).getByLabel(labels.actions.problem, { exact: true })).toHaveValue("第一個人工問題");
  await action(page, 1).getByLabel(labels.actions.step, { exact: true }).fill("修改後先核對單位履約成本");
  await expect(action(page, 1)).toContainText(aw.tagConfirmed);
  const opener = action(page, 2).getByRole("button", { name: fill(aw.viewEvidenceItem, { fact: factText("2026-08-02", "2026-08-02", cmAfter, "DTC", "270.00") }), exact: true });
  await expect(opener).not.toContainText(first.factId);
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: evidenceDialogName(fill(aw.evidenceTitle, { metric: cmAfter })), exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("p.number")).toHaveText("NT$ 270.00");
  await expect(dialog).toContainText(`DTC；${evidencePeriodLine("2026-08-02", "2026-08-02", "DTC")}`);
  await expect(dialog).toContainText("sales_daily.csv");
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  await mkdir(resolve("verification"), { recursive: true });
  await page.screenshot({ path: resolve(`verification/review-v2-a-regression-regression-m6-regression-${testInfo.project.name}-actions.png`), fullPage: true });
  expect(await page.evaluate(() => window.document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const document = await downloadJson(page);
  expect(document.actions.map(item => [item.priority, item.problem])).toEqual([[1, "第二個人工問題"], [2, "第一個人工問題"], [3, "第三個人工問題"], [4, "第四個人工問題"]]);
  expect(document.actions[0]).toMatchObject({ action: "修改後先核對單位履約成本", origin: "manual", status: "confirmed" });
  expect(document.actions[1].fact_ids).toEqual([first.factId]);
  expect(document.actions[1].evidence[0]).toMatchObject({ id: first.factId, value: "270.00" });
});

test("未選 fact 的行動只能保持引用待確認", async ({ page }) => {
  await openGolden(page);
  await showActionList(page);
  await page.getByRole("button", { name: labels.buttons.addAction, exact: true }).click();
  await expect(evidenceChecklist(action(page)).locator("input[type=checkbox]:checked")).toHaveCount(0);
  await action(page).getByLabel(labels.actions.problem, { exact: true }).fill("尚未確認的問題");
  await action(page).getByRole("button", { name: labels.buttons.confirm, exact: true }).click();
  await expect(page.getByTestId("action-notice")).toContainText(aw.confirmFailed);
  await expect(action(page)).toContainText(aw.tagDraft);
  const document = await downloadJson(page);
  expect(document.actions[0]).toMatchObject({ status: "draft", evidence_confirmed: false, fact_ids: [], evidence: [] });
});

test("三種本機匯出保存固定基準、五項輸入、公式、版本、範圍與來源", async ({ page }) => {
  await openGolden(page);
  const card = await addScenario(page, 1, "含一次性投入的履約方案");
  await fillScenario(card, ["0", "0", "-10", "0", "20"]);
  await calculate(card, "264.00", "-6.00");
  const { factId } = await addConfirmedAction(page);
  const document = await downloadJson(page);
  expect(document.status).toBe("current");
  expect(document.session).toMatchObject({
    schema_version: "decision-v1", scenario_version: "scenario-v1", metric_version: "contribution-v1",
    currency: "TWD", timezone: "Asia/Taipei", amount_basis: "product_amounts_excluding_tax_and_customer_shipping_income",
    dataset_id: "golden-v1", data_as_of: "2026-08-03", period: { start: "2026-08-02", end: "2026-08-02" },
    scope: { channels: ["DTC"] }, stale: false,
  });
  expect(document.session.dataset_hash.length).toBeGreaterThan(10);
  expect(document.session.filter_hash.length).toBeGreaterThan(10);
  expect(document.session.baseline.amounts.contribution_after_marketing).toBe("270.00");
  expect(document.fixed_assumptions.length).toBeGreaterThanOrEqual(5);
  expect(document.formulas).toHaveProperty("platform_fees");
  expect(document.formulas).toHaveProperty("payment_fees");
  expect(document.rounding).toContain("HALF_UP");
  expect(document.scenarios[0]).toMatchObject({
    status: "valid", inputs: { volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "-10", ad_change_pct: "0", one_time_cost: "20", assumptions_accepted: true },
    result: { contribution: "264.00", delta: "-6.00" },
  });
  expect(document.actions[0].fact_ids).toEqual([factId]);
  expect(document.actions[0].evidence[0].sources.length).toBeGreaterThan(0);
  expect(document.session.sources.some(source => source.file === "sales_daily.csv" && source.line === 6 && source.channel === "DTC")).toBe(true);
  const csv = await downloadText(page, "CSV");
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  const rows = csvRecords(csv);
  expect(rows.every(row => row.dataset_id === "golden-v1" && row.dataset_hash === document.session.dataset_hash && row.filter_hash === document.session.filter_hash && row.snapshot_status === "current")).toBe(true);
  const summaryRows = rows.filter(row => row.row_type !== "fact");
  expect(summaryRows.every(row => JSON.parse(row.scope).channels.join() === "DTC")).toBe(true);
  expect(rows.find(row => row.row_type === "scenario_result" && row.field === "contribution")?.value).toBe("264.00");
  expect(rows.find(row => row.row_type === "scenario_result" && row.field === "delta")?.value).toBe("-6.00");
  expect(rows.filter(row => row.row_type === "scenario_input")).toHaveLength(6);
  expect(rows.some(row => row.row_type === "manual_action" && row.fact_ids === JSON.stringify([factId]))).toBe(true);
  expect(rows.some(row => row.source_refs.includes('"actual_filename":"sales_daily.csv"'))).toBe(true);
  const markdown = await downloadText(page, "Markdown");
  const de = labels.ui.decisionExport;
  for (const text of [`# ${de.title}`, de.statusCurrent, "264", "DTC", "HALF", labels.sections.scenarioAssumptions, de.sectionFormulas, labels.sections.actionList, de.sectionFacts]) expect(markdown).toContain(text);
  await expect(page.getByTestId("action-notice")).toContainText(aw.exportDone);
});

test("不可信方案與行動文字不執行，CSV 防公式而 Markdown 不產生惡意連結", async ({ page }) => {
  await openGolden(page);
  const name = '=1+1 <img src=x onerror=alert(1)> [link](javascript:alert(1))';
  const problem = '=HYPERLINK("https://example.invalid","x")\n<script>alert(1)</script>';
  const card = await addScenario(page, 1, name);
  await fillScenario(card, ["0", "0", "-10", "0", "20"]);
  await calculate(card, "264.00", "-6.00");
  await addConfirmedAction(page, 1, problem);
  await expect(page.locator("img[src='x']")).toHaveCount(0);
  await expect(page.locator("a[href^='javascript:']")).toHaveCount(0);
  const document = await downloadJson(page);
  expect(document.scenarios[0].name).toBe(name);
  expect(document.actions[0].problem).toBe(problem);
  const rows = csvRecords(await downloadText(page, "CSV"));
  expect(rows.find(row => row.row_type === "scenario_result" && row.field === "delta")).toMatchObject({ item_name: `'${name}`, value: "-6.00" });
  expect(rows.find(row => row.row_type === "manual_action" && row.field === "problem")?.value).toBe(`'${problem}`);
  const markdown = await downloadText(page, "Markdown");
  expect(markdown).not.toContain("<img");
  expect(markdown).not.toContain("<script>");
  expect(markdown).not.toContain("[link](javascript:");
  expect(markdown).toContain("&lt;script&gt;");
  expect(markdown).toContain("&#10;");
});

test("試算、人工行動與三種下載零 HTTP、零持久化，重整與新頁不共用", async ({ page, context, browserAudit }) => {
  await loadDataset(page, "golden", labels.status.ready, true);
  // R6（D7＝A）：載入資料後出現非 modal 的首次保存提示；按「先不要」維持手動保存，之後任何變更都不得建立本機資料庫。
  const savePrompt = page.getByTestId("local-save-prompt");
  await expect(savePrompt).toBeVisible();
  await savePrompt.getByRole("button", { name: labels.autoSave.decline, exact: true }).click();
  await expect(savePrompt).toHaveCount(0);
  await selectChannel(page, "DTC");
  await showScenarios(page);
  await expect(page.getByTestId("baseline-contribution_after_marketing")).toHaveText("270.00");
  const before = await page.evaluate(async () => ({ local: Object.keys(localStorage).sort(), session: Object.keys(sessionStorage).sort(), databases: (await indexedDB.databases()).map(value => ({ name: value.name, version: value.version })) }));
  expect(before.databases, "按「先不要」後 IndexedDB 不得有任何資料庫").toEqual([]);
  const requests: { method: string; resourceType: string; hasBody: boolean }[] = [];
  await page.route("**/*", async route => {
    const request = route.request();
    requests.push({ method: request.method(), resourceType: request.resourceType(), hasBody: request.postDataBuffer() !== null });
    await route.abort("blockedbyclient");
  });
  const card = await addScenario(page);
  await fillScenario(card, ["0", "0", "-10", "0", "0"]);
  await calculate(card, "284.00", "+14.00");
  await addConfirmedAction(page);
  for (const format of ["Markdown", "CSV", "JSON"] as const) await downloadText(page, format);
  // 自動保存的 debounce 是 AUTO_SAVE_DELAY_MS；多等一個週期再比對，確認拒絕後沒有排程中的寫入。
  await page.waitForTimeout(AUTO_SAVE_DELAY_MS + 600);
  const after = await page.evaluate(async () => ({ local: Object.keys(localStorage).sort(), session: Object.keys(sessionStorage).sort(), databases: (await indexedDB.databases()).map(value => ({ name: value.name, version: value.version })) }));
  expect(after).toEqual(before);
  expect(requests, "計算、行動與本機下載不得呼叫模型或任何 HTTP API").toEqual([]);
  await page.unroute("**/*");
  const other = await context.newPage();
  await other.goto("/");
  await expect(workspaceStatus(other)).toContainText(labels.status.empty);
  await expect(workbench(other)).toHaveCount(0);
  await other.close();
  expectedBeforeUnload.add(page);
  await page.reload();
  expect(browserAudit.filter(event => event.kind === "unsaved-changes-warning")).toEqual([{ kind: "unsaved-changes-warning", type: "beforeunload" }]);
  await expect(workspaceStatus(page)).toContainText(labels.status.empty);
  await expect(workbench(page)).toHaveCount(0);
});
