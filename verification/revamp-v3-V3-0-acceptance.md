# Revamp v3 V3-0 驗收：基準與護欄（2026-10-05）

依 `docs/revamp-v3/06_BATCHES.md` V3-0 與 `docs/revamp-v3/01_PRD.md` §2.3、§5.4、§6.3–6.5、§11.7、§12.1–12.2 執行。**畫面零變化**（四尺寸 `toHaveScreenshot` 差異 0）；禁區 diff 對 `82b70df`（tag `v2.0.0`）為空；沒有新增依賴；labels 不改（產品改名除外，見下）。

批次前置：產品名稱改為 **EC ProfitLens**（使用者 2026-10-05 指示；D-V3-25）。只改使用者看得到的名稱（`labels.brand.name`／`title`、列印與決策紀錄標題、AI 提示、README／RELEASES／ENGINEERING／AGENTS／CLAUDE、`public/og.png`、README 首圖）；技術識別不改（package 名 `profitlens`、下載檔名前綴 `profitlens-`、備份 schema 字串、`dataset_id`、網址）。所有拍板事項 D-V3-1–24 依建議值（使用者 2026-10-05）。

## 1. 完成項目（對照 06_BATCHES V3-0 ①–⑧）

| 項目 | 狀態 | 說明 |
|---|---|---|
| ① 5 人可用性測試與外部盲評的腳本、問卷、招募清單；tag `v2.0.0` | 完成（量測本身為人工關卡 H1，**未執行／待人工**） | `docs/revamp-v3/usability-test.md`（招募清單範本、§3.4 任務腳本、10 秒結論測試、30 秒試用、首個洞察時間計時規則、任務成功計分、兩題 7 點量表、SUS 10 題繁中、名詞查詢負擔計數、盲評流程、結果表）。本機 tag `v2.0.0` → `82b70df`（未推送） |
| ② `scripts/ui-audit.mjs`、`scripts/contrast-check.mjs`、`tests/design-lint.test.ts`、`tests/copy-style.test.ts` | 完成 | 共用掃描模組 `scripts/lib/{ui-scan,copy-scan,load-labels}.mjs`；上限檔 `tests/fixtures/{design-lint,copy-style}-ceiling.json` 以 v2 實測值初始化（棘輪：只能下降，且上限檔不得高於測試檔內記錄的 V3-0 基準）；npm 指令 `audit:ui`、`contrast-check`、`lint:design`。JSX 解析用既有 devDependency `typescript`，不新增依賴 |
| ③ `testids-v2.txt`＋`tests/testid-baseline.test.ts`；補 6 組 testid 屬性 | 完成 | 228 個 testid（SSR 208、E2E 收集 15、條件狀態 5），33 個 SSR 頁面狀態；樣板全部展開成實際值；運算式與 `testId` 屬性來源（`meeting-agenda-2`、`meeting-followup`、`meeting-compare-kpis`、`meeting-history-kpis`）都在。新增屬性：`page-import`、`actions-export-{md,csv,json}`、`threshold-form-overview`、`threshold-form-meeting`、`meeting-create`、`meeting-scenario-select-{DTC,MARKETPLACE}`（只加屬性；刪除任一 testid 測試即失敗，已實際驗證） |
| ④ `feature-retention.csv`、`backup-schema-v4.json`、下載入口清單、`e2e-text-assertions.csv` | 完成 | 功能保留表 113 列（§6.3 的 62 列＋51 個下載入口，含條件項與 §6.5 未列的 manifest 範例下載 D48）；備份 v4 欄位 309 條（含 `ui_prefs.view`／`last_preset`、`meeting_history`、方案敏感度），另加 `tests/backup-schema-v4.test.ts` 做欄位與還原往返檢查；`storage-keys-v3.txt`（v2 沒有 localStorage；IndexedDB `profitlens-opt-in-workspace-v1` 的 `workspace`、`mapping-memory`）；E2E 定位器清單 1,231 列（`scripts/e2e-locator-inventory.mjs` 可重產） |
| ⑤ `toHaveScreenshot` 四尺寸基準 | 完成 | `verification/revamp-v3.capture.config.ts`＋`revamp-v3-capture/baseline.spec.ts`；36 張（4 尺寸 × 9 畫面：總覽首屏、總覽整頁、計算與來源抽屜、待辦看板、通路健檢、商品毛利、假設試算、會議紀錄、資料來源）；`threshold: 0.02`、`maxDiffPixelRatio: 0`（0 時 mobile 整頁有 24 個 ±1 色階的反鋸齒像素）；合併後重跑 4/4 通過、0 差異 |
| ⑥ `copy-rewrite.csv` 與紙本用語測試材料送人工審（H3） | 完成（審稿**未執行／待人工**） | `docs/revamp-v3/copy-rewrite.csv` 1,948 列（labels 全部字串值）：unchanged 1,341、reworded 442、split 92、renamed 61、removed 9（PRD 明文刪除的版面文字，例如空狀態 eyebrow 與步驟列）、moved-to-technical 3；自動檢查 0 違規；`docs/revamp-v3/term-test-paper.md` 10 題（D-V3-14 Q1–4、D-V3-2 Q5–10）。審稿人優先看的 20 列見本檔 §6 |
| ⑦ 基準量測 | 完成（示範頁 Performance 0–100 分**未執行**，理由見 §5） | `verification/revamp-v3/V3-0-baseline.md`、`V3-0/metrics.json`、`V3-0/lighthouse/*.html`、`scripts/lighthouse-pages.mjs`、`revamp-v3-capture/metrics.spec.ts`；數字見 §3 |
| ⑧ 拍板清單交給使用者 | 完成 | `docs/revamp-v3/09_DECISIONS_PENDING.md` D-V3-1–24 全部填「依建議值（使用者 2026-10-05）」，另加 D-V3-25 產品改名；`docs/DECISIONS.md` 新增 2026-10-05 一筆 |
| 文件套件與 CLAUDE.md | 完成 | `docs/revamp-v3/{00_README,06_BATCHES,GLOSSARY}.md`；`CLAUDE.md` 改為 Revamp v3 規則（本輪目標、先讀什麼、硬規則、驗收命令、回報格式、檔案地圖），使用者 2026-10-05「開始依 PRD 進行改版開發」視為授權，變更摘要見 §6 |

## 2. 變更檔案

- 新增：`scripts/{ui-audit,contrast-check,lighthouse-pages,e2e-locator-inventory}.mjs`、`scripts/lib/{ui-scan,copy-scan,load-labels}.mjs`（＋ `.d.mts`）、`tests/{design-lint,copy-style,testid-baseline,backup-schema-v4}.test.ts`、`tests/fixtures/{design-lint,copy-style}-ceiling.json`、`verification/revamp-v3.config.ts`、`verification/revamp-v3.capture.config.ts`、`verification/revamp-v3-capture/{shared.ts,baseline.spec.ts,metrics.spec.ts}`、`verification/revamp-v3/{collect-testids.spec.ts,collect-testids.json,testids-v2.txt,feature-retention.csv,backup-schema-v4.json,storage-keys-v3.txt,e2e-text-assertions.csv,V3-0-baseline.md}`、`verification/revamp-v3/V3-0/{metrics.json,snapshots/**,lighthouse/*.html}`、`docs/revamp-v3/{00_README,06_BATCHES,09_DECISIONS_PENDING,GLOSSARY,usability-test,term-test-paper}.md`、`docs/revamp-v3/copy-rewrite.csv`、本檔。
- 修改：`src/components/{dashboard,actions-workbench,top-three,manager-summary,meeting-page}.tsx`（只加 `data-testid`）、`package.json`（3 個 npm 指令）、`scripts/make-og.mjs`（截圖來源改為 V3-0 基準）、`public/og.png`、`docs/images/overview-1440.png`、`docs/{DECISIONS,STATUS,ENGINEERING}.md`、`CLAUDE.md`；改名：`src/i18n/labels.zh-TW.ts`（brand 4 處）、`src/ai/prompt.ts`、`scripts/aggregate_orders.py`、`scripts/generate_fixtures.py`、`README.md`、`docs/RELEASES.md`、`AGENTS.md`、`START_HERE.md`、`docs/revamp-v3/01_PRD.md`。
- 零改動：`src/domain/*`、`fixtures/*`、`docs/METRICS.md`、`.env*`、`vercel.json`、`src/app/*`。

## 3. 驗收命令與真實結果

| 命令 | 結果 |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | 0 warnings |
| `npm test -- --run` | **77 檔／1,509 測試全過**（新增 design-lint、copy-style、testid-baseline、backup-schema-v4） |
| `npm run lint:design`（`audit:ui`＋`contrast-check`） | exit 0；對比 22 組：通過 20、失敗 0、已知 v2 問題 2（`.nav-item:hover` 4.45 < 4.5、輸入框邊框 1.32 < 3.0；V3-1 換 token 時必須修正並移除豁免） |
| `npm run build` | pass，無 warning |
| `npm run test:e2e` | **576 項全過（16.5m）**，四尺寸，testid 屬性新增與產品改名後無任何斷言失敗 |
| 畫面基準 `baseline.spec.ts`（4 尺寸） | 4/4 通過、0 差異像素（合併後對本機 production 伺服器重跑） |
| 禁區 diff `git diff --stat 82b70df -- src/domain fixtures/golden fixtures/demo fixtures/errors fixtures/refund_only fixtures/zero_ad docs/METRICS.md` | 空 |
| testid 基準 | 刪除數 0（228 個） |

### 3a. 棘輪初始上限（`scripts/ui-audit.mjs` 實測，取代 PRD 手數的 189／201／18／21／42／23）

| 指標 | V3-0 實測＝上限 | 備註 |
|---|---|---|
| `:root` 以外相異 hex | 201 | globals.css 183、元件 CSS 10、TSX 14；token 定義區 6 |
| 相異圓角值 | 18 | |
| 相異字級值 | 32 | 不含列印樣式 26 |
| 非 0 字距 | 13 | |
| 裝飾性 `rotate(` | 1 | 例外：`@keyframes spin`、`.diagnosis-summary::before` |
| JSX 文字節點含箭頭 | 6 | |
| JSX 全大寫 eyebrow | 3 | |
| JSX 裝飾字元 | 1 | ⓘ |
| CSS `content:"▾"` | 2 | |
| `.button-row` 置中 | 1 | |
| 巢狀卡片選擇器／linear-gradient | 0／0 | |
| box-shadow | 7 | |
| JSX 文字節點含中文／元件字串常值含中文 | 15／7 | |
| labels「注意：」開頭 | 29 | 總出現 42 |
| labels 箭頭字元 | 21 | 另 2 個在技術公式（白名單） |
| labels 圈數字／裝飾字元／主層「｜」 | 8／1／32 | |
| labels 同義詞黑名單／R2 禁用詞 | 132／6 | |
| labels 驚嘆號、表情、全大寫、語氣詞、占位符問題、L1 超過 14 字 | 0 | |
| 靜態 data-testid（記錄，不設上限） | 相異 129（132 處）＋運算式 30 處＋`testId` 屬性 3 | 加本批 3 個常值後為 132 |
| 相異 class 選擇器（記錄） | 355 | |

### 3b. §2.3 B 的 v2 基準（`metrics.spec.ts`，示範資料、拒絕保存、固定時鐘）

| 指標 | 1440×1000 | 390×844 |
|---|---|---|
| 第一張 KPI 卡頂端 | 397.8 px | 1066.2 px |
| 5 張 KPI 卡底邊 | 563.6 px | 1548.9 px |
| `top-three` 第 1 列標題底邊 | 871.6 px | 1925.8 px |
| `kpi-contribution_after_marketing` 數值頂端 | 445.9 px | 1275.0 px（首屏看不到） |
| 內容前可聚焦元素數（PRD 口徑） | 13 | 13 |
| 同上以 Tab 按鍵計 | 25 | 25 |

1280×900 頂欄 113.2 px、2 列；7 頁頁首到匯入精靈步驟 1 都是 1 次點擊；含稅匯入最少 5 次點擊（淨營收 2,150.00、扣廣告後貢獻 518.05，與 `tests/fixtures/inclusive_tax/README.md` 手算相同）；First Load JS 6 個腳本 1,563,491 bytes（gzip 463,379）。

### 3c. Lighthouse 13.5.0（user-flow，示範資料已載入；1440 與 390 分數相同）

| 頁 | Accessibility | 未通過稽核 |
|---|---|---|
| 經營總覽 | 96 | color-contrast、label-content-name-mismatch（number-link 金額按鈕） |
| 通路健檢 | 97 | 同上 |
| 商品毛利 | 96 | 同上 |
| 假設試算 | 96 | 同上 |
| 會議紀錄 | 96 | 同上 |

Performance：空狀態首頁 desktop 100、mobile 94；1440 按「試試示範資料」時 CLS 0.814；390 切到健檢、會議頁 TBT 約 0.8–1.0 秒。示範資料頁沒有 0–100 的 Performance 分數（示範資料只在記憶體，重新整理即回空狀態，navigation 模式量不到；snapshot／timespan 模式不給總分），改記 TBT、CLS 與通過項數。R7 量到的 a11y 100 只是空狀態首頁；載入資料後的 96–97 才是各批要「不低於」的同頁基準。

## 4. 瀏覽器驗收與截圖

`verification/revamp-v3/V3-0/snapshots/{desktop,laptop,tablet,mobile}/01-overview-top.png … 09-data.png`（36 張，即 `toHaveScreenshot` 基準）；Lighthouse 報告 `verification/revamp-v3/V3-0/lighthouse/flow-{desktop-1440,mobile-390}.html`。README 首圖與 `public/og.png` 改由 `01-overview-top.png`（desktop）產生，側欄已顯示 EC ProfitLens。

## 5. 已知限制與風險

- 人工關卡：H1（v2 的 5 人測試與盲評）未執行、待人工，只擋 V3-10 的前後對照；H3（`copy-rewrite.csv` 審稿、紙本用語測試）材料已備妥、待人工，**擋住 V3-2**；H2 由 V3-1 產出設計稿後進行，擋住 V3-3。
- `lint:design` 沒有併入 `npm run lint`（PRD §12.1 原文寫「含 audit:ui、contrast-check」），為避免拖慢 lint 改為獨立指令；驗收命令已同步到 CLAUDE.md 與 00_README。
- 對比檢查有 2 組 v2 既有不合格（nav hover 4.45、輸入框邊框 1.32），V3-0 不改 UI，以「已知」列出不擋；V3-1 必須清零。
- Lighthouse 從 npx 快取載入（非專案依賴），新機器要先 `npx -y lighthouse@13.5.0 --version`；量測時機器負載偏高（其他代理同時執行），TBT 可能偏高，之後對照請在相近負載下重跑。
- 快照 36 張約 13 MB、Lighthouse HTML 約 6.8 MB 進 repo。
- PRD 與程式碼不符處（由 testid 代理發現，已在 `feature-retention.csv` 照實記錄）：資料來源頁的問題表沒有「資料問題 CSV」入口（只在頂欄選單與匯入步驟 4）；匯入步驟 1 有 manifest.json 範例下載（§6.5 未列，補為 D48）；主管摘要元件自己的匯出按鈕在會議頁被關閉、從不出現；`workspace-panels.tsx` 的 `Products` 元件未被 dashboard 使用（仍列入 SSR 狀態與 D51）。
- `copy-rewrite.csv` 的 `removed` 類型（9 列）是 PRD 明文要刪的版面文字（例如空狀態 eyebrow、三步驟、看板說明），不是功能；審稿時請確認。
- `feature-retention.csv` 與 `backup-schema-v4.json` 的產生腳本未進 repo（只有 E2E 定位器清單可重產）。

## 6. 下一批建議、被擋住的人工關卡、需要拍板

- **下一批 V3-1**（token、基礎元件、設計稿）：依賴 V3-0 與 D-V3-7（有利不上色）、D-V3-9（沿用深綠），兩者已依建議值，可開工；驗收 hex ≤ 60、圓角 3 種、字級 ≤ 8、字距 0、`contrast-check` 全過（含清掉 2 個 v2 豁免）、截圖對照 v2 只有樣式差異；產出總覽、抽屜、會議三頁靜態設計稿交 H2。
- **請你處理的人工項目**：(1) H3：審 `docs/revamp-v3/copy-rewrite.csv`（可用 Excel 開，UTF-8 BOM），優先看下列 20 列：`rules.REFUND_BURDEN_UP.title`、`rules.MARKETING_BURDEN_UP.title`、`rules.NEGATIVE_CHANNEL_CM.title`、`rules.SKU_NEGATIVE_GP.title`、`ui.dashboard.scopeNote`、`autoSave.promptTitle`（與 §8.3 #27 矛盾，請擇一）、`autoSave.promptBody`、`ui.workspaceStorage.consent`、`meetingRecord.agenda.*`（序號改由 `<ol>` 產生）、`emptyState.steps.0–2`（判為刪除）、`actionBoard.boardIntro`（判為刪除）、`ui.actionsWorkbench.intro`、`ui.productComparisonPanel.descending`、`metrics.contribution_before_marketing.plain`（超過 L2 30 字）、`relaunch.ogHeadline`（需改成獨立字串）、`importErrors.MISSING_KEY`（`{field}` → `{column}`）、`importErrors.MISSING_CHANNEL_COST_DAY`／`MISSING_AD_DAY`（無檔名可帶）、`ui.decisionWorkbench.volumeHelp` 等四個 help、`ui.decisionWorkbench.compareTableCaption`、`ui.workspaceStorage.backupContents`／`sections.rankingAmount`；並做 `term-test-paper.md` 的紙本用語測試（D-V3-2、D-V3-14）。(2) H1：依 `usability-test.md` 招募 5 位受試者與 3 位盲評者（只擋 V3-10 前後對照，不擋 V3-1）。(3) 檢視 `CLAUDE.md` 的 v3 版本（變更：標題與產品名稱段、本輪目標、先讀什麼、硬規則新增人工關卡／拍板／禁區 diff 基準／呈現層格式化／棘輪與基準／依賴為空、驗收命令新增 `audit:ui`、`contrast-check` 與禁區 diff、回報格式、檔案地圖加 v3 欄與 11 列）。
- **需要拍板**：無新增；D-V3-1–25 已定。`lint:design` 獨立於 `lint` 若不同意，V3-1 可改回併入。
