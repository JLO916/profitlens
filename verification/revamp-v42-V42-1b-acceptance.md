# v4.2 V42-1b 驗收：通路設定編輯器、Excel 對照列與 E2E（2026-10-27）

使用者 2026-10-27 回覆「開始動工」。基準 v4.1.3＝tag `v4.1.3`＝`3bb1924`；開工錨點 `d588788`（06 與 00_README 進度改進行中）；程式 `637323a`（代理 A `37f5a33`、B `7073074`、C `bf0fe2b`，整合 `74edece`，審查修正 `637323a`）；收尾 commit `e34d8bf` 只加文件（含 `verification/revamp-v42/feature-retention.csv` 的 7 列核對註記）、證據、畫面基準、`metrics.spec.ts` 的 `V42_SPLIT_SENTINELS` 與 `src/i18n/guide.zh-TW.ts` 的一行「── V42-1b 錨點」註解。拍板依 `docs/revamp-v4.2/09_DECISIONS_PENDING.md`：D-V42-8＝A（資料來源頁）、D-V42-13＝A（示範資料的隱含預設不寫進設定）、D-V42-15＝A（Excel 只加對照列）。D-V42-1 的補充問題（是否已匯入過自己的多通路資料）仍沒有回覆，不擋本批。

工作流（ultracode）：A 編輯器與 dashboard 接線、B Excel 對照列並行；C（頁面狀態、M1、E2E 四尺寸、畫面基準 17、keyboard-walk 里程碑、testid 清單）接在 A 之後；E 整合（三次 `--no-ff`，0 衝突）；R1（規格、拍板、labels、CSS、邊界）與 R2（行為、a11y、測試，在 3106 埠的 scratch 伺服器實測）兩個審查；F 修正 6 件 major。所有代理都在 `.claude/worktrees/` 的分離 worktree，主檢出以 `--ff-only` 併入後移除。

## 1. 完成項目（對照 `docs/revamp-v4.2/06_BATCHES.md` V42-1b）

| 項目 | 狀態 | 內容 |
|---|---|---|
| 1 編輯器（D-V42-8） | 完成 | `src/components/data/channel-settings-editor.tsx`（`"use client"`，151 行）：資料來源頁 `DataWorkspace` 在「範圍與金額基準」之後、「本次匯入的前處理」之前渲染收合的 `<details class="panel data-section channel-settings" data-testid="channel-settings">`（summary 內是區段 h2，與「版本與來源資訊」同款）；每個 manifest 通路一列 `channel-settings-row-{code}`（通路代碼、顯示名稱、群組 `<select>`、順序 `type=number step=1`），群組區每個群組一列 `channel-settings-group-{groupId}`（名稱、成員），按鈕「新增群組」「套用設定」，「要注意」`<details>` 放「顯示名稱只改畫面；CSV、備份與 AI 用的仍是通路代碼。」。草稿只在元件 state；按「套用設定」才以 `validateChannelSettings` 驗證（四條規則、NFC 不重複含隱含預設、順序整數、有成員的群組要有名稱；不修剪、問題逐句列在 `<div role="alert">` 的清單），通過後 `normalizeChannelSettings`（與預設無差回 `null`）→ `onApply` → `dashboard.tsx` 的 `applyChannelSettings` 以 `{ ...active.snapshot.report.scope }` 走既有 `applyFilters(filters, settings)` 重算快照並寫進 `Active.channel_settings`（`filter_hash` 不變、`revision` 不動、`markChanged`）。空白的顯示名稱＝畫面顯示通路代碼（示範資料寫成 `label＝代碼`）。群組 id `g{n}` 同一工作階段不重用；沒有成員的群組套用時去掉（提示句）。由 `DataWorkspace` 靜態匯入、留在 `workspace-panels` chunk；`/` 首載 `"channel-settings"` 0 次 |
| 2 Excel 對照列（D-V42-15） | 完成 | `src/application/excel-export.ts`：`ExcelExportInput` 加選填 `channelSettings`（只用來排序）；「指標定義」工作表技術細節（時區列）之後、「圖表資料」版本列之前加「通路設定」區（標題列、欄名列、每個通路一列：代碼、顯示名稱、群組或「未分組」），只在快照帶 `channel_names`／`channel_groups` 且 `spec.appendix.technical`（標準版）時出現；客戶版不列（C34 的做法）；沒有設定時工作表逐位元組不變；人讀欄位走既有 `FORMULA_PREFIX` 跳脫（`=`、`+`、`-`、`@` 開頭）。`dashboard.tsx` 與 `meeting-page.tsx` 的 `exportExcel` 各傳 `channel_settings` 一行 |
| 3 頁面狀態、M1、E2E、keyboard-walk | 完成 | `tests/helpers/page-states.tsx`：`SYNTHETIC_CHANNEL_SETTINGS`（自有＝DTC＋SOCIAL、平台＝MARKETPLACE＋LIVE）與狀態 `data-channel-settings`；`tests/mounted-testids.test.tsx` 兩個 M1 測試（收合內容保持掛載、四個 row 與兩個 group 都在）；`tests/e2e/channel-settings.spec.ts` 四尺寸 × 3 案例（A 設定名稱與群組→總覽與健檢出現顯示名稱、`filter_hash` 不變；B 下載備份→`payload.channel_settings` 只含改動欄位→還原後名稱與群組仍在，含規則錯誤的 axe 0 serious 與 201 字名稱不橫向捲動；C 以 `page.clock` 固定時間驗證重算期間打的字不被蓋掉、空群組套用後立刻去掉）；`tests/e2e/keyboard-walk.spec.ts` 加「通路設定 summary」里程碑（desktop 12、mobile 6，aria-hidden 停留點 0）；`verification/revamp-v4-capture/baseline.spec.ts` 加畫面 17（編輯器展開的元素截圖）；`testids-v42-added.txt` 加 `channel-settings`、`channel-settings-row-DTC`、`channel-settings-row-MARKETPLACE`、`channel-settings-group-g1` |
| 4 說明頁 | 完成（0 差異） | 資料來源頁被拍到的說明媒體（start-period、data-scope、data-coverage、data-issues、data-preview）都是元素裁切，`GUIDE_MEDIA=check` 47／47 0 差異，不需要 `write`；新步驟文字留到 V42-5（`guide.zh-TW.ts` 只加「── V42-1b 錨點」註解） |

**labels**：`data.channelSettingsV42.*`（`labels.zh-TW.ts:2271` 錨點；標題、引言、四個欄名、三句 aria、「未分組」、群組區五句、兩顆按鈕、兩句提示、四句規則、「已套用通路設定。」、「要注意」兩句）與 `exports.v42.channelSettings.*`（`:3008` 錨點；標題、三個欄名、「未分組」）；既有字串逐字不變（labels-structure 三份快照 2,581／2,839／3,163 通過）；全部陳述句、沒有問號、驚嘆號、箭頭、「注意：」；JSX 無中文（audit:ui 0）。`globals.css:3158–3187` 的 `.channel-settings*` 只用既有 token，字級只用 `--text-12／13／14`，≤ 767 每列直向堆疊。

## 2. 驗收命令與結果（程式 `637323a`；收尾 commit 只加文件、證據、畫面基準、`metrics.spec.ts` 的 sentinel 與 `guide.zh-TW.ts` 的一行錨點註解）

| 命令 | 結果 |
|---|---|
| `npm run typecheck`、`npm run lint` | exit 0（lint 0 warnings） |
| `npm run audit:ui -- --json verification/revamp-v42/V42-1b/ui-audit.json` | hex 0、字級 11（不變）、箭頭 3（不變）、JSX 中文 0、元件字串常值中文 0、「注意：」0；copy 16 項與 V42-1a 相同（blacklistSynonym 12） |
| `npm run contrast-check` | 85／85 |
| `npm test -- --run` | 程式 `637323a` 的全量共跑五次：16:03（1 分鐘負載 13–31）10 檔 11 個逾時、19 個 skipped（`scratchpad/vitest-full.log`）；16:09 1 個逾時（`chart-meeting.test.ts` 5 s；`scratchpad/vitest-full-2.log`）；16:16 1 個逾時（`excel-export.test.ts` G8 案例 5 s，單跑 42／42 通過）；16:17 **173 檔、3,655 個全過**（76 s；只在工作階段紀錄，沒有存檔）；收尾時 19:56 再跑一次並存檔 `verification/revamp-v42/V42-1b/vitest.log`：**173 檔、3,655 個全過**（59.65 s，開跑 1 分鐘負載 12.5）。逾時都是主機高負載下的 5 s 預設逾時，沒有斷言失敗。比 v4.1.3 多 1 檔 19 個：`channel-settings-editor` 12、`excel-export` ＋5、`mounted-testids` ＋2（M1） |
| `npm run build` | exit 0（LOCAL 與 PUBLIC_DEMO 各一次） |
| `npm run test:e2e`（帶 `NETWORK_LOG_OUT`、`KEYBOARD_WALK_OUT`、`AXE_OUT`） | **1,155 passed、0 failed、29 skipped（40.8 分鐘）**；比 V42-1a 多 12＝`channel-settings.spec.ts` 3 案例 × 4 尺寸；跑完已還原 E2E 改寫的追蹤檔 |
| `CAPTURE_BATCH=V42-1b`（基準自 V42-G1 複製 64 張，不帶 `--update-snapshots`） | 第一次 8 failed＝**09 資料來源 × 4 有差異**（1440 高 2,271→2,373 px，只多一行收合 summary、下方內容下移）＋**17 × 4 不存在（寫入）**，其餘 60 張 0 差異；`--update-snapshots=changed` 更新 09 後重跑 **42 passed、0 failed、14 skipped**，68 張 0 差異 |
| `GUIDE_MEDIA=check` | 47／47（44 張截圖＋15 個影片 cue），0 差異 |
| launch-check（本機 PUBLIC_DEMO） | 13 項全部通過，補充 19 項全部通過 |
| Lighthouse × 3 | 390 TBT 三次中位數 1,221.8／936.6／118.1／1,212.2／36.3（開跑 1 分鐘負載 5.3–6.6，等 < 2.5 三次都沒等到）：商品毛利、資料來源在門檻內，載入示範資料、通路健檢、會議紀錄超過；依 D-V4-47＝B 與 v4.1.3 同場成對 6 對，五項的成對差平均都是負的（−149.5／−8.4／−8.2／−43.7／−7.5；商品毛利的中位數 120.0 對 119.8 高 0.2 ms，仍在門檻 129.9 內），五項都符合 D-V4-47＝B 的比較規則；前一批同場也超過門檻，但 B 的開跑負載 < 3.0 沒達到，**低負載三次待補**（下方）；工作台 a11y 全 100；首頁 390 Performance 92–96；說明頁 a11y、SEO 100、Performance 98–100 |
| 禁區與邊界五條 | 都是空的（commit 前後各跑一次；收尾 commit `e34d8bf`：`git diff --stat 625bfa5 e34d8bf -- src/domain fixtures docs/METRICS.md src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts` 與 `git diff --stat 872662d e34d8bf -- src/app/api vercel.json src/application/analytics.ts` 都為空；寫入本行 hash 的下一個 commit 只改這一行與 STATUS、DECISIONS、06 的 hash，對同樣路徑的 diff 也為空）；`copy.ts`、`workspace.ts`、`workspace-backup.ts`、`evidence-ladder.ts`、`manager-summary.ts`、`targets.ts`、`channel-settings.ts`、`package.json`、lockfile 對錨點 `d588788` 的 diff 都為空 |
| `git diff --stat --diff-filter=A d588788 HEAD -- src/application tests` | `tests/channel-settings-editor.test.tsx`（231 行）、`tests/e2e/channel-settings.spec.ts`（223 行）；`src/application` 沒有新檔（新元件在 `src/components/data/`） |

**量測**：

- **First Load JS**：`/` 是 **522,168**（V42-1a／V42-G1 521,487，**+681**；V42-0 519,705，+2,463；門檻 527,897，`v42.homeFirstLoad.asserted` 為真）。差額組成（`first-load-modules.json` 逐 chunk 比對）：`app/page` chunk +686（新字串 `data.channelSettingsV42.*` 24 條與 `exports.v42.channelSettings.*` 5 條、`dashboard.tsx` 的 `applyChannelSettings` 與 `applyFilters` 的第 2 個參數）、`webpack` −5；其餘 4 個 chunk 0；首載 chunk 數不變（6 個 modern）。`SPLIT_SENTINELS` 8 個、本批打開的 `"channel-settings"`、`GUIDE_SENTINELS` 2 個都 0 次（`tests/lazy-panels.test.tsx` 另從模組圖反向檢查 `channel-settings-editor.tsx` 不在 `/` 首載）。
- **說明頁 First Load**：`/guide` 131,461（−5 bytes，webpack runtime；門檻 136,585）；11 個功能區頁同。
- **DOM 節點（B9）**：資料來源 **1,270／1,270／1,267**（1440／1280／390；V42-1a 1,221／1,221／1,218，+49＝編輯器收合時的 49 個節點；上限 2,629）；其餘六頁與 V42-1a 完全相同（1440 總覽 3,337、健檢 2,186、商品 2,522、試算 695、待辦 723、會議 1,076）。
- **axe**：28／28／28／26 個狀態，全部 0 問題（規則錯誤狀態另由 `channel-settings.spec.ts` 案例 B 在四尺寸斷言 0 serious／critical）。
- **network-log**：下載集合 5 種（analysis_csv、excel、pptx、decision_json、backup）、非 GET 0、外部來源 0；**keyboard-walk** 資料來源頁里程碑 desktop 10／11／12、mobile 4／5／6，aria-hidden 停留點 0，其餘頁與 V42-1a 相同。
- **AI 快照負載不含名稱**：`tests/ai-snapshot-channel-names.test.ts` 通過（本批沒有改 AI 路徑）。
- **testid 刪除數**：五份（v2、v3、v4 added、v41 added、v42 added）都 0；`testids-v42-added.txt` 加 4 列（批次 V42-1b）。
- **棘輪**：`design-lint`、`copy-style`、`copy-density`、`chart-lint` 的數值常數本批沒有動（四個測試檔 0 diff），全部通過；`LABEL_GROUPS` 24。

**Lighthouse × 3（正式腳本，`scripts/lighthouse-pages.mjs`）**：每次開跑前等 1 分鐘負載 < 2.5，最多 30 分鐘；三次都沒有等到（開跑時 1 分鐘負載 6.60、5.28、5.30，5 分鐘 8.77、5.25、5.43；負載來自這台機器上使用者自己的 Chrome、Claude 桌面程式與 WindowServer，不是本 session 的程序），所以三次都在高負載下量：

| 步驟（390 TBT，ms） | 第 1 次 | 第 2 次 | 第 3 次 | 中位數 | 門檻 | V42-0 | V42-G1 |
|---|---|---|---|---|---|---|---|
| 載入示範資料 | 1,221.8 | 1,239.9 | 1,177.7 | **1,221.8** | 1,109.1 | 1,029.4 | 1,016.9 |
| 通路健檢 | 936.6 | 1,001.5 | 891.1 | **936.6** | 832.3 | 791.5 | 783.9 |
| 商品毛利 | 126.5 | 118.1 | 108.7 | 118.1 | 129.9 | 89.1 | 87.0 |
| 會議紀錄 | 1,219.1 | 1,147.3 | 1,212.2 | **1,212.2** | 1,071.2 | 983.0 | 963.5 |
| 資料來源 | 59.1 | 32.5 | 36.3 | 36.3 | 50.0 | 12.6 | 12.8 |

商品毛利與資料來源在門檻內；載入示範資料、通路健檢、會議紀錄的中位數超過門檻 112.7、104.3、141.0 ms。本批的程式改動在資料來源頁（收合區）、Excel 匯出與 dashboard 的設定傳遞，這三步的頁面程式與 v4.1.3 相同；五項都比 V42-G1 高（載入示範資料 +20%、通路健檢 +20%、商品毛利 +36%、會議紀錄 +26%、資料來源 +23.5 ms），型態與 V4-8b、V4-10 驗收時的主機雜訊相同。

**依 D-V4-47＝B 同場成對對照**：V42-1b（`637323a`，主流程的 PUBLIC_DEMO 建置，3100）對前一批＝v4.1.3＝錨點 `d588788`（`git archive` 另建於 scratch，`node_modules` 以符號連結共用，3101），交替 6 對（奇數對先量 V42-1b、偶數對先量 v4.1.3），每次開跑前等 1 分鐘負載 < 3.0 最多 120 秒，十二次都沒有等到（開跑 1 分鐘負載 4.1–8.2、5 分鐘 5.3–7.1）。紀錄、摘要與每次的 metrics 在 `verification/revamp-v42/V42-1b/lighthouse-ab/`（`drive.log`、`summary.txt`、`p{1..6}-{v421b,v413}-metrics.json`）。

| 步驟（390 TBT，ms） | V42-1b 中位數 | v4.1.3 中位數 | 門檻 | 成對差平均（本批−前一批） | 成對差中位數 | 本批較高的對數 | 結果 |
|---|---|---|---|---|---|---|---|
| 載入示範資料 | 1,219.0 | 1,386.0 | 1,109.1 | −149.5 | −139.9 | 0／6 | 比較規則通過（≤ 前一批＋10 且成對差平均 ≤ ＋10） |
| 通路健檢 | 928.7 | 949.5 | 832.3 | −8.4 | −23.6 | 2／6 | 比較規則通過 |
| 商品毛利 | 120.0 | 119.8 | 129.9 | −8.2 | −11.1 | 2／6 | 通過（低於門檻） |
| 會議紀錄 | 1,159.6 | 1,220.2 | 1,071.2 | −43.7 | −95.3 | 2／6 | 比較規則通過 |
| 資料來源 | 46.1 | 52.4 | 50.0 | −7.5 | −0.9 | 3／6 | 通過（低於門檻） |

前一批在同場的三項中位數（1,386.0、949.5、1,220.2）也超過門檻，兩批十二次的 `insideTimespans` 都是空的、a11y 都 100，所以超過門檻的是當天的主機負載，不是本批的程式。載入示範資料六對都是本批較低（差 60–279 ms），兩個伺服器的差別只有建置目錄與啟動時間，原因沒有再查，不影響判定。**判定**：五項都符合 D-V4-47＝B 的比較規則，但 B 規定的開跑負載 < 3.0 整晚都沒有達到，所以本列記為「成對對照通過；低負載三次待補」：V42-2a 開工前（最晚 V42-6 上線前）在 1 分鐘負載 < 2.5 時再跑正式腳本三次，確認五項回到 V42-0 的水準，結果補進本文件與 `docs/STATUS.md`。不擋批次，不擋 H8。

**Lighthouse 其他項目**：工作台首頁 navigation 與七個 snapshot 的 Accessibility 三次、兩個視口都 100；首頁 Performance 1440 是 100、99、100，390 是 92、94、96；說明頁 `/guide` 與 `/guide/overview` 的 Accessibility、SEO 三次都 100，Performance 1440 都 100、390 是 98、98、98 與 98、98、99；CLS 0；LCP 1440 約 0.51–0.53 秒、390 2.1–2.5 秒（與 V42-G1 相同）；lazy chunk 數 10，`insideTimespans` 三次兩視口都空。證據：`lighthouse-runs/run1`、`run2` 是第 1、2 次的 metrics，`metrics.json` 的 `lighthouse` 區段與 `lighthouse/` 是第 3 次。

**B 級對帳與備份矩陣**：本批沒有 B 級函式（群組合計在 V42-2b）；備份矩陣（`BACKUP_MATRIX_OUT=verification/revamp-v42/V42-1b/backup-matrix.json`）17 列 v1 到 v5 golden／demo 全部還原、帶設定的列往返相等、`dropped` 都是空；E2E 案例 B 另以瀏覽器驗證編輯器寫入的設定往返（`payload.channel_settings` 只含改動欄位：DTC 顯示名稱、MARKETPLACE 顯示名稱、群組 g1 與成員）。

## 3. 畫面基準

基準自 `verification/revamp-v42/V42-G1/snapshots/` 複製，`CAPTURE_BATCH=V42-1b` 不帶 `--update-snapshots` 跑一次：只有「允許變動畫面」有差異——09 資料來源 × 4（收合 summary 多一行，1440 高 +102 px；差異圖與實際圖在 `verification/revamp-v42/V42-1b/screens/09-data-*.png`）、新 17 通路設定編輯器展開 × 4（元素截圖，`17-channel-settings-*.png`）；其餘 60 張 0 差異（含 12 匯入精靈第 4 步：精靈不渲染 `DataWorkspace`）。更新後重跑 68 張 0 差異。

瀏覽器驗收：四尺寸的 09 與 17 截圖在 `verification/revamp-v42/V42-1b/screens/`（desktop 1440、laptop 1280、tablet 768、mobile 390）；R2 另在 1440、1280、390 以 Playwright 手動走查（預設收合、Tab 順序 summary→DTC 三欄→MARKETPLACE 三欄→新增群組→套用設定→要注意、每個控制項有可及名稱、錯誤清單在按鈕之後的閱讀順序、390 收合／展開／有群組／有錯誤都沒有橫向捲動、套用前後 `filter_hash` 相同）。

## 4. 邊界檔的 diff 範圍

本批沒有改任何邊界檔：`src/application/copy.ts`、`workspace.ts`、`workspace-backup.ts`、`evidence-ladder.ts`、`manager-summary.ts`、`targets.ts`、`channel-settings.ts` 對錨點 `d588788` 的 diff 都為空。`src/` 改到的檔：`components/data/channel-settings-editor.tsx`（新）、`components/workspace-panels.tsx`（+7／−2：靜態匯入、兩個選填 prop、在 `data-scope` 之後渲染）、`components/dashboard.tsx`（+14／−6：`applyFilters` 第 2 個選填參數、`applyChannelSettings`、`DataWorkspace` 兩個 prop、`exportExcel` 傳 `channelSettings`）、`components/meeting-page.tsx`（1 行：`exportExcel` 傳 `channelSettings`）、`application/excel-export.ts`（+27／−1）、`i18n/labels.zh-TW.ts`（+53）、`app/globals.css`（+31）。`src/i18n/guide.zh-TW.ts` 只加一行錨點註解（葉節點不變）。

## 5. 審查

R1（規格、拍板、labels、CSS、邊界；唯讀＋scratch worktree 複跑 19 檔 434 個測試）與 R2（行為、a11y、測試；scratch 伺服器 3106 跑 E2E 59／0／9、手動走查、axe、B9、突變測試三件都被測試抓到）各回報 2 件與 4 件 major，F 全部修在 `637323a`：

| # | 來源 | 問題 | 修正 |
|---|---|---|---|
| 1 | R1 | Excel 對照列沒有依 `spec.appendix.technical` 閘門，客戶版也會列出通路代碼、位置不在技術細節 | 與「圖表資料」版本列同一條件；加客戶版測試（帶設定時列數與沒有設定相同） |
| 2 | R1 | 示範資料清空顯示名稱後仍顯示隱含別名，與提示句「顯示名稱空白時，畫面顯示通路代碼。」、placeholder、套用後不重建互相矛盾 | 空白一律＝顯示通路代碼：有預設別名時寫 `label＝代碼`（PRD §3.1 字面規則）；測試改成對應期望 |
| 3 | R2 | `<ul role="alert">` 讓 `<li>` 的父層不是 list，axe `listitem` 1 serious（既有 axe-sweep 不走到錯誤狀態） | `<div role="alert">` 包 `<ul>`；E2E 案例 B 在錯誤狀態跑 axe 斷言 0 serious |
| 4 | R2 | 按「套用設定」到父層重算完成之間打的字會被 props 重建蓋掉（實測 390 約 70 ms 視窗） | 套用時同步重建草稿並記 `lastApplied`，父層傳回同一份設定時不重建；E2E 案例 C 以 `page.clock` 固定時間驗證 |
| 5 | R2 | `.channel-settings-status:empty { display: none }` 把 `role="status"` 從可及樹拿掉，唸出不可靠 | `:empty` 只收邊距，live region 一直在樹上 |
| 6 | R2 | 問題清單沒有 `overflow-wrap`，201 字不可斷行的名稱會讓整頁橫向捲動 | 加 `overflow-wrap: anywhere`；E2E 案例 B 以 201 字名稱斷言沒有橫向捲動 |

只記錄的 nit（不修；依使用者 2026-10-13「避免過度微調」）：套用後緊接切期間的極短競態（ticket 丟掉第一次結果時設定遺失，狀態句已顯示）；套用與預設無差時仍 `markChanged`；問題句沒有 `aria-invalid`／`aria-describedby`；成員分隔符「、」是元件內字面值；`tests/channel-settings-editor.test.tsx:17` 註解指到 `channel-groups.spec.ts`（實際是 `channel-settings.spec.ts`）；`testids-v42-added.txt` 的 `channel-settings` 情境說明提到匯入精靈第 4 步（該步不渲染 `DataWorkspace`）；`.channel-settings-head` 的 sr-only 寫法重抄 `.sr-only`；長而不可斷行的顯示名稱在編輯器以外的既有文字（G20 副標、`.sec-scope`、G4 表）不換行（真實長度的中英名稱在 390 不溢出）；1280 一次 axe `target-size` 是 sticky 期間列遮到該列的位置問題，捲開後 0。F 沒做的選配：`applied` 改在 `applyFilters` 的 promise 完成後才顯示（`applyFilters` 吞掉錯誤，要加回傳值與 ticket，超出最小修正）。

## 6. 已知限制與風險（每批重述）

- 品類與 SKU 只到商品毛利；群組不觸發 `NEGATIVE_CHANNEL_CM`；試算仍單一通路；目標不配群組（D-V42-3、12）。
- 本批群組只能建立與指派，期間列還不能選群組（V42-2a）；總覽、健檢、會議還沒有群組合計列（V42-2a／2b）。
- 示範資料清空顯示名稱後套用會把 `label＝代碼` 寫進設定（與預設有差，所以備份會多一個鍵）；這是「空白＝顯示代碼」的字面規則，公開示範畫面的起始值不受影響。
- 套用設定的狀態句在重算完成前就顯示（見 §5 nit）。
- Lighthouse 390 TBT 三項在高負載下超過門檻；同場成對對照證明不比前一批慢，但低負載三次還沒補量（§2）。

## 7. 下一批

V42-2a 開工前先在低負載（1 分鐘 < 2.5）補量正式腳本三次（§2 Lighthouse）。V42-2a 期間列的兩層通路選單、群組合計列（測試先行）、「只看這個通路」、試算頁群組範圍只列成員；之後是人工關卡 H8（通路設定、兩層選單、範圍文字、限制句）。被擋住的人工關卡：H8（V42-2a 後）、H9（分析視角、邊界句、群組合計列；V42-4 後）未執行／待人工；H6 待人工（上線後補）。D-V42-1 的補充問題仍待回覆。
