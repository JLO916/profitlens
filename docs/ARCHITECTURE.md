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
Raw CSV 僅在使用者瀏覽器記憶體內，不預設 localStorage／IndexedDB 持久化。重新整理會清空匯入資料；明確提醒使用者匯出設定。示範合成資料可作靜態檔案。
所有快照帶 dataset hash、filter hash、metric_version、data_as_of。AI 結果與情境綁定此 snapshot，來源變動後舊結果立即失效；不要讓較早的非同步回應覆蓋新期間。
不使用 server module singleton 儲存使用者資料，不做跨使用者共用快取。
MVP 不需資料庫／登入。後續正式多使用者版才另做存取控制、儲存、保留、稽核及租戶隔離設計。

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
