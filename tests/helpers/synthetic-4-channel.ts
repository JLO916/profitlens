import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DatasetInput, FileName } from "@/domain/types";

// V4-0b（D-V4-31）4 通路合成資料的載入 helper。資料放在 tests/fixtures/synthetic-4-channel/（不在 fixtures/ 禁區），
// 只供單元測試、E2E 與視覺驗收，不進產品示範。設計說明與手算摘要見該目錄的 README.md。
// 這個檔只用 node 內建模組與 `import type`，所以 Node 的 type stripping 也能直接 import（不必經過 vitest 的路徑別名）。

/** 資料目錄（以目前工作目錄為準，與 tests/helpers/fixtures.ts、E2E 的 resolve("tests/fixtures/…") 相同）。 */
export const SYNTHETIC_4_CHANNEL_DIR = resolve("tests", "fixtures", "synthetic-4-channel");
export const SYNTHETIC_4_CHANNEL_FILES: FileName[] = ["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"];

/** 讀 manifest 與三份 CSV 原文，交給 validateDataset／hashInput 使用。 */
export function synthetic4ChannelInput(): DatasetInput {
  return {
    manifest: JSON.parse(readFileSync(resolve(SYNTHETIC_4_CHANNEL_DIR, "manifest.json"), "utf8")),
    files: Object.fromEntries(SYNTHETIC_4_CHANNEL_FILES.map(file => [file, readFileSync(resolve(SYNTHETIC_4_CHANNEL_DIR, file), "utf8")])),
  };
}
