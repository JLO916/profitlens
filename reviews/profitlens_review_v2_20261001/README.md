# ProfitLens 第二輪經理人檢核｜2026-10-01

對象：https://profitlens-tau.vercel.app/ 。本次是新版部署的唯讀檢核，不是網站改版交付。

## 先讀

- `REVIEW_FINDINGS.md`：新版已完成項目、仍需優先處理的問題與驗收方式。
- `OPERATING_REVIEW_SPEC.md`：每日、每週、每月的產品使用設計與必要資料。
- `ZH_TW_COPY_GUIDE.md`：台灣電商介面用語與可直接替換的文案。
- `CODEX_NEXT_SPRINT.md`：下一輪分批任務及端到端驗收清單。

## 可重現證據

- `evidence_receipt.json`：部署版本、資源網址、回傳時間、HTTP 狀態及本次限制。
- `browser_attempt.json`：Chromium 無法直接連線的錯誤紀錄。
- `deployed_logic_checks.js`：手動轉錄部署函式／表示式後的最小測試程式。
- `logic_results.json`：五項日期案例、行動過期、週趨勢區間、排序顯示的一致性檢核結果。

在有 Node.js 的環境執行 `node deployed_logic_checks.js` 可重新產生結果。這不會啟動網站、不會連線至商家，也不是網站端到端測試。

**重要限制：**本次已讀取上線資源並執行抽取邏輯測試，但 Chromium 導覽被環境政策阻擋，未完成真正的逐頁點擊、上傳、下載、保存恢復或行動裝置實測。靜態確認的行為仍須以實際瀏覽器驗收。套件不包含使用者履歷、金鑰或商家個資。
