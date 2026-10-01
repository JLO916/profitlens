# 管理者改善版本：系統發布紀錄

日期：2026-10-01（Asia/Taipei）。使用者最新要求「先做系統發布」，已取代上一輪 Live AI 先行門檻。本次發布既有三批管理者改善、合成驗收證據及使用文件，不增加產品功能。

## 發布範圍與邊界

- 既有私人 GitHub：`JLO916/profitlens`，main。
- 既有 Vercel：`jlo916s-projects/profitlens`，Production alias `https://profitlens-tau.vercel.app`。
- 公開模式：APP_MODE=PUBLIC_DEMO、PUBLIC_DEMO=true、ENABLE_LIVE_AI=false；沒有上傳 OpenAI key。
- 三批改善：期間／自然月比較、主動保存與恢復、欄位與口徑對帳、主管摘要、跨範圍行動、商品兩期比較、情境門檻／敏感度、會議匯出、中文診斷與 AI 可用性提示。
- 不更改商業公式、golden 答案、原 fixtures、套件或 lockfile。Live AI、真實營運資料試用與商業成效維持未驗證。

## 執行中紀錄

| 項目 | 結果 | 證據／限制 |
|---|---|---|
| typecheck／lint／unit | pass | 本輪重新執行，34 files／766 tests；`release-20261001-*` logs |
| Git／發布包審查 | pass（有限檢查） | 分開盤點候選檔、secret 排除與合成資料來源；630份文字有限掃描無未解釋命中，原評閱包11檔保留；未對所有圖片做OCR。`release-20261001-package-audit.md`／JSON |
| Vercel 專案設定 | pass（記錄範圍） | CLI GET確認既有 Next.js／Node24.x／私人 GitHub main；preview、development三旗標plain值符合；production三旗標以 `vercel env update <name> production --value <non-secret-value> --yes --scope jlo916s-projects` 明確設定成功。key存在性為false，未讀／輸出任何key |
| build／全部E2E | pass | `npm run test:e2e -- --config verification/release-20261001-e2e.config.ts`，282 passed，三尺寸各94，retries0；流程實際先執行 production build，BUILD_ID `lHUOyzPXNUWjxCt_69L8j`。原spec保留，本輪副本僅重定向證據路徑；初次build成功但listen3100被sandbox EPERM擋住，當次未跑瀏覽器；保留first log，正常權限重跑 |
| 本機client bundle／來源完整性 | pass | 23個資產沒有本輪非秘密canary／server-only標記；122檔來源hash全數符合既有受測快照。`release-20261001-bundle-security.json`／`source-check.json` |
| staged diff 空白檢查 | 原附件／raw logs例外；source pass | 完整 `git diff --cached --check` 回exit2：原評閱包Markdown尾端雙空白、原始測試logs的EOF空行及CRLF輸出。保留原附件／真實log，不改寫證據；產品、測試、設定、自建Markdown／JSON／腳本的限定檢查exit0。`release-20261001-staged-check.json`列明例外，不把完整check寫成pass |
| commit／push／deploy | not_run | 完成發布前檢查後執行 |
| 線上HTTP／實際瀏覽器 | not_run | 新版READY後執行 |
| Live AI／真人品質 | not_run | 未呼叫模型、未填真人效率或商業效益 |

MCP `get_project` 初次因工具介面轉接參數 `projectId`／`idOrName` 不符失敗，改用既有 Vercel CLI 的唯讀 project API 成功；未以失敗結果判斷專案不存在。`.vercelignore` 僅控制 CLI 上傳，不宣稱它會讓 Git push 排除驗收文件；GitHub 保持私人，公開 runtime 只暴露產品路由與白名單合成資料。

本報告會在發布與線上驗收實際完成後更新；以上「執行中」不是通過。
