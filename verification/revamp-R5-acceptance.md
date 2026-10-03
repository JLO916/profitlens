# Revamp v2 — R5 健檢、試算、行動的決策化 驗收紀錄

- 日期：2026-10-03（Asia/Taipei）
- 分支：`revamp/v2`，基於 R4 `21b330d`（R5 錨點 `17cb325`）
- 規格：`docs/revamp/06_BATCHES.md` R5-1～R5-6、`05_FEATURES.md §7–§9`、`02_IA_LAYOUT.md §4–§7`
- 財務核心：`git diff --stat 21b330d -- src/domain fixtures docs/METRICS.md package.json package-lock.json` 為空；情境引擎輸入仍是相對值；Golden 情境答案（DTC 284.00／264.00、MARKETPLACE 19.70、零變動 270.00）不變。
- 決策：見 `docs/DECISIONS.md`（2026-10-03 R5）。
- 執行方式：四個獨立 worktree 代理平行實作（健檢／試算應用層／行動／商品）→ 合併 → 試算 UI 代理 → 五個代理平行重寫 E2E（共用 3100 正式伺服器）→ 四視角對抗式審查（每項 3 位反駁者）→ 修正 → 全套驗收。

## 1. 任務對照
| 任務 | 狀態 | 做法與證據 |
|---|---|---|
| R5-1 `DiagnosisGroup` 結構與排序；健檢頁清單化；通路寬表置頂；預設展開前三列；AI 區塊底部 | 完成 | 新 `src/application/diagnosis-group.ts`（`diagnosisGroups()`：同規則合計＋各通路合併為一列，primary＝合計；impact＝對貢獻影響；排序 missing 置頂 → \|impact\| → 規則碼；門檻套用於 \|impact\|）；新 `src/components/diagnosis-list.tsx`（`<ol data-testid="diagnosis-list">` 內每列 `<details data-testid="diagnosis-row-<code>">`，前三列 open；summary＝標題＋scope 標籤＋影響金額；展開：看證據／加入待辦、scope 切換、數據、可能原因、下一步、注意、技術細節）；`buildManagerSummary` 的 groups／priorities 改用同一套排序（Markdown、列印、TopThree 一致）；[tests/diagnosis-group.test.ts](../tests/diagnosis-group.test.ts)、[tests/diagnosis-list.test.ts](../tests/diagnosis-list.test.ts) |
| R5-2 三件事改用同一 group 結構；標題模板 | 完成 | `top-three.tsx` 改讀 `diagnosisGroups().priorities`；testid `top-three`／`overview-priority-<code>`、門檻表單保留；標題沿用 R2 `ruleCopy` 模板 |
| R5-3 試算頁流程：進頁即表單、通路單選預設第一個、範本、絕對值、版本號只在計算時遞增、固定假設收合 | 完成 | 新 `src/application/scenario-presets.ts`（六個範本、`applyPreset`、`absoluteContext`／`absoluteAvailability`／`absoluteToRelative`／`relativeToAbsolute`／`rangeHint`）；`multi-scenario-workbench.tsx`／`decision-workbench.tsx` 重寫：`scenario-channel` 單選只改本頁、方案 1 本地草稿（第一次編輯才寫入工作區）、`scenario-preset` 選單＋「只是起點」、`scenario-mode-<field>` 相對／絕對切換＋等值顯示＋界限提示、`scenario-assumptions` 收合、`scenario-version`／`scenario-draft`；`updateScenarioContext` 版本號規則；[tests/scenario-presets.test.ts](../tests/scenario-presets.test.ts)、[tests/scenario-absolute-mode.test.ts](../tests/scenario-absolute-mode.test.ts)、[tests/scenario-form.test.tsx](../tests/scenario-form.test.tsx) |
| R5-4 敏感度三組輸入納入 scenario state、決策匯出與備份 | 完成 | `ScenarioPlan.sensitivity?: { volumes: [a, b, c] }`；`scenario-sensitivity.tsx` 受控；JSON／CSV（`scenario_sensitivity_input`／`scenario_sensitivity_result` 列）／Markdown 小表；備份 v4 欄位加法（還原時驗形狀）；[tests/scenario-sensitivity-backup.test.ts](../tests/scenario-sensitivity-backup.test.ts)、`v2-scenario-workspace`／`v2-decision-export` 更新 |
| R5-5 行動看板（四欄＋按鈕改狀態）、表單修正 | 完成 | `actions-workbench.tsx`：看板／清單切換（`actions-view-board`／`actions-view-list`，偏好記在備份 `ui_prefs.view`）、四欄 `board-column-<status>`、卡片 `board-card-<n>` 與移動按鈕 `board-card-<n>-move-<status>`、共用 `ActionEditor`（期限 date、負責人 datalist、證據 checkbox 清單含搜尋、狀態 select 高度）；`action-workspace.ts` 加 `status_updated_at`、`knownOwners`、`boardColumns`；[tests/action-board.test.ts](../tests/action-board.test.ts) |
| R5-6 商品毛利頁 Top／Bottom 10、欄位重排、毛利率欄、資料狀態 | 完成 | 新 `src/application/product-highlights.ts`（`productHighlights`、`dataStatus`）；`product-comparison-panel.tsx`：`product-worst`／`product-best` 小表、全表欄位重排（通路·SKU·品類·本期件數·本期淨營收·本期毛利·毛利率·毛利差額·淨營收差額·上期淨營收·上期毛利·資料狀態）、`product-more-columns` 切換、一句說明；[tests/product-highlights.test.ts](../tests/product-highlights.test.ts) |

## 2. 新增／主要修改檔案
- 新增：`src/application/{diagnosis-group,scenario-presets,product-highlights}.ts`、`src/components/diagnosis-list.tsx`、`tests/{diagnosis-group,diagnosis-list,scenario-presets,scenario-absolute-mode,scenario-sensitivity-backup,action-board,product-highlights}.test.ts`、`tests/scenario-form.test.tsx`、`tests/e2e/revamp-r5.spec.ts`、`verification/revamp-R5-capture*`、`verification/revamp-R5/`
- 修改：`src/application/{manager-summary,scenario-workspace,decision,decision-export,workspace-backup,action-workspace}.ts`、`src/components/{workspace-panels,top-three,manager-summary,multi-scenario-workbench,decision-workbench,scenario-sensitivity,actions-workbench,product-comparison-panel,dashboard}.tsx`、`src/i18n/labels.zh-TW.ts`（`diagnosisList`／`scenarioPresets`／`scenarioForm`／`actionBoard`／`productHighlights` 五個區塊）、`src/app/globals.css`（R5 錨點）、`docs/{SCENARIOS,DECISIONS,STATUS}.md`、`docs/revamp/09_DECISIONS_PENDING.md`（D6）、`tests/e2e/*`（流程改寫，見 §3）
- 刪除：無

## 3. 驗收命令與真實結果
| 命令 | 結果 |
|---|---|
| `npm run typecheck` | 通過（`✓ Types generated successfully`，無錯誤） |
| `npm run lint` | 通過（`eslint . --max-warnings=0`，0 warnings；注意 worktree 內的 `.next/types` 會被 eslint 掃到，合併後刪除 worktree 才乾淨） |
| `npm test -- --run` | **65 檔／1,207 測試全過**（新增 diagnosis-group 28、diagnosis-list、scenario-presets、scenario-absolute-mode、scenario-sensitivity-backup、scenario-form、action-board、product-highlights；既有測試改引用 labels） |
| `npm run build` | `✓ Compiled successfully`，無 warning |
| `npm run test:e2e`（四尺寸） | **520 項：516 過／4 失敗**（同一個測試 `manager-summary.spec.ts:100` PL09 列印 × 四尺寸：測試側的三件事金額比對式沒跟上審查修正後的「｜對貢獻影響 -315.00」格式）→ 改比對式後單獨重跑 **12/12**；之後沒有再改產品碼。合併前的 inventory 全套 20 項失敗全為舊版面 selector，已由五個代理改寫（每份 spec 四尺寸全過，見 §4） |
| `verification/revamp-R5-capture.config.ts` | 4/4（四尺寸各四個畫面，32 檔） |
| 財務核心 | `git diff --stat 21b330d -- src/domain fixtures docs/METRICS.md package.json package-lock.json` 為空；Golden 情境答案（270.00／284.00／264.00／19.70）在單元與 E2E 皆重現 |
| 未執行 | Live AI、真實資料、Safari／Firefox、實體裝置 |

E2E 改寫明細（S1–S4 代理，各自四尺寸全過）：`revamp-r1-layout`（6）、`revamp-r2-copy`（4）、`manager-presentation`（4）、`workspace`（15）、`manager-summary`（3）、`action-workspace`（5，含新案例「看板用按鈕改狀態」）、`ai`（17）、`workspace-storage`（4）、`scenarios`（16，含新案例「全站範圍 A→B→A 回預設通路」）、`scenario-sensitivity`（3）、`review-v2-a`（4）、`review-v2-a-export`（1）、`m6-acceptance`（3）、`product-comparison`（4，含 390px 小表捲動）、新 `revamp-r5`（5：試算 ≤ 2 次點擊到表單＋範本＋草稿／版本＋絕對值＋通路只改本頁；健檢列展開；加入待辦 1 次點擊到看板；看板改狀態；商品 Top／Bottom）。長流程案例把單案上限放寬到 90／120 秒（平行代理共用伺服器時負載過高），斷言沒有放寬。

## 4. 瀏覽器驗收與截圖
`verification/revamp-R5/`（四尺寸 1440×1000／1280×900／768×1024／390×844，各有 `-viewport.png` 與 `-full.jpg`，共 32 檔）：
- `1-diagnosis-list-*`：golden 健檢頁——通路寬表置頂、健檢結果 6 列（REV_UP_CM_DOWN −315.00 … NEGATIVE_CHANNEL_CM −15.00）、前三列展開、合計／通路標籤、展開內容第一行的看證據／加入待辦；390px 標籤換行不溢出。
- `2-scenario-form-*`：golden 試算頁——通路單選、套用「雙 11 檔期」範本後（兩步：選範本 → 套用）、銷量與廣告切到絕對值（6 件 → ＝ 相對 +50.0%、540 元 → ＝ 相對 +100.0%）、折扣相對模式顯示「＝ 新折扣率 17.8%」、草稿徽章。
- `3-action-board-*`：demo 從健檢加入兩張待辦後的看板，第 1 張移到「進行中」（狀態更新於 2026-10-03）、`role=status` 通知；390px 單欄。
- `4-products-top-bottom-*`：golden 商品頁兩張小表（最差：MARKETPLACE/B 125.00、DTC/B 200.00、MARKETPLACE/A 280.00、DTC/A 540.00；增加最多：DTC/A +40.00、MARKETPLACE/A +10.00）與全表新欄序。
- 主流程另以 Playwright 在 1440 寬對示範資料四頁全頁截圖人工檢視（scratchpad），發現看板展開編輯時表單擠在單欄 → 已以 CSS 讓該欄佔兩格。

## 4b. 對抗式審查（4 視角 → 每項 3 位反駁者，≥ 2 位不反駁才算確認）
32 項候選、29 項確認（含跨視角重複：狀態日期 UTC × 4、絕對值精度 × 3、切換清空 × 2、summary 互動 × 2）、3 項被反駁。確認項處理：
| 確認項 | 處理 |
|---|---|
| 試算頁改成頁內選通路後，決策匯出的「目前」區段仍依全站篩選挑 context：預設全通路時主段落沒有方案，全站單通路與頁內通路不同時則挑錯通路（中） | 已修：`exportWorkspaceDecision` 加 `selectedContextId`，試算頁以 `onContextChange` 回報正在編輯的 context（dashboard `scenarioFocus`），主段優先用它；測試補全站全通路＋DTC context |
| 行動 `status_updated_at` 用 UTC 日期，臺北 00:00–07:59 記成前一天（中／低，四個視角各一筆） | 已修：預設改臺北日曆日 `taipeiToday()`（Intl `Asia/Taipei`）；`tests/action-board.test.ts` 改預期並加換日／閏日邊界；E2E 的日期斷言同步；DECISIONS 更新 |
| 絕對值換算先取 4 位小數才送引擎，件數／預算對不回輸入（中／低，三筆） | 已修：相對值保留 12 位小數（去尾零、超過 100 字不寫入）；等值文字直接取精確值一位小數；測試：廣告費 500.00／123.45／810.00／3,123,456.78 等回到分位、件數 6 件 → G′/C′＝本期 × 1.5、往返不出現「約」 |
| 切到「絕對值」清空相對值並把方案打回草稿，切回不復原（中，兩筆） | 已修：切換模式不改 inputs、不清結果；絕對值框預填反推原值（`relativeToAbsoluteValue`），只有真的修改才寫回；非整數件數顯示提示 |
| 敏感度 CSV 在 reason_codes 欄放狀態字（valid／draft／unfilled），與其他列只放原因碼的語意不一致（低） | 已修：狀態改放 `status` 欄，`reason_codes` 只放大寫原因碼（valid → []、草稿 → UNCOMPUTED_DRAFT） |
| docs/SCENARIOS.md 末段仍寫「編輯撤下結果及增加修訂」「敏感度三組輸入仍不保存」，與 R5 的行為和同檔前段矛盾（低） | 已修：第 74／76 行改為「編輯只撤下結果、不增加修訂」與「敏感度隨方案保存」 |
| 健檢列 `<summary>` 內放可點的金額按鈕（巢狀互動元件；中＋低） | 已修：summary 只放標題、範圍標籤與純文字金額；可點的 ImpactAmount 移到展開內容第一行；testid 不變 |
| 「套用範本」select 一觸發 onChange 就套用，按方向鍵會直接覆寫五格輸入，鍵盤選不到其他範本（中） | 已修：改兩步（選範本 → 按「套用範本」），未選時 disabled；五格有值時提示「會覆寫目前的假設」；E2E 三處同步 |
| 主管摘要三件事改顯示「對貢獻影響」，但沒有標籤，旁邊仍寫「依實際差額排序」，數字和說明對不上（中） | 已修：螢幕與列印都加「對貢獻影響」標籤；`rankingNote` 改「依對貢獻影響排序；負＝對貢獻不利」；加測試 |
| 切換看板／清單檢視會把工作區標成「未保存」，連帶觸發離開頁面確認與換資料確認（低） | 已修：`onViewChange` 不再 `markChanged`（與 `last_preset` 一致，下一次保存寫入） |
| 相對／絕對切換鈕字級 11px，低於 12px 下限（低） | 已修：12px，padding 4px 8px |
| copy-density 測試把預設展開的健檢列整段排除，主層文案守門實際失效（低） | 已修：只移除沒有 `open` 的 `<details>`（巢狀配對）；實測總覽 1／健檢 0／試算 1 句 |
| （待確認）長 SKU 範圍標籤設了 nowrap，390px 可能撐出整頁水平捲動（低） | 已修：`.scope-tag`／`.scope-chip` 改 `white-space: normal; overflow-wrap: anywhere; max-width: 100%` |
| 通路單選的預設值與 02 §6「預設第一個通路」不同，DECISIONS 也沒記（低） | 記於 DECISIONS（跟著全站單一通路，否則第一個通路） |
| 健檢列的「技術細節」缺 02 §4 要的「快照版本」，只顯示 metric_version（低） | 已修：技術細節加 dataset_hash／filter_hash |
| R5 新增的兩個 demo 測試在高負載下超過 vitest 預設 5 秒逾時，跑全套可能不穩定（待確認）（低） | 已修：兩個重 it.each 加 30_000 timeout |
| 絕對值模式把「新折扣率 0%」換算成引擎拒收的相對值，且提示自相矛盾（中） | 已修：折扣換算改用 baseline 精確 D、G，取位後往可行側修正；`rangeHint` 與引擎同一判斷；golden 兩通路 0% 皆 valid、discounts 0.00 |
| 草稿方案沿用上一個已計算版本號，匯出的 (plan_id, plan_revision) 和 calculated_versions／會議引用指到不同假設（低） | 已修：JSON `plan_revisions` 只列已計算方案並加 `draft_plan_ids`；CSV 草稿列 `plan_revision` 留空 |
| scenario_sensitivity_result 的 reason_codes 塞了小寫狀態字，與同檔其他列的契約不一致（低） | 併入上列「敏感度 CSV」項 |
| v1–v3 備份 schema 被放寬：舊版信封也接受 R5 才有的欄位（低） | 已修：`sensitivity`／`status_updated_at` 只在 v4 信封接受（`scenarioV4`／`savedActionV4`…）；v3 帶這兩欄 → INVALID_WORKSPACE_FORMAT 測試 |
| 「本期毛利最差 10 個」會列入本期沒有銷售（毛利 0.00）的僅上期商品（待確認）（低） | 維持規格行為；`worstNote` 補「本期沒有銷售的商品以 0 計入」；記於 DECISIONS |
| 新測試在預設 5 秒逾時內反覆呼叫 buildManagerSummary，負載下會失敗；摘要物件也因 diagnosis 重複 facts 而變大（低） | 已修：兩個重 it.each 加 30_000 timeout |
| 【反駁 3 項】試算表單金額沒有公式與來源（等值文字是換算提示，本期件數／廣告費在基準區可開）；健檢列範圍切換 group 名稱相同（各列已在 details 內，aria 可區分）；「最差 10 個」列入本期沒賣的商品（規格允許，改以註記說明） | 不改 |
| 【E2E 代理發現的產品 bug】試算頁自選通路在全站範圍 A→B→A 時復活 | 已修：`choiceScope` derived state，範圍改變即回預設通路；`scenarios.spec.ts` 的失敗測試轉為通過、單元測試可抓到 |
| 【主流程瀏覽器實測】看板展開編輯時表單擠在單欄 | 已修（CSS）：展開那欄 `grid-column: span 2`；≤640px 單欄不受影響 |
| 【R2 語言一致】從健檢「加入待辦」的卡片問題欄用 domain 舊標題 | 已修：`addActionDraft` 加 `overrides`，dashboard 傳 R2 `ruleCopy` 的標題與下一步 |

## 5. 已知限制與風險
- 健檢群組金額改為合計列的對貢獻影響（05 §7），與 R1「取成員中最大金額」不同；示範資料順序不變、golden 不變。
- 絕對值輸入只存在本頁（送進方案的是換算後的相對值，4 位小數）；重新載入後以相對值顯示、等值文字反推。
- 版本號只與最新版本比：改回舊輸入再計算會開新版本號。
- 行動的 `status_updated_at` 預設 UTC 日期（R6 可改傳臺北日期）。
- 看板用按鈕改狀態，不做拖曳；展開編輯在看板上。
- 商品 Top／Bottom 小表看整個分析範圍，不跟隨下方篩選；「毛利率」不提供排序（避免 CSV 的 sort 欄寫入 domain 沒有的值）。
- 真實資料、Live AI、Safari／Firefox、實體裝置：**未執行**。

## 6. 下一批建議與待拍板
見批次回報。
