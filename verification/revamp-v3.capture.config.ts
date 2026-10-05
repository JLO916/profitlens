import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

// V3-0 基準與護欄：四尺寸 toHaveScreenshot 基準（baseline.spec.ts）與 §2.3 B 工程指標量測（metrics.spec.ts）。
// 與 tests/e2e 分開，不計入 E2E 數量，也不會改寫 verification/review-v2-a-*。
//
// 執行方式（先 build，再用正式站設定啟動 production 伺服器；PORT 預設 3100，可用 CAPTURE_PORT 改）：
//   NEXT_TELEMETRY_DISABLED=1 npm run build
//   APP_MODE=PUBLIC_DEMO PUBLIC_DEMO=true ENABLE_LIVE_AI=false npm start -- --port 3100 &
//   npx playwright test --config verification/revamp-v3.capture.config.ts baseline            # 比對基準
//   npx playwright test --config verification/revamp-v3.capture.config.ts baseline --update-snapshots   # 只有 V3-0 寫基準
//   npx playwright test --config verification/revamp-v3.capture.config.ts metrics              # 寫 verification/revamp-v3/V3-0/metrics.json
//
// 截圖門檻：V3-0 不改任何 UI，所以 maxDiffPixelRatio = 0（像素完全相同）。
// 之後的批次依該批允許的視覺變化「每批」調高（例如 V3-1 只有樣式差異），並把新的門檻與理由寫進該批驗收文件；
// 基準本身只在該批明確更新（--update-snapshots）時改寫，存放位置依批次分開（見 snapshotPathTemplate；CAPTURE_BATCH=V3-n）。
// 單一像素的色差容許 threshold = 0.02（pixelmatch YIQ；Playwright 預設 0.2）：只吸收 Chromium 圓角反鋸齒的 ±1 色階雜訊
// （V3-0 實測：mobile 總覽整頁在 y≈534 的期間快捷鈕圓角有 24 個像素 ±1 色階的差異，threshold 0 時兩次執行不穩定），
// 任何肉眼可見的顏色或位置改變（單一色版差 ≥ 約 6 階）仍算差異像素，而差異像素數上限是 0。
const port = Number(process.env.CAPTURE_PORT ?? 3100);
const batch = process.env.CAPTURE_BATCH ?? "V3-0";

export default defineConfig({
  testDir: "./revamp-v3-capture",
  outputDir: resolve("test-results/revamp-v3-capture"),
  snapshotPathTemplate: `{testDir}/../revamp-v3/${batch}/snapshots/{projectName}/{arg}{ext}`,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
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
  // 正式站設定（與 verification/deployment-config.json 相同）；允許重用已啟動的伺服器，讓 Lighthouse（scripts/lighthouse-pages.mjs）共用同一個。
  webServer: {
    command: `NEXT_TELEMETRY_DISABLED=1 npm start -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: true,
    env: { ENABLE_LIVE_AI: "false", APP_MODE: "PUBLIC_DEMO", PUBLIC_DEMO: "true" },
    timeout: 120_000,
  },
});
