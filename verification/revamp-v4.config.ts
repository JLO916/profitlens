import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

// V4-0a（PRD v4 §8.6、06_BATCHES V4-0a 第 3 項）：在真實瀏覽器收集「互動後才出現」的 data-testid（testids-v3.txt 中來源為 e2e 的列），比照 verification/revamp-v3.config.ts。
// 只收集、不斷言產品行為；與 tests/e2e（testDir tests/e2e）、capture（testDir revamp-v4-capture）分開，不計入 E2E 數量。
// 對著本機 production 伺服器（先 npm run build，再以 PUBLIC_DEMO 模式 npm start）。預設 3100；平行工作時用 PROFITLENS_PORT 指定其他埠。
const port = Number(process.env.PROFITLENS_PORT ?? 3100);
export default defineConfig({
  testDir: "./revamp-v4",
  testMatch: "collect-testids.spec.ts",
  outputDir: resolve("test-results-revamp-v4"),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: "chromium",
    headless: true,
    locale: "zh-TW",
    timezoneId: "Asia/Taipei",
    video: "off",
    acceptDownloads: true,
    actionTimeout: 20_000,
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
