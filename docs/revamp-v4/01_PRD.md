# EC ProfitLens Revamp v4 PRD：以專業圖表為主要呈現（不新增口徑、不刪功能、不加依賴）

- **一句話目標**：使用者 2026-10-08 的指令是「改版：將全站加入更多專業視覺化元素，以專業圖表的方式呈現為主要」。v4 把 v3「首屏有結論、數字可追溯」的工具，改成「每一頁的主要閱讀任務都先用一張專業圖回答，表格退為核對與替代」。**不新增財務口徑、不刪任何功能、不加任何依賴。**
- **圖先，表不刪**：v3 的 B3「表格是主角，圖表是表格的摘要」改寫為「圖先，表為核對與替代」（D-V4-4）。既有常駐表維持常駐（放在圖旁的 `aside` 或圖下的 `after`），新圖的資料表放在 `<details>`，逐格核對用的表（問題表、管理損益表、商品完整表、對帳表、原始明細）不收合，只加內嵌條。
- **圖的數量有上限**：全站 23 張（既有 5 張升級、新增 18 張；G18 經審查取消，代號不重用），但每頁主層常駐的獨立圖最多 3 張（總覽維持既有 4 張），其餘用表格內嵌條、sparkline 或收進 `<details>`（X37）。用「改圖或維持表」的判準（§1.4）與各頁決策表（§2.3）防止 tile 牆。
- **一套記號**：沿用 IBCS 場景記號並本地化：本期實心、上期灰、去年同期灰虛線、目標空心刻度、資料待補虛線框；只有不利上色（D-V3-7 不變）；同頁同指標同尺度；長條、瀑布、變異、堆疊一律從 0 起（§7）。
- **口徑不動，用機制保證**：18 張新圖中 9 張需要在 `src/application` 產生新數值或新分組：`Decimal` 加總、`ratioMetric` 佔比、累計、計數、分階或分段（B 級；只排序或挑選既有值屬 A），每個 B 級函式都有獨立版本常數與手算 golden，版本由「計算與來源」抽屜帶出：新算出的值用 `metricVersion`，直接取自 domain 的值維持 `contribution-v1`，整理函式的版本放 `arrangeVersion`（§4.3、§6.4、§8.7）。`src/domain`、fixtures、`contribution-v1`、`docs/METRICS.md` 一律不動。
- **每個點、柱、格都能追溯**：圖上點擊與資料表 number-link 用同一個 `EvidenceSelection`；下鑽篩選擴充日期與 SKU（§8.7）。
- **16 批、一次一批**：V4-0a 建基準與護欄、V4-0b 做設計稿、PPT spike 與合成資料，兩批都不改 UI；V4-1、V4-2 完成經營總覽（MVP 切線）；V4-3a 到 V4-7b 依序做其他頁；V4-8 投影、V4-9a／9b 匯出、V4-10 P2 圖、V4-11 收尾上線（§9）。本套件寫「V4-0」時指 V4-0a、V4-0b 兩批合稱；「V4-0 實測」「V4-0 基準」都是 V4-0a 量到的 v3.0.0 值。
- **需要你拍板 35 件事**（§10.2，詳見 `09_DECISIONS_PENDING.md`），其中 16 件擋住 V4-0a、V4-0b 或 V4-1：擋 V4-0a 的是 D-V4-1、2、3、15、23、24、25、26、27；擋 V4-0b 的另有 D-V4-31；擋 V4-1 的另有 D-V4-4、5、7、14、30，以及只擋 G6 的 D-V4-33。

| 項目 | 內容 |
|---|---|
| 文件 | Revamp v4 PRD（規格本體，草案，待拍板事項見 §10.2 與 `09_DECISIONS_PENDING.md`） |
| 日期 | 2026-10-08 |
| 基準版本 | v3.0.0（tag `v3.0.0`＝`625bfa5`；分支 `revamp/v2`＝`main`＝`21d621c`；正式站 https://profitlens-tau.vercel.app 已是 v3.0.0） |
| 目標版本 | 建議 v4.0.0（D-V4-1） |
| 依據 | 四份盤點（現有視覺元素、可用資料與可行性矩陣、護欄與測試、標竿與圖表慣例）；`docs/revamp-v3/01_PRD.md`；`docs/METRICS.md`、`docs/DATA_CONTRACT.md`、`docs/SCENARIOS.md`；三份草案（P1 財務報表專業、P2 讀者效率、P3 工程與護欄）與兩位評審的結論。主幹取 P2 的結構與取捨，移植 P1 的逐圖編碼、版本常數、golden 對帳與執行者層圖表，移植 P3 的工程基礎設施，並修正評審列出的全部必修項（附錄 B） |
| 本套件其他檔案 | `docs/revamp-v4/09_DECISIONS_PENDING.md`（由 §10.2 展開）；`00_README.md`（套件說明與 CLAUDE.md 更新草案）、`06_BATCHES.md`（由 §9 展開）、`CHART_CATALOG.md`（每張圖的實作卡）已隨本 PRD 產出，V4-0a 定稿；`GLOSSARY.md` 增補與 `usability-test.md` 由 V4-0a 產出 |
| 硬前提 | AGENTS.md 與 CLAUDE.md 全部規則沿用；財務核心禁區不動；不刪功能（只能搬移、合併、收合、改名）；既有 `data-testid` 刪除數 0；使用者看得到的中文只放 `src/i18n/labels.zh-TW.ts`，既有字串不改；design-lint 與 copy-style 棘輪只降不升；不加依賴（圖只用 Recharts 3.10.1 與 inline SVG，PPT 用 pptxgenjs 4.0.1 的原生 `addChart` 或 `addShape`）；不加登入、資料庫、伺服器端保存；任何部署（含 preview）都要使用者當次明確同意 |
| v3 規則 | `docs/revamp-v3/01_PRD.md` 的 §5.2 X1–X25、§4.3 刻意不採用、§8 語言規範、§9 token 與元件、§11 非功能全部有效；本文只寫圖表化的增量。衝突時以 AGENTS.md、CLAUDE.md 為準 |

---

## 0 決策摘要（一頁，給老闆與拍板者）

**為什麼要改**：v3.0.0 全站只有 4 張圖加 1 種目標細條，而且全部在經營總覽。通路健檢、商品毛利、假設試算、待辦、會議紀錄、資料來源、計算與來源抽屜都是表格與清單；PDF、PPT、Excel、Markdown 沒有任何圖。主管要知道「哪個通路、哪一天、哪項費用」只能逐列讀數字；手機上的瀑布要橫向捲動。

**v4 會帶來的三個改變**

| # | 讀者 | 你會看到什麼 | 哪一批上 |
|---|---|---|---|
| 1 | 老闆 10 秒 | 總覽的貢獻變化拆解（瀑布圖並列橋接表）改用統一的圖表框，標題直接寫結論（示範資料：「少賺 59.9 萬，扣最多的一項是商品成本（−157.5 萬）」）；手機上橋接表每一項旁邊加一條變異條（依 D-V4-33），不必橫向捲動瀑布也能比大小與方向（示範資料最長的條是有利的原價收入 +316.2 萬，不利色條中最長的是商品成本）；投影模式加入瀑布；PDF 與 PPT 第一次有瀑布圖 | V4-1、V4-8、V4-9a |
| 2 | 主管 3 分鐘 | 健檢清單中兩期差額類的規則有影響金額長條；各通路「每 100 元淨營收被什麼吃掉」的堆疊條（虧損通路照常畫）；日 × 通路月曆熱表找出哪一天虧；商品頁有兩期差額圖，有商品毛利為負的商品時另加累計圖；試算頁有方案差額圖與銷量門檻圖 | V4-3a 到 V4-5 |
| 3 | 執行者 10 分鐘 | 資料來源頁有三份檔案的涵蓋時間軸，缺列區段一點就篩到問題表；問題依「檔案 × 原因」排成分布表；對帳表與抽屜階梯表加內嵌條 | V4-7a、V4-7b |

**範圍**：23 張圖（既有 5 張升級、新增 18 張；P0 4 張、P1 16 張、P2 3 張；G18 經審查取消）；12 個新元件（C24–C35，其中 C35 只在 D-V4-16 選 B 時做）；8 個語意 token 與 1 階原始紅色；15 條新禁止項（X26–X40）與一支 chart-lint 測試；16 批。

**不做什麼**：不動 `src/domain`、fixtures、`contribution-v1`、`assist-kpi-v1`、`breakeven-mer-v1`、`docs/METRICS.md`；不加依賴；不做 gauge、健康分數、滿版紅綠燈、3D、漸層、樹狀圖、桑基、漏斗、圓餅、區域圖、雙數值軸、動畫；不做龍捲風與敏感度網格（系統代填假設，牴觸 `docs/SCENARIOS.md:12、68`）；不做預測（等速目標線）與 SKU 層分攤；本輪不改 CSV／JSON（D-V4-13）。

**成本與節奏**：16 批，一批一個工作階段，所以**至少** 16 個工作階段。V4-0a 到 V4-2 是 MVP 切線（總覽完成），之後經使用者當次同意可部署 preview（D-V4-28）。人工關卡兩個：H5 v4 設計稿審查（擋 V4-1）、H6 v4 複測與盲評（擋 v4.0.0 正式上線）。

**不會變的事**：所有數字與算法（golden：本期 255.00、差額 −315.00、試算 284.00／264.00／19.70）；備份 schema `profitlens-workspace-v5`；CSV／JSON 欄位與數值；隱私邊界（不上傳、不登入、公開站不用 AI）；所有功能、匯出入口與既有 testid。

**三大風險與處理**

| 風險 | 處理 |
|---|---|
| 圖一多就回到 tile 牆、看起來像 AI 生成 | 每頁主層常駐獨立圖 ≤ 3 張（X37，chart-lint 自動檢查）；能用內嵌條就不開新區塊；每張圖只回答 §4.2 的一個問題；H5 設計稿審查 |
| 負值與缺值讓堆疊、Pareto、累計圖失真 | 每張圖寫退回規則（§7.4），每個 B 級函式用 golden、`refund_only`、`zero_ad` 測試；虧損通路用「超過 100 的部分塗不利色」照常畫，不退回 |
| bundle 與手機效能 | First Load JS gzip 硬門檻 545,397 bytes（v3.0.0 +5%）；新圖優先用 inline SVG 與首載已有的 Recharts 模組；散佈圖只能用 `next/dynamic` |

**拍板（2026-10-08 使用者回覆「都依建議值，開工」，35 件全部依建議值）**：原擋批的 16 件為擋 V4-0a 的是 D-V4-1 版本號（建議 v4.0.0）、D-V4-2 分支 `revamp/v4`、D-V4-3 禁區 diff 基準改 `625bfa5` 並保留 `82b70df`、D-V4-15 每個 B 級函式各一個版本常數、D-V4-23 新禁止項與 chart-lint、D-V4-24 First Load JS 門檻、D-V4-25 testid 命名、D-V4-26 labels 錨點與既有字串快照、D-V4-27 人工關卡；擋 V4-0b 的另有 D-V4-31 合成資料；擋 V4-1 的另有 D-V4-4 改寫 B3、D-V4-5 表格去向、D-V4-7 手機顯示圖、D-V4-14 分析事件、D-V4-30 圖例位置，以及只擋 G6 的 D-V4-33（X18 改寫）。**沒有明確回覆就不視為核准**，拍板前沿用 v3 的行為與用詞。

---

## 1 背景與問題

### 1.1 現況（v3.0.0）

| 頁面 | 既有視覺元素 | 主要閱讀任務 | 現在怎麼讀 | 慢在哪 |
|---|---|---|---|---|
| 經營總覽 | G1 拆解瀑布、G2 利潤結構瀑布（inline SVG）；G3 每週趨勢折線、G4 各通路雙長條（Recharts）；G5 KPI 目標細條（CSS） | 多賺少賺、錢漏在哪、每 100 元剩多少 | 瀑布加 12 列橋接表 | 橋接表 9 個差額要逐列比；手機瀑布要橫向捲動（最小寬 520／600）；其他常用指標看不出走勢 |
| 通路健檢 | 計數徽章、狀態標籤、範圍標記、可排序寬表 | 差額來自哪個通路、哪項費用、哪一天 | 逐列展開健檢列、比寬表數字 | 影響金額要讀完整份清單才知道誰最大；日粒度完全沒有呈現 |
| 商品毛利 | 兩張前 10 名表（`product-worst`、`product-best`）、完整表 | 哪些商品的商品毛利為負、負多少、佔多少 | 讀 10 列數字 | 看不出累計佔比與兩期差額大小 |
| 假設試算 | 基準 dl、方案欄、比較表、門檻段落 | 方案差多少、要賣到多少 | 讀比較表與門檻句 | 方案差額要跨欄比；門檻只有文字 |
| 待辦 | 看板計數徽章、逾期標記 | 哪些快到期 | 掃卡片 | 到期分布沒有總覽 |
| 會議紀錄 | 關鍵數字、精簡通路表、與上次比較表、歷史列 | 這次比上次差多少、幾次會議的走勢 | 讀表 | 歷史只有逐列數字 |
| 資料來源與匯入 | 狀態列、問題表、前處理表、對帳表、stepper | 涵蓋到哪天、哪天缺列、對帳有沒有差 | 讀問題清單 | 缺列日散在清單裡，看不出區段 |
| 計算與來源抽屜 | 大數字、階梯表、組成表、原始明細 | 四層怎麼扣 | 讀階梯表 | 看不出比例 |
| 投影、PDF、PPT、Excel、Markdown | 投影只顯示 G2；匯出零圖 | 投影 10 秒、會後一頁 | 讀數字 | 匯出物沒有圖 |

### 1.2 問題拆解（證據）

| # | 問題 | 證據 |
|---|---|---|
| 1 | 圖只在總覽 | `from "recharts"` 只出現在 `src/components/overview/charts/trend-section.tsx:4`（LineChart）與 `channel-section.tsx:4`（BarChart）；inline SVG 圖只有 `waterfall-svg.tsx` |
| 2 | 日 × 通路資料存在但沒畫 | `report.previous/current.daily`（`src/domain/aggregation.ts:74-88`），示範資料 84 天 × 2 通路，每格附 `sources` |
| 3 | 兩張瀑布沒走 ChartFrame | `bridge-section.tsx:80-84`、`profit-section.tsx` 各自手寫標題列，沒有四態與 takeaway 介面 |
| 4 | 已宣告的圖表基礎沒人用 | `chartCategoryColors`、`readChartColors`（`src/application/chart-theme.ts:23、40-53`）；C19 sparkline（F17）有規格沒實作 |
| 5 | 匯出零圖 | `pptx-export.ts` 只用 `addText`／`addShape`／`addTable`；`print-summary.tsx` 沒有 svg；xlsx 社群版不畫圖 |
| 6 | 軸刻度兩套格式 | Recharts 用 `formatAmountL1` 出「50.0 萬」，瀑布用 `waterfallTickLabels`（`waterfall-svg.tsx:89`）出「50 萬」 |
| 7 | 下鑽只到週與通路 | `EvidenceFilter` 只有 `week`、`channel`（`src/application/evidence-filter.ts:10-13`） |

### 1.3 根源

v3 的目標是「去 AI 製作感、三層閱讀」，圖只做到 B3「表格的摘要」的最低限度（`docs/revamp-v3/01_PRD.md:277`），沒有為每個閱讀任務選圖型。基礎設施（ChartFrame、圖表 token、evidence builder、E2E 樣板）已經齊了，缺的是「問題到圖型」的對應與全站一致的規範。

### 1.4 解法方向：改成圖或維持表的判準

| 判準 | 改成圖 | 維持表（可加內嵌條） |
|---|---|---|
| 讀法 | 比大小、看方向、看形狀、找離群 | 逐格核對、找某一列、複製數字 |
| 項數 | ≤ 12 項，或只列前 N 項（其餘寫「另 n 項」，不加總，X38） | 任意 |
| 例 | 九項差額、方案差額、商品前 10、每 100 元去向、日 × 通路、涵蓋時間軸 | 資料問題表、管理損益表、商品完整表、對帳表、原始明細 |
| 形式 | ChartFrame：結論標題、副標、圖、`<details>` 資料表（C33 產生） | C24 表格內嵌條：表格 DOM、testid、number-link 不變，格內加 `aria-hidden` 的條 |
| 有比較基準時 | 目標、門檻、上期用刻度或空心記號表示（bullet） | — |

### 1.5 不變的東西

財務口徑與禁區；功能清單；既有 testid 與 E2E 定位器（含 `path.chart-bar-link`、`.bridge-total`）；labels 既有字串；三層閱讀；D-V3-7 只有不利上色；隱私與公開站邊界；可追溯性；design-lint 與 copy-style 棘輪；四尺寸 E2E；備份 schema v5；CSV／JSON。

---

## 2 目標與成功指標

### 2.1 目標

1. **老闆 10 秒**：總覽、投影、PDF、PPT 第一眼就是「少賺多少、扣最多的是哪一項」的瀑布圖（手機另有橋接表變異條）。
2. **主管 3 分鐘**：健檢、商品、試算每頁都有一張回答「哪個通路、哪項費用、哪一天、哪個商品、哪個方案」的圖，標題就是結論句。
3. **執行者 10 分鐘**：資料來源與匯入精靈用時間軸、分布表、內嵌條指出「哪天哪通路缺列、哪欄對不上」，點一下就到問題列。
4. **工程**：每張圖都是純呈現或有版本的 application 整理；每個點、柱、格都能開「計算與來源」；a11y、效能、棘輪、testid、可追溯性全部不退步。

### 2.2 成功指標（可量測）

**A. 使用者層（人工關卡 H6；H4 未執行時同一場次同時量 v3 正式站與 v4）**

| 代號 | 指標 | 門檻 | 量法 |
|---|---|---|---|
| A1 | 老闆任務 T1「本期少賺多少、貢獻變化拆解中扣最多的是哪一項」首個正確答案時間。答案鍵（示範資料）：少賺 59.9 萬；扣最多的一項是商品成本（−157.5 萬），以貢獻變化拆解標題（G1）的「扣最多」為準（`src/application/waterfall.ts:151-165` 只在與總差額同方向的項目中取最大）。本期一句話的「最大一項」（折扣多花 118.8 萬）與 G6 最長條（原價收入 +316.2 萬）回答的是不同問題，不算本題答案；三處用語是否統一另依 D-V4-35 | ≤ 10 秒，5 人中 4 人 | `docs/revamp-v4/usability-test.md`（V4-0a 產出：沿用 v3 腳本，加 v4 任務與答案鍵） |
| A2 | 主管任務 T2「哪個通路扣完廣告虧、哪一天最差」、T3「哪個商品（含通路）毛利減少最多、少多少」（示範資料沒有商品毛利為負的商品，不能問商品毛利為負的商品；答案是 SKU-020 · 平台 · MARKETPLACE，少 30,198.96 元） | 各 ≤ 3 分鐘，5 人中 4 人 | 同上 |
| A3 | 執行者任務 T4「匯入 `fixtures/errors/missing_ad_day` 後，指出缺廣告列的日期與通路，並開到問題表那一列」（golden 的費用與廣告檔都是完整的 2 天 × 2 通路，示範資料也沒有缺列；missing_ad_day 缺 2026-08-02 MARKETPLACE 的廣告列，`expected_validation.json` 為 partial／MISSING_AD_DAY） | ≤ 2 分鐘 | 同上；主持人事先備好該資料夾的三個檔 |
| A4 | 外部盲評 | 「像專業財務報表」五分制比 v3 高 1 分以上；「像 AI 生成」不高於 v3 | 3 位外部盲評者 |

**B. 工程層（每批由 `metrics.spec`、E2E、靜態掃描量）**

| 代號 | 指標 | v3.0.0 基準 | v4 門檻 | 量法 |
|---|---|---|---|---|
| B1 | 首屏有圖 | 只有總覽有圖 | 1440×1000：總覽第一張 `.chart-frame` 頂 ≤ 900 且不晚於 V4-0a 實測；健檢第一個 G9 內嵌條（在清單列內，不在表格內）頂 ≤ 900；商品第一張 `.chart-frame` 頂 ≤ 900；資料來源 G20 頂 ≤ 900；試算 G15 頂不晚於 V4-0a 量到的方案比較表區塊頂（G15 插入處）＋24px（試算頁沒有方案欄收合狀態，方案欄底約 1,080px，G15 不可能在 900 以內）；V4-0a 另記錄健檢 G10 插入處的頂端（依 V3-10 截圖約 2,225px）作為參考值，不設門檻 | `metrics.spec` v4 設定檔 |
| B2 | 總覽首屏不退步 | 1440：一句話頂 192、KPI 帶底 419、三件事首列底 561；1280：v3 沒有量過（`verification/revamp-v3-capture/metrics.spec.ts` 只量 1440 與 390），依 V3-10 截圖估計一句話頂約 192、KPI 帶底約 418、三件事首列底約 583，以 V4-0a 實測為準；390：扣廣告後貢獻值頂 295 | 1440：一句話頂 ≤ 192、KPI 帶底 ≤ 420、三件事首列底 ≤ 561；1280：KPI 帶底 ≤ 420，一句話頂與三件事首列底不晚於 V4-0a 實測；390：扣廣告後貢獻值頂 ≤ 295 | `metrics.spec` 硬斷言 |
| B3 | 390 無頁面橫向捲動 | 通過 | 七頁 `document.scrollingElement.scrollWidth ≤ 390`；只允許 `.chart-frame.waterfall` 與 `.table-scroll` 內部捲動 | E2E mobile project |
| B4 | 版面跳動 | 總覽四個 `.chart-frame` 等高 | 所有頁可見的 `.chart-frame` 切換期間前後高度差 0（G14、G21 依資料決定是否渲染，只在前後都渲染時比較；G8、G12 在收合的 `<details>` 內，只在展開狀態下比較；C26 在 ≤ 767px 的框高＝`chartHeights.sm` × 子圖數，子圖數不隨期間改變）；CLS < 0.05 | `revamp-r1-layout.spec` 改為自動收集 `main .chart-frame:visible`（Playwright 的 `:visible` 排除 `hidden` 祖先與未展開 `<details>` 內的框；不限 `.view-content`，因為試算頁的 `MultiScenarioWorkbench` 掛在 `.view-content` 之外，`src/components/dashboard.tsx:576-577`） |
| B5 | First Load JS（gzip） | 519,426 bytes | ≤ 545,397 bytes（+5%，D-V4-24）；Treemap、Sankey、Funnel、PieChart、RadarChart 符號在首載 chunk 為 0；其餘只以 gzip 總量判定（每批驗收列出首載 chunk 清單與各自 gzip 大小供人工比對；檔名帶雜湊，不逐一斷言）；散佈圖 chunk 不在首頁 HTML 腳本清單 | `metrics.spec` 硬斷言 |
| B6 | 鍵盤 | KPI 前可聚焦 10 | KPI 前 ≤ 10；七頁 Tab 停留點 0 個落在 `[aria-hidden=true]` 內（V4-0a 起，v3.0.0 應為 0）；健檢頁經過 G11 熱表的 Tab 數 ≤ 3（V4-3b 起）；每頁第一張圖的資料表 summary 是里程碑（商品頁 V4-4 起，其餘頁由各頁批次或 V4-8 補齊） | `keyboard-walk.spec` |
| B7 | 每頁主層常駐獨立圖 | — | ≤ 3 張（總覽 4 張例外；小倍數算 1 張；`<details>` 內不計） | chart-lint CL-9 |
| B8 | 否定句密度 | 五頁主層各 ≤ 3（`tests/copy-density.test.ts:67-94`，只有總覽、健檢、試算、會議紀錄、資料來源） | V4-0a 把五頁的上限改成實測值，並加商品、待辦兩頁（七頁），之後只降不升；新圖在主層新增的含「不是／不代表／不等於／不可」句子為 0（限制句放 `<details>` 或抽屜） | `copy-density`（V4-0a 收緊） |
| B9 | DOM 節點數 | V4-0a 記錄七頁在 1440 與 390 載入示範資料後的 `document.querySelectorAll('*').length` | 各頁 ≤ V4-0a 基準＋1,500（V4-1 起） | `metrics.spec` 硬斷言 |

**C. 品質層**

| 代號 | 指標 | v4 門檻 | 量法 |
|---|---|---|---|
| C1 | Lighthouse Accessibility | 不低於 v3 同頁且 ≥ 95（v3 六頁 1440 與 390 全 100，所以實際要維持 100）；V4-0a 在腳本加資料來源與待辦兩頁（v3 腳本沒有，`scripts/lighthouse-pages.mjs:46-50`）並記錄基準，這兩頁以 V4-0a 基準為「v3 同頁」 | `scripts/lighthouse-pages.mjs` |
| C2 | Lighthouse Performance | Performance 分數＝空狀態首頁（navigation）那一步的分數，只反映首載 bundle（`scripts/lighthouse-pages.mjs:79-80`：0–100 分數只有 navigation 有意義；有圖的頁是 timespan 或 snapshot，沒有分數）：1440 ≥ 97、390 ≥ 90（v3.0.0 為 100／92）。圖頁的效能以 TBT 把關：390 切到通路健檢、商品毛利、會議紀錄、資料來源四個 timespan 的 TBT 各 ≤ V4-0a 中位數 × 1.1（與中位數＋50 ms 取較大者，D-V4-36）（V3-10 的 390「切到通路健檢」1,330 ms、「切到會議紀錄」1,718 ms 只有記錄、沒有門檻；V4-0a 對這四步也連跑 3 次取中位數）；390 載入示範資料 TBT ≤ V4-0a 中位數 × 1.1（與中位數＋50 ms 取較大者，D-V4-36）（v3.0.0 實測 1,667 ms，本機負載 loadavg 4.73，`verification/revamp-v3/V3-10/metrics.json`；V3-9b 為 972 ms；V4-0a 在低負載下連跑 3 次取中位數並記錄 loadavg；超過門檻且當時負載高時重跑，低負載重跑仍超過才算未通過；五個 TBT 門檻同一規則） | 同上 |
| C3 | axe 四尺寸 | serious／critical 0。狀態數（desktop、laptop、tablet／mobile；mobile 沒有投影模式）：v3.0.0 為 11／10；新互動元件在示範資料下多半不渲染（示範資料沒有商品毛利為負、沒有問題列、沒有待辦，G16 要計算後才出現），所以各批加掃描狀態：V4-3b 加「資料表展開」「從圖下鑽的抽屜」「4 通路合成資料的健檢頁」（G10 不適用列、4 通路 G11），共 14／13；V4-4 加「合成資料的商品頁」（G14），15／14；V4-5 加「試算計算後展開 `scenario-sensitivity`」（G16），16／15；V4-7a 加「匯入 `fixtures/errors/missing_ad_day` 後的資料來源頁，含 G20 缺列段、G21 與篩選後的問題表」，17／16；V4-10 加「待辦頁新增一張卡」（G17），18／17 | `axe-sweep.spec` |
| C4 | 對比 | 文字 ≥ 4.5:1；圖形非文字 ≥ 3:1；每個新 token 進 `scripts/contrast-check.mjs` PAIRS | `npm run contrast-check` |
| C5 | 棘輪 | design-lint 15 項不升（hex 0、圓角 4、字級 11、字距 0、箭頭 3、其餘 0）；copy-style 同義詞 ≤ 12、其餘 0；chart-lint 全 0 | `npm test` |
| C6 | testid | v2 基準 228 列與 V4-0a 產生的 v3 基準刪除數都是 0（v3 基準分三步產生：`TESTID_BASELINE_DUMP` 的 ssr 列、瀏覽器收集的 e2e 列、沿用 v2 並補 V3 新增條件項的 cond 列；實數以產出為準）；V4-1 起每批把本批新增的 testid 追加到 `verification/revamp-v4/testids-v4-added.txt`（同格式，加批次欄；V4-0a 建立空檔），`testid-baseline.test` 一起比對，刪除數 0；每張新圖至少有區塊、柱點格、資料表三種 testid；Recharts 圖（G8、G12、G19、G24）在 SSR 不輸出圖形，只要求區塊與資料表 testid | `testid-baseline.test` |
| C7 | 可追溯性 | 每張圖每個柱、點、格、段點擊開抽屜，和資料表 number-link 回傳同一個 `EvidenceSelection`；新算出的衍生值帶 `formula`、`components` 與該函式的版本常數（`metricVersion`），直接取自 domain 的值不改 `metricVersion`、整理函式版本放 `arrangeVersion`；累計、費用合計這類水準值帶 `valueKind: "level"`，抽屜大數字不帶正負號（§8.7）；資料表列數等於資料長度；例外（G15、G16、G19、G22，資料在 v3 本來就不開抽屜）見 §8.7；Recharts 圖（G8、G12、G24）的圖上點擊由 E2E 以 `.recharts-*` 定位驗證，SSR 只驗資料表 number-link | 每張圖一支 SSR 結構測試 |
| C8 | 匯出數值 | Markdown／Excel 正規化後與 V3-7 基準相同（新增的圖表附屬內容列入排除清單）；CSV／JSON 逐字相同；golden 255.00、−315.00、284.00、264.00、19.70 不變 | `export-*` 測試 |
| C9 | 禁區檢查 | §8.4 的四條命令都為空（D-V4-3）：對 `625bfa5` 與 `82b70df` 的兩個 diff、`assist-kpi-v1` 與 `breakeven-mer-v1` 所在檔案與既有測試的 diff、`git status --porcelain`（未追蹤與未提交的禁區檔案） | 每批驗收；commit 後再跑一次並寫下 commit hash |
| C10 | 隱私 | `network-log.spec` 的下載集合仍恰好是 `analysis_csv`、`backup`、`decision_json`、`excel`、`pptx`；無 POST；`/api/insights` 封鎖不變 | `network-log.spec` |

### 2.3 各頁「改成圖／維持表加內嵌條／刻意不加圖」決策表（每批驗收逐頁對照）

| 頁面 | 改成圖（獨立 ChartFrame） | 維持表，加內嵌條或 sparkline | 刻意不加圖（理由） |
|---|---|---|---|
| 經營總覽 | G1、G2（搬進 ChartFrame）、G3、G4（既有）；G8 在進階 `<details>`（P2） | 橋接表加 G6 變異條（≤ 767px，依 D-V4-33）；G4 緊湊表加差額條；其他常用指標表加 G7a sparkline；損益兩平 MER 列加 G5 bullet | 本期一句話、KPI 帶（底 419／上限 420，沒有空間）、三件事（文字結論）；其他常用指標的 7 個比率不畫長條（各自獨立，長條長度互相比較沒有意義）。損益兩平 MER 列是唯一例外，因為有明確比較基準 |
| 通路健檢 | G10、G11；G12 在 `<details>`「五項比率走勢」 | 健檢清單的差額類規則加 G9 影響金額條；通路寬表加 G7b「近 {n} 週」 | 健檢列展開內容（文字說明）；水準類規則（負貢獻通路、商品毛利為負）不畫條（本期金額與兩期差額不能用同一把尺比長短）；AI 區 |
| 商品毛利 | G13；有商品毛利為負的商品時加 G14（示範資料沒有，不渲染）；G24 在進階 `<details>`（P2） | 既有兩張前 10 名表作為 `after` 常駐（沒有負值時 `product-worst` 照 v3 原樣） | 密度切換、更多欄位、完整表本體 |
| 假設試算 | G15、G16 | 比較表與三個假設表維持常駐 | 方案輸入表單；龍捲風與敏感度網格（X29） |
| 待辦 | — | 頁首 G17 期限分布計數條（P2） | 看板、清單、編輯抽屜 |
| 會議紀錄 | G19；議程 5 的 G15 第二實例 | — | 決議、議程文字、會議紀錄的凍結內容；與上次比較表（G18 取消：只有淨營收與扣廣告後貢獻兩列，兩個不同指標用同一把尺比條長沒有意義，只有兩列也沒有讀取效率；理由同其他常用指標的 7 個比率不畫長條） |
| 資料來源與匯入精靈 | G20、G21 | 前處理表與精靈步驟 4 對帳表加 G22 | 問題表本體、預覽表、範本 |
| 計算與來源抽屜 | — | 階梯表加 G23 | 組成表、原始明細 |

---

## 3 非目標

- 不新增財務口徑：新圖只重新呈現既有數字；需要產生新數值（加總、佔比、累計、計數、分階、分段）時，只在 `src/application` 用 `Decimal`／`sumAmounts`／`ratioMetric`，每個函式有獨立版本常數與手算 golden（比照 `src/application/breakeven-mer.ts:10` 的 `breakeven-mer-v1`）。
- 不做預測（等速目標線、run-rate 推估）、不做 SKU 層的費用或廣告分攤、不做龍捲風與敏感度網格、不在試算範圍 [−90%, +100%] 以外畫任何點或線（`docs/SCENARIOS.md:12、64、68`）。
- 不刪任何功能、表格、testid、匯出格式或下載入口；不改既有 labels 字串；不改備份 schema；本輪不改 CSV／JSON（D-V4-13）。
- 不加依賴、不載入外部字型或 CDN；PPT 不用任何圖片 API。
- 不做 gauge、健康分數、燈號、3D、漸層、陰影、圓餅、甜甜圈、雷達、樹狀圖、旭日圖、桑基、漏斗、區域圖、雙數值軸、brush、zoom、動畫、彩色圓點圖例、裝飾圖示（v3 §4.3 與 X20 延續，新增 X26–X40）。
- 不做深色模式、角色切換、新頁面、AI 行為變更、新下載入口（PNG／SVG 下載）。
- F15 台灣化示範資料與 F16 實檔驗證維持待檔案，不在本輪。

---

## 4 圖表總目錄 G1–G24

### 4.0 代號、等級、優先

- **代號**：既有圖 G1–G5（升級），新圖 G6–G24（G18 經審查取消，代號保留不重用）。元件 C24–C35 接 v3 的 C1–C23；v3 已有規格的 C16 ChartFrame、C17 瀑布、C18 目標細條、C19 sparkline 沿用原代號。
- **新算式等級**：**A 純呈現**＝直接用 snapshot／report／workspace 既有的 `Metric` 字串、計數或日期，只做座標轉換（`coordinate`）與格式化；**B application 整理**＝產生新數值或新分組：`Decimal`／`sumAmounts` 加總、`ratioMetric` 佔比、累計、計數、分階、分段，放在 `src/application`，每個函式一個獨立版本常數（D-V4-15）並有手算 golden；**C 禁止**＝新公式、預測、分攤、系統代填假設，本輪 0 張。只排序或挑選既有值、呼叫既有 domain 或 application 函式取得既有的值（例如 `metricComparison`、`profitWaterfall`、`worstChange`）屬 A，不加版本常數；這與 D-V4-15 的十個版本常數一致。
- **優先**：P0 老闆層必做；P1 主管與執行者層；P2 視餘裕，集中在 V4-10。
- **層**：L1 結論、L2 解讀、L3 依據（v3 §3.2）。
- **結論句**：句型依 v3 §8.2（多賺／少賺、多花／少花、多／少、升到／降到、由負轉正／轉為虧損）；每個子句 ≤ 14 個中文字（數字、單位、正負號、通路名、SKU 不計）；V4-0a 把 `^[^.]+\.chartsV4\.[^.]+\.title(\.|$)` 加進 copy-scan 的 L1 樣式。例外：G12 在 `<details>` 內，標題用區塊名，不寫結論句（五項比率的分母不同，不做跨比率排名，§4.2）；試算結果的方向詞前一定加「試算後」（G15）。

### 4.1 總表

| 代號 | 頁面／區塊 | 圖型（元件、技術） | 層／優先 | 等級 | 取代或新增；原表格去向 | 批次 |
|---|---|---|---|---|---|---|
| G1 | 總覽／貢獻變化拆解 | 瀑布 11 根（C17 inline SVG），搬進 ChartFrame，橋接表放 `aside` | L1／P0 | A | 升級；橋接表維持常駐，v2 四欄 `<details>` 保留 | V4-1 |
| G2 | 總覽／本期利潤結構 | 瀑布 10 根（C17），搬進 ChartFrame | L1／P0 | A | 升級；10 列資料表 `<details>` 保留 | V4-1 |
| G3 | 總覽／每週趨勢 | 既有折線（Recharts LineChart：本期、上期、去年同期）；刻度改 `formatAxisWan`；本期、上期末點標值與三項圖例沿用 v3 | L2／P1 | A | 升級；7 欄資料表保留 | V4-2 |
| G4 | 總覽／各通路 | 既有雙長條（Recharts BarChart，上期 8px、本期 18px）＋緊湊表差額條（C24） | L2／P1 | A | 升級；緊湊表與五欄表維持；D-V4-16 選 B 時改啞鈴（C35） | V4-2 |
| G5 | 總覽 KPI 帶；其他常用指標表的損益兩平 MER 列 | Bullet（C18 抽成共用元件），目標刻度 `--chart-target` | L1／P1 | A | 升級；新增 MER 對損益兩平 | V4-2 |
| G6 | 總覽／橋接表 | 表格內嵌變異條（C24），只在 ≤ 767px 顯示（依 D-V4-33） | L1／P0 | A | 新增於既有表 | V4-1 |
| G7 | （a）總覽／其他常用指標表；（b）健檢／通路寬表 | Sparkline 16×64（C19），欄名「近 {n} 週」（n＝實際週數，上限 8） | L2／P1 | B | 新增於既有表（F17）；（a）另加「各指標每週」資料表 `<details>`；（b）另加「各通路每週」資料表 `<details>` | V4-2（a）、V4-3a（b） |
| G8 | 總覽／進階 `<details>` | 兩期每日累計線（Recharts LineChart） | L2／P2 | B | 新增；資料表 `<details>` | V4-10 |
| G9 | 健檢／健檢結果清單 | 清單內嵌影響金額條（C24，門檻刻度） | L2／P1 | A | 新增於既有清單 | V4-3a |
| G10 | 健檢／每 100 元淨營收去向 | 水平堆疊條，虧損通路超過 100（C27 inline SVG） | L2／P1 | B | 新增；資料表 `<details>` | V4-3a |
| G11 | 健檢／日 × 通路 | 月曆熱表：每通路一塊（列＝週，與每週趨勢同一組 7 天；欄＝該週第 1 到 7 天，欄頭標星期），通路並排（C28 表格模式） | L2＋L3／P1 | B | 新增；表本身就是資料表 | V4-3b |
| G12 | 健檢／`<details>`「五項比率走勢」 | 小倍數 5 張折線（C26；V4-3b 實作為 inline SVG，理由見 CHART_CATALOG G12 補記） | L2／P1 | A | 新增；資料表 `<details>` | V4-3b |
| G13 | 商品／毛利兩期差額 | 變異長條兩欄：減少最多、增加最多各 ≤ 5（C25 inline SVG；其餘列在 `after` 的前 10 名表） | L2／P1 | A | 新增；既有 `product-best` 改為 `after` 常駐；資料表 `<details>` | V4-4 |
| G14 | 商品／商品毛利為負的商品累計 | Pareto：排序長條＋累計佔比標值（C25 pareto 模式） | L2／P1 | B | 新增，只在有商品毛利為負時渲染：有負值時既有 `product-worst` 改為它的 `after` 常駐，沒有負值時 `product-worst` 照 v3 原樣放在第一格；資料表 `<details>` | V4-4 |
| G15 | 試算／方案比較表上方；會議／議程 5（第二實例） | 方案差額變異長條：試算 ≤ 3 根；會議實例每通路一根、上限 6 根（C25 variance 模式） | L1／P0 | A | 新增；方案比較表維持常駐 | V4-5、V4-6 |
| G16 | 試算／要賣到多少才划算 | 門檻點（C29 inline SVG；是否連線依 D-V4-20，建議 A′ 只畫點），x 軸固定 −90% 到 +100% | L2／P1 | 依 D-V4-20：A′ 為 A；A 為 A（模型值，來源 `scenario-sensitivity-v1`）；B 為 B | 新增；門檻說明與三個假設表維持常駐 | V4-5 |
| G17 | 待辦／頁首 | 期限分布計數條（C24 計數模式，4 列小表） | L2／P2 | B | 新增 | V4-10 |
| G18 | （取消） | — | — | — | 審查後取消：與上次比較表只有兩列且是不同指標，維持原表（§2.3） | — |
| G19 | 會議／會議歷史 | 小倍數 2 張折線：淨營收、扣廣告後貢獻（C26＋LineChart），跨資料集斷段 | L2／P1 | B | 新增；歷史 KPI 列維持 | V4-6 |
| G20 | 資料來源／狀態列之下 | 涵蓋時間軸：銷售、通路費用、廣告三軌加檔期軌（C30 inline SVG） | L3／P1 | B | 新增；問題表維持 | V4-7a |
| G21 | 資料來源／問題表上方 | 檔案 × 原因分布表（C28 矩陣模式） | L3／P1 | B | 新增；表本身就是資料表；0 筆問題時不渲染 | V4-7a |
| G22 | 精靈步驟 4 對帳表；資料來源前處理表 | 表格內嵌條（C24 變異與成對模式） | L3／P1 | A | 新增於既有表 | V4-7b |
| G23 | 計算與來源抽屜／階梯表 | 表格內嵌條（C24 佔比模式） | L3／P1 | A | 新增於既有表 | V4-7b |
| G24 | 商品／進階 `<details>` | 散佈：折扣率 × 毛利率（Recharts ScatterChart，只能 `next/dynamic`） | L3／P2 | A | 新增（D-V4-21）；資料表 `<details>` | V4-10 |

統計（23 張）：P0 4 張（G1、G2、G6、G15）、P1 16 張、P2 3 張（G8、G17、G24）；A 14 張、B 9 張（G7、G8、G10、G11、G14、G17、G19、G20、G21；G10 的各通路每 100 元與段比率屬 A，只有四項費用合計與超過 100 的幾何屬 B）、C 0 張；G18 取消。

### 4.2 回答的問題與結論句

| 代號 | 回答的問題（為什麼比現在快） | 結論句模板（標題） | 句例（只列已在 repo 驗證的值） |
|---|---|---|---|
| G1 | 從上期到本期錢漏在哪；v4 只換框，取得四態、takeaway 與 `aside` 兩欄 | 沿用 `overview.bridgeV3.title.*`：「少賺 {amount}，扣最多的一項是{item}（{delta}）」 | 示範：「少賺 59.9 萬，扣最多的一項是商品成本（−157.5 萬）」（`verification/revamp-v3-V3-4b-acceptance.md:53`） |
| G2 | 每 100 元淨營收剩多少 | 沿用 `overview.profit.title.*` | 示範：「每 100 元淨營收，扣完廣告剩 16.2 元」 |
| G3 | 每週走勢；v3 已在本期、上期末點標值（`overview.trendV3.lastPoint`、`previousPoint`），v4 只統一刻度（`formatAxisWan`，修正「50.0 萬」） | 沿用 `overview.trendV3`（標題與 takeaway 不改字） | — |
| G4 | 差額來自哪個通路、誰轉負；差額條直接比長短 | 沿用 `overview.channelsV3.title.*` | 示範：「平台 · MARKETPLACE 扣完廣告虧 6.1 萬」 |
| G5 | 和目標比；MER 和損益兩平比 | 既有目標句；MER 列「實際 {mer}，損益兩平 {breakeven}」 | — |
| G6 | 手機上九項差額的大小與方向：390 的瀑布要水平捲動，條長讓橋接表本身就能比（依 D-V4-33 只在 ≤ 767px 顯示） | 共用 G1 標題，不加新標題 | 示範：最長的條是有利的原價收入（+316.2 萬，`verification/revamp-v3-V3-4b-acceptance.md:53`），不利色條中最長的是商品成本（−157.5 萬）。條長是 \|值\| ÷ 九項 \|值\| 最大值，和標題「扣最多的一項」（只在與總差額同方向的項目中取最大，`src/application/waterfall.ts:151-165`）回答的不是同一個問題 |
| G7 | 這個指標最近幾週是平、升、降 | 無標題（aria-hidden，語意由同列數字承擔） | — |
| G8 | 本期累計到哪、有沒有追上上期 | 「本期累計扣廣告後貢獻 {amount}，第 {d} 天起落後上期」；超過時「…，第 {d} 天起超過上期」；相同時「…，與上期相同」。規則：只比兩期都有值的第 1 到 min(兩期天數) 天；以最後一個可比的天判定落後、超過或相同；d＝最後一次由「不落後」轉為「落後」（或由「不超過」轉為「超過」）的那一天，第 1 天就落後（或超過）時 d＝1 | 示範資料兩期末日累計：本期 1,269,792.73、上期 1,868,626.68（`verification/revamp-v3-V3-10-acceptance.md` 備份還原矩陣列：本期 1,269,792.73、差額 −598,833.95）；d 由 V4-10 手算後寫進驗收 |
| G9 | 哪條規則的金額差額最大；只對差額類規則畫條（營收增貢獻減、四個費用負擔規則），水準類規則（負貢獻通路、商品毛利為負）的影響金額是本期金額，不和差額比長短 | 沿用清單標題；每列沿用既有 headline 與影響金額 | — |
| G10 | 每 100 元淨營收在各通路被什麼吃掉、剩多少或虧多少；現在要切 G2 的範圍逐一看 | 有虧損通路：「{通路} 每 100 元淨營收，扣完廣告虧 {n} 元」（取每 100 元虧最多的通路）；沒有：「{通路} 每 100 元淨營收，扣完廣告剩 {n} 元，最少」（「扣完廣告」與 G2、`docs/revamp-v3/GLOSSARY.md:18` 同一寫法）；全部通路都「不適用」（沒有任何一個通路有每 100 元的值，例如 `refund_only`）時用 `diagnosis.chartsV4.share.title.notApplicable`「每 100 元淨營收去向，各通路都不適用」，副標說明原因 | 合計範圍等於 G2 的 16.2 元（示範） |
| G11 | 哪一天、哪一通路虧；日粒度現在完全沒畫 | 「{通路} 有 {n} 天虧，最差 {date} {amount}」；沒有虧損日：「沒有虧損日，最低 {通路} {date} {amount}」。「虧」＝取位到元後仍為負，與 v3 通路結論句同規則（`src/application/chart-takeaways.ts:101-103`） | 示範：MARKETPLACE 本期約 32 天為負（V4-3b 測試確認後寫進驗收） |
| G12 | 五項比率各自每週怎麼走 | 標題用區塊名「五項比率每週走勢」（`diagnosis.chartsV4.rates.title`），不寫結論句、不挑「升降最多」的一項：折扣率（分母原價收入）、退款金額比（分母原價減折扣）、物流費佔比、廣告費佔比、商品毛利率（分母淨營收）的分母不同，`docs/METRICS.md:13-17、21` 只定義各自的分母與「率差用百分點」，沒有跨比率比較的規則；方向也不同（商品毛利率下降與折扣率上升都不利）。理由同 §2.3 其他常用指標的 7 個比率不畫長條、G18 取消 | 示範資料若硬比，折扣率 +9.00 個百分點會勝過商品毛利率 −7.95 個百分點，只是因為分母不同 |
| G13 | 哪個商品毛利減少或增加最多 | 「{SKU} · {通路} 商品毛利少 {amount}，減少最多」（資料列是 SKU × 通路，同一個 SKU 可能在兩個通路；順序與 v3 前 10 名表、完整表的「SKU · 通路」一致；通路名與 SKU 不計入 14 字） | 示範：本期 15 列減少，最多的是 SKU-020 · 平台 · MARKETPLACE（−30,198.96；套用示範通路別名後的寫法） |
| G14 | 商品毛利為負的商品有幾個、前幾個佔負值合計多少（資料只有商品毛利，不含通路費用與廣告；商品毛利為負不等於這個商品扣完所有費用後賠錢，退款依入帳日扣除，`docs/DATA_CONTRACT.md:25`） | 「{n} 個商品毛利為負，前 {k} 個佔 {pct}」（pct＝累計佔比（佔商品毛利為負合計），定義見 §4.3）；沒有負值時不渲染 G14。圖名、副標、資料表一律寫「商品毛利為負」，不寫「賠錢」「虧損」（AGENTS.md：商品畫面只呈現商品毛利） | 示範資料與 golden 本期都沒有商品毛利為負的商品（示範 40 列全部 > 0；golden 4 列為 540.00、200.00、280.00、125.00），所以示範資料不顯示 G14；`refund_only` 有 1 個（DTC · A，−60.00，前 1 個佔 100%）；4 通路合成資料另備多個負值 |
| G15 | 三個方案試算後各比現況多賺或少賺多少；現在要跨欄比 | 試算頁：「{方案}試算後比現況多賺 {amount}」或「{方案}試算後比現況少賺 {amount}」，持平時「{方案}試算後與現況持平」（同一通路的方案取差額絕對值最大者；方向詞前一定加「試算後」，AGENTS.md：靜態試算不得稱為營收預測；`src/domain/scenarios.ts:35` 稱為「條件差額」）。會議實例：「{n} 個通路的選入方案」（各通路的現況基準不同，不跨通路挑最大值） | golden 試算 284.00／264.00／19.70 不變 |
| G16 | 銷量要到多少才不虧、才維持原貢獻 | 沿用既有門檻句（`threshold-*` 使用的字串，不改字） | — |
| G17 | 哪些待辦逾期、哪些 7 天內到期 | 「{n} 件逾期，{m} 件 7 天內到期」（7 天內＝今天到今天＋6 天，含今天；逾期＝早於今天） | — |
| G18 | （取消） | — | — |
| G19 | 幾次會議下來的走勢 | 「近 {n} 次會議，扣廣告後貢獻從 {a} 到 {b}」（只取最新一段可比的會議：同資料集、同通路、本期天數與比較方式相同） | — |
| G20 | 三份 CSV 涵蓋到哪天、哪天缺列 | 「{檔案}缺 {start} 到 {end} 共 {n} 天（{通路}）」；最長的缺列區段只有 1 天時：「{檔案}缺 {date} 1 天（{通路}）」（`title.missingOneDay`）；沒有缺列：「三份檔案涵蓋 {start} 到 {end}，沒有缺列」 | `missing_ad_day`：缺 8/2 1 天（MARKETPLACE），用單日模板 |
| G21 | 問題集中在哪個檔、哪種原因 | 「{檔案}：{原因}最多，{n} 列」（V4-7a 審查起；原規劃「{檔案}的{原因}最多」遇 8 字原因名時第一個子句超過 14 字，見 CHART_CATALOG §7 補記）；只有一格（一個檔、一種原因）時：「{檔案}有 {n} 列{原因}」（`title.single`） | `missing_ad_day`：只有廣告檔 × MISSING_AD_DAY 一格，用單格模板 |
| G22 | 來源合計和標準合計差多少；含稅換算前後 | 沿用表格，不加新標題 | — |
| G23 | 這個數字在四層的哪裡、各佔淨營收多少 | 沿用抽屜標題 | — |
| G24 | 折扣率和毛利率的分布 | 「{n} 個商品毛利率為負」；限制句「只呈現分布，不代表因果」放在資料表 `<details>` 內，不進主層（B8） | — |

### 4.3 資料來源、等級、版本常數、golden 與退回規則

| 代號 | 資料來源（函式與欄位） | 等級／版本 | 手算 golden 與對帳點 | 退回與邊界規則 |
|---|---|---|---|---|
| G1 | `bridgeWaterfall(snapshot)`（`src/application/waterfall.ts:172`）：`report.bridge.components`、兩期 `contribution_after_marketing` | A／`contribution-v1` | golden 差額 −315.00 不變；九項加總＝差額（既有平衡檢核） | 既有 `broken` 規則：缺值柱畫虛線框，後面無法定位的小計不畫 |
| G2 | `profitWaterfall(snapshot, scope)`；`perHundred`（`waterfall.ts:262`） | A／`contribution-v1` | 既有三個恆等式（`waterfall.ts:255-259`） | 既有 |
| G3 | `snapshot.weeks`、`snapshot.yoy.weeks`、`trendTakeaways` | A | — | 缺週斷線並標「無資料」；最後一週未滿 7 天標註（既有） |
| G4 | 長條：`channelConclusion(snapshot).rows[].previous/current`（`src/application/chart-takeaways.ts:87`）。差額條與差額欄：`metricComparison(snapshot, "contribution_after_marketing", channel)`（`src/application/manager-summary.ts:87-106`，用 domain `compareMoney` 的 `absolute_change`；V4-2 改為匯出、邏輯不改）的 `change` 與 `evidence.change` | A | 差額＝本期 − 上期（到分） | 缺值格寫「資料待補」，不畫條 |
| G5 | `targets.ts` 的達成與 `matchTargets`；MER 列用 `assistKpis` 的 `mer` 與 `breakevenMer().value`（`src/application/breakeven-mer.ts`） | A／`assist-kpi-v1`、`breakeven-mer-v1` | 不新算 | 目標期間不符時不畫刻度（既有說明句）；損益兩平 MER 為 null 時不畫 |
| G6 | 橋接表九個差額列（`bridgeWaterfall().rows`）；條長＝\|值\| ÷ 九項 \|值\| 最大值，只用於長度 | A | 條數＝9；每條 evidence 與同列 number-link 相同 | 缺值列不畫條 |
| G7a | `snapshot.weeks` 本期最後 ≤ 8 週：`marketing_burden`、`mer`、`gross_margin`、`refund_ratio`、`fulfillment_burden` 直接取；件數與件均淨營收用 `assistWeeks(snapshot)`：`weeklyRows` 多帶 `aggregatePeriod` 已回傳的 `units_sold`（缺口見 `src/application/workspace.ts:91`），件均呼叫既有 `netRevenuePerUnit` | B／`assist-weeks-v1`（`assist-kpi-v1` 不變） | 逐週件數加總＝期間件數；逐週件均＝`netRevenuePerUnit(週淨營收, 週件數)` | 件數只畫完整週（`chart-takeaways.ts:53` 的 `isFullWeek`），未滿 7 天的週畫空心點並在資料表註明；比率照畫；損益兩平 MER 列不畫 sparkline |
| G7b | `channelWeeks(dataset, scope)`：每通路逐週呼叫既有 `aggregatePeriod(dataset, week, [channel])`（每次呼叫都會掃過整份資料，`src/domain/aggregation.ts:54-56`，所以運算量是通路數 × 週數 × 資料列數）；**不放進 `createSnapshot`**，只在健檢頁元件內以 `useMemo` 計算（Excel「圖表資料」匯出時由 `excel-export` 自行呼叫），通路 > 8 時不呼叫；指標＝扣廣告後貢獻 | B／`channel-weeks-v1` | 每通路逐週加總＝通路期間合計（到分）；呼叫次數＝通路數 × 週數（通路 ≤ 8） | 通路 ≤ 8 才計算、才渲染；超過時 sparkline 欄與「各通路每週」`<details>` 改為一句說明，指向既有通路寬表（`MAX_ANALYSIS_CHANNELS = 1000`，`src/application/limits.ts:6`）；金額只畫完整週，未滿 7 天的週畫空心點。**V4-3a 實作（2026-10-09）**：簽名改為 `channelWeeks(snapshot)`，把 `report.current.daily`（aggregatePeriod 已算好的日 × 通路列）逐週以 domain 的 `sumTotals`、`calculateMetrics`、`uniqueSources` 加總；健檢頁元件拿不到 dataset。單元測試逐格斷言與 `aggregatePeriod(dataset, 週, [通路])` 的 metric 與 sources 相同 |
| G8 | 兩期各自取每日扣廣告後貢獻：`periodDailyMetrics(report.previous)`、`periodDailyMetrics(report.current)`（由 `src/application/pnl-table.ts:65-87` 的 `dayColumns` 抽出的共用純函式：同一天各通路的 totals 以 `sumTotals` 相加後交給 domain 的 `calculateMetrics`；`dayColumns` 改呼叫它、輸出不變。`buildPnlTable(snapshot, "day")` 只有本期的日欄，`:65-67`，拿不到上期），逐日 `Decimal` 累加（`cumulativeDaily`）；目標線＝`matchTargets` matched 時的 `target` | B／`cumulative-daily-v1` | 兩期末日累計各＝該期合計（`report.previous/current.metrics.contribution_after_marketing`；示範資料 42 天：本期 1,269,792.73、上期 1,868,626.68）；合成資料多日期間逐日手算前 3 天；golden 兩期都只有 1 天，末日 255.00 只是恆等式；`periodDailyMetrics(report.current)` 與 `buildPnlTable(snapshot, "day")` 的日欄逐格相同；每點 `components` 列出累加的日 | 任一日 null 之後斷線，不當 0；兩期天數不同時以「第 n 天」對齊並在副標標示（`calendar_months` 常見），結論句只比兩期都有值的天（§4.2）；任一期超過 92 天不畫（日欄上限 `pnl-table.ts:52`，兩期都套用）；不畫等速目標線（屬預測） |
| G9 | `diagnosisGroups(snapshot)`（簽名 `diagnosisGroups(snapshot: Pick<WorkspaceSnapshot, "report">)`，`src/application/diagnosis-group.ts:98`）的 `groups[].impact_cents`（已依 \|影響\| 排序，`:78-84`）、`importance_threshold`（`:129`） | A | 條數＝差額類規則中有金額的列數 | 只對差額類規則畫條：`REV_UP_CM_DOWN`（`ranking_amount`＝貢獻差額，`src/domain/rules.ts:128`）與四個費用負擔規則（`compareMoney(...).absolute_change`，`:142`）；水準類規則 `NEGATIVE_CHANNEL_CM`（本期扣廣告後貢獻，`:132`）與 `SKU_NEGATIVE_GP`（本期商品毛利，`:160`）不畫條，清單照列金額；共用尺度只取差額類列的 \|影響\| 最大值；費用負擔規則是在比率上升時觸發，影響金額卻是金額差的負值（`src/domain/rules.ts:139-142`、`src/application/diagnosis-group.ts:23-27`），比率上升而金額下降時影響為正，照有利色往右畫（單元測試要有這個案例）；`REV_UP_CM_DOWN` 的金額就是扣廣告後貢獻的總差額，費用規則的差額是它的組成，所以它畫成空心條（2px 框線、不填色），清單下方以 `diagnosis.chartsV4.impact.totalNote` 註明「空心條是扣廣告後貢獻的總差額，實心條是各項費用的差額」，仍用同一把尺（單位相同）；缺漏規則與金額未知的列不畫條；不做「其他」合併，不加總不同規則的影響金額（X38） |
| G10 | 每通路的「剩」與商品成本、廣告費、扣廣告後貢獻三段的比率，直接用 `profitWaterfall(snapshot, channel)`（`src/application/waterfall.ts:236-280`）的 `perHundred`（`:262-263`）與 `rows[].share`（`:271`），和 G2 切到該通路時同一個實作；真正新增的只有 `channelStructure(snapshot, period)` 的「四項通路費用合計」（`platform_fees`、`payment_fees`、`fulfillment_costs`、`other_variable_costs` 以 `sumAmounts` 相加，佔淨營收比用 `ratioMetric`，每 100 元比照 `perHundred` 的 `Decimal`、HALF_UP 一位）與超過 100 的幾何 | 各通路的剩與段比率：A／`contribution-v1`；四項費用合計與超過 100 的幾何：B／`channel-structure-v1` | 每通路七段金額加總＝淨營收（到分，比照 `waterfall.ts:255-259`）；每通路的「剩」＝`profitWaterfall(snapshot, channel).perHundred`、段比率＝`rows[].share`（逐字相同）；合計範圍的「剩」＝`profitWaterfall().perHundred`（示範 16.2、golden 10.3）；golden MARKETPLACE 扣廣告後貢獻 −15.00 畫成超過 100 | 扣項合計 > 100 時，超過 100 的部分塗不利色，照常畫，不退回；只有「任一扣項為負」或「淨營收 ≤ 0」的通路改成文字列「不適用」並在副標說明（`refund_only` 測試）；缺值通路寫「資料待補」；`zero_ad` 廣告段寬 0 但資料表照列 |
| G11 | `dailyHeatmap(snapshot, "contribution_after_marketing")`：`report.current.daily[]` 的 `metrics`、`sources`、`daily_complete`；列＝snapshot 週（從期間起日每 7 天一段，`src/application/workspace.ts:80`，與 G3、G7b、G12 同一組週）；分階：階 1＝取位到元後仍為負（與 v3 通路結論句 `chart-takeaways.ts:101-103` 同規則），階 2＝該通路階 1 中最差 3 天（同值依日期先後；正值不分階、不上色，D-V3-7） | B／`daily-heatmap-v1` | 每通路逐日加總＝通路期間合計（`daily_complete` 時）；階 2 每通路恰好 min(3, 負值天數) 格 | null 格畫虛線框並寫「資料待補」，不參與排名；`daily_complete=false` 時副標說明；超過 92 天改週 × 通路（用健檢頁同一份 `channelWeeks` 結果，`channel-weeks-v1`）；通路 > 8 時不計算、不渲染，改為一句說明指向既有通路寬表（與 G10、G7b 同一上限；格數因此 ≤ 8 × 92＝736） |
| G12 | `weeklyRows`／`yoySummary`（`src/application/workspace.ts:82`、`:97`，由 `createSnapshot` 呼叫）產生的 `snapshot.weeks` 兩期與去年同期的 `discount_rate`、`refund_ratio`、`fulfillment_burden`、`marketing_burden`、`gross_margin` | A | — | 每張小圖各自定 Y（同一比率的本期、上期、去年同期共用）：下界 min(0, 最小值)，上界最大值，範圍 ≥ 10 個百分點時取整到 5，否則取整到 1（只是座標）；不同比率不共用尺度（示範資料每週物流費佔比約 1.15% 到 1.94%（上期 1.146% 到 1.188%、本期 1.843% 到 1.939%），和毛利率共用 0–45% 時只有 2–3px 起伏）；毛利率可以為負，下界跟著往下；缺週斷線；比率可畫未滿 7 天的週，資料表註明 |
| G13 | `compareProducts(dataset, filters).rows[].changes.gross_profit` 與兩期 `gross_profit`；依差額取減少最多、增加最多各 ≤ 10 | A | 每條 evidence 與資料表同列相同 | 差額 null 的列不列入；兩欄共用尺度 |
| G14 | 商品頁既有 `compareProducts` 結果（`comparison.rows`，`src/components/product-comparison-panel.tsx:133`）本期的 `gross_profit` 與 `sources`：和 `product-worst` 同一個 `compareProducts` 結果、同一個 evidence builder，但只取商品毛利 < 0 的列（`product-worst` 的 `worstCurrent` 會補入非負的列，`src/application/product-highlights.ts:33-35`，Pareto 不補）；依 `parseCents` 由小到大排序，累計 `sumAmounts`；累計佔比（佔商品毛利為負合計）＝\|累計\| ÷ \|負值合計\|：先把兩者取反成正的負值額（`subtractAmounts({ cents: 0n, reason_codes: [] }, x)`）再呼叫 `ratioMetric`（`ratioMetric` 遇分母 ≤ 0 一律回傳 null，`src/domain/money.ts:32-35`；`docs/METRICS.md:20` 不以負分母製造率指標）；標題的佔比用同一定義 | B／`product-pareto-v1` | 末筆累計＝負值合計；末筆累計佔比＝100%；手算：`refund_only` 本期 DTC · A −60.00（1 筆：累計 −60.00、佔比 100%）；4 通路合成資料多筆逐筆手算 | 只對商品毛利（不做 SKU 層扣廣告後貢獻）；沒有負值時不渲染 G14，`product-worst` 照 v3 原樣放在第一格；柱 ≤ 10，其餘寫「另 n 個」文字，不畫「其他」柱 |
| G15 | `calculateScenario`（`src/domain/scenarios.ts:123`，經 `updateScenarioContext`，`src/application/scenario-workspace.ts:54`）產生的 `ScenarioWorkspace.contexts[].plans[].result.delta`、`result.contribution`、`baseline.amounts.contribution_after_marketing` | A | golden 284.00／264.00／19.70 不變 | 不跨通路相加；結果尚未產生的方案不畫（與比較表同規則）；結果 null 時寫「不適用」；會議實例每通路一根（`docs/SCENARIOS.md:76`：每通路最多選一個相容的已計算修訂），上限 6 根，其餘只列在資料表並寫「另 n 個」；stale 方案不畫條 |
| G16 | `analyzeScenarioSensitivity()` 的兩個門檻 `targets[].threshold_pct`（T＝0 與 T＝原扣廣告後貢獻，點的 y 就是目標值本身）；使用者明填的 A／B／C 三點與 `sensitivity.rows` 的結果；`coefficients.volume_coefficient`（L）只用來判斷 L＝0 | 依 D-V4-20：A′（建議）只畫既有點、不連線，A；選 A 時在既有點之間連線，連線上的位置是模型值，等級寫「A（模型值，來源 `scenario-sensitivity-v1`）」，必要測試：每個線段端點都等於既有點、所有 x 只落在 [min v, max v]、圖下顯示模型版本 `scenario-sensitivity-v1`；選 B 時為 B／`threshold-line-v1` | 每個點的 y 與比較表、敏感度表同列逐字相同 | x 軸固定 [−90%, +100%]（`docs/SCENARIOS.md:12`）；只畫範圍內的既有點；選 A 時線段只連這些點，依 v 排序，不外插、不延伸到點之外，端點不標值；只有 1 個點時只畫點；門檻超出範圍時不畫該點，只在圖下標「超出範圍」與範圍內是否達標（`docs/SCENARIOS.md:64`）；L＝0 時不畫門檻點，副標用既有的恆等、恆高、恆低說明句；快照過期（stale）時整張改用 C16 空狀態並沿用既有過期說明；敏感度三點未填時不畫，不代填（`docs/SCENARIOS.md:68`） |
| G17 | `boardColumns(workspace)`、`card.deadline`、`execution_status`、`taipeiToday()` | B／`action-due-buckets-v1` | 四格（逾期、7 天內、之後、未填期限）加總＝未完成待辦數 | 逾期＝有期限、早於台北今天、未完成（與卡片 `board-card-due[data-overdue]` 相同）；7 天內＝今天到今天＋6 天（含今天）；已完成不計；期限為空列入「未填期限」 |
| G18 | （取消） | — | — | — |
| G19 | `meeting_history[].agenda.kpis[].current`、`date`、`source_fixed.dataset_hash`、`source_fixed.channels`、`source_fixed.periods`（兩期與比較方式，`src/application/meeting.ts:44-46`）；`meetingSeries(history)` | B／`meeting-series-v1` | 斷段位置＝`dataset_hash`、通路集合、本期天數或比較方式改變處（`compareWithLastMeeting` 在期間不同時回傳 `different_periods` 並照樣比較，`meeting.ts:382-397`，所以不能只沿用它的可比規則）；本期完全相同的重複會議只畫最新一筆 | 歷史 < 2 筆時用等高空狀態；不同資料集、通路或期間長度之間斷線並標「不同資料集」或「期間不同」；資料表與點的標籤寫資料本期（M/D–M/D），不只寫會議日；會議紀錄凍結內容只讀 |
| G20 | `Manifest.coverage_start/end`、兩期、`data_as_of`；`dataset.issues` 中 `MISSING_CHANNEL_COST_DAY`、`MISSING_AD_DAY`（`src/domain/validation.ts:140-141`）依檔 × 通路合併成連續日期區段；銷售有列的日期集合；`events` | B／`coverage-timeline-v1` | 每個缺列區段的天數＝該檔 × 通路的缺列問題筆數 | 超過列數上限只有範圍級問題時退回文字，不畫區段；無銷售列不等於零銷售，只標「無列」 |
| G21 | `dataset.issues` 依 `file × reason_code` 計數 | B／`issue-distribution-v1` | 全部格加總＝列級問題筆數 | 範圍級問題另列一行，不混進格；0 格留白不上色；列級與範圍級問題都是 0 筆時不渲染 G21（`data-issues` 既有的「沒有問題」狀態不變） |
| G22 | `buildImportReconciliation`（`src/application/import-guidance.ts:94`）產生的 `ImportReconciliation.fields[].source_total/standard_total/difference`（`src/application/import-guidance.ts:85-92`）、`TaxConversion.totals[field].raw/converted` | A | — | 差額＝0 不畫條，標「相符」 |
| G23 | 抽屜階梯四層金額；`ladderMetrics` 由 `src/components/evidence-drawer.tsx:79` 搬到 `src/application/evidence-ladder.ts` 並匯出（V4-3a 先修正單一通路的週與日證據查找，V4-7b 只搬移、邏輯不再改）；條長＝\|值\| ÷ 淨營收，只用於長度 | A／`contribution-v1` | 搬移前後輸出相同（單元測試） | 淨營收 ≤ 0 或 null 時不畫條；只畫淨營收那一列與其下各列（原價收入、折扣、退款三列的比較基準是原價收入，不畫）；負值往左，色依列的角色：扣項（階梯 op「−」：商品成本、四項通路費用、廣告費）為負是成本沖回或費用抵扣（`docs/DATA_CONTRACT.md:26、35`），對貢獻有利，用 `--chart-favorable`；小計與結果列（淨營收、商品毛利、扣廣告前貢獻、扣廣告後貢獻）為負才用不利色 |
| G24 | 商品頁 `comparison.rows` 本期的 `discount_rate`、`gross_margin`（與 G13、G14 同一個 `compareProducts` 結果）；null 計數 | A | — | 點 > 200 時不畫圖，只留資料表；null 筆數寫進副標 |

**B 級函式一覽**（全部在 `src/application`，純函式、可序列化、只用 `Decimal`／`sumAmounts`／`ratioMetric`；新算出的值把版本常數放進 `EvidenceSelection.metricVersion`（抽屜既有欄位 `src/components/evidence-drawer.tsx:31`），直接取自 domain 的值不改 `metricVersion`、整理函式版本放新欄位 `arrangeVersion`，§8.7）：`channelStructure`（`channel-structure-v1`，只涵蓋四項費用合計與超過 100 的幾何）、`dailyHeatmap`（`daily-heatmap-v1`）、`cumulativeDaily`（`cumulative-daily-v1`）、`productPareto`（`product-pareto-v1`）、`channelWeeks`（`channel-weeks-v1`）、`assistWeeks`（`assist-weeks-v1`）、`meetingSeries`（`meeting-series-v1`）、`coverageTimeline`（`coverage-timeline-v1`）、`issueDistribution`（`issue-distribution-v1`）、`actionDueBuckets`（`action-due-buckets-v1`）；D-V4-20 選 B 時另加 `thresholdLine`（`threshold-line-v1`）。檔案對照見 §6.4。

### 4.4 編碼（軸、色、形狀、標籤）

色一律經 `src/application/chart-theme.ts` 的 `chartColors` 取 `var(--chart-*)`；下表寫 token 名，元件內不得出現 hex 或 `var(--chart-` 字串常值（CL-3）。

| 代號 | 軸與尺度 | 色 | 形狀與標籤 |
|---|---|---|---|
| G1、G2 | Y 含 0；刻度 1／2／2.5／5 × 10ⁿ、整數萬（`formatAxisWan`）；兩張瀑布同頁同尺度：共同 `[lo, hi]` 取 G1 的 `bars` 加上 `profitWaterfallScopes` 列出的全部範圍（合計與每個通路）的 G2 `bars`，所以 G2 切到虧損通路時負值柱仍在範圍內、刻度含負值（示範資料 MARKETPLACE 終點柱 −61,169.93；golden MARKETPLACE −15.00） | `--chart-total`、`--chart-current`、`--chart-unfavorable`、`--chart-favorable`；待補沿用既有虛線框（外觀不改） | 柱上 L1 帶號；x 標籤兩行（既有） |
| G3 | Y 整數萬（`formatAxisWan`，修正「50.0 萬」）；X 週序 | 本期 `--chart-current` 2px、上期 `--chart-previous` 1.5px、去年同期 `--chart-yoy` 虛線 4 3、`--chart-band`、`--chart-grid` | 沿用 v3：本期、上期末點標值；圖例三項（本期、上期 line，去年同期 dash）；去年同期線尾標名只在 H5 要求時做，沿用 `overview.trendV3.lastPoint` 句型，不新增 key |
| G4 | X 含 0、負值往左；差額條獨立從 0 | 上期 8px `--chart-previous`、本期 18px `--chart-current`、負值 `--chart-unfavorable`；差額條不利 `--chart-unfavorable`、有利 `--chart-total`（同一框的上期長條已用 gray-400 的 `--chart-previous`，有利不再用同為 gray-400 的 `--chart-favorable`） | 末端標 L1；有利帶「+」 |
| G5 | 細條 0 到目標（沿用 v3：寬度＝達成率夾在 0 到 1，`src/components/overview.tsx:49`；目標刻度固定在右端，`globals.css:1143` 的 `.kpi-bullet-target`）；超過目標時條滿格，超出多少由旁邊文字承擔；外觀與 v3 零差異 | 條 `--chart-total`；落後 `--chart-unfavorable`；目標刻度 `--chart-target` 2×12 | 旁邊文字由呼叫端給 |
| G6 | 共用零線，九條共用尺度（九項 \|值\| 最大值）；只在 ≤ 767px 顯示（D-V4-33） | 依 `favorableDirection` 與 `deltaTone`：不利 `--chart-unfavorable`、有利 `--chart-favorable` | 文字是既有 number-link；條不另標值 |
| G7 | 無軸無框；Y 為該列 ≤ 8 點的最小到最大 | 線 `--chart-total` 1.5px；最後一點 3px 實心 `--chart-current` | 未滿 7 天的點空心；不標值 |
| G8 | Y 整數萬含 0；X「第 n 天」 | 本期 `--chart-current` 2px、上期 `--chart-previous` 1.5px；目標水平線 `--chart-target` | 兩條線尾標累計值 |
| G9 | 差額類規則共用尺度（差額類列 \|影響\| 最大值，含 `REV_UP_CM_DOWN`），不利往左、有利往右；水準類規則不畫 | 費用負擔規則實心：影響為負 `--chart-unfavorable`、為正（比率升但金額降）`--chart-favorable`；`REV_UP_CM_DOWN`（總差額）空心條，2px 框線 `--chart-unfavorable`、不填色；門檻刻度 `--chart-target` 2×12 | 不另標值（列內已有影響金額）；清單下方一行註明空心與實心的差別（`diagnosis.chartsV4.impact.totalNote`） |
| G10 | X 0 到 max(100, 最大扣項合計)；100 處參考線 `--chart-axis` | 商品成本 `--chart-seg-1`、四項通路費用 `--chart-seg-2`、廣告費 `--chart-seg-3`；剩餘為空心框（stroke `--chart-total`）；超過 100 的部分 `--chart-unfavorable`；段間 1px `chartColors.surface`（D-V4-19） | 每列右端標「剩 {n} 元」或「虧 {n} 元」（虧用不利色文字）；段內不標值；圖例 4 項：商品成本、通路費用合計、廣告費三段用 line（12×2），剩餘用 rect（空心框，與圖內形狀相同）；指標名一律取 `metricDefinitions`（商品成本、廣告費用 `metricDefinitions.ad_spend.shortLabel`「廣告費」），四項合計的「通路費用合計」是 v4 GLOSSARY 增補的詞。列數與框高：每列 `chartRowHeights.row24`，svg 高＝（通路數＋合計 1 列＋x 軸與 100 標字 1 列）× 24；通路 ≤ 5 用 sm 180（7 × 24＝168），6 到 8 用 lg 320（10 × 24＝240），> 8 不畫（`state="empty"`，`message` 指向資料表與通路寬表）；通路數取 `report.scope.channels`，切換期間不變（B4） |
| G11 | 每通路一塊月曆：列＝snapshot 週（從期間起日每 7 天），欄＝該週第 1 到 7 天，欄頭標星期（每欄的星期固定）；格寬：≥ 1280 為 44px、768 到 1279 與 390 為 40px；每列放幾張由框內寬決定（CSS grid `auto-fill`，每張最小寬＝週欄 40＋7 × 格寬：44px 時 348、40px 時 320）：1440 與 1280 一列 2 張，768（內寬約 670）一列 2 張（V4-0b 設計稿實測，放不下時 1 張），390 一列 1 張；月曆順序依資料排序（`dailyHeatmap` 輸出時把標題所指的通路放第一張，其餘依 `report.scope.channels`），不用 CSS `order` | 階 1 `--chart-heat-1`；階 2 `--chart-heat-2` 加 2px `--chart-unfavorable` 框線；正值不上色；null 虛線框 `--chart-missing` | 格內用 `formatHeatCell`：以萬為單位、兩位小數、不帶單位（例如「−0.45」），取位到元後仍為負時保留 U+2212（取位後為 0 也不丟負號）；`--text-primary`；number-link 的可及名稱帶 L2；caption 寫通路與單位「萬元」（L1 在不到 1 萬時輸出「元」，`presentation.ts:100-110`，格內放不下） |
| G12 | 每張各自 Y（同一比率三條線共用）：下界 min(0, 最小值)，範圍 ≥ 10 個百分點取整到 5，否則取整到 1；X 週 | `--chart-current`、`--chart-previous`、`--chart-yoy` | 每張小標＝`metricDefinitions` 的指標名；線尾標本期 L1 百分比 |
| G13 | 兩欄各從 0、共用尺度；每欄 ≤ 5 列，列高 `chartRowHeights.row16`；1440 兩欄並排 5 × 16＝80，390 改上下 10 × 16＝160，都 ≤ sm 180 | 減少 `--chart-unfavorable`、增加 `--chart-favorable` | SKU · 通路在左；值在條端 L1 帶號；欄名（減少最多、增加最多）不放在 svg 內，用 ChartFrame `legend` 兩項 line |
| G14 | X 從 0 往左（商品毛利為負）；柱 ≤ 10，列高 `row16`，加「另 n 個」1 列共 11 × 16＝176 ≤ sm 180 | `--chart-unfavorable` | 柱端 L1；右側「累計 {pct}」 |
| G15 | 從 0；試算 ≤ 3 根，會議實例每通路一根、上限 6 根；列高 `row24`，（根數＋軸 1 列）× 24 ≤ sm 180；零線＝現況 | 依 `favorableDirection(contribution_after_marketing)`：少賺 `--chart-unfavorable`、多賺 `--chart-favorable` | 方案名在左；值在條端 L1 帶號 |
| G16 | X 銷量變動 %，固定 −90% 到 +100%，每 25 個百分點一個刻度；Y 扣廣告後貢獻含 0、整數萬 | 門檻點空心 `--chart-target`；使用者點實心 `--chart-total`（試算是假設，不是本期資料，不用強調色）；選 A 時連線 `--chart-total` 1.5px；零線 `--chart-axis` | 門檻點標百分比；端點不標值；超界標「超出範圍」 |
| G17 | 4 列計數條共用尺度 | 逾期 `--chart-unfavorable`；其餘 `--chart-total` | 數字在列內 |
| G18 | （取消） | — | — |
| G19 | Y 整數萬含 0；X 會議日期 | 線 `--chart-total`；最後一點（最近一次已結束的會議）3px 實心 `--chart-total`，與其他點只差在大小：歷史是凍結值、不是本期資料，強調色只給本期（§7.1、v3 D-4），也避免虧損的點被綠色讀成有利 | 最後一點標值；斷段間隙標「不同資料集」 |
| G20 | X 日期（涵蓋範圍），月份刻度；每軌 24px | 有列 `--chart-total`；缺列 `--chart-missing` 虛線框；本期與上期區帶 `--chart-band`；去年同期（`snapshot.yoy` ready 時）是時間軸上方 1px `--chart-yoy` 細線，不用虛線框（`--chart-yoy` 與 `--chart-missing` 都是 gray-400，同形同色會分不出缺列與去年同期）；檔期 `--chart-axis` 細線 | 軌名在左；缺列天數在右；區帶內直接標「上期」「本期」，細線旁直接標「去年同期」；圖例只有有列 line、缺列 dash |
| G21 | 列＝檔案、欄＝原因 | 有問題格 `--chart-heat-1`；該檔最多的原因格 `--chart-heat-2` 加框線 | 格內計數 |
| G22 | 差額條共用零線；成對條共用尺度 | 差額 ≠ 0 `--chart-unfavorable`；含稅原值 4px `--chart-previous`、換算值 6px `--chart-total` | 文字是既有表格數字（純文字） |
| G23 | 0 到淨營收 | 正值 `--chart-total`；負值往左：扣項為負用 `--chart-favorable`，小計與結果列為負用 `--chart-unfavorable` | 文字是既有階梯值 |
| G24 | X 折扣率 0 到最大、Y 毛利率含 0，刻度 5 個百分點；兩軸都是比率，只有一個數值 YAxis | 點 `--chart-total`；毛利率 < 0 的點 `--chart-unfavorable` | 不標 SKU（資料表可查）；限制句在 `<details>` |

### 4.5 互動、資料表替代、鍵盤

| 代號 | 點擊（與資料表同一個 evidence builder） | 下鑽 `filter` | 資料表替代（C33 產生，欄位） | 鍵盤路徑 |
|---|---|---|---|---|
| G1、G6 | `bridgeEvidence`：柱、表列、變異條同一個；柱維持 `track("waterfall_clicked")` | 無 | 橋接表常駐（`aside`）＋v2 四欄 `<details>` | 經橋接表 number-link |
| G2 | `profitEvidence` | 通路範圍 | 既有 10 列 `<details>` | 經表 |
| G3 | 既有週點 `chart-point-hit`（F10） | `filter.week` | 既有 7 欄 | 經表 |
| G4 | 長條：既有 `channelEvidence`（`src/components/overview/charts/channel-section.tsx:41-45`，該期水準值，不帶 `components`），與五欄表的 number-link 同一個 builder；差額條與緊湊表新增的差額 number-link：新增 `channelChangeEvidence`＝`metricComparison(...).evidence.change` 再加 `filter.channel`（`formula` 差額公式、`components` 帶兩期），兩者同一個 builder。兩個 builder 分開：長條若帶 `components`，抽屜會把水準值當差額顯示（`src/components/evidence-drawer.tsx:166` 帶正負號、`:80` 不畫四層階梯） | `filter.channel` | 緊湊表＋五欄表 | 經表 |
| G5 | 既有目標抽屜；MER 列開既有損益兩平抽屜 | 無 | 數字本身是 number-link | 既有 |
| G7 | 圖本身不可點；同列數字是 number-link | — | （a）新增 `<details>`「各指標每週」：7 個指標 × 近 {n} 週（G3 資料表只有三個金額指標，不含比率與件數，不能當替代）；（b）新增 `<details>`「各通路每週」：通路 × 週扣廣告後貢獻 | 經同列數字 |
| G8 | 點擊開當日累計，`formula`＋`components`（累加的日）＋`metricVersion: cumulative-daily-v1`＋`valueKind: "level"`（抽屜大數字不帶正負號）；當日格開該日（值取自 domain，維持 `contribution-v1`，`arrangeVersion: cumulative-daily-v1`） | `filter.date` | 日期、當日、累計、目標 | 經表 |
| G9 | 條不另設點擊（列既有的展開與 number-link 不變） | — | 清單本身 | 經清單（里程碑 `diagnosis-row-*` 不變） |
| G10 | 點商品成本、廣告費段開 `channelEvidence(metric＝該段)`；點「剩／虧」開扣廣告後貢獻（這三種都直接取自 domain，維持 `contribution-v1`）；四項費用段開「通路費用合計」證據：`valueKind: "level"`、`metricVersion: channel-structure-v1`，自帶 `title`、`definition`、`formulaTechnical`，不沿用 `platform_fees` 的定義與公式；每 100 元只在 D-V4-32＝A 時能開（各通路的剩來自 `profitWaterfall`，維持 `contribution-v1`） | `filter.channel` | 通路 × 7 欄金額＋每 100 元 | 經表 |
| G11 | 格的 number-link 開當日該通路的扣廣告後貢獻（`sources` 取 `daily[i].sources`）：值直接取自 domain，維持 `contribution-v1`；分階由 `arrangeVersion: daily-heatmap-v1` 說明 | `filter.channel`＋`filter.date` | 表本身就是資料表，不設 aria-hidden | 整張熱表 1 個 Tab 停留點：grid 型 roving tabindex（方向鍵在格間移動、跨通路月曆時沿 DOM 順序，Home／End 到該列首尾，Enter 或空白鍵開抽屜）；示範資料 84 格、8 通路 × 92 天時 736 格，逐格 Tab 會吃光 keyboard-walk 的步數上限（`tests/e2e/keyboard-walk.spec.ts:18-19`） |
| G12 | 點擊開該比率該週 | `filter.week` | 週 × 5 比率 | 經表 |
| G13 | 點條開商品抽屜的差額 | `filter.sku`（含通路） | SKU · 通路、上期、本期、差額 | 經表與 `product-best` |
| G14 | 點條開商品抽屜；累計帶 `components`（列出 SKU）、`metricVersion: product-pareto-v1` 與 `valueKind: "level"` | `filter.sku` | SKU · 通路、商品毛利、累計、累計佔比 | 經表與 `product-worst` |
| G15 | 條不另設點擊：方案結果是假設試算、不是 CSV 彙總，v3 的 `scenario-contribution`、`scenario-delta` 與方案比較表本來就是純文字、不開抽屜（§8.7 例外）；現況基準沿用既有基準抽屜（`baseline-*` number-link，`src/components/decision-workbench.tsx:238`） | 無 | C33 小表（方案、試算後的扣廣告後貢獻、與現況相比；欄名沿用 `scenarios` 分組既有的 `resultTitle`「試算後的扣廣告後貢獻」與 `vsBaseline`「與現況相比」，`src/i18n/labels.zh-TW.ts:934-935`；圖與比較表不在同一區塊，CL-1 需要自帶資料表）＋方案比較表常駐 | 經表 |
| G16 | 點不另設點擊：門檻說明 `threshold-{id}` 與敏感度表就在圖旁，兩者在 v3 都是純文字（§8.7 例外） | 無 | 三個假設表常駐＋係數 `<details>`；另加 C33 資料表（點、v、扣廣告後貢獻、種類） | 經表 |
| G17 | 列不另設點擊：看板與清單在 v3 沒有期限篩選（工具列只有看板／清單切換，`src/components/actions-workbench.tsx:179-181`），v4 不新增篩選；逾期判定與卡片既有的 `board-card-due[data-overdue]` 相同（`actions-workbench.tsx:138`：有期限、早於台北今天、未完成） | — | 4 列小表本身 | 經表 |
| G18 | （取消） | — | — | — |
| G19 | 不另設點擊：歷史項目是 `<details>`（`meeting-history-item`），展開即看凍結內容（§8.7 例外） | 無 | C33 新表：會議日期、會議名稱、淨營收、扣廣告後貢獻、資料集是否與前一次相同（`meeting-history-kpis` 是各次凍結的上次比較，不是本圖的序列） | 經表 |
| G20 | 點缺列段把問題表篩到該檔、該通路、該原因，並捲到 `data-issues` | 檔案、通路、原因 | 檔 × 通路 × 缺列日期區段（每列是篩選按鈕） | 經表 |
| G21 | 點格套用同樣的篩選 | 檔案、原因 | 表本身（格內是按鈕） | 經表 |
| G22 | 不另設點擊：對帳表與前處理表的格在 v3 是純文字（精靈步驟 4 的資料尚未提交，沒有抽屜；§8.7 例外） | 無 | 表本身 | 經表 |
| G23 | 無新增 | — | 表本身 | 經表 |
| G24 | 點擊開商品抽屜 | `filter.sku` | SKU · 通路、折扣率、毛利率 | 經表 |

共通：圖容器 `aria-hidden`、副標是 `aria-describedby`；Recharts 一律 `accessibilityLayer={false}`、`isAnimationActive={false}`、`ResponsiveContainer` 給 `initialDimension`；熱區不可聚焦，圖內 0 個 `tabIndex`；點擊記 `track("chart_clicked")`、展開資料表記 `track("chart_table_opened")`（D-V4-14，只記事件名）。

### 4.6 390 降級、投影、PDF、PPT、Excel、Markdown

| 代號 | 390（CSS 重排，不換 DOM） | 投影（只在總覽與會議） | PDF（C31） | PPT（C32） | Excel「圖表資料」（C34，D-V4-12） | Markdown |
|---|---|---|---|---|---|---|
| G1 | 橋接表（含 G6 輔助條）在 DOM 前、瀑布在後，在 `.chart-frame.lg.waterfall` 內水平捲動；瀑布仍是橋接主圖（X18、X39） | 顯示：白名單加 `.bridge-section`，只顯示瀑布（柱上標值是 L1）；橋接表（`.bridge-table-wrap`，L3）與 v2 四欄 `<details>` 隱藏但掛載（D-V4-8） | 三種版本都印（170mm 寬、灰階、0.5pt 框線）；老闆版高 ≤ 60mm 並維持 1 頁 | 原生瀑布（D-V4-10：堆疊長條加透明底段；V4-0b spike 不成立就用 `addShape`）；放在哪一張投影片依 D-V4-34（建議放第二張，既有第一張的區塊一個不動） | 11 根起訖與九項 | 一頁摘要加九項差額表（Markdown 沒有版本之分） |
| G2 | 水平捲動（既有） | 顯示（既有），資料表隱藏 | 標準、客戶版附錄（D-V4-11） | 不放 | 10 列與每 100 元 | 無 |
| G3 | 維持（去年同期線與 390 的去年同期下鑽保留，`tests/e2e/trend-yoy.spec.ts:15` 在 mobile 也跑） | 隱藏（掛載） | 不印 | 不放 | 既有管理損益表已有週資料，不另加 | 無 |
| G4 | 差額條移到該列下一行 | 隱藏 | 不印 | 不放（既有通路表不變） | 通路 × 上期、本期、差額 | 既有通路表 |
| G5 | 維持 | 顯示（既有） | 既有文字 | 既有文字 | 不另加 | 既有 |
| G6 | 條寬 64（≥ 768 隱藏但掛載，依 D-V4-33） | 隱藏（隨橋接表） | 不另印（瀑布已印） | 不另放；分歧長條不得取代瀑布（X18、X39） | 併入 G1 區塊 | 併入 G1 |
| G7 | 清單式時放在主行右側 | 隱藏 | 不印 | 不放 | 各列近 {n} 週值 | 無 |
| G8 | 只畫本期與上期 | 隱藏 | 不印 | 不放 | 日期、當日、累計 | 無 |
| G9 | 條寬 64，放在影響金額下方 | 不適用 | 不印 | 不放 | 不另加（摘要已含健檢） | 無 |
| G10 | 只標「剩／虧」 | 不適用 | 不印 | 不放 | 通路 × 7 欄＋每 100 元 | 無 |
| G11 | 各通路月曆上下堆疊；390 的實際內寬約 324px（`--gutter` 16×2、`.panel` 框線 1×2、`.chart-section` padding 16×2，`src/app/globals.css:192、306、1323`），週欄 40px＋7 欄 × 40px＝320px；V4-0b 設計稿實測放不下時，允許 `.table-scroll` 內部水平捲動（頁面不捲動）。框高維持 lg 320：一張月曆含表頭與 caption 約 244px，390 兩張以上就在框內垂直捲動，所以標題所指的通路排在 DOM 第一張（不用 CSS `order`），副標加 `diagnosis.chartsV4.heat.scrollNote`「其餘通路在框內捲動」 | 不適用 | 不印 | 不放 | 日 × 通路矩陣 | 無 |
| G12 | 單欄列出全部 5 張（不設「更多指標」收合：它若放在圖容器內，會是 `aria-hidden` 內的停留點）；框高＝`chartHeights.sm` × 5（C26） | 不適用 | 不印 | 不放 | 週 × 5 比率 | 無 |
| G13 | 兩欄改上下（每欄 ≤ 5，10 × 16＝160 ≤ sm 180） | 不適用 | 不印 | 不放 | SKU 上期、本期、差額 | 無 |
| G14 | 維持 | 不適用 | 不印 | 不放 | SKU、累計、累計佔比 | 無 |
| G15 | 每列一根 | 會議議程 5 在投影中維持隱藏（只顯示議程 1–2） | 不印 | 不放 | 不另加：`ExcelExportInput` 沒有試算資料（`src/application/excel-export.ts:40-56`），兩個呼叫端也沒有傳 `ScenarioWorkspace`；試算結果已在決策 JSON 與 Markdown | 決策 Markdown 不變 |
| G16 | 高 180 不變；門檻標籤縮短 | 不適用 | 不印 | 不放 | 不另加（同 G15；門檻與三點已在決策 JSON 的 sensitivity 段，`src/application/decision-export.ts:37`） | 無 |
| G17 | 維持 | 不適用 | 不印 | 不放 | 不另加（待辦工作表已有期限） | 無 |
| G18 | （取消） | — | — | — | — | — |
| G19 | 單欄 | 隱藏 | 不印 | 不放 | 不另加 | 無 |
| G20 | 三軌垂直堆疊、月份刻度減半 | 不適用 | 不印 | 不放 | 不另加（問題 CSV 既有） | 無 |
| G21 | 改清單式（沿用 C3 的 `data-label`） | 不適用 | 不印 | 不放 | 不另加 | 無 |
| G22 | 條寬 64 | 不適用 | 不印 | 不放 | 不另加 | 無 |
| G23 | 條寬 64 | 不適用 | 不適用 | 不適用 | 不適用 | 不適用 |
| G24 | 圖 `display:none`，只留資料表 | 不適用 | 不印 | 不放 | 不另加 | 無 |

### 4.7 testid 與 labels 錨點

命名規則（D-V4-25）：區塊 `chart-{page}-{id}`；柱、點、段、格、sparkline `chart-{page}-{id}-{bar|point|seg|cell|spark}-{語意 key}`，key 用欄位名、通路代碼、SKU、日期、規則代號等語意值，**不用陣列索引**；資料表 `chart-{page}-{id}-table`；`{page}` 取 overview、diagnosis、products、scenarios、actions、meeting、data、import、evidence。既有 12 個圖表 testid（`bridge-section`、`bridge-waterfall`、`bridge-table`、`bridge-balance-check`、`profit-waterfall`、`profit-waterfall-scope`、`profit-waterfall-bar-{metric}`、`trend`、`trend-legend-yoy`、`trend-yoy-note`、`trend-events`、`channel-mix`）與 `kpi-target-*` 不改。

| 代號 | 區塊 testid | 柱、點、段、格 testid | 資料表 testid | labels 錨點 |
|---|---|---|---|---|
| G1 | 既有 `bridge-section`、`bridge-waterfall`、`bridge-table`、`bridge-balance-check` | 既有 | 既有 | 既有 `overview.bridgeV3.*` 不改；新字串 `overview.chartsV4.bridge.*` |
| G2 | 既有 `profit-waterfall`、`profit-waterfall-scope` | 既有 `profit-waterfall-bar-{metric}` | 既有 | `overview.chartsV4.profit.*` |
| G3 | 既有 `trend`、`trend-legend-yoy`、`trend-yoy-note`、`trend-events` | 既有 `chart-point-hit`（class） | 既有 | 預計 0 個新 key（沿用 `overview.trendV3`） |
| G4 | 既有 `channel-mix` | 既有 `chart-bar-link`（class）；差額條 `chart-overview-channels-bar-{channel}` | 既有 | `overview.chartsV4.channels.*` |
| G5 | 既有 `kpi-target-*` | MER 列 `chart-overview-bullet-bar-mer` | 無 | `overview.chartsV4.bullet.*` |
| G6 | 共用 `bridge-table` | `chart-overview-bridge-bar-{field}`（field＝`AmountField` 鍵） | 共用 | `overview.chartsV4.bridge.*` |
| G7 | — | `chart-overview-assist-spark-{kpiId}`、`chart-diagnosis-channels-spark-{channel}`（不以 `kpi-` 開頭，避免被 `tests/e2e/keyboard-walk.spec.ts:22` 的 `[data-testid='kpi-band'] [data-testid^='kpi-']` 選到） | `chart-overview-assist-table`、`chart-diagnosis-channels-table` | `overview.chartsV4.assistSpark.*`、`diagnosis.chartsV4.channelsSpark.*` |
| G8 | `chart-overview-cumulative` | 無（Recharts 在 SSR 不輸出圖形） | `chart-overview-cumulative-table` | `overview.chartsV4.cumulative.*` |
| G9 | 共用 `diagnosis-row-*` | `chart-diagnosis-impact-bar-{rule}` | 清單本身 | `diagnosis.chartsV4.impact.*` |
| G10 | `chart-diagnosis-share` | `chart-diagnosis-share-seg-{channel}-{segment}` | `chart-diagnosis-share-table` | `diagnosis.chartsV4.share.*` |
| G11 | `chart-diagnosis-heat` | `chart-diagnosis-heat-cell-{channel}-{date}` | 區塊本身（表格模式） | `diagnosis.chartsV4.heat.*` |
| G12 | `chart-diagnosis-rates` | 無 | `chart-diagnosis-rates-table` | `diagnosis.chartsV4.rates.*` |
| G13 | `chart-products-variance` | `chart-products-variance-bar-{channel}-{sku}` | `chart-products-variance-table`；既有 `product-best` 常駐 | `products.chartsV4.variance.*` |
| G14 | `chart-products-pareto` | `chart-products-pareto-bar-{channel}-{sku}` | `chart-products-pareto-table`；既有 `product-worst` 常駐 | `products.chartsV4.pareto.*` |
| G15 | `chart-scenarios-variance`（每個 DecisionWorkbench 一份，在方案比較表所在區塊之前；頁面同時只渲染目前通路的一份，全頁唯一）；會議 `chart-meeting-scenarios` | `chart-scenarios-variance-bar-{planId}`、`chart-meeting-scenarios-bar-{planId}` | `chart-scenarios-variance-table`、`chart-meeting-scenarios-table`；既有 `scenario-comparison` 常駐 | `scenarios.chartsV4.variance.*`、`meeting.chartsV4.scenarios.*` |
| G16 | `chart-scenarios-threshold`（每個 `scenario-{n}` 容器內、`scenario-sensitivity` 的 `<details>` 內一份） | `chart-scenarios-threshold-point-{target}`、`chart-scenarios-threshold-point-{sensitivityId}` | `chart-scenarios-threshold-table` | `scenarios.chartsV4.threshold.*` |
| G17 | `chart-actions-due` | `chart-actions-due-bar-{bucket}` | 區塊本身 | `actions.chartsV4.due.*` |
| G18 | （取消） | — | — | — |
| G19 | `chart-meeting-history` | 無 | `chart-meeting-history-table`（既有 `meeting-history-kpis` 不變） | `meeting.chartsV4.history.*` |
| G20 | `chart-data-coverage` | `chart-data-coverage-seg-{file}-{channel}-{start}` | `chart-data-coverage-table` | `data.chartsV4.coverage.*` |
| G21 | `chart-data-issues` | `chart-data-issues-cell-{file}-{reason}` | 區塊本身 | `data.chartsV4.issues.*` |
| G22 | 共用既有 `reconciliation-{field}` 與前處理表 | `chart-import-reconciliation-bar-{field}`、`chart-data-preprocess-bar-{field}` | 共用 | `importWizard.chartsV4.reconciliation.*`、`data.chartsV4.preprocess.*` |
| G23 | 抽屜既有結構 | `chart-evidence-ladder-bar-{metric}` | 共用 | `evidence.chartsV4.ladder.*` |
| G24 | `chart-products-scatter` | 無 | `chart-products-scatter-table` | `products.chartsV4.scatter.*` |
| 共通 | — | — | — | `shell.chartsV4.common.*`（圖例名、資料待補、不適用、另 n 項、超出範圍、未滿 7 天、無列；資料表 summary 沿用 `labels.overview.page.dataTable`「表格 · {title}」以 `fill` 組出，不另立）；`exports.chartsV4.*`（工作表名、PPT 圖標題、PDF 圖說） |

---

## 5 各頁需求（由上到下；高度預算以 1440×1000 與 390×844 的 CSS px）

「實測」是 v3.0.0 的值（`verification/revamp-v3-V3-10-acceptance.md:46`）；「預算」是設計上限，V4-0a 在 `metrics.spec` v4 設定檔量出 v3 基準（含 v3 沒量過的 1280），各批不得退步。

### 5.1 經營總覽

| 順序 | 區塊 | 1440 | 390 | 變更 |
|---|---|---|---|---|
| 1 | 頁首與期間列 | 不變 | 不變 | 無 |
| 2 | 本期一句話 | 頂 ≤ 192（實測 192）；1280 不晚於 V4-0a 實測 | 頂 ≤ 116（實測 116） | 無 |
| 3 | KPI 帶（G5 既有細條） | 底 ≤ 420（實測 419；1440 與 1280 硬斷言） | 扣廣告後貢獻值頂 ≤ 295（實測 295）；KPI 帶底不晚於實測 555 | G5 改用 C18 共用元件與 `--chart-target`，外觀與高度不變；**不加 sparkline**（D-V4-6） |
| 4 | 本期三件事 | 首列底 ≤ 561（實測 561）；1280 不晚於 V4-0a 實測（依截圖約 583） | 首列底 ≤ 807（實測 807） | 無 |
| 5 | 貢獻變化拆解：ChartFrame（G1）＋`aside` 橋接表（含 G6）；`unitNote` 承接既有 `.unit-note` | `.chart-frame` 頂 ≤ 900 且不晚於 V4-0a 實測；左欄圖 lg 320，右欄橋接表與圖頂對齊（沿用 `.bridge-grid` 7fr／5fr） | 橋接表在前（DOM 順序），瀑布在後，`.chart-frame.waterfall` 內水平捲動 | 搬框、G6（≤ 767px，依 D-V4-33）；不加 takeaway（上期、本期已在橋接表首尾列） |
| 6 | 本期利潤結構（G2） | lg 320＋標題列 | 水平捲動（既有） | 搬框 |
| 7 | `.pair`：G3、G4 | 各 sm 180，兩框等高 | 單欄 | G3 刻度；G4 差額條 |
| 8 | 其他常用指標表（G7a、G5 MER 列） | 列高不變（sparkline 高 16 放在列內） | 清單式，sparkline 在主行右側 | G7a；損益兩平 MER 列加 bullet |
| 9 | 進階 `<details>`：期間合計與日均、管理損益表、G8 | 收合 40 | 收合 40 | G8（P2，V4-10），收合時保持掛載 |

### 5.2 通路健檢

| 順序 | 區塊 | 1440 | 390 | 變更 |
|---|---|---|---|---|
| 1 | 頁首與計數 | 不變 | 不變 | 無 |
| 2 | 健檢結果清單 | 首列底不晚於 V4-0 實測（鍵盤里程碑 `diagnosis-row-*` 不變） | 同 | G9 內嵌影響條，列高不變 |
| 3 | G10 每 100 元淨營收去向 | 通路 ≤ 5 用 sm 180、6 到 8 用 lg 320（每列 24，含合計列與軸列，§4.4）；> 8 只留表 | 只標「剩／虧」 | 新增 |
| 4 | G11 日 × 通路月曆熱表（通路 ≤ 8） | lg 320 表格模式；格寬 44（≥ 1280）；42 天＝6 週 × 32，1440 與 1280 兩通路並排時不需捲動；一列放不下全部通路時框內垂直捲動，標題所指的通路排第一張 | 各通路上下堆疊，表寬 320（實際內寬約 324）；兩張以上在框內垂直捲動，副標註明 | 新增 |
| 5 | `<details>`「五項比率走勢」（G12） | 收合 40；展開時一列 5 張 sm 180 | 單欄列出 5 張，框高 sm × 5 | 新增，保持掛載 |
| 6 | 通路寬表（G7b）＋`<details>`「各通路每週」 | 列高不變 | 清單式（既有） | G7b |
| 7 | AI 收合 | 不變 | 不變 | 無 |

主層常駐獨立圖 2 張（G10、G11），G12 在 `<details>` 內不計（X37）。順序維持「清單先、圖在後」，不用 CSS `order` 讓視覺與 Tab 順序分歧。

### 5.3 商品毛利

| 順序 | 區塊 | 1440 | 390 | 變更 |
|---|---|---|---|---|
| 1 | 工具列（密度、更多欄位、匯出） | 不變 | 換行（既有） | 無 |
| 2 | `.pair`：第一格在有商品毛利為負時是 G14 商品毛利為負的商品累計（`after`＝`product-worst`），沒有時是 v3 原樣的 `product-worst` 表（示範資料是這種）；第二格 G13 毛利兩期差額（`after`＝`product-best`） | 各 sm 180＋前 10 名表，兩格等高 | 單欄；G13 兩欄改上下 | 新增；兩張前 10 名表常駐、DOM 不變，鍵盤里程碑 `product-worst` 仍在第一個圖的資料表 summary 之前 |
| 3 | 完整表 `product-table` | 不變 | 清單式（既有） | 無 |
| 4 | 進階 `<details>`：G24 | 收合 | 只留資料表 | P2 |

### 5.4 假設試算

| 順序 | 區塊 | 1440 | 390 | 變更 |
|---|---|---|---|---|
| 1 | 頁首、本期基準 | 不變 | 不變 | 無 |
| 2 | 方案欄 ≤ 3（每欄的「要賣到多少才划算」`<details>`，`scenario-sensitivity`，含門檻說明、G16 與三個假設表；`src/components/decision-workbench.tsx:344` 在 `article.scenario-card` 內渲染） | 不變；G16 sm 180 | 維持 | G16 新增於每欄的 `<details>` 內 |
| 3 | G15 方案差額（方案比較表所在區塊之前，每個 DecisionWorkbench 一份；`scenario-{n}` 是方案欄，不放圖） | sm 180；頂不晚於 V4-0a 量到的方案比較表區塊頂＋24px（B1） | 每列一根 | 新增 |
| 4 | 方案比較表（`section.scenario-compare`，`decision-workbench.tsx:352`） | 不變 | 不變 | 無 |
| 5 | 其他通路方案、之前的試算 | 不變 | 不變 | 無 |

圖內沒有可聚焦元素，資料表 summary 放在第一個結果之後：「載入示範資料到第一個結果」的鍵盤步數不得增加（D-V3-27 現況）。

### 5.5 待辦

頁首計數徽章之下放 G17（4 列小表，約 150；P2，V4-10）；看板、清單、編輯抽屜不變；看板鍵盤流程不變。

### 5.6 會議紀錄

| 順序 | 區塊 | 變更 |
|---|---|---|
| 1 | 標題、決議 | 無 |
| 2 | 議程 1 關鍵數字、議程 2 本期重點 | 無（投影只顯示這兩段，維持） |
| 3 | 議程 3、4 | 無 |
| 4 | 議程 5 方案 | 既有方案表上方加 G15 第二實例（`chart-meeting-scenarios`，sm 180） |
| 5 | 議程 6、備註 | 無 |
| 6 | 與上次比較 | 無（G18 取消） |
| 7 | 會議歷史 | 歷史 KPI 列上方加 G19（C26 兩張小倍數，sm 180） |

### 5.7 資料來源與匯入精靈

| 位置 | 順序 | 區塊 | 1440 | 390 | 變更 |
|---|---|---|---|---|---|
| 資料來源頁 | 1 | 狀態列 | 不變 | 不變 | 無 |
| | 2 | G20 涵蓋時間軸 | sm 180（4 軌 × 24＋日期軸） | 軌垂直堆疊、月份刻度減半 | 新增 |
| | 3 | 資料問題：區塊標題之下、問題表工具列之上放 G21（0 筆問題時不渲染；D-V4-54＝A，與 CHART_CATALOG G21、H5 設計稿一致） | 列數＝檔案數＋範圍級 1 列 | 清單式 | 新增 |
| | 4 | 問題表、範圍與金額基準、前處理表（G22）、選填資料、預覽、版本、範本 | 不變 | 不變 | G22 |
| 匯入精靈 | 步驟 4 | 對帳表（G22） | 列高不變 | 不變 | G22；stepper 與匯入路徑點擊數不變 |

### 5.8 計算與來源抽屜

大數字、精確值（標題下一行到分）、階梯表（G23）、組成表、篩選片語（新增日期與 SKU 片語）、原始明細；抽屜寬度與高度規則不變；抽屜內不加獨立圖。新算出的衍生值在「計算方式」段顯示 `formula`、`components` 與版本常數；累計、費用合計這類水準值的大數字不帶正負號（`valueKind`）；經整理函式排列的 domain 值另列整理函式版本（`arrangeVersion`）。

### 5.9 投影模式

- 白名單（`src/app/globals.css:2563` 的 `:not(...)`）加 `.bridge-section`；投影中**只顯示瀑布**（柱上標值是 L1），拆解區改單欄；橋接表（`.bridge-table-wrap`，L3，含 G6）、v2 四欄 `<details>` 與 `.data-alternative` 隱藏但掛載（v3 §9.7 與本文 §7.7：投影只顯示 L1；X39 只要求瀑布可見；D-V4-8）。
- `--text-12` 與 `--text-13` 在投影都對應 14px（D-V4-9；只改 12 時，圖表副標 13px 會比軸標小），只重新對應既有 token 的值，不新增字級種類；其餘新圖隱藏但掛載（M1）。
- 會議頁維持只顯示議程 1–2；投影只在總覽與會議（D-V4-8）。D-V3-33、D-V3-34 只有在使用者回覆後才在 V4-8 一併處理。
- `tests/present-mode.test.tsx` 解析 C 區段的斷言同批更新。

### 5.10 匯出（變體矩陣；匯出內容規則寫進 `ExportVariantSpec` 新增的 `charts` 欄位）

| 格式 | 老闆版 | 標準版 | 客戶版 |
|---|---|---|---|
| PDF（C31，inline SVG 固定 170mm） | **維持 1 頁**：關鍵數字之下放 G1 瀑布（高 ≤ 60mm） | 本文放 G1；D-V4-11 選 B 時，附錄可多 1 頁放 G2 與兩張圖的資料表 | 同標準版 |
| PPT（C32，16:9） | 依 D-V4-34：建議 A，既有第一張（一句話、KPI、三件事、決議，`src/application/pptx-export.ts:386-424`）一個區塊都不動，新增第二張放 G1 原生瀑布（D-V4-10）與單位、期間；選 B 時維持單張，須寫明縮排規則並證明既有區塊全部保留 | 同老闆版：第一張的 KPI、三件事、通路表（≤ 4 列）、決議、置頂待辦（`pptx-export.ts:333-369`，已排到內容區底 `PAGE_BODY_BOTTOM`＝5.18 英吋，`:218`）不動，瀑布在第二張 | 同標準版 |
| Excel（C34） | 不加工作表（維持 2 張） | 新增「圖表資料」工作表，每張圖一段：標題列＝結論句、欄序＝該圖資料表、段末一列「版本與算法」（例如 `channel-structure-v1`、`product-pareto-v1`；A 級段寫 `contribution-v1`）；技術工作表（basis 工作表，`src/application/excel-export.ts:275-288` 的 `technical(...)`）另列出本次用到的每個 B 級版本常數（D-V4-12）。G15、G16 不放（Excel 匯出的輸入沒有試算資料） | 新增「圖表資料」工作表，段落與數字同標準版，但不放「版本與算法」列；技術工作表本來就不輸出（`spec.appendix.technical` 為 false，`src/application/export-variants.ts`；v3 F14：客戶報告版拿掉技術細節，版本字串只在版頭第 4 行） |
| Markdown | 一頁摘要沒有版本之分（`src/application/export-variants.ts:19`：變體只管列印／PDF、Excel、PPT），不論選哪一版都加九項差額表（正規化排除） | 同左 | 同左 |
| CSV、JSON | 不變（D-V4-13：D-V3-36 拍板前不新增 `row_type=daily` 與週列 `channel` 欄；v3 §9.6 規定 CSV、JSON 不套視覺） | 不變 | 不變 |

共同：PDF 一律灰階，填色走 `export-theme.ts`：起訖與小計＝淺灰底（`paper`）加 0.5pt `ink` 外框、有利＝`chartFavorable`（gray-400）實心、不利＝`ink`（gray-900）實心；三者兩兩不同（`tests/export-theme.test.ts` 斷言；`chartTotal` 與 `chartSeg1` 都是 gray-700，用它們畫小計與不利時黑白列印分不出來），柱值帶「−」或「+」；圖例用 SVG 線段（列印會清掉 `background`）；PPT 不用任何圖片 API，`ppt/media/` 必須為空；三個變體的數字逐格相同；`network-log.spec` 的下載集合不變。

---

## 6 元件規格、application 函式與 token

元件與第一個使用它的頁面同批交付（不在早期批次先做一堆沒人用的元件）。所有元件：色只經 `chartColors`、字級只用 `chartFontSize`、高只用 `chartHeights`；可點圖形一定有對應的表格 number-link；圖本身 `aria-hidden`；SSR 可渲染的元件（inline SVG）每根柱、每個點都輸出 testid。

### 6.1 C16 ChartFrame 擴充（`src/components/overview/charts/chart-frame.tsx`，API 向下相容）

| 新增或調整 | 說明 |
|---|---|
| `aside?: ReactNode` | 圖旁欄。寬螢幕兩欄 7fr／5fr（沿用 `.bridge-grid` 的比例與斷點，`src/app/globals.css:1280`），窄螢幕下移。DOM 順序 `aside` 在前、圖在後，寬螢幕用 `grid-template-areas` 放回右欄，所以 390 不需要 CSS `order`。`aside` 在 `aria-hidden` 容器之外。G1 的橋接表（含 G6）放在這裡，外層沿用 `.bridge-table-wrap`（投影只隱藏它），不放 `after`（`after` 會排在圖下方） |
| `unitNote?: string` | 標題列右側的單位註記，承接 `bridge-section` 既有的 `.unit-note` |
| `frameClassName?: string` | 加在固定高容器上，例如 G1、G2 的 `waterfall`，讓容器成為 `.chart-frame.lg.waterfall`（沿用 `globals.css:1285` 的水平捲動）；C17 同批加 `bare` 參數，不再自己輸出 `.chart-frame.waterfall` 外框，確保每張圖只有一個 `.chart-frame`；C26（G12、G19）傳 `multiples`，≤ 767px 時框高改為 `chartHeights.sm` × 子圖數（§6.3 C26） |
| `legend[].shape?: "line" \| "dash" \| "tick" \| "ring" \| "rect"` | 預設 line（12×2 線段）；dash 虛線段（既有 `dash` 欄位保留）；tick 目標刻度 2×12；ring 空心圓、rect 空心矩形（只給圖內也用同形空心記號的圖，例如 G10 的剩餘段）。不得有實心圓點或方塊（X32） |
| `mode?: "chart" \| "table"` | table 模式給熱表（G11、G21）：固定高容器不設 `aria-hidden`，內含 `.table-scroll[role=region][aria-labelledby]`（表內有可聚焦元素時不加 `tabindex`，可聚焦的格已滿足 axe `scrollable-region-focusable`；G11 用 grid 型 roving tabindex，整張熱表 1 個停留點；G21 每格是按鈕；表內沒有可聚焦元素時才加 `tabindex=0`）；不要求 `dataTable`（表本身就是資料表）。熱表格子有 number-link，若放在 `aria-hidden` 容器內會觸發 axe `aria-hidden-focus`（serious），所以只能用這個模式 |
| `page?: string` | 與 `id` 組成預設 `testId="chart-{page}-{id}"`；既有圖繼續傳明確的 `testId` |
| `variant?: "panel" \| "inline"` | 預設 panel（`section.panel.chart-section`，既有外觀）。inline 輸出 `section.chart-section.is-inline`（無 `.panel` 外框），給放在既有 `.panel`、方案欄 `article.scenario-card` 或會議議程項內的圖：G15 會議實例、G16、G19、G21。避免 panel 套 panel（`nestedCardSelectors` 上限 0、v3 X8）；結構（標題、副標、固定高容器、資料表）與 panel 相同 |
| `headingLevel?: 2 \| 3 \| 4` | 預設 2（既有）。依所在位置選層級，避免標題跳級：商品頁 G13、G14 在 `h3#product-highlights-heading` 之下用 4；G16 在方案欄內用 4；G15 會議實例在議程項 `h3` 之下用 4；G19 在 `h2#meeting-history-title` 之下用 3；G21 在 `h2#quality-heading` 之下用 3 |
| `dataTable` | 新圖一律傳 C33 產生的內容；既有圖的 `{summary, content}` 介面不變；展開時記 `chart_table_opened` |
| G1、G2 搬框 | `className` 保留 `bridge-section`、`profit-section`（投影白名單 `globals.css:2563` 依賴這兩個 class）；`id` 沿用 `bridge`、`profit`，`#bridge-title`、`#bridge-sub` 等既有 id 不變；既有 testid、`.bridge-total`、`bridge-balance-check` 不變；分段按鈕走 `extra` |
| 不加 | 數字高度（只用 sm／lg／xs）；`print`（列印走 C31）；圖例位置參數（維持標題列右側，D-V4-30） |

### 6.2 既有元件升級（沿用 v3 代號）

| 代號 | 元件 | v4 變更 | 用在 |
|---|---|---|---|
| C17 | 瀑布（`waterfall-svg.tsx`） | 加 `bare`；刻度改呼叫 `formatAxisWan`；幾何純函式 `waterfallGeometry` 供 C31 共用 | G1、G2、PDF |
| C18 | 目標細條 | 從 KPI 帶的 `.kpi-bullet` 抽成共用 `Bullet`：`actual`、`target`、`favorableDirection`、`testId`；6px 細條、寬度＝達成率夾在 0 到 1（v3 畫法，`overview.tsx:49`）、目標刻度 2×12 `--chart-target` 固定在右端、落後用不利色；`aria-hidden`，旁邊文字由呼叫端給；`kpi-target-*` 的 DOM 與 testid 不變 | G5 |
| C19 | Sparkline（F17，v3 有規格未實作；`src/components/charts/sparkline.tsx`） | inline SVG 16×64（`--chart-h-xs`）；`sparklineGeometry(points)` 純函式；線 `chartColors.total` 1.5px、最後一點 3px `chartColors.current`；未滿 7 天的點空心；null 斷線；無軸無框；根 svg `aria-hidden` 並帶 `data-chart-kind="spark"`（CL-1、CL-11 用這個標記辨識）；testId 必填；SSR 可渲染 | G7 |

### 6.3 新元件 C24–C35

新元件的檔案一律放 `src/components/charts/`：C19 `sparkline.tsx`、C24 `bar-cell.tsx`、C25 `ranked-bars.tsx`、C26 `small-multiples.tsx`、C27 `share-stack.tsx`、C28 `heat-table.tsx`、C29 `threshold-line.tsx`、C30 `timeline.tsx`、C31 `print-chart.tsx`、C33 `chart-data-table.tsx`、C35 `dumbbell.tsx`、G24 `products-scatter-lazy.tsx`；C16、C17、C18 留在 `src/components/overview/charts/`；C32、C34 是 `src/application` 的函式。chart-scan 的 AST 掃描範圍就是這兩個元件目錄（§7.9）。

| 代號 | 元件 | 技術 | 規格 | 用在 |
|---|---|---|---|---|
| C24 | BarCell 表格內嵌條 | inline SVG，放在既有 `<td>` 或清單列內 | 高 6px（`chartRowHeights.cell`）、最大寬 96px（390 時 64px），零線 1px `--chart-axis`；模式：variance（共用零線，負往左、正往右）、share（0 到 100%）、pair（上 4px、下 6px 成對）、count（從 0 計數）；可加 tick（目標或門檻刻度）；比例由父表用精確字串以 `Decimal` 算出（`barCellGeometry` 純函式），只用於長度；表格 DOM、testid、number-link 不變；根 svg 帶 `aria-hidden` 與 `data-chart-kind="cell"`；只能出現在 `<table>` 或清單列內且同列有對應數字（CL-1 以 `data-chart-kind` 辨識，不看 testid 片段） | G4、G6、G9、G17、G22、G23 |
| C25 | RankedBars 水平長條 | inline SVG（SSR 會輸出每根柱與 testid，不用 Recharts） | 模式：variance（從 0 雙向）、ranked（單向排序）、pareto（排序加右側累計佔比標值）；`rows: {key, label, value, tone, display, evidence}`；列高 `chartRowHeights.row16` 或 `row24`，每張圖的（列數＋軸或「另 n 個」列）× 列高 ≤ 所在 ChartFrame 的固定高（G13、G14、G15 的列數上限見 §4.4，`tests/chart-geometry-v4.test.ts` 斷言）；標值在末端，避讓沿用瀑布的作法；`hbarGeometry(rows, width, mode)` 純函式；量寬用 ResizeObserver，SSR 寬 560；柱點擊呼叫 `onBarClick(row.evidence)` | G13、G14、G15 |
| C26 | SmallMultiples 小倍數 | 單一 ChartFrame 內的 CSS grid＋Recharts LineChart | 子圖用小標區分，**不再套 `section.panel`**（`nestedCardSelectors` 上限 0、X8）；同一指標的子圖共用 domain、不同指標的子圖各自 domain（`axisTicks`；比率範圍 ≥ 10 個百分點取整到 5，否則取整到 1；G12 五個比率各自、G19 淨營收與扣廣告後貢獻各自），子圖小標寫指標名；一列 ≤ 5；子圖全部放在 ChartFrame 的 `aria-hidden` 容器內，所以容器內不放任何收合或按鈕（不設「更多指標」）；390 單欄列出全部子圖，固定高容器以 `frameClassName="multiples"` 在 ≤ 767px 改為 `chartHeights.sm` × 子圖數（G12 為 5、G19 為 2；由元件以 `chartHeights.sm * count` 給值，不寫數字常值；CL-10 允許 `chartHeights` 的整數倍），≥ 768 維持 sm；`tests/chart-frame-v4.test.tsx` 斷言兩種寬度的框高；子圖數不隨期間改變，B4 照常比較 | G12、G19 |
| C27 | ShareStack 每 100 元去向 | inline SVG（Recharts `stackOffset="expand"` 不支援負值，不用） | 每通路一列，列高 `chartRowHeights.row24`，svg 高＝（通路數＋合計＋軸列）× `row24`，通路 ≤ 5 放 sm、6 到 8 放 lg、> 8 不畫（§4.4 G10）；x 0 到 max(100, 最大扣項合計)；三段灰階＋空心剩餘；超過 100 的部分塗 `--chart-unfavorable`；100 參考線；段間 1px `chartColors.surface`；`applicable=false` 的通路畫文字列「不適用」；`shareStackGeometry` 純函式 | G10 |
| C28 | HeatTable 熱表 | 原生 `<table>`，放在 ChartFrame `mode="table"` 內 | calendar 排法：每通路一張表，列＝snapshot 週、欄＝該週第 1 到 7 天（欄頭標星期），`caption` 寫通路與單位，`th scope` 齊全，格內用 `formatHeatCell`，整張熱表用 grid 型 roving tabindex（表格加 `role="grid"`；1 個 Tab 停留點、方向鍵移動、Enter 開抽屜）；matrix 排法：列＝檔案、欄＝原因；格 `data-tier="0｜1｜2｜missing"`，底色只用 `--chart-heat-1`、`--chart-heat-2`，階 2 另加 2px `--chart-unfavorable` 框線；格內永遠有數字、「資料待補」或留白（0 格）；數字是 number-link 或篩選按鈕；超過容器高度時框內垂直捲動；390 calendar 上下堆疊、matrix 改清單式 | G11、G21 |
| C29 | ThresholdLine 門檻點與連線 | inline SVG | 輸入：範圍內的既有點 `{v, y, kind: threshold｜user, id}`、L＝0 旗標、超界清單、stale 旗標；x 固定 [−90%, +100%]；依 D-V4-20：建議 A′ 只畫點；選 A 時才依 v 排序連線、不延伸到點之外、圖下標示 `scenario-sensitivity-v1`；不外插、端點不標值；門檻點空心 `chartColors.target`、使用者點實心 `chartColors.total`；`thresholdGeometry` 純函式；退回規則見 §4.3 G16 | G16 |
| C30 | Timeline 涵蓋時間軸 | inline SVG | 軌 ≤ 4（銷售、通路費用、廣告、檔期）；區段 `{start, end, kind: rows｜missing｜band｜yoy｜event}`；月份刻度；缺列虛線框；去年同期畫成時間軸上方 1px 細線加文字；每軌 `chartRowHeights.row24`；`timelineGeometry` 純函式；390 垂直堆疊 | G20 |
| C31 | PrintChart 列印用圖 | inline SVG，固定寬 170mm（viewBox 640），不用 ResponsiveContainer | 只接 C17 的瀑布幾何（G1、G2）；灰階，填色走 `export-theme.ts`（起訖與小計淺灰底加 `ink` 外框、有利 `chartFavorable`、不利 `ink` 實心加「−」）；0.5pt 框線；圖例用 SVG 線段；`data-print-chart="{id}"` 供 E2E 計數；放在 `PrintSummary` 內 | PDF |
| C32 | pptChart PPT 圖表包裝 | `src/application/pptx-export.ts` 內的函式 | 型別只允許 `bar`、`line`；G1 瀑布用堆疊長條四個系列：透明底段（無填色、無框線）、起訖與小計、有利差額、不利差額，每個系列一色；有利、不利兩個系列存的是柱高（絕對值），系列名也要標明（例如「不利差額（絕對值，圖形用）」），資料標籤用帶「−」的數字格式顯示原本的正負號（PowerPoint「編輯資料」裡商品成本那一列是 1,575,080.55，橋接表是 −1,575,080.55）（pptxgenjs 4.0.1 的逐點色與 `invertedColors` 只在單一系列時生效，`node_modules/pptxgenjs/dist/pptxgen.es.js:3726-3731`）；跨 0 的柱拆成正負兩段；`valAxisMinVal`／`valAxisMaxVal` 由 `axisTicks` 依資料決定（含 0，不固定為 0，負柱不被切掉）；色只來自 `EXPORT_THEME`；`showLegend:false`；資料標籤與資料表逐格相同；輔助系列（透明底段、跨 0 拆開的段）會出現在 PowerPoint「編輯資料」的內嵌活頁簿，系列名用 `exports.chartsV4.*` 寫明「圖形用，非金額」，數值由 `bridgeWaterfall().bars` 的起點、終點精確字串換算，不用浮點累加；V4-0b 先做 spike（只驗 XML 與內嵌資料，不接線），不成立（含輔助系列無法命名）時依 D-V4-10 改 `addShape` 矩形 | PPT |
| C33 | ChartDataTable 資料表產生器 | React | 輸入 `columns`（label、unit、layer）、`rows`、`evidenceOf(row, col)`；輸出 `.table-scroll[role=region] > table`；`caption` 帶單位；數字欄右對齊、tabular、U+2212；數字格是 number-link，呼叫和圖上點擊相同的 builder；每張新圖的 `<details class="data-alternative">` 都由它產生；V4-2 隨 G7a 交付（V4-1 的 G1、G2 沿用既有表，G6 共用橋接表，都不用它） | 全部新圖 |
| C34 | chartDataSheet「圖表資料」工作表 | `src/application/excel-export.ts` | 每張圖一段：標題列＝結論句、欄序＝C33 的欄、段末一列「版本與算法」；技術工作表列出本次用到的 B 級版本常數；`s`／`n` 儲存格與既有數字格式；`ExcelSheetKey` 加 `chartData`，只在標準與客戶版；工作表名在 `exports.chartsV4.*` | Excel |
| C35 | Dumbbell 啞鈴（只在 D-V4-16 選 B 時做） | inline SVG | 列高 28；上期空心圓 r4（stroke 1.5 `--chart-previous`、fill `chartColors.surface`）、本期實心圓 r4（`--chart-current`，負值 `--chart-unfavorable`）、連線 1.5px；x 含 0；右端標本期 L1 與差額；兩點重疊時只畫實心並標「持平」；最小寬 360；同批改 `tests/e2e/trend-yoy.spec.ts:200` 的 `path.chart-bar-link` 定位器 | G4 |

### 6.4 application 函式與檔案對照（全部純函式、可序列化；B 級各有版本常數與手算 golden）

| 函式 | 檔案 | 等級／版本常數 | 對應 | 必要測試 |
|---|---|---|---|---|
| `channelStructure(snapshot, period)` | `src/application/chart-structure.ts` | B／`CHANNEL_STRUCTURE_VERSION="channel-structure-v1"`（只涵蓋四項費用合計與超過 100 的幾何；各通路的剩與段比率呼叫 `profitWaterfall(snapshot, channel)`，A 級） | G10 | 七段恆等（golden、demo）；每通路的剩＝`profitWaterfall(snapshot, channel).perHundred`、段比率＝`rows[].share`（逐字相同）；合計＝`perHundred`；golden MARKETPLACE −15.00 超過 100；`refund_only` 不適用；`zero_ad` |
| `dailyHeatmap(snapshot, metric)` | `chart-heatmap.ts` | B／`daily-heatmap-v1` | G11 | 逐日加總＝通路期間合計；分階與同值排序；null 不排名；> 92 天改週 |
| `cumulativeDaily(snapshot, metric)` | `chart-cumulative.ts` | B／`cumulative-daily-v1` | G8 | 兩期末日累計各＝該期合計（示範本期 1,269,792.73、上期 1,868,626.68；golden 兩期各 1 天，255.00 只是恆等）；合成資料逐日手算前 3 天；交叉日規則（§4.2）；null 後斷線；兩期天數不同 |
| `periodDailyMetrics(periodReport)`（由 `dayColumns` 抽出並匯出） | `pnl-table.ts` | A（邏輯不改） | G8 | `dayColumns` 改呼叫它之後 `buildPnlTable(snapshot, "day")` 輸出不變（`tests/pnl-table.test.ts` 不改且通過）；對 `report.previous` 也能用 |
| `productPareto(rows, metric, limit)` | `chart-pareto.ts` | B／`product-pareto-v1` | G14 | 末筆累計＝負值合計；末筆累計佔比＝100%（取反後 `ratioMetric`）；`refund_only` 1 筆 −60.00；合成資料多筆；無負值回傳 `count=0` |
| `channelWeeks(snapshot)`（V4-3a 起；原規劃 `channelWeeks(dataset, scope)`，不放進 `createSnapshot`；健檢頁元件內 `useMemo`，Excel 匯出時自行呼叫） | `chart-channel-weeks.ts` | B／`channel-weeks-v1` | G7b、G11（> 92 天） | 逐週加總＝通路期間合計；呼叫次數＝通路數 × 週數；通路 > 8 時不呼叫（spy 斷言）；`createSnapshot` 輸出沒有 `channelWeeks`；用程式產生的合成資料（50 通路 × 92 天，在記憶體中組成，不寫檔）斷言健檢頁 SSR 不輸出 G7b、G11 的格與 sparkline、G10 為 `state="empty"` |
| `assistWeeks(snapshot)`；`weeklyRows` 多帶 `units_sold` | `chart-assist-weeks.ts`、`workspace.ts` | B／`assist-weeks-v1` | G7a | 逐週件數加總＝期間件數；件均與 `netRevenuePerUnit` 一致；既有 `assist-kpi-v1` 測試不動 |
| `meetingSeries(history)` | `chart-meeting.ts` | B／`meeting-series-v1` | G19 | 斷段：資料集、通路集合、本期天數、比較方式；同本期重複會議只留最新；< 2 筆 |
| `coverageTimeline(dataset, events, yoy?)` | `chart-coverage.ts` | B／`coverage-timeline-v1` | G20 | 缺列天數＝問題筆數；範圍級退回 |
| `issueDistribution(issues)` | `chart-issues.ts` | B／`issue-distribution-v1` | G21 | 格加總＝列級問題筆數 |
| `actionDueBuckets(workspace, today)` | `chart-actions.ts` | B／`action-due-buckets-v1` | G17 | 四格加總＝未完成待辦數；台北日期邊界 |
| `thresholdPoints(analysis, sensitivity)` | `chart-threshold.ts` | A（只組既有點）；D-V4-20 選 B 時改為 `thresholdLine`／`threshold-line-v1` | G16 | 範圍 [−90%, +100%]；L＝0；超界；stale；三點未填 |
| `ladderMetrics`（V4-3a 修正、V4-7b 搬移並匯出） | V4-3a 在 `evidence-drawer.tsx`；V4-7b 搬到 `evidence-ladder.ts` | A。V4-3a 修正：週與去年同期的查找只在 `evidence.channels` 等於 `report.scope.channels` 時成立，否則回傳 null（現行 `evidence-drawer.tsx:94` 找週時不比對通路，單一通路的週證據會畫出全部通路的階梯，最後一週只有 1 天時單日證據也會碰到）；V4-7b 只搬移、邏輯不再改 | G7b、G11、G23 | V4-3a：單一通路的週與日證據不畫全通路階梯（SSR）；V4-7b：搬移前後輸出相同 |
| `isFullWeek`（改為匯出；目前是 `chart-takeaways.ts:53` 的模組內常數） | `chart-takeaways.ts` | 呈現（邏輯不改） | G7、G12、X40 | `chart-takeaways.test` 既有斷言不變 |
| 商品抽屜 builder（`productEvidence`、`productDeltaEvidence`，由 `product-comparison-panel.tsx` 的 `metricLink`、`deltaLink` 閉包抽出，只搬移） | `src/components/product-evidence.ts` | 呈現（邏輯不改） | G13、G14、`product-worst`、`product-best` | 抽出前後 `EvidenceSelection` 相同 |
| `IssueList` 加選填 `filter`（檔案、通路、原因碼）與清除鈕；只過濾畫面列，「下載問題清單 CSV」仍是全部問題 | `src/components/issue-list.tsx` | 呈現 | G20、G21 | 篩選後列數＝符合條件的問題數；下載內容不變 |
| `formatAxisWan(ticks, step)` | `presentation.ts` | 呈現 | G1–G4、G8、G16、G19 | 整數萬；0 寫「0」；U+2212；「萬」取自 `labels.format.units.wan`；步長不是整萬時保留 1 或 2 位（沿用 `waterfall-svg.tsx:89` 的 `waterfallTickLabels`，該函式改呼叫它） |
| `EvidenceFilter` 加 `date`、`sku` | `evidence-filter.ts` | 篩選，不重算 | G8、G11、G13、G14、G24 | 單日、通路加單日、SKU；manifest 列保留；`sku` 條件下沒有 sku 欄位的列（通路費用、廣告）一律不列入（AGENTS.md：SKU 篩選不可帶入全通路費用產生假貢獻）；`filter.sku` 只能和商品層證據（`evidence.sku`）一起用，非商品層證據帶 `filter.sku` 時視為錯誤（測試斷言）；`tests/evidence-filter.test.ts` 加對應斷言 |
| `EvidenceSelection` 加 `valueKind?: "level" \| "change"`（未給時沿用現況：有 `components` 視為 change）與 `arrangeVersion?: string`；抽屜大數字、精確值的正負號與取位說明只看 `valueKind`；技術細節在 `metric_version` 之後另列一行整理函式版本（只在有給時） | `evidence-drawer.tsx`（`arrangeVersion` 於 V4-2、`valueKind` 於 V4-3a） | 呈現 | G7、G8、G10、G11、G14 | SSR：G8、G10、G14 的抽屜大數字不帶「+」；G10 費用合計的技術細節不出現 `platform_fees` 的公式、`metric_version` 顯示 `channel-structure-v1`；直接取自 domain 的值 `metric_version` 仍是 `contribution-v1` |
| `formatHeatCell(value)` | `presentation.ts`（V4-3b） | 呈現 | G11 | 以萬為單位、兩位小數、不帶單位；取位到元後仍為負時保留 U+2212；0 寫「0.00」；負號判定與 L1 的「虧」一致 |
| `EXPORT_THEME` 加 `chartCurrent`、`chartPrevious`、`chartTotal`、`chartUnfavorable`、`chartFavorable`、`chartSeg1`–`chartSeg3` | `export-theme.ts` | 呈現 | C31、C32 | `tests/export-theme.test.ts` 逐一比對 `:root`；PDF 的起訖與小計、有利、不利三種填色兩兩不同 |

### 6.5 新 token（只有語意色與一個高度，不加字級）

| token | 值（`:root`） | 用途 | `contrast-check` 配對（白底 `--bg-surface`） |
|---|---|---|---|
| `--chart-target` | `var(--text-primary)` | 目標刻度、門檻點、目標線 | 非文字 15.83:1 |
| `--chart-seg-1` | `var(--gray-700)` | G10 商品成本 | 非文字 7.69:1 |
| `--chart-seg-2` | `var(--gray-500)` | G10 四項通路費用 | 非文字 5.57:1 |
| `--chart-seg-3` | `var(--gray-400)` | G10 廣告費 | 非文字 3.59:1；相鄰段之間不到 3:1（1.38、1.55），靠 1px 分隔線（D-V4-19） |
| `--chart-heat-1` | `var(--unfavorable-subtle)`（即 `--red-50`） | 熱表階 1 | 格內文字 `--text-primary` 13.97:1；底色本身對白底只有 1.13:1，所以負值資訊由格內 U+2212 承擔，底色只是輔助 |
| `--chart-heat-2` | `var(--red-100)`：在 `:root` 原始色階新增一階紅色（`hexOutsideRoot` 上限 0 只管 `:root` 以外，`:root` 內允許），值由 V4-0a 用 `contrast-check` 試算後定 | 熱表階 2 | 格內文字 `--text-primary` ≥ 4.5:1，且與 `--red-50` 肉眼可分；階 2 另有 2px `--chart-unfavorable` 框線（框線對白底 6.02:1）承擔非文字對比 |
| `--chart-missing` | `var(--gray-400)` | 新圖的資料待補虛線框 | 非文字 3.59:1（`--border-strong` 只有 2.19:1，不用）；既有瀑布的待補框外觀不改 |
| `--chart-h-xs` | `16px` | sparkline 高 | `tests/chart-theme.test.ts` 圖高比對 |

`chartColors` 加 `target`、`seg1`、`seg2`、`seg3`、`heat1`、`heat2`、`missing`；`chartHeights` 加 `xs`；另加列高常數 `chartRowHeights = { cell: 6, row16: 16, row24: 24 }`（不是 CSS token，只給依列計高的 inline SVG；C30 的日期軸高在 V4-7a 加 `axis`，C35 啞鈴只在 D-V4-16 選 B 時加 `row28`），隨 C24 第一次使用時宣告並登記到 `tests/chart-theme.test.ts`（D-V4-33 已回覆時是 V4-1 的 G6；未回覆時順延到 V4-2 的 G4 差額條）；`tests/chart-theme.test.ts` 的 KEYS 與 `scripts/contrast-check.mjs` 的 PAIRS 同批更新。token 在第一個使用它的批次宣告：`--chart-target` 於 V4-2，`--chart-seg-*` 於 V4-3a，`--chart-heat-*`、`--red-100`、`--chart-missing` 於 V4-3b，`--chart-h-xs` 於 V4-2。

---

## 7 圖表規範（v3 §9.5 的增量）與新增禁止項

### 7.1 色彩與形狀記號（IBCS 場景記號本地化）

| 語意 | token | 形狀 | 規則 |
|---|---|---|---|
| 本期 | `--chart-current` | 實心；線 2px；柱 18px；最後一點 3px 圓點 | 強調色只用在本期資料（v3 D-4，`docs/revamp-v3/01_PRD.md:307`） |
| 上期 | `--chart-previous` | 灰實心；線 1.5px；柱 8px；啞鈴用空心圓 | — |
| 去年同期 | `--chart-yoy` | 灰虛線 4 3，不畫圓點 | — |
| 目標、門檻 | `--chart-target` | 空心框或 2×12 刻度，永遠不填色 | — |
| 起訖、小計、中性量 | `--chart-total` | 實心 | 不是本期資料的序列（會議歷史線與它的最後一點、待辦計數、涵蓋有列、sparkline 線、試算的使用者點與連線）一律用它，不用強調色 |
| 不利 | `--chart-unfavorable` | 實心；標值帶「−」或方向詞 | 唯一語意色 |
| 有利 | `--chart-favorable`（灰） | 實心；標值帶「+」 | 不得用綠（D-V3-7） |
| 結構段 | `--chart-seg-1..3` | 三段灰階＋空心「剩」段，段間 1px 分隔 | 只用在 G10 |
| 熱表 | `--chart-heat-1..2` | 兩階離散，只標不利；格內永遠有數字；階 2 加框線 | 只用在 G11、G21 |
| 資料待補 | `--chart-missing` | 虛線框加「資料待補」文字 | — |
| 檔期與期間區帶 | `--chart-band` | 淡底帶 | — |
| 類別色 | `--chart-cat-1..4`＋`--chart-other` | 只在多通路同圖 | 本輪沒有圖需要 |

顏色永遠搭配形狀或文字；一張圖最多三種色（本期、上期或小計、不利），G10 例外為三灰＋空心＋不利；元件內無 hex；匯出色只在 `export-theme.ts`。

### 7.2 尺度

- 同頁同指標同尺度：總覽兩張瀑布 y 範圍相同；同一指標的小倍數共用 domain，不同指標的子圖各自（G12 五個比率、G19 兩個金額）；同一張表的內嵌條共用最大值（G9 只在差額類規則之間共用）。
- 長條、瀑布、變異、堆疊、bullet、Pareto、累計線一律含 0、不向外延伸（例外：總覽 G1、G2 共同尺度的下界需要容納負值時，可延伸一個步長，D-V4-41＝A）；折線可截斷，但軸起點標在左下且同頁同指標一致。
- 金額刻度 1／2／2.5／5 × 10ⁿ、整數萬（`formatAxisWan`）；比率軸依範圍取整（範圍 ≥ 10 個百分點時取整到 5，否則取整到 1）；每 100 元軸 0 到 max(100, 最大扣項合計)；試算圖 x 軸固定 −90% 到 +100%。
- 一張圖一個數值軸（X30）；負值水平往左、直式往下，負號 U+2212。
- 圖形座標用 `coordinate()` 的近似值；顯示與抽屜一律用 domain 的精確字串。

### 7.3 標籤與標題

- 直接標籤優先（線尾、柱端）；圖例只在無法直接標籤時用，12×2 線段，位置在標題列右側（D-V4-30）。
- 柱上與線尾標 L1；單位只標一次（`unitNote` 或軸）；字級只用 `--text-12`（`chartFontSize`）。
- 標題＝結論句（§4.0）；副標＝標準名 · 期間 · 範圍，同時是 aria 描述；需要時 takeaway 2–3 個 L1 number-link。
- 限制句（例如「實際差額，不是因果」「只呈現分布，不代表因果」）一律放在 `<details>` 資料表或抽屜，不進主層（`tests/copy-density.test.ts` 的否定句上限，B8）。
- 字串全部在 labels 的 `{group}.chartsV4.*`；避開 copy-scan 黑名單（「變化」「數據」、沒有「淨」的「營收」、「行動」等）；不用箭頭、驚嘆號、「注意：」；不用「智慧」「洞察」「一鍵」。

### 7.4 缺資料、負值與邊界

| 情況 | 規則 |
|---|---|
| 缺週或缺日 | 斷線並標「無資料」；不內插、不當 0 |
| 柱值待補 | 虛線框加「資料待補」；後面無法定位的小計不畫 |
| 分母 ≤ 0 | 寫「不適用」 |
| 真正的 0 | 畫 0 並標「0」 |
| 最後一週未滿 7 天 | 金額與件數序列畫空心點並在資料表註明，不當完整週（`chart-takeaways.ts:53` 的 `isFullWeek`）；比率可照畫（X40） |
| 每 100 元扣項合計 > 100 | 超過 100 的部分塗不利色，照常畫 |
| 任一扣項為負或淨營收 ≤ 0 | 該通路改成文字列「不適用」，副標說明 |
| Pareto 沒有負值 | 不渲染 G14，`product-worst` 照 v3 原樣（示範資料就是這種） |
| 累計線遇到 null | 之後斷線 |
| 目標 | 只在期間完全相同、通路為 ALL 或單一通路且 matched 時畫；不折算；不畫等速目標線 |
| 試算門檻 | 只畫範圍內的既有點（是否連線依 D-V4-20）；超界標「超出範圍」；L＝0 不畫門檻點；快照過期用空狀態；敏感度三點未填就不畫 |
| 會議歷史跨資料集、通路或期間長度 | 斷段並標「不同資料集」或「期間不同」；同本期重複會議只畫最新 |
| 扣項為負（成本沖回、費用抵扣） | 對貢獻有利：G23 用有利色；G10 該通路改「不適用」列 |
| 問題筆數為 0 | 不渲染 G21 |
| 不能相加的數字 | 不同健檢規則的影響金額、不同通路的方案結果都不加總；只列前 N，其餘寫「另 n 項」（X38） |
| 整張圖無資料 | C16 空狀態，四態等高 |

### 7.5 互動與鍵盤

- 點擊開抽屜，與資料表同一個 builder（同一個 `EvidenceSelection`）；下鑽帶 `filter`（`week`、`channel`、`date`、`sku`）。
- 圖 `aria-hidden`；熱區不可聚焦；圖內 0 個 `tabIndex`；熱表（table 模式，不在 `aria-hidden` 內）用 grid 型 roving tabindex，整張 1 個 Tab 停留點；鍵盤經資料表、緊湊表或清單；Tab 順序等於 DOM 順序，不用 CSS `order` 讓視覺順序與 Tab 順序分歧。
- tooltip 只用 `.chart-tooltip`，只顯示指標名與值；關鍵數字不能只在 hover 時出現；觸控不依賴 hover。
- 不做 brush、zoom、動畫；範圍切換只影響本圖。
- 切換、降級、投影一律用 CSS 顯示隱藏，不卸載（M1）；同一控制一個 DOM 實例（M6）。
- 分析事件只記事件名（D-V4-14）。

### 7.6 手機 390

頁面不得橫向捲動，只允許 `.chart-frame.waterfall` 與 `.table-scroll` 內部捲動；瀑布水平捲動且橋接表在 DOM 前；內嵌條與 sparkline 保留（寬 64）；小倍數單欄列出全部子圖（框高＝`chartHeights.sm` × 子圖數，C26）；熱表月曆上下堆疊，標題所指的通路排第一張，其餘在框內垂直捲動；矩陣與寬表改清單式（沿用 C3）；散佈不畫只留表；時間軸垂直堆疊；圖高 token 不變（C26 在 ≤ 767px 用 `chartHeights.sm` 的整數倍是唯一例外）；CLS < 0.05；四尺寸 axe 0 serious。

### 7.7 投影、列印與匯出

- 投影只在總覽與會議，只顯示 L1；總覽加入拆解區的瀑布（橋接表是 L3，隱藏）；`--text-12`、`--text-13` 對應 14px。
- 列印只用 inline SVG、固定寬、不用 ResponsiveContainer；灰階（起訖與小計淺灰底加外框、有利淺灰、不利 `ink` 實心加「−」）；圖例用 SVG 線段；0.5pt 框線；色走 `export-theme.ts`；老闆版 1 頁。
- PPT 只用 `bar`、`line`；瀑布用堆疊長條加透明底段（或 `addShape`）；不用圖片 API；軸範圍依資料。
- Excel 不畫圖、不用字元畫條，只加「圖表資料」工作表；Markdown 只放表（數字欄 `---:`、U+2212）；CSV、JSON 不變。
- X18 延伸到投影與匯出：橋接主圖一律是瀑布；G6 只能當橋接表內的輔助欄（X39）。v3 的 X18 原文沒有限定（`docs/revamp-v3/01_PRD.md:336`），G6 要依 D-V4-33 把 X18 改寫成「不得以分歧長條取代瀑布當橋接主圖」才能做。**D-V4-33＝B（2026-10-08 拍板）：v4 起 X18 以本句的改寫為準**（v3 PRD 為歷史紀錄，不改原文）；G6 只在 ≤ 767px 顯示、≥ 768 以 CSS 隱藏但掛載。

### 7.8 新增禁止項（X26–X40，D-V4-23；欄位沿用 v3 X 表）

| # | 禁止 | 替代 | 自動檢查 |
|---|---|---|---|
| X26 | 樹狀圖、旭日圖 | 排序長條或表 | CL-6 |
| X27 | 區域圖、堆疊區域；SVG 漸層、濾鏡、圖樣 | 折線；組成用 G10 堆疊條 | CL-3、CL-6 |
| X28 | 桑基、漏斗、雷達、圓餅、甜甜圈、RadialBar | 瀑布、堆疊條、表 | CL-6 |
| X29 | 系統代填假設的龍捲風、敏感度網格；在 [−90%, +100%] 以外畫點或延伸線 | G15 方案差額、G16 只畫既有點 | 單元測試：敏感度輸入預設空白不變；G16 幾何的所有 x 在範圍內 |
| X30 | 雙數值軸 | 小倍數或 takeaway | CL-8 |
| X31 | 動畫、brush、zoom、hover 才看得到的關鍵數字 | 直接標籤 | CL-4、CL-6 |
| X32 | 彩色圓點或方塊圖例；只靠顏色區分系列 | 12×2 線段、空心與實心形狀、直接標籤 | `legend[].shape` 型別列舉；截圖審查 |
| X33 | 連續色階、超過兩階的熱表、紅綠雙極 | 兩階 token＋格內數字＋階 2 框線 | `chart-theme.test`：heat token 恰好 2 個 |
| X34 | 圖高或字級寫死數字 | `chartHeights`（固定高）、`chartRowHeights`（依列計高）、`chartFontSize` | CL-5、CL-10 |
| X35 | `aria-hidden` 容器內有可聚焦元素；圖形元素沒有 `aria-hidden`；Recharts `accessibilityLayer` 未關 | 鍵盤經資料表；熱表用 table 模式 | CL-7、CL-11、CL-4 |
| X36 | `src/components/**` 內 hex、`var(--chart-` 字串常值 | `chartColors` | CL-3、design-lint |
| X37 | 每頁主層常駐獨立圖超過 3 張（總覽既有 4 張例外）；沒有資料表的圖 | 內嵌條、收進 `<details>`、合併 | CL-9、CL-1 |
| X38 | 加總不能相加的數字（例如把不同健檢規則的影響金額合成「其他」柱、把不同通路的方案結果相加） | 只列前 N，其餘寫「另 n 項」文字 | B 級函式單元測試：輸出不含跨規則或跨通路的合計 |
| X39 | 投影、PDF、PPT 用分歧長條取代瀑布當橋接主圖（X18 延伸） | 瀑布並列橋接表；G6 只當表內輔助欄 | E2E：投影中 `bridge-waterfall` 可見；PDF 有 `svg[data-print-chart="bridge"]`；PPT 有瀑布的 chart part 或 shape |
| X40 | 金額或件數序列把未滿 7 天的週當完整週畫（造成假下跌） | `isFullWeek`；未滿週畫空心點並在資料表註明 | 單元測試 |

### 7.9 chart-lint 規則（`tests/chart-lint.test.ts`＋`scripts/lib/chart-scan.mjs`；上限檔 `tests/fixtures/chart-lint-ceiling.json`）

掃描方式分兩種。（1）AST：`scripts/lib/chart-scan.mjs` 的 CL-3 到 CL-8、CL-10 掃 `src/components/charts/**` 與 `src/components/overview/charts/**`（新元件一律放這兩處，§6.3），其中 CL-3 的 `var(--chart-` 字串常值禁令擴到整個 `src/components/**`（大多數圖的色與 testid 是在呼叫端組出來的：G7a 在 `overview/assist-table.tsx`、G9 在 `diagnosis-list.tsx`、G13 與 G14 在 `product-comparison-panel.tsx`、G15 在 `decision-workbench.tsx`、G16 在 `scenario-sensitivity.tsx`、G19 在 `meeting-page.tsx`、G21 在 `issue-list.tsx`、G22 在 `import-wizard/step-review.tsx`、G23 在 `evidence-drawer.tsx`，都在兩個元件目錄之外）；沿用 `scripts/lib/ui-scan.mjs` 的作法，但不改它的 `SCAN_SCOPE`（`:9`）。（2）SSR：CL-1、CL-2、CL-9、CL-11 牽涉跨檔組合（例如 G16 的 `<details>` 在 `scenario-sensitivity.tsx:38`，`bridge-section.tsx:80`、`profit-section.tsx:70` 自己輸出 section），也要涵蓋呼叫端，逐檔 AST 判斷不了，改用 SSR 檢查：用 V4-0a 從 `tests/mounted-testids.test.tsx` 原樣搬到 `tests/helpers/page-states.tsx` 並匯出的 `pageStates`（原在 `:163`，與 `shellPage`、`load`、`wizardFiles`、`statusShells` 一起搬；直接從另一支 `.test.tsx` 匯入會讓 vitest 把整份 mounted-testids 再登記一次）渲染七頁的各狀態，再檢查 markup。

| 規則 | 檢查 | 備註 |
|---|---|---|
| CL-1 | SSR：每個 `section.chart-section` 內有 `details.data-alternative`，或是 table 模式（表本身就是資料表）；C24 內嵌條與 C19 sparkline 以元件根節點的標記辨識（C24 根 svg `data-chart-kind="cell"`、C19 `data-chart-kind="spark"`），不看 testid 片段：帶這個標記的元素只出現在 `<table>` 或清單列（`li`、健檢列的 `summary`）內，且同列有對應數字。C25 的柱（`chart-products-variance-bar-*` 等，在 ChartFrame 的 svg 內）與既有 `profit-waterfall-bar-{metric}` 也含 `-bar-`，但沒有這個標記，不受本條約束；`tests/chart-lint.test.ts` 放這兩種反例 | v3.0.0 的 `bridge-section`、`profit-section` 自帶 `<details>`，且沒有任何 `data-chart-kind`，基準為 0 |
| CL-2 | SSR（和 CL-1 同一組頁面狀態）：所有 `data-testid^="chart-"` 都要符合 §4.7 命名正則（`chart-{page}-{id}`、`…-{bar｜point｜seg｜cell｜spark}-{key}`、`…-table`），而且語意 key（`-bar-` 等之後的整段）不得是純數字（`^\d+$`；ISO 日期與 `SKU-020` 這類含字母或連字號的值不算）；AST 另掃兩個元件目錄的樣板，出現 `${i}`、`${index}` 視為違規；既有 12 個圖表 testid（§4.7）與 `kpi-target-*` 在白名單 | v3.0.0 沒有 `chart-` 開頭的 testid，基準為 0 |
| CL-3 | 兩個元件目錄內不得有 hex、`<linearGradient>`、`<radialGradient>`、`<filter>`、`<pattern>`；整個 `src/components/**` 不得有 `var(--chart-` 字串常值（色一律經 `src/application/chart-theme.ts` 的 `chartColors`） | V4-0a 實測 v3.0.0 的 `src/components/**`；有既有違規時逐條列出、上限設為實測值 |
| CL-4 | Recharts 根元素 `accessibilityLayer={false}`；每個系列 `isAnimationActive={false}`；`ResponsiveContainer` 有 `initialDimension` | 既有兩張已符合（`channel-section.tsx`、`trend-section.tsx`） |
| CL-5 | `fontSize` 只能是 `chartFontSize` | — |
| CL-6 | 禁止 import，以完整名稱比對：`Treemap`、`SunburstChart`、`Sankey`、`Funnel`、`FunnelChart`、`Pie`、`PieChart`、`Radar`、`RadarChart`、`RadialBar`、`RadialBarChart`、`Area`、`AreaChart`、`Brush`；`ReferenceArea` 允許；`Scatter`、`ScatterChart` 只允許出現在以 `next/dynamic` 載入的 `*-lazy.tsx` 檔 | 用前綴比對會誤抓既有的 `ReferenceArea`（`trend-section.tsx:4`） |
| CL-7 | `aria-hidden` 容器內不得有 `tabIndex`、`onKeyDown`、`<a>`、`<button>` | — |
| CL-8 | 每個 Recharts 圖的數值 `YAxis` ≤ 1 | — |
| CL-9 | SSR：每頁主層（`<details>` 外）的獨立圖區塊 ≤ 3；總覽 4 張例外；小倍數算 1 張。計數單位是 `section.chart-section`（含 v3 自帶外框的 `bridge-section`、`profit-section`，不限 ChartFrame；`variant="inline"` 的 `.chart-section.is-inline` 也算） | v3.0.0 總覽 4（G1–G4 都是 `section.chart-section`），其餘 0 |
| CL-10 | 高度只檢查 ChartFrame、圖根 svg（class 含 `chart-`、`waterfall-svg`、`spark`）與 `ResponsiveContainer` 的 `initialDimension.height`：固定高容器只能用 `chartHeights` 或它的整數倍（只有 C26 在 ≤ 767px 用 sm × 子圖數）；依列計高的 svg（C24、C25、C27、C30、C35），高度必須寫成 `chartRowHeights` 的整數倍或其和（例如 `rows * chartRowHeights.row24`），不得出現數字常值；`ResponsiveContainer` 的 `height="100%"` 允許（既有兩張都這樣寫，`trend-section.tsx:151`、`channel-section.tsx`） | 不掃圖例的 12×2 線段（`chart-frame.tsx:53`）與 icon（`src/components/shell/period-bar.tsx:50`），否則基準就失敗 |
| CL-11 | SSR（和 CL-1 同一組頁面狀態）：每個 testid 含 `-bar-`、`-spark-`、`-seg-`、`-point-` 的元素，以及每個帶 `data-chart-kind` 的元素，本身或祖先要帶 `aria-hidden="true"`（ChartFrame `mode="table"` 的格除外，它們是表格內容）；每個 `section.chart-section` 的 `aria-describedby` 都要指到頁面上存在的 id | axe 不會對沒有 role 的 svg 報錯，所以要自己查；v3.0.0 的既有圖都在 `aria-hidden` 的 `.chart-frame` 內，基準為 0 |

V4-0a 必須證明 v3.0.0 程式碼 11 條全部為 0；若實測有違規，驗收文件逐條列出、上限設為實測值，之後只降。

---

## 8 非功能

### 8.1 無障礙

- 每張圖：圖容器 `aria-hidden`、副標當 `aria-describedby`、`<details class="data-alternative">` 資料表（C33）、可點圖形一定有對應的 number-link；熱表用 ChartFrame table 模式，不放進 `aria-hidden` 容器。
- 對比：文字 ≥ 4.5:1、圖形非文字 ≥ 3:1；每個新 token 進 `scripts/contrast-check.mjs` 的 PAIRS（含 `--bg-subtle` 底）。
- Lighthouse Accessibility 六頁 1440 與 390 不低於 v3 同頁（全 100）且 ≥ 95；axe 四尺寸 serious／critical 0（狀態數依 §2.2 C3 的時程逐批增加，V4-10 結束時 desktop、laptop、tablet 各 18 個、mobile 17 個）；鍵盤走查圖內 0 停留點、熱表整張 1 個停留點、KPI 前可聚焦 ≤ 10；無動畫，所以不需要 reduced-motion 例外。

### 8.2 效能

| 項目 | 要求 |
|---|---|
| First Load JS | gzip ≤ 545,397 bytes（v3.0.0 的 519,426 × 1.05，D-V4-24），`metrics.spec` 硬斷言；量法沿用 v3（首頁 HTML 的 `/_next/static` 腳本去重、排除 nomodule、`zlib.gzipSync`） |
| 首載 chunk 的符號檢查 | 只對 v3.0.0 基準為 0 的 `Treemap`、`Sankey`、`Funnel`、`PieChart`、`RadarChart` 斷言為 0。v3.0.0 的首載 chunk 已含 `ScatterChart` 2 處、`AreaChart` 1 處、`Brush` 2 處、`ComposedChart` 1 處（多半是共用型別），對這些符號做 0 斷言會在 V4-0 第一跑就失敗，所以改用 gzip 總量門檻判定；首載 chunk 清單與各自 gzip 大小每批列入驗收供人工比對（檔名帶雜湊，每次 build 都變，不逐一斷言） |
| 散佈圖（G24） | 只能用 `next/dynamic`；證明不在首載：以 build 產物列出首載 chunk 所含的模組；取不到模組清單時，以「散佈圖的 chunk 檔存在，且不在首頁 HTML 腳本清單中」為準 |
| Recharts 用法 | 新圖只用 source 已 import 的 `LineChart`、`BarChart` 與其子元件（`Line`、`Bar`、`XAxis`、`YAxis`、`CartesianGrid`、`ReferenceLine`、`ReferenceArea`、`LabelList`、`Cell`、`Tooltip`、`ResponsiveContainer`）；目前原始碼沒有 import `ComposedChart`，v4 也不加；其餘一律 inline SVG |
| DOM 與互動 | G7b、G10、G11 只在通路 ≤ 8 時計算與渲染（系統允許 1,000 個通路，`src/application/limits.ts:6`），熱表格數因此 ≤ 8 × 92＝736（整張 1 個 Tab 停留點）；`channelWeeks` 不放進每次的 `createSnapshot`，只在健檢頁計算；V4-3a、V4-3b 另用程式產生的合成資料（50 通路 × 92 天，記憶體中組成）斷言健檢頁不輸出這三張圖的格與 sparkline、`createSnapshot` 不呼叫 `channelWeeks`（B9 與 TBT 只用 2 通路的示範資料量，量不到大量通路）；sparkline 點 ≤ 8；散佈點 ≤ 200；示範資料每頁 DOM 節點數 ≤ V4-0a 基準＋1,500（B9：`metrics.spec` 在 1440 與 390 載入示範資料後量七頁的 `document.querySelectorAll('*').length`，V4-0a 記錄基準，V4-1 起硬斷言）；390 載入示範資料，以及切到通路健檢、商品毛利、會議紀錄、資料來源的 TBT 各 ≤ V4-0a 中位數 × 1.1（與中位數＋50 ms 取較大者，D-V4-36）（C2）；CLS < 0.05；SSR 一律給 `initialDimension` |

### 8.3 隱私與公開站邊界（不變）

不加登入、資料庫、伺服器端保存；原始 CSV 不上傳；`APP_MODE=PUBLIC_DEMO`、`ENABLE_LIVE_AI=false`、`/api/insights` 封鎖邏輯不動；不碰 `.env*`、`vercel.json`；分析事件只記事件名（新增 `chart_clicked`、`chart_table_opened` 需 D-V4-14 拍板）；`network-log.spec` 下載集合不變（本輪不加 PNG／SVG 下載）；任何部署（含 preview）都要使用者當次明確同意。

### 8.4 財務核心禁區

- 不動：`src/domain/*`、`fixtures/*`（golden、demo、errors、refund_only、zero_ad）、`metric_version = contribution-v1`、`assist-kpi-v1`、`breakeven-mer-v1`、`docs/METRICS.md` 的公式。**v4 的禁區白名單為空**：不新增任何 `fixtures/` 檔案；4 通路合成資料放在非禁區的 `tests/fixtures/`（D-V4-31）。
- `assist-kpi-v1`、`breakeven-mer-v1` 的「不動」寫成可驗證的範圍：版本常數與算式所在的 `src/application/assist-kpi.ts`（`ASSIST_KPI_VERSION`，`:10`；件均算式 `:30-37`）、`src/application/breakeven-mer.ts`（`BREAKEVEN_MER_VERSION`，`:10`；算式 `:67`）與既有測試 `tests/assist-kpi.test.ts`、`tests/breakeven-mer.test.ts` 一個字都不改（G7a 呼叫 `netRevenuePerUnit`、G5 呼叫 `breakevenMer`，只能呼叫、不能改）；這兩個檔在 `src/application`，不在前兩個 diff 的路徑裡，所以另加第三條命令。
- 每批驗收跑四個命令，都必須為空（D-V4-3）：
  - `git diff --stat 625bfa5 -- src/domain fixtures docs/METRICS.md`
  - `git diff --stat 82b70df -- src/domain fixtures/golden fixtures/demo fixtures/errors fixtures/refund_only fixtures/zero_ad docs/METRICS.md`（CLAUDE.md 既有命令，保留 v2 以來 `src/domain` 零改動的證明）
  - `git diff --stat 625bfa5 -- src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts`
  - `git status --porcelain -- src/domain fixtures docs/METRICS.md src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts`（`git diff` 看不到未追蹤的新檔：驗收時批次中途新增的 `fixtures/*` 或 `src/domain/*` 檔還沒 commit，前三條都會是空的；這條會印出 `?? fixtures/…`）
- commit 之後再跑一次 `git diff --stat 625bfa5 HEAD -- src/domain fixtures docs/METRICS.md src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts`，必須為空，並把 commit hash 寫進驗收文件。
- golden 不變：本期 255.00、差額 −315.00、試算 284.00／264.00／19.70；測試的數字斷言改呼叫格式化函式，不改 golden 數字。
- B 級函式（§6.4）只用 `Decimal`／`sumAmounts`／`ratioMetric`，各有版本常數與手算 golden，對帳點：`cumulativeDaily` 兩期末日各＝該期合計（示範 1,269,792.73／1,868,626.68；golden 單日 255.00）；`productPareto` 末筆累計＝負值合計、末筆累計佔比＝100%（取反後 `ratioMetric`）；`channelWeeks` 逐週加總＝通路期間合計；`channelStructure` 七段加總恆等（比照 `waterfall.ts:255-259`），每通路的剩＝`profitWaterfall(snapshot, channel).perHundred`，合計範圍的每 100 元＝`profitWaterfall().perHundred`（示範 16.2、golden 10.3）；`dailyHeatmap` 逐日加總＝通路期間合計；`coverageTimeline` 缺列天數＝問題筆數；`issueDistribution` 格加總＝問題筆數；`actionDueBuckets` 四格加總＝未完成待辦數；`assistWeeks` 逐週件數加總＝期間件數。

### 8.5 標籤單一來源

- 新 key 只放在 `tests/labels-structure.test.ts` 新增的 `V4_NEW_KEY_PREFIXES`（D-V4-26）：`overview.chartsV4.`、`diagnosis.chartsV4.`、`products.chartsV4.`、`scenarios.chartsV4.`、`actions.chartsV4.`、`meeting.chartsV4.`、`data.chartsV4.`、`importWizard.chartsV4.`、`evidence.chartsV4.`、`exports.chartsV4.`、`shell.chartsV4.`。都在既有 `LABEL_GROUPS`（24 組）內，不新增頂層分組；labels 檔用「── V4-n 錨點：…」註解標出每批新增的位置。
- 既有字串一個字都不改：V4-0a 新增 `verification/revamp-v4/labels-v3.flat.json`（v3.0.0 全部 2,581 個葉節點），`tests/labels-structure.test.ts` 斷言每個鍵都還在、字串逐字相同；除此之外的新葉節點只能在 `V4_NEW_KEY_PREFIXES` 下。既有的 `verification/revamp-v3/labels-v3-2b.flat.json` 只涵蓋 v2 來的字串，V3-3 起新增的 487 個 V3 前綴字串（含 G1、G2 沿用的 `overview.bridgeV3.title.*`、`overview.profit.title.*`）被 `isV3NewKey` 略過、沒有凍結值（`tests/labels-structure.test.ts:14、26-27`），所以要另加 v3 快照。新字串 copy-scan 0 違規；JSX 不寫中文；指標名一律從 `metricDefinitions` 取。
- 使用者看得到的字（含 aria-label、`caption`、資料表 summary、Excel 工作表名、PPT 圖標題、PDF 圖說）全部在 labels。

### 8.6 testid 與測試基礎設施

| 項目 | 內容 |
|---|---|
| testid 基準 | V4-0a 分三步產生 `verification/revamp-v4/testids-v3.txt`，格式與 `testids-v2.txt` 相同（每列帶 ssr／e2e／cond 來源，`tests/testid-baseline.test.ts:222-226`）：1. `TESTID_BASELINE_DUMP` 取得 ssr 列（只輸出 SSR 渲染到的 id，`:50、218-219`）；2. 複製 `verification/revamp-v3/collect-testids.spec.ts` 為 `verification/revamp-v4/collect-testids.spec.ts`，把 `BASELINE` 改成 `verification/revamp-v4/testids-v3.txt`、`OUTPUT` 改成 `verification/revamp-v4/collect-testids.json`（原檔 `:10-11` 是 v3 路徑），並比照 `verification/revamp-v3.config.ts` 新增 `verification/revamp-v4.config.ts`（`testDir: "./revamp-v4"`、`testMatch: "collect-testids.spec.ts"`；e2e 設定的 testDir 是 `tests/e2e`、capture 設定是 `revamp-v4-capture`，都跑不到它），在瀏覽器收集互動後才出現的 e2e 列，執行命令 `npx playwright test --config verification/revamp-v4.config.ts` 寫進 V4-0a 驗收；3. cond 列沿用 v2 清單並補 V3 新增的條件項。`audit:ui` 的「靜態 testid 253」是原始碼計數，和這份清單是不同的量，不當預期數。`tests/testid-baseline.test.ts` 同時比對 `verification/revamp-v3/testids-v2.txt`（228 列）、v3 清單與 `verification/revamp-v4/testids-v4-added.txt`（V4-0a 建立空檔；V4-1 起每批把本批新增的 testid 追加進去，同格式加批次欄，讓後面批次刪掉或改名 v4 新 testid 也抓得到）；三者刪除數都必須為 0 |
| mounted-testids（M1、M6） | 每批在錨點後新增狀態與 M1 測試；V4-0a 加一條 M6 斷言：每個頁面狀態中，`chart-` 開頭的 testid 在實例容器（`INSTANCE_CONTAINER`，例如 `scenario-{n}`）之外恰好出現一次。`INSTANCE_CONTAINER`（`tests/mounted-testids.test.tsx:347`）是「內部 testid 可以隨容器重複」的容器規則，以全字串比對；圖表的柱、點、段、格是葉節點，不加進去（加了不是永遠比對不到，就是放寬 M6）；G16 在 `scenario-{n}` 容器內沿用既有規則；G15 全頁唯一；收合的 `<details>`、投影隱藏的圖都保持掛載。V4-0a 先把 `shellPage`、`load`、`wizardFiles`、`pageStates`、`statusShells`（`tests/mounted-testids.test.tsx:86、147、153、163、272`，都沒有 export）原樣搬到 `tests/helpers/page-states.tsx` 並匯出，mounted-testids 與 chart-lint 都從這裡匯入，搬移前後 mounted-testids 結果相同；V4-1 起「新增頁面狀態」的錨點寫在 helper 檔，M1 測試的錨點留在 mounted-testids |
| labels-structure | 加 `V4_NEW_KEY_PREFIXES`，判斷改為 V3 或 V4 清單任一符合；加 v3.0.0 全部葉節點快照 `verification/revamp-v4/labels-v3.flat.json` 的逐鍵逐字斷言（§8.5）；既有快照與對照表不動 |
| copy-scan | L1 樣式加 `^[^.]+\.chartsV4\.[^.]+\.title(\.\|$)`；`products.chartsV4.*` 加禁用詞「賠錢」「虧損」（商品頁只呈現商品毛利，GLOSSARY 增補） |
| chart-lint | §7.9 的 CL-1 到 CL-11（CL-1、CL-2、CL-9、CL-11 用 SSR，頁面狀態來自 `tests/helpers/page-states.tsx`），AST 掃描範圍 `src/components/charts/**`＋`src/components/overview/charts/**`（CL-3 的 `var(--chart-` 禁令擴到 `src/components/**`），上限檔全 0 |
| `metrics.spec`（v4 設定檔） | V4-0a：B2、B3、B5 硬斷言，B1、B9 只記錄；V4-1 起 B9、各頁 B1 依時程硬斷言（§2.2 B1 與 `06_BATCHES.md` 護欄表）。內容：First Load JS；首屏位置（B2：1440 三項、1280 的 KPI 帶底；1280 的一句話頂與三件事首列底以 V4-0a 實測為門檻）；首屏圖（B1）；390 `scrollWidth`；DOM 節點數（B9）；首載 chunk 符號檢查（只限 5 個基準為 0 的名稱）與 chunk 清單 |
| `revamp-r1-layout` | `CHART_FRAMES`（`tests/e2e/revamp-r1-layout.spec.ts:340`）改為自動收集 `main .chart-frame:visible`：`main` 裡有一直掛著、以 `hidden` 藏起來的試算工作台（`src/components/dashboard.tsx:577`，從 V4-5 起內含 G15 的 `.chart-frame`），也有收在 `<details>` 裡的圖（G8、G12），它們沒有 bounding box，既有的 `box()`（`:27`）與 `every(height > 0)`（`:359`）斷言會失敗；不限 `.view-content`，因為試算頁的工作台在 `.view-content` 之外。所有頁切換期間等高、CLS < 0.05；G8、G12 的等高比較只在展開狀態下做 |
| `axe-sweep` | 依 §2.2 C3 的時程加狀態：V4-3b 加「資料表展開」「從圖下鑽的抽屜」「4 通路合成資料的健檢頁」；V4-4 加「合成資料的商品頁」；V4-5 加「試算計算後展開 `scenario-sensitivity`」；V4-7a 加「匯入 `missing_ad_day` 後的資料來源頁（含篩選後的問題表）」；V4-10 加「待辦頁新增一張卡」；V4-10 結束時 desktop、laptop、tablet 各 18、mobile 17 |
| `keyboard-walk` | V4-0a 加通用斷言：任何 Tab 停留點都不在 `[aria-hidden=true]` 內（v3.0.0 應為 0）；V4-3b 加「健檢頁經過熱表的 Tab 數 ≤ 3」；「第一張圖的資料表 summary」里程碑由各頁批次自己加（商品頁在 V4-4，與 `product-worst` 在它之前的斷言同批），V4-8 補齊尚未加的頁；既有里程碑（`kpi-band` 內第一個 `kpi-*`、`diagnosis-row-*`、`product-worst` 等）不變 |
| `network-log` | 下載集合不變 |
| Lighthouse | V4-0a 在 `scripts/lighthouse-pages.mjs` 加資料來源、待辦兩頁（共 8 頁）；390 的「載入示範資料」與「切到通路健檢、商品毛利、會議紀錄、資料來源」五個 timespan 的 TBT 在低負載下連跑 3 次取中位數並記錄 loadavg；Performance 分數只取空狀態首頁（navigation） |
| `export-normalize` | 加 `isChartV4MarkdownLine`、`isChartV4Sheet` 排除，另加列級的 `isChartV4VersionRow`（比照 V3-9a 的 `isBreakevenExcelRow`，`tests/helpers/export-normalize.ts:37`）排除 basis 工作表新加的 B 級版本列；數值基準 `tests/fixtures/export-numeric-baseline.json` 不動 |
| `pptx-export.test` | 斷言 chart part 數、系列色屬於 `EXPORT_THEME`、`ppt/media/` 為空；依 D-V4-34 改投影片張數斷言（現行 `tests/pptx-export.test.ts:280-289` 斷言只有 1 張；選 A 時改為 2 張並斷言第一張的既有區塊逐項仍在） |
| `present-mode.test` | 白名單加 `.bridge-section`（只顯示瀑布）、`--text-12` 與 `--text-13` 對應 14px（對應後 12 ≤ 13）、不新增字級原值 |
| 每張圖的 SSR 結構測試 | 框、aria、資料表列數＝資料長度；圖上點擊與資料表 number-link 回傳同一個 `EvidenceSelection`（Recharts 圖在 SSR 不輸出圖形，只驗資料表）；新算出的值帶 `metricVersion`、整理後的 domain 值帶 `arrangeVersion`、水準值帶 `valueKind: "level"` |
| 幾何純函式測試 | `barCellGeometry`、`hbarGeometry`、`shareStackGeometry`、`sparklineGeometry`、`thresholdGeometry`、`timelineGeometry` |
| E2E 四尺寸 | 點擊開抽屜、資料表展開、等高、390 無橫向捲動；新圖只用 testid 與 labels 斷言；`e2e-text-assertions.csv` 每批勾銷 |
| 截圖基準 | `verification/revamp-v4.capture.config.ts`，`CAPTURE_BATCH=V4-n`；v3 的 9 個畫面（`01-overview-top` 到 `09-data`）加「健檢圖區」「商品圖區」「匯入精靈步驟 4」成 12 畫面 × 4 尺寸＝48 張，再加 KPI 帶元素截圖 4 張，共 52 張。10–13 的拍攝狀態、資料與定位器逐張寫在 `06_BATCHES.md` V4-0a 第 9 項（13 要先讀入 `verification/revamp-v4-capture/targets.csv`，否則示範資料沒有任何 `kpi-target-*`，`src/components/overview.tsx:69`）。比對流程：V4-n 開跑前，把前一批的 `snapshots/`（V4-0a 用 V3-10 的 36 張，檔名不變）複製到 `verification/revamp-v4/V4-n/snapshots/`，不帶 `--update-snapshots` 跑一次，只允許 `06_BATCHES.md` 該批「允許變動畫面」列出的畫面有差異；確認後只更新那幾張並在驗收寫理由 |
| 合成資料 | `tests/fixtures/synthetic-4-channel/`（D-V4-31，V4-0b）：4 通路、含虧損通路、費用與廣告缺列日、扣項為負的通路、商品毛利為負的 SKU、門檻超出範圍的方案、結束在週中的期間，供單元、E2E 與視覺驗收；示範資料只有 2 通路，而且沒有缺列日與商品毛利為負的商品 |

### 8.7 可追溯性

- 每個金額（含圖上的點、柱、段、格，以及內嵌條所屬的格）都能開「計算與來源」；抽屜標題下一行永遠是到分的精確值。
- 衍生值與抽屜欄位（`src/components/evidence-drawer.tsx:15-37`）的規則：
  1. 只有真正新算出的值（四項費用合計、累計、累計佔比、每 100 元的費用合計佔比、計數、分階名次）帶該 B 級函式的版本 `metricVersion`，並列出 `formula`、`components`。
  2. 直接取自 domain 或 v3 既有 application 函式的值（週淨營收、週毛利率、單一通路週或日的扣廣告後貢獻、各通路每 100 元的剩）不改 `metricVersion`：抽屜預設 `contribution-v1`（`:192`），件數、件均沿用 v3 的 `assist-kpi-v1`（`src/components/overview/assist-table.tsx:36`）。抽屜只有一個 `metric_version` 欄（`:322`），換成整理函式的版本會看起來像用了別的公式；整理函式（例如 `daily-heatmap-v1`）的版本放新欄位 `arrangeVersion`，技術細節在 `metric_version` 之後另列一行（V4-2 加，G7a 第一次用）。
  3. 現行抽屜只要 `components` 有內容就把值當差額：大數字與精確值帶正負號（`:166、171-172`）、附取位說明（`:324`）、不畫階梯（`:80`）；v3 的損益兩平 MER 刻意傳 `components: []` 避開（`assist-table.tsx:67`）。V4-3a 在 `EvidenceSelection` 加 `valueKind?: "level" | "change"`（未給時沿用現況），帶號與取位說明只看它；累計、費用合計這類水準值傳 `valueKind: "level"`，SSR 測試斷言 G8、G10、G14 的抽屜大數字不帶「+」。
  4. `name` 只用來借單位時（例如四項費用合計借 `platform_fees` 的金額單位；`MetricName` 沒有費用合計，`src/domain/types.ts:79`），證據必須自帶 `title`、`definition`、`formulaTechnical`，抽屜不得顯示該 `name` 的定義、技術公式與組成表列名（`evidence-drawer.tsx:135、318`）。
- 例外：試算結果（G15、G16）是假設、會議歷史（G19）是凍結值、匯入對帳（G22）是尚未提交的資料，這些數字在 v3 就不是 number-link；v4 不新增抽屜，這幾張圖的柱與點不可點，數字由同區塊既有表格呈現。現況基準（G15 的零線）沿用既有基準抽屜。
- 佔比類數值本身能否開抽屜，取決於 D-V3-31（抽屜加 `unitOverride: "percent"`），由 D-V4-32 連動處理；未拍板前，佔比為一般文字，點段開金額抽屜。
- 下鑽篩選擴充 `date`、`sku`（`src/application/evidence-filter.ts`，V4-3b），只過濾原始明細，不重算任何金額。`sku` 條件下，沒有 sku 欄位的列（通路費用、廣告）一律不列入；`filter.sku` 只和商品層證據（`evidence.sku`）一起用，不可把全通路費用帶進 SKU 的明細（AGENTS.md）。
- 任何前處理照常寫入匯出與備份。

### 8.8 相容性

- 備份 schema 維持 `profitlens-workspace-v5`（`src/application/workspace-backup.ts:20`）；snapshot 新增的選填欄位（週列 `units_sold`）不進備份，載入時重算；`channelWeeks` 不放進 snapshot（只在健檢頁與 Excel 匯出時計算）；舊備份 v1–v5 還原矩陣測試不變。
- CSV、JSON 不變（D-V4-13）；Excel 新增工作表、PPT 版面加圖、Markdown 新增表，記入 RELEASES（Excel 新工作表與 PPT 版面屬使用者可見的變更）。
- 瀏覽器支援與列印（A4 直式）同 v3；既有 E2E 定位器（`path.chart-bar-link`、`.bridge-total`、`chart-point-hit`）全部保留。

### 8.9 文件與驗收

每批：`docs/STATUS.md`（真實結果，未執行寫「未執行」）、必要時 `docs/DECISIONS.md`、`verification/revamp-v4-V4-{n}-acceptance.md`、`verification/revamp-v4/V4-{n}/`（四尺寸截圖各 ≥ 1、`ui-audit.json`、`metrics.json`、Lighthouse、axe、keyboard-walk、network-log）、`docs/revamp-v4/06_BATCHES.md` 進度；`verification/revamp-v4/feature-retention.csv`（延續 v3 全部 113 列再加圖表列；表頭 `id,feature,page,v3_location,v4_location,change_type,locator,batch,status,covering_tests`，`v3_location` 填 v3.0.0 的位置；每張既有圖與每張「表改圖」各一列，註明資料表替代）：`batch` 欄等於本批的列全部打勾，該批才算完成；V4-11 全表打勾；`verification/revamp-v4/e2e-text-assertions.csv` 每批勾銷；本頁 §2.3 決策表逐頁對照。

---

## 9 批次規劃概要（詳細在 `06_BATCHES.md`，V4-0a、V4-0b 由本節展開）

### 9.1 共同規則

- 一次一批、一批一個工作階段、不跨批；批次太大時在**開工前**拆成 a／b 並寫進 `06_BATCHES.md`。依 v3 經驗，M 批約需 3 個實作代理與 3 個 E2E 代理。
- 元件、token、B 級函式與第一個使用它的頁面同批交付。
- 拍板未回覆時沿用 v3 行為與用詞；受影響的工作不開工。任何部署（含 preview）都要使用者當次明確同意。
- 每批跑 CLAUDE.md 的驗收命令全套，加上 chart-lint、`metrics.spec` v4 設定檔、`axe-sweep`、`keyboard-walk`、`network-log`、截圖基準、Lighthouse，並把真實輸出摘要寫進驗收文件：

```bash
npm ci                 # 全新環境或 lockfile 變動時
npm run typecheck
npm run lint
npm run audit:ui -- --json verification/revamp-v4/V4-{n}/ui-audit.json   # 只有帶 --json 才寫檔（scripts/ui-audit.mjs:2、12-13）
npm run contrast-check
npm test -- --run      # 含 design-lint、copy-style、copy-density、testid-baseline、mounted-testids、chart-lint
npm run build
NETWORK_LOG_OUT=verification/revamp-v4/V4-{n}/network-log.json KEYBOARD_WALK_OUT=verification/revamp-v4/V4-{n}/keyboard-walk.json AXE_OUT=verification/revamp-v4/V4-{n}/axe.json npm run test:e2e
                       # 自己在 3100 埠起 LOCAL 伺服器（reuseExistingServer:false），必須在下面的 PUBLIC_DEMO 伺服器啟動前跑完；沒給三個環境變數時輸出只寫到 test-results
NEXT_TELEMETRY_DISABLED=1 npm run build
APP_MODE=PUBLIC_DEMO PUBLIC_DEMO=true ENABLE_LIVE_AI=false npm start -- --port 3100 &   # capture 與 Lighthouse 共用；Lighthouse 腳本不會自己起伺服器
CAPTURE_BATCH=V4-{n} npx playwright test --config verification/revamp-v4.capture.config.ts   # V4-0a 新增
npx -y lighthouse@13.5.0 --version   # 只在第一次：建立 npx 快取（scripts/lighthouse-pages.mjs:7-8）
node --no-warnings scripts/lighthouse-pages.mjs --base http://127.0.0.1:3100 --out verification/revamp-v4/V4-{n}
lsof -ti tcp:3100 | xargs kill   # 停掉 PUBLIC_DEMO 伺服器；Claude Code 每次 Bash 呼叫都是新 shell，取不到 $!；之後 lsof -ti tcp:3100 必須沒有輸出
git diff --stat 625bfa5 -- src/domain fixtures docs/METRICS.md          # V4-0a 新增（v3.0.0 基準）
git diff --stat 82b70df -- src/domain fixtures/golden fixtures/demo fixtures/errors fixtures/refund_only fixtures/zero_ad docs/METRICS.md
git diff --stat 625bfa5 -- src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts   # V4-0a 新增
git status --porcelain -- src/domain fixtures docs/METRICS.md src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts   # V4-0a 新增：未追蹤與未提交的禁區檔案
# commit 之後：git diff --stat 625bfa5 HEAD -- （同上第三條與第一條的路徑）必須為空，commit hash 寫進驗收文件
```

### 9.2 人工關卡（不屬於任何批次）

| 關卡 | 內容 | 擋住 | 未執行時 |
|---|---|---|---|
| H5 v4 設計稿審查 | `verification/revamp-v4/mockups/*.html`（V4-0b 產出，至少總覽、健檢、商品、資料來源四頁的 1440 與 390）；2–3 位台灣電商經理人；圖表字串少，新字串在這一關一併審，不另設文案審稿 | V4-1 | 使用者可比照 v3 的 H2 略過（D-V4-27），STATUS 寫「未執行／待人工」 |
| H6 v4 複測與盲評 | 5 位受試者（老闆、主管、執行者各 ≥ 1）跑 A1–A3；3 位外部盲評者跑 A4；同一場次量 v3 正式站（tag `v3.0.0`）與 v4 preview，補上 H4 未執行的 v3 基準 | v4.0.0 正式上線 | STATUS 寫「未執行／待人工」，A1–A4 寫「未量測」 |

### 9.3 批次表

| 批次 | 大小 | 範圍 | 依賴 | 同批要改的 labels 與測試 | 驗收重點（共通之外） | 相關拍板 |
|---|---|---|---|---|---|---|
| V4-0a 基準與護欄（不改 UI） | M | 建分支（D-V4-2）；`docs/revamp-v4/` 套件定稿（`00_README.md`、`06_BATCHES.md`、`GLOSSARY.md` 增補、`usability-test.md` 的 v4 任務）；`verification/revamp-v4/`：`testids-v3.txt`（三步產生，含 `verification/revamp-v4.config.ts`）、空的 `testids-v4-added.txt`、`feature-retention.csv`（延續 v3 的 113 列）、`e2e-text-assertions.csv`、`labels-v3.flat.json`、`V4-0-baseline.md`；`tests/helpers/page-states.tsx`（由 mounted-testids 原樣搬出）；chart-lint CL-1 到 CL-11 與上限檔；`copy-density` 收緊到實測值並加商品、待辦兩頁；`V4_NEW_KEY_PREFIXES`（11 個前綴、0 個 key）、v3 字串快照斷言與 copy-scan L1 樣式；mounted-testids 的 `chart-` 唯一性斷言；keyboard-walk 的 `[aria-hidden=true]` 停留點斷言；`metrics.spec` v4 設定檔（B2、B3、B5 硬斷言；B1 參考位置、B9 DOM 節點數、1280 首屏、各頁否定句數、首載 chunk 清單只記錄）；capture config v4 與 52 張基準（10–13 的狀態與 `targets.csv` 見 06）；`contrast-check` 試算 `--red-100` 與新 token 配對（只算不宣告）；Lighthouse 加資料來源、待辦兩頁，390 的五個 TBT（載入示範資料、切到健檢、商品、會議、資料來源）連跑 3 次取中位數 | — | 新增測試檔；改 `tests/copy-density.test.ts`；labels 值不動 | 36 張 v3 畫面與 V3-10 基準差異 0；chart-lint 對 v3.0.0 為 0（或上限＝實測）；testid 三份基準（v2、v3、空的 v4 新增清單）刪除 0；v3 字串快照 2,581 個逐字相同；禁區四條命令皆空；First Load JS、DOM 節點數、五個 TBT 中位數、1280 首屏基準寫入；mounted-testids 搬 helper 前後結果相同 | D-V4-1、2、3、15、23、24、25、26、27 |
| V4-0b 設計稿、PPT spike 與合成資料（不改 UI） | M | pptxgenjs `addChart` spike（堆疊瀑布、跨 0、四系列色、負軸、輔助系列名、有利與不利系列名標明絕對值、資料標籤帶「−」、內嵌資料；兩種版面試排，依 D-V4-34；測試只斷言產生檔案並解析出 XML，只在有給 `PPTX_SPIKE_OUT` 時把檢查項寫進 `pptx-spike.json`，成立與否由驗收文件判讀）；4 通路合成資料（D-V4-31）與手算期望值；H5 設計稿（D-V4-27＝B 時不做；總覽、健檢、商品、資料來源四頁的 1440 與 390；商品頁畫有無負值兩種狀態，資料來源頁用合成資料；實測 G11 在 390 與 768 的格寬、每列張數與 `formatHeatCell` 放不放得下） | V4-0a | 新增 `tests/pptx-chart-spike.test.ts`、合成資料的載入測試；labels 值不動 | 52 張畫面與 V4-0a 差異 0；spike 檢查項寫入；合成資料手算值通過；設計稿不進 app bundle | D-V4-27、31；D-V4-10、34（spike 結果回報後確認） |
| V4-1 總覽拆解與圖表框 | M | C16 擴充（`aside`、`unitNote`、`frameClassName`、`legend[].shape`、`mode` 的型別、`page`）；C17 `bare` 與 `domain`（共同尺度含 G2 全部範圍）；C24（variance）與 `chartRowHeights`（只在 D-V4-33 已回覆、要做 G6 時；未回覆時順延到 V4-2 的 G4 差額條）；`formatAxisWan` 與瀑布改呼叫它；G1、G2 搬進 ChartFrame（class、id、testid 不變）；G6（依 D-V4-33，只在 ≤ 767px 顯示；未回覆時不做）；`chart_clicked`、`chart_table_opened` 接到資料表展開與 G6 | V4-0b；H5 | `overview.chartsV4.{bridge,profit}`、`shell.chartsV4.common`；`overview-charts-waterfall.test` 改 ChartFrame 結構；新增 `tests/chart-frame-v4.test.tsx`、`tests/bar-cell.test.ts`；mounted-testids V4-1 錨點；`revamp-r1-layout` 改自動收集 `main .chart-frame:visible`；`testids-v4-added.txt` 追加 | 總覽四個 `.chart-frame` 切期間等高、CLS < 0.05；G2 切到 MARKETPLACE 時終點柱在 domain 內、刻度含負值；只有 01、02、03（desktop、laptop 背景）有差異；G6 九條與表列同一個 evidence；390 橋接表在前、捲到瀑布後可見且寬 > 0、無頁面橫向捲動；刻度「50 萬」；B2、B9 不退 | D-V4-4、5、7、14、30、33；D-V4-35（選 B 時） |
| V4-2 總覽其他圖 | M | C33（隨 G7a 第一次使用）；G3 刻度改 `formatAxisWan`（末點標值與三項圖例沿用 v3）；G4 緊湊表差額條（有利用 `--chart-total`；長條沿用 `channelEvidence`，差額條用 `channelChangeEvidence`）；C18 抽成共用 Bullet（v3 畫法：0 到目標、達成率夾在 0 到 1）＋`--chart-target`＋損益兩平 MER 列；C19＋G7a（`assistWeeks`、`weeklyRows` 加 `units_sold`、`isFullWeek` 改為匯出，欄名「近 {n} 週」）；`--chart-h-xs`；`EvidenceSelection` 加 `arrangeVersion`（G7a 格維持 `contribution-v1`，另帶 `assist-weeks-v1`）；D-V3-35 只在使用者回覆 A 後才做 | V4-1 | `overview.chartsV4.{channels,bullet,assistSpark}`；新增 `chart-assist-weeks.test`、`tests/chart-geometry-v4.test.ts`（`sparklineGeometry`）；`trend-yoy.spec`、`trend-yoy.test` 的圖例與定位器不變（D-V4-16 選 B 時同批改）；`revamp-r4` 目標斷言不變；mounted-testids V4-2 錨點（「各指標每週」收合時掛載） | KPI 帶底 ≤ 420（1440、1280）；KPI 帶元素截圖與 V4-1 差異 0；未滿週空心點（X40，用合成資料）；`assist-kpi-v1` 既有測試不動 | D-V4-6、16、18 |
| **MVP 切線** | — | V4-0a 到 V4-2 完成，總覽改版完整；經使用者當次同意可部署 preview，不切正式站（D-V4-28） | — | — | — | D-V4-28 |
| V4-3a 通路健檢（一） | M | G9 差額類規則內嵌影響條（`REV_UP_CM_DOWN` 空心條；費用規則影響為正時用有利色）；C27＋G10（各通路的剩與段比率用 `profitWaterfall(snapshot, channel)`，`channelStructure` 只管四項費用合計與超過 100）；G10 依通路數選 sm 或 lg、> 8 只留表、全部不適用的標題；`--chart-seg-1..3`；G7b（`channelWeeks` 在健檢頁元件內計算、不進 `createSnapshot`、通路 > 8 不計算；寬表 sparkline＋`<details>`「各通路每週」）；`EvidenceSelection` 加 `valueKind`；修正 `ladderMetrics` 的週查找；D-V3-31 若已回覆 B，抽屜加 percent（D-V4-32） | V4-2 | `diagnosis.chartsV4.{impact,share,channelsSpark}`；`chart-structure.test`、`chart-channel-weeks.test` 新增（含 50 通路 × 92 天的記憶體合成資料：不呼叫 `channelWeeks`、不輸出 G7b 與 G10 的列）；`workspace.test`、`evidence-drawer-v3.test`、`chart-geometry-v4.test`（列數 × 列高＋軸高 ≤ 固定高）擴；E2E 新 spec `charts-diagnosis.spec` | 虧損通路超過 100 照常畫；`refund_only` 不適用列；`zero_ad`；七段恆等；每通路的剩＝`profitWaterfall` 逐字相同；合計＝16.2（示範）；水準類規則沒有條；費用合計抽屜不帶「+」、不顯示 `platform_fees` 公式；單一通路週證據不畫全通路階梯；健檢首列底不退；沒有「其他」合併（X38） | D-V4-6、18、19、32 |
| V4-3b 通路健檢（二） | M | C28（calendar，列＝snapshot 週，roving tabindex）＋G11（`dailyHeatmap`、`formatHeatCell`；通路 ≤ 8；標題所指的通路排第一張；格寬與每列張數依 §4.4）；ChartFrame table 模式首次使用；`--chart-heat-1..2`、`--red-100`、`--chart-missing`；`EvidenceFilter` 加 `date`、`sku`；C26＋G12（`<details>`「五項比率走勢」，每張比率各自 Y，標題用區塊名；390 單欄 5 張、框高 sm × 5，不設「更多指標」） | V4-3a | `diagnosis.chartsV4.{heat,rates}`；`evidence-filter.test`、`chart-heatmap.test`、`format-layers.test`（`formatHeatCell`）新增或擴；axe 加三個狀態（資料表展開、從圖下鑽的抽屜、合成資料健檢頁）；keyboard-walk 加熱表 Tab 數；50 通路合成資料的 G11 不渲染斷言 | 熱表格點擊開當日抽屜、篩選片語含日期；null 格；> 92 天改週；390 月曆表寬 ≤ 容器、頁面不捲動；經過熱表 Tab ≤ 3；axe 無 `aria-hidden-focus`；G12 收合時掛載（M1） | D-V4-17、18 |
| V4-4 商品毛利 | M | C25＋`hbarGeometry`；G14（`productPareto`，只在有負值時渲染；圖名「商品毛利為負的商品累計」）；G13（每欄 ≤ 5）；`product-worst`、`product-best` 改為 `after` 常駐（DOM 與 testid 不變；沒有負值時 `product-worst` 照 v3 原樣）；商品抽屜 builder 抽出成 `product-evidence.ts`（只搬移）；ChartFrame `headingLevel`；`filter.sku` 接線 | V4-3b | `products.chartsV4.{pareto,variance}`；`chart-pareto.test`、`tests/charts-products-v4.test.tsx` 新增；`product-page-v3.test`、`product-highlights.test`、`chart-geometry-v4.test` 擴；`keyboard-walk.spec` 加商品頁「第一張圖的資料表 summary」里程碑；`axe-sweep.spec` 加合成資料商品頁狀態 | 末筆累計＝負值合計、末筆累計佔比 100%（`refund_only`、合成資料）；示範資料不渲染 G14；`keyboard-walk` 的 `product-worst` 里程碑仍在第一張圖的資料表 summary 之前 | — |
| V4-5 假設試算 | M | G15（方案比較表之前，一頁一份；標題「{方案}試算後比現況多賺／少賺」）；C29＋G16（`thresholdPoints`；依 D-V4-20 建議只畫點；使用者點 `--chart-total`）；邊界規則（範圍、L＝0、超界、stale、三點未填） | V4-4 | `scenarios.chartsV4.{variance,threshold}`；`chart-threshold.test` 新增；`scenario-sensitivity.test`、`decision.test` 擴；mounted-testids `scenario-\d+` 容器；`axe-sweep.spec` 加「試算後展開 `scenario-sensitivity`」狀態 | X29：敏感度輸入預設空白不變；G16 所有點在 [−90%, +100%]；golden 284.00／264.00／19.70 不變；到第一個結果的鍵盤步數不增加；G15 頂符合 B1；總覽頁 `main .chart-frame:visible` 數量不變（隱藏的試算工作台內的 G15 不算進去） | D-V4-20 |
| V4-6 會議紀錄 | M | C26＋G19（`meetingSeries`：資料集、通路、本期天數、比較方式改變處斷段；同本期只畫最新）；G15 第二實例（議程 5；每通路一根、上限 6 根；標題「{n} 個通路的選入方案」）；G19 最後一點用 `--chart-total`；G18 取消 | V4-5 | `meeting.chartsV4.{history,scenarios}`；`chart-meeting.test` 新增；`meeting-page.test` 擴；`present-mode.spec` 會議頁斷言不變 | 歷史 < 2 筆等高空狀態；跨資料集或期間長度斷段；投影只顯示議程 1–2 | — |
| V4-7a 資料來源 | M | C30＋G20（`coverageTimeline`；去年同期細線；點缺列段篩問題表）；`IssueList` 加選填篩選與清除鈕（下載內容不變）；C28（matrix）＋G21（`issueDistribution`，0 筆時不渲染）；G20、G21 的單日與單格標題 | V4-6 | `data.chartsV4.*`；`chart-coverage.test`、`chart-issues.test` 新增；`issue-list-v3.test`、`data-workspace-v3.test`、`chart-geometry-v4.test` 擴；E2E 新 spec `charts-data.spec`（`missing_ad_day` 與合成資料）；`axe-sweep.spec` 加 `missing_ad_day` 資料來源頁狀態 | 範圍級缺列退回文字；缺列段點擊到問題表那一列；格加總＝列級問題筆數；下載集合不變 | — |
| V4-7b 匯入精靈與抽屜 | M | G22（對帳表 variance、前處理表 pair）；G23（階梯表 share 條，扣項為負用有利色）；`ladderMetrics` 搬到 `evidence-ladder.ts`（V4-3a 已修正，只搬移） | V4-7a | `importWizard.chartsV4.*`、`evidence.chartsV4.*`；`evidence-ladder.test` 新增；`import-wizard-v3.test`、`evidence-drawer-v3.test`、`bar-cell.test` 擴；`import.spec` 步驟 4 定位器不變 | 匯入路徑點擊數不變；`ladderMetrics` 搬移前後輸出相同；抽屜高度規則不變 | — |
| V4-8 投影與四尺寸總檢 | M | 投影白名單加 `.bridge-section`（只顯示瀑布；橋接表、G6、v2 四欄 `<details>` 隱藏但掛載）；`--text-12`、`--text-13` 投影對應 14px；D-V3-33、34 只在使用者回覆後處理；七頁 390 總檢；mounted-testids 全頁；keyboard-walk 補齊尚未加的頁的資料表 summary 里程碑（商品頁 V4-4 已加）；D-V4-35 回覆 B 而 V4-1 時尚未回覆時在這批做 | V4-1 到 V4-7b | `present-mode.test`、`present-mode.spec`；`shell.presentV3` 既有字串不改 | 投影中 `bridge-waterfall` 可見、`bridge-table` 不可見（X39、只顯示 L1）；字級種類 11 不變；七頁 `scrollWidth ≤ 390`；投影 axe 0 項 | D-V4-8、9、33、35 |
| V4-9a 匯出（一）PDF 與 PPT | M | C31（G1 三個版本、G2 標準與客戶附錄；起訖與小計、有利、不利三種灰階兩兩不同）；C32（G1 原生瀑布，輔助系列命名、有利與不利系列標明絕對值、標籤帶「−」；spike 不成立時 `addShape`；放在哪一張投影片依 D-V4-34）；`EXPORT_THEME` 加圖表色；`ExportVariantSpec.charts` | V4-8 | `exports.chartsV4.*`；`export-variants.test`、`export-header.test`、`pptx-export.test`、`export-theme.test` 擴 | 老闆版 PDF 1 頁、標準與客戶依 D-V4-11；`svg[data-print-chart]` 數量；PPT chart part 數、色屬於 `EXPORT_THEME`、`ppt/media/` 空、負柱不被切、輔助系列名正確；投影片張數依 D-V4-34，既有區塊（一句話、KPI、三件事、通路表、決議、置頂待辦）逐項仍在；三變體數字逐格相同；下載集合不變 | D-V4-10、11、34 |
| V4-9b 匯出（二）Excel 與 Markdown | M | C34「圖表資料」工作表（標準、客戶；G15、G16 不放；標準版每段「版本與算法」列、技術工作表列出 B 級版本；客戶版依 `spec.appendix.technical` 省略兩者）；Markdown 一頁摘要加九項差額表（沒有版本之分）；`export-normalize` 排除（含列級 `isChartV4VersionRow`）；CSV／JSON 不動 | V4-9a | `exports.chartsV4.*`；`excel-export.test`、`export.test` 擴；`export-numeric-stability.test` 不改且必須通過 | 正規化後 sha256 與 V3-7 基準相同；數值基準逐字相同；Excel 工作表數：老闆 2、標準 8、客戶 8；標準版技術工作表列出 B 級版本、客戶版不列；記錄檔案大小差 | D-V4-12、13 |
| V4-10 P2 圖表 | M | G8（`cumulativeDaily`，兩期日序列用 `periodDailyMetrics`）；G17（`actionDueBuckets`）；G24（`next/dynamic` 與首載證明）；P2 圖的 Excel 段落；時間不夠時逐張記為「未做」 | V4-9b | `overview.chartsV4.cumulative`、`actions.chartsV4.due`、`products.chartsV4.scatter`；`chart-cumulative.test`、`chart-actions.test` 新增；`pnl-table.test` 不改且通過；`charts-products-v4.test` 擴；`axe-sweep.spec` 加「待辦頁新增一張卡」狀態 | 兩期末日累計各＝該期合計（示範 1,269,792.73／1,868,626.68）；散佈 chunk 不在首載；X37 仍成立（總覽 `main .chart-frame:visible` 收合時 4、展開進階後 5） | D-V4-12、21、22 |
| V4-11 收尾與上線 | M | 棘輪與 chart-lint 上限調到實測；`chartCategoryColors`、`readChartColors` 接用或保留並註明；STATUS、DECISIONS、RELEASES（版本依 D-V4-1）、README；feature-retention 全表；§2.2 全部指標填真實值；Lighthouse、axe、首屏、13 項 HTTP；tag 與正式站（需當次同意） | 全部；H6 | 不加新 key | 不加功能；未達標的指標誠實列出；H6 未執行寫「未執行／待人工」 | D-V4-1、28 |

### 9.4 依賴鏈與時程

依序為 V4-0a、V4-0b、（H5）、V4-1、V4-2、V4-3a、V4-3b、V4-4、V4-5、V4-6、V4-7a、V4-7b、V4-8、V4-9a、V4-9b、V4-10、V4-11、（H6）；共 16 批，**至少** 16 個工作階段。V4-0 與 V4-7 在開工前就依工作量拆成 a／b：V4-0 原有 13 項（含 AST 掃描器、capture 與 metrics、PPT spike、合成資料、四頁兩尺寸設計稿與全套基準量測；v3 的設計稿放在 L 級的 V3-1，不在 V3-0）；V4-7 一批要做 4 張圖、跨資料來源、精靈、抽屜三個介面。V4-2 結束是 MVP 切線；V4-10 是 P2，時間不夠時可以整批延後，不影響上線（但要在 STATUS 與 RELEASES 寫明）。人工時間另計：H5 約 2–3 天（招募與審查）、H6 約 1 週（兩版同場對照）。

---

## 10 風險與需拍板事項

### 10.1 風險

| 風險 | 處理 |
|---|---|
| 圖一多回到 tile 牆、看起來像 AI 生成 | X37 與 CL-9 每頁上限；§1.4 判準與 §2.3 決策表逐頁驗收；內嵌條優先；H5 審查；A4 盲評 |
| 負值、缺值讓堆疊、Pareto、累計、熱表失真 | §7.4 規則；B 級函式用 golden、`refund_only`、`zero_ad` 與 4 通路合成資料測試 |
| 色彩預算被類別色與熱表撐爆 | 只有不利上色；熱表兩階；結構圖灰階；非本期序列用 `--chart-total`；本輪不用類別色 |
| bundle 與 390 TBT 上升 | 硬門檻；inline SVG 優先；只用首載已有的 Recharts 模組；散佈只能 `next/dynamic` |
| KPI 帶只剩 1px（419／420） | KPI 帶不加任何圖（D-V4-6）；1440 與 1280 硬斷言 |
| 主層否定句超過上限 | 限制句放 `<details>` 或抽屜；V4-0 記錄各頁現況，B8 每批量 |
| PPT 原生圖在不同簡報軟體呈現不同 | 只用 `bar`、`line`；數字與資料表逐格相同；V4-0b spike；不成立時 `addShape`；需要使用者提供開檔用的 PowerPoint 版本 |
| 示範資料只有 2 通路、無虧損日或缺列日可看 | `tests/fixtures/synthetic-4-channel/`（D-V4-31）；`fixtures/demo_tw` 仍待 F15 |
| 既有 E2E 定位器受圖型變更影響 | 既有定位器全部保留；新圖只用 testid 與 labels；`e2e-text-assertions.csv` 勾銷 |
| H4 從未執行，沒有 v3 可用性基準 | H6 同場量 v3 正式站與 v4 |
| 佔比類數值不能開抽屜 | 依 D-V3-31 由 D-V4-32 連動；未拍板前點段開金額抽屜 |
| 匯出檔大小（D-V3-36 未決） | 本輪不改 CSV／JSON；圖表資料工作表只放圖上資料，V4-9b 記錄檔案大小差 |
| 批次多（16 批） | MVP 切線在 V4-2；P2 集中在 V4-10，可整批延後 |
| 大量通路（系統允許 1,000 個）讓健檢頁的週與日運算、熱表格數爆量，而 B9 與 TBT 只用 2 通路的示範資料量 | G7b、G10、G11 只在通路 ≤ 8 時計算與渲染；`channelWeeks` 不進 `createSnapshot`；V4-3a、V4-3b 用 50 通路 × 92 天的記憶體合成資料斷言 |

### 10.2 需拍板事項摘要（拍板前沿用 v3 行為；完整選項見 `09_DECISIONS_PENDING.md`）

| 代號 | 事項 | 建議 | 影響批次 |
|---|---|---|---|
| D-V4-1 | 目標版本號 | v4.0.0 | V4-0a、V4-11 |
| D-V4-2 | 工作分支 | 自 `main`（`21d621c`）開 `revamp/v4` | V4-0a |
| D-V4-3 | 禁區 diff 基準 | `625bfa5` 為主，並保留 `82b70df` 的既有命令 | 每批 |
| D-V4-4 | 改寫 v3 B3 | 圖先，表為核對與替代 | V4-1 起 |
| D-V4-5 | 圖優先時原表格去向 | 既有常駐表常駐、新圖的表放 `<details>`、核對表只加內嵌條 | V4-1 起 |
| D-V4-6 | F17 sparkline 位置 | 其他常用指標表與通路寬表，不進 KPI 帶 | V4-2、V4-3a |
| D-V4-7 | 手機 390 | 顯示圖並依 §7.6 降級 | 每批（擋 V4-1） |
| D-V4-8 | 投影模式範圍 | 只在總覽加拆解區的瀑布（橋接表 L3 隱藏），會議頁不變，不擴到其他頁 | V4-8 |
| D-V4-9 | 投影軸標與副標字級 | `--text-12`、`--text-13` 對應 14px | V4-8 |
| D-V4-10 | PPT 原生圖與瀑布畫法 | `addChart` 堆疊長條加透明底段（輔助系列命名）；spike 不成立改 `addShape` | V4-0b、V4-9a |
| D-V4-11 | PDF 頁數 | 老闆版 1 頁不變；標準、客戶版可多 1 頁附錄 | V4-9a |
| D-V4-12 | Excel 與 Markdown 的圖表資料 | Excel 標準與客戶版加「圖表資料」（標準版附版本列，客戶版不附）；Markdown 一頁摘要加九項差額表（沒有版本之分） | V4-9b、V4-10 |
| D-V4-13 | CSV 新增 daily 列與週列 channel 欄 | 不新增（D-V3-36 拍板前） | V4-9b |
| D-V4-14 | 新增分析事件名 | `chart_clicked`、`chart_table_opened` | V4-1 |
| D-V4-15 | B 級函式版本常數 | 每個函式一個；新算出的值用 `metricVersion`，整理後的 domain 值用 `arrangeVersion` | V4-0a 起 |
| D-V4-16 | 各通路圖型 | 維持雙長條＋差額條 | V4-2 |
| D-V4-17 | 熱表形式、色階與鍵盤 | 每通路月曆格（列＝snapshot 週）、兩階、格內 `formatHeatCell`、整張 1 個 Tab 停留點 | V4-3b |
| D-V4-18 | 新 token | 新增 8 個語意 token 與 `--red-100` | V4-2 起 |
| D-V4-19 | 相鄰段色對比 | 1px 分隔線 | V4-3a |
| D-V4-20 | 銷量門檻圖畫法 | A′ 只畫既有點、不連線（A 級）；選 A 時連線是模型值，等級寫「A（模型值，來源 `scenario-sensitivity-v1`）」並加三項必要測試 | V4-5 |
| D-V4-21 | 散佈圖 | 做，P2，`next/dynamic` | V4-10 |
| D-V4-22 | 累計線 | 做，P2，只畫水平目標線 | V4-10 |
| D-V4-23 | X26–X40 與 chart-lint | 列入並自動檢查（CL-1 到 CL-11） | V4-0a |
| D-V4-24 | First Load JS 門檻 | v3.0.0 +5%＝545,397 bytes 硬斷言；其他只看 gzip 總量 | V4-0a |
| D-V4-25 | testid 命名與基準 | `chart-{page}-{id}` 系列；既有 12 個圖表 testid 不改；v2＋v3 雙基準，另加 V4-1 起逐批追加的 `testids-v4-added.txt` | V4-0a |
| D-V4-26 | labels 錨點與既有字串快照 | 新建 `V4_NEW_KEY_PREFIXES`；加 v3.0.0 全部葉節點快照 | V4-0a |
| D-V4-27 | 人工關卡 | H5 擋 V4-1、H6 擋上線；可比照 v3 略過 | V4-0a（擋批）、V4-0b（是否產出設計稿）、V4-1、V4-11 |
| D-V4-28 | MVP preview 策略 | V4-2 後經當次同意部署 preview | V4-2 後 |
| D-V4-29 | v3 尚待拍板的 D-V3-26／27／29–37 | 逐項處理（09 有對照表） | 依項 |
| D-V4-30 | 圖例位置規格 | 規格改為「標題列右側」以符合實作 | V4-1 |
| D-V4-31 | 4 通路合成測試資料 | 建在 `tests/fixtures/`（含缺列、扣項為負、商品毛利為負） | V4-0b |
| D-V4-32 | 佔比類數值開抽屜 | 與 D-V3-31 一起選 B | V4-3a |
| D-V4-33 | X18 與 G6 | 改寫 X18 為「不得以分歧長條取代瀑布當橋接主圖」，G6 只在 ≤ 767px 顯示 | V4-1、V4-8 |
| D-V4-34 | PPT 瀑布放哪一張投影片 | A 新增第二張放瀑布，既有第一張一個區塊都不動（同步改 `pptx-export.test` 的張數斷言） | V4-0b（試排）、V4-9a |
| D-V4-35 | 總覽首屏「最大一項」三處用語 | A 不統一：產品字串不動，可用性測試 T1 改問「貢獻變化拆解中扣最多的一項」並附答案鍵（選項 B 見 09） | V4-0a（T1 題目）、V4-1 或 V4-8（選 B 時） |

### 10.3 需要使用者提供

見 `09_DECISIONS_PENDING.md` 末段：H5 審查者、H6 受試者與盲評者、PPT 開檔用的簡報軟體版本、合成資料同意、每次部署的當次同意。

---

## 附錄 A 代號對照（最終代號與三份草案）

| 最終 | P1 財務報表專業 | P2 讀者效率 | P3 工程與護欄 | 處理 |
|---|---|---|---|---|
| G1–G3、G5、G6 | G1–G3、G5、G6 | G1–G3、G5、G6 | G1–G3、G5、G6 | 合併 |
| G4 | G4（雙長條＋差額欄） | G4，G8 啞鈴取代 | G4 啞鈴 | 預設維持雙長條，啞鈴為 D-V4-16 選項 |
| G7 | G7a、G7b | G7（KPI 帶）、G14 | G7、G11 | 取 P3 位置，不進 KPI 帶 |
| G8 | G23 | G10 | G9 | 合併，P2 |
| G9 | — | G11（前 8＋其他） | G10（清單內嵌） | 取 P3，刪除「其他」合併 |
| G10 | G9（遇負退回） | G12（超過 100 照畫） | G8（遇負退回） | 取 P2 的畫法，改 inline SVG |
| G11 | G10（通路列 × 日期欄） | G13（日期列 × 通路欄） | G12（三階） | 改為每通路月曆格、兩階 |
| G12 | G8 | — | G13 | 取 P1，放進 `<details>` |
| G13 | G12 | G16（啞鈴） | — | 取 P1 變異長條 |
| G14 | G11 | G15 | G14 | 合併 |
| G15 | G14 | G18 | G16 | 合併 |
| G16 | G15（範圍 −100%） | G19 | G17 | 範圍改 [−90%, +100%]，只畫既有點（D-V4-20） |
| G17 | G16（28 天時間軸） | G20（計數條） | G18 | 取 P2 計數條，P2 |
| G18 | G18 | G21 | — | 審查後取消（只有兩列、不同指標，條長互比沒有意義），代號不重用 |
| G19 | G17 | G22 | G19 | 合併，用 C26 不套 panel |
| G20 | G19 | G23 | G21 | 合併；非本期序列不用強調色 |
| G21 | G20 | G25（P2） | — | 升為 P1 |
| G22 | G21 | G24 | G22 | 合併 |
| G23 | G22（小瀑布） | G26（內嵌條） | G23 | 取 P2 內嵌條，不需未匯出的 `buildBars` |
| G24 | G13 | G17 | — | P2，`next/dynamic` |
| 不採用 | — | G9 管理損益表列 sparkline | G15 毛利率分布條 | 對讀者價值低，避免 tile 牆 |

## 附錄 B 評審必修項的處理位置

| # | 必修項 | 處理位置 |
|---|---|---|
| 1 | B 級整理函式要有獨立版本常數，並由 `metricVersion` 帶出 | §4.3、§6.4、§8.7、D-V4-15 |
| 2 | 銷量門檻圖範圍要在 [−90%, +100%]，不外插 | §4.3 G16、§7.4、X29、D-V4-20 |
| 3 | 門檻邊界：L＝0、超界、快照過期 | §4.3 G16、C29 |
| 4 | X18：投影、PDF、PPT 都保留瀑布，G6 只當輔助 | §5.9、§5.10、§7.7、X39、D-V4-10、D-V4-33 |
| 5 | PPT 負柱不被切掉 | C32（軸範圍依資料、四系列色） |
| 6 | 虧損通路不退回、照常畫 | §4.3 G10、C27 |
| 7 | 備份 schema 是 v5 | §0、§8.8 |
| 8 | 不存在的 token（`--chart-surface`、`--red-200`） | 改用 `chartColors.surface`；`:root` 新增 `--red-100`（§6.5） |
| 9 | 首載 chunk 符號斷言在基準就會失敗；ComposedChart 不在原始碼 import | §8.2、B5 |
| 10 | KPI 帶只剩 1px | §2.3、§5.1、D-V4-6 |
| 11 | testid 命名一致、不用索引、不撞 `kpi-` 前綴 | §4.7、CL-2 |
| 12 | 未滿 7 天的週造成假下跌 | §7.4、X40 |
| 13 | 熱表寬度與方向；熱表不能在 `aria-hidden` 內；分級屬 B | G11、C28、ChartFrame `mode="table"`、D-V4-17 |
| 14 | CSV 檔案大小與範圍擴張 | D-V4-13（預設不新增） |
| 15 | D-V3-35 未拍板不得排入範圍 | V4-2「只在使用者回覆 A 後」、D-V4-29 |
| 16 | `buildBars` 未匯出、`ladderMetrics` 在元件內、`filter.day` 不存在 | G23 改內嵌條；`ladderMetrics` 搬到 `evidence-ladder.ts`；`EvidenceFilter` 加 `date`、`sku`（V4-3b） |
| 17 | chart-lint 誤抓 `ReferenceArea`；height 規則在基準就失敗 | CL-6 完整名稱比對；CL-10 限定範圍 |
| 18 | 三件事首列底門檻要 ≤ 561 | B2 |
| 19 | 不可相加的「其他」合併 | G9、X38 |
| 20 | 草稿殘留、箭頭字元、範例句與示範資料不符 | 全文不用箭頭字元；G1 句例改為示範資料實際句 |
| 21 | 小倍數 panel 套 panel | C26 |
| 22 | G1 版面矛盾（左右並列卻放 `after`） | §6.1 `aside`、保留 `.bridge-section`、`.unit-note`、`#bridge-title` |
| 23 | 灰階段與待補框對比不足 | §6.5（gray-700／500／400、`--chart-missing`＝gray-400） |
| 24 | 老闆版 PDF 是 1 頁 | §5.10、D-V4-11 |
| 25 | 刻度格式函式放錯層 | `formatAxisWan` 在 `presentation.ts`（§6.4） |
| 26 | 非本期資料用強調色、繞過 `chart-theme.ts` | §7.1、§4.4 |
| 27 | 限制句計入否定句上限 | B8、§7.3 |
| 28 | B3 與使用者指令衝突 | D-V4-4 |
| 29 | 批次過大、P2 圖與收尾同批、元件先做沒人用 | §9.3（V4-9a／9b、V4-10 與 V4-11 分開、元件隨頁面） |
