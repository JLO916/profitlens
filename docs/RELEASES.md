# EC ProfitLens 發布紀錄

> 新的在上。正式站：<https://profitlens-tau.vercel.app>。工程驗收命令與各批驗收紀錄見 [ENGINEERING](ENGINEERING.md)；每批真實執行結果見 [STATUS](STATUS.md)；取捨見 [DECISIONS](DECISIONS.md)。

## v4.1.1（2026-10-15，示範影片與依賴修正）

發布日期：2026-10-15。

**發布方式**：v4.1.0 上線後，使用者 2026-10-15 先同意 `source-map-js` 只動 lockfile 的修正（commit `5072879`），再回覆「製作示範影片含字幕」（D-V41-6 由 B 改為 A，開工 V41-3）；影片做完後回覆「好，影片做完後部署正式上線」，並選定版本號 4.1.1，當次同意正式上線。`main` 從 `9bc2241` fast-forward 到發布 commit `36659ff` 並推送，由 Vercel Git 整合部署到正式站 https://profitlens-tau.vercel.app；annotated tag `v4.1.1` 指向 `36659ff` 並已推送。

**正式站檢查**：deployment `dpl_9Fy3evkGfJUcStEci3YaKnr6Z8X2`（target production，READY，`profitlens-tau.vercel.app` 指向它）。13 項 HTTP 全部通過，補充 14 項也全部通過，`live_ai_called: false`（`verification/revamp-v41/V41-3/launch-check-production.json`）。三支影片、字幕與 poster 都以正確的類型送出（`video/mp4`、`text/vtt`、`image/webp`）。用無頭瀏覽器在 1440 與 390 檢查有影片的 4 頁（`verification/revamp-v41/V41-3/production-video-check.json`）：影片 `preload="none"`、不自動播放、不循環、中文字幕預設顯示、逐字稿 5 段；開頁與捲到底都沒有下載 MP4；沒有橫向捲動、沒有 page error。

**上線時沒有完成的事**：
- H6（v4 可用性複測與外部盲評，含 v4.1 加的 T5、T6）仍待人工；依 D-V41-17 不擋上線。
- 匯出檔的人工開檔檢查（PPT、PDF、Excel）未執行。
- Vercel Skew Protection 沒有開啟，由使用者本人在 Vercel 專案設定決定（D-V41-16）。

上一版正式站是 v4.1.0（發布 commit `5b40d7f`、tag `v4.1.0`，deployment `dpl_8gTMCdU9BKTeCJfhTbCvsuGUgan2`；之後只改文件的上線紀錄 commit `9bc2241` 推到 `main`，重建為 `dpl_12xGwYGK9LHcuiczj517PjoPTWsn`）。每一次部署（含 preview）都要使用者當次同意（D-V41-24）。

v4.1.1（V41-3，基準 v4.1.0＝tag `v4.1.0`）：說明頁加 3 支無聲示範影片，附字幕與逐步文字；另套用 `source-map-js` 的安全修正。財務口徑不變，工作台的版面、功能與文字不變，沒有新增依賴。

### 給使用者

**示範影片**
- 說明頁加了 3 支無聲的示範影片，畫面是 1280×800：
  - 「示範影片：30 秒上手」（25.6 秒）：放在說明首頁「30 秒上手」的 4 步之後，以及「開始使用：看懂畫面與期間」頁。在首頁載入示範資料，讀本期一句話與五個關鍵數字，捲到貢獻變化拆解，點扣廣告後貢獻的金額打開計算與來源，再關閉。
  - 「示範影片：匯入資料」（27.6 秒）：放在「匯入資料」頁。用 repo 內虛構的合成檔（`tests/fixtures/inclusive_tax`）走完匯入精靈：選三份檔案、確認欄位對照、金額基準選含稅並確認期間、看檢核結果、套用後回到經營總覽。
  - 「示範影片：週會流程」（33.7 秒）：放在「會議紀錄與投影」頁。在通路健檢把第一項加入待辦，在假設試算試算後選入會議，在會議紀錄寫決議並結束會議，最後打開匯出選單。
- 功能區頁的影片放在本頁目錄與步驟之間。每支影片都有預設開啟的中文字幕；影片下方先寫一行「影片沒有聲音；下方是影片的逐步文字。」，再用編號清單列出與字幕相同的 5 段文字，不看影片也能照著做。
- 圖說下方和截圖一樣註明資料來源：30 秒上手與週會流程寫「畫面為示範資料（虛構）」，匯入資料寫「畫面為虛構的合成資料」。
- 影片不自動播放、不循環。按下播放之前只顯示一張預覽圖，影片檔要按下播放才下載（`preload="none"`）；三支影片依序是 706,627、549,898、1,133,113 bytes，每支都不超過 2 MB、45 秒。
- 影片、字幕檔（WebVTT）與預覽圖都放在本站的 `public/guide/video/`，不嵌入第三方影音平台。影片由腳本用固定的操作與時鐘錄製，再用本機 `ffmpeg` 轉成 MP4（H.264、沒有音軌），不手工剪輯。

### 不變的事
- 財務口徑 `contribution-v1`、其他常用指標 `assist-kpi-v1`、損益兩平 `breakeven-mer-v1` 不變；`src/domain`、`fixtures/`、`docs/METRICS.md` 與兩個指標的程式檔、測試檔對 `625bfa5` 的 diff 為空。固定答案不變：Golden 本期扣廣告後貢獻 255.00、兩期差額 −315.00；假設試算 DTC 284.00／264.00、MARKETPLACE 19.70。影片只錄示範資料與合成資料的畫面，不產生任何新數字。
- 工作台七頁的版面、功能與文字不變：這一版沒有改工作台的元件與 `src/i18n/labels.zh-TW.ts`。影片的標題與字幕放在說明頁的 `src/i18n/guide.zh-TW.ts`，不進工作台的首載；說明頁既有的文字一字不改。
- 說明頁原有的 44 張截圖沒有重拍，WebP 與基準 PNG 逐位元組相同。
- 沒有新增依賴：`package.json` 只改版本號；`package-lock.json` 除了版本號，只有 `source-map-js` 一個項目改版（見下方「依賴修正」）。`ffmpeg` 是重錄影片時才用的本機工具，不進 `package.json`（D-V41-7）。
- 資料不上傳：原始 CSV 只在瀏覽器處理；沒有登入、資料庫或伺服器端保存；本機保存要先同意。分析事件沒有新增（D-V41-23）。
- AI 解釋在公開版仍未啟用：`APP_MODE=PUBLIC_DEMO`、`ENABLE_LIVE_AI=false`，`/api/insights` 的封鎖邏輯不變；`src/app/api`、`vercel.json`、`src/application/analytics.ts` 對 `872662d` 的 diff 為空。
- 匯出與備份不變：CSV、JSON、PDF、PPT、Excel、Markdown 的格式與內容不變；備份格式仍是 `profitlens-workspace-v5`，v1–v5 的備份都能還原。

### 依賴修正
- `source-map-js` 由 1.2.1 升到 1.2.2（commit `5072879`，使用者 2026-10-15 同意）。它是 `postcss` 與 `@tailwindcss/node` 的傳遞依賴，只在 build 時處理本專案自己的 CSS；1.2.2 修正 GHSA-68fv-2mgg-jv7q（high，indexed source map 的 section offset 造成事件迴圈 DoS）。`package-lock.json` 的 diff 只有這一個項目的版本、下載網址與 integrity，沒有順帶移除或更新其他套件。
- `npm audit` 的 high 由 9 筆降為 8 筆，low、moderate、critical 都是 0（`verification/revamp-v41/V41-3/npm-audit-after-source-map-js.json`）。剩下的 8 筆沿用 [V41-0 基準評估](../verification/revamp-v41/V41-0-baseline.md) 第 2 節的判斷，不處理：`xlsx`（npm 上沒有修正版；只在匯出時用寫出 API，不解析使用者上傳的試算表）；`pptxgenjs` 與它的傳遞依賴 `image-size`（修正要降主版號；PPT 不用任何圖片 API）；`eslint-config-next` 與它的傳遞依賴 `@next/eslint-plugin-next`、`fast-glob`、`micromatch`、`braces`（修正要降主版號；只在開發時跑 eslint，不進 production bundle）。

### 已知限制
- **H6 未執行**：v4 的可用性複測與外部盲評，以及 v4.1 加的 T5、T6，都待人工，依 D-V41-17 不擋上線；題目與答案鍵在 [usability-test](revamp-v4/usability-test.md)。
- **匯出檔的人工開檔檢查未執行**：沿用 v4.0.0 與 v4.1.0，PPT、PDF、Excel 都還沒用軟體開檔檢查。
- **Skew Protection 沒有開啟**（D-V41-16）：部署新版後還開著的舊分頁，切到沒載入過的頁面時可能拿不到舊程式，會顯示錯誤說明與「再試一次」，重新整理頁面就好；重新整理會丟掉還沒保存的試算、待辦與會議稿。要開請使用者在 Vercel 專案設定操作。
- **重錄影片需要本機 `ffmpeg`**：每次發版跑的 `GUIDE_MEDIA=check` 只比對影片每一段的畫面，不錄影，也不需要 `ffmpeg`；介面改變讓影片畫面有差異時，要在裝有 `ffmpeg` 的電腦跑 `GUIDE_MEDIA=write` 重錄並轉檔（D-V41-7，`ffmpeg` 不進 `package.json`）。
- **影片裡沒有滑鼠游標**：錄影用無頭瀏覽器，畫面不會出現游標；每次點按之前，會在要按的位置先顯示約 0.8 秒的強調框，代替游標指出位置。
- 其他沿用 v4.1.0 的限制（動機段是產品口吻、手機上的寬截圖、截圖裡的英文等），見下方 v4.1.0 段落的「已知限制」；其中「`source-map-js` 的修正待同意」與「示範影片還沒做」兩項已在本版處理。

### 驗收
- V41-3（示範影片與 v4.1.1 發布）：[verification/revamp-v41-V41-3-acceptance.md](../verification/revamp-v41-V41-3-acceptance.md)。
- 依賴修正：[V41-0 基準評估](../verification/revamp-v41/V41-0-baseline.md)（修正前的逐項評估）、`verification/revamp-v41/V41-3/npm-audit-after-source-map-js.json`（修正後）。
- 規格與拍板：[批次](revamp-v4.1/06_BATCHES.md)（V41-3）、[說明頁內容](revamp-v4.1/GUIDE_CONTENT.md)（§3 示範影片）、[PRD](revamp-v4.1/01_PRD.md)（§3.5、§3.6）、[拍板表](revamp-v4.1/09_DECISIONS_PENDING.md)（D-V41-6、D-V41-7）。

## v4.1.0（2026-10-15，服務介紹與使用說明）

發布日期：2026-10-15。

**發布方式**：使用者 2026-10-15 回覆「H7 通過、V41-5 收尾、正式上線」，當次同意正式上線。`main` 從 `59e6f41` fast-forward 到發布 commit `5b40d7f` 並推送，由 Vercel Git 整合部署到正式站 https://profitlens-tau.vercel.app；annotated tag `v4.1.0` 指向 `5b40d7f` 並已推送。

**正式站檢查**：deployment `dpl_8gTMCdU9BKTeCJfhTbCvsuGUgan2`（target production，READY，`profitlens-tau.vercel.app` 指向它）。13 項 HTTP 全部通過，補充 14 項也全部通過，`live_ai_called: false`（`verification/revamp-v41/V41-5/launch-check-production.json`）；sitemap 13 個網址；正式站的 `og.png` 與 repo 的新分享圖相同。用無頭瀏覽器在 1440 與 390 檢查：說明首頁 11 張卡、會議紀錄與投影頁 5 張圖都載入、沒有橫向捲動；工作台載入示範資料後，側欄與頁尾的「使用說明」另開 `/guide`，原分頁的資料仍在。

**發布前**：2026-10-15 只推送分支 `revamp/v4.1`，部署 preview（`dpl_D6NNP4Lo9pRAAXMYz5tjUWfW4S7V`），13 項 HTTP 與補充 14 項全部通過。使用者用這個 preview 做 H7（介紹文案確認），2026-10-15 回覆通過，介紹三段與動機段都沒有改字。

**上線時沒有完成的事**：
- H6（v4 可用性複測與外部盲評，v4.1 加了 T5、T6 兩題）仍待人工；依 D-V41-17 不擋 v4.1.0。
- 匯出檔的人工開檔檢查（PPT、PDF、Excel）未執行。
- Vercel Skew Protection 沒有開啟，由使用者本人在 Vercel 專案設定決定（D-V41-16）。

上一版正式站是 v4.0.0（`872662d`）。每一次部署（含 preview）都要使用者當次同意（D-V41-24）。

v4.1（`docs/revamp-v4.1/`，基準 v4.0.0＝`872662d`）：在工作台旁邊加一個公開的「服務介紹與使用說明」功能區，並修三項有證據的小問題（分享圖與 README 首圖、4 個切頁的版面跳動、Next.js 修正版）。財務口徑不變，沒有刪掉任何功能，沒有新增依賴；工作台七頁的版面、功能與文字不變，只多了「使用說明」入口。

### 給使用者

**服務介紹與使用說明**
- 新的公開頁 https://profitlens-tau.vercel.app/guide ：為什麼做這套服務、這套服務幫哪些人解決哪些問題（老闆、主管、執行者各一塊，另寫適合誰、還沒涵蓋什麼）、獨特性與這些做法的代價、30 秒上手，以及 11 個功能區的目錄；頁首與開頭都有「開啟工作台」。
- 11 個功能區頁（`/guide/{功能區}`）：「開始使用：看懂畫面與期間」「匯入資料」「經營總覽」「通路健檢」「商品毛利」「假設試算」「待辦」「會議紀錄與投影」「資料來源」「計算與來源、指標定義」「匯出、儲存與備份」。每頁先寫這頁回答什麼、開始前要做什麼，再逐步說明，最後是要注意的事與下一步。
- 每一步一張截圖，共 44 張，點圖可以開原尺寸。截圖由腳本用虛構的示範資料與 repo 內的合成資料擷取，不手工修圖，有資料的截圖都在圖說後註明是虛構資料；步驟裡的按鈕、頁名與區塊名直接引用畫面上的字，與介面一字不差。
- 說明頁是靜態頁：沒有輸入、上傳或表單，不讀寫瀏覽器儲存，也不呼叫任何 API。sitemap 由 1 個網址增為 13 個（工作台、說明首頁與 11 個功能區頁），每一頁有自己的標題、摘要與 canonical，分享時用同一張分享圖。

**工作台的入口**
- 側欄導覽下方、手機「更多」的最後一列、首頁空狀態的按鈕列下方、頁尾「指標定義」旁，都有「使用說明」。點了會另開分頁，工作台裡還沒保存的資料不受影響。

**其他改善**
- 分享圖（`public/og.png`）與 README 首圖換成目前的經營總覽畫面；舊分享圖上「口徑說明」「輔助指標」等 v3 已改名的舊名不再出現。
- 切頁時的版面跳動：390 寬切到商品毛利、資料來源、待辦，以及 1440 寬切到待辦，Lighthouse 量到的 CLS 由 0.053–0.054（v4.0.0）降到 0。做法是切頁時內容區與頁尾換成新的節點；穩定後的畫面不變。
- Next.js 由 16.3.7 升到 16.3.8（`eslint-config-next` 同步），解決 6 筆安全公告，其中 1 筆 high 是 Image Optimization 的 SSRF；本站沒有用 `next/image`，實際影響低。

### 不變的事
- 財務口徑 `contribution-v1`、其他常用指標 `assist-kpi-v1`、損益兩平 `breakeven-mer-v1` 不變；`src/domain`、`fixtures/`、`docs/METRICS.md` 與兩個指標的程式檔、測試檔對 `625bfa5` 的 diff 為空。固定答案不變：Golden 本期扣廣告後貢獻 255.00、兩期差額 −315.00；假設試算 DTC 284.00／264.00、MARKETPLACE 19.70。說明頁只放畫面截圖，不產生任何新數字。
- 工作台七頁的版面、功能與文字不變，只多了「使用說明」入口（側欄多一列；頁尾多一個連結，390 寬時頁尾多折一行）。
- 工作台首頁要下載的程式量與 v4.0.0 相當（gzip 519,702 bytes，v4.0.0 為 519,322）；說明頁的文字放在獨立的檔案，不進工作台的首載。說明頁的首載是 gzip 131,465 bytes，與框架本身相同，不載入圖表與匯出的程式。
- 資料不上傳：原始 CSV 只在瀏覽器處理；沒有登入、資料庫或伺服器端保存；本機保存要先同意。分析事件沒有新增（D-V41-23）。
- AI 解釋在公開版仍未啟用：`APP_MODE=PUBLIC_DEMO`、`ENABLE_LIVE_AI=false`，`/api/insights` 的封鎖邏輯不變；`src/app/api`、`vercel.json`、`src/application/analytics.ts` 對 `872662d` 的 diff 為空。
- 既有的畫面文字一字不改（v3.0.0 的 2,581 個與 v4.0.0 的 2,839 個字串逐字相同）；既有的 `data-testid` 都還在。
- 沒有新增依賴；只把既有的 `next`、`eslint-config-next` 升到 16.3.8。
- 匯出與備份不變：CSV、JSON、PDF、PPT、Excel、Markdown 的格式與內容不變，下載的檔案種類仍是 5 種；備份格式仍是 `profitlens-workspace-v5`，v1–v5 的備份都能還原。

### 已知限制
- **H6 未執行**：v4 的可用性複測與外部盲評，以及 v4.1 加的 T5（從首頁找到使用說明並說出給誰用）、T6（只看 `/guide/import` 完成含稅匯入），都待人工，依 D-V41-17 不擋上線；[PRD §2.2](revamp-v4.1/01_PRD.md) 的 A1、A2 是「未量測」。題目與答案鍵在 [usability-test](revamp-v4/usability-test.md)。
- **動機段是產品口吻的文字**：「為什麼做這套服務」依 D-V41-9 用產品口吻寫成，不是使用者本人的第一人稱敘述；使用者在 H7 確認後沿用，沒有改字。示範資料是虛構的合成資料，說明頁不寫成效。
- **手機上的寬截圖**：390 寬時，44 張中有 21 張的顯示比例低於 0.45，字比較小，每張都能點開原尺寸；桌機截圖有 18 張寬度超過 800 CSS px（規格是盡量不超過），逐張理由在 V41-2a、V41-2b 的驗收文件。
- **截圖裡的英文**：截圖用無頭 Chromium 擷取，瀏覽器的原生控制項顯示英文：「匯出、儲存與備份」頁有兩張的檔案選擇欄寫「Choose File」，「待辦」頁編輯截圖的日期欄是 mm/dd/yyyy。截圖不修圖。
- **匯出檔的人工開檔檢查未執行**：沿用 v4.0.0，PPT、PDF、Excel 都還沒用軟體開檔檢查。
- **Skew Protection 沒有開啟**（D-V41-16）：部署新版後還開著的舊分頁，切到沒載入過的頁面時可能拿不到舊程式，會顯示錯誤說明與「再試一次」，重新整理頁面就好；重新整理會丟掉還沒保存的試算、待辦與會議稿。要開請使用者在 Vercel 專案設定操作。
- **`source-map-js` 1.2.2 的修正待同意**：`npm audit` 列為 high；它只在 build 時處理本專案自己的 CSS，實際風險低。修正要動 lockfile，依規則等使用者同意。
- **示範影片還沒做**：3 支無聲短片（30 秒上手、匯入資料、週會流程）依 D-V41-6，使用者明確要影片時才做（V41-3）。
- 其他沿用 v4.0.0 的限制，見下方 v4.0.0 段落的「已知限制」；其中「版面跳動」一項已在本版修正。

### 驗收
- 收尾：[verification/revamp-v41-V41-5-acceptance.md](../verification/revamp-v41-V41-5-acceptance.md)。
- 各批驗收：[V41-0](../verification/revamp-v41-V41-0-acceptance.md)、[V41-1](../verification/revamp-v41-V41-1-acceptance.md)、[V41-2a](../verification/revamp-v41-V41-2a-acceptance.md)、[V41-2b](../verification/revamp-v41-V41-2b-acceptance.md)、[V41-4](../verification/revamp-v41-V41-4-acceptance.md)。
- 成功指標的實測值：[PRD §2.2](revamp-v4.1/01_PRD.md)。
- 規格與拍板：[套件說明](revamp-v4.1/00_README.md)、[PRD](revamp-v4.1/01_PRD.md)、[說明頁內容](revamp-v4.1/GUIDE_CONTENT.md)、[批次](revamp-v4.1/06_BATCHES.md)、[拍板表](revamp-v4.1/09_DECISIONS_PENDING.md)。

## v4.0.0（2026-10-14，Revamp v4）

發布日期：2026-10-14。

**發布方式**：使用者當次同意「正式上線」。`main` 從 `21d621c` fast-forward 到 `872662d` 並推送，由 Vercel Git 整合部署到正式站 https://profitlens-tau.vercel.app（deployment `dpl_8b48r3atVjzRA49DFHKZyQhao4BC`）；annotated tag `v4.0.0` 指向 `872662d` 並已推送。

**正式站檢查**：13 項 HTTP 全部通過，補充項目也全部通過，`live_ai_called: false`（`verification/revamp-v4/V4-11/launch-check-production.json`）；用無頭瀏覽器在 1440 與 390 載入示範資料，總覽正確，沒有橫向捲動。

**發布前**：2026-10-14 先部署 preview（`dpl_Cr8gE1EfaMmNwHQQMr8k2B7yXfPt`），13 項也全部通過。

**上線時沒有完成的事**：
- H6（v4 可用性複測與外部盲評，PRD §2.2 A1–A4）。原本擋 v4.0.0 正式上線，使用者決定先上線，H6 上線後補。
- 匯出檔的人工開檔檢查（PPT、PDF、Excel）未執行。
- Vercel Skew Protection（D-V4-44 的 C）沒有開啟：開啟的指令被本機的自動權限檢查擋下，帳號是 Hobby 方案、能不能開也待確認。要開請在 Vercel 專案設定由使用者操作。

上一版正式站是 v3.0.0（`625bfa5`）。每一次部署都要使用者當次同意（D-V4-28）。

2026-10-13 V4-11 收尾時記錄的「未執行：使用者 2026-10-13 指示不部署」，指的是當時沒有打 tag、沒有推 `main`、沒有部署；2026-10-14 上線後，tag 與正式站已如上完成。

Revamp v4（`docs/revamp-v4/`，基準 v3.0.0＝`625bfa5`）：把每一頁的主要問題先用一張專業圖表回答，表格留作核對與替代。財務口徑不變，沒有刪掉任何功能（只搬移、合併、收合、改名），沒有新增依賴。新圖只重新呈現既有數字；需要加總、佔比、累計、計數或分段時，各用一個帶版本的整理函式（例如 `channel-structure-v1`）。名詞以 [v4 名詞表增補](revamp-v4/GLOSSARY.md) 與 [v3 名詞表](revamp-v3/GLOSSARY.md) 為準。

### 給使用者

**每一頁先看一張圖**
- 每張圖的標題就是結論句，圖下方有可以展開的資料表；圖上的柱、點、段、格都能點開「計算與來源」，和表格裡的數字用同一份明細。
- 經營總覽：貢獻變化拆解與本期利潤結構兩張瀑布圖放進同一種圖框，並共用尺度；手機（≤ 767px）的橋接表每列加差額條；趨勢圖的刻度改成整數萬；各通路表加差額條；其他常用指標每列加「近 6 週」小走勢；損益兩平 MER 加上比較刻度；「進階」裡多一張兩期每日累計。
- 通路健檢：健檢清單的差額類規則加影響金額條；新增每 100 元淨營收去向；通路寬表加「近 6 週」；新增日 × 通路的月曆熱表（整張只佔一個 Tab 停留點，按 Enter 開當天的明細）；五項比率每週走勢收在可展開的區塊。
- 商品毛利：新增商品毛利兩期差額圖（減少最多與增加最多）；有商品毛利為負的商品時，另有一張累計圖；「進階」裡多一張折扣率與商品毛利率的散佈圖。
- 假設試算：新增方案差額圖；每個方案的「要賣到多少才划算」加一張只畫點的圖，橫軸固定在 −90% 到 +100%，不外推、不代填。
- 待辦：頁首加到期分布的計數條。
- 會議紀錄：新增會議歷史走勢（淨營收、扣廣告後貢獻兩張小圖）；議程 5 的選入方案也有方案差額圖。
- 資料來源與匯入精靈：新增涵蓋時間軸，看得出哪天哪個通路缺列；有資料問題時新增問題分布表，點格子就篩選問題表並捲到那一列；前處理表與精靈第 4 步的對帳表加內嵌條。
- 計算與來源：階梯表加佔比條；從圖下鑽時，原始明細可以再依日期與商品（SKU）篩選。

**投影、隨頁載入與手機**
- 投影（V4-8a）：總覽的貢獻變化拆解只留瀑布圖，字放大到 14px；投影中可以在總覽與會議紀錄之間直接切換；期間列「去年同期」不可用的原因，改成按下那顆停用的按鈕才顯示。
- 隨頁載入（V4-3c、V4-8b）：通路健檢、商品毛利、會議紀錄、資料來源、待辦與 AI 解釋改成切到該頁時才載入程式，Excel、PPT 與決策匯出的程式按下時才載入；資料就緒後會在背景預先載入。還沒載好時，按下就切頁並顯示載入骨架；載入失敗時顯示錯誤說明與「再試一次」；AI 解釋載入失敗不影響健檢頁。首頁要下載的程式量與 v3.0.0 相當（gzip 519,322 bytes，v3.0.0 為 519,426）。
- 手機 390 寬（V4-8b）：修正 8 項，包括會議頁展開寬表時整頁不再橫向捲動、「匯出本頁」選單不再開到畫面外、焦點不再被底部分頁列遮住、兩處點擊範圍補足 24px。

**匯出與備份**
- PDF：三個版本的一頁摘要都印出貢獻變化拆解瀑布圖（灰階也分得出起訖、有利與不利）；標準版與客戶報告版多一頁圖表附錄。
- PPT：多一張投影片，用簡報軟體的原生圖表畫貢獻變化拆解瀑布圖（可以在簡報軟體裡編輯資料，不是圖片）。
- Excel：標準版與客戶報告版多一張「圖表資料」工作表，每張圖一段。
- Markdown：一頁摘要的「貢獻變化拆解」下方加九項差額表。
- 備份：格式仍是 v5；從匯入精靈套用資料後，備份多記一個選填的匯入時間（`payload.active.imported_at`，只記到分），還原後資料來源頁照樣顯示匯入時間（V4-7c，D-V3-30＝A）。

### 不變的事
- 財務口徑 `contribution-v1`、其他常用指標 `assist-kpi-v1`、損益兩平 `breakeven-mer-v1` 不變；`src/domain`、`fixtures/`、`docs/METRICS.md` 與兩個指標的程式檔、測試檔對 `625bfa5` 的 diff 為空。固定答案不變：Golden 本期扣廣告後貢獻 255.00、兩期差額 −315.00；假設試算 DTC 284.00／264.00、MARKETPLACE 19.70。
- 每個金額（含新圖的柱、點、段、格）都能開「計算與來源」，標題下一行是到分的精確值。
- 資料不上傳：原始 CSV 只在瀏覽器處理；沒有登入、資料庫或伺服器端保存；本機保存要先同意。分析事件只記事件名（新增 `chart_clicked`、`chart_table_opened`）。沒有圖片下載入口，下載的檔案種類不變。
- AI 解釋在公開版仍未啟用：`APP_MODE=PUBLIC_DEMO`、`ENABLE_LIVE_AI=false`，`/api/insights` 的封鎖邏輯不變。
- 既有的畫面文字、按鈕名稱與名詞一字不改（v3.0.0 的 2,581 個字串逐字相同）；既有的 `data-testid` 都還在。
- CSV 與 JSON 匯出的欄、列與內容不變（D-V4-13；網路紀錄中分析 CSV 與決策 JSON 的大小與 v3.0.0 相同）；沒有新增依賴。

### 匯出格式的變更

以下會影響依位置讀取匯出檔的程式、跨表公式，或固定頁數的列印流程。

| 匯出 | v3.0.0 | v4.0.0 |
|---|---|---|
| PDF 一頁摘要的頁數 | 老闆一頁版 1、標準版 2、客戶報告版 2 | 老闆一頁版 1、標準版 3、客戶報告版 3 |
| PPT 一頁摘要的張數 | 三個版本各 1 張 | 三個版本各 2 張：第一張不變，第二張是原生瀑布圖 |
| Excel 工作表數 | 老闆一頁版 2、標準版 7、客戶報告版 7 | 老闆一頁版 2、標準版 8、客戶報告版 8 |
| Markdown 一頁摘要 | 沒有九項差額表 | 「## 貢獻變化拆解」下方多九項差額表 |

- **Excel「圖表資料」**：放在「管理損益表」之前，所以「管理損益表」從第 7 張變成第 8 張；依工作表位置讀檔的程式要改。每張圖一段，依序是總覽、健檢、商品頁的圖（貢獻變化拆解、本期利潤結構、各通路、其他常用指標每週、各通路每週、兩期每日累計、每 100 元淨營收去向、日 × 通路、五項比率走勢、商品毛利兩期差額，有商品毛利為負的商品時再加累計）；每段第一列是圖的結論句，欄序與畫面上的資料表相同，數字取自畫面用的同一組函式。標準版每段最後一列是「版本與算法」，「指標定義」工作表最後也多幾列圖表資料的版本；客戶報告版兩者都沒有。通路超過 8 個時不放逐通路的兩段；試算的圖不放，因為 Excel 匯出沒有試算資料。其他工作表的名稱與欄位不變，既有的列也不變（「指標定義」只在最後加列）。
- **PDF**：瀑布圖放在關鍵數字與決議行之後、本期三件事之前；標準版與客戶報告版的附錄頁另有本期利潤結構圖與兩張圖的資料表。
- **PPT**：第二張投影片的圖用 PowerPoint 原生圖表（堆疊長條，透明底段做出瀑布），標值是文字方塊；檔案裡沒有任何圖片。
- **Markdown**：九項差額表有「項目」「差額（元）」兩欄，負號是「−」（U+2212）；三種版本選擇輸出的檔案相同。

### 相容性
- **備份**：格式字串仍是 `profitlens-workspace-v5`。v4.0.0 能還原 v1–v5 的備份；v1–v4 的檔案如果帶匯入時間欄位，一律拒絕（同 V3-9a 的 `ad_decision`）。
- **用 v3.0.0 讀 v4.0.0 的備份**：從匯入精靈套用資料後存的備份帶有匯入時間，v3.0.0 的程式會拒絕（INVALID_WORKSPACE_FORMAT），畫面顯示「無法讀入」，目前的資料不會被取代；示範資料、golden，以及沒經過匯入精靈的備份沒有這個欄位，v3.0.0 照常還原。
- **CSV、JSON**：英文欄名、欄序與內容都不變（D-V4-13）。
- **Excel、PPT、PDF、Markdown**：見上方「匯出格式的變更」。

### 已知限制
- **尚未部署**：見本段開頭。沒有開 Skew Protection 之前，部署新版後還開著的舊分頁，切到沒載入過的頁面時可能拿不到舊程式，會顯示錯誤說明與「再試一次」（D-V4-44 的 B），重新整理頁面就好；重新整理會丟掉還沒保存的試算、待辦與會議稿。
- **H6 未執行**：5 人可用性複測與 3 位外部盲評（PRD §2.2 A1–A4）待人工；v3 的 H4 也還沒做，H6 會同場補量 v3 正式站。
- **匯出檔的人工開檔檢查未執行**：PPT 的標值與柱子是否對齊、「編輯資料」裡的輔助系列名稱，PDF 列印截圖，Excel「圖表資料」用 Excel 開檔檢查，都還沒做。
- **版面跳動**：390 寬切到商品毛利、資料來源、待辦，以及 1440 寬切到待辦時，CLS 是 0.053–0.054，超過 PRD 的 0.05；這是 v3.0.0 就有的行為，v4 沒有改善。
- **示範資料看不到的圖**：示範資料沒有商品毛利為負的商品、沒有缺列與資料問題，所以商品毛利為負的累計圖、涵蓋時間軸的缺列段與問題分布表都不會出現；試算圖要按「試算」後才有點，待辦的到期分布要先有待辦。
- **390 寬的對帳表**：匯入精靈對帳表的差額欄要在表格內橫向捲動才看得到（D-V4-61＝B）；問題表「欄位」欄顯示 `$row` 維持原樣（D-V4-62＝A）。
- **v3.1 的項目不併入 v4**：D-V3-36 的 C 案（決策匯出改成行號區間）與 D-V3-37 的 B 案（既有 12 筆同義詞改字）照各自的拍板延後。
- 沿用 v3.0.0 的限制：F15、F16 延後；示範資料看不到去年同期線；示範資料的決策匯出很大；平台訂單明細要先用 `scripts/aggregate_orders.py` 整理；`npm audit` 對 `xlsx@0.18.5` 與 `pptxgenjs@4.0.1` 的回報仍在；Live AI 未實測；Safari、Firefox 與實體裝置未驗收。

### 驗收
- 收尾：[verification/revamp-v4-V4-11-acceptance.md](../verification/revamp-v4-V4-11-acceptance.md)。
- 各批驗收：[V4-0a](../verification/revamp-v4-V4-0a-acceptance.md)、[V4-0b](../verification/revamp-v4-V4-0b-acceptance.md)、[V4-1](../verification/revamp-v4-V4-1-acceptance.md)、[V4-2](../verification/revamp-v4-V4-2-acceptance.md)、[V4-3a](../verification/revamp-v4-V4-3a-acceptance.md)、[V4-3b](../verification/revamp-v4-V4-3b-acceptance.md)、[V4-3c](../verification/revamp-v4-V4-3c-acceptance.md)、[V4-4](../verification/revamp-v4-V4-4-acceptance.md)、[V4-5](../verification/revamp-v4-V4-5-acceptance.md)、[V4-6](../verification/revamp-v4-V4-6-acceptance.md)、[V4-7a](../verification/revamp-v4-V4-7a-acceptance.md)、[V4-7b](../verification/revamp-v4-V4-7b-acceptance.md)、[V4-7c](../verification/revamp-v4-V4-7c-acceptance.md)、[V4-8a](../verification/revamp-v4-V4-8a-acceptance.md)、[V4-8b](../verification/revamp-v4-V4-8b-acceptance.md)、[V4-9a](../verification/revamp-v4-V4-9a-acceptance.md)、[V4-9b](../verification/revamp-v4-V4-9b-acceptance.md)、[V4-10](../verification/revamp-v4-V4-10-acceptance.md)。
- 成功指標的實測值：[PRD §2.2](revamp-v4/01_PRD.md)。
- 規格與拍板：[PRD](revamp-v4/01_PRD.md)、[圖表目錄](revamp-v4/CHART_CATALOG.md)、[批次](revamp-v4/06_BATCHES.md)、[拍板表](revamp-v4/09_DECISIONS_PENDING.md)、[名詞表增補](revamp-v4/GLOSSARY.md)。

## v3.0.0（2026-10-08，Revamp v3）

發布日期：2026-10-08（使用者當次同意後以 `vercel deploy --prod` 部署到正式站 https://profitlens-tau.vercel.app，deployment `dpl_GP2qy7fpFdWdkhQQE7uyYpEuXdAa`，正式站 13 項 HTTP 與 Lighthouse 檢查通過）。H4（5 人複測與外部盲評）尚未執行。同日使用者拍板把 `revamp/v2` fast-forward 合併進 `main` 並推送（Git 整合自動重建正式站，deployment `dpl_DuA7X3dfyvCU7bddKm3caZKjarwz`，13 項 HTTP 複檢通過），git tag `v3.0.0` 指向 `625bfa5`。

Revamp v3（`docs/revamp-v3/`，批次 V3-0–V3-10，分支 `revamp/v2`，基準 v2.0.0＝`82b70df`）：把「功能齊全但難讀」的 v2 改成老闆 10 秒看懂、主管 3 分鐘找到原因、執行者 10 分鐘完成匯入與核對的財務工具。財務口徑不變，也沒有刪掉任何功能（只搬移、合併、收合、改名）；P1 新功能各用獨立版本。產品名稱改為 EC ProfitLens（D-V3-25；package 名 `profitlens`、下載檔名前綴 `profitlens-`、備份格式字串與網址不變）。名詞以 [名詞表](revamp-v3/GLOSSARY.md) 為準。

### 給使用者

**老闆：打開 10 秒就看到結論**
- 經營總覽首屏（V3-4a）：最上面是本期一句話（例如「淨營收多 170.9 萬，扣廣告後貢獻卻少賺 59.9 萬；最大一項是折扣多花 118.8 萬。」），旁邊是「複製週會摘要」與會議入口；下面是 KPI 帶五格（淨營收、商品毛利、扣廣告前貢獻、扣廣告後貢獻、扣廣告後貢獻率），扣廣告後貢獻放大並加強調線，差額寫成「比上期少賺 59.9 萬（−32.0%）」。
- 本期三件事改成警示列（V3-4a）：每列是狀態標籤、一句話標題與影響金額，原因與下一步常駐；限制與相關範圍收在列內；不足 3 件、0 件各有固定句子，底部連到全部健檢結果。
- 圖表（V3-4b）：貢獻變化拆解改成瀑布圖，旁邊是到分的橋接表與平衡檢核；新增本期利潤結構四層瀑布；趨勢與各通路圖有結論標題、圖例與資料表。
- 數字分三層（V3-2b）：摘要與 KPI 用萬／億到一位小數，表格用整數元、單位只寫在表頭，「計算與來源」抽屜與匯出到分；全部從精確值四捨五入；負號一律是「−」；只有不利的差額上色，而且一定搭配正負號或方向詞（多賺／少賺、多花／少花）。
- 殼層與導覽（V3-3）：頂欄一列（資料狀態「示範資料 · 資料到 8/24」、AI 狀態、指標定義、儲存、匯出）；側欄分成看結果、找原因、做決定、管資料四組，並有計數徽章；期間列一列，快捷按一下就套用；手機有底部分頁列（總覽、健檢、待辦、會議、更多）。
- 投影模式（V3-9b，F22）：總覽與會議紀錄頁可以切到投影，字放大、只留結論，按 Esc 離開。

**主管：3 分鐘找到原因、排好決定**
- 通路健檢（V3-5）改成清單：健檢結果在最前面，計數徽章分資料待補、不利、有利；每列一句標題與金額，前三列展開；通路寬表依台灣報表欄序、兩層表頭、可排序，手機改成清單。
- 商品毛利（V3-5）：前 10 名表、合併的排序與欄位設定、完整表固定表頭、手機清單；頁首「匯出本頁」。
- 「計算與來源」抽屜（V3-5）重排：標題下一行是到分的精確值，接著是組成表、指標定義與算法、原始明細（檔名與行號）。
- 假設試算（V3-6）：方案並排成欄；表單精簡（「增減／改成」切換、單位後綴）；「我了解這是試算」勾一次就記住；每個方案都有「選入會議」。
- 待辦（V3-6）：看板四欄附計數，卡片只留到期、逾期、引用數與「移到：」；編輯改用側邊抽屜（Esc 回到原按鈕）；清單檢視保留。
- 會議紀錄（V3-7）改成文件式：左側議程目錄；頁首是名稱、日期、決議、結束會議、複製週會摘要與「匯出會議」；議程 1–6 依序是關鍵數字與本期一句話、本期重點、各通路表現、上次決議追蹤、選入方案、置頂待辦。v2 結束的紀錄數字、決議與備註不動，頂部加註「本紀錄建立於 v2，部分名稱已更新。」（D-V3-22）。
- 匯出（V3-7）：PDF、Excel、PPT 與 Markdown 開頭都有四行版頭（資料集名稱、報表名、兩期期間與單位、指標版本與產出時間）；頂欄「匯出」選單分成目前檢視、一頁摘要（目前檢視）、決策工作稿、會議、匯入範本五組，每項附一行說明。
- 匯出範本變體（V3-9b，F14）：「一頁摘要（目前檢視）」分組可以切換標準版、老闆一頁版、客戶報告版，只改版面、數字相同（細節見下方「匯出格式的變更」）。

**執行者：10 分鐘完成匯入與核對**
- 匯入精靈全版模式（V3-8）：四步「選檔、對照欄位、金額基準與期間、檢核與套用」，步驟列標出第幾步，「取消匯入」在版頭，動作列固定在底部；已對照的欄位收合；含稅換算的說明在第 3 步。
- 錯誤訊息統一句型（V3-2a）：「檔名 第 n 行：問題。修法。」，欄名與指標名一致，空值只寫「資料待補」或「不適用」。
- 資料來源頁重排（V3-8）：資料狀態一行、資料問題表（可下載問題清單 CSV）、範圍與金額基準、前處理表、來源預覽、版本與來源資訊、範本 3×3。
- 空狀態（V3-8）：第一次進入只有「載入示範資料」「匯入資料」兩顆按鈕與「需要的檔案」表；載入中、錯誤與各區段的空狀態都有固定句型與下一步。
- 名詞小辭典（V3-2a）：「指標定義」對話框可以搜尋，輸入 v2 舊名也找得到；有 v2 資料的使用者第一次開啟 v3 時，頁首下方會出現一行「這版改了什麼」提示。

**P1 新功能（V3-9a、V3-9b）**
- 損益兩平 MER（F12，版本 `breakeven-mer-v1`，D-V3-17＝C）：總覽「其他常用指標」之後一段，算出扣廣告後貢獻等於 0 時的最低 MER（淨營收 ÷ 扣廣告前貢獻），附結論句與「計算與來源」；扣廣告前貢獻 ≤ 0 時不顯示數字並寫原因。既有 7 個其他常用指標維持 `assist-kpi-v1`。
- 廣告決策標籤（F13）：待辦可以標「暫停／調整／加碼」，由使用者自選、系統不判斷；看板與清單有徽章，寫進決策匯出、Excel 與備份。
- 每日／每週管理損益表（F9，D-V3-19＝A）：總覽「進階」裡的報表型表格，日／週切換、可顯示零值列，每格都能開「計算與來源」；Excel 多一張工作表，列印附錄的負數用括號（D-V3-8）。
- 去年同期線（F8）：趨勢圖的第三條虛線；去年同期不可用時保留位置並寫原因，缺資料不畫成 0。
- 圖表下鑽（F10）：點趨勢圖的週或各通路的長條，抽屜只列該週或該通路的原始明細，可清除篩選。
- 匯出範本變體（F14）與投影模式（F22）：見上方。

### 不變的事
- 財務口徑 `contribution-v1` 不變：淨營收、商品毛利、扣廣告前貢獻、扣廣告後貢獻的公式（`docs/METRICS.md`）與 golden／demo／errors／refund_only／zero_ad fixtures 零改動；`src/domain` 對 `82b70df` 的 diff 為空。固定答案不變：Golden 本期扣廣告後貢獻 255.00、兩期差額 −315.00；假設試算 DTC 284.00／264.00、MARKETPLACE 19.70。
- 每個金額（含新的瀑布柱、管理損益表格與圖表點）都能開「計算與來源」，看到公式、CSV 檔名、原始行號，以及含稅原值與換算值。
- 資料不上傳：原始 CSV 只在瀏覽器處理；沒有登入、資料庫或伺服器端保存；本機保存要先同意。分析事件只記事件名（D9、D-V3-15）。
- AI 解釋在公開版仍未啟用：`APP_MODE=PUBLIC_DEMO`、`ENABLE_LIVE_AI=false`，`/api/insights` 的封鎖邏輯不變。
- v1、v2、v3、v4、v5 的備份檔都能還原；本機 IndexedDB 的舊資料直接讀得到，不需要操作。
- CSV 與 JSON 的英文欄名（`english_key`）與欄序不變（D11），只新增欄或列。

### 破壞性變更

以下會影響已經寫好的 Excel 公式、讀取匯出檔的程式，或還在用舊版程式的人。

**Excel 工作表改名**（PRD §8.9；D-V3-2、D-V3-4，記在 [DECISIONS](DECISIONS.md)）：在 Excel 寫了跨表公式的人，要把公式裡的工作表名改成新名。

| 舊名（v2.0.0） | 新名（v3.0.0） | 依據 |
|---|---|---|
| 行動 | 待辦 | D-V3-4＝A：「行動」全面改「待辦」 |
| 口徑 | 指標定義 | D-V3-2＝A：「口徑」拆成指標定義、金額基準、解讀限制 |

「摘要」「通路」「貢獻變化拆解」「商品比較」四張工作表名稱不變；標準版與客戶報告版的最後多一張「管理損益表」（老闆一頁版只有「摘要」與「管理損益表」）。

**Excel 的欄名與列位置**
- 「摘要」工作表最前面多了版頭四列（客戶報告版五列），原本的列整段往下移；「關鍵數字」之後多一列損益兩平 MER。依列號引用的公式要重新對位。
- 欄名改名：「摘要」與「貢獻變化拆解」的「對貢獻影響」改為「影響金額」；「待辦」的「注意」改為「限制」；「摘要」的區塊「兩個關鍵差額」改為「關鍵數字」；「指標定義」工作表的段落「口徑說明」改為「指標定義」、「輔助指標版本」改為「其他常用指標版本」。
- 「待辦」工作表最後多一欄「廣告決策」（沒標的列是空格）。

**CSV、JSON 與 Markdown**
- 分析 CSV 每期多一列 `breakeven_mer`（12 位小數比率、`breakeven-mer-v1`）。
- 決策 CSV 最後多一欄「廣告決策 (ad_decision)」；決策 JSON 的待辦多一個選填欄位 `ad_decision`（`pause`／`adjust`／`increase`）。
- CSV 標題列「中文 (english_key)」的中文依名詞表改名，英文 key 與欄序不變：例如「口徑限制」改為「解讀限制」、「金額口徑」改為「金額基準」、「數據代號」改為「引用數字代號」、「原有效平台費率」改為「原有效平台抽成率」、「原有效金流費率」改為「原有效金流手續費率」、「只看負毛利」改為「只看商品毛利為負」；指標名稱欄的「通路貢獻」改為「扣廣告前貢獻」、「廣告投報（MER）」改為「廣告效率（MER）」、「退款比」改為「退款金額比」。
- Markdown（一頁摘要、會議紀錄、決策工作稿）的標題之後多了版頭四行；畫面與 Markdown 的負號改為「−」（U+2212）。CSV 與 JSON 的數值仍是 ASCII 負號與到分的精確字串。

**備份格式升到 v5**：v3.0.0 寫出 `profitlens-workspace-v5`（v4 加上待辦的選填欄位 `ad_decision`）。v2.0.0 以前的程式讀不了 v5 檔；v1–v4 的舊檔在 v3.0.0 都能還原，缺的欄位以「不標」補上。欄位清單見 `verification/revamp-v3/backup-schema-v5.json`。

**名詞改名**（[名詞表](revamp-v3/GLOSSARY.md)；舊名在名詞小辭典搜得到）

| v2 用詞 | v3 用詞 | 依據 |
|---|---|---|
| 通路貢獻、行銷前貢獻 | 扣廣告前貢獻 | D-V3-1＝A |
| 口徑說明 | 指標定義 | D-V3-2＝A |
| 金額口徑 | 金額基準 | D-V3-2＝A |
| 口徑限制（CSV、Excel 欄） | 解讀限制 | D-V3-2＝A |
| 看證據、怎麼算的、公式與來源 | 看明細（按鈕）、計算與來源（抽屜） | D-V3-3＝A |
| 行動、置頂行動、待辦與決議 | 待辦、置頂待辦 | D-V3-4＝A |
| 廣告投報（MER） | 廣告效率（MER） | D-V3-5＝A |
| 新臺幣、臺北時間 | 新台幣、台北時間 | D-V3-6＝A |
| 對貢獻影響 | 影響金額 | 名詞表 #11 |
| 輔助指標 | 其他常用指標 | 名詞表 #24 |
| 退款比 | 退款金額比 | 名詞表 #10 |
| 貢獻率 | 扣廣告後貢獻率（短名仍是貢獻率） | 名詞表 #5 |

### 匯出格式的變更（V3-9b 細節）
- **Excel 新增工作表「管理損益表」**（F9／F14，D-V3-8）：放在最後一張。列是 13 列（四層與費用項，費用列加「減：」），欄是本期每週＋合計＋佔淨營收 %；金額數字格式 `#,##0.00;(#,##0.00)`（負數用括號），比率 `0.00%`；數值與總覽「進階」裡的每週管理損益表同一份（`buildPnlTable`），表頭樣式與凍結列同其他工作表。
- **Excel「待辦」工作表新增最後一欄「廣告決策」**（F13）：值是使用者自選的暫停／調整／加碼，沒標是空格；列數與既有欄位不變。
- **匯出範本變體**（F14）：頂欄「匯出」選單的「一頁摘要（目前檢視）」分組多一列版本切換，只影響同一分組的 PDF、Excel、PPT（會議紀錄 Markdown 與會議頁的「匯出會議」維持標準版）。三個版本用同一份數字，只改版面：
  - 標準版：列印／PDF 的附錄多「每週管理損益表」（只有這張表的負數用括號，其他仍是「−」）；會議範圍的列印不加這個附錄。
  - 老闆一頁版：版頭四行、本期一句話、四個關鍵數字（淨營收、商品毛利、扣廣告前貢獻、扣廣告後貢獻的上期／本期／差額）、本期三件事的標題與影響金額、決議一行（有會議時）；PDF 一頁、PPT 一張、Excel 只有「摘要」與「管理損益表」。
  - 客戶報告版：標準版的內容，版頭第 1 行之後加「客戶：{資料集名稱} · 製表：EC ProfitLens」；不放決策備註、待辦的進度紀錄與「引用較早資料」、技術細節（Excel 待辦工作表少「狀態更新日」「引用較早資料」兩欄、指標定義不含技術列；PPT 頁尾不放資料版本）；PDF 附上每週管理損益表。

### 已知限制
- **H4 未執行**：5 人可用性複測與外部盲評（PRD §2.3 A）待人工；H1（v2 基準）也未執行，所以沒有前後對照。H2 設計稿審查與 H3 文案審稿由使用者指示略過（2026-10-07），新文案以 `copy-rewrite.csv` 現稿為準。
- **正式站未部署**：正式站部署、正式站的 Lighthouse 與 13 項 HTTP 檢查需要使用者當次同意（D-V3-24）；本機 production build 的檢查結果見 V3-10 驗收。
- **F15、F16 延後**：台灣化示範資料（`fixtures/demo_tw`，官網／蝦皮／momo、商品名稱、檔期）需要使用者提供商品與檔期設定；來源預設的實檔驗證需要去識別化的平台匯出檔。九個來源預設中仍只有 `shopee_orders` 以真實匯出檔驗證。
- **示範資料看不到去年同期線**：示範與 golden 資料都沒有去年同期的期間，去年同期一律不可用（畫面會寫原因）；要看到第三條線，資料要涵蓋去年同一段期間。
- **示範資料的決策匯出很大**：載入示範資料並加一個待辦後，決策 CSV 約 84 MB、JSON 約 33 MB、Markdown 約 18 MB（每個引用數字都帶完整來源清單；備份只有約 267 KB）。
- **待拍板**（`docs/revamp-v3/09_DECISIONS_PENDING.md`，拍板前維持現況）：D-V3-26 看板卡兩行標題高度、D-V3-27 試算頁鍵盤步數、D-V3-29 手機匯入中的頁首、D-V3-30 匯入時間是否寫進備份、D-V3-31 管理損益表佔淨營收 % 能否開抽屜、D-V3-32 廣告決策徽章色調與匯出範圍、D-V3-33 投影按鈕的 aria-pressed 與字樣、D-V3-34 投影中的總覽與會議頁互切、D-V3-35 去年同期不可用原因只顯示一處。
- 沿用 v2.0.0 的限制：平台訂單明細要先用 `scripts/aggregate_orders.py` 整理；`npm audit` 對 `xlsx@0.18.5` 與 `pptxgenjs@4.0.1` 的 `image-size` 回報仍在（EC ProfitLens 沒有用到的讀取路徑）；Live AI 未實測；Safari、Firefox 與實體裝置未驗收。

### 驗收
- 上線檢查：[verification/revamp-v3-V3-10-acceptance.md](../verification/revamp-v3-V3-10-acceptance.md)（13 項 HTTP、網路紀錄、v1–v5 備份還原、四尺寸與鍵盤走查、Lighthouse）。
- 各批驗收：[V3-0](../verification/revamp-v3-V3-0-acceptance.md)、[V3-1](../verification/revamp-v3-V3-1-acceptance.md)、[V3-2a](../verification/revamp-v3-V3-2a-acceptance.md)、[V3-2b](../verification/revamp-v3-V3-2b-acceptance.md)、[V3-2c](../verification/revamp-v3-V3-2c-acceptance.md)、[V3-3](../verification/revamp-v3-V3-3-acceptance.md)、[V3-4a](../verification/revamp-v3-V3-4a-acceptance.md)、[V3-4b](../verification/revamp-v3-V3-4b-acceptance.md)、[V3-5](../verification/revamp-v3-V3-5-acceptance.md)、[V3-6](../verification/revamp-v3-V3-6-acceptance.md)、[V3-7](../verification/revamp-v3-V3-7-acceptance.md)、[V3-8](../verification/revamp-v3-V3-8-acceptance.md)、[V3-9a](../verification/revamp-v3-V3-9a-acceptance.md)、[V3-9b](../verification/revamp-v3-V3-9b-acceptance.md)（V3-9b 結束時：單元／整合 121 檔 2,388 項、E2E 四尺寸 783 項通過、5 項以理由略過）。
- 規格與拍板：[PRD](revamp-v3/01_PRD.md)、[批次](revamp-v3/06_BATCHES.md)、[拍板表](revamp-v3/09_DECISIONS_PENDING.md)、[名詞表](revamp-v3/GLOSSARY.md)。

## v2.0.0（2026-10-03）

Revamp v2：把產品從「稽核員工具」改成台灣電商經理人每週會用的工具（`docs/revamp/`，批次 R0–R7，分支 `revamp/v2`）。財務口徑不變。

### 給使用者
- **首屏直接看關鍵數字與本期三件事**（R1）：總覽順序改為本期關鍵數字 → 本期三件事 → 每週趨勢 → 貢獻變化拆解＋通路比較；期間列固定在頁面上方，新增「近 7 天／近 4 週／近 12 週／本月 vs 上月」快捷（只填日期，按「套用」才生效）；AI 狀態縮成頂欄小標籤，「儲存 ▾」「下載 ▾」集中到頂欄；切頁自動回到頁首。三件事與健檢顯示「對貢獻影響」：負＝不利（紅）、正＝有利（綠）。
- **名詞改為電商常用說法**（R2）：扣廣告後貢獻、通路貢獻、平台抽成、金流手續費、物流與包材費、廣告投放費、退款比；頂欄「口徑說明」九條；「怎麼算的」抽屜用中文階梯公式，來源依檔案分頁、可搜尋；示範資料通路顯示「官網 · DTC／平台 · MARKETPLACE」；CSV 標題列改為「中文 (english_key)」。
- **匯入精靈**（R3）：四步「選檔 → 對照欄位 → 口徑與期間 → 檢核與套用」；拖放三份報表、依檔名自動歸位；欄位依「標準欄名 → 上次的對照 → 來源預設 → 中文欄名字典」自動預選；含稅報表選「含稅」即逐列 ÷ (1＋稅率) 換算成未稅（預設 5%，可改），原值與換算值在「怎麼算的」、資料來源頁與匯出都看得到；記住上次對照（需同意本機保存）；九個來源預設（蝦皮訂單與進帳報表、momo 店+、91APP、Shopline、Cyberbiz、PChome、Meta Ads、Google Ads）；錯誤訊息白話化；範本另附三列示範的範例檔；平台訂單明細用 `scripts/aggregate_orders.py` 先彙總。
- **輔助指標、去年同期、目標、檔期**（R4）：總覽新增七格輔助指標（售出件數、件均淨營收、廣告佔比、廣告投報 MER、商品毛利率、退款比、物流費佔比；`assist-kpi-v1`，不混入財務核心）；「去年同期」快捷；匯入 `targets.csv` 後 KPI 卡顯示目標達成率；匯入 `events.csv` 後促銷檔期標在趨勢圖與三件事；完整備份升為 v4（含含稅換算原值、目標、檔期），舊 v1–v3 備份仍可讀入。
- **通路健檢改為清單、假設試算更快**（R5）：同一問題的合計與各通路合併成一列、資料缺漏排最前、依對貢獻影響排序，標題一句話寫出問題與金額，前三列預設展開；假設試算進頁就是表單，六個範本、可直接輸入絕對值（目標件數、新折扣率、新廣告預算），「要賣到多少才划算」三組敏感度隨方案保存；待辦改為看板（未開始／進行中／受阻／已完成，按鈕改狀態、負責人選單、證據勾選含搜尋）；商品毛利頁新增「毛利最差／最好的商品」各 10 名。
- **會議紀錄與匯出**（R6）：新分頁「會議紀錄」——議程自動組成、記錄決議、「結束會議」後凍結成紀錄、自動與上次會議比較；匯出 PDF（A4 列印一頁摘要＋附錄）、Excel（六個工作表）、PowerPoint 一頁式、Markdown 與 CSV，全部集中在「下載 ▾」。
- **工作區可自動保存在你的電腦**（R6，需同意）：第一次載入資料時詢問一次，同意後每次修改 2 秒內自動保存，頂欄顯示「已保存 hh:mm」；可在「儲存 ▾」關閉自動保存或「刪除本機資料」。
- **上線整理**（R7）：README 改寫給營運主管（工程內容移到 [ENGINEERING](ENGINEERING.md)）；示範資料只用顯示別名（官網 · DTC／平台 · MARKETPLACE；品類 居家／保養／配件／3C），側欄標示「示範資料是合成資料，不代表任何真實商家或業績」、匯出檔資料集識別碼以 `synthetic-demo` 開頭（決策 D3＝A）；「開發者驗證」頁不在側欄顯示，改由網址 `#validation` 開啟（D10＝A）；網站標題、描述與分享卡片更新；網址維持 profitlens-tau.vercel.app（D8＝A）；接上 Vercel Web Analytics（不加依賴，只在 Vercel production 載入；需在 Vercel 儀表板啟用後才開始記錄），只記頁面瀏覽與互動事件名、不含任何資料內容，並在頁尾揭露（D9＝B）；側欄次要文字加深以通過 Lighthouse 對比檢查。

### 不變的事
- 財務口徑 `contribution-v1` 不變：淨營收 → 商品毛利 → 通路貢獻 → 扣廣告後貢獻的公式（`docs/METRICS.md`）與 golden／demo／errors／refund_only／zero_ad fixtures 零改動；R4 對 `src/domain` 只做加法（售出件數），既有指標的輸入輸出不變。
- 所有既有 golden 測試通過，固定答案不變：Golden 本期扣廣告後貢獻 255.00、兩期差額 −315.00；假設試算 DTC 284.00／264.00、MARKETPLACE 19.70。
- 每個金額仍可開「怎麼算的」看到公式、CSV 檔名與原始行號；含稅換算同時顯示原值與換算值。
- 資料不上傳：原始 CSV 只在瀏覽器處理；沒有登入、資料庫或伺服器端保存；本機保存須先同意。
- AI 解釋在公開版未啟用：`APP_MODE=PUBLIC_DEMO`、`PUBLIC_DEMO=true`、`ENABLE_LIVE_AI=false`，伺服器沒有 OpenAI key，`/api/insights` 的封鎖邏輯不變（POST 回 403）。

### 已知限制
- 平台訂單明細需先用 `scripts/aggregate_orders.py` 整理成日粒度（見 [ORDER_AGGREGATION](ORDER_AGGREGATION.md)）；精靈只偵測並引導，不在畫面內彙總（D5＝A）。
- 來源預設只有 `shopee_orders`（蝦皮訂單匯出）以真實匯出檔的標題列驗證；其餘八個尚未以真實匯出檔驗證：`shopee_income`、`momo_settlement`、`91app_orders`（以公開文件或 API 文件重建樣本）、`shopline_orders`、`cyberbiz_orders`、`pchome_settlement`、`meta_ads`、`google_ads`（見 [R3 來源預設查證](../verification/revamp-R3-preset-verification.md)）。
- `npm audit` 對 `xlsx@0.18.5` 與 `pptxgenjs@4.0.1` 依賴的 `image-size` 回報 3 個 high：都在 EC ProfitLens 未使用的讀取／圖片解析路徑，沒有可升級的修正版；已記錄於 [DECISIONS](DECISIONS.md)（2026-10-03 R6）。
- 示範資料台灣化（新 fixture `fixtures/demo_tw`：官網／蝦皮／momo 三通路、商品名稱、檔期，並獨立手算 expected）列為上線後待辦；本版只做顯示別名（D3＝A）。
- Live AI 未實測；真實營運資料、真實使用者試用、Safari／Firefox 與實體裝置未驗收。
- 訂單數、客單價、轉換率（選配 `orders_daily.csv`）延後到 Phase 2（D6＝B）。
- 其他：本機保存的同意只在本次載入有效（重新整理後再問一次）；目標達成率只在目標期間與本期完全相同時顯示；待辦看板以按鈕改狀態、不支援拖曳。

### 驗收
- 上線檢查：[verification/revamp-R7-acceptance.md](../verification/revamp-R7-acceptance.md)
- 各批驗收：[R0](../verification/revamp-R0-acceptance.md)、[R1](../verification/revamp-R1-acceptance.md)、[R2](../verification/revamp-R2-acceptance.md)、[R3](../verification/revamp-R3-acceptance.md)、[R4](../verification/revamp-R4-acceptance.md)、[R5](../verification/revamp-R5-acceptance.md)、[R6](../verification/revamp-R6-acceptance.md)（R7 結束時：單元／整合 73 檔 1,462 項、E2E 四尺寸 576 項全過；R6 結束時 72 檔 1,435 項、576 項）

## 2026-10-02 Review v2 A 批

R7 搬移註記：以下為原 README 開頭的發布說明原文，連結改為從 `docs/` 出發。「最新發布」是撰寫當時的說法，現行版本見上方 v2.0.0。

> 最新發布（2026-10-02）：Review v2 A 批「營運與會議狀態分離」已推送私人 GitHub 並部署至 [正式站](https://profitlens-tau.vercel.app)。產品提交 `6c11a42`、Vercel production READY，正式網址反查同版本；13 項 HTTP 與四尺寸人工瀏覽器 smoke 通過。公開 Live AI 後端維持關閉，Live AI 未實測。819 項單元／整合、400＋4 項 E2E、typecheck／lint／本機 build 為本批原驗收結果；本次核對 139 件受測來源無差異後沿用，雲端另實際重新 `npm ci`／build。詳見 [發布紀錄](../verification/release-v2-a-20261002-acceptance.md)。

已發布功能另包含 A 批的行動執行管理、多通路方案、固定範圍會議、v3 備份及替換保存保護；原有每頁規則診斷及即時 AI 可用狀態、獨立「進階驗證」、主管摘要、商品比較、方案、行動與會議輸出。開發時的失敗修復與未執行項目保留於 [第三批](../verification/manager-batch3-acceptance.md)、[第二批](../verification/manager-batch2-acceptance.md)、[第一批](../verification/manager-batch1-acceptance.md) 和 [M6](../verification/app-acceptance.md) 歷史報告；不將歷史通過數當成本次重新執行結果。原有 [本機預覽 3200](http://127.0.0.1:3200/) 的程序未更動；A 批需以本輪建置啟動，不能以舊分頁判斷新功能。

## 2026-10-01 管理者改善三批

R7 搬移註記：以下為原 README 開頭的歷史發布說明原文，連結改為從 `docs/` 出發。三批各自的改善內容見 [ENGINEERING](ENGINEERING.md) 的「管理者改善第一／二／三批」。

歷史發布（2026-10-01；最新版本以上方 A 批發布為準）：**三批管理者改善已發布至 [EC ProfitLens 正式站](https://profitlens-tau.vercel.app)**，程式版本 `2f8e539` 已推送至既有私人 GitHub，Vercel production READY。依最新指示先發布，公開版維持 `PUBLIC_DEMO`，Live AI 後端關閉；**Live AI 未實測**，20案僅完成離線準備。發布前重新通過766項unit/integration、282項三尺寸E2E、typecheck、lint及production build；正式站13項HTTP檢查與1440／768／390px人工操作通過。完整命令、證據及未驗收範圍見 [本次發布紀錄](../verification/release-20261001-acceptance.md) 與 [STATUS](STATUS.md)。
