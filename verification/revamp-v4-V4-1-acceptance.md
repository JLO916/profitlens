# Revamp v4 V4-1 驗收：總覽拆解與圖表框（G1、G2、G6）（2026-10-08）

依 `docs/revamp-v4/06_BATCHES.md`「V4-1 總覽拆解與圖表框」、`docs/revamp-v4/CHART_CATALOG.md` 的 G1、G2、G6 實作卡、PRD §4、§6.1、§6.3、§7、§8.7。依賴：V4-0b 完成；**H5 使用者 2026-10-08 回報通過**；D-V4-4、5、7、14、30、33 已依建議值拍板（D-V4-33＝B，X18 已改寫）。D-V4-41 尚未回覆：V4-1 依已核准的 06 V4-1 驗收（「兩張瀑布刻度相同」「G2 切到 MARKETPLACE 時刻度含負值」）與 H5 通過的設計稿實作共同尺度，效果等同 D-V4-41＝A（`docs/DECISIONS.md` 2026-10-08「H5 通過與 V4-1 開工」）。

工作方式：先提交開工錨點 `594b3da`（H5、D-V4-41 處理方式、X18 改寫、`globals.css` 三段錨點）。代理 A（ChartFrame 擴充、瀑布、共同尺度、刻度格式、390 鍵盤修正，`5df8e88`）與代理 B（C24 BarCell、`chartRowHeights`，`470b727`）並行；代理 C 合併兩者後接 G6（`2806b46`）；代理 E 合併 C 後寫 E2E 與量測規格並跑全套（`8a0c089`）。依序合併（`93a625b`、`6827419`、`29dca66`、`3b5c08a`，無衝突）。主流程審查時拿掉共同尺度的模組層級 WeakMap 快取（`94ef9fb`，AGENTS.md「不得用模組全域變數保存使用者資料」），之後在主 checkout 跑完整驗收並收尾提交。

## 1. 完成項目（對照 06_BATCHES V4-1）

| 項目 | 狀態 | 說明 |
|---|---|---|
| C16 ChartFrame 擴充（向下相容） | 完成 | `aside`（輸出 `div.frame-grid.has-aside`，旁欄 DOM 在前，≥ 1024 以 grid 放回右欄 7fr／5fr）、`unitNote`、`frameClassName`、`legend[].shape`（line、dash、tick、ring、rect，沒有實心點與方塊）、`mode` 型別（`table` 留給 V4-3b）、`page`（沒給 testId 時區塊 testid＝`chart-{page}-{id}`）；另加 `scrollLabel`（見下方鍵盤修正）。資料表 `<details>` 展開時 `track("chart_table_opened")`。沒給新 props 時輸出與 v3 逐字相同（`tests/chart-frame-v4.test.tsx` 17 個測試） |
| C17 `bare` 與 `domain`；兩張瀑布同尺度 | 完成 | `overviewWaterfallDomain(snapshot)`＝G1 的柱加上 `profitWaterfallScopes` 全部範圍（合計、每個通路）的 G2 柱，取水位最低與最高；兩個 section 各自以 `useMemo` 計算（不做模組層級快取）。示範資料 domain [−61,169.93, 7,850,657.90]，兩張圖刻度都是 −200 萬、0、200 萬、400 萬、600 萬、800 萬（下界只延伸一個步長）；golden domain [−15.00, 2,470.00]。純呈現，不產生金額，不加版本常數 |
| `formatAxisWan`；`waterfallTickLabels` 改呼叫它 | 完成 | `src/application/presentation.ts`；整萬步長寫整數萬，不出現「.0 萬」；0 寫「0」；負值 U+2212；`waterfallTickLabels` 既有 4 組輸出逐字相同（`tests/format-layers.test.ts`） |
| G1、G2 搬進 ChartFrame | 完成 | `className` 保留 `bridge-section`、`profit-section`，既有 testid、`.bridge-total`、`.unit-note`、`bridge-balance-check`、`#bridge-title` 不變；兩個 section 內各恰好 1 個 `.chart-frame`；1440 橋接表在圖右欄，768 與 390 在上 |
| G6 橋接表內嵌變異條（D-V4-33＝B） | 完成 | 九個差額列的金額格內、number-link 之前各一個 BarCell variance（`chart-overview-bridge-bar-{metric}`），共同尺度＝九項差額最大絕對值；只有不利上色，有利為灰；≤ 767 顯示，≥ 768 與列印隱藏但掛載；條 `aria-hidden`、不可聚焦，點條記 `chart_clicked` 並開同列的抽屜（evidence 與 number-link `toEqual`）；缺值列不畫條、0 值只畫零線 |
| `track("chart_clicked")`、`track("chart_table_opened")`（D-V4-14） | 完成 | `AnalyticsEvent` 新增兩個事件名，只記事件名；瀑布柱維持 `waterfall_clicked`（不重複記） |
| 390 瀑布外框的 `aria-hidden` 停留點（V4-0a 量到） | 完成 | 外框不帶 `aria-hidden`，改 `role="region"`＋`aria-label`（`shell.chartsV4.common.chartRegion`＝「{title}（圖）」），內容比框寬時才 `tabIndex=0`；svg 仍 `aria-hidden`。`KNOWN_ARIA_HIDDEN_STOPS` 兩列已刪，四尺寸 `aria-hidden` 內停留點 0；768 另加一條總覽走查 |
| D-V4-35 | 不做 | D-V4-35＝A，本期一句話不改 |
| 同批 labels 與測試 | 完成 | labels 新增 1 個 key（`shell.chartsV4.common.chartRegion`）；`overview.chartsV4.*` 0 個（G6 條不帶文字）。單元：`chart-frame-v4.test.tsx`（新，17）、`bar-cell.test.ts`（新，22）、`overview-g6.test.tsx`（新，11）、`overview-charts-waterfall.test.tsx`、`format-layers.test.ts`、`chart-theme.test.ts`、`mounted-testids.test.tsx`（V4-1 錨點）。E2E：`charts-overview.spec.ts`（新，6 條 × 4 尺寸）、`chart-helpers-v4.ts`（新）、`revamp-r1-layout.spec.ts`（`CHART_FRAMES` 改自動收集 `main .chart-frame:visible`）、`keyboard-walk.spec.ts`（刪已知停留點、加 768）、`verification/revamp-v4-capture/metrics.spec.ts`（V4-1 起 1280 B2、B9、B1 總覽硬斷言） |

## 2. 變更檔案

- 新增：`src/components/charts/bar-cell.tsx`、`tests/bar-cell.test.ts`、`tests/chart-frame-v4.test.tsx`、`tests/overview-g6.test.tsx`、`tests/e2e/charts-overview.spec.ts`、`tests/e2e/chart-helpers-v4.ts`、本文件、`verification/revamp-v4/V4-1/`（量測、截圖基準、Lighthouse）。
- 修改：`src/app/globals.css`（只在 V4-1 A、B、C 錨點內）、`src/application/{analytics.ts,chart-theme.ts,presentation.ts,waterfall.ts}`（只新增）、`src/components/overview/charts/{chart-frame.tsx,bridge-section.tsx,profit-section.tsx,waterfall-svg.tsx}`、`src/i18n/labels.zh-TW.ts`（1 個新 key）、`tests/{chart-theme.test.ts,format-layers.test.ts,mounted-testids.test.tsx,overview-charts-waterfall.test.tsx}`、`tests/e2e/{keyboard-walk.spec.ts,revamp-r1-layout.spec.ts}`、`verification/revamp-v4-capture/metrics.spec.ts`、`verification/revamp-v4/{testids-v4-added.txt,e2e-text-assertions.csv,feature-retention.csv}`、`docs/revamp-v4/CHART_CATALOG.md`（G1 E2E 草案與 `scrollLabel` 一列）、`docs/STATUS.md`、`docs/DECISIONS.md`、`docs/revamp-v4/{00_README.md,06_BATCHES.md}`。
- 零改動：`src/domain`、`fixtures`、`docs/METRICS.md`、`src/application/{assist-kpi.ts,breakeven-mer.ts}`、`package.json`、`package-lock.json`、`.env*`、`vercel.json`。

## 3. 驗收命令與真實結果

| 命令 | 結果 |
|---|---|
| `npm ci` | 未執行（lockfile 沒有變動） |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run audit:ui -- --json verification/revamp-v4/V4-1/ui-audit.json` | design 15 項與 V4-0b 相同（hex 0、圓角 4、字級 11、字距 0、箭頭 3，其餘 0）；labels 同義詞 12、其餘 0；資訊欄：靜態 testid 相異 251（V4-0b 253：`bridge-section`、`profit-waterfall` 改由 ChartFrame 的 `testId` 屬性輸出，testId 屬性 11 變 13，渲染出的 testid 不變）、class 816（＋7） |
| `npm run contrast-check` | 75／75 通過（本批沒有新 token） |
| `npm test -- --run` | **129 檔／2,539 測試全過**（V4-0b 126／2,474） |
| `npm run build` | exit 0 |
| `npm run test:e2e`（四個視窗，帶三個 `*_OUT`） | **813 passed、0 failed、15 skipped（23.9 分鐘）**；新增 charts-overview 24 條（21 執行、3 條點條測試只在 390 跑）與 768 鍵盤走查 4 條（只在 tablet 跑），skipped 由 9 變 15。跑完還原 E2E 改寫的追蹤證據檔 |
| PUBLIC_DEMO build 與伺服器（3100） | exit 0；`GET /` 200 |
| `CAPTURE_BATCH=V4-1 npx playwright test --config verification/revamp-v4.capture.config.ts`（先複製 V4-0b 的 52 張） | 第 1 次 19 passed、4 failed、5 skipped：差異共 6 張，全部在允許範圍（desktop 的 01、02、03，laptop、tablet、mobile 的 02）；其餘 46 張 0 差異 |
| 同上加 `--update-snapshots=changed`（只跑 baseline） | 16 passed；與 V4-0b 不同的檔正好是上述 6 張 |
| 同上第 2 次（完整） | **23 passed、5 skipped**，52 張全部通過；metrics 硬斷言全部通過 |
| Lighthouse × 3（開跑前 1 分鐘負載 3.99、3.16、3.82） | 三次都 exit 0 |
| `lsof -ti tcp:3100 \| xargs kill`；`lsof -ti tcp:3100` | 已停，沒有輸出 |
| `git diff --stat 625bfa5 -- src/domain fixtures docs/METRICS.md` | 空 |
| `git diff --stat 82b70df -- src/domain fixtures/golden fixtures/demo fixtures/errors fixtures/refund_only fixtures/zero_ad docs/METRICS.md` | 空 |
| `git diff --stat 625bfa5 -- src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts` | 空 |
| `git status --porcelain -- （同上全部禁區路徑）` | 空 |
| commit 之後的禁區 diff | 收尾提交後執行，結果補在本表下一版 |
| 合併後隱藏字元掃描 | 0 |

**棘輪與基準數值**

| 項目 | V4-1 | 與基準 |
|---|---|---|
| design-lint 15 項、copy-style、copy-density | 不變 | 上限檔不動 |
| chart-lint CL-1–CL-11 | 全部 0 | 不變 |
| testid 刪除數（v2、v3、v4 新增） | 0、0、0；`testids-v4-added.txt` 新增 9 列（G6） | — |
| labels 快照 | 2,581 個鍵逐字相同；新 key 1 個（在 `shell.chartsV4`） | — |
| First Load JS gzip（B5） | 520,984 bytes（V4-0a 519,426，＋1,558；門檻 545,397）；禁止符號全 0 | 通過 |
| B2 首屏（1440／1280／390） | 一句話頂 192／192／116、KPI 帶底 419／419／555、三件事首列底 561／583／807、扣廣告後貢獻值頂 323／323／295；本批起 1280 三項都硬斷言 | 不變 |
| B1 總覽第一張 `.chart-frame` 頂 | 1440 855（硬斷言 ≤ min(900, 855)，等於上限）、1280 921、390 1,827（V4-0a 1,355：橋接表移到瀑布上方，只記錄） | 1440 不變 |
| B3 | 七頁 390 寬 scrollWidth 390 | 不變 |
| B9 DOM 節點數 | 總覽 +33（1440 3,108、1280 3,132、390 3,095），其餘六頁 +0；門檻基準＋1,500 | 通過 |
| Lighthouse Accessibility | 1440、390 各 8 頁全部 100（三次），失敗審核 0 | 不變 |
| Lighthouse Performance（空狀態首頁） | 1440 100（三次）；390 97、94、94 | ≥ 90 |
| 390 TBT 中位數（ms）與門檻（D-V4-36） | 載入示範資料 1,042.5 ≤ 1,109.1；通路健檢 767.2 ≤ 832.3；商品毛利 80.8 ≤ 129.9；會議紀錄 1,001.6 ≤ 1,071.2；資料來源 2.6 ≤ 50.0 | 五項通過 |
| CLS | 總覽載入 390 0.001、1440 0；切到商品毛利、資料來源、待辦 0.053–0.054（v3.0.0 既有） | 總覽 < 0.05 |
| axe 四尺寸 | serious、critical、moderate、minor 全 0 | 不變 |
| keyboard-walk | `aria-hidden` 內停留點：1440 0、768 0、390 0（V4-0a 390 為 2）；各頁里程碑 Tab 數與停留點數與 V4-0a 相同；390 的兩個瀑布外框成為合法的 region 停留點（第 43、48 個 Tab），1440 不多停留點 | 已知問題修正 |
| network-log | desktop、mobile 各 15 個請求；外部來源 0、非 GET 0、CSV 內容外洩 0、失敗資源 0、console 錯誤 0 | 不變 |
| 功能保留表 | `batch` 含 V4-1 的 7 列（29、56、57、G1、G2、G6、MV1）全部打勾 | 完成 |

**畫面基準差異（只列允許變動的畫面，理由）**

| 畫面 | 尺寸 | 差異像素 | 理由 |
|---|---|---|---|
| 01 總覽首屏 | desktop | 6,141 像素（約 1%） | 首屏下緣的拆解區塊：瀑布改共同尺度（刻度 0 到 600 萬改為 −200 萬到 800 萬，柱變短），橋接表改在 ChartFrame 旁欄 |
| 02 總覽整頁 | desktop、laptop、tablet、mobile | 53,700／46,258／64,891／55,136 像素（約 2%、2%、2%、4%） | 同上，另加 G2 同尺度；≤ 767 的橋接表多 G6 變異條、表在瀑布上方 |
| 03 抽屜 | desktop | 9,891 像素（約 1%） | 抽屜本身不變；差異在模糊背景中的總覽首屏下緣（同 01）。laptop 的 03 背景看不到拆解區塊，0 差異 |

## 4. 瀏覽器驗收方式與截圖

- 截圖：`verification/revamp-v4/V4-1/snapshots/{desktop,laptop,tablet,mobile}/`（1440×1000、1280×900、768×1024、390×844 各 13 張）。看本批變化：`desktop/01-overview-top.png`（首屏下緣的拆解區塊）、`desktop/02-overview-full.png`、`tablet/02-overview-full.png`、`mobile/02-overview-full.png`（橋接表在上、G6 變異條、瀑布在下）。
- 方式：本機 production build、PUBLIC_DEMO 伺服器；`toHaveScreenshot`（0 像素差、threshold 0.02）；E2E 四個視窗用 LOCAL 伺服器（`charts-overview.spec.ts` 逐項斷言版面、刻度、G6、抽屜與事件）。
- 量測檔：`verification/revamp-v4/V4-1/{metrics.json,first-load-modules.json,ui-audit.json,axe.json,keyboard-walk.json,network-log.json}`、`lighthouse/`、`lighthouse-runs/`。

## 5. 已知限制與風險

- **D-V4-41 未正式回覆**：共同尺度依已核准的驗收實作（等同 A）。若回覆 B（各自尺度），只改 `overviewWaterfallDomain` 的使用處與對應測試、截圖。
- **共同尺度的代價**：示範資料 G1 的最高柱比 v3 短約 40%，切到 MARKETPLACE 時 390 的終點柱只有 1.6px 高（設計稿與 H5 已看過）。
- **B1 沒有餘裕**：1440 總覽第一張 `.chart-frame` 頂 855，正好等於上限；V4-2 若讓 KPI 帶、三件事或一句話變高，這條硬斷言會失敗。
- **ChartFrame 多一個 `scrollLabel` 屬性**：PRD §6.1 沒有列，為了修 390 鍵盤問題加入；`tabIndex=-1` 的替代做法會讓 axe 的 scrollable-region-focusable（serious）在 390、768 失敗，也讓鍵盤無法捲動。已補進 CHART_CATALOG §1.1。
- **共同尺度在 section 內計算**：CHART_CATALOG 寫「Overview 算好傳入」，實作在兩個 section 內各自 `useMemo` 計算（不動 `overview.tsx`），另留 `domain` 屬性；兩張圖拿到相同範圍，由單元與 E2E 斷言。
- **G6 也在列印隱藏**：CSS 寫成 `@media print, (min-width: 768px)`，避免 A4 列印（約 700px 寬）印出 G6，與「匯出不另印」一致。
- **分析事件的 E2E 替身**：`chart-helpers-v4.ts` 的 `stubAnalytics` 在頁面載入前放一個只記事件名的 `window.va`，不改產品元素、不發請求。
- **390 的條與金額垂直中心差約 2.5px**：外觀問題，沒有斷言。
- 人工關卡 H6、PPT spike 人工開檔未執行。

## 6. 下一步、人工關卡與待拍板

- **下一批 V4-2**（總覽其他圖：G3 趨勢刻度、G4 各通路差額條、G5 bullet 與損益兩平 MER 列、G7a sparkline）。依賴 V4-1（本批完成）與 D-V4-6、16、18（已依建議值拍板）；D-V3-35 只在回覆 A 後做。
- **待拍板**：D-V4-41（請確認共同尺度維持 A；本批已依已核准的驗收實作）、D-V4-37（擋 V4-9a）、D-V4-38 與 39（擋 V4-4）、D-V4-40（擋 V4-7a）。
- **部署**：本批沒有部署。V4-2 完成即到 MVP 切線，之後依 D-V4-28 可經使用者當次同意部署 Vercel preview。
