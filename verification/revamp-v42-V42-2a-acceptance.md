# v4.2 V42-2a 驗收：群組層與單一通路層（2026-10-28）

使用者 2026-10-28 回覆「V42-2a 開工，其他依建議」。基準 v4.1.3＝tag `v4.1.3`＝`3bb1924`；開工錨點 `9a3756c`（06 進度改進行中、D-V42-35＝A 寫入決定欄）；D-V42-35＝A 的實作 `08e1e0c`（`scripts/lighthouse-pages.mjs` 寫 `lighthouse.environment`）。程式：代理 A `0711002`（併入 `126169d`）、C `dc1edd1`（併入 `33b10fe`）、B `05b0a88`（併入 `eb01817`）、D1 `067a668`（併入 `7d04efe`）、D2 與 R1 修正 `3298344`、R2 修正 `1d67e95`、驗收修正 `4ea8067`（V42-1b `channel-settings.spec` 案例 A 的兩層選單期望、`period-bar.test` 原始碼斷言）、`6262fd0`（健檢寬表通路名改讀格內第一個文字節點）、`74230d7`（`channelSelection` 改「恰好一個通路」先於「集合等於全部」＋單元測試）；收尾 commit {{CLOSEOUT}}（只加文件、證據、畫面基準）。拍板依 `docs/revamp-v4.2/09_DECISIONS_PENDING.md`：D-V42-2＝A（沿用單一通路篩選＋「只看這個通路」）、D-V42-10＝A（同一個 `<select>` 的 `<optgroup>`；子集顯示只讀的「{n} 個通路」）、D-V42-12＝A（群組不開 domain；限制句明說）、D-V42-13＝A（示範資料不預設群組）、D-V42-14＝A（名稱與群組由快照帶）、D-V42-35＝A。

工作流（ultracode）：設計文件先定案（工作暫存區 `v42/v42-2a/DESIGN.md`，§1 到 §8；本文件的 §1 逐項對照它），A（核心：解析器認得群組、範圍文字、兩層選單、`onDrill` 接線）與 C（精確性測試）並行；B（稽核修法、按鈕、限制句）與 D1（頁面狀態、M1、testid、鍵盤里程碑、畫面基準 18 的測試碼）並行；D2（四尺寸 E2E、按鈕與目標句的 M1）與 R1（規格、拍板、labels、禁區的唯讀審查）並行；R2（瀏覽器行為與 a11y，3106 埠的 LOCAL 伺服器、四尺寸、axe 11 個狀態）；修正 R1 4 件 major（R1-2、R1-3 由 D2 的工作併入同一個 commit 結案）、R2 2 件 major 與 1 件視同 major 的 nit（§5）。代理在 `.claude/worktrees/` 的分離 worktree 工作，主檢出以 `--no-ff` 併入後移除（移除前主檢出的 `eslint .` 會掃到 worktree 副本，見 §5 教訓）。

## 1. 完成項目（對照 `docs/revamp-v4.2/06_BATCHES.md` V42-2a）

| 項目 | 狀態 | 內容 |
|---|---|---|
| 1 期間列兩層選單（D-V42-10；PRD §4.1） | 完成 | `src/components/shell/period-bar.tsx`：同一個原生 `<select>`（加 `data-testid="scope-select"`）；有群組時每群組一個 `<optgroup label={群組名}>`，組內第一個選項是群組本身（`scope-option-group-{id}`，值＝`"\u0001"＋群組 id`，`channel-settings.ts` 的 `groupOptionValue`），之後是成員（manifest 順序）；沒有群組的通路放最後一組「未分組」（`labels.shell.periodBarV42.ungrouped`）；沒有任何群組時 markup 與 v4.1.3 逐位元組相同（`tests/period-bar.test.tsx` 以 `groups` 未給／`[]` 對照）。選取值由 `channelSelection`（`channel-settings.ts`）決定，優先順序：恰好一個 → 那個通路（就算它自己是單一成員的群組；只有一個通路的資料集也顯示那個通路，與 v4.1.3 相同——第一輪 `GUIDE_MEDIA=check` 抓到 import-wizard 影片的 apply 畫格差 439 px，就是這個樣本的選單從「官網」變成「全部通路」，修回「恰好一個」先、重跑後 0 差異）；集合等於全部 → 全部通路；集合等於某群組成員 → 群組；其餘 → 只讀選項「{n} 個通路」（`SUBSET_OPTION_VALUE`，`disabled` 且被選中）。`channelSelectModel` 由 `dashboard.tsx:587` 與 `tests/helpers/page-states.tsx` 的 `shellPage` 共用，`channelsForOption` 在 `dashboard.tsx:627` 的 `onChange`；選群組時 `applyFilters({ ...scope, channels: 成員 })`，與單一通路同一條路（A 級，不改 `applyFilters`）。通路代碼含控制字元的視為不可分組（`isGroupableChannelCode`）。行高不變（R2 量四尺寸，`r2/obs/grouped-{size}.json` 的 `pb.*`：1440／1280 48 px、390 按鈕 56 px（底部面板 566 px）、768 依最寬選項文字決定——原代碼 127 px、短顯示名稱 89 px——optgroup 本身不改高度）。 |
| 2 範圍文字（PRD §4.1 末段、§4.2 第 2 點；GLOSSARY #8） | 完成 | `NameResolver` 加 `groups`（快照的 `channel_groups`）；`copy.ts` 新增 `scopeChannelsLabel`（群組命中 → 群組名；單一通路屬於群組 → 「{群組名} · {通路名}」；其餘 → `channelsLabel`）與 `scopeDetailText`（期間摘要 title 與 sr-only：「{群組名}（成員）」）；`scopeLabel` 的 `kind "all"` 群組命中只寫群組名，`kind "channel"／"sku"` 走 `scopeChannelsLabel`；`diagnosisScopeLabel` 群組命中寫群組名。沒有群組時每個函式的輸出逐字相同（`tests/copy.test.ts`、`tests/diagnosis-group.test.ts`）。備份還原後的範圍顯示由選取值邏輯處理（E2E 第二個案例）。 |
| 3 從群組看成員（D-V42-2；PRD §4.2 第 1 點） | 完成 | G4 精簡表（`channel-section.tsx`）與通路寬表兩個變體（`channel-table.tsx`）的通路格 `th[scope=row]` 內加「只看這個通路」（`channel-drill-{code}`，可見文字 `labels.diagnosis.channelsV42.drill`，aria-label「只看這個通路：{顯示名稱}」含可見文字），**只在傳入 `onDrill`、快照有至少一個群組、範圍通路數 > 1 時渲染**（示範資料沒有群組 → 畫面 01、02、05、08 與說明媒體 0 差異；R2 以 sharp 逐像素比對 1440 的 01、02、05、08、09（任一色版差 > 5 階算差異；`r2/diffs/report.json`）：01、02、08、09 0 px；05 差 1,280 px（x 402、y 3520 的 165×13 區）是 AI 區收合列的「（公開示範站不送出任何資料）」一句——`ai-collapse.tsx` 只在 `capability.reason === "PUBLIC_DEMO"` 時渲染，R2 的 3106 埠是 LOCAL 伺服器；正式畫面基準在 PUBLIC_DEMO 建置量，05 × 4 為 0 差異）；按了走 `dashboard.tsx` 的 `drillChannel`（既有單一通路篩選），重算後焦點移到期間列的通路選單（390 移到期間按鈕；審查 R2-1）。試算頁（`multi-scenario-workbench.tsx`）在範圍是 2 到 n−1 個通路時通路選單只列範圍內的通路、預設第一個成員。 |
| 4 明說限制（D-V42-12；GLOSSARY §2） | 完成 | 通路設定區的「要注意」`<details>` 四句，逐字照 GLOSSARY §2：名稱句沿用 V42-1b 的 `labels.data.channelSettingsV42.notes.names`，規則卡句、試算句、目標句是本批的 `labels.diagnosis.channelsV42.limits.{rules,scenario,targets}`；總覽在範圍等於某群組的成員集合、通路數 > 1 且有目標檔時，KPI 帶之後一行 `<p class="note kpi-targets-note">`「目標只對全部通路或單一通路配對。」（`targets.ts` 不動；單一成員的群組選了就是單一通路，目標照常配對，所以不顯示——審查 R2-3）。 |
| 5 子集稽核修正（PRD §4.4；`verification/revamp-v42/V42-0-subset-audit.md`） | 完成 | 標「V42-2a 修」的 20 條全部處理，每處一條測試且群組範圍與單一通路範圍都跑（§2 的「子集稽核對帳」）；另補稽核沒列的 6 處可見範圍文字：第 23 條健檢頁 `sec-scope`（`workspace-panels.tsx`）、第 24 條本期三件事標題（`top-three.tsx`）、第 25 條健檢結果標題（`diagnosis-list.tsx`）、第 26 條 G10 副標（`diagnosis/share-section.tsx`）、第 27 條會議摘要脈絡句（`manager-summary.tsx`）、第 28 條會議頁固定範圍一行與差異說明（`meeting-page.tsx`；功能保留表第 43 列）。不受影響的 4 條（2、4、6、12b）補了測試。仍列成員、本批刻意不改（留給 H8 與 V42-5 的人讀匯出核對）：資料來源頁「目前看的通路」列（`workspace-panels.tsx:142`）、健檢事實的「所選通路合計（…）」（`diagnosis-list.tsx:79`）、抽屜副標的「通路：…」成員行、試算頁基準標題（`decision-workbench.tsx:258`，單一通路）、列印版頁首、Excel「摘要」工作表的通路列、週會摘要 Markdown 的 meta 通路列（`manager-summary.ts:230`）、還原預覽的通路句（`workspace-storage.tsx:250`）。 |
| 6 單元（PRD §11.1） | 完成 | `tests/channel-groups.test.ts`（新，263 行）：golden 全部、demo [DTC]、synthetic {DTC, MARKETPLACE}（成員倒序傳入）、{LIVE, SOCIAL} 四案例逐期逐欄位斷言群組 `totals.cents`＝成員逐通路 `totals.cents` 的 bigint 和、`totals`／`metrics` 逐字＝`sumTotals`／`calculateMetrics(成員 totals)`、整期＝`aggregatePeriod` 子集、daily＝全部通路 daily 的成員列、`products`＝`analyzeProducts` 子集；分割 g1 {DTC, SOCIAL}＋g2 {LIVE, MARKETPLACE}＝全部通路（兩期、件數、daily 併集）；{LIVE, SOCIAL} 本期扣廣告後貢獻 null 帶 `MISSING_AD_DAY`、`MISSING_CHANNEL_COST_DAY`，群組 `ad_spend` 是 null 不是只加 SOCIAL，群組範圍沒有 `NEGATIVE_CHANNEL_CM`；橋接 `report.bridge` toEqual `buildBridge(成員 totals 和)`，可算群組 `reconciled` true（golden −315.00、{DTC, MARKETPLACE} −9,620.00、g1 9,385.00 手算），含缺列成員為 null；未知代碼、空陣列、重複、群組 id、群組名 → `RangeError("INVALID_CHANNEL_FILTER")`（domain 丟的，不是 `limits.ts`）；`daily_complete`；`filter_hash` 順序無關、成員不同則不同、設定不進 hash。`copy.test.ts`、`diagnosis-group.test.ts` 加群組範圍、群組內單一通路、無對應群組子集；匯出函式的群組範圍文字見第 5 項。 |
| 7 頁面狀態、M1、E2E | 完成 | `tests/helpers/page-states.tsx`「── V42-2a 新增頁面狀態」：`overview-grouped`（synthetic-4-channel＋`SYNTHETIC_CHANNEL_SETTINGS`，範圍 {DTC, SOCIAL}＝g1「自有」，帶 synthetic 本期的目標檔）、`diagnosis-grouped`、`meeting-grouped`（`createReviewSession`）；`tests/mounted-testids.test.tsx`「── V42-2a 新增 M1 測試」：選單的 `<optgroup>`、選中值、`scope-option-group-g1／g2`、期間摘要 title 的「自有（官網、社群）」只在 title 與 sr-only、`channel-drill-DTC／SOCIAL`（三個狀態）、`kpi-targets-note` 只在 `overview-grouped`、要注意四句、會議固定範圍一行；示範資料的狀態 `channel-drill-` 0 次。`tests/e2e/channel-groups.spec.ts`（新，307 行，四尺寸）：匯入 4 通路合成資料 → 編輯器設四個顯示名稱與兩個群組 → 期間列選「自有」（390 先 `openPeriodSheet`）→ KPI 帶五格＝Node 端 `createSnapshot(dataset, { channels: ["DTC","SOCIAL"] }, hash, 設定)` 以 `formatMetric(…, "L1")` 格式化的值 → 選中的是 optgroup「自有」內的群組選項 → 健檢、商品毛利、試算（只列成員、預設第一個）、會議（固定範圍寫群組名、議程 3 寬表有按鈕）、資料來源都在群組範圍 → G4 用鍵盤按 `channel-drill-DTC` → 焦點移到通路選單（390 期間按鈕）、選中 DTC（在 optgroup「自有」內）、title「自有 · 官網」、單一通路下沒有按鈕 → 備份（`payload.channel_settings` 四個名稱兩個群組、`active.filters.channels` 是成員代碼）→ 重新開頁還原後仍選中「自有」→ 群組清空（checksum 重簽）的備份還原後只讀的「2 個通路」被選中、沒有 optgroup、title 列成員、整頁沒有按鈕、KPI 與群組範圍相同 → 再還原完整備份後總覽、健檢、會議 axe 0 個 serious／critical。`tests/e2e/keyboard-walk.spec.ts` 總覽加里程碑「期間列通路選單」（390 選單在底部面板關著時不可見，不計入手機走查）。`verification/revamp-v42/testids-v42-added.txt` 追加 `scope-select`、`scope-option-group-g1／g2`、`channel-drill-DTC／SOCIAL`。 |
| 8 說明頁 | 完成（0 差異） | `start-period` 拍的是期間快捷與期間摘要文字（示範資料沒有群組，選單關著外觀不變）；`GUIDE_MEDIA=check` 47／47（44 張截圖＋15 個影片 cue）。第一輪（`6262fd0` 的建置，04:33 起跑；時間軸存 `logs/demo-phase-round1.log`：04:39:05 guide-check exit 1）1 張差異：import-wizard 影片的 apply 畫格 439 px（ratio 0.01；Playwright 訊息「439 pixels (ratio 0.01 of all image pixels) are different」，第一輪的 `guide-check.log` 與 diff PNG 在最終建置重跑前被覆寫、刪除，數字取自第一輪的輸出）——那個樣本只有一個通路，選單從「官網」變成「全部通路」；改回「恰好一個通路」先於「集合等於全部」（`74230d7`）後重跑 47／47、0 差異（`logs/guide-check.log`），媒體沒有 `write`；`src/i18n/guide.zh-TW.ts` 只加一行「── V42-2a 錨點」註解（新步驟文字與截圖留到 V42-5）。 |
| 9 preview 給 H8（D-V42-26） | 待使用者當次同意 | 本批完成後詢問是否 push `revamp/v4.2` 建 preview；沒有同意不 push。 |

## 1b. 變更檔案（`git diff --name-status 9a3756c HEAD`：64 個，新增 2、修改 62）

- **新增**：`tests/channel-groups.test.ts`（263 行）、`tests/e2e/channel-groups.spec.ts`（307 行）。
- **修改 `src/application`（10）**：`channel-settings.ts`、`copy.ts`、`diagnosis-group.ts`、`decision-export.ts`、`excel-export.ts`、`meeting.ts`、`pptx-export.ts`、`review-session.ts`、`waterfall.ts`、`weekly-summary.ts`。
- **修改 `src/components`（17）**：`shell/period-bar.tsx`、`dashboard.tsx`、`overview.tsx`、`overview/charts/channel-section.tsx`、`overview/weekly-snapshot.tsx`、`channel-table.tsx`、`workspace-panels.tsx`、`manager-summary.tsx`、`meeting-page.tsx`、`multi-scenario-workbench.tsx`、`evidence-drawer.tsx`、`product-comparison-panel.tsx`、`shell/present-mode.ts`、`top-three.tsx`、`diagnosis-list.tsx`、`diagnosis/share-section.tsx`、`data/channel-settings-editor.tsx`。
- **修改其他 `src`（3）**：`i18n/labels.zh-TW.ts`（+31：9 個新 key 與錨點）、`i18n/guide.zh-TW.ts`（+1 行錨點註解）、`app/globals.css`（+2：`.channel-drill` 的間距）。
- **修改 `scripts`（1）**：`lighthouse-pages.mjs`（D-V42-35＝A）。
- **修改 `tests`（31）**：`helpers/page-states.tsx`、`mounted-testids.test.tsx`、`period-bar.test.tsx`、`channel-settings.test.ts`、`copy.test.ts`、`diagnosis-group.test.ts`、`channel-names-call-sites.test.tsx`、`channel-names-snapshot.test.ts`、`channel-settings-editor.test.tsx`、`backup-restore-matrix.test.ts`、`backup-schema-v5.test.ts`、`decision.test.ts`、`action-workspace.test.ts`、`workspace.test.ts`、`v2-review.test.ts`、`v2-decision-export.test.ts`、`excel-export.test.ts`、`weekly-summary.test.ts`、`waterfall.test.ts`、`pptx-export.test.ts`、`meeting.test.ts`、`evidence-drawer-v3.test.tsx`、`scenario-page-v3.test.tsx`、`present-mode.test.tsx`、`overview-structure.test.tsx`、`product-page-v3.test.tsx`、`diagnosis-v3.test.tsx`、`e2e/channel-settings.spec.ts`、`e2e/keyboard-walk.spec.ts`。
- **修改 `verification`（2）**：`revamp-v4-capture/baseline.spec.ts`（畫面 18）、`revamp-v42/testids-v42-added.txt`（+5 列）。
- **刪除**：無。收尾 commit 另加本文件、`docs/STATUS.md`、`docs/DECISIONS.md`、`docs/ENGINEERING.md`、`docs/revamp-v4.2/06_BATCHES.md`、`00_README.md`、`verification/revamp-v42/feature-retention.csv`（18 列）與 `verification/revamp-v42/V42-2a/`。

## 2. 驗收命令與結果（程式 `74230d7`；收尾 commit 只加文件、證據與畫面基準）

證據都在 `verification/revamp-v42/V42-2a/`：`vitest.log`、`audit-ui.log`、`typecheck.log`、`lint.log`（最終程式 07:31 重跑）、`ui-audit.json`、`metrics.json`、`first-load-modules.json`、`axe.json`、`keyboard-walk.json`、`network-log.json`、`launch-check-local.json`、`backup-matrix.json`、`snapshots/`（72 張）、`lighthouse/`（第 3 次六份 HTML）、`lighthouse-runs/run1`、`run2`、`logs/`（E2E 兩次完整執行與兩次重跑、capture 兩輪、guide-check、launch-check、三次 Lighthouse 的輸出、`demo-phase.log` 與第一輪的 `demo-phase-round1.log` 時間軸）、`r2/`（R2 的 Playwright 腳本、`obs/*.json` 量測、`diffs/`、`shots/`）。`.log` 被 `.gitignore` 的 `*.log` 排除，一律 `git add -f`。

| 命令 | 結果 |
|---|---|
| `npm run typecheck`、`npm run lint` | exit 0（最終程式重跑，存 `typecheck.log`、`lint.log`；lint 0 warnings；主檢出跑 lint 前先移除四個已併入的 worktree，否則 `eslint .` 會掃到 `.claude/worktrees/` 的副本） |
| `npm run audit:ui -- --json verification/revamp-v42/V42-2a/ui-audit.json` | hex 0、字級 11（不變）、箭頭 3（既有：→ ↗ ▸ ▾ 的圖示字元，與 V42-1b 相同）、JSX 中文 0、labels「注意：」0、箭頭字元 0；靜態 data-testid 269（V42-1b 268，+1：`scope-select` 字面值）、動態 data-testid 屬性 81（V42-1b 78，+3：`scope-option-group-{id}` 樣板 1 處、`channel-drill-{code}` 樣板 2 處）；最終程式 07:31 重跑，`audit-ui.log`；blacklistSynonym 12（不變）、placeholderVariantMismatch 0、l1ClauseOverLimit 0 |
| `npm run contrast-check` | 85／85（本批沒有新 token） |
| `npm test -- --run` | 174 檔、3,743 全過（43.95 s；最終程式 `74230d7` 於 07:31 重跑，存 `vitest.log`）。過程（中間幾次沒留 log，數字由前後 commit 的新增案例數推得）：併入 D1 後 3,735（scratch `vitest-merge2.log`）；D2 與 R1 修正後 3,739；R2 修正後 3,742 過、1 失敗（`period-bar.test.tsx` 對 `dashboard.tsx` 的原始碼子字串斷言 `void applyFilters` 被 `await applyFilters` 改掉），更新斷言後 04:29 那次 3,743 全過（該 log 已被 07:31 的重跑取代）（存 `verification/revamp-v42/V42-2a/vitest.log`） |
| `npm run build` | exit 0（E2E 的 webServer 建 LOCAL 一次、PUBLIC_DEMO 一次） |
| `npm run test:e2e`（帶 `NETWORK_LOG_OUT`、`KEYBOARD_WALK_OUT`、`AXE_OUT`） | **1,163 passed、0 failed、29 skipped**（34.2 分鐘；最終建置 `74230d7`，LOCAL 伺服器 3100）。過程：第一次完整執行 1,159／4／29，4 個失敗是 V42-1b `channel-settings.spec.ts` 案例 A × 4 尺寸的舊期望（通路選單單層清單、健檢寬表通路格的純文字），依兩層選單與按鈕更新期望（`4ea8067`、`6262fd0`）後該 spec 12／12、`channel-groups.spec.ts` 8／8，再以最終建置跑完整套。axe 四尺寸 28／28／28／26 個狀態 serious 與 critical 都 0（`axe.json`）；network-log 下載集合 5 種（analysis_csv、excel、pptx、decision_json 等，與 v4 相同）、非 GET 0、POST 0（`network-log.json`）；keyboard-walk 1440 七頁 18 個里程碑全部可達、`aria-hidden` 內停留點 0，新里程碑「期間列通路選單」在 1440 與 768 第 2 個 Tab 到達（`reachedBy inside`），390 選單在關閉的底部面板內不計入（`keyboard-walk.json`） |
| `CAPTURE_BATCH=V42-2a`（基準自 V42-1b 複製 68 張，不帶 `--update-snapshots`） | 修正前建置（`6262fd0`）第一輪 4 failed＝新 18 × 4 缺檔（Playwright 寫入實際圖；四張的 mtime 04:34，是這一輪的留存證據）、其餘 42 passed＝68 張 0 差異（允許變動的 01 到 09、13 實測 0）；第二輪 46 passed；兩輪的輸出被最終建置的重跑覆寫，只留 `logs/demo-phase-round1.log` 的時間軸。最終建置（`74230d7`）兩輪都 46 passed、14 skipped（`logs/capture-1.log`、`capture-2.log`），72 張全部比對、不帶 `--update-snapshots`、0 差異（§3） |
| `GUIDE_MEDIA=check` | 47／47（44 張截圖＋15 個影片 cue）。第一輪（`6262fd0` 的建置，04:33 起跑；時間軸存 `logs/demo-phase-round1.log`：04:39:05 guide-check exit 1）1 張差異：import-wizard 影片的 apply 畫格 439 px（ratio 0.01；Playwright 訊息「439 pixels (ratio 0.01 of all image pixels) are different」，第一輪的 `guide-check.log` 與 diff PNG 在最終建置重跑前被覆寫、刪除，數字取自第一輪的輸出）——那個樣本只有一個通路，選單從「官網」變成「全部通路」；改回「恰好一個通路」先於「集合等於全部」（`74230d7`）後重跑 47／47、0 差異（`logs/guide-check.log`），媒體沒有 `write` |
| launch-check（本機 PUBLIC_DEMO） | 13 項全部通過，補充 19 項全部通過（`launch-check-local.json`） |
| Lighthouse × 3 | 390 TBT 三次中位數 952.2／760.7／86.2／935.2／14.9，五項都在門檻內（1,109.1／832.3／129.9／1,071.2／50.0）且四項低於 V42-0（1,029.4／791.5／89.1／983.0／12.6；資料來源 +2.3 ms）；開跑 1 分鐘負載 4.31（`lighthouse-runs/run1/metrics.json` 的 `loadAverage.before`；閘門等 20 分鐘沒等到，逾時前一刻的閘門紀錄是 4.42，`logs/demo-phase.log`）、2.95（同樣逾時）、2.36（閘門內）；benchmarkIndex（D-V42-35＝A，首次記錄）390 是 3,349／3,350／3,371、1440 是 3,323／3,370／3,366，Chrome 156；a11y 48 個分數全 100；首頁 Performance 1440 100／100／100、390 94／97／95；說明頁 `/guide`、`/guide/overview` 390 Performance 98、a11y 與 SEO 100；`insideTimespans` 三次兩視口都空 |
| 禁區與邊界五條 | 都是空的（commit 前後各跑一次；收尾 commit {{CLOSEOUT}}：`git diff --stat 625bfa5 {{CLOSEOUT}} -- src/domain fixtures docs/METRICS.md src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts` 與 `git diff --stat 872662d {{CLOSEOUT}} -- src/app/api vercel.json src/application/analytics.ts` 都為空）；`workspace.ts`、`workspace-backup.ts`、`evidence-ladder.ts`、`manager-summary.ts`、`targets.ts`、`package.json`、lockfile 對錨點 `9a3756c` 的 diff 都為空；`channel-settings.ts`（+54／−6）與 `copy.ts`（+27／−7）是本批指定的變更（§4） |
| `git diff --stat --diff-filter=A 9a3756c HEAD -- src/application tests` | `tests/channel-groups.test.ts`（263 行）、`tests/e2e/channel-groups.spec.ts`（307 行）；`src/application` 沒有新檔（群組查找與選取值放在既有的 `channel-settings.ts`） |

- **棘輪**：`design-lint`、`copy-style`、`copy-density`、`chart-lint` 的數值常數本批沒有動（四個測試檔 0 diff），全部通過；`placeholderVariantMismatch` 維持 0（aria 鍵命名 `drillChannelAria`，因為 copy-scan 把 X／XAria 當占位符變體）；`LABEL_GROUPS` 24；labels 三份快照（v3 2,581、v4 2,839、v41）逐鍵逐字相同，新 key 只在 `shell.periodBarV42.`（2）、`shell.scopeV42.`（2）、`diagnosis.channelsV42.`（5）；testid 五份刪除數 0。
- **First Load 與 B9**：`/` First Load 523,697（gzip；V42-0 519,705 +3,992，門檻 527,897；V42-1b 522,168 +1,529：新 labels 9 個 key、`channel-settings.ts` 的群組查找與選取值、`period-bar.tsx` 的 optgroup 與模型、dashboard 接線；全部在 `app/page` 與 `channel-settings` 所在的首載 chunk）；`SPLIT_SENTINELS` 含 `"channel-settings"` 首載 0 次、`GUIDE_SENTINELS` 0 次；說明頁 `/guide` First Load 131,461（框架基準 131,465 −4，門檻 136,585）；B9（DOM 節點）1440：總覽 3,337／4,575、健檢 2,186／2,824、商品 2,522／3,322、試算 695／2,160、待辦 723／2,188、會議 1,076／2,498、資料來源 1,273／2,629（與 V42-1b 相同，資料來源 +3：要注意多三句）；B1、B2（1440：一句話頂 168、KPI 五格底 395 ≤ 420、三件事首列底 537；1280 三件事首列底 559；390 扣廣告後貢獻值頂 295——`firstScreen` 全部與 V42-1b 相同，0 px 餘裕三處不退）、B3、B5 照 v4 斷言全過（capture 46／46）
- **B 級對帳**：本批沒有 B 級函式（群組金額全部是 `createSnapshot`／`applyFilters` 帶成員代碼的 A 級結果）；對帳在 `tests/channel-groups.test.ts`（第 1 項第 6 列）：群組＝成員 bigint 和、分割＝全部、null 傳遞、橋接 `reconciled`、`INVALID_CHANNEL_FILTER`、`daily_complete`、`filter_hash`，全部 `toBe`／`toEqual` 精確比對。
- **子集稽核對帳（20 條）**：1 `excel-export.test.ts`、5a／5b／5c／13b／22 `period-bar.test.tsx`＋E2E、7 `weekly-summary.test.ts`、8 `waterfall.test.ts`、9 `pptx-export.test.ts`、10 `v2-decision-export.test.ts`、11a／11b `meeting.test.ts`、12d `v2-review.test.ts`、14 `evidence-drawer-v3.test.tsx`、15 `scenario-page-v3.test.tsx`、17 `present-mode.test.tsx`、18 `overview-structure.test.tsx`、19 `product-page-v3.test.tsx`、20a `copy.test.ts`、20b `diagnosis-group.test.ts`；不受影響的 2 `decision.test.ts`、4 `action-workspace.test.ts`、6 `workspace.test.ts`、12b `v2-review.test.ts`；本批補的 23 到 28：`diagnosis-v3.test.tsx`、`overview-structure.test.tsx`、`channel-names-call-sites.test.tsx`、`mounted-testids.test.tsx`。
- **備份矩陣**：`BACKUP_MATRIX_OUT=verification/revamp-v42/V42-2a/backup-matrix.json`：17 列（golden／demo v1 到 v5、帶設定的 v5、imported v5、golden v3 四尺寸）全部還原、`dropped` 都空；群組範圍的備份往返由 E2E 第二個案例驗（`payload.channel_settings` 四個名稱兩個群組、`active.filters.channels` 是成員代碼）
- **AI 快照負載不含名稱**：`tests/ai-snapshot-channel-names.test.ts` 通過（負載不含 `channel_names`、`channel_groups`）。

**Lighthouse × 3（正式腳本，`scripts/lighthouse-pages.mjs`，最終建置 `-cGZA2YU7MAi4WEn1RZm-`；閘門 1 分鐘負載 < 2.5 最多 20 分鐘）**：

| 步驟（390 TBT，ms） | 第 1 次（負載 4.31；benchmarkIndex 3,349） | 第 2 次（2.95；3,350） | 第 3 次（2.36；3,371） | 中位數 | 門檻 | V42-0 | V42-1b 補量第 1 次 |
|---|---|---|---|---|---|---|---|
| 載入示範資料 | 944.4 | 982.9 | 952.2 | 952.2 | 1,109.1 | 1,029.4 | 1,302.5 |
| 通路健檢 | 760.7 | 752.8 | 762.9 | 760.7 | 832.3 | 791.5 | 792.8 |
| 商品毛利 | 86.2 | 107.7 | 83.4 | 86.2 | 129.9 | 89.1 | 98.6 |
| 會議紀錄 | 926.0 | 1,000.4 | 935.2 | 935.2 | 1,071.2 | 983.0 | 954.0 |
| 資料來源 | 11.9 | 25.4 | 14.9 | 14.9 | 50.0 | 12.6 | 15.1 |

五項都在門檻內，不需要 D-V4-47＝B 的成對對照。括號內是 D-V42-35＝A 新記錄的 `lighthouse.environment["mobile-390"].benchmarkIndex`（1440：3,323／3,370／3,366；Chrome 156.0.0.0）：三次都在 V42-0 到 V42-G1 的 3,286 到 3,346 水準以上，所以這三次的 TBT 可以直接與 V42-0 比；第 1 次 1 分鐘負載 4.31 但 benchmarkIndex 3,349，再次說明負載平均數不等於當下的 CPU 速度。證據：`lighthouse-runs/run1`、`run2` 是第 1、2 次的 metrics，`metrics.json` 的 `lighthouse` 區段與 `lighthouse/` 六份 HTML 是第 3 次。

## 3. 畫面基準

基準自 V42-1b 複製 68 張到 `verification/revamp-v42/V42-2a/snapshots/`，不帶 `--update-snapshots` 跑：第一輪（`6262fd0` 的建置）只有新畫面 18 × 4 缺檔（Playwright 寫入實際圖），其餘 68 張 0 差異——允許變動的 01 到 09 × 4 與 13 × 4 實測也是 0（`<optgroup>` 在選單關閉時不改外觀、示範資料沒有群組所以沒有「只看這個通路」、期間列高度不變）；之後每輪 46／46（最終建置兩輪的 log 在 `logs/`）。共 72 張。

新畫面 18「期間列選到群組」（`18-period-bar-group.png` × 4）：示範資料 → 資料來源頁編輯器建群組「自有」＝DTC → 套用 → 總覽期間列選「自有」（390 先開底部面板）→ 對 `.period-bar`（390 對 `#period-bar-panel`）元素截圖，帶 `noOverlayStylePath()`。06 原寫「期間列群組展開」，但原生 `<select>` 的下拉清單由瀏覽器繪製、headless Chromium 截不到（00_README 審查 nit 7），所以 18 的定義改成「選到群組後的期間列」；「自有」只有 DTC 一個成員，套用的範圍是 [DTC]，選單的值回到那個通路（optgroup 自有內的「官網 · DTC」），title 寫「自有（官網 · DTC）」。四尺寸的 18 都看得到 optgroup 結構以外的部分：選單顯示成員、期間摘要不變。

## 4. 邊界檔的 diff 範圍

- `src/application/channel-settings.ts`（+54／−6）：`NameResolver.groups`、`makeResolver` 第 3 個參數、`isGroupableChannelCode`（`validateChannelSettings` 與 `resolveChannelGroups` 對含控制字元的代碼丟掉 `group`）、`findGroupByMembers`、`findGroupOfChannel`、`GROUP_OPTION_PREFIX`／`groupOptionValue`／`groupIdOfOption`／`SUBSET_OPTION_VALUE`、`channelSelection`。設定格式 `channel-settings-v1` 不變。
- `src/application/copy.ts`（+27／−7）：`snapshotResolver` 帶 `channel_groups`；新增 `scopeChannelsLabel`、`scopeDetailText`；`scopeLabel` 的群組分支。`channelLabel`、`channelsLabel`、`categoryLabel` 不變；既有字串逐字不變（`copy.test.ts` 以 demo、plain、golden 三個解析器對照）。
- `src/application/workspace.ts`、`workspace-backup.ts`、`evidence-ladder.ts`、`manager-summary.ts`、`targets.ts`：0 diff。`src/application/analytics.ts`、`src/app/api`、`vercel.json`：0 diff。
- `scripts/lighthouse-pages.mjs`（D-V42-35＝A）：`lighthouse.environment`（每視口的 `benchmarkIndex`、`benchmarkIndexBySteps`、`chrome`；說明頁每頁摘要也多 `environment`），判定規則與其餘鍵不變。

## 5. 審查

R1（規格、拍板、labels、禁區；唯讀）10 件：major 4、nit 6；R2（瀏覽器行為與 a11y，3106 埠 LOCAL 伺服器、四尺寸、axe 11 個狀態 × 4 尺寸 0 違規、console 0 錯誤、示範資料 1440 截圖 01／02／08／09 0 px、05 只差 LOCAL 模式沒有的公開示範站 AI 括號句 1,280 px，見 §1 第 3 列；證據 `r2/`）6 件：major 2、nit 4。依「避免過度微調」只修 blocker、major；R2-3 視同 major（理由見列）。

| # | 來源 | 問題 | 處置 |
|---|---|---|---|
| 1 | R1-1 | 畫面基準 18 斷言單一成員群組的 title 是 `memberOfGroup`（示範資料：「自有 · 官網 · DTC」），實作與設計是 `groupWithMembers`（「自有（官網 · DTC）」；`scopeDetailText` 先命中群組） | 修（`3298344`）：改斷言 `groupWithMembers`，註解同步 |
| 2 | R1-2 | 審查時 `tests/e2e/channel-groups.spec.ts` 還沒進 HEAD（D2 進行中） | 修（`3298344`）：D2 的 spec 併入，四尺寸 8 個案例通過（§2） |
| 3 | R1-3 | `channel-drill-DTC` 只是註解列、三個 `*-grouped` 狀態還沒有按鈕與目標句的 M1 | 修（`3298344`）：改成真的列、加 M1 |
| 4 | R1-4 | 會議頁固定範圍一行與差異說明仍列成員（功能保留表第 43 列） | 修（`3298344`）：改 `scopeChannelsLabel`，E2E 與 M1 跟著改 |
| 5 | R2-1 | 鍵盤按「只看這個通路」後按鈕卸載、焦點掉到 body（四尺寸都實測） | 修（`1d67e95`）：`drillChannel` 重算後把焦點移到通路選單（≥ 768）或期間按鈕（390）；E2E 改鍵盤觸發並斷言焦點 |
| 6 | R2-2 | 本期三件事標題、健檢結果標題、G10 副標、會議摘要脈絡句仍列成員，與同頁的群組名矛盾 | 修（`1d67e95`）：四處改 `scopeChannelsLabel`，各一條測試；列為稽核第 24 到 27 條 |
| 7 | R2-3（R1-5 同） | 單一成員的群組選了就是單一通路，目標照常配對，卻仍顯示「目標只對全部通路或單一通路配對。」 | 修（`1d67e95`，視同 major：示範資料只有兩個通路，H8 在 preview 建的群組一定是單一成員）：條件加「範圍通路數 > 1」，與 `channelSelection` 的優先順序一致；加測試 |
| 8 | R1-6 | 其餘列成員的範圍文字（§1 第 5 項末句）與群組名並存 | 只記錄：留給 H8 看用字與 V42-5 的人讀匯出核對 |
| 9 | R1-7 | `evidenceSubtitle` 的 `named` 用子字串比對，極短的群組名可能誤判 | 只記錄（既有做法） |
| 10 | R1-8 | 收尾文件（06 進度、畫面 18 的定義、功能保留表）尚未寫 | 本文件與收尾 commit |
| 11 | R1-9 | `filter_hash` 測試在 `channel-groups.test.ts` 與 `workspace.test.ts` 幾乎重複 | 只記錄 |
| 12 | R1-10 | `period-bar.test.tsx` 對 `dashboard.tsx`、`page-states.tsx` 做原始碼子字串斷言 | 只記錄（既有做法） |
| 13 | R2-4 | 40 字的群組名在關閉的選單裡被截斷、沒有省略號（原生 `<select>`） | 只記錄：H8 時決定要不要建議短名 |
| 14 | R2-5 | 有群組時 G4 精簡表的列首欄變寬（1440 +15 px、1280 +28 px、768 +6 px），390 按鈕換行使表高 +9 px；示範資料 0 px | 只記錄 |
| 15 | R2-6 | 768 的期間列高度由最寬的選項文字決定（原代碼 127 px、短顯示名稱 89 px），與 optgroup 無關 | 只記錄；B1、B2 以示範資料量，不受影響 |

教訓：workflow 的 worktree 留在 `.claude/worktrees/`（含 `node_modules` 符號連結）時，主檢出的 `eslint .` 會回報上百個錯誤，併入後先 `git worktree remove --force` 再跑 lint；D2 在等第三次 E2E 時結束而沒回傳結構化結果，實作仍在工作樹，由主流程檢查後併入；`demo-phase.sh` 以 `>` 覆寫每一輪的 log，修正後重跑就把第一輪的 capture 與 guide-check 輸出蓋掉，之後每輪的 log 要帶輪次名。

## 6. 已知限制與風險（每批重述）

- 品類與 SKU 只到商品毛利；群組不觸發 `NEGATIVE_CHANNEL_CM`（群組範圍只有合計層規則，要注意已明說）；試算仍單一通路（群組範圍下選單只列成員）；目標不配群組（D-V42-3、12）。
- 群組合計列（總覽、健檢、會議）在 V42-2b；本批群組範圍只有整個工作台切過去，沒有並列的群組列。
- 只有一個成員的群組：選了就是單一通路（選單值回到那個通路、目標照常配對），期間摘要 title 仍寫「{群組名}（成員）」；示範資料只有兩個通路，H8 建的群組都會是這種（§5 第 7 列）。
- 仍列成員的範圍文字（§1 第 5 項末句）留給 H8 與 V42-5。
- 群組選項值用控制字元前綴（`"\u0001"`），SSR 的 HTML 含原始控制字元（解析器保留、不影響 hydration；R2 console 0 錯誤）。

## 7. 下一批

V42-2b（全部通路畫面的群組合計列：`channel-groups.ts`、G4 精簡表、通路寬表、週會摘要的 `groups` 欄位，CSV 不變；D-V42-7 可砍）。人工關卡：H8（通路設定、兩層選單、範圍文字、限制句）在 V42-2a 的 preview 上——需使用者當次同意 push `revamp/v4.2`（D-V42-26）；H9（V42-4 後）、H6（上線後）未執行／待人工。D-V42-1 的補充問題（是否已匯入過自己的多通路資料）仍待回覆。
