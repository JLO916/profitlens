# 06 Revamp v4 分批任務（V4-0a–V4-11）

> 由 `docs/revamp-v4/01_PRD.md` §9 拆出；範圍、依賴、驗收與工作量照 PRD §9.1–§9.4 寫，每張圖的實作細節在 `CHART_CATALOG.md`。PRD 有更新時以 PRD 為準並同步本檔。
>
> 每批格式：大小／範圍／依賴（含拍板與人工關卡）／允許變動畫面／驗收重點（共通驗收以外）／同批一起改的 labels 與測試／相關拍板／另需的人工時間。
>
> **目前進度：V4-0a 完成（2026-10-08；驗收見 `verification/revamp-v4-V4-0a-acceptance.md`，基準見 `verification/revamp-v4/V4-0-baseline.md`）；下一批 V4-0b。** D-V4-1–35 已於 2026-10-08 全部依建議值拍板（`09_DECISIONS_PENDING.md`）；以下「擋住」清單保留作為依賴對照。擋住 V4-0a 的拍板：D-V4-1、2、3、15、23、24、25、26、27；擋住 V4-0b 的另有 D-V4-31；擋住 V4-1 的另有 D-V4-4、5、7、14、30 與人工關卡 H5（或使用者明確表示比照 v3 略過），V4-1 的 G6 另依 D-V4-33。其餘各批的擋批拍板寫在批次總表的「依賴」欄，與 `09_DECISIONS_PENDING.md` 的「影響批次」欄一致。沒有明確回覆就不視為核准，拍板前一律沿用 v3.0.0 的行為與用詞。基準：tag `v3.0.0`＝`625bfa5`；`main`＝`revamp/v2`＝`21d621c`；正式站 https://profitlens-tau.vercel.app 是 v3.0.0。
>
> 本套件寫「V4-0」時指 V4-0a、V4-0b 兩批合稱；「V4-0 實測」「V4-0 基準」都是 V4-0a 量到的 v3.0.0 值。原本的 V4-0（13 項，含 AST 掃描器、capture 與 metrics、PPT spike、合成資料、四頁兩尺寸設計稿與全套基準量測）與 V4-7（4 張圖、跨資料來源、匯入精靈、抽屜三個介面）在開工前依工作量拆成 a／b（CLAUDE.md：批次太大要在開工前拆；v3 的設計稿放在 L 級的 V3-1，不在 V3-0）。

---

## 共同規則（PRD §9.1，每批都適用）

- **一次只做一批，不跨批；一批就是一個工作階段。** 每批結束時產品要可以運行，所有檢查都通過。批次太大時，要在**開工前**拆成 V4-{n}a／b 並寫進本檔，不能做到一半才拆。依 v3 經驗，M 批約需 3 個實作代理與 3 個 E2E 代理（worktree 並行、預先做好的開工錨點、共用伺服器的 E2E 代理）。
- **元件、token、B 級函式與第一個使用它的頁面同批交付**，不在早期批次先做一堆沒人用的元件（`CHART_CATALOG.md` §9.1、§9.3）。新元件的檔案一律放 `src/components/charts/`（檔名見 PRD §6.3），C16–C18 留在 `src/components/overview/charts/`。
- **人工關卡不屬於任何批次**：批次驗收只放機器能檢查的項目。人工關卡沒完成時，`docs/STATUS.md` 寫「未執行／待人工」，不可寫成完成。
- **拍板規則**：以 `09_DECISIONS_PENDING.md` 的「決定」欄為準；沒有明確回覆就不視為核准，受影響的批次不開工，或只做不受影響的部分（例如 D-V4-33 未回覆時，V4-1 只做 G6 以外的範圍）。v3 尚待拍板的 D-V3-26／27／29–37 依 D-V4-29 的對照表處理：與圖表化相關的，只在使用者回覆後才排入對應批次（例如 D-V3-35 只在回覆 A 後於 V4-2 做；D-V3-31 回覆 B 時於 V4-3a 做；D-V3-33、34 回覆後於 V4-8 做）。**任何部署（含 Vercel preview）都要使用者當次明確同意**（D-V4-28 只定策略）。
- **允許新增依賴：無。** 圖只用 Recharts 3.10.1（新圖只用 source 已 import 的 `LineChart`、`BarChart` 與其子元件；`ScatterChart` 只在 G24 的 `*-lazy.tsx` 以 `next/dynamic` 載入）與 inline SVG；PPT 用 pptxgenjs 4.0.1 的 `addChart`（只 `bar`、`line`）或 `addShape`，不用任何圖片 API；xlsx 社群版不畫圖。
- **財務核心禁區（v4 白名單為空）**：`src/domain/*`、`fixtures/*`（含 golden、demo、errors、refund_only、zero_ad；本輪不新增任何檔，`fixtures/demo_tw` 仍待 F15）、`metric_version = contribution-v1`、`assist-kpi-v1`、`breakeven-mer-v1`、`docs/METRICS.md` 的公式，V4-0a 到 V4-11 完全不動。`assist-kpi-v1`、`breakeven-mer-v1` 的常數與算式在 `src/application`（`assist-kpi.ts:10、30-37`、`breakeven-mer.ts:10、67`），不在前兩個 diff 的路徑裡，所以「不動」寫成可驗證的範圍：這兩個檔與既有測試 `tests/assist-kpi.test.ts`、`tests/breakeven-mer.test.ts` 一個字都不改，由第 8 步第三條命令斷言（G7a 呼叫 `netRevenuePerUnit`、G5 呼叫 `breakevenMer`，只能呼叫）。新圖只重新呈現既有數字；需要產生新數值（加總、佔比、累計、計數、分階、分段）時，只在 `src/application`，每個函式一個獨立版本常數（依 D-V4-15）並有手算 golden；只排序或挑選既有值、呼叫既有函式取既有值屬 A，不加版本常數。`ratioMetric` 遇分母 ≤ 0 一律回傳 null（`src/domain/money.ts:32-35`），虧損佔比要先取反成正的虧損額。合成資料放 `tests/fixtures/synthetic-4-channel/`（依 D-V4-31），不放 `fixtures/`。
- **顯示格式只在呈現層**：萬／億、HALF_UP、U+2212、`favorableDirectionOf`、軸刻度（`formatAxisWan`）、熱表格內格式（`formatHeatCell`）只改 `src/application/presentation.ts`、`copy.ts`。測試的數字斷言改呼叫格式化函式，不改 golden 數字（本期 255.00、差額 −315.00、試算 284.00／264.00／19.70）。
- **抽屜的版本與帶號**（PRD §8.7）：只有真正新算出的值帶 B 級 `metricVersion`；直接取自 domain 的值維持 `contribution-v1`，整理函式版本放 `arrangeVersion`；累計、費用合計這類水準值帶 `valueKind: "level"`，大數字不帶正負號；`name` 只借單位時，證據自帶 `title`、`definition`、`formulaTechnical`。`arrangeVersion` 在 V4-2 加（G7a 第一次用），`valueKind` 在 V4-3a 加（G10 第一次用）。
- **標籤單一來源**：使用者看得到的中文（含 aria-label、caption、資料表 summary、Excel 工作表名、PPT 圖標題與輔助系列名、PDF 圖說）只在 `src/i18n/labels.zh-TW.ts`；新 key 只放 `V4_NEW_KEY_PREFIXES` 允許的 `{group}.chartsV4.*`（依 D-V4-26）；既有字串一字不改：`verification/revamp-v4/labels-v3.flat.json`（V4-0a 產生，v3.0.0 全部 2,581 個葉節點）逐鍵逐字相同，由 `tests/labels-structure.test.ts` 斷言（既有的 `labels-v3-2b.flat.json` 只涵蓋 v2 來的字串，V3-3 起新增的 487 個 V3 前綴字串沒有凍結值，不夠用）；每批在 labels 檔加「── V4-n 錨點：…」註解。
- **圖表護欄（V4-0a 建立，每批都跑）**：chart-lint CL-1 到 CL-11（`tests/chart-lint.test.ts`＋`scripts/lib/chart-scan.mjs`，上限 `tests/fixtures/chart-lint-ceiling.json`）；AST 規則掃 `src/components/charts/**` 與 `src/components/overview/charts/**`（CL-3 的 `var(--chart-` 字串常值禁令擴到整個 `src/components/**`，因為大多數圖的色與 testid 在呼叫端組出來）；CL-1、CL-2、CL-9、CL-11 用 SSR（頁面狀態來自 V4-0a 由 `tests/mounted-testids.test.tsx` 搬出的 `tests/helpers/page-states.tsx`，渲染七頁）；X26–X40（PRD §7.8）；每頁主層（`<details>` 外）的獨立圖區塊（`section.chart-section`）≤ 3（總覽 4 例外，CL-9）；每張圖有資料表替代（C33 或表本身）與鍵盤路徑；圖本身 `aria-hidden`、副標當 aria 描述（CL-11 斷言：柱、點、段、格、sparkline 本身或祖先帶 `aria-hidden`，`aria-describedby` 指到存在的 id）；只有不利上色、有利不用綠（D-V3-7）；非本期序列用 `--chart-total`；色只經 `src/application/chart-theme.ts`，元件內無 hex 與 `var(--chart-` 字串常值；固定高只用 `chartHeights`，依列計高的 svg 只用 `chartRowHeights` 的倍數。
- **棘輪與基準**：design-lint 15 項、copy-style、copy-density（V4-0a 收緊到實測並加商品、待辦兩頁）只降不升；testid 對 v2（228 列）、v3（V4-0a 分三步產生）與 `verification/revamp-v4/testids-v4-added.txt`（V4-1 起每批把本批新增的 testid 追加進去，同格式加批次欄）三份基準的刪除數都是 0；頁面狀態每批在 `tests/helpers/page-states.tsx` 的錨點後新增，M1 測試在 `tests/mounted-testids.test.tsx` 的錨點後新增，V4-0a 起多一條 M6 斷言（`chart-` 開頭的 testid 在實例容器外恰好出現一次；`INSTANCE_CONTAINER` 不改）；`verification/revamp-v4/feature-retention.csv`（延續 v3 全部 113 列，再加圖表列）：`batch` 欄等於本批的列全部打勾，該批才算完成，V4-11 全表打勾；`verification/revamp-v4/e2e-text-assertions.csv` 每批勾銷；PRD §2.3 決策表每批逐頁對照。
- **畫面基準的跨批比對流程**：V4-n 開跑前，把前一批的 `verification/revamp-v4/V4-(n−1)/snapshots/`（V4-0a 用 `verification/revamp-v3/V3-10/snapshots/` 的 36 張，檔名 01–09 不變）複製到 `verification/revamp-v4/V4-n/snapshots/`，不帶 `--update-snapshots` 跑一次 capture；只允許該批「允許變動畫面」列出的畫面有差異，其餘必須 0 差異；確認後只對允許的畫面更新基準，並在驗收文件逐張寫理由。v3 的作法是先更新、再重跑確認穩定（`verification/revamp-v3-V3-5-acceptance.md:40`），只能證明重跑穩定，不能證明跨批沒變，v4 不沿用。
- **共通驗收**（每批都要全部跑，照下列順序，貼真實輸出摘要；沒執行的寫「未執行」＋原因）：
  1. `npm ci`（lockfile 變動時）、`npm run typecheck`、`npm run lint`、`npm run audit:ui -- --json verification/revamp-v4/V4-{n}/ui-audit.json`（`scripts/ui-audit.mjs:2、12-13` 只有帶 `--json` 才寫檔）、`npm run contrast-check`、`npm test -- --run`（含 design-lint、copy-style、copy-density、testid-baseline、mounted-testids、chart-lint、labels-structure）、`npm run build`。
  2. `NETWORK_LOG_OUT=verification/revamp-v4/V4-{n}/network-log.json KEYBOARD_WALK_OUT=verification/revamp-v4/V4-{n}/keyboard-walk.json AXE_OUT=verification/revamp-v4/V4-{n}/axe.json npm run test:e2e`（四個視窗；含 keyboard-walk、axe-sweep、network-log；三支 spec 各自讀這三個環境變數，`tests/e2e/network-log.spec.ts:127`、`keyboard-walk.spec.ts:205`、`axe-sweep.spec.ts:84`，沒給時只寫到 test-results，第 7 步的產物就不存在，也無法和 V4-0a 比里程碑 Tab 數；v3 的作法見 `verification/revamp-v3/V3-10/README.md:68`）。它用自己的 webServer 在 3100 埠起 LOCAL 模式的伺服器（`playwright.config.ts`，`reuseExistingServer: false`），所以必須在第 3 步的 PUBLIC_DEMO 伺服器啟動前跑完，否則撞埠。
  3. 起 PUBLIC_DEMO 伺服器：`NEXT_TELEMETRY_DISABLED=1 npm run build`，再 `APP_MODE=PUBLIC_DEMO PUBLIC_DEMO=true ENABLE_LIVE_AI=false npm start -- --port 3100 &`。
  4. `CAPTURE_BATCH=V4-{n} npx playwright test --config verification/revamp-v4.capture.config.ts`：52 張畫面基準（12 畫面 × 4 尺寸＋KPI 帶元素截圖 4 張，依上面的比對流程）與 `metrics.spec` v4（V4-0a：B2、B3、B5 硬斷言，B1、B9 只記錄；V4-1 起 B9、各頁 B1 依護欄表的時程硬斷言）；capture 設定 `reuseExistingServer: true`，沿用第 3 步的伺服器。
  5. Lighthouse：第一次先執行 `npx -y lighthouse@13.5.0 --version` 建立 npx 快取（`scripts/lighthouse-pages.mjs:7-8`）；再 `node --no-warnings scripts/lighthouse-pages.mjs --base http://127.0.0.1:3100 --out verification/revamp-v4/V4-{n}`（腳本不會自己起伺服器）。門檻：Accessibility 不低於同頁基準（v3 六頁 1440 與 390 全 100；資料來源、待辦兩頁以 V4-0a 基準為準）且 ≥ 95；Performance 分數＝空狀態首頁（navigation）那一步，只反映首載 bundle（`scripts/lighthouse-pages.mjs:79-80`：有圖的頁是 timespan 或 snapshot，沒有 0–100 分數），1440 ≥ 97、390 ≥ 90；圖頁的效能由 TBT 把關：390 的「載入示範資料」與「切到通路健檢、商品毛利、會議紀錄、資料來源」五個 timespan 的 TBT 各 ≤ V4-0a 中位數 × 1.1（記錄 loadavg；超過且當時負載高時重跑，低負載重跑仍超過才算未通過）。
  6. 停掉第 3 步的伺服器：`lsof -ti tcp:3100 | xargs kill`，再確認 `lsof -ti tcp:3100` 沒有輸出（Claude Code 每次 Bash 呼叫都是新 shell，取不到背景伺服器的 `$!`；3100 埠殘留時，下一批的 `npm run test:e2e`（`reuseExistingServer: false`）會撞埠）。
  7. 四尺寸截圖（1440×1000、1280×900、768×1024、390×844）各至少一張，存到 `verification/revamp-v4/V4-{n}/`；`ui-audit.json`、`metrics.json`、Lighthouse、axe、keyboard-walk、network-log 的輸出也放這裡。
  8. 禁區檢查（依 D-V4-3，四條都必須為空，結果寫進驗收文件；**不可用 `main` 比對**）：
     - `git diff --stat 625bfa5 -- src/domain fixtures docs/METRICS.md`
     - `git diff --stat 82b70df -- src/domain fixtures/golden fixtures/demo fixtures/errors fixtures/refund_only fixtures/zero_ad docs/METRICS.md`
     - `git diff --stat 625bfa5 -- src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts`（`assist-kpi-v1`、`breakeven-mer-v1` 不動）
     - `git status --porcelain -- src/domain fixtures docs/METRICS.md src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts`（`git diff` 看不到未追蹤的新檔；這一步在 commit 之前，批次中途新增的 `fixtures/*` 或 `src/domain/*` 檔只有這條抓得到）
  9. 更新 `docs/STATUS.md`（真實結果）；必要時在 `docs/DECISIONS.md` 記一筆；驗收寫在 `verification/revamp-v4-V4-{n}-acceptance.md`；本檔進度欄同步。
- 回報格式沿用 `00_README.md` 最後一節（與 CLAUDE.md 相同的六段）。
- commit 訊息以 `revamp(V4-{n}): …` 開頭；不混入其他批次的改動。commit 之後再跑 `git diff --stat 625bfa5 HEAD -- src/domain fixtures docs/METRICS.md src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts`，必須為空，並把 commit hash 寫進驗收文件。
- P2 圖（G8、G17、G24）集中在 V4-10，可整批延後，不影響上線（STATUS 與 RELEASES 寫明）。

---

## 人工關卡（不屬於任何批次）

| 關卡 | 內容 | 擋住 | 估計人工時間 | 材料 |
|---|---|---|---|---|
| H5 v4 設計稿審查 | V4-0b 產出的靜態設計稿（至少總覽、健檢、商品、資料來源四頁的 1440 與 390），2–3 位台灣電商經理人；圖表字串少，新字串在這一關一併審，不另設文案審稿；另記錄總覽首屏三處「最大一項」的用語是否需要統一（v3 既有字串，只記錄、不改字） | V4-1 開工 | 2–3 個工作天（招募與審查） | `verification/revamp-v4/mockups/*.html` |
| H6 v4 複測與盲評 | 5 位受試者（老闆、主管、執行者各 ≥ 1）跑 PRD §2.2 A1–A3；3 位外部盲評者跑 A4；同一場次量 v3 正式站（tag `v3.0.0`）與 v4 preview，補上 H4 未執行的 v3 基準；T4 用 `fixtures/errors/missing_ad_day` 的三個檔 | v4.0.0 正式上線 | 約 1 週（兩版同場對照） | `docs/revamp-v4/usability-test.md`（V4-0a 產出，沿用 v3 腳本並加 v4 任務） |

使用者可比照 v3 的 H2 略過 H5（依 D-V4-27），此時 STATUS 寫「未執行／待人工」，V4-1 照常開工。H6 未完成時 A1–A4 寫「未量測」，不寫成達標。

---

## 批次總表與 MVP 切線（PRD §9.3、§9.4）

| 批次 | 主題 | 大小 | 依賴（批次、拍板、人工關卡） | 另需的人工時間 | 狀態 |
|---|---|---|---|---|---|
| V4-0a | 基準與護欄（不改 UI） | M | 拍板 D-V4-1、2、3、15、23、24、25、26、27 | — | **完成（2026-10-08）** |
| V4-0b | 設計稿、PPT spike 與合成資料（不改 UI） | M | V4-0a；D-V4-31（D-V4-10、34 的 spike 結果回報後確認；D-V4-27＝B 時不產出設計稿） | H5 設計稿在本批產出 | 未開工 |
| V4-1 | 總覽拆解與圖表框（G1、G2、G6） | M | V4-0b；**H5**；D-V4-4、5、7、14、30；G6 另依 D-V4-33；D-V4-35 只在回覆 B 時 | — | 未開工 |
| V4-2 | 總覽其他圖（G3、G4、G5、G7a） | M | V4-1；D-V4-6、16、18；D-V3-35（只在回覆 A 後） | — | 未開工 |
| **MVP 切線** | V4-0a 到 V4-2，總覽改版完整 | — | 經使用者當次明確同意才部署 Vercel preview，不切正式站（依 D-V4-28） | 老闆試用 | — |
| V4-3a | 通路健檢（一）（G9、G10、G7b） | M | V4-2；D-V4-6、18、19、32（與 D-V3-31） | — | 未開工 |
| V4-3b | 通路健檢（二）（G11、G12；下鑽加日期與 SKU） | M | V4-3a；D-V4-17、18 | — | 未開工 |
| V4-4 | 商品毛利（G13、G14） | M | V4-3b | — | 未開工 |
| V4-5 | 假設試算（G15、G16） | M | V4-4；D-V4-20 | — | 未開工 |
| V4-6 | 會議紀錄（G19、G15 會議實例；G18 取消） | M | V4-5 | — | 未開工 |
| V4-7a | 資料來源（G20、G21、問題表篩選） | M | V4-6 | — | 未開工 |
| V4-7b | 匯入精靈與抽屜（G22、G23、`ladderMetrics` 搬移） | M | V4-7a | — | 未開工 |
| V4-8 | 投影與四尺寸總檢 | M | V4-1 到 V4-7b；D-V4-8、9、33；D-V4-35（回覆 B 而 V4-1 時尚未回覆）；D-V3-33、34（回覆後） | — | 未開工 |
| V4-9a | 匯出（一）PDF 與 PPT | M | V4-8；D-V4-10、11、34 | PPT、PDF 開檔人工檢查半天 | 未開工 |
| V4-9b | 匯出（二）Excel 與 Markdown | M | V4-9a；D-V4-12、13 | Excel 開檔人工檢查半天 | 未開工 |
| V4-10 | P2 圖表（G8、G17、G24；可整批延後） | M | V4-9b；D-V4-12、21、22 | — | 未開工 |
| V4-11 | 收尾與上線 | M | 全部（V4-10 延後時依賴 V4-9b）；D-V4-1、28；**H6**（擋正式上線） | H6 約 1 週 | 未開工 |

總計 16 批、至少 16 個工作階段；另需約 1.5–2 週的人工時間（H5、H6、匯出開檔檢查，加上招募與等待）。依賴鏈：V4-0a、V4-0b、（H5）、V4-1、V4-2、V4-3a、V4-3b、V4-4、V4-5、V4-6、V4-7a、V4-7b、V4-8、V4-9a、V4-9b、V4-10、V4-11、（H6）。V4-10 可整批延後，V4-11 改依賴 V4-9b。D-V4-3（禁區 diff 基準）每批都適用，在 V4-0a 回覆即可。

畫面基準的編號：01–09 是 v3 的 9 個畫面（`01-overview-top`、`02-overview-full`、`03-evidence-drawer`、`04-actions-board`、`05-diagnosis`、`06-products`、`07-scenarios`、`08-meeting`、`09-data`）；V4-0a 新增 10 健檢圖區、11 商品圖區、12 匯入精靈步驟 4，以及 13 KPI 帶元素截圖；10–13 的拍攝狀態、資料與定位器見 V4-0a 第 9 項。

---

## V4-0a 基準與護欄（M；不改任何 UI）

**範圍**
1. 依 D-V4-2 自 `main`（`21d621c`）開分支 `revamp/v4`；以 `00_README.md` 末節的草案整份取代 CLAUDE.md（使用者同意 v4 開工時才改）。
2. 文件套件定稿：`docs/revamp-v4/00_README.md`、本檔、`CHART_CATALOG.md`、`GLOSSARY.md`（v4 增補，一個概念一個詞：本輪新增的圖名與介面用語，例如「每 100 元淨營收去向」「涵蓋時間軸」「近 {n} 週」；累計概念一律寫「累計」，含「累計佔比」，不用同義的「累積」；「週」一律指從期間起日每 7 天一段，G11 月曆也用這個週，不用週一起的日曆週；試算結果的方向詞前一定加「試算後」（例如「{方案}試算後比現況多賺」），資料表欄名用既有的「與現況相比」；商品頁只寫「商品毛利為負」，「賠錢」「虧損」列為商品頁禁用詞並加進 copy-scan 對 `products.chartsV4.*` 的黑名單；「通路費用合計」＝平台抽成、金流手續費、物流與包材費、其他變動費用四項相加（v3 GLOSSARY 沒有收錄），圖例與欄名的其他指標名一律取 `metricDefinitions`，例如廣告一律寫 `ad_spend` 的「廣告投放費」或簡稱「廣告費」，不另立「廣告費用」）、`usability-test.md`（沿用 v3 腳本，加 v4 任務 T1–T4 與 A4 盲評題，每題附答案鍵；T1 問「本期少賺多少、貢獻變化拆解中扣最多的是哪一項」（答案：少賺 59.9 萬；商品成本 −157.5 萬；本期一句話的「最大一項」與 G6 最長條不算本題答案，PRD §2.2 A1、D-V4-35）；T3 問「哪個商品（含通路）毛利減少最多、少多少」（答案：SKU-020 · 平台 · MARKETPLACE，少 30,198.96 元）；T4 用 `fixtures/errors/missing_ad_day` 的三個檔）。
3. `verification/revamp-v4/` 產物：
   - `testids-v3.txt`：分三步產生，格式與 `testids-v2.txt` 相同（每列帶 ssr／e2e／cond 來源，`tests/testid-baseline.test.ts:222-226`）：(1) 用 `TESTID_BASELINE_DUMP` 取得 ssr 列（它只輸出 SSR 渲染到的 id，`:50、218-219`）；(2) 複製 `verification/revamp-v3/collect-testids.spec.ts` 為 `verification/revamp-v4/collect-testids.spec.ts`，把 `BASELINE` 改成 `verification/revamp-v4/testids-v3.txt`、`OUTPUT` 改成 `verification/revamp-v4/collect-testids.json`（原檔 `:10-11` 是 v3 路徑），並比照 `verification/revamp-v3.config.ts` 新增 `verification/revamp-v4.config.ts`（`testDir: "./revamp-v4"`、`testMatch: "collect-testids.spec.ts"`；e2e 設定的 testDir 是 `tests/e2e`、capture 設定是 `revamp-v4-capture`，都跑不到它），以 `npx playwright test --config verification/revamp-v4.config.ts`（對著 3100 的 production 伺服器）在瀏覽器收集互動後才出現的 e2e 列，命令與輸出寫進驗收；(3) cond 列沿用 v2 清單並補上 V3 新增的條件項。實數以這三步的結果為準；`audit:ui` 的「靜態 testid 253」是原始碼計數，和這份清單是不同的量，不當預期數。
   - `testids-v4-added.txt`：空檔（只有表頭），格式同 `testids-v2.txt` 再加批次欄；V4-1 起每批把本批新增的 testid 追加進去，讓後面批次刪掉或改名 v4 新 testid 時，testid-baseline 也抓得到。
   - `feature-retention.csv`：延續 `verification/revamp-v3/feature-retention.csv` 全部 113 列，再加每張既有圖與每張「表改圖」各一列（註明資料表替代）；表頭 `id,feature,page,v3_location,v4_location,change_type,locator,batch,status,covering_tests`（`v3_location` 填 v3.0.0 的位置）。`batch` 欄等於本批的列全部打勾，該批才算完成（例如前 10 名表改放 `after`（V4-4）、橋接表移到 `aside`（V4-1）、問題表加篩選（V4-7a）、`ladderMetrics` 修正與搬移（V4-3a、V4-7b）、投影白名單（V4-8））；V4-11 全表打勾。
   - `e2e-text-assertions.csv`：自 v3 版延續，新增欄「v4 批次」。
   - `labels-v3.flat.json`：v3.0.0 全部 2,581 個葉節點的鍵與字串。
   - `V4-0-baseline.md`：本批建立，V4-0b 補 spike 與設計稿紀錄。
4. `tests/testid-baseline.test.ts` 同時比對 `verification/revamp-v3/testids-v2.txt`（228 列）、`verification/revamp-v4/testids-v3.txt` 與 `verification/revamp-v4/testids-v4-added.txt`，三者刪除數都必須為 0。
5. chart-lint：`scripts/lib/chart-scan.mjs`（AST 作法沿用 `scripts/lib/ui-scan.mjs`，掃描範圍是 `src/components/charts/**` 與 `src/components/overview/charts/**`，CL-3 的 `var(--chart-` 字串常值禁令擴到 `src/components/**`；不改 `ui-scan.mjs` 的 `SCAN_SCOPE`）、`tests/chart-lint.test.ts`、`tests/fixtures/chart-lint-ceiling.json`，實作 PRD §7.9 的 CL-1 到 CL-11；CL-1、CL-2、CL-9、CL-11 用 SSR（從第 7 項的 `tests/helpers/page-states.tsx` 匯入 `pageStates` 渲染七頁）：CL-1 以元件根節點的 `data-chart-kind`（C24 `cell`、C19 `spark`）辨識內嵌條與 sparkline，不看 testid 片段，並放 C25 柱與 `profit-waterfall-bar-*` 不受約束的反例；CL-2 斷言所有 `data-testid^="chart-"` 符合 PRD §4.7 命名正則、語意 key 不是純數字；CL-9 計算 `<details>` 外的 `section.chart-section`；CL-11 斷言 `-bar-`、`-spark-`、`-seg-`、`-point-` 與帶 `data-chart-kind` 的元素本身或祖先有 `aria-hidden="true"`（table 模式的格除外）、每個 `section.chart-section` 的 `aria-describedby` 指到存在的 id。必須證明 v3.0.0 程式碼 11 條全部為 0；若實測有違規，驗收文件逐條列出、上限設為實測值，之後只降。
6. labels 護欄：`tests/labels-structure.test.ts` 新增 `V4_NEW_KEY_PREFIXES`（11 個 `{group}.chartsV4.` 前綴；本批不新增任何 key），判斷改為 V3 或 V4 清單任一符合；新增斷言：`labels-v3.flat.json` 的每個鍵都還在、字串逐字相同，除此之外的新葉節點只能在 `V4_NEW_KEY_PREFIXES` 下（既有的 `labels-v3-2b.flat.json` 只涵蓋 v2 來的字串，V3-3 起新增的 487 個 V3 前綴字串被 `isV3NewKey` 略過，`:14、26-27`）；`scripts/lib/copy-scan.mjs` 的 `L1_KEY_PATTERNS`（`:94`）加 `^[^.]+\.chartsV4\.[^.]+\.title(\.|$)`，並對 `products.chartsV4.*` 加禁用詞「賠錢」「虧損」（本批沒有任何 key，違規 0）。
7. `tests/mounted-testids.test.tsx`：先把 `shellPage`、`load`、`wizardFiles`、`pageStates`、`statusShells`（`:86、147、153、163、272`，都沒有 export）原樣搬到新檔 `tests/helpers/page-states.tsx` 並匯出，mounted-testids 改從這裡匯入（chart-lint 也從這裡匯入；直接從另一支 `.test.tsx` 匯入，vitest 會把整份 mounted-testids 的測試再登記一次），搬移前後 mounted-testids 的測試數與結果相同；「── V3-n 新增的頁面狀態在此之後」錨點（原 `:209-255`）隨 `states` 物件搬到 helper 檔，V4-1 起「新增頁面狀態」的錨點寫在 helper 檔，M1 測試的錨點留在 mounted-testids。再加一條 M6 斷言：每個頁面狀態中，`chart-` 開頭的 testid 在實例容器（`INSTANCE_CONTAINER`，`:347`）之外恰好出現一次（v3.0.0 沒有 `chart-` 開頭的 testid，違規 0）。`INSTANCE_CONTAINER` 不改：它是「內部 testid 可以隨容器重複」的容器規則，以全字串比對；圖表的柱、點、段、格是葉節點，加進去不是永遠比對不到，就是放寬 M6。在兩個檔各加「── V4-n …」錨點註解（V4-1 到 V4-10 各一組，含 V4-7a、V4-7b）。
8. `tests/e2e/keyboard-walk.spec.ts`：加通用斷言「任何 Tab 停留點都不在 `[aria-hidden=true]` 內」（v3.0.0 應為 0），之後每批都跑。另 `tests/copy-density.test.ts`（`:67-94` 只有總覽、健檢、試算、會議紀錄、資料來源五頁，上限都是 3）：五頁的上限改成 V4-0a 實測值，並加商品、待辦兩頁（上限＝實測），之後只降不升（B8）。
9. 量測與截圖：新增 `verification/revamp-v4.capture.config.ts`（比照 `verification/revamp-v3.capture.config.ts`，`CAPTURE_BATCH=V4-n`，基準存 `verification/revamp-v4/V4-n/snapshots/{project}/`，檔名 01–09 與 v3 相同，`reuseExistingServer: true`）與 `verification/revamp-v4-capture/{baseline,metrics}.spec.ts`。baseline：v3 的 9 個畫面加 10 健檢圖區、11 商品圖區、12 匯入精靈步驟 4，共 12 畫面 × 4 尺寸＝48 張，再加 13 KPI 帶元素截圖 4 張，共 52 張。新增 4 種畫面的拍攝方式（v3.0.0 還沒有這些圖，基準拍的是 v4 圖要插入的位置，之後各批的差異就是插入的圖）：
   - 10 健檢圖區：載入示範資料（`loadDemo`）、切到通路健檢，截圖範圍＝`[data-testid="diagnosis-list"]` 的下緣到 `[data-testid="channel-compare"]` 的下緣（G10、G11、G12 都插在這兩者之間，`src/components/workspace-panels.tsx:188-189`）；`<details>` 保持預設收合。
   - 11 商品圖區：載入示範資料、切到商品毛利，對 `section.product-highlights`（`src/components/product-comparison-panel.tsx:257`，沒有 testid，定位器登記到 `e2e-text-assertions.csv`）做元素截圖。
   - 12 匯入精靈步驟 4：從「匯入資料」選 `tests/fixtures/inclusive_tax` 的三個檔（`tests/e2e/import-wizard.spec.ts:13` 的含稅流程），走到步驟 4，對 `[data-testid="import-step-4"]` 做元素截圖。
   - 13 KPI 帶：載入示範資料後，在資料來源頁讀入本批新增的 `verification/revamp-v4-capture/targets.csv`（期間與示範資料本期相同、通路 ALL，同時含達成與落後的指標，讓 `kpi-target-*` 出現兩種狀態；讀檔流程比照 `tests/e2e/revamp-r4.spec.ts:180`），回總覽對 `[data-testid="kpi-band"]` 做元素截圖。只載入示範資料時畫面上沒有任何 `kpi-target-*`（`src/components/overview.tsx:69`），量不到 V4-2 抽出 C18 後外觀是否零差異。
   metrics：
   - 硬斷言 B2：1440 一句話頂 ≤ 192、KPI 帶底 ≤ 420、三件事首列底 ≤ 561；1280 KPI 帶底 ≤ 420；390 扣廣告後貢獻值頂 ≤ 295。1280 的一句話頂與三件事首列底 v3 沒有量過（`verification/revamp-v3-capture/metrics.spec.ts` 只在 1440 與 390 量首屏），本批量出實測值（依 V3-10 截圖估計約 192 與 583）寫進 `V4-0-baseline.md`，V4-1 起以實測值為門檻硬斷言；
   - 硬斷言 B3（七頁 390 `document.scrollingElement.scrollWidth ≤ 390`）；
   - 硬斷言 B5（First Load JS gzip ≤ 545,397 bytes；量法沿用 v3：首頁 HTML 的 `/_next/static` 腳本去重、排除 nomodule、`zlib.gzipSync`；首載 chunk 中 `Treemap`、`Sankey`、`Funnel`、`PieChart`、`RadarChart` 符號為 0）；
   - 記錄（不斷言）：B1 參考位置（總覽第一張 `.chart-frame` 頂、健檢清單第一列頂與 G10 插入處頂、試算方案比較表區塊頂、資料來源狀態列底）、健檢首列底、各頁主層否定句數（B8 基準）、七頁在 1440 與 390 載入示範資料後的 DOM 節點數 `document.querySelectorAll('*').length`（B9 基準，V4-1 起硬斷言 ≤ 基準＋1,500）、首頁 HTML 列出的每個 chunk 檔名與 gzip 大小（`verification/revamp-v4/V4-0a/first-load-modules.json`，供人工比對；檔名帶雜湊，不逐一斷言）。
10. `scripts/contrast-check.mjs`：試算 `--red-100` 的候選值與 PRD §6.5 新 token 的配對（白底與 `--bg-subtle` 底），結果寫進 `V4-0-baseline.md`；**只算不宣告**，`:root` 不動。
11. Lighthouse：`scripts/lighthouse-pages.mjs` 的 `pages`（`:46-50`）加資料來源與待辦兩頁（v3 只有首頁、總覽、健檢、商品、試算、會議），記錄 8 頁在 1440 與 390 的基準；390 的「載入示範資料」與「切到通路健檢、商品毛利、會議紀錄、資料來源」五個 timespan 的 TBT 在低負載下各連跑 3 次取中位數，記錄每次的 loadavg（v3.0.0 驗收的載入示範資料 1,667 ms 是在 loadavg 4.73 下量的，`verification/revamp-v3/V3-10/metrics.json`；V3-9b 為 972 ms；同一份 metrics.json 的 390「切到通路健檢」1,330 ms、「切到會議紀錄」1,718 ms 只有記錄、沒有門檻）。驗收文件寫明 Performance 分數只來自空狀態首頁（navigation），只反映首載 bundle。
12. 基準量測：axe 四尺寸（desktop、laptop、tablet 各 11 個狀態、mobile 10 個）、keyboard-walk（各頁里程碑 Tab 數）、network-log，以 `AXE_OUT`、`KEYBOARD_WALK_OUT`、`NETWORK_LOG_OUT` 寫到 `verification/revamp-v4/V4-0a/`（共通驗收第 2 步），摘要寫進 `V4-0-baseline.md`，之後各批用同樣的檔比對。

**依賴**：拍板 D-V4-1、2、3、15、23、24、25、26、27。

**允許變動畫面**：無。36 張 v3 畫面（V3-10 的 01–09 × 4 尺寸，複製後不帶 `--update-snapshots` 跑）差異 0；新增的 16 張（10–12 × 4、13 × 4）只建立基準。

**驗收重點**：畫面零變化；chart-lint 11 條對 v3.0.0 為 0（或上限＝實測並逐條列出）；testid 三份基準刪除 0；labels 快照 2,581 個逐字相同；mounted-testids 搬 helper 前後測試數與結果相同，`chart-` 唯一性斷言與 keyboard-walk 的 `aria-hidden` 斷言在 v3.0.0 上通過；copy-density 七頁上限＝實測；collect-testids 以 `verification/revamp-v4.config.ts` 執行的命令與輸出寫入；禁區四條命令皆空；First Load JS、首載 chunk 符號與 chunk 清單寫入；B2 的 1440 三項、1280 KPI 帶底、390 在 v3.0.0 上通過，1280 另兩項的實測值寫入；DOM 節點數、五個 TBT 中位數與 loadavg、8 頁 Lighthouse 基準寫入；畫面 10–13 依第 9 項的狀態建立；所有新測試通過。

**同批 labels 與測試**：labels 值不動；新增 `tests/chart-lint.test.ts`、`scripts/lib/chart-scan.mjs`、`tests/fixtures/chart-lint-ceiling.json`、`tests/helpers/page-states.tsx`；改 `tests/testid-baseline.test.ts`、`tests/labels-structure.test.ts`、`tests/mounted-testids.test.tsx`、`tests/copy-density.test.ts`、`tests/e2e/keyboard-walk.spec.ts`、`scripts/lib/copy-scan.mjs`、`scripts/lighthouse-pages.mjs`；新增 capture config、兩支 capture spec、`verification/revamp-v4-capture/targets.csv`、`verification/revamp-v4.config.ts`、`verification/revamp-v4/collect-testids.spec.ts`、`verification/revamp-v4/testids-v4-added.txt`。

**相關拍板**：D-V4-1、2、3、15、23、24、25、26、27。

---

## V4-0b 設計稿、PPT spike 與合成資料（M；不改任何 UI）

**範圍**
1. pptxgenjs `addChart` spike（依 D-V4-10）：`tests/pptx-chart-spike.test.ts` 在記憶體中產生一張只有瀑布的投影片（堆疊長條四系列：透明底段、起訖與小計、有利差額、不利差額；含跨 0 的柱與負的本期值；輔助系列用測試內的 ASCII 名稱，正式名稱到 V4-9a 才進 labels），解壓後解析 `ppt/charts/chart1.xml` 與內嵌活頁簿。**測試只斷言能產生檔案並解析出 XML**；各檢查項（`c:barChart` 為 stacked、底段系列 `a:noFill`、四系列色屬於 `EXPORT_THEME`、`c:valAx` 的 min／max 依資料且含 0、負值不被切、`ppt/media/` 為空、內嵌活頁簿看得到輔助系列名、有利與不利兩個系列的名稱標明「絕對值，圖形用」（它們存的是柱高，PowerPoint「編輯資料」裡商品成本是 1,575,080.55，橋接表是 −1,575,080.55）、資料標籤的數字格式帶「−」、數值等於 `bridgeWaterfall().bars` 起點與終點精確字串換算的值；另依 D-V4-34 試排兩種版面：A 第二張只放瀑布，B 單張內縮排後一句話、KPI、三件事、通路表、決議、置頂待辦是否全部保留）只在有給環境變數 `PPTX_SPIKE_OUT` 時寫檔（之後每批跑 `npm test` 都不會改寫 V4-0b 的證據檔），V4-0b 驗收命令：`PPTX_SPIKE_OUT=verification/revamp-v4/V4-0b/pptx-spike.json npx vitest run tests/pptx-chart-spike.test.ts`。成立與否由驗收文件判讀，不由測試成敗決定，所以「不成立」不會讓 `npm test` 變紅。**不接線**。不成立時 V4-9a 改 `addShape`（D-V4-10）。
2. 4 通路合成資料（依 D-V4-31）：`tests/fixtures/synthetic-4-channel/`，含 4 通路、1 個扣廣告後虧損通路、通路費用與廣告各有缺列日（含跨多日的區段）、1 個扣項為負（沖回）但淨營收為正的通路、至少 4 個商品毛利為負的 SKU（跨 2 個通路）、零貢獻門檻落在 [−90%, +100%] 以外的方案、結束在週中的期間（最後一週未滿 7 天）；手算期望值寫在使用它的測試檔，不寫進 `fixtures/`。新增 `tests/synthetic-4-channel.test.ts` 驗證能載入、手算合計相符。
3. H5 設計稿（D-V4-27＝B 時不做）：`verification/revamp-v4/mockups/*.html`（用 token 做的靜態 HTML，不進 app bundle）：總覽、健檢、商品、資料來源四頁的 1440 與 390，依 `CHART_CATALOG.md` 的實作卡畫。總覽、健檢用示範資料；商品頁畫兩種狀態（示範資料：沒有負值，第一格是 v3 原樣的 `product-worst`；合成資料：有 G14）；資料來源頁用合成資料（示範資料沒有缺列與問題）。同時實測：G11 在 390 的格寬（設計週欄 40px＋7 欄 × 40px＝320px，實際內寬約 324px）、768 與 1280 每列放幾張月曆（PRD §4.4 G11），與 `formatHeatCell` 的「−0.45」放不放得下；G20 的缺列虛線框、去年同期細線、期間區帶分不分得出來。
4. 紀錄：spike 檢查項、合成資料手算值摘要、設計稿實測寫進 `V4-0-baseline.md`。

**依賴**：V4-0a；D-V4-31（D-V4-10、34 的 spike 結果回報後確認）；D-V4-27＝B 時不做設計稿。

**允許變動畫面**：無（52 張與 V4-0a 差異 0）。

**驗收重點**：spike 檢查項以 `PPTX_SPIKE_OUT` 寫入、判讀寫入驗收（含兩種版面的試排結果，供 D-V4-34）；不帶 `PPTX_SPIKE_OUT` 跑 `npm test` 時不產生或改寫證據檔；合成資料測試通過；設計稿存在且不在 build 產物中（D-V4-27＝B 時寫「不做」）；畫面零變化；所有新測試通過。

**同批 labels 與測試**：labels 值不動；新增 `tests/pptx-chart-spike.test.ts`、`tests/synthetic-4-channel.test.ts`。

**相關拍板**：D-V4-10、27、31、34。

**另需的人工時間**：H5 設計稿審查 2–3 個工作天（V4-0b 結束後、V4-1 開工前；使用者可略過）。

---

## V4-1 總覽拆解與圖表框（M）

**範圍**：C16 ChartFrame 擴充（`aside`（外層沿用 `.bridge-table-wrap`）、`unitNote`、`frameClassName`、`legend[].shape`（含 `rect`）、`mode` 的型別、`page`；向下相容）；C17 `bare` 與選填 `domain`（兩張瀑布同尺度：共同 `[lo, hi]` 取 G1 的 `bars` 加上 `profitWaterfallScopes` 全部範圍（合計與每個通路）的 G2 `bars`，G2 切到虧損通路時負值柱仍在範圍內）；C24 BarCell（variance）與 `chart-theme.ts` 的 `chartRowHeights`（只在 D-V4-33 已回覆、要做 G6 時；未回覆時順延到 V4-2 的 G4 差額條；C33 ChartDataTable 在 V4-2 隨 G7a 交付，本批的 G1、G2 沿用既有表、G6 共用橋接表，都不用它）；`formatAxisWan`（`presentation.ts`），`waterfallTickLabels` 改呼叫它（輸出不變）；G1、G2 搬進 ChartFrame（`className` 保留 `bridge-section`、`profit-section`，`id` 保留 `bridge`、`profit`，既有 testid、`.bridge-total`、`.unit-note`、`bridge-balance-check` 不變）；G6 橋接表內嵌變異條（依 D-V4-33：先改寫 X18，只在 ≤ 767px 顯示，≥ 768 以 CSS 隱藏但掛載；未回覆時不做 G6，其餘照做）；`track("chart_clicked")`、`track("chart_table_opened")` 接到 G6 與資料表展開（依 D-V4-14）；D-V4-35 已回覆 B 時，本期一句話改用與 G1 同一規則的新字串（`overview.chartsV4.*`，既有字串保留；未回覆時不做）。實作卡：`CHART_CATALOG.md` G1、G2、G6。

**依賴**：V4-0b；**H5**（或使用者明確略過）；D-V4-4、5、7、14、30；G6 另依 D-V4-33。

**允許變動畫面**：01、02（總覽）；03（抽屜）只限 desktop、laptop，理由：03 在 1440 是 scrollY＝0 時拍抽屜（`verification/revamp-v3-capture/baseline.spec.ts:22-25`），模糊背景就是總覽首屏，含拆解標題、瀑布柱與刻度（`verification/revamp-v3/V3-10/snapshots/desktop/03-evidence-drawer.png` 的 y 約 770–1000）；本批讓 G1、G2 共用尺度並改刻度，G1 的柱長與刻度一定變，capture 設定是 `maxDiffPixels: 0`。驗收文件寫明 03 的差異只在背景、抽屜本身不變。

**驗收重點**：總覽四個 `.chart-frame` 切期間等高、CLS < 0.05；`bridge-section`、`profit-waterfall` 內各恰好 1 個 `.chart-frame`；G6 九條與表列同一個 evidence（SSR `toEqual`），1440 不可見但掛載；1440 橋接表在圖右欄；390 橋接表在前、捲到 `bridge-waterfall` 後它可見且寬 > 0、頁面無橫向捲動；刻度沒有「.0 萬」；兩張瀑布刻度相同；示範資料 G2 切到 MARKETPLACE 時終點柱（−61,169.93）在 domain 內、刻度含負值；本批新增的 testid 追加到 `testids-v4-added.txt`；B2（1440 三項、1280 KPI 帶底與 V4-0a 實測門檻、390）與 B9 不退；golden 差額 −315.00 不變；只有 01、02 與 desktop、laptop 的 03 有差異（寫理由）。

**V4-0a 量到、併入本批的修正**：v3.0.0 在 390 寬有 2 個 Tab 停留點落在 `aria-hidden` 內：總覽 G1、G2 瀑布外框 `div.chart-frame.waterfall`（`src/components/overview/charts/waterfall-svg.tsx` 的外框帶 `aria-hidden`，390 寬時成為水平捲動容器，Chromium 讓可捲動容器可聚焦；axe 的 aria-hidden-focus 規則不計這種隱含可聚焦，所以 V3-10 的 axe 沒抓到）。V4-0a 依「上限＝實測並逐條列出」把它們寫進 `tests/e2e/keyboard-walk.spec.ts` 的 `KNOWN_ARIA_HIDDEN_STOPS`；本批搬 G1、G2 進 ChartFrame 時修正（外框不帶 `aria-hidden`、只讓 svg `aria-hidden`，外框改 `role="region"`＋`aria-label` 保留鍵盤捲動，或外框 `tabIndex={-1}`），修好後刪掉那兩列，768 寬一併確認。

**同批 labels 與測試**：`overview.chartsV4.{bridge, profit}`、`shell.chartsV4.common`（預計各 0–3 個 key）；`tests/overview-charts-waterfall.test.tsx` 改 ChartFrame 結構；新增 `tests/chart-frame-v4.test.tsx`、`tests/bar-cell.test.ts`（只在做 G6 時）；`overview-charts-waterfall.test` 加「G2 切到 MARKETPLACE 時終點柱在 domain 內、刻度含負值」；`formatAxisWan` 單元測試（`tests/format-layers.test.ts` 擴）；`tests/chart-theme.test.ts` 登記 `chartRowHeights`（做 G6 時）；`tests/e2e/revamp-r1-layout.spec.ts` 的 `CHART_FRAMES`（`:340`）改為自動收集 `main .chart-frame:visible`（不收 `hidden` 祖先內與未展開 `<details>` 內的框，它們沒有 bounding box，`:27` 的 `box()` 與 `:359` 的 `every(height > 0)` 會失敗；不限 `.view-content`，因為試算頁的工作台在 `.view-content` 之外，`src/components/dashboard.tsx:576-577`）；新增 `tests/e2e/charts-overview.spec.ts` 與 `tests/e2e/chart-helpers-v4.ts`；mounted-testids V4-1 錨點。

**相關拍板**：D-V4-4、5、7、14、30、33；D-V4-35（只在回覆 B 時）。

---

## V4-2 總覽其他圖（M）

**範圍**：C33 ChartDataTable（第一個使用者是 G7a 的「各指標每週」）；V4-1 沒做 G6 時（D-V4-33 未回覆），C24 BarCell（variance）與 `chartRowHeights` 隨 G4 差額條在本批交付；G3 刻度改 `formatAxisWan`（本期、上期末點標值與三項圖例沿用 v3，390 不隱藏去年同期線；去年同期線尾標名只在 H5 要求時做，沿用既有句型，不新增 key）；G4 緊湊表差額欄與差額條（`metricComparison` 改為匯出；長條沿用既有 `channelEvidence`（水準值、不帶 `components`），差額條與差額 number-link 用 `channelChangeEvidence`，兩個 builder 分開；有利用 `--chart-total`，不用和上期長條同為 gray-400 的 `--chart-favorable`）；C18 由 `overview.tsx:43-51` 抽成共用 `Bullet`（畫法沿用 v3：0 到目標、寬度＝達成率夾在 0 到 1、目標刻度在右端），`--chart-target` 宣告，損益兩平 MER 段加 bullet；C19 Sparkline＋G7a（`assistWeeks`／`assist-weeks-v1`，`weeklyRows` 加 `units_sold`，`isFullWeek` 改為匯出，欄名「近 {n} 週」，「各指標每週」`<details>`）；`EvidenceSelection` 加 `arrangeVersion`（整理函式版本，抽屜技術細節在 `metric_version` 之後另列一行，只在有給時顯示；PRD §8.7）：G7a 格的值取自 domain，`metric_version` 維持 `contribution-v1`（件數、件均維持 `assist-kpi-v1`），另帶 `arrangeVersion: "assist-weeks-v1"`；`--chart-h-xs`；D-V3-35 只在使用者回覆 A 後才做。D-V4-16 選 B 時改 C35 啞鈴並同批改 `tests/e2e/trend-yoy.spec.ts:200`。實作卡：G3、G4、G5、G7（a）。

**依賴**：V4-1；D-V4-6、16、18；D-V3-35（只在回覆 A 後）。

**允許變動畫面**：02（總覽整頁）；13 KPI 帶元素截圖差異 0。

**驗收重點**：KPI 帶底 ≤ 420（1440、1280 硬斷言）；KPI 帶元素截圖（畫面 13，讀入 `verification/revamp-v4-capture/targets.csv` 後含達成與落後兩種 `kpi-target-*`）與 V4-1 差異 0；G4 長條的抽屜大數字不帶正負號且畫四層階梯（與 v3 相同），差額條的抽屜帶兩期 `components`；KPI 帶內 `[data-testid^='kpi-']` 數不變；金額與件數 sparkline 的未滿週畫空心點（X40，用合成資料驗；示範資料本期是 6 個完整週）；`assist-kpi-v1` 既有測試與 `export-numeric` 基準不動；G7a 格的抽屜 `metric_version` 仍是 `contribution-v1`（件數、件均為 `assist-kpi-v1`），另列 `assist-weeks-v1`；`trend-yoy.spec.ts`（含 `:45-46` 三項圖例、`:200` 定位器、mobile 的去年同期下鑽）不改且通過（D-V4-16＝A 時）；手算 golden：逐週件數加總＝期間件數。

**同批 labels 與測試**：`overview.chartsV4.{channels, bullet, assistSpark}`（`trend` 預計 0 個）；新增 `tests/chart-assist-weeks.test.ts`、`tests/bullet.test.tsx`、`tests/chart-geometry-v4.test.ts`（`sparklineGeometry`）；擴 `tests/trend-yoy.test.tsx`（刻度；`:204` 的圖例斷言不變）、`tests/overview-charts-frame.test.tsx`、`tests/evidence-drawer-v3.test.tsx`（`arrangeVersion`）、`tests/workspace.test.ts`（`weeks[].units_sold`）、`tests/chart-theme.test.ts`（KEYS 加 `target`、`xs`；V4-1 沒登記時加 `chartRowHeights`）、`scripts/contrast-check.mjs`（PAIRS 加 `--chart-target`）；`revamp-r4` 目標斷言不變；`charts-overview.spec` 擴；mounted-testids V4-2 錨點（「各指標每週」`<details>` 收合時掛載）。

**相關拍板**：D-V4-6、16、18；D-V3-35（只在回覆 A 後）。

**另需的人工時間**：MVP 切線到了。若要部署 Vercel preview 讓老闆試用，需使用者當次明確同意（依 D-V4-28）；不切正式站。

---

## MVP 切線

V4-0a 到 V4-2 完成後，總覽改版完整（瀑布進圖表框、手機橋接表變異條、趨勢與通路刻度、bullet、sparkline）。經使用者當次明確同意可部署 preview；正式站到 V4-11 才切（依 D-V4-28）。

---

## V4-3a 通路健檢（一）（M）

**範圍**：G9 健檢清單內嵌影響金額條（C24 加 tick；只對差額類規則 `REV_UP_CM_DOWN` 與四個費用負擔規則畫，水準類 `NEGATIVE_CHANNEL_CM`、`SKU_NEGATIVE_GP` 不畫，共用尺度只取差額類；`REV_UP_CM_DOWN` 是總差額，畫空心條並在清單下方註明；費用規則影響為正時照有利色往右畫）；C27 ShareStack＋G10（標題寫「每 100 元淨營收，扣完廣告剩／虧」，全部通路不適用時用 `title.notApplicable`；圖例與資料表欄名取 `metricDefinitions`，四項合計寫「通路費用合計」；通路 ≤ 5 用 sm、6 到 8 用 lg、> 8 只留表，svg 高＝（通路數＋2）× `row24`；各通路的剩與段比率直接呼叫 `profitWaterfall(snapshot, channel)`；`channelStructure`／`channel-structure-v1` 只管四項費用合計與超過 100 的幾何；虧損通路超過 100 照常畫，「任一扣項為負或淨營收 ≤ 0」改文字列「不適用」）；`--chart-seg-1..3`；G7b（`channelWeeks`／`channel-weeks-v1`：不放進 `createSnapshot`，在健檢頁元件內 `useMemo` 計算，通路 > 8 時不呼叫並改為一句說明；通路寬表「近 {n} 週」欄與「各通路每週」`<details>`）；`EvidenceSelection` 加 `valueKind`（水準或差額；抽屜大數字與精確值的正負號、取位說明只看它，PRD §8.7）；修正 `ladderMetrics` 的週與去年同期查找（只在 `evidence.channels` 等於 `report.scope.channels` 時成立）；D-V3-31 已回覆 B 且 D-V4-32＝A 時，抽屜加 `unitOverride: "percent"`，每 100 元可開抽屜。實作卡：G7（b）、G9、G10。

**依賴**：V4-2；D-V4-6、18、19、32（與 D-V3-31）。

**允許變動畫面**：05、10（健檢）。

**驗收重點**：示範資料 MARKETPLACE 超過 100 照常畫（`…-seg-MARKETPLACE-over`）；`refund_only` 出現「不適用」列，標題用 `title.notApplicable`；G10 的（列數＋2）× 24 ≤ 所選固定高（通路 5 與 8 各一例）；50 通路 × 92 天的記憶體合成資料：健檢頁 SSR 沒有 G7b 的 sparkline 與 G10 的列、`channelWeeks` 沒被呼叫、`createSnapshot` 輸出沒有 `channelWeeks`；G9 的 `REV_UP_CM_DOWN` 是空心條、費用規則影響為正的案例是有利色；`zero_ad` 廣告段寬 0；七段恆等（golden 與 demo，到分）；每通路的剩＝`profitWaterfall(snapshot, channel).perHundred`、段比率＝`rows[].share` 逐字相同；合計列「剩」＝`perHundred`（示範 16.2、golden 10.3）；水準類規則沒有條，共用尺度只取差額類；四項費用段的抽屜大數字不帶「+」、技術細節不出現 `platform_fees` 的公式、`metric_version` 顯示 `channel-structure-v1`；G7b 格的抽屜 `metric_version` 仍是 `contribution-v1`，另列 `channel-weeks-v1`；單一通路週證據不畫全通路階梯（SSR）；每通路逐週加總＝通路期間合計；健檢首列底不晚於 V4-0 實測；第一個 G9 內嵌條頂 ≤ 900（B1）；輸出沒有任何「其他」合併或跨規則加總（X38）；健檢頁主層獨立圖區塊＝1。

**同批 labels 與測試**：`diagnosis.chartsV4.{impact, share, channelsSpark}`；新增 `tests/chart-structure.test.ts`、`tests/chart-channel-weeks.test.ts`（含記憶體中產生 50 通路 × 92 天合成資料的 helper，不寫檔）；擴 `tests/workspace.test.ts`（`createSnapshot` 沒有 `channelWeeks`）、`tests/diagnosis-v3.test.tsx`、`tests/evidence-drawer-v3.test.tsx`（`valueKind`、`ladderMetrics` 修正、G7b 的 `arrangeVersion`）、`tests/chart-geometry-v4.test.ts`（`shareStackGeometry`）、`tests/chart-theme.test.ts`、`scripts/contrast-check.mjs`；新增 `tests/e2e/charts-diagnosis.spec.ts`；mounted-testids V4-3a 錨點。

**相關拍板**：D-V4-6、18、19、32；D-V3-31。

---

## V4-3b 通路健檢（二）（M）

**範圍**：ChartFrame `mode="table"` 首次使用；C28 HeatTable（calendar：列＝snapshot 週、欄＝該週第 1 到 7 天、欄頭標星期；grid 型 roving tabindex，整張 1 個 Tab 停留點）＋G11（`dailyHeatmap`／`daily-heatmap-v1`；階 1＝取位到元後仍為負；超過 92 天改週 × 通路；通路 > 8 不計算、不渲染；標題所指的通路排第一張；格寬 ≥ 1280 為 44、其餘 40，每列張數依框內寬；一列放不下全部月曆時框內垂直捲動並加 `scrollNote`）；`formatHeatCell`（`presentation.ts`）；`--red-100`（`:root` 原始色階）、`--chart-heat-1..2`、`--chart-missing`；`EvidenceFilter` 加 `date`、`sku`（`src/application/evidence-filter.ts:10-13`；`sku` 條件下沒有 sku 欄位的通路費用與廣告列一律不列入，`filter.sku` 只和商品層證據一起用），`evidenceFilterText` 加日期與 SKU 片語；C26 SmallMultiples＋G12（`<details>`「五項比率走勢」，每張比率各自 Y；標題用區塊名「五項比率每週走勢」，不做跨比率排名；390 單欄列出 5 張、框高 `chartHeights.sm` × 5，不設「更多指標」，因為子圖在 `aria-hidden` 容器內，裡面的收合會是 `aria-hidden` 內的停留點）；axe 加「資料表展開」「從圖下鑽的抽屜」「4 通路合成資料的健檢頁」（G10 不適用列、4 通路 G11）三個狀態（desktop、laptop、tablet 共 14，mobile 共 13）；keyboard-walk 加「健檢頁經過熱表的 Tab 數 ≤ 3」。實作卡：G11、G12。

**依賴**：V4-3a；D-V4-17、18。

**允許變動畫面**：05、10（健檢）。

**驗收重點**：熱表格（Enter）開當日抽屜、篩選片語含日期、原始明細每列日期等於該日；null 格虛線框「資料待補」；正值不上色；格內負值取位到元後仍為負時保留 U+2212；> 92 天改週；390 月曆表寬 ≤ 所在 `.table-scroll` 的 `clientWidth`（設計 320；V4-0b 實測放不下時改為內部捲動並記入驗收）、頁面無橫向捲動；390 第一張月曆是標題所指的通路且不捲動就在框內可見；50 通路合成資料不渲染任何熱表格；`filter.sku` 下沒有通路費用與廣告列；經過熱表的 Tab 數 ≤ 3；axe 四尺寸 0 serious（特別是沒有 `aria-hidden-focus`）；G12 收合時掛載（M1）、每張子圖 Y 範圍各自、圖容器內沒有 `<details>` 與按鈕、390 框高＝sm × 5；新 token 全部進 contrast-check（`--chart-heat-2` 格內文字 ≥ 4.5:1、階 2 框線 ≥ 3:1）；健檢頁主層獨立圖區塊＝2。

**同批 labels 與測試**：`diagnosis.chartsV4.{heat, rates}`；新增 `tests/chart-heatmap.test.ts`、`tests/charts-diagnosis-v4.test.tsx`；擴 `tests/evidence-filter.test.ts`、`tests/format-layers.test.ts`（`formatHeatCell`）、`tests/chart-theme.test.ts`（heat token 恰好 2 個，X33）、`tests/e2e/axe-sweep.spec.ts`、`tests/e2e/keyboard-walk.spec.ts`、`charts-diagnosis.spec`；mounted-testids V4-3b 錨點（健檢圖區收合狀態）。

**相關拍板**：D-V4-17、18。

---

## V4-4 商品毛利（M）

**範圍**：C25 RankedBars＋`hbarGeometry`；G14「商品毛利為負的商品累計」（`productPareto`／`product-pareto-v1`；累計佔比（佔商品毛利為負合計）＝取反後的 `ratioMetric`；只在有商品毛利為負時渲染；圖名、副標、資料表不寫「賠錢」「虧損」）；G13（`productHighlights` 同檔新增 `worstChange`；每欄 ≤ 5 根、列高 `row16`，390 上下 10 × 16 ≤ sm 180；欄名用 `legend`；標題「{SKU} · {通路} 商品毛利少 …」）；`product-worst`、`product-best` 改為 ChartFrame 的 `after` 常駐（DOM 與 testid 不變，`h3#product-highlights-heading` 保留；沒有負值時 `product-worst` 照 v3 原樣放在第一格）；ChartFrame `headingLevel`；商品抽屜 builder 由 `product-comparison-panel.tsx` 的 `metricLink`、`deltaLink` 抽成 `src/components/product-evidence.ts`（只搬移）；`filter.sku` 接線；keyboard-walk 加商品頁「第一張圖的資料表 summary」里程碑（這一頁不等 V4-8）；axe 加「合成資料的商品頁」狀態（desktop、laptop、tablet 共 15，mobile 共 14）。實作卡：G13、G14。

**依賴**：V4-3b。

**允許變動畫面**：06、11（商品）。

**驗收重點**：`refund_only` 與合成資料：末筆累計＝負值合計、末筆累計佔比 100%（不是 null）；示範資料（沒有負值）：`chart-products-pareto` 不存在、`product-worst` 的 DOM 與 v3 相同；累計格抽屜大數字不帶「+」；G14 柱 ≤ 10，其餘寫「另 n 個」，沒有「其他」柱；G13 每欄 ≤ 5，（列數）× 16 ≤ 180（`chart-geometry-v4.test`）；keyboard-walk 本批新增的「第一張圖的資料表 summary」里程碑在 `product-worst` 之後，`product-worst` 的 Tab 數不晚於 V4-0；`products.chartsV4.*` 沒有「賠錢」「虧損」（copy-scan）；抽出前後 `EvidenceSelection` 相同；heading 不跳級（axe）；第一張 `.chart-frame` 頂 ≤ 900（B1）；商品頁主層獨立圖區塊：示範資料 1、合成資料 2。

**同批 labels 與測試**：`products.chartsV4.{pareto, variance}`；新增 `tests/chart-pareto.test.ts`、`tests/charts-products-v4.test.tsx`；擴 `tests/product-page-v3.test.tsx`、`tests/product-highlights.test.ts`、`tests/chart-frame-v4.test.tsx`（`headingLevel`）、`tests/chart-geometry-v4.test.ts`（`hbarGeometry`）、`tests/e2e/keyboard-walk.spec.ts`（商品頁資料表 summary 里程碑）、`tests/e2e/axe-sweep.spec.ts`（合成資料商品頁）；新增 `tests/e2e/charts-products.spec.ts`；mounted-testids V4-4 錨點。

---

## V4-5 假設試算（M）

**範圍**：G15 方案差額（方案比較表區塊之前，一頁一份，全頁唯一；標題「{方案}試算後比現況多賺／少賺 {amount}」，方向詞前一定加「試算後」；資料表欄名沿用既有「試算後的扣廣告後貢獻」「與現況相比」）；ChartFrame `variant="inline"` 首次使用；C29 ThresholdLine＋G16（`thresholdPoints`，在每個 `scenario-{n}` 的 `scenario-sensitivity` 內；依 D-V4-20 建議 A′ 只畫點、不連線；選 A 時等級寫「A（模型值，來源 `scenario-sensitivity-v1`）」並加三項必要測試（線段端點都等於既有點、x 只落在 [min v, max v]、圖下顯示模型版本）；門檻點空心 `--chart-target`、使用者點實心 `--chart-total`）；axe 加「試算計算後展開 `scenario-sensitivity`」狀態（desktop、laptop、tablet 共 16，mobile 共 15）；邊界規則（x 固定 [−90%, +100%]、L＝0、超出範圍、stale、三點未填）；`thresholdDescription` 搬到可共用處（字不改）。實作卡：G15、G16。

**依賴**：V4-4；D-V4-20。

**允許變動畫面**：07（試算）。

**驗收重點**：X29：敏感度輸入預設空白不變、G16 所有點 x 在 [−90%, +100%]、不外插；A′ 時 G16 沒有連線；golden 試算 284.00／264.00／19.70 不變；「載入示範資料到第一個結果」的鍵盤步數不增加（D-V3-27 現況）；`chart-scenarios-variance` 全頁 1 個（M6）、`chart-scenarios-threshold` 在每個 `scenario-{n}` 內各 1 個；G15 頂不晚於 V4-0 量到的方案比較表區塊頂＋24px（B1）；G15、G16 的柱與點不可點（PRD §8.7 例外）；試算頁主層獨立圖區塊＝1；`scenarios.chartsV4.variance.title.*` 都含「試算後」；總覽頁 `main .chart-frame:visible` 數量不變（仍是 4；以 `hidden` 藏起來的試算工作台內的 G15 不算進去）。

**同批 labels 與測試**：`scenarios.chartsV4.{variance, threshold}`；新增 `tests/chart-threshold.test.ts`、`tests/charts-scenarios-v4.test.tsx`；擴 `tests/scenario-sensitivity.test.ts`、`tests/decision.test.ts`、`tests/scenario-page-v3.test.tsx`、`tests/e2e/axe-sweep.spec.ts`；mounted-testids 的 `scenario-\d+` 容器規則與 V4-5 錨點；新增 `tests/e2e/charts-scenarios.spec.ts`。

**相關拍板**：D-V4-20。

---

## V4-6 會議紀錄（M）

**範圍**：C26＋G19（`meetingSeries`／`meeting-series-v1`：資料集、通路集合、本期天數或比較方式改變處斷段，同本期重複會議只畫最新；資料表與刻度寫資料本期；`variant="inline"`、`headingLevel={3}`，放在 `meeting-history` 內）；G15 第二實例（議程 5，`chart-meeting-scenarios`，`variant="inline"`；每通路一根、上限 6 根，其餘只列在資料表；標題「{n} 個通路的選入方案」，不跨通路挑最大值）；G19 最後一點（最近一次已結束的會議）用 `--chart-total` 3px 實心，不用強調色。G18 經審查取消（PRD §2.3）：與上次比較表只有兩列、不同指標，維持 v3 原樣。實作卡：G15（會議）、G19。

**依賴**：V4-5。

**允許變動畫面**：08（會議）。

**驗收重點**：歷史 < 2 筆等高空狀態；跨資料集斷段並標「不同資料集」、期間長度或比較方式不同斷段並標「期間不同」；`meeting-compare-kpis` 與 v3 相同（沒有新 testid）；投影只顯示議程 1–2（`present-mode.spec` 會議頁斷言不變）；沒有 `.panel` 套 `.panel`；stale 方案不畫條；7 個通路各選一個方案時只畫 6 根、資料表 7 列；G19 沒有任何點用 `chartColors.current`；會議頁主層獨立圖區塊＝2。

**同批 labels 與測試**：`meeting.chartsV4.{history, scenarios}`；新增 `tests/chart-meeting.test.ts`；擴 `tests/meeting-page.test.tsx`、`tests/meeting-page-v3.test.tsx`；新增 `tests/e2e/charts-meeting.spec.ts`；mounted-testids V4-6 錨點。

---

## V4-7a 資料來源（M）

**範圍**：C30 Timeline＋G20（`coverageTimeline`／`coverage-timeline-v1`；最長缺列區段只有 1 天時用 `title.missingOneDay`；期間區帶直接標「上期」「本期」，去年同期畫成上方細線加文字，不和缺列虛線框同形同色；點缺列段篩問題表）；`chartRowHeights.axis`；`DataWorkspace` 持有 `issueFilter`，`IssueList` 加選填篩選與清除鈕（下載內容不變）；C28（matrix）＋G21（`issueDistribution`／`issue-distribution-v1`，`variant="inline"`、`mode="table"` 放在 `data-issues` 內；列級與範圍級問題都是 0 筆時不渲染；只有一格時用 `title.single`）；axe 加「匯入 `fixtures/errors/missing_ad_day` 後的資料來源頁（含 G20 缺列段、G21 與篩選後的問題表）」狀態（desktop、laptop、tablet 共 17，mobile 共 16）。實作卡：G20、G21。

**依賴**：V4-6。

**允許變動畫面**：09（資料來源）。

**驗收重點**：範圍級缺列退回文字；匯入 `fixtures/errors/missing_ad_day` 後點 `chart-data-coverage-seg-ads-MARKETPLACE-2026-08-02`，問題表只剩該檔該通路該原因的列、`data-issues` 進入可視範圍、篩選片語可見、清除後回到全部；合成資料的缺費用列區段同樣可篩；格加總＝列級問題筆數；`missing_ad_day` 的 G20 標題用單日模板、G21 標題用單格模板（不出現「8/2 到 8/2」與「最多」）；示範資料不渲染 G21、G20 標題為「沒有缺列」；G20 頂 ≤ 900（B1）；`network-log.spec` 下載集合不變；資料來源頁主層獨立圖區塊：示範資料 1、有問題時 2。

**同批 labels 與測試**：`data.chartsV4.*`；新增 `tests/chart-coverage.test.ts`、`tests/chart-issues.test.ts`；擴 `tests/issue-list-v3.test.tsx`、`tests/data-workspace-v3.test.tsx`、`tests/chart-geometry-v4.test.ts`（`timelineGeometry`）、`tests/chart-theme.test.ts`（`chartRowHeights.axis`）、`tests/e2e/axe-sweep.spec.ts`；新增 `tests/e2e/charts-data.spec.ts`；mounted-testids V4-7a 錨點。

---

## V4-7b 匯入精靈與抽屜（M）

**範圍**：G22（精靈步驟 4 對帳表 variance：差額＝0 不畫條並標「相符」；資料來源前處理表 pair）；G23（階梯表 share 條；色依列的角色：扣項為負用有利色，小計與結果列為負用不利色）；`ladderMetrics` 搬到 `src/application/evidence-ladder.ts` 並匯出（V4-3a 已修正，本批只搬移，邏輯不再改）。實作卡：G22、G23。

**依賴**：V4-7a。

**允許變動畫面**：03（抽屜）、12（匯入精靈步驟 4）。

**驗收重點**：匯入路徑點擊數不變、`import.spec` 步驟 4 定位器不變；對帳表差額 ≠ 0 的列才有條；`ladderMetrics` 搬移前後輸出相同；合成資料中扣項為負的通路，抽屜該列條為有利色；抽屜高度與寬度規則不變；`network-log.spec` 下載集合不變。

**同批 labels 與測試**：`importWizard.chartsV4.*`、`evidence.chartsV4.*`；新增 `tests/evidence-ladder.test.ts`；擴 `tests/import-wizard-v3.test.tsx`、`tests/evidence-drawer-v3.test.tsx`、`tests/bar-cell.test.ts`；E2E 擴 `charts-data.spec`、`import-wizard.spec`；mounted-testids V4-7b 錨點。

---

## V4-8 投影與四尺寸總檢（M）

**範圍**：投影白名單（`src/app/globals.css:2563` 的 `:not(...)`）加 `.bridge-section`：只顯示瀑布（柱上標值是 L1），拆解區改單欄，`.bridge-table-wrap`（橋接表，L3，含 G6）、v2 四欄 `<details>` 與 `.data-alternative` 隱藏但掛載（D-V4-8；X39 只要求瀑布可見）；`--text-12` 與 `--text-13` 在投影都對應 14px（D-V4-9，只重新對應 token 的值）；其餘新圖隱藏但掛載（M1）；D-V3-33、34 只在使用者回覆後處理；D-V4-35 回覆 B 而 V4-1 開工時尚未回覆的，本批把本期一句話改用與 G1 同一規則的新字串（`overview.chartsV4.*`，既有字串保留）；七頁 390 總檢；mounted-testids 全頁；keyboard-walk 補齊尚未加的頁的「第一張圖的資料表 summary」里程碑（商品頁 V4-4 已加；`[aria-hidden=true]` 停留點斷言 V4-0a 已加）。

**依賴**：V4-1 到 V4-7b；D-V4-8、9、33；D-V4-35（只在回覆 B 時）。

**允許變動畫面**：只允許 mobile 專案中本批為 390 總檢修正的畫面（逐張寫理由）；投影不在截圖基準內。

**驗收重點**：投影中 `bridge-waterfall` 可見、`bridge-table` 不可見（X39、投影只顯示 L1）；字級種類 11 不變（design-lint）；`present-mode.test` 斷言對應後 12 ≤ 13；七頁 `scrollWidth ≤ 390`；投影 axe 0 serious；各頁里程碑 Tab 數不晚於 V4-0（總覽 KPI 前可聚焦 ≤ 10）；圖內停留點 0。

**同批 labels 與測試**：`tests/present-mode.test.tsx`（解析 C 區段的斷言、白名單、`--text-12` 與 `--text-13` 對應、不新增字級原值）、`tests/e2e/present-mode.spec.ts`、`tests/e2e/keyboard-walk.spec.ts`；`shell.presentV3` 既有字串不改；本批不加新 key。

**相關拍板**：D-V4-8、9、33、35；D-V3-33、34（回覆後）。

---

## V4-9a 匯出（一）PDF 與 PPT（M）

**範圍**：C31 PrintChart（G1 三個版本；G2 標準與客戶附錄，依 D-V4-11；灰階：起訖與小計淺灰底加 `ink` 外框、有利 `chartFavorable` 實心、不利 `ink` 實心加「−」，三者兩兩不同）；C32 pptChart（G1 原生瀑布；輔助系列以 `exports.chartsV4.*` 命名為「圖形用，非金額」，有利與不利兩個系列存的是柱高，名稱標明「絕對值，圖形用」，資料標籤用帶「−」的數字格式；數值由 `bridgeWaterfall().bars` 精確字串換算；V4-0b spike 不成立時改 `addShape`；放在哪一張投影片依 D-V4-34，建議 A：新增第二張，既有第一張的一句話、KPI、三件事、通路表、決議、置頂待辦一個都不動，`tests/pptx-export.test.ts:280-289` 的「只有 1 張」斷言同批改為 2 張）；`EXPORT_THEME` 加 `chartCurrent`、`chartPrevious`、`chartTotal`、`chartUnfavorable`、`chartFavorable`、`chartSeg1`–`chartSeg3`；`ExportVariantSpec` 加 `charts` 欄位。

**依賴**：V4-8；D-V4-10、11、34。

**允許變動畫面**：無（匯出不在截圖基準內）。

**驗收重點**：老闆版 PDF 維持 1 頁、標準與客戶依 D-V4-11（v3.0.0：老闆 1、標準 2、客戶 2）；`svg[data-print-chart]` 數量符合變體矩陣；PDF 灰階三種填色兩兩不同（`tests/export-theme.test.ts`）、不利帶「−」、圖例用 SVG 線段；PPT chart part 數、系列色屬於 `EXPORT_THEME`、`ppt/media/` 為空、負柱不被切（`valAxisMinVal`／`valAxisMaxVal` 依資料）、內嵌資料的輔助系列名等於 labels 字串（有利與不利系列名標明絕對值）、資料標籤帶「−」、數值與 `bars` 精確值相同；投影片張數依 D-V4-34，既有區塊（一句話、KPI、三件事、通路表、決議、置頂待辦）在三個變體逐項仍在；三變體數字逐格相同；`network-log.spec` 下載集合不變（仍恰好是 `analysis_csv`、`backup`、`decision_json`、`excel`、`pptx`）。

**同批 labels 與測試**：`exports.chartsV4.*`（PPT 圖標題、輔助系列名、PDF 圖說）；擴 `tests/export-variants.test.ts`、`tests/export-header.test.ts`、`tests/pptx-export.test.ts`、`tests/export-theme.test.ts`、`tests/e2e/export-variants.spec.ts`。

**相關拍板**：D-V4-10、11、34。

**另需的人工時間**：PPT 在使用者指定的簡報軟體開檔檢查（含「編輯資料」裡的輔助系列名）、PDF 列印檢查並截圖，約半天。

---

## V4-9b 匯出（二）Excel 與 Markdown（M）

**範圍**：C34「圖表資料」工作表（標準與客戶版；每張圖一段：標題列＝結論句、欄序＝C33 的欄；G15、G16 不放，`ExcelExportInput`（`src/application/excel-export.ts:40-56`）沒有試算資料、兩個呼叫端也沒有傳 `ScenarioWorkspace`，試算結果已在決策 JSON 與 Markdown；G7b 由 `excel-export` 自行呼叫 `channelWeeks`（通路 ≤ 8）；段末一列「版本與算法」與技術工作表（basis 工作表，`excel-export.ts:275-288` 的 `technical(...)`）的 B 級版本列都依 `spec.appendix.technical` 決定：標準版有，客戶版省略（v3 F14：客戶報告版拿掉技術細節，`technical` 本來就只在 `spec.appendix.technical` 時輸出））；Markdown 一頁摘要加九項差額表（Markdown 沒有版本之分，`src/application/export-variants.ts:19`、`tests/e2e/export-variants.spec.ts:19`；選老闆版或客戶版時也有這張表；若要讓 Markdown 跟著版本變，屬新行為，需另行拍板，本批不做）；`tests/helpers/export-normalize.ts` 加 `isChartV4MarkdownLine`、`isChartV4Sheet` 排除，另加列級的 `isChartV4VersionRow`（比照 V3-9a 的 `isBreakevenExcelRow`，`:37`），排除 basis 工作表新加的 B 級版本列（工作表層級的排除擋不掉 basis 工作表裡的新列）；CSV、JSON 不動（D-V4-13）。

**依賴**：V4-9a；D-V4-12、13。

**允許變動畫面**：無。

**驗收重點**：正規化後 sha256 與 V3-7 基準相同；`tests/fixtures/export-numeric-baseline.json` 逐字相同、`tests/export-numeric-stability.test.ts` 不改且通過；Excel 工作表數：老闆 2、標準 8、客戶 8；標準版「圖表資料」每段有版本列、技術工作表列出 B 級版本，客戶版兩者都沒有（斷言）；「圖表資料」沒有 G15、G16 段；Markdown 三種選擇輸出相同且都有九項差額表；記錄 Excel 檔案大小差；CSV、JSON 逐字相同。

**同批 labels 與測試**：`exports.chartsV4.*`（工作表名、版本列名）；擴 `tests/excel-export.test.ts`、`tests/export.test.ts`。

**相關拍板**：D-V4-12、13。

**另需的人工時間**：Excel 開檔檢查約半天。

---

## V4-10 P2 圖表（M；可整批延後）

**範圍**：G8（`cumulativeDaily`／`cumulative-daily-v1`；兩期日序列由 `pnl-table.ts` 的 `dayColumns` 抽出並匯出的 `periodDailyMetrics` 取得，`buildPnlTable` 輸出不變；交叉日規則見 PRD §4.2；累計抽屜 `valueKind: "level"`；總覽進階 `<details>` 內）；G17（`actionDueBuckets`／`action-due-buckets-v1`，7 天內＝今天到今天＋6 天；待辦頁頭小表）；G24（`src/components/charts/products-scatter-lazy.tsx`，`next/dynamic`，商品頁進階 `<details>`）與首載證明；C24 count 模式；P2 圖的 Excel 段落（G8；版本列依 `spec.appendix.technical`，客戶版省略）；axe 加「待辦頁新增一張卡」狀態（G17；desktop、laptop、tablet 共 18，mobile 共 17）。時間不夠時逐張記為「未做」，不影響上線。實作卡：G8、G17、G24。

**依賴**：V4-9b；D-V4-12、21、22。

**允許變動畫面**：04（待辦，G17）、06（商品，G24 的 `<details>` 列）；G8 在收合的進階區內，02 應 0 差異。

**驗收重點**：兩期末日累計各＝該期合計（示範本期 1,269,792.73、上期 1,868,626.68；golden 單日 255.00）；`periodDailyMetrics(report.current)` 與 `buildPnlTable(snapshot, "day")` 的日欄逐格相同，`tests/pnl-table.test.ts` 不改且通過；累計抽屜大數字不帶「+」；四桶加總＝未完成待辦數；散佈圖 chunk 不在首頁 HTML 腳本清單（以 build 產出的 chunk 檔名判定）；First Load JS 仍 ≤ 545,397；X37 仍成立（總覽主層 4；`main .chart-frame:visible` 收合時 4、展開進階後 5，G8 的等高比較只在展開狀態下做）；不畫等速目標線。

**同批 labels 與測試**：`overview.chartsV4.cumulative`、`actions.chartsV4.due`、`products.chartsV4.scatter`；新增 `tests/chart-cumulative.test.ts`、`tests/chart-actions.test.ts`；擴 `tests/charts-products-v4.test.tsx`（V4-4 建立）、`tests/evidence-drawer-v3.test.tsx`；E2E 擴 `charts-overview`、`charts-products`、`action-workspace.spec`、`axe-sweep.spec`；mounted-testids V4-10 錨點。

**相關拍板**：D-V4-12、21、22。

---

## V4-11 收尾與上線（M）

**範圍**：棘輪與 chart-lint 上限調到實測；`chartCategoryColors`、`readChartColors`（`src/application/chart-theme.ts:23、40-53`）接用或保留並註明理由；`docs/STATUS.md`、`docs/DECISIONS.md`、`docs/RELEASES.md`（版本依 D-V4-1；Excel 新工作表、PPT 版面屬使用者可見變更）、README；`feature-retention.csv` 全表打勾；PRD §2.2 全部指標填真實值；Lighthouse、axe、首屏、13 項 HTTP（`scripts/launch-check.mjs`）；tag 與正式站（需使用者當次明確同意）。**不加功能、不加新 key。**

**依賴**：全部（V4-10 延後時依賴 V4-9b）；D-V4-1、28；H6 擋正式上線。

**允許變動畫面**：無（若有調整，逐張寫理由）。

**驗收重點**：§2.2 B、C 全部指標達標或誠實列出未達標與原因；A 由 H6 補上，未完成時 STATUS 寫「未執行／待人工」；禁區四條命令皆空；testid 三份基準刪除 0。

**同批 labels 與測試**：不加新 key；全套測試。

**相關拍板**：D-V4-1、28。

**另需的人工時間**：H6 約 1 週。

---

## 圖表護欄與棘輪時程（PRD §2.2、§7.9、§8）

| 指標 | V4-0 基準（v3.0.0，V4-0a 實測） | 規則與時程 |
|---|---|---|
| design-lint 15 項（`tests/fixtures/design-lint-ceiling.json`） | hex 0、圓角 4、字級 11、字距 0、箭頭 3、其餘 0 | 每批不升；字級種類 11 在 V4-8（投影對應 14px）仍不變；V4-11 調到實測 |
| copy-style（`tests/fixtures/copy-style-ceiling.json`） | 同義詞 12、其餘 0 | 每批不升；新 key 0 違規；D-V3-37 未決，既有 12 筆不動 |
| chart-lint CL-1–CL-11（`tests/fixtures/chart-lint-ceiling.json`） | V4-0a 實測（目標全 0） | V4-0a 起每批不升；V4-11 調到實測 |
| labels 既有字串（`verification/revamp-v4/labels-v3.flat.json`） | 2,581 個葉節點 | 每批逐鍵逐字相同；新葉節點只在 `V4_NEW_KEY_PREFIXES` 下 |
| testid 刪除數 | v2 基準 228 列；v3 基準由 V4-0a 三步產生（實數以產出為準）；`testids-v4-added.txt`（V4-0a 空檔） | 每批 0（三份都比）；V4-1 起每批把本批新增的 testid 追加到 `testids-v4-added.txt` |
| mounted-testids M6（`chart-` 唯一性） | v3.0.0 沒有 `chart-` 開頭的 testid，違規 0 | 每批：`chart-` 開頭的 testid 在實例容器外恰好 1 次 |
| First Load JS gzip | 519,426 bytes | 每批 ≤ 545,397（依 D-V4-24）；驗收列出首載 chunk 清單與各自 gzip 大小（人工比對，不逐一斷言） |
| 首載 chunk 的 `Treemap`、`Sankey`、`Funnel`、`PieChart`、`RadarChart` | 0 | 每批 0 |
| B2 首屏 | 1440：一句話頂 192、KPI 帶底 419、三件事首列底 561；1280：V4-0a 實測一句話頂 192、KPI 帶底 419、三件事首列底 583（`metrics.spec` 的 `B2_LAPTOP_RECORDED`，V4-1 起改成斷言 ≤ 192、≤ 583）；390：扣廣告後貢獻值頂 295 | 每批硬斷言：1440 ≤ 192、≤ 420、≤ 561；1280 KPI 帶底 ≤ 420，一句話頂與三件事首列底不晚於 V4-0a 實測；390 ≤ 295 |
| B1 首屏有圖（1440） | 總覽第一張 `.chart-frame` 頂（V4-0a 記錄）；健檢 G10 插入處頂（參考，依截圖約 2,225px）；試算方案比較表區塊頂 | 總覽每批不晚於 V4-0a；健檢第一個 G9 內嵌條頂 ≤ 900（V4-3a 起）；商品第一張 `.chart-frame` 頂 ≤ 900（V4-4 起）；試算 G15 頂 ≤ 方案比較表區塊頂（V4-0a）＋24px（V4-5 起）；資料來源 G20 頂 ≤ 900（V4-7a 起） |
| B8 主層否定句（`tests/copy-density.test.ts`） | 五頁各 ≤ 3（`:67-94`；商品、待辦兩頁沒有測） | V4-0a 把五頁上限改成實測值並加商品、待辦兩頁（七頁），之後只降不升；新圖在主層新增的否定句 0（限制句放 `<details>` 或抽屜） |
| B9 DOM 節點數 | 七頁在 1440 與 390 載入示範資料後（V4-0a 記錄） | V4-1 起每批各頁 ≤ 基準＋1,500（硬斷言） |
| 每頁主層獨立圖區塊（CL-9，`section.chart-section`） | 總覽 4、其餘 0 | 上限 3（總覽 4）；各批進入值見 `CHART_CATALOG.md` §9.4 |
| `.chart-frame` 等高與 CLS | 總覽 4 框等高、CLS < 0.05 | 每批：所有頁 `main .chart-frame:visible` 切換期間高度差 0（G14、G21 只在前後都渲染時比較；G8、G12 只在展開狀態下比較；以 `hidden` 藏起來的試算工作台內的框不收）、CLS < 0.05；可見數量：總覽 4（V4-10 起展開進階後 5），V4-5 起總覽仍是 4 |
| 390 頁面橫向捲動 | 通過 | 每批七頁 `scrollWidth ≤ 390`；只允許 `.chart-frame.waterfall` 與 `.table-scroll` 內部捲動 |
| Lighthouse | Accessibility：v3 六頁 1440 與 390 全 100；資料來源、待辦兩頁 V4-0a 新量。Performance（只有空狀態首頁的 navigation 有分數，只反映首載 bundle）：1440 100、390 92。390 TBT：載入示範資料 v3.0.0 驗收 1,667 ms（loadavg 4.73；V3-9b 為 972 ms），切到通路健檢 1,330 ms、切到會議紀錄 1,718 ms（V3-10 只記錄、沒有門檻）；V4-0a 對五個 timespan（載入示範資料、切到健檢、商品、會議、資料來源）在低負載下各連跑 3 次取中位數 | 每批 a11y 不低於同頁基準且 ≥ 95；Performance 1440 ≥ 97、390 ≥ 90（只代表首載）；五個 TBT 各 ≤ V4-0a 中位數 × 1.1（超過且負載高時重跑，低負載重跑仍超過才算未通過） |
| axe 四尺寸 | desktop、laptop、tablet 各 11 個狀態、mobile 10 個（mobile 沒有投影模式），0 serious | 每批 0 serious／critical；狀態數（desktop、laptop、tablet／mobile）：V4-3b 起 14／13（資料表展開、從圖下鑽的抽屜、合成資料健檢頁）、V4-4 起 15／14（合成資料商品頁）、V4-5 起 16／15（試算後展開 `scenario-sensitivity`）、V4-7a 起 17／16（`missing_ad_day` 資料來源頁）、V4-10 起 18／17（待辦頁一張卡）；示範資料下 G14、G16、G17、G20 缺列段、G21 都不渲染，不加這些狀態就掃不到 |
| keyboard-walk | 各頁里程碑 Tab 數（V4-0a 記錄）；KPI 前可聚焦 10；`[aria-hidden=true]` 內停留點 0 | 每批不晚於 V4-0a；KPI 前 ≤ 10；`aria-hidden` 內停留點 0（V4-0a 起）；健檢頁經過熱表 ≤ 3（V4-3b 起）；「第一張圖的資料表 summary」里程碑：商品頁 V4-4 起，其餘頁由各頁批次或 V4-8 補齊 |
| network-log 下載集合 | `analysis_csv`、`backup`、`decision_json`、`excel`、`pptx` | 每批恰好這 5 種；無 POST |
| 禁區檢查（D-V4-3） | 對 `82b70df`：V3-10 驗收為空 | 每批第 8 步四條命令皆空（含 `assist-kpi-v1`、`breakeven-mer-v1` 所在檔與既有測試的 diff、`git status --porcelain` 的未追蹤檔）；commit 後 `git diff --stat 625bfa5 HEAD -- …` 為空，commit hash 寫進驗收 |
| 畫面基準 | 52 張（V4-0a 建立；36 張與 V3-10 差異 0） | 每批只允許該批「允許變動畫面」有差異（比對流程見共同規則） |
| 新 token 與常數 | — | V4-1 `chartRowHeights`（常數，不是 token；D-V4-33 未回覆、V4-1 不做 G6 時順延到 V4-2）；V4-2 `--chart-target`、`--chart-h-xs`；V4-3a `--chart-seg-1..3`；V4-3b `--red-100`、`--chart-heat-1..2`、`--chart-missing`；V4-7a `chartRowHeights.axis`；V4-9a `EXPORT_THEME` 圖表色；每個 token 都進 contrast-check PAIRS 與 `chart-theme.test` |
| labels 新 key 數 | 0 | 每批驗收記錄新增數與錨點位置；V4-11 不加 |

---

## 每批共同產物清單

| 產物 | 位置 |
|---|---|
| 驗收文件 | `verification/revamp-v4-V4-{n}-acceptance.md` |
| 截圖與量測 | `verification/revamp-v4/V4-{n}/`（四尺寸截圖、`snapshots/`、`ui-audit.json`、`metrics.json`、`lighthouse/`、axe、keyboard-walk、network-log） |
| 功能保留 | `verification/revamp-v4/feature-retention.csv` 逐列打勾 |
| E2E 文字斷言 | `verification/revamp-v4/e2e-text-assertions.csv` 勾銷 |
| 狀態與決策 | `docs/STATUS.md`、必要時 `docs/DECISIONS.md`、本檔進度欄 |
