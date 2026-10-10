# Revamp v4 V4-5 驗收：假設試算（G15、G16）（2026-10-10）

- **依據**：`docs/revamp-v4/06_BATCHES.md`「V4-5 假設試算」；`docs/revamp-v4/CHART_CATALOG.md` §5 的 G15、G16 實作卡；PRD §4.4–§4.7、§6.3（C25、C29、ChartFrame `variant`、`headingLevel`）、§8.7 例外；D-V4-20＝A′；`docs/SCENARIOS.md`（x 範圍 [−90%, +100%]、不外插、不代填）。
- **依賴**：V4-4。
- **允許變動畫面**：07（試算）。

**工作方式**：

1. **開工錨點** `db0f401`：D-V4-45＝B 寫入 06、09；labels 加 `scenarios.chartsV4`；CSS 加 V4-5 A／B／C 錨點。
2. **第一段**（`146e6b6`、`8e815b2`、`12500eb`、`15644b1`；合併到 `afdcf4c`）：兩個代理在兩個 worktree 平行做——代理 A 做 C29、`thresholdPoints`、`variant="inline"`、門檻說明句搬家；代理 B 做 G15 與 RankedBars 軸列。每個代理配一位對抗審查。
3. **第二段**（`4cf17ab`、`a8b7777`、`c25f249`）：代理 C 接上 G16、補 E2E 與各項基準，並修第一段審查留下的 3 項。接著四尺寸完整 E2E 與三位唯讀審查（規格與 X29、無障礙、護欄與效能）同時跑；共 11 項發現，10 項修正，1 項列為待拍板 D-V4-46。
4. **主流程在最終程式上完整驗收**（本文件）。390「切到通路健檢」的 TBT 在主流程兩組量測都超過門檻，另做了 V4-4 與 V4-5 的同場交替量測（見 §3、§5），結論是雜訊，不是本批造成的退步。

## 1. 完成項目（對照 06_BATCHES V4-5）

| 項目 | 狀態 | 說明 |
|---|---|---|
| G15 方案差額 | 完成 | `src/components/scenarios/variance-chart.tsx`。<br>位置：`DecisionWorkbench` 內，在方案欄之後、方案比較表之前；全頁一份（`chart-scenarios-variance`，不在任何 `scenario-{n}` 內）。<br>畫法：C25 RankedBars variance，列高 row24，加一列「現況 {amount}」軸列；零線＝現況。柱數＝有效結果數，條端是 `formatSignedDelta(delta, "L1")`；少賺用不利色、多賺用 `--chart-favorable`。<br>標題：取差額絕對值最大的方案，句型是「{方案} 試算後比現況多賺／少賺 {amount}」或「試算後與現況持平」。三個 key 都含「試算後」，每個子句 ≤ 14 字。<br>不做任何跨方案合計；柱不可點（PRD §8.7 例外）。<br>資料表是 L2 純文字：還沒試算或還不能試算寫「尚未試算」，與比較表相同；方案被判定不適用時寫「不適用」。<br>不能試算或過期時，空狀態訊息沿用既有字串 |
| C29 ThresholdLine、G16 要賣到多少才划算 | 完成 | `thresholdPoints`（`src/application/chart-threshold.ts`）只組既有點，屬 A 級，沒有版本常數。`ThresholdLine` 與 `thresholdGeometry` 在 `src/components/charts/threshold-line.tsx`。<br>座標：x 固定在 −90% 到 +100%，每 25 個百分點一刻度；y 含 0，刻度用 `formatAxisWan`。<br>畫法：**只畫點、不連線**（D-V4-20＝A′；幾何與 markup 都沒有 path 或 polyline）。門檻點是空心圈（`--chart-target`），使用者的三個假設是實心點（`--chart-total`）。<br>邊界情況：<br>- 門檻超出範圍：不畫該點，圖下寫「超出範圍」與範圍內的結果。<br>- L＝0：不畫門檻點，副標用既有的恆等、恆高、恆低說明句。<br>- 過期：整張是空狀態，訊息沿用既有過期說明。<br>- 三個假設沒填：不畫使用者點，不代填。<br>位置：每個 `scenario-{n}` 的「要賣到多少才划算」裡，門檻說明之後、技術細節之前。標題沿用既有說明句（字不改）；有效時標題層級 h4，過期分支用 h3，標題不跳級 |
| ChartFrame `variant="inline"` 首次使用 | 完成 | 預設 panel 的輸出逐位元組不變；inline 輸出 `section.chart-section.is-inline`，沒有 `.panel` 外框 |
| X29 與 golden | 完成 | 敏感度輸入預設仍是空白；所有點的 x 都在 [−90, 100] 內；不外插。golden 試算 284.00／264.00／19.70 不變（E2E 與單元測試都有斷言） |
| `thresholdDescription` 搬到共用處 | 完成 | 搬到 `src/application/scenario-threshold-text.ts`，`targetLabel` 一起搬；每種狀態的輸出逐字相同（有測試） |
| axe 新增狀態「試算計算後展開 scenario-sensitivity」 | 完成 | desktop、laptop、tablet 各 16 個狀態，mobile 15 個，全部 0 |
| 同批 labels 與測試 | 完成 | `scenarios.chartsV4` 新增 26 個 key，v4 累計 127 個。<br>新增：`chart-threshold.test.ts`、`charts-scenarios-v4.test.tsx`、`scenario-threshold-text.test.ts`、`e2e/charts-scenarios.spec.ts`。<br>擴充：`scenario-sensitivity`、`decision`、`scenario-page-v3`、`chart-frame-v4`、`chart-geometry-v4`、`mounted-testids`（V4-5 M1）、`axe-sweep`、`keyboard-walk`（試算里程碑改成硬斷言）。<br>RankedBars 加軸列後，商品頁的輸出逐位元組不變，由 `tests/fixtures/ranked-bars-v4-4.json` 對照 |

**審查修正（第二段，`c25f249`）**：

- G16 空狀態的副標不再提「空心圈／實心點」。
- 零貢獻點的標籤改成「扣廣告後貢獻 = 0：−51.3%」，保留 `targetZero` 的限定詞，避免被讀成公司損益兩平。
- G15 資料表的「尚未試算／不適用」與比較表一致。
- 過期分支的 G16 標題改為 h3，避免標題跳級。
- G16 資料表的捲動區名稱帶方案名，兩個方案欄分得開。
- G16 的 DOM id 改用不會撞名的轉義。
- 功能保留表第 39 列改成以實測為準。
- G16 標題指的是哪一個門檻，列為待拍板 D-V4-46。

**E2E 修正（`a8b7777`）**：`workspace.spec.ts`「示範資料由空狀態進入可閱讀總覽」原本會數到隱藏的試算工作台裡 G15 的資料表 `<details>`。這個工作台依設計在每一頁都隱藏掛載，所以改成只數看得見的；斷言不變。

## 2. 變更檔案

- **新增**：
  - 程式：`src/application/{chart-threshold.ts,scenario-threshold-text.ts}`、`src/components/charts/threshold-line.tsx`、`src/components/scenarios/{variance-chart.tsx,threshold-chart.tsx}`。
  - 測試：`tests/{chart-threshold.test.ts,charts-scenarios-v4.test.tsx,scenario-threshold-text.test.ts}`、`tests/e2e/charts-scenarios.spec.ts`、`tests/fixtures/ranked-bars-v4-4.json`、`tests/helpers/ranked-bars-baseline.tsx`。
  - 本文件、`verification/revamp-v4/V4-5/`。
- **修改**：
  - 程式：`src/components/{decision-workbench.tsx,scenario-sensitivity.tsx,charts/ranked-bars.tsx,overview/charts/chart-frame.tsx}`。
  - 樣式與文案：`src/app/globals.css`（只動 V4-5 錨點內）、`src/i18n/labels.zh-TW.ts`（只動 V4-5 錨點內）。
  - 單元測試：`tests/{scenario-sensitivity.test.ts,decision.test.ts,scenario-page-v3.test.tsx,chart-frame-v4.test.tsx,chart-geometry-v4.test.ts,mounted-testids.test.tsx}`、`tests/helpers/page-states.tsx`。
  - E2E：`tests/e2e/{axe-sweep.spec.ts,keyboard-walk.spec.ts,chart-helpers-v4.ts,workspace.spec.ts}`。
  - 量測規格：`verification/revamp-v4-capture/metrics.spec.ts`。
  - 驗收清單：`verification/revamp-v4/{testids-v4-added.txt,feature-retention.csv,e2e-text-assertions.csv}`。
  - 文件：`docs/revamp-v4/{06_BATCHES.md,09_DECISIONS_PENDING.md,00_README.md}`、`docs/{STATUS.md,DECISIONS.md}`。
- **零改動**：
  - 禁區：`src/domain`（含 `scenarios.ts`、`scenario-sensitivity.ts`）、`fixtures`、`docs/METRICS.md`、`src/application/{assist-kpi.ts,breakeven-mer.ts}`。
  - 依賴：`package.json`、`package-lock.json`。
  - 棘輪：上限檔、`tests/copy-density.test.ts`、`labels-v3.flat.json`。

## 3. 驗收命令與真實結果

| 命令 | 結果 |
|---|---|
| `npm ci` | 未執行（lockfile 沒有變動） |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run audit:ui -- --json verification/revamp-v4/V4-5/ui-audit.json` | design 15 項與 V4-4 相同。只有資訊欄變動：class 857 → 865、動態 testid 屬性 64 → 66、TSX 檔 65 → 68 |
| `npm run contrast-check` | 85／85 通過 |
| `npm test -- --run` | **150 檔／3,007 測試全過**（V4-4 是 147 檔／2,898） |
| `npm run test:e2e`（第二段 `4cf17ab`） | 949 passed、4 failed、15 skipped（32.3m）。4 個失敗都是 `workspace.spec.ts:139`，修正見 §1 |
| 同上（最終程式 `c25f249`，帶三個 `*_OUT`） | **953 passed、0 failed、15 skipped（28.5m）**。新增 12 條（`charts-scenarios` 3 條 × 4 尺寸）。跑完已還原 E2E 改寫的追蹤檔 |
| PUBLIC_DEMO build 與伺服器（3100） | exit 0；`GET /` 200 |
| `CAPTURE_BATCH=V4-5 …`（先複製 V4-4 的 52 張） | 第 1 次：19 passed、4 failed、5 skipped。差異**只有四個尺寸的 07**（允許），其餘 48 張 0 差異 |
| `--update-snapshots=changed`（只跑 baseline） | 重寫的正好是 4 張 07 |
| 完整重跑 | **23 passed、5 skipped**。與 V4-4 不同的檔正好是 4 張 07；metrics 硬斷言全部通過 |
| Lighthouse 第一組 × 3（開跑負載 < 3.0：2.71、2.80、2.54；第 3 次結束時 4.65） | 390 中位數依序（載入示範資料／健檢／商品／會議／資料來源）：1,075.1／**846.9**／92.6／998.8／4.0。**「切到通路健檢」超過門檻 832.3** |
| Lighthouse 第二組 × 3（開跑負載 < 2.5：2.53、2.43、2.45） | 1,097.7／**845.4**／94.2／1,012.2／5.2。**仍超過** |
| 同場交替量測 V4-5 對 V4-4（`7cce778` 另建於 scratch、3101）：行動版流程 8 對，加正式腳本 3 對，每次開跑負載 < 3.0 | **雜訊，不是退步**：<br>- 成對差平均：載入示範資料 −21.6、健檢 −7.7、商品 −3.4、會議 −3.6、資料來源 ＋0.3 ms，正負號每對不同；trace 的長任務長度相同。<br>- **正式腳本 3 次中位數**：V4-5 是 **1,074.4／812.4／94.0／1,011.7／7.9（五項都過）**；V4-4 同場是 1,070.5／**843.8**／90.7／1,033.4／4.6，健檢超過門檻（V4-4 驗收時是 792.0） |
| `lsof -ti tcp:3100 \| xargs kill`；`lsof -ti tcp:3100` | 已停，沒有輸出；3101 也已停 |
| 禁區四條命令 | 四條都空 |
| commit 之後 `git diff --stat 625bfa5 HEAD -- （禁區與 assist-kpi、breakeven-mer 路徑）` | 空（收尾 commit `96b1510`；程式 commit `146e6b6`、`8e815b2`、`12500eb`、`15644b1`、`4cf17ab`、`a8b7777`、`c25f249` 之後也是空） |
| 隱藏字元掃描 | 0 |

**棘輪與基準數值**

| 項目 | V4-5 | 與基準 |
|---|---|---|
| design-lint 15 項、copy-style、copy-density、chart-lint CL-1–CL-11 | 不變（上限檔沒動；chart-lint 全 0） | 不變 |
| 試算頁主層獨立圖區塊 | 1（G15；G16 在收合的 `<details>` 內） | 符合 06 |
| 總覽 `main .chart-frame:visible` | 仍是 4 | 不變 |
| testid 刪除數（v2、v3、v4 新增） | 0、0、0；`testids-v4-added.txt` 新增 11 列，累計 280 列 | — |
| labels 快照 | 2,581 個鍵逐字相同；新 key 26 個，都在 `scenarios.chartsV4`；G15 標題 key 都含「試算後」 | — |
| First Load JS gzip（B5） | **507,258 bytes**（V4-4 是 500,188，＋7,070：試算工作台在首載裡，ranked-bars、threshold-line、chart-threshold、variance-chart 一起進來）；門檻 545,397，**剩 38,139** | 通過 |
| B1 試算 G15 頂（1440） | 剛載入 938（≤ 962＝V4-0a 方案比較表區塊頂 938＋24）；「維持現況」計算後 1,114（≤ 1,138）；兩者都正好等於原本比較表的位置。1280 是 940／1,116；390 是 1,386／1,562（只記錄） | 通過（本批起硬斷言） |
| B9 DOM 節點數 | 試算頁 683（V4-4 660）。**每一頁都 ＋23**：隱藏掛載的試算工作台裡 G15 的空狀態框。總覽 3,308、健檢 2,174、商品 2,248 等，都在 V4-0a＋1,500 以內 | 通過 |
| B2、B3、其他頁 B1 | 與 V4-4 相同 | 不變 |
| Lighthouse Accessibility | 1440、390 各 8 頁，所有量測（9 次 V4-5、3 次 V4-4）全部 100 | 不變 |
| Lighthouse Performance（空狀態首頁） | 1440 是 100；390 是 94–97 | ≥ 90 |
| 390 TBT（正式腳本、同場對照的三次中位數） | 載入示範資料 1,074.4 ≤ 1,109.1；健檢 812.4 ≤ 832.3；商品 94.0 ≤ 129.9；會議 1,011.7 ≤ 1,071.2；資料來源 7.9 ≤ 50.0 | 五項通過（另見 §5 與 D-V4-47） |
| 預先載入 | 所有量測的 `insideTimespans` 都是空的 | 不在量測區間內 |
| axe 四尺寸 | 16／16／16／15 個狀態，serious、critical、moderate、minor 都是 0 | 通過 |
| keyboard-walk | 試算里程碑不變（desktop 11／16／30、mobile 5／10／24，本批起硬斷言 ≤ V4-0a）；試算頁 main 內的停留點 34 → 35、28 → 29（多的是 G15 資料表 summary，在所有里程碑之後）；其他頁與 V4-4 逐項相同；`aria-hidden` 內停留點 0 | 通過 |
| network-log | 下載集合（5 種檔名與位元組）、`checks` 與 V4-4 相同；決策匯出不受 G15、G16 影響 | 不變 |
| 功能保留表 | `batch`＝V4-5 的 4 列（38、39、G15、G16）全部打勾；第 39 列已填正式 capture 的實測值 | 完成 |

**畫面基準差異（只列允許變動的畫面）**

| 畫面 | 尺寸 | 變化 | 理由 |
|---|---|---|---|
| 07 試算 | desktop、laptop、tablet、mobile | 頁面變長：desktop 1,981 → 2,353px，laptop 1,983 → 2,355px，tablet 2,452 → 2,844px，mobile 2,521 → 2,897px | 方案欄與比較表之間多了 G15（截圖狀態是「維持現況」計算後：1 根 0 元的柱、標題「方案 1 試算後與現況持平」、軸列「現況 133.1 萬」）；G16 在收合的 `<details>` 內，不在截圖裡 |

## 4. 瀏覽器驗收方式與截圖

- **截圖位置**：`verification/revamp-v4/V4-5/snapshots/{desktop,laptop,tablet,mobile}/`，各 13 張。本批變化看 `*/07-scenarios.png`。
- **有結果的目視檢查**：主流程寫了暫時的 spec，截完即刪，沒有提交。流程是示範資料、DTC，三個方案依序套用範本「砍廣告一半」「取消免運（物流費自付）」「KOL 合作」並試算，再在方案 1 的「要賣到多少才划算」填 −20、0、30。看到的結果：
  - G15：方案 1 −21.1 萬、方案 2 −13.3 萬往左畫成不利色，方案 3 +17.7 萬往右；中間零線標「現況 133.1 萬」；390 的版面正常。
  - G16（三欄時方案欄約 330px 寬）：零貢獻門檻在 −90% 以外，所以不畫，圖下有說明；「維持現況」的空心圈標 −6.1%；A、B、C 三個實心點；沒有連線。
  - 上述行為都由 `charts-scenarios.spec.ts` 在四個尺寸斷言。
- **方式**：截圖用本機 production build 的 PUBLIC_DEMO 伺服器，`toHaveScreenshot` 設 0 像素差、threshold 0.02；E2E 四個視窗都用 LOCAL 伺服器。
- **量測檔**：`verification/revamp-v4/V4-5/` 下的 `metrics.json`、`first-load-modules.json`、`ui-audit.json`、`axe.json`、`keyboard-walk.json`、`network-log.json`；`lighthouse/` 是第一組第 3 次的報告；`lighthouse-runs/` 下有 `set1-run{1,2,3}`、`set2-run{1,2,3}`、`ab-official-p{1,2,3}-{v45,v44}`。

## 5. 已知限制與風險

- **390 TBT 會跟著主機負載漂移，待拍板 D-V4-47**：Lighthouse timespan 模式改用 devtools 節流，TBT 是 4 倍節流下的實際時間。
  - 同一份 V4-5 程式在主流程兩組三次的健檢中位數是 846.9、845.4，在同場對照的正式腳本是 812.4。
  - V4-4 同場也從 792.0 漂到 843.8。
  - 本批的通過判定根據兩點：正式腳本三次中位數五項都過；同場成對量測顯示沒有比 V4-4 慢。
  - 建議 D-V4-47 採 B：三次中位數不過時，改用同場和前一批的成對對照來判定。
- **G16 標題沒有說是哪一個門檻，待拍板 D-V4-46**：標題照 CHART_CATALOG，沿用既有說明句、一字不改，但圖上有兩個標名稱的空心圈。建議 B：在標題前加既有的目標名「打平（扣廣告後貢獻 = 0）：」。回覆前維持原句。
- **每一頁 DOM 都多 23 個節點**：來自試算工作台隱藏掛載的 G15 空狀態框，所有頁都還在 B9 門檻內。
- **First Load JS 多 7,070 bytes**：試算頁的圖在首載，還剩 38,139 bytes。之後在試算頁加東西要留意這個額度。
- **G15 標題在方案名後加了一個空格**：寫成「方案 1 試算後…」，因為預設方案名以數字結尾，不加空格會黏在一起；與 V4-4 商品頁標題的寫法一致。
- **展開敏感度時的標題跳級是 v3 舊有的**：h2 基準標題之下直接接 h4「兩個目標」。這條規則不在 axe 掃描的 wcag 標籤內，只記錄在 `axe.json` 的 `dom.headingSkips`。G16 本身沒有造成跳級。
- **人工關卡**：H6、PPT spike 的人工開檔都未執行。

## 6. 下一步、人工關卡與待拍板

- **待拍板 D-V4-46（G16 標題）**：建議 B。
- **待拍板 D-V4-47（TBT 判定方式）**：建議 B。
- **下一批**：V4-6，會議紀錄（G15 會議實例、G19）。G15 的會議實例會用 `variant="inline"`、`headingLevel={4}`，每個通路一根柱，上限 6 根。
- **部署**：本批沒有部署；preview 部署仍需使用者當次明確同意。

## 7. 收尾後補做（2026-10-10，使用者回覆「46 B、47 B、V4-6」）

- **D-V4-46＝B**：G16 有效時的標題改成「{既有目標名}：{既有說明句}」（新 key `scenarios.chartsV4.threshold.title`；`thresholdTargetLabel("zero_contribution")` 與 `thresholdDescription` 都字不改），例如「打平（扣廣告後貢獻 = 0）：銷量增減大於或等於這個門檻時，試算結果可維持目標或更高。」；L＝0、超出範圍也一樣加目標名，過期與不能試算仍是區塊名。改動：`src/components/scenarios/threshold-chart.tsx`、`src/i18n/labels.zh-TW.ts`（V4-5 錨點內）、`tests/scenario-sensitivity.test.ts`（2 處標題斷言）、`tests/e2e/charts-scenarios.spec.ts`（2 處）。驗證：typecheck、lint exit 0；unit 150 檔／3,007 全過；`charts-scenarios.spec.ts`、`scenario-sensitivity.spec.ts` desktop、mobile 12／12 通過。G16 在收合的 `<details>` 內，畫面 07 不變（V4-6 的 52 張比對會一併確認）。
- **D-V4-47＝B**：寫入 06 護欄表 Lighthouse 列。V4-5 的同場對照（§3）符合 B 的通過條件。

