# 管理者改善版本：系統發布紀錄

日期：2026-10-01（Asia/Taipei）。使用者最新要求「先做系統發布」，已取代上一輪 Live AI 先行門檻。本次發布既有三批管理者改善、合成驗收證據及使用文件，不增加產品功能。

## 發布範圍與邊界

- 既有私人 GitHub：`JLO916/profitlens`，main。
- 既有 Vercel：`jlo916s-projects/profitlens`，Production alias `https://profitlens-tau.vercel.app`。
- 公開模式：APP_MODE=PUBLIC_DEMO、PUBLIC_DEMO=true、ENABLE_LIVE_AI=false；沒有上傳 OpenAI key。
- 三批改善：期間／自然月比較、主動保存與恢復、欄位與口徑對帳、主管摘要、跨範圍行動、商品兩期比較、情境門檻／敏感度、會議匯出、中文診斷與 AI 可用性提示。
- 不更改商業公式、golden 答案、原 fixtures、套件或 lockfile。Live AI、真實營運資料試用與商業成效維持未驗證。

## 本次實際結果

| 項目 | 結果 | 證據／限制 |
|---|---|---|
| typecheck／lint／unit | pass | 本輪重新執行，34 files／766 tests；`release-20261001-*` logs |
| Git／發布包審查 | pass（有限檢查） | 分開盤點候選檔、secret 排除與合成資料來源；630份文字有限掃描無未解釋命中，原評閱包11檔保留；未對所有圖片做OCR。`release-20261001-package-audit.md`／JSON |
| Vercel 專案設定 | pass（記錄範圍） | CLI GET確認既有 Next.js／Node24.x／私人 GitHub main；preview、development三旗標plain值符合；production三旗標以 `vercel env update <name> production --value <non-secret-value> --yes --scope jlo916s-projects` 明確設定成功。key存在性為false，未讀／輸出任何key |
| build／全部E2E | pass | `npm run test:e2e -- --config verification/release-20261001-e2e.config.ts`，282 passed，三尺寸各94，retries0；流程實際先執行 production build，BUILD_ID `lHUOyzPXNUWjxCt_69L8j`。原spec保留，本輪副本僅重定向證據路徑；初次build成功但listen3100被sandbox EPERM擋住，當次未跑瀏覽器；保留first log，正常權限重跑 |
| 本機client bundle／來源完整性 | pass | 23個資產沒有本輪非秘密canary／server-only標記；122檔來源hash全數符合既有受測快照。`release-20261001-bundle-security.json`／`source-check.json` |
| staged diff 空白檢查 | 原附件／raw logs例外；source pass | 完整 `git diff --cached --check` 回exit2：原評閱包Markdown尾端雙空白、原始測試logs的EOF空行及CRLF輸出。保留原附件／真實log，不改寫證據；產品、測試、設定、自建Markdown／JSON／腳本的限定檢查exit0。`release-20261001-staged-check.json`列明例外，不把完整check寫成pass |
| commit／push／deploy | pass | `git commit -m "feat: release verified manager decision workspace"`、`git push origin main` exit0；04e186b → `2f8e539c22a3afc0260c6db08f9570b80eaebdb6`。Vercel Git整合建立 `dpl_C6WoYoo811nLC1578zNf434ycXrN`，production READY、公開alias同SHA；未建立新專案。後續只補本次文件及線上證據 |
| 雲端建置 | pass | 既有Vercel實際執行 `npm ci`、`npm run build`，2026-10-01T11:19:55.728Z READY；`release-20261001-cloud-build.txt` |
| 線上HTTP／公開AI守門 | pass | `python3 verification/deployment-smoke.py verification/release-20261001-http.json` exit0，13/13；5套合成資料與本機位元一致；AI GET unavailable／PUBLIC_DEMO、POST403；敏感／非允許靜態路徑404。首次sandbox DNS fail，正常核准後重跑，不隱藏首次失敗 |
| 線上人工真瀏覽器 | pass（以下範圍） | Codex in-app browser，1440×1000／768×1024／390×844；匯入→診斷→試算→行動→匯出按鈕，demo／Golden切換及stale。`release-20261001-online-browser.json`與三張online截圖；當次warn/error為空 |
| 短窗口runtime檢查 | pass（有限觀察） | 新部署READY後查deployment 5xx與project runtime errors無記錄；不代表長期可用性，詳`release-20261001-remote-checks.md` |
| 正式站全套282 E2E／人工下載位元 | not_run | 全套E2E與Markdown／CSV／JSON真下載內容核對在本機production；人工正式站只確認按鈕及成功訊息，未取得下載位元，不混稱 |
| Live AI／真人品質 | not_run | 未呼叫模型、未填真人效率或商業效益 |

MCP `get_project` 初次因工具介面轉接參數 `projectId`／`idOrName` 不符失敗，改用既有 Vercel CLI 的唯讀 project API 成功；未以失敗結果判斷專案不存在。`.vercelignore` 僅控制 CLI 上傳，不宣稱它會讓 Git push 排除驗收文件；GitHub 保持私人，公開 runtime 只暴露產品路由與白名單合成資料。

## 正式站操作證據

1. 載入demo後，畫面淨營收7,850,657.90、行銷後貢獻1,269,792.73；1440px沒有整頁橫向溢出。
2. 使用真正檔案選擇器選取 `tests/fixtures/alternative/` 的三CSV及manifest（全部合成）。未確認金額口徑時阻擋並保留demo；確認後檢核通過、九項來源差額為零，套用後本期N600.00／CM10.00，證明不是畫面固定數值。
3. 篩選DTC，鍵盤Enter打開40.00公式來源抽屜，8筆來源與檔名／行號可查；390px目視，Escape關閉。
4. 明確輸入銷量0%、折扣0百分點、履約−50%、廣告0%、一次性3並接受顯示假設，條件CM44.00、相對基準40.00差+4.00；768px目視，並列精確公式／金額。這是合成條件結果，非預測或收益承諾。
5. 從DTC「淨營收增加，行銷後貢獻下降」建立行動，保留4項原fact，填負責角色／指標／期限／停止條件後確認成功；Markdown／CSV／JSON按鈕均回報已下載。未將人工按鈕成功當作取得檔案位元。
6. 切Golden後N2470.00／CM255.00／差額−315.00符合固定答案；原方案停用標過期，原行動保留歷史證據。公開AI提示始終未啟用；本輪沒有送資料給模型。

上述圖片已實際目視；表格有自身橫捲，不等於整頁溢出。尺寸是桌面Chromium viewport模擬，非實體手機／平板測試。

## 變更、限制與後續

本次發布既有三批成果，新增發布驗收設定／spec證據副本及logs，更新README／STATUS；沒有改產品來源、固定答案或套件。受測程式版本是 `2f8e539`，後續文件提交只補線上發布證據，不改受測產品。

Vercel MCP build log工具不可用，改用 `vercel inspect profitlens-dgtltbjkq-jlo916s-projects.vercel.app --logs --scope jlo916s-projects` 取得建置紀錄。雲端有非阻塞維護警告：Node engines `>=24.0.0` 可跨主版、eslint套件支援期限、unrs-resolver postinstall未在allowScripts；本輪未自行升級或擴大腳本權限。

Live AI、真人品質評分、真實資料試用、Safari／讀屏／實體裝置、負載與長期監控未執行。程式支援本機明確同意保存／恢復，沒有伺服器帳號、雲端同步、平台API、預測或自動操作廣告。下一步待另行指定Live AI或真實資料試用；本輪完成系統發布即停止。

文件及線上證據提交前再次執行 `git diff --cached --check`：原樣保存的雲端build log有10處時間戳後空白，因此全量exit2；排除該raw log後檢查exit0。沒有改寫雲端log，也沒有把全量檢查寫成通過。
