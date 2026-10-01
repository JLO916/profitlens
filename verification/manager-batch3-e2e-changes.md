# PL-10 E2E 調整說明

狀態：測試程式已準備；本文件撰寫時 browser E2E、build、typecheck、lint 均未執行，不能將案例列出視為通過。最後執行結果以本批根目錄驗收報告與 Playwright JSON 為準。

## 新驗收案例

`tests/e2e/manager-presentation.spec.ts` 的四個案例各在既有 desktop 1440、tablet 768、mobile 390 專案執行：

1. 首頁只顯示合成示範與標準 CSV 匯入入口；內建 Golden／缺漏／錯誤資料選單僅在「進階驗證」頁。使用鍵盤開啟導覽，檢查五個原有選項仍完整，回主管首頁不露出選單，實際 demo 貢獻仍為 1,269,792.73。
2. 專區依序載入 Golden、缺廣告與重複鍵。分別核對 255.00、未知（收入仍 2,470.00）、錯誤不取代前次 DTC 270.00 與收入 1,480.00；成功載入回經營總覽。
3. DTC 有尚未算完的方案與行動工作稿時，單純切入／離開專區不能發出資料 API 請求、改通路、清空填寫值，或把本來空白的折扣假設補零。
4. 技術 fact ID／規則代碼預設折疊，主管說明保留；可鍵盤展開／收起，主要說明與標記至少 12px，頁面不水平溢出。保存真實 screenshot 和瀏覽器錯誤紀錄。

## 既有案例適配

- `action-workspace`、`manager-summary`、`product-comparison`、`scenario-sensitivity`、`scenarios`、`workspace-storage`、`workspace` 的資料載入 helper 每次操作下拉前都先按「進階驗證」，包括同一測試第二次切換資料。
- `manager-summary` 另等待「資料已就緒／部分資料待補」，避免 API 尚未完成就切換面板。
- `scenarios` 的財務列標改成實際主管中文「一次性投入」「取分調整」，原金額 20.00／-0.01 不變。
- 此次編輯的全部既有 E2E 將 screenshot、JSONL、PDF 路徑分流到 `verification/manager-batch3-regression-*`，不覆蓋第二批留存的驗收證據。
- `ai.spec.ts` 由 AI 子任務單獨維護，此任務沒有編輯；金額、來源、null、stale、匯出與安全斷言未放寬。

## 已執行

- `npx playwright test --list`：exit 0，只驗證測試可發現與解析；輸出 `manager-batch3-e2e-list.txt`。這不是啟動瀏覽器。
- `git diff --check`：exit 0（執行當時工作樹）。

此階段沒有執行 build、完整 E2E 或外部服務，避免與其他子任務並行修改時生成不一致的 Next.js 產物。由根任務凍結 source 後統一執行。
