# Revamp v4 基準報告（V4-0：v3.0.0 的實測值）

> V4-0a 建立（2026-10-08），V4-0b 補記 PPT spike 與設計稿。依據：`docs/revamp-v4/06_BATCHES.md` V4-0a 第 2–12 項與「圖表護欄與棘輪時程」表、`docs/revamp-v4/01_PRD.md` §2.2、§8。本文件寫「V4-0 實測」「V4-0 基準」時，指 V4-0a 在 v3.0.0 程式碼上量到的值；之後各批以這裡的數字為門檻或比對基準。
>
> 第 6–13 節由 V4-0a 主流程在三個代理的 worktree 合併後（合併點 `a00a3c2`），於主 checkout 的同一份 production build 上量測填入（2026-10-08）。

## 1 產生日與基準

| 項目 | 值 |
|---|---|
| 產生日 | 2026-10-08 |
| 基準版本 | tag `v3.0.0`＝commit `625bfa5`（正式站 https://profitlens-tau.vercel.app 為 v3.0.0） |
| 分支 | `revamp/v4`（自 `main`＝`21d621c` 開出，D-V4-2） |
| 開工錨點 | `71b0757`（revamp(V4-0a): 開工——v4 套件、D-V4-1–35 依建議值、CLAUDE.md 換成 v4 版） |
| 程式碼狀態 | V4-0a 不改 `src/` 任何檔案：`git diff --stat 625bfa5 71b0757 -- src` 為空，所以本文件量到的就是 v3.0.0 的畫面與數字 |
| 禁區檢查 | 四條命令與 commit 後的 diff 都為空，記在 `verification/revamp-v4-V4-0a-acceptance.md` §3 |

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
| `verification/revamp-v4/e2e-text-assertions.csv` | 自 v3 版延續 1,231 列（欄位與內容不變），新增最後一欄 `v4_batch`（v4 批次）：依定位器片段判斷會動到它的批次（V4-1 2、V4-2 5、V4-3a 13、V4-3a／V4-7b 4、V4-4 1、V4-5 2、V4-6 4、V4-9a 18、V4-9b 8），判斷不出填「—」（1,174）。各批勾銷時沿用 v3 作法，在 `status` 欄追加「V4-n 核對：…」。主流程合併後補了 12 列 V4-0a 新增的定位器（capture 與 metrics 的 `section.product-highlights`、`main .chart-frame`、`section.scenario-compare`、KPI 與三件事選擇器、`NO_OVERLAY_STYLE`、keyboard-walk 的兩條），共 1,243 列 |
| `docs/revamp-v4/GLOSSARY.md` | v4 名詞表增補（29 列）、指標名對照（取 `metricDefinitions`）、各圖區塊標準名稱、圖型中文寫法、圖表記號用語 |
| `docs/revamp-v4/usability-test.md` | H6 材料：沿用 v3 腳本，加 T1–T4 與 A4 盲評題與答案鍵；答案鍵以暫時的 vitest 驗證（第 10 節紀錄），與 06_BATCHES、PRD §2.2 相同；T2 的最差一天 2026-08-22（−4,510.74）與 32 個虧損日是本次新算出的 |

## 6 chart-lint（CL-1–CL-11）
代理 B 實作 `scripts/lib/chart-scan.mjs`（AST 作法沿用 `ui-scan.mjs`，型別宣告 `chart-scan.d.mts`）、`tests/chart-lint.test.ts`（25 個測試：上限檔格式、v3.0.0 實測、每條規則各一組違規與合規的合成輸入）與 `tests/fixtures/chart-lint-ceiling.json`。

| 規則 | v3.0.0 實測 | 上限（`tests/fixtures/chart-lint-ceiling.json`） | 違規清單 |
|---|---|---|---|
| CL-1 到 CL-11 | 全部 0 | 全部 0 | 無 |

- AST 範圍：`src/components/charts/**`（尚不存在，0 檔）與 `src/components/overview/charts/**`（6 檔：bridge-section、channel-section、chart-frame、profit-section、trend-section、waterfall-svg）；CL-3 的 `var(--chart-` 字串常值掃 `src/components/**` 共 53 個檔，0 筆；`next/dynamic` 延遲載入模組 0 個。
- SSR 範圍：`tests/helpers/page-states.tsx` 的 23 個狀態（七頁與開發者驗證頁）。總覽 4 個狀態的主層 `section.chart-section` 各 4 個（bridge-section、profit-waterfall、trend、channel-mix），其餘頁 0；`chart-` 開頭的 testid 0；`data-chart-kind` 0；含 `-bar-` 片段的 testid 每個總覽狀態 10 個（`profit-waterfall-bar-*`），都在 `aria-hidden` 的 `.chart-frame.waterfall` 內；每個 `chart-section` 的 `aria-describedby` 都指到存在的 id。
- 口徑具體化（後續批次依此判斷）：table 模式＝section 內有不帶 `aria-hidden` 且含 `<table>` 的 `.chart-frame`，或 `data-mode="table"`；CL-9 的主層排除祖先有 `<details>` 或 `hidden` 的 section（試算工作台以 `<div hidden>` 掛在每一頁，它的圖只算在試算頁），上限總覽 4、其他頁 3；CL-2 另斷言 `.chart-frame` 固定高容器內的 testid 以 `chart-` 開頭或屬於既有 12 個圖表 testid 與 `kpi-target-*` 白名單，`{id}` 只允許一段小寫英數、語意 key 可含連字號；CL-10 高度運算式不得有數字常值（`chartHeights.x * 整數` 例外），`ResponsiveContainer` 的 `height="100%"` 允許；CL-8 數值軸的計法：橫向版面數 type 不是 category 的 YAxis，`layout="vertical"` 數 type="number" 的 XAxis；CL-6：Scatter／ScatterChart 只能在 `*-lazy.tsx`，且只以 `dynamic(() => import(...))` 載入；同一條 SSR 違規出現在多個頁面狀態時只算一次。

## 7 testid 三份基準

| 基準 | 列數 | 產生方式 | 刪除數 |
|---|---|---|---|
| `verification/revamp-v3/testids-v2.txt` | 228 | V3-0 | 0 |
| `verification/revamp-v4/testids-v3.txt` | 416（ssr 366、e2e 43、cond 7） | 三步，指令碼 `verification/revamp-v4/make-testids-v3.mjs`：(1) `TESTID_BASELINE_DUMP=<路徑> npx vitest run tests/testid-baseline.test.ts`（SSR 情境加入 `tests/helpers/page-states.tsx` 的整頁狀態後收集 366 個）；(2) `PROFITLENS_PORT=3101 npx playwright test --config verification/revamp-v4.config.ts`（PUBLIC_DEMO production 伺服器在 3101，因為 3100 當時由代理 C 使用；11 passed；`collect-testids.json` 368 個 id，連跑 3 次逐位元相同）；(3) cond：沿用 v2 的 5 列加 V3 新增的 2 列（`diagnosis-count-favorable`、`meeting-compare-different_periods`） | 0 |
| `verification/revamp-v4/testids-v4-added.txt` | 0（只有表頭；欄位 testid、來源、批次、說明） | V4-0a 建立空檔；V4-1 起每批追加，不得與 testids-v3.txt 重複 | 0 |

- `tests/testid-baseline.test.ts` 12 個測試：三份刪除數都是 0；另斷言 v2 每個 id 都在 v3 清單、v4 新增清單不重複 v3。v2 的 228 列全部在 v3 清單內（v3 對 v2 刪除 0）。
- `collect-testids.spec.ts` 拆成 9 段獨立流程（殼層與總覽抽屜、健檢商品資料來源、試算、待辦、會議、列印三種版本、匯入精靈與匯入後、載入中與失敗、本機保存與備份還原），任一段失敗不會丟掉其他段的結果。
- `mounted-testids`：頁面狀態搬到 `tests/helpers/page-states.tsx` 前後都是 44 passed（verbose 名單逐行相同），加 M6 的 `chart-` 唯一性斷言與合成反例後 46 passed；兩個檔各有 V4-1 到 V4-10（含 3a／3b、7a／7b、9a／9b）共 13 個錨點。

## 8 畫面基準 52 張
- 01–09 × 4 尺寸（36 張）：從 `verification/revamp-v3/V3-10/snapshots/` 複製到 `verification/revamp-v4/V4-0a/snapshots/` 後，不帶 `--update-snapshots` 跑 `CAPTURE_BATCH=V4-0a npx playwright test --config verification/revamp-v4.capture.config.ts`：4 個測試通過、**0 張差異**；檔案也與 V3-10 的 36 張逐位元相同（`cmp`）。
- 10 健檢圖區、11 商品圖區、12 匯入精靈步驟 4、13 KPI 帶，各 4 尺寸共 16 張：第一次執行時寫入（12 個測試只因「A snapshot doesn't exist」判失敗），第二次 52 張全部通過（23 passed、5 skipped；skipped 是只在特定尺寸量的 metrics 項）。
- 新基準尺寸（px）：

| 畫面 | desktop | laptop | tablet | mobile |
|---|---|---|---|---|
| 10 健檢圖區（diagnosis-list 下緣到 channel-compare 下緣） | 1172×337 | 1012×337 | 500×338 | 358×526 |
| 11 商品圖區（`section.product-highlights`） | 1172×526 | 1012×526 | 500×1040 | 358×1874 |
| 12 匯入精靈步驟 4（`tests/fixtures/inclusive_tax`） | 910×1479 | 910×1479 | 450×1564 | 324×1648 |
| 13 KPI 帶（讀入 `verification/revamp-v4-capture/targets.csv`：淨營收、扣廣告後貢獻達成，商品毛利落後） | 1172×172 | 1012×172 | 500×358 | 358×408 |

- 10–13 拍攝時以 `stylePath` 套 `NO_OVERLAY_STYLE`（sticky 的 `.topbar`、`.period-bar`、`.wizard-footer` 改 static，手機 `.mobile-tabbar` 隱藏），拍前捲回頂端並把滑鼠移到 (0,0)；01–09 照 v3 拍法不變。

## 9 metrics（B2、B3、B5 硬斷言；B1、B9 只記錄）
量測：`verification/revamp-v4/V4-0a/metrics.json`（`_meta.batch=V4-0a`；PUBLIC_DEMO production；desktop 1440×1000、laptop 1280×900、mobile 390×844 各自的 project）。

| 指標 | 1440 | 1280 | 390 | 門檻 |
|---|---|---|---|---|
| B2 本期一句話頂 | 192 | 192 | 116 | 1440 ≤ 192（通過）；1280 V4-1 起 ≤ 192 |
| B2 KPI 帶底（五格底邊最大值，與 v3 基準 419 同口徑） | 419 | 419 | 555 | 1440、1280 ≤ 420（通過）；`kpi-band` 元素本身的底 420／420／556 只記錄 |
| B2 三件事首列底 | 561 | 583 | 807 | 1440 ≤ 561（通過）；1280 V4-1 起 ≤ 583 |
| B2 扣廣告後貢獻值頂 | 323 | 323 | 295 | 390 ≤ 295（通過） |
| 第一張 KPI 前可見控制項 | 10 | 10 | 3 | 記錄（PRD 上限 10） |
| B3 七頁 scrollWidth | 1440 | 1280 | 390（七頁全部） | 390 ≤ 390（通過） |
| B1 總覽第一張 `.chart-frame` 頂 | 855 | 921 | 1,355 | 只記錄 |
| B1 健檢清單第一列頂／首列 summary 底／首列底（預設展開） | 282／330／888 | 282／330／888 | 241／321／985 | 只記錄 |
| B1 G10 插入處頂（目前 channel-compare 頂） | 2,232 | 2,232 | 2,692 | 只記錄 |
| B1 商品 `section.product-highlights` 頂（v3.0.0 商品頁沒有 `.chart-frame`） | 236 | 236 | 208 | 只記錄 |
| B1 試算 `section.scenario-compare` 頂（剛載入／「維持現況」計算後） | 938／1,114 | 940／1,116 | 1,386／1,562 | 只記錄 |
| B1 資料來源狀態列底 | 214 | 214 | 216 | 只記錄 |
| B8 主層否定句（瀏覽器、示範資料、只算可見文字） | 總覽、健檢、商品、待辦、會議、資料來源各 1；試算 2 | 同 1440 | 試算 1，其餘 0 | 只記錄；1440 的 1 句是期間列常駐的「去年同期不可用」說明，390 收在期間面板裡；SSR 上限見第 4 節 |

B9 七頁 DOM 節點數（載入示範資料後，`document.querySelectorAll('*').length`；V4-1 起硬斷言 ≤ 基準＋1,500）：

| 頁 | 1440 | 1280 | 390 |
|---|---|---|---|
| 總覽 | 3,075 | 3,099 | 3,062 |
| 通路健檢 | 1,324 | 1,324 | 1,324 |
| 商品毛利 | 1,822 | 1,822 | 1,822 |
| 假設試算 | 660 | 660 | 660 |
| 待辦 | 688 | 688 | 688 |
| 會議紀錄 | 998 | 998 | 998 |
| 資料來源 | 1,129 | 1,129 | 1,129 |

## 10 First Load JS 與首載 chunk 清單（B5）

| 項目 | 值 |
|---|---|
| First Load JS gzip | **519,426 bytes**（6 支 modern 腳本，未壓縮 1,767,979 bytes），與 v3.0.0 驗收相同；門檻 ≤ 545,397，通過。含 nomodule 的 polyfills 共 7 支 558,899 bytes（只記錄） |
| 首載 chunk 的 `Treemap`、`Sankey`、`Funnel`、`PieChart`、`RadarChart` | 全部 0（斷言通過）；只記錄的符號：`ScatterChart` 2、`AreaChart` 1、`Brush` 2、`ComposedChart` 1、`LineChart` 2、`BarChart` 2 |
| chunk 清單與各自 gzip 大小 | `verification/revamp-v4/V4-0a/first-load-modules.json`：`4bd1b696-…` 63,370；`794-…` 65,604；`main-app-…` 224；`739-…` 158,845；`app/page-…` 229,536；`webpack-…` 1,847（檔名帶雜湊，每次 build 都變，只供人工比對） |

代理 C 在 worktree 量到 520,213 bytes（多 787 bytes），原因是 worktree 的 `node_modules` 是 symlink，webpack 的 chunk id 跟著變；主 checkout 重建後量到的 519,426 才是基準。

## 11 Lighthouse 8 頁與 390 的五個 TBT
三次都在主 checkout 的 PUBLIC_DEMO production 伺服器上連跑（`scripts/lighthouse-pages.mjs`，Lighthouse 13.5.0；每次開跑前等 1 分鐘負載降到 4 以下）。第 3 次的完整報告在 `verification/revamp-v4/V4-0a/lighthouse/` 與 `metrics.json` 的 `lighthouse` 鍵；第 1、2 次的數值在 `verification/revamp-v4/V4-0a/lighthouse-runs/`。

| 頁面 | 1440 Accessibility | 390 Accessibility | 備註 |
|---|---|---|---|
| 首頁（空狀態）、總覽、健檢、商品、試算、會議、資料來源、待辦 | 8 頁全部 100（三次相同），失敗審核 0 | 8 頁全部 100（三次相同），失敗審核 0 | 新增的資料來源、待辦兩頁基準 100／100 |
| Performance（空狀態首頁 navigation） | 100（三次相同） | 94（三次相同） | 只反映首載 bundle；其他步驟是 timespan 或 snapshot，沒有 0–100 分數 |

| 390 timespan | 第 1 次 TBT | 第 2 次 | 第 3 次 | 中位數（V4-1 起門檻＝max(中位數 × 1.1, 中位數＋50 ms)，D-V4-36） |
|---|---|---|---|---|
| 載入示範資料 | 1,008.3 | 965.9 | 1,159.7 | **1,008.3** |
| 切到通路健檢 | 751.8 | 756.6 | 760.8 | **756.6** |
| 切到商品毛利 | 77.0 | 79.9 | 89.3 | **79.9** |
| 切到會議紀錄 | 973.8 | 965.7 | 978.7 | **973.8** |
| 切到資料來源 | 0 | 3.6 | 0 | **0**（門檻見下方 D-V4-36） |

- 開跑前與結束時的 loadavg（1／5／15 分鐘）：第 1 次 3.66、5.26、5.35 到 3.22、4.80、5.17；第 2 次 3.12、4.75、5.15 到 3.33、4.50、5.02；第 3 次 3.22、4.45、5.00 到 3.83、4.32、4.91。
- 1440 的 TBT 中位數（只記錄）：載入示範資料 119.2、切到通路健檢 147.4、商品 0、試算 0、會議 209.1、資料來源 0、待辦 0。
- CLS（三次相同）：390 的「切到商品毛利」0.054、「切到資料來源」0.054、「切到待辦」0.053，1440 的「切到待辦」0.053；超過 PRD B4 的 CLS < 0.05，屬 v3.0.0 既有行為（V3-10 的 390 商品毛利也是 0.054），記為已知差距，不在 V4-0a 修。
- **門檻下限（D-V4-36＝A，使用者 2026-10-08 拍板）**：資料來源的基準中位數是 0，單用「中位數 × 1.1」會變成 0，第 2 次的 3.6 ms 這種雜訊就會判失敗。門檻改為 max(中位數 × 1.1, 中位數＋50 ms)：載入示範資料 1,109.1、切到通路健檢 832.3、切到商品毛利 129.9、切到會議紀錄 1,071.2、切到資料來源 50.0 ms。

## 12 axe／keyboard-walk／network-log

| 項目 | 檔案 | 摘要 |
|---|---|---|
| axe 四尺寸（desktop、laptop、tablet 各 11 個狀態、mobile 10 個） | `verification/revamp-v4/V4-0a/axe.json` | serious 0、critical 0、moderate 0、minor 0（四尺寸都是） |
| keyboard-walk（各頁里程碑 Tab 數；`[aria-hidden=true]` 內停留點） | `verification/revamp-v4/V4-0a/keyboard-walk.json` | 里程碑 Tab 數（desktop／mobile）：總覽第一張 KPI 11／4；健檢第一列 8／2；最差商品 9／3、商品表第一列 57／51；試算基準 11／5、範本 16／10、「試算」按鈕 30／24；待辦 12／6；會議議程 1 26／19；資料來源 10／4。main 內停留點：總覽 90／77、健檢 69／59、商品 378／372、試算 34／28、待辦 13／7、會議 47／40、資料來源 25／19。`aria-hidden` 內停留點：desktop 0；**mobile 2（v3.0.0 既有）**：總覽 G1、G2 瀑布外框 `div.chart-frame.waterfall`（bridge-section、profit-waterfall），390 寬時外框是水平捲動容器，Chromium 讓可捲動容器可聚焦，而外框帶 `aria-hidden`。axe 的 aria-hidden-focus 不計這種隱含可聚焦，所以 V3-10 沒抓到。依「上限＝實測並逐條列出」寫進 spec 的 `KNOWN_ARIA_HIDDEN_STOPS`，排在 V4-1 修正（`06_BATCHES.md` V4-1 段）。§11.1 只用鍵盤的流程 0。Esc 回焦：抽屜、匯出選單、投影模式都正常 |
| network-log（下載集合、POST） | `verification/revamp-v4/V4-0a/network-log.json` | desktop、mobile 各 15 個請求（首頁 10、載入示範資料 1、分析 CSV 2、PPT 2）；外部來源 0、非 GET 0、CSV 內容外洩 0、失敗資源 0、console 錯誤 0；`/api/insights` GET 200（available=false、DISABLED，E2E 用 LOCAL 伺服器）；下載：分析 CSV、Excel、PPT、決策 JSON、備份都成功 |

## 13 contrast 試算（`--red-100` 與 PRD §6.5 新 token；只算不宣告）

用 `scripts/contrast-check.mjs` 的同一套 `readRootTokens`／`resolveColor`／`contrastRatio`（比值無條件捨去到小數兩位）試算；`:root` 與 `contrast-check.mjs` 都沒有改。結果由代理 C 在 worktree 算出（與 `:root` 無關，主 checkout 相同）。

新 token（PRD §6.5）：

| token | 值 | hex | 對 --bg-surface（白） | 對 --bg-subtle（#f1f3f3） |
|---|---|---|---|---|
| --chart-target | var(--text-primary) | #1b2426 | 15.82 | 14.20 |
| --chart-seg-1 | var(--gray-700) | #4a5558 | 7.68 | 6.90 |
| --chart-seg-2 | var(--gray-500) | #5f6a6d | 5.57 | 5.00 |
| --chart-seg-3 | var(--gray-400) | #7f898b | 3.58 | 3.22 |
| --chart-heat-1（底色） | var(--unfavorable-subtle)＝--red-50 | #fbeeec | 1.13 | 1.01 |
| --chart-missing | var(--gray-400) | #7f898b | 3.58 | 3.22 |

- 相鄰段：seg-1 對 seg-2 1.37、seg-2 對 seg-3 1.55、seg-1 對 seg-3 2.14（依 D-V4-19 靠 1px 分隔線）。
- 熱表階 1（--red-50）上的文字：--text-primary 13.97、--text-secondary 6.78、--text-tertiary 4.91、--unfavorable 5.31。
- --chart-unfavorable（2px 框線）：對白 6.01、對 --bg-subtle 5.40、對 --red-50 5.31；--chart-missing 對 --red-50 3.16。
- PRD §6.5 寫的 15.83、7.69、3.59、1.38、6.02 是四捨五入值；contrast-check 無條件捨去，所以是 15.82、7.68、3.58、1.37、6.01。都沒有跨過門檻。

--red-100 候選（白與 --red-600 #b03a2e 在 sRGB 內插，t＝--red-600 的比例；--red-50 大約落在 t≈0.05–0.09）：

| t | hex | --text-primary 文字 | --text-secondary 文字 | --unfavorable 文字 | 底對白 | 底對 --bg-subtle | 對 --red-50 對比 | 對 --red-50 ΔE2000 | --chart-unfavorable 框線對候選底 |
|---|---|---|---|---|---|---|---|---|---|
| 0.12 | #f6e7e6 | 13.18 | 6.40 | 5.01 | 1.20 | 1.07 | 1.06 | 1.7 | 5.01 |
| 0.15 | #f3e1e0 | 12.55 | 6.09 | 4.77 | 1.26 | 1.13 | 1.11 | 3.3 | 4.77 |
| 0.18 | #f1dcd9 | 12.04 | 5.85 | 4.57 | 1.31 | 1.17 | 1.16 | 4.7 | 4.57 |
| 0.20 | #efd8d5 | 11.64 | 5.65 | 4.42 | 1.35 | 1.22 | 1.19 | 5.7 | 4.42 |
| 0.22 | #eed4d1 | 11.28 | 5.48 | 4.28 | 1.40 | 1.25 | 1.23 | 7.0 | 4.28 |
| 0.25 | #ebcecb | 10.71 | 5.20 | 4.07 | 1.47 | 1.32 | 1.30 | 8.6 | 4.07 |
| 0.28 | #e9c8c4 | 10.19 | 4.95 | 3.87 | 1.55 | 1.39 | 1.37 | 10.3 | 3.87 |
| 0.30 | #e7c4c0 | 9.83 | 4.77 | 3.73 | 1.60 | 1.44 | 1.42 | 11.4 | 3.73 |
| 0.33 | #e5beba | 9.34 | 4.54 | 3.55 | 1.69 | 1.51 | 1.49 | 13.1 | 3.55 |
| 0.36 | #e3b8b4 | 8.87 | 4.31 | 3.37 | 1.78 | 1.60 | 1.57 | 14.7 | 3.37 |
| 0.40 | #dfb0ab | 8.24 | 4.00 | 3.13 | 1.92 | 1.72 | 1.69 | 16.8 | 3.13 |

參考：--red-50 對白的 ΔE2000 6.4、對 --bg-subtle 6.8。表內所有候選的 --text-primary 都 ≥ 4.5；--text-secondary 在 t ≤ 0.33 時 ≥ 4.5；--unfavorable 文字在 t ≤ 0.18 時 ≥ 4.5；框線對候選底在 t ≤ 0.40 時都 ≥ 3。是否「肉眼可分」只附 ΔE2000 參考，不下結論。

## 14 V4-0b 補記（PPT spike 與設計稿）

（待 V4-0b）

- PPT 原生瀑布 spike（D-V4-10、D-V4-34 兩種版面的試排）：（待 V4-0b）
- 4 通路合成資料手算值摘要（D-V4-31）：（待 V4-0b）
- H5 設計稿實測（G11 在 390 的格寬、768 與 1280 每列月曆張數、`formatHeatCell` 放不放得下、G20 的缺列虛線框與去年同期細線分不分得出來）：（待 V4-0b）
