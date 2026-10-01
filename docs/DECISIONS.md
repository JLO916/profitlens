# Decision log

## 初始產品決策
採單一貨幣、日通路商品彙總資料、入帳日退款、已入帳淨銷貨成本、通路層級費用；先做獲利診斷與條件試算，不做媒體因果歸因與財報淨利。
先本機、無資料庫、無登入、API 選配。公開展示只含合成資料。

後續每筆決策需記錄：日期、問題、採用選項、原因、影響文件、需重跑的驗收案例。不得悄悄修改以上口徑。

## 2026-10-01：限制瀏覽器分析展開範圍

**問題：** M1 已避免在過大的 coverage 展開完整空矩陣，但 M2 每週彙總仍會按比較期間逐七日建立摘要。M3 開放本機 manifest／表單後，小型 CSV 也能搭配極長期間或大量通路，造成同步運算與記憶體負擔；單靠每檔 5 MiB／50,000 列不能限制這類輸入。

**採用選項：** 本機互動分析的前後期七日區間數合計最多 1,040 個，每次最多 1,000 個通路。七日區間按各期天數除以七後向上取整，末段不足七日也納入。匯入／套用分析前檢查；超過限制時回傳 blocking／拒絕套用並保留先前成功資料。不得截斷期間、刪除列或用零填補未分析範圍。

**原因：** 在進入通路分析與每週迴圈前拒絕過大範圍，使不可信設定無法要求無上限的瀏覽器展開。這些數值是可調整的產品技術上限，不是性能或最大負載已驗證的保證。

**影響：** `src/application/limits.ts`、匯入準備與 snapshot 入口、匯入設定提示、README 及本輪 STATUS。這是應用層限制，不修改 DATA_CONTRACT 中的金額定義、M1 的缺漏傳遞、退款入帳日、通路費用粒度或 contribution-v1 公式，也不放寬原有檔案上限。

**需重跑驗收：** 範圍／通路上限邊界單元測試；超限匯入及期間篩選保留舊資料的瀏覽器案例；原 C01–C18 golden 與 U02、U04、U07、U10。實際通過／失敗／未執行結果記錄於 STATUS，本決策不代表上述案例均已驗收。

## 2026-10-01：空白品類維持原值，避免無作用的篩選選項

**問題：** 資料契約允許 category 空白，但商品下拉選單的「全部品類」同樣使用空字串；若將空白品類直接列為選項，選取後仍會顯示全部商品。M1 商品 API 也不接受空字串作為明確 category filter。

**採用選項與原因：** 下拉選單只列有名稱的品類；空白或僅空白字元的品類不建立可選項。這些商品仍原樣保留在全部明細與 CSV 匯出，可用 SKU 搜尋，不補造品類、不移除商品，也不變更通路總計或 M1 filter 口徑。

**影響與驗收：** 商品頁與 README。需檢查空白品類商品仍存在、SKU 搜尋及匯出一致，以及原本非空品類篩選仍有效；結果以 STATUS 為準。

## 2026-10-01：M3 安全 CSV 匯出與設定下載的範圍

**問題：** M3 明示要求安全 CSV 匯出，但完整行動摘要與多格式快照仍屬後續 milestone；另需避免把下載 manifest JSON 誤認為資料備份。

**採用選項：** 本輪只匯出已計算的分析快照、目前商品篩選列及問題清單，附共用期間／通路、商品查詢條件、hash、版本、截至日、null 原因與來源 references。金額及比率保留精確字串；不可信文字防公式注入，合法 typed negative 金額不加文字 escape。JSON 下載只有資料集設定，不含 CSV 原檔、完整快照或 UI 草稿。

**原因與影響：** 可在本機追溯及核對目前分析，同時不增加模型、伺服器上傳、持久化或未授權功能。影響匯出模組、下載按鈕、README；不宣稱 M4–M6 已完成。

**需重跑驗收：** U04 篩選一致、U09 文字及公式注入、U11 記憶體邊界，以及固定 golden／替代資料的 CSV 值、null 原因、來源行號、負數與精度測試。結果以 STATUS 和 `verification/m3-*` 為準。

## 2026-10-01：M4 以高精度代數等價式實作閉合情境公式

**問題：** SCENARIOS 的模型含循環小數比率。若將 D/G、R/(G−D) 或有效費率先取分，或分別計算循環小數後相減，零變動與剛好半分的案例可能受數值誤差影響；逐項顯示的兩位小數也不一定直接加回未取分總額最後取分的貢獻。

**採用選項：** 保留原閉合模型與輸入限制，每次計算建立隨輸入位數增加精度的 Decimal context，所有中間金額不先取分。使用代數等價式：先以 `D+G×δ` 求原量折扣再乘量變化；`N′=(G′−D′)×N/(G−D)`、`P′=(G′−D′)×P/(G−D)`、`Q′=(G′−D′)×Q/(G−D)`；計算行銷前貢獻時合併共同分母，再扣 C′、F′、O′。只有最終輸出金額採兩位小數 `ROUND_HALF_UP`。`rounding_adjustment` 定義為顯示的條件貢獻減去已取分的 G′−D′−R′−C′−P′−Q′−F′−O′−A′−K。

**原因：** 在不改變 SCENARIOS 財務口徑的前提下，減少循環小數相消的誤差，讓零變動回到 baseline、逐項輸出可以精確對帳。取分調整不是新成本或收益；比率顯示值不能回填為計算來源。每個方案從相同不可變基準重算，方案差額不可相加，也不將廣告支出變化當作銷量推估。

**影響：** `src/domain/scenarios.ts`、情境對帳測試、M4 明細、匯出與 README。新增 `scenario-v1` 實作版本，既有 `contribution-v1`、DATA_CONTRACT、METRICS、SCENARIOS 及 golden expected 不變。

**需重跑驗收：** S01–S06、缺資料／負成本／零及負收入適用性、百分點與輸入邊界、超大精確金額。固定 anchor 為 DTC baseline 270.00，v=0／δ=0／f=−10%／a=0／K=0 得 284.00，K=20 得 264.00；MARKETPLACE v=20%／δ=2 百分點／f=−10%／a=−20%／K=20 得 19.70、差額 34.70，取分調整 −0.01。實際結果以 STATUS 為準，不將決策紀錄當作測試通過證明。

## 2026-10-01：M4 工作稿以 revision 與快照綁定，重確認清除數值及證據

**問題：** 只比較資料 hash 無法識別同一份資料被重新匯入的使用者操作；只比較目前篩選，也可能在切回原範圍時讓舊方案自動復活。更換基準後沿用銷量 0、先前勾選或 fact references，會造成未經確認的假設與錯誤來源。

**採用選項：** `createDecisionSession` 捕捉可序列化的單通路本期 baseline、facts、來源、期間、scope、metadata 與 revision，基準深層凍結。每次成功載入／匯入（含相同 hash）及成功改變篩選都更新 revision；與 snapshot signature 一起檢查 freshness。過期狀態一旦成立不自動解除，回原資料／期間／通路亦然。過期稿保留舊資料供閱讀，但停用編輯、計算及對目前資料的證據操作。

**明確重確認：** 使用者按「以目前快照重建並清空假設」才建立新 session。保留方案名稱與人工行動文字，清空全部五項數值、假設接受狀態、試算結果、行動 fact IDs 與證據確認。初始五項數值同樣空白；「填入零變動假設」是使用者明示的操作，不自動勾選接受。輸入變更立即撤除舊結果；行動內容改動立即撤除確認狀態。

**原因與影響：** 將重用文字與重新確認財務假設分開，避免新舊快照混用。最多三方案、三行動；已確認行動須七欄完整、有效 ISO 期限與至少一個存在於捕捉快照中的 fact ID，優先順序由人決定。影響 `src/application/decision.ts`、M4 工作台、README；不改 M1 金額、來源或排序規則，不建立持久化。

**需重跑驗收：** S07 換資料／期間／通路、同 hash 重新匯入、換回原範圍仍過期、重建後銷量空白且未接受、fact references 清空、手動順序與三項上限、虛構 ID 與不完整行動拒絕。需連同 U04、U07、U11 與瀏覽器流程檢查；通過／失敗／未執行以 STATUS 為準。

## 2026-10-01：M4 允許明標草稿及過期歷史的安全決策匯出

**問題：** 使用者需要在本機保存未完成及過期工作稿；若匯出只寫數字而省略狀態、假設或舊範圍，容易誤當目前結果。人工文字、方案名稱與來源 metadata 均不可信，Markdown 也可能透過 HTML 或連結造成不安全呈現。

**採用選項：** Markdown／CSV／JSON 共用一份經檢核的決策文件。文件包含完整 baseline、五項輸入、全部固定假設、公式、條件結果、取分政策及 adjustment、人工行動、fact IDs 與來源。未計算方案維持 `draft` 與 null；未確認行動明標人工草稿；過期文件保留原捕捉範圍並顯示 `stale`，不改掛目前 hash。匯出時重新檢查 result 對應相同 inputs 與基準、已確認行動的內容及所有事實引用；不允許髒輸入混搭舊結果或虛構 fact ID。

**版本與 metadata：** `schema_version=decision-v1`、`scenario_version=scenario-v1`、`metric_version=contribution-v1`；保存 dataset ID／hash、filter hash、截至日、revision、snapshot signature、period、scope、幣別、時區、金額口徑、來源檔名及事實。這是可序列化的決策快照，不是含 BigInt 的原始 Dataset，也不是 CSV 原檔備份；沒有匯回復原工作區的功能。M3「資料集設定 JSON」功能與範圍保持原樣。

**安全與原因：** CSV 復用 typed text／number／null 輸出，不可信文字防公式注入，系統計算金額的負數與精度保留，null 旁列原因。Markdown 對 HTML 字元、Markdown 控制字元與換行做逃逸，不生成使用者可控制的連結；JSON 保留原文字但不執行內容。下載只在目前分頁產生，不上傳、不共享、不新增模型或持久化；所有行動明標人工，不假裝 AI 已給建議或已執行。

**影響與驗收：** `src/application/decision-export.ts`、工作台下載、README。需重跑 S07、U09、R03 涉及的欄位與內容對帳、草稿／過期標記、惡意 HTML／Markdown／公式文字、合法負數、null、取分調整及來源引用。僅驗本輪授權的輸出範圍，不表示 M5 或完整 M6 release 已完成；實際結果與未執行項目見 STATUS。

## 2026-10-01：M5 只傳匿名的已選通路彙總，觀察由程式目錄限定

**問題：** 原有 fact ID 包含資料集名稱、通路或 SKU；直接傳 ID 或 source refs 仍可能洩漏原始文字。只有 JSON schema 與合法 ID 也無法阻止模型引用無關指標、反轉期間／方向或把缺漏補成獲利主張。

**採用選項：** `prepareAiSnapshot` 建立 `ai-snapshot-v1`，固定傳送目前選取通路合計的前期／本期各 20 個指標，共 40 facts，不任意挑選或截斷。通路使用 C01 等別名，facts 使用 F001 等別名；ID、名稱與逐行來源僅存在分頁內的對照。傳送欄位限制為版本、快照識別、TWD、前後期、截至日、匿名範圍、data quality、指標精確字串／null、白名單原因，以及來源角色與筆數。排除 SKU／品類分析、資料集名稱、實際檔名、原始行號與原始 CSV；來源只用於本機證據展開。數值字串最多 256 字元為 AI 邊界，不限制既有財務核心。

**語意守門：** 程式從相同 facts 建立值、前後期方向及缺漏觀察目錄，模型須原樣選取；`fact_ids` 必須恰好支持該觀察，不能夾帶無關證據。所有文字中的 placeholder 逐一驗證 fact／metric 與引用集合，再由程式格式化。假說須標「待驗證假說」，建議須有核查步驟；金額缺漏時首則必須優先補資料。自由數字（含 Unicode／中文量詞）、已知確定因果、信心與保證效益、補零、SKU 廣告歸因、憑證索取及越權內容拒絕呈現。server 與 client 均檢核，不因 HTTP 200 或 schema 合法便信任回應。

**原因及限制：** 此策略保守縮小模型的敘事空間，保持 M1 數值、排序與 M4 情境仍由原純函式決定。原 `spec/insight-output.schema.json` 不變；本輪新增 runtime 資源與語意限制。觀察目錄不能證明任意自由文字語義正確，有限的模式檢查也不等於完整防提示注入或商業品質保證。此版不傳逐 SKU 或各通路細項，不提供 AI 收益估算。

**影響及驗收：** `src/ai/contracts.ts`、`grounding.ts`、`src/application/ai-snapshot.ts`、預覽 UI、README。固定 E01–E24 與追加回歸涵蓋已知支持／錯期／錯 scope／無關引用／缺漏／數字／因果／越權案例；全部屬合成與 mock 自動化，實際結果見 STATUS。真實模型品質、人工語義驗收、人工修改量及處理時間未執行／未量測。

## 2026-10-01：M5 使用 server-only Responses provider，預設關閉且故障可降級

**問題：** 選配模型不能讓金鑰進入前端，也不能讓模型失敗影響既有財務功能；公開展示後端必須真的停用。schema 成功不代表語意成功，SDK 自動重試也可能把應用層的有限重試放大。

**採用選項：** 依官方文件採 OpenAI Responses API 的 `text.format`，`type=json_schema`、`strict=true`，並使用既有輸出 schema；明確指定 `store:false`、`stream:false`、`tools:[]`、`tool_choice:none`。本輪依 npm 官方 registry 確認後固定 `openai@7.25.0`，lockfile 固定版本；provider 與配置等伺服器模組使用 `server-only` 邊界標記。服務僅讀 server-side `OPENAI_API_KEY`、`OPENAI_MODEL`、`ENABLE_LIVE_AI` 與模式設定；模型沒有預設值，範本 key／model 留空。每個請求使用自己的 client，不以 server module global 保存使用者資料。

**官方依據：** [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) 說明 Responses structured `text.format` 與 strict schema；[Responses 遷移說明](https://developers.openai.com/api/docs/guides/migrate-to-responses) 說明 `store:false`。這個設定不構成「供應商絕不保留資料」的承諾，預覽仍提示供應商保留政策。SDK 版本對應 [npm 官方 registry](https://registry.npmjs.org/openai/7.25.0) 與本機 `package-lock.json`。

**邊界及降級：** `ENABLE_LIVE_AI` 未開啟、缺 key、缺 model 或配置不合法時直接保留規則診斷；`APP_MODE=PUBLIC_DEMO` 或 `PUBLIC_DEMO=true` 在讀取 request body 與建立 provider 前強制封鎖 live。POST 最多 64 KiB，輸出最多 4,096 tokens，每次 provider 嘗試最多 15 秒；SDK `maxRetries=0`，僅 schema／semantic 失敗最多另試一次，拒絕、截斷、timeout、429 或其他失敗不無限重試。只記明列的 model／prompt version／時間／嘗試次數／latency／usage／status／error code metadata，不記 raw error、請求、模型文字、facts、原始資料或 key。未設定模型費率，不偽造費用。

**安全範圍：** 本機 host 與 POST 同 origin 檢查是額外保守入口，不是公開服務認證。沒有新增登入、公開 rate limit、使用預算或部署，因此不可據此公開啟用模型 endpoint。前端不提供 key 欄位，不自動執行建議，也不提供產品 mock 模式。測試 mock provider、mock transport 與 mock route 只在自動化中使用，結果必須明標 MOCK。

**影響及驗收：** server-only config／provider／service、`/api/insights`、`.env.example`、依賴與 README。需檢查 disabled／no-key／no-model／PUBLIC_DEMO、payload 邊界、拒絕／截斷／schema／semantic／timeout／429、至多一次重試、metadata 日誌及前端產物不含 key。實際命令與結果見 STATUS；本輪沒有真實 API key，live 呼叫、模型支援及供應商端行為未驗收。

## 2026-10-01：M5 同意綁定完整快照，舊回應不復活

**問題：** 只讓使用者勾一次同意，或僅按 dataset hash 判定 freshness，會在換資料／期間／通路或同 hash 重載後沿用先前授權；較慢的回應也可能覆蓋新的工作區。

**採用選項：** 傳送前顯示真正送往 provider 的匿名 snapshot 與程式觀察目錄，另列 OpenAI 接收端及固定規則用途。`snapshot_id` 綁 dataset hash、filter hash 及工作區 revision，client 同意再綁完整 payload 與 revision；POST envelope 必須包含 `accepted=true`、`recipient=openai` 與相符的 snapshot ID。使用者勾選並按傳送才送出，不因打開診斷頁、預覽或能力查詢自動呼叫模型。

**過期處理：** 同 hash 重載、換資料／期間／通路與切回原範圍均撤銷同意及結果。client 使用取消訊號與請求序號，驗證回應的外層及 output snapshot ID 後才渲染，晚到／取消的回應不覆寫目前狀態。只有真正 provider completed 且雙端驗證通過才標「即時 AI」；故障顯示「AI 未完成」，既有「規則診斷」始終保留。候選行動維持需人確認，不自動寫入 M4 人工工作稿。

**影響及驗收：** `src/application/ai-client.ts`、AI 面板與工作區 revision 串接、README。以 mock 測試同意前不送出、預覽／傳送一致、取消、同 hash 重載、換 filter、錯 snapshot、惡意 HTTP 200 及晚到回應。人工 live 同意流程尚未使用真實 key 執行；所有通過／失敗與未執行界限由 STATUS 記錄。

## 2026-10-01：M6 封閉自由文字重新標記合法 AI 數值的入口

**已重現問題：** 合法 F033 本期行銷後貢獻的 observation／fact_ids 均正確，但在 verification_metric 填入同一 placeholder，將值改稱前期、其他通路、商品淨營收或公司淨利，原 validator 與 client 仍接受。另重現未附 API 前綴的金鑰／密鑰索取，以及「廣告預算應調至三萬」中文數字漏網。原始 8 failed RED 留於 `verification/m6-security-red.txt`。

**採用修復：** 只有與程式 observation_catalog 完全一致的 observation 可包含數值 placeholder。其餘自由欄位一律拒絕數值引用，只容許待人工核查的質性文字，避免依自由文字猜測數字的 period／scope／metric。已知憑證索取與中文數字變體補入既有防線，同步 prompt `profitlens-insights-v2`。這是安全邊界收緊，不改 JSON schema、domain 公式或 golden expected。

**測試調整：** 舊測試曾要求 verification_metric 中合法 placeholder 可顯示，與此修復衝突；主驗收者明確改為應拒絕自由欄位引用，仍保留 catalog observation 的數值來源不可變檢查。新增 19 回歸、client 安全降級與完整 615 tests／186 E2E 已實跑；沒有以改財務答案掩蓋錯誤。

**限制：** 有限文字規則不能證明任意自然語言、所有中文數字／索取憑證表述或模型品質安全。只宣稱本輪已重現漏洞與固定已知案例修復，live 模型仍未執行；不新增公開 live endpoint、付費呼叫或正式部署。
