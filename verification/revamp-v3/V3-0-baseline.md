# V3-0 基準報告：EC ProfitLens v2 的畫面、工程與品質基準

> 範圍：PRD `docs/revamp-v3/01_PRD.md` §2.3 B（工程層）、§2.3 C（Lighthouse）、§11.7「截圖」、§12.2 V3-0 ⑤⑦。
> 對象：`revamp/v2` 的 `87f6f8e`（產品名已改為 EC ProfitLens、`package.json` 2.0.0；財務核心與 `82b70df` 相同）。
> 量測日：2026-10-05。伺服器：本機 production build（`npm run build` → `npm start`），正式站設定 `APP_MODE=PUBLIC_DEMO`、`PUBLIC_DEMO=true`、`ENABLE_LIVE_AI=false`。
> 這些數字是之後各批（V3-1～V3-10）對照的**正式 v2 基準**。原始數值在 `verification/revamp-v3/V3-0/metrics.json`。

## 1. 量測狀態

- 新訪客（沒有 IndexedDB、沒有 localStorage），按「試試示範資料」，示範資料 ready 後在本機保存提示按「先不要」。v2 沒有 F23 改名提示與 C22 橫幅，所以這就是 §2.3 B 規定的量測狀態。
- Playwright 固定時鐘 `2026-10-05T10:00:00+08:00`（`page.clock.setFixedTime`，計時器照常跑），行動到期日、會議日期等「今天」衍生的文字不隨執行日變動。
- 語系 `zh-TW`、時區 `Asia/Taipei`、Chromium headless（Playwright 1.63.0）。

## 2. 畫面基準（`toHaveScreenshot`，PRD §11.7、§12.2 ⑤）

四尺寸 × 9 張，共 36 張，存在 `verification/revamp-v3/V3-0/snapshots/{desktop,laptop,tablet,mobile}/`：

| 檔名 | 內容 | 截圖範圍 |
|---|---|---|
| `01-overview-top.png` | 經營總覽首屏 | 視窗 |
| `02-overview-full.png` | 經營總覽整頁 | 整頁 |
| `03-evidence-drawer.png` | 公式與來源抽屜（三件事第 1 列「看證據」） | 視窗 |
| `04-actions-board.png` | 待辦與決議看板（三件事第 1 列「加入待辦」後，`board-card-1`） | 整頁 |
| `05-diagnosis.png` | 通路健檢 | 整頁 |
| `06-products.png` | 商品毛利 | 整頁 |
| `07-scenarios.png` | 假設試算（方案 1 套用「維持現況」→ 同意假設 → 計算） | 整頁 |
| `08-meeting.png` | 會議紀錄 | 整頁 |
| `09-data.png` | 資料來源 | 整頁 |

視窗：desktop 1440×1000、laptop 1280×900、tablet 768×1024、mobile 390×844（`scale: "css"`）。

**門檻**（`verification/revamp-v3.capture.config.ts`）：`maxDiffPixelRatio: 0`、`maxDiffPixels: 0`，也就是差異像素數必須是 0；`animations: "disabled"`、`caret: "hide"`。之後的批次依該批允許的視覺變化**每批**調高，並把新門檻與理由寫進該批驗收文件；基準只在該批明確 `--update-snapshots` 時改寫（`CAPTURE_BATCH=V3-n` 會把基準放到 `verification/revamp-v3/V3-n/snapshots/`）。

**穩定性（flakiness）實測**：

| 執行 | 結果 |
|---|---|
| 第 1 次（`--update-snapshots`，寫基準） | 4／4 通過，寫入 36 張 |
| 第 2 次，單一像素色差容許 `threshold: 0` | desktop、laptop、tablet 0 差異；**mobile `02-overview-full.png` 有 24 個像素不同**（y≈534–565、x 17–84，期間快捷鈕圓角的反鋸齒，每個色版只差 ±1） |
| 改成 `threshold: 0.02` 後連跑 3 次（`--repeat-each=3`，12 次） | 12／12 通過，差異像素 0 |
| 最後一次完整比對 | 4／4 通過，差異像素 0 |

- `threshold` 是 pixelmatch 的單一像素 YIQ 色差容許（Playwright 預設 0.2）；0.02 只吸收 ±1～5 色階的反鋸齒雜訊，灰階差 ≥ 6 色階就算差異像素，所以任何肉眼可見的顏色或位置變化仍會讓 V3-0 的比對失敗。
- 拒絕本機保存後頂欄顯示「未保存」，沒有「已保存 hh:mm」這類時間戳；行動、會議的日期由固定時鐘決定，所以**不需要 `mask`**。Recharts 的進場動畫由 `toHaveScreenshot` 的「連續兩張相同才比對」吸收，沒有觀察到不穩定。

## 3. 工程層基準（PRD §2.3 B）

### 3.1 首屏位置（`metrics.spec.ts`「首屏位置與內容前控制項數」）

座標是頁面座標（捲到頂端時的 `boundingBox`，單位 px）。

| 指標 | 1440×1000（v2 實測） | 390×844（v2 實測） | PRD 的 v2 現況欄 | v3 目標（鎖定批次） |
|---|---|---|---|---|
| `snapshot-sentence` 頂端 | 無（v2 沒有本期一句話） | 無 | — | ≤ 176（V3-4） |
| 第一張 `kpi-*` 卡頂端 | **397.8** | 1066.2 | KPI 頂端 y≈400 | — |
| 5 張 KPI 卡底邊（最大值） | **563.6** | 1548.9 | — | ≤ 420（V3-4） |
| `top-three` 第 1 列標題（`h3`）底邊 | **871.6** | 1925.8 | — | ≤ 1000（V3-4） |
| `top-three` 第 1 列（`li`）底邊 | 1080.5 | 2209.2 | — | 參考 |
| `kpi-contribution_after_marketing` 數值頂端 | 445.9 | **1275.0** | 390 首屏 0 個數字 | 390：≤ 360（V3-3／V3-4） |
| 首屏（視窗高）內看得到 KPI 數字 | 是 | **否**（1275 > 844） | 首屏 0 個數字 | 是 |

390 寬時 KPI 卡排成 2＋2＋1（三列：1066.2／1230.8／1395.3）。

### 3.2 1280×900 頂欄（`metrics.spec.ts`「1280×900 頂欄高度與列數」）

| 指標 | v2 實測 | PRD 的 v2 現況欄 | v3 目標（V3-3） |
|---|---|---|---|
| `header.topbar` 高度 | **113.2 px** | — | 48 px |
| 列數 | **2** | 2 列 | 1 列 |

列數算法：`header.topbar` 可見、非 `absolute` 的直接子元素依垂直範圍分群（與上一列垂直範圍重疊者同列）。1280 寬時第 1 列是麵包屑、資料狀態、公開示範版、口徑說明、AI 狀態；第 2 列是「儲存」與「下載」。

### 3.3 內容前的可見控制項數（§2.3 B 口徑）

`main` 內、文件順序在第一張 `kpi-*` 卡之前、可見（`checkVisibility`）且可聚焦（未 `disabled`、`tabIndex ≥ 0`、大於 1×1 px）的 `a[href]`／`button`／`input`／`select`／`textarea`／`summary`／`[tabindex]`。期間列在 `main` 內，計入。

| 口徑 | 1440 | 390 | 說明 |
|---|---|---|---|
| **元素數**（PRD 口徑，正式基準） | **13** | **13** | 頁首「匯入資料」1＋期間列 12（通路 1、快捷 5〔含 `aria-disabled` 的近 12 週、本月 vs 上月、去年同期，仍可聚焦〕、比較方式 1、日期 4、套用 1） |
| Tab 按鍵數（參考） | 25 | 25 | 從 `main` 按 Tab 到焦點進入第一張 KPI 卡的次數；Chromium 的 `type=date` 有年／月／日 3 個分段，4 個日期欄共 12 次 |

PRD 現況欄的「約 25」與 Tab 按鍵數相同，以元素計則是 13。PRD 的 v3 暫定目標「≤ 12（匯出本頁 1＋期間列 7＋複製週會摘要 1＋會議連結 1＝10）」是以**元素**計，所以 V3-3 應以元素數 13 為 v2 基準重算；`06_BATCHES.md` 的寫入依 PRD 由該批（或使用者同意後）處理，本報告只提供數字。若之後期間列的日期仍用 `type=date`，Tab 按鍵數會比元素數多 2×日期欄數。

### 3.4 匯入路徑點擊數

| 指標 | v2 實測 | PRD 的 v2 現況欄 | v3 目標 |
|---|---|---|---|
| 各頁頁首到匯入精靈步驟 1（`import-step-1` 可見） | 經營總覽 1、通路健檢 1、商品毛利 1、假設試算 1、待辦與決議 1、會議紀錄 1、資料來源 1（最大 **1**） | 1 | ≤ 2（資料來源頁仍是 1；V3-3） |
| 含稅匯入（`tests/fixtures/inclusive_tax`）經精靈完成的最少點擊數 | **5** | — | 參考（V3-3 的匯入入口搬移後重量） |

含稅匯入的 5 次點擊：頁首「匯入資料」→「下一步」（欄名全部符合標準，第 2 步自動完成）→ 口徑選「含稅」→「確認並檢核」→「套用」。起點是空狀態首頁（新訪客，沒有取代確認）；三個檔案用 `setInputFiles` 放入、不計點擊（真實使用者另有 3 次選檔或 1 次拖放）；稅率 5% 與換算欄位用精靈預設值。終點驗證：總覽淨營收 2,150.00、扣廣告後貢獻 518.05，與 `tests/fixtures/inclusive_tax/README.md` 手算相同。操作沿用 `tests/e2e/import-wizard-helpers.ts`。

### 3.5 First Load JS

`GET /` 的 HTML 中 `<script src>` 指向 `/_next/static/` 的檔案（去重），排除 `nomodule` 的 polyfills（現代瀏覽器不下載）。gzip 為 Node `zlib.gzipSync` 預設等級（`next start` 也以 gzip 傳送）。Next 16 的 `next build` 輸出已不再列出 First Load JS，所以以此為準。

| 指標 | v2 實測 |
|---|---|
| 腳本數（不含 nomodule） | 6 |
| 未壓縮 | **1,563,491 bytes（1,526.8 KiB）** |
| gzip | **463,379 bytes（452.5 KiB）** |
| 另計 `polyfills-*.js`（nomodule） | 112,594 bytes／gzip 39,473 bytes |

各檔大小見 `metrics.json` 的 `firstLoadJs.files`（最大是 `app/page-*.js` 587,006 bytes 與共用 chunk 530,583 bytes）。

## 4. 品質層基準：Lighthouse（PRD §2.3 C）

Lighthouse 13.5.0（npx 快取，不新增依賴）、headless Chrome，`scripts/lighthouse-pages.mjs` 以 user-flow 量。一個尺寸一個流程：navigate（空狀態首頁）→ timespan（按「試試示範資料」並在保存提示按「先不要」）→ snapshot（經營總覽）→ 每頁 timespan（側欄切頁）＋ snapshot。1440 用 Lighthouse `desktopConfig`、視窗 1440×1000；390 用預設行動設定（模擬節流）、視窗 390×844、DPR 3。執行時本機 1 分鐘負載 9.55 → 6.46（同時有其他工作），timespan 的 TBT 會受負載影響，之後比較請在相近負載下重跑。報告：`verification/revamp-v3/V3-0/lighthouse/flow-desktop-1440.html`、`flow-mobile-390.html`（JSON 已刪）。

> 方法限制：v2 的示範資料只在記憶體（沒有自動還原），重新整理就回到空狀態，所以「示範資料已載入」的頁面無法用 navigation 模式量 0–100 的 Performance 分數；Lighthouse 的 snapshot／timespan 模式也不給 0–100 分數（報告只顯示「通過幾項／共幾項」）。因此 Accessibility 取 snapshot（5 頁都有），Performance 0–100 只有空狀態首頁，5 頁改記切頁 timespan 的 TBT／CLS 與通過比。

### 4.1 Accessibility（示範資料已載入的 5 頁，snapshot）

| 頁面 | 1440 | 390 | 未通過的稽核（1440 與 390 相同；括號為節點數） |
|---|---|---|---|
| 經營總覽 | **96** | **96** | `color-contrast`（43）、`label-content-name-mismatch`（3：三件事的對貢獻影響金額按鈕） |
| 通路健檢 | **97** | **97** | `color-contrast`（21）、`label-content-name-mismatch`（15：通路表金額按鈕） |
| 商品毛利 | **96** | **96** | `color-contrast`（24） |
| 假設試算 | **96** | **96** | `color-contrast`（15） |
| 會議紀錄 | **96** | **96** | `color-contrast`（9）、`label-content-name-mismatch`（21：主管摘要金額按鈕） |
| 參考：空狀態首頁（navigation） | 100 | 100 | — |

- `color-contrast` 每頁都有的節點：頂欄資料狀態的 `span.muted`（「營運示範｜12 週示範資料 · 資料到 …」）、儲存選單的「● 未保存」`span.tag`；另有 KPI 卡標題 `h3` 與 `p.kpi-previous`、各表格 `thead th`、試算 `.baseline-metrics span` 等（`metrics.json` 的 `failedAccessibilityNodes` 列出前 8 個選擇器）。R7 的 a11y 100 只量空狀態首頁，這些是載入資料後才出現的元素。
- `label-content-name-mismatch`：`button.number-link` 的 `aria-label` 沒有包含畫面上的金額文字。
- 依 PRD §2.3 C，之後每批的硬門檻是「不低於上表同頁基準，且 ≥ 95」。

### 4.2 Performance

| 項目 | 1440 | 390 |
|---|---|---|
| 空狀態首頁（navigation）Performance 分數 | **100** | **94** |
| 　FCP／LCP | 248 ms／572 ms | 914 ms／2,572 ms |
| 　TBT／CLS | 4 ms／0.001 | 134 ms／0.092 |
| 載入示範資料（timespan）TBT／CLS／INP | 165 ms／**0.814**／24 ms（通過 21/25） | 1,102 ms／0／38 ms（22/24） |
| 切到通路健檢（timespan）TBT／CLS | 149 ms／0（7/7） | 780 ms／0（6/7） |
| 切到商品毛利（timespan）TBT／CLS | 0 ms／0（6/6） | 76 ms／0（21/21） |
| 切到假設試算（timespan）TBT／CLS | 0 ms／0（6/6） | 0 ms／0（6/6） |
| 切到會議紀錄（timespan）TBT／CLS | 217 ms／0（6/7） | 981 ms／0（6/7） |

- 首頁分數與 R7 重測（desktop 100、mobile 93）一致（mobile 94）。PRD §2.3 C 的建議門檻「≥ 90 且不低於 V3-0 基準減 3 分」以此為準：desktop ≥ 97、mobile ≥ 91。
- 1440 載入示範資料的 CLS 0.814：空狀態區塊被整個總覽取代時的位移（390 為 0）；V3-4／V3-8「版面跳動」可拿這個數字對照。
- 切頁的 TBT 在 390（4 倍 CPU 節流）偏高，健檢與會議紀錄約 0.8–1.0 秒。

## 5. 重跑方式

```bash
# 0. 建置並用正式站設定啟動 production 伺服器（3100 被占用時改用其他埠，並設定 CAPTURE_PORT）
NEXT_TELEMETRY_DISABLED=1 npm run build
lsof -nP -iTCP:3100 -sTCP:LISTEN            # 確認沒有其他伺服器
APP_MODE=PUBLIC_DEMO PUBLIC_DEMO=true ENABLE_LIVE_AI=false NEXT_TELEMETRY_DISABLED=1 npm start -- --port 3100 &

# 1. Lighthouse 先單獨跑（不要和 Playwright 同時跑，避免負載影響分數）
npx -y lighthouse@13.5.0 --version          # 只有第一次需要：建立 npx 快取（不新增專案依賴）
node --no-warnings scripts/lighthouse-pages.mjs --base http://127.0.0.1:3100
#   → verification/revamp-v3/V3-0/lighthouse/flow-{desktop-1440,mobile-390}.html，分數寫進 metrics.json 的 lighthouse

# 2. 畫面比對（每批都跑；V3-0 之後的批次不要加 --update-snapshots，除非該批明確更新基準）
npx playwright test --config verification/revamp-v3.capture.config.ts baseline
#   V3-0 寫基準時：… baseline --update-snapshots；新批次的基準：CAPTURE_BATCH=V3-n … --update-snapshots

# 3. 工程指標（desktop 與 mobile project；寫 metrics.json，其他鍵保留）
npx playwright test --config verification/revamp-v3.capture.config.ts metrics
#   METRICS_OUT=verification/revamp-v3/V3-n/metrics.json 可寫到該批自己的檔案

# 4. 收尾
lsof -nP -iTCP:3100 -sTCP:LISTEN -t | xargs kill
```

- 截圖與量測都與 `tests/e2e` 分開，不計入 E2E 數量，也不會改寫 `verification/review-v2-a-*`。
- Playwright 的輸出（失敗時的 diff、trace）在 `test-results/revamp-v3-capture/`（已在 `.gitignore`）。

## 6. 檔案

| 檔案 | 用途 |
|---|---|
| `verification/revamp-v3.capture.config.ts` | Playwright 設定：四個 project、`snapshotPathTemplate`、門檻、重用已啟動的伺服器 |
| `verification/revamp-v3-capture/shared.ts` | 共用操作：固定時鐘、載入示範資料並拒絕保存提示、切頁、試算「維持現況」 |
| `verification/revamp-v3-capture/baseline.spec.ts` | 四尺寸 × 9 張 `toHaveScreenshot` |
| `verification/revamp-v3-capture/metrics.spec.ts` | §2.3 B 量測，寫 `metrics.json` |
| `scripts/lighthouse-pages.mjs` | Lighthouse user-flow（5 頁 × 1440／390） |
| `verification/revamp-v3/V3-0/snapshots/**` | 36 張畫面基準 |
| `verification/revamp-v3/V3-0/metrics.json` | 全部原始數值 |
| `verification/revamp-v3/V3-0/lighthouse/*.html` | Lighthouse flow 報告（只留 HTML） |
