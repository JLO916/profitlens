import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

export default defineConfig({
  testDir: "./release-20261001-e2e",
  outputDir: resolve("test-results-release-20261001"),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: resolve("playwright-report-release-20261001"), open: "never" }],
    ["json", { outputFile: resolve("verification/release-20261001-e2e-results.json") }],
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
    cwd: resolve("."),
    // A dedicated production server avoids Fast Refresh clearing the in-memory
    // workspace while dev routes or generated files are being recompiled.
    command: "NEXT_TELEMETRY_DISABLED=1 npm run build > verification/release-20261001-build.txt 2>&1 && npm start -- --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    // Deliberately fake, non-secret canary: build verification asserts it never enters static assets.
    // Live is always disabled, regardless of the invoking shell or local environment files.
    env: { ENABLE_LIVE_AI: "false", OPENAI_API_KEY: "sk-PROFITLENS-RELEASE-20261001-NONSECRET-BUNDLE-CANARY", OPENAI_MODEL: "verification-only-never-called", APP_MODE: "LOCAL", PUBLIC_DEMO: "false" },
    timeout: 120_000,
  },
});
