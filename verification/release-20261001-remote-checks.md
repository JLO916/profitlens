# 2026-10-01 遠端發布驗證

驗證範圍為已授權之既有 GitHub/Vercel 系統發布；未建立雲端專案、公開站 AI 維持關閉、未呼叫 Live AI。

| 項目 | 狀態 | 證據 |
| --- | --- | --- |
| Git commit 對應 production 部署 | pass | 2f8e539c22a3afc0260c6db08f9570b80eaebdb6 → dpl_C6WoYoo811nLC1578zNf434ycXrN |
| Vercel build/production READY | pass | 2026-10-01T11:19:55.728Z，build 到 READY 66.605 秒 |
| 公開 alias 指向新部署 | pass | 直接以 profitlens-tau.vercel.app 查 deployment，ID/SHA/READY 全部一致，aliasError=null |
| 13 項 HTTP smoke | pass | release-20261001-http.json |
| 5 組 synthetic dataset 與本機 fixtures 一致 | pass | manifest、三 CSV 逐位元組比對及 SHA256 |
| 公開 AI GET / POST 後端限制 | pass | GET available=false/reason=PUBLIC_DEMO；POST 403/reason=PUBLIC_DEMO |
| 敏感／非允許靜態路徑 | pass | /.env、/.git/config、/verification/app-acceptance.md、/fixtures/golden/sales_daily.csv 與未允許 dataset 皆 404 |
| 雲端 build log | pass | CLI 取得 release-20261001-cloud-build.txt；MCP 該工具不可用 |
| 部署範圍 runtime 5xx | pass | 自 READY 時刻至本次查詢，group_by=statusCode 無記錄 |
| 專案範圍 runtime errors | pass | 同期間無錯誤群組 |
| Live AI | not_run | 未呼叫；公開展示後端維持關閉 |

## 實際命令與工具

- `git rev-parse HEAD`：exit 0，完整 SHA 如上。
- Vercel `list_deployments`：先觀察 BUILDING；35 秒後 `get_deployment` 確認 READY。
- Vercel `get_deployment(idOrUrl="profitlens-tau.vercel.app")`：再次確認公開 alias 對應相同 SHA。
- `python3 verification/deployment-smoke.py verification/release-20261001-http.json`：第一次 sandbox DNS 解析失敗，exit 1；正常網路核准後重跑 exit 0、13/13 pass。
- Vercel MCP `get_deployment_build_logs`：工具回覆 `Tool get_deployment_build_logs not found`，未把此工具嘗試標為成功。
- `vercel inspect profitlens-dgtltbjkq-jlo916s-projects.vercel.app --logs --scope jlo916s-projects`：唯讀 CLI fallback，exit 0，取得 npm ci、Next build、TypeScript、Deploying outputs 與 Ready 紀錄。
- Vercel `get_runtime_logs`：deploymentId、production、statusCode=5xx、group_by=statusCode，since=2026-10-01T11:19:55.728Z，無結果。
- Vercel `get_runtime_errors`：projectId，同 since，無結果。

## 限制與非阻塞警告

runtime 只覆蓋發布後的短時間窗口，且遙測可能延遲；不代表長期無錯誤或容量驗收。人工瀏覽器驗收由主流程另記。

雲端建置成功，但記錄三項維護警告：Node engines 設為 >=24.0.0 可能隨新主版升級、eslint@9.39.5 被 npm 標示停止支援、unrs-resolver postinstall 尚未列於 allowScripts。本次未自行改動 lockfile、允許腳本或切換版本。

發布網址：https://profitlens-tau.vercel.app
