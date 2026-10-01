# GitHub／Vercel 首次部署驗證

日期：2026-10-01，Asia/Taipei。使用者明確指示「先將此版本推送部署至 github 及 versel」。本次只部署既有 M6 版本與補部署文件；沒有改金融定義、golden、產品程式或依賴。

## 結果

| 項目 | 結果 | 證據／限制 |
|---|---|---|
| GitHub | pass | https://github.com/JLO916/profitlens，isPrivate=true，default main |
| 程式快照 | pass | b95c92ae112d08edd4930a41b64abb8e32390a00，初次 push 成功；後續文件推送見 Git 歷史 |
| Vercel | pass | jlo916s-projects/profitlens；GitHub main 連接成功 |
| Production | pass | https://profitlens-tau.vercel.app，READY；首次 dpl_3CxqBVmb1Fh7Bdr95cj8vxGKQL93 |
| Cloud install/build | pass | npm ci；npm run build；Next.js 16.3.7 Webpack，TypeScript 成功；build output 53 秒；deployment 約 65 秒 |
| 環境 | pass | Project Node 24.x；三環境 APP_MODE=PUBLIC_DEMO、PUBLIC_DEMO=true、ENABLE_LIVE_AI=false；沒有 OpenAI key |
| 公開 endpoint | pass | 13 HTTP checks；五資料集的 manifest 與 CSV 原始 bytes 全部等於本機；Cache-Control=no-store |
| AI 關閉 | pass | GET available=false、reason=PUBLIC_DEMO；POST 空 JSON 回403、PUBLIC_DEMO，不執行 provider |
| 非公開檔案 | pass | /.env、/.git/config、/verification/app-acceptance.md、/fixtures/golden/sales_daily.csv 均404；未知資料集404 |
| 真瀏覽器 | pass | 線上 Demo／Golden 計算、切換通路診斷；AI 公開展示停用文字；截圖與 console logs 保留 |
| Runtime 5xx | pass | 首次 deployment，2026-10-01T07:33:36Z–08:03:36Z 查詢無記錄；僅短時抽查 |
| Live AI | not_run | 未設定 key，公開 server 關閉；沒有模型請求，不宣稱 live 品質 |
| 本輪完整本機 tests/lint/E2E | not_run | 產品程式沒有改；沿用前一輪 M6 的615 tests、186 E2E、typecheck/lint/build證據，不稱本輪重跑 |
| 完整線上匯入／匯出及三尺寸E2E | not_run | 本次部署只做線上 smoke；完整人工操作與三尺寸驗收在 M6 本機執行 |
| 長期監測、壓測／商業效益 | not_run | 未新增 monitoring 套件、付費服務或自動化；不宣稱效益或全面安全認證 |

## 實際命令

1. `git init -b main`；設定此 repo 的 JLO916／GitHub noreply 身分；`git add .`；`git commit -m 'chore: publish verified ProfitLens M6 snapshot'`。
2. `gh repo create JLO916/profitlens --private --source=. --remote=origin --push --description 'ProfitLens：電商獲利診斷、條件試算與決策工作台'`：成功。
3. `vercel link --yes --project profitlens --scope jlo916s-projects`：建立並連接指定新專案；未操作其他專案。
4. `vercel env add NAME production --value VALUE --no-sensitive --yes --scope jlo916s-projects`：三個非秘密旗標成功。Preview 同命令失敗，CLI 自身要求 branch 但建議相同省略命令；沒有反覆盲重試。
5. `vercel api /v10/projects/prj_tbTT4CUd5u51SUpc9mqw7UbQQfnY/env --method POST --input /tmp/profitlens-vercel-demo-env.json --scope jlo916s-projects`：array body 回400 Invalid JSON。改逐一 object `key/value/type=plain/target=[preview,development]`（`/tmp/profitlens-vercel-env-one.json`）後三項成功，failed=[]。未讀／記錄登入 token。
6. `vercel git connect https://github.com/JLO916/profitlens.git --scope jlo916s-projects`：Connected。
7. `vercel deploy --prod --yes --scope jlo916s-projects --logs > verification/deployment-build.txt 2>&1`：exit0、READY、正式 alias 成功。上傳904.3KB、113 files；本機驗收文件／截圖依 .vercelignore 排除 CLI upload。
8. `gh repo view JLO916/profitlens --json url,isPrivate,defaultBranchRef`：確認私人儲存庫與main。
9. `vercel api /v9/projects/prj_tbTT4CUd5u51SUpc9mqw7UbQQfnY --scope jlo916s-projects`：只保留專案、runtime、Git與三個非秘密flag摘要於 deployment-config.json；不保存完整 API response 或任何 credentials。
10. `python3 /tmp/profitlens-deploy-smoke.py verification/deployment-http.json`：exit0、13 passed。可重跑腳本已保留為 `verification/deployment-smoke.py`（參數為結果 JSON 路徑）。腳本 GET 公開路徑，POST只用空JSON；不傳送使用者資料或任何key。結果包含線上 CSV SHA-256。
11. Vercel MCP `get_deployment`：READY、target production、commit與快照一致。`get_runtime_logs` 以該 deployment、5xx、30m 查詢：no logs。
12. CUA 實際開 `https://profitlens-tau.vercel.app`，點「載入示範資料」，選Golden後「載入資料集」，再「通路診斷」；沒有只讀程式就宣稱瀏覽器驗收。

## 瀏覽器固定數字

- Demo：收入7,850,657.90、行銷後貢獻1,269,792.73、bridge −598,833.95。
- Golden：收入2,470.00、行銷後貢獻255.00、前期570.00、bridge −315.00；DTC270.00、MARKETPLACE−15.00。
- Golden規則診斷16項；AI顯示「公開展示模式已由伺服器關閉即時 AI，仍可使用規則診斷」，同意與傳送按鈕停用。
- 本次沒有設定新 viewport；使用內建瀏覽器現有視窗，沒有宣称本輪另驗1440／768／390。

證據：`deployment-demo.jpg`、`deployment-golden.jpg`、`deployment-browser.json`。console warn/error 為空。這些都是合成資料，不是真實成果。

## 已解決檢查工具問題

初次 `deployment-http-initial.json` 的五個 CSV 比對失敗，是 Python `Path.read_text()` 把本機CRLF轉LF，而API保留CRLF。改成 `remote_text.encode('utf-8') == Path.read_bytes()` 後，全部15個CSV原始位元相同。沒有修改任一fixture、golden、server或計算函式。

## 上線範圍與限制

只有私人 GitHub 儲存庫與 Vercel 公開合成示範。沒有購買網域、升級方案、建立DB或開啟模型。已連接main，但未另加CI測試gate；未來push前需自行執行README工程驗收。保留Vercel原有deployment protection，沒有關閉保護或公開source endpoint。

公開站可使用瀏覽器記憶體工作區；上傳欄位由本機File API讀取，沒有原始CSV上傳伺服器的新功能。重整清空。Live AI、正式平台API、跨session持久化、登入／多人共用、預測／最適預算均未支援。

建置log有既存ESLint deprecated、engine >=24未來可能升major、unrs-resolver install-script提示；本次雲端npm audit當下回0 vulnerabilities，不能視為未來安全保證。沒有更動lockfile迎合部署。

README／STATUS已更新現在的部署狀態；M0–M6歷史報告保留其當時「未部署」原文，不回寫成當時已上線。
