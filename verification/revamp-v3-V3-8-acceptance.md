# Revamp v3 V3-8 驗收：資料來源、匯入精靈、空狀態（2026-10-07）

依 `docs/revamp-v3/06_BATCHES.md` V3-8 與 PRD §7.7（資料來源頁、匯入精靈全版專注模式）、§7.10（空狀態與示範）、§6.3 #51–#54、§6.4 M1–M6、§6.5（匯入範本）、§9.4（C3、C8、C10、C20）。H2 設計稿審查與 H3 文案補審依使用者 2026-10-07 指示略過；H1、H4 未執行。

工作方式：開工錨點 `909554d`（匯入範本 3×3 表抽成 `shell/template-table.tsx`、dashboard 的匯入中旗標 `importing`（期間列／橫幅／頁面內容與頁首按鈕 hidden 掛載）、`PageHeader` 的 `hasData`／`importing`、`IssueList` 的 `download` 選填 prop、labels／CSS／掛載測試錨點）→ 三個 worktree 代理並行（A 資料來源頁 `792cd35`、B 匯入精靈 `df51eb2`、C 空狀態 `9105b7e`）→ 合併（globals.css 一處衝突：兩行 `@media` 一行式規則，取 C 的刪除再套 A 的 `.metadata-grid` 刪除）→ 接線 `883101e` → 三個 E2E 代理對共用伺服器遷移 spec → 全套 E2E → 四尺寸截圖與 Lighthouse → 本文件。

## 1. 完成項目（對照 06_BATCHES V3-8）

| 項目 | 狀態 | 說明 |
|---|---|---|
| 資料來源頁重排（§7.7.1 的 1–9） | 完成 | `workspace-panels.tsx` DataWorkspace：資料狀態一行 `data-status-line`（來源 · 資料到 · 涵蓋（n 天）· 檔案數 · 金額基準 · 問題數）→ 資料問題 `data-issues`（第二段）→ 範圍與金額基準 `data-scope`（9 欄卡改兩欄定義列表 `dl`，多一格金額基準）→ 本次匯入的前處理 `data-preprocessing`（表格：欄位｜含稅合計（元）｜未稅合計（元）｜稅率；未稅時一句 noConversion）→ 選填資料 `data-optional`（目標／檔期並列，各自工具列 上傳、下載範本、下載目前資料、移除；testid 不變）→ 來源檔案預覽 `data-preview`（三個收合 `details` `data-preview-{file}`，前 10 列，行號等寬）→ 版本與來源資訊 `data-version-info`（資料版本 SHA-256、指標版本 contribution-v1＋assist-kpi 版本（取自 snapshot 與常數，不寫死）、金額基準識別、匯入時間（本次工作階段由精靈套用時才有）、欄位對照彙整）→ 匯入範本 `data-templates`（與頂欄同一個 `TemplateTable`） |
| 頁首主次依有無資料對調（§7.7.1 第 1 點） | 完成 | `shell/page-chrome.tsx`：`hasData` 為 true 時「匯入資料」主要在前；為 false 時「載入示範資料」主要在前（`page-import` 永遠在「匯入資料」上）；dashboard 的 `showLoadDemo` 改為永遠給（沒有資料時頁首就是示範主要） |
| 資料問題表六欄、原因碼收合、下載問題清單 CSV（§7.7.1 第 3 點；D-V3-28） | 完成 | `issue-list.tsx`：檔案（等寬）｜行號（等寬、右對齊）｜欄位｜問題（V3-2a 的 L1 去掉「{file} 第 {line} 行：」前綴）｜修法（L2）｜原因碼（L3；整欄預設 hidden 掛載，表頭工具列「顯示原因碼」aria-pressed 切換；每格保留既有「問題代碼」details）；工具列右側「單位：元」一句與 `download` prop 給的「下載問題清單 CSV」（資料來源頁 `data-issues-download`，檔名與頂欄 `download-issues` 相同 `profitlens-issues.csv`）；50 列分頁、regionAria、caption（改 sr-only）保留；目標／檔期的錯誤清單也用同一張表（`SideFileIssueList`） |
| 匯入精靈全版專注模式（§7.7.2） | 完成 | 匯入中 PageHeader 的 h1「匯入資料」＋隱私一句，期間列／橫幅／頁面內容與頁首按鈕 hidden 掛載（M1；`import-step-1` 狀態下 `page-import`、`period-bar` 各一份）；精靈 `h2#import-heading` 只寫「第 n 步，共 4 步：{步驟名}」（不再「匯入資料｜…」拼接；eyebrow「本機」移除）；C20 stepper（`import-stepper`，`aria-current="step"`，完成步驟 inline SVG 勾、未做數字、chevron 用 SVG；手機只留序號與目前步驟名）；「取消匯入」在版頭右上（只一份）；底部 sticky 動作列 `.wizard-footer` 64px（上一步次要／下一步或套用主要；`import-commit` 跟著按鈕） |
| 步驟 1（拖放區、C3 檔案列、範本與說明收合、訂單級提示） | 完成 | 拖放區 1px 虛線 `--border-strong`、120px、文字靠左；三個 `article.file-slot[data-testid=import-file-{role}][data-state]` 列：角色｜檔名（等寬）｜編碼｜列數｜C8 狀態標籤｜移除；範本（`TemplateTable`＋manifest.json 連結）、欄位說明、進階 manifest 各收 `details`；訂單級／活動級提示維持 inline |
| 步驟 2（已對照欄收合、? 說明、提示合併） | 完成 | 每份檔 `article.mapping-card[data-testid=import-mapping-{role}]`，標題「{檔案} · 已對照 m／n 欄 · k 欄需要確認」（n 取 `import.ts` 常數）；自動對上的列收在 `details.mapping-done`「已對照的 m 欄」（掛載），需要確認的列展開；每列 標準欄位名｜select 32px｜範例值 13px 等寬｜狀態標籤；欄位說明改 `?` 按鈕就地展開（`field-help.tsx`；aria-expanded／aria-controls、Esc 關閉回焦、hidden 掛載）；記憶與預設提示合併一行（`import-memory-hint`／`import-preset-hint` 各自保留） |
| 步驟 3（金額基準說明、換算欄位依 D2 預設並收合、兩欄表單；可見控制 ≤ 12） | 完成 | radio 三個各一行說明（aria-describedby）；含稅時 `import-conversion`：稅率＋「將換算 n 個欄位」＋「調整換算欄位」展開 9 個 checkbox（預設勾選數直接讀 reducer 的 D2 預設 8）；`import-settings-proposal` 兩欄表單（資料集名稱、資料到、涵蓋起日、涵蓋迄日），比較方式／上期本期 4 個日期／整月捷徑收在「調整比較期間」details（兩期不完整時自動展開），通路多於 1 個時收在「調整通路」details（一行「已選 n 個通路：…」） |
| 步驟 4（狀態一行、前處理表、問題清單、對帳表、套用） | 完成 | `import-status`（role=status）改 L1 樣板「可以套用：{files} 份檔案、{rows} 列、{errors} 項錯誤、{warnings} 項提醒」／「可套用已有範圍：…」／「無法套用：{errors} 項錯誤」並帶 `data-classification`；既有 result 句子移到 `import-result-note`；前處理表 `import-preprocessing`（同資料來源頁欄位）；問題清單用新六欄 IssueList＋精靈自己的「下載問題清單 CSV」（`profitlens-import-issues.csv` 不變）；對帳表 `reconciliation-{field}`／`reconciliation-metric-{metric}` 不變（來源總額改經 formatAmountL3 顯示，值不變） |
| 首次進入空狀態（§7.10） | 完成 | `shell/page-states.tsx` `FirstRunState`：`section.ui-empty-page[data-testid=empty-state]`，h2「還沒有資料」（既有鍵）＋一句說明＋「載入示範資料」主要（`empty-load-demo`）＋「匯入資料」次要（`empty-import`，一次點擊開精靈）＋「需要的檔案」16/600＋`TemplateTable layout="guide"`（檔案｜內容｜範本：空白範本／範例檔並排）；不放插圖（`.empty-illustration` JSX＋CSS 刪除）、不用 eyebrow、步驟列、箭頭 icon；padding 24px、寬 640px、高度＝有資料時首屏（`--empty-min-h`）。資料來源頁的空狀態不重複按鈕列（頁首已有兩顆；M6） |
| 載入骨架與錯誤狀態等高（§7.10、C10） | 完成 | `LoadingState`（同容器、`aria-busy`、spinner＋標題＋一句＋骨架一行四格 `--bg-subtle`，不做 pulse／shimmer；`@keyframes pulse` 刪除）；`ErrorState`：h2「資料無法載入。」＋一行原因（role=alert）＋「重新載入」主要 `error-retry`、「回到上次成功的資料」次要 `error-back`（有上次資料才出現）、「查看問題清單」文字按鈕 `error-view-issues`（有問題才出現；焦點移到問題清單 region）；「!」圖示移除 |
| 區段空狀態（§7.10 表、C10 三要素） | 完成（會議「前往假設試算」由收尾者補） | 健檢沒有結果：`diagnosis-empty`（標題「本期沒有需要處理的項目。」＋「8 條規則都沒有觸發。」＋「查看健檢規則」就地展開 8 條規則說明（新文案，見 §5））；沒有方案：`scenario-add` 空狀態三要素；會議沒有選入方案：`meeting-scenario-results-empty` 兩句＋「前往假設試算」`meeting-go-scenarios`（切到假設試算頁）；會議歷史為空：兩句；尚無待辦、篩選無結果本來就符合（篩選無結果只補 `p.ui-empty-title`）。`.ui-empty-block` 1px 虛線 `--border-default`、radius 6px、padding 16px、14px |
| 示範資料標示 | 完成（既有） | 資料狀態按鈕「示範資料 · 資料到 …」、popover 第一行「示範資料（虛構）」；「（虛構）」只在 popover 與首次進入的說明句 |
| labels 新分組 | 完成 | `data.pageV3` 41 鍵、`importWizard.wizardV3` 32 鍵、`empty.stateV3` 13 鍵（含收尾者的 `meetingGoToScenarios`）；既有鍵字串不變（`labels-structure` 快照通過；`LEGACY_PREFIXES` 的 emptyState 一列改成只列 v2 四鍵，legacyAliases 不變）；copy-style 同義詞 13／禁用詞 3 不變 |
| 單元測試與 E2E 遷移 | 完成（112 檔／2,222 測試全過；E2E 全套 680 passed（19.4m）、0 failed、0 skipped（V3-7：644；本批新增 36 條：import-wizard 4、empty-states-v3 3、data-page-v3 2，各 ×4 專案）） | 新增 `tests/data-workspace-v3.test.tsx`（14）、`tests/issue-list-v3.test.tsx`（7）、`tests/import-wizard-v3.test.tsx`（13）、`tests/empty-states-v3.test.tsx`（26）；`mounted-testids` 新增 `data-with-issues`、`shell-empty-data`、`shell-error` 三個狀態與 A／B／C 的 M1／M6 測試（精靈第 2–4 步以 `initialState` SSR 進 `import-step-1` 整頁檢查）；E2E：`tests/e2e/import-wizard-helpers.ts`（confirmAndCheck 改看 data-classification 與 import-result-note；fillWizardSettings 先展開「調整比較期間」；新增 openWizardDetails／openWizardPeriods／openWizardChannels／openWizardConversion）、`import.spec`（步驟 4 與資料來源頁的六欄問題表、前處理表、預覽與版本 details）、`import-wizard.spec`（新增點擊數 ≤ 5、步驟 3 可見控制 ≤ 12、四步標題無「｜」、匯入中期間列 hidden）、`import-guidance.spec`、`workspace.spec`、`revamp-r4.spec`、`review-v2-a.spec`、`m6-acceptance.spec`、`manager-presentation.spec`、`action-workspace.spec`、`revamp-r6.spec`；新增 `data-page-v3.spec`（區塊順序、六欄表頭、原因碼切換、profitlens-issues.csv、頁首主次對調、diagnosis-empty 8 條規則）、`empty-states-v3.spec`（首頁空狀態結構、一次點擊開精靈與取消、CLS 與首屏高度）、helper `data-page-helpers-v3.ts`、`misc-helpers-v38.ts` |
| 驗收重點：§6.3 #51–#54 testid | 完成 | 全部存在（`testid-baseline` 刪除數 0；SSR 比對） |
| 驗收重點：含稅匯入點擊數 ≤ v2（5） | 完成 | 5（匯入資料 → 下一步（第 2 步自動完成）→ 含稅 → 我確認金額基準與期間，開始檢核 → 套用）；E2E 斷言 |
| 驗收重點：CLS < 0.05 | 完成 | 代理 C 臨時量測（dev server）1440×1000 0.0003、390×844 0；E2E 斷言（E2E empty-states-v3.spec 四尺寸全過：desktop 0.0006、laptop 0.0008、tablet 0.0010、mobile 0.0019（含輸入後 500ms 內的位移，比標準 CLS 更嚴）） |
| 驗收重點：`design-lint` hex 0（token 定義區 ≤ 48） | 完成 | hex 0、token 定義區 23 |

## 2. 變更檔案

- 新增：`src/components/shell/template-table.tsx`、`src/components/shell/page-states.tsx`、`src/components/diagnosis-empty.tsx`、`src/components/import-wizard/field-help.tsx`、`tests/data-workspace-v3.test.tsx`、`tests/issue-list-v3.test.tsx`、`tests/import-wizard-v3.test.tsx`、`tests/empty-states-v3.test.tsx`、`tests/e2e/data-page-v3.spec.ts`、`tests/e2e/empty-states-v3.spec.ts`、`tests/e2e/data-page-helpers-v3.ts`、`tests/e2e/misc-helpers-v38.ts`。
- 修改：`src/components/workspace-panels.tsx`、`issue-list.tsx`、`diagnosis-list.tsx`、`dashboard.tsx`、`meeting-page.tsx`、`decision-workbench.tsx`、`product-comparison-panel.tsx`、`shell/page-chrome.tsx`、`shell/export-menu.tsx`、`import-wizard/{index,step-files,step-mapping,step-basis,step-review}.tsx`、`src/i18n/labels.zh-TW.ts`、`src/app/globals.css`（三個 V3-8 錨點區段；刪除舊 `.metadata-grid`、`.side-entry*`、`.diagnosis-empty`、R3 精靈規則、`.import-files/.import-settings/.mapping-grid/.import-result`、`.empty-state/.empty-illustration/.empty-steps/.skeleton*/.error-icon/.empty-note`、`@keyframes pulse` 與 640px 片段）、`tests/{mounted-testids,testid-baseline,labels-structure,manager-language,diagnosis-list,meeting-page,product-page-v3}`、E2E：`tests/e2e/import-wizard-helpers.ts`、`import.spec.ts`、`import-wizard.spec.ts`、`import-guidance.spec.ts`、`workspace.spec.ts`、`revamp-r4.spec.ts`、`review-v2-a.spec.ts`、`m6-acceptance.spec.ts`、`manager-presentation.spec.ts`、`action-workspace.spec.ts`、`revamp-r6.spec.ts`、`verification/revamp-v3-capture/metrics.spec.ts`（含稅匯入的狀態斷言改看 data-classification 與 import-result-note）、`docs/revamp-v3/06_BATCHES.md`、`docs/revamp-v3/09_DECISIONS_PENDING.md`、`docs/STATUS.md`、`docs/DECISIONS.md`、`verification/revamp-v3/feature-retention.csv`、`verification/revamp-v3/e2e-text-assertions.csv`。
- 零改動：`src/domain`、`src/application`（本批沒有碰）、`fixtures`、`docs/METRICS.md`、`.env*`、`vercel.json`。

## 3. 驗收命令與真實結果

| 命令 | 結果 |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | 0 warnings |
| `npm run audit:ui` | hex 0（token 定義區 23）、圓角 4、字級 11（不含列印 8）、字距 0、rotate 0、JSX 箭頭 3、eyebrow 0、裝飾字元 0、CSS content 0、置中按鈕列 0、巢狀卡 0、漸層 0、陰影 0、JSX 中文 0、字串常值中文 0；靜態 testid 234（V3-7：215）；labels 同義詞 13／禁用詞 3 |
| `npm run contrast-check` | 75／75 通過 |
| `npm test -- --run` | **112 檔／2,222 測試全過**（V3-7：108 檔／2,158；新增 data-workspace-v3、issue-list-v3、import-wizard-v3、empty-states-v3） |
| `npm run lint:design` | exit 0；棘輪數值與 V3-7 相同，ceiling 未調（沒有指標下降） |
| `npm run build` | pass |
| `npm run test:e2e` | **680 passed（19.4m）、0 failed、0 skipped（V3-7：644；本批新增 36 條：import-wizard 4、empty-states-v3 3、data-page-v3 2，各 ×4 專案）**；四專案；跑完後 `verification/review-v2-a-*`、`verification/revamp-R6/` 被重寫，以 `git checkout --` 還原 |
| 畫面基準 | `verification/revamp-v3/V3-8/snapshots/{desktop,laptop,tablet,mobile}/01–09.png` 共 36 張（baseline.spec `--update-snapshots` 4 passed），重跑核對 4 passed、0 張差異 |
| 首屏量測（metrics.spec） | metrics.spec 6 passed（第一次 5 passed、1 failed：含稅匯入的 `import-status` 文字斷言是 v2 句子，改成 data-classification＋import-result-note 後重跑 6 passed；`_meta.batch=V3-8`）：1440 本期一句話頂端 192px、KPI 帶底 419px、扣廣告後貢獻值頂 323px、三件事首列底 561px、KPI 前可聚焦 9；390 一句話頂 116px、KPI 帶底 555px、三件事首列底 807px、可聚焦 3（與 V3-7 相同）；1280 頂欄 48px 一列；各頁到精靈步驟 1 最多 2 次點擊；含稅匯入經「頂欄資料狀態 → 匯入新資料」路徑 6 次點擊（與 V3-7 同；經頁首或空狀態的「匯入資料」為 5，E2E 斷言）；First Load JS gzip 505.5 KiB（V3-7 499.1；+6.4 KiB，精靈與資料頁的新結構） |
| Lighthouse（示範資料已載入，1440 與 390） | 1440 與 390 各 6 個快照步驟 accessibility 全部 100（首頁空狀態、經營總覽、通路健檢、商品毛利、假設試算、會議紀錄；與 V3-7 相同）；首頁 performance 1440＝100、390＝97（V3-7：99／97）。timespan 的 CLS：載入示範資料 1440＝0、390＝0.001（V3-7：0.062／0.079）；390 切到商品毛利 0.054（V3-7 0.054；側欄切頁的位移，非本批範圍，V3-5 商品頁既有）。失敗審核只剩會議紀錄頁的 `label-content-name-mismatch` 10 個節點（與 V3-7 相同；V3-10 連 E2E 一起改名）。流程報告 `verification/revamp-v3/V3-8/lighthouse/flow-desktop-1440.html`、`flow-mobile-390.html` |
| 禁區 diff（對 82b70df） | 空（`git diff --stat 82b70df -- src/domain fixtures/golden fixtures/demo fixtures/errors fixtures/refund_only fixtures/zero_ad docs/METRICS.md`） |
| testid 基準 | 刪除數 0；新增 data-status-line、data-issues、data-issues-download、data-scope、data-optional、data-preview、data-preview-{file}、data-version-info、data-templates、diagnosis-empty、import-result-note、empty-state、empty-load-demo、empty-import、loading-state、error-state、error-retry、error-back、error-view-issues、error-issues、meeting-go-scenarios |
| 隱藏字元掃描 | 變更檔 0（既有 BOM 正規式的 U+FEFF 除外） |

### 3a. 本批驗收重點（PRD §7.7、§7.10、06_BATCHES）

| 指標 | 目標 | 實測 |
|---|---|---|
| §6.3 #51–#54 testid | 全部存在 | 全部存在；刪除數 0 |
| 含稅匯入點擊數（`tests/fixtures/inclusive_tax`） | ≤ 5（V3-0 基準） | 5（代理 B 臨時量測；E2E 斷言） |
| 步驟 2 預設可見 select | ≤ 需要確認欄位數＋1 | 改名欄位 fixture：1（上限 2）；全中文欄名字典建議：10（上限 11）；欄名全標準：0 |
| 步驟 3 含稅後預設可見控制 | ≤ 12 | 12（取消匯入、3 radio、稅率、調整換算欄位、資料集名稱、資料到、涵蓋起日、涵蓋迄日、調整比較期間、通路 1 個或「調整通路」） |
| 精靈四步標題 | 沒有「｜」拼接 | 「第 n 步，共 4 步：{步驟名}」；E2E 斷言 aria-current=step 只有一個 |
| CLS（首頁空狀態 → 載入示範資料 → 第一張 KPI 可見後 1 秒） | < 0.05 | 代理 C：1440×1000 0.0003（總和 0.0006；改版前 0.0519）、390×844 0（總和 0.0019；改版前總和 0.0831）、1280×900 0.0002、768×1024 0；E2E empty-states-v3.spec 四尺寸全過：desktop 0.0006、laptop 0.0008、tablet 0.0010、mobile 0.0019（含輸入後 500ms 內的位移，比標準 CLS 更嚴） |
| 空狀態／載入中／有資料首屏高度 | 相同（避免跳動） | 1440×1000：888／888／896（差 8px）；390×844：788／788／796；`--empty-min-h` = calc(100svh − 頂欄 − 頁首 − 8px) |
| `design-lint` hex | 0（token 定義區 ≤ 48） | 0（token 定義區 23） |
| 資料來源頁結構 | §7.7.1 順序 | h2 7 個（v2 5 個）；問題表 6 欄；前處理表列數＝換算欄位數（含稅 fixture 8）；範圍定義列表 10 格 |
| axe（精靈四步，1440 與 390） | 0 serious | 0 項違規（wcag2a／2aa／21aa／22aa／best-practice；代理 B 臨時量測） |

## 4. 瀏覽器驗收方式與截圖

- 四尺寸截圖：`verification/revamp-v3/V3-8/snapshots/{desktop(1440×1000),laptop(1280×900),tablet(768×1024),mobile(390×844)}/01-overview-top、02-overview-full、03-evidence-drawer、04-actions-board、05-diagnosis、06-products、07-scenarios、08-meeting、09-data.png`（09-data 是本批重排的資料來源頁；示範資料 production、`APP_MODE=PUBLIC_DEMO`）。
- 首屏量測：`verification/revamp-v3/V3-8/metrics.json`。
- Lighthouse 流程報告：`verification/revamp-v3/V3-8/lighthouse/flow-desktop-1440.html`、`flow-mobile-390.html`。
- 匯入精靈四步、資料來源頁展開原因碼／預覽／版本資訊、空狀態三種狀態的畫面由 E2E 逐項斷言（`import-wizard.spec`、`data-page-v3.spec`、`empty-states-v3.spec`、`workspace.spec` 錯誤狀態）；代理自查截圖留在 scratchpad，未提交。
- 瀏覽器走查：代理 A／B／C 各自以 dev server 在 1440、1280、768、390 檢查頁面橫向溢出 0；代理 B 另跑 axe（精靈四步，1440 與 390）0 項違規。

## 5. 已知限制與風險

- **「查看健檢規則」的 8 條規則說明是新文案**（`data.pageV3.diagnosisEmpty.rules`，依 `docs/METRICS.md` 的規則定義改寫）：頁面上沒有既有的規則說明區塊可連，所以就地展開。H3 已略過，這 8 句需要下一次文案審稿。
- **匯入時間只在本次工作階段有**：`dashboard` 在精靈套用時記 `importedAt`，示範／golden 載入與還原備份沒有這一列（備份 v4 不存匯入時間；要不要寫進備份屬 V3-9 備份 v5 的範圍）。
- **資料來源頁沒有資料時的空狀態沒有按鈕列**（頁首已有「載入示範資料」主要＋「匯入資料」次要，依 §7.7.1 第 1 點；M6 不重複控制）；總覽等其他頁的空狀態才有兩顆按鈕。
- **手機（< 768）的頁首 h1 與描述只給螢幕閱讀器**（V3-3 的殼層決定），所以匯入中手機看不到「匯入資料」標題；精靈補了一行只在手機顯示、aria-hidden 的隱私句。是否在手機露出 h1 屬殼層決策（D-V3-29，見 §6）。
- **步驟 3 的比較方式／兩期日期／整月捷徑收進「調整比較期間」**（兩期不完整時自動展開）、通路多於 1 個時收進「調整通路」：為了含稅時預設可見控制 ≤ 12（含版頭「取消匯入」）。PRD 把比較方式列在兩欄表單內，全部可見會超過 12。
- **原因碼切換按鈕文字固定「顯示原因碼」**，狀態用 aria-pressed（APG toggle button 不隨狀態改字）。
- **資料問題表在手機沒有做 C3 清單式重排**：在 `.table-scroll` 內橫向捲動，< 768 第一欄 sticky；四種寬度頁面本身沒有橫向溢出。
- **既有字串與 PRD 不一致但不能改**（V3-10 清 alias 時處理）：`importWizard.steps[0]`「選檔」（PRD「選擇檔案」）、`ui.importPanel.stepReconcile` 帶 v2 序號前綴、`emptyState.title`「還沒有資料」沒有句號（§8.7）。不再引用的既有鍵：`emptyState.eyebrow／steps`、`ui.decisionWorkbench.emptyPlans`、`meetingPage.historyEmpty`、`ui.workspacePanels.noDiagnostics`、`importWizard.fileMeta／resultNote.valid／templatesBlank／templatesExample`；`globals.css` 的 `.import-panel` 舊規則沒有元件使用。
- **底部動作列 sticky**：Playwright 自動捲動時靠近視窗底的元素可能被蓋住（手機尤其），E2E 以 scrollIntoViewIfNeeded 處理，不用 force。
- **試算頁「尚無方案。新增後就能試算。」**只在基準過期又沒有寫入方案時出現，此時「新增方案」因基準過期停用，要先重建基準；文案與狀態有落差（可考慮新鍵「先用目前資料重建基準」，需拍板）。
- H1、H4 未執行；H2、H3 略過（使用者指示）。未推送、未部署。
- **E2E 代理發現並已修正的回歸**：開工錨點把期間列與橫幅包進 `hidden` 容器後，`.period-bar` 的 sticky 只能在容器內作用（revamp-r1-layout:175 差 536px）；收尾改 `.period-wrap:not([hidden]) { display: contents }`（`c4b79da`），全套 E2E 通過。
- v2 的「還沒選方案；草稿與過期方案不會列入決議。」在會議頁被 §7.10 的兩句取代，「草稿與過期方案不會列入決議」這個資訊從畫面消失（既有鍵保留；列入下次文案審稿）。
- `capture` 的含稅匯入點擊路徑（頂欄資料狀態 → 匯入新資料）仍是 6，與 V3-7 相同；PRD 的 5 次是從頁首或空狀態的「匯入資料」起算（E2E 斷言）。

## 6. 下一批建議、人工關卡與待拍板

- 下一批：V3-9 P1 新增功能（F8 三線趨勢、F9 管理損益表、F10 下鑽、F12 損益兩平 MER（`src/application`、`breakeven-mer-v1`）、F13 廣告決策標籤（備份 v5）、F14 匯出變體、F22 投影模式；F15 台灣化示範資料需使用者提供商品與檔期設定）；或依 06_BATCHES 整批延到 v3.1，直接做 V3-10 上線檢查。
- 被擋住的人工關卡：H4（v3 複測）擋 v3.0.0 正式上線；H1 只擋 V3-10 的前後對照。H2、H3 已略過。
- 待拍板（`09_DECISIONS_PENDING.md`）：D-V3-26（卡片高度）、D-V3-27（試算頁鍵盤步數）仍待；D-V3-28 本批依 PRD §7.7.1 第 3 段實作（資料來源頁問題表工具列「下載問題清單 CSV」）＝建議值 A，若不要可只移除 `download` prop；新增 D-V3-29（手機匯入中是否露出頁首 h1）、D-V3-30（匯入時間是否寫進備份 v5）。
