請依 AGENTS.md 繼續 M1，先確認 M0 的真實狀態，不要重新初始化專案。
讀 DATA_CONTRACT、METRICS、ACCEPTANCE 的 C01–C18，以及 fixtures/golden/expected.json。
先撰寫失敗的單元測試，再實作純 TypeScript 的型別、精確金額、CSV parse／validation、缺漏傳遞、按日通路先彙總再 join、metrics、bridge、deterministic rules。
以 golden 的固定正確答案比對；不要從同一個 production 函式產生 expected，不要修改 golden 迎合錯誤。
加入重複鍵、缺成本、缺廣告日、混幣、零廣告、純退款、負 cogs、百分點與 null 邊界測試。fixtures/errors 是故意不良資料，不能為了通過而補值。
不實作 UI／AI／scenarios。執行測試、typecheck、lint，記錄各項通過／失敗／未執行，更新 STATUS，完成 M1 即停。
