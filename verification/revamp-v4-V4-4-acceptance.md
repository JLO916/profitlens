# Revamp v4 V4-4 驗收：商品毛利（G13、G14）（2026-10-10）

- **依據**：
  - `docs/revamp-v4/06_BATCHES.md`「V4-4 商品毛利」
  - `docs/revamp-v4/CHART_CATALOG.md` §5 的 G13、G14 實作卡
  - PRD §4.4–§4.7、§6.3（C25、`headingLevel`）、§6.4、§8.7
  - D-V4-32、38、39（都是 A）
  - H5 設計稿 `verification/revamp-v4/mockups/products*.html` 的建議版
- **依賴**：V4-3c。
- **允許變動畫面**：06、11（商品）。

**工作方式**（共四段）：

1. 開工錨點 `4320290`：labels `products.chartsV4`、CSS V4-4 B／C 錨點。
2. 第一段工作流程（`b1b5611`、`7163be7`、`b19d7eb`、`43bc3bc`，合併 `281a2db`、`3f88d33`）：
   - 代理 A（application 與抽屜 builder）、代理 B（C25 與 `headingLevel`）在兩個 worktree 平行做。
   - 每個代理各配一位對抗審查，就地修正 3 項。
3. 第二段工作流程（`182d7dd`、`a016363`、`0cfef1d`）：
   - 代理 C 整合商品頁。
   - 接著完整 E2E 與三位唯讀審查同時跑：規格與畫面、抽屜與無障礙、護欄與效能。
   - 6 項發現全部修正。
4. 主流程在最終程式上跑完整驗收（本文件）。畫面 11 的截圖方式在這一段修正。

## 1. 完成項目（對照 06_BATCHES V4-4）

| 項目 | 狀態 | 說明 |
|---|---|---|
| C25 RankedBars＋`hbarGeometry` | 完成 | 新檔 `src/components/charts/ranked-bars.tsx`，inline SVG，SSR 會輸出每根柱與 testid；支援 variance、ranked、pareto 三種模式。<br>共用一把尺、各自從 0；pareto 從 0 往左。<br>`hbarMaxRows` 依框高與列高算出列數上限。<br>量寬用 ResizeObserver，SSR 寬 560；圖內 0 個可聚焦元素。<br>pareto 右側的「累計 {pct}」是另一個 svg，≤ 767px 用 CSS 隱藏（D-V4-39＝A），主圖因此變寬 |
| G14 商品毛利為負的商品累計 | 完成 | `productPareto`／`product-pareto-v1`（`src/application/chart-pareto.ts`）：<br>- 只取本期商品毛利 < 0 的列，不補非負列；由小到大，同值依通路、SKU。<br>- 累計用 `sumAmounts`；累計佔比＝取反後的 `ratioMetric`；`allRows` 給資料表列出全部負值列。<br>- 只在 `count > 0` 時渲染：柱 ≤ 10，其餘一列「另 n 個」，沒有「其他」柱。<br>- 示範資料與 golden 不渲染，第一格的 `product-worst` 與 V4-3c 逐字相同（`tests/fixtures/product-highlights-v43c.json`）。<br>- 標題與資料表一律寫「商品毛利為負」 |
| G13 商品毛利兩期差額 | 完成 | `productHighlights().worstChange`（只挑列，不產生新數字）。<br>減少段在上、增加段在下，各寬度都一樣（D-V4-38＝A）；每段 ≤ 5 根，10 × 16＝160 ≤ 180。<br>圖例只列有畫出來的段。<br>資料表列出全部差額 < 0、再接全部差額 > 0 的列：上期、本期、差額，差額欄帶正負號、不利時上色 |
| `product-worst`、`product-best` 改成 ChartFrame 的 `after` 常駐 | 完成 | DOM 與 testid 不變，`h3#product-highlights-heading` 保留。<br>兩張圖都是 `headingLevel={4}`；testId 明寫 `chart-products-pareto`／`chart-products-variance`，id 用 `products-pareto`／`products-variance`，避免日後和試算頁的標題 id 撞名 |
| ChartFrame `headingLevel` | 完成 | 預設 2，輸出與 V4-3c 逐位元組相同；3、4 時改成 h3／h4，id 與 aria 不變 |
| 商品抽屜 builder 抽成 `src/components/product-evidence.ts` | 完成（只搬移） | `productEvidence`、`productDeltaEvidence`：抽出前後的 `EvidenceSelection` 與舊閉包逐欄位 `toStrictEqual`（5 份資料 × 每列 × 每期 × 每項指標）。<br>另有 G14 累計格（`valueKind: "level"`、`product-pareto-v1`）與累計佔比格（`unitOverride: "percent"`，D-V4-32＝A）的 builder |
| `filter.sku` 接線 | 完成 | 下列位置加 `filter: { channel, sku }`：G13 的柱與差額格、G14 的柱與商品毛利格。<br>既有表格格的 payload 不變。<br>G14 的柱另帶 `arrangeVersion: product-pareto-v1`（值取自 domain，`metric_version` 維持 `contribution-v1`） |
| keyboard-walk 商品頁「第一張圖的資料表 summary」里程碑 | 完成 | 在 `product-worst` 之後：1440 第 51、390 第 45。`product-worst` 是 9／3，與 V4-0a、V4-3c 相同 |
| axe 加「合成資料的商品頁」狀態 | 完成 | desktop、laptop、tablet 各 15 個狀態，mobile 14 個，全部 0 |
| 同批 labels 與測試 | 完成 | `products.chartsV4` 新增 30 個 key，v4 累計 101 個。<br>新增 `chart-pareto.test.ts`、`charts-products-v4.test.tsx`、`product-evidence.test.tsx`、`ranked-bars.test.tsx`、`e2e/charts-products.spec.ts`。<br>擴充 `product-page-v3`、`product-highlights`、`chart-frame-v4`、`chart-geometry-v4`、`lazy-panels`、`mounted-testids`、`keyboard-walk`、`axe-sweep` |

**審查修正（第二段，`0cfef1d`）**：

- G13 沒有差額時的標題縮到 14 字：「各商品的{metric}都持平或待補」。新增測試逐一檢查每個實際渲染的標題。
- C33 新增 `hasEvidence`：evidence 改在點擊時才組。原本 G14 的累計與佔比格每次渲染都要組全表，成本是 O(n²)；200 個負值 SKU 時從約 740 ms 降到約 15 ms。
- C33 新增 `unfavorable`：G13、G14 照設計稿把不利的金額上色。
- G14 的柱加 `arrangeVersion`。
- G13 圖例只列有畫出來的段。
- 首載可達性測試加入商品頁的三個新模組，確保它們不會被拉進首載。

**主流程修正**：`verification/revamp-v4-capture/baseline.spec.ts` 的畫面 11 改用 `fullPage`＋`clip`，與畫面 10 相同。

- 原因：元素截圖會先把 section 捲進視窗；`main section` 的 `scroll-margin-top: 120px` 讓變高的 section 下緣超出 1000px 視窗，超出的 66px 沒有繪製。結果是 1440 的 G13 資料表 summary 與框底不在圖上。
- 影響：只有 desktop 的 11 換了基準圖；laptop、tablet、mobile 用兩種方式截出來的圖相同。

## 2. 變更檔案

- **新增**：
  - 程式：`src/application/chart-pareto.ts`、`src/components/charts/ranked-bars.tsx`、`src/components/product-evidence.ts`、`src/components/products/highlight-charts.tsx`
  - 測試：`tests/{chart-pareto.test.ts,charts-products-v4.test.tsx,product-evidence.test.tsx,ranked-bars.test.tsx}`、`tests/e2e/charts-products.spec.ts`、`tests/fixtures/product-highlights-v43c.json`
  - 本文件、`verification/revamp-v4/V4-4/`
- **修改**：
  - 程式：`src/application/product-highlights.ts`、`src/components/{product-comparison-panel.tsx,charts/chart-data-table.tsx,overview/charts/chart-frame.tsx}`、`src/app/globals.css`（只在 V4-4 B、C 錨點內）、`src/i18n/labels.zh-TW.ts`（只在 V4-4 錨點內）
  - 測試：`tests/{chart-frame-v4.test.tsx,chart-geometry-v4.test.ts,product-highlights.test.ts,product-page-v3.test.tsx,lazy-panels.test.tsx,mounted-testids.test.tsx}`、`tests/helpers/page-states.tsx`、`tests/e2e/{axe-sweep.spec.ts,keyboard-walk.spec.ts,chart-helpers-v4.ts}`
  - 量測：`verification/revamp-v4-capture/{metrics.spec.ts,baseline.spec.ts}`
  - 基準清單：`verification/revamp-v4/{testids-v4-added.txt,feature-retention.csv}`
  - 文件：`docs/revamp-v4/{CHART_CATALOG.md,06_BATCHES.md,09_DECISIONS_PENDING.md,00_README.md}`、`docs/{STATUS.md,DECISIONS.md}`
- **零改動**：
  - 財務禁區：`src/domain`、`fixtures`、`docs/METRICS.md`、`src/application/{assist-kpi.ts,breakeven-mer.ts}`
  - 依賴：`package.json`、`package-lock.json`
  - 棘輪上限檔：`tests/fixtures/*-ceiling.json`、`tests/copy-density.test.ts`
  - 既有字串快照：`verification/revamp-v4/labels-v3.flat.json`

## 3. 驗收命令與真實結果

| 命令 | 結果 |
|---|---|
| `npm ci` | 未執行（lockfile 沒有變動） |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run audit:ui -- --json verification/revamp-v4/V4-4/ui-audit.json` | design 15 項與 V4-3c 相同（hex 0、圓角 4、字級 11、字距 0、箭頭 3）；labels 同義詞 12；靜態 testid 252。<br>只有資訊欄變動：class 848 → 857、動態 testid 屬性 63 → 64、TSX 檔 63 → 65 |
| `npm run contrast-check` | 85／85 通過 |
| `npm test -- --run` | **147 檔／2,898 測試全過**（V4-3c 143／2,817） |
| `npm run test:e2e`（修正前 `a016363`，四個視窗） | 941 passed、0 failed、15 skipped（28.8m） |
| 同上（最終程式 `0cfef1d`，帶三個 `*_OUT`） | **941 passed、0 failed、15 skipped（28.0m）**：新增 12 條（`charts-products` 3 條 × 4 尺寸）。跑完已還原 E2E 改寫的追蹤檔 |
| PUBLIC_DEMO build 與伺服器（3100） | exit 0；`GET /` 200 |
| `CAPTURE_BATCH=V4-4 …`（先複製 V4-3c 的 52 張） | 第 1 次 15 passed、8 failed、5 skipped：差異**只有四個尺寸的 06 與 11**（允許）；其餘 44 張 0 差異 |
| `--update-snapshots=changed`（只跑 baseline） | 16 passed，重寫的正好是那 8 張。目視時發現 desktop 11 下緣沒有繪製（見 §1 主流程修正），改截圖方式後重產 desktop 11 |
| 同上第 2 次（完整） | **23 passed、5 skipped**：52 張與 V4-4 基準相同；與 V4-3c 不同的檔正好是 8 張 06、11。metrics 硬斷言全部通過 |
| Lighthouse × 3（1 分鐘負載 2.86、2.61、2.76） | 390 的五項 TBT 都通過（見下表）。第 3 次的完整報告在 `verification/revamp-v4/V4-4/lighthouse/`，三次數值在 `lighthouse-runs/` 與 `metrics.json` |
| `lsof -ti tcp:3100 \| xargs kill`；`lsof -ti tcp:3100` | 已停，沒有輸出 |
| 禁區四條命令 | 四條都空 |
| commit 之後 `git diff --stat 625bfa5 HEAD -- （禁區與 assist-kpi、breakeven-mer 路徑）` | 空（收尾 commit `838f4fd`；程式 commit `b1b5611`、`7163be7`、`b19d7eb`、`43bc3bc`、`182d7dd`、`a016363`、`0cfef1d` 之後也是空） |
| 隱藏字元掃描（`4320290..HEAD` 與工作區） | 0 |

**棘輪與基準數值**

| 項目 | V4-4 | 與基準 |
|---|---|---|
| design-lint 15 項、copy-style、copy-density、chart-lint CL-1–CL-11 | 不變（上限檔沒動；chart-lint 全 0；L1 標題子句超長 0） | 不變 |
| 商品頁主層獨立圖區塊 | 示範資料 1（G13）；合成資料與 refund_only 2（G14、G13） | 符合 06 |
| testid 刪除數（v2、v3、v4 新增） | 0、0、0。`testids-v4-added.txt` 新增 29 列（pareto 區塊 2、pareto 柱 6、variance 區塊 2、variance 柱 19），累計 269 列 | — |
| labels 快照 | 2,581 個鍵逐字相同；新 key 30 個，都在 `products.chartsV4`；copy-scan 擋「賠錢」「虧損」（V4-0a 起），命中 0 | — |
| First Load JS gzip（B5） | **500,188 bytes**（V4-3c 499,443，＋745：ChartFrame `headingLevel`、C33 `hasEvidence`／`unfavorable`／`signed` 在首載。商品頁的新模組在隨頁 chunk）；門檻 545,397，**剩 45,209** | 通過 |
| B1 商品頁第一張 `.chart-frame` 頂 | 1440 **403**（≤ 900，本批起硬斷言）；1280 407；390 1,330（只記錄） | 通過 |
| B9 商品頁 DOM 節點數 | 2,225（三尺寸；V4-0a 1,822＋403；門檻＋1,500＝3,322） | 通過 |
| B2、B3 | 與 V4-3c 相同（其他頁的 B1、B9 也相同） | 不變 |
| Lighthouse Accessibility | 1440、390 各 8 頁，三次全部 100 | 不變 |
| Lighthouse Performance（空狀態首頁） | 1440 100；390 95、95、97 | ≥ 90 |
| 390 TBT 中位數（ms，低負載三次） | 載入示範資料 1,037.7 ≤ 1,109.1<br>通路健檢 792.0 ≤ 832.3<br>**商品毛利 84.0 ≤ 129.9**（三次 82.7／95.5／84.0；V4-3c 83.1）<br>會議紀錄 986.1 ≤ 1,071.2<br>資料來源 13.8 ≤ 50.0 | 五項通過 |
| 預先載入（V4-3c） | 三次的 `insideTimespans` 都是空的 | 不在量測區間內 |
| CLS | 與 V4-3c 相同（390 商品 0.054，V4-3c 就有） | 不變 |
| axe 四尺寸 | 15／15／15／14 個狀態，serious、critical、moderate、minor 都是 0；新狀態 `page-products-synthetic` | 通過 |
| keyboard-walk | 只有商品頁變動：`product-worst` 9／3 不變；新里程碑「第一張圖的資料表 summary」51／45；商品表第一列 57 → 58、51 → 52（多 1 個停留點，就是 G13 資料表的 summary）。`aria-hidden` 內停留點 0；其他頁與 V4-3c 逐項相同 | 通過 |
| network-log | desktop、mobile 的下載集合（5 種檔名與位元組）、`checks` 與 V4-3c 相同；外部來源 0、非 GET 0、CSV 外洩 0 | 不變 |
| 功能保留表 | `batch` 含 V4-4 的 4 列（36、G13、G14、MV2）全部打勾 | 完成 |

**畫面基準差異（只列允許變動的畫面）**

| 畫面 | 尺寸 | 變化 | 理由 |
|---|---|---|---|
| 06 商品整頁 | desktop、laptop、tablet、mobile | 頁面變長（desktop 1,890 → 2,310px；約 34%–37% 像素不同） | 第二格由 `product-best` 表改成 G13 圖框（圖＋`after` 的 `product-best`＋資料表 summary），完整商品表往下移 |
| 11 商品圖區 | desktop、laptop、tablet、mobile | desktop 526 → 947px，laptop 526 → 951px，tablet 1,040 → 1,465px，mobile 2,303px | 範圍是 `section.product-highlights`，G13 正好在這裡。示範資料沒有商品毛利為負，所以第一格仍是 v3 的 `product-worst`（逐字相同） |

## 4. 瀏覽器驗收方式與截圖

- **截圖**：`verification/revamp-v4/V4-4/snapshots/{desktop,laptop,tablet,mobile}/`，各 13 張。看本批變化：`desktop/11-products-chart-area.png`（G13：減少段在上、增加段在下，`after` 的 `product-best`、資料表 summary）、`mobile/11-products-chart-area.png`、`desktop/06-products.png`。
- **合成資料（G14）的目視**：主流程用暫時的 spec 截圖，截完即刪，沒有提交。結果：
  - 1440：G14 5 根柱，右側「累計 38.0%／60.9%／81.0%／90.5%／100.0%」，標題「5 個商品毛利為負，前 3 個佔 81.0%」。
  - 390：右側累計不畫（D-V4-39＝A）。
  - G13 在兩個尺寸都是 5＋4 根。
  - 這些都由 `charts-products.spec.ts` 在四個尺寸斷言。
- **方式**：
  - 截圖：本機 production build、PUBLIC_DEMO 伺服器，用 `toHaveScreenshot`（0 像素差、threshold 0.02）。
  - E2E：四個視窗都用 LOCAL 伺服器。
- **量測檔**：`verification/revamp-v4/V4-4/` 下的 `metrics.json`、`first-load-modules.json`、`ui-audit.json`、`axe.json`、`keyboard-walk.json`、`network-log.json`，以及 `lighthouse/`、`lighthouse-runs/`。

## 5. 已知限制與風險

- **G13、G14 的柱與資料表延後一拍渲染**：沿用 V4-3b 的 `useDeferredMount`。第一次渲染時，圖區是同高的 loading 骨架、資料表只有 summary。
  - 原因：延後前單次量到 390 商品切頁 TBT 112 ms，離門檻 129.9 太近；延後後三次中位數 84.0。
  - 之後在商品頁加內容要先量這一項。
- **示範資料的兩格視覺不對稱**：第一格是 v3 原樣、沒有外框的 `product-worst` 表，第二格是有外框的 G13 圖框，兩格等高但內容高度不同。這是 D-V4-38、設計稿 README 第 16 點已知的情況；有負值時兩格都是圖框。
- **G13 資料表的列**：列出全部差額 < 0 再接全部差額 > 0 的列（示範資料 40 列，合成資料 10 列）；差額 0 與待補的列不列，`<details>` 內有一句說明。`product-best` 表仍是前 10。
- **First Load JS 多 745 bytes**：都來自首載裡共用的 ChartFrame 與 C33。
- **待拍板 D-V4-45（新增）**：
  - 現況：健檢頁 G7a、G7b、G10 的資料表仍是中性色，H5 設計稿則把不利的金額上色；G13、G14 已照設計稿。
  - 建議 B：在 V4-8 給健檢頁資料表的不利金額加 `unfavorable`。
  - 回覆前維持 A。
- 人工關卡 H6、PPT spike 人工開檔都未執行。

## 6. 下一步、人工關卡與待拍板

- **待拍板 D-V4-45**：健檢頁資料表的不利色。建議 B，排入 V4-8。
- **下一批**：V4-5（假設試算 G15、G16；依賴 D-V4-20，已拍板）。G15 會沿用 C25 RankedBars（row24、正負混合的中線）；V4-5 要補「軸」或「現況」列。
- **部署**：本批沒有部署。preview 部署仍需使用者當次明確同意。
