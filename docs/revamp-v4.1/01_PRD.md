# EC ProfitLens v4.1 PRD：服務介紹與使用說明，加上小幅優化補充（不新增口徑、不刪功能、不加依賴）

- **一句話目標**：使用者 2026-10-14 的指示是「下一階段優化與強化，優化補充目前版本，新增『服務介紹與使用說明』功能區，內含：我為什麼要開發這套服務？這套服務幫哪些人解決哪些問題？這套服務有什麼獨特性？各功能區段的詳細操作說明與截圖或示範影片」。v4.1 在工作台旁邊加一個公開、靜態的「服務介紹與使用說明」功能區（建議網址 `/guide`），並順手修掉三項已有證據的小問題（§4）。**不新增財務口徑、不刪任何功能、不加任何 npm 依賴；工作台 `/` 的首載不變（說明文字放獨立的 `src/i18n/guide.zh-TW.ts`，只給伺服器模組使用，§3.10）。**
- **說明是工具的附件，不是行銷頁**：`AGENTS.md:4` 寫「建立真正可操作的電商獲利診斷工具，不是履歷頁、行銷落地頁或靜態報告……不包含個人經歷或前雇主資訊」。所以介紹三段只寫「看到的問題、做法、適合誰、代價」，第一個動作永遠是「開啟工作台」；不放價格、推薦語、成效數字、競品名稱與作者經歷（D-V41-9、10、11）。
- **操作說明跟著介面走**：步驟裡提到的按鈕、頁名、區塊名不重打一遍，而是引用 `src/i18n/labels.zh-TW.ts` 的原字串（`{ui:路徑}`），測試會擋重打的介面字串；截圖由 Playwright 腳本用示範資料自動產生，來源 PNG 當基準提交，每次發版用同一支腳本比對，畫面改了才重拍（§3.5）。
- **上線前 6 批、一次一批**：V41-0 基準與護欄（不改畫面）、V41-1 說明路由與介紹三段、V41-2a／2b 各功能區操作說明與截圖、V41-4 優化補充、V41-5 收尾與上線；V41-3 示範影片排在上線後，你明確要影片時才做（D-V41-6；`06_BATCHES.md`）。
- **需要你拍板 19 件事，另有 5 件預設沿用、不需回覆**（`09_DECISIONS_PENDING.md`）；另需要你提供「我為什麼要開發」的自己的話（D-V41-9）。

| 項目 | 內容 |
|---|---|
| 文件 | v4.1 PRD（草案；拍板前不視為核准） |
| 日期 | 2026-10-14 |
| 基準版本 | v4.0.0（tag `v4.0.0`＝`872662d`；`main`＝`59e6f41`（`872662d` 之後只加上線紀錄文件）；正式站 https://profitlens-tau.vercel.app 是 v4.0.0，deployment `dpl_8b48r3atVjzRA49DFHKZyQhao4BC`） |
| 目標版本 | 建議 v4.1.0（D-V41-1） |
| 工作分支 | `revamp/v4.1`（已自 `main` 開出；D-V41-2 預設沿用；push 任何分支都會建 preview，視同部署） |
| 依據 | repo 內的紀錄：`AGENTS.md`、`README.md`、`docs/PRD.md`、`docs/PILOT_PLAN.md`、`docs/market-comparison-2026-10-05.md`、`docs/RELEASES.md`、`docs/DECISIONS.md`、`docs/revamp-v4/*`、`verification/revamp-v4-V4-11-acceptance.md`；起草時的實驗（Playwright 截圖與錄影的檔案大小、Chromium canvas 轉 WebP、`<video>` 的鍵盤與 axe `video-caption`）；審查時的實測（labels 打包進 `/` 首載、說明字串的大小）；2026-10-14 的 `npm audit` |
| 硬前提 | `AGENTS.md` 與 v4 的 `CLAUDE.md` 規則沿用；財務核心禁區不動；既有 `data-testid` 刪除數 0；使用者看得到的中文只放 labels 檔（工作台與入口在 `labels.zh-TW.ts`，說明頁在 `guide.zh-TW.ts`）；design-lint、copy-style、chart-lint 棘輪只降不升；不加 npm 依賴；不加登入、資料庫、伺服器端保存；任何部署（含 preview、含 push 分支）都要使用者當次明確同意 |

---

## 0 決策摘要（給拍板者）

**為什麼要做**：v4.0.0 的工作台本身沒有使用說明。現在能找到的說明只有 README 的「30 秒試用」與「用自己的資料」（給會看 GitHub 的人）、首頁空狀態的「需要的檔案」表、頂欄「指標定義」九條與名詞小辭典，以及每頁頁首一句這頁回答什麼。第一次打開正式站的人，不知道有哪七頁、每頁怎麼操作、匯入要準備什麼、週會怎麼用；也沒有一頁能說清楚「這是什麼、給誰用、跟自己拼 Excel 差在哪」。對外分享時，分享卡片（`public/og.png`）還是 v2 的畫面，上面寫著 v3 已改名的「口徑說明」「通路貢獻」「輔助指標」。

**v4.1 會帶來的改變**

| # | 誰 | 會看到什麼 | 哪一批 |
|---|---|---|---|
| 1 | 第一次來的人 | `/guide`：服務介紹三段（為什麼做、幫誰解決什麼、獨特在哪）＋30 秒上手＋功能區目錄；側欄、手機「更多」、首頁、頁尾都有「使用說明」入口（另開分頁，不打斷工作台裡的資料） | V41-1 |
| 2 | 要上手的人 | `/guide/{功能區}` 共 11 頁：每頁先一句「這頁回答什麼」，再逐步操作，每一步一張截圖（示範資料，可點開原尺寸），按鈕名稱與畫面上一字不差 | V41-2a、V41-2b |
| 3 | 所有人 | 分享卡片與 README 首圖換成目前的畫面；切到商品毛利、資料來源、待辦時的版面跳動（CLS 0.053–0.054）降到 0.05 以下或寫明原因；Next.js 升到修正版 | V41-0、V41-4 |
| 4 | 喜歡看示範的人 | 3 支無聲短片（30 秒上手、匯入資料、週會流程），附字幕檔與逐字稿 | V41-3（v4.1.0 上線後，你明確要影片時才做；D-V41-6） |

**不做什麼**：不改 `src/domain`、fixtures、`contribution-v1`、`assist-kpi-v1`、`breakeven-mer-v1`、`docs/METRICS.md`；不改工作台七頁的版面與功能（只加一個入口連結）；不做互動導覽（coach marks、步驟泡泡）、聊天客服、搜尋、多語系、留言或表單；不放第三方影片平台、字型或追蹤；不新增分析事件；不改備份、CSV、JSON。

**成本與節奏**：上線前 6 批，至少 6 個工作階段；影片（V41-3）另計。人工關卡：H7「介紹文案確認」（你本人，約 30 分鐘，擋 v4.1.0 正式上線）；H6 依 D-V41-17 維持「上線後補」，並加兩題使用說明任務。

**三大風險**

| 風險 | 處理 |
|---|---|
| 說明與介面不同步（改字、改版後截圖過期） | 步驟引用 labels 原字串（`{ui:…}`），測試擋重打的介面字串；媒體清單記被引用字串的雜湊；來源 PNG 當基準提交，每批與發版都跑比對（設定同 v4 畫面基準），差異 0 張才能上線（§3.5） |
| 介紹寫成行銷頁或誇大成效 | 只寫可驗證的做法，不寫成效（`docs/PILOT_PLAN.md`：合成資料不能宣稱提升毛利或節省金額）；不點名競品、不用最高級；H7 由你本人確認 |
| 拖慢工作台或增加隱私風險 | `/guide` 是獨立的靜態頁（伺服器元件，不載入 Recharts 與工作台程式）；說明文字放 `src/i18n/guide.zh-TW.ts`，不進工作台首載（D-V41-12），`/` 的首載只多入口連結（上限 +1,024 bytes）；媒體自家網域；說明頁沒有任何輸入、上傳或第三方嵌入 |

---

## 1 背景與問題

### 1.1 現況（v4.0.0）

- 只有一條使用者路由 `/`（`src/app/page.tsx`），七頁（經營總覽、通路健檢、商品毛利、假設試算、待辦、會議紀錄、資料來源）是同一頁內的面板；資料只在記憶體與（同意後的）本機保存。`sitemap.xml` 只有一個網址（`src/app/sitemap.ts`），`tests/relaunch.test.ts:104-111` 斷言 sitemap 只有一筆，`launch-check` 的補充檢查也斷言「單一網址」（`scripts/launch-check.mjs:11、119`）。
- 現有說明：README「30 秒試用」「用自己的資料」（`README.md:17-37`）、首頁空狀態「需要的檔案」（`empty.stateV3.filesHeading`）、頂欄「指標定義」九條與名詞小辭典（`glossary.*`）、匯入精靈內的提示（`importWizard.guidance.*`）。每頁頁首只有一句這頁回答什麼（`shell.nav.*.explain`，`src/components/dashboard.tsx:61`），沒有操作步驟。
- 對外素材過期：`public/og.png` 由 `scripts/make-og.mjs:12` 取 `verification/revamp-v3/V3-1/snapshots/desktop/01-overview-top.png`（v3 改名前的畫面），裁切用的側欄寬是 212px（`make-og.mjs:15`），但目前 `--sidebar-w` 是 220px；README 首圖是 `docs/images/overview-1440-v3.png`；README 發布紀錄段寫「最新：v3.0.0」「正式站已是 v3.0.0；H4 可用性複測尚未執行」（`README.md:106、108`），而且 `tests/release-notes.test.ts:143、147` 把這兩句鎖住了。
- 已知未達標：PRD v4 §2.2 B4 的 CLS < 0.05，有 4 個切頁超過（390 切到商品毛利 0.054、資料來源 0.054、待辦 0.053；1440 切到待辦 0.054），v3.0.0 就是這樣（`docs/revamp-v4/01_PRD.md:189`）。
- labels 的打包方式：`src/i18n/labels.zh-TW.ts` 整份進 `/` 的首載。`src/components/dashboard.tsx` 是 `"use client"` 並 import `labels`，`src/i18n/index.ts` 的 `t()` 依路徑動態取值，打包工具不會只留用到的欄位；v4.0.0 build 的 `/` page chunk 裡就有 labels 的原字串。說明文字如果也放進這個檔，`/` 首載會跟著變大（§3.10）。
- 依賴安全：2026-10-14 `npm audit`：`next@16.3.7` 有 6 筆公告（1 high：Image Optimization 的 SSRF；4 moderate；1 low），公告範圍都是 `<16.3.8`。本站沒用 `next/image`、`use cache`、ISR，實際影響低。審查時另見 `source-map-js`（high，有非破壞性修正），交 V41-0 一併評估。其餘 high（`xlsx`、`pptxgenjs` 經 `image-size`、`eslint-config-next` 鏈）沿用 R6 的評估：只用寫出 API、不解析使用者圖片或試算表，或只在開發時使用（`docs/DECISIONS.md` R6 段）。

### 1.2 使用者要的四件事與 repo 裡的限制

| 使用者要的 | repo 裡的限制或依據 | 本 PRD 的寫法 |
|---|---|---|
| 我為什麼要開發這套服務？ | `AGENTS.md:4`：不包含個人經歷或前雇主資訊；repo 沒有記錄你本人的動機，只有產品問題（`docs/PRD.md` 的 Product question、`docs/market-comparison-2026-10-05.md` §1 第 6 點「真正要取代的是自製 Excel ＋手動匯整三個後台」） | 這一段要用你自己的話（D-V41-9）；`GUIDE_CONTENT.md` 附兩種草稿：產品口吻（可直接上線）與第一人稱骨架（只有〔〕裡的提示問題，句子全部由你寫），都標「草稿：請使用者改成自己的話」 |
| 幫哪些人解決哪些問題？ | v3 起的三種讀者：老闆 10 秒、主管 3 分鐘、執行者 10 分鐘（`docs/RELEASES.md` v3.0.0、`docs/revamp-v3/01_PRD.md`）；`docs/PRD.md` 的適用範圍（單一公司、新台幣、實體商品） | 三種角色各一列：想知道什麼、以前怎麼做、在這裡怎麼做、從哪一頁開始；另寫「適合誰、還沒涵蓋什麼」 |
| 有什麼獨特性？ | `docs/market-comparison-2026-10-05.md` §6 的八點與 §7 的弱點；`docs/PILOT_PLAN.md` 不得宣稱成效 | 只寫可在產品裡驗證的做法（查得到出處、拆到分、固定規則、試算不外推、週會流程、資料不上傳、台灣多通路），並寫出代價；不點名競品、不用最高級（唯一、最好、最快、第一名之類；D-V41-11） |
| 各功能區段的詳細操作說明與截圖或示範影片 | 標籤單一來源；示範資料是虛構的合成資料（`README.md:23`）；公開站不用 AI | 11 個功能區頁，逐步文字＋每步截圖；本輪先做截圖，3 支示範影片排在上線後，你明確要時才做（D-V41-6） |

---

## 2 目標與成功指標

### 2.1 目標

1. 第一次來的人在 `/guide` 一頁內知道「這是什麼、給誰、怎麼開始」，並能一鍵回到工作台。
2. 每個功能區都有照著做就能完成的步驟，按鈕名稱與畫面一字不差，截圖是目前版本的畫面。
3. 說明不拖慢工作台、不增加隱私風險、不需要額外的人工維護（比對與重拍都是腳本）。
4. 修掉三項有證據的小問題（§4），不擴大範圍。

### 2.2 成功指標

**A 人工（H6、H7；未執行時寫「未量測」，不寫達標）**

| # | 指標 | 量法 |
|---|---|---|
| A1 | 第一次來的人 60 秒內從首頁找到「使用說明」並說出這套服務給誰用 | H6 場次加題 T5（D-V41-17） |
| A2 | 執行者只看 `/guide/import` 完成三份 CSV 匯入（`tests/fixtures/inclusive_tax`），不需口頭提示 | H6 場次加題 T6 |
| A3 | 你本人確認介紹三段與動機段（H7） | H7 紀錄 |

**B 工程（每批硬斷言或記錄）**

| # | 指標 | 門檻 |
|---|---|---|
| B1 | 工作台 `/` First Load JS（gzip，量法同 v4 B5） | ≤ V41-0 實測（v4.0.0）＋1,024 bytes；v4 的上限 545,397 仍有效；`guideLabels` 的字串（`GUIDE_SENTINELS`）在 `/` 首載 chunk 出現 0 次 |
| B2 | `/guide` 與 `/guide/{area}` First Load JS（gzip） | ≤ V41-0 量到的框架基準（404 頁）＋5,120 bytes；說明頁的 chunk 不含 `recharts`、`pptxgenjs`、`xlsx` 與 `src/components/dashboard` 的模組 |
| B3 | 說明頁媒體重量與可讀性 | 單張截圖 ≤ 200 KB、每個功能區頁的截圖合計 ≤ 1.5 MB；桌機截圖寬度盡量 ≤ 800 CSS px，每張圖有原尺寸連結；首屏以下的圖 `loading="lazy"`；影片（V41-3）每支 ≤ 2 MB、≤ 45 秒、`preload="none"` |
| B4 | 說明頁 Lighthouse（`/guide`、`/guide/overview`，1440 與 390，navigation 模式） | Accessibility 100（下限 95）、SEO ≥ 95（本機 canonical 稽核見 §3.8）、Performance 1440 ≥ 97、390 ≥ 90、CLS 0（每張圖都寫 `width`、`height`） |
| B5 | 說明頁 axe（四尺寸） | 0 serious／critical（含 `image-alt`；有影片時含 `video-caption`） |
| B6 | 同步檢查（§3.5） | 未解析的 `{ui:…}` 0、重打的介面字串 0、缺檔 0、孤兒檔 0、基準 PNG 的 SHA-256 與清單相符、`labels_hash` 相符、`GUIDE_MEDIA=check` 與基準 PNG 比對差異 0 張 |
| B7 | 既有護欄 | v4 全部沿用：B2 首屏、B3 390 無橫向捲動、B9 DOM 節點、390 五個 TBT、design-lint、copy-style、copy-density、chart-lint、testid 刪除 0、labels 既有字串逐字相同、network-log 下載集合 5 種、golden 不變 |
| B8 | CLS（§4 O2） | 4 個超標切頁 < 0.05，或在驗收文件寫明位移來源與不修的理由 |
| B9 | launch-check | 13 項全過；補充檢查改為 sitemap 含全部說明頁網址、`/guide` 200 且 og:image 是 `/og.png`、`/guide/不存在` 404 |

---

## 3 範圍 A：服務介紹與使用說明

### 3.1 位置與網址（D-V41-4，建議 A）

| 方案 | 說明 | 優點 | 缺點 |
|---|---|---|---|
| **A（建議）** | 公開靜態路由：`/guide`（服務介紹三段＋30 秒上手＋功能區目錄）與 `/guide/{area}`（11 個功能區頁，`generateStaticParams`，`dynamicParams = false`） | 不碰工作台的首載；可被搜尋、可直接分享某一頁；每頁只載自己的圖；伺服器元件，幾乎沒有頁面 JS | 從工作台點入口要另開分頁（同分頁換頁會丟掉記憶體裡的資料） |
| B | `/about`（介紹）＋`/guide`（全部操作說明一長頁） | 路由少 | 一長頁 40 多張圖，手機很長；功能區無法單獨分享 |
| C | 工作台內新面板（側欄第五組「說明」，比照 V4-3c 隨頁載入） | 不用換分頁 | 無法被搜尋、不能分享連結；面板會進工作台的狀態、testid 與七頁護欄，工作量最大 |
| D | 只在 repo 寫 Markdown（`docs/GUIDE.md`） | 最省 | 一般使用者看不到；不符合「功能區」 |

**選 A 的規則**
- 說明頁是 `src/app/guide/` 下的伺服器元件，**不 import** `src/components/dashboard.tsx`、`src/components/charts/**`、Recharts、pptxgenjs、xlsx；共用元件放 `src/components/guide/`（全部伺服器元件，沒有 `"use client"`）。說明文字放 `src/i18n/guide.zh-TW.ts`（§3.10）。任何 `"use client"` 模組都不 import `@/i18n/guide*`、`@/application/guide`、`@/components/guide/*`。B2 以 build 產物斷言，import 邊界由 `tests/guide-routes.test.tsx` 斷言。
- 工作台裡的入口一律另開分頁：`<a href="/guide" target="_blank" rel="noopener">`，可及名稱含可見文字再加「（另開分頁）」（`shell.guideV41.*`）。說明頁裡的「開啟工作台」是同分頁連結到 `/`。
- 說明頁沿用 `src/app/layout.tsx`（`lang="zh-Hant-TW"`、分析腳本只在 Vercel production 載入）；頁尾在分析啟用時顯示既有的 `relaunch.analyticsNote`（與工作台同一判斷 `analyticsEnabled`）。不新增分析事件（D-V41-23，預設沿用），頁面瀏覽已由既有腳本記錄路徑。
- 樣式用 `globals.css` 的既有 token；新 class 以 `.guide-` 開頭；不加新字級（design-lint 字級種類 11 不升）。V41-0 起 design-lint、ui-audit 的 tsx 範圍與 `tests/labels-coverage.test.ts` 的「元件沒有 CJK」斷言都涵蓋 `src/app/**/*.tsx`，路由檔裡寫中文字面值、JSX 中文或色碼都擋得到。

### 3.2 工作台內的入口（D-V41-5，建議 A）

| 位置 | 樣子 | 畫面影響 |
|---|---|---|
| 側欄（桌機、平板） | 一個文字連結「使用說明」，放在 `aside.sidebar` 內、`nav` 之後（最後一組之下） | 含側欄的畫面基準都會變（V41-1 允許變動畫面） |
| 手機「更多」選單 | 「更多」面板最後一列（`mobile-more` 內） | 面板預設收合，畫面基準不變 |
| 首頁空狀態 | 「載入示範資料」「匯入資料」那一列下方一行：「使用說明：每一頁怎麼用」（陳述句；空狀態不用問句，`docs/revamp-v3/01_PRD.md` §7.10、`src/components/shell/page-states.tsx:10`） | 新增畫面基準 14（首頁空狀態） |
| 頁尾 | 「指標定義」按鈕旁 | 只有整頁截圖（02）會變（V41-1 實測更正，D-V41-25＝A：390 的 04–09 也是整頁截圖，頁尾多折一行、頁高 +16px，也會變） |

不做（D-V41-5 的 C）：每頁頁首的「這頁怎麼用」。七頁的頁首都會變、要過七頁的鍵盤與 B2 首屏護欄；等 H6 的 T5、T6 顯示有需要再做。

### 3.3 頁面結構

**`/guide`（說明首頁，h1「服務介紹與使用說明」）**
1. 一句話（沿用 `brand.description` 的意思，不重寫口號）＋兩個動作：「開啟工作台」（主要）、「從 30 秒上手開始」（錨點）。
2. **我為什麼要開發這套服務？**（D-V41-9；使用者提供文字前，標題用「為什麼做這套服務」與產品口吻草稿）
3. **這套服務幫哪些人解決哪些問題？**：三種角色的表（誰／想知道／以前怎麼做／在這裡怎麼做／從哪一頁開始）＋「適合誰、還沒涵蓋什麼」。
4. **這套服務有什麼獨特性？**：7 項做法（每項一行標題＋一兩句說明＋「在哪裡看得到」連到對應功能區頁）＋「這些做法的代價」。
5. **30 秒上手**：4 步文字（各連到對應的功能區頁）；做影片時（V41-3）再加 1 支短片。
6. **各功能區的操作說明**：11 張連結卡（標題＝功能區名、一句「回答什麼」），依側欄四組（看結果、找原因、做決定、管資料）排列，前面加「開始使用」、後面加「跨頁工具」兩組。卡片是普通連結，不是圖。
7. 頁尾：示範資料是虛構的合成資料（`shell.sidebar.sidebarNote.demo`）、資料不上傳一句、截圖更新日期（`guide.common.mediaUpdated`，讀媒體清單的 `updated`）。

**`/guide/{area}`（功能區頁）**
1. 麵包屑：使用說明 › {功能區}；h1＝`guide.areas.{area}.title`（七頁的功能區直接引用 `{ui:shell.nav.*.headline}`）。
2. 「這頁回答什麼」一句、「開始前」（需要的資料狀態，例如「已載入示範資料」）。
3. 本頁目錄（3–6 個步驟標題，錨點連結）。
4. 步驟：`<ol>` 每一步＝h2 標題（動詞開頭）＋1–3 句操作文字（含 `{ui:…}` 引用的介面字串，以粗體呈現）＋`<figure>`（截圖外包一個連到原尺寸檔的 `<a>`＋`<figcaption>`）。
5. 「要注意」：最多 3 點，連到「指標定義」的對應條目或 GLOSSARY 用語；限制句集中在這裡，不散在步驟裡。
6. 「下一步」：連到相關功能區頁（最多 2 個）與「開啟工作台」。
7. 影片（只有 start、import、meeting 三頁，V41-3）：放在步驟之前，`<video controls preload="none" playsinline poster>`＋`<track kind="captions" srclang="zh-Hant-TW" default>`；下方一行 `guide.common.videoNote`「影片沒有聲音；下方是影片的逐步文字」，再用 `<ol>` 列出 `guide.videos.{id}.cues`（與字幕檔同一來源）當逐字稿。

**11 個功能區**（D-V41-19；`area` 代號＝網址片段；內容見 `GUIDE_CONTENT.md`）

| 組 | area | 標題 | 截圖數（估） | 影片（V41-3） |
|---|---|---|---|---|
| 開始使用 | `start` | 開始使用：看懂畫面與期間 | 4 | 30 秒上手 |
| 開始使用 | `import` | 匯入資料 | 5 | 匯入資料 |
| 看結果 | `overview` | 經營總覽 | 5 | — |
| 找原因 | `diagnosis` | 通路健檢 | 4 | — |
| 找原因 | `products` | 商品毛利 | 3 | — |
| 做決定 | `scenarios` | 假設試算 | 4 | — |
| 做決定 | `actions` | 待辦 | 3 | — |
| 做決定 | `meeting` | 會議紀錄與投影 | 5 | 週會流程 |
| 管資料 | `data` | 資料來源 | 4 | — |
| 跨頁工具 | `evidence` | 計算與來源、指標定義 | 3 | — |
| 跨頁工具 | `export` | 匯出、儲存與備份 | 4 | — |

合計約 44 張截圖（桌機 1440 為主，手機 390 只在操作不同處另拍，含在上表）。桌機截圖以元素或區域裁切，寬度盡量 ≤ 800 CSS px。標題欄是顯示結果；凡是和介面字串相同的標題（例如「匯入資料」「經營總覽」），在 `guideLabels` 裡都寫成 `{ui:…}` 引用。

### 3.4 內容規則

- **用詞**：沿用 `docs/revamp-v3/GLOSSARY.md` 與 `docs/revamp-v4/GLOSSARY.md`（例如寫「扣廣告後貢獻」不寫「淨利」、「計算與來源」不寫「公式與來源」、「累計」不寫「累積」）；copy-style 黑名單照常計入（`guideLabels` 新字串 0 違規）。
- **標題**：`guide.sections.*`、`guide.areas.*.title`、`guide.areas.*.steps.*.title` 列入 L1（每子句 ≤ 14 字；`guide.sections.*` 已被 `scripts/lib/copy-scan.mjs` 既有的 `L1_KEY_PATTERNS` 涵蓋，另兩種在 V41-0 加）；`{ui:…}` 當佔位符剔除；步驟標題動詞開頭。
- **介面字串一律引用**：標題、步驟文字、`alt`、圖說、要注意、介紹三段（who、unique 表）、影片字幕裡提到的按鈕、頁名、區塊名，都寫成 `{ui:shell.buttons.loadDemo}` 這種佔位，渲染時換成 labels 原字串；步驟內文（`steps.*.body`）裡渲染成粗體，其他欄位（含 `alt`，不能有標記）渲染成純文字。`tests/guide-content.test.ts` 斷言：(1) 每個 `{ui:…}` 都解析得到；(2) `guideLabels` 的字串在 `{ui:…}` 之外，不得含任何 `shell.nav.*.headline`、`*.buttons.*`、`*.sections.*` 的值（長度 ≥ 3）。指標名（`metrics.*.headline`，例如「商品毛利」）與測試檔內 `GUIDE_PLAIN_TERMS` 列出的通用詞除外；`GUIDE_PLAIN_TERMS` 起始只有「下一步」「影響金額」「關鍵數字」，每個附理由，新增要在驗收文件說明。
- **不寫成效、不寫預測**：不寫「提升」「節省」「增加營收」之類的結果；示範資料的數字只在截圖與圖說中出現，並註明是虛構的合成資料。
- **不點名競品、不用最高級**：copy-scan 新增 `guide.*` 範圍的黑名單 `/唯一|最好|最快|最佳|最強|第一名|業界第一/`（比照 `SCOPED_BLACKLIST`；只抓最高級，不擋「第一次」「第一項」這類序數）。
- **動機段**：只用你提供的文字（D-V41-9）；不寫個人經歷、前雇主、公司名（`AGENTS.md:4`，D-V41-10）。
- **入口字串**：`shell.guideV41.*` 不用問句（不含「？」，`tests/guide-content.test.ts` 斷言）。

### 3.5 媒體製作流程（D-V41-6、7、8、20、21、22）

| 項目 | 規格 |
|---|---|
| 產生方式 | `verification/guide-media.config.ts`＋`verification/guide-media/capture.spec.ts`（Playwright，沿用 `verification/revamp-v4-capture/shared.ts` 的 `loadDemo`、`FIXED_NOW`＝2026-10-05 10:00 台北、`noOverlayStylePath`；需要看到手機底部分頁列的截圖不套 `noOverlayStylePath`，因為它會把 `.mobile-tabbar` 設成 `visibility: hidden`，`shared.ts:69`）；對著 3100 埠的 PUBLIC_DEMO production 伺服器。`GUIDE_MEDIA=check` 只比對、不寫任何檔；`GUIDE_MEDIA=write` 只更新比對失敗或新增的 media（Playwright `--update-snapshots=changed` 的語意） |
| 資料 | 以示範資料為主（`fixtures/demo`，唯讀）；示範資料看不到的狀態用 repo 內既有的合成檔：`tests/fixtures/inclusive_tax`（含稅匯入）、`fixtures/errors/missing_ad_day`（唯讀；缺列與資料問題）、`tests/fixtures/synthetic-4-channel/`（商品毛利為負的累計圖；依 D-V41-21＝A 修改 D-V4-31 的用途限制，通路顯示原代碼），圖說註明「虛構的合成資料」；本機保存提示一律按「暫時不要」（`storage.autoSave.decline`）；不用任何真實資料 |
| 截圖 | 視窗 1440×1000（手機 390×844），deviceScaleFactor 1；以元素或裁切區域截圖，不截整頁；桌機截圖寬度盡量 ≤ 800 CSS px（例如期間列只截本期、上期與期間快捷那一段，不截整列）；擷取時對步驟的目標元素注入一圈強調框（`outline`，只在擷取的頁面注入，不改產品程式）。**來源 PNG 是基準**，提交到 `verification/guide-media/baseline/{mediaId}.png`；公開的 WebP 由 Chromium canvas 轉檔（品質 0.9，有損，不需外部工具）。起草時實測（整個視窗，元素截圖會更小）：1440 總覽首屏 PNG 266 KB → 117 KB、390 首屏 98 KB → 46 KB；canvas 品質 1.0 雖然無損，但 271 KB 比 PNG 還大，不用 |
| 原尺寸連結 | 每個 `<figure>` 的 `<img>` 外包 `<a href="/guide/{area}/{mediaId}.webp">`（同一個檔；是導覽不是下載，`network-log` 的下載集合不變）；可及名稱＝`alt`＋`guide.common.fullSize`（sr-only）。手機上寬圖縮得很小時，讀者點開看原尺寸。E2E 在 390 斷言每張圖都有這個連結，並記錄顯示寬度／`naturalWidth`；低於 0.45 的圖列在驗收文件，優先改成更窄的裁切 |
| 影片（V41-3） | 3 支，1280×800，Playwright `recordVideo`（WebM）→ 依 D-V41-7：A 用本機 `ffmpeg` 轉 MP4（H.264、`-an` 無音軌、`+faststart`）／B 直接用 WebM；起草時實驗：24 秒的走查（1280×800），Playwright 錄出的 WebM（VP8）1.98 MB → MP4（H.264）697 KB、WebM（VP9）846 KB；poster 用第一個步驟的 WebP。影片每次錄出的位元組都不同，所以 `check` 不比影片檔：照流程重跑，在每個 cue 擷取一張 PNG，與 `verification/guide-media/baseline/video/{videoId}-{cue}.png` 比對；全部 0 差異就不重錄，有差異才重錄並轉檔 |
| 字幕與逐字稿（V41-3） | WebVTT，每個 cue 一段，文字取 `guide.videos.{id}.cues[]`（`guideLabels`），由腳本寫成 `.vtt`；時間點由腳本在每個 cue 開始時記錄；頁面上影片下方用 `<ol>` 列出同一組 cues 當逐字稿 |
| 存放 | `public/guide/{area}/{mediaId}.webp`、`public/guide/video/{videoId}.mp4`、`.vtt`、`-poster.webp`；基準 `verification/guide-media/baseline/**`；媒體清單 `src/application/guide-media.json` 只記內容欄位：`id`、檔名、寬高、bytes、基準 PNG 的 SHA-256、`labels_hash`（該步驟引用的介面字串的雜湊），以及整份清單的 `updated`（日期；只有實際更新了媒體時才改）。擷取時間與 commit 寫進驗收文件，不寫進清單。說明頁從清單取寬高 |
| 同步檢查 | 單元測試 `tests/guide-content.test.ts`（每次 `npm test`，不需要伺服器）：每個步驟的 `mediaId` 在清單裡、清單裡的 WebP 與基準 PNG 都存在、基準 PNG 的 SHA-256 與清單相符（換了基準卻沒重轉 WebP 時失敗）、`public/guide/` 與 `baseline/` 都沒有孤兒檔、`labels_hash`＝目前被引用字串的雜湊（改到任何被引用的介面字串就失敗，提示跑 `GUIDE_MEDIA=write`；圖相同時只更新雜湊，不重轉 WebP）。V41-2a 起每批另跑 `GUIDE_MEDIA=check`：用 `toHaveScreenshot` 比對基準 PNG，設定同 `verification/revamp-v4.capture.config.ts`（`maxDiffPixels: 0`、`threshold: 0.02`、`animations: "disabled"`），差異必須 0 張。不用位元組雜湊判斷過期：同一台機器連拍兩次 PNG 本來就可能差 ±1 色階（`verification/revamp-v3/V3-0-baseline.md:39`，mobile 02 有 24 個像素） |
| 再生節奏 | 每批（V41-2a 起）與每次發版（含修正版）都跑 `GUIDE_MEDIA=check`；有差異才跑 `GUIDE_MEDIA=write`，只重拍、重轉有差異的媒體並提交，驗收文件逐張寫理由；沒差異就什麼都不改。版本號改變不需要重拍（D-V41-22） |
| 大小控制 | B3 的門檻由單元測試讀清單的 bytes 斷言；公開 WebP 首次約 2–5 MB（44 張 × 約 40–120 KB），基準 PNG 約 5–8 MB；兩者都只在畫面改變時更新，與 v4 提交 `snapshots/` 的做法一致；實際數字記在驗收文件 |

### 3.6 無障礙

- 每張截圖 `alt` 寫「畫面上看得到什麼、強調框框住哪裡」（`guide.areas.{area}.steps.{key}.alt`），不寫「截圖」二字；圖說 `<figcaption>` 寫這一步的結果。原尺寸連結的可及名稱＝`alt`＋`guide.common.fullSize`。
- 影片（V41-3）：無自動播放、無循環；原生 `controls`（鍵盤可操作）；`<track kind="captions">`（axe `video-caption` 需要，起草時實驗：有 track 時通過、拿掉就違規）；影片下方用 `<ol>` 列出字幕的同一組文字（`guide.videos.{id}.cues`）當逐字稿（WCAG 1.2.1 純影像的替代）。
- 鍵盤：沿用工作台的跳至主要內容連結（`shell.sidebar.skipLink`）；本頁目錄是錨點連結；每張圖的原尺寸連結各是一個 Tab 停留點；Tab 順序＝閱讀順序；任何 Tab 停留點都不在 `aria-hidden` 內。
- 標題層級 h1 → h2 → h3 不跳級；對比沿用既有 token（contrast-check 不新增配對，除非新增 token）。
- 四尺寸 axe 0 serious；`keyboard-walk` 加 `/guide` 與 `/guide/start` 兩條路徑（里程碑：跳過連結、本頁目錄第一項、第一個步驟、第一張圖的原尺寸連結；有影片時加影片控制）。

### 3.7 效能

- `/` 不變：入口只是 `<a>`，說明文字不在 `labels.zh-TW.ts`；B1 斷言 ≤ V41-0 實測＋1,024 bytes，且 `GUIDE_SENTINELS` 在 `/` 首載 chunk 出現 0 次；390 五個 TBT 照 v4 規則量。
- 說明頁：伺服器元件、靜態產生；首屏只有文字（說明首頁不放大圖）；截圖 `loading="lazy"`、`decoding="async"`，第一張可見圖不 lazy；影片 `preload="none"`。B2–B4 斷言。
- 不用 `next/image`（不需要伺服器端圖片處理，也避開本輪 Next.js 公告中的 Image Optimization 項目）。

### 3.8 SEO、sitemap、robots 與上線檢查（D-V41-13，建議 A）

- 每個說明頁的 metadata 都由共用 helper `guideMetadata({ title, description, path })`（`src/app/guide/metadata.ts`）產生，回傳完整的 `openGraph`（title、description、url、siteName、locale、type、`images: [{ url: "/og.png", width: 1200, height: 630, alt }]`，alt 沿用 `labels.brand.title`）、`twitter` 與 `alternates.canonical`。原因：Next 合併 metadata 時巢狀欄位整組覆蓋，子頁只設 `openGraph.url` 就會把根 layout 的 `images`、`siteName`、`locale`、`type`、`title` 全部蓋掉（`src/app/layout.tsx:14-22`），分享出去沒有圖也沒有站名；根 layout 的 `canonical: "/"` 不覆寫，子頁也會全部指回首頁（`src/app/layout.tsx:13`）。`tests/guide-routes.test.tsx` 對每一頁斷言 og:image＝`/og.png`、canonical＝自己的路徑。分享圖沿用 `/og.png`（V41-4 重做）。
- `src/app/sitemap.ts`：加 `/guide` 與 11 個功能區頁（由 `GUIDE_AREAS` 產生；`lastModified` 為 build 時間，與現況相同）；`tests/relaunch.test.ts` 的 sitemap 斷言同批改成 `[SITE_URL, SITE_URL/guide, …GUIDE_AREAS 各頁]`，每筆 `lastModified` 都是 Date；`robots.ts` 與它的斷言不變（已允許全部）。
- `scripts/launch-check.mjs`：13 項不變；補充檢查把「sitemap 單一網址」改成「sitemap 含 `/` 與 12 個說明頁網址」，加 `/guide` 200 且含品牌名、`/guide` 的 og:image 是 `/og.png`、`/guide/not-a-area` 404、一張說明截圖 200。
- Lighthouse SEO：`scripts/lighthouse-pages.mjs` 現在只跑 accessibility 與 performance，流程從 `/` 開始；V41-1 起對 `/guide`、`/guide/overview` 另跑 navigation 模式，類別含 accessibility、performance、seo。本機 127.0.0.1 上 canonical 指向正式站網域，Lighthouse 的 canonical 稽核可能和正式站結果不同：失敗時在驗收文件記錄原因，SEO 分數只排除這一項，或改在 preview 上量（需當次同意）。
- 不加結構化資料（JSON-LD）、不做多語系。

### 3.9 隱私與公開站邊界

- 說明頁沒有輸入框、上傳、表單、留言；不讀也不寫 `localStorage`；不呼叫 `/api/*`。
- 截圖與影片只有示範資料與 repo 內既有的合成檔（都是虛構的），擷取前關掉本機保存提示；擷取流程不碰 `.env*`、不開 AI。
- 不嵌第三方影片平台、字型、地圖或追蹤；媒體只放自家網域的 `public/guide/`。
- `APP_MODE=PUBLIC_DEMO`、`ENABLE_LIVE_AI=false`、`/api/insights` 的封鎖邏輯、`vercel.json` 不動（D-V41-3 的第五條命令斷言 `src/app/api`、`vercel.json`、`src/application/analytics.ts` 對 `872662d` 沒有改動）。
- `git push` 任何分支到 origin 都會由 Vercel Git 整合建立 preview（`docs/DECISIONS.md:307、726`；`docs/STATUS.md:57、602`），視同部署；沒有你當次明確同意不 push。
- 作者與聯絡資訊：預設不放（D-V41-10）。

### 3.10 labels、testid 與測試（D-V41-12，建議 A'）

- **說明文字放獨立檔**：說明頁的字串放新檔 `src/i18n/guide.zh-TW.ts`，匯出 `guideLabels`（頂層只有 `guide`，攤平後的鍵是 `guide.*`）；只有伺服器模組 import 它：`src/app/guide/**`、`src/components/guide/**`（`src/app/sitemap.ts` 只 import `@/application/guide` 的 `GUIDE_AREAS`）。這個檔可以 import `labels` 解析 `{ui:}`。原因見 §1.1：`labels.zh-TW.ts` 整份進 `/` 首載；審查時實測 `GUIDE_CONTENT.md` 草稿的 201 條字串原始 19,282 bytes、gzip 8,122 bytes，全部約 340 條估 gzip 12–15 KB，放進 `labels.zh-TW.ts` 就會超過 B1 的 +1,024。
- **入口字串留在 labels**：入口 3 條 `shell.guideV41.*` 放在 `labels.zh-TW.ts`；`LABEL_GROUPS` 維持 24 組。`V41_NEW_KEY_PREFIXES = ["guide.", "shell.guideV41."]`，兩個檔都適用。labels-structure、copy-scan（`scanLabels` 一併掃 `guideLabels`）、ui-audit 的 labels 範圍、v4 字串快照比對都涵蓋兩個檔。V41-0 產生 v4.0.0 `labels.zh-TW.ts` 全部字串葉節點快照 `verification/revamp-v41/labels-v4.flat.json`（起草時試數 2,839 個，實數以產出為準），逐鍵逐字不變；v3 的 2,581 個快照照常比對。每批在兩個檔加「── V41-n 錨點」註解。
- **首載與 import 邊界**：`verification/revamp-v4-capture/metrics.spec.ts` 比照 `SPLIT_SENTINELS` 加 `GUIDE_SENTINELS`（`guide.hub.title` 這種只出現在 `guideLabels` 的字串；v4.0.0 的 chunk 保留中文原字，可以直接比對），在 `/` 的首載 chunk 中出現 0 次。`tests/guide-routes.test.tsx` 斷言沒有任何 `"use client"` 模組 import `@/i18n/guide*`、`@/application/guide`、`@/components/guide/*`。
- testid：說明頁 `guide-hub`、`guide-area-{area}`、`guide-step-{area}-{stepKey}`、`guide-shot-{mediaId}`、`guide-video-{videoId}`、`guide-toc`；入口 `guide-entry-{sidebar|more|home|footer}`；不用陣列索引。新增的寫進 `verification/revamp-v41/testids-v41-added.txt`；v2、v3、v4 新增與 v41 新增四份刪除數都是 0。
- 新測試：`tests/guide-content.test.ts`（§3.5 同步檢查、L1、最高級黑名單、重打的介面字串、`shell.guideV41.*` 不含「？」、`guideLabels` 不含第一人稱骨架的「〔」「〕」）、`tests/guide-routes.test.tsx`（每個 area 都能 SSR、h1 唯一、canonical 與 og:image 正確、不 import 工作台模組、client 模組不 import 說明模組）、E2E `tests/e2e/guide.spec.ts`（四尺寸：入口另開分頁、目錄錨點、無橫向捲動、390 每張圖有原尺寸連結、axe；V41-3 加影片控制）。`mounted-testids` 只加入口的 4 個 testid；說明頁不屬於七頁，不進 `pageStates`。既有測試同批改：`tests/relaunch.test.ts`（sitemap）、`tests/labels-structure.test.ts`、`tests/labels-coverage.test.ts`（掃描範圍含 `src/app/**/*.tsx`）。
- 畫面基準：沿用 v4 的 52 張，加 14 首頁空狀態、15 說明首頁（首屏）、16 `/guide/overview`（首屏）× 4 尺寸＝64 張。

---

## 4 範圍 B：優化補充（D-V41-14、15）

只收「有證據、一批內做得完、不改口徑與功能」的項目。

| # | 項目 | 證據 | 做法 | 批次 |
|---|---|---|---|---|
| O1 | 對外素材過期 | `public/og.png` 是 v2／v3 改名前的畫面（上面寫「口徑說明」「通路貢獻」「輔助指標」；`scripts/make-og.mjs:12` 取 V3-1 截圖，`make-og.mjs:15` 以 212px 裁側欄，目前 `--sidebar-w` 是 220px）；README 首圖 `docs/images/overview-1440-v3.png`；`README.md:106、108` 仍寫 v3.0.0；`tests/release-notes.test.ts:143、147` 鎖住舊句 | `make-og.mjs` 改取最新畫面基準（V41-4 的 01）重產 `og.png`，`SOURCE.sidebar` 改成 220（或改讀 token）；README 首圖改用 V41-4 畫面基準的總覽首屏（新檔 `docs/images/overview-1440-v4.png`，舊檔保留；`tests/release-notes.test.ts:147` 同批改）；README 發布紀錄段與 release-notes 測試在 V41-5 改成 v4.1.0 | V41-4、V41-5 |
| O2 | 切頁版面跳動 | CLS：390 切到商品毛利 0.054、資料來源 0.054、待辦 0.053；1440 切到待辦 0.054（`docs/revamp-v4/01_PRD.md:189`；`verification/revamp-v4/V4-10/lighthouse-runs/`） | 用 Lighthouse trace 的 layout-shift 元素找出來源；只在同一批內能修好時修（例如預留高度、骨架與內容等高），不改版面設計；修不好就在驗收文件寫明來源與原因 | V41-4 |
| O3 | Next.js 安全修正版 | `npm audit`（2026-10-14）：`next@16.3.7` 6 筆公告，範圍 `<16.3.8` | `next` 與 `eslint-config-next` 升到 `16.3.8`（精確版號；開工時先 `npm view next@16.3.8 version` 確認存在），只改版號與 lockfile；全套驗收，畫面 0 差異 | V41-0（D-V41-15） |

**看過但不收的**

| 項目 | 原因 |
|---|---|
| Skew Protection（D-V4-44 的 C） | Vercel 專案設定，需你本人在設定頁操作（Hobby 方案是否支援待確認）；D-V41-16（預設沿用） |
| H6 v4 複測、匯出開檔檢查 | 人工；D-V41-17 |
| 台灣化示範資料（F15）、去識別化實檔（F16）、其餘 8 個來源預設的實檔驗證 | 需要你提供檔案；不在本輪 |
| `xlsx`、`pptxgenjs`（`image-size`）、`eslint-config-next` 鏈的 audit 項目 | 沒有修正版或修正是降版；本站只用寫出 API、不解析使用者的圖片或試算表；R6 已評估，V41-0 驗收再記一次 |
| `source-map-js`（high，有非破壞性修正） | 審查時才看到；V41-0 與 O3 一起評估並記錄，修正要動 lockfile 時先問你 |
| D-V4-61（G22 對帳表 390 差額欄要橫捲）、D-V4-62（`$row`） | 已拍板維持；本輪不重開 |

---

## 5 非目標

- 不改 `src/domain`、`fixtures/*`、`contribution-v1`、`assist-kpi-v1`、`breakeven-mer-v1`、`docs/METRICS.md`；不改工作台七頁的版面、功能、文案（入口連結與 O2 的 CLS 修正除外）。
- 不做互動導覽（coach marks、步驟泡泡、首次使用精靈）、說明內搜尋、聊天客服、FAQ 投票、留言、聯絡表單。
- 不做每頁頁首的「這頁怎麼用」（D-V41-5 的 C；看 H6 再說）、不做 `/?demo=1` 這類自動載入示範資料的網址參數。
- 不做旁白、背景音樂、GIF、第三方影片平台；不做 PNG／SVG 下載入口（原尺寸連結是導覽到同一張 WebP，不是下載）。
- 不做結構化資料、多語系、深色模式。
- 不新增分析事件；不改備份 schema、CSV、JSON；不加任何 npm 依賴（`ffmpeg` 若依 D-V41-7＝A 使用，是本機轉檔工具，不進 `package.json`，只在產生影片時用）。

---

## 6 風險

| 風險 | 機率 | 處理 |
|---|---|---|
| 介面改字或改版後說明過期 | 中 | §3.5 的 `labels_hash`、重打字串檢查與基準 PNG 比對；每批與發版必跑 |
| 說明文字被打包進工作台首載 | 中 | D-V41-12＝A'：放獨立檔、只給伺服器模組；`metrics.spec` 的 `GUIDE_SENTINELS` 與 `tests/guide-routes.test.tsx` 的 import 斷言 |
| 你沒空提供動機文字，卡住上線 | 中 | 產品口吻草稿可直接上線（D-V41-9 的 A），H7 只要你確認「用草稿」即可 |
| 擷取不穩定（動畫、字型、時間） | 低 | 沿用 v4 capture 的固定時間、`animations: "disabled"`、`noOverlayStylePath`、比對容許 `threshold: 0.02`；v4 的 52 張已連續多批 0 差異；不用位元組雜湊判斷過期 |
| repo 變大 | 低 | 基準 PNG 約 5–8 MB、公開 WebP 首次約 2–5 MB；`GUIDE_MEDIA=write` 只動有差異的檔，兩者都只在畫面改變時更新，與 v4 提交 `snapshots/` 的做法一致；影片延後（D-V41-6），要做時影片只在 cue 比對有差異時才重錄 |
| 說明頁拖慢工作台或誤載入圖表程式 | 低 | B1、B2 硬斷言；`tests/guide-routes.test.tsx` 斷言不 import 工作台模組 |
| 批次代理為了備份 push 分支，等於沒經同意部署 | 低 | 共同規則：push 任何分支視同部署，沒有你當次同意不 push |
| `next@16.3.8` 升級造成行為差異 | 低 | V41-0 單獨做、全套驗收、畫面 0 差異；不成立就回退並記錄（D-V41-15） |
| 說明被看成行銷頁 | 低 | §3.4 規則、copy-scan 最高級黑名單、H7 |

---

## 7 批次概要（詳細在 `06_BATCHES.md`）

| 批次 | 主題 | 大小 | 依賴 |
|---|---|---|---|
| V41-0 | 基準與護欄（不改畫面；含 O3） | M | D-V41-1、12、15 |
| V41-1 | 說明路由、入口與介紹三段 | M | V41-0；D-V41-4、5、9、10、11、13、19 |
| V41-2a | 媒體管線與前 5 個功能區（start、import、overview、diagnosis、products） | M | V41-1；D-V41-20、21、22 |
| V41-2b | 後 6 個功能區（scenarios、actions、meeting、data、evidence、export） | M | V41-2a |
| V41-4 | 優化補充（O1 分享圖與 README 首圖、O2 CLS） | S | V41-2b；D-V41-14 |
| V41-5 | 收尾與上線 | M | V41-0–V41-2b、V41-4；H7；D-V41-1、17、18、24 |
| V41-3 | 示範影片 3 支（v4.1.0 上線後，你明確要影片時才做） | S | V41-5；D-V41-6＝A、7 |

預設沿用的 D-V41-2、3、8、16、23 不擋任何批次。

---

## 8 需要你提供

1. 「我為什麼要開發這套服務？」3–6 句你自己的話（或回覆「用草稿」）。請不要寫前雇主或個人經歷（`AGENTS.md:4`）；如果你想寫，要先同意在 `AGENTS.md` 開例外（D-V41-10 的 B）。
2. 是否要放聯絡管道；要的話只放一個（例如 GitHub issue 連結或一個信箱）。
3. 是否同意 `next`、`eslint-config-next` 升到 `16.3.8`（D-V41-15）。
4. 要不要示範影片（D-V41-6）；要的話，是否同意用本機 `ffmpeg` 轉影片（D-V41-7），不同意就用 WebM。
5. 每一次部署（含 preview、含 push 任何分支）的當次同意。
