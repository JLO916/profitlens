# 06 分批任務（R0–R7）

> 每批格式：目標／範圍外／任務（檔案）／測試／驗收（[auto] 可由命令或 E2E 驗證；[manual] 需人工）／允許新增依賴／風險與回退。任務編號用於回報對照。批次間不可跨做；一批未全部通過不開下一批。

---
## R0 基線與安全網（0.5 天）
**目標**：建立改版分支、確認全套檢查在乾淨環境通過、放入規劃文件與標籤字典骨架，零功能變更。
**範圍外**：任何 UI 或邏輯改動。

任務：
- R0-1 建分支 `revamp/v2`（自 `main`）。
- R0-2 乾淨環境 `npm ci` → typecheck／lint／test／build／test:e2e 全跑，結果寫入 `verification/revamp-R0-acceptance.md`（作為基線）。
- R0-3 四尺寸「改版前」截圖（載入示範後的總覽、健檢、試算、行動、資料來源）存 `verification/revamp-R0/before/`。
- R0-4 放入 `CLAUDE.md`、`docs/revamp/*`、`src/i18n/labels.zh-TW.ts`；新增 `src/i18n/index.ts`（`export { labels } from "./labels.zh-TW"` 與 `t(path)` 取值小工具）。此時不接線。
- R0-5 grep 所有 `data-testid` 與 E2E 使用的選擇器，輸出 `verification/revamp-R1/testids.txt`。
- R0-6 在 `docs/STATUS.md` 新增「Revamp v2」章節與 R0 記錄；`docs/DECISIONS.md` 加一筆「Revamp v2 原則：財務核心零改動、標籤單一來源」。

測試：無新增；全套通過即可。
驗收：[auto] 全套通過且與 main 相同數量；[auto] `npm run build` 無警告新增；[manual] 截圖齊全。
允許依賴：無。
風險：E2E 環境（Playwright Chromium、3100 port）；若無法執行，寫「未執行」並說明，但 R1 開始前必須解決。

---
## R1 總覽重排與頁首減負（1.5 天）
**目標**：載入示範後首屏看到 KPI；每頁首屏不再被重複元件佔滿；切頁歸零；符號語意一致；小 bug 修正。
**範圍外**：改名詞（R2）、改計算、改匯入。

任務（主要檔案：`src/components/dashboard.tsx`、`overview.tsx`、`review-workbench.tsx`、`manager-summary.tsx`、`workspace-storage.tsx`、`src/app/globals.css`）：
- R1-1 AI 狀態橫幅 → 頂欄小標籤＋popover；保留 `data-testid="ai-availability"`、`role="status"`、`aria-live`。
- R1-2 `WorkspaceStorage` → 頂欄「儲存 ▾」選單（內容與 testid 原封搬移）；未保存變更顯示「● 未保存」。
- R1-3 期間列 sticky（`.filter-bar { position: sticky; top: 0; z-index }`），緊湊化；新增快捷鈕列（本批先做：近 7 天、近 4 週、近 12 週、本月 vs 上月；「去年同期」R4）—— 快捷只填日期，按「套用」才生效。對應 `src/application/period-presets.ts`（R1 建檔，R4 補去年同期）。
- R1-4 總覽順序改為 `02_IA_LAYOUT.md §3`：KPI → 三件事（含兩個關鍵差額）→ 趨勢 → 橋接＋通路比較 → 期間合計與日均（`<details>` 收合）→ 會議設定（頁尾、收合）。通路寬表搬到健檢頁頂。
- R1-5 各頁內容區的下載鈕集中到頂欄「下載 ▾」；試算與行動頁的「輸出」區塊保留。
- R1-6 切頁捲動歸零並聚焦 `main#main-content`。
- R1-7 符號語意：三件事與健檢卡顯示「對貢獻影響」（依 `05_FEATURES.md §7` 的 impact 定義，先只做顯示層，不改排序邏輯）；紅＝不利、綠＝有利；原「排序用已觀察金額差」收到技術細節。此定義寫入 `docs/DECISIONS.md`。
- R1-8 修正：行動頁執行狀態 `<select>` 高度（CSS 範圍限定）；側欄「合成」徽章文字改「示範資料」；品牌副標與 `<title>` 統一。
- R1-9 示範資料載入鈕只在空狀態與資料來源頁顯示。

測試：
- 新增 `tests/e2e/revamp-r1-layout.spec.ts`：載入示範後，`desktop`／`laptop` 專案斷言 KPI 區塊（`[aria-label="本期關鍵數字"]` 或現有 heading）bounding box `y + height ≤ viewport.height`；三件事在一次 `PageDown` 內可見；切頁後 `window.scrollY === 0`；AI 標籤存在且 popover 可開。
- 更新受影響的既有 E2E（選擇器搬移），不刪斷言。
- `tests/manager-language.test.ts` 不改（本批不改名詞）。

驗收：[auto] 全套通過；[auto] 新 E2E 四尺寸通過；[auto] grep `view-content` 內無 `.ai-availability` 大橫幅；[manual] 四尺寸截圖存 `verification/revamp-R1/after/`，與 R0 before 並列於 acceptance.md。
允許依賴：無。
風險：E2E 選擇器大量搬動 → 先跑 R0-5 的清單逐一對照。回退：整批 revert。

---
## R2 語言與文案層（2 天）
**目標**：所有使用者可見文字改為 `03_GLOSSARY_COPY.md`；免責集中；口徑說明；公式抽屜中文階梯。
**範圍外**：功能行為、計算。

任務：
- R2-1 `src/application/presentation.ts`：`metricDefinitions` 的 `label`／`formula` 從 `labels.metrics` 取值；新增 `shortLabel`、`plain`、`formulaTechnical`。確認 `src/ai/grounding.ts`、`ai-snapshot.ts`、`export.ts` 等 13 個引用點行為（AI 預覽的 facts 文字改中文新名；AI mock 測試斷言同步更新）。
- R2-2 導覽、區塊標題、按鈕、狀態、說明全面接 labels（`dashboard.tsx`、`overview.tsx`、`workspace-panels.tsx`、`manager-summary.tsx`、`review-workbench.tsx`、`multi-scenario-workbench.tsx`、`decision-workbench.tsx`、`scenario-sensitivity.tsx`、`actions-workbench.tsx`、`import-panel.tsx`、`evidence-drawer.tsx`、`ai-panel.tsx`、`workspace-storage.tsx`、`issue-list.tsx`）。
- R2-3 規則卡文案：`labels.rules[RuleCode]`（標題模板、可能原因、下一步、注意）由呈現層覆寫；`src/domain/rules.ts` 不改。標題模板的占位符格式化在 `manager-summary.ts` 新增 `formatHeadline()`（金額「萬」顯示規則：≥ 10,000 顯示 x.x 萬，否則顯示整數元）。
- R2-4 新增 `src/components/basis-dialog.tsx`（口徑說明九條，內容在 `labels.basis`），頂欄 ⓘ、KPI 抽屜、頁尾開啟；Esc 關閉回原按鈕。
- R2-5 免責集中：依 `03 §8` 刪減各區塊句子；頁尾改為統一一句。
- R2-6 公式抽屜（`evidence-drawer.tsx`）：中文階梯區塊＋技術細節收合；來源列改為依檔案分頁。
- R2-7 示範資料通路 alias（`labels.demoChannelAlias`，僅 synthetic 生效）；通路選單、表格、標籤、匯出 Markdown 顯示「官網 · DTC」。CSV 的 channel 值不變。
- R2-8 匯出：Markdown／列印的名稱改 labels；CSV 標題列改「中文（key）」格式；更新 `export.test.ts`、`decision-export`、`product-comparison-export` 相關測試。
- R2-9 測試改寫：`tests/manager-language.test.ts`、`manager-summary.test.ts`、`ai-presentation.test.ts`、`v2-review.test.ts` 與所有 E2E 的中文字串斷言改為引用 labels；新增 `tests/labels-coverage.test.ts`（每個 MetricName、RuleCode、nav id 都有條目；主層 JSX 不含舊名詞清單：行銷後貢獻、行銷前貢獻、已入帳退款、履約費用、取分調整、稽核資訊、建立行動草稿）與 `tests/copy-density.test.ts`（`03 §8-4`）。
- R2-10 `src/app/layout.tsx` metadata：title、description 改新文案；`lang="zh-Hant-TW"`。

驗收：[auto] 全套通過；[auto] labels-coverage 與 copy-density 通過；[auto] `grep -rn "行銷後貢獻" src --include=*.tsx` 僅剩 labels 檔與技術細節區；[manual] 讀一遍總覽、健檢、試算、行動頁文案，無術語外露；截圖存 `verification/revamp-R2/`。
允許依賴：無。
風險：字串斷言測試數量多。做法：先改 labels → 跑測試取得失敗清單 → 逐檔改為引用 labels；禁止用 `.skip`。

**建議在此 tag `v2.0.0-beta.1` 並部署到 Vercel preview。**

---
## R3 匯入精靈與台灣來源（3 天）
**目標**：`04_IMPORT_TW.md` 全部；domain 零改動。
**範圍外**：UI 內訂單彙總（D5 決策另批）。

任務：
- R3-1 `import-panel.tsx` 重構為四步精靈（可拆成 `import-wizard/step-files.tsx`、`step-mapping.tsx`、`step-basis.tsx`、`step-review.tsx`，狀態集中在 `src/application/import-wizard.ts`），對外仍呼叫 `onCommit`／`onCancel`。
- R3-2 檔案拖放、自動歸位、即時大小／列數／編碼檢查（`src/lib/csv.ts` 已有嚴格 parser，只做輕量預讀標題列與列數）。
- R3-3 `src/application/tax-basis.ts` 含稅換算＋`ImportSource.raw_values`＋`conversion` metadata；來源抽屜顯示原值→換算值；匯出與資料來源頁顯示前處理摘要。
- R3-4 `src/application/source-presets/`：9 個候選 preset（`verified: false`）＋通用中文欄名字典＋偵測函式；UI 顯示「看起來像…」。
- R3-5 `src/application/mapping-memory.ts`（IndexedDB 新 store，受保存同意控制）；Step 2 顯示記憶提示。
- R3-6 範圍提議直接填入表單、通路自動列出、截至日預設、整月快捷。
- R3-7 錯誤訊息白話對照（`labels.importErrors`，以 reason code 為鍵；先 grep `validation.ts` 全部 code）。
- R3-8 範本檔改為含三列範例（`templates/*.csv` 不改原檔，新增 `templates/examples/*.csv`），下載選單提供兩種。
- R3-9 `scripts/aggregate_orders.py` 第一版（讀 `rules.json`，輸出三檔＋log）＋ `docs/ORDER_AGGREGATION.md` 說明；精靈偵測到訂單級檔案時導向此說明。

測試：`tests/tax-basis.test.ts`（golden 手算）、`tests/mapping-memory.test.ts`、`tests/source-presets.test.ts`（指紋偵測、字典預選、`verified` 旗標存在）、`tests/e2e/import-wizard.spec.ts`（≤ 5 次點擊；記憶提示；含稅匯入後 KPI＝手算；拒絕超限）；既有 import 測試更新。
驗收：見 `04 §7`。
允許依賴：無（拖放用原生 API；SHA-256 用既有 `hashInput`）。
風險：精靈重構影響 `tests/e2e/import*.spec.ts`、`import-guidance.spec.ts`；先保留舊面板於 `#legacy-import`（隱藏）一個批次以利回退，R4 刪除。

---
## R4 輔助指標、去年同期、目標、檔期、備份 v4（3 天）
**目標**：`05_FEATURES.md §1–§5`（§6 依決策 D6）。
**範圍外**：會議與匯出新格式。

任務：
- R4-1 domain 加法：`Summary.units_sold`（`aggregation.ts` 加總 units；任何列 null 則 null＋reason `MISSING_UNITS_SOLD`）；`ProductRow.metrics` 加 `units_sold`。新增 `tests/units-sold.test.ts` 以 golden fixture 手算件數（golden 檔內的 units_sold 既有，expected 由人工加總寫在測試常數，不改 `expected.json`）。
- R4-2 `src/application/assist-kpi.ts`（`assist-kpi-v1`）：件均淨營收、整理六個輔助指標的呈現物件；總覽「輔助指標」橫列；Markdown／CSV 匯出加入。
- R4-3 `period-presets.ts` 補去年同期＋涵蓋檢查＋閏年；UI 快捷鈕。
- R4-4 `targets.csv` 匯入／驗證／匹配／KPI 卡達成率；資料來源頁入口。
- R4-5 `events.csv` 匯入／趨勢圖區帶／三件事標註。
- R4-6 備份 v4：schema、遷移、checksum；UI 版本字串更新。
- R4-7 刪除 R3 保留的 legacy import 面板。
- R4-8（若 D6＝做）`orders_daily.csv`：validation 加法、golden fixture `fixtures/orders_sample`、訂單數／客單價／轉換率。

測試：`units-sold`、`assist-kpi`（含 A=0、N≤0、件數 0 邊界）、`period-presets`（月底、閏年、涵蓋邊緣）、`targets`（匹配與不匹配）、`events`、`workspace-backup`（v3→v4 roundtrip）、E2E：快捷鈕、達成率顯示、趨勢區帶。
驗收：[auto] 全套＋新測試通過；[auto] `fixtures/golden|demo|errors|refund_only|zero_ad` 零改動（`git diff --stat fixtures/` 為空）；[auto] `docs/METRICS.md` 零改動；[manual] 總覽截圖含輔助指標與達成率。
允許依賴：無。
風險：domain 加法影響既有 snapshot 序列化（BigInt）；確認 `createSnapshot` 與備份序列化處理 `units_sold`。

---
## R5 健檢、試算、行動的決策化（3 天）
**目標**：`05 §7–§9`、`02 §4–§7`。
**範圍外**：會議紀錄分頁。

任務：
- R5-1 `DiagnosisGroup` 結構與排序（`manager-summary.ts`）；健檢頁清單化（`workspace-panels.tsx` → 可拆 `diagnosis-list.tsx`）；通路寬表置頂；預設展開前三列；AI 區塊維持底部。
- R5-2 三件事改用同一 group 結構；標題模板格式化（R2-3 已建）。
- R5-3 試算頁流程：進頁即表單（`multi-scenario-workbench.tsx` 合併兩層建立動作）；通路單選預設第一個；範本選單（`scenario-presets.ts`）；絕對值模式（表單層換算，引擎輸入不變）；版本號只在計算時遞增；固定假設收合。
- R5-4 敏感度三組輸入納入 scenario state、決策匯出與備份（`scenario-workspace.ts`、`decision-export.ts`、`workspace-backup.ts`；備份仍為 v4，欄位加法）。
- R5-5 行動看板視圖（四欄＋按鈕改狀態）、表單修正（日期、負責人 datalist、證據 checkbox 清單含搜尋）。
- R5-6 商品毛利頁：Top／Bottom 10 小表、欄位重排、毛利率欄、「資料狀態」文案（`product-comparison-panel.tsx`、`product-comparison.ts` 只加呈現欄位）。

測試：`diagnosis-group.test.ts`（合併合計／通路、missing 置頂、門檻）、`scenario-presets.test.ts`、`scenario-absolute-mode.test.ts`（絕對↔相對換算、界限提示、件數缺時停用）、`v2-scenario-workspace`／`decision-export` 更新（敏感度納入）、E2E：試算 ≤ 2 次點擊到表單、健檢列展開、加入待辦 ≤ 2 次點擊、看板改狀態。
驗收：[auto] 全套＋新測試；[auto] 既有 golden 情境答案（Golden DTC 284.00／264.00、MARKETPLACE 19.70）不變；[manual] 四尺寸截圖。
允許依賴：無。
風險：scenario state 結構變動影響備份遷移；敏感度加入後舊備份讀入要給空值。

---
## R6 會議紀錄、匯出、預設保存（3 天）
**目標**：`05 §10–§12`、`02 §8`。
**範圍外**：帳號、雲端。

任務：
- R6-1 `src/application/meeting.ts`（承接 `review-session.ts`）：Meeting 物件、finalize、`meeting_history`；備份 v4 欄位加法。
- R6-2 新分頁「會議紀錄」（`src/components/meeting-page.tsx`）：議程自動組成、決議、上次會議比較、置頂行動；總覽只留一行入口；`ReviewWorkbench` 內容搬入。
- R6-3 列印樣式強化（A4 一頁摘要＋附錄）＋「匯出 PDF」按鈕（`window.print()`）。
- R6-4 Excel 匯出（依 D4）：`src/application/excel-export.ts`，六個工作表；文字欄逃逸；金額為數值型別、比率為小數。
- R6-5 PPT 一頁式（依 D4）：`src/application/pptx-export.ts`；若 D4 不允許，改為 PDF 一頁式版面。
- R6-6 預設保存：首次同意對話框、自動保存（debounce 2s）、頂欄「已保存 hh:mm」；既有手動流程保留。
- R6-7 「下載 ▾」選單整合所有格式。

測試：`meeting.test.ts`（finalize 不可變、比較規則、dataset 不同時的降級）、`excel-export.test.ts`／`pptx-export.test.ts`（結構與逃逸；以解析產物驗證工作表名與儲存格）、`workspace-storage` 自動保存 E2E（變更後 3 秒內 IndexedDB 有新版本）、會議流程 E2E（建立→選方案→置頂→結束→新會議顯示上次比較）。
驗收：[auto] 全套；[manual] 用 Excel／PowerPoint 開啟產物無錯誤、PDF 一頁可讀（截圖存證）。
允許依賴（依 D4）：`xlsx`（SheetJS）或 `exceljs`；`pptxgenjs`。版本以 `npm view` 當下最新穩定版精確鎖定，寫入 `docs/DECISIONS.md`。
風險：新依賴的 bundle 大小與 CSP；先量 `npm run build` 的 first-load JS 差異，超過 +300 KB 需動態 import。

---
## R7 README、示範資料、上線（1.5 天）
**目標**：`08_RELAUNCH.md` 全部。
**範圍外**：新功能。

任務：
- R7-1 README 依 `08 §1` 重寫；工程與驗收內容移到 `docs/ENGINEERING.md` 與 `docs/RELEASES.md`。
- R7-2 示範資料台灣化（依 D3：alias 已在 R2；若選新 fixture，建立 `fixtures/demo_tw` 與手算 `expected.json`，示範選單預設切換）。
- R7-3 空狀態與 landing 文案；`layout.tsx` metadata、OG image（靜態 1200×630 PNG 放 `public/og.png`）、favicon、`robots.txt`、`sitemap`（單頁）。
- R7-4 進階驗證頁隱藏（`#validation`）。
- R7-5 上線前檢查清單（`08 §4`）逐條執行：Vercel env 不變、13 項 HTTP 檢查、`/api/insights` POST 403、四尺寸人工、Lighthouse（效能／a11y ≥ 90 記錄實際分數）。
- R7-6 `docs/RELEASES.md` 寫 v2.0.0 發布說明；tag `v2.0.0`；`docs/STATUS.md` 收尾。

驗收：[auto] 全套；[manual] 正式站重新走一遍「試試示範資料 → 三件事 → 加入待辦 → 會議紀錄 → 匯出 PDF」並截圖。
允許依賴：無。
