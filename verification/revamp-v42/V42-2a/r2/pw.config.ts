import { defineConfig } from "@playwright/test";
const R2 = "/private/tmp/claude-502/-Users-j-work-ProfitLens/dbb9107e-e7d5-4aed-a614-47ec6e660af0/scratchpad/v42/v42-2a/r2";
export default defineConfig({
  testDir: `${R2}/specs`,
  outputDir: `${R2}/test-results`,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 900_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["json", { outputFile: `${R2}/results.json` }]],
  use: { actionTimeout: 20_000, navigationTimeout: 30_000, baseURL: "http://127.0.0.1:3106", browserName: "chromium", headless: true, locale: "zh-TW", timezoneId: "Asia/Taipei", trace: "off", screenshot: "only-on-failure", video: "off" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "laptop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "tablet", use: { viewport: { width: 768, height: 1024 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
});
