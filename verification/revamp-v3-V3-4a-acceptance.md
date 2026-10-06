# Revamp v3 V3-4a 驗收：經營總覽首屏與結構（2026-10-06）

依 `docs/revamp-v3/06_BATCHES.md`「V3-4 拆批」的 V3-4a 範圍與 PRD §7.1（區塊 2、3、4、9、10）、§10.2（F1）、§9.4（C1、C2、C9、C12、C18）、§2.3 B（首屏）、§8.2（句型）執行。V3-4 為 L 級批次，依 §12.1 於開工前拆成 V3-4a（首屏與結構）／V3-4b（圖表）；本批**圖表區塊（趨勢、拆解、各通路）維持 v2 版面不動**。拍板：D-V3-11＝A（四層順序，扣廣告後貢獻 32px＋強調線）、D-V3-13＝A（週會摘要預設內容）、D-V3-7＝A（只有不利上色）、D-V3-15（事件 `summary_copied`）。`src/domain`、`fixtures`、`docs/METRICS.md`、`.env*`、`vercel.json` 零改動；無新依賴。

## 1. 完成項目（對照 06_BATCHES V3-4a）

| 項目 | 狀態 | 說明 |
|---|---|---|
| 本期一句話（`weekly-snapshot`、`snapshot-sentence`，5 種情境） | 完成 | `src/application/weekly-summary.ts` `snapshotSentence`：PRD 的 5 種情境（淨營收多且扣廣告後少、兩者都多、兩者都少、上期 ≤ 0 的由負轉正／轉為虧損、資料待補）＋ 2 種補充（淨營收少且貢獻多、任一差額取位後為 0 的「持平」句）；模板在 `labels.overview.snapshot.sentence.*`；數字全部來自既有 snapshot（compareMoney、diagnosisGroups），句中金額不做 number-link；下方範圍行「本期 7/13–8/23 · 全部通路 · 金額未稅」。偏離：「最大一項是{top}」取三件事中第一個費用或通路項目（跳過與本句重複的「淨營收多…卻少賺…」與資料缺漏），golden 因此不重複，示範資料與 PRD 範例逐字相同 |
| 複製週會摘要（F1：純文字＋Markdown、`copy-summary`、`copy-summary-status`、剪貼簿失敗改 textarea dialog、`summary_copied`） | 完成 | `buildWeeklySummary` 依 §10.2：版頭（週會摘要／資料集名／期間行）、三行關鍵數字（方向詞＋L1 絕對值＋成長率；上期 ≤ 0 不附成長率；貢獻率「降 N 個百分點」）、本期三件事（最多 3 項「{n}. {headline}：{nextStep}」；不足 3 件「本期要先看的事（n 件）」）、待辦（未完成數＋置頂最多 3 項）、資料到＋來源句；Markdown 版 `##`／`-`、負號 U+2212、使用者文字跳脫；資料待補時第 4–6 行改成 missing 句。按鈕寫入 `navigator.clipboard`，成功時 `role=status` 顯示「已複製週會摘要。」2 秒後清空（reduced-motion 不淡出）並 `track("summary_copied")`；失敗時開 `copy-summary-fallback` dialog（textarea 全選、Esc／關閉回焦）。期間行全選通路時寫「全部通路」（與期間列同字） |
| 會議入口搬到一句話右側（`overview-meeting-entry`） | 完成 | `MeetingEntry` 改為單一文字按鈕「會議：{state}」（可及名稱補「前往會議紀錄」）＋上次會議日期註記，由 dashboard 以 `meetingEntry` prop 放進 `weekly-snapshot`；testid 不變；舊鍵 `meeting.page.entry`／`entryFinalized` 不再引用（V3-10 清理） |
| KPI 帶（C1，含 C18 目標細條、期間不符提示、`?` 定義按鈕；768 3＋2；390 清單） | 完成 | `src/components/overview/kpi-band.tsx`：單一容器 `kpi-band` 五格（D-V3-11 順序），`kpi-*` testid 不變；扣廣告後貢獻格 `is-key`（2px 強調線、1.25 倍寬、`--num-32`），其他 `--num-28`；每格：名稱＋`?`（title＝白話定義、點開指標定義對話框）、主值 number-link（aria-label「{指標} {顯示值}，看明細」）、差額行「比上期{方向詞} {絕對值}（{±%}）」（持平／由負轉正／轉為虧損只寫方向詞；比率格「降 N 個百分點」）、上期 number-link、目標列（`kpi-target-*`；相符時 C18 細條 6px，落後改不利色）；差額待確認且有資料待補時改「先補齊 {n} 項」連到資料來源。768–1023 改 3＋2；≤767 清單：強調格第一列全寬 `--num-24`，其餘單行「名稱｜數值｜差額」。偏離：每格 padding 16px 四邊（PRD 16px 20px），1440 寬差額行才不折行 |
| 本期三件事警示列（C9 摘要型；門檻 popover 保持掛載；不足 3 件與 0 件句型；查看全部） | 完成 | `top-three.tsx`：`li.alert-row[data-testid=overview-priority-{rule}]` 內 `<details class="alert">`（summary：chevron、狀態標籤 資料待補／不利／有利（`ui-lozenge`）、h3 L1 標題、第二行 L2「原因＋下一步」常駐；展開：限制、相關範圍（其餘範圍＋L2 影響金額）、檔期）＋同列的影響金額（`impact-amount` number-link）與看明細／加入待辦；標題列：標題（3 件「本期三件事」、1–2 件「本期要先看的事（n 件）」）、範圍一次、「依影響金額排序」＋`?` 說明 popover、「調整門檻」`<details>` popover（`threshold-form-overview`、說明、錯誤保持掛載；Esc 回焦、點外部關閉）；0 件：role=status 句＋「前往通路健檢」；底部「查看全部 n 項健檢結果」（接 `onNavigate("diagnosis")`）。偏離：互動元件不放進 `<summary>`（axe nested-interactive、與健檢清單一致），改以 CSS 格線疊在同一列；≤1023 改兩行版 |
| 其他常用指標兩欄緊湊表（C2；廣告預算達成列） | 完成 | `src/components/overview/assist-table.tsx`：`assist-kpis` 區塊、兩張 `.kv` 表（4＋3 列，順序同 assist-kpi-v1）、表頭 指標／本期／上期、`assist-{id}` 在 `<tr>`、本期與上期都是 number-link（抽屜內容同 v2）、不適用／資料待補第三色；`kpi-target-ad_spend` 放「廣告佔淨營收」列下方；標題旁 `?`（title＝既有說明句）；≤767 單欄。不加差額欄 |
| 進階 `<details>`（期間合計與日均） | 完成 | `overview-advanced`「進階：期間合計與日均」包住既有 `period-comparison`（含 `#daily-average-title`），兩層保持掛載；外層初始開合取自 periodOpen，之後各自開關 |
| 區塊順序依 §7.1 | 完成（圖表段維持 v2） | 一句話 → KPI 帶 → 三件事 → 趨勢 → 拆解＋各通路（v2 並排）→ 其他常用指標 → 進階；§7.1 的「拆解在趨勢之前、本期利潤結構、趨勢與各通路並排」留 V3-4b |
| v2 無用 CSS 清理（`.kpi-grid`、`.kpi-card`、`.assist-card`、`.filter-bar`、`.preset-row`、`.scope-note`、`.preset-reason`、`.alert.partial`） | 完成（`.alert.partial` 保留） | 刪除 `.kpi-grid`、`.kpi-card*`、`.kpi-change`、`.change-rate`、`.assist-row`／`.assist-grid`（舊七格）／`.assist-card*`、`.filter-bar*`、`.preset-row*`、`.scope-note`、`.preset-reason`、`.top-three-list`／`-head`／`-actions`／`-threshold`（`.top-three-impact`、`.impact-amount` 仍供會議摘要用）；`.alert.partial` 仍被試算頁使用所以保留；新規則只在錨點 B／C 之後、全部 token |
| labels 新分組（`overview.snapshot`、`snapshotUi`、`kpiBand`、`alerts`、`assistTable`、`advanced`、`summary.weekly`） | 完成 | 共 61 個新鍵（snapshot 10、summary.weekly 19、snapshotUi 10、kpiBand 7、alerts 9、assistTable 5、advanced 1）；copy-style 計數不變（同義詞 13、禁用詞 3）；JSX 中文 0 |
| 單元測試（一句話 5 情境、週會摘要快照、KPI 帶、警示列、緊湊表；既有測試同步） | 完成 | 新增 `tests/weekly-summary.test.ts`（17 項：7 種 kind、NoTop、門檻不合法退回、純文字＋Markdown 快照、逐行斷言、全部通路）、`tests/overview-structure.test.tsx`（區塊順序、一句話區塊、KPI 帶、緊湊表、進階、內容前控制項）、`tests/top-three-alerts.test.tsx`；同步 `overview-format`、`copy-density`、`mounted-testids`（新增總覽進階與會議入口規則）、`meeting-page`、`diagnosis-list` |
| E2E 與截圖 spec 遷移 | 完成 | 代理同批改寫 `revamp-r1-layout`（區塊順序、kpi-band、390 量扣廣告後貢獻數字、警示列影響金額）、`revamp-r4`（緊湊表、檔期改看列內）、`workspace`（.kpi-prev／.kpi-delta／可及名稱）、`revamp-r6`／`review-v2-a`（會議入口字串）、`replacement-helpers.openPeriodComparison`（先展開進階）；`verification/revamp-v3-capture/{shared,metrics.spec}` 改用 `.kpi-band` 與 `.alert-list` 選擇器 |
| 首屏量測（§2.3 B） | 完成 | 1440：一句話頂端 192px（含示範資料必有的去年同期理由列；無橫幅 168px ≤ 176）、5 個 KPI 底邊 419px（無橫幅 395px）≤ 420、三件事第 1 列標題底邊 525px ≤ 1000；390：扣廣告後貢獻數值頂端 295px ≤ 360；內容前可聚焦元素 9 ≤ 10；見 §3a 與 `verification/revamp-v3/V3-4a/metrics.json` |

## 2. 變更檔案

- 新增：`src/application/weekly-summary.ts`、`src/components/overview/assist-table.tsx`、`src/components/overview/kpi-band.tsx`、`src/components/overview/weekly-snapshot.tsx`、`tests/__snapshots__/weekly-summary.test.ts.snap`、`tests/helpers/markup.ts`、`tests/overview-structure.test.tsx`、`tests/top-three-alerts.test.tsx`、`tests/weekly-summary.test.ts`、`verification/revamp-v3/V3-4a/**`、本檔。
- 修改：`src/app/globals.css`、`src/application/analytics.ts`、`src/components/dashboard.tsx`、`src/components/meeting-page.tsx`、`src/components/overview.tsx`、`src/components/shell/shell-icon.tsx`、`src/components/top-three.tsx`、`src/i18n/labels.zh-TW.ts`、`tests/copy-density.test.ts`、`tests/diagnosis-list.test.ts`、`tests/e2e/replacement-helpers.ts`、`tests/e2e/revamp-r1-layout.spec.ts`、`tests/e2e/revamp-r4.spec.ts`、`tests/e2e/revamp-r6.spec.ts`、`tests/e2e/review-v2-a.spec.ts`、`tests/e2e/workspace.spec.ts`、`tests/meeting-page.test.tsx`、`tests/mounted-testids.test.tsx`、`tests/overview-format.test.ts`、`tests/testid-baseline.test.ts`、`verification/revamp-v3-capture/metrics.spec.ts`、`verification/revamp-v3-capture/shared.ts`、`docs/{STATUS,DECISIONS}.md`、`docs/revamp-v3/06_BATCHES.md`、`verification/revamp-v3/{feature-retention,e2e-text-assertions}.csv`。
- 零改動：`src/domain`、`fixtures`、`docs/METRICS.md`、`.env*`、`vercel.json`；圖表元件（趨勢、拆解、各通路）的 JSX 只把 Recharts `fontSize: 12` 改成 `var(--text-12)`。

## 3. 驗收命令與真實結果

| 命令 | 結果 |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | 0 warnings |
| `npm test -- --run` | **93 檔／1,925 測試全過**（V3-3：90 檔／1,879；新增 weekly-summary 17、overview-structure、top-three-alerts） |
| `npm run lint:design` | exit 0；hex 0、圓角 4、字級 13（KPI 主值用 `--kpi-num` 指到既有 token、Recharts `fontSize` 改引用 `--text-12`）、字距 0、JSX 箭頭 4、裝飾 0；labels 同義詞 13／禁用詞 3 不變；對比 75／75 |
| `npm run build` | pass（由 `test:e2e` 的 webServer 建置） |
| `npm run test:e2e` | 第一輪 **589／596**（20.0 分；7 項全是 spec 跟進：KPI 帶按鈕的可及名稱 ×4 視窗、390 非強調格隱藏「上期」×1、AI spec 連續切通路的時序競態 ×2）；spec 修正後最終全套 **596／596 全過（16.3 分，四尺寸）** |
| 畫面基準 | `verification/revamp-v3/V3-4a/snapshots/{desktop,laptop,tablet,mobile}/01–09` 共 36 張（`CAPTURE_BATCH=V3-4a … --update-snapshots`），重跑 **4/4、0 差異**；總覽首屏與全頁為本批改版，其餘頁面與 V3-3 相同 |
| Lighthouse（示範資料已載入，1440 與 390） | 五頁 Accessibility **100／100**（`verification/revamp-v3/V3-4a/lighthouse/flow-*.html`）；空狀態 Performance desktop 100／mobile 97（V3-3：100／98）；總覽頁 0 個失敗的無障礙稽核（KPI 帶與緊湊表的可及名稱都包含可見文字）；不計分的 `label-content-name-mismatch` 仍只在健檢與會議頁（V3-0 起既有，留 V3-5／V3-7） |
| 禁區 diff（對 82b70df） | 空 |
| testid 基準 | 刪除數 0；新增 weekly-snapshot、snapshot-sentence、copy-summary、copy-summary-status、copy-summary-fallback（只在剪貼簿失敗時渲染）、kpi-band、overview-advanced；`overview-priority-{rule}` 改掛在 `li.alert-row` |

### 3a. 首屏驗收（PRD §2.3 B；示範資料、新訪客、拒絕保存、無橫幅）

| 指標 | 目標 | 實測 |
|---|---|---|
| 1440×1000 `snapshot-sentence` 頂端 | ≤ 176px | **192px（含示範資料必有的「去年同期不可用」橫幅 24px＝16px 理由列＋上下間距）；無橫幅時 **168px**（以 `display:none` 隱藏 `.needs-attention` 後實測）**（§2.3 B 的量測狀態寫「沒有 C22 橫幅」，但示範資料從 6/1 起、去年同期永遠不可用，該理由列屬於 needs-attention 插槽） |
| 1440×1000 5 個 `kpi-*` 底邊 | ≤ 420px | **419px**（含橫幅；無橫幅 **395px**；V3-0 基準 563.6px） |
| 1440×1000 `top-three` 第 1 列標題底邊 | ≤ 1000px | **525px**（第 1 列底 561px） |
| 390×844 `kpi-contribution_after_marketing` 數值頂端 | ≤ 360px | **295px**（V3-3：224px 為卡頂；V3-0 基準 1,066px） |
| 內容前可聚焦元素（1440，PRD 口徑） | ≤ 10 | **9**（期間列 7＋複製週會摘要 1＋會議入口 1；PRD 預估的「匯出本頁」尚未加入；Tab 停駐 9；V3-3：7） |
| 任一頁到匯入精靈 | ≤ 2 次點擊 | 2（資料來源頁 1）；含稅匯入最少點擊 6（同 V3-3） |

## 4. 瀏覽器驗收

- 四尺寸截圖 `verification/revamp-v3/V3-4a/snapshots/`（desktop／laptop／tablet／mobile × 01–09）。肉眼核對 1440、768、390 的總覽首屏：一句話「淨營收多 170.9 萬，扣廣告後貢獻卻少賺 59.9 萬；最大一項是折扣多花 118.8 萬。」＋範圍行＋「複製週會摘要」＋「會議：草稿」；KPI 帶五格（扣廣告後貢獻 32px＋強調線、差額「比上期少賺 59.9 萬（−32.0%）」只有不利上色、上期連結）；三件事三列（不利標籤、標題、影響金額、看明細／加入待辦、第二行原因＋下一步）、底部「查看全部 6 項健檢結果」；768 寬 KPI 帶 3＋2、警示列兩行版；390 寬一句話兩行、扣廣告後貢獻全寬放大、其餘四項單行、三件事堆疊。與設計稿 `mockups/overview.html` 一致。
- 複製週會摘要：代理 B 以 headless Chromium 實測成功路徑（role=status「已複製週會摘要。」2 秒後清空）與失敗路徑（剪貼簿被拒 → 對話框、textarea 全選、Esc 回焦）；E2E 未另加剪貼簿測試（Playwright 需授權剪貼簿，留 V3-10 H4 走查）。

## 5. 已知限制與偏離

- 首屏：示範資料的「去年同期不可用」理由列永遠出現在 needs-attention 插槽，1440 量到一句話頂端 192px（無橫幅 **168px**（以 `display:none` 隱藏 `.needs-attention` 後實測））；§2.3 B 的 ≤ 176px 以無橫幅口徑成立。KPI 底邊 419px 含橫幅仍在 420px 內。
- 區塊順序：拆解仍在趨勢之後、與各通路並排（v2 版面）；§7.1 的「拆解在趨勢前、本期利潤結構、趨勢與各通路並排、圖表 takeaway」全部屬 V3-4b。
- 本期一句話的「最大一項」跳過與本句重複的 `REV_UP_CM_DOWN` 與無金額的 `MISSING_CRITICAL_DATA`（示範資料與 PRD 範例相同）；補充兩種 PRD 未列的情境句（淨營收少且貢獻多、持平）。H3 補審時一併看。
- 門檻不連動：一句話與週會摘要用預設門檻（0.00），總覽「調整門檻」只影響三件事列表。
- 警示列：互動元件在 `<summary>` 之外以 CSS 疊在同一列；≤ 1023px 改兩行版（設計稿到 767 才改）；示範資料的原因＋下一步約 60 字，1440 寬一列約 72–95px（PRD 收合 64px），文案留 H3。
- KPI 帶：格內距 16px 四邊（PRD 16px 20px）；格內寬 < 180px 時隱藏可見的「比上期」（可及名稱保留）；有目標時每格多一行＋細條，不列入首屏量測。
- 週會摘要：`copy-summary` 只複製純文字版；Markdown 版已產生（`buildWeeklySummary().markdown`）但未提供入口，V3-7 匯出批次決定放在匯出選單或第二個按鈕。
- `copy-summary-fallback` dialog 只在剪貼簿失敗時渲染（不在 SSR）；`labels.meeting.page.entry`／`entryFinalized`、`labels.notes.noPriorities`／`omittedGroups`、`labels.ui.topThree.relatedScopesCount` 不再引用，V3-10 清理。
- `.alert.partial` 仍被試算頁使用，未刪；`.top-three-impact`／`.impact-amount` 供會議摘要沿用。
- E2E 第一輪 589／596：KPI 帶按鈕的可及名稱（spec 改用 labels 組名）、390 非強調格隱藏「上期」（spec 改點強調格）、AI spec 連續切通路的時序競態（spec 改等期間摘要帶新通路）；皆為 spec 跟進，非產品修正。

## 6. 下一批、人工關卡、需要拍板

- **下一批 V3-4b 圖表**（貢獻變化拆解瀑布＋橋接表＋平衡檢核、本期利潤結構四層瀑布、趨勢與各通路 ChartFrame、chart-theme、CLS）。
- **H2 後補**、**H3 補審**仍待人工（本批新增的一句話模板、週會摘要模板與警示列文案一併送審）。
- 需要拍板：無新增（本批取捨已記在 `docs/DECISIONS.md` 2026-10-06 V3-4a：最大一項的規則、KPI 格內距、警示列互動元件位置、門檻不連動；H2／H3 審查時可翻案）。
