# EC ProfitLens Revamp v4 圖表實作卡（G1–G24）

> 來源：`docs/revamp-v4/01_PRD.md` §4（圖表總目錄）、§5（各頁）、§6（元件、函式、token）、§7（圖表規範與 X26–X40）、§8（非功能）。代號 G、C、X、CL、D-V4、V4-n 一律沿用 PRD，本檔不新增代號。PRD 與本檔不一致時以 PRD 為準，並同批修正本檔。本檔寫「V4-0」時指 V4-0a、V4-0b 兩批合稱，「V4-0 實測」是 V4-0a 量到的 v3.0.0 值。G18 經審查取消（PRD §2.3），代號不重用。
>
> 「檔案:行號」以 v3.0.0（tag `v3.0.0`＝`625bfa5`）的原始碼為準，本檔撰寫時逐一讀 repo 確認；開工時若行號漂移，以函式名為準。
>
> 狀態：**草案，未開工，待使用者拍板**（`09_DECISIONS_PENDING.md`）。受拍板影響的欄位寫「依 D-V4-n」；拍板前一律沿用 v3.0.0 行為。

## 0 怎麼讀這份文件

- 做哪一批，就讀 §2 索引中「批次」欄是該批的實作卡，再讀 §1 共通約定。
- 每張卡的欄位固定：位置與批次｜資料｜等級與版本｜技術｜ChartFrame｜標題與 labels｜testid｜資料表｜鍵盤｜抽屜｜390｜投影｜匯出｜單元測試｜E2E 草案。
- 「E2E 草案」是給該批 E2E 代理的起點，不是最終碼；字串一律 `import { labels } from "@/i18n"` 再組，不寫死中文與數字（數字斷言改呼叫格式化函式，CLAUDE.md）。
- 本檔只描述呈現層與 `src/application` 的整理函式；`src/domain`、`fixtures/*`、`contribution-v1`、`assist-kpi-v1`、`breakeven-mer-v1`、`docs/METRICS.md` 一律不動（PRD §8.4）。

## 1 共通約定

### 1.1 ChartFrame（C16）props 速查

| prop | 來源 | 用法 |
|---|---|---|
| `id`、`testId`、`title`、`subtitle`、`legend`、`extra`、`takeaways`、`height`、`state`、`message`、`after`、`dataTable`、`className`、`children` | 既有（`src/components/overview/charts/chart-frame.tsx:27-50`） | 語意不變。`subtitle` 同時是區塊的 `aria-describedby`；`state` 為 ready、loading、empty、error，四態同高（`:65`） |
| `aside` | v4（PRD §6.1） | 圖旁欄；寬螢幕 7fr／5fr（沿用 `src/app/globals.css:1280` 的 `.bridge-grid`），窄螢幕下移；DOM 在圖之前；在 `aria-hidden` 容器之外；G1 的 aside 外層沿用 `.bridge-table-wrap`（投影只隱藏它） |
| `unitNote` | v4 | 標題列右側單位註記，承接 `bridge-section` 的 `.unit-note`（`bridge-section.tsx:83`） |
| `frameClassName` | v4 | 加在固定高容器；G1、G2 傳 `waterfall`，容器成為 `.chart-frame.lg.waterfall`（水平捲動沿用 `globals.css:1285`）；C17 同批加 `bare`，不再自己輸出外框；C26（G12、G19）傳 `multiples`，≤ 767px 時框高改為 `chartHeights.sm` × 子圖數（PRD §6.3） |
| `scrollLabel` | v4（V4-1 新增） | 可水平捲動的圖（G1、G2 瀑布）：給了時固定高容器不帶 `aria-hidden`（圖本身 `aria-hidden`），改 `role="region"`＋`aria-label`（`shell.chartsV4.common.chartRegion`）；內容比容器寬 1px 以上時才 `tabIndex=0`（ResizeObserver），寬螢幕不多一個停留點。用 `tabIndex=-1` 會讓 axe `scrollable-region-focusable`（serious）在 390、768 失敗，也讓鍵盤無法捲動 |
| `legend[].shape` | v4 | `line`（預設 12×2）、`dash`、`tick`（2×12）、`ring`（空心圓）、`rect`（空心矩形，G10 剩餘段）；不得有實心圓點或方塊（X32） |
| `mode` | v4 | `chart`（預設）或 `table`；table 時固定高容器不設 `aria-hidden`，內含 `.table-scroll[role=region][aria-labelledby]`（表內有可聚焦元素時不加 `tabindex`；G11 用 grid 型 roving tabindex，整張 1 個停留點；G21 每格是按鈕）；給 G11、G21 |
| `page` | v4 | 與 `id` 組成預設 `testId="chart-{page}-{id}"`；既有五張圖繼續傳明確的 `testId` |
| `variant` | v4 | `panel`（預設）或 `inline`（`section.chart-section.is-inline`，無 `.panel` 外框）；給放在既有 `.panel`、方案欄或議程項內的圖：G15 會議實例、G16、G19、G21 |
| `headingLevel` | v4 | 2（預設）、3、4；G13、G14、G16、G15 會議實例用 4，G19、G21 用 3 |
| `dataTable` | 既有介面＋v4 | 新圖一律傳 C33 產生的 `{summary, content}`；summary 沿用 `labels.overview.page.dataTable`（「表格 · {title}」）以 `fill` 組出，不另立新字串；展開時記 `track("chart_table_opened")`（依 D-V4-14） |

### 1.2 抽屜 `EvidenceSelection` 欄位（`src/components/evidence-drawer.tsx:15-37`）

| 欄位 | 用法 |
|---|---|
| `title`、`name`、`metric`、`period`、`channels`、`sources` | 必填；`metric` 一律是 domain 或 B 級函式回傳的精確字串，抽屜標題下一行顯示到分 |
| `formula`、`components` | 新算出的衍生值（四項費用合計、累計、累計佔比、計數）與差額必填；`components` 列出組成（例如累加的日、分子分母、兩期） |
| `metricVersion` | 只有真正新算出的值（四項費用合計、累計、累計佔比、計數、分階名次）帶該 B 級函式的版本常數（依 D-V4-15）；直接取自 domain 或 v3 既有函式的值（週淨營收、週比率、單一通路週或日的扣廣告後貢獻、各通路每 100 元的剩）不給，抽屜顯示 `contribution-v1`（`:192`）；件數、件均沿用 v3 的 `ASSIST_KPI_VERSION`（`src/components/overview/assist-table.tsx:36`）。抽屜只有一個 `metric_version` 欄（`:322`），不可把整理函式的版本塞進來（PRD §8.7） |
| `arrangeVersion` | v4（V4-2，G7a 第一次用）。值直接取自 domain、只經整理函式排列或分階時，帶整理函式的版本（例如 `daily-heatmap-v1`、`channel-weeks-v1`、`assist-weeks-v1`）；技術細節在 `metric_version` 之後另列一行，只在有給時顯示 |
| `valueKind` | v4（V4-3a）。`"level"` 或 `"change"`；未給時沿用現況（有 `components` 視為 change：大數字與精確值帶正負號、附取位說明、不畫階梯，`evidence-drawer.tsx:166、171-172、324、80`）。累計、四項費用合計這類水準值一律傳 `"level"` |
| `title`、`definition`、`formulaTechnical` | `name` 只用來借單位時（例如四項費用合計借 `platform_fees` 的金額單位；`MetricName` 沒有費用合計，`src/domain/types.ts:79`），三者必填，抽屜不得顯示該 `name` 的定義、技術公式與組成表列名（`:135、318`） |
| `filter` | 下鑽；v3 只有 `week`、`channel`（`src/application/evidence-filter.ts:10-13`）。V4-3b 加 `date?: string`（單日 ISO）與 `sku?: string`，只過濾原始明細，不重算；`evidenceFilterText` 同批加日期與 SKU 片語。`sku` 條件下沒有 sku 欄位的列（通路費用、廣告）一律不列入；`filter.sku` 只和商品層證據（`evidence.sku`）一起用（AGENTS.md：SKU 篩選不可帶入全通路費用產生假貢獻），`tests/evidence-filter.test.ts` 加對應斷言 |
| `sku` | 商品層證據（不畫四層階梯） |
| `unitOverride` | v3 有 `percentage-point`、`count`、`money_per_unit`；`percent` 只在 D-V3-31＝B 且 D-V4-32＝A 時於 V4-3a 加 |
| 共同規則 | 圖上點擊與資料表 number-link 呼叫**同一個** builder 函式；SSR 結構測試斷言兩者回傳的物件 `toEqual`（PRD §2.2 C7）。G15、G16、G19、G22 例外：其數字在 v3 就不是 number-link，柱與點不可點（PRD §8.7）。Recharts 圖（G8、G12、G24）在 SSR 不輸出圖形，SSR 只驗資料表 number-link，圖上點擊由 E2E 以 `.recharts-*` 定位驗證 |

### 1.3 testid、labels、分析事件

| 項目 | 規則 |
|---|---|
| 區塊 | `chart-{page}-{id}`；`{page}` 取 overview、diagnosis、products、scenarios、actions、meeting、data、import、evidence（依 D-V4-25） |
| 子元素 | `chart-{page}-{id}-{bar｜point｜seg｜cell｜spark}-{語意 key}`；key 用 `AmountField`／`MetricName`、通路代碼、`{channel}-{sku}`、ISO 日期、規則代號、方案 id、期限桶名、檔案短名（`sales`、`costs`、`ads`，與抽屜 `SourceTab` 相同，`evidence-drawer.tsx:53-54`）、原因碼；**不用陣列索引**（CL-2） |
| 資料表 | `chart-{page}-{id}-table`，加在 C33 輸出的 `<table>` 上 |
| 既有不改（12 個圖表 testid，CL-2 白名單） | `bridge-section`、`bridge-waterfall`、`bridge-table`、`bridge-balance-check`、`profit-waterfall`、`profit-waterfall-scope`、`profit-waterfall-bar-{metric}`、`trend`、`trend-legend-yoy`、`trend-yoy-note`、`trend-events`、`channel-mix`、`kpi-target-*`；class 定位器 `chart-point-hit`、`chart-bar-link`、`.bridge-total` |
| 撞名 | 任何新 testid 不以 `kpi-` 開頭（`tests/e2e/keyboard-walk.spec.ts:22` 用 `[data-testid='kpi-band'] [data-testid^='kpi-']`） |
| labels | 新 key 只放 `{group}.chartsV4.*`（依 D-V4-26 的 `V4_NEW_KEY_PREFIXES`）；每批在 labels 檔加「── V4-n 錨點：…」註解；既有字串一字不改；指標名一律取 `metricDefinitions`；標題 key 命名 `…chartsV4.{chart}.title.{情境}`，會被 copy-scan L1 樣式掃到（14 字子句上限） |
| 共通字串 | `shell.chartsV4.common.{missing, notApplicable, more, outOfRange, incompleteWeek, noRows}`：資料待補、不適用、另 {n} 項、超出範圍、未滿 7 天、無列。能沿用既有字串時沿用（例如 `labels.shell.status.missing`、`labels.overview.chartFrame.noData`），不重複造字 |
| 分析事件 | 點圖記 `track("chart_clicked")`、展開資料表記 `track("chart_table_opened")`，只記事件名（依 D-V4-14）；瀑布柱維持 `waterfall_clicked` |

### 1.4 C33 ChartDataTable 慣例

| 項目 | 規則 |
|---|---|
| 輸入 | V4-2 實作（`src/components/charts/chart-data-table.tsx`）：`testId`（加在 table，`chart-{page}-{id}-table`）、`caption`（也是捲動區的 aria-label）、`rowHeaderLabel`、`rows`、`rowKey(row)`、`rowHeader(row)`：回傳 `{label, title?}`、`columns: {key, label, notes?, unit?, layer?, data}[]`（unit：money、rate、count、multiple、per_unit、text、date；layer：L2、L3）、`valueOf(row, col)`：回傳 `{value, reasonCodes?, unit?, layer?, emptyText?}`、`evidenceOf(row, col)`：回傳 `EvidenceSelection` 或 null、`onEvidence`、`cellAria?`、`notes?`、`className?`；V4-4 加 `hasEvidence?(row, col)`（給了時渲染只用它決定是不是 number-link，`evidenceOf` 改在點擊時才呼叫；給每格 evidence 成本隨列數成長的表用，例如 G14 的累計、累計佔比）與格的 `unfavorable?`（不利時 number-link 加 `.negative`，純文字格加在 `td`；只有不利上色，D-V3-7）；另匯出 `chartDataCellText`、`chartDataTable({title, ...})`（回傳 ChartFrame 的 `dataTable`）、`ChartDataDetails`（獨立的 `<details class="data-alternative">`，收合時保持掛載，展開記 `chart_table_opened`） |
| 輸出 | `<div class="table-scroll" role="region" tabindex="0" aria-label={caption}><table data-testid="chart-…-table"><caption>…（元）</caption>`；`th scope` 齊全；數字欄右對齊、tabular、負號 U+2212 |
| 數字格 | `evidenceOf` 回傳非 null 時是 `<button class="number-link">`，與圖上點擊同一個 builder；回傳 null（例如試算、凍結值）時是純文字 |
| 列數 | 等於圖的資料長度（含被退回成文字的列，例如「不適用」通路）；SSR 測試斷言 |
| 限制句 | 例如「只呈現分布，不代表因果」放在資料表 `<details>` 內的 `tfoot` 或註記，不進主層（B8） |
| 金額層 | 資料表金額 L3（到分）或 L2（整數元），表頭帶「（元）」（`labels.format.units.yuanColumn`）；圖上標值 L1 |

### 1.5 鍵盤與無障礙共通

- 圖容器 `aria-hidden`、熱區不可聚焦、圖內 0 個 `tabIndex`（CL-7）；鍵盤一律經資料表、緊湊表或清單；Tab 順序＝DOM 順序，不用 CSS `order`。
- Recharts 一律 `accessibilityLayer={false}`、每個系列 `isAnimationActive={false}`、`ResponsiveContainer` 給 `initialDimension`（CL-4）；新圖只用 `LineChart`、`BarChart` 與其子元件（PRD §8.2），其餘 inline SVG。
- 熱表（G11、G21）是真的 `<table>`，放在 ChartFrame `mode="table"`，不在 `aria-hidden` 容器內（否則 axe `aria-hidden-focus` 為 serious）。
- 收合（`<details>`）、390 降級、投影隱藏一律用 CSS，保持掛載（M1）；同一控制一個 DOM 實例（M6）。

### 1.6 測試與 E2E 慣例

| 項目 | 規則 |
|---|---|
| 單元測試 | B 級函式一檔一測（例如 `tests/chart-structure.test.ts`），含手算 golden、`refund_only`、`zero_ad`、4 通路合成資料（`tests/fixtures/synthetic-4-channel/`，依 D-V4-31）；幾何純函式一檔（`tests/chart-geometry-v4.test.ts`，V4-2 隨 `sparklineGeometry` 新增，之後各批擴）；SSR 結構測試新建三支：`tests/charts-diagnosis-v4.test.tsx`（V4-3b）、`tests/charts-products-v4.test.tsx`（V4-4）、`tests/charts-scenarios-v4.test.tsx`（V4-5）；總覽由既有 `tests/overview-charts-waterfall.test.tsx`、`tests/overview-charts-frame.test.tsx` 與新增的 `tests/chart-frame-v4.test.tsx` 承擔，會議由 `tests/meeting-page.test.tsx`，資料來源由 `tests/data-workspace-v3.test.tsx`、`tests/issue-list-v3.test.tsx` 承擔；都用 `tests/helpers/markup.ts` 的 `byTestId`、`element`、`openTag` |
| E2E | 每頁一支：`tests/e2e/charts-overview.spec.ts`、`charts-diagnosis.spec.ts`、`charts-products.spec.ts`、`charts-scenarios.spec.ts`、`charts-meeting.spec.ts`、`charts-data.spec.ts`；共用 `tests/e2e/chart-helpers-v4.ts`（`chartFrame(page, testId)`、`openDataTable(frame)`、`expectNoPageScrollX(page)`、`frameHeights(page)`）；抽屜沿用 `tests/e2e/launch-helpers-v310.ts:48` 的 `evidenceDrawer` 與 `tests/e2e/trend-helpers-v39.ts:73` 的 `evidenceHeading`；載入示範資料沿用 `launch-helpers-v310.ts:33` 的 `loadDemo` |
| 四尺寸 | 1440×1000、1280×900、768×1024、390×844；390 斷言 `document.scrollingElement.scrollWidth ≤ 390` |
| 色 | 以 `chartColors.*` 的 `var()` 字串比對 `fill`／`stroke`（沿用 `tests/e2e/trend-helpers-v39.ts:22-29` 的作法） |
| 文字斷言 | 新增的非 testid 定位器登記到 `verification/revamp-v4/e2e-text-assertions.csv` |
| 元件目錄 | 新元件放 `src/components/charts/`（C19、C24–C31、C33、C35、`*-lazy.tsx`；檔名見 PRD §6.3）；chart-scan 的 AST 掃描範圍＝`src/components/charts/**`＋`src/components/overview/charts/**` |

## 2 索引

| 代號 | 頁面／區塊 | 元件與技術 | 等級／版本 | 優先 | 批次 | 區塊 testid | 單元測試 | E2E |
|---|---|---|---|---|---|---|---|---|
| G1 | 總覽／貢獻變化拆解 | C16＋C17 inline SVG＋`aside` 橋接表 | A／`contribution-v1` | P0 | V4-1 | `bridge-section` | `overview-charts-waterfall.test` 改寫 | `charts-overview` |
| G2 | 總覽／本期利潤結構 | C16＋C17 | A／`contribution-v1` | P0 | V4-1 | `profit-waterfall` | 同上 | `charts-overview` |
| G3 | 總覽／每週趨勢 | Recharts LineChart（既有） | A | P1 | V4-2 | `trend` | `trend-yoy.test` 擴 | `charts-overview`、`trend-yoy.spec` |
| G4 | 總覽／各通路 | Recharts BarChart（既有）＋C24 | A | P1 | V4-2 | `channel-mix` | `overview-charts-frame.test` 擴 | `charts-overview` |
| G5 | 總覽 KPI 帶、損益兩平 MER 列 | C18 Bullet | A／`assist-kpi-v1`、`breakeven-mer-v1` | P1 | V4-2 | `kpi-target-*`、`assist-breakeven-mer` | `bullet.test` | `charts-overview`、`revamp-r4.spec` |
| G6 | 總覽／橋接表 | C24 variance（只在 ≤ 767px 顯示，依 D-V4-33） | A／`contribution-v1` | P0 | V4-1 | `bridge-table` | `bar-cell.test` | `charts-overview` |
| G7 | 總覽其他常用指標表；健檢通路寬表 | C19 sparkline | B／`assist-weeks-v1`、`channel-weeks-v1` | P1 | V4-2（a）、V4-3a（b） | `assist-kpis`、`channel-compare` | `chart-assist-weeks.test`、`chart-channel-weeks.test` | `charts-overview`、`charts-diagnosis` |
| G8 | 總覽／進階 | Recharts LineChart | B／`cumulative-daily-v1` | P2 | V4-10 | `chart-overview-cumulative` | `chart-cumulative.test` | `charts-overview` |
| G9 | 健檢／清單 | C24 variance＋tick | A | P1 | V4-3a | `diagnosis-list` | `bar-cell.test` | `charts-diagnosis` |
| G10 | 健檢／每 100 元去向 | C27 inline SVG | A（各通路的剩與段比率）＋B／`channel-structure-v1`（四項費用合計與超過 100） | P1 | V4-3a | `chart-diagnosis-share` | `chart-structure.test` | `charts-diagnosis` |
| G11 | 健檢／日 × 通路 | C28 calendar，ChartFrame table 模式 | B／`daily-heatmap-v1`（分階；格值維持 `contribution-v1`） | P1 | V4-3b | `chart-diagnosis-heat` | `chart-heatmap.test` | `charts-diagnosis` |
| G12 | 健檢／五項比率走勢 | C26＋LineChart | A | P1 | V4-3b | `chart-diagnosis-rates` | `charts-diagnosis-v4.test` | `charts-diagnosis` |
| G13 | 商品／毛利兩期差額 | C25 variance | A | P1 | V4-4 | `chart-products-variance` | `chart-geometry-v4.test` | `charts-products` |
| G14 | 商品／商品毛利為負的商品累計 | C25 pareto（只在有商品毛利為負時渲染） | B／`product-pareto-v1` | P1 | V4-4 | `chart-products-pareto` | `chart-pareto.test` | `charts-products` |
| G15 | 試算／方案差額；會議議程 5 | C25 variance | A | P0 | V4-5、V4-6 | `chart-scenarios-variance`、`chart-meeting-scenarios` | `charts-scenarios-v4.test` | `charts-scenarios`、`charts-meeting` |
| G16 | 試算／要賣到多少 | C29 inline SVG | 依 D-V4-20：A′、A（模型值）為 A，B 為 B | P1 | V4-5 | `chart-scenarios-threshold` | `chart-threshold.test` | `charts-scenarios` |
| G17 | 待辦／頁首 | C24 count | B／`action-due-buckets-v1` | P2 | V4-10 | `chart-actions-due` | `chart-actions.test` | `action-workspace.spec` 擴 |
| G18 | （取消，PRD §2.3） | — | — | — | — | — | — | — |
| G19 | 會議／會議歷史 | C26＋LineChart | B／`meeting-series-v1` | P1 | V4-6 | `chart-meeting-history` | `chart-meeting.test` | `charts-meeting` |
| G20 | 資料來源／涵蓋時間軸 | C30 inline SVG | B／`coverage-timeline-v1` | P1 | V4-7a | `chart-data-coverage` | `chart-coverage.test` | `charts-data` |
| G21 | 資料來源／問題分布 | C28 matrix，table 模式、inline | B／`issue-distribution-v1` | P1 | V4-7a | `chart-data-issues` | `chart-issues.test` | `charts-data` |
| G22 | 精靈步驟 4 對帳表；前處理表 | C24 variance、pair | A | P1 | V4-7b | `reconciliation-{field}`、`data-preprocessing` | `bar-cell.test` | `charts-data`、`import.spec` |
| G23 | 抽屜／階梯表 | C24 share | A／`contribution-v1` | P1 | V4-7b | 抽屜既有結構 | `evidence-ladder.test` | `charts-data` |
| G24 | 商品／進階 | Recharts ScatterChart，`next/dynamic` | A | P2 | V4-10 | `chart-products-scatter` | `charts-products-v4.test` | `charts-products` |

## 3 實作卡：經營總覽（G1–G8）

### G1 貢獻變化拆解瀑布（升級；P0；V4-1）

| 項目 | 內容 |
|---|---|
| 位置與批次 | 總覽區塊 5（`src/components/overview.tsx:87` 的 `BridgeSection`）；V4-1 |
| 資料 | `bridgeWaterfall(snapshot)`（`src/application/waterfall.ts:172-224`）：`bars`（11 根 `WaterfallBar`：上期、九項 `AmountField`、本期）、`rows`（12 列 `BridgeRow`）、`title`、`subtitle`、`note`、`balanced`、`balanceText`；底層是 `report.bridge.components` 與兩期 `contribution_after_marketing` |
| 等級與版本 | A／`contribution-v1`。golden 差額 −315.00 不變；九項加總＝差額由既有 `report.bridge.reconciled` 與平衡檢核列承擔 |
| 技術 | C17 inline SVG（`WaterfallSvg`，`src/components/overview/charts/waterfall-svg.tsx:200-238`）加 `bare`：不再輸出 `div.chart-frame.waterfall`，只輸出量寬用的 `div.waterfall-measure`（無 `chart-frame` class，保留 ResizeObserver）與 `svg.waterfall-svg`；幾何沿用 `waterfallGeometry`（`:112-181`），新增選填參數 `domain`（同頁同尺度，見 G2）；Y 刻度改呼叫 `formatAxisWan`（`src/application/presentation.ts` 新增），`waterfallTickLabels`（`:89-98`）改成薄包裝、輸出不變；最小寬沿用 `BRIDGE_MIN_WIDTH = 520`（`bridge-section.tsx:26`） |
| ChartFrame | `id="bridge"`、`testId="bridge-section"`、`className="bridge-section"`（投影白名單依賴）、`title={data.title}`、`subtitle={fill(copy.subtitleWithNote, { subtitle, note })}`、`unitNote={bridgeUnitNote(data.bars)}`（`bridge-section.tsx:65`）、`height="lg"`、`frameClassName="waterfall"`、`aside={橋接表＋平衡檢核}`、`dataTable={既有 v2 四欄表}`；不加 takeaway（上期、本期已在橋接表首尾列） |
| 標題與 labels | 標題沿用 `overview.bridgeV3.title.*`（`waterfall.ts:190-208` 組句），示範資料「少賺 59.9 萬，扣最多的一項是商品成本（−157.5 萬）」（`src/i18n/labels.zh-TW.ts:591` 的 `decrease` 模板）；新 key `overview.chartsV4.bridge.*` 預計 0 個（G6 條不帶文字）；若 H5 要求變異欄表頭才加 `overview.chartsV4.bridge.varianceHead` |
| testid | 全部沿用：`bridge-section`（section）、`bridge-waterfall`（svg）、`bridge-table`、`bridge-balance-check`、`.bridge-total`；`#bridge-title`、`#bridge-sub` 不變；G6 新增的條見 G6 |
| 資料表 | `aside`：既有橋接表（項目、金額 L3；12 列＋平衡檢核）常駐；`dataTable`：既有 v2 四欄表（項目、上期、本期、影響；`bridge-section.tsx:110`），內容逐字不變 |
| 鍵盤 | DOM 順序：標題列、`aside` 橋接表（12 個 number-link）、圖（0 個停留點）、四欄表 summary；與 v3 的停留點序列相同 |
| 抽屜 | `bridgeEvidence(snapshot, target)`（`bridge-section.tsx:38-56`）：上期／本期＝該期 `contribution_after_marketing`；九項＝`title` 「{指標}拆解差額」、`name` 該欄位、`metric` 該項差額、`period` 兩期聯集、`sources` 兩期、`formula` 金額或成本差額公式、`components` [上期, 本期]；總差額＝`formula` 九項相減、`components` 九項。柱點擊經 `bridgeBarTarget`（`:61`），表列經 `bridgeRowTarget`（`:59`），同一個 builder |
| 390 | `aside` 在 DOM 前，所以橋接表（含 G6 輔助條）先、瀑布後；瀑布在 `.chart-frame.lg.waterfall` 內水平捲動（最小寬 520），頁面不橫向捲動；瀑布仍是橋接主圖（X18、X39） |
| 投影 | V4-8：`globals.css:2563` 白名單加 `.bridge-section`；只顯示瀑布（柱上標值是 L1），拆解區改單欄；`.bridge-table-wrap`（橋接表，L3，含 G6）與 `details.data-alternative` 隱藏但掛載；`--text-12`、`--text-13` 對應 14px（依 D-V4-8、D-V4-9） |
| 匯出 | PDF：C31 三個版本都印，170mm、灰階、0.5pt 框線，老闆版高 ≤ 60mm 且維持 1 頁（`svg[data-print-chart="bridge"]`）；PPT：C32 原生瀑布（堆疊長條四系列：透明底段、起訖與小計、有利差額、不利差額；跨 0 的柱拆正負兩段；`valAxisMinVal`／`valAxisMaxVal` 依 `axisTicks` 含 0；輔助系列以 `exports.chartsV4.*` 命名為「圖形用，非金額」；有利、不利兩個系列存的是柱高（絕對值），系列名標明「絕對值，圖形用」，資料標籤用帶「−」的數字格式；數值由 `bars` 的起點、終點精確字串換算；spike 不成立改 `addShape`，依 D-V4-10；放在哪一張投影片依 D-V4-34（建議 A：新增第二張，既有第一張不動））；Excel「圖表資料」：柱名、起點、終點、差額（L3 數值格）；Markdown 一頁摘要（沒有版本之分，選哪一版都一樣）：九項差額表（項目、差額（元），數字欄 `---:`、U+2212，依 D-V4-12） |
| 單元測試 | `tests/overview-charts-waterfall.test.tsx` 改為 ChartFrame 結構：`bridge-section` 內 `.chart-frame` 恰 1 個且帶 `waterfall`、`aside` 在固定高容器之前、`.unit-note` 文字＝`bridgeUnitNote`、`bridge-waterfall` 仍在、`bridge-balance-check` 仍在；`tests/chart-frame-v4.test.tsx`（aside、unitNote、frameClassName）；`formatAxisWan` 單元測試（整數萬、0 寫「0」、U+2212、步長非整萬保留 1 或 2 位，與 `waterfallTickLabels` 既有測試輸出相同） |
| E2E 草案 | `const frame = chartFrame(page, "bridge-section"); await expect(frame.locator(".chart-frame")).toHaveCount(1); await expect(frame.locator(".chart-frame.waterfall")).not.toHaveAttribute("aria-hidden", "true"); await expect(frame.locator(".chart-frame.waterfall")).toHaveAttribute("role", "region"); await expect(frame.locator("svg.waterfall-svg")).toHaveAttribute("aria-hidden", "true");`（V4-1 依 06「V4-0a 量到、併入本批的修正」改寫：外框不帶 aria-hidden，改 role=region＋aria-label，內容溢出時 tabIndex=0；只有 svg aria-hidden）／1440：`bridge-table` 的 x ＞ `bridge-waterfall` 的 x；390：`bridge-table` 的 y ＜ `bridge-waterfall` 的 y，且 `expectNoPageScrollX(page)`；捲到 `bridge-waterfall` 後它可見且 bounding box 寬 > 0（瀑布仍是主圖）／Y 刻度文字沒有一個符合 `/\.0\s*萬/`／點 `bridge-waterfall` 第 2 根柱與點 `bridge-table` 第 2 列 number-link，`evidenceHeading` 都等於 `fill(labels.overview.page.bridgeRowTitle, { metric: metricDefinitions.gross_sales.label })` 開頭的同一句 |

### G2 本期利潤結構瀑布（升級；P0；V4-1）

| 項目 | 內容 |
|---|---|
| 位置與批次 | 總覽區塊 6（`overview.tsx:88` 的 `ProfitSection`）；V4-1 |
| 資料 | `profitWaterfall(snapshot, scope, { allChannels })`（`src/application/waterfall.ts:236-280`）：10 根柱（`PROFIT_WATERFALL_METRICS`，`:88`）、`rows`（含 `share`）、`identity` 三個恆等式（`:255-259`）、`perHundred`（`:262-263`）、`title`；範圍選項 `profitWaterfallScopes`（`:227-230`） |
| 等級與版本 | A／`contribution-v1`；恆等式既有測試（`tests/waterfall.test.ts`）不動 |
| 技術 | C17 `bare`（同 G1）；最小寬 `PROFIT_MIN_WIDTH = 600`（`profit-section.tsx:21`）。同頁同尺度（PRD §7.2、§4.4）：`Overview` 以 G1 的 `bars`，加上 `profitWaterfallScopes`（`:227-230`）列出的全部範圍（合計與每個通路）的 G2 `bars`，一起算共同 `[lo, hi]`，傳給兩張圖的 `domain`；G2 切換範圍時沿用同一個共同尺度（柱較短是刻意的，切換範圍時可比）。只用合計範圍算會出錯：示範資料 G1 各柱與 G2 合計範圍都是正值，`axisTicks` 的 lo＝0（`chart-frame.tsx:93` 用 min(0, …)），切到 MARKETPLACE 時終點柱是 −61,169.93（golden MARKETPLACE −15.00），會落在下界之外、沒有負刻度 |
| ChartFrame | `id="profit"`、`testId="profit-waterfall"`、`className="profit-section"`、`title={data.title}`、`subtitle={data.subtitle}`、`extra={分段按鈕 profit-waterfall-scope}`、`height="lg"`、`frameClassName="waterfall"`、`dataTable={既有三欄表}` |
| 標題與 labels | 沿用 `overview.profit.title.*`（示範「每 100 元淨營收，扣完廣告剩 16.2 元」）；新 key 0 個 |
| testid | 沿用：`profit-waterfall`、`profit-waterfall-scope`、`profit-waterfall-bar-{metric}`（`waterfall-svg.tsx:225` 的 `testIdPrefix`） |
| 資料表 | 既有 `<details>`：項目（扣項寫「減：」）、金額 L3、佔淨營收 L2（`profit-section.tsx:78-89`），不改 |
| 鍵盤 | 分段按鈕、資料表 summary、表內 number-link；圖 0 停留點 |
| 抽屜 | `profitEvidence(snapshot, scope, row)`（`profit-section.tsx:33-36`）：`name` 該指標、`metric` 本期值、`period` 本期、`channels`／`sources` 依範圍；柱與表列同一個 builder |
| 390 | 水平捲動（既有）；分段按鈕換行（既有） |
| 投影 | 顯示（既有白名單 `.profit-section`），資料表隱藏 |
| 匯出 | PDF：標準與客戶版附錄（依 D-V4-11 選 B 時），C31 同 G1 規格；PPT 不放；Excel「圖表資料」：10 列（項目、金額、佔淨營收）＋每 100 元一列；Markdown 無 |
| 單元測試 | 同 G1 的 `overview-charts-waterfall.test.tsx`；新增「兩張瀑布 `ticks` 相同」斷言（同一個 `domain`）；新增「示範資料切到 MARKETPLACE 時，終點柱在 domain 內，且刻度含負值」 |
| E2E 草案 | `profit-waterfall` 內 `.chart-frame` 恰 1；按 `profit-waterfall-scope` 的第二個按鈕後 `.chart-frame` 高度不變；兩張瀑布 `.wf-axis text` 的第一個與最後一個刻度文字相同（同尺度）；點 `profit-waterfall-bar-net_revenue` 開抽屜，標題＝`metricDefinitions.net_revenue.label` |

### G3 每週趨勢折線（升級；P1；V4-2）

| 項目 | 內容 |
|---|---|
| 位置與批次 | 總覽 `.pair` 左（`overview.tsx:91` 的 `TrendSection`）；V4-2 |
| 資料 | `snapshot.weeks`（`src/application/workspace.ts:33、82-94`）、`snapshot.yoy`（`:27-29、97-117`）；列組裝 `trendRows`（`src/components/overview/charts/trend-section.tsx:59`）；takeaway `trendTakeaways`（`src/application/chart-takeaways.ts:56-79`） |
| 等級與版本 | A |
| 技術 | 既有 Recharts `LineChart`（`trend-section.tsx:151-160`）；只改一處：刻度 `tickFormatter` 由 `axis`（`:45`，輸出「50.0 萬」）改為 `formatAxisWan`。本期與上期的末點標值 v3 已有（`lastPointDot`，`:119-131`：本期「{指標} {L1}」用 `overview.trendV3.lastPoint`，上期「上期 {L1}」用 `previousPoint`），不重做；去年同期線尾標名只在 H5 要求時加，沿用 `lastPoint` 句型與既有圖例名，不新增 key。去年同期線樣式不變（`YOY_LINE`，`:39`） |
| ChartFrame | 沿用（`trend-section.tsx:149`）：`id="trend"`、`testId="trend"`、`legend` 維持三項（本期、上期、去年同期；`trend-legend-yoy`；`tests/e2e/trend-yoy.spec.ts:45-46` 與 `tests/trend-yoy.test.tsx:204` 斷言三項圖例）、`takeaways`、`height="sm"`、`after`、`dataTable` |
| 標題與 labels | 標題與 takeaway 不改字（`overview.sections.trend`、`overview.trendV3`）；新 key 0 個（末點標值沿用 `overview.trendV3.lastPoint`、`previousPoint`） |
| testid | 沿用 `trend`、`trend-legend-yoy`、`trend-yoy-note`、`trend-events`、class `chart-point-hit`；新增 0 個 |
| 資料表 | 既有 7 欄（週、起訖日、三個金額 × 期間），不改 |
| 鍵盤 | 經資料表（既有） |
| 抽屜 | 既有 `weekEvidence(week, name, channels)`（`trend-section.tsx:72`）＋`filter.week`；熱區 `chart-point-hit`（`:116`）與表格同一個 builder |
| 390 | 維持：不隱藏去年同期線，390 的去年同期下鑽保留（`tests/e2e/trend-yoy.spec.ts:15` 在 mobile 也跑，`:80` 起點去年同期點） |
| 投影 | 隱藏（掛載） |
| 匯出 | 不印、不放；Excel 既有管理損益表已有週資料，不另加 |
| 單元測試 | `tests/trend-yoy.test.tsx` 擴：刻度函式改為 `formatAxisWan`；圖例項目斷言（`:204`）不變；D-V3-35 只在使用者回覆 A 後才動 `trend-yoy-note` |
| E2E 草案 | `trend` 的 `.recharts-cartesian-axis-tick text` 沒有一個符合 `/\.0\s*萬/`；`trend-yoy.spec.ts` 既有定位器與三項圖例斷言不動，四尺寸都過 |

### G4 各通路雙長條＋緊湊表差額條（升級；P1；V4-2）

| 項目 | 內容 |
|---|---|
| 位置與批次 | 總覽 `.pair` 右（`overview.tsx:92` 的 `ChannelSection`）；V4-2 |
| 資料 | 長條：`channelConclusion(snapshot).rows[].previous/current`（`src/application/chart-takeaways.ts:87-117`）。差額：`metricComparison(snapshot, "contribution_after_marketing", channel)`（`src/application/manager-summary.ts:87-106`，用 domain `compareMoney`；V4-2 改為匯出，邏輯不改）的 `change` 與 `evidence.change` |
| 等級與版本 | A |
| 技術 | 長條沿用 Recharts `BarChart`（`channel-section.tsx:90-104`）；差額條是 C24 variance（不利 `chartColors.unfavorable`、有利 `chartColors.total`：同框的上期長條已用 gray-400，有利不用同色的 `chartColors.favorable`），放在緊湊表 `table.channel-kv`（`:74-84`）新增的「差額」欄格內，數字是新的 number-link（L2 帶號），條在數字前、`aria-hidden`；條長＝\|差額\| ÷ 各通路 \|差額\| 最大值（`barCellGeometry`，只用於長度）；刻度改 `formatAxisWan`（取代 `:45` 等處的 `axis`）。D-V4-16 選 B 時改 C35 啞鈴，並同批改 `tests/e2e/trend-yoy.spec.ts:200` 的 `path.chart-bar-link` 定位器 |
| ChartFrame | 沿用（`channel-section.tsx:88`）：`id="channel"`、`testId="channel-mix"`、`after={緊湊表}`、`dataTable={五欄表}` |
| 標題與 labels | 標題沿用 `overview.channelsV3.title.*`（示範「平台 · MARKETPLACE 扣完廣告虧 6.1 萬」）；差額欄表頭沿用既有 `overview.channelsV3.dataTable.change`「差額（元）」（H5 設計稿提案的附註，不另立新鍵）；新 key `overview.chartsV4.channels.changeAria`（差額 number-link 的可及名稱，比照既有 `copy.amountAria`）與 `changeEmptyAria`（差額缺值時的可及名稱，不加「元」）。V4-2 實作同步 |
| testid | 沿用 `channel-mix`、class `chart-bar-link`；新增 `chart-overview-channels-bar-{channel}` |
| 資料表 | 緊湊表（通路、本期、貢獻率、新增差額）常駐；五欄表（`channel-section.tsx:86`）不改 |
| 鍵盤 | 緊湊表 number-link（每列多一個差額）、五欄表 summary |
| 抽屜 | 長條：既有 `channelEvidence(snapshot, channel, period)`（`channel-section.tsx:41-45`，帶 `filter.channel`）。差額條與差額 number-link：新增 `channelChangeEvidence(snapshot, channel)`＝`metricComparison(...).evidence.change` 再加 `filter: { channel }`（`formula` 差額公式、`components` [上期, 本期]）；兩者同一個 builder |
| 390 | 差額條移到該列下一行（CSS），寬 64 |
| 投影 | 隱藏（掛載） |
| 匯出 | 不印、不放；Excel「圖表資料」：通路、上期、本期、差額；Markdown 沿用既有通路表 |
| 單元測試 | `tests/overview-charts-frame.test.tsx` 擴：差額欄列數＝通路數、`chart-overview-channels-bar-{channel}` 數＝有差額的通路數、條與差額 number-link 的 evidence `toEqual`；`metricComparison` 匯出後既有 `manager-summary.test` 不變 |
| E2E 草案 | `channel-mix` 內 `[data-testid^='chart-overview-channels-bar-']` 數＝通路數；示範資料 MARKETPLACE 的條 `fill` 為 `chartColors.unfavorable`；點差額 number-link 開抽屜，篩選片語含該通路名（`evidenceFilterText`）；`trend-yoy.spec.ts:200` 不改且通過（D-V4-16＝A 時） |

### G5 目標細條與損益兩平 MER（升級；P1；V4-2）

| 項目 | 內容 |
|---|---|
| 位置與批次 | KPI 帶各格的 `kpi-target-*`（`overview.tsx:59-70` 的 `targetLine`）；其他常用指標表下方的損益兩平段（`src/components/overview/assist-table.tsx:75-104` 的 `BreakevenRow`，`assist-breakeven-mer`）；V4-2 |
| 資料 | KPI：`achievement(actual, target)`（`src/application/targets.ts:182`）、`matchTargets`（`:157`）。MER 列：`breakevenMer(summary)`（`src/application/breakeven-mer.ts:67`）的 `value`（損益兩平）與 `actual`（實際 MER）、`comparison` |
| 等級與版本 | A／`assist-kpi-v1`、`breakeven-mer-v1`（都不改） |
| 技術 | C18 `Bullet`：由 `overview.tsx:43-51` 的 `targetBar` 抽成 `src/components/overview/charts/bullet.tsx`（props `actual`、`target`、`favorableDirection`、`testId`）；畫法沿用 v3（0 到目標：寬度＝達成率夾在 0 到 1，`overview.tsx:49`；目標刻度固定在右端，`.kpi-bullet-target` 的 `right: 0`，`globals.css:1143`；超過目標時條滿格），PRD §4.4 G5 同此；DOM 與 class `.kpi-bullet*`（`globals.css:1140-1143`）不變，色改引用 `--chart-total`、`--chart-unfavorable`、`--chart-target`（值與現況相同：`--chart-total`＝`--text-secondary`、`--chart-target`＝`--text-primary`，外觀零差異）；`--chart-target` 在本批宣告 |
| ChartFrame | 不用（表格內嵌）。V4-2 實作：MER bullet 放在損益兩平表格之外、一句結論之後的 `p.assist-breakeven-bullet`（不放進 tbody 第二列：`tests/e2e/revamp-r4.spec.ts:69`、`breakeven-mer.spec.ts` 斷言 tbody 只有 1 列，`overview-structure.test.tsx` 斷言沒有目標檔時不出現 `kv-target`）；只畫本期，實際或損益兩平為 null 時整行不出現 |
| 標題與 labels | KPI 沿用既有目標句；MER 列新 key `overview.chartsV4.bullet.merLine`「實際 {mer}，損益兩平 {breakeven}」 |
| testid | 沿用 `kpi-target-*`；新增 `chart-overview-bullet-bar-mer` |
| 資料表 | 數字本身是 number-link（既有） |
| 鍵盤 | 既有 |
| 抽屜 | KPI：既有目標抽屜（`overview.tsx:68` 的 `openTarget`，`metricVersion` 為 `ASSIST_KPI_VERSION`）；MER 列：既有 `breakevenEvidence`（`assist-table.tsx:66`） |
| 390 | 維持 |
| 投影 | KPI 帶顯示（既有）；MER 列隨其他常用指標表隱藏 |
| 匯出 | 沿用既有文字，不另加 |
| 單元測試 | `tests/bullet.test.tsx`：寬度＝達成率夾在 0 到 1、落後時 `is-behind`、目標期間不符不畫、損益兩平 null 不畫；`revamp-r4` 目標斷言不變 |
| E2E 草案 | KPI 帶底 ≤ 420（1440、1280 硬斷言，metrics.spec）；KPI 帶元素截圖（畫面 13：載入示範資料後讀入 `verification/revamp-v4-capture/targets.csv`，含達成與落後兩種 `kpi-target-*`；`06_BATCHES.md` V4-0a 第 9 項）與 V4-1 基準差異 0；`chart-overview-bullet-bar-mer` 在示範資料存在且不可聚焦 |

### G6 橋接表內嵌變異條（新增；P0；V4-1；依 D-V4-33）

| 項目 | 內容 |
|---|---|
| 位置與批次 | G1 的 `aside` 橋接表（`bridge-section.tsx:88-107`）九個差額列；V4-1。依 D-V4-33 建議 B：只在 ≤ 767px 顯示（≥ 768 以 CSS 隱藏、保持掛載；寬螢幕的橋接表就在瀑布旁邊，不重複編碼），而且要先依 D-V4-33 改寫 X18；未回覆時 V4-1 不做 G6 |
| 資料 | `bridgeWaterfall().rows` 中 `kind="delta"` 的九列（`waterfall.ts:210-215`）的 `metric.value` |
| 等級與版本 | A／`contribution-v1` |
| 技術 | C24 variance（inline SVG 6px 高、最大寬 96、390 為 64、零線 1px `--chart-axis`），放在既有金額格 `td.num` 內、number-link 之前，`aria-hidden`；條長＝\|值\| ÷ 九項 \|值\| 最大值；色依 `deltaTone("contribution_after_marketing", value)`（`presentation.ts:339`）：不利 `chartColors.unfavorable`、有利 `chartColors.favorable`；`barCellGeometry` 純函式 |
| ChartFrame | 共用 G1 |
| 標題與 labels | 共用 G1 標題；新 key 0 個 |
| testid | `chart-overview-bridge-bar-{field}`（field＝`AmountField` 鍵，共 9 個） |
| 資料表 | 共用 G1 的橋接表 |
| 鍵盤 | 經同列 number-link；條本身不可聚焦 |
| 抽屜 | 條點擊呼叫同列的 `open(bridgeRowTarget(row))`（`bridge-section.tsx:97`），與 number-link 同一個 builder |
| 390 | 條寬 64，與金額同一行（只有這個寬度顯示） |
| 投影 | 隱藏（隨 `.bridge-table-wrap`；投影寬度 ≥ 768，本來就不顯示） |
| 匯出 | 不另印（瀑布已印）；PPT 不另放，分歧長條不得取代瀑布（X18、X39）；Excel 併入 G1 段；Markdown 併入 G1 |
| 單元測試 | `tests/bar-cell.test.ts`（variance 幾何：最大值滿寬、負值往左、0 不畫、null 不畫）；SSR：`chart-overview-bridge-bar-*` 恰 9 個（缺值列除外），每個在 `bridge-table` 的 `tr[data-row]` 內 |
| E2E 草案 | `bridge-table` 內 `[data-testid^='chart-overview-bridge-bar-']` 數＝9（示範資料；1440 時存在但不可見）；比較條 `rect` 的寬度屬性（1440 隱藏時也能比）：`chart-overview-bridge-bar-gross_sales` 最寬且 `fill` 為 `chartColors.favorable`（示範資料原價收入 +3,161,970.00）；`chart-overview-bridge-bar-cogs_net` 是 `fill` 為 `chartColors.unfavorable` 的條中最寬的一條（−1,575,080.55，`fixtures/demo/computed_summary.json`）；390：點它開的抽屜標題與點同列 number-link 相同，條的 bounding box 寬 ≤ 64；1440：條不可見 |

### G7 近 {n} 週 sparkline（新增；P1；（a）V4-2、（b）V4-3a）

> **V4-3a 實作補記（G7b）**：`channelWeeks(snapshot)` 回傳本期全部週（逐週加總＝本期合計），sparkline 與資料表只取最後 8 週（`recentChannelWeeks`）；`daily_complete=false` 時回傳 null；本期值缺漏時格保留但不畫；「各通路每週」列序跟寬表目前的排序；寬表 spark 格用新的 `data-list-role="spark"`，390 換到下一行靠右；通路 > 8 的說明句 testid 是 `channel-weeks-too-many`。

| 項目 | 內容 |
|---|---|
| 位置與批次 | （a）總覽其他常用指標兩張 `table.kv`（`src/components/overview/assist-table.tsx:45-55`）每列新增「近 {n} 週」欄（n＝實際週數，上限 8；示範資料本期 6 週），V4-2；（b）健檢通路寬表 `table.channel-table-v3`（`src/components/channel-table.tsx:88-108` 的 `DiagnosisChannelTable`）每通路新增「近 {n} 週」欄，V4-3a |
| 資料 | （a）`assistWeeks(snapshot)`（新增 `src/application/chart-assist-weeks.ts`）：取 `snapshot.weeks` 本期最後 ≤ 8 週；`marketing_burden`、`mer`、`gross_margin`、`refund_ratio`、`fulfillment_burden` 直接取週列 `metrics`；件數與件均需要週件數：`weeklyRows`（`src/application/workspace.ts:82-94`）多帶 `aggregatePeriod` 已回傳的 `units_sold`（`src/domain/aggregation.ts:110`；目前 `:91` 只留 `metrics`、`sources`），件均呼叫既有 `netRevenuePerUnit`（`src/application/assist-kpi.ts:30`）。（b）`channelWeeks(dataset, scope)`（新增 `src/application/chart-channel-weeks.ts`）：每通路逐週呼叫 `aggregatePeriod(dataset, week, [channel])`（每次都掃整份 sales、costs、ads，`src/domain/aggregation.ts:54-56`）；**不放進 `createSnapshot`**，在健檢頁元件（`Diagnosis`，`src/components/workspace-panels.tsx`）內以 `useMemo` 計算，Excel「圖表資料」匯出時由 `excel-export` 自行呼叫；通路 > 8 時不呼叫，sparkline 欄與「各通路每週」`<details>` 改為一句說明（`diagnosis.chartsV4.channelsSpark.tooMany`），指向既有通路寬表；指標＝扣廣告後貢獻 |
| 等級與版本 | B。（a）`ASSIST_WEEKS_VERSION = "assist-weeks-v1"`（`assist-kpi-v1` 不變）；（b）`CHANNEL_WEEKS_VERSION = "channel-weeks-v1"`（依 D-V4-15）。週值本身直接取自 domain，所以抽屜的 `metricVersion` 維持 `contribution-v1`（件數、件均維持 `assist-kpi-v1`），整理函式版本放 `arrangeVersion`（PRD §8.7）。golden：逐週件數加總＝期間件數；逐週件均＝`netRevenuePerUnit(週淨營收, 週件數)`；每通路逐週扣廣告後貢獻加總＝通路期間合計（到分）；呼叫次數＝通路數 × 週數 |
| 技術 | C19 inline SVG 16×64（`--chart-h-xs`，本批宣告）；`sparklineGeometry(points)` 純函式；線 `chartColors.total` 1.5px、最後一點 3px `chartColors.current`；未滿 7 天的週（`isFullWeek`，`src/application/chart-takeaways.ts:53`，V4-2 改為匯出）：金額與件數序列畫空心點（X40），比率照畫；null 斷線；無軸無框；`aria-hidden`；SSR 可渲染 |
| ChartFrame | 不用（表格內嵌）；資料表用獨立 `<details class="data-alternative">`（C33） |
| 標題與 labels | 無標題；（a）`overview.chartsV4.assistSpark.{head, tableTitle, caption, incompleteNote}`；（b）`diagnosis.chartsV4.channelsSpark.{head, tableTitle, caption, incompleteNote}`；head＝「近 {n} 週」；資料表 summary 以 `fill(labels.overview.page.dataTable, { title: tableTitle })` 組出（「表格 · 各指標每週」），不另立 summary 字串 |
| testid | `chart-overview-assist-spark-{kpiId}`（7 個；損益兩平 MER 段不畫）、`chart-diagnosis-channels-spark-{channel}`；資料表 `chart-overview-assist-table`、`chart-diagnosis-channels-table`；都不以 `kpi-` 開頭 |
| 資料表 | （a）`<details>`「各指標每週」放在 `.assist-panel` 內兩表之後：列＝7 個指標，欄＝近 {n} 週（週名＋起訖），格＝L2 值；未滿 7 天的週欄頭加「未滿 7 天」。（b）`<details>`「各通路每週」放在通路寬表之後：列＝通路，欄＝週，格＝扣廣告後貢獻 L2 |
| 鍵盤 | sparkline 不可點、不可聚焦；鍵盤經同列數字與資料表 summary；寬表與兩張 kv 表的停留點數不增加（只多一個 summary） |
| 抽屜 | （a）資料表格：比率與金額用 `assistKpis` 同一套 evidence 寫法（`assist-table.tsx` 的 `cell`），`period`＝該週、`channels`＝範圍、`sources`＝週列 `sources`、不給 `metricVersion`（值取自 domain，維持 `contribution-v1`；件數、件均維持 `ASSIST_KPI_VERSION`）、`arrangeVersion: "assist-weeks-v1"`；（b）資料表格：`{ name: "contribution_after_marketing", metric, period: 週, channels: [channel], sources, title, filter: { week, channel }, arrangeVersion: "channel-weeks-v1" }`（不給 `metricVersion`）。（b）同批修正 `ladderMetrics`（`evidence-drawer.tsx:94` 找週時不比對通路）：週與去年同期的查找只在 `evidence.channels` 等於 `report.scope.channels` 時成立，否則不畫階梯，避免在單一通路的週值下畫出全部通路該週的四層階梯 |
| 390 | 清單式時 sparkline 放在主行右側，寬 64 |
| 投影 | 隱藏（掛載） |
| 匯出 | 不印、不放；Excel「圖表資料」：各列近 {n} 週值（a 與 b 各一段，段末一列版本） |
| 單元測試 | `tests/chart-assist-weeks.test.ts`（件數加總、件均一致、未滿週旗標、`assist-kpi-v1` 既有測試不動）；`tests/chart-channel-weeks.test.ts`（逐週加總＝通路期間合計、呼叫次數；通路 > 8 時不呼叫 `aggregatePeriod`（spy）；用程式在記憶體中產生 50 通路 × 92 天的合成資料，斷言健檢頁 SSR 不輸出 `chart-diagnosis-channels-spark-*`、G10 為 `state="empty"`）；`tests/evidence-drawer-v3.test.tsx` 擴（V4-2：`arrangeVersion` 只在有給時顯示、`metric_version` 仍是 `contribution-v1`；V4-3a：單一通路的週證據不畫全通路階梯）；`tests/workspace.test.ts` 擴（`weeks[].units_sold` 存在、`createSnapshot` 輸出沒有 `channelWeeks`）；`tests/chart-geometry-v4.test.ts`（V4-2 新增，`sparklineGeometry`） |
| E2E 草案 | `assist-kpis` 內 `[data-testid^='chart-overview-assist-spark-']` 數＝7；KPI 帶內 `[data-testid^='kpi-']` 數與 V4-1 相同（沒有被新 testid 撞到）；示範資料本期剛好 6 個完整週（7/13 週一到 8/23 週日），所以每條 sparkline 6 點且都是實心；未滿 7 天的空心點（X40）用合成資料（期間結束在週中）驗：`chart-overview-assist-spark-units_sold` 的最後一個 `circle` 的 `fill` 為 `chartColors.surface`；`channel-compare` 內 `[data-testid^='chart-diagnosis-channels-spark-']` 數＝通路數 |

### G8 兩期每日累計線（新增；P2；V4-10）

| 項目 | 內容 |
|---|---|
| 位置與批次 | 總覽進階 `<details data-testid="overview-advanced">`（`overview.tsx:97`）內、管理損益表（`:115`）之後；V4-10 |
| 資料 | `cumulativeDaily(snapshot, "contribution_after_marketing")`（新增 `src/application/chart-cumulative.ts`）：兩期各自呼叫 `periodDailyMetrics(report.previous)`、`periodDailyMetrics(report.current)` 取每日扣廣告後貢獻，逐日 `Decimal` 累加，兩期各一條。`periodDailyMetrics` 由 `pnl-table.ts:65-87` 的 `dayColumns` 抽出並匯出（同一天各通路的 totals 以 `sumTotals` 相加後交給 domain 的 `calculateMetrics`；`dayColumns` 改呼叫它、`buildPnlTable` 輸出不變）。不能直接用 `buildPnlTable(snapshot, "day")`：它只有本期的日欄（`:65-67`、`:105-118`）。目標線＝`matchTargets`（`targets.ts:157`）matched 時的 `target` |
| 等級與版本 | B／`CUMULATIVE_DAILY_VERSION = "cumulative-daily-v1"`。golden：兩期末日累計各＝該期合計（示範資料 42 天：本期 1,269,792.73、上期 1,868,626.68）；合成資料多日期間逐日手算前 3 天與交叉日；golden 兩期各只有 1 天，末日 255.00 只是恆等式；`periodDailyMetrics(report.current)` 與 `buildPnlTable(snapshot, "day")` 的日欄逐格相同；每點 `components` 列出累加的日 |
| 技術 | Recharts `LineChart`（首載已有）；本期 `chartColors.current` 2px、上期 `chartColors.previous` 1.5px；目標水平線 `ReferenceLine`＋`chartColors.target`；X「第 n 天」、Y 整數萬含 0（`formatAxisWan`）；任一日 null 之後斷線（`connectNulls={false}`）；任一期超過 92 天（`PNL_DAY_COLUMN_LIMIT`，`pnl-table.ts:52`，兩期都套用）不畫；不畫等速目標線（屬預測，依 D-V4-22） |
| ChartFrame | `id="cumulative"`、`page="overview"`（testId `chart-overview-cumulative`）、`title`、`subtitle`（兩期天數不同時寫「依第 n 天對齊」）、`legend`（本期、上期 line；目標 tick）、`height="sm"`、`dataTable`（C33） |
| 標題與 labels | `overview.chartsV4.cumulative.title.{behind, ahead, even}`：「本期累計扣廣告後貢獻 {amount}，第 {d} 天起落後上期」／「…，第 {d} 天起超過上期」／「…，與上期相同」。規則（PRD §4.2）：只比兩期都有值的第 1 到 min(兩期天數) 天；以最後一個可比的天判定；d＝最後一次由「不落後」轉為「落後」（或由「不超過」轉為「超過」）的那一天，第 1 天就落後（或超過）時 d＝1；另 `subtitle`、`alignNote`、`columns.{day, date, daily, cumulative, target}` |
| testid | `chart-overview-cumulative`、`chart-overview-cumulative-table`；Recharts 在 SSR 不輸出圖形，柱點不設 testid |
| 資料表 | 第 n 天、日期、當日、累計、目標（L3） |
| 鍵盤 | 進階 summary 展開後，經資料表 summary 與表內 number-link |
| 抽屜 | 點擊點或累計格：`{ name: "contribution_after_marketing", metric: 累計, period: { start: 期間起日, end: 該日 }, channels, sources: 累加各日的 sources, title, formula: 逐日加總, components: 各日, valueKind: "level", metricVersion: "cumulative-daily-v1", filter: { date } }`（`valueKind: "level"` 讓抽屜大數字不帶「+」）；當日格開該日（`filter.date`；值取自 domain，不給 `metricVersion`，`arrangeVersion: "cumulative-daily-v1"`） |
| 390 | 只畫本期與上期（目標線保留） |
| 投影 | 隱藏 |
| 匯出 | 不印、不放；Excel「圖表資料」：日期、當日、累計 |
| 單元測試 | `tests/chart-cumulative.test.ts`（兩期末日＝各期合計：示範 1,269,792.73／1,868,626.68、golden 單日 255.00；合成資料逐日手算與交叉日 d；null 後斷線；兩期天數不同只比共同天數；任一期 > 92 天回傳不畫）；`tests/pnl-table.test.ts` 不改且通過（`dayColumns` 改呼叫 `periodDailyMetrics`）；`tests/evidence-drawer-v3.test.tsx` 擴（累計的抽屜大數字不帶「+」） |
| E2E 草案 | 展開 `overview-advanced` 後 `chart-overview-cumulative` 可見；`main .chart-frame:visible` 數由 4 變 5（收合時 G8 的框沒有 bounding box，`revamp-r1-layout` 的等高比較只在展開狀態下做）；資料表本期最後一列累計文字＝`formatAmountL3(report.current.metrics.contribution_after_marketing.value)`，上期最後一列累計文字＝`formatAmountL3(report.previous.metrics.contribution_after_marketing.value)` |

## 4 實作卡：通路健檢（G9–G12）

健檢頁由上到下（PRD §5.2）：健檢清單（G9）、G10、G11、`<details>`「五項比率走勢」（G12）、通路寬表（G7b）、AI 收合。新區塊插在 `src/components/workspace-panels.tsx:188` 的 `DiagnosisList` 與 `:189` 的 `channel-compare` 之間。主層常駐獨立圖 2 張（G10、G11），G12 在 `<details>` 內不計（X37、CL-9）。

### G9 健檢清單內嵌影響金額條（新增；P1；V4-3a）

> **V4-3a 實作補記**：條不可點（列既有的展開與 number-link 不變；條在 `<summary>` 內，點條等於點 summary）；390 的條放在影響金額右側同一行（放在下方會讓每列多 16px、首列底晚於 V4-0 實測）；768–1023 條寬 64px；≥ 1024 有條時影響金額欄改 `minmax(160px, max-content)`；C24 tick 在門檻 0（與零線重疊）、|門檻| 超出共用尺度、值為 0 時不畫；空心條外框最短 3 個座標單位；不加 `impact.thresholdNote`。

| 項目 | 內容 |
|---|---|
| 位置與批次 | 健檢清單每列 `<summary>` 的 `span.diagnosis-impact`（`src/components/diagnosis-list.tsx:178`）內、影響金額之後；V4-3a |
| 資料 | `diagnosisGroups(snapshot).groups[].impact_cents`（`src/application/diagnosis-group.ts:98-130`；已依 \|影響\| 排序，`:78-84`）、`importance_threshold`（`:129`） |
| 等級與版本 | A |
| 技術 | C24 variance＋tick：只對差額類規則畫條（`REV_UP_CM_DOWN` 與四個費用負擔規則 `DISCOUNT_BURDEN_UP`、`REFUND_BURDEN_UP`、`FULFILLMENT_BURDEN_UP`、`MARKETING_BURDEN_UP`；`ranking_amount` 是兩期差額，`src/domain/rules.ts:128、142`）；水準類規則 `NEGATIVE_CHANNEL_CM`、`SKU_NEGATIVE_GP`（`ranking_amount` 是本期金額，`:132、160`）不畫條；差額類規則共用尺度（差額類列的 \|影響\| 最大值，含 `REV_UP_CM_DOWN`）；不利往左 `chartColors.unfavorable`、有利往右 `chartColors.favorable`。費用負擔規則是在比率上升時觸發（`rules.ts:139-141`），影響金額卻是金額差取負（`src/application/diagnosis-group.ts:23-27`）：比率上升、金額下降時影響為正，照有利色往右畫，不另外處理。`REV_UP_CM_DOWN` 的金額就是扣廣告後貢獻的總差額，費用規則的差額是它的組成（示範資料：`REV_UP_CM_DOWN` −598,833.95 與 `DISCOUNT_BURDEN_UP` −1,188,365.10 並列），所以它畫成空心條（2px 框線 `chartColors.unfavorable`、不填色），費用規則是實心條；仍用同一把尺（單位相同），清單下方註明空心與實心的差別；門檻刻度 `chartColors.target` 2×12，畫在條所在那一側的 \|門檻\| 位置；`aria-hidden`；缺漏規則與金額未知列不畫；不做「其他」合併（X38） |
| ChartFrame | 不用（清單內嵌） |
| 標題與 labels | 沿用清單標題與每列 headline、影響金額；新 key `diagnosis.chartsV4.impact.totalNote`「空心條是扣廣告後貢獻的總差額，實心條是各項費用的差額」（清單下方一行，不是否定句）；若 H5 要求門檻刻度圖說，才加 `diagnosis.chartsV4.impact.thresholdNote` |
| testid | `chart-diagnosis-impact-bar-{rule}`（rule＝`RuleCode`，每列唯一） |
| 資料表 | 清單本身（每列有影響金額文字） |
| 鍵盤 | 不變：`diagnosis-row-*` 的 summary 是停留點，條在 summary 內但 `aria-hidden`、不可聚焦；鍵盤里程碑「健檢第一列」（`tests/e2e/keyboard-walk.spec.ts:23`）不變 |
| 抽屜 | 條不另設點擊；列既有的展開與 `ImpactAmount` number-link 不變 |
| 390 | 條寬 64，放在影響金額下方 |
| 投影 | 不適用（健檢頁不投影） |
| 匯出 | 不印、不放；Excel 不另加（摘要已含健檢） |
| 單元測試 | `tests/bar-cell.test.ts`（tick 位置）；`tests/diagnosis-v3.test.tsx` 擴：條數＝差額類規則中有金額的列數、水準類規則列與缺漏規則列沒有條、水準類列的金額不參與共用最大值、輸出沒有任何跨規則合計；費用規則影響為正（比率上升、金額下降）的案例畫有利色往右；`REV_UP_CM_DOWN` 的條是空心（`fill` 為 none、有 `stroke`） |
| E2E 草案 | `diagnosis-list` 內 `[data-testid^='chart-diagnosis-impact-bar-']` 數＝`diagnosisGroups` 中差額類規則有金額的 group 數；`chart-diagnosis-impact-bar-NEGATIVE_CHANNEL_CM` 不存在；`chart-diagnosis-impact-bar-REV_UP_CM_DOWN` 是空心條，寬度＝\|總差額\| ÷ 共用最大值；實心條中最寬的是 \|影響\| 最大的費用負擔規則列；健檢首列底（metrics.spec）不晚於 V4-0 實測 |

### G10 每 100 元淨營收去向（新增；P1；V4-3a）

> **V4-3a 實作補記**：資料表多一欄「通路費用合計（元）」（四項費用段要有鍵盤可達的對應格，PRD §2.2 C7）；最後一欄欄名「每 100 元淨營收」，格內「剩 {n} 元／虧 {n} 元」；每 100 元抽屜的值是 domain 的 `contribution_margin`（unitOverride "percent"，組成是扣廣告後貢獻與淨營收，contribution-v1）；標題只從可畫（ready）的通路挑；超過 8 通路照算 channelStructure（資料表要用）但不畫段；不加 `segments.over`（超過 100 由右端「虧 n 元」與不利色承擔）。

| 項目 | 內容 |
|---|---|
| 位置與批次 | 健檢頁，清單之後；V4-3a |
| 資料 | 每通路的「剩」與商品成本、廣告費、扣廣告後貢獻三段的比率直接呼叫 `profitWaterfall(snapshot, channel)`（`src/application/waterfall.ts:236-280`）：`perHundred`（`:262-263`）與 `rows[].share`（`:271`），和 G2 切到該通路時是同一個實作、同一個版本（`contribution-v1`），不另寫一套。真正新增的只有 `channelStructure(snapshot, "current")`（新增 `src/application/chart-structure.ts`）：每通路把 `report.current.channels[c].metrics`（`src/domain/aggregation.ts:89-108`）的四項通路費用 `platform_fees`、`payment_fees`、`fulfillment_costs`、`other_variable_costs` 以 `sumAmounts` 合成一段，佔淨營收比用 `ratioMetric`、每 100 元比照 `perHundred`（`Decimal`、HALF_UP 一位）；超過 100 的幾何；合計一列（`report.current.metrics`）。每列 `applicable=false` 的條件：任一扣項為負，或淨營收 ≤ 0 |
| 等級與版本 | 各通路的剩與段比率：A（`contribution-v1`，沿用 `profitWaterfall`）；四項費用合計與超過 100 的幾何：B／`CHANNEL_STRUCTURE_VERSION = "channel-structure-v1"`。golden：每通路七段（商品成本、四項費用、廣告費、扣廣告後貢獻）加總＝淨營收（到分，比照 `waterfall.ts:255-259`）；每通路的「剩」＝`profitWaterfall(snapshot, channel).perHundred`、段比率＝`rows[].share`（逐字相同）；合計列的「剩」＝`profitWaterfall(snapshot, "all").perHundred`（示範 16.2、golden 10.3）；golden MARKETPLACE 扣廣告後貢獻 −15.00 畫成超過 100；`refund_only` 出現「不適用」列；`zero_ad` 廣告段寬 0、資料表照列 |
| 技術 | C27 ShareStack inline SVG（`stackOffset="expand"` 不支援負值，不用 Recharts）；每通路一列 `chartRowHeights.row24`，svg 高＝（通路數＋合計 1 列＋x 軸與 100 標字 1 列）× `row24`（CL-10）；x 0 到 max(100, 最大扣項合計)；三段灰階 `chartColors.seg1`（商品成本）、`seg2`（四項費用）、`seg3`（廣告費）；剩餘為空心框（stroke `chartColors.total`）；超過 100 的部分 `chartColors.unfavorable`；100 處參考線 `chartColors.axis`；段間 1px `chartColors.surface`（依 D-V4-19）；`shareStackGeometry` 純函式；`--chart-seg-1..3` 本批宣告 |
| ChartFrame | `id="share"`、`page="diagnosis"`、`title`、`subtitle`（標準名 · 本期 · 範圍；有不適用通路時加一句說明）、`legend`（4 項：`metricDefinitions.cogs_net` 的商品成本、`diagnosis.chartsV4.share.feesTitle`「通路費用合計」、`metricDefinitions.ad_spend.shortLabel`「廣告費」三段用 line；剩餘用 `rect` 空心框，與圖內形狀相同；指標名一律取 `metricDefinitions`，不另立「廣告費用」這類新字串）、`height`（依 `report.scope.channels` 的通路數：≤ 5 用 `"sm"`（7 × 24＝168 ≤ 180），6 到 8 用 `"lg"`（10 × 24＝240 ≤ 320）；通路數不隨期間改變，B4 照常）、`dataTable`（C33）；通路 > 8 時 `state="empty"`（lg）並以 `message` 指向資料表與通路寬表，不計算幾何 |
| 標題與 labels | `diagnosis.chartsV4.share.title.{loss, least, notApplicable}`：有虧損通路「{通路} 每 100 元淨營收，扣完廣告虧 {n} 元」（取每 100 元虧最多的通路；同值依通路代碼）；沒有「{通路} 每 100 元淨營收，扣完廣告剩 {n} 元，最少」（「扣完廣告」與 G2 的 `overview.profit.title`、`docs/revamp-v3/GLOSSARY.md:18` 同一寫法）；全部通路都「不適用」（沒有任何一個通路有每 100 元的值，例如 `refund_only`：DTC 的 `perHundred` 與合計都是 null）時用 `notApplicable`「每 100 元淨營收去向，各通路都不適用」，副標說明原因；另 `subtitle`、`segments.{remain, over}`（商品成本與廣告取 `metricDefinitions` 的名稱，四項合計用 `feesTitle`，不另立 `cogs`、`ad`、`fees`）、`remain`（剩 {n} 元）、`loss`（虧 {n} 元）、`notApplicableRow`、`feesTitle`（「通路費用合計」，v4 GLOSSARY 增補：平台抽成、金流手續費、物流與包材費、其他變動費用四項相加）、`feesDefinition`、`feesTechnical`、`columns.{perHundred}`（其餘欄名取 `metricDefinitions`） |
| testid | `chart-diagnosis-share`、`chart-diagnosis-share-seg-{channel}-{segment}`（segment＝cogs、fees、ad、remain、over）、`chart-diagnosis-share-table` |
| 資料表 | 通路、淨營收、商品成本、平台抽成、金流手續費、物流與包材費、其他變動費用、廣告投放費、扣廣告後貢獻（L2 number-link；欄名一律取 `metricDefinitions[field].label`，390 窄欄才用 `shortLabel`；不用舊名「平台費」，它是 `labels.zh-TW.ts:2517` 列的 oldNames）、每 100 元剩（L2 一位小數，純文字；D-V4-32＝A 時改 number-link）；加合計列；不適用通路照列 |
| 鍵盤 | 經資料表 summary 與表內 number-link；圖 0 停留點 |
| 抽屜 | 商品成本、廣告費、剩／虧段：`channelEvidence(snapshot, channel, "current", metric)`（`src/components/overview/charts/channel-section.tsx:41`，帶 `filter.channel`；值取自 domain，維持 `contribution-v1`）；四項費用段：`{ title: labels.diagnosis.chartsV4.share.feesTitle（通路費用合計）, name: "platform_fees"（只用來借金額單位，不代表指標）, metric: 四項加總, period: 本期, channels: [channel], sources, formula: 四項相加, formulaTechnical: labels.diagnosis.chartsV4.share.feesTechnical（四項相加的技術式）, definition: labels.diagnosis.chartsV4.share.feesDefinition, components: 四項（列名各取 metricDefinitions 的四項費用名）, valueKind: "level", metricVersion: "channel-structure-v1", filter: { channel } }`；抽屜不得顯示 `platform_fees` 的定義、技術公式與列名（PRD §8.7）；每 100 元在 D-V4-32＝A 前不開抽屜 |
| 390 | 列右端只標「剩／虧 {n} 元」，段內不標值；高度不變 |
| 投影 | 不適用 |
| 匯出 | 不印、不放；Excel「圖表資料」：通路 × 7 欄金額＋每 100 元 |
| 單元測試 | `tests/chart-structure.test.ts`（七段恆等 golden 與 demo、每通路的剩＝`profitWaterfall(snapshot, channel).perHundred` 且段比率＝`rows[].share` 逐字相同、合計＝`perHundred`、MARKETPLACE 超過 100、`refund_only` 不適用且標題用 `title.notApplicable`、`zero_ad`、4 通路合成資料）；`tests/evidence-drawer-v3.test.tsx` 擴（四項費用段的抽屜大數字不帶「+」、技術細節不出現 `platform_fees` 的公式、`metric_version` 顯示 `channel-structure-v1`）；`tests/chart-geometry-v4.test.ts`（`shareStackGeometry`：超過 100 的段寬、x 軸上限；（列數＋2）× 24 ≤ 所選固定高，通路 5 與 8 各一例） |
| E2E 草案 | `chart-diagnosis-share` 可見且 `.chart-frame` 有 `aria-hidden`；示範資料 `chart-diagnosis-share-seg-MARKETPLACE-over` 存在且 `fill` 為 `chartColors.unfavorable`；資料表列數＝通路數＋1；點 `…-seg-DTC-cogs` 開抽屜，篩選片語含 DTC 的通路名 |

### G11 日 × 通路月曆熱表（新增；P1；V4-3b）

> **V4-3b 實作補記**：1440 用 `auto-fill`（3 個以上通路時一列 3 張，示範資料 2 通路為 2 張），768、390 一列 1 張（V4-0b 實測）；「其餘通路在框內捲動」以「框高 lg 放不下全部月曆」判斷（`heatColumnsNeeded`＋container query），不是字面上的一列放不下；抽屜標題用 `metricDefinitions` 的標準名「扣廣告後貢獻」，日期與通路在副標與篩選片語（不加 `cellTitle`）；格的可及名稱含可見的「−0.45」（label-content-name-mismatch）；階 2 框線與資料待補虛線框畫在格內按鈕上（不用 box-shadow）；超過 92 天排成一張週 × 通路矩陣（`layout=matrix`，格的抽屜沿用 G7b 的形狀與 `channel-weeks-v1`），週 × 通路超過 736 格時不渲染（`tooManyCells`）；整張熱表的 click、keydown、focus 只掛在外層 `.heat-grid`（事件代理）。

| 項目 | 內容 |
|---|---|
| 位置與批次 | 健檢頁，G10 之後；V4-3b |
| 資料 | `dailyHeatmap(snapshot, "contribution_after_marketing")`（新增 `src/application/chart-heatmap.ts`）：`report.current.daily[]`（`DailyChannel`：`date`、`channel`、`metrics`、`sources`，`src/domain/types.ts:95-101`）與 `report.current.daily_complete`（`src/domain/aggregation.ts:67`）；輸出每通路一份月曆（列＝snapshot 週：從期間起日每 7 天一段，`src/application/workspace.ts:80`，與 G3、G7b、G12 同一組週；欄＝該週第 1 到 7 天，每欄的星期固定，欄頭標星期；期間外的格標 `outside`）；分階：階 1＝取位到元後仍為負（與 v3 通路結論句 `src/application/chart-takeaways.ts:101-103` 同規則），階 2＝該通路階 1 中最差 3 天（同值依日期先後）；正值不分階（D-V3-7）；另輸出「最差一天」供標題；月曆的輸出順序：標題所指的通路（最差一天所在通路；沒有虧損日時是最低那天所在通路）排第一，其餘依 `report.scope.channels`，元件照這個順序輸出 DOM，不用 CSS `order`；通路 > 8 時不計算（與 G10、G7b 同一上限），回傳 `tooMany: true` |
| 等級與版本 | B／`DAILY_HEATMAP_VERSION = "daily-heatmap-v1"`。golden：每通路逐日加總＝通路期間合計（`daily_complete` 時，到分）；階 2 每通路恰好 min(3, 階 1 天數) 格；null 格不參與排名；分階屬整理，格值本身直接取自 domain |
| 技術 | C28 HeatTable calendar：原生 `<table>`，每通路一張，`caption`＝通路與單位，`th scope` 齊全；格 `data-tier="0｜1｜2｜missing｜outside"`；底色只用 `--chart-heat-1`、`--chart-heat-2`（V4-3b 宣告，`--chart-heat-2` 引用新增的 `--red-100`），階 2 另加 2px `--chart-unfavorable` 框線；null 格虛線框 `--chart-missing`＋「資料待補」；格內用 `formatHeatCell`（新增在 `presentation.ts`：以萬為單位、兩位小數、不帶單位，例如「−0.45」，取位到元後仍為負時保留 U+2212；單位寫在 caption）number-link，可及名稱帶 L2。L1 在不到 1 萬時輸出「元」（`presentation.ts:100-110`），示範資料 MARKETPLACE 每天都不到 1 萬，「−4,511 元」比格寬還寬，所以不用 L1。格採 grid 型 roving tabindex（表格加 `role="grid"`，整張 1 個 Tab 停留點，方向鍵移動、Home／End 到列首尾、Enter 或空白鍵開抽屜）；超過 92 天改週 × 通路（用健檢頁同一份 `channelWeeks` 結果；它不在 snapshot 內）；格寬 ≥ 1280 為 44px、768 到 1279 與 390 為 40px，每列張數由 CSS grid `auto-fill` 依框內寬決定（每張最小寬＝週欄 40＋7 × 格寬）：1440 與 1280 一列 2 張，768（內寬約 670）一列 2 張（V4-0b 實測，放不下時 1 張），390 一列 1 張 |
| ChartFrame | `id="heat"`、`page="diagnosis"`、`mode="table"`（固定高容器不設 `aria-hidden`，內含 `.table-scroll[role=region][aria-labelledby="heat-title"]`；格可聚焦，不另加 `tabindex`）、`height="lg"`；不給 `dataTable`（表本身就是資料表）；`subtitle` 在 `daily_complete=false` 時加說明句，一列放不下全部月曆時（390，或通路多於一列可放的張數）另加 `scrollNote`；通路 > 8 時 `state="empty"`，`message` 指向既有通路寬表 |
| 標題與 labels | `diagnosis.chartsV4.heat.title.{loss, none}`：「{通路} 有 {n} 天虧，最差 {date} {amount}」（取最差一天所在通路；n＝該通路階 1 天數；「虧」＝取位到元後仍為負）；沒有虧損日「沒有虧損日，最低 {通路} {date} {amount}」；另 `subtitle`、`weekdays.{mon … sun}`、`weekHead`、`caption`、`cellAria`、`partialNote`、`weeklyFallbackNote`、`scrollNote`（「其餘通路在框內捲動」）、`tooMany` |
| testid | `chart-diagnosis-heat`、`chart-diagnosis-heat-cell-{channel}-{date}`（date＝ISO） |
| 資料表 | 表本身；不另設 `<details>` |
| 鍵盤 | 整張熱表 1 個 Tab 停留點（grid 型 roving tabindex；聚焦時落在上次的格或第一個有值的格）；方向鍵在格間移動，跨通路月曆時沿 DOM 順序；Enter 或空白鍵開抽屜。逐格 Tab 時示範資料有 84 個停留點、8 通路 × 92 天有 736 個，會吃光 `tests/e2e/keyboard-walk.spec.ts:18-19` 的 `MAX_TABS = 160`、`MAX_WALK = 700`，也讓下面的通路寬表與 AI 區到不了；通路 ≤ 8 才渲染，格數 ≤ 8 × 92＝736（PRD §8.2） |
| 抽屜 | `{ name: "contribution_after_marketing", metric: daily.metrics.contribution_after_marketing, period: { start: date, end: date }, channels: [channel], sources: daily.sources, title: fill(cellTitle, { channel, date }), arrangeVersion: "daily-heatmap-v1", filter: { channel, date } }`（值取自 domain，不給 `metricVersion`，抽屜顯示 `contribution-v1`；V4-3a 已修正 `ladderMetrics`，單日單一通路的證據不畫全通路階梯）；`filter.date` 由本批在 `src/application/evidence-filter.ts:10-13` 新增（同批加 `sku`），`evidenceFilterText` 加日期片語 |
| 390 | 各通路月曆上下堆疊；390 的實際內寬約 324px（`--gutter` 16×2、`.panel` 框線 1×2、`.chart-section` padding 16×2，`src/app/globals.css:192、306、1323`），週欄 40px＋7 欄 × 40px＝320px；V4-0b 設計稿實測放不下時，允許 `.table-scroll` 內部水平捲動（頁面不捲動）。框高維持 lg 320，一張月曆含表頭與 caption 約 244px，兩張以上時在框內垂直捲動；標題所指的通路排第一張，所以第一眼看到的就是標題說的那個通路（示範資料是 MARKETPLACE，本期 32 天取位到元後為負；DTC 是 0 天），副標加 `scrollNote` |
| 投影 | 不適用 |
| 匯出 | 不印、不放；Excel「圖表資料」：日 × 通路矩陣（L3 數值格） |
| 單元測試 | `tests/chart-heatmap.test.ts`（逐日加總、分階與同值排序、階 1 用「取位到元後仍為負」、null 不排名、正值不分階、期間不從週一開始時列仍是 snapshot 週且欄頭星期跟著起日、> 92 天改週）；`tests/format-layers.test.ts` 擴（`formatHeatCell`：−4,510.74 寫「−0.45」、取位到元後仍為負但萬位取位為 0 時寫「−0.00」、−0.30 寫「0.00」）；`tests/evidence-filter.test.ts` 擴（單日、通路加單日、SKU、manifest 列保留） |
| E2E 草案 | `chart-diagnosis-heat` 的 `.chart-frame` 沒有 `aria-hidden`；axe 無 `aria-hidden-focus`；點 `chart-diagnosis-heat-cell-DTC-{第一個有值日期}` 開抽屜，篩選片語含該日期與通路名、原始明細每列日期都等於該日；390：第一張月曆的 `caption` 是標題所指的通路，且不捲動就在框內可見（bounding box 頂與底都在 `.chart-frame` 內）；`expectNoPageScrollX`，且每張月曆表寬 ≤ 所在 `.table-scroll` 的 `clientWidth`（設計值 320；V4-0b 實測放不下而改為內部捲動時，只斷言頁面不捲動並記入驗收）；keyboard-walk：健檢頁從熱表前一個停留點到熱表後一個停留點的 Tab 數 ≤ 3；`tests/charts-diagnosis-v4.test.tsx` 用記憶體中的 50 通路 × 92 天合成資料斷言 G11 不輸出任何格 |

### G12 五項比率走勢小倍數（新增；P1；V4-3b）

> **V4-3b 實作補記**：C26 用 inline SVG（不是 Recharts LineChart），理由是五張 Recharts 會增加切到通路健檢的主執行緒成本（V4-3a 量到 390 TBT 只剩約 5% 餘裕），且 inline SVG 在 SSR 就輸出圖形、單元測試可直接驗 Y 範圍；E2E 用 `circle.chart-point-hit[data-series][data-index][data-key]` 定位點。比率軸刻度用 `copy.ts` 的 `formatAxisPercent`（整數百分比）。768 一列 5 張時線尾標值放不下就不畫、熱區半徑縮成位置寬的一半；去年同期可用時資料表多列去年同期各週。

| 項目 | 內容 |
|---|---|
| 位置與批次 | 健檢頁 G11 之後的 `<details class="chart-more">`，summary「五項比率走勢」；V4-3b |
| 資料 | `weeklyRows`／`yoySummary`（`src/application/workspace.ts:82`、`:97`，由 `createSnapshot` 呼叫）產生的 `snapshot.weeks`（兩期）與 `snapshot.yoy.weeks` 的 `discount_rate`、`refund_ratio`、`fulfillment_burden`、`marketing_burden`、`gross_margin`；標題用區塊名，不取兩期期間值比大小：五項比率的分母不同（`docs/METRICS.md:13-17、21`），百分點差不能互比，所以不呼叫 `percentagePointChange` 挑「升降最多」 |
| 等級與版本 | A |
| 技術 | C26 SmallMultiples：單一 ChartFrame 內 CSS grid，子圖用小標，不套 `section.panel`（X8）；每格 Recharts `LineChart`（首載已有）；每張小圖各自定 Y（同一比率的本期、上期、去年同期共用）：下界 min(0, 最小值)、上界最大值，範圍 ≥ 10 個百分點時取整到 5，否則取整到 1（`axisTicks`，只是座標）；不同比率不共用尺度（示範資料每週物流費佔比約 1.15% 到 1.94%（上期 1.146% 到 1.188%、本期 1.843% 到 1.939%；1.17% 與 1.88% 是兩期的期間值），若和毛利率共用 0–45% 只有 2–3px 起伏）；毛利率可以為負，下界跟著往下；本期 `chartColors.current`、上期 `chartColors.previous`、去年同期 `chartColors.yoy` 虛線 4 3；線尾標本期 L1 百分比；比率可畫未滿 7 天的週（資料表註明）；週點熱區沿用 `circle.chart-point-hit` 作法 |
| ChartFrame | `id="rates"`、`page="diagnosis"`、`title`（區塊名）、`subtitle`、`legend`（本期、上期 line；去年同期 dash）、`height="sm"`、`frameClassName="multiples"`、`dataTable`（C33） |
| 標題與 labels | `diagnosis.chartsV4.rates.{summary, title, subtitle, columns.*}`：`summary`＝「五項比率走勢」（`<details>` 的 summary）；`title`＝區塊名「五項比率每週走勢」，不寫結論句、不做跨比率排名（PRD §4.2）；小標取 `metricDefinitions[rate].label` |
| testid | `chart-diagnosis-rates`、`chart-diagnosis-rates-table` |
| 資料表 | 週（週名、起訖）× 5 比率 × 期間（L2 百分比 number-link） |
| 鍵盤 | `<details>` summary、資料表 summary、表內 number-link |
| 抽屜 | 點與資料表格：`weekEvidence(week, rate, channels)`（`src/components/overview/charts/trend-section.tsx:72`，帶 `filter.week`），比率由抽屜既有 `RATIOS` 對照畫分子分母（`evidence-drawer.tsx:63-66`）；`RATIOS` 沒有 `refund_ratio`，退款金額比只顯示定義、沒有分子分母表（v3 現況，v4 不改抽屜） |
| 390 | 單欄列出全部 5 張，不設「更多指標」：C26 的子圖都在 ChartFrame 的 `aria-hidden` 固定高容器內（`chart-frame.tsx:65`），容器內的 `<details>` summary 會變成 `aria-hidden` 內的停留點（X35、CL-7、B6；axe `aria-hidden-focus` 為 serious），鍵盤與報讀使用者也打不開。固定高容器以 `frameClassName="multiples"` 在 ≤ 767px 改為 `chartHeights.sm` × 5（C26 以 `chartHeights.sm * count` 給值）；同一個 DOM 實例（M1、M6） |
| 投影 | 不適用 |
| 匯出 | 不印、不放；Excel「圖表資料」：週 × 5 比率 |
| 單元測試 | `tests/charts-diagnosis-v4.test.tsx`：收合時 `chart-diagnosis-rates` 仍在 markup（M1）、五個小標、圖容器內沒有 `<details>` 與按鈕、標題等於區塊名、每張子圖的 Y 範圍各自涵蓋該比率三條線（毛利率為負時下界 < 0；物流費佔比的範圍取整到 1 個百分點）、資料表列數＝週數 |
| E2E 草案 | 展開「五項比率走勢」後五張子圖可見（390 單欄 5 張，`.chart-frame` 高＝`chartHeights.sm` × 5）；健檢頁 `main .chart-frame:visible` 的等高比較只在「五項比率走勢」展開時做（收合時它沒有 bounding box），切期間前後高度不變；`tests/mounted-testids.test.tsx` 在 V4-3b 錨點後新增「健檢圖區收合」狀態 |

## 5 實作卡：商品毛利與假設試算（G13–G16、G24 見 §8）

商品頁（PRD §5.3）：`section.product-highlights`（`src/components/product-comparison-panel.tsx:257`）保留 `h3#product-highlights-heading`，把 `.product-highlight-grid` 內的兩張前 10 名表改成 ChartFrame 的 `after`：第一格在有商品毛利為負的商品時是 G14（`after`＝`product-worst`），沒有時照 v3 原樣只放 `product-worst` 表（示範資料與 golden 本期都沒有負值，所以示範資料是這種）；第二格是 G13（`after`＝`product-best`）。兩個 ChartFrame `headingLevel={4}`；`product-worst`、`product-best` 的 DOM 與 testid 不變。同批把 `metricLink`、`deltaLink`（`product-comparison-panel.tsx:169、189` 的閉包）抽成 `src/components/product-evidence.ts` 的 `productEvidence`、`productDeltaEvidence`（只搬移，抽出前後 `EvidenceSelection` 相同），讓圖、前 10 名表、完整表用同一個 builder。

### G13 商品毛利兩期差額（新增；P1；V4-4）

| 項目 | 內容 |
|---|---|
| 位置與批次 | 商品頁 `.product-highlight-grid` 第二格；V4-4 |
| 資料 | 商品頁既有 `comparison.rows`（`compareProducts(dataset, snapshot.report.scope)`，`product-comparison-panel.tsx:133`；`src/domain/product-comparison.ts:37`）的 `changes.gross_profit` 與兩期 `gross_profit`；增加最多沿用 `productHighlights().bestChange`（`src/application/product-highlights.ts:31-41`）；減少最多在同檔新增對稱的 `worstChange`（差額 < 0、由小到大，同值依通路、SKU；只挑列，不產生新數字）；圖每欄只畫前 5 列（`after` 的 `product-best` 表與資料表照列前 10 與全部） |
| 等級與版本 | A（只排序挑選既有差額；沿用 `product-highlights.ts` 既有的呈現層排序定位） |
| 技術 | C25 RankedBars variance（inline SVG，SSR 輸出每根柱與 testid）；兩欄（減少、增加）各 ≤ 5 根、共用尺度、各自從 0；減少 `chartColors.unfavorable`、增加 `chartColors.favorable`；列高 `chartRowHeights.row16`：1440 兩欄並排 5 × 16＝80，390 改上下 10 × 16＝160，都 ≤ sm 180（原本各 10 列時，390 上下是 320，示範資料兩欄都取滿，會溢出固定高）；欄名不放在 svg 內，用 ChartFrame `legend`；SKU · 通路在左，值在條端 L1 帶號；`hbarGeometry(rows, width, "variance")`；量寬用 ResizeObserver，SSR 寬 560；差額 null 的列不列入 |
| ChartFrame | `id="products-variance"`、`page="products"`（testId `chart-products-variance`）、`headingLevel={4}`、`title`、`subtitle`、`legend`（減少最多、增加最多兩項 line）、`height="sm"`、`after={highlightTable("best", bestChange)}`、`dataTable`（C33） |
| 標題與 labels | `products.chartsV4.variance.title.{decrease, increase, none}`：「{SKU} · {通路} 商品毛利少 {amount}，減少最多」；沒有減少時「{SKU} · {通路} 商品毛利多 {amount}，增加最多」（資料列是 SKU × 通路；順序與 v3 前 10 名表、完整表的「SKU · 通路」一致；通路名與 SKU 不計入 14 字；示範資料是「SKU-020 · 平台 · MARKETPLACE」，−30,198.96）；都沒有時用空狀態；另 `subtitle`、`columns.{decrease, increase}`、`table.*` |
| testid | `chart-products-variance`、`chart-products-variance-bar-{channel}-{sku}`、`chart-products-variance-table`；既有 `product-best` 常駐 |
| 資料表 | SKU · 通路、上期商品毛利、本期商品毛利、差額（L2 number-link） |
| 鍵盤 | ChartFrame 標題、`after` 的 `product-best` 表（既有停留點）、資料表 summary |
| 抽屜 | 條與資料表差額格：`productDeltaEvidence(row, "gross_profit")`（由 `deltaLink` 抽出）再加 `filter: { channel, sku }`；兩期格：`productEvidence(row, period, "gross_profit")` |
| 390 | 兩欄改上下（減少在上） |
| 投影 | 不適用 |
| 匯出 | 不印、不放；Excel「圖表資料」：SKU、通路、上期、本期、差額 |
| 單元測試 | `tests/product-highlights.test.ts` 擴（`worstChange` 排序、同值、null 不列入、`bestChange` 不變）；`tests/product-page-v3.test.tsx` 擴（`product-best` 仍在 `chart-products-variance` 內、條與差額格 evidence `toEqual`、每欄 ≤ 5 根）；`tests/chart-geometry-v4.test.ts`（`hbarGeometry`：10 × 16 ≤ 180） |
| E2E 草案 | `chart-products-variance` 內 `product-best` 可見；條數＝兩欄列數合計；點第一根減少條開抽屜，抽屜 `sku` 篩選片語含該 SKU；390 兩欄上下排列（減少欄的 y 較小） |

### G14 商品毛利為負的商品累計（Pareto）（新增；P1；V4-4）

| 項目 | 內容 |
|---|---|
| 位置與批次 | 商品頁 `.product-highlight-grid` 第一格；V4-4 |
| 資料 | `productPareto(rows, "gross_profit", 10)`（新增 `src/application/chart-pareto.ts`）：輸入同 G13 的 `comparison.rows`（和 `product-worst` 同一個 `compareProducts` 結果、同一個 evidence builder），取本期 `gross_profit`；只取商品毛利 < 0 的列（`product-worst` 的 `worstCurrent` 會補入非負的列，`src/application/product-highlights.ts:33-35`，這裡不補），依 `parseCents` 由小到大排序（同值依通路、SKU），累計 `sumAmounts`；累計佔比（佔商品毛利為負合計）＝\|累計\| ÷ \|負值合計\|：先以 `subtractAmounts({ cents: 0n, reason_codes: [] }, x)` 把累計與負值合計取反成正的負值額，再呼叫 `ratioMetric`（直接 `ratioMetric(累計, 負值合計)` 時分母為負，`src/domain/money.ts:32-35` 一律回傳 null；`docs/METRICS.md:20` 不以負分母製造率指標）；輸出 `{ rows: {row, value, cumulative, share}[], total, count, more }` |
| 等級與版本 | B／`PRODUCT_PARETO_VERSION = "product-pareto-v1"`。golden：末筆累計＝負值合計；末筆累計佔比＝100%；手算：`refund_only` 本期 DTC · A −60.00（1 筆：累計 −60.00、佔比 100%）；4 通路合成資料多筆逐筆手算；示範資料與 golden 本期沒有負值，`count=0` |
| 技術 | C25 pareto 模式：排序長條（從 0 往左，`chartColors.unfavorable`）＋右側「累計 {pct}」標值；柱 ≤ 10，列高 `row16`，加「另 {n} 個」1 列共 11 × 16＝176 ≤ sm 180，其餘寫「另 {n} 個」文字，不畫「其他」柱（X38）；不做 SKU 層扣廣告後貢獻（不分攤） |
| ChartFrame | `id="products-pareto"`、`page="products"`（testId `chart-products-pareto`）、`headingLevel={4}`、`title`、`subtitle`、`height="sm"`、`after={highlightTable("worst", worstCurrent)}`；`count=0` 時不渲染這個 ChartFrame，第一格照 v3 原樣只放 `highlightTable("worst", worstCurrent)`（DOM 與 testid 和 v3 相同），不顯示「沒有負值」的空狀態，避免標題寫沒有負值、下面又是「最差商品」表、`dataTable`（C33） |
| 標題與 labels | `products.chartsV4.pareto.{title, subtitle, cumulative, more, columns.*}`：「{n} 個商品毛利為負，前 {k} 個佔 {pct}」（k＝min(3, n)；pct＝累計佔比（佔商品毛利為負合計））；圖名、副標、資料表一律寫「商品毛利為負」，不寫「賠錢」「虧損」：資料只有商品毛利，不含通路費用與廣告，商品毛利為負不等於扣完所有費用後賠錢（退款依入帳日扣除，`refund_only` 的 −60.00 是退款大於當期銷售造成的，`docs/DATA_CONTRACT.md:25`；AGENTS.md：商品畫面只呈現商品毛利）；copy-scan 對 `products.chartsV4.*` 擋這兩個詞；沒有負值時不渲染，不建 `empty` key；`refund_only` 的句子是 n＝1、k＝1、pct＝100%，合成資料的值由 V4-4 測試算出後寫進驗收 |
| testid | `chart-products-pareto`、`chart-products-pareto-bar-{channel}-{sku}`、`chart-products-pareto-table`；既有 `product-worst` 常駐 |
| 資料表 | SKU · 通路、商品毛利（L2 number-link）、累計（L2 number-link）、累計佔比（L2 百分比；D-V4-32＝A 前為純文字） |
| 鍵盤 | 標題、`product-worst` 表（鍵盤里程碑「最差商品」，`tests/e2e/keyboard-walk.spec.ts:24`，仍在第一張圖的資料表 summary 之前）、資料表 summary |
| 抽屜 | 條與商品毛利格：`productEvidence(row, "current", "gross_profit")`＋`filter: { channel, sku }`＋`arrangeVersion: "product-pareto-v1"`（值取自 domain，`metric_version` 維持 `contribution-v1`；列由 `productPareto` 挑出與排序，依 §1.2 的 `arrangeVersion` 規則；V4-4 審查補記）；累計格：`{ title: 累計, name: "gross_profit", metric: cumulative, period: 本期, channels: 涉及的通路, sources: 各列 sources 聯集, formula: 逐項相加, components: 前 i 個 SKU, valueKind: "level", metricVersion: "product-pareto-v1" }`（抽屜大數字不帶「+」） |
| 390 | 維持（列高不變） |
| 投影 | 不適用 |
| 匯出 | 不印、不放；Excel「圖表資料」：SKU、通路、商品毛利、累計、累計佔比 |
| 單元測試 | `tests/chart-pareto.test.ts`（`refund_only` 與合成資料：末筆累計＝負值合計、末筆累計佔比 100%、佔比不是 null；golden 與 demo：`count=0`；同值排序、`more` 計數、輸出不含「其他」合計）；`tests/charts-products-v4.test.tsx`（V4-4 新增：無負值時沒有 `chart-products-pareto`、`product-worst` 的 DOM 與 v3 相同；累計格的抽屜大數字不帶「+」）；`tests/chart-geometry-v4.test.ts`（`hbarGeometry` pareto） |
| E2E 草案 | 示範資料：`chart-products-pareto` 不存在，`product-worst` 照 v3 位置可見；合成資料：`chart-products-pareto` 內 `product-worst` 可見，條數＝min(10, 負值商品數)，資料表最後一列累計佔比文字＝`formatRateL2` 對「取反後的負值合計 ÷ 取反後的負值合計」的 `ratioMetric` 輸出（即 100%）；keyboard-walk 的 `product-worst` 里程碑 Tab 數不晚於 V4-0 實測 |

### G15 方案差額（新增；P0；V4-5，會議實例 V4-6）

| 項目 | 內容 |
|---|---|
| 位置與批次 | 試算頁：`DecisionWorkbench` 內、方案欄 `scenario-columns`（`src/components/decision-workbench.tsx:273`）之後、方案比較表區塊 `section.scenario-compare`（`:352`）之前，每個 DecisionWorkbench 一份（頁面同時只渲染目前通路的一份，全頁唯一），V4-5。會議頁：議程 5（`src/components/meeting-page.tsx:381-385`）的 `meeting-scenario-results` 之前，V4-6 |
| 資料 | 試算：`calculateScenario`（`src/domain/scenarios.ts:123`，經 `updateScenarioContext`，`src/application/scenario-workspace.ts:54`）產生的 `plans[].result`（`status: "valid"` 時的 `contribution`、`delta`）、`plans[].name`、`plans[].id`、`session.baseline.amounts.contribution_after_marketing`；結果尚未產生的方案不畫（與比較表的 `planCell` 同規則，`:47`）。會議：`context.scenarios[]`（`SummaryScenario`：`id`、`name`、`scopeLabel`、`status`、`baseline`、`contribution`、`delta`，`src/application/manager-summary.ts:38-43`）；`status="stale"` 的方案不畫條，只列在資料表並標過期 |
| 等級與版本 | A；golden 試算 284.00／264.00／19.70 不變；不跨通路相加 |
| 技術 | C25 variance，從 0；試算 ≤ 3 根；會議實例每通路一根（`docs/SCENARIOS.md:76`：會議每通路最多選一個相容的已計算修訂），上限 6 根，其餘只列在資料表並寫「另 {n} 個」（通路最多 1,000 個，`src/application/limits.ts:6`）；列高 `row24`，（根數＋軸 1 列）× 24 ≤ sm 180；零線＝現況；色依 `deltaTone("contribution_after_marketing", delta)`：少賺 `chartColors.unfavorable`、多賺 `chartColors.favorable`；方案名在左（會議加通路名），值在條端 L1 帶號 |
| ChartFrame | 試算：`id="scenarios-variance"`、`page="scenarios"`（testId `chart-scenarios-variance`）、`variant="panel"`、`height="sm"`、`state`（沒有任何有效結果時 `empty`）、`dataTable`（C33）；過期時副標加既有的 `staleSuffix`。會議：`id="meeting-scenarios"`、`testId="chart-meeting-scenarios"`、`variant="inline"`、`headingLevel={4}` |
| 標題與 labels | `scenarios.chartsV4.variance.title.{more, less, flat}`：「{方案}試算後比現況多賺 {amount}」／「{方案}試算後比現況少賺 {amount}」／「{方案}試算後與現況持平」（同一通路的 ≤ 3 個方案取差額絕對值最大者；子句 ≤ 14 字）；方向詞前一定加「試算後」：試算結果是條件差額（`src/domain/scenarios.ts:35`），不是已發生或會發生的獲利（AGENTS.md：不得把靜態試算稱為營收預測；v3 的寫法是「試算後 {contribution}；與現況相比 {delta}」，`src/i18n/labels.zh-TW.ts:1392、1417、1434、1462`），依 B8 限制句不能放主層，標題就是讀者唯一會看到的句子；`empty`、`subtitle`。會議實例 `meeting.chartsV4.scenarios.title`：「{n} 個通路的選入方案」，不跨通路挑最大值（各通路的現況基準不同） |
| testid | `chart-scenarios-variance`、`chart-scenarios-variance-bar-{planId}`、`chart-scenarios-variance-table`；`chart-meeting-scenarios`、`chart-meeting-scenarios-bar-{planId}`、`chart-meeting-scenarios-table`（planId 是方案 id，跨通路唯一） |
| 資料表 | 方案（會議加通路）、試算後的扣廣告後貢獻（元）、與現況相比（元），L2 純文字；兩個欄名沿用 `scenarios` 分組既有的 `resultTitle`、`vsBaseline`（`src/i18n/labels.zh-TW.ts:934-935`），不另立「比現況」；會議實例超過 6 根時資料表照列全部；方案比較表 `scenario-comparison` 照常常駐 |
| 鍵盤 | 資料表 summary 1 個停留點；「載入示範資料到第一個結果」的鍵盤步數不得增加（D-V3-27 現況，keyboard-walk 試算頁里程碑） |
| 抽屜 | 條不可點（PRD §8.7 例外：試算結果是假設、不是 CSV 彙總，v3 的 `scenario-contribution`、`scenario-delta` 與比較表都是純文字）；現況基準沿用既有基準抽屜（`decision-workbench.tsx:238`，`baseline-*` number-link） |
| 390 | 每列一根 |
| 投影 | 會議議程 5 在投影中維持隱藏（只顯示議程 1–2） |
| 匯出 | 不印、不放；Excel 不另加：`ExcelExportInput`（`src/application/excel-export.ts:40-56`）沒有試算資料，`ManagerSummary` 也沒有 scenarios 欄位，兩個呼叫端（`dashboard.tsx:425`、`meeting-page.tsx:254`）都沒有傳 `ScenarioWorkspace`；試算結果已在決策 JSON 與 Markdown；決策 Markdown 不變 |
| 單元測試 | `tests/charts-scenarios-v4.test.tsx`：條數＝有效結果數、未計算方案沒有條、沒有任何跨方案合計、`chart-scenarios-variance` 全頁 1 個（M6）；`tests/meeting-page.test.tsx` 擴（會議實例在 `meeting-agenda-5` 內、stale 不畫、7 個通路各選一個方案時只畫 6 根且資料表 7 列、標題不含任何方案名）；標題 key 都含「試算後」（字串斷言） |
| E2E 草案 | 試算頁用 golden 試算後 `chart-scenarios-variance-bar-*` 數＝有效方案數，條端文字等於 `formatSignedDelta(result.delta, "L1")`；keyboard-walk 試算頁「第一個結果數字」里程碑 Tab 數不晚於 V4-0；會議頁 `chart-meeting-scenarios` 在 `meeting-agenda-5` 內 |
| V4-6 會議實例的實作決定（代理 B） | （1）只在會議有選入方案（`context.scenarios` 非空）時渲染；沒有選入方案時議程 5 維持 v3 的區段型空狀態 `meeting-scenario-results-empty`（DOM 不變），不再多一個同義的圖表空狀態；選入的方案都過期時 `state="empty"`（說明 `meeting.chartsV4.scenarios.empty`），資料表照列。〔V4-6 整合（審查 R1-V46-S1：06「會議頁主層獨立圖區塊＝2」、§9.4、C16 四態同高）改為：一律渲染——沒有選入方案時是等高空狀態，圖區說明 `emptyNone`「選入方案後，這裡畫出各通路試算後與現況的差額」、資料表 0 列＋`tableEmpty`；v3 的區段型空狀態 DOM 不變、仍在每通路列之後，兩句互補（v3 說狀態與去哪裡選，G15 說選了之後畫什麼）；選入第一個方案時圖在原位填上，每通路的 select 不被往下推。審查 R1-V46-S3：空狀態（沒有選入或全部較早）的副標改用 `subtitleEmpty`「每個通路的選入方案畫一根 · 本期 {period}」，不重複標題、不再接 `staleNote`，較早的方案只由圖區說明講一次〕（2）列序＝會議範圍的通路順序（同議程 5 的每通路列）；柱＝前 6 個可畫的方案（不是過期、有差額），其餘只列在資料表；標題的 {n}＝可畫的方案數（過期的不算，副標另加「過期的 {n} 個方案只列在資料表」）〔{n} 的算法與過期用語待 D-V4-50 拍板，回覆前維持目前實作〕。（3）零線＝每個通路自己的現況，軸文字「各通路現況」（`meeting.chartsV4.scenarios.axis`，不寫金額）；副標寫「每個通路從自己的現況扣廣告後貢獻算起」。（4）超過 6 根時「另 {n} 個」與軸文字共用最後一列（C25 新增選用的 `axisWithMore`，6＋1 列＝168 ≤ sm 180；沒給時 C25 輸出與 V4-5 逐字相同，試算頁 G15 以 `tests/fixtures/scenarios-variance-v4-5.json` 比對）。（5）過期方案的列名後接既有的「過期」（`meeting.managerSummary.scenarioStale`）〔V4-6 整合（審查 B-V46-R1）改為：同一頁同一個狀態只用一個名稱，使用者另行拍板前沿用同頁議程 5 每通路列的 v3 用語「較早的方案（不列入這次決議）」（`meeting.review.staleScenarios`，列名以「 · 」相接）；`staleNote`、`empty`、`tableNote` 同改為「較早的方案」，G15 會議實例不寫「過期」〕；柱的 testid 尾段是方案 id（`review.selected_scenarios[i].plan_id`）；元件在 `src/components/meeting/scenarios-chart.tsx`（只給會議頁的 chunk，不在首載）。 |

### G16 要賣到多少才划算（門檻點與連線）（新增；P1；V4-5）

| 項目 | 內容 |
|---|---|
| 位置與批次 | 每個方案欄 `scenario-{n}` 內、`details.scenario-sensitivity`（`src/components/scenario-sensitivity.tsx:38`）裡門檻說明（`threshold-{id}`，`:44-50`）之後、技術細節之前；V4-5 |
| 資料 | `thresholdPoints(analysis, sensitivity)`（新增 `src/application/chart-threshold.ts`）：讀 `analyzeScenarioSensitivity()`（`src/domain/scenario-sensitivity.ts:37`）的 `status`（含 `stale`）、`targets[]`（`id`：`zero_contribution`、`maintain_baseline`；`target`；`status`；`threshold_pct`）、`sensitivity.rows[]`（`volume_change_pct`、`result.contribution`）、`coefficients.volume_coefficient`（L，只用來判斷 L＝0）；輸出 `{ points: {id, kind: "threshold"｜"user", v, y}[], outOfRange: id[], flat: boolean, stale: boolean }`；門檻點的 y 就是目標值本身 |
| 等級與版本 | 依 D-V4-20。A′（建議）：A，只組既有點。A：連線上的位置是模型值，等級寫「A（模型值，來源 `scenario-sensitivity-v1`）」，圖下標示 `SENSITIVITY_VERSION`（`scenario-sensitivity-v1`，`src/domain/scenario-sensitivity.ts:4`），並加三項必要測試：每個線段端點都等於既有點、所有 x 只落在 [min v, max v]、圖下顯示模型版本。B：改為 `thresholdLine`／`threshold-line-v1`，另加手算 golden |
| 技術 | C29 inline SVG：x 固定 [−90%, +100%]（`docs/SCENARIOS.md:12`），每 25 個百分點一刻度；y 扣廣告後貢獻含 0、`formatAxisWan`；依 D-V4-20：建議 A′ 只畫範圍內的既有點、不連線；選 A 時才連線（`chartColors.total` 1.5px，依 v 排序，不延伸到點之外，圖下標示連線是 `scenario-sensitivity-v1` 模型在兩點之間的值）；不外插、端點不標值；門檻點空心 `chartColors.target`、使用者點實心 `chartColors.total`（試算是假設、不是本期資料，不用強調色 `chartColors.current`，也避免綠點被讀成有利）；零線 `chartColors.axis`；`thresholdGeometry` 純函式 |
| 邊界 | 只有 1 個點時只畫點；門檻 `outside_range` 不畫該點，圖下標「超出範圍」與範圍內是否達標（沿用 `thresholdDescription`，`scenario-sensitivity.tsx:15-22`）；L＝0（`constant_*`）不畫門檻點，副標用既有恆等、恆高、恆低說明句；`status="stale"` 時整張 `state="empty"`，`message` 沿用既有過期說明；三個假設未填時不畫使用者點、不代填（`docs/SCENARIOS.md:68`） |
| ChartFrame | `id="scenarios-threshold-{planId}"`、`testId="chart-scenarios-threshold"`（在 `scenario-{n}` 容器內各一次，沿用 `INSTANCE_CONTAINER` 規則）、`variant="inline"`、`headingLevel={4}`、`height="sm"`、`dataTable`（C33） |
| 標題與 labels | 標題沿用零貢獻門檻的既有說明句（`thresholdDescription`，搬到可共用處，字不改）；新 key `scenarios.chartsV4.threshold.{subtitle, outOfRange, axis, pointKinds.*, columns.*}`；「超出範圍」可沿用 `shell.chartsV4.common.outOfRange` |
| testid | `chart-scenarios-threshold`、`chart-scenarios-threshold-point-{target}`（`zero_contribution`、`maintain_baseline`）、`chart-scenarios-threshold-point-{sensitivityId}`（`a`、`b`、`c`）、`chart-scenarios-threshold-table` |
| 資料表 | 點（門檻：零貢獻、維持原貢獻；假設 A／B／C）、銷量變動（%）、扣廣告後貢獻（元）、種類；純文字 |
| 鍵盤 | `scenario-sensitivity` summary 展開後多 1 個資料表 summary；試算頁到第一個結果的步數不增加（G16 在收合的 `<details>` 內） |
| 抽屜 | 點不可點（PRD §8.7 例外）；門檻說明與敏感度表在圖旁 |
| 390 | 高 180 不變；門檻標籤縮短為百分比 |
| 投影 | 不適用 |
| 匯出 | 不印、不放；Excel 不另加（同 G15；門檻與三點已在決策 JSON 的 sensitivity 段，`src/application/decision-export.ts:37`） |
| 單元測試 | `tests/chart-threshold.test.ts`：所有點 x ∈ [−90, 100]（X29）；A′ 時 `thresholdGeometry` 不輸出線段；選 A 時：每個線段端點都等於某個既有點、線段 x 只落在 [min v, max v]、輸出帶模型版本 `scenario-sensitivity-v1`；`outside_range` 不出現在 points；L＝0 時 points 只含使用者點；stale 時 `stale=true`；三點未填時沒有使用者點；敏感度輸入預設空白不變（既有 `scenario-sensitivity.test`） |
| E2E 草案 | 試算後展開 `scenario-sensitivity`，`chart-scenarios-threshold-point-zero_contribution` 存在且 `fill` 為 none、`stroke` 為 `chartColors.target`；輸入三個假設並計算後多 3 個使用者點，`fill` 為 `chartColors.total`；A′ 時圖內沒有連線 `path`；用零貢獻門檻落在 [−90%, +100%] 以外的方案（4 通路合成資料內備一例）時，`chart-scenarios-threshold-point-zero_contribution` 不存在，圖下出現 `shell.chartsV4.common.outOfRange` 的字 |

## 6 實作卡：待辦與會議紀錄（G17–G19）

### G17 待辦期限分布計數條（新增；P2；V4-10）

| 項目 | 內容 |
|---|---|
| 位置與批次 | 待辦頁頁首計數徽章（`actions-count`，`src/components/actions-workbench.tsx:119`）之下、工具列（`:179`）之前；沒有待辦時（`actions-empty`）不渲染；V4-10 |
| 資料 | `actionDueBuckets(workspace, taipeiToday())`（新增 `src/application/chart-actions.ts`）：讀 `boardColumns(workspace)`（`src/application/action-workspace.ts:246-250`）、`card.deadline`、`execution_status`、`taipeiToday()`（`:114`）；四桶：逾期（有期限、早於台北今天、未完成，與卡片 `board-card-due[data-overdue]` 的判定相同，`actions-workbench.tsx:138`）、7 天內（今天到今天＋6 天，含今天，共 7 天）、之後、未填期限；已完成不計 |
| 等級與版本 | B／`ACTION_DUE_BUCKETS_VERSION = "action-due-buckets-v1"`；golden：四桶加總＝未完成待辦數 |
| 技術 | 4 列小表 `table.chart-actions-due`，每列 `th`（桶名）＋`td`（件數 L2＋C24 count 條）；共用尺度＝四桶最大值；逾期條 `chartColors.unfavorable`，其餘 `chartColors.total`（非本期資料不用強調色） |
| ChartFrame | 不用（小表本身就是資料表） |
| 標題與 labels | `actions.chartsV4.due.{caption, buckets.{overdue, week, later, none}}`；caption＝「{n} 件逾期，{m} 件 7 天內到期」 |
| testid | `chart-actions-due`（table）、`chart-actions-due-bar-{bucket}`（bucket＝overdue、week、later、none） |
| 資料表 | 小表本身 |
| 鍵盤 | 0 個新停留點（表內沒有可聚焦元素）；看板鍵盤流程不變 |
| 抽屜 | 列不可點（看板沒有期限篩選，v4 不新增；PRD §4.5） |
| 390 | 維持 |
| 投影 | 不適用 |
| 匯出 | 不印、不放；Excel 不另加（待辦工作表已有期限） |
| 單元測試 | `tests/chart-actions.test.ts`：四桶加總、台北日期邊界（UTC 16:00 前後）、期限＝今天算「7 天內」、期限＝今天＋7 天算「之後」、已完成不計、空字串期限算未填 |
| E2E 草案 | 有待辦時 `chart-actions-due` 可見；逾期列的件數＝看板中 `.board-card-due[data-overdue]` 的數量；四列件數加總＝未完成卡片數；`action-workspace.spec` 既有流程全過 |

### G18（取消）

審查後取消（PRD §2.3「刻意不加圖」）：與上次比較表 `meeting-compare-kpis`（`src/components/meeting-page.tsx:455-458`）只有淨營收與扣廣告後貢獻兩列（`src/application/meeting.ts:29` 的 `MeetingKpiMetric`），兩個不同指標用同一把尺比條長沒有意義（示範資料兩個差額是 +170.9 萬與 −59.9 萬，扣廣告後貢獻那條會被壓短，看起來比較不重要），只有兩列也沒有讀取效率；理由與其他常用指標的 7 個比率不畫長條相同。表格維持 v3 原樣；代號 G18 不重用，`chart-meeting-compare-bar-*` 與 `meeting.chartsV4.compare.*` 都不建。

### G19 會議歷史小倍數（新增；P1；V4-6）

> **V4-6 實作補記（代理 A）**：C26 沿用 V4-3b 的 inline SVG（不是 Recharts LineChart）：切到會議紀錄的 390 TBT 門檻 1,071.2 只剩約 60 ms 餘裕，inline SVG 在 SSR 就輸出圖形，單元測試可直接驗斷線、點與間隙標；小倍數同 G12 以 `useDeferredMount` 延後一拍（之前是同高的 loading 骨架）。C26 向下相容地擴充四項：系列 `dots`（每點 2px 小實心點 `circle.multiple-point[data-index][data-key＝會議 id]`，最後一點仍是 3px 的 `circle.multiple-last`，同樣帶 data-index、data-key）、`gaps`（間隙標 `text.multiple-gap`，置中於間隙位置、繪圖區垂直中間（審查修正：與線尾標值重疊時改放繪圖區上緣、再改下緣，都重疊才不畫——最近一次會議自成一段時線尾標值會往左伸進前一個間隙），放不進相鄰兩點之間〔2 個位置寬 − 12〕時不畫，原因仍在資料表；會議頁主欄最寬 880，1440 每張約 409px、390 單欄約 326px，示範歷史 7 個位置時兩種字都畫得下；X 標在 409px、7 個位置時只畫頭尾）、`fitXLabels`（X 標依最寬的標取捨：相鄰都放得下才全畫，否則只畫頭尾，頭尾也放不下時只畫最後一個；標收在 svg 內）、全形字估寬 12px（Y 標的「萬」「元」），另加金額軸 `amountAxis`（含 0、1／2／5 × 10ⁿ、最大刻度 ≥ 1 萬時步長至少 1 萬，刻度文字一定是整數萬）；沒有給新選項時輸出與 V4-5 逐字相同（`tests/fixtures/small-multiples-v4-5.json`，由 `tests/helpers/small-multiples-baseline.tsx` 在開工錨點 6142950 產生，`tests/charts-meeting-g19.test.tsx` 逐字比對 G12 五份資料與直接渲染的子圖）。不同段之間插入一個空位置（null 斷線），X 標是資料本期（`formatPeriodL1`，`days: false`，期間跨年才寫年份）。「本期完全相同」的重複會議＝本期起訖、資料集與通路集合都相同（D-V4-48（b）＝B，使用者 2026-10-12；範圍不同的同本期會議各自保留），保留結束時間最晚的一筆（同時間取排序在後者，同 `lastMeeting`）；斷段原因分三種：資料集不同「不同資料集」、同一份資料只換通路「通路不同」（D-V4-49（b）＝C）、比較方式不同或（非整月對比時）本期天數不同「期間不同」；整月對比以「一個月」為單位，月份天數不同不斷開（D-V4-48（a）＝B）；會議順序維持會議日期、再結束時間（D-V4-49（a）＝A）。沒有任何已結束的會議時不渲染 G19（只留 v3 的空狀態區塊 `meeting-history-empty`，不疊兩個空狀態）〔V4-6 整合（審查 A-4）改為：06「歷史 < 2 筆等高空狀態」含 0 筆——v3 的空狀態區塊 DOM 不變、在前，G19 的等高空狀態接在它之後、是區塊最後一個子元素；兩句互補：v3 區塊說清單（還沒有結束的會議、結束後出現在這裡），G19 說走勢（結束兩次以上、本期不同的會議後畫出走勢）〕；1 次、或保留下來的不到 2 次（本期都相同）時是等高空狀態（≤ 767px 也是 sm × 2）。labels：`title`（結論句）、`section`（區塊名：最新一段只有 1 次或空狀態時的標題、資料表 summary 與 caption）、`subtitle`／`subtitleBreaks`／`subtitleEmpty`、`empty`、`differentDataset`、`differentPeriod`、`omittedNote`、`breakNote`、`columns.*`、`comparable.*`（「與前一次可比」：第一次／是／否，{原因}）。有圖的 G19 不另加頁面狀態：歷史清單 ≥ 2 筆時 v3 的 `meeting-history-item`、`meeting-snapshot-note` 每筆一份，M6「每個 testid 每個狀態只出現一次」會判為重複（`INSTANCE_CONTAINER` 自 V4-0a 起不改），改由 `tests/charts-meeting-g19.test.tsx` 以 `MeetingHistory` 的 SSR 驗（含 chart-lint SSR 規則）〔V4-6 整合補做：`tests/helpers/page-states.tsx` 加 `meeting-history-g19`（6 筆歷史、G19 有圖＋G15 1 根）與 `meeting-seven-channels`（7 個通路各選一個方案：6 根、資料表 7 列），M6 以 `tests/mounted-testids.test.tsx` 的 `V4_6_REPEATED_V3_ROWS` 逐字列出這兩個狀態預期的 v3 列表樣板重複（testid×列數），其他重複照樣失敗，chart- testid 唯一性照常檢查；`INSTANCE_CONTAINER` 不改〕；測試資料用 `tests/helpers/meeting-history.ts` 的 `g19History`（golden → 示範 42 天 → 示範三個連續週＋第三週重開一次：5 點 3 段）。〔V4-6 整合（審查 R1-V46-S4）：最新一段第一次或最後一次的扣廣告後貢獻是未知（凍結值 null）時，標題也用區塊名，不寫「從 資料待補 到 …」；（審查 R1-V46-S2、R2-V46-A11Y-1、R3-V46-G2）空狀態的資料表 0 列，表後只放 `tableEmpty`「結束兩次以上、本期不同的會議後，這裡每次會議一列。」，不放 `omittedNote`、`breakNote`（0 列時「只列最近結束的一次」不成立）；資料表仍常駐（每張圖都有 C33 資料表，同 G12 沒有週時的 0 列表）；（審查 R2-V46-A11Y-3）`tests/e2e/charts-meeting.spec.ts` 在 G19 有圖（3 次會議、間隙「期間不同」、資料表展開）時另跑 axe，四尺寸 serious／critical 為 0〕

| 項目 | 內容 |
|---|---|
| 位置與批次 | 會議頁 `section.panel.meeting-history`（`src/components/meeting-page.tsx:508`）內、`historyNote` 之後、`meeting-history-list` 之前；V4-6 |
| 資料 | `meetingSeries(history)`（新增 `src/application/chart-meeting.ts`）：輸入 `Meeting[]`（`src/application/meeting.ts:39-61`），依 `date`、`finalized_at` 排序；每點 `{ id, date, name, net_revenue, contribution_after_marketing, segment }`，值取 `agenda.kpis[].current`；`segment` 在 `source_fixed.dataset_hash`、通路集合、本期天數（`source_fixed.periods.current`）或比較方式（`source_fixed.periods.comparison_mode`，`meeting.ts:44-46`）與前一次不同時加一（`compareWithLastMeeting` 在期間不同時回傳 `different_periods` 並照樣比較，`:382-397`，所以不能只沿用它的可比規則：42 天期與 7 天期的合計不能連成一條走勢）；本期完全相同的重複會議只畫最新一筆（依 `finalized_at`），資料表註明省略的筆數；每點帶資料本期；上限 100 筆（`MAX_MEETING_HISTORY`，`:25`） |
| 等級與版本 | B／`MEETING_SERIES_VERSION = "meeting-series-v1"`；golden：斷段位置＝資料集、通路集合、本期天數或比較方式改變處；同本期重複會議只留最新；< 2 筆回傳空 |
| 技術 | C26 兩張小倍數（淨營收、扣廣告後貢獻），各自 Recharts `LineChart`；Y 整數萬含 0（`formatAxisWan`）；X 會議序，刻度標資料本期（M/D–M/D）；線 `chartColors.total`，最後一點（最近一次已結束的會議；輸入是 finalized 的 `meeting_history`，不是本次會議）3px 實心 `chartColors.total` 並標值，與其他點只差在大小：歷史是凍結值、不是本期資料，強調色只給本期（PRD §7.1、v3 D-4），也避免虧損的點被綠色讀成有利（同 G16 不用強調色的理由）；不同 segment 之間插入 null 斷線，並在間隙標「不同資料集」或「期間不同」；會議紀錄凍結內容只讀 |
| ChartFrame | `id="meeting-history-chart"`、`testId="chart-meeting-history"`、`variant="inline"`（在既有 `.panel` 內）、`headingLevel={3}`、`height="sm"`、`frameClassName="multiples"`（390 單欄 2 張，框高 sm × 2）、`state`（< 2 筆時 `empty`，同高）、`dataTable`（C33） |
| 標題與 labels | `meeting.chartsV4.history.{title, empty, subtitle, differentDataset, differentPeriod, omittedNote, columns.*}`：「近 {n} 次會議，扣廣告後貢獻從 {a} 到 {b}」（取最新一段可比的會議；該段只有 1 次時改用區塊名）；小標取 `metricDefinitions` |
| testid | `chart-meeting-history`、`chart-meeting-history-table`；既有 `meeting-history`、`meeting-history-item`、`meeting-history-kpis` 不變 |
| 資料表 | 會議日期、會議名稱、資料本期（M/D–M/D）、淨營收（元）、扣廣告後貢獻（元）、與前一次可比（是／否；否時寫不同資料集或期間不同）；純文字 |
| 鍵盤 | 資料表 summary 1 個停留點，之後是既有歷史清單 |
| 抽屜 | 不可點（凍結值，PRD §8.7 例外）；展開歷史項目即看該次內容 |
| 390 | 單欄 2 張，框高＝`chartHeights.sm` × 2（C26） |
| 投影 | 隱藏（會議歷史不在議程 1–2） |
| 匯出 | 不印、不放 |
| 單元測試 | `tests/chart-meeting.test.ts`：斷段位置（資料集、通路集合、本期天數、比較方式各一例）、同本期重複會議只留最新、< 2 筆、排序、100 筆上限；`tests/meeting-page.test.tsx` 擴（`chart-meeting-history` 在 `meeting-history` 內、沒有 `.panel` 套 `.panel`） |
| E2E 草案 | 歷史 < 2 筆時 `chart-meeting-history` 顯示空狀態且 `.chart-frame` 高度＝`chartHeights.sm`；結束兩次同資料集、同期間長度的會議後資料表列數＝2；再結束一次期間長度不同的會議後，資料表該列標「期間不同」、圖上與前一點不相連；`present-mode.spec` 會議頁斷言不變 |

## 7 實作卡：資料來源、匯入精靈、抽屜（G20–G23）

資料來源頁（PRD §5.7）：`DataWorkspace`（`src/components/workspace-panels.tsx:57`）持有新的 `issueFilter` 狀態（檔案、通路、原因碼），傳給 G20、G21 的點擊與 `IssueList`（`src/components/issue-list.tsx:113`）新增的選填 `filter`、`onClearFilter`。篩選只過濾畫面列，「下載問題清單 CSV」仍是全部問題；篩選中在表上方顯示 `role="status"` 的篩選片語與「清除」鈕。這是 V4-7a 的明確工作項（PRD §6.4）。

> **V4-7a 整合補記（代理 C，2026-10-12）**：（1）篩選型別只有一個：`src/application/issue-filter.ts` 的 `IssueFilter`（`file` 是標準檔名）；G20 的 `CoverageIssueFilter`＝`Required<IssueFilter>`（三欄都給），G21 的格給 `{ file, reason }`，`DataWorkspace` 直接收兩者、不另轉換。（2）`DataWorkspace` 的 state 是 `{ filter, request, issues }`：每按一次（G20 缺列框、G20 資料表的「篩選問題表」、G21 的格）`request` 加 1，`IssueList` 新增選填 `filterRequest` 傳給表格，鍵或 `request` 變了就把焦點移到篩選片語（再按同一組條件也移，審查 B-2）；`issues` 記套用時的問題清單，換了資料集不沿用。（3）捲動與 app 其他捲動相同：`scrollIntoView({ block: "start" })`、不用平滑捲動（不受 `prefers-reduced-motion` 影響），停在 `main section` 的 `scroll-margin-top` 之下。（4）C30 的 390 版面（60 欄、月份刻度減半）只在框內寬 < 400（390＝324）；768（450）改 64 欄、刻度不減半，≥ 720（1280＝962、1440＝1122）72 欄（審查 A-4，PRD §5.7、H5 設計稿）。（5）G20 在 data-issues 之上，資料表 summary 是多出的 1 個 Tab 停留點：資料來源頁「問題表或範圍列表」里程碑 1440 由 10 變 11、390 由 4 變 5（「不晚於 V4-0a」的判讀待人拍板）。

### G20 涵蓋時間軸（新增；P1；V4-7a）

| 項目 | 內容 |
|---|---|
| 位置與批次 | 資料來源頁，狀態列 `data-status-line`（`workspace-panels.tsx:85`）之下、`data-issues`（`:87`）之上；V4-7a |
| 資料 | `coverageTimeline(dataset, events, yoy?)`（新增 `src/application/chart-coverage.ts`）：`manifest.coverage_start/end`、`previous_period`、`current_period`、`data_as_of`；`dataset.issues` 中 `MISSING_CHANNEL_COST_DAY`、`MISSING_AD_DAY`（`src/domain/validation.ts:136-158`，帶 `date`、`channel`、`line: null`）依檔 × 通路合併成連續日期區段；銷售有列的日期集合（`dataset.sales[].date`）；檔期 `EventSet.rows`（`src/application/events.ts:8-15`）；範圍級問題（`field: "$coverage"`、沒有 `date`，`validation.ts:145-147`）時回傳 `fallback: true` |
| 等級與版本 | B／`COVERAGE_TIMELINE_VERSION = "coverage-timeline-v1"`；golden：每個缺列區段的天數加總＝該檔 × 通路的缺列問題筆數 |
| 技術 | C30 Timeline inline SVG：軌 ≤ 4（銷售、通路費用、廣告、檔期），每軌 24px；X 日期（涵蓋範圍），月份刻度；有列 `chartColors.total`；缺列虛線框 `chartColors.missing`；本期與上期區帶 `chartColors.band`，區帶內直接標「上期」「本期」；去年同期（`snapshot.yoy` ready 時）畫成時間軸上方 1px `chartColors.yoy` 細線並直接標「去年同期」，不用虛線框（`--chart-yoy` 與 `--chart-missing` 都是 gray-400，同形同色會分不出缺列與去年同期）；檔期 `chartColors.axis` 細線；銷售「無列」只標「無列」，不等於零銷售；`timelineGeometry` 純函式；`fallback` 時不畫區段，改寫文字 |
| ChartFrame | `id="data-coverage"`、`page="data"`（testId `chart-data-coverage`）、`height="sm"`、`legend`（有列 line、缺列 dash；期間與去年同期改為直接標字）、`dataTable`（C33）、`state`（沒有資料集時 `empty`） |
| 標題與 labels | `data.chartsV4.coverage.title.{missing, missingOneDay, none}`：「{檔案}缺 {start} 到 {end} 共 {n} 天（{通路}）」（取最長的缺列區段）；最長區段只有 1 天時「{檔案}缺 {date} 1 天（{通路}）」（`missing_ad_day` 就是這種，避免「8/2 到 8/2 共 1 天」）；沒有缺列「三份檔案涵蓋 {start} 到 {end}，沒有缺列」；另 `tracks.{sales, costs, ads, events}`（區帶與細線的「上期」「本期」「去年同期」沿用既有字串，例如 `labels.shell.periods.previous`、`current`，不另立）、`noRows`、`gapDays`、`rangeFallback`、`filterButton`、`columns.*` |
| testid | `chart-data-coverage`、`chart-data-coverage-seg-{file}-{channel}-{start}`（file＝sales、costs、ads；start＝ISO）、`chart-data-coverage-table` |
| 資料表 | 檔案、通路、缺列起日、缺列訖日、天數、篩選按鈕（每列一個 `button`，名稱「篩選問題表」帶檔案與通路） |
| 鍵盤 | 資料表 summary、每列篩選按鈕；按下後焦點移到問題表上方的篩選片語（`role="status"`） |
| 抽屜 | 不開抽屜（問題不是金額）；點缺列段或篩選按鈕：`issueFilter = { file, channel, reason }`，捲到 `data-issues` |
| 390 | 軌維持上下排列、月份刻度減半；高度不變 |
| 投影 | 不適用 |
| 匯出 | 不印、不放；Excel 不另加（問題 CSV 既有） |
| 單元測試 | `tests/chart-coverage.test.ts`：缺列天數＝問題筆數（`missing_ad_day`：廣告 × MARKETPLACE 一段 1 天；合成資料：費用與廣告各有多日區段）、golden 與示範資料沒有缺列區段、連續日期合併、跨月、範圍級退回、無銷售列標「無列」；`tests/chart-geometry-v4.test.ts`（`timelineGeometry`）；`tests/issue-list-v3.test.tsx` 擴（篩選後列數、下載內容不變） |
| E2E 草案 | 匯入 `fixtures/errors/missing_ad_day` 後（缺 2026-08-02 MARKETPLACE 的廣告列；golden 與示範資料都沒有缺列），`chart-data-coverage` 標題符合 `title.missingOneDay` 模板；點 `chart-data-coverage-seg-ads-MARKETPLACE-2026-08-02` 後 `data-issues` 進入可視範圍、問題表每列都是廣告檔的 MARKETPLACE 列、篩選片語可見；按「清除」後列數回到全部；缺費用列的情境用 4 通路合成資料點 `chart-data-coverage-seg-costs-*` 驗同樣流程；示範資料的標題符合 `title.none`；`network-log.spec` 下載集合不變 |

### G21 問題分布表（檔案 × 原因）（新增；P1；V4-7a）

| 項目 | 內容 |
|---|---|
| 位置與批次 | `section.panel.data-section[data-testid="data-issues"]`（`workspace-panels.tsx:87-90`）內，`ui-section-head` 之後、`IssueList` 之前；V4-7a。列級與範圍級問題都是 0 筆時不渲染（示範資料就是這種），`data-issues` 既有的「沒有問題」狀態不變 |
| 資料 | `issueDistribution(dataset.issues)`（新增 `src/application/chart-issues.ts`）：列級問題（有 `line` 或 `date`）依 `file × reason_code` 計數；範圍級問題另成一列；欄只列出現過的原因碼（名稱取既有原因碼標籤，清單見 `src/application/import.ts:280-289` 的 `IMPORT_ISSUE_REASON_CODES`）；每檔標出最多的原因 |
| 等級與版本 | B／`ISSUE_DISTRIBUTION_VERSION = "issue-distribution-v1"`；golden：全部格加總＝列級問題筆數 |
| 技術 | C28 HeatTable matrix：原生 `<table>`，列＝檔案、欄＝原因；有問題的格 `--chart-heat-1`，該檔最多的原因格 `--chart-heat-2` 加 2px `--chart-unfavorable` 框線；0 格留白不上色；格內是計數按鈕（可及名稱帶檔案、原因、列數） |
| ChartFrame | `id="data-issues-dist"`、`testId="chart-data-issues"`、`variant="inline"`（在既有 `.panel` 內）、`mode="table"`、`headingLevel={3}`、`height="sm"`；不給 `dataTable` |
| 標題與 labels | `data.chartsV4.issues.{title.{most, single}, subtitle, rangeRow, caption, cellAria}`：`title.most`「{檔案}的{原因}最多，{n} 列」；只有一格（一個檔、一種原因）時 `title.single`「{檔案}有 {n} 列{原因}」（`missing_ad_day` 只有廣告檔 × MISSING_AD_DAY 一格，不寫「最多」）；新 key 登記 copy-scan |
| testid | `chart-data-issues`、`chart-data-issues-cell-{file}-{reason}` |
| 資料表 | 表本身 |
| 鍵盤 | 每個有問題的格一個按鈕（格數＝出現過的檔案 × 原因，通常個位數；`.table-scroll` 內有按鈕，不另加 `tabindex`）；鍵盤里程碑「問題表或範圍列表」（`tests/e2e/keyboard-walk.spec.ts:29`）不變 |
| 抽屜 | 不開抽屜；點格設定 `issueFilter = { file, reason }` |
| 390 | 改清單式（沿用 C3 的 `data-label`） |
| 投影 | 不適用 |
| 匯出 | 不印、不放 |
| 單元測試 | `tests/chart-issues.test.ts`：格加總、範圍級另列、0 格、0 筆問題回傳空（不渲染）、最多原因同值依原因碼排序；`tests/data-workspace-v3.test.tsx` 擴（沒有 `.panel` 套 `.panel`、`chart-data-issues` 在 `data-issues` 內） |
| E2E 草案 | 示範資料時 `chart-data-issues` 不存在；匯入 `fixtures/errors/missing_ad_day` 後，點 `chart-data-issues-cell-ads-MISSING_AD_DAY`，問題表每列的原因碼欄（打開「顯示原因碼」後）都等於該原因；axe 無 `aria-hidden-focus` |

### G22 對帳表與前處理表內嵌條（新增；P1；V4-7b）

| 項目 | 內容 |
|---|---|
| 位置與批次 | 匯入精靈步驟 4 對帳表（`src/components/import-wizard/step-review.tsx:77`，列 testid `reconciliation-{field}`）；資料來源頁前處理表（`workspace-panels.tsx:111-118`，`data-preprocessing`）；V4-7b |
| 資料 | 對帳：`buildImportReconciliation`（`src/application/import-guidance.ts:94`）產生的 `ImportReconciliation.fields[].source_total/standard_total/difference`（`src/application/import-guidance.ts:85-92`）；前處理：`TaxConversion.totals[field].raw/converted`（`src/application/tax-basis.ts:21`） |
| 等級與版本 | A |
| 技術 | 對帳：差額格內 C24 variance（共用零線，尺度＝\|difference\| 最大值），差額＝0 不畫條並加「相符」；前處理：換算值格內 C24 pair（上 4px 含稅原值 `chartColors.previous`、下 6px 換算值 `chartColors.total`，共用尺度＝原值最大值） |
| ChartFrame | 不用 |
| 標題與 labels | `importWizard.chartsV4.reconciliation.match`（「相符」）；`data.chartsV4.preprocess.*` 預計 0 個 |
| testid | `chart-import-reconciliation-bar-{field}`、`chart-data-preprocess-bar-{field}`；既有 `reconciliation-{field}`、`data-preprocessing` 不變 |
| 資料表 | 表本身 |
| 鍵盤 | 不變；精靈的匯入路徑點擊數不變 |
| 抽屜 | 不可點（精靈步驟 4 的資料尚未提交；前處理表是純文字；PRD §8.7 例外） |
| 390 | 條寬 64 |
| 投影 | 不適用 |
| 匯出 | 不印、不放 |
| 單元測試 | `tests/bar-cell.test.ts`（pair 模式）；`tests/import-wizard-v3.test.tsx` 擴（差額 0 顯示「相符」、條數＝差額 ≠ 0 的列數） |
| E2E 草案 | 含稅匯入 E2E（`import-wizard.spec`）到步驟 4，`chart-import-reconciliation-bar-*` 數＝差額 ≠ 0 的列數；步驟 4 定位器與點擊數不變 |

### G23 抽屜階梯表內嵌佔比條（新增；P1；V4-7b）

| 項目 | 內容 |
|---|---|
| 位置與批次 | 計算與來源抽屜的階梯表 `table.ladder-table`（`src/components/evidence-drawer.tsx:232`）；V4-7b |
| 資料 | 階梯四層金額；`ladderMetrics` 由 `evidence-drawer.tsx:79-96` 搬到新增的 `src/application/evidence-ladder.ts` 並匯出（V4-3a 已修正單一通路的週與日證據查找，本批只搬移，邏輯不再改） |
| 等級與版本 | A／`contribution-v1` |
| 技術 | `ladder-amount` 格內 C24 share：條長＝值 ÷ 淨營收（只用於長度）；只畫淨營收那一列與其下各列（原價收入、折扣、退款的比較基準是原價收入，不畫）；負值往左，色依列的角色：扣項（階梯 op「−」：商品成本、四項通路費用、廣告費）為負是成本沖回或費用抵扣（`docs/DATA_CONTRACT.md:26、35`），對貢獻有利，用 `chartColors.favorable`；小計與結果列（淨營收、商品毛利、扣廣告前貢獻、扣廣告後貢獻）為負才用 `chartColors.unfavorable`；淨營收 ≤ 0 或 null 時整張表不畫條 |
| ChartFrame | 不用（抽屜內不加獨立圖） |
| 標題與 labels | 沿用抽屜標題；新 key 0 個 |
| testid | `chart-evidence-ladder-bar-{metric}` |
| 資料表 | 表本身 |
| 鍵盤 | 不變；抽屜焦點圈與 Esc 回焦不變 |
| 抽屜 | 不另設點擊 |
| 390 | 條寬 64；抽屜寬高規則不變 |
| 投影 | 不適用 |
| 匯出 | 不適用 |
| 單元測試 | `tests/evidence-ladder.test.ts`：搬移前後輸出相同（golden 與 demo 的每一種證據）；`tests/evidence-drawer-v3.test.tsx` 擴（條數＝淨營收以下的列數、淨營收 ≤ 0 不畫、合成資料中扣項為負的通路該列條為有利色、扣廣告後貢獻為負的通路該列條為不利色） |
| E2E 草案 | 從總覽 KPI 開扣廣告後貢獻的抽屜，`chart-evidence-ladder-bar-net_revenue` 寬度最大；`chart-evidence-ladder-bar-gross_sales` 不存在；抽屜開啟狀態的 axe 0 serious |

## 8 實作卡：P2 散佈圖（G24）

### G24 折扣率 × 毛利率散佈（新增；P2；V4-10）

| 項目 | 內容 |
|---|---|
| 位置與批次 | 商品頁完整表（`section.product-full`，`product-comparison-panel.tsx:258`）之後的新 `<details class="chart-more">`；V4-10（依 D-V4-21） |
| 資料 | 同 G13 的 `comparison.rows` 本期 `discount_rate`、`gross_margin`；任一為 null 的列不畫並計數寫進副標 |
| 等級與版本 | A |
| 技術 | Recharts `ScatterChart`，只能放在 `src/components/charts/products-scatter-lazy.tsx` 並以 `next/dynamic` 載入（CL-6）；X 折扣率 0 到最大、Y 毛利率含 0，刻度 5 個百分點，只有一個數值 YAxis（CL-8）；點 `chartColors.total`，毛利率 < 0 的點 `chartColors.unfavorable`；不標 SKU；點 > 200 時不畫圖、只留資料表 |
| ChartFrame | `id="products-scatter"`、`page="products"`（testId `chart-products-scatter`）、`height="lg"`、`dataTable`（C33）、`state`（點 > 200 時 `empty`，`message` 指向資料表） |
| 標題與 labels | `products.chartsV4.scatter.{summary, title, subtitle, nullNote, limitNote, tooMany, columns.*}`：「{n} 個商品毛利率為負」；限制句「只呈現分布，不代表因果」放在資料表 `<details>` 內（B8） |
| testid | `chart-products-scatter`、`chart-products-scatter-table` |
| 資料表 | SKU · 通路、折扣率、毛利率（L2 number-link） |
| 鍵盤 | `<details>` summary、資料表 summary、表內 number-link |
| 抽屜 | 點與資料表格：`productEvidence(row, "current", "gross_margin")`（或 `discount_rate`）＋`filter: { channel, sku }` |
| 390 | 圖 `display:none`，只留資料表 |
| 投影 | 不適用 |
| 匯出 | 不印、不放 |
| 單元測試 | `tests/charts-products-v4.test.tsx`：SSR 時只有骨架與資料表、資料表列數＝有值的列數、> 200 點時 `state="empty"` |
| E2E 草案 | 首頁 HTML 的 `/_next/static` 腳本清單不含散佈圖的 chunk（以 build 產出的 chunk 檔名判定，不用字串 grep 符號；v3.0.0 首載 chunk 已含 `ScatterChart` 型別字串 2 處）；展開後 `chart-products-scatter` 的 `.chart-frame` 有 `aria-hidden`；390 圖不可見、資料表可見 |

## 9 彙總

### 9.1 元件與圖的對照（元件與第一個使用它的頁面同批交付）

新元件檔案放 `src/components/charts/`（檔名見 PRD §6.3），C16–C18 留在 `src/components/overview/charts/`；chart-scan 的 AST 掃描範圍就是這兩個目錄（PRD §7.9）。

| 元件 | 第一次交付 | 用在 | 純函式與測試 |
|---|---|---|---|
| C16 ChartFrame 擴充（`aside`、`unitNote`、`frameClassName`、`legend[].shape`、`page`） | V4-1 | 全部 | `tests/chart-frame-v4.test.tsx` |
| C16 `mode="table"` | V4-3b | G11、G21 | 同上 |
| C16 `variant="inline"`、`headingLevel` | V4-4（`headingLevel`）、V4-5（`variant`） | G13–G16、G19、G21 | 同上 |
| C17 瀑布 `bare`、`domain`、`formatAxisWan` | V4-1 | G1、G2、C31 | `waterfallGeometry` 既有測試＋共同尺度 |
| C18 Bullet | V4-2 | G5 | `tests/bullet.test.tsx` |
| C19 Sparkline | V4-2 | G7 | `sparklineGeometry`；根 svg 帶 `aria-hidden` 與 `data-chart-kind="spark"`（CL-1、CL-11 用這個標記辨識） |
| C24 BarCell | V4-1（variance，與 `chartRowHeights`；只在 D-V4-33 已回覆、要做 G6 時；未回覆時順延到 V4-2 的 G4 差額條）；V4-3a（tick）；V4-7b（pair、share）；V4-10（count） | G4、G6、G9、G17、G22、G23 | `barCellGeometry`（`tests/bar-cell.test.ts`）；根 svg 帶 `aria-hidden` 與 `data-chart-kind="cell"`（CL-1 以它辨識內嵌條，不看 testid 片段） |
| C25 RankedBars | V4-4（variance、pareto）；V4-5 沿用 | G13、G14、G15 | `hbarGeometry` |
| C26 SmallMultiples | V4-3b | G12、G19 | 同指標共用、不同指標各自 domain 的測試；圖容器內沒有 `<details>` 與按鈕；≤ 767px 框高＝`chartHeights.sm` × 子圖數 |
| C27 ShareStack | V4-3a | G10 | `shareStackGeometry` |
| C28 HeatTable | V4-3b（calendar，roving tabindex）；V4-7a（matrix） | G11、G21 | SSR 結構測試 |
| C29 ThresholdLine | V4-5 | G16 | `thresholdGeometry` |
| C30 Timeline | V4-7a | G20 | `timelineGeometry` |
| C31 PrintChart | V4-9a | G1（三版本）、G2（附錄） | `svg[data-print-chart]` 計數 |
| C32 pptChart | V4-0b spike（只驗 XML 與內嵌資料）；V4-9a 接線 | G1 | `pptx-export.test`：chart part 數、系列色屬於 `EXPORT_THEME`、`ppt/media/` 空、負柱不被切、輔助系列名 |
| C33 ChartDataTable | V4-2（第一個使用者是 G7a；V4-1 的 G1、G2 沿用既有表，G6 共用橋接表，都不用它） | 全部新圖的 `<details>` | 列數＝資料長度、number-link 與圖點擊同一個 builder |
| C34 chartDataSheet | V4-9b（P2 圖的段落在 V4-10 補） | Excel 標準與客戶版 | `excel-export.test` 擴 |
| C35 Dumbbell | 只在 D-V4-16 選 B 時於 V4-2 | G4 | 同批改 `trend-yoy.spec.ts:200` |

### 9.2 B 級函式、版本常數與手算 golden（全部在 `src/application`，純函式、可序列化，只用 `Decimal`／`sumAmounts`／`ratioMetric`；依 D-V4-15）

| 函式 | 檔案 | 版本常數 | golden 與對帳點 | 批次 |
|---|---|---|---|---|
| `assistWeeks` | `chart-assist-weeks.ts` | `assist-weeks-v1` | 逐週件數加總＝期間件數；件均＝`netRevenuePerUnit` | V4-2 |
| `channelStructure` | `chart-structure.ts` | `channel-structure-v1`（只涵蓋四項費用合計與超過 100 的幾何） | 七段加總＝淨營收；每通路的剩＝`profitWaterfall(snapshot, channel).perHundred`；合計＝`perHundred`（示範 16.2、golden 10.3）；MARKETPLACE −15.00 超過 100 | V4-3a |
| `channelWeeks` | `chart-channel-weeks.ts` | `channel-weeks-v1` | 每通路逐週加總＝通路期間合計 | V4-3a |
| `dailyHeatmap` | `chart-heatmap.ts` | `daily-heatmap-v1` | 逐日加總＝通路期間合計；階 2＝min(3, 負值天數) | V4-3b |
| `productPareto` | `chart-pareto.ts` | `product-pareto-v1` | 末筆累計＝負值合計；末筆累計佔比 100%（取反後 `ratioMetric`）；`refund_only` −60.00 | V4-4 |
| `meetingSeries` | `chart-meeting.ts` | `meeting-series-v1` | 斷段位置＝資料集、通路集合、本期天數或比較方式改變處；同本期只留最新 | V4-6 |
| `coverageTimeline` | `chart-coverage.ts` | `coverage-timeline-v1` | 缺列天數＝缺列問題筆數 | V4-7a |
| `issueDistribution` | `chart-issues.ts` | `issue-distribution-v1` | 格加總＝列級問題筆數 | V4-7a |
| `cumulativeDaily` | `chart-cumulative.ts` | `cumulative-daily-v1` | 兩期末日累計各＝該期合計（示範 1,269,792.73／1,868,626.68；golden 單日 255.00） | V4-10 |
| `actionDueBuckets` | `chart-actions.ts` | `action-due-buckets-v1` | 四桶加總＝未完成待辦數 | V4-10 |
| `thresholdLine`（只在 D-V4-20 選 B） | `chart-threshold.ts` | `threshold-line-v1` | 另訂手算 golden | V4-5 |

A 級的整理與搬移（不加版本常數）：`thresholdPoints`（V4-5）、`worstChange`（V4-4）、`ladderMetrics` 修正（V4-3a）與搬移（V4-7b）、`isFullWeek` 匯出（V4-2）、`metricComparison` 匯出（V4-2）、`productEvidence`／`productDeltaEvidence` 抽出（V4-4）、`periodDailyMetrics` 由 `dayColumns` 抽出（V4-10）、`formatAxisWan`（V4-1）、`formatHeatCell`（V4-3b）、`EvidenceSelection` 加 `arrangeVersion`（V4-2）、`valueKind`（V4-3a）、`EvidenceFilter` 加 `date`、`sku`（V4-3b）、`IssueList` 篩選（V4-7a）；G10 各通路的剩與段比率直接用 `profitWaterfall`（V4-3a）。

### 9.3 token 宣告批次（PRD §6.5；`chartColors`、`chartHeights`、`tests/chart-theme.test.ts` 的 KEYS、`scripts/contrast-check.mjs` 的 PAIRS 同批更新）

| 批次 | token |
|---|---|
| V4-0a | 只試算 `--red-100` 的值與新 token 配對，不宣告 |
| V4-1 | `chartRowHeights`（`chart-theme.ts` 的列高常數，不是 CSS token；隨 C24 第一次使用：D-V4-33 未回覆時順延到 V4-2；V4-7a 加 `axis`） |
| V4-2 | `--chart-target`、`--chart-h-xs` |
| V4-3a | `--chart-seg-1`、`--chart-seg-2`、`--chart-seg-3` |
| V4-3b | `--red-100`（`:root` 原始色階）、`--chart-heat-1`、`--chart-heat-2`、`--chart-missing` |
| V4-9a | `EXPORT_THEME` 加 `chartCurrent`、`chartPrevious`、`chartTotal`、`chartUnfavorable`、`chartFavorable`、`chartSeg1`–`chartSeg3`（`tests/export-theme.test.ts` 逐一比對 `:root`） |

### 9.4 每頁主層常駐獨立圖（CL-9 上限 3，總覽 4 例外；`<details>` 內與表格內嵌不計）

| 頁面 | V4-0（v3.0.0） | 改版後 | 進入批次 |
|---|---|---|---|
| 經營總覽 | 4（G1、G2、G3、G4） | 4（G8 在進階 `<details>` 內） | V4-1、V4-2、V4-10 |
| 通路健檢 | 0 | 2（G10、G11；G12 在 `<details>` 內） | V4-3a、V4-3b |
| 商品毛利 | 0 | 1 或 2（G13；有商品毛利為負時加 G14，示範資料為 1；G24 在 `<details>` 內） | V4-4、V4-10 |
| 假設試算 | 0 | 1（G15；G16 在方案欄的 `<details>` 內） | V4-5 |
| 待辦 | 0 | 0（G17 是小表） | V4-10 |
| 會議紀錄 | 0 | 2（G15 會議實例、G19） | V4-6 |
| 資料來源 | 0 | 1 或 2（G20；有問題時加 G21，示範資料為 1） | V4-7a |

`revamp-r1-layout` 自動收集的是 `main .chart-frame:visible`（Playwright 的 `:visible` 排除 `hidden` 祖先與未展開 `<details>` 內的框）：`main` 裡一直掛著以 `hidden` 藏起來的試算工作台（`src/components/dashboard.tsx:577`，在 `.view-content` 之外），V4-5 起它內含 G15 的 `.chart-frame`（G15 沒有有效結果時 `state="empty"`，`chart-frame.tsx:65` 在任何狀態都輸出 `.chart-frame`）；G8、G12 在收合的 `<details>` 內，都沒有 bounding box，既有的 `box()`（`tests/e2e/revamp-r1-layout.spec.ts:27`）與 `every(height > 0)`（`:359`）會失敗。選擇器不限 `.view-content`，因為試算頁的 G15、G16 就在 `.view-content` 之外。可見數量：總覽 4（V4-10 起展開進階後 5）；試算頁 1＋展開的 `scenario-sensitivity` 數；G8、G12 的等高比較只在展開狀態下做。

### 9.5 匯出對照（PRD §5.10；三個變體數字逐格相同；`network-log.spec` 下載集合不變；CSV、JSON 不變，依 D-V4-13）

| 格式 | 老闆版 | 標準版 | 客戶版 | 批次 |
|---|---|---|---|---|
| PDF（C31） | 關鍵數字之下 G1（高 ≤ 60mm），維持 1 頁 | 本文 G1；D-V4-11 選 B 時附錄多 1 頁放 G2 與兩張圖的資料表 | 同標準版 | V4-9a |
| PPT（C32） | 依 D-V4-34：建議 A，既有第一張（一句話、KPI、三件事、決議）一個區塊都不動，新增第二張放 G1 原生瀑布；`tests/pptx-export.test.ts:280-289` 的「只有 1 張」斷言同批改為 2 張，並斷言第一張的既有區塊逐項仍在 | 同老闆版：第一張的 KPI、三件事、通路表（≤ 4 列）、決議、置頂待辦不動（`pptx-export.ts:333-369` 已排到 `PAGE_BODY_BOTTOM`＝5.18 英吋），瀑布在第二張 | 同標準版 | V4-9a |
| Excel（C34） | 不加工作表（維持 2 張） | 加「圖表資料」（共 8 張）：G1、G2、G4、G7a、G7b（通路 ≤ 8 時，`excel-export` 自行呼叫 `channelWeeks`）、G10、G11、G12、G13、G14（有負值時）各一段，每段末一列「版本與算法」；技術工作表（basis 工作表）列出本次用到的每個 B 級版本常數（`excel-export.ts:275-288` 的 `technical(...)`）；G15、G16 不放（`ExcelExportInput` 沒有試算資料）；V4-10 補 G8 | 「圖表資料」段落與數字同標準版，但不放「版本與算法」列；技術工作表本來就不輸出（`spec.appendix.technical` 為 false；v3 F14：客戶報告版拿掉技術細節）；版本列由 `spec.appendix.technical` 決定 | V4-9b、V4-10 |
| Markdown | 一頁摘要沒有版本之分（`src/application/export-variants.ts:19` 的變體只管列印／PDF、Excel、PPT；`exportManagerSummaryMarkdown` 沒有變體參數）：選哪一版都加九項差額表 | 同左 | 同左 | V4-9b |
| CSV、JSON | 不變 | 不變 | 不變 | — |
