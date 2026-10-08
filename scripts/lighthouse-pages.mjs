#!/usr/bin/env node
// V3-0 ⑦：Lighthouse 基準（Accessibility＋Performance），示範資料已載入的 5 頁（總覽、通路健檢、商品毛利、假設試算、會議紀錄），1440×1000 與 390×844。
// 用 Lighthouse user-flow（startFlow）：一個流程內 navigate（空狀態首頁，唯一能算 0–100 Performance 分數的模式）
// → timespan（載入示範資料、拒絕本機保存提示）→ snapshot（總覽）→ 每頁 timespan（側欄切頁）＋ snapshot。
// 示範資料只存在記憶體（v2 沒有自動還原），所以「已載入資料的頁面」不能用 navigation 模式；這些頁的 Performance 以 timespan 的 TBT／CLS／INP 記錄。
//
// 不新增專案依賴：lighthouse、puppeteer-core、chrome-launcher 取自 npx 快取（R7 已用 `npx lighthouse` 13.5.0）。
//   找不到時先執行 `npx -y lighthouse@13.5.0 --version` 建立快取，或用 LIGHTHOUSE_HOME 指到含 node_modules/lighthouse 的資料夾。
// 用法（先用正式站設定啟動 production 伺服器，見 verification/revamp-v3/V3-0-baseline.md）：
//   node --no-warnings scripts/lighthouse-pages.mjs [--base http://127.0.0.1:3100] [--out verification/revamp-v3/V3-0]
// 輸出：<out>/lighthouse/flow-desktop-1440.html、flow-mobile-390.html（只留 HTML），分數表合併寫入 <out>/metrics.json 的 lighthouse 鍵。
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
const { startFlow, desktopConfig } = await load("lighthouse");
const puppeteer = (await load("puppeteer-core")).default;
const chromeLauncher = await load("chrome-launcher");

const pages = [
  { id: "diagnosis", anchor: "[data-testid='diagnosis-panel']" },
  { id: "products", anchor: "[data-testid='product-table']" },
  { id: "scenarios", anchor: "[data-testid='scenario-1']" },
  { id: "meeting", anchor: "[data-testid='meeting-page']" },
];
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

const loadBefore = loadavg().map(value => Math.round(value * 100) / 100);
const chrome = await chromeLauncher.launch({ chromeFlags: ["--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-extensions"] });
const results = {};
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
    await flow.startTimespan({ name: "載入示範資料（timespan）", ...perfOnly });
    await clickButton(page, labels.shell.buttons.loadDemo);
    await page.waitForSelector("[data-testid='local-save-prompt']", { visible: true, timeout: 30_000 });
    await clickButton(page, labels.storage.autoSave.decline, "[data-testid='local-save-prompt']");
    await page.waitForSelector("[data-testid='top-three']", { visible: true, timeout: 30_000 });
    await flow.endTimespan();
    await flow.snapshot({ name: `${labels.shell.nav.overview.headline}（snapshot）` });
    for (const target of pages) {
      const label = labels.shell.nav[target.id].headline;
      await flow.startTimespan({ name: `切到${label}（timespan）`, ...perfOnly });
      await navigateTo(page, label);
      await page.waitForSelector(target.anchor, { visible: true, timeout: 30_000 });
      await flow.endTimespan();
      await page.evaluate(() => window.scrollTo(0, 0));
      await flow.snapshot({ name: `${label}（snapshot）` });
    }
    const result = await flow.createFlowResult();
    await writeFile(join(out, "lighthouse", `flow-${size.name}.html`), await flow.generateReport());
    results[size.name] = result.steps.map(summarize);
    await context.close();
    console.log(size.name, JSON.stringify(results[size.name].map(step => [step.step, step.accessibility, step.performance, step.performanceAudits, step.metrics.tbtMs, step.metrics.cls, step.failedAccessibilityAudits.join(" ")])));
  }
  await browser.disconnect();
} finally {
  chrome.kill();
}

const file = join(out, "metrics.json");
let json = {};
try { json = JSON.parse(await readFile(file, "utf8")); } catch { json = {}; }
json.lighthouse = { version: lighthouseVersion, base, generatedAt: new Date().toISOString(), loadAverage: { before: loadBefore, after: loadavg().map(value => Math.round(value * 100) / 100), note: "os.loadavg()（1／5／15 分鐘）；本機負載高時 timespan 的 TBT／INP 會偏高，比較時以同負載重跑為準" }, method: "user-flow：navigate（空狀態首頁）→ timespan（載入示範資料）→ snapshot（總覽）→ 每頁 timespan（側欄切頁）＋ snapshot；accessibility 取 snapshot、performance 0–100 只有 navigation 有，timespan 記 TBT／CLS／INP；desktop 用 lighthouse desktopConfig、mobile 用預設（模擬節流）並改成 390×844", ...results };
await writeFile(file, `${JSON.stringify(json, null, 2)}\n`);
