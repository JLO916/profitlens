# Review v2 A — 2026-10-02 發布前遠端核對

這份紀錄是 A 批推送之前的既有遠端狀態，**不是 A 批部署後驗收**。完整篩選結果見同名 JSON。檢查時間約為 2026-10-02 02:39 UTC（台北 10:39）。

| 核對項目 | 結果 | 實際證據 |
|---|---|---|
| GitHub 可見性與分支 | pass | `JLO916/profitlens` 仍為 PRIVATE，預設 main；branch protection=false |
| GitHub main | pass | `bb9173edae9a28eb1970c5a968f1165b0ce64bb5`，目前公開版本的文件提交 |
| 既有 Vercel 專案 | pass | `prj_tbTT4CUd5u51SUpc9mqw7UbQQfnY` / team `team_wUUcOGKR91tpU7tPFzmpCRLL`；profitlens、Next.js、Node 24.x |
| Production Git 連結 | pass | github / JLO916 / profitlens，productionBranch=main |
| 舊 production 部署與 alias | pass | `dpl_2sRhLUuxtTs2UieWThbZsf9N4fzr`，READY / production；`profitlens-tau.vercel.app` 對應同一 bb9173e 完整 SHA |
| 公開 HTTP smoke | pass | 13/13；首頁200，五組白名單合成資料的 manifest 與 CSV 原始位元符合本機 fixture；五個非公開路徑404 |
| 公開 AI GET | pass | 200，available=false、reason=PUBLIC_DEMO |
| 公開 AI POST | pass | 403，fallback / PUBLIC_DEMO，未呼叫模型 |
| 環境變數名稱 | pass | 回傳名稱只有 APP_MODE、PUBLIC_DEMO、ENABLE_LIVE_AI；沒有 OPENAI_API_KEY；未解密、未輸出、未保存任何值 |
| Vercel get_project connector | fail / fallback 已完成 | 工具宣告 projectId，但服務要求 idOrName；兩次只讀查詢均 schema error。改以 Vercel CLI GET 並先篩選 metadata 成功 |
| 本次實際瀏覽器 / Live AI | not_run | 發布前僅做遠端 metadata 與 HTTP；Live AI 保持關閉 |

## 實際命令／工具

- `gh repo view JLO916/profitlens --json nameWithOwner,visibility,defaultBranchRef,url`
- `gh api repos/JLO916/profitlens/branches/main --jq '{name: .name, protected: .protected, commit_sha: .commit.sha}'`
- `vercel_list_projects`、`vercel_list_deployments`、`vercel_get_deployment`（既有 team/project 與公開 alias）。
- `vercel api '/v9/projects/prj_tbTT4CUd5u51SUpc9mqw7UbQQfnY?teamId=team_wUUcOGKR91tpU7tPFzmpCRLL' --method GET --raw --non-interactive`，直接管線交給 Python 只選 id/name/framework/nodeVersion/Git link/env key、target、type；未把原始回應存檔或列印。
- `python3 verification/deployment-smoke.py /private/tmp/profitlens-v2-a-preflight-http.json`，exit 0，結果併入本紀錄 JSON。

初次 gh 於預設 sandbox 回報無法連接 api.github.com；正常申請網路執行後唯讀成功。沒有要求變更 sandbox 政策或讀取憑證內容。未 push、deploy、改環境或遠端設定。後續主代理完成推送後，仍須另外核對新 SHA、READY、production alias 與 HTTP／瀏覽器結果。
