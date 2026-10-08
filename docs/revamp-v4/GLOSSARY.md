# EC ProfitLens v4 名詞表增補（GLOSSARY）

> 由 `docs/revamp-v4/01_PRD.md` §4（圖表總目錄）、§7（圖表規範）、§8.5（標籤單一來源）與 `docs/revamp-v4/06_BATCHES.md` V4-0a 第 2 項整理。原則與 v3 相同：**一個概念只用一個詞**。
>
> - **本表是 v3 名詞表的增補**：`docs/revamp-v3/GLOSSARY.md` 的 30 個名詞、方向詞固定用法與介面用語對照全部繼續有效；本表只收 v4 新增的圖名、圖表記號與介面用語，以及 v4 要特別釘住寫法的既有詞。兩份衝突時以本表為準。
> - **生效方式**：v4 不改任何既有字串（`verification/revamp-v4/labels-v3.flat.json` 的 2,581 個葉節點逐鍵逐字相同，`tests/labels-structure.test.ts` 斷言）。本表的詞只用在 V4-1 起新增的 `{group}.chartsV4.*` 鍵（11 個前綴見 `tests/labels-structure.test.ts` 的 `V4_NEW_KEY_PREFIXES`），以及 v4 新增的匯出內容（Excel「圖表資料」、PPT 圖標題與輔助系列名、PDF 圖說）。能沿用既有字串時一律沿用，不另造同義的新鍵。
> - **指標名不在這裡定義**：圖例、欄名、小倍數小標、抽屜標題中的指標名一律取 `metricDefinitions`（`src/application/presentation.ts:51`，字串來自 `labels.metrics.<name>.headline／short`），見 §2。
> - **拍板**：依 2026-10-08 使用者回覆「都依建議值，開工」（`docs/revamp-v4/09_DECISIONS_PENDING.md`）；新字串在人工關卡 H5（設計稿審查）一併審，不另設文案審稿。標「建議」的標準名是本表依 PRD 與 `CHART_CATALOG.md` 實作卡整理的寫法，H5 有意見時在該批開工前改本表，不改既有字串。
> - **copy-scan**：`chartsV4.*.title` 計入 L1 子句長度（每子句 ≤ 14 字，`scripts/lib/copy-scan.mjs` 的 `L1_KEY_PATTERNS`）；「賠錢」「虧損」在 `products.chartsV4.*` 計入同義詞黑名單（同檔 `SCOPED_BLACKLIST`）。v3 的黑名單（「變化」「數據」、沒有「淨」的「營收」、「行動」等）對新鍵照樣有效。

## 1 名詞表（v4 增補）

「出現位置」欄的 G 代號見 PRD §4.1；「labels key」是預計放的位置，實際鍵名以該批的 labels 錨點為準。

| # | 概念 | v3 用詞 | v4 定案用詞 | 短名 | 一句定義（L2） | labels key（預計） | 禁用的同義詞 | 出現位置（G 代號） | 依據 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 每 100 元淨營收的去向 | 無（各通路只能在 G2「本期利潤結構」逐一切範圍看） | **每 100 元淨營收去向** | 每 100 元去向 | 每個通路每 100 元淨營收被商品成本、通路費用合計、廣告費各用掉幾元，最後剩幾元或虧幾元。 | `diagnosis.chartsV4.share.*`；全部通路都不適用時 `title.notApplicable`「每 100 元淨營收去向，各通路都不適用」 | 成本結構、費用結構、利潤結構（「本期利潤結構」是 G2 的既有名稱）、獲利拆解 | G10；Excel「圖表資料」 | 06_BATCHES V4-0a 第 2 項；PRD §4.2 G10 |
| 2 | 剩／虧（每 100 元） | 「每 100 元淨營收，扣完廣告剩 {n} 元」（`overview.profit.title`） | **扣完廣告剩 {n} 元**／**扣完廣告虧 {n} 元** | 剩／虧 | 每 100 元淨營收扣完商品成本、通路費用與廣告後剩下（或倒貼）的元數，到一位小數。 | `diagnosis.chartsV4.share.title.*`、`segments.remain` | 賺、利潤、淨利、盈餘 | G2（既有）、G10 | v3 GLOSSARY #4 與 `overview.profit.title` 同一寫法 |
| 3 | 涵蓋範圍的圖 | 無（缺列日只散在問題表） | **涵蓋時間軸** | 時間軸 | 銷售、通路費用、廣告三份檔案各自涵蓋到哪天、哪天哪個通路缺列。 | `data.chartsV4.coverage.*` | 資料覆蓋率、完整度、時間線、甘特圖 | G20 | 06_BATCHES V4-0a 第 2 項；PRD §4.2 G20 |
| 4 | 缺列 | 「沒有廣告列」「缺少此日期及通路的費用列」（問題表） | **缺列**（缺 {start} 到 {end} 共 {n} 天；只有 1 天時寫「缺 {date} 1 天」） | 缺列 | 某天某通路在通路費用或廣告檔裡沒有任何一列；缺列不能當成零費用或零投放。 | `data.chartsV4.coverage.title.{missing, missingOneDay}` | 缺資料、遺漏、空白（指缺列時） | G20、G21 | PRD §4.2 G20 |
| 5 | 無列 | 無 | **無列** | 無列 | 銷售檔在那一天沒有任何一列；無列不等於零銷售。 | `shell.chartsV4.common.noRows`、`data.chartsV4.coverage.noRows` | 零銷售、沒有銷售 | G20 | PRD §4.3 G20 |
| 6 | 近幾週的走勢欄 | 無 | **近 {n} 週** | 近 {n} 週 | 本期最後幾個完整或未滿的週（n＝實際週數，上限 8），每週一點；只看平、升、降，不標值。 | `overview.chartsV4.assistSpark.head`、`diagnosis.chartsV4.channelsSpark.head` | 趨勢、走勢（欄名）、最近 {n} 週、過去 {n} 週 | G7a、G7b | 06_BATCHES V4-0a 第 2 項；PRD §4.1 G7 |
| 7 | 近 {n} 週的資料表 | 無 | **各指標每週**（總覽）／**各通路每週**（健檢） | — | 「近 {n} 週」欄每一點的數字；欄是週，列是指標或通路。 | `overview.chartsV4.assistSpark.tableTitle`、`diagnosis.chartsV4.channelsSpark.tableTitle` | 每週明細、週報表 | G7a、G7b | PRD §4.5 G7 |
| 8 | 週 | 每週趨勢的週（`src/application/workspace.ts:80`） | **週**：從期間起日起每 7 天一段 | 週 | 從所選期間的第一天起每 7 天一段；最後一段可能未滿 7 天。不是週一起算的日曆週。 | 沿用 `overview.trendV3.*` 的週標示 | 日曆週、自然週、ISO 週、W{n} | G3、G7a、G7b、G11（月曆的列）、G12；管理損益表的每週欄（既有） | 06_BATCHES V4-0a 第 2 項 |
| 9 | 未滿 7 天的週 | 「最後一週未滿 7 天」「未滿 7 天」（`overview.trendV3.incompleteNote／incompleteShort`） | **未滿 7 天**（沿用既有字串） | 未滿 7 天 | 期間最後一段不足 7 天；金額與件數不當完整週畫（空心點），比率可照畫（X40）。 | 沿用 `overview.trendV3.incompleteShort`；共通字串 `shell.chartsV4.common.incompleteWeek` 只在既有字串不適用時才加 | 不完整週、殘週、半週 | G3、G7、G12 | PRD §7.4、X40 |
| 10 | 完整週 | 「最近完整週淨營收」（`overview.trendV3.takeaways.lastCompleteWeek`） | **完整週** | — | 滿 7 天的週。 | 沿用既有 | 整週 | G3、G7 | v3 既有 |
| 11 | 累計 | 無 | **累計**（含「累計佔比」「本期累計」） | 累計 | 由第一天（或第一個商品）起逐一加總到目前這一點的金額；是水準值，不帶正負號。 | `overview.chartsV4.cumulative.*`、`products.chartsV4.pareto.cumulative` | **累積**（同義，一律不用）、累加、合計（指逐點累加時） | G8、G14；抽屜（`valueKind: "level"`） | 06_BATCHES V4-0a 第 2 項 |
| 12 | 累計佔比 | 無 | **累計佔比**（佔商品毛利為負合計） | 累計佔比 | 前幾個商品的商品毛利為負額合計，佔全部商品毛利為負額合計的比例；兩者都先取反成正數再相除。 | `products.chartsV4.pareto.columns.share` | 累積佔比、累積百分比、貢獻度 | G14 | PRD §4.3 G14（`product-pareto-v1`） |
| 13 | 商品毛利為負 | 「只看本期商品毛利為負」（`products.comparison.negativeOnly`） | **商品毛利為負** | 毛利為負 | 這個商品（含通路）在本期的商品毛利小於 0；只看商品毛利，不含通路費用與廣告，不代表扣完所有費用後賠錢。 | `products.chartsV4.pareto.*` | **賠錢、虧損**（商品頁禁用，copy-scan 擋 `products.chartsV4.*`）、負毛利、虧本 | G14、G24；商品頁所有 v4 新字串 | 06_BATCHES V4-0a 第 2 項；AGENTS.md「商品畫面只呈現商品毛利」 |
| 14 | 商品毛利兩期差額 | 「商品毛利差額：下降最多優先」（排序）、「商品毛利增加最多 {n} 個」 | **商品毛利少 {amount}**／**商品毛利多 {amount}**；欄名「減少最多」「增加最多」 | 差額 | 同一個商品（含通路）本期商品毛利減上期商品毛利。 | `products.chartsV4.variance.*` | 下滑、衰退、變化 | G13 | v3 GLOSSARY 方向詞（商品毛利用多／少）；PRD §4.2 G13 |
| 15 | SKU 與通路的寫法 | 「SKU · 通路」（前 10 名表、完整表） | **{SKU} · {通路}**（示範資料的通路用別名，例如「SKU-020 · 平台 · MARKETPLACE」） | — | 商品列是 SKU × 通路，同一個 SKU 在兩個通路是兩列。 | 沿用既有組法 | 只寫 SKU、通路寫在括號 | G13、G14、G24 | PRD §4.2 G13 |
| 16 | 通路費用合計 | 無（v3 GLOSSARY 沒有收錄） | **通路費用合計** | 通路費用 | 平台抽成、金流手續費、物流與包材費、其他變動費用四項相加，是水準值。 | `diagnosis.chartsV4.share.feesTitle` | 通路費、通路成本、變動費用合計、平台費用、費用合計（未標明哪四項時） | G10 圖例與資料表欄名、四項費用段的抽屜標題（`channel-structure-v1`） | 06_BATCHES V4-0a 第 2 項；PRD §4.3 G10 |
| 17 | 廣告費 | 「廣告投放費」（headline）、「廣告費」（short） | **廣告投放費**；空間不夠時寫**廣告費** | 廣告費 | 同 `metricDefinitions.ad_spend`。 | 取 `metricDefinitions.ad_spend.label／shortLabel` | **廣告費用**、廣告支出、行銷費 | G10 圖例、G1 橋接、所有新欄名 | 06_BATCHES V4-0a 第 2 項 |
| 18 | 試算結果的方向 | 「試算後 {contribution}；與現況相比 {delta}」 | **{方案}試算後比現況多賺 {amount}**／**{方案}試算後比現況少賺 {amount}**／**{方案}試算後與現況持平** | 試算後 | 試算是條件差額（`src/domain/scenarios.ts:35`），方向詞前一定加「試算後」，不寫成已發生或會發生的獲利。 | `scenarios.chartsV4.variance.title.{more, less, flat}` | 預計多賺、預測、將會、可以多賺、省下 | G15（試算頁） | 06_BATCHES V4-0a 第 2 項；AGENTS.md（不得把靜態試算稱為營收預測） |
| 19 | 試算資料表欄名 | 「試算後的扣廣告後貢獻」（`scenarios.inputs.resultTitle`）、「與現況相比」（`scenarios.inputs.vsBaseline`） | **沿用既有兩個字串** | — | 試算圖的資料表欄名與方案比較表同一組字，不另立新鍵。 | 沿用既有 | 試算差額、預估差額、與基準相比 | G15、G16 的資料表 | 06_BATCHES V4-0a 第 2 項；PRD §4.5 G15 |
| 20 | 會議裡的方案圖 | 「選入方案」（議程 5） | **{n} 個通路的選入方案** | — | 議程 5 每個通路選入的一個方案各一根；各通路的現況基準不同，不跨通路相加、不挑最大值。 | `meeting.chartsV4.scenarios.*` | 最佳方案、方案排名 | G15（會議實例） | PRD §4.2 G15 |
| 21 | 一天虧 | 「{通路} 扣完廣告虧 {amount}」（`overview.channelsV3.title`） | **{通路} 有 {n} 天虧**；**虧**＝取位到元後仍為負 | 虧 | 某通路某天的扣廣告後貢獻取位到元後仍小於 0（與 v3 通路結論句同一規則，`src/application/chart-takeaways.ts:101-103`）。 | `diagnosis.chartsV4.heat.title.{loss, none}` | 赤字、虧損日（標題）、賠錢的一天 | G11 | PRD §4.2 G11 |
| 22 | 星期欄頭 | 無 | **一、二、三、四、五、六、日**（欄頭標星期，每欄的星期固定） | — | 月曆的欄是該週第 1 到 7 天；因為週從期間起日算，第一欄不一定是星期一，欄頭照實際星期標。 | `diagnosis.chartsV4.heat.weekdays.*` | 週一到週日（「週」已指 7 天一段，欄頭不再用「週」字）、Mon–Sun | G11 | PRD §4.4 G11 |
| 23 | 影響金額條的兩種條 | 無 | **空心條**（扣廣告後貢獻的總差額）／**實心條**（各項費用的差額） | — | 健檢清單只對兩期差額類規則畫條；「淨營收多，卻少賺」（`REV_UP_CM_DOWN`）的金額是扣廣告後貢獻的總差額，畫空心，四個費用負擔規則畫實心，同一把尺。 | `diagnosis.chartsV4.impact.totalNote` | 總計條、加總條 | G9 | PRD §4.3 G9 |
| 24 | 期限分布 | 無 | **{n} 件逾期，{m} 件 7 天內到期**；四格「逾期」「7 天內」「之後」「未填期限」 | — | 7 天內＝今天到今天加 6 天（含今天）；逾期＝有期限、早於今天、未完成。 | `actions.chartsV4.due.*` | 快到期、即將到期、過期（指逾期時） | G17 | PRD §4.2 G17 |
| 25 | 會議歷史的斷段 | 無 | **不同資料集**／**期間不同** | — | 兩次會議的資料集、通路集合、本期天數或比較方式不同時，線在中間斷開並標示原因。 | `meeting.chartsV4.history.{differentDataset, differentPeriod}` | 資料不一致、無法比較 | G19 | PRD §4.3 G19 |
| 26 | 問題分布 | 無 | **{檔案}的{原因}最多，{n} 列**；只有一格時 **{檔案}有 {n} 列{原因}** | — | 問題表依檔案 × 原因計數；只有一個檔、一種原因時不寫「最多」。 | `data.chartsV4.issues.title.{most, single}` | 錯誤最多、問題排行 | G21 | PRD §4.2 G21 |
| 27 | 對帳相符 | 無（對帳表差額為 0 時只顯示 0.00） | **相符** | — | 來源合計與本工具合計的差額為 0，不畫條。 | `importWizard.chartsV4.reconciliation.match` | 一致、OK、通過 | G22 | PRD §4.3 G22 |
| 28 | 另 n 項 | 「另有 n 組未列出」（v2）／「查看全部 n 項健檢結果」（v3） | **另 {n} 項**（商品列寫**另 {n} 個**） | — | 只列前 N 項，其餘不加總、不畫「其他」柱，只寫剩下幾項。 | `shell.chartsV4.common.more`、`products.chartsV4.pareto.more` | 其他（當成一根柱或一列合計）、等 | G14、G15（會議實例）、G24 | X38；PRD §7.4 |
| 29 | 超出範圍 | 「門檻超出 −90% 到 +100% 的支援範圍；…」（`scenarios.sensitivity.thresholdOutsideRange`，整句說明） | **超出範圍**（圖下短標；完整說明沿用既有整句） | — | 試算門檻落在銷量變動 −90% 到 +100% 以外，不畫點、不外插。 | `shell.chartsV4.common.outOfRange` | 無解、不可能、無限大 | G16 | PRD §4.3 G16；`docs/SCENARIOS.md:64` |

### 不寫的詞（v4 新字串）

- 預測類：「預測」「預計」「將會」「可望」「趨勢線」「推估」（v4 不做等速目標線與 run-rate，PRD §3）。
- 圖型或顏色本身當結論：「紅色代表」「綠色代表」「看圖可知」。顏色永遠搭配形狀或文字，只有不利上色（D-V3-7）。
- 限制句（「不是因果」「只呈現分布，不代表因果」）只放在資料表 `<details>` 或抽屜，不進主層（PRD §7.3、B8）。
- v3 的禁止仍有效：箭頭字元、驚嘆號、以「注意」加冒號開頭的提示、「智慧」「洞察」「一鍵」、「惡化」「暴跌」「警告」（copy-scan 的既有指標）。

## 2 指標名（一律取 `metricDefinitions`）

圖例、欄名、小倍數小標、抽屜標題、Excel「圖表資料」欄名中的指標名都從 `metricDefinitions[name].label`（全名）或 `.shortLabel`（短名）取，不在 `chartsV4.*` 另寫一份。下表是 v3.0.0 的實際字串（`labels.metrics.<name>.headline／short`），列出來是為了審稿對照，不是新定義。

| 英文 key | 全名（label） | 短名（shortLabel） | v4 常見位置 | 不寫 |
|---|---|---|---|---|
| `gross_sales` | 商品原價收入 | 原價收入 | G1、G6 | 原價營收、總營收 |
| `discounts` | 折扣 | 折扣 | G1、G6 | 折讓 |
| `refunds` | 退款金額 | 退款 | G1、G6 | 退貨金額 |
| `cogs_net` | 商品成本 | 商品成本 | G1、G2、G10 圖例與第一段 | 進貨成本、COGS（主層） |
| `platform_fees` | 平台抽成 | 平台抽成 | G1；G10 併入「通路費用合計」 | 平台費 |
| `payment_fees` | 金流手續費 | 金流費 | G1；G10 併入「通路費用合計」 | — |
| `fulfillment_costs` | 物流與包材費 | 物流費 | G1；G10 併入「通路費用合計」 | 運費（指這一項時） |
| `other_variable_costs` | 其他變動費用 | 其他變動費 | G1；G10 併入「通路費用合計」 | 雜費 |
| `ad_spend` | 廣告投放費 | 廣告費 | G1、G10 圖例與第三段 | **廣告費用**、廣告支出 |
| `net_revenue` | 淨營收 | 淨營收 | G3、G19 小標 | 營收、銷售額 |
| `gross_profit` | 商品毛利 | 商品毛利 | G13、G14 | 毛利（單寫） |
| `contribution_before_marketing` | 扣廣告前貢獻 | 扣廣告前 | G2 | 通路貢獻 |
| `contribution_after_marketing` | 扣廣告後貢獻 | 扣廣告後 | G4、G7b、G8、G11、G15、G19 | 利潤、獲利、淨利 |
| `contribution_margin` | 扣廣告後貢獻率 | 貢獻率 | 其他常用指標 | — |
| `gross_margin` | 商品毛利率 | 毛利率 | G7a、G12 小標、G24 軸名 | 毛利比 |
| `discount_rate` | 折扣率 | 折扣率 | G12 小標、G24 軸名 | — |
| `refund_ratio` | 退款金額比 | 退款比 | G7a、G12 小標 | 退貨率 |
| `fulfillment_burden` | 物流費佔比 | 物流費佔比 | G7a、G12 小標 | — |
| `marketing_burden` | 廣告佔比 | 廣告佔比 | G7a、G12 小標 | 廣告費佔比（PRD §4.2 G12 的描述文字；畫面上以 label「廣告佔比」為準） |
| `mer` | 廣告效率（MER） | MER | G5、G7a | 廣告投報、ROAS |

五項比率（G12）的小標依上表依序是折扣率、退款金額比、物流費佔比、廣告佔比、商品毛利率；分母不同，不做跨比率排名（PRD §4.2 G12）。

## 3 各圖的區塊標準名稱（副標第一段、資料表 summary、Excel 段名）

副標的格式是「標準名 · 期間 · 範圍」（PRD §7.3）；資料表 summary 以既有 `labels.overview.page.dataTable`「表格 · {title}」組出，不另立 summary 字串（CHART_CATALOG §1.4）。標題是結論句，不在這張表。

| 代號 | 區塊標準名稱 | 來源 | 圖型（中文） | 頁面 |
|---|---|---|---|---|
| G1 | 貢獻變化拆解 | 既有 `overview.sections.bridge` | 瀑布圖（並列橋接表） | 經營總覽 |
| G2 | 本期利潤結構 | 既有 `overview.profit.section` | 瀑布圖 | 經營總覽 |
| G3 | 每週淨營收與扣廣告後貢獻 | 既有 `overview.sections.trend` | 折線圖 | 經營總覽 |
| G4 | 各通路扣廣告後貢獻 | 既有 `overview.sections.channelMix` | 雙長條＋差額條 | 經營總覽 |
| G5 | 目標（KPI 帶各格）、損益兩平 MER | 既有 `targets.*`、`assist.breakevenV3.label` | 目標細條 | 經營總覽 |
| G6 | （共用 G1） | — | 變異條（表格內嵌） | 經營總覽 |
| G7a | 近 {n} 週；資料表「各指標每週」 | 新（`overview.chartsV4.assistSpark.*`） | 迷你走勢圖 | 經營總覽 |
| G7b | 近 {n} 週；資料表「各通路每週」 | 新（`diagnosis.chartsV4.channelsSpark.*`） | 迷你走勢圖 | 通路健檢 |
| G8 | 兩期每日累計（建議） | 新（`overview.chartsV4.cumulative.subtitle`） | 折線圖 | 經營總覽（進階） |
| G9 | （共用「健檢結果」） | 既有 `diagnosis.sections.diagnosisList` | 影響金額條（表格內嵌） | 通路健檢 |
| G10 | 每 100 元淨營收去向 | 新（`diagnosis.chartsV4.share.*`） | 堆疊條 | 通路健檢 |
| G11 | 各通路每日扣廣告後貢獻（建議） | 新（`diagnosis.chartsV4.heat.subtitle`） | 月曆熱表 | 通路健檢 |
| G12 | 五項比率每週走勢（`<details>` summary「五項比率走勢」） | 新（`diagnosis.chartsV4.rates.{title, summary}`） | 小倍數 | 通路健檢 |
| G13 | 商品毛利兩期差額 | 新（`products.chartsV4.variance.subtitle`） | 變異長條 | 商品毛利 |
| G14 | 商品毛利為負的商品累計 | 新（`products.chartsV4.pareto.subtitle`） | 排序累計圖（Pareto） | 商品毛利 |
| G15 | 方案差額（試算頁）；{n} 個通路的選入方案（會議） | 新（`scenarios.chartsV4.variance.*`、`meeting.chartsV4.scenarios.*`） | 變異長條 | 假設試算、會議紀錄 |
| G16 | 要賣到多少才划算 | 既有 `scenarios.sections.scenarioBreakeven` | 門檻點 | 假設試算 |
| G17 | 期限分布（建議） | 新（`actions.chartsV4.due.caption`） | 計數條（小表） | 待辦 |
| G18 | （取消，代號不重用） | — | — | — |
| G19 | 會議歷史 | 既有 `meeting.page.history` | 小倍數 | 會議紀錄 |
| G20 | 涵蓋時間軸 | 新（`data.chartsV4.coverage.*`） | 時間軸 | 資料來源 |
| G21 | 問題分布（檔案 × 原因） | 新（`data.chartsV4.issues.*`） | 熱表（分布表） | 資料來源 |
| G22 | （共用對帳表、「本次匯入的前處理」） | 既有 `importWizard.panel.reconciliationTableAria`、`data.sections.dataPreprocessing` | 差額條、成對條（表格內嵌） | 匯入精靈、資料來源 |
| G23 | （共用抽屜階梯表） | 既有抽屜標題 | 佔比條（表格內嵌） | 計算與來源抽屜 |
| G24 | 折扣率 × 商品毛利率（建議；指標名取 `metricDefinitions`） | 新（`products.chartsV4.scatter.*`） | 散佈圖 | 商品毛利（進階） |

## 4 圖型的中文寫法

使用者看得到的字多半不寫圖型名（標題是結論句）；需要寫時（資料表 summary 以外的說明、Excel 段名、PDF 圖說、H5 設計稿審查、文件）用左欄。

| 中文寫法 | 技術名稱（文件、程式碼） | 元件 | 用在 | 不寫 |
|---|---|---|---|---|
| 瀑布圖 | waterfall | C17 | G1、G2；PDF（C31）、PPT（C32） | 階梯圖、橋圖 |
| 變異長條 | variance bar（RankedBars variance 模式） | C25 | G13、G15 | 分歧長條（v3 X18 用語，只在規範文件出現）、增減圖 |
| 變異條 | variance bar cell（表格內嵌） | C24 | G4 差額條、G6、G9、G22 | 迷你長條 |
| 堆疊條 | stacked bar | C27 | G10 | 堆疊長條圖、百分比堆疊圖 |
| 熱表（月曆熱表、分布表） | heat table（calendar、matrix） | C28 | G11（月曆熱表）、G21（分布表） | 熱力圖、熱度圖、熱圖 |
| 小倍數 | small multiples | C26 | G12、G19 | 多重圖、格狀圖 |
| 排序累計圖 | Pareto | C25 pareto 模式 | G14 | 柏拉圖（易與人名混淆）、帕累托圖、80/20 圖 |
| 時間軸 | timeline | C30 | G20 | 甘特圖、時間線 |
| 迷你走勢圖 | sparkline | C19 | G7a、G7b | 走勢線、火花線、小折線 |
| 目標細條 | bullet | C18 | G5 | 子彈圖、進度條、量表 |
| 門檻點 | threshold points | C29 | G16 | 損益兩平線（「損益兩平」保留給 F12 損益兩平 MER，v3 GLOSSARY #22） |
| 散佈圖 | scatter | Recharts ScatterChart（`*-lazy.tsx`） | G24 | 泡泡圖、分布圖 |
| 折線圖 | line chart | Recharts LineChart | G3、G8、G12、G19 | 曲線圖、面積圖 |
| 雙長條 | paired bars | Recharts BarChart | G4 | 對比圖 |
| 計數條 | count bar | C24 count 模式 | G17 | 進度條 |
| 內嵌條（統稱） | inline bar cell | C24 | G4、G6、G9、G17、G22、G23 | 表內圖、資料條 |

不採用的圖型（X20、X26–X40）不給中文名：圓餅、甜甜圈、雷達、樹狀圖、旭日圖、桑基、漏斗、區域圖、雙數值軸、gauge、啞鈴圖（D-V4-16＝A，不做 C35）。

## 5 圖表記號用語（PRD §7.1）

圖例只在無法直接標籤時用，12×2 線段放在標題列右側（D-V4-30）；記號名稱沿用既有字串。

| 記號 | 用語 | 形狀與色 | 既有字串 | 用在 |
|---|---|---|---|---|
| 本期 | **本期** | 實心；線 2px、柱 18px；強調色只給本期資料 | `overview.chartFrame.legend.current`、`overview.trendV3.legend.current`、`shell.periods.current` | G3、G4、G8、G12 |
| 上期 | **上期** | 灰實心；線 1.5px、柱 8px | `overview.chartFrame.legend.previous`、`overview.trendV3.legend.previous` | G3、G4、G8、G12；G20 區帶 |
| 去年同期 | **去年同期** | 灰虛線 4 3，不畫圓點；G20 是時間軸上方 1px 細線 | `overview.trendYoyV3.legend`、`shell.periods.presets.yoy` | G3、G12、G20 |
| 目標刻度 | **目標**（試算圖與健檢清單寫**門檻**） | 空心框或 2×12 刻度，永遠不填色（`--chart-target`） | `targets.columns.target` | G5、G8 目標線、G9 門檻刻度、G16 門檻點 |
| 資料待補 | **資料待補** | 虛線框加文字「資料待補」（`--chart-missing`） | `shell.status.missing`、`overview.chartFrame.missingBar` | 全部圖的缺值柱、格、段 |
| 不適用 | **不適用** | 文字列，不畫條 | `shell.status.notApplicable` | G10（任一扣項為負或淨營收 ≤ 0）、比率分母 ≤ 0 |
| 無資料 | **無資料** | 斷線並標字，不內插、不當 0 | `overview.chartFrame.noData` | G3、G12、G19 缺週 |
| 起訖、小計、中性量 | （不另立用語，直接寫列名） | 實心 `--chart-total`；非本期序列（會議歷史、待辦計數、涵蓋有列、迷你走勢圖、試算點）一律用它 | — | G1、G2、G7、G16、G17、G19、G20 |
| 不利 | 方向詞（少賺、多花、少、降到、轉為虧損）＋「−」 | 實心 `--chart-unfavorable`，唯一語意色 | v3 方向詞 | 全部圖 |
| 有利 | 方向詞（多賺、少花、多、升到、由負轉正）＋「+」 | 灰實心 `--chart-favorable`，不得用綠（D-V3-7） | v3 方向詞 | 全部圖 |
| 期間區帶 | **上期**、**本期**（直接標在區帶內） | 淡底帶 `--chart-band` | `shell.periods.*` | G20；G3 檔期區帶 |

## 6 與 v3 名詞表的關係

- v3 GLOSSARY 的方向詞固定用法（多賺／少賺只用在兩個貢獻、多花／少花用在費用、多／少用在淨營收與商品毛利與件數、升到／降到用在比率）在圖的標題、柱端標值、資料表欄名一律適用；本表 #14、#18、#21 只是把它套到新圖。
- v3 GLOSSARY #12「差額」：圖上的差額條、資料表欄名一律寫「差額」，不寫「變化」「變動」。
- v3 GLOSSARY #25「空值」：圖上只用「資料待補」「不適用」兩種，加上本表的「無列」「無資料」兩個記號用語；不寫「—」「N/A」「0」表示空值。
- v3 GLOSSARY #13「計算與來源」：圖上的柱、點、段、格點開的是同一個抽屜，按鈕文字與抽屜標題沿用 v3。
