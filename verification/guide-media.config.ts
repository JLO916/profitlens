import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

// V41-2a 說明頁媒體管線（docs/revamp-v4.1/01_PRD.md §3.5；06_BATCHES.md V41-2a 第 1 項；D-V41-20、21、22＝A）：
// verification/guide-media/capture.spec.ts 依 src/application/guide.ts 的 GUIDE_AREA_STEPS 逐張擷取說明頁截圖（一個 mediaId 一個測試），
// 與 verification/guide-media/baseline/{mediaId}.png 的基準 PNG 比對。與 tests/e2e、畫面基準（revamp-v41.capture.config.ts）分開，不計入 E2E 數量。
//
// 執行方式（先 build，再用正式站設定啟動 production 伺服器；PORT 預設 3100，可用 CAPTURE_PORT 改）：
//   NEXT_TELEMETRY_DISABLED=1 npm run build
//   APP_MODE=PUBLIC_DEMO PUBLIC_DEMO=true ENABLE_LIVE_AI=false npm start -- --port 3100 &
//   GUIDE_MEDIA=check npx playwright test --config verification/guide-media.config.ts
//     只比對、不寫任何檔（基準 PNG、WebP、媒體清單都不動）；差異必須 0 張。不設 GUIDE_MEDIA 時等同 check。
//   GUIDE_MEDIA=write npx playwright test --config verification/guide-media.config.ts
//     只更新比對失敗或新增的媒體（Playwright --update-snapshots=changed 的語意）：重寫該張基準 PNG，
//     再用 Chromium canvas 轉成 public/guide/{area}/{mediaId}.webp（品質 0.9）並更新 src/application/guide-media.json 的該筆；
//     基準相同但被引用的介面字串變了（labels_hash 不符）時只更新 labels_hash，不重轉 WebP；比對通過的媒體一律不動。
// 有差異或新增時才跑 write，驗收文件逐張寫理由；版本號改變不需要重拍（D-V41-22）。
//
// 截圖門檻同 verification/revamp-v4.capture.config.ts：maxDiffPixels＝0；單一像素的色差容許 threshold＝0.02（只吸收 Chromium 反鋸齒的 ±1 色階雜訊）。
// 視窗由每個測試依 mediaId 設定（-m 結尾 390×844，其餘 1440×1000），deviceScaleFactor 1。
const port = Number(process.env.CAPTURE_PORT ?? 3100);
const write = process.env.GUIDE_MEDIA === "write";

export default defineConfig({
  testDir: "./guide-media",
  outputDir: resolve("test-results/guide-media"),
  // 基準不分 project：verification/guide-media/baseline/{mediaId}.png。
  snapshotPathTemplate: "{testDir}/baseline/{arg}{ext}",
  updateSnapshots: write ? "changed" : "none",
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
    deviceScaleFactor: 1,
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [{ name: "guide-media" }],
  // 正式站設定（與 verification/deployment-config.json 相同）；重用共通驗收第 3 步已啟動的 PUBLIC_DEMO 伺服器（同 verification/revamp-v41.capture.config.ts）。
  webServer: {
    command: `NEXT_TELEMETRY_DISABLED=1 npm start -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: true,
    env: { ENABLE_LIVE_AI: "false", APP_MODE: "PUBLIC_DEMO", PUBLIC_DEMO: "true" },
    timeout: 120_000,
  },
});
