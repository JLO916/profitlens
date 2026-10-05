# ProfitLens 市場同類產品調研與差異分析（2026-10-05）

> 調研對象：ProfitLens v2.0.0（`revamp/v2`，2026-10-03 完成 R7）。方法見 §2；所有競品陳述都附查證狀態，沒查到的寫「未查到」，查證不一致的列在 §11。本文件不改變任何產品決策，只提供事實與建議，需要拍板的事項另列。

## 1. 結論（先講答案）

1. **沒有「完全相同」的產品。** ProfitLens 同時具備五件事：只靠三份 CSV 在瀏覽器本機計算、每個金額能追到 CSV 檔名與原始行號、九項金額橋接、以自己實績為基準的假設試算、以及會議決議紀錄。本次五個角度共查核 104 個產品／報表，沒有任何一款同時做到。
2. **「算出扣廣告後的貢獻或淨利」本身是成熟且擁擠的品類。** Shopify 生態有 TrueProfit（US$35/月起）、BeProfit、Lifetimely、Net Net、MarginStack、StoreHero、Conjura；東南亞市集有 BRP、BigSeller。光是「算得出貢獻毛利」不構成護城河。
3. **這些工具幾乎全靠 OAuth／API 串接，資料存在廠商雲端，支援的是 Shopify、Amazon、Shopee／Lazada。** 沒有一款查到原生支援 momo、PChome、91APP、SHOPLINE、CYBERBIZ；BigSeller 是否支援蝦皮台灣站，官方文件也沒有證實。
4. **台灣現況分三層，都沒有「多平台日資料 → 四層貢獻 → 兩期橋接」。** 平台後台（蝦皮、momo、PChome）只有銷售、流量與 ROAS，不扣手續費與成本；開店平台（SHOPLINE、CYBERBIZ）只算到「營收 − 成本價」；在地 ERP（蝦樂賣、PK-ERP、FLAPS、鼎新 A1）重訂單與庫存，獲利分析偏淺。
5. **在地最直接的同類是圭話行銷的「電商營運工具箱」（ecom.atmarketing.tw）。** 繁中介面、多通路儀表板宣稱支援 10 個台灣平台的 CSV 或 API、免費版資料留在瀏覽器、Pro NT$599–799/月。但它是分散的單點計算器加以營收為主的儀表板，本次沒查到統一的貢獻口徑、橋接、行號追溯或會議流程。
6. **ProfitLens 真正要取代的是「自製 Excel ＋ 手動匯整三個後台」。** 蝦皮台灣廣告學院的教學也是用毛利計算表反推最低 ROAS。Triple Whale、Polar 這類歸因與 AI 代理平台，和 ProfitLens 不在同一個戰場。
7. **競品明顯比 ProfitLens 強的地方：** API 自動同步、廣告歸因、訂單與顧客層級指標（CAC、LTV、cohort）、警示與晨報、行動 App、多人使用、同業基準（CYBERBIZ 企業版）、平台撥款逐筆對帳（BRP、SiteGiant、Ragic 範本）。
8. **新進者正往同一方向靠攏。** MarginStack（2026-08 上架）有警示、健康分數與建議動作；Conjura 的 Actions Dashboard 依影響排序下一步；StoreHero 在晨會前寄 Email 快照。ProfitLens 的差異化要放在台灣通路、可查核性、本機隱私與週會決策流程，不能只強調「會算貢獻」。

## 2. 調研方法與範圍

- 日期：2026-10-05。工具：網路搜尋與官方頁面抓取（英文、繁體中文、簡體中文查詢）。
- 五個角度，各由一位研究代理掃描、一位獨立查證代理逐項核對（產品是否存在、是否扣平台費與廣告、資料輸入方式、價格與台灣適用性），另一位代理只讀本專案文件整理 ProfitLens 的功能與邊界，最後由一位代理彙整；共 12 個代理、515 次工具呼叫。
  1. 全球 DTC／Shopify 利潤分析 SaaS（17 個產品，13 個完全成立、4 個修正後保留）
  2. 台灣平台內建報表與在地工具（22 個，15 ＋ 7）
  3. 行銷效率／歸因與電商財務 P&L（21 個，10 ＋ 11）
  4. 多通路／跨境賣家利潤工具，含 Shopee／Lazada 生態（25 個，13 ＋ 12）
  5. 情境試算、FP&A 與決策／會議流程工具（19 個，13 ＋ 4，2 個剔除）
- 查證規則：只列實際在搜尋結果或官方頁面看到的產品；價格以查看當日官網標示為準，並附幣別；查不到的寫「未查到」；單一間接來源標為低可信。查證不一致或未證實的陳述一律移到 §11，不進結論。
- 限制：沒有試用任何競品帳號，功能深度以官方文件與可信評測為準；台灣平台後台的部分頁面需登入或回 403，無法核實（例如 SHOPLINE 說明中心、蝦皮雲管家官網）；各查證者提出但本次未調研的產品列在 §11。

## 3. 市場地圖

| 區隔 | 代表產品 | 內容 | 與 ProfitLens 的接近程度 |
|---|---|---|---|
| 平台原生報表（市集與開店平台內建） | 蝦皮賣家中心商業分析＋廣告報表、momo 商店分析（I 系列）與對帳明細、Google Retail Connect（momo 商家廣告）、PChome 廠商後台（P++家家）、Shopify 內建 Profit reports | 平台自動產生的銷售、流量、轉換與廣告報表，免匯入。市集後台不扣手續費、也沒有成本；Shopify Profit reports 只算到「淨銷售 − 成本」，不含廣告與金流費。 | 低。它們是 ProfitLens 的資料來源，不是替代品；但也是賣家「覺得已經夠用」的預設選項。 |
| 台灣開店平台內建分析 | SHOPLINE 報表／Shoplytics Pro、CYBERBIZ 圖表分析、91APP OMO 管理報表、EasyStore 報表、Shopto 多平台同步 | 官網＋門市的報表與毛利（營收 − 成本價 × 件數），需先設定成本價。不扣金流、物流、廣告，也看不到蝦皮、momo。 | 中低。只涵蓋自家通路，口徑停在毛利。CYBERBIZ 的三線期間比較最接近「兩期比較」，但沒有金額橋接。 |
| 台灣在地試算器、對帳範本與自製 Excel | 電商營運工具箱（atmarketing）、蝦皮手續費計算機（0123456789.tw）、英特艾毛利率計算器、Ragic 蝦皮對帳範本、蝦皮對帳王、蝦皮廣告學院「毛利計算表」教學、Productivilab 試算表範本 | 手動輸入的單筆或單次試算，或上傳蝦皮 Excel 做手續費對帳；另有賣家自己做的毛利表。在地化高、價格低或免費，但不會接上期間性的實績資料。 | **高**（客群與使用情境）。atmarketing 是最直接的在地競品；Excel 則是實際要被取代的對象。 |
| 多平台電商 ERP（附利潤模組） | BigSeller、SiteGiant、蝦樂賣 HappySell、蝦皮雲管家、PK-ERP、FLAPS、鼎新 A1、店小秘、UpSeller、芒果店長、馬幫ERP、旺銷王、Ginee | 以 API 綁店處理訂單、庫存、刊登，再附加利潤或毛利報表。東南亞與中國的 ERP 多以平台回款為基礎逐項扣費用，但 Shopee 廣告費常要另外授權或手動匯入；台灣在地 ERP 的利潤多只到毛利。 | 中。自動化與費用拆解比 ProfitLens 強，但沒有通路貢獻階梯、兩期橋接、試算或會議流程；台灣市集覆蓋不完整。 |
| Shopify／DTC 利潤與貢獻毛利 App | TrueProfit、BeProfit、Lifetimely by AMP、Net Net、MarginStack、StoreHero、Conjura、Bloom Analytics、Lebesgue | OAuth 串接 Shopify 與廣告平台，在雲端算出即時淨利或貢獻毛利；多依訂單量或營收計價。新進者開始加入警示、目標、行動建議。 | 概念上高（同樣回答「扣廣告後是否賺錢」），台灣適用性低：只能涵蓋台灣品牌的 Shopify 官網。 |
| 市集專用利潤 SaaS（Amazon、TikTok Shop、東南亞） | BRP E-Commerce Profit Analytics（Shopee／Lazada）、Sellerboard、Helium 10 Profits、Jungle Scout、Shopkeeper、ManageByStats、船長BI、Dashboardly（TikTok Shop）、Veeqo Profit Analyzer | 針對單一或少數市集，費用涵蓋很深（Amazon 100 種以上費用、Shopee 撥款），逐單計算扣廣告後利潤。 | 中。BRP 的口徑與 ProfitLens 最接近，但都需要 API 與雲端，也沒有台灣通路。 |
| 電商 BI、歸因、會計對帳與通用 FP&A | Polar Analytics、Triple Whale、Daasity、Glew、Peel、Northbeam、Hyros、Measured、Rockerbox、ProfitMetrics、Supermetrics（含 Shopee 連接器）、Funnel、Admetry、AnyMind AnyX、A2X、Finaloop、Webgility、Synder、MetricMosaic、Causal（Lucanet）、Runway（CFO.ai）、Abacum、Fathom、Eightx CM 計算器 | 資料倉儲型 BI、多觸點歸因與 MMM、撥款入帳到會計軟體，以及通用情境建模。功能強、價格高，多半需要數據或財務人力。 | 低至中。Daasity 的 CM1／CM2 口徑、MetricMosaic 的 what-if、Abacum 的核准流程可參考，但目標使用者與資料取得方式完全不同。 |

## 4. 最接近的十個產品

| 產品 | 為什麼接近 | 主要差異 | 價格（2026-10-05 官網） |
|---|---|---|---|
| [電商營運工具箱（圭話行銷）](https://ecom.atmarketing.tw/) | 客群同為台灣中小電商老闆與行銷人員，也走 CSV 路線：momo、PChome、Yahoo、樂天、WACA 標為 CSV，蝦皮、SHOPLINE、CYBERBIZ、91APP、EasyStore 標為 API。訴求同樣是「ROAS 不等於賺錢」。免費版資料只留在瀏覽器；有 AI 營運週報產生器與 Meta 廣告「砍／留／加碼」診斷。 | 扣廣告後淨利來自 ROAS 計算器，要手動輸入廣告費、營收、成本、抽成%、運費、訂單數，屬單次試算；多通路儀表板以營收與通路佔比為主。沒查到逐通路四層貢獻、兩期橋接、規則健檢、行號追溯、待辦看板或會議紀錄。工具數多（官網稱 206 個）、有 AI 文案；Pro 版雲端同步、AI 功能需登入。 | 免費版（AI 每日 5 次）；Pro NT$799/月（創始價 NT$599/月終身）；Team NT$2,099/月或 NT$19,999/年 |
| [BRP E-Commerce Profit Analytics](https://brp.com.my/) | 公式為「訂單金額 − 佣金 − 廣告 − 運費 − 平台費 − 退貨」，可依訂單、SKU、通路每日計算，並標示平台扣款異常。亞洲市集中口徑最貼近「扣廣告後通路貢獻」。 | 需官方 API 授權、資料在雲端；支援 Shopee、Lazada、TikTok Shop、Zalora、PGMall，未寫 Shopee 哪些站點，台灣站不明，無 momo、PChome。沒查到兩期橋接、情境試算或會議流程。 | Lite MYR 199/月（3,000 單）、Pro MYR 399、Enterprise MYR 599；14 天試用 |
| [BigSeller 利潤報表](https://help.bigseller.com/zh_CN/detailPage/10/1/3778/content) | 店鋪銷售利潤統計含平台補貼、佣金、交易費、服務費、行銷費、廣告費（需授權 Shopee 廣告應用）、商品成本、退款；可依訂單、SKU、店鋪查看與跨店比較。 | 作業型 ERP（訂單、庫存、刊登），API 授權、雲端。官方服務國家未列台灣，蝦皮台灣站未證實；無 momo、PChome、91APP、Cyberbiz。Shopee 訂單利潤報表本身未含廣告費。沒查到兩期橋接、試算或決策流程。 | 馬來西亞價：Free RM0（1,500 單、3 店）、Basic RM129/月、Pro RM3,642/年、Business RM5,859/年 |
| [Conjura](https://www.conjura.com/pricing) | 所有方案都有貢獻毛利與 ROAS 追蹤，Growth 起可合併 Amazon、eBay、Walmart 與官網；Actions Dashboard 依商業影響排序「下一步」。與「多通路貢獻＋依影響排序的健檢與待辦」概念最接近，且平價。 | API 串接 Shopify、BigCommerce 與歐美市集，無台灣平台，雲端。行動只是建議清單，沒有指派、追蹤或會議紀錄；預估靠 Owly AI 加購，不是使用者自填的試算。 | Essentials US$19.99/月、Growth US$59.99、Scale US$129.99；Owly AI 加購 US$199/月起 |
| [Daasity](https://help.daasity.com/core-concepts/contribution-margin) | 官方定義 CM1（淨銷售扣 COGS、運費、履約、金流、平台費）與 CM2（再扣行銷與通路促銷），可依通路比較，與「通路貢獻 → 扣廣告後貢獻」幾乎一一對應，可借來對外說明口徑。 | 受管資料倉儲加 API，面向年營收 US$5M 以上、有數據團隊的品牌；無台灣平台；介面沒有逐數字行號追溯，也沒有試算或決策流程。 | Shopify App Store 標示 US$1,899/月（依過去 3 個月平均營收年化計費） |
| [MarginStack](https://apps.shopify.com/marginstack) | 依訂單、SKU、通路、日計算貢獻毛利；毛利漂移與通路虧損警示、每日晨報 Email、健康分數與建議動作。設計上與「規則健檢 → 行動」最接近。 | 只支援 Shopify（Meta、Google 選用，COGS 可 CSV），雲端；2026-08-31 上架、1 則評價。沒查到兩期橋接、試算、會議紀錄或追溯；用健康分數，ProfitLens 刻意不用分數。 | US$49/月，14 天試用 |
| [StoreHero](https://storehero.ai/pricing) | 商品與活動層級貢獻毛利；年度目標拆成季節調整的月度基準並以紅綠燈顯示偏離；Spend Advisor 給「暫停／調整／放大」建議；每日、週、月 Email 快照，在晨會前列出問題與待辦。最接近「每週會用」的國際產品。 | 只確認 Shopify 與 Meta／Google，雲端，無台灣平台。目標與預測比 ProfitLens 完整，但沒查到折扣或免運 what-if、會議紀錄或來源追溯。 | 依過去 12 個月營收：US$0–1M 為 US$179/月（年繳 159）、US$1–2M 為 US$249；Elite Support US$299／399 起 |
| [TrueProfit](https://trueprofit.io/pricing) | 即時淨利扣 COGS、運費、手續費、稅、廣告與自訂費用；Advanced 起有 P&L 與商品淨利排名。價格低、上手快，是「扣廣告後是否賺錢」最典型的入門工具。 | 訂單靠 Shopify（及 TikTok Shop）API，只有 COGS 與處理費可用 CSV；雲端；台灣主流平台不支援。店家整體淨利為主，無通路比較、兩期橋接、試算或會議流程。有行動 App 與 Email 報表。 | Basic US$35/月（300 單）、Advanced US$60、Ultimate US$100、Enterprise US$200；超量每單 US$0.07–0.30 |
| [Lifetimely LTV & Profit by AMP](https://useamp.com/pricing.md) | 每日 P&L 含貢獻毛利、廣告費、CAC 回收期；同類中評價最多之一（4.9 星、548 則）。 | 偏重 LTV／CAC（ProfitLens 刻意不算）；Shopify 核心、Amazon 加購、雲端、無台灣平台。沒查到廣告預算、折扣、免運 what-if，也沒有會議流程；有點數制 AI Profit Agent。 | Free（50 單/月）、S US$49、M US$149、L US$299 … Unlimited US$999/月（S、L 各來源不一致） |
| [Net Net — Profit Analytics](https://apps.shopify.com/netnet) | 每筆訂單三層瀑布：毛利 → 貢獻毛利 → 淨利，並算 ROAS 與 POAS；分層與 ProfitLens 四層階梯相近。 | 只支援 Shopify（Meta、Google Ads、Shippo、ShipStation），雲端；2026-05 上架、2 則評價，偏印度市場。算到淨利（含營運費用），ProfitLens 刻意停在貢獻。無追溯、試算或決策流程。 | Starter US$15/月、Growth US$49、Professional US$99、Scale US$199；年繳省 20% |

## 5. 差異矩陣

| 產品 | 目標使用者／市場 | 資料來源與匯入 | 利潤口徑（扣平台費與廣告？） | 可追溯性 | 台灣通路支援 | 情境試算 | 行動與會議流程 | 資料存放與隱私 | 定價 |
|---|---|---|---|---|---|---|---|---|---|
| **ProfitLens v2.0.0** | 台灣中小多通路電商的行銷與營運主管；週會、月會 | 三份日粒度 CSV 手動匯入；四步驟精靈；訂單明細需先用本機腳本彙總 | 淨營收 → 商品毛利 → 通路貢獻 → 扣廣告後貢獻；扣平台、金流、物流、其他、廣告 | 每個金額可追到公式、CSV 檔名、原始行號；九項橋接無殘差 | 9 個來源預設（蝦皮、momo、PChome、91APP、Shopline、Cyberbiz、Meta、Google），含稅 5% 換算；只有蝦皮訂單以真實檔驗證過 | 以實績為基準的單一通路試算：5 個輸入、6 個範本、損益門檻 | 8 條健檢 → 待辦看板 → 會議紀錄凍結並比較上次；PDF、Excel、PPT 匯出 | 純瀏覽器、免登入、不上傳；經同意才存 IndexedDB | 免費公開站，無訂閱 |
| 電商營運工具箱（atmarketing） | 台灣中小賣家、小編 | 計算器手動輸入；多通路儀表板 CSV／API | 儀表板以營收為主；ROAS 計算器手動算淨利 | 未查到 | 10 個台灣平台（含 momo、PChome） | 多個單點計算器，不接實績 | AI 週報、Meta 砍／留／加碼清單；無會議紀錄 | 免費版存瀏覽器；AI 功能需登入；Pro 雲端同步 | Free／Pro NT$599–799/月／Team NT$2,099/月 |
| 蝦皮賣家中心 商業分析 | 蝦皮賣家 | 平台自動產生，可下載 | 否：銷售額不扣手續費、無成本；廣告只到 ROAS | 平台內；訂單、撥款另載 Excel | 只有蝦皮 | 無 | 無 | 蝦皮雲端 | 賣家免費（平台費另計） |
| CYBERBIZ 圖表分析 | CYBERBIZ 官網與門市品牌 | 平台自動產生 | 毛利＝營收 − 成本價；不扣金流、物流、廣告 | 未查到 | 只有自家官網與門市 | 無 | 無；三線期間比較，企業版同業基準 | 雲端 SaaS | 年費制（金額未查到） |
| 蝦樂賣 HappySell | 台灣蝦皮中小賣家 | 蝦皮官方 API（另稱支援 momo、酷澎） | 有毛利分析；未見扣廣告與手續費 | 可匯出 Excel | 蝦皮為主 | 無 | 無 | 雲端，需 API 授權 | NT$3,980/年 |
| BigSeller | 東南亞 Shopee、Lazada、TikTok Shop 多店賣家 | API 授權 20 多個平台 | 店鋪利潤可扣平台費、成本、退款，授權後含 Shopee 廣告費 | 到訂單與平台帳單 | 台灣站未證實；無 momo、PChome | 未查到 | 未查到 | 雲端 | Free（1,500 單）；Basic RM129/月 |
| BRP | 馬來西亞與東南亞多市集賣家 | 官方 API（Shopee、Lazada、TikTok Shop 等） | 是：扣佣金、廣告、運費、平台費、退貨 | 逐單費用核對；無列號 | 未見台灣站與 momo | 未查到 | 標示異常扣款與表現差的 SKU；無會議流程 | 雲端 | MYR 199–599/月 |
| TrueProfit | Shopify、TikTok Shop 中小店 | OAuth 同步；COGS 可 CSV | 是：扣 COGS、運費、手續費、稅、廣告 | 未查到 | 無 | 未查到 | Email 報表、行動 App | 雲端 | US$35–200/月（依單量） |
| Lifetimely by AMP | Shopify DTC 品牌 | OAuth（Shopify＋廣告；Amazon 加購） | 是：每日 P&L、貢獻毛利、CAC、LTV | 未查到 | 無 | LTV 預測；無 what-if | AI Profit Agent；無會議流程 | 雲端 | Free～US$999/月 |
| Conjura | 英國、歐美 Shopify 與 BigCommerce 品牌 | API；Growth 起接 Amazon、eBay、Walmart | 是：所有方案都有貢獻毛利與 ROAS | 未查到；可匯出 CSV | 無 | Owly AI 預估（加購） | Actions Dashboard 依影響排序；無指派、無會議 | 雲端 | US$19.99–129.99/月 |
| Daasity | 年營收 US$5M 以上的全通路品牌 | API 串進受管資料倉儲 | CM1（扣平台、履約、金流）／CM2（再扣行銷） | 倉儲可查；介面沒有列號追溯 | 無 | 未查到 | 預建儀表板；無決策流程 | 雲端倉儲 | US$1,899/月 |
| MarginStack | Shopify D2C 團隊 | Shopify＋Meta、Google；COGS 用 CSV | 是：依訂單、SKU、通路、日算貢獻毛利 | 未查到 | 無 | 未查到 | 警示、晨報、健康分數、建議動作 | 雲端 | US$49/月 |
| StoreHero | Shopify 品牌經營者 | Shopify＋Meta、Google API | 是：商品與活動層級貢獻毛利 | 未查到 | 無 | 目標拆月度基準、12 個月預測 | 暫停／調整／放大建議；Email 快照 | 雲端 | US$179/月起（依營收） |

## 6. ProfitLens 的獨特之處

1. **只用 CSV、瀏覽器本機計算、免登入、原始資料不上傳。** 受調查的利潤工具幾乎都要 OAuth 或 API 授權並存在雲端。最接近的例外是 atmarketing 免費版（資料留在瀏覽器，但 AI 功能要登入、Pro 版改雲端）和 Eightx CM 計算器（手動輸入），它們都不讀取期間性的實績資料。
2. **每個金額都能追到中文階梯公式、CSV 檔名與原始行號。** 本次查到的產品最多追到訂單編號或撥款分錄（BigSeller、A2X、Ragic 範本）；倉儲型產品（Polar、Daasity）要自己下 SQL。
3. **九項精確金額橋接，把兩期扣廣告後貢獻的差異拆到分、沒有殘差。** 沒有查到任何產品提供「通路 × 逐項費用」的兩期金額拆解；CYBERBIZ 有三線期間比較、船長BI 有環比同比，但都沒有拆解。
4. **同一套口徑並排蝦皮、momo、PChome、官網等台灣通路**，內建台灣來源預設、中文欄名對照與含稅 5% 換算，換算的原值與換算值寫進抽屜、匯出檔與備份。國際工具不支援這些平台，在地 ERP 也沒有完整涵蓋。
5. **以自己匯入的實績為基準的假設試算**（銷量、折扣、單位物流費、廣告預算、一次性投入 → 單一通路扣廣告後貢獻），並算出「要賣到多少才划算」的門檻。競品的 what-if 不是手動單次計算器（atmarketing、Eightx、英特艾），就是雲端 AI 預估（Conjura Owly、MetricMosaic）。
6. **從健檢、待辦、會議紀錄到匯出的週會流程**：會議結束凍結成紀錄、自動與上次會議比較、可引用當期試算版本。國際工具的「行動」是 AI 建議或自動執行（Conjura、StoreHero、Triple Whale Moby），沒有查到團隊決策紀錄。
7. **財務口徑紀律**：確定性規則不用 AI 信心分數；缺值以 null 加原因碼呈現、不當作 0；不偷偷分攤廣告；金額由 decimal 純函式計算並有 golden 測試；AI 不計算任何金額。競品沒有公開類似承諾。
8. **公開站完全免費，沒有依訂單量或 GMV 分級計價。**

## 7. ProfitLens 的弱點（競品明顯較強之處）

1. **資料取得最費工。** 要從各平台手動匯出再整理成三份日粒度 CSV；訂單明細要先在本機跑 Python 腳本，而且腳本輸出的費用與廣告檔只是填 0 的佔位。BigSeller、BRP、HappySell、EasyStore 都是 API 自動同步。
2. **九個來源預設只有蝦皮訂單用真實匯出檔驗證過。** 蝦皮撥款、momo 對帳、91APP、Shopline、Cyberbiz、PChome、Meta、Google 都未驗證，等於「台灣通路支援」這個最大賣點還沒有實證。
3. **沒有平台撥款或扣款的逐筆對帳。** BRP、SiteGiant（抓超收運費）、Ragic 範本、蝦皮對帳王都能核對平台實扣與入帳；ProfitLens 的費用只能靠使用者自己填。
4. **沒有訂單、顧客層級指標**（訂單數、客單價、CAC、LTV、cohort）。Lifetimely、Peel、MarginStack、BeProfit 把這些當主力；ProfitLens 延到 Phase 2（D6）。
5. **沒有廣告歸因、增量或 MMM。** Triple Whale、Northbeam、Measured、Rockerbox 在這塊明顯更強；ProfitLens 的 MER 沒有媒體歸因。
6. **SKU 層級不扣平台費與廣告。** BigSeller、BRP、StoreHero、MarginStack 都提供 SKU 或商品層級的扣費利潤；ProfitLens 商品頁只看商品毛利。
7. **沒有警示、晨報、推播、行動 App、多人帳號或跨裝置同步。** TrueProfit 有行動 App；MarginStack、StoreHero、Polar、Peel 會排程寄 Email 或推到 Slack；Polar 不限使用者數。ProfitLens 是一人操作、會議共看。
8. **沒有同業基準與預測。** CYBERBIZ 企業版有四個產業的同業基準，Eightx 附 CM3 基準值；StoreHero 有 12 個月預測與季節調整目標。ProfitLens 依規則不硬編門檻、不做預測，目標達成率只在期間完全相同時顯示。
9. **公開版沒有 AI 助理**，而 AI 代理已是國際競品的主流賣點（Triple Whale Moby、Lifetimely Profit Agent、Polar AI Agents、Conjura Owly）。
10. **市場背書與示範資料不足。** 還沒有真實使用者試用與評價；示範資料仍是合成的 DTC／MARKETPLACE。atmarketing 已有大量工具與付費方案；每檔 5 MB／50,000 列的限制對較大賣家可能不夠。

## 8. 台灣市場現況

1. **蝦皮賣家中心商業分析**看的是已付款銷售額（含買家付的運費），不扣成交手續費、抽成，也沒有成本或毛利；手續費明細在撥款或對帳資料裡，與商業分析分開。蝦皮廣告報表只到花費、GMV、ROAS。「2025 Q3 末起 ROAS 改用已支付／已確認 GMV」出自新加坡站，台灣站是否同步待確認。
2. **momo 商店後台**的 I 系列分析報表（流量、優惠券、會員等）每日 11:30 更新、可匯出 Excel，但部分報表（例如會員輪廓）只能查近 2 個月，也沒有獨立的利潤報表。momo 商家用的 Google Retail Connect 自助廣告平台只到 ROAS 與轉換價值。H101／H102 對帳扣款明細沒有從官方公告查證到。
3. **PChome 廠商後台 App（P++家家）**有訂單、消費者提問、退貨處理與財務對帳查詢，公開資料沒看到獲利計算。
4. **開店平台的毛利只算到「營收 − 成本價」**：SHOPLINE 毛利報表與 CYBERBIZ 營收分析都要先設定成本價，也都不扣金流、物流與廣告。CYBERBIZ 有本期、去年同期、上一期的三線比較，企業版另有同業基準（只限食品飲料、健康美妝、服飾配件、居家園藝）。91APP 官方頁沒提毛利或廣告分析；EasyStore 能串蝦皮，但報表沒有 COGS 和毛利。
5. **台灣在地第三方工具以作業型 ERP 為主，利潤只到毛利或不明**：蝦樂賣 HappySell（NT$3,980/年，有毛利分析）、蝦皮雲管家（競品比較文稱 NT$680/月起）、PK-ERP（支援蝦皮、momo、PChome、SHOPLINE、91APP 等，價格未公開）、FLAPS（API 串 91APP、SHOPLINE、CYBERBIZ、蝦皮、momo，PChome 與 Yahoo 用 Excel 匯入，沒查到利潤報表）、鼎新 A1（雲端電商訂單 NT$700/月起，未稅）。
6. **東南亞 ERP 的利潤報表最完整，但台灣覆蓋有缺口**：BigSeller 官方服務國家沒列台灣、App 也沒看到繁中；SiteGiant 有台灣站，對帳頁只涵蓋蝦皮購物與蝦皮商城（能抓超收運費、交易費、佣金），momo 和 PChome 只出現在頁尾的整合夥伴清單。
7. **賣家自己對帳與試算的工具**：Ragic 免費蝦皮對帳範本、蝦皮對帳王（都是上傳 Excel 到雲端核對手續費與入帳）；蝦皮手續費計算機（0123456789.tw，涵蓋 2026 費率、免運 6% 或每單 60 元、金流 2.5%，不含廣告）；英特艾毛利率計算器（可同時扣抽成、平台費、廣告費）。全都是單筆或手動計算。
8. **賣家的實際做法還是 Excel**：蝦皮台灣廣告學院刊出的賣家分享，就是用每個商品的扣費毛利反推「不虧本的最低 ROAS」。BI 方面，台灣有 NT$600 的 Looker Studio 電商模板，但只涵蓋 GA4、Google Ads、Search Console，沒有市集也沒有成本；Supermetrics 的 Shopee 連接器文件提到 TW 區域、費用欄位齊全，但要自己在 BI 裡建模，也沒有 momo 和 PChome 的連接器。
9. **在地廣告報表 SaaS Admetry** 能串 LINE LAP、Meta、Google、TikTok，CEO 月報可匯出 PDF；但 ROAS 與營收計算還在「開發中」，也不算毛利。AnyMind AnyX 的新聞稿沒有提到台灣。
10. **最直接的在地同類是電商營運工具箱（atmarketing）**，官網已明確標示新台幣定價；它把 momo、PChome、Yahoo、樂天、WACA 標為 CSV，蝦皮、SHOPLINE、CYBERBIZ、91APP、EasyStore 標為 API。
11. **台灣價格帶明顯比國際低**：HappySell NT$3,980/年、EasyStore NT$1,469–5,669/月（年繳）、Shopto NT$24,800/年起、atmarketing NT$599–2,099/月、鼎新 A1 NT$700/月起（SHOPLINE 年費 NT$35,000 是 2020 年資料，可能過時）。國際利潤 App 多在 US$35–300/月。

## 9. 策略意涵

1. **定位要講清楚**：ProfitLens 是「台灣多通路的週會獲利工作台」，不是即時利潤追蹤器，也不是 ERP 或歸因工具。對外溝通可借 Daasity 的 CM1／CM2 或 Net Net 的利潤瀑布說明四層口徑，再強調「跨蝦皮、momo、PChome、官網用同一口徑」和「每個數字都能查到來源行號」。
2. **主要對手是「自製 Excel ＋ 三個後台」，其次是 atmarketing。** 要贏 Excel，就得把匯入摩擦降到比手動整理還低；要和 atmarketing 區隔，重點放在口徑嚴謹（橋接、追溯、golden 測試、缺值不當 0）和週會決策流程（健檢、待辦、會議紀錄），不要比工具數量或 AI 文案。
3. **不要正面競爭的對象**：Triple Whale、Polar、Northbeam 等歸因與 AI 代理平台（需 API，價格 US$219–4,000 以上/月）；BigSeller、HappySell 等作業型 ERP（強在自動同步與訂單作業）；A2X、Finaloop 等會計結帳工具。對使用 Shopify 官網的台灣品牌，可說明 ProfitLens 補的是「官網以外的市集」與跨通路的週會比較。
4. **最優先的投資是讓「台灣通路支援」名副其實**：用真實匯出檔驗證蝦皮撥款、momo 對帳、91APP、Shopline、Cyberbiz、PChome、Meta、Google 的預設，並把台灣化示範資料（官網、蝦皮、momo）提前。這兩項是現在宣稱與實證之間最大的落差。
5. **盯住競品動向**：atmarketing 已有多平台 CSV 與 API、繁中介面、付費會員，一旦在多通路儀表板加入費用、廣告與貢獻計算，就會和 ProfitLens 正面重疊；BigSeller 若明確支援蝦皮台灣站，會吃下只做蝦皮的賣家；MarginStack、Conjura、StoreHero 正把「指標轉行動」做成標配，週會流程的差異化窗口有限。
6. **隱私和本機運算是真正的差異，但要被正確理解**：它換來的代價是手動匯入，所以目標客群應該是重視資料不外流、不想把店鋪帳號授權給第三方的品牌，以及代營運或顧問。通用 FP&A 市場也在整併（Causal 已被 Lucanet 收購；Runway Financial 網域已移轉），本機執行加自有備份檔，在供應商停運時能當作可信度論點。
7. **定價脈絡**：台灣使用者的付費門檻明顯偏低（在地工具每月約 NT$300–2,100，或年繳幾千元）。依目前邊界（不加登入、不收訂閱），免費本身就是相對國際 US$35–300/月工具的優勢。若未來要收費，應以 atmarketing Pro 的 NT$599–799/月和 HappySell 的 NT$3,980/年為上限參考，而不是國際價格；這需要另外拍板。
8. **可以用「誠實的邊界」當賣點**：MER 不宣稱歸因、橋接不宣稱因果、扣廣告後貢獻不等於淨利。這和競品常見的「真實利潤」「AI 建議」形成對比，對要查核數字的主管與財務較有說服力。

## 10. 可借鏡且符合現有邊界的功能

邊界：不串 API、不上雲端、不改財務核心（`contribution-v1`）、不加依賴、不由 AI 計算金額。

| 功能 | 見於 | 與邊界的相容性 |
|---|---|---|
| 損益兩平廣告投報門檻：在 MER 旁顯示「扣廣告後貢獻 = 0 時的最低 MER」（＝淨營收 ÷ 通路貢獻），回答「廣告最多能花多少」 | Northbeam Profitability Benchmarks；蝦皮台灣廣告學院毛利計算表（反推最低 ROAS）；Sellerboard 損益兩平 ACOS | 符合：只用已算好的淨營收與通路貢獻，放在 `assist-kpi` 版本下，不改 `contribution-v1`；需獨立手算 golden；通路貢獻 ≤ 0 時以 null 加原因碼呈現 |
| 可複製的「週會摘要文字」：把三件事、前幾名健檢與待辦整成純文字或 Markdown，讓使用者自己貼到 LINE、Slack、Email | MarginStack 晨報 Email；StoreHero 晨會前快照；Peel 推送 Slack／Email；atmarketing AI 營運週報（匯出 Markdown/TXT） | 符合：瀏覽器本機產生並複製到剪貼簿，不寄送、不串接；字串從 `labels.zh-TW.ts` 取用 |
| 待辦加上「暫停／調整／加碼」三種廣告決策標籤 | StoreHero Spend Advisor；atmarketing Meta 診斷（Kill／Scale／Watch）；Conjura Actions Dashboard | 符合：只是待辦與決議的分類標籤，由使用者自選，不自動判斷 |
| 四層貢獻的利潤瀑布圖（每一階標出被扣掉的費用） | Net Net 三層瀑布；Daasity CM1／CM2 | 符合：純呈現層，用既有指標與標籤，每一段仍可開「公式與來源」 |
| 趨勢圖加「去年同期」第三條線 | CYBERBIZ 三線期間比較；船長BI 環比與同比 | 符合：已有「去年同期」快捷，只疊加既有期間彙總；缺漏不畫成 0 |
| 撥款／對帳檔原生格式預設：直接讀蝦皮「我的進帳」、momo 對帳扣款明細，把手續費、金流費、運費差額對應到 `channel_costs` 欄位 | Ragic 蝦皮對帳範本；SiteGiant 台灣站蝦皮對帳；BRP 逐單扣款核對；BigSeller 以平台帳單為準 | 符合但要分批做：以本機來源預設或 `aggregate_orders.py` 規則實作，不串 API、不上傳；結果仍走三檔契約並保留檔名與行號；必須用真實匯出檔驗證後才能宣稱支援 |
| 給老闆／代營運的匯出範本變體（精簡一頁版或客戶報告版） | Dashboardly 代營運獲利報告；Admetry CEO 月報 | 符合：沿用既有 PDF、Excel、PPT 管線與 `metric_version` 標記，只改版面；不寄送、不雲端分享 |
| 試算頁的平台費率參考提示（例如蝦皮免運 6% 或每單 60 元、金流 2.5%），只幫使用者填試算輸入 | 蝦皮手續費計算機；英特艾毛利率計算器 | 有條件符合：只能當說明或可選預填並標註來源與日期，不能補實績費用（違反「不自動補成本、缺值不當 0」）；是否要做需拍板 |

## 11. 查證狀態：未證實、剔除、未調研

- **剔除**：LeapRows（DuckDB-WASM 通用 CSV 工具，無電商語意、查不到官網，只能當「瀏覽器本機運算有付費市場」的技術參照）；Evidence（evidence.dev，通用 BI-as-code；研究者寫的每人 US$15／25 已過時，官方 Cloud 現列 Team US$2,500/月）。
- **已刪除的陳述**：atmarketing「與蝦皮大學合辦工作坊」查無佐證；「損益表產生器」「促銷模擬」兩項工具是否存在，查核結果分歧，未納入結論。
- **未證實**：馬幫ERP 的 Shopee 淨利公式（只見搜尋摘要）；芒果店長「營收 − 成本 − 運費 − 佣金」是研究者推論；蝦皮雲管家（官網 403，資訊都來自競品比較文）；Ginee 的利潤功能、方案與價格；Rithum 的成本項目與「依利潤調配廣告預算」；BigSeller 蝦皮台灣站支援與免費額度（1,500 或 3,000 單）；蝦皮 ROAS 改用已支付 GMV（出自新加坡站）；momo H101／H102／E106 報表代號；SHOPLINE 年費 NT$35,000（2020 年資料）與「70 多份報表」（403）；鼎新 A1「蝦皮收款沖帳」與 NT$2,800 上限；Triple Whale 價格（官網 403，第三方互相矛盾，本文件採 Shopify App Store 標示）；Lifetimely S／L 價格各來源不一；BeProfit 以 CSV／Google Sheets 匯入成本；Conjura「SKU 層級廣告歸因後貢獻」；Daasity「80 多個整合」；Glew 整合數與警示；StoreHero 是否支援 Amazon；HappySell 支援露天；Shopify Profit reports 的方案限制（2018 年資料）；Productivilab 範本價格；Dashboardly「GMV 與實際利潤差 15–40%」不成立。
- **已更正**：Helium 10「損益報表限 Diamond」無證據（各方案都含 Profits）；ManageByStats 現為 Free 與 Pro US$59.97 起；Shopkeeper 為 15 天試用，提醒走 Email／Slack；ProfitMetrics 是 14 天試用而非永久免費；Northbeam「非 Shopify 客戶須簽年約」不成立；Fathom 價格應為澳幣 A$65–860；Runway Financial 已遷往 cfo.ai；Causal 是否支援 Shopify 整合未確認；Peel 是否算扣廣告後貢獻不明；Finmark 被 BILL 收購、Rows.com 2026-05-31 停止服務兩點未查核，不採用。
- **未調研**（各角度查證者指出的遺漏）：Klar、Profit Calc、Graas、Putler、Pigment、Shopify Sidekick／Analytics、Yahoo 奇摩購物中心與超級商城後台、Coupang 酷澎 Wing、露天賣家中心、Meepshop／WACA 報表、領星ERP、飛鼠電商 ERP、積加ERP、Zetpy、Anchanto、Split Dragon、SellerApp、SellerSprite。

## 12. 需要拍板的事項

1. 是否把「以真實匯出檔驗證其餘 8 個來源預設」與「台灣化示範資料」提前到下一批（§9-4）。
2. §10 的八項借鏡功能是否排入 Phase 2，特別是撥款／對帳檔原生格式預設（投入最大、也最能縮短與 ERP 的差距）與費率參考提示（有口徑風險）。
3. 未來是否收費、以何種價格帶（§9-7）；目前邊界下維持免費。
4. 是否補做 §11 未調研清單中的在地項目（Yahoo、酷澎、露天、Meepshop／WACA、飛鼠）。

## 附錄 A：各角度查核的產品清單

查證欄：keep＝陳述全部有來源；corrected＝部分陳述已依查證更正；drop＝剔除。可信度為研究代理的自評（high＝抓到官方頁；medium＝搜尋摘要或評測；low＝單一間接來源）。

### 全球 DTC／Shopify 利潤分析 SaaS

| 產品 | 類別 | 資料輸入 | 扣廣告後利潤 | 台灣適用 | 價格 | 可信度 | 查證 | 連結 |
|---|---|---|---|---|---|---|---|---|
| TrueProfit | Shopify 淨利追蹤 App（中小賣家、dropshipping 為主） | Shopify 訂單 API 自動同步；廣告平台 API（Facebook、Google、TikTok、Microsoft、Pinterest、Snapchat | 有。即時淨利儀表板＝營收扣 COGS、運費、交易手續費、廣告費、自訂固定／變動費用；Advanced 方案起有 P&L 報表與商品別淨利排名。 | 低。只有在台灣用 Shopify 開官網的品牌可用；不支援蝦皮、momo、PChome、91APP、Shopline、Cyberbiz；英文 | 2026-10-05 官網：Basic US$35/月（300 單）、Advanced US$60/月（600 單）、Ultimate US | high | corrected | <https://trueprofit.io/> |
| BeProfit - Profit Analytics | 多店／多通路利潤分析 App | Shopify、Amazon、WooCommerce 店舖整合；廣告與行銷：Facebook Ads、Google Ads、Google Analytics、K | 有。即時 P&L 儀表板、訂單與商品層級獲利、官網宣稱可看 Contribution Profit 與 Profit on Ad Spend。 | 低。只能涵蓋台灣品牌的 Shopify／WooCommerce 官網，無蝦皮、momo、PChome、91APP、Shopline、Cybe | 2026-10-05 Shopify App Store：Basic US$49/月（450 單）、Pro US$99/月（900 單）、U | high | keep | <https://beprofit.ai/> |
| Lifetimely LTV & Profit by AMP | P&L＋LTV／CAC 分析 App | Shopify 訂單 API；Amazon（加購）；Meta Ads、Google Ads、TikTok、Klaviyo、Recharge、Skio 等整合。未 | 有。每日 P&L、貢獻毛利（contribution margin）、CAC、LTV、CAC 回收期。 | 低。僅適用 Shopify 官網；無蝦皮、momo、PChome、91APP、Shopline、Cyberbiz。 | 2026-10-05 官方 pricing.md：Free US$0（50 單／月）、S US$49/月（500 單）、M US$149/月 | high | keep | <https://useamp.com/pricing.md> |
| Triple Whale | DTC 行銷歸因＋營運分析平台（含利潤） | Shopify／BigCommerce 訂單 API、自家像素；廣告（Facebook、Google、TikTok）、Klaviyo、Recharge、Gorg | 部分。官方定義淨利＝銷售－混合廣告費－費用－退款；第三方評論（TrueProfit、Bloom）指出貢獻毛利與完整 P&L 不足，常需回到試算表。 | 低。僅 Shopify 官網；無蝦皮、momo、PChome、91APP、Shopline、Cyberbiz。 | 2026-10-05 Shopify App Store：Free（10 位使用者、12 個月回溯）、Foundation US$219/月 | medium | corrected | <https://www.triplewhale.com/> |
| Polar Analytics | DTC 商業智慧（BI）＋資料倉儲平台 | 45+ 資料來源一鍵整合：Shopify、Amazon Seller Central、Meta、Google、TikTok、Klaviyo、Recharge 等 | 有。預先計算的 Contribution Margin、COGS、P&L、淨利、混合 CAC；Amazon 費用與退款可與 Shopify 合併在同一張 P&L | 低。理論上可靠自訂資料源擴充，但未見蝦皮、momo、PChome、91APP、Shopline、Cyberbiz 的現成整合。 | 2026-10-05：Shopify App Store 標示 Core 方案 US$750/月（依線上 GMV 計價，年繳有折扣）；官網定 | high | keep | <https://www.polaranalytics.com/> |
| StoreHero Profit Dashboard | 貢獻毛利＋行銷績效＋目標預測儀表板 | Shopify API；Meta、Google、TikTok、Klaviyo、ShipBob、ShipStation 整合。未查到 CSV 匯入。 | 有。主打 contribution margin，以及店舖／商品／國家／訂單層級即時獲利與行銷花費。 | 低。僅 Shopify 官網。 | 2026-10-05 Shopify App Store：Free（廣告、網站、SEO 報表）；營收 US$1M 以下 US$179/月或  | high | keep | <https://apps.shopify.com/storehero-profit-analytics> |
| Conjura | 貢獻毛利導向的電商分析平台 | Shopify、BigCommerce；Growth 起可接 Amazon、eBay、Walmart、TikTok Shop；GA4、Google Ads、Me | 有。貢獻毛利追蹤、ROAS，並宣稱可做 SKU 層級廣告費歸因後的貢獻毛利。 | 低。概念相近（多通路貢獻毛利），但無蝦皮、momo、PChome 等串接。 | 2026-10-05 官網：Essentials US$19.99/月（年繳 US$15.99/月）、Growth US$59.99/月（年 | high | keep | <https://www.conjura.com/> |
| Daasity | 全通路（DTC＋marketplace＋零售批發）資料平台 | 80+ 整合：Shopify、Amazon、Walmart Marketplace、零售與批發通路、廣告、Email／SMS、訂閱、物流、退貨等。成本輸入方式文 | 有。CM1＝淨銷售－商品成本、運費、履約、金流、平台費；CM2＝CM1－行銷費－通路促銷費（trade spend）。 | 低。口徑設計值得參考，但無台灣平台整合。 | 官網未公開；第三方資料稱約 US$199/月起至 US$2,500+/月，另有 US$1,899/月的說法（可信度中低）。 | medium | corrected | <https://www.daasity.com/> |
| Glew | 電商 BI／資料倉儲 | Pro 方案 40 個整合、Plus 方案 150+ 整合（含 managed ETL、資料倉儲、Looker 授權）；有 Cost Manager 管理 CO | 有。可依通路、客群看利潤、營收、LTV（第三方評論描述）。 | 低。 | 2026-10-05 官網：Glew Pro 需年繳預付、Glew Plus 客製報價，官網皆未列金額（未公開）。第三方（TrustRadi | medium | keep | <https://www.glew.io/> |
| Lebesgue | AI 行銷長（AI CMO）＋獲利追蹤 | Shopify、WooCommerce；Meta、Google Ads、TikTok、Pinterest、Microsoft、Klaviyo；自家 Le Pix | 部分。有店舖績效與獲利追蹤、自訂每單固定成本（運費、包材），主力是廣告分析。 | 低。 | 2026-10-05 官網：Free US$0、Ultimate US$79/月、Ultimate AI US$149/月、Le Pixel | high | keep | <https://lebesgue.io/> |
| Peel | 留存與 cohort 分析 | Shopify、Amazon、Facebook Ads、Google Ads／Analytics、Klaviyo、Recharge。 | 否。主打 LTV、AOV、流失率、RFM；第三方評測指出它不是 P&L 工具。 | 低。 | 2026-10-05 Shopify App Store：Core US$199/月、Essentials US$499/月、Acceler | high | keep | <https://apps.shopify.com/peel-insights> |
| Northbeam（Profit Benchmarks） | 行銷歸因＋獲利門檻設定 | Northbeam 歸因資料（至少 30 天，建議 90 天以上）；使用者提供商品或廣告層級 COGS、行銷預算。 | 否（間接）。產出達到獲利所需的 ROAS、MER、CAC 目標燈號；第三方（Admetrics）指出 COGS 不進平台，因此沒有貢獻毛利與 P&L。 | 低。 | 未查到（本次未取得官方定價頁）。 | medium | keep | <https://www.northbeam.io/> |
| Shopify 內建 Profit reports | 平台內建報表 | Shopify 商品後台填寫的 Cost per item；訂單資料原生存在 Shopify。 | 否。毛利＝淨銷售－商品成本；不含廣告費、金流手續費、一般營業費用。 | 中。台灣 Shopify 官網商家可直接使用，但無法涵蓋蝦皮、momo、PChome 等其他通路。 | 含在 Shopify 方案內；2018 年更新紀錄寫明「Shopify 方案或更高」才有，Basic 方案無「Profit by produ | high | keep | <https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/report-types/default-reports/profit-reports> |
| Net Net — Profit Analytics | Shopify 三層利潤瀑布 App（新上架） | Shopify Admin；Meta／Facebook／Instagram Ads、Google Ads；Shippo、ShipStation 實際運費同步。 | 有。每筆訂單三層瀑布：毛利→貢獻毛利→淨利；有 ROAS 與 POAS（廣告獲利率）。 | 低。 | 2026-10-05 Shopify App Store：Starter US$15/月（月營收 US$5K 以下）、Growth US$4 | high | keep | <https://apps.shopify.com/netnet> |
| MarginStack | 貢獻毛利＋警示 App（新上架） | Shopify（必要）；Meta、Google Ads（選用）；COGS 可用 CSV 上傳。 | 有。依訂單、SKU、通路、日計算貢獻毛利（已扣折扣、運費、COGS），並算通路別 CAC、LTV、回收期。 | 低。 | 2026-10-05 Shopify App Store：US$49/月，14 天試用。 | high | keep | <https://apps.shopify.com/marginstack> |
| Bloom Analytics | 平價 Shopify 利潤 App | Shopify（含運費自動同步）、Meta、Google Ads、Amazon Ads、Klaviyo、Mailchimp、Omnisend。 | 有。利潤表、訂單層級獲利、商品利潤與 ROAS。 | 低。 | 2026-10-05 官網：Free US$0、Sprout US$20/月、Grow US$40/月、Flourish US$80/月。 | high | corrected | <https://www.bloomanalytics.io/> |
| BRP（Southeast Asia marketplace profit analytics） | 東南亞 marketplace 利潤分析（本角度外的對照組） | 經各平台官方整合讀取訂單與撥款（settlement）資料：Shopee、Lazada、TikTok Shop、Zalora、PGMall；Pro 起加 Sho | 有。每筆訂單扣佣金、廣告、運費、平台費、退貨後的利潤；SKU 別與活動別毛利。 | 中低。Shopee 支援範圍未說明是否含台灣站；可作為「亞洲 marketplace 利潤 SaaS 已存在」的證據。 | 2026-10-05 官網：Lite MYR 199/月（3,000 單）、Pro MYR 399/月（10,000 單）、Enterpri | medium | keep | <https://brp.com.my/> |

### 台灣平台內建報表與在地工具

| 產品 | 類別 | 資料輸入 | 扣廣告後利潤 | 台灣適用 | 價格 | 可信度 | 查證 | 連結 |
|---|---|---|---|---|---|---|---|---|
| 蝦皮賣家中心 商業分析（數據中心）＋我的行銷活動 > 蝦皮廣告報表 | 平台內建報表（市集） | 平台自動產生，不需匯入。指標包括銷售額（已付款訂單）、訂單數、訪客、商品點擊、轉換率、加購件數、客單價，以及依通路（商品頁／直播／影音／聯盟）拆分的銷售。廣告報 | 否。第三方教學明確指出，銷售額含買家自付運費、未扣手續費與抽成，也不提供成本、毛利或扣廣告後淨利，必須自己做表。BigSeller 的說明文章也說商業分析沒有獲 | 極高，是台灣第一大市集的官方後台，也是 ProfitLens 銷售與廣告 CSV 最常見的資料來源之一 | 賣家免費使用（成交手續費等平台費用另計） | medium | corrected | <https://seller.shopee.tw/> |
| momo 商店後台 商店分析報表（I 系列）與對帳／扣款明細（H 系列） | 平台內建報表（市集） | 平台自動產生。流量來源（I202）、EDM 流量、UTM 站外流量、關鍵詞導流、優惠券分析（I301）、運費折抵、跨店滿額折、會員輪廓、問問分析；另有銷售排行（ | 否。沒有獨立的利潤報表；費用扣除資訊分散在 H101 對帳明細表、H102 扣款明細表。 | 極高，台灣第二大電商 | 平台內建；momo 費率依品類與合作條件而定，未公開 | high | corrected | <https://rules.momo.com.tw/bulletin/00016/> |
| Google Retail Connect - momo 商家 Lite 自助廣告平台（momo Ads 相關） | 平台內建廣告報表 | 平台自動產生：曝光、點擊、CTR、廣告花費、CPC、轉換數、轉換價值、ROAS；可下載報表 | 否，只有 ROAS 與轉換價值，不算毛利或扣廣告後貢獻 | 高，momo 商家的廣告 CSV 可能來自這裡 | 未公開（依廣告花費） | medium | corrected | <https://rules.momo.com.tw/bulletin/00016/> |
| PChome 廠商後台（P++家家 App）／商店街訂單下載 | 平台內建後台（市集） | 平台自動產生。可查訂單、回覆消費者提問、看公告；商店街可依期間匯出訂單（超商取貨、宅配出貨單、訂單總表三種格式） | 否，未查到利潤或毛利報表 | 高，但 PChome 的市占和流量都在下滑 | 未公開 | low | corrected | <https://apps.apple.com/tw/app/p-%E5%AE%B6%E5%AE%B6-pchome%E5%BB%A0%E5%95%86%E5%BE%8C%E5%8F%B0%E7%B3%BB%E7%B5%B1/id1451037191> |
| SHOPLINE 報表／Shoplytics Pro（含毛利報表） | 開店平台內建分析 | 平台自動產生。Shoplytics Pro 有 55 種視覺化報表（銷售與促銷、購物車、全通路營收與訂單、商品成長探測、關鍵字、轉換率），並整合 GA4。說明中 | 部分。毛利報表提供商品／規格／門市的 COGS（成本價 × 件數）、毛利、毛利率，但要先在商品上設定成本價。未查到扣廣告費後的貢獻，也未查到依通路扣平台費。 | 高，是台灣品牌官網主流平台之一 | 台灣網路開店方案年費 NT$35,000，加購模組每個約 NT$10,000（INSIDE 林克威專欄，日期較早）；Shoplytics P | medium | corrected | <https://help.shopline.com/hc/en-001/articles/25421686039705-Profit-Margin-Report> |
| CYBERBIZ 圖表分析（圖表總覽／營收分析／商品圖表） | 開店平台內建分析 | 平台自動產生。圖表總覽：流量、轉換率、訂單數、客單價、營業額、會員數；營收分析：認列營收（非取消、非退貨）、近 30 日營收與成長率、毛利、毛利率；商品圖表：瀏 | 部分。毛利 = 成立訂單營收 − 商品成本，要先設定成本價。官方文件沒提到扣金流、物流或廣告費。 | 高，台灣在地開店平台 | 年費制、依功能分級，主流方案不抽成；具體金額在來源頁中未查到 | high | keep | <https://help.cyberbiz.io/ec/business-intelligence/revenue-analysis/> |
| 91APP OMO 管理報表／Commerce Cloud／Marketing Cloud | 開店平台內建分析（中大型品牌） | 平台自動產生，並以 API 串接 POS、會員、訂單、庫存。提供 OMO 管理報表、會員分眾行銷成效、多渠道導流、類 CDP 的全景數據中心與 BI | 未查到。官方頁著重營收成長與會員，沒提到毛利、廣告費或利潤分析 | 高，台灣上櫃的零售科技公司 | 未公開，依方案與導入規模報價 | medium | keep | <https://91app.com/solutions/> |
| EasyStore 報表與多通路（蝦皮串接） | 開店平台內建分析＋市集串接 | 平台自動產生，並串接蝦皮、Lazada、Zalora、PGMall。報表包括銷售表現、商品表現，以及依通路／地點／顧客／付款方式／幣別／聯盟／員工拆分的銷售 | 否，官方說明沒有 COGS、毛利或利潤報表 | 中高 | 標準版 NT$1,469／月、商務版 NT$2,939／月、成長版 NT$5,669／月（皆年繳，2026-10 見於官網） | high | keep | <https://www.easystore.co/zh-tw/pricing> |
| BigSeller 利潤報告（訂單／店鋪／商品利潤） | 跨平台 ERP（東南亞為主） | 透過平台官方 API 授權店鋪，自動抓訂單與帳單。另有授權蝦皮廣告應用後取得的廣告數據，以及可自訂的其他費用（包材、租金、廣告等） | 是（部分）。利潤 = 訂單收入 − 佣金、交易費、服務費、賣家付運費、行銷費、平台其他費用、退款、商品成本，再扣自訂費用；蝦皮廣告費要另外授權。可依訂單、店鋪、 | 中，主要服務東南亞；有繁中 App，但台灣站支援未證實 | 永久免費版（月訂單 1,500 或 3,000 筆內，各來源說法不同）；付費約 USD 28／月起（第三方搜尋摘要） | medium | keep | <https://help.bigseller.com/zh_CN/detailPage/10/1/8429/content> |
| SiteGiant 平台對帳／Marketplace Gross Profit Report | 跨平台 ERP／對帳 | API 串接。台灣頁面提到可對蝦皮已撥款與未撥款訂單、超收運費、交易費與佣金，頁尾列有 momo、PChome、Shopline 整合 | 部分。馬來西亞的 Marketplace Gross Profit Report 可看日／週／月／年的毛利（ERP Starter 以上）；Order Esti | 中高，有台灣站 | 台灣價格未查到（官網只有「查看方案」連結） | medium | keep | <https://sitegiant.tw/payment-reconciliation/> |
| 蝦樂賣 HappySell | 台灣多平台商品與庫存管理 | 蝦皮官方 API 串接，並支援 momo、Coupang、露天 | 否／不明。有「毛利分析」，但官網沒提到廣告費或平台手續費自動計算 | 高 | 年繳 NT$3,980，14 天免費試用（2026-10 見於官網） | high | keep | <https://happysell.tw/> |
| 鼎新 A1 商務應用雲（雲端進銷存／雲端會計／雲端電商訂單） | 台灣中小企業 ERP | 串接蝦皮、SHOPLINE 等平台的訂單（Shopline 要另外申請 token），並有蝦皮收款沖帳 | 未查到自動算到單筆訂單扣手續費、運費、廣告後的獲利；文章只給了淨利公式 | 高 | 雲端進銷存 NT$800／月（2 人）、雲端會計 NT$700／月、雲端電商訂單 NT$700–2,800／月（第三方比較文摘要） | medium | corrected | <https://a1.digiwin.com/> |
| FLAPS ERP（電商 ERP 多平台整合） | 台灣電商 ERP | API 串接 91APP、SHOPLINE、Shopify、蝦皮、momo；Yahoo、PChome、露天以 Excel 匯入 | 未查到利潤或毛利報表 | 高 | 未公開 | high | keep | <https://www.flaps.com.tw/ecommerce-erp-multi-platform-integration/> |
| Ragic 免費蝦皮對帳範本 | 雲端資料庫範本（上傳 Excel） | 上傳蝦皮訂單報表與進帳報表兩份 Excel，系統以訂單編號比對 | 否，追蹤成交手續費、金流服務費、入帳正確性，不含廣告費 | 高 | 範本免費；Ragic 付費方案見其定價頁（未查） | high | keep | <https://www.ragic.com/intl/zh-TW/blog/366/free-shopee-reconciling-tool> |
| 蝦皮對帳王（蝦皮自動對帳系統） | 上傳 Excel 的對帳工具 | 上傳蝦皮訂單 Excel 與已撥款 Excel 到雲端，一鍵對帳 | 否，只核對手續費與撥款 | 高 | 有免費測試，正式價格未查到 | medium | keep | <http://www.citerp.com.tw/> |
| 電商營運工具箱（利潤計算器與促銷模擬、ROAS 計算器、電商損益表產生器） | 台灣 AI 電商工具集（試算型） | 手動輸入成本、售價、平台抽成、物流費、廣告費；廣告健檢類工具要上傳 Meta、Google 報表 | 部分。ROAS 計算器會算淨利潤，損益表產生器依手動輸入的營收、成本、費用產生損益表；但都是手動輸入的彙總試算，不是從日資料計算 | 高，客群和 ProfitLens 重疊（中小賣家） | 基本工具免費；Pro NT$599–799／月（2026-10 見於官網，標示創始價） | high | corrected | <https://ecom.atmarketing.tw/> |
| 蝦皮手續費計算機（計算0123456789）等免費試算器 | 單筆試算器 | 手動輸入售價、運費、賣家類型、免運方案、是否參加促銷 | 否，算出扣平台費後的入袋金額，不含廣告費和成本 | 高 | 免費 | high | keep | <https://0123456789.tw/calculator/shopee/> |
| Admetry AI 廣告分析平台 | 台灣廣告報表 SaaS（代理商向） | 串接 Meta Ads、Google Ads、LINE LAP、TikTok Ads（宣稱 15 個來源，但未列出蝦皮或 CSV） | 否，只看廣告成效與 blended ROAS，不算毛利 | 中高 | 未公開（有 /pricing 連結，未查） | high | corrected | <https://admetry.app/templates> |
| 電商數據三兄弟 46 項指標 Looker Studio 儀表板模板 | BI 模板販售 | 使用者自己接 GA4（28 項）、Google Ads（9 項）、Search Console（9 項） | 否，只有收益、轉換率、CPC、CPA 等，沒有毛利 | 中 | NT$600（數位商品，不可退費；頁面上有限時折扣碼） | high | keep | <https://tbr.digital/digital-downloads/eclookerstudio> |
| Supermetrics Shopee 連接器（搭配 Looker Studio／Sheets） | 資料連接器（BI 管線） | API 串接蝦皮訂單與收入：39 個指標、163 個維度，包含佣金、交易費、服務費、運費、退款、net escrow、折扣、蝦幣 | 否（只提供原料）。文件裡沒有廣告欄位，利潤要自己在 BI 裡組 | 中 | 未查（官網另計） | high | keep | <https://docs.supermetrics.com/docs/en/shopee-commerce-fields> |
| AnyMind AnyX（含 AnyX 廣告報表） | 跨平台電商管理平台（亞洲） | 串接 Shopee、Lazada、Amazon、Qoo10、Rakuten、Tokopedia、Shopify、TikTok Shop，以及 Google Ad | 否，新聞稿只提 ad spend、ROAS、CPA、廣告帶來的銷售，沒有利潤計算 | 低至中 | 未公開 | medium | keep | <https://anymindgroup.com/news/press-release/anyx-advertising-report-launch> |
| Shopto 開店平台（多平台同步與業績分析） | 台灣開店平台＋多通路 | 多平台商品同步、跨平台庫存與訂單整合 | 不明。宣稱有跨平台廣告預算管理、ROI 比較與業績分析報表，但沒有利潤計算的細節 | 中 | NT$24,800／年起，14 天試用（2026-10 見於官網知識庫頁） | low | keep | <https://shopto.tw/> |

### 行銷效率／歸因與電商財務 P&L

| 產品 | 類別 | 資料輸入 | 扣廣告後利潤 | 台灣適用 | 價格 | 可信度 | 查證 | 連結 |
|---|---|---|---|---|---|---|---|---|
| Lifetimely (by AMP) | Shopify 利潤／P&L 與 LTV 分析 SaaS | OAuth 串接：Shopify（核心）、Amazon（加購 +US$75/月）、Google Ads、Meta、TikTok、Klaviyo、ShipStat | 有。官方方案列「每日 P&L」；評測站（eightx）指出其把營收、COGS、廣告費、運費、手續費、退款放進同一張每日 P&L，並把貢獻毛利與 CAC 回收期當 | 低。僅適用使用 Shopify 的台灣品牌官網，台灣主力平台與在地金流、物流費用無法自動串接 | 2026-10-05 官方價目：Free（≤50 單/月）US$0；M（501–3,000 單）US$149/月；XL（7,001–15,0 | high | keep | <https://useamp.com/pricing> |
| TrueProfit | Shopify 淨利追蹤 App | Shopify（官方文件顯示僅支援 Shopify）＋ Facebook／Google／TikTok 等廣告 OAuth；CJ Dropshipping、外部物 | 有。即時 P&L 儀表板，含 COGS、運費、交易手續費、稅、廣告費、自訂費用後的淨利；Enterprise 方案有行銷歸因把利潤歸到活動。未見依銷售通路拆貢獻 | 低。台灣主流平台（蝦皮、momo、PChome、91APP、Shopline、Cyberbiz）均無串接 | 2026-10-05 官方價目：Basic US$35/月（300 單，超額每單 US$0.30）；Advanced US$60/月（600 | high | corrected | <https://trueprofit.io/pricing> |
| BeProfit - Profit Analytics | 多平台利潤分析 App | OAuth 串接 Shopify／Amazon 與 Facebook、Google、TikTok 等廣告（無限制廣告串接）；成本可用 CSV 上傳、API 或  | 有。利潤與費用儀表板、訂單與商品層級利潤、P&L 報表（Pro 以上）；可依平台、國家、商店比較利潤（評測站描述），接近通路層級扣廣告後利潤 | 低。僅 Shopify／WooCommerce 官網可用，蝦皮、momo 無法串接 | 2026-10-05 Shopify App Store：Basic US$49/月（450 單）；Pro US$99/月（900 單）；U | high | corrected | <https://apps.shopify.com/beprofit-profit-tracker> |
| Triple Whale | DTC 歸因＋利潤儀表板 | OAuth 串接 Shopify 與各廣告平台、第一方像素；官網對機器存取回傳 403，未能確認是否支援 CSV | 部分。第三方評測描述有淨利、即時 blended ROAS、各平台 ROAS；但 admetrics 等比較文指出其 COGS 只到毛利，營業費用、貢獻毛利與完 | 低。不支援台灣電商平台 | 依第三方整理（2026）：Free；Foundation 約 US$219/月起；Automate 約 US$749/月起；Enterpri | medium | corrected | <https://www.triplewhale.com/pricing> |
| Lebesgue (AI CMO) | 電商行銷分析＋利潤追蹤＋歸因像素 | OAuth：Shopify（深度整合）、WooCommerce、Meta、Google、TikTok、Pinterest、Microsoft Ads、Klavi | 有。免費方案即含「商店表現與利潤追蹤」；可設定 COGS、自訂成本、運費、折扣、稅計算利潤；追蹤 ROAS、CPA、MER、LTV | 低。僅 Shopify／WooCommerce 官網可用 | 2026-10-05 官方價目：Free US$0；Ultimate US$79/月；Ultimate AI US$149/月；Le Pix | high | keep | <https://lebesgue.io/pricing> |
| Polar Analytics | 電商 BI／語意層＋增量測試 | OAuth 串接 Shopify、Amazon、廣告平台等 45 個以上資料來源；每個客戶配一個專屬 Snowflake 資料庫；未查到 CSV 匯入 | 有，屬儀表板層級。評測指出可自動合併各通路計算貢獻毛利與利潤（CM1 等） | 低 | 2026-10-05 官方頁：依年 GMV 分級，價目須選 GMV 才顯示；第三方整理 Core 方案約 US$720/月（GMV < 50 | medium | keep | <https://www.polaranalytics.com/pricing> |
| Northbeam | 多點觸及歸因（MTA）／MER 基準 | 第一方像素＋電商平台與廣告平台串接；計價依網頁瀏覽數；未查到 CSV 匯入 | 否／有限。官方有「Profitability Benchmarks」工具，可把 ROAS／MER／CAC 換算成獲利目標；文件提供新客／舊客 MER，可依活動歸 | 低 | 2026-10-05 官方頁：Starter 頁面顯示「$1,500」（年廣告費 < 150 萬美元）；Professional US$3, | high | corrected | <https://northbeam.io/pricing> |
| Hyros | 廣告追蹤與歸因 | 追蹤腳本＋全部串接（頁面寫「All Integrations」）、LLM／Claude MCP 介面 | 部分。宣稱可看廣告層級 ROI 與獲利、LTV 歸因；官網未說明 COGS 如何計入 | 低 | 2026-10-05 官方頁顯示 US$69/月（追蹤月營收 ≤ US$5,000），更高級距需約 demo；第三方整理 Business  | medium | keep | <https://hyros.com/pricing.html> |
| Measured | 增量測試＋MMM（企業級） | 300 多個代管資料連線（媒體花費與銷售資料） | 否。以增量 ROAS 為主，官網未提利潤或貢獻毛利 | 低 | 未公開（需 demo） | high | keep | <https://www.measured.com/> |
| Rockerbox | 統一行銷衡量（MTA＋MMM＋增量） | 廣告與電商平台串接（細節未查到） | 否。以歸因與增量為主，未查到 COGS 或貢獻毛利 | 低 | 未公開（官方 /pricing 頁 404） | medium | corrected | <https://www.rockerbox.com> |
| ProfitMetrics | 利潤導向出價（POAS）＋伺服器端追蹤 | 電商平台串接＋伺服器端追蹤；把毛利回傳 Google Ads 作為轉換 | 有，屬廣告層級。POAS＝毛利 ÷ 廣告費（損益兩平為 1）；計入折扣、運費、金流費、COGS、包裝處理費 | 低至中。台灣官網商家若主要投 Google Shopping，概念可借鏡；平台串接未查到台灣 | 第三方整理：有永久免費方案；付費依用量客製 | medium | corrected | <https://profitmetrics.io/> |
| A2X | 電商撥款對帳→會計軟體 | OAuth 串接各通路撥款資料 → QuickBooks Online／Xero／NetSuite／Sage | 否。產出分錄層級的銷售、平台費、退款、稅；官網未提廣告費或貢獻毛利報表（需在會計軟體另做） | 低。台灣會計多用在地 ERP（如鼎新、正航），無對應串接 | 2026-10-05 官方頁：多數通路 US$29/月起、Walmart US$79/月起，依每通路單量分級（第三方整理 Shopify 最 | high | corrected | <https://www.a2xaccounting.com/pricing> |
| Finaloop | 電商即時會計（軟體＋會計師服務） | 串接 60 個以上平台（Shopify、Amazon、廣告網路、3PL／WMS、QuickBooks、NetSuite） | 部分。提供即時 P&L、SKU 毛利、FIFO COGS；官網未明確說明依通路的廣告費歸屬或扣廣告後貢獻 | 低 | 2026-10-05 官方頁：Starter US$245/月（年營收 ≤ 100 萬美元、成立 ≤ 4 年）；Full-Service 與 | high | corrected | <https://www.finaloop.com/pricing> |
| Webgility | 電商會計自動化＋獲利分析 | 串接電商通路、市集與 QuickBooks／Xero | 部分。評測描述有依商品／通路的獲利、結算分析（70 多項洞察）；未查到廣告費整合 | 低 | 第三方整理：Essentials US$59/月、Pro US$119/月（另有 US$24/月起的說法） | medium | corrected | <https://www.webgility.com/> |
| Synder | 金流與電商交易同步到會計軟體 | 串接 Stripe、Shopify、Amazon 等 30 多個平台 → QuickBooks／Xero／NetSuite／Sage Intacct | 否。同步費用、稅、折扣、撥款；未見扣廣告後貢獻 | 低 | 第三方整理：Basic US$65/月（500 單） | medium | keep | <https://apps.shopify.com/synder> |
| Supermetrics＋Looker Studio 電商儀表板範本 | 資料連接器＋BI 範本 | OAuth 連接器（網站分析、付費媒體、Shopify）→ Looker Studio、Google Sheets、Excel、Power BI | 否（範本層級）。範本只到營收、廣告花費、每次轉換成本；未含 COGS 或利潤，需自行加欄位 | 中。台灣代理商常用 Looker Studio；可接 Meta／Google 廣告，但電商平台端多半仍要靠 CSV 或 Sheets | 2026-10-05 官方價目：Starter US$49/月（年繳 US$39/月，2 個資料來源）；Growth US$199/月（年繳 | high | corrected | <https://supermetrics.com/template-gallery/looker-studio-ecommerce-dashboard> |
| Funnel | 行銷資料整合（ETL）＋報表 | Starter 117 個連接器、Business 579 個、Enterprise 600 個以上；檔案或 CSV 上傳未在價目頁說明 | 否（預設）。價目頁未提貢獻毛利或電商利潤 | 低 | 2026-10-05 官方價目：Starter US$300/月起（年繳）；Business US$600/月起（年繳）；Enterpris | high | keep | <https://funnel.io/pricing> |
| 電商營運工具箱（ROAS 計算器、多通路營收儀表板、Meta Ads 廣告組診斷） | 台灣電商工具集（206 個工具） | 手動輸入為主；多通路營收儀表板支援 10 大平台 CSV 匯入（蝦皮、momo、PChome、SHOPLINE、CYBERBIZ、91APP、Yahoo、樂天、 | 部分。ROAS 計算器手動輸入廣告費、歸因營收、商品成本、平台抽成 %、運費、訂單數，算出 ROAS、CAC、淨利與拆解圖；多通路營收儀表板以營收、通路佔比為主 | 高。這是 ProfitLens 在台灣最直接的同類競品：一樣吃平台 CSV、一樣講「ROAS 3 倍不等於賺錢」 | 2026-10-05 官方頁：免費版（每日 5 次 AI）；Pro NT$799/月（創始價 NT$599/月終身鎖定）；團隊版即將推出 | high | corrected | <https://ecom.atmarketing.tw/> |
| BigSeller（利潤報表） | 東南亞多平台電商 ERP（含利潤報表） | API 授權平台店鋪（Shopee 官方認證合作夥伴）；授權 Shopee 廣告應用後自動拉廣告費；新店鋪同步授權前 14–30 天訂單 | 有。店鋪銷售利潤統計包含商品銷售額、平台補貼、佣金、交易費、服務費、行銷費、廣告費、商品成本、退款；可做訂單、SKU、店鋪層級利潤，並跨店比較 | 中。是否支援蝦皮台灣站，官方文件未明確確認；momo、PChome 未支援 | 有免費版；第三方報導已開始收費（金額未查到） | medium | keep | <https://www.bigseller.com/> |
| Ecommerce Profit & Ads Planner（Excel／Google Sheets 範本） | 付費試算表範本 | 手動填入或貼上資料（Excel／Google Sheets） | 有（依通路）。追蹤 ROAS、CPA、損益兩平與獲利，可依銷售通路拆分（搜尋摘要） | 低至中。概念通用，但無台灣平台欄位對應 | 搜尋摘要顯示 €29；商品頁未顯示價格 | medium | corrected | <https://profitmetrics.io/> |
| 蝦皮廣告「毛利計算表」（賣家教學分享） | 免費試算表／教學 | 手動記錄每個商品的成本、手續費、金流費 | 部分。以每商品扣費後毛利反推「不虧本的最低 ROAS」；非期間性的實際損益 | 高（反映台灣賣家實際做法：用 Excel 手算） | 免費 | high | keep | <https://ads.shopee.tw/learn/faq/203/889> |

### 多通路／跨境賣家利潤工具（含 Shopee/Lazada 生態）

| 產品 | 類別 | 資料輸入 | 扣廣告後利潤 | 台灣適用 | 價格 | 可信度 | 查證 | 連結 |
|---|---|---|---|---|---|---|---|---|
| 電商營運工具箱（多通路營收儀表板／毛利分析／ROAS 計算器） | 台灣在地電商營運工具箱（SaaS＋免費小工具） | 官網表示 10 大台灣平台（蝦皮、momo、PChome、Yahoo、樂天等）皆可 CSV 匯入；蝦皮、SHOPLINE、CYBERBIZ、91APP、Easy | 部分：儀表板以營收趨勢、通路佔比、AI 分析為主；另有獨立的 ROAS 計算器（輸入廣告費、營收、成本、平台抽成%、運費、訂單數 → ROAS、CAC、淨利、利 | 極高：與 ProfitLens 目標族群、通路、CSV 匯入路線幾乎完全重疊，是最直接的在地競品 | Free NT$0（AI 5 次/日）；Pro NT$799/月（創始價 NT$599/月）；Team NT$2,099/月（2026-10 | high | corrected | <https://ecom.atmarketing.tw/> |
| BigSeller（Shopee Order Profit Report／Store Profit Report） | 東南亞多平台 ERP（訂單、庫存、刊登、報表） | 平台 API 授權串接（Shopee、Lazada、TikTok Shop、Tokopedia、Shopify、Shopline、Line Shopping 等 | 部分：Shopee 訂單利潤報表＝與賣家中心帳單一致的最終訂單收入 − SKU 成本，列出平台費、運費、折價券、退款、稅與調整；官方文件未查到把廣告費攤入利潤 | 低：官網服務國家未列台灣，App 語言未見繁體中文；不支援 momo/PChome/91APP/Cyberbiz | 馬來西亞價（BigSeller 官方部落格 2026）：Free RM0/月（1,500 單、3 店）；Basic RM129/月；Pro  | high | keep | <https://www.bigseller.com/en_US/index.htm> |
| BRP E-Commerce Profit Analytics | 東南亞多平台利潤分析 SaaS | 官方平台整合：Shopee、Lazada、TikTok Shop、Zalora、PGMall、Shopify、WooCommerce、SiteGiant、Eas | 是：官網公式「訂單金額 − 佣金 − 廣告 − 運費 − 平台費 − 退貨 = 真實利潤」，可依訂單、SKU、通路、活動計算，每日重算 | 低：不支援台灣 momo/PChome/91APP/Cyberbiz，未見蝦皮台灣站 | Lite MYR 199/月（3,000 單）；Pro MYR 399/月（10,000 單）；Enterprise MYR 599/月（3 | high | keep | <https://brp.com.my/> |
| 店小秘 利潤核算 | 中國跨境 ERP（財務／利潤模組） | API 自動同步佣金、部分平台行銷費、稅、Shopee/Lazada/TikTok 物流費；無 API 的平台可用範本手動匯入物流費、採購成本、廣告費 | 部分：公式「利潤 = 實收 − 物流費 − 採購成本 − 退款 + 平台其他費用 + 自訂其他費用」；行銷費僅部分平台（速賣通、Lazada、Amazon、Ti | 中低：支援 Shopee（含台灣站之跨境賣家），但不支援 momo/PChome/91APP 等台灣本土通路 | 未查到（第三方介紹稱基本免費） | high | keep | <https://www.dianxiaomi.com/> |
| 芒果店長 訂單利潤／利潤統計 | 中國跨境 ERP | 系統庫存成本、範本匯入（標準／包裹號／運單）、手動輸入；佣金僅 Wish、Ozon 自動更新，其他平台手動設定 | 否／未查到：公式為營收（換算人民幣）− 成本 − 運費 − 佣金，文件未提廣告費 | 低 | 第三方資料：免費版 2 店；VIP1 人民幣 168 元/30 天、1,680 元/360 天；利潤統計為 VIP 功能（搜尋結果摘要） | medium | corrected | <https://www.mangoerp.com/> |
| 馬幫ERP 利潤核算 | 中國跨境 ERP | 平台 API 串接（含 Shopee） | 搜尋結果摘要所列 Shopee 淨利公式含廣告費（行銷費用每日合計，含關鍵字、發現、直播推廣）、佣金、交易手續費、活動服務費、退貨損失、提現手續費、匯損；但該公 | 低 | 第三方資料：馬幫 mini 免費；2.0 企業版初裝人民幣 6,000、次年 5,000；旗艦版初裝 14,800、次年續費 5,000 | low | corrected | <https://www.mabangerp.com/> |
| UpSeller 利潤報表（Shopee 訂單利潤） | 免費跨境 ERP（以拉美為主） | 平台 API；SKU 採購成本需先維護 | 否：公式「利潤 = 平台回款 + 商品成本（負值）」，文件未提廣告費 | 低：未明列台灣站 | 官網標示免費 ERP；付費方案未查到 | high | keep | <https://www.upseller.com/> |
| 船長BI 店鋪利潤報告／利潤月報 | 跨境賣家 BI（以 Amazon 為主） | Amazon 到帳資料（Payment-Transaction）＋廣告報告，API 同步，延遲 1–2 天 | 是（Amazon）：含促銷、物流、廣告、倉儲、佣金 | 低 | 未公開（官方頁面未見） | high | keep | <https://www.captainbi.com/> |
| 旺銷王ERP | 中國跨境鋪貨 ERP | 平台 API 綁店（Shopee 每店消耗 1 點額度） | 未查到：有收支明細結算表、日收支報表；方案表未列利潤報表 | 低 | 人民幣／年：VIP1 680、VIP2 1,680、VIP3 2,980、VIP4 4,980、VIP5 8,980；私有化部署另議（官網， | medium | keep | <https://www.wxwerp.com/> |
| 蝦樂賣 HappySell | 台灣蝦皮賣家雲端 ERP | 蝦皮官方 API 串接；另支援 momo、Coupang、露天 | 未查到：有銷售統計、熱銷排名與『毛利分析』，官網未列運費、廣告費扣除項 | 高（在地蝦皮賣家），但不涵蓋 PChome/91APP/Shopline/Cyberbiz | 年繳 NT$3,980（官網）；比較文稱入門月均 NT$332 起；14 天免費試用 | high | corrected | <https://happysell.tw/> |
| 蝦皮雲管家ERP | 台灣蝦皮賣家 ERP | 蝦皮 API 授權 | 未查到：搜尋摘要稱內建『簡易訂單報表』可看訂單利潤 | 高（蝦皮台灣），不涵蓋其他通路 | 第三方比較文（蝦樂賣部落格）稱 NT$680/月起；官網頁面抓取被拒（403） | medium | corrected | <https://shopee321.tw/> |
| PK-ERP | 台灣電商進銷存 ERP | 支援蝦皮購物／商城、momo、PChome、露天、Yahoo拍賣、SHOPLINE、91APP、Shopify；可匯出 Excel | 未查到：文章強調補足『蝦皮無法輸入商品成本、不易看每筆訂單毛利』，未列廣告扣除 | 高 | 未公開（需電洽或 LINE 洽詢） | medium | keep | <https://www.pk-erp.com/> |
| SiteGiant Marketplace Gross Profit Report | 東南亞全通路 ERP | 平台 API 整合 | 未查到：名稱為毛利報表（日／週／月／年），公式與扣除項未公開 | 低 | 須洽詢（ERP Value / Value Plus / Premium）；毛利報表需 ERP Starter 以上 | medium | keep | <https://sitegiant.my/> |
| Ginee Omnichannel | 印尼／東南亞全通路管理 | 平台 API 整合（Shopee、Tokopedia、Lazada、Bukalapak、Blibli、TikTok Shop 等） | 未查到：僅見『財務報表與業務分析』的概括描述 | 低 | 有 Free、Basic、Pro、Business、Ginee Plus 方案，金額未查到 | low | corrected | <https://ginee.com/> |
| Sellerboard | Amazon 賣家利潤分析 SaaS | Amazon Seller Central API；COGS 由使用者輸入 | 是：利潤儀表板含 Amazon 佣金、FBA/FBM 運費、廣告（PPC）、退款、COGS、VAT 等，官網稱 100 多種 Amazon 費用；PPC 儀表板 | 低（僅對做 Amazon 跨境的台灣賣家有用） | 官網：年繳時約 US$15–63/月，年訂閱 US$179 起；第三方列 Standard $19、Professional $29、Bus | high | keep | <https://sellerboard.com/en/> |
| Helium 10 Profits | Amazon／Walmart／TikTok Shop 賣家工具套件中的利潤模組 | Amazon、Walmart API；可透過 Amazon MCF 處理 TikTok Shop 訂單 | 是：扣除預估成本後的淨利、ROI、利潤率、促銷、退款 | 低 | Platinum US$99/月（年繳）／$129/月；Diamond US$279/月（年繳）含損益報表；Enterprise 另議（官網 | high | corrected | <https://www.helium10.com/tools/profits/> |
| Jungle Scout Sales Analytics | Amazon 賣家財務分析 | Seller Central 自動同步；COGS 可批次上傳；可自訂營業費用（廣告、薪資、運費等） | 是：Total Profit = 總銷售 − COGS − 營業費用；含 TACoS、PPC 歸因與自然銷售比較 | 低 | 包含於 Catalyst／Cobalt 方案，金額未查到；7 天退款保證 | high | keep | <https://www.junglescout.com/features/sales-analytics/> |
| Shopkeeper | Amazon 利潤分析（行動 App 強項） | Amazon API | 是：官網稱整合 150 多種 Amazon 費用含 PPC、退款、稅 | 低 | 第三方列 Starter US$20、Intermediate $45、Master $90、Superseller $250/月；14 天 | medium | corrected | <https://shopkeeper.com/> |
| ManageByStats | Amazon 分析 | Amazon API＋手動加成本 | 部分：可加入各項成本得利潤% | 低 | 第三方：Starter US$24.97/月、Elite $89.97/月、Enterprise 另議 | medium | corrected | <https://managebystats.com/> |
| Veeqo Profit Analyzer | 多通路出貨／庫存平台內的利潤分析 | 以 Amazon 賣家帳號登入，串接各銷售通路 | 部分：含營收、COGS、各通路費用、運費、每個商品的 Amazon 廣告花費（其他通路廣告未提） | 低 | 未公開於該公告 | high | keep | <https://sell.amazon.com/blog/announcements/veeqo-profit-analyzer> |
| Rithum Profitability Reporting（原 ChannelAdvisor） | 企業級多通路電商平台 | 平台內整合各市集資料 | 是：自動彙整市集佣金、廣告費、運費、履約成本成商品／訂單／市集利潤報告；RithumIQ 依利潤動態調配廣告預算 | 低 | 未公開 | medium | corrected | <https://www.rithum.com/resources/rithum-profitability-reporting> |
| Linnworks（含 Conjura 分析） | 多通路訂單／庫存平台＋分析外掛 | 平台整合；Conjura 整合電商、廣告、商品資料 | 部分：Conjura 提供每 SKU、每通路營收與獲利 | 低 | 需報價；第三方估 Starter 約 US$200/月起＋導入費 £250–1,000，分析模組另計 | medium | keep | <https://linnworks.com/> |
| 蝦皮賣家數據中心（商業分析） | 平台原生分析 | 平台內建，不需匯入 | 否：提供銷售額、訂單數、訪客、轉換率、客單價、流量與行銷分析；第三方 ERP 文章指出蝦皮無法輸入商品成本，因此無法算毛利 | 高（每位蝦皮賣家都有），是 ProfitLens 的資料來源之一而非替代品 | 免費 | medium | keep | <https://seller.shopee.tw/> |
| Lazada Business Advisor | 平台原生分析 | 平台內建 | 否／未查到：店鋪與商品層級表現、消費趨勢、經營建議 | 無（Lazada 未經營台灣） | 免費（賣家中心內） | medium | corrected | <https://sellercenter.lazada.com/> |
| Dashboardly（TikTok Shop 利潤分析） | TikTok Shop 利潤分析 SaaS | 串接 TikTok Shop 與 TikTok Ads（API 或 CSV 未說明） | 是：含折扣、COGS、平台費與結算調整、聯盟佣金、廣告、退款、運費 | 低 | 未公開（有免費試用） | medium | corrected | <https://www.dashboardly.io/> |

### 情境試算、FP&A 與決策／會議流程工具

| 產品 | 類別 | 資料輸入 | 扣廣告後利潤 | 台灣適用 | 價格 | 可信度 | 查證 | 連結 |
|---|---|---|---|---|---|---|---|---|
| 電商營運工具箱 | 台灣在地電商試算＋AI 週報工具箱（最接近的本地競品） | 手動輸入試算參數；多通路營收儀表板支援 CSV 一鍵匯入，部分平台可 API 同步（官網列出蝦皮、momo、PChome、SHOPLINE、CYBERBIZ、9 | 部分：ROAS 計算器以手動輸入廣告花費、營收、商品成本、平台抽成、運費算出淨利與 CAC；利潤計算器／折扣券 ROI 可算損益兩平與促銷需多賣幾件。屬單次手動 | 極高：直接鎖定台灣賣家與蝦皮／momo／PChome／官網平台，是 ProfitLens 在「免費、本地、台灣」定位上的直接重疊者 | 免費版（AI 生成 5 次／日）；Pro 頁面標示 $799／月（前 200 名創始會員 $599／月終身鎖定），Team $2,099／月 | high | corrected | <https://ecom.atmarketing.tw/> |
| Triple Whale（Moby Agents / Moby 2） | DTC 電商分析平台＋AI 代理（洞察轉行動） | API 串接 Shopify（主要）、WooCommerce、BigCommerce、Meta/Google/TikTok/Snapchat/Pinterest | 有：依商品、通路、客群的即時損益（P&L）與 LTV；評測稱追蹤扣除營運成本後的實際獲利 | 低：未查到蝦皮、momo、PChome、91APP、Shopline、Cyberbiz 支援；台灣官網品牌若用 Shopify 才可用一部分 | 官方價格頁 403 未能直接讀取；第三方（venon.io，2026-08-02）列：Foundation US$219–2,529／月、A | medium | keep | <https://www.triplewhale.com/> |
| Polar Analytics（Ask Polar / Smart Alerts） | 電商 BI＋AI 代理＋警示 | API 串接 Shopify、Amazon Seller/Vendor Central、Walmart、廣告平台等 45+ 來源；第一方像素 | 有：語意層內建 Contribution Margin、CAC、LTV；評測稱自動計算貢獻毛利與獲利 | 低：官方資料明確未提 Shopee、Lazada 或其他亞洲平台 | 官方頁未列金額，標示依 GMV 分級；第三方稱入門約 US$750／月起 | high | keep | <https://www.polaranalytics.com/> |
| Conjura（Actions Dashboard / Owly AI） | 電商獲利分析＋行動建議清單 | API 串接 Shopify、BigCommerce、GA4、Google/Meta/TikTok/Pinterest Ads、Awin；Scale 方案加 E | 有：所有方案含 contribution margin 與「true contribution profit」，官方稱整合成本、廣告花費、退貨與履約費 | 低：未查到台灣平台支援 | 官方價格頁（依年 GMV 級距）：Essentials US$19.99／月（年繳 15.99）、Growth US$59.99、Scale | high | keep | <https://www.conjura.com/> |
| StoreHero（Spend Advisor / Goals） | 電商貢獻毛利分析＋目標追蹤＋週報 | Shopify App、Amazon 與其他市集、廣告平台 API | 有：追蹤商品與廣告活動層級的貢獻毛利，強調 ROAS 隱藏的獲利流失 | 低 | 首頁未公開 | high | corrected | <https://storehero.ai/> |
| Peel Insights | 電商自動洞察與留存分析 | API 串接 Shopify、Amazon、GA4、廣告平台、Email/SMS、訂閱平台（Recharge、Skio 等） | 未查到明確的扣廣告後貢獻計算；重點在 30+ 世代 KPI 與歸因 | 低 | Core US$179／月（年繳；月繳 199）、Essentials US$449（499）、Accelerate US$809（899） | high | keep | <https://peelinsights.com/> |
| MetricMosaic（MosaicLive） | 電商 what-if 分析＋對話式分析 | 串接 Shopify、GA4、Klaviyo、Meta Ads | 官方文章稱情境輸出含貢獻毛利、獲利影響、回收期、ROAS、LTV | 低 | 未公開（以預約示範取得報價） | medium | keep | <https://www.metricmosaic.io/> |
| Causal（現屬 Lucanet） | 通用 FP&A／情境建模 | Stripe、Shopify、Google Sheets、CSV 上傳、Airtable、HubSpot、Salesforce、Xero 等 | 可自建模型計算，但無預設電商貢獻口徑 | 低：無台灣平台；中文介面未查到 | GetApp（2026-09 更新）：Startup US$250／月起，有免費方案；causal.app 價格頁現為併入 Lucanet  | medium | keep | <https://www.lucanet.com/> |
| Runway | 通用 FP&A／情境規劃 | 宣稱 650+ 整合（會計、HRIS、CRM、資料倉儲） | 無預設電商口徑，可自建 | 低 | 未查到 | medium | corrected | <https://cfo.ai/> |
| Abacum | 通用 FP&A（AI 原生） | 串接財務與營運系統、Excel 連接器 | 無預設電商口徑 | 低 | 未公開 | medium | keep | <https://www.abacum.ai/> |
| Fathom | 中小企業財報分析與預測（會計師導向） | 會計軟體 API | 否（以會計科目為主，無電商通路／廣告口徑） | 低 | 第三方列 Starter US$65／月（1 家公司）至 Platinum US$860／月（50 家） | medium | corrected | <https://www.fathomhq.com/> |
| Eightx eCommerce Contribution Margin Calculator | 免費 CM1/CM2/CM3 單次試算器 | 手動輸入：月淨營收、COGS%、物流%、金流費、廣告總額、固定成本 | 有：CM3（扣廣告後）、ROAS、MER、淨利 | 低（英文、美國平台費率） | 免費 | high | keep | <https://eightx.co/tools/contribution-margin-calculator> |
| 英特艾毛利率計算器 | 台灣免費毛利／廣告容忍成本試算 | 手動輸入單位成本、售價、數量、固定成本 | 部分：「廣告容忍成本」模式算可承受 CPA／CPC；「通路抽成與分潤」模式可同時扣抽成、平台費與廣告費看淨利 | 中：繁中介面、台灣用語，但未綁定特定平台費率 | 免費 | high | keep | <https://interact-vision.com.tw/tools/margin-calculator> |
| 蝦皮成交手續費計算機（0123456789.tw） | 台灣平台費率單次試算 | 手動輸入售價、運費、賣家類型、免運方案、商品分類 | 否：不含廣告費與蝦幣回饋 | 高（蝦皮專用）；同類尚有 free.com.tw、toolkit.tw 等計算機 | 免費 | high | keep | <https://0123456789.tw/calculator/shopee/> |
| 蝦樂賣 HappySell | 台灣多平台訂單／庫存管理（含毛利報表） | 蝦皮官方 API；亦支援 momo、Coupang、露天 | 未查到扣廣告後計算；官網稱有銷售報表與利潤率分析 | 高（平台面），但功能重疊度低 | 年費 NT$3,980；14 天試用 | high | keep | <https://happysell.tw/> |
| Glew | 多通路電商 BI＋警示 | 150+ API 整合 | 有商品獲利與 COGS 成本管理；扣廣告後口徑未確認 | 低 | 第三方列依年營收：US$79／月起至 US$649／月（10M–15M） | medium | keep | <https://www.glew.io/> |
| Daasity | 全通路消費品牌資料平台 | 電商、廣告、Email、訂閱、物流、零售通路 API，進受管資料倉儲 | 有：跨通路貢獻毛利儀表板 | 低 | 第三方：約 US$199／月起至 US$2,500+／月，多為客製報價 | medium | keep | <https://www.daasity.com/> |

## 附錄 B：來源

- <https://trueprofit.io/pricing>
- <https://trueprofit.io/>
- <https://help.trueprofit.io/en/article/import-cogs-handling-fees-using-csv-file-bwz62n>
- <https://trueprofit.io/tiktok-shop-net-profit>
- <https://apps.shopify.com/beprofit-profit-tracker>
- <https://beprofit.ai/>
- <https://useamp.com/pricing.md>
- <https://useamp.com/pricing>
- <https://apps.shopify.com/lifetimely-lifetime-value-and-profit-analytics>
- <https://eightx.co/blog/compare/reviews/lifetimely-for-ecommerce-review>
- <https://apps.shopify.com/triplewhale-1>
- <https://kb.triplewhale.com/en/articles/6119764-input-your-expenses-track-profitability>
- <https://venon.io/blog/triple-whale-pricing>
- <https://ecommercefastlane.com/triple-whale-review/>
- <https://digital-release.kxan.com/business/press-releases/cision/20260519CL62731/triple-whale-unveils-the-ai-operating-system-for-ecommerce-with-the-launch-of-moby-2>
- <https://apps.shopify.com/polar-analytics>
- <https://www.polaranalytics.com/pricing>
- <https://www.polaranalytics.com/llms.txt>
- <https://www.polaranalytics.com/integration-draft/amazon-seller-central>
- <https://eightx.co/blog/compare/how-much-does-polar-analytics-cost>
- <https://apps.shopify.com/storehero-profit-analytics>
- <https://storehero.ai/>
- <https://storehero.ai/pricing>
- <https://www.conjura.com/pricing>
- <https://www.conjura.com/ecommerce-actions-dashboard>
- <https://help.daasity.com/core-concepts/contribution-margin>
- <https://apps.shopify.com/daasity>
- <https://www.glew.io/pricing>
- <https://www.trustradius.com/products/glew-io/pricing>
- <https://lebesgue.io/pricing>
- <https://apps.shopify.com/peel-insights>
- <https://peelinsights.com/pricing>
- <https://docs.northbeam.io/docs/profitability-benchmarks>
- <https://northbeam.io/pricing>
- <https://www.admetrics.io/compare/8-best-northbeam-alternatives>
- <https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/report-types/default-reports/profit-reports>
- <https://changelog.shopify.com/posts/product-cost-and-profit-reporting-is-here>
- <https://apps.shopify.com/netnet>
- <https://apps.shopify.com/marginstack>
- <https://www.bloomanalytics.io/pricing>
- <https://brp.com.my/>
- <https://hyros.com/pricing.html>
- <https://www.measured.com/>
- <https://www.rockerbox.com>
- <https://profitmetrics.io/>
- <https://lp.profitmetrics.io/free-trial>
- <https://www.a2xaccounting.com/pricing>
- <https://www.finaloop.com/pricing>
- <https://www.webgility.com/blog/what-is-webgility>
- <https://apps.shopify.com/synder>
- <https://supermetrics.com/template-gallery/looker-studio-ecommerce-dashboard>
- <https://supermetrics.com/pricing>
- <https://funnel.io/pricing>
- <https://productivilab.gumroad.com/l/ecommerce-profit-ads-planner-en>
- <https://ads.shopee.tw/learn/faq/203/889>
- <https://ads.shopee.sg/learn/faq/92/2147>
- <https://www.markhuang.com.tw/blog/8962>
- <https://www.bigseller.pro/blog/articleDetails/3631/shopee-business-insights.htm>
- <https://rules.momo.com.tw/bulletin/00016/>
- <https://retail-connect.com.tw/training/2821>
- <https://apps.apple.com/tw/app/p-%E5%AE%B6%E5%AE%B6-pchome%E5%BB%A0%E5%95%86%E5%BE%8C%E5%8F%B0%E7%B3%BB%E7%B5%B1/id1451037191>
- <https://shopline.hk/en/data-analysis>
- <https://help.shopline.com/hc/en-001/articles/25421686039705-Profit-Margin-Report>
- <https://www.inside.com.tw/article/20781-e-commerce-platforms>
- <https://help.cyberbiz.io/ec/business-intelligence/revenue-analysis/>
- <https://help.cyberbiz.io/ec/business-intelligence/business-intelligence-overview/>
- <https://www.cyberbiz.io/blog/online-store-platform-cost/>
- <https://91app.com/solutions/>
- <https://support.easystore.co/en/article/view-your-reports-in-easystore-krki59>
- <https://www.easystore.co/zh-tw/marketplaces1>
- <https://www.easystore.co/zh-tw/pricing>
- <https://help.bigseller.com/zh_CN/detailPage/10/1/8429/content>
- <https://help.bigseller.com/zh_CN/detailPage/10/1/3778/content>
- <https://www.bigseller.pro/blog/articleDetails/4210/shopee-seller-profit.htm>
- <https://www.bigseller.com/blog/articleDetails/4643/erp-tools-cost-malaysian-sellers.htm>
- <https://www.bigseller.com/en_US/index.htm>
- <https://sitegiant.tw/payment-reconciliation/>
- <https://sitegiant.my/blog/marketplace-gross-profit-report/>
- <https://happysell.tw/>
- <https://happysell.tw/blog/erp-comparison-2025>
- <https://docs.a1erp.digiwin.com/a1ordermanual/07.shopline>
- <https://actgsys.com/blog/dinkoko-vs-digiwin-erp-comparison-2026>
- <https://www.flaps.com.tw/ecommerce-erp-multi-platform-integration/>
- <https://www.ragic.com/intl/zh-TW/blog/366/free-shopee-reconciling-tool>
- <https://citerptw.gitbook.io/ezk-1/ha-pi-zi-dong-dui-zhang-xi-tong>
- <https://ecom.atmarketing.tw/>
- <https://ecom.atmarketing.tw/learn/ad-calc>
- <https://ecom.atmarketing.tw/meta-ads-analyzer>
- <https://ecom.atmarketing.tw/blog/weekly-report-guide>
- <https://0123456789.tw/calculator/shopee/>
- <https://www.digitalorigin.tw/tools/shopee-fee-calculator/>
- <https://admetry.app/templates>
- <https://tbr.digital/digital-downloads/eclookerstudio>
- <https://docs.supermetrics.com/docs/en/shopee-commerce-fields>
- <https://anymindgroup.com/news/press-release/anyx-advertising-report-launch>
- <https://shopto.tw/knowledge_marketplace_strategy.php>
- <https://help.dianxiaomi.com/article/financialManagement/167>
- <https://help.mangoerp.com/article/835>
- <https://www.upseller.com/zh-CN/help-doc-article-2814>
- <https://m.captainbi.com/amz_faq_list-55.html>
- <https://m.captainbi.com/amz_faq_list-94.html>
- <https://www.wxwerp.com/zh/pricing.html>
- <https://www.pk-erp.com/recommend-shopee-erp/>
- <https://sellerboard.com/en/>
- <https://www.helium10.com/tools/profits/>
- <https://www.junglescout.com/features/sales-analytics/>
- <https://revenuegeeks.com/software/shopkeeper>
- <https://managebystats.com/>
- <https://sell.amazon.com/blog/announcements/veeqo-profit-analyzer>
- <https://www.rithum.com/resources/rithum-profitability-reporting>
- <https://linnworks.com/pricing>
- <https://www.dashboardly.io/post/tiktok-shop-true-profit-model-2026>
- <https://www.metricmosaic.io/blog/what-if-analysis>
- <https://www.causal.app/pricing>
- <https://www.getapp.com/financial-management-software/a/causal>
- <https://www.cfoshortlist.com/vendors/runway>
- <https://www.abacum.ai/compare/vs-pigment>
- <https://erpresearch.com/erp-add-ons/reporting-tools/fathom/pricing>
- <https://eightx.co/tools/contribution-margin-calculator>
- <https://interact-vision.com.tw/tools/margin-calculator>
- <https://alternativeto.net/software/leaprows/about>
- <https://evidence.dev/cloud>

