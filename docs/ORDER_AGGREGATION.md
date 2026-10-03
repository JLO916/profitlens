# 訂單明細彙總工具（`scripts/aggregate_orders.py`）

> 對應：R3 匯入精靈與台灣來源（`docs/revamp/04_IMPORT_TW.md` §4.3）、決策 D5＝以 CLI 腳本彙總，不在 UI 內彙總。
> 只用 Python 3 標準函式庫，不需要 `pip install`。所有金額以 `decimal.Decimal` 計算，`ROUND_HALF_UP` 到 2 位小數，不使用浮點數。

## 1. 用途

ProfitLens 只接受「日 × 通路 × SKU」粒度的三份標準 CSV（見 `docs/DATA_CONTRACT.md`）。Shopline、91APP、Cyberbiz、蝦皮等平台匯出的多半是**訂單明細**：一列是一筆訂單裡的一個商品，還常常含 5% 營業稅、折扣記在訂單層、退款跟訂單同一列。

這支工具依你寫的 `rules.json`，把訂單明細整理成：

| 輸出檔 | 粒度 | 內容 |
|---|---|---|
| `sales_daily.csv` | 日 × 通路 × SKU | `units_sold`、`gross_sales`、`discounts`、`refunds`、`cogs_net`（未稅、2 位小數） |
| `channel_costs_daily.csv` | 日 × 通路 | 四個費用欄**全部填 0（佔位）** |
| `ad_spend_daily.csv` | 日 × 通路 | `ad_spend` **全部填 0（佔位）** |
| `aggregation_log.md` | — | 套用的規則、讀取／保留／丟棄列數與原因、彙總前後合計對帳、含稅換算摘要 |

工具不連網、不上傳任何資料；輸出寫在你指定的本機資料夾。

## 2. 什麼時候會被引導到這裡

匯入精靈 Step 1 偵測到檔案是訂單級（例如標題列含「訂單號碼／訂單編號」，或命中 `shopline_orders`、`91app_orders`、`cyberbiz_orders`、`shopee_orders` 等 preset 指紋）時，會顯示「這是訂單明細，請先用整理工具彙總」並連到本頁。ProfitLens 維持 v1 原則：**不在 UI 內自動彙總訂單**，彙總由你在本機用這支工具完成，結果與紀錄都看得到、可重跑。

## 3. 撰寫 `rules.json`

先複製範例再改欄名：

```bash
cp scripts/aggregate_rules.example.json my_rules.json
```

`rules.json` 是一個 JSON 物件，鍵如下（不認得的鍵會直接報錯，避免打錯字卻沒生效）。

### 3.1 `columns`：來源欄名對照（必填物件）

值是「訂單檔標題列上的欄名」，要完全一致（前後空白會忽略）。

| 鍵 | 必填 | 說明 |
|---|---|---|
| `order_id` | 必填 | 訂單編號。用來把同一訂單的各列放在一起分攤訂單折扣。 |
| `date` | 必填 | 入帳日期。接受 `2026-08-01`、`2026/08/01`、`2026/8/1`，後面帶時間（`2026/08/01 10:15`）會只取日期。請先確認是台北時間。 |
| `channel` | 二擇一 | 通路欄。與頂層 `channel`（固定通路）二擇一。 |
| `sku` | 必填 | 商品代碼。 |
| `category` | 二擇一 | 品類欄。與頂層 `category`（固定品類）二擇一。同一 SKU 的品類必須一致，否則報錯。 |
| `units` | 必填 | 數量，非負整數。退款不扣件數（契約：件數不含退回）。 |
| `line_amount` | 必填 | 該列商品金額（**折扣前**、退款前），非負、最多 2 位小數。 |
| `order_discount` | 選填 | 訂單層折扣。同一訂單每列重複同一值，或只填在其中一列都可以；同一訂單出現兩個不同值會報錯。按各列商品金額比例分攤（見 §5）。沒設定時 `discounts` 全部為 0.00。 |
| `refund_amount` | 選填 | 該列退款金額。設定時 `refund_date` 也必填。沒設定時 `refunds` 全部為 0.00。 |
| `refund_date` | 選填 | 退款日期。退款金額 > 0 的列必須有有效日期。 |
| `unit_cost` | 選填 | 單位成本；該列成本＝單位成本 × 數量（ROUND_HALF_UP 2 位）。與 `line_cogs` 二擇一。 |
| `line_cogs` | 選填 | 該列成本合計（可為負數，表示成本沖回）。與 `unit_cost` 二擇一。 |
| `status` | 選填 | 訂單狀態欄，配合頂層 `exclude_status` 丟棄已取消等訂單。 |

數字欄允許千分位逗號與 `NT$`／`$` 前綴（會去掉並在紀錄中計數）；其他非數字字元一律報錯，不會猜。

### 3.2 頂層鍵

| 鍵 | 預設 | 說明 |
|---|---|---|
| `channel` | — | 整份檔案固定一個通路名稱（例如 `"MARKETPLACE"`）。與 `columns.channel` 二擇一。 |
| `channel_map` | `{}` | 把來源通路值換成 ProfitLens 的通路名稱，例如 `{"官網": "DTC", "蝦皮": "MARKETPLACE"}`。不在對照內的值沿用原值，並在紀錄中列出。 |
| `category` | — | 沒有分類欄時，所有 SKU 使用的固定品類。與 `columns.category` 二擇一。 |
| `inclusive_tax` | **必填** | `true`＝金額含營業稅，要換算成未稅；`false`＝已是未稅。不確定時請看發票或平台報表欄位說明，不要猜。 |
| `tax_rate` | `"0.05"` | 稅率，**字串**（避免 JSON 浮點誤差），0 到 0.2，最多 4 位小數。 |
| `cogs_inclusive_tax` | `false` | 成本是否也含稅。成本常是未稅進貨價，所以預設不換算；確定含稅才設 `true`。 |
| `currency` | `"TWD"` | 寫進輸出檔的幣別。ProfitLens v1 只接受 TWD，設成其他值會在紀錄中警告，匯入時會被擋。 |
| `encoding` | `"utf-8-sig"` | 訂單檔編碼。Excel 另存的 Big5 檔請設 `"cp950"`。 |
| `exclude_status` | — | 要丟棄的訂單狀態值陣列，例如 `["已取消", "未付款"]`。需同時設定 `columns.status`。契約規定已取消且未認列的訂單不納入原價收入。 |
| `description` | — | 備註文字，不影響計算。 |

範例：`scripts/aggregate_rules.example.json`；測試用的完整案例：`tests/fixtures/orders_sample/`。

## 4. 執行指令

```bash
python3 scripts/aggregate_orders.py --orders <訂單明細.csv> --rules <rules.json> --out <輸出資料夾>
```

例：

```bash
python3 scripts/aggregate_orders.py \
  --orders tests/fixtures/orders_sample/orders.csv \
  --rules tests/fixtures/orders_sample/rules.json \
  --out ./aggregated
```

- 結束碼 `0`：成功，輸出四個檔案，終端機印出讀取／保留／丟棄列數。
- 結束碼 `1`：訂單資料有問題（例如日期無法辨識、金額不是數字、同一訂單折扣不一致、同 SKU 品類不一致）。會列出每個問題與**原始行號**，且**不輸出任何檔案**。
- 結束碼 `2`：參數或 `rules.json` 有問題（缺必填鍵、欄名在訂單檔找不到、JSON 格式錯誤等）。

修正後重跑即可；同一份輸入與規則永遠得到同樣結果。

## 5. 計算規則

1. **丟棄**：完全空白的列、`exclude_status` 指定狀態的列。丟棄數與行號寫在紀錄中。其他資料錯誤一律停止，不默默丟掉金額。
2. **訂單折扣分攤**：在來源口徑（尚未換算稅）下，按同一訂單各列 `line_amount` 比例分攤：前面各列 `折扣 × 該列金額 ÷ 訂單金額合計`，ROUND_HALF_UP 2 位；**四捨五入差額放在訂單最後一列**（有金額的列），所以分攤後合計一定等於訂單折扣。
3. **含稅換算**（`inclusive_tax: true`）：`未稅 = 含稅 ÷ (1 + tax_rate)`，**逐列**換算 `gross_sales`、分攤後折扣、退款，ROUND_HALF_UP 到 2 位後才加總；不做「先加總再換算」。成本只有在 `cogs_inclusive_tax: true` 時才換算。
4. **退款以退款日入帳**：退款記在 `refund_date` 當天、同通路、同 SKU 的列；那天沒有銷售時會產生一列 `units_sold=0`、`gross_sales=0.00` 只有退款的列。退款不扣件數、不沖回成本（契約：不得見退款便自行沖回成本）。
5. **成本**：沒設定成本欄時 `cogs_net` 全部留白（未知）。有設定但某些訂單列沒有成本時，該日 × 通路 × SKU 的 `cogs_net` 留白，不當成 0；匯入後毛利會顯示「資料待補」。
6. **彙總**：依 日 × 通路 × SKU 加總，輸出依日期、通路、SKU 排序。

## 6. `aggregation_log.md` 會寫什麼

- **套用的規則**：每個 `columns` 對照、通路對照、含稅設定、稅率、編碼、排除狀態，以及分攤、退款、換算順序的說明。
- **讀取、保留與丟棄**：讀取列數、保留列數、丟棄列數與各原因的行號；去掉千分位／貨幣符號的值數；不在 `channel_map` 的通路值。
- **合計對帳**：`units_sold`、`gross_sales`、`discounts`、`refunds`、`cogs_net` 的「彙總前逐列加總」與「彙總後輸出合計」，逐欄標示是否一致；成本未知的列與影響範圍。
- **含稅換算摘要**：公式、換算欄位、換算列數、含稅原值合計、逐列換算後合計、「合計後才換算」的對照值與分位差額。
- **費用與廣告佔位提醒**：明列 `channel_costs_daily.csv`、`ad_spend_daily.csv` 的列數，並提醒金額全部是 0。

建議把 `aggregation_log.md` 與三份 CSV 放在同一資料夾保存，作為匯入前處理的來源說明。

## 7. 限制（請務必讀）

- **通路費用與廣告費只是 0 佔位**：工具只從訂單檔產生銷售；`channel_costs_daily.csv` 與 `ad_spend_daily.csv` 的每一列都是 0。請依平台對帳單（抽成、金流、物流）與廣告後台填入實際已入帳金額後再匯入。直接匯入會把費用當成 0，通路貢獻會被**高估**。
- **不做廣告歸屬或分攤**：Meta、Google 等媒體平台不是銷售通路；廣告費請自行依「銷售目的通路」整理。工具不會按營收比例分攤廣告費。
- **退款以退款日計**：退款可能落在訂單期間之外，也可能大於當日收入；這是契約允許的。當期退款比不代表最終退貨率。
- **沒有訂單的日期不會產生費用／廣告列**：涵蓋期間內若某天某通路沒有訂單但有費用或廣告，請自行補列（ProfitLens 要求每個涵蓋日 × 通路都有費用與廣告列，缺列不等於 0）。
- **不處理運費收入與平台補貼**：`line_amount` 請對到商品金額，不要選含運費的訂單總額。
- **preset 欄名尚未驗證**：各平台實際欄名以你的真實匯出檔為準；範例規則只是起點。
- **只支援單一幣別**，且 ProfitLens v1 只接受 TWD。
- 單一 CSV 讀入記憶體處理；ProfitLens 匯入上限是每檔 5 MB／50,000 列，輸出若超過請分期間處理。

## 8. 2026-10-03 補充：單價、逐列折扣、多欄加總

| 鍵 | 意義 |
|---|---|
| `columns.unit_price` | 只有單價沒有列金額的匯出（蝦皮「商品活動價格」、momo「單筆售價」）：列金額＝單價 × `units`，ROUND_HALF_UP 2 位。與 `columns.line_amount` 二擇一。 |
| `columns.line_discount` | 該列自己的折扣（momo「總折扣金額」、91APP「訂單總折扣金額」），直接計入該列，不分攤。與 `columns.order_discount` 二擇一。 |
| 陣列 | `order_discount` 與 `line_discount` 可以給欄名陣列，會把這些欄位相加（空白＝0），例如蝦皮 `["賣家負擔優惠券", "賣家負擔蝦幣回饋券"]`。 |
| 折扣正負號 | 折扣一律取絕對值（91APP 以負數表示折扣、蝦皮以正數）。 |
| 日期 | `YYYY-MM-DD`、`YYYY/MM/DD`，後面可接時間（`2026-08-01 10:12`），只取日期部分。 |

## 9. 各平台的前置步驟與規則範例（第一階段：蝦皮、momo 店+、91APP）

規則範例在 `scripts/rules/`，欄名依公開文件重建並以去識別化樣本（`tests/fixtures/source-samples/`）實跑驗證；**實際匯出檔的表頭可能不同**，請先比對再改欄名。各平台的來源與信心等級見 `verification/revamp-R3-preset-verification.md`。

### 9.1 蝦皮 賣家中心 → 訂單管理 → 我的銷售 → 匯出報表（`scripts/rules/shopee_orders.rules.json`）
1. 匯出的 xlsx 有密碼（預設為賣場綁定手機末 6 碼），先解除密碼，只保留需要的工作表後另存成 **CSV UTF-8**。
2. 一列＝一個商品選項；「商品活動價格」「商品原價」是**單價**，規則用 `unit_price` 乘以「數量」。
3. 「商品總價」「買家總支付金額」「成交手續費」等是**訂單層**，每一列重複，不能逐列相加；優惠券（賣家負擔優惠券＋賣家負擔蝦幣回饋券）用 `order_discount` 陣列按比例分攤。
4. 「訂單狀態」＝「不成立」用 `exclude_status` 排除（注意：不成立原因含「遺失」的是蝦皮賠付，視為完成，若有請手動保留）。
5. 退款金額不在這份檔；費用請用「我的進帳」撥款明細另外整理成 `channel_costs_daily.csv`（費用在該報表是負數，要轉正）。

```bash
python3 scripts/aggregate_orders.py --orders shopee_orders.csv --rules scripts/rules/shopee_orders.rules.json --out out/shopee
```

### 9.2 momo 店+ 帳務 → H101商店對帳 → 對帳明細 → 工作表「訂單明細」（`scripts/rules/momo_store_plus.rules.json`）
1. 下載的 .xls 有多個工作表，只用「訂單明細」；標題列在第 3 列（第 2 列是「總金額」合計列），請刪掉前兩列後另存 CSV UTF-8。
2. 「單筆售價」是單價（`unit_price` × 數量）；「總折扣金額」是該列折扣（`line_discount`）；「訂單狀態」＝「退貨」排除。
3. SKU 用「商品原廠編號」（你自己的料號，方便接成本）；沒有填的話改用「商品編號」。
4. 這份是 **momo 店+（商店）** 的對帳明細，不是 3P 供應商（SCM）對帳單；SCM 對帳單為未稅、以品號 × 月為粒度，欄名尚未公開，需另建規則。

### 9.3 91APP OSM → 所有訂單查詢 → 批次匯出資料（`scripts/rules/91app_orders.rules.json`）
1. 匯出時請選「所有訂單資料（全部欄位）」，否則欄位不完整；一列＝一筆訂單編號（TS），主單（TM）運費在每一列重複，不要相加。
2. 「商品總金額(單價*數量)」已是列金額（`line_amount`）；「訂單總折扣金額」是該列折扣、以負數表示（`line_discount`，取絕對值）；「商品總成本(成本*數量)」可直接當未稅成本（`line_cogs`）。
3. 「訂單狀態」＝「已取消」排除；退貨在另一份退貨單報表。
4. 欄名目前依 91APP 官方 Admin API 的欄位說明重建（匯出檔表頭未公開），請拿到檔案後逐欄核對。

