import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

// V4-0a 基準與護欄（06_BATCHES V4-0a 第 9 項；比照 verification/revamp-v3.capture.config.ts）：
// 四尺寸 toHaveScreenshot 基準 52 張（baseline.spec.ts：v3 的 01–09 × 4、新增 10–12 × 4、13 KPI 帶元素截圖 × 4）
// 與 PRD §2.2 B 工程指標（metrics.spec.ts：B2、B3、B5 硬斷言；B1、B8、B9 只記錄）。
// 與 tests/e2e 分開，不計入 E2E 數量，也不會改寫 verification/review-v2-a-*。
//
// 執行方式（先 build，再用正式站設定啟動 production 伺服器；PORT 預設 3100，可用 CAPTURE_PORT 改）：
//   NEXT_TELEMETRY_DISABLED=1 npm run build
//   APP_MODE=PUBLIC_DEMO PUBLIC_DEMO=true ENABLE_LIVE_AI=false npm start -- --port 3100 &
//   CAPTURE_BATCH=V4-n npx playwright test --config verification/revamp-v4.capture.config.ts             # 比對基準＋量測
//   CAPTURE_BATCH=V4-n npx playwright test --config verification/revamp-v4.capture.config.ts baseline    # 只比對基準
//   CAPTURE_BATCH=V4-n npx playwright test --config verification/revamp-v4.capture.config.ts metrics     # 只量測，寫 verification/revamp-v4/V4-n/metrics.json
//
// 跨批比對流程（06_BATCHES 共同規則「畫面基準的跨批比對流程」）：V4-n 開跑前把前一批的 verification/revamp-v4/V4-(n−1)/snapshots/
// （V4-0a 用 verification/revamp-v3/V3-10/snapshots/ 的 36 張，檔名 01–09 不變）複製到 verification/revamp-v4/V4-n/snapshots/，
// 不帶 --update-snapshots 跑一次：只允許該批「允許變動畫面」有差異，其餘必須 0 差異；確認後只對允許的畫面更新基準（--update-snapshots 加 -g 或只留該檔），
// 並在驗收文件逐張寫理由。第一次出現的畫面（V4-0a 的 10–13）沒有基準檔時，Playwright 會寫入新基準並把該次判為失敗；再跑一次必須全部通過。
//
// 截圖門檻沿用 v3：maxDiffPixels = 0（像素完全相同）；單一像素的色差容許 threshold = 0.02（pixelmatch YIQ；Playwright 預設 0.2），
// 只吸收 Chromium 圓角反鋸齒的 ±1 色階雜訊（V3-0 實測），任何肉眼可見的顏色或位置改變仍算差異像素，而差異像素數上限是 0。
// 基準存放位置依批次分開（snapshotPathTemplate；CAPTURE_BATCH=V4-n，預設 V4-0a）。
const port = Number(process.env.CAPTURE_PORT ?? 3100);
const batch = process.env.CAPTURE_BATCH ?? "V4-0a";

export default defineConfig({
  testDir: "./revamp-v4-capture",
  outputDir: resolve("test-results/revamp-v4-capture"),
  snapshotPathTemplate: `{testDir}/../revamp-v4/${batch}/snapshots/{projectName}/{arg}{ext}`,
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
