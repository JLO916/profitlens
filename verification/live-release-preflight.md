# Live AI 後發布：唯讀預檢

日期：2026-10-01（Asia/Taipei）。使用者要求先完成 Live AI 驗收，再發布目前系統。本檢查只盤點來源、GitHub 狀態與發布邊界；沒有 commit、push、部署或修改產品。此報告不能代替 Live AI 或發布後驗收。

## 已核對

| 項目 | 結果 | 實際證據與限制 |
|---|---|---|
| 專案／分支 | pass | `/Users/j-work/Desktop/profitlens-codex-starter`；main；本機 HEAD `04e186bf7be18102e2d23b71b9d4d74fe521a2f1` |
| GitHub remote | pass | origin 為 `https://github.com/JLO916/profitlens.git`；`git ls-remote origin refs/heads/main` 與本機 HEAD 相同 |
| GitHub 私人狀態 | pass | `gh repo view JLO916/profitlens --json url,isPrivate,defaultBranchRef`：isPrivate=true、main |
| GitHub CLI 身分 | pass | 允許網路的唯讀 `gh auth status` exit0，現有 JLO916 keyring 登入可用；未讀取／保存 token |
| 現行 Vercel production | pass | 唯讀 `get_deployment` 查詢正式 alias：`dpl_9ukTQ2nz21jQnBLEMUyaV3BRhfmX`，READY，source=git、target=production，commit 同為 `04e186bf7be18102e2d23b71b9d4d74fe521a2f1`；尚不含三批未提交改善 |
| 現行公開 AI gate | pass | 實際 `https://profitlens-tau.vercel.app/api/insights`：GET 200，available=false／PUBLIC_DEMO；空 JSON POST 403／PUBLIC_DEMO；兩者 Cache-Control=no-store。沒有傳 CSV、facts、key 或模型同意，沒有模型呼叫 |
| 環境檔排除 | pass | `.gitignore` 的 `.env*` 規則；唯一既有受追蹤環境檔為 `.env.example`；`.vercelignore` 亦排除所有 `.env*` |
| 私人資料與工具檔排除 | pass | `uploads/`、`data/private/`、`reports/private/`、`.vercel/` 被 Git 排除；Vercel CLI 包另排除 verification、reviews、測試、docs、scripts、工具目錄與 logs |
| public 目錄 | pass（檢查範圍內） | 目前不存在 `public/`，沒有可直接發布的私人 CSV 目錄；此項不是對所有圖片逐張進行個資辨識 |
| 樣本 API | pass（程式靜態檢查） | `src/app/api/datasets/[id]/route.ts` 只接受五個固定白名單；incoming ID 不直接形成路徑；manifest 必須 `source_type=synthetic` |
| Live AI 公開禁用 | pass（程式靜態檢查） | `readAiConfig` 優先檢查 `APP_MODE=PUBLIC_DEMO`／`PUBLIC_DEMO=true`；POST 在讀 body、建立 provider 前返回 403；發布後仍需真實 HTTP 重測 |
| 版本與依賴 | pass（差異盤點） | package／lockfile 不在目前改動清單；不要求安裝或新增套件 |
| 機密字串掃描 | pass（有限規則） | 576 份可追蹤文字檔、15,828,295 bytes：18 個檔案符合 key-like pattern，皆包含 ProfitLens／canary 標記，對应已有驗收中明示的假 canary；沒有其他命中。沒有輸出可能的秘密值；不等同完整秘密偵測工具或人工檢查每個二進位檔 |

`gh auth status` 在一般 sandbox 先回 exit1／invalid token。相同唯讀命令取得網路權限後 exit0，且 repo view、ls-remote 成功，因此不將第一個環境結果解讀為憑證失效，也沒有要求重新登入。

## 未追蹤檔案盤點與來源

盤點當刻共有 395 個未追蹤檔：docs 1、reviews 11、src 15、tests 20、verification 348。後續本輪驗收報告可能新增檔案；此數量是預檢快照，不代表最終 commit 數量。最大單檔約 2.4 MB，為失敗測試的文字紀錄。

六份新 CSV 的來源已具體核對：

- `reviews/ProfitLens_Manager_Review_20261001/live_golden_*.csv`：三份 CSV 與 `fixtures/golden/` 解析後每列、每欄完全相同；manifest 解析後也完全相同。原始 bytes 不相同是 CRLF／LF 和 JSON 格式差異，符合包內 `live_api_receipt.json` 的抄錄說明；沒有把它們冒稱逐 byte HTTP 原件。
- `verification/manager-batch1-synthetic-months/*.csv`：銷售、費用、廣告各 61 列，2026-08-01～09-30，DTC／TEST。既有 `manager-batch1-acceptance.md` 明示這些為合成日期比較演練。沒有收到或加入真實商家 CSV。
- 試用演練來源仍是既有 `tests/fixtures/alternative/` 合成安全測試資料，含故意的 CSV／HTML 注入測試字串。`pilot-rehearsal-acceptance.md` 記錄來源與截圖；`docs/PILOT_WORKSHEET.md` 的真人／真實成果欄仍待填。
- reviews 是使用者提供的原評閱包；verification 是各輪測試、合成瀏覽器操作、PDF 與 hash 證據。預檢依檔案來源、可讀收據及資料比對分類；沒有宣稱逐張重新閱覽全部 162 張 PNG／JPG 或所有 PDF。

## 後續 staging 原則

Live AI 驗收符合本轮停止條件後，發布責任者應先檢查最終 diff 與來源清單，再 stage 明確範圍：

1. 原有修改及新增的 `src/`、`tests/`、設定、README、docs、不可變原評閱包與合成 verification 證據。
2. 可保留既有失敗紀錄以追溯；不可改成通過或覆寫舊證據。
3. 排除 `.env.local`、其他環境檔、任何私人 CSV／已填敏感 pilot 表、原始模型 key、provider 原始 headers、快取、build 與 Playwright 大型報告目錄。
4. `.vercelignore` 只控制 Vercel CLI 上傳範圍；不能以此宣稱 GitHub push 或 Git 整合建置會略過那些檔案。GitHub 仍保持私人，公開 runtime 只暴露合成 API 白名單與產品路由。
5. commit 前重查秘密排除與最終新增檔；本輪 Live AI 若產生新產物，須另做逐檔審查，不能用這份預檢代替。

## 發布時必须維持

- 既有 GitHub 私人 repo 與 Vercel `jlo916s-projects/profitlens`，不建立新雲端專案、不改為公開 repo、不新增付費服務。
- Production／Preview／Development：`APP_MODE=PUBLIC_DEMO`、`PUBLIC_DEMO=true`、`ENABLE_LIVE_AI=false`；不將本機 Live AI key／model 值同步至公開環境。
- 發布後在實際 alias 確認 GET `/api/insights` 為 unavailable／PUBLIC_DEMO，POST 空 JSON 為 403／PUBLIC_DEMO；確認合成資料 API 與最新 UI，核對實際 deployment commit。
- 重新查 Vercel 三環境設定。此預檢只有讀取歷史部署收據，**沒有本輪重新查詢 Vercel 遠端環境值**。
- 使用者要求的「先 Live AI、再發布」順序不可跳過；缺 key／model 時，Live AI 維持未執行，發布也維持待執行。

## 本子任務未執行

Live AI、typecheck／lint／unit／build／E2E、瀏覽器互動、Vercel 環境 API、commit／push／deploy 均 not_run；由主驗收流程分別執行與記錄。沒有讀取 `.env.local`、keyring 內容、Vercel credentials 或任何秘密值。

命令：`git status --short`、`git remote -v`、`git rev-parse HEAD`、`git branch --show-current`、`git check-ignore -v ...`、`git ls-files '.env*'`、`gh auth status`、`gh repo view ...`、`git ls-remote ...`、`vercel --version`（53.3.1），另用 Python 標準庫做清單、CSV／JSON equality 和不輸出匹配值的有限 pattern scan。Vercel MCP `get_deployment({ idOrUrl: "profitlens-tau.vercel.app", teamId: "jlo916s-projects" })` 只讀 deployment metadata；Python urllib 實際送 GET 與空 JSON POST 檢查公開 AI gate。沒有進行遠端狀態變更。
