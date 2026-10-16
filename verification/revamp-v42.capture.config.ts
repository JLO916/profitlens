import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

// V42-0 基準與護欄（docs/revamp-v4.2/06_BATCHES.md V42-0 第 5 項；比照 verification/revamp-v41.capture.config.ts）：
// spec 沿用 verification/revamp-v4-capture/（baseline.spec.ts 的畫面基準、metrics.spec.ts 的 B2、B3、B5、B9、v41 的首載量測與 V42-0 起的 v42 首載門檻），
// 只把基準存放位置改到 verification/revamp-v42/{batch}/snapshots/。與 tests/e2e 分開，不計入 E2E 數量。
//
// 執行方式（先 build，再用正式站設定啟動 production 伺服器；PORT 預設 3100，可用 CAPTURE_PORT 改）：
//   NEXT_TELEMETRY_DISABLED=1 npm run build
//   APP_MODE=PUBLIC_DEMO PUBLIC_DEMO=true ENABLE_LIVE_AI=false npm start -- --port 3100 &
//   METRICS_OUT=verification/revamp-v42/V42-n/metrics.json FIRST_LOAD_MODULES_OUT=verification/revamp-v42/V42-n/first-load-modules.json \
//     CAPTURE_BATCH=V42-n npx playwright test --config verification/revamp-v42.capture.config.ts
// metrics.spec.ts 不設 METRICS_OUT、FIRST_LOAD_MODULES_OUT 時會寫到 verification/revamp-v4/V42-n/（v4 的預設位置），所以 v4.2 一定要設這兩個變數指到 verification/revamp-v42/V42-n/。
//
// 跨批比對流程（06_BATCHES 共同規則「畫面基準的跨批比對」）：V42-n 開跑前把前一批的 verification/revamp-v42/V42-(n−1)/snapshots/
// （V42-0 用 verification/revamp-v41/V41-6/snapshots/ 的 64 張，即 v4.1.2 的最後一批基準）複製到 verification/revamp-v42/V42-n/snapshots/，不帶 --update-snapshots 跑一次：
// 只允許該批「允許變動畫面」有差異（V42-0 的允許變動畫面是「無」，64 張必須 0 差異），其餘必須 0 差異；確認後只對允許的畫面更新基準，並在驗收文件逐張寫理由。
// v4.2 的新畫面（17 起）放新的 spec 檔，不動凍結的 01 到 09 走查。
//
// 截圖門檻沿用 v3、v4、v4.1：maxDiffPixels = 0；單一像素的色差容許 threshold = 0.02（只吸收 Chromium 圓角反鋸齒的 ±1 色階雜訊）。
const port = Number(process.env.CAPTURE_PORT ?? 3100);
const batch = process.env.CAPTURE_BATCH ?? "V42-0";

export default defineConfig({
  testDir: "./revamp-v4-capture",
  outputDir: resolve("test-results/revamp-v42-capture"),
  snapshotPathTemplate: `{testDir}/../revamp-v42/${batch}/snapshots/{projectName}/{arg}{ext}`,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0, maxDiffPixels: 0, threshold: 0.02, animations: "disabled", caret: "hide", scale: "css" },
  },
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: "chromium",
    headless: true,
    locale: "zh-TW",
    timezoneId: "Asia/Taipei",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "laptop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "tablet", use: { viewport: { width: 768, height: 1024 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
  // 正式站設定（與 verification/deployment-config.json 相同）；重用共通驗收第 3 步已啟動的 PUBLIC_DEMO 伺服器，讓 Lighthouse（scripts/lighthouse-pages.mjs）共用同一個。
  webServer: {
    command: `NEXT_TELEMETRY_DISABLED=1 npm start -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: true,
    env: { ENABLE_LIVE_AI: "false", APP_MODE: "PUBLIC_DEMO", PUBLIC_DEMO: "true" },
    timeout: 120_000,
  },
});
