# EC ProfitLens — Claude Code 工作指令（Revamp v4）

EC ProfitLens 是「電商獲利診斷與決策工作台」：匯入三份日粒度 CSV（銷售、通路費用、廣告），依序計算淨營收、商品毛利、扣廣告前貢獻、扣廣告後貢獻四層，做兩期比較、九項金額橋接、規則健檢、假設試算、待辦與會議輸出。所有金額由 `src/domain` 的純函式計算，每個數字可追溯到 CSV 檔名與行號。

產品名稱為 **EC ProfitLens**（D-V3-25）。使用者看得到的名稱一律寫 EC ProfitLens；技術識別不改：package 名 `profitlens`、下載檔名前綴 `profitlens-`、備份 schema 字串、`dataset_id`、網址 `profitlens-tau.vercel.app`。

本輪目標（Revamp v4，基準 v3.0.0＝tag `v3.0.0`＝commit `625bfa5`，目標 v4.0.0（D-V4-1＝B））：使用者 2026-10-08 的指令是「改版：將全站加入更多專業視覺化元素，以專業圖表的方式呈現為主要」。**把每一頁的主要閱讀任務都先用一張專業圖回答，表格退為核對與替代；不新增財務口徑、不刪任何功能（只能搬移、合併、收合、改名）、不加依賴。** 使用者已於 2026-10-08 授權依 PRD 開工（「都依建議值，開工」），D-V4-1–35 全部依建議值，決定見 `docs/revamp-v4/09_DECISIONS_PENDING.md`。

## 先讀什麼（每個 session 都要）
1. `AGENTS.md` — 專案既有規則，**優先級最高**；本檔只補充，不覆蓋。
2. `docs/revamp-v4/00_README.md` — v4 套件的用法、批次順序、人工關卡、驗收命令。
3. 當批任務：`docs/revamp-v4/06_BATCHES.md` 中指定的 V4 批次（含「允許變動畫面」）、`docs/revamp-v4/CHART_CATALOG.md` 中該批的實作卡，以及該批引用的 `docs/revamp-v4/01_PRD.md` 章節（用 Read 的 offset／limit 讀需要的段落）。
4. 拍板與名詞：`docs/revamp-v4/09_DECISIONS_PENDING.md`、`docs/revamp-v4/GLOSSARY.md`（v4 增補）、`docs/revamp-v3/GLOSSARY.md`。
5. 財務口徑：`docs/METRICS.md`、`docs/DATA_CONTRACT.md`、`docs/SCENARIOS.md`。

v3 套件 `docs/revamp-v3/*` 保留為歷史紀錄；v3 PRD 的 §5.2 X1–X25、§4.3 刻意不採用、§8 語言規範、§9 token 與元件、§11 非功能仍然有效（X18 的改寫依 D-V4-33）。v2 套件 `docs/revamp/*` 只是歷史紀錄。與 v4 文件衝突時以 v4 為準，與 AGENTS.md 衝突時以 AGENTS.md 為準。

## 本輪的硬規則（補充 AGENTS.md）
- **一次只做一個批次（V4-0a–V4-11，共 16 批），一批就是一個工作階段，不跨批。** 批次完成前不開始下一批；每批結束要有可運行、全部檢查通過的狀態。批次太大時要在**開工前**拆成 V4-{n}a／b 並寫進 `06_BATCHES.md`。元件、token、B 級函式與第一個使用它的頁面同批交付。
- **人工關卡不屬於任何批次**：H5（v4 設計稿審查，審 V4-0b 產出）擋 V4-1，使用者可比照 v3 略過；H6（v4 複測與盲評，同場量 v3 正式站）擋 v4.0.0 正式上線。沒完成時 `docs/STATUS.md` 寫「未執行／待人工」，不可寫成完成。
- **拍板**：以 `docs/revamp-v4/09_DECISIONS_PENDING.md` 的「決定」欄為準。之後新出現的待決事項，沒有使用者明確回覆就不視為核准，拍板前沿用 v3.0.0 的行為與用詞。v3 尚待拍板的 D-V3-26／27／29–37 依 D-V4-29 對照表處理。**任何部署（含 Vercel preview）都要使用者當次明確同意**（D-V4-28 只定策略）。
- **財務核心禁區**：`src/domain/*`、`fixtures/*`、`metric_version = contribution-v1`、`assist-kpi-v1`、`breakeven-mer-v1`、`docs/METRICS.md` 的公式，V4-0a–V4-11 完全不動；`assist-kpi-v1`、`breakeven-mer-v1` 的常數與算式在 `src/application/assist-kpi.ts`、`src/application/breakeven-mer.ts`，這兩個檔與既有測試 `tests/assist-kpi.test.ts`、`tests/breakeven-mer.test.ts` 一個字都不改（只能呼叫）。**v4 的禁區白名單為空**，不新增任何 `fixtures/` 檔（合成資料放 `tests/fixtures/synthetic-4-channel/`）。新圖只重新呈現既有數字；需要產生新數值（加總、佔比、累計、計數、分階、分段）時，只在 `src/application`，每個函式一個獨立版本常數（例如 `channel-structure-v1`）與手算 golden；只排序或挑選既有值屬純呈現。`ratioMetric` 遇分母 ≤ 0 一律回傳 null，商品毛利為負的累計佔比要先取反成正的負值額。每批驗收都要跑四條禁區命令，結果寫進驗收文件，四條都必須為空；**不可用 `main` 比對**：
  - `git diff --stat 625bfa5 -- src/domain fixtures docs/METRICS.md`（或 tag `v3.0.0`）
  - `git diff --stat 82b70df -- src/domain fixtures/golden fixtures/demo fixtures/errors fixtures/refund_only fixtures/zero_ad docs/METRICS.md`（或 tag `v2.0.0`）
  - `git diff --stat 625bfa5 -- src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts`
  - `git status --porcelain -- src/domain fixtures docs/METRICS.md src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts`（`git diff` 看不到未追蹤的新檔）
  - commit 之後再跑 `git diff --stat 625bfa5 HEAD -- （上面第一條與第三條的路徑）`，必須為空，commit hash 寫進驗收文件
- **顯示格式只在呈現層**：萬／億、HALF_UP、U+2212、`favorableDirectionOf`、軸刻度（`formatAxisWan`）、熱表格內格式（`formatHeatCell`）只改 `src/application/presentation.ts`、`copy.ts`。測試的數字斷言改成呼叫格式化函式，不可為了讓測試過而改 golden 數字（本期 255.00、差額 −315.00、試算 284.00／264.00／19.70）。
- **標籤單一來源**：所有使用者看得到的中文（含 aria-label、caption、資料表 summary、匯出標題列、PDF 圖說、PPT 圖標題與輔助系列名、Excel 工作表名、週會摘要、錯誤訊息）集中在 `src/i18n/labels.zh-TW.ts`。新 key 只放 `tests/labels-structure.test.ts` 的 `V4_NEW_KEY_PREFIXES` 允許的 `{group}.chartsV4.*`，每批加「── V4-n 錨點」註解；既有字串一字不改（`verification/revamp-v4/labels-v3.flat.json` 的 2,581 個葉節點逐鍵逐字相同）；JSX 內不新寫中文；指標名一律取 `metricDefinitions`。
- **測試斷言的字串跟著標籤走**：一律 `import { labels } from "@/i18n"` 再斷言；新圖只用 testid 與 labels 斷言；`verification/revamp-v4/e2e-text-assertions.csv` 每批勾銷。測試失敗不是「跳過」的理由。
- **圖表規範（v4 新增，細節見 PRD §7 與 `CHART_CATALOG.md`）**：
  - 只用既有 Recharts 3.10.1（新圖只用 source 已 import 的 `LineChart`、`BarChart` 與其子元件；`ScatterChart` 只在 `*-lazy.tsx` 以 `next/dynamic` 載入）或 inline SVG；PPT 只用 pptxgenjs 的 `addChart`（`bar`、`line`）或 `addShape`，不用圖片 API；xlsx 不畫圖，只加「圖表資料」工作表。新元件放 `src/components/charts/`。
  - 每張圖放在 ChartFrame（C16）內；標題是結論句（每個子句 ≤ 14 字）、副標當 aria 描述；圖容器 `aria-hidden`、圖內 0 個可聚焦元素；Recharts 一律 `accessibilityLayer={false}`、`isAnimationActive={false}`、`ResponsiveContainer` 給 `initialDimension`；每張圖有 `<details>` 資料表（C33 產生）或表本身（熱表用 ChartFrame `mode="table"`，不放進 `aria-hidden`，整張 1 個 Tab 停留點）。
  - 每頁主層常駐獨立圖區塊（`section.chart-section`）≤ 3（總覽 4 例外）；能用表格內嵌條（C24）就不開新區塊；PRD §2.3「刻意不加圖」欄的位置不加圖。
  - 一套記號：本期實心（強調色只給本期資料）、上期灰、去年同期灰虛線、目標空心 2×12 刻度、資料待補虛線框；只有不利上色、有利不用綠（D-V3-7）；非本期序列（含試算點）用 `--chart-total`；同一指標同尺度、不同指標的小倍數各自尺度；長條、瀑布、變異、堆疊、bullet、Pareto、累計線一律從 0 起；一張圖一個數值軸。
  - 色只經 `src/application/chart-theme.ts` 讀 `:root` token；元件內不得有 hex、`var(--chart-` 字串常值、漸層、濾鏡、圖樣；固定圖高只用 `chartHeights`，依列計高的 svg 只用 `chartRowHeights` 的倍數，字級只用 `chartFontSize`。
  - X1–X25（v3）與 X26–X40（v4）全部有效：不做 gauge、健康分數、滿版紅綠燈、3D、漸層、樹狀圖、桑基、漏斗、圓餅、雷達、區域圖、雙數值軸、brush、zoom、動畫、彩色圓點圖例；不加總不能相加的數字（不同健檢規則、不同通路的方案）；投影、PDF、PPT 的橋接主圖一律是瀑布（X18、X39；X18 依 D-V4-33 改寫為「不得以分歧長條取代瀑布當橋接主圖」）；未滿 7 天的週不當完整週畫（X40）。
  - 試算圖只畫使用者明填或系統已算出的既有點（是否連線依 D-V4-20），x 固定 [−90%, +100%]，不外插、不代填（`docs/SCENARIOS.md:12、64、68`）。
- **棘輪與基準（V4-0a 建立，每批都跑）**：`tests/design-lint.test.ts`（上限 `tests/fixtures/design-lint-ceiling.json`）、`tests/copy-style.test.ts`、`tests/chart-lint.test.ts`（上限 `tests/fixtures/chart-lint-ceiling.json`）的數值只能下降；`tests/testid-baseline.test.ts` 對 `verification/revamp-v3/testids-v2.txt`、`verification/revamp-v4/testids-v3.txt` 與 `verification/revamp-v4/testids-v4-added.txt`（V4-1 起每批追加本批新增的 testid）的刪除數都必須為 0；`tests/mounted-testids.test.tsx` 每批都跑（頁面狀態在 `tests/helpers/page-states.tsx` 的錨點後新增，M1 測試在 mounted-testids 的錨點後新增；收進 `<details>`、投影隱藏的圖保持掛載；同一控制只有一個 DOM 實例；`chart-` 開頭的 testid 在實例容器外恰好一次）；`verification/revamp-v4-capture/metrics.spec.ts`：V4-0a 起 B2（1440：一句話頂 ≤ 192、KPI 帶底 ≤ 420、三件事首列底 ≤ 561；1280：KPI 帶底 ≤ 420，另兩項不晚於 V4-0a 實測；390：扣廣告後貢獻值頂 ≤ 295）、B3（390 無頁面橫向捲動）、B5（First Load JS gzip ≤ 545,397 bytes）硬斷言，B1、B9 只記錄；V4-1 起 B9（各頁 DOM 節點數 ≤ V4-0a 基準＋1,500）、各頁 B1 依 `06_BATCHES.md` 護欄表的時程硬斷言；`tests/copy-density.test.ts` 七頁的否定句上限＝V4-0a 實測，只降不升；畫面基準每批先複製前一批的 `snapshots/` 再比對，只允許該批「允許變動畫面」有差異；`verification/revamp-v4/feature-retention.csv` 中 `batch` 欄等於本批的列全部打勾，該批才算完成，V4-11 全表打勾。
- **依賴**：本輪「允許新增依賴」清單為**空**。需要新依賴時一律先問。
- **隱私與公開站邊界不變**：不加登入、資料庫、伺服器端保存；原始 CSV 不上傳；`APP_MODE=PUBLIC_DEMO`、`ENABLE_LIVE_AI=false`、`/api/insights` 的 server 端封鎖邏輯不動；不碰 `.env*`、`vercel.json`。本機保存仍須使用者同意；分析事件只記事件名（新增 `chart_clicked`、`chart_table_opened` 依 D-V4-14）；不加 PNG／SVG 下載入口，`network-log.spec` 的下載集合不變。
- **可追溯性不變**：每個金額（含圖上的柱、點、段、格與內嵌條所屬的格）都能開「計算與來源」，圖上點擊與資料表 number-link 用同一個 builder；抽屜標題下一行永遠顯示到分的精確值；新算出的衍生值帶 `formula`、`components` 與 `metricVersion`，直接取自 domain 的值維持 `contribution-v1`、整理函式版本放 `arrangeVersion`；累計、費用合計這類水準值帶 `valueKind: "level"`（抽屜不帶正負號）；`name` 只借單位時證據自帶 `title`、`definition`、`formulaTechnical`；下鑽篩選擴充日期與 SKU，只過濾原始明細不重算。例外只有 PRD §8.7 列的試算結果、會議凍結值、匯入對帳（v3 起就不是 number-link）。
- **a11y 與 testid 不退步**：既有 `data-testid`、`aria-*`、`role="status"`、`<details>/<summary>` 收合結構要保留；移動區塊時一起搬，不刪。新 testid 用 `chart-{page}-{id}`、`chart-{page}-{id}-{bar|point|seg|cell|spark}-{語意 key}`、`chart-{page}-{id}-table`，不用陣列索引、不以 `kpi-` 開頭。任何 Tab 停留點都不在 `[aria-hidden=true]` 內。Lighthouse Accessibility 不低於同頁基準且 ≥ 95；四尺寸 axe 0 個 serious。
- **程式風格**：沿用既有風格（Tailwind v4 + `globals.css` 自訂 class、長行 JSX）。不要為了格式化重寫整檔；只改動需要的區塊；新樣式引用 `:root` token，不寫死色碼；新 token 同批加進 `scripts/contrast-check.mjs` 的 PAIRS 與 `tests/chart-theme.test.ts`。
- **文件同步**：每批結束更新 `docs/STATUS.md`（真實執行結果；未執行寫「未執行」）、必要時在 `docs/DECISIONS.md` 加一筆決策、把本批驗收寫到 `verification/revamp-v4-V4-{n}-acceptance.md`，截圖與量測存 `verification/revamp-v4/V4-{n}/`；`06_BATCHES.md` 的進度欄同步。

## 驗收命令（每批都要全部跑，照這個順序，貼真實輸出摘要）
```bash
npm ci                 # 全新環境或 lockfile 變動時
npm run typecheck
npm run lint           # eslint --max-warnings=0
npm run audit:ui -- --json verification/revamp-v4/V4-{n}/ui-audit.json   # 數值寫進驗收文件；只有帶 --json 才寫檔
npm run contrast-check # scripts/contrast-check.mjs
npm test -- --run      # 含 design-lint、copy-style、copy-density、testid-baseline（v2＋v3＋v4 新增）、mounted-testids、chart-lint、labels-structure
npm run build
NETWORK_LOG_OUT=verification/revamp-v4/V4-{n}/network-log.json KEYBOARD_WALK_OUT=verification/revamp-v4/V4-{n}/keyboard-walk.json AXE_OUT=verification/revamp-v4/V4-{n}/axe.json npm run test:e2e
                       # 首次需 npx playwright install chromium；自己在 3100 埠起 LOCAL 伺服器，必須在下面的 PUBLIC_DEMO 伺服器啟動前跑完
NEXT_TELEMETRY_DISABLED=1 npm run build
APP_MODE=PUBLIC_DEMO PUBLIC_DEMO=true ENABLE_LIVE_AI=false npm start -- --port 3100 &
CAPTURE_BATCH=V4-{n} npx playwright test --config verification/revamp-v4.capture.config.ts   # V4-0a 新增（V4-0a 開工時 capture config 還不存在，由本批建立）
npx -y lighthouse@13.5.0 --version   # 只在第一次：建立 npx 快取
node --no-warnings scripts/lighthouse-pages.mjs --base http://127.0.0.1:3100 --out verification/revamp-v4/V4-{n}
lsof -ti tcp:3100 | xargs kill   # 停掉 PUBLIC_DEMO 伺服器（每次 Bash 呼叫都是新 shell，取不到 $!）；之後 lsof -ti tcp:3100 必須沒有輸出
git diff --stat 625bfa5 -- src/domain fixtures docs/METRICS.md   # V4-0a 新增
git diff --stat 82b70df -- src/domain fixtures/golden fixtures/demo fixtures/errors fixtures/refund_only fixtures/zero_ad docs/METRICS.md
git diff --stat 625bfa5 -- src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts   # V4-0a 新增
git status --porcelain -- src/domain fixtures docs/METRICS.md src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts   # V4-0a 新增
# commit 之後：git diff --stat 625bfa5 HEAD -- （同上第一條與第三條的路徑），必須為空，commit hash 寫進驗收文件
```
本機預覽：`npm run dev`，網址 http://127.0.0.1:3000 。E2E 的四種視窗：1440×1000、1280×900、768×1024、390×844。

## 每批回報格式（繁體中文）
1. 完成項目（對照 `docs/revamp-v4/06_BATCHES.md` 的該批範圍，逐項標 完成／部分／未做＋原因）
2. 變更檔案清單（新增／修改／刪除）
3. 驗收命令與真實結果（通過數、失敗數、未執行），含禁區四條命令與 commit 後的 diff（附 commit hash）、棘輪數值（design-lint、copy-style、copy-density、chart-lint）、testid 刪除數（v2、v3、v4 新增三份）、First Load JS、DOM 節點數、390 的五個 TBT 與 loadavg、畫面基準差異（只列允許變動的畫面）
4. 瀏覽器驗收方式與截圖路徑（四尺寸至少各一張）
5. 已知限制與風險
6. 下一批建議、被擋住的人工關卡，以及需要人拍板的事項（對照 `docs/revamp-v4/09_DECISIONS_PENDING.md`）

## 檔案地圖（改版會碰到的）
| 位置 | 內容 | v3 動作（已完成） | v4 批次 |
|---|---|---|---|
| `src/components/overview/charts/chart-frame.tsx` | C16 圖表框（標題、副標、圖例、takeaway、四態固定高、資料表） | V3-4b 建立 | V4-1 加 `aside`、`unitNote`、`frameClassName`、`legend[].shape`、`page`；V4-3b `mode="table"`；V4-4 `headingLevel`；V4-5 `variant="inline"` |
| `src/components/overview/charts/bridge-section.tsx`、`profit-section.tsx`、`waterfall-svg.tsx` | G1、G2 瀑布（C17） | V3-4b 建立 | V4-1 搬進 ChartFrame、`bare`、共同尺度、`formatAxisWan`、G6 變異條（依 D-V4-33） |
| `src/components/overview/charts/trend-section.tsx`、`channel-section.tsx` | G3 趨勢、G4 各通路 | V3-4b、V3-9b | V4-2 刻度、G4 差額條（D-V4-16 選 B 時改啞鈴） |
| `src/components/overview.tsx`、`overview/kpi-band.tsx`、`overview/assist-table.tsx` | 總覽、KPI 帶、其他常用指標表 | V3-4、V3-9a | V4-2 G5 MER 列、G7a sparkline；V4-10 G8（進階區） |
| `src/components/overview/charts/bullet.tsx`（新檔，尚不存在） | C18 Bullet（由 `overview.tsx:43-51` 的 `targetBar` 抽出） | —（V4-2 新建） | V4-2 |
| `src/components/charts/`（新目錄） | C19、C24–C31、C33、C35、`products-scatter-lazy.tsx`（檔名見 PRD §6.3） | — | 與第一個使用它的頁面同批交付 |
| `src/components/diagnosis-list.tsx`、`workspace-panels.tsx`（Diagnosis）、`channel-table.tsx` | 健檢清單、通路寬表 | V3-5 | V4-3a G9、G10、G7b；V4-3b G11、G12 |
| `src/components/product-comparison-panel.tsx`、新 `src/components/product-evidence.ts` | 商品頁、前 10 名表、完整表 | V3-5 | V4-4 G13、G14（前 10 名表改 `after` 常駐；沒有負值時 `product-worst` 照 v3 原樣）；V4-10 G24 |
| `src/components/decision-workbench.tsx`、`scenario-sensitivity.tsx` | 試算方案欄、比較表、門檻 | V3-6 | V4-5 G15、G16 |
| `src/components/actions-workbench.tsx` | 待辦看板與清單 | V3-6 | V4-10 G17 |
| `src/components/meeting-page.tsx` | 會議紀錄 | V3-7 | V4-6 G15 會議實例、G19（G18 取消） |
| `src/components/workspace-panels.tsx`（DataWorkspace）、`issue-list.tsx`、`import-wizard/step-review.tsx` | 資料來源、問題表、匯入精靈步驟 4 | V3-8 | V4-7a G20、G21、`IssueList` 篩選；V4-7b G22 |
| `src/components/evidence-drawer.tsx`、新 `src/application/evidence-ladder.ts` | 計算與來源抽屜 | V3-5、V3-9b | V4-2 `arrangeVersion`；V4-3a `valueKind`、`ladderMetrics` 修正；V4-3b 篩選加日期與 SKU；V4-7b G23、`ladderMetrics` 搬移 |
| `src/application/chart-theme.ts`、`src/app/globals.css` | 圖表色、高與列高的單一來源、`:root` token | V3-1、V3-4b | V4-1 `chartRowHeights`（D-V4-33 未回覆時順延到 V4-2）；V4-2、V4-3a、V4-3b 新 token；V4-7a `chartRowHeights.axis`；V4-8 投影白名單與 `--text-12`、`--text-13` 對應 |
| `src/application/presentation.ts` | 格式化、`metricDefinitions`、`formatAxisWan`、`formatHeatCell` | V3-2b | V4-1 `formatAxisWan`；V4-3b `formatHeatCell` |
| `src/application/evidence-filter.ts` | 下鑽篩選 | V3-9b | V4-3b 加 `date`、`sku` |
| `src/application/pnl-table.ts` | 管理損益表 | V3-9b | V4-10 由 `dayColumns` 抽出並匯出 `periodDailyMetrics`（輸出不變） |
| `src/application/chart-*.ts`（`chart-assist-weeks`、`chart-structure`、`chart-channel-weeks`、`chart-heatmap`、`chart-pareto`、`chart-threshold`、`chart-meeting`、`chart-coverage`、`chart-issues`、`chart-cumulative`、`chart-actions`） | B 級整理函式（各一個版本常數＋手算 golden） | — | V4-2 到 V4-10，見 `CHART_CATALOG.md` §9.2 |
| `src/application/workspace.ts` | 快照、`weeklyRows`、`yoy` | V3-9b | V4-2 週列加 `units_sold`（`channelWeeks` 不放進快照，V4-3a 在健檢頁元件內計算） |
| `src/components/print-summary.tsx`、`src/application/pptx-export.ts`、`excel-export.ts`、`export-theme.ts`、`export-variants.ts` | 列印／PDF、PPT、Excel、匯出色與變體 | V3-7、V3-9b | V4-9a C31、C32、`EXPORT_THEME` 圖表色、`ExportVariantSpec.charts`；V4-9b C34（含版本列）、Markdown 九項差額表 |
| `src/i18n/labels.zh-TW.ts` | 標籤字典 | V3-2、V3-10 移除 alias | 每批在 `{group}.chartsV4.*` 錨點新增 |
| `tests/labels-structure.test.ts`、`verification/revamp-v4/labels-v3.flat.json` | labels 結構與既有字串快照 | V3-2b 建立（v2 字串快照） | V4-0a 加 `V4_NEW_KEY_PREFIXES` 與 v3.0.0 全部葉節點快照 |
| `scripts/lib/copy-scan.mjs` | copy-style 掃描 | V3-0 建立 | V4-0a L1 樣式加 `chartsV4.*.title` |
| `scripts/lib/chart-scan.mjs`、`tests/chart-lint.test.ts`、`tests/fixtures/chart-lint-ceiling.json` | chart-lint CL-1–CL-11（AST 掃 `src/components/charts/**`、`src/components/overview/charts/**`，CL-3 的 `var(--chart-` 禁令擴到 `src/components/**`；CL-1、CL-2、CL-9、CL-11 用 SSR） | — | V4-0a 建立；每批跑 |
| `tests/testid-baseline.test.ts`、`verification/revamp-v4/testids-v3.txt`、`verification/revamp-v4/testids-v4-added.txt`、`verification/revamp-v4.config.ts`、`verification/revamp-v4/collect-testids.spec.ts` | testid 基準（v2、v3、v4 新增三份） | V3-0 建立 v2 基準 | V4-0a 加 v3 基準（三步產生）與空的 v4 新增清單；V4-1 起每批追加 |
| `tests/mounted-testids.test.tsx`、`tests/helpers/page-states.tsx`（新檔） | 掛載與唯一性（M1、M6）；頁面狀態 | V3-3 建立 | V4-0a 把 `shellPage`、`load`、`wizardFiles`、`pageStates`、`statusShells` 原樣搬到 helper 並匯出，加 `chart-` testid 唯一性斷言（不改 `INSTANCE_CONTAINER`）；每批在兩個檔的錨點後新增 |
| `tests/copy-density.test.ts` | 主層否定句上限（B8） | V3 建立（五頁各 ≤ 3） | V4-0a 改為實測值並加商品、待辦兩頁；之後只降 |
| `tests/e2e/keyboard-walk.spec.ts` | 鍵盤走查 | V3-10 建立 | V4-0a 加 `[aria-hidden=true]` 停留點斷言；V4-3b 熱表 Tab 數；V4-4 商品頁資料表 summary 里程碑；V4-8 補齊其餘頁 |
| `scripts/lighthouse-pages.mjs` | Lighthouse 流程 | V3-0 建立 | V4-0a 加資料來源、待辦兩頁 |
| `verification/revamp-v4.capture.config.ts`、`verification/revamp-v4-capture/` | 52 張畫面基準、metrics.spec v4、畫面 13 用的 `targets.csv` | v3 版在 `verification/revamp-v3*` | V4-0a 建立；每批跑 |
| `verification/revamp-v4/feature-retention.csv`、`e2e-text-assertions.csv` | 功能保留（延續 v3 的 113 列再加圖表列）、E2E 文字斷言 | v3 版在 `verification/revamp-v3/` | V4-0a 建立；每批打勾、勾銷 |
| `tests/fixtures/synthetic-4-channel/` | 4 通路合成資料 | — | V4-0b 建立（D-V4-31） |
| `docs/revamp-v4/01_PRD.md`、`CHART_CATALOG.md`、`06_BATCHES.md`、`09_DECISIONS_PENDING.md`、`00_README.md`、`GLOSSARY.md`、`usability-test.md` | v4 規格、實作卡、批次、拍板、套件說明、名詞、可用性測試 | — | V4-0a 定稿與產出；每批對照與更新進度 |
