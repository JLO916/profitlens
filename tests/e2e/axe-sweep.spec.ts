// V3-10 上線檢查（06_BATCHES V3-10「四尺寸走查」；PRD §2.3 C「四尺寸 axe 0 個 serious」、§11.1 自動檢查）：四個尺寸 × 11 個狀態跑 axe（wcag2a／2aa／21a／21aa／22aa），serious 與 critical 必須為 0。
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { openWizard } from "./import-wizard-helpers";
import { LAUNCH_PAGES, domA11y, evidenceDrawer, gotoPage, hideDevOverlay, kpiLink, loadDemo, writeLaunchJson, type DomA11y } from "./launch-helpers-v310";
import { channelWeeksDetails, channelWeeksTable, heatTables, heatTabStop, importSynthetic, openDataTable, openRates, ratesSection, shareSection } from "./chart-helpers-v4";
import { openDetails } from "./replacement-helpers";

/*
 * 狀態：首頁空狀態、匯入精靈步驟 1、示範資料已載入的 7 頁、計算與來源抽屜開著（總覽）、投影模式（總覽；≤ 767px 沒有投影按鈕，手機略過）。
 * V4-3b 起另加三個：健檢頁資料表展開（G10、G12、G7b）、從圖下鑽的抽屜（G11 熱表格按 Enter）、4 通路合成資料的健檢頁；desktop、laptop、tablet 共 14，mobile 共 13。
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
  if (await present.isVisible()) {
    await present.click();
    await expect(page.locator("html")).toHaveAttribute("data-mode", "present");
    results.push(await scan(page, "present-mode-overview", engine, path));
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

  const summary = {
    checked_at: new Date().toISOString(), engine, axe_core: path ? (JSON.parse(readFileSync(path.replace(/axe\.min\.js$/, "package.json"), "utf8")) as { version: string }).version : null,
    tags: TAGS, viewport: testInfo.project.use.viewport, skipped: (await present.isVisible()) ? [] : ["present-mode-overview（≤ 767px 沒有投影按鈕，PRD §9.7）"],
    totals: { states: results.length, serious: results.reduce((sum, row) => sum + row.serious, 0), critical: results.reduce((sum, row) => sum + row.critical, 0), moderate: results.reduce((sum, row) => sum + row.violations.filter(item => item.impact === "moderate").length, 0), minor: results.reduce((sum, row) => sum + row.violations.filter(item => item.impact === "minor").length, 0) },
    states: results,
  };
  const written = await writeLaunchJson("AXE_OUT", "axe.json", testInfo, summary);
  testInfo.annotations.push({ type: "axe", description: `${written}（${engine}；serious ${summary.totals.serious}、critical ${summary.totals.critical}）` });
  // V4-3b：狀態數（06 護欄表）desktop、laptop、tablet 14，mobile 13（mobile 沒有投影模式）。
  expect(results.length, "axe 狀態數（V4-3b 起 14／13）").toBe(testInfo.project.name === "mobile" ? 13 : 14);

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
