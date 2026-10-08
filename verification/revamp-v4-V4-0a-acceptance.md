# Revamp v4 V4-0a 驗收：基準與護欄（不改任何 UI）（2026-10-08）

依 `docs/revamp-v4/06_BATCHES.md`「V4-0a 基準與護欄」第 1–12 項、「共同規則」與 `docs/revamp-v4/01_PRD.md` §2.2、§4.7、§7.9、§8。使用者 2026-10-08 回覆「都依建議值，開工」，D-V4-1 到 D-V4-35 全部依建議值定案（`docs/revamp-v4/09_DECISIONS_PENDING.md`）。所有量到的基準值整理在 `verification/revamp-v4/V4-0-baseline.md`，本文件只列驗收結果與判定。

工作方式：先提交開工錨點 `71b0757`（套件、拍板、CLAUDE.md），再由三個 worktree 代理並行（A 文件與 labels 護欄 `15ba17a`、B testid／掛載測試／chart-lint `150adce`、C 畫面基準與量測／鍵盤走查／Lighthouse `2b9843e`），依序合併（`aef01a8`、`aa8c517`、`a00a3c2`，無衝突）後，在主 checkout 的同一份 build 上跑完整驗收與量測，最後收尾提交。

## 1. 完成項目（對照 06_BATCHES V4-0a）

| # | 項目 | 狀態 | 說明 |
|---|---|---|---|
| 1 | 開 `revamp/v4`、CLAUDE.md 整份換成 v4 版 | 完成 | 自 `main`＝`21d621c` 開分支（D-V4-2）；CLAUDE.md 依 `00_README.md` 末節草案取代，填入目標 v4.0.0、拍板日期 2026-10-08、全部依建議值（`71b0757`） |
| 2 | 文件套件定稿：GLOSSARY v4 增補、usability-test | 完成 | `docs/revamp-v4/GLOSSARY.md`（29 列增補、指標名對照、各圖區塊名、圖型中文寫法、圖表記號用語）；`docs/revamp-v4/usability-test.md`（沿用 v3 腳本，加 T1–T4 與 A4 盲評題與答案鍵；答案鍵用暫時的 vitest 以示範資料重算，與 06／PRD 完全相同：T1 少賺 59.9 萬、商品成本 −157.5 萬；T3 SKU-020 · 平台 · MARKETPLACE 少 30,198.96 元；T4 `fixtures/errors/missing_ad_day` 唯一問題 MISSING_AD_DAY 2026-08-02） |
| 3 | `verification/revamp-v4/` 產物 | 完成 | `testids-v3.txt`（416 列）、`testids-v4-added.txt`（空，只有表頭）、`feature-retention.csv`（148 列＝v3 113＋圖表與搬移 35）、`e2e-text-assertions.csv`（1,243 列＝v3 1,231＋V4-0a 新增 12，加欄 `v4_batch`）、`labels-v3.flat.json`（2,581 個葉節點）、`V4-0-baseline.md`（第 1–13 節已填，第 14 節待 V4-0b） |
| 4 | testid-baseline 比對三份基準 | 完成 | v2 228 列、v3 416 列、v4 新增 0 列，三份刪除數 0；SSR 情境加入 `tests/helpers/page-states.tsx` 的整頁狀態 |
| 5 | chart-lint CL-1–CL-11 | 完成 | `scripts/lib/chart-scan.mjs`（＋型別宣告 `chart-scan.d.mts`）、`tests/chart-lint.test.ts`（25 個測試，每條規則有違規與合規的合成輸入）、`tests/fixtures/chart-lint-ceiling.json`；v3.0.0 實測 11 條全部 0，上限全 0 |
| 6 | labels 護欄 | 完成 | `tests/labels-structure.test.ts` 加 `V4_NEW_KEY_PREFIXES`（11 個 `{group}.chartsV4.`）與 v3.0.0 快照逐鍵逐字斷言；`scripts/lib/copy-scan.mjs` 加 `chartsV4.*.title` 的 L1 樣式與 `products.chartsV4.*` 的「賠錢」「虧損」範圍黑名單；copy-style 計數改前改後逐筆相同；本批 0 個新 key |
| 7 | mounted-testids 搬 helper、`chart-` 唯一性、錨點 | 完成 | `shellPage`、`load`、`wizardFiles`、`pageStates`、`statusShells` 原樣搬到 `tests/helpers/page-states.tsx`；搬移前後都是 44 passed（名單逐行相同），加 M6 斷言與合成反例後 46 passed；`INSTANCE_CONTAINER` 不改；兩檔各 13 個 V4 錨點 |
| 8 | keyboard-walk 的 `aria-hidden` 斷言、copy-density 七頁上限 | 完成（keyboard-walk 有既有違規，見 §5） | keyboard-walk 加「任何 Tab 停留點都不在 `[aria-hidden=true]` 內」：desktop 0；mobile 有 2 個 v3.0.0 既有停留點（總覽 G1、G2 瀑布外框），依「上限＝實測並逐條列出」寫進 `KNOWN_ARIA_HIDDEN_STOPS`，排到 V4-1 修。copy-density 五頁上限改實測（試算 1、其餘 0），加商品、待辦兩頁（0） |
| 9 | 量測與截圖：capture config、52 張、metrics | 完成 | `verification/revamp-v4.capture.config.ts`、`verification/revamp-v4-capture/{baseline,metrics,shared}.ts`、`targets.csv`；36 張 v3 畫面 0 差異（與 V3-10 逐位元相同），新增 16 張基準；B2、B3、B5 硬斷言通過，B1、B9 記錄 |
| 10 | contrast 試算（只算不宣告） | 完成 | 新 token 與 `--red-100` 候選值在白底與 `--bg-subtle` 底的對比表寫在基準文件第 13 節；`:root` 與 `contrast-check.mjs` 不動 |
| 11 | Lighthouse 8 頁、390 五個 TBT 連跑 3 次 | 完成 | `scripts/lighthouse-pages.mjs` 加資料來源、待辦兩頁；三次 accessibility 全 100；390 TBT 中位數寫入基準（資料來源中位數 0 的門檻缺口列為 D-V4-36） |
| 12 | axe、keyboard-walk、network-log 基準 | 完成 | `verification/revamp-v4/V4-0a/{axe,keyboard-walk,network-log}.json`，摘要在基準文件第 12 節 |

人工關卡：H5（v4 設計稿審查）的材料在 V4-0b 產出，**未執行／待人工**；H6 **未執行／待人工**。

## 2. 變更檔案

- 新增（22）：`docs/revamp-v4/GLOSSARY.md`、`docs/revamp-v4/usability-test.md`、`scripts/lib/chart-scan.mjs`、`scripts/lib/chart-scan.d.mts`、`tests/chart-lint.test.ts`、`tests/fixtures/chart-lint-ceiling.json`、`tests/helpers/page-states.tsx`、`verification/revamp-v4.capture.config.ts`、`verification/revamp-v4.config.ts`、`verification/revamp-v4-capture/{baseline.spec.ts,metrics.spec.ts,shared.ts,targets.csv}`、`verification/revamp-v4/{V4-0-baseline.md,collect-testids.json,collect-testids.spec.ts,e2e-text-assertions.csv,feature-retention.csv,labels-v3.flat.json,make-testids-v3.mjs,testids-v3.txt,testids-v4-added.txt}`。
- 修改（8）：`scripts/lib/copy-scan.mjs`、`scripts/lighthouse-pages.mjs`、`tests/copy-density.test.ts`、`tests/copy-style.test.ts`、`tests/e2e/keyboard-walk.spec.ts`、`tests/labels-structure.test.ts`、`tests/mounted-testids.test.tsx`、`tests/testid-baseline.test.ts`。
- 開工錨點（`71b0757`）另含：`CLAUDE.md`（整份換成 v4 版）、`docs/DECISIONS.md`、`docs/revamp-v4/` 五個套件檔。
- 收尾提交另含：本文件、`docs/STATUS.md`、`docs/DECISIONS.md`、`docs/revamp-v4/{00_README.md,06_BATCHES.md,09_DECISIONS_PENDING.md}`、`verification/revamp-v4/V4-0a/`（量測與截圖）。
- 零改動：`src/` 全部（`git diff --stat 625bfa5 -- src` 為空）、`fixtures`、`docs/METRICS.md`、`.env*`、`vercel.json`、`package.json`、`package-lock.json`。

## 3. 驗收命令與真實結果

| 命令 | 結果 |
|---|---|
| `npm ci` | 未執行（lockfile 沒有變動） |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0（`--max-warnings=0`） |
| `npm run audit:ui -- --json verification/revamp-v4/V4-0a/ui-audit.json` | hex 0（token 定義區 23）、圓角 4、字級 11（不含列印 8）、字距 0、rotate 0、JSX 箭頭 3、eyebrow 0、裝飾字元 0、CSS content 0、`.button-row` 置中 0、巢狀卡 0、漸層 0、陰影 0、JSX 中文 0、字串常值中文 0；labels「注意：」0、箭頭 0、同義詞 12、其餘 0；靜態 testid 253、class 809（與 v3.0.0 相同） |
| `npm run contrast-check` | 75／75 通過 |
| `npm test -- --run` | **124 檔／2,459 測試全過**（v3.0.0 為 123 檔／2,418；新增 chart-lint 25、labels-structure +3、copy-density +3、copy-style +1、mounted-testids +2、testid-baseline 新增測試等） |
| `npm run build` | exit 0 |
| `npm run test:e2e`（四個視窗，帶 `NETWORK_LOG_OUT`、`KEYBOARD_WALK_OUT`、`AXE_OUT`） | **791 passed、0 failed、9 skipped（23.4 分鐘）**；skipped 與 V3-10 相同（network-log 與 keyboard-walk 在 laptop／tablet 依設計略過 4 條、present-mode 手機 5 條）。跑完以 `git checkout -- 'verification/review-v2-a-*' verification/revamp-R6/` 還原 E2E 改寫的追蹤證據檔 |
| `NEXT_TELEMETRY_DISABLED=1 npm run build`＋PUBLIC_DEMO 伺服器（3100） | exit 0；`GET /` 200 |
| `CAPTURE_BATCH=V4-0a npx playwright test --config verification/revamp-v4.capture.config.ts` 第 1 次 | 11 passed、12 failed、5 skipped：01–09 四尺寸 4 個測試通過（36 張 0 差異）；12 個失敗全部是 10–13 的「A snapshot doesn't exist, writing actual」（寫入 16 張新基準） |
| 同上第 2 次 | **23 passed、5 skipped**（52 張全部通過；metrics 寫入 `verification/revamp-v4/V4-0a/metrics.json`、`first-load-modules.json`） |
| `npx -y lighthouse@13.5.0 --version` | 13.5.0 |
| `node --no-warnings scripts/lighthouse-pages.mjs --base http://127.0.0.1:3100 --out …` × 3 | 三次都 exit 0（每次約 70 秒；開跑前 1 分鐘負載 3.66、3.12、3.22） |
| `lsof -ti tcp:3100 \| xargs kill`；`lsof -ti tcp:3100` | 已停，沒有輸出 |
| `git diff --stat 625bfa5 -- src/domain fixtures docs/METRICS.md` | 空 |
| `git diff --stat 82b70df -- src/domain fixtures/golden fixtures/demo fixtures/errors fixtures/refund_only fixtures/zero_ad docs/METRICS.md` | 空 |
| `git diff --stat 625bfa5 -- src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts` | 空 |
| `git status --porcelain -- src/domain fixtures docs/METRICS.md src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts` | 空 |
| commit 之後 `git diff --stat 625bfa5 HEAD -- （第一條與第三條的路徑）` | 收尾提交後執行，結果與 commit hash 寫在 `docs/STATUS.md` 的 V4-0a 段 |
| 合併後隱藏字元掃描（變更檔） | 0 |

**棘輪與基準數值**

| 項目 | 值 |
|---|---|
| design-lint（15 項） | 與 v3.0.0 相同，上限檔不動（hex 0、圓角 4、字級 11、字距 0、rotate 0、箭頭 3、eyebrow 0、裝飾字元 0、CSS content 0、置中 0、巢狀卡 0、漸層 0、陰影 0、JSX 中文 0、字串常值中文 0） |
| copy-style | 同義詞 12，其餘 0（上限檔不動） |
| copy-density（七頁，上限＝實測） | 試算 1，總覽、健檢、會議、資料來源（golden 與 missing_cogs）、商品、待辦（三種狀態）全部 0 |
| chart-lint（CL-1–CL-11） | 全部 0，上限全 0 |
| testid 刪除數 | v2 0、v3 0、v4 新增 0 |
| labels 快照 | 2,581 個鍵逐字相同 |
| First Load JS gzip（B5） | 519,426 bytes（門檻 545,397）；禁止符號 Treemap、Sankey、Funnel、PieChart、RadarChart 全 0 |
| B2 首屏 | 1440：一句話頂 192、KPI 帶底 419、三件事首列底 561；1280：192、419、583（新量）；390：扣廣告後貢獻值頂 295，全部在門檻內 |
| B3 | 七頁 390 寬 scrollWidth 都是 390 |
| B9 DOM 節點數（1440／390） | 總覽 3,075／3,062、健檢 1,324、商品 1,822、試算 660、待辦 688、會議 998、資料來源 1,129 |
| Lighthouse Accessibility | 1440、390 各 8 頁全部 100（三次相同），失敗審核 0 |
| Lighthouse Performance（空狀態首頁） | 1440 100、390 94 |
| 390 五個 TBT 中位數（ms） | 載入示範資料 1,008.3、切到通路健檢 756.6、切到商品毛利 79.9、切到會議紀錄 973.8、切到資料來源 0 |
| axe 四尺寸 | serious、critical、moderate、minor 全 0 |
| network-log | desktop、mobile 各 15 個請求；外部來源 0、非 GET 0、CSV 內容外洩 0、失敗資源 0、console 錯誤 0 |
| 畫面基準差異 | 本批不允許任何畫面變動：01–09 × 4 共 36 張 0 差異；10–13 × 4 共 16 張為新建基準 |

## 4. 瀏覽器驗收方式與截圖

- 截圖：`verification/revamp-v4/V4-0a/snapshots/{desktop,laptop,tablet,mobile}/`（1440×1000、1280×900、768×1024、390×844 各 13 張，共 52 張）。01–09 是 v3 的 9 個畫面（例如 `desktop/01-overview-top.png`、`mobile/01-overview-top.png`），10–13 是 v4 圖要插入的位置（`10-diagnosis-chart-area.png`、`11-products-chart-area.png`、`12-import-step-4.png`、`13-kpi-band.png`）。
- 方式：本機 production build、PUBLIC_DEMO 伺服器（3100），Playwright 的 `toHaveScreenshot`（0 像素差、threshold 0.02）；E2E 四個視窗用 LOCAL 伺服器（playwright.config 自己起）。
- 量測檔：`verification/revamp-v4/V4-0a/{metrics.json,first-load-modules.json,ui-audit.json,axe.json,keyboard-walk.json,network-log.json}`、Lighthouse 報告 `verification/revamp-v4/V4-0a/lighthouse/`、第 1、2 次 Lighthouse 數值 `verification/revamp-v4/V4-0a/lighthouse-runs/`。

## 5. 已知限制與風險

- **390 寬的 2 個既有 Tab 停留點在 `aria-hidden` 內**：總覽 G1、G2 瀑布外框 `div.chart-frame.waterfall`（390 寬時是水平捲動容器，外框帶 `aria-hidden`）。06_BATCHES 原本預期 0；v3.0.0 實測 2，依「上限＝實測並逐條列出」寫進 `KNOWN_ARIA_HIDDEN_STOPS`，只能減不能加。axe 的 aria-hidden-focus 不計這種隱含可聚焦，所以 V3-10 的 axe 0 serious 沒有抓到。修正需要改 `src`，已寫進 06_BATCHES V4-1 段（搬 G1、G2 進 ChartFrame 時一起修，768 一併確認）。
- **CLS 0.053–0.054**：390 的「切到商品毛利」「切到資料來源」「切到待辦」與 1440 的「切到待辦」超過 PRD B4 的 CLS < 0.05。這是 v3.0.0 既有行為（V3-10 的 390 商品毛利也是 0.054），本批不改 UI，記為已知差距。
- **TBT 門檻的下限**：資料來源的 390 TBT 基準中位數是 0，「中位數 × 1.1」會變成 0。已列為待拍板 D-V4-36（建議門檻取 max(中位數 × 1.1, 中位數＋50 ms)）；拍板前這一項只記錄、不判定。
- **Lighthouse 390 Performance 94**：只反映空狀態首頁的首載 bundle（模擬節流）；V3-10 本機為 92、正式站 96，門檻 ≥ 90。
- **testids-v3.txt 的 cond 7 列**：`diagnosis-count-favorable`、`meeting-compare-different_periods` 與 v2 沿用的 5 列，瀏覽器流程走不到，只做原始碼檢查（由既有單元測試覆蓋渲染）。
- **collect-testids 在 3101 埠收集**：因為 3100 當時由代理 C 使用；config 預設仍是 3100。結果與埠無關（同一份 PUBLIC_DEMO build）。
- **B8 兩種口徑**：copy-density 是 SSR golden、拿掉收合內容；metrics.spec 是瀏覽器示範資料、只算可見文字（1440 每頁多 1 句期間列的「去年同期不可用」）。門檻以 copy-density 為準，瀏覽器值只記錄。
- **畫面 10–13 的拍法**：以 `stylePath` 讓 sticky 與 fixed 元素不疊在元素截圖上，並在拍前把滑鼠移開；之後改 `.topbar`、`.period-bar`、`.wizard-footer`、`.mobile-tabbar` 類名的批次要同步 `verification/revamp-v4-capture/shared.ts`（已登記在 e2e-text-assertions.csv）。
- 人工關卡 H5、H6 未執行；F15、F16 仍待使用者檔案（不在 v4 範圍）。

## 6. 下一步、人工關卡與待拍板

- **下一批：V4-0b**（設計稿、PPT spike 與 4 通路合成資料；不改 UI）。依賴 V4-0a（本批完成）與 D-V4-31（已依建議值拍板）。
- **人工關卡**：H5 審 V4-0b 產出的設計稿，擋 V4-1；使用者可比照 v3 略過（D-V4-27），目前未表示略過。H6 擋 v4.0.0 正式上線。
- **待拍板**：新增 D-V4-36（390 TBT 門檻在基準為 0 時的下限，建議 A）；v3 尚待拍板的 D-V3-26／27／29–37 依 D-V4-29 對照表處理，與圖表化相關的只在回覆後排入對應批次。
- **部署**：本批沒有部署；MVP（V4-2）後的 preview 仍需使用者當次同意（D-V4-28）。
