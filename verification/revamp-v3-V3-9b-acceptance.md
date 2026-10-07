# Revamp v3 V3-9b 驗收：P1 新增功能：圖表與呈現（2026-10-08）

依 `docs/revamp-v3/06_BATCHES.md` V3-9b（V3-9 拆批後的後半：F8 趨勢圖三線比較、F10 圖表點擊下鑽、F14 匯出範本變體（含 D-V3-8 管理損益表括號負數）、F22 投影模式；F15 台灣化示範資料與 F16 來源預設實檔驗證需使用者提供檔案，本批延後）與 PRD §10.1 F8／F10／F14／F22、§7.1 區塊 7–8、§7.8 抽屜、§7.9 匯出、§6.5、§9.5 圖表、§9.6 列印與匯出 token、§9.7 投影模式；拍板 D-V3-8＝A、D-V3-23＝A；D-V3-31、D-V3-32 仍待使用者回覆（本批依規則維持 V3-9a 現況）。H2／H3 依使用者 2026-10-07 指示略過；H1、H4 未執行。

工作方式：開工錨點 `d87bdbe`（匯出變體型別穿過匯出選單／列印／Excel／PPT 的輸入、投影模式 hook 與 PageHeader 的 present-toggle、labels／CSS／掛載測試錨點）→ 三個 worktree 代理並行（A `1d43b6e`、B `ddd2237`、C `4789358`）→ 合併（無衝突）→ 接線 `f26644e`（頂欄 Excel／PPT 補帶變體、分段控制的焦點外框）→ 三個 E2E 代理對共用伺服器遷移 spec 並新增四支功能 spec → 全套 E2E → 四尺寸截圖與 Lighthouse → 本文件。

## 1. 完成項目（對照 06_BATCHES V3-9b）

| 項目 | 狀態 | 說明 |
|---|---|---|
| F8 去年同期彙總（application） | 完成 | `createSnapshot` 用 `periodPresets` 的 yoy preset 判斷可用性，可用時以既有 `aggregatePeriod` 切出去年同期的週（`snapshot.yoy = { status, period, weeks, metrics, sources }`），不可用時帶 preset 的原因；`filter_hash`／`dataset_hash` 不變、不進備份；`WorkspaceSnapshot.weeks` 型別收窄為 previous／current，`WeeklyRow.period` 加 `"yoy"` 只在 `snapshot.yoy.weeks` |
| F8 趨勢圖第三線 | 完成 | 兩個指標各一條去年同期線（`--chart-yoy`、虛線 4 3、1.5px、不畫圓點），去年第 i 週對齊本期第 i 週，對不到的週不畫，缺資料斷線並標「去年同期無資料」；圖例第三項（12×2 inline SVG 虛線段 `trend-legend-yoy`，不可用時標「無資料」）＋圖下一行原因 `trend-yoy-note`；資料表多兩欄（去年同期淨營收、去年同期扣廣告後貢獻；number-link 開抽屜）；提示列多一條「去年同期淨營收合計」（可用時）。demo 與 golden 涵蓋範圍只有一年，一律不可用（原因「資料從 2026-06-01 開始，不足去年同期所需天數」）；兩年合成資料（`tests/helpers/yoy-dataset.ts`）可用 |
| F10 圖表點擊下鑽 | 完成 | 趨勢圖每個點都可點（`circle.chart-point-hit[data-series][data-start]`；鍵盤經資料表）；`src/application/evidence-filter.ts`（`applyEvidenceFilter` 依週日期範圍與通路過濾原始列、manifest 列保留；`evidenceFilterText` 片語）；`EvidenceSelection.filter`；週的點、資料表的 number-link、通路長條與通路表共用同一個 evidence builder 帶 filter；抽屜來源段上方一列 `evidence-filter`「篩選：{週}（{範圍}） · {通路}」＋「清除篩選」／「套用篩選」同一顆切換鈕（焦點不失）；抽屜也認得去年同期（階梯與副標） |
| F14 匯出範本變體 | 完成 | `variantSpec()` 一處定義（`export-variants.ts`），列印／PDF、Excel、PPT 都讀它；standard＝現況（去掉新增內容後與 V3-7 基準逐字相同）；boss（老闆一頁版）＝版頭、本期一句話、4 個 KPI、三件事標題與影響金額、決議一行（PDF 1 頁、Excel 2 個工作表、PPT 1 張）；client（代營運客戶報告版）＝標準版加版頭「客戶：{資料集}」「製表：EC ProfitLens」，去掉決策備註、待辦進度、引用歷史與技術細節；選單「一頁摘要」組的分段選擇器 `download-variant-picker`（三顆 aria-pressed，選擇在元件 state 保留）只影響 PDF／Excel／PPT；會議頁的匯出與 Markdown 不受變體影響 |
| 管理損益表進匯出（D-V3-8） | 完成 | Excel 所有變體最後新增工作表「管理損益表」（13 列、每週＋合計＋佔淨營收 %；金額格式 `#,##0.00;(#,##0.00)`、比率 `0.00%`）；列印／PDF 的 standard 與 client 附錄加每週管理損益表（`print-appendix-pnl`，每表最多 5 個資料欄、負數半形括號 `(1,234.00)`、字級 `--print-note`）；boss 不加；`docs/RELEASES.md` 新增 v3.0.0（開發中）段記新工作表與變體 |
| 廣告決策標籤進 Excel 待辦工作表（PRD F13「寫入匯出」） | 完成 | 待辦工作表最後多「廣告決策」欄（值為 暫停／調整／加碼 或空）；列數與既有欄位不變；client 變體拿掉「狀態更新日」「引用較早資料」兩欄 |
| F22 投影模式（§9.7） | 完成 | 總覽與會議頁頁首「投影模式」按鈕（`present-toggle`，aria-pressed；≤ 767px 用 CSS 隱藏但掛載）；進入後 `html[data-mode="present"]`：token 重新對應 `--text-14` 16px、`--text-16` 20px、`--num-28` 40px、`--num-32` 48px（行高 token 跟著、`--content-max` 1280px；不新增字級種類，design-lint 字級仍 11）；隱藏側欄、期間列、手機分頁列、頁首描述、去年同期提示、改名提示；只留 L1（總覽：本期一句話、KPI 帶、三件事標題與影響金額、瀑布圖；會議：標題與決議、議程 1 關鍵數字＋一句話、議程 2 標題）；頁首一行期間文字 `present-period`；Esc 離開（浮層開著時先交給浮層）、焦點回按鈕；切頁或資料清空自動退出；列印不套用 |
| labels 新分組 | 完成 | `overview.trendYoyV3` 12 鍵、`exports.variantsV3` 16 鍵、`shell.presentV3` 3 鍵；既有鍵字串不變；copy-style 同義詞 13／禁用詞 3 不變 |
| 單元測試與 E2E | 完成（121 檔／2,388 測試全過（19 秒）；E2E 全套 全套 779 passed、4 failed、5 skipped（23.6m）；4 個失敗都是 `export-variants.spec` e「會議頁匯出」在收尾改成會議範圍不加附錄之前寫的斷言（期待 print-appendix-pnl 1 個），改成 0 個後 `export-variants` 與 `revamp-r6` 兩支 spec 在四個 project 重跑 72／72；合計 783 條通過、0 失敗（V3-9a：728；本批新增 55 條：trend-yoy 3、export-variants 6、present-mode 6、各 ×4 專案，扣除 present-mode 手機略過的 5 條）；5 條 skipped 是 present-mode 手機（390）的 (b)–(f)，以 `test.skip` 標明理由（頁首在 < 768 沒有投影入口）） | 新增 `tests/trend-yoy.test.tsx`、`tests/evidence-filter.test.ts`、`tests/helpers/yoy-dataset.ts`、`tests/export-variants.test.ts`、`tests/present-mode.test.tsx`（19）；`mounted-testids` 新增 `overview-yoy` 狀態、A／B／C 的 M1／M6 測試、shellPage 的 present-toggle 與防漂移斷言；E2E：新增 `tests/e2e/trend-yoy.spec.ts`（示範資料不可用：圖例三項、原因句、4 條線、資料表 7 欄；兩年合成資料：6 條線、2 條虛線、第三條提示列、資料表去年欄、點去年同期的點開抽屜；下鑽：週點與通路長條的篩選片語、清除／套用切換、來源列只剩該週或該通路；四尺寸）、`export-variants.spec.ts`（選單選擇器與 Tab 順序、老闆一頁版 PDF 1 頁／Excel 2 表／PPT 1 張、客戶報告版客戶行與去掉內部備註、標準版工作表清單與管理損益表、refund_only 括號負數、Markdown 不受影響、會議頁匯出維持標準版）、`present-mode.spec.ts`（總覽與會議頁各一顆按鈕、進入後只剩 L1 與字級 48／40／16px、Esc 與抽屜先關、切頁自動退出、會議頁投影、列印不套用；手機只斷言掛載）；helper `trend-helpers-v39.ts`、`variant-helpers-v39.ts`、`present-helpers-v39.ts`；更新 `revamp-r4.spec`（兩年合成資料去年同期可用時的斷言）、`revamp-r1-layout.spec`、`period-comparison.spec`、`import.spec`、`workspace.spec`（週表 7 欄與下鑽抽屜）、`revamp-r2-copy.spec`、`product-comparison.spec`（KPI／商品抽屜沒有篩選列）、`revamp-r6.spec`（分組按鈕計數、工作表清單、附錄順序與分頁；會議 PDF 仍 2 頁） |
| F15 台灣化示範資料、F16 來源預設實檔驗證 | **未做（延後）** | 需要使用者提供商品與檔期設定（F15）與去識別化的平台匯出檔（F16）；本批沒有收到，依 06_BATCHES 延到 v3.1 或檔案到位時 |

## 2. 變更檔案

- 新增：`src/application/evidence-filter.ts`、`src/application/export-variants.ts`（錨點建立、B 實作）、`src/components/shell/present-mode.ts`、`tests/trend-yoy.test.tsx`、`tests/evidence-filter.test.ts`、`tests/helpers/yoy-dataset.ts`、`tests/export-variants.test.ts`、`tests/present-mode.test.tsx`、`tests/e2e/trend-yoy.spec.ts`、`tests/e2e/export-variants.spec.ts`、`tests/e2e/present-mode.spec.ts`、`tests/e2e/trend-helpers-v39.ts`、`tests/e2e/variant-helpers-v39.ts`、`tests/e2e/present-helpers-v39.ts`。
- 修改：`src/application/workspace.ts`、`chart-takeaways.ts`、`excel-export.ts`、`pptx-export.ts`、`export-header.ts`、`pnl-table.ts`（只加匯出用輔助函式）、`src/components/overview/charts/{trend-section,chart-frame,channel-section}.tsx`、`evidence-drawer.tsx`、`print-summary.tsx`、`summary-shared.tsx`、`manager-summary.module.css`、`shell/export-menu.tsx`、`shell/page-chrome.tsx`、`dashboard.tsx`、`src/i18n/labels.zh-TW.ts`、`src/app/globals.css`（三個 V3-9b 錨點區段＋收尾一條）、`docs/RELEASES.md`、`tests/{mounted-testids,overview-charts-frame,excel-export,export-header}`、`tests/helpers/{export-normalize,export-numeric}.ts`、`tests/fixtures/export-numeric-baseline.json`（只新增 `excel_variants`）、E2E：`tests/e2e/revamp-r4.spec.ts`、`revamp-r1-layout.spec.ts`、`period-comparison.spec.ts`、`import.spec.ts`、`workspace.spec.ts`、`revamp-r2-copy.spec.ts`、`product-comparison.spec.ts`、`revamp-r6.spec.ts`、`docs/revamp-v3/06_BATCHES.md`、`docs/revamp-v3/09_DECISIONS_PENDING.md`、`docs/STATUS.md`、`docs/DECISIONS.md`、`verification/revamp-v3/feature-retention.csv`。
- 零改動：`src/domain`、`fixtures`、`docs/METRICS.md`、`.env*`、`vercel.json`（白名單 `fixtures/demo_tw/**` 本批沒有用到）。

## 3. 驗收命令與真實結果

| 命令 | 結果 |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | 0 warnings |
| `npm run audit:ui` | hex 0（token 定義區 23）、圓角 4、字級 11、字距 0、rotate 0、JSX 箭頭 3、eyebrow 0、裝飾字元 0、CSS content 0；靜態 testid 253（V3-9a：243）；labels 同義詞 13／禁用詞 3（與 V3-9a 相同） |
| `npm run contrast-check` | 75／75 通過（含 `--chart-yoy` 3.58 ≥ 3.0） |
| `npm test -- --run` | **121 檔／2,388 測試全過（19 秒）** |
| `npm run lint:design` | exit 0；棘輪數值與 V3-9a 相同，ceiling 未調 |
| `npm run build` | pass |
| `npm run test:e2e` | **全套 779 passed、4 failed、5 skipped（23.6m）；4 個失敗都是 `export-variants.spec` e「會議頁匯出」在收尾改成會議範圍不加附錄之前寫的斷言（期待 print-appendix-pnl 1 個），改成 0 個後 `export-variants` 與 `revamp-r6` 兩支 spec 在四個 project 重跑 72／72；合計 783 條通過、0 失敗（V3-9a：728；本批新增 55 條：trend-yoy 3、export-variants 6、present-mode 6、各 ×4 專案，扣除 present-mode 手機略過的 5 條）；5 條 skipped 是 present-mode 手機（390）的 (b)–(f)，以 `test.skip` 標明理由（頁首在 < 768 沒有投影入口）**；四專案；跑完後 `verification/review-v2-a-*`、`verification/revamp-R6/` 被重寫，以 `git checkout --` 還原 |
| 畫面基準 | `verification/revamp-v3/V3-9b/snapshots/{desktop,laptop,tablet,mobile}/01–09.png` 共 36 張（baseline.spec `--update-snapshots` 4 passed），重跑核對 4 passed、0 張差異（總覽截圖多了頁首「投影模式」按鈕與趨勢圖的去年同期圖例項／原因句） |
| 首屏量測（metrics.spec） | metrics.spec 6 passed（`_meta.batch=V3-9b`）：首屏位置與 V3-9a 完全相同（1440 本期一句話頂 192px、KPI 帶底 419px、扣廣告後貢獻值頂 323px、三件事首列底 561px；390 一句話頂 116px、KPI 帶底 555px）；KPI 前可聚焦 1440＝10（V3-9a 9；多了「投影模式」按鈕，等於 PRD 上限）、390＝3；1280 頂欄 48px 一列；各頁到精靈步驟 1 最多 2 次點擊；含稅匯入經資料狀態路徑 6 次（同前）；First Load JS gzip 514.7 KiB（V3-9a 509.5；+5.2 KiB） |
| Lighthouse（示範資料已載入，1440 與 390） | 1440 與 390 各 6 個快照步驟 accessibility 全部 100（與 V3-9a 相同）；首頁 performance 1440＝100、390＝94（與 V3-9a 相同）；timespan CLS 全部與 V3-9a 相同（載入示範資料 1440＝0、390＝0.001；390 切到商品毛利 0.054 既有）；TBT：載入示範資料 1440 133 ms（135）、390 972 ms（1146）；切到會議紀錄 390 996 ms（966）。失敗審核只剩會議紀錄頁的 `label-content-name-mismatch` 10 個節點（與 V3-7 起相同；V3-10 連 E2E 一起改名）。流程報告 `verification/revamp-v3/V3-9b/lighthouse/flow-desktop-1440.html`、`flow-mobile-390.html` |
| 禁區 diff（對 82b70df） | 空 |
| testid 基準 | 刪除數 0；新增 trend-legend-yoy、trend-yoy-note、evidence-filter、evidence-filter-clear、evidence-filter-apply、download-variant-picker、download-variant-{standard,boss,client}、print-header-client、print-one-liner、print-kpis、print-top-three、print-appendix-pnl、print-pnl-table、present-toggle、present-period |
| 隱藏字元掃描 | 變更檔 0（既有 BOM 正規式除外；新 helper 用 `﻿` 逸出） |

### 3a. 本批驗收重點

| 指標 | 目標 | 實測 |
|---|---|---|
| 三線圖缺資料不畫成 0、去年同期不可用有原因 | — | 不可用：圖例保留＋「無資料」、`trend-yoy-note` 寫原因（demo／golden）；可用（兩年合成資料）：去年第 1 週淨營收手算 DTC Σ(112..118)−70＝735、MARKETPLACE Σ(62..68)−35＝420、合計 1,155.00 ＝ `snapshot.yoy.weeks[0]` ＝ 抽屜；每週＝`aggregatePeriod` 該週、整段＝`aggregatePeriod` 整段；缺週斷線並標「去年同期無資料」 |
| 下鑽後抽屜範圍與點擊一致 | — | 週點 → 抽屜 period＝該週、片語「篩選：本期第 n 週（範圍）」；通路長條 → 片語含通路名、來源列只剩該通路（golden 兩個通路證明會少列）；E2E 斷言 |
| 匯出變體數值與標準版逐格相同 | §6.5 正規化比對 | 標準版 Excel 去掉管理損益表工作表與廣告決策欄後 SHA-256 `252c0234…17fd`（10,933 字元）＝`export-format-baseline-v3-6.json`；標準版列印去掉 `print-appendix-pnl` 後與 `d87bdbe` 逐字相同（golden／demo／refund_only × 有無會議，6 組）；boss 與 client 的每個數字格都在 standard 裡有相同值（例外：boss 的商品毛利 1200／1145／−55 與扣廣告前貢獻 870／705／−165 等於分析 CSV 的 period_summary） |
| PDF 頁數 | boss 1 頁；standard 不增加 | golden：standard 2、boss 1、client 2；demo：standard 2、boss 1、client 2（附錄落在既有附錄頁） |
| Excel 工作表 | — | standard 7（摘要 21 列、通路 3、貢獻變化拆解 11、商品比較 4、待辦 2×12 欄、指標定義 18、管理損益表 13×4）；boss 2（摘要 13、管理損益表 13）；client 7（待辦 10 欄、指標定義 10）；demo 管理損益表 13×9（6 週）每列加總＝合計到分；golden 淨營收 2470.00、扣廣告後貢獻 255.00、佔淨營收 10.32%；refund_only 淨營收 `(100.00)` |
| 投影模式不新增字級種類、Esc 離開 | design-lint 字級 11 | 字級 11 不變；KPI 48／40px、body 16px、h2 20px；main 1280px 置中（1440 時 left 80）、橫向溢出 0（1440／1280／768）；Esc 離開且焦點回按鈕；抽屜開著時第一次 Esc 只關抽屜；axe 總覽與會議頁投影中 0 項違規；列印不套用 |
| KPI 前可聚焦控制（1440） | ≤ 10（PRD） | 10（count 與 tabStops 都是 10；第一個是 button「投影模式」，mobile 仍 3）（V3-9a 9；多了「投影模式」按鈕，剛好等於上限） |
| Lighthouse a11y、CLS 不退步 | — | 見 §3 |

## 4. 瀏覽器驗收方式與截圖

- 四尺寸截圖：`verification/revamp-v3/V3-9b/snapshots/{desktop(1440×1000),laptop(1280×900),tablet(768×1024),mobile(390×844)}/01-overview-top、02-overview-full、03-evidence-drawer、04-actions-board、05-diagnosis、06-products、07-scenarios、08-meeting、09-data.png`（示範資料 production）。
- 首屏量測：`verification/revamp-v3/V3-9b/metrics.json`；Lighthouse 流程報告：`verification/revamp-v3/V3-9b/lighthouse/`。
- 投影模式、匯出變體（PDF 頁數、Excel 工作表、PPT 張數）、去年同期第三線（兩年合成資料）與下鑽抽屜的畫面與行為，由 E2E 逐項斷言（`present-mode.spec` 四尺寸、`export-variants.spec` 四尺寸、`trend-yoy.spec` 四尺寸）；代理自查截圖（投影模式 1440／1280／768 總覽與會議頁、三種變體的 PDF 與 PPT 的 Quick Look、選單四尺寸）留在 scratchpad，未提交。
- 瀏覽器走查：代理 A／B／C 各自以 dev server 在 1440、1280、768、390 檢查橫向溢出 0；代理 A 與 C 各跑 axe（趨勢圖與抽屜；投影中的總覽與會議頁）0 項違規。

## 5. 已知限制與風險

- **F15、F16 未做**：需要使用者提供台灣化示範資料的商品與檔期設定、去識別化的平台匯出檔。
- **示範與 golden 看不到第三線**：涵蓋範圍只有一年，去年同期永遠不可用；公開示範站要看到 F8 需要兩年的示範資料（F15 的 demo_tw 若能涵蓋兩年）。
- **去年同期不可用的原因在總覽出現兩次**：期間列的 `preset-reason-visible-yoy`（V3-4，testid 基準）與趨勢圖的 `trend-yoy-note`（PRD F8 要求在圖上保留位置並寫原因）；兩個 testid 都保留，V3-10 可合併成一處（D-V3-35）。
- **F10 的篩選目前主要是標示**：週與通路的抽屜本來就只收到該週或該通路的來源，篩選很少真的少列，「清除篩選」看起來像沒作用（通路篩選在多通路時會少列）。
- **投影模式按鈕同時用 aria-pressed 又改文字**（投影模式 ↔ 離開投影）：APG 建議二擇一（D-V3-33）；投影中側欄隱藏，總覽與會議頁互切要先離開投影（D-V3-34）；會議頁議程 1 的數字維持 24px（§9.7 只重新對應四個 token），與總覽的 48px 份量不一致。
- **1440 的 KPI 前可聚焦控制 10 個**，剛好等於 PRD 上限；之後再加頁首控制就會超標。
- **閏年二月的整月比較**：本期與去年同期週數可能差一週，對不到的週不畫，但「去年同期淨營收合計」提示列涵蓋整個去年期間。
- **管理損益表附錄讓會議頁的 PDF 也多了附錄**（會議頁用標準版）：E2E 代理實測會議頁 PDF 變 3 頁（第 3 頁只剩技術細節的兩行），違反 PRD §7.6；收尾改成會議範圍的列印（meeting 不為 null）不加附錄、維持 V3-7 版面，會議 PDF 回到 2 頁（`revamp-r6` d 的 ≤ 2 頁斷言通過）；一頁摘要（目前檢視）的標準版與客戶版才有附錄。
- **列印版佔淨營收 % 用 formatRateL3（U+2212）而不是括號**：只有金額用括號（D-V3-8 的例子只寫金額）。
- **`.ui-segmented` 的 overflow 曾裁掉 :focus-visible 外框**（V3-9a 的 pnl-granularity 也受影響）：收尾改全站分段控制內的按鈕用內縮外框。
- 新文案 31 鍵未經 H3 審稿；H1、H4 未執行；未推送、未部署。
- **E2E 代理發現並已修正的兩個問題**：(1) 會議頁 PDF 因標準版多了管理損益表附錄變 3 頁（收尾改會議範圍不加附錄）；(2) 去年同期點的熱區畫在本期熱區下層，兩值相近時點不到（收尾把去年同期線排在最後，熱區在上層；E2E 用不重疊的兩年資料）。
- 投影模式 E2E 在手機（390）只斷言按鈕掛載但隱藏，其餘案例以 `test.skip` 標明理由（頁首在 < 768 沒有投影入口）。

## 6. 下一批建議、人工關卡與待拍板

- 下一批：V3-10 上線檢查（H4 複測、Lighthouse 正式站、四尺寸與鍵盤走查、v1–v5 備份還原、網路紀錄、13 項 HTTP 檢查、移除 labels 舊 key alias、版本 3.0.0、RELEASES／README／STATUS 收尾）。F15／F16 在檔案到位時另開小批。
- 被擋住的人工關卡：H4 擋 v3.0.0 正式上線；H1 只擋 V3-10 的前後對照。H2、H3 已略過。
- 待拍板（`09_DECISIONS_PENDING.md`）：D-V3-26、27、29、30、31、32 仍待；新增 D-V3-33（投影按鈕 aria-pressed 或改字二擇一）、D-V3-34（投影中是否保留總覽與會議頁互切入口）、D-V3-35（去年同期不可用原因是否只顯示一處）。
