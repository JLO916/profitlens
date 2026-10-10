# Revamp v4 V4-6 驗收：會議紀錄（G15 會議實例、G19）（2026-10-10）

依 `docs/revamp-v4/06_BATCHES.md`「V4-6 會議紀錄」、`docs/revamp-v4/CHART_CATALOG.md` 的 G15（會議部分）、G18（取消）與 G19 實作卡、PRD §4.4–§4.7、§6.3（C25、C26、ChartFrame `variant`、`headingLevel`）、§8.7 例外。依賴：V4-5。允許變動畫面：08（會議）。

開工前先補做 V4-5 的 D-V4-46＝B（`abfd933`，見 V4-5 驗收 §7）。

**工作方式**：

1. **開工錨點**（`6142950`）：labels 加 `meeting.chartsV4`，CSS 加 V4-6 A、B 兩個錨點。
2. **第一段**：代理 A 做 G19，代理 B 做 G15 會議實例，兩人各在一個 worktree 平行進行，各配一位對抗審查。
   - commit：`9b6a596`、`58e14f7`、`1523f74`；合併成 `f6210d5`。合併時有四個檔是相鄰行衝突，取兩邊聯集。
   - 審查 A 的修正 commit 在另一個分支，一併合入。
3. **第二段**：代理 C 修第一段留下的 2 項、補齊 E2E 與各項基準（`b28c549`）。接著四尺寸完整 E2E 與三位唯讀審查同時跑。
   - 共 14 項發現（含重複）：修 13 項（`c2d20e3`）；需要拍板的 1 項寫進 D-V4-49、D-V4-50（`bc22fd4`）。
4. **主流程在最終程式上完整驗收**：見本文件。

## 1. 完成項目（對照 06_BATCHES V4-6）

| 項目 | 狀態 | 說明 |
|---|---|---|
| `meetingSeries`／`meeting-series-v1` | 完成 | 在 `src/application/chart-meeting.ts`。<br>- 排序：先依會議日期，再依結束時間。<br>- 斷段：資料集或通路集合改變時標「不同資料集」；本期天數或比較方式改變時標「期間不同」。<br>- 去重：本期起訖相同的會議只留最晚結束的一次，省略的次數計入說明。<br>- 上限 100 筆；少於 2 筆時回傳空。<br>- 值直接取凍結的 `agenda.kpis[].current`，不重算。<br>- 斷段與去重目前照 CHART_CATALOG 字面實作，相關解讀待拍板 D-V4-48、49 |
| G19 會議歷史小倍數 | 完成 | 在 `src/components/meeting/history-chart.tsx`，用 C26 inline SVG，沒有用 Recharts（理由同 V4-3b 的 G12，已在 CHART_CATALOG 補記）。<br>- 圖：淨營收、扣廣告後貢獻兩張，各自的軸都含 0、刻度是整數萬；X 軸標資料本期（M/D–M/D）。<br>- 線與點：線用 `chartColors.total`；斷段處不連線，間隙標原因；最後一點 3px 實心並標值；任何點都不用 `chartColors.current`。<br>- 框：`variant="inline"`，所以 `.panel` 裡不會再套 `.panel`；標題 h3（在會議歷史的 h2 之下）。390 時單欄兩張，框高 sm × 2；歷史少於 2 筆（包括 0 筆）時顯示等高空狀態。<br>- 資料表：純文字；空狀態時只有一句說明，不放與實際不符的省略說明。<br>- 不可點。投影模式沿用 v3，整個會議歷史隱藏 |
| G15 會議實例（議程 5） | 完成 | 在 `src/components/meeting/scenarios-chart.tsx`，放在 `meeting-scenario-results` 之前。<br>- 柱：RankedBars variance row24；每通路一根，最多 6 根。其餘只列在資料表，「另 n 個」與軸文字「各通路現況」共用最後一列（C25 新增 `axisWithMore`）。<br>- 標題「{n} 個通路的選入方案」：不寫方案名，不跨通路挑最大值或相加。<br>- 較早（過期）的方案：不畫柱，只列在資料表，用語沿用同頁 v3 的「較早的方案（不列入這次決議）」（D-V4-50）。<br>- 沒有選入方案時顯示等高空狀態，會議頁主層圖區塊固定是 2。<br>- 框：`variant="inline"`，標題 h4（在議程 h3 之下）。<br>- 不可點。投影時隱藏，因為投影只顯示議程 1、2 |
| G18 | 取消（PRD §2.3） | `meeting-compare-kpis` 與 v3 相同，沒有新 testid |
| 同批 labels 與測試 | 完成 | labels：`meeting.chartsV4` 新增 32 個 key；連同 V4-5 補做的 1 個，v4 累計 160 個。<br>新增測試：`chart-meeting.test.ts`、`charts-meeting-g19.test.tsx`、`charts-meeting-scenarios-v4.test.tsx`、`e2e/charts-meeting.spec.ts`（含已畫出 G19 時的 axe）。<br>擴充測試：`meeting-page.test.tsx`、`meeting-page-v3.test.tsx`、`mounted-testids`（V4-6 M1；多筆歷史時 v3 列模板的重複次數以 `V4_6_REPEATED_V3_ROWS` 逐一列出，`INSTANCE_CONTAINER` 不改）、`axe-sweep`（新狀態「會議頁有歷史與選入方案」）、`lazy-panels`（會議專用模組不進首載）。<br>新 fixture：G12、試算頁 G15、商品頁輸出各存一份，比對逐位元組不變 |

## 2. 變更檔案

- 新增：
  - 程式：`src/application/chart-meeting.ts`、`src/components/meeting/{history-chart.tsx,scenarios-chart.tsx}`。
  - 測試：上表的新測試、`tests/helpers/{meeting-history.ts,seven-channel-meeting.ts,small-multiples-baseline.tsx,scenarios-variance-baseline.tsx}`、`tests/fixtures/{small-multiples-v4-5.json,scenarios-variance-v4-5.json}`。
  - 本文件、`verification/revamp-v4/V4-6/`。
- 修改：
  - 程式：`src/components/{meeting-page.tsx,charts/small-multiples.tsx,charts/ranked-bars.tsx,scenarios/variance-chart.tsx}`。其中 `variance-chart.tsx` 只是把私有的 `toneOf` 匯出為 `varianceBarTone`。
  - 樣式與字串：`src/app/globals.css`、`src/i18n/labels.zh-TW.ts`，都只改 V4-6 錨點內。
  - 測試：`tests/{meeting-page.test.tsx,meeting-page-v3.test.tsx,mounted-testids.test.tsx,lazy-panels.test.tsx}`、`tests/helpers/page-states.tsx`、`tests/e2e/axe-sweep.spec.ts`。
  - 驗收清單：`verification/revamp-v4/{testids-v4-added.txt,feature-retention.csv,e2e-text-assertions.csv}`。
  - 文件：`docs/revamp-v4/{CHART_CATALOG.md,06_BATCHES.md,09_DECISIONS_PENDING.md,00_README.md}`、`docs/{STATUS.md,DECISIONS.md}`。
- 零改動：
  - 財務禁區：`src/domain`、`fixtures`、`docs/METRICS.md`、`src/application/{assist-kpi.ts,breakeven-mer.ts}`。
  - 會議邏輯、備份與匯出：`src/application/{meeting.ts,manager-summary.ts,review-session.ts,workspace-backup.ts,excel-export.ts,pptx-export.ts}`。
  - 依賴：`package.json`、`package-lock.json`。
  - 棘輪：上限檔、`tests/copy-density.test.ts`、`labels-v3.flat.json`。

## 3. 驗收命令與真實結果

| 命令 | 結果 |
|---|---|
| `npm ci` | 未執行（lockfile 沒有變動） |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run audit:ui -- --json verification/revamp-v4/V4-6/ui-audit.json` | design 15 項與 V4-5 相同。只有資訊欄變動：class 865 → 869、TSX 檔 68 → 70 |
| `npm run contrast-check` | 85／85 通過 |
| `npm test -- --run` | **153 檔、3,062 個測試全過**（V4-5 是 150 檔、3,007 個） |
| `npm run test:e2e`（第二段 `b28c549`，四個視窗） | 961 passed、0 failed、15 skipped（29.4 分鐘） |
| 同上（最終程式 `bc22fd4`，帶三個 `*_OUT`） | **961 passed、0 failed、15 skipped（36.6 分鐘）**。新增 8 條：`charts-meeting` 2 條 × 4 個尺寸。跑完已還原 E2E 改寫的追蹤檔 |
| PUBLIC_DEMO build 與伺服器（3100） | exit 0；`GET /` 回 200 |
| `CAPTURE_BATCH=V4-6 …`（先複製 V4-5 的 52 張） | 第 1 次：19 passed、4 failed、5 skipped。差異**只有四個尺寸的 08**（允許），其餘 48 張 0 差異 |
| 加 `--update-snapshots=changed`，只跑 baseline | 重寫的正好是 4 張 08 |
| 完整重跑 | **23 passed、5 skipped**。與 V4-5 不同的檔正好是 4 張 08；metrics 硬斷言全部通過 |
| Lighthouse × 3（1 分鐘負載 2.77、2.96、2.95） | **390 的五項 TBT 都通過**（見下表）。第 3 次的完整報告在 `verification/revamp-v4/V4-6/lighthouse/`，三次的數值在 `lighthouse-runs/` 與 `metrics.json` |
| `lsof -ti tcp:3100 \| xargs kill`；`lsof -ti tcp:3100` | 已停，沒有輸出 |
| 禁區四條命令 | 四條都是空的 |
| commit 之後 `git diff --stat 625bfa5 HEAD -- （禁區與 assist-kpi、breakeven-mer 路徑）` | 空（收尾 commit `eccce1a`；程式 commit `9b6a596`、`58e14f7`、`1523f74`、`b28c549`、`c2d20e3` 之後也是空） |
| 隱藏字元掃描 | 0 |

**棘輪與基準數值**

| 項目 | V4-6 | 與基準 |
|---|---|---|
| design-lint 15 項、copy-style、copy-density、chart-lint CL-1–CL-11 | 不變（上限檔沒動；chart-lint 全 0） | 不變 |
| 會議頁主層獨立圖區塊 | 2（G15 會議實例、G19），所有會議狀態都是 | 符合 06 |
| testid 刪除數（v2、v3、v4 新增） | 0、0、0；`testids-v4-added.txt` 新增 11 列，累計 291 列 | — |
| labels 快照 | 2,581 個鍵逐字相同；本批新 key 32 個，都在 `meeting.chartsV4` | — |
| First Load JS gzip（B5） | **508,934 bytes**（V4-5 為 507,258，＋1,676：新 labels 在首載的 labels chunk；會議專用的圖表模組在隨頁 chunk）；門檻 545,397，**剩 36,463** | 通過 |
| B9 會議頁 DOM 節點數 | 1,063（三個尺寸；V4-5 為 1,021；門檻 V4-0a＋1,500） | 通過 |
| B1、B2、B3、其他頁 B9 | 與 V4-5 相同 | 不變 |
| Lighthouse Accessibility | 1440、390 各 8 頁，三次全部 100 | 不變 |
| Lighthouse Performance（空狀態首頁） | 1440 為 100；390 為 95、95、97 | ≥ 90 |
| 390 TBT 中位數（ms，低負載三次） | 載入示範資料 1,085.4（≤ 1,109.1）<br>通路健檢 821.7（≤ 832.3）<br>商品毛利 85.7（≤ 129.9）<br>**會議紀錄 987.6**（≤ 1,071.2；三次 1,004.5／980.4／987.6；V4-5 正式腳本 1,011.7）<br>資料來源 4.2（≤ 50.0） | 五項通過（不需要 D-V4-47 的同場對照） |
| 預先載入 | 三次的 `insideTimespans` 都是空的 | 不在量測區間內 |
| axe 四尺寸 | 17／17／17／16 個狀態，serious、critical、moderate、minor 都是 0；新狀態 `page-meeting-history-scenarios` | 通過 |
| keyboard-walk | 會議里程碑「議程 1」不變（1440 第 26、390 第 19）；會議頁 main 內的停留點 47 → 49、40 → 42，多的 2 個是 G15、G19 資料表的 summary；其他頁與 V4-5 逐項相同；`aria-hidden` 內停留點 0 | 通過 |
| network-log | 下載集合（5 種檔名與位元組）和 `checks` 都與 V4-5 相同。desktop 請求數 21 → 24，多的都是同源 `GET /_next/static/chunks/*.js`：這次預先載入剛好落在匯入步驟 | 下載不變 |
| 功能保留表 | `batch` 為 V4-6 的 6 列（44、44a、47、48、G15m、G19）全部打勾 | 完成 |

**畫面基準差異（只列允許變動的畫面）**

| 畫面 | 尺寸 | 變化 | 理由 |
|---|---|---|---|
| 08 會議 | desktop、laptop、tablet、mobile | 頁面變長（desktop 2,509 → 約 3,132px） | 議程 5 在每通路選擇欄之前多了 G15 會議實例的等高空狀態（示範資料沒有選入方案）；會議歷史在 v3 空狀態區塊之後多了 G19 的等高空狀態（示範資料沒有會議歷史）。兩處文字與 v3 區塊互補，不重複 |

## 4. 瀏覽器驗收方式與截圖

- **截圖**：在 `verification/revamp-v4/V4-6/snapshots/{desktop,laptop,tablet,mobile}/`，每個尺寸 13 張。看本批變化請看 `*/08-meeting.png`。
- **有資料時的畫面**：由 `charts-meeting.spec.ts` 在四個尺寸斷言，包括：
  - 結束兩次同期間的會議後，G19 畫出兩點並連線。
  - 第三次期間不同時斷開，標「期間不同」，資料表那一列寫「否，期間不同」。
  - G15 在議程 5、只有一根柱，顏色是 favorable 而不是 current，條端文字等於 `formatSignedDelta`。
  - 投影時議程 5 與會議歷史隱藏。
  - 已畫出的 G19 跑 axe，serious 0。
- **方式**：
  - 截圖：本機 production build、PUBLIC_DEMO 伺服器，用 `toHaveScreenshot`（0 像素差、threshold 0.02）。
  - E2E：四個視窗都用 LOCAL 伺服器。
- **量測檔**：
  - `verification/revamp-v4/V4-6/` 下的 `metrics.json`、`first-load-modules.json`、`ui-audit.json`、`axe.json`、`keyboard-walk.json`、`network-log.json`。
  - 同一目錄的 `lighthouse/`、`lighthouse-runs/`。

## 5. 已知限制與風險

- **G19 的三項規則待拍板，目前照 CHART_CATALOG 字面**：
  - **D-V4-48（a）整月對比的斷段**：照字面依本期天數斷段。相鄰兩個月天數不同就會斷開（例如 8 月接 9 月、9 月接 10 月），天數相同則連起來（例如 7 月接 8 月），所以月會的線忽斷忽連。
  - **D-V4-48（b）同本期去重**：只看本期起訖，資料集或通路不同的會議也會被當成重複省略。
  - **D-V4-49**：（a）會議順序依會議日期；（b）只換通路時，間隙也標「不同資料集」。
- **G15 會議實例的兩項選擇待拍板（D-V4-50）**：
  - （a）較早的方案沿用同頁 v3 的「較早的方案（不列入這次決議）」，沒有照 CHART_CATALOG 寫「過期」。
  - （b）標題的 {n} 只算畫出來的方案。
- **示範資料的會議頁有兩個空狀態框**：議程 5 與會議歷史各一個，各為 180px，390 時會議歷史為 360px。這是依規格「等高空狀態」與「主層 2 個圖區塊」做的，畫面變長約 300px。
- **v3 既有的無障礙問題**：對議程 1 做整頁 axe 時，若本期是自訂期間或週，議程 1 的 `.meeting-kpi-change` number-link 有 serious target-size 違規，從 625bfa5 起就有，與 V4-6 無關。代理已另開背景任務（task_50917ce0），本批的 axe 只掃會議歷史區塊；`axe-sweep` 的預設期間狀態不受影響。
- **會議切頁 TBT**：餘裕約 84ms（987.6／1,071.2）。之後在會議頁加內容要先量。
- **人工關卡**：H6 與 PPT spike 的人工開檔都未執行。

## 6. 下一步、人工關卡與待拍板

- **待拍板**：
  - D-V4-48：建議（a）B、（b）B。
  - D-V4-49：建議（a）A、（b）C。
  - D-V4-50：建議（a）B、（b）A。
  - 回覆 B 或 C 的項目，會在 V4-7a 開工前補做；只改 `chart-meeting.ts`、`scenarios-chart.tsx`、字串與測試，不影響畫面 08，因為示範資料沒有會議歷史，也沒有選入方案。
- **下一批**：V4-7a 資料來源（G20、G21、問題表篩選；依賴 D-V4-40，已拍板）。
- **部署**：本批沒有部署。preview 部署仍需使用者當次明確同意。
