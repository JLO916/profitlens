import { defineConfig } from "@playwright/test";

// R3：供平行修測試的代理對「已經在 3100 跑的正式伺服器」執行單一 spec（不啟動 webServer、不寫 JSON 報表以免覆寫 A 批證據檔）。
// No JSON reporter so the A-batch evidence file is not rewritten by partial runs.
export default defineConfig({
  testDir: "../tests/e2e",
  outputDir: "test-results-shared",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    browserName: "chromium",
    headless: true,
    locale: "zh-TW",
    timezoneId: "Asia/Taipei",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "laptop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "tablet", use: { viewport: { width: 768, height: 1024 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
});
