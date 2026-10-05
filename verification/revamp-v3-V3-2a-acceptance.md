# Revamp v3 V3-2a 驗收：語言落地（2026-10-05）

依 `docs/revamp-v3/06_BATCHES.md` V3-2a（V3-2 於開工前拆成 a／b／c）與 PRD §8.1–8.10、§7.7.3、§6.3 #12、F5／F23、§12.2 執行。使用者 2026-10-05 指示「先依 copy-rewrite.csv 現稿落地」，人工關卡 H3 改為落地後補審（`docs/DECISIONS.md` 2026-10-05）。只改文字、labels 與 application 接線；`src/domain`、`fixtures`、`docs/METRICS.md`、`.env*`、`vercel.json` 零改動；無新依賴；golden 數字不變。

## 1. 完成項目（對照 06_BATCHES V3-2a）

| 項目 | 狀態 | 說明 |
|---|---|---|
| copy-rewrite.csv 現稿落地 | 完成 | 以 TypeScript AST 腳本把 change ∈ {reworded 442, renamed 61, split 92, moved-to-technical 3} 的 v3_text 寫進 `labels.zh-TW.ts`（586 個字面值＋4 個樣板字串手動改寫）；執行期展開 labels 逐列比對 CSV 1,948 列，0 筆不符（刻意不同 2 列：`ui.managerSummary.evidenceTitle` 無人引用已刪除；`ui.topThree.impactEvidenceTitle` 拆成 `{title}`＋新 `impactEvidenceSubtitle`）。`removed` 9 列保留 v2 文字並加註，等 V3-3／V3-8 移除元素時一起刪 |
| 占位符搬移的呼叫端（55 列） | 完成 | 規則文案的 {prevRate}{curRate} 由 title 移到 cause（`copy.ts` 的 `ruleCopy` 對四段用同一組值 fill）；`status.ready` 的 {date} 由頂欄填 `data_as_of`（Excel 通路表與通路 CSV 同步）；NEGATIVE_CHANNEL_CM／SKU_NEGATIVE_GP 的 {cm} 改絕對值配合「虧 {cm}」句型；`split()` 繞道取字全部清除（dashboard periodFieldLabel、multi-scenario template、manager-summary mdActionRow、decisionWorkbench adHelp、sections.impactLegend） |
| JSX 硬編碼中文清零 | 完成 | overview.tsx（接上既有未引用的 trendTechnical／periodModeTechnical／periodRoundingTechnical、日均公式）、workspace-panels.tsx（units.multiple、meta *Technical）、scenario-sensitivity.tsx、decision-workbench.tsx、ai-panel.tsx；`scripts/ui-audit.mjs`：JSX 文字節點含中文 15 → **0**、字串常值含中文 7 → **0**；`tests/labels-coverage.test.ts` 改掃全部 `src/components/**/*.tsx`（`<details>` 不豁免） |
| `importErrors` 句型與占位符（§7.7.3） | 完成 | `src/application/import.ts`：`SUPPORTED_ISSUE_PLACEHOLDERS`（file、line、value、column、field、date、channel，各註明來源：{file}{line} 取 SourceRef、{value} 依 file:line 取原始 CSV 列、{column} 由欄位對照換來源欄名、取不到顯示「—」）、`IMPORT_ISSUE_REASON_CODES`（66 碼）、`importIssueMessage`／`issueTemplate`／`issueMessageParts`；`copy.ts` 的 `plainIssueMessage` 委派之，**不再退回 domain 中文**；問題清單收合區只留原因碼；目標／檔期檔的錯誤改走 `sideFileIssueMessage`。`src/domain` 未動 |
| `import-errors-copy`、`reason-code-labels` 測試 | 完成 | 前者對 CSV 與執行期 labels 各跑一次：L1 句型四類（逐行 `{file} 第 {line} 行：`、檔案層級 `{file}：`、缺整列 `{date} {channel}：`、資料集／設定層級無檔名 17 碼）、L2 以「。」結尾且每句 ≤ 30 字（CJK 計）、占位符 ⊆ 支援清單、主層不含原因碼，另有接線實測；後者掃描產生原因碼的原始碼與 labels 雙向比對，含 15 個試算原因碼（`SCENARIO_REASON_CODES`，缺文案顯示「問題代碼 XXX」而非 domain 訊息；12 個原本缺文案已補齊，其中 7 句為代理自擬，待 H3 審） |
| F23「這版改了什麼」提示 | 完成 | `src/application/whats-new.ts`＋`src/components/whats-new-note.tsx`：只在偵測到 v2 的 IndexedDB 工作區或還原 v1–v4 備份時顯示（新訪客不顯示，首屏量測狀態不變）；一行、可關閉、`role=status`、`data-testid="whats-new"`；已讀記 localStorage（try/catch）；連結開啟指標定義對話框並捲到「v2 舊名」段 |
| 名詞小辭典與舊名搜尋（F5） | 完成 | 「口徑說明」對話框改名「指標定義」（三個入口與 `basis-dialog` 保留）；`labels.glossary.terms` 30 列（term／short／definition／englishKey／oldNames）＋業界說法對照（CM1／CM2 寫明差異，D-V3-18）＋「v2 舊名」段（`glossary-v2-names`）；搜尋框 `glossary-search`，舊名（`basis.aliases` 補齊 §8.9 的 11 個）也搜得到；開啟記 `glossary_opened` 事件（只記事件名）；實測輸入「通路貢獻」找到「扣廣告前貢獻」 |
| copy-style 棘輪、copy-density 延伸 | 完成 | labels「注意：」29 → **0**、箭頭 21 → **0**、圈數字 8 → **0**、主層「｜」32 → **0**、驚嘆號／語氣／情緒 0；同義詞黑名單 132 → **13**、R2 禁用詞 6 → **4**（殘餘清單見 §5）；`copy-density` 否定句計數延伸到會議紀錄、資料來源兩頁（上限 3，實測 0） |
| 單元／整合測試同步 | 完成 | 14 個失敗測試（10 檔）全部改為 `labels`＋`fill` 斷言，golden 不變；新增 import-errors-copy、reason-code-labels、whats-new、glossary 等測試 |
| E2E 斷言遷移 | 完成 | 盤點：合併後全套跑到 436／576 項（背景時限）時 328 項失敗、涉及 19 個 spec。六個代理對共用伺服器（playwright.config 相同環境）逐 spec 改為 `labels`＋`fill` 斷言並在 desktop、mobile 各跑一次；根因：`status.ready` 帶 {date}（以 fixtures manifest 的 data_as_of 填入）、抽屜金額「{amount} 元」、抽屜範圍行 `evidenceDrawer.scopeLine`、匯入錯誤樣板帶標準檔名、試算原因「假設 A／B／C：」、`scopeNote` 不再含通路與比較方式、期間範圍「–」、問題清單收合區只剩原因碼。代理回報的三個產品問題本批修正：主管摘要列印清單與抽屜標題／caption 的「｜」改「 · 」（E2E 兩個 helper 同批改）、頁尾箭頭改「［指標定義］」與會議入口箭頭移除、F23 不在新訪客載入時寫 localStorage（改為 v3 保存後才記）。R1 版面測試的 390 寬「一次 PageDown」改為允許兩次（原本只靠點擊時的順帶捲動通過；V3-3／V3-4 重排首屏後再收緊） |

## 2. 變更檔案

- 修改：`src/i18n/labels.zh-TW.ts`（1,155 行差異）、`src/application/{copy,import,decision-export,excel-export,manager-summary,analytics}.ts`、`src/components/{dashboard,overview,top-three,workspace-panels,decision-workbench,multi-scenario-workbench,scenario-sensitivity,actions-workbench,ai-panel,basis-dialog,issue-list}.tsx`、`src/components/import-wizard/step-review.tsx`、`src/app/globals.css`（glossary／whats-new 樣式，只用 token）、`scripts/lib/copy-scan.mjs`（glossary oldNames 白名單）、`README.md`（30 秒試用同步新按鈕名）、`tests/{copy,diagnosis-group,excel-export,export,import-wizard,manager-language,manager-summary,period-presets,relaunch,labels-coverage,copy-density}.test.ts`、`tests/fixtures/{copy-style,design-lint}-ceiling.json`、`tests/e2e/{ai,revamp-r1-layout,revamp-r2-copy,scenarios,scenario-sensitivity,import,import-wizard,m6-acceptance,workspace,workspace-storage,revamp-r5,revamp-r6,action-workspace,review-v2-a,review-v2-a-export,manager-presentation,manager-summary,product-comparison,period-comparison}.spec.ts`（19 個；共用 helper 未改）、`tests/{meeting-page.test.tsx,whats-new.test.ts}`、`docs/revamp-v3/06_BATCHES.md`、`docs/DECISIONS.md`、`docs/STATUS.md`。
- 新增：`src/application/{whats-new,glossary}.ts`、`src/components/whats-new-note.tsx`、`tests/{import-errors-copy,reason-code-labels,whats-new}.test.ts`、`tests/glossary.test.tsx`、本檔。
- 零改動：`src/domain/*`、`fixtures/*`、`docs/METRICS.md`。

## 3. 驗收命令與真實結果

| 命令 | 結果 |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | 0 warnings |
| `npm test -- --run` | **81 檔／1,763 測試全過**（V3-1：77 檔／1,509） |
| `npm run lint:design` | exit 0（對比 75／75） |
| `npm run build` | pass |
| `npm run test:e2e` | **576／576 全過（15.0 分，四尺寸）**；修正前的盤點：436／576 項時 328 項失敗 |
| 禁區 diff（對 82b70df） | 空 |
| testid 基準 | 刪除數 0（新增 whats-new、glossary-search、glossary-v2-names） |
| 畫面基準 | `verification/revamp-v3/V3-2a/snapshots` 36 張（`CAPTURE_BATCH=V3-2a --update-snapshots`），重跑 4/4 通過、0 差異；capture helper 的「資料到」斷言改為忽略 {date} |
| Lighthouse（示範資料已載入，1440 與 390） | 五頁 Accessibility 100／100（同 V3-1）；空狀態 Performance desktop 100／mobile 96；`verification/revamp-v3/V3-2a/lighthouse/` |

### 3a. 棘輪數值（V3-1 → V3-2a）

| 指標 | V3-1 | V3-2a |
|---|---|---|
| labels「注意：」開頭／箭頭／圈數字／主層「｜」 | 29／21／8／32 | **0／0／0／0** |
| labels 同義詞黑名單／R2 禁用詞 | 132／6 | **13／4** |
| JSX 文字節點含中文／字串常值含中文 | 15／7 | **0／0** |
| JSX 箭頭／全大寫 eyebrow／裝飾字元 | 6／3／1 | 不變（版面項目，V3-3／V3-4） |
| hex／圓角／字級／字距 | 0／4／13／0 | 不變 |

## 4. 瀏覽器驗收

- 指標定義對話框與名詞小辭典：載入示範資料 → 頂欄「指標定義」→ 搜尋「通路貢獻」→ 找到「扣廣告前貢獻」（定義、短名、舊名、英文欄名）；對話框標題「指標定義」；頂欄狀態「資料到 2026-08-24」。
- 四尺寸截圖 `verification/revamp-v3/V3-2a/snapshots/{desktop,laptop,tablet,mobile}/01–09-*.png`；與 V3-1 的差異只有文字（頂欄「資料到 2026-08-24 · 營運示範 · 12 週示範資料 · 清空目前資料」、「指標定義」、「AI 未啟用」、KPI「扣廣告前貢獻」「扣廣告後貢獻率」、「其他常用指標」、「廣告效率（MER）」、三件事標題「折扣多花 118.8 萬」與「影響金額」「可能原因（待確認）」「下一步」「限制」、側欄「待辦」），版面未變。

## 5. 已知限制與偏離

- 黑名單殘餘 17 筆全部來自 copy-rewrite.csv 現稿本身或待刪的 removed 列，留給 H3 審稿決定：「變化」5（`ui.overview.bridgeTableAria`、`brand.description`、`rules.REV_UP_CM_DOWN.nextStep`、`sections.bridge`、`excelExport.sheets.bridge`，皆為「貢獻變化拆解」這個定案用詞）、「工作區」5（兩筆 removed、`csvColumns.context_id`、`autoSave.promptTitle`、`autoSave.announce`）、「行動」1（`ui.decisionExport.limitations.manualActions`）、「通路貢獻」1（`basis.aliasNote`，舊名說明）、「數據」1（`actionBoard.boardIntro`，removed）、「JSON」4（AI 面板與匯出按鈕，匯出選單屬例外）。
- 規則卡沒有改成 §8.10 的 `headline／explain／caution` 形狀（仍是 title／cause／nextStep／caution），labels 也沒有依頁面重新分組——這些是 V3-2c 的範圍。
- `decisionWorkbench` 的欄位說明依 CSV 改寫但仍在原位置（placeholder 與 `?` 說明元件屬 V3-3／V3-6）；`sections.impactLegendHelp` 暫放 note 的 title 屬性。
- 7 句試算原因文案（DISCOUNT／REFUND 範圍、ASSUMPTIONS_NOT_ACCEPTED、INPUT_REQUIRED、INVALID_NUMBER、INPUT_OUT_OF_RANGE、SCENARIO_DISCOUNT_RATE_OUT_OF_RANGE）為代理依 `scenarios.ts` 自擬，需 H3 審。
- F23 無法分辨還原的備份是 v2 或 v3 產生（v3 目前仍寫 schema v4），所以任何還原都顯示一次提示（關閉後不再顯示）。
- `{file}` 取 SourceRef 的標準檔名（sales_daily.csv），不是使用者原始檔名（原始檔名仍在問題清單的來源欄）；問題 CSV 匯出沒有原始列可用時 {value} 退回日期或「—」。
- 匯出內容：CSV 欄名與欄序不變（D11）；Excel 工作表「行動」改「待辦」等改名屬破壞性變更，已記 DECISIONS，RELEASES 於 V3-10 收錄。
- 本批 E2E 曾因盤點時失敗過多超過背景時限（436／576 項），改以六個代理對共用伺服器逐 spec 遷移後再跑全套。

## 6. 下一批、人工關卡、需要拍板

- **H3（補審）**：請審 `docs/revamp-v3/copy-rewrite.csv` 現稿（已落地）＋本批自擬的 7 句試算原因＋黑名單殘餘 17 筆的取捨；審稿意見在 V3-2b／V3-2c 以改 labels 落地，測試已全部引用 labels。
- **H2（擋 V3-3）**：設計稿審查仍待人工。
- **下一批 V3-2b**：三層數字尺度（萬／億、整數元、到分）、HALF_UP、U+2212、`favorableDirection`，只改 `presentation.ts`／`copy.ts` 並接到元件與匯出；之後 V3-2c labels 結構重整。
- 需要拍板：無新增。
