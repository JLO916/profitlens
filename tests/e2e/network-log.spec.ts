// V3-10 上線檢查（06_BATCHES V3-10「網路紀錄（確認沒有資料外送）」；PRD §11.3、docs/revamp/08_RELAUNCH.md §4 第 9 條）：整個流程的每個請求都留紀錄，並確認沒有任何資料外送。
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Request } from "@playwright/test";
import { fill } from "../../src/i18n";
import { importViaWizard } from "./import-wizard-helpers";
import { dismissSavePrompt, openDownloads, openMeeting, openStorage } from "./replacement-helpers";
import { copy, evidenceDrawer, goldenProbes, hideDevOverlay, kpiLink, loadDemo, postDataDigest, printCalls, stubPrint, writeLaunchJson } from "./launch-helpers-v310";

/*
 * 流程：首頁 → 載入示範資料 → 開一個「計算與來源」抽屜 → 經匯入精靈匯入 fixtures/golden（三份 CSV＋資料集設定檔）→ 套用
 * → 匯出分析 CSV、Excel、PPT、PDF（列印版面出現即可）、決策 JSON、備份檔 → 切到會議紀錄。
 * 斷言：
 *   1. 每個 http(s) 請求的 origin 都是伺服器本身（baseURL）；
 *   2. 沒有任何 POST／PUT／PATCH／DELETE（ENABLE_LIVE_AI=false 時 AI 面板不送）；
 *   3. 對 /api/insights 的請求只能是 GET，回 available=false；另用 request.post 直接打一次：PUBLIC_DEMO 設定回 403（reason PUBLIC_DEMO）；
 *      非 PUBLIC_DEMO（例如 playwright.config.ts 的 LOCAL＋ENABLE_LIVE_AI=false）回 fallback、不呼叫 provider，並在紀錄標明 mode；
 *   4. 沒有任何請求的本文或網址含 golden CSV 的任何一行或通路名 MARKETPLACE；
 *   5. 沒有 4xx／5xx（dev 專用的 /_next/webpack-hmr、/__nextjs_* 另列，不算在內）。
 * 紀錄寫到 NETWORK_LOG_OUT（例如 verification/revamp-v3/V3-10/network-log.json，desktop 與 mobile 合併在同一份）；沒給就寫到 test-results。
 */
const DEV_ONLY = /\/_next\/webpack-hmr|\/__nextjs_/;

interface Row { seq: number; step: string; method: string; url: string; origin: string | null; resourceType: string; postData: ReturnType<typeof postDataDigest>; status: number | null; failure: string | null; devOnly: boolean }

test("V3-10 網路紀錄：示範 → 抽屜 → 匯入 golden → 六種匯出 → 會議紀錄，全程沒有資料外送", async ({ page, request }, testInfo) => {
  test.skip(!["desktop", "mobile"].includes(testInfo.project.name), "網路紀錄只跑 1440（desktop）與 390（mobile）");
  test.setTimeout(240_000);
  const probes = await goldenProbes();
  const rows: Row[] = [];
  const nonNetwork: string[] = [];
  let step = "home";
  const byRequest = new Map<Request, Row>();
  page.on("request", req => {
    const url = req.url();
    if (!/^https?:/.test(url)) { nonNetwork.push(`${step} ${url.slice(0, 40)}`); return; }
    const row: Row = { seq: rows.length + 1, step, method: req.method(), url, origin: new URL(url).origin, resourceType: req.resourceType(), postData: postDataDigest(req.postData() ?? ""), status: null, failure: null, devOnly: DEV_ONLY.test(url) };
    rows.push(row);
    byRequest.set(req, row);
  });
  page.on("response", response => { const row = byRequest.get(response.request()); if (row) row.status = response.status(); });
  page.on("requestfailed", req => { const row = byRequest.get(req); if (row) row.failure = req.failure()?.errorText ?? "failed"; });
  // 本文含原始資料的請求（只記網址與命中的探針種類，不記內容）。
  const leaks: string[] = [];
  page.on("request", req => {
    const body = req.postData() ?? "";
    let url = req.url();
    try { url = decodeURIComponent(url); } catch { /* 不是合法的百分比編碼時用原字串比對 */ }
    const hitBody = probes.lines.some(line => body.includes(line)) || probes.tokens.some(token => body.includes(token));
    const hitUrl = probes.lines.some(line => url.includes(line)) || probes.tokens.some(token => url.includes(token));
    if (hitBody || hitUrl) leaks.push(`${req.method()} ${req.url().slice(0, 120)} (${hitBody ? "body" : "url"})`);
  });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(`pageerror:${error.message}`));
  page.on("console", message => { if (message.type() === "error") errors.push(`console:${message.text().slice(0, 200)}`); });
  const downloads: Record<string, { filename: string; bytes: number }> = {};
  const download = async (name: string, click: () => Promise<void>) => {
    const [file] = await Promise.all([page.waitForEvent("download"), click()]);
    downloads[name] = { filename: file.suggestedFilename(), bytes: (await stat((await file.path())!)).size };
  };

  await hideDevOverlay(page);
  await stubPrint(page);
  await page.goto("/");
  const origin = new URL(page.url()).origin;

  step = "load-demo";
  await loadDemo(page);

  step = "evidence-drawer";
  await kpiLink(page).click();
  await expect(evidenceDrawer(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(evidenceDrawer(page)).toHaveCount(0);

  step = "import-golden";
  await importViaWizard(page, resolve("fixtures/golden"), { manifest: true });
  await expect(page.getByTestId("workspace-status")).toContainText(fill(copy.ready, { date: "2026-08-03" }));
  await dismissSavePrompt(page);

  step = "export-analysis-csv";
  await download("analysis_csv", async () => { await (await openDownloads(page)).getByRole("button", { name: copy.analysisCsv, exact: true }).click(); });
  step = "export-excel";
  await download("excel", async () => { await (await openDownloads(page)).getByRole("button", { name: copy.exportExcel, exact: true }).click(); });
  step = "export-pptx";
  await download("pptx", async () => { await (await openDownloads(page)).getByRole("button", { name: copy.exportPptx, exact: true }).click(); });
  step = "export-pdf";
  const before = await printCalls(page);
  await (await openDownloads(page)).getByRole("button", { name: copy.exportPdf, exact: true }).click();
  await expect.poll(() => printCalls(page)).toBe(before + 1);
  await expect(page.getByTestId("manager-summary-print")).toHaveCount(1);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.getByTestId("manager-summary-print")).toHaveCount(0);
  step = "export-decision-json";
  await download("decision_json", async () => { await (await openDownloads(page)).getByRole("button", { name: copy.decisionJson, exact: true }).click(); });
  step = "export-backup";
  await download("backup", async () => { await (await openStorage(page)).getByRole("button", { name: copy.downloadBackup, exact: true }).click(); });
  await page.keyboard.press("Escape");

  step = "meeting";
  await openMeeting(page);
  await page.waitForLoadState("networkidle").catch(() => undefined);

  // /api/insights：瀏覽器內只能是 GET（available=false）；另外直接 POST 一次（不帶任何資料）。
  step = "direct-insights";
  const get = await request.get("/api/insights");
  const getBody = await get.json() as { available: boolean; reason: string | null };
  const post = await request.post("/api/insights", { data: {} });
  const postBody = await post.json() as { status: string; reason: string };
  const mode = getBody.reason === "PUBLIC_DEMO" ? "PUBLIC_DEMO" : `non-public (${getBody.reason})`;

  const network = rows.filter(row => !row.devOnly);
  const foreign = network.filter(row => row.origin !== origin);
  const writes = network.filter(row => row.method !== "GET" && row.method !== "HEAD");
  const insights = network.filter(row => new URL(row.url).pathname === "/api/insights");
  const failed = network.filter(row => (row.status !== null && row.status >= 400) || (row.failure !== null && row.failure !== "net::ERR_ABORTED"));
  const summary = {
    checked_at: new Date().toISOString(), base_url: origin, mode, viewport: testInfo.project.use.viewport,
    totals: { requests: rows.length, network: network.length, dev_only: rows.length - network.length, non_network_urls: nonNetwork.length, by_step: Object.fromEntries([...new Set(rows.map(row => row.step))].map(name => [name, rows.filter(row => row.step === name).length])) },
    checks: {
      foreign_origins: foreign.map(row => row.url), non_get: writes.map(row => `${row.method} ${row.url} (${row.postData.bytes} bytes)`),
      insights_requests: insights.map(row => `${row.method} ${row.status}`), insights_get: { status: get.status(), body: getBody }, insights_direct_post: { status: post.status(), body: postBody },
      csv_content_leaks: leaks, failed_resources: failed.map(row => `${row.status ?? row.failure} ${row.url}`), console_or_page_errors: errors,
    },
    downloads, non_network: nonNetwork, requests: rows,
  };
  const written = await writeLaunchJson("NETWORK_LOG_OUT", "network-log.json", testInfo, summary);
  testInfo.annotations.push({ type: "network-log", description: `${written}（${rows.length} 個請求，mode ${mode}）` });

  expect(Object.keys(downloads).sort()).toEqual(["analysis_csv", "backup", "decision_json", "excel", "pptx"]);
  expect(leaks, "請求本文或網址不得含 golden CSV 的任何一行或通路名").toEqual([]);
  expect(foreign, "所有請求都必須是同一個來源").toEqual([]);
  expect(writes.map(row => `${row.method} ${row.url}`), "瀏覽器流程不得送出 POST／PUT／PATCH／DELETE").toEqual([]);
  expect(insights.every(row => row.method === "GET")).toBe(true);
  expect(getBody.available).toBe(false);
  if (mode === "PUBLIC_DEMO") {
    expect(post.status()).toBe(403);
    expect(postBody).toMatchObject({ status: "fallback", reason: "PUBLIC_DEMO" });
  } else {
    // 非正式站設定（LOCAL＋ENABLE_LIVE_AI=false）：伺服器在讀本文前就回 fallback，不建立 provider。
    expect(postBody.status).toBe("fallback");
    expect(post.status()).toBeLessThan(500);
  }
  expect(failed.map(row => `${row.status ?? row.failure} ${row.url}`), "不得有 4xx／5xx 或失敗的資源").toEqual([]);
  expect(errors).toEqual([]);
});
