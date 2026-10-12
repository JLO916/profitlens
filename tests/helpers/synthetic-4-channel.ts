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

/**
 * V4-7a（D-V4-51（b）＝B）：4 通路合成資料在記憶體裡再拿掉幾列，讓同一檔不同通路的缺列日期重疊（不改、不新增任何資料檔；manifest 不變）。
 * - 通路費用：再缺 DTC 9/16–9/17（落在 LIVE 9/14–9/19 之內）→ 圖上合成一框 9/14–9/19（chart-data-coverage-seg-costs-all-2026-09-14）。
 * - 廣告：再缺 SOCIAL 9/01–9/04（與 LIVE 8/30–9/02 重疊）→ 合成一框 8/30–9/04（chart-data-coverage-seg-ads-all-2026-08-30）；
 *   再缺 SOCIAL 9/23（與 LIVE 9/22 只相鄰、沒有相同的日子）→ 不合，各自一框（ads-LIVE-2026-09-22、ads-SOCIAL-2026-09-23）。
 * 缺列區段（資料表的列）共 6 段：通路費用 DTC 9/16–9/17、LIVE 9/14–9/19；廣告 LIVE 8/30–9/02、LIVE 9/22、SOCIAL 9/01–9/04、SOCIAL 9/23。
 */
export const SYNTHETIC_OVERLAP_DROPS: Readonly<Partial<Record<FileName, readonly string[]>>> = {
  "channel_costs_daily.csv": ["2026-09-16,DTC,", "2026-09-17,DTC,"],
  "ad_spend_daily.csv": ["2026-09-01,SOCIAL,", "2026-09-02,SOCIAL,", "2026-09-03,SOCIAL,", "2026-09-04,SOCIAL,", "2026-09-23,SOCIAL,"],
};
export function synthetic4ChannelOverlapInput(): DatasetInput {
  const input = synthetic4ChannelInput();
  const files = { ...input.files };
  for (const [file, prefixes] of Object.entries(SYNTHETIC_OVERLAP_DROPS) as [FileName, readonly string[]][]) {
    const lines = (files[file] as string).split("\n");
    const kept = lines.filter(line => !prefixes.some(prefix => line.startsWith(prefix)));
    if (lines.length - kept.length !== prefixes.length) throw new Error(`${file}: expected to drop ${prefixes.length} rows, dropped ${lines.length - kept.length}`);
    files[file] = kept.join("\n");
  }
  return { ...input, files };
}
