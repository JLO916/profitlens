# ProfitLens｜Codex 開發啟動包
版本：0.1 規格草案｜2026-09-30

## 這是什麼
這是「電商獲利診斷與決策工作台」的產品規格、Codex 任務與合成測試資料，不是已完成的應用程式。內容不使用任何個人履歷、前雇主或真實客戶資料。

第一版回答：營收增加，行銷後貢獻為什麼減少？哪些通路／費用項目值得優先查？在明確假設下，改善方案會改變多少貢獻？

## 在 Codex 開始
1. 將整個資料夾解壓縮到自己的電腦，資料夾名稱可以保持 `profitlens-codex-starter`，或改為 `profitlens`。
2. 在 Codex 開啟這個本機專案資料夾。以根目錄中看得到 `AGENTS.md` 為準；不要只上傳 ZIP 作為聊天附件。
3. 開啟 `prompts/M0_START.md`，將內容貼入這個專案的新對話。
4. M0 完成後，使用 `prompts/M1_DOMAIN.md`，接著依序做到 M6。每次只交付一個任務；不要一次貼上全部 prompts。
5. 每輪要求 Codex 回報：改了什麼、執行了哪些測試、通過／失敗／未執行、如何在本機驗收、剩餘限制。

目前不必申請正式資料串接或部署服務。前幾階段不需要模型 API key；M5 才加入選配的即時 AI 功能。

## 重要文件
- `AGENTS.md`：Codex 的專案規則。
- `docs/PRD.md`：目標使用者、功能範圍與畫面。
- `docs/DATA_CONTRACT.md`、`docs/METRICS.md`：資料格式、計算與缺漏規則。
- `docs/SCENARIOS.md`：情境試算公式，不是預測模型。
- `docs/ARCHITECTURE.md`、`docs/AI_CONTRACT.md`：技術與 AI 邊界。
- `docs/TASKS.md`、`docs/ACCEPTANCE.md`：開發關卡與驗收條件。
- `docs/PILOT_PLAN.md`：如何從示範工具驗證真實商業用途。

## 測試資料
所有 fixtures 均為合成資料，幣別 TWD，金額採未稅商品與費用口徑。
- `fixtures/golden`：可手算的小資料集；前期商品淨營收 2,250.00、行銷後貢獻 570.00；本期 2,470.00、255.00。
- `fixtures/demo`：12 週、2 通路、20 SKU 的合成展示資料。
- `fixtures/errors`：缺成本、重複列、缺廣告資料、混幣等刻意錯誤資料。
- `fixtures/refund_only`：跨期退款、負淨營收的有效邊界案例。
- `templates`：空白 CSV 範本與資料集 manifest 範例。
- `scripts/verify_fixtures.py`：只驗證啟動包資料，不代表應用程式測試已完成。

## 技術預設
Next.js + TypeScript；純 TypeScript 商業邏輯；Zod 檢查資料；decimal.js 處理金額；Vitest、Playwright 驗收。初版不設資料庫、不設登入、不接正式電商／廣告 API。

## 檔案安全
請勿把真實客戶資料、API key 或履歷放進公開專案。示範站只允許合成資料；未完成存取控制與用量限制前，不開放匿名即時 AI API。正式使用真實資料前，需另外確認資料處理授權、費用口徑及上傳／保留政策。
