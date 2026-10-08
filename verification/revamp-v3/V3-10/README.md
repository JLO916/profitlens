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
