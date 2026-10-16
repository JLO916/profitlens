# v4.1 V41-6 驗收：範例檔下載與「操作導覽」入口（v4.1.2，2026-10-16）

v4.1.1 上線後，使用者 2026-10-15 回報（同一則訊息的第 1、2 項）：

1. 「匯入範本＞範例檔，三個需要的檔案都無法正確下載，需修正。」
2. 「側邊選單的『使用說明』改為『操作導覽』並增加 ? 的 icon。」

另外兩項（通路客製化與單一通路分析、by 通路／品類／SKU 與綜合、交叉分析）是新功能，另立 `docs/revamp-v4.2/` 規劃套件，不在本批。拍板：D-V41-26–30 依建議值（`docs/revamp-v4.1/09_DECISIONS_PENDING.md`）。

| 步驟 | commit | 內容 |
|---|---|---|
| 開工錨點 | `94918fe` | 06 加 V41-6（根因、修法、允許變動畫面 42 張）、09 加 D-V41-26–30 |
| 實作 A1：範例檔 | `3e66866` | `.vercelignore` 兩行錨定；`tests/vercelignore.test.ts`；launch-check 補充加 5 項 public-file（14 → 19） |
| 實作 A2：入口改名與圖示 | `4231af9` | `shell.guideV41.entry`、`homeHint` 改名；側欄入口加 `ShellIcon help`；CSS；README、usability-test T5；註解 |
| 實作 A3：發布文件 | `cd90cc8` | 版本 4.1.2；RELEASES v4.1.2 段（上線前寫法）；README、ENGINEERING；release-notes 測試 |
| 整合 | `531ec41`、`edbcc4a`、`835301c` | 三支分支 `--no-ff` 合併，無衝突；單元 167 檔／3,570 全過、lint 0、typecheck 通過、build 無 warning |
| 審查 | — | 兩個面向（規格與規則、測試／無障礙／效能），blocker 1、major 3，見 §4 |
| 審查修正與媒體重拍 | 見 §6 | 發布日期改 2026-10-16；`GUIDE_MEDIA=write` 重拍 3 張截圖與 3 支影片；本文件、STATUS、DECISIONS、06 進度 |
| 發布 commit | 見 §6 | 驗收證據與本文件上線前的部分 |

## 1. 完成項目

| 06 項目 | 狀態 | 說明 |
|---|---|---|
| 1 範例檔修正 | 完成 | **根因**：`.vercelignore` 第 15、17 行的 `docs/`、`templates/` 沒有前導斜線，gitignore 語意下也排除 `public/docs/` 與 `public/templates/`，所以 `public/templates/examples/` 的 4 個檔與 `public/docs/ORDER_AGGREGATION.md` 從 v2.0.0 起每一次部署都沒上傳（Git 整合的建置紀錄 `verification/release-20261001-cloud-build.txt:4-7` 有「Removed 903 ignored files」），正式站回 404（9,551 bytes 的 HTML）；本機 `next start` 直接讀工作目錄，所以單元測試、E2E、本機 launch-check 都測不到。`git ls-files public \| git -c core.excludesFile=.vercelignore check-ignore --no-index --stdin -v` 列出的正是這 5 個檔。<br>**修法**：兩行改成 `/docs/`、`/templates/`。沙盒比對排除集合 4,564 → 4,559，只少這 5 個檔、沒有多排除任何檔；把 8 個根目錄全部錨定的寫法得到相同的集合，所以只動兩行。<br>**護欄**：`tests/vercelignore.test.ts`（5 個案例：`git ls-files -z` 經 `git -c core.excludesFile=<.vercelignore> check-ignore --no-index --stdin -z -v`，`public/`、`src/`、`fixtures/` 與 `package.json`、`next.config.ts`、`tsconfig.json`、`vercel.json`、`globals.css`、postcss／eslint 設定檔 0 個被排除；`docs/METRICS.md`、`templates/examples/sales_daily.csv`、`tests/templates.test.ts`、`scripts/launch-check.mjs`、V41-3 驗收文件仍被排除；`.vercelignore` 含 `/docs/`、`/templates/` 且不含未錨定的寫法）。對舊檔驗證：還原舊的 `.vercelignore` 時 2／5 失敗，列出的就是這 5 個檔。<br>launch-check 補充加 5 項 `public-file`：4 個範例檔與 `ORDER_AGGREGATION.md` 各檢查 200、content-type 不是 text/html、位元組與 repo 的 `public/` 全等（`Buffer.equals`）；補充 14 → 19 項 |
| 2 入口改名與圖示 | 完成 | `shell.guideV41.entry`「使用說明」→「操作導覽」、`homeHint` →「操作導覽：每一頁怎麼用」（key 名不改；側欄、手機「更多」、頁尾、說明頁麵包屑同一個 key）；側欄入口在文字前加 `<ShellIcon name="help" />`（問號圓圈、20px、`aria-hidden`，與「更多」那一列同款），`.sidebar-guide-link` 加 `gap: var(--space-2)` 與 `svg { flex: none; color: var(--text-tertiary) }`（只用既有 token）；頁尾與首頁空狀態不加圖示；說明首頁 h1「服務介紹與使用說明」不改。README 第 38 行「操作導覽：匯入資料」與第 77 行、`docs/revamp-v4/usability-test.md` T5 答案欄同步；相關註解與測試描述標題更新，斷言仍只取 labels。可及名稱仍是「操作導覽（另開分頁）」 |
| 3 媒體重拍 | 完成 | `GUIDE_MEDIA=write` 只更新有差異的：截圖 `start-nav`（219×429 → 219×434）、`start-mobile-m`、`start-load`；3 支影片重錄（12 個 cue 基準有差異：start-30s 的 load、snapshot；import-wizard 5 個；meeting-weekly 5 個），poster、VTT 時間與清單 `updated`（2026-10-16）同步；其餘 41 張截圖與 3 個 cue 沒動。之後 `GUIDE_MEDIA=check` 連跑兩次都 47／47 |
| 4 版本與文件 | 完成 | 版本 4.1.2（`package.json`、lockfile 三行）；RELEASES v4.1.2 段上線前寫法（發布方式寫成步驟、正式站檢查一行 PROD_PLACEHOLDER）；README 發布紀錄；ENGINEERING；release-notes 測試加 v4.1.2 段的上線前後一致性檢查，v4.1.1 段改為一律照上線後的寫法斷言；STATUS、DECISIONS、06 進度 |
| 5 上線 | 待使用者當次同意 | 見 §6 |

**三支影片（重錄後）**：

| 影片 | 長度 | MP4 | poster | cue（開始，ms） |
|---|---|---|---|---|
| start-30s | 25.8 秒 | 609,358 bytes | 47,520 bytes | 0、5,024、10,690、15,718、20,740 |
| import-wizard | 28.4 秒 | 562,845 bytes | 28,292 bytes | 同清單 |
| meeting-weekly | 35.1 秒 | 1,018,741 bytes | 20,576 bytes | 同清單 |

都在 ≤ 45 秒、≤ 2 MB 內；字幕文字不變（沒有 cue 引用 `shell.guideV41.*`），只有時間點隨重錄改變。

## 2. 驗收命令與結果（程式 `835301c`＋日期修正與媒體重拍；發布 commit 見 §6）

| 命令 | 結果 |
|---|---|
| `npm ci` | 整合 worktree exit 0；lockfile 只改三個 version 欄位 |
| `npm run typecheck`、`npm run lint` | exit 0 |
| `npm run audit:ui -- --json verification/revamp-v41/V41-6/ui-audit.json` | hex 0、字級 11（不變）、JSX 中文 0、元件字串常值中文 0；各項與 V41-3 相同 |
| `npm run contrast-check` | 85／85 |
| `npm test -- --run` | **167 檔、3,570 個測試全過**（媒體重拍後；含新的 `tests/vercelignore.test.ts` 5 個與 release-notes 49 個） |
| `npm run build` | exit 0 |
| `npm run test:e2e`（帶 `NETWORK_LOG_OUT`、`KEYBOARD_WALK_OUT`、`AXE_OUT`、`GUIDE_SHOTS_OUT`） | **1,143 passed、0 failed、29 skipped（32.7 分鐘；開跑時 1 分鐘負載 4.95）**；跑完已還原 E2E 改寫的追蹤檔（`verification/revamp-R6/*`、`verification/review-v2-a-*`，35 個） |
| `CAPTURE_BATCH=V41-6` | 第一輪 26 passed、12 failed（差異正好是允許的 42 張，見 §3）；更新基準後重跑：**38 passed、0 failed**，64 張全部 0 差異。 |
| `GUIDE_MEDIA=check` × 2 | 兩次都 47／47（44 張截圖＋15 個影片 cue）；重拍後的 `write` 只改了 §1 列的檔 |
| launch-check（本機 PUBLIC_DEMO） | 13 項全部通過，補充 **19 項**全部通過；5 項 `public-file`（4 個範例檔與 `ORDER_AGGREGATION.md`）都 200、位元組與 repo 的 `public/` 相同（本機 `next start` 讀工作目錄，這 5 項在本機一定過，只有對 Vercel 部署跑才有意義） |
| Lighthouse × 3 | 390 TBT 五項通過；首頁 390 Performance 三次都 95；工作台 a11y 全 100；說明頁 a11y、SEO 100，Performance 98–100；見下方 |
| 禁區與邊界五條 | 都是空的（整合分支與主檢出各跑一次） |

**量測**：

- **First Load JS**：`/` 是 **519,705**（V41-3 是 519,702，+3 bytes；門檻 520,451）；`GUIDE_SENTINELS` 0（對照組 `shell.guideV41.homeHint`「操作導覽：每一頁怎麼用」出現 1 次）；`/guide` 與 11 個功能區頁都是 131,465（等於框架基準，差 0）。
- **DOM 節點**（B9）：每頁比 V41-3 多 2 個（側欄入口的 `<svg><path>`），例如 1440 經營總覽 3,337（上限 4,575）、通路健檢 2,186（2,824）、商品毛利 2,522（3,322）；390 經營總覽 3,324。
- **axe**：28／28／28／26 個狀態，全部 0 問題。
- **鍵盤走查**：四尺寸與說明頁都通過；側欄入口仍是一個 Tab 停留點（圖示 `aria-hidden`），可及名稱「操作導覽（另開分頁）」。

**Lighthouse × 3**（`scripts/lighthouse-pages.mjs`，每次開跑前等 1 分鐘負載 < 2.5：三次開跑時分別是 1.52、1.96、1.49）：

| 步驟（390 TBT，ms） | 第 1 次 | 第 2 次 | 第 3 次 | 中位數 | 門檻 |
|---|---|---|---|---|---|
| 載入示範資料 | 940.1 | 991.0 | 1,010.9 | **991.0** | 1,109.1 |
| 健檢 | 781.2 | 760.2 | 787.9 | **781.2** | 832.3 |
| 商品 | 83.5 | 81.4 | 80.4 | **81.4** | 129.9 |
| 會議 | 985.6 | 958.3 | 964.5 | **964.5** | 1,071.2 |
| 資料來源 | 10.2 | 9.6 | 9.5 | **9.6** | 50.0 |

- **工作台**：a11y 三次都是全部 100；首頁 Performance 1440 三次都 100、390 三次都 95；所有切頁 CLS ≤ 0.002；預先載入的 10 個 chunk 都沒有落入量測區間。
- **說明頁**：`/guide`、`/guide/overview` 的 a11y、SEO 四次量測都是 100；Performance 1440 都是 100，390 是 98–100（`/guide` 98、99、100；`/guide/overview` 98、98、99，與 V41-3 相同，原因仍是影片 poster）；CLS 0。
- **證據**：`lighthouse-runs/run1`、`run2` 是第 1、2 次，`metrics.json` 的 Lighthouse 區段與 `lighthouse/` 的報告是第 3 次。

## 3. 畫面基準

基準先從 V41-3 的 `snapshots/` 複製。第一輪 `CAPTURE_BATCH=V41-6`：**26 passed、12 failed**，失敗的 12 個測試是四個尺寸各自的「01–09」「14」「16」；展開到單張，差異正好是允許清單的 **42 張**，沒有多也沒有少：

| 尺寸 | 有差異的畫面 | 原因 |
|---|---|---|
| desktop、laptop、tablet | 01–09、14（各 10 張） | 側欄入口「使用說明」→「操作導覽」並多一個問號圖示（03 在抽屜背景下也看得到） |
| desktop、laptop、tablet | 16 | `/guide/overview` 麵包屑「操作導覽 / 經營總覽」 |
| mobile | 02、04–09（7 張） | 整頁截圖含頁尾「指標定義 · 操作導覽」 |
| mobile | 14 | 首頁空狀態那一行「操作導覽：每一頁怎麼用」 |
| mobile | 16 | 麵包屑 |

差異像素每張 361–1,163 個（比例 0.01），都落在入口文字、圖示、頁尾或麵包屑；diff 圖確認頁面其餘部分逐像素相同（例如 desktop 01 只有側欄入口那一列標紅）。文字同長（4 個字），頁高沒有改變。未變的 22 張（desktop／laptop／tablet 的 10–13、15；mobile 的 01、03、10–13、15）0 差異。

以 `--update-snapshots=changed` 只更新這 42 張後重跑全部：**38 passed、0 failed**，64 張全部 0 差異。

## 4. 審查

整合分支 `835301c` 由兩個面向審查（規格與規則；測試、無障礙、效能），只報 blocker、major：

1. **blocker（流程）**：發布 commit 之前要先產生本批證據（媒體重拍、畫面基準、Lighthouse），RELEASES 的驗收段已引用這些結果。處置：本文件 §2、§3 全部以真實執行結果填寫，再做發布 commit。
2. **major**：v4.1.2 的發布日期寫 2026-10-15，但本批的 commit 都在 2026-10-16。處置：RELEASES 標題與發布日期、README「最新：v4.1.2（2026-10-16）」、ENGINEERING、release-notes 測試的四處日期與上線後判斷式（README「正式站已是 v4.1.2（2026-10-16）」）改成 2026-10-16；上線日期若再延後要一起改。
3. **major**：STATUS、DECISIONS、06 進度與功能保留表尚未更新。處置：本次收尾一併做（功能保留表 GE1–GE4 改為 V41-6 已核對）。
4. 另一位審查者對 release-notes 測試做了兩種狀態的模擬：上線前（現在）49／49；模擬上線後（README 改寫、正式站檢查一行有 deployment 與輸出檔、證據檔存在）49／49；五種只改一半的狀態都在預期的斷言失敗。

**nit 只記錄（12 項）**，例如：

- 側欄入口那一列因 inline-flex 基線對齊高了 5px（`start-nav` 429 → 434），文字與圖示對齊正常，不調。
- `tests/vercelignore.test.ts` 在模組層呼叫 git，git 不存在時是收集錯誤而不是具名失敗；`.gitignore` 的優先權高於 `core.excludesFile`，若有一天 `.gitignore` 排除了 `public/` 下的檔會變成漏報（目前 `.gitignore` 沒有這種樣式）。
- `scripts/launch-check.mjs` 的 `readFileSync(public/…)` 沒包 try；本機檔不在時整個腳本中止而不是記一項失敗。
- `tests/e2e/guide.spec.ts` 的檔頭註解與 `CLAUDE.md`、`docs/revamp-v4.1/00_README.md` 的名詞表仍寫「使用說明」（歷史與規格描述；斷言都取 labels）。
- usability-test T5 的任務句維持「請找到這個工具的使用說明」，答案欄已改「操作導覽」；H6 執行前再看一次。
- `public/docs/ORDER_AGGREGATION.md` 現在會公開；它引用的 `scripts/aggregate_orders.py` 在公開的 GitHub repo（`gh repo view` 為 PUBLIC），使用者可以取得；v4.2 的 D-V42-31 記為預設沿用。

## 5. 已知限制

- 修正只有對 Vercel 的部署（preview 或正式站）跑 launch-check 才能證明；本機 `next start` 直接讀 `public/`，19 項補充在本機一定通過。
- 其餘同 RELEASES v4.1.2 的「已知限制」：H6（含 T5、T6）待人工；匯出檔開檔檢查待人工；Skew Protection 沒開（D-V41-16）；3 張截圖的原生控制項是英文；21 張截圖在 390 較小。

## 6. 上線（使用者 2026-10-16 回覆「部署 v4.1.2」，當次同意）

- **推送**：`revamp/v4.1`（含 v4.2 規劃套件的 docs commit `ebc04eb`，另建一個 preview）；`main` 從 `66c241a` fast-forward 到發布 commit `e256154`。commit 之後的禁區與邊界 diff 都是空的。
- **部署**：Vercel Git 整合部署 `dpl_J5A1SGdB13av7anqtCjsf4bKUeEj`，target production，READY；`profitlens-tau.vercel.app` 指向它。正式站的 `/api/insights` 回 `{"available":false,"reason":"PUBLIC_DEMO"}`。
- **tag**：annotated tag `v4.1.2` 指向 `e256154`，已推送。
- **正式站檢查**：13 項全部通過，補充 19 項全部通過（`verification/revamp-v41/V41-6/launch-check-production.json`）。5 項 `public-file` 在正式站第一次通過：`/templates/examples/{sales_daily,channel_costs_daily,ad_spend_daily}.csv`、`manifest.json`、`/docs/ORDER_AGGREGATION.md` 都 200，content-type 正確，位元組與 repo 的 `public/` 相同。
- **實際下載**：無頭 Chromium（1440×1000）在正式站首頁空狀態的「需要的檔案」表點 3 個「範例檔」連結，download 事件的建議檔名與位元組（298、233、125）都和 repo 相同、沒有失敗（`verification/revamp-v41/V41-6/production-download-check.json`；腳本只在 scratchpad）。v4.1.1 正式站同一個動作得到的是檔名「404」、狀態 canceled。
- **上線後的文件 commit**：README 改成「正式站已是 v4.1.2（2026-10-16）」、RELEASES 補正式站檢查一行、本節、STATUS、DECISIONS、06／README 進度，以及 v4.2 的拍板（使用者同一則回覆「其他都依建議」）。推送 `revamp/v4.1` 與 `main` 後，正式站用同樣的程式重建一次（比照 v4.1.1），重建後再跑一次 launch-check，結果記在 STATUS。
- **沒有做**：Skew Protection（D-V41-16，使用者在 Vercel 設定決定）；H6 與匯出開檔檢查待人工。
