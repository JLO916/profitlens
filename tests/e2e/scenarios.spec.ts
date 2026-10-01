import { appendFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test as base, expect, type Locator, type Page } from "@playwright/test";

const inputLabels = [
  "售出量變化（相對 %）", "折扣率變化（百分點）", "單位履約成本變化（相對 %）",
  "總廣告支出變化（相對 %）", "一次性投入（TWD）",
] as const;
const consentLabel = "我接受此方案的全部固定假設";
const workspaceStatus = (page: Page) => page.getByTestId("workspace-status");
const workbench = (page: Page) => page.getByTestId("decision-workbench");
const scenario = (page: Page, index = 1) => page.getByTestId(`scenario-${index}`);
const action = (page: Page, index = 1) => page.getByTestId(`action-${index}`);
const kpi = (page: Page, metric: string) => page.getByTestId(`kpi-${metric}`).locator(".kpi-value");

interface AuditEvent { kind: string; type?: string; errorName?: string }
const test = base.extend<{ browserAudit: AuditEvent[] }>({
  browserAudit: [async ({ page }, use, testInfo) => {
    const events: AuditEvent[] = [];
    // Never persist manual text, imported rows, console arguments, or request bodies.
    page.on("console", message => events.push({ kind: "console", type: message.type() }));
    page.on("pageerror", error => events.push({ kind: "pageerror", errorName: error.name }));
    page.on("dialog", dialog => {
      events.push({ kind: "javascript-dialog", type: dialog.type() });
      void dialog.dismiss();
    });
    await use(events);
    const record = { recorded_at: new Date().toISOString(), project: testInfo.project.name, test: testInfo.title, status: testInfo.status, events };
    await mkdir(resolve("verification"), { recursive: true });
    await appendFile(resolve("verification/m6-regression-browser-meta.jsonl"), `${JSON.stringify(record)}\n`);
    await testInfo.attach("browser-metadata", { body: JSON.stringify(record, null, 2), contentType: "application/json" });
    expect(events.filter(event => event.kind === "pageerror" || event.kind === "javascript-dialog" || event.type === "error"), "情境與行動不執行輸入文字，不產生未處理的瀏覽器錯誤").toEqual([]);
  }, { auto: true }],
});

async function loadDataset(page: Page, id = "golden", classification = "資料已就緒") {
  await page.getByLabel("資料集", { exact: true }).selectOption(id);
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith(`/api/datasets/${id}`) && response.status() === 200),
    page.getByRole("button", { name: "載入資料集", exact: true }).click(),
  ]);
  await expect(workspaceStatus(page)).toContainText(classification);
}
async function selectChannel(page: Page, channel: string, classification = "資料已就緒") {
  await page.getByLabel("通路", { exact: true }).selectOption(channel);
  await expect(workspaceStatus(page)).toContainText(classification);
}
async function showScenarios(page: Page) {
  await page.getByRole("button", { name: "情境試算", exact: true }).click();
  await expect(workbench(page)).toBeVisible();
}
async function openGolden(page: Page, channel = "DTC") {
  await loadDataset(page);
  await selectChannel(page, channel);
  await showScenarios(page);
  await expect(page.getByTestId("baseline-contribution_after_marketing")).toHaveText(channel === "DTC" ? "270.00" : "-15.00");
}
async function addScenario(page: Page, index = 1, name = `獨立方案 ${index}`) {
  await page.getByRole("button", { name: "新增方案", exact: true }).click();
  const card = scenario(page, index);
  await card.getByLabel("方案名稱", { exact: true }).fill(name);
  return card;
}
async function fillScenario(card: Locator, values: readonly string[], accepted = true) {
  expect(values).toHaveLength(inputLabels.length);
  for (const [index, label] of inputLabels.entries()) await card.getByLabel(label, { exact: true }).fill(values[index]);
  await card.getByLabel(consentLabel, { exact: true }).setChecked(accepted);
}
async function calculate(card: Locator, contribution?: string, delta?: string) {
  await card.getByRole("button", { name: "計算方案", exact: true }).click();
  if (contribution !== undefined) await expect(card.getByTestId("scenario-contribution")).toHaveText(contribution);
  if (delta !== undefined) await expect(card.getByTestId("scenario-delta")).toHaveText(delta);
}
async function addConfirmedAction(page: Page, index = 1, problem = `待驗證問題 ${index}`) {
  await page.getByRole("button", { name: "行動摘要", exact: true }).click();
  await page.getByRole("button", { name: "新增行動", exact: true }).click();
  const card = action(page, index);
  const fields: Record<string, string> = {
    問題: problem, 具體動作: `檢查履約流程 ${index}`, 負責角色: "營運負責人",
    驗證指標: "同期間履約費用與行銷後貢獻", 期限: "2026-09-15",
    停止條件: "若服務品質下降立即停止", 所需額外資料: "訂單件數與物流計價條款",
  };
  for (const [label, value] of Object.entries(fields)) await card.getByLabel(label, { exact: true }).fill(value);
  const evidence = card.getByLabel("本快照證據（可複選）", { exact: true });
  const factId = await evidence.locator("option").filter({ hasText: /2026-08-02.*行銷後貢獻 · DTC · 270\.00/ }).filter({ hasText: /"channel"/ }).getAttribute("value");
  expect(factId, "引用本期 DTC 270.00 的系統事實，而非人工結果").toBeTruthy();
  await evidence.selectOption(factId!);
  await card.getByRole("button", { name: "確認行動與證據", exact: true }).click();
  await expect(card).toContainText("使用者已確認");
  return { card, factId: factId! };
}
async function downloadText(page: Page, format: "Markdown" | "CSV" | "JSON") {
  const extension = { Markdown: "md", CSV: "csv", JSON: "json" }[format];
  const [download] = await Promise.all([
    page.waitForEvent("download"), page.getByRole("button", { name: `下載決策 ${format}`, exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`profitlens-decision.${extension}`);
  const path = await download.path();
  expect(path).not.toBeNull();
  return readFile(path!, "utf8");
}
interface DecisionDocument {
  status: string;
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
  const headers = rows.shift() ?? [];
  expect(headers.length).toBeGreaterThan(0);
  return rows.map(values => {
    expect(values.length).toBe(headers.length);
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}

test.beforeEach(async ({ page }) => { await page.goto("/"); });

test("僅單一通路可試算，明填零變動重現 270.00 並可鍵盤查看基準證據", async ({ page }) => {
  await loadDataset(page);
  await showScenarios(page);
  await expect(page.getByTestId("scenario-unavailable")).toContainText("單一通路");
  await expect(page.getByRole("button", { name: "新增方案", exact: true })).toBeDisabled();
  await selectChannel(page, "DTC");
  await expect(page.getByTestId("baseline-contribution_after_marketing")).toHaveText("270.00");
  await expect(page.getByTestId("scenario-unavailable")).toHaveCount(0);
  const card = await addScenario(page);
  for (const label of inputLabels) await expect(card.getByLabel(label, { exact: true })).toHaveValue("");
  await card.getByRole("button", { name: "填入零變動假設", exact: true }).click();
  for (const label of inputLabels) await expect(card.getByLabel(label, { exact: true })).toHaveValue("0");
  await expect(card.getByLabel(consentLabel)).not.toBeChecked();
  await card.getByLabel(consentLabel).check();
  await calculate(card, "270.00", "0.00");
  const opener = page.getByTestId("baseline-contribution_after_marketing");
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "基準 · 行銷後貢獻｜公式與來源", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("p.number")).toHaveText("NT$ 270.00");
  await expect(dialog).toContainText("2026-08-02 至 2026-08-02；通路：DTC");
  for (const filename of ["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"]) await expect(dialog).toContainText(filename);
  await expect(dialog).toContainText("第 6 行");
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
  }
  await expect(page.getByRole("button", { name: "新增方案", exact: true })).toBeDisabled();
  await expect(page.getByTestId("scenario-4")).toHaveCount(0);
  const total = page.getByTestId("scenario-comparison").locator("tbody tr").filter({ has: page.locator("th").filter({ hasText: /^行銷後貢獻$/ }) });
  await expect(total.getByRole("cell")).toHaveText(["270.00", "270.00", "284.00", "264.00"]);
  await expect(page.getByTestId("scenario-comparison")).toContainText("不相加");
  await mkdir(resolve("verification"), { recursive: true });
  await page.screenshot({ path: resolve(`verification/m6-regression-${testInfo.project.name}-scenarios.png`), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "頁面本身不可橫向溢出；比較表可在自己的區域捲動").toBe(true);
  await scenario(page, 2).getByLabel(inputLabels[2], { exact: true }).fill("-5");
  await expect(scenario(page, 2).getByTestId("scenario-contribution")).toHaveCount(0);
  await expect(scenario(page, 1).getByTestId("scenario-contribution")).toHaveText("270.00");
  await expect(scenario(page, 3).getByTestId("scenario-contribution")).toHaveText("264.00");
});

test("減少廣告仍必須明填銷量，拒絕固定假設不得顯示精確增益", async ({ page }) => {
  await openGolden(page);
  const card = await addScenario(page);
  await fillScenario(card, ["", "0", "0", "-20", "0"]);
  await calculate(card);
  await expect(card.getByTestId("scenario-result")).toContainText("尚不可計算");
  await expect(card.getByTestId("scenario-result")).toContainText("售出量變化");
  await expect(card.getByTestId("scenario-contribution")).toHaveCount(0);
  await expect(card.getByTestId("scenario-delta")).toHaveCount(0);
  await card.getByLabel(inputLabels[0], { exact: true }).fill("0");
  await calculate(card, "324.00", "+54.00");
  await card.getByLabel(consentLabel).uncheck();
  await expect(card.getByTestId("scenario-contribution")).toHaveCount(0);
  await calculate(card);
  await expect(card.getByTestId("scenario-result")).toContainText("此方案暫不適用");
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
    await expect(card.getByTestId("scenario-result")).toContainText("尚不可計算");
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
  const expected: Record<string, string> = {
    "折扣前商品收入": "1,560.00", "商品折扣": "295.20", "已入帳退款": "105.40",
    "銷貨成本淨額": "702.00", "平台費用": "140.53", "金流費用": "25.76",
    "履約費用": "91.80", "其他變動成本": "15.60", "廣告費": "144.00",
    "一次性投入 K": "20.00", "取分調整 rounding_adjustment": "-0.01", "商品淨營收（另列摘要）": "1,159.40",
  };
  for (const [label, amount] of Object.entries(expected)) {
    const row = page.getByTestId("scenario-comparison").locator("tbody tr").filter({ has: page.locator("th").filter({ hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }) });
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
    await loadDataset(page, incomplete.dataset, "部分資料待補");
    await selectChannel(page, incomplete.channel, "部分資料待補");
    await expect(kpi(page, "net_revenue")).toHaveText(incomplete.revenue);
    await expect(kpi(page, "contribution_after_marketing")).toHaveText("資料待補");
    await showScenarios(page);
    await expect(page.getByTestId("scenario-unavailable")).toBeVisible();
    await expect(page.getByTestId("baseline-net_revenue")).toHaveText(incomplete.revenue);
    await expect(page.getByTestId("baseline-contribution_after_marketing")).toHaveText("—");
    await expect(page.getByRole("button", { name: "新增方案", exact: true })).toBeDisabled();
    await expect(workbench(page)).not.toContainText(/NaN|Infinity/);
  });
}

test("通路換回原值仍過期；重建清空全部假設與證據，保留人工名稱文字", async ({ page }) => {
  await openGolden(page);
  const card = await addScenario(page, 1, "保留名稱的履約測試");
  await fillScenario(card, ["0", "0", "-10", "0", "20"]);
  await calculate(card, "264.00", "-6.00");
  await addConfirmedAction(page, 1, "保留人工問題");
  await showScenarios(page);
  await selectChannel(page, "MARKETPLACE");
  await expect(page.getByTestId("decision-freshness")).toContainText("情境與行動已過期");
  await selectChannel(page, "DTC");
  await expect(page.getByTestId("decision-freshness")).toContainText("情境與行動已過期");
  await expect(card.getByRole("button", { name: "計算方案", exact: true })).toBeDisabled();
  await expect(card.getByTestId("scenario-result")).toContainText("已過期");
  await expect(page.getByTestId("baseline-contribution_after_marketing")).toBeDisabled();
  const old = await downloadJson(page);
  expect(old.status).toBe("stale");
  expect(old.session.stale).toBe(true);
  expect(old.session.stale_reasons).toContain("WORKSPACE_REVISION_CHANGED");
  expect(old.session.scope.channels).toEqual(["DTC"]);
  expect(old.scenarios[0].result?.contribution).toBe("264.00");
  expect(await downloadText(page, "Markdown")).toContain("過期（stale）");
  expect(csvRecords(await downloadText(page, "CSV")).every(row => row.snapshot_status === "stale")).toBe(true);
  await page.getByRole("button", { name: "以目前快照重建並清空假設", exact: true }).click();
  await expect(page.getByTestId("decision-freshness")).toContainText("使用目前快照");
  await expect(card.getByLabel("方案名稱", { exact: true })).toHaveValue("保留名稱的履約測試");
  for (const label of inputLabels) await expect(card.getByLabel(label, { exact: true })).toHaveValue("");
  await expect(card.getByLabel(consentLabel)).not.toBeChecked();
  await expect(card.getByTestId("scenario-contribution")).toHaveCount(0);
  await page.getByRole("button", { name: "行動摘要", exact: true }).click();
  await expect(action(page).getByLabel("問題", { exact: true })).toHaveValue("保留人工問題");
  await expect(action(page).getByLabel("本快照證據（可複選）", { exact: true })).toHaveValues([]);
  await expect(action(page).getByRole("button", { name: /^查看證據 / })).toHaveCount(0);
  await expect(action(page)).toContainText("草稿／證據待確認");
  const rebuilt = await downloadJson(page);
  expect(rebuilt.status).toBe("current");
  expect(rebuilt.scenarios[0]).toMatchObject({ status: "draft", result: null });
  expect(rebuilt.actions[0]).toMatchObject({ status: "draft", evidence_confirmed: false, fact_ids: [] });
});

test("資料集切換後即使回到相同 golden 與通路，舊方案仍過期", async ({ page }) => {
  await openGolden(page);
  const card = await addScenario(page);
  await fillScenario(card, ["0", "0", "-10", "0", "0"]);
  await calculate(card, "284.00", "+14.00");
  await loadDataset(page, "demo");
  await showScenarios(page);
  await expect(page.getByTestId("decision-freshness")).toContainText("情境與行動已過期");
  await loadDataset(page);
  await selectChannel(page, "DTC");
  await showScenarios(page);
  await expect(page.getByTestId("decision-freshness")).toContainText("情境與行動已過期");
  await expect(card.getByRole("button", { name: "計算方案", exact: true })).toBeDisabled();
  await expect(card.getByTestId("scenario-contribution")).toHaveText("284.00");
});

test("有效期間切換再回原期間仍過期，不自動沿用先前假設", async ({ page }) => {
  await loadDataset(page, "demo");
  await selectChannel(page, "DTC");
  await showScenarios(page);
  const card = await addScenario(page);
  await fillScenario(card, ["0", "0", "0", "0", "0"]);
  await calculate(card);
  await expect(card.getByTestId("scenario-contribution")).toBeVisible();
  const ranges = [
    ["2026-06-01", "2026-06-01", "2026-07-13", "2026-07-13"],
    ["2026-06-01", "2026-07-12", "2026-07-13", "2026-08-23"],
  ];
  for (const values of ranges) {
    for (const [index, label] of ["前期開始", "前期結束", "本期開始", "本期結束"].entries()) await page.getByLabel(label, { exact: true }).fill(values[index]);
    await page.getByRole("button", { name: "套用期間", exact: true }).click();
    await expect(workspaceStatus(page)).toContainText("資料已就緒");
    await expect(page.getByTestId("decision-freshness")).toContainText("情境與行動已過期");
  }
  await expect(card.getByRole("button", { name: "計算方案", exact: true })).toBeDisabled();
});

test("三項人工行動可編輯、鍵盤排序、引用本期 fact 並返回焦點", async ({ page }, testInfo) => {
  await openGolden(page);
  const first = await addConfirmedAction(page, 1, "第一個人工問題");
  await addConfirmedAction(page, 2, "第二個人工問題");
  await addConfirmedAction(page, 3, "第三個人工問題");
  await expect(page.getByRole("button", { name: "新增行動", exact: true })).toBeDisabled();
  await expect(page.getByTestId("action-4")).toHaveCount(0);
  await expect(action(page, 1).getByRole("button", { name: "提高優先序", exact: true })).toBeDisabled();
  await action(page, 2).getByRole("button", { name: "提高優先序", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(action(page, 1).getByLabel("問題", { exact: true })).toHaveValue("第二個人工問題");
  await expect(action(page, 2).getByLabel("問題", { exact: true })).toHaveValue("第一個人工問題");
  await action(page, 1).getByLabel("具體動作", { exact: true }).fill("修改後先核對單位履約成本");
  await expect(action(page, 1)).toContainText("草稿／證據待確認");
  await action(page, 1).getByRole("button", { name: "確認行動與證據", exact: true }).click();
  await expect(action(page, 1)).toContainText("使用者已確認");
  const opener = action(page, 2).getByRole("button", { name: `查看證據 ${first.factId}`, exact: true });
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "行動證據 · 行銷後貢獻｜公式與來源", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("p.number")).toHaveText("NT$ 270.00");
  await expect(dialog).toContainText("單一通路完整商品集合；2026-08-02 至 2026-08-02；通路：DTC");
  await expect(dialog).toContainText("sales_daily.csv");
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  await mkdir(resolve("verification"), { recursive: true });
  await page.screenshot({ path: resolve(`verification/m6-regression-${testInfo.project.name}-actions.png`), fullPage: true });
  expect(await page.evaluate(() => window.document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const document = await downloadJson(page);
  expect(document.actions.map(item => [item.priority, item.problem])).toEqual([[1, "第二個人工問題"], [2, "第一個人工問題"], [3, "第三個人工問題"]]);
  expect(document.actions[0]).toMatchObject({ action: "修改後先核對單位履約成本", origin: "manual", status: "confirmed" });
  expect(document.actions[1].fact_ids).toEqual([first.factId]);
  expect(document.actions[1].evidence[0]).toMatchObject({ id: first.factId, value: "270.00" });
});

test("未填完七欄或未選 fact 的行動只能保持草稿", async ({ page }) => {
  await openGolden(page);
  await page.getByRole("button", { name: "行動摘要", exact: true }).click();
  await page.getByRole("button", { name: "新增行動", exact: true }).click();
  await action(page).getByLabel("問題", { exact: true }).fill("尚未確認的問題");
  await action(page).getByRole("button", { name: "確認行動與證據", exact: true }).click();
  await expect(page.getByTestId("decision-notice")).toContainText("請填完七個欄位並選擇至少一項本快照證據");
  await expect(action(page)).toContainText("草稿／證據待確認");
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
  for (const text of ["# ProfitLens 決策紀錄", "目前快照", "264", "DTC", "HALF", "固定假設", "完整公式與取分", "人工行動", "系統資料事實與來源"]) expect(markdown).toContain(text);
  await expect(page.getByTestId("decision-notice")).toContainText("已下載本機工作稿");
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

test("試算、人工行動與三種下載零 HTTP、零持久化，重整與新頁不共用", async ({ page, context }) => {
  await openGolden(page);
  const before = await page.evaluate(async () => ({ local: Object.keys(localStorage).sort(), session: Object.keys(sessionStorage).sort(), databases: (await indexedDB.databases()).map(value => ({ name: value.name, version: value.version })) }));
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
  const after = await page.evaluate(async () => ({ local: Object.keys(localStorage).sort(), session: Object.keys(sessionStorage).sort(), databases: (await indexedDB.databases()).map(value => ({ name: value.name, version: value.version })) }));
  expect(after).toEqual(before);
  expect(requests, "計算、行動與本機下載不得呼叫模型或任何 HTTP API").toEqual([]);
  await page.unroute("**/*");
  const other = await context.newPage();
  await other.goto("/");
  await expect(workspaceStatus(other)).toContainText("尚未載入資料");
  await expect(workbench(other)).toHaveCount(0);
  await other.close();
  await page.reload();
  await expect(workspaceStatus(page)).toContainText("尚未載入資料");
  await expect(workbench(page)).toHaveCount(0);
});
