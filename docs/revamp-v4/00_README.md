# EC ProfitLens Revamp v4 — 套件說明

v4 回應使用者 2026-10-08 的指令「改版：將全站加入更多專業視覺化元素，以專業圖表的方式呈現為主要」：把 v3.0.0「首屏有結論、數字可追溯」的工具，改成「每一頁的主要閱讀任務都先用一張專業圖回答，表格退為核對與替代」。**v4 不新增財務口徑、不刪任何功能、不加任何依賴。**

這個資料夾是給 Claude Code 讀的工作底稿，也是使用者拍板與人工審查用的產品文件。

| 項目 | 內容 |
|---|---|
| 基準版本 | v3.0.0（tag `v3.0.0`＝`625bfa5`；分支 `revamp/v2`＝`main`＝`21d621c`；正式站 https://profitlens-tau.vercel.app 已是 v3.0.0） |
| 目標版本 | 依 D-V4-1 建議值暫定 **v4.0.0**（使用者未回覆前不視為核准） |
| 工作分支 | 依 D-V4-2 建議值暫定自 `main` 開 `revamp/v4` |
| 狀態 | **V4-0a 到 V4-8b 完成**（MVP 切線已到；D-V4-1–55 與 D-V3-26／27／29–37 已拍板，D-V4-56–63 依建議值；新增 V4-7c、V4-3c，V4-8 拆成 V4-8a、V4-8b，共 19 批；V4-8b 完成，V4-9a 起連續進行到 V4-11、最後不部署） |
| 產品名稱 | EC ProfitLens（D-V3-25）；技術識別不改：package 名 `profitlens`、下載檔名前綴 `profitlens-`、備份 schema `profitlens-workspace-v5`、`dataset_id`、網址 `profitlens-tau.vercel.app` |

## 檔案與用途

| 檔案 | 給誰 | 內容 |
|---|---|---|
| `../../CLAUDE.md` | Claude Code | 每個工作階段的規則（補充 `AGENTS.md`，AGENTS.md 優先）。v4 開工時以本檔末節「CLAUDE.md 更新草案」整份取代，要使用者同意開工後才改 |
| `01_PRD.md` | 使用者＋Claude Code | **規格本體**：決策摘要（§0）、問題（§1）、目標與指標 A／B／C（§2）、各頁「改成圖／維持表／刻意不加圖」決策表（§2.3）、圖表總目錄 G1–G24（G18 取消，§4）、各頁需求與高度預算（§5）、元件 C16–C19 升級與 C24–C35、application 函式、token（§6）、圖表規範與 X26–X40、chart-lint CL-1–CL-11（§7）、非功能（§8）、批次概要（§9）、風險與拍板（§10） |
| `CHART_CATALOG.md` | Claude Code | 每張圖一張實作卡：資料函式與欄位（附檔案:行號）、等級與版本常數、技術、ChartFrame props、標題與 labels key、testid、資料表、鍵盤、抽屜 selection、390、投影、匯出、單元測試、E2E 斷言草案；另有元件、B 級函式、token、匯出的彙總 |
| `06_BATCHES.md` | Claude Code | V4-0a–V4-11 分批任務（由 PRD §9 展開，共 16 批）、人工關卡 H5／H6、畫面基準的跨批比對流程、各批允許變動畫面、圖表護欄與棘輪時程、目前進度 |
| `09_DECISIONS_PENDING.md` | 使用者 | D-V4-1–35 拍板表（選項、建議、影響批次、決定）；D-V4-29 的 v3 待拍板對照；需要使用者提供的材料 |
| `GLOSSARY.md` | Claude Code＋審稿者 | V4-0a 產出：v4 新增的圖名與介面用語（一個概念一個詞，例如累計概念寫「累計」，不寫同義的「累積」；「週」一律從期間起日每 7 天一段；試算結果的方向詞前一定加「試算後」；商品頁只寫「商品毛利為負」，「賠錢」「虧損」是商品頁禁用詞；「通路費用合計」＝四項通路費用相加），其餘沿用 `../revamp-v3/GLOSSARY.md` |
| `usability-test.md` | 主持人（H6） | V4-0a 產出：沿用 v3 腳本，加 v4 任務 T1–T4 與 A4 盲評題，每題附答案鍵（T1 問「貢獻變化拆解中扣最多的一項」，答案商品成本 −157.5 萬，PRD §2.2 A1；T4 用 `fixtures/errors/missing_ad_day`）；H6 同場量 v3 正式站與 v4 preview |
| `../revamp-v3/*` | 參考 | v3 規格與歷史紀錄。v3 PRD 的 §5.2 X1–X25、§4.3 刻意不採用、§8 語言規範、§9 token 與元件、§11 非功能仍然有效；與 v4 衝突時以 v4 為準（X18 的改寫依 D-V4-33） |
| `../../verification/revamp-v4/` | Claude Code | V4-0a、V4-0b 的基準與護欄產物（見「驗收產物」）與每批截圖、量測 `V4-{n}/` |

## 怎麼使用

1. **先看拍板**：`09_DECISIONS_PENDING.md`。擋住 V4-0a 的是 D-V4-1、2、3、15、23、24、25、26、27；擋住 V4-0b 的另有 D-V4-31；擋住 V4-1 的另有 D-V4-4、5、7、14、30，V4-1 的 G6 另依 D-V4-33（共 16 件）。其餘各批的擋批拍板見下表「拍板」欄。可以一次回覆「全部依建議值」，或逐項回覆；回覆後把「決定」欄填上，並在 `docs/DECISIONS.md` 記一筆。沒有明確回覆的事項不視為核准，受影響的批次不開工。
2. **一個工作階段只做一批**：照 `06_BATCHES.md` 的順序，開工時告訴 Claude Code「做 V4-{n}」。Claude Code 每次都先讀 `AGENTS.md`、`CLAUDE.md`、本檔、`06_BATCHES.md` 的該批段落、`CHART_CATALOG.md` 中該批的實作卡，以及該批引用的 PRD 章節。
3. **名詞與文案**：沿用 `../revamp-v3/GLOSSARY.md`，v4 新增的圖名與用語以本資料夾的 `GLOSSARY.md` 為準；新字串只放 `src/i18n/labels.zh-TW.ts` 的 `{group}.chartsV4.*`，既有字串一字不改（V4-0a 起由 `verification/revamp-v4/labels-v3.flat.json` 逐字核對）。
4. **人工關卡照表安排**（下一節）；H5 沒過（也沒有明確略過），V4-1 不開工；H6 沒過，v4.0.0 不切正式站。
5. **每批結束看回報**（格式見本檔「每批回報格式」）；全部檢查通過，才開下一批。
6. **部署**：V4-2 之後（MVP 切線）可以部署 Vercel preview 讓老闆試用，正式站到 V4-11 才切；**每一次部署（含 preview）都要使用者當次明確同意**（D-V4-28 只定策略）。

本套件寫「V4-0」時指 V4-0a、V4-0b 兩批合稱；「V4-0 實測」「V4-0 基準」都是 V4-0a 量到的 v3.0.0 值。

## 批次順序

| 批次 | 主題 | 大小 | 依賴 | 拍板（擋批） | 另需的人工時間 |
|---|---|---|---|---|---|
| V4-0a | 基準與護欄（不改任何 UI） | M | — | D-V4-1、2、3、15、23、24、25、26、27 | — |
| V4-0b | 設計稿、PPT spike 與合成資料（不改任何 UI） | M | V4-0a | D-V4-31（D-V4-10、34 的 spike 結果回報後確認；D-V4-27＝B 時不產出設計稿） | H5 設計稿在本批產出 |
| V4-1 | 總覽拆解與圖表框（G1、G2、G6） | M | V4-0b、**H5** | D-V4-4、5、7、14、30；G6 另依 D-V4-33；D-V4-35 只在回覆 B 時 | H5：2–3 工作天（可比照 v3 略過） |
| V4-2 | 總覽其他圖（G3、G4、G5、G7a；**MVP 切線**） | M | V4-1 | D-V4-6、16、18；D-V3-35（只在回覆 A 後） | 老闆試用 preview（需當次同意，D-V4-28） |
| V4-3a | 通路健檢（一）（G9、G10、G7b） | M | V4-2 | D-V4-6、18、19、32（與 D-V3-31） | — |
| V4-3b | 通路健檢（二）（G11、G12；下鑽加日期與 SKU） | M | V4-3a | D-V4-17、18 | — |
| V4-4 | 商品毛利（G13、G14） | M | V4-3b | — | — |
| V4-5 | 假設試算（G15、G16） | M | V4-4 | D-V4-20 | — |
| V4-6 | 會議紀錄（G19、G15 會議實例；G18 取消） | M | V4-5 | — | — |
| V4-7a | 資料來源（G20、G21、問題表篩選） | M | V4-6 | — | — |
| V4-7b | 匯入精靈與抽屜（G22、G23、`ladderMetrics` 搬移） | M | V4-7a | — | — |
| V4-8a | 投影與期間列（2026-10-13 由 V4-8 拆出） | M | V4-7c | D-V4-8、9、33；D-V3-33、34、35；D-V4-45 B | — |
| V4-8b | 四尺寸總檢與隨頁載入狀態（2026-10-13 由 V4-8 拆出） | M | V4-8a | D-V4-44 B；D-V4-56–63 | — |
| V4-9a | 匯出（一）PDF 與 PPT | M | V4-8b | D-V4-10、11、34 | 開檔檢查半天 |
| V4-9b | 匯出（二）Excel 與 Markdown | M | V4-9a | D-V4-12、13 | 開檔檢查半天 |
| V4-10 | P2 圖表（G8、G17、G24；可整批延後） | M | V4-9b | D-V4-12、21、22 | — |
| V4-11 | 收尾與上線 | M | 全部、**H6** | D-V4-1、28 | H6：約 1 週 |

- 16 批、**至少** 16 個工作階段。V4-0 與 V4-7 已在開工前依工作量拆成 a／b；之後任何一批在開工前判斷太大時，同樣拆成 a／b 並寫進 `06_BATCHES.md`。依 v3 經驗，M 批約需 3 個實作代理與 3 個 E2E 代理。人工時間合計約 1.5–2 週。D-V4-3（禁區 diff 基準）每批都適用，在 V4-0a 回覆即可。
- **MVP 切線**＝V4-0a 到 V4-2：總覽改版完整。
- 目前進度：**V4-0a 到 V4-8b 完成（2026-10-13）**；MVP 切線已到（preview 部署需使用者當次同意）。D-V4-1–41 與 D-V3-26／27／29–37 已依建議值拍板；新增批次 V4-7c（匯入時間寫進備份）；D-V4-42＝A（2026-10-09），新增批次 V4-3c 首載瘦身：完成（First Load JS 499,443）；D-V4-43＝A、D-V4-44＝B＋C（B 排入 V4-8，C 排入 V4-11）。

## 人工關卡 H5–H6（不屬於任何批次）

| 關卡 | 內容 | 擋住 | 材料 |
|---|---|---|---|
| H5 | v4 設計稿審查（V4-0b 產出）：至少總覽、健檢、商品、資料來源四頁的 1440 與 390；2–3 位台灣電商經理人；新字串一併審 | V4-1 開工 | `verification/revamp-v4/mockups/` |
| H6 | v4 複測與盲評：5 位受試者跑 A1–A3、3 位外部盲評者跑 A4；同一場次量 v3 正式站與 v4 preview（補上從未執行的 H4） | v4.0.0 正式上線 | `usability-test.md` |

人工關卡沒完成時，`docs/STATUS.md` 寫「未執行／待人工」，不可寫成完成；批次驗收只放機器能檢查的項目。使用者可比照 v3 略過 H5（D-V4-27）。

## 驗收命令（每批都要全部跑，照這個順序，貼真實輸出摘要；沒執行的寫「未執行」＋原因）

```bash
npm ci                    # 全新環境或 lockfile 變動時
npm run typecheck
npm run lint              # eslint --max-warnings=0
npm run audit:ui -- --json verification/revamp-v4/V4-{n}/ui-audit.json   # 數值寫進驗收文件；只有帶 --json 才寫檔（scripts/ui-audit.mjs:2、12-13）
npm run contrast-check    # scripts/contrast-check.mjs；V4-0a 起含新 token 的試算與配對
npm test -- --run         # 含 design-lint、copy-style、copy-density、testid-baseline（v2＋v3＋v4 新增三份）、mounted-testids、chart-lint、labels-structure
npm run build
NETWORK_LOG_OUT=verification/revamp-v4/V4-{n}/network-log.json KEYBOARD_WALK_OUT=verification/revamp-v4/V4-{n}/keyboard-walk.json AXE_OUT=verification/revamp-v4/V4-{n}/axe.json npm run test:e2e
                          # 四個視窗；含 keyboard-walk、axe-sweep、network-log；首次需 npx playwright install chromium
                          # 三個環境變數沒給時，輸出只寫到 test-results（tests/e2e/keyboard-walk.spec.ts:15、205；axe-sweep.spec.ts:84；network-log.spec.ts:127）
                          # 它自己在 3100 埠起 LOCAL 伺服器（reuseExistingServer:false），必須在下面的 PUBLIC_DEMO 伺服器啟動前跑完

# capture 與 Lighthouse 共用一台 PUBLIC_DEMO production 伺服器（Lighthouse 腳本不會自己起伺服器）
NEXT_TELEMETRY_DISABLED=1 npm run build
APP_MODE=PUBLIC_DEMO PUBLIC_DEMO=true ENABLE_LIVE_AI=false npm start -- --port 3100 &

# V4-0a 新增：52 張畫面基準（跨批比對流程見 06_BATCHES.md）與 metrics.spec v4
# （V4-0a：B2、B3、B5 硬斷言，B1、B9 只記錄；V4-1 起 B9、各頁 B1 依時程硬斷言）
CAPTURE_BATCH=V4-{n} npx playwright test --config verification/revamp-v4.capture.config.ts

# Lighthouse（v3 已有腳本，V4-0a 起加資料來源、待辦兩頁，每批都跑）
npx -y lighthouse@13.5.0 --version   # 只在第一次：建立 npx 快取（scripts/lighthouse-pages.mjs:7-8）
node --no-warnings scripts/lighthouse-pages.mjs --base http://127.0.0.1:3100 --out verification/revamp-v4/V4-{n}

lsof -ti tcp:3100 | xargs kill   # 停掉 PUBLIC_DEMO 伺服器；Claude Code 每次 Bash 呼叫都是新 shell，取不到 $!
lsof -ti tcp:3100               # 必須沒有輸出，否則下一批的 test:e2e 會撞埠

# 財務核心禁區（D-V4-3；四條都必須為空）
git diff --stat 625bfa5 -- src/domain fixtures docs/METRICS.md                     # V4-0a 新增（v3.0.0 基準）
git diff --stat 82b70df -- src/domain fixtures/golden fixtures/demo fixtures/errors fixtures/refund_only fixtures/zero_ad docs/METRICS.md
git diff --stat 625bfa5 -- src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts   # V4-0a 新增：assist-kpi-v1、breakeven-mer-v1 不動
git status --porcelain -- src/domain fixtures docs/METRICS.md src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts   # V4-0a 新增：git diff 看不到未追蹤的新檔

# commit 之後（完成定義）：必須為空，commit hash 寫進驗收文件
git diff --stat 625bfa5 HEAD -- src/domain fixtures docs/METRICS.md src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts
```

- 禁區 diff 也可用 tag `v3.0.0` 取代 `625bfa5`、tag `v2.0.0` 取代 `82b70df`。**不可用 `main` 比對**。
- **chart-lint**（V4-0a 新增）：`tests/chart-lint.test.ts` 的 CL-1 到 CL-11，上限 `tests/fixtures/chart-lint-ceiling.json`，只降不升；AST 規則掃 `src/components/charts/**` 與 `src/components/overview/charts/**`（CL-3 的 `var(--chart-` 禁令擴到 `src/components/**`），CL-1、CL-2、CL-9、CL-11 用 SSR（頁面狀態來自 `tests/helpers/page-states.tsx`）；要單獨看數值時跑 `npm test -- --run tests/chart-lint.test.ts`。
- **棘輪**：`tests/design-lint.test.ts`（`tests/fixtures/design-lint-ceiling.json`）與 `tests/copy-style.test.ts` 的數值只能下降。
- **testid 基準**：刪除數對 `verification/revamp-v3/testids-v2.txt`、`verification/revamp-v4/testids-v3.txt`（V4-0a 分三步產生：ssr 列、瀏覽器收集的 e2e 列、cond 列）與 `verification/revamp-v4/testids-v4-added.txt`（V4-0a 空檔，V4-1 起每批追加本批新增的 testid）都必須為 0（新增不限，但新 testid 要符合 D-V4-25 的命名）。
- **掛載規則**：`tests/mounted-testids.test.tsx` 每批都跑（V4-0a 起頁面狀態由 `tests/helpers/page-states.tsx` 提供）；收進 `<details>`、投影隱藏的圖都保持掛載（M1）；同一控制只有一個 DOM 實例（M6），V4-0a 起另斷言 `chart-` 開頭的 testid 在實例容器外恰好出現一次。
- **labels**：`verification/revamp-v4/labels-v3.flat.json`（v3.0.0 全部 2,581 個葉節點）逐鍵逐字相同，新葉節點只在 `V4_NEW_KEY_PREFIXES` 下。
- **功能保留**：`verification/revamp-v4/feature-retention.csv`（延續 v3 的 113 列再加圖表列）：`batch` 欄等於本批的列全部打勾，該批才算完成，V4-11 全表打勾；`verification/revamp-v4/e2e-text-assertions.csv` 每批勾銷。
- **畫面基準**：每批開跑前先複製前一批的 `snapshots/`、不帶 `--update-snapshots` 比對，只允許該批「允許變動畫面」有差異（`06_BATCHES.md`）。
- **Lighthouse**：Accessibility 不低於同頁基準（v3 六頁 1440 與 390 全 100；資料來源、待辦兩頁以 V4-0a 基準為準）且 ≥ 95；Performance 分數＝空狀態首頁（navigation），只反映首載 bundle（`scripts/lighthouse-pages.mjs:79-80`），1440 ≥ 97、390 ≥ 90；圖頁的效能由 TBT 把關：390 的載入示範資料與切到通路健檢、商品毛利、會議紀錄、資料來源五個 timespan 的 TBT 各 ≤ V4-0a 中位數 × 1.1（與中位數＋50 ms 取較大者，D-V4-36）（v3.0.0 驗收的載入示範資料 1,667 ms 是在 loadavg 4.73 下量的，V4-0a 低負載各連跑 3 次取中位數）；四尺寸 axe 0 個 serious（狀態數依 PRD §2.2 C3 逐批增加）。
- **Golden 不變**：本期 255.00、差額 −315.00、試算 284.00／264.00／19.70。
- 本機預覽：`npm run dev`，網址 http://127.0.0.1:3000 。

## 驗收產物（V4-0a、V4-0b 建立，之後每批更新）

| 路徑 | 內容 |
|---|---|
| `verification/revamp-v4/V4-0-baseline.md` | v3.0.0 基準（V4-0a 建立）：ui-audit、chart-lint、First Load JS 與首載 chunk 清單、首屏位置（B1 參考位置、B2 含 1280 新量的值）、DOM 節點數（B9）、各頁否定句數（copy-density 七頁上限的依據）、8 頁 Lighthouse、390 的五個 TBT 中位數與 loadavg、axe、keyboard-walk、`--red-100` 試算；V4-0b 補 PPT spike 判讀（含 D-V4-34 兩種版面的試排）、合成資料手算值摘要、設計稿實測 |
| `verification/revamp-v4/testids-v3.txt` | v3 testid 基準（三步產生：`TESTID_BASELINE_DUMP` 的 ssr 列、`verification/revamp-v4/collect-testids.spec.ts` 收集的 e2e 列、cond 列；格式與 `testids-v2.txt` 相同） |
| `verification/revamp-v4/labels-v3.flat.json` | v3.0.0 全部 2,581 個 labels 葉節點（既有字串逐字核對用） |
| `verification/revamp-v4/feature-retention.csv` | 功能保留表：延續 v3 全部 113 列，再加每張既有圖與每張「表改圖」各一列（註明資料表替代）；表頭 `id,feature,page,v3_location,v4_location,change_type,locator,batch,status,covering_tests` |
| `verification/revamp-v4/e2e-text-assertions.csv` | E2E 非 testid 定位器清單（自 v3 延續，加「v4 批次」欄） |
| `verification/revamp-v4/V4-0b/pptx-spike.json` | PPT 原生瀑布 spike 的檢查項（成立與否由驗收文件判讀）；只在有給 `PPTX_SPIKE_OUT` 時寫檔（`PPTX_SPIKE_OUT=verification/revamp-v4/V4-0b/pptx-spike.json npx vitest run tests/pptx-chart-spike.test.ts`），之後每批跑 `npm test` 不會改寫它 |
| `verification/revamp-v4/testids-v4-added.txt` | v4 新增的 testid（V4-0a 建立空檔，V4-1 起每批追加；同 `testids-v2.txt` 格式再加批次欄） |
| `verification/revamp-v4.config.ts`、`verification/revamp-v4/collect-testids.spec.ts` | 收集 e2e 列的 Playwright 設定與 spec（比照 v3；`BASELINE`、`OUTPUT` 改成 v4 路徑） |
| `tests/helpers/page-states.tsx` | 由 `tests/mounted-testids.test.tsx` 原樣搬出並匯出的頁面狀態（`shellPage`、`load`、`wizardFiles`、`pageStates`、`statusShells`），mounted-testids 與 chart-lint 共用 |
| `verification/revamp-v4/mockups/` | H5 設計稿（V4-0b；靜態 HTML，不進 app bundle） |
| `verification/revamp-v4.capture.config.ts`、`verification/revamp-v4-capture/` | 52 張畫面基準（12 畫面 × 4 尺寸＋KPI 帶元素截圖 4 張；10–13 的拍攝狀態見 `06_BATCHES.md` V4-0a 第 9 項）、metrics.spec v4，以及畫面 13 用的 `targets.csv`（含達成與落後兩種 `kpi-target-*`） |
| `verification/revamp-v4/V4-{n}/` | 每批四尺寸截圖、`snapshots/`、`ui-audit.json`（`audit:ui -- --json`）、`metrics.json`、Lighthouse、`axe.json`、`keyboard-walk.json`、`network-log.json`（`AXE_OUT`、`KEYBOARD_WALK_OUT`、`NETWORK_LOG_OUT`） |
| `verification/revamp-v4-V4-{n}-acceptance.md` | 每批驗收文件（命令、真實結果、禁區四條命令與 commit 後的 diff、commit hash、棘輪數值、testid 刪除數、允許變動畫面的差異與理由、未執行項目） |
| `tests/fixtures/synthetic-4-channel/` | 4 通路合成資料（D-V4-31；V4-0b；不在財務禁區）：虧損通路、費用與廣告缺列日、扣項為負的通路、商品毛利為負的 SKU、門檻超出範圍的方案、結束在週中的期間 |

## 完成定義（每批共用）

- 上面的驗收命令全部真實通過，並附輸出摘要；沒執行的寫「未執行」＋原因。
- 四尺寸截圖存在 `verification/revamp-v4/V4-{n}/`；畫面基準依 `06_BATCHES.md` 的跨批比對流程，只有該批「允許變動畫面」有差異並逐張寫理由。
- `CHART_CATALOG.md` 中該批每張圖的「E2E 草案」都已落成測試（或寫明改成什麼與原因）。
- PRD §2.3 決策表逐頁對照：該批頁面沒有新增「刻意不加圖」欄位列出的圖。
- `docs/STATUS.md` 新增該批段落（真實結果；人工關卡寫「未執行／待人工」）；必要時 `docs/DECISIONS.md` 記一筆；驗收寫在 `verification/revamp-v4-V4-{n}-acceptance.md`；`06_BATCHES.md` 進度同步。
- 批次的「驗收重點」逐條標示通過／未通過，未通過的要有原因與補救批次。
- commit 訊息以 `revamp(V4-{n}): …` 開頭；不混入其他批次的改動。commit 之後跑 `git diff --stat 625bfa5 HEAD -- src/domain fixtures docs/METRICS.md src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts`，必須為空，並把 commit hash 寫進驗收文件。
- `feature-retention.csv` 中 `batch` 欄等於本批的列全部打勾。

## 每批回報格式（繁體中文，沿用 CLAUDE.md）

1. 完成項目（對照 `06_BATCHES.md` 的該批範圍，逐項標 完成／部分／未做＋原因）
2. 變更檔案清單（新增／修改／刪除）
3. 驗收命令與真實結果（通過數、失敗數、未執行），含禁區四條命令與 commit 後的 diff（附 commit hash）、棘輪數值（design-lint、copy-style、copy-density、chart-lint）、testid 刪除數（v2、v3、v4 新增三份）、First Load JS、DOM 節點數、390 的五個 TBT 與 loadavg、畫面基準差異（只列允許變動的畫面）
4. 瀏覽器驗收方式與截圖路徑（四尺寸至少各一張）
5. 已知限制與風險
6. 下一批建議、被擋住的人工關卡，以及需要人拍板的事項（對照 `09_DECISIONS_PENDING.md`）

## 不在本輪範圍（PRD §3）

不新增口徑、不改既有指標的輸入輸出、不改 `contribution-v1`、`assist-kpi-v1`、`breakeven-mer-v1`；不做預測（等速目標線、run-rate）、SKU 層分攤、龍捲風與敏感度網格；不在試算範圍 [−90%, +100%] 以外畫任何點或線；不做 gauge、健康分數、燈號、3D、漸層、陰影、圓餅、甜甜圈、雷達、樹狀圖、旭日圖、桑基、漏斗、區域圖、雙數值軸、brush、zoom、動畫、彩色圓點圖例、裝飾圖示；不改備份 schema、CSV、JSON；不加 PNG／SVG 下載入口；不做深色模式、角色切換、新頁面；F15、F16 仍待使用者提供檔案；不加任何依賴。

---

## CLAUDE.md 更新草案（v4 開工時整份取代；使用者同意開工後才改）

> 已於 2026-10-08 V4-0a 開工時整份取代（填入：目標 v4.0.0、拍板日期 2026-10-08、全部依建議值）。下方保留原草案作為紀錄。

開工時以下列內容**整份取代** `CLAUDE.md`（下方是完整檔案，不是逐段替換；「每批回報格式」已含 v4 的數值項目）。把拍板日期與結果填入〔〕標示處，填完前不要貼上。

````markdown
# EC ProfitLens — Claude Code 工作指令（Revamp v4）

EC ProfitLens 是「電商獲利診斷與決策工作台」：匯入三份日粒度 CSV（銷售、通路費用、廣告），依序計算淨營收、商品毛利、扣廣告前貢獻、扣廣告後貢獻四層，做兩期比較、九項金額橋接、規則健檢、假設試算、待辦與會議輸出。所有金額由 `src/domain` 的純函式計算，每個數字可追溯到 CSV 檔名與行號。

產品名稱為 **EC ProfitLens**（D-V3-25）。使用者看得到的名稱一律寫 EC ProfitLens；技術識別不改：package 名 `profitlens`、下載檔名前綴 `profitlens-`、備份 schema 字串、`dataset_id`、網址 `profitlens-tau.vercel.app`。

本輪目標（Revamp v4，基準 v3.0.0＝tag `v3.0.0`＝commit `625bfa5`，目標 v4.0.0〔依 D-V4-1 的決定填寫〕）：使用者 2026-10-08 的指令是「改版：將全站加入更多專業視覺化元素，以專業圖表的方式呈現為主要」。**把每一頁的主要閱讀任務都先用一張專業圖回答，表格退為核對與替代；不新增財務口徑、不刪任何功能（只能搬移、合併、收合、改名）、不加依賴。** 使用者已於〔日期〕授權依 PRD 開工，D-V4-1–35 的決定見 `docs/revamp-v4/09_DECISIONS_PENDING.md`〔填寫：全部依建議值，或列出例外〕。

## 先讀什麼（每個 session 都要）
1. `AGENTS.md` — 專案既有規則，**優先級最高**；本檔只補充，不覆蓋。
2. `docs/revamp-v4/00_README.md` — v4 套件的用法、批次順序、人工關卡、驗收命令。
3. 當批任務：`docs/revamp-v4/06_BATCHES.md` 中指定的 V4 批次（含「允許變動畫面」）、`docs/revamp-v4/CHART_CATALOG.md` 中該批的實作卡，以及該批引用的 `docs/revamp-v4/01_PRD.md` 章節（用 Read 的 offset／limit 讀需要的段落）。
4. 拍板與名詞：`docs/revamp-v4/09_DECISIONS_PENDING.md`、`docs/revamp-v4/GLOSSARY.md`（v4 增補）、`docs/revamp-v3/GLOSSARY.md`。
5. 財務口徑：`docs/METRICS.md`、`docs/DATA_CONTRACT.md`、`docs/SCENARIOS.md`。

v3 套件 `docs/revamp-v3/*` 保留為歷史紀錄；v3 PRD 的 §5.2 X1–X25、§4.3 刻意不採用、§8 語言規範、§9 token 與元件、§11 非功能仍然有效（X18 的改寫依 D-V4-33）。v2 套件 `docs/revamp/*` 只是歷史紀錄。與 v4 文件衝突時以 v4 為準，與 AGENTS.md 衝突時以 AGENTS.md 為準。

## 本輪的硬規則（補充 AGENTS.md）
- **一次只做一個批次（V4-0a–V4-11，共 16 批），一批就是一個工作階段，不跨批。** 批次完成前不開始下一批；每批結束要有可運行、全部檢查通過的狀態。批次太大時要在**開工前**拆成 V4-{n}a／b 並寫進 `06_BATCHES.md`。元件、token、B 級函式與第一個使用它的頁面同批交付。
- **人工關卡不屬於任何批次**：H5（v4 設計稿審查，審 V4-0b 產出）擋 V4-1，使用者可比照 v3 略過；H6（v4 複測與盲評，同場量 v3 正式站）擋 v4.0.0 正式上線。沒完成時 `docs/STATUS.md` 寫「未執行／待人工」，不可寫成完成。
- **拍板**：以 `docs/revamp-v4/09_DECISIONS_PENDING.md` 的「決定」欄為準。之後新出現的待決事項，沒有使用者明確回覆就不視為核准，拍板前沿用 v3.0.0 的行為與用詞。v3 尚待拍板的 D-V3-26／27／29–37 依 D-V4-29 對照表處理。**任何部署（含 Vercel preview）都要使用者當次明確同意**（D-V4-28 只定策略）。
- **財務核心禁區**：`src/domain/*`、`fixtures/*`、`metric_version = contribution-v1`、`assist-kpi-v1`、`breakeven-mer-v1`、`docs/METRICS.md` 的公式，V4-0a–V4-11 完全不動；`assist-kpi-v1`、`breakeven-mer-v1` 的常數與算式在 `src/application/assist-kpi.ts`、`src/application/breakeven-mer.ts`，這兩個檔與既有測試 `tests/assist-kpi.test.ts`、`tests/breakeven-mer.test.ts` 一個字都不改（只能呼叫）。**v4 的禁區白名單為空**，不新增任何 `fixtures/` 檔（合成資料放 `tests/fixtures/synthetic-4-channel/`）。新圖只重新呈現既有數字；需要產生新數值（加總、佔比、累計、計數、分階、分段）時，只在 `src/application`，每個函式一個獨立版本常數（例如 `channel-structure-v1`）與手算 golden；只排序或挑選既有值屬純呈現。`ratioMetric` 遇分母 ≤ 0 一律回傳 null，商品毛利為負的累計佔比要先取反成正的負值額。每批驗收都要跑四條禁區命令，結果寫進驗收文件，四條都必須為空；**不可用 `main` 比對**：
  - `git diff --stat 625bfa5 -- src/domain fixtures docs/METRICS.md`（或 tag `v3.0.0`）
  - `git diff --stat 82b70df -- src/domain fixtures/golden fixtures/demo fixtures/errors fixtures/refund_only fixtures/zero_ad docs/METRICS.md`（或 tag `v2.0.0`）
  - `git diff --stat 625bfa5 -- src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts`
  - `git status --porcelain -- src/domain fixtures docs/METRICS.md src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts`（`git diff` 看不到未追蹤的新檔）
  - commit 之後再跑 `git diff --stat 625bfa5 HEAD -- （上面第一條與第三條的路徑）`，必須為空，commit hash 寫進驗收文件
- **顯示格式只在呈現層**：萬／億、HALF_UP、U+2212、`favorableDirectionOf`、軸刻度（`formatAxisWan`）、熱表格內格式（`formatHeatCell`）只改 `src/application/presentation.ts`、`copy.ts`。測試的數字斷言改成呼叫格式化函式，不可為了讓測試過而改 golden 數字（本期 255.00、差額 −315.00、試算 284.00／264.00／19.70）。
- **標籤單一來源**：所有使用者看得到的中文（含 aria-label、caption、資料表 summary、匯出標題列、PDF 圖說、PPT 圖標題與輔助系列名、Excel 工作表名、週會摘要、錯誤訊息）集中在 `src/i18n/labels.zh-TW.ts`。新 key 只放 `tests/labels-structure.test.ts` 的 `V4_NEW_KEY_PREFIXES` 允許的 `{group}.chartsV4.*`，每批加「── V4-n 錨點」註解；既有字串一字不改（`verification/revamp-v4/labels-v3.flat.json` 的 2,581 個葉節點逐鍵逐字相同）；JSX 內不新寫中文；指標名一律取 `metricDefinitions`。
- **測試斷言的字串跟著標籤走**：一律 `import { labels } from "@/i18n"` 再斷言；新圖只用 testid 與 labels 斷言；`verification/revamp-v4/e2e-text-assertions.csv` 每批勾銷。測試失敗不是「跳過」的理由。
- **圖表規範（v4 新增，細節見 PRD §7 與 `CHART_CATALOG.md`）**：
  - 只用既有 Recharts 3.10.1（新圖只用 source 已 import 的 `LineChart`、`BarChart` 與其子元件；`ScatterChart` 只在 `*-lazy.tsx` 以 `next/dynamic` 載入）或 inline SVG；PPT 只用 pptxgenjs 的 `addChart`（`bar`、`line`）或 `addShape`，不用圖片 API；xlsx 不畫圖，只加「圖表資料」工作表。新元件放 `src/components/charts/`。
  - 每張圖放在 ChartFrame（C16）內；標題是結論句（每個子句 ≤ 14 字）、副標當 aria 描述；圖容器 `aria-hidden`、圖內 0 個可聚焦元素；Recharts 一律 `accessibilityLayer={false}`、`isAnimationActive={false}`、`ResponsiveContainer` 給 `initialDimension`；每張圖有 `<details>` 資料表（C33 產生）或表本身（熱表用 ChartFrame `mode="table"`，不放進 `aria-hidden`，整張 1 個 Tab 停留點）。
  - 每頁主層常駐獨立圖區塊（`section.chart-section`）≤ 3（總覽 4 例外）；能用表格內嵌條（C24）就不開新區塊；PRD §2.3「刻意不加圖」欄的位置不加圖。
  - 一套記號：本期實心（強調色只給本期資料）、上期灰、去年同期灰虛線、目標空心 2×12 刻度、資料待補虛線框；只有不利上色、有利不用綠（D-V3-7）；非本期序列（含試算點）用 `--chart-total`；同一指標同尺度、不同指標的小倍數各自尺度；長條、瀑布、變異、堆疊、bullet、Pareto、累計線一律從 0 起；一張圖一個數值軸。
  - 色只經 `src/application/chart-theme.ts` 讀 `:root` token；元件內不得有 hex、`var(--chart-` 字串常值、漸層、濾鏡、圖樣；固定圖高只用 `chartHeights`，依列計高的 svg 只用 `chartRowHeights` 的倍數，字級只用 `chartFontSize`。
  - X1–X25（v3）與 X26–X40（v4）全部有效：不做 gauge、健康分數、滿版紅綠燈、3D、漸層、樹狀圖、桑基、漏斗、圓餅、雷達、區域圖、雙數值軸、brush、zoom、動畫、彩色圓點圖例；不加總不能相加的數字（不同健檢規則、不同通路的方案）；投影、PDF、PPT 的橋接主圖一律是瀑布（X18、X39；X18 依 D-V4-33 改寫為「不得以分歧長條取代瀑布當橋接主圖」）；未滿 7 天的週不當完整週畫（X40）。
  - 試算圖只畫使用者明填或系統已算出的既有點（是否連線依 D-V4-20），x 固定 [−90%, +100%]，不外插、不代填（`docs/SCENARIOS.md:12、64、68`）。
- **棘輪與基準（V4-0a 建立，每批都跑）**：`tests/design-lint.test.ts`（上限 `tests/fixtures/design-lint-ceiling.json`）、`tests/copy-style.test.ts`、`tests/chart-lint.test.ts`（上限 `tests/fixtures/chart-lint-ceiling.json`）的數值只能下降；`tests/testid-baseline.test.ts` 對 `verification/revamp-v3/testids-v2.txt`、`verification/revamp-v4/testids-v3.txt` 與 `verification/revamp-v4/testids-v4-added.txt`（V4-1 起每批追加本批新增的 testid）的刪除數都必須為 0；`tests/mounted-testids.test.tsx` 每批都跑（頁面狀態在 `tests/helpers/page-states.tsx` 的錨點後新增，M1 測試在 mounted-testids 的錨點後新增；收進 `<details>`、投影隱藏的圖保持掛載；同一控制只有一個 DOM 實例；`chart-` 開頭的 testid 在實例容器外恰好一次）；`verification/revamp-v4-capture/metrics.spec.ts`：V4-0a 起 B2（1440：一句話頂 ≤ 192、KPI 帶底 ≤ 420、三件事首列底 ≤ 561；1280：KPI 帶底 ≤ 420，另兩項不晚於 V4-0a 實測；390：扣廣告後貢獻值頂 ≤ 295）、B3（390 無頁面橫向捲動）、B5（First Load JS gzip ≤ 545,397 bytes）硬斷言，B1、B9 只記錄；V4-1 起 B9（各頁 DOM 節點數 ≤ V4-0a 基準＋1,500）、各頁 B1 依 `06_BATCHES.md` 護欄表的時程硬斷言；`tests/copy-density.test.ts` 七頁的否定句上限＝V4-0a 實測，只降不升；畫面基準每批先複製前一批的 `snapshots/` 再比對，只允許該批「允許變動畫面」有差異；`verification/revamp-v4/feature-retention.csv` 中 `batch` 欄等於本批的列全部打勾，該批才算完成，V4-11 全表打勾。
- **依賴**：本輪「允許新增依賴」清單為**空**。需要新依賴時一律先問。
- **隱私與公開站邊界不變**：不加登入、資料庫、伺服器端保存；原始 CSV 不上傳；`APP_MODE=PUBLIC_DEMO`、`ENABLE_LIVE_AI=false`、`/api/insights` 的 server 端封鎖邏輯不動；不碰 `.env*`、`vercel.json`。本機保存仍須使用者同意；分析事件只記事件名（新增 `chart_clicked`、`chart_table_opened` 依 D-V4-14）；不加 PNG／SVG 下載入口，`network-log.spec` 的下載集合不變。
- **可追溯性不變**：每個金額（含圖上的柱、點、段、格與內嵌條所屬的格）都能開「計算與來源」，圖上點擊與資料表 number-link 用同一個 builder；抽屜標題下一行永遠顯示到分的精確值；新算出的衍生值帶 `formula`、`components` 與 `metricVersion`，直接取自 domain 的值維持 `contribution-v1`、整理函式版本放 `arrangeVersion`；累計、費用合計這類水準值帶 `valueKind: "level"`（抽屜不帶正負號）；`name` 只借單位時證據自帶 `title`、`definition`、`formulaTechnical`；下鑽篩選擴充日期與 SKU，只過濾原始明細不重算。例外只有 PRD §8.7 列的試算結果、會議凍結值、匯入對帳（v3 起就不是 number-link）。
- **a11y 與 testid 不退步**：既有 `data-testid`、`aria-*`、`role="status"`、`<details>/<summary>` 收合結構要保留；移動區塊時一起搬，不刪。新 testid 用 `chart-{page}-{id}`、`chart-{page}-{id}-{bar|point|seg|cell|spark}-{語意 key}`、`chart-{page}-{id}-table`，不用陣列索引、不以 `kpi-` 開頭。任何 Tab 停留點都不在 `[aria-hidden=true]` 內。Lighthouse Accessibility 不低於同頁基準且 ≥ 95；四尺寸 axe 0 個 serious。
- **程式風格**：沿用既有風格（Tailwind v4 + `globals.css` 自訂 class、長行 JSX）。不要為了格式化重寫整檔；只改動需要的區塊；新樣式引用 `:root` token，不寫死色碼；新 token 同批加進 `scripts/contrast-check.mjs` 的 PAIRS 與 `tests/chart-theme.test.ts`。
- **文件同步**：每批結束更新 `docs/STATUS.md`（真實執行結果；未執行寫「未執行」）、必要時在 `docs/DECISIONS.md` 加一筆決策、把本批驗收寫到 `verification/revamp-v4-V4-{n}-acceptance.md`，截圖與量測存 `verification/revamp-v4/V4-{n}/`；`06_BATCHES.md` 的進度欄同步。

## 驗收命令（每批都要全部跑，照這個順序，貼真實輸出摘要）
```bash
npm ci                 # 全新環境或 lockfile 變動時
npm run typecheck
npm run lint           # eslint --max-warnings=0
npm run audit:ui -- --json verification/revamp-v4/V4-{n}/ui-audit.json   # 數值寫進驗收文件；只有帶 --json 才寫檔
npm run contrast-check # scripts/contrast-check.mjs
npm test -- --run      # 含 design-lint、copy-style、copy-density、testid-baseline（v2＋v3＋v4 新增）、mounted-testids、chart-lint、labels-structure
npm run build
NETWORK_LOG_OUT=verification/revamp-v4/V4-{n}/network-log.json KEYBOARD_WALK_OUT=verification/revamp-v4/V4-{n}/keyboard-walk.json AXE_OUT=verification/revamp-v4/V4-{n}/axe.json npm run test:e2e
                       # 首次需 npx playwright install chromium；自己在 3100 埠起 LOCAL 伺服器，必須在下面的 PUBLIC_DEMO 伺服器啟動前跑完
NEXT_TELEMETRY_DISABLED=1 npm run build
APP_MODE=PUBLIC_DEMO PUBLIC_DEMO=true ENABLE_LIVE_AI=false npm start -- --port 3100 &
CAPTURE_BATCH=V4-{n} npx playwright test --config verification/revamp-v4.capture.config.ts   # V4-0a 新增（V4-0a 開工時 capture config 還不存在，由本批建立）
npx -y lighthouse@13.5.0 --version   # 只在第一次：建立 npx 快取
node --no-warnings scripts/lighthouse-pages.mjs --base http://127.0.0.1:3100 --out verification/revamp-v4/V4-{n}
lsof -ti tcp:3100 | xargs kill   # 停掉 PUBLIC_DEMO 伺服器（每次 Bash 呼叫都是新 shell，取不到 $!）；之後 lsof -ti tcp:3100 必須沒有輸出
git diff --stat 625bfa5 -- src/domain fixtures docs/METRICS.md   # V4-0a 新增
git diff --stat 82b70df -- src/domain fixtures/golden fixtures/demo fixtures/errors fixtures/refund_only fixtures/zero_ad docs/METRICS.md
git diff --stat 625bfa5 -- src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts   # V4-0a 新增
git status --porcelain -- src/domain fixtures docs/METRICS.md src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts   # V4-0a 新增
# commit 之後：git diff --stat 625bfa5 HEAD -- （同上第一條與第三條的路徑），必須為空，commit hash 寫進驗收文件
```
本機預覽：`npm run dev`，網址 http://127.0.0.1:3000 。E2E 的四種視窗：1440×1000、1280×900、768×1024、390×844。

## 每批回報格式（繁體中文）
1. 完成項目（對照 `docs/revamp-v4/06_BATCHES.md` 的該批範圍，逐項標 完成／部分／未做＋原因）
2. 變更檔案清單（新增／修改／刪除）
3. 驗收命令與真實結果（通過數、失敗數、未執行），含禁區四條命令與 commit 後的 diff（附 commit hash）、棘輪數值（design-lint、copy-style、copy-density、chart-lint）、testid 刪除數（v2、v3、v4 新增三份）、First Load JS、DOM 節點數、390 的五個 TBT 與 loadavg、畫面基準差異（只列允許變動的畫面）
4. 瀏覽器驗收方式與截圖路徑（四尺寸至少各一張）
5. 已知限制與風險
6. 下一批建議、被擋住的人工關卡，以及需要人拍板的事項（對照 `docs/revamp-v4/09_DECISIONS_PENDING.md`）

## 檔案地圖（改版會碰到的）
| 位置 | 內容 | v3 動作（已完成） | v4 批次 |
|---|---|---|---|
| `src/components/overview/charts/chart-frame.tsx` | C16 圖表框（標題、副標、圖例、takeaway、四態固定高、資料表） | V3-4b 建立 | V4-1 加 `aside`、`unitNote`、`frameClassName`、`legend[].shape`、`page`；V4-3b `mode="table"`；V4-4 `headingLevel`；V4-5 `variant="inline"` |
| `src/components/overview/charts/bridge-section.tsx`、`profit-section.tsx`、`waterfall-svg.tsx` | G1、G2 瀑布（C17） | V3-4b 建立 | V4-1 搬進 ChartFrame、`bare`、共同尺度、`formatAxisWan`、G6 變異條（依 D-V4-33） |
| `src/components/overview/charts/trend-section.tsx`、`channel-section.tsx` | G3 趨勢、G4 各通路 | V3-4b、V3-9b | V4-2 刻度、G4 差額條（D-V4-16 選 B 時改啞鈴） |
| `src/components/overview.tsx`、`overview/kpi-band.tsx`、`overview/assist-table.tsx` | 總覽、KPI 帶、其他常用指標表 | V3-4、V3-9a | V4-2 G5 MER 列、G7a sparkline；V4-10 G8（進階區） |
| `src/components/overview/charts/bullet.tsx`（新檔，尚不存在） | C18 Bullet（由 `overview.tsx:43-51` 的 `targetBar` 抽出） | —（V4-2 新建） | V4-2 |
| `src/components/charts/`（新目錄） | C19、C24–C31、C33、C35、`products-scatter-lazy.tsx`（檔名見 PRD §6.3） | — | 與第一個使用它的頁面同批交付 |
| `src/components/diagnosis-list.tsx`、`workspace-panels.tsx`（Diagnosis）、`channel-table.tsx` | 健檢清單、通路寬表 | V3-5 | V4-3a G9、G10、G7b；V4-3b G11、G12 |
| `src/components/product-comparison-panel.tsx`、新 `src/components/product-evidence.ts` | 商品頁、前 10 名表、完整表 | V3-5 | V4-4 G13、G14（前 10 名表改 `after` 常駐；沒有負值時 `product-worst` 照 v3 原樣）；V4-10 G24 |
| `src/components/decision-workbench.tsx`、`scenario-sensitivity.tsx` | 試算方案欄、比較表、門檻 | V3-6 | V4-5 G15、G16 |
| `src/components/actions-workbench.tsx` | 待辦看板與清單 | V3-6 | V4-10 G17 |
| `src/components/meeting-page.tsx` | 會議紀錄 | V3-7 | V4-6 G15 會議實例、G19（G18 取消） |
| `src/components/workspace-panels.tsx`（DataWorkspace）、`issue-list.tsx`、`import-wizard/step-review.tsx` | 資料來源、問題表、匯入精靈步驟 4 | V3-8 | V4-7a G20、G21、`IssueList` 篩選；V4-7b G22 |
| `src/components/evidence-drawer.tsx`、新 `src/application/evidence-ladder.ts` | 計算與來源抽屜 | V3-5、V3-9b | V4-2 `arrangeVersion`；V4-3a `valueKind`、`ladderMetrics` 修正；V4-3b 篩選加日期與 SKU；V4-7b G23、`ladderMetrics` 搬移 |
| `src/application/chart-theme.ts`、`src/app/globals.css` | 圖表色、高與列高的單一來源、`:root` token | V3-1、V3-4b | V4-1 `chartRowHeights`（D-V4-33 未回覆時順延到 V4-2）；V4-2、V4-3a、V4-3b 新 token；V4-7a `chartRowHeights.axis`；V4-8 投影白名單與 `--text-12`、`--text-13` 對應 |
| `src/application/presentation.ts` | 格式化、`metricDefinitions`、`formatAxisWan`、`formatHeatCell` | V3-2b | V4-1 `formatAxisWan`；V4-3b `formatHeatCell` |
| `src/application/evidence-filter.ts` | 下鑽篩選 | V3-9b | V4-3b 加 `date`、`sku` |
| `src/application/pnl-table.ts` | 管理損益表 | V3-9b | V4-10 由 `dayColumns` 抽出並匯出 `periodDailyMetrics`（輸出不變） |
| `src/application/chart-*.ts`（`chart-assist-weeks`、`chart-structure`、`chart-channel-weeks`、`chart-heatmap`、`chart-pareto`、`chart-threshold`、`chart-meeting`、`chart-coverage`、`chart-issues`、`chart-cumulative`、`chart-actions`） | B 級整理函式（各一個版本常數＋手算 golden） | — | V4-2 到 V4-10，見 `CHART_CATALOG.md` §9.2 |
| `src/application/workspace.ts` | 快照、`weeklyRows`、`yoy` | V3-9b | V4-2 週列加 `units_sold`（`channelWeeks` 不放進快照，V4-3a 在健檢頁元件內計算） |
| `src/components/print-summary.tsx`、`src/application/pptx-export.ts`、`excel-export.ts`、`export-theme.ts`、`export-variants.ts` | 列印／PDF、PPT、Excel、匯出色與變體 | V3-7、V3-9b | V4-9a C31、C32、`EXPORT_THEME` 圖表色、`ExportVariantSpec.charts`；V4-9b C34（含版本列）、Markdown 九項差額表 |
| `src/i18n/labels.zh-TW.ts` | 標籤字典 | V3-2、V3-10 移除 alias | 每批在 `{group}.chartsV4.*` 錨點新增 |
| `tests/labels-structure.test.ts`、`verification/revamp-v4/labels-v3.flat.json` | labels 結構與既有字串快照 | V3-2b 建立（v2 字串快照） | V4-0a 加 `V4_NEW_KEY_PREFIXES` 與 v3.0.0 全部葉節點快照 |
| `scripts/lib/copy-scan.mjs` | copy-style 掃描 | V3-0 建立 | V4-0a L1 樣式加 `chartsV4.*.title` |
| `scripts/lib/chart-scan.mjs`、`tests/chart-lint.test.ts`、`tests/fixtures/chart-lint-ceiling.json` | chart-lint CL-1–CL-11（AST 掃 `src/components/charts/**`、`src/components/overview/charts/**`，CL-3 的 `var(--chart-` 禁令擴到 `src/components/**`；CL-1、CL-2、CL-9、CL-11 用 SSR） | — | V4-0a 建立；每批跑 |
| `tests/testid-baseline.test.ts`、`verification/revamp-v4/testids-v3.txt`、`verification/revamp-v4/testids-v4-added.txt`、`verification/revamp-v4.config.ts`、`verification/revamp-v4/collect-testids.spec.ts` | testid 基準（v2、v3、v4 新增三份） | V3-0 建立 v2 基準 | V4-0a 加 v3 基準（三步產生）與空的 v4 新增清單；V4-1 起每批追加 |
| `tests/mounted-testids.test.tsx`、`tests/helpers/page-states.tsx`（新檔） | 掛載與唯一性（M1、M6）；頁面狀態 | V3-3 建立 | V4-0a 把 `shellPage`、`load`、`wizardFiles`、`pageStates`、`statusShells` 原樣搬到 helper 並匯出，加 `chart-` testid 唯一性斷言（不改 `INSTANCE_CONTAINER`）；每批在兩個檔的錨點後新增 |
| `tests/copy-density.test.ts` | 主層否定句上限（B8） | V3 建立（五頁各 ≤ 3） | V4-0a 改為實測值並加商品、待辦兩頁；之後只降 |
| `tests/e2e/keyboard-walk.spec.ts` | 鍵盤走查 | V3-10 建立 | V4-0a 加 `[aria-hidden=true]` 停留點斷言；V4-3b 熱表 Tab 數；V4-4 商品頁資料表 summary 里程碑；V4-8 補齊其餘頁 |
| `scripts/lighthouse-pages.mjs` | Lighthouse 流程 | V3-0 建立 | V4-0a 加資料來源、待辦兩頁 |
| `verification/revamp-v4.capture.config.ts`、`verification/revamp-v4-capture/` | 52 張畫面基準、metrics.spec v4、畫面 13 用的 `targets.csv` | v3 版在 `verification/revamp-v3*` | V4-0a 建立；每批跑 |
| `verification/revamp-v4/feature-retention.csv`、`e2e-text-assertions.csv` | 功能保留（延續 v3 的 113 列再加圖表列）、E2E 文字斷言 | v3 版在 `verification/revamp-v3/` | V4-0a 建立；每批打勾、勾銷 |
| `tests/fixtures/synthetic-4-channel/` | 4 通路合成資料 | — | V4-0b 建立（D-V4-31） |
| `docs/revamp-v4/01_PRD.md`、`CHART_CATALOG.md`、`06_BATCHES.md`、`09_DECISIONS_PENDING.md`、`00_README.md`、`GLOSSARY.md`、`usability-test.md` | v4 規格、實作卡、批次、拍板、套件說明、名詞、可用性測試 | — | V4-0a 定稿與產出；每批對照與更新進度 |
````
