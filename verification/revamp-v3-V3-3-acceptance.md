# Revamp v3 V3-3 驗收：殼層與導覽（2026-10-06）

依 `docs/revamp-v3/06_BATCHES.md` V3-3 與 PRD §6.1 全站結構、§6.3 #1–#23、§6.4 M1–M6、§6.5、§7.0 全站殼層、§9.4（C11／C14／C15／C22）執行。使用者 2026-10-06 指示「H2 後補，先開 V3-3」，設計稿（`verification/revamp-v3/mockups/`）為實作依據。拍板：D-V3-10＝A（快捷單擊即套用）、D-V3-14＝A（看結果／找原因／做決定／管資料）、D-V3-4（待辦）、D-V3-6（台）。`src/domain`、`fixtures`、`docs/METRICS.md`、`.env*`、`vercel.json` 零改動；無新依賴；各頁內容元件未動。

## 1. 完成項目（對照 06_BATCHES V3-3）

| 項目 | 狀態 | 說明 |
|---|---|---|
| 頂欄單列（48px，1280 不折行） | 完成 | 左：brand-mark 24px＋「EC ProfitLens」16px/600；右：資料狀態按鈕 `data-status`（8px 狀態點依 ready／partial／error／empty 換色；文字「示範資料 · 資料到 8/24」等；v2 的狀態文字含資料集名保留為 sr-only `workspace-status` role=status／aria-live）、AI 狀態 12px 文字按鈕（768–1279 只剩 icon，`ai-availability` 與 popover 保留）、指標定義 icon 按鈕（三個入口保留）、儲存（chevron＋「未保存」）、匯出（chevron）。頂欄實測 48px（四尺寸） |
| 資料狀態 popover | 完成 | `data-status-popover`（320px，C14，保持掛載）：示範資料（虛構）＋側欄舊警語、資料集、資料到（N 天）、資料問題 N 項＋「前往資料來源」`data-status-go-data`、公開示範站說明（合併 v2 模式徽章）、「匯入新資料」`data-status-import`；Esc 關閉回焦、外部點擊關閉；任一頁到匯入精靈 **2 次點擊** |
| 儲存選單三段與危險區 | 完成 | `workspace-storage` 分本機保存／備份檔／危險區；v2 頂欄「清空」搬到危險區「清空目前資料」，同一套取代確認流程；所有 testid 與控制保留 |
| 匯出選單分組 | 完成 | 改名「匯出」，依 §6.5 分目前檢視／一頁摘要／決策工作稿／匯入範本（3×3 表）；17 項（含條件項）、handler、testid 不變 |
| 側欄分組與徽章 | 完成 | 220px `--bg-sidebar`，四組 `nav-group-*`；健檢不利計數徽章、資料來源問題數、會議「草稿」lozenge（以 CSS attr 繪製、aria-describedby 說明，按鈕可及名稱＝頁名，既有 E2E 定位不變）；active 600＋2px 強調線；開發者分組只在 #validation |
| 頁首 56px | 完成 | h1 20px/600＋一行描述，eyebrow「營運決策工作台」移除；「匯入資料」只留在資料來源頁首（`page-import`） |
| 頁尾 | 完成 | 「扣廣告後貢獻不含固定費與稅。［指標定義］ · 新台幣 · 台北時間」＋正式站分析揭露 |
| 期間列單列（48px sticky） | 完成 | `period-bar`：通路 select、分段快捷 `period-presets`（aria-pressed；不可用 aria-disabled＋title＋sr-only 理由）、`period-summary`（「本期 7/13–8/23 對比 上期 6/1–7/12（各 42 天）」，天數不同另有句型；通路、比較方式、資料到放 title／sr-only，#19 為合併）、「自訂期間」`period-custom` popover `period-custom-panel`（比較方式、四個日期欄位 id 不變、套用）；**快捷單擊即套用**（D-V3-10） |
| 需要處理橫幅（C22） | 完成 | `needs-attention` 固定位置：篩選錯誤（`banner-filter-error`，role=alert）、部分資料待補（`banner-partial`，連結「查看 n 項資料問題」）、去年同期不可用理由（保留 `preset-reason-visible-yoy`）；無內容不佔高度 |
| 手機（≤767） | 完成 | 側欄以 CSS 隱藏；`mobile-tabbar`（總覽、健檢、待辦、會議、更多；第二個 nav、aria-label 不同）；「更多」`mobile-more`（商品毛利、假設試算、資料來源、開發者驗證）；`topbar-more` 展開同一份已掛載的 AI／指標定義／儲存／匯出（CSS 重新定位，M6）；期間列收成 `period-toggle`「近 4 週 · 7/27–8/23」開底部面板（同一份面板 DOM、「完成」關閉、Esc 回焦）；h1 在手機為 sr-only |
| `.nav-dot`／`.green-dot` JSX 與 CSS | 完成 | 刪除；另刪除麵包屑、模式徽章、側欄工作區標籤與警語、側欄頁尾、`.tiny-tag`、兩個 `::after ▾` |
| `tests/mounted-testids.test.tsx`（M1／M6） | 完成 | 18 項：M1 8 項（各頁狀態都掛著 §6.3 #1–#23 的殼層 testid；空工作區 SSR 也掛著彈出層與兩個 nav；彈出層預設關著但在 DOM；關著的彈出層內容完整；需要處理橫幅只在需要時出現且是單一插槽；page-import 只在資料來源頁；開發者分組只在 #validation；匯入精靈與資料來源頁同時掛著）、M6 8 項（每個 testid／id 在每個狀態只出現一次；aria-controls 與 label for 指到唯一元素；期間列 select 與 4 個日期各一份、桌機 popover 與手機底部面板共用 #period-bar-panel；儲存選單 checkbox 各一；兩個 nav aria-label 不同；桌機頂欄群組與手機「更多」面板沒有重複控制）、防漂移 2 項（每個殼層元件在 Dashboard 只實例化一次；掛載條件與 shellPage() 相同） |
| E2E 遷移 | 完成 | 共用 helper 先改走 V3-3 殼層（`isMobile`、`navigateTo`／`openMobileMore`、`openValidation`、`openTopbarMore`／`closeTopbarMore`、`openStorage`／`openDownloads`／`openBasis`／`openAiStatus`、`clearButton`、`periodSummary`／`presetButton`／`choosePreset`／`openCustomPeriod`／`applyCustomPeriod`、`openPeriodSheet`、`dismissSavePrompt`／`acceptSavePrompt`、`openWizard`），再由六個代理對共用伺服器逐 spec 遷移（桌機＋手機各跑一次）；21 個 spec＋2 個 helper 共 851 行新增／290 行刪除；代理回報的兩個產品問題本批修正：手機一次 Esc 同時關閉內層浮層與「更多」（焦點掉到 body）→ 捕獲階段先判斷內層；手機「更多」展開時底部頁面面板與頂欄工具列被首次保存提示蓋住 → 展開中的 `.topbar`／`.mobile-tabbar` 以 `--z-overlay` 疊在提示之上，E2E 回應提示前先收「更多」（revamp-r6 e 的堆疊檢查改為硬斷言） |

## 2. 變更檔案

- 新增：`src/components/shell/{shell-frame,data-status,export-menu,page-chrome,shell-icon,period-bar}.tsx`、`tests/{shell,period-bar}.test.tsx`、`tests/mounted-testids.test.tsx`、`verification/revamp-v3/V3-3/**`、本檔。
- 修改：`src/components/dashboard.tsx`（殼層區塊換成子元件、`choosePreset` 單擊套用）、`src/components/workspace-storage.tsx`（三段）、`src/i18n/labels.zh-TW.ts`（`shell` 分組的六個新物件：topbarV3、sidebarV3、dataStatus、mobileNav、periodBarV3、banner；頁尾沿用既有 `basis.footer`／`ui.dashboard.sidebarFooter`，收尾時刪除空的 `footerV3` 錨點）、`src/app/globals.css`（A1／A2 區塊；刪除 v2 殼層無用規則）、`tests/{labels-structure,testid-baseline}.test.ts`、`tests/fixtures/design-lint-ceiling.json`（箭頭 4、裝飾字元 0、CSS content 0）、E2E helpers 與 spec：`tests/e2e/{replacement-helpers,import-wizard-helpers}.ts`、`tests/e2e/{action-workspace,ai,import-guidance,import-wizard,import,m6-acceptance,manager-presentation,manager-summary,period-comparison,product-comparison,revamp-r1-layout,revamp-r2-copy,revamp-r4,revamp-r5,revamp-r6,review-v2-a-export,review-v2-a,scenario-sensitivity,scenarios,workspace-storage,workspace}.spec.ts`、`verification/revamp-v3-capture/{shared.ts,baseline.spec.ts,metrics.spec.ts}`（量測改走 V3-3 匯入入口與 L1 斷言、`_meta.batch` 讀 `CAPTURE_BATCH`）、`scripts/lighthouse-pages.mjs`（切頁以 aria-label 比對、手機先點「更多」）、`docs/{STATUS,DECISIONS}.md`、`docs/revamp-v3/06_BATCHES.md`。
- 零改動：各頁內容元件（overview、diagnosis、products、scenarios、actions、meeting、data、import wizard）、`src/domain`、`fixtures`、`docs/METRICS.md`。

## 3. 驗收命令與真實結果

| 命令 | 結果 |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | 0 warnings |
| `npm test -- --run` | **90 檔／1,879 測試全過**（V3-2c：87 檔／1,829；新增 shell、period-bar、mounted-testids） |
| `npm run lint:design` | exit 0；hex 0、圓角 4、字級 13、字距 0；JSX 箭頭 6 → **4**、JSX 裝飾字元 1 → **0**、CSS 裝飾 content 2 → **0**（`design-lint-ceiling.json` 同步調低，`tests/design-lint.test.ts` 20 項通過）；labels 同義詞 13／禁用詞 3 不變；對比 75／75 |
| `npm run build` | pass |
| `npm run test:e2e` | 第一輪 **594／596**（18.4 分，四尺寸；本批新增 20 項殼層斷言）：僅 tablet 2 項失敗——`review-v2-a` A3 與 `workspace-storage` PL01 在開著儲存選單時點下方內容，768–900 寬的 `.menu-panel` 橫跨版面（v2 既有 CSS）蓋住匯入精靈與驗證頁按鈕；spec 改為先 `closeStorage` 後，兩支 spec 四視窗 **52／52**；最終全套重跑 **596／596 全過（17.3 分）** |
| 畫面基準 | `verification/revamp-v3/V3-3/snapshots/{desktop,laptop,tablet,mobile}/01–09` 共 36 張（`CAPTURE_BATCH=V3-3 … --update-snapshots`），重跑 **4/4 通過、0 差異**；本批是版面改版，故不對 V3-2c 基準比對（差異即殼層本身） |
| Lighthouse（示範資料已載入，1440 與 390） | 五頁 Accessibility **100／100**（desktop／mobile，`verification/revamp-v3/V3-3/lighthouse/flow-*.html`）；空狀態 Performance desktop 100／mobile 98（V3-2c：100／97）；不計分的 `label-content-name-mismatch` 在健檢與會議頁自 V3-0 基準即存在（表格與摘要 `number-link` 的 aria-label 未含可見數字），非本批引入，留 V3-5（健檢表）／V3-7（會議）處理 |
| 禁區 diff（對 82b70df） | 空 |
| testid 基準 | 刪除數 0；新增 25 個（data-status、data-status-popover、data-status-import、data-status-go-data、topbar-more、nav-group-{results,causes,decisions,data,developer}、nav-mark-{diagnosis,data,meeting}、mobile-tabbar、mobile-tabbar-more、mobile-more、period-bar、period-presets、period-summary、period-custom、period-custom-panel、period-toggle、needs-attention、banner-filter-error、banner-partial） |

### 3a. 殼層驗收（PRD §7.0、§2.3 B；示範資料、拒絕保存）

| 指標 | 目標 | 實測 |
|---|---|---|
| 1280×900 頂欄 | 1 列 48px | 48px、單列（四尺寸皆 48px） |
| 1440×1000 頂欄＋頁首＋期間列 | ≤ 152px | 頂欄＋頁首 104px；期間列 48px → 152px |
| 390×844 首個 KPI 數值頂端 | ≤ 360px | **224px**（V3-0 基準 1066px） |
| 1440 首個 KPI 數值頂端 | （V3-4 目標 ≤ 420 卡底） | 278px（V3-0 基準 398px） |
| 可見「示範資料」字樣 | ≤ 1 | 1（資料狀態按鈕） |
| 任一頁到匯入精靈 | ≤ 2 次點擊 | 2（資料狀態 → 匯入新資料） |
| 水平捲動 | 無 | 四尺寸 `scrollWidth`＝視窗寬 |
| 內容前可聚焦元素（1440，PRD 口徑） | ≤ 10 | **7**（Tab 停駐 7；V3-0 基準 13／25；`metrics.json` desktop.focusableBeforeFirstKpi） |
| 首張 KPI 卡頂端／KPI 卡底（1440；`metrics.json`） | V3-4 目標卡底 ≤ 420 | 229.6px／395.8px（V3-0 基準 397.8／563.6）；390 首張 KPI 卡頂端 180.2px（V3-0 基準 1066.2） |
| 含稅匯入最少點擊數（V3-0 口徑，空狀態起） | — | 6（V3-0 基準 5：頁首「匯入資料」1 次改為資料狀態 → 匯入新資料 2 次；空狀態匯入入口屬 V3-8） |
| 選單鍵盤 | Esc 關閉回焦 | data-status → 回 data-status；手機更多 → 回 topbar-more；自訂期間 → 回 period-custom（E2E） |

## 4. 瀏覽器驗收

- 四尺寸截圖 `verification/revamp-v3/V3-3/snapshots/`（四尺寸 × 9 個頁面狀態共 36 張：總覽首屏與全頁、抽屜、待辦看板、健檢、商品、試算、會議、資料來源；Playwright `toHaveScreenshot` 基準，重跑 0 差異）。
- 肉眼核對（1440、1280、768、390；資料狀態 popover、手機「更多」與期間底部面板）：與設計稿 `mockups/overview.html` 一致——頂欄單列、分組側欄與徽章、56px 頁首、單列期間列與分段快捷、手機底部分頁列與期間按鈕。

## 5. 已知限制與偏離

- 768–1279 寬的期間列是兩列（通路＋快捷；摘要＋自訂期間），側欄佔掉寬度後五個快捷放不進一列；PRD 只要求 1280 單列。
- 手機上 AI 狀態也收進「更多」（PRD 寫 390 只收儲存／匯出／指標定義）：品牌＋資料狀態＋更多已填滿 390px；`ai-availability` 保持掛載。
- 資料狀態 popover 的天數從 coverage_start 算到 data_as_of（示範資料 85 天，與 §7.0 範例一致）。
- 匯出選單只改名與分組；§6.5 的各項新名稱與每項 12px 說明未套用（labels 在 A1 錨點之外，且 E2E 以名稱定位）；V3-7 匯出批次處理。
- 空狀態頁沒有新增匯入按鈕（§6.3 #23「空狀態也有」），空狀態屬 V3-8；目前以資料狀態 → 匯入新資料 兩次點擊到達。
- 套用中（loading）期間列保持掛載以免焦點掉落，載入另一份資料集時會短暫顯示舊資料的期間列。
- 部分資料待補橫幅沿用既有 `partialNote` 句子，未逐類計數「3 天的通路費用空白」。
- 期間底部面板未做焦點鎖定（開啟時聚焦「完成」、Esc／遮罩關閉回焦）。
- 停用快捷文字 `--text-disabled` 對比低於 4.5（aria-disabled 元素不受 WCAG 對比要求，axe 略過，同設計稿）。
- v2 的 `.filter-bar`／`.preset-row`／`.scope-note`／`.preset-reason`／`.alert.partial` CSS 已無元件使用，留 V3-4 清理。
- `verification/revamp-v3/e2e-text-assertions.csv` 新增 `status` 欄以逐列勾銷（V3-3 的 388 列：159 列已改寫、229 列定位器未變且 E2E 通過；V3-2 的 7 列同法補勾）；`scripts/e2e-locator-inventory.mjs` 重跑會重產清單而不帶 status 欄，之後各批只手動改 status。
- H2 設計稿審查後補；審查意見以樣式與文案修正落地。

## 6. 下一批、人工關卡、需要拍板

- **下一批 V3-4 經營總覽**（本期一句話、KPI 帶、三件事警示列、瀑布圖、其他常用指標表；依賴 D-V3-11、D-V3-13，皆已依建議值）。
- **H2 後補**：請依 `verification/revamp-v3/mockups/README.md` 審查；V3-3 已落地的殼層可一併看實際畫面。
- **H3 補審**仍待人工。
- 需要拍板：無新增。
