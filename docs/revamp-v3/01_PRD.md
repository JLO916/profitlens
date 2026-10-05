# EC ProfitLens Revamp v3 PRD：簡明且專業的介面與語言（不砍功能）

- **一句話目標**：把 v2.0.0 的「功能齊全但難讀、看起來像 AI 生成」改成「老闆 10 秒看懂、主管 3 分鐘找到原因、執行者 10 分鐘完成匯入與核對」的專業財務工具。v3 **不新增財務口徑，也不刪任何功能**。
- **三層閱讀，不做角色切換**：同一個畫面分 L1 結論、L2 解讀、L3 依據三層，三種讀者靠展開深度各取所需。L1 永遠可見，L2、L3 都在一次點擊內。
- **首屏先給答案**：經營總覽最上面是「本期一句話」，接著是 5 格 KPI 帶與本期三件事。1440×1000 時這三塊都要在首屏，390×844 時首屏要看得到扣廣告後貢獻（目前一個數字都看不到）。
- **去 AI 製作感有可檢查的規則**：25 條禁止與替代規則（X1–X25），每條都附 v2 的檔案與行號證據。靠兩支零依賴的 vitest 棘輪測試守住，數值只能逐批下降：寫死色碼從 189 降到 0、圓角從 18 種降到 3 種、字級從 21 種降到 8 種。
- **一套語言**：一個概念只用一個詞（名詞表 30 列）。數字分三層尺度：L1 用萬或億，L2 用整數元，L3 到分。統一 HALF_UP 取位與 U+2212 負號。錯誤訊息一律寫成「檔名 第 N 行：問題。修法。」。所有中文仍然只放在 `labels.zh-TW.ts`。
- **功能零刪除，用機制保證**：第 6 節的 62 列功能對照表（#1–#60 加校稿補列 #43a、#44a）對到 v2 的每個功能、testid 與錨點。另有 testid 基準測試（129 個靜態 testid，加上運算式與 `testId` 屬性傳入的 testid，樣板一律展開成實際渲染值），以及「搬進彈出層也要保持掛載」「同一控制只有一個 DOM 實例」的規則。每批結束都要逐列打勾 `feature-retention.csv`。
- **11 批、一次一批、一批一個工作階段**：V3-0 先建基準與護欄，不改 UI；V3-1 到 V3-4 完成 token、語言、殼層與經營總覽，這是老闆看得到改變的最小可交付版本（MVP 切線）。V3-5 到 V3-8 依序改其餘頁面，V3-9 才做 P1 新功能（F18 表格密度例外，隨商品頁在 V3-5 做）。只有 V3-9 可能在 `src/domain` 新增，而且 F12 優先比照 assist-kpi 實作在 `src/application`；任何新增都必須附獨立手算的 golden 測試。需要好幾個工作天的人工活動（可用性測試、設計稿審查、審稿）列為批次以外的人工關卡 H1–H4（§12.1）。
- **需要你拍板 24 件事**（第 13.2 節），其中 9 件會擋住 V3-2 以前的批次，請先決定：D-V3-1、2、3、4、5、6、7、8、9。

| 項目 | 內容 |
|---|---|
| 文件 | Revamp v3 PRD（定稿候選，待拍板事項見 §13.2） |
| 日期 | 2026-10-05 |
| 基準版本 | v2.0.0（分支 `revamp/v2`，commit `82b70df`） |
| 目標版本 | v3.0.0 |
| 依據 | v2 UI 盤點（`verification/revamp-R3`–`R7` 截圖、`src/components/*`、`src/app/globals.css`、`src/i18n/labels.zh-TW.ts`）；標竿研究（§4 的 URL）；`docs/market-comparison-2026-10-05.md`；`docs/METRICS.md`；`docs/revamp/02_IA_LAYOUT.md`、`03_GLOSSARY_COPY.md`、`05_FEATURES.md`、`09_DECISIONS_PENDING.md`；三份草稿（高階經理人優先、設計系統優先、執行者語言優先）與兩位評審的意見（§14.3） |
| 本套件其他檔案（V3-0 產出） | `docs/revamp-v3/06_BATCHES.md`（由 §12 拆出）、`docs/revamp-v3/09_DECISIONS_PENDING.md`（由 §13.2 拆出）、`docs/revamp-v3/GLOSSARY.md`（由 §8.3 拆出）、`docs/revamp-v3/copy-rewrite.csv`（全量改寫對照，供人工審） |
| 硬前提 | 不砍任何現有功能（只能搬移、合併、收合、改名）；財務核心禁區不動（`src/domain/*`、`fixtures/golden`、`demo`、`errors`、`refund_only`、`zero_ad`、`contribution-v1`、`docs/METRICS.md` 公式）；使用者看得到的中文只放在 `src/i18n/labels.zh-TW.ts`；不加登入、資料庫、伺服器端保存，不上傳 CSV；不加依賴（本輪「允許新增依賴」清單為空）；每個金額都能開「計算與來源」看到檔名與行號；`data-testid` 與 a11y 結構不退步；沿用 Tailwind v4 與 `globals.css` 自訂 class |

---

## 決策摘要（一頁，給老闆與拍板者）

**為什麼要改**：v2 每個數字都算得對、都能追溯，但畫面不好讀。1440 寬時 KPI 要到 y≈400 才出現；手機首屏沒有任何數字；同一個抽屜有三個名字；`globals.css` 有 189 種寫死的色碼、18 種圓角、21 種字級；英文大寫小標、旋轉圖示、圈數字、置中按鈕列這些模板痕跡，讓產品看起來像 AI 生成的。

**v3 會帶來的三個改變**

| # | 改變 | 你會看到什麼 | 哪一批上 |
|---|---|---|---|
| 1 | 首屏給答案 | 「淨營收多 170.9 萬，扣廣告後貢獻卻少賺 59.9 萬；最大一項是折扣多花 118.8 萬。」下面接 5 格 KPI 帶和三件事；一鍵「複製週會摘要」貼到 LINE 或 Email | V3-4 |
| 2 | 像專業財務工具 | 灰階加一個深綠強調色；表格是主角；瀑布圖拆解兩期差額，並附平衡檢核；不再有卡中套卡、英文小標、圈數字 | V3-1 到 V3-4 |
| 3 | 一套語言 | 一個概念一個詞（例如「計算與來源」「待辦」「扣廣告前貢獻」）；金額在摘要層用萬、表格用元、抽屜到分；錯誤訊息直接告訴你哪個檔、第幾行、怎麼修 | V3-2、V3-8 |

**成本與節奏**：共 11 批，依 CLAUDE.md 一批一個工作階段，所以**至少** 11 個工作階段（L 級批次可能在開工前拆成 a／b，各批大小見 §12.3）。另外需要約 2.5–3.5 週的人工時間：兩輪 5 人可用性測試、兩輪外部盲評、一次設計稿審查、`copy-rewrite.csv` 文案審稿，另加招募與等待拍板的時間。V3-0 到 V3-4 是 MVP 切線，至少 5 個工作階段，完成後老闆就能看到首屏的改變。時間不夠時，V3-9 的 P1 新功能可以整批延到 v3.1，不影響「簡明、專業、不砍功能」三個目標。

**不會變的事**：所有數字與算法（golden：本期 255.00、差額 −315.00、試算 284.00／264.00／19.70）；隱私邊界（不上傳、不登入、公開站不用 AI）；所有功能與匯出格式（v2 的每一個下載入口都保留，含頂欄選單、各頁輸出與條件項，逐項清單見 §6.5）。

**請先拍板（擋住前三批）**：D-V3-1「通路貢獻」改名為「扣廣告前貢獻」；D-V3-2「口徑」拆成三個詞；D-V3-3 抽屜改名「計算與來源」、按鈕改「看明細」；D-V3-4「行動」統一為「待辦」；D-V3-5 MER 主名；D-V3-6「台」或「臺」；D-V3-7 有利方向不上色；D-V3-8 負數表示；D-V3-9 主色沿用深綠。每一項都附了建議（§13.2）。**沒有明確回覆就不視為核准**：受影響的批次不開工，或只做不受該決策影響的部分，拍板前沿用 v2 的行為與用詞。修正 v2 既有決策的項目（D-V3-1、D-V3-2）與部署（D-V3-24）一律要使用者明確同意。

---

## 1 背景與問題陳述

### 1.1 現況

EC ProfitLens v2.0.0 已經完成 R0–R7，目標是把產品從「稽核員工具」改成「經理人每週會用的工具」。功能面相當完整：

- 四層口徑：淨營收 → 商品毛利 → 通路貢獻 → 扣廣告後貢獻。
- 兩期比較、九項橋接、8 條規則健檢。
- 多方案試算與敏感度分析。
- 待辦看板。
- 會議紀錄：議程、決議、凍結、歷史、比較。
- 匯出：CSV、Markdown、JSON、PDF、Excel、PPT。
- 四步匯入精靈：含稅換算、欄位記憶。
- 本機自動保存，備份格式 v4。

每個金額都能開抽屜，看到 CSV 檔名與行號。

v2 上線後，使用者提出兩個問題：

1. **介面複雜、不好懂。** 語言要簡明又專業，讓高階經理人、專業經理人、系統執行者都能操作和解讀。
2. **「AI 製作感」太重。** 要參考專業標竿產品的呈現方式。

### 1.2 問題拆解（附盤點證據）

> 計數來自 2026-10-05 對 repo 的實際掃描，V3-0 的 `scripts/ui-audit.mjs` 會產出正式基準值，取代本表手數的數字：相異 hex 色碼：`globals.css` 單檔 189 個（不分大小寫），依 §2.3 B 的口徑（`:root` 以外＋`src/components/**/*.tsx`＋`src/components/**/*.css`，含 `manager-summary.module.css`）合計 201 個；相異 `border-radius` 值 18 種、相異 `font-size` 宣告值 21 種（皆指 `globals.css`）、靜態 `data-testid` 129 個、`labels.zh-TW.ts` 有 1,954 行，其中「注意：」42 處。問題編號用 Q，以免和優先級 P0／P1／P2 撞名。

| # | 問題 | 證據 | 影響對象 | 嚴重度 |
|---|---|---|---|---|
| Q1 | **首屏被殼層占掉。** 頂欄 64px，頁首約 130px（eyebrow、h1、副標、匯入鈕），期間列 2 行，範圍說明 2 行，KPI 要到 y≈400 才開始。1280 寬時頂欄折成兩列 | `verification/revamp-R7/1b-overview-desktop-viewport.png`、`1b-overview-laptop-viewport.png`；`dashboard.tsx:518–578` | 高階經理人 | 高 |
| Q2 | **手機首屏看不到任何數字。** 7 格導覽、狀態、4 列頂欄、頁首、匯入鈕、期間列表單，就占滿了 844px | `1b-overview-mobile-viewport.png` | 高階經理人 | 高 |
| Q3 | **沒有一句話結論，主次不分。** 5 張 KPI 卡和 7 格輔助指標幾乎同一種樣式，12 個方塊沒有主次；三件事每項 4 行字加 2 顆按鈕 | `overview.tsx:73–106`；`1b-overview-desktop-full.jpg`；`2-top-three-desktop-viewport.png` | 高階經理人 | 高 |
| Q4 | **數字精度與格式混用。** KPI 顯示 7,850,657.90；三件事標題寫「118.8 萬」，同一列卻寫「-1,188,365.10」；負號用 ASCII「-」；件數 7420 沒有千分位；空值有「資料待補／不適用／—／N/A」四種寫法；日期有 `06/01/2026`、`2026-06-01`、`7/13–8/23` 三種格式 | `1b-overview-desktop-viewport.png`；`presentation.ts` 的 formatMoney／formatRate | 三者 | 高 |
| Q5 | **匯出入口分散，名稱重疊。** 頂欄下載選單有 17 個下載項，另有 2 段說明文字（盤點時合稱「19 項」）；商品頁 2 顆、試算頁 3 顆、待辦頁 3 顆、會議頁 5 顆按鈕，同樣叫「下載 Markdown」，範圍卻不一樣；範本列對不齊 | `dashboard.tsx:528–551`、`meeting-page.tsx:305–320`、`actions-workbench.tsx:149`、`decision-workbench.tsx:227`、`product-comparison-panel.tsx:124–128`；`verification/revamp-R6/4-download-menu-desktop-viewport.png` | 專業經理人 | 高 |
| Q6 | **同一件事有多個名字。** 抽屜叫「看證據／怎麼算的／公式與來源」；「待辦」和「行動」混用；「口徑」有三個意思；「資料來源」（頁面）和「來源資料」（抽屜段落）只差字序；錯誤訊息寫「平台費」，指標卻叫「平台抽成」 | `labels` 的 buttons.viewEvidence、sections.evidence；nav.actions、excelExport.sheets；importErrors | 專業經理人、系統執行者 | 中 |
| Q7 | **說明文字過多。** labels 中「注意：」42 處、箭頭字元 23 處（22 個「→」加 1 個「↗」）、否定句（不是／不等於／不代表）63 處；試算每格最多 5 行輔助字；原因、下一步、限制都用 12px 灰字（`.note`） | `labels.zh-TW.ts`（grep 計數）；`decision-workbench.tsx:182–206`；`globals.css:84` | 三者 | 中 |
| Q8 | **視覺沒有系統。** `:root` 只有 6 個變數，全檔卻有 189 種 hex；圓角 18 種（含 0、50%、999px 與複合值）；字級 21 種，其中 12px 出現 125 次；1.7px 字距的英文 eyebrow | `globals.css`；`overview.tsx:109、123、130` | 全體（觀感） | 高 |
| Q9 | **AI 製作感的具體來源。** 英文大寫 eyebrow、卡中套卡、旋轉的空狀態圖示、深綠反白 hero 卡、圈數字、到處的綠點、置中按鈕列、標題用「｜」拼接、頂欄的 AI 能力膠囊 | §5.2 逐條列出 | 全體 | 高 |
| Q10 | **頁面互相重複。** 會議議程把關鍵差額、三件事、通路表、門檻表單整套重畫一次；「示範資料」在畫面上出現 4 次 | `meeting-page.tsx:253–275`；`6-meeting-desktop-viewport.png`；`dashboard.tsx:510、512、518、520` | 高階、專業經理人 | 中 |
| Q11 | **工作流程控制項太密。** 看板卡固定顯示 3 個「移到…」按鈕，展開編輯後有十多個動作；匯入步驟 2 每個標準欄位一個 select（銷售檔 10 個、通路費用 7 個、廣告 4 個）；錯誤訊息沒有固定句型（有的行號在句首、有的在句尾） | `actions-workbench.tsx:40–62、136–137`；`verification/revamp-R3/3-step2-mapping-desktop-viewport.png`；importErrors 的 INVALID_DATE、MISSING_KEY | 專業經理人、系統執行者 | 中 |

### 1.3 問題的根源

v2 的改版重點是「把功能補齊、讓每個數字可追溯」。所以每個元件都自己帶著說明、技術細節、範圍標籤和匯出按鈕。單看每個元件都合理，放在一起就出現三個缺口：

- **沒有資訊層級。** 所有內容都是同樣的白底圓角卡，結論、證據、操作、說明的視覺權重一樣。
- **沒有語言層級。** 給老闆的結論、給主管的解讀、給執行者的公式寫在同一層，字級也一樣。
- **沒有設計 token。** 樣式逐個元件微調，結果就是「看起來像生成的」：相近的灰綠色很多，間距、圓角、字級都不一致。

### 1.4 本輪的解法方向

v3 **不新增財務口徑，也不刪功能**，只做四件事：

1. **重排**：每頁都是「先結論，後證據」。首屏只放結論句、金額和最多 3 件要處理的事。
2. **分層**：同一個畫面讓三種讀者停在不同深度（L1 結論、L2 解讀、L3 依據），不做角色切換。
3. **定規格**：建立 token（色彩、間距、圓角、字級、圖表高度）與元件規格（C1–C23），取代散落的數值。
4. **統一語言**：一個概念一個詞，三層句型，統一數字、日期與標點格式，全部收進 `labels.zh-TW.ts` 和 `presentation.ts`。

### 1.5 不變的東西

- 財務核心禁區：和 v2.0.0 基準（commit `82b70df`，V3-0 打 tag `v2.0.0`）比對，除了 V3-9 核准的「新增」以外，零 diff。
- 隱私與公開站邊界：`APP_MODE=PUBLIC_DEMO`、`ENABLE_LIVE_AI=false`、`/api/insights` 的 server 端封鎖邏輯都不動，不碰 `.env*`。
- 依賴：不新增。瀑布圖、bullet 細條、sparkline 都用既有的 Recharts 3.10.1 或 inline SVG 實作。
- 頁面數與路由：7 頁加上 `#validation`，全部不變。

---

## 2 目標與成功指標（可量測）

### 2.1 目標

| 代號 | 目標 | 對應問題 |
|---|---|---|
| G1 | 老闆 10 秒內說出「本期扣廣告後貢獻多少、比上期多或少多少、最大原因是什麼」 | Q1、Q2、Q3、Q4 |
| G2 | 專業經理人 3 分鐘內找到問題通路與費用項，並建立一筆待辦 | Q3、Q6、Q7 |
| G3 | 系統執行者 10 分鐘內完成含稅 CSV 匯入，並核對一個金額的來源檔名與行號 | Q6、Q7、Q11 |
| G4 | 介面讀起來像專業財務工具，不像 AI 生成的網頁 | Q8、Q9 |
| G5 | 功能零刪減、財務核心零回歸、a11y 與 testid 零退步 | 前提 |

### 2.2 非目標

- 不新增口徑，不改既有指標的輸入輸出，不改 `contribution-v1`。
- 不做 API 串接、雲端同步、帳號、推播或自動寄送。
- 不做 AI 計算金額、健康分數或預測。
- 不追求「更多圖表」。表格是主角，圖表是表格的摘要。
- 不做深色模式，也不換字型（§9.2）。

### 2.3 成功指標

#### A. 使用者層（5 人可用性測試；v2 基準由人工關卡 H1 用同一份腳本先量，V3-0 只備妥腳本、問卷與招募清單，§12.1）

| 指標 | 量測方式 | v2 基準 | v3 目標 |
|---|---|---|---|
| 10 秒結論率 | 開啟已載入示範資料的總覽，10 秒後蓋住畫面，請受試者說出扣廣告後貢獻、差額的方向和金額、第一件事 | H1 量 | 5 人中 ≥ 4 人三項全對 |
| 30 秒試用完成率 | 從正式站首頁開始，到說出上述三項並開啟一次「計算與來源」 | H1 量 | 5 人中 ≥ 4 人在 30 秒內完成 |
| 首個洞察時間 | 從載入示範資料，到第一次正確說出「不利通路＋費用項＋金額」的秒數，取中位數 | H1 量 | ≤ 45 秒，且比 v2 下降 ≥ 40% |
| 各角色任務成功率 | 每個角色 3 項任務（§3.4），記錄不需協助就完成的比率 | H1 量 | 整體 ≥ 90%，任一角色 ≥ 80%，每項任務主持人提示 ≤ 1 次 |
| 專業感與 AI 感（受試者） | 測試後兩題 7 點量表：「看起來像專業財務工具」「看起來像 AI 自動生成」 | H1 量 | 專業感 ≥ 5.5；AI 感 ≤ 3.0 |
| 專業感與 AI 感（盲評） | 3 位外部評審（至少 1 位設計者、1 位電商經理人），分別看 v2、v3 各 4 張截圖（總覽、健檢、抽屜、會議），截圖不標版本、順序隨機；評分錨點用評審自行取得的公開產品文件截圖（例如 §4 的 Shopify、Stripe 文件頁），錨點截圖不放進 repo | H1 量 v2 | v3 的 AI 感中位數比 v2 低 ≥ 2 分 |
| SUS | 標準 10 題 | H1 量 | ≥ 75 |
| 名詞查詢負擔 | 受試者開啟指標定義或 tooltip 的次數，加上口頭問「這是什麼意思」的次數 | H1 量 | 每人全程 ≤ 3 次，沒有人因為看不懂而放棄 |

> 5 人樣本只用來找問題，不當統計證明。受試者至少要有老闆、主管、執行者各 1 位，其中至少 1 位不熟 Excel。H1 與 V3-10（H4）用同一份腳本，最好是同一批人或背景相同的另一批人。

#### B. 工程層（E2E 與靜態掃描，自動化，每批都跑）

| 指標 | 量測 | v2 現況 | v3 目標 | 鎖定批次 |
|---|---|---|---|---|
| 1440×1000 首屏 | E2E `boundingBox`：`snapshot-sentence` 與 5 個 `kpi-*`。量測狀態固定為「新訪客（沒有 F23 改名提示）、示範資料 ready、沒有 C22 橫幅」 | KPI 頂端 y≈400 | 結論句頂端 ≤ 176px；5 個 KPI 底邊 ≤ 420px；`top-three` 第 1 列標題底邊 ≤ 1000px | V3-4 |
| 1280×900 頂欄 | E2E：頂欄高度 | 2 列 | 1 列，高 48px | V3-3 |
| 390×844 首屏 | E2E：`kpi-contribution_after_marketing` 數值頂端（量測狀態同上） | 首屏 0 個數字 | ≤ 360px | V3-3（殼層）、V3-4（總覽） |
| 內容前的可見控制項數 | E2E：`main` 內、第一個 `kpi-*` 之前、可見且可聚焦的元素數。期間列在 `main` 內（同 v2），計入；本期一句話中的金額不做成 number-link（同一金額已在 KPI 帶可點，§7 共通規則的例外），不計入；量測狀態同上 | 約 25（V3-0 依此口徑重量） | 暫定 ≤ 12（依此口徑：匯出本頁 1＋期間列 7＋複製週會摘要 1＋會議連結 1＝10）；V3-0 量到 v2 基準後重算並寫入 `06_BATCHES.md` | V3-3 |
| 執行者匯入路徑 | E2E：從任一頁到匯入精靈步驟 1 的點擊數 | 1（每頁頁首都有按鈕） | ≤ 2（資料狀態按鈕 → 匯入新資料；資料來源頁仍是 1） | V3-3 |
| 寫死色碼 | `scripts/ui-audit.mjs`：`:root` token 定義區以外、加上 `src/components/**/*.tsx` 與 `src/components/**/*.css`（含 `manager-summary.module.css`）的相異 hex | `globals.css` 單檔 189；口徑內合計 201（以 ui-audit 輸出為準） | 棘輪：V3-1 ≤ 60 → V3-3 ≤ 30 → V3-5 ≤ 10 → V3-8 = 0（token 定義區 ≤ 48 個） | V3-8 |
| 圓角值 | 掃描元件規則中相異的 `border-radius` 值 | 18 種 | 4px、6px、999px 三種，外加 0 | V3-1 |
| 字級 | 掃描元件規則中相異的 `font-size` 值（token 定義不計） | 21 種 | ≤ 8 種（12/13/14/16/20/24/28/32），全部透過 `var(--*)` 引用 | V3-1 |
| 字距 | 掃描非 0 的 `letter-spacing` | ≥ 5 處 | 0 | V3-1 |
| labels 文案違規 | `tests/copy-style.test.ts` 掃描 labels 值：「注意：」前綴、→↗▸、圈數字、驚嘆號、全大寫 eyebrow、主層的「｜」、同義詞黑名單 | labels：「注意：」42、箭頭字元 23；JSX：全大寫 eyebrow 3、箭頭 2（JSX 部分由 `design-lint` 掃描文字節點，不由 copy-style 計）；其餘由 V3-0 實測 | 0（`technical` 子樹與 alias 白名單除外） | V3-2 |
| JSX 內硬編碼中文 | 延伸既有的 `tests/labels-coverage.test.ts` 到 `src/components/**/*.tsx` | 有殘留（`overview.tsx:119、151`、`workspace-panels.tsx:34、61`、`scenario-sensitivity.tsx:48、52、53`、`decision-workbench.tsx:168`） | 0 | V3-2 |
| data-testid | `tests/testid-baseline.test.ts` 比對 `verification/revamp-v3/testids-v2.txt`（129 個靜態 testid，加上三元運算式與 `testId` 屬性傳入的 testid，樣板展開成實際渲染值，§11.7） | — | 刪除數 0（新增不限） | V3-0 起每批 |
| 掛載規則 | `tests/mounted-testids.test.tsx`：SSR 渲染各頁，確認搬進 popover、`<details>`、bottom sheet 的 testid 仍在 markup 中，而且 §6.3 列出的 testid 與表單 id 各只出現 1 次（M6） | — | 100% | V3-3 起每批 |
| 版面跳動 | E2E：切換期間前後，圖表容器 `boundingBox().height` 相同；載入、空、錯誤、有資料四種狀態等高 | 不等高 | 高度差 0；CLS < 0.05 | V3-4、V3-8 |

#### C. 品質層

| 指標 | 目標 |
|---|---|
| Lighthouse Accessibility（1440 與 390） | V3-0 對同樣的頁面與狀態（示範資料已載入的 5 頁，1440 與 390）量 v2 基準（v2 只量過空狀態首頁：100）。每批本機 production build 的**硬門檻**：不低於 V3-0 同頁基準，且 ≥ 95；四尺寸 axe 0 個 serious。V3-10 正式站同一門檻 |
| Lighthouse Performance | ≥ 90；建議另加「不低於 V3-0 基準減 3 分」（v2 重測：desktop 100、mobile 93） |
| 色彩對比 | `scripts/contrast-check.mjs`（純 Node）：所有文字 token 在它會出現的每一種底色上都 ≥ 4.5:1；非文字 token（輸入框邊框、焦點框、number-link 底線、圖表線與圖表類別色）≥ 3:1；一律以這支腳本的輸出為準 |
| Golden 測試 | 本期 255.00、差額 −315.00、試算 284.00／264.00／19.70 全部不變 |
| 禁區 diff | `git diff --stat 82b70df -- src/domain fixtures/golden fixtures/demo fixtures/errors fixtures/refund_only fixtures/zero_ad docs/METRICS.md`（或 V3-0 打的 tag `v2.0.0`）：除了 V3-9 白名單內的「新增」以外為空。**不可用 `main` 比對**：`main` 是 `revamp/v2` 的祖先，v2 在 R4 已在 `src/domain` 新增過內容，和 `main` 的 diff 從開工前就不是空的 |
| 匯出與分享使用率 | 上線 4 週內，事件比率（`export_*` ＋ `summary_copied` 事件數）÷（`demo_loaded` ＋ `import_committed` 事件數）≥ 25%。Vercel Web Analytics 只有事件數與訪客數，沒有工作階段層級的關聯，所以不用「工作階段比例」。D-V3-15 補上 `export_csv`、`export_json`；範本下載不計入（只記事件名，不含任何資料內容） |

---

## 3 目標使用者與三層閱讀模式

### 3.1 三種使用者

| | 高階經理人（老闆、總經理） | 專業經理人（行銷、營運主管） | 系統執行者（分析、營運助理） |
|---|---|---|---|
| 要回答的問題 | 本期多賺還是少賺、差多少；錢漏在哪；有沒有要我拍板的事 | 差額來自哪個通路、哪項費用；下一步調什麼；週會前把待辦和試算備好 | 三份 CSV 對不對；哪個檔、第幾行、為什麼被擋、怎麼修；這個數字怎麼來的 |
| 閱讀方式 | 週會投影或用手機掃讀 10–30 秒；會後只看一頁摘要（PDF、PPT） | 在桌機上 15–30 分鐘：掃標題、展開前三列、點數字確認、加待辦、開試算 | 逐列細讀；在匯入精靈、資料來源、抽屜、問題清單之間來回；貼到 Excel 核對 |
| 讀的單位 | 一句話＋一個金額 | 標題＋1–2 句解讀＋可點的數字 | 公式、到分的金額、檔名:行號、原因碼 |
| 停留深度 | L1 | L1＋L2 | L1＋L2＋L3 |
| 主要頁面 | 經營總覽、會議紀錄（一頁摘要） | 通路健檢、商品毛利、假設試算、待辦 | 資料來源、匯入精靈、計算與來源抽屜 |
| 10 秒內要拿到 | 「扣廣告後貢獻 127.0 萬，比上期少賺 59.9 萬；最大一項是折扣多花 118.8 萬」 | 問題在哪個通路和費用項、金額多少、建議的下一步、一句解讀限制 | 位置、問題、修法；某個數字的公式和組成 |
| v2 最大痛點 | 首屏沒有結論，金額顯示到分 | 原因、下一步、限制都是 12px 灰字；名詞混用 | 錯誤訊息句型不一；欄位名和指標名不一致；空值有四種寫法 |

### 3.2 三層閱讀模式

三種讀者看**同一個畫面**，差別只在往下展開多深。**不做角色切換**：切換會讓某些功能在某個模式下看不到，等於變相刪功能，也會讓 E2E 的可見性斷言分岔。

| 層 | 名稱 | 給誰 | 形式 | 介面上的位置 | 字級（§9 token） |
|---|---|---|---|---|---|
| L1 | 結論 | 高階經理人 | 一個 L1 子句最多 14 個中文字（數字、單位、正負號、通路名不計），一定要有金額或比率，只寫事實、不寫原因；金額用萬或億，到小數一位 | 頁面、區塊、列的標題；KPI 大數字；本期一句話 | 標題 16–20px／600；數字 28–32px／600 |
| L2 | 解讀 | 專業經理人 | 1–2 句，合計 ≤ 60 字，每句 ≤ 30 字。第一句寫比較對象與最大來源，第二句用動詞開頭寫下一步；需要時最後加一句限制（次要樣式，不加「注意：」） | 區塊副標、展開列內容、`?` popover、表格 | 14px／400 正文色；限制句 13px 次要色 |
| L3 | 依據 | 系統執行者 | 中文階梯公式、技術公式（英文 key）、到分的組成、檔名:行號、規則代號、原因碼、`contribution-v1`／`assist-kpi-v1`、資料版本 | 「計算與來源」抽屜；各區塊最底的 `<details>` 技術細節；匯出檔 | 13px；代號、檔名、行號用等寬字 |

**規則：**

1. L1 永遠可見。L2 在一次點擊內（展開列、popover、副標）。L3 也在一次點擊內（抽屜、技術細節），不放在主層。
2. **本期一句話是 L1 的複合句**：最多兩個 L1 子句，每個子句 ≤ 14 字，全句 ≤ 40 字（數字、單位、正負號、通路名不計）。這是唯一允許超過 14 字的 L1。
3. 同一列、同一張卡只能有一種金額尺度：L1 用萬，L2 用整數元，L3 到分。
4. labels 中每個可讀單元都有 `headline`／`explain`／`caution?`／`technical?` 欄位。規則卡既有的 title／cause＋nextStep／caution 會延伸到 KPI、區塊標題、錯誤訊息（遷移方式見 §8.10）。

### 3.3 各頁與各匯出格式的層分配

| 畫面或輸出 | L1（首屏或標題） | L2（展開或副標） | L3（抽屜、技術細節） |
|---|---|---|---|
| 頂欄 | 「示範資料 · 資料到 8/24」 | 資料狀態 popover：資料集、問題數、示範站說明 | dataset_id、資料版本 hash、AI 原因碼 |
| 經營總覽 | 本期一句話、5 個 KPI、三件事的標題與影響金額 | 三件事的原因與下一步、圖表副標、其他常用指標表 | 每個數字的抽屜；期間合計與日均的技術細節 |
| 通路健檢 | 計數徽章、健檢列 summary（標題、通路、影響） | 相關數字、可能原因、下一步、限制 | 規則代號、排序金額、hash、fact IDs |
| 商品毛利 | 毛利最差、毛利增加最多的前 10 名 | 完整表、篩選 | 技術細節、商品明細 CSV |
| 假設試算 | 試算結果大字與差額 | 輸入、方案比較表、要賣到多少才划算 | 假設清單、技術公式、版本 |
| 待辦 | 卡片標題、負責人、期限、狀態 | 編輯抽屜的內容與引用的數字 | 引用歷史、技術細節 |
| 會議紀錄 | 一頁摘要（關鍵數字、三件事、決議） | 議程 4–6、與上次比較 | 會議歷史、凍結追蹤、技術細節 |
| 資料來源 | 資料狀態（資料到哪天、問題數） | 每個問題的「位置：問題。修法。」、範圍與金額基準 | SHA-256、版本、前處理、原因碼、欄位對照 |
| PPT、PDF 一頁摘要 | ✔ | ✔ | 附錄頁（假設、備註全文、技術資訊） |
| Excel、Markdown | ✔ | ✔ | ✔（明細工作表、技術段落） |
| CSV、JSON | — | — | 只有 L3：標題列「中文名 (english_key)」（沿用 D11），負號用 ASCII「-」，數值到分 |

### 3.4 可用性測試任務（同時是驗收腳本）

| 角色 | 任務 1 | 任務 2 | 任務 3 |
|---|---|---|---|
| 高階經理人 | 說出本期賺賠與差額 | 說出最大的一個問題與金額 | 複製週會摘要（v2 沒有這個功能，v2 基準改用「找到會議一頁摘要」） |
| 專業經理人 | 找出退款金額比最差的通路 | 從健檢列建立一筆待辦，並填好負責人與期限 | 在貢獻變化拆解中，說出扣最多的兩項 |
| 系統執行者 | 完成一份含稅 CSV 匯入（用 `fixtures` 的含稅範例） | 說出「扣廣告後貢獻」某一筆組成的檔名與行號 | 下載 Excel，並在裡面找到問題清單 |

---

## 4 標竿產品與借鏡原則

> 本節只引用標竿研究時實際讀過的頁面，或 `docs/market-comparison-2026-10-05.md` 已經記錄的內容。標「摘要」的只讀到搜尋摘要，標「引自市場調研」的出自上述文件。**沒有試用任何競品帳號**；UI 細節（例如燈號的實際樣式）屬於推論，設計時以概念為準，不宣稱照抄。

### 4.1 標竿對照表

| 標竿 | URL | 借鏡的做法 | EC ProfitLens 落點 | 刻意不照抄 |
|---|---|---|---|---|
| Shopify Admin Analytics | https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/overview-dashboard ；https://www.shopify.com/blog/new-analytics | 首頁是一組指標卡，每張卡回答一個數字並連到報表；在儀表板層級選擇期間與比較期間（overview-dashboard：可依任何日期範圍監看表現並跨期間比較）；目標與洞察依附在指標上 | KPI 帶每格一個數字；期間只在期間列設定；目標標在 KPI 格內，不另做洞察大卡 | 不做可拖曳、可增刪的卡片牆。預設順序固定，老闆每次看到的內容都一樣 |
| Shopify App Design Guidelines／Polaris | https://shopify.dev/docs/apps/design/layout.md ；https://shopify.dev/docs/apps/design/visual-design.md ；https://shopify.dev/docs/apps/design/content.md ；https://shopify.dev/docs/apps/design/content/grammar-and-mechanics.md ；https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/table.md ；https://shopify.dev/docs/api/app-home/latest/web-components/typography-and-content/number.md | 4px 網格，同一頁只用一種密度；每個容器最多一個主要動作，表格內不用主要按鈕；數字與金額欄右對齊，小螢幕改成清單；語意色只表示狀態，而且不能只靠顏色；最小字級 13px（說明 12px）、對比 4.5:1；一個概念一個詞、按鈕用動詞開頭；寫 12,000 不寫 12 k、範圍用 en dash、不用驚嘆號 | §9 的 token、按鈕與表格規格；§8 的名詞表；§8.5 的 L2、L3 千分位 | 不採用英文 sentence case 規則本身，改寫成中文的對應規則。**L1 用萬／億縮寫是刻意偏離**「不縮寫數字」的建議（理由見 §8.5 規則 9） |
| Stripe Balance summary／Dashboard | https://docs.stripe.com/reports/balance ；https://docs.stripe.com/dashboard/basics | 期初 → 活動 → 期末的對帳結構；點彙總金額可看逐筆明細（僅 Connect 平台帳戶；一般帳戶的依據是每個區段各自 Export／itemized CSV）；每個區段各自匯出；報表只含完整的日子，並說明資料何時齊全；重要通知置頂 | 橋接表改成「上期 → 九項 → 本期」並顯示平衡檢核；所有金額都能開抽屜；區塊標題列放「匯出本頁」捷徑；期間列寫出天數與資料到哪天；總覽頂部只放需要處理的事 | 保留頂欄的集中匯出選單，改成依對象分組 |
| Stripe Apps 設計規範 | https://docs.stripe.com/stripe-apps/patterns/chart-layout ；https://docs.stripe.com/stripe-apps/patterns/empty-state ；https://docs.stripe.com/stripe-apps/style ；https://docs.stripe.com/stripe-apps/design ；https://docs.stripe.com/stripe-apps/patterns/action-buttons ；https://docs.stripe.com/stripe-apps/patterns | 大數字放在圖表上方；sparkline 只表現形狀；圖表高度固定（180／320px），四種狀態等高；空狀態標題說缺什麼、說明每句少於 14 個英文單字（words）、動作和標題對應；間距 token 2/4/8/16/24/32/48；ContextView 抽屜並排；動作按鈕放在標題列 | 圖表高度 token；空狀態規格；「計算與來源」維持右側抽屜；區塊動作放在標題列右側 | 不做 FocusView 以外的全屏 modal |
| Linear | https://linear.app/now/how-we-redesigned-the-linear-ui ；https://linear.app/now/behind-the-latest-design-refresh | 側欄調暗，讓內容在前；「結構應該被感覺到，而不是被看到」；減少強調色、圖示與彩色底 | 側欄改成低對比底色，active 只用左側 2px 線加字重；面板內不再套卡 | 不採用 LCH 自動推導色票，直接手定 hex token |
| Mercury Insights | https://mercury.com/blog/introducing-insights | 總覽快照只放少數健康指標；從指標一路追到交易；從「發生什麼」走到「能做什麼」 | 首屏只放四層口徑與三件事；三件事每項依序寫「發生什麼（數字）→ 為什麼 → 可以怎麼做（加入待辦）」 | 不做自然語言提問 |
| Ramp Reporting | https://ramp.com/reporting | 每張圖都能點，從高峰追到交易；預算對實際 | 圖表點擊開抽屜，並篩到該週或該通路（P1）；目標寫成「實際／目標／差額」 | 不做排程寄送，改成「複製週會摘要」 |
| Brex Reporting | https://brex.com/support/brex-reporting | 頁首的篩選套用到所有元件；可以存成快照 | 期間與通路只在期間列設定；已結束的會議頂部標示「這份紀錄在 {日期} 結束，之後的資料變動不會影響內容。」 | — |
| QuickBooks Online 報表 | https://quickbooks.intuit.com/learn-support/en-us/reports/compare-time-periods-in-reports/00/263054 ；https://quickbooks.intuit.com/learn-support/en-global/help-article/business-reports/transition-classic-modern-view-reports/L9hzVlzh4_ROW_en | 比較期欄位加上 $ 變動（金額）與 % 變動；零餘額帳戶預設隱藏 | 管理損益表檢視（P1）的差額與差額 % 欄；零值列預設隱藏（F9）。（顏色依「對貢獻有利或不利」決定的 `favorableDirection` 是 EC ProfitLens 依 Few 與自身口徑做的決定，見 B7，不歸給 QuickBooks） | 不做樞紐式自訂欄位 |
| GA4 Comparisons／Amplitude | https://support.google.com/analytics/answer/9269518 ；https://amplitude.com/docs/analytics/dashboard-preferences.md | 每組比較有顏色標示；報表不支援某個比較條件時保留空白卡；圖頂部放 takeaway metrics；同一份資料可以切換圖、表、KPI | 本期用強調色、比較期用中性灰，全站固定（「固定顏色」是 EC ProfitLens 的延伸）；去年同期不可用時保留位置並寫出原因（「寫出原因」是 EC ProfitLens 的延伸）；趨勢圖頂部顯示期間合計與最近完整週 | 不做 5 組比較 |
| Vercel Dashboard／Geist | https://vercel.com/changelog/dashboard-navigation-redesign-rollout ；https://vercel.com/geist/introduction ；https://vercel.com/geist/colors.md ；https://vercel.com/geist/typography.md ；https://vercel.com/geist/empty-state.md | 導覽依工作流程排序，手機用底部列；色階每一階有固定用途，頁面背景只有兩種；數字用 tabular，mono 字型只給代碼；空狀態最多一個主要 CTA，動作用「動詞＋名詞」 | 手機底部分頁列；中性色 token 用途表；全站 tabular-nums；檔名與行號用等寬字；空狀態按鈕「載入示範資料」「匯入資料」 | 不採用 Geist 字型（不加字型）；不做可調寬側欄 |
| StoreHero | https://storehero.ai/ ；https://apps.shopify.com/storehero-profit-analytics | 快照式的晨會摘要；目標以紅綠燈（兩態）顯示達成與偏離；把 ROAS 改善被下游吃掉的過程拆開 | 本週快照與「複製週會摘要」；目標達成只在使用者設定目標時出現（「只在偏離時上色」與三態是 EC ProfitLens 依 Few 色彩預算的取捨，不歸給 StoreHero）；橋接標題寫結論句 | 不做預測、季節基準、預算建議 |
| MarginStack | https://apps.shopify.com/marginstack | 毛利漂移與弱勢通路警示，附建議動作 | 健檢列附「下一步」與「加入待辦」 | **反例**：不做 Health Score，改用「資料待補 N · 不利 N · 有利 N」的計數 |
| Lifetimely | https://apps.shopify.com/lifetimely-lifetime-value-and-profit-analytics | 提供每日 P&L（含貢獻毛利） | 每日／每週管理損益表（P1，收合在進階區） | 不做 LTV、cohort（D6 已延到 Phase 2） |
| Triple Whale Summary（讀取回 403，內容取自搜尋摘要） | https://kb.triplewhale.com/en/articles/5725275-track-kpis-with-the-summary-dashboard | tile 可以切換成表格；可置頂指標 | 圖／表雙檢視 | **反例**：不依資料來源分區。EC ProfitLens 只有三份 CSV，應該依四層口徑分區 |
| Polar Analytics | https://polaranalytics.com/business-intelligence | 用語意層統一指標定義 | `metricDefinitions`＋labels：UI、匯出、抽屜都用同一個名稱和同一句定義 | 不做依職能切換的預建儀表板 |
| Daasity（引自市場調研 §4） | https://help.daasity.com/core-concepts/contribution-margin | CM1／CM2 分層命名 | 在指標定義對話框附「業界說法對照」並寫明差異 | 不宣稱口徑等同 |
| Net Net（引自市場調研 §4、§10） | https://apps.shopify.com/netnet | 從毛利到貢獻毛利再到淨利的利潤瀑布 | 「本期利潤結構」四層瀑布（F2），停在扣廣告後貢獻 | 不畫到淨利 |
| CYBERBIZ（引自市場調研 §8-4、§10） | https://help.cyberbiz.io/ec/business-intelligence/revenue-analysis/ | 本期、去年同期、上一期三線比較 | 週趨勢三線（F8，P1） | — |
| IBM Carbon | https://www.carbondesignsystem.com/building-blocks/data-visualization/dashboards ；https://www.carbondesignsystem.com/building-blocks/data-visualization/axes-and-labels ；https://www.carbondesignsystem.com/building-blocks/data-visualization/color-palettes ；https://www.carbondesignsystem.com/building-blocks/data-visualization/chart-anatomy ；https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines | 依重要性決定對比與面積；長條從 0 開始，缺資料不內插；圖表標題寫洞察；類別色依固定序列使用，狀態色另成一組；表格列高 24/32/40/48/64；工具列最多 5 個動作 | 圖表規格；通路類別色最多 4 個（EC ProfitLens 依示範資料通路數與色彩預算自訂的上限，不是 Carbon 的規範）；表格列高 40px（精簡模式 32px）；工具列 ≤ 5 個控制 | 不用漸層 |
| Atlassian Design System | https://atlassian.design/llms-content.txt ；https://atlassian.design/llms-components.txt | 寫「10 項中 6 項」；空狀態依情境寫；Lozenge 表示狀態、Badge 表示計數；顏色一定搭配文字 | 狀態標籤（C8 Lozenge）與計數徽章（C8 Badge）分成兩種元件 | — |
| Apple HIG Charts | https://developer.apple.com/design/human-interface-guidelines/charts | 用標題與副標總結主要訊息；不要求互動才看得到關鍵資訊；長條以 0 為下限 | 每張圖的副標是由資料組成的結論句，同時當 aria 描述；關鍵值直接標在圖上或表格裡 | — |
| Material Design m1 Data tables | https://m1.material.io/components/data-tables.html | 數字欄右對齊，欄頭跟著對齊；預設依重要欄位排序，並顯示排序圖示 | 通路表預設依扣廣告後貢獻由低到高排序；`aria-sort` 與圖示同步 | 不採用 48dp 列高，改用 40px |
| Microsoft Style Guide | https://learn.microsoft.com/en-us/style-guide/checklists/numbers-checklist | 數字的一致寫法與千分位；UI 中避免用 K、M、B 縮寫（除非空間有限） | §8.5 的 L2、L3 千分位、§8.7 標點 | L1 用萬／億是刻意偏離（§8.5 規則 9），不以本來源為依據 |
| Stephen Few／Edward Tufte | https://blogs.ischool.berkeley.edu/i247s13/files/2013/02/WhyMostDashboardsFail.pdf ；https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/ | 概覽 → 找出要注意的 → 深入 → 行動；沒有比較基準的數字沒有意義；只用灰階加一個警示色；用 bullet graph 取代 gauge；sparkline 是字詞大小的圖 | 資訊架構順序；KPI 一定附上期；色彩預算；目標用細橫條；通路表「近 8 週」sparkline（P2） | — |
| 台灣財報慣例 | https://mopsov.twse.com.tw/nas/t21/sii/t21sc03_115_8_0.html ；星展銀行台北分行綜合損益表（格式二）PDF：<https://www.dbs.com.tw/iwov-resources/pdf/legal%20disclaimers%20and%20announcements/04_taipei%20branch/01_financial%20and%20business%20information/%28BR%29Internet%20Report_2023Q2.pdf> ；https://www.ctee.com.tw/news/20260206701669-430301 ；https://www.managertoday.com.tw/columns/view/57380 | 分開標明來源：MOPS 月營收表是本期與比較期並列（當月、上月、去年當月）、只有增減 % 欄（沒有金額差額欄）、有備註欄，單位千元、負數用「-」；DBS 損益表是版頭三行、單位標在右上、金額與 % 成對、負數用括號；IFRS 18 要求自訂績效指標說明算法；報表要有高度、深度、熱度 | 管理損益表與匯出版頭（§7.9）；抽屜與匯出附「指標定義與算法（contribution-v1）」段落；三件事依序寫異常、原因與金額、建議；列印與 Excel 的管理損益表用括號（D-V3-8） | 零值不用「-」（理由見 §8.5） |

### 4.2 借鏡原則（從標竿歸納，作為第 5、9 節的依據）

| # | 原則 | 主要來源 | 在本 PRD 的落點 |
|---|---|---|---|
| B1 | **先給答案，再給證據**：結論句 → 關鍵數字 → 圖或表 → 計算與來源 | Stripe chart layout、Apple HIG、Carbon、Mercury | §3.2、§7 每頁版面 |
| B2 | **順著「概覽 → 要注意的 → 深入 → 行動」排列** | Few、Ramp、Stripe Balance | §6.1 導覽分組 |
| B3 | **表格是主角，圖表是表格的摘要**，每張圖都有對應的表 | Stripe Balance、QuickBooks、MOPS、Amplitude | §7.1、§9.4 C16 |
| B4 | **色彩預算**：中性灰階＋一個強調色＋只用於狀態的語意色 | Few、Linear、Shopify、Carbon | §9.1 |
| B5 | **結構靠對齊與留白**，不靠框線和底色 | Linear、Shopify layout | §5.2 X8、§9.4 C4／C5 |
| B6 | **用 token 取代隨意數值** | Stripe style、Shopify、Carbon、Geist | §9 |
| B7 | **有利或不利依對貢獻的影響判斷**，不依數學正負號 | Few（只讓需要注意的項目上色）；EC ProfitLens 口徑本身（費用增加會讓扣廣告後貢獻減少） | §8.5 `favorableDirection` |
| B8 | **白話但精確**：一個概念一個詞，不用行銷語氣 | Shopify content、Atlassian、Stripe empty state | §8 |
| B9 | **沿用台灣財報的格式語法** | MOPS（本期與比較期並列、% 增減、備註欄）、DBS（版頭、單位右上、金額與 % 成對、括號負數）、IFRS 18；差額（金額）欄另依 QuickBooks $ change | §7.9 匯出版頭、§8.5、§9.4 欄序 |
| B10 | **漸進揭露**：抽屜、可展開列、`<details>` | Stripe ContextView、Carbon、QuickBooks | §3.2、§6.4 掛載規則 |
| B11 | **用計數與目標比較，取代分數與 gauge** | Few、MarginStack 反例 | §7.2、§10 |
| B12 | **版面穩定**：固定高度、四種狀態等高、期間只在一處設定 | Stripe chart layout、Brex | §9.3、§9.4 C16 |

### 4.3 刻意不採用

- 依資料來源分區的 tile 牆（Triple Whale；搜尋摘要，未讀到原頁）：EC ProfitLens 自己的設計理由是只有三份 CSV，應依四層口徑與決策層級分區。
- 健康分數、gauge、整排紅綠燈（MarginStack 的 Health Score）。
- 置中的 AI 聊天框、「智慧洞察」區塊。
- 置中的 hero 空狀態與插圖。
- 角色切換或依職能預建的多套儀表板（Polar）。這會讓功能在某個角色下消失。

---

## 5 設計原則與「去 AI 製作感」規範

### 5.1 八條設計原則（每批驗收都要逐條勾）

| # | 原則 | 可檢查的做法 | 依據 |
|---|---|---|---|
| D-1 | **每頁先結論後證據** | 每頁第一個區塊是 L1 結論（句子或數字），不是表單、說明或篩選 | Stripe chart layout（https://docs.stripe.com/stripe-apps/patterns/chart-layout ）、Apple HIG Charts（https://developer.apple.com/design/human-interface-guidelines/charts ） |
| D-2 | **一個容器一個主要動作** | 每個容器最多一顆實心主要按鈕；表格內只用次要或文字按鈕；頂欄不放主要按鈕 | Shopify layout（https://shopify.dev/docs/apps/design/layout.md ） |
| D-3 | **一層容器** | `.panel` 內不能再有帶邊框或底色的子容器；只有可獨立移動的物件（看板卡、抽屜、popover、對話框）可以用卡片 | Linear（https://linear.app/now/how-we-redesigned-the-linear-ui ） |
| D-4 | **色彩只表達狀態** | 強調色只用於目前狀態、焦點、主要按鈕、本期資料；不利色只用於不利金額與錯誤；其他一律用中性色 | Few（https://blogs.ischool.berkeley.edu/i247s13/files/2013/02/WhyMostDashboardsFail.pdf ）、Carbon color（https://www.carbondesignsystem.com/building-blocks/data-visualization/color-palettes ） |
| D-5 | **數字是排版的主角** | 全站 tabular-nums；金額欄（含欄頭）右對齊；同一列只有一種尺度 | Polaris table（https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/table.md ）、Material（https://m1.material.io/components/data-tables.html ） |
| D-6 | **說明集中三處** | 說明只能放在 `?` popover、指標定義對話框、計算與來源抽屜；畫面上只留會改變判讀的警示（例如資料待補） | Shopify content（https://shopify.dev/docs/apps/design/content.md ） |
| D-7 | **版面穩定** | 圖表容器固定高度；載入、空、錯誤、有資料四種狀態等高；期間只在期間列設定 | Stripe chart layout、Brex（https://brex.com/support/brex-reporting ） |
| D-8 | **保留結構，換外觀** | `<details>/<summary>`、`role="status"`、`aria-*`、`data-testid`、`#main-content`、`.data-alternative`、`.table-scroll` 一律保留；搬移時一起搬；搬進 popover 的內容仍要保持掛載（§6.4） | CLAUDE.md 硬規則 |

### 5.2 禁止與替代清單（X1–X25）

「自動檢查」欄由兩支新增測試執行（§5.4）：`tests/design-lint.test.ts` 管 CSS 與 JSX，`tests/copy-style.test.ts` 管 labels。另有 `scripts/ui-audit.mjs` 輸出基準數字。

| # | 禁止 | v2 證據 | 替代做法 | 自動檢查 |
|---|---|---|---|---|
| X1 | 中文標題上方疊英文全大寫 eyebrow（TREND、CONTRIBUTION BRIDGE、CHANNEL MIX） | `overview.tsx:109、123、130` | 刪除，只留中文區塊標題（16px／600） | JSX 與 labels 不得出現 `/^[A-Z ]{4,}$/` 字串 |
| X2 | 每頁 h1 上方重複品牌副標「營運決策工作台」 | `dashboard.tsx:554` | 刪除。頁首只留 h1 和選填的一行描述；品牌副標只出現在 `<title>` 與 SEO meta | E2E：`.page-heading .eyebrow` 數量為 0 |
| X3 | 抽屜 eyebrow 與標題重複同一個詞；標題用「｜」拼接多段資訊 | `evidence-drawer.tsx:152–153`；`import-wizard/index.tsx:98`；aiLabel | 主標題＋一行副標，或改用 stepper | labels 主層值不得含「｜」（`technical` 子樹除外） |
| X4 | 行銷式置中空狀態：旋轉的圖示方塊、問句大標、箭頭 CTA、1-2-3 步驟列 | `dashboard.tsx:580`；`globals.css:151–156`（rotate(-4deg)、radius 24px、padding 65px）；`0-landing-desktop-viewport.png` | 左對齊的工作區空狀態（§7.10） | 裝飾性 `rotate(`（例如 `.empty-illustration` 的 rotate(-4deg)）為 0；有功能的 rotate 除外：`@keyframes spin`（spinner，`globals.css:200`）與 disclosure 指示 `.diagnosis-summary::before`（`globals.css:585–586`） |
| X5 | 文案與按鈕裡的箭頭字元（→ ↗ ▸ ▾） | labels 23 處（22 個「→」加 1 個「↗」）；JSX：`dashboard.tsx:586`、`meeting-page.tsx:93` | 直接用文字（「查看 3 項資料問題」）；展開與外部連結用 SVG icon；「上期到本期」用文字寫出來 | labels 主層值不得含 `→↗▸▾`（copy-style）；JSX 文字節點不得含 `→↗▸▾`（design-lint） |
| X6 | 裝飾性綠點、active 雙重標記、「● 未保存」 | `dashboard.tsx:511、512、520`；status.unsaved | 只有資料狀態保留狀態點；導覽 active 用左側 2px 線；「未保存」用文字 | V3-1 先把 `.nav-dot`、`.green-dot` 的樣式中性化（JSX 不動）；V3-3 殼層重排時刪除 JSX（`dashboard.tsx:511、512、520`）與 class，之後 CSS 與 JSX 都不得有這兩個 class |
| X7 | 單一鼠尾草綠色調加上 189 個寫死的近似色；圖表色寫死在元件裡 | `globals.css`；`overview.tsx:113–131` | 使用 §9 的 token；圖表色從 CSS 變數讀取 | `:root` 以外的 hex 依棘輪下降到 0；`src/components` 內 hex 為 0 |
| X8 | 一切皆卡、卡中套卡 | `.panel` 內的 `.metric-strip`、`.fact-list`、`.bridge-summary`、`.channel-summaries`；三件事每項都是邊框卡；方案卡內有灰底範本卡 | 一層容器，子區塊用區段標題加 1px 分隔線；清單用列，不用卡 | 掃描巢狀選擇器 `.panel .panel`、`.panel [class*=card]`（看板卡除外）為 0；另做截圖審查 |
| X9 | 不同性質的指標用同一款格子（KPI 5 卡與輔助指標 7 格同樣式） | `overview.tsx:74–104` | 財務核心用「KPI 帶」（C1），其他常用指標用兩欄緊湊表（C2） | 人工審查加截圖 |
| X10 | 深色反白的 hero KPI 卡 | `globals.css:98–105`（`.kpi-card.featured` #244b43） | 用位置、字級（32px）和頂部 2px 強調線來強調 | `.featured` 的背景只能是 `--bg-surface` |
| X11 | 每個控制項下面都掛說明與「注意：」 | labels 中的 trendNote、bridgeNote、periodNote、partialNote、impactLegend、presetHint、assist.intro、kpiHint | 依 D-6，說明集中三處；每個區塊的限制句最多一句 | labels 中「注意：」為 0；元件內常駐說明 ≤ 1 行 |
| X12 | 標題層級與字級不一致（區塊 h2 有 14px 也有 19px） | `.section-heading.compact h2` 14px（`globals.css:83`）與全域 `h2` 19px（`globals.css:17`）並存 | 全站區塊標題統一為 16px／600 | 字級種類 ≤ 8 |
| X13 | 標籤膠囊過量、資訊重複（範圍在每項和區塊各掛一次；「自動健檢」和「6 項」兩個 tag） | `2-top-three-desktop-viewport.png`；`verification/revamp-R5/1-diagnosis-list-desktop-viewport.png` | 範圍只在區塊標題列標一次；單項範圍和區塊不同時才標；計數併入標題 | E2E：區塊內範圍文字只出現 1 次 |
| X14 | 用 Unicode 字元當圖示（①–⑥、★☆、ⓘ、●） | labels:1763；`actions-workbench.tsx:133`；`dashboard.tsx:521` | 議程用 `<ol>`；置頂、資訊用既有 SVG `Icon` 元件（新增 pin、info 圖形） | labels 與 JSX 不得含 `①–⑳★☆ⓘ●` |
| X15 | 置中的按鈕列 | `globals.css:62`（`.button-row` 用 justify-content:center） | 表單動作靠左，主要按鈕在前；區塊動作放在標題列右側 | `.button-row` 不得置中 |
| X16 | 頂欄自我宣傳的 AI 能力膠囊 | aiLabel「自動健檢可用｜AI 解釋未啟用（公開版）」，是頂欄最寬的元素 | 頂欄只放 12px 文字「AI 未啟用」，細節放進 popover | E2E：`ai-availability` 寬度 ≤ 120px |
| X17 | 摘要層的財務數字顯示到小數兩位 | 7,850,657.90；會議頁 36px 大字 +1,709,082.18 | §8.5 三層尺度 | format 單元測試；E2E 抽樣 KPI 文字格式 |
| X18 | 貢獻橋接用分歧長條 | `overview.tsx:126`（BarChart layout=vertical） | 瀑布圖並列橋接表（C17） | E2E：`bridge-waterfall` 存在 |
| X19 | labels 中整塊「由盤點產生」的區段，元件內再用 split 繞道取字 | labels:561；`dashboard.tsx:58–60`；`multi-scenario-workbench.tsx:14–15` | 依頁面與元件重整 labels 結構（§8.10）；刪除 split 繞道 | grep：對 labels 值呼叫 `.split(` 的次數為 0 |
| X20 | 健康分數、圓形 gauge、滿版紅綠燈 | v2 沒有，列為預防 | 改用計數與細橫條（C18） | 設計審查 |
| X21 | 「智慧洞察」「我們發現」「讓我們一起看看」、驚嘆號、表情符號、「立即體驗」「開始吧」「一鍵」 | 預防；空狀態問句「營收漲了，到底多賺還是少賺？」 | 中性陳述句；按鈕用「動詞＋名詞」 | copy-style 的黑名單詞為 0 |
| X22 | 中文標題負字距、eyebrow 正字距 | `h1` −.6px、`.eyebrow` 1.7px、`.brand small` 1.8px、`.tiny-tag` .6px | letter-spacing 一律 0 | 非 0 的 letter-spacing 為 0 |
| X23 | 數字置中、比例數字、金額欄頭靠左 | 部分 `th` 沒有對齊 | tabular-nums；金額與 % 欄（含欄頭）右對齊 | `td, th, .num` 預設套 tabular-nums；E2E 抽樣 `text-align` |
| X24 | 切換期間時版面跳動；骨架、空狀態、圖表高度不同 | 空狀態 padding 65px；骨架高度與實際元件不同 | 圖表與骨架、空、錯誤共用同一個高度 token（C16） | E2E：切換前後 `boundingBox().height` 相同 |
| X25 | 破壞性動作和資訊文字用同一種樣式並排 | 頂欄「清空」（`dashboard.tsx:518`） | 移到儲存選單的「危險區」，用危險樣式，保留確認 dialog | E2E：頂欄不再有 clear-button；`ReplacementDialog` 流程不變 |

### 5.3 允許保留的「個性」

- 品牌標 `.brand-mark`（長條圖 icon），24×24，只出現在頂欄左側。
- 強調色沿用品牌深綠 `#1f5a4f`，但只用在主要按鈕、焦點、目前位置和本期資料系列（D-V3-9）。
- 「本期三件事」這個名稱：老闆已經熟悉，保留。
- 「每個數字都能點開看來源」的 number-link 虛線底線，這是產品的識別，保留並 token 化。

### 5.4 自動檢查的落實

新增三支檔案，都不加依賴：

- `tests/design-lint.test.ts`（vitest）：讀 `globals.css`、`src/components/**/*.tsx` 和 `src/components/**/*.css`（CSS module，例如 `manager-summary.module.css`），統計 `:root` 以外的 hex、相異圓角、相異字級、非 0 字距、裝飾性 `rotate(`（X4 的例外除外）、JSX 文字節點中的箭頭字元與全大寫 eyebrow、`.button-row` 置中、巢狀卡片選擇器、`linear-gradient`，以及 `--shadow-overlay` 以外的 box-shadow。採**棘輪制**：上限記在 `tests/fixtures/design-lint-ceiling.json`，V3-0 以 `scripts/ui-audit.mjs` 實測的 v2 數值當初始上限（以腳本為準，不用本文件的手數值）。之後每批只能下降，依 §2.3 B 的時程達標。
- `tests/copy-style.test.ts`（vitest，**只掃 labels 值，不渲染頁面**）：遍歷 labels 所有值，檢查「注意：」、箭頭、圈數字、驚嘆號、全大寫 eyebrow、主層的「｜」、同義詞黑名單（§8.4）、`{}` 占位符一致性，以及 L1 子句長度（去掉數字、單位、通路 alias 後的 CJK 字數）。L3 技術字串放在 `labels.*.technical` 子樹，舊名放在 `basis.aliases`，兩者列入白名單。
- `scripts/ui-audit.mjs`（純 Node）：輸出 JSON 基準（hex、圓角、字級、字距、「注意：」、箭頭、JSX 中文、testid 數、相異 class 數），掃描範圍與 design-lint 相同（含 `src/components/**/*.css`），寫入每批的驗收文件。

**與既有測試的關係**：

- `tests/copy-density.test.ts` 已經限制總覽、健檢、試算三頁主層（不含收合的 `<details>`，含展開的 `<details>`）每頁的否定句 ≤ 3；計數用的正規式是 `/不是|不代表|不等於|不可/`，並以 `RULE_CAUTIONS` 排除規則卡的 caution 句。頁面層的否定句計數**只由 copy-density 負責**（SSR 渲染頁面），copy-style 不重複：V3-2 在 copy-density 內把同樣的計數與上限 3 延伸到會議、資料來源兩頁，沿用 `withoutDetails()`。上限維持 3，不另訂更嚴的數字（§8.4 規則 2）。健檢前 3 列維持預設展開，所以計數口徑不變。
- `tests/labels-coverage.test.ts` 延伸到所有 `src/components/**/*.tsx`，並禁止 JSX 中出現 CJK 字元。

---

## 6 資訊架構（含功能對照表：逐項確認不砍）

### 6.1 全站結構

```
頂欄（48px，單列，1280 寬不折行）
 ├ 左：brand-mark＋EC ProfitLens 字標
 └ 右：資料狀態按鈕「示範資料 · 資料到 8/24」｜AI 未啟用｜指標定義（icon）｜儲存（未保存）｜匯出
側欄（220px，桌機；≤ 767px 改成底部分頁列）
 ├ 看結果：經營總覽
 ├ 找原因：通路健檢（計數徽章）、商品毛利
 ├ 做決定：假設試算、待辦、會議紀錄（草稿時顯示狀態標籤）
 ├ 管資料：資料來源（有問題時顯示計數徽章）
 └（只在 #validation 時出現，位於分隔線下）開發者：開發者驗證
頁首（56px）：h1＋選填的一行描述＋右側本頁動作（最多 1 個主要按鈕，以及「匯出本頁」）
期間列（48px，sticky）：通路 ▾｜快捷分段鈕｜期間摘要文字｜自訂期間 ▾
需要處理橫幅（只在需要時出現，40px）：資料待補／篩選錯誤／去年同期不可用的理由
頁面內容（max-width 1440px）
頁尾：一句口徑說明＋［指標定義］＋新台幣 · 台北時間＋（正式站）使用分析揭露
浮層：計算與來源抽屜、待辦編輯抽屜（新）、指標定義對話框、取代資料確認、首次保存提示、列印 portal、手機 bottom sheet
```

（圖中的 ▾ 只是示意，實作一律用 SVG chevron。）

**頁面順序維持 v2**：總覽、健檢、商品、試算、待辦、會議、資料，只加上分組標題，這樣可以減少導覽相關的 E2E 改動。分組名稱需要拍板（D-V3-14）。

### 6.2 頁內順序規則

每頁由上到下固定是：**L1 結論區 → 需要處理的事 → 主要證據（表或圖）→ 次要證據 → 收合的進階與技術細節 → 頁面層級的輸出**。各頁怎麼套用，見第 7 節。

### 6.3 功能對照表（現有功能 → 改版後位置）

**本表涵蓋 UI 盤點 `feature_inventory_to_preserve` 的每一項功能，另加兩列本機儲存項目。v3 沒有移除任何一項功能：每一列的變更類型都只能是保留、搬移、合併、收合、改名之一或其組合，沒有「刪除」。**

變更類型定義：

- **保留**：功能、行為與位置不變，只換成 token 樣式。
- **搬移**：位置或在頁內的順序改變。
- **合併**：和其他入口共用同一個元件或同一份 state。原有入口與 testid 都保留。
- **收合**：改成預設收起，展開後內容不變，而且保持掛載（§6.4）。
- **改名**：只改 labels 文字。

| # | 現有功能 | 現在位置 | 改版後位置 | 變更類型（保留／搬移／合併／收合／改名） | testid／錨點 |
|---|---|---|---|---|---|
| 1 | 跳至主要內容；切頁時捲到頂，並把焦點移到 main | `dashboard.tsx:507、192–197` | 不變 | 保留 | `#main-content`（tabIndex=-1）、`.skip-link` |
| 2 | 側欄 7 項導覽（aria-current） | `dashboard.tsx:48–53、511` | 側欄分 4 組；≤ 767px 改成底部分頁列（總覽、健檢、待辦、會議、更多） | 搬移＋改名（「待辦與決議」改「待辦」，D-V3-4） | 桌機側欄 `nav[aria-label=主要導覽]`；手機底部列依 M6 二選一：只渲染其中一個 nav，或手機列改用不同的 aria-label（例如「手機導覽」）；`aria-current=page`；新增 `nav-group-{id}`、`mobile-tabbar` |
| 3 | #validation 開發者驗證頁（hashchange），含資料集選擇（示範、golden、missing-cogs、missing-ad、duplicate 等 5 個）與「載入」 | `dashboard.tsx:54–57、155–168、555–561` | 桌機：側欄最底的「開發者」分組，只在 #validation 時出現；手機：底部分頁列「更多」面板的「開發者驗證」項目，同樣只在 #validation 時出現（§7.0）。資料集選擇與載入不變 | 搬移 | `validation-panel`；390×844 E2E 驗證離開驗證頁後可以從「更多」回來 |
| 4 | 品牌字標與副標 | 側欄頂 | 頂欄左側字標；副標「營運決策工作台」只出現在 `<title>` 與 SEO meta | 搬移 | `.brand-mark` |
| 5 | 「我的工作區」標籤與資料來源小徽章 | 側欄 | 併入頂欄資料狀態按鈕 | 合併 | 新增 `data-status` |
| 6 | 側欄註記（示範資料警語） | `dashboard.tsx:512` | 資料狀態 popover 第一行「示範資料（虛構）」 | 合併 | `data-status-popover` |
| 7 | 頁尾「新臺幣 · 臺北時間」 | 側欄底 | 全站頁尾「新台幣 · 台北時間」 | 搬移＋改名（D-V3-6） | — |
| 8 | 麵包屑「工作區 / 頁名」 | 頂欄 | 由 h1 承擔；頁名同時由導覽的 `aria-current` 傳達 | 合併 | h1 |
| 9 | 資料狀態列（ready／partial／loading／error／empty；role=status、aria-live；資料集名、資料到） | `dashboard.tsx:518` | 頂欄資料狀態按鈕，文字為「示範資料 · 資料到 8/24」；popover 顯示資料集、資料到、問題數，並提供「前往資料來源」「匯入新資料」 | 搬移＋改名（「資料就緒」改「資料到 {date}」） | `workspace-status`（role=status 放在按鈕文字上） |
| 10 | 清空工作區，經過取代確認 dialog（先保存、放棄並繼續、取消、下載備份、存本機並繼續、確認已下載） | `dashboard.tsx:518` 的 clear-button | 儲存選單最底的「危險區」：「清空目前資料」 | 搬移 | `ReplacementDialog` 全部按鈕 |
| 11 | 模式徽章（公開示範版／示範資料／本機匯入） | `dashboard.tsx:520` | 資料狀態 popover：「公開示範站：計算都在你的瀏覽器完成，沒有使用 AI。」 | 合併＋改名 | `data-status-popover` |
| 12 | 口徑說明 dialog（頂欄、頁尾、抽屜三個入口） | `basis-dialog.tsx` | 改名「指標定義」，新增搜尋與名詞小辭典（舊名也搜得到）；三個入口都保留 | 改名 | `basis-dialog`；新增 `glossary-search` |
| 13 | AI 可用性標籤與 popover（Esc、外部點擊、回焦） | `dashboard.tsx:198–215、522–525` | 頂欄 12px 文字「AI 未啟用」，點開既有 popover（內容改寫） | 保留＋改名 | `ai-availability`（role=status、aria-live）、`#ai-availability-detail` |
| 14 | 儲存選單（下載備份、選檔、讀取本機副本預覽、同意、自動保存、取代確認、存本機、刪除、確認已下載、還原預覽、技術細節、未保存標籤） | `workspace-storage.tsx:213–252` | 依序分三段：**本機保存**（同意 checkbox、自動保存開關（同意後才出現，同 v2）、「存在這台電腦」、上次保存時間、「讀取本機副本預覽」（讀 IndexedDB，緊接在 `autosave-replace-warning` 旁））／**備份檔**（下載、選取、還原預覽、確認已下載（條件出現）、備份內容的技術細節 `<details>`）／**危險區**（刪除本機資料、清空目前資料）。同意與自動保存維持兩個控制；若要依 D7 合併成一個，要另列為「合併」並說明 `autosave-toggle` 的掛載條件。`feature-retention.csv` 逐個控制列出 | 保留（內部重排） | `workspace-storage`、`autosave-toggle`、`autosave-replace-warning`、`autosave-confirm-replace`、`autosave-status`、`storage-notice` |
| 15 | 首次本機保存提示、自動保存失敗提示 | `workspace-storage.tsx:254–268` | 位置不變（右下角、非 modal），文案改寫 | 保留＋改名 | `local-save-prompt`、`local-save-replace-warning`、`local-save-announce`、`autosave-error` |
| 16 | 下載選單（17 個下載項，含預載 Excel writer） | `dashboard.tsx:388–432、528–551` | 改名「匯出」，依對象分組（§6.5）。頂欄選單只放和頁面 state 無關的項目。各頁的「匯出本頁」是**頁內下拉選單**，直接呼叫該頁 v2 既有的 handler，保留頁面 state（商品篩選、排序）與會議範圍；不會開啟頂欄選單 | 改名 | `download-menu`、`download-meeting-section`、`download-templates`；新增 `export-page-{page}` |
| 17 | 頂欄選單 Esc 關閉並回焦、外部點擊關閉 | `dashboard.tsx:198–215` | 所有頂欄 popover 共用 | 保留 | `.topbar-menu.auto-close` |
| 18 | 期間列：通路、5 個快捷（aria-pressed，aria-disabled＋理由）、比較方式、4 個日期、套用；sticky | `dashboard.tsx:334–349、564–578` | 單列：通路 ▾｜快捷分段鈕｜期間摘要｜「自訂期間」popover（比較方式、4 個日期、套用）；手機改成一顆按鈕，點開底部面板。桌機與手機是同一份 DOM，只用 CSS 重新定位，日期欄位 id 只有一份（M6） | 收合 | `preset-reason-visible-yoy`、`#previous-start`、`#previous-end`、`#current-start`、`#current-end`；新增 `period-summary`、`period-custom` |
| 19 | 「目前範圍：…」整行範圍說明（含通路別名、比較方式、資料到） | labels 的 scopeNote | 併入期間列的期間摘要文字。可見文字只寫期間與天數；通路名稱由期間列的通路 select 顯示，比較方式（等天數或整月）與完整範圍字串放在 `period-summary` 的 title 與 sr-only 文字。`.scope-note` class 因此不保留，相關的 locator 斷言（revamp-r1-layout、revamp-r2-copy、period-comparison、manager-presentation 等 spec）在 V3-3 同批改成 `period-summary` testid，並改寫 revamp-r2-copy.spec.ts:77 對通路別名的斷言（改斷言 sr-only 文字或通路 select） | 合併 | `period-summary` |
| 20 | 篩選錯誤 alert；partial 黃條加「看 n 項資料問題」 | `dashboard.tsx:576–578` | 期間列下方的「需要處理橫幅」固定位置，只在需要時出現 | 保留＋改名 | role=alert 保留 |
| 21 | 空狀態、載入骨架（aria-busy）、錯誤狀態（重新載入、回到上次成功資料、問題清單） | `dashboard.tsx:580–582` | 依 §7.10 改版，四種狀態等高 | 保留＋改名 | aria-busy |
| 22 | 離開頁面時的未保存警告（beforeunload） | `dashboard.tsx:139–145` | 不變 | 保留 | — |
| 23 | 頁首「匯入資料」按鈕（每頁都有） | `dashboard.tsx:554` | 資料來源頁頁首的主要按鈕；其他頁改從資料狀態 popover 的「匯入新資料」進入（≤ 2 次點擊）；空狀態也有 | 搬移 | 無（v2 的按鈕沒有 testid，`dashboard.tsx:554`）。V3-0 先補 `page-import`（只加屬性，畫面零變化）；V3-3 新增 `data-status-import`；E2E 改用 testid |
| 24 | KPI 五卡（本期、上期、差額、成長率，每個數字都能開明細） | `overview.tsx:73–90` | 經營總覽的「KPI 帶」（C1） | 保留 | `kpi-net_revenue`、`kpi-gross_profit`、`kpi-contribution_before_marketing`、`kpi-contribution_after_marketing`、`kpi-contribution_margin` |
| 25 | 目標達成行（期間相符與期間不符兩態）、廣告預算達成 | `overview.tsx:42–53、101` | 期間相符：KPI 帶每格底部顯示實際／目標／差額＋細橫條（C18）；期間不符：同一位置保留一行提示（v2 的 mismatchText，指出最近一筆目標的期間）。兩態的目標文字都保持 number-link，可開抽屜追溯到 targets.csv。廣告預算達成放在「其他常用指標」表「廣告佔淨營收」列下方（KPI 帶沒有廣告費格） | 保留＋搬移（廣告預算達成） | `kpi-target-{metric}`、`kpi-target-ad_spend` |
| 26 | 輔助指標 7 格（assist-kpi-v1） | `overview.tsx:92–104` | 「其他常用指標」兩欄緊湊表（C2：本期、上期；本期與上期都是 number-link；不新增差額欄，維持 assist-kpi-v1 的輸出不變） | 改名 | `assist-kpis`、`assist-{id}` |
| 27 | 本期三件事（標題、範圍、影響、原因、下一步、注意、相關範圍、看證據、加入待辦、未列出數、調整門檻） | `top-three.tsx:46–75` | 總覽區塊 4（§7.1）：3 列警示列（C9 摘要型），原因與下一步在列內第二行；限制句與相關範圍放進列內的「更多」；「調整門檻」收進標題列右側的 popover | 保留＋收合（限制句、門檻） | `top-three`、`overview-priority-{rule}` |
| 28 | 每週趨勢折線、檔期區帶、tooltip、數據表 | `overview.tsx:108–120` | 總覽區塊 7；圖上方先放期間合計與最近完整週（C16） | 保留 | `trend-events`、`#trend-title`、`.chart-frame[aria-hidden]`、`.data-alternative` |
| 29 | 貢獻變化拆解（總差額、九項、對帳標籤、數據表） | `overview.tsx:123–129` | 總覽區塊 5：瀑布圖＋橋接表＋平衡檢核（C17） | 保留（圖型改瀑布） | `#bridge-title`；新增 `bridge-waterfall`、`bridge-table`、`bridge-balance-check` |
| 30 | 通路比較圖，以及每通路的扣廣告後貢獻與貢獻率 | `overview.tsx:130–134` | 總覽區塊 8「各通路扣廣告後貢獻」 | 保留＋改名 | `#channel-title` |
| 31 | 期間合計與日均（details，開關狀態在同一工作階段內跨頁保留；這是 React state，`dashboard.tsx:187`，重新載入不保存） | `overview.tsx:137–152` | 總覽「進階」分組，維持收合 | 收合（同 v2） | `period-comparison`、`#daily-average-title` |
| 32 | 總覽會議入口一行 | `meeting-page.tsx:89–100` | 本期一句話右側的「會議：草稿」文字連結 | 搬移＋改名 | `overview-meeting-entry` |
| 33 | 通路寬表 | `channel-table.tsx`；`workspace-panels.tsx:111–114` | 通路健檢第三區塊；欄序改成台灣報表習慣；手機改成清單 | 保留 | `aria-label=通路寬表` |
| 34 | 健檢清單（details、前 3 列預設展開、缺資料置頂、範圍切換 chips、事實清單、原因／下一步／注意、技術細節、看證據、加入待辦、檔期後綴） | `diagnosis-list.tsx:84–148` | 通路健檢第二區塊，改成警示列樣式（C9 清單型）；前 3 列仍預設展開；範圍切換 chips 仍是每列一組，留在該列展開內容中（`diagnosis-list.tsx:93–116`，切換該列的事實清單、影響金額與技術細節） | 保留＋改名（「數據」改「相關數字」） | `diagnosis-panel`、`diagnosis-list`、`diagnosis-row-{rule}` |
| 35 | AI 解釋（選配）與所有子元件 | `ai-panel.tsx:87–127` | 通路健檢最底，預設收合成一列「AI 解釋 · 未啟用」；展開後內容不變 | 收合 | `ai-panel`、`ai-mode`、`ai-status`、`ai-readable-preview`、`ai-facts-preview`、`ai-advanced`、`ai-payload-preview`、`ai-request-preview`、`ai-local-mapping`、`ai-live-result`、`ai-response-details` |
| 36 | 商品毛利：最差 10、增加最多 10、篩選、只看負毛利、更多欄位、2 個 CSV、筆數、技術細節、完整表 | `product-comparison-panel.tsx:41–139`（另 `workspace-panels.tsx:141` 有同名的 `product-table`，兩處都要納入保留檢查） | 頁首放範圍副標；前 10 名兩表並排；完整表上方是一列工具列（≤ 5 個控制）；2 個 CSV 移到頁首「匯出本頁」 | 搬移＋合併（CSV 入口） | `product-worst`、`product-best`、`product-more-columns`、`product-table` |
| 37 | 試算：通路選擇、基準重建與新鮮度、本期基準、不可試算原因、假設清單、新增方案（最多 3 個）、範本、5 個輸入、相對與絕對切換、等值、預填、錯誤、範圍提示、聲明勾選、計算、移除、版本、結果 | `multi-scenario-workbench.tsx:85–92`；`decision-workbench.tsx:152–216` | 依 §7.4 重排：方案並排成欄，**不用分頁**；範例與範圍改成 placeholder 和超出時才出現的提示；範本說明收進 `?` popover，仍保持掛載 | 搬移＋收合（說明） | `multi-scenario-workbench`、`scenario-channel`、`decision-workbench`、`decision-freshness`、`baseline-{metric}`、`scenario-unavailable`、`scenario-assumptions`、`scenario-{n}`、`scenario-preset`、`scenario-preset-apply`、`scenario-preset-overwrite`、`scenario-preset-purpose`、`scenario-template-note`、`scenario-mode-{field}`、`scenario-equivalent-{field}`、`scenario-absolute-note-{field}`、`scenario-absolute-error-{field}`、`scenario-range-{field}`、`scenario-unavailable-{field}`、`scenario-result`、`scenario-version`、`scenario-draft`、`scenario-contribution`、`scenario-delta` |
| 38 | 要賣到多少才划算（敏感度，每個有效方案各一份，值存在 `plan.sensitivity` 並寫入備份） | `scenario-sensitivity.tsx`；`decision-workbench.tsx:216` | 留在每個方案欄的結果下方，每個方案保有自己的 state（同 v2），名稱不變（避免和 F12「損益兩平 MER」撞名）。`threshold-*`、`sensitivity-result` 是每個方案各一份，mounted-testids 以「方案數 × 1」計 | 保留 | `scenario-sensitivity`、`threshold-{id}`、`threshold-pct`、`sensitivity-result` |
| 39 | 方案比較表、選入會議、其他通路方案、歷史方案、決策輸出、通知 | `decision-workbench.tsx:219–228`；`multi-scenario-workbench.tsx:93–95` | 方案欄下方依序是比較表、其他通路方案（`<details>`）、歷史方案（`<details>`）；「選入會議」改成每個方案結果下的次要按鈕（會議頁議程 5 的選入 select 仍保留，#44a）；決策輸出移到頁首「匯出本頁」頁內下拉，呼叫 v2 的同一個 handler | 搬移＋收合＋合併 | `scenario-comparison`、`scenario-other-channels`、`decision-notice` |
| 40 | 待辦：看板與清單切換、新增、四欄、計數、置頂（最多 3）、移到其他狀態（焦點跟著卡片）、展開編輯 | `actions-workbench.tsx:66–141` | 卡片只放標題、負責人、期限、狀態、引用狀態標籤（已確認／草稿）與「需要重新核對」或「過期」徽章；卡底一行 12px 文字按鈕「移到：進行中 · 受阻 · 已完成」（一直可見）；看板檢視的編輯改成右側抽屜；清單檢視維持 v2 的每項 article 加內嵌編輯器（§7.5） | 保留＋搬移（看板的編輯器） | `actions-workbench`、`actions-view-board`、`actions-view-list`、`action-board`、`board-column-{status}`、`board-card-{n}`、`board-card-{n}-move-{status}`、`action-notice` |
| 41 | 待辦編輯器（7 欄、datalist、期限、狀態、進度、證據勾選、確認、限制、置頂、往上移、移除、重新核對、看證據、技術細節、引用歷史） | `actions-workbench.tsx:29–64、142–148` | 看板檢視：待辦編輯抽屜，同一頁捲動分三段（**不用分頁**）：內容／引用的數字／歷史；清單檢視：維持常駐掛載的內嵌編輯器。兩種檢視共用同一個編輯器元件，不同時渲染（同 v2），所以 `action-{n}` 不重複（M6）。欄位編輯即時生效、「確認」是確認引用的數字，兩者語意不變 | 搬移＋改名（「證據」改「引用的數字」） | `evidence-checklist`、`action-{n}`；新增 `action-drawer` |
| 42 | 待辦輸出 MD／CSV／JSON | `actions-workbench.tsx:149` | 頁首「匯出本頁」頁內下拉，呼叫 v2 的同一個 handler | 搬移 | 無（v2 的輸出按鈕沒有 testid）。V3-0 先補 `actions-export-{format}`（只加屬性，畫面零變化），再納入基準 |
| 43 | 會議基本資料（名稱、日期、固定範圍、差異提醒、用目前資料更新、漂移更新、技術細節） | `meeting-page.tsx:170、231–250` | 會議頁頁首的資訊列 | 搬移 | `meeting-page`、`meeting-status`、`review-workbench`、`review-view-difference` |
| 43a | 沒有會議稿時的「建立會議紀錄」按鈕（review 為 null，例如還原沒有會議稿的舊備份） | `meeting-page.tsx:176` | 會議頁的頁面型空狀態（C10），按鈕文字與行為不變 | 保留 | `meeting-page`、`review-workbench`（V3-0 為按鈕補 `meeting-create`） |
| 44 | 議程 1–6 | `meeting-page.tsx:253–275`；`manager-summary.tsx:48–84` | 左側議程目錄（`<ol>`）＋主內容；議程 1–3 改成精簡唯讀摘要，完整表收合 | 收合＋改名 | `meeting-agenda`、`manager-summary`、`meeting-agenda-1`…`6`、`manager-priority-{code}`、`meeting-followup`、`meeting-scenario-results`、`meeting-scenario-result`、`meeting-scenario-results-empty`、`meeting-pinned-actions`、`meeting-pinned-actions-empty` |
| 44a | 議程 5 每通路的選入 select（可選入、更換、取消選入，含「未選入」與保留的舊選項） | `meeting-page.tsx:259–266` | 留在會議頁議程 5，每通路一個 select，行為不變；試算頁的「選入會議」按鈕是另一個入口 | 保留 | 無（以 aria-label 定位）；V3-0 補 `meeting-scenario-select-{channel}` |
| 45 | 門檻表單：總覽三件事（`top-three.tsx:49–51`，元件內暫時 state）與會議摘要（`manager-summary.tsx:69`，存在會議稿的 `importance_threshold`，結束會議時寫入 `thresholds.importance`，`meeting.ts:299`） | `top-three.tsx`、`manager-summary.tsx:69` | **兩份 state 不合併**：總覽與會議各自保留可收合的「調整門檻」入口；會議門檻仍屬於會議紀錄，隨會議範圍凍結。v2 的通路健檢沒有門檻入口，本輪不新增 | 保留＋收合 | 無（v2 沒有）。V3-0 先補 `threshold-form-overview`、`threshold-form-meeting`（只加屬性） |
| 46 | 決議（四種）、備註、結束會議與確認（role=dialog、Esc） | `meeting-page.tsx:277–296` | 會議頁頁首動作列：決議 select＋「結束會議」主要按鈕；備註放在議程之後 | 搬移 | `meeting-decision`、`meeting-finalize`、`meeting-finalize-confirm`、`meeting-finalize-confirm-button`、`meeting-finalize-error` |
| 47 | 與上次會議比較 | `meeting-page.tsx:298–301、342–352` | 放在議程之後，預設收合 | 收合 | `meeting-compare`、`meeting-compare-{kind}`、`meeting-compare-note`、`meeting-compare-see-followup`、`meeting-compare-kpis` |
| 48 | 會議歷史（含每筆的「下載 Markdown」） | `meeting-page.tsx:372–398` | 頁面最底；每筆的「下載 Markdown」（`downloadMeetingMarkdown`）保留原位 | 保留 | `meeting-history`、`meeting-history-item`、`meeting-history-followup`、`meeting-history-kpis`、`meeting-history-remove-{id}`、`meeting-history-remove-confirm`、`meeting-history-remove-confirm-region`、`meeting-history-status` |
| 49 | 會議輸出（PDF、MD、通路寬表 CSV、Excel、PPT；以及只在列印模式中出現的「結束列印」） | `meeting-page.tsx:305–320` | 頁首動作列的「匯出會議」頁內下拉選單（呼叫 v2 的同一個 handler，維持會議範圍），旁邊加上「複製週會摘要」；「結束列印」維持只在列印模式中出現 | 搬移＋合併 | `meeting-outputs`、`meeting-export-excel`、`meeting-export-pptx` |
| 50 | A4 列印版 | `manager-summary.tsx:109–137` | 版頭改成台灣報表格式（§7.9），內容順序不變 | 保留 | `manager-summary-print`、`print-decision-line`、`print-scenario-line`、`print-appendix-assumptions`、`print-appendix-notes` |
| 51 | 資料範圍與口徑 metadata、技術細節、前處理、欄位對照 | `workspace-panels.tsx:46–64` | 資料來源頁「範圍與金額基準」（9 欄改成兩欄定義列表）；前處理改成表格；新增「版本與來源資訊」`<details>` 做彙整（原處的技術細節仍保留；不用「稽核」，它是 R2 的禁用詞） | 保留＋改名（「口徑」改「金額基準」，D-V3-2）＋合併（版本與來源彙整） | `data-preprocessing` |
| 52 | 目標（選填）、促銷檔期（選填） | `workspace-panels.tsx:66–87` | 資料來源頁「選填資料」分組，兩表並列 | 搬移 | `targets-entry`、`targets-issues`、`targets-table`、`events-entry`、`events-issues`、`events-table` |
| 53 | 來源檔案預覽（前 10 列）、資料完整性問題表 | `workspace-panels.tsx:88–102`；`issue-list.tsx` | 問題表搬到資料來源頁第二區塊（給執行者先看）；來源預覽放在後段 | 搬移 | 既有錨點、分頁、原因碼 details 保留 |
| 54 | 匯入精靈 4 步（全部子功能） | `import-wizard/*` | 全版專注模式；步驟 2 已對上的欄位預設收合；步驟 3 換算欄位依 D2 預設勾選，進階設定再展開 | 收合 | `import-wizard`、`import-stepper`、`import-step-1`…`4`、`import-file-{role}`、`import-order-level-{role}`、`import-mapping-{role}`、`import-memory-hint`、`import-preset-hint`、`import-order-level`、`import-conversion`、`import-settings-proposal`、`import-status`、`import-preprocessing`、`import-memory-note`、`import-reconciliation`、`reconciliation-{field}`、`reconciliation-metric-{metric}`、`import-commit` |
| 55 | 計算明細抽屜（全部子功能：階梯、比率表、組成、技術細節、來源分頁、搜尋、分頁、含稅註記、回焦） | `evidence-drawer.tsx:129–239` | 名稱改為「計算與來源」，依 §7.8 重排 | 改名＋搬移（段落順序） | `evidence-conversion-note`、dialog 的 `aria-labelledby`、`aria-describedby` |
| 56 | 所有圖表的數據表替代；`.table-scroll` 的 tabIndex=0、role=region、aria-label；caption | 各表格元件 | 不變；`<details>` 摘要文字改成「資料表」 | 保留＋改名 | `.data-alternative`、`.table-scroll` |
| 57 | 使用分析揭露與既有事件追蹤 | `dashboard.tsx:46、586` | 頁尾；新增事件名見 §10（D-V3-15） | 保留 | `analytics-note` |
| 58 | prefers-reduced-motion、`:focus-visible` | `globals.css:12、206` | 改用 token 的焦點樣式 | 保留 | — |
| 59 | 本機個人偏好：備份 v4 的 `ui_prefs`（`view` 看板或清單、`last_preset` 上次快捷），經 IndexedDB 或備份檔保存；期間合計開關只是記憶體 state（v2 的 `src` 完全沒有使用 localStorage 或 sessionStorage） | `workspace-backup.ts:302–305`；`dashboard.tsx:187、335–338` | `ui_prefs` 的欄位與還原行為不變，既有偏好不搬到 localStorage。v3 新增的偏好（表格密度、改名提示已讀、首次導覽略過）才用 localStorage，一律包 try/catch | 保留 | `verification/revamp-v3/backup-schema-v4.json` 中 `ui_prefs` 的欄位清單（V3-0 從 `workspace-backup.ts` 的 schema 產出）＋還原測試；v3 新增的 localStorage 鍵另列在 `storage-keys-v3.txt` |
| 60 | 備份檔 v1–v4 還原、IndexedDB 中的舊工作區 | `workspace-backup.ts`、`local-store.ts` | 不變；F13 新增欄位時升到 v5，舊檔缺少的欄位補預設值 | 保留 | `verification/revamp-v3/backup-schema-v4.json`（V3-0 產出欄位清單）＋還原測試 |

> **檢核方式**：V3-0 會把本表轉成 `verification/revamp-v3/feature-retention.csv`，欄位是「# | 功能 | v3 位置 | 變更類型 | testid | 覆蓋的測試檔:測試名」。每批結束時逐列打勾，任何一列沒打勾，該批就不算完成。每一列至少要對應一條 E2E 或單元測試斷言；v2 沒有覆蓋的列，在 V3-0 補上。CSV 用 testid 或函式名定位功能，不用行號（行號只是本表的盤點證據，會隨改版漂移）。

### 6.4 掛載規則（避免「搬進彈出層」變成變相刪除）

| # | 規則 | 檢查方式 |
|---|---|---|
| M1 | 搬進 popover、`?` 說明、bottom sheet、`<details>` 的內容，**一律保持掛載**：用 `<details>` 或 `hidden` 屬性隱藏，不用條件渲染卸載。v2 本來就是條件渲染的 dialog 與抽屜，維持 v2 的行為 | `tests/mounted-testids.test.tsx`：SSR 渲染各頁，斷言 §6.3 列出的 testid 都在 markup 中 |
| M2 | 不用分頁（tab）隱藏帶 testid 的內容（試算方案、待辦抽屜、會議議程）。要分段時，用區段標題、錨點目錄或 `<details>` | 設計審查＋M1 測試 |
| M3 | Popover 觸發器用 `<button aria-expanded aria-controls>`；Esc 關閉並回焦（沿用 `.topbar-menu.auto-close`）；內容區有 `role=region` 或 `role=dialog`，並帶 aria-label | E2E 鍵盤流程 |
| M4 | E2E 在斷言可見性之前，先開啟對應的觸發器。這類改動與 UI 改動同一批完成，並記在該批驗收文件的「E2E 路徑變更」表 | 該批驗收文件 |
| M5 | 改了文字的元素，E2E 斷言一律改成 `import { labels } from "@/i18n"`。V3-0 產出 `verification/revamp-v3/e2e-text-assertions.csv`，涵蓋 `tests/e2e/` 的 21 個 spec 加 2 支 helper（`import-wizard-helpers.ts`、`replacement-helpers.ts`）中**所有非 testid 的定位器**：`getByText`／`getByRole`（含 helper 約 569 行，只算 spec 556 行），以及 `locator()` 的 CSS 與 DOM 結構選擇器（約 260 行，例如 `.scope-note`、`.kpi-value`、`tbody tr`、`.sidebar .tiny-tag`、`.evidence-body > .number`、`details.diagnosis-row`、`footer.main-footer`；數字以 V3-0 腳本實測為準）。另有約 652 行 `getByTestId`（只算 spec 633 行）。每一列標出會被哪一批影響、改用哪個 testid | V3-0 產出清單，每批勾銷 |
| M6 | **同一個控制在 DOM 只能有一個實例**：桌機與手機的差異（頂欄「更多」、期間底部面板、底部分頁列）只用 CSS 重新定位，不複製元件；表單 id（例如 `#previous-start`）與 testid（例如 `download-menu`、`workspace-storage`）都只出現一次，以免 `label for`／`aria-controls` 指錯元素、Playwright strict mode 一次比對到兩個元素。兩個 nav 依 #2 只渲染一個，或用不同的 aria-label | `mounted-testids` 測試加一條：§6.3 列出的每個 testid 與表單 id 在 SSR markup 中只出現 1 次（每個方案、每張卡各一份的樣板 testid 除外，依實例數計） |

### 6.5 匯出對照（全部保留）

v2 頂欄下載選單有 17 個下載項：目前檢視 4（含 1 個只在有問題時出現的條件項）、決策工作稿 3、會議摘要 4、範本 6。各頁另有 13 個輸出按鈕：商品 2、試算 3、待辦 3、會議 5。此外還有分散在各處的下載入口與條件項（見下方「其他下載入口」表）。這些數字只是盤點，**驗收不用總數**，改用 V3-0 產出的完整入口清單逐項比對。v3 的對照如下：

| 改版後分組（頂欄「匯出」選單） | 項目（改版後名稱；每項附一行 12px 說明） | v2 對應 | 其他入口（保留） |
|---|---|---|---|
| 目前檢視 | 分析資料 CSV／各通路比較 CSV／資料集設定 JSON／資料問題 CSV（有問題時才出現） | analysisCsv、channelTableCsv、manifestJson、issuesCsv | 資料來源頁的問題表工具列（資料問題 CSV）。「商品比較 CSV」「商品明細 CSV」只放在商品頁頁首「匯出本頁」頁內下拉：它們依賴商品頁元件內的篩選 state（品類、搜尋、排序、只看負毛利，`product-comparison-panel.tsx:118–126`），頂欄拿不到，所以**不放進頂欄選單**；除非先把篩選 state 提升，並以位元組比對測試證明內容一致 |
| 一頁摘要（目前檢視） | 一頁摘要 PDF（列印）／一頁摘要 Excel／一頁摘要 PPT／會議紀錄 Markdown（有已結束的會議時下載最近一筆，否則下載目前會議稿） | exportPdf、exportExcel、exportPptx、menuMarkdown | 會議頁「匯出會議」頁內下拉：PDF、Markdown、通路寬表 CSV、Excel、PPT（會議範圍版，5 項，`meeting-outputs`；呼叫 `meeting-page.tsx` 的 `runExport`，帶會議 summary 與 context，和頂欄依目前檢視產生、`meeting:null` 的版本範圍不同） |
| 決策工作稿 | 試算與待辦 Markdown／CSV／JSON | decisionMd、decisionCsv、decisionJson | 試算頁、待辦頁頁首的「匯出本頁」頁內下拉（各 3 項，呼叫 v2 同一個 handler） |
| 匯入範本 | 3×3 表格，欄頭為「檔案｜空白範本｜範例檔」，三列是銷售、通路費用、廣告。修正 v2 範本列錯位的問題 | blankTemplate ×3、exampleTemplate ×3 | 資料來源頁「範本下載」、匯入精靈步驟 1、空狀態的需要檔案表 |
| 會議（新增，不是取代） | 複製週會摘要 | （新） | 總覽本期一句話旁、會議頁頁首 |

**其他下載入口（v2 既有，保留原位；V3-0 用 grep `downloadText`／`download=`／`printCurrentView` 產出完整清單，含條件項，寫進 `feature-retention.csv`）**

| 入口 | 位置 | 條件 |
|---|---|---|
| 會議歷史每筆的「下載 Markdown」（舊會議只能從這裡下載） | `meeting-page.tsx:398`（`downloadMeetingMarkdown`） | 有已結束的會議 |
| 匯入精靈步驟 4 的資料問題 CSV（`profitlens-import-issues.csv`） | `import-wizard/step-review.tsx:42` | 檢核有問題時 |
| 目標、促銷檔期的下載範本與下載目前資料（4 個） | `workspace-panels.tsx:70–71、81–82` | 目前資料：已匯入時 |
| 主管摘要的輸出按鈕 | `manager-summary.tsx:79` | `outputs` 為 true 時 |
| 匯入精靈步驟 1 的空白範本與範例檔 | 已列在「匯入範本」列 | — |
| 備份 JSON（儲存選單、取代確認 dialog） | 已列在 §6.3 #10、#14 與 §7.9 | — |

- 刪除 menuNote 與 menuViewNote 兩段說明，範圍差異改寫在每一項的說明行。例如「一頁摘要 Excel：目前畫面的期間與通路」「會議紀錄 Markdown：最近一次結束的會議」。
- 處理中：項目右側出現 16px spinner 並加 `aria-disabled`；失敗時項目下方顯示一行錯誤，焦點回到該項。開啟選單時照常預載 Excel writer。
- **驗收**：V3-0 的完整下載入口清單中，每一項在 v3 至少有一個入口，而且逐項存在（不數按鈕總數）。下載內容依格式比對允許差異（`tests/export.test.ts` 改成「正規化後比對」，在 V3-7 同批更新）：
  - CSV、JSON：欄名、欄序、值完全相同，只允許新增欄（D11）；中文標題列依 labels 改名。
  - Markdown、Excel、PDF、PPT：允許的差異只有四行版頭（§7.9）、Markdown 負號 U+2212、Excel 管理損益表括號格式（D-V3-8）、工作表名（§8.9）、中文標籤；其餘數值逐格相同。

---

## 7 各頁面需求

各頁共通規則：

- 頁首只有 h1（20px／600）、選填的一行描述（13px，最多 24 字），以及右側動作區（最多一顆主要按鈕，加上「匯出本頁」次要按鈕）。
- 區塊標題 16px／600；區塊副標（一句 L2）13px，次要色。
- 不使用 eyebrow。範圍只在區塊標題列右側用 13px 文字顯示一次。
- 每個金額都是 `.number-link`：常駐虛線底線（`--border-input`，≥ 3:1，§9.4 C12），hover 改成強調色實線，focus 有焦點框，aria-label 寫成「{指標} {完整值} 元，看明細」。唯一例外是本期一句話中的金額：同一金額已在 KPI 帶可點，句中不做成 number-link。

### 7.0 全站殼層

**頂欄（48px，單列，1280 寬不得折行）**

| 位置 | 元素 | 規格 | 文案 |
|---|---|---|---|
| 左 | 字標 | 16px／600，前面放既有 brand-mark（24×24，radius 4px） | EC ProfitLens |
| 右 1 | 資料狀態按鈕 | 次要按鈕、高 32px；前面一個 8px 狀態點（ready 用 `--accent`、partial 用 `--warning`、error 用 `--unfavorable`、empty 用 `--border-strong`）；點開 popover（寬 320px） | 「示範資料 · 資料到 8/24」／「本機匯入 · 資料到 8/24」／「部分資料待補 · 資料到 8/24」／「還沒有資料」 |
| 右 2 | AI 狀態 | 12px 次要色的文字按鈕，點開既有 popover | 「AI 未啟用」 |
| 右 3 | 指標定義 | 32×32 icon 按鈕（書本 icon），aria-label「指標定義」 | — |
| 右 4 | 儲存 | 次要按鈕＋chevron；有未保存的變更時，右側顯示 12px 次要色「未保存」 | 「儲存」 |
| 右 5 | 匯出 | 次要按鈕＋chevron | 「匯出」 |

頂欄不放主要按鈕。768–1279px 時，「AI 未啟用」縮成 icon 按鈕，aria-label 不變，`ai-availability` 仍然可見。390px 時，「儲存」「匯出」「指標定義」收進「更多」選單，元素保持掛載（M1），而且和桌機是同一份 DOM、只用 CSS 重新定位，不複製元件（M6）。

**資料狀態 popover 內容（L2）**

```
示範資料（虛構）
資料集：12 週示範資料
資料到：2026-08-24（85 天）
資料問題：0 項                       ［前往資料來源］
公開示範站：計算都在你的瀏覽器完成，沒有使用 AI。
［匯入新資料］
```

**頁首（56px）**：h1 20px／600，下方是選填的一行 13px 次要色描述；右側最多放一顆主要按鈕和一顆「匯出本頁」次要按鈕。不放 eyebrow。

**期間列（48px，sticky top:48px，背景 `--bg-page`，下緣 1px `--border-subtle`）**

```
[全部通路 ▾]  [近 7 天][近 4 週][近 12 週][本月 vs 上月][去年同期]   本期 7/13–8/23 對比 上期 6/1–7/12（各 42 天）   [自訂期間 ▾]
```

- 快捷是分段按鈕（C11 分段鈕，高 28px、13px）。選中時是 `--accent-subtle` 底、強調色文字，並設 `aria-pressed=true`。
- 快捷是否直接套用，需要拍板（D-V3-10）。建議 **快捷單擊就套用**，只有在「自訂期間」popover 裡手動改日期時才需要按「套用」。如果維持「明確套用」，選了快捷之後「自訂期間」按鈕要改成主要樣式，並顯示「套用 近 4 週」。會議與試算本來就有自己的固定範圍與新鮮度提示，不受影響。
- 期間摘要用 13px 次要色。兩期天數不同時改寫成「本期 30 天、上期 31 天，日均較可比」。
- 去年同期不可用時，快捷保持可見並設 `aria-disabled`，用 title 加 sr-only 文字說明理由；可見的理由用 12px 文字顯示在「需要處理橫幅」的位置，保留 `preset-reason-visible-yoy`。
- 手機（≤ 767px）：期間列縮成一顆按鈕「近 4 週 · 7/13–8/23」，點開底部面板，所有控制都在裡面，而且保持掛載；底部面板就是同一份期間列 DOM 用 CSS 重新定位，日期欄位 id 只有一份（M6）。

**需要處理橫幅（C22）**：高 40px，左側 3px 語意色線，配淡底，一行文字加一個文字連結。例如「部分資料待補：3 天的通路費用空白。查看 3 項資料問題」。篩選錯誤也用同一個位置，改成不利色系，並設 role=alert。

**側欄（220px，背景 `--bg-sidebar`）**：分組標題 12px／500 `--text-tertiary`；導覽項目高 32px、14px `--text-secondary`；active 用 `--text-primary`、600 字重、左側 2px `--accent` 線，不加底色和圓點。健檢項目右側顯示不利計數徽章（只顯示數字，aria-label「3 項不利」）。

**手機底部分頁列（56px＋safe-area）**：總覽、健檢、待辦、會議、更多。「更多」打開底部面板，裡面是商品毛利、假設試算、資料來源、匯出、儲存、指標定義，以及「開發者驗證」（只在 #validation 時出現）。匯出、儲存是頂欄同一個元件經 CSS 重新定位（M6）。

**頁尾**：「扣廣告後貢獻不含固定費與稅。［指標定義］ · 新台幣 · 台北時間」，正式站再加上使用分析揭露。

**殼層驗收**

- 1440×1000：頂欄、頁首、期間列合計 ≤ 152px。
- 1280×900：頂欄只有 1 列。
- 390×844：48px 頂欄加 40px 期間按鈕，下面就是內容。
- 可見畫面中「示範資料」字樣最多出現 1 次（在資料狀態按鈕上）。
- 從任一頁到匯入精靈 ≤ 2 次點擊。
- §6.3 #1–#23 的 testid 全部存在；選單的鍵盤操作與回焦 E2E 通過。

### 7.1 經營總覽

**目的**：老闆 10 秒看懂賺賠與原因；主管 1 分鐘內找到要往下追的地方。

**由上到下的版面（1440 寬）**

| 序 | 區塊 | 層 | 內容 | 高度預算 |
|---|---|---|---|---|
| 1 | 頁首 | — | h1「經營總覽」；右側「匯出本頁」 | 56px |
| 1a | 改名提示（F23，只對偵測到 v2 資料的既有使用者顯示，§8.9） | — | 一行，可關閉；首屏量測狀態不含這一列（§2.3 B） | 40px（只在出現時） |
| 2 | **本期一句話**（新，`weekly-snapshot`） | L1 | 一句結論（`snapshot-sentence`），右側是「複製週會摘要」次要按鈕（`copy-summary`）和「會議：草稿」連結（`overview-meeting-entry`） | 72px |
| 3 | **KPI 帶**（C1） | L1 | 5 格，順序依 D-V3-11：淨營收、商品毛利、扣廣告前貢獻（D-V3-1）、**扣廣告後貢獻**、扣廣告後貢獻率 | 132px（有目標時 156px） |
| 4 | **本期三件事**（C9 摘要型） | L1＋L2 | 3 列警示列 | 3 × 64px（收合時） |
| 5 | **貢獻變化拆解**（C16＋C17） | L1＋L2 | 標題是結論句；左邊瀑布圖（320px 高），右邊橋接表 | 400px |
| 6 | **本期利潤結構**（新，P0，F2） | L2 | 四層利潤瀑布：淨營收 → 扣商品成本 → 商品毛利 → 扣平台、金流、物流、其他 → 扣廣告前貢獻 → 扣廣告 → 扣廣告後貢獻；可切換合計或單一通路 | 400px |
| 7 | **每週淨營收與扣廣告後貢獻**（C16） | L2 | 圖上方先放「期間合計」「最近完整週」兩個數字，再放折線（180px） | 260px |
| 8 | **各通路扣廣告後貢獻**（C16） | L2 | 長條圖（180px）與每通路的金額、貢獻率 | 260px |
| 9 | **其他常用指標**（C2） | L2 | 兩欄緊湊表 | — |
| 10 | 進階（收合）：期間合計與日均、每日／每週管理損益表（P1） | L3 | `<details>` | — |

**1280**：區塊 7、8 上下排列。**768**：KPI 帶改成 3＋2。**390**：本期一句話 → 扣廣告後貢獻（全寬放大）→ 其他 4 項單行清單 → 三件事 → 其他區塊；圖表高度 180px，表格改成清單（§9.4 C3）。

**首屏驗收（1440×1000）**：區塊 2、3 完整可見，區塊 4 至少第 1 列可見。

**2. 本期一句話**

- 版型：左邊一句話（20px／600，`--text-primary`，數字用 tabular），下一行 13px 次要色「本期 7/13–8/23 · 全部通路 · 金額未稅」。
- 句子用 labels 模板（`overview.snapshot.*`），數字全部來自既有 snapshot，不新增任何計算：

| 情境 | 模板 | 範例 |
|---|---|---|
| 淨營收增、扣廣告後減 | `淨營收多 {ΔN}，扣廣告後貢獻卻少賺 {ΔCM 絕對值}；最大一項是{top1.headline}。` | 淨營收多 170.9 萬，扣廣告後貢獻卻少賺 59.9 萬；最大一項是折扣多花 118.8 萬。 |
| 兩者都增 | `淨營收多 {ΔN}，扣廣告後貢獻多賺 {ΔCM}。` | 淨營收多 52.0 萬，扣廣告後貢獻多賺 8.4 萬。 |
| 兩者都減 | `淨營收少 {ΔN 絕對值}，扣廣告後貢獻少賺 {ΔCM 絕對值}；最大一項是{top1.headline}。` | 淨營收少 31.2 萬，扣廣告後貢獻少賺 12.5 萬；最大一項是退款多 6.0 萬。 |
| 上期 ≤ 0 | `扣廣告後貢獻由負轉正，本期 {CM}。`／`扣廣告後貢獻轉為虧損，本期 {CM}。` | 扣廣告後貢獻轉為虧損，本期 −6.1 萬。 |
| 資料待補 | `部分資料待補，扣廣告後貢獻暫不計算；先到資料來源補齊 {n} 項。` | 部分資料待補，扣廣告後貢獻暫不計算；先到資料來源補齊 3 項。 |

（第 2、3、4 列的範例數字只是格式示意，不是示範資料的實際值。）

- **複製週會摘要**：用 Clipboard API 寫入剪貼簿。失敗時改成開一個 textarea dialog，內容已全選。成功後按鈕旁的 `role=status`（`copy-summary-status`）顯示「已複製週會摘要。」，2 秒後消失；reduced-motion 時直接消失，不做淡出。內容模板見 §10.2。

**3. KPI 帶（取代 5 張卡）**

- 一個容器，5 格等寬（扣廣告後貢獻格可加寬為 1.25 倍），格與格之間用 1px `--border-subtle` 直線分隔，不是 5 張卡。
- 每一格的內容：

```
扣廣告後貢獻                        ?   （tooltip：白話定義一句）
127.0 萬                                （32px/600，只有這一格；其他格 28px/600）
比上期少賺 59.9 萬（−32.0%）             （13px；不利色＋「−」＋方向詞）
上期 186.9 萬                            （12px 次要色；number-link）
目標 150.0 萬 · 差 −23.0 萬  ▬▬▬▬▬▏      （有目標、期間相符時出現；C18 細條 6px；目標文字是 number-link）
                                         （有目標但期間不符時，同一位置改成一行提示，指出最近一筆目標的期間）
```

- 扣廣告後貢獻格頂部有 2px `--accent` 線，數字 32px；其他格 28px。不用深色底。
- 比率格（扣廣告後貢獻率）顯示「16.2%」「降 14.3 個百分點」「上期 30.4%」，不顯示成長率。
- 大數字、差額與上期值都是 number-link（開抽屜），保留 `kpi-*` testid。
- 刪除 kpiHint「點數字看怎麼算的 ↗」，改用 number-link 的虛線底線表示可以點（§9.4 C12）。區塊右上角用 12px 次要色寫「金額單位：元，未稅」，單位只標這一次。

**4. 本期三件事（C9 警示列）**

- 區塊標題列：「本期三件事」（16px／600），旁邊是範圍「全部通路」（13px 次要色，只標一次）；右側是「依影響金額排序」`?` 和「調整門檻」文字按鈕（點開 popover，內含既有的門檻表單與錯誤訊息，保持掛載）。
- 每一列（收合高 64px）：

```
[不利]  折扣多花 118.8 萬                                   影響 −118.8 萬   [看明細] [加入待辦]
        折扣率從 9.0% 升到 18.0%。先列出本期的促銷檔期，核對折扣有沒有換到足夠的銷量。
```

- 本區塊用 C9「摘要型」（第二行 L2 常駐可見）。
- 第一行：狀態標籤（資料待補／不利／有利）＋L1 標題（16px／600）＋右側影響金額（16px／600 tabular，依 `favorableDirection` 上色）＋2 顆次要按鈕（高 28px）。
- 第二行：L2 解讀（14px，正文色，不再用 12px 灰字），最多 2 句。
- 限制句、相關範圍、檔期後綴收進該列的 `<details>`「更多」（13px），預設收合。
- 少於 3 件時，標題改成「本期要先看的事（{n} 件）」；0 件時顯示「本期沒有需要先看的事。」和「前往通路健檢」連結。
- 「另有 n 組未列出」改成區塊底部的連結「查看全部 {n} 項健檢結果」。

**5. 貢獻變化拆解（瀑布圖＋橋接表）**

- 標題（L1 結論句模板）：「少賺 59.9 萬，最大一項是折扣（−118.8 萬）」。標準名稱放在副標：「貢獻變化拆解 · 上期 6/1–7/12 到本期 7/13–8/23」。
- 左邊 7/12 欄是瀑布圖（C17）：第一根是上期扣廣告後貢獻（`--chart-total`），中間九項逐步增減（不利用 `--chart-unfavorable`，有利依 D-V3-7），最後一根是本期（`--chart-total`）。長條上直接標金額（萬，12px）。
- 右邊 5/12 欄是橋接表（L3 精度，因為加總要對得上）：

| 項目 | 金額（元） |
|---|---:|
| 上期扣廣告後貢獻 | 1,868,626.68 |
| 原價收入 | ＋（示範資料值） |
| 減：折扣 | −1,188,365.10 |
| …（共九項） | … |
| **本期扣廣告後貢獻** | **1,269,792.73** |
| 平衡檢核 | 已平衡（差 0.00） |

- 平衡檢核列（`bridge-balance-check`）：顯示「已平衡」加 check icon。沒有平衡時改成「差 {x} 元」並用 warning 色。理論上不會發生，這是防呆。
- 刪除 bridgeNote「注意：…」，改成副標下的一句 L2：「每一項都是兩期的實際差額，九項加起來就是總差額。」
- **鍵盤與點擊**：瀑布長條本身是 `aria-hidden` 的視覺層；可聚焦的是橋接表每一列的 number-link（Tab 順序和長條順序一致）。滑鼠點長條和點表格列，都呼叫同一個開抽屜的 handler。保留 `#bridge-title` 與數據表 `<details>`。

**6. 本期利潤結構（新增，P0）**：見 §10.3。

**7. 每週趨勢**

- 圖上方左側兩個 L1 數字：「期間合計 785.1 萬」「最近完整週 {值}」。最後一週不滿 7 天時，標「最後一週未滿 7 天」。
- 折線：本期用 `--chart-current` 2px 實線，比較期用 `--chart-previous` 1.5px 實線；只在最後一點畫 3px 圓點，並直接標出數值。缺資料的週斷線（`connectNulls=false`），標「無資料」。
- 檔期區帶：`--chart-band` 色塊，上方加 12px 標籤；保留 `trend-events`。
- 圖例放在標題右側，文字前用 12×2px 線段，不用彩色圓點。

**8. 各通路**：長條從 0 開始；最多 4 個類別色，超過的合併成「其他」並用 `--chart-other`；負值往左畫並用不利色；數值直接印在長條末端；每根長條可點開抽屜（鍵盤經由下方表格）。保留 `#channel-title`。

**9. 其他常用指標（取代 7 格）**

| 指標 | 本期 | 上期 |
|---|---:|---:|
| 售出件數 | 7,420 件 | （示範資料值） |
| 件均淨營收 | 1,058 元／件 | … |
| 廣告佔淨營收 | 8.8% | … |
| MER | 11.4 倍 | 18.7 倍 |
| 商品毛利率 | … | … |
| 退款金額比 | … | … |
| 物流費佔淨營收 | … | … |

- 兩欄並排（每欄 3–4 列），列高 32px，字級 13px。本期與上期每格都是 number-link（同 v2），保留 `assist-{id}`。**不新增差額欄**：v2 的輔助指標只有本期與上期，assist-kpi-v1 也沒有差額的公式與來源；若之後要加，須在 `src/application/assist-kpi.ts` 新增計算（比率用百分點、倍數用倍差）與抽屜內容，附手算測試，並在 §6.3 標為「新增」。
- 「廣告佔淨營收」列下方放廣告預算達成（v2 的 `kpi-target-ad_spend`）：有目標且期間相符時顯示「廣告費 實際／目標／差額」＋C18 細條；期間不符時顯示一行提示；目標文字是 number-link。
- 區塊標題「其他常用指標」加上 `?` 說明：「件數、件均、毛利率、費用佔比和 MER，和上方用同一份資料，不列入貢獻計算。」

**經營總覽驗收**

- [ ] 1440×1000 首屏條件成立（§2.3 B）。
- [ ] 本期一句話的 5 種情境各有單元測試（presentation 層），數字與 snapshot 相符。
- [ ] 瀑布圖九項加總等於總差額（到分），`bridge-balance-check` 顯示「已平衡」。
- [ ] 所有 KPI、三件事金額、瀑布長條、圖表長條都能開抽屜；不用滑鼠也能經由表格開啟。
- [ ] 切換期間時 CLS < 0.05。
- [ ] §6.3 #24–#32 的 testid 全部存在；`copy-density` 測試通過。

### 7.2 通路健檢

**目的**：主管找出「哪個通路、哪項費用、多少錢」，並轉成待辦。

1. **頁首**：h1「通路健檢」，描述「8 條固定規則，依影響金額排序」。
2. **健檢結果**（先放，因為這是結論）
   - 標題列：「健檢結果」，後面接計數徽章「資料待補 1 · 不利 3 · 有利 2」。計數直接來自既有規則的狀態，不做新的分類，也不做 Health Score。刪除「自動健檢」標籤。
   - 區塊範圍文字只在標題列出現一次。範圍切換 chips（`aria-pressed`）**維持每列一組**，留在該列的展開內容中（同 v2，`diagnosis-list.tsx:93–116`），切換該列的相關數字、影響金額與技術細節；summary 不重複顯示範圍 chips。單列範圍超過 4 個時，其餘收進該列的「更多範圍」popover。
   - 每列是 `<details>`（C9 清單型：L2 只在展開後出現），前 3 列預設展開，維持現狀：
     - `<summary>`（L1，高 ≥ 48px）：狀態標籤、標題（16px／600）、範圍（只在和頁面範圍不同時顯示）、右側影響金額（萬）。影響金額在一列裡只出現這一次。
     - 展開後（L2）分三段，用 13px／600 次要色的小標分隔，不用卡片：**相關數字**（兩欄定義列表，整數元，可點）；**可能原因（待確認）**、**下一步**（14px 正文色）；限制一句（13px 次要色，不加「注意：」）。
     - 動作列靠左：「看明細」「加入待辦」（次要按鈕）。
     - 最底的 `<details>`「技術細節」（L3）：規則代號、排序金額（可點）、metric_version、hash、fact IDs、限制。12px 等寬字。
3. **各通路兩期比較**（通路寬表，C3）
   - 欄序依 §9.4（本期與比較期並列、備註欄取自 MOPS 月營收表；差額金額欄取自 QuickBooks 的 $ change）：通路｜本期淨營收｜上期淨營收｜差額｜本期扣廣告後貢獻｜上期｜差額｜備註（轉負標記、健檢標題連結）。
   - 欄群組標題寫「淨營收（元）」「扣廣告後貢獻（元）」，單位只標一次。
   - 預設依本期扣廣告後貢獻由低到高排序，欄頭顯示排序 icon，並設 `aria-sort`。
   - 手機：每通路一列清單（主行：通路名＋本期扣廣告後貢獻＋差額；次行：淨營收與差額）。
4. **AI 解釋（選配）**：預設收合成一列「AI 解釋 · 未啟用（公開版不送出任何資料）」，展開後內容與 testid 全部不變。

**文案範例**

- REV_UP_CM_DOWN：L1「淨營收多 170.9 萬，卻少賺 59.9 萬」；L2「成長被費用吃掉了。先看貢獻變化拆解中扣最多的兩項，再確認是哪個通路。」
- NEGATIVE_CHANNEL_CM：L1「平台 · MARKETPLACE 扣完廣告虧 6.1 萬」；L2「這個通路的平台抽成和廣告費加起來超過商品毛利。先確認兩項的通路歸屬，再決定調投放、價格或商品組合。」；L3「NEGATIVE_CHANNEL_CM：CM_after（channel = MARKETPLACE，本期）< 0」。

**驗收**：`diagnosis-row-*` 前 3 列有 `open`；summary 文字不含「｜」；計數徽章的數字和列數一致；區塊範圍文字只出現一次，每列的範圍 chips 仍在該列展開內容中、切換後只改該列；§6.3 #33–#35 的 testid 全部存在。

### 7.3 商品毛利

**目的**：找出毛利最差和改善最多的商品，並能下載明細。

1. **頁首**：h1「商品毛利」，描述「只看商品毛利，不分攤平台費和廣告費」（由原本的 eyebrow 改寫）；右側「匯出本頁」（下拉選單：商品比較 CSV、商品明細 CSV）。
2. **範圍副標**一行（13px）：「本期 7/13–8/23 對比 上期 6/1–7/12 · 全部通路 · 金額未稅」。
3. **毛利最差 10 個**與**毛利增加最多 10 個**：兩表並排（C3，列高跟著本頁 C3 資料表的密度，預設 40px，§9.3）。欄位是 排名｜商品（SKU 與通路在同一行，例如「SKU-0412 · 官網」，通路用 12px 次要色）｜本期商品毛利｜差額。保留 `product-worst`、`product-best`。
4. **全部商品**
   - 工具列（C15，一列最多 5 個控制）：品類 ▾｜搜尋 SKU 或商品名｜排序 ▾｜「只看負毛利」切換｜「欄位 ▾」（內含更多欄位切換與說明，保留 `product-more-columns`）。
   - 排序選項直接寫成「商品毛利差額：下降最多優先」「商品毛利差額：上升最多優先」「本期商品毛利：由低到高」等，取代「由小到大（先看下降）」。依據和方向仍是兩個值，但合併成一個 select 呈現。
   - 下載說明（含稅換算註記）放到頁首「匯出本頁」頁內下拉該項的說明行。
   - 「顯示 20 筆，共 128 筆」放在表格右上角，12px，`aria-live=polite`。
   - 完整表：金額欄右對齊、整數元；表頭寫「本期商品毛利（元）」；表頭 sticky；預設列高 40px，可切換 32px（F18）。
   - 技術細節 `<details>` 放在表格下方。
   - 篩選後沒有結果時，用 C10 篩選型空狀態：「沒有符合篩選的商品。」，加「清除篩選」。
5. **手機**：表格改成清單（主行：商品＋本期商品毛利；次行：差額、件數、毛利率）。

**驗收**：工具列控制數 ≤ 5；兩個 CSV 的下載內容與 v2 位元組一致（如果標籤改名，只有標題列不同）；`product-table` 每格都能點；§6.3 #36 的 testid 全部存在。

### 7.4 假設試算

**目的**：主管 1 分鐘內算出一個方案；老闆看得懂「如果這樣做，會多賺或少賺多少」。

**版面原則**：**不用分頁（tab）**，所有方案與結果區塊都保持掛載與可見，避免藏住 testid 或改變 E2E 的點擊路徑（M2）。

| 區塊 | 規格 |
|---|---|
| 頁首 | h1「假設試算」；右側是本頁通路 select（`scenario-channel`，標籤「試算通路」，`?` 說明「只影響本頁，不改全站篩選」）和「匯出本頁」（決策 MD／CSV／JSON） |
| 基準列 | 一列定義列表，不用卡片：「本期基準（{通路}，7/13–8/23）：淨營收 · 扣廣告後貢獻 · 折扣率 · 平台與金流費率」，每個值都能點（`baseline-{metric}`）。新鮮度狀態放在同一列右側（`decision-freshness`，只在過期時改成 warning 色並出現「重新建立基準」）。不可試算的原因（`scenario-unavailable`）放在這裡。假設清單是 `<details>`「這個試算假設了什麼」（`scenario-assumptions`） |
| 方案欄（≥ 1280） | 最多 3 欄並排；只有 1 個方案時佔 8/12 欄，右側 4/12 放「＋新增方案」與說明。每欄是 `scenario-{n}`：方案名稱 input；範本 select＋「套用範本」（覆寫警告用 inline 提示顯示在下方，不另開灰底卡）；5 個輸入（銷量增減、折扣率、每件物流費、廣告預算、一次性費用），每格是 label、輸入、單位後綴；可切換的 3 個欄位用分段鈕（選項「增減」「改成」，`scenario-mode-{field}`）；聲明勾選；動作列靠左：「試算」（主要）、「移除方案」（文字按鈕）；結果下方是該方案自己的「要賣到多少才划算」（`scenario-sensitivity`，每個有效方案一份，值存在 `plan.sensitivity`） |
| 方案欄（< 1280） | 單欄，方案上下排列 |
| 結果（每個方案欄底部，位置對齊） | 「試算後扣廣告後貢獻 48.6 萬」（24px，`scenario-contribution`）、「比現況多 7.4 萬」（依方向上色並加符號，`scenario-delta`）、版本或草稿標籤（`scenario-version`／`scenario-draft`）、「選入會議」次要按鈕 |
| 方案欄之後 | 依序是方案比較表（`scenario-comparison`，預設展開）、「其他通路的方案」`<details>`（`scenario-other-channels`）、「歷史方案」`<details>`。「要賣到多少才划算」不在這裡，留在每個方案欄內（見上） |

**方案表單（預設只顯示必要的）**

```
方案名稱   [降折扣 3 個百分點        ]
範本       [自訂 ▾]  [套用範本]  ?      （套用會覆寫時，按鈕下方顯示一行警示）
銷量增減   [ +10        ] %   [增減 | 改成]   placeholder「+10 表示多賣 10%」
折扣率     [ 15.0       ] %   [增減 | 改成]
每件物流費 [            ] 元  [增減 | 改成]
廣告預算   [ −10        ] %
一次性費用 [            ] 元
☐ 我了解這是試算，不是預測
[試算]  移除方案                          （靠左；「試算」是主要按鈕）
```

- 範例與範圍說明改成 placeholder。範圍提示（`scenario-range-{field}`）平時以 `hidden` 掛載，只在超出範圍時顯示：「請填 −90 到 +100 之間的數字」。等值換算（`scenario-equivalent-{field}`）只在「改成」模式顯示，13px 次要色，一行。
- 範本說明（`scenario-preset-purpose`、`scenario-template-note`）移到範本旁的 `?` popover，用 `hidden` 保持掛載（M1）。
- 按鈕「計算」改成「試算」。
- 聲明勾選：是否在同一工作區記住第一次的勾選，見 D-V3-12。拍板之前，維持每個方案都要勾。
- 每格輸入下方的常駐說明 ≤ 1 行。

**驗收**：首次進入（沒有方案）時可見控制項 ≤ 14；從選範本到看到結果只要 3 個動作（選範本、套用、試算）；從載入示範資料到第一個試算結果，鍵盤操作 ≤ 12 步；§6.3 #37–#39 的 testid 全部存在；試算 golden（284.00／264.00／19.70）不變。

### 7.5 待辦（導覽由「待辦與決議」改名，D-V3-4）

1. **頁首**：h1「待辦」，後面接計數徽章「12 · 置頂 3」；右側是主要按鈕「新增待辦」（全頁唯一的主要按鈕）和「匯出本頁」。刪除 boardIntro 的兩行說明，改成 h1 旁的 `?` popover：「最多置頂 3 項，置頂項目會列入會議摘要。」
2. **工具列**：看板｜清單 分段按鈕（`actions-view-board`／`actions-view-list`，偏好記在 ui_prefs，不變）。
3. **看板**：四欄（未開始、進行中、受阻、已完成），欄標題寫狀態名加計數徽章。欄底色是 `--bg-subtle`，不加邊框。只有 1–2 張卡時欄高不拉滿；空欄顯示 C10 區段型空狀態「沒有待辦」。
4. **卡片**（C13，看板中唯一保留的卡片）

```
☆ 檢討折扣檔期                              （置頂 icon 按鈕，aria-pressed；標題 14px/600，最多 2 行）
王小明 · 9/30 到期 · 9/25 更新              （12px 次要色；逾期時期限用 --unfavorable，加文字「逾期」）
[進行中]  引用 3 個數字 · 已確認  [需要重新核對]   （狀態標籤＋引用數＋引用狀態（已確認／草稿）＋條件徽章「需要重新核對」或「過期」，同 v2）
移到：未開始 · 受阻 · 已完成       編輯      （12px 文字按鈕列）
```

   - 「移到：…」這一列一直可見，每個文字按鈕都保留 `board-card-{n}-move-{status}` testid；移動後焦點跟著卡片，行為不變。
   - 點「編輯」或卡片標題，開啟「待辦編輯抽屜」（C6，右側 560px，`action-drawer`）。抽屜在同一頁捲動，分三段標題，**不用分頁**：**內容**（7 欄、狀態、進度紀錄）／**引用的數字**（歷史與待核對警示、搜尋與勾選、確認、看明細、用目前資料重新核對與預覽、「限制」`<details>`）／**歷史**（引用歷史、技術細節）。欄位編輯即時生效（同 v2，沒有「儲存」暫存再提交）；「確認」仍是確認引用的數字。底部固定動作列：「關閉」（次要）、「置頂」「往上移」（次要）、「移除」（危險文字按鈕，放在最右）。
5. **清單檢視**：維持 v2 的每項一個 `action-{n}` article，內嵌常駐掛載的完整編輯器（和抽屜共用同一個編輯器元件）。看板與清單兩種檢視不同時渲染（同 v2），所以 `action-{n}` 只有一份（M6）。
6. **空狀態**：「尚無待辦。」「從健檢結果或會議決議新增。」，按鈕「新增待辦」。
7. **新增（P1）**：卡片可以加「廣告決策」標籤（暫停／調整／加碼），由使用者自選（F13）。

**驗收**：收合時卡片高度 ≤ 96px；鍵盤可以完成「開卡片 → 改狀態 → 關抽屜回焦」；抽屜有 focus trap、Esc 關閉並回焦；§6.3 #40–#42 的 testid 全部存在。

### 7.6 會議紀錄

**目的**：當作週會用的文件。老闆看一頁摘要，主管記決議，會後一鍵匯出。

**版面（≥ 1280）**：左側議程目錄 200px（sticky，`<ol>` 錨點連結，目前位置用 2px 強調線），右側主內容最大寬 880px。< 1280 時目錄收成頁首下方的一列錨點。

1. **頁首動作列**（sticky，48px）：h1「本次會議（草稿）」或「已結束會議 · 10/5」；會議名稱與日期可行內編輯；右側是決議 select（草稿／採用／補資料再議／不採用，`meeting-decision`）、「結束會議」主要按鈕（`meeting-finalize`）、「複製週會摘要」、「匯出會議」頁內下拉（PDF、Markdown、通路寬表 CSV、Excel、PPT 一頁式；呼叫 v2 的 `runExport`，維持會議範圍；保留 `meeting-outputs`、`meeting-export-excel`、`meeting-export-pptx`）。「結束列印」（退出列印模式）維持只在列印模式中出現，不放進下拉。
2. **結束標示**（已結束時，`meeting-snapshot-note`）：頂部一行 13px，`--bg-subtle` 底：「這份紀錄在 10/5 結束，之後的資料變動不會影響內容。」主層不出現「快照」「contribution-v1」（03_GLOSSARY_COPY 的禁用詞）；版本字串放在技術細節（L3）。
3. **固定範圍**一行；範圍不同時，用需要處理橫幅寫「目前畫面範圍和會議不同。檢視差異／用目前資料更新會議」（`review-view-difference`）。技術細節收合。
4. **議程**（`<ol>`，不用圈數字）

| 序 | 名稱（新） | 原名 | 呈現 |
|---|---|---|---|
| 1 | 關鍵數字 | 兩個關鍵差額 | 兩個 L1 數字並排（24px，不再用 36px 大卡）：淨營收、扣廣告後貢獻；下方一行本期一句話 |
| 2 | 本期重點 | 本期三件事 | C9 清單型：3 列 L1 標題與影響金額；`<details>`「展開原因與下一步」；門檻是會議紀錄自己的值（`importance_threshold`，和總覽不共用），保留可收合的調整入口 |
| 3 | 各通路表現 | 通路表 | 精簡表（通路、扣廣告後貢獻、差額）；`<details>`「完整通路寬表」 |
| 4 | 上次決議追蹤 | 同 | 列表（C3 列樣式） |
| 5 | 選入方案 | 本次選入方案 | 每通路一列：選入 select（可選入、更換、取消選入，含「未選入」與保留的舊選項，同 v2，§6.3 #44a）、試算後扣廣告後貢獻、差額、過期標示；假設收合 |
| 6 | 置頂待辦 | 置頂行動 | 列表；其他待辦收合 |

5. **決議備註**：textarea 加一句限制（次要樣式）。結束會議的確認區維持 role=dialog、Esc 取消。
6. **與上次會議比較**：預設收合。
7. **會議歷史**：頁面最底。

**驗收**：會議頁不再出現第二套 KPI 大卡（對照 `6-meeting-desktop-viewport.png`）；議程用 `<ol>`；PDF 列印頁數不增加；§6.3 #43–#50（含 #43a、#44a）的 testid 全部存在；會議門檻與總覽門檻互不影響。

### 7.7 資料來源與匯入精靈

#### 7.7.1 資料來源頁（非匯入中）

| 序 | 區塊 | 規格 |
|---|---|---|
| 1 | 頁首 | h1「資料來源」。**已有資料時**，主要按鈕是「匯入資料」，次要按鈕是「載入示範資料」；**沒有資料時**兩者對調。修正 v2「試試示範資料」永遠是主要按鈕的主次顛倒 |
| 2 | 資料狀態（L1） | 一行：「本機匯入 · 資料到 8/24 · 涵蓋 6/1–8/24（85 天）· 3 份檔案 · 金額基準：未稅（匯入時含稅已換算）· 3 項問題」 |
| 3 | **資料問題**（從頁尾移到第二段） | 表格欄位：檔案（等寬字）｜行號（等寬字、右對齊）｜欄位｜問題｜修法｜原因碼（L3，可收合欄）。保留分頁；「下載問題清單 CSV」放在表格工具列；表頭右上角寫一次單位 |
| 4 | 範圍與金額基準 | 原本的 9 欄 metadata 卡改成兩欄定義列表（dt 13px 次要色、dd 14px）。「口徑」改稱「金額基準」（D-V3-2） |
| 5 | 本次匯入的前處理 | `data-preprocessing`：改成表格，欄位是 欄位｜含稅合計（元）｜未稅合計（元）｜稅率，取代 v2 的 8 行「→」條列 |
| 6 | 選填資料 | 目標、促銷檔期兩表並列；每表工具列有 上傳、下載範本、下載目前資料、移除；錯誤清單和第 3 段用同樣的欄位；testid 不變 |
| 7 | 來源檔案預覽 | 三個 `<details>`（銷售／通路費用／廣告），各顯示前 10 列；行號用等寬字 |
| 8 | 版本與來源資訊（新的彙整，`<details>`；L3） | 資料版本（SHA-256）、指標版本（contribution-v1、assist-kpi-v1）、口徑識別、匯入時間、欄位對照。來源都是既有資料，不新增計算。原處的技術細節保留，這裡是額外的彙整 |
| 9 | 範本下載 | 3×3 表格（檔案｜空白範本｜範例檔），與頂欄匯出選單的「匯入範本」分組相同 |

#### 7.7.2 匯入精靈（全版專注模式）

- 版頭：h1「匯入資料」，加 stepper（C20，4 步：選擇檔案、對照欄位、金額基準與期間、檢核與套用；`aria-current=step`），右上角是「取消匯入」文字按鈕。不再用「匯入資料｜對照欄位」這種拼接標題。
- 隱私說明一行（13px）：「檔案只在這台電腦讀取，不會上傳。」
- 匯入中隱藏期間列與 KPI，頂欄保留。
- 底部固定動作列（64px）：左邊「上一步」（次要），右邊「下一步」或「套用」（主要）。

| 步驟 | 規格 |
|---|---|
| 1 選擇檔案 | 拖放區（1px 虛線 `--border-strong`，高 120px，文字靠左）；三個檔案槽用 C3 列（角色｜檔名｜編碼｜列數｜狀態標籤｜移除）。範本、欄位說明、進階 manifest 收在 `<details>`。偵測到訂單級資料時，顯示 inline 提示「這份檔案看起來是訂單明細，需要先彙總成日報。」並連到 `scripts/aggregate_orders.py` 的說明（D5） |
| 2 對照欄位 | 每份檔一個區段，標題寫「銷售日報 · 已對照 8／10 欄 · 2 欄需要確認」（標準欄位數：銷售 10、通路費用 7、廣告 4，`import.ts:45–47`）。自動對上（包括記憶與預設）的列預設收合到 `<details>`「已對照的 8 欄」，只展開需要確認的列。每列是 標準欄位名（14px）｜來源欄 select（高 32px）｜範例值（13px 等寬字）｜狀態標籤。欄位說明移到標準欄位名旁的 `?` popover。記憶提示和預設提示合併成一行 inline 提示 |
| 3 金額基準與期間 | 「金額基準」radio：未稅／含稅／不確定，每個選項一行說明。選「含稅」時，稅率與換算欄位依 D2 預設勾選，收合成「將換算 8 個欄位」，按「調整換算欄位」才展開 9 個 checkbox（可換算欄位共 9 個、預設勾 8 個，`tax-basis.ts:26–36`）。設定提案（資料集名、資料到、期間、比較方式、整月捷徑、通路）用兩欄表單 |
| 4 檢核與套用 | 頂部狀態一行（L1）：「可以套用：3 份檔案、1,284 列、0 項錯誤、2 項提醒」或「無法套用：3 項錯誤」→ 前處理摘要表 → 問題清單（欄位同 §7.7.1）→ 對帳表（到分，`reconciliation-{field}`）→ 指標表（`reconciliation-metric-{metric}`）→「套用這份資料」 |

#### 7.7.3 錯誤訊息規格（`importErrors` 全部改寫）

**句型**：`{檔名} 第 {行} 行：{問題}。{修法}。` 原因碼只放在 L3。**錯誤文案只以本節為準**（§8.8 #26、#27 指向本節，不另寫一份）。錯誤訊息中的欄位名一律使用指標名稱（平台抽成、金流手續費、物流與包材費），不用「平台費」「金流費」。

| 原因碼 | v2 文案 | v3 L1（列標題） | v3 L2（展開） | L3（收合） |
|---|---|---|---|---|
| INVALID_DATE | 日期格式要是 2026-08-01（第 {line} 行） | sales_daily.csv 第 12 行：日期格式不對 | 這一行的日期是「2026/8/1」。請改成 2026-08-01 這種格式，再重新選檔。 | `INVALID_DATE · sales_daily.csv:12 · date（來源欄名 {column}）` |
| MISSING_PLATFORM_FEES | 第 {line} 行的平台費空白；沒有請填 0，不知道才留白 | channel_costs_daily.csv 第 8 行：平台抽成空白 | 沒有抽成請填 0，真的不知道才留白。留白的日子，扣廣告前後的貢獻都顯示「資料待補」。 | `MISSING_PLATFORM_FEES · platform_fees = null` |
| MISSING_KEY | （行號在句首） | {file} 第 {line} 行：缺少 {column} | 請補上 {column}；這一欄用來對應通路與商品。 | `MISSING_KEY · {column}` |

**工程需求**：

- `importErrors` 樣板新增 `{file}`、`{value}`、`{column}` 占位符，由 `src/application/import.ts` 帶入，**不改 `src/domain`**。domain 的 `ValidationIssue`（`src/domain/types.ts:29–34`）只有 SourceRef、severity、reason_code、field、message，沒有原始值，所以：`{file}`、`{line}` 取自 SourceRef；`{value}` 由 application 依 file:line 從已讀入的原始 CSV 列取出；`{column}` 由欄位對照（mapping）把標準欄位換成來源欄名。
- 新增 `tests/import-errors-copy.test.ts`：所有原因碼的 L1 樣板都要符合 `^\{file\} 第 \{line\} 行：[^。]+$`（或以實際檔名開頭的同型樣板），L2 必須以「。」結尾、每句 ≤ 30 字；占位符只能是 `{file}`、`{line}`、`{value}`、`{column}`，而且都有上述的 application 來源。
- 新增 `tests/reason-code-labels.test.ts`：domain 的每個 reason code（`ValidationIssue` 與試算的 scenario reasons，`src/domain/scenarios.ts:86–101`）在 labels 都有對應文案；UI 與匯出不得退回使用 domain 的中文 message（現行 `scenario-sensitivity.tsx:25`、`decision-export.ts:135` 的 `mapped[reason.code] ?? reason.message` 改成缺對應就讓測試失敗）。

**驗收**：步驟 2 預設可見的 select 數 ≤ 需要確認的欄位數 + 1；步驟 3 預設可見控制項 ≤ 12；含稅匯入 E2E 從步驟 1 到套用的點擊數 ≤ v2（V3-0 記錄基準）；§6.3 #51–#54 的 testid 全部存在。

### 7.8 計算與來源抽屜（原「怎麼算的」）

**名稱**：抽屜叫「計算與來源」，觸發按鈕與連結叫「看明細」（D-V3-3）。抽屜內的段落仍叫「計算方式」。

**規格**：右側抽屜（C6，ContextView），桌機寬 560px（≥ 1440 時 640px，768–1279 時 480px），< 768 時全螢幕；遮罩 `--scrim`；開啟時記住來源元素，Esc 或關閉後回焦（維持現行）。

```
扣廣告後貢獻                                          [×]     ← h2 20px/600（只放指標名或結論句）
全部通路 · 本期 7/13–8/23                                    ← 13px 次要色
127.0 萬                                                       ← 28px/600
1,269,792.73 元                                                ← 13px tabular（精確值，永遠顯示）

計算方式                                                       ← 區段標題 13px/600 次要色
    扣廣告前貢獻          （本期值）元
  − 廣告投放費            （本期值）元
  ＝ 扣廣告後貢獻         1,269,792.73 元
（比率類另有比率表）

組成項目            上期（元）        本期（元）       差額（元）  ← 14px 表格，不再用 30px 大字

指標定義與算法                                                 ← 固定段落（回應 IFRS 18 對自訂指標的揭露要求）
  扣廣告前貢獻再扣廣告投放費；還沒扣固定費與所得稅，不是公司淨利。版本 contribution-v1。［指標定義］

原始明細                                                       ← 原「來源資料」
  [銷售 128] [通路費用 42] [廣告 42]   [搜尋…]      第 1–20 筆，共 128 筆
  檔案:行號               日期   通路   欄位與數值
  sales_daily.csv:128     …      …      discounts 12,000.00（含稅 12,600.00，換算為未稅 12,000.00）
  [上一頁] [下一頁]

▸ 技術細節（技術公式、精確值、條件碼、metric_version）
```

- 原始明細的三個來源分類是既有的分段按鈕（不是隱藏 testid 的 tab），維持 v2 的互動。
- 標題規則：影響類抽屜的標題用結論句（「折扣多花 118.8 萬」），副標寫「影響金額 · 全部通路 · 7/13–8/23」。取代 `evidence-drawer.tsx:153` 把四件事塞進 h2 的做法。
- 檔名:行號用等寬字（`--font-mono`）。
- 含稅換算註記（`evidence-conversion-note`）位置不變；原值與換算值並列。

**驗收**：h2 不含「｜」，也不含「怎麼算的」；開啟後焦點落在關閉鈕；原始明細表每列都有檔名與行號，且與 v2 一致（用 golden fixture 比對）；aria-labelledby、aria-describedby 指向新的 h2 與副標。

### 7.9 匯出、儲存與匯出版頭

**匯出選單（頂欄，寬 400px）**：分組與項目見 §6.5。每項是 14px 名稱加一行 12px 說明（例如「PDF · A4 一頁」）。分組標題 12px／500 `--text-tertiary`。

**儲存選單（寬 360px）**

```
本機保存
  [ ] 同意把資料存在這台電腦（資料只存在這個瀏覽器，不會上傳）
  [開關] 自動保存（同意後才出現）　　上次保存 14:32
  [存在這台電腦]  [讀取本機副本預覽]      （讀 IndexedDB；緊接在 autosave-replace-warning 旁）
備份檔
  [下載備份檔]  [選取備份檔…]
  （選檔後）還原預覽：範圍、期間、方案 3、待辦 8 ……  [套用] [取消]
  （下載後）[確認已下載]
  ▸ 備份內容（技術細節）
危險區
  [刪除這台電腦上的資料]  [清空目前資料]
```

- 既有的確認流程（取代既有副本、確認已下載、ReplacementDialog）全部保留。
- 首次保存提示的文案：「在這台電腦自動保存工作區？資料不會上傳。」按鈕是「自動保存」「暫時不要」。
- 頂欄的「未保存」只在有未保存的變更時出現（12px 次要色文字）。

**匯出版頭（PDF、PPT、Excel 首頁、Markdown 開頭；台灣報表格式）**

```
{資料集名稱}
扣廣告後貢獻兩期比較（管理報表）
本期 2026-07-13 至 2026-08-23（42 天）；上期 2026-06-01 至 2026-07-12（42 天）      單位：新台幣元，未稅
指標版本 contribution-v1 · 產出時間 2026-10-05 14:32（台北時間）
```

各格式使用的語言層見 §3.3。PPT、PDF 一頁只用 L1＋L2，L3 放附錄；CSV、JSON 的欄名與欄序不變（D11），只能新增欄。

**驗收**：V3-0 完整下載入口清單逐項存在；下載內容依 §6.5 的格式別允許差異正規化比對；儲存選單分三段，v2 的每個儲存控制（含同意、存在這台電腦、讀取本機副本預覽、確認已下載、技術細節）都在；§6.3 #14–#17、#49 的 testid 全部存在。

### 7.10 空狀態與示範

**首次進入（還沒有資料）**

```
還沒有資料                                       ← h1 20px/600，靠左
匯入銷售、通路費用、廣告三份日報 CSV，或先用示範資料（虛構）看看。
[載入示範資料]（主要）  [匯入資料]（次要）

需要的檔案                                       ← 16px/600
| 檔案                     | 內容                                           | 範本               |
| sales_daily.csv          | 每日、每通路、每商品的原價、折扣、退款、成本     | [空白範本] [範例檔] |
| channel_costs_daily.csv  | 每日、每通路的平台抽成、金流、物流、其他費用     | [空白範本] [範例檔] |
| ad_spend_daily.csv       | 每日、每通路的廣告投放費                        | [空白範本] [範例檔] |
```

- 不放插圖、不旋轉、不用問句、不用箭頭。容器 padding 24px，寬度上限 640px；高度與有資料時的總覽首屏相同，避免跳動。
- 首次訪客的主要路徑是示範資料（Geist empty state 的 Guide 型），所以示範是主要按鈕；資料來源頁的主次則依是否有資料決定（§7.7.1）。

**區段空狀態規則（全站，C10）**

| 情境 | 標題 | 說明（≤ 14 字，EC ProfitLens 依中文改定的規則；參考 Stripe 的每句 < 14 words） | 動作 |
|---|---|---|---|
| 尚無待辦 | 尚無待辦。 | 從健檢結果或會議決議新增。 | 新增待辦 |
| 篩選無結果 | 沒有符合篩選的商品。 | — | 清除篩選 |
| 沒有方案 | 尚無方案。 | 新增後就能試算。 | 新增方案 |
| 會議沒有選入方案 | 本次沒有選入方案。 | 到假設試算選入。 | 前往假設試算 |
| 會議歷史為空 | 還沒有結束的會議。 | 結束會議後會出現在這裡。 | — |
| 健檢沒有結果 | 本期沒有需要處理的項目。 | 8 條規則都沒有觸發。 | 查看健檢規則 |
| 錯誤 | 資料無法載入。 | 一行原因 | 重新載入（主要）、回到上次成功的資料、查看問題清單 |
| 零值（不是空） | 不用空狀態，照常顯示「0 元」；分母為 0 時寫「不適用」 | — | — |

- 區段空狀態的樣式：1px 虛線 `--border-default`、radius 6px、padding 16px、14px 一般字重；高度和該區段有資料時的最小高度相同。
- 載入骨架與錯誤狀態都沿用同一個容器高度；骨架用 `--bg-subtle` 色塊，不做 shimmer 動畫。
- 示範資料的標示：資料狀態按鈕寫「示範資料」，popover 第一行寫「示範資料（虛構）」，只出現這一處。

**驗收**：`globals.css` 不含裝飾性 `rotate(`（X4 的例外：`@keyframes spin`、disclosure 指示）；空狀態按鈕文字都是「動詞＋名詞」；載入示範資料前後，KPI 區塊位置不跳動（CLS < 0.05）。

---

## 8 語言與文案規範

### 8.1 三層語言規則

| 層 | 長度 | 必要成分 | 禁止 | 範例 |
|---|---|---|---|---|
| L1 結論 | 每個子句 ≤ 14 個中文字（數字、單位、正負號、通路名不計）；本期一句話最多兩個子句、全句 ≤ 40 字 | 主詞（指標或通路）＋方向詞＋金額或比率 | 寫原因、寫限制、「注意」、數字前加形容詞 | 「扣廣告後少賺 59.9 萬」「折扣多花 118.8 萬」「平台 · MARKETPLACE 扣完廣告虧 6.1 萬」 |
| L2 解讀 | 1–2 句，每句 ≤ 30 字，合計 ≤ 60 字 | 第一句寫比較對象或最大來源；第二句用動詞開頭寫下一步；限制最多一句，放在最後 | 「注意：」前綴、擬人、重複畫面上已經有的資訊 | 「折扣率從 9.0% 升到 18.0%。先列出本期的促銷檔期，核對折扣有沒有換到足夠的銷量。」 |
| L3 依據 | 不限 | 中文階梯公式、技術公式、到分的金額、檔名:行號、代號、版本 | 換算成萬元 | `contribution_after_marketing = CM_before − A（contribution-v1）` |

### 8.2 句型

| 用途 | 句型 | 範例 |
|---|---|---|
| 扣廣告後貢獻的變化 | `{指標} {值}，比上期{多賺／少賺} {差}（{±%}）` | 扣廣告後貢獻 127.0 萬，比上期少賺 59.9 萬（−32.0%） |
| 費用的變化 | `{費用}{多花／少花} {差}` | 折扣多花 118.8 萬 |
| 收入、件數的變化 | `{指標}{多／少} {差}` | 淨營收多 170.9 萬 |
| 比率的變化 | `{比率}從 {a} {升到／降到} {b}`；KPI 差額行寫 `{升／降} {Δ 絕對值} 個百分點` | 折扣率從 9.0% 升到 18.0%；降 14.3 個百分點 |
| 上期 ≤ 0 | `{指標}{由負轉正／轉為虧損}，本期 {值}`；不顯示成長率 | 扣廣告後貢獻轉為虧損，本期 −6.1 萬 |
| 下一步 | 用動詞開頭：先列出…、核對…、到{頁}看… | 先確認這兩項的通路歸屬，再決定要調投放、價格，還是商品組合。 |
| 限制 | 平述的肯定句，次要樣式，放在最後 | 差額說明發生了什麼，原因還需要確認。 |
| 圖表標題與副標 | 標題寫結論句，標準名稱放副標；副標同時作為 aria 描述 | 標題「少賺 59.9 萬，最大一項是折扣（−118.8 萬）」；副標「貢獻變化拆解 · 上期 6/1–7/12 到本期 7/13–8/23」 |
| 錯誤 | `{檔名} 第 {行} 行：{問題}。{修法}。` | sales_daily.csv 第 12 行：日期格式不對。請改成 2026-08-01。 |
| 成功 | `已{動作}{對象}。` | 已複製週會摘要。已加入待辦「核對 8 月檔期折扣」。 |
| 確認對話框 | 標題 `要{動作}{對象}嗎？`；內文一句後果；按鈕寫動作本身，加「取消」 | 要清空目前資料嗎？／未下載的備份會消失。／清空資料・取消 |
| 空狀態 | `尚無{對象}。`＋`{何時會出現}。` | 尚無待辦。從健檢結果或會議決議新增。 |
| 份數 | 「10 項中 6 項」；空間不足才寫「6/10」 | 已對照 8／10 欄（表頭空間不足時） |
| 按鈕 | 2–6 字，動詞開頭 | 加入待辦、試算、套用、看明細、下載備份檔、匯出會議、複製週會摘要 |

**方向詞的固定用法**：多賺／少賺只用在扣廣告後貢獻與扣廣告前貢獻；多花／少花用在費用；多／少用在淨營收、商品毛利、件數；升到／降到用在比率；由負轉正／轉為虧損用在上期 ≤ 0。不寫「惡化」「爆量」「暴跌」「警告」。

### 8.3 名詞表（一個概念一個詞）

標「需拍板」的列，拍板前沿用 v2 用詞；拍板後在 V3-2 一次改完（含測試）。名詞表同時寫進 `docs/revamp-v3/GLOSSARY.md`，並作為指標定義對話框「名詞小辭典」的資料來源。

| # | 概念 | 英文 key | 定案用詞 | 短名（表頭空間不足時） | 一句定義（L2，用在 `?` 說明與指標定義） | 禁用的同義詞 | 需拍板 |
|---|---|---|---|---|---|---|---|
| 1 | 淨營收 | net_revenue | 淨營收（規則標題也一樣） | 淨營收 | 商品原價收入減折扣和退款，未稅，不含買家付的運費。 | 營收（指淨營收時）、銷售額 | — |
| 2 | 商品毛利 | gross_profit | 商品毛利（任何地方都不省略「商品」） | 商品毛利 | 淨營收減商品成本，還沒扣平台、金流、物流和廣告費。 | 毛利（單寫） | — |
| 3 | 通路貢獻 | contribution_before_marketing | **扣廣告前貢獻**（「通路貢獻」「行銷前貢獻」列為別名） | 扣廣告前 | 商品毛利再扣平台抽成、金流手續費、物流與包材費、其他變動費用，還沒扣廣告。 | 通路貢獻（主層） | D-V3-1 |
| 4 | 扣廣告後貢獻 | contribution_after_marketing | 扣廣告後貢獻 | 扣廣告後 | 扣廣告前貢獻再扣廣告投放費；還沒扣固定費和所得稅，不是公司淨利。 | 利潤、獲利、淨利、廣告後貢獻 | —（D1 已定） |
| 5 | 貢獻率 | contribution_margin | 扣廣告後貢獻率 | 貢獻率 | 每 100 元淨營收，扣完廣告後還剩幾元。 | — | — |
| 6 | 平台抽成 | platform_fees | 平台抽成（錯誤訊息也一樣） | 平台抽成 | 市集平台依成交收的手續費和佣金，例如蝦皮的成交手續費。 | 平台費 | — |
| 7 | 金流手續費 | payment_fees | 金流手續費 | 金流費 | 刷卡、貨到付款、電子支付等收款手續費；蝦皮稱「金流與系統處理費」。 | — | — |
| 8 | 物流與包材費 | fulfillment_costs | 物流與包材費 | 物流費 | 出貨運費、倉儲與包材支出；買家付的運費收入沒有抵掉。 | — | — |
| 9 | MER | mer | 廣告效率（MER） | MER | 淨營收除以廣告投放費，也就是每 1 元廣告對應幾元淨營收；這是全通路合計，算法和平台後台的 ROAS 不同。 | 廣告投報 | D-V3-5 |
| 10 | 退款比 | refund_ratio | 退款金額比 | 退款比 | 退款金額除以（原價收入減折扣），依退款日計算。 | 退貨率 | — |
| 11 | 影響 | contributionImpact | 影響金額 | 影響 | 這一項讓扣廣告後貢獻增加（正）或減少（負）多少，是兩期的實際差額。 | 對貢獻影響 | — |
| 12 | 差額 | change、csvSuffix.change | 差額（兩期比較）／增減（試算輸入）；L1 改用方向詞 | 差額 | 本期減上期的實際金額，不是預測，也不是可以省下的錢。 | 變化、變動（兩期比較時） | — |
| 13 | 抽屜 | evidence、buttons.viewEvidence | 計算與來源（抽屜）／看明細（按鈕） | 明細 | 這個數字的公式、組成項目，以及原始檔名和行號。 | 看證據、怎麼算的、公式與來源 | D-V3-3 |
| 14 | 抽屜段落 | evidence.sourcesTitle | 原始明細 | — | 計算用到的 CSV 列，附檔名和行號。 | 來源資料 | — |
| 15 | 口徑對話框 | basis.title | 指標定義 | 定義 | 九條固定規則，說明數字算了什麼、沒算什麼。 | 口徑說明 | D-V3-2 |
| 16 | 金額口徑 | importWizard.basis | 金額基準（未稅／含稅） | — | 匯入的金額是未稅還是含稅；含稅會先換算成未稅。 | 金額口徑 | D-V3-2 |
| 17 | 口徑限制（CSV 欄） | csvColumns.basis_note | 解讀限制（english_key 不變） | — | 解讀這個數字時要知道的限制。 | 口徑限制 | D-V3-2 |
| 18 | 待辦 | nav.actions、excelExport.sheets | 待辦（導覽、Excel 工作表、會議議程全部統一）；置頂待辦 | 待辦 | 要做什麼、誰負責、何時到期、何時喊停，每項都記住引用的數字。 | 行動、置頂行動 | D-V3-4 |
| 19 | 會議 | nav.meeting | 會議紀錄（頁）／本次會議（草稿）／已結束會議／一頁摘要（匯出物） | 會議 | 本次議程、決議與上次會議的比較，結束後就固定。 | 會議稿、主管摘要、會議摘要 | — |
| 20 | 健檢 | nav.diagnosis | 通路健檢（頁）／健檢結果（區塊） | 健檢 | 用 8 條固定規則檢查各通路與費用的變化，資料缺漏排最前。 | 自動健檢（標籤） | — |
| 21 | 本期三件事 | sections.topThree | 本期三件事（總覽）／本期重點（會議議程）；不足 3 件時寫「本期要先看的事（{n} 件）」 | 三件事 | 依影響金額排出最該先處理的三組健檢結果，資料缺漏排最前。 | — | — |
| 22 | 假設試算 | nav.scenarios | 假設試算（頁）／試算（按鈕）／要賣到多少才划算（敏感度區塊） | 試算 | 如果調整銷量、折扣、物流費或廣告預算，單一通路的扣廣告後貢獻會變多少。 | 計算（按鈕）；敏感度區塊不叫「損益兩平」（保留給 F12） | — |
| 23 | 相關數字 | sections.data | 相關數字 | — | 這條健檢引用的兩期數字，每個都能點開看明細。 | 數據 | — |
| 24 | 輔助指標 | sections.assistKpis | 其他常用指標 | 常用指標 | 件數、件均、毛利率、費用佔比與 MER，用的是同一份資料，不列入貢獻計算。 | 輔助指標 | — |
| 25 | 空值 | status.missing、notApplicable | 資料待補／不適用 | — | 缺的資料不當成 0；分母不成立時不算比率。 | —、N/A、0（表示空值時） | — |
| 26 | 資料狀態 | status.ready | 資料到 {date} | — | 目前資料已通過檢核，最後一天是 {date}。 | 資料就緒 | — |
| 27 | 工作區 | workspaceLabel、breadcrumbRoot | 主層不顯示；儲存相關訊息寫「目前的資料與紀錄」；備份檔與技術細節保留「工作區」 | — | — | 我的工作區（主層） | — |
| 28 | 公開示範版 | modeBadge.publicDemo | 公開示範站（只在 popover 出現） | 示範站 | 任何人都能開的公開版本，不使用 AI，也不保存資料。 | 公開版 | — |
| 29 | 資料 | — | 資料 | — | — | 數據 | — |
| 30 | 台／臺 | — | 全站統一（建議「台」：新台幣、台北時間）；法規引用維持原文 | — | — | 另一種寫法 | D-V3-6 |

**業界說法對照（CM 對照）**：只放在指標定義對話框的「業界說法對照」段落與抽屜的指標定義段，不放主標（D-V3-18）。

| EC ProfitLens | 業界常見說法 | 差異說明（必寫） |
|---|---|---|
| 商品毛利 | Gross profit | — |
| 扣廣告前貢獻 | 近似 Daasity 的 CM1（毛利減運費、履約、金流與平台費） | Daasity 定義見 https://help.daasity.com/core-concepts/contribution-margin （引自市場調研 §4）。差異：EC ProfitLens 不抵買家付的運費收入，而且「其他變動費用」由使用者匯入，所以**不宣稱等同** |
| 扣廣告後貢獻 | 近似 Daasity 的 CM2（CM1 再扣行銷費與 trade spend） | 差異：EC ProfitLens 只扣廣告投放費，不含 trade spend；停在扣廣告後，不含固定費與稅，不是淨利。（Daasity 只定義 CM1、CM2，本表不引用 CM3） |

### 8.4 文字規則與黑名單

1. 不用箭頭字元（→ ↗ ▸ ▾），也不用「注意：」前綴。
2. 主層的否定句每頁最多 3 句，口徑和既有 `copy-density` 完全一致：計數詞是「不是、不等於、不代表、不可」，排除規則卡的 caution 句（`RULE_CAUTIONS`）。V3-2 把這個計數延伸到全部 5 頁（§5.4）。能改成肯定句就改。
3. 不擬人，不寫「我們發現」「智慧洞察」「AI 建議」；不用驚嘆號和表情符號。
4. 主層不放英文代號：TWD 改成「元」；刪除 NT$；SKU 只出現在表頭「商品（SKU）」與商品格；DTC、MARKETPLACE 只出現在示範資料的 alias，所有通路都選時寫「全部通路」。
5. 分隔符：同一行的多段資訊用「 · 」（前後各一個半形空格），不用「｜」。
6. **黑名單**（`tests/copy-style.test.ts` 檢查 labels 主層值；`technical` 子樹與 `basis.aliases` 例外）：

| 類別 | 禁用 | 改用 |
|---|---|---|
| 同義詞 | 行動（指待辦時）、看證據、怎麼算的（當抽屜名時）、公式與來源、數據、變化（兩期比較時）、N/A、—（當空值時）、通路貢獻（D-V3-1 通過後）、口徑（D-V3-2 通過後）、工作區（主層）、資料就緒、營收（指淨營收時） | 見 §8.3 |
| R2 禁用詞（併入 `docs/revamp/03_GLOSSARY_COPY.md` §1 第 5 點，主層不得出現，技術細節可） | 取分、快照、稽核（含「稽核資訊」）、fact、facts、ID、hash、revision、schema、metric_version、contribution-v1、cohort、blocking、partial、null、JSON（匯出選單除外） | 白話說法（例如「這份紀錄在 10/5 結束」「版本與來源資訊」）；版本字串放 L3 |
| 語氣 | 我們、智慧、洞察、AI 建議、立即、馬上、開始吧、一鍵、輕鬆、強大、驚嘆號、表情符號 | 中性陳述 |
| 情緒詞 | 惡化、爆量、暴跌、警告（文案中）；「危險」只用在危險區標題 | 方向詞（§8.2） |
| 裝飾字元 | → ↗ ▸ ▾ ①–⑳ ★ ☆ ⓘ ●，以及主層標題中的「｜」 | SVG 圖示、`<ol>`、主標＋副標 |
| 前綴 | 「注意：」 | 平述句，放在最後，用次要樣式 |

### 8.5 數字格式

全部實作在 `src/application/presentation.ts` 與 `copy.ts`。新增 `formatAmountL1`、`formatAmountL2`、`formatAmountL3`、`formatSignedDelta`、`formatRatePoints`、`formatEmpty`、`formatDateL1`，並讓 `formatHeadlineAmount` 支援「億」。**不動 `src/domain`。**

| 類型 | L1（KPI、標題、一句話、三件事） | L2（一般表格、相關數字、通路表） | L3（抽屜、橋接表、對帳表、原始明細、匯出） |
|---|---|---|---|
| 金額 ≥ 1 億 | 1.25 億（兩位小數） | 125,034,120 | 125,034,120.37 |
| 金額 ≥ 1 萬 | 785.1 萬（一位小數） | 7,850,658 | 7,850,657.90 |
| 金額 < 1 萬 | 8,420 元 | 8,420 | 8,420.00 |
| 差額 | +170.9 萬／−59.9 萬 | +1,709,082／−598,834 | +1,709,082.18／−598,833.95 |
| 比率 | 16.2% | 16.2% | 16.17% |
| 比率差 | 降 14.3 個百分點 | −14.3 個百分點 | −14.25 個百分點 |
| 成長率 | +27.8%（上期 > 0 才顯示；比率類指標不顯示） | 同左 | +27.83% |
| 倍數 | 11.4 倍 | 11.4 倍 | 11.40 倍 |
| 件數 | 7,420 件 | 7,420 | 7,420 |
| 件均 | 1,058 元／件 | 1,058 | 1,058.04 元／件 |
| 缺資料 | 資料待補 | 資料待補 | 資料待補（附原因碼） |
| 分母 ≤ 0 | 不適用 | 不適用 | 不適用（附原因碼，例如 zeroAds） |
| 零值 | 0 元 | 0 | 0.00 |

**規則：**

1. **一律從精確值取位，用 HALF_UP。** 差額先用精確值相減再取位，所以可能和兩個顯示值直接相減差 0.1，這一點要在抽屜的 L3 說明（和 METRICS.md 中日均差「差一分」的處理方式相同）。兩個寫進單元測試的例子：
   - 扣廣告後貢獻成長率：−598,833.95 ÷ 1,868,626.68 = −32.047…%，L1 顯示「−32.0%」。不是先取兩位得到 −32.05%，再取一位得到 −32.1%。
   - 貢獻率：顯示值 16.2% − 30.4% = −14.2，但從精確值取位的差額是「降 14.3 個百分點」。
2. **負號**：UI 用 U+2212「−」，正的差額加「+」，零不加符號，正負號和數字之間不空格。CSV、JSON 保留 ASCII「-」（機器可讀）。列印、PDF 與 Excel 的管理損益表是否改用括號 (1,234)，見 D-V3-8（建議：只有這三處用括號）。
3. **零值不用台灣財報的「-」**：EC ProfitLens 的原則是「缺的不是零」。零值若用「-」，很容易和「資料待補」混淆，所以真正的 0 一律顯示 0，空值只寫「資料待補」或「不適用」。
4. **同一行只用一種尺度**：L1 的影響金額也用萬（−118.8 萬）。不能出現「118.8 萬」和「−1,188,365.10」並列。
5. **單位只標一次**：區塊或表頭寫「（元）」或「金額單位：元，未稅」，儲存格內不重複；只有單獨出現的 KPI 大數字才帶「萬」或「元」。NT$ 與 TWD 只出現在匯出的 metadata。
6. **對齊**：全部數字用 tabular-nums；表格的數字欄與表頭都右對齊；KPI 大數字靠左對齊。檔名、行號、原因碼、英文 key 用等寬字。
7. **千分位**：4 位數以上加半形逗號；行號、年份、日期、ID 不加。
8. **有利或不利**：`metricDefinitions` 為每個指標加上 `favorableDirection: "up" | "down"`（費用類為 down），這是呈現層的屬性，**不進 domain**。顏色與「有利／不利」文字都依這個屬性決定，不依數學正負號；顏色一定搭配正負號或方向詞。
9. **L1 用萬／億是刻意偏離** Shopify（不縮寫數字）與 Microsoft（UI 避免 K、M、B 縮寫）的建議：中文以萬為自然計數單位，摘要層空間有限；L2 表格與 L3 抽屜、匯出一律附整數元或到分的精確值（抽屜標題下一行永遠顯示精確值，RK15）。不要把這兩個來源當成 L1 用萬的依據。

### 8.6 日期與期間

| 位置 | 格式 | 例 |
|---|---|---|
| 主層（同一年） | M/D | 8/24 |
| 主層範圍 | M/D–M/D（天數） | 7/13–8/23（42 天） |
| 跨年 | YYYY/M/D | 2025/12/29–2026/1/25 |
| L3、匯出、匯入範例 | ISO | 2026-08-24 |
| 匯出版頭 | YYYY-MM-DD 至 YYYY-MM-DD（天數） | 2026-07-13 至 2026-08-23（42 天） |
| 日期輸入框 | 瀏覽器原生 `type=date`（顯示格式受作業系統語系影響，不強制） | — |

天數一律寫出來，因為兩期的天數可能不同。

### 8.7 標點

- 中文用全形標點。
- 數字和中文單位之間空一個半形空格（118.8 萬、11.4 倍、7,420 件）。
- 數字和 % 之間不空格（16.2%）。
- 正負號和數字之間不空格（−59.9 萬）。
- 範圍用 en dash「–」，不加空格（7/13–8/23）。
- 同一行的多段資訊用「 · 」分隔。
- 份數寫「10 項中 6 項」，空間不足時才寫「6/10」。
- 句子用「。」結尾，按鈕與標籤不加句號；空狀態標題加句號（「尚無待辦。」）。

### 8.8 改寫範例（v2 → v3 完整對照；全量清單見 `docs/revamp-v3/copy-rewrite.csv`）

| # | 位置 | 改版前 | 改版後 L1 | 改版後 L2 | L3 |
|---|---|---|---|---|---|
| 1 | KPI 扣廣告後貢獻 | 扣廣告後貢獻 1,269,792.73／上期 1,868,626.68／-598,833.95 -32.05% | 扣廣告後貢獻 127.0 萬，比上期少賺 59.9 萬（−32.0%） | 淨營收增加了，但費用增加得更多；最大一項是折扣多花 118.8 萬。 | `CM_after = CM_before − A`；本期 1,269,792.73 元，上期 1,868,626.68 元，差額 −598,833.95 元 |
| 2 | KPI 貢獻率 | 貢獻率 16.17%／上期 30.43%／-14.25 百分點 | 扣廣告後貢獻率 16.2%，降 14.3 個百分點 | 每 100 元淨營收，扣完廣告剩約 16 元；上期剩約 30 元。 | `CM_after ÷ N`（N > 0 才計算） |
| 3 | 三件事第 1 件 | 折扣率從 9.01% 升到 18.01%，折扣多花 118.8 萬／對貢獻影響 -1,188,365.10／…／注意：降折扣要先看銷量反應 | 折扣多花 118.8 萬（影響 −118.8 萬） | 折扣率從 9.0% 升到 18.0%。先列出本期的促銷檔期，核對折扣有沒有換到足夠的銷量。（限制）降折扣前，先看銷量會不會跟著掉。 | DISCOUNT_BURDEN_UP；discounts 差額 +1,188,365.10 元 |
| 4 | 規則 REV_UP_CM_DOWN | 營收多了 170.9 萬，但扣完廣告反而少賺 59.9 萬 | 淨營收多 170.9 萬，卻少賺 59.9 萬 | 成長被費用吃掉了。先看貢獻變化拆解中扣最多的兩項，再到通路健檢確認是哪個通路。 | ΔN > 0 且 ΔCM_after < 0 |
| 5 | 規則 NEGATIVE_CHANNEL_CM | 平台 · MARKETPLACE 本期扣完廣告是虧的（−61,170） | 平台 · MARKETPLACE 扣完廣告虧 6.1 萬 | 這個通路的平台抽成和廣告費加起來超過商品毛利。先確認兩項的通路歸屬，再決定要調投放、價格，還是商品組合。 | CM_after(channel) < 0 |
| 6 | 橋接說明 | 注意：這是兩期的實際差額，不是可以省下的錢；合計已包含各通路。 | 少賺 59.9 萬，最大一項是折扣（−118.8 萬） | 每一項都是兩期的實際差額，九項加起來就是總差額。 | 九項加總與總差額相符到分 |
| 7 | 頂欄 | ● 資料就緒｜營運示範｜12 週示範資料 · 資料到 2026-08-24｜公開示範版｜自動健檢可用｜AI 解釋未啟用（公開版）｜● 未保存 | 示範資料 · 資料到 8/24　AI 未啟用　未保存 | （popover）公開示範站：計算都在你的瀏覽器完成，沒有使用 AI。 | dataset_id、資料版本、PUBLIC_DEMO |
| 8 | KPI 提示 | 未稅 TWD · 點數字看怎麼算的 ↗ | 金額單位：元，未稅 | — | decimal 精確計算，顯示時 HALF_UP |
| 9 | MER | 廣告投報（MER） 11.40 倍／上期 18.73 倍 | MER 11.4 倍，上期 18.7 倍 | 每 1 元廣告對應 11.4 元淨營收（全通路合計），算法和平台後台的 ROAS 不同。 | N ÷ A（A = 0 時「不適用」） |
| 10 | 輔助指標標題 | 輔助指標／給經理人熟悉的數字；標示「輔助」，不混入上方的財務核心。 | 其他常用指標 | （`?` 說明）件數、件均、毛利率、費用佔比和 MER，不列入貢獻計算。 | assist-kpi-v1 |
| 11 | 三件事圖例 | 負＝對貢獻不利（紅）、正＝有利（綠）；資料缺漏永遠排最前 | 依影響金額排序 | （`?` 說明）負數表示讓扣廣告後貢獻變少；資料待補排最前。 | — |
| 12 | 期間列說明 | 快捷只填入日期，按「套用」才生效 | （刪除；依 D-V3-10） | — | — |
| 13 | 範圍說明 | 目前範圍：官網 · DTC、平台 · MARKETPLACE · 等天數比較（上期 42 天 / 本期 42 天） · 資料到 2026-08-24 · … | 本期 7/13–8/23 對比 上期 6/1–7/12（各 42 天） | — | — |
| 14 | 三件事範圍標籤 | 合計（官網 · DTC、平台 · MARKETPLACE） | 全部通路 | — | — |
| 15 | 抽屜標題 | 對貢獻影響｜合計（官網 · DTC、平台 · MARKETPLACE） 折扣率從 9.01% 升到 18.01%，折扣多花 118.8 萬｜怎麼算的 | 折扣多花 118.8 萬 | （副標）影響金額 · 全部通路 · 7/13–8/23 | — |
| 16 | 空狀態 | 先用示範資料看看／營收漲了，到底多賺還是少賺？／按「試試示範資料」→ … | 還沒有資料 | 匯入銷售、通路費用、廣告三份日報 CSV，或先用示範資料（虛構）看看。 | fixtures/demo |
| 17 | 頁尾 | 扣廣告後貢獻不含固定費與稅；兩期差額不等於原因 → 口徑說明 | 扣廣告後貢獻不含固定費與稅。［指標定義］ | — | — |
| 18 | 待辦說明 | 每項待辦都記住…；最多置頂三項。／依執行狀態分四欄；用卡片上的「移到…」… | （`?` 說明）最多置頂 3 項，置頂項目會列入會議摘要。 | — | — |
| 19 | 試算輸入說明 | 例：多賣 10% 填 +10（範圍 −90 到 +100，維持現況請填 0） | placeholder「+10 表示多賣 10%」 | 超出範圍時：「請填 −90 到 +100 之間的數字」 | — |
| 20 | 試算聲明 | 我了解這是假設試算，不是預測 | 我了解這是試算，不是預測 | — | — |
| 21 | 首次保存提示 | 要不要把工作區存在這台電腦？（不上傳） | 在這台電腦自動保存工作區？ | 資料不會上傳。 | — |
| 22 | 會議議程 | ① 兩個關鍵差額 … ⑥ 置頂行動 | 1. 關鍵數字 2. 本期重點 3. 各通路表現 4. 上次決議追蹤 5. 選入方案 6. 置頂待辦 | — | — |
| 23 | 商品排序 | 由小到大（先看下降） | 商品毛利差額：下降最多優先 | — | — |
| 24 | 資料問題連結 | 看 {n} 項資料問題 → | 查看 {n} 項資料問題 | — | — |
| 25 | 總覽區塊小標 | TREND／CONTRIBUTION BRIDGE／CHANNEL MIX | （刪除）每週淨營收與扣廣告後貢獻；貢獻變化拆解；各通路扣廣告後貢獻 | 每 7 天一組，缺資料的週不畫線。 | 期末不足 7 天的天數單獨成組 |
| 26 | 匯入錯誤 INVALID_DATE | 日期格式要是 2026-08-01（第 {line} 行） | 見 §7.7.3（錯誤文案的唯一規格） | 見 §7.7.3 | 見 §7.7.3 |
| 27 | 匯入錯誤 MISSING_PLATFORM_FEES | 第 {line} 行的平台費空白；沒有請填 0，不知道才留白 | 見 §7.7.3（錯誤文案的唯一規格） | 見 §7.7.3 | 見 §7.7.3 |
| 28 | 匯入精靈標題 | 匯入資料｜對照欄位 | 匯入資料 | （stepper）步驟 2 · 對照欄位 | — |

### 8.9 改名的溝通（給既有 v2 使用者）

- **「這版改了什麼」說明**：只在偵測到 v2 的 IndexedDB 工作區或還原 v1–v4 備份檔時（也就是既有 v2 使用者），v3 第一次載入後在頁首下方顯示一行可關閉的提示；沒有 v2 資料的新訪客不顯示（首屏量測也以新訪客為準，§2.3 B）。提示文字：「這一版改了部分名稱，例如『通路貢獻』改為『扣廣告前貢獻』。查看名詞對照」。連結開啟指標定義對話框的「名詞小辭典」，並捲到「v2 舊名」段落。已讀狀態記在 localStorage（try/catch 包住，讀不到就再顯示一次，不影響功能）。
- **舊名搜得到**：`basis.aliases` 補上所有舊名（通路貢獻、行銷前貢獻、行銷後貢獻、邊際貢獻、口徑、看證據、怎麼算的、公式與來源、行動、輔助指標、廣告投報）。在名詞小辭典輸入舊名，可以找到新名詞與定義。
- **匯出相容性**：CSV 的欄名與欄序不變（`english_key` 不變，D11），只能新增欄。Excel 工作表改名（例如「行動」改「待辦」）會影響使用者在 Excel 寫好的跨表公式，所以要在 `docs/DECISIONS.md` 記一筆，並在 RELEASES 的「破壞性變更」段明寫舊名與新名的對照。
- **已結束的會議與舊備份**：數字、決議、備註與當時的快照內容一律不改。介面的欄名與按鈕用新名詞重新渲染。已經下載過的歷史 Markdown 檔不會變。是否在已結束會議的頂部加註「本紀錄建立於 v2，部分名稱已更新」，見 D-V3-22。

### 8.10 labels 結構重整與遷移

- 依「頁面 › 區塊 › 元件」重新分組：`shell.*`、`overview.*`、`diagnosis.*`、`products.*`、`scenarios.*`、`actions.*`、`meeting.*`、`data.*`、`importWizard.*`、`evidence.*`、`exports.*`、`storage.*`、`empty.*`、`errors.*`、`glossary.*`、`format.*`、`summary.weekly.*`。
- 每個可讀單元的形狀：`{ headline, explain?, caution?, technical? }`。規則卡既有的 `title`／`cause`／`nextStep`／`caution` 對應如下：title → headline，cause＋nextStep → explain，caution → caution。**舊 key 保留成 alias 指向新 key，到 V3-10 才移除**；移除的只是 key，不是功能。
- 刪除「R2 元件層字串（由盤點產生）」那段帶引號的 key 區段（labels:561），以及元件中用 `split` 繞道取字的寫法（`dashboard.tsx:58–60`、`multi-scenario-workbench.tsx:14–15`）。
- 硬編碼中文全部搬進 labels：`overview.tsx:119、151`、`workspace-panels.tsx:34、61`、`scenario-sensitivity.tsx:48、52、53`、`decision-workbench.tsx:168`。`labels.ui.overview.periodModeTechnical`、`periodRoundingTechnical` 已經存在但沒有被引用，直接接上。
- 測試斷言一律 `import { labels } from "@/i18n"`，和改名在同一批完成，不留硬編碼。
- **人工審稿**：V3-0 產出 `docs/revamp-v3/copy-rewrite.csv`（欄位：key、v2 文案、v3 L1、v3 L2、v3 L3、對應規則、需拍板代號），使用者審過之後，V3-2 才動 labels。

---

## 9 視覺設計系統（tokens 與元件規格）

> 實作方式：只在 `src/app/globals.css` 的 `:root` 新增 CSS 自訂屬性。既有 class 名稱保留，逐頁把寫死的值換成 `var(--*)`。不加 UI 套件、不加字型、不整檔重寫。**元件只能引用語意別名層**（`--bg-*`、`--text-*`、`--border-*`、`--accent*`、`--unfavorable*` 等），不能直接引用原始色階（`--gray-*`、`--green-*`）。

### 9.1 色彩 token

**原始色階（只在 `:root` 使用）**

```css
:root {
  /* 中性灰：略帶綠，延續品牌但降低飽和 */
  --gray-0:   #ffffff;
  --gray-25:  #f6f7f7;
  --gray-50:  #f1f3f3;
  --gray-75:  #eef1f0;
  --gray-100: #e8ecec;
  --gray-150: #e4e7e7;
  --gray-200: #d3d8d8;
  --gray-300: #a9b1b1;
  --gray-400: #7f898b;
  --gray-500: #5f6a6d;
  --gray-700: #4a5558;
  --gray-900: #1b2426;
  /* 品牌深綠 */
  --green-50:  #e7f0ee;
  --green-200: #9cc1b8;
  --green-600: #1f5a4f;
  --green-700: #17483f;
  /* 狀態 */
  --red-50:    #fbeeec;  --red-600:   #b03a2e;
  --amber-50:  #fdf3dc;  --amber-700: #8a5a00;
  --leaf-50:   #eaf3ec;  --leaf-600:  #2d6a3e;   /* 只在 D-V3-7 選 B 時使用 */
}
```

**語意別名（元件只能用這一層）**：下表的對比值由 2026-10-05 的 WCAG 公式計算，V3-1 的 `scripts/contrast-check.mjs` 會在 CI 中重新驗證。

| token | 值 | 用途 | 對比 |
|---|---|---|---|
| `--bg-page` | `var(--gray-25)` #f6f7f7 | 頁面底、期間列底 | — |
| `--bg-surface` | `var(--gray-0)` #ffffff | 面板、抽屜、選單、頂欄 | — |
| `--bg-subtle` | `var(--gray-50)` #f1f3f3 | 表頭、看板欄底、檔期區帶、會議結束標示 | — |
| `--bg-sidebar` | `var(--gray-75)` #eef1f0 | 側欄（比頁面略深，讓導覽退到後面） | — |
| `--bg-hover` | `var(--gray-100)` #e8ecec | 按鈕與表格列的 hover | — |
| `--border-subtle` | `var(--gray-150)` #e4e7e7 | 分隔線、表格列線、面板外框 | 裝飾用，不要求 3:1 |
| `--border-default` | `var(--gray-200)` #d3d8d8 | 次要按鈕外框、卡片、空狀態虛線 | 裝飾用 |
| `--border-input` | `var(--gray-400)` #7f898b | 輸入框、select、checkbox 外框（需要辨識的控制項邊界）；number-link 的虛線底線（刪除 kpiHint 後，它是「可以點」的唯一提示，屬於辨識元件所需的資訊） | 白底 3.59、頁面 3.34、subtle 3.22、hover 3.01（≥ 3:1） |
| `--border-strong` | `var(--gray-300)` #a9b1b1 | 小計線、拖放區虛線（旁邊另有檔案槽與按鈕）、empty 狀態點（旁邊一定有文字） | 裝飾用（白底 2.19、頁面 2.04；不可用在 number-link 底線或圖表資料） |
| `--text-primary` | `var(--gray-900)` #1b2426 | 標題、數字、正文 | 白底 15.83、頁面 14.75、subtle 14.21 |
| `--text-secondary` | `var(--gray-700)` #4a5558 | 次要文字、表頭、導覽 | 白底 7.69、subtle 6.90、側欄 6.76 |
| `--text-tertiary` | `var(--gray-500)` #5f6a6d | 說明、時間戳、分組標題、上期值、軸標 | 白底 5.57、頁面 5.19、subtle 5.00、側欄 4.90、hover 4.68（全部 ≥ 4.5） |
| `--text-disabled` | `var(--gray-300)` #a9b1b1 | 停用（不用來傳達資訊，一定搭配 `aria-disabled`） | — |
| `--accent` | `var(--green-600)` #1f5a4f | 主要按鈕底、文字按鈕、active 導覽線、焦點框、本期資料系列、KPI 強調線 | 白底 7.97；在 `--accent-subtle` 上 6.87 |
| `--accent-hover` | `var(--green-700)` #17483f | 主要按鈕 hover | — |
| `--accent-subtle` | `var(--green-50)` #e7f0ee | 選中的分段鈕底、「進行中」狀態標籤底 | — |
| `--accent-border` | `var(--green-200)` #9cc1b8 | 選中的分段鈕外框 | — |
| `--on-accent` | `#ffffff` | 主要按鈕文字 | 7.97 |
| `--unfavorable` | `var(--red-600)` #b03a2e | 不利金額、錯誤、逾期、危險按鈕 | 白底 6.02；在 subtle 底上 5.31 |
| `--unfavorable-subtle` | `var(--red-50)` #fbeeec | 「不利」標籤底、錯誤訊息底 | — |
| `--warning` | `var(--amber-700)` #8a5a00 | 資料待補、受阻、提醒、過期 | 白底 5.93；在 subtle 底上 5.37 |
| `--warning-subtle` | `var(--amber-50)` #fdf3dc | 需要處理橫幅、「資料待補」標籤底 | — |
| `--favorable` | D-V3-7 A：`var(--text-primary)`；B：`var(--leaf-600)` #2d6a3e | 有利金額（一定搭配「+」與「有利」文字） | A 15.83；B 6.48 |
| `--favorable-subtle` | A：`var(--bg-subtle)`；B：`var(--leaf-50)` | 「有利」標籤底 | — |
| `--scrim` | `rgba(16,24,26,.32)` | 抽屜與對話框的遮罩 | — |

> **D-V3-7 建議 A**：依 Few 的色彩預算，只讓不利上色；有利用主文字色，加「+」與「有利」文字。這樣按鈕的綠、導覽的綠、正向的綠不會混在一起（X7）。語意色只有不利、警示兩種，不另外加紫色「資料待補」或藍色「資訊」色，資料待補一律用 warning。

**圖表色**

| token | 值 | 用途 | 白底非文字對比 |
|---|---|---|---|
| `--chart-current` | `var(--accent)` | 本期折線 | 7.97 |
| `--chart-previous` | `var(--gray-400)` #7f898b | 上期（實線 1.5px） | 3.59 |
| `--chart-yoy` | `var(--gray-400)`，虛線 4 4 | 去年同期（P1） | 3.59 |
| `--chart-total` | `var(--text-secondary)` #4a5558 | 瀑布的起訖柱、小計柱 | 7.69 |
| `--chart-unfavorable` | `var(--unfavorable)` | 瀑布中的不利項、負值長條 | 6.02 |
| `--chart-favorable` | D-V3-7 A：`var(--gray-400)` #7f898b，柱上標「+」；B：`var(--leaf-600)` | 瀑布中的有利項 | A 3.59；B 6.48 |
| `--chart-cat-1`…`4` | `#1f5a4f`、`#4f7cac`、`#c07a3a`、`#7a6aa8` | 通路類別色，依序使用，最多 4 個（EC ProfitLens 依示範資料通路數與色彩預算自訂的上限，不是 Carbon 的規範） | 7.97、4.36、3.45、4.71 |
| `--chart-other` | `var(--gray-500)` #5f6a6d | 第 5 個以上的通路合併為「其他」（加直接標籤，不靠顏色辨識；和上期的 `--gray-400` 區分） | 5.57（≥ 3:1，§2.3 C） |
| `--chart-grid` | `var(--border-subtle)` | 格線（只畫水平線，實線 1px） | — |
| `--chart-axis` | `var(--text-tertiary)` | 軸標 12px | 5.57 |
| `--chart-band` | `var(--bg-subtle)` | 檔期區帶 | — |

**焦點**：`:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }`，取代現行的 3px #18816f。

**深色模式**：本輪不做（v2 也沒有）。token 結構預留 `:root[data-theme="dark"]` 的位置，但本輪不宣告 `prefers-color-scheme` 規則；`body` 一律明確設定 `background: var(--bg-page)`。

### 9.2 字體與字級

- 字族（**不換字型**，沿用 v2 用 Arial 處理數字的做法，避開 Windows 正黑體數字不等寬的風險）：
  - `--font-sans: Arial, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif`
  - `--font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace`（檔名、行號、代號、hash）
- `body { font-variant-numeric: tabular-nums; }`，全站數字一律等寬；`td, th, .num, .metric-value` 再明確宣告一次。
- 字距一律 0（刪除 `.eyebrow` 1.7px、`h1` −.6px、`.brand small` 1.8px、`.tiny-tag` .6px）。
- 字重只用 400、500、600（刪除 550、650）。

| token | 字級／行高 | 字重 | 用途 |
|---|---|---|---|
| `--text-12` | 12／16 | 400／500 | 表頭（500）、時間戳、分組標題、徽章、狀態標籤、軸標（最小字級） |
| `--text-13` | 13／20 | 400／600 | 次要說明、L2 限制句、L3、副標、區段小標（600）、上期值 |
| `--text-14` | 14／22 | 400／500／600 | 正文、L2、表格內容、按鈕（500）、導覽、看板卡標題（600） |
| `--text-16` | 16／24 | 600 | 區塊標題（全站統一）、警示列標題 |
| `--text-20` | 20／28 | 600 | h1、本期一句話、抽屜標題 |
| `--num-24` | 24／32 | 600 | 次要大數字（會議關鍵數字、試算結果、手機的扣廣告後貢獻） |
| `--num-28` | 28／36 | 600 | KPI 數字、抽屜主值 |
| `--num-32` | 32／40 | 600 | 扣廣告後貢獻（全站唯一） |

三層語言的語意別名：`--type-l1-title: var(--text-16)`、`--type-l2: var(--text-14)`、`--type-l3: var(--text-13)`。全站共 8 級字（v2 是 21 種宣告值）。

### 9.3 間距、圓角、邊框、陰影、尺寸、動態

```css
:root {
  /* 間距（4px 網格） */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 24px; --space-6: 32px; --space-7: 48px;

  /* 圓角：只有三種 */
  --radius-sm: 4px;     /* 按鈕、輸入、select、狀態標籤、分段鈕 */
  --radius-md: 6px;     /* 面板、看板卡、選單、popover、抽屜、對話框、空狀態框 */
  --radius-full: 999px; /* 只用於計數徽章與狀態點 */

  /* 邊框 */
  --border-w: 1px;      /* 一般邊框與分隔線 */
  --rule-accent: 2px;   /* KPI 強調線、active 導覽線、stepper 目前步驟 */
  --rule-total: 2px;    /* 表格合計列上框線 */

  /* 陰影：只給浮層 */
  --shadow-overlay: 0 8px 24px rgba(16,24,26,.12), 0 1px 2px rgba(16,24,26,.08);

  /* 版面尺寸 */
  --topbar-h: 48px;  --period-bar-h: 48px;  --page-header-h: 56px;
  --sidebar-w: 220px; --content-max: 1440px;
  --gutter: 24px;     /* ≥ 768px；< 768px 時 16px */
  --drawer-w: 560px;  --drawer-w-wide: 640px; --drawer-w-narrow: 480px;
  --popover-w: 320px; --menu-w: 400px;

  /* 控制項與表格 */
  --control-h: 32px;  --control-h-sm: 28px; --control-h-touch: 40px;
  --row-h: 40px;      --row-h-compact: 32px;

  /* 圖表 */
  --chart-h-sm: 180px; --chart-h-lg: 320px;

  /* 動態 */
  --dur-fast: 120ms; --dur-base: 180ms; --ease: cubic-bezier(.2,0,0,1);

  /* 層級 */
  --z-sticky: 20; --z-overlay: 40; --z-drawer: 50; --z-toast: 60;
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 0ms !important; animation: none !important; }
}
```

**規則**

- **陰影**：只有選單、popover、抽屜、對話框、toast 可以有陰影（`--shadow-overlay`）。面板與卡片無陰影。
- **邊框**：面板外框用 1px `--border-subtle`；面板內的子區塊用上框線 1px `--border-subtle` 分隔，不加第二層外框；表格列線 1px `--border-subtle`；小計列上框線 1px `--border-strong`；合計列上框線 2px `--border-strong`。
- **格線**：12 欄，欄距 24px（手機 16px）；區段之間的垂直間距 32px，區段內 16px，列內元素 8px。
- **斷點**：390（手機）、768（平板）、1024、1280、1440。≤ 767px 是手機版面（底部分頁列）。E2E 四個尺寸（1440×1000、1280×900、768×1024、390×844）各落在一個區間。
- **密度**：同一種表格元件在同一頁只用一種列高。C2 緊湊表固定 32px（例如總覽的其他常用指標）；C3 資料表預設 40px，商品、資料來源、匯入頁可整頁切換成 32px 精簡模式（F18），切換時該頁所有 C3 表（含商品前 10 名兩表）一起變。

### 9.4 元件規格（C1–C23）

| 代號 | 元件 | 規格 | 用在 |
|---|---|---|---|
| C1 | **KPI 帶** MetricStrip | 一個容器：`--bg-surface`、1px `--border-subtle`、`--radius-md`。5 格之間用 1px `--border-subtle` 直線分隔，不做成 5 張卡。每格 padding 16px 20px，依序是：名稱 13／500 `--text-secondary`＋16px `?` icon 按鈕 → 主值（`--num-28`，強調格 `--num-32`）→ 差額行 13px（符號＋萬＋括號 %，依 `favorableDirection` 上色）→ 上期 12px `--text-tertiary`（number-link）→ 選填的 C18 目標細條或期間不符提示。強調格頂部 2px `--accent` 線，寬 1.25 倍。高 132px（有目標時 156px）。768 寬改成 3＋2；390 寬改成清單（強調格放第一列，用 `--num-24`，其他 4 項是「名稱｜數值｜差額」單行） | 總覽；會議關鍵數字（精簡版：2 格、`--num-24`） |
| C2 | **緊湊表** Key-value | 2–4 欄，列高 32px，列之間 1px `--border-subtle`；名稱靠左 13px，數值靠右、tabular | 其他常用指標、試算基準、資料狀態 popover |
| C3 | **資料表** DataTable | 見下方「表格規格」 | 所有表格 |
| C4 | **區段** Section | 不是卡片。標題列高 32px：左邊 h2（16／600），可接 C8 計數徽章，副標（13px 次要色）放在下一行；右邊放範圍文字（13px）與最多 1 顆主要按鈕、2 顆次要或文字按鈕。標題列和內容之間 12px；同一頁的區段之間 32px，或用 1px 分隔線 | 全站 |
| C5 | **面板** Panel | 只有一層：`--bg-surface`、1px `--border-subtle`、`--radius-md`、padding 24px（< 768 時 16px）、無陰影。**面板內不得再放帶框或帶底色的子容器**；子區塊用 24px 間距加 1px `--border-subtle` 上框線分隔 | 圖表框、表格容器 |
| C6 | **抽屜** Drawer | 見下方「抽屜規格」 | 計算與來源、待辦編輯 |
| C7 | **頂欄與資料狀態按鈕** | 頂欄 48px，`--bg-surface`，下緣 1px `--border-subtle`。資料狀態按鈕高 32px，8px 狀態點加 13px 文字；popover 寬 320px | 全站 |
| C8 | **狀態標籤（Lozenge）／計數徽章（Badge）** | 見下方「狀態規格」 | 嚴重度、待辦狀態、會議狀態、版本；導覽計數、標題計數 |
| C9 | **警示列** AlertRow | `<details>` 結構，列與列之間 1px `--border-subtle`，不做卡片。summary 格線是「狀態標籤（auto）｜L1 標題 16／600（1fr）｜影響金額 16／600 tabular（右對齊，160px）｜動作（auto）」。兩種變體：**摘要型**（summary 第二行常駐 L2：原因與下一步，14px 正文色；收合高 64px；展開內容只放限制、相關範圍、檔期後綴）；**清單型**（summary 只有一行，高 ≥ 48px；L2 原因與下一步只在展開後出現）。展開內容左側縮排 16px，依變體放：相關數字（C2）、原因與下一步（只有清單型）、限制（13px 次要色）、動作列靠左、最底的技術細節 | 摘要型：總覽三件事；清單型：健檢、會議本期重點 |
| C10 | **空狀態** EmptyState | 三型：頁面型（靠左，寬上限 640px，高度與有資料時的首屏相同，最多一主一次兩個動作）、區段型（1px 虛線 `--border-default`、`--radius-md`、padding 16px、高度與該區段有資料時的最小高度相同）、篩選型（同區段型，動作是「清除篩選」）。篩選變更用 `aria-live=polite` 宣告 | 全站 |
| C11 | **表單欄位** Field | label 13／500 在上方。input 與 select 高 32px（手機 40px），1px `--border-input`，`--radius-sm`，padding 0 8px，14px；focus 時邊框改 `--accent` 並加焦點框；錯誤時邊框改 `--unfavorable`，下方 12px 錯誤文字（`aria-describedby`）。所有 select 高度一致（修正 R1 遺留的高度不一）。**分段鈕**：高 28px、13px，群組外框 1px `--border-input`、`--radius-sm`；選中項是 `--accent-subtle` 底、`--accent` 字、`--accent-border` 框，設 `aria-pressed` 或 role=radiogroup。checkbox 與 radio 16px | 試算、匯入、待辦、會議、期間列 |
| C12 | **按鈕與 number-link** | 見下方「按鈕規格」 | 全站 |
| C13 | **看板卡** BoardCard | `--bg-surface`、1px `--border-default`、`--radius-md`、padding 12px、無陰影；hover 時邊框改 `--border-strong`；卡片間距 8px；收合高度 ≤ 96px | 待辦看板 |
| C14 | **選單／Popover／說明** | 白底、1px `--border-subtle`、`--radius-md`、`--shadow-overlay`；選單 padding 8px，popover padding 16px；選單項目高 36px（兩行時 52px）；分組標題 12／500 `--text-tertiary`；分隔線 1px。`?` 說明的觸發器是 16×16 icon 按鈕（aria-label「{名稱}的定義」），內容最寬 280px、13px，取代 `title` 屬性（觸控裝置看不到 title）。全部遵守 M1、M3 | 頂欄、工具列、KPI、表單 |
| C15 | **工具列** Toolbar | 高 40px，最多 5 個控制，靠左；匯出或筆數放在最右；768 以下自動換行 | 商品、健檢、待辦、資料問題表 |
| C16 | **圖表框** ChartFrame | 標題列（結論標題 16／600＋副標 13px＋右側圖例或「資料表」連結）→ takeaway 列（2–3 個數值，`--text-20` tabular）→ 圖（高度 `--chart-h-sm` 或 `--chart-h-lg`）→ `<details>`「資料表」（無障礙替代，保留 `.data-alternative`）。載入、空、錯誤、有資料四種狀態等高。圖本身 `aria-hidden`，副標當 aria 描述 | 趨勢、拆解、結構、通路 |
| C17 | **瀑布圖** Waterfall | 用既有 Recharts 的堆疊長條加透明基底實作（**不加套件**）；起訖柱與小計柱用 `--chart-total`；不利段用 `--chart-unfavorable`；有利段依 D-V3-7；每段上方標萬元值（12px）；段與段之間有 1px `--border-strong` 連接線；圖下方或右側一定有橋接表。鍵盤操作經由橋接表的 number-link（§7.1 第 5 點） | 貢獻變化拆解、本期利潤結構 |
| C18 | **目標細條** Bullet | 高 6px、寬 100%；底色 `--bg-hover`；實際值長條 `--text-secondary`，落後時改 `--unfavorable`；目標刻度 2×12px `--text-primary`；下方 12px 文字「目標 150.0 萬 · 差 −23.0 萬（−15.3%）」。不用圓形或 gauge | KPI 帶 |
| C19 | **Sparkline**（P2） | 高 16px、寬 64px；1.5px 線 `--text-tertiary`；只在最後一點畫 3px `--accent` 圓點，並對應右側數字；無軸、無框；`aria-hidden`，語意由旁邊的數字承擔 | 通路表「近 8 週」 |
| C20 | **Stepper** | 4 步水平排列（`<ol>`），每步是序號加 13px 步驟名；目前步驟用 600 字重加 2px `--accent` 下緣；完成的步驟加 SVG 勾；步驟之間用 SVG chevron；`aria-current=step` | 匯入精靈 |
| C21 | **通知** Notice／Toast | inline notice：左側 3px 語意色線、`--bg-subtle` 底、13px。toast：右下角、`--shadow-overlay`、4 秒後消失（reduced-motion 時不做動畫）、role=status | 全站 |
| C22 | **需要處理橫幅** Banner | 高 40px、左側 3px 語意色線、語意淡底、padding 8px 12px、14px；最多一個文字連結 | partial、篩選錯誤、去年同期不可用、會議範圍不同 |
| C23 | **期間列** PeriodBar | sticky，top 為 `--topbar-h`，高 48px，`--bg-page` 底，下緣 1px `--border-subtle`；內容見 §7.0 | 全站 |

**按鈕規格（C12）**

| 種類 | 樣式 | 規則 |
|---|---|---|
| 主要 | `--accent` 底、`--on-accent` 字、14／500、高 32px、左右 padding 12px、`--radius-sm`；hover 改 `--accent-hover` | 每個容器最多 1 顆；表格內與頂欄禁用 |
| 次要 | `--bg-surface` 底、1px `--border-default`、`--text-primary` 字；hover 改 `--bg-hover` | 預設的動作 |
| 文字 | 無框無底、`--accent` 字；hover 加底線 | 連結式動作（看明細、調整門檻、移到…） |
| 危險 | `--bg-surface` 底、1px `--unfavorable`、`--unfavorable` 字；確認對話框中改成 `--unfavorable` 底、白字 | 只放在危險區與確認對話框 |
| icon | 32×32（手機 40×40），一定要有 aria-label | 指標定義、關閉、置頂、`?` |
| 停用 | 不透明度 .5、`cursor: not-allowed`（取代現行的 `cursor: wait`）；處理中用 16px spinner 加 `aria-disabled` | — |

- 按鈕列：`display:flex; gap: 8px; justify-content: flex-start;`，主要按鈕放最前面。區塊標題列的動作靠右；抽屜底部的動作列靠右，危險動作放最右。
- **number-link**：繼承文字色；常駐 `text-decoration: underline dotted 1px var(--border-input); text-underline-offset: 3px`（≥ 3:1）；hover 改 `underline solid var(--accent)`；focus 時顯示焦點框。取代「點數字看怎麼算的」這句說明。點擊目標 ≥ 24×24px（行高不足時用 padding 補足）。

**表格規格（C3）**

| 項目 | 規格 |
|---|---|
| 表頭 | 高度同列高；`--bg-subtle` 底；12／500 `--text-secondary`；數字欄的欄頭右對齊；可排序欄頭顯示 SVG 排序 icon，並設 `aria-sort`；sticky |
| 列 | 40px（精簡 32px）；儲存格 padding 0 12px；1px `--border-subtle` 下框線；不用斑馬紋；hover 改 `--bg-hover` |
| 數字欄 | 右對齊、tabular-nums；單位只寫在表頭，例如「本期（元）」 |
| 欄序 | 名稱 → 本期 → 上期 → 差額 → 差額 % →（佔淨營收 %）→ 備註。依據分開標明：本期與比較期並列、% 增減、備註欄取自 MOPS 月營收表；差額（金額）欄取自 QuickBooks 的 $ change；括號負數與單位標右上取自 DBS 損益表 |
| 小計列 | 600 字重，上框線 1px `--border-strong` |
| 合計列 | 600 字重，上框線 2px `--border-strong` |
| 費用列 | 報表型表格（管理損益表、橋接表）可以加「減：」前綴 |
| 零值列 | 報表型表格預設隱藏零值列，提供「顯示零值列」切換（P1，F9） |
| 表格內動作 | 只用文字按鈕或次要按鈕 |
| 捲動容器 | `.table-scroll`（tabIndex=0、role=region、aria-label）保留 |
| 手機（≤ 767px） | 主要表格（通路寬表、商品前 10 名、全部商品、資料問題）改成清單：主行是名稱加關鍵金額（14／600），次行是 key-value（12px）。用 CSS 重排，不換 DOM：保留 `<table>`，並明確加上 `role=row`／`role=cell`；每格用 `data-label` 顯示欄名，由 `data-list-role`（值為 primary、secondary、labeled） 控制。必須通過 axe；不行就退回橫向捲動並讓第一欄 sticky |

**KPI 規格（C1 補充）**

| 狀態 | 呈現 |
|---|---|
| 一般 | 名稱、主值、差額行、上期 |
| 有目標且期間相符 | 加 C18 細條與「目標 … · 差 …」（目標文字是 number-link） |
| 有目標但期間不符 | 同一位置顯示一行提示，指出最近一筆目標的期間（v2 的 mismatchText，number-link） |
| 上期 ≤ 0 | 差額行改寫「由負轉正」或「轉為虧損」，不顯示成長率 |
| 資料待補 | 主值寫「資料待補」（`--num-28` 改成 `--text-16`，`--warning` 色），差額行寫「先補齊 {n} 項」並連到資料來源 |
| 分母 ≤ 0（比率格） | 主值寫「不適用」；`?` 說明原因 |
| 載入中 | 同高度的骨架色塊（`--bg-subtle`），不做 shimmer |

**抽屜規格（C6）**

| 項目 | 規格 |
|---|---|
| 位置與寬度 | 右側；桌機 560px，≥ 1440 時 640px，768–1279 時 480px；< 768 時全螢幕 |
| 結構 | 固定的標題列 56px（h2 20／600＋副標 13px＋關閉 icon 按鈕）→ 可捲動的內容（padding 24px，段落間距 24px，段落小標 13／600 `--text-secondary`）→ 選填的底部動作列 64px（固定，動作靠右，危險動作放最右） |
| 外觀 | `--bg-surface`、`--shadow-overlay`、遮罩 `--scrim`、左側 1px `--border-subtle` |
| 行為 | modal dialog、focus trap、記住開啟它的元素、Esc 與關閉都回焦；`aria-labelledby` 指向 h2，`aria-describedby` 指向副標 |
| 動畫 | 從右側滑入 `--dur-base`；reduced-motion 時直接出現 |

**狀態規格（C8）**

狀態標籤（Lozenge）：高 20px、12／500、padding 0 6px、`--radius-sm`，一定有文字，前面可以加 12px 線框 icon。

| 狀態 | 底／字 |
|---|---|
| 不利、錯誤、逾期、轉負 | `--unfavorable-subtle`／`--unfavorable` |
| 資料待補、受阻、補資料再議、過期、未驗證 | `--warning-subtle`／`--warning` |
| 有利 | `--favorable-subtle`／`--favorable` |
| 進行中、採用、草稿（會議） | `--accent-subtle`／`--accent` |
| 未開始、已完成、不採用、已結束、中性 | `--bg-subtle`／`--text-secondary`（已完成加 check icon） |

計數徽章（Badge）：最小寬 20px、高 18px、12／500、`--bg-subtle` 底、`--text-secondary` 字、`--radius-full`，只放數字，aria-label 寫完整意思（例如「3 項不利」）。

資料狀態點：8px、`--radius-full`，ready 用 `--accent`、partial 用 `--warning`、error 用 `--unfavorable`、empty 用 `--border-strong`；旁邊一定有文字。

### 9.5 Icon 與圖表規則

**Icon**：只用既有的 `Icon` 元件（`dashboard.tsx:61–73`，1.6px stroke）。新增 pin、info、chevron-down、chevron-right、external、check、copy、book 圖形。大小統一 16px（按鈕內）或 20px（導覽）。只在導覽、展開與收合、外部連結與下載、置頂、說明這幾種情況使用；旁邊一定有文字或 aria-label；不加彩色底。

**圖表**

| 規則 | 規格 |
|---|---|
| 高度 | `--chart-h-sm` 180px（總覽並列圖）、`--chart-h-lg` 320px（瀑布、詳圖）；同一列等高；四種狀態等高 |
| 標題 | 區塊標題寫結論句，標準名稱放副標；副標由資料組成，同時是 aria 描述 |
| 軸 | 長條與瀑布從 0 開始；Y 軸刻度用整數萬元（0、50 萬、100 萬）；軸標 12px `--chart-axis`；只畫水平格線 |
| 缺資料 | 不內插，斷線並標「無資料」；最後一週不滿 7 天時標「未滿 7 天」 |
| 圖例 | 能直接標籤就不用圖例；需要時放在圖上方靠左，用 12×2px 線段，不用彩色圓點 |
| 比較色 | 本期固定 `--chart-current`，上期固定 `--chart-previous`，去年同期固定 `--chart-yoy` 虛線；全站一致 |
| 互動 | P0：瀑布段、通路長條點擊開抽屜，鍵盤經由對應表格；P1：週與通路點擊後開抽屜，並篩到該週或該通路（F10） |
| 實作 | 圖表色集中在 `src/application/chart-theme.ts`，用 `getComputedStyle` 讀 token，元件內不得出現 hex |

### 9.6 列印與匯出的視覺 token

| 輸出 | 規格 |
|---|---|
| A4 列印、PDF | 白底，不印任何底色；文字 `--text-primary`；表格線 0.5pt `--border-strong`；版頭照 §7.9 的台灣報表格式；負數依 D-V3-8（管理損益表用括號，其他用「−」）；數字 tabular；字級：標題 14pt、內文 10pt、附註 8pt；只用 L1＋L2，L3 放附錄 |
| PPT 一頁式 | 16:9；背景白；標題 28pt `--text-primary`；KPI 數字 36pt；不利色 #b03a2e，有利依 D-V3-7；強調色 #1f5a4f 只用在本期資料與一條 4pt 頂線；字型 Arial／微軟正黑體（PPT 內建）；不放裝飾圖形 |
| Excel | 首頁是版頭四行加 KPI 表；表頭粗體、`#f1f3f3` 底；數字格式：金額 `#,##0.00` 或管理損益表 `#,##0.00;(#,##0.00)`（D-V3-8）、比率 `0.00%`；凍結表頭列；欄寬依內容；工作表名稱依 §8.3（改名要記在 RELEASES） |
| Markdown | 開頭是版頭四行；表格數字欄右對齊（`---:`）；負號用 U+2212 |
| CSV、JSON | 不套視覺；ASCII「-」；到分；欄名「中文名 (english_key)」 |

- PDF、PPT、Excel 用到的色碼集中在 `src/application/export-theme.ts`，值與 §9.1 的 token 一一對應（有單元測試比對），元件與匯出程式碼的其他地方不得出現 hex。
- 列印字級也定義成 token（`--print-title` 14pt、`--print-body` 10pt、`--print-note` 8pt），涵蓋 `src/components/manager-summary.module.css`（A4 列印與一頁摘要，現有 10 個 hex、11 種 font-size（含 pt 與 clamp）、radius 10px），一併改成引用 token；design-lint 不計 `@media print` 區塊內引用 token 的字級。

### 9.7 投影模式（P1，D-V3-23）

週會投影是老闆主要的閱讀方式之一。投影模式只用在經營總覽與會議紀錄，從頁首的「投影模式」按鈕進入，Esc 離開：

- 隱藏側欄與期間列，只留一行期間文字。
- 用 `:root[data-mode="present"]` **重新對應 token 的值**，不新增字級種類：`--text-14` → 16px、`--text-16` → 20px、`--num-28` → 40px、`--num-32` → 48px。
- 內容最大寬 1280px，只顯示 L1（本期一句話、KPI 帶、三件事標題、瀑布圖）。
- 文字對比沿用 §9.1，不另設色票。
- 是否納入本輪，見 D-V3-23。

### 9.8 實作規則

1. 只在 `globals.css` 新增 token 與元件 class；**不加 UI 套件、不加字型**。
2. 既有 class 名稱保留（E2E 與截圖 spec 可能依賴），改成引用 token。確認沒有用到的 class 才能刪，刪除的 class 要列在該批驗收文件。仍被 JSX 使用的 class（例如 `.nav-dot`、`.green-dot`、`.empty-illustration`）先把樣式中性化，等 JSX 重排的批次再一起刪（§12.2）。
3. **依頁面分批替換，不整檔重寫**；每批的 `design-lint` 棘輪值只能下降。
4. 元件內不得出現 hex；圖表色經由 `chart-theme.ts` 讀取。
5. **視覺回歸**：用 Playwright 內建的 `toHaveScreenshot`（不加依賴）。V3-0 建立四尺寸基準，證明「零變化」；之後每批在驗收文件中更新基準，並附前後對照截圖。
6. **對比**：`scripts/contrast-check.mjs` 讀 `:root` token，依「文字 token × 可能的底色」矩陣計算 WCAG 對比，低於門檻就失敗；接在 `npm run lint` 之後執行（`package.json` 新增 script `audit:ui`，不加依賴）。

---

## 10 新增與強化功能（來自調研）

邊界說明：「否」表示只動 `src/components`、`src/application`、`src/i18n`、`globals.css`；「是（新增）」表示要在 `src/domain` **新增**函式或欄位，必須附獨立手算的 golden，而且不改既有指標的輸入輸出。

### 10.1 功能清單

| 代號 | 功能 | 來源 | 邊界與限制 | 動到 domain？ | 優先級 | 批次 | 需拍板 |
|---|---|---|---|---|---|---|---|
| F1 | **本期一句話＋複製週會摘要**（純文字或 Markdown 寫入剪貼簿） | StoreHero 快照、MarginStack 晨報（市場調研 §4、§10）；Ramp 依節奏送出（只取概念） | 只在本機產生並寫入剪貼簿，不寄送、不串接；字串全部來自 labels；數字來自既有 snapshot | 否 | P0 | V3-4 | D-V3-13 |
| F2 | **本期利潤結構四層瀑布**（合計或單一通路切換；每段可開抽屜） | Net Net 利潤瀑布、Daasity CM 分層（市場調研 §4、§10） | 只用 `contribution-v1` 已算好的值；停在扣廣告後貢獻，不畫到淨利；用既有 Recharts | 否 | P0 | V3-4 | — |
| F3 | **兩期差異改成瀑布圖＋橋接表＋平衡檢核** | Stripe Balance summary | 九項來自既有的 bridge 輸出；平衡檢核只比對既有數值 | 否 | P0 | V3-4 | — |
| F4 | **視覺 token 化與去 AI 感改版** | §5、§9 | Tailwind v4＋globals.css；a11y 不退步 | 否 | P0 | V3-1 起 | D-V3-7、D-V3-9 |
| F5 | **三層文案與名詞小辭典**（指標定義對話框加搜尋、舊名 alias、CM 對照） | Shopify content、Polar 語意層、Daasity | 只改 labels 與說明，公式不變 | 否 | P0 | V3-2 | D-V3-1、2、3、5、18 |
| F6 | **導覽分組與手機底部分頁列** | Vercel 導覽改版、Few | 路由、#validation、testid 都不變 | 否 | P0 | V3-3 | D-V3-14 |
| F7 | **匯出選單依對象分組＋各頁「匯出本頁」頁內下拉** | Stripe 區段匯出 | 一個格式都不刪（§6.5）；頁內下拉呼叫各頁 v2 既有的 handler，保留頁面 state 與會議範圍 | 否 | P0 | V3-3、V3-7 | — |
| F8 | **趨勢圖三線比較**（本期、上期、去年同期） | CYBERBIZ 三線比較（市場調研 §8-4、§10）；GA4 比較色標示（全站固定是 EC ProfitLens 的延伸） | 用既有 domain 函式計算第三段期間的彙總（只是多呼叫一次，不改函式）；去年同期不可用時保留位置並寫原因；缺資料不畫成 0 | 否 | P1 | V3-9 | — |
| F9 | **每日／每週管理損益表**（列是四層與費用項，欄是日或週，含「佔淨營收 %」欄；收合在總覽進階區） | Lifetimely 每日 P&L、QuickBooks、DBS 損益表格式 | 只重新呈現既有的日粒度彙總；每格都能開抽屜 | 否 | P1 | V3-9 | D-V3-8、D-V3-19 |
| F10 | **圖表點擊下鑽**（點週或通路長條，開抽屜並篩到該週或該通路的原始明細） | Ramp、Brex | 用抽屜既有的篩選能力；新增的 filter 參數只在 application 層 | 否 | P1 | V3-9 | — |
| F11 | **目標達成三態**（達標／接近／落後，附偏離金額與 %） | Few bullet graph；Northbeam（市場調研 §4、附錄 A）；StoreHero 的紅綠兩態燈號（三態是 EC ProfitLens 的延伸） | 只在匯入 targets.csv 且期間完全相同時顯示；不寫死產業門檻；顏色＋文字＋icon。**只在 D-V3-16 選 B 或 C 時才做**；選 A 時，「實際／目標／差額＋細條」已由 #25 在 V3-4 完成，F11 從 V3-9 範圍與 RK10 移除 | 否（呈現層分類） | P1 | V3-9（D-V3-16 選 B／C 時） | D-V3-16 |
| F12 | **損益兩平 MER**（扣廣告後貢獻＝0 時的最低 MER＝淨營收 ÷ 扣廣告前貢獻） | Northbeam、Sellerboard、蝦皮廣告學院毛利表（市場調研 §10） | 只能新增；扣廣告前貢獻 ≤ 0 時回傳 null 加原因碼，不顯示 0 或無限大；要有獨立手算 golden（包含扣廣告前貢獻 ≤ 0、廣告費 = 0、淨營收 = 0 三種邊界）。比照 R4 輔助指標的前例，**優先實作在 `src/application`**（例如 `src/application/breakeven-mer.ts`），使用獨立的版本常數 `breakeven-mer-v1`，不動 `ASSIST_KPI_VERSION` | 否（優先 application）；確定必須進 domain 時，先列出要新增的檔案與函式簽名，由人拍板（D-V3-17） | P1 | V3-9 | D-V3-17 |
| F13 | **待辦的廣告決策標籤**（暫停／調整／加碼，使用者自選） | StoreHero Spend Advisor、Conjura（市場調研 §4、§10） | 不自動判斷；寫入備份與匯出；備份 schema 升到 v5，向下相容 v1–v4 | 否（application 層 schema） | P1 | V3-9 | — |
| F14 | **匯出範本變體**：老闆一頁版、代營運客戶報告版 | Dashboardly、Admetry（市場調研 §10） | 沿用既有 PDF、Excel、PPT 管線與 metric_version 標記，只改版面 | 否 | P1 | V3-9 | — |
| F15 | **台灣化示範資料** `fixtures/demo_tw`（官網／蝦皮／momo、商品名、檔期，附獨立手算的 expected） | D3 的 B 案、市場調研 §9-4、§12-1 | 只新增 fixture，不改既有 demo 與 golden | 新增 fixture | P1 | V3-9 | D-V3-20 |
| F16 | **來源預設的實檔驗證**（其餘 8 個預設） | 市場調研 §7-2、§9-4 | 需要去識別化的真實匯出檔；畫面上的「已驗證／未驗證」要誠實標示 | 否 | P1 | V3-9（取得檔案時） | 需要使用者提供檔案 |
| F17 | **通路表「近 8 週」sparkline**（C19） | Tufte、Stripe SparkLineChart | 用既有的週彙總；不放需要精讀的值 | 否 | P2 | 可在 V3-5 順手做 | — |
| F18 | **表格密度切換**（40／32px，記在 localStorage） | Carbon | 只是個人偏好，記在 localStorage（try/catch 包住），不進備份的 `ui_prefs`；P1 例外：隨商品頁在 V3-5 做 | 否 | P1 | V3-5 | — |
| F19 | **首次使用導覽**（3 步、可略過、可從指標定義重開） | README 30 秒試用、市場調研 §7-10 | 純前端；略過紀錄存 localStorage（try/catch），不影響本機保存的同意 | 否 | P2 | — | — |
| F20 | **撥款／對帳檔原生格式預設**（蝦皮「我的進帳」、momo 對帳扣款明細 → channel_costs） | 市場調研 §10 | 本機預設或 `aggregate_orders.py` 規則；保留檔名與行號；用真實檔驗證後才能宣稱支援 | 否 | P2 | 不在 v3 | 市場調研 §12-2 |
| F21 | **試算頁的平台費率參考提示** | 蝦皮手續費計算機等（市場調研 §10） | 絕不能補成實績費用；費率會過時，需要維護日期 | 否 | P2（建議本輪不做） | — | D-V3-21 |
| F22 | **投影模式**（§9.7） | 三份草稿都指出老闆主要在週會投影閱讀；評審列為缺口 | 只重新對應 token 的值；只用在總覽與會議頁 | 否 | P1 | V3-9 | D-V3-23 |
| F23 | **「這版改了什麼」提示與名詞小辭典的舊名對照**（§8.9） | 評審列為缺口（改名溝通） | 可關閉；已讀記在 localStorage（try/catch） | 否 | P0 | V3-2 | — |

### 10.2 F1 週會摘要模板（labels `summary.weekly.*`）

純文字版（標題用換行，不用「｜」，符合 §8.4）：

```
週會摘要
{資料集名}
本期 {7/13–8/23}（{42} 天）對比 上期 {6/1–7/12}（{42} 天）· {全部通路} · 金額未稅

淨營收 {785.1 萬}，比上期{多} {170.9 萬}（{+27.8%}）
扣廣告後貢獻 {127.0 萬}，比上期{少賺} {59.9 萬}（{−32.0%}）
扣廣告後貢獻率 {16.2%}，{降} {14.3} 個百分點

本期三件事
1. {折扣多花 118.8 萬}：{先列出本期的促銷檔期，核對折扣有沒有換到足夠的銷量。}
2. {…}
3. {…}

待辦：未完成 {5} 項；置頂 {檢討折扣檔期（王小明，9/30）}、{…}
資料到 {8/24}。數字由 EC ProfitLens 在這台電腦計算，可在「計算與來源」查到原始檔名與行號。
```

- Markdown 版用 `##` 與 `-`，數字欄的負號用 U+2212。
- 置頂待辦最多列 3 項；不附健檢清單（D-V3-13 的建議值）。
- 資料待補時，第 4–6 行改成「部分資料待補，扣廣告後貢獻暫不計算；先到資料來源補齊 {n} 項。」
- 新增事件 `summary_copied`（D-V3-15），只記事件名。
- 單元測試：用 golden fixture 產生摘要並做快照比對；字串全部取自 labels；Markdown 與純文字兩版都要測。

### 10.3 F2 本期利潤結構四層瀑布規格

- 位置：總覽區塊 6；高 `--chart-h-lg`（320px）。用分段按鈕切換「合計」或單一通路（`profit-waterfall-scope`）。這個切換只影響本圖，不改全站的通路篩選，副標會寫明這一點。
- 柱序：淨營收（`--chart-total`）→ 商品成本（不利）→ **商品毛利**（小計柱，`--chart-total`）→ 平台抽成 → 金流手續費 → 物流與包材費 → 其他變動費用 → **扣廣告前貢獻**（小計柱）→ 廣告投放費 → **扣廣告後貢獻**（`--chart-current`，本期的結果）。
- 每根柱上方直接標金額（萬）。每根都能點，開對應指標的抽屜；鍵盤經由下方資料表的 number-link 操作。
- 標題（L1）：「每 100 元淨營收，扣完廣告剩 16.2 元」；副標：「本期利潤結構 · 7/13–8/23 · 全部通路」。
- 資料表替代：`<details>`「資料表」，列出各柱的金額（元）與佔淨營收 %。
- 資料待補時：受影響的柱改成虛線框並標「資料待補」，後面的小計柱不畫，表格顯示「資料待補」。
- 單元測試：資料組裝後，淨營收減所有扣項等於扣廣告後貢獻（到分）。
- testid：`profit-waterfall`、`profit-waterfall-scope`、`profit-waterfall-bar-{metric}`。

### 10.4 明確不做

API／OAuth 同步與雲端儲存；多觸點歸因、增量測試、MMM；AI 代理或用 AI 計算金額（`ENABLE_LIVE_AI=false` 不變）；健康分數或信心分數、gauge；算到淨利的完整損益表；LTV、CAC、cohort（D6）；SKU 層級的廣告與平台費分攤；預測、季節調整目標、同業基準；Email、Slack、LINE 自動寄送與推播；多人帳號與跨裝置同步；訂單、庫存、刊登等 ERP 功能；比拼工具數量或 AI 文案產生器；角色切換；訂閱收費（市場調研 §12-3 待拍板）。

---

## 11 非功能需求

### 11.1 無障礙（WCAG 2.2 AA，不得低於 v2）

| 項目 | 要求 |
|---|---|
| 對比 | 文字 ≥ 4.5:1（12–13px 也一樣；`--text-tertiary` 是最低一階，在所有底色上都已計算 ≥ 4.68）；非文字元素（輸入框邊框、焦點框、number-link 底線、圖表線與圖表類別色）≥ 3:1；以 `scripts/contrast-check.mjs` 的輸出為準 |
| 不只靠顏色 | 有利或不利一定搭配「+」「−」與文字；狀態標籤一定有文字；圖表系列用線型（實線、虛線）加直接標籤區分；「其他」通路一定有文字標籤 |
| 焦點 | 所有互動元素都有 `:focus-visible` 焦點框；抽屜、對話框、popover 開關時管理焦點並回焦（沿用既有實作） |
| 目標尺寸 | ≥ 24×24px（WCAG 2.5.8）；手機控制項 40px 高；底部分頁列每格 ≥ 44px |
| 結構 | 保留 `<details>/<summary>`、`role=status`、`aria-live`、`aria-pressed`、`aria-current`、`aria-sort`、`aria-busy`、`aria-disabled`＋sr-only 理由；議程與 stepper 用 `<ol>` |
| 圖表 | `chart-frame` 設 `aria-hidden`，加上 `<details>` 資料表替代；副標的結論句當描述；可點的長條一定有對應的表格 number-link |
| 動畫 | `prefers-reduced-motion` 時關掉所有過場；骨架不閃爍 |
| 鍵盤 | 總覽 → 開抽屜 → 關閉回焦 → 加入待辦 → 改狀態 → 匯出，全程可以只用鍵盤完成（V3-10 走查） |
| 自動檢查 | 每批跑 Lighthouse Accessibility（1440、390）：不低於 V3-0 同頁基準，且 ≥ 95（§2.3 C）；四尺寸 axe 掃描，0 個 serious 問題 |

### 11.2 效能

- Lighthouse Performance ≥ 90（1440、390）；建議另加「不低於 V3-0 基準減 3 分」。
- **不新增 npm 依賴**（本輪「允許新增依賴」清單為空）。瀑布圖、三線圖、sparkline、bullet 都用既有的 Recharts 3.10.1 或 inline SVG。
- Excel、PPT writer 維持動態 import（開啟匯出選單時預載）。
- CLS < 0.05（圖表高度固定，骨架與實際內容等高）。
- 首頁 First Load JS 不得比 v2.0.0 多 5% 以上（V3-0 記錄基準，以 `next build` 的輸出比對）。
- 套用期間到 KPI 更新 ≤ 300ms（示範資料、M1 等級桌機），用 Playwright 的 `performance.now()` 量測並記錄，不設成 CI 的硬門檻。

### 11.3 隱私與公開站邊界（不變）

- 不加登入、資料庫、伺服器端保存；原始 CSV 不上傳。
- `APP_MODE=PUBLIC_DEMO`、`ENABLE_LIVE_AI=false`、`/api/insights` 的 server 端封鎖邏輯都不動；不碰 `.env*`。
- 本機保存仍然需要使用者同意（D7：一次同意，之後自動）。
- 「複製週會摘要」只寫入剪貼簿，不經過任何網路請求。
- 使用分析只記事件名，不含金額、通路、檔名；新增事件名要在 `docs/DECISIONS.md` 記一筆（D-V3-15）。
- 既有偏好（看板或清單 `view`、上次快捷 `last_preset`）維持在備份的 `ui_prefs`，不搬到 localStorage。localStorage 只存 v3 新增的個人偏好（表格密度、改名提示已讀、首次導覽略過），讀寫都用 try/catch，讀不到時頁面照常顯示。
- V3-10 檢查網路紀錄，確認沒有任何資料外送。

### 11.4 財務核心禁區

- `src/domain/*`、`fixtures/golden`、`fixtures/demo`、`fixtures/errors`、`fixtures/refund_only`、`fixtures/zero_ad`、`metric_version = contribution-v1`、`docs/METRICS.md` 的公式：**V3-0 到 V3-8 完全不動**。
- V3-9 只允許**新增**，並在 `06_BATCHES.md` 列出允許新增的檔案白名單（例如 `fixtures/demo_tw/**`；F12 預設實作在 `src/application`，只有 D-V3-17 核准進 domain 時，才把列出的 domain 新檔加入白名單）：F12 損益兩平 MER（獨立版本標籤 `breakeven-mer-v1`，見 D-V3-17）、F15 `fixtures/demo_tw`（新 fixture）。既有 7 個輔助指標維持 `assist-kpi-v1`。每一項都要有獨立手算的 golden 測試。
- 所有顯示格式的改動（萬、億、HALF_UP、U+2212、`favorableDirection`）都只在 `src/application/presentation.ts`、`copy.ts`。**測試中的數字斷言要改成呼叫格式化函式，不能為了讓測試通過而改 golden 數字。**
- 每批驗收都要跑 `git diff --stat 82b70df -- src/domain fixtures/golden fixtures/demo fixtures/errors fixtures/refund_only fixtures/zero_ad docs/METRICS.md`（或 V3-0 打的 tag `v2.0.0`），把結果寫進驗收文件；除了白名單內的新增以外必須為空。不可用 `main` 比對（§2.3 C）。

### 11.5 標籤單一來源

- 所有使用者看得到的中文（含 aria-label、title、匯出標題列、PDF、PPT、Excel 工作表名、週會摘要模板、錯誤訊息）都在 `src/i18n/labels.zh-TW.ts`。
- **已知例外（凍結區）**：`src/domain` 內寫死的中文 message（例如 `validation.ts:95–96`、`scenarios.ts:86–101`）屬於財務核心禁區，不改。改用 reason code 對應 labels，並由 `tests/reason-code-labels.test.ts` 保證 UI 與匯出不會退回顯示 domain 的 message（§7.7.3）。
- `metricDefinitions.label` 從 labels 讀取（沿用 R2）。
- JSX 內新寫的中文 = 0；既有的殘留在 V3-2 清零（`labels-coverage` 測試延伸到全部元件）。
- 測試斷言用 `import { labels } from "@/i18n"`；改名和測試在同一批完成。
- `tests/copy-style.test.ts` 守住 §8.4 的規則。

### 11.6 可追溯性

- 每個金額（包括新增的瀑布柱、管理損益表格、圖表點）都要能開「計算與來源」，看到檔名、原始行號、含稅原值與換算值。
- 摘要層改用萬之後，抽屜標題下一行**永遠**顯示到分的精確值；L2 表格用整數元；匯出到分。這樣執行者對帳時不會找不到精確數字。
- 匯出（CSV、Markdown、Excel、PDF、PPT）都附 `metric_version` 與資料版本；PDF、Excel 附「指標定義與算法」段落。
- 已結束的會議維持快照（§8.9、D-V3-22）。

### 11.7 測試與 testid

| 項目 | 要求 |
|---|---|
| testid 基準 | V3-0 產出 `verification/revamp-v3/testids-v2.txt`：129 個靜態 testid；另外收錄三元運算式與 `testId` 屬性傳入的 testid（`meeting-agenda-2`，`manager-summary.tsx:69`；`meeting-followup`、`meeting-compare-kpis`、`meeting-history-kpis`，`meeting-page.tsx:257、348、363`）；樣板（例如 `product-${kind}`、`kpi-`、`scenario-mode-`、`board-card-`）一律展開成實際渲染值（例如 `product-worst`、`product-best`、`kpi-net_revenue`），從 SSR markup 或 E2E 實際渲染取得。新增 `tests/testid-baseline.test.ts`，**比對 SSR 或 E2E 實際渲染出的 testid**，不只用字串 grep；少了任何一個就失敗 |
| 掛載 | `tests/mounted-testids.test.tsx`（M1） |
| E2E 文字斷言 | `verification/revamp-v3/e2e-text-assertions.csv`（M5）每批勾銷；改名的同一批把斷言改成 labels |
| 新增 testid | `weekly-snapshot`、`snapshot-sentence`、`copy-summary`、`copy-summary-status`、`profit-waterfall`、`profit-waterfall-scope`、`profit-waterfall-bar-{metric}`、`bridge-waterfall`、`bridge-table`、`bridge-balance-check`、`data-status`、`data-status-popover`、`data-status-import`、`nav-group-{id}`、`mobile-tabbar`、`period-summary`、`period-custom`、`export-page-{page}`、`action-drawer`、`meeting-snapshot-note`、`glossary-search`、`page-import`、`actions-export-{format}`、`threshold-form-overview`、`threshold-form-meeting`、`meeting-create`、`meeting-scenario-select-{channel}`（後六個在 V3-0 先補，只加屬性）、`whats-new`、`pl-table`（P1）、`trend-yoy-line`（P1）、`action-tag-{n}`（P1）、`present-mode`（P1） |
| 單元測試 | 格式化（§8.5 每列至少一個案例，含 HALF_UP 邊界、U+2212、億、−32.0% 與 −14.3 個百分點兩個例子）；本期一句話 5 種情境；週會摘要模板；瀑布資料組裝（加總到分）；錯誤訊息句型（`import-errors-copy`）；reason code 都有 labels 對應（`reason-code-labels`）；匯出版頭；`favorableDirection` 上色；`export-theme` 與 token 對應 |
| E2E | 四種視窗（1440×1000、1280×900、768×1024、390×844）全部通過；首屏位置斷言（§2.3 B）；選單、抽屜、看板的鍵盤流程；剪貼簿（含失敗時的備案） |
| 截圖 | 每批四尺寸各至少一張，存到 `verification/revamp-v3/V3-{n}/`，命名沿用 v2（例如 `1-overview-desktop-viewport.png`）；`toHaveScreenshot` 基準跟著更新 |
| 靜態掃描 | `design-lint`、`copy-style` 棘輪；`scripts/ui-audit.mjs` 數字寫進驗收文件 |

### 11.8 相容性

- 備份檔：v1–v4 仍然可以還原；F13 新增欄位時升到 v5，舊檔缺少的欄位以預設值補上，並附遷移測試。
- 本機 IndexedDB 中的舊資料可以直接讀取，不需要使用者操作。
- 備份 `ui_prefs` 的欄位（`view`、`last_preset`）與還原行為不變（§6.3 #59）；v2 沒有任何 localStorage 鍵，v3 新增的鍵列在 `storage-keys-v3.txt`。
- CSV 欄名與欄序不變（D11），只能新增欄；Excel 工作表改名要記錄（§8.9）。
- 瀏覽器：最新兩版的 Chrome、Safari、Edge、Firefox；iOS Safari 17 以上。剪貼簿 API 失敗時，有可選取文字的備案。

---

## 12 批次規劃

### 12.1 共同規則（每批都適用）

- **一次只做一批，不跨批；一批就是一個工作階段。** 每批結束時，產品要可以運行，而且所有檢查都通過。批次太大時，要在開工前拆成 V3-{n}a／b，並寫進 `06_BATCHES.md`，不能做到一半才拆。
- **人工關卡（不屬於任何批次）**：需要好幾個工作天的人工活動不放進批次的完成條件，批次驗收只放機器能檢查的項目。人工關卡在 `06_BATCHES.md` 統一標示，並註明擋住哪一批；沒完成時 `docs/STATUS.md` 寫「未執行／待人工」，不可寫成完成。

  | 關卡 | 內容 | 擋住 |
  |---|---|---|
  | H1 | v2 基準的 5 人可用性測試與外部盲評（用 V3-0 產出的腳本、問卷與招募清單） | V3-10 的前後對照（不擋 V3-1） |
  | H2 | V3-1 產出的靜態設計稿審查（2–3 位台灣電商經理人加 1 位設計者） | V3-3 開工 |
  | H3 | `copy-rewrite.csv` 審稿，並做紙本用語測試（D-V3-2、D-V3-14） | V3-2 開工 |
  | H4 | v3 的 5 人複測與外部盲評（同 H1 腳本） | v3.0.0 正式上線（V3-10 的 §2.3 A 指標由 H4 結果補上） |

- **拍板規則**：§13.2 的事項沒有明確回覆，不視為核准。受影響的批次不開工，或只做不受影響的部分，拍板前沿用 v2 的行為與用詞（§8.3、§7.4 已照此寫）。修正 v2 既有決策（D-V3-1、D-V3-2）與部署（D-V3-24）一律要使用者明確同意。
- **允許新增依賴：無。**
- **共通驗收**（每批都要全部跑，並貼真實輸出摘要；沒執行的寫「未執行」）：
  1. `npm ci`（lockfile 變動時）、`npm run typecheck`、`npm run lint`（含 `audit:ui`、`contrast-check`）、`npm test -- --run`、`npm run build`、`npm run test:e2e`（四個視窗）。
  2. 四尺寸截圖（1440×1000、1280×900、768×1024、390×844）各至少一張，存到 `verification/revamp-v3/V3-{n}/`。
  3. Lighthouse Accessibility：不低於 V3-0 同頁基準，且 ≥ 95（本機 production build，1440 與 390）；四尺寸 axe 0 個 serious；並記錄 Performance。
  4. `design-lint` 棘輪值不上升；testid 基準刪除數 0；`mounted-testids` 通過；`feature-retention.csv` 逐列打勾。
  5. 禁區 diff：`git diff --stat 82b70df -- src/domain fixtures/golden fixtures/demo fixtures/errors fixtures/refund_only fixtures/zero_ad docs/METRICS.md`（或 tag `v2.0.0`）的結果，寫進驗收文件；除了 V3-9 白名單內的新增以外必須為空（§11.4）。
  6. 更新 `docs/STATUS.md`（寫真實結果）；必要時在 `docs/DECISIONS.md` 記一筆；驗收寫在 `verification/revamp-v3-V3-{n}-acceptance.md`。
- 回報格式沿用 CLAUDE.md 的「每批回報格式」（完成項目、變更檔案、驗收結果、截圖路徑、已知限制、下一批建議與待拍板）。
- V3-0 提出 CLAUDE.md 與 `docs/revamp-v3/00_README.md` 的批次說明更新稿，**經使用者同意後**才寫入。

### 12.2 批次表

| 批次 | 範圍 | 依賴（含拍板） | 驗收重點（共通驗收以外） | 同批一起改的 labels 與測試 |
|---|---|---|---|---|
| **V3-0 基準與護欄**（不改任何 UI） | ① 5 人可用性測試與外部盲評的腳本、問卷、招募清單（§2.3 A、§3.4；量測本身是人工關卡 H1，STATUS 寫「未執行／待人工」）；打 tag `v2.0.0`（指向 `82b70df`）；② `scripts/ui-audit.mjs`、`scripts/contrast-check.mjs`、`tests/design-lint.test.ts`、`tests/copy-style.test.ts`（上限＝v2 實測值）；③ `testids-v2.txt`（含運算式與 `testId` 屬性來源、樣板展開值）＋`tests/testid-baseline.test.ts`；為 v2 沒有 testid 的保留功能補屬性（`page-import`、`actions-export-{format}`、`threshold-form-overview`、`threshold-form-meeting`、`meeting-create`、`meeting-scenario-select-{channel}`，只加屬性，畫面零變化）；④ `feature-retention.csv`（用 testid 或函式名定位）、`backup-schema-v4.json`（含 `ui_prefs` 欄位）、完整下載入口清單（§6.5）、`e2e-text-assertions.csv`（含 `locator()` 選擇器）；⑤ `toHaveScreenshot` 四尺寸基準；⑥ `copy-rewrite.csv` 與紙本用語測試材料送人工審（H3）；⑦ First Load JS、首屏位置、內容前控制項數（§2.3 B 口徑）、含稅匯入點擊數、Lighthouse a11y／Performance（示範資料已載入的 5 頁，1440 與 390）的基準；⑧ 把 §13.2 的拍板清單交給使用者 | — | 畫面零變化（`toHaveScreenshot` 差異 0）；基準報告 `verification/revamp-v3/V3-0-baseline.md`；所有新測試通過 | 不改 labels；新增上述測試 |
| **V3-1 Token、基礎元件與設計稿審查** | `:root` 全部 token（§9.1–9.3）；字級、字重、字距收斂；C3、C4、C5、C8、C10、C11、C12、C14、C15、C21、C22 的 class；既有 class 改成引用 token；刪除 eyebrow 字距、`.button-row` 置中、`.kpi-card.featured` 深色底；`.nav-dot`、`.green-dot`、`.empty-illustration` 只把樣式中性化（例如 display:none 或改用 token，`.empty-illustration` 去掉裝飾性 rotate(-4deg)），**JSX 不動**，class 留到 V3-3（`.nav-dot` `dashboard.tsx:511`、`.green-dot` `:512、:520`）與 V3-8（`.empty-illustration` `:580`）連同 JSX 一起刪；`@keyframes spin` 與 disclosure 指示的 rotate 保留。**不改版面與文案。** 另外產出總覽、抽屜、會議三頁的靜態設計稿（用 token 做的 HTML，放在 `verification/revamp-v3/mockups/`，不進 app bundle），交給人工關卡 H2 審查（2–3 位台灣電商經理人加 1 位設計者） | V3-0；D-V3-7、D-V3-9 | hex ≤ 60、圓角 3 種、字級 ≤ 8、字距 0；`contrast-check` 全過；截圖對照 v2 只有樣式差異；設計稿已產出（H2 審查通過才能開始 V3-3，不是 V3-1 的完成條件） | 樣式相關的 E2E 斷言（顏色、class） |
| **V3-2 語言與數字格式** | labels 結構重整與舊 key alias（§8.10）；名詞表依拍板結果落地；刪除箭頭、「注意：」、圈數字、全大寫 eyebrow、主層的「｜」；三層尺度格式化函式與 `favorableDirection`，並接到所有元件；硬編碼中文清零；`importErrors` 的句型與占位符（§7.7.3）；「這版改了什麼」提示（F23）；名詞小辭典與舊名搜尋 | V3-1；D-V3-1–6、D-V3-8；人工關卡 H3（`copy-rewrite.csv` 審稿與紙本用語測試） | copy-style 全部為 0；JSX 中文 0；formatter 單元測試（含 −32.0%、−14.3 個百分點）；`import-errors-copy`、`reason-code-labels` 通過；`copy-density` 的否定句計數延伸到會議、資料來源頁（上限 3）；golden 不變；export 測試依 §6.5 的格式別允許差異比對（本批只有標籤差異） | `tests/manager-language.test.ts`、`tests/export.test.ts`、`tests/copy.test.ts`、`tests/import*.test.ts`、`tests/e2e/*.spec.ts` 中所有受改名影響的斷言，全部改成 import labels 與格式化函式 |
| **V3-3 殼層與導覽** | 頂欄單列（資料狀態 popover、AI 精簡、儲存三段、匯出分組）；側欄分組與計數徽章；頁首 56px；期間列單列與自訂期間 popover；需要處理橫幅；手機底部分頁列與期間底部面板；頁尾；清空移到危險區；匯入入口搬移；刪除 `.nav-dot`、`.green-dot` 的 JSX 與 class；`.scope-note` 併入 `period-summary` | V3-2、人工關卡 H2；D-V3-10、D-V3-14 | 1280 頂欄單列；內容前控制項 ≤ 12；390 首屏可見第一個數字；匯入路徑 ≤ 2 次點擊；§6.3 #1–#23 的 testid；選單鍵盤與回焦 E2E | 期間列、頂欄、導覽相關的 E2E（快捷套用行為若改，在本批一次改完）；`.scope-note`、`.sidebar .tiny-tag` 等 locator 斷言改用 testid（revamp-r1-layout、revamp-r2-copy、period-comparison、manager-presentation）；匯入相關 E2E 改用 `page-import`／`data-status-import`：`import-wizard-helpers.ts`、`import-wizard.spec.ts`（點擊數基準：非資料來源頁從 1 次變 2 次）、`revamp-r4.spec.ts`、`manager-presentation.spec.ts`；`mounted-testids` 加入殼層與 M6 唯一性 |
| **V3-4 經營總覽**（**MVP 切線**） | 本期一句話與複製週會摘要（F1）；KPI 帶（C1）；三件事警示列（C9）；橋接瀑布、橋接表與平衡檢核（F3、C17）；四層利潤瀑布（F2）；趨勢與通路圖的規格（C16）；其他常用指標表（C2）；進階區；C1、C9、C16–C18 的 class | V3-3；D-V3-11、D-V3-13 | 1440 首屏位置（§2.3 B）；瀑布加總到分；一句話 5 種情境的單元測試；CLS < 0.05；§6.3 #24–#32 的 testid；內部 2 人的 10 秒結論率走查 | `tests/copy-density.test.ts`（總覽主層計數）、`tests/manager-language.test.ts`（三件事結構、`labels.sections.impact`、rankingNote 次數、精確值斷言）、`overview` 相關 E2E 與截圖 spec |
| **V3-5 通路健檢、商品毛利、計算與來源抽屜** | 健檢警示列與計數徽章；通路寬表欄序、排序與手機清單；AI 區收合；商品頁工具列與前 10 名表；表格密度切換（F18）；抽屜重排（標題、精確值、指標定義段、原始明細）；C3 手機清單、C6 | V3-4；D-V3-3 | §6.3 #33–#36、#55 的 testid；抽屜 h2 規則；手機表格 axe 通過；`design-lint` hex ≤ 10 | `diagnosis-list`、`evidence` 相關的單元與 E2E 測試；`tests/manager-language.test.ts`（健檢主層斷言，例如 `270.00`）；`.evidence-body > .number`、`details.diagnosis-row` 等 locator 斷言 |
| **V3-6 假設試算與待辦** | 試算方案欄並排（不用分頁）、精簡表單、placeholder 與條件提示、範本說明 popover；待辦卡片精簡、「移到」文字按鈕列、待辦編輯抽屜（三段，不用分頁）、空狀態；C13 | V3-5；D-V3-12 | §6.3 #37–#42 的 testid；試算 golden 不變；看板鍵盤流程；首次進入可見控制項 ≤ 14；從範本到結果 3 個動作 | `decision.test.ts`、`action-board.test.ts`、試算與待辦的 E2E（抽屜開啟路徑） |
| **V3-7 會議紀錄與匯出** | 會議頁文件式版面、頁首動作列、結束標示、議程 `<ol>` 與精簡摘要（議程 5 保留選入 select）、會議門檻與總覽門檻維持兩份 state；A4 列印版頭與匯出版頭（§7.9）；頂欄匯出選單內容與各頁「匯出本頁」頁內下拉串接完成；export-theme（§9.6） | V3-6 | §6.3 #43–#50、#16 的 testid；PDF 頁數不增加；各格式匯出內容依 §6.5 的格式別允許差異正規化比對；PPT、Excel 開檔人工檢查並截圖 | `meeting-page.test.tsx`、`manager-summary.test.ts`、`tests/manager-language.test.ts`（議程與門檻斷言）、`tests/export.test.ts`（改成正規化比對）、`excel-export.test.ts`、`pptx-export.test.ts`、會議 E2E |
| **V3-8 資料來源、匯入精靈、空狀態** | 資料來源頁重排（問題表移到第二段、主次按鈕依是否有資料切換）、前處理表格化、版本與來源資訊彙整、範本 3×3 表；匯入精靈全版模式、步驟 2／3 收合、stepper（C20）；全站空狀態與骨架等高（C10）；刪除 `.empty-illustration` 的 JSX 與 class | V3-7 | §6.3 #51–#54 的 testid；匯入 E2E；含稅匯入點擊數 ≤ v2；CLS < 0.05；`design-lint` hex = 0 | `import-wizard.test.ts`、`import-guidance.test.ts`、匯入 E2E |
| **V3-9 P1 新增功能** | F8 三線趨勢、F9 管理損益表、F10 圖表下鑽、F11 目標三態（只在 D-V3-16 選 B／C 時）、F12 損益兩平 MER（優先在 application，獨立版本 `breakeven-mer-v1`＋手算 golden）、F13 廣告決策標籤（備份 v5＋遷移）、F14 匯出變體、F22 投影模式；F15 視拍板，F16 在取得檔案時 | V3-8；D-V3-16、17、19、20、23 | 每項新增計算都有獨立手算 golden；禁區 diff 只有白名單內的新增；`assist-kpi-v1` 的既有輸出不變；備份 v1–v5 還原測試 | `assist-kpi.test.ts`（新增案例）、`action-backup.test.ts`、新功能的 E2E |
| **V3-10 上線檢查** | 整理人工關卡 H4（5 人可用性複測與外部盲評，同 H1 腳本）的結果；Lighthouse（正式站 1440、390）；四尺寸走查與鍵盤走查；v1–v5 備份還原；網路紀錄（確認沒有資料外送）；沿用 R7 的 13 項 HTTP 上線檢查；移除 labels 舊 key alias；版本 3.0.0；RELEASES（含破壞性變更：Excel 工作表改名）、README、`docs/STATUS.md` 收尾 | V3-9（若 V3-9 延期，依賴 V3-8） | §2.3 B、C 全部指標達標；§2.3 A 由人工關卡 H4 補上，未完成時 STATUS 寫「未執行／待人工」；沒達標的項目與原因誠實列出；Lighthouse a11y 不低於 V3-0 同頁基準且 ≥ 95 | 刪除 alias 後的全套測試 |

### 12.3 工作量估計與 MVP 切線

| 批次 | 大小 | 估計（Claude Code 一個工作階段內的工作量） | 另需的人工時間 |
|---|---|---|---|
| V3-0 | M | 測試與腳本 6–8 個新檔，不改 UI | 人工關卡 H1：5 人基準測試約 3–5 個工作天（招募與排程）；盲評 1 天 |
| V3-1 | L | `globals.css` 大量替換，約 189 個色碼降到 ≤ 60 | 人工關卡 H2：設計稿審查 2–3 個工作天 |
| V3-2 | L | labels 重整、格式函式、測試斷言遷移（最多的一批） | 人工關卡 H3：審 `copy-rewrite.csv` 與紙本用語測試約半天 |
| V3-3 | M | 殼層元件 | — |
| V3-4 | L | 總覽與兩張瀑布圖 | 內部走查半天 |
| **MVP 切線**（V3-0–V3-4，至少 5 個工作階段） | | 完成後，**經使用者明確同意**（D-V3-24，AGENTS.md：部署需使用者授權）才部署成 Vercel preview，讓老闆試用新首屏；是否先上正式站也見 D-V3-24 | |
| V3-5 | M | — | — |
| V3-6 | M | — | — |
| V3-7 | M | — | 匯出檔人工檢查半天 |
| V3-8 | M | — | — |
| V3-9 | L | 可以整批延到 v3.1，不影響「簡明、專業、不砍功能」三個目標 | 視 F15、F16 的檔案 |
| V3-10 | M | — | 人工關卡 H4：5 人複測 3–5 個工作天；外部盲評 1 天 |

> P2 項目（F17、F19–F21）不排進主線。如果某批提前完成，可以在**同一批範圍內**做相關的 P2（例如 V3-5 順手做 F17 sparkline），但要在該批驗收文件中註明。

---

## 13 風險與需拍板事項

### 13.1 風險

風險編號用 RK，以免和 v2 的批次 R0–R7 撞名。

| # | 風險 | 可能性 | 影響 | 對策 |
|---|---|---|---|---|
| RK1 | 改名與重排連帶大量中文斷言（manager-language、export、E2E），結果為了讓測試通過而改回舊文案，或漏測 | 高 | 高 | 同一批把斷言改成 import labels 與格式化函式；copy-style 守門；`e2e-text-assertions.csv` 逐條勾銷 |
| RK2 | 數字精度改變（到分改成萬），E2E 的數字斷言大量失敗 | 高 | 中 | E2E 改成斷言格式化函式的輸出；golden 只在 domain 層，不受影響 |
| RK3 | 「去 AI 感」是主觀目標，沒有 v2 基準就無法證明改善 | 中 | 高 | 人工關卡 H1 先量 v2（受試者問卷加外部盲評，用同一套錨點；V3-0 備妥腳本） |
| RK4 | token 化牽動約 336 個自訂 class（以 ui-audit 為準）與 189 個色碼（口徑內合計 201），容易變成整檔重寫，也可能讓對比退步 | 中 | 高 | 依頁面分批、棘輪制；每批跑 contrast-check 與 Lighthouse；class 名稱保留 |
| RK5 | 首屏合併、殼層重排、內容搬進彈出層時，漏搬 testid、`role=status`、`<details>` 結構 | 中 | 高 | testid 基準測試＋M1 掛載規則與測試＋功能保留表逐列打勾 |
| RK6 | 自己做的瀑布、三線、sparkline 出現 a11y 缺口（只靠顏色、沒有替代內容、長條無法用鍵盤操作）或在手機溢出 | 中 | 中 | 每張圖都有資料表替代；鍵盤經由表格的 number-link；圖表規格強制直接標籤與線型區分；390 截圖必檢 |
| RK7 | 手機把表格改成清單時，CSS 讓 table 失去語意 | 中 | 中 | 明確加 role、做 axe 檢查；不行就退回橫向捲動並讓第一欄 sticky |
| RK8 | 期間快捷改成直接套用（若 D-V3-10 通過），改變 R1 的既有行為與測試，或意外改到範圍 | 中 | 中 | 拍板後在 V3-3 一次改完；會議與試算有自己的固定範圍與新鮮度提示 |
| RK9 | CM1／CM2 對照被讀成「等同 Daasity 口徑」，引起口徑爭議 | 低 | 中 | 只放在指標定義與抽屜，明寫差異 |
| RK10 | 損益兩平 MER 與目標三態（只在 D-V3-16 選 B／C 時存在）屬於新增邏輯，算錯會傷害可信度 | 中 | 高 | 獨立手算 golden；扣廣告前貢獻 ≤ 0 時回傳 null 加原因碼；損益兩平 MER 用獨立版本常數，不動 `assist-kpi-v1` |
| RK11 | 費率參考提示過時，或被誤當成實績 | 中 | 中 | 建議本輪不做（D-V3-21） |
| RK12 | 市場窗口：atmarketing 加入貢獻計算，或 MarginStack、Conjura、StoreHero 把「指標轉行動」做成標配，壓縮週會流程的差異（市場調研 §9-5） | 中 | 中 | v3 不能只做美化：F1、F2 是 P0；F9、F15、F16 補強台灣在地性 |
| RK13 | 來源預設只有蝦皮訂單經過真實檔驗證；主打台灣通路卻沒有補驗證，宣稱與實證的落差更明顯（市場調研 §7-2） | 高 | 中 | F16 依取得檔案的情況排入；沒驗證的預設在畫面上誠實標示 |
| RK14 | 5 人樣本小；受試者都熟 Excel 的話，會高估執行者的成功率 | 中 | 低 | 結論只拿來找問題；招募時至少 1 位不熟 Excel 的人；另加外部盲評 |
| RK15 | 摘要層改用萬之後，執行者對帳時找不到到分的數字 | 中 | 中 | 抽屜標題下一行永遠顯示精確值；L2 表格用整數元；匯出到分 |
| RK16 | Excel 工作表改名，弄壞使用者已經寫好的跨表公式 | 中 | 中 | CSV 欄名不變；工作表改名寫進 RELEASES 的破壞性變更段，並在「這版改了什麼」中提示 |
| RK17 | 設計稿審查發現方向不對，造成 V3-3 以後重工 | 中 | 高 | 審查放在 V3-1 結束、V3-3 開工前；V3-2 只改語言不改版面，不會白做 |
| RK18 | 本 PRD 的競品陳述都來自調研文件與其中的 URL，沒有試用任何競品；UI 細節屬於推論 | — | 低 | 設計時以概念為準，不宣稱照抄 |

### 13.2 需拍板事項（V3-0 拆成 `docs/revamp-v3/09_DECISIONS_PENDING.md`）

「建議」欄是本 PRD 推薦的值，**不是預設生效值**。沒有明確回覆就不視為核准：受影響的批次不開工，或只做不受影響的部分，拍板前沿用 v2 的行為與用詞（§12.1 拍板規則）。修正 v2 既有決策（D-V3-1、D-V3-2）與部署（D-V3-24）一律要使用者明確同意。拍板結果寫進 `docs/DECISIONS.md`。

| 代號 | 事項 | 選項 | 建議 | 影響批次 |
|---|---|---|---|---|
| D-V3-1 | 「通路貢獻」是否改名（修正 D1 的一部分） | A 改成「扣廣告前貢獻」，「通路貢獻」列為別名／B 維持「通路貢獻」，副標寫「扣廣告前」／C 改成「行銷前貢獻」 | **A**。首屏還有「各通路扣廣告後貢獻」，「通路貢獻」容易被讀成各通路加總；A 和「扣廣告後貢獻」成對，一眼看出兩者差在廣告費 | V3-2 |
| D-V3-2 | 「口徑」三個意思的拆分 | A 指標定義（對話框）／金額基準（匯入）／解讀限制（CSV 欄）／B 維持「口徑」 | **A**；用語驗證在人工關卡 H3 以紙本用語測試先做（V3-2 開工前）；V3-10（H4）複測不過時，把 labels 值換回舊名回退（舊名已是 alias，只改 labels 值與測試） | V3-2 |
| D-V3-3 | 抽屜與按鈕的名稱 | A 抽屜「計算與來源」、按鈕「看明細」／B 抽屜「計算明細」、按鈕「看明細」／C 維持「怎麼算的」＋「看證據」 | **A**。去掉「證據」的稽核語感；「計算方式」保留為抽屜內的段落名 | V3-2、V3-5 |
| D-V3-4 | 導覽「待辦與決議」與全站的「行動」 | A 導覽改「待辦」，「行動」全面改「待辦」（含 Excel 工作表名）／B 維持現狀 | **A**。決議實際上在會議紀錄頁；一個概念一個詞 | V3-2、V3-3 |
| D-V3-5 | MER 的主名 | A 廣告效率（MER）／B 維持廣告投報（MER） | **A**。「投報」會讓人以為是 ROI 或 ROAS | V3-2 |
| D-V3-6 | 「台」或「臺」 | A 全站「台」（新台幣、台北時間），法規引用維持原文／B 全站「臺」 | **A**。和台灣電商後台與日常用語一致 | V3-2 |
| D-V3-7 | 有利方向的顏色 | A 只有不利上色，有利用主文字色加「+」與「有利」文字／B 有利用綠色 `#2d6a3e` | **A**。依 Few 的色彩預算，也避免和品牌綠混在一起 | V3-1 |
| D-V3-8 | 負數表示 | A UI 用「−」、CSV／JSON 用「-」，列印、PDF、Excel 的管理損益表用括號 (1,234)／B 全部用「−」（CSV 用「-」） | **A**。符合台灣損益表的閱讀習慣，又不影響螢幕上的一致性 | V3-2、V3-7、V3-9 |
| D-V3-9 | 主色是否沿用品牌深綠 | A 沿用 `#1f5a4f`，只降低使用量／B 改成中性藍或黑 | **A**。保留品牌辨識 | V3-1 |
| D-V3-10 | 期間快捷是否直接套用 | A 快捷單擊就套用，手改日期才要按套用／B 維持明確套用，但強化「待套用」狀態 | **A**（老闆少一步）。R1 選擇明確套用的理由（避免意外改到範圍），由會議與試算的固定範圍機制處理 | V3-3 |
| D-V3-11 | KPI 帶的順序 | A 依四層順序（淨營收 → 商品毛利 → 扣廣告前 → 扣廣告後 → 貢獻率），扣廣告後貢獻用 32px 與強調線突出／B 扣廣告後貢獻放第一格 | **A**。保留四層口徑的閱讀順序，也就是「錢一路被扣到哪裡」；結論已經由本期一句話給出 | V3-4 |
| D-V3-12 | 試算「我了解這是試算」的勾選 | A 每個方案都勾（現狀）／B 同一工作區勾一次就記住（寫入備份），第一次勾之前每個方案都顯示聲明文字 | **B**。降低重複操作；聲明文字仍然可見 | V3-6 |
| D-V3-13 | 週會摘要的預設內容 | A 版頭＋本期一句話＋關鍵數字＋三件事＋置頂待辦（最多 3）＋未完成數／B 再加健檢前 N 名 | **A**；標題用換行，不用「｜」 | V3-4 |
| D-V3-14 | 側欄分組名稱 | A 看結果／找原因／做決定／管資料／B 不分組 | **A**；用語驗證在人工關卡 H3 以紙本用語測試先做；H4 複測不過時改回不分組或換名，只改 labels | V3-3 |
| D-V3-15 | 新增分析事件名 | `summary_copied`、`glossary_opened`、`waterfall_clicked`、`export_page_opened`、`export_csv`、`export_json`、`present_mode_opened`（P1） | 新增，只記事件名（符合 D9）；`export_csv`、`export_json` 用於 §2.3 C 的匯出事件比率，範本下載不記 | V3-3、V3-4 |
| D-V3-16 | 目標「接近」的範圍 | A 只顯示實際／目標／差額加細條，不分三態／B 三態，接近＝±5% 固定／C 三態，範圍由使用者在 targets.csv 設定 | **A 先上**，C 列為之後的選項。選 A 時 F11 不做（#25 已在 V3-4 提供實際／目標／差額＋細條），也從 RK10 移除 | V3-9 |
| D-V3-17 | 損益兩平 MER 的版本標籤與實作位置 | A 歸入 `assist-kpi-v1`／B 整組升為 `assist-kpi-v2`／C 既有 7 個輔助指標維持 `assist-kpi-v1` 不變，F12 用獨立常數與版本 `breakeven-mer-v1`，實作在 `src/application`（比照 R4 的 assist-kpi 前例） | **C**。`ASSIST_KPI_VERSION` 是 7 個既有指標共用的常數，寫在 CSV、Excel 與主管摘要（`assist-kpi.ts:10`、`export.ts:111`、`excel-export.ts:217`、`manager-summary.ts:161`）；B 會改到既有指標的輸出，違反「不改既有指標的輸入輸出」。只有確定必須進 `src/domain` 時，才另列要新增的檔案與函式簽名，由人拍板 | V3-9 |
| D-V3-18 | CM1／CM2 對照放哪裡 | A 只放在指標定義對話框與抽屜／B 也放在 KPI 次標 | **A**。主層保持中文，避免中英夾雜 | V3-2 |
| D-V3-19 | 管理損益表放哪裡 | A 總覽「進階」`<details>`／B 資料來源頁／C 新增「報表」頁 | **A**，不新增頁面 | V3-9 |
| D-V3-20 | 台灣化示範資料 `fixtures/demo_tw`（D3 的 B 案） | A 排入 V3-9／B 上線後再做 | **A**。手算 expected 約半天，對在地試用很重要；時程不夠時延後 | V3-9 |
| D-V3-21 | 試算頁的平台費率參考提示 | A 不做／B 只當說明並標日期／C 可以選擇預填 | **A**。口徑風險大，而且要維護日期 | — |
| D-V3-22 | 已結束會議與舊備份中的 v2 用詞 | A 數字、決議、備註不動，介面欄名用新名詞渲染，頂部加註「本紀錄建立於 v2，部分名稱已更新」／B 完全照 v2 文字顯示 | **A**。可追溯的內容不變，讀者看到的名詞一致 | V3-2、V3-7 |
| D-V3-23 | 投影模式是否納入本輪 | A 納入 V3-9（P1）／B 延到 v3.1 | **A**。老闆主要在週會投影閱讀，成本只是重新對應 token | V3-9 |
| D-V3-24 | MVP（V3-0–V3-4）完成後是否先上正式站 | A 只部署 Vercel preview，V3-10 才切正式站／B 正式站分階段上線（每批都上） | **A**。避免正式站出現新舊混搭的畫面；用 preview 給老闆試用。任何部署（含 preview）都要使用者明確同意，不能以沒有回覆代替同意（AGENTS.md：部署需使用者授權） | V3-4 以後 |

**需要使用者提供的材料**

- 5 位可用性測試受試者（人工關卡 H1 與 H4 各一輪；老闆、主管、執行者至少各 1 位，其中至少 1 位不熟 Excel）。
- 3 位外部盲評者（至少 1 位設計者、1 位電商經理人；H1 與 H4 各一輪）。
- 2–3 位台灣電商經理人，在 V3-1 結束後審查設計稿（人工關卡 H2，擋 V3-3）。
- D-V3-20 選 A 時：台灣化示範資料的商品與檔期設定。
- F16：去識別化的真實平台匯出檔。
- `copy-rewrite.csv` 的審稿與紙本用語測試（人工關卡 H3，擋 V3-2）。

---

## 14 附錄

### 14.1 名詞對照（v2 → v3；待拍板項目以建議值列出）

| v2 | v3 | 備註 |
|---|---|---|
| 營運決策工作台（每頁 eyebrow） | （刪除） | 只留在 `<title>` 與 SEO |
| 工作區 / 頁名（麵包屑） | 頁名（h1） | — |
| 我的工作區 | （主層不顯示） | 儲存訊息寫「目前的資料與紀錄」 |
| 資料就緒 | 資料到 {date} | — |
| 公開示範版 | 公開示範站（只在 popover） | — |
| 自動健檢可用｜AI 解釋未啟用（公開版） | AI 未啟用 | — |
| 口徑說明 | 指標定義 | D-V3-2 |
| 金額口徑 | 金額基準 | D-V3-2 |
| 口徑限制（CSV 欄） | 解讀限制 | D-V3-2；english_key 不變 |
| 通路貢獻 | 扣廣告前貢獻 | D-V3-1；別名保留 |
| 貢獻率 | 扣廣告後貢獻率（短名：貢獻率） | — |
| 廣告投報（MER） | 廣告效率（MER） | D-V3-5 |
| 退款比 | 退款金額比 | — |
| 對貢獻影響 | 影響金額 | — |
| 輔助指標 | 其他常用指標 | — |
| 看證據／怎麼算的／公式與來源 | 看明細（按鈕）／計算與來源（抽屜） | D-V3-3 |
| 來源資料（抽屜段落） | 原始明細 | — |
| 數據（健檢段落） | 相關數字 | — |
| 自動健檢（標籤） | （刪除） | 計數併入標題 |
| 待辦與決議（導覽）／行動 | 待辦 | D-V3-4 |
| 置頂行動 | 置頂待辦 | — |
| 會議稿／新會議稿／主管摘要／會議摘要 | 本次會議（草稿）／已結束會議／一頁摘要 | — |
| 兩個關鍵差額 | 關鍵數字 | — |
| 本期三件事（議程） | 本期重點 | 總覽維持「本期三件事」 |
| 本期三件事（不足 3 件時） | 本期要先看的事（{n} 件） | — |
| 通路表（議程） | 各通路表現 | — |
| 本次選入方案 | 選入方案 | — |
| 計算（試算按鈕） | 試算 | — |
| 我了解這是假設試算，不是預測 | 我了解這是試算，不是預測 | — |
| 下載 ▾ | 匯出 | — |
| 試試示範資料 | 載入示範資料 | — |
| 由小到大（先看下降） | 商品毛利差額：下降最多優先 | — |
| 變化（KPI 抽屜標題）／變動 | 差額 | — |
| 平台費、金流費、物流費（錯誤訊息） | 平台抽成、金流手續費、物流與包材費 | — |
| TREND／CONTRIBUTION BRIDGE／CHANNEL MIX | （刪除）每週淨營收與扣廣告後貢獻／貢獻變化拆解／各通路扣廣告後貢獻 | — |
| 新臺幣・臺北時間 | 新台幣 · 台北時間 | D-V3-6 |
| —／N/A | 資料待補／不適用 | — |
| TWD、NT$（主層） | 元 | 匯出 metadata 與 L3 保留 TWD |
| ● 未保存 | 未保存 | — |
| 匯入資料｜對照欄位 | 匯入資料（stepper：步驟 2 · 對照欄位） | — |

### 14.2 來源

**本專案文件與證據**

- `/Users/j-work/ProfitLens/docs/market-comparison-2026-10-05.md`（§1、§4、§6、§7-2、§7-10、§8-4、§9、§10、§12、附錄 A）
- `/Users/j-work/ProfitLens/docs/METRICS.md`、`docs/DATA_CONTRACT.md`、`docs/SCENARIOS.md`、`docs/DECISIONS.md`
- `/Users/j-work/ProfitLens/docs/revamp/01_BRIEF.md`、`02_IA_LAYOUT.md`、`03_GLOSSARY_COPY.md`、`05_FEATURES.md`、`06_BATCHES.md`、`09_DECISIONS_PENDING.md`（D1–D12）
- `/Users/j-work/ProfitLens/src/components/`：`dashboard.tsx`、`overview.tsx`、`top-three.tsx`、`workspace-panels.tsx`、`diagnosis-list.tsx`、`channel-table.tsx`、`product-comparison-panel.tsx`、`manager-summary.tsx`、`meeting-page.tsx`、`decision-workbench.tsx`、`multi-scenario-workbench.tsx`、`scenario-sensitivity.tsx`、`actions-workbench.tsx`、`evidence-drawer.tsx`、`workspace-storage.tsx`、`ai-panel.tsx`、`replacement-dialog.tsx`、`basis-dialog.tsx`、`issue-list.tsx`、`import-wizard/*`
- `/Users/j-work/ProfitLens/src/app/globals.css`（2026-10-05 掃描：`:root` 6 個變數；相異 hex 189 個，不分大小寫；加上 `src/components/**/*.tsx` 與 `manager-summary.module.css` 後口徑內合計 201；相異 border-radius 值 18 種；相異 font-size 宣告值 21 種；相異 class 約 336 個）
- `/Users/j-work/ProfitLens/src/i18n/labels.zh-TW.ts`（1,954 行；「注意：」42 處、箭頭字元 23 處、否定句 63 處）
- `/Users/j-work/ProfitLens/src/application/presentation.ts`、`copy.ts`、`import.ts`、`workspace-backup.ts`、`local-store.ts`
- `/Users/j-work/ProfitLens/tests/copy-density.test.ts`、`labels-coverage.test.ts`、`tests/e2e/`（21 個 spec 加 2 支 helper；含 helper 約 569 行 `getByText`／`getByRole`、約 652 行 `getByTestId`，只算 spec 為 556／633 行；另有約 260 行非 testid 的 `locator()`）；靜態 `data-testid` 129 個；`package.json` 的 recharts 3.10.1
- 截圖：`verification/revamp-R7/0-landing-desktop-viewport.png`、`1b-overview-{desktop,laptop,tablet,mobile}-viewport.png`、`1b-overview-desktop-full.jpg`、`2-top-three-desktop-viewport.png`、`3-evidence-desktop-viewport.png`、`4-action-board-desktop-viewport.png`、`5-scenario-{desktop,tablet}-viewport.png`、`6-meeting-desktop-viewport.png`、`7-print-desktop-viewport.png`；`verification/revamp-R5/1-diagnosis-list-desktop-viewport.png`、`4-products-top-bottom-desktop-viewport.png`；`verification/revamp-R6/1-save-prompt-desktop-viewport.png`、`4-download-menu-desktop-viewport.png`；`verification/revamp-R3/3-step2-mapping-desktop-viewport.png`、`8-data-preprocessing-desktop-viewport.png`；`docs/images/overview-1440.png`

**外部來源（標竿研究時實際讀取；另有標註者例外）**

- Shopify：https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/overview-dashboard ；https://www.shopify.com/blog/new-analytics ；https://shopify.dev/docs/apps/design/layout.md ；https://shopify.dev/docs/apps/design/visual-design.md ；https://shopify.dev/docs/apps/design/content.md ；https://shopify.dev/docs/apps/design/content/grammar-and-mechanics.md ；https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/table.md ；https://shopify.dev/docs/api/app-home/latest/web-components/typography-and-content/number.md
- Stripe：https://docs.stripe.com/reports/balance ；https://docs.stripe.com/dashboard/basics ；https://docs.stripe.com/stripe-apps/design ；https://docs.stripe.com/stripe-apps/style ；https://docs.stripe.com/stripe-apps/patterns ；https://docs.stripe.com/stripe-apps/patterns/chart-layout ；https://docs.stripe.com/stripe-apps/patterns/empty-state ；https://docs.stripe.com/stripe-apps/patterns/action-buttons
- Linear：https://linear.app/now/how-we-redesigned-the-linear-ui ；https://linear.app/now/behind-the-latest-design-refresh
- Mercury：https://mercury.com/blog/introducing-insights
- Ramp：https://ramp.com/reporting
- Brex：https://brex.com/support/brex-reporting
- QuickBooks：https://quickbooks.intuit.com/learn-support/en-us/reports/compare-time-periods-in-reports/00/263054 ；https://quickbooks.intuit.com/learn-support/en-global/help-article/business-reports/transition-classic-modern-view-reports/L9hzVlzh4_ROW_en
- Google Analytics：https://support.google.com/analytics/answer/9269518
- Amplitude：https://amplitude.com/docs/analytics/dashboard-preferences.md
- Vercel：https://vercel.com/changelog/dashboard-navigation-redesign-rollout ；https://vercel.com/geist/introduction ；https://vercel.com/geist/colors.md ；https://vercel.com/geist/typography.md ；https://vercel.com/geist/empty-state.md
- StoreHero：https://storehero.ai/ ；https://apps.shopify.com/storehero-profit-analytics ；https://storehero.ai/pricing （引自市場調研 §4）
- MarginStack：https://apps.shopify.com/marginstack
- Lifetimely：https://apps.shopify.com/lifetimely-lifetime-value-and-profit-analytics ；https://useamp.com/pricing （引自市場調研附錄 A）
- Triple Whale（讀取回 403，內容取自搜尋摘要）：https://kb.triplewhale.com/en/articles/5725275-track-kpis-with-the-summary-dashboard
- Polar Analytics：https://polaranalytics.com/business-intelligence
- 以下引自市場調研：Daasity https://help.daasity.com/core-concepts/contribution-margin ；Net Net https://apps.shopify.com/netnet ；CYBERBIZ https://help.cyberbiz.io/ec/business-intelligence/revenue-analysis/ ；Northbeam https://docs.northbeam.io/docs/profitability-benchmarks ；Conjura https://www.conjura.com/ecommerce-actions-dashboard ；Dashboardly https://www.dashboardly.io/ ；Admetry https://admetry.app/templates
- IBM Carbon：https://www.carbondesignsystem.com/building-blocks/data-visualization/dashboards ；https://www.carbondesignsystem.com/building-blocks/data-visualization/axes-and-labels ；https://www.carbondesignsystem.com/building-blocks/data-visualization/color-palettes ；https://www.carbondesignsystem.com/building-blocks/data-visualization/chart-anatomy ；https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines
- Atlassian：https://atlassian.design/llms-content.txt ；https://atlassian.design/llms-components.txt
- Apple HIG Charts：https://developer.apple.com/design/human-interface-guidelines/charts （以 developer.apple.com/tutorials/data/design/human-interface-guidelines/charts.json 讀取）
- Material Design m1：https://m1.material.io/components/data-tables.html
- Microsoft Style Guide：https://learn.microsoft.com/en-us/style-guide/checklists/numbers-checklist
- Stephen Few：https://blogs.ischool.berkeley.edu/i247s13/files/2013/02/WhyMostDashboardsFail.pdf
- Edward Tufte：https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/
- 公開資訊觀測站月營收表：https://mopsov.twse.com.tw/nas/t21/sii/t21sc03_115_8_0.html
- 星展銀行台北分行綜合損益表（格式二）：<https://www.dbs.com.tw/iwov-resources/pdf/legal%20disclaimers%20and%20announcements/04_taipei%20branch/01_financial%20and%20business%20information/%28BR%29Internet%20Report_2023Q2.pdf>
- 工商時報 IFRS 18 編製準則修正（2026-02-06）：https://www.ctee.com.tw/news/20260206701669-430301
- 經理人財務長專欄：https://www.managertoday.com.tw/columns/view/57380
- 蝦皮手續費報導（INSIDE，2024-01-15）：https://www.inside.com.tw/article/33911-shopee-handling-fee

**沒有讀取，所以不引用**：Xero 產品建議頁 productideas.xero.com/…/45601480（原建議已不存在，302 轉址到論壇索引頁；先前只讀到搜尋摘要，所以 B7 不再引用）、Apple HIG Writing（頁面無法抓取）、polaris.shopify.com 舊網址（已轉址）、momo 費率文章（uptogo 回應 403）、atlassian.design/foundations/content/language-and-grammar（某份草稿引用過，但無法確認是否實際讀過，所以不列入）。

### 14.3 評審紀錄摘要

**評分**（每項 1–10 分，共 7 項，滿分 70）

| 草稿 | 評審 1（從台灣電商老闆或營運長的角度） | 評審 2（從資深產品設計師與前端負責人的角度） | 平均 | 結果 |
|---|---|---|---|---|
| 高階經理人優先（executive-first） | 62（清晰 9、去 AI 感 9、功能保留 9、標竿 9、可實作 8、可量測 9、完整 9） | 62（同左） | 62 | **兩位評審都選為最佳，作為本 PRD 的骨架** |
| 設計系統優先（design-system-first） | 58（7／9／8／9／8／8／9） | 60（8／9／8／9／8／9／9） | 59 | 移植元件、token 與邊界規則 |
| 執行者語言優先（operator-language-first） | 57（7／8／9／8／8／8／9） | 56（8／8／8／8／7／8／9） | 56.5 | 移植匯入、錯誤、匯出與語言規則 |

**從其他草稿移植的項目（評審標為 must_graft）**

| 來源草稿 | 移植項目 | 在本 PRD 的位置 |
|---|---|---|
| 設計系統優先 | `:root` token CSS：原始色階加語意別名層，元件只能引用別名層 | §9.1、§9.3 |
| 設計系統優先 | C1–C23 元件目錄（含 C9 警示列、C16 圖表框的四態等高、C17 瀑布、C18 目標細條） | §9.4 |
| 設計系統優先 | 數字對齊、版面不跳動（含 E2E 高度比對）、危險動作移到危險區 | §5.2 X23、X24、X25 |
| 設計系統優先 | 零值不用「-」的理由；`favorableDirection` 放在呈現層 | §8.5 規則 3、8 |
| 設計系統優先 | 試算與待辦抽屜不用分頁，避免藏住 testid | §6.4 M2、§7.4、§7.5 |
| 設計系統優先 | `testid-baseline.test.ts`（129 個靜態 testid，加運算式與 `testId` 屬性來源，樣板展開成實際渲染值） | §11.7 |
| 設計系統優先 | 允許保留的「個性」 | §5.3 |
| 執行者語言優先 | 錯誤句型「檔名 第 N 行：問題。修法。」、占位符、`import-errors-copy` regex 測試、完整改寫表 | §7.7.3（§8.8 #26、#27 指向它） |
| 執行者語言優先 | 依匯出格式分配語言層（PPT／PDF L1＋L2、L3 放附錄；Excel／MD L1＋L2＋L3；CSV／JSON 只有 L3） | §3.3、§9.6 |
| 執行者語言優先 | 匯出項目逐項對照，範本表改成 3×3 修正錯位 | §6.5 |
| 執行者語言優先 | 日期格式與標點規則 | §8.6、§8.7 |
| 執行者語言優先 | CSV 欄名不變、Excel 工作表改名要記錄的相容性說明 | §8.9、§11.8 |
| 執行者語言優先 | 資料來源頁的問題表移到第二段；主次按鈕依是否有資料切換；單位只標一次 | §7.7.1 |
| 執行者語言優先 | labels 遷移：headline／explain／technical、舊 key alias 保留到最後一批、`basis.aliases` 可搜尋舊名、`copy-rewrite.csv` 人工審稿 | §8.9、§8.10 |
| 執行者語言優先 | 台灣報表四行匯出版頭（含 metric_version 與產出時間） | §7.9 |

**修正骨架草稿的弱點**

| 評審指出的弱點 | 本 PRD 的處理 |
|---|---|
| hex 目標前後不一致（0 和 ≤ 60） | 單一棘輪時程：189 → V3-1 ≤ 60 → V3-3 ≤ 30 → V3-5 ≤ 10 → V3-8 = 0（§2.3 B）；基準以腳本實測為準 |
| 試算結果用分頁，可能藏住 testid | 改成方案並排、結果區塊依序排列，不用分頁（§7.4、M2） |
| 範本說明搬進 tooltip，但沒說關閉時是否掛載 | M1 掛載規則與 `mounted-testids` 測試（§6.4） |
| 週會摘要仍用「｜」 | 改成換行（§10.2） |
| 「要賣到多少才划算」改成「損益兩平」，和 F12 撞名 | 保留原名（§7.4、§8.3 #22） |
| L1 ≤ 14 字和約 30 字的本期一句話衝突 | 定義「L1 複合句」：最多兩個子句、每個子句 ≤ 14 字、全句 ≤ 40 字（§3.2） |
| 把每頁的「匯入資料」按鈕拿掉，執行者多一步，沒有指標 | 新增「匯入路徑 ≤ 2 次點擊」指標，資料來源頁仍是 1 次（§2.3 B） |
| 沒有一頁的老闆摘要 | 新增文件開頭的「決策摘要」 |
| 沒有工作量估計與 MVP 切線 | §12.3 |

**一併補上的共同缺口（三份草稿都沒有）**

| 缺口 | 本 PRD 的處理 |
|---|---|
| 開工前沒有視覺設計審查 | V3-1 產出靜態設計稿，由 2–3 位台灣電商經理人加 1 位設計者審查（人工關卡 H2），通過後才開始 V3-3 |
| 沒規劃改名怎麼告訴既有使用者 | §8.9「這版改了什麼」提示、舊名搜尋、Excel 公式影響、RELEASES |
| 沒有投影模式 | §9.7、F22、D-V3-23 |
| AI 感評分沒有校準方式 | §2.3 A 的外部盲評（截圖不標版本、順序隨機、用公開文件截圖當錨點） |
| PPT 與 Excel 匯出沒有視覺 token | §9.6 |
| 功能保留檢查沒有涵蓋本機偏好（備份 `ui_prefs`）與備份 schema | §6.3 #59、#60 |
| 沒有和既有的 `copy-density.test.ts` 對齊 | §5.4 |
| 沒處理已結束會議與舊備份中的舊用詞 | §8.9、D-V3-22 |
| E2E 主要以文字與 role 定位，只守 testid 不夠 | M5 的 `e2e-text-assertions.csv`（§6.4） |
| 搬進彈出層的元素沒說是否保持掛載 | M1–M4（§6.4） |
| Recharts 的堆疊長條無法用鍵盤操作 | 長條設 `aria-hidden`，鍵盤經由表格 number-link（§7.1 第 5 點、C17） |
| 沒用 Playwright 內建截圖做視覺回歸 | `toHaveScreenshot`（§9.8） |
| hex 基準 182 和實測 189 不符 | 一律採用腳本實測值：`globals.css` 單檔 189、口徑內合計 201（§1.2） |
| 沒有深色模式的結構規劃 | 預留 `:root[data-theme="dark"]` 的位置，`body` 明確設定背景（§9.1） |
| 新語意色在 12px 時的對比只是宣稱 | `contrast-check.mjs` 依「文字 token × 底色」矩陣驗證；`--text-tertiary` 已從 #677275 調暗為 #5f6a6d，在所有底色上都 ≥ 4.68（§9.1） |
| 執行者草稿另加的紫色、藍色語意色，以及總覽上的角色捷徑 | 不採用：語意色只有不利與警示兩種（§9.1）；不做角色捷徑（§4.3） |

### 14.4 校稿紀錄（2026-10-05）

編號前綴依審查視角：B＝邊界、FP＝功能保留、E＝證據準確度、BM＝標竿引用、CQ＝一致性與品質。

- B-F1：禁區 diff 的基準由 `main` 改為 v2.0.0（`82b70df`／tag `v2.0.0`），列出 fixtures 子目錄，V3-9 改用白名單（§1.5、§2.3 C、§11.4、§12.1）。
- B-F2：V3-0 的可用性量測移出批次，新增人工關卡 H1–H4，各自註明擋哪一批；V3-1 審稿與 V3-2 審稿改標 H2、H3（§2.3 A、§12.1、§12.2、§12.3、§13.2）。
- B-F3：M5 擴大到 `locator()` 的 CSS 與結構選擇器；#19 寫明通路與比較方式的去處，並列出 V3-3 要改的 `.scope-note` 等斷言（§6.3、§6.4、§12.2）。
- B-F4：新增 M6「同一控制只有一個 DOM 實例」與唯一性測試；#2 兩個 nav 二選一（§2.3 B、§6.3、§6.4、§7.0）。
- B-F5：刪除「沒回覆就照建議值」，改為不視為核准；D-V3-1、D-V3-2、D-V3-24 一律要明確同意（決策摘要、§12.1、§12.3、§13.2）。
- B-F6：「稽核資訊」改「版本與來源資訊」；會議結束標示改寫，主層不出現「快照」「contribution-v1」；§8.4 黑名單併入 R2 禁用詞（§4.1、§6.3 #51、§7.6、§7.7.1、§8.4、§9.1）。
- B-F7：D-V3-17 改成既有 7 個指標維持 `assist-kpi-v1`，F12 用獨立版本 `breakeven-mer-v1` 並優先實作在 application（§10.1、§11.4、§12.2、§13.2）。
- B-F8：§7.7.3 寫明 `{value}`、`{column}` 的 application 來源；新增 `reason-code-labels` 測試；§11.5 註明 domain 中文是凍結區已知例外。
- B-F9：匯出驗收由「與 v2 相同」改為依格式列出允許差異並正規化比對（§6.5、§7.9、§12.2 V3-2、V3-7）。
- B-F10：manager-language 測試補進 V3-4、V3-5、V3-7；V3-3 補匯入相關 E2E 與點擊數基準；#23 改為新增 `page-import`（§6.3、§12.2）。
- B-F11：否定句上限維持 3、計數詞與 copy-density 一致；copy-style 只掃 labels，頁面計數由 copy-density 延伸；E2E 規模更正為 21 個 spec 加 2 支 helper（§5.4、§6.4、§8.4、§14.2）。
- B-F12：V3-1 只把 `.nav-dot`、`.green-dot`、`.empty-illustration` 樣式中性化，JSX 與 class 分別在 V3-3、V3-8 刪（§5.2 X6、§9.8、§12.2）。
- FP-F1：儲存選單改為本機保存／備份檔／危險區，補回同意、存在這台電腦、讀取本機副本預覽、確認已下載、技術細節（§6.3 #14、§7.9）。
- FP-F2：「匯出本頁」統一為頁內下拉並呼叫各頁既有 handler；商品 CSV 不放進頂欄（§6.3 #16、§6.5、§7.6、§10.1 F7）。
- FP-F3：§6.5 新增「其他下載入口」表，驗收改為完整入口清單逐項存在（決策摘要、§6.5、§12.2 V3-0）。
- FP-F4：#45 改為總覽與會議兩份門檻 state 不合併，健檢不新增入口（§6.3、§7.6、§12.2 V3-7）。
- FP-F5：健檢範圍 chips 維持每列一組，留在列內展開內容（§6.3 #34、§7.2）。
- FP-F6：敏感度分析留在每個方案欄內，保有各方案 state（§6.3 #38、#39、§7.4）。
- FP-F7：補回目標期間不符的提示與廣告預算達成的位置（§6.3 #25、§7.1、§9.4 KPI 規格）。
- FP-F8：上期值保持 number-link；其他常用指標不新增差額欄（§6.3 #26、§7.1、§9.4 C1）。
- FP-F9：新增 #43a 建立會議紀錄、#44a 議程 5 選入 select；「結束並列印」改回「結束列印」（§6.3、§7.6）。
- FP-F10：清單檢視維持內嵌編輯器；卡片補回引用狀態與重新核對徽章；抽屜補限制與警示，刪除「儲存」（§6.3 #40、#41、§7.5）。
- FP-F11：#59 改為備份 `ui_prefs`，既有偏好不搬到 localStorage（§6.3、§11.3、§11.8、§10.1 F18、§12.2 V3-0）。
- FP-F12：手機「更多」面板加入開發者驗證；#3 補資料集選擇與載入（§6.3 #3、§7.0）。
- E1：v2 沒有 localStorage，相關描述與基準檔改為 `ui_prefs`；#31 註明是工作階段內 state；新增偏好統一用 localStorage（同 FP-F11）。
- E2：hex 基準拆成 `globals.css` 189 與口徑內 201；掃描範圍加入 `src/components/**/*.css`；列印 token 涵蓋 `manager-summary.module.css`（§1.2、§2.3 B、§5.4、§9.6、§14.2）。
- E3：X10 改 `globals.css:98–105`，X15 改 `globals.css:62`。
- E4：meeting-page 與 evidence-drawer 行號逐一更正；feature-retention.csv 改用 testid 或函式名定位（§1.2、§5.2、§6.3、§7.8）。
- E5：匯入欄位數改為銷售 10、通路費用 7、廣告 4；換算欄位 9 個、預設勾 8 個（§1.2、§7.7.2、§8.2）。
- E6：testid 基準納入運算式與 `testId` 屬性來源，樣板展開成實際值，改比對實際渲染（決策摘要、§2.3 B、§11.7、§14.3）。
- E7：#23、#42、#45 的 testid 欄改為「無（v2 沒有）」，V3-0 先補新 testid（§6.3、§11.7、§12.2）。
- E8：`rotate(` 檢查改為只禁裝飾性旋轉，保留 spinner 與 disclosure 指示（§5.2 X4、§5.4、§7.10、§12.2）。
- E9：labels 箭頭字元改為 23；全大寫 eyebrow 與 JSX 箭頭改由 design-lint 掃描（§1.2、§2.3 B、§5.2 X5、§14.2）。
- E10：E2E 規模改為 21 個 spec 加 2 支 helper，並分列含與不含 helper 的行數（§6.4 M5、§14.2）。
- E11：圓角描述、相異 class 數（約 336）、X12 證據更正；#36 補註第二個 `product-table`（§1.2、§5.2、§6.3、§13.1）。
- BM-F1：Xero 移到「沒有讀取，所以不引用」；QuickBooks 列刪掉沒有出處的說法；B7 改以 Few 與自身口徑為依據（§4.1、§4.2、§14.2）。
- BM-F2：§8.5 新增規則 9，寫明 L1 萬／億是刻意偏離 Shopify 與 Microsoft（§4.1、§8.5）。
- BM-F3：CM 對照改為扣廣告前 ≈ Daasity CM1、扣廣告後 ≈ CM2 並寫差異，刪除 CM3（§8.3）。
- BM-F4：台灣財報慣例分開標明 MOPS、DBS、QuickBooks 的出處（§4.1、§4.2 B9、§7.2、§9.4）。
- BM-F5：Stripe 空狀態規則改為每句少於 14 個英文單字；≤ 14 字標為 EC ProfitLens 自訂規則（§4.1、§7.10）。
- BM-F6：「類別色最多 4 色」改標為 EC ProfitLens 的決定，不歸給 Carbon（§4.1、§9.1）。
- BM-F7：GA4 改為顏色標示與空白卡，延伸部分標為 EC ProfitLens；Stripe 補註僅限 Connect；Shopify 改寫為儀表板層級選擇期間（§4.1）。
- BM-F8：StoreHero 改為紅綠兩態燈號，只在偏離時上色與三態標為 EC ProfitLens 的取捨（§4.1、§10.1 F11）。
- BM-F9：§4.3 的 Triple Whale 反例加註搜尋摘要，並改用 EC ProfitLens 自己的理由；Lifetimely 改為「提供每日 P&L」（§4.1、§4.3）。
- BM-F10：DBS 連結改用百分比編碼並以 `<…>` 包起來；Carbon、Polaris 改成轉址後的正式網址（§4.1、§5.1、§14.2）。
- CQ-F1：拍板規則統一為「沒拍板就擋住該批」；D-V3-2、D-V3-14 的用語驗證移到 H3 並寫明回退方式（決策摘要、§12.1、§13.2）。
- CQ-F2：a11y 每批門檻改為「不低於 V3-0 同頁基準且 ≥ 95」，V3-0 補量載入資料後的頁面（§2.3 C、§11.1、§11.2、§12.1、§12.2）。
- CQ-F3：number-link 底線改用 `--border-input`（≥ 3:1）並統一為常駐虛線；`--chart-other` 改用 `--gray-500`（§2.3 C、§7 共通規則、§9.1、§9.4 C12、§11.1）。
- CQ-F4：改名提示只對偵測到 v2 資料的使用者顯示；首屏量測狀態寫明；§7.1 高度表加 1a 列（§2.3 B、§7.1、§8.9）。
- CQ-F5：控制項計數口徑寫明；使用率指標改為事件比率，D-V3-15 補 `export_csv`、`export_json`（§2.3 B、§2.3 C、§7 共通規則、§13.2）。
- CQ-F6：人工時間改為 2.5–3.5 週，工作階段改為「至少 11 個」，§12.3 補 V3-10 盲評 1 天（決策摘要、§12.3）。
- CQ-F7：F18 列為 V3-9 的例外；F11 只在 D-V3-16 選 B／C 時做；F16 批次欄統一（決策摘要、§10.1、§12.2、§13.1、§13.2）。
- CQ-F8：密度規則改為「同一種表格元件同頁一種列高」，商品前 10 名跟隨 C3（§7.3、§9.3）。
- CQ-F9：否定句上限統一為 3，與 copy-density 一致（同 B-F11，§5.4、§8.4）。
- CQ-F10：「匯出本頁」統一為頁內下拉，驗收不數按鈕；「結束並列印」改回「結束列印」（同 FP-F2、FP-F9，§6.5、§7.6）。
- CQ-F11：C9 分成摘要型與清單型，§7.1、§7.2、§7.6 各自標明（§9.4 C9）。
- CQ-F12：錯誤文案只留 §7.7.3，§8.8 #26、#27 改為指向它；MISSING_PLATFORM_FEES 的 L2 拆成兩句；`{欄位}` 改 `{column}`；§14.3 的 L2＋L3 與 N24 等編號更正；問題編號改 Q、風險編號改 RK（§1.2、§2.1、§7.7.3、§8.8、§13.1、§14.3）。
