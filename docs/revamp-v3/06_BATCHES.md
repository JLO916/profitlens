# 06 Revamp v3 分批任務（V3-0–V3-10）

> 由 `docs/revamp-v3/01_PRD.md` §12 拆出；範圍、依賴、驗收與工作量照 PRD §12.2／§12.3 寫，PRD 有更新時以 PRD 為準並同步本檔。
>
> 每批格式：大小／範圍／依賴（含拍板與人工關卡）／驗收重點（共通驗收以外）／同批一起改的 labels 與測試／另需的人工時間。
>
> **目前進度：V3-4a／V3-4b 皆完成（2026-10-06；驗收見 `verification/revamp-v3-V3-4{a,b}-acceptance.md`），V3-0–V3-4 的 MVP 切線已到：Vercel preview 部署需使用者當次明確同意（D-V3-24）；下一批 V3-5。V3-3 完成（2026-10-06；H2 後補；驗收見 `verification/revamp-v3-V3-3-acceptance.md`）。** V3-2 全部完成（驗收見 `verification/revamp-v3-V3-2{a,b,c}-acceptance.md`）。使用者 2026-10-05 指示「先依 copy-rewrite.csv 現稿落地，審稿後再修」，H3 審稿改為落地後補做；H2 同樣改為 V3-3 落地後補審（2026-10-06）。V3-2 依 §12.1 在開工前拆成 a／b／c（見下表）。** D-V3-1–24 已於 2026-10-05 全部依建議值拍板（見 `09_DECISIONS_PENDING.md`），所以下表「依賴」欄的拍板項目都已滿足；尚未滿足的只剩前一批與人工關卡 H1–H4。

---

## 共同規則（PRD §12.1，每批都適用）

- **一次只做一批，不跨批；一批就是一個工作階段。** 每批結束時產品要可以運行，而且所有檢查都通過。批次太大時，要在**開工前**拆成 V3-{n}a／b 並寫進本檔，不能做到一半才拆。
- **人工關卡不屬於任何批次**：批次驗收只放機器能檢查的項目。人工關卡沒完成時，`docs/STATUS.md` 寫「未執行／待人工」，不可寫成完成。
- **拍板規則**：沒有明確回覆就不視為核准；受影響的批次不開工，或只做不受影響的部分，拍板前沿用 v2 的行為與用詞。修正 v2 既有決策（D-V3-1、D-V3-2）與部署（D-V3-24）一律要使用者明確同意。（2026-10-05 已全部依建議值拍板；每次實際部署仍要當次同意。）
- **允許新增依賴：無。** 瀑布圖、bullet 細條、sparkline 都用既有的 Recharts 3.10.1 或 inline SVG。
- **財務核心禁區**：`src/domain/*`、`fixtures/golden`、`fixtures/demo`、`fixtures/errors`、`fixtures/refund_only`、`fixtures/zero_ad`、`metric_version = contribution-v1`、`docs/METRICS.md` 的公式，V3-0 到 V3-8 完全不動；V3-9 只允許白名單內的「新增」（見 V3-9）。
- **共通驗收**（每批都要全部跑，貼真實輸出摘要；沒執行的寫「未執行」＋原因）：
  1. `npm ci`（lockfile 變動時）、`npm run typecheck`、`npm run lint`（含 `npm run audit:ui`、`npm run contrast-check`）、`npm test -- --run`、`npm run build`、`npm run test:e2e`（四個視窗）。
  2. 四尺寸截圖（1440×1000、1280×900、768×1024、390×844）各至少一張，存到 `verification/revamp-v3/V3-{n}/`，命名沿用 v2（例如 `1-overview-desktop-viewport.png`）。
  3. Lighthouse Accessibility：不低於 V3-0 同頁基準，且 ≥ 95（本機 production build，1440 與 390）；四尺寸 axe 0 個 serious；並記錄 Performance。
  4. `design-lint` 棘輪值不上升；testid 基準刪除數 0；`mounted-testids` 通過（V3-3 起）；`verification/revamp-v3/feature-retention.csv` 逐列打勾。
  5. 禁區 diff：`git diff --stat 82b70df -- src/domain fixtures/golden fixtures/demo fixtures/errors fixtures/refund_only fixtures/zero_ad docs/METRICS.md`（或 tag `v2.0.0`）的結果寫進驗收文件；除了 V3-9 白名單內的新增以外必須為空。**不可用 `main` 比對**。
  6. 更新 `docs/STATUS.md`（寫真實結果）；必要時在 `docs/DECISIONS.md` 記一筆；驗收寫在 `verification/revamp-v3-V3-{n}-acceptance.md`。
- 回報格式沿用 `CLAUDE.md` 的「每批回報格式」。
- P2 項目（F17、F19–F21）不排進主線。某批提前完成時，可以在**同一批範圍內**做相關的 P2（例如 V3-5 順手做 F17 sparkline），但要在該批驗收文件中註明。

---

## 人工關卡（不屬於任何批次）

| 關卡 | 內容 | 擋住 | 估計人工時間 | 材料 |
|---|---|---|---|---|
| H1 | v2 基準的 5 人可用性測試與外部盲評（用 V3-0 產出的腳本、問卷與招募清單） | V3-10 的前後對照（**不擋 V3-1**） | 3–5 個工作天（招募與排程）＋盲評 1 天 | `docs/revamp-v3/usability-test.md` |
| H2 | V3-1 產出的靜態設計稿審查（2–3 位台灣電商經理人＋1 位設計者） | V3-3 開工 | 2–3 個工作天 | `verification/revamp-v3/mockups/` |
| H3 | `docs/revamp-v3/copy-rewrite.csv` 審稿，並做紙本用語測試（D-V3-2、D-V3-14） | V3-2 開工 | 約半天 | `copy-rewrite.csv`、紙本用語測試材料 |
| H4 | v3 的 5 人複測與外部盲評（同 H1 腳本） | v3.0.0 正式上線（V3-10 的 §2.3 A 指標由 H4 結果補上） | 3–5 個工作天＋盲評 1 天 | `docs/revamp-v3/usability-test.md` |

---

## 批次總表與 MVP 切線（PRD §12.3）

| 批次 | 主題 | 大小 | 依賴 | 另需的人工時間 | 狀態 |
|---|---|---|---|---|---|
| V3-0 | 基準與護欄（不改任何 UI） | M | — | H1：3–5 工作天＋盲評 1 天 | **完成（2026-10-05）** |
| V3-1 | Token、基礎元件與設計稿審查 | L | V3-0；D-V3-7、9 | H2：2–3 工作天 | **完成（2026-10-05）**；設計稿已交 H2 |
| V3-2 | 語言與數字格式 | L | V3-1；D-V3-1–6、8；**H3** | H3：約半天 | 未開始 |
| V3-2a | 語言落地：copy-rewrite.csv 現稿落地（reworded／renamed／split／moved-to-technical；removed 列待該元素移除的批次再處理）、占位符搬移的呼叫端、JSX 硬編碼中文清零、`importErrors` 句型與 `{file}`／`{column}`／`{value}` 接線（§7.7.3）、`import-errors-copy`／`reason-code-labels` 測試、F23「這版改了什麼」提示、名詞小辭典與舊名搜尋（F5）、copy-style 棘輪歸零、`labels-coverage` 延伸到全部元件、`copy-density` 延伸到五頁、所有受改名影響的單元與 E2E 斷言改用 labels | L | V3-1；D-V3-1–6；H3 改為落地後補審 | — | **完成（2026-10-05）** |
| V3-2b | 數字格式：三層尺度（L1 萬／億、L2 整數元、L3 到分）、HALF_UP、U+2212、`favorableDirection`，只改 `presentation.ts`／`copy.ts` 並接到所有元件與匯出；formatter 單元測試（含 −32.0%、−14.3 個百分點）；數字斷言改成格式化函式輸出 | L | V3-2a | — | **完成（2026-10-06）** |
| V3-2c | labels 結構重整（§8.10 依頁面›區塊›元件分組、`{headline, explain?, caution?, technical?}` 形狀、舊 key alias 到 V3-10）；刪除 R2「由盤點產生」區段與 split 繞道取字；刪除舊格式函式（ASCII 負號）與無引用 key | M | V3-2b | — | **完成（2026-10-06）** |
| V3-3 | 殼層與導覽 | M | V3-2；**H2**；D-V3-10、14 | — | **完成（2026-10-06；H2 後補）** |
| V3-4 | 經營總覽（**MVP 切線**） | L | V3-3；D-V3-11、13 | 內部走查半天 | **開工前拆成 V3-4a／V3-4b（2026-10-06）：V3-4a 完成（2026-10-06，驗收見 `verification/revamp-v3-V3-4a-acceptance.md`）、V3-4b 完成（2026-10-06，驗收見 `verification/revamp-v3-V3-4b-acceptance.md`）；MVP 切線已到，preview 部署待使用者當次同意** |
| **MVP 切線** | V3-0–V3-4，至少 5 個工作階段 | | 完成後**經使用者當次明確同意**（D-V3-24＝A）才部署成 Vercel preview，讓老闆試用新首屏；正式站到 V3-10 才切 | | |
| V3-5 | 通路健檢、商品毛利、計算與來源抽屜 | M | V3-4；D-V3-3 | — | **下一批** |
| V3-6 | 假設試算與待辦 | M | V3-5；D-V3-12 | — | 未開始 |
| V3-7 | 會議紀錄與匯出 | M | V3-6 | 匯出檔人工檢查半天 | 未開始 |
| V3-8 | 資料來源、匯入精靈、空狀態 | M | V3-7 | — | 未開始 |
| V3-9 | P1 新增功能 | L | V3-8；D-V3-16、17、19、20、23 | 視 F15、F16 的檔案 | 未開始（可整批延到 v3.1） |
| V3-10 | 上線檢查 | M | V3-9（若 V3-9 延期，依賴 V3-8） | H4：3–5 工作天＋盲評 1 天 | 未開始 |

總計 11 批、至少 11 個工作階段（L 級批次可能在開工前拆成 a／b）；另需約 2.5–3.5 週的人工時間（兩輪 5 人可用性測試、兩輪外部盲評、一次設計稿審查、`copy-rewrite.csv` 審稿，加上招募與等待）。時間不夠時，V3-9 可整批延到 v3.1，不影響「簡明、專業、不砍功能」三個目標。

---

## V3-0 基準與護欄（M；不改任何 UI）

**範圍**
1. 5 人可用性測試與外部盲評的腳本、問卷、招募清單（PRD §2.3 A、§3.4）→ `docs/revamp-v3/usability-test.md`。量測本身是人工關卡 H1，STATUS 寫「未執行／待人工」。打 tag `v2.0.0`（指向 `82b70df`）。
2. `scripts/ui-audit.mjs`、`scripts/contrast-check.mjs`、`tests/design-lint.test.ts`（上限記在 `tests/fixtures/design-lint-ceiling.json`）、`tests/copy-style.test.ts`；上限＝v2 實測值；`package.json` 新增 script `audit:ui`、`contrast-check`（不加依賴）。
3. `verification/revamp-v3/testids-v2.txt`（129 個靜態 testid，含三元運算式與 `testId` 屬性來源，樣板展開成實際渲染值）＋`tests/testid-baseline.test.ts`；為 v2 沒有 testid 的保留功能補屬性：`page-import`、`actions-export-{format}`、`threshold-form-overview`、`threshold-form-meeting`、`meeting-create`、`meeting-scenario-select-{channel}`（只加屬性，畫面零變化）。
4. `verification/revamp-v3/feature-retention.csv`（用 testid 或函式名定位；欄位「# | 功能 | v3 位置 | 變更類型 | testid | 覆蓋的測試檔:測試名」）、`verification/revamp-v3/backup-schema-v4.json`（含 `ui_prefs` 欄位）、完整下載入口清單（PRD §6.5，用 grep `downloadText`／`download=`／`printCurrentView` 產出，含條件項）、`verification/revamp-v3/e2e-text-assertions.csv`（含 `locator()` 選擇器）。
5. `toHaveScreenshot` 四尺寸基準。
6. `docs/revamp-v3/copy-rewrite.csv`（欄位：key、v2 文案、v3 L1、v3 L2、v3 L3、對應規則、需拍板代號）與紙本用語測試材料，送人工審（H3）。
7. 基準量測：First Load JS、首屏位置、內容前控制項數（PRD §2.3 B 口徑）、含稅匯入點擊數、Lighthouse a11y／Performance（示範資料已載入的 5 頁，1440 與 390）→ `verification/revamp-v3/V3-0-baseline.md`。
8. 把 PRD §13.2 的拍板清單交給使用者 → `docs/revamp-v3/09_DECISIONS_PENDING.md`（2026-10-05 已全部依建議值拍板）。
9. v3 文件套件：`00_README.md`、本檔、`09_DECISIONS_PENDING.md`、`GLOSSARY.md`、`usability-test.md`；CLAUDE.md 改成 Revamp v3 的工作規則（使用者 2026-10-05 同意依 PRD 開工）。

**依賴**：無。

**驗收重點**：畫面零變化（`toHaveScreenshot` 差異 0）；基準報告 `verification/revamp-v3/V3-0-baseline.md`；所有新測試通過。

**同批 labels 與測試**：不改 labels；新增上述測試。

**內容前控制項數的 v3 目標**：PRD 暫定 ≤ 12（匯出本頁 1＋期間列 7＋複製週會摘要 1＋會議連結 1＝10）。V3-0 依 §2.3 B 口徑量到 v2 基準後重算，結果寫在這裡：
- v2 基準：13 個可聚焦元素（1440 與 390 相同；PRD 口徑：`main` 內、第一個 `kpi-*` 之前、可見且可聚焦；Tab 按鍵計為 25）
- v3 目標：≤ 10（v3 版面預計 10 個：匯出本頁 1＋期間列 7＋複製週會摘要 1＋會議連結 1；V3-0 實測 v2 基準為 13 個可聚焦元素（PRD 口徑），若以 Tab 按鍵計為 25，因為每個日期欄位有年月日三段；見 `verification/revamp-v3/V3-0-baseline.md`）

**另需的人工時間**：H1 約 3–5 個工作天（招募與排程）；盲評 1 天。

---

## V3-1 Token、基礎元件與設計稿審查（L）

**範圍**：`:root` 全部 token（PRD §9.1–9.3）；字級、字重、字距收斂；C3、C4、C5、C8、C10、C11、C12、C14、C15、C21、C22 的 class；既有 class 改成引用 token；刪除 eyebrow 字距、`.button-row` 置中、`.kpi-card.featured` 深色底；`.nav-dot`、`.green-dot`、`.empty-illustration` 只把樣式中性化（例如 display:none 或改用 token，`.empty-illustration` 去掉裝飾性 rotate(-4deg)），**JSX 不動**，class 留到 V3-3（`.nav-dot` `dashboard.tsx:511`、`.green-dot` `:512、:520`）與 V3-8（`.empty-illustration` `:580`）連同 JSX 一起刪；`@keyframes spin` 與 disclosure 指示的 rotate 保留。**不改版面與文案。** 另外產出總覽、抽屜、會議三頁的靜態設計稿（用 token 做的 HTML，放在 `verification/revamp-v3/mockups/`，不進 app bundle），交給人工關卡 H2 審查。

**依賴**：V3-0；D-V3-7（A：只有不利上色）、D-V3-9（A：沿用 `#1f5a4f`）。

**驗收重點**：hex ≤ 60、圓角 3 種（4px、6px、999px，外加 0）、字級 ≤ 8（12/13/14/16/20/24/28/32，全部 `var(--*)`）、字距 0；`contrast-check` 全過；截圖對照 v2 只有樣式差異；設計稿已產出（H2 審查通過才能開始 V3-3，不是 V3-1 的完成條件）。

**同批 labels 與測試**：樣式相關的 E2E 斷言（顏色、class）。

**另需的人工時間**：H2 設計稿審查 2–3 個工作天。

---

## V3-2 語言與數字格式（L）

**範圍**：labels 結構重整與舊 key alias（PRD §8.10）；名詞表依拍板結果落地（`docs/revamp-v3/GLOSSARY.md`）；刪除箭頭、「注意：」、圈數字、全大寫 eyebrow、主層的「｜」；三層尺度格式化函式與 `favorableDirection`，並接到所有元件；硬編碼中文清零；`importErrors` 的句型與占位符（§7.7.3）；「這版改了什麼」提示（F23）；名詞小辭典與舊名搜尋。

**依賴**：V3-1；D-V3-1–6、D-V3-8（已拍板）；**人工關卡 H3**（`copy-rewrite.csv` 審稿與紙本用語測試）。

**驗收重點**：copy-style 全部為 0；JSX 中文 0；formatter 單元測試（含 −32.0%、−14.3 個百分點）；`import-errors-copy`、`reason-code-labels` 通過；`copy-density` 的否定句計數延伸到會議、資料來源頁（上限 3）；golden 不變；export 測試依 §6.5 的格式別允許差異比對（本批只有標籤差異）。

**同批 labels 與測試**：`tests/manager-language.test.ts`、`tests/export.test.ts`、`tests/copy.test.ts`、`tests/import*.test.ts`、`tests/e2e/*.spec.ts` 中所有受改名影響的斷言，全部改成 import labels 與格式化函式。

**另需的人工時間**：H3 約半天（在本批開工前）。

---

## V3-3 殼層與導覽（M）

**範圍**：頂欄單列（資料狀態 popover、AI 精簡、儲存三段、匯出分組）；側欄分組與計數徽章；頁首 56px；期間列單列與自訂期間 popover；需要處理橫幅；手機底部分頁列與期間底部面板；頁尾；清空移到危險區；匯入入口搬移；刪除 `.nav-dot`、`.green-dot` 的 JSX 與 class；`.scope-note` 併入 `period-summary`。

**依賴**：V3-2、**人工關卡 H2**；D-V3-10（A：快捷直接套用）、D-V3-14（A：看結果／找原因／做決定／管資料）。

**驗收重點**：1280 頂欄單列（高 48px）；內容前控制項 ≤ 12（以 V3-0 重算值為準）；390 首屏可見第一個數字；匯入路徑 ≤ 2 次點擊；PRD §6.3 #1–#23 的 testid；選單鍵盤與回焦 E2E；`design-lint` hex ≤ 30。

**同批 labels 與測試**：期間列、頂欄、導覽相關的 E2E（快捷套用行為若改，在本批一次改完）；`.scope-note`、`.sidebar .tiny-tag` 等 locator 斷言改用 testid（revamp-r1-layout、revamp-r2-copy、period-comparison、manager-presentation）；匯入相關 E2E 改用 `page-import`／`data-status-import`：`import-wizard-helpers.ts`、`import-wizard.spec.ts`（點擊數基準：非資料來源頁從 1 次變 2 次）、`revamp-r4.spec.ts`、`manager-presentation.spec.ts`；新增 `tests/mounted-testids.test.tsx`，加入殼層與 M6 唯一性（本批起每批都跑）。

---

## V3-4 經營總覽（L；MVP 切線）

**範圍**：本期一句話與複製週會摘要（F1）；KPI 帶（C1）；三件事警示列（C9）；橋接瀑布、橋接表與平衡檢核（F3、C17）；四層利潤瀑布（F2）；趨勢與通路圖的規格（C16）；其他常用指標表（C2）；進階區；C1、C9、C16–C18 的 class。

**依賴**：V3-3；D-V3-11（A：四層順序，扣廣告後 32px＋強調線）、D-V3-13（A：週會摘要預設內容）。

**驗收重點**：1440 首屏位置（PRD §2.3 B：結論句頂端 ≤ 176px；5 個 KPI 底邊 ≤ 420px；`top-three` 第 1 列標題底邊 ≤ 1000px）；390 `kpi-contribution_after_marketing` 數值頂端 ≤ 360px；瀑布加總到分；一句話 5 種情境的單元測試；CLS < 0.05；PRD §6.3 #24–#32 的 testid；內部 2 人的 10 秒結論率走查。

**同批 labels 與測試**：`tests/copy-density.test.ts`（總覽主層計數）、`tests/manager-language.test.ts`（三件事結構、`labels.sections.impact`、rankingNote 次數、精確值斷言）、`overview` 相關 E2E 與截圖 spec。

**另需的人工時間**：內部走查半天。完成後若要部署 Vercel preview，需使用者當次明確同意（D-V3-24）。

### V3-4 拆批（2026-10-06 開工前，依 §12.1「批次太大時在開工前拆成 a／b」）

**V3-4a 首屏與結構（M；完成 2026-10-06）**：本期一句話（`weekly-snapshot`、`snapshot-sentence`，§7.1 的 5 種情境）＋複製週會摘要（F1，§10.2：純文字與 Markdown、`copy-summary`、`copy-summary-status`、剪貼簿失敗改 textarea dialog、事件 `summary_copied`）＋會議入口搬到一句話右側（`overview-meeting-entry`）；KPI 帶（C1：5 格單一容器、扣廣告後貢獻 32px＋強調線＋1.25 倍寬、差額行方向詞、上期 number-link、目標細條 C18 與期間不符提示、`?` 定義按鈕；768 改 3＋2、390 改清單且扣廣告後貢獻放第一列）；本期三件事改 C9 摘要型警示列（狀態標籤、L1 標題、影響金額、看明細／加入待辦、第二行 L2 解讀常駐、限制與相關範圍收進列內「更多」、「調整門檻」popover 保持掛載、不足 3 件與 0 件的句型、「查看全部 {n} 項健檢結果」）；其他常用指標改 C2 兩欄緊湊表（本期、上期皆 number-link，不加差額欄；廣告預算達成放「廣告佔淨營收」列下方）；進階 `<details>`（期間合計與日均；保留 `period-comparison` 與 `#daily-average-title`）；區塊順序依 §7.1（一句話 → KPI 帶 → 三件事 → 拆解 → 趨勢 → 各通路 → 其他常用指標 → 進階）；C1、C9、C2 的 class 與 v2 `.kpi-grid`／`.kpi-card`／`.assist-card`／`.filter-bar`／`.preset-row`／`.scope-note`／`.preset-reason`／`.alert.partial` 等無用 CSS 清理；labels 新分組 `overview.snapshot`、`overview.kpiBand`、`overview.alerts`、`overview.assistTable`、`overview.advanced`、`summary.weekly`；單元測試（一句話 5 種情境、週會摘要純文字＋Markdown 快照、KPI 帶、警示列、緊湊表；`copy-density`、`manager-language`、`overview-format`、`mounted-testids` 同步）；E2E 與截圖 spec 遷移；§2.3 B 首屏量測（結論句頂端 ≤ 176px、5 個 KPI 底邊 ≤ 420px、`top-three` 第 1 列標題底邊 ≤ 1000px；390 扣廣告後貢獻數值頂端 ≤ 360px）。**圖表區塊（趨勢、拆解、各通路）維持 v2 版面不動。**

**V3-4b 圖表（M；完成 2026-10-06）**：貢獻變化拆解瀑布（C17）＋橋接表＋平衡檢核（`bridge-waterfall`、`bridge-table`、`bridge-balance-check`、結論句標題）；本期利潤結構四層瀑布（F2，§10.3：`profit-waterfall`、`profit-waterfall-scope`、`profit-waterfall-bar-{metric}`、資料表、資料待補虛線框）；趨勢與各通路改 ChartFrame（C16：結論標題、takeaway 列「期間合計／最近完整週」、圖例線段、最後一點標值、缺資料斷線、檔期區帶、四態等高、1280 上下排列）；`src/application/chart-theme.ts`（圖表色由 token 讀取）；事件 `waterfall_clicked`；瀑布九項加總到分與四層恆等式的單元測試；切換期間 CLS < 0.05 的 E2E。

---

## V3-5 通路健檢、商品毛利、計算與來源抽屜（M）

**範圍**：健檢警示列與計數徽章；通路寬表欄序、排序與手機清單；AI 區收合；商品頁工具列與前 10 名表；表格密度切換（F18）；抽屜重排（標題、精確值、指標定義段、原始明細）；C3 手機清單、C6。

**依賴**：V3-4；D-V3-3（A：抽屜「計算與來源」、按鈕「看明細」）。

**驗收重點**：PRD §6.3 #33–#36、#55 的 testid；抽屜 h2 規則；手機表格 axe 通過；`design-lint` hex ≤ 10。

**同批 labels 與測試**：`diagnosis-list`、`evidence` 相關的單元與 E2E 測試；`tests/manager-language.test.ts`（健檢主層斷言，例如 `270.00`）；`.evidence-body > .number`、`details.diagnosis-row` 等 locator 斷言。

---

## V3-6 假設試算與待辦（M）

**範圍**：試算方案欄並排（不用分頁）、精簡表單、placeholder 與條件提示、範本說明 popover；待辦卡片精簡、「移到」文字按鈕列、待辦編輯抽屜（三段，不用分頁）、空狀態；C13。

**依賴**：V3-5；D-V3-12（B：同一工作區勾一次就記住，寫入備份）。

**驗收重點**：PRD §6.3 #37–#42 的 testid；試算 golden 不變（284.00／264.00／19.70）；看板鍵盤流程；首次進入可見控制項 ≤ 14；從範本到結果 3 個動作。

**同批 labels 與測試**：`decision.test.ts`、`action-board.test.ts`、試算與待辦的 E2E（抽屜開啟路徑）。

---

## V3-7 會議紀錄與匯出（M）

**範圍**：會議頁文件式版面、頁首動作列、結束標示、議程 `<ol>` 與精簡摘要（議程 5 保留選入 select）、會議門檻與總覽門檻維持兩份 state；A4 列印版頭與匯出版頭（§7.9）；頂欄匯出選單內容與各頁「匯出本頁」頁內下拉串接完成；export-theme（§9.6）。

**依賴**：V3-6；D-V3-8（A：括號負數用在列印、PDF、Excel 管理損益表）、D-V3-22（A：舊紀錄加註、介面用新名詞渲染）。

**驗收重點**：PRD §6.3 #43–#50、#16 的 testid；PDF 頁數不增加；各格式匯出內容依 §6.5 的格式別允許差異正規化比對；PPT、Excel 開檔人工檢查並截圖；V3-0 完整下載入口清單逐項在 v3 至少有一個入口。

**同批 labels 與測試**：`meeting-page.test.tsx`、`manager-summary.test.ts`、`tests/manager-language.test.ts`（議程與門檻斷言）、`tests/export.test.ts`（改成正規化比對）、`excel-export.test.ts`、`pptx-export.test.ts`、會議 E2E。

**另需的人工時間**：匯出檔人工檢查半天。

---

## V3-8 資料來源、匯入精靈、空狀態（M）

**範圍**：資料來源頁重排（問題表移到第二段、主次按鈕依是否有資料切換）、前處理表格化、版本與來源資訊彙整、範本 3×3 表；匯入精靈全版模式、步驟 2／3 收合、stepper（C20）；全站空狀態與骨架等高（C10）；刪除 `.empty-illustration` 的 JSX 與 class。

**依賴**：V3-7。

**驗收重點**：PRD §6.3 #51–#54 的 testid；匯入 E2E；含稅匯入點擊數 ≤ v2（V3-0 基準）；CLS < 0.05；`design-lint` hex = 0（token 定義區 ≤ 48 個）。

**同批 labels 與測試**：`import-wizard.test.ts`、`import-guidance.test.ts`、匯入 E2E。

---

## V3-9 P1 新增功能（L；可整批延到 v3.1）

**範圍**：F8 三線趨勢、F9 管理損益表（D-V3-19＝A：總覽「進階」`<details>`）、F10 圖表下鑽、F12 損益兩平 MER（D-V3-17＝C：實作在 `src/application`，獨立版本 `breakeven-mer-v1`＋手算 golden）、F13 廣告決策標籤（備份 v5＋遷移）、F14 匯出變體、F22 投影模式（D-V3-23＝A）；F15 台灣化示範資料（D-V3-20＝A，需使用者提供商品與檔期設定）；F16 在取得檔案時做。F11 目標三態**本輪不做**（D-V3-16＝A，#25 已在 V3-4 提供實際／目標／差額＋細條）。

**依賴**：V3-8；D-V3-16、17、19、20、23（已拍板）。

**禁區白名單（只允許新增）**：
- `fixtures/demo_tw/**`（F15 新 fixture，附獨立手算 expected）。
- `src/domain`：**無**（D-V3-17＝C，F12 在 `src/application`）。只有確定必須進 `src/domain` 時，才另列要新增的檔案與函式簽名，由人拍板後補進本白名單。
- 既有 7 個輔助指標維持 `assist-kpi-v1`，輸出不變。

**驗收重點**：每項新增計算都有獨立手算 golden；禁區 diff 只有白名單內的新增；`assist-kpi-v1` 的既有輸出不變；備份 v1–v5 還原測試。

**同批 labels 與測試**：`assist-kpi.test.ts`（新增案例）、`action-backup.test.ts`、新功能的 E2E。

**另需的人工時間**：視 F15、F16 的檔案。

---

## V3-10 上線檢查（M）

**範圍**：整理人工關卡 H4（5 人可用性複測與外部盲評，同 H1 腳本）的結果；Lighthouse（正式站 1440、390）；四尺寸走查與鍵盤走查；v1–v5 備份還原；網路紀錄（確認沒有資料外送）；沿用 R7 的 13 項 HTTP 上線檢查；移除 labels 舊 key alias；版本 3.0.0；RELEASES（含破壞性變更：Excel 工作表改名）、README、`docs/STATUS.md` 收尾。

**依賴**：V3-9（若 V3-9 延期，依賴 V3-8）。切正式站需使用者當次明確同意（D-V3-24）。

**驗收重點**：PRD §2.3 B、C 全部指標達標；§2.3 A 由人工關卡 H4 補上，未完成時 STATUS 寫「未執行／待人工」；沒達標的項目與原因誠實列出；Lighthouse a11y 不低於 V3-0 同頁基準且 ≥ 95。

**同批 labels 與測試**：刪除 alias 後的全套測試。

**另需的人工時間**：H4 5 人複測 3–5 個工作天；外部盲評 1 天。

---

## design-lint 棘輪時程（PRD §2.3 B）

| 指標 | v2（以 V3-0 `ui-audit` 實測為準） | V3-1 | V3-2 | V3-3 | V3-5 | V3-8 |
|---|---|---|---|---|---|---|
| 寫死色碼（`:root` 以外＋`src/components/**/*.tsx`＋`src/components/**/*.css`） | 口徑內合計約 201（`globals.css` 單檔 189） | ≤ 60 | 不上升 | ≤ 30 | ≤ 10 | 0（token 定義區 ≤ 48） |
| 相異圓角 | 18 | 3 種＋0 | 不上升 | 不上升 | 不上升 | 不上升 |
| 相異字級 | 21 | ≤ 8 | 不上升 | 不上升 | 不上升 | 不上升 |
| 非 0 字距 | ≥ 5 | 0 | 0 | 0 | 0 | 0 |
| labels 文案違規（copy-style） | V3-0 實測 | 不上升 | 0 | 0 | 0 | 0 |
| JSX 硬編碼中文 | V3-0 實測 | 不上升 | 0 | 0 | 0 | 0 |
| testid 刪除數 | 0 | 0 | 0 | 0 | 0 | 0 |
