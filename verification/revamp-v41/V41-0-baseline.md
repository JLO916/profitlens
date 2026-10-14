# EC ProfitLens v4.1 基準報告（V41-0：v4.0.0＋O3 的實測值）

> V41-0 建立（2026-10-14）。依據：`docs/revamp-v4.1/06_BATCHES.md` V41-0 第 2–8 項與「護欄與棘輪時程」表、`docs/revamp-v4.1/00_README.md`「驗收產物」。本文件寫「V41-0 實測」「V41-0 基準」時，指 V41-0 在 v4.0.0 程式碼加 O3（`next`、`eslint-config-next` 16.3.8）上量到的值；之後各批以這裡的數字為門檻或比對基準。
>
> **草稿狀態**：第 1–7 節由實作代理填寫（靜態掃描、清單、`npm audit`、build 產物的首載試算）。第 8 節的瀏覽器量測（畫面基準 52 張、`metrics.spec` 的 First Load 與 DOM 節點、390 五個 TBT、8 頁 Lighthouse、axe、keyboard-walk、network-log）由主流程跑共通驗收後填入；填入前一律是「未執行」。

## 1 產生日與基準

| 項目 | 值 |
|---|---|
| 產生日 | 2026-10-14 |
| 基準版本 | tag `v4.0.0`＝commit `872662d`（正式站 https://profitlens-tau.vercel.app 是 v4.0.0） |
| 分支 | `revamp/v4.1`（D-V41-2，預設沿用；不 push） |
| 開工錨點 | `39892a2`（plan(v4.1): 拍板——D-V41-1–24 全部依建議值；CLAUDE.md 換成 v4.1 版；V41-0 開工） |
| 程式碼狀態 | V41-0 不改 `src/` 任何檔案（`git diff --stat 872662d -- src` 為空）；只改 `package.json`、`package-lock.json`（O3）與掃描器、測試、量測腳本、清單 |

## 2 O3 與 `npm audit`（D-V41-15＝A）

### 2.1 升級

| 步驟 | 結果 |
|---|---|
| `npm view next@16.3.8 version` | `16.3.8`（存在） |
| `npm view eslint-config-next@16.3.8 version` | `16.3.8`（存在） |
| `npm install --save-exact next@16.3.8 eslint-config-next@16.3.8` | `package.json` 兩行版號；`package-lock.json` 只動 `next`、`@next/env`、`@next/swc-*`（8 個平台套件）、`eslint-config-next`、`@next/eslint-plugin-next` 的版號與 integrity（48 行增、48 行刪），沒有新增或移除任何套件 |
| `npm ci` | 成功；`npx next --version` 為 `Next.js v16.3.8` |
| `npm run typecheck`、`npm run lint`、`npm test -- --run`、`npm run build` | 全部通過（實作代理 2026-10-14；`npm test` 164 檔、3,387 個測試全過，比 V4-11 的 3,379 多 8 個，都是本批新增的護欄測試）。E2E 與畫面基準由主流程驗收（第 8 節） |
| 回退 | 不需要（沒有任何檢查因升級失敗） |

### 2.2 `npm audit --json > verification/revamp-v41/V41-0/npm-audit.json`

升級前（v4.0.0）10 個 high；升級後 9 個 high（`next` 的 6 筆公告全部消失），low、moderate、critical 都是 0。逐項評估（沿用 R6 的判斷方式：本站只用寫出 API、不解析使用者的圖片或試算表，或只在開發時使用）：

| 套件（直接依賴） | 公告 | 範圍與修正 | 本站的使用方式與評估 | 處理 |
|---|---|---|---|---|
| `next` | GHSA-cjq9-62q9-8jv4（high，Image Optimization SSRF）、GHSA-4jqv-mc3x-m676、GHSA-mcj8-r9mp-w47p（moderate，SSG／ISR 快取汙染）、GHSA-3w37-wq28-93x7（moderate，`use cache` 與 Draft Mode）、GHSA-f87g-xv8r-7p7x（moderate，metadata 圖片路由）、GHSA-39w2-rjm5-chcv（low，開發伺服器 MCP 端點） | `<16.3.8`；16.3.8 修正 | 本站沒用 `next/image`、`use cache`、ISR、metadata 圖片路由，實際影響低；O3 升到 16.3.8 後已不在報告中 | **已修（O3）** |
| `xlsx@0.18.5` | GHSA-4r6h-8v6p-xvw6（high，prototype pollution）、GHSA-5pgg-2g8v-p4x9（high，ReDoS） | npm 上沒有修正版（`fixAvailable: false`） | 只在匯出時動態 import，用寫出 API 產生活頁簿；`src/application/excel-export.ts` 的 `CFB.read` 只讀本程式剛寫出的位元組（加表頭樣式），不解析使用者上傳的試算表 | 沿用 R6 評估，不處理 |
| `pptxgenjs@4.0.1` → `image-size@1.2.1` | GHSA-5p2g-fcmc-qvqq、GHSA-w3rx-r6r6-pgpr（high，JXL／HEIF／ICNS 解析 DoS） | 修正是降到 `pptxgenjs@4.0.0`（主版號變動，`isSemVerMajor: true`） | PPT 只用 `addChart`、`addShape`、文字，不用任何圖片 API（`src/application/pptx-export.ts:18`），不會呼叫 `image-size` | 沿用 R6 評估，不處理 |
| `eslint-config-next@16.3.8` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces@3.0.3` | GHSA-vfj7-8cjw-p6xm（high，深層巢狀樣式的堆疊耗盡） | 修正是降到 `eslint-config-next@14.2.35`（主版號降版） | 只在開發時跑 eslint，樣式來自 repo 自己的設定，不處理使用者輸入；不進 production bundle | 沿用 R6 評估，不處理 |
| `source-map-js@1.2.1`（傳遞依賴：`postcss@8.5.28`、`next` 內的 `postcss@8.5.23`、`@tailwindcss/node@4.3.3`） | GHSA-68fv-2mgg-jv7q（high，indexed source map 的 section offset 造成事件迴圈 DoS） | `>=1.0.0 <1.2.2`；`1.2.2`（2026-09-30 發布）是非破壞性修正 | 只在 build 時由 PostCSS／Tailwind 處理 repo 自己的 CSS 與 source map，不解析使用者提供的 source map；`next start` 執行期不處理 CSS。實際影響低 | **需使用者同意（未套用）**：修正只動 lockfile（`source-map-js` 1.2.1 → 1.2.2），依 CLAUDE.md「其他依賴變動（含只動 lockfile 的傳遞依賴，例如 `source-map-js`）一律先問」。`npm audit fix --dry-run` 顯示它還會順帶移除 4 個 optional 套件（`@tybys/wasm-util`、`@napi-rs/wasm-runtime`、`@emnapi/wasi-threads`、`@emnapi/core`），範圍超過這一筆；同意後建議只更新 `source-map-js` 一項並確認 lockfile diff 只有它，再跑全套驗收 |

`npm audit fix --dry-run` 只用來評估，沒有改動 `package-lock.json` 或 `node_modules`（執行前後 `cmp` 相同，`node_modules/source-map-js` 仍是 1.2.1）。

## 3 labels 快照（`verification/revamp-v41/labels-v4.flat.json`）

| 項目 | 值 |
|---|---|
| 葉節點數 | **2,839**（與 06_BATCHES 起草時的試數相同） |
| 來源 | `src/i18n/labels.zh-TW.ts`，與 `872662d` 逐位元組相同（sha256 `9708d24dc699ad655d778152de204c7857d89bbc77663c73ef3ad323735ea385`，`git show 872662d:src/i18n/labels.zh-TW.ts` 同值） |
| 各分組 | actions 127、assist 37、brand 4、data 142、diagnosis 102、empty 19、errors 85、events 23、evidence 82、exports 292、format 28、glossary 220、importWizard 243、meeting 291、metrics 100、overview 260、products 144、relaunch 3、rules 32、scenarios 216、shell 270、storage 66、summary 19、targets 34（共 24 組＝`LABEL_GROUPS`） |
| 格式 | 同 `verification/revamp-v4/labels-v3.flat.json`：`{ "點分路徑": "字串" }`；鍵依 UTF-16 碼位排序，2 空格縮排，檔尾一個換行；陣列元素以索引為路徑段 |
| sha256 | `fbf66bf312ecc77e6007ed7ebd6a80367d46ca22e33e5d06ccb1985aa4c30d08` |
| 與 v3 快照 | v3 快照的 2,581 個鍵都在、字串逐字相同（新增 258 個都是 v4 `chartsV4` 錨點下的鍵） |

產生方式（在 repo 根目錄執行一次；與 V4-0a 相同，只換輸出路徑）：

```bash
node --input-type=module -e '
import { writeFileSync } from "node:fs";
import { loadLabels } from "./scripts/lib/load-labels.mjs";
import { labelEntries } from "./scripts/lib/copy-scan.mjs";
const entries = labelEntries(await loadLabels()).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
const flat = Object.fromEntries(entries);
if (Object.keys(flat).length !== entries.length) throw new Error("duplicate path");
writeFileSync("verification/revamp-v41/labels-v4.flat.json", JSON.stringify(flat, null, 2) + "\n");
console.log(entries.length);
'
# 輸出：2839
```

護欄（`tests/labels-structure.test.ts`）：
- 新增 `V41_NEW_KEY_PREFIXES = ["guide.", "shell.guideV41."]` 與 describe「V41-0 labels 護欄」4 個測試：快照 2,839 個鍵且已排序、涵蓋 v3 快照且字串相同、快照裡沒有 V41 前綴的鍵、V41 前綴與 V3、V4 前綴不重疊；快照每個鍵都還在、字串逐字相同；`labels.zh-TW.ts` 快照以外的新葉節點只能在 `shell.guideV41.` 下，`LABEL_GROUPS` 維持 24 組、沒有 `guide`；`src/i18n/guide.zh-TW.ts` 存在時（V41-1 起）`guideLabels` 頂層只有 `guide`、葉節點全部在 `guide.` 下。
- 既有測試 (ii)「新鍵」判斷與 V4-0a 的「快照以外的新葉節點」都改成也接受 V41 前綴（否則 V41-1 加 `shell.guideV41.*` 時會失敗）。
- 本批沒有新增任何 key、沒有建 `src/i18n/guide.zh-TW.ts`。guide 檔存在時的分支以暫時檔驗證過（頂層只有 `guide` 時通過、多一個頂層鍵時失敗），驗證後刪除。

## 4 掃描規則（copy-scan、ui-audit、ui-scan、labels-coverage）

| 檔案 | 改動 | 對既有字串與檔案的結果 |
|---|---|---|
| `scripts/lib/copy-scan.mjs` | `{ui:路徑}`（`UI_REF_RE`）當占位符：L1 不計字、黑名單比對前拿掉、不算占位符格式錯誤、不列入占位符變體一致性；`L1_KEY_PATTERNS` 加 `^guide\.areas\.[^.]+\.title$`、`^guide\.areas\.[^.]+\.steps\.[^.]+\.title$`（`guide.sections.*` 已由既有的 `^[^.]+\.sections\.[^.]+$` 涵蓋）；`SCOPED_BLACKLIST` 加 `guide.*` 範圍的最高級 `/唯一\|最好\|最快\|最佳\|最強\|第一名\|業界第一/`（計入 blacklistTone；不擋「第一次」「第一項」）；`scanLabels(labels, meta, extra)` 可以多收一個 view（`guideLabels`），同一套規則、指標相加，頂層鍵與 labels 重複時丟錯 | 16 項指標改前改後完全相同（同義詞 12、其餘 0）；`tests/fixtures/copy-style-ceiling.json` 不動 |
| `scripts/lib/load-labels.mjs` | 新增 `loadGuideLabels()`：`src/i18n/guide.zh-TW.ts` 不存在時回傳 null；存在時轉譯載入，`./labels.zh-TW`、`@/i18n/labels.zh-TW` 的 import 換成同一份 labels（D-V41-12 允許 guide 檔 import labels 解析 `{ui:…}`） | 本批 guide 檔不存在，回傳 null |
| `scripts/ui-audit.mjs` | labels 範圍同步涵蓋 `guideLabels`（存在時一起掃）；`scope.tsx` 加 `src/app/**/*.tsx` | design 15 項與 copy 16 項指標改前改後相同；`filesScanned.tsx` 78 → 80 |
| `scripts/lib/ui-scan.mjs` | `SCAN_SCOPE.appDir = "src/app"`，tsx 範圍（design-lint、ui-audit 共用）加 `src/app` 下所有 `.tsx` | `src/app/layout.tsx`、`src/app/page.tsx` 兩檔的 15 種觀察值全部 0；`tests/fixtures/design-lint-ceiling.json` 不變（hex 0、圓角 4、字級 11、字距 0、箭頭 3、其餘 0） |
| `tests/labels-coverage.test.ts` | 「元件 JSX 與字串常值沒有 CJK」斷言加 `src/app/**/*.tsx` | `src/app` 2 個 `.tsx` 實測 0 |
| `tests/copy-style.test.ts` | 新增 1 個合成輸入測試：`{ui:…}` 的四種處理、`guide.areas` 兩種標題計入 L1、`guide.*` 最高級 4 筆（「第一次」「第一項」與 `guide.*` 以外的「最好」不算）、額外 view 指標相加、頂層重複丟錯 | 通過 |

## 5 testid 四份基準

| 基準 | 列數 | 刪除數 |
|---|---|---|
| `verification/revamp-v3/testids-v2.txt` | 228 | 0 |
| `verification/revamp-v4/testids-v3.txt` | 416 | 0 |
| `verification/revamp-v4/testids-v4-added.txt` | 343 | 0 |
| `verification/revamp-v41/testids-v41-added.txt`（V41-0 新增） | 0（只有表頭；格式同 v4 新增清單：testid、來源、批次、說明；批次欄 V41-1 到 V41-5，可帶 a／b） | 0 |

`tests/testid-baseline.test.ts` 改成比四份（15 個測試全過）：每份的格式、ssr 列都在 SSR markup、e2e／cond 列原始碼仍會產生；另斷言 v41 新增清單不重複 v3 與 v4 新增清單。

## 6 功能保留與 E2E 文字斷言

| 檔案 | 內容 |
|---|---|
| `verification/revamp-v41/feature-retention.csv` | 表頭 `id,feature,page,v3_location,v4_location,v41_location,change_type,locator,batch,status,covering_tests`（比 v4 多 `v41_location`）；177 列＝v4 的 155 列（`id`、`feature`、`page`、`v3_location`、`v4_location`、`change_type`、`locator`、`covering_tests` 原樣）＋v4.1 新增 22 列。沿用的 150 列 `v41_location`「不變」、`batch`「—」、`status`「v4.0.0 已核對；v4.1 未改動（covering_tests 全過）」，不逐列重新核對。會受 V41-1 入口影響的殼層列 2（側欄與手機底部分頁列）、3（手機「更多」面板）、6（側欄註記）、7（頁尾）、21（空狀態）的 `batch` 標 V41-1、`status` 空白。O2 修到的頁的列在 V41-4 開工時標 V41-4。新增列：GE1–GE4 入口（側欄、更多、首頁空狀態、頁尾；V41-1）、GH1 說明首頁（V41-1）、GA1–GA11 功能區頁（start、import、overview、diagnosis、products 為 V41-2a；scenarios、actions、meeting、data、evidence、export 為 V41-2b）、O1、O2（V41-4）、O3（V41-0）、GV1–GV3 示範影片（V41-3）；新增列 `status` 空白。LF 行尾 |
| `verification/revamp-v41/e2e-text-assertions.csv` | 自 `verification/revamp-v4/e2e-text-assertions.csv` 延續 1,431 列（既有欄位與內容逐字不變），新增最後一欄 `v41_batch`，全部填「—」；之後批次新增或改動的定位器在這一欄填 V41-n |

O3 列（`batch`＝V41-0）在主流程跑完 E2E 與畫面基準（52 張 0 差異）後打勾。

## 7 First Load JS（build 產物試算；正式值以第 8 節的 `metrics.spec` 為準）

實作代理在 `NEXT_TELEMETRY_DISABLED=1 npm run build` 之後，用 `metrics.spec` 的同一口徑（HTML 中 `<script src>` 指向 `/_next/static/` 的檔案去重、排除 nomodule、Node `gzipSync` 預設等級）直接讀 `.next/server/app/*.html` 與 `.next/static/` 試算，沒有啟動伺服器：

| 頁 | modern 腳本 | 未壓縮 | gzip | 說明 |
|---|---|---|---|---|
| `/`（`.next/server/app/index.html`） | 6 | 1,722,059 | **519,427** | v4.0.0（V4-11）519,322；O3 後 `794-*.js`（檔名雜湊改變）gzip 65,691 → 65,796，多 105 bytes；其餘 5 支 modern 腳本與 nomodule 的 polyfills，檔名與 gzip 都與 V4-11 相同。B5 門檻 545,397 通過 |
| 404 頁＝框架基準（`.next/server/app/_not-found.html`） | 4 | 447,068 | **131,465** | `4bd1b696-*`、`794-*`、`main-app-*`、`webpack-*`；nomodule 的 polyfills 39,473 另計 |

`verification/revamp-v4-capture/metrics.spec.ts` 的改動：常數 `V41_HOME_FIRST_LOAD_BASELINE = 519_427`、`V41_HOME_FIRST_LOAD_ALLOWANCE = 1_024`（V41-1 起門檻 520,451；V41-0 只記錄在 `metrics.json` 的 `v41.homeFirstLoad`，不斷言）；新增測試「V41-0 框架基準」請求 `/v41-framework-baseline-404`（狀態 404），記錄在 `metrics.json` 的 `v41.frameworkBaseline` 與 `first-load-modules.json` 的 `frameworkBaseline`（V41-1 起說明頁 ≤ 框架基準＋5,120；V41-0 不斷言）；B5 的量測迴圈抽成共用的 `firstLoadScripts()`，輸出不變；`METRICS_OUT`、`FIRST_LOAD_MODULES_OUT` 沿用既有的環境變數。**主流程跑 capture 後要核對 `firstLoadJs.gzipBytes` 是否等於 519,427；不同時以實測值改常數並在驗收文件說明。**

## 8 瀏覽器量測（主流程，2026-10-14，程式 `4a2ed79`）

| 項目 | 結果 | 證據 |
|---|---|---|
| 完整 E2E（帶三個 `*_OUT`） | **1,067 passed、0 failed、25 skipped（35.4 分鐘）**，與 V4-11 相同；跑完已還原 E2E 改寫的追蹤檔 | `axe.json`、`keyboard-walk.json`、`network-log.json` |
| 畫面基準 52 張 | 不帶 `--update-snapshots`：24 passed、8 skipped（新增的 404 量測算 1 個 passed），52 張與 V4-11 逐位元組相同 | `snapshots/` |
| `/` 的 First Load JS | **519,427 bytes gzip**（V4-11 為 519,322，多 105，來自 Next.js 16.3.8）；V41-1 起門檻 520,451 | `metrics.json` 的 `v41.homeFirstLoad` |
| 404 頁的 First Load（框架基準） | 131,465 bytes gzip，4 個腳本；`/v41-framework-baseline-404` 回 404 | `metrics.json` 的 `v41.frameworkBaseline` |
| B2 首屏 | 1440：一句話頂 168、KPI 帶底 396、三件事首列底 537；390：扣廣告後貢獻值頂 295 | `metrics.json` |
| B9 1440 DOM 節點 | 總覽 3,325、健檢 2,174、商品 2,510、試算 683、待辦 711、會議 1,064、資料來源 1,209，與 V4-11 相同 | `metrics.json` |
| 390 TBT（三次，開跑時 1 分鐘負載 3.49、2.39、2.47） | 中位數都低於門檻：載入示範資料 1,079.0（門檻 1,109.1）、健檢 821.8（832.3）、商品 99.8（129.9）、會議 1,029.4（1,071.2）、資料來源 17.3（50.0） | `lighthouse/`、`lighthouse-runs/` |
| Lighthouse | a11y 全部 100（1440、390 各 8 頁 × 3 次）；Performance 1440 為 100，390 為 94–97；`insideTimespans` 都是空的 | 同上 |
| axe 四尺寸 | 23／23／23／21 個狀態，全部 0 問題 | `axe.json` |
| keyboard-walk | 除了 `checked_at` 與 V4-11 相同 | `keyboard-walk.json` |
| network-log | 下載集合與位元組都與 V4-11 相同，`checks` 相同 | `network-log.json` |
| audit:ui、contrast | hex 0、字級種類 11、JSX 中文 0；contrast 85／85 | `ui-audit.json` |
