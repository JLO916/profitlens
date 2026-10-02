# 08 重新上線計畫

> 對應批次：R7（部分項目在 R2 後可先做 beta）。部署目標不變：Vercel production（`APP_MODE=PUBLIC_DEMO`、`PUBLIC_DEMO=true`、`ENABLE_LIVE_AI=false`、無 OpenAI key）。

## 1. README 結構（給誰看、先看什麼）
```
# ProfitLens｜電商獲利診斷與決策工作台
一句話 + 正式站連結 + 一張總覽截圖（1200px）

## 它回答三個問題（給營運／行銷主管）
1. 營收漲了，扣完平台抽成、物流、廣告之後，到底多賺還是少賺？
2. 問題在哪個通路、哪一項費用？金額多少？
3. 如果調廣告、調折扣、取消免運，貢獻會變多少？
→ 每個數字都能點開看公式與來源（CSV 檔名與行號）。

## 30 秒試用
開正式站 → 按「試試示範資料」→ 看「本期三件事」→ 點任一數字看「怎麼算的」。
（示範資料為合成資料，不代表任何真實商家。）

## 用自己的資料
需要三份日粒度 CSV：商品銷售、通路費用、廣告投放（範本與範例在 templates/）。
含稅報表可以在匯入時換算成未稅。資料只在你的瀏覽器裡，不會上傳。
平台匯出是訂單明細？先用 scripts/aggregate_orders.py 整理（見 docs/ORDER_AGGREGATION.md）。

## 口徑一頁說明
四層數字、不包含什麼、差額≠原因、試算≠預測（複製 03 §8 九條）。

## 功能一覽（一表）
經營總覽｜通路健檢｜商品毛利｜假設試算｜待辦與決議｜會議紀錄｜資料來源

## 限制與不做的事
單一公司、TWD、未稅；無登入與雲端；不做 SKU 廣告歸因；不是淨利；AI 解釋在公開版未啟用。

## 本機啟動（4 行）
## 工程與驗收 → docs/ENGINEERING.md
## 發布紀錄 → docs/RELEASES.md
## 安全與隱私 → 三句 + 連結 AGENTS.md
```
現有 README 的 M0–M6、三批管理者改善、驗收數字、命令細節全部搬到 `docs/ENGINEERING.md`（保留原文，不刪資訊）；各次發布段落搬到 `docs/RELEASES.md`。

## 2. 示範資料台灣化（決策 D3）
- **方案 A（R2 已做，零風險）**：顯示 alias「官網 · DTC」「平台 · MARKETPLACE」；品類 HOME／CARE／ACCESSORIES／ELECTRONICS 顯示為「居家／保養／配件／3C」（`labels.demoCategoryAlias`）。SKU 代碼不變。
- **方案 B（R7 可選）**：新 fixture `fixtures/demo_tw/`：通路 `官網`、`蝦皮`、`momo`；20 個 SKU 加 `product_name` 顯示用對照檔 `fixtures/demo_tw/catalog.json`（不進 CSV 契約）；12 週；含雙 11 前的「夏季特賣」事件；`expected.json` 由試算表手算（附 `expected_calc.md`）。示範選單新增「台灣示範」並設為預設；原 demo 保留。
- 無論 A/B，示範資料頁面與匯出都標示「合成資料」。

## 3. SEO／分享／品牌
- `layout.tsx` metadata：title「ProfitLens｜電商獲利診斷與決策工作台」、description「匯入銷售、通路費用與廣告三份報表，看清營收背後的扣廣告後貢獻，每個數字可追溯到來源。」、`openGraph`／`twitter` 卡片、`public/og.png`（1200×630：產品名＋一句話＋總覽截圖）、favicon（現有品牌符號）。
- `robots.txt` 允許全部；`sitemap.xml` 單一 URL；`lang="zh-Hant-TW"`。
- 自訂網域（決策 D8）：在 Vercel 設定，README 與 OG 連結同步。
- 分析工具（決策 D9）：若啟用 Vercel Web Analytics，只做頁面瀏覽與互動事件，不含任何資料內容；頁尾一句揭露。

## 4. 上線前檢查（R7-5，逐條記錄真實結果）
1. `npm ci` 乾淨安裝、typecheck／lint／test／build／test:e2e 全通過（附數字）。
2. Vercel 環境變數三個值確認（截圖）；`.vercelignore` 排除清單不變。
3. Preview 部署：13 項 HTTP 檢查（沿用 `verification/deployment-acceptance.md` 的清單）＋ `/api/insights` GET 關閉狀態、POST 403。
4. 四尺寸人工操作：示範 → 三件事 → 看證據 → 加入待辦 → 試算一個方案 → 會議紀錄 → 匯出 PDF／Excel／Markdown；每步截圖。
5. Lighthouse（desktop／mobile）：效能、a11y、最佳實務、SEO 實際分數記錄；a11y < 90 必須修。
6. 鍵盤走查：Tab 順序、Esc 關閉、焦點回原按鈕。
7. 無主控台錯誤；無 404 資源；OG 卡片用社群預覽工具檢查。
8. 備份相容：用 R0 前拍的 v3 備份檔在正式站恢復成功。
9. 隱私：Network 面板確認無任何 CSV 內容上傳。
10. README 連結全部可開；示範站首屏文字與 README 一致。

## 5. 發布說明範本（`docs/RELEASES.md`）
```
## v2.0.0（YYYY-MM-DD）
### 給使用者
- 首屏直接看關鍵數字與本期三件事；名詞改為電商常用說法（扣廣告後貢獻、平台抽成、物流與包材費）
- 匯入精靈：拖放三份報表、自動對照欄位、含稅可換算、記住上次對照
- 新增輔助指標（售出件數、廣告佔比、MER、毛利率、退款比）、去年同期、目標達成率、促銷檔期標記
- 通路健檢改為清單，一句話說明問題與金額；假設試算有範本與絕對值輸入
- 待辦看板、會議紀錄、上次會議比較；匯出 PDF／Excel／PPT
- 工作區可自動保存在你的電腦（需同意）
### 不變的事
- 財務口徑 contribution-v1 不變；所有既有 golden 測試通過；資料不上傳；AI 解釋公開版未啟用
### 已知限制
- 平台訂單明細需先用腳本整理；來源預設對照尚未以真實匯出檔驗證（列出清單）
### 驗收
- 連結 verification/revamp-R7-acceptance.md
```

## 6. 發布後第一週
- 以 `docs/PILOT_WORKSHEET.md` 找 2–3 位真實使用者（行銷經理、營運主管、財務）走四個無口頭指引任務；記錄提示次數與分不清的名詞，回饋到 labels。
- 收集真實平台匯出檔（去識別化）驗證 preset，把 `verified: false` 逐個改為 `true`。
- 若 README 的 30 秒試用在手機上超過 60 秒，優先修 390px 首屏。
