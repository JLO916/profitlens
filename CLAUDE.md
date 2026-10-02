# ProfitLens — Claude Code 工作指令（Revamp v2）

ProfitLens 是「電商獲利診斷與決策工作台」：匯入三份日粒度 CSV（銷售、通路費用、廣告），計算 淨營收 → 商品毛利 → 通路貢獻 → 扣廣告後貢獻，做兩期比較、九項金額橋接、規則健檢、假設試算、行動與會議輸出。所有金額由 `src/domain` 的純函式計算，每個數字可追溯到 CSV 檔名與行號。

本輪目標：**在不動財務核心的前提下，把產品從「稽核員工具」改成「台灣電商經理人每週會用的工具」**，並重新上線。

## 先讀什麼（每個 session 都要）
1. `AGENTS.md` — 專案既有規則，**優先級最高**；本檔只補充，不覆蓋。
2. `docs/revamp/00_README.md` — 本輪改版套件的用法與批次順序。
3. 當批任務：`docs/revamp/06_BATCHES.md` 中指定的 R 批次，以及該批引用的規格檔（02–05）。
4. 財務口徑：`docs/METRICS.md`、`docs/DATA_CONTRACT.md`、`docs/SCENARIOS.md`。

## 本輪的硬規則（補充 AGENTS.md）
- **一次只做一個批次（R0–R7），不跨批。** 批次完成前不開始下一批；每批結束要有可運行、全部檢查通過的狀態。
- **財務核心禁區**：`src/domain/*`、`fixtures/golden`、`fixtures/demo`、`fixtures/errors`、`fixtures/refund_only`、`fixtures/zero_ad`、`metric_version = contribution-v1`、`docs/METRICS.md` 的公式。R1–R3 完全不碰 `src/domain`。R4 以後只允許**新增**（新欄位、新函式、新版本標籤 `assist-kpi-v1`），不改既有指標的輸入輸出；任何新增都要有獨立手算 golden 的測試。
- **標籤單一來源**：所有使用者看得到的中文（指標名、規則標題、按鈕、說明）集中在 `src/i18n/labels.zh-TW.ts`；元件、匯出、AI 預覽都從這裡取字串。`src/application/presentation.ts` 的 `metricDefinitions.label` 改為從 labels 讀取。不在 JSX 內新寫中文字串。
- **測試斷言的字串跟著標籤走**：`tests/manager-language.test.ts`、`tests/export.test.ts`、`tests/e2e/*.spec.ts` 等有大量中文字串斷言。改名時在**同一批**更新測試，優先改成 `import { labels } from "@/i18n"` 再斷言，不要留硬編碼。測試失敗不是「跳過」的理由；也不可為了讓測試過而改 golden 數字。
- **依賴**：只能新增該批次「允許新增依賴」清單內的套件，版本精確鎖定、更新 `package-lock.json`；新增前先 `npm view <pkg> version` 確認版本存在。不在清單內的一律先問。
- **隱私與公開站邊界不變**：不加登入、資料庫、伺服器端保存；原始 CSV 不上傳；`APP_MODE=PUBLIC_DEMO`、`ENABLE_LIVE_AI=false`、`/api/insights` 的 server 端封鎖邏輯不動；不碰 `.env*`。本機保存仍須使用者同意（可改為「一次同意、之後自動」）。
- **可追溯性不變**：每個金額仍可開「公式與來源」看到檔名、原始行號；任何前處理（例如含稅換算）都必須在來源抽屜顯示原值與換算值，並寫入匯出與備份。
- **a11y 與 testid 不退步**：既有 `data-testid`、`aria-*`、`role="status"`、`<details>/<summary>` 收合結構要保留；移動區塊時一起搬，不刪。
- **程式風格**：沿用既有風格（Tailwind v4 + `globals.css` 自訂 class、長行 JSX）。不要為了格式化重寫整檔；只改動需要的區塊。
- **文件同步**：每批結束更新 `docs/STATUS.md`（真實執行結果；未執行寫「未執行」）、必要時在 `docs/DECISIONS.md` 加一筆決策、把本批驗收寫到 `verification/revamp-R{n}-acceptance.md`。

## 驗收命令（每批都要全部跑，貼真實輸出摘要）
```bash
npm ci                 # 全新環境或 lockfile 變動時
npm run typecheck
npm run lint
npm test -- --run
npm run build
npm run test:e2e       # 首次需 npx playwright install chromium；佔用 3100 port
```
本機預覽：`npm run dev` → http://127.0.0.1:3000 。E2E 的四種視窗：1440×1000、1280×900、768×1024、390×844。

## 每批回報格式（繁體中文）
1. 完成項目（對照 `06_BATCHES.md` 的任務編號，逐項標 完成／部分／未做＋原因）
2. 變更檔案清單（新增／修改／刪除）
3. 驗收命令與真實結果（通過數、失敗數、未執行）
4. 瀏覽器驗收方式與截圖路徑（四尺寸至少各一張）
5. 已知限制與風險
6. 下一批建議與需要人拍板的事項（對照 `09_DECISIONS_PENDING.md`）

## 檔案地圖（改版會碰到的）
| 位置 | 內容 | 本輪動作 |
|---|---|---|
| `src/components/dashboard.tsx` | 應用殼層：側欄、頂欄、AI 狀態、保存面板、期間列、各頁切換、頁尾 | R1 重排、R2 文案、R6 會議分頁 |
| `src/components/overview.tsx` | KPI 卡、期間合計與日均、週趨勢、橋接、通路比較 | R1 順序、R4 輔助指標與目標 |
| `src/components/review-workbench.tsx` / `manager-summary.tsx` | 會議設定與決策、主管摘要、三件事、通路寬表 | R1 收合下移、R5 標題改寫、R6 會議紀錄 |
| `src/components/workspace-panels.tsx` | 資料工作區（DataWorkspace）、通路診斷（Diagnosis）、商品毛利（Products） | R2 文案、R5 清單化 |
| `src/components/import-panel.tsx` + `src/application/import.ts` / `import-guidance.ts` | 匯入表單與檢核 | R3 精靈化、含稅、對照記憶 |
| `src/components/multi-scenario-workbench.tsx` / `decision-workbench.tsx` / `scenario-sensitivity.tsx` | 情境試算 | R5 流程縮短、範本、絕對值輸入 |
| `src/components/actions-workbench.tsx` + `src/application/action-workspace.ts` | 行動 | R5 表單修正、看板 |
| `src/components/evidence-drawer.tsx` | 公式與來源抽屜 | R2 中文階梯公式 |
| `src/application/presentation.ts` | `metricDefinitions`、格式化 | R2 接 labels |
| `src/application/workspace-backup.ts` / `local-store.ts` | 備份 v3、IndexedDB | R3 對照記憶、R4 v4 schema、R6 自動保存 |
| `src/application/export.ts` / `decision-export.ts` / `workspace-decision-export.ts` | CSV／Markdown／JSON 匯出 | R2 標籤、R6 新格式 |
| `src/app/globals.css` | 全站樣式（自訂 class） | R1 sticky 期間列、select 高度、下載選單 |
| `src/i18n/labels.zh-TW.ts`（新） | 標籤字典 | R0 建立、R2 接線 |
| `docs/revamp/*` | 本輪規格 | 每批對照 |
