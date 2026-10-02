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

const notice = "尚未置頂行動；主摘要不會自動挑選，其餘列附錄。";
const actionName = (index: number) => `匯出驗收行動第${index}項`;

async function saveDownload(page: Page, button: Locator, path: string) {
  const pending = page.waitForEvent("download");
  await button.click();
  const download = await pending;
  const destination = resolve(path);
  await download.saveAs(destination);
  return readFile(destination, "utf8");
}

/** Independent quote-aware reader; inspect downloaded cells rather than substring matches. */
function csvRecords(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  const value = text.replace(/^\uFEFF/, "");
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
  const headers = rows.shift()!;
  return rows.map(values => { expect(values).toHaveLength(headers.length); return Object.fromEntries(headers.map((key, index) => [key, values[index]])); });
}

async function checkPrint(page: Page, info: TestInfo, pinned: boolean) {
  const summary = page.getByTestId("manager-summary");
  await summary.getByRole("button", { name: "列印主管摘要", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-print-invoked", "true");
  await page.emulateMedia({ media: "print" });
  const print = page.getByTestId("manager-summary-print");
  await expect(print).toBeVisible();
  await expect(summary).toBeHidden();
  await expect(print).toContainText("門檻 1,000.00 TWD");
  await expect(print).toContainText("-315.00");
  await expect(print).toContainText("+220.00");
  const main = print.locator(":scope > ul > li");
  const appendix = print.locator(":scope > section").filter({ has: page.getByRole("heading", { name: "其他行動附錄", exact: true }) });
  await expect(main).toHaveCount(pinned ? 3 : 0);
  await expect(appendix.locator(":scope > ul > li")).toHaveCount(pinned ? 5 : 8);
  for (let index = 1; index <= 8; index++) await expect((pinned && index <= 3 ? main : appendix).getByText(actionName(index), { exact: true })).toBeVisible();
  if (!pinned) {
    await expect(print).toContainText(notice);
    await expect(print).not.toContainText("尚未建立行動");
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
  await page.getByRole("button", { name: "進階驗證", exact: true }).click();
  await page.getByLabel("資料集", { exact: true }).selectOption("golden");
  await page.getByRole("button", { name: "載入資料集", exact: true }).click();
  await expect(page.getByTestId("workspace-status")).toContainText("資料已就緒");
  await page.getByRole("button", { name: "行動摘要", exact: true }).click();
  for (let index = 1; index <= 8; index++) {
    await page.getByRole("button", { name: "新增行動", exact: true }).click();
    const card = page.getByTestId(`action-${index}`);
    await card.getByLabel("問題", { exact: true }).fill(actionName(index));
    await card.getByLabel("具體動作", { exact: true }).fill("核對已入帳費用與來源");
    await card.getByLabel("負責角色", { exact: true }).fill("營運主管");
    const evidence = card.getByLabel("本快照證據（可複選）", { exact: true });
    const id = await evidence.locator("option").filter({ hasText: /2026-08-02–2026-08-02 · 行銷後貢獻 · DTC、MARKETPLACE（範圍合計） · 255\.00/ }).getAttribute("value");
    expect(id).toBeTruthy();
    await evidence.selectOption(id!);
    if (index <= 3) await card.getByRole("button", { name: "置頂行動", exact: true }).click();
  }
  await page.getByRole("button", { name: "經營總覽", exact: true }).click();
  const updates = page.getByRole("button", { name: /^更新會議行動引用：/ });
  while (await updates.count()) await updates.first().click();
  const summary = page.getByTestId("manager-summary");
  await summary.getByLabel("金額重要性門檻（TWD）", { exact: true }).fill("1000");
  await summary.getByRole("button", { name: "套用摘要門檻", exact: true }).click();
  await expect(summary.getByLabel("金額重要性門檻（TWD）", { exact: true })).toHaveValue("1000.00");
  const main = summary.getByRole("heading", { name: "會議方案與交辦", exact: true }).locator("..").locator(":scope > ul > li");
  await expect(main).toHaveCount(3);
  const appendix = summary.locator(":scope > details").filter({ has: page.getByText("其他行動附錄（5）", { exact: true }) });
  await appendix.locator(":scope > summary").click();
  await expect(appendix.locator(":scope > ul > li")).toHaveCount(5);
  for (let index = 1; index <= 8; index++) await expect((index <= 3 ? main : appendix).getByText(actionName(index), { exact: true })).toBeVisible();

  const prefix = `verification/review-v2-a-decision-${info.project.name}`;
  const markdown = await saveDownload(page, summary.getByRole("button", { name: "下載主管摘要 Markdown", exact: true }), `${prefix}.md`);
  const [body, technical] = markdown.split("## 技術稽核附錄");
  expect(body.match(/匯出驗收行動第/g)).toHaveLength(3);
  expect(technical.match(/匯出驗收行動第/g)).toHaveLength(5);
  expect(body).toContain("重要性門檻：1000.00 TWD");
  expect(body).toContain("570.00 → 255.00；差額 -315.00");
  expect(body).toContain("2250.00 → 2470.00；差額 +220.00");
  await page.screenshot({ path: resolve(`verification/review-v2-a-decision-ui-pinned-${info.project.name}.png`), fullPage: true });
  await checkPrint(page, info, true);

  await page.getByRole("button", { name: "行動摘要", exact: true }).click();
  const json = JSON.parse(await saveDownload(page, page.getByRole("button", { name: "下載決策 JSON", exact: true }), `${prefix}.json`));
  const csv = csvRecords(await saveDownload(page, page.getByRole("button", { name: "下載決策 CSV", exact: true }), `${prefix}.csv`));
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

  for (let index = 0; index < 3; index++) await page.getByRole("button", { name: "取消置頂", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "取消置頂", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "經營總覽", exact: true }).click();
  await expect(main).toHaveCount(0);
  await expect(summary).toContainText(notice);
  await expect(summary).not.toContainText("行動尚未建立");
  const allAppendix = summary.locator(":scope > details").filter({ has: page.getByText("其他行動附錄（8）", { exact: true }) });
  await allAppendix.locator(":scope > summary").click();
  await expect(allAppendix.locator(":scope > ul > li")).toHaveCount(8);
  const unpinned = await saveDownload(page, summary.getByRole("button", { name: "下載主管摘要 Markdown", exact: true }), `verification/review-v2-a-decision-unpinned-${info.project.name}.md`);
  const [unpinnedBody, unpinnedAppendix] = unpinned.split("## 技術稽核附錄");
  expect(unpinnedBody).toContain(notice);
  expect(unpinnedBody).not.toMatch(/行動尚未建立|尚未建立行動|匯出驗收行動第/);
  expect(unpinnedAppendix.match(/匯出驗收行動第/g)).toHaveLength(8);
  await page.screenshot({ path: resolve(`verification/review-v2-a-decision-ui-unpinned-${info.project.name}.png`), fullPage: true });
  await checkPrint(page, info, false);
});
