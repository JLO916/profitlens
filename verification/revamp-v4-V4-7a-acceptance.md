# Revamp v4 V4-7a 驗收：資料來源（G20、G21、問題表篩選）（2026-10-12）

依 `docs/revamp-v4/06_BATCHES.md`「V4-7a 資料來源」、`docs/revamp-v4/CHART_CATALOG.md` §7 的 G20、G21 實作卡、PRD §4.4–§4.7、§5.7、§6.3（C28、C30）、D-V4-40＝A 與 H5 設計稿 `verification/revamp-v4/mockups/data.html`。依賴 V4-6，允許變動畫面只有 09（資料來源）。

開工前先補做 V4-6 的 D-V4-48＝B／B、D-V4-49＝A／C（`5eb408a`，見 V4-6 驗收 §7）。

**工作方式**：

1. **開工錨點**（`e905189`）：labels 加 `data.chartsV4`，CSS 加 V4-7a A、B、C 錨點。
2. **第一段**（合併為 `3af97b7`）：代理 A 做 G20，代理 B 做 G21 與問題表篩選 API，兩者都是獨立元件、不碰 `DataWorkspace`，在兩個 worktree 平行進行，各配一位對抗審查。
   - 代理 A：`5e023c2`，審查修正 `9e3282c`。
   - 代理 B：`ed7d78a`，審查修正 `a710afa`。
   - 審查曾因使用量上限中斷，重跑後完成。
3. **第二段**：代理 C 整合進 `DataWorkspace`（`3bacd2d`）。
   - 這段工作曾因 session 結束中斷，重啟時接手了未提交的半成品，並先檢查過 `testid-baseline` 沒有被放寬。
   - 接著四尺寸完整 E2E 與三位唯讀審查同時跑：13 項發現（含重複），修 7 項（`41c5b89`），其餘列為待拍板 D-V4-52、53、54。
4. **主流程**：在最終程式上完整驗收（本文件）。390 TBT 三次中位數有三項超過門檻，依 D-V4-47＝B 與 V4-6 做同場成對對照（§3）：
   - 第一組 3 對時，macOS 的照片分析背景程式 `mediaanalysisd` 吃約 270% CPU，結果判讀不了。
   - 改由代理在低負載下重跑；代理中途因使用量上限停止，主流程接手跑完 6 對並比對 trace。
5. **拍板補做**：使用者 2026-10-12 回覆「都依你的建議」，D-V4-51＝（a）A、（b）B，D-V4-52＝A，D-V4-53＝B，D-V4-54＝A。
   - 在獨立 worktree 實作並配對抗審查（`c2c9040`、`12fb918`，合併 `33a2d5f`）。
   - 主流程再補審查剩下的文字（`6cc4c13`）。

## 1. 完成項目（對照 06_BATCHES V4-7a）

| 項目 | 狀態 | 說明 |
|---|---|---|
| C30 Timeline＋G20 涵蓋時間軸 | 完成 | `coverageTimeline`／`coverage-timeline-v1`：通路費用、廣告的缺列依檔 × 通路合併成連續日期區段，每段天數加總＝缺列問題筆數；範圍級缺列時退回文字。<br>X 軸依 D-V4-40＝A：上期起日到涵蓋訖日，最早的缺列比上期早時往前延伸；去年同期不畫在軸上，改寫在副標第二行（`data-coverage-yoy`）。<br>上期、本期區帶直接標字；有列用 `--chart-total`，缺列用 `--chart-missing` 虛線框，最小寬 6px；銷售無列標「無列」，不當作 0。<br>標題：最長缺列區段（`title.missing`）；只有 1 天時用 `title.missingOneDay`，不寫「8/2 到 8/2」；沒有缺列時「三份檔案涵蓋 6/1 到 8/23，沒有缺列」。<br>資料表每列有「篩選問題表」按鈕，可及名稱帶檔案與通路。<br>`chartRowHeights.axis`＝24。<br>寬度級距：390 版面用 60 欄並把月份刻度減半；768 照設計稿用 64 欄、刻度不減半（審查 A-4） |
| C28 matrix＋G21 問題分布表 | 完成 | `issueDistribution`／`issue-distribution-v1`：列級問題依檔 × 原因計數，範圍級另列一列；格加總＝列級問題筆數。<br>畫法：`HeatMatrix` 是 `heat-table.tsx` 新增的匯出，G11 的輸出逐位元組不變；有問題的格用 heat-1，每檔最多的原因用 heat-2 加不利色框；0 格留白；格內是計數按鈕，可及名稱帶檔案、原因、列數。<br>框：`variant="inline"`、`mode="table"`、h3，放在 `data-issues` 內、問題表之上；沒有任何問題時不渲染（示範資料）。<br>標題：`title.most`「{檔案}：{原因}最多，{n} 列」；只有一格時用 `title.single`，不寫「最多」。<br>390 改成清單；0 格只在視覺上隱藏，所以後面的格對應的欄頭不會錯（審查 A11Y-1） |
| `DataWorkspace` 持有 `issueFilter`；`IssueList` 加選填篩選與清除鈕 | 完成 | 以下操作都會套用篩選並把 `data-issues` 捲進畫面：點 G20 缺列框（滑鼠）、按 G20 資料表的「篩選問題表」（鍵盤）、點 G21 的格。<br>焦點：每次套用都移到 `role="status"` 的篩選片語，同一組條件再按一次也一樣（`filterRequest`，審查 B-2）；片語每次套用都重新掛載，螢幕報讀只念一次（審查 A11Y-2）。<br>清除後回到全部。<br>「下載問題清單 CSV」仍是全部問題，位元組不變。<br>`src/application/issue-filter.ts` 隨 `IssueList` 進首載（匯入精靈也用到） |
| axe 新狀態 | 完成 | 「匯入 `missing_ad_day` 後篩選過的資料來源頁」：desktop、laptop、tablet 各 18 個狀態，mobile 17 個，全部 0。06 寫 17／16，是 V4-6 多加一個狀態之前的數字 |
| 同批 labels 與測試 | 完成 | labels：`data.chartsV4` 新增 41 個 key（含拍板補做的 `yoyBeforeAxisNote`），v4 累計 202 個。<br>新增測試：`chart-coverage.test.ts`、`chart-issues.test.ts`、`charts-data-coverage-v4.test.tsx`、G21 的 SSR 測試、`issue-list-filter-v4.test.tsx`、`e2e/charts-data.spec.ts`（四尺寸 24 條）。<br>擴充：`issue-list-v3`、`data-workspace-v3`、`chart-geometry-v4`（`timelineGeometry`，含 768、450 寬）、`chart-theme`、`mounted-testids`、`axe-sweep`、`keyboard-walk`、`lazy-panels`、`testid-baseline`（只加情境，比對邏輯不變） |

**審查修正**（`41c5b89`）：

- 涵蓋起日到圖的起日之間的銷售無列，寫進資料表後的說明。這是為了讓 D-V4-51（a）A「只寫在說明」與實際行為一致。
- G21 `title.most` 改成「{檔案}：{原因}最多，{n} 列」，避免子句超過 14 字。
- `title.rangeOnly` 改成「只有範圍級問題，{n} 項」。
- `noRowsNote` 在天數大於 1 時的說法。
- 390 清單的欄頭對應。
- 篩選片語重複報讀。
- e2e 斷言清冊的行號。

## 2. 變更檔案

- **新增**：
  - 程式：`src/application/{chart-coverage.ts,chart-issues.ts,issue-filter.ts}`、`src/components/charts/timeline.tsx`、`src/components/data/{coverage-chart.tsx,issues-chart.tsx}`。
  - 測試：上表的新測試。
  - 本文件、`verification/revamp-v4/V4-7a/`。
- **修改**：
  - 程式：`src/components/{workspace-panels.tsx,issue-list.tsx,charts/heat-table.tsx,charts/chart-data-table.tsx}`、`src/application/chart-theme.ts`（`chartRowHeights.axis`）。
  - 樣式與字串：`src/app/globals.css`、`src/i18n/labels.zh-TW.ts`，都只動 V4-7a 錨點內。
  - 測試：見上表。
  - 量測與清單：`verification/revamp-v4-capture/metrics.spec.ts`（B1 資料來源 G20 頂 ≤ 900 硬斷言）、`verification/revamp-v4/{testids-v4-added.txt,feature-retention.csv,e2e-text-assertions.csv}`。
  - 文件：`docs/revamp-v4/{CHART_CATALOG.md,06_BATCHES.md,09_DECISIONS_PENDING.md,00_README.md}`、`docs/{STATUS.md,DECISIONS.md}`。
- **零改動**：
  - 財務禁區：`src/domain`（含 `validation.ts`）、`fixtures`、`docs/METRICS.md`、`src/application/{assist-kpi.ts,breakeven-mer.ts}`。
  - 依賴：`package.json`、`package-lock.json`。
  - 棘輪：上限檔、`tests/copy-density.test.ts`、`labels-v3.flat.json`。

## 3. 驗收命令與真實結果

| 命令 | 結果 |
|---|---|
| `npm ci` | 未執行（lockfile 沒有變動） |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run audit:ui -- --json verification/revamp-v4/V4-7a/ui-audit.json` | design 15 項的上限都沒變；資訊欄有變：靜態 testid 252 → 255、class 869 → 884、TSX 檔 70 → 73 |
| `npm run contrast-check` | 85／85 通過（本批沒有新顏色 token） |
| `npm test -- --run` | 審查修正後 158 檔、3,164 個全過；**拍板補做後（`6cc4c13`）159 檔、3,178 個全過**（V4-6 為 153 檔、3,065 個） |
| `npm run test:e2e`，第二段（`3bacd2d`，四個視窗） | 981 passed、0 failed、15 skipped（30.7 分鐘） |
| 同上，審查修正後（`41c5b89`，帶三個 `*_OUT`） | **985 passed、0 failed、15 skipped（30.8 分鐘）**：新增 24 條（`charts-data` 6 條 × 4 尺寸）；跑完已還原 E2E 改寫的追蹤檔 |
| 同上，最終程式（`6cc4c13`，含拍板補做，帶三個 `*_OUT`） | **985 passed、0 failed、15 skipped（31.2 分鐘）**；axe 18／18／18／17 全 0；keyboard-walk 只有資料來源頁照 D-V4-52 新基準；下載集合（5 種檔名與位元組）與 V4-6 相同；跑完已還原追蹤檔 |
| PUBLIC_DEMO build 與伺服器（3100） | build exit 0；`GET /` 回 200 |
| `CAPTURE_BATCH=V4-7a …`（先複製 V4-6 的 52 張） | 第 1 次 19 passed、4 failed、5 skipped：差異**只有四個尺寸的 09**（允許），其餘 48 張 0 差異 |
| 同上，加 `--update-snapshots=changed`（只跑 baseline）後完整重跑 | **23 passed、5 skipped**；與 V4-6 不同的檔正好是 4 張 09；metrics 硬斷言全部通過（含新的 B1 資料來源 G20 頂） |
| 最終程式（`6cc4c13`）的 PUBLIC_DEMO build 與擷取 | build exit 0；`CAPTURE_BATCH=V4-7a` **23 passed、5 skipped**：52 張與 V4-7a 基準相同（拍板補做不改示範資料畫面）；First Load JS 510,564（多出的 75 bytes 是新字串）；G20 頂 230；資料來源 DOM 1,209 |
| 最終程式單次 Lighthouse（開跑 1 分鐘負載 2.76，結束 4.0；15 分鐘負載 4.46） | 390：載入示範資料 1,234.3、健檢 888.3、商品 109.7、會議 1,102.6、資料來源 26.0；a11y 全 100；`insideTimespans` 空。負載正在升高，與第一組三次同一型態；判定以下方成對對照為準。數值在 `lighthouse-runs/final-code-single-metrics.json` |
| Lighthouse × 3（開跑時 1 分鐘負載 2.81、2.95、2.88；15 分鐘負載 4.5–4.8） | 390 中位數依序為載入示範資料 1,141.3、健檢 861.1、商品 102.1、會議 1,081.0、資料來源 32.7。**前兩項與會議超過門檻**（1,109.1、832.3、1,071.2），這三條路徑本批都沒改；1440 的數字也全面偏高 |
| D-V4-47＝B 同場成對對照，第一組：V4-7a（3100）對 V4-6（`5eb408a`，scratch 建置、3101），正式腳本 3 對，每次開跑時 1 分鐘負載 < 3.0 | 無法判讀。V4-6 自己的中位數就到 1,205.1／904.6，比它驗收時高出 80–120 ms；健檢有一次 1,428.5；同時段 `mediaanalysisd` 吃約 270% CPU。照字面，載入示範資料的成對差平均 ＋10.3、健檢中位數超過門檻 |
| 同上，第二組（正式流程，另抓 trace）：6 對交替，每次開跑時 1 分鐘負載 < 2.5 | **五項都通過**（D-V4-47 第一關：本批中位數 ≤ 門檻）。<br>V4-7a 對 V4-6 的中位數：載入示範資料 1,037.2／1,037.6；健檢 819.8／822.8；商品 87.9／85.7；會議 1,008.8／1,004.2；資料來源 12.2／0。<br>trace 主執行緒長任務的 CPU 時間中位數：載入示範資料 1,235.1／1,237.2 ms；健檢 868.8／872.3 ms，兩版相同。<br>唯一穩定的差異是切到資料來源，6 對都多 4–25 ms，來自新的 G20，仍遠低於 50 ms 門檻。<br>每次的數字在 `lighthouse-ab/set2-*`；這組量的是拍板補做之前的 `41c5b89` build，補做只影響有缺列的資料來源頁與一個新字串 |
| `lsof -ti tcp:3100 \| xargs kill`；`lsof -ti tcp:3100` | 已停，沒有輸出；3101 也已停 |
| 禁區四條命令 | 四條都是空的 |
| commit 之後 `git diff --stat 625bfa5 HEAD -- （禁區與 assist-kpi、breakeven-mer 路徑）` | 空（收尾 commit `cc38958`；程式 commit `5e023c2`、`9e3282c`、`ed7d78a`、`a710afa`、`3bacd2d`、`41c5b89`、`c2c9040`、`12fb918`、`6cc4c13` 之後也是空） |
| 隱藏字元掃描 | 0 |

**棘輪與基準數值**

| 項目 | V4-7a | 與基準相比 |
|---|---|---|
| design-lint 15 項、copy-style、copy-density、chart-lint CL-1–CL-11 | 不變（上限檔沒動；chart-lint 全 0） | 不變 |
| 資料來源頁主層的獨立圖區塊 | 示範資料 1（G20）；有問題時 2（G20、G21） | 符合 06 |
| testid 刪除數（v2、v3、v4 新增） | 0、0、0；`testids-v4-added.txt` 新增 17 列（含拍板補做的合成框 3 列），累計 308 列 | — |
| labels 快照 | 2,581 個鍵逐字相同；本批新 key 41 個，都在 `data.chartsV4` | — |
| First Load JS gzip（B5） | **510,564 bytes**（最終程式；V4-6 為 508,934，＋1,630，主要是 `issue-filter.ts` 隨 `IssueList` 進首載）；門檻 545,397，**剩 34,833** | 通過 |
| B1 資料來源 G20 頂 | 1440 為 230（≤ 900，本批起硬斷言）；1280 為 230；390 為 232；`data-issues` 頂 601.2（1440） | 通過 |
| B9 資料來源 DOM 節點數 | 1,209（1440、1280）、1,206（390）；V4-6 為 1,152 | 通過 |
| B2、B3，其他頁的 B1、B9 | 與 V4-6 相同 | 不變 |
| axe 四尺寸 | 18／18／18／17 個狀態，serious、critical、moderate、minor 都是 0 | 通過 |
| keyboard-walk | 資料來源頁新增里程碑「涵蓋時間軸資料表 summary」：1440 第 10 步、390 第 4 步，不晚於 V4-0a。<br>「問題表或範圍列表」1440 由 10 變 11、390 由 4 變 5：多出的一步是 G20 的資料表 summary，依 D-V4-52＝A 以 11／5 為新基準。<br>其他頁與 V4-6 逐項相同；`aria-hidden` 內的停留點 0 | 符合 D-V4-52＝A 的新基準 |
| network-log | 下載集合的 5 種檔名與 `checks` 都與 V4-6 相同；desktop 的 xlsx 22,912 對 22,913 bytes，是 zip 時間欄位每次執行都會有的 1 byte 差（V4-4 起就記錄過） | 不變 |
| 功能保留表 | `batch`＝V4-7a 的 4 列（53、G20、G21、MV3）全部打勾 | 完成 |

**畫面基準差異（只列允許變動的畫面）**

| 畫面 | 尺寸 | 變化 | 理由 |
|---|---|---|---|
| 09 資料來源 | desktop、laptop、tablet、mobile | 頁面變長，例如 390 從 2,471 變成 2,864px | 狀態一行之下多了 G20 涵蓋時間軸。示範資料沒有缺列，標題是「三份檔案涵蓋 6/1 到 8/23，沒有缺列」，三軌整條有列，有上期、本期區帶；示範資料沒有問題，所以 G21 不渲染 |

## 4. 瀏覽器驗收方式與截圖

- **截圖**：`verification/revamp-v4/V4-7a/snapshots/{desktop,laptop,tablet,mobile}/`，各 13 張。本批的變化看 `*/09-data.png`。
- **合成資料（有缺列、有問題）的目視檢查**：主流程寫了一個暫時的 spec 截圖，截完即刪，沒有提交。
  - 1440：G20 標題「通路費用缺 9/14 到 9/19 共 6 天（LIVE）」；兩期內的缺列框位置正確；右端標「缺 6 天」「缺 5 天」。
  - 1440：G21 標題「通路費用：缺費用列最多，6 列」，兩格各自加框。
  - 390：G20 只在 390 減半月份刻度；G21 改成清單。
- **篩選流程**：由 `charts-data.spec.ts` 在四個尺寸斷言。
  - 匯入 `missing_ad_day` 後點 `chart-data-coverage-seg-ads-MARKETPLACE-2026-08-02`：問題表只剩該檔、該通路、該原因的列；`data-issues` 進入可視範圍；篩選片語可見且取得焦點；按清除後回到全部。
  - 合成資料的缺費用列區段同樣可以篩選。
  - 鍵盤從 G20 資料表的按鈕操作，焦點會到篩選片語。
  - 篩選後下載的 CSV 不變。
- **方式**：截圖用本機 production build 的 PUBLIC_DEMO 伺服器，`toHaveScreenshot`（0 像素差、threshold 0.02）；E2E 四個視窗都用 LOCAL 伺服器。
- **量測檔**：`verification/revamp-v4/V4-7a/` 下的 `metrics.json`、`first-load-modules.json`、`ui-audit.json`、`axe.json`、`keyboard-walk.json`、`network-log.json`、`lighthouse/`、`lighthouse-runs/`、`lighthouse-ab/`。

## 5. 已知限制與風險

- **拍板補做（使用者 2026-10-12 回覆「都依你的建議」）**：
  - D-V4-51（a）＝A：上期之前的銷售無列只寫在資料表後的說明。
  - D-V4-51（b）＝B：同一檔多個通路的缺列日期重疊時，合成一個框，testid 的通路段寫 `all`，點下去篩「該檔＋該原因」；資料表照列每個通路。
  - D-V4-52＝A：資料來源頁鍵盤里程碑以 11／5 為新基準。
  - D-V4-53＝B：去年同期期間內的缺列不延伸軸，資料表照列，表後加說明。實作時另外解讀了三件事，09 已註明不屬使用者另外核准的內容：
    - 只有部分落在去年同期內的區段，怎麼延伸軸。
    - 軌右端的「缺 n 天」只算軸上的日子。
    - 標題的最長區段，只從至少有一部分在軸上的區段裡取。
  - D-V4-54＝A：PRD §5.7 第 3 列改寫成 G21 在問題表工具列之上。
- **First Load JS 多 1,630 bytes**：剩 34,833 bytes。
- **390 TBT 漂移**：見 §3 與 D-V4-47。
- **人工關卡**：H6、PPT spike 的人工開檔都未執行。

## 6. 下一步、人工關卡與待拍板

- **拍板**：D-V4-51–54 都已拍板並補做，沒有待拍板事項。
- **下一批**：V4-7b 匯入精靈與抽屜（G22：精靈步驟 4 對帳表與資料來源前處理表的內嵌條；G23：抽屜階梯表的 share 條；`ladderMetrics` 搬到 `src/application/evidence-ladder.ts`；允許變動畫面 03、12）。
- **部署**：本批沒有部署；preview 部署仍需使用者當次明確同意。
