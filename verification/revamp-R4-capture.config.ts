import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

// R4：輔助指標橫列、達成率、趨勢檔期區帶、去年同期快捷的四尺寸截圖（與 R0–R3 同流程）。只拍照、不斷言產品行為；與 tests/e2e 分開，避免計入 E2E 數量。
export default defineConfig({
  testDir: "./revamp-R4-capture",
  outputDir: resolve("test-results-revamp-R4"),
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
  webServer: {
    command: "NEXT_TELEMETRY_DISABLED=1 npm run build && npm start -- --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    env: { ENABLE_LIVE_AI: "false", APP_MODE: "LOCAL", PUBLIC_DEMO: "false" },
    timeout: 120_000,
  },
});
