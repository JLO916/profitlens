# Revamp v4 基準報告（V4-0：v3.0.0 的實測值）

> V4-0a 建立（2026-10-08），V4-0b 補記 PPT spike 與設計稿。依據：`docs/revamp-v4/06_BATCHES.md` V4-0a 第 2–12 項與「圖表護欄與棘輪時程」表、`docs/revamp-v4/01_PRD.md` §2.2、§8。本文件寫「V4-0 實測」「V4-0 基準」時，指 V4-0a 在 v3.0.0 程式碼上量到的值；之後各批以這裡的數字為門檻或比對基準。
>
> 標「（待 V4-0a 合併後量測）」的章節由 V4-0a 主流程在三個代理的 worktree 合併後，於同一份 build 上量測並填入；填入前不可引用為基準。

## 1 產生日與基準

| 項目 | 值 |
|---|---|
| 產生日 | 2026-10-08 |
| 基準版本 | tag `v3.0.0`＝commit `625bfa5`（正式站 https://profitlens-tau.vercel.app 為 v3.0.0） |
| 分支 | `revamp/v4`（自 `main`＝`21d621c` 開出，D-V4-2） |
| 開工錨點 | `71b0757`（revamp(V4-0a): 開工——v4 套件、D-V4-1–35 依建議值、CLAUDE.md 換成 v4 版） |
| 程式碼狀態 | V4-0a 不改 `src/` 任何檔案：`git diff --stat 625bfa5 71b0757 -- src` 為空，所以本文件量到的就是 v3.0.0 的畫面與數字 |
| 禁區檢查 | 四條命令與 commit 後的 diff 寫在 `verification/revamp-v4-V4-0a-acceptance.md`（待 V4-0a 合併後量測） |

## 2 labels 快照（`verification/revamp-v4/labels-v3.flat.json`）

| 項目 | 值 |
|---|---|
| 葉節點數 | **2,581**（與 06_BATCHES、PRD §8.5 的預期相同） |
| 組成 | v2 來的字串經 `tests/fixtures/labels-legacy-map.json` 對到的 2,094 個，加上 V3-3 起 V3 錨點下的 487 個 |
| 各分組 | actions 122、assist 37、brand 4、data 101、diagnosis 47、empty 19、errors 85、events 23、evidence 76、exports 276、format 28、glossary 220、importWizard 242、meeting 258、metrics 100、overview 227、products 108、relaunch 3、rules 32、scenarios 189、shell 265、storage 66、summary 19、targets 34（共 24 組＝`LABEL_GROUPS`） |
| 格式 | `{ "點分路徑": "字串" }`；鍵依 UTF-16 碼位排序（`Array.prototype.sort` 預設比較），2 空格縮排，檔尾一個換行；陣列元素以索引為路徑段（例如 `importWizard.steps.0`），與 `scripts/lib/copy-scan.mjs` 的 `labelEntries` 相同 |
| sha256 | `e63808f5db854256372bc5bfd4c1b70a31aca177536185d12b6e4e53c722f4a0` |
| 護欄 | `tests/labels-structure.test.ts` 新增 describe「V4-0a labels 護欄」：快照 2,581 個鍵且已排序；每個鍵都還在、字串逐字相同；快照以外的新葉節點只能在 `V4_NEW_KEY_PREFIXES`（11 個：`overview.`、`diagnosis.`、`products.`、`scenarios.`、`actions.`、`meeting.`、`data.`、`importWizard.`、`evidence.`、`exports.`、`shell.` 各加 `chartsV4.`）下；V3 與 V4 前綴不重疊。既有測試 (ii) 的「新鍵」判斷改為 V3 或 V4 清單任一符合 |

產生方式（在 worktree 根目錄執行一次；labels 由 `scripts/lib/load-labels.mjs` 以 typescript 轉譯 `src/i18n/labels.zh-TW.ts` 後載入，`labelEntries` 走訪全部字串葉節點）：

```bash
node --input-type=module -e '
import { writeFileSync } from "node:fs";
import { loadLabels } from "./scripts/lib/load-labels.mjs";
import { labelEntries } from "./scripts/lib/copy-scan.mjs";
const entries = labelEntries(await loadLabels()).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
const flat = Object.fromEntries(entries);
if (Object.keys(flat).length !== entries.length) throw new Error("duplicate path");
writeFileSync("verification/revamp-v4/labels-v3.flat.json", JSON.stringify(flat, null, 2) + "\n");
console.log(entries.length);
'
# 輸出：2581
```

`tests/labels-structure.test.ts` 另以 vitest 從 `@/i18n` 匯入的 `labels` 逐鍵比對同一份快照（兩種載入方式結果相同，測試通過）。

## 3 copy-style 與 copy-scan

| 項目 | 值 |
|---|---|
| copy-scan 改動 | `L1_KEY_PATTERNS` 加 `^[^.]+\.chartsV4\.[^.]+\.title(\.\|$)`；新增 `SCOPED_BLACKLIST`：「賠錢」「虧損」只在 `products.chartsV4.*` 計入 `blacklistSynonym`（不放進全站的 `BLACKLIST`，因為「虧損」在 `format.turnedLoss` 等既有字串是正確用詞，`tests/data-workspace-v3.test.tsx` 也直接拿 `BLACKLIST` 掃新鍵） |
| 改前改後的計數 | 完全相同：noticePrefix 0、noticeAnywhere 0、arrows 0、circledNumbers 0、decorativeChars 0、exclamations 0、emoji 0、allCaps 0、pipes 0、blacklistSynonym 12、blacklistJargon 0、blacklistTone 0、blacklistEmotion 0、placeholderMalformed 0、placeholderVariantMismatch 0、l1ClauseOverLimit 0；逐筆 details 也相同（以 `git show HEAD:scripts/lib/copy-scan.mjs` 的舊版與新版對同一份 labels 各掃一次比對） |
| 上限檔 | `tests/fixtures/copy-style-ceiling.json` 不動（同義詞 12、其餘 0） |
| 新規則的合成測試 | `tests/copy-style.test.ts`「V4-0a：…」：`chartsV4.<圖>.title` 與 `title.<情境>` 的長子句計入、`subtitle` 與 `table.title` 不計（2 筆）；`products.chartsV4.*` 的「賠錢」「虧損」計入 4 筆，`technical` 子樹、`products.sections.*`、`format.*` 不計 |

## 4 copy-density 七頁實測（B8 基準）

量法沿用 `tests/copy-density.test.ts` 的 V3 作法：golden 資料、SSR、`withoutDetails` 拿掉收合的 `<details>`、含「不是／不代表／不等於／不可」的句子、規則卡注意句不計、重複句只算一次。上限＝下表實測值（`DENSITY_CEILINGS`），之後只降不升；另斷言每個上限 ≤ V3 的 3。

| 頁面 | 狀態 | 元件 | 實測句數 | 上限 | 句子 |
|---|---|---|---|---|---|
| 經營總覽 | golden | `Overview` | 0 | 0 | — |
| 通路健檢 | golden | `Diagnosis` | 0 | 0 | — |
| 假設試算 | golden，空的試算工作區 | `DecisionWorkbench` | 1 | 1 | 「我了解這是試算，不是預測」（聲明勾選的文字） |
| 會議紀錄 | 草稿＋1 筆已結束會議 | `MeetingPage` | 0 | 0 | — |
| 資料來源 | golden | `DataWorkspace` | 0 | 0 | — |
| 資料來源 | `errors/missing_cogs`（有問題表） | `DataWorkspace` | 0 | 0 | — |
| 商品毛利（V4-0a 新增） | golden | `ProductComparisonPanel` | 0 | 0 | — |
| 待辦（V4-0a 新增） | 看板，沒有待辦 | `ActionsWorkbench` | 0 | 0 | — |
| 待辦（V4-0a 新增） | 看板，兩張卡（健檢帶入且置頂進行中、手動草稿） | `ActionsWorkbench` | 0 | 0 | — |
| 待辦（V4-0a 新增） | 清單，同兩張卡 | `ActionsWorkbench` | 0 | 0 | — |

`tests/copy-density.test.ts` 由 7 個測試變 10 個（加上限檢查、商品、待辦），全部通過。`metrics.spec` 另在瀏覽器量各頁主層否定句數（06_BATCHES V4-0a 第 9 項「記錄」），結果寫在第 8 節。

## 5 V4-0a 產出的清單

| 檔案 | 內容 |
|---|---|
| `verification/revamp-v4/feature-retention.csv` | 表頭 `id,feature,page,v3_location,v4_location,change_type,locator,batch,status,covering_tests`；148 列＝v3 的 113 列（id 保留；`v3_location` 取 v3 表的同名欄，即 v3.0.0 的位置；`v4_location` 寫「不變」或計畫位置；`batch` 寫會動到它的 V4 批次，沒有寫「—」）＋35 列新增：G1–G24（G7 分 a、b，G15 另有會議實例 G15m，G18 取消不列）、MV1–MV6（橋接表移到 aside、前 10 名表改放 after、問題表加篩選、`ladderMetrics` 修正與搬移、投影白名單）、EX1–EX4（PDF、PPT、Excel、Markdown 的新增內容）。`status` 全部空白。v3 原文的 4 處呼叫鏈箭頭改寫成「呼叫」、1 處下拉符號改寫成「下拉」。`batch` 欄以「／」列出多批時，每一批結束都要在 `status` 記一次核對；V4-11 全表打勾。LF 行尾 |
| `verification/revamp-v4/e2e-text-assertions.csv` | 自 v3 版延續 1,231 列（欄位與內容不變），新增最後一欄 `v4_batch`（v4 批次）：依定位器片段判斷會動到它的批次（V4-1 2、V4-2 5、V4-3a 13、V4-3a／V4-7b 4、V4-4 1、V4-5 2、V4-6 4、V4-9a 18、V4-9b 8），判斷不出填「—」（1,174）。各批勾銷時沿用 v3 作法，在 `status` 欄追加「V4-n 核對：…」。商品圖區的 `section.product-highlights` 定位器由主流程合併後補一列 |
| `docs/revamp-v4/GLOSSARY.md` | v4 名詞表增補（29 列）、指標名對照（取 `metricDefinitions`）、各圖區塊標準名稱、圖型中文寫法、圖表記號用語 |
| `docs/revamp-v4/usability-test.md` | H6 材料：沿用 v3 腳本，加 T1–T4 與 A4 盲評題與答案鍵；答案鍵以暫時的 vitest 驗證（第 10 節紀錄），與 06_BATCHES、PRD §2.2 相同；T2 的最差一天 2026-08-22（−4,510.74）與 32 個虧損日是本次新算出的 |

## 6 chart-lint（CL-1–CL-11）

（待 V4-0a 合併後量測）

| 規則 | v3.0.0 實測 | 上限（`tests/fixtures/chart-lint-ceiling.json`） | 違規清單 |
|---|---|---|---|
| CL-1 到 CL-11 | （待 V4-0a 合併後量測） | （待 V4-0a 合併後量測） | （待 V4-0a 合併後量測） |

## 7 testid 三份基準

（待 V4-0a 合併後量測）

| 基準 | 列數 | 產生方式 | 刪除數 |
|---|---|---|---|
| `verification/revamp-v3/testids-v2.txt` | 228 | V3-0 | （待 V4-0a 合併後量測） |
| `verification/revamp-v4/testids-v3.txt` | （待 V4-0a 合併後量測） | 三步：`TESTID_BASELINE_DUMP` 的 ssr 列、`npx playwright test --config verification/revamp-v4.config.ts` 收集的 e2e 列、cond 列 | （待 V4-0a 合併後量測） |
| `verification/revamp-v4/testids-v4-added.txt` | 0（只有表頭） | V4-0a 建立空檔 | （待 V4-0a 合併後量測） |

## 8 畫面基準 52 張

（待 V4-0a 合併後量測）

- 01–09 × 4 尺寸（36 張）與 `verification/revamp-v3/V3-10/snapshots/` 的差異：（待 V4-0a 合併後量測）
- 10 健檢圖區、11 商品圖區、12 匯入精靈步驟 4（各 4 尺寸）與 13 KPI 帶元素截圖（4 尺寸）共 16 張：（待 V4-0a 合併後量測）

## 9 metrics（B2、B3、B5 硬斷言；B1、B9 只記錄）

（待 V4-0a 合併後量測）

| 指標 | 1440 | 1280 | 390 | 門檻 |
|---|---|---|---|---|
| B2 本期一句話頂 | （待 V4-0a 合併後量測） | （待 V4-0a 合併後量測） | — | 1440 ≤ 192；1280 不晚於本欄實測 |
| B2 KPI 帶底 | （待 V4-0a 合併後量測） | （待 V4-0a 合併後量測） | — | ≤ 420 |
| B2 三件事首列底 | （待 V4-0a 合併後量測） | （待 V4-0a 合併後量測） | — | 1440 ≤ 561；1280 不晚於本欄實測 |
| B2 扣廣告後貢獻值頂 | — | — | （待 V4-0a 合併後量測） | ≤ 295 |
| B3 七頁 scrollWidth | — | — | （待 V4-0a 合併後量測） | ≤ 390 |
| B1 參考位置（總覽第一張 `.chart-frame` 頂、健檢清單第一列頂與 G10 插入處頂、試算方案比較表區塊頂、資料來源狀態列底）、健檢首列底 | （待 V4-0a 合併後量測） | — | — | 只記錄 |
| B8 各頁主層否定句數（瀏覽器） | （待 V4-0a 合併後量測） | — | （待 V4-0a 合併後量測） | 只記錄；SSR 上限見第 4 節 |
| B9 七頁 DOM 節點數（載入示範資料後） | （待 V4-0a 合併後量測） | — | （待 V4-0a 合併後量測） | V4-1 起 ≤ 基準＋1,500 |

## 10 First Load JS 與首載 chunk 清單（B5）

（待 V4-0a 合併後量測）

| 項目 | 值 |
|---|---|
| First Load JS gzip | （待 V4-0a 合併後量測；v3.0.0 驗收為 519,426 bytes，門檻 ≤ 545,397） |
| 首載 chunk 的 `Treemap`、`Sankey`、`Funnel`、`PieChart`、`RadarChart` | （待 V4-0a 合併後量測；預期 0） |
| chunk 清單與各自 gzip 大小 | `verification/revamp-v4/V4-0a/first-load-modules.json`（待 V4-0a 合併後量測） |

## 11 Lighthouse 8 頁與 390 的五個 TBT

（待 V4-0a 合併後量測）

| 頁面 | 1440 Accessibility | 390 Accessibility | 備註 |
|---|---|---|---|
| 首頁（空狀態）、總覽、健檢、商品、試算、會議、資料來源、待辦 | （待 V4-0a 合併後量測） | （待 V4-0a 合併後量測） | Performance 分數只來自空狀態首頁（navigation），只反映首載 bundle |

| 390 timespan | 第 1 次 TBT／loadavg | 第 2 次 | 第 3 次 | 中位數 |
|---|---|---|---|---|
| 載入示範資料 | （待 V4-0a 合併後量測） | | | |
| 切到通路健檢 | （待 V4-0a 合併後量測） | | | |
| 切到商品毛利 | （待 V4-0a 合併後量測） | | | |
| 切到會議紀錄 | （待 V4-0a 合併後量測） | | | |
| 切到資料來源 | （待 V4-0a 合併後量測） | | | |

## 12 axe／keyboard-walk／network-log

（待 V4-0a 合併後量測）

| 項目 | 檔案 | 摘要 |
|---|---|---|
| axe 四尺寸（desktop、laptop、tablet 各 11 個狀態、mobile 10 個） | `verification/revamp-v4/V4-0a/axe.json` | （待 V4-0a 合併後量測） |
| keyboard-walk（各頁里程碑 Tab 數；`[aria-hidden=true]` 內停留點） | `verification/revamp-v4/V4-0a/keyboard-walk.json` | （待 V4-0a 合併後量測） |
| network-log（下載集合、POST） | `verification/revamp-v4/V4-0a/network-log.json` | （待 V4-0a 合併後量測） |

## 13 contrast 試算（`--red-100` 與 PRD §6.5 新 token；只算不宣告）

（待 V4-0a 合併後量測）

## 14 V4-0b 補記（PPT spike 與設計稿）

（待 V4-0b）

- PPT 原生瀑布 spike（D-V4-10、D-V4-34 兩種版面的試排）：（待 V4-0b）
- 4 通路合成資料手算值摘要（D-V4-31）：（待 V4-0b）
- H5 設計稿實測（G11 在 390 的格寬、768 與 1280 每列月曆張數、`formatHeatCell` 放不放得下、G20 的缺列虛線框與去年同期細線分不分得出來）：（待 V4-0b）
