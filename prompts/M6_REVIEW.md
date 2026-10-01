請以獨立驗收者角度執行 M6，先讀全部 acceptance 與目前 STATUS，不假設前一輪已完成。
檢視最容易出錯的地方：join 倍增、費用缺漏、退款／成本回沖、比率加總、SKU 篩選範圍、scenario 假設與百分點、AI 引用真實性、stale response、CSV／XSS 注入、secrets、公開 API、跨視窗資料共用。
執行 typecheck、lint、全部 unit/integration、build、E2E，人工走匯入→診斷→試算→匯出。實際瀏覽器檢查390／768／1440px，不能只閱讀程式。
允許修復已驗證問題，修復後重跑相關測試；不加入新大功能、不修改商業定義或 golden 答案。
產出 verification/app-acceptance.md（每項 pass/fail/not_run、命令、限制），更新 README／STATUS，提供產品操作說明與公開示範前的安全檢查。不要未授權建立雲端專案、公開 repo 或部署。
結尾說明已能做哪些真實操作、仍不支援什麼、live AI 是否實測；不要寫未驗證的商業成效。
