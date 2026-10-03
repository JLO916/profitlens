# ProfitLens 發布紀錄

> 新的在上。正式站：<https://profitlens-tau.vercel.app>。工程驗收命令與各批驗收紀錄見 [ENGINEERING](ENGINEERING.md)；每批真實執行結果見 [STATUS](STATUS.md)；取捨見 [DECISIONS](DECISIONS.md)。

## v2.0.0（2026-10-03）

Revamp v2：把產品從「稽核員工具」改成台灣電商經理人每週會用的工具（`docs/revamp/`，批次 R0–R7，分支 `revamp/v2`）。財務口徑不變。

### 給使用者
- **首屏直接看關鍵數字與本期三件事**（R1）：總覽順序改為本期關鍵數字 → 本期三件事 → 每週趨勢 → 貢獻變化拆解＋通路比較；期間列固定在頁面上方，新增「近 7 天／近 4 週／近 12 週／本月 vs 上月」快捷（只填日期，按「套用」才生效）；AI 狀態縮成頂欄小標籤，「儲存 ▾」「下載 ▾」集中到頂欄；切頁自動回到頁首。三件事與健檢顯示「對貢獻影響」：負＝不利（紅）、正＝有利（綠）。
- **名詞改為電商常用說法**（R2）：扣廣告後貢獻、通路貢獻、平台抽成、金流手續費、物流與包材費、廣告投放費、退款比；頂欄「口徑說明」九條；「怎麼算的」抽屜用中文階梯公式，來源依檔案分頁、可搜尋；示範資料通路顯示「官網 · DTC／平台 · MARKETPLACE」；CSV 標題列改為「中文 (english_key)」。
- **匯入精靈**（R3）：四步「選檔 → 對照欄位 → 口徑與期間 → 檢核與套用」；拖放三份報表、依檔名自動歸位；欄位依「標準欄名 → 上次的對照 → 來源預設 → 中文欄名字典」自動預選；含稅報表選「含稅」即逐列 ÷ (1＋稅率) 換算成未稅（預設 5%，可改），原值與換算值在「怎麼算的」、資料來源頁與匯出都看得到；記住上次對照（需同意本機保存）；九個來源預設（蝦皮訂單與進帳報表、momo 店+、91APP、Shopline、Cyberbiz、PChome、Meta Ads、Google Ads）；錯誤訊息白話化；範本另附三列示範的範例檔；平台訂單明細用 `scripts/aggregate_orders.py` 先彙總。
- **輔助指標、去年同期、目標、檔期**（R4）：總覽新增七格輔助指標（售出件數、件均淨營收、廣告佔比、廣告投報 MER、商品毛利率、退款比、物流費佔比；`assist-kpi-v1`，不混入財務核心）；「去年同期」快捷；匯入 `targets.csv` 後 KPI 卡顯示目標達成率；匯入 `events.csv` 後促銷檔期標在趨勢圖與三件事；完整備份升為 v4（含含稅換算原值、目標、檔期），舊 v1–v3 備份仍可讀入。
- **通路健檢改為清單、假設試算更快**（R5）：同一問題的合計與各通路合併成一列、資料缺漏排最前、依對貢獻影響排序，標題一句話寫出問題與金額，前三列預設展開；假設試算進頁就是表單，六個範本、可直接輸入絕對值（目標件數、新折扣率、新廣告預算），「要賣到多少才划算」三組敏感度隨方案保存；待辦改為看板（未開始／進行中／受阻／已完成，按鈕改狀態、負責人選單、證據勾選含搜尋）；商品毛利頁新增「毛利最差／最好的商品」各 10 名。
- **會議紀錄與匯出**（R6）：新分頁「會議紀錄」——議程自動組成、記錄決議、「結束會議」後凍結成紀錄、自動與上次會議比較；匯出 PDF（A4 列印一頁摘要＋附錄）、Excel（六個工作表）、PowerPoint 一頁式、Markdown 與 CSV，全部集中在「下載 ▾」。
- **工作區可自動保存在你的電腦**（R6，需同意）：第一次載入資料時詢問一次，同意後每次修改 2 秒內自動保存，頂欄顯示「已保存 hh:mm」；可在「儲存 ▾」關閉自動保存或「刪除本機資料」。
- **上線整理**（R7）：README 改寫給營運主管（工程內容移到 [ENGINEERING](ENGINEERING.md)）；示範資料只用顯示別名（官網 · DTC／平台 · MARKETPLACE；品類 居家／保養／配件／3C），側欄標示「示範資料是合成資料，不代表任何真實商家或業績」、匯出檔資料集識別碼以 `synthetic-demo` 開頭（決策 D3＝A）；「開發者驗證」頁不在側欄顯示，改由網址 `#validation` 開啟（D10＝A）；網站標題、描述與分享卡片更新；網址維持 profitlens-tau.vercel.app（D8＝A）；接上 Vercel Web Analytics（不加依賴，只在 Vercel production 載入；需在 Vercel 儀表板啟用後才開始記錄），只記頁面瀏覽與互動事件名、不含任何資料內容，並在頁尾揭露（D9＝B）；側欄次要文字加深以通過 Lighthouse 對比檢查。

### 不變的事
- 財務口徑 `contribution-v1` 不變：淨營收 → 商品毛利 → 通路貢獻 → 扣廣告後貢獻的公式（`docs/METRICS.md`）與 golden／demo／errors／refund_only／zero_ad fixtures 零改動；R4 對 `src/domain` 只做加法（售出件數），既有指標的輸入輸出不變。
- 所有既有 golden 測試通過，固定答案不變：Golden 本期扣廣告後貢獻 255.00、兩期差額 −315.00；假設試算 DTC 284.00／264.00、MARKETPLACE 19.70。
- 每個金額仍可開「怎麼算的」看到公式、CSV 檔名與原始行號；含稅換算同時顯示原值與換算值。
- 資料不上傳：原始 CSV 只在瀏覽器處理；沒有登入、資料庫或伺服器端保存；本機保存須先同意。
- AI 解釋在公開版未啟用：`APP_MODE=PUBLIC_DEMO`、`PUBLIC_DEMO=true`、`ENABLE_LIVE_AI=false`，伺服器沒有 OpenAI key，`/api/insights` 的封鎖邏輯不變（POST 回 403）。

### 已知限制
- 平台訂單明細需先用 `scripts/aggregate_orders.py` 整理成日粒度（見 [ORDER_AGGREGATION](ORDER_AGGREGATION.md)）；精靈只偵測並引導，不在畫面內彙總（D5＝A）。
- 來源預設只有 `shopee_orders`（蝦皮訂單匯出）以真實匯出檔的標題列驗證；其餘八個尚未以真實匯出檔驗證：`shopee_income`、`momo_settlement`、`91app_orders`（以公開文件或 API 文件重建樣本）、`shopline_orders`、`cyberbiz_orders`、`pchome_settlement`、`meta_ads`、`google_ads`（見 [R3 來源預設查證](../verification/revamp-R3-preset-verification.md)）。
- `npm audit` 對 `xlsx@0.18.5` 與 `pptxgenjs@4.0.1` 依賴的 `image-size` 回報 3 個 high：都在 ProfitLens 未使用的讀取／圖片解析路徑，沒有可升級的修正版；已記錄於 [DECISIONS](DECISIONS.md)（2026-10-03 R6）。
- 示範資料台灣化（新 fixture `fixtures/demo_tw`：官網／蝦皮／momo 三通路、商品名稱、檔期，並獨立手算 expected）列為上線後待辦；本版只做顯示別名（D3＝A）。
- Live AI 未實測；真實營運資料、真實使用者試用、Safari／Firefox 與實體裝置未驗收。
- 訂單數、客單價、轉換率（選配 `orders_daily.csv`）延後到 Phase 2（D6＝B）。
- 其他：本機保存的同意只在本次載入有效（重新整理後再問一次）；目標達成率只在目標期間與本期完全相同時顯示；待辦看板以按鈕改狀態、不支援拖曳。

### 驗收
- 上線檢查：[verification/revamp-R7-acceptance.md](../verification/revamp-R7-acceptance.md)
- 各批驗收：[R0](../verification/revamp-R0-acceptance.md)、[R1](../verification/revamp-R1-acceptance.md)、[R2](../verification/revamp-R2-acceptance.md)、[R3](../verification/revamp-R3-acceptance.md)、[R4](../verification/revamp-R4-acceptance.md)、[R5](../verification/revamp-R5-acceptance.md)、[R6](../verification/revamp-R6-acceptance.md)（R7 結束時：單元／整合 73 檔 1,462 項、E2E 四尺寸 576 項全過；R6 結束時 72 檔 1,435 項、576 項）

## 2026-10-02 Review v2 A 批

R7 搬移註記：以下為原 README 開頭的發布說明原文，連結改為從 `docs/` 出發。「最新發布」是撰寫當時的說法，現行版本見上方 v2.0.0。

> 最新發布（2026-10-02）：Review v2 A 批「營運與會議狀態分離」已推送私人 GitHub 並部署至 [正式站](https://profitlens-tau.vercel.app)。產品提交 `6c11a42`、Vercel production READY，正式網址反查同版本；13 項 HTTP 與四尺寸人工瀏覽器 smoke 通過。公開 Live AI 後端維持關閉，Live AI 未實測。819 項單元／整合、400＋4 項 E2E、typecheck／lint／本機 build 為本批原驗收結果；本次核對 139 件受測來源無差異後沿用，雲端另實際重新 `npm ci`／build。詳見 [發布紀錄](../verification/release-v2-a-20261002-acceptance.md)。

已發布功能另包含 A 批的行動執行管理、多通路方案、固定範圍會議、v3 備份及替換保存保護；原有每頁規則診斷及即時 AI 可用狀態、獨立「進階驗證」、主管摘要、商品比較、方案、行動與會議輸出。開發時的失敗修復與未執行項目保留於 [第三批](../verification/manager-batch3-acceptance.md)、[第二批](../verification/manager-batch2-acceptance.md)、[第一批](../verification/manager-batch1-acceptance.md) 和 [M6](../verification/app-acceptance.md) 歷史報告；不將歷史通過數當成本次重新執行結果。原有 [本機預覽 3200](http://127.0.0.1:3200/) 的程序未更動；A 批需以本輪建置啟動，不能以舊分頁判斷新功能。

## 2026-10-01 管理者改善三批

R7 搬移註記：以下為原 README 開頭的歷史發布說明原文，連結改為從 `docs/` 出發。三批各自的改善內容見 [ENGINEERING](ENGINEERING.md) 的「管理者改善第一／二／三批」。

歷史發布（2026-10-01；最新版本以上方 A 批發布為準）：**三批管理者改善已發布至 [ProfitLens 正式站](https://profitlens-tau.vercel.app)**，程式版本 `2f8e539` 已推送至既有私人 GitHub，Vercel production READY。依最新指示先發布，公開版維持 `PUBLIC_DEMO`，Live AI 後端關閉；**Live AI 未實測**，20案僅完成離線準備。發布前重新通過766項unit/integration、282項三尺寸E2E、typecheck、lint及production build；正式站13項HTTP檢查與1440／768／390px人工操作通過。完整命令、證據及未驗收範圍見 [本次發布紀錄](../verification/release-20261001-acceptance.md) 與 [STATUS](STATUS.md)。
