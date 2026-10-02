# Review v2 A 批發布驗收（2026-10-02）

狀態：in_progress。使用者已明確授權推送 GitHub／Vercel；只發布已完成 A 批，不執行 B–D 或 Live AI。

## 發布前核對

- GitHub：既有私人 `JLO916/profitlens`，main 原 SHA `bb9173edae9a28eb1970c5a968f1165b0ce64bb5`。
- Vercel：既有 `profitlens`／`jlo916s-projects`，production branch main；正式網址 https://profitlens-tau.vercel.app。
- [來源與工程證據](release-v2-a-20261002-checks.md)：139 件來源／測試、60 件 protected／5 件 golden 雜湊均相符。沿用 A 批 819 unit、400＋4 E2E、typecheck／lint／production build；本輪未重跑，不混称為新結果。
- [發布包審核](release-v2-a-20261002-package-audit.md)：只包含產品、規格、合成資料及工程證據；不讀取或提交 `.env`／credential。
- [遠端預檢](release-v2-a-20261002-preflight.md)：只讀確認私人 repo、Git integration／production main、原線上 PUBLIC_DEMO gate。既有線上通過不代表新版本已部署。

## 本轮待執行

Git commit／push、Vercel 新版本建置、alias／SHA 核對、正式站 HTTP／真瀏覽器及短窗口 runtime logs：pending。

## 未執行範圍

Live AI、真實營運資料、商業成效、實體裝置、跨瀏覽器、長期可用性與負載驗收：not_run。完整 400＋4 E2E 為本機 Chromium 驗收，後续線上 smoke 不等同線上全套 E2E。
