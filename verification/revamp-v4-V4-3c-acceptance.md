# Revamp v4 V4-3c 驗收：首載瘦身（不改畫面）（2026-10-09）

依 `docs/revamp-v4/06_BATCHES.md`「V4-3c 首載瘦身」（D-V4-42＝A，使用者 2026-10-09 回覆「A」；開工錨點 `a13fb2a`）。依賴：V4-3b。允許變動畫面：無。

工作方式：開工錨點 `a13fb2a`（06 加範圍與批次表列、09／DECISIONS／STATUS／README 記 D-V4-42＝A）→ 實作 `dd73391`（一個代理直接在 `revamp/v4` 上做，量 First Load JS 與一次 Lighthouse）→ 同時跑兩件事：完整 E2E（四個視窗，909／0 失敗）和兩個唯讀的對抗審查（執行期行為、護欄與測試）→ 審查修正 `24f2997`（12 項：9 項修正、1 項駁回、2 項待拍板或屬收尾）→ 主流程在最終程式上跑完整驗收（本文件）。

## 1. 完成項目（對照 06_BATCHES V4-3c）

| 項目 | 狀態 | 說明 |
|---|---|---|
| 1. 匯出程式按下時載入 | 完成 | `dashboard.tsx` 的 Excel、PPT、決策工作稿（md／csv／json），`meeting-page.tsx` 的 Excel、PPT 都改成 `await import()`；`export-menu.tsx` 打開下載選單時改用 `import("@/application/excel-export").then(m => m.preloadExcelWriter())` 預熱。載入失敗與產生失敗走同一個錯誤路徑。`ActionsWorkbench`、`DecisionWorkbench`、`ExportMenu` 的 `onExport`／`onDecision` 可以回傳 promise：resolve 後才顯示「已匯出」，reject 時顯示原本的失敗通知，或交給 `reportError`。匯出檔位元組不變（network-log 的 5 種下載與 V4-3b 逐位元組相同） |
| 2. 六個面板隨頁載入 | 完成 | 新檔 `src/components/lazy-panels.tsx` 匯出同名包裝元件 `Diagnosis`、`DataWorkspace`、`AiPanel`、`MeetingPage`、`ProductComparisonPanel`、`ActionsWorkbench`，各自帶 `Suspense`（fallback 為空）。JSX 一字未動，下面四個測試照舊通過：`mounted-testids`、`empty-states-v3`、`product-page-v3`、`period-bar` 的原始碼比對。<br>`MeetingEntry`、`currentViewDecisionContext`、`downloadMeetingMarkdown` 原樣搬到 `src/components/meeting-entry.tsx`，`meeting-page.tsx` 再匯出。<br>`MultiScenarioWorkbench`、`ImportWizard`、`EvidenceDrawer`、`Overview` 不動 |
| 3. 預先載入 | 完成 | 資料第一次就緒（ready／partial）後等 2,000 ms（`PANEL_PRELOAD_DELAY_MS`），在閒置時（`requestIdleCallback`，timeout 1,000 ms；沒有時用 `setTimeout`）同時 `import()` 各頁 chunk 與決策匯出程式，共 7 個 chunk。只跑一次，effect cleanup 會取消。<br>Lighthouse 三次量測（390）：預先載入在「載入示範資料」量測區間結束後 1.85–1.89 s 開始，在「切到通路健檢」區間開始前 0.41–0.42 s 結束，`insideTimespans` 三次都是空的 |
| 4. 單元測試 | 完成 | 新增 `tests/lazy-panels.test.tsx`、`tests/export-promise-v43c.test.tsx`。<br>`lazy-panels.test.tsx` 從 `src/app/page.tsx`、`layout.tsx` 用 TypeScript parser 走靜態 import 圖（含多行 import 與再匯出），斷言拆出的模組都走不到。改回靜態 import 時這個測試會失敗（已做過突變檢查）。<br>`meeting-page.test.tsx` 的兩個匯出測試加 `vi.waitFor`，等動態 import 完成，斷言不變 |
| 驗收重點：首頁腳本不含拆出的 chunk | 完成 | `metrics.spec` B5 加 `SPLIT_SENTINELS`：`"diagnosis-panel"`、`"data-status-line"`、`"product-table"`、`"meeting-outputs"`、`"actions-workbench"`、`"ai-panel"`、`book_new`、`PptxGenJS`，在首載腳本中都必須是 0。實測全部 0。首頁腳本清單寫在 `first-load-modules.json` |

**超出原範圍的改動**：審查修正時加的，全部不改畫面。其中第 1 項待使用者確認，見 D-V4-44。

1. `dashboard.tsx` 不只改 import 行。`useState` 改成 `[panel, showPanel]`，另外包一層 `setPanel`：有資料、目標頁的 chunk 又還沒載入時，先等 `preparePanel()`（`Promise.allSettled`）再切頁。這樣導覽標示和頁面內容在同一次更新裡換，不會先閃一頁空白。連續切頁時只有最後一次生效。
   - 等待中：再按「加入待辦」不會重複新增（`pendingPanel`）。
   - 切頁落地時：關掉等待期間打開的「計算與來源」抽屜。
   - 開匯入精靈（`setPanel("data", true)`）不必等。
   - 沒有 JSX 改動，沒有 `startTransition`。
2. 另外搬了兩個小函式，原模組都再匯出：
   - `toneClass` 搬到 `src/components/tone-class.ts`；
   - `diagnosisCounts` 搬到 `src/components/diagnosis-counts.ts`。

   原本 `decision-workbench`、`shell-frame` 為了這兩個函式，把主管摘要、健檢清單整包拉進首載。沒搬這兩個時只省 28,627 bytes。
3. chunk 載入失敗時，該頁先空白，不擲錯（`recoveringPanel`）。之後同一個 chunk 載入成功（再按一次這一頁，或預先載入完成），就地換成真正的面板。
4. `scripts/lighthouse-pages.mjs` 每次都記錄 `lighthouse.lazyChunks`：各量測區間的時間窗、chunk 請求時間，以及 `insideTimespans`。
5. 兩支「零網路」E2E（`import.spec`、`scenarios.spec`）只放行同源的 `GET /_next/static/chunks/*.js`。
   - 限制：必須是這次建置真的產生的檔、每個檔最多載入一次、總數 ≤ 12；匯入精靈讀檔期間一個都不放行；每筆都記到測試 annotation。
   - 其他請求照舊攔下，並斷言為 0。
   - 這項放寬列為待拍板 **D-V4-43**。

## 2. 變更檔案

- 新增：
  - `src/components/lazy-panels.tsx`、`src/components/meeting-entry.tsx`、`src/components/tone-class.ts`、`src/components/diagnosis-counts.ts`
  - `tests/lazy-panels.test.tsx`、`tests/export-promise-v43c.test.tsx`、`tests/e2e/lazy-panels-v43c.spec.ts`、`tests/e2e/lazy-chunk-helpers-v43c.ts`
  - 本文件、`verification/revamp-v4/V4-3c/`
- 修改：
  - `src/components/{dashboard.tsx,meeting-page.tsx,actions-workbench.tsx,decision-workbench.tsx,multi-scenario-workbench.tsx,manager-summary.tsx,diagnosis-list.tsx,product-comparison-panel.tsx}`、`src/components/shell/{export-menu.tsx,shell-frame.tsx}`
  - `tests/meeting-page.test.tsx`、`tests/e2e/{import.spec.ts,scenarios.spec.ts}`
  - `verification/revamp-v4-capture/metrics.spec.ts`、`scripts/lighthouse-pages.mjs`
  - `verification/revamp-v4/feature-retention.csv`（新增 LZ1–LZ3）
  - `docs/revamp-v4/{06_BATCHES.md,09_DECISIONS_PENDING.md,00_README.md}`、`docs/{STATUS.md,DECISIONS.md}`
- 零改動：
  - 財務禁區：`src/domain`、`fixtures`、`docs/METRICS.md`、`src/application/{assist-kpi.ts,breakeven-mer.ts}`
  - 依賴與部署設定：`package.json`、`package-lock.json`、`.env*`、`vercel.json`
  - 標籤與基準清單：`src/i18n`、`tests/fixtures`（棘輪上限）、`tests/copy-density.test.ts`、`verification/revamp-v4/{testids-v4-added.txt,labels-v3.flat.json}`

## 3. 驗收命令與真實結果

| 命令 | 結果 |
|---|---|
| `npm ci` | 未執行（lockfile 沒有變動） |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run audit:ui -- --json verification/revamp-v4/V4-3c/ui-audit.json` | 與 V4-3b 只差 `filesScanned.tsx` 61 → 63。其餘不變：design 15 項（hex 0、圓角 4、字級 11、字距 0、箭頭 3）、labels 同義詞 12、靜態 testid 252 |
| `npm run contrast-check` | 85／85 通過 |
| `npm test -- --run` | **143 檔／2,817 測試全過**（V4-3b 141／2,793） |
| `npm run build` | exit 0 |
| `npm run test:e2e`（修正前 `dd73391`，四個視窗） | 909 passed、0 failed、15 skipped（27.6m） |
| 同上（最終程式 `24f2997`，帶三個 `*_OUT`） | **929 passed、0 failed、15 skipped（27.4m）**：新增 20 條（`lazy-panels-v43c` 5 條 × 4 尺寸）。跑完已還原 E2E 改寫的追蹤檔 |
| PUBLIC_DEMO build 與伺服器（3100） | exit 0；`GET /` 200 |
| `CAPTURE_BATCH=V4-3c …`（先複製 V4-3b 的 52 張） | **23 passed、5 skipped，52 張全部 0 差異**（沒有更新任何基準；`snapshots/` 與 V4-3b 逐檔相同）。metrics 的硬斷言全部通過 |
| Lighthouse × 3（1 分鐘負載 2.95、2.41、2.97） | 390 的五項 TBT 都通過（見下表）。第 3 次的完整報告在 `verification/revamp-v4/V4-3c/lighthouse/`，三次的數值在 `lighthouse-runs/` 與 `metrics.json` |
| `lsof -ti tcp:3100 \| xargs kill`；`lsof -ti tcp:3100` | 已停，沒有輸出 |
| 禁區四條命令 | 四條都空 |
| commit 之後 `git diff --stat 625bfa5 HEAD -- （禁區與 assist-kpi、breakeven-mer 路徑）` | 見文末（收尾 commit 之後補記） |
| 隱藏字元掃描（`a13fb2a..HEAD`） | 0 |

**棘輪與基準數值**

| 項目 | V4-3c | 與基準 |
|---|---|---|
| design-lint 15 項、copy-style、copy-density、chart-lint CL-1–CL-11 | 不變（上限檔沒動；chart-lint 全 0） | 不變 |
| testid 刪除數（v2、v3、v4 新增） | 0、0、0。本批沒有新 testid，`testids-v4-added.txt` 不動，仍 240 列 | — |
| labels 快照 | 2,581 個鍵逐字相同；`src/i18n` 零改動 | — |
| **First Load JS gzip（B5）** | **499,443 bytes**（V4-3b 537,331，**−37,888**；門檻 545,397，**剩 45,954**）。首頁 6 支 modern 腳本，`app/page-*.js` 從 247,441 降到 208,302。禁用符號 0，拆出哨兵 0 | 通過 |
| 拆出的非同步 chunk（`dd73391` 建置量測，gzip） | 健檢與資料來源 18,216＋3,822（同一次 import）、會議 11,436、待辦 7,286、excel-export 6,786、商品 6,065、pptx-export 4,687、AI 面板 3,811、決策匯出 1,213 | — |
| B1、B2、B3、B8、B9 | 與 V4-3b 逐項相同（metrics.json 除了 First Load JS 之外 0 差異） | 不變 |
| Lighthouse Accessibility | 1440、390 各 8 頁，三次全部 100 | 不變 |
| Lighthouse Performance（空狀態首頁） | 1440 100；390 95（三次 95、94、95；V4-3b 94）；390 首頁 TBT 中位數 144（V4-3b 163） | ≥ 90 |
| 390 TBT 中位數（ms，低負載三次） | 載入示範資料 **1,082.1** ≤ 1,109.1（三次 1,082.1／1,081.5／1,087.5）<br>通路健檢 **804.6** ≤ 832.3（787.6／804.6／818.1；V4-3b 815.4）<br>商品毛利 83.1 ≤ 129.9<br>會議紀錄 1,005.1 ≤ 1,071.2<br>資料來源 0 ≤ 50.0 | 五項通過 |
| 預先載入的時間點（390，三次） | 「載入示範資料」區間結束後 1,854／1,893／1,865 ms 開始。7 個 chunk 在 6–8 ms 內載完，比「切到通路健檢」區間早 416／409／422 ms。1440 早 72–77 ms。三次的 `insideTimespans` 都是空的 | 不在任何量測區間內 |
| CLS | 與 V4-3b 相同（390：商品、資料來源 0.054、待辦 0.053；這三個值 V4-3b 就有） | 不變 |
| axe 四尺寸 | 14／14／14／13 個狀態。serious、critical、moderate、minor 都是 0。每個狀態的 DOM 摘要都與 V4-3b 逐項相同（例如 desktop 健檢頁 focusable 169） | 不變 |
| keyboard-walk | 與 V4-3b 逐項相同：里程碑 Tab 數、停留點、Esc 與只用鍵盤的流程。`aria-hidden` 內的停留點 0 | 不變 |
| network-log | desktop、mobile 的下載集合（5 種檔名與位元組）、`checks`、`non_network` 都與 V4-3b 相同。請求數 15 → 21，多出的 6 個都是同源 `GET /_next/static/chunks/*.js`。外部來源 0、非 GET 0、CSV 內容外洩 0、失敗資源 0、console 錯誤 0 | 下載不變 |
| 功能保留表 | `batch`＝V4-3c 的 3 列（LZ1–LZ3）全部打勾 | 完成 |

**畫面基準差異**：無（本批不允許變動畫面；52 張都是 0 差異）。

## 4. 瀏覽器驗收方式與截圖

- **截圖**：`verification/revamp-v4/V4-3c/snapshots/{desktop,laptop,tablet,mobile}/`，各 13 張，與 V4-3b 逐檔相同。
- **畫面比對**：本機 production build、PUBLIC_DEMO 伺服器，用 `toHaveScreenshot`（0 像素差、threshold 0.02）。
- **E2E**：四個視窗都用 LOCAL 伺服器。`lazy-panels-v43c.spec.ts` 把頁面載入後的 chunk 全部扣住或讓它失敗，再驗下面五件事：
  1. 等待中按「加入待辦」不會重複新增；
  2. 等待中打開的抽屜，切頁落地時關掉，焦點在 main；
  3. 開匯入精靈不必等；
  4. chunk 載入失敗後，恢復連線再按一次同一頁，內容就出現；
  5. 預先載入完成後離線，仍能從下載選單匯出決策 JSON。
- **量測檔**：`verification/revamp-v4/V4-3c/` 下的 `metrics.json`、`first-load-modules.json`、`ui-audit.json`、`axe.json`、`keyboard-walk.json`、`network-log.json`，以及 `lighthouse/`、`lighthouse-runs/`。

## 5. 已知限制與風險

- **兩支零網路 E2E 已放寬，待拍板 D-V4-43**：`import.spec`、`scenarios.spec` 原本斷言「任何 HTTP 請求都是 0」，現在放行建置產生的程式 chunk（限制見 §1 第 5 項）。資料不外送仍由 `network-log.spec` 驗證，本批結果與 V4-3b 相同。建議 A：維持放寬，並保留目前的限制。
- **第一次切頁的等待，以及載入失敗時的畫面，待拍板 D-V4-44**：
  - 預先載入在資料就緒約 2 秒後才開始。在那之前（或網路慢時）第一次切頁，舊頁會停留到 chunk 載入完，期間沒有提示。
  - chunk 載入失敗時（離線，或部署更新後舊分頁要的 chunk 已不存在），該頁只剩頁首與期間列，沒有說明。再按一次同一頁可以就地重試。
  - v3 載入後離線仍可切到每一頁；現在只有預先載入完成後才行。
  - 建議 B＋C，在 V4-11 上線前做：等待時顯示既有的載入骨架、失敗時顯示錯誤狀態與「再試一次」；另在 Vercel 開 Skew Protection。本批先以 A（維持現狀）結案。
- **預先載入的時間窗是量出來的**：預先載入落在 Lighthouse 的總覽 snapshot 期間。390 比健檢量測區間早約 0.41 s，1440 只早約 0.07 s（1440 沒有 TBT 門檻）。Lighthouse 流程或機器負載改變時，可能落進量測區間。`lighthouse-pages.mjs` 現在每次都記錄 `insideTimespans`，非空時要先查這一項。
- **快速操作時不一定有預先載入**：network-log 的自動流程在載入示範資料後 2 秒內就開始匯入，排程因此被取消。之後的步驟又太快，所以第一次切頁的 chunk 由 `preparePanel` 當場載入。這是設計內的行為，測試全過。
- **TBT 餘裕**：通路健檢 804.6／832.3（約 3.3%），載入示範資料 1,082.1／1,109.1（約 2.4%）。高負載（1 分鐘負載 ≥ 4）時，單次量測可能超過門檻；審查修正時第 2 次單次量測在負載約 4.7 下是 1,119.5／860.0。
- **First Load JS 少省了一些**：實際省 37,888 bytes，原先估約 45 KB。`Overview`、`MultiScenarioWorkbench`、`ImportWizard`、`EvidenceDrawer` 依範圍留在首載。
- 人工關卡 H6、PPT spike 人工開檔都未執行。

## 6. 下一步、人工關卡與待拍板

- **待拍板 D-V4-43（零網路 E2E 放寬）**：建議 A，維持放寬並保留限制。V4-3c 的驗收已全部通過，但依 09 的記載，回覆前不結案。
- **待拍板 D-V4-44（隨頁載入的等待與失敗畫面）**：建議 B＋C，排在 V4-11 上線前；V4-3c 先以 A 結案。
- **下一批**：V4-4（商品毛利 G13、G14；D-V4-38、39 已拍板）。First Load JS 剩 45,954 bytes。
- **部署**：本批沒有部署。preview 部署仍需使用者當次明確同意。
