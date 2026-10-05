import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

// V3-0：在真實瀏覽器收集「互動後才出現」的 data-testid（testids-v2.txt 中來源為 e2e 的列）。只收集、不斷言產品行為；與 tests/e2e 分開，不計入 E2E 數量。
// 對著本機 production 伺服器（先 npm run build）。預設重用已啟動的 3100（與 R7 走查同一個伺服器）；平行工作時可用 PROFITLENS_PORT 指定其他埠。
const port = Number(process.env.PROFITLENS_PORT ?? 3100);
export default defineConfig({
  testDir: "./revamp-v3",
  testMatch: "collect-testids.spec.ts",
  outputDir: resolve("test-results-revamp-v3"),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: "chromium",
    headless: true,
    locale: "zh-TW",
    timezoneId: "Asia/Taipei",
    video: "off",
  },
  // testid 與視窗大小無關（M6：桌機與手機同一份 DOM），只跑 1440×1000。
  projects: [{ name: "desktop", use: { viewport: { width: 1440, height: 1000 } } }],
  webServer: {
    command: `NEXT_TELEMETRY_DISABLED=1 npm start -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: true,
    env: { ENABLE_LIVE_AI: "false", APP_MODE: "PUBLIC_DEMO", PUBLIC_DEMO: "true" },
    timeout: 120_000,
  },
});
