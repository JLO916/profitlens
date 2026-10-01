# Data contract — v1

## Dataset settings / manifest.json
必要欄位：schema_version="1.0"、dataset_id、source_type (synthetic|user_provided)、currency="TWD"、timezone="Asia/Taipei"、data_as_of、coverage_start、coverage_end、channels、previous_period {start,end}、current_period {start,end}、sales_coverage_confirmed、amount_basis。
金額口徑：不含營業稅的商品收入與費用；消費者支付的運費收入、固定月租與其他未建模收入不納入。資料提供者須先以相同口徑整理並確認；不得把此模型當總帳淨利。若缺營業口徑，先要求在介面確認，不能默認。
使用者可在 UI 填表建立 manifest。sales_coverage_confirmed 只是資料提供者的完整性確認，不是系統獨立查核原始來源。

## CSV general rules
UTF-8 或 UTF-8 BOM；逗號分隔；英文標準欄名；日期 YYYY-MM-DD；金額十進位字串，最多兩位小數，不含貨幣符號或千分位；空白是 null，不是 0。保留檔案名稱與原始行號追溯。
初版建議技術上限為每檔 5 MB／50,000 列，屬可調整產品限制，不是測得的效能保證；超出時友善拒絕，不截斷。
必要 key 的空值、重複鍵、無效日期／數字、混幣、未知通路、超出 coverage 的列是 blocking，整個新資料集不提交，原已成功載入資料保持不變。
同一 SKU 的 category 必須一致。未定義欄位在預覽中列出；確認後忽略，不傳給 AI。

## 1. sales_daily.csv
粒度／唯一鍵：date × channel × sku。
| 欄位 | 意義與限制 |
|---|---|
| date | 商業入帳日，不是必然等於訂單成立日 |
| channel | 銷售目的通路；必須在 manifest.channels 內 |
| sku | 商品代碼；不包含客戶識別資料 |
| category | 品類；僅作分組 |
| units_sold | 當日入帳售出件數，非負整數；不含退回件數；不拿來估退貨率 |
| gross_sales | 商品折扣前、退款前收入，非負 |
| discounts | 當日商品折扣，非負且 <= gross_sales |
| refunds | 當日已入帳商品退款，非負；可大於當日收入，因可來自先前期間 |
| cogs_net | 來源已入帳銷貨成本淨額；支出為正，回收入庫等實際成本沖回為負 |
| currency | TWD |
資料不要求每個 SKU 每天都有列。只有在 coverage 已確認的日期／通路，沒有銷售列才能解讀為無銷售活動；否則是未知。已取消且未認列訂單不納入 gross。
退款時是否可回收商品成本由來源資料決定，不依 refunds 金額自動推算。第一版不以歷史主檔單價回填成本，也不自行分配訂單級折扣。
cogs_net 缺值是 partial：淨營收仍可算；受影響 SKU／通路／總體的毛利及以下相關指標為 null，不能把有效子集偽裝成完整總計。

## 2. channel_costs_daily.csv
粒度／唯一鍵：date × channel。
欄位：date,channel,platform_fees,payment_fees,fulfillment_costs,other_variable_costs,currency。
所有費用支出為正，實際退款／抵扣可以為負；是已入帳金額，不是待乘費率。other_variable_costs 不含廣告費、商品成本或其他欄已列成本。
每個 coverage 日期 × 通路都必須有一列，無費用明確填 0。少列／缺金額屬 partial，阻擋相關貢獻值，不當作 0。

## 3. ad_spend_daily.csv
粒度／唯一鍵：date × channel。
欄位：date,channel,ad_spend,currency。
廣告費按「銷售目的通路」歸屬，是同一口徑的已入帳支出。日 × 通路都需列出，無投放填 0；缺列不是零投放。
不可將 Meta、Google 等媒體平台名稱直接誤當 DTC／MARKETPLACE 的銷售通路。跨通路共用且無法歸屬的投放，v1 無法可靠進行通路級診斷；需整理成有依據、可揭露的上游歸屬，或標示該範圍暫不支援，不能偷偷按營收分攤。
ad_spend 為非負數；廣告退款／跨期更正先在資料提供端依相同政策調整，初版不處理負廣告費。

## Join and filter rules
先彙總 sales 到 date × channel，再按唯一鍵合併其他兩檔。不可把一筆日廣告費接到每個 SKU 後重新加總。
通路貢獻使用完整該通路 SKU 集合；選 SKU／category 僅影響商品毛利區塊，並清楚標示範圍，或在商品頁直接停用行銷後貢獻。
比較模式欄位 `comparison_mode` 支援 `same_days`（相同天數）與 `calendar_months`（完整自然月）；舊 manifest 未填時明確按 `same_days` 解析。`same_days` 前後期天數必須相同；`calendar_months` 每期必須恰為一個完整自然月，月份天數可以不同，不截掉任何日期。前期迄日必須早於本期起日，兩期都落在 coverage 內且不得晚於 data_as_of。未完整月份請改用相同天數模式並呈現截至日，不能標為完整自然月。data_as_of 記錄快照日期；退款按入帳日，因此不是訂單 cohort 的最終獲利，不能宣稱當期退款比代表最終退貨率。

## Privacy and exports
不需要客戶姓名、Email、電話、地址、訂單明細個資。未知欄不送 AI。商品名稱等文字不執行、不注入 system prompt。
CSV 匯出對可能被試算表當公式的文字欄（=,+,-,@ 與前導控制字元）做安全 escaping；有效數值負號不是文字公式。HTML 不使用未清理的插入內容。
