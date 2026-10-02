# Review v2 A 批發布驗收（2026-10-02）

**結論：pass，已發布既有 GitHub／Vercel。** 本輪只發布已完成 A 批；未改產品來源、財務定義、golden、依賴或開始 B–D。使用者明確授權「推送部署至github與vercel」。

## 發布識別

- GitHub：私人 [JLO916/profitlens](https://github.com/JLO916/profitlens)，main；產品 SHA `6c11a429dee50c08748891ade76b5972f72a593e`。
- 正式網址：[ProfitLens](https://profitlens-tau.vercel.app)。
- Vercel：既有 profitlens／jlo916s-projects；`dpl_7DMMB1jQ54FYy6C2AUDoZGj3e2nN` production READY，2026-10-02 02:44:09 UTC。公開 alias 反查同 SHA，aliasError=null。
- 框架 Next.js 16.3.7；雲端 install `npm ci`、build `npm run build`（next build --webpack），Build Completed 41秒，建立至READY約55秒。
- 後續文件提交只補發布證據；產品受測來源仍是上述提交。最後 main／alias 狀態再核對，避免把舊部署当作新提交。

## 實際命令與結果

| 檢查／命令 | 結果 | 說明 |
|---|---|---|
| 來源／protected SHA | pass | 139來源／測試、60protected、5golden相符；[checks](release-v2-a-20261002-checks.md) |
| `npm test -- --run` | pass（沿用） | 原 A 批40 files／819 tests；本次未重跑 |
| `npm run typecheck`／`npm run lint` | pass（沿用） | 原 A 批最終 logs；本次未重跑 |
| `npm run test:e2e`＋最後列印下載回歸 | pass（沿用） | 本機400＋4，1440／1280／768／390，0skip／unexpected／flaky；不當成線上結果 |
| 本機 production build | pass（沿用） | BUILD_ID `0U3urGYm_9KI-Zel0tOsR` |
| 發布包／有限秘密掃描 | pass（有限範圍） | [package audit](release-v2-a-20261002-package-audit.md)；原附件／合成下載／工程證據保留 |
| `git fetch origin main` | pass | 發布前HEAD／origin main差異0／0 |
| `git diff --cached --check -- README.md docs src tests playwright.config.ts` | pass | 不重排原附件與raw logs |
| `git commit -m "feat: release A batch operating and meeting workspaces"` | pass | 6c11a42，285檔；已實作產品、測試、規格及驗收證據 |
| `git push origin main` | pass | bb9173e..6c11a42 main -> main；未force push |
| 三次 `vercel env update NAME production --value VALUE --yes --scope jlo916s-projects` | pass | 僅APP_MODE=PUBLIC_DEMO、PUBLIC_DEMO=true、ENABLE_LIVE_AI=false；無key輸入或回傳 |
| 最後文件提交 `git diff --cached --check` | fail（原始log空白） | 10處雲端原始log空行含尾空白，保留原始紀錄；排除此raw log後自建文件／JSON檢查pass |
| 雲端 `npm ci`／`npm run build` | pass（新執行） | [cloud build](release-v2-a-20261002-cloud-build.txt)；沒有沿用本機build冒稱雲端成功 |
| `python3 verification/deployment-smoke.py verification/release-v2-a-20261002-http.json` | pass | 13/13；白名單五資料集位元相符；AI GET200 unavailable／POST403；敏感路径404 |
| 正式 alias／SHA | pass | [remote](release-v2-a-20261002-remote.md)／JSON |
| 真瀏覽器四尺寸／鍵盤 | pass（記錄範圍內） | [browser receipt](release-v2-a-20261002-online-browser.json)／online-1440、1280、768、390.jpg |
| 新部署5xx／project runtime errors | pass（短窗口） | 02:44:09.110–02:46:02.655 UTC未查到錯誤，受log延遲與當時流量限制 |
| 線上完整E2E／匯入／備份恢復／下載內容／列印 | not_run | 本輪只做發布smoke；原本機A批真實流程與26個下載檔另有證據 |
| Live AI／真實資料／成效／實體裝置／Safari／Firefox／壓力與長期可靠性 | not_run | 公開後端維持關閉，沒有模型呼叫或商業成效宣稱 |

## 正式站人工流程

Codex in-app browser，以新分頁開啟正式 alias；只用 Golden 合成資料，未上傳真實資料。實際核對255.00／−315.00；診斷建立全通路行動、確認引用與進行中備註，切DTC／商品頁返回仍保留原引用。分別建立DTC／MARKETPLACE方案，DTC284.00及K20後264.00、MARKETPLACE−6.50；修改時原結果撤下，切通路來回保留。

会議1000門檻、兩通路所選修訂、備註與補資料再議離頁保留；沒有加總通路改善額。清空觸發保存保護，Escape取消後保留會議與資料。Enter打開255.00來源，包含公式與8筆CSV來源，Escape關閉。1440／1280／768／390px截圖目視無遮蓋或欄位溢出；三窄尺寸另核對document scrollWidth=clientWidth；console warn/error=[]。

操作限制：一個精確關閉名稱locator未匹配，重新讀取可見控制後用可見關閉名稱按Escape成功；未修改產品迎合定位。日期欄位填入沒有出现在摘要，未把期限填入當作本次通過項，原A批測試仍保留。沒有宣稱本次手動取得下載位元或測試備份恢復。

## 安全與已知限制

既有GitHub仍PRIVATE；環境metadata只有三個公開模式旗標，未見OPENAI_API_KEY，未讀取實際credential。公開AI必須後端403，已實測，不僅隱藏按鈕。白名單manifest及CSV與合成fixtures一致；/.env、/.git/config、verification、原始fixtures及未知資料集均404。有限秘密掃描不是通用掃描或全部binary OCR。

雲端既有warning：Node engines >=24可能採未来大版、eslint9.39.5已deprecated、unrs-resolver postinstall未列allowScripts。本次build成功，未做範圍外升級。未建立新專案、變更repo可見性、啟用付費Live AI或開始新milestone。

[原A批完整驗收](review-v2-a-acceptance.md)、[發布前遠端核對](release-v2-a-20261002-preflight.md)、[push與公開模式設定紀錄](release-v2-a-20261002-publish.json)。
