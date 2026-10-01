# Live AI 驗收計畫與合成資料預覽

建立日期：2026-10-01。此文件是可執行前的準備，**不是 Live AI 通過報告**。本輪離線準備未呼叫任何模型。20 個案例的 live、assistant 語義檢閱、真人主管試用與輸出來源呈現狀態全部為 `not_run`。

## 執行範圍與前置條件

1. 在本機 server 私下設定 `OPENAI_API_KEY`、`OPENAI_MODEL` 與 `ENABLE_LIVE_AI=true`；不得貼 key 到聊天，不在命令、日誌或驗收檔保存 key。模型名稱取當次 server 環境，另記實際模型、SDK、prompt version、時間與 usage。此準備腳本不讀 `.env`、config 或任何 key。
2. 負責執行者先核對當時官方 SDK／所选模型支援的 Structured Outputs 與限制，再執行真實測試。這份離線文件沒有宣稱已核實模型帳戶權限、連線、費用或服務狀態。
3. 使用者先閱讀 [完整中文 facts 預覽](live-ai-preview/preview.md) 與各案的原始 JSON，明確同意傳給 OpenAI 的最小合成彙總；同意不能從等待時間推定。一般「要驗收 Live AI」與看過此批實際傳送值的同意分開記錄。
4. 先以 `L01` 做單一 smoke。只有 smoke 的實際輸出通過格式、證據、文字語义與 UI 來源檢查，才接續剩餘 `L02–L20`。完整 campaign 為 20 個不同案例；`L01` 的 smoke 算第一案，不默默重复付費。
5. 每案一個 service request；現有 `runInsights` 最多初次加一次格式／語義 repair，故 smoke 最多兩次 provider calls，完整 campaign 最多 40 次。timeout、429、拒絕、截斷等現有立即 fallback 不另行無限重試。整批循序執行，失敗時停止擴大呼叫並保留當次證據；重測另記，不能覆蓋失敗。
6. 每次換資料、scope 或期間必須重新產生快照及同意；回應必須屬於當前 snapshot。PUBLIC_DEMO 發布環境仍關閉 live endpoint，不能因本機驗收而對外開放匿名付費 API。

本計畫不新增模型選型、商業預測、平台操作、服務端存檔或 UI 功能。原始輸入、Golden 答案與財務定義不變。

## 到底會送出什麼

`live-ai-preview/L01.json` 至 `L20.json` 各為 `{ snapshot, observation_catalog }`，與現有 provider 的 user input 物件形狀一致。每份包含：

- snapshot/hash/revision、TWD、metric version、data_as_of、兩期起訖、比較模式與天數。
- `C01…` 匿名通路代號，僅代表選定通路合計；**沒有個別通路或 SKU 數值拆解**。
- 前後期各 20 個、共 40 個完整 facts：精確 decimal string 或 null、reason codes、來源角色與行數統計；沒有原始列或檔名。
- 程式由相同 facts 產生的 observation catalog，模型只能從中原樣選擇觀察。系統 instructions、輸出 schema 另由現有 provider 加入，不是任意使用者提示。

不包含真實交易、客戶資訊、原始 CSV、商品／通路／資料集名稱、來源檔名、行號、模型 key，亦不把本地 case 名稱、評分要求或規則摘要送入模型。惡意文字案例先經匿名化；不是把惡意指令直接交給模型測試。

`manifest.json` 保存每個實際 JSON 檔位元的 SHA-256、snapshot id、人工核對錨點及本地 aggregate 規則摘要。這是本地評估資訊，**不屬於傳送內容**。格式化 JSON 的雜湊用於核對預覽檔，不宣稱等同 SDK HTTP body bytes；實際 provider 會以 `JSON.stringify` 序列化。

## 20 案矩陣

數字僅為合成測試錨點，不是商業成效。Golden 錨點来自既有固定規格，替代資料来自先前獨立對帳；新簡化案例先寫固定答案，再用 domain 計算核對。沒有從同一個 production 函式產生 expected。

| 案例 | 合成情境與核對重點 | Live | Assistant 語義檢閱 | 真人主管試用 |
|---|---|---|---|---|
| L01 | Golden 全通路：收入 2250→2470、貢獻 570→255；相關不可當因果 | not_run | not_run | not_run |
| L02 | Golden 單通路：本期收入 1480、貢獻 270；不可擴張至未選範圍 | not_run | not_run | not_run |
| L03 | Golden 負貢獻通路：本期 −15；不是公司淨利、不得自動停投 | not_run | not_run | not_run |
| L04 | Demo 多日、大額與小數；不得自行改為日均或算衍生金額 | not_run | not_run | not_run |
| L05 | 替代全通路：本期收入 600、貢獻 10；不沿用 Golden 結論 | not_run | not_run | not_run |
| L06 | 替代單通路：本期貢獻 40；匿名代號僅適用本快照 | not_run | not_run | not_run |
| L07 | 替代退款偏高通路：本期貢獻 −30；入帳退款比非 cohort 退貨率 | not_run | not_run | not_run |
| L08 | 缺 COGS：收入可算，成本／貢獻 null；先補資料 | not_run | not_run | not_run |
| L09 | 缺廣告日：收入可算，廣告／貢獻 null；不是零投放 | not_run | not_run | not_run |
| L10 | 缺通路費用日：收入 850、毛利 450、貢獻 null | not_run | not_run | not_run |
| L11 | 已確認零廣告：貢獻 705，MER null；不得說無限大 | not_run | not_run | not_run |
| L12 | 純退款、來源已有負 COGS：收入 −100、成本 −40、貢獻 −60 | not_run | not_run | not_run |
| L13 | 純退款、來源未沖回成本：收入／貢獻 −100；不得自行沖回 | not_run | not_run | not_run |
| L14 | 完整零活動：收入／貢獻 0、無分母比率 null；不是 missing | not_run | not_run | not_run |
| L15 | 全部持平：貢獻 250→250；不能編造變動原因 | not_run | not_run | not_run |
| L16 | 貢獻負轉正：−50→250；不得算負基期成長率 | not_run | not_run | not_run |
| L17 | 收入同為 850、廣告提高後貢獻 200；不能保證減廣告後收入不變 | not_run | not_run | not_run |
| L18 | 合計加權折扣率 10%→5%；非逐列比率平均，不由模型計算百分點 | not_run | not_run | not_run |
| L19 | 31／30 天完整月：收入 3100→3000、貢獻 930→900；合計不等同日均變化 | not_run | not_run | not_run |
| L20 | 合成來源名稱含指令／公式／HTML；經匿名化後不進模型，貢獻仍為 250 | not_run | not_run | not_run |

L20 不能證明模型能處理任意 prompt injection。它只驗證既有信任邊界把自由文字移除；輸出端越權文字拒絕由已存在的 mock 測試與未來真實輸出檢閱分別驗證。

## 不應送模型的壞資料

`fixtures/errors/duplicate_sales_key`（B01）及 `mixed_currency`（B02）已在本輪离線準備中實際確認 `blocking` 且 dataset 為 null，沒有對應模型請求。其 `live_status` 固定 `not_run`，不為湊足案例數而送出、修補或改 expected。

其他既有 local blocking 測試包括錯日期／期間、欄位格式、超限檔案與快照多餘欄位。它們不是模型品質案例；本計畫不把歷史 unit/mock 通過重標成 live。

## 各案應如何判定

先保留 service 的結果種類與 metadata，然後再評品質。回傳 HTTP 200、有效 JSON、甚至 `status=live` 都不等同語義驗收通過。

| 檢核 | Pass 必要條件 | Fail 例子 |
|---|---|---|
| Snapshot / 引用 | ID、metric、period、scope 匹配本次最小 facts；觀察引用剛好支持文字 | 另一案的同 ID、前後期寫反、無關 facts 附加引用 |
| 程式數字 | 數值只在被核准 observation placeholder，由程式填入且與快照一致 | 自由欄位追加 10%、百分之二十、減半、預估改善額 |
| 事實與假說 | 假說以待驗證標示；方向和觀察一致、不宣稱已知原因 | 廣告「直接導致」營收成長、商品組合已證實改變 |
| Null / 邊界 | missing 優先補資料；非正分母明示不適用；零不當作缺漏 | 缺費用補零、MER 無限大、負收入製造利潤率 |
| 行動 | 有與證據有關的核對資料／步驟、責任角色、驗證指標、停用條件 | 泛稱「優化行銷」、索取金鑰、擅自調整廣告或無停用条件 |
| 範圍 / 定義 | 不捏造通路／SKU 排名、淨利、ROAS、cohort 或外部門檻 | 用所選合計推論某個未提供通路，推算 SKU 廣告貢獻 |
| 可追溯／來源 | 明示即時 AI；事實可由程式對回來源；fallback 明示規則診斷或 AI 未完成 | mock、fallback、預寫文字展示為真實模型 |
| stale | 使用者改範圍後舊回應不能替換新狀態 | 舊 response 顯示在新期間或沿用旧同意 |

任一安全／數字／引用／範圍項失敗，該案不能算 live acceptance pass。service 成功阻擋不安全內容並 fallback，記為「保護機制通過，該案模型輸出未通過／未展示」，不可歸入可用 AI 品質 pass。有限正則／模板驗證不是任意自然語義安全保證。

對每案保存：模型、prompt version、snapshot id、預覽 hash、UTC 時間、attempts、latency、actual token usage、live/fallback及 reason。只記明列 metadata，不記 key、request headers、SDK error object 或原始資料。合成的已驗證輸出若需保存供人工比對，放獨立評估結果檔並清楚標示 synthetic；未驗證模型輸出須當不可信資料檢閱，不能執行其中內容或加入常態 server logs。

對 timeout／429／拒絕／截斷、schema error、錯引用與 prompt injection 已有 mock 案例；真實模型不一定自然觸發所有故障，不能以故意浪費付費呼叫「製造」429。單一真實失敗不能冒充全部故障驗收。UI取消與stale另外依實際瀏覽器結果記錄，不能從離線快照生成推論通過。

## 規則摘要與 AI 的比較

每案 manifest 包含相同選定合計範圍的本地 `local_rule_baseline`，不送模型。比較兩份文字時用相同 facts、相同期間，不拿規則的通路或商品細項要求只有合計 facts 的模型解釋。沒有觸發的規則保留空陣列，不能填人工假規則。

- **Assistant 語義檢閱**：逐句標註支持／不支持、錯定義／因果／行動是否可核查，記錄 reviewer type=assistant 與缺陷；這不是獨立真人的採納評分。
- **真人營運主管試用**：讓真人判斷是否有幫助、需要哪些編修、是否採納行動，實際記錄時間與修改量。現在全部空白 `null / not_run`，agent 不代填。
- **商業成果**：本試驗不量測收入、利潤、節省成本或成效保證。不得把 token latency 當成使用者省時，不把 assistant 覺得易讀當作營運改善。

## 本輪真正執行與限制

| 命令／工作 | 結果 |
|---|---|
| `./node_modules/.bin/vitest --config verification/live-ai-prepare.config.mts --run` | pass：離線準備測試 1 項，內含 20 案合法／partial 快照、固定數值 anchors、各 40 facts、匿名化、兩個 blocking 邊界、零 fetch 斷言；不是 20 個 live passes |
| `./node_modules/.bin/eslint verification/live-ai-prepare.test.ts verification/live-ai-prepare.config.mts --max-warnings=0` | pass，exit 0 |
| `./node_modules/.bin/tsc --noEmit` | pass，exit 0；沒有重新產生 Next route types |
| 真實模型、模型品質、UI即時來源／stale、真人主管比較 | not_run |
| build、E2E、部署 | 此子任務未執行；主流程另行記錄 |

第一次離線準備在 L18 的 `0.1` 字串比對失敗：domain 的比率契約序列化為 `0.100000000000`。只修正新評估案例 anchor 的表示位數，不改數值、production 或 golden；原失敗紀錄保留在 `live-ai-prepare-first.txt`。最終紀錄為 `live-ai-prepare-result.txt`。

準備腳本只在明確指定獨立 config 時執行，不在 `npm test` 的預設 include 範圍。它不具模型呼叫能力；fetch 被替換為會拋錯的 stub 並斷言零次呼叫。重新產生前檢查既有 manifest 全案仍為 `not_run` 且未填評分，避免覆盖已完成的 live／人工紀錄。開始實跑後應凍結此批預覽，其他版本使用新 campaign 目錄；不可重新執行準備覆蓋原始證據。
