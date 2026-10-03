# Revamp v2 R7 驗收：README、示範資料、上線整理（2026-10-03）

依 `docs/revamp/06_BATCHES.md` R7-1～R7-6 與 `docs/revamp/08_RELAUNCH.md` §1–§5 執行；決策 D3＝A、D8＝A、D9＝B、D10＝A（`docs/revamp/09_DECISIONS_PENDING.md`、`docs/DECISIONS.md` 2026-10-03 R7）。`src/domain`、`fixtures`、`docs/METRICS.md` 零改動；沒有新增依賴；`.env*`、`vercel.json`、`.vercelignore`、`/api/insights` 封鎖邏輯零改動。

**本輪沒有推送、沒有部署。** 08 §4 的 10 條檢查中，能在本機完成的全部對著「正式站設定」的本機 production 伺服器執行（`npm run build` 後 `APP_MODE=PUBLIC_DEMO PUBLIC_DEMO=true ENABLE_LIVE_AI=false npm start -- --port 3100`，與 `verification/deployment-config.json` 記錄的三個值相同）；必須在 Vercel 上才能做的（環境變數截圖、Preview 部署、社群預覽工具）列為 **not_run**，附使用者推送後要執行的命令與步驟（§5）。

## 1. 完成項目（對照 06 R7）

| 任務 | 狀態 | 說明 |
|---|---|---|
| R7-1 README 依 08 §1 重寫；工程內容移 `docs/ENGINEERING.md`；發布紀錄移 `docs/RELEASES.md` | 完成 | README 93 行：三個問題 → 30 秒試用 → 用自己的資料 → 口徑一頁 → 功能一覽 → 示範資料 → 限制 → 本機啟動 4 行 → 工程／發布連結 → 安全與隱私。首圖 `docs/images/overview-1440.png` 改為本批 1440×1000 示範資料總覽截圖。`START_HERE.md` 加歷史註記。 |
| R7-2 示範資料台灣化（D3） | 完成（A） | 只用顯示別名（R2 已做）；側欄標示改為「注意：示範資料是合成資料，不代表任何真實商家或業績。」；不建 `fixtures/demo_tw`（列上線後待辦）。 |
| R7-3 空狀態與 landing 文案；metadata／OG／favicon／robots／sitemap | 完成 | `labels.emptyState.body` 與 README「30 秒試用」同一句（測試比對）；`src/app/layout.tsx` metadata（title、description、canonical、openGraph、twitter）；`src/app/icon.svg`；`src/app/robots.ts`、`sitemap.ts`（單一 URL）；`public/og.png` 1200×630（`scripts/make-og.mjs` 由本批截圖產生，文字取自 labels）；`src/app/site.ts` 的 `SITE_URL` 單一來源。 |
| R7-4 進階驗證頁隱藏（D10） | 完成 | 側欄不顯示；網址 `#validation` 才顯示（hashchange 監聽；離開清 hash）；15 個 E2E spec 改用 `openValidation()`。 |
| R7-5 上線前檢查（08 §4）逐條執行 | 完成（本機）／部分（Vercel 端 not_run） | 見 §2。Lighthouse 實際分數記錄；a11y 對比不足的 10 個顏色加深後重測。 |
| R7-6 `docs/RELEASES.md` v2.0.0；tag；`docs/STATUS.md` 收尾 | 完成（tag 待使用者打） | `package.json` 版本 0.1.0 → 2.0.0；RELEASES v2.0.0 發布說明；STATUS 收尾；tag 命令見 §5。 |
| D9 使用分析（Vercel Web Analytics） | 完成（不加依賴） | `src/application/analytics.ts`：只在 `VERCEL_ENV=production` 注入 `/_vercel/insights/script.js`，`track()` 只送事件名；頁尾揭露 `labels.relaunch.analyticsNote`；`NEXT_PUBLIC_DISABLE_ANALYTICS=1` 可關；需在 Vercel 儀表板啟用 Web Analytics。 |

## 2. 08 §4 上線前檢查逐條結果

| # | 檢查 | 結果 | 真實數字／證據 |
|---|---|---|---|
| 1 | `npm ci` 乾淨安裝；typecheck／lint／test／build／test:e2e | **pass**（E2E 見下） | `npm ci` 完成（lockfile 只改 version 欄）；`npm run typecheck` pass；`npm run lint` 0 warnings；`npm test -- --run` **73 檔／1,462 測試全過**（10.4 s）；`npm run build` pass 無 warning（webpack、7 條 route）；`npm run test:e2e` 四尺寸全套：****576 項全過（14.9 分，四尺寸 desktop／laptop／tablet／mobile，含本批改用 `openValidation()` 的 15 個 spec；E2E 數量與 R6 相同，新增的 27 項 `tests/relaunch.test.ts` 為單元測試）**** |
| 2 | Vercel 環境變數三個值確認（截圖）；`.vercelignore` 不變 | **部分**：`.vercelignore` 不變 pass；環境變數 **not_run** | `git diff 9ae1cde..HEAD -- .vercelignore vercel.json` 無差異。Vercel MCP（`get_project`／`filter_project_envs`）對 `prj_tbTT4CUd5u51SUpc9mqw7UbQQfnY` 回 404、`vercel env ls` 因本機未 link 無法讀；記錄值（`verification/deployment-config.json`）：`APP_MODE=PUBLIC_DEMO`、`PUBLIC_DEMO=true`、`ENABLE_LIVE_AI=false`、無 OpenAI key。**請使用者在 Vercel → Settings → Environment Variables 截圖確認**（§5 步驟 3）。 |
| 3 | Preview 部署：13 項 HTTP 檢查＋`/api/insights` GET 關閉、POST 403 | **pass（本機 production 設定）**；Preview **not_run** | `python3 verification/revamp-R7-smoke.py verification/revamp-R7/smoke-local.json http://127.0.0.1:3100` → `all_passed: true`、`live_ai_called: false`，13/13：`/` 200；`/api/datasets/{demo,golden,missing-cogs,missing-ad,duplicate}` 200、`no-store`、manifest 與三份 CSV bytes 全等於本機 fixtures；`/api/insights` GET 200 `{"available":false,"reason":"PUBLIC_DEMO"}`、POST 403 `{"status":"fallback","reason":"PUBLIC_DEMO"}`；`/api/datasets/not-allowed`、`/.env`、`/.git/config`、`/verification/app-acceptance.md`、`/fixtures/golden/sales_daily.csv` 皆 404。推送後對 Preview／正式站重跑同一腳本（§5 步驟 4）。 |
| 4 | 四尺寸人工操作：示範 → 三件事 → 看證據 → 加入待辦 → 試算 → 會議紀錄 → 匯出 PDF／Excel／Markdown；每步截圖 | **pass** | `npx playwright test --config verification/revamp-R7-capture.config.ts r7.spec.ts` → 4/4（desktop 1440×1000、laptop 1280×900、tablet 768×1024、mobile 390×844）；每尺寸 9 步（landing、示範＋保存提示、總覽首屏、三件事、看證據抽屜、待辦看板、試算結果、會議紀錄、列印版面）viewport PNG＋全頁 JPG，共 72 張在 `verification/revamp-R7/`；Markdown 與 Excel 實際下載（檔名 `.md`／`.xlsx`），PDF 以替換的 `window.print` 驗證觸發並在 print media 下截圖；全程 0 console／page error。 |
| 5 | Lighthouse desktop／mobile 實際分數；a11y < 90 必須修 | **pass** | Lighthouse 13.5.0、headless Chrome、對本機 production 伺服器首頁（空狀態）。**第一次**：desktop 效能 100／a11y 96／最佳實務 100／SEO 100；mobile 85／96／100／100；a11y 唯一失敗項 `color-contrast`（14 個 12–13 px 次要文字，對比 2.75–4.28）。**修正**：`globals.css` 10 個灰色加深（`--muted` #667978→#586b6a、側欄／頁尾／麵包屑／eyebrow／空狀態等）。**重測**：desktop **100／100／100／100**（LCP 0.6 s、CLS 0.001、TBT 0 ms）；mobile **93／100／100／100**（LCP 2.7 s、CLS 0.092、TBT 130 ms、FCP 0.9 s）；`color-contrast` 0 項。報告：`verification/revamp-R7/lighthouse-{desktop,mobile}.report.html`。 |
| 6 | 鍵盤走查：Tab 順序、Esc 關閉、焦點回原按鈕 | **pass** | `checks.spec.ts` §4-6（`verification/revamp-R7/checks-keyboard.json`）：首頁 Tab 順序 跳至主要內容 → 品牌 → 七個分頁 → 清空…；跳過連結 Enter 後焦點在 `main#main-content`；「看證據」Enter 開抽屜、焦點移到抽屜內「關閉」、Esc 關閉、焦點回「看證據」；「下載 ▾」Enter 開、Esc 關、焦點留在 summary；「結束會議」Enter 出確認區、Esc 取消、焦點回「結束會議」。 |
| 7 | 無主控台錯誤；無 404 資源；OG 卡片用社群預覽工具檢查 | **pass**（本機）；社群預覽工具 **not_run** | 走查 4 尺寸與 checks 全程 console／page error 0；`checks-network.json`：12 個請求全部 200（`/`、`/_next/static/*`、`/api/insights`），無 4xx／5xx。metadata（`checks-meta.json`）：`<html lang="zh-Hant-TW">`、title「ProfitLens｜電商獲利診斷與決策工作台」、description、canonical `https://profitlens-tau.vercel.app`、og:title／og:description／og:url／og:locale zh_TW／og:image `https://profitlens-tau.vercel.app/og.png`（實際 1200×630、140,007 bytes、image/png）、twitter:card summary_large_image、icon `/icon.svg` 200；`/robots.txt` 含 `Sitemap:`；`/sitemap.xml` 單一 `<url>`。社群預覽工具需公開網址：推送後用 opengraph.xyz／Facebook 分享偵錯工具／X Card Validator 檢查（§5 步驟 6）。 |
| 8 | 備份相容：R0 前拍的 v3 備份檔恢復成功 | **pass** | `verification/review-v2-a-workspace-laptop.json`（`profitlens-workspace-v3`，2026-10-02 保存，golden 資料集）在本機 PUBLIC_DEMO 版「儲存 ▾ → 選擇備份檔 → 讀回」成功：狀態「資料就緒」、通知文字＝`restoredNotice`、本期扣廣告後貢獻 **255.00**（＝golden 固定答案）。截圖 `8-v3-restore-preview-desktop-viewport.png`、`8-v3-restored-desktop-viewport.png`；`checks-v3-restore.json`。正式站恢復待推送後由使用者重做（§5 步驟 5）。 |
| 9 | 隱私：Network 面板確認無任何 CSV 內容上傳 | **pass** | `checks.spec.ts` §4-9 以 Playwright 記錄全部請求：匯入 `tests/fixtures/alternative` 三份 CSV（精靈四步）→ 走七個分頁 → 下載目前分析 CSV；共 12 個請求、**0 個非 GET、0 個外部網域、0 個請求本文含任一 CSV 列**（逐列比對三份檔案的每一行）；下載以 blob 在瀏覽器內產生。 |
| 10 | README 連結全部可開；示範站首屏文字與 README 一致 | **pass** | 連結檢查（README、ENGINEERING、RELEASES 共 71 個連結、13 個外部）：全部存在／回 200，例外只有兩個本機網址（`http://127.0.0.1:3000`、`http://127.0.0.1:3200/`，文件說明用，非外部連結）；`checks-links.json`。首屏：`labels.emptyState.body` 與 README「30 秒試用」句子逐字比對相同（去掉「開正式站 →」與括號）。 |

## 3. 其他量測

- **首載 JS**：首頁 7 個 `/_next/static` 腳本合計 **1,636.8 KB**（R6 結束 1,635.3 KB，+1.5 KB：analytics 佇列片段與 hash 監聽）。xlsx／pptxgenjs 仍為按需動態載入。
- **`npm audit`**：8 high。3 個為 R6 已記錄的 `xlsx`×2、`image-size`（只在未使用的讀取／圖片解析路徑，無修正版）；**新增 5 個皆為開發依賴鏈** `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces`（GHSA-vfj7-8cjw-p6xm，braces 深層巢狀樣式的堆疊耗盡），不進 production bundle、不在伺服器執行；修正要 `npm audit fix --force` 升 `eslint-config-next` 主版本，不在 R7 允許依賴清單內，**待使用者決定**。
- **示範／驗證資料**：`/api/datasets/*` 回傳 bytes 與 `fixtures/*` 全等（smoke 第 2–6 項）。
- **a11y 對比修正的影響範圍**：只改 `src/app/globals.css` 的顏色值（16 行），無結構或 testid 變動；四尺寸截圖為修正後重拍。

## 4. 變更檔案

- 新增：`docs/ENGINEERING.md`、`docs/RELEASES.md`、`docs/images/overview-1440.png`、`public/og.png`、`scripts/make-og.mjs`、`src/app/{icon.svg,robots.ts,sitemap.ts,site.ts}`、`src/application/analytics.ts`、`tests/relaunch.test.ts`、`verification/revamp-R7-capture.config.ts`、`verification/revamp-R7-capture/{r7,checks}.spec.ts`、`verification/revamp-R7-smoke.py`、`verification/revamp-R7/*`（72 張走查截圖、v3 恢復 2 張、#validation 1 張、Lighthouse 2 份 HTML、smoke／checks JSON）、本檔。
- 修改：`README.md`（改寫）、`START_HERE.md`、`src/app/{layout.tsx,page.tsx,globals.css}`、`src/components/dashboard.tsx`（#validation、頁尾揭露、事件）、`src/i18n/labels.zh-TW.ts`（`emptyState.body`、`relaunch`、側欄示範標示）、`src/application/source-presets/presets.ts`（檔頭註解改為實況）、`tests/e2e/replacement-helpers.ts`（`openValidation`）與 15 個 E2E spec、`package.json`／`package-lock.json`（version 2.0.0）、`docs/{STATUS,DECISIONS}.md`、`docs/revamp/09_DECISIONS_PENDING.md`。
- 零改動：`src/domain/*`、`fixtures/*`、`docs/METRICS.md`、`.env*`、`vercel.json`、`.vercelignore`、`src/app/api/insights/*`。

## 5. 推送／部署（由使用者執行；Claude Code 不推送、不部署）

1. 推分支並開 PR（或直接合併到 `main`）：
   ```sh
   git push origin revamp/v2
   gh pr create --base main --head revamp/v2 --title "Revamp v2 (v2.0.0)" --body-file docs/RELEASES.md
   ```
   Vercel 會為 PR 建 Preview 部署；或先合併：
   ```sh
   git checkout main && git merge --no-ff revamp/v2 && git push origin main
   ```
2. 打 tag（合併到 `main` 之後）：
   ```sh
   git tag -a v2.0.0 -m "ProfitLens v2.0.0 — Revamp v2 (R0–R7)" && git push origin v2.0.0
   ```
3. Vercel 儀表板 → profitlens → Settings → Environment Variables：確認 Production 的 `APP_MODE=PUBLIC_DEMO`、`PUBLIC_DEMO=true`、`ENABLE_LIVE_AI=false`、沒有 `OPENAI_API_KEY`；截圖存 `verification/revamp-R7/vercel-env.png`。
4. 部署 READY 後對 Preview／正式站重跑 13 項檢查：
   ```sh
   python3 verification/revamp-R7-smoke.py verification/revamp-R7/smoke-production.json https://profitlens-tau.vercel.app
   ```
5. 在正式站用 `verification/review-v2-a-workspace-laptop.json` 做一次「儲存 ▾ → 選擇備份檔 → 讀回」，確認本期扣廣告後貢獻 255.00。
6. 社群預覽：opengraph.xyz、Facebook 分享偵錯工具、X Card Validator 貼 `https://profitlens-tau.vercel.app`，確認標題、描述與 1200×630 圖片。
7. Vercel 儀表板 → Analytics → Enable（D9＝B）；啟用前 `/_vercel/insights/script.js` 會 404（不影響操作）。
8. （選配）升級 `eslint-config-next` 以清掉開發依賴的 audit 項目。

## 6. 未執行與已知限制

- not_run：Vercel 環境變數截圖、Preview／正式站 HTTP 檢查、正式站 v3 恢復、社群預覽工具、Vercel Web Analytics 啟用——都需要推送／部署，列在 §5。
- Lighthouse 是本機 production 伺服器（無 CDN、無 Vercel 邊緣快取）的分數；正式站的 mobile 效能可能不同，推送後可用 PageSpeed Insights 重測。
- 走查為 headless Chromium 腳本（與 R0–R6 同法），非真人操作；Safari／Firefox、實體裝置、真實使用者未驗收。
- 示範資料台灣化（`fixtures/demo_tw`）、自訂網域、`orders_daily.csv` 列為上線後待辦（D3／D8／D6）。
