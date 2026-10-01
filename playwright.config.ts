import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "verification/m6-e2e-results.json" }],
  ],
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
    { name: "tablet", use: { viewport: { width: 768, height: 1024 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    // A dedicated production server avoids Fast Refresh clearing the in-memory
    // workspace while dev routes or generated files are being recompiled.
    command: "NEXT_TELEMETRY_DISABLED=1 npm run build && npm start -- --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    // Deliberately fake, non-secret canary: build verification asserts it never enters static assets.
    // Live is always disabled, regardless of the invoking shell or local environment files.
    env: { ENABLE_LIVE_AI: "false", OPENAI_API_KEY: "sk-PROFITLENS-M6-NONSECRET-BUNDLE-CANARY", OPENAI_MODEL: "verification-only-never-called", APP_MODE: "LOCAL", PUBLIC_DEMO: "false" },
    timeout: 120_000,
  },
});
