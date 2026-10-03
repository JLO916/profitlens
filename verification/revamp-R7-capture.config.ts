import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

// R7：上線前人工走查（示範 → 三件事 → 看證據 → 加入待辦 → 試算 → 會議紀錄 → 匯出）的四尺寸截圖（與 R0–R3 同流程）。只拍照、不斷言產品行為；與 tests/e2e 分開，避免計入 E2E 數量。
export default defineConfig({
  testDir: "./revamp-R7-capture",
  outputDir: resolve("test-results-revamp-R7"),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    browserName: "chromium",
    headless: true,
    locale: "zh-TW",
    timezoneId: "Asia/Taipei",
    video: "off",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "laptop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "tablet", use: { viewport: { width: 768, height: 1024 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
  // 上線檢查對著「正式站設定」的本機 production 伺服器（先 npm run build）：APP_MODE=PUBLIC_DEMO、PUBLIC_DEMO=true、ENABLE_LIVE_AI=false，與 verification/deployment-config.json 相同；
  // 同一個伺服器也供 smoke（revamp-R7-smoke.py）與 Lighthouse 使用，所以允許重用已啟動的 3100。
  webServer: {
    command: "NEXT_TELEMETRY_DISABLED=1 npm start -- --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: true,
    env: { ENABLE_LIVE_AI: "false", APP_MODE: "PUBLIC_DEMO", PUBLIC_DEMO: "true" },
    timeout: 120_000,
  },
});
