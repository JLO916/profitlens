# Review v2 A — 2026-10-02 遠端發布驗證

本紀錄只含唯讀部署 metadata、雲端建置、HTTP 與短窗口 runtime 核對。主代理另做實際瀏覽器驗收；不以 HTTP 取代 UI 驗收。

| 項目 | 結果 | 證據 |
|---|---|---|
| Git 提交 | pass | `6c11a429dee50c08748891ade76b5972f72a593e`，GitHub main / JLO916/profitlens |
| 新 deployment | pass | `dpl_7DMMB1jQ54FYy6C2AUDoZGj3e2nN`，READY、production，2026-10-02 02:44:09 UTC 完成 |
| 公開 alias 反查 | pass | 02:45:37 UTC 以 `profitlens-tau.vercel.app` 反查同一 deployment 及完整 SHA；不是只看部署別名清單 |
| 雲端建置 | pass | `npm ci` → `npm run build` → TypeScript → Deployment completed；完整篩選日誌見 `release-v2-a-20261002-cloud-build.txt` |
| HTTP smoke | pass | 13/13；02:45:48 UTC 完成；見 `release-v2-a-20261002-http.json` |
| 公開 AI 後端 | pass | GET 200：available=false / PUBLIC_DEMO；POST 403：fallback / PUBLIC_DEMO；未呼叫模型 |
| 白名單資料 | pass | demo、golden、missing-cogs、missing-ad、duplicate 的 manifest 及三份 CSV 位元與本機 fixture 一致 |
| 非公開路徑 | pass | 不在白名單的資料集、/.env、/.git/config、/verification/app-acceptance.md、/fixtures/golden/sales_daily.csv 均404 |
| 新部署 production 5xx | pass（僅短窗口） | 02:44:09.110–02:46:02.655 UTC，按 statusCode 聚合無回傳列 |
| 專案 runtime errors | pass（僅短窗口） | 同窗口工具回覆 No runtime errors found；此 error-cluster 查詢是 project 範圍 |
| Live AI / 本子任務瀏覽器 | not_run | 公開 Live AI 關閉；UI 由主代理獨立驗收 |

## 實際工具與命令

- `vercel_get_deployment` 查 deployment ID，等待超過30秒後再查至 READY，並以公開 alias 獨立反查。
- `vercel_get_deployment_build_logs` 回覆 Tool not found；改以 `vercel inspect dpl_7DMMB1jQ54FYy6C2AUDoZGj3e2nN --logs --scope jlo916s-projects --no-color` 讀取。經潛在憑證行篩選後保存74行，redacted=0；沒有輸出或保存 API key。
- `python3 verification/deployment-smoke.py verification/release-v2-a-20261002-http.json`，exit 0。
- `vercel_get_runtime_logs`：固定 project/team、deployment ID、environment=production、statusCode=5xx、group_by=statusCode 與上述 UTC 起迄。
- `vercel_get_runtime_errors`：固定 project/team 與同一 UTC 起迄。
- `git diff --check -- verification/release-v2-a-20261002-remote.md verification/release-v2-a-20261002-remote.json verification/release-v2-a-20261002-http.json verification/release-v2-a-20261002-cloud-build.txt`。

## 限制與建置提示

短窗口查詢受流量、log 可用性與彙整延遲影響，只代表當時未查到 5xx／error，不能宣稱長期無錯誤。未執行 Live AI、長期監控、壓力測試或依賴升級。

建置保留既有提示：Node engines `>=24.0.0` 可能接受未來大版本、eslint 9.39.5 已 deprecated、unrs-resolver 1.12.2 的 postinstall 尚未列入 allowScripts。這些未阻止本次建置；沒有擅改依賴或設定。雲端當次 npm ci 回報0 vulnerabilities，不等於未來無漏洞。

本子任務未推送、部署、更新環境變數或讀取憑證內容；主代理負責已授權的遠端寫入。原始 metadata 僅保存所需識別、版本、狀態與時間，詳見 `release-v2-a-20261002-remote.json`。
