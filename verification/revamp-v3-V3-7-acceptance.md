# Revamp v3 V3-7 驗收：會議紀錄與匯出（2026-10-07）

依 `docs/revamp-v3/06_BATCHES.md` V3-7 與 PRD §7.6（會議紀錄）、§7.9（匯出、儲存與匯出版頭）、§9.6（列印與匯出的視覺 token）、§6.3 #43–#50、§6.5（匯出對照）、§6.4 M1–M6、§9.4（C9、C10、C14、C21、C22）執行。拍板：D-V3-8＝A（本批沒有管理損益表，負數仍用「−」；括號格式留給 V3-9 的 F9）、D-V3-22＝A（舊紀錄加註、介面用新名詞渲染）、D-V3-6＝A（台）、D-V3-7＝A。H2、H3 依使用者 2026-10-07 指示略過。`src/domain`、`fixtures`、`docs/METRICS.md` 零改動。

工作方式：開工錨點 `71e9f5f`（列印版 `print-summary.tsx` 與共用小件 `summary-shared.tsx` 自 manager-summary.tsx 搬出、dashboard 的 `onCopySummary`／`summaryContext` 接點、labels／CSS／掛載測試錨點）→ 三個 worktree 代理並行（A 會議紀錄頁、B 匯出版頭與列印 token、C 頂欄匯出選單）→ 合併（無衝突）→ 合併後接線 `9e66719`（匯出版頭第 1 行用畫面上的資料集名稱、會議紀錄 Markdown 的 v2 加註）→ 三個 E2E 代理對共用伺服器遷移 → 全套 E2E → 四尺寸截圖、Lighthouse、Excel／PPT 開檔截圖。

## 1. 完成項目（對照 06_BATCHES V3-7）

| 項目 | 狀態 | 說明 |
|---|---|---|
| 會議頁文件式版面（≥ 1280 左側議程目錄 200px sticky、主內容 880px；< 1280 目錄成一列） | 完成 | `meeting-page.tsx`：`nav[aria-label=議程目錄] > ol` 六個錨點連結（IntersectionObserver 標 aria-current、2px 強調線）；主內容最大寬 880px；768–1279 目錄改成可水平捲動的一列 |
| 頁首動作列（sticky 48px） | 完成（sticky 只在 ≥ 1280，見 §5） | `.meeting-head`（保留 `review-workbench` testid）：h2 `meeting-title`「本次會議（草稿）」、名稱與日期行內編輯（aria-label 不變）、決議 select＋「結束會議」（`meeting-decision` 容器、`meeting-finalize`、確認區 `meeting-finalize-confirm` role=dialog／Esc／`meeting-finalize-error`／`meeting-finalize-confirm-button` 不變）、「複製週會摘要」（`meeting-copy-summary`，用會議固定的 snapshot 組週會摘要，role=status `meeting-copy-summary-status`，剪貼簿不可用時用備案 dialog）、「匯出會議」下拉（`details[data-testid=meeting-outputs]`、summary `export-page-meeting`、五項 `meeting-export-pdf／markdown／csv／excel／pptx` 各帶 12px 說明，handler 與通知同 v2，點完關閉回焦）；「結束列印」只在列印模式出現、放在下拉旁 |
| 結束標示與 D-V3-22 | 完成 | 會議歷史每筆頂部 `meeting-snapshot-note`「這份紀錄在 {date} 結束，之後的資料變動不會影響內容。」；沒有 `copy_version` 的 v2 紀錄再加 `meeting-v2-note`「本紀錄建立於 v2，部分名稱已更新。」；`finalizeMeeting` 寫入 `copy_version: "v3"`（meeting-v1 schema 選填，舊備份照常還原；`backup-schema-v4.json` 加 key path）；會議紀錄 Markdown 對 v2 紀錄在版頭後加同一句 |
| 固定範圍一行與範圍不同的橫幅 | 完成 | `.meeting-scope-line`（通路、兩期、資料到）；範圍不同時 `review-view-difference` 改 C22 橫幅：「目前畫面範圍和會議不同。」＋「檢視差異」（popover 列差異）＋「用目前資料更新會議」；待辦引用漂移提示改 `ui-notice` |
| 議程 `<ol>` 1–6 | 完成 | `ol.meeting-agenda-list`（data-testid `manager-summary`，CSS counter 1–6）：1 關鍵數字（兩個 24px L1 number-link＋差額一行＋本期一句話 `meeting-sentence`）；2 本期重點（C9 清單型 3 列、`manager-priority-{code}`、「調整門檻」details 內的 `threshold-form-meeting`，門檻仍存 `review.importance_threshold`、與總覽不共用）；3 各通路表現（精簡表＋「完整通路寬表」details 內的 ChannelWideTable）；4 上次決議追蹤（`meeting-followup`）；5 選入方案（`meeting-scenario-select-{channel}` 同 v2、`meeting-scenario-result[data-status]`、假設收合）；6 置頂待辦（`meeting-pinned-actions／-empty`＋其他待辦 details） |
| 決議備註、比較收合、歷史最底、沒有會議稿的空狀態 | 完成 | 備註 textarea（`#meeting-notes-input`，label 不變）在議程之後＋限制一句；`meeting-compare` 改收合 details（內容與 testid 不變）；`meeting-history` 在最底；review 為 null 時 C10 頁面型空狀態＋`meeting-create` |
| 匯出版頭四行（§7.9） | 完成 | `src/application/export-header.ts`：{資料集名稱}／「扣廣告後貢獻兩期比較（管理報表）」／「本期 … 至 …（n 天）；上期 …（n 天） · 單位：新台幣元，未稅（含稅換算時「已換算為未稅」）」／「指標版本 contribution-v1 · 產出時間 YYYY-MM-DD HH:mm（台北時間）」。套用在一頁摘要 Markdown、決策 Markdown（含工作稿附錄各區段）、會議紀錄 Markdown（產出時間＝結束時間，同一筆每次下載相同）、Excel 摘要工作表前四列、PPT 標題區、A4 列印 header（`print-report-header` 與 `print-header-dataset／period／version／meeting／scope`）。資料集名稱：dashboard 與會議頁匯出時用畫面上的名稱（示範資料／golden／使用者檔名），資料不同時退回 dataset_id |
| export-theme（§9.6） | 完成 | `src/application/export-theme.ts`：PPT／Excel 色碼單一來源，與 `:root` token 一一對應（`tests/export-theme.test.ts` 解析 globals.css 比對，並檢查匯出程式與列印 CSS 沒有 hex）；PPT 移除品牌色標題塊與卡片底色，改 4pt 頂線、標題 28pt、KPI 數字 36pt、不利色只用在不利差額、字型 Arial／微軟正黑體 |
| 列印 token（§9.6） | 完成 | `:root` 新增 `--print-title` 14pt、`--print-body` 10pt、`--print-note` 8pt；`manager-summary.module.css` 的 `@media print` 只用這三個 token，白底（不印底色）、表格線 0.5pt `--border-strong`、數字 tabular、A4；design-lint 字級原值 13 → 11（上限同步下降） |
| Excel 表頭樣式與凍結列 | 完成 | SheetJS 社群版寫不出樣式：`writeExcel` 寫檔後以同套件的 CFB 打開 zip 改 `xl/styles.xml` 與各工作表第 1 列／sheetView（粗體、`#f1f3f3` 底、凍結表頭）；找不到預期片段時保留原檔不中斷 |
| 頂欄「匯出」選單（§7.9、§6.5） | 完成 | `shell/export-menu.tsx`：寬 400px（≥ 768）；五組 `download-group-{current,summary,decision,meeting,templates}`（role=group）：目前檢視 4 項（資料問題 CSV 條件項）／一頁摘要（目前檢視）4 項（`download-meeting-section`）／決策工作稿 3 項／會議「複製週會摘要」（`download-copy-summary`，role=status、剪貼簿備案 textarea）／匯入範本 3×3（`download-templates`）；每項 14px 名稱（`span.export-item-name`，aria-labelledby，可及名稱與 v2 相同）＋12px 說明（aria-describedby）；處理中 `data-busy`＋16px spinner＋aria-disabled＋sr-only status；失敗時 `p.export-item-error[role=alert]` 在該項下方並回焦該項；刪除 menuNote／menuViewNote |
| 各頁「匯出本頁」串接 | 完成 | 商品（V3-5）、試算、待辦（V3-6）、會議（本批）四頁都有頁內下拉；資料來源頁的問題表工具列入口（§6.5 D04 備註）留 V3-8（見 §6） |
| V3-0 完整下載入口清單 | 完成 | D01–D41 逐列核對每一列至少一個入口（代理 C 的清單在 `feature-retention.csv` 狀態欄） |
| labels 新分組 | 完成 | `meeting.pageV3` 13 鍵、`exports.headerV3` 10 鍵、`exports.menuV3` 15 鍵；既有鍵字串不變；copy-style 同義詞 13／禁用詞 3 不變 |
| 單元測試與 E2E 遷移 | 完成（unit 108 檔／2,158 全過；E2E 全套 644／644） | 新增 `tests/meeting-page-v3.test.tsx`（17）、`tests/export-header.test.ts`、`tests/export-theme.test.ts`、`tests/export-menu-v3.test.tsx`（16）、`tests/helpers/export-normalize.ts`＋`tests/fixtures/export-format-baseline-v3-6.json`（§6.5 正規化比對：去版頭、U+2212 → ASCII 後 sha256 與 71e9f5f 相同）；改寫 `meeting-page`、`meeting-backup`、`backup-schema-v4`、`pptx-export`、`shell`、`mounted-testids`；E2E 見 §3 與 §3b |
| 驗收重點：PDF 頁數不增加 | 完成 | A4 `page.pdf` 數 `/Type /Page`：golden 選單版 2、會議版 2；demo 選單版 2、會議版 2（改版前後相同） |
| 驗收重點：會議頁不再有第二套 KPI 大卡；議程用 `<ol>` | 完成 | 單元測試斷言沒有 `.headlines／.change` 大卡、`ol.meeting-agenda-list` 六個 li 順序 |
| 驗收重點：PPT、Excel 開檔人工檢查並截圖 | 完成（截圖見 §4；路徑 `verification/revamp-v3/V3-7/office/`） | |

## 2. 變更檔案

- 新增：`src/components/print-summary.tsx`、`src/components/summary-shared.tsx`、`src/application/export-header.ts`、`src/application/export-theme.ts`、`tests/meeting-page-v3.test.tsx`、`tests/export-header.test.ts`、`tests/export-theme.test.ts`、`tests/export-menu-v3.test.tsx`、`tests/helpers/export-normalize.ts`、`tests/fixtures/export-format-baseline-v3-6.json`、E2E helper `tests/e2e/meeting-helpers-v3.ts`、`tests/e2e/review-helpers-v3.ts`（`replacement-helpers.ts` 未動）、`verification/revamp-v3/V3-7/**`、本檔。
- 修改：`src/components/meeting-page.tsx`、`manager-summary.tsx`、`manager-summary.module.css`、`shell/export-menu.tsx`、`dashboard.tsx`（接點與資料集名稱）、`overview/weekly-snapshot.tsx`（備案 dialog 改 export）、`src/application/{meeting,manager-summary,decision-export,workspace-decision-export,excel-export,pptx-export}.ts`、`src/i18n/labels.zh-TW.ts`、`src/app/globals.css`（`:root` 列印 token、`@media print` 白底、V3-7 錨點區段）、`verification/revamp-v3/backup-schema-v4.json`、`tests/fixtures/design-lint-ceiling.json`（字級 13 → 11）、`tests/{meeting-page,meeting-backup,backup-schema-v4,pptx-export,shell,mounted-testids,labels-structure,testid-baseline}.test.*`、E2E specs `revamp-r6`、`manager-summary`、`review-v2-a`、`review-v2-a-export`、`action-workspace`、`workspace-storage`（其餘 15 個 spec 未改、跑過即通過：E3 代理 12 個 spec 202／202）、`docs/STATUS.md`、`docs/DECISIONS.md`、`docs/revamp-v3/06_BATCHES.md`、`docs/revamp-v3/09_DECISIONS_PENDING.md`、`verification/revamp-v3/feature-retention.csv`、`verification/revamp-v3/e2e-text-assertions.csv`。
- 零改動：`src/domain`、`fixtures`、`docs/METRICS.md`、`.env*`、`vercel.json`。

## 3. 驗收命令與真實結果

| 命令 | 結果 |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | 0 warnings |
| `npm test -- --run` | **108 檔／2,158 測試全過**（V3-6：104 檔／2,094；新增 export-header、export-theme、export-menu-v3、meeting-page-v3） |
| `npm run lint:design` | exit 0；hex 0、圓角 4、**字級 11（V3-6：13；列印 pt 原值改 token）**、字距 0、JSX 箭頭 3、eyebrow 0、裝飾 0、CSS content 0；labels 同義詞 13／禁用詞 3 不變；對比 75／75；`design-lint-ceiling.json` fontSizeValues 13 → 11 |
| `npm run build` | pass |
| `npm run test:e2e` | **644 passed（19.5m）**，0 failed、0 skipped；desktop／laptop／tablet／mobile 四專案（webServer 重建 build；V3-6 為 628，本批新增 16 條）。跑完後 `verification/revamp-R6/artifacts` 被重寫（先用它們做 Excel／PPT 開檔截圖，再 `git checkout --` 還原）。E2E 代理的分 spec 結果：E1（revamp-r6、manager-summary）四尺寸 60／60；E2（review-v2-a、review-v2-a-export、manager-presentation、action-workspace、m6、workspace-storage、workspace）90／90＋laptop／tablet 46／46；E3（其餘 12 個 spec）202／202 不需修改 |
| 畫面基準 | `verification/revamp-v3/V3-7/snapshots/{desktop,laptop,tablet,mobile}/01–09.png` 共 36 張（baseline.spec `--update-snapshots` 4 passed），重跑核對 4 passed、0 張差異；首屏量測（metrics.spec 6 passed，`_meta.batch=V3-7`）與 V3-6 相同：1440 本期一句話頂端 192px、KPI 帶底 419px、扣廣告後貢獻值頂 323px、三件事首列底 525px、KPI 前可聚焦 9；390 分別 116／555／295／685、可聚焦 3。 |
| Lighthouse（示範資料已載入，1440 與 390） | 1440 與 390 各 6 個快照步驟 accessibility 全部 100（首頁空狀態、經營總覽、通路健檢、商品毛利、假設試算、會議紀錄）；首頁 performance 1440＝99、390＝97（V3-6：100／97；差異在誤差內）。失敗審核只剩會議紀錄頁的 `label-content-name-mismatch`，節點從 V3-6 的 18 降到 10（議程 1 的 6 個關鍵數字 number-link 與各通路表現精簡表的數字格：aria-label 仍是 v2 的「一頁摘要 · {範圍} {指標}」抽屜標題句，不含可見數字；E2E 以這個名稱定位，改名留 V3-10 一併處理，建議改成 V3-4a KPI 帶的「{指標} {值}，看明細」句型）；不計分。報告：`verification/revamp-v3/V3-7/lighthouse/flow-desktop-1440.html`、`flow-mobile-390.html`；數值在 `metrics.json`。 |
| 禁區 diff（對 82b70df） | 空 |
| testid 基準 | 刪除數 0；新增 meeting-title、meeting-copy-summary、meeting-copy-summary-status、export-page-meeting、meeting-export-{pdf,markdown,csv}、meeting-sentence、meeting-snapshot-note、meeting-v2-note、print-report-header、print-header-{dataset,period,version,meeting,scope}、download-group-{current,summary,decision,meeting,templates}、download-copy-summary、download-copy-summary-status、download-copy-summary-fallback |

### 3a. 本批驗收重點（PRD §7.6、§7.9、§6.5）

| 指標 | 目標 | 實測 |
|---|---|---|
| PDF 頁數（A4） | 不增加 | golden 選單版 2 → 2、會議版 2 → 2；demo 選單版 2 → 2、會議版 2 → 2 |
| §6.3 #43–#50、#16 testid | 全部存在 | 全部存在（含 #43a meeting-create、#44a meeting-scenario-select-{channel}、threshold-form-meeting、meeting-outputs 內的 meeting-export-excel／pptx） |
| §6.5 格式別正規化比對 | 數值逐格相同 | 五種 Markdown 與 Excel 模型去版頭、U+2212 → ASCII 後 sha256 與 71e9f5f 相同；`export-numeric-baseline` 通過 |
| V3-0 下載入口清單 | 逐項至少一個入口 | D01–D41 全部有入口（頂欄 17 項、商品 2、試算 3、待辦 3、會議 5＋結束列印、歷史、匯入精靈步驟 4、目標／檔期 4、主管摘要輸出 4） |
| 會議門檻與總覽門檻 | 互不影響 | 兩份 state（`review.importance_threshold` 與 top-three 的元件 state）；單元與 E2E 斷言 |
| 匯出選單 | 400px、每項名稱＋說明、分組標題 12/500 | 400px（≥ 768）；11 項各 52px；名稱 14px、說明 12px `--text-tertiary`；5 組 |
| `design-lint` hex | ≤ 10 | 0 |

### 3b. E2E 路徑變更（§6.4 M4）

| v2 路徑 | v3 路徑（本批） | 受影響 spec |
|---|---|---|
| 會議頁「匯出」區五顆可見按鈕 | 頁首「匯出會議」下拉：先點 `export-page-meeting`，再點 `meeting-export-{pdf,markdown,csv,excel,pptx}`（可及名稱同 v2；點完選單關閉、焦點回 summary，每次下載前重開）；helper `openMeetingExport`／`meetingExportItem`／`downloadMeetingExport` | revamp-r6、manager-summary、review-v2-a、review-v2-a-export、action-workspace |
| 「結束列印」在輸出區 | 在頁首動作列 `.meeting-head-actions`（只在列印模式） | revamp-r6 |
| `review-workbench` 包住基本資料、範圍與差異提示 | `review-workbench` 只剩頁首動作列；範圍一行 `.meeting-scope-line`、橫幅 `review-view-difference`（「檢視差異」popover `.meeting-banner-popover`、更新按鈕）在它之外 | revamp-r6 |
| 結束會議後焦點在 h2「會議基本」 | 焦點在 `meeting-title`（文字 `meeting.pageV3.title`） | revamp-r6 |
| `manager-summary` 只含議程 1–3 | `manager-summary` 在 `ol.meeting-agenda-list` 上、含 1–6；「其他待辦」等斷言要限縮到 `meeting-agenda-1..3`；關鍵數字是 number-link 不是 `.headlines` 大卡 | review-v2-a、manager-summary |
| 門檻輸入與「套用」可見 | 在收合的 `details.meeting-threshold`：先點 summary；helper `openThreshold` | manager-summary、review-v2-a、review-v2-a-export |
| 通路寬表直接可見 | 精簡表（通路、扣廣告後貢獻、差額）＋收合的 `details.meeting-wide-table`（完整寬表）：先展開再定位列 | manager-summary |
| `meeting-compare` 直接可見 | 收合 details：先點 `:scope > summary` | revamp-r6 |
| 備註 textarea 在 `meeting-decision` 內 | `#meeting-notes-input` 在議程之後：`meeting.getByLabel(labels.meeting.notes, {exact:true})` | revamp-r6 |
| 歷史項目 summary 後直接內容 | 先一行 `meeting-snapshot-note`，v2 紀錄再一行 `meeting-v2-note` | revamp-r6 |
| 列印版 header：`printMeta`、h1 `printTitle`、`printContext`、`printPeriodLine` | `print-report-header`：`print-header-dataset`、h1＝`fill(headerV3.reportTitle,{metric})`、`print-header-period`（兩個 span）、`print-header-version`、`print-header-meeting`（有會議時＝`printMeta`）、`print-header-scope`（`printScope`／`printScopeMeeting`） | revamp-r6、review-v2-a-export |
| Markdown 第一段 `mdMeta` | 「# 標題」、空行、版頭四行（前三行行尾兩個空白）、空行，之後才是 v2 的段落；資料集名稱＝`labels.ui.dashboard.datasets.golden`（dashboard 與會議頁匯出） | revamp-r6、review-v2-a-export、scenarios（toContain 不受影響） |
| Excel 摘要表第一列是資料範圍 | 前四列 section＝`headerV3.excelSection`，「內容」欄是版頭四行；其後列不變 | revamp-r6 |
| PPT 標題 `pptxExport.title`／`subtitle` | 標題＝`reportTitle`（有會議時會議名稱）、副標三行是版頭其餘三行、頁尾 `pptxDataVersion` | revamp-r6 |
| 頂欄選單 `download-meeting-section` 之後逐個 `nextElementSibling` 取按鈕文字 | 分組 `download-group-summary` 內 `.export-item-name`；說明用 `toHaveAccessibleDescription(menuV3.descriptions.*)`；`menuViewNote`／`menuNote` 不存在 | revamp-r6 |
| 選單 PDF 說明＝`pdfHint` | `fill(menuV3.descriptions.exportPdf,{hint: pdfHint})`（`small#download-pdf-hint`） | revamp-r6 |

新增的 E2E 測試：`revamp-r6.spec` c2（頂欄匯出選單五組與說明、失敗路徑：`URL.createObjectURL` 丟錯 → `p.export-item-error[role=alert]` 在 Excel 項下方、焦點回該項、`aria-describedby` 含 error id，恢復後重試成功）、h（複製週會摘要：無權限時備案 dialog、授權後 status 與剪貼簿內容、頂欄入口同一份文字；議程目錄六個連結與 aria-current；比較預設收合）、i（還原含 v2 紀錄的備份：刪 `meeting_history[0].copy_version` 重算 checksum → 歷史兩行加註、KPI 不變、Markdown 版頭後有 v2Note、頂欄下載位元組相同）；d 加 A4 PDF 頁數 ≤ 2（選單版與會議版）；`workspace-storage.spec` 加「結束會議後備份 `meeting_history[].copy_version="v3"`、還原後仍有匯出會議下拉」。

## 4. 瀏覽器驗收

- 方式：示範資料（`APP_MODE=PUBLIC_DEMO`）的 production 伺服器，Playwright `baseline.spec.ts` 依 `CAPTURE_BATCH=V3-7` 逐頁截圖（01 空狀態、02 總覽、03 抽屜、04 待辦看板、05 健檢、06 商品、07 試算、08 會議、09 資料），四尺寸 1440×1000、1280×900、768×1024、390×844；寫入後重跑核對 0 差異。
- 截圖路徑：`verification/revamp-v3/V3-7/snapshots/desktop/08-meeting.png`；`laptop/`、`tablet/`、`mobile/` 同名各一張（共 36 張）。
- Excel／PPT 開檔截圖（匯出檔人工檢查）：`verification/revamp-v3/V3-7/office/demo-current-view-xlsx.png`、`demo-current-view-pptx.png`（示範資料、目前檢視、一筆置頂待辦）與 `golden-meeting-xlsx.png`、`golden-meeting-pptx.png`（golden、會議版：十月例會、採用、備註）——以 writeExcel／writePptx（與 app 下載同一條路徑）產出後用 Microsoft Excel／PowerPoint 開啟整頁截圖（產出時間固定 2026-10-07 16:30）；E2E 全套產出的 golden 目前檢視版也開檔核對過，內容相同、未另存截圖。人工檢視：PPT 一張 16:9，白底、4pt 深綠頂線、標題 28pt「扣廣告後貢獻兩期比較（管理報表）」、副標三行＝資料集名稱／期間與單位／指標版本與產出時間、關鍵數字 36pt（不利差額紅色）、各通路表現表（表頭淺灰底）、本期三件事、決議、置頂待辦、頁尾資料版本；Excel 摘要工作表前四列「版頭」、表頭粗體淺灰底、凍結表頭列、會議版多四列會議紀錄、六張工作表（摘要、通路、貢獻變化拆解、商品比較、待辦、指標定義）。
- 人工檢視（1440 與 390 的 08）：頁首動作列「本次會議（草稿）」＋名稱／日期行內編輯＋決議 select＋「結束會議」（主要）＋「複製週會摘要」＋「匯出會議」下拉；固定範圍一行與「用目前資料更新會議」；左側議程目錄六項（390 改成一列）；議程 1 關鍵數字兩個 24px 數字（扣廣告後貢獻「少賺 59.9 萬（−32.0%）」不利色）＋本期一句話；2 本期重點三列 C9（調整門檻收合）；3 各通路表現精簡表＋「完整通路寬表」收合；4–6 依序；備註；與上次會議比較收合；會議歷史在最底。390：頁首換成多列、不 sticky；議程目錄可水平捲動；沒有水平溢出。
- 本機 production 伺服器（1440）另手動開過會議頁與頂欄「匯出」選單：五組分組、每項名稱＋說明一行。
- Lighthouse 流程報告：`verification/revamp-v3/V3-7/lighthouse/flow-desktop-1440.html`、`flow-mobile-390.html`。

## 5. 已知限制與偏離

- **頁首動作列只在 ≥ 1280 sticky**：768–1279 期間列會換成兩列、手機頁首換成多列，sticky 會蓋住內容，改成靜態。
- **h2 標題固定「本次會議（草稿）」**：本頁的會議稿在「結束會議」前都是草稿；已結束的會議在歷史清單（每筆帶結束標示）。PRD 的「已結束會議 · 10/5」句型用在歷史項目。
- **`manager-summary` testid 搬到議程 `<ol>`**：ol 只能含 li，無法再包一層只含 1–3 的元素；議程模式的 ManagerSummary 回傳三個 li。
- **匯出版頭第 1 行**：dashboard 與會議頁匯出用畫面上的資料集名稱；`ManagerSummary` 元件內（outputs 模式）與歷史紀錄資料不同時退回 dataset_id。會議紀錄 Markdown 的產出時間＝結束時間（同一筆每次下載相同）；一頁摘要與決策 Markdown 的產出時間＝下載當下。
- **Markdown 版頭與既有 mdMeta／mdPeriod 行重複一次期間資訊**：既有段落順序與數值不動，正規化比對才能與 71e9f5f 相同。
- **Excel 樣式靠改 zip**：SheetJS 社群版不支援樣式與凍結；改 `xl/styles.xml` 與 sheetView，找不到預期片段時保留原檔。Excel 表頭底色 `#f1f3f3` 來自 export-theme。
- **PPT 字型**：pptxgenjs 對同一段只能一個字型，中文段落用 Microsoft JhengHei，純數字欄用 Arial；「平台 · MARKETPLACE」在通路欄仍折 3 行（既有）。
- **會議頁 Lighthouse `label-content-name-mismatch` 10 個節點**（議程 1 的關鍵數字與精簡表的 number-link，aria-label 是 v2 的抽屜標題句）：不計分；E2E 以此名稱定位，V3-10 連同 E2E 一起改成含可見值的句型。
- **列印內文 12px → 10pt**：golden／demo 仍 2 頁；內容很多的會議（3 個置頂待辦、多個選入方案、長備註）可能把第 1 頁擠到第 2 頁，未量測。
- **資料問題 CSV 的資料來源頁入口（§6.5 D04 備註）**：v2 沒有、本批未做（頂欄條件項與匯入精靈步驟 4 仍有入口），留 V3-8 資料來源頁一併做（D-V3-28）。
- **匯出選單「複製週會摘要」與總覽同名**：同一動作兩個入口；E2E 用 testid。
- **舊鍵保留到 V3-10**：`meetingPage.basics／outputs／periodsLine／channelTableSummary／scenarioResults／menuMarkdownHint／menuViewNote`、`downloads.analysisCsvHint／issuesCsvHint／menuNote`、`pptxExport.title／subtitle／technical`、`ui.managerSummary.printTitle／printContext／printPeriodLine`。舊 CSS（`.headlines`、`.change`、`.meeting-output-buttons` 等）由錨點區段覆寫，V3-10 清理。
- **dashboard 的 afterPaint 用 requestAnimationFrame**：分頁隱藏時載入會停在「正在檢核與計算…」直到可見（v2 既有，代理 A 在隱藏的瀏覽器窗格發現）。
- 既有 BOM 正規式的字面 U+FEFF（三個測試檔）自 v2.0.0 既有。

## 6. 下一批、人工關卡、需要拍板

- **下一批 V3-8 資料來源、匯入精靈、空狀態**。
- 人工關卡：H2、H3 已依指示略過；H1、H4 未執行。本批的「匯出檔人工檢查」以 Excel／PPT 開檔截圖代替（§4）。
- 需要拍板：**D-V3-28** 資料問題 CSV 是否在資料來源頁問題表工具列加入口（A 在 V3-8 加／B 維持頂欄條件項與匯入精靈）。D-V3-26、D-V3-27 仍待回覆。
