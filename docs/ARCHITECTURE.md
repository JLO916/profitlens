# Architecture — deliberately small

## Selected stack
Next.js App Router + TypeScript；以 Node.js runtime 執行選配的 server-side AI endpoint。Tailwind CSS 與可維護 UI primitives；圖表使用 Recharts。Zod 做輸入與輸出 validation；decimal.js 做精確金額；Vitest 做 domain／integration tests；Playwright 做瀏覽器端到端驗收。CSV parser 可用 Papa Parse，需測 quotes、BOM、空值和錯誤列。
實際開發時依官方文件確認相容的穩定套件版本，寫入 package-lock.json；本規格不猜測版本號。使用單一 npm workflow；不要混用多個 package managers。

## Proposed directories
```
src/app/                    # 頁面、layout、選配 /api/insights
src/components/             # UI，不寫財務公式
src/domain/                 # 型別、validation、aggregation、metrics、bridge、rules、scenarios
src/application/            # 匯入流程、分析快照、匯出與 dataset state
src/ai/                     # provider interface、structured result validation、prompt
src/lib/                    # csv、date、money、hash、export safety
fixtures/                   # 僅合成測試資料
scripts/                    # 資料生成／準備驗證；不充當正式 App 的引擎
spec/                       # AI JSON schema
```

## Data flow
瀏覽器載入 CSV → parsing／型別檢核 → dataset settings／coverage 檢核 → pure domain calculation → versioned AnalysisSnapshot → UI／export。
僅使用者選擇即時 AI 時，預覽去識別彙總 facts → server-side schema check → model provider → structured response semantic validation → UI。

## State and freshness
Raw CSV 預設僅在使用者瀏覽器記憶體內，不預設持久化。第一批管理者改善新增明確同意後的 IndexedDB 保存與獨立工作區 JSON 備份；不自動保存、讀取或跨分頁同步。重新整理清空目前分頁，必須由使用者預覽並確認恢復。未保存變更有清空／離頁提醒（瀏覽器原生提醒是否顯示受瀏覽器限制）。示範合成資料可作靜態檔案。
`profitlens-workspace-v3`（先依原格式驗 checksum，可讀取有效 v1／v2 並遷移）保存標準輸入 CSV、manifest、欄位對照、已套用分析範圍、版本、多通路方案與修訂、行動引用歷史／進度及固定會議。恢復先檢查大小／schema／checksum，再重新驗證 CSV、建立快照及重算方案；不信任序列化結果。過期決策保留其歷史輸入、範圍與 stale 標記。格式不包含 AI 回應、傳送同意、金鑰或未套用的匯入／日期草稿。checksum 只檢查一致性，不是簽章或身分認證。
本機保存未做應用程式層加密，同一瀏覽器設定檔與 origin 可由使用者手動讀取保存檔。可刪除本工具 IndexedDB；不刪除其他分頁目前的記憶體或使用者已下載的檔案。沒有伺服器儲存、帳號同步或自動回復。
所有快照帶 dataset hash、filter hash、metric_version、data_as_of。AI 結果與情境綁定此 snapshot，來源變動後舊結果立即失效；不要讓較早的非同步回應覆蓋新期間。
不使用 server module singleton 儲存使用者資料，不做跨使用者共用快取。
MVP 不需資料庫／登入。後續正式多使用者版才另做存取控制、儲存、保留、稽核及租戶隔離設計。

比較模式進入 manifest、analysis scope／hash、決策匯出及 `ai-snapshot-v2`。`same_days` 保留既有等天數比較；`calendar_months` 接受各一完整自然月。兩者均要求前期早於本期並受 coverage／data_as_of 限制。金額合計、bridge、情境與 40 個 AI facts 仍使用實際合計；日均金額由 domain 的 Decimal 計算另列，不當成預測或任意補齊月份。

## Modes
- DEMO：只載合成資料，核心可運作；規則結果清楚標示「規則診斷」，沒有模型呼叫不顯示 AI badge。
- LOCAL：可匯入經授權標準資料；預設 AI disabled。
- LIVE_AI：僅在 server 正確設定環境變數及使用者確認彙總上傳後可用。上傳資料可能受供應商保留政策影響，不能承諾絕不儲存。
- PUBLIC_DEMO：server-side 禁止 live AI endpoint，不接受遠端持久化真實資料。匿名 API 開啟前須另外完成 auth、rate limit、usage budget，不能只靠 client 按鈕或 in-memory counter。

## Secrets and API
.env.local 僅於本機 server 使用：OPENAI_API_KEY、OPENAI_MODEL、ENABLE_LIVE_AI=false。提供 .env.example，值空白。key 不能帶 NEXT_PUBLIC_、不能傳至瀏覽器、不能出現在 commit／error logs。
不硬編模型名稱或單次 API 價格。M5 選取當時可用且支援 structured outputs 的模型。記錄非內容型 usage/token/latency/error metadata；設定超時、有限重試（最多一次）、最大輸入與輸出限制。無 key、限流、逾時都回到規則診斷。
成本＝實際 token 使用 × 當時模型費率；未設定費率不偽造新台幣成本。Codex 使用與 App 執行時模型 API 是不同環節。

## Deployment gate
先本機驗收；不在 M0–M5 自動建立雲端專案或公開 repo。M6 可準備部署文件，不代表已部署。使用者授權後，再部署只含合成資料的公開示範；檢查打包內容、environment、endpoint 與兩個獨立 browser sessions 的資料隔離。

## 獨立行動與主管摘要（管理者第二批）

`ActionWorkspace` 以 context 綁定各行動原始資料、診斷清單、facts、scope、期間與版本。Review v2 A 批起，一般檢視改變不改引用或鎖管理欄位；換資料後標示引用較早資料版本，明確重綁前仍保留原引用；證據抽屜使用該 context 的標準輸入、檔名與映射。情境重建不覆寫行動。備份不保存重算結果，恢復重建每個 context、驗證 scope 與規則；CSV／MD／JSON 每項行動保留自身 metadata。新行動只有最多三個置頂，總工作項目不再受情境三方案上限限制。

主管摘要讀取同一 `WorkspaceSnapshot` 與經檢核的決策／行動狀態；分組及門檻只影響摘要，不改 domain 金額、fact IDs 或完整診斷。商品比較使用兩期通路×SKU聯集；門檻及敏感度透過原 scenario-v1 重算，不呼叫模型。Review v2 A 批起，摘要門檻與各通路方案引用由 ReviewSession 持有並納入 v3 備份；敏感度輸入仍為 context 內暫存，不屬備份內容。

## 管理者第三批的呈現邊界

Dashboard掛載時透過既有GET `/api/insights`取得不含分析資料的可用性，傳給AiPanel共用。未知／不可用時不掛載傳送控制；每個資料revision的同意與結果仍以AiPanel既有identity重建，能力狀態不進備份。後端config gate、provider、facts與語意驗證均不變。
新增頁內「進階驗證」導覽，沿用白名單合成dataset endpoint與原load／validation／ticket保護；沒有新API、隱藏路由或持久化。僅進入進階頁不變更目前資料；方案／行動留在Dashboard狀態。主要營運頁保留示範載入與標準CSV匯入。

## Review v2 A 批狀態邊界（取代舊工作稿失效語意）

Dashboard 持有目前 Active、ActionWorkspace、ScenarioWorkspace、ReviewSession，以及未保存 version。一般分析 snapshot／AI revision 繼續依既有 guard 更新；會議 snapshot 由自己的 source_input＋固定 filters 重建，不讀一般畫面 filter。

- `action-workspace.ts`：引用 context、binding revision/history 與執行進度；純 application API 預覽／提交重綁，來源和期間完整性均檢查。工作稿完整與證據確認獨立。
- `scenario-workspace.ts`：epoch／單通路 contexts／最多三方案／已計算 versions。`MultiScenarioWorkbench` 只適配既有 Decimal scenario 計算，不加混合通路 baseline。
- `review-session.ts`：固定會議來源、門檻、各通路引用、共用 pins、備註／人工決議。`ReviewWorkbench` 重建來源，再交給同一 `manager-summary` projection 供畫面／Markdown／列印。
- `workspace-backup.ts`：v3 envelope sources hash map，先原格式校驗舊 v1/v2 再遷移。所有輸入重驗／結果重算；還原全包原子提交。`workspace-decision-export.ts` 為無原始 CSV 的多 context 稽核輸出，不是可恢復備份。
- `replacement-guard.ts`＋`ReplacementDialog`：四入口的選擇、保存、下載確認、版本競爭與失敗狀態；`WorkspaceStorage` 保留預覽直到實際提交成功。

沒有新增 API、資料庫、模型傳送、共享 module user state 或自動持久化。未保存輸入草稿／敏感度／AI 同意不入備份，其他分頁仍須手動預覽恢復本機副本。
