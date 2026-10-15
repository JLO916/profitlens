# EC ProfitLens v4.2 PRD：通路設定與群組、單一通路層、分析視角（品類、SKU、交叉表、綜合）

- **一句話目標**：使用者 2026-10-15 的指示有兩項新功能：「現階段所有分析只能分為『DTC』『Marketplace』，這部分需讓使用者能客製化設定為自己擁有的通路來分析，並且要能夠再多一層的單一通路分析」與「分析視角要有『by 通路』『by品類』『by SKU』的個別分析以及綜合分析、交叉分析」。v4.2 在工作台裡加三件事：**通路設定**（顯示名稱、順序、使用者自己編的群組，跟著備份走）、**群組範圍與單一通路層**（期間列的兩層通路選單，七頁整個切到群組或群組裡的單一通路）、**分析視角**（商品毛利頁多一個視角切換：品類、SKU 跨通路合計、通路 × 品類交叉表、綜合）。**四層金額全部由既有的 `src/domain` 函式以通路子集計算；品類與 SKU 的數字只到商品毛利，通路費用與廣告費不分攤、以「未分攤」整筆呈現；不動 `src/domain`、`fixtures/*`、`docs/METRICS.md`；不加 npm 依賴。**
- **同一則訊息的第 1、2 項**（範例檔在正式站無法下載、入口改名「操作導覽」加問號圖示）由 V41-6 修正批（v4.1.2）處理，不在 v4.2（`docs/revamp-v4.1/06_BATCHES.md` V41-6；D-V42-30）。
- **先問再做**：第 3 項有四種讀法（§1.3），調查報告把「範圍誤解」列為首要風險（`understand-critic.md:144`）。D-V42-1 到 D-V42-5 是範圍定義，沒有回覆整輪不開工。
- **上線前 8 批、一次一批**：V42-0 基準與護欄（不改畫面）、V42-1 通路設定、V42-2a 群組層與單一通路層、V42-2b 群組合計列、V42-3 品類與 SKU 視角、V42-4 交叉表與綜合、V42-5 匯出與說明頁、V42-6 收尾與上線（`06_BATCHES.md`）。底線是 V42-0、1、2a、3、5（只做說明頁部分）、6（D-V42-7）。
- **需要你拍板 23 件事（範圍與產品 16 件、技術做法 7 件），另有 8 件預設沿用、不需回覆**（`09_DECISIONS_PENDING.md`）。

| 項目 | 內容 |
|---|---|
| 文件 | v4.2 PRD（草案；拍板前不視為核准） |
| 日期 | 2026-10-16 |
| 基準版本 | v4.1.2（V41-6 完成並上線後的 tag；D-V42-29）。起草時 repo 在 `revamp/v4.1`＝`94918fe`，正式站是 v4.1.1＝`36659ff`，`origin/main`＝`66c241a`（`understand-governance.md:3`） |
| 目標版本 | 建議 v4.2.0（D-V42-6） |
| 工作分支 | `revamp/v4.2`，自 `origin/main`（v4.1.2 發布 commit）開出（D-V42-24）；push 任何分支都會建 preview，視同部署 |
| 依據 | 2026-10-15 的五份只讀調查報告（`understand-item3-channel-model.md`、`understand-item4-perspectives.md`、`understand-workbench-budgets.md`、`understand-governance.md`、`understand-critic.md`，下文以 item3、item4、budgets、gov、critic 加行號引用）；報告自己跑的 `subset-check.mjs`、`partition-check.mjs`、`probe-cross.ts`（對 `66c241a` 的 `src/domain` 只讀）；`AGENTS.md`、`docs/METRICS.md`、`docs/DATA_CONTRACT.md`、`docs/SCENARIOS.md`、`docs/revamp-v4/01_PRD.md` §7 與 §8、`docs/revamp-v3/01_PRD.md` §8 |
| 硬前提 | 財務核心禁區不動、白名單為空（`src/domain/*`、`fixtures/*`、`docs/METRICS.md`、`contribution-v1`、`assist-kpi-v1`、`breakeven-mer-v1`、`src/application/assist-kpi.ts`、`breakeven-mer.ts` 與兩個測試檔）；通路費用與廣告不分攤到品類或 SKU（`AGENTS.md:13-14`、`docs/DATA_CONTRACT.md:42、47`），品類與 SKU 的分析停在商品毛利並寫明；每個金額都能開「計算與來源」；使用者看得到的中文只在 labels 檔；`/` First Load 現值 519,702 bytes、上限 520,451 bytes、剩 749 bytes（budgets:45）；390 五個 TBT 門檻沿用 D-V4-36、D-V4-47；`AGENTS.md:4` 不放個人經歷；任何 push 與部署都要使用者當次明確同意 |

---

## 0 決策摘要（給拍板者）

**使用者看到的問題**：工作台的所有分析看起來只分「DTC」「Marketplace」兩個通路，沒有自己的通路；想看品類、SKU、交叉與綜合的分析時，只有通路 × SKU 的商品列和一個品類篩選。

**repo 裡的事實**（§1.2）：通路本來就是 CSV `channel` 欄的任意字串，產品沒有 DTC／Marketplace 的概念；「只有兩個」是示範資料的顯示別名加上正式站範例檔 404 造成的印象。單一通路分析已經存在（期間列選一個通路，七頁重算）。缺的是：自訂名稱與順序、使用者自己編的群組、從群組往下看單一通路、品類與 SKU 跨通路的合計、通路 × 品類的交叉表、把各層並列的綜合畫面。這些都能用既有 domain 函式算出來，到分精確、可追溯到 CSV 行號，不動禁區。

**v4.2 會帶來的改變**

| # | 誰 | 會看到什麼 | 哪一批 |
|---|---|---|---|
| 1 | 匯入自己資料的人 | 資料來源頁多一個「通路設定」區：每個通路一列，改顯示名稱、排順序、指派到自己建的群組；設定跟著備份走 | V42-1 |
| 2 | 看總覽、健檢、會議的人 | 期間列的通路選單變兩層：全部通路、每個群組、群組裡的每個通路；選群組就是整個工作台切到那幾個通路，選成員就是單一通路；期間摘要寫「{群組名} · {通路名}」 | V42-2a |
| 3 | 同上 | 「全部通路」畫面的 G4 精簡表、通路寬表、週會摘要（畫面與人讀匯出）多群組合計列「{群組名} 合計」；週會摘要的 CSV 不變 | V42-2b |
| 4 | 看商品毛利的人 | 頁首多一列視角切換：通路 × 商品（現況）、品類（含下鑽 SKU、兩期差額圖）、SKU 跨通路合計 | V42-3 |
| 5 | 同上 | 通路 × 品類交叉表（列尾是通路扣廣告後貢獻，格內只到商品毛利）、通路獲利結構表（Σ 品類商品毛利 − 未分攤的通路費用 − 廣告費 ＝ 通路扣廣告後貢獻）、綜合區塊（各層並列、不跨層相加） | V42-4 |
| 6 | 匯出與讀說明的人 | 人讀的匯出用顯示名稱與群組名；Excel「版本與來源」多通路設定對照列；說明頁 `data`、`start`、`products`、`diagnosis` 加步驟與截圖 | V42-5 |

**使用者會看到的那句話**（五處，H9 由使用者確認用字；§6.2）：

> 品類與 SKU 的分析到商品毛利為止，通路費用與廣告費以「未分攤」整筆呈現。

**不做什麼**：不改 `src/domain`、fixtures、`contribution-v1`、`assist-kpi-v1`、`breakeven-mer-v1`、`docs/METRICS.md`；不分攤通路費用與廣告到品類或 SKU（C 級）；不開 `Scope.kind "group"` 或 `"category"`；群組沒有試算、沒有目標、沒有「扣廣告後為負」規則卡（明說）；不加第 8 頁；不做系統預設的通路類型；不加 npm 依賴；不新增分析事件；不改 `/api/*`。

**成本與節奏**：8 批、8 到 11 個工作階段（V42-1 很可能在開工前拆成 1a／1b）。人工關卡：H8 通路設定、兩層選單、範圍文字與限制句（V42-2a 後，約 30 分鐘）、H9 分析視角、邊界句與群組合計列（V42-4 後，約 30 分鐘；群組合計列在 V42-2b 才做，所以併入 H9），各需一次 preview 的當次同意；兩者擋 v4.2.0 正式上線、不擋批次。H6 仍待人工。

**三大風險**

| 風險 | 處理 |
|---|---|
| 第 3 項的範圍誤解：使用者可能只是沒看到自己的通路名（critic:102-103、144） | D-V42-1 先問，含「是否匯入過自己的多通路資料」；A 成立就不建群組層 |
| 使用者把品類的商品毛利讀成「品類獲利」，或要求品類層的扣廣告後貢獻 | 邊界句出現在五處；每個表頭寫「商品毛利」；C3 用恆等式把費用與廣告整筆放在通路列；要求分攤時回覆這是 C 級且需要修改 `AGENTS.md:13-14`（D-V42-3 的 B），不在實作裡偷做 |
| 預算只剩一點：`/` First Load 剩 749 bytes、通路健檢 390 TBT 剩 16.7 ms（budgets:45、53） | V42-0 重訂 `/` First Load 上限（D-V42-20）；新元件全部隨頁載入；群組列與視角表在元件內懶算、不進 `createSnapshot`；加第六步 TBT（D-V42-21） |

---

## 1 背景與需求原文

### 1.1 使用者原話（2026-10-15）

1. 「現階段所有分析只能分為『DTC』『Marketplace』，這部分需讓使用者能客製化設定為自己擁有的通路來分析，並且要能夠再多一層的單一通路分析」
2. 「分析視角要有『by 通路』『by品類』『by SKU』的個別分析以及綜合分析、交叉分析」

同一則訊息的第 1、2 項（範例檔無法下載、入口改名加問號圖示）已開 V41-6 修正批，不在本套件。

### 1.2 現況（v4.1.1；逐條有報告的抽查或實跑）

**通路**

1. 通路是 CSV 裡的任意字串，產品沒有 DTC／Marketplace 的概念。`manifest.channels` 可以是任何不重複的非空字串（`src/domain/validation.ts:19-20`），每一列的 `channel` 不在清單裡就是擋住匯入的 `UNKNOWN_CHANNEL`（`validation.ts:98`）；`src/domain/rules.ts` 沒有任何通路名，和通路有關的規則只有 `scope.kind === "channel"` 時的 `NEGATIVE_CHANNEL_CM`（`rules.ts:131`）（item3:11-14；critic:20）。
2. 匯入精靈從三份檔案收集不重複的通路值、排序後當提案，第 3 步每個通路一個勾選框、標籤是原代碼；固定可見控制 11 個、預算 12 個，所以 2 個以上通路就收進「已選 n 個通路」加 `<details>`（item3:51-61）。取消勾選不會過濾列，只會讓那些列變成 `UNKNOWN_CHANNEL`（item3:66-69）。範例範本用的通路是「官網」，`templates/examples/README.md:18` 寫「通路名稱可自由命名」（item3:20-22）。
3. 「只有 DTC／Marketplace」來自示範資料與顯示別名。除 `refund_only` 外每個 fixture 都恰好是 `["DTC","MARKETPLACE"]`；別名寫死在 `labels.data.demoChannelAlias`（`src/i18n/labels.zh-TW.ts:2106`），只在 `dataset_id` 以 `synthetic-demo` 開頭時套用（`src/application/copy.ts:12-18`）（item3:15-22）。正式站的範例檔從 v2.0.0 起回 404（critic:19），公開站的訪客只看得到示範資料（critic:102）。
4. 單一通路分析已經存在，而且重算整個工作台。期間列的「通路」`<select>` 是「全部通路」加每個通路一個選項（`src/components/shell/period-bar.tsx:118`）；選一個通路就 `applyFilters({ ...scope, channels: [value] })`，經 `createSnapshot` 重建快照（`src/components/dashboard.tsx:605、356-374`），七頁全部切到那個通路；390 以底部面板開啟（item3:23-26、123-126）。說明頁已寫「通路選單可以只看一個通路」（`src/i18n/guide.zh-TW.ts:167`）。
5. 沒有改名、別名、群組、排序的介面；顯示順序是字典序（`src/domain/analysis.ts:9-13` 的 `selectChannels` 排序）；沒有逐通路配色（item3:74-79）。
6. 2 到 n−1 個通路的子集：domain 精確，介面選不到也顯示不出來。`analyzeDataset(dataset, { channels })` 接受 `manifest.channels` 的任何非空、不重複子集（`analysis.ts:9-13、30-41`）；備份的 `filters.channels` 允許 1 到 1,000 個（`src/application/workspace-backup.ts:65`）；但 `dashboard.tsx:605` 的 `value = channels.length > 1 ? "" : channels[0]`，子集會顯示成「全部通路」（item3:129-131）。報告用 `subset-check.mjs` 實跑：示範資料 `[DTC]`、合成 4 通路 `[DTC, MARKETPLACE]` 兩期五個金額欄位全部與完整分析的逐通路值到分相同，橋接對得起來；分割 {DTC, MARKETPLACE}＋{LIVE, SOCIAL} 的淨營收 195,400.00＋99,960.00＝295,360.00＝全部通路；{LIVE, SOCIAL} 的扣廣告後貢獻是 null、原因碼 `MISSING_AD_DAY|MISSING_CHANNEL_COST_DAY`，與全部通路的 null 相同；未知或空子集丟 `INVALID_CHANNEL_FILTER`（item3:237-247；critic:21 重跑確認）。
7. 試算只做單一通路：`SCENARIO_ASSUMPTIONS[0]`（`src/domain/scenarios.ts:9`，禁區）、`createDecisionSession` 在 `channels.length !== 1` 時加 `SINGLE_CHANNEL_REQUIRED`（`src/application/decision.ts:94-96`）；範圍不是單一通路時試算頁自己建一份單一通路快照（`src/components/multi-scenario-workbench.tsx:41-47、56`）（item3:43-46、149-150）。
8. 目標只對「全部通路」或單一通路配對；部分多選配不到任何目標（`src/application/targets.ts:132-140`）（item3:156-157）。
9. 多通路的畫面上限：G7b ≤ 8 個通路、G10 ≤ 5 用 `sm`、6 到 8 用 `lg`、超過只留表、G11 ≤ 8；G4 通路長條固定 180 px、沒有上限，超過約 6 個通路會擠（未目視驗證）（item3:163-173）。
10. 備份是 strict 的 v5 信封，有「v5 內加選填鍵、不升版」的先例：V4-7c 在 v5 加選填 `active.imported_at`，值為空時不寫這個鍵，示範與 golden 的匯出位元組不變（`workspace-backup.ts:181-185、328-337`）；舊版本的信封是 strict，帶新鍵一律 `INVALID_WORKSPACE_FORMAT`。所以「加鍵不升版」與「升 v6」都會讓舊版本拒收帶設定的新備份，差別只在版本字串要不要說出來（item3:181-191；critic:23）。

**視角**

11. 三份檔的粒度：`sales_daily.csv` 是「日 × 通路 × SKU」（帶 `category`，「僅作分組」）；`channel_costs_daily.csv` 與 `ad_spend_daily.csv` 只有「日 × 通路」（`docs/DATA_CONTRACT.md:15、33、39`）。合併規則：銷售先彙總到「日 × 通路」，再與費用、廣告 1:1 合併；不把日廣告列接到每個 SKU（`DATA_CONTRACT.md:46`；`AGENTS.md:13`；`src/domain/aggregation.ts:48-88`）（item4:10-12、52-61）。
12. 所以 by 通路可以看四層；by 品類與 by SKU 只能誠實算到商品毛利：G、D、R、C、淨營收、商品毛利、毛利率、折扣率、退款金額比、件數。四項費用、廣告費、扣廣告前後貢獻、貢獻率、MER、費用負擔只在通路或合計粒度（item4:71-89）。型別已經把這條線畫好：`PRODUCT_METRICS` 與 `ProductMetrics`（`src/domain/types.ts:91-93`）（item4:91-92）。
13. 不改 `src/domain` 就能算出品類合計、跨通路 SKU 合計、通路 × 品類的每一格：`analyzeProducts(dataset, { period, channels?, sku?, category? })` 回篩選後全部列的合計 `metrics`、`sources` 與通路 × SKU 列（`analysis.ts:57-86`），`sku`、`category` 必須是非空字串（`:60-62`）；`analyzeDataset` 對 `sku`、`category` 鍵丟 `INVALID_CHANNEL_ANALYSIS_FILTER`（`:32`）。報告用 `probe-cross.ts` 在 golden、demo、synthetic-4-channel 上驗證：Σ 品類的淨營收與商品毛利等於通路合計到分，Σ 品類的商品毛利差額等於通路差額到分（item4:16-20、118-124、307-327；critic:22 重跑確認）。
14. 現況只有 by 通路是完整的（總覽 G2、G4；通路健檢的通路寬表、G10、G11、G12；期間列的單一通路篩選）；by SKU 是通路 × SKU 列（商品毛利頁：完整表、前後 10 名、G13、G14、G24）；by 品類只是商品表的一個篩選（`product-comparison-panel.tsx:137-140`）；沒有品類合計、沒有跨通路 SKU 合計、沒有通路 × 品類矩陣、沒有品類兩期差額、沒有綜合畫面（item4:21-25、148-156）。
15. 品類 × SKU 不是交叉，是階層：同一 SKU 的品類不可不一致（`validation.ts:114`）。真正的交叉是通路 × 品類、通路 × SKU（既有列的樞紐）、週 × 品類（item4:26-28）。
16. 兩個會悄悄產生錯數字的陷阱：(a) `aggregateSales` 把費用與廣告欄留在 `0n`（`aggregation.ts:6-10、21-28`），`calculateMetrics(aggregateSales(rows))` 會回「扣廣告後貢獻＝商品毛利」的假貢獻；(b) 抽屜的 `ladderMetrics`（`src/application/evidence-ladder.ts:29-38`）在單一通路、同期間、沒有 `sku` 時回該通路的合計指標，品類格會在品類數字下畫出整個通路的四層階梯（item4:34-41、186-191）。
17. `Scope.kind` 只有 `"all" | "channel" | "sku"`（`types.ts:94`）；`diagnose` 沒有品類 scope；AI 快照只送通路合計事實（`docs/DECISIONS.md:128`）。品類數字沒有事實 ID，不進規則、待辦、會議、AI（item4:115-116、198-200）。

**預算與流程**

18. `/` First Load 519,702 bytes、上限 520,451 bytes、餘 749 bytes；`labels.zh-TW.ts` 整份進 `/` 首載，V41-1 的 3 條字串加 4 個連結實測多 260 到 275 bytes（budgets:45、65；critic:28、86）。390 五個 TBT 中位數 1,033.6／815.6／87.6／980.0／13.4 ms，門檻 1,109.1／832.3／129.9／1,071.2／50.0，餘裕 75／16.7／42／91／37 ms（budgets:53；gov:112）。B1、B2 首屏在 1280 與 390 的餘裕是 0 px（budgets:50-51）。B9 商品頁 2,520、上限 3,322；資料來源頁 1,219、上限 2,629（budgets:49）。
19. v4.1 的 `CLAUDE.md` 是為「說明頁不碰工作台」寫的：「工作台不動」「不新增財務口徑」「不改備份、CSV、JSON」三條在 v4.2 要由拍板明確取代；`V41_NEW_KEY_PREFIXES` 只允許 `guide.` 與 `shell.guideV41.`；testid 基準四份；畫面基準 64 張（gov:12-19）。

### 1.3 需求解讀

**第 3 項的四種讀法**（critic U1）

| 讀法 | 意思 | 現況 | 代價 |
|---|---|---|---|
| (a) 用自己的通路名稱 | 通路叫官網、蝦皮、momo | **已經可以**（§1.2 第 1、2 點）；使用者看不到只是因為範例檔 404（V41-6 修）與公開站只有示範資料 | 約 0：加一句「通路名稱來自你的 CSV」 |
| (b) 通路之上多一層群組 | 自有通路＝官網＋LINE；電商平台＝蝦皮＋momo＋PChome；先看群組，再往下看單一通路 | 沒有（§1.2 第 6 點） | V42-1、2a、2b |
| (c) 顯示名稱與順序 | 「蝦皮」顯示成「蝦皮商城」、重要通路排前面 | 沒有（§1.2 第 5 點） | 與 (b) 共用設定模組與保存 |
| (d) 固定的通路類型 | 系統提供「自營／平台」讓使用者勾 | 沒有 | 等於由產品再造一個 DTC／Marketplace 式的二分，與「自己擁有的通路」相反；不建議 |
| (e) (b)＋(c) | — | — | **建議讀法**（D-V42-1） |

**「再多一層的單一通路分析」**（critic U2）：讀成「從群組往下看群組裡的單一通路」，用既有篩選加範圍標示（D-V42-2＝A）；不做專頁。

**第 4 項**：by 通路已完整；by 品類、by SKU、交叉表、綜合放在商品毛利頁的視角切換（D-V42-5），深度到商品毛利（D-V42-3），範圍依 D-V42-4。

---

## 2 成功指標（可量測）

### 2.1 目標

1. 匯入自己資料的人能在工作台裡改通路顯示名稱、排順序、建群組，設定跟著備份走；示範資料與 golden 的備份、匯出位元組在沒有設定時與 v4.1.2 相同。
2. 期間列能切到群組或群組裡的單一通路；群組的每個金額等於成員通路 domain 值的 bigint 和（到分），分割成兩個群組的合計等於全部通路。
3. 商品毛利頁能用品類、SKU 跨通路合計、通路 × 品類交叉表、綜合四個視角看同一份資料；每一格可開「計算與來源」；品類與 SKU 的輸出型別沒有任何費用、廣告、貢獻欄位。
4. 工作台的既有護欄不退：既有字串逐字不變、testid 刪除 0、棘輪不升、畫面基準只有允許變動的畫面有差異、`GUIDE_MEDIA=check` 0 差異才上線。

### 2.2 成功指標

**A 人工（H8、H9、H6；未執行時寫「未量測」，不寫達標）**

| # | 指標 | 量法 |
|---|---|---|
| A1 | 你本人在 preview 上建兩個群組、切到群組、用「只看這個通路」切到成員，確認通路設定區、兩層選單、範圍文字與限制句的用字（H8；V42-2a 後） | H8 紀錄 |
| A2 | 你本人確認商品毛利頁五個視角的名稱、交叉表可讀性、邊界句用字與群組合計列「{群組名} 合計」的用字（H9；V42-4 後，已含 V42-2b） | H9 紀錄 |
| A3 | 第一次來的人 2 分鐘內把工作台切到一個群組（T7）；在商品毛利找到品類視角並說出它到哪一層（T8） | H6 場次加題（D-V42-23） |

**S 工程（S1 到 S12，每批硬斷言或記錄；B 碼只給 capture 的 B1、B2 首屏、B3 390 無橫向捲動、B5 First Load、B9 DOM，兩套不混用）**

| # | 指標 | 門檻 |
|---|---|---|
| S1 | 群組精確性（`tests/channel-groups.test.ts`、`tests/channel-settings.test.ts`） | 群組每個金額欄位的 `cents` 兩期都等於成員逐通路值的 bigint 和；分割＝全部通路；null 與原因碼傳遞；橋接 `reconciled`；未知或空子集丟 `INVALID_CHANNEL_FILTER` |
| S2 | 品類與交叉對帳（`tests/product-groups.test.ts`） | 每個非空桶的 `metrics`、`sources` `toEqual` `analyzeProducts` 的結果；Σ 桶淨營收、商品毛利＝通路或合計到分；Σ 桶差額＝通路差額到分；C3 恆等式 Σ 品類商品毛利 − (P+Q+F+O) − A ＝ 該通路扣廣告後貢獻到分；手算 golden 見 §11.2 |
| S3 | 假貢獻擋牆 | `product-groups.ts` 每桶 `metrics` 的鍵集合 ⊆ `PRODUCT_METRICS ∪ {units_sold}`；序列化後正規式 `/fee\|ad_spend\|contribution\|mer\|burden/` 比對 0 次；品類證據的 `ladderMetrics` 回 null |
| S4 | 備份矩陣 | v1 到 v5 全部還原；沒有設定時示範與 golden 的匯出位元組與 v4.1.2 相同（示範別名是隱含預設，永遠不寫進 `channel_settings`，§3.1）；有設定時往返相等；v1 到 v4 信封帶 `channel_settings` 一律 `INVALID_WORKSPACE_FORMAT` |
| S5 | `/` First Load JS（gzip；capture 的 B5） | ≤ V42-0 實測＋8,192 bytes（D-V42-20）；v4 上限 545,397 仍有效；`SPLIT_SENTINELS`（含 v4.2 面板根 testid）與 `GUIDE_SENTINELS` 在 `/` 首載 chunk 0 次 |
| S6 | 390 TBT | 既有五步門檻不變（1,109.1／832.3／129.9／1,071.2／50.0 ms），「切到商品毛利」量預設視角；第六步「切到品類視角」在引入那一批定基準與門檻（D-V42-21） |
| S7 | DOM 節點（1440；capture 的 B9） | 既有七頁照 v4 上限（商品頁 ≤ 3,322、資料來源 ≤ 2,629）；非預設視角各記基準、之後斷言基準＋1,500 |
| S8 | 既有護欄 | v4、v4.1 全部沿用：capture 的 B1、B2 首屏（1440 總覽首圖 831、1280 一句話 168、390 KPI 295）、B3 390 無橫向捲動、design-lint、copy-style、copy-density、chart-lint 不升、testid 五份刪除 0、labels 三份快照逐字相同、network-log 下載 5 種無 POST、golden 255.00／−315.00／284.00／264.00／19.70 不變 |
| S9 | 畫面基準與說明媒體 | 64 張（V41-6 基準）只有該批允許變動的畫面有差異（清單以 `06_BATCHES.md` 為準）；新畫面 17 起另立 spec；每批 `GUIDE_MEDIA=check` 0 差異，或已 `write` 並逐張寫理由；媒體門檻沿用 v4.1（單張 ≤ 200 KB、每頁 ≤ 1.5 MB、影片 ≤ 2 MB、≤ 45 秒） |
| S10 | a11y | 四尺寸 axe 0 serious；Lighthouse Accessibility 不低於同頁基準且 ≥ 95；交叉表是原生 `<table>` 有 `caption` 與 `th scope`；視角切換鍵盤可達；任何 Tab 停留點不在 `[aria-hidden=true]` 內 |
| S11 | 隱私與邊界 | AI 快照負載不含顯示名稱與群組名（單元測試）；禁區與邊界五條命令皆空；commit 後兩條皆空；`/api/*` 無新呼叫 |
| S12 | launch-check | 13 項＋19 項（V41-6 起）全過；sitemap 仍 13 個網址 |

**實測值**：V42-6 收尾填入（A 未執行寫「未量測」）。

---

## 3 通路設定與群組（CH1）

### 3.1 資料模型（`src/application/channel-settings.ts`，純函式、不含中文、不碰 domain）

| 欄位 | 規則 |
|---|---|
| `version` | `"channel-settings-v1"`；是設定格式的版本，不是算式版本 |
| `channels[]` | `{ code, label?, group?, order? }`。`code` 必須在 `manifest.channels` 裡，還原備份時不在清單的代碼直接丟掉並提示（item3:304-305）；`label` 沒填就顯示 `code`；`group` 是群組 id，一個通路至多屬於一個群組；`order` 是整數，同序時依代碼 |
| `groups[]` | `{ id, label, order }`。`id` 是內部穩定值（例如 `g1`），改名不改 id；群組在快照裡的身分是「成員代碼的集合」，`filter_hash` 只記通路清單（`src/application/workspace.ts:82`；item3:199-200） |
| 示範資料預設 | `dataset_id` 以 `synthetic-demo` 開頭時，預設設定的 `label` 就是現在的 `demoChannelAlias`，既有字串位元組不變（item3:288）；不預設群組（D-V42-13）。**示範別名是由 `dataset_id` 推出的隱含預設，永遠不寫進 `channel_settings`**（`demoChannelAlias` 在 `copy.ts:13-18` 由 `dataset_id` 推得、從不持久化）；`channel_settings` 只在使用者的設定與預設有差（任一 `label`、`group`、`order` 非預設）時才寫，寫出前先與預設比對、去掉等於預設的欄位（V4-7c「正規化不出值就不寫鍵」的做法，`workspace-backup.ts:328-337`），所以示範資料與 golden 未改設定時的備份位元組與 v4.1.2 相同（§2.2 S4） |

**使用者輸入的名稱要驗證**（名稱是不受信任的輸入，item3:205-207）：顯示名稱與群組名沿用通路代碼的四條規則：去頭尾空白後非空、前後沒有空格、≤ 200 字、沒有控制字元（`src/application/import-guidance.ts:58`）；比對前做 NFC 正規化；顯示名稱在通路與群組之間不得重複（選單與匯出的範圍文字靠它分辨），可以等於自己的代碼。名稱只進人讀的文字；CSV 的 `channel` 欄、AI facts、備份的 `active.filters`、`filter_hash`、`dataset_hash` 一律維持代碼（§8）。寫進 CSV 與 XLSX 的人讀欄位時要跳脫，含以 `=`、`+`、`-`、`@` 開頭的值；現有寫出函式是否已處理，批次開工時先確認。

### 3.2 放在哪裡（D-V42-8）

| 方案 | 說明 | 優點 | 缺點 |
|---|---|---|---|
| **A（建議）** | 資料來源頁 `DataWorkspace`（`src/components/workspace-panels.tsx:70`，版本與來源資訊的 `channels`、`scopeChannels` 兩列旁，`:134-138`）加「通路設定」區，`<details>` 收合；表單是每個通路一列：顯示名稱、群組、順序；按鈕「新增群組」「套用設定」 | 資料來源頁已是隨頁載入的 chunk（`lazy-panels.tsx:40-44`，budgets:19），不碰 `/` 首載的程式；示範資料與還原備份不經過精靈也能設定；DOM 餘裕 1,410（budgets:49）；範圍仍只在期間列切換（D-7） | 畫面基準 09 四尺寸會變；說明頁 `data` 功能區加一步、重拍 |
| B | 匯入精靈第 3 步的通路 `<details>` 裡加欄位 | 匯入時一次做完 | 第 3 步只剩收合區可放（§1.2 第 2 點）；示範資料與還原備份仍要另一處入口；精靈 E2E 與 `import-review` 截圖會變 |
| C | A 加 B | 兩處都能改 | 兩倍的測試與截圖；第一輪不需要 |

### 3.3 保存方式（D-V42-9）

| 方案 | 說明 | 相容性 | 代價 |
|---|---|---|---|
| **A（建議）** | v5 信封加選填 `payload.channel_settings`，比照 V4-7c 的 `active.imported_at`：沒有設定時不寫這個鍵。「沒有設定」＝使用者的設定與預設沒有差：示範別名是隱含預設、永遠不寫進這個鍵（§3.1），寫出前先與預設比對、去掉等於預設的欄位，剩下空物件就不寫鍵 | 帶設定的備份 v4.1.2 以前的版本拒收（`INVALID_WORKSPACE_FORMAT`），這和現在帶 `imported_at` 的備份一樣（critic:23）；不帶設定的備份舊版本照常讀得懂 | 改 `tests/backup-schema-v5.test.ts`（加「示範資料未改設定時備份文字逐位元組等於 v4.1.2」）、`backup-restore-matrix.test.ts`、`workspace-backup.test.ts`、`auto-save.test.ts`（item3:306）；`docs/RELEASES.md` 一句相容提示 |
| B | 升 `profitlens-workspace-v6` | 同 A，但所有新備份都被舊版本拒收 | A 的全部，加 `whats-new.ts` 的 schema 清單與 v1 到 v6 的還原矩陣 |
| C | 只在本次工作階段 | 備份不含；重新載入就消失 | 和「客製化」的用法衝突 |
| D | C 加 opt-in 的 IndexedDB 記憶（比照 `mapping-memory`） | 同一台電腦再匯入同一組通路時自動帶出 | 多一個 store 與同意流程；仍是 C 的限制；可在 v4.3 再加 |

選 A 的附帶效果：同意本機保存後，IndexedDB `profitlens-opt-in-workspace-v1` 存的是整份備份文字，設定跟著自動保存（item3:192-193）。設定不放 manifest（`hashInput` 雜湊原始 manifest，`dataset_hash` 會變；item3:197-198）、不放 `localStorage`（只放每台瀏覽器的便利設定；item3:201-202）、不用模組全域變數（`AGENTS.md`；item3:203-204）。

### 3.4 顯示名稱怎麼送到呼叫點（D-V42-14）

`channelLabel(` 55 處、`channelsLabel(` 41 處、`scopeLabel(` 20 處、`demoAlias(` 56 處，散在 35 個檔（item3:89-91）。建議 A：`createSnapshot(dataset, filters, hash, settings?)` 加第 4 個選填參數，解析結果放進 `WorkspaceSnapshot` 的選填 `channel_names`；`copy.ts` 的四個函式改收解析器，示範別名變成 `synthetic-demo*` 的預設解析器；既有字串逐字不變；`filter_hash`、`dataset_hash` 不受影響（item3:286-290）。

`createSnapshot` 在 repo 有 10 個呼叫點，其中 7 個不在 dashboard，**每一處都要傳入 `Active.channel_settings`**，否則同一個通路會在總覽顯示名稱、在試算頁或還原後顯示代碼：

| 呼叫點（起草時核對） | 用途 | 設定來源 |
|---|---|---|
| `src/components/dashboard.tsx:277` | 匯入精靈完成後建快照 | 新資料集，`Active.channel_settings` 為空（之後在資料來源頁設定） |
| `src/components/dashboard.tsx:341` | 載入示範或範例資料 | 空（示範別名是隱含預設，不是設定） |
| `src/components/dashboard.tsx:362` | `applyFilters` 換範圍重算 | `Active.channel_settings` |
| `src/components/meeting-page.tsx:95` | 會議頁重算 | `Active.channel_settings` |
| `src/components/multi-scenario-workbench.tsx:56` | 試算頁在非單一通路範圍下自建的單一通路快照 | `Active.channel_settings` |
| `src/application/action-workspace.ts:143` | 待辦的來源重算 | 呼叫端傳入 `Active.channel_settings` |
| `src/application/review-session.ts:113` | 會議的來源重算 | 呼叫端傳入 `Active.channel_settings` |
| `src/application/workspace-backup.ts:245` | `restoreV4` 還原備份 | 先讀出 `payload.channel_settings`（對 `manifest.channels` 驗證、丟棄未知代碼並提示）再建快照；順序不可反 |
| `src/application/workspace-backup.ts:446` | 還原後依 `scopeKey` 快取的快照 | 同上（還原時讀出的設定） |
| `src/application/workspace-backup.ts:508` | 還原後切換範圍的快照 | 同上 |

V42-1 的單元測試：試算頁的單一通路快照與還原後的快照，`scopeLabel` 與期間摘要的範圍文字都等於設定的顯示名稱（`06_BATCHES.md` V42-1 第 2 項）。B 案（名稱不進快照，解析器由 `Active` 經 props 或 context 傳到元件與匯出函式）不碰 `createSnapshot`，但匯出函式的簽章全部要改，見 D-V42-14。

### 3.5 群組合計列（CH3；D-V42-11）

- 計算：新模組 `src/application/channel-groups.ts`，對每個群組呼叫 `aggregatePeriod(dataset, period, 成員)` 兩期，再 `compareMoney`、`buildBridge`（item3:283-285）；全部是既有 domain 函式的輸出（A 級），不另外相加。在元件內 `useMemo` 懶算，不進 `createSnapshot`（G7b 的先例，item3:262-264），所以載入示範資料的 390 TBT 不變。群組數不會超過通路數，沿用 ≤ 8 個通路的規則（D-V42-28）。
- 位置：G4 精簡表（`channel-section.tsx:136`）、通路健檢與會議的通路寬表（`src/components/channel-table.tsx`）各加群組合計列，列名「{群組名} 合計」（`GLOSSARY.md` #9）；長條圖不混層（X38，item3:175-177）。
- 週會摘要：`manager-summary.ts:174` 的 `channels` 陣列就是 CSV 寫出用的陣列（`:285-290` 的 `summary.channels.map(row => [text(row.channel), ...])`），群組名進了它就會進 CSV 的 `channel` 欄，違反 §3.1、§8 與 D-V42-15。所以 `channels` **不變**（CSV 位元組不變），另加選填 `groups` 欄位（群組 id、成員代碼、兩期 domain 合計）只給畫面與人讀匯出（Excel、PPT、一頁摘要）使用；`tests/fixtures/export-numeric-baseline.json` 依 v4 §8.6 不動。
- 群組合計列的健檢欄：`channelDiagnosis` 只找 `kind !== "all" || channels.length === 1` 的範圍（`channel-table.tsx:93`），群組合計列沒有對應的健檢結果，這一格留空並給 sr-only 的陳述句「群組沒有健檢結果」。

---

## 4 單一通路層（CH2、CH4）

### 4.1 期間列的兩層選單（CH2；D-V42-10）

同一個原生 `<select>`（`period-bar.tsx:118`）：第一個選項仍是「全部通路」；每個群組一個 `<optgroup label={群組名}>`，組內第一個選項是群組本身（選了就是群組範圍），之後是成員通路；沒有群組的通路放在最後一個 `<optgroup>`「未分組」；沒有任何群組時和現在完全一樣。行高不變，B1、B2 首屏不受影響（budgets:95）。

- 選項值防碰撞（通路代碼是任意字串，item3:296）：通路選項的值維持原代碼（既有 E2E 用代碼驅動這個選單：`import.spec.ts:43-47`、`manager-summary.spec.ts:111`、`m6-acceptance.spec.ts:25`、`ai.spec.ts:81`、`charts-data.spec.ts:311`，item3:127-128）；群組選項的值用含控制字元前綴的 token，由元件換成成員清單；精靈不接受含控制字元的通路代碼，手寫 manifest 帶進來的這種代碼視為不可分組。
- 選了群組：`applyFilters({ ...scope, channels: 成員代碼 })`，走和單一通路一模一樣的路（`dashboard.tsx:605、356-374`）；七頁全部切到群組範圍（item3:259-262）。精確性見 §1.2 第 6 點。
- 選單的值要認得子集：`dashboard.tsx:605` 改成「範圍的通路集合恰好等於某個群組的成員集合時選中那個群組；等於全部時選『全部通路』；只有一個時選那個通路」。三者都不符合時（還原一份用不同設定做的備份，critic:105），選單顯示只讀選項「{n} 個通路」，期間摘要列出成員。
- 範圍文字：期間摘要的 `channelsText` 現在是 `channelsLabel(scope.channels, alias)`（`dashboard.tsx:608`），改成群組名，成員列在 `title` 與 sr-only 的詳情。`scopeLabel` 對 `kind "all"` 寫「合計（A、B）」（`copy.ts:26-30`）、`diagnosisScopeLabel` 寫「合計」（`diagnosis-group.ts:87-89`），兩者都要認得群組（item3:266-269）。

### 4.2 從群組往下看單一通路（CH4；D-V42-2）

都不開新頁：

1. **從群組看成員**：兩層選單裡選群組內的成員，或在通路寬表、G4 精簡表的通路列加「只看這個通路」動作，兩者都走 `applyFilters({ ...scope, channels: [代碼] })`。「只看這個通路」**只在目前資料集有至少一個群組時渲染**：G4 精簡表 `kv` 是 `ChartFrame` 的 `after`（`channel-section.tsx:136-138`），通路寬表用在健檢 05 與會議 08，無條件渲染會讓示範資料的畫面基準 01、02、05、08 與說明截圖 `overview-*`、`diagnosis-*`、`meeting-*` 全部變動；示範資料不預設群組（D-V42-13＝A），所以這些畫面 0 差異，差異只落在 `*-grouped` 頁面狀態與新畫面 18（與 D-V42-2「從群組往下看」一致）。試算頁在群組範圍下的通路選單只列成員（`multi-scenario-workbench.tsx:41-47`，預設第一個成員），選了就是既有的單一通路快照。
2. **範圍標示**：單一通路屬於某個群組時，期間摘要寫「{群組名} · {通路名}」（同一行多段資訊用「 · 」，v3 PRD §8.4）；選單裡那個通路的選項在它的 `<optgroup>` 下；抽屜的 `scopeLabel` 同樣寫法。
3. **逐通路橋接（選配，D-V42-2 的 C）**：橋接現在只對整個範圍算（`analysis.ts:50`；item3:153-155）；要在「全部通路」或群組畫面裡看每個通路的九項橋接，可以呼叫匯出的 `buildBridge(previous.channels[c].totals, current.channels[c].totals)`，放在通路寬表每列的 `<details>`。代價是每列 9 個 number-link、DOM 與 TBT 落在只剩 16.7 ms 的通路健檢，第一輪不做，下鑽已能看到該通路的 G1。

### 4.3 群組沒有的東西（D-V42-12；明說，寫進「要注意」與說明頁）

| 項目 | 事實 | 怎麼說（陳述句） |
|---|---|---|
| 規則卡 | `NEGATIVE_CHANNEL_CM` 只對 `kind "channel"`（`rules.ts:131`）；群組範圍會有 `REV_UP_CM_DOWN` 與四條費用負擔規則（item3:269-270） | 「群組的健檢只有合計層的規則；扣廣告後為負的提醒只出現在單一通路列。」 |
| 試算 | 單一通路（§1.2 第 7 點）；群組試算與 `SCENARIO_ASSUMPTIONS[0]`、X38 衝突（item3:271-272） | 「試算一次只算一個通路。」試算頁的通路選單只列群組成員 |
| 目標 | 部分多選配不到任何目標（`targets.ts:132-140`）；群組目標要改 `targets.csv` 格式（item3:273-274） | 「目標只對全部通路或單一通路配對。」 |
| 範圍型別 | 沒有 `Scope.kind "group"`；facts、diagnostics、待辦的範圍是 `kind "all"` 加成員清單；`action-workspace.ts:197-198` 允許 `kind "all"` 帶多個通路，所以群組範圍下建立的待辦合法 | 待辦與會議顯示群組名（解析器），機器可讀欄位仍是成員代碼 |
| 下鑽 | F10 的 `filter.channel` 只接受單一通路（`evidence-filter.ts:15-38`）；群組範圍的快照本身已只含成員，抽屜的原始明細就是成員的聯集（gov:160） | 不改 `EvidenceFilter` |

### 4.4 子集敏感分支的稽核（V42-0 唯讀清單、V42-2a 修）

「全部頁面在 2 到 n−1 通路子集下都正常」沒有人在介面上走過（critic:74-81）。V42-0 把這些分支逐一讀過並寫成清單，每條標「V42-2a 修」或「不受影響＋理由」：`excel-export.ts:473` 的 `everyChannel`（子集時 `channels` 文字改成成員清單）、`decision.ts:94-96`（群組範圍會得到 `SINGLE_CHANNEL_REQUIRED`，這是預期）、`channel-table.tsx:93`（群組列沒有健檢）、`action-workspace.ts:197-198`、`dashboard.tsx:605`（子集顯示「全部通路」）、`filter_hash` 的使用者（critic:80 寫 20 個檔，起草時 `grep -rl filter_hash src` 得 25 個檔）、會議與 AI 快照負載、備份還原後的範圍顯示（critic:105）；另有 `weekly-summary.ts:115-116`、`waterfall.ts:267-268`、`pptx-export.ts:134`、`decision-export.ts:204`、`meeting.ts:385` 的 `everyChannel` 或 `channelsLabel` 寫法會列出成員代碼。V42-2a 每處一條測試，群組範圍與單一通路範圍都跑。

---

## 5 分析視角：品類、SKU、交叉表、綜合（P1 到 P5）

### 5.1 視角切換（C1；D-V42-5）

商品毛利頁頁首多一列視角切換（`products-perspective`）：≥ 768px 用既有 `ui-segmented` 樣式的按鈕列，390 用原生 `<select>`。規則：

- 只影響商品毛利頁的內容；不進 `createSnapshot`、不進 `filter_hash`、不進備份（item4:212）；是 React 狀態，換資料集時重設。
- 預設視角＝通路 × 商品（現況），所以「切到商品毛利」那個 390 TBT 時段量到的畫面不變。
- **只渲染目前的視角**（D-V42-5）：五個視角都掛載會把 B9 與切頁成本乘上好倍（budgets:72）；視角不是 popover、sheet 或 `<details>`，M1 不適用。每個視角各有 SSR 頁面狀態（`tests/helpers/page-states.tsx`）給 mounted-testids、chart-lint 與 copy-density 檢查。
- **視角本體與載入點分開**：G24 的 `next/dynamic` 是 `ssr: false`，SSR 只渲染同高的骨架（`scatter-section.tsx:22-23、112`），照搬會讓四個新視角的 SSR 狀態是空殼，CL-1、CL-9、copy-density 與 mounted-testids 形同不檢查（`tests/chart-lint.test.ts` 的 SSR 規則只看 `pageStates()` 的 `renderToStaticMarkup`）。所以視角本體寫成可直接 import 的元件模組 `src/components/products/perspectives/{category,sku-total,cross,combined}.tsx`（各自的根節點 testid `products-perspective-{view}` 寫成字面值），商品頁只以 `createChunkLoader`／`next/dynamic` 包「載入點」，第一次切換才下載子 chunk＋`useDeferredMount`；`tests/helpers/page-states.tsx` 的新狀態直接 import 視角元件渲染（比照 G24 的資料表照常 SSR）；`tests/lazy-panels.test.tsx` 加反向檢查「商品頁 chunk 不靜態 import 四個視角模組」，讓 SSR 護欄與 chunk 邊界同時成立。`SPLIT_SENTINELS` 加 `"products-perspective"`（V42-3）與 `"products-perspective-cross"`（V42-4）；`PRELOAD_CHUNKS` 維持不變或在閒置時加入，`insideTimespans` 必須為空（budgets:21-23）。

每個視角可用的數字（item4:222-227）：gross_sales、discounts、refunds、cogs_net、net_revenue、gross_profit、gross_margin、discount_rate、refund_ratio、units_sold；兩期差額用 `compareMoney(...).absolute_change`（金額）與 `percentagePointChange`（比率）；出現狀態 observed、no_rows_confirmed、unknown_coverage。**不出現**：四項費用、ad_spend、扣廣告前後貢獻、貢獻率、MER、費用佔比。

通用規則（v4 PRD §7；item4:171-175）：不做圓餅、甜甜圈、樹狀圖、旭日圖、堆疊區域、雙數值軸；不把不能相加的數字相加（X38：商品毛利可以跨品類相加，毛利率不可以）；排名圖只列前 N，其餘寫「另 n 個」；每張圖都有資料表（CL-1）；每頁主層常駐獨立圖 ≤ 3（CL-9）；圖形元素 `aria-hidden`（CL-11）；testid 依 `chart-products-{id}` 與 `…-{bar｜cell}-{語意 key}`，**區塊 id 只用 `[a-z][a-z0-9]*`（不含連字號），`-table` 之後不再接任何東西**（`scripts/lib/chart-scan.mjs:21-23` 的 `CHART_TESTID_RE`；`checkChartMarkup` 對每個 `chart-` 開頭的 testid 逐一比對，CL-2 上限 0 且只能往下），品類代碼可能是純數字，一律加前綴 `cat-`（CL-2）；真正的 0.00 畫 0；空值寫「資料待補」或「不適用」；每個金額格都是 number-link。

### 5.2 P1 通路 × 商品（現況）

畫面與功能不變（G13、G14、兩張前 10 名表、完整表、G24）。只在頁首多一列視角切換。

### 5.3 P2 品類（含 X3 品類下鑽 SKU、X5 兩期 × 品類差額）

| 項目 | 規格 |
|---|---|
| 資料 | `product-groups.ts` 以 `by: "category"` 分組目前範圍（`snapshot.report.scope` 的通路與兩期）；空白品類成「未填」桶（D-V42-18） |
| 主表 | `ChartDataTable`（`chart-products-category-table`）：列＝品類（依本期商品毛利排序，「未填」固定最後；表尾一列＝全範圍合計）；欄＝件數、淨營收、商品毛利、毛利率、商品毛利差額（`signed`）、上期商品毛利；差額欄內嵌 C24 `BarCell`（`data-chart-kind="cell"`，在 `<table>` 列內）；格為 number-link |
| X3 下鑽 | 每個品類列可展開成該品類的通路 × SKU 列（取自既有 `compareProducts` 列、A 級篩選），小計列＝Σ SKU 列（精確，等於品類桶） |
| X5 圖 | C25 `RankedBars` 差額模式（區塊 `chart-products-catvariance`，柱 `chart-products-catvariance-bar-cat-{category}`，比照 G13）：≤ 10 條加「另 n 個」；標題結論句用「多／少」（商品毛利的方向詞，v3 §8.2）：例「ACCESSORIES 商品毛利多 9.7 萬」 |
| 主層圖數 | 1（X5）；G13、G14 不在這個視角渲染 |
| 390 | 主表在 `.table-scroll` 區域內捲動（頁面 `scrollWidth` 仍 390，B3）；X5 用 `sm` 高度 |
| 空值 | 品類桶的商品毛利為 null（`MISSING_COGS`）時格寫「資料待補」並附原因碼；全範圍合計列也是 null（`docs/METRICS.md:35-38` 的「已知部分」規則：可以顯示知道的品類，合計不能用部分替代；item4:94-96、138） |

### 5.4 P3 SKU 跨通路合計

| 項目 | 規格 |
|---|---|
| 資料 | `by: "sku"`；每列＝一個 SKU 在範圍內全部通路的合計；另帶「出現在幾個通路」（計數，A 級）與品類 |
| 表 | `ChartDataTable`（區塊 `chart-products-skutotal`，表 `chart-products-skutotal-table`）：SKU、品類、通路數、件數、淨營收、商品毛利、毛利率、商品毛利差額；表尾合計列；排序與搜尋沿用完整表的工具列（`product-comparison-panel.tsx:273-291`）；列數多時沿用完整表的分頁或「顯示更多」做法 |
| 圖 | 0 張（第一批）；之後視 H9 回饋考慮 G13 形狀的跨通路差額圖 |

### 5.5 P4 交叉表（X1 通路 × 品類）與 C3 通路獲利結構

| 項目 | 規格 |
|---|---|
| 資料 | `by: "channel_category"`；每格＝一個通路 × 一個品類；列尾＝該通路商品毛利（必須等於 `report.current.channels[ch].metrics.gross_profit`）、欄尾＝該品類全通路合計、右下＝全範圍商品毛利 |
| 指標 | 預設商品毛利；`<select>` 切換淨營收、毛利率、商品毛利差額（比率格不做欄尾加總，X38） |
| 呈現（D-V42-17） | `ChartDataTable` 表模式（區塊 `chart-products-cross`，表 `chart-products-cross-table`，格 `chart-products-cross-cell-{channel}-cat-{category}`；`-table` 之後不再接 `-cell-`）：格為 number-link，負值格用既有 `unfavorable` 樣式；不用熱表 token |
| 上限（D-V42-28） | 通路 ≤ 8（超過時只給清單式的表並顯示既有的 `tooMany` 類說明）；品類欄 ≤ 12（含「未填」），超過時主層只畫本期商品毛利前 12 個品類，其餘列在表下方「另 n 個品類」並全部進清單式資料表；格數 ≤ 736 |
| 列尾附帶 | 每個通路列最後一欄「扣廣告後貢獻（通路層；未分攤到品類）」取 `report.current.channels[ch].metrics.contribution_after_marketing`（A 級）；格內永遠不出現 |
| 空格 | 沒有銷售列但覆蓋已確認：0.00 並標「本期沒有銷售列」，來源加 `{ file: "manifest.json", line: null, channel }`（比照 `compareProducts` 的 `absent()`，`product-comparison.ts:57-61`；item4:136）；覆蓋未確認：全部「資料待補」 |
| 390 | 清單式（列＝通路 × 品類，三欄：通路、品類、指標；v4 PRD §7.6 熱表在 390 改清單的做法） |
| 主層圖數 | 1（交叉表本身是 `mode="table"` 的圖區塊）＋C3 表（在 `<details>` 內，不計） |

**C3 通路獲利結構（依品類）**：交叉表下方的 `<details>`，每個通路一張小表，放在 `.chart-frame` 之外、testid `products-structure-{channel}`（不是圖區塊，不以 `chart-` 開頭、不進 chart-lint；格仍是 number-link）：

```
Σ 各品類商品毛利（每品類一列，number-link）
− 通路費用（未分攤到品類）＝ P + Q + F + O（B 級 category-structure-v1：formula、components 四項）
− 廣告費（未分攤到品類）＝ A（domain）
＝ 扣廣告後貢獻（domain：report.current.channels[ch].metrics.contribution_after_marketing）
```

恆等式測試：Σ 品類商品毛利 − (P + Q + F + O) − A ＝ 該通路扣廣告後貢獻，到分；費用或廣告缺列時扣廣告後貢獻為 null、結構表最後一列寫「資料待補」並附原因碼（synthetic LIVE 通路就是這個狀態，item4:321）。這是「獲利從哪裡來」在不分攤之下能給的答案（item4:235）。不畫瀑布（第一批）。

### 5.6 P5 綜合（C2）

四個區塊並列，**每塊標明自己的層，層與層之間不相加**（item4:234）：

| 區塊 | 內容 | 等級 |
|---|---|---|
| 全範圍四層 | 淨營收、商品毛利、扣廣告前貢獻、扣廣告後貢獻（`report.current.metrics`，與總覽 KPI 同一來源） | A |
| 通路排名（扣廣告後貢獻） | `report.current.channels` 依扣廣告後貢獻排序，≤ 8 列；範圍是群組時列群組成員 | A |
| 品類排名（商品毛利） | `product-groups` 品類桶，≤ 10 列加「另 n 個」 | B（同一函式） |
| SKU 前 5 與後 5（商品毛利） | 既有 `productHighlights`（`product-comparison-panel.tsx:134`）；列是通路 × SKU，表頭寫清楚 | A |

四塊都是表（`ChartDataTable`），第一批不放圖（CL-9 與 TBT）；`<details>` 內放邊界句。390 四塊直向堆疊。

### 5.7 延後或選配（D-V42-4）

| 代號 | 內容 | 延後理由 |
|---|---|---|
| X2 通路 × SKU 樞紐 | 列＝SKU（跨通路合計）、欄＝通路 | 既有列已是通路 × SKU，樞紐只是重排；SKU 數可能很多，需要分頁與欄上限；先看 P3 是否已滿足（item4:242） |
| X4 週 × 品類 | 每品類的週商品毛利、淨營收、毛利率；Σ 週＝期間品類合計 | 要另一個 B 級函式（比照 `channel-weeks-v1`）與 C26 小倍數，再加 1 張主層圖與 DOM；等 H9 回饋（item4:244） |
| 品類佔比（`product-mix-v1`） | 品類淨營收或商品毛利 ÷ 通路淨營收或商品毛利 | 分母商品毛利可能為負（`ratioMetric` 回 null）；先用 BarCell 的相對長度表達，不出佔比數字（item4:226-227） |
| CH5 逐通路橋接 | 通路寬表每列的九項橋接 | §4.2 第 3 點 |

### 5.8 與第 3 項的接點

通路群組是 `channels` 子集，`product-groups` 同樣以 `scope.channels` 篩列，所以「群組 × 品類」就是 P4 在群組範圍下的交叉表，不需要另一個函式（item4 的 §3.4）。交叉表的欄數跟著使用者定義的通路數變；表頭與證據的 `scopeLabel` 取 §3.4 同一個解析函式。目標只對 `ALL` 或單一通路，品類與 SKU 視角不顯示目標。

---

## 6 口徑邊界與誠實呈現

### 6.1 「未分攤」規則

- 通路費用與廣告費只有「日 × 通路」粒度（§1.2 第 11 點）。品類、SKU、通路 × 品類的每一格只有銷售檔能算的欄位；費用與廣告永遠以通路整筆出現在通路列或通路層的表（C3），格內永遠不出現。
- 依營收或件數分攤是 C 級，在任何方案下都不做（`docs/revamp-v4/01_PRD.md:238`；item4:273）。禁止分攤的五處明文：`docs/DATA_CONTRACT.md:42`（不能偷偷按營收分攤）、`:47`（選 SKU／category 僅影響商品毛利區塊並清楚標示範圍）、`AGENTS.md:13-14`（優先級高於本套件）、`docs/PRD.md:24` 與 `docs/METRICS.md:33`、`docs/ACCEPTANCE.md:25` C18（測試 `tests/domain-acceptance.test.ts:116-125`、`tests/m6-financial-audit.test.ts:110-121` 擋著）（item4:63-69）。
- 要用新的輸入資料（費用或廣告檔帶選填的 sku／category 欄）算品類層貢獻是資料契約 v2、新 domain 函式、新 `metric_version`、`docs/METRICS.md` 改動，另一輪（item4:267-273；D-V42-3 的 B）。

### 6.2 使用者看得到的句子與位置（D-V42-3；H9 確認用字）

| 位置 | 文字（草稿） | 規則 |
|---|---|---|
| P2、P3、P4、P5 四個視角的區塊說明（`?` 或 `<details>`） | 品類與 SKU 的分析到商品毛利為止，通路費用與廣告費以「未分攤」整筆呈現。 | 平述句、放在最後、次要樣式（v3 §8.2「限制」句型）；不進主層，copy-density 的否定句計數不增加（計數詞是「不是、不等於、不代表、不可」） |
| P4 交叉表的列尾欄 | 扣廣告後貢獻（通路層；未分攤到品類） | 只在通路列尾，格內不出現 |
| C3 結構表的兩列 | 通路費用（未分攤到品類）、廣告費（未分攤到品類） | 名稱取 `metricDefinitions`，後綴字串放 `products.perspectivesV42.*` |
| 指標定義對話框 | 品類與 SKU 的指標只到商品毛利 | 既有「指標定義」九條不改；加在名詞小辭典或商品毛利條目的補充 |
| 說明頁 `/guide/products` 的「要注意」 | 同第一列 | `guideLabels`，`{ui:…}` 引用介面字串 |

群組層的三句（§4.3）同樣放「要注意」與說明頁：「群組的健檢只有合計層的規則；扣廣告後為負的提醒只出現在單一通路列。」「試算一次只算一個通路。」「目標只對全部通路或單一通路配對。」另加「顯示名稱只改畫面；CSV、備份與 AI 用的仍是通路代碼。」

### 6.3 計算層級政策（D-V42-16）

沿用 v4 PRD §4.0 的三級（`docs/revamp-v4/01_PRD.md:238`；gov:141-146）：**A 純呈現**（直接用既有 `Metric` 或呼叫既有 domain／application 函式取既有的值，不加版本常數）；**B application 整理**（新數值或新分組，放 `src/application`，每個函式一個版本常數＋手算 golden＋與 domain 對帳的測試，D-V4-15）；**C 禁止**（新公式、預測、分攤、系統代填假設）。

| 模組 | 等級 | 版本常數 | 理由 |
|---|---|---|---|
| `channel-groups.ts`（群組合計） | A | 無（`metricVersion` 維持 `contribution-v1`） | 呼叫 `aggregatePeriod`、`compareMoney`、`buildBridge` 取既有值；比率由 `calculateMetrics(sumTotals(成員 totals))` 先加分子分母再除（`aggregation.ts:88-110`；item3:229-235） |
| `product-groups.ts`（品類桶、SKU 桶、交叉格） | B | `product-groups-v1`（`arrangeVersion`） | 新分組；每桶數值仍由 domain 的 `aggregateSales`、`calculateMetrics` 算出，立刻投影到 `PRODUCT_METRICS`，不自己寫公式。選 B 而不是每格呼叫 `analyzeProducts` 的原因：空白品類在 `analyzeProducts` 會丟 `INVALID_PRODUCT_FILTER`，只有自己分桶才能給「未填」；每格一次呼叫在 8 通路 × 12 品類 × 2 期是 192 次，390 節流後會吃掉「切到商品毛利」的餘裕（item4:135、139；critic:85）。budgets:37 寫「在 application 層把各通路結果相加是新的彙總，避免」，critic:40-41 指出 B 級加總已有前例（`chart-channel-weeks.ts:3` 用 `sumTotals`、`pnl-table.ts:1`），本套件以 D-V42-16 明文採 B |
| `category-structure-v1`（C3 的四項費用相加） | B | `category-structure-v1` | 四項費用相加是新值；`formula: "P + Q + F + O"`、`components` 四項 |

`product-groups.ts` 的新 import：`aggregateSales`、`sumUnits`、`uniqueSources` 來自 `@/domain/aggregation`，不在 `domain/index.ts`；application 目前只 import `sumTotals`、`uniqueSources`、`aggregatePeriod`（critic:67），前例是 `src/application/workspace.ts:4` 直接 import `aggregatePeriod`（item3:216）；不改 `domain/index.ts`。

---

## 7 版面與入口（選項與建議）

| 問題 | 方案 | 建議與理由 |
|---|---|---|
| 分析視角放哪裡（D-V42-5） | A 商品毛利頁視角切換／B 新第 8 頁「分析視角」／C 只在期間列 | **A**。B 的代價：側欄改動讓 30 張基準與 3 支影片重拍、手機「更多」永久 3 列、約 12 個寫死七頁的清單要改、新頁要自己的 B9 基準與第 6 個 390 TBT 時段、功能區 11 變 12、sitemap 13 變 14（budgets:26-28、65-72、84、101-102）。C 違反 D-7（期間列只設期間與範圍；品類與 SKU 不是範圍而是分組），B1、B2 首屏在 1440、1280、390 的餘裕是 0 px（budgets:29、95） |
| 通路設定放哪裡（D-V42-8） | A 資料來源頁／B 精靈第 3 步／C 兩者 | **A**（§3.2） |
| 群組範圍怎麼選（D-V42-10） | A 同一個 `<select>` 加 `<optgroup>`／B 兩個 `<select>` | **A**（§4.1）。B 讓期間列多一個控制，390 的底部面板多一列；D-7 的「同一列同一高度」要重排 |
| 群組合計列放哪裡（D-V42-11） | A 表格加群組合計列（週會摘要用 `groups` 欄位，CSV 不變）／B 長條圖也改群組層／C 不加 | **A**（§3.5） |
| 側欄、手機分頁列、頁尾、首頁空狀態 | 不改（不加第 8 頁） | 影片是 1280×800 含側欄；側欄不動就不重錄（budgets:79） |

工作台會改到的頁：**商品毛利**（視角切換、交叉表）、**期間列**（兩層通路選單）、**資料來源**（通路設定區）、**通路健檢與總覽**（群組合計列，V42-2b）、**會議**（通路寬表的群組合計列、週會摘要的 `groups` 欄位）。其餘頁面 0 差異。

---

## 8 可追溯性

- **群組與單一通路的每個金額都是 domain 的輸出**：`aggregatePeriod` 逐通路 bigint 相加、缺列的費用與廣告欄位變 null、範圍合計是 `sumTotals(逐通路 totals)`（item3:229-235）。抽屜 `EvidenceSelection`（`src/components/evidence-drawer.tsx:17-57`）帶 `channels: 成員代碼`、`scopeLabel: 群組名`、`sources: 子集執行的來源`，`metricVersion` 不改。群組格的來源＝成員通路來源的聯集（gov:160）。
- **`daily_complete` 的差異要寫進驗收**：`days × channels.length ≤ 50,000` 時走逐日（`aggregation.ts:67`），子集可能逐日而全集稀疏；合計相同，但 `sources` 的形狀不同。群組列的來源取子集執行的結果，測試只斷言合計逐欄位相等（item3:250-255）。
- **品類桶、SKU 桶、交叉格**（item4:181-197；v4 PRD §8.7）：

| 欄位 | 品類桶、SKU 桶、交叉格 | 差額格 | C3 的費用整筆 |
|---|---|---|---|
| `title`、`name`、`metric` | `name` 取 `gross_profit` 等商品層指標名，`metric` 是桶的精確字串 | `metric` 是 `compareMoney(...).absolute_change` | `name` 借 `platform_fees` 的單位，證據自帶 `title`、`definition`、`formulaTechnical` |
| `channels` | 交叉格＝`[ch]`；品類桶與 SKU 桶＝範圍內全部通路 | 同左 | `[ch]` |
| `sources` | **只有 `sales_daily.csv` 的列**（抽屜只留欄位相符的來源，`evidence-drawer.tsx:147-153`）；空桶加 `manifest.json` | 兩期的銷售列 | 該通路的 `channel_costs_daily.csv` 列 |
| `scopeLabel` | 「{通路} · {品類}」、「{品類}（全部通路）」、「{SKU}（n 個通路）」；通路名用 §3.4 的解析器 | 同左 | 「{通路}」 |
| `valueKind` | `"level"` | `"change"` | `"level"` |
| `metricVersion` | 不給（抽屜預設 `contribution-v1`） | 不給（`compareMoney` 是 domain） | `"category-structure-v1"` |
| `arrangeVersion` | `"product-groups-v1"` | `"product-groups-v1"` | `"category-structure-v1"` |
| `category`（新，D-V42-19） | 有值；`ladderMetrics` 回 null | 有值 | 不給（通路層；費用整筆可以畫通路階梯） |
| `filter` | 不給；桶的 `sources` 已是該桶的列，不擴充 `EvidenceFilter`（它只有 week、date、channel、sku，`evidence-filter.ts:13-20`） | — | — |

- 證據 builder 放 `src/components/product-evidence.ts`，比照 `productEvidence`、`productDeltaEvidence`（`:47-65`）與 Pareto 的 B 級證據（`:109-136`）。SSR 測試：資料表每格的 number-link 與同一格在圖上的點擊回同一個 `EvidenceSelection`。
- **名稱不進任何雜湊與機器可讀欄位**：`filter_hash = digest(report.scope)` 只含通路代碼清單；`dataset_hash` 來自原始 manifest；CSV 的 `channel` 欄寫代碼（`manager-summary.ts:288` 的 `text(row.channel)`，item3:205-206）；AI facts 用代碼；備份的 `active.filters` 是 `report.scope`。

---

## 9 標籤與文案

- **前綴**（D-V42-22）：`V42_NEW_KEY_PREFIXES`＝`data.channelSettingsV42.`（通路設定區）、`shell.periodBarV42.`（兩層選單的固定字串）、`shell.scopeV42.`（範圍文字模板）、`overview.channelsV42.`、`diagnosis.channelsV42.`、`meeting.channelsV42.`（群組列與「只看這個通路」）、`products.perspectivesV42.`（視角與交叉表）、`exports.v42.`（對照列與工作表）、`storage.v42.`（備份相容提示）；說明頁新文字在既有的 `guide.*`。`LABEL_GROUPS` 維持 24 組。每批在 `labels.zh-TW.ts` 與 `guide.zh-TW.ts` 加「── V42-n 錨點」註解。
- **快照**：V42-0 從 v4.1.2 取 `verification/revamp-v42/labels-v41.flat.json`（含 `guide.zh-TW.ts`），與 v3（2,581）、v4（2,839）三份逐鍵逐字比對；既有字串一字不改。
- **首載代價**：`labels.zh-TW.ts` 整份進 `/` 首載，第 3 項估 20 到 40 條、第 4 項估 100 到 200 條新字串，會超過 749 bytes；D-V42-20 在 V42-0 重訂上限。
- **copy-scan**：`SCOPED_BLACKLIST` 的「賠錢」「虧損」目前只對 `products.chartsV4.*` 計入（`scripts/lib/copy-scan.mjs:85-91`），V42-0 把範圍擴到 `products.perspectivesV42.*`（商品頁只寫「商品毛利為負」）；圖表標題 `products.perspectivesV42.*.title` 加進 L1 樣式（每子句 ≤ 14 字）。
- **擬稿字串**（都是陳述句，不含問號，copy-style 黑名單 0 違規）：區塊標題「通路設定」；欄名「通路代碼」「顯示名稱」「群組」「順序」；按鈕「新增群組」「套用設定」「只看這個通路」；選單「未分組」「{n} 個通路」；群組合計列的列名「{群組名} 合計」（sr-only 直接重用這個可見字串，不另寫）、健檢欄的 sr-only「群組沒有健檢結果」；視角名「通路 × 商品」「品類」「SKU 跨通路合計」「交叉表（通路 × 品類）」「綜合」；X5 與排名的標題「{品類} 商品毛利多／少 {差}」；限制句見 §6.2。
- **句型**：不用問句、驚嘆號、箭頭字元、「注意：」；數字格式照 v3 §8.5（L2 整數元、L3 到分、U+2212）；「×」用全形乘號。
- **名詞增補**：見 `GLOSSARY.md`（通路代碼、顯示名稱、通路群組、未分組、單一通路、只看這個通路、通路範圍、分析視角、商品毛利（依品類）、SKU 跨通路合計、交叉表、未分攤到品類、未填、綜合分析、{群組名} 合計）。
- **testid**（不用陣列索引；追加到 `verification/revamp-v42/testids-v42-added.txt`；`chart-` 開頭的一律符合 CL-2 的 `CHART_TESTID_RE`：區塊 id 只用 `[a-z][a-z0-9]*`，`-table` 之後不再接任何東西）：`channel-settings`、`channel-settings-row-{code}`、`channel-settings-group-{groupId}`、`scope-select`、`scope-option-group-{groupId}`、`group-row-{groupId}`、`channel-drill-{code}`、`products-perspective`（切換控制）、`products-perspective-{view}`（各視角面板的根節點，每個視角模組寫成字面值）、`chart-products-category`（主表 `chart-products-category-table`）、`chart-products-catvariance`（柱 `chart-products-catvariance-bar-cat-{category}`）、`chart-products-skutotal`（表 `chart-products-skutotal-table`）、`chart-products-cross`（表 `chart-products-cross-table`、格 `chart-products-cross-cell-{channel}-cat-{category}`）、`products-structure-{channel}`（C3 結構表，在 `.chart-frame` 之外）、`products-combined-{block}`。

---

## 10 效能預算、棘輪與基準

| 護欄 | 目前值與餘裕 | v4.2 的做法 | 依據 |
|---|---|---|---|
| `/` First Load JS | 519,702／520,451，餘 749 bytes；v4 上限 545,397 | V42-0 重量，門檻＝實測＋8,192 bytes（D-V42-20）；程式全部隨頁載入，只有字串與期間列的少量程式進首載；每批列差額組成；`SPLIT_SENTINELS` 加 `"channel-settings"`、`"products-perspective"`、`"products-perspective-cross"`（帶引號的 testid 字面值，`metrics.spec.ts:98` 的寫法） | budgets:45、65 |
| 390 TBT 載入示範資料 | 1,033.6／1,109.1 | 群組列與視角表不進 `createSnapshot`、`applyFilters` | budgets:53、97 |
| 390 TBT 切到通路健檢 | 815.6／832.3，餘 16.7 ms | V42-2a 不在健檢頁加計算；V42-2b 的群組列懶算，超過門檻時依 D-V4-47 成對 A/B，仍超過就改成展開才算並寫明 | gov:112 |
| 390 TBT 切到商品毛利 | 87.6／129.9，餘 42.3 ms | 預設視角不變；`product-groups` 只在切到非預設視角時於 `useMemo` 計算 | budgets:53 |
| 390 TBT 第六步 | 無 | 「商品毛利切到品類視角」在 V42-3 量三次取中位數當基準，門檻＝max(中位數 × 1.1, 中位數＋50 ms)（D-V4-36）；`scripts/lighthouse-pages.mjs` 加第六個 timespan（D-V42-21） | budgets:67、102 |
| 390 TBT 切到資料來源 | 13.4／50.0 | 通路設定區在 lazy chunk，預設收合；會升，要量 | budgets:53 |
| B9 DOM（1440） | 商品頁 2,520／3,322；資料來源 1,219／2,629 | 只渲染目前視角；交叉表 ≤ 8 × 12 格；非預設視角各記基準 | budgets:49、68 |
| B1、B2 首屏 | 1440 總覽首圖 831、1280 一句話 168、390 KPI 295，餘裕 0 px | 期間列行高不變；總覽不動 | budgets:50-51、95 |
| lazy chunk | 商品頁、資料來源頁已是獨立 chunk | 非預設視角的本體是可直接 import 的模組（`perspectives/*.tsx`，給 SSR 頁面狀態用），商品頁只包 `next/dynamic` 載入點成子 chunk；`tests/lazy-panels.test.tsx` 反向檢查商品頁 chunk 不靜態 import 它們；`insideTimespans` 必須為空 | budgets:18-23；§5.1 |
| `useDeferredMount` | 商品頁 G13、G14 已用 | 交叉表與 X5 同樣延後一拍，骨架等高（CLS） | `docs/DECISIONS.md:556` |
| 畫面基準 | 64 張 0 差異（V41-6 基準） | 允許變動（摘要；完整清單與條件以 `06_BATCHES.md` 各批的「允許變動畫面」為準）：V42-1 09、新 17；V42-2a 01 到 09 的期間列、13（預期 0）、新 18；V42-2b 01、02、05、08、10（示範資料無群組，預期 0）；V42-3 06、11、新 19、20；V42-4 06、新 21、22；V42-5 15、16（預期 0）；新畫面 17 起另立 spec | budgets:83-85 |
| 說明媒體 | 47 項（44 張截圖＋3 支影片，影片共 15 個 cue；V41-6 後以實際為準）0 差異 | 只 `write` 有差異的：`data` 新步驟、`start-period`、`products-*`、`diagnosis-*`；側欄不動，影片不需重錄 | budgets:79 |
| 棘輪 | design-lint、copy-style、copy-density、chart-lint 都在上限 | 新字串從 0 開始；`CHART_PAGES` 不變；限制句放 `<details>`、`?`、「計算與來源」 | budgets:55-58、69 |
| testid | 四份刪除 0 | 第五份 `testids-v42-added.txt`，刪除 0 | budgets:59 |
| labels | v3、v4 快照逐字相同；24 組 | 第三份快照；`V42_NEW_KEY_PREFIXES` | budgets:60 |
| network-log | 下載 5 種、無 POST | 不變（Excel 新工作表在同一個檔內；對照列不是新下載） | budgets:61 |

---

## 11 測試與驗收

### 11.1 單元與頁面狀態

| 層 | 內容 | 依據 |
|---|---|---|
| `tests/channel-settings.test.ts` | 名稱驗證四條規則與不重複；不在 manifest 的代碼被丟掉；群組依成員集合解析（順序無關）；`order` 穩定排序；`synthetic-demo*` 的預設設定讓 `channelLabel` 輸出與現在逐字相同 | §3.1 |
| `tests/channel-groups.test.ts` | 對 `fixtures/golden`（只讀）、`fixtures/demo` 的 `[DTC]`、`tests/fixtures/synthetic-4-channel` 的 {DTC, MARKETPLACE}：群組每個金額欄位兩期都等於成員逐通路值的 bigint 和；分割＝全部通路；{LIVE, SOCIAL} 的扣廣告後貢獻 null 且原因碼 `MISSING_AD_DAY|MISSING_CHANNEL_COST_DAY`；橋接 `reconciled`；比率等於 `calculateMetrics(sumTotals(成員 totals))`；未知或空子集丟 `INVALID_CHANNEL_FILTER`；`daily_complete` 不同時合計仍相同 | item3:237-255 |
| 備份矩陣 | `backup-schema-v5.test.ts`、`backup-restore-matrix.test.ts`、`workspace-backup.test.ts`、`auto-save.test.ts`、`workspace-backup-imported-at.test.ts` 的先例：沒有設定時位元組相同（示範資料未改設定時備份文字逐位元組等於 v4.1.2）；有設定時往返相等；試算頁單一通路快照與還原後快照的範圍文字等於設定的顯示名稱；v1 到 v4 信封帶 `channel_settings` 一律 `INVALID_WORKSPACE_FORMAT`；還原子集但沒有對應群組時走「{n} 個通路」 | item3:306；critic:105 |
| `tests/product-groups.test.ts` | §11.2 | item4:249-258 |
| 呈現 | `copy.test.ts` 加群組範圍的 `scopeLabel`、`diagnosisScopeLabel`；`excel-export`、`pptx-export`、`weekly-summary`、`waterfall`、`decision-export`、`meeting` 在群組範圍下的範圍文字；`export-numeric-baseline.json` 不動 | §4.4 |
| 子集敏感分支 | §4.4 的每一處各一條測試，群組範圍與單一通路範圍都跑 | critic:74-81 |
| 頁面狀態（`tests/helpers/page-states.tsx`） | 新增 `overview-grouped`、`diagnosis-grouped`、`meeting-grouped`、`data-channel-settings`（synthetic-4-channel 加設定：自有＝DTC＋SOCIAL、平台＝MARKETPLACE＋LIVE，LIVE 本期扣廣告後貢獻是 null，可驗證群組列的 null 傳遞）；`products-category`、`products-sku-total`、`products-cross`、`products-combined`（直接 import `src/components/products/perspectives/*.tsx` 渲染，不經 `next/dynamic`，§5.1）；`mounted-testids` M1、M6；SSR 結構：群組合計列數＝群組數、資料表每格 number-link 開到同一份證據 | budgets:67；item3:319 |
| `tests/evidence-ladder.test.ts` | 既有輸出逐字不變；`category` 有值時回 null | item4:189-191 |
| AI 快照 | 負載不含顯示名稱與群組名 | critic:104 |

### 11.2 `tests/product-groups.test.ts`（用唯讀的 `fixtures/golden`、`fixtures/demo`、`tests/fixtures/synthetic-4-channel`、`fixtures/errors/missing_cogs`）

1. **逐桶對帳**：每個非空白桶的 `metrics` 與 `sources` 等於 `analyzeProducts(dataset, { period, channels, category })`（或 `sku`、或 `channels:[ch], category`）的結果，`toEqual`。
2. **加總對帳**：Σ 桶淨營收、商品毛利＝`report.current.channels[ch].metrics`（通路 × 品類）或 `report.current.metrics`（品類、SKU）到分；Σ 桶 ΔGP＝通路或合計 ΔGP。
3. **手算 golden**（item4:307-327，本期）：golden（2026-08-02）DTC × CARE 淨營收 360.00／商品毛利 200.00，DTC × HOME 1,120.00／540.00，Σ 1,480.00／740.00＝DTC 通路（扣廣告後貢獻 270.00）；MARKETPLACE × CARE 350.00／125.00，× HOME 640.00／280.00，Σ 990.00／405.00（扣廣告後貢獻 −15.00）；品類合計 CARE 710.00／325.00、HOME 1,760.00／820.00；全範圍 2,470.00／1,145.00、扣廣告後貢獻 255.00（既有 golden 不變）。demo（2026-07-13 至 08-23）DTC 四品類商品毛利 500,480.22、330,914.32、650,544.37、182,829.41，Σ 1,664,768.32＝DTC 通路；MARKETPLACE Σ 1,193,364.93；ΔGP DTC 四格 Σ 242,126.20、MARKETPLACE Σ −108,124.57，都等於通路 ΔGP；全範圍淨營收 7,850,657.90、商品毛利 2,858,133.25、扣廣告後貢獻 1,269,792.73。synthetic-4-channel（2026-09-07 至 09-23）MARKETPLACE × CARE 商品毛利 −2,650.00、SOCIAL × HOME −2,040.00（負值格）；LIVE × CARE 沒有列：0.00、0 個來源、`no_rows_confirmed`；LIVE 通路扣廣告後貢獻 null；品類合計 CARE 62,630.00／27,100.00、HOME 232,730.00／114,410.00；全範圍 295,360.00／141,510.00；跨通路 SKU：SKU-101 110,500.00／62,900.00、SKU-102 67,150.00／36,550.00、SKU-103 53,040.00／30,600.00。C3 恆等式候選（開工時以 domain 輸出核對）：golden DTC 740.00 − 470.00 ＝ 270.00；MARKETPLACE 405.00 − 420.00 ＝ −15.00；demo DTC 1,664,768.32 − 333,805.66 ＝ 1,330,962.66。
4. **邊界**：`errors/missing_cogs`：DTC × HOME 商品毛利 null（`MISSING_COGS`）、DTC × CARE 200.00、DTC 通路 null、HOME 品類 null、全範圍 null；`sales_coverage_confirmed=false`：全部 null `SALES_COVERAGE_UNCONFIRMED`、來源含 `manifest.json`；空白品類（記憶體把 golden SKU B 的品類改成 `""`）：資料仍 `valid`、「未填」桶等於原 CARE 桶、DTC 通路 740.00 不變；子集 `["DTC","SOCIAL"]` 對帳。
5. **禁用欄位**：§2.2 S3 的三條斷言；模組原始碼不含 `contribution_` 字串（只在這條測試裡出現）。
6. **版本**：`PRODUCT_GROUPS_VERSION === "product-groups-v1"`；`contribution-v1` 等三個常數的測試不動。

### 11.3 E2E 與基準

- `tests/e2e/channel-groups.spec.ts`（四尺寸）：用精靈匯入 synthetic-4-channel（`import.spec.ts:43-47` 的路徑）；在資料來源頁設定名稱與群組；期間列選群組（390 用 `openPeriodSheet`，`tests/e2e/action-workspace.spec.ts:40`）；KPI 的文字等於 labels 格式化後的 domain 值；下鑽到成員通路、範圍文字；還原備份；axe 0 serious；`keyboard-walk` 加通路設定區的里程碑；`network-log` 下載集合維持 5 種、沒有非 GET。
- `tests/e2e/product-perspectives.spec.ts`（四尺寸）：切換五個視角、交叉表格開抽屜且沒有階梯、390 清單式、axe 0 serious。
- 畫面基準：§10 的允許清單；`GUIDE_MEDIA=check` 後只 `write` 有差異的。
- 驗收命令：`00_README.md`「驗收命令」；禁區與邊界五條與 commit 後兩條皆空；功能保留 `verification/revamp-v42/feature-retention.csv` 加 `v42_location` 欄，期間列通路篩選、資料來源頁、通路寬表、G4、週會摘要、商品頁、備份、匯出的列重新核對（budgets:88）。

---

## 12 匯出（D-V42-15）

| 管道 | 現況 | v4.2 | 依據 |
|---|---|---|---|
| 畫面 | — | 第一批只做畫面；每格可開抽屜 | item4:214 |
| 人讀的匯出（Excel 範圍文字、PPT、一頁摘要、週會摘要、會議紀錄） | 範圍文字用 `channelsLabel` 或 `everyChannel` 寫法 | 用顯示名稱與群組名；Excel「版本與來源」加「通路設定」對照列（代碼、顯示名稱、群組），只加列不改欄（C34 的做法）；週會摘要的群組合計列來自 `groups` 欄位（§3.5） | gov:159 |
| CSV、JSON、AI 快照、備份 `active.filters` | 代碼 | 維持代碼；備份另加 `channel_settings`；週會摘要 CSV 只寫 `channels` 陣列，有群組時位元組與無群組時相同 | item3:205-207 |
| 商品頁「匯出本頁」CSV | `profitlens-product-comparison.csv`、`profitlens-products.csv` | 不加品類 CSV（下載集合 5 種是硬斷言） | budgets:61 |
| Excel 新工作表 | `products` 工作表＝通路 × SKU | **選配（V42-5）**：`categories`（品類桶、交叉格、C3），每格附「未分攤到品類」欄說明；改 `export-variants`、`export-normalize`、xlsx 測試；`tests/fixtures/export-numeric-baseline.json` 不動，新工作表排除在數值基準之外；開檔檢查列入人工待辦 | item4:209 |
| PDF、PPT | 沒有商品或 SKU 內容 | 不改 | item4:210 |
| 會議 | 規則碼含 `SKU_NEGATIVE_GP` | 不改；品類數字沒有事實 ID | item4:211 |

---

## 13 說明頁更新（V42-5；D-V42-13 的截圖資料）

- `data` 功能區加一步「設定通路的顯示名稱與群組」（截圖用 synthetic-4-channel，圖說註明虛構的合成資料）。
- `start` 功能區「換期間與通路」那一步的 body 改寫（`guide.zh-TW.ts:166-169`），`labels_hash` 會變，`start-period` 要重拍（item3:313-314）；加一句「通路名稱來自你的 CSV」。
- `overview`、`diagnosis` 功能區各加一句群組列的說明。
- `products` 功能區加「切換視角」「看交叉表」兩步與「要注意」的邊界句（§6.2）。
- 規則沿用 v4.1：媒體只由腳本產生、WebP ≤ 200 KB、每頁 ≤ 1.5 MB、`GUIDE_MEDIA=write` 只更新有差異的、之後連跑兩次 `check` 0 差異；影片依 cue 比對決定是否重錄（側欄不動，預期不重錄）；不新增功能區、sitemap 仍 13 個網址；不寫成效、不寫預測。

---

## 14 不做的事

- 不改 `src/domain`、`fixtures/*`、`docs/METRICS.md`、`docs/SCENARIOS.md`、`contribution-v1`、`assist-kpi-v1`、`breakeven-mer-v1`、`assist-kpi.ts`、`breakeven-mer.ts` 與兩個測試檔；白名單為空。
- 不分攤通路費用與廣告到品類或 SKU（C 級）；不做品類層的扣廣告後貢獻、MER、費用負擔；不做佔比數字（第一輪）。
- 不開 `Scope.kind "group"`、`"category"`；群組沒有自己的規則卡、試算、目標；品類數字不進規則、待辦、會議、AI。
- 不加第 8 頁；不改側欄、手機分頁列、頁尾、首頁空狀態；不做依職能預建的多套儀表板（v3 §4.3 刻意不採用）。
- 不做系統預設的通路類型（自營、平台）；不在匯入時合併通路值（仍靠離線的 `scripts/aggregate_orders.py`）。
- 不做 X2 通路 × SKU 樞紐、X4 週 × 品類、逐通路橋接（CH5）；不畫 C3 瀑布（第一批）。
- 不加品類 CSV；不改 PDF、PPT、JSON、AI 快照；不改 `/api/*`、`vercel.json`、`analytics.ts`；不新增分析事件。
- 不換示範資料（F15 另開決定）；不加 npm 依賴；不加登入、資料庫、伺服器端保存。

---

## 15 風險

| 風險 | 機率 | 處理 |
|---|---|---|
| 第 3 項的範圍誤解（critic:144；gov:388） | 高 | D-V42-1 先問；(a) 成立就不建群組層 |
| 使用者把「商品毛利（依品類）」讀成品類獲利，或要求分攤 | 高 | 邊界句五處；每個表頭寫「商品毛利」；C3 恆等式；要求分攤時回覆 D-V42-3 的 B 與 `AGENTS.md:13-14`，不在實作裡偷做 |
| `/` First Load 超過 749 bytes | 高（幾乎必然） | D-V42-20 重訂上限；仍受 B5 545,397 約束 |
| 通路健檢 390 TBT 只剩 16.7 ms | 高 | 群組列懶算、不進 `createSnapshot`；超過時成對 A/B，仍超過就改成展開才算 |
| 子集範圍的分支沒有人在介面上走過（critic:74-81） | 高 | V42-0 唯讀稽核清單；V42-2a 每處一條測試；範圍文字統一走解析器 |
| 假貢獻經 `calculateMetrics(aggregateSales())` 漏出 | 中 | 投影在同一個函式內、回傳型別只有 `ProductMetrics`；§2.2 S3 的三條斷言；審查清單加「`product-groups.ts` 不得回傳 `Metrics`」 |
| 抽屜對品類格畫出通路的四層階梯 | 中 | `category` 標記、`ladderMetrics` 回 null、SSR 測試斷言品類證據沒有階梯 |
| 備份相容性：舊版本拒收帶設定的備份 | 中 | `docs/RELEASES.md` 一句；沒有設定時位元組不變 |
| 名稱是不受信任的輸入（CSV／XLSX 公式注入、AI 載荷） | 中 | 驗證四條規則；設定不進 AI 快照；人讀匯出跳脫；批次開工時查 `docs/AI_CONTRACT.md` 與現有寫出函式 |
| 空白品類、空格、缺成本的呈現不一致 | 中 | 「未填」桶、`manifest.json` 來源、已知部分與合計 null 的規則都寫成測試 |
| G4 超過約 6 個通路會擠（item3:167，未目視驗證） | 中 | 群組列只加在表格；V42-0 用 `diagnosis-many-channels` 的做法補一個 `overview-many-channels` 頁面狀態目視 |
| 目標、試算、規則卡在群組層沒有，使用者可能期待有 | 中 | §4.3 明說；要有就是 D-V42-12 的 B，另一輪 |
| 說明頁與影片過期 | 中 | 只 `write` 有差異的；側欄不動所以影片不重錄；`GUIDE_MEDIA=check` 0 差異才上線 |
| 畫面基準與說明媒體連鎖：示範資料若預設群組，01 到 09 四尺寸全部重拍 | 中 | D-V42-13 選 A |
| 選項值碰撞：通路代碼是任意字串 | 低 | 群組 token 用控制字元前綴；含控制字元的代碼不可分組 |
| `daily_complete` 讓來源形狀不同（item3:250-255） | 低 | 測試只斷言合計；驗收文件寫明 |
| 流程：v4.1 `CLAUDE.md` 的三條規則在 v4.2 要被取代；`06_BATCHES.md` 要先寫好批次才能開工（gov:12-15） | 高 | V42-0 整份取代 `CLAUDE.md`（經使用者同意）；本套件的 `06_BATCHES.md` |
| Skew Protection 沒開 | 低 | 每次問部署同意時再提一次（D-V41-16） |
