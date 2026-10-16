# EC ProfitLens — Claude Code 工作指令（v4.2）

EC ProfitLens 是「電商獲利診斷與決策工作台」：匯入三份日粒度 CSV（銷售、通路費用、廣告），依序計算淨營收、商品毛利、扣廣告前貢獻、扣廣告後貢獻四層，做兩期比較、九項金額橋接、規則健檢、假設試算、待辦與會議輸出。所有金額由 `src/domain` 的純函式計算，每個數字可追溯到 CSV 檔名與行號。

產品名稱為 **EC ProfitLens**（D-V3-25）。使用者看得到的名稱一律寫 EC ProfitLens；技術識別不改：package 名 `profitlens`、下載檔名前綴 `profitlens-`、備份 schema 字串、`dataset_id`、網址 `profitlens-tau.vercel.app`。

本輪目標（v4.2，基準 v4.1.2＝tag `v4.1.2`＝commit `e256154`，目標 v4.2.0（D-V42-6＝A））：使用者 2026-10-15 的指示是「現階段所有分析只能分為『DTC』『Marketplace』，這部分需讓使用者能客製化設定為自己擁有的通路來分析，並且要能夠再多一層的單一通路分析」與「分析視角要有『by 通路』『by品類』『by SKU』的個別分析以及綜合分析、交叉分析」。**在工作台裡加通路設定（顯示名稱、順序、使用者自己編的群組，跟著備份走；D-V42-1＝E）、期間列的兩層通路選單（群組、群組裡的單一通路；D-V42-2＝A）、商品毛利頁的視角切換（品類、SKU 跨通路合計、通路 × 品類交叉表、綜合；D-V42-4＝A、D-V42-5＝A）。四層金額全部由既有 `src/domain` 函式以通路子集計算；品類與 SKU 只到商品毛利，通路費用與廣告費不分攤、以「未分攤」整筆呈現（D-V42-3＝A）；不動 `src/domain`、`fixtures/*`、`docs/METRICS.md`；不加 npm 依賴。** 同一則訊息的第 1、2 項由 V41-6（v4.1.2）處理，不在本輪。使用者已於 2026-10-16 授權依 PRD 開工（回覆「V42-0」），D-V42-1 到 31 的決定（含 8 件預設沿用）見 `docs/revamp-v4.2/09_DECISIONS_PENDING.md`（全部依建議值：使用者 2026-10-16 回覆「其他都依建議」；D-V42-1 的補充問題「是否已匯入過自己的多通路資料」尚未回答，V42-1 開工前再問）。

## 先讀什麼（每個 session 都要）
1. `AGENTS.md` — 專案既有規則，**優先級最高**；本檔只補充，不覆蓋。`AGENTS.md:13-14`「通路層級廣告費不分攤到 SKU。商品畫面只呈現商品毛利；SKU 篩選不可帶入全通路費用產生假貢獻」是本輪的硬牆。
2. `docs/revamp-v4.2/00_README.md` — v4.2 套件的用法、批次順序、人工關卡、驗收命令。
3. 當批任務：`docs/revamp-v4.2/06_BATCHES.md` 中指定的 V42 批次（含「允許變動畫面」「同批 labels 與測試」）、該批引用的 `docs/revamp-v4.2/01_PRD.md` 章節（用 Read 的 offset／limit 讀需要的段落）。
4. 拍板與名詞：`docs/revamp-v4.2/09_DECISIONS_PENDING.md`、`docs/revamp-v4.2/GLOSSARY.md`、`docs/revamp-v4/GLOSSARY.md`、`docs/revamp-v3/GLOSSARY.md`、`docs/revamp-v4.1/00_README.md` 的名詞增補。
5. 財務口徑（只讀）：`docs/METRICS.md`、`docs/DATA_CONTRACT.md`、`docs/SCENARIOS.md`。

v4.1 套件 `docs/revamp-v4.1/*` 與 v4 套件 `docs/revamp-v4/*` 保留為歷史紀錄；v4.1 的說明頁規範（路由、媒體、同步、import 邊界）、v4 PRD 的圖表規範（§7，含 X26 到 X40 與 chart-lint）、v3 PRD 的 §5.2 X1 到 X25、§4.3 刻意不採用、§8 語言規範、§9 token 與元件、§11 非功能仍然有效。與 v4.2 文件衝突時以 v4.2 為準，與 AGENTS.md 衝突時以 AGENTS.md 為準。

## 本輪的硬規則（補充 AGENTS.md）
- **一次只做一個批次（V42-0 到 V42-6，含 2a／2b；上線前 8 批），一批就是一個工作階段，不跨批。** 批次完成前不開始下一批；每批結束要有可運行、全部檢查通過的狀態。批次太大時要在**開工前**拆成 V42-{n}a／b 並寫進 `06_BATCHES.md`。元件、labels、測試與第一個使用它的頁面同批交付。
- **人工關卡不屬於任何批次**：H8（通路設定、兩層選單、範圍文字、限制句，V42-2a 後）、H9（分析視角、邊界句、群組合計列，V42-4 後）擋 v4.2.0 正式上線、不擋批次；H6（v4 複測與盲評，加 T7、T8）上線後補。沒完成時 `docs/STATUS.md` 寫「未執行／待人工」，不可寫成完成。
- **拍板**：以 `docs/revamp-v4.2/09_DECISIONS_PENDING.md` 的「決定」欄為準（預設沿用的 8 件照表上的預設）。之後新出現的待決事項，沒有使用者明確回覆就不視為核准，拍板前沿用 v4.1.2 的行為與用詞。**任何部署（含 Vercel preview）都要使用者當次明確同意**（D-V42-26 只定策略）。**`git push` 任何分支到 origin 都會由 Vercel Git 整合建立 preview，視同部署；沒有使用者當次明確同意不 push（含 `revamp/v4.2`）。**
- **財務核心禁區（沿用 v4，白名單為空）**：`src/domain/*`、`fixtures/*`（只讀，不新增檔）、`metric_version = contribution-v1`、`assist-kpi-v1`、`breakeven-mer-v1`、`docs/METRICS.md`、`docs/SCENARIOS.md` 完全不動；`src/application/assist-kpi.ts`、`src/application/breakeven-mer.ts`、`tests/assist-kpi.test.ts`、`tests/breakeven-mer.test.ts` 一個字都不改。**新數字只在 `src/application`**：A 級＝呼叫既有 domain 函式取既有值（群組合計走 `aggregatePeriod` 子集、`compareMoney`、`buildBridge`；品類與交叉對帳走 `analyzeProducts`），不加版本常數；B 級＝新分組或新值（`product-groups.ts`＝`product-groups-v1`、`category-structure-v1`），每個函式一個版本常數＋手算 golden＋與 domain 對帳的測試（D-V4-15）；C 級（新公式、預測、分攤、系統代填假設）禁止。新測試資料只在 `tests/fixtures/`。
- **品類與 SKU 只到商品毛利（D-V42-3）**：`product-groups.ts` 的每桶 `metrics` 鍵集合 ⊆ `PRODUCT_METRICS ∪ {units_sold}`，回傳型別只有 `ProductMetrics`，投影在同一個函式內完成（`aggregateSales` 的費用欄是 `0n`，不投影會漏出假貢獻）；序列化後 `/fee|ad_spend|contribution|mer|burden/` 比對 0 次；`EvidenceSelection` 帶 `category` 時 `ladderMetrics` 回 null；交叉表格內永遠不出現費用、廣告、貢獻，通路的扣廣告後貢獻只在列尾並寫「通路層；未分攤到品類」；邊界句「品類與 SKU 的分析到商品毛利為止，通路費用與廣告費以「未分攤」整筆呈現。」放 PRD §6.2 的五處。要求分攤時回覆這是 C 級且需要使用者修改 `AGENTS.md:13-14`，不在實作裡偷做。
- **群組與品類都不開 domain（D-V42-12）**：沒有 `Scope.kind "group"`、`"category"`；群組是 `kind "all"` 加成員清單；群組沒有「扣廣告後為負」規則卡、試算仍單一通路（群組範圍下試算頁的通路選單只列成員）、目標只對全部通路或單一通路配對；三句限制（`GLOSSARY.md` §2）放「要注意」與說明頁，主層不寫否定句。
- **公開站邊界（D-V42-27）**：`src/app/api/*`、`vercel.json`、`src/application/analytics.ts` 對 `872662d` 不改；不碰 `.env*`；`APP_MODE=PUBLIC_DEMO`、`ENABLE_LIVE_AI=false`、`/api/insights` 的 server 端封鎖邏輯不動；不新增分析事件。每批驗收跑五條命令，結果寫進驗收文件，五條都必須為空；**不可用 `main` 比對**：
  - `git diff --stat 625bfa5 -- src/domain fixtures docs/METRICS.md`
  - `git diff --stat 82b70df -- src/domain fixtures/golden fixtures/demo fixtures/errors fixtures/refund_only fixtures/zero_ad docs/METRICS.md`
  - `git diff --stat 625bfa5 -- src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts`
  - `git status --porcelain -- src/domain fixtures docs/METRICS.md src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts src/app/api vercel.json src/application/analytics.ts`
  - `git diff --stat 872662d -- src/app/api vercel.json src/application/analytics.ts`
  - commit 之後再跑 `git diff --stat 625bfa5 HEAD -- （第一條與第三條的路徑）` 與 `git diff --stat 872662d HEAD -- src/app/api vercel.json src/application/analytics.ts`，必須為空，commit hash 寫進驗收文件；另列 `git diff --stat --diff-filter=A <前一批 commit> HEAD -- src/application tests` 當對帳用的新增檔清單
- **允許變動畫面取代「工作台不動」**：每批只允許 `06_BATCHES.md` 列出的畫面有差異，其餘 0 差異。v4.2 會改的頁：商品毛利（視角切換、交叉表）、期間列（兩層通路選單）、資料來源（通路設定區）、通路健檢與總覽（群組合計列）、會議（通路寬表與週會摘要的 `groups` 欄位，CSV 不變）；側欄、手機分頁列、頁尾、首頁空狀態不改，不加第 8 頁。期間列行高不變（B1、B2 首屏 0 px 餘裕）。「只看這個通路」只在資料集有群組時渲染，示範資料的畫面與說明截圖不變。
- **邊界檔（不在五條命令裡，只能以指定方式改，驗收文件逐一寫出 diff 範圍）**：`src/application/evidence-ladder.ts` 只加「`category` 有值時回 null」，`tests/evidence-ladder.test.ts` 既有輸出不變；`src/application/workspace.ts` 的 `filter_hash` 仍只由 `report.scope` 算，`createSnapshot` 只加第 4 個選填參數 `settings`、快照只加選填 `channel_names`（10 個呼叫點每處都傳入 `Active.channel_settings`，清單見 PRD §3.4）；`src/application/copy.ts` 的 `channelLabel`、`channelsLabel`、`scopeLabel`、`categoryLabel` 改收解析器，示範別名變成 `synthetic-demo*` 的隱含預設（永遠不寫進 `channel_settings`），既有字串逐字不變；`src/application/workspace-backup.ts` 只加選填 `channel_settings`（D-V42-9＝A：v5 信封加選填鍵）（設定與預設沒有差時不寫鍵），`restoreV4` 讀出設定後才建快照、對未知通路代碼丟棄並提示；`src/application/manager-summary.ts` 的 `channels` 陣列不變（CSV），群組合計只加選填 `groups`；`src/application/targets.ts` 不動。
- **使用者輸入的名稱**：顯示名稱與群組名比照 `import-guidance.ts:58` 驗證（去頭尾空白後非空、前後沒有空格、≤ 200 字、沒有控制字元），NFC 正規化後在通路與群組之間不重複；只進人讀的文字；CSV 的 `channel` 欄、AI facts、備份的 `active.filters`、`filter_hash`、`dataset_hash` 一律維持通路代碼；寫進 CSV 與 XLSX 的人讀欄位時跳脫（含 `=`、`+`、`-`、`@` 開頭）；AI 快照負載不含名稱（單元測試）；不存 `localStorage`、不用模組全域變數。
- **標籤單一來源（D-V42-22）**：使用者看得到的中文只在兩個檔：工作台在 `src/i18n/labels.zh-TW.ts`，說明頁在 `src/i18n/guide.zh-TW.ts`（只給伺服器模組 import）。新 key 只放 `V42_NEW_KEY_PREFIXES`：`data.channelSettingsV42.`、`shell.periodBarV42.`、`shell.scopeV42.`、`overview.channelsV42.`、`diagnosis.channelsV42.`、`meeting.channelsV42.`、`products.perspectivesV42.`、`exports.v42.`、`storage.v42.`（`labels.zh-TW.ts`）與 `guide.`（`guide.zh-TW.ts`）；`LABEL_GROUPS` 維持 24 組；每批在兩個檔加「── V42-n 錨點」註解；既有字串一字不改（`verification/revamp-v4/labels-v3.flat.json` 2,581 個、`verification/revamp-v41/labels-v4.flat.json` 2,839 個、`verification/revamp-v42/labels-v41.flat.json` 的全部葉節點逐鍵逐字相同）；`products.perspectivesV42.*` 計入「賠錢」「虧損」黑名單與 L1 子句長度；JSX 內不新寫中文；指標名一律取 `metricDefinitions`；新字串都是陳述句，不含問號、驚嘆號、箭頭字元、「注意：」，用詞照 `docs/revamp-v4.2/GLOSSARY.md`。
- **測試斷言的字串跟著標籤走**：一律 `import { labels } from "@/i18n"`（說明頁另 import `guideLabels`）再斷言；新畫面只用 testid 與 labels 斷言。測試失敗不是「跳過」的理由。
- **顯示格式只在呈現層**（沿用 v4）：萬／億、HALF_UP、U+2212、`favorableDirectionOf`、`formatAxisWan`、`formatHeatCell` 只改 `src/application/presentation.ts`、`copy.ts`。不可為了讓測試過而改 golden 數字（本期 255.00、差額 −315.00、試算 284.00／264.00／19.70）；新 golden 另立（PRD §11.2）。
- **圖表規範（沿用 v4）**：照 v4 PRD §7 與 X1 到 X40、chart-lint CL-1 到 CL-11；交叉表用 `ChartDataTable` 表模式（D-V42-17），熱表 token 維持只用在 G11、G21，類別色不用；X38：群組列取自 domain 群組合計，不是跨列相加；品類視角每視角主層 ≤ 1 張圖，商品頁主層 ≤ 3 張；排名只列前 N 加「另 n 個」；真正的 0.00 畫 0。
- **效能**：群組合計列與視角表在元件內 `useMemo` 懶算，不進 `createSnapshot`、`applyFilters`；非預設視角的本體是可直接 import 的模組 `src/components/products/perspectives/{category,sku-total,cross,combined}.tsx`（SSR 頁面狀態直接 import 它們渲染），商品頁只以 `createChunkLoader`／`next/dynamic` 包載入點成子 chunk＋`useDeferredMount`，`tests/lazy-panels.test.tsx` 反向檢查商品頁 chunk 不靜態 import 它們；只渲染目前的視角（M1 不適用於視角切換，D-V42-5）；通路設定區在 `workspace-panels` chunk；`PRELOAD_CHUNKS` 的 `insideTimespans` 必須為空；上限：通路 ≤ 8（群組列、交叉表）、品類欄 ≤ 12、格數 ≤ 736，超過退清單式表（D-V42-28）。
- **棘輪與基準**：`tests/design-lint.test.ts`、`tests/copy-style.test.ts`、`tests/chart-lint.test.ts`、`tests/copy-density.test.ts` 的數值只能下降；`tests/testid-baseline.test.ts` 對 `verification/revamp-v3/testids-v2.txt`、`verification/revamp-v4/testids-v3.txt`、`verification/revamp-v4/testids-v4-added.txt`、`verification/revamp-v41/testids-v41-added.txt`、`verification/revamp-v42/testids-v42-added.txt`（每批追加本批新增的 testid）五份的刪除數都必須為 0；`tests/mounted-testids.test.tsx` 每批都跑；`verification/revamp-v4-capture/metrics.spec.ts` 的 B2、B3、B5、B9 照 v4 斷言，另加 `/` First Load ≤ V42-0 實測＋8,192 bytes（D-V42-20＝A）、`SPLIT_SENTINELS`（帶引號的 testid 字面值：`"channel-settings"`、`"products-perspective"`、`"products-perspective-cross"`）與 `GUIDE_SENTINELS` 在 `/` 首載 chunk 0 次、說明頁 First Load ≤ 框架基準＋5,120、非預設視角的 B9 ≤ 首批基準＋1,500，執行時一定要設 `METRICS_OUT`、`FIRST_LOAD_MODULES_OUT` 指到 `verification/revamp-v42/V42-{n}/`；390 五個 TBT 依 D-V4-36、D-V4-47，D-V42-21＝A：V42-3 起加第六步「商品毛利切到品類視角」；畫面基準每批先複製前一批的 `snapshots/`（V42-0 用 V41-6 的 64 張）再比對，只允許該批「允許變動畫面」有差異；`verification/revamp-v42/feature-retention.csv` 沿用的列寫「v4.1.2 已核對；v4.2 未改動」，`batch` 欄等於本批的列全部打勾，V42-6 只確認這些列；B 級對帳（群組＝成員合計、分割＝全部、Σ 品類＝通路、恆等式）與備份矩陣 v1 到 v5 每批列結果。
- **說明頁與媒體同步（沿用 v4.1）**：每批 `GUIDE_MEDIA=check` 0 差異；改到被拍到的畫面時同批 `GUIDE_MEDIA=write` 只更新有差異的媒體、逐張寫理由、再 `check` 兩次；影片是否重錄以 cue 比對為準（側欄不動就不重錄；要重錄時用本機 `ffmpeg`，D-V41-7＝A）；說明頁截圖用示範資料或 `tests/fixtures/synthetic-4-channel`，圖說註明虛構的合成資料；不新增功能區，sitemap 仍 13 個網址；每次發版 0 差異才能上線。
- **依賴**：本輪「允許新增 npm 依賴」清單為**空**。`ffmpeg` 只在重錄影片時當本機工具，不進 `package.json`。其他依賴變動（含只動 lockfile 的傳遞依賴）一律先問。
- **隱私與公開站邊界不變**：不加登入、資料庫、伺服器端保存；原始 CSV 不上傳；通路設定只在記憶體、備份與同意後的本機保存；`network-log.spec` 的下載集合維持 5 種、無 POST。
- **可追溯性不變**：工作台每個金額都能開「計算與來源」；群組格的來源＝成員通路來源的聯集；品類桶、SKU 桶、交叉格的來源只有 `sales_daily.csv` 的列（空桶加 `manifest.json`）；抽屜欄位照 PRD §8；`daily_complete` 的差異寫進驗收。
- **a11y 與 testid 不退步**：既有 `data-testid`、`aria-*`、`role="status"`、`<details>/<summary>` 結構保留。新 testid 用 `channel-settings`、`channel-settings-row-{code}`、`channel-settings-group-{groupId}`、`scope-select`、`scope-option-group-{groupId}`、`group-row-{groupId}`、`channel-drill-{code}`、`products-perspective`、`products-perspective-{view}`、`chart-products-{id}`（id 只用 `[a-z][a-z0-9]*`：`category`、`catvariance`、`skutotal`、`cross`；資料表 `-table`、柱 `-bar-cat-{category}`、格 `-cell-{channel}-cat-{category}`，`-table` 之後不再接任何東西，CL-2 的 `CHART_TESTID_RE`）、`products-structure-{channel}`（C3 結構表，在 `.chart-frame` 之外）、`products-combined-{block}`，不用陣列索引；交叉表是原生 `<table>` 有 `caption` 與 `th scope`；視角切換鍵盤可達；任何 Tab 停留點都不在 `[aria-hidden=true]` 內。Lighthouse Accessibility 不低於同頁基準且 ≥ 95；四尺寸 axe 0 個 serious。
- **程式風格**：沿用既有風格（Tailwind v4 + `globals.css` 自訂 class、長行 JSX）。只改動需要的區塊；新樣式用既有 token，不寫死色碼、不加字級種類；新 token 同批加進 `scripts/contrast-check.mjs` 的 PAIRS。
- **避免過度微調**（使用者 2026-10-13）：審查只修 blocker、major；nit 只記錄；不加規格以外的調整。
- **文件同步**：每批結束更新 `docs/STATUS.md`（真實執行結果；未執行寫「未執行」）、必要時在 `docs/DECISIONS.md` 加一筆、把本批驗收寫到 `verification/revamp-v42-V42-{n}-acceptance.md`，截圖與量測存 `verification/revamp-v42/V42-{n}/`；`06_BATCHES.md` 的進度欄同步。

## 驗收命令（每批都要全部跑，照這個順序，貼真實輸出摘要）
```bash
npm ci                 # 全新環境或 lockfile 變動時
npm run typecheck
npm run lint           # eslint --max-warnings=0
npm run audit:ui -- --json verification/revamp-v42/V42-{n}/ui-audit.json
npm run contrast-check
npm test -- --run      # 含 design-lint、copy-style、copy-density、chart-lint、testid-baseline（五份）、mounted-testids、labels-structure（三份快照）、labels-coverage、relaunch、guide-content、guide-routes、vercelignore、channel-settings、channel-groups、product-groups、backup-schema-v5、backup-restore-matrix、evidence-ladder
npm run build
NETWORK_LOG_OUT=verification/revamp-v42/V42-{n}/network-log.json KEYBOARD_WALK_OUT=verification/revamp-v42/V42-{n}/keyboard-walk.json AXE_OUT=verification/revamp-v42/V42-{n}/axe.json npm run test:e2e
                       # 自己在 3100 埠起 LOCAL 伺服器，必須在下面的 PUBLIC_DEMO 伺服器啟動前跑完
NEXT_TELEMETRY_DISABLED=1 npm run build
APP_MODE=PUBLIC_DEMO PUBLIC_DEMO=true ENABLE_LIVE_AI=false npm start -- --port 3100 &
METRICS_OUT=verification/revamp-v42/V42-{n}/metrics.json FIRST_LOAD_MODULES_OUT=verification/revamp-v42/V42-{n}/first-load-modules.json CAPTURE_BATCH=V42-{n} npx playwright test --config verification/revamp-v42.capture.config.ts
GUIDE_MEDIA=check npx playwright test --config verification/guide-media.config.ts   # 每批；差異 0 張
node scripts/launch-check.mjs --base http://127.0.0.1:3100 --out verification/revamp-v42/V42-{n}/launch-check-local.json   # 13＋19
npx -y lighthouse@13.5.0 --version   # 只在第一次：建立 npx 快取
node --no-warnings scripts/lighthouse-pages.mjs --base http://127.0.0.1:3100 --out verification/revamp-v42/V42-{n}   # V42-3 起含第六個 timespan
lsof -ti tcp:3100 | xargs kill   # 停掉 PUBLIC_DEMO 伺服器；之後 lsof -ti tcp:3100 必須沒有輸出
git diff --stat 625bfa5 -- src/domain fixtures docs/METRICS.md
git diff --stat 82b70df -- src/domain fixtures/golden fixtures/demo fixtures/errors fixtures/refund_only fixtures/zero_ad docs/METRICS.md
git diff --stat 625bfa5 -- src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts
git status --porcelain -- src/domain fixtures docs/METRICS.md src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts src/app/api vercel.json src/application/analytics.ts
git diff --stat 872662d -- src/app/api vercel.json src/application/analytics.ts
git diff --stat --diff-filter=A <前一批 commit> HEAD -- src/application tests   # 對帳用，不是閘門
# commit 之後：git diff --stat 625bfa5 HEAD -- （第一條與第三條的路徑）與 git diff --stat 872662d HEAD -- src/app/api vercel.json src/application/analytics.ts，都必須為空，commit hash 寫進驗收文件；不 push
```
本機預覽：`npm run dev`，網址 http://127.0.0.1:3000 （說明頁 `/guide`）。E2E 的四種視窗：1440×1000、1280×900、768×1024、390×844。

## 每批回報格式（繁體中文）
1. 完成項目（對照 `docs/revamp-v4.2/06_BATCHES.md` 的該批範圍，逐項標 完成／部分／未做＋原因）
2. 變更檔案清單（新增／修改／刪除；另列邊界檔的 diff 範圍）
3. 驗收命令與真實結果（通過數、失敗數、未執行），含禁區與邊界五條命令與 commit 後的 diff（附 commit hash）、棘輪數值（design-lint、copy-style、copy-density、chart-lint）、testid 刪除數（五份）、labels 三份快照的比對結果、`/` 與說明頁的 First Load JS（含差額組成、`SPLIT_SENTINELS`、`GUIDE_SENTINELS`）、DOM 節點數（含商品頁各視角）、390 的五個 TBT 與 loadavg（V42-3 起六個）、B 級對帳結果、備份還原矩陣、說明媒體同步檢查結果、畫面基準差異（只列允許變動的畫面）、AI 快照負載不含名稱的測試結果
4. 瀏覽器驗收方式與截圖路徑（四尺寸至少各一張；新畫面另附）
5. 已知限制與風險（每批重述：品類與 SKU 只到商品毛利、群組不觸發 `NEGATIVE_CHANNEL_CM`、試算單一通路、目標不配群組）
6. 下一批建議、被擋住的人工關卡（H8、H9、H6），以及需要人拍板的事項（對照 `docs/revamp-v4.2/09_DECISIONS_PENDING.md`）

## 檔案地圖（本輪會碰到的）
| 位置 | 內容 | v4.2 批次 |
|---|---|---|
| `src/application/channel-settings.ts`（新）、`tests/channel-settings.test.ts`（新） | 通路設定的型別、驗證、解析器、群組解析；`channel-settings-v1` | V42-1 |
| `src/application/channel-groups.ts`（新）、`tests/channel-groups.test.ts`（新） | 群組合計（A 級：`aggregatePeriod`、`compareMoney`、`buildBridge`）；精確性測試 | V42-2a（測試）、V42-2b（模組） |
| `src/application/product-groups.ts`（新）、`tests/product-groups.test.ts`（新） | B 級 `product-groups-v1`：品類桶、SKU 桶、交叉格，只投影到 `PRODUCT_METRICS`；`category-structure-v1` | V42-3、V42-4 |
| `src/application/copy.ts`、`workspace.ts`、`workspace-backup.ts`、`evidence-ladder.ts`（邊界檔） | 解析器、`channel_names`、`channel_settings`、`category` 標記 | V42-1、V42-3 |
| `src/components/workspace-panels.tsx` | 資料來源頁「通路設定」區 | V42-1 |
| `src/components/shell/period-bar.tsx`、`dashboard.tsx` | 兩層通路選單、選取值邏輯、範圍文字 | V42-2a |
| `src/components/channel-table.tsx`、`overview/charts/channel-section.tsx`、`src/application/manager-summary.ts` | 群組合計列、「只看這個通路」（只在有群組時渲染）；`manager-summary` 只加選填 `groups`，`channels` 與 CSV 不變 | V42-2a、V42-2b |
| `src/components/multi-scenario-workbench.tsx` | 群組範圍下的通路選單只列成員 | V42-2a |
| `src/components/product-comparison-panel.tsx`、`src/components/products/perspectives/{category,sku-total,cross,combined}.tsx`（新）、`src/components/product-evidence.ts`、`src/components/lazy-panels.tsx`、`tests/lazy-panels.test.tsx` | 視角切換、P2 到 P5 的視角模組（可直接 import，給 SSR 狀態）、證據 builder、載入點與子 chunk、反向 import 檢查 | V42-3、V42-4 |
| `src/components/evidence-drawer.tsx` | `EvidenceSelection.category` | V42-3 |
| `src/application/excel-export.ts`、`pptx-export.ts`、`weekly-summary.ts`、`meeting.ts`、`decision-export.ts`、`waterfall.ts` | 群組範圍的範圍文字、「通路設定」對照列、`categories` 工作表（選配） | V42-1、V42-2a、V42-5 |
| `src/i18n/labels.zh-TW.ts`、`src/i18n/guide.zh-TW.ts` | `V42_NEW_KEY_PREFIXES` 下的新 key；說明頁新步驟 | V42-1 起每批 |
| `src/application/guide.ts`、`verification/guide-media/`、`public/guide/**` | 說明頁新步驟與截圖 | V42-5 |
| `tests/labels-structure.test.ts`、`verification/revamp-v42/labels-v41.flat.json` | `V42_NEW_KEY_PREFIXES`、v4.1.2 字串快照 | V42-0 |
| `scripts/lib/copy-scan.mjs` | `products.perspectivesV42.*` 的黑名單與 L1 | V42-0 |
| `tests/testid-baseline.test.ts`、`verification/revamp-v42/testids-v42-added.txt` | 第五份 testid 基準 | V42-0 起 |
| `tests/helpers/page-states.tsx`、`tests/mounted-testids.test.tsx` | `overview-many-channels`、`data-channel-settings`、`*-grouped`、`products-*` 狀態 | V42-0 起 |
| `tests/e2e/channel-groups.spec.ts`、`tests/e2e/product-perspectives.spec.ts`（新） | 四尺寸 E2E | V42-1 起、V42-3 起 |
| `verification/revamp-v42.capture.config.ts`（新）、`verification/revamp-v4-capture/metrics.spec.ts`、`scripts/lighthouse-pages.mjs` | 畫面基準（64＋新畫面）、First Load 門檻、`SPLIT_SENTINELS`、第六步 timespan | V42-0 起 |
| `tests/backup-schema-v5.test.ts`、`backup-restore-matrix.test.ts`、`workspace-backup.test.ts`、`auto-save.test.ts` | `channel_settings` 的矩陣 | V42-1 |
| `package.json`、`package-lock.json` | 版本 4.2.0 | V42-6 |
| `README.md`、`docs/RELEASES.md`、`docs/ENGINEERING.md`、`tests/release-notes.test.ts`、`docs/revamp-v4/usability-test.md` | 發布紀錄（含備份相容提示）、T7、T8 | V42-6 |
| `docs/revamp-v4.2/*` | v4.2 規格、批次、拍板、名詞、套件說明 | 每批對照與更新進度 |
