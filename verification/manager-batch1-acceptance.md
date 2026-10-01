# 管理者改善第一批驗收（PL-01–04）

日期：2026-10-01。此報告只對應本機未提交版本；基底 Git HEAD `04e186bf7be18102e2d23b71b9d4d74fe521a2f1`。未推送 GitHub、未部署 production，未開始評閱第二／三批。全部驗收使用合成資料，未使用真實營運／個資或真實模型。

## 依據與範圍

安全解壓並讀取 `reviews/ProfitLens_Manager_Review_20261001/` 全部 11 檔，包括建議、問題清單、固定答案、日期探針、Python／JS 腳本及線上合成資料副本。檢查腳本後才於本機執行，輸出另存 `manager-batch1-reviewed-date-extract.json` 與 `manager-batch1-reviewed-golden.json`，未覆寫附件。日期原問題可重現：八月／九月被 UNEQUAL_PERIOD_LENGTH 拒絕，反向前後期被接受。原 golden 的前期 570.00／本期 255.00 與獨立重算一致。

先核對現有專案，未重新初始化。唯讀檢查 production deployment `dpl_9ukTQ2nz21jQnBLEMUyaV3BRhfmX` 為 READY 且 source commit 與上述 HEAD 相同；本輪不修改該 deployment。附件的其他批次及發佈建議不是本輪自動執行授權。

## 逐項結果

| 項目 | 狀態 | 實際證據／邊界 |
|---|---|---|
| PL-01 預設零持久化 | pass | 原匯入／AI／scenario E2E 仍驗證零 HTTP、零 localStorage/sessionStorage/IndexedDB；save opt-in 預設未勾，明確保存才新增 DB |
| PL-01 完整備份與恢復 | pass | `workspace-backup.test.ts`、`workspace-storage.spec.ts`；JSON schema／checksum／大小、canonical mapping、CSV 重驗；不保存 baseline／derived result，恢復重算；兩方案 284.00／264.00 與已確認行動可還原 |
| PL-01 錯檔／partial／過期 | pass | 損毀、篡改、舊版本、錯範圍不取代 active；partial 保留 unknown；歷史原輸入重驗，stale latch 保存，換回原範圍不復活 |
| PL-01 保存與跨分頁 | pass | 真 IndexedDB 保存，重整回空，手動預覽再套用；同 origin 另一頁不自動讀取；獨立 context 原有隔離回歸仍過；沒有跨頁監聽或同步 |
| PL-01 清空／離開／刪除 | pass | beforeunload 出現一次；清空可取消；完成清空會卸載備份預覽、候選 CSV、同意與下載確認；已保存副本需另行刪除；刪除不清空 active 或其他分頁 |
| PL-02 兩種日期模式 | pass | `period-comparison.test.ts` 14 案例與 12 E2E；完整八月 31 天／九月 30 天可算，前期須早於本期；未完整月、反向、as_of／coverage 外拒絕，blocking 保留舊資料 |
| PL-02 固定手算／日均 | pass | 61 日固定合成 E2E／人工：每日 G=100、C=40、P=5、F=10、A=20，貢獻=25；八月合計775、本期750、差−25；兩期日均25、差0。合計不截日；零、null、長數值與取分差測試通過 |
| PL-02 AI／匯出一致 | pass | `ai-snapshot-v2` 模式及天數可驗；40 facts 仍為合計，日均冒充合計／反之被拒；CSV 與決策三格式含 mode／days，filter hash 與 stale 一致；live 未執行 |
| PL-03 中文首次匯入 | pass | 三標準空白範本可真下載；中英欄位與日通路商品／日通路粒度說明；日期／通路聯集只提議，按確認才填入，coverage 完整性仍由使用者另確認 |
| PL-03 訂單級邊界 | pass | 重複 sales key 保持 blocking，說明需按標準粒度在來源整理；未新增靜默彙總或猜測mapping |
| PL-04 來源對帳 | pass | 來源 mapped 欄位合計→標準欄位→N／GP／before／after；全 coverage 對帳與當期篩選明確區分；缺成本為 unknown、另列已知小計；未知原欄位仍需確認忽略 |
| PL-04 口徑檢查 | pass | 含稅／已扣折扣退款費用淨額／未知來源 blocking；換 CSV／mapping 後撤銷確認；運費收入、平台補助與固定費等未涵蓋項目明列，不自動除稅或補成本 |
| 財務／安全回歸 | pass | 全部 C01–C18、S01–S07 與既有 615 unit/integration 回歸；全 225 E2E 含 U01–U11、已知 AI grounding／stale／注入與隔離。固定 golden 未改 |
| 全部工程檢查 | pass | typecheck、lint、663 unit/integration、production build、225 E2E，見下表 |
| 真實瀏覽器 | pass | Codex IAB 人工操作 1440×900、1366×768、768×1024、390×844；來源選檔→提議→對帳→月總覽→公式→方案→行動→保存重整恢復，截圖與記錄如下 |
| 人工下載位元核對 | not_run | 人工操作四個匯出按鈕與提示，未讀回該瀏覽器下載位元；Playwright 已真下載 CSV／Markdown／JSON／完整工作區並比對與恢復，不混稱人工完成 |
| Live AI／真實營運 pilot | not_run | 沒有真實 key，未傳真實資料，未評估模型品質或商業成果；PUBLIC_DEMO 本機後端關閉 |
| Safari／Firefox／原生手機／螢幕閱讀器 | not_run | 本輪 Chromium 與桌面 IAB 模擬尺寸，不等同原生裝置或所有輔助技術驗收 |
| 最大量效能／quota 用盡／檔案加密 | not_run | 有大小／列數／schema 邊界與 mock失敗測試，未壓滿各瀏覽器儲存配額；沒有備份加密實作 |
| 新依賴安裝／registry audit | not_run | 沒有新依賴，package 與 lock 與基底一致；不沿用舊 audit 當成本輪漏洞證明 |
| push／部署／第二三批 | not_run | 第一批本機預覽即停，未修改 production |

## 實際命令

本機 Node 25.8.2、npm 11.11.1。以下檔案都在 `verification/`；歷史 M0–M6 證據未覆寫。

| 命令 | 結果 | 日誌 |
|---|---|---|
| `npm test -- --run tests/domain-acceptance.test.ts tests/scenarios.test.ts tests/m6-financial-audit.test.ts` | pass，96 | `manager-batch1-baseline.txt` |
| `npm run typecheck` | final exit0 | `manager-batch1-typecheck-final.txt` |
| `npm run lint` | final exit0 | `manager-batch1-lint-final.txt` |
| `npm test -- --run` | final exit0，26 files／663 passed | `manager-batch1-tests-final.txt` |
| `npm run test:e2e`（初次） | exit130，81 pass／5 fail／1 interrupted／135 not_run | `manager-batch1-e2e-initial.txt`、`manager-batch1-e2e-initial-results.json` |
| `npm run test:e2e`（修復後完整） | exit0，225 pass／0 fail／0 skip／0 flaky，4.0 分鐘 | `manager-batch1-e2e-final.txt`、`manager-batch1-e2e-results.json` |
| `NEXT_TELEMETRY_DISABLED=1 npm run build && npm start -- --port 3100` | pass，以上 E2E 真正執行的 webServer 命令；live disabled | 同上，並非另一次獨立 build |
| `node /tmp/profitlens-manager-batch1-security.mjs` | exit0，22 assets、4 mode HTTP 檢查 | `manager-batch1-security.txt`、`manager-batch1-security.json` |
| `NEXT_TELEMETRY_DISABLED=1 APP_MODE=PUBLIC_DEMO PUBLIC_DEMO=true ENABLE_LIVE_AI=false npm start -- --port 3200` | 成功提供人工預覽 | `manager-batch1-preview-server.txt` |
| `git diff --check` | exit0 | 最終工具輸出；無空白錯誤 |
| Python ZIP／git bytes integrity 核對 | 11 附件、45 追蹤規格／fixtures／schema／鎖定檔全部未變 | `manager-batch1-integrity.json` |

安全 helper 以原 `scripts/verify-ai-security.mjs` 建立暫存副本，只替換 fake canary `sk-PROFITLENS-BATCH1-NONSECRET-BUNDLE-CANARY` 與輸出檔名為本輪前綴；不讀取真實 key、不呼叫 provider。PUBLIC_DEMO 實際 POST403；NO_KEY／DISABLED 降級與未同意拒絕均通過。掃描 client assets 無 canary／server SDK 標記，server logs 無 canary。

## 紅測試與修復紀錄

- PL-02 原兩問題與新日均契約先寫失敗測試：`pl02-red.txt`（11 failed／1 passed）；實作後 focused tests／full suite 通過。
- PL-03／04：`review-batch1-import-red.txt`，實作後 `review-batch1-import-green.txt`／相關 focused logs。
- PL-01：`manager-batch1-pl01-red.txt` 是從實際工具輸出的事後抄錄，**不是當時原始 redirect log**；缺模組先失敗，mapping驗證也先重現失敗再修。`manager-batch1-pl01-green.txt` 是原始 53 passed 輸出。完整最終 663 tests 是本輪直接保存的原始日誌。
- 初次 typecheck `.next/types` 發現 36 個自動產生檔重複名稱（34 與基檔位元相同，2 為舊 generated 型別）；核對 generated header／hash 後移至 `/tmp/profitlens-generated-types-*` 保留。未刪除使用者來源；原因未確定。`manager-batch1-generated-duplicates.json` 記錄精確路徑／hash，整理後 typecheck 通過。
- 初次 E2E 三個 reload 案例被舊測試 `dismiss()` beforeunload 取消，改為只接受預期離頁提醒並斷言次數，其他 JS dialog 仍 fail，未移除產品提醒。
- 超長日期案例先被新 data_as_of 檢查拒絕，僅更新該測試合成 manifest as_of，使它繼續驗證原分析上限；未改 golden／產品限制。
- 月資料來源 90 筆且每頁 50 筆，銷售列在第二頁；修測試實際翻頁後驗證，不移除來源斷言。
- 獨立檢視確認實際問題：清空 active 後 storage 元件仍保有未套用 backup candidate。現清空會重建元件，移除該候選 CSV、保存同意與下載確認；新增三尺寸回歸，已保存 IndexedDB 副本仍須另刪除。

## 人工瀏覽器證據

本機 production `http://127.0.0.1:3200/`。真選檔器讀 `manager-batch1-synthetic-months/` 三份 61 日合成 CSV，未使用 manifest JSON。確認日期／通路提議與來源口徑後，看到全 coverage 淨營收6100.00、成本2440.00、平台305.00、履約610.00、廣告1220.00、貢獻1525.00，九欄來源對帳差額全部0.00。套用後前期775.00／本期750.00、日均25.00／25.00；日均公式顯示750÷30與90來源。390px 表格 clientWidth311／scrollWidth425，鍵盤 ArrowRight 可捲動，Enter 開公式、Escape 關閉。

在 DTC 月基準750.00，明填 v=0、δ=0、f=−10%、a=0、K=20，重算結果760.00；是條件手算而非成效。建立七欄行動、期限與本期履約 fact，引述300.00。IAB 的 Playwright `fill` 對該 date 欄位未更新受控狀態，先保持草稿；改由原生 date field `setValue` 後明確確認成功。保存、重整回空、預覽再恢復後，方案760.00與行動「使用者已確認」都保留。已刪除本輪測試 IndexedDB 副本，當前預覽保留合成記憶體工作區。

- `manager-batch1-manual-browser.json`：逐步可見狀態、工具限制、console warn/error 為空。
- `manager-batch1-manual-1440.png`、`-1366.png`、`-768.png`、`-390.png`：實際 viewport 截圖。四寬度頁面無水平溢出，窄版表格局部橫捲。390 截圖於 viewport 渲染穩定後重取，未使用切換瞬間的舊幀。
- `manager-batch1-manual-import.png`：匯入對帳操作畫面；`manager-batch1-manual-390-evidence.png`：手機來源對話框。
- `manager-batch1-manual-overview.png`：固定手算合計／日均表與週趨勢，可直接檢視。
- E2E 另產生 `manager-period-{desktop,tablet,mobile}.png`、`manager-batch1-{desktop,tablet,mobile}-restored.png`、JSONL 與既有流程回歸前綴截圖；不是人工驗收的替代品。

## 主要變更與使用邊界

新增：`src/domain/comparison.ts`、`src/application/{workspace-backup,local-store,import-guidance}.ts`、`src/components/workspace-storage.tsx`；4 個對應 unit test files、3 個 E2E specs。更新日期／manifest／analysis types、匯入／決策／匯出／AI快照、dashboard／overview／import／decision-workbench／CSS；AI契約、grounding、prompt版本；既有回歸與Playwright artifacts設定、eslint（排除不可變評閱附件）、`.vercelignore`（排除 reviews）、README／STATUS／規格／DECISIONS／ACCEPTANCE。

金額、退款入帳、成本回沖、日通路先彙總join、SKU不分攤廣告、scenario閉合公式、golden答案與AI output JSON schema 均未變。比較日期限制的明確擴充及主動保存契約更新已記 DECISIONS；未新建資料庫、登入、平台API或雲端同步。

完整工作區備份保存已套用 scope 和方案／行動所需資料，不保存未套用日期／匯入草稿、商品搜尋、AI回應／同意／key。IndexedDB與JSON沒有應用程式層加密；校驗碼不是簽章，不應打開不可信來源。保存不自動更新，瀏覽器也可能清除資料。跨視窗不自動共用；同一瀏覽器與origin 的人仍可主動讀取保存副本。清空工作區、刪除本機副本、刪除下載檔是三個不同動作。

本輪完成第一批即停止。第二批與第三批、正式平台接入、live模型實測、實際商業效果均未執行；不得據此宣稱獲利改善或完整財務損益。
