<!-- V3-10 上線檢查（06_BATCHES V3-10「四尺寸走查與鍵盤走查；v1–v5 備份還原；網路紀錄；13 項 HTTP 上線檢查」；PRD §2.3 B／C）：檢查工具的用法與輸出位置（代理 C）。 -->
# V3-10 上線檢查工具

本資料夾放 V3-10 上線檢查的**結果檔**；檢查本身是下面五支程式。程式都不改產品、不加依賴、不部署；原始 CSV 只在本機讀。正式判定一律對 **production 伺服器**（`next build` 後 `next start`，或正式站），對 `next dev` 跑只證明程式能跑（dev 的標頭、快取、效能與 HMR 請求都不同）。

| 檢查 | 程式 | 對應條目 | 結果檔（環境變數） |
|---|---|---|---|
| 13 項 HTTP＋補充 | `scripts/launch-check.mjs` | 08_RELAUNCH §4 第 3 條、`verification/deployment-acceptance.md` | `--out` 指定（建議 `launch-check-local.json`／`launch-check-production.json`） |
| 網路紀錄（沒有資料外送） | `tests/e2e/network-log.spec.ts` | PRD §11.3、08 §4 第 9 條 | `NETWORK_LOG_OUT`（建議 `network-log.json`） |
| 鍵盤走查 | `tests/e2e/keyboard-walk.spec.ts` | 08 §4 第 6 條、PRD §2.3 B、§11.1、D-V3-27 | `KEYBOARD_WALK_OUT`（建議 `keyboard-walk.json`） |
| axe 四尺寸 | `tests/e2e/axe-sweep.spec.ts` | PRD §2.3 C、§11.1 | `AXE_OUT`（建議 `axe.json`） |
| 備份 v1–v5 還原矩陣 | `tests/backup-restore-matrix.test.ts` | PRD §11.8、08 §4 第 8 條 | `BACKUP_MATRIX_OUT`（建議 `backup-matrix.json`） |
| 決策匯出大小調查 | （報告）`export-size.md` | V3-9a 已知問題 | — |

三支 E2E 共用 `tests/e2e/launch-helpers-v310.ts`（字串一律取 labels 新路徑；JSON 合併寫檔；頁內焦點與可及名稱判斷）。沒給環境變數時，E2E 的結果寫到 `test-results/<測試>/`（`testInfo.outputPath`），平常跑 `npm run test:e2e` 不會動到 `verification/`；給了就以 Playwright 專案名（desktop／laptop／tablet／mobile）為鍵合併寫進同一份 JSON。

## 0. 準備 production 伺服器（與 R7 相同的正式站設定）

```sh
npm run build
APP_MODE=PUBLIC_DEMO PUBLIC_DEMO=true ENABLE_LIVE_AI=false NEXT_TELEMETRY_DISABLED=1 npm start -- --port 3100
```

## 1. 13 項 HTTP 上線檢查：`scripts/launch-check.mjs`

```sh
node scripts/launch-check.mjs --base http://127.0.0.1:3100 --out verification/revamp-v3/V3-10/launch-check-local.json
# 與 R7 的 Python 腳本相同的位置參數也可以：node scripts/launch-check.mjs <out.json> <base>
# 正式站（需使用者當次同意部署後）：--base https://profitlens-tau.vercel.app --out verification/revamp-v3/V3-10/launch-check-production.json
```

- 13 項與 `verification/revamp-R7-smoke.py` 逐項相同：`/` 200 含 ProfitLens；五個 `/api/datasets/*` 200、synthetic、manifest 與 `fixtures/` 深度相等、三份 CSV 原始位元組全等（記 SHA-256）；`/api/insights` GET available=false＋reason PUBLIC_DEMO、POST 空 JSON 403；五個非公開路徑 404。
- 補充（不計入 13 項）：HTML lang／title／description／canonical／og:image；og.png 1200×630；icon；robots 指向 sitemap；sitemap 單一網址；`/api/*` 的 `Cache-Control: no-store`；`/api/insights` 的 `nosniff`；沒有 `X-Powered-By`；首頁引用的 `/_next/static` 腳本 200 且 `immutable`；安全標頭（HSTS、CSP、X-Frame-Options、Referrer-Policy、Permissions-Policy）只記錄現值、不判定。
- 結束碼：0 全過；1 是 13 項有失敗；2 是 13 項通過但補充有失敗。必須在 repo 根目錄執行（以 `fixtures/` 比對）。
- 代理 C 對 dev（3213）試跑：13/13 通過，CSV SHA-256 與 Python 版逐項相同；補充 9/10（`static-asset` 失敗是 dev 的 `/_next/static` 不帶 `immutable`，預期；production 才算數）。

## 2. 網路紀錄：`tests/e2e/network-log.spec.ts`（desktop、mobile）

流程：首頁 → 載入示範資料 → 開「計算與來源」抽屜 → 經匯入精靈匯入 `fixtures/golden`（三份 CSV＋資料集設定檔）→ 套用 → 匯出分析 CSV、Excel、PPT、PDF（列印版面出現即可，`window.print` 以替身記次）、決策 JSON、備份檔 → 會議紀錄。

斷言：所有 http(s) 請求同源（baseURL）；沒有 POST／PUT／PATCH／DELETE；`/api/insights` 只有 GET 且 available=false；另以 `request.post` 直接打一次：**PUBLIC_DEMO 設定**必須 403＋reason PUBLIC_DEMO，非 PUBLIC_DEMO（例如 `playwright.config.ts` 內建的 LOCAL＋ENABLE_LIVE_AI=false）只要求回 fallback、不到 5xx，並在 JSON 的 `mode` 標明；沒有任何請求本文或網址含 golden CSV 的任何一行或通路名 MARKETPLACE；沒有 4xx／5xx（dev 專用的 `/_next/webpack-hmr`、`/__nextjs_*` 另列為 dev_only，不算）；沒有 console error。紀錄每個請求的 url、method、resourceType、postData 長度與前 80 字元 SHA-256、status、所屬步驟。

## 3. 鍵盤走查：`tests/e2e/keyboard-walk.spec.ts`（desktop 1440、mobile 390）

- A. 七頁各從 `main` 開始一路按 Tab 到焦點離開 main（整頁走完），記錄到「第一個主要結果」的 Tab 數（總覽第一張 KPI、健檢第一列、商品最差卡與商品表第一列、試算的基準數字／範本／「試算」、待辦第一張卡或新增、會議議程 1、資料來源的問題表或範圍列表）與經過的元素。**步數只記錄、不斷言**；總覽另記 PRD §2.3 B「main 內第一個 KPI 之前的可見控制項數」。
- B. 硬規則（不退步）：main 內每個停留點焦點可見（`:focus-visible` 且 outline／box-shadow 不是 none；視覺隱藏的檔案欄位由同組按鈕畫框算「related」；原生日期欄位的月／日／年與日曆按鈕算「native」）；沒有焦點陷阱（不回到停過的元素、焦點不中途掉回 body、最後一定離開 main）；Esc：抽屜關閉後焦點回到開它的 KPI 數字、頂欄「匯出」選單關閉後焦點在 summary、投影模式離開後焦點回到按鈕（≤ 767px 沒有投影按鈕，手機略過）。
- C. PRD §11.1「總覽 → 開抽屜 → 關閉回焦 → 加入待辦 → 改狀態 → 匯出」只用 Tab／Shift+Tab／Enter／Esc 完成（下載決策 CSV）。

## 4. axe 四尺寸：`tests/e2e/axe-sweep.spec.ts`（desktop、laptop、tablet、mobile）

- 狀態：首頁空狀態、匯入精靈步驟 1、示範資料已載入的 7 頁、抽屜開著（總覽）、投影模式（總覽；手機略過）。
- 引擎：專案沒有 `@axe-core/playwright`，本輪也不加依賴；改用 `node_modules` 裡已有的 `axe-core`（`eslint-config-next` → `eslint-plugin-jsx-a11y` 的相依，4.13.0），以 `page.addScriptTag` 注入 `axe.min.js` 後跑 `axe.run`（tags：wcag2a、wcag2aa、wcag21a、wcag21aa、wcag22aa；排除 dev 浮層 `nextjs-portal`）。**斷言 serious 與 critical 為 0。**
- 替代方式：`require.resolve("axe-core/axe.min.js")` 失敗時自動退回純 DOM 檢查並在 JSON 標 `engine: "dom"`：每個 button／a／input／select／textarea／summary 有可及名稱、img 都有 alt、每頁剛好一個看得到的 h1（這三項在退回時斷言）；heading 跳級、重複 id、`:focus-visible` 規則是否存在只記錄。axe 可用時純 DOM 檢查也照記、不斷言。

## 5. 備份 v1–v5 還原矩陣：`tests/backup-restore-matrix.test.ts`

```sh
BACKUP_MATRIX_OUT=verification/revamp-v3/V3-10/backup-matrix.json npx vitest run tests/backup-restore-matrix.test.ts
```

golden 與 demo 各建 v1–v5 五個信封（v5 由目前的 `exportWorkspaceBackup` 寫出；v4 用 `tests/helpers/full-backup.ts` 的 `asV4`；v3 拿掉 v4 側邊資料與 R5 之後的選填欄位再 `resign`；v1／v2 依 `tests/v2-backup.test.ts` 的舊格式手寫），另加 R0 前實際的四個 v3 檔（`verification/review-v2-a-workspace-*.json`）。逐一 `restoreWorkspaceBackup`：成功、classification、`restored_schema_version`、扣廣告後貢獻（golden 255.00／差額 −315.00；demo 1,269,792.73／−598,833.95）、試算方案（golden 284.00）、v4 以下 `ad_decision` 為 undefined、v3 以下 preprocessing／targets／events／meeting_history／ui_prefs 為空、v4／v5 讀回原值；還原後再匯出一定是 v5 且可再還原（round trip，金額與欄位不變）。16 個案例約 11 秒。

## 6. 執行 E2E 的兩種方式

**a. 用專案的 `playwright.config.ts`（會自己 build 並在 3100 起 LOCAL＋ENABLE_LIVE_AI=false 的 production 伺服器；3100 不能被占用）**：

```sh
NETWORK_LOG_OUT=verification/revamp-v3/V3-10/network-log.json KEYBOARD_WALK_OUT=verification/revamp-v3/V3-10/keyboard-walk.json AXE_OUT=verification/revamp-v3/V3-10/axe.json \
  npx playwright test tests/e2e/network-log.spec.ts tests/e2e/keyboard-walk.spec.ts tests/e2e/axe-sweep.spec.ts --reporter=list
```

加 `--reporter=list` 是為了不覆寫 `playwright.config.ts` 的 JSON 報告（`verification/review-v2-a-e2e-results.json`）。網路紀錄與鍵盤走查只在 desktop、mobile 執行（laptop、tablet 會顯示 skipped）。這個模式下 `/api/insights` 的 POST 回 fallback（不是 403），403 由 `scripts/launch-check.mjs` 對 PUBLIC_DEMO 伺服器驗。

**b. 對已經用 §0 啟動的 PUBLIC_DEMO 伺服器**：需要一份 `reuseExistingServer: true` 的設定（仿 `verification/revamp-R7-capture.config.ts`；收尾者自建、不提交），例如：

```ts
import { defineConfig } from "@playwright/test";
import base from "../../../playwright.config";
export default defineConfig({ ...base, testDir: "../../../tests/e2e", reporter: [["list"]], webServer: { command: "NEXT_TELEMETRY_DISABLED=1 npm start -- --port 3100", url: "http://127.0.0.1:3100", reuseExistingServer: true, env: { ENABLE_LIVE_AI: "false", APP_MODE: "PUBLIC_DEMO", PUBLIC_DEMO: "true" }, timeout: 120_000 } });
```

全套 `npm run test:e2e` 也會跑到這三支（每支 4 個專案；網路紀錄與鍵盤走查各有 2 個 skipped）。

## 7. 代理 C 在 dev（`next dev --port 3213`，PUBLIC_DEMO 環境變數）的試跑結果（只證明程式能跑）

- 網路紀錄：desktop、mobile 通過。desktop 12 個請求（首頁 7、載入示範 3、匯出時動態載入 xlsx 與 pptxgenjs 各 1），0 個外部來源、0 個非 GET、0 個探針命中；`/api/insights` 只有 GET（React StrictMode 在 dev 會中止第一個 GET，記為 `net::ERR_ABORTED`，production 不會）；直接 POST 403＋PUBLIC_DEMO。五個下載：分析 CSV 356,738 bytes、Excel 22,913、PPT 85,016、決策 JSON 204,397、備份 266,782。
- 鍵盤走查：desktop、mobile 通過（焦點全部可見、沒有陷阱、Esc 三項回焦、§11.1 流程完成）。到第一個主要結果的 Tab 數（desktop／mobile）：總覽 11／4（內容前可見控制項 10／3，PRD §2.3 B 目標 ≤ 12）；健檢 8／2；商品最差卡 9／3、商品表第一列 57／51；試算基準數字 11／5、範本 16／10、「試算」30／24（從範本到「試算」14 步，含未勾的試算聲明；D-V3-27＝C 的「記住聲明後 ≤ 12 步」待拍板）；待辦 12／6；會議議程 1 26／19（會議日期是原生日期欄位，占 4 步）；資料來源 10／4。整頁停留點（desktop）：總覽 90、健檢 69、商品 378、試算 34、待辦 13、會議 47、資料來源 25。
- axe：mobile 0 serious；desktop、laptop、tablet 各 **2 個 serious（同一個問題）**：`target-size`（WCAG 2.5.8）在總覽 KPI「扣廣告後貢獻率」卡的差額連結「降 14.3 個百分點」（`button.number-link`，97.5×20 px），總覽與投影模式各出現一次。原因：差額（高 20）與下一行「上期 30.4%」（高 16）兩個 number-link 都小於 24 px、中心垂直距離 20 px，而這張卡兩者剛好水平置中重疊，24 px 圓相交；其他 KPI 卡因為兩行左右錯開而通過。這是目前產品版面的問題（代理 C 沒有改 src），spec 會失敗到修正為止；修法例：讓兩個連結的中心距離 ≥ 24 px（例如 `.kpi-prev` 上邊距再加 4 px 以上），或讓兩個 number-link 的點擊區 ≥ 24 px 高（`min-height: 24px`，不改字級）；由收尾者決定（注意 design-lint 棘輪）。
- 備份矩陣：16/16 通過（見 §5）。
- 13 項 HTTP：見 §1。

## 8. production（`next start`，127.0.0.1:3100）的實際結果（代理 E3，2026-10-08，反映 8493723）

**LOCAL 模式；PUBLIC_DEMO 的 403 由收尾者另外跑。** 這一段對的是共用的 production 伺服器（`next build` 後 `next start`，`APP_MODE=LOCAL`、`ENABLE_LIVE_AI=false`），不是正式站設定（PUBLIC_DEMO）。E2E 用 `verification/revamp-R3-shared.config.ts`（沿用 3100、不啟動伺服器、只有 list 報表、`workers: 1`），三支 spec 的最後一次完整執行：

```sh
NETWORK_LOG_OUT=verification/revamp-v3/V3-10/network-log.json KEYBOARD_WALK_OUT=verification/revamp-v3/V3-10/keyboard-walk.json AXE_OUT=verification/revamp-v3/V3-10/axe.json \
  npx playwright test --config verification/revamp-R3-shared.config.ts --project=desktop --project=laptop --project=tablet --project=mobile --output test-results-e3 --timeout 90000 --reporter=list \
  tests/e2e/network-log.spec.ts tests/e2e/keyboard-walk.spec.ts tests/e2e/axe-sweep.spec.ts
# → 12 個測試：8 passed、4 skipped（網路紀錄與鍵盤走查在 laptop、tablet 依設計略過）、0 failed，1.8 分鐘
BACKUP_MATRIX_OUT=verification/revamp-v3/V3-10/backup-matrix.json npx vitest run tests/backup-restore-matrix.test.ts
# → 16 passed、0 failed（28.8 秒）
node scripts/launch-check.mjs --base http://127.0.0.1:3100 --out verification/revamp-v3/V3-10/launch-check-local.json
# → 13 項 11/13、補充 10/10，結束碼 1（第 7、8 項是 PUBLIC_DEMO 專屬，見 8.5）
```

| spec | desktop | laptop | tablet | mobile |
|---|---|---|---|---|
| `network-log.spec.ts` | 通過 | 略過（設計） | 略過（設計） | 通過 |
| `keyboard-walk.spec.ts` | 通過 | 略過（設計） | 略過（設計） | 通過 |
| `axe-sweep.spec.ts` | 通過 | 通過 | 通過 | 通過 |

各 spec 在合併執行之前也各單獨跑過一次四個專案，結果相同（網路紀錄 2 passed／2 skipped；鍵盤走查 2 passed／2 skipped；axe 4 passed）。

### 8.1 網路紀錄（`network-log.json`）

| 項目 | desktop | mobile |
|---|---|---|
| 請求數（全部 http(s)） | 15 | 15 |
| 依類型 | document 1、stylesheet 2、script 10、fetch 2 | 同左 |
| 依步驟 | 首頁 10（含 `/api/insights` GET）、載入示範 1（`/api/datasets/demo`）、匯出分析 CSV 2（SheetJS／xlsx 的動態 chunk 在這一步載入，之後的 Excel 不再請求）、匯出 PPT 2（PptxGenJS 的動態 chunk）；開抽屜、匯入 golden、Excel、PDF、決策 JSON、備份、會議紀錄 0 | 同左 |
| 外部來源數（origin ≠ `http://127.0.0.1:3100`） | 0 | 0 |
| 非 GET 數（POST／PUT／PATCH／DELETE） | 0 | 0 |
| 探針命中數（golden 三份 CSV 任何一行或 `MARKETPLACE` 出現在請求本文或網址） | 0 | 0 |
| 4xx／5xx 或失敗的資源 | 0 | 0 |
| console error／pageerror | 0 | 0 |
| dev 專用請求 | 0 | 0 |
| 瀏覽器內的 `/api/insights` | 只有 GET 200（available=false、reason DISABLED） | 同左 |
| 直接 POST `/api/insights`（空 JSON） | 200、`status: fallback`、reason DISABLED（LOCAL 模式；JSON 的 `mode` 記 `non-public (DISABLED)`） | 同左 |

下載：分析 CSV 356,738 bytes、Excel 22,913、PPT 85,016、決策 JSON 204,397、備份 266,782（大小與 §7 dev 試跑相同）；PDF 以 `window.print` 替身記到 1 次，列印版面（`manager-summary-print`）出現後於 `afterprint` 移除。匯入 golden（三份 CSV＋資料集設定檔）全程 0 個請求：原始 CSV 只在瀏覽器內讀取。紀錄只存網址、方法、資源類型、postData 長度與前 80 字元 SHA-256、狀態與步驟，不含任何請求內容。

### 8.2 鍵盤走查（`keyboard-walk.json`）

到第一個主要結果的 Tab 數（從 `main` 開始；只記錄、不斷言）與 main 內整頁停留點：

| 頁 | 里程碑 | desktop 1440 | mobile 390 | 整頁停留點 desktop／mobile |
|---|---|---|---|---|
| 經營總覽 | 第一張 KPI | 11 | 4 | 90／77 |
| 通路健檢 | 健檢第一列 | 8 | 2 | 69／59 |
| 商品毛利 | 最差商品（第一個結果） | 9 | 3 | 378／372 |
| 商品毛利 | 商品表第一列 | 57 | 51 | （同上） |
| 假設試算 | 第一個結果數字（基準） | 11 | 5 | 34／28 |
| 假設試算 | 範本 | 16 | 10 | （同上） |
| 假設試算 | 「試算」按鈕 | 30 | 24 | （同上） |
| 待辦 | 第一張待辦卡或新增 | 12 | 6 | 13／7 |
| 會議紀錄 | 議程 1 | 26 | 19 | 47／40 |
| 資料來源 | 問題表或範圍列表（越過） | 10 | 4 | 25／19 |

- PRD §2.3 B「main 內第一個 KPI 之前的可見控制項數」：desktop 10、mobile 3（目標 ≤ 12）。
- 試算頁從範本到「試算」desktop 與 mobile 都是 14 步（含未勾的試算聲明 checkbox；D-V3-27＝C「記住聲明後從範本起 ≤ 12 步」仍待拍板，本表只記錄）。會議日期是原生日期欄位，月／日／年／日曆按鈕占 4 步。
- 硬規則（兩個尺寸、七頁全部）：焦點看不到的停留點 0、回到停過的元素（焦點陷阱）0、焦點掉回 body 0；每頁都從 `main` 開始並走到文件結尾離開 main；所有里程碑都到達。
- Esc：計算與來源抽屜（Enter 開、焦點進到「關閉」）→ Esc 關閉後焦點回到 KPI 數字（可及名稱「扣廣告後貢獻 127.0 萬，看明細」）；頂欄「匯出」選單 → Esc 關閉後焦點留在 summary（mobile 先展開「更多」；選單關閉後「更多」仍展開，再按一次 Esc 收起，`aria-expanded` 變 false）；投影模式 → Esc 離開後焦點回到「投影模式」按鈕（desktop；≤ 767px 沒有投影按鈕，mobile 略過）。
- PRD §11.1 只用鍵盤（總覽 → 開抽屜 → 關閉回焦 → 加入待辦 → 改狀態 → 匯出）：desktop Tab 24 到 KPI 數字、12 到「加入待辦」、15 到改狀態、Shift+Tab 10 回到匯出選單、Tab 2 到 CSV；mobile 11／10／9／4／2；兩個尺寸都下載 `profitlens-decision.csv`。page error 0。

### 8.3 axe 四尺寸（`axe.json`，axe-core 4.13.0，wcag2a／2aa／21a／21aa／22aa）

| 尺寸 | 狀態數 | critical | serious | moderate | minor |
|---|---|---|---|---|---|
| desktop 1440×1000 | 11 | 0 | 0 | 0 | 0 |
| laptop 1280×900 | 11 | 0 | 0 | 0 | 0 |
| tablet 768×1024 | 11 | 0 | 0 | 0 | 0 |
| mobile 390×844 | 10（投影模式略過：≤ 767px 沒有投影按鈕） | 0 | 0 | 0 | 0 |

§7 dev 試跑時 desktop／laptop／tablet 各 2 個 serious（總覽 KPI「扣廣告後貢獻率」差額連結的 `target-size`，總覽與投影模式各一次）已由 8493723 的 `.kpi-prev` 上距修正，四尺寸皆 0。純 DOM 參考檢查（不斷言）：每個狀態都剛好一個看得到的 h1，heading 跳級 0、沒有可及名稱的控制 0、重複 id 0、缺 alt 的 img 0，`:focus-visible` 規則存在。

### 8.4 備份 v1–v5 還原矩陣（`backup-matrix.json`）

16 個測試全過（2 個基準檢視＋10 個產生的信封＋4 個 R0 前實際 v3 檔），矩陣 14 列全部還原成功、classification 皆為 valid：

| 資料集 | 版本 | 扣廣告後貢獻（本期／差額） | 試算方案 | `ad_decision` | 側邊資料（targets／events／meeting_history／ui_prefs） | 再匯出 |
|---|---|---|---|---|---|---|
| golden | v1、v2、v3 | 255.00／−315.00 | 284.00 | 無 | 皆空 | v5，金額相同 |
| golden | v4 | 255.00／−315.00 | 284.00 | 無 | 1／1／1／讀回原值 | v5，金額相同 |
| golden | v5 | 255.00／−315.00 | 284.00 | pause | 1／1／1／讀回原值 | v5，金額相同 |
| demo | v1、v2、v3 | 1,269,792.73／−598,833.95 | 1,336,239.46 | 無 | 皆空 | v5，金額相同 |
| demo | v4 | 1,269,792.73／−598,833.95 | 1,336,239.46 | 無 | 1／1／1／讀回原值 | v5，金額相同 |
| demo | v5 | 1,269,792.73／−598,833.95 | 1,336,239.46 | pause | 1／1／1／讀回原值 | v5，金額相同 |
| golden（實際 v3 檔） | desktop、laptop、tablet、mobile | 255.00／−315.00 | （檔內沒有方案） | 無 | 皆空 | v5，金額相同 |

`preprocessing` 在 14 列都是 false（矩陣的信封沒有前處理）。執行時間 28.8 秒（§5 的「約 11 秒」是單獨跑時；這次與其他代理共用機器）。

### 8.5 13 項 HTTP（`launch-check-local.json`）

- 13 項：**11/13 通過**（LOCAL 模式）。第 1–6 項（首頁 200 含 ProfitLens；五個資料集 200、synthetic、manifest 與 `fixtures/` 相等、三份 CSV 位元組全等）與第 9–13 項（五個非公開路徑 404）全部通過。
- 第 7、8 項是 PUBLIC_DEMO 設定專屬的檢查，LOCAL 模式下依設計不通過：第 7 項 GET `/api/insights` 回 200、available=false，但 reason 是 DISABLED（要求 PUBLIC_DEMO）；第 8 項 POST 空 JSON 回 200 fallback（reason DISABLED，要求 403＋PUBLIC_DEMO）。兩項都沒有呼叫 provider。**PUBLIC_DEMO 的 403 與 reason 由收尾者對 §0 的 PUBLIC_DEMO 伺服器另外跑**。
- 補充：**10/10 通過**，含 production 才算數的 `static-asset`（`/_next/static` 腳本 200 且 `immutable`）、所有 `/api/*` 的 `Cache-Control: no-store`、`/api/insights` 的 `nosniff`、沒有 `X-Powered-By`；安全標頭只記錄現值。
