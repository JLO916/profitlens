#!/usr/bin/env node
// V3-0 ⑦：Lighthouse 基準（Accessibility＋Performance），示範資料已載入的 5 頁（總覽、通路健檢、商品毛利、假設試算、會議紀錄），1440×1000 與 390×844。
// V4-0a 第 11 項：再加資料來源、待辦兩頁（連同空狀態首頁共 8 頁；每頁一個「切到…」timespan 與一個 snapshot），其餘行為不變。
// 用 Lighthouse user-flow（startFlow）：一個流程內 navigate（空狀態首頁，唯一能算 0–100 Performance 分數的模式）
// → timespan（載入示範資料、拒絕本機保存提示）→ snapshot（總覽）→ 每頁 timespan（側欄切頁）＋ snapshot。
// 示範資料只存在記憶體（v2 沒有自動還原），所以「已載入資料的頁面」不能用 navigation 模式；這些頁的 Performance 以 timespan 的 TBT／CLS／INP 記錄。
//
// 不新增專案依賴：lighthouse、puppeteer-core、chrome-launcher 取自 npx 快取（R7 已用 `npx lighthouse` 13.5.0）。
//   找不到時先執行 `npx -y lighthouse@13.5.0 --version` 建立快取，或用 LIGHTHOUSE_HOME 指到含 node_modules/lighthouse 的資料夾。
// 用法（先用正式站設定啟動 production 伺服器，見 verification/revamp-v3/V3-0-baseline.md）：
//   node --no-warnings scripts/lighthouse-pages.mjs [--base http://127.0.0.1:3100] [--out verification/revamp-v3/V3-0]
// 輸出：<out>/lighthouse/flow-desktop-1440.html、flow-mobile-390.html（只留 HTML），分數表合併寫入 <out>/metrics.json 的 lighthouse 鍵。
// V4-3c（D-V4-42＝A）：另記首頁載入之後才下載的程式 chunk（隨頁載入的面板、預先載入）與各 timespan 的時間窗（頁內 performance.now()），
//   寫進 lighthouse.lazyChunks；insideTimespans 列出落在任何 timespan 內的 chunk——預先載入應全部落在 timespan 之外（切頁時 chunk 已載入），不為空就要檢查。
// V41-1（06_BATCHES V41-1 第 9 項；docs/revamp-v4.1/01_PRD.md §3.8）：上面的 user-flow 不變；另對 GUIDE_NAV_PAGES 的每一頁（說明頁是靜態頁，可以用 navigation 模式），
//   desktop 1440 與 mobile 390 各跑一次獨立的 Lighthouse navigation（類別 accessibility、performance、seo；form factor、螢幕、節流與 user-flow 相同），
//   報告存 <out>/lighthouse/{slug}-{desktop-1440|mobile-390}.html（slug＝路徑去掉開頭的「/」、其餘「/」換成「-」，例如 guide、guide-overview），
//   結果合併寫入 <out>/metrics.json 的 lighthouse.guide.pages[路徑][desktop-1440|mobile-390]：三類分數、CLS、TBT、LCP（與 user-flow 同一個 summarize）、
//   seoFailedAudits（SEO 類別中未通過的稽核 id）與 seoScoreExcludingCanonical。
//   canonical：說明頁的 canonical 指向正式站網域（SITE_URL/guide），在 127.0.0.1 上量時 Lighthouse 的 canonical 稽核可能失敗；06_BATCHES V41-1 第 9 項規定記錄原因
//   （canonicalAudit 的 score 與 explanation），SEO 分數只排除這一項——seoScoreExcludingCanonical 依報告內 SEO 類別的稽核權重，照 Lighthouse 的計分方式
//   （core/scoring.js：不適用、資訊、手動的稽核權重為 0，其餘加權平均）去掉 canonical 重算；或改在 preview 上量（需使用者當次同意）。
import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, loadavg } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { labels } from "../src/i18n/labels.zh-TW.ts";

const args = process.argv.slice(2);
const option = (name, fallback) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
const base = option("--base", `http://127.0.0.1:${process.env.CAPTURE_PORT ?? 3100}`).replace(/\/$/, "");
const out = resolve(option("--out", "verification/revamp-v3/V3-0"));

function findModules() {
  const candidates = [];
  if (process.env.LIGHTHOUSE_HOME) candidates.push(resolve(process.env.LIGHTHOUSE_HOME, "node_modules"));
  candidates.push(resolve("node_modules"));
  const npx = join(homedir(), ".npm", "_npx");
  if (existsSync(npx)) for (const entry of readdirSync(npx)) candidates.push(join(npx, entry, "node_modules"));
  const found = candidates.find(dir => ["lighthouse", "puppeteer-core", "chrome-launcher"].every(name => existsSync(join(dir, name, "package.json"))));
  if (!found) throw new Error("找不到 lighthouse／puppeteer-core／chrome-launcher：請先執行 `npx -y lighthouse@13.5.0 --version`，或設定 LIGHTHOUSE_HOME。");
  return found;
}
const modules = findModules();
/** 依套件 package.json 的 exports["."].import（或 main）載入 ESM 入口。 */
async function load(name) {
  const manifest = JSON.parse(await readFile(join(modules, name, "package.json"), "utf8"));
  const root = manifest.exports?.["."] ?? manifest.exports;
  const entry = (typeof root === "string" ? root : root?.import?.default ?? root?.import ?? root?.default) ?? manifest.main ?? "index.js";
  return import(pathToFileURL(join(modules, name, entry)).href);
}
const { version: lighthouseVersion } = JSON.parse(await readFile(join(modules, "lighthouse", "package.json"), "utf8"));
const { startFlow, navigation, generateReport, desktopConfig } = await load("lighthouse");
const puppeteer = (await load("puppeteer-core")).default;
const chromeLauncher = await load("chrome-launcher");

const pages = [
  { id: "diagnosis", anchor: "[data-testid='diagnosis-panel']" },
  { id: "products", anchor: "[data-testid='product-table']" },
  { id: "scenarios", anchor: "[data-testid='scenario-1']" },
  { id: "meeting", anchor: "[data-testid='meeting-page']" },
  // V4-0a 第 11 項：加資料來源與待辦兩頁（PRD §2.2 C1、C2）。接在會議紀錄之後，v3 既有四步的切頁前後頁不變；
  // 資料來源的 anchor 是頁首下的資料狀態一行（DataWorkspace 的 data-status-line），待辦是 ActionsWorkbench 的根（actions-workbench）。
  { id: "data", anchor: "[data-testid='data-status-line']" },
  { id: "actions", anchor: "[data-testid='actions-workbench']" },
];
// V41-1：說明頁另跑 navigation 的路徑（V41-2a 加 "/guide/overview"）。
const GUIDE_NAV_PAGES = ["/guide"];
const sizes = [
  { name: "desktop-1440", config: desktopConfig, flags: { formFactor: "desktop", screenEmulation: { mobile: false, width: 1440, height: 1000, deviceScaleFactor: 1, disabled: false } } },
  { name: "mobile-390", config: undefined, flags: { formFactor: "mobile", screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 3, disabled: false } } },
];

/** 依完整文字（或 aria-label）找可見按鈕（可限定在某個容器內），用 puppeteer 的真實滑鼠點擊。 */
async function clickButton(page, text, within = "body") {
  const handle = await page.waitForFunction((label, scope) => [...document.querySelectorAll(`${scope} button`)].find(button => (button.textContent.trim() === label || button.getAttribute("aria-label") === label) && button.checkVisibility()), { timeout: 30_000 }, text, within);
  await handle.asElement().click();
}
/** V3-3 切頁：桌機點側欄；390 寬的底部分頁列以 aria-label 帶頁名（可見字是短名），不在分頁列上的頁先點「更多」再點面板裡的項目。 */
async function navigateTo(page, label) {
  const visible = await page.evaluate(label => [...document.querySelectorAll("nav button")].some(button => (button.textContent.trim() === label || button.getAttribute("aria-label") === label) && button.checkVisibility()), label);
  if (!visible) await clickButton(page, labels.shell.mobileNav.more, "nav");
  await clickButton(page, label, "nav");
}

const metric = (lhr, id) => lhr.audits[id]?.numericValue === undefined ? null : Math.round(lhr.audits[id].numericValue * 1000) / 1000;
function summarize(step) {
  const { lhr } = step;
  const score = id => lhr.categories[id]?.score === null || lhr.categories[id]?.score === undefined ? null : Math.round(lhr.categories[id].score * 100);
  const failedA11y = Object.values(lhr.categories.accessibility?.auditRefs ?? []).map(ref => lhr.audits[ref.id]).filter(audit => audit && audit.scoreDisplayMode === "binary" && audit.score !== 1).map(audit => audit.id);
  // 0–100 的 Performance 分數只有 navigation 有意義；timespan／snapshot 依 Lighthouse 報告的呈現改記「通過幾項／共幾項」（分數 ≥ 0.9 算通過）。
  const scored = (lhr.categories.performance?.auditRefs ?? []).map(ref => lhr.audits[ref.id]).filter(audit => audit && ["binary", "numeric", "metricSavings"].includes(audit.scoreDisplayMode) && audit.score !== null);
  return {
    step: step.name, mode: lhr.gatherMode, accessibility: score("accessibility"), performance: lhr.gatherMode === "navigation" ? score("performance") : null,
    performanceAudits: lhr.categories.performance ? `${scored.filter(audit => audit.score >= 0.9).length}/${scored.length}` : null,
    metrics: { fcpMs: metric(lhr, "first-contentful-paint"), lcpMs: metric(lhr, "largest-contentful-paint"), speedIndexMs: metric(lhr, "speed-index"), tbtMs: metric(lhr, "total-blocking-time"), cls: metric(lhr, "cumulative-layout-shift"), inpMs: metric(lhr, "interaction-to-next-paint") },
    failedAccessibilityAudits: failedA11y,
    failedAccessibilityNodes: Object.fromEntries(failedA11y.map(id => [id, { count: lhr.audits[id].details?.items?.length ?? 0, nodes: (lhr.audits[id].details?.items ?? []).slice(0, 8).map(item => `${item.node?.selector ?? ""} ｜ ${(item.node?.nodeLabel ?? "").slice(0, 40)}`) }])),
  };
}
/** V41-1：照 Lighthouse 的類別計分（core/scoring.js）重算 SEO 分數並去掉 excluded 的稽核——不適用、資訊、手動的權重為 0，其餘依報告的 auditRefs 權重加權平均；有權重的稽核分數為 null 時回傳 null（與 Lighthouse 相同）。 */
function seoScoreExcluding(lhr, excluded) {
  const weighted = (lhr.categories.seo?.auditRefs ?? []).filter(ref => !excluded.includes(ref.id)).map(ref => ({ score: lhr.audits[ref.id]?.score ?? null, weight: ["notApplicable", "informative", "manual"].includes(lhr.audits[ref.id]?.scoreDisplayMode) ? 0 : ref.weight })).filter(item => item.weight > 0);
  if (!weighted.length || weighted.some(item => item.score === null)) return null;
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  return Math.round((weighted.reduce((sum, item) => sum + item.score * item.weight, 0) / total) * 100);
}
/** V41-1：說明頁 navigation 的摘要＝user-flow 的 summarize（accessibility、performance、CLS、TBT、LCP…）＋ SEO 分數、未通過的 SEO 稽核、排除 canonical 的 SEO 分數與 canonical 稽核的結果。 */
function summarizeGuide(path, lhr) {
  const canonical = lhr.audits.canonical;
  return {
    ...summarize({ name: path, lhr }),
    seo: lhr.categories.seo?.score === null || lhr.categories.seo?.score === undefined ? null : Math.round(lhr.categories.seo.score * 100),
    seoFailedAudits: (lhr.categories.seo?.auditRefs ?? []).map(ref => lhr.audits[ref.id]).filter(audit => audit && (audit.scoreDisplayMode === "error" || (["binary", "numeric", "metricSavings"].includes(audit.scoreDisplayMode) && audit.score !== 1))).map(audit => audit.id),
    seoScoreExcludingCanonical: seoScoreExcluding(lhr, ["canonical"]),
    canonicalAudit: canonical ? { score: canonical.score, scoreDisplayMode: canonical.scoreDisplayMode, explanation: canonical.explanation ?? null } : null,
    ...(lhr.runtimeError ? { runtimeError: `${lhr.runtimeError.code}：${lhr.runtimeError.message}` } : {}),
  };
}

const loadBefore = loadavg().map(value => Math.round(value * 100) / 100);
const chrome = await chromeLauncher.launch({ chromeFlags: ["--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-extensions"] });
const results = {};
const lazyChunks = {};
const guideResults = {};
// timespan 模式不支援 accessibility 類別，所以 timespan 只跑 performance；navigation 與 snapshot 跑兩類。
const both = ["performance", "accessibility"];
const perfOnly = { onlyCategories: ["performance"] };
try {
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${chrome.port}`, defaultViewport: null });
  await mkdir(join(out, "lighthouse"), { recursive: true });
  for (const size of sizes) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const flow = await startFlow(page, { name: `EC ProfitLens v2 基準 ${size.name}`, config: size.config, flags: { ...size.flags, onlyCategories: both } });
    await flow.navigate(`${base}/`, { name: "首頁（空狀態，navigation）" });
    // V4-3c：timespan 的時間窗＝startTimespan 之前到 endTimespan 之前（頁內 performance.now()；開頭略寬，寧可多算）。
    const pageNow = () => page.evaluate(() => performance.now());
    const windows = [];
    let windowStart = await pageNow();
    await flow.startTimespan({ name: "載入示範資料（timespan）", ...perfOnly });
    await clickButton(page, labels.shell.buttons.loadDemo);
    await page.waitForSelector("[data-testid='local-save-prompt']", { visible: true, timeout: 30_000 });
    await clickButton(page, labels.storage.autoSave.decline, "[data-testid='local-save-prompt']");
    await page.waitForSelector("[data-testid='top-three']", { visible: true, timeout: 30_000 });
    windows.push({ step: "載入示範資料", from: windowStart, to: await pageNow() });
    await flow.endTimespan();
    await flow.snapshot({ name: `${labels.shell.nav.overview.headline}（snapshot）` });
    for (const target of pages) {
      const label = labels.shell.nav[target.id].headline;
      windowStart = await pageNow();
      await flow.startTimespan({ name: `切到${label}（timespan）`, ...perfOnly });
      await navigateTo(page, label);
      await page.waitForSelector(target.anchor, { visible: true, timeout: 30_000 });
      windows.push({ step: `切到${label}`, from: windowStart, to: await pageNow() });
      await flow.endTimespan();
      await page.evaluate(() => window.scrollTo(0, 0));
      await flow.snapshot({ name: `${label}（snapshot）` });
    }
    // 首頁載入之後（第一個 timespan 開始之後）才下載的程式 chunk，與落在 timespan 內的那些。
    const firstWindow = windows[0].from;
    const chunks = (await page.evaluate(() => performance.getEntriesByType("resource").filter(entry => entry.name.includes("/_next/static/chunks/")).map(entry => ({ file: entry.name.replace(/^.*\/_next\/static\/chunks\//, ""), start: entry.startTime, end: entry.responseEnd })))).filter(chunk => chunk.start >= firstWindow);
    const round1 = value => Math.round(value * 10) / 10;
    const insideTimespans = chunks.flatMap(chunk => windows.filter(window => chunk.end >= window.from && chunk.start <= window.to).map(window => ({ file: chunk.file, step: window.step })));
    lazyChunks[size.name] = { windows: windows.map(window => ({ step: window.step, from: round1(window.from), to: round1(window.to) })), chunks: chunks.map(chunk => ({ file: chunk.file, start: round1(chunk.start), end: round1(chunk.end) })), insideTimespans };
    const result = await flow.createFlowResult();
    await writeFile(join(out, "lighthouse", `flow-${size.name}.html`), await flow.generateReport());
    results[size.name] = result.steps.map(summarize);
    await context.close();
    console.log(size.name, JSON.stringify(results[size.name].map(step => [step.step, step.accessibility, step.performance, step.performanceAudits, step.metrics.tbtMs, step.metrics.cls, step.failedAccessibilityAudits.join(" ")])));
    console.log(size.name, "lazy chunks", JSON.stringify({ count: lazyChunks[size.name].chunks.length, insideTimespans: lazyChunks[size.name].insideTimespans }));
  }
  // V41-1：說明頁的獨立 navigation（每頁、每尺寸一個新的 browser context；form factor、螢幕與節流同上面的 user-flow）。
  for (const size of sizes) {
    for (const path of GUIDE_NAV_PAGES) {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      const runner = await navigation(page, `${base}${path}`, { config: size.config, flags: { ...size.flags, onlyCategories: ["accessibility", "performance", "seo"] } });
      const report = `${path.replace(/^\//, "").replaceAll("/", "-")}-${size.name}.html`;
      await writeFile(join(out, "lighthouse", report), generateReport(runner.lhr, "html"));
      (guideResults[path] ??= {})[size.name] = { report: `lighthouse/${report}`, ...summarizeGuide(path, runner.lhr) };
      await context.close();
      const item = guideResults[path][size.name];
      console.log(size.name, path, JSON.stringify([item.accessibility, item.performance, item.seo, item.seoScoreExcludingCanonical, item.metrics.cls, item.metrics.tbtMs, item.metrics.lcpMs, item.seoFailedAudits.join(" "), item.failedAccessibilityAudits.join(" ")]));
    }
  }
  await browser.disconnect();
} finally {
  chrome.kill();
}

const file = join(out, "metrics.json");
let json = {};
try { json = JSON.parse(await readFile(file, "utf8")); } catch { json = {}; }
json.lighthouse = { version: lighthouseVersion, base, generatedAt: new Date().toISOString(), lazyChunks, loadAverage: { before: loadBefore, after: loadavg().map(value => Math.round(value * 100) / 100), note: "os.loadavg()（1／5／15 分鐘）；本機負載高時 timespan 的 TBT／INP 會偏高，比較時以同負載重跑為準" }, method: "user-flow：navigate（空狀態首頁）→ timespan（載入示範資料）→ snapshot（總覽）→ 每頁 timespan（側欄切頁）＋ snapshot；accessibility 取 snapshot、performance 0–100 只有 navigation 有，timespan 記 TBT／CLS／INP；desktop 用 lighthouse desktopConfig、mobile 用預設（模擬節流）並改成 390×844", ...results, guide: { method: "V41-1：GUIDE_NAV_PAGES 每頁、desktop 1440 與 mobile 390 各一次獨立 navigation（accessibility、performance、seo；設定同 user-flow）；seoScoreExcludingCanonical＝依報告的 SEO 稽核權重去掉 canonical 重算（127.0.0.1 上 canonical 指向正式站網域，canonicalAudit 記錄原因）", pages: guideResults } };
await writeFile(file, `${JSON.stringify(json, null, 2)}\n`);
