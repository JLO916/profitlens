// R7-3：產生分享卡片 public/og.png（1200×630）。用法：node scripts/make-og.mjs（需已安裝 Playwright 的 Chromium）。
// 文字一律取自 src/i18n/labels.zh-TW.ts 與 src/app/site.ts（Node 24+ 直接載入 .ts，只做型別剝除）；
// 截圖取自 R7 走查的總覽首屏（示範資料，verification/revamp-R7-capture/r7.spec.ts 產生），裁掉側欄後縮放放在右側。產物是靜態檔，改字或換截圖後重跑本腳本並提交 PNG。
import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const { labels } = await import(new URL("../src/i18n/labels.zh-TW.ts", import.meta.url).href);
const { SITE_URL } = await import(new URL("../src/app/site.ts", import.meta.url).href);

const WIDTH = 1200, HEIGHT = 630;
const SCREENSHOT = resolve("verification/revamp-R7/1b-overview-desktop-viewport.png");
const OUTPUT = resolve("public/og.png");
// 來源截圖 1440×1000：x 212 起是主內容（裁掉側欄）；縮放到 640px 寬。
const SOURCE = { width: 1440, sidebar: 212 }, FRAME = { left: 584, top: 104, width: 640, height: 420 };
const scale = FRAME.width / (SOURCE.width - SOURCE.sidebar);

const escape = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const shot = (await readFile(SCREENSHOT)).toString("base64");
const [, product] = labels.brand.title.split("｜");
const lens = "M4 18V6h5v12 M13 18V3h6v15 M3 21h18";
const html = `<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; background: #fff; }
  body { position: relative; font-family: "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", Arial, sans-serif; color: #243c44; }
  .tint { position: absolute; left: 540px; top: 0; right: 0; bottom: 0; background: #f2f6f3; border-left: 1px solid #e2e9e6; }
  .copy { position: absolute; left: 64px; top: 64px; width: 448px; height: ${HEIGHT - 128}px; display: flex; flex-direction: column; }
  .brand { display: flex; align-items: center; gap: 16px; }
  .mark { width: 56px; height: 56px; border-radius: 13px; background: #1f4d3f; display: flex; align-items: center; justify-content: center; }
  .name { font-size: 36px; font-weight: 700; letter-spacing: -.5px; line-height: 1.1; }
  .product { font-size: 18px; color: #52685f; margin-top: 4px; letter-spacing: 1px; }
  h1 { margin-top: 56px; font-size: 46px; line-height: 1.3; font-weight: 700; color: #1f4d3f; letter-spacing: -.5px; }
  p.lead { margin-top: 22px; font-size: 22px; line-height: 1.65; color: #4b5f59; }
  .url { margin-top: auto; font-size: 18px; color: #177f6c; font-weight: 600; letter-spacing: .3px; }
  .frame { position: absolute; left: ${FRAME.left}px; top: ${FRAME.top}px; width: ${FRAME.width}px; height: ${FRAME.height}px; border-radius: 14px; border: 1px solid #dfe7e3; box-shadow: 0 22px 48px #233f3d29; background-color: #f5f7f5;
    background-image: url("data:image/png;base64,${shot}"); background-repeat: no-repeat; background-size: ${(SOURCE.width * scale).toFixed(1)}px auto; background-position: ${(-SOURCE.sidebar * scale).toFixed(1)}px 0; }
  .note { position: absolute; left: ${FRAME.left}px; top: ${FRAME.top + FRAME.height + 14}px; font-size: 15px; color: #667978; }
</style></head><body>
  <div class="tint"></div>
  <div class="copy">
    <div class="brand"><span class="mark"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${lens}"/></svg></span><div><div class="name">${escape(labels.brand.name)}</div><div class="product">${escape(product)}</div></div></div>
    <h1>${escape(labels.relaunch.ogHeadline)}</h1>
    <p class="lead">${escape(labels.brand.description)}</p>
    <div class="url">${escape(new URL(SITE_URL).host)}</div>
  </div>
  <div class="frame" role="img" aria-label="${escape(labels.nav.overview.label)}"></div>
  <div class="note">${escape(labels.relaunch.ogScreenshotNote)}</div>
</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
  await writeFile(OUTPUT, png);
} finally {
  await browser.close();
}
const header = await readFile(OUTPUT);
console.log(`public/og.png ${header.readUInt32BE(16)}×${header.readUInt32BE(20)} ${(await stat(OUTPUT)).size} bytes`);
