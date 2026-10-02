# Review v2 A 批驗收：營運與會議狀態分離

驗收期間：2026-10-01～2026-10-02，Asia/Taipei。範圍僅 A1–A3；B–D、Live AI、發布均未執行。A1–A3 已完成本機驗收。全套 400 項 E2E 通過後，最後無置頂提示修正另建置並通過 4 項四尺寸列印／下載回歸；不是把歷史或附件轉錄測試算成本次結果。

## 來源與交付邊界

- 開工 Git HEAD：`bb9173edae9a28eb1970c5a968f1165b0ce64bb5`。保留原規格、fixture、歷史評閱與驗收證據。
- 使用者提供的 ZIP 九份原件另存 `reviews/profitlens_review_v2_20261001/`。以 ZIP member 與解壓後 SHA-256 核對；未執行附件中的轉錄邏輯測試。完整性清單見 `review-v2-a-integrity.json`、`review-v2-a-preservation-final.json`；最後來源／測試與改動清單為 `review-v2-a-source-inventory.json`，26 件實際合成下載檔 SHA-256 見 `review-v2-a-download-inventory.json`。
- 本機變更：行動管理／引用歷史、多通路工作輪次、固定範圍單份會議、v3 備份及共同替換保護。沒有新 server API、套件變更、公式變更、目標引擎、跨分頁同步或自動持久化。
- 所有操作資料為既有 golden、demo、errors 或 `tests/fixtures/alternative` 合成資料。未讀取私人營運資料或真實 API key。

## 驗收矩陣

| 項目 | 結果 | 實際證據／限制 |
|---|---|---|
| VA01 行動引用、完整性與執行狀態獨立 | pass | `tests/v2-actions.test.ts`；原全通路引用在 DTC／商品檢視仍保留，管理更新不撤銷確認；四種執行狀態與 2,000 字限制。引用確認不等同敘述、因果或成效成立。 |
| VA02 明確重綁與連續歷史 | pass | 同 fact ID 不同金額、取消／提交、null、coverage、過期與被竄改預覽、原期別／scope、連續 history。行動 E2E 把合成 DTC 廣告 270 改 370，原貢獻 270 保留，預覽新貢獻 170，取消不變、確認後新舊並存；未修改 fixtures。 |
| VA03 多通路方案 | pass | 每個 epoch／data／period／mode／單通路最多三方案；DTC 與 MARKETPLACE 各三案。切檢視仍可編輯；換資料或期間後保留歷史且回切不復活。編輯撤下結果、既算修訂保留，歷史複製清空假設。 |
| VA04 單份固定會議與置頂 | pass | `tests/v2-review.test.ts`、v3 roundtrip；門檻 1000、各通路一修訂、三置頂五附錄；離頁／恢復保留；目標 null。會議固定範圍與目前檢視不同時明示。 |
| VA05 明確更新引用／共用投影 | pass | 舊方案及行動引用保留、差異提示及人工更新，來源或引用更新撤回草稿；畫面／Markdown／列印共用會議投影。最後補修無置頂但有附錄時的提示；先 red，再 28 項 focused unit、全套 819 unit 及四尺寸列印／下載回歸通過。 |
| VA06 v1／v2／v3 備份 | pass | 原格式 checksum 先驗後遷移，legacy stale 不復活；來源 hash 去重，每來源重驗及方案重算。偽造 source／filter／current status／version、懸空引用、超限整包拒絕；AI 同意不恢復。64 MiB 限制；本機儲存需明確同意。 |
| VA07 共用替換保護 | pass | 四入口同一 production guard；save/discard/cancel、下載確認、本機保存失敗、版本競爭；CSV／restore 取消保留候選、錯檔保留舊資料、較晚選擇不被早到／晚到操作覆寫。 |
| VA08 匯出與安全回歸 | pass | 安全 CSV／Markdown／JSON、XSS、來源版本、AI mock stale、PUBLIC_DEMO server gate 與獨立 browser context；client bundle 有限 canary／key 標記掃描。無 Live AI 呼叫；最後 production server 實測 GET 200 unavailable／PUBLIC_DEMO、POST 403／PUBLIC_DEMO。 |
| VA09 工程／四尺寸真瀏覽器／下載 | pass | 819 項 unit/integration（含最後提示修正）完整綠燈；typecheck／lint pass。完整 E2E 400 項與最後 4 項回歸通過；無 skipped／unexpected／flaky。 |

## 實際命令

所有命令均在專案根目錄執行；`.txt` 為本輪原始輸出。沒有把未執行寫成通過。

| 命令／檢查 | 結果 | 證據 |
|---|---|---|
| `npm test -- --run`（改動前） | pass：34 files／766 tests | `review-v2-a-baseline-unit.txt` |
| 新增 production 測試先跑 red | fail，符合先寫失敗測試 | `review-v2-a-actions-red.txt`、`review-v2-a-meeting-red.txt`、`review-v2-a-backup-red.txt`、`review-v2-a-replacement-red.txt`、`review-v2-a-export-red.txt`；不是從 production 金額生成 expected。 |
| `npm run typecheck` | pass，exit 0 | `review-v2-a-typecheck-final.txt`；實際 `next typegen && tsc --noEmit` |
| `npm run lint` | pass，exit 0 | `review-v2-a-lint-final.txt`；`eslint . --max-warnings=0` |
| `npm test -- --run`（整合） | pass：40 files／819 tests | `review-v2-a-unit-final.txt`；最後提示修正後全套重跑。 |
| `npm run test:e2e -- --workers=2` | pass：400／400，exit 0 | `review-v2-a-e2e-final.txt`、`review-v2-a-e2e-full-results.json`；每尺寸 100 項，16.3 分鐘，0 skipped／unexpected／flaky，retries 0。 |
| `npm run test:e2e -- tests/e2e/review-v2-a-export.spec.ts --workers=2` | pass：4／4，exit 0 | 最後提示修正的四尺寸列印／真下載回歸，1.1 分鐘；`review-v2-a-export-e2e-final.txt`、`review-v2-a-export-e2e-results.json`，0 skipped／unexpected／flaky。不是宣稱同一命令跑完 404 項；現在完整命令會包含新案例。 |
| `NEXT_TELEMETRY_DISABLED=1 npm run build` | pass，兩次 E2E webServer 實際執行 | `playwright.config.ts` 使用 `npm run build && npm start -- --port 3100`，build 成功才啟動 production server；沒有省略 build 或拿 dev 代替。最後 BUILD_ID `0U3urGYm_9KI-Zel0tOsR`；`review-v2-a-final-build-id.txt`。 |
| SHA-256 原件／domain／fixtures／依賴保留 | pass | 60 件 protected＋9 件 ZIP 原件相符；原 ZIP 亦相符。 |
| client 靜態資產有限掃描 | pass（最後建置） | 23 件資產，指定假 canary／server key marker／key-like pattern 0 匹配；`review-v2-a-preservation-final.json` 記錄最終 inventory。未讀取真實 `.env`。 |
| 本機 PUBLIC_DEMO HTTP 檢查 | pass | Python urllib.request 實際 GET／POST `{}`；GET 200 unavailable、POST 403，reason 均 PUBLIC_DEMO；`review-v2-a-public-gate-http.json`，無模型或 raw facts。 |
| `git diff --check -- README.md docs src tests playwright.config.ts` | pass | source／文件 whitespace 檢查；原件與 raw logs 保留原樣，不為通過而改附件。 |

### 已發生的失敗與處理

- 最初 E2E 在 sandbox 啟動本機 3100 遇 `listen EPERM`，未跑案例；依正常權限流程取得本機 server 權限後執行，未要求關閉 sandbox。最後 Python localhost HTTP 也先遇 sandbox `Operation not permitted`，正常核准本機 socket 權限後通過。
- 初期整合的型別、引用 revision 及備份 current context 檢核失敗均保留原始 logs；補上不可變 source、legacy pins、historical meeting draft 與 async 最新 state 防線。當時完整單元重跑 818 項通過，最後含提示與四入口保存矩陣的全套為 819 項。
- Desktop first：80 pass／20 fail；舊測試仍按切通路即 stale 的語意、尚未建立 context 就取方案元件，以及動態 locator 等問題，依核准語意修正，保留真正資料／期間失效及 golden assertions。
- Desktop second：98 pass／2 fail；一項將 Markdown 精確字串 `1000.00` 誤期待為格式化 `1,000.00`，另一項歷史工作稿 `details` selector 同時匹配三個元素。修正測試定位與格式期待，不改財務答案。最後完整重跑 400 項通過。

## 實際瀏覽器操作與證據

1. Codex in-app browser CUA，`http://127.0.0.1:3300/`，實際選取替代三 CSV 與 manifest；確認口徑、預覽及套用。商品淨營收 600.00、行銷後貢獻 10.00、差額 −130.00；開啟數字來源核對，Escape 關閉。
2. DTC 方案：銷量 0%、折扣 0 百分點、單位履約 −50%、廣告 0%、投入 3，明確接受假設後計算 44.00（baseline 40.00）；MARKETPLACE 零變動 −30.00。往返通路確認原方案保留。這些是假設結果，不是改善收益。
3. 從全部通路會議建立行動，切 DTC 檢視後編輯角色、2026-10-09 期限、進行中與進度備註，引用確認及置頂。會議命名「A 批合成資料驗收會議」、門檻 1000、各通路選一方案、決議「補資料再議」。
4. 明示同意保存本機副本，清空分頁，再手動讀取／預覽／恢復；核對兩方案、會議門檻、決議、行動角色／期限／進度。非自動恢復；普通重新整理仍清空記憶體。
5. 1440×1000、1280×900、768×1024、390×844 實際切 viewport 並目視會議畫面，未見頁面水平溢出；1280／768／390 的 document scrollWidth 分別 1265／753／375。保存 `review-v2-a-manual-{1440,1280,768,390}.jpg`。Enter 計算、Escape 關閉及 Tab 欄位操作均實際執行。warn/error logs 為空，詳 `review-v2-a-manual-browser.json`。
6. 人工點下載備份後，CUA download 事件逾時，未取得位元。**不宣稱人工下載內容已驗證**。實際下載內容由 Playwright E2E 擷取及讀回核對，另存 `review-v2-a-workspace-*.json`、`review-v2-a-meeting-*.md`、`review-v2-a-decision-*.{md,csv,json}`。CSV 使用獨立 reader 核對 8 行動、置頂、來源與 255.00；UI／MD／print 檢查主體三項／附錄五項，以及取消全部置頂後主體零項／附錄八項。列印採 Chromium 真實 print media、畫面截圖及 A4 PDF；只替換阻塞的 OS print 呼叫，沒有實體列印。

最後以 BUILD_ID `0U3urGYm_9KI-Zel0tOsR`、PUBLIC_DEMO 在同一 3300 重啟，再由 CUA 重新整理確認空工作區，手動讀取／預覽／恢復先前本機副本。門檻1000、兩通路方案44.00／−30.00、決策補資料再議、行動進度及期限均保留；新 warn/error 仍為空。截圖 `review-v2-a-final-meeting-1280.jpg`。本機預覽保留於 [3300](http://127.0.0.1:3300/)，原3200程序未更動。

人工瀏覽器並非真人營運試用評分；四 viewport 是 Chromium 模擬視窗，不代表 Safari 或實體手機／平板驗收。

## 變更檔案與使用方式

- 行動：`src/application/action-workspace.ts`、`src/components/actions-workbench.tsx`、`src/application/decision-export.ts`。
- 方案與會議：新增 `scenario-workspace.ts`、`review-session.ts`、`workspace-decision-export.ts`、`multi-scenario-workbench.tsx`、`review-workbench.tsx`；修改 `manager-summary.ts`／`.tsx`。
- 備份與整合：`workspace-backup.ts`、`workspace-storage.tsx`、`dashboard.tsx`；新增 `replacement-guard.ts`、`replacement-dialog.tsx`。
- 測試：六份 `tests/v2-*.test.ts`、既有 action／backup regression；新 `tests/e2e/review-v2-a.spec.ts`、`review-v2-a-export.spec.ts`、replacement helpers；調整現有 E2E 適用已核准的 context 與替換保護流程。Playwright 新增 1280px，測試輸出使用本批 prefix，保留歷史檔。
- 文件：README、STATUS、ARCHITECTURE、SCENARIOS、ACCEPTANCE、DECISIONS 與本批證據。實際檔案清單可用 `git status --short` 查閱；未建立 commit／push／deployment。

本機 `npm run dev -- --port 3200`（若該 port 已有使用者程序，另選未占用 port）；載入 demo 或從資料工作區匯入三 CSV。情境頁選單通路後建立工作區；每通路最多三方案。總覽的會議來源固定，選方案修訂與行動置頂後，明確設定決議；「更新會議資料／範圍」才換來源。手動下載／同意本機儲存 v3，再從保存與恢復預覽套用。切換資料或清空遇未儲存提示，可保存、不保存繼續或取消。

## 未執行與限制

| 項目 | 狀態／原因 |
|---|---|
| Live AI、真人品質評分 | not_run；本批未接模型，全部 AI 為 mock／server gate 回歸，不能宣稱已連線。 |
| 真實營運資料、真實商業成效 | not_run；只用合成資料，行動完成／採用方案不代表成效成立。 |
| Safari／Firefox／實體桌機、手機、平板／印表機 | not_run；只驗 Chromium 模擬尺寸與列印媒體。 |
| GitHub push、Vercel deploy、正式站線上驗收 | not_run；本批明確不發布，既有正式站不能視為已含 A 批。 |
| B–D、敏感度保存、多場會議封存、目標版本 | not_run；超出本批，target_version 維持 null。 |
| 本機持久化耐久性／大規模負載 | 未做長期或全瀏覽器壓測；有上限拒絕、儲存失敗與原資料保留測試。本機副本依瀏覽器儲存政策，下載檔需自行妥善保存。 |

本批完成後停止，不自動進入下一批或發布。
