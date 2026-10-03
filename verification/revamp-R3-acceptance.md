# Revamp v2 — R3 匯入精靈與台灣來源 驗收紀錄

- 日期：2026-10-03（Asia/Taipei）
- 分支：`revamp/v2`，基於 R2 `979462c`
- 規格：`docs/revamp/06_BATCHES.md` R3-1～R3-9、`04_IMPORT_TW.md` 全文
- 財務核心：`src/domain/*`、`fixtures/*`（含 golden／demo／errors／refund_only／zero_ad）、`docs/METRICS.md`、`docs/DATA_CONTRACT.md`、`package*.json` 零改動（`git diff --stat 979462c -- src/domain fixtures docs/METRICS.md docs/DATA_CONTRACT.md package.json package-lock.json` 為空）；`metric_version` 仍為 `contribution-v1`；`src/domain/validation.ts` 一字未改，含稅換算只在 `src/application/tax-basis.ts`。
- 決策：D2＝A（含稅預設勾選：銷售三欄＋通路費用四欄＋廣告費，成本不勾）、D5＝A（CLI 彙總腳本，UI 不彙總）依建議值執行；另四個實作取捨記於 `docs/DECISIONS.md`（2026-10-03 R3）。

## 1. 任務對照
| 任務 | 狀態 | 做法與證據 |
|---|---|---|
| R3-1 四步精靈 | 完成 | `src/components/import-wizard/{index,step-files,step-mapping,step-basis,step-review}.tsx`；狀態機與純函式在 `src/application/import-wizard.ts`（reducer、預選順序、提議、月快捷、檢核、記憶）；對外仍是 `onCommit(prepared, manifestName?)`／`onCancel`；舊 `import-panel.tsx` 保留，只在網址 `#legacy-import` 時掛在 `<div id="legacy-import">`（R4 刪） |
| R3-2 拖放、自動歸位、即時檢查 | 完成 | 第 1 步拖放區（原生 drag/drop，檔名含 sales／cost／ad／銷售／費用／廣告自動歸位）；每格顯示檔名、大小、列數、欄數、編碼（UTF-8／BOM）；> 5 MiB 不讀進記憶體直接擋，> 50,000 列由既有 parser 擋，訊息用 `labels.importErrors` 白話句，「下一步」停用 |
| R3-3 含稅換算＋原值＋摘要 | 完成 | `src/application/tax-basis.ts`（逐列 `÷ (1+rate)` ROUND_HALF_UP 兩位，空白／非數字原樣）；`prepareImport` 新增 `conversion` 選項，回傳 `conversion`（basis／rate／fields／rows_converted／totals）與 `raw_values`；抽屜來源列顯示「~~含稅原值~~ → 未稅換算值」＋換算註記；資料頁「本次匯入的前處理」；分析 CSV `limitations` 欄與主管摘要 Markdown 口徑說明各加一句；備份仍 v3（R4 升 v4 時保存，見 §5） |
| R3-4 來源預設＋字典＋偵測 | 完成（全部待驗證） | `src/application/source-presets/{presets,dictionary,index}.ts`：9 個 preset 一律 `verified: false`，檔頭寫驗證方法；§4.4 字典 53 個別名；`detectPreset`（≥ 2 指紋欄命中）、`isOrderLevel`、`suggestMapping`（exact → preset → dictionary，不重複使用來源欄）；UI 顯示「看起來像 ○○ 的匯出檔」與「候選對照（待驗證）」，訂單級檔案顯示「這是訂單明細…」並連到整理工具說明 |
| R3-5 對照記憶 | 完成 | `src/application/mapping-memory.ts`（鍵＝SHA-256(角色＋排序後標題列)）；`local-store.ts` 資料庫升 v2 新增 `mapping-memory` store（舊 v1 的 workspace 紀錄不動；「刪除本機資料」刪整庫一併清除）；只在儲存面板「我同意把資料存在這個瀏覽器」為勾選時寫 IndexedDB，否則留在分頁記憶體；第 2 步顯示「上次（9/28）用過同樣欄位的對照，已帶入，請確認」 |
| R3-6 提議直接填入、通路列出、截至日、整月快捷 | 完成 | 進入第 3 步即以 `proposeImportSettings` 填表（標示「由檔案提議，請確認」）；`data_as_of` 預設最後一天＋1；通路從三檔列為勾選框；涵蓋 ≥ 2 個完整月時出現「改用整月比較：YYYY-MM vs YYYY-MM」 |
| R3-7 錯誤訊息白話對照 | 完成 | 先 grep `validation.ts`／`date.ts`／`csv.ts`／`import.ts`／`import-guidance.ts`／`limits.ts` 的全部 reason code（表見 §2b），`labels.importErrors` 逐一補白話句（含 `{line}{date}{channel}{field}` 占位）；`IssueList` 主層顯示白話句，原技術訊息與代碼收在「問題代碼」收合區（`tests/manager-language.test.ts` 同步） |
| R3-8 範本含三列範例 | 完成 | `templates/examples/{sales_daily,channel_costs_daily,ad_spend_daily}.csv`＋`manifest.json`＋README；複本在 `public/templates/examples/` 供精靈與下載選單連結（`tests/templates.test.ts` 把關同步、可通過 `validateDataset`）；下載選單與第 1 步「沒有檔案？」都提供空白範本與範例檔 |
| R3-9 訂單彙總腳本＋說明 | 完成 | `scripts/aggregate_orders.py`（Python 3 標準函式庫、Decimal ROUND_HALF_UP、依 `rules.json`：訂單折扣按行金額比例分攤、餘數給最後一行；退款記在退款日；含稅先逐行換算再加總；費用與廣告輸出 0 佔位；`aggregation_log.md`）＋`scripts/aggregate_rules.example.json`＋`docs/ORDER_AGGREGATION.md`；`tests/aggregate-orders.test.ts` 以手算 fixture（`tests/fixtures/orders_sample`）實跑腳本比對 |

## 2. 新增／主要修改檔案
- 新增：`src/application/tax-basis.ts`、`src/application/import-wizard.ts`、`src/application/mapping-memory.ts`、`src/application/source-presets/`、`src/components/import-wizard/`、`scripts/aggregate_orders.py`、`scripts/aggregate_rules.example.json`、`docs/ORDER_AGGREGATION.md`、`templates/examples/`、`public/templates/examples/`、`tests/tax-basis.test.ts`、`tests/import-wizard.test.ts`、`tests/mapping-memory.test.ts`、`tests/source-presets.test.ts`、`tests/aggregate-orders.test.ts`、`tests/templates.test.ts`、`tests/fixtures/inclusive_tax/`、`tests/fixtures/orders_sample/`、`tests/e2e/import-wizard.spec.ts`、`tests/e2e/import-wizard-helpers.ts`、`verification/revamp-R3-capture*`、`verification/revamp-R3-shared.config.ts`
- 修改：`src/application/import.ts`（`conversion` 選項、`PreparedImport.conversion`／`raw_values`、`INVALID_TAX_RATE`）、`local-store.ts`（v2）、`copy.ts`（`plainIssueMessage`、`conversionSentence`）、`export.ts`（分析 CSV 口徑限制欄）、`manager-summary.ts`（口徑說明加一句）、`src/components/dashboard.tsx`（精靈掛載、`#legacy-import`、本機保存同意提升、下載選單範本）、`evidence-drawer.tsx`（原值→換算值）、`workspace-panels.tsx`（前處理摘要）、`issue-list.tsx`（白話句）、`workspace-storage.tsx`（受控同意）、`manager-summary.tsx`／`review-workbench.tsx`（傳遞 conversion）、`src/app/globals.css`、`src/i18n/labels.zh-TW.ts`（`importWizard` 擴充、`importErrors` 全表、`evidence`／`downloads` 新鍵）
- 測試更新：`tests/import.test.ts`、`tests/manager-language.test.ts`、八個驅動舊面板的 E2E spec（見 §3）

### 2b. reason code 對照表（R3-7）
| 來源 | reason code |
|---|---|
| `src/lib/csv.ts` | FILE_TOO_LARGE、INVALID_UTF8、INVALID_HEADER、DUPLICATE_COLUMN、COLUMN_COUNT_MISMATCH、ROW_LIMIT_EXCEEDED、MALFORMED_CSV、EMPTY_CSV |
| `src/application/import.ts` | INVALID_FILE_EXTENSION、FILE_SIZE_MISMATCH、MISSING_FILE、LOGICAL_FILE_MISMATCH、INVALID_IMPORT_DRAFT、UNKNOWN_MAPPING_TARGET、MISSING_COLUMN_MAPPING、MISSING_SOURCE_COLUMN、DUPLICATE_SOURCE_MAPPING、COLUMN_MAPPING_UNCONFIRMED、UNKNOWN_COLUMN_UNCONFIRMED、UNKNOWN_COLUMN_IGNORED、AMOUNT_BASIS_UNCONFIRMED、SOURCE_AMOUNT_BASIS_UNSUPPORTED、INVALID_TAX_RATE（新）、INVALID_MANIFEST_JSON、INVALID_MANIFEST_STRUCTURE、FILE_READ_FAILED（元件） |
| `src/application/import-guidance.ts`／`limits.ts` | PROPOSAL_KEYS_INVALID、ANALYSIS_PERIOD_TOO_LARGE、ANALYSIS_CHANNEL_LIMIT |
| `src/domain/validation.ts`（不改） | INVALID_MANIFEST、SALES_COVERAGE_UNCONFIRMED、MISSING_FILE、MISSING_COLUMN、UNKNOWN_COLUMN_UNCONFIRMED／IGNORED、MISSING_KEY、INVALID_DATE、OUTSIDE_COVERAGE、UNKNOWN_CHANNEL、MIXED_CURRENCY、DUPLICATE_SALES_KEY／COST_KEY／AD_KEY、INVALID_AMOUNT、NEGATIVE_AMOUNT、MISSING_COGS、MISSING_GROSS_SALES／DISCOUNTS／REFUNDS／PLATFORM_FEES／PAYMENT_FEES／FULFILLMENT_COSTS／OTHER_VARIABLE_COSTS／AD_SPEND、MISSING_UNITS_SOLD、INVALID_UNITS、INCONSISTENT_CATEGORY、DISCOUNT_EXCEEDS_GROSS、MISSING_CHANNEL_COST_DAY、MISSING_AD_DAY |
| `src/domain/date.ts`（期間） | INVALID_PERIOD、PERIOD_ORDER_INVALID、OVERLAPPING_PERIODS、PERIOD_OUTSIDE_COVERAGE、INVALID_DATA_AS_OF、PERIOD_AFTER_DATA_AS_OF、UNEQUAL_PERIOD_LENGTH、INCOMPLETE_CALENDAR_MONTH、INVALID_COMPARISON_MODE |

## 3. 驗收命令與真實結果
| 命令 | 結果 | 摘要 |
|---|---|---|
| `npm ci` | 未重跑 | `package.json`／`package-lock.json` 零改動，沿用 R0 乾淨安裝（本批允許新增依賴：無） |
| `npm run typecheck` | 通過 | exit 0 |
| `npm run lint` | 通過 | `eslint . --max-warnings=0` exit 0 |
| `npm test -- --run` | 通過 | **51 files／921 tests**（R2 基線 45／839 ＋ `tax-basis` 7、`import-wizard` 17、`mapping-memory`、`source-presets` 15、`aggregate-orders` 11、`templates` 14；`import`、`export`、`manager-language`、`labels-coverage` 同批更新） |
| `npm run build` | 通過 | ✓ Compiled successfully；路由 `/`、`/_not-found`、`/api/datasets/[id]`、`/api/insights` 不變；無 warning |
| `npm run test:e2e` | 通過（最終一輪） | 全套 **472 項：460 passed／12 failed**（四尺寸，11.9m）。12 項失敗＝3 個改寫測試 × 4 尺寸（`import-guidance` PL03／PL04 換檔、`m6-acceptance` 檢核後改設定），原因是審查修正把「自動完成的第 2 步」改成可回看後，測試裡「上一步兩次即回第 1 步」的預期過時；只改測試（共用 `backToFiles` helper）後 `import-guidance`＋`m6-acceptance`＋`import-wizard` 三個 spec 四尺寸重跑 **60/60 通過**（1.2m），產品未改動。 |

過程紀錄：第一輪全套 468 項 464 passed／4 failed，4 項是同一測試（`workspace-storage` 清空後本機保存同意未重設，因同意狀態提升到 Dashboard）→ 清空時一併重設後該 spec 4 尺寸重跑 8/8 通過。八個驅動舊面板的 spec 由 8 個代理各自改寫（對共用正式伺服器 `verification/revamp-R3-shared.config.ts` 驗證 desktop＋mobile 全過，無阻擋項、無 `.skip`）。

`git diff --stat 979462c -- src/domain fixtures docs/METRICS.md docs/DATA_CONTRACT.md package.json package-lock.json`：**空**。`grep -rn "including_tax\|convertInclusive" src/domain`：零命中（換算只在 `src/application/tax-basis.ts`／`import.ts`）。

## 4. 瀏覽器驗收與截圖
- 截圖：`npx playwright test --config verification/revamp-R3-capture.config.ts` → `verification/revamp-R3/{1-step1-empty,2-step1-files,3-step2-mapping,4-step3-basis,5-step4-review,6-overview-after,8-data-preprocessing,9-step2-memory}-{desktop,laptop,tablet,mobile}-{viewport.png,full.jpg}` ＋ `7-drawer-raw-converted-{四尺寸}.png`，共 68 張（四尺寸各至少 9 張）。流程：中文欄名的銷售檔（第 2 步出現）→ 含稅 5% → 檢核通過 → 套用 → 總覽淨營收 2,150.00 → 抽屜「840.00 → 800.00」→ 資料頁前處理 → 再匯入同檔顯示記憶提示。
- 人工檢視截圖：第 1 步拖放區與三格、第 2 步對照表（藍色「系統建議，請確認」）、第 3 步口徑（修正全域 `fieldset` flex 樣式造成的單選排版後重拍）、第 4 步摘要、抽屜「~~含稅原值~~ → 換算值」在 1440／390 寬度皆可讀。
- E2E 四種視窗：1440×1000、1280×900、768×1024、390×844（`playwright.config.ts` 四個 project）。
- 真實平台匯出檔走查 preset 偵測與對照：**未執行**（真實檔仍待使用者提供）。2026-10-03 追加：蝦皮、momo 店+、91APP 以公開文件重建標題列、製作去識別化合成樣本並通過偵測／對照／彙總手算測試，紀錄在 [revamp-R3-preset-verification.md](revamp-R3-preset-verification.md)。

## 4b. 對抗式審查（4 視角 → 每項 3 位反駁者，≥ 2 位不反駁才算確認）
45 項候選、33 項確認、12 項被反駁。確認項處理如下（全部修於本批，產品與測試同批更新）：
| 確認項 | 處理 |
|---|---|
| 第 4 步對帳表在含稅匯入後每個換算欄都顯示假差額（中，兩位審查者各自重現） | 已修：`buildImportReconciliation` 對有 `raw_values` 的格子以同一 `convertInclusiveAmount` 換算後再加總，差額回到 0.00；表下加註「來源總額已逐列換算」，含稅原值合計在前處理摘要 |
| 選「含稅」但全部欄位不勾，含稅金額當未稅匯入（中） | 已修：`canConfirm` 要求至少一個換算欄位，第 3 步顯示提示 |
| `headerKey` 正規化讓大小寫／括號不同的欄名被當作「完全相同」而自動略過第 2 步（中） | 已修：只有與標準欄名逐字相同才算 exact，其餘降為「系統建議，請確認」 |
| `detectPreset` 只靠 2 個常見欄名（交易日期＋SKU、結帳日＋手續費）就把日粒度檔案判成訂單級（中） | 已修：第一個指紋欄（訂單編號／商品編號／Day）必須命中 |
| 清空工作區後本機保存同意未重設（中；同意狀態提升到 Dashboard 的回歸） | 已修：清空時一併重設；全套 E2E `workspace-storage` 4 尺寸重跑通過 |
| 「刪除本機資料」沒清掉分頁記憶體裡的對照記憶（中，兩筆） | 已修：`clearWizardMemory()` 於 onDeleted 呼叫 |
| 新 session 若沒再勾同意，之前存進 IndexedDB 的記憶讀不到（中） | 已修：讀取時只要本機資料庫已存在就讀（不會為了讀取新建資料庫）；寫入仍須同意 |
| 設定檔讀取失敗後沒有任何控制可解除，匯入永遠被擋（中） | 已修：失敗時也顯示「改為手動設定」 |
| 自動略過的第 2 步無法回看（低） | 已修：上一步一律回前一步，第 2 步顯示「欄名全部符合標準，已自動對照」 |
| 對照記憶在取代對話框確認前就寫入（低） | 已修：`onCommit` 多一個 `afterCommit`，資料真的套用後才記 |
| 訂單級提示只在第 2 步（規格 §4.3 要求第 1 步）（低） | 已修：第 1 步該格即顯示（`import-order-level-<role>`），第 2 步保留；維持提示不硬擋（避免誤判時無法繼續） |
| 整理工具說明連到 GitHub main（尚未合併，404）（低，兩筆） | 已修：改由 `public/docs/ORDER_AGGREGATION.md` 提供（`tests/templates.test.ts` 把關與 `docs/` 同步） |
| 其他匯出（商品明細、通路寬表、決策 Markdown／CSV／JSON）沒有換算註記（低／中） | 已修：商品明細 CSV 與通路寬表 CSV 口徑限制欄、決策三種格式的限制清單都帶上同一句（只掛在與目前資料同版本的區段） |
| 會議分頁開啟的抽屜沒有原值→換算值（低） | 已修：來源 dataset_hash 與目前資料相同時沿用 raw_values |
| `TaxDecimal` 固定 40 位精度，超長金額的分可能算錯（低） | 已修：依輸入位數放大精度 |
| 白話模板缺上下文（範圍層級的 MISSING_*_DAY 沒有日期／通路）（低） | 已修：模板需要的占位符缺值時回到原訊息 |
| 問題清單 CSV 只有舊技術訊息（低） | 已修：新增 `message_plain` 欄 |
| 鍵盤焦點在選檔按鈕上看不見（低） | 已修：`:has(input:focus-visible)` 外框 |
| 記憶鍵有 trim 但比對來源欄名用原字串，多空白時不套用（低） | 已修：比對時 trim＋NFC |
| `aggregate_orders.py` 把「10」與「10.00」視為不同折扣（低）；exit 1 時說「未輸出任何檔案」但舊輸出仍在（低） | 已修：以 Decimal 比較；訊息改為「本次未輸出，既有舊輸出不會被刪除」 |
| 同意文案「不會自動儲存」與匯入會記對照相牴觸（中） | 已修：文案改為「工作區不會自動儲存；匯入時會記住欄位對照」，第 4 步摘要另有一句說明記在分頁或這台電腦 |
| 「5 次點擊」依賴選檔不計次、選檔框沒有 `multiple`、拖放沒測（低） | 已修：三個選檔框支援 `multiple`（多檔依檔名歸位），新增拖放／多選 E2E；點擊數以 E2E 內計數器證明（匯入資料→下一步→未稅→確認並檢核→套用＝5） |
| IndexedDB 升 v2 讓舊 build 的分頁／回滾讀不到（低，兩筆） | 部分：加 `onversionchange` 主動關閉舊連線；回滾到 R2 build 無法讀 v2 資料庫是已知限制（§5） |
| 備份／本機副本還原後遺失 conversion 與 raw_values（低） | 未修（規格 04 §3 指定 R4 升 v4 一併）；§5 已知限制 |
| 使用者對標準欄名的手動覆寫不會被記住（中） | 未修：規格 §2 預選順序以「標準欄名完全相同」為第一優先；§5 列為限制 |
| 字典正規化把「商品金額（含稅）」與「商品金額（未稅）」視為同一欄名、預選先出現者（低） | 未修：兩欄都在第 2 步可見且須確認；§5 列為限制 |
被反駁（不處理）：備份遺失換算是「高」（實為已文件化的 R4 項）、會議抽屜「永遠」沒原值（同版本已顯示）、手改設定後換檔通路清單過期（`enterSettings` 已合併新通路）、全不勾通路只給 INVALID_MANIFEST（已改為第 3 步擋下並提示）、提議失敗無聲（已加提示）、移除檔案時 reading 卡住（ticket 機制會丟棄）、JSX 全形標點、測試方向、說明未提醒選未稅。

## 5. 已知限制與風險
- **備份仍是 v3**：`conversion`／`raw_values` 不進備份與本機副本；還原後抽屜只顯示換算後值、資料頁沒有前處理摘要、匯出沒有換算句（資料本身是正確的未稅值）。R4 升 v4 時保存（04 §3）。
- **IndexedDB 已升 v2**：回滾到 R2 build 的分頁無法開啟 v2 資料庫（本機副本讀不到，需「刪除本機資料」後重存）；同時開著的舊分頁會被 `onversionchange` 關閉連線。
- **來源預設 9 個全部 `verified: false`**：欄名為候選，需真實匯出檔驗證（見批次回報的材料清單）；偵測只做提示不硬擋。
- **對照記憶只記「非標準欄名」的對照**：標準欄名永遠以「完全相同」優先，手動把標準欄名改對到別欄不會被記住。
- **字典正規化會去掉括號內容**：「商品金額（含稅）」與「商品金額（未稅）」同時存在時預選先出現者，需在第 2 步確認。
- **訂單級檔案**只提示並連到說明，不在 UI 內彙總（D5＝A）；腳本第一版不分攤廣告費、費用與廣告輸出 0 佔位。
- 舊面板 `import-panel.tsx` 仍在（`#legacy-import` 才掛載），R4 刪除；`labels.ui.importPanel` 的對帳表等鍵由精靈共用，其餘在 R4 清理。
- 真實平台匯出檔走查、Live AI、Safari／Firefox、實體裝置：**未執行**。

## 6. 下一批建議與待拍板
見批次回報。
