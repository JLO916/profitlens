# Decision log

## 2026-10-01：管理者改善第一批的日期與保存契約

**依據與範圍：** 使用者要求解壓並按評閱包進行下一輪改善。已讀包內全文，採用 `CODEX_NEXT_SPRINT.md` 第一批 PL-01–04；第二／三批不實作。本輪僅本機預覽，不推送 main 或部署 production。評閱腳本重現原八／九月不同天數被拒、前後期反向被接受；原 golden 答案獨立重算一致。

**日期決策：** 新增 `same_days`（舊 manifest 未填時的預設）與 `calendar_months`（各一完整自然月）。兩者一律前期結束早於本期開始，且在 coverage 與 data_as_of 內。合計與 bridge 沿用實際金額；日均是該期金額除實際天數，Decimal 算差後取分，null 原因傳遞，不平均比率。AI 快照升為 `ai-snapshot-v2`、prompt `profitlens-insights-v3`，附模式與天數但 40 facts 仍為原期間合計。這取代原「只有等天數」的日期限制，不改收入、成本、退款或情境公式，也不改 golden expected。

**保存決策：** 原 U11 的預設零持久化保留；新增使用者明確同意的本機保存與完整工作區 JSON。IndexedDB 不自動載入／同步；恢復須先預覽再套用，錯檔保留原工作區。重新驗證標準 CSV／版本／scope，重新產生快照、fact IDs 與方案結果，不信任外部序列化金額。過期決策保存歷史輸入及 stale 鎖定，換回舊範圍不復活。不保存 AI 回應／同意或 key。已下載備份及本機副本未做應用程式層加密；checksum 不是簽章。刪除本機副本不修改其他分頁記憶體或本機下載檔。

**匯入決策：** 只提出有效已觀察日期／通路，使用者確認後才填入；觀察範圍不證明資料完整。中文欄位說明、空範本、來源合計與標準金額／指標對帳輔助人工核查，不新增訂單級自動彙總、含稅換算或 net amount 猜測。缺成本維持未知並列已知小計；運費收入等未定義項目不納入商品淨營收。換 CSV／mapping 後重新確認來源金額口徑。

**驗收：** 新增固定手算、版本／篡改／過期、來源口徑與三尺寸 E2E；本輪實際結果及初次失敗見 `verification/manager-batch1-acceptance.md`，不可沿用過往綠燈或把 mock 稱 live。

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

## 2026-10-01｜管理者第二批：原口徑上的工作稿與展示

- 行動與情境生命週期分開。新行動記錄保留自身 scope、期間、修訂、資料及欄位映射；同 context 共用來源記憶體。切換資料／範圍後歷史狀態鎖定，重建情境不更換原行動證據。可複製七欄文字到新草稿，但不帶舊 fact IDs／確認。最多三項改為置頂數，仍支援手動排序，不以規則排序代替人工決策。
- 診斷帶入僅使用所點診斷的 fact IDs；預填問題及建議為可編輯草稿，最後由使用者確認。恢復不信任備份的金融結果、scope 描述或規則 ID；重算 context 並驗證，非 SKU scope 不允許 SKU／品類欄，原始規則必須存在且與行動原 scope 一致。
- 工作區 envelope 升至 `profitlens-workspace-v2`，仍接受有效 v1；遷移舊行動保留原 scope／facts，原三項先置頂。每個歷史 context 在備份保存標準輸入，64 MiB 總上限仍有效，來源多時可能到達上限，會明示失敗、不默默丟棄工作項目。這是資源限制，不是加密、身分簽章或多使用者同步。
- 主管摘要只變更展示優先序：同一 rule code 分組；單通路 `all`／`channel` 重複訊號合併，優先使用覆蓋範圍的代表；以組內最大絕對排序金額比較使用者門檻及排序，缺漏不受門檻排除。各層金額不可加總，僅顯示三組與完整診斷入口，不稱為機會收益。門檻預設 0，不代表已定義業務重要性。
- 商品兩期取通路 × SKU 聯集，未觀察銷售列只在完整性確認後計零；顯示「未觀察列」，不推定新品／停售。缺成本／未確認完整性使相關金額及差額未知。排序以整數分精確比較，未知永遠排後。無商品名稱來源欄，保留 SKU／品類，未加 SKU 廣告分攤。
- 敏感度與門檻見 SCENARIOS 追加定義，原閉合模型及 golden 不變。「貢獻為零」不是公司淨利損益兩平；維持 baseline 是不同目標。近似百分比不可當精確邊界，附代數分數；三組 v 明填，其他變數取已計算方案，不產生機率、最適預算或預測。
- 摘要門檻、摘要方案選擇、三組敏感度輸入屬頁內暫存，尚未列入工作區備份；UI 明示。持久化的仍是原已套用範圍、方案與獨立行動。摘要 Markdown／寬表為會議及查閱輸出，完整決策稽核輸出保留；不是可還原備份。長通路／行動清單列印可續頁，不為一頁而隱藏內容。

## 2026-10-01｜管理者第三批：先說明可用範圍，再呈現可操作流程

- 選擇評閱第三批PL-10，只調整導覽、可用性呈現、中文說明與文字可讀性，不改財務定義、AI schema、provider、facts選取或server gate。不增加預錄AI示例；既有規則／合成資料已可實際操作，沒有將範本文案冒稱模型生成。
- Dashboard以無分析內容的GET查詢伺服器AI設定，與AiPanel共用能力狀態。確認中／查詢失敗保持無傳送控制；PUBLIC_DEMO明示關閉。它只控制介面，既有後端仍先於request body驗證並拒絕公開live request。
- 可用模式先展示全部40個期間合計facts的中文指標與原始精確值，明示只包含所選通路合計、沒有個別通路拆解。JSON、版本、別名與本機對照保留在進階折疊；引用及傳送內容不變。中文表格不代表可跳過原本的預覽同意，不把模型可用GET當成模型生成成功。
- 技術識別放可展開稽核資訊；實際來源檔名、欄位、行號與使用者輸入的資料名稱仍可核對。行動會議稿主文以截至日／期間／通路說明，完整決策匯出仍保留各行動原始dataset ID／hash／binding／facts。
- AI可用文案避免寫「尚未傳送資料」等全分頁歷史斷言，因離開診斷後再返回會重建AI面板；不為此新增傳送歷史儲存。未確認狀態與已確認停用分開表達。
- Golden／缺漏／故意錯誤案例移至「進階驗證」；只導航不重新計算、不清除草稿。按「載入資料集」才採用原本驗證流程，成功後回總覽，失敗不取代既有資料。保留所有原有fixtures與驗證能力。

## 2026-10-01｜Review v2 A 批：營運、證據、方案與會議的獨立生命週期

本節依使用者核准計畫取代先前「切換任何範圍鎖定行動／情境」及「會議設定只留頁內暫存」語意；財務 domain、SCENARIO_VERSION、資料口徑與 golden 不變。評閱 ZIP 九份原件另存 reviews/profitlens_review_v2_20261001，原評閱轉錄腳本不作 production 驗收證據。

- 行動引用 identity 為 source context＋binding revision＋fact ID。事實 ID 相同不表示同資料版本。每次引用選擇／重綁記錄舊 binding，核對確認、管理完整性、執行狀態分開。進度預設未開始，備註 2,000 字；完成只是人工狀態，不代表成效。管理文字與期限修改不撤銷引用確認。規則所需資料依規則碼帶入，資料 limitations 另列。
- 重綁以原行動兩期、比較模式、通路／SKU scope 重算，預覽值、null 與原因、來源；提交驗證 action、source 及 preview 一致。取消、缺 coverage 或預覽過期不更改原稿；跨範圍須另建行動。
- ScenarioWorkspace 的工作輪次 epoch 在真正換資料／期間／比較模式時更新。context 以 epoch＋dataset/filter hash 綁單通路，最多三方案；只切通路保留原稿。舊 epoch 不復活。修訂立即撤下目前結果，已計算版本保留供會議引用；複製歷史名稱到新基準清空所有數值與同意。
- ReviewSession 保存單份固定來源會議；一般檢視不影響它。明確更新來源才換資料／範圍，門檻、名稱、備註可保存，每通路選一個相容修訂，不加總差額。行動置頂取共用有序清單（最多三項），未置頂放附錄。行動明確移除也移除會議引用；重綁保留原引用並要求更新。採用、補資料再議、不採用僅人工決定；相關範圍／引用更改撤回草稿，target_version 固定 null。
- v3 備份 wire 以來源 hash 去重，各來源驗證後重新計算，不信任備份中的財務答案；記憶體重建時避免 active 與歷史 source 可變別名。v1／v2 先驗原格式 checksum，保留確認與 legacy stale，不推測決議。缺引用、偽造版本、超過 64 MiB 或單檔限制整包拒絕。不恢復 AI 同意，無伺服器保存或跨分頁同步。
- 四入口共用 replacement guard，保存／不保存繼續／取消的狀態綁目前 workspace version；下載尚未確認不替換，本機保存失敗不替換。async ticket 防較早資料操作覆寫後來選擇。

B–D 批、敏感度持久化、多場會議封存、目標引擎、Live AI、push／部署不在本批。詳見本批驗收報告與 STATUS，歷史報告維持原始當時結果。

## 2026-10-02｜Revamp v2 原則：財務核心零改動、標籤單一來源

**問題：** Revamp v2（`docs/revamp/`，R0–R7）要把產品從稽核員工具改成台灣電商經理人每週使用的工具，會大量改動版面、名詞與流程；需要先劃定不可動的範圍，避免文案或版面調整悄悄改到財務口徑。

**採用選項：**
- **財務核心零改動。** `src/domain/*`、`fixtures/golden|demo|errors|refund_only|zero_ad`、`metric_version = contribution-v1` 與 `docs/METRICS.md` 公式不改。R1–R3 完全不碰 `src/domain`；R4 起只允許加法（新欄位、新函式、新版本標籤 `assist-kpi-v1`），既有指標輸入輸出不變，新增項目須有獨立手算 golden 測試。不以修改 golden 數字讓測試通過。
- **標籤單一來源。** 使用者可見中文集中於 `src/i18n/labels.zh-TW.ts`，由 `src/i18n/index.ts` 提供 `labels` 與 `t(path)`；R0 只建立入口不接線，R2 起元件、匯出、AI 預覽一律從此取字，`metricDefinitions.label` 改讀 labels。改名時同批更新測試斷言（優先改為引用 labels），不得 `.skip`。
- 隱私與公開站邊界（無登入／資料庫／伺服器保存、原始 CSV 不上傳、`PUBLIC_DEMO` 與 `/api/insights` 封鎖）、可追溯性、既有 `data-testid`／a11y 結構均不退步。

**影響文件：** `CLAUDE.md`、`docs/revamp/*`、`docs/STATUS.md`。`09_DECISIONS_PENDING.md` D1–D12 於 R0 時「決定」欄皆空白，後續批次依建議值執行並於回報標註，使用者拍板後再各記一筆。

**需重跑的驗收：** 每批完整 typecheck／lint／unit／build／E2E（四尺寸），並以 `verification/revamp-R0-acceptance.md` 的基線數量對照。

## 2026-10-02｜Revamp v2 R1：三件事與健檢卡的「對貢獻影響」只是呈現層的正負號約定

**問題：** 審查發現「折扣率上升 +1,188,365」壞事顯示正數、「貢獻下降 −598,834」顯示負數，同一頁的紅綠與正負語意不一致。規則的 `ranking_amount` 是「已觀察金額差」（費用類＝本期費用 − 前期費用，貢獻類＝本期貢獻 − 前期貢獻或本期貢獻），用來排序與追溯，不適合直接當成「好壞」給經理人看。

**採用選項：** 新增 `contributionImpact()`（`src/application/manager-summary.ts`，呈現層，不改 `src/domain/rules.ts` 與 golden）：
- REV_UP_CM_DOWN → 貢獻差額（原值）；NEGATIVE_CHANNEL_CM → 本期貢獻（原值）；SKU_NEGATIVE_GP → 本期商品毛利（原值）。
- DISCOUNT／REFUND／FULFILLMENT／MARKETING_BURDEN_UP → −（本期費用 − 前期費用）。
- MISSING_CRITICAL_DATA → 無金額（永遠置頂）。
- 顯示規則：負＝對貢獻不利＝紅；正＝有利＝綠；未知保留原因碼。三件事與健檢卡顯示「對貢獻影響」；原「排序用已觀察金額差」仍在技術細節可開。排序、門檻與公式抽屜仍用原 `ranking_amount`，R5 清單化時才改以 |影響| 排序（依 `05_FEATURES.md §7`）。

**原因：** 這是同一個數字換正負號與顏色，不是新的財務指標，也不是改善收益估計；維持可追溯（抽屜仍顯示原值與公式）。

**影響文件：** `docs/revamp/05_FEATURES.md §7`、`03_GLOSSARY_COPY.md`。**驗收：** `tests/contribution-impact.test.ts` 以 golden 手算（−315.00、−250.00、−130.00、−65.00、−150.00、−15.00）。

## 2026-10-02｜Revamp v2 R1：殼層重排的三個取捨

**問題：** R1 要把 AI 橫幅、保存面板、下載鈕與會議設定移出各頁首屏，同時 A 批的 400 項 E2E 與既有 testid／aria 結構不能退步；`02_IA_LAYOUT.md` 的版型描述與既有行為有三處需要拍板。

**採用選項：**
- **總覽的「本期三件事」用目前檢視計算**（`src/components/top-three.tsx`，`data-testid="top-three"`、`overview-priority-*`），與 KPI 卡、期間列同步。會議固定來源的主管摘要（`manager-summary`、`manager-priority-*`、通路寬表、主管摘要 Markdown／列印）整組搬進頁尾收合的「會議稿與主管摘要」區（`data-testid="overview-meeting"`），既有 testid、字串與結構原封不動；R6 再搬到會議紀錄分頁。收合狀態由 Dashboard 保存，換通路／期間或切頁回來不會自動收起。
- **「儲存 ▾」是在頂欄原位展開的面板，不是浮動選單。** 保存／恢復是多步驟流程（選檔→預覽→確認→替換對話框），浮動面板會遮住頁面內容並在平板寬度造成橫向溢出；展開式面板把內容往下推，鍵盤與既有 `<details data-testid="workspace-storage">` 語意不變。「下載 ▾」與 AI 狀態說明維持浮動（內容短、點外面或 Esc 即關）。
- **期間快捷只填日期與比較方式，仍須按「套用期間」**；本批四個快捷（近 7 天／近 4 週／近 12 週／本月 vs 上月）以 `min(data_as_of, coverage_end)` 為基準，超出涵蓋或未滿月時停用並顯示原因；「去年同期」留給 R4。排序金額差（`ranking_amount`）移入健檢卡的「稽核資訊」收合區，卡片正文改顯示「對貢獻影響」。

**原因：** 三者都讓首屏只剩結論（KPI → 三件事），又不改任何財務口徑、名詞或既有測試的斷言；需要調整的 E2E 僅是在互動前先展開會議區／下載選單（`tests/e2e/replacement-helpers.ts` 的 `openMeeting`／`openPeriodComparison`／`openDownloads`）。

**影響文件：** `docs/revamp/02_IA_LAYOUT.md §2–§3`（儲存面板形式）、`verification/revamp-R1-acceptance.md`。**需重跑：** 全套 E2E 四尺寸。

## 2026-10-02｜Revamp v2 R2：語言層的三個決定（D1／D11 依建議值、alias 範圍）

**問題：** R2 把所有使用者可見文字改為 `03_GLOSSARY_COPY.md` 的經理人語言；`09_DECISIONS_PENDING.md` 的 D1（行銷後貢獻新名）、D11（CSV 標題列）於本批開始時「決定」欄仍空白，另需決定示範通路 alias 的套用範圍。

**採用選項：**
- **D1＝A（依建議值執行）**：`contribution_after_marketing` 主名「扣廣告後貢獻」、短名「廣告後貢獻」；`contribution_before_marketing` 「通路貢獻」。「行銷後貢獻／邊際貢獻／行銷前貢獻」只在口徑說明的別名註記與技術細節出現。指標名稱、白話一句、中文階梯公式與技術公式全部由 `labels.metrics` 提供，`src/application/presentation.ts` 的 `metricDefinitions` 改為讀取 labels（新增 `shortLabel`、`plain`、`formulaTechnical`）。
- **D11＝A（依建議值執行）**：所有 CSV 的欄位 key 維持英文，第一列標題改為「中文名稱 (english_key)」（`csvHeader()`／`csvHeaderKey()`，`labels.csvColumns`）；下游解析只需取括號內的 key。通路寬表 CSV 原本是純中文標題，改為同一格式並補英文 key。
- **示範通路 alias 只對示範資料集生效**：`demoAlias(dataset_id)` 以 `synthetic-demo` 前綴判斷，`DTC → 官網 · DTC`、`MARKETPLACE → 平台 · MARKETPLACE` 只在顯示層；golden／缺漏／重複鍵等驗證用合成資料維持原通路代碼（對帳與既有測試以代碼為準），使用者匯入的通路名稱原樣顯示。CSV、AI facts、備份內的 channel 值一律不變。這比規格的「`source_type === "synthetic"` 即生效」更窄，原因是驗證資料集的用途是對帳，不需要台灣化名稱。
- 規則卡文案：`ruleCopy()`（`src/application/copy.ts`）以 `labels.rules` 模板＋該規則引用的事實填入占位符；標題金額用 `formatHeadlineAmount()`（≥ 10,000 顯示 x.x 萬，否則整數元），精確值在列內與抽屜。`src/domain/rules.ts` 不改。

**原因：** 單一來源、機器可讀不變、驗證資料不受文案影響。**影響文件：** `03_GLOSSARY_COPY.md §4`（alias 範圍註記）、`09_DECISIONS_PENDING.md`（D1、D11 請補「決定」欄）。**驗收：** `tests/copy.test.ts`（golden 手算標題：營收多了 220 元…少賺 315 元；折扣率 8.00% → 14.52%，多花 250 元；MARKETPLACE −15 元）、`tests/labels-coverage.test.ts`、`tests/copy-density.test.ts`。

## 2026-10-03｜Revamp v2 R3：匯入精靈的五個取捨（D2／D5 依建議值）

**問題：** R3 要把單頁匯入表單改成四步精靈並接受含稅來源，同時 `src/domain` 零改動、既有 import 測試不刪、`fixtures/*` 零改動；`09_DECISIONS_PENDING.md` 的 D2（含稅換算預設勾選）與 D5（訂單級彙總）於本批開始時仍空白。

**採用選項：**
- **D2＝A（依建議值執行）**：含稅時預設勾選銷售三欄（原價收入、折扣、退款）、通路費用四欄、廣告費；`cogs_net` 預設不勾並在旁說明「進貨成本常是未稅價，確認後再勾」。常數在 `src/application/tax-basis.ts`（`DEFAULT_CONVERSION_FIELDS`）。來源預設的 `inclusiveTax` 只當提示（Meta／Google 的「花費」一般不含稅，但台灣媒體發票多含稅，仍沿用 §3 的預設勾選）。
- **D5＝A（依建議值執行）**：`scripts/aggregate_orders.py`（Python 3 標準函式庫、Decimal ROUND_HALF_UP、依 `rules.json`）＋ `docs/ORDER_AGGREGATION.md`；精靈偵測到訂單級來源（preset 指紋命中 2 欄以上）時顯示「這是訂單明細，請先用整理工具彙總」並連到說明，不在 UI 內彙總。
- **換算只在應用層、逐列**：`prepareImport` 新增 `conversion` 選項，含稅時先以 `convertInclusiveRows` 逐列 `÷ (1 + rate)` ROUND_HALF_UP 兩位，再組回 CSV 交給既有 `validateDataset`；`PreparedImport` 新增 `conversion`（basis／rate／fields／rows_converted／totals）與 `raw_values`（檔案 → 原始行號 → 欄位 → 含稅原值）。`metric_version`、manifest 欄位、`amount_basis` 字面值都不變；資料雜湊因 CSV 文字已換算而自然不同。原值→換算值顯示在抽屜來源列、資料頁「本次匯入的前處理」、分析 CSV 的口徑限制欄與主管摘要 Markdown 的口徑說明；**備份仍是 v3、不含 conversion／raw_values**（04 §3 指定 R4 升 v4 時一併；還原後抽屜只顯示換算後值，見驗收已知限制）。
- **五次點擊的達成方式**：三份檔案欄名全部符合標準且沒有多餘欄位時，第 2 步「對照欄位」自動完成（步驟條標示「已自動完成」，可按上一步查看）；第 3 步的兩句確認（銷售完整、金額口徑）由一顆「我確認口徑與期間，開始檢核」按鈕一次確認（按鈕上方列出兩句，按下即 `sales_coverage_confirmed = true` 與 `amountBasisConfirmed = true`），第 4 步進入即自動檢核。路徑：匯入資料 → 下一步 → 未稅 → 確認並檢核 → 套用＝5 次；非標準欄名或有多餘欄位時第 2 步會出現，多 1–2 次點擊。金額口徑沒有預設值，「我不確定」停在第 3 步並顯示判斷方法。
- **舊面板保留方式**：`import-panel.tsx` 不刪；只有網址帶 `#legacy-import` 時掛在 `<div id="legacy-import">`，平常不掛載（避免兩套相同 aria-label 的檔案輸入並存）。R4 刪除。對照記憶的 IndexedDB 寫入以儲存面板的「我同意把資料存在這個瀏覽器」為準（同意狀態提升到 Dashboard 共用），未同意只存分頁記憶體；「刪除本機資料」刪整個資料庫，記憶一併清除；備份不含記憶。

**原因：** 不猜財務口徑（含稅是使用者明確選擇、逐列可追溯）、不改 domain、既有驗證一字不改；五次點擊靠少做事（自動對照）而不是少問（口徑仍必選）。

**影響文件：** `docs/revamp/04_IMPORT_TW.md`（備份時點、自動對照註記）、`docs/ORDER_AGGREGATION.md`（新）、`09_DECISIONS_PENDING.md`（D2、D5 使用者 2026-10-03 確認採 A，已填「決定」欄）。**驗收：** `tests/tax-basis.test.ts`（§3 golden ＋ 315.00→300.00、10.49→9.99、99.99→95.23、−21.00→−20.00、10% 稅率、逐列 vs 合計差一分）、`tests/import-wizard.test.ts`（`tests/fixtures/inclusive_tax` 手算：本期淨營收 2150.00、扣廣告後貢獻 518.05；誤選未稅為 2257.50）、`tests/e2e/import-wizard.spec.ts`。

## 2026-10-03｜Revamp v2 R4：第一次碰 domain 的方式與 D6

**問題：** R4 要加「售出件數」等輔助指標、去年同期、目標、檔期與備份 v4；這是第一個允許碰 `src/domain` 的批次，規則是只能新增。`09_DECISIONS_PENDING.md` 的 D6（選配 `orders_daily.csv`）仍空白。

**採用選項：**
- **D6＝B（依建議值執行：延後到 Phase 2）**：不加 `orders_daily.csv`，不動 `validation.ts` 的檔案清單；訂單數／客單價／轉換率整列不顯示。
- **domain 只加法的實作方式**：`Summary.units_sold: Count` 以**介面宣告合併**加入（原 `Summary` 那一行不變）；`Count { value: bigint | null; reason_codes }` 是新型別，不是 `Amount`（件數不是金額）；`aggregation.ts` 新增 `sumUnits`／`sumCounts`／`countMetric` 三個函式，既有函式的輸入輸出不變（`aggregatePeriod` 的回傳只多一個欄位）；`ProductMetrics` 型別別名多 `units_sold: Metric`（整數字串）；`analysis.ts` 的既有私有 `productMetrics` 不改，另加 `withUnits`。`git diff --numstat src/domain` 的刪除行全是被延長的 import 與物件字面值（內容保留、只多欄位）。涵蓋未確認時件數與金額同規則（null＋`SALES_COVERAGE_UNCONFIRMED`）。
- **輔助指標橫列七格**（05 §1 表列七項：件數、件均、廣告佔比、MER、毛利率、退款比、物流費佔比），版本 `assist-kpi-v1` 獨立於 `contribution-v1`；件均淨營收在應用層以 decimal.js ROUND_HALF_UP 兩位計算；A＝0 的 MER 與件數 ≤ 0 的件均顯示「不適用」，件數缺顯示「資料待補」。
- **去年同期以表單目前的兩期為準**（本期不變、上期各減一年；閏年 2/29 → 2/28；等天數模式以上期迄日為錨回推等長），日期未填完整時按鈕顯示不可用而不拋錯。
- **目標達成只在期間完全相同時顯示**（不按比例折算）；達成率＝實際 ÷ 目標，一位小數；目標 ≤ 0 不定義。
- **檔期只做標示**（趨勢圖區帶、三件事標題後綴），不改任何計算。
- **備份升 v4**：新增 `preprocessing`（R3 含稅換算的 conversion＋raw_values）、`targets`、`events`、`meeting_history`（R6 用，先為空）、`ui_prefs`；v1–v3 仍可讀入（新欄位為空）；checksum 規則與 64 MiB 上限不變。
- **刪除 R3 保留的舊匯入面板**（`import-panel.tsx` 與 `#legacy-import` 分支）；`labels.ui.importPanel` 中精靈仍共用的鍵保留。

**原因：** 不猜、不改既有口徑；件數是經理人最熟悉的數字，但要和財務核心分開版本。

**影響文件：** `docs/revamp/05_FEATURES.md §1`（七格註記）、`09_DECISIONS_PENDING.md`（D6 請補「決定」欄）。**驗收：** `tests/units-sold.test.ts`（golden 手算：上期 6 件、本期 8 件、DTC 4／MARKETPLACE 4）、`tests/assist-kpi.test.ts`（308.75／375.00 元／件；A＝0、件數 0、缺件數）、`tests/period-presets.test.ts`、`tests/targets.test.ts`、`tests/events.test.ts`、`tests/workspace-backup.test.ts`（v3→v4→v3 roundtrip）。

補記（R4 對抗式審查後的四個小決定）：
- 三件事的檔期後綴只看**本期**是否與檔期重疊（規格 §4 未指定期間）；上期的檔期不標註，避免標題過長。
- `ad_spend` 目標在總覽顯示於「廣告佔比」輔助格下方，用「廣告預算 X · 用掉 Y%」措辭（費用預算不叫「達成」）。
- 目標期間不一致的訊息改用完整日期（`目標期間 2025-08-01–2025-08-31 與本期不一致`），避免去年同期時與本期撞名。
- 目標與檔期在資料來源頁可**逐列刪除**並可下載目前內容（`exportTargetsCsv`／`exportEventsCsv`），不做列內編輯（改檔重傳）。
- 「去年同期」不可用的可見理由放在**期間列正下方**（不放進 sticky 期間列）：R1 規則「1280 以上期間列最多兩行」優先；按鈕本身仍有 `title` 與 sr-only 說明，`role="status"` 與 testid 不變。


## 2026-10-03｜Revamp v2 R5：健檢、試算、行動的決策化

**問題：** R5 要把健檢卡片牆改成可展開的清單、試算頁改成進頁即表單（範本、絕對值輸入）、行動改成看板、商品頁加 Top／Bottom 10；不碰情境引擎與財務核心。

**採用選項：**
- **健檢群組的排序金額（05 §7）**：同一規則的「合計」與各通路合併為一列，group 的影響金額＝合計成員（沒有合計時取 |影響| 最大者）的「對貢獻影響」；排序＝資料缺漏置頂 → |影響| 由大到小；門檻套用於 |影響|。這改變了 R1「取成員中最大金額」的規則：示範資料的 REV_UP_CM_DOWN 由 782,270.81（MARKETPLACE）改為 598,833.95（合計），順序不變；golden 不受影響。三件事、Markdown、列印摘要與健檢頁共用同一份 `diagnosisGroups()`。
- **健檢頁列出所有群組（含 SKU_NEGATIVE_GP）**：舊頁隱藏 SKU 診斷；規格說「健檢頁＝全部 group」，SKU 群組以「通路／SKU」標籤呈現，超過 8 個折疊。
- **版本號只在計算成功時前進（02 §6）**：方案的 revision 不再隨每次輸入遞增；只有「計算」成功且輸入／名稱與最新版本不同時才 +1 並記錄版本；表單修改中顯示「草稿（未重新計算）」。改回與舊版本相同的輸入會開新版本號（只與最新版本比），不回指舊版。
- **敏感度三組輸入納入方案 state、匯出與備份（R5-4）**：`ScenarioPlan.sensitivity?: { volumes: [a, b, c] }`；備份仍是 v4（欄位加法、選填）；JSON／CSV／Markdown 都輸出；分析結果每次重算、不另存。`docs/SCENARIOS.md` 原「不加入方案、匯出或備份」一句已改。
- **絕對值模式只在表單層換算**：目標件數 → v＝(目標 ÷ 本期件數 − 1)×100、新折扣率 → δ＝新 − 本期（百分點）、新預算 → a＝(新 ÷ 本期廣告費 − 1)×100；相對值 ROUND_HALF_UP 到 4 位小數後才送引擎，畫面同時顯示「＝ 相對 +12.3%」；本期件數為 0／缺、廣告費為 0 時停用該格的絕對值模式。
- **範本不寫入 domain**：六個範本（05 §8 表）只填五個欄位，不自動勾「我了解這是假設試算」，畫面永遠標示「範本數字只是起點」。
- **行動看板用按鈕改狀態、不做拖曳**；狀態改變時記 `status_updated_at`（YYYY-MM-DD，臺北日曆日，與全站 Asia/Taipei 口徑一致；R6 會議紀錄讀 status 與這個日期）。預設檢視為看板，偏好記在備份 `ui_prefs.view`，切換檢視不算資料變更（不標未保存）。展開編輯時該欄在看板上佔兩格寬。
- **試算頁的通路預設**：全站篩選是單一通路時跟著它，否則取資料集的第一個通路（02 §6 寫「預設第一個通路」；跟著全站單一通路更符合經理人剛從總覽切過來的情境）。全站範圍改變時本頁回到新範圍的預設通路，不沿用舊選擇。
- **決策匯出的「目前」區段**：以試算頁正在編輯的 context 為準（`exportWorkspaceDecision` 的 `selectedContextId`），找不到才退回全站單一通路規則；草稿方案的 `plan_revision` 在 CSV 留空、JSON 另列 `draft_plan_ids`，避免草稿指到上一個已計算版本。
- **絕對值換算的精度**：相對值保留 12 位小數後送引擎，讓引擎算出的件數／預算回到使用者輸入的目標；折扣率用 baseline 的精確 D、G 換算並往可行側修正，新折扣率 0% 可算。切換模式不清空輸入、不撤銷結果。
- **範本套用改兩步**：先選範本、再按「套用範本」；五格已有值時提示會覆寫。
- **備份 schema**：R5 的 `sensitivity`／`status_updated_at` 只在 v4 信封接受，v1–v3 維持原形狀。
- **商品頁「資料狀態」**：任一期毛利因 MISSING_COGS 缺值 → 「成本未知」；涵蓋未確認 → 「銷售完整性待確認」；其餘依兩期是否都有列（「兩期皆有／僅本期／僅上期」，依 03 §4 用「上期」不用「前期」）。Top／Bottom 10 小表看整個分析範圍，不跟隨下方篩選；本期沒有銷售的商品以 0 計入「最差」。

**原因：** 經理人要的是「先看最嚴重的、一列一件事」與「進頁就能試算」；所有改動都在呈現與應用層，引擎與 golden 不變。

**影響文件：** `docs/revamp/05_FEATURES.md §7–§9`、`docs/SCENARIOS.md`、`verification/revamp-R5-acceptance.md`。**驗收：** `tests/diagnosis-group.test.ts`、`tests/scenario-presets.test.ts`、`tests/scenario-absolute-mode.test.ts`、`tests/scenario-sensitivity-backup.test.ts`、`tests/action-board.test.ts`、`tests/product-highlights.test.ts`、`tests/e2e/revamp-r5.spec.ts`。
