# 06 v4.1 分批任務（V41-0–V41-5）

> 由 `docs/revamp-v4.1/01_PRD.md` §7 展開；每個功能區的文字與擷取狀態在 `GUIDE_CONTENT.md`。PRD 有更新時以 PRD 為準並同步本檔。
>
> 每批格式：大小／範圍／依賴（含拍板與人工關卡）／允許變動畫面／驗收重點（共通驗收以外）／同批 labels 與測試。
>
> **目前進度：V41-0、V41-1、V41-2a、V41-2b 完成（2026-10-14／15），下一批 V41-4；H7 可以開始。D-V41-1–25 已拍板（D-V41-25＝A）。** 基準：tag `v4.0.0`＝`872662d`；`main`＝`59e6f41`；正式站 https://profitlens-tau.vercel.app 是 v4.0.0。

---

## 共同規則（每批都適用）

- **一次只做一批，不跨批；一批就是一個工作階段。** 每批結束時產品可以運行、所有檢查都通過。批次太大時在**開工前**拆成 V41-{n}a／b 並寫進本檔。元件、labels、測試與第一個使用它的頁面同批交付。
- **人工關卡不屬於任何批次**：H7、H6 沒完成時，`docs/STATUS.md` 寫「未執行／待人工」。
- **拍板規則**：以 `09_DECISIONS_PENDING.md` 的「決定」欄為準；沒有明確回覆就不視為核准，受影響的批次不開工。**任何部署（含 preview）都要使用者當次明確同意**（D-V41-24 只定策略）。**`git push` 任何分支到 origin 都會由 Vercel Git 整合建立 preview（`docs/DECISIONS.md:307、726`；`docs/STATUS.md:57、602`），視同部署；沒有使用者當次明確同意不 push（含 `revamp/v4.1`）。**
- **允許新增 npm 依賴：無。** D-V41-15＝A 時，只把既有的 `next`、`eslint-config-next` 升到 `16.3.8`（精確版號）。D-V41-7＝A 時，影片轉檔用本機 `ffmpeg`（不進 `package.json`，只在 V41-3 與之後重錄影片時用）。
- **財務核心禁區（沿用 v4，白名單為空）**：`src/domain/*`、`fixtures/*`（只讀，不新增檔）、`contribution-v1`、`assist-kpi-v1`、`breakeven-mer-v1`、`docs/METRICS.md`、`src/application/assist-kpi.ts`、`src/application/breakeven-mer.ts`、`tests/assist-kpi.test.ts`、`tests/breakeven-mer.test.ts` 一個字都不改。
- **公開站邊界（D-V41-3，預設沿用；第五條）**：`src/app/api/*`、`vercel.json`、`src/application/analytics.ts` 對 `872662d` 不改（說明頁只呼叫 `analyticsEnabled`）；不碰 `.env*`；`APP_MODE=PUBLIC_DEMO`、`ENABLE_LIVE_AI=false` 不動。
- **工作台不動**：七頁的版面、功能與文案不改；只允許 V41-1 的入口連結與 V41-4 的 CLS 修正。說明頁不 import `src/components/dashboard.tsx`、`src/components/charts/**`、Recharts、pptxgenjs、xlsx；任何 `"use client"` 模組都不 import `@/i18n/guide*`、`@/application/guide`、`@/components/guide/*`。
- **標籤單一來源（D-V41-12＝A'）**：說明頁的所有中文（含 `alt`、`figcaption`、字幕、metadata）只在 `src/i18n/guide.zh-TW.ts` 的 `guideLabels`（只給伺服器模組 import，不進工作台首載）；工作台入口的 3 條在 `src/i18n/labels.zh-TW.ts` 的 `shell.guideV41.*`；介面字串用 `{ui:路徑}` 引用，不重打（`tests/guide-content.test.ts` 擋）；既有字串一字不改（`verification/revamp-v4/labels-v3.flat.json` 2,581 個與 V41-0 產生的 `verification/revamp-v41/labels-v4.flat.json` 都逐鍵逐字相同）；每批在兩個檔加「── V41-n 錨點」註解。
- **棘輪與基準（v4 全部沿用）**：design-lint、copy-style、copy-density、chart-lint 只降不升（design-lint、ui-audit 的 tsx 範圍 V41-0 起含 `src/app/**/*.tsx`）；testid 對 `verification/revamp-v3/testids-v2.txt`、`verification/revamp-v4/testids-v3.txt`、`verification/revamp-v4/testids-v4-added.txt`、`verification/revamp-v41/testids-v41-added.txt` 四份的刪除數都是 0；mounted-testids 每批都跑；B2 首屏、B3 390 無橫向捲動、B9 DOM 節點、390 五個 TBT（D-V4-36、D-V4-47 的判定方式沿用）照 v4 斷言；network-log 下載集合恰好 5 種、無 POST；golden 不變（255.00、−315.00、284.00／264.00／19.70）。
- **畫面基準的跨批比對**：V41-n 開跑前，把前一批的 `verification/revamp-v41/V41-(n−1)/snapshots/`（V41-0 用 `verification/revamp-v4/V4-11/snapshots/` 的 52 張）複製到 `verification/revamp-v41/V41-n/snapshots/`，不帶 `--update-snapshots` 跑一次；只允許該批「允許變動畫面」有差異，確認後只更新允許的畫面，驗收文件逐張寫理由。
- **共通驗收**（每批都要全部跑，照下列順序，貼真實輸出摘要；沒執行的寫「未執行」＋原因）：
  1. `npm ci`（lockfile 變動時）、`npm run typecheck`、`npm run lint`、`npm run audit:ui -- --json verification/revamp-v41/V41-{n}/ui-audit.json`、`npm run contrast-check`、`npm test -- --run`、`npm run build`。
  2. `NETWORK_LOG_OUT=verification/revamp-v41/V41-{n}/network-log.json KEYBOARD_WALK_OUT=verification/revamp-v41/V41-{n}/keyboard-walk.json AXE_OUT=verification/revamp-v41/V41-{n}/axe.json npm run test:e2e`（自己在 3100 埠起 LOCAL 伺服器，必須在第 3 步之前跑完）。
  3. `NEXT_TELEMETRY_DISABLED=1 npm run build`，再 `APP_MODE=PUBLIC_DEMO PUBLIC_DEMO=true ENABLE_LIVE_AI=false npm start -- --port 3100 &`。
  4. `METRICS_OUT=verification/revamp-v41/V41-{n}/metrics.json FIRST_LOAD_MODULES_OUT=verification/revamp-v41/V41-{n}/first-load-modules.json CAPTURE_BATCH=V41-{n} npx playwright test --config verification/revamp-v41.capture.config.ts`（畫面基準＋metrics；`metrics.spec.ts` 不設這兩個變數時會寫到 `verification/revamp-v4/V41-{n}/`，與第 7 步 Lighthouse 合併寫入的 `verification/revamp-v41/V41-{n}/metrics.json` 分家，所以一定要設）。
  5. V41-2a 起：`GUIDE_MEDIA=check npx playwright test --config verification/guide-media.config.ts`（與 `verification/guide-media/baseline/` 的基準 PNG 比對，差異 0 張；不寫任何檔）。只有新增媒體或畫面改變時才用 `GUIDE_MEDIA=write`，它只更新有差異或新增的媒體。
  6. V41-1 起：`node scripts/launch-check.mjs --base http://127.0.0.1:3100 --out verification/revamp-v41/V41-{n}/launch-check-local.json`（13 項＋補充）。
  7. Lighthouse：第一次先 `npx -y lighthouse@13.5.0 --version`；再 `node --no-warnings scripts/lighthouse-pages.mjs --base http://127.0.0.1:3100 --out verification/revamp-v41/V41-{n}`（v4 的 8 頁；V41-1 起加 `/guide`、V41-2a 起加 `/guide/overview`，這兩頁另跑 navigation 模式，類別含 SEO）。
  8. `lsof -ti tcp:3100 | xargs kill`，再確認 `lsof -ti tcp:3100` 沒有輸出。
  9. 四尺寸截圖（1440×1000、1280×900、768×1024、390×844）各至少一張，存 `verification/revamp-v41/V41-{n}/`。
  10. 禁區與邊界五條（D-V41-3，都必須為空；**不可用 `main` 比對**）：
      - `git diff --stat 625bfa5 -- src/domain fixtures docs/METRICS.md`
      - `git diff --stat 82b70df -- src/domain fixtures/golden fixtures/demo fixtures/errors fixtures/refund_only fixtures/zero_ad docs/METRICS.md`
      - `git diff --stat 625bfa5 -- src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts`
      - `git status --porcelain -- src/domain fixtures docs/METRICS.md src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts src/app/api vercel.json src/application/analytics.ts`
      - `git diff --stat 872662d -- src/app/api vercel.json src/application/analytics.ts`
  11. 更新 `docs/STATUS.md`（真實結果）；必要時 `docs/DECISIONS.md` 記一筆；驗收寫 `verification/revamp-v41-V41-{n}-acceptance.md`；本檔進度欄同步。
- commit 訊息以 `revamp(V41-{n}): …` 開頭；commit 後跑 `git diff --stat 625bfa5 HEAD -- src/domain fixtures docs/METRICS.md src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts` 與 `git diff --stat 872662d HEAD -- src/app/api vercel.json src/application/analytics.ts`，都必須為空，commit hash 寫進驗收文件。commit 只留在本機，不 push。
- 「避免過度微調」（使用者 2026-10-13，`docs/DECISIONS.md:364`）：審查只修 blocker、major（造成錯誤、退步或違反規格）；nit 只記錄。不加規格以外的調整。

---

## 人工關卡（不屬於任何批次）

| 關卡 | 內容 | 擋住 | 估計時間 | 材料 |
|---|---|---|---|---|
| H7 介紹文案確認（D-V41-18） | 使用者本人看 `/guide`（preview 或本機）：動機段（自己的話，或回覆「用草稿」）、幫誰解決什麼、獨特性、聯絡資訊；有修改就在下一個批次或 V41-5 套用 | v4.1.0 正式上線 | 約 30 分鐘 | `/guide`、`GUIDE_CONTENT.md` §1 |
| H6 v4 複測與盲評（沿用 v4；D-V41-17） | 沿用 `docs/revamp-v4/usability-test.md`，加 T5（從首頁找到使用說明並說出給誰用）、T6（只看 `/guide/import` 完成匯入，`tests/fixtures/inclusive_tax`） | D-V41-17＝A：不擋 v4.1.0 | 約 1 週 | `usability-test.md`（V41-5 加兩題） |

---

## 批次總表

| 批次 | 主題 | 大小 | 依賴（批次、拍板、人工關卡） | 狀態 |
|---|---|---|---|---|
| V41-0 | 基準與護欄（不改畫面；含 O3 Next.js 修正版） | M | D-V41-1、12、15 | 完成（2026-10-14；Next.js 16.3.8；52 張 0 差異；驗收見 `verification/revamp-v41-V41-0-acceptance.md`） |
| V41-1 | 說明路由、入口與介紹三段 | M | V41-0；D-V41-4、5、9、10、11、13、19 | 完成（2026-10-14；E2E 1,077／0／27；`/` 首載 519,687；390 TBT 五項通過；D-V41-25＝A，60 張基準；驗收見 `verification/revamp-v41-V41-1-acceptance.md`） |
| V41-2a | 媒體管線與前 5 個功能區（start、import、overview、diagnosis、products） | M | V41-1；D-V41-20、21、22 | 完成（2026-10-14；21 張截圖、`GUIDE_MEDIA=check` 0 差異；E2E 1,103／0／29；390 TBT 五項通過；驗收見 `verification/revamp-v41-V41-2a-acceptance.md`） |
| V41-2b | 後 6 個功能區（scenarios、actions、meeting、data、evidence、export） | M | V41-2a | 完成（2026-10-15；44 張截圖、`GUIDE_MEDIA=check` 0 差異；E2E 1,127／0／29；390 TBT 五項通過；驗收見 `verification/revamp-v41-V41-2b-acceptance.md`） |
| （preview） | 經使用者當次同意部署 Vercel preview（push 分支也算），給 H7 用（D-V41-24） | — | V41-2b | — |
| V41-4 | 優化補充（O1 分享圖與 README 首圖、O2 CLS） | S | V41-2b；D-V41-14 | 未開工 |
| V41-5 | 收尾與上線 | M | V41-0–V41-2b、V41-4；D-V41-1、17、18、24；**H7**（擋正式上線） | 未開工 |
| V41-3 | 示範影片 3 支（v4.1.0 上線後，使用者明確要影片時才做） | S | V41-5；D-V41-6＝A、D-V41-7 | 未開工 |

上線前 6 批、至少 6 個工作階段；人工時間約半天（H7）＋H6（後補）。依賴鏈：V41-0、V41-1、V41-2a、V41-2b、（preview、H7）、V41-4、V41-5。V41-3 依 D-V41-6 的建議值排在 V41-5 之後；D-V41-6＝A 時改排在 V41-2b 之後、V41-4 之前，V41-5 照常。

---

## V41-0 基準與護欄（M；不改任何畫面）

**範圍**
1. 在 `revamp/v4.1` 上工作（D-V41-2，預設沿用；不 push）；以 `00_README.md` 末節草案整份取代 `CLAUDE.md`（使用者同意開工後）。
2. **O3**（D-V41-15＝A）：先 `npm view next@16.3.8 version`、`npm view eslint-config-next@16.3.8 version` 確認存在；`npm install --save-exact next@16.3.8 eslint-config-next@16.3.8`；`npm ci`；`npm audit --json > verification/revamp-v41/V41-0/npm-audit.json`，剩下的項目逐一寫評估（沿用 R6：只用寫出 API、不解析使用者的圖片或試算表，或只在開發時使用）。審查時另見 `source-map-js`（high，有非破壞性修正）：一併評估並記錄；修正要動 lockfile 時先問使用者。升級後全套驗收不通過、一批內修不好時，回退到 `16.3.7` 並記錄原因。
3. labels 護欄：產生 `verification/revamp-v41/labels-v4.flat.json`（v4.0.0 `labels.zh-TW.ts` 全部字串葉節點，鍵依碼位排序；產生方式寫進 `V41-0-baseline.md`；起草時試數 2,839，實數以產出為準）；`tests/labels-structure.test.ts` 加 `V41_NEW_KEY_PREFIXES = ["guide.", "shell.guideV41."]`，斷言快照每個鍵都在、字串逐字相同；`labels.zh-TW.ts` 的新葉節點只能在 V3、V4 前綴與 `shell.guideV41.` 下，`LABEL_GROUPS` 維持 24 組；`src/i18n/guide.zh-TW.ts` 存在時（V41-1 起），它的葉節點全部在 `guide.` 下。本批不新增 key、不建 guide 檔。
4. 掃描規則：
   - `scripts/lib/copy-scan.mjs`：佔位符規則把 `{ui:路徑}` 當佔位符（不計字、不掃黑名單、不算佔位符不一致）；`L1_KEY_PATTERNS` 加 `^guide\.areas\.[^.]+\.title$`、`^guide\.areas\.[^.]+\.steps\.[^.]+\.title$`（`guide.sections.*` 已被既有的 `^[^.]+\.sections\.[^.]+$` 涵蓋）；`SCOPED_BLACKLIST` 加 `guide.*` 範圍的最高級黑名單 `/唯一|最好|最快|最佳|最強|第一名|業界第一/`（只抓最高級，不擋「第一次」「第一項」這類序數）；`scanLabels` 可以多收一個 view（`guideLabels`），指標相加。`scripts/ui-audit.mjs` 的 labels 範圍同步涵蓋 `guideLabels`。本批沒有 guide 檔，違規 0。
   - `scripts/lib/ui-scan.mjs` 的 tsx 範圍（design-lint、ui-audit 共用）與 `tests/labels-coverage.test.ts` 的「元件 JSX 與字串常值沒有 CJK」斷言，都擴到 `src/app/**/*.tsx`；先確認現有的 `src/app/layout.tsx`、`src/app/page.tsx` 實測為 0，`tests/fixtures/design-lint-ceiling.json` 的上限不變。
5. testid：新增 `verification/revamp-v41/testids-v41-added.txt`（只有表頭，格式同 `testids-v4-added.txt`）；`tests/testid-baseline.test.ts` 改成比四份。
6. 畫面基準與量測：新增 `verification/revamp-v41.capture.config.ts`（比照 `verification/revamp-v4.capture.config.ts`，`testDir` 仍是 `revamp-v4-capture`，`snapshotPathTemplate` 改到 `verification/revamp-v41/{batch}/snapshots/`）；複製 `verification/revamp-v4/V4-11/snapshots/`（52 張）為 V41-0 基準，不帶 `--update-snapshots` 跑。`verification/revamp-v4-capture/metrics.spec.ts` 加兩項量測：`/` 的 First Load JS（記錄 v4.0.0＋O3 的實測，寫成 V41-1 起的門檻常數＝實測＋1,024）、404 頁的 First Load JS（請求一個不存在的網址，量回應 HTML 引用的腳本；說明頁的框架基準，下稱「框架基準」）。執行時用 `METRICS_OUT`、`FIRST_LOAD_MODULES_OUT` 指到 `verification/revamp-v41/V41-{n}/`（共通驗收第 4 步）。
7. 功能保留：`verification/revamp-v41/feature-retention.csv` 延續 `verification/revamp-v4/feature-retention.csv` 全部 155 列，`status` 寫成「v4.0.0 已核對；v4.1 未改動（covering_tests 全過）」，不逐列重新核對。只有會受影響的列重新核對：殼層的側欄、手機「更多」、頁尾、空狀態（例如 v4 的第 2、6、7、21 列）的 `batch` 標 V41-1；O2 修到的頁的列在 V41-4 開工時標 V41-4。再加 v4.1 新列（入口 4、說明首頁、11 個功能區頁、O1、O2、O3；影片 3 列標 V41-3），`batch` 欄填 V41-n。`verification/revamp-v41/e2e-text-assertions.csv` 自 v4 延續。
8. 基準紀錄 `verification/revamp-v41/V41-0-baseline.md`：First Load（`/` 與 404 頁）、首載 chunk 清單、DOM 節點、390 五個 TBT（低負載各 3 次取中位數與 loadavg）、8 頁 Lighthouse、axe、keyboard-walk、network-log、`npm audit` 評估、labels 葉節點數、`src/app/**/*.tsx` 的掃描結果。

**依賴**：D-V41-1、12、15（D-V41-2、3 預設沿用）。

**允許變動畫面**：無。52 張與 V4-11 0 差異（O3 之後也必須 0 差異）。

**驗收重點**：52 張 0 差異；`next@16.3.8` 後全套通過（或回退並寫明原因）；labels 兩份快照逐字相同；testid 四份刪除 0；禁區與邊界五條皆空；基準全部寫入 `verification/revamp-v41/V41-0/`（不是 `verification/revamp-v4/V41-0/`）；copy-scan 新規則對既有字串 0 違規；`src/app/**/*.tsx` 掃描為 0、design-lint 上限不變。

**同批 labels 與測試**：labels 值不動；改 `tests/labels-structure.test.ts`、`tests/testid-baseline.test.ts`、`tests/labels-coverage.test.ts`、`scripts/lib/copy-scan.mjs`、`scripts/lib/ui-scan.mjs`、`scripts/ui-audit.mjs`、`verification/revamp-v4-capture/metrics.spec.ts`；新增 capture config、三個 `verification/revamp-v41/` 清單檔與快照。

---

## V41-1 說明路由、入口與介紹三段（M）

**範圍**
1. 路由：`src/app/guide/layout.tsx`（說明頁外框：品牌連到 `/`、「開啟工作台」、跳至主要內容、頁尾）、`src/app/guide/page.tsx`（說明首頁）、`src/app/guide/metadata.ts`（共用 helper `guideMetadata({ title, description, path })`，回傳完整的 `openGraph`（title、description、url、siteName、locale、type、`images: [{ url: "/og.png", width: 1200, height: 630, alt }]`）、`twitter` 與 `alternates.canonical`；PRD §3.8）；都是伺服器元件，說明首頁的 metadata 由 `guideMetadata` 產生（canonical＝`/guide`）。
2. `src/application/guide.ts`：`GUIDE_AREAS`（代號、分組、順序、步驟 key、`mediaId`；本批是空陣列，V41-2a、2b 逐步加）與 `resolveUiRefs()`（把 `{ui:路徑}` 換成 labels 字串，路徑不存在就丟錯）；純資料，不含中文，只給伺服器模組 import。
3. 元件 `src/components/guide/`：`guide-text.tsx`（渲染 `{ui:…}`：步驟內文粗體，其他欄位純文字）、`guide-card-list.tsx`（功能區目錄）；全部伺服器元件。
4. 說明首頁內容（`GUIDE_CONTENT.md` §1）：開頭、為什麼做這套服務（依 D-V41-9；使用者還沒提供文字時用 §1.1 產品口吻草稿）、幫哪些人解決哪些問題、獨特性與代價、30 秒上手（文字，連到功能區頁）、功能區目錄（從 `GUIDE_AREAS` 產生；本批為空時不顯示目錄區）、頁尾（含分析揭露句的同一判斷）。
5. 工作台入口（D-V41-5）：側欄（`aside.sidebar` 內、`nav` 之後）、手機「更多」最後一列、首頁空狀態一行（`shell.guideV41.homeHint`，陳述句）、頁尾；都是 `<a href="/guide" target="_blank" rel="noopener">`，可及名稱含可見文字＋`shell.guideV41.newTab`；testid `guide-entry-{sidebar|more|home|footer}`。
6. labels：新檔 `src/i18n/guide.zh-TW.ts` 匯出 `guideLabels`：`guide.hub`、`guide.sections`、`guide.why`（或 `guide.whyFirstPerson`）、`guide.who`、`guide.unique`、`guide.tradeoffs`、`guide.quickstart`、`guide.groups`、`guide.common`；`labels.zh-TW.ts` 只加 `shell.guideV41.*` 3 條（`LABEL_GROUPS` 維持 24 組）。
7. sitemap 與上線檢查（D-V41-13）：`src/app/sitemap.ts` 從 `GUIDE_AREAS` 產生（本批是 `/` 與 `/guide`）；`tests/relaunch.test.ts:104-111` 的 sitemap 斷言同批改成「sitemap＝`[SITE_URL, SITE_URL/guide, …GUIDE_AREAS 各頁]`，每筆的 `lastModified` 都是 Date」（原本是 `toHaveLength(1)`），robots 的斷言不變；`scripts/launch-check.mjs` 補充檢查改成「sitemap 含 `/` 與全部說明頁網址」、加 `/guide` 200 且含品牌名、`/guide` 的 og:image 是 `/og.png`、`/guide/not-a-area` 404（本批 404 由 Next 預設處理）；13 項不變。
8. 樣式：`globals.css` 加 `.guide-*`，只用既有 token 與字級（design-lint 字級種類不升）。
9. 測試與量測：
   - `tests/guide-content.test.ts`：`{ui:…}` 全部解析；L1；最高級黑名單；重打的介面字串 0（`guide.*` 的字串在 `{ui:…}` 之外，不得含任何 `shell.nav.*.headline`、`*.buttons.*`、`*.sections.*` 的值（長度 ≥ 3）；指標名 `metrics.*.headline` 與測試檔內 `GUIDE_PLAIN_TERMS` 列出的通用詞除外，起始只有「下一步」「影響金額」「關鍵數字」，每個附理由）；`shell.guideV41.*` 不含「？」；`guideLabels` 不含第一人稱骨架的「〔」「〕」（只有使用者填寫的文字會上線）。
   - `tests/guide-routes.test.tsx`：說明首頁 SSR、h1 唯一、canonical＝`/guide`、og:image＝`/og.png`；說明頁的模組圖不含禁用模組；沒有任何 `"use client"` 模組 import `@/i18n/guide*`、`@/application/guide`、`@/components/guide/*`。
   - `verification/revamp-v4-capture/metrics.spec.ts`：比照 `SPLIT_SENTINELS` 加 `GUIDE_SENTINELS`（`guideLabels.guide.hub.title` 這種只出現在 `guideLabels` 的字串），在 `/` 的首載 chunk 中出現 0 次。
   - `tests/e2e/guide.spec.ts`（四尺寸：無橫向捲動；入口另開分頁且原分頁的示範資料仍在；axe）、`keyboard-walk` 加 `/guide`（跳過連結、第一個按鈕、目錄第一項）、`axe-sweep` 加 `/guide`、`mounted-testids` 加 4 個入口 testid（M6：側欄與「更多」各一個）。
   - `scripts/lighthouse-pages.mjs`：對 `/guide` 另跑 navigation 模式，類別 accessibility、performance、seo。本機 127.0.0.1 上 canonical 指向正式站網域，Lighthouse 的 canonical 稽核可能失敗：失敗時在驗收文件記錄原因，SEO 分數只排除這一項，或改在 preview 上量（需使用者當次同意）。
   - 畫面基準新增 14 首頁空狀態、15 說明首頁首屏（× 4 尺寸）。
10. `testids-v41-added.txt` 追加本批新增的 testid；`feature-retention.csv` 中 `batch`＝V41-1 的列（含重新核對的殼層列）打勾。

**依賴**：V41-0；D-V41-4、5、9、10、11、13、19（D-V41-23 預設沿用）。

**允許變動畫面**：含側欄的畫面（01–10 中有側欄的尺寸；實際張數與理由寫進驗收）；02、04–09 mobile（頁尾連結；D-V41-25＝A 更正：390 沒有側欄，這 7 張都是整頁截圖、都含頁尾，頁尾加入口後在 390 多折一行，頁高 +16px）；新增 14、15。11、12、13 是元素截圖，必須 0 差異。

**驗收重點**：B1 `/` First Load ≤ V41-0 實測＋1,024，且 `/` 首載 chunk 的 `GUIDE_SENTINELS` 為 0；B2 `/guide` First Load ≤ 框架基準＋5,120 且不含禁用模組；`/guide` Lighthouse a11y 100、SEO ≥ 95（或依第 9 點記錄 canonical 稽核）、Performance 1440 ≥ 97、390 ≥ 90；四尺寸 axe 0 serious；入口另開分頁後工作台資料仍在；canonical 與 og:image 正確；sitemap 兩個網址（`tests/relaunch.test.ts` 同步）；launch-check 13 項＋補充通過；新 key 只在兩個前綴下、copy-scan 0 違規、重打的介面字串 0；B2 首屏、B9、390 TBT 不退。

---

## V41-2a 媒體管線與前 5 個功能區（M）

**範圍**
1. 媒體管線（PRD §3.5）：`verification/guide-media.config.ts`、`verification/guide-media/capture.spec.ts`（`GUIDE_MEDIA=check|write`）；擷取狀態 S0、S1、S3–S5 的 helper（沿用 `verification/revamp-v4-capture/shared.ts`；需要看到手機底部分頁列的截圖不套 `noOverlayStylePath`）；目標元素強調框（只注入擷取頁面）。基準 PNG 提交到 `verification/guide-media/baseline/{mediaId}.png`；`check` 用 `toHaveScreenshot` 比對（設定同 `verification/revamp-v4.capture.config.ts`：`maxDiffPixels: 0`、`threshold: 0.02`、`animations: "disabled"`），不寫任何檔；`write` 只更新比對失敗或新增的 media（Playwright `--update-snapshots=changed` 的語意），只對這些重轉 WebP（Chromium canvas 品質 0.9）並更新清單項目，比對通過的檔一律不動。媒體清單 `src/application/guide-media.json` 只記內容欄位（`id`、檔名、寬高、bytes、基準 PNG 的 SHA-256、`labels_hash`）與整份清單的 `updated`（日期；只有實際更新了媒體時才改）；擷取時間與 commit 寫進驗收文件。
2. 路由 `src/app/guide/[area]/page.tsx`：`generateStaticParams` 取 `GUIDE_AREAS`、`dynamicParams = false`、`generateMetadata` 用 `guideMetadata`（canonical＝`/guide/{area}`、og:image＝`/og.png`）；元件 `guide-step.tsx`（`<figure>`；`<img loading="lazy" decoding="async" width height>` 外包一個連到原尺寸檔的 `<a href>`，可及名稱＝`alt`＋`guide.common.fullSize`；第一張不 lazy）、`guide-toc.tsx`。
3. 5 個功能區（`GUIDE_CONTENT.md` §2.1–2.5）：start、import、overview、diagnosis、products 的 labels 與截圖（約 21 張；桌機截圖寬度盡量 ≤ 800 CSS px）。依 D-V41-21，同批更新 `tests/fixtures/synthetic-4-channel/README.md` 的用途段（D-V4-31 修改為「另允許用於說明頁截圖，圖說標明虛構的合成資料，通路顯示原代碼」）；D-V41-21＝C 時商品頁第 3 步只放文字、不改 README。
4. 同步檢查（D-V41-22）：`tests/guide-content.test.ts` 加媒體檢查（每個 `mediaId` 在清單、WebP 與基準 PNG 都存在、基準 PNG 的 SHA-256 與清單相符、`public/guide/` 與 `baseline/` 都沒有孤兒檔、單張 ≤ 200 KB、每頁合計 ≤ 1.5 MB、`labels_hash` 相符）。
5. 測試與量測：`tests/guide-routes.test.tsx` 每個 area SSR、canonical、og:image；E2E 每個 area 四尺寸無橫向捲動、圖都載得到、目錄錨點可用、390 每張圖都有原尺寸連結並記錄顯示寬度／`naturalWidth`（低於 0.45 的圖列進驗收文件，優先改成更窄的裁切）；`keyboard-walk` 加 `/guide/start`；`axe-sweep` 加 `/guide/overview`；Lighthouse 對 `/guide/overview` 跑 navigation 模式（含 SEO，同 V41-1 第 9 點）；畫面基準新增 16（`/guide/overview` 首屏，× 4）。
6. sitemap 7 個網址；說明首頁目錄出現 5 張卡；`testids-v41-added.txt` 追加。

**依賴**：V41-1；D-V41-20、21、22。

**允許變動畫面**：15（目錄多 5 張卡）；新增 16。其餘 0 差異。

**驗收重點**：`GUIDE_MEDIA=write` 後連跑兩次 `GUIDE_MEDIA=check` 都是 0 差異（擷取穩定）；再跑一次 `GUIDE_MEDIA=write`，因為比對 0 差異，任何檔都不改（`git status` 沒有變動），有變動時寫明原因；B3、B6 通過；`/guide/overview` Lighthouse 與 axe 通過；每張圖 `alt` 來自 `guideLabels`；B2 不退；`/` 的 First Load 不變。

---

## V41-2b 後 6 個功能區（M）

**範圍**
1. 擷取狀態 S6–S8 的 helper。
2. 6 個功能區（`GUIDE_CONTENT.md` §2.6–2.11）：scenarios、actions、meeting、data、evidence、export 的 labels 與截圖（約 23 張）。
3. sitemap 13 個網址；說明首頁目錄完整（11 張卡）；`testids-v41-added.txt` 追加。
4. 完成後依 D-V41-24 詢問是否部署 preview（使用者當次同意才 push 分支或部署），給 H7 用。

**依賴**：V41-2a。

**允許變動畫面**：15（目錄多 6 張卡）。其餘 0 差異。

**驗收重點**：同 V41-2a；11 個功能區頁全部通過 B3–B6；`GUIDE_MEDIA=check` 差異 0 張。

---

## V41-4 優化補充（S）

**範圍**
1. **O2 CLS**：對 390 切到商品毛利、資料來源、待辦與 1440 切到待辦，用 Lighthouse trace 的 layout-shift 元素找出來源；同一批內能修好就修（例如骨架與內容等高、預留高度），不改版面設計；修前修後各量 3 次（記錄 loadavg）。修不好就在驗收文件寫明來源與原因。修到的頁在 `feature-retention.csv` 的對應列標 V41-4 並重新核對。
2. **O1 分享圖與 README 首圖**：`scripts/make-og.mjs` 的 `SCREENSHOT` 改取 `verification/revamp-v41/V41-4/snapshots/desktop/01-overview-top.png`，`SOURCE.sidebar` 從 212 改成 220（目前 `--sidebar-w` 是 220px；或改讀 token），重產 `public/og.png`（1200×630，文字仍取 labels）；README 首圖改成新檔 `docs/images/overview-1440-v4.png`（取同一張畫面基準，舊圖保留），`tests/release-notes.test.ts:147` 的首圖斷言同批改。
3. `feature-retention.csv` 的 O1、O2 列打勾。

**依賴**：V41-2b；D-V41-14。

**允許變動畫面**：O2 的修正改到靜態版面時，只允許相關的頁（預期 04 待辦、06 商品、09 資料來源）且逐張寫理由；其餘 0 差異。說明媒體的 `GUIDE_MEDIA=check` 也必須 0 差異；O2 改到說明截圖拍到的版面時，才 `write` 並逐張寫理由。

**驗收重點**：4 個切頁 CLS < 0.05，或寫明原因；`og.png` 上不再出現 v3 已改名的舊名（「口徑說明」「通路貢獻」「輔助指標」），左緣沒有殘留側欄；launch-check 補充檢查的 og.png 1200×630 通過；390 TBT 不退。

---

## V41-5 收尾與上線（M）

**範圍**
1. 版本 `4.1.0`（`package.json`）；跑 `GUIDE_MEDIA=check`，必須 0 差異（版本號改變不需要重拍；有差異時才 `write`，逐張寫理由）。
2. 文件：`docs/RELEASES.md` 新增 v4.1.0 段（給使用者、不變的事、已知限制）；`README.md` 發布紀錄段改成 v4.1.0、「30 秒試用」與「用自己的資料」加 `/guide` 連結（`tests/release-notes.test.ts:143` 同批改）；`docs/ENGINEERING.md` 文件地圖加 `docs/revamp-v4.1/`；`docs/STATUS.md`、`docs/DECISIONS.md`；`docs/revamp-v4/usability-test.md` 加 T5、T6（D-V41-17）。
3. `feature-retention.csv`：確認 v4.1 新列（影片列除外）與 V41-1、V41-4 重新核對的列都已打勾；沿用的 v4 列維持「v4.0.0 已核對；v4.1 未改動」，不逐列重勾。PRD §2.2 填真實值（A 未執行寫「未量測」）。
4. 套用 H7 的修改（如有）；H7 未完成時不上正式站。
5. 上線（每一項都要使用者當次明確同意）：tag `v4.1.0`、`main` fast-forward 並推送（觸發正式站部署）、對正式站跑 `node scripts/launch-check.mjs --base https://profitlens-tau.vercel.app --out verification/revamp-v41/V41-5/launch-check-production.json`。Skew Protection 依 D-V41-16（預設沿用：由使用者本人在 Vercel 設定處理）。

**依賴**：V41-0–V41-2b、V41-4；D-V41-1、17、18、24；**H7**（擋正式上線）。

**允許變動畫面**：無（`GUIDE_MEDIA=check` 應 0 差異；有差異時逐張寫理由）。

**驗收重點**：§2.2 B 全部達標或誠實列出未達標與原因；`GUIDE_MEDIA=check` 0 差異；sitemap 13 個網址；禁區與邊界五條皆空；testid 四份刪除 0；正式站 13 項＋補充通過（上線時）。

**同批 labels 與測試**：不加新 key（H7 的修改只改 `guideLabels` 的值）；全套測試。

---

## V41-3 示範影片（S；v4.1.0 上線後，使用者明確要影片時才做）

依 D-V41-6 的建議值（B），本批不在上線前做。使用者明確要影片（D-V41-6 改選 A）時開工；若在上線前選 A，本批排在 V41-2b 之後、V41-4 之前。上線後才做時，版本號與部署另經使用者當次同意。

**範圍**
1. 3 支影片（`GUIDE_CONTENT.md` §3）：Playwright `recordVideo`（1280×800），每個 cue 開始時記錄時間點；依 D-V41-7：A 用本機 `ffmpeg` 轉 MP4（H.264、`-an`、`+faststart`）／B 直接用 WebM。
2. 字幕：`guide.videos.{id}.cues[]` → `public/guide/video/{id}.vtt`（`kind="captions"`、`srclang="zh-Hant-TW"`）；poster WebP。
3. 元件 `guide-video.tsx`：`<video controls preload="none" playsinline poster>`＋`<track default>`，不自動播放、不循環；影片下方先一行 `guide.common.videoNote`「影片沒有聲音；下方是影片的逐步文字」，再用 `<ol>` 列出 `guide.videos.{id}.cues`（與 VTT 同一來源）當逐字稿。放在說明首頁（30 秒上手）、`/guide/start`、`/guide/import`、`/guide/meeting`。
4. 媒體清單與同步檢查加影片（≤ 2 MB、≤ 45 秒、VTT 段數＝cue 數）。`GUIDE_MEDIA=check` 對影片照流程重跑，在每個 cue 擷取一張 PNG，與 `verification/guide-media/baseline/video/{videoId}-{cue}.png` 比對（同一套比對設定）；全部 0 差異就不重錄；`GUIDE_MEDIA=write` 只在有差異或新增時重錄、轉檔並更新 cue 基準。E2E：影片控制可用 Tab 到達、axe `video-caption` 通過、`preload="none"` 下首載不下載影片、逐字稿 `<ol>` 的項數＝cue 數。

**依賴**：V41-5（或 D-V41-6＝A 時為 V41-2b）；D-V41-6＝A、D-V41-7（D-V41-8 預設沿用）。

**允許變動畫面**：15（30 秒上手多一個影片框）。其餘 0 差異。

**驗收重點**：B3 影片門檻；axe 0；說明頁 Lighthouse 不退；network-log：首頁與工作台的請求不含任何 `/guide/video/`；`GUIDE_MEDIA=write` 後再跑 `check`，cue 比對 0 差異、不重錄。

---

## 護欄與棘輪時程

| 指標 | V41-0 基準 | 規則與時程 |
|---|---|---|
| `/` First Load JS（gzip） | v4.0.0 為 519,322（V4-11）；V41-0 在 O3 後重量 | V41-1 起 ≤ V41-0 實測＋1,024；v4 上限 545,397 仍有效；V41-1 起 `/` 首載 chunk 的 `GUIDE_SENTINELS` 為 0 |
| 說明頁 First Load JS（gzip） | V41-0 量 404 頁當框架基準 | V41-1 起 `/guide`、`/guide/{area}` ≤ 框架基準＋5,120；不含 `recharts`、`pptxgenjs`、`xlsx`、工作台模組 |
| 說明頁媒體 | — | V41-2a 起：單張 ≤ 200 KB、每頁合計 ≤ 1.5 MB、桌機截圖寬度盡量 ≤ 800 CSS px、390 每張圖有原尺寸連結；V41-3 起每支影片 ≤ 2 MB、≤ 45 秒 |
| 說明頁 Lighthouse | — | V41-1 起 `/guide`、V41-2a 起 `/guide/overview`（navigation 模式）：a11y 100（下限 95）、SEO ≥ 95（本機 canonical 稽核依 V41-1 第 9 點處理）、Performance 1440 ≥ 97、390 ≥ 90、CLS 0 |
| axe 四尺寸 | v4 最終狀態數（以 V41-0 實測為準，寫進 `V41-0-baseline.md`） | 每批 0 serious；V41-1 加 `/guide`、V41-2a 加 `/guide/overview`、V41-3 加有影片的頁 |
| keyboard-walk | v4 各頁里程碑 | 工作台各頁不晚於 v4；V41-1 加 `/guide`、V41-2a 加 `/guide/start` 的里程碑；`aria-hidden` 內停留點 0 |
| 同步檢查（B6） | — | V41-1 起 `{ui:…}` 未解析 0、重打的介面字串 0；V41-2a 起缺檔、孤兒檔、SHA-256、`labels_hash` 全過，每批 `GUIDE_MEDIA=check` 差異 0 張 |
| labels 既有字串 | v3 快照 2,581；v4 快照（V41-0 產生） | 每批逐鍵逐字相同；新葉節點只在 `guide.`（`guide.zh-TW.ts`）、`shell.guideV41.`（`labels.zh-TW.ts`）下；`LABEL_GROUPS` 24 組不變 |
| testid 刪除數 | v2、v3、v4 新增、v41 新增四份 | 每批 0；每批把新增的 testid 追加到 `testids-v41-added.txt` |
| design-lint、copy-style、chart-lint、copy-density | v4 最終上限 | 每批不升；V41-0 起 design-lint 的 tsx 範圍含 `src/app/**/*.tsx`；`guideLabels` 新字串 0 違規 |
| 畫面基準 | 52 張（V4-11） | V41-1 加 14、15，V41-2a 加 16，共 64 張；每批只允許該批列出的畫面有差異 |
| B2 首屏、B3、B9、390 五個 TBT | V41-0 實測 | 每批照 v4 規則斷言（D-V4-36、D-V4-47） |
| CLS（O2） | 4 個切頁 0.053–0.054 | V41-4 起 < 0.05，或驗收寫明原因 |
| network-log | 下載 5 種、無 POST | 每批不變（原尺寸連結是導覽，不是下載）；工作台頁面不請求 `/guide/*` 的媒體 |
| launch-check | 13 項＋補充（單一網址 sitemap） | V41-1 起補充檢查改為 sitemap 含全部說明頁網址、`/guide` 200 且 og:image 是 `/og.png`、未知功能區 404；13 項不變 |
| 禁區與邊界 | 五條皆空 | 每批第 10 步；commit 後兩條也必須為空 |

---

## 每批共同產物

| 產物 | 位置 |
|---|---|
| 驗收文件 | `verification/revamp-v41-V41-{n}-acceptance.md`（含擷取時間與 commit） |
| 截圖與量測 | `verification/revamp-v41/V41-{n}/`（四尺寸截圖、`snapshots/`、`ui-audit.json`、`metrics.json`、`first-load-modules.json`、Lighthouse、`axe.json`、`keyboard-walk.json`、`network-log.json`、`launch-check-local.json`） |
| 說明媒體 | `public/guide/**`、`src/application/guide-media.json`、基準 PNG `verification/guide-media/baseline/**`（V41-2a 起；只在畫面改變時更新） |
| 功能保留 | `verification/revamp-v41/feature-retention.csv` 中本批的列打勾 |
| 狀態與決策 | `docs/STATUS.md`、必要時 `docs/DECISIONS.md`、本檔進度欄 |
