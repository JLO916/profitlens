# Revamp v3 V3-6 驗收：假設試算與待辦（2026-10-07）

依 `docs/revamp-v3/06_BATCHES.md` V3-6 與 PRD §7.4（假設試算）、§7.5（待辦）、§6.3 #37–#42、§6.4 M1–M6、§9.4（C6 抽屜、C8 狀態、C10 空狀態、C11 表單與分段鈕、C12 按鈕、C13 看板卡、C14 popover、C15 工具列）執行。拍板：D-V3-12＝B（聲明勾一次就記住、寫入備份）、D-V3-3＝A（抽屜「計算與來源」、按鈕「看明細」）、D-V3-7＝A（只有不利上色）、D-V3-21＝A（不做平台費率提示）。使用者 2026-10-07 指示略過 H2 設計稿審查與 H3 文案補審，文案以 `copy-rewrite.csv` 現稿為準。`src/domain`、`fixtures`、`docs/METRICS.md` 零改動。

工作方式：開工錨點 commit `91c859a`（ActionEditor 搬出、ActionDrawer 介面 stub、頁首 `#page-title-addon` 插槽、試算 `active` prop、labels／CSS／掛載測試錨點）→ 三個 worktree 代理並行（A 假設試算頁、B 待辦看板、C 待辦編輯抽屜與編輯器）→ 合併（無衝突）→ 合併後接線 `9df249e`（待辦工具列一律顯示、「新增待辦」全頁唯一、清單項目以標題命名）→ 三個 E2E 代理對共用伺服器遷移 → 全套 E2E → 四尺寸截圖與 Lighthouse。

## 1. 完成項目（對照 06_BATCHES V3-6）

| 項目 | 狀態 | 說明 |
|---|---|---|
| 試算頁首動作：「試算的通路」select＋`?` 說明、「匯出本頁」下拉 | 完成 | `multi-scenario-workbench.tsx`／`decision-workbench.tsx`：`usePageSlot("page-actions")` 在本頁顯示（`active`）時 portal 進頁首，SSR 與未掛載時 inline 一份；`scenario-channel`（aria-label 與可見 label 都是既有 `form.channel`「試算的通路」）＋ `?`（`ui-help-trigger`，popover `hidden` 掛載，Esc 回焦、點外面關閉）；`details.topbar-menu.auto-close.export-page`（summary `export-page-scenarios`，三項 `scenario-export-md／csv／json`，呼叫 v2 的 `download(format)`／`onExport`，通知仍寫 `decision-notice`）。v2 的 `decision-export` 區、「本通路的試算」標題與 intro、channelHint 移除（舊鍵保留） |
| 基準列（定義列表，不用卡片） | 完成 | `.baseline-row > dl.baseline-list`：標題「本期基準（{通路}，{期間 M/D}）」；淨營收、扣廣告後貢獻是 `button.number-link`（`baseline-{metric}`，開「計算與來源」同 v2）；折扣率／退款比、平台抽成率／金流手續費率純文字 tabular；同列右側 `decision-freshness`（不過期只顯示「使用目前資料」；過期 warning 標籤＋說明＋「改用目前資料並清空輸入」）；`scenario-unavailable` 改 `ui-notice`；`scenario-assumptions` details 與技術細節 details 在基準列之後 |
| 方案欄並排（不用分頁） | 完成 | `[data-testid=scenario-columns]`（`data-count`）：≥ 1280 三欄 grid（subgrid 讓各欄結果區起點對齊）；只有 1 個方案時 8/12＋右側 4/12「＋新增方案」區（`ui-empty-block`，按鈕 `scenario-add`）；2 個方案時第三格是新增區；3 個方案時沒有新增區；< 1280 單欄上下排列。每欄 `article[data-testid=scenario-{n}]` 內是 `form.scenario-form`（「試算」type=submit，輸入框按 Enter 可試算） |
| 精簡表單（placeholder、單位後綴、分段鈕、提示） | 完成 | 方案名稱、範本 select＋「套用範本」＋ `?`（popover 內 `scenario-template-note`、`scenario-preset-purpose` 以 `hidden` 保持掛載，M1）、覆寫警示 `scenario-preset-overwrite` inline；5 個輸入 `ui-field`（placeholder＝既有說明句「+10 表示多賣 10%」等，sr-only small 供 aria-describedby）＋單位後綴（%／個百分點／元／件，依欄位與模式）；3 個可切換欄位用 `ui-segmented` 分段鈕「增減／改成」（`scenario-mode-{field}`，aria-pressed；不可用時 disabled＋理由）；`scenario-range-{field}` 與 `scenario-absolute-error-{field}` 一律掛載、未超出時 `hidden`；`scenario-equivalent-{field}` 只在「改成」模式顯示（13px 次要色） |
| 聲明勾選（D-V3-12＝B） | 完成 | `ScenarioWorkspace.assumptions_acknowledged_at?`（ISO）＋ `acknowledgeScenarioAssumptions()`；第一次勾選任一方案（`scenario-accept`）即記住，之後每個方案顯示 `scenario-acknowledged`「已了解這是試算，不是預測。」而沒有 checkbox，新方案、複製歷史方案與按「試算」時 `assumptions_accepted` 一律 true；備份 v4 的 `scenario_workspace` 多一個選填欄位（只在有值時寫出；v1–v3 與沒有欄位的 v4 檔照常還原），`backup-schema-v4.json` 加 key path 與 `scenario_assumptions_acknowledged` 說明 |
| 結果區與敏感度 | 完成 | 每欄底部對齊的 `scenario-result`（aria-live）：「試算後的扣廣告後貢獻」＋ 24px 金額（`scenario-contribution`，L1）、「與現況相比 {差額}」（`scenario-delta`，deltaTone 上色）、版本／草稿 `ui-lozenge`（`scenario-version`／`scenario-draft`）、過期標籤、有效方案的「選入會議」次要鈕（`scenario-select-{n}`，可及名稱同 v2）；`ScenarioSensitivity` 每個有效方案一份（testid、`plan.sensitivity`、備份不變；caution 句改 13px 次要色、不加「限制：」前綴） |
| 方案欄之後：比較表、其他通路、歷史；決策輸出搬到頁首 | 完成 | `scenario-comparison`（預設展開，數字 L2／L3 不變）→ `scenario-other-channels` details（含其他通路的選入會議）→ 「之前的試算」details（複製到目前方案）；獨立「選入會議」區塊移除（每方案結果下的按鈕取代）；`decision-notice` 保留 |
| 待辦頁首：計數徽章、`?` 說明、新增待辦、匯出本頁 | 完成 | `actions-count`（可見「{total} · 置頂 {pinned}」，aria-label 既有 countSummary 全句）＋ `?`（`actions-help` hidden 掛載，「最多置頂 3 項，置頂項目會列入會議摘要。」）portal 到 `#page-title-addon`；`actions-add`（主要）＋ `actions-export-menu`（summary `export-page-actions`，項目 `actions-export-md／csv／json`，v2 同一個 `onExport`）portal 到 `#page-actions`；SSR／未掛載時 inline 一份。移除 v2 的 h2／intro／countSummary 段落／boardIntro／底部匯出區（舊鍵保留） |
| 工具列（C15）：看板｜清單分段鈕 | 完成 | `actions-toolbar` 內 `ui-segmented`（`actions-view-board／list`，aria-pressed；偏好仍記 `ui_prefs.view`）；空工作區也顯示（同 v2） |
| 看板四欄（C8 計數、C10 空欄） | 完成 | `board-column-{status}`：h3 狀態名＋`ui-count-badge`（role=img，aria-label「n 項」）；欄底 `--bg-subtle`、無邊框、不拉滿；空欄 `ui-empty-block`「沒有待辦」；≤ 1100 兩欄、≤ 640 單欄 |
| C13 卡片 | 完成（高度見 §5） | `board-card-{n}`（tabIndex −1，焦點跟著卡片）：置頂 icon 鈕（aria-pressed，SVG star 線框／實心）＋標題鈕（14／600，最多 2 行，開抽屜；h4 包住保留 heading 導覽）；「負責人 · M/D 到期 · M/D 更新」（逾期用不利色＋「逾期」）；狀態 `ui-lozenge`＋「引用 n 個數字 · 已確認／草稿」＋條件徽章「需要重新核對」或「過期」；「移到：未開始 · 受阻 · 已完成」文字按鈕（`board-card-{n}-move-{status}`，可及名稱同 v2「移到{狀態}」）＋最右「編輯」（`board-card-{n}-edit`）。一行標題 96px、兩行 116px（四尺寸實測） |
| 待辦編輯抽屜（C6，不用分頁） | 完成 | `action-drawer.tsx`：`dialog[data-testid=action-drawer]`（showModal、`aria-labelledby` h2 標題、`aria-describedby` 副標「{負責人} · {到期} · {狀態}」）；寬 560／≥ 1440 640／≤ 1279 480／≤ 767 全螢幕；固定標題列 56px（關閉 icon 鈕 autofocus）；內容捲動；固定底部動作列 64px：關閉、置頂（aria-pressed）、往上移、移除（危險文字鈕最右；`action-drawer-close／dismiss／pin／move-up／remove`）；滑入 `--dur-base`、reduced-motion 直接出現；Esc 與關閉都回焦到開啟它的元素（不存在時 `fallbackFocus` 回看板）；工作台通知在抽屜內另有一份 role=status。看板的「新增待辦」直接開抽屜 |
| 共用編輯器三段 | 完成 | `action-editor.tsx`（自 actions-workbench 搬出）：三個 `section[role=region]`「內容」（7 欄 `ui-field`、狀態、進度）／「引用的數字」（警示 `ui-notice`、搜尋與勾選 `evidence-checklist`、確認（唯一主要鈕）、看明細、用目前資料重新核對與預覽、限制 details）／「歷史」（引用歷史、技術細節）；`variant="list"` 保留 v2 的置頂／往上移／移除列，`variant="drawer"` 不渲染（底部動作列取代）；欄位即時生效、「確認」仍是確認引用的數字 |
| 清單檢視 | 完成 | 維持 v2 的 `article[data-testid=action-{n}]`＋內嵌編輯器（aria-labelledby 指向自己的標題）；看板與清單不同時渲染（M6） |
| 空狀態（C10 頁面型） | 完成 | `actions-empty`：「尚無待辦。」「從健檢結果或會議決議新增。」＋主要鈕「新增待辦」（`actions-empty-add`；此時頁首不放，全頁只有一顆） |
| labels 新分組 | 完成 | `scenarios.pageV3` 13 鍵、`actions.pageV3` 16 鍵、`actions.drawerV3` 5 鍵；既有鍵字串不變；copy-style 同義詞 13／禁用詞 3 不變 |
| 單元測試與 E2E 遷移 | 完成（unit 104 檔／2,094 全過；E2E 全套 628／628） | 新增 `tests/scenario-page-v3.test.tsx`（9）、`tests/action-board-v3.test.tsx`（18）、`tests/action-drawer-v3.test.tsx`（17）；改寫 `scenario-form`、`workspace-backup`、`backup-schema-v4`、`manager-language`、`action-board`；`mounted-testids` 新增 A／B／C 條與 `scenarios-first-visit`、`actions-empty`、`actions-list` 狀態；E2E 見 §3 與 §3b |
| 驗收重點：首次進入可見控制 ≤ 14 | 部分 | 方案表單 14（名稱、範本、套用、`?`、5 個輸入、3 組分段鈕、聲明、試算）；整個工作台 23（另有通路 select、通路 `?`、匯出本頁、2 個基準 number-link、2 個 summary、新增方案、其他通路 summary）。整頁 ≤ 14 做不到而不隱藏 PRD 要求的控制；測試固定「整頁＝表單＋9」 |
| 驗收重點：從範本到結果 3 個動作 | 完成 | 記住聲明後：選範本 → 套用 → 試算（hooks harness 驗證；golden DTC「維持現況」270.00）；第一次多一個勾選（4 個動作） |
| 驗收重點：載入示範資料到第一個結果鍵盤 ≤ 12 步 | 未達 | 首次 35 次按鍵（側欄 Enter、16 個 Tab 到範本 select（頁首 3＋期間列 7＋基準 2＋2 個 summary＋名稱＋範本）、↓、Tab、Enter、13 個 Tab 到聲明、Space、Enter）；記住聲明後從範本 select 起 6 次。殼層 tab stop 佔 10 個，需要 PRD 或殼層層級決定（見 §6） |
| 驗收重點：看板鍵盤流程（開卡片 → 改狀態 → 關抽屜回焦） | 完成（E2E `action-workspace.spec`「V3-6 看板抽屜」「V3-6 待辦抽屜」「focus trap」：開抽屜焦點在關閉鈕、抽屜內改狀態卡片換欄、Esc 關閉回焦到編輯鈕／標題鈕、移除後焦點回看板、Tab 在最後一個控制繞回第一個） | E2E 新增測試覆蓋（見 §3b） |

## 2. 變更檔案

- 新增：`src/components/action-editor.tsx`、`src/components/action-drawer.tsx`、`src/components/shell/page-slot.ts`、`tests/scenario-page-v3.test.tsx`、`tests/action-board-v3.test.tsx`、`tests/action-drawer-v3.test.tsx`、E2E helper `tests/e2e/scenario-helpers-v3.ts`、`tests/e2e/actions-helpers-v3.ts`、`tests/e2e/misc-helpers-v3.ts`（`replacement-helpers.ts` 未動）、`verification/revamp-v3/V3-6/**`、本檔。
- 修改：`src/components/multi-scenario-workbench.tsx`、`decision-workbench.tsx`、`scenario-sensitivity.tsx`、`actions-workbench.tsx`、`shell/page-chrome.tsx`、`shell/shell-icon.tsx`（新增 star／star-filled／edit）、`dashboard.tsx`（只傳 `active`）、`src/application/scenario-workspace.ts`、`src/application/workspace-backup.ts`（v4 選填欄位）、`src/i18n/labels.zh-TW.ts`、`src/app/globals.css`（V3-6 錨點區段）、`verification/revamp-v3/backup-schema-v4.json`、`tests/{scenario-form,workspace-backup,backup-schema-v4,manager-language,action-board,mounted-testids,labels-structure}.test.*`、E2E specs `scenarios`、`scenario-sensitivity`、`revamp-r5`、`action-workspace`、`m6-acceptance`、`review-v2-a`、`review-v2-a-export`、`revamp-r6`、`workspace-storage`、`ai`（其餘 11 個 spec 未改、跑過即通過）、`docs/STATUS.md`、`docs/DECISIONS.md`、`docs/revamp-v3/06_BATCHES.md`、`docs/revamp-v3/09_DECISIONS_PENDING.md`、`verification/revamp-v3/feature-retention.csv`、`verification/revamp-v3/e2e-text-assertions.csv`。
- 零改動：`src/domain`、`fixtures`、`docs/METRICS.md`、`.env*`、`vercel.json`。

## 3. 驗收命令與真實結果

| 命令 | 結果 |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | 0 warnings |
| `npm test -- --run` | **104 檔／2,094 測試全過**（V3-5：101 檔／2,042；新增 scenario-page-v3 9、action-board-v3 18、action-drawer-v3 17 等） |
| `npm run lint:design` | exit 0；hex 0、圓角 4、字級 13、字距 0、JSX 箭頭 3、eyebrow 0、裝飾 0、CSS content 0；labels 同義詞 13／禁用詞 3 不變；對比 75／75；棘輪上限不變（本批無下降項） |
| `npm run build` | pass |
| `npm run test:e2e` | **628 passed（18.5m）**，0 failed、0 skipped；desktop／laptop／tablet／mobile 四專案（webServer 重建 build；V3-5 為 612，本批新增 16 條）。跑完後 `verification/revamp-R6/artifacts` 被重寫，已 `git checkout --` 還原。E2E 代理的分 spec 結果：E1（scenarios、scenario-sensitivity、revamp-r5）四尺寸 52／52；E2（action-workspace、m6、manager-presentation、review-v2-a、review-v2-a-export、revamp-r6）56／58，兩個失敗是新寫的 focus trap 測試揭露的產品缺口（抽屜只靠 showModal），本批補上 `shell/focus-trap.ts` 後全套通過；E3（workspace-storage、ai 與其餘 10 個 spec）204／204 |
| 畫面基準 | `verification/revamp-v3/V3-6/snapshots/{desktop,laptop,tablet,mobile}/01–09.png` 共 36 張（baseline.spec `--update-snapshots` 4 passed），重跑核對 4 passed、0 張差異；首屏量測（metrics.spec 6 passed，`_meta.batch=V3-6`）與 V3-5 相同：1440 本期一句話頂端 192px、KPI 帶底 419px、扣廣告後貢獻值頂 323px、三件事首列底 525px、KPI 前可聚焦 9；390 分別 116／555／295／685、可聚焦 3。捕捉腳本 `verification/revamp-v3-capture/shared.ts` 的 calculateKeepPreset 改成點擊聲明後斷言 scenario-acknowledged（D-V3-12 勾完即卸載，`check()` 會逾時；第一次捕捉因此失敗後修正重跑）。 |
| Lighthouse（示範資料已載入，1440 與 390） | 1440 與 390 各 6 個快照步驟 accessibility 全部 100（首頁空狀態、經營總覽、通路健檢、商品毛利、假設試算、會議紀錄）；首頁 performance 1440＝100、390＝97（V3-5：100／98；第一次跑到 390＝84 是 E2E 剛結束時的機器負載，重跑回到 97，LCP 1,888ms）。失敗審核只剩會議紀錄頁的 `label-content-name-mismatch`（主管摘要 number-link 18 個節點，V3-4b 起既有，屬 V3-7 範圍；不計分）；假設試算頁 0 個失敗審核。報告：`verification/revamp-v3/V3-6/lighthouse/flow-desktop-1440.html`、`flow-mobile-390.html`；數值在 `metrics.json`。 |
| 禁區 diff（對 82b70df） | 空 |
| testid 基準 | 刪除數 0；新增 scenario-columns、scenario-add、scenario-accept、scenario-acknowledged、scenario-select-{n}、scenario-export-menu、export-page-scenarios、scenario-export-{md,csv,json}、actions-add、actions-count、actions-help、actions-export-menu、export-page-actions、actions-toolbar、actions-empty、actions-empty-add、board-card-{n}-edit、action-drawer、action-drawer-{close,dismiss,pin,move-up,remove}、page-title-addon |

### 3a. 本批驗收重點（PRD §7.4、§7.5）

| 指標 | 目標 | 實測 |
|---|---|---|
| 首次進入可見控制數 | ≤ 14 | 方案表單 14；整個工作台 23（含頁首與基準列；定義寫在 `tests/scenario-page-v3.test.tsx`：不在 hidden 祖先與收合 details 內的 button／input／select／textarea／summary，分段鈕一組算 1） |
| 範本到結果的動作數 | 3 | 3（記住聲明後）；第一次 4 |
| 載入示範資料到第一個結果的鍵盤步數 | ≤ 12 | 35（首次）；記住聲明後從範本 select 起 6 |
| 試算 golden | 270.00／284.00／264.00／19.70 不變 | 不變（單元測試以 formatAmountL1／L3 斷言；比較表逐格 L2／L3 相符） |
| §6.3 #37–#42 testid | 全部存在 | 全部存在（含 hidden 掛載的 scenario-preset-purpose、scenario-template-note、scenario-range-*） |
| 收合卡片高度 | ≤ 96px | 一行標題 96px；兩行標題 116px（1440／1280／768／390 四尺寸相同；PRD「≤ 96px」與「標題最多 2 行」互斥，見 §5、D-V3-26） |
| 抽屜寬度 | 560／640／480／全螢幕 | 1280 560px、1440 640px、768 480px、390 全寬；標題列 56px 固定、底部動作列 64px 固定 |
| 全頁主要按鈕 | 每個容器 1 顆 | 試算頁：每欄「試算」1 顆；待辦頁：「新增待辦」1 顆（空狀態時在空狀態區）；抽屜：「確認」1 顆（預覽區自成容器） |
| `design-lint` hex | ≤ 10 | 0 |

### 3b. E2E 路徑變更（§6.4 M4）

| v2 路徑 | v3 路徑（本批） | 受影響 spec |
|---|---|---|
| 試算頁「匯出」區三顆按鈕 | 頁首「匯出本頁」下拉：先點 `export-page-scenarios`，再點 `scenario-export-{md,csv,json}`（點完選單關閉、焦點回 summary）；helper `downloadScenario`／`downloadDecision`（依側欄 aria-current 自動挑試算或待辦頁的選單） | scenarios、scenario-sensitivity、m6-acceptance |
| 待辦頁底部「匯出」區三顆按鈕 | 頁首「匯出本頁」下拉：`export-page-actions` → `actions-export-{md,csv,json}`；helper `decisionExportButton`／`downloadActionsExport` | action-workspace、review-v2-a-export、m6-acceptance |
| 每個方案勾「我了解這是試算」`getByLabel(...).check()` | 第一次：`click()` 後斷言 `scenario-acknowledged` 出現且焦點在「試算」（元素勾完即卸載，`check()` 會逾時）；之後每個方案斷言沒有 checkbox；helper `acceptAssumptions(card)`（三個 helper 檔各有一版，語意相同） | scenarios、revamp-r5、scenario-sensitivity、workspace-storage、review-v2-a、m6-acceptance、revamp-r6、ai、action-workspace |
| 「這個方案不適用」（未勾聲明就試算） | 只能在第一次勾選前測：測試順序改成先拒絕再勾選 | scenarios、scenario-sensitivity |
| 分段鈕「相對 %／絕對值」 | 「增減／改成」（`labels.scenarios.pageV3.modeRelative／modeAbsolute`）；helper `modeButton` | revamp-r5、scenarios |
| 範本說明 `scenario-template-note`／`scenario-preset-purpose` 可見 | 在 hidden 的 `?` popover 內：先點 `templateHelpAria` 鈕（helper `openTemplateHelp`），Esc 回焦 | revamp-r5、scenarios |
| `scenario-range-*`／`scenario-absolute-error-*` `toHaveCount(0)` | 一律掛載：改 `toBeHidden()` | revamp-r5、scenarios |
| 「新增方案」在 3 個方案後 disabled | `scenario-add` 不存在（`toHaveCount(0)`），`scenario-columns[data-count=3]` | scenarios、review-v2-a |
| 敏感度 caution `p.note`（含「限制：」） | `:scope > p.scenario-caution`＝`labels.basis.items[6]` | scenario-sensitivity |
| 看板卡 `details.board-edit` summary「展開編輯」 | 點 `board-card-{n}-edit`（或標題鈕）開 `dialog[data-testid=action-drawer]`；欄位從抽屜內 `getByLabel`；helper `openActionDrawer`／`closeActionDrawer` | action-workspace、revamp-r5、revamp-r6 |
| 看板的置頂／往上移／移除（卡片內） | 抽屜底部 `action-drawer-pin／move-up／remove`；清單檢視仍在內嵌編輯器 | action-workspace、scenarios（清單路徑不變） |
| `board-card-{n}-move-{status}` `toHaveText(移到{狀態})` | 可見文字只剩狀態名：`toHaveAccessibleName(fill(actionBoard.moveTo))` | action-workspace、revamp-r5 |
| 欄標題 `toContainText(fill(columnCount))` | 徽章 `.ui-count-badge` 的 aria-label／文字；heading 可及名稱「{狀態} n 項」 | action-workspace、revamp-r5 |
| 卡片狀態日期 ISO（`\d{4}-\d{2}-\d{2}`） | `fill(pageV3.updated,{date: formatDateL1(...)})`（M/D） | action-workspace、revamp-r5 |
| 卡片引用標籤 `ui.tagDraft／tagConfirmed` | `fill(pageV3.evidenceCount,{n,state})`（清單檢視標題列仍用 evidenceTag） | action-workspace |
| `page.getByRole('dialog')` 單一 | 抽屜內「看明細」會疊開第二個 dialog：改 `dialog.evidence-drawer`／帶 name | action-workspace |
| 待辦頁 `countSummary` 段落、`ui.empty` 文字 | `actions-count` 的 aria-label；`actions-empty`（h2 emptyTitle＋emptyBody） | ai、review-v2-a |
| 備份 JSON 的 `scenario_workspace` | 多一個選填 `assumptions_acknowledged_at`（ISO）；還原後試算頁沒有 checkbox | workspace-storage |

新增的 E2E 測試：`scenarios.spec`「V3-6 試算頁」（範本→套用→試算 3 個動作、第二個方案沒有 checkbox、匯出本頁三項可下載、增減／改成切換與等值、範本 `?` popover Esc 回焦、無水平溢出；桌機與手機）；`action-workspace.spec`「V3-6 看板抽屜」（抽屜內改狀態卡片換欄、置頂／往上移／移除、看明細疊開第二個 dialog、確認後 Esc 回焦）、「V3-6 待辦抽屜」（開啟焦點在關閉鈕、Esc／底部關閉回焦、移除後回看板、空工作區只有一顆新增待辦）、「V3-6 待辦抽屜 focus trap」（Tab 全程留在抽屜內、最後→第一、第一→最後；本批補上 `shell/focus-trap.ts` 後通過）；`revamp-r5.spec` 待辦段（移到鈕可及名稱、欄計數徽章、M/D 更新、編輯鈕開抽屜 Esc 回焦）；`workspace-storage.spec`（備份含 `assumptions_acknowledged_at`，還原後聲明仍記住）。

## 4. 瀏覽器驗收

- 方式：示範資料（`APP_MODE=PUBLIC_DEMO`）的 production 伺服器，Playwright `baseline.spec.ts` 依 `CAPTURE_BATCH=V3-6` 逐頁截圖（01 空狀態、02 總覽、03 抽屜、04 待辦看板、05 健檢、06 商品、07 試算、08 會議、09 資料），四尺寸 1440×1000、1280×900、768×1024、390×844；寫入後重跑核對 0 差異。
- 截圖路徑：`verification/revamp-v3/V3-6/snapshots/desktop/07-scenarios.png`、`04-actions-board.png`；`laptop/`、`tablet/`、`mobile/` 同名各一張（共 36 張）。
- 人工檢視（1440、768、390 的 04／07）：試算頁頁首「試算的通路 官網 · DTC」select＋`?`＋「匯出本頁」在同一列；基準列一行（淨營收 388.1 萬、扣廣告後貢獻 133.1 萬是 number-link；折扣率／退款比 10.5%／2.6%；平台／金流 0.0%／2.0%；右側「使用目前資料」）；假設與技術細節兩個 details；方案 1 佔 8/12、右側虛線「新增方案」區；表單 5 個輸入兩欄、單位後綴、分段鈕「增減／改成」；聲明已記住後顯示「已了解這是試算，不是預測。」；結果「試算後的扣廣告後貢獻 133.1 萬」「與現況相比 0 元」「版本 1」「選入會議」；下方方案比較表；390 單欄、頁首換兩列、分段鈕保持 28px。
- 待辦頁：h1 旁「1 · 置頂 0」徽章與 `?`、右側「新增待辦」（主要）與「匯出本頁」；看板｜清單分段鈕；四欄（未開始 1、進行中 0、受阻 0、已完成 0）各帶計數徽章，空欄虛線「沒有待辦」；卡片「☆ 折扣多花 118.8 萬／未指定 · 未定／未開始 · 引用 6 個數字 · 草稿／移到：進行中 · 受阻 · 已完成  編輯」；768 兩欄、390 單欄。
- 本機 dev 伺服器（1440）另手動走過：範本「雙 11 檔期」→ 套用 → 勾聲明 → 試算 得 171.6 萬（＋38.5 萬、版本 1、選入會議）；待辦空狀態按「新增待辦」直接開抽屜（標題「待辦 1」、副標「未指定 · 未定 · 未開始」、三段、底部 關閉／置頂／往上移／移除），Esc 關閉後焦點回到卡片。
- Lighthouse 流程報告：`verification/revamp-v3/V3-6/lighthouse/flow-desktop-1440.html`、`flow-mobile-390.html`。

## 5. 已知限制與偏離

- **捕捉腳本更新**：`verification/revamp-v3-capture/shared.ts` 的 calculateKeepPreset 改成 click 聲明後斷言 `scenario-acknowledged`（同 E2E helper）。
- **鍵盤 ≤ 12 步未達**：到方案表單前有頁首動作 3 個與期間列 7 個 tab stop；達標要殼層或 PRD 層級的決定（例如表單前的跳至連結、分段鈕 roving tabindex、聲明移到輸入之前）。本批沿用 PRD 的欄位順序，不加 roving tabindex。
- **可見控制 ≤ 14 只在方案表單成立**：整個工作台 23，因為 PRD 同時要求頁首通路 select、匯出本頁、基準列的兩個 number-link、假設清單與技術細節 details、新增方案與其他通路。
- **C13 卡片高度**：一行標題 96px；兩行標題（PRD 允許最多 2 行）116px。padding 上與左右 12px、下 8px 才能在一行時剛好 96px。示範資料的健檢標題（約 12 個字以上）在 1280／768 會換行。待拍板 D-V3-26（限制 1 行，或接受兩行 ≤ 116px）；拍板前維持 2 行。
- **D-V3-12 的範圍**：記住的聲明寫在 `scenario_workspace.assumptions_acknowledged_at`，跟著同一工作區（含換期間、取代資料集的 epoch 變更）直到「清空目前資料」；沒有取消勾選的操作，要重看聲明可展開「這個試算假設了什麼」。備份 v4 多一個選填欄位：舊檔照常還原；v3.0 寫出的檔案在 v2.0.0 的嚴格 schema 下不能還原（v3 → v2 降版不在支援範圍）。V3-9 升 v5 時正式納入。
- **Portal 與 SSR**：試算頁的通路欄與匯出選單是兩個獨立 portal（通路 select 不隨 DecisionWorkbench 重掛載）；待辦頁的徽章與 `?` 進 `#page-title-addon`、新增待辦與匯出進 `#page-actions`。SSR 與 hydration 前先 inline 渲染在頁面元件內（testid 基準與 mounted-testids 看得到），任何時候只有一份。
- **同名按鈕**：頂欄下載選單與各頁「匯出本頁」的決策 Markdown／CSV／JSON 同名（一次只開一個選單）；抽屜內有標題列 icon 與底部文字兩個「關閉」（PRD C6 兩者都要求；E2E 用 testid）。
- **「試算的通路」沿用既有鍵**（PRD 寫「試算通路」）：可見 label 與 aria-label 同字，避免近義詞；「匯出本頁」沿用 `products.pageV3.exportPage`（V3-10 可抽成共用鍵）。
- **單位後綴**：折扣率在「增減」模式是「個百分點」、「改成」模式是 %；銷量「改成」模式是「件」；廣告預算「改成」模式是「元」（新增 unitPoints／unitCount 兩鍵）。
- **抽屜開著時頁面捲軸仍在**（抽屜在捲軸左側約 15px），與 V3-5 的計算與來源抽屜相同；鎖定頁面捲動不在本批範圍。
- **清單檢視的三段 region 同名**（每項都有內容／引用的數字／歷史）：article 已加 `aria-labelledby` 指向自己的標題給上下文；axe 的 landmark-unique 是最佳實務規則，Lighthouse 不計分。
- **舊 CSS 規則未刪**（`.scenario-grid`、`.baseline-metrics`、`.decision-export`、`.pin-star`、`.board-edit`、`.board-card-meta`、`.action-inputs` 等）：由 V3-6 錨點區段以較高特異性覆寫，多數已無對應 markup；V3-10 清理。舊鍵保留到 V3-10：`ui.multiScenarioWorkbench.heading／intro／selectHint／selectPlanButton`、`scenarioForm.channelHint`、`ui.decisionWorkbench.exportHeading／exportNote／baselineEyebrow／baselineMeta／baselineTagFixed／baselineTagStale`、`labels.scenario.modeRelative／modeAbsolute`、`sections.scenarioCompare／actionBoard／actionList`、`ui.actionsWorkbench.intro／countSummary／empty／exportHeading／exportNote`、`actionBoard.boardIntro／expandEdit／columnEmpty／statusUpdated`。
- **示範／golden 資料的舊名詞**：`src/domain` 的規則標題仍含「行銷後貢獻」，`addActionDraft` 不帶覆寫時會複製進卡片標題（只有測試走這條路；Dashboard 傳 `rule.headline`）。禁區不改。
- `small { display: block }` 全站規則會蓋掉 `[hidden]`：試算頁在錨點 A 區段加了 `.scenario-page [hidden] { display: none }`；其他頁若以 hidden 屬性藏 `<small>` 也會遇到（V3-10 可改成全站規則）。
- 既有 `tests/e2e/revamp-r2-copy.spec.ts:118`、`scenarios.spec.ts:233`、`tests/action-board.test.ts:33` 的 BOM 正規式含字面 U+FEFF，自 v2.0.0 既有，非本批引入。

## 6. 下一批、人工關卡、需要拍板

- **下一批 V3-7 會議紀錄與匯出**。
- 人工關卡：H2 設計稿審查、H3 文案補審——使用者 2026-10-07 指示略過；H1（v2 基準測試）、H4（v3 複測）未執行。
- 需要拍板（新增至 `09_DECISIONS_PENDING.md`）：**D-V3-26** 看板卡高度與兩行標題（A 接受兩行 ≤ 116px／B 標題限 1 行）；**D-V3-27** 試算頁「鍵盤 ≤ 12 步」的達成方式（A 表單前加跳至連結／B 分段鈕 roving tabindex＋聲明前移／C 放寬為「記住聲明後 ≤ 12 步」）。拍板前維持本批行為。
