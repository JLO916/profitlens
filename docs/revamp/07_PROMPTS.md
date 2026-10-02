# 07 Claude Code 提示詞（直接貼上）

> 用法：在 repo 根目錄開 Claude Code。先貼「啟動提示」，確認它讀完文件後，再貼 R0；每批完成並通過後才貼下一批。每個批次用**新的對話**開始（避免上下文過長），啟動提示每次都要先貼。

---
## 啟動提示（每個新對話都先貼）
```
你現在在 ProfitLens 的 repo 根目錄。請先完整讀取以下檔案，讀完後只回覆「已讀取，準備執行 R{n}」並列出你理解的本批目標三句話，不要開始改動：
1. AGENTS.md（既有規則，優先級最高）
2. CLAUDE.md（本輪工作規則）
3. docs/revamp/00_README.md
4. docs/revamp/06_BATCHES.md 中的 R{n} 段落
5. R{n} 引用到的規格檔（docs/revamp/02–05）
6. docs/revamp/09_DECISIONS_PENDING.md（有「決定」欄的以決定為準，沒有的用建議值並在回報標註）
7. docs/METRICS.md、docs/DATA_CONTRACT.md（財務口徑，不可更動）

硬規則提醒：不碰 src/domain（R4 以後只允許加法）、不改 fixtures 與 golden、不改 metric_version、所有中文從 src/i18n/labels.zh-TW.ts 取、改名時同批更新測試且不准 .skip、只能加該批允許的依賴、不碰 .env 與 PUBLIC_DEMO 邏輯、每批跑完整驗收命令並用 CLAUDE.md 的回報格式回報。
```

---
## R0
```
執行 docs/revamp/06_BATCHES.md 的 R0（基線與安全網）。
步驟：建分支 revamp/v2 → 乾淨 npm ci → 依序跑 typecheck、lint、test -- --run、build、test:e2e，把真實輸出摘要寫進 verification/revamp-R0-acceptance.md → 用 Playwright 對四尺寸拍「改版前」截圖（載入示範後的總覽／健檢／試算／行動／資料來源）存 verification/revamp-R0/before/ → 建立 src/i18n/index.ts（只 re-export labels 與一個 t(path) 小工具，不接線）→ grep 所有 data-testid 與 E2E 選擇器輸出 verification/revamp-R1/testids.txt → 更新 docs/STATUS.md 與 docs/DECISIONS.md。
不做任何 UI 或邏輯改動。完成後用回報格式回報，附測試通過數與 main 的對照。
```

---
## R1
```
執行 R1（總覽重排與頁首減負）。先讀 docs/revamp/02_IA_LAYOUT.md §1–§3、§11–§12 與 06_BATCHES.md R1 的 R1-1 到 R1-9。
重點：
- KPI 卡在 1440×1000 與 1280×900 載入示範後不捲動即可見；三件事在一次 PageDown 內。
- AI 橫幅變頂欄小標籤＋popover，保留 data-testid="ai-availability"、role="status"、aria-live。
- WorkspaceStorage 整組搬到頂欄「儲存 ▾」，testid 不變。
- 期間列 sticky＋快捷鈕（近7天／近4週／近12週／本月vs上月），快捷只填日期，仍要按「套用」。
- 總覽順序：KPI → 三件事 → 趨勢 → 橋接＋通路比較 → 期間合計與日均（details 收合）→ 會議設定（頁尾收合）；通路寬表移到健檢頁頂部。
- 下載鈕集中到頂欄「下載 ▾」。
- 切頁 scrollTo(0,0) 並聚焦 main#main-content。
- 三件事與健檢卡顯示「對貢獻影響」（紅不利／綠有利），定義依 05_FEATURES.md §7，只做顯示層；寫入 docs/DECISIONS.md。
- 修 select 高度、徽章文字、副標與 title。
本批不改任何名詞（manager-language 測試不應改動）。新增 tests/e2e/revamp-r1-layout.spec.ts。全套驗收通過後，四尺寸「改版後」截圖存 verification/revamp-R1/after/，寫 verification/revamp-R1-acceptance.md，回報。
```

---
## R2
```
執行 R2（語言與文案層）。先讀 docs/revamp/03_GLOSSARY_COPY.md 全文與 06_BATCHES.md R2。
做法順序（請照做，避免測試大面積失敗時迷路）：
1. 先把 src/application/presentation.ts 的 metricDefinitions 改為從 labels.metrics 取 label／formula，並新增 shortLabel、plain、formulaTechnical。
2. 跑 npm test -- --run，列出所有因字串而失敗的測試檔清單，貼給我看（不要先修）。
3. 逐檔把斷言改為引用 labels（import { labels } from "@/i18n"），不准 .skip、不准改 golden 數字。
4. 再做元件接線：導覽、區塊標題、按鈕、規則卡文案（labels.rules，domain/rules.ts 不改）、口徑說明對話框 basis-dialog.tsx、免責集中（每區塊最多一句）、公式抽屜中文階梯、示範通路 alias、匯出名稱與 CSV 標題列「中文 (key)」、layout.tsx metadata。
5. 新增 tests/labels-coverage.test.ts 與 tests/copy-density.test.ts（規格在 03 §8-4 與 06 R2-9）。
完成後 grep -rn "行銷後貢獻\|已入帳退款\|履約費用\|取分調整\|稽核資訊\|建立行動草稿" src --include=*.tsx 應只剩技術細節區與 labels 檔；全套驗收通過；截圖存 verification/revamp-R2/；回報。回報最後建議是否可以 tag v2.0.0-beta.1。
```

---
## R3
```
執行 R3（匯入精靈與台灣來源）。先讀 docs/revamp/04_IMPORT_TW.md 全文與 06_BATCHES.md R3。
硬限制：src/domain/validation.ts 不改；含稅換算只在 src/application/tax-basis.ts，逐列 decimal.js 除以 (1+rate) 後 ROUND_HALF_UP 兩位；來源抽屜要能看到原值→換算值；metric_version 不變。
先寫 tests/tax-basis.test.ts 的 golden（04 §3 列的手算案例，請自己再多算三個並把手算過程寫在測試註解），RED 後才實作。
精靈四步拆成 import-wizard/ 子元件，狀態在 src/application/import-wizard.ts，對外仍是 onCommit／onCancel。舊面板先保留在隱藏的 #legacy-import（R4 刪）。
source-presets 的九個 preset 一律 verified: false，檔頭寫驗證方法；通用中文欄名字典依 04 §4.4。
mapping-memory 用既有 local-store 的 IndexedDB 新 store，受保存同意控制。
錯誤訊息白話對照：先 grep validation.ts 所有 reason code 列成表，再補 labels.importErrors。
scripts/aggregate_orders.py 第一版＋docs/ORDER_AGGREGATION.md。
E2E：tests/e2e/import-wizard.spec.ts（≤5 次點擊、記憶提示、含稅後 KPI 等於手算、超限拒絕）。全套通過、截圖、acceptance.md、回報；回報中列出哪些 preset 需要我提供真實匯出檔驗證。
```

---
## R4
```
執行 R4（輔助指標、去年同期、目標、檔期、備份 v4）。先讀 docs/revamp/05_FEATURES.md §1–§6 與 06_BATCHES.md R4。檢查 09_DECISIONS_PENDING.md 的 D6（orders_daily）決定。
這是第一個允許碰 src/domain 的批次，規則：只能新增（Summary.units_sold、ProductRow.metrics.units_sold），不改任何既有函式的輸入輸出；完成後 git diff src/domain 必須只有加法；git diff --stat fixtures/ docs/METRICS.md 必須為空。
順序：先寫 tests/units-sold.test.ts（用 fixtures/golden 的 units_sold 人工加總當常數，過程寫註解）→ 實作 → assist-kpi.ts（assist-kpi-v1，含 A=0、N≤0、件數 0 邊界測試）→ period-presets 去年同期（月底、閏年、涵蓋邊緣測試）→ targets.csv → events.csv → 備份 v4（v3→v4→v3 讀入 roundtrip 測試，CSV 逐位元一致）→ 刪 legacy import 面板。
UI：總覽輔助指標橫列、KPI 卡達成率、趨勢圖檔期區帶、快捷鈕「去年同期」。Markdown／CSV 匯出加對應小節與欄位。
全套通過、截圖、acceptance.md、回報。
```

---
## R5
```
執行 R5（健檢清單化、試算範本與絕對值輸入、行動看板、商品頁 Top/Bottom）。先讀 05_FEATURES.md §7–§9、02_IA_LAYOUT.md §4–§7、06_BATCHES.md R5。
硬限制：情境引擎（src/domain/scenarios.ts）輸入仍是相對值；絕對值模式只在表單層換算並顯示等值相對值；Golden 情境答案（DTC 284.00／264.00、MARKETPLACE 19.70）不得改變；版本號只在計算成功時遞增。
健檢：DiagnosisGroup 合併同規則的合計與各通路為一列，missing 置頂，其餘依 |impact| 排序；三件事＝前三列；通路寬表置頂；預設展開前三列。
試算：進頁即表單、通路單選預設第一個、範本選單（05 §8 表格，標示「只是起點」）、固定假設收合、敏感度三組納入 state／匯出／備份。
行動：看板四欄（按鈕改狀態即可，不強求拖曳）、期限 type=date、負責人 datalist、證據 checkbox 清單含搜尋。
商品：Top/Bottom 10 小表、欄位重排、毛利率欄、「資料狀態」文案。
測試：diagnosis-group、scenario-presets、scenario-absolute-mode、更新 v2-scenario-workspace 與 decision-export、E2E（試算 ≤2 次點擊到表單、加入待辦 ≤2 次點擊、看板改狀態）。全套通過、截圖、acceptance.md、回報。
```

---
## R6
```
執行 R6（會議紀錄、匯出、預設保存）。先讀 05_FEATURES.md §10–§12、02_IA_LAYOUT.md §8、06_BATCHES.md R6；檢查 09 的 D4（依賴）與 D7（自動保存）決定。
會議：src/application/meeting.ts 承接 review-session.ts；Meeting 物件、finalize 後不可變、meeting_history 進備份 v4；新分頁「會議紀錄」；上次會議比較規則依 05 §10；總覽只留一行入口。
匯出：PDF 用強化列印樣式＋window.print()；Excel／PPT 依 D4 決定是否加依賴（加依賴前先 npm view 確認版本，精確鎖定，記入 docs/DECISIONS.md；量 build 的 first-load JS 差異，超過 +300KB 用動態 import）。
預設保存：首次同意對話框、同意後 debounce 2 秒自動保存、頂欄「已保存 hh:mm」；拒絕則維持手動；刪除本機資料保留。
測試：meeting.test.ts、excel-export／pptx-export（解析產物驗工作表與逃逸）、自動保存 E2E、會議流程 E2E。全套通過、用 Excel／PowerPoint 開啟產物截圖、acceptance.md、回報。
```

---
## R7
```
執行 R7（README、示範資料、上線）。先讀 docs/revamp/08_RELAUNCH.md 全文與 06_BATCHES.md R7；檢查 09 的 D3（示範資料）、D8（網域）、D9（分析工具）。
README 依 08 §1 結構重寫（給營運主管的三段放最前面；工程內容移 docs/ENGINEERING.md；發布紀錄移 docs/RELEASES.md）。
示範資料依 D3；若建 fixtures/demo_tw，expected.json 必須獨立手算（寫出計算表），不得用 production 函式產生。
metadata／OG／favicon／robots／sitemap；進階驗證頁改 #validation 顯示。
依 08 §4 逐條執行上線檢查並把真實結果寫進 verification/revamp-R7-acceptance.md（含 Lighthouse 實際分數）。
docs/RELEASES.md 寫 v2.0.0 發布說明；docs/STATUS.md 收尾；建議 tag。不要自行推送或部署，列出我需要執行的推送／部署命令。
```

---
## 回報格式（每批結束時要求）
```
請用以下格式回報，不要只寫「完成」：
1. 完成項目：對照 06_BATCHES.md 任務編號，逐項標「完成／部分／未做＋原因」
2. 變更檔案：新增／修改／刪除清單
3. 驗收命令與真實結果：typecheck、lint、test（通過數／失敗數）、build、test:e2e（四專案各通過數／失敗數／未執行）
4. 瀏覽器驗收：四尺寸截圖路徑
5. 已知限制與風險
6. 需要我拍板的事項（對照 09_DECISIONS_PENDING.md 編號）與下一批建議
```

---
## 卡住時
```
停。不要繼續改動。請列出：目前失敗的測試檔與第一個失敗訊息的原文、你認為的原因、兩個可能的修法與各自風險、哪一個不會動到 fixtures／golden／domain。等我選。
```

```
你剛才的改動影響到 src/domain 或 fixtures。請 git diff 列出變更，然後只保留加法、還原其他部分；若無法只用加法達成，說明原因並停止，等我決定是否開新批次。
```

```
測試字串失敗太多。請先不要修元件，列出所有因中文字串而失敗的測試檔與斷言行，分成「改為引用 labels 即可」與「需要改測試邏輯」兩類，貼給我確認後再動。
```
