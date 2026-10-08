import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// H5 設計稿產生器專用的 vitest 設定（V4-0b 第 3 項）。
// 根目錄 vitest.config.mts 的 include 只有 src/** 與 tests/** 的 *.test.*，所以預設的 `npm test` 不會跑到這裡的 *.mockup.ts；
// 只有明確指定本設定檔才會執行，且產生器另以環境變數 MOCKUP_WRITE=1 守門，沒給時只計算與自我檢查、不寫檔。
const root = fileURLToPath(new URL("../../../../", import.meta.url));

export default defineConfig({
  root,
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../../../../src", import.meta.url)),
      "server-only": fileURLToPath(new URL("../../../../node_modules/next/dist/compiled/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["verification/revamp-v4/mockups/gen/**/*.mockup.ts"],
    testTimeout: 120_000,
  },
});
