# Status

## Revamp v2｜R6 會議紀錄、匯出、預設保存（完成，未合併、未部署）

R6 依 `docs/revamp/06_BATCHES.md` R6-1～R6-7 與 `05_FEATURES.md §10–§12`、`02_IA_LAYOUT.md §8` 完成；`src/domain`、`fixtures`、`docs/METRICS.md` 零改動。會議紀錄：`src/application/meeting.ts`（`Meeting`／`meeting-v1`：結束會議即凍結、進備份 v4 `meeting_history`（上限 100）、上次會議比較三種規則、會議 Markdown）與新分頁「會議紀錄」（`meeting-page.tsx`：會議基本含日期、議程 ①–⑥、決議、結束會議確認、上次會議比較、會議歷史、輸出列）；總覽只留一行入口。匯出：D4＝A——`xlsx@0.18.5`、`pptxgenjs@4.0.1` 精確鎖定、動態 import（首頁 first-load JS 由 1,552.6 KB 增為 1,619.6 KB raw，+66.9 KB，低於 +300 KB 門檻），`excel-export.ts` 六個工作表（文字格一律字串型別＋CSV 同一套防注入規則、金額數值、比率小數）、`pptx-export.ts` 16:9 一頁式（pptxgenjs XML 轉義、不嵌圖片）、PDF 走強化的 A4 列印樣式＋`window.print()`，下載選單整合所有格式。預設保存：D7＝A——首次載入資料時非 modal 提示「存在這台電腦？」，同意後 2 秒 debounce 自動保存到 IndexedDB、頂欄「已保存 hh:mm」（臺北時間），拒絕維持手動；「刪除本機資料」保留。決策見 `DECISIONS.md`（2026-10-03 R6）。

- 最終驗收：typecheck pass、lint 0 warnings、unit **__UNIT__**、build pass 無 warning、E2E 全套 **__E2E__**（四尺寸，含新增 `revamp-r6.spec.ts` 與 `workspace-storage.spec.ts` 自動保存案例）；對抗式審查 __REVIEW__。
- 流程：四個獨立 worktree 代理平行實作（會議物件／Excel／PPT／自動保存）→ 合併 → 會議分頁與殼層整合代理 → 四個代理平行改寫 E2E（共用正式伺服器）→ 四視角審查（每項 3 位反駁者）→ 修正 → 全套重跑。
- 測試：`tests/{meeting,meeting-backup,excel-export,pptx-export,auto-save}.test.ts`、`tests/{workspace-storage-autosave,meeting-page}.test.tsx`（Excel／PPT 以解析產物驗工作表、儲存格型別與逃逸）。
- 產物與截圖：`verification/revamp-R6/`（四尺寸截圖 __SHOTS__ 張；E2E 實際下載的 `artifacts/*.xlsx`／`*.pptx`；headless Chromium 產生的 A4 PDF；用 Microsoft Excel／PowerPoint 開啟產物的螢幕截圖）。Live AI、真實資料、Safari／Firefox、實體裝置：**未執行**。
- 已知限制：`npm audit` 對 `xlsx`／`image-size` 的 3 個 high 項目只在未使用的讀取／圖片程式路徑（已記錄於 DECISIONS）；會議的「上次比較」不存進 Meeting（還原後重算）；同意本機保存只在本次載入有效（重新整理後再問一次）。完整紀錄見 [R6 驗收](../verification/revamp-R6-acceptance.md)。R6 完成即停止；R7 待確認後開始。

## Revamp v2｜R5 健檢、試算、行動的決策化（完成，未合併、未部署）

R5 依 `docs/revamp/06_BATCHES.md` R5-1～R5-6 與 `05_FEATURES.md §7–§9`、`02_IA_LAYOUT.md §4–§7` 完成；`src/domain`、`fixtures`、`docs/METRICS.md` 零改動，情境引擎輸入仍是相對值，Golden 情境答案（DTC 284.00／264.00、MARKETPLACE 19.70、零變動 270.00）不變。健檢改為清單（`diagnosis-group.ts`／`diagnosis-list.tsx`：同規則合計＋各通路合併一列、缺漏置頂、依對貢獻影響排序、前三列預設展開、通路寬表置頂、三件事與 Markdown／列印共用同一排序）；試算頁進頁即表單（`scenario-presets.ts`：六個範本兩步套用、絕對值輸入在表單層換算成相對值（12 位小數、折扣用精確 D/G）、界限即時提示、版本號只在計算成功時遞增、草稿標示、固定假設收合、敏感度三組輸入納入方案／匯出／備份 v4 欄位加法）；行動改為看板（四欄按鈕改狀態、`status_updated_at` 臺北日曆日、負責人 datalist、證據 checkbox 清單含搜尋、看板／清單偏好記在 `ui_prefs.view`）；商品頁加 Top／Bottom 10 小表、欄位重排、毛利率與資料狀態。決策匯出的「目前」區段改跟著試算頁正在編輯的 context。決策見 `DECISIONS.md`（2026-10-03 R5）。

- 最終驗收：typecheck pass、lint 0 warnings、unit **65 檔／1,207 測試全過**、build pass 無 warning、E2E 全套 **520 項：516 過／4 失敗（同一列印測試的測試側比對式，改後重跑 12/12）**（四尺寸，含新增 `revamp-r5.spec.ts` 5 項與 `action-workspace.spec.ts` 看板案例）；對抗式審查 32 項候選／29 項確認／修 27 項（2 項記為決策），另修 E2E 代理發現的 1 個產品 bug（試算頁通路選擇在全站範圍 A→B→A 時復活）。
- 流程：四個獨立 worktree 代理平行實作 → 合併 → 試算 UI 代理 → 五個代理平行重寫 E2E（共用正式伺服器）→ 四視角審查（每項 3 位反駁者）→ 兩個代理修正 → 全套重跑。
- 測試：`tests/{diagnosis-group,diagnosis-list,scenario-presets,scenario-absolute-mode,scenario-sensitivity-backup,action-board,product-highlights}.test.ts`、`tests/scenario-form.test.tsx`；既有 E2E 15 份 spec 改用新流程（進頁即表單、看板預設、checkbox 證據、健檢列 testid）。
- 截圖 32 張存 `verification/revamp-R5/`（健檢清單、試算表單（範本＋絕對值）、行動看板、商品 Top／Bottom × 四尺寸）。Live AI、真實資料、Safari／Firefox、實體裝置：**未執行**。
- 已知限制：絕對值原文只存本頁（方案存換算後的相對值）；版本號只與最新版本比；Top／Bottom 小表不跟隨篩選、本期沒賣的商品以 0 計入「最差」；看板用按鈕改狀態不拖曳；「毛利率」不提供排序。完整紀錄見 [R5 驗收](../verification/revamp-R5-acceptance.md)。R5 完成即停止；R6 待確認後開始。

## Revamp v2｜R4 輔助指標、去年同期、目標、檔期、備份 v4（完成，未合併、未部署）

R4 依 `docs/revamp/06_BATCHES.md` R4-1～R4-7 與 `05_FEATURES.md §1–§5` 完成（R4-8 `orders_daily.csv` 依 D6＝B 延後）。第一次碰 `src/domain`，只有加法：`Count` 型別、`Summary.units_sold`（介面宣告合併）、`ProductMetrics.units_sold`、`sumUnits`／`sumCounts`／`countMetric`；既有函式輸入輸出不變、`fixtures/*` 與 `docs/METRICS.md` 零改動、`metric_version` 不變。新增 `src/application/assist-kpi.ts`（`assist-kpi-v1`：售出件數、件均淨營收＋五個既有比率，總覽 KPI 五卡下方七格橫列、每格可開「怎麼算的」、分析 CSV 與主管摘要 Markdown 各加小節）、`period-presets.ts` 去年同期（本期不變、上期各減一年、閏年 2/29 → 2/28、四種不可用理由）、`targets.ts`（targets.csv 匯入／驗證／匹配，KPI 卡達成率只在期間完全相同時顯示）、`events.ts`（events.csv，趨勢圖區帶＋三件事後綴，不改計算）、備份 v4（`preprocessing`＝R3 含稅換算原值、`targets`、`events`、`meeting_history`、`ui_prefs`；v1–v3 仍可讀；v3→v4→再讀入 CSV 逐位元一致）；刪除 R3 保留的舊匯入面板。

- 最終驗收：typecheck pass、lint 0 warnings、unit **57 檔／1,014 測試全過**、build pass 無 warning、E2E 全套 **488 項全過**（四尺寸，含新增 `revamp-r4.spec.ts` 4 項；首跑 483 過／5 失敗——分析 CSV 測試未預期 `assist_kpi` 列的版本字串、去年同期理由讓 1280 期間列變三行——修正後三份 spec 104/104、全套重跑 488/488）；對抗式審查 34 項候選／32 項確認／修 30 項（2 項記為決策，見 `DECISIONS.md` R4 補記）。
- 測試：`tests/units-sold.test.ts`（golden 人工加總：上期 6、本期 8、DTC 4／MARKETPLACE 4、商品列）、`tests/assist-kpi.test.ts`（308.75／375.00 元／件；A＝0、件數 0、缺件數；CSV 與 Markdown）、`tests/period-presets.test.ts`（月底、閏年、涵蓋邊緣、整月）、`tests/targets.test.ts`（匹配／不匹配、每個錯誤碼、CSV 列）、`tests/events.test.ts`、`tests/workspace-backup.test.ts`（v3→v4→v3 roundtrip）；既有測試改引用 `WORKSPACE_VERSION`。
- 截圖 25 張（四尺寸 × 三個畫面 × 視窗／全頁＋示範資料 laptop 的去年同期不可用理由）存 `verification/revamp-R4/`（總覽輔助指標＋達成率＋檔期區帶、去年同期套用後、資料頁目標／檔期入口 × 四尺寸）。E2E 重寫的 A 批證據檔已還原。Live AI、真實資料、Safari／Firefox、實體裝置：**未執行**。
- 已知限制：訂單數／客單價／轉換率（§6）延後；去年同期以表單目前兩期為準（涵蓋不足一年即不可用）；目標只支援四個指標與 ALL／單一通路；檔期只標示在週趨勢圖與三件事；備份 v4 的 `meeting_history` 先為空（R6）。完整紀錄見 [R4 驗收](../verification/revamp-R4-acceptance.md)。R4 完成即停止；R5 待確認後開始。

## Revamp v2｜R3 匯入精靈與台灣來源（完成，未合併、未部署）

R3 依 `docs/revamp/06_BATCHES.md` R3-1～R3-9 與 `04_IMPORT_TW.md` 完成：單頁匯入表單改為四步精靈（`src/components/import-wizard/`，狀態機 `src/application/import-wizard.ts`；選檔拖放與自動歸位、對照欄位依「標準欄名 → 上次的對照 → 來源預設 → 中文欄名字典」預選、口徑與期間由檔案提議直接填入、檢核與套用）；含稅來源不再被擋：`src/application/tax-basis.ts` 逐列 ÷ (1＋稅率) ROUND_HALF_UP 兩位後才交給既有 `validateDataset`，原值→換算值顯示在「怎麼算的」抽屜、資料頁前處理摘要、分析／商品／通路寬表 CSV 與主管摘要、決策匯出；九個台灣來源 preset（全部 `verified: false`）＋ 53 個中文欄名別名；對照記憶（IndexedDB 新 store，受本機保存同意控制）；錯誤訊息白話對照表（全部 reason code）；含三列示範的範例範本；`scripts/aggregate_orders.py`＋`docs/ORDER_AGGREGATION.md`。D2、D5 依建議值執行；另四個取捨記於 `docs/DECISIONS.md`。`src/domain/*`、`fixtures/*`、`metric_version`、依賴零改動。

- 最終驗收：typecheck pass、lint 0 warnings、unit **51 files／921 tests pass**（R2 基線 839 ＋ tax-basis 7、import-wizard 17、mapping-memory、source-presets、aggregate-orders、templates 等）、build pass 無 warning、E2E 全套 **472 項：460 pass／12 fail → 12 項為審查修正（自動完成的第 2 步改為可回看）後三個改寫測試的「回上一步」預期過時，只改測試後該三個 spec 四尺寸重跑 **60/60 通過****（四尺寸，含新增 `import-wizard.spec.ts` 7 項）；對抗式審查 45 項候選、33 項確認、修 30 項（對帳表假差額、含稅全不勾、正規化誤判 exact、preset 誤判、清空未重設同意、刪除本機資料未清分頁記憶、記憶跨 session 讀取、設定檔失敗卡住、記憶寫入時點、第 1 步訂單級提示、說明連結、其他匯出註記、精度、白話回退、問題 CSV 白話欄、焦點外框、多檔選取與拖放等）。
- 測試：八個驅動舊面板的 E2E spec（import、import-guidance、period-comparison、action-workspace、ai、m6-acceptance、product-comparison、review-v2-a）改為共用 `tests/e2e/import-wizard-helpers.ts` 驅動精靈，不刪測試、不 `.skip`、不改 golden；新增 `tests/e2e/import-wizard.spec.ts`（≤ 5 次點擊、含稅 KPI＝手算、記憶提示、超限拒絕、訂單級偵測、範本下載、拖放／多選）。`tests/fixtures/inclusive_tax/`（README 含手算）。
- 截圖 68 張存 `verification/revamp-R3/`（精靈四步、檢核摘要、匯入後總覽、抽屜原值→換算值、資料頁前處理、記憶提示 × 四尺寸）。E2E 重寫的 A 批證據檔已 `git checkout` 還原。真實平台匯出檔走查、Live AI、Safari／Firefox、實體裝置：**未執行**。
- 2026-10-03 追加（使用者指示：第一階段只做蝦皮、momo、91APP；D2、D5 確認依建議值）：以公開文件重建四個 preset 的真實標題列並製作去識別化合成樣本（`tests/fixtures/source-samples/`），`shopee_orders`／`shopee_income`／`momo_settlement`（改指向 momo 店+ 對帳明細）evidence 提到 `public_docs`、`91app_orders` 為 `api_docs`（匯出表頭無公開來源）；指紋與欄名依查證修正（舊指紋會把蝦皮訂單匯出誤判成進帳報表、momo 指紋根本對不到）；彙總腳本新增 `unit_price`／`line_discount`／折扣欄陣列加總，三個平台規則範例 `scripts/rules/` 以手算測試固定（`tests/aggregate-orders-platforms.test.ts`、`tests/source-presets-samples.test.ts`）。同日使用者提供蝦皮「待出貨」匯出檔的標題列（56 欄、無資料列）：`shopee_orders` 指紋 3／3 與全部候選欄名命中，改為 `evidence: "real_export"`、`verified: true`（真實標題列逐字存於 `tests/fixtures/source-samples/shopee_orders.header.csv`）；momo、91APP 仍待真實檔（見 `verification/revamp-R3-preset-verification.md §3`）。
- 已知限制：備份仍 v3（conversion／raw_values 不入備份，R4 升 v4）；IndexedDB 升 v2，回滾到 R2 build 讀不到本機副本；preset 全部待真實匯出檔驗證（蝦皮／momo 店+／91APP 已有公開文件重建的樣本與測試）；對照記憶不記標準欄名的手動覆寫；舊面板 `#legacy-import` 保留到 R4。完整紀錄見 [R3 驗收](../verification/revamp-R3-acceptance.md)。R3 完成即停止；R4 待確認後開始。

## Revamp v2｜R2 語言與文案層（完成，未合併、未部署）

R2 依 `docs/revamp/06_BATCHES.md` R2-1～R2-10 與 `03_GLOSSARY_COPY.md` 完成：所有使用者可見文字集中到 `src/i18n/labels.zh-TW.ts`（`metrics`／`rules`／`nav`／`sections`／`buttons`／`status`／`periods`／`basis`／`downloads`／`notes`／`csvColumns`／`evidence`／`brand` 與由 31 檔盤點產生的 `ui.<元件>` 約 800 鍵）；`metricDefinitions` 改讀 labels（新增 `shortLabel`／`plain`／`formulaTechnical`）；規則卡改為模板文案（`ruleCopy`，標題金額「萬」規則）；新增口徑說明對話框（九條）、免責集中為每區塊一句＋頁尾一句；「怎麼算的」抽屜改為中文階梯＋技術細節收合＋來源依檔案分頁可搜尋；示範通路顯示「官網 · DTC／平台 · MARKETPLACE」（只對示範資料集）；CSV 標題列改「中文 (key)」；`<title>`／`description`／`lang="zh-Hant-TW"`。D1、D11 依建議值執行（記於 `docs/DECISIONS.md`）。財務核心、fixtures、依賴零改動。

- 最終驗收：typecheck pass、lint 0 warnings、unit **45 files／839 tests pass**、build pass 無 warning、E2E 全套 **444 項 440 pass**（四尺寸各 110，含新增的 R2 文案 spec），4 項失敗為新 spec 的斷言寫錯（「注意」為標題非行內文字），修正測試後單獨重跑 16/16 通過；對抗式審查（4 視角 × 3 反駁者）確認 18 項、已修 14 項（商品證據不畫階梯、AI 狀態三分支、抽屜地標名稱、口徑說明可從抽屜開啟、字面值進 labels、萬元先取整、匯出狀態中文化等）。
- 測試：13 個單元測試檔與 16 個 E2E spec 改為引用 labels／`ruleHeadline`／`csvHeaderKey`，不刪斷言、不 `.skip`、不改 golden；新增 `tests/copy.test.ts`（golden 手算標題）、`tests/labels-coverage.test.ts`（每個指標／規則／導覽有條目、元件 JSX 無舊名詞）、`tests/copy-density.test.ts`（三頁主層限制句各 ≤ 3）。
- 主層文案稽查：六頁與頂欄無禁用詞；`grep` 舊名詞在 `.tsx` 零命中，`.ts` 只剩 domain 禁區與 AI 系統提示。
- 截圖 42 張存 `verification/revamp-R2/`（五頁 × 四尺寸 × 視窗＋整頁，另口徑說明與抽屜）。E2E 重寫的 A 批證據檔已 `git checkout` 還原。Live AI、真實資料、Safari／Firefox、實體裝置：**未執行**。
- 已知限制：alias 範圍比規格窄（只示範資料集）；會議固定來源的主管摘要仍在總覽頁尾收合區（R6）；「開發者驗證」仍在側欄（R7）；會議方案選單只顯示方案名稱。完整紀錄見 [R2 驗收](../verification/revamp-R2-acceptance.md)。R2 完成即停止；R3 待確認後開始。

---
## Revamp v2｜R1 總覽重排與頁首減負（完成，未合併、未部署）

R1 依 `docs/revamp/06_BATCHES.md` R1-1～R1-9 完成：AI 狀態改為頂欄小標籤＋說明 popover；工作區保存整組搬進頂欄「儲存」展開面板；期間列 sticky 並新增近 7 天／近 4 週／近 12 週／本月 vs 上月快捷（只填日期，仍須套用；`src/application/period-presets.ts`）；總覽順序改為 KPI → 本期三件事（目前檢視）→ 趨勢 → 橋接＋通路比較 → 期間合計與日均（收合）→ 會議稿與主管摘要（頁尾收合）；通路寬表移到通路診斷頁頂；下載鈕集中到頂欄「下載」；切頁捲動歸零並聚焦 `main`；三件事與健檢卡顯示「對貢獻影響」（負＝紅不利、正＝綠有利，`contributionImpact()`，定義見 `docs/DECISIONS.md`）；修 select 高度、徽章「示範資料」、副標與 `<title>`。財務核心、fixtures、依賴零改動；不改任何名詞。

- 最終驗收：typecheck pass、lint 0 warnings、unit **42 files／828 tests pass**、production build pass 無 warning、E2E **428 passed／0 unexpected／0 flaky／0 skipped**（8.1m，四尺寸各 107；基線 404 ＋ 新增 24）。
- 新增測試：`tests/e2e/revamp-r1-layout.spec.ts`（首屏 KPI、三件事一次 PageDown、區塊順序、切頁歸零與焦點、AI popover、儲存／下載選單與 testid、快捷填值不套用、sticky）、`tests/period-presets.test.ts`、`tests/contribution-impact.test.ts`（golden 手算）。既有 E2E 只加「先展開會議區／下載選單」的一行調整，不刪斷言、不 `.skip`。
- 對抗式審查（4 視角 ×3 反駁者）確認 13 項，已修 10 項（Esc 焦點回復、快捷鈕無障礙原因、新字串進 labels、移除重複的問題清單下載鈕、零值中性色、期間表標題結構等），3 項記為限制：期間列兩列 88px（規格 ≤ 64px）、商品頁 CSV 鈕保留頁內、會議固定來源的主管摘要仍在總覽頁尾收合區（R6 搬分頁）。
- 改版後截圖 40 張存 `verification/revamp-R1/after/`，與 R0 `before/` 同流程可並列比對。E2E 重寫的 A 批歷史證據檔已 `git checkout` 還原。Live AI、真實資料、Safari／Firefox、實體裝置：**未執行**。
- 完整命令輸出、任務對照、測試調整清單與審查結果見 [R1 驗收](../verification/revamp-R1-acceptance.md)。R1 完成即停止；R2（語言與文案層）待使用者確認後開始，並需先拍板 D1／D11／D12。

---
## Revamp v2｜R0 基線與安全網（完成）

Revamp v2 依 `CLAUDE.md` 與 `docs/revamp/*`（R0–R7）把產品從稽核員工具改成經理人每週使用的工具；財務核心（`src/domain`、golden／demo／errors 等 fixtures、`contribution-v1`、`docs/METRICS.md` 公式）零改動，使用者可見文字集中於 `src/i18n/labels.zh-TW.ts`。原則記於 `docs/DECISIONS.md`「Revamp v2 原則」。工作分支 `revamp/v2` 自 main `5771104` 建立；**尚未合併 main、尚未部署**，正式站仍是下方 A 批發布版本。

- R0 在乾淨環境（`rm -rf node_modules .next` → `npm ci`，442 packages、0 vulnerabilities）實際執行：typecheck pass、lint 0 warnings、unit **40 files／819 tests pass**（4.30s）、production build pass 無 warning、E2E **404 passed／0 unexpected／0 skipped／0 flaky**（7.5m；desktop／laptop／tablet／mobile 各 101）。與 main A 批紀錄 819／404 數量相同。
- 改版前截圖 40 張（總覽、通路診斷、情境試算、行動摘要、資料工作區 × 四尺寸 × 視窗＋整頁）存 `verification/revamp-R0/before/`，由獨立 `verification/revamp-R0-capture.config.ts` 產生，不計入 E2E。目視：1440×1000 載入示範後 KPI 卡不在首屏，為 R1 要解決的問題。
- 新增 `src/i18n/index.ts`（re-export `labels`＋`t(path)`），**未接線**；`verification/revamp-R1/testids.txt` 列出 40 個靜態、9 個動態 `data-testid` 與 E2E 的 74 個 testid、33 個 CSS、247 個 role／label／text 選擇器，供 R1 搬移對照。
- E2E 執行重寫了 87 個 A 批歷史證據檔，已 `git checkout` 還原，不混入本批。Live AI、真實資料、Safari／Firefox、實體裝置：**未執行**（與 main 相同）。`09_DECISIONS_PENDING.md` D1–D12 尚未拍板，R0 無需決策。
- 無 UI、邏輯、依賴、fixtures 改動。完整命令輸出與對照見 [R0 驗收](../verification/revamp-R0-acceptance.md)。R0 完成即停止；R1 待使用者確認後開始。

---
## 2026-10-02｜A 批 GitHub／Vercel 發布（完成）

依使用者「推送部署至github與vercel」授權，A 批已發布至 [正式站](https://profitlens-tau.vercel.app)。私人 `JLO916/profitlens` main 產品提交 `6c11a429dee50c08748891ade76b5972f72a593e`，Vercel deployment `dpl_7DMMB1jQ54FYy6C2AUDoZGj3e2nN` production READY；公開 alias 反查同一 SHA。後續驗收文件提交不改產品程式、公式或依賴。沒有新建專案、公開 repo 或開啟 Live AI。

- 發布前核對 139 件受測來源／測試、60 件 protected（含5件 golden）均相符，有限秘密與合成資料來源審核 pass。沿用 A 批 819 unit、400＋4 E2E、typecheck／lint／本機 build；**這些未在本次重跑**。雲端另實際 `npm ci`／`npm run build` 成功，建置41秒、部署READY約55秒。
- `git fetch origin main`、來源／文件 whitespace、commit、`git push origin main` pass。production 非機密旗標明確更新為 `APP_MODE=PUBLIC_DEMO`、`PUBLIC_DEMO=true`、`ENABLE_LIVE_AI=false`；環境名稱核對沒有 OpenAI key，未讀取 credential。
- 正式站13/13 HTTP pass：五個白名單合成資料與本機 CSV bytes 相符；未知資料集／環境檔／Git／驗收文件／原始fixtures路徑404；AI GET unavailable／PUBLIC_DEMO、POST403。發布後約114秒窗口查不到5xx或runtime error，僅代表該短窗口。
- 正式站真瀏覽器：Golden CM255.00／差−315.00；DTC履約−10%／量0／其他0＝284.00、K20＝264.00；MARKETPLACE同條件K0＝−6.50；切回DTC保留原稿。全通路診斷行動切DTC／商品頁後引用仍為全通路、進行中與備註保留。會議門檻1000、兩通路各選一版、補資料再議離頁後保留。Escape取消清空保留稿、Enter打開255.00公式及8筆來源。1440／1280／768／390px目視截圖，三個窄尺寸DOM無頁面橫溢，console warn/error為空。
- 線上完整E2E、此次線上匯入／下載位元／備份恢復／列印、Live AI、真實資料、實體装置、Safari／Firefox及長期效能：**not_run**。完整匯入／恢復／下載／列印仍由原A批本機400＋4及手動流程提供證據，不混稱為此次遠端重跑。雲端既有Node主版／ESLint／allowScripts提示記於報告，本輪未升級。

更新 README、STATUS 及 `verification/release-v2-a-20261002-*`。完整命令、限制與證據見 [發布紀錄](../verification/release-v2-a-20261002-acceptance.md)。A 批發布完成即停止；B–D／Live AI／真實試用未自動開始。下方「未部署」為先前輪次當時紀錄。

---

## 2026-10-02｜Review v2 A 批：營運與會議狀態分離（本機驗收完成）

本批按核准計畫實作 A1–A3，**尚未推送或部署**。既有正式站仍是下方前次發布版本；不能視為已包含本批。完整結果見 [A 批驗收報告](../verification/review-v2-a-acceptance.md)，最終 typecheck、lint、819 項 unit/integration、production build、400 項完整 E2E 與最後 4 項四尺寸列印／下載回歸均 pass。

- 行動的原始引用、管理完整性及執行狀態分離；切通路／頁面仍可更新進度。重新綁定須預覽與明確確認，以來源 context／revision／fact ID 保留歷史；同 ID 不自動替換金額，null 不補零。
- 多通路各自最多三方案，切檢視可來回編輯；真正換資料／期間／比較模式建立新工作輪次，舊 context 不復活。編輯撤下目前結果並保留會議引用的已計算修訂；歷史複製只帶名稱，數值與同意清空。
- 單份固定範圍會議可保存門檻、每通路選案修訂、三個有序置頂、備註及人工決議；其餘行動列附錄，沒有置頂不自動挑選。來源／引用更新撤回草稿，target_version 維持 null。
- `profitlens-workspace-v3` 以來源 hash 去重，原 v1／v2 checksum 先驗後遷移；各來源重驗與方案重算，不信任備份答案。四種替換入口共用保存／繼續／取消，下載待確認、本機保存失敗及版本競爭均不提交替換；不恢復 AI 同意、不自動持久化或跨分頁同步。
- 已完成：ZIP 九原件與 60 件受保護來源雜湊相符；819 tests 最終整合全通過；typecheck／lint 通過。實際 CUA 合成資料流程與 1440／1280／768／390px 截圖、鍵盤操作完成，warn/error 空記錄。400 項 E2E（每尺寸100）及最後提示修正後新增4項列印／下載回歸皆通過，0 skipped／unexpected／flaky，retries0；最後 BUILD_ID `0U3urGYm_9KI-Zel0tOsR`。真下載 MD／CSV／JSON 與列印 PDF 已保存。最後3300 PUBLIC_DEMO 實測 GET unavailable／POST403，並重新手動恢復合成會議成功；client23資產無假canary／server key標記。
- Live AI／真實營運資料／商業成效／Safari、Firefox、實體裝置及印表機／push、deploy：**not_run**。B–D、敏感度保存、多場會議封存、目標引擎均不在本批。人工 CUA 下載事件逾時，位元核對使用實際 Playwright downloads，分開記錄。

變更文件：README、ARCHITECTURE、SCENARIOS、ACCEPTANCE、DECISIONS；產品主要為 `action-workspace`、`scenario-workspace`、`review-session`、`workspace-backup`、`replacement-guard` 及相關 workbench／Dashboard。新增六份 A 批單元測試與端到端工作流程；golden／domain／依賴無改動。A 批驗收完成即停止，不自動進入下一批或發布。

---

## 2026-10-01｜系統發布（依最新指示先發布）

**已發布三批管理者改善**：[正式站](https://profitlens-tau.vercel.app)；程式 commit `2f8e539c22a3afc0260c6db08f9570b80eaebdb6` 已推送至既有私人 GitHub `JLO916/profitlens` main，Vercel deployment `dpl_C6WoYoo811nLC1578zNf434ycXrN` 為 production READY，公開 alias 對應同一 SHA。使用者最新指示「先做系統發布」取代下方上一輪 Live 先行順序。沒有建立新專案、公開 repo 或啟用公開 Live AI；此次只發布既有成果並補驗收文件，未改產品程式、財務定義、golden 或依賴。

- 本輪 `npm run typecheck`、`npm run lint`、`npm test -- --run` 全部 pass，34 files／766 tests。`npm run test:e2e -- --config verification/release-20261001-e2e.config.ts` 先實際 production build，再跑282項：1440×1000、768×1024、390×844各94；0 skipped／unexpected／flaky。BUILD_ID `lHUOyzPXNUWjxCt_69L8j`。首次sandbox listen3100 EPERM未跑案例，正常核准後重跑通過；完整logs保留。
- 遠端雲端 `npm ci`／build pass，13/13 HTTP smoke pass；白名單合成資料與本機一致，環境檔／Git／驗收文件等敏感靜態路徑404。公開 AI GET unavailable／PUBLIC_DEMO、POST403；三環境公開旗標確認，production三旗標明確更新，沒有 OpenAI key。
- 正式站真瀏覽器完成demo、替代三CSV＋manifest選檔、金額口徑阻擋、來源對帳、匯入後N600.00／CM10.00、DTC來源8列、明示假設試算44.00、行動確認及三格式匯出按鈕。再切Golden核對N2470.00／CM255.00與舊方案／行動過期。三尺寸目視截圖及Enter／Escape操作、當次warn/error空記錄在 `release-20261001-online-browser.json`；手動下載位元未取得，內容核對屬本機E2E證據，沒有混稱。
- 本機23個client資產無指定假canary／server-only標記；122檔受測來源hash一致。發布包文字secret有限掃描無未解釋命中，未對所有binary做OCR。完整staged whitespace檢查對原附件／raw logs有例外，保留原樣，source／自建文件檢查pass。
- Live AI／20案真人品質／真實營運資料／商業成效／Safari及實體裝置均 **not_run**。282項完整E2E跑在本機production；線上是HTTP＋人工流程，未在遠端重跑全套。runtime error查詢僅發布後短窗口，不能代表長期可用性或負載驗收。雲端Node主版範圍、ESLint支援與allowScripts維護警告另記報告，本輪未改版本。

變更與證據：README、STATUS、發布專用E2E證據副本／設定及 `verification/release-20261001-*`；受測產品版本為上述commit，後續文件提交不改產品來源。詳見 [完整發布紀錄](../verification/release-20261001-acceptance.md)、[本機工程檢查](../verification/release-20261001-checks.md)、[遠端核對](../verification/release-20261001-remote-checks.md)。系統發布完成後停止；Live AI及真實資料試用仍為獨立待辦，沒有自動開啟下一個milestone。下方保留各輪當時紀錄，以本節為最新狀態。

---

## 2026-10-01｜Live AI 驗收與發布：待本機設定

使用者已授權「先 Live AI 驗收，再系統發布」。本輪安全檢查確認目前沒有 `OPENAI_API_KEY` 或 `OPENAI_MODEL`，已請使用者在專案 `.env.local` 私下設定。**Live AI 尚未執行，系統也尚未發布**；不以 mock 或歷史驗收代替真實呼叫，不跳過指定順序。

- `npm run typecheck`、`npm run lint` 均 exit0；`npm test -- --run` 為34 files／766 passed。本輪重新執行的 logs 為 `verification/live-release-{typecheck,lint,unit}.txt`。
- 離線準備20個合成案例，每案由 domain 計算產生40筆最小彙總 facts、觀察模板與完整傳送預覽；以固定金額／null anchors 和匿名化檢查核對。這是驗收準備，所有 Live、語義品質及真人營運評分仍為 `not_run`，沒有模型呼叫。
- 核對官方 OpenAI Structured Outputs 文件，現有 SDK `responses.create`／`text.format`／strict JSON Schema 接法有效；模型由 server 環境提供，未擅自指定或更換。尚未驗證帳戶、模型支援或實際品質。
- 122個原受測來源／測試／設定 hash 與第三批相同，未改產品程式、財務定義、golden 或依賴。
- 唯讀 GitHub 檢查通過：JLO916 登入、私人 repo、遠端 main 仍為 `04e186bf7be18102e2d23b71b9d4d74fe521a2f1`。本輪 Vercel metadata 確認正式部署 `dpl_9ukTQ2nz21jQnBLEMUyaV3BRhfmX` READY 且同 commit；公開 GET unavailable、POST403／PUBLIC_DEMO。這是舊版唯讀檢查，不是新版本已發布。
- 本輪 build、E2E、真瀏覽器 Live 流程、20案模型品質評分、commit／push／deploy **未執行**。沒有接到新模型回覆，也沒有營運主管使用時間或成效數據。Vercel 遠端環境值未讀取；發布時仍須維持 PUBLIC_DEMO 後端關閉，不同步本機 key。

變更僅 README／STATUS、離線準備器與驗收文件／合成預覽／logs。詳見 [Live AI 與發布執行紀錄](../verification/live-ai-release-acceptance.md)、[案例計畫](../verification/live-ai-evaluation-plan.md)、[傳送預覽](../verification/live-ai-preview/preview.md)、[唯讀發布預檢](../verification/live-release-preflight.md)。下一步為取得私下設定後完成實際 Live 驗收，再接續已授權的既有 GitHub／Vercel 發布；不再新增產品 milestone。

---

## 2026-10-01｜實務試用準備與合成替代資料演練

使用者接受先做實務資料試用。檢查專案目前只有合成fixtures，已詢問去識別化真實三CSV的本機路徑，本轮尚未取得。**完成的是合成資料演練與待填工作表，不是已完成真實商業pilot。** 沒有更改產品程式、財務口徑、golden、依賴，也沒有push、部署或模型呼叫。

- 開工核對第三批受測來源122/122相符；沿用production BUILD_ID `p9LCsepxPsSU3ROkD0TCg`。三CSV真實選檔只讀 `tests/fixtures/alternative/` 合成資料，未尋找私人營運檔或傳送外部服務。
- 獨立Python標準庫csv＋Decimal，未import production：26個固定答案相符。本期N600.00／GP260.00／CM10.00；DTC40.00、MARKETPLACE−30.00；bridge−130.00。條件v0／δ0pp／f−50%／a0／K3＝44.00，Δ4.00；只為演練假設。
- 人工CUA走完三檔＋manifest選取、口徑阻擋、九項來源對帳、套用、診斷、DTC試算、原fact帶入行動、八筆來源查閱、確認及三格式下載按鈕。1440／768／390px截圖、Enter／Escape及console warn/error空記錄保留。人工下載事件逾時，未取得檔案位元；另列E2E真下載證據，不混稱。
- `npm test -- --run`：pass，34 files／766 tests；`npm run lint`：pass；`npm run typecheck`：初次fail（`.next/types`重複產生檔TS6200/TS2300），4檔記hash後移至 `/private/tmp/profitlens-pilot-generated-types-c_inw4jl/`保留，重跑pass。沒有刪來源或修改tsconfig排除錯誤。
- `npm run test:e2e -- --config verification/pilot-e2e.config.ts`：pass，9/9，22.18秒，三尺寸各3項、0 skipped／unexpected／flaky、retries0。沿用既有M6完整流程／獨立context／stale候選三項原斷言，僅改本輪輸出位置；對既有3200 PUBLIC_DEMO production執行。真正下載JSON／CSV／Markdown並核對快照、金額、假設及證據。
- 本輪 `npm run build`、全套282 E2E、live AI、真實資料／使用者任務耗時／實際採納／商業收益皆**未執行**。產品來源未變，build及282全套沿用第三批歷史證據，不能算本輪重跑。

新增 [PILOT_WORKSHEET.md](PILOT_WORKSHEET.md)、[本輪驗收報告](../verification/pilot-rehearsal-acceptance.md)、獨立對帳、手動browser receipt、四張截圖及驗收用E2E副本／設定；README／STATUS更新。工作表所有真實資料與使用者結果保持空白，沒有聯絡試用者或代填成效。下一步需要授權且去識別的標準三CSV、同範圍獨立來源總額及來源口徑確認；若只有平台結算／含稅訂單報表，先釐清轉換，不自行補成本或分攤廣告。

---

## 2026-10-01｜管理者評閱改善第三批 PL-10（僅本機預覽）

依「繼續進行下一輪」完成第三批。開工先核對第二批120檔快照及重跑751項baseline；沒有重建專案。完成每頁AI可用性提示、不可用時收起整段傳送流程、可用時中文精確彙總預覽、獨立進階驗證頁，以及主管語言／字級／稽核資訊收合。**第三批完成即停，三批本機改善尚未push或部署**。Git HEAD仍為 `04e186bf7be18102e2d23b71b9d4d74fe521a2f1`，保留先前未提交工作。

| 檢查 | 本輪實際結果與證據 |
|---|---|
| typecheck | pass：`npm run typecheck` exit0；`manager-batch3-typecheck-final.txt` |
| lint | pass：`npm run lint` exit0；`manager-batch3-lint-final.txt` |
| 全部unit/integration | pass：`npm test -- --run`，34 files／766 tests；`manager-batch3-unit.txt` |
| production build | pass：最終E2E webServer實際執行 `NEXT_TELEMETRY_DISABLED=1 npm run build && npm start -- --port 3100`；不是另跑standalone build。BUILD_ID `p9LCsepxPsSU3ROkD0TCg` |
| 全部E2E | pass：`npm run test:e2e` exit0，282 passed／0 unexpected／0 skipped／0 flaky；retries0；1440×1000、768×1024、390×844各94項，285秒。`manager-batch3-e2e-final.txt`／`manager-batch3-e2e-results.json` |
| 人工真瀏覽器 | pass（記錄範圍內）：Codex in-app browser、同最終production build、PUBLIC_DEMO3200；三尺寸載入、缺漏／blocking保留、中文診斷、Enter展開／證據、Escape關閉；warn/error空。`manager-batch3-manual-browser.json`及6張手動截圖 |
| 列印 | pass（Chromium產生PDF）：Golden摘要1頁，已用pypdf抽字並渲染目視；原生列印對話框／實體列印not_run |
| 後端／bundle | pass：`python3 verification/manager-batch3-check.py` exit0；21個前端JS無指定非秘密canary／server-only變數名稱；PUBLIC_DEMO GET unavailable、POST403，無live呼叫。`manager-batch3-security.json` |
| 來源完整性 | pass：受測122檔hash相符；本輪domain15／golden5／schema1／package2未變；原fixtures／評閱包等56檔保留。`manager-batch3-final-source-check.json`／`manager-batch3-integrity.json` |
| 人工匯入／下載／備份恢復 | not_run：本輪人工聚焦PL-10；全套E2E實際選檔、三格式下載內容、隔離與恢復另為pass，不能當人工結果 |
| live AI／真實營運資料／線上驗收 | not_run：沒有真實key；可用／拒絕／故障等AI路徑僅mock。未push／部署／重新測線上 |

先寫測試取得AI呈現11項失敗、語言4項失敗，再完成實作；補測重掛畫面不得誤稱「尚未傳送」與狀態查詢失敗不得誤稱「已停用」，先2 failed／9 passed再全綠。第一次E2E為102 passed／5 failed／1 interrupted／174未執行（exit130主動停止），失敗為新增heading定位不唯一及全頁status定位受新增提示影響。改為指定層級、工作區testid／稽核區域，未放寬數字或安全斷言；重跑282全過。初始與最終紀錄均保留。詳見 [完整第三批驗收](../verification/manager-batch3-acceptance.md)。

變更：dashboard、ai-panel、workspace-panels、decision-workbench、actions-workbench、issue-list、globals.css與ai-client文案；新增2份unit及1份E2E，既有E2E更新進階驗證入口、精確定位與本批證據檔名；Playwright設定、README／AI_CONTRACT／ARCHITECTURE／ACCEPTANCE／DECISIONS／STATUS。逐檔見 `verification/manager-batch3-changes.json`。未改財務函式、AI provider／server、payload契約、golden答案、套件或lockfile。

本機操作：開 [3200預覽](http://127.0.0.1:3200/)，載入示範或匯入標準CSV；Golden與錯誤樣本在「進階驗證」。切到該頁不換資料，按載入才驗證，成功後回總覽。診斷的中文事實可直接點金額查來源；fact／rule／版本仍留在稽核資訊。公開模式即時AI後端關閉，規則、計算、方案與匯出仍可用。

限制：可用AI預覽仍是前後期共40筆所選通路合計，不含個別匿名通路拆解，不能讓模型據此指定某通路是原因；本批未新增預錄AI示例。能力查詢在本次掛載時取得，環境設定更動需重新載入；真正POST仍由伺服器即時守門。Safari、實體裝置、讀屏、正式資料與極限資料量效能未驗收。三批評閱改善已完成；後續實務試用或發布另行指定，下方為各階段當時紀錄。

---

## 2026-10-01｜管理者評閱改善第二批 PL-05–09（僅本機預覽）

依「繼續進行下一輪」完成評閱第二批，先核對第一批開工hash並重跑663項baseline，不以歷史綠燈代替本輪驗收。新增主管摘要、診斷帶入行動、獨立跨範圍行動／最多三項置頂、商品兩期差異、閉合式門檻與三組敏感度、會議稿與通路寬表。**第二批完成即停，第三批PL-10未開始，未推送或部署。** Git HEAD仍為 `04e186bf7be18102e2d23b71b9d4d74fe521a2f1`；保留第一批未提交工作，沒有新增依賴或更改golden答案。

| 檢查 | 本輪實際結果與證據 |
|---|---|
| typecheck | pass：`npm run typecheck` exit0；`manager-batch2-typecheck.txt` |
| lint | pass：`npm run lint` exit0；`manager-batch2-lint.txt` |
| 全部unit/integration | pass：`npm test -- --run`，32 files／751 tests；`manager-batch2-unit.txt` |
| production build | pass：standalone build；最後修改凍結後E2E再次實際build成功才start。最終BUILD_ID `LSy2XrLTPaOxDuUpKF9iP` |
| 全部E2E | pass：`npm run test:e2e` exit0，258 passed／0 unexpected／0 skipped／0 flaky，retries0；1440×1000、768×1024、390×844各86項，315秒；`manager-batch2-e2e-final.txt`及`manager-batch2-e2e-results.json` |
| 人工真瀏覽器 | pass（記錄範圍內）：Codex in-app browser、同一最終production build、3200；三尺寸摘要／行動／歷史來源／情境敏感度／商品差額，Enter/Escape／表內方向鍵。`manager-batch2-manual-browser.json`及`manager-batch2-manual-*.jpg` |
| 列印 | pass（Chromium PDF）：Golden摘要1頁，已渲染目視；OS列印對話框及實體列印not_run |
| 人工下載位元 | not_run：CUA下載事件逾時，未取得檔案路徑；E2E真正下載及內容核對另為pass。人工三檔匯入／備份恢復本輪未重做，完整E2E已覆蓋 |
| 本機後端／bundle | pass：`python3 verification/manager-batch2-check.py`；21個前端JS沒有指定非秘密canary／server-only變數標記；GET unavailable、POST403 PUBLIC_DEMO，無模型呼叫。`manager-batch2-security.json` |
| 來源與原始檔保留 | pass：120個受測程式／測試／設定最後hash一致；評閱包、fixtures、golden、AGENTS、schema、package／lock共56檔未變。`manager-batch2-final-source-check.json`及`manager-batch2-integrity.json` |
| Live AI／真實資料 | not_run：無真實key，本輪無此驗收；mock不代表已連線或成效 |
| production／第三批 | not_run：未push、未部署、未重新檢驗線上版本、未開始第三批 |

初始EPERM無法listen3100時未跑瀏覽器；核准本機測試後執行。第一個瀏覽器run41 passed／5 failed／1 interrupted／211未執行；第二個120 passed／4 failed／1 interrupted／133未執行，均發現問題後主動停止（exit130），沒有當作通過。修正select可及名稱、舊行動頁locator、資料就緒等待、multiple-select順序測試及原商品CSV搜尋metadata大小寫回歸，再補置頂實際順序、安全binding與歷史匯出測試，最後258全部通過。整合typecheck／build失敗及環境生成型別競爭也保留，修復後序列執行通過。詳見 [第二批完整驗收](../verification/manager-batch2-acceptance.md)。

變更：新增domain商品比較／敏感度；application獨立action-workspace、manager-summary、商品比較CSV；新增行動、主管摘要、商品比較與敏感度元件；整合dashboard／診斷／情境／保存；備份v2可讀有效v1，各行動保留自己的資料、fact、期間、scope與stale。完整決策輸出帶全部行動及各自證據，不混用目前資料。新增6個unit/integration及4個E2E檔；README／PRD／ARCHITECTURE／SCENARIOS／ACCEPTANCE／DECISIONS／STATUS與驗收證據更新。逐檔見 `verification/manager-batch2-changes.json`。

本機：[預覽3200](http://127.0.0.1:3200/)（服務運行時有效）。Golden摘要收入差+220.00、貢獻差-315.00；DTC履約單位成本-10%、銷量0、其他0仍284.00，K20仍264.00。敏感度是固定假設試算，不是預測；商品不分攤通路廣告；缺值不補零，沒有更改財務定義。

已知限制：摘要門檻／所選方案、商品篩選及三組敏感度是頁內暫存，不存入備份；正式方案／行動需主動保存。跨歷史context備份包含各自標準CSV，總上限64MiB，超限拒絕；最大資料量與大量行動效能未驗收。列印可續頁，不保證任何資料量都一頁。Safari／實體裝置／讀屏／原生列印未驗收；未提供新增雲端同步、平台API、預測或AI成效保證。

下一候選為評閱第三批PL-10：公開版AI未啟用說明、進階驗證入口及主管語言收斂；本輪未開始。下方保留各階段當時紀錄，不代表最新狀態。

---

## 2026-10-01｜管理者評閱改善第一批 PL-01–04（僅本機預覽）

依使用者要求安全解壓 `ProfitLens_Manager_Review_20261001.zip` 至 `reviews/ProfitLens_Manager_Review_20261001/`，閱讀全部 11 檔；按包內建議只執行第一批。評閱內容是改善依據，不視為雲端部署或其他外部操作的授權。本輪未 push main、未部署；原 Git HEAD 仍為 `04e186bf7be18102e2d23b71b9d4d74fe521a2f1`。唯讀核對線上 Vercel READY 版本與此 HEAD 相符。公開站不含本輪未提交變更。

完成：完整自然月／相同天數比較、前期先於本期、合計與 Decimal 日均、AI／決策／分析匯出模式同步；明確同意本機保存、完整工作區 JSON 及重驗恢復、過期保留、未保存提醒與刪除副本；三 CSV 中文欄位說明與空範本、需確認的日期／通路提議、來源至標準欄位與指標對帳、拒絕未整理的含稅／淨結算口徑。

| 檢查 | 實際結果與證據 |
|---|---|
| 原核心 baseline | pass：96 tests；`manager-batch1-baseline.txt` |
| typecheck | pass：`npm run typecheck` exit 0；`manager-batch1-typecheck-final.txt` |
| lint | pass：`npm run lint` exit 0；`manager-batch1-lint-final.txt` |
| 全部 unit/integration | pass：`npm test -- --run`，26 files／663 tests；`manager-batch1-tests-final.txt` |
| production build | pass：完整 E2E 的 webServer 實際執行 `NEXT_TELEMETRY_DISABLED=1 npm run build` 後啟動 production server；同 E2E log |
| 三尺寸完整 E2E | pass：`npm run test:e2e` exit 0，225 passed／0 failed／0 skipped；1440×1000、768×1024、390×844，無 retry；`manager-batch1-e2e-final.txt`、`manager-batch1-e2e-results.json` |
| 人工真瀏覽器 | pass：Codex in-app browser、本機 production 3200；三檔真正選取、月比較／對帳、日均公式、診斷、條件方案、行動、保存／重整／預覽確認恢復／刪除／清空取消；1440×900、1366×768、768×1024、390×844 截圖。`manager-batch1-manual-browser.json`、`manager-batch1-manual-*.png` |
| 本機後端與 bundle | pass：22 個前端 assets 無假 canary／server-only markers；PUBLIC_DEMO POST 403、no-key／disabled／no-consent 正確降級；`manager-batch1-security.json`。未呼叫模型 |
| 原資料保留 | pass：ZIP 11 檔與解壓位元相同；fixtures、golden、AGENTS、schema、package／lock 共 45 個追蹤檔與 HEAD 相同；`manager-batch1-integrity.json` |
| Live AI／真實營運資料 | not_run：無真實 key、不在本輪驗收；mock 不代表連線或商業成效 |
| production 發佈／第二三批 | not_run：本輪先提供本機 preview，完成第一批即停 |

初次 E2E 保留：81 passed、5 failed、1 interrupted、135 未執行，確認失敗原因後主動停止（exit 130），不是通過。修正測試對 beforeunload 的處理、超長日期 fixture 的 as_of 及來源翻頁，再加入真實問題回歸（清空也要清掉備份候選／同意暫存），最終 225 全過。初次 typecheck 發現 `.next/types` 36 個重複產生檔，先記 hash 再移到 `/tmp` 保存，沒有刪除或改動來源；清理後 typecheck 通過。詳見 [本輪驗收報告](../verification/manager-batch1-acceptance.md)。

變更檔案：domain 日期／comparison／types／validation／analysis；application workspace-backup、local-store、import-guidance、import、decision／export／AI snapshot；components dashboard、storage、import、overview、decision-workbench 與 CSS；AI 契約／grounding／prompt 版本；新增 4 個 unit test files、3 個 E2E specs，調整既有回歸；README、規格、DECISIONS、ACCEPTANCE、eslint／Playwright 設定、`.vercelignore` 與本輪 verification。完整清單見驗收報告。沒有新增依賴。

本機操作：[目前預覽](http://127.0.0.1:3200/)（本機服務運行時有效，PUBLIC_DEMO 關閉 live AI）；日後可 `npm run dev`。比較模式需套用，日期／通路提議需確認；保存只存已套用範圍及可恢復工作稿，不存未套用匯入／日期草稿、商品搜尋或 AI 同意。手動保存 IndexedDB 未做應用程式層加密，同瀏覽器使用者可手動恢復；不自動同步，不等同雲端備份。人工操作匯出按鈕與提示已確認，人工未讀回下載位元，E2E 已真下載並核對內容／恢復。

停止點：第一批完成。下一候選為評閱包第二批（診斷帶入行動、商品差異、主管摘要、敏感度），尚未開始；公開 live AI、平台串接、多人／雲端同步、訂單自動彙總與自動稅額換算仍不支援。

---


## 2026-10-01｜使用者授權 GitHub／Vercel 首次部署

本輪依「先將此版本推送部署至 github 及 versel」執行，授權範圍為目前版本的 GitHub 與 Vercel。沒有新增產品功能或開始新 milestone。下方 M6–M0 為各輪當時狀態，當時「未部署」不代表目前狀態。

- GitHub：私人 [JLO916/profitlens](https://github.com/JLO916/profitlens)，main；首次程式快照 `b95c92ae112d08edd4930a41b64abb8e32390a00`。保留原規格、fixtures、golden 及驗收證據；沒有 push 環境 key／node_modules／私人資料目錄。
- Vercel：`jlo916s-projects/profitlens`，Production **READY**；[正式網址](https://profitlens-tau.vercel.app)。首次部署 `dpl_3CxqBVmb1Fh7Bdr95cj8vxGKQL93`，Git main 連接成功。
- 三環境均設 PUBLIC_DEMO，ENABLE_LIVE_AI=false，沒有 OpenAI key；線上 GET `/api/insights` unavailable、POST **403 / PUBLIC_DEMO**。Live AI **未執行**。
- 雲端 `npm ci`、Next.js 16.3.7 `npm run build`（含 TypeScript）成功，build output 53 秒；專案 Node 設定 24.x。固定 ESLint deprecated、engine 開放未來 major、unrs-resolver install-script 提示保留於 log，未改依賴或 lockfile。
- 線上 HTTP：13 checks 通過，包含首頁、五份合成資料 manifest／三 CSV bytes 與本機一致、AI 關閉、非白名單／環境檔／Git／verification／CSV 實體路徑 404。
- 真瀏覽器：Demo 本期收入 7,850,657.90／貢獻 1,269,792.73；Golden 收入 2,470.00／貢獻 255.00，通路 DTC 270.00、MARKETPLACE −15.00；規則診斷 16 項與公開展示關閉 AI 提示。console warn/error 無；保存 jpg 與 browser JSON。
- Runtime logs：首次 deployment、30 分鐘範圍、5xx 查詢沒有記錄；這是短時抽查，不是持續監測或無錯誤保證。
- 本輪沒有修改財務／UI／AI production 程式，**未重跑**本機 615 unit/integration、lint 或 186 E2E；M6 的已執行結果與證據保留。公開環境完整匯入→匯出與三尺寸 E2E未重跑，不能把本次 smoke 當作全套線上驗收。

變更：`.gitignore`（測試產物萬用字元與工具資料夾排除）、`.vercelignore`、`vercel.json`、README、STATUS、`verification/deployment-*`。部署過程兩個環境 CLI/API 操作失敗已解決；初次 HTTP helper 因 Python 自動轉換 CRLF 錯報 CSV 不同，改以原始 bytes 核對後全部通過，初次結果保留。完整命令與限制見 [deployment-acceptance.md](../verification/deployment-acceptance.md)。

停止點：目前版本已部署；仍不支援公開 live AI、持久化、登入、正式平台 API；不繼續增加功能或付費服務。

---

## 歷史紀錄：M6

更新日期：2026-10-01（Asia/Taipei）。本輪只執行 **M6 獨立驗收與已重現問題修復**，完成後停止。未將 M5 綠燈當成本輪證明；已重讀完整 acceptance 與當前狀態。**本機與 mock 驗收通過，live AI 未實測，沒有公開 repo／雲端專案／部署。**

完整 49 項 acceptance 的逐列 pass/fail/not_run、操作說明與公開示範前檢查：[verification/app-acceptance.md](../verification/app-acceptance.md)。下方保留 M5–M0 歷史，不以歷史文字覆蓋本輪結果。

| 項目 | M6 真實結果 |
|---|---|
| 初始查核 | 既有 586 tests、typecheck、lint、build 本輪重新執行通過；非 Git repo，沒有初始化 |
| 獨立審查 | 財務／scenario、安全／AI、UI／匯入／隔離三個範圍重新查規格與程式；未找到可重現財務核心錯誤 |
| 已重現修復 | 合法 AI 數值在自由欄位被改稱錯誤 period／scope／metric／公司淨利；中文金鑰／密鑰索取；中文預算數字漏網 |
| 修復方式 | 數值 placeholder 僅允許 catalog observation；其他欄位只作質性核查，已知詞型回歸；prompt v2。沒有改商業定義／schema／golden |
| Unit／integration | **22 files／615 passed**，0 skipped/todo；新增 10 財務 probes + 19 安全回歸 |
| typecheck／lint | 最終均 exit 0，lint 0 errors/warnings；中間環境失敗另列 |
| build | 初始 standalone Webpack build exit 0；修復後 full E2E 重新 production build 成功，保存 BUILD_ID／SHA-256 |
| Chromium E2E | **186 passed**，195.9秒，0 skipped/unexpected/flaky，retries=0；1440×1000／768×1024／390×844 |
| 完整操作鏈 | alternative 真匯入→診斷→DTC40基準→v0/δ0/f−50/a0/K3→44條件結果→行動→三格式真下載，3尺寸均通過 |
| 隔離 | 真正兩個獨立 browser context 各自匯入與試算，清空／重整不影響另一方；原單分頁、stale、零持久化回歸也通過 |
| 人工瀏覽器 | CUA實際選取三CSV與manifest、核對預覽／口徑、診斷來源、明填情境及七欄行動，操作三種下載；3尺寸截圖已目視，390方向鍵可橫捲 |
| 人工下載限制 | CUA download事件等候逾時，UI顯示已下載，但**沒有取得CUA下載路徑或讀回檔案**；Playwright真下載位元及三格式內容另驗證通過 |
| 安全production HTTP | PUBLIC_DEMO有假key仍POST403；NO_KEY／DISABLED fallback；未同意POST400；均no-store，未進模型orchestration |
| Secrets／bundle | 同M6假canary新build的22靜態資源掃描無canary/server SDK標記，server logs無canary；沒有讀出或使用真實key |
| 全新本機啟動 | 無node_modules/.next/.env.local的暫存副本，lockfile離線npm ci新增442packages、typecheck、無key dev HTTP200成功，AI關閉；測試server已停止 |
| 原檔保留 | 373個開工既有檔案SHA-256核對；無刪除。fixtures/errors/golden/spec、財務domain／契約、package/lockfile及既有verification全部未變 |
| Live／公開／成效 | **未執行**：無真實key、未建公開環境；不宣稱真實模型品質、商業提升或完整安全認證 |

## M6 變更檔案

- Production：`src/ai/grounding.ts`、`prompt.ts`、`provider.ts`，僅針對已重現輸出漏洞收緊驗證與提示版本。
- 新測試：`tests/m6-financial-audit.test.ts`、`tests/m6-security-audit.test.ts`、`tests/e2e/m6-acceptance.spec.ts`。
- 既有測試：`tests/ai-grounding.test.ts` 更新與新契約衝突的一個測試，保留來源immutability檢查；`ai-provider`／`ai-service`／`ai-client`與E2E AI mock metadata同步v2。
- `playwright.config.ts`、既有4個E2E spec、`scripts/verify-ai-security.mjs`：artifact與非秘密canary改M6，沒有覆寫M0–M5驗收證據。
- `README.md`、`docs/DECISIONS.md`、本STATUS、`verification/app-acceptance.md`及`verification/m6-*`：本機操作、修復原因、真實結果、限制與公開前檢查。
- 原始 `spec/insight-output.schema.json`、golden expected、財務規格、domain、依賴/lockfile與產品UI程式沒有修改；未加入新大功能。

## M6 實際命令與證據

| 命令 | 結果與檔案 |
|---|---|
| `npm run typecheck` | 最終exit0；`verification/m6-typecheck.txt` |
| `npm run lint` | exit0；`verification/m6-lint.txt` |
| `npm test -- --run` | 22files／615passed；`verification/m6-tests.txt` |
| `NEXT_TELEMETRY_DISABLED=1 ENABLE_LIVE_AI=false OPENAI_API_KEY=sk-PROFITLENS-M6-NONSECRET-BUNDLE-CANARY OPENAI_MODEL=verification-only-never-called APP_MODE=LOCAL npm run build` | 初始exit0；`m6-build-initial.txt`。金鑰字串是刻意可見的假canary，不是真實秘密 |
| `npm run test:e2e` | 修復後再build＋production start；186passed，`m6-e2e.txt`／`m6-e2e-results.json`，`m6-build-provenance.json` |
| `node scripts/verify-ai-security.mjs` | exit0；22assets＋4模式；`m6-security-check.txt`／`m6-security.json` |
| `npm test -- --run tests/m6-security-audit.test.ts`（修復前） | exit1／8failed，`m6-security-red.txt`；實際重現漏洞，沒有刪除失敗證據 |
| 安全10檔targeted命令（完整命令見安全子報告） | 最終312passed，`m6-security-green.txt` |
| `npm test -- --run tests/m6-financial-audit.test.ts` | 10passed，`m6-financial-probes.txt`；沒有財務production bug，未虛構RED |
| `npm ci --offline --no-audit --cache /tmp/profitlens-npm-cache` | 全新暫存副本exit0／442packages，`m6-clean-install.txt`；未執行線上依賴audit |
| `npm run typecheck`（全新副本） | exit0，`m6-clean-typecheck.txt` |
| `NEXT_TELEMETRY_DISABLED=1 ENABLE_LIVE_AI=false OPENAI_API_KEY= OPENAI_MODEL= npm run dev -- --port 3210` | fresh ready326ms；首頁200、空工作區、AI unavailable；`m6-clean-start.json`，驗收後SIGTERM正常停止 |
| CUA真實瀏覽器 | `m6-manual-browser.json`、`m6-manual-*.jpg`；warn/error為空；UI流程完成，下載事件工具限制如上 |

最終E2E具62情境×3尺寸。新增9項與既有177項全部通過；未靠重試或跳過掩蓋錯誤。E2E與安全檢查使用明顯假canary、mock transport／route，不會呼叫OpenAI。原始錯誤注入logs保留，不能把「已知503/取消」當作未發生。

## M6 失敗與環境處理

1. 新安全測試先8failed。初修後163passed／1failed，原因是舊測試要求自由欄位合法placeholder可顯示；經獨立確認漏洞後改為應拒絕，原observation來源不可變仍驗證。提示版本同步v2。最終19新增安全回歸與全套均綠；詳見 `m6-security-review.md`、DECISIONS。
2. 子審查兩次typecheck被TS2688阻擋：先`d3-array 2`／`d3-scale 2`，其後另外8個`@types/* 2`。主流程逐一列出內容確認皆空才rmdir，保留原套件，未改tsconfig。來源原因不明，不推稱特定同步工具造成；`m6-environment-repair.json`列10目錄。最終現有專案與全新安裝typecheck都通過。
3. CUA原生date填寫在工具fill後未更新React state，改用真實方向鍵輸入並Tab後確認成功；沒有改產品以迎合工具。Markdown download事件等候30秒逾時導致CUA session重置；重新取得原tab後確認資料與「已下載」狀態仍在，後續CSV/JSON實際點擊完成。沒有把未讀回位元稱為人工檔案驗收，另有E2E download檢核。
4. clean npm ci有eslint9.39.5 deprecated提示；本輪未升級依賴、未做最新線上漏洞audit，不沿用M5的當時0漏洞宣稱。Node NO_COLOR/FORCE_COLOR提示是runner環境，非App lint錯誤。

## M6 本機操作、限制與停止點

操作說明已更新README：三CSV＋表單/選讀manifest，檢核通過後套用；看規則與來源；單一通路明填五假設試算；填七欄行動與fact引用，下載Markdown/CSV/JSON。更換資料/期間後舊稿過期，重新整理清空；匯出不是原始CSV備份，也不支援重新匯回復原。

**已可實際使用**：本機標準CSV驗證、精確財務計算、缺漏傳遞、趨勢與bridge、通路診斷、商品毛利、條件試算、人工行動與下載。行銷後貢獻不是公司淨利、bridge不是因果、條件結果不是商業成效。

**仍不支援／未驗收**：正式平台API、登入/資料庫、跨session儲存、多人共享、SKU廣告歸因、完整淨利、預測/最適投放；live AI與真實模型品質未實測。Safari/Firefox、原生手機、螢幕閱讀器、最大量效能、真實業務pilot、公開host安全環境也未執行。有限文字防線不保證所有自然語義安全。

公開合成示範前依README與acceptance檢查表盤點資料、環境秘密與logs；PUBLIC_DEMO後端關閉live且在實際host重測403。此次只在本機production驗證，不是部署授權。Local Host/Origin不是公開認證，沒有公開live AI認證／限流／預算能力。

**下一步**：M0–M6本機流程到此停止。若要真實資料pilot、live模型品質驗收或公開合成展示，另行授權與規劃，不自動開始新功能、建雲端或部署。

---

## 歷史紀錄：M5（下列為前輪原文）

更新日期：2026-10-01（Asia/Taipei）。本輪只執行 **M5 選配 AI 解釋層**。沒有真實 API key，沒有呼叫真實模型；完成可配置的 server-side provider、mock／本機 HTTP／瀏覽器驗收。未開始 M6、未部署。M4–M0 原文字紀錄保留於後方歷史區，M4 JSON 證據檔的覆寫疏漏另明列如下。

| 項目 | M5 實際狀態 |
|---|---|
| 開工前 | 既有 379 tests、typecheck、lint 通過，含 M1 golden、M4 S01–S07；沒有重新初始化 |
| Provider | 固定官方 `openai@7.25.0`；Responses `text.format` strict JSON Schema，模型只讀 server `OPENAI_MODEL`，沒有預設模型 |
| 最小資料／同意 | 前本期各 20 個已算指標，共 40 個匿名彙總 facts；完整 JSON 預覽、OpenAI 接收端、逐次快照同意；原始檔、SKU、通路／資料集／檔名及來源行號不傳送 |
| 數值／語意 | 觀察選自程式目錄、fact／metric／period／scope／引用集合檢核；金額比率由合法 placeholders 填值；拒絕已知無支持數字、錯引用、因果、收益保證與憑證索取 |
| 故障／過期 | no-key、timeout、429、拒絕、截斷、schema／semantic、取消及 stale 均保留規則診斷；只對 schema／semantic 最多重試一次 |
| 核心獨立 | M1–M4 計算、圖表、匯入、情境及行動匯出不依賴模型；沒有自動建立或執行 AI 行動 |
| 單元／整合 | 20 files／586 passed；原 379＋M5 207，無 skipped／todo |
| typecheck／lint | exit 0；lint 0 errors／0 warnings |
| build | 正式 Webpack build exit 0；最終 E2E 再建置成功，含 `/api/insights` Node route |
| Chromium E2E | exit 0，177／177 passed（約 2.7 分鐘）；39 項 M5＋138 項既有回歸，0 skipped／unexpected／flaky，retries=0 |
| 真實本機 HTTP | PUBLIC_DEMO（即使有假 key）POST 403；NO_KEY／DISABLED 明確 fallback；可配置模式 GET available，未同意 POST 400，均 no-store |
| Bundle／logs | 建置使用明顯非秘密 canary；22 個 `.next/static` 資源無 canary／server key／SDK 標記，正式 server logs 無 canary，封鎖請求沒有進入模型 orchestration |
| 人工瀏覽器 | 內建瀏覽器實際載入 golden、檢查預覽及停用狀態、開啟 F033 的 255.00 公式來源、Esc 返回焦點；warn／error logs 為空 |
| Live 模型／品質 | **未執行**：沒有真實 key。未測帳戶模型支援、真實拒絕／配額／供應商保留行為，未量測人工修改量、理解時間或商業提升 |
| 原檔核對 | 開工時 273 個既有檔案逐檔 SHA-256 核對；未刪除檔案，70 個原 fixtures／golden／spec／財務核心與指定規格完全未變更；M4 JSON 覆寫例外如實記錄於下方與 `m5-preservation.json` |

## 完成內容與變更檔案

| 檔案 | 用途 |
|---|---|
| `src/ai/contracts.ts`、`grounding.ts` | strict 匿名輸入／輸出 schema、受限觀察目錄、雙端引用與已知語意防線、程式數值填入 |
| `src/ai/provider.ts`、`prompt.ts` | provider interface、固定 prompt version／不可信資料邊界、固定修復指令 |
| `src/ai/config.ts`、`openai-provider.ts`、`service.ts` | server-only 環境設定、SDK transport、取消／timeout／有限重試、非內容型 metadata 日誌 |
| `src/app/api/insights/route.ts` | 真實 GET 能力查詢／POST endpoint；PUBLIC_DEMO 先封鎖，local Host／Origin、64 KiB、格式、schema 及同意檢查 |
| `src/application/ai-snapshot.ts`、`ai-client.ts` | 最小匿名 facts、本機來源映射、完整 payload 同意綁定、stale／取消、二次驗證與顯示 |
| `src/components/ai-panel.tsx`、`dashboard.tsx`、`src/app/globals.css` | 診斷頁 AI 區塊、接收端與預覽、同意／取消、明確模式、證據開啟與響應式樣式 |
| `tests/ai-{config,provider,service,grounding,client,route}.test.ts`、`tests/helpers/ai-server.ts` | 207 項合成及 mock 驗證；SDK transport、provider 與 route 全部禁止真實 API 呼叫 |
| `tests/e2e/ai.spec.ts` | 13 情境 × 3 尺寸，39 項 M5 瀏覽器驗收；mock 回應標示 `mock-browser-only` |
| `playwright.config.ts`、三個原 E2E spec | 既有斷言保留，改 M5 artifact 路徑；測試環境強制 live 關閉並使用假 canary |
| `scripts/verify-ai-security.mjs` | 可重跑的前端資源與正式本機 HTTP／server log 隔離驗收，不傳模型資料 |
| `vitest.config.mts`、`.env.example`、`package.json`、`package-lock.json` | Node 單元測試 server-only alias、server 環境空白範本、固定 SDK 依賴 |
| `README.md`、`docs/DECISIONS.md`、`docs/M5_EVALUATION.md`、`docs/STATUS.md`、`verification/m5-*` | 配置、使用與限制、24 案例評估、實際 RED／GREEN、瀏覽器／HTTP／隔離證據 |

原始 `spec/insight-output.schema.json` 保留；SDK 使用其 JSON Schema，應用另加資源上限與語意限制。依當時官方 [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) 使用 Responses `text.format`；[Responses 儲存設定](https://developers.openai.com/api/docs/guides/migrate-to-responses) 為 `store:false`，不承諾供應商絕不保留資料。沒有工具權限、原始 CSV、額外傳送目的端或不可信字串指令。

## 實際命令與結果

| 命令／檢查 | 實際結果與證據 |
|---|---|
| `npm test -- --run`、`npm run typecheck`、`npm run lint`（開工前） | 全部 exit 0；379 tests；`m5-baseline-*.txt` |
| `npm view openai version`（使用暫存 cache 與有限網路重試） | sandbox 查詢 `ENOTFOUND`；經原核准流程查詢成功為 7.25.0，不猜版本。後續另一受限環境重查亦 ENOTFOUND，沒有冒記通過 |
| `npm install --save-exact openai@7.25.0 --cache /tmp/profitlens-npm-cache --fetch-retries=1 --fetch-timeout=30000` | exit 0，新增 1 套件、audit 443、當次 0 vulnerabilities；`m5-install.txt`，不代表未來無漏洞 |
| `npm test -- --run tests/ai-grounding.test.ts`（初始 RED） | 36 failed；`m5-grounding-red.txt`，實作後加邊界共 52 passed |
| config／provider／service／client 測試先行 | config RED 13 failed／11 passed；provider 8 failed；service 21 failed；client 17 failed。`m5-{config,provider,service}-red.txt`、`m5-ai-client-red.txt` |
| 憑證索取、設定競態、NextRequest 追加回歸 | 分別先 6、6、5 failed，再修正通過；`m5-credentials-red.txt`、`m5-ai-client-config-race-red.txt`、`m5-next-request-gate-red.txt` |
| `npm test -- --run`（最終） | exit 0，20 files／586 passed；`m5-tests.txt` |
| `npm run typecheck`（最終） | exit 0；`m5-typecheck.txt` |
| `npm run lint`（最終） | exit 0，0 errors／0 warnings；`m5-lint.txt` |
| `NEXT_TELEMETRY_DISABLED=1 npm run build` | exit 0；`m5-build.txt`。後續最終 E2E 同樣重新執行 production build 成功 |
| `npm run test:e2e -- tests/e2e/ai.spec.ts --project=desktop` | 經核准後 exit 0，13 passed；`m5-e2e-desktop.txt`、`m5-e2e-desktop-results.json` |
| `npm run test:e2e`（最終） | exit 0，177 passed，約 2.7 分鐘；`m5-e2e.txt`、`m5-e2e-results.json`；39 M5＋138 回歸，0 skipped／unexpected／flaky |
| `node scripts/verify-ai-security.mjs` | exit 0，22 資源掃描＋4 種 production HTTP 模式；`m5-security-check.txt`、`m5-security.json` |
| 內建瀏覽器 CUA | 真實本機停用流程、公式來源與鍵盤驗收；`m5-inapp-browser.json`、`m5-inapp-disabled.jpg` |
| `git status --short` | `fatal: not a git repository`；沒有 init、commit 或建立遠端 |

單元／mock 分組：config 51、SDK provider 8、service 21、grounding 52、client 37、route 38，共 207。SDK 測試使用假的 `fetch`，service 使用注入 provider，route 也固定 mock 並禁止真網路；E2E 回應攔截只存在測試，不提供產品 mock 開關。這些結果不是實際模型品質或連線證明。

## 失敗、修正與證據檔限制

- provider 初次 GREEN 候選有 2 fail：REST mock 沒有 SDK convenience `output_text`；改從 `output[].content[]` 的 output_text 項目取回文字，拒絕／截斷先處理。`m5-provider-before-output-fix.txt` 保留。
- service 正例未加假說固定前綴而有 2 fail；補齊正例與固定 prompt 契約，不放寬驗證。`m5-server-check.txt` 保留。route 首次 1 fail 是 helper 將大小寫 header 合併，修測試 header 建置；`m5-ai-route-initial.txt` 保留。
- route 測試新增 callback 少型別註記，typecheck／E2E build 曾失敗，已補型別。另在 `node_modules/@types` 出現 8 個名稱尾綴 ` 2` 的空目錄，使 TypeScript 誤讀為 type libraries；確認為空才移除，未改 tsconfig 去跳過錯誤。原因不明，不推稱是特定同步服務造成。`m5-typecheck-before-route-fix.txt`、`m5-typecheck-empty-type-directories.txt`、`m5-empty-type-directory-cleanup.json` 及兩份 E2E 啟動失敗紀錄保留。
- sandbox 首次不允許本機 3100 listen（EPERM），該次沒有執行任何瀏覽器案例；經核准重跑，非改變 sandbox 設定。`m5-e2e-sandbox-blocked.txt` 保留。
- 額外 production HTTP 檢查發現 NextRequest 把 loopback URL 轉為 localhost，原精確 Host 比對誤擋合法設定。先以真 NextRequest 寫 RED，修為雙方皆明列 loopback、埠相同且 Origin 與實際 HTTP Host 完全相符；仍拒絕遠端、不同埠、非正規 IP、userinfo／path／query／forwarded spoof。`m5-security-before-next-url-fix.txt` 保留；修後正式 HTTP 可配置但未同意仍封鎖，未發送模型請求。
- **M4 最終 JSON 報告未能保留：** M5 執行 Playwright `--list` 時 reporter 尚指向 `verification/m4-e2e-results.json`，原完整 JSON 被覆写且無完整備份。當時清單已移存 `m5-e2e-list.json`；原路徑現在是明確 `original_report_unavailable` 說明及原 SHA-256，不是偽造的測試結果。M4 的 `m4-e2e.txt`（138 passed）、browser logs、截圖、首輪失敗 JSON 仍保留；不能將首輪 13／2 的 JSON 當成最終通過證據。最終 M5 完整回歸另保存新 JSON，不能回溯替代遺失的原檔。

Node 的 NO_COLOR／FORCE_COLOR 提示來自 runner 環境，不是 App lint 錯誤。沒有以重試或略過案例隱藏失敗，Playwright retries=0；最後狀態以上方最終結果為準。

正式 Chromium 尺寸為 desktop 1440×1000、tablet 768×1024、mobile 390×844。已查看三尺寸 viewport 截圖，文字可讀且未超出頁面；E2E 同時檢查水平 overflow、鍵盤啟動證據、Esc 關閉與焦點返回。`m5-mock-{desktop,tablet,mobile}-ai.png` 為全頁，`m5-mock-*-ai-viewport.png` 為可讀畫面區域；模型欄明示 mock-browser-only，不能當真實模型呼叫證據。人工截圖 `m5-inapp-disabled.jpg` 則是真實未啟用狀態。

`m5-browser-meta.jsonl` 只記 metadata，39 個最終 M5 案例均 passed，無 pageerror／console error／意外 dialog。原 138 項回歸另留 `m5-regression-*`，故意注入的 503／取消請求等預期錯誤保留，不清空 logs 假稱所有情況無錯。

## A01–A08 驗收對照

| ID | 本輪可證明範圍 |
|---|---|
| A01 | mock structured result 經 schema＋grounding 後顯示；固定 golden DTC 270.00 由 placeholder 填入，證據按鈕可展開公式及來源 |
| A02 | 不存在 ID、錯 metric／period／scope、無關引用、自由數字及已知因果／保證主張全部拒絕；client 即使收到 HTTP 200 也再驗證 |
| A03 | 惡意通路／SKU／檔名不進 payload；模型無工具；憑證索取及越權回應拒絕，不讀使用者 secrets |
| A04 | 無 key、timeout、429、拒絕、截斷、schema／semantic 失敗、取消皆明示降級；同時操作 KPI／規則／零變動情境驗證核心可用 |
| A05 | 真實未啟用顯示規則診斷，未完成顯示 AI 未完成；只有合法模型回應路徑顯示即時 AI。測試攔截明示 MOCK，live **未執行** |
| A06 | 變更資料／期間／通路、同 hash 重載及換回原值撤銷同意與回應；即使慢 mock 忽略 abort，也不覆蓋新狀態 |
| A07 | POST 與完整預覽一致，無同意不送資料；來源映射只留本機，schema 嚴格拒絕原始欄位；log metadata 白名單不含 key／內容 |
| A08 | 假 canary 隔離與 22 靜態資源掃描通過；PUBLIC_DEMO 真實 production POST 403，no-key／disabled／未同意亦於 provider 前封鎖 |

E01–E24 詳見 `docs/M5_EVALUATION.md` 與具名測試；已知合成案例的規則／mock 支持檢查通過，沒有把測試結果當作真實 AI 比較。任意自然語言的完整語義正確性、人工修改量與處理時間仍需後續實測。

## 本機操作與範圍

1. `npm run dev`，開啟 `http://127.0.0.1:3000/`，載入 golden 或 demo，進入「通路診斷」。無 key 仍可閱讀規則、完整匿名預覽並展開本機 fact 來源。
2. 金鑰只由使用者自行在本機 `.env.local` 設定；不要貼到聊天／頁面。`OPENAI_MODEL` 選用帳戶當時支援 Structured Outputs 的模型；沒有預設模型。明確啟用後重新啟動 server，再預覽與同意傳送。此次未進行這個 live 步驟。
3. 測試使用專用 3100 服務並強制 live 關閉；`scripts/verify-ai-security.mjs` 使用 3205 與假 canary，四種請求皆在 provider 前停止。測試 server 會結束，既有本機 dev server 保留。

此版只解釋已選通路的完整商品集合彙總，不傳逐 SKU 或逐通路細項，不改 M4 行動稿、不計算 AI 預估收益。匿名金額仍可能是敏感營運資料，預覽會提示接收端與供應商保留政策。超過 64 KiB／40 facts 契約／數值長度等 AI 邊界時，只停用選配 AI，不修改核心計算。

沒有新增公開使用的 auth、rate limit 或 usage budget；local Host／Origin 守門不能當公開服務認證。沒有部署、正式平台 API 或模型費率估價。M5 到此停止；下一個 milestone 是 M6，等待使用者另行指示。

---

# 歷史紀錄：M4（原文字保留，以上方 M5 狀態為準）


更新日期：2026-10-01（Asia/Taipei）。本輪只執行 **M4 本期單通路情境試算、人工行動卡與本機決策匯出**。沒有開始 M5、接模型 API 或部署。M3／M2／M1／M0 的原始紀錄完整保留在文末歷史區。

| 項目 | M4 實際狀態 |
|---|---|
| 開工前確認 | M3 既有 278 tests、typecheck、lint 通過；包含 M1 golden 與必要邊界，未重新初始化 |
| 測試先行 | S01–S06 domain 初始 66 failed；S07／decision 初始 22 failed，後續驗證與匯出邊界亦保存 RED |
| 情境核心 | 高精度 Decimal 純函式；單一通路、本期、不可變 baseline；最多三方案獨立重算 |
| 固定答案 | 零變動回 baseline；DTC 270.00 → 284.00，K=20 → 264.00；MARKETPLACE 複合方案 19.70／delta 34.70／rounding_adjustment -0.01 |
| 操作與狀態 | 五輸入全空白、銷量明填、全部固定假設可見、不適用原因、髒輸入撤下結果、範圍變更後舊稿過期 |
| 行動與下載 | 最多三人工行動、七欄及有效日期／fact IDs、手動排序；Markdown／CSV／JSON 本機匯出 |
| 單元／整合 | 14 files／379 passed；M4 新增 68 scenario＋33 decision，原 278 項保留，無 skipped／todo |
| typecheck／lint | exit 0；lint 0 errors／0 warnings |
| build | exit 0，Webpack 正式編譯、TypeScript、靜態頁與 traces 完成 |
| Chromium 完整 E2E | exit 0，138／138 passed（2.1 分鐘）；45 項 M4＋93 項原回歸，0 skipped／unexpected／flaky，retries=0 |
| 內建瀏覽器 | 已實際操作 DTC 284／264、行動確認、換通路過期與重建；三尺寸截圖及實際 logs 保存 |
| 原始資料／依賴 | 219 個既有檔案逐檔 SHA-256 核對，未刪除；原 fixtures、golden expected、M1 domain／lib、package／lockfile 保留；無新增依賴 |

## 完成內容與改動檔案

| 檔案 | 變更 |
|---|---|
| `src/domain/scenarios.ts` | baseline 適用性、明示輸入及接受假設檢核；完全閉合公式、高精度 Decimal、最終 HALF_UP、取分調整 |
| `src/application/decision.ts` | 可序列化且隔離來源的基準、快照／revision 綁定、過期檢查、重建、三方案及人工行動驗證與排序 |
| `src/application/decision-export.ts` | 三格式共同內容檢核、完整 metadata／假設／公式／證據、草稿與過期標記、文字安全處理 |
| `src/components/decision-workbench.tsx` | 情境及行動表單、適用性原因、固定假設、精確比較表、來源對話框、重建及本機下載 |
| `src/components/dashboard.tsx` | 新增兩頁導航、成功換資料／期間／通路更新 revision；保留舊工作稿以明示過期 |
| `src/app/globals.css` | 桌面／平板／手機表單、比較表、行動卡與鍵盤焦點樣式 |
| `tests/scenarios.test.ts`、`tests/decision.test.ts` | 68＋33 項情境、過期、人工行動與匯出測試；固定 expected，不由 production 函式產生 |
| `tests/app-smoke.test.tsx`、`tests/e2e/scenarios.spec.ts` | 六個導航入口；新增 15 情境 × 3 尺寸的真實操作驗收 |
| `tests/e2e/workspace.spec.ts`、`tests/e2e/import.spec.ts`、`playwright.config.ts` | 原回歸斷言保留，只改本輪 artifact 前綴及報告位置，不覆蓋 M2/M3 證據 |
| `README.md`、`docs/DECISIONS.md`、`docs/STATUS.md`、`verification/m4-*` | 重現操作、精度／過期／匯出決策、實際結果、原檔核對、截圖與 logs |

每個方案都從原 baseline 重算，不疊加前一方案，也不把方案差額相加。所有金額來自 domain；元件只格式化顯示。售出量、折扣百分點、單位履約成本、總廣告支出、一次性投入起始均空白；「填入零變動假設」是明確操作，仍須另外接受全部固定假設。減少廣告不推定銷量或收入固定。

模型沿用 SCENARIOS 的全部公式。平台／金流費按 N′/N；商品成本及其他變動成本按量；履約按量及單位成本；廣告只按明示支出變化。循環小數使用代數等價的先乘後除式與獨立 Decimal context，精度隨輸入位數增加，不修改 Decimal 全域設定或先用顯示率回算。所有中間值保留高精度，最後取兩位小數；逐項取分表加上 rounding_adjustment 可精確加回條件貢獻。相關選擇記於 DECISIONS，原財務契約未變更。

缺必要成本／費用、未確認 coverage、G/N 非正、折扣及退款比超界、負成本的 baseline 均停用；原實際診斷照常保留。基準貢獻為負本身不構成停用理由。商品頁仍只有商品毛利，沒有 SKU 情境或廣告分攤。介面明示入帳日退款比不等於 cohort 退貨機率；不接受固定計價假設時不顯示有效改善金額。

成功重載／重新匯入相同資料也增加 revision；改資料、期間或通路後，換回原值不使舊稿自動復活。使用者明確重建後，保留名稱與人工文字，清空全部數值、接受狀態、結果、行動 fact IDs 與證據確認。過期歷史可下載但保留原範圍並標記 stale。所有計算、卡片與下載僅留目前分頁記憶體；無伺服器上傳、localStorage／sessionStorage／IndexedDB 或跨分頁共用。

## 實際命令、失敗與修正

| 命令 | 實際結果／證據 |
|---|---|
| `npm test -- --run && npm run typecheck && npm run lint`（開工前） | exit 0，278 passed；`m4-baseline-tests.txt`、`m4-baseline-typecheck.txt`、`m4-baseline-lint.txt` |
| `npm test -- --run tests/scenarios.test.ts`（RED） | 66 failed；`m4-scenarios-red.txt`。後續新增精度邊界，最終 68 passed |
| `npm test -- --run tests/decision.test.ts`（RED → GREEN） | 初始 22 failed；追加行動驗證 9 failed／22 passed；追加 null／取分匯出 2 failed／31 passed；最後 33 passed，四份 `m4-decision-*.txt` 保存 |
| `npm test -- --run tests/app-smoke.test.tsx`（RED） | 1 failed／1 passed，六導航預期先於介面；`m4-ui-red.txt` |
| `npm test -- --run`（最終） | exit 0，14 files／379 passed；`m4-tests.txt` |
| `npm run typecheck`（最終） | exit 0，Next route typegen + tsc --noEmit；`m4-typecheck.txt` |
| `npm run lint`（最終） | exit 0，0 errors／0 warnings；`m4-lint.txt` |
| `NEXT_TELEMETRY_DISABLED=1 npm run build` | exit 0，Webpack 正式編譯、TypeScript、靜態頁與 traces 完成；`m4-build.txt` |
| `npm run test:e2e -- tests/e2e/scenarios.spec.ts --project=desktop`（首輪） | exit 1，13 passed／2 failed；`m4-e2e-desktop.txt`、`m4-e2e-desktop-before-fix.json` |
| `npm run test:e2e`（修正後完整回歸） | exit 0，138／138 passed（2.1 分鐘）；45 項 M4＋93 項原回歸，0 skipped／unexpected／flaky，retries=0；`m4-e2e.txt`、`m4-e2e-results.json` |
| `git status --short` | `fatal: not a git repository`；未 init／commit／建立遠端 |

首輪 E2E 的兩項失敗皆是測試對既有 overview 缺值文案的錯誤預期：M2 原畫面顯示「資料待補」，測試預期「—」。對照 `overview.tsx` 後只修正文字斷言；保留 baseline「—」、精確收入、停用按鈕與無 NaN 的檢查，未改財務值、原 fixtures 或 golden。retries=0，不以重試隱藏失敗。中途整合跑到新增行動驗證的 RED 狀態，368 passed／9 failed，亦保留於 `m4-integration-during-action-red.txt`；完成實作後最終全綠。

內建瀏覽器工具曾發生舊 tab 的 CDP focus emulation 逾時、read-only evaluation 沒有 HTMLSelectElement constructor，以及 locator.fill 未填入原生日期欄位。分別改用新 tab、直接讀 DOM value、觀察日期欄後用原生 accessibility setValue；確認畫面實際變更才記為通過。這些工具層限制與 App logs 分別記錄；`m4-inapp-browser.json` 的實際 warn/error logs 為空。Node 測試 runner 有 NO_COLOR／FORCE_COLOR 環境提示，不是應用 lint warning。

## S01–S07 與瀏覽器驗收對照

| ID | 本輪驗收內容 |
|---|---|
| S01 | DTC 270.00／MARKETPLACE -15.00 零變動精確回 baseline；包含超大金額、極小非零變動與循環比率半分 |
| S02 | 固定 golden DTC f=-10%、v=0／δ=0／a=0：K=0 得 284.00；K=20 得 264.00；單元、真實 E2E、內建瀏覽器均核對 |
| S03 | 五輸入必填；減廣告且 v 空白無結果；未接受假設不提供貢獻或差額；初始非默認 0 |
| S04 | 九金額缺漏、各類負成本、純退款、G/N 非正、coverage 未確認、d/r 越界；error fixtures 保留可算收入、未知貢獻並停用情境，不出 NaN |
| S05 | 相對百分比與百分點分開；MARKETPLACE v=20%、δ=2pp、f=-10%、a=-20%、K=20 的固定手算 CM 19.70、差額 34.70、取分調整 -0.01；逐項成本一致 |
| S06 | 同一基準同時顯示 270／284／264 三方案；第四項停用，修改一項不影響其他方案或 baseline |
| S07 | 換資料／期間／通路、相同資料重載與換回均過期；重建清假設及證據；三格式含版本、期間、scope、as_of、幣別口徑、完整假設、公式與來源 |

Playwright 使用正式 build/start 的 Chromium：desktop 1440×1000、tablet 768×1024、mobile 390×844。新增 45 項包含七欄行動、選 fact／鍵盤來源對話框與 Esc 焦點返回、最多三項及人工排序、真正下載三格式並逐欄核對、惡意文字防公式／HTML／Markdown 注入、合法負數、零 HTTP／零持久化、refresh／新分頁隔離；另完整回歸原 93 項工作台及匯入。

正式模式截圖：`m4-{desktop,tablet,mobile}-{scenarios,actions}.png`；原功能回歸截圖使用 `m4-workspace-regression-*` 與 `m4-import-regression-*`。內建瀏覽器人工截圖：`m4-inapp-scenario-desktop.png`、`m4-inapp-actions-tablet.png`、`m4-inapp-stale-mobile.png`、`m4-inapp-proof.png`；已恢復 viewport override，保留可操作結果分頁。人工截圖來自 dev server，包含開發工具指示器。

`m4-browser-meta.jsonl`、`m4-import-regression-meta.jsonl` 不記錄使用者文字、原始匯入內容、console arguments 或 request body。`m4-workspace-regression-browser-logs.jsonl` 如實保留刻意注入的 HTTP 503 與取消請求等預期錯誤；最終各案例彙整於 `m4-browser-final-logs.json`，沒有清空日誌假稱全程無錯。

## 限制與未執行項目

- M5 模型 API／AI、M6 完整 release、正式平台 API、預測器、預算最佳化、登入、資料庫與部署：**未實作、未執行**。本輪人工行動與多格式匯出是使用者明示的 M4 範圍，不代表 M6 已完成。
- 情境只支援本期單一通路與完整商品集合，固定平均牌價／商品組合、退款比、淨成本結構、有效費率等假設；不表示改善已發生，不提供機率或成效保證。
- JSON 是可追溯決策紀錄，不是原 CSV 備份；沒有 JSON 匯回／復原工作區功能。重整、關閉分頁、清空工作區均清除本機記憶體。
- Safari、Firefox、真實行動裝置、完整螢幕閱讀器／WCAG 稽核、最大資料負載壓測、Excel／Numbers／LibreOffice 實際開檔：**未執行**；沒有宣稱跨瀏覽器或財務試算表軟體完整認證。
- 本輪 `npm ci`／重新安裝 Chromium：**未執行**；沿用 M3 已安裝環境且 package／lockfile 無變更。Turbopack、fixture 生成及 `scripts/verify_fixtures.py`：**未執行**；不重新生成或改寫原始驗收資料。
- 原 M3 TWD／Asia/Taipei、5 MiB／50,000 列及期間／通路技術上限保持不變。所有驗收均使用合成資料，沒有真實營運資料或個資。

## 本機重現與原檔保留

`npm run dev` → 開啟 http://127.0.0.1:3000 → 載入 Golden → 通路 DTC →「情境試算」→ 新增方案 → 明填 v=0／δ=0／f=-10／a=0／K=0 → 接受全部固定假設 → 計算應為 **284.00**；將 K 改為20後舊結果撤下，重算為 **264.00**。在行動摘要填七欄並選證據，確認後可下載三格式。切換通路或套用新期間應標記過期；明確重建後再填假設與證據。更多範圍、原 CSV 匯入與命令見 README。

原檔逐一 SHA-256 核對詳 `verification/m4-preservation.json`：原41個 fixtures、golden expected、11個既有 domain 檔、2個 lib、原規格與 package／lockfile 均未變；無既有檔案遺失。實際授權修改與新增檔案分開記錄，M0–M3 的 verification 產物未覆蓋。

下一個 milestone：**M5 AI 契約與選用模型整合**，等待下一輪指示。本輪完成 M4 即停止。

<details>
<summary>M3／M2／M1／M0 歷史紀錄（非本輪進度）</summary>


# Status

更新日期：2026-10-01（Asia/Taipei）。本輪只完成 **M3 本機 CSV 匯入與安全 CSV 匯出**，未開始 M4。以下為本輪實際結果；M2／M1／M0 紀錄保留在文末歷史區。

| 項目 | M3 狀態 |
|---|---|
| 開工前確認 | 既有 197 項測試、typecheck、lint 通過；含 M1 golden C01–C18，沒有重新初始化 |
| 三 CSV 匯入 | 完成；瀏覽器讀檔、manifest 表單／可選 JSON、前十列、明確欄位對照與忽略確認 |
| blocking／partial | 完成；阻擋不提交，partial 保留已知收入、依賴缺漏的貢獻 null，不補值 |
| 安全 CSV | 完成；目前分析／商品明細／問題清單，文字公式逃逸、合法負金額不轉文字，篩選可追溯 |
| 單元／整合 | 12 files／278 tests passed，無 skipped／todo |
| typecheck／lint／build | 均 exit 0；lint 0 errors／0 warnings |
| Chromium 完整 E2E | 90／90 完整回歸＋3／3 追加邊界通過，共93項；0 skipped／unexpected／flaky，retries=0 |
| 內建瀏覽器 | 已實際選檔、核對預覽、套用、查看三尺寸、商品負毛利及阻擋保留舊資料，附截圖與 logs |
| 依賴／原始資料 | npm ci 已實跑；無新增依賴；原 fixtures、golden expected、domain／lib 與 package／lockfile 保持不變 |
| M4–M6／平台 API | 未實作、未執行；本輪結束即停止 |

## 完成內容與改動檔案

| 檔案 | 變更 |
|---|---|
| `src/application/import.ts` | 三 CSV／JSON 檔案檢查、完整解析、前十列、標準欄位對照、確認後忽略未知欄、M1 validation、保留原始實體行號及檔名／欄名對照 |
| `src/components/import-panel.tsx` | 空白起始設定表單、JSON 帶入後仍需口徑確認、預覽、loading／檢核結果／提交、檔案讀取及設定版本守門 |
| `src/application/export.ts`、`download.ts` | 純函式 CSV 序列化與快照匯出；瀏覽器 Blob 下載，不傳到伺服器 |
| `src/application/limits.ts`、`workspace.ts` | 在 domain／每週展開前拒絕超大比較範圍及通路數，不截斷資料 |
| `src/components/dashboard.tsx` | 本機匯入提交、保留成功工作區、快照與篩選共用、分析 CSV／設定 JSON 下載、LOCAL 模式 |
| `src/components/workspace-panels.tsx` | 匯入來源與對照追溯、目前商品列匯出、空白品類保留於全部明細及 SKU 搜尋 |
| `src/components/evidence-drawer.tsx`、`issue-list.tsx` | 真實檔名／來源欄名、原始行號；問題列表每頁 50 項、完整清單可下載 |
| `src/app/globals.css` | 三尺寸匯入、設定、mapping、預覽及下載控制項 |
| `tests/import.test.ts`、`export.test.ts`、`analysis-limits.test.ts` | 37＋33＋11 項新增測試，包含先 RED 後 GREEN 與不可修改輸入 |
| `tests/e2e/import.spec.ts` | 真實本機選檔、替代資料、errors、mapping、安全匯出、隱私、資源限制及特殊欄位邊界 |
| `tests/fixtures/alternative/` | 新增獨立合成資料與固定 expected；不修改原 fixtures，不在示範 endpoint 白名單 |
| `tests/e2e/workspace.spec.ts`、`playwright.config.ts` | 原 45 項回歸不減少；本輪產物改用 m3 前綴，保留 M2 證據 |
| `README.md`、`docs/DECISIONS.md`、`docs/STATUS.md`、`verification/m3-*` | 操作方式、技術限制、真實通過／失敗、原檔比對、截圖與瀏覽器紀錄 |

所有財務值與規則仍來自 M1。替代資料的本期 N **600.00**、GP **260.00**、before **200.00**、after **10.00**，前期 after **140.00**，bridge **-130.00**；DTC after **40.00**、MARKETPLACE **-30.00**。固定答案用獨立 CSV／Decimal 核對，E2E 以 literal expected 比較，不由 production 函式反推 expected。這些均是合成資料，不代表真實成效。

匯入前只依完全相同欄名預選，不猜測收入／成本。改名對照與忽略欄須各自明確確認；未使用欄內容不進入提交資料集。資料工作區、來源對話框保留實際檔名、標準角色與原欄名；跨行引號不改寫來源行號。缺列無實體行號，顯示「—」而非虛構行號。

CSV 匯出包含 scope、前後期、dataset/filter hash、metric version、as_of、精確值、null reason 與 source refs。率輸出原始 ratio，不當成百分比再乘除；不可信文字以前導單引號防公式注入，真正負數保留數值。商品匯出僅含當前可見列與商品毛利指標，沒有 SKU 廣告或假貢獻。JSON 下載只有資料集 manifest 設定，不含 CSV 或另行套用的篩選，不能當作資料備份。

## 實際命令與結果

| 命令 | 實際結果／證據 |
|---|---|
| `npm test -- --run && npm run typecheck && npm run lint`（開工前） | exit 0，197 tests passed；沿用 M1／M2 |
| `npm ci --cache /tmp/profitlens-npm-cache --fetch-retries=1 --fetch-timeout=30000` | exit 0；441 packages added／442 audited／當次 0 vulnerabilities，ESLint 9.39.5 deprecated warning；沒有變更 lockfile |
| import／export／limits RED 測試 | import 初始 35 failed；export 33 failed；limits 10 failed／1 passed，均為真正執行斷言；見 `m3-import-red.txt`、`m3-export-red.txt`、`m3-period-limit-red.txt` |
| `npm test -- --run`（最終） | exit 0，12 files／278 passed，`verification/m3-tests.txt` |
| `npm run typecheck`（最終） | exit 0，Next route typegen + tsc --noEmit，`m3-typecheck.txt` |
| `npm run lint`（最終） | exit 0，0 errors／0 warnings，`m3-lint.txt` |
| `NEXT_TELEMETRY_DISABLED=1 npm run build` | exit 0，Webpack build、TypeScript、靜態頁與 traces 完成，`m3-build.txt` |
| `npm run test:e2e`（初輪） | exit 1，87 passed／3 failed；三尺寸皆使用舊的 `all` 選項值而超時，`m3-e2e-before-selector-fix.txt`／`.json` |
| `npm run test:e2e`（修正後完整回歸） | exit 0，90 passed（1.4m），0 skipped／unexpected／flaky，`m3-e2e.txt`／`m3-e2e-results.json` |
| `npm run test:e2e -- --grep '空白品類商品仍可搜尋匯出' --reporter=line` | exit 0，三尺寸 3／3 passed（15.5s）；空白品類可搜尋匯出，合法 `all` 通路與全部通路可區分，`m3-edge-e2e.txt` |
| `git status --short` | `fatal: not a git repository`；未 init、commit 或建立遠端 |

中途失敗與修正：初次匯整 lint 因 effect cleanup 引用 ref 產生 1 warning，改以 mounted guard 清理；資源限制仍在 RED stub 時 lint 出現 2 個未使用參數 warning，完成實作後消除。依賴重裝期間一次 `npx playwright ... --list` 嘗試解析外部套件，遇 registry ENOTFOUND／npm log 權限；重裝完成後用已安裝的 local CLI 檢查成功，未新增套件或繞過環境權限。首次 E2E 的三個失敗沒有加 retry 遮掩；改用可見選項文字「全部通路」，讓合法名為 `all` 的通路不與選單 sentinel 混淆。內建瀏覽器曾對不可聚焦 h1 執行 Home 失敗，改對導覽按鈕執行成功，不是 App 錯誤。

JSON 預填的非 blocking coverage 問題改在可編輯表單重新檢核，避免使用者已確認完整性仍被舊 issue 阻擋；較慢的 JSON 讀取不能覆蓋讀取期間新修改的設定。檔案大小先於 arrayBuffer 檢查；解析、金額、日期、幣別、唯一鍵與費用完整性沿用 M1，不為通過測試補值。

## U01–U11 驗收對照

| ID | 本輪實際驗收 |
|---|---|
| U01 | 固定 lockfile 的 npm ci 後完成工程檢查與正式 build/start；無 API key 可操作 demo。不是全新 OS 環境測試 |
| U02 | 真正選取 golden 再選 alternative；KPI 255.00→10.00、收入 2470.00→600.00、每週表／圖與 bridge／商品／診斷同步改變；替代資料無 server endpoint |
| U03 | 重複鍵、混幣問題顯示實際原檔、欄位與 line 10／6；改名與跨行來源保留；缺列行號 null；清單可下載 |
| U04 | 共用日期／通路，DTC 分析 CSV after 40.00；MARKETPLACE＋品類／SKU 搜尋的商品 CSV N -40.00、GP -100.00，與可見表格一致且不含通路貢獻 |
| U05 | 原有 headline／差額／率／診斷的公式來源回歸通過；匯入後使用實際檔名與原始行號 |
| U06 | Chromium 1440×1000、768×1024、390×844 完整操作與 screenshots；內建瀏覽器三尺寸人工檢視，表格可水平捲動 |
| U07 | empty、loading、error、partial、ready；匯入草稿／檢核中／blocking／可套用另行明示，失敗不提交成功資料 |
| U08 | 檔案、表單與 mapping 有 label；按鈕、skip link、來源 modal 焦點／Esc、圖表表格替代回歸；人工 Enter 檢核可操作 |
| U09 | 包含 =、+、-、@、tab 前導公式及 HTML onerror 的合成文字：無 DOM img、無 JS dialog、無 pageerror；下載 CSV 文字已逃逸，-100.00 真負金額仍可用 |
| U10 | malformed 引號、invalid UTF-8、超 5 MiB、超 50,000 列及 8,000 年合法日期範圍均友善拒絕，不截斷；取消後舊 golden 255.00／2470.00 保留 |
| U11 | UI 事先提醒僅此分頁記憶體；匯入期間阻擋所有 HTTP 後仍成功且觀察到 0 request；localStorage/sessionStorage/IndexedDB 不新增，另一分頁及 reload 回空 |

完整90項通過後，針對新增的空白品類／合法all通路情境只追加執行三尺寸3項，沒有宣稱單一93項全套執行。最終各情境紀錄彙整於 `m3-browser-final-logs.json`。

通過範圍為本輪支援的 Chromium 本機使用流程；這不是完整 WCAG 稽核或所有瀏覽器的認證。M3 E2E 的 browser metadata 不保存上傳內容、console arguments 或 request body。`m3-browser-meta.jsonl` 保留各輪；M2 回歸的 `m3-regression-browser-logs.jsonl` 也保留注入 HTTP 503 及取消請求等預期錯誤，不清空假稱全程無錯。

內建瀏覽器人工證據：`m3-inapp-browser.json`（實際 warn/error logs 為空）、`m3-inapp-import-desktop.png`、`m3-inapp-overview-desktop.png`、`m3-inapp-products-tablet.png`、`m3-inapp-import-mobile.png`、`m3-inapp-blocked-mobile.png`。實際套用替代資料為 600.00／10.00，商品純退款 GP -100.00；手機以 Enter 檢核空草稿時 blocking，取消仍保留10.00。viewport override 已恢復。人工截圖含 Next dev 指示器；`m3-{desktop,tablet,mobile}-{import,overview}.png` 為正式模式 E2E 截圖。舊 M2 截圖未覆蓋。

## 限制與未執行項目

- M4 情境試算、M5 模型 API／AI、M6 完整多格式行動摘要及發佈：**未實作、未執行**；本輪安全 CSV 為使用者明示 M3 範圍，不代表 M6 完成。沒有正式平台 API、登入、資料庫或部署。
- Safari、Firefox、真實行動裝置、完整螢幕閱讀器／WCAG 稽核、最大 50,000 列×1,000 通路×1,040 區間的效能壓測：**未執行**；上限是技術守門，不是效能 SLA。
- UI 固定 TWD／Asia/Taipei。每檔 5 MiB／50,000 列，前後期合計最多 1,040 個七日區間、最多1,000通路；超限明確拒絕不改金額口徑，記於 DECISIONS。
- 空白品類保留全部商品與匯出，不提供無作用的空白下拉選項，可用 SKU 搜尋。問題清單每頁50項、檔案預覽前10列，domain仍處理全部輸入。
- 所有驗收均用合成資料；未匯入真實營運或個資。未執行平台抓取／server上傳；沒有把匯入檔放 public、持久化或模組全域狀態。
- CSV 本身是文字格式；檔內數值精確保留，試算表軟體如何顯示超長數值取決於其匯入設定。未逐一開啟 Excel／Numbers／LibreOffice 驗收，公式防護以序列化斷言及實際下載內容驗證。
- fixture 生成及 `scripts/verify_fixtures.py`：**未執行**，避免重寫準備產物；`fixtures/errors` 繼續是故意不良資料。Turbopack 未重測，沿用 Webpack。
- 正式驗收服務使用127.0.0.1:3100，測完自動停止；3000開發預覽仍可用。新分頁／reload 須重新匯入，JSON設定下載不能復原三CSV資料。

## 本機重現與原檔保留

`npm ci` → `npm run dev` → 開啟 http://127.0.0.1:3000 →「匯入標準 CSV」→ 選取 `tests/fixtures/alternative/` 三CSV及可選manifest JSON → 明確確認口徑 → 檢核 → 套用，應見N600.00／after10.00。再匯入 `fixtures/errors/duplicate_sales_key/` 應阻擋且保留前資料；缺成本／缺廣告日則partial。工程命令與其他操作詳README。

以開工前170個既有檔案SHA-256逐一比對，原41個fixtures、AGENTS.md、11個domain、2個lib、package.json及lockfile均保持不變，無檔案遺失。完整逐檔結果見`verification/m3-preservation.json`；授權變更清單見上表及該紀錄。

下一個 milestone：**M4 情境試算**，等待下一輪指示。本輪完成M3即停止。

<details>
<summary>M2／M1／M0 歷史紀錄（非本輪進度）</summary>

# Status

更新日期：2026-09-30（Asia/Taipei）。本輪 M2 已完成並停止；沒有開始 M3。M0／M1 原紀錄保留於下方。

| 項目 | M2 本輪狀態 |
|---|---|
| M1 開工前實查 | 165 項測試、typecheck、lint 通過；沒有重新初始化 |
| M2 功能 | 資料工作區、經營總覽、通路診斷、商品毛利完成，全部沿用 M1 計算 |
| 最終單元／整合 | 通過，9 個檔案／197 項，無 skipped／todo |
| 最終 typecheck／lint／build | 通過，exit 0；lint 0 errors／0 warnings |
| Chromium E2E | 正式模式 45／45 通過；0 skipped、0 unexpected、0 flaky；retries=0 |
| 內建瀏覽器人工操作 | 已執行，含 demo、golden、DTC、來源對話框、品類／SKU、缺廣告及資料預覽；截圖及實際 log 已保存 |
| M3–M6 | not_started；不提前實作匯入、scenario、AI、匯出或部署 |

## M2 完成內容與檔案

| 檔案 | 變更與目的 |
|---|---|
| `src/application/workspace.ts` | M1 snapshot、依各期起日每 7 日聚合、dataset/filter SHA-256、metric version 與截至日 |
| `src/application/presentation.ts` | 精確金額／比率顯示、公式定義、來源欄位與 CSV 行號；不以 Number 計算財務值 |
| `src/app/api/datasets/[id]/route.ts` | 白名單只讀合成 fixture 路由；demo、golden、缺成本、缺廣告日、重複鍵；no-store，拒絕任意路徑 |
| `src/components/dashboard.tsx`、`issue-list.tsx` | 記憶體工作區、共用期間／通路、五種狀態、blocking 保留舊資料、取消過期請求與問題清單 |
| `src/components/overview.tsx` | 5 核心 KPI、週趨勢、九項精確橋接、通路比較；每個圖表提供精確數據表 |
| `src/components/workspace-panels.tsx` | 資料口徑與前三檔預覽、M1 deterministic 診斷、SKU／品類商品毛利明細 |
| `src/components/evidence-drawer.tsx` | 原生 modal、公式／範圍／原始來源、每頁 50 筆、缺漏標示、Esc 關閉及焦點返回；百分點不再乘 100 |
| `src/app/page.tsx`、`globals.css` | 繁體中文營運工作台、響應式版面、鍵盤焦點與跳至主要內容；沒有更動根 layout |
| `tests/workspace.test.ts`、`dataset-route.test.ts` | 12 項 snapshot／精確呈現測試、20 項路由及安全邊界測試，先紅後綠 |
| `tests/app-smoke.test.tsx` | 更新首頁測試，驗證 M2 空狀態與財務口徑，保留 2 項有效測試 |
| `tests/e2e/workspace.spec.ts`、`playwright.config.ts` | 15 個真實操作情境 × 3 尺寸；截圖、console／pageerror／requestfailed 記錄與失敗 trace |
| `package.json`、`package-lock.json` | 固定 Recharts 3.10.1、Playwright Test 1.63.0；新增真正的 `test:e2e` 命令 |
| `eslint.config.mjs` | 排除 Playwright 自動產生的報告及測試產物，仍檢查全部實作與測試原始碼 |
| `README.md`、`docs/STATUS.md`、`verification/m2-*` | 可重現操作、實際結果、screenshots、原始 browser logs、失敗及修正證據 |

介面沒有硬寫 fixture 金額或分析結論。頁面以原始三份 CSV 經 validateDataset → createSnapshot → M1 analyzeDataset／analyzeProducts；診斷只展示 M1 rules/facts。圖表 Number 轉換只用於座標，headline、橋接、排序與來源始終使用精確字串。商品頁沒有通路費用／廣告分攤／SKU 行銷後貢獻。

日期必須等長、不重疊且在 coverage 內。每週依各期起日分 7 天，末段不足 7 天另列；缺廣告的趨勢為 null，不畫成零。SKU／品類只影響商品頁，主頁共享的是完整 SKU 的通路／期間。資料預覽明確標示是原始完整資料集各檔前 10 列，分析仍使用全部列。

## 實際命令、通過與失敗

| 命令／檢查 | 實際結果 |
|---|---|
| `npm test -- --run && npm run typecheck && npm run lint`（M2 開工前） | exit 0；既有 M1 165 項及工程檢查通過，包含 C01–C18 與必要邊界 |
| npm registry 版本查核及精確安裝 | Recharts 3.10.1、Playwright Test 1.63.0；兩次安裝 exit 0，當時 audit 0 vulnerabilities，lockfile 已固定 |
| `npx playwright install chromium` | exit 0；實際下載 Chromium 153.0.8010.12（Playwright build 1243） |
| `npm test -- --run tests/workspace.test.ts`（RED／GREEN） | 實作前 12 項失敗，實作後 12 通過；固定比對原 golden expected 與 demo computed_summary |
| `npm test -- --run tests/dataset-route.test.ts`（RED／GREEN） | 實作前 20 項失敗，實作後 20 通過；未修改 fixtures |
| `npm test -- --run`（最終） | exit 0；9 files／197 tests passed，見 `verification/m2-tests.txt` |
| `npm run typecheck`（最終） | exit 0；next typegen + tsc --noEmit，見 `verification/m2-typecheck.txt` |
| `npm run lint`（最終） | exit 0；全專案 0 errors／0 warnings，見 `verification/m2-lint.txt` |
| `NEXT_TELEMETRY_DISABLED=1 npm run build`（最終） | exit 0；Webpack 正式編譯、型別、靜態頁面及 traces 完成，包含動態 `/api/datasets/[id]` |
| `npm run test:e2e -- --project=desktop`（初輪） | exit 1；8 通過／3 失敗：select label 定位與 Next.js route announcer 的 alert 衝突，已修正欄位明確 aria-label 與測試 scope |
| `npm run test:e2e`（開發模式兩輪） | 兩輪皆 exit 1、44 通過／1 失敗，桌面首項受 Fast Refresh 清空資料影響；實際 log 保存，未加 retry 隱藏失敗。最終改為獨立正式模式服務 |
| `npm run test:e2e`（最終正式模式） | exit 0；45 passed（39.6 秒），三尺寸各 15 項；自動 build → 本機 3100 npm start → 測試 → 停止，見 `verification/m2-e2e.txt`／`m2-e2e-results.json` |
| Git | 原資料夾不是 Git repository；沒有 init、commit 或建立遠端 |

中途工程失敗均保留：ESLint 初次在有 Playwright 報告後掃入報告附帶的第三方 JS，出現 259 errors／2795 warnings；加入產生物 ignore 後通過，完整輸出壓縮保存 `m2-lint-before-fix.txt.gz`。typecheck／build 發現 `node_modules/@types/* 2` 共 8 個空目錄，以及 `.next/dev/types/* 2.*` 重複型別產生檔。僅對確認為空的套件目錄執行 rmdir，將 5 個重複的 Next.js 產生檔移至 `/tmp/profitlens-m2-generated-duplicates/` 保留；沒有排除型別錯誤、修改 source 或清洗資料。清理後型別及 build 重跑通過，前兩輪失敗 stdout 與清理名單仍在 verification。

截圖檢查另修正未聚焦的 skip link 在長頁截圖中露出；連結維持鍵盤可用，E2E 驗證 Tab → skip link → Enter → main。來源對話框驗證焦點留在 modal、Esc 回到原數字。部分人工截圖包含框架開發指示器；最終 E2E 截圖使用正式模式。

## 瀏覽器驗收與驗收規格對照

- Chromium desktop 1440×1000、tablet 768×1024、mobile 390×844；同一組 15 情境：empty→ready、golden↔demo、DTC、公式／來源／鍵盤、百分點、診斷差額、商品篩選、有效／無效期間、原始資料預覽、兩類 partial、blocking 舊資料復原、loading／HTTP 503、舊請求競態、清空／重新整理／另一分頁隔離。
- Golden 本期 255.00、DTC 270.00；折扣排序差額 +250.00、貢獻橋接 -315.00；百分點 -15.01 pp。Demo 本期 N 7,850,657.90、貢獻 1,269,792.73。自訂兩個 7 日區間的 E2E literal expected 用獨立 CSV + Decimal 算出，不由 production 函式產生。
- Codex 內建瀏覽器實際走過三尺寸，開啟 270.00 的三份 CSV 來源列；平板篩選 HOME／SKU A 只呈現 N 1,120.00、cogs 580.00、GP 540.00；手機檢查 overview、診斷與缺廣告資料工作區。臨時 viewport override 已恢復。
- 最終頁首預覽：`m2-final-preview.jpg`。長頁截圖中的固定側欄位置反映擷取當下捲動位置；頁首預覽另以實際 viewport 擷取。
- 截圖：`m2-{desktop,tablet,mobile}.png` 與 `m2-{desktop,tablet,mobile}-products.png`；人工操作 `m2-browser-desktop.jpg`、`m2-browser-evidence.jpg`、`m2-browser-tablet-products.jpg`、`m2-browser-mobile.jpg`、`m2-browser-partial.jpg`、`m2-browser-workspace.jpg`。
- `m2-browser-logs.jsonl` 保留各輪實際記錄（含早期失敗）；`m2-inapp-browser-logs.json` 保留開發初期模組尚未完成的錯誤與 Fast Refresh 警告，沒有清空後偽稱全程無錯。最終 45 項的獨立記錄在 `m2-browser-final-logs.json`：0 pageerror，3 個預期 HTTP 503 console error（每尺寸各一），3 個競態測試預期取消的 requestfailed；沒有其他瀏覽器錯誤。

| Acceptance | 本輪驗收範圍 |
|---|---|
| C01–C18 | M1 全套重新執行並通過；domain 與固定答案保持不變 |
| U01 | 不需 key 的本機 demo 可操作；本輪使用既有安裝，更新依賴後第二次 npm ci 未執行 |
| U02 | demo／golden 及錯誤資料集切換通過；任意使用者換檔匯入未實作，留 M3 |
| U03 | missing／duplicate 來源問題清單通過；CSV 原始行號與缺列 line=null 如實呈現 |
| U04 | 總覽／通路診斷共用期間與通路，商品只顯示該 scope 毛利；匯出未實作 |
| U05–U08 | headline 公式／來源、三尺寸、五狀態、label／焦點／圖表替代表格已實作並測試 |
| U09 | M1 parser 不執行文字；UI React 文字呈現；匯出公式注入防護未實作／未驗收 |
| U10 | demo endpoint 故障與重複鍵不破壞舊資料通過；任意 malformed／large 上傳 UI 未實作／未驗收，M1 對應 parser 邊界仍通過 |
| U11 | 事前說明重新整理清空；清空／refresh／不同頁面隔離通過 |

## 未執行項目與限制

- M3 使用者 CSV 上傳／mapping／完整匯入 UI、M4 scenarios、M5 AI、M6 匯出與 release：**未實作、未執行**，本輪僅 M2。沒有登入、資料庫、儲存使用者資料的 server global 或公開部署。
- Safari／Firefox、真實手機裝置、螢幕閱讀器全套 WCAG 稽核：**未執行**；目前證據限 Chromium 尺寸模擬與內建瀏覽器、實際鍵盤測試。
- 最終 E2E 改為自行 build，於 127.0.0.1:3100 啟動 `npm start -- --port 3100`；不復用 3000 的 dev server，測完會停止。正式模式 45 項通過；該驗收服務已自動停止，3000 開發預覽仍保留。
- 新 lockfile 的 `npm ci`：**未執行**；本輪已完成精確 npm install，並保留 lockfile。沒有宣稱乾淨安裝驗收。
- fixture 生成及 `scripts/verify_fixtures.py`：**未執行**，避免重寫原資料／準備報告；fixtures/errors 持續是故意不良資料。
- 來源表每頁 50 列、資料工作區每檔預覽前 10 列，均標示範圍；不截斷 domain 計算資料。商品關鍵字篩選只縮減明細列，不生成商品貢獻。
- 原有 Webpack／ESLint 相容性限制仍適用。開發時 Fast Refresh 或手動重新整理會清空瀏覽器記憶體資料；正式操作需重新載入合成資料。

## 原檔保留

以開工前 SHA-256 基準核對 123 個既有檔案：115 個不變、8 個授權修改、0 個遺失。修改僅 README、STATUS、package.json／lockfile、ESLint config、首頁／全域 CSS、首頁 smoke。全部 41 個 fixtures、AGENTS.md、原 docs 規格 10 檔、domain 11 檔、lib 2 檔逐一相同；沒有修改 golden、demo computed_summary 或 errors 資料。完整逐檔紀錄見 `verification/m2-preservation.json`。新增檔案集中於 M2 應用層、元件、合成資料路由、測試與驗收產物。

下一個 milestone：M3，等待下一輪指示。完成 M2 即停止。

<details>
<summary>M1 與 M0 歷史紀錄（非本輪進度）</summary>


更新日期：2026-09-30（Asia/Taipei）。本輪完成 M1 並停止；M2 尚未開始。以下先列 M1 實際結果，文末保留 M0 歷史紀錄。

| 項目 | 本輪狀態 |
|---|---|
| M0 真實狀態 | 已重新檢查既有檔案、版本、2 項 smoke、typecheck 與 lint；均通過，未重新初始化 |
| M1 | completed；C01–C18 單元／整合驗收通過 |
| 最終完整測試 | 通過，7 個測試檔／165 項；其中原 M0 2 項、M1 163 項 |
| typecheck／lint／build | 均通過，exit 0；lint 0 errors／0 warnings |
| M2–M6 | not_started；UI／AI／scenarios／匯出未實作、未驗收 |
| 本輪瀏覽器／E2E | 未執行；M1 不變更 UI，原 M0 首頁保留 |
| 原檔保留 | 93 個既有檔案逐一 SHA-256 比對：88 個不變、4 個授權修改、1 個 Next.js 自動產生檔更新；規格、fixtures、UI 無刪除或意外修改 |

## M1 完成內容與檔案

| 檔案 | 本輪變更 |
|---|---|
| `src/domain/types.ts` | Dataset、manifest、來源、issue、精確金額、metrics、scope、fact 與 rule 型別 |
| `src/domain/money.ts`、`date.ts` | BigInt 整數分、decimal.js 比率、null 原因傳遞、商業日期與期間驗證 |
| `src/lib/csv.ts`、`src/domain/validation.ts` | UTF-8／BOM／引號／跨行 parser；Zod manifest、CSV 欄位、唯一鍵、數字、粒度、coverage 與缺漏驗證 |
| `src/domain/aggregation.ts` | 銷售先彙總日 × 通路，再各 join 一筆費用與廣告；未知值傳播、範圍守門 |
| `src/domain/metrics.ts`、`bridge.ts` | 全部 contribution-v1 指標、成長／轉正轉負／百分點、九項精確 bridge |
| `src/domain/rules.ts` | 八項 deterministic rules、可追溯 fact IDs、scope 與來源、缺漏優先、精確金額排序 |
| `src/domain/analysis.ts`、`index.ts` | 完整通路分析與獨立商品毛利入口；拒絕在通路貢獻套用 SKU/category |
| `tests/money.test.ts`、`metrics.test.ts`、`validation.test.ts`、`rules.test.ts` | 分別 21／29／77／15 項單元與邊界測試 |
| `tests/domain-acceptance.test.ts`、`aggregation-boundaries.test.ts`、`helpers/fixtures.ts` | 18 項整合、3 項聚合入口回歸、只讀 fixture helper；固定答案獨立於 production 計算 |
| `package.json`、`package-lock.json` | 精確新增 decimal.js 10.6.0、Zod 4.6.5；沿用 M0 工具與命令 |
| `next-env.d.ts` | Next.js 自動將開發路由型別路徑改為一般建置路徑；此產生檔沿用 M0 的 Git ignore 規則 |
| `README.md`、`docs/STATUS.md` | 核心 API、輸出型別、驗收、限制與本輪實際結果 |
| `verification/m1-*.json`、`m1-*.txt`、`m1-red/` | 檢查摘要、原始檔案保留證據、最終命令輸出、開發前實際 RED 紀錄 |

金額加減採 METRICS 明確允許的「精確整數最小貨幣單位」，比率與百分點使用 decimal.js。未更改財務口徑，未發現需要修改原規格的矛盾；`docs/DECISIONS.md` 保持原樣。所有 domain/lib 函式不依賴 Next.js、React、檔案系統、模型 API 或模組全域使用者資料。

## M1 先紅後綠紀錄

先寫測試、實際觀察失敗，再補實作；未將缺少模組造成的收集失敗當作已執行案例。原始 RED 輸出保存於 `verification/m1-red/`。

| 實際命令 | 實作前結果 | 最終結果 |
|---|---|---|
| `npm test -- --run tests/money.test.ts tests/domain-acceptance.test.ts` | 初次為 2 個 suite 因模組不存在而失敗，沒有測試執行；之後建立 throw-only 邊界以真正執行測試 | 已由下列分組及完整測試通過 |
| `npm test -- --run tests/money.test.ts` | 21 項已執行：8 失敗／13 通過；通過者主要為預期拒絕不合法輸入 | 21 通過 |
| `npm test -- --run tests/metrics.test.ts` | 27 項已執行，全部失敗 | 最終含額外精度回歸 29 通過 |
| `npm test -- --run tests/validation.test.ts` | 75 項已執行，全部失敗 | 最終含實體行號回歸 77 通過 |
| `npm test -- --run tests/domain-acceptance.test.ts` | 18 項已執行：16 失敗／2 通過 | 18 通過；另補未受影響通路隔離斷言後重跑通過 |
| `npm test -- --run tests/rules.test.ts` | 14 項已執行，全部失敗 | 最終含超大金額一分排序回歸 15 通過 |
| `npm test -- --run tests/aggregation-boundaries.test.ts` | 3 項已執行：2 失敗／1 通過；重複篩選造成總額加倍可重現 | 加入口守門後 3 通過 |

## M1 實際命令與結果

| 命令／檢查 | 實際結果 |
|---|---|
| `node --version`、`npm --version`、`git --version` | Node v25.8.2／npm 11.11.1／Git 2.39.5，沿用 M0 環境 |
| `git status --short --branch` | exit 128：非 Git repository；未執行 git init、commit 或建立遠端 |
| `npm test -- --run && npm run typecheck && npm run lint`（M1 開工前） | exit 0；原 M0 2 項測試、型別與 lint 通過，證實既有骨架可用 |
| `npm view decimal.js version engines --json`、`npm view zod version engines --json`（搭配 `/tmp/profitlens-npm-cache` 與受控網路權限） | 成功取得官方 registry 版本，無猜測版本；另查閱 decimal.js／Zod 官方文件 |
| `npm install --save-exact zod@4.6.5 decimal.js@10.6.0 --cache /tmp/profitlens-npm-cache --fetch-retries=1 --fetch-timeout=30000` | exit 0；1 package added，audit 0 vulnerabilities，lockfile 已更新 |
| 分組測試（上表及 `npm test -- --run tests/aggregation-boundaries.test.ts tests/validation.test.ts tests/money.test.ts tests/metrics.test.ts`） | 開發前 RED 如實保留；後者 130 項通過，後續規則／整合完成後納入全套 |
| `npm test -- --run`（最終） | exit 0；7 files／165 tests passed，沒有 skipped 或 todo |
| `npm run typecheck`（最終） | exit 0；`next typegen && tsc --noEmit` 通過 |
| `npm run lint`（最終） | exit 0；`eslint . --max-warnings=0` 通過 |
| `NEXT_TELEMETRY_DISABLED=1 npm run build` | exit 0；沿用 Webpack，編譯、TypeScript、靜態頁面與 build traces 完成 |
| Node fs/crypto SHA-256 原檔比對 | 全部 93 個既有檔案仍存在；4 個授權修改為 package.json、package-lock.json、README、STATUS；next-env.d.ts 由 Next.js 自動更新型別路徑；其餘 88 個不變，含全部 41 個 fixture |
| 只讀獨立檢查 | 重複通路拒絕、凍結輸入仍可分析、缺漏通路隔離、fact scope／來源／日期一致，均通過 |

施工中曾有 TypeScript 型別錯誤（aggregation totals／analysis 型別），修正後重跑通過；規則仍是 throw-only stub 時 lint 曾因 `_input` 未使用而 exit 1，完成規則後消除。這些是已解決的中途失敗，沒有將其隱藏為初次通過。最終三項命令的 stdout 保存於 `verification/m1-tests.txt`、`m1-typecheck.txt`、`m1-lint.txt`。

## C01–C18 驗收對照

以下均為本輪實際通過；`docs/ACCEPTANCE.md` 作為原始規格維持不變，實際進度以此表為準。

| ID | 實際斷言／主要測試 |
|---|---|
| C01 | 前期 N 2250.00／GP 1200.00／before 870.00／after 570.00；逐欄比對 immutable golden |
| C02 | 本期 N 2470.00／GP 1145.00／before 705.00／after 255.00；逐欄比對 immutable golden |
| C03 | DTC 270.00、MARKETPLACE -15.00，全體 255.00 |
| C04 | 九項 signed bridge 逐項比對 expected，合計 -315.00、reconciled=true；有缺漏為 null |
| C05 | 多 SKU 日通路彙總後 join，廣告 450.00／履約 225.00 只扣一次；重複通路篩選拒絕 |
| C06 | 缺 cogs 保留 N 2470.00，受影響 GP／貢獻 null；未受影響 MARKETPLACE 仍 -15.00 |
| C07 | 故意重複 sales key fixture 為 blocking、dataset=null；另測費用與廣告重複鍵 |
| C08 | 缺 ad 日為 partial，before 705.00 可算、after／MER null；未受影響 DTC 仍 270.00 |
| C09 | 混幣 fixture 為 blocking、dataset=null；不換匯 |
| C10 | 明確零廣告：after 705.00，MER null；非 Infinity 或 0 |
| C11 | 純退款當日 N -100.00，允許退款超過收入；成本不從退款推算 |
| C12 | fixture 已入帳 cogs -40.00 得 GP／after -60.00；另測獨立負成本與通路費用抵扣 |
| C13 | null／空白傳播未知，NaN／Infinity／非法金額阻擋；比較函式回傳 null 而非可用結果 |
| C14 | N=0／N<0 金額保留，N 分母比率及 MER 為 null；各率按自己的分母條件處理 |
| C15 | 0.10+0.20=0.30；超過 Number 安全精度仍保留一分；改變輸入排序不改結果 |
| C16 | 真實日期、等長、不重疊、coverage 內；未確認 coverage 為未知；完整無銷售日仍扣已知費用 |
| C17 | 合計分子除以合計分母，非平均列／通路比率；10%→12.5% 為 +2.5 百分點 |
| C18 | 商品入口只有商品收入／成本／毛利指標；通路入口拒絕 SKU/category，無廣告分攤 |

額外測試：UTF-8／BOM、跨行引號與原始行號、5 MiB／50,000 筆上限、未知欄確認後剔除、category 一致性、八種規則、未四捨五入比率比較、精確排序、null 原因、多次呼叫與輸入不變性。`fixtures/errors` 完全未補值；全部 fixture SHA-256 與開工前一致。

## 本機驗收、限制與未執行項目

- 在專案根目錄執行 `npm ci` 後，依序 `npm test -- --run`、`npm run typecheck`、`npm run lint`、`npm run build`。本輪實際執行的是精確版本 `npm install`；M1 更新依賴後的 `npm ci` **未執行**，不宣稱已做第二次乾淨安裝。
- `npm run dev` 後開啟 `http://127.0.0.1:3000/` 仍是原 M0 頁面，尚無財務互動。M1 瀏覽器驗收 **未執行**；UI 不在本輪範圍，核心以單元／整合測試驗收。
- `npm run test:e2e`、U01–U11、S01–S07、A01–A08、R01–R05 完整關卡：**未執行**；相應 UI、scenario、AI、匯出與發布流程未實作。部分工程檢查通過不代表 M6 已完成。
- fixture 生成及 `scripts/verify_fixtures.py`：**未執行**；避免重寫 fixtures／準備驗證產物，固定答案只讀取。
- 模型 API、登入、資料庫、部署：**未執行／未建立**，本輪未擴大範圍。
- Money/amounts 內部是 BigInt，metrics／facts 才是字串；完整 report 直接 JSON.stringify 尚不支援，匯出序列化留待後續。率輸出至小數 12 位，規則判斷在四捨五入前以 BigInt 交叉相乘比較。
- 未確認銷售 coverage 的完整 headline 保守設為未知。超過 50,000 日通路組合時 `daily_complete=false`，daily 為實際觀察列；缺費用仍傳播 null，不把稀疏列當完整時間序列。上限是技術防護，未執行壓力／效能基準測試。
- M0 的 Webpack 與 ESLint 相容性限制仍適用；本輪未更換框架或工具版本。AGENTS.md、src/app、原 smoke tests、所有原規格與 fixtures 保持不變。

下一個 milestone：M2（`prompts/M2_DEMO_UI.md`），等待下一輪指示；本輪到 M1 停止。

<details>
<summary>M0 歷史紀錄（原階段結果，非本輪進度）</summary>

更新日期：2026-09-30（Asia/Taipei）。以下為 M0 當時的紀錄；當時未開始 M1。

| 項目 | 狀態 |
|---|---|
| 準備包 | 原規格、prompts、合成 fixtures、templates、schema 與準備驗證報告保留 |
| M0 | completed：最小 App、安裝、typecheck、lint、smoke tests、build 與本機啟動已驗收 |
| M1–M6 | not_started／未實作、未驗收 |
| Live AI | not_implemented／未執行測試 |
| 瀏覽器 smoke | 已執行：本機正式模式與開發模式首頁 |
| Playwright E2E | not_implemented／未執行；留待 UI 階段 |
| Deployment | not_deployed／未部署 |

## 環境與範圍

- 專案：`/Users/j-work/Desktop/profitlens-codex-starter`。
- `node --version`：`v25.8.2`；`npm --version`：`11.11.1`；`git --version`：`2.39.5 (Apple Git-154)`。
- `git status --short --branch`：exit 128，`fatal: not a git repository (or any of the parent directories): .git`。本輪不初始化 Git、不建立遠端、不 commit。
- 開始時共有 73 個原始檔案，沒有 package.json、lockfile、node_modules 或 App 程式碼。
- 已完整閱讀 AGENTS、START_HERE、PRD、DATA_CONTRACT、METRICS、ARCHITECTURE、ACCEPTANCE、TASKS 與 M0 prompt。未發現需變更財務口徑的規格矛盾，未修改 DECISIONS 或其他原規格。
- 使用手動新增最小檔案的方式建立骨架，沒有讓 scaffold 工具覆蓋既有目錄。第一次 `next dev` 曾自動追加框架規則至 AGENTS.md；在檔案保留核對時發現，移除該追加區段並確認 SHA-256 與開始時完全相同。最終設定 `agentRules: false`，重啟後驗證原檔不再變動。
- `.env.local` 未建立；無 API key 需求、無 AI endpoint、無使用者資料儲存、無登入或資料庫。

## 完成內容與改動檔案

| 檔案 | 變更 |
|---|---|
| `package.json`、`package-lock.json` | 新增 npm 專案、精確固定版本與可重現安裝；實際 dev/start/typecheck/lint/test/build 命令 |
| `tsconfig.json`、`next-env.d.ts` | 嚴格 TypeScript 與 Next.js 路由型別；next-env 為自動產生並忽略的檔案 |
| `next.config.ts`、`eslint.config.mjs`、`postcss.config.mjs`、`vitest.config.mts` | Next.js、ESLint、Tailwind CSS 與 Vitest 設定 |
| `src/app/layout.tsx`、`src/app/page.tsx`、`src/app/globals.css` | 繁體中文最小首頁、metadata、樣式與真實未開放狀態 |
| `src/domain/.gitkeep`、`src/application/.gitkeep`、`src/components/.gitkeep`、`src/ai/.gitkeep`、`src/lib/.gitkeep` | 保留規格指定目錄；不實作後續 milestone |
| `tests/app-smoke.test.tsx` | 兩項實際渲染首頁／根版型的 smoke tests |
| `.env.example` | 預留空白 server-side key/model，live AI 預設 false |
| `.gitignore` | 保留原規則，新增型別快取、測試產物、log、產生檔與 .vercel 排除 |
| `README.md` | 安裝／啟動／驗收指令、產品計算口徑、限制與相容性說明 |
| `docs/STATUS.md` | 本次實際執行結果 |
| `verification/m0-preservation.json`、`verification/m0-home.jpg` | 原始檔案 SHA-256 比對與瀏覽器首頁截圖 |

安裝版本：Next.js 16.3.7、React/React DOM 19.3.0、TypeScript 5.9.3、Tailwind CSS 4.3.3、ESLint 9.39.5、eslint-config-next 16.3.7、Vitest 4.1.11。其餘精確版本見 package.json 與 lockfile。

## 實際命令與結果

以下命令均於本輪實際執行。Next.js 啟動／建置命令使用 `NEXT_TELEMETRY_DISABLED=1` 停用工具 telemetry；不是模型 API 設定。

| 命令／檢查 | 實際結果 |
|---|---|
| `pwd`、`rg --files ...`、`ls -la` | 確認專案位置、73 個原始檔案與無既有 App 的狀態 |
| `node --version && npm --version && git --version && git status --short --branch` | 版本如上；最後 Git 檢查因未初始化而 exit 128 |
| `npm view next dist-tags.latest engines peerDependencies --json` | 首次失敗：ENOTFOUND registry.npmjs.org，且預設 npm log 目錄不可寫入；後續使用 /tmp cache 與正常權限流程成功 |
| `npm view next dist-tags.latest engines peerDependencies --json --cache /tmp/profitlens-npm-cache --fetch-retries=0 --fetch-timeout=15000` | sandbox 內仍 ENOTFOUND；經核准的網路權限重跑成功 |
| `npm view <package> version engines peerDependencies --json --cache /tmp/profitlens-npm-cache --fetch-retries=0 --fetch-timeout=15000` | 實際逐一查詢 react、react-dom、typescript、@types/node、@types/react、@types/react-dom、eslint、eslint-config-next、vitest、tailwindcss、@tailwindcss/postcss、postcss，確認官方 registry 回傳的穩定版本與相容範圍 |
| `npm view <package> version engines --json --cache /tmp/profitlens-npm-cache --fetch-retries=0 --fetch-timeout=15000` | 實際查詢 vitest@4、eslint@9、typescript@5、@types/node@25，選擇相容穩定版本，沒有猜版本 |
| `npm install --cache /tmp/profitlens-npm-cache --fetch-retries=1 --fetch-timeout=30000` | 通過，exit 0；產生 lockfile；399 packages added，audit 0 vulnerabilities；有 ESLint deprecated 警告 |
| `npm ci --cache /tmp/profitlens-npm-cache --fetch-retries=1 --fetch-timeout=30000` | 通過，exit 0；以 lockfile 重新安裝；400 packages added，audit 0 vulnerabilities；同一 ESLint 警告 |
| `npm ls --depth=0` | exit 0，頂層版本正確；另列出 6 個 native/WASM 相關 extraneous 套件，沒有 unmet/invalid 訊息；本輪未整理這些間接安裝項目 |
| `npm run typecheck` | 通過，exit 0；實際執行 next typegen 與 tsc --noEmit |
| `npm run lint` | 首次失敗：測試的 react/no-children-prop；修正為 JSX 後重跑通過，exit 0，0 errors／0 warnings |
| `npm test -- --run` | 通過，exit 0；1 個測試檔、2 項測試。修正 lint 後重跑仍全部通過 |
| `NEXT_TELEMETRY_DISABLED=1 npm run build`（原 Turbopack 設定） | 失敗，exit 1：CSS 處理子程序 binding to a port → Operation not permitted (os error 1)。經正常權限流程再跑一次仍同錯 |
| `NEXT_TELEMETRY_DISABLED=1 npm run build -- --webpack` | 通過，exit 0；採官方支援的 Webpack 替代建置，不改功能或財務規格 |
| `NEXT_TELEMETRY_DISABLED=1 npm run build`（最終 Webpack 設定） | 通過，exit 0；完成編譯、TypeScript 檢查、靜態頁面生成；路由 `/` 與 `/_not-found` |
| `NEXT_TELEMETRY_DISABLED=1 npm start` | sandbox 首次失敗：listen EPERM 127.0.0.1:3000；經正常權限流程重跑後 Ready，瀏覽器驗收成功；驗收後 Ctrl+C 正常停止（exit 130） |
| `NEXT_TELEMETRY_DISABLED=1 npm run dev` | 經正常權限流程啟動成功，Ready；瀏覽器重新載入確認首頁，交付時保留本機預覽 |
| Node.js fs/crypto 原始檔案 SHA-256 比對 | 73 檔逐項比較；僅 README、STATUS、.gitignore 為授權修改，其餘 70 檔與開始時完全一致；無刪除、無意外修改 |

Turbopack 失敗紀錄：`next-panic-9b574c52b27c54aa0b3d210a2c28505e.log`、`next-panic-e44108285e5079ab160064a4dd200aea.log`，位於本次系統暫存目錄。最終 dev/build 命令固定 `--webpack`，不依賴 Turbopack 驗收成功。

## 瀏覽器驗收方式與結果

1. 建置後啟動 `npm start`，在 Codex 內建瀏覽器開啟 `http://127.0.0.1:3000/`。
2. 實際檢查頁面 title、ProfitLens 標題、繁體中文內容、M0 狀態、功能尚未開放與財務口徑；以截圖檢查字體、樣式與內容呈現，沒有錯誤頁或未完成按鈕。
3. 讀取瀏覽器 warn/error 記錄，結果為空。
4. 停止正式模式，啟動 `npm run dev`，於相同分頁重新載入；同樣呈現首頁、warn/error 為空。截圖存於 `verification/m0-home.jpg`。
5. 關閉框架自動追加 AGENTS.md 後，重新執行 typecheck、lint、2 項測試與 Webpack build，全數通過。再次啟動 dev；舊分頁因停機期間的連線錯誤停在瀏覽器錯誤頁，改以同一瀏覽器的新分頁開啟原本本機網址後驗收成功，warn/error 為空，更新同一張截圖並確認 AGENTS.md 未再改寫。

此次為 M0 本機首頁 smoke，使用瀏覽器當前視窗尺寸；未宣稱完成 1440／768／390px、多瀏覽器或 U01–U11 驗收。開發預覽交付時仍在 `127.0.0.1:3000`；若程序已停止，依 README 重新執行 `npm run dev` 即可。

## 未執行與已知限制

- M1 C01–C18、M2–M3 U01–U11、M4 S01–S07、M5 A01–A08、M6 R01–R05：**未執行**。尚未實作對應功能，本輪限 M0；未把首頁 smoke 或既有 fixture 報告充當這些驗收。
- `npm run test:e2e`：**未執行**，命令與 Playwright 測試留待 UI milestone 建立；沒有建立永遠成功的佔位命令。
- fixture 生成／`scripts/verify_fixtures.py`：**未執行**，後者會重寫準備產物；本輪只核對保留，原 `verification/preparation-report.json` 仍僅代表準備包 QA。
- 即時模型 API、公開部署、登入、資料庫：**未執行／未建立**，不在授權範圍。
- Vitest 5.0.2 的 engines 不支援目前 Node 25，使用支援此環境的 4.1.11。TypeScript ESLint parser 支援 `<6.1.0`，使用 TypeScript 5.9.3。
- ESLint 9.39.5 已被 npm 標示為不再支援；現有 eslint-plugin-react@7.37.5 peer 只到 ESLint 9，未強制安裝不相容的 ESLint 10。需待上游相容後升級；本輪安裝 audit 回報 0 vulnerabilities，不是永久安全保證。
- Turbopack 在本次執行環境仍未通過；最終採 Webpack。一般 Node 安裝、npm registry 網路及本機 server 權限仍是啟動前提。
- 功能限制：目前僅有可啟動骨架，沒有財務結果、資料匯入、dashboard、情境引擎或模型呼叫。

下一關：M1，依 `prompts/M1_DOMAIN.md` 實作資料契約與純函式計算核心，再獨立比對 golden expected values。本輪停止，不提前進入 M1。

</details>

</details>

</details>

</details>
