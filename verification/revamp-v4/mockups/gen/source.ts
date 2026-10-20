import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type NameResolver } from "@/application/channel-settings";
import { snapshotResolver } from "@/application/copy";
import { parseTargets, type TargetSet } from "@/application/targets";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import { validateDataset } from "@/domain/validation";
import type { Dataset, DatasetInput, FileName } from "@/domain/types";

// H5 設計稿的資料來源（V4-0b 第 3 項）：只讀 repo 內既有的檔案，經 domain 的 validateDataset 與 application 的 createSnapshot 算出快照；
// 設計稿上的數字一律從這裡取，不手打。新增資料來源（例如 tests/fixtures/synthetic-4-channel/ 的 4 通路合成資料）時，在 SOURCES 加一筆即可。

export const CSV_FILES: readonly FileName[] = ["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"];

export interface SourceSpec {
  /** 代號（寫進 mockup-data.json 與頁面標示）。 */
  id: string;
  /** 頁面標示用的資料來源說明（例如「示範資料（fixtures/demo）」）。 */
  label: string;
  /** 相對 repo 根目錄的資料夾，內含 manifest.json 與三份 CSV。 */
  dir: string;
  /** 選填：目標檔（targets.csv 格式），給 KPI 帶的目標細條（G5）用。 */
  targetsFile?: string;
  /** 選填：畫面上當作經匯入精靈匯入（prepareImport 會把 source_type 改成 user_provided，頂欄與資料狀態一行寫「本機匯入」）；沒給時寫「示範資料」。 */
  imported?: boolean;
}

export interface MockupSource {
  spec: SourceSpec;
  input: DatasetInput;
  dataset: Dataset;
  snapshot: WorkspaceSnapshot;
  /** 通路名稱解析器（V42-1a 起 copy.ts 只收解析器）：示範資料套用通路別名（官網 · DTC、平台 · MARKETPLACE），其他資料集維持代碼；輸出與 v4 的 boolean 路徑逐字相同。 */
  alias: NameResolver;
  targets: TargetSet | null;
}

/** 設計稿用到的資料來源：示範資料（總覽、健檢、商品頁示範狀態）與 4 通路合成資料（商品頁合成狀態、資料來源頁；D-V4-31，V4-0b 代理 B 建立）。 */
export const SOURCES = {
  demo: { id: "demo", label: "示範資料（fixtures/demo）", dir: "fixtures/demo", targetsFile: "verification/revamp-v4-capture/targets.csv" },
  synthetic: { id: "synthetic", label: "4 通路合成資料（tests/fixtures/synthetic-4-channel）", dir: "tests/fixtures/synthetic-4-channel", imported: true },
} satisfies Record<string, SourceSpec>;

export async function loadSource(spec: SourceSpec): Promise<MockupSource> {
  const root = resolve(spec.dir);
  const input: DatasetInput = {
    manifest: JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8")),
    files: Object.fromEntries(CSV_FILES.map(file => [file, readFileSync(resolve(root, file), "utf8")])),
  };
  const result = validateDataset(input);
  if (result.dataset === null) throw new Error(`設計稿資料來源 ${spec.id} 未通過檢核`);
  const dataset = result.dataset;
  const snapshot = await createSnapshot(dataset, {}, await hashInput(input));
  let targets: TargetSet | null = null;
  if (spec.targetsFile) {
    const bytes = new Uint8Array(readFileSync(resolve(spec.targetsFile)));
    targets = parseTargets({ name: "targets.csv", bytes }, dataset.manifest.channels).set;
  }
  return { spec, input, dataset, snapshot, alias: snapshotResolver(snapshot), targets };
}
