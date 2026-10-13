// V3-10 上線檢查（06_BATCHES V3-10「四尺寸走查」；PRD §2.3 C「四尺寸 axe 0 個 serious」、§11.1 自動檢查）：四個尺寸 × 11 個狀態跑 axe（wcag2a／2aa／21a／21aa／22aa），serious 與 critical 必須為 0。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { importViaWizard, openWizard } from "./import-wizard-helpers";
import { LAUNCH_PAGES, domA11y, evidenceDrawer, gotoPage, hideDevOverlay, kpiLink, loadDemo, writeLaunchJson, type DomA11y } from "./launch-helpers-v310";
import { calculateKeep, channelWeeksDetails, channelWeeksTable, heatTables, heatTabStop, importSynthetic, openDataTable, openRates, openSensitivityChart, paretoSection, ratesSection, scenarioCard, shareSection, thresholdSection, varianceSection } from "./chart-helpers-v4";
import { dismissSavePrompt, openDetails, openMeeting, selectScenarioChannel } from "./replacement-helpers";
import { LAZY_CHUNKS, failLazyChunks } from "./lazy-chunk-helpers-v43c";
import { fill, labels } from "../../src/i18n";

/*
 * 狀態：首頁空狀態、匯入精靈步驟 1、示範資料已載入的 7 頁、計算與來源抽屜開著（總覽）、投影模式（總覽；≤ 767px 沒有投影按鈕，手機略過）。
 * V4-3b 起另加三個：健檢頁資料表展開（G10、G12、G7b）、從圖下鑽的抽屜（G11 熱表格按 Enter）、4 通路合成資料的健檢頁；desktop、laptop、tablet 共 14，mobile 共 13。
 * V4-4 再加一個：4 通路合成資料的商品頁（G14 渲染、product-worst 在 G14 的 after 內；G13、G14 的 h4 在 h3#product-highlights-heading 之下，標題不跳級）；desktop、laptop、tablet 共 15，mobile 共 14。
 * V4-5 再加一個：試算計算後展開 scenario-sensitivity（合成資料 MARKETPLACE：G15 一根柱、G16 維持現況門檻點＋三個使用者點、零貢獻門檻超出範圍的圖下一行與資料表）；desktop、laptop、tablet 共 16，mobile 共 15。
 * V4-6 再加一個：會議頁有歷史與選入方案（同一份合成資料：MARKETPLACE 方案 1 選入議程 5 → 結束會議 → 新會議稿再選入；G15 會議實例一根柱、G19 歷史 1 筆的等高空狀態，兩張圖的資料表展開）；desktop、laptop、tablet 共 17，mobile 共 16。
 * V4-7a 再加一個：匯入 fixtures/errors/missing_ad_day 後的資料來源頁（點 G20 缺列段後：篩選後的問題表、G21 一格、G20 資料表展開）；desktop、laptop、tablet 共 18，mobile 共 17。
 * V4-8a 再加一個：會議頁投影（從總覽投影按頁首的互切按鈕切過去，D-V3-34＝A；≤ 767px 沒有投影按鈕，手機略過）；desktop、laptop、tablet 共 19，mobile 共 17。
 * V4-8b 代理 A 再加一個：頁面程式載入失敗的錯誤狀態（D-V4-44 B、D-V4-57＝A；之後的程式 chunk 一律失敗時切到通路健檢）；desktop、laptop、tablet 共 20，mobile 共 18。
 * axe 來源：專案沒有 @axe-core/playwright（本輪不加依賴），改用 node_modules 已有的 axe-core（eslint-config-next → eslint-plugin-jsx-a11y 的相依套件）
 * 以 page.addScriptTag 注入 axe.min.js 後呼叫 axe.run。找不到 axe-core 時退回純 DOM 檢查（每個控制有可及名稱、每頁一個 h1、img 都有 alt），並在結果標明 engine。
 * 不論 axe 是否可用，每個狀態都另記純 DOM 檢查（heading 跳級、重複 id、:focus-visible 規則是否存在）供參考，不斷言。
 * 結果寫到 AXE_OUT（例如 verification/revamp-v3/V3-10/axe.json，四個專案合併在同一份）；沒給就寫到 test-results。
 */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
type Impact = "minor" | "moderate" | "serious" | "critical" | null;
interface AxeViolation { id: string; impact: Impact; help: string; helpUrl: string; nodes: { target: unknown[]; failureSummary?: string }[] }
interface StateResult { state: string; engine: "axe-core" | "dom"; violations: { id: string; impact: Impact; help: string; nodes: number; targets: string[] }[]; serious: number; critical: number; dom: DomA11y }

function axePath(): string | null {
  try { return require.resolve("axe-core/axe.min.js"); } catch { return null; }
}

async function scan(page: Page, state: string, engine: StateResult["engine"], path: string | null): Promise<StateResult> {
  // 讓過場與延遲渲染（圖表、骨架）結束。
  await page.waitForTimeout(300);
  const dom = await domA11y(page);
  let violations: AxeViolation[] = [];
  if (engine === "axe-core" && path) {
    if (!await page.evaluate(() => "axe" in window)) await page.addScriptTag({ path });
    violations = await page.evaluate(async tags => {
      const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: unknown[] }> } }).axe;
      const result = await axe.run({ exclude: [["nextjs-portal"]] }, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] });
      return result.violations;
    }, TAGS) as AxeViolation[];
  }
  const rows = violations.map(item => ({ id: item.id, impact: item.impact, help: item.help, nodes: item.nodes.length, targets: item.nodes.slice(0, 5).map(node => JSON.stringify(node.target)) }));
  return { state, engine, violations: rows, serious: rows.filter(row => row.impact === "serious").length, critical: rows.filter(row => row.impact === "critical").length, dom };
}

test("V3-10 axe 四尺寸：首頁、精靈步驟 1、七頁、抽屜、投影模式都沒有 serious／critical", async ({ page }, testInfo) => {
  test.setTimeout(420_000);
  const path = axePath();
  const engine: StateResult["engine"] = path ? "axe-core" : "dom";
  const results: StateResult[] = [];
  await hideDevOverlay(page);

  await page.goto("/");
  results.push(await scan(page, "home-empty", engine, path));

  await openWizard(page);
  await expect(page.getByTestId("import-step-1")).toBeVisible();
  results.push(await scan(page, "import-wizard-step-1", engine, path));

  // 重新整理回到空狀態（資料只在記憶體），再載入示範資料。
  await page.goto("/");
  await loadDemo(page);
  for (const id of LAUNCH_PAGES) {
    await gotoPage(page, id);
    results.push(await scan(page, `page-${id}`, engine, path));
  }

  await gotoPage(page, "overview");
  await kpiLink(page).click();
  await expect(evidenceDrawer(page)).toBeVisible();
  results.push(await scan(page, "evidence-drawer-open", engine, path));
  await page.keyboard.press("Escape");
  await expect(evidenceDrawer(page)).toHaveCount(0);

  const present = page.getByTestId("present-toggle");
  // 在總覽時記下有沒有投影按鈕（摘要的 skipped 用；收尾時已在資料來源頁，那裡本來就沒有按鈕）。
  const presentShown = await present.isVisible();
  if (presentShown) {
    await present.click();
    await expect(page.locator("html")).toHaveAttribute("data-mode", "present");
    results.push(await scan(page, "present-mode-overview", engine, path));
    // V4-8a（06_BATCHES V4-8a「投影 axe 加會議頁投影狀態」）：投影中按頁首的互切按鈕切到會議紀錄，仍在投影中。
    await page.getByTestId("present-switch").click();
    await expect(page.locator("main h1")).toHaveText(labels.shell.nav.meeting.headline);
    await expect(page.locator("html")).toHaveAttribute("data-mode", "present");
    results.push(await scan(page, "present-mode-meeting", engine, path));
    await page.keyboard.press("Escape");
    await expect(page.locator("html")).not.toHaveAttribute("data-mode", /.*/);
  }

  // V4-3b（06_BATCHES V4-3b、PRD §2.2 C3）：再加三個狀態，desktop、laptop、tablet 共 14，mobile 共 13。
  // 1. 資料表展開（健檢頁，示範資料）：G10 的資料表、G12「五項比率走勢」與它的資料表、G7b「各通路每週」都展開（G11 熱表本身就是表，常駐）。
  await gotoPage(page, "diagnosis");
  await openDataTable(shareSection(page));
  await openRates(page);
  await openDataTable(ratesSection(page));
  await openDetails(channelWeeksDetails(page));
  await expect(channelWeeksTable(page)).toBeVisible();
  results.push(await scan(page, "diagnosis-data-tables-open", engine, path));
  // 2. 從圖下鑽的抽屜：熱表的停留格按 Enter（G11 格的抽屜帶 filter { channel, date }，篩選片語含日期），抽屜開著時掃。
  await heatTabStop(page).focus();
  await page.keyboard.press("Enter");
  await expect(evidenceDrawer(page)).toBeVisible();
  await expect(evidenceDrawer(page).getByTestId("evidence-filter")).toBeVisible();
  results.push(await scan(page, "evidence-drawer-from-chart", engine, path));
  await page.keyboard.press("Escape");
  await expect(evidenceDrawer(page)).toHaveCount(0);
  // 3. 4 通路合成資料的健檢頁（G10 SOCIAL 不適用列、LIVE 資料待補列；G11 四張月曆，LIVE 有資料待補的虛線框格）：重新整理回到空狀態後經精靈匯入。
  await page.goto("/");
  await importSynthetic(page);
  await gotoPage(page, "diagnosis");
  await expect(heatTables(page)).toHaveCount(4);
  results.push(await scan(page, "page-diagnosis-synthetic", engine, path));
  // V4-4（06_BATCHES V4-4）：4 通路合成資料的商品頁（同一份匯入，接著切頁）：第一格是 G14（5 個商品毛利為負），第二格 G13。
  await gotoPage(page, "products");
  await expect(paretoSection(page)).toBeVisible();
  await expect(varianceSection(page)).toBeVisible();
  results.push(await scan(page, "page-products-synthetic", engine, path));
  // V4-5（06_BATCHES V4-5、PRD §2.2 C3）：試算計算後展開 scenario-sensitivity（G16）。同一份合成資料，試算通路改 MARKETPLACE（零貢獻門檻 104% 超出範圍），
  // 方案 1 套用「維持現況」範本、同意假設、試算，展開「要賣到多少才划算」並填三個銷量假設試算（0／50／100：三個使用者點），再展開 G16 的資料表。
  await gotoPage(page, "scenarios");
  await selectScenarioChannel(page, "MARKETPLACE");
  const card = scenarioCard(page, 1);
  await calculateKeep(card);
  await openSensitivityChart(card, ["0", "50", "100"]);
  await openDataTable(thresholdSection(card));
  results.push(await scan(page, "scenarios-sensitivity-open", engine, path));
  // V4-6（06_BATCHES V4-6）：會議頁有歷史與選入方案。同一份合成資料、上一步試算的 MARKETPLACE 方案 1：選入議程 5 → 結束會議（歷史 1 筆）→ 新會議稿再選入，
  // G15 會議實例一根柱（議程 5）、G19 等高空狀態（會議歷史，v3 歷史清單 1 筆）；兩張圖的資料表展開後掃。
  const meeting = await openMeeting(page);
  const select = meeting.getByTestId("meeting-agenda-5").getByLabel(fill(labels.meeting.review.scenarioSelect, { channel: "MARKETPLACE" }), { exact: true });
  const option = fill(labels.meeting.review.planOption, { name: fill(labels.scenarios.decision.defaultPlanName, { n: 1 }) });
  await select.selectOption({ label: option });
  await expect(meeting.getByTestId("chart-meeting-scenarios")).toBeVisible();
  await meeting.getByTestId("meeting-finalize").click();
  await meeting.getByTestId("meeting-finalize-confirm").getByTestId("meeting-finalize-confirm-button").click();
  await expect(meeting.getByTestId("meeting-history-item")).toHaveCount(1);
  await select.selectOption({ label: option });
  await openDataTable(meeting.getByTestId("chart-meeting-scenarios"));
  await openDataTable(meeting.getByTestId("chart-meeting-history"));
  results.push(await scan(page, "page-meeting-history-scenarios", engine, path));
  // V4-7a（06_BATCHES V4-7a、護欄表 axe）：匯入 fixtures/errors/missing_ad_day 後的資料來源頁——G20 缺列段（點它把問題表篩到廣告檔 MARKETPLACE 缺廣告列）、
  // G21 一格、篩選後的問題表（role=status 片語取得焦點、清除鈕），G20 的資料表（每列的「篩選問題表」按鈕）展開後掃。示範資料沒有缺列段、不渲染 G21，不加這個狀態就掃不到。
  await page.goto("/");
  await importViaWizard(page, resolve("fixtures/errors/missing_ad_day"), { manifest: true, classification: "partial" });
  await dismissSavePrompt(page);
  await gotoPage(page, "data");
  await expect(page.getByTestId("chart-data-issues")).toBeVisible();
  await page.getByTestId("chart-data-coverage-seg-ads-MARKETPLACE-2026-08-02").click();
  await expect(page.getByTestId("data-issues-filter")).toBeFocused();
  await expect(page.getByTestId("data-issues-filter-clear")).toBeVisible();
  await openDataTable(page.getByTestId("chart-data-coverage"));
  results.push(await scan(page, "page-data-missing-ad-day-filtered", engine, path));
  // V4-8b（D-V4-44 B、D-V4-57＝A）：頁面程式載入失敗的錯誤狀態（標題、一句說明、「再試一次」）。重新載入首頁（隨頁載入的狀態歸零）後讓之後的程式 chunk 一律失敗，
  // 載入示範資料、切到通路健檢（手機在底部分頁列），等錯誤狀態出現、標題取得焦點後掃；axe-core 由 addScriptTag 注入，不經過程式 chunk。
  await page.goto("/");
  await failLazyChunks(page);
  await loadDemo(page);
  await gotoPage(page, "diagnosis");
  await expect(page.getByTestId("panel-load-error")).toBeVisible();
  await expect(page.locator("#panel-load-error-title")).toBeFocused();
  results.push(await scan(page, "panel-chunk-failed", engine, path));
  await page.unroute(LAZY_CHUNKS);

  const summary = {
    checked_at: new Date().toISOString(), engine, axe_core: path ? (JSON.parse(readFileSync(path.replace(/axe\.min\.js$/, "package.json"), "utf8")) as { version: string }).version : null,
    tags: TAGS, viewport: testInfo.project.use.viewport, skipped: presentShown ? [] : ["present-mode-overview（≤ 767px 沒有投影按鈕，PRD §9.7）", "present-mode-meeting（同上）"],
    totals: { states: results.length, serious: results.reduce((sum, row) => sum + row.serious, 0), critical: results.reduce((sum, row) => sum + row.critical, 0), moderate: results.reduce((sum, row) => sum + row.violations.filter(item => item.impact === "moderate").length, 0), minor: results.reduce((sum, row) => sum + row.violations.filter(item => item.impact === "minor").length, 0) },
    states: results,
  };
  const written = await writeLaunchJson("AXE_OUT", "axe.json", testInfo, summary);
  testInfo.annotations.push({ type: "axe", description: `${written}（${engine}；serious ${summary.totals.serious}、critical ${summary.totals.critical}）` });
  // V4-3b：狀態數（06 護欄表）desktop、laptop、tablet 14，mobile 13（mobile 沒有投影模式）；V4-4 起 15／14（加合成資料的商品頁）；V4-5 起 16／15（加試算計算後展開 scenario-sensitivity）；
  // V4-6 起 17／16（加會議頁有歷史與選入方案）；V4-7a 起 18／17（加 missing_ad_day 的資料來源頁：G20 缺列段、G21、篩選後的問題表）。
  // 06 護欄表寫的「V4-7a 起 17／16」是在 V4-6 多加一個狀態之前寫的，實際是 18／17。
  // V4-8a 起 19／17（desktop、laptop、tablet 加會議頁投影；mobile 沒有投影，不變）。V4-8b 代理 A 起 20／18（加頁面程式載入失敗的錯誤狀態）。
  expect(results.length, "axe 狀態數（V4-8b 代理 A 起 20／18）").toBe(testInfo.project.name === "mobile" ? 18 : 20);

  for (const row of results) {
    const blocking = row.violations.filter(item => item.impact === "serious" || item.impact === "critical").map(item => `${item.impact} ${item.id}（${item.nodes}）：${item.targets.join(" ")}`);
    expect.soft(blocking, `${row.state}：axe serious／critical 必須為 0`).toEqual([]);
    if (engine === "dom") {
      // 退回純 DOM 檢查時的硬規則：每個控制有可及名稱、img 都有 alt、每頁剛好一個看得到的 h1。
      expect.soft(row.dom.unnamedControls, `${row.state}：控制沒有可及名稱`).toEqual([]);
      expect.soft(row.dom.imagesWithoutAlt, `${row.state}：img 沒有 alt`).toEqual([]);
      expect.soft(row.dom.h1, `${row.state}：每頁一個 h1`).toHaveLength(1);
    }
  }
});
