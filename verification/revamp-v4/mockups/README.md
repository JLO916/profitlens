# V4-0b 設計稿（人工關卡 H5 審查用）

> 對象：2–3 位台灣電商經理人（PRD v4 §9.2、`docs/revamp-v4/06_BATCHES.md` 人工關卡 H5）。
> 目的：在 V4-1 開工前，確認 v4 的圖表選型、位置、記號、用語與 390 降級是對的；圖表字串少，新字串在這一關一併審，不另設文案審稿。
> 依 D-V4-27＝A 設 H5；使用者可比照 v3 的 H2 略過，此時 `docs/STATUS.md` 寫「未執行／待人工」，V4-1 照常開工。
> **本資料夾只有靜態設計稿，不是產品程式，不進 app bundle**；產品的 token 單一來源是 `src/app/globals.css`，圖表規格以 `docs/revamp-v4/01_PRD.md` 與 `CHART_CATALOG.md` 為準。

## 1 檔案

| 檔案 | 內容 | 產出 |
|---|---|---|
| [`index.html`](index.html) | 設計稿目錄：每頁的資料來源、狀態、圖、截圖連結 | 產生器 |
| [`overview.html`](overview.html) | 經營總覽（示範資料＋目標檔）：G1、G2、G3、G4、G5、G6（≤ 767）、G7a | 產生器（代理 C1） |
| [`diagnosis.html`](diagnosis.html) | 通路健檢（示範資料）：G9、G10、G11、G12（`<details>` 畫展開狀態）、G7b | 產生器（代理 C1） |
| `products.html`、`data.html` | 商品毛利（示範與合成資料兩種狀態）、資料來源（合成資料） | 待代理 C2 |
| [`tokens.css`](tokens.css) | 第一段從 `src/app/globals.css` 的 `:root` 原樣複製全部 token；第二段是設計稿用、尚未進 `:root` 的 PRD §6.5 新 token 提案值（各行註明宣告批次） | 產生器（每次重跑都重新複製） |
| [`mockups.css`](mockups.css) | 頁面骨架與圖表樣式（只用 token，不寫死色碼） | 手寫 |
| `mockup-data.json` | 每頁用到的數字（柱的起訖、共同尺度、G6 條長比例、G9 條長、G10 七段、G11 分階、G12 刻度、新字串清單），供審查與實作對照 | 產生器 |
| `gen/` | 產生器（TypeScript，以 vitest 執行） | 手寫 |
| `shoot.mjs` | 截圖與實測（Playwright，`file://` 開檔） | 手寫 |
| `../V4-0b/mockups-shots/*.png`、`measure.json` | 截圖與實測結果 | `shoot.mjs` |

## 2 怎麼看

- 直接用瀏覽器開 HTML（`tokens.css`、`mockups.css` 要在同一個資料夾）；不載入任何外部資源、不需要伺服器。
- 把視窗縮到 390 寬就是手機版（底部分頁列、期間按鈕、KPI 清單、G6 變異條、通路寬表清單式）；768、1280、1440 各有對應的版面。圖依 1440、1280、768、390 四個寬度各畫一份，CSS 只顯示對應的那一份，字級維持 12px。
- 頁面最上方的黃色橫幅不屬於產品：勾「標示 v4 變更」會框出 v4 新增或改變的區塊並寫明代號；勾「標示新字串（H5 待審）」會標出將放進 `{group}.chartsV4.*` 的新字串。頁尾「本頁新字串」有清單（模板代入示範資料後的例句）。
- 少量 inline JS 只用於切換狀態：總覽 G2 的範圍分段按鈕（合計、官網 · DTC、平台 · MARKETPLACE），健檢 G9 的「設計稿狀態」（門檻 0.00 與 300,000.00 示意）。
- 標「設計稿試算」的段落：B 級整理函式（加總、佔比、累計、分階）尚不存在，設計稿以產生器內的一次性計算代替；正式數字由該批的 B 級函式產生。

## 3 重新產生、截圖與實測

```bash
# 1. 產生（寫 overview.html、diagnosis.html、index.html、tokens.css、mockup-data.json）
MOCKUP_WRITE=1 npx vitest run --config verification/revamp-v4/mockups/gen/vitest.mockups.config.mts
# 2. 截圖與實測（寫 verification/revamp-v4/V4-0b/mockups-shots/*.png 與 measure.json）
node verification/revamp-v4/mockups/shoot.mjs
```

- 根目錄 `vitest.config.mts` 的 `include` 只有 `src/**`、`tests/**` 的 `*.test.*`，產生器檔名是 `*.mockup.ts`，所以預設的 `npm test` 不會執行它，也不會改寫產物（`npx vitest list` 列出 2,459 項，沒有一項是產生器）。
- 不給 `MOCKUP_WRITE=1` 時只計算與自我檢查、不寫檔。自我檢查包括：頁面沒有寫死色碼、箭頭字元、全形驚嘆號、「注意：」、外部資源；`aria-hidden` 的圖容器內沒有可聚焦元素；設計稿試算的核對（逐週件數加總＝期間件數 7,420；各通路逐週扣廣告後貢獻加總＝通路期間合計；G10 每列商品成本＋通路費用合計＋廣告費＋扣廣告後貢獻＝淨營收；G1、G2 共同尺度涵蓋所有範圍的柱；G11 每通路逐日加總＝通路期間合計）。
- 截圖不起任何伺服器、不占 3100／3101 埠。整頁截圖時把頂欄與期間列改為不黏頂、手機分頁列放到頁尾，避免整頁圖中段重複出現。
- 產生器與 `shoot.mjs` 都在 `npm run typecheck`、`npm run lint` 的範圍內。

## 4 數字從哪來

全部取自示範資料 `fixtures/demo`（虛構）與目標檔 `verification/revamp-v4-capture/targets.csv`（V4-0a capture 用的同一份，含達成與落後兩種目標），經 `validateDataset` 與 `createSnapshot` 算出快照，再呼叫既有函式：

| 區塊 | 呼叫的既有函式 | 設計稿試算（B 級函式到位前） |
|---|---|---|
| 本期一句話、KPI 帶、三件事 | `snapshotSentence`、`snapshotMeta`、`kpiDelta`、`matchTargets`、`achievement`、`achievementText`、`diagnosisGroups`、`alertStatus` | G5 細條寬度＝實際 ÷ 目標夾在 0 到 1（v3 畫法） |
| G1、G6 | `bridgeWaterfall`、`bridgeRowText`、`bridgeUnitNote` | 共同尺度（G1 與 `profitWaterfallScopes` 全部範圍的 G2 柱）；G6 條長＝\|值\| ÷ 九項 \|值\| 最大值 |
| G2 | `profitWaterfall`（合計與每個通路）、`profitRowLabel` | — |
| G3 | `snapshot.weeks`、`trendTakeaways`；刻度呼叫 `waterfallTickLabels`（PRD 規定 `formatAxisWan` 與它輸出相同） | — |
| G4 | `channelConclusion`、`buildManagerSummary().channels`（`compareMoney` 的差額）、`axisTicks` | 差額條長＝\|差額\| ÷ 各通路 \|差額\| 最大值 |
| G7a、G5 MER 列 | `assistKpis`、`netRevenuePerUnit`、`breakevenMer`、`breakevenNote` | 週件數逐週呼叫 `aggregatePeriod`（V4-2 的 `assistWeeks`／`assist-weeks-v1`）；MER bullet 寬度＝實際 MER ÷ 損益兩平 MER |
| G9 | `diagnosisGroups` 的 `impact_cents` | 條長＝\|影響\| ÷ 差額類規則 \|影響\| 最大值 |
| G10 | `profitWaterfall(snapshot, channel)` 的 `perHundred` 與 `rows[].share` | 通路費用合計（`sumAmounts`）與佔比（`ratioMetric`）、超過 100 的幾何（V4-3a 的 `channelStructure`／`channel-structure-v1`） |
| G11 | `report.current.daily` | 分階與 `formatHeatCell`（V4-3b 的 `dailyHeatmap`／`daily-heatmap-v1`、`presentation.ts`） |
| G12 | `snapshot.weeks` 的五項比率 | 比率軸的範圍（只是座標） |
| G7b | `buildManagerSummary().channels`、`diagnosisGroups` | 每通路逐週呼叫 `aggregatePeriod`（V4-3a 的 `channelWeeks`／`channel-weeks-v1`） |

## 5 設計稿實測（`../V4-0b/mockups-shots/measure.json`）

Chromium（Playwright 1.63.0，headless，macOS），`deviceScaleFactor` 1，字型堆疊同 `--font-sans`（數字為 Arial）。

| 項目 | 1440 | 1280 | 768 | 390 |
|---|---|---|---|---|
| 面板內寬（實測 `.chart-frame` 寬） | 1,122 | 962 | 450 | 324 |
| G11 格寬（含 1px 白框；格內可用寬） | 44（42） | 44（42） | 40（38） | 40（38） |
| G11 每張月曆寬 | 348 | 348 | 320 | 320 |
| G11 grid 欄數（`auto-fill`） | 3 | 2 | 1 | 1 |
| G11 第一列放的月曆（示範資料 2 個通路） | 2 | 2 | 1 | 1 |
| G11 月曆放得進框內寬、框內不水平捲動 | 是 | 是 | 是 | 是 |
| G11 框內垂直捲動（第二張月曆在框外） | 否 | 否 | 是 | 是 |
| G11 第一張月曆是標題所指的通路且完整在框內 | 是 | 是 | 是 | 是 |
| 「−0.45」文字寬（另量「−10.25」） | 29.38（35.84） | 同左 | 同左 | 同左 |
| 頁面橫向捲動 | 無 | 無 | 無 | 無 |
| G12 子圖寬／每列張數／框高 | 212／5／180 | 180／5／180 | 80／5／180 | 324／1／900 |
| G1 瀑布：框寬／svg 寬／框內水平捲動 | 641／640／否 | 547／547／否 | 450／520／是 | 324／520／是 |
| G6 可見條數（掛載 9） | 0 | 0 | 0 | 9（寬 64） |

## 6 設計稿與 PRD 的差異（請審查者與下一批實作者特別看）

1. **G1、G2 共同尺度把 G1 壓扁約 40%，還多一個「−200 萬」刻度。** 共同 `[lo, hi]` 取 G1 與 G2 全部範圍的柱，示範資料 G2 合計淨營收 785.1 萬、MARKETPLACE 終點 −6.1 萬，刻度間距 200 萬時範圍是 −200 萬到 800 萬。1440 寬 G1 最高的柱由各自尺度的 134.9px 降到 80.9px。PRD §7.2 寫「不向外延伸」，但 V4-1 驗收要求「切到 MARKETPLACE 時刻度含負值」，兩者同時成立只能把下界延伸到一個步長（設計稿就是這樣畫）。請 H5 判斷 G1 變扁是否可接受。
2. **768 寬一列只放得下 1 張月曆。** 768 寬時側欄 220px 仍在（v3.0.0 截圖 `V4-0a/snapshots/tablet`），面板內寬 450，不是 PRD §4.4 估的約 670；所以 768 一列 1 張、第二張在框內捲動（副標加 `scrollNote`）。
3. **1440 寬 `auto-fill` 得到 3 欄。** 內寬 1,122 可放 3 張 348px 的月曆；示範資料只有 2 個通路，所以看起來是一列 2 張，3 個以上通路時一列會是 3 張（PRD 寫「1440 與 1280 一列 2 張」）。若要固定最多 2 張，實作時改用 `repeat(auto-fill, minmax(…, 1fr))` 以外的寫法，或加 `max-width`。
4. **`formatHeatCell` 放得下。** 390 與 768 格寬 40（扣 1px 白框可用 38），「−0.45」寬 29.38px，連「−10.25」35.84px 都放得下；390 月曆表寬 320 ≤ 框內寬 324，不需要 `.table-scroll` 內部水平捲動。
5. **G12 在 768 寬每張子圖只有 80px。** PRD 規定 ≥ 768 一列 5 張、框高 180；768 時子圖寬 80，刻度與線尾標值擠在一起。可考慮 768–1023 改為框高 `chartHeights.sm` × 2、一列 3 張（需改 PRD §6.3 C26）。
6. **G5 損益兩平 MER 的 bullet 永遠滿格。** 示範資料實際 MER 11.4 倍、損益兩平 4.0 倍（比值 2.84），細條夾在 0 到 1 所以滿格；旁邊的新字串「實際 11.4 倍，損益兩平 4.0 倍」和既有的一句結論「本期廣告效率（MER）11.4 倍，高於損益兩平（4.0 倍）。」內容重複。請 H5 判斷這條 bullet 與新字串是否需要。
7. **G9 門檻刻度在預設門檻 0.00 時和零線重疊。** 設計稿另畫 300,000.00 的示意狀態（「設計稿狀態」切換）讓審查者看到刻度。
8. **G10 在 sm 框（180px）只用到 96px。** 示範資料 2 個通路＋合計＋軸列＝4 列 × 24；PRD 規定通路 ≤ 5 用 sm，框內下方約 84px 空白。
9. **健檢清單設計稿只畫收合列。** 產品預設展開前 3 列（v3 既有，不變）；G9 條在列的 summary 內，展開內容不加圖。
10. **總覽首屏三處「最大一項」**（D-V4-35＝A，只記錄、不改字）：一句話「最大一項是折扣多花 118.8 萬」、G1 標題「扣最多的一項是商品成本（−157.5 萬）」、G6 最長條是有利的原價收入（+316.2 萬）。
11. **G10 圖例的空心框名稱**用「扣完剩下」（提案 `diagnosis.chartsV4.share.segments.remain`）；超過 100 的部分沒有圖例項，由右端「虧 1.5 元」與不利色承擔。
12. **G11 副標**把分階說明寫進副標（「有底色的是虧的日子，加框的是各通路最差 3 天」），不用彩色方塊圖例（X32）。
13. **設計稿的 `--red-100`** 取 V4-0-baseline §13 試算表的 t＝0.25（`#ebcecb`：`--text-primary` 文字 10.71、框線 4.07、對 `--red-50` ΔE2000 8.6）；正式值在 V4-3b 以 contrast-check 定案。

## 7 審查問題（經營總覽、通路健檢；1–5 分）

| # | 頁面 | 問題 | 1 分 | 3 分 | 5 分 |
|---|---|---|---|---|---|
| V1 | 總覽 | 看 `overview-1440-full.png` 的拆解區：瀑布在左、橋接表在右，你能不能 10 秒內說出少賺多少、扣最多的是哪一項？ | 說不出來 | 要回頭找 | 不用回頭看 |
| V2 | 總覽 | 拆解與利潤結構兩張瀑布用同一把尺（見 §6 第 1 點）。拆解變扁之後還好讀嗎？ | 讀不出大小 | 可以，但太扁 | 同一把尺更好比 |
| V3 | 總覽 | 手機版（`overview-390-full.png`）橋接表在前、每列多一條變異條，瀑布在後要左右捲動。這樣能看出九項的大小與方向嗎？ | 看不出來 | 看得出，但要對照 | 一眼就看出 |
| V4 | 總覽 | 其他常用指標每列多了「近 6 週」小折線，各通路緊湊表多了差額條。有幫助還是太雜？ | 太雜 | 有些有幫助（寫出哪個） | 都有幫助 |
| V5 | 健檢 | 健檢清單右側的影響金額條（空心是總差額、實心是各項費用）看得懂嗎？ | 看不懂 | 要看下方說明才懂 | 一看就懂 |
| V6 | 健檢 | 「每 100 元淨營收去向」能不能讓你說出哪個通路虧、被什麼吃掉？ | 說不出來 | 說得出虧，說不出被什麼吃掉 | 都說得出 |
| V7 | 健檢 | 月曆熱表（格內以萬為單位，例如 −0.45）讀得懂嗎？哪一天、哪個通路虧最多看得出來嗎？ | 讀不懂 | 讀得懂但要想 | 一眼看出 |
| V8 | 健檢 | 「五項比率走勢」每張小圖的刻度各自不同（物流費佔比 0–2%、毛利率 0–40%），會不會誤會成同一把尺？ | 會誤會 | 要看刻度才不會 | 不會誤會 |
| V9 | 兩頁 | 新字串（勾「標示新字串」或看頁尾清單）有沒有看不懂、和你平常叫法衝突的？ | 多數看不懂 | 1–2 個要想（寫出是哪個） | 都懂 |
| V10 | 兩頁 | 顏色只有不利上色、有利不用綠；新圖的灰階分段（商品成本、通路費用合計、廣告費）分得出來嗎？ | 分不出來 | 要對照圖例 | 一眼分得出 |

評分表與具體問題表沿用 `verification/revamp-v3/mockups/README.md` §6 的格式；商品毛利、資料來源兩頁的問題由代理 C2 補在本節之後。

## 8 擴充（給代理 C2）

- 資料來源：在 `gen/source.ts` 的 `SOURCES` 加 `synthetic`（`dir: "tests/fixtures/synthetic-4-channel"`）；`gen/build.ts` 的 `LoadedSources` 加同名欄位，`buildAll` 多載入一份。
- 頁面：新增 `gen/products.ts`、`gen/data-source.ts`，各匯出一個回傳 `PageOutput` 的 build 函式（照 `gen/diagnosis.ts` 的寫法：`ProposalBook` 收新字串、`chartFrame` 組 C16、`responsive` 依四個斷點各畫一份、`trialNote` 標設計稿試算、`pageDocument` 包殼層），再把 `gen/build.ts` 的 `PAGES` 對應那一筆的 `build: null` 改成 build 函式、填 `shots`。
- 截圖：在 `shoot.mjs` 的 `SHOTS` 加列（1440 與 390 整頁）；實測的頁面清單由 `SHOTS` 自動帶出。
