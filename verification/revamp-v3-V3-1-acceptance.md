# Revamp v3 V3-1 驗收：Token、基礎元件與設計稿（2026-10-05）

依 `docs/revamp-v3/06_BATCHES.md` V3-1 與 PRD §9.1–9.4、§9.8、§5.2（X1、X4、X6、X7、X10、X12、X15、X22）、§2.3 B、§12.2 執行。**只改樣式，不改版面與文案**：JSX 結構與 labels 未動（只有 Recharts 的顏色與軸標字級屬性值）；`src/domain`、`fixtures`、`docs/METRICS.md`、`.env*`、`vercel.json` 零改動；無新依賴。拍板：D-V3-7＝A（有利不上色）、D-V3-9＝A（沿用深綠 `#1f5a4f`）。

## 1. 完成項目（對照 06_BATCHES V3-1）

| 項目 | 狀態 | 說明 |
|---|---|---|
| `:root` 全部 token（§9.1–9.3） | 完成 | 原始色階 20 色＋語意別名層（元件只用別名；依 D-V3-7 不宣告 `--leaf-*`，`--favorable` 指向主文字色）、圖表 `--chart-*`、系統字 `--font-sans`／`--font-mono`（不載網路字型）、字級 `--text-12/13/14/16/20/24/28/32`、字重、行高、間距 `--space-1~7`、圓角 `--radius-sm/md/full`、邊框、唯一陰影 `--shadow-overlay`、尺寸（頂欄、側欄、抽屜、popover、控制項、列高、圖表高）、動態、z 層級；`body` 設 `--bg-page` 與 `tabular-nums` |
| 既有 class 改引用 token；字級、字重、字距收斂 | 完成 | `globals.css` 在 `:root` 以外的 hex 183 → 0；`manager-summary.module.css` 10 → 0；TSX（overview.tsx 的 Recharts）14 → 0。字級相異值 32 → 13（螢幕 8 種：7 個 `--text-*` 加 Recharts 軸標 12px；其餘 5 種為 `@media print` 的 pt 值，列印 token 於 V3-7 處理）；圓角 18 → 4（0、sm 4px、md 6px、full）；字距 13 → 0；box-shadow 7 → 0；字重 550／650 → 500／600 |
| X15 `.button-row` 置中、X10 `.kpi-card.featured` 深色底、X6 `.nav-dot`／`.green-dot`、X4 `.empty-illustration` | 完成（JSX 未動） | 按鈕列靠左、gap 8px；強調 KPI 改白底＋頂部 2px 強調線（`::before`，不佔版面）、標題 600；兩種綠點 `display:none`（class 留到 V3-3 連同 JSX 刪）；空狀態圖示去掉 rotate(-4deg) 與底色、框線，保留尺寸（V3-8 刪）；`@keyframes spin` 與健檢列展開指示的 rotate 保留 |
| 基礎元件 class（C3、C4、C5、C8、C10、C11、C12、C14、C15、C21、C22） | 完成 | 以 `ui-` 前綴新增（避免與現有 class 撞名；目前無 JSX 使用）：`.ui-table`（40／32px 列高、`data-density="compact"`、sticky 表頭、`.num` 右對齊）、`.ui-section*`、`.ui-panel*`、`.ui-lozenge`／`.ui-count-badge`／`.ui-state-dot`、`.ui-empty-*`／`.ui-skeleton-*`（等高 `--block-h`）、`.ui-field*`／`.ui-segmented`／`.ui-check`、`.ui-btn*`、`.ui-menu*`／`.ui-popover`／`.ui-help-*`、`.ui-toolbar*`、`.ui-notice`／`.ui-toast`、`.ui-banner` |
| `contrast-check` 改語意 token 配對、移除 v2 豁免 | 完成 | 75 組（文字 ≥ 4.5：主要、次要、第三層文字在 5 種中性底與 3 種語意淡底；accent、on-accent、unfavorable、warning、favorable、軸標；非文字 ≥ 3.0：輸入框外框、number-link 底線、焦點框、強調線、狀態點、全部圖表色）全部通過，最低 3.01（`--border-input` on `--bg-hover`）；v2 的 nav hover 4.45 與輸入框邊框 1.32 已修正、豁免機制刪除 |
| 元件層：Recharts 顏色與主管摘要 CSS module | 完成 | 折線、長條、格線、軸標、檔期區帶改 `var(--chart-*)`（Chromium 實測 Recharts 所有屬性接受 var()，不需 getComputedStyle hook）；軸標 `fontSize` 10／11 → 12（PRD §9.5）；module CSS 的 rem／clamp 字級改 `--text-*`、圓角 → `--radius-md`、列印 9pt → `--text-12`（等值） |
| 三頁靜態設計稿（H2 審查） | 完成（審查**未執行／待人工**） | `verification/revamp-v3/mockups/{tokens.css,overview.html,evidence-drawer.html,meeting.html}`，1440 與 390 截圖 12 張（`shots/`），`README.md`（與 v2 的差異、10 題 1–5 分審查問題、評分表、提議通過條件：專業感中位數 ≥ 4、AI 感中位數 ≤ 2，**待確認**）；數字由 `fixtures/demo` 手算並核對到分 |
| 品牌名折行修正 | 完成 | 改名 EC ProfitLens 後側欄品牌字在 1440 折成兩行：`.brand > span` 改 nowrap，≤ 900px 側欄品牌字改 `--text-16`（樣式修正，殼層於 V3-3 重排） |
| 棘輪上限調低 | 完成 | `tests/fixtures/design-lint-ceiling.json` 改為本批實測值（見 §3a） |

## 2. 變更檔案

- 修改：`src/app/globals.css`（token 化，約 +720／−420 行）、`src/components/overview.tsx`（Recharts 顏色與軸標字級屬性值）、`src/components/manager-summary.module.css`、`scripts/contrast-check.mjs`、`tests/fixtures/design-lint-ceiling.json`、`scripts/make-og.mjs`（截圖來源改 V3-1）、`public/og.png`、`docs/images/overview-1440.png`、`docs/{STATUS}.md`、`docs/revamp-v3/06_BATCHES.md`。
- 新增：`verification/revamp-v3/mockups/**`（3 頁 HTML、tokens.css、README、12 張截圖）、`verification/revamp-v3/V3-1/snapshots/**`（36 張）、`verification/revamp-v3/V3-1/{metrics.json,lighthouse/*.html}`、本檔。
- 零改動：labels、JSX 結構、`src/domain`、`fixtures`、`docs/METRICS.md`。

## 3. 驗收命令與真實結果

| 命令 | 結果 |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | 0 warnings |
| `npm test -- --run` | 77 檔／1,509 測試全過（design-lint 以新上限通過） |
| `npm run lint:design` | exit 0；對比 75／75 通過，無豁免 |
| `npm run build` | pass |
| `npm run test:e2e` | **576 項全過（15.9m）**，四尺寸（品牌折行修正後的建置；修正前一輪亦 576/576、15.6 分） |
| 畫面基準 | 對 V3-0 基準：36/36 張不同（樣式變更，見 §4）；寫入 `verification/revamp-v3/V3-1/snapshots` 後重跑 4/4 通過、0 差異 |
| 禁區 diff（對 82b70df） | 空 |
| testid 基準 | 刪除數 0 |

### 3a. 棘輪數值（`scripts/ui-audit.mjs`；V3-0 → V3-1；`06_BATCHES` 時程目標）

| 指標 | V3-0 | V3-1 | 目標 |
|---|---|---|---|
| `:root` 以外相異 hex | 201 | **0**（token 定義區 23 ≤ 48） | V3-1 ≤ 60 → V3-8 = 0（提前達標） |
| 相異圓角值 | 18 | **4**（0、sm、md、full） | 3 種＋0 ✔ |
| 相異字級值 | 32 | **13**（螢幕 8；列印 pt 5） | ≤ 8（螢幕達標；列印值待 V3-7 的 `--print-*` token） |
| 非 0 字距 | 13 | **0** | 0 ✔ |
| 裝飾性 rotate、`.button-row` 置中、box-shadow | 1／1／7 | **0／0／0** | — |
| JSX 箭頭／全大寫 eyebrow／裝飾字元、CSS 裝飾 content、JSX 中文 | 6／3／1／2／15＋7 | 不變（V3-2 處理） | — |

### 3b. Lighthouse 13.5.0（user-flow，示範資料已載入；`verification/revamp-v3/V3-1/lighthouse/`）

| 頁 | V3-0 a11y | V3-1 a11y（1440／390） | 備註 |
|---|---|---|---|
| 空狀態首頁 | 100 | 100／100；Performance 100／97（V3-0 100／94） | |
| 經營總覽 | 96 | **100／100** | color-contrast 已清；`label-content-name-mismatch`（number-link 金額按鈕）列於報告但不扣分，V3-2 改文案時處理 |
| 通路健檢 | 97 | **100／100** | 同上 |
| 商品毛利 | 96 | **100／100** | |
| 假設試算 | 96 | **100／100** | |
| 會議紀錄 | 96 | **100／100** | 同總覽 |

390 切頁的 TBT 0.8–1.1 秒與 V3-0 相近；量測時 1 分鐘負載 24（E2E 等工作同時執行），不作為效能結論。

## 4. 瀏覽器驗收與截圖

- `verification/revamp-v3/V3-1/snapshots/{desktop,laptop,tablet,mobile}/01–09-*.png`（36 張）。與 V3-0 比對：差異像素比例 0.10–0.38；整頁高度縮短 4–51px（例如 desktop 總覽 3124 → 3108、試算 3595 → 3562，區塊 h2 19／14 → 16 所致）；四尺寸六頁 `scrollWidth` 等於視窗寬，無水平溢出。
- 肉眼核對（desktop 總覽、抽屜、健檢、試算、會議；mobile 總覽首屏與整頁；laptop 總覽）：沒有元素重排，看得到的變化全部屬 token 收斂——品牌字 22 → 20、h1 29 → 28、區塊標題 → 16、KPI 數值 24px（1280 寬由 21 → 24）、三件事與健檢標題 15 → 16、輔助指標數值 18 → 16、按鈕列靠左、number-link 常駐虛線底線、膠囊 → 4px 圓角、強調 KPI 由深綠反白改白底加綠頂線、側欄淺灰底、綠點消失、有利數字改主文字色、輸入框外框加深（3.58:1）、期間列陰影消失、整體色調由鼠尾草綠轉中性灰。
- 設計稿：`verification/revamp-v3/mockups/shots/{overview,evidence-drawer,meeting}-{1440,390}.png`（另有整頁與抽屜來源段落圖）。

## 5. 已知限制與偏離

- 強調 KPI 仍 24px，不是 X10 的 32px：目前數值顯示到小數兩位（例如 1,269,792.73），1280 寬五欄放不下 32px；32px 留給 V3-4 的 KPI 帶配合三層數字尺度實作。h1 依最近值為 28px，§9.2 的 h1＝20px 留給 V3-3 的 56px 頁首。
- 9 個補充 token 不在 PRD 清單（`--rule-notice`、`--focus-ring`、`--help-w`、`--cell-px`、`--toolbar-h`、`--banner-h`、`--menu-item-h(-2)`、`--lozenge-h`、`--badge-h`）；C8 新狀態點 8px，沿用中的 `.status-dot` 保留 6px 以免頂欄位移；`.ai-popover` 4px 左線、按鈕高度 37px 等版面數值保留到後續批次。
- 圓角依語意而非最近值：標籤、chip、快捷鈕、mode-badge（原 999／14／20px）改 4px；`--radius-full` 只給圓點與圓形圖示。
- `.transition`（轉負／轉正）改 `--warning` 而非 `--unfavorable`（兩個方向共用同一 class）；檔期區帶 `ReferenceArea` 改 `--chart-band` 後 opacity 0.28 → 1（demo 無檔期，畫面未見）。
- 列印區 8／8.5／9.5／11／16pt 保留（A4 版面），PRD §9.6 的 `--print-*` token 於 V3-7 宣告。
- C3 的手機清單模式（`data-list-role`）屬 V3-5；`.ui-*` class 尚無 JSX 使用，V3-3 起逐頁接上。
- 設計稿沒有畫選單、popover、期間底部面板、「更多」面板的開啟狀態與會議草稿狀態；768／1280 只有 CSS 規則沒有截圖；H2 通過條件為提議值。
- 本批 E2E 在品牌折行修正前後各跑一次（§3 記錄最後一次）。

## 6. 下一批、人工關卡、需要拍板

- **H2（擋 V3-3）**：請 2–3 位台灣電商經理人＋1 位設計者依 `verification/revamp-v3/mockups/README.md` 審查三頁設計稿並回填評分表；通過條件（專業感中位數 ≥ 4、AI 感中位數 ≤ 2）請確認或改訂。
- **H3（擋 V3-2）**：`copy-rewrite.csv` 審稿與紙本用語測試仍待人工（V3-0 已備妥）。**下一批 V3-2 需 H3 完成才能開工**；若要先行，請明確指示「先依 copy-rewrite.csv 現稿落地、審稿後再修」。
- 需要拍板：無新增；上述 H2 通過條件與 V3-2 是否先行。
