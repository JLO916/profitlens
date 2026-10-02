# Revamp v2 — R1 總覽重排與頁首減負 驗收紀錄

- 日期：2026-10-02（Asia/Taipei）
- 分支：`revamp/v2`，基於 R0 `861ec19`
- 規格：`docs/revamp/06_BATCHES.md` R1-1～R1-9、`02_IA_LAYOUT.md §1–§3、§11–§12`、`05_FEATURES.md §2、§7`
- 財務核心：`src/domain/*`、`fixtures/*`、`docs/METRICS.md`、`package*.json` 零改動（`git diff --stat` 為空）；`metric_version` 仍為 `contribution-v1`。

## 1. 任務對照
| 任務 | 狀態 | 做法與證據 |
|---|---|---|
| R1-1 AI 橫幅 → 頂欄小標籤＋popover | 完成 | `dashboard.tsx` 頂欄 `.ai-availability`（保留 `data-testid="ai-availability"`、`role="status"`、`aria-live="polite"`）；標籤為 `button[aria-expanded][aria-controls]`，說明文字在 `#ai-availability-detail`（`hidden` 直到點開），Esc 關閉並回到按鈕 |
| R1-2 WorkspaceStorage → 頂欄「儲存 ▾」 | 完成（形式見決策） | `workspace-storage.tsx` 外層仍是 `<details data-testid="workspace-storage">`，summary 改為「儲存 ＋ 狀態標籤」，內容原封搬入 `.menu-panel`；面板在頂欄原位展開（非浮動，見 `docs/DECISIONS.md`）；未保存時標籤 `tag.unsaved` 以 CSS 加「●」 |
| R1-3 期間列 sticky＋快捷鈕 | 完成（去年同期 R4） | `.filter-bar { position: sticky; top: 0 }`，640px 以下改靜態；新增 `src/application/period-presets.ts`（近 7 天／近 4 週／近 12 週／本月 vs 上月，基準 `min(data_as_of, coverage_end)`，超出涵蓋或未滿月停用並附原因）；快捷只呼叫 `setDates`／`setComparisonMode` 並把焦點移到「套用期間」，不套用、不寫入儲存 |
| R1-4 總覽順序／通路寬表搬健檢頁 | 完成 | `overview.tsx`：KPI（`aria-label="本期關鍵數字"`）→ `TopThree`（`data-testid="top-three"`，目前檢視）→ 趨勢 → 橋接＋通路比較 → `<details data-testid="period-comparison">`（預設收合，狀態由 Dashboard 保存）；`ReviewWorkbench`（含會議固定來源的 `manager-summary`）整組移到頁尾 `<details data-testid="overview-meeting">`；`workspace-panels.tsx` 通路診斷頁頂新增 `ChannelWideTable`（`aria-label="通路寬表"`） |
| R1-5 下載鈕集中到「下載 ▾」 | 完成（商品頁例外） | 頂欄 `<details data-testid="download-menu">`：目前檢視（分析 CSV、通路寬表 CSV、資料集設定 JSON、問題清單 CSV）＋決策工作稿 Markdown／CSV／JSON；總覽／診斷／資料頁的 `.export-actions` 區塊移除；試算與行動頁「輸出」區保留；商品頁兩個 CSV 鈕依頁內篩選狀態保留在頁內 |
| R1-6 切頁捲動歸零並聚焦 main | 完成 | `useEffect([panel])`：`window.scrollTo({top:0})`＋`main#main-content.focus({preventScroll:true})`（首次 render 不觸發） |
| R1-7 對貢獻影響（紅不利／綠有利） | 完成 | `contributionImpact()`（`src/application/manager-summary.ts`，呈現層加法）；三件事與健檢卡顯示 `對貢獻影響`（`ImpactAmount`，負＝`.negative` 紅、正＝`.positive` 綠），抽屜顯示取負公式與原始來源；原「排序用已觀察金額差」移入健檢卡「稽核資訊」收合區；定義寫入 `docs/DECISIONS.md` |
| R1-8 select 高度／徽章／副標與 title | 完成 | `.action-card select[multiple]` 才有 150px 高；側欄徽章 `labels.status.demo`「示範資料」／`labels.status.local`「本機匯入」；頁首 eyebrow 統一「營運決策工作台」；`<title>` 改 `labels.brand.title`「ProfitLens｜電商獲利診斷與決策工作台」 |
| R1-9 示範資料鈕只在空狀態與資料頁 | 完成 | 頁首的「載入示範資料」只在 `panel === "data"` 且已有資料時顯示；空狀態 CTA 不變 |

新增 E2E：`tests/e2e/revamp-r1-layout.spec.ts`（6 個案例 × 4 尺寸）：KPI 首屏（desktop／laptop 斷言 bounding box）、三件事一次 PageDown 內、區塊 DOM 順序、兩個收合區預設關閉、對貢獻影響紅綠與抽屜、切頁 `scrollY === 0` 與焦點、AI 標籤 popover 與 Esc、儲存／下載選單與 testid、`<title>`、徽章文字、期間快捷填值不套用與 sticky。
新增單元測試：`tests/period-presets.test.ts`（示範／golden manifest 手算、閏年、跨年、不足天數、壞輸入）、`tests/contribution-impact.test.ts`（golden 手算 −315／−250／−130／−65／−150／−15）。

## 2. 既有測試的調整（不刪斷言）
`tests/e2e/replacement-helpers.ts` 新增 `openDetails`／`closeDetails`／`openMeeting`／`openPeriodComparison`／`openDownloads`／`closeDownloads`。各 spec 只在互動前先展開對應區塊或選單：
- `action-workspace.spec.ts`：載入後與回總覽後 `openMeeting`。
- `manager-summary.spec.ts`：載入後 `openMeeting`；列印後改為開「下載 ▾」再斷言「下載目前分析 CSV」可見。
- `review-v2-a.spec.ts`：golden 載入後先到資料工作區再按「載入示範資料」（R1-9）；填會議欄位前 `openMeeting`。
- `review-v2-a-export.spec.ts`：兩處回總覽後 `openMeeting`。
- `period-comparison.spec.ts`：匯入後 `openPeriodComparison`；分析 CSV 改從「下載 ▾」下載後關閉選單。
- `import.spec.ts`：四處分析 CSV／設定 JSON 改從「下載 ▾」下載後關閉選單。
- `workspace-storage.spec.ts`：切頁後再開「儲存」才按刪除本機副本。
- `workspace.spec.ts`：先展開健檢卡「稽核資訊」再讀排序金額。
- `tests/app-smoke.test.tsx`：`<title>` 斷言改引用 `labels.brand.title`。

## 3. 驗收命令與真實結果（最終執行，含所有審查修正）
| 命令 | 結果 | 摘要 |
|---|---|---|
| `npm ci` | 未重跑 | `package.json`／`package-lock.json` 本批零改動，沿用 R0 乾淨安裝（442 packages、0 vulnerabilities） |
| `npm run typecheck` | 通過 | exit 0 |
| `npm run lint` | 通過 | `eslint . --max-warnings=0` exit 0 |
| `npm test -- --run` | 通過 | **42 files／828 tests**（R0 基線 819 ＋ `period-presets` 6 ＋ `contribution-impact` 3） |
| `npm run build` | 通過 | ✓ Compiled successfully；routes 不變；無 warning |
| `npm run test:e2e` | 通過 | **428 passed／0 failed／0 flaky／0 skipped**（8.1m）；desktop／laptop／tablet／mobile 各 107（R0 基線 404 ＝ 101×4，新增 `revamp-r1-layout.spec.ts` 6×4） |

過程紀錄：第一次全套 428 項有 14 項失敗（下載選單按鈕名稱含說明文字、收合區在重新計算時關閉、排序金額移入收合區後 `getByRole` 找不到、新 spec 的 PageDown 斷言），第二次 9 項（儲存浮動面板在 1280／768 遮住頁面並造成橫向溢出），各自修正後第三次 428 全過；對抗式審查修正後第四次（最終）428 全過、unit 828 全過。E2E 執行重寫的 A 批證據檔 `verification/review-v2-a-*` 於讀取統計後以 `git checkout` 還原。

## 4. 瀏覽器驗收與截圖
- 改版後截圖：`npx playwright test --config verification/revamp-R1-capture.config.ts` → `verification/revamp-R1/after/{1-overview…5-data}-{desktop,laptop,tablet,mobile}-{viewport.png,full.jpg}`，與 `verification/revamp-R0/before/` 同流程、同命名，可並列比對。
- 開發中以 dev server 實測（1440／1280／768／390）量測：頂欄 72／113／176／144 px（收合時）；期間列 88／88／162／280 px（390 為靜態）；KPI 區塊底緣 1440：540 px、1280：577 px（皆在首屏內）；四尺寸 `documentElement.scrollWidth <= innerWidth`；切頁後 `scrollY === 0`、`activeElement === main#main-content`；會議區展開後切換通路仍保持展開；儲存面板展開時內容往下推、無橫向溢出。

## 4b. 對抗式審查（4 視角 → 每項 3 位反駁者，多數保留）
19 項候選，13 項確認。處理如下：
| 確認項 | 處理 |
|---|---|
| Esc 關閉頂欄選單後焦點掉到 body | 已修：焦點在選單內時 Esc 回到該 summary；E2E 新增斷言 |
| 停用的快捷鈕只用 `title` 說明原因（鍵盤／讀屏讀不到） | 已修：`aria-disabled`＋`aria-describedby` 指向 sr-only 原因；`title` 保留給滑鼠；E2E 斷言 accessible description |
| 期間合計的 `<h2>` 放在 `<summary>` 內 | 已修：summary 改純文字，`<h2 id="daily-average-title">` 以 sr-only 放回 details 內容，`aria-labelledby` 不變 |
| E2E 重寫 A 批歷史證據檔 | 依 R0 做法：最終跑完讀取統計後 `git checkout -- verification/review-v2-a-*`，不混入本批；`.claude/launch.json` 不納入 |
| 新中文字串直接寫在 JSX | 已修：新增 `labels.downloads`、`labels.notes`、`sections.relatedScopes／channelTableAria／channelTableCaption／meetingNotCreated`、`status.unsaved／savedVersion／noWorkspace`，三個元件改引用 |
| 資料工作區仍有「下載問題清單 CSV」頁內鈕（與下載選單重複） | 已修：移除頁內鈕，只留「下載 ▾」 |
| 商品頁仍有兩個 CSV 鈕 | 保留（依頁內篩選狀態），記為 R1-5 部分完成，R5 商品頁改版時處理 |
| 期間列高度 88px（規格 ≤ 64px）、768 為 162px | 未改：四個可見快捷鈕與日期表單在 1440 無法單列；改成下拉會降低可見性。記為限制，待拍板（見回報） |
| 未保存標籤字樣「有未保存變更」＋CSS 圓點 | 已修：`labels.status.unsaved = "● 未保存"`，另兩態也改引用 labels |
| 零金額的「對貢獻影響」顯示綠色 | 已修：以分為單位判斷，零與未知為中性色（三件事、健檢卡、通路寬表共用 `amountTone`） |
被反駁（不處理）：三件事（目前檢視）與會議稿摘要（固定來源）同一項目正負號不同——兩者口徑不同且各自標示；總覽同一規則標題在展開會議稿後出現兩個 heading——會議稿預設收合，且既有測試皆以 testid 範圍定位；頂欄固定 64px 會溢出——已改為 `height: auto`。

## 5. 已知限制與風險
- 期間列在 1280／1440 為兩列（約 88px），未達規格的 ≤ 64px；768 為三列（162px）、390 改為靜態不黏頂（規格的「範圍：… ▾」收合列延後）。
- 「儲存」採展開式面板（見 `docs/DECISIONS.md`），非規格圖示的浮動選單；「下載 ▾」與 AI 說明為浮動。
- 會議固定來源的主管摘要（含兩個關鍵差額、通路寬表、主管摘要 Markdown／列印）仍在總覽頁尾的收合區內，R6 搬到會議紀錄分頁；因此總覽 DOM 中仍存在一份通路寬表（收合）。
- 商品頁的「下載商品比較 CSV／下載商品明細 CSV」依頁內篩選狀態，保留在頁內。
- 快捷鈕停用時的原因只在 `title`（鍵盤使用者讀不到）；R2 文案批次補成可見說明。
- 頂欄在 1280 以下會折成兩列以上；AI 標籤文字沿用舊文案（R2 改）。

## 6. 下一批建議與待拍板
見批次回報。
