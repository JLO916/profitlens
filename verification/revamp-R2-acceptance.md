# Revamp v2 — R2 語言與文案層 驗收紀錄

- 日期：2026-10-02（Asia/Taipei）
- 分支：`revamp/v2`，基於 R1 `ddf21ef`
- 規格：`docs/revamp/06_BATCHES.md` R2-1～R2-10、`03_GLOSSARY_COPY.md` 全文、`02_IA_LAYOUT.md §10`
- 財務核心：`src/domain/*`、`fixtures/*`、`docs/METRICS.md`、`docs/DATA_CONTRACT.md`、`package*.json` 零改動；`metric_version` 仍為 `contribution-v1`。
- 決策：D1＝A（扣廣告後貢獻）、D11＝A（CSV 標題「中文 (key)」）依建議值執行；示範通路 alias 只對示範資料集生效。三者記於 `docs/DECISIONS.md`。

## 1. 任務對照
| 任務 | 狀態 | 做法與證據 |
|---|---|---|
| R2-1 `metricDefinitions` 接 labels | 完成 | `src/application/presentation.ts`：`label`／`formula` 讀 `labels.metrics`，新增 `shortLabel`／`plain`／`formulaTechnical`；AI facts 文字與 `src/ai/grounding.ts` 跟著換新名；13 個引用點由 tsc 與單元測試覆蓋 |
| R2-2 導覽／標題／按鈕／狀態／說明接 labels | 完成 | 30 個元件與應用層檔案由盤點（31 檔、約 1,100 條字串）→ `labels.ui.<元件>.*`（約 800 鍵）＋既有 `nav`／`sections`／`buttons`／`status`／`periods` 等；主層 JSX 不再有中文字面值（`tests/labels-coverage.test.ts` 把關） |
| R2-3 規則卡文案 | 完成 | `ruleCopy()`（`src/application/copy.ts`）用 `labels.rules` 模板＋規則引用的事實填占位符；標題金額 `formatHeadlineAmount()`（≥ 10,000 元顯示 x.x 萬，否則整數元）；`src/domain/rules.ts` 不改；健檢卡、三件事、會議摘要共用 |
| R2-4 口徑說明對話框 | 完成 | `src/components/basis-dialog.tsx`（`labels.basis` 九條＋別名註記）；頂欄 ⓘ 與頁尾開啟；Esc 關閉後回到開啟按鈕 |
| R2-5 免責集中 | 完成 | 每區塊最多一句「注意：…」，其餘進技術細節或口徑說明；頁尾統一一句 `labels.basis.footer`；`tests/copy-density.test.ts`（總覽／健檢／試算主層去重後各 ≤ 3 句，規則卡「注意」句不計） |
| R2-6 公式抽屜中文階梯 | 完成 | `evidence-drawer.tsx` 重寫：四層階梯（含比率的分子÷分母）、技術細節收合（技術公式、原值、原因碼、metric_version）、來源依檔案分頁（銷售／通路費用／廣告／資料集設定）＋日期／通路／商品搜尋＋每頁 50 筆 |
| R2-7 示範通路 alias | 完成（範圍縮窄） | `channelLabel`／`demoAlias`：只有 `dataset_id` 以 `synthetic-demo` 開頭才顯示「官網 · DTC／平台 · MARKETPLACE」；通路選單、表格、標籤、Markdown 用顯示名，CSV／AI／備份的 channel 值不變 |
| R2-8 匯出名稱與 CSV 標題 | 完成 | Markdown／列印名稱改 labels；五種 CSV 標題列改「中文 (key)」（`csvHeader`／`csvHeaderKey`、`labels.csvColumns`）；通路寬表 CSV 補英文 key；匯出相關單元測試改以 `csvHeaderKey` 取回 key |
| R2-9 測試改寫＋新測試 | 完成 | 13 個單元測試檔、16 個 E2E spec 改為引用 labels／`ruleHeadline`／`csvHeaderKey`；新增 `tests/copy.test.ts`、`tests/labels-coverage.test.ts`、`tests/copy-density.test.ts` |
| R2-10 `layout.tsx` metadata | 完成 | `title`／`description` 來自 `labels.brand`；`lang="zh-Hant-TW"` |

## 2. 新增／主要修改檔案
- 新增：`src/application/copy.ts`、`src/components/basis-dialog.tsx`、`tests/copy.test.ts`、`tests/labels-coverage.test.ts`、`tests/copy-density.test.ts`、`verification/agent-e2e.config.ts`（共用伺服器設定，供平行修測試用）、`verification/revamp-R2-capture*`
- 重寫：`src/components/evidence-drawer.tsx`
- 接線（字串改讀 labels）：`src/components/*.tsx` 全部、`src/application/{manager-summary,decision-export,workspace-decision-export,export,product-comparison-export,import-guidance,review-session,decision,import,ai-client}.ts`、`src/ai/grounding.ts`
- 字典：`src/i18n/labels.zh-TW.ts`（新增 `ui`、`downloads`、`notes`、`csvColumns`、`csvSuffix`、`evidence`、`brand`、`sections.*` 等）、`src/i18n/index.ts`（`fill()`）

## 3. 驗收命令與真實結果
| 命令 | 結果 | 摘要 |
|---|---|---|
| `npm ci` | 未重跑 | `package.json`／`package-lock.json` 零改動，沿用 R0 乾淨安裝 |
| `npm run typecheck` | 通過 | exit 0 |
| `npm run lint` | 通過 | `eslint . --max-warnings=0` exit 0 |
| `npm test -- --run` | 通過 | **45 files／839 tests**（R1 基線 828 ＋ `copy` 5 ＋ `labels-coverage` 3 ＋ `copy-density` 3） |
| `npm run build` | 通過 | ✓ Compiled successfully；routes 不變；無 warning |
| `npm run test:e2e` | 通過（最終一輪） | 全套 **444 項：440 passed／4 failed**（9.3m，四尺寸各 110，含新增 `revamp-r2-copy.spec.ts` 4×4）。4 項失敗是新 spec 自己的斷言寫錯（期望「注意：」，健檢卡實際是 `<h4>注意</h4>` 標題＋內文）；只改該測試後單獨重跑 **16/16 通過**（產品未改動）。前一輪 428 項（未含新 spec）為 426 passed／2 failed，差異為 R1 自訂的頂欄高度上限（平板 149px／手機 155px），產品改為 ≤ 900px 時口徑說明鈕只顯示圖示、上限依尺寸調整後亦通過 |

過程紀錄：第一次桌面版 107 項有 26 項失敗（共用的「開始試算」按鈕正規式、儲存面板內新增技術細節 `<details>` 造成 `summary` 重複、抽屜來源改分頁後舊斷言找不到其他檔案、CSV 讀取未對應「中文 (key)」、AI mock 觀察句仍用舊指標名），由 10 個代理各自修一個 spec 檔（只改測試、不改產品；對共用伺服器執行）後全部通過；再跑全套得到上述結果。

`grep -rn "行銷後貢獻\|已入帳退款\|履約費用\|取分調整\|稽核資訊\|建立行動草稿" src --include='*.tsx'`：**零命中**。`--include='*.ts'` 排除 labels 後只剩 `src/domain/rules.ts`／`src/domain/scenarios.ts`（財務核心禁區，標題與公式在呈現層以 `ruleCopy`／labels 覆寫）、`src/ai/prompt.ts`（送模型的系統提示，非 UI）、`src/ai/grounding.ts:40`（不安全措辭正規式）。

## 4. 瀏覽器驗收與截圖
- 截圖：`npx playwright test --config verification/revamp-R2-capture.config.ts` → `verification/revamp-R2/{1-overview…5-data}-{desktop,laptop,tablet,mobile}-{viewport.png,full.jpg}`，另有 `6-basis-dialog-desktop.png`、`7-evidence-drawer-desktop.png`。
- dev 預覽實測：六個頁面主層與頂欄以正規表示式掃描禁用詞（取分／快照／稽核／fact／ID／hash／revision／schema／metric_version／contribution-v1／cohort／blocking／partial／null）與舊名詞（行銷後貢獻／行銷前貢獻／已入帳退款／履約費用／建立行動草稿／資料截至／相同天數／完整自然月／前期），僅「目前期間」誤判一次。
- 舊名詞 grep：見 §3。

## 4b. 對抗式審查（4 視角 → 每項 3 位反駁者，多數保留）
25 項候選，18 項確認。處理如下：
| 確認項 | 處理 |
|---|---|
| 商品層級證據在抽屜畫出通路的四層階梯（高） | 已修：`EvidenceSelection.sku`，商品、商品事實、行動引用與三件事的 SKU 規則都帶 `sku`；`ladderMetrics` 遇 SKU 回傳 null；新 E2E 斷言商品抽屜沒有階梯 |
| AI 標籤／說明對所有未啟用狀態都寫「公開版」 | 已修：三種分支（可用→需同意；PUBLIC_DEMO→公開版；其他→`status.aiDisabled`＋`aiDetail.off`） |
| 抽屜四個地標都叫「來源資料」 | 已修：分頁群組／表格／分頁導覽改用 `ui.evidenceDrawer.sourceTabsAria／sourceTableAria／sourcePagerAria`；`workspace.spec.ts` 同步 |
| E2E 以元件未使用的 `ui.evidenceDrawer` 模板推導字串（13 個死鍵） | 已修：抽屜改用 `money／scopeLine／tabWithCount／colSource／colScope／colValues／skuLine`，其餘死鍵刪除 |
| 口徑說明只能從頂欄與頁尾開啟（R2-4 要三個入口） | 已修：抽屜「怎麼算的」段加 `口徑說明` 連結（`onBasis`），對話框疊在抽屜上、關閉後回到連結 |
| 主層仍有新寫的中文字面值（actions-workbench、scenario-sensitivity、overview 數據表前綴、copy.ts 萬／元） | 已修：全部改讀 labels（`ui.actionsWorkbench.evidenceChangeNote`、`ui.scenarioSensitivity.*`、`ui.overview.dataTable`、新增 `labels.units`） |
| 技術細節句子在 JSX 重複、對應鍵未用 | 已修：改讀 `fixedAssumptionsTechnical／thresholdPrecisionTechnical` |
| `formatHeadlineAmount` 先判斷單位再取整、取整後為 0 仍帶號 | 已修：先取整再決定萬／元與正負號；單元測試加邊界案例 |
| 決策 Markdown 主層出現英文狀態 `valid` 與費率 key | 已修：`ui.decisionExport.scenarioStatus`、`csvColumns.platform_rate／payment_rate` |
| 會議摘要附錄與方案狀態列仍印原始代碼 | 已修：附錄列與方案狀態改用標籤 |
| 抽屜文案「未知」、週列「前期」 | 已修 `missingValue／conditionsNote` 改「資料待補」；週列標籤屬 `workspace.ts` 資料欄位，未改（非 UI） |
| `evidenceRows` memo 每次重算 | 已修：以 `evidence` 為依賴 |
| BasisDialog 沒有 E2E | 已修：`tests/e2e/revamp-r2-copy.spec.ts`（三個入口、Esc 回焦、關閉鈕） |
| 批次文件未完成、A 批證據檔被重寫、`.claude/` 混入 | 已處理：文件補齊、`git checkout -- verification/review-v2-a-*`、`.claude/` 不納入 |
被反駁（不處理）：抽屜寫死 `contribution-v1`（與 snapshot 一致）、KPI 卡未用短名／`plain` tooltip（R4 輔助指標列再用）、`formulaTechnical` 與規格差異、階梯運算符 aria-hidden、資料集設定分頁顯示英文鍵（技術資料）、`scenarioNameWithRevision` 未帶版本（規格要求移到技術細節）。
未處理的低優先：抽屜階梯每行可展開過濾來源（02 §10 選配）。

## 5. 已知限制與風險
- 示範通路 alias 比規格窄（只對示範資料集），避免驗證用合成資料的對帳與測試受影響。
- 會議固定來源的主管摘要仍在總覽頁尾收合區（R6 搬分頁）；「開發者驗證」仍在側欄（R7 隱藏）。
- 會議方案選單只顯示方案名稱（版本號移到技術細節）；同名方案在選單中無法區分，R5 方案流程改版時處理。
- `labels.ui` 由盤點自動產生，鍵名以元件分組；R3 以後新字串請直接寫入對應命名空間。

## 6. 下一批建議與待拍板
見批次回報。
