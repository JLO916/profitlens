# Live AI 驗收與發布：執行紀錄

日期：2026-10-01（Asia/Taipei）。使用者授權順序為「先 Live AI 驗收，再系統發布」。目前停在本機連線設定：本輪安全檢查未找到 `OPENAI_API_KEY` 或 `OPENAI_MODEL`，**Live AI 未執行、GitHub push 與 Vercel 發布未執行**。沒有把 mock、SDK 文件核對或既有公開站當作即時模型驗收。

## 本輪結果

| 項目 | 結果 | 命令／證據與範圍 |
|---|---|---|
| 本機設定 | not_run（Live 前置缺失） | 以 `@next/env` 的 `loadEnvConfig` 讀取標準本機設定，只保存存在性；無 env 檔、key=false、model=false。`live-ai-config-preflight.json`。沒有讀取無關憑證來源或輸出 key |
| SDK 用法核對 | pass（文件／程式範圍） | 現有 OpenAI SDK 7.25.0 使用 Responses API 的 `text.format.type=json_schema`、`strict=true`；官方 Structured Outputs 文件支援此方式。尚未驗證使用者所選模型與帳戶權限 |
| typecheck | pass | `npm run typecheck` exit0；`live-release-typecheck.txt` |
| lint | pass | `npm run lint` exit0；`live-release-lint.txt` |
| 全部 unit/integration | pass | `npm test -- --run` exit0，34 files／766 tests；`live-release-unit.txt`。AI provider、失敗降級與注入案例使用 mock，不是 Live |
| 合成案例離線準備 | pass（準備範圍） | `./node_modules/.bin/vitest --config verification/live-ai-prepare.config.mts --run`，1 test 覆蓋20個有效候選、40 facts／案、固定 anchors、匿名化與 fetch=0；另確認2個 blocking 不產生模型候選。`live-ai-prepare-result.txt`。所有 Live／語義評分仍 not_run |
| 原受測來源核對 | pass | Python SHA-256 核對前輪 122 個來源／測試／設定，全數與第三批快照相同；`live-release-source-check.json` |
| GitHub／安全發布預檢 | pass（記錄範圍） | `gh auth status`、`gh repo view`、`git ls-remote` 與 ignores／有限文字掃描；詳見 `live-release-preflight.md`。一般 sandbox 身分查詢曾失敗，相同唯讀命令允許網路後成功，不需重新登入 |
| Live smoke／20 案內容評分 | not_run | 無 key／model，沒有呼叫 OpenAI，沒有 token usage、模型回覆或人工品質分數 |
| 本輪 build／E2E／瀏覽器 | not_run | 尚未進入 Live 或發布階段，沒有修改產品程式。前輪 build／282 項 E2E 與後續合成演練有各自歷史紀錄，不記為本輪通過 |
| Git commit／push／Vercel deploy | not_run | 遵守 Live 先於發布的使用者順序。遠端 main 仍為 `04e186bf7be18102e2d23b71b9d4d74fe521a2f1` |
| 舊版 Vercel metadata／公開 AI gate | pass | 唯讀查正式 alias：`dpl_9ukTQ2nz21jQnBLEMUyaV3BRhfmX`，READY／production、同 `04e186b`；GET `/api/insights` unavailable／PUBLIC_DEMO、空 JSON POST403／PUBLIC_DEMO，no-store。詳見預檢；不是新版部署驗收 |
| Vercel 遠端環境／新版發布後驗收 | not_run | 沒有讀取遠端環境值；尚未發布新版。公開端點關閉的觀察不能代替三環境設定核對 |

官方參考：[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)。格式有效不保證事實正確，仍需既有 grounding 驗證與逐案語義檢閱。

離線準備器的第一次測試未通過：新增 L18 比率 anchor 寫成 `0.1`，既有 contract 的精確字串為 `0.100000000000`；修正這個新增案例的字串格式後通過。沒有改數值、production 函式、原 fixtures 或 golden expected。初始失敗保留在 `live-ai-prepare-first.txt`，不冒稱第一次即通過。

## 可接續執行的條件

1. 在專案根目錄 `.env.local` 私下設定 `OPENAI_API_KEY` 與 `OPENAI_MODEL`（可參考 `.env.example`），只回報已設定或專用本機檔案路徑；不把 key 貼到聊天。測試服務須使用本機 live 開關，既有 PUBLIC_DEMO 預覽及公開站維持關閉。
2. 先核對合成 Golden smoke 的傳送預覽：兩期所選通路合計 facts、匿名通路代碼、期間、版本、來源筆數及 observation catalog；不傳原始 CSV、SKU、真實通路名稱、訂單或客戶資料。取得該預覽的同意後才發送。
3. smoke 通過後依 `live-ai-evaluation-plan.md` 執行限定案例。每案保存模型、prompt version、時間、usage、狀態與 grounded 輸出；fallback 不當成功。語義檢閱另記證據支持、因果／越權與驗證步驟；沒有真人試用就不填真人修改量或效率成效。
4. 真實驗收達標後再執行發布檢查、最終 diff／秘密檢查、必要 build／E2E，推送既有私人 GitHub 與 Vercel 專案。若失敗，先記錄／修復／重驗，不跳過順序。
5. 發布必須維持 `APP_MODE=PUBLIC_DEMO`、`PUBLIC_DEMO=true`、`ENABLE_LIVE_AI=false`；不把本機 key 同步到公開環境。發布後核對 deployment commit、真瀏覽器與公開 GET unavailable／POST403。

本輪只新增驗收準備與紀錄，未修改商業定義、golden 答案、產品 source、依賴或 lockfile。真實營運資料試用、真人效率與商業成效仍未驗證。
