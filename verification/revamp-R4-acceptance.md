# Revamp v2 — R4 輔助指標、去年同期、目標、檔期、備份 v4 驗收紀錄

- 日期：2026-10-03（Asia/Taipei）
- 分支：`revamp/v2`，基於 R3 `0bc4d78`
- 規格：`docs/revamp/06_BATCHES.md` R4-1～R4-7（R4-8 依 D6＝B 延後）、`05_FEATURES.md §1–§5`
- 財務核心：`git diff --stat 0bc4d78 -- fixtures docs/METRICS.md package.json package-lock.json` 為空；`metric_version` 仍 `contribution-v1`。**本批首次碰 `src/domain`，只有加法**：`Count` 型別、`Summary.units_sold`（介面宣告合併）、`ProductMetrics.units_sold`、`sumUnits`／`sumCounts`／`countMetric` 三個新函式、`analysis.ts` 新私有 `withUnits`；既有函式的輸入輸出不變（`git diff --numstat src/domain` 的刪除行是被延長的 import 與物件字面值，內容保留、只多欄位）。
- 決策：D6＝B（延後 `orders_daily.csv`，依建議值）；其餘取捨記於 `docs/DECISIONS.md`（2026-10-03 R4）。

## 1. 任務對照
| 任務 | 狀態 | 做法與證據 |
|---|---|---|
| R4-1 domain 加法 | 完成 | 先寫 [tests/units-sold.test.ts](../tests/units-sold.test.ts) RED（golden 人工加總：上期 6 件＝DTC 3＋MARKETPLACE 3；本期 8 件＝4＋4；本期商品 DTC/A 3、DTC/B 1、MARKETPLACE/A 3、MARKETPLACE/B 1；`expected.json` 不改）→ `aggregation.ts`／`analysis.ts`／`types.ts` 加法；單列缺件數 → 該範圍 null＋`MISSING_UNITS_SOLD`；涵蓋未確認 → null＋`SALES_COVERAGE_UNCONFIRMED`（與金額同規則） |
| R4-2 `assist-kpi.ts`（assist-kpi-v1） | 完成 | 七格：售出件數、件均淨營收（淨營收 ÷ 件數，ROUND_HALF_UP 兩位）、廣告佔比、MER、商品毛利率、退款比、物流費佔比；A＝0 → MER 不適用；件數 ≤ 0 → 件均不適用；缺件數 → 資料待補。總覽 KPI 五卡下方「輔助指標」橫列（每格可開「怎麼算的」，抽屜以 `unitOverride` count／money_per_unit 顯示、不畫階梯）；分析 CSV 多 `assist_kpi` 列（每期七列）；主管摘要 Markdown 多「輔助指標」小節與 `assist_kpi_version` |
| R4-3 去年同期 | 完成 | `periodPresets(manifest, view?)` 加法：本期不變、上期各減一年（`shiftYear`，2/29 → 2/28；等天數以上期迄日為錨回推等長；整月取去年同月月底）；超出涵蓋／本期晚於基準日／日期不完整／兩期重疊四種「不可用」理由；快捷鈕「去年同期」以表單目前兩期為準 |
| R4-4 `targets.csv` | 完成 | `targets.ts`：解析／驗證（日期、迄日、通路存在或 ALL、指標白名單、金額、重複、空檔）、`matchTargets`（期間完全相同＋ALL 或單一通路才算）、`achievement`（一位小數，目標 ≤ 0 不定義）；資料來源頁「目標（選填）」入口（上傳、範本、移除、問題列出行號）；KPI 卡右下「目標 8,000.00 · 達成 77.5%」或「目標期間 7/1–7/31 與本期不一致」；分析 CSV `target`／`achievement` 列；Markdown「目標達成」小節；備份 v4 保存 |
| R4-5 `events.csv` | 完成 | `events.ts`：解析／驗證（日期、迄日、名稱 ≤ 60 字）、`overlapping`／`eventBands`／`eventSuffix`；趨勢圖以淡色區帶＋標籤標示、圖下列出檔期（可讀文字）；三件事標題後綴「（夏季特賣期間）」；資料來源頁入口；備份 v4 保存；不改任何計算 |
| R4-6 備份 v4 | 完成 | `WORKSPACE_VERSION = "profitlens-workspace-v4"`；新增 `preprocessing`（R3 含稅換算的 conversion＋raw_values，解 R3 的已知限制）、`targets`、`events`、`meeting_history: []`（R6）、`ui_prefs`；v1／v2／v3 仍依原格式驗 checksum 讀入（新欄位為空）；v3 → v4 → 再讀入三份 CSV 逐位元一致（`tests/workspace-backup.test.ts`）；UI 與文件的版本字串更新（`ARCHITECTURE.md`、測試改引用 `WORKSPACE_VERSION`） |
| R4-7 刪除 legacy 匯入面板 | 完成 | 刪 `src/components/import-panel.tsx` 與 `#legacy-import` 分支；精靈共用的 `labels.ui.importPanel` 鍵保留 |
| R4-8 `orders_daily.csv` | 未做 | D6＝B（延後 Phase 2） |

## 2. 新增／主要修改檔案
- 新增：`src/application/{assist-kpi,targets,events}.ts`、`tests/{units-sold,assist-kpi,targets,events}.test.ts`、`tests/e2e/revamp-r4.spec.ts`、`verification/revamp-R4-capture*`
- 修改：`src/domain/{types,aggregation,analysis,product-comparison}.ts`（加法）、`src/application/{period-presets,workspace-backup,export,manager-summary}.ts`、`src/components/{dashboard,overview,top-three,workspace-panels,evidence-drawer,manager-summary,review-workbench,product-comparison-panel}.tsx`、`src/i18n/labels.zh-TW.ts`（`assist`／`targets`／`events`／`periods.yoy*`）、`src/app/globals.css`、`tests/{period-presets,workspace-backup,rules,scenarios,scenario-sensitivity,v2-backup,action-backup}.test.ts`、`tests/e2e/{workspace-storage,review-v2-a}.spec.ts`、`docs/ARCHITECTURE.md`、`docs/DECISIONS.md`、`docs/STATUS.md`
- 刪除：`src/components/import-panel.tsx`

## 3. 驗收命令與真實結果
| 命令 | 結果 |
|---|---|
| `npm run typecheck` | 通過（`✓ Types generated successfully`，無錯誤） |
| `npm run lint` | 通過（`eslint . --max-warnings=0`，0 warnings） |
| `npm test -- --run` | **57 檔／1,014 測試全過**（新增 `units-sold`、`assist-kpi`、`targets`、`events`；`period-presets` 15、`workspace-backup` 33） |
| `npm run build` | `✓ Compiled successfully`，無 warning |
| `npm run test:e2e`（四尺寸） | **488 項全過（9.7 分）**。首跑 483 過／5 失敗：`import.spec.ts` 分析 CSV 測試斷言所有列 `metric_version = contribution-v1`（新 `assist_kpi` 列是 `assist-kpi-v1`）× 四尺寸、`revamp-r1-layout.spec.ts` 期間列在 laptop 變三行（去年同期不可用理由原本放在 sticky 期間列內，1280 寬度下換行）。修正：測試改成依 `row_type` 對照版本並斷言 14 列 `assist_kpi`；理由段落移到期間列正下方（`role="status"`、testid 不變）。三份 spec 重跑 104/104，全套重跑 488/488 |
| `verification/revamp-R4-capture.config.ts` | 4/4（四尺寸各三個畫面，24 檔）＋ 示範資料 laptop 一張（去年同期不可用理由） |
| 財務核心 | `git diff --stat 0bc4d78 -- fixtures docs/METRICS.md package.json package-lock.json` 為空；`git diff --numstat 0bc4d78 -- src/domain` ＝ aggregation +19/−3、analysis +10/−6、product-comparison +3/−2、types +6/−1，刪除行全是延長的 import／物件字面值與私有 helper 更名（`productMetrics` → `withUnits`），匯出函式的輸入輸出不變 |
| 未執行 | Live AI、真實資料、Safari／Firefox、實體裝置 |

## 4. 瀏覽器驗收與截圖
`verification/revamp-R4/`（四尺寸 1440×1000／1280×900／768×1024／390×844，各有 `-viewport.png` 與 `-full.jpg`）：
- `1-overview-assist-targets-*`：總覽 KPI 五卡（淨營收「目標 8,000.00 · 達成 77.5%」、商品毛利「目標期間 2026-07-01–2026-07-31 與本期不一致」、扣廣告後貢獻「目標 4,000.00 · 達成 85.3%」）＋「輔助指標」七格橫列（62 件、100.00 元／件、20.00%、5.00 倍、80.00%、0.00%、1.50%）；手機寬度改單列橫向捲動。
- `2-overview-yoy-*`：按「去年同期」→ 上期自動填 2025-08-01–2025-08-31 → 套用後 KPI 上期 3,100.00、件數上期 62 件、件均 100.00 元／件；趨勢圖有「夏季特賣」區帶與圖下檔期列表。
- `3-data-targets-events-*`：資料來源頁「目標（選填）」與「檔期（選填）」入口（上傳、範本、下載目前 CSV、移除、逐列刪除、行號欄）。
- `4-overview-yoy-unavailable-demo-laptop-viewport.png`：示範資料（涵蓋 2026-06-01 起）按「近 7 天」後，「去年同期」停用、理由「資料從 2026-06-01 開始，不足去年同期所需天數」顯示在期間列正下方；期間列高 88px（≤ 100 的 R1 規則）。
- 人工檢查：輔助指標每格（含上期值）可開「怎麼算的」，件數／件均的抽屜顯示自己的公式與 `assist-kpi-v1`、來源只列銷售檔與資料集設定；目標行是按鈕，抽屜列「實際／目標」與 `targets.csv 第 n 行`；下載選單的分析 CSV 含 `assist_kpi` 與 `target`／`achievement` 列；備份 v4 下載後重新載入三份 CSV 逐位元一致、目標／檔期／`ui_prefs.last_preset` 讀回。

## 4b. 對抗式審查（4 視角 → 每項 3 位反駁者，≥ 2 位不反駁才算確認）
34 項候選、32 項確認（含重複）、2 項被反駁（「domain 不是純加法」「必填欄位改變既有函式輸入型別」——反駁理由：宣告合併與新函式，既有函式輸入輸出不變）。確認項處理：
| 確認項 | 處理 |
|---|---|
| 分析 CSV 匯出在有目標命中時拋錯（達成率「77.5%」寫進數值欄）（高） | 已修：達成率改輸出 12 位小數比率；`tests/targets.test.ts` 加 CSV 列測試 |
| targets.csv > 1,000 列／events.csv > 500 個會讓每次備份失敗（高／中） | 已修：解析時以同一組上限（`MAX_TARGET_ROWS`／`MAX_EVENT_ROWS`，備份 schema 改引用）擋下，訊息 `TOO_MANY_ROWS` |
| 去年同期在整月模式下未檢查本期是否完整月份，標記 ready 但套用失敗（中） | 已修：整月模式本期不完整 → 不可用（monthIncomplete） |
| 趨勢圖檔期區帶在去年同期（上期／本期同月同日刻度撞名）消失、單週檔期零寬（中，兩筆） | 已修：x 軸改週序號數值軸＋`tickFormatter`，區帶改用 `events.ts` 的分數位置 `eventBands`（也消除「死碼」一項） |
| 淨營收 ≤ 0 且有廣告費時 MER 顯示「資料待補」（中） | 已修：狀態規則與 KPI 卡相同——只有 MISSING_*／涵蓋未確認是「資料待補」，其餘 null 為「不適用」；加測試 |
| 件數／件均的「怎麼算的」技術細節顯示淨營收公式與 contribution-v1（中，兩筆） | 已修：`EvidenceSelection` 加 `formulaTechnical`／`metricVersion`／`nullDisplay`，輔助指標傳自己的技術公式與 `assist-kpi-v1`；件數 0 的抽屜也顯示「不適用」 |
| 輔助指標的上期值不能開「怎麼算的」（中／低） | 已修：上期值也是按鈕 |
| CSV 的 assist_kpi 列版本寫 contribution-v1、來源含費用與廣告列（低） | 已修：版本欄寫 `assist-kpi-v1`；件數／件均只列銷售與資料集設定來源，既有比率用 `metricSources` |
| 目標數字不可追溯（KPI 卡是純文字、CSV 來源不是 targets.csv）（中，兩筆） | 已修：目標行改為按鈕開抽屜（實際、目標、公式「實際 ÷ 目標」、`targets.csv 第 n 行`）；CSV 目標列 `source_refs` 指向 targets.csv 行號；資料頁表格加行號欄 |
| `ad_spend` 目標接受卻不顯示（中／低，兩筆） | 已修：顯示在「廣告佔比」輔助格，措辭「廣告預算 X · 用掉 Y%」 |
| 不一致訊息沒有年份，去年同期時與本期撞名（中） | 已修：改完整日期 |
| 去年同期的不可用理由只在 title／sr-only（低） | 已修：期間列正下方可見 `role="status"` 文字（放在 sticky 期間列外面，維持 R1「1280 以上最多兩行」；全套 E2E 首跑時 `revamp-r1-layout.spec.ts` 在 laptop 抓到第三行，據此調整） |
| 還原 v4 不重驗目標／檔期／原值（中） | 已修：`restoreV4` 以 `targetRowIssues`（含通路存在）、`eventRowIssues` 重驗，原值逐格 `convertInclusiveAmount(raw) === 儲存值`，不符即 `INVALID_WORKSPACE_FORMAT`；加測試 |
| `ui_prefs` 永遠是 {}（中） | 已修：記錄上次快捷（`last_preset`）並在還原時讀回（只記錄不自動套用）；E2E 驗證 |
| 換資料後舊的目標／檔期錯誤清單殘留（低，兩筆） | 已修：`activate()` 一併清空 |
| 原值字串 > 40 字元讓備份失敗（低） | 已修：schema 放寬到 200（與金額規則一致） |
| 檔期無法在資料頁逐列編輯／刪除（低） | 已修：逐列刪除＋下載目前 CSV；不做列內編輯（見 DECISIONS 補記） |
| 匯出的 CSV 遇到以 = + - @ 開頭的文字會多一個撇號、不是完整 round trip（低） | 未修：維持 CSV 防公式注入規則；§5 列為限制 |
| 三件事後綴只看本期（低） | 不改：記於 DECISIONS 補記 |
| 「N≤0」測試其實測的是件數 −1；涵蓋未確認＋缺件數未測（低） | 已修：補兩個測試並改標題 |
| 文件仍提 v3／#legacy-import；E2E 寫死中文（低） | 已修：README／ARCHITECTURE；E2E 改用 labels＋`fill` |

## 5. 已知限制與風險
- `orders_daily.csv`（訂單數／客單價／轉換率）依 D6＝B 延後；輔助指標列沒有這三格。
- 去年同期以表單目前兩期為準；資料涵蓋不足一年、本期晚於基準日、整月模式本期不完整、本期超過一年（兩期重疊）皆顯示不可用與理由，不拋錯。
- 目標只支援四個指標（net_revenue、gross_profit、contribution_after_marketing、ad_spend）與 ALL／單一通路；多通路部分選取不匹配；期間必須完全相同、不按比例折算；`ad_spend` 目標顯示在「廣告佔比」輔助格（預算措辭）。
- 檔期只標示在週趨勢圖（區帶＋圖下列表）與三件事標題後綴（只看本期）；不改任何計算；列內編輯改為「刪列＋重傳」。
- 匯出的 targets.csv／events.csv 沿用防公式注入規則（以 = + - @ 開頭的文字會加撇號），讀回時不自動去除。
- 備份 v4 的 `meeting_history` 先為空（R6）；`ui_prefs` 只記上次快捷（看板／清單視圖留 R5）；還原 v1–v3 時新欄位為空。
- 輔助指標橫列七格（規格寫六格，依表列七項）；手機寬度改單列橫向捲動以維持 R1 首屏規則。
- 真實資料、Live AI、Safari／Firefox、實體裝置：**未執行**。

## 6. 下一批建議與待拍板
見批次回報。
