# Revamp v3 V3-5 驗收：通路健檢、商品毛利、計算與來源抽屜（2026-10-07）

依 `docs/revamp-v3/06_BATCHES.md` V3-5 與 PRD §7.2（通路健檢）、§7.3（商品毛利）、§7.8（計算與來源抽屜）、§9.4（C3 資料表、C6 抽屜、C8 狀態、C9 清單型、C14 popover、C15 工具列）、§10.1 F18（密度切換）執行。拍板：D-V3-3＝A（抽屜「計算與來源」、按鈕「看明細」）、D-V3-7＝A（只有不利上色）。`src/domain`、`fixtures`、`docs/METRICS.md`、`.env*`、`vercel.json` 零改動；無新依賴。

## 1. 完成項目（對照 06_BATCHES V3-5）

| 項目 | 狀態 | 說明 |
|---|---|---|
| 健檢警示列（C9 清單型：summary 一行、展開三段、動作列、技術細節） | 完成 | `diagnosis-list.tsx`：`li.alert-row > details.diagnosis-row[data-testid=diagnosis-row-{rule}]`（同名 id 供備註連結），summary 一行 ≥ 48px（chevron、狀態標籤 資料待補／不利／有利、h3 標題、影響金額純文字；範圍標籤只在與頁面範圍不同時顯示；無互動元件、無「｜」）；展開：「影響金額 · {範圍}」＋可點金額、範圍 chips、相關數字 `dl.kv-list`（整數元 number-link）、可能原因（待確認）／下一步（14px）、限制（13px，無「注意：」）、檔期、看明細／加入待辦、技術細節 `<details>`（12px 等寬：規則代號、排序金額、metric_version、hash、fact IDs、限制）；前 3 列 open |
| 計數徽章「資料待補 n · 不利 n · 有利 n」、刪除「自動健檢」、範圍文字只出現一次 | 完成 | `diagnosisCounts(groups)` 依 `alertStatus` 色調計數（0 項不渲染；`diagnosis-count-*`，role=img＋aria-label「3 項不利」）；側欄徽章改用同一函式；「自動健檢」「n 項」「先補資料」tag 刪除；範圍只在標題列一次；健檢結果移到各通路兩期比較之前（§7.2） |
| 範圍切換 chips 留在列內、超過 4 個收進「更多範圍」popover | 完成 | chips（aria-pressed）沿用 state，切換該列相關數字、影響金額與技術細節；其餘收進 `details.scope-more`（ui-popover，Esc 回焦、外部點擊關閉、內容保持掛載） |
| 通路寬表欄序（通路｜淨營收 本期／上期／差額｜扣廣告後貢獻 本期／上期／差額｜備註）、欄群組標題、預設排序與 `aria-sort` | 完成 | `ChannelWideTable variant="diagnosis"`（`channel-table-v3`）：兩層表頭（「淨營收（元）」「扣廣告後貢獻（元）」colSpan 3 ＋ 本期／上期／差額）、四欄可排序（表頭按鈕＋SVG icon、`aria-sort`，預設本期扣廣告後貢獻由低到高）、差額只有不利上色、每格 number-link（可及名稱「{通路} {指標} {值} 元，看明細」）、備註欄轉負／轉正 lozenge＋該通路健檢標題連結（展開對應列並聚焦）；會議摘要沿用 default 變體 |
| 手機清單（C3：`data-label`／`data-list-role`，axe 通過） | 完成（axe 以 Lighthouse 內建 axe-core 審核為準：390 寬的通路健檢頁與商品毛利頁 0 個失敗審核；抽屜的手機清單無 Lighthouse 步驟，以 `evidence-drawer-v3` 單元測試核對 role／data-label／data-list-role） | 通路寬表（主行 通路＋本期扣廣告後貢獻＋差額；次行 淨營收與差額；上期欄隱藏）、商品前 10 名與完整表（主行 商品＋本期毛利；次行 差額、件數、毛利率）皆保留 `<table>` 並明確加 role=table／rowgroup／row／columnheader／rowheader／cell 與 data-label；E2E axe 結果見 §3a |
| AI 區收合成一列（內容與 testid 全部保持掛載） | 完成 | `src/components/ai-collapse.tsx`：`details.ai-collapsed[data-testid=ai-collapsed]`，summary「AI 解釋 · 未啟用（公開示範站不送出任何資料）」（狀態字依 AI 可用性：未啟用／需先預覽並同意／狀態確認中）；`ai-panel` 與全部 `ai-*` testid 原樣在內、收合時保持掛載（mounted-testids 驗證） |
| 商品頁頁首描述、範圍副標、「匯出本頁」下拉（兩個 CSV） | 完成 | 頁首描述「只看商品毛利，不分攤平台費和廣告費」（`products.pageV3.description`）；副標「本期 7/13–8/23 對比 上期 6/1–7/12 · 全部通路 · 金額未稅」（`product-scope`）；`PageHeader` 新增 `#page-actions` 插槽，商品頁的「匯出本頁」選單（`product-export-menu`，summary `export-page-products`）以 portal 放入，兩項（`product-export-comparison`／`product-export-products`）沿用 v2 handler、檔名與 CSV 內容，含稅換算註記放商品明細項的說明行 |
| 前 10 名兩表並排（排名、SKU · 通路、本期商品毛利、差額） | 完成 | `product-worst`／`product-best` 改 C3 `.ui-table`（跟著密度切換）：排名｜商品（SKU＋12px 次要色通路）｜本期商品毛利（元）｜差額（元），每格 number-link 沿用 v2 抽屜內容 |
| 工具列 C15（≤ 5 控制：品類、搜尋、排序合併 select、只看負毛利、欄位 ▾） | 完成 | `product-toolbar`（`.ui-toolbar`）直接子控制 5 個：品類 `#product-category`、搜尋 `#product-search`、排序 `#product-sort`（9 個合併選項，值「{sort}.{direction}」，`#product-direction` 移除）、只看負毛利（aria-pressed）、「欄位」popover（`product-more-columns` 與密度 radio `product-density` 在內、Esc 回焦、外部點擊關閉）；筆數「顯示 n 筆，共 m 筆」`product-count`（aria-live）在工具列右側 |
| 完整表（右對齊整數元、表頭單位、sticky、密度 40／32px F18、筆數 aria-live、篩選空狀態 C10、技術細節在表下） | 完成 | `product-table` 欄序／欄名不變；金額欄 `.num` 右對齊、單位只在表頭；thead sticky（`.product-table-scroll` 以視窗高限制）；密度 `[data-density=compact]` 32px（localStorage `profitlens.table-density`，try/catch，不進備份）；篩選 0 筆→「沒有符合篩選的商品。」＋「清除篩選」（`product-clear-filters`，清空品類／搜尋／只看負毛利後回焦搜尋框）；技術細節 `<details>` 移到表下 |
| 抽屜重排（h2 只放指標名或結論句、副標、L1 大數字＋精確值、計算方式、組成項目表、指標定義與算法、原始明細、技術細節） | 完成 | `evidence-drawer.tsx`：h2 可見文字＝標題（sr-only 後綴「 · 計算與來源」維持 dialog 可及名稱）、副標 `{範圍} · {期間}`（M/D、本期／上期前綴、必要時「通路：…」）、`p.number` L1＋`evidence-precise-value`、計算方式（階梯／比率表）、組成項目 `table.kv.l3`（上期／本期／差額）、指標定義與算法（白話定義＋「版本 contribution-v1」＋指標定義按鈕）、原始明細（分段鈕、搜尋、「第 1–20 筆，共 128 筆」、檔案:行號等寬、日期、通路、欄位與數值、分頁；`evidence-conversion-note` 位置不變）、條件句（無「注意：」）、技術細節 `<details>`（`evidence-rounding-note`） |
| 抽屜寬度 560／640／480／全螢幕、標題列固定、開啟聚焦關閉鈕、回焦 | 完成 | `.evidence-drawer` 560px、≥ 1440 640px、≤ 1279 480px、≤ 767 全螢幕；標題列 sticky 56px；關閉改 icon 按鈕（aria-label「關閉」，autoFocus）；右側滑入 `--dur-base`（reduced-motion 直接出現）；focus trap 與回焦沿用 `<dialog>` 既有做法；`aria-labelledby`／`aria-describedby` 指向 h2 與副標 |
| labels 新分組（`diagnosis.listV3`、`diagnosis.tableV3`、`diagnosis.aiCollapse`、`products.pageV3`、`evidence.drawerV3`） | 完成 | listV3 4、tableV3 5、aiCollapse 5、pageV3 27、drawerV3 15 個鍵；copy-style 計數不變（同義詞 13、禁用詞 3）；舊鍵保留到 V3-10 |
| 單元測試與 E2E 遷移 | 完成（unit 101 檔／2,042 全過；E2E 全套 612／612） | 新增 `tests/diagnosis-v3.test.tsx`、`tests/product-page-v3.test.tsx`、`tests/evidence-drawer-v3.test.tsx`（18）；同步 `diagnosis-list`、`manager-language`、`mounted-testids`（ai-collapsed、scope-more 掛載）、`product-highlights`、`format-surfaces`；E2E 見 §3 |

## 2. 變更檔案

- 新增：`src/components/ai-collapse.tsx`、`tests/diagnosis-v3.test.tsx`、`tests/evidence-drawer-v3.test.tsx`、`tests/product-page-v3.test.tsx`、`verification/revamp-v3/V3-5/**`、本檔。
- 修改：`src/app/globals.css`、`src/components/channel-table.tsx`、`src/components/dashboard.tsx`、`src/components/diagnosis-list.tsx`、`src/components/evidence-drawer.tsx`、`src/components/product-comparison-panel.tsx`、`src/components/shell/page-chrome.tsx`、`src/components/shell/shell-frame.tsx`、`src/components/shell/shell-icon.tsx`、`src/components/workspace-panels.tsx`、`src/i18n/labels.zh-TW.ts`、`tests/diagnosis-list.test.ts`、`tests/format-surfaces.test.tsx`、`tests/manager-language.test.ts`、`tests/mounted-testids.test.tsx`、`tests/product-highlights.test.ts`、E2E spec（第二階段）、`docs/{STATUS,DECISIONS}.md`、`docs/revamp-v3/06_BATCHES.md`、`verification/revamp-v3/{feature-retention,e2e-text-assertions}.csv`。
- 零改動：`src/domain`、`fixtures`、`docs/METRICS.md`、`.env*`、`vercel.json`；`workspace-panels.tsx` 的舊 `Products` 元件未動（無人使用，V3-10 清理）。

## 3. 驗收命令與真實結果

| 命令 | 結果 |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | 0 warnings |
| `npm test -- --run` | **101 檔／2,042 測試全過**（V3-4b：98 檔／1,996；新增 diagnosis-v3、product-page-v3、evidence-drawer-v3） |
| `npm run lint:design` | exit 0；hex 0、圓角 4、字級 13、字距 0、JSX 箭頭 3（匯入精靈含稅換算的「→」保留）、eyebrow 0、裝飾 0；labels 同義詞 13／禁用詞 3 不變；對比 75／75；棘輪上限不變（本批無下降項） |
| `npm run build` | pass |
| `npm run test:e2e` | **612 passed（17.1m）**，0 failed、0 skipped；desktop／laptop／tablet／mobile 四專案（webServer 重建 build）。跑完後 `verification/review-v2-a-*`、`verification/revamp-R6/` 被重寫，已 `git checkout --` 還原 |
| 畫面基準 | `verification/revamp-v3/V3-5/snapshots/{desktop,laptop,tablet,mobile}/01–09.png` 共 36 張（baseline.spec `--update-snapshots` 4 passed），重跑核對 4 passed、0 張差異；首屏量測（metrics.spec 6 passed，`_meta.batch=V3-5`）與 V3-4b 相同：1440 本期一句話頂端 192px、KPI 帶底 419px、扣廣告後貢獻值頂 323px、三件事首列底 525px、KPI 前可聚焦 9；390 分別 116／555／295／685、可聚焦 3。 |
| Lighthouse（示範資料已載入，1440 與 390） | 1440 與 390 各 6 個快照步驟 accessibility 全部 100（經營總覽、通路健檢、商品毛利、假設試算、會議紀錄＋首頁空狀態）；首頁 performance 1440＝100、390＝98（與 V3-4b 相同）。失敗審核：通路健檢頁 V3-4b 的 `label-content-name-mismatch` 本批清零（兩尺寸皆 0 個失敗審核）；會議紀錄頁仍有 `label-content-name-mismatch` 18 個節點（主管摘要的 number-link，V3-4b 已存在，屬 V3-7 會議頁範圍；此審核不計分）。報告：`verification/revamp-v3/V3-5/lighthouse/flow-desktop-1440.html`、`flow-mobile-390.html`；數值在 `metrics.json`。 |
| 禁區 diff（對 82b70df） | 空 |
| testid 基準 | 刪除數 0；新增 ai-collapsed、channel-compare、diagnosis-count-{missing,unfavorable,favorable}、page-actions、product-export-menu、export-page-products、product-export-{comparison,products}、product-scope、product-toolbar、product-count、product-density、product-empty、product-clear-filters；移除的 id（非 testid）：product-direction |

### 3a. 本批驗收重點（PRD §7.2、§7.3、§7.8）

| 指標 | 目標 | 實測 |
|---|---|---|
| `diagnosis-row-*` 前 3 列 `open`；summary 不含「｜」 | 成立 | 成立：E2E `revamp-r5.spec.ts` 第 189 條（golden 六列：前三列 `open`、第四列起無 `open`；summary 內 `.ui-lozenge` 狀態標籤、`.impact-amount` 純文字）；summary 的文字由 labels 組成，`copy-style` 禁用「｜」且 `diagnosis-v3` 單元測試核對兩層表頭不含分隔線 |
| 計數徽章數字與列數一致；範圍文字只出現一次 | 成立 | 成立：同一條 E2E 斷言 `diagnosis-count-unfavorable` 的可及名稱＝`fill(labels.diagnosis.listV3.countUnfavorable, { n: 6 })`、missing／favorable 徽章不渲染（0 項）；單元測試 `diagnosis-v3` 第 147 條核對三色計數與中性不計。範圍文字：summary 只在列範圍≠頁面範圍時標（合計列無，MARKETPLACE 列有），標題列只寫一次（E2E 第 219–240 行） |
| 商品頁工具列控制數 | ≤ 5 | 5（`product-toolbar` 直接子控制：品類、搜尋、排序合併 select、只看負毛利、欄位 popover；`product-page-v3` 第 119 條斷言 ≤ 5，`#product-direction` 已不存在） |
| 兩個 CSV 下載內容 | 與 v2 位元組一致（標題列除外） | 成立：兩份 CSV 仍由 `src/application/export.ts`（exportProductsCsv）與 `product-comparison-export.ts`（exportProductComparisonCsv）產生，兩檔對 82b70df diff 為空；呼叫引數與檔名與 v2 相同（v2 `product-comparison-panel.tsx` 第 125–126 列 → 本批第 248–249 列，逐字相同）。E2E `import.spec`／`product-comparison.spec` 以獨立 CSV 讀取器核對欄位與數值通過。未另做位元組級檔案比對（同函式、同引數、labels 未改，輸出必然相同，含標題列） |
| 抽屜 h2 | 不含「｜」「怎麼算的」；`aria-labelledby`／`aria-describedby` 指向 h2 與副標；開啟後焦點在關閉鈕 | 成立：`evidence-drawer-v3` 第 49、62、72 條（h2 可見文字只有標題、可及名稱以「 · 計算與來源」結尾、不含「｜」「怎麼算的」；`aria-describedby` 指向副標 id；關閉 icon 鈕 aria-label＝關閉、autofocus 且是抽屜第一個可聚焦控制）；E2E `revamp-r5` 第 243 行核對關閉後回焦 |
| 手機表格 axe | 0 個 serious | 0（Lighthouse axe-core 審核，390 寬：通路健檢頁與商品毛利頁失敗審核皆 0；專案沒有 `@axe-core/playwright`，本輪不新增依賴，故沒有獨立 axe 跑分） |
| `design-lint` hex | ≤ 10 | 0 |

## 4. 瀏覽器驗收

- 方式：示範資料（`APP_MODE=PUBLIC_DEMO`）的 production 伺服器，Playwright `baseline.spec.ts` 依 `CAPTURE_BATCH=V3-5` 逐頁截圖（01 空狀態、02 總覽、03 抽屜、04 期間、05 健檢、06 商品、07 試算、08 待辦、09 會議），四尺寸 1440×1000、1280×900、768×1024、390×844；寫入後重跑核對 0 差異。
- 截圖路徑：`verification/revamp-v3/V3-5/snapshots/desktop/05-diagnosis.png`、`06-products.png`、`03-evidence-drawer.png`；`laptop/`、`tablet/`、`mobile/` 同名各一張（共 36 張）。
- 人工檢視（1440 與 390 的 03／05／06）：健檢頁「健檢結果 不利 6」在前、前三列展開、合計 chip 預設、「看明細」「加入待辦」在動作列、技術細節收合；各通路兩期比較兩層表頭、本期扣廣告後貢獻 ↑ 排序、備註「轉負」＋「折扣多花 118.8 萬」連結；AI 一列收合。商品頁頁首「匯出本頁」在右上、範圍副標一行、前 10 名兩表並排、工具列 5 控制、「顯示 40 筆，共 40 筆」在右上、sticky 表頭。抽屜 h2「折扣多花 118.8 萬」、副標範圍與期間、`−118.8 萬` 與 `−1,188,365.10 元`、計算方式／組成項目／指標定義與算法／原始明細（`sales_daily.csv:10`）。
- 390：健檢通路表與商品表改清單（主行／次行、欄名由 `data-label` 顯示）；商品頁整頁 10,451px 高是 40 筆完整表以清單呈現的預期結果；抽屜全螢幕、標題列固定、關閉鈕在右上。
- Lighthouse 流程報告：`verification/revamp-v3/V3-5/lighthouse/flow-desktop-1440.html`、`flow-mobile-390.html`。

## 5. 已知限制與偏離

- 抽屜原始明細在抽屜寬 < 640px（視窗 ≤ 1439px）時以 CSS 重排成清單（DOM 與 role 不變），比 C3 的 767px 斷點寬：480／560px 抽屜放不下四欄表。若 H2 審查要求 768–1439 用表格，改錨點 C 的 media query 即可。
- 前 10 名表用 C3 `.ui-table`（跟著密度切換）而非 C2 `.kv`（固定 32px）；PRD §9.3 要求兩表跟著本頁密度。
- 排序與方向合併為一個 select 後，`#product-direction` 移除（E2E 已改）；CSV 的 sort／direction 欄位值不變。
- AI 收合列附註用 GLOSSARY 的「公開示範站」，PRD §7.2 範例寫「公開版」；H3 審稿時決定。
- 通路寬表只有健檢頁用新欄序；會議摘要的通路表仍是 v2 欄序（V3-7 處理）。待辦引用的抽屜副標沒有「本期／上期」前綴（開待辦引用時不傳目前報表，fact 可能來自舊資料集，屬設計）。
- 健檢列的「更多範圍」popover 與手機清單的 axe 未在 E2E 補測（golden／demo 每列最多 3 個範圍，不會出現 popover；E2E 無 axe 依賴）；手機清單以明確 role 與 Lighthouse 四尺寸 Accessibility 100 佐證。
- `tests/e2e/revamp-r2-copy.spec.ts:118`、`scenarios.spec.ts:233` 的 BOM 去除正規式含字面 U+FEFF，自 v2.0.0 既有，非本批引入（V3-10 可改成 `\uFEFF` 逃脫）。
- 舊鍵保留到 V3-10：`ui.workspacePanels.channelTableHeading`／`tagMissingData`、`sections.autoCheck`、`diagnosisList.moreScopes`、`ui.evidenceDrawer.scopeLine`／`colSource`／`colScope`／`colValues`、`evidence.scopeFallback`／`lineN`；`workspace-panels.tsx` 的舊 `Products` 元件未動。
- 示範資料的 Lighthouse `label-content-name-mismatch`（健檢、會議頁）：健檢頁的表格 number-link 可及名稱已改為含可見值的句型，結果見 §3。

## 6. 下一批、人工關卡、需要拍板

- **下一批 V3-6 假設試算與待辦**。
- **H2 後補**、**H3 補審**仍待人工。
- 需要拍板：無新增（本批取捨記在 `docs/DECISIONS.md` 2026-10-07 V3-5）。
