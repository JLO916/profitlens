請在目前專案資料夾建立 ProfitLens 的第一個開發關卡 M0。這是一個電商獲利診斷與決策工具，不是個人履歷或作品介紹網站。

先完整閱讀 AGENTS.md、START_HERE.md、docs/PRD.md、docs/DATA_CONTRACT.md、docs/METRICS.md、docs/ARCHITECTURE.md、docs/ACCEPTANCE.md、docs/TASKS.md。
先檢查現有檔案、Node/npm/Git 環境及可用工具；不要覆蓋原有規格／fixtures，不要讀取資料夾外不相關檔案，也不要要求使用者先處理一串可自行檢查的工程問題。

只做 M0：
1. 用繁體中文摘要產品範圍、關鍵資料口徑與本輪工作；指出實際規格衝突，沒有就直接開始。
2. 使用 Next.js App Router + TypeScript 建立最小可啟動骨架。既有目錄若讓 scaffold 工具拒絕，安全地在暫存位置初始化，再選擇性合併，不刪除目前檔案。
3. 建立 src/domain、application、components、ai、lib，配置相容穩定依賴及 lockfile。新增真實可執行的 typecheck、lint、unit test、build 命令。
4. 提供 .env.example 但不要求 API key；配置 .gitignore 排除 secrets／使用者上傳／build outputs。
5. 加入最小可驗證 smoke test，並執行 typecheck、lint、test、build。不要寫會永遠回傳成功的佔位測試。
6. 更新 README.md 的啟動方式與 docs/STATUS.md。不要實作完整 dashboard、AI 串接、登入、資料庫或部署。

完成後回報改動檔案、實際執行命令與結果、未執行項目及原因、本機開啟方式。只完成 M0 後停止；下一輪才做 M1。
