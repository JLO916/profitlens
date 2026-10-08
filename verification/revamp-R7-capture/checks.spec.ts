import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page, type Request } from "@playwright/test";
import { labels } from "../../src/i18n";
import { SITE_URL } from "../../src/app/site";
import { importViaWizard } from "../../tests/e2e/import-wizard-helpers";
import { clickReplacing, dismissSavePrompt, openDownloads } from "../../tests/e2e/replacement-helpers";

// R7 上線檢查（08 §4 第 6–10 條）對著本機 production 伺服器（PUBLIC_DEMO 設定）執行，結果寫到 verification/revamp-R7/checks-*.json；
// 只在 desktop 專案跑一次（--project=desktop）。對應的產品行為斷言在 tests/e2e/*.spec.ts。
const dir = resolve("verification/revamp-R7");
const nav = (page: Page, id: keyof typeof labels.shell.nav) => page.getByRole("button", { name: labels.shell.nav[id].headline, exact: true });
const describeFocus = (page: Page) => page.evaluate(() => {
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body) return "body";
  return [el.tagName.toLowerCase(), el.id && `#${el.id}`, el.dataset.testid && `[${el.dataset.testid}]`, el.className && `.${String(el.className).split(" ")[0]}`, (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 24)].filter(Boolean).join(" ");
});

test.beforeAll(async () => { await mkdir(dir, { recursive: true }); });

test("§4-6 鍵盤走查：Tab 順序、Esc 關閉、焦點回原按鈕", async ({ page }) => {
  await page.goto("/");
  const order: string[] = [];
  for (let i = 0; i < 10; i++) { await page.keyboard.press("Tab"); order.push(await describeFocus(page)); }
  expect(order[0]).toContain("skip-link");
  // 跳至主要內容：重新載入後第一個 Tab 是跳過連結，Enter 後焦點落在 main。
  await page.goto("/");
  await page.keyboard.press("Tab");
  expect(await describeFocus(page)).toContain("skip-link");
  await page.keyboard.press("Enter");
  const afterSkip = await describeFocus(page);

  // 載入示範後：看證據抽屜 Enter 開、Esc 關、焦點回「看證據」。
  await page.getByRole("button", { name: labels.shell.buttons.loadDemo, exact: true }).first().click();
  await expect(page.getByTestId("workspace-status")).toContainText(labels.shell.status.ready);
  await dismissSavePrompt(page);
  const evidenceButton = page.getByTestId("top-three").getByRole("button", { name: labels.evidence.buttons.viewEvidence, exact: true }).first();
  await evidenceButton.focus();
  await page.keyboard.press("Enter");
  const drawer = page.getByRole("dialog").filter({ hasNot: page.getByTestId("local-save-prompt") }).first();
  await expect(drawer).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest("dialog,[role=dialog]"))).toBe(true);
  const focusInDrawer = await page.evaluate(() => !!document.activeElement?.closest("dialog,[role=dialog]"));
  const focusedInDrawer = await describeFocus(page);
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(evidenceButton).toBeFocused();

  // 下載選單（details）：Enter 開、Esc 關、焦點留在 summary。
  const downloads = page.getByTestId("download-menu");
  await downloads.locator(":scope > summary").focus();
  await page.keyboard.press("Enter");
  await expect(downloads).toHaveAttribute("open", "");
  await page.keyboard.press("Escape");
  const downloadsClosedByEsc = (await downloads.getAttribute("open")) === null;
  const focusAfterMenuEsc = await describeFocus(page);
  if (!downloadsClosedByEsc) await downloads.locator(":scope > summary").press("Enter");
  await expect(downloads).not.toHaveAttribute("open", "");

  // 會議紀錄：結束會議的確認區塊 Esc 取消、焦點回「結束會議」。
  await nav(page, "meeting").click();
  await page.getByTestId("meeting-page").waitFor({ state: "visible" });
  const finalize = page.getByTestId("meeting-finalize");
  await finalize.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("meeting-finalize-confirm")).toBeVisible();
  await page.keyboard.press("Escape");
  const finalizeConfirmClosedByEsc = (await page.getByTestId("meeting-finalize-confirm").count()) === 0;
  const focusAfterFinalizeEsc = await describeFocus(page);

  const result = { tabOrderFromLanding: order, afterSkipLinkEnter: afterSkip, evidenceDrawer: { focusMovedIntoDialog: focusInDrawer, focusedElement: focusedInDrawer, escapeClosed: true, focusReturnedToOpener: true }, downloadMenu: { escapeClosed: downloadsClosedByEsc, focusAfterEscape: focusAfterMenuEsc }, meetingFinalizeConfirm: { escapeClosed: finalizeConfirmClosedByEsc, focusAfterEscape: focusAfterFinalizeEsc } };
  await writeFile(resolve(dir, "checks-keyboard.json"), JSON.stringify(result, null, 2));
  expect(focusInDrawer).toBe(true);
});

test("§4-8 備份相容：R0 前的 v3 備份檔可恢復", async ({ page }) => {
  const file = resolve("verification/review-v2-a-workspace-laptop.json");
  const bytes = await readFile(file);
  const backup = JSON.parse(bytes.toString("utf8"));
  expect(backup.schema_version).toBe("profitlens-workspace-v3");
  await page.goto("/");
  const store = labels.storage.workspace;
  const menu = page.getByTestId("workspace-storage");
  await menu.locator(":scope > summary").click();
  await menu.getByLabel(store.selectBackupFile, { exact: true }).setInputFiles({ name: "review-v2-a-workspace-laptop.json", mimeType: "application/json", buffer: bytes });
  const preview = page.getByRole("region", { name: store.restorePreviewAria });
  await expect(preview).toBeVisible();
  await page.screenshot({ path: resolve(dir, "8-v3-restore-preview-desktop-viewport.png") });
  await clickReplacing(page, menu.getByRole("button", { name: store.applyRestore, exact: true }));
  await expect(page.getByTestId("workspace-status")).toContainText(labels.shell.status.ready);
  await expect(menu.getByTestId("storage-notice")).toHaveText(store.restoredNotice);
  await page.screenshot({ path: resolve(dir, "8-v3-restored-desktop-viewport.png") });
  await menu.locator(":scope > summary").click();
  const kpi = page.getByTestId("kpi-contribution_after_marketing").locator(".kpi-value");
  await expect(kpi).toBeVisible();
  const result = { file: "verification/review-v2-a-workspace-laptop.json", schema_version: backup.schema_version, saved_at: backup.saved_at ?? backup.exported_at ?? null, dataset_id: backup.payload?.dataset_id ?? null, restored: true, contribution_after_marketing: await kpi.textContent() };
  await writeFile(resolve(dir, "checks-v3-restore.json"), JSON.stringify(result, null, 2));
});

test("§4-7／§4-9 無主控台錯誤、無 404 資源、沒有 CSV 內容上傳", async ({ page }) => {
  const fixtures = resolve("tests/fixtures/alternative");
  const csvLines = (await Promise.all(["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"].map(name => readFile(resolve(fixtures, name), "utf8"))))
    .flatMap(text => text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0));
  const requests: Array<{ method: string; url: string; resourceType: string; postDataBytes: number; status: number | null }> = [];
  const leaks: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("request", (request: Request) => {
    if (!/^https?:/.test(request.url())) return;
    const body = request.postData() ?? "";
    if (body && csvLines.some(line => body.includes(line))) leaks.push(`${request.method()} ${request.url()}`);
    requests.push({ method: request.method(), url: request.url(), resourceType: request.resourceType(), postDataBytes: Buffer.byteLength(body), status: null });
  });
  page.on("response", response => { const row = requests.find(r => r.url === response.url() && r.status === null); if (row) row.status = response.status(); });

  await page.goto("/");
  await importViaWizard(page, fixtures);
  await expect(page.getByTestId("workspace-status")).toContainText(labels.shell.status.ready);
  await dismissSavePrompt(page);
  for (const id of ["diagnosis", "products", "scenarios", "actions", "meeting", "data", "overview"] as const) { await nav(page, id).click(); await page.waitForTimeout(150); }
  await openDownloads(page);
  const [csv] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-menu").getByRole("button", { name: labels.exports.downloads.analysisCsv, exact: true }).first().click()]);
  expect(csv.suggestedFilename()).toMatch(/\.csv$/);
  await page.waitForTimeout(500);

  const foreign = requests.filter(r => new URL(r.url).host !== "127.0.0.1:3100");
  const nonGet = requests.filter(r => r.method !== "GET");
  const failed = requests.filter(r => r.status !== null && r.status >= 400);
  const result = { totalRequests: requests.length, foreignOrigins: foreign.map(r => r.url), nonGetRequests: nonGet.map(r => `${r.method} ${r.url} (${r.postDataBytes} bytes)`), csvContentLeaks: leaks, failedResources: failed.map(r => `${r.status} ${r.url}`), consoleOrPageErrors: errors, requests };
  await writeFile(resolve(dir, "checks-network.json"), JSON.stringify(result, null, 2));
  expect(leaks).toEqual([]);
  expect(foreign).toEqual([]);
  expect(nonGet).toEqual([]);
  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
});

test("§4-7 metadata／OG／icon／robots／sitemap 與 D10 #validation", async ({ page, request }) => {
  const html = await (await request.get("/")).text();
  const meta = (attr: string, name: string) => html.match(new RegExp(`<meta[^>]*${attr}="${name}"[^>]*content="([^"]*)"`))?.[1] ?? html.match(new RegExp(`<meta[^>]*content="([^"]*)"[^>]*${attr}="${name}"`))?.[1] ?? null;
  const tags = { title: html.match(/<title>([^<]*)<\/title>/)?.[1] ?? null, description: meta("name", "description"), ogTitle: meta("property", "og:title"), ogDescription: meta("property", "og:description"), ogImage: meta("property", "og:image"), ogUrl: meta("property", "og:url"), ogLocale: meta("property", "og:locale"), twitterCard: meta("name", "twitter:card"), twitterImage: meta("name", "twitter:image"), canonical: html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]*)"/)?.[1] ?? null, icon: html.match(/<link[^>]*rel="icon"[^>]*href="([^"]*)"/)?.[1] ?? null, lang: html.match(/<html[^>]*lang="([^"]*)"/)?.[1] ?? null };
  for (const [key, value] of Object.entries(tags)) expect(value, key).toBeTruthy();
  expect(tags.ogImage!.startsWith(SITE_URL)).toBe(true);
  const image = await request.get(new URL(tags.ogImage!).pathname);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toContain("image/png");
  const png = await image.body();
  const ogSize = { width: png.readUInt32BE(16), height: png.readUInt32BE(20), bytes: png.length };
  expect(ogSize).toMatchObject({ width: 1200, height: 630 });
  const icon = await request.get(tags.icon!.startsWith("http") ? new URL(tags.icon!).pathname : tags.icon!);
  expect(icon.status()).toBe(200);
  const robots = await (await request.get("/robots.txt")).text();
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(robots).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
  expect(sitemap).toMatch(new RegExp(`<loc>${SITE_URL.replace(/[.]/g, "\\.")}/?</loc>`));
  expect(sitemap.match(/<url>/g)?.length).toBe(1);

  // D10：只有 #validation 才顯示開發者驗證。
  await page.goto("/");
  await expect(page.getByTestId("validation-panel")).toHaveCount(0);
  await page.goto("/#validation");
  await expect(page.getByTestId("validation-panel")).toBeVisible();
  await page.screenshot({ path: resolve(dir, "10-validation-hash-desktop-viewport.png") });

  // §4-10：示範站首屏文字與 README「30 秒試用」同一句。
  await page.goto("/");
  await expect(page.getByText(labels.empty.body, { exact: true })).toBeVisible();
  const readme = await readFile(resolve("README.md"), "utf8");
  const trial = readme.split("## 30 秒試用")[1]?.split("\n").map(line => line.trim()).find(line => line.length > 0) ?? "";
  const normalise = (text: string) => text.replace(/^開正式站 → /, "").replace(/[（）()]/g, "");
  expect(normalise(trial)).toBe(normalise(labels.empty.body));
  await writeFile(resolve(dir, "checks-meta.json"), JSON.stringify({ tags, ogImage: ogSize, iconStatus: icon.status(), robots, sitemap, readmeTrialLine: trial, emptyStateBody: labels.empty.body }, null, 2));
});
