# Revamp v3 V3-4b 驗收：經營總覽圖表（2026-10-06）

依 `docs/revamp-v3/06_BATCHES.md`「V3-4 拆批」的 V3-4b 範圍與 PRD §7.1（區塊 5、6、7、8）、§10.3（F2）、§9.4（C16、C17）、§9.5（圖表規則）、§2.3 B（版面跳動）執行。V3-4a＋V3-4b 完成後即 PRD §12.3 的 **MVP 切線**（V3-0–V3-4）。`src/domain`、`fixtures`、`docs/METRICS.md`、`.env*`、`vercel.json` 零改動；無新依賴（瀑布用 inline SVG、趨勢與各通路沿用 Recharts 3.10.1）。

## 1. 完成項目（對照 06_BATCHES V3-4b）

| 項目 | 狀態 | 說明 |
|---|---|---|
| 貢獻變化拆解瀑布（C17）＋橋接表＋平衡檢核（`bridge-waterfall`、`bridge-table`、`bridge-balance-check`、結論句標題） | 完成 | `src/application/waterfall.ts` `bridgeWaterfall`：11 根（上期、九項依 AMOUNT_FIELDS、本期），累計水位與九項加總用 decimal.js 到分，`balanced`＝`report.bridge.reconciled`；標題 L1 結論句「少賺 59.9 萬，扣最多的一項是商品成本（−157.5 萬）」（增加時「多賺…加最多的一項是…」；持平／由負轉正／轉為虧損／資料待補各有句型），副標「貢獻變化拆解 · 上期 6/1–7/12 到本期 7/13–8/23。每一項都是兩期的實際差額…」；`waterfall-svg.tsx` inline SVG（固定 320px、viewBox 依容器寬、起訖與小計 `--chart-total`、減項不利色、1px 連接線、柱上 L1 標值自動避讓、缺值虛線框）；右欄 `bridge-table`（上期、九項「減：…」、本期、總差額（`.bridge-total`）各為 L3 number-link）＋ `bridge-balance-check`「已平衡（差 0.00）」（check icon；不平衡 warning）；點柱與點列同一 handler＋`waterfall_clicked`；v2 4 欄數據表保留於 `data-alternative` |
| 本期利潤結構四層瀑布（F2：`profit-waterfall`、`profit-waterfall-scope`、`profit-waterfall-bar-{metric}`、資料表、資料待補虛線框） | 完成 | `profitWaterfall(snapshot, scope, { allChannels })`：§10.3 柱序 10 根（淨營收 → 商品成本 → 商品毛利 → 平台抽成 → 金流手續費 → 物流與包材費 → 其他變動費用 → 扣廣告前貢獻 → 廣告投放費 → 扣廣告後貢獻），只讀 metrics 不重算；三個恆等式到分（`identity`）；標題「每 100 元淨營收，扣完廣告剩 16.2 元」（負值「虧」；與 KPI 帶貢獻率同一取位）、副標「本期利潤結構 · 7/13–8/23 · 全部通路。切換範圍只影響這張圖。」；分段鈕 `profit-waterfall-scope`（合計＋各通路，只影響本圖，範圍改變時不在範圍的通路退回合計）；資料表 `<details>`（項目／金額（元）／佔淨營收，扣項「減：」前綴，number-link 開各指標抽屜）；缺值：受影響的柱虛線框「資料待補」、之後小計不畫、恆等式 null |
| 趨勢改 ChartFrame（C16：結論標題、takeaway、圖例線段、最後一點標值、缺資料斷線、檔期區帶） | 完成 | `chart-frame.tsx`（標題列 16／600＋副標 13px＝aria 描述、legend 12×2px 線段、`dl.takeaways`、固定高度圖框 180／320、ready／loading／empty／error 四態同高、`data-alternative`）；`trend-section.tsx`：標題沿用標準名「每週淨營收與扣廣告後貢獻」（§7.1 第 7 點未給結論句）、takeaway「淨營收期間合計 785.1 萬」「最近完整週淨營收 133.5 萬（8/17–8/23）」（number-link）、四條線（本期 2px `--chart-current`／上期 1.5px `--chart-previous`）、只在本期最後一點畫 3px 圓點並標「淨營收 133.5 萬」「扣廣告後 21.9 萬」、上期最後一點標「上期 …」、未滿 7 天註記、缺資料週斷線＋虛線「無資料」、檔期區帶與 `trend-events` 保留、tooltip 與每週表不變 |
| 各通路改 ChartFrame（長條從 0 起、負值不利色、數值標在長條末端、每通路金額與貢獻率表） | 完成 | `channel-section.tsx`：標題結論句「平台 · MARKETPLACE 扣完廣告虧 6.1 萬」（無虧損通路時「{通路} 扣廣告後貢獻最高，{金額}」）、副標「各通路扣廣告後貢獻 · 本期 7/13–8/23」；Recharts 水平長條（上期細 8px、本期粗 18px，零線、負值往左用 `--chart-unfavorable`、`LabelList` 標 L1 值）、長條可點開該通路本期扣廣告後貢獻抽屜；`.kv` 表（通路／本期（元）／貢獻率，number-link；轉負 lozenge）取代 v2 `.channel-summaries`；v2 5 欄資料表保留 |
| `src/application/chart-theme.ts`（圖表色由 token 讀取，元件內無 hex） | 完成 | `chartColors`（12 個 `var(--chart-*)`／`var(--border-strong)`／`var(--bg-surface)` 字串）、`chartCategoryColors`、`chartHeights { sm: 180, lg: 320 }`、`chartFontSize`、`readChartColors()`（瀏覽器端 getComputedStyle，SSR 回傳 var()）；四個圖表元件與瀑布 SVG 只用 chartColors 或 class＋token；`ui-audit` hex 0 |
| 事件 `waterfall_clicked` | 完成 | 兩個瀑布的柱點擊 `track("waterfall_clicked")`（只記事件名；D-V3-15） |
| 區塊順序依 §7.1（拆解 → 利潤結構 → 趨勢與各通路並排；1280 上下排列） | 完成 | 一句話 → KPI 帶 → 三件事 → 貢獻變化拆解 → 本期利潤結構 → `.pair`（趨勢、各通路；`@media (max-width: 1280px)` 單欄，1280 寬即上下排列）→ 其他常用指標 → 進階；v2 的 eyebrow、legend-dot、`.analysis-grid`、`.bridge-summary`、`.channel-summaries` 全部刪除（design-lint：eyebrow 3 → 0、箭頭 4 → 3，上限同步調低） |
| 四態等高、切換期間 CLS < 0.05 的 E2E | 完成 | `revamp-r1-layout.spec.ts`「V3-4b charts」：四個 `.chart-frame` 在切到近 7 天、套回原範圍前後高度差 0；`PerformanceObserver`（layout-shift，排除 hadRecentInput）四尺寸 CLS 皆 0.0000。代理另量到含輸入後 500ms 內的位移 desktop 0.20／mobile 0.32，來源是 v2 以來切換期間時整頁換成載入畫面（頁尾跳進視窗、捲動重設）；本批改為套用篩選時舊內容保持掛載並標 aria-busy，重量後 desktop 0.012／mobile 0.050 |
| 瀑布九項加總到分與四層恆等式的單元測試 | 完成 | `tests/waterfall.test.ts`（19 項：golden／demo 九項 Decimal 加總＝總差額＝貢獻差額、水位連續、已平衡、缺值情境、合計與每通路三個恆等式、perHundred＝貢獻率同值）、`tests/chart-takeaways.test.ts`（9）、`tests/chart-theme.test.ts`（5）、`tests/overview-charts-waterfall.test.tsx`（22：DOM、testid、點柱與點列同抽屜、缺值虛線框）、`tests/overview-charts-frame.test.tsx`（17）；既有 `overview-structure`、`overview-format` 同步 |
| E2E 與截圖 spec 遷移 | 完成 | E1：`revamp-r1-layout`（區塊順序、新增 V3-4b charts 三項：等高與 CLS、瀑布與表格共用抽屜＋範圍切換、平衡檢核）、`revamp-r4`（trend-events 限定在趨勢區塊內）；E2：`import`、`period-comparison`、`workspace`、`review-v2-a`、`ai`、`m6-acceptance`、`revamp-r6` 不需修改即通過（`.bridge-total` 定位器仍唯一）；修正不換頁後 7 支 spec 桌機＋手機重跑 148／148 |

## 2. 變更檔案

- 新增：`src/application/chart-takeaways.ts`、`src/application/chart-theme.ts`、`src/application/waterfall.ts`、`src/components/overview/charts/bridge-section.tsx`、`src/components/overview/charts/channel-section.tsx`、`src/components/overview/charts/chart-frame.tsx`、`src/components/overview/charts/profit-section.tsx`、`src/components/overview/charts/trend-section.tsx`、`src/components/overview/charts/waterfall-svg.tsx`、`tests/chart-takeaways.test.ts`、`tests/chart-theme.test.ts`、`tests/overview-charts-frame.test.tsx`、`tests/overview-charts-waterfall.test.tsx`、`tests/waterfall.test.ts`、`verification/revamp-v3/V3-4b/**`、本檔。
- 修改：`src/app/globals.css`、`src/components/overview.tsx`、`src/i18n/labels.zh-TW.ts`、`tests/e2e/revamp-r1-layout.spec.ts`、`tests/fixtures/design-lint-ceiling.json`、`tests/overview-format.test.ts`、`tests/overview-structure.test.tsx`、E2E spec（第三階段）、`docs/{STATUS,DECISIONS}.md`、`docs/revamp-v3/06_BATCHES.md`、`verification/revamp-v3/{feature-retention,e2e-text-assertions}.csv`。
- 零改動：`src/domain`、`fixtures`、`docs/METRICS.md`、`.env*`、`vercel.json`。

## 3. 驗收命令與真實結果

| 命令 | 結果 |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | 0 warnings |
| `npm test -- --run` | **98 檔／1,996 測試全過**（V3-4a：93 檔／1,925；新增 waterfall 19、chart-takeaways 9、chart-theme 5、overview-charts-waterfall 22、overview-charts-frame 17） |
| `npm run lint:design` | exit 0；hex 0（元件與瀑布 SVG 只用 chartColors／token）、圓角 4、字級 13、字距 0、JSX 全大寫 eyebrow 3 → **0**、JSX 箭頭 4 → **3**（上限同步調低）、裝飾 0；labels 同義詞 13／禁用詞 3 不變；對比 75／75 |
| `npm run build` | pass |
| `npm run test:e2e` | **608／608 全過（16.9 分，四尺寸）**（V3-4a：596；新增 V3-4b charts 3 項 × 4 尺寸）；第三階段代理分 spec 群對共用伺服器先各自跑過（E1 四支 spec 桌機＋手機 52／52；E2 七支 136／136 不需修改）；修正「切換期間不換頁」後 7 支 spec 桌機＋手機重跑 148／148 |
| 畫面基準 | `verification/revamp-v3/V3-4b/snapshots/{desktop,laptop,tablet,mobile}/01–09` 共 36 張（`CAPTURE_BATCH=V3-4b … --update-snapshots`），重跑 **4/4、0 差異**；總覽全頁為本批改版，其餘頁面與 V3-4a 相同 |
| Lighthouse（示範資料已載入，1440 與 390） | 五頁 Accessibility **100／100**（`verification/revamp-v3/V3-4b/lighthouse/flow-*.html`）；空狀態 Performance desktop 100／mobile 98；總覽頁 0 個失敗的無障礙稽核（瀑布與圖表 `aria-hidden`、表格 number-link 的可及名稱含可見文字）；不計分的 `label-content-name-mismatch` 仍只在健檢與會議頁（V3-0 起既有） |
| 禁區 diff（對 82b70df） | 空 |
| testid 基準 | 刪除數 0；新增 bridge-section、bridge-waterfall、bridge-table、bridge-balance-check、profit-waterfall、profit-waterfall-scope、profit-waterfall-bar-{10 個指標}、trend、channel-mix |

### 3a. 圖表驗收（PRD §7.1、§10.3、§2.3 B）

| 指標 | 目標 | 實測 |
|---|---|---|
| 瀑布九項加總 | 等於總差額（到分），`bridge-balance-check`「已平衡」 | golden／demo：九項 Decimal 加總＝`bridge.sum`＝貢獻差額（`tests/waterfall.test.ts`）；E2E 平衡檢核列「已平衡（差 0.00）」 |
| 四層恆等式（合計與每通路） | 淨營收 − 成本 ＝ 毛利；− 四費 ＝ 扣廣告前；− 廣告 ＝ 扣廣告後（到分） | golden／demo 合計與每個通路三個恆等式皆 true；perHundred 與 KPI 帶貢獻率同值（16.2） |
| 所有金額可開抽屜（瀑布柱、圖表長條、表格） | 滑鼠點柱與表格列同一 handler；鍵盤經表格 | 單元測試比對 `bridgeEvidence`／`profitEvidence`／`channelEvidence` 與表格列同物件；E2E：點橋接表第一個差額列與點第 2 根柱開出同一抽屜（標題與精確值相同）、利潤結構資料表與柱同抽屜、Esc 回焦到 number-link |
| 切換期間前後圖表容器高度 | 高度差 0；CLS < 0.05 | 四個圖框高度差 0；CLS 0.0000（四尺寸）；含輸入後位移 desktop 0.012／mobile 0.050 |
| 1440 首屏（不退步） | 一句話頂端 ≤ 176（無橫幅）、KPI 底邊 ≤ 420、三件事第 1 列標題底邊 ≤ 1000 | 與 V3-4a 相同：192px（含示範資料必有的去年同期理由列；無橫幅 168）、419px（無橫幅 395）、525px；390 扣廣告後貢獻數值頂端 295px；內容前可聚焦元素 9（`verification/revamp-v3/V3-4b/metrics.json`） |

## 4. 瀏覽器驗收

- 四尺寸截圖 `verification/revamp-v3/V3-4b/snapshots/`。肉眼核對 1440 總覽全頁：拆解區塊標題「少賺 59.9 萬，扣最多的一項是商品成本（−157.5 萬）」、瀑布 11 根（上期 186.9 萬 → 原價收入 +316.2 萬 → 九項 → 本期 127.0 萬）、橋接表 12 列 L3＋「平衡檢核 ✓ 已平衡（差 0.00）」；利潤結構「每 100 元淨營收，扣完廣告剩 16.2 元」、分段鈕 合計／官網 · DTC／平台 · MARKETPLACE、10 根柱（淨營收 785.1 萬 → … → 扣廣告後 127.0 萬）；趨勢 takeaway「785.1 萬」「133.5 萬（8/17–8/23）」、最後一點標「淨營收 133.5 萬」「扣廣告後 21.9 萬」、上期標「上期 101.7 萬」；各通路「平台 · MARKETPLACE 扣完廣告虧 6.1 萬」、長條末端標值、表格含「轉負」；1440 趨勢與各通路並排、1280 上下排列；390 全部堆疊、瀑布 1:1 水平捲動。與設計稿 `mockups/overview.html` 一致。
- 抽屜：E2E 驗證點柱與點表格列開出同一抽屜（標題、精確值相同）、Esc 回焦；範圍切換只改利潤結構標題與柱，KPI 帶不變。

## 5. 已知限制與偏離

- 瀑布用 inline SVG（固定 320px，viewBox 依容器寬；最小寬 520／600，較窄的平板單欄與手機水平捲動），不是 PRD C17 寫的 Recharts 堆疊長條；CLAUDE.md 允許兩者。
- 拆解結論句「扣最多的一項是」依資料取最負的差額（示範資料為商品成本 −157.5 萬），與設計稿相同；PRD §7.1 範例寫「最大一項是折扣」。橋接表另有「總差額」列（設計稿沒有），總差額 number-link 保留 v2 的 `.bridge-total` class。
- 趨勢標題沿用標準名（§7.1 第 7 點未給結論句）；軸刻度用 `formatAmountL1` 顯示「50.0 萬」（設計稿「50 萬」），要拿掉「.0」需在 presentation 另加軸刻度格式（V3-5 與健檢圖表一併）。
- 四張圖的資料表摘要統一用既有「表格 · {標準名}」；PRD／GLOSSARY 的「資料表」改名留 H3 後與其他 v2 鍵一起處理。
- `.pair` 在 ≤ 1280px 改單欄（PRD 寫 1280 上下排列，所以 1280 寬即單欄）；拆解在 ≤ 1023px 改單欄。
- 套用篩選時舊內容保持掛載（`aria-busy`）：v2 的全頁載入畫面只在載入資料集時出現；使用者在計算期間看不到 spinner，只有期間列與內容的 aria-busy（PRD C16 的 loading 狀態元件保留但目前只在圖表沒有資料時用到）。
- 本期利潤結構的範圍切換是本地 state，篩選改變後若原本選的通路不在範圍內自動退回合計；不寫入備份。
- 瀑布圖本身 `aria-hidden`，鍵盤只能經橋接表／資料表開抽屜（PRD 設計）；手機上瀑布以 1:1 水平捲動，可捲區域為 aria-hidden（axe 略過）。
- `labels.overview.chartFrame.loading`／`error` 已定義但目前沒有畫面會進入該狀態（圖表資料永遠隨 snapshot 存在）。
- 示範資料的 label-content-name-mismatch（健檢、會議頁）仍是 V3-0 起的既有項，留 V3-5／V3-7。

## 6. 下一批、人工關卡、需要拍板

- **MVP 切線已到（V3-0–V3-4）**：PRD §12.3 寫完成後**經使用者當次明確同意**（D-V3-24＝A）才部署成 Vercel preview 讓老闆試用新首屏；本批不部署，等您指示。
- **下一批 V3-5 通路健檢、商品毛利、計算與來源抽屜**（依賴 D-V3-3＝A）。
- **H2 後補**、**H3 補審**仍待人工（本批新增的圖表結論句、瀑布文案一併）。
- 需要拍板：無新增（本批取捨記在 `docs/DECISIONS.md` 2026-10-06 V3-4b：inline SVG、結論句規則、資料表摘要用詞、套用篩選不換頁）。**MVP preview 部署**需您當次明確回覆才會執行。
