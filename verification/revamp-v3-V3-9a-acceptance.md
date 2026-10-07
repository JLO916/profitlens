# Revamp v3 V3-9a 驗收：P1 新增功能：計算與資料層（2026-10-07）

依 `docs/revamp-v3/06_BATCHES.md` V3-9a（V3-9 依 CLAUDE.md 在開工前拆成 a／b：本批做 F12 損益兩平 MER、F13 廣告決策標籤＋備份 v5、F9 每日／每週管理損益表；F8、F10、F14、F22 與需要使用者提供檔案的 F15、F16 在 V3-9b）與 PRD §10.1 F9／F12／F13、§7.1 區塊 9／10、§7.5 第 7 點、§9.3 報表型表格、§6.3 #59／#60、§11.4 禁區、§11.6 可追溯性、§11.8 備份相容；拍板 D-V3-17＝C、D-V3-19＝A、D-V3-8＝A、D-V3-7。H2／H3 依使用者 2026-10-07 指示略過；H1、H4 未執行。

工作方式：開工錨點 `530b9af`（批次拆分寫進 06_BATCHES、labels／CSS／掛載測試錨點）→ 三個 worktree 代理並行（A `5264d43`、B `4bdc49b`、C `8402a0d`）→ 合併（無衝突）→ 接線 `2326826`（還原 v5 不再出現「這版改了什麼」、抽屜 definition 覆寫、「進階」summary 新鍵、重複的 SSR 狀態、文件版本敘述）→ 三個 E2E 代理對共用伺服器遷移 spec 並新增三支功能 spec → 全套 E2E → 四尺寸截圖與 Lighthouse → 本文件。

## 1. 完成項目（對照 06_BATCHES V3-9a）

| 項目 | 狀態 | 說明 |
|---|---|---|
| F12 損益兩平 MER：計算（`src/application/breakeven-mer.ts`，`breakeven-mer-v1`） | 完成 | 淨營收 ÷ 扣廣告前貢獻，精度與既有 MER 相同（domain `ratioMetric`：12 位、HALF_UP）；扣廣告前貢獻 ≤ 0 → null＋`NON_POSITIVE_CONTRIBUTION_BEFORE_MARKETING`（不顯示 0 或無限大）；淨營收 = 0 → `ZERO_NET_REVENUE`；淨營收 < 0 沿用 domain 的 `NON_POSITIVE_NET_REVENUE`；缺資料 → status missing；廣告費 = 0 → 照算，比較不適用；比較（高於／低於／相等）用精確的分比較扣廣告前貢獻與廣告費，不受取位影響。`ASSIST_KPI_VERSION` 與 7 個輔助指標不動 |
| F12 顯示與可追溯 | 完成 | 總覽「其他常用指標」兩欄表之後獨立段 `assist-breakeven-mer`：本期／上期 number-link（`assist-breakeven-current／previous`）、一句 L1 結論（`assist-breakeven-note`，不上色）、`?` 說明（`assist-breakeven-help-trigger／help`，hidden 掛載，Esc 回焦）；「計算與來源」抽屜顯示公式（含兩個輸入的 L3 金額）、自己的白話定義（收尾加 `EvidenceSelection.definition`）、版本 `breakeven-mer-v1`、來源（銷售與通路費用，不含廣告）；不畫 MER 的比率表 |
| F12 匯出 | 完成 | 分析 CSV 每期一列 `row_type=breakeven_mer`、`metric_version=breakeven-mer-v1`（12 位比率）；Excel 摘要表一列（L3 文字格「3.50 倍」）＋指標定義表技術一列；主管摘要 Markdown「其他常用指標」表一列＋技術細節一行。既有列、順序與數值不變：`export-numeric-stability` 通過（基準只新增 2 列，手算值）；V3-7 正規化基準去掉新增列後 SHA-256 逐字相同 |
| F13 廣告決策標籤 | 完成 | `BoundAction.ad_decision?: "pause" \| "adjust" \| "increase"`（使用者自選，不自動判斷）；共用編輯器「內容」段多「廣告決策」select（`action-ad-decision`：不標／暫停／調整／加碼，即時生效）；看板卡片 `board-card-{n}-ad-decision`、清單 `action-{n}-ad-decision` 徽章（C8 中性色，只在有值時）；決策 Markdown 多一行、CSV 最後多一欄 `廣告決策 (ad_decision)`、JSON 多 `ad_decision`（有值時）；既有欄位、順序與數值不變 |
| 備份 v5 | 完成 | `WORKSPACE_VERSION = "profitlens-workspace-v5"`（v4 信封＋`items[].ad_decision` 選填）；restore 接受 v1–v5；v4 檔還原後 `ad_decision` 為 undefined；v1–v4 信封若帶此欄位一律 `INVALID_WORKSPACE_FORMAT`；checksum、limits、integrity 不變；`verification/revamp-v3/backup-schema-v5.json`（key_paths ＝ v4 ＋ 1）＋`tests/backup-schema-v5.test.ts`；v4 的 json 與測試保留為歷史版本；IndexedDB 存整個信封，不用改；收尾：`RestoredWorkspace.restored_schema_version`，還原 v5 不再出現「這版改了什麼」 |
| F9 管理損益表：計算（`src/application/pnl-table.ts`） | 完成 | 只呼叫 domain 既有的 `sumTotals`、`calculateMetrics`、`uniqueSources`、`dateRange`、`parseCents`、`ratioMetric`，不寫新公式、不經浮點（測試靜態檢查）；日欄＝同一天各通路 totals 相加再算四層；缺的日子整欄 null＋`PNL_NO_DAILY_ROWS`（「無資料」，不是 0）；週欄沿用 `snapshot.weeks`；合計欄＝`report.current.metrics`；佔淨營收 %＝列合計 ÷ 淨營收合計（存 12 位精確比率，呈現端取位；淨營收 ≤ 0 時不適用）；13 列固定順序（`PNL_ROWS`）、kind item／subtotal／total、`isZero` |
| F9 畫面（總覽「進階」details 內，D-V3-19＝A） | 完成 | `details[data-testid=pnl-table]`（預設收合、內容掛載）在 period-comparison 之後；日／週分段（`pnl-granularity-day／week`，aria-pressed）、「顯示零值列」（`pnl-show-zero`；零值的費用列預設 hidden 掛載，小計與合計一律顯示）、單位一句；`table.report-table` 在 `.table-scroll` 內、第一欄 sticky；費用列「減：」前綴、小計列 600／1px、合計列 600／2px；每格 `button.number-link`（formatAmountL2，U+2212）開「計算與來源」（單日期間、該天各通路來源）；佔淨營收 % 用 formatRateL1（一般文字，見 §5）；本期超過 92 天時只提供每週（說明一句）；「進階」summary 改新鍵「進階：期間合計與日均、管理損益表」（PRD §7.1 區塊 10） |
| labels 新分組 | 完成 | `assist.breakevenV3` 23 鍵、`actions.adDecisionV3` 7 鍵、`overview.pnlV3` 16 鍵（含收尾的 `advancedSummary`）；既有鍵字串不變（`LEGACY_PREFIXES` 的 assist 一列改成只列 v2 五鍵，legacyAliases 不變）；copy-style 同義詞 13／禁用詞 3 不變 |
| 單元測試與 E2E | 完成（117 檔／2,311 測試全過（負載平均降到 3–8 時 17 秒跑完；負載 13–44 時 meeting-backup／meeting-page 的「不同資料集」案例會逾時，見 §5）；E2E 全套 728 passed（21.5m）、0 failed、0 skipped（V3-8：680；本批新增 48 條：breakeven-mer 4、ad-decision 2、pnl-table 5、workspace-storage 的 v4 還原 1，各 ×4 專案）） | 新增 `tests/breakeven-mer.test.ts`、`tests/pnl-table.test.ts`（21）、`tests/pnl-table-ui.test.tsx`（15）、`tests/backup-schema-v5.test.ts`、`tests/action-ad-decision.test.ts`、`tests/helpers/full-backup.ts`；`mounted-testids` 新增 `overview-zero-ad`、`overview-refund-only`、帶標籤待辦的狀態與 A／B／C 的 M1／M6 測試；E2E：新增 `tests/e2e/breakeven-mer.spec.ts`（golden 總覽段與抽屜、? 說明、分析 CSV 與一頁摘要 Markdown、zero_ad、refund_only；期待值以 BigInt 重算 12 位比率）、`ad-decision.spec.ts`（示範資料：抽屜選「加碼」→ 看板／清單徽章、決策 JSON／CSV／Markdown、備份 v5 與還原後不出現「這版改了什麼」、改回不標；golden：Tab 順序與 focus trap）、`pnl-table.spec.ts`（預設狀態與 42 日欄、合計格與單日格的抽屜、每週 6 欄、refund_only 的零值列與 U+2212、橫向捲動與第一欄 sticky；四尺寸）；helper `breakeven-helpers-v39.ts`、`ad-decision-helpers-v39.ts`、`pnl-helpers-v39.ts`；更新 `import.spec`（metric_version 接受 breakeven-mer-v1、2 列）、`revamp-r6.spec`（備份版本字面改 WORKSPACE_VERSION；Excel 摘要表／指標定義表與兩種 Markdown 的新增列）、`review-v2-a-export.spec`、`manager-summary.spec`、`revamp-r4.spec`（assist 7 列仍是 7、.assist-grid 2 張表）、`workspace-storage.spec`（自組 v4 信封：帶 ad_decision 被拒、不帶可還原且出現提示、下一次備份是 v5）、`action-workspace.spec`（focus trap 走過新 select）、`revamp-r1-layout.spec`（進階 summary 新鍵、pnl-table 預設收合） |
| 驗收重點：手算 golden | 完成 | 見 §3a |
| 驗收重點：`assist-kpi-v1` 輸出不變、禁區 diff 空 | 完成 | `tests/assist-kpi.test.ts` 全過；`export-numeric-stability` 通過；禁區 diff 空 |
| 驗收重點：備份 v1–v5 還原 | 完成 | `backup-schema-v5`、`workspace-backup`、`v2-backup`、`relaunch`、`meeting-backup`、`scenario-sensitivity-backup` 全過；E2E `workspace-storage.spec` 自組 v4 信封（重算 checksum）：帶 ad_decision 被拒、不帶可還原且 ad_decision 為空並出現「這版改了什麼」；`ad-decision.spec` 還原 v5 後標籤保留且沒有提示 |

## 2. 變更檔案

- 新增：`src/application/breakeven-mer.ts`、`src/application/pnl-table.ts`、`src/components/overview/pnl-table.tsx`、`verification/revamp-v3/backup-schema-v5.json`、`tests/breakeven-mer.test.ts`、`tests/pnl-table.test.ts`、`tests/pnl-table-ui.test.tsx`、`tests/backup-schema-v5.test.ts`、`tests/action-ad-decision.test.ts`、`tests/helpers/full-backup.ts`、`tests/e2e/breakeven-mer.spec.ts`、`tests/e2e/ad-decision.spec.ts`、`tests/e2e/pnl-table.spec.ts`、`tests/e2e/breakeven-helpers-v39.ts`、`tests/e2e/ad-decision-helpers-v39.ts`、`tests/e2e/pnl-helpers-v39.ts`。
- 修改：`src/components/overview/assist-table.tsx`、`overview.tsx`、`evidence-drawer.tsx`（`definition` 覆寫）、`action-editor.tsx`、`actions-workbench.tsx`、`whats-new-note.tsx`、`dashboard.tsx`（whats-new 帶 schema）、`src/application/export.ts`、`excel-export.ts`、`manager-summary.ts`、`action-workspace.ts`、`workspace-backup.ts`、`decision-export.ts`、`src/i18n/labels.zh-TW.ts`、`src/app/globals.css`（三個 V3-9a 錨點區段）、`tests/{assist-kpi,export,excel-export,reason-code-labels,export-header,backup-schema-v4,workspace-backup,meeting-backup,scenario-sensitivity-backup,action-drawer-v3,overview-structure,mounted-testids}`、`tests/helpers/export-normalize.ts`、`tests/fixtures/export-numeric-baseline.json`（只新增 2 列）、E2E：`tests/e2e/import.spec.ts`、`revamp-r6.spec.ts`、`review-v2-a-export.spec.ts`、`manager-summary.spec.ts`、`revamp-r4.spec.ts`、`workspace-storage.spec.ts`、`action-workspace.spec.ts`、`revamp-r1-layout.spec.ts`、`docs/ARCHITECTURE.md`、`docs/ENGINEERING.md`、`docs/revamp-v3/00_README.md`、`docs/revamp-v3/06_BATCHES.md`、`docs/revamp-v3/09_DECISIONS_PENDING.md`、`docs/STATUS.md`、`docs/DECISIONS.md`、`verification/revamp-v3/feature-retention.csv`。
- 零改動：`src/domain`、`fixtures`、`docs/METRICS.md`、`.env*`、`vercel.json`（禁區白名單本批為空，實際也沒有新增）。

## 3. 驗收命令與真實結果

| 命令 | 結果 |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | 0 warnings |
| `npm run audit:ui` | hex 0（token 定義區 23）、圓角 4、字級 11、字距 0、rotate 0、JSX 箭頭 3、eyebrow 0、裝飾字元 0、CSS content 0；靜態 testid 243（V3-8：234）；labels 同義詞 13／禁用詞 3（與 V3-8 相同） |
| `npm run contrast-check` | 75／75 通過 |
| `npm test -- --run` | **117 檔／2,311 測試全過（負載平均降到 3–8 時 17 秒跑完；負載 13–44 時 meeting-backup／meeting-page 的「不同資料集」案例會逾時，見 §5）** |
| `npm run lint:design` | exit 0；棘輪數值與 V3-8 相同，ceiling 未調 |
| `npm run build` | pass |
| `npm run test:e2e` | **728 passed（21.5m）、0 failed、0 skipped（V3-8：680；本批新增 48 條：breakeven-mer 4、ad-decision 2、pnl-table 5、workspace-storage 的 v4 還原 1，各 ×4 專案）**；四專案；跑完後 `verification/review-v2-a-*`、`verification/revamp-R6/` 被重寫，以 `git checkout --` 還原 |
| 畫面基準 | `verification/revamp-v3/V3-9a/snapshots/{desktop,laptop,tablet,mobile}/01–09.png` 共 36 張（baseline.spec `--update-snapshots` 4 passed），重跑核對 4 passed、0 張差異（總覽截圖的「進階」仍收合，管理損益表與損益兩平段在 01／02-overview 內） |
| 首屏量測（metrics.spec） | metrics.spec 6 passed（`_meta.batch=V3-9a`）：首屏位置與 V3-8 完全相同（1440 本期一句話頂 192px、KPI 帶底 419px、扣廣告後貢獻值頂 323px、三件事首列底 561px、KPI 前可聚焦 9；390 一句話頂 116px、KPI 帶底 555px、可聚焦 3）；1280 頂欄 48px 一列；各頁到精靈步驟 1 最多 2 次點擊；含稅匯入經資料狀態路徑 6 次（同 V3-8）；First Load JS gzip 509.5 KiB（V3-8 505.5；+4.0 KiB，breakeven-mer 與 pnl-table） |
| Lighthouse（示範資料已載入，1440 與 390） | 1440 與 390 各 6 個快照步驟 accessibility 全部 100（與 V3-8 相同）；首頁 performance 1440＝100、390＝94（V3-8：100／97；行動版 timespan TBT：載入示範資料 1146 ms（V3-8 1118）、切到通路健檢 785（726）、切到商品毛利 85（75）、切到會議紀錄 966（918）；CLS 全部與 V3-8 相同：載入示範資料 1440＝0、390＝0.001，390 切到商品毛利 0.054 既有）。失敗審核只剩會議紀錄頁的 `label-content-name-mismatch` 10 個節點（與 V3-7／V3-8 相同；V3-10 連 E2E 一起改名）。流程報告 `verification/revamp-v3/V3-9a/lighthouse/flow-desktop-1440.html`、`flow-mobile-390.html` |
| 禁區 diff（對 82b70df） | 空（`git diff --stat 82b70df -- src/domain fixtures/golden fixtures/demo fixtures/errors fixtures/refund_only fixtures/zero_ad docs/METRICS.md`） |
| testid 基準 | 刪除數 0；新增 assist-breakeven-mer、assist-breakeven-note、assist-breakeven-help、assist-breakeven-help-trigger、assist-breakeven-current／previous、action-ad-decision、board-card-{n}-ad-decision、action-{n}-ad-decision、pnl-table、pnl-granularity-day、pnl-granularity-week、pnl-show-zero |
| 隱藏字元掃描 | 變更檔 0（既有 BOM 正規式除外） |

### 3a. 本批驗收重點：手算 golden 與邊界

| 指標 | 手算 | 實作結果 |
|---|---|---|
| 損益兩平 MER 本期（golden） | 2,470.00 ÷ 705.00 ＝ 3.503546099290780…，第 13 位 7 進位 → 3.503546099291；L1 3.5 倍、L3 3.50 倍；實際 MER 2,470 ÷ 450 ＝ 5.488888888889；705 > 450（扣廣告後貢獻 255 > 0）→ 高於 | 相同；結論句「本期廣告效率（MER）5.5 倍，高於損益兩平（3.5 倍）。」 |
| 損益兩平 MER 上期（golden） | 2,250.00 ÷ 870.00 ＝ 2.586206896551724… → 2.586206896552；L1 2.6 倍；實際 7.5 → 高於 | 相同 |
| 邊界 | 扣廣告前貢獻 −10 或 0 → null＋NON_POSITIVE_CONTRIBUTION_BEFORE_MARKETING；廣告費 0（自組與 zero_ad）→ 3.503546099291、比較不適用、「廣告費為 0，無法比較。」；淨營收 0、扣廣告前貢獻 −50 → [ZERO_NET_REVENUE, NON_POSITIVE_CONTRIBUTION_BEFORE_MARKETING]；refund_only 淨營收 −100 → NON_POSITIVE_NET_REVENUE；missing_cogs → 資料待補；兩值 L1 相同時結論改用 L3（3.34 vs 3.33） | 全部由 `tests/breakeven-mer.test.ts` 斷言 |
| 管理損益表（golden 本期 8/2，DTC＋MARKETPLACE） | 原價 1400＋400＋800＋500＝3,100；折扣 450；退款 180；淨營收 2,470；成本 1,325；毛利 1,145；平台 120、金流 66、物流 225、其他 29；扣廣告前貢獻 705；廣告 450；扣廣告後貢獻 255。日欄與週欄各自加總＝13 個值；合計欄＝report.current.metrics；佔淨營收 % 255 ÷ 2,470 ＝ 0.103238866… → 0.1032（10.3%）、1,145 ÷ 2,470 ＝ 0.4636、450 ÷ 2,470 ＝ 0.1822、淨營收 1.0000 | 相同（`tests/pnl-table.test.ts` 21 條）；demo 42 日欄與 6 週欄的 13 列加總＝`fixtures/demo/computed_summary.json` 本期值（淨營收 7,850,657.90、扣廣告後貢獻 1,269,792.73） |
| 管理損益表邊界 | 缺日整欄 null（無資料，不是 0），其餘欄不變、41 欄＋缺日值＝合計；missing_ad_day → 廣告與扣廣告後貢獻 null＋MISSING_AD_DAY、扣廣告前貢獻 705 仍在；refund_only → 佔淨營收 % 全 null（不適用）、負數 −100／−40／−60 用 U+2212、7 列零值列 hidden 掛載；zero_ad → 只有廣告投放費是零值列 | 相同 |
| 備份 v5 | key_paths ＝ v4 ＋ `payload.action_workspace.items[].ad_decision`；limits、top_level_keys、ui_prefs 相同；v1–v4 帶 ad_decision 一律拒絕；既有 golden 數字（試算 284.00、會議 570.00 → 255.00、−315.00、規則 270.00／−15.00）不變 | `tests/backup-schema-v5.test.ts`、`action-ad-decision.test.ts` |
| 決策匯出 | 標記一個待辦為「加碼」前後：CSV 列數相同、既有 30 欄逐格相同、第 31 欄 `廣告決策 (ad_decision)` 只在該待辦的列有值；JSON 只多 `ad_decision`；Markdown 只多一行 | `tests/action-ad-decision.test.ts` |
| 效能 | demo 的 `buildPnlTable` 4–10 ms；`PnlTable` SSR 約 16 ms、80 KB；收合時掛載 559 個 number-link（42 天 × 13 列＋13 合計） | 總覽 Lighthouse 見 §3；總覽（經營總覽 snapshot）accessibility 100；行動版 performance 94（V3-8 97）、載入示範資料的 TBT 1146 ms（V3-8 1118；差 28 ms，在量測誤差內；收合的管理損益表 559 個按鈕是本批最可能的增量） |

## 4. 瀏覽器驗收方式與截圖

- 四尺寸截圖：`verification/revamp-v3/V3-9a/snapshots/{desktop(1440×1000),laptop(1280×900),tablet(768×1024),mobile(390×844)}/01-overview-top、02-overview-full、03-evidence-drawer、04-actions-board、05-diagnosis、06-products、07-scenarios、08-meeting、09-data.png`（示範資料 production、`APP_MODE=PUBLIC_DEMO`；02-overview-full 可見「其他常用指標」下的損益兩平 MER 段與收合的「進階：期間合計與日均、管理損益表」）。
- 首屏量測：`verification/revamp-v3/V3-9a/metrics.json`。
- Lighthouse 流程報告：`verification/revamp-v3/V3-9a/lighthouse/flow-desktop-1440.html`、`flow-mobile-390.html`。
- 管理損益表展開後的日／週檢視、零值列、單日與合計格的抽屜、橫向捲動與第一欄 sticky，損益兩平 MER 的抽屜與 ? 說明，廣告決策標籤的抽屜 select、看板與清單徽章、備份 v5 與 v4 還原，都由 E2E 逐項斷言（`pnl-table.spec`（四尺寸）、`breakeven-mer.spec`（四尺寸）、`ad-decision.spec`（四尺寸）、`workspace-storage.spec`）；代理自查截圖留在 scratchpad，未提交。
- 瀏覽器走查：代理 A／B／C 各自以 dev server 在 1440、1280、768、390 檢查橫向溢出 0；代理 A 另跑 axe（其他常用指標區，說明收合與展開）0 項違規；代理 C 實測 demo 42 日欄收合時掛載 559 個 number-link、SSR 約 16 ms。

## 5. 已知限制與風險

- **佔淨營收 % 欄是一般文字，開不了「計算與來源」**：抽屜沒有給呈現層比率用的 unitOverride；分子（同列合計）與分母（淨營收合計）都在同一張表且都能點開，算式寫在收合的技術細節。PRD F9 寫「每格都能開抽屜」；是否要補 `unitOverride: "percent"` 待拍板（D-V3-31）。
- **單日格的抽屜沒有四層階梯、副標寫「7/20–7/20」**：`ladderMetrics` 只認本期、上期與 `snapshot.weeks`；`formatPeriodL1` 對單日也輸出範圍。V3-9b 一併處理（抽屜 period 篩選是 F10 的範圍）。
- **管理損益表收合時也掛載約 559 個按鈕**（demo 42 天；M1 的解讀）：SSR 約 16 ms、80 KB，四尺寸實測沒有卡頓；本期超過 92 天時只提供每週。若總覽 Lighthouse／TBT 退步，可改成 details 打開前只渲染表頭與列名（要先確認 M1 的解讀）。
- **廣告決策標籤只在決策匯出（MD／CSV／JSON）與備份**：Excel 待辦工作表、會議紀錄的置頂待辦快照（meeting-v1 嚴格 schema）、主管摘要、PDF／PPT 都沒有；V3-9b F14 匯出變體時決定。徽章一律 C8 中性色（D-V3-7：標籤是使用者的選擇，不是判斷）；「暫停」是否用警示色待拍板（D-V3-32）。
- **損益兩平 MER 的抽屜不列組成項**：抽屜的組成項目表用 `evidence.name` 的單位格式化每一格（倍數指標會把金額顯示成「2,470.00 倍」），所以改把兩個輸入的 L3 金額寫進公式行；`components: []` 讓 MER 的比率表不出現（`tests/breakeven-mer.test.ts` 斷言，防回歸）。Excel 摘要表的倍數放 L3 文字格（整欄是金額格式）；12 位原值在分析 CSV。
- **損益兩平那張單列表與上方兩欄表的欄寬沒有嚴格對齊**（1440）；要對齊需兩張表共用固定欄寬，上方表格的 CSS 不在本批範圍。
- **既有的「進階：期間合計與日均」鍵保留但不再渲染**；summary 改新鍵（PRD §7.1 區塊 10 本就寫「期間合計與日均、每日／每週管理損益表」）。
- **`next dev`（StrictMode）下待辦編輯抽屜不會停留**（代理 B 觀察，推測是 `ActionDrawer` 的 effect cleanup 關閉 dialog；production 與 E2E 不受影響；`action-drawer.tsx` 本批沒改）：V3-10 核對。
- **單元測試在高負載時逾時**：使用者的其他程式讓負載平均達 13–44 時，`tests/meeting-backup.test.ts`、`meeting-page.test.tsx` 的「不同資料集」案例會超過 5 秒；單獨或放寬逾時跑全部通過，開工錨點 530b9af 上同樣慢（見 §3 的最終結果）。
- 文案：三組新鍵（46 個）沒有經過 H3 審稿（H3 已略過）。
- H1、H4 未執行；未推送、未部署。
- **示範資料的決策匯出很大**（E2E 代理回報，既有行為）：載入示範資料並加入一個待辦後，決策 CSV 約 84 MB（569 列）、JSON 約 33 MB、Markdown 約 18 MB（備份只有約 267 KB）；推測每個 fact 列都帶完整來源清單。不在本批範圍，列入 V3-10 上線檢查。
- **週欄標題曾寫死在 application 層**（`workspace.ts` 的 WeeklyRow.label「前期／本期第 n 週」，V3-9a 之前沒有畫面顯示它）：收尾改從 `labels.overview.pnlV3.weekLabel` 取，上期依名詞表寫「上期」。

## 6. 下一批建議、人工關卡與待拍板

- 下一批：V3-9b（F8 三線趨勢、F10 圖表下鑽、F14 匯出變體（含管理損益表的括號負數 D-V3-8、廣告決策標籤進 Excel／PPT）、F22 投影模式）；F15 台灣化示範資料需使用者提供商品與檔期設定、F16 需去識別化的平台匯出檔，沒有就延後到 v3.1。
- 被擋住的人工關卡：H4 擋 v3.0.0 正式上線；H1 只擋 V3-10 的前後對照。H2、H3 已略過。
- 待拍板（`09_DECISIONS_PENDING.md`）：D-V3-26、27、29、30 仍待；新增 D-V3-31（佔淨營收 % 欄是否也要能開抽屜）、D-V3-32（廣告決策徽章色調與匯出範圍）。
