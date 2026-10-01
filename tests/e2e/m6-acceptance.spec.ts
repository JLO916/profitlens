import { appendFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test, expect, type Page } from "@playwright/test";

const alternative = resolve("tests/fixtures/alternative");
const golden = resolve("fixtures/golden");
const csvLabels = {
  "sales_daily.csv": "商品銷售 CSV",
  "channel_costs_daily.csv": "通路費用 CSV",
  "ad_spend_daily.csv": "廣告支出 CSV",
};
const status = (page: Page) => page.getByTestId("workspace-status");
const form = (page: Page) => page.getByTestId("import-panel");
const kpi = (page: Page, metric: string) => page.getByTestId(`kpi-${metric}`).locator(".kpi-value");
const inputLabels = ["售出量變化（相對 %）", "折扣率變化（百分點）", "單位履約成本變化（相對 %）", "總廣告支出變化（相對 %）", "一次性投入（TWD）"];

interface DecisionDocument {
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
  await page.getByRole("button", { name: "匯入標準 CSV", exact: true }).click();
  await expect(form(page)).toContainText("重新整理會清空資料與匯入草稿");
  for (const [file, label] of Object.entries(csvLabels)) await form(page).getByLabel(label, { exact: true }).setInputFiles(resolve(directory, file));
  const manifest = JSON.parse(await readFile(resolve(directory, "manifest.json"), "utf8")) as { dataset_id: string };
  await form(page).getByLabel("讀取 manifest JSON", { exact: true }).setInputFiles(resolve(directory, "manifest.json"));
  await expect(form(page).getByLabel("資料集名稱", { exact: true })).toHaveValue(manifest.dataset_id);
  await expect(form(page).getByLabel("我已確認未稅商品金額與費用口徑", { exact: true })).not.toBeChecked();
  await form(page).getByLabel("我已確認未稅商品金額與費用口徑", { exact: true }).check();
}
async function validate(page: Page) {
  await form(page).getByRole("button", { name: "檢核匯入資料", exact: true }).click();
  await expect(form(page).getByTestId("import-status")).toHaveText("檢核通過，可套用資料");
}
async function importDataset(page: Page, directory: string) {
  await stage(page, directory);
  await validate(page);
  await form(page).getByRole("button", { name: "套用匯入資料", exact: true }).click();
  await expect(status(page)).toContainText("資料已就緒");
  await expect(form(page)).toHaveCount(0);
}
async function scenario(page: Page, name: string, fulfillment: string, investment: string, expected: string) {
  await page.getByRole("button", { name: "情境試算", exact: true }).click();
  await page.getByRole("button", { name: "新增方案", exact: true }).click();
  const card = page.getByTestId("scenario-1");
  await card.getByLabel("方案名稱", { exact: true }).fill(name);
  for (const [index, value] of ["0", "0", fulfillment, "0", investment].entries()) await card.getByLabel(inputLabels[index], { exact: true }).fill(value);
  await card.getByLabel("我接受此方案的全部固定假設", { exact: true }).check();
  await card.getByRole("button", { name: "計算方案", exact: true }).click();
  await expect(card.getByTestId("scenario-contribution")).toHaveText(expected);
}
async function download(page: Page, format: "JSON" | "CSV" | "Markdown") {
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: `下載決策 ${format}`, exact: true }).click()]);
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
  const headers = rows.shift() ?? [];
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
  await expect(kpi(page, "net_revenue")).toHaveText("600.00");
  await expect(kpi(page, "contribution_after_marketing")).toHaveText("10.00");
  await page.getByLabel("通路", { exact: true }).selectOption("DTC");
  await expect(kpi(page, "net_revenue")).toHaveText("400.00");
  await expect(kpi(page, "contribution_after_marketing")).toHaveText("40.00");
  await page.getByRole("button", { name: "通路診斷", exact: true }).click();
  await expect(page.getByRole("heading", { name: "淨營收增加，行銷後貢獻下降", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "廣告費占淨營收比上升", exact: true }).first()).toBeVisible();

  // Two DTC days: N=400, C=200, P=10, Q=6, F=14, O=0, A=130.
  // v=0, delta=0, f=-50%, a=0, K=3 => 400-200-10-6-7-0-130-3=44.
  await scenario(page, "M6 合成履約條件方案", "-50", "3", "44.00");
  await expect(page.getByTestId("scenario-1").getByTestId("scenario-delta")).toHaveText("+4.00");
  await expect(page.getByTestId("decision-workbench")).toContainText("不是預測");
  await page.getByRole("button", { name: "行動摘要", exact: true }).click();
  await page.getByRole("button", { name: "新增行動", exact: true }).click();
  const action = page.getByTestId("action-1");
  const fields = { 問題: "營收上升但行銷後貢獻下降，需核對成本", 具體動作: "核對履約計價條款並設計有限範圍測試", 負責角色: "營運主管", 驗證指標: "同範圍履約費用與行銷後貢獻", 期限: "2026-10-15", 停止條件: "若服務品質下降即停止測試", 所需額外資料: "物流實際報價與服務品質資料" };
  for (const [label, value] of Object.entries(fields)) await action.getByLabel(label, { exact: true }).fill(value);
  const evidence = action.getByLabel("本快照證據（可複選）", { exact: true });
  const factId = await evidence.locator("option").filter({ hasText: /2026-09-03–2026-09-04 · 行銷後貢獻 · DTC（通路） · 40\.00/ }).getAttribute("value");
  expect(factId).toBeTruthy();
  await evidence.selectOption(factId!);
  await action.getByRole("button", { name: "確認行動與證據", exact: true }).click();
  await expect(action).toContainText("使用者已確認");

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
  for (const value of [document.session.dataset_hash, document.session.filter_hash, "contribution-v1", "2026-09-05", "2026-09-03", "2026-09-04", "DTC", "44.00", "4.00", "固定假設", "fulfillment_change_pct：-50", "one_time_cost：3", fields.問題]) expect(readableMarkdown).toContain(value);
  await expect(page.locator("img[src='x']")).toHaveCount(0);
  expect(errors).toEqual([]);
  await mkdir(resolve("verification"), { recursive: true });
  await page.screenshot({ path: resolve(`verification/manager-batch3-regression-regression-m6-${testInfo.project.name}-complete-flow.png`), fullPage: true });
  await testInfo.attach("m6-synthetic-decision-json", { body: JSON.stringify(document, null, 2), contentType: "application/json" });
  await appendFile(resolve("verification/manager-batch3-regression-regression-m6-ui-flow-meta.jsonl"), `${JSON.stringify({ project: testInfo.project.name, status: "passed", synthetic_only: true, dataset_id: document.session.dataset_id, baseline: "40.00", scenario: "44.00", delta: "4.00", exports: ["JSON", "CSV", "Markdown"], browser_errors: errors })}\n`);
});

test("M6 獨立 browser context 各自匯入與操作，清空或重新整理不影響另一方", async ({ page, browser }, testInfo) => {
  await importDataset(page, alternative);
  await page.getByLabel("通路", { exact: true }).selectOption("DTC");
  await expect(kpi(page, "contribution_after_marketing")).toHaveText("40.00");
  await scenario(page, "甲分頁獨立假設", "-50", "3", "44.00");
  const first = await decision(page);
  // A separate context has independent cookie/storage partitions and a new page.
  const otherContext = await browser.newContext({ locale: "zh-TW", timezoneId: "Asia/Taipei", viewport: page.viewportSize()! });
  try {
    const other = await otherContext.newPage();
    await other.goto(page.url());
    await expect(status(other)).toContainText("尚未載入資料");
    await expect(other.getByTestId("decision-workbench")).toHaveCount(0);
    await importDataset(other, golden);
    await other.getByLabel("通路", { exact: true }).selectOption("DTC");
    await expect(kpi(other, "contribution_after_marketing")).toHaveText("270.00");
    await scenario(other, "乙分頁獨立假設", "-10", "0", "284.00");
    const second = await decision(other);
    expect(second.session.dataset_id).toBe("golden-v1");
    expect(second.session.dataset_hash).not.toBe(first.session.dataset_hash);
    expect(second.session.baseline.amounts.contribution_after_marketing).toBe("270.00");
    expect(second.scenarios[0].name).toBe("乙分頁獨立假設");
    expect(await decision(page)).toEqual(first);
    await other.getByRole("button", { name: "清空工作區", exact: true }).click();
  await other.getByRole("button", { name: "捨棄未保存變更並清空", exact: true }).click();
    await expect(status(other)).toContainText("尚未載入資料");
    expect(await decision(page)).toEqual(first);
    await importDataset(other, golden);
    expectedBeforeUnload.add(page);
    await page.reload();
    expect(dialogEvents.get(page)).toEqual(["unsaved-changes-warning:beforeunload"]);
    await expect(status(page)).toContainText("尚未載入資料");
    await expect(page.getByTestId("decision-workbench")).toHaveCount(0);
    await expect(kpi(other, "contribution_after_marketing")).toHaveText("255.00");
    expect(await otherContext.storageState()).toEqual({ cookies: [], origins: [] });
    await mkdir(resolve("verification"), { recursive: true });
    await appendFile(resolve("verification/manager-batch3-regression-regression-m6-context-isolation-meta.jsonl"), `${JSON.stringify({ project: testInfo.project.name, status: "passed", independent_contexts: 2, synthetic_only: true, mutual_update_clear_reload_isolation: true, dialog_events: dialogEvents.get(page) })}\n`);
  } finally { await otherContext.close(); }
});

test("M6 檢核後改設定與換錯檔均撤銷可提交候選，取消保留原資料及有效決策", async ({ page }) => {
  await importDataset(page, golden);
  await page.getByLabel("通路", { exact: true }).selectOption("DTC");
  await expect(kpi(page, "contribution_after_marketing")).toHaveText("270.00");
  await scenario(page, "尚未被取代的工作稿", "-10", "0", "284.00");
  const before = await decision(page);
  await stage(page, alternative);
  await validate(page);
  await form(page).getByLabel("資料集名稱", { exact: true }).fill("m6-edited-import-candidate");
  await expect(form(page).getByRole("button", { name: "套用匯入資料", exact: true })).toHaveCount(0);
  await expect(form(page).getByTestId("import-status")).toHaveText("匯入草稿，尚未提交");
  await validate(page);
  await form(page).getByLabel("商品銷售 CSV", { exact: true }).setInputFiles({ name: "m6-malformed.csv", mimeType: "text/csv", buffer: Buffer.from('date,channel,sku\n"unclosed') });
  await expect(form(page).getByRole("button", { name: "套用匯入資料", exact: true })).toHaveCount(0);
  await form(page).getByRole("button", { name: "檢核匯入資料", exact: true }).click();
  await expect(form(page).getByTestId("import-status")).toHaveText("檢核未通過，未取代目前資料");
  await form(page).getByRole("button", { name: "取消匯入", exact: true }).click();
  await page.getByRole("button", { name: "情境試算", exact: true }).click();
  await expect(page.getByTestId("decision-freshness")).toContainText("使用目前快照");
  expect(await decision(page)).toEqual(before);
  await importDataset(page, alternative);
  await page.getByRole("button", { name: "情境試算", exact: true }).click();
  await expect(page.getByTestId("decision-freshness")).toContainText("情境已過期");
  const historical = await decision(page);
  expect(historical.status).toBe("stale");
  expect(historical.session.dataset_hash).toBe(before.session.dataset_hash);
  expect(historical.session.dataset_id).toBe("golden-v1");
  expect(historical.scenarios[0].result?.contribution).toBe("284.00");
});
