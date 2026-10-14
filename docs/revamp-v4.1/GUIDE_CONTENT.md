# v4.1「服務介紹與使用說明」內容草稿

> 用途：V41-1、V41-2a、V41-2b（與上線後的 V41-3）把本檔的文字放進 `src/i18n/guide.zh-TW.ts` 的 `guideLabels`（D-V41-12＝A'；不是 `labels.zh-TW.ts`），並照「擷取」欄產生截圖與影片。工作台入口的 3 條（§1.8）放 `labels.zh-TW.ts` 的 `shell.guideV41.*`。本檔是草稿，H7 由使用者確認介紹三段；操作步驟以實作當下的介面為準，介面字串一律引用 labels，不在本檔定稿。
>
> **寫法約定**
> - `{ui:路徑}`：引用 `labels.zh-TW.ts` 既有字串。例：`{ui:shell.buttons.loadDemo}` 顯示為「載入示範資料」。標題、步驟內文、`alt`、圖說、要注意、介紹三段的表格、影片字幕都可以用；步驟內文（`steps.*.body`）裡渲染成粗體，其他欄位（含 `alt`）渲染成純文字。路徑在 v4.0.0（`872662d`）都存在；實作時 `tests/guide-content.test.ts` 逐一檢查。
> - **不重打介面字串**：`guideLabels` 的字串在 `{ui:…}` 之外，不得含任何 `shell.nav.*.headline`、`*.buttons.*`、`*.sections.*` 的值（長度 ≥ 3），測試會擋。例外只有指標名（`metrics.*.headline`，例如「商品毛利」）與測試檔 `GUIDE_PLAIN_TERMS` 列出的通用詞（起始只有「下一步」「影響金額」「關鍵數字」）。下表「截圖」欄的位置描述與強調框是給擷取腳本的註記，不是 `guideLabels` 的字串。
> - 截圖代號 `{area}-{stepKey}`，檔案 `public/guide/{area}/{area}-{stepKey}.webp`，基準 PNG 在 `verification/guide-media/baseline/{area}-{stepKey}.png`；`-m` 結尾是手機 390×844，其餘是 1440×1000。桌機截圖寬度盡量 ≤ 800 CSS px；每張圖都連到原尺寸檔。
> - 「強調框」是擷取時注入的一圈外框（D-V41-20），不改產品。
> - 用詞依 `docs/revamp-v3/GLOSSARY.md` 與 `docs/revamp-v4/GLOSSARY.md`；不寫成效、不點名競品、不用最高級（唯一、最好、最快、最佳、最強、第一名、業界第一；「第一次」「第一項」這類序數可以用）。
> - 文中示範資料的數字（例如「少賺 59.9 萬」）取自 v4.0.0 示範資料的畫面，實作時以截圖當下的畫面為準，不寫死在 `guideLabels`（需要時用 `{ui:…}` 或不寫數字）。

---

## 0 擷取狀態（截圖與影片共用）

全部對著 3100 埠的 PUBLIC_DEMO production 伺服器，固定時間 `FIXED_NOW`＝2026-10-05 10:00（台北），沿用 `verification/revamp-v4-capture/shared.ts` 的 `loadDemo`、`goTo`、`calculateKeepPreset`、`noOverlayStylePath`。本機保存提示（`{ui:storage.autoSave.promptTitle}`）一律按 `{ui:storage.autoSave.decline}`。需要看到手機底部分頁列的截圖（例如 `start-mobile-m`）不套 `noOverlayStylePath`：它會把 `.mobile-tabbar` 設成 `visibility: hidden`（`verification/revamp-v4-capture/shared.ts:69`）。

| 代號 | 狀態 | 怎麼到 |
|---|---|---|
| S0 | 首頁空狀態 | 開 `/`，不載入資料 |
| S1 | 示範資料，預設期間（本期 2026-07-13 到 08-23 對比上期 06-01 到 07-12，各 42 天，全部通路） | `loadDemo` |
| S3 | 匯入精靈（含稅） | S0 按 `{ui:shell.buttons.importData}`，選 `tests/fixtures/inclusive_tax` 三個檔（同 `tests/e2e/import-wizard.spec.ts` 的含稅流程），依步驟停在 1–4 |
| S4 | 有資料問題（缺廣告列） | 匯入精靈套用 `fixtures/errors/missing_ad_day` 三個檔（唯讀） |
| S5 | 4 通路合成資料 | 匯入精靈套用 `tests/fixtures/synthetic-4-channel/`（有商品毛利為負的商品；依 D-V41-21＝A 修改 D-V4-31 的用途限制，通路顯示原代碼 DTC、LIVE、MARKETPLACE、SOCIAL；D-V41-21＝C 時不用，商品頁第 3 步只放文字） |
| S6 | S1＋已試算 | S1 後到假設試算，`calculateKeepPreset`（範本「維持現況」試算），再 `{ui:scenarios.buttons.addScenario}` 一個方案，套用範本「砍廣告一半」並試算（V41-2b 更正：空白的第二個方案只會顯示「尚未試算」，差額圖沒有東西可比） |
| S7 | S6＋待辦與選入會議 | S6 後在通路健檢第一項按 `{ui:actions.buttons.addToActions}`；試算方案按 `{ui:meeting.buttons.selectForMeeting}` |
| S8 | S7＋已結束一次會議 | S7 後在會議紀錄按 `{ui:meeting.buttons.finalizeMeeting}` 並確認 |

S2（原為「示範資料＋目標」）沒有步驟用到，已刪除；代號不重編。S3、S4、S5 的圖說加一句「畫面為虛構的合成資料」（`guide.common.syntheticCaption`；S3 用的 `tests/fixtures/inclusive_tax` 不是示範資料，依 D-V41-21＝A 註明合成資料，V41-2a 審查更正）；S1、S6–S8 用 `guide.common.demoCaption`「畫面為示範資料（虛構）」。

---

## 1 服務介紹（`/guide`）

### 1.0 開頭

- h1（`guide.hub.title`）：服務介紹與使用說明
- 一句話：直接引用 `{ui:brand.description}`，不另寫一句（另寫會重複既有字串，且「變化」在 copy-style 黑名單內）。
- 主要按鈕（`guide.hub.openApp`）：開啟工作台
- 次要連結（`guide.hub.startHere`）：從 30 秒上手開始

### 1.1 為什麼做這套服務（產品口吻）

> **草稿：請使用者改成自己的話。**（D-V41-9＝A 時，使用者提供文字之前用這一版；標題用「為什麼做這套服務」，不用第一人稱）
>
> 依據（只用 repo 記錄的內容）：`docs/PRD.md` 的 Product question；`README.md`「它回答三個問題」；`docs/market-comparison-2026-10-05.md` §1 第 6 點（要取代的是自製 Excel 加手動匯整後台）；`docs/PILOT_PLAN.md`（合成資料不能宣稱成效）。

- 標題（`guide.sections.why`）：為什麼做這套服務
- 第一段（`guide.why.lead`）：淨營收漲了，扣完平台抽成、物流與廣告，到底多賺還是少賺？
- 第二段（`guide.why.body.0`）：電商團隊每週開會，常卡在這一題。平台後台看得到成交金額和廣告 ROAS，平台抽成、商品成本和廣告費卻分散在不同報表；多半要有人把幾個後台的資料貼進 Excel 拼起來，數字被問到時，再回頭翻原始檔。
- 第三段（`guide.why.body.1`）：EC ProfitLens 把這件事做成固定的流程：匯入銷售、通路費用、廣告三份每日報表，用同一套算法一層一層扣到扣廣告後貢獻，比較兩期差在哪裡，再把要做的事帶進週會。每個數字都能點開，看到公式、檔名和行號。
- 狀態句（`guide.why.status`）：示範資料是虛構的合成資料，還沒有真實商家的試用結果，所以這裡只說明它做什麼，不談成效。

### 1.2 我為什麼要開發這套服務？（第一人稱骨架）

> **草稿：請使用者改成自己的話。**（D-V41-9＝B 時用。骨架只有〔〕裡的提示問題，**句子全部由使用者寫，只有使用者填寫的文字會上線**；不提供可以直接上線的第一人稱句子。依 `AGENTS.md:4`，不寫前雇主、公司名或個人經歷）

- 標題（`guide.sections.whyFirstPerson`）：我為什麼要開發這套服務？
- （`guide.whyFirstPerson.origin`）〔你在什麼情況下遇到這個問題〕
- （`guide.whyFirstPerson.problem`）〔你最常遇到、最想回答的問題是什麼〕
- （`guide.whyFirstPerson.before`）〔你當時怎麼做，哪裡最費工〕
- （`guide.whyFirstPerson.intent`）〔你希望這個工具做到什麼〕
- （`guide.whyFirstPerson.status`）〔選填：目前的狀態，例如是否在找願意用自己資料試用的團隊〕

使用者沒填的鍵不放進 `guideLabels`，畫面上也不顯示；〔〕與提示文字一律不上線（`tests/guide-content.test.ts` 斷言 `guideLabels` 不含「〔」「〕」）。

### 1.3 這套服務幫哪些人解決哪些問題？

- 標題（`guide.sections.who`）：這套服務幫哪些人解決哪些問題？
- 引言（`guide.who.lead`）：同一份資料，老闆、主管和執行者看的深度不同；不用切換角色，往下展開就好。

| 誰（`role`） | 想知道（`ask`） | 以前怎麼做（`before`） | 在這裡怎麼做（`after`） | 從哪裡開始（`start`，連到功能區頁，連結文字取功能區標題） |
|---|---|---|---|---|
| 老闆 | 本期多賺還是少賺、差多少、最大一項是什麼。 | 看得到成交金額和廣告 ROAS，扣完費用的結果要等人整理。 | 打開`{ui:shell.nav.overview.headline}`，最上面是`{ui:overview.snapshotUi.heading}`和五個關鍵數字，下面一張瀑布圖拆出兩期差額；會後可以印`{ui:exports.variantsV3.names.boss}`。 | `overview`、`meeting` |
| 主管（行銷、營運） | 差額來自哪個通路、哪一項費用，下一步要調什麼。 | 在幾個後台和 Excel 之間對數字，週會前趕一頁摘要。 | `{ui:shell.nav.diagnosis.headline}`把問題按影響金額排好；`{ui:shell.nav.scenarios.headline}`算出調廣告、折扣或物流費之後，扣廣告後貢獻會差多少；再`{ui:actions.buttons.addToActions}`、在`{ui:shell.nav.meeting.headline}`寫下決議，`{ui:overview.snapshotUi.copy}`。 | `diagnosis`、`products`、`scenarios`、`actions` |
| 執行者（分析、營運助理） | 三份資料對不對，哪個檔、第幾行有問題，某個數字怎麼來的。 | 各平台報表欄位不同，含稅、未稅混在一起；數字被問到時要回頭翻檔案。 | 匯入精靈四步完成，含稅報表換算成未稅；錯誤訊息寫出檔名、第幾行和修法；任何數字都能開`{ui:evidence.sections.evidence}`，看到公式、檔名和行號。 | `import`、`data` |

- 也適合（`guide.who.also`）：也適合代營運與電商顧問（一頁摘要有`{ui:exports.variantsV3.names.client}`），以及需要核對數字的財務人員。
- 小標（`guide.sections.scope`）：適合誰，還沒涵蓋什麼
- 適合（`guide.who.fits`）：適合單一公司、新台幣、賣實體商品，在官網與市集多通路經營的團隊。
- 還沒涵蓋（`guide.who.notYet`）：目前還沒涵蓋訂閱制、服務業、製造成本與多幣別，也沒有廣告歸因與訂單、顧客層級的指標。扣廣告後貢獻還沒扣固定費和所得稅，和公司淨利不同。

### 1.4 這套服務有什麼獨特性？

- 標題（`guide.sections.unique`）：這套服務有什麼獨特性？
- 引言（`guide.unique.lead`）：會算扣廣告後貢獻的工具不少；EC ProfitLens 把重點放在下面幾件事。

| # | 標題（`title`） | 說明（`body`） | 在哪裡看得到（連結） |
|---|---|---|---|
| 1 | 每個數字都查得到出處 | 點任一金額，或圖上的柱、點、格，都能看到公式、組成項目、CSV 檔名與行號；標題下一行是到分的精確值。 | `/guide/evidence` |
| 2 | 兩期差額拆到分 | 九項差額加起來剛好等於扣廣告後貢獻的差額，並附平衡檢核。金額以分為單位精確計算，畫面上的萬、元都從精確值四捨五入。 | `/guide/overview#bridge` |
| 3 | 固定規則健檢，不打分數 | 用固定規則檢查各通路與費用，`{ui:overview.sections.impactLegend}`，資料缺漏排最前；不用健康分數，也不用 AI 自評的信心分數。 | `/guide/diagnosis` |
| 4 | 試算只算你填的假設 | 從這一期的實績出發，填銷量、折扣、物流費、廣告預算的增減，算出單一通路的扣廣告後貢獻；銷量範圍固定在 −90% 到 +100%，不外推、不代填。 | `/guide/scenarios` |
| 5 | 從數字走到週會決定 | `{ui:diagnosis.sections.diagnosisList}`可以`{ui:actions.buttons.addToActions}`，試算方案可以`{ui:meeting.buttons.selectForMeeting}`；`{ui:meeting.buttons.finalizeMeeting}`後紀錄就固定，下次自動和上次比較。匯出格式有 PDF、Excel、PowerPoint、Markdown 與 CSV。 | `/guide/meeting` |
| 6 | 資料留在你的瀏覽器 | 原始 CSV 只在瀏覽器裡處理，免登入、不上傳；要不要`{ui:storage.buttons.saveLocal}`，由你決定。公開示範站不使用 AI，所有計算與健檢照常可用。 | `/guide/export` |
| 7 | 照台灣多通路的習慣設計 | 含稅報表換算成未稅（預設 5%）；內建蝦皮、momo、PChome、91APP、Shopline、Cyberbiz、Meta、Google 的欄位預設，目前只有蝦皮訂單匯出以真實檔驗證，其他請自行確認對照。 | `/guide/import` |

- 小標（`guide.sections.tradeoffs`）：這些做法的代價
- 內容（`guide.tradeoffs.body`）：資料要自己從各平台匯出，訂單明細要先整理成每日資料；沒有自動同步、提醒、多人帳號或手機 App；一次一人操作，開會時共看。

> 第 3 項：v4.0.0 的健檢規則數以 `src/application` 的規則清單為準，文案不寫條數，避免規則增減時過期。第 7 項的來源預設清單與「只有蝦皮訂單驗證過」取自 `README.md`「限制與不做的事」；預設清單改變時要同步。

### 1.5 30 秒上手（說明首頁內；做影片時加 `start-30s`）

- 小標（`guide.sections.quickstart`）：30 秒上手
1. 開啟工作台，按 `{ui:shell.buttons.loadDemo}`。
2. 先讀最上面的 `{ui:overview.snapshotUi.heading}` 與關鍵數字，再看 `{ui:overview.sections.topThree}`。
3. 點任一數字或 `{ui:evidence.buttons.viewEvidence}`，在 `{ui:evidence.sections.evidence}` 看算法、檔名與行號；標題下一行是到分的精確值。
4. 要用自己的資料，看 `{ui:shell.buttons.importData}` 這一頁的說明。

（與 `README.md:17-23`「30 秒試用」同義；README 在 V41-5 改成連到 `/guide`。）

### 1.6 功能區目錄（卡片，依側欄分組）

| 組（標題） | 卡片（標題＋一句） |
|---|---|
| 開始使用（`guide.groups.start`） | 開始使用：看懂畫面與期間（`start`）／`{ui:shell.buttons.importData}`（`import`） |
| `{ui:shell.sidebarV3.groups.results}` | `{ui:shell.nav.overview.headline}`：`{ui:shell.nav.overview.explain}` |
| `{ui:shell.sidebarV3.groups.causes}` | `{ui:shell.nav.diagnosis.headline}`、`{ui:shell.nav.products.headline}`（一句取 `shell.nav.*.explain`） |
| `{ui:shell.sidebarV3.groups.decisions}` | `{ui:shell.nav.scenarios.headline}`、`{ui:shell.nav.actions.headline}`、`{ui:shell.nav.meeting.headline}`與投影 |
| `{ui:shell.sidebarV3.groups.data}` | `{ui:shell.nav.data.headline}` |
| 跨頁工具（`guide.groups.tools`） | `{ui:evidence.sections.evidence}`、`{ui:shell.buttons.basis}`（`evidence`）／匯出、儲存與備份（`export`） |

### 1.7 頁尾與共用字串（說明首頁與功能區頁共用）

- `{ui:shell.sidebar.sidebarNote.demo}`
- `{ui:shell.sidebar.sidebarNote.local}`
- 截圖日期（`guide.common.mediaUpdated`）：截圖是示範資料的畫面，更新於 {date}。（`{date}` 取媒體清單的 `updated`，只有實際更新了媒體時才變）
- 分析啟用時：`{ui:relaunch.analyticsNote}`
- 原尺寸連結（`guide.common.fullSize`，sr-only）：（開啟原尺寸圖）
- 影片說明（`guide.common.videoNote`，V41-3）：影片沒有聲音；下方是影片的逐步文字。

### 1.8 工作台內的入口（`shell.guideV41.*`，放 `labels.zh-TW.ts`）

| key | 字串 | 位置 |
|---|---|---|
| `shell.guideV41.entry` | 使用說明 | 側欄（`nav` 之後）、手機「更多」、頁尾 |
| `shell.guideV41.newTab` | （另開分頁） | 只放可及名稱（sr-only），可見文字不重複 |
| `shell.guideV41.homeHint` | 使用說明：每一頁怎麼用 | 首頁空狀態按鈕列下方 |

空狀態不用問句（`docs/revamp-v3/01_PRD.md` §7.10、`src/components/shell/page-states.tsx:10`）；`tests/guide-content.test.ts` 斷言 `shell.guideV41.*` 不含「？」。

---

## 2 各功能區操作說明（`/guide/{area}`）

每個功能區頁的固定欄位：`guide.areas.{area}.title`（h1）、`.answers`（這頁回答什麼）、`.before`（開始前）、`.steps.{stepKey}.{title,body,alt,caption}`、`.notes[]`（要注意，≤ 3）、`.next[]`（下一步，連結代號）。七頁的功能區標題直接引用 `{ui:shell.nav.*.headline}`。「開始前」只寫 S 代號的頁，實作時寫成使用者要先做的操作並引用介面字串（例如 S1 寫「先在首頁按「`{ui:shell.buttons.loadDemo}`」」）。

### 2.1 開始使用：看懂畫面與期間（`start`）

- 回答什麼：第一次打開工作台，要先看哪裡、怎麼換頁、怎麼換期間。
- 開始前：不需要任何資料。
- 影片（V41-3）：`start-30s`（§3）

**1. `{ui:shell.buttons.loadDemo}`**（`load`）
- 文字：在首頁按 `{ui:shell.buttons.loadDemo}`。右下角會問 `{ui:storage.autoSave.promptTitle}`，先按 `{ui:storage.autoSave.decline}`；之後隨時可以在頂欄 `{ui:shell.buttons.save}` 改。
- 截圖：`start-load`｜S0｜首頁按鈕列到「需要的檔案」表｜強調框：`{ui:shell.buttons.loadDemo}` 按鈕
- alt：首頁的「`{ui:shell.buttons.loadDemo}`」與「`{ui:shell.buttons.importData}`」兩個按鈕，下方是`{ui:empty.stateV3.filesHeading}`。

**2. 認識側欄四組**（`nav`）
- 文字：側欄分成 `{ui:shell.sidebarV3.groups.results}`、`{ui:shell.sidebarV3.groups.causes}`、`{ui:shell.sidebarV3.groups.decisions}`、`{ui:shell.sidebarV3.groups.data}` 四組，由上往下就是一次檢討的順序。
- 截圖：`start-nav`｜S1｜側欄全高｜強調框：四個分組標題
- alt：側欄的四組頁面，從`{ui:shell.nav.overview.headline}`到`{ui:shell.nav.data.headline}`。

**3. 換期間與通路**（`period`）
- 文字：期間列寫著本期對比上期與天數。`{ui:shell.sections.presetGroup}`（例如 `{ui:shell.periods.presets.last4w}`）按一下就套用；要自己選日期，按 `{ui:shell.periodBarV3.custom}`，改好再按 `{ui:shell.buttons.apply}`。`{ui:shell.periodBar.filter.channel}` 可以只看一個通路。
- 截圖：`start-period`｜S1｜期間列中本期、上期與期間快捷那一段（不截整列，寬度 ≤ 800）｜強調框：期間快捷
- alt：期間列，寫著本期與上期的日期、天數，右邊是`{ui:shell.sections.presetGroup}`。

**4. 在手機上換頁與換期間**（`mobile`）
- 文字：手機底部是總覽、健檢、待辦、會議四個分頁，其他頁在 `{ui:shell.mobileNav.more}`。期間收成一個按鈕，按下打開 `{ui:shell.periodBarV3.sheetTitle}`。
- 截圖：`start-mobile-m`｜S1，390｜`{ui:shell.mobileNav.more}` 展開後的畫面（不套 `noOverlayStylePath`，要看得到底部分頁列）｜強調框：更多面板
- alt：手機畫面底部的分頁列，「`{ui:shell.mobileNav.more}`」面板列出其他頁與工具。

- 要注意：資料只在這個瀏覽器分頁裡；重新整理前要保留，請先`{ui:storage.buttons.saveLocal}`或`{ui:storage.buttons.downloadBackup}`（連到 `export`）。
- 下一步：`overview`、`import`

### 2.2 匯入資料（`import`；標題 `{ui:shell.buttons.importData}`）

- 回答什麼：怎麼把自己的三份 CSV 放進來，含稅報表怎麼處理，出錯時怎麼看。
- 開始前：準備三份日粒度 CSV（`{ui:empty.stateV3.fileDescriptions.sales}`；`{ui:empty.stateV3.fileDescriptions.costs}`；`{ui:empty.stateV3.fileDescriptions.ads}`）。空白範本在頂欄 `{ui:shell.topbarV3.export}` 的 `{ui:exports.downloads.templatesHeading}`。訂單明細要先整理成每日資料（連到 `public/docs/ORDER_AGGREGATION.md`）。
- 影片（V41-3）：`import-wizard`（§3）

**1. 選檔**（`files`）
- 文字：按 `{ui:shell.buttons.importData}`，把三份檔案拖進來，或點選檔；系統依檔名自動歸位，看不出來的會請你指定。
- 截圖：`import-files`｜S3 步驟 1｜精靈步驟 1 全區｜強調框：拖放區
- alt：匯入精靈第 1 步，三份檔案已經放進對應的位置。

**2. 對照欄位**（`mapping`）
- 文字：系統先自動對照欄名，已對上的收合起來；你只要確認沒對上的欄。
- 截圖：`import-mapping`｜S3 步驟 2｜欄位對照區｜強調框：未對上的欄（沒有時框住第一個收合列）
- alt：欄位對照，左邊是檔案裡的欄名，右邊是系統要的欄位。

**3. 金額基準與期間**（`basis`）
- 文字：平台報表的金額多半含稅，選 `{ui:importWizard.basis.inclusive}`；系統逐列換算成未稅，原值和換算值都看得到。確認期間後，勾選 `{ui:importWizard.confirmAndCheck}`。
- 截圖：`import-basis`｜S3 步驟 3｜金額基準與期間｜強調框：含稅選項
- alt：金額基準選了含稅，下方是建議的上期與本期。

**4. 檢核與套用**（`review`）
- 文字：看狀態一行與資料問題表：每個問題都有檔名、欄位、原始行號和修法。沒有阻擋的問題就按 `{ui:shell.buttons.apply}`。
- 截圖：`import-review`｜S3 步驟 4｜`[data-testid="import-step-4"]`（同 v4 畫面基準 12）｜強調框：套用按鈕
- alt：第 4 步的檢核結果與對帳表，所有來源都相符。

**5. 有問題時怎麼看**（`issues`）
- 文字：被擋下的檔案會在問題表列出原因與修法；修好原始檔再重新選檔。套用後，問題也會留在 `{ui:shell.nav.data.headline}` 頁。
- 截圖：`import-issues`｜S4 步驟 4｜資料問題表前幾列｜強調框：第一列的檔名與行號
- alt：資料問題表，寫著哪個檔、第幾行少了廣告列。

- 要注意：`{ui:importWizard.privacyNote}` 缺的列不會當成 0，畫面會寫「資料待補」。九個來源預設中，只有蝦皮訂單匯出以真實檔驗證過，其他請自己確認對照。
- 下一步：`data`、`overview`

### 2.3 經營總覽（`overview`；標題 `{ui:shell.nav.overview.headline}`）

- 回答什麼：`{ui:shell.nav.overview.explain}`。
- 開始前：先在首頁按「`{ui:shell.buttons.loadDemo}`」（S1）。

**1. 先讀`{ui:overview.snapshotUi.heading}`與關鍵數字**（`snapshot`）
- 文字：最上面的 `{ui:overview.snapshotUi.heading}` 用一句話說本期多賺或少賺多少；下面五個關鍵數字依序是淨營收、商品毛利、扣廣告前貢獻、扣廣告後貢獻、扣廣告後貢獻率，每個都有上期與差額。
- 截圖：`overview-snapshot`｜S1｜一句話到 KPI 帶（約 1,180 px 寬，超過 800；靠原尺寸連結）｜強調框：本期一句話
- alt：`{ui:shell.nav.overview.headline}`上方，一句話寫本期與上期的差額，下面五個關鍵數字。

**2. 看`{ui:overview.sections.topThree}`**（`top-three`）
- 文字：`{ui:overview.sections.topThree}` 依影響金額列出要先處理的事，按 `{ui:evidence.buttons.viewEvidence}` 或到 `{ui:shell.nav.diagnosis.headline}`。
- 截圖：`overview-top-three`｜S1｜三件事區塊｜強調框：第一項
- alt：`{ui:overview.sections.topThree}`，每一項寫通路、項目和影響金額。

**3. 用瀑布圖看差額從哪裡來**（`bridge`）
- 文字：`{ui:overview.sections.bridge}` 把兩期的扣廣告後貢獻差額拆成九項，加起來剛好等於總差額。圖的標題就是結論；旁邊的表可以逐項核對，點任一柱或數字，打開 `{ui:evidence.sections.evidence}`。
- 截圖：`overview-bridge`｜S1｜貢獻變化拆解整個圖框｜強調框：最長的不利柱
- alt：`{ui:overview.sections.bridge}`的瀑布圖，從上期扣廣告後貢獻一項一項加減到本期。

**4. 看趨勢、各通路與`{ui:overview.sections.assistKpis}`**（`trend`）
- 文字：往下是 `{ui:overview.sections.trend}`、各通路兩期比較與 `{ui:overview.sections.assistKpis}`（含 `{ui:assist.breakevenV3.label}`）。每張圖下方都能展開資料表。
- 截圖：`overview-trend`｜S1｜趨勢圖框（各通路圖框另在原尺寸圖中可見時才一起截；寬度盡量 ≤ 800）｜強調框：無
- alt：`{ui:overview.sections.trend}`的折線圖。

**5. 手機上看瀑布圖**（`bridge-mobile`）
- 文字：手機上拆解表在前，每一項旁邊有一條差額條；瀑布圖可以左右捲動。
- 截圖：`overview-bridge-m`｜S1，390｜拆解表與差額條｜強調框：差額條
- alt：手機上的`{ui:overview.sections.bridge}`表，每一列旁邊有差額條。

- 要注意：差額說明發生了什麼，原因還需要確認；扣廣告後貢獻沒有扣固定費與所得稅，見 `{ui:shell.buttons.basis}`（連到 `evidence`）。`{ui:overview.pnlV3.advancedSummary}` 收在頁面下方。
- 下一步：`diagnosis`、`evidence`

### 2.4 通路健檢（`diagnosis`；標題 `{ui:shell.nav.diagnosis.headline}`）

- 回答什麼：`{ui:shell.nav.diagnosis.explain}`。
- 開始前：S1。

**1. 讀`{ui:diagnosis.sections.diagnosisList}`**（`list`）
- 文字：`{ui:diagnosis.sections.diagnosisList}{ui:overview.sections.impactLegend}`，資料缺漏排最前。每一項寫哪個通路、哪項費用、影響多少，展開看 `{ui:diagnosis.sections.cause}` 與 `{ui:diagnosis.sections.nextStep}`。
- 截圖：`diagnosis-list`｜S1｜健檢結果前三項｜強調框：第一項的影響金額條
- alt：`{ui:shell.nav.diagnosis.headline}`的結果清單，每一項有影響金額條。

**2. 把一項`{ui:actions.buttons.addToActions}`**（`add-action`）
- 文字：決定要追的項目，按 `{ui:actions.buttons.addToActions}`；它會帶著當時的數字與來源進到待辦。
- 截圖：`diagnosis-add-action`｜S1，展開第一項｜展開後的下一步與按鈕｜強調框：加入待辦
- alt：展開的健檢項目，下一步建議下方是「`{ui:actions.buttons.addToActions}`」按鈕。

**3. 看每 100 元淨營收去向**（`share`）
- 文字：`{ui:diagnosis.chartsV4.share.section}` 把每個通路每 100 元淨營收分成商品成本、通路費用合計、廣告費與剩下的錢；虧損的通路超過 100 的部分會標出來。
- 截圖：`diagnosis-share`｜S1｜每 100 元淨營收去向圖框｜強調框：無
- alt：每個通路一條堆疊條，寫著每 100 元扣完廣告剩多少。

**4. 找出哪一天出問題**（`heat`）
- 文字：日 × 通路的月曆熱表標出扣廣告後貢獻為負的日子；用 Tab 進到表裡，方向鍵移動，按 Enter 開當天的明細。
- 截圖：`diagnosis-heat`｜S1｜熱表圖框（標題所指通路的月曆）｜強調框：最差的一格
- alt：各通路每天的扣廣告後貢獻月曆，負的日子有顏色。

- 要注意：可能原因是待確認的假說；健檢用固定規則，不打分數。AI 解釋在公開示範站沒有開啟。
- 下一步：`actions`、`products`

### 2.5 商品毛利（`products`；標題 `{ui:shell.nav.products.headline}`）

- 回答什麼：`{ui:shell.nav.products.explain}`；這一頁只看商品毛利，不分攤平台費和廣告費（`{ui:products.pageV3.description}`）。
- 開始前：S1；第 3 步用 S5。

**1. 看減少最多與增加最多的商品**（`variance`）
- 文字：最上面的圖列出商品毛利兩期差額減少最多與增加最多的商品；旁邊的表是 `{ui:products.sections.productTopBottom}` 前 10 名。
- 截圖：`products-variance`｜S1｜商品毛利兩期差額圖框｜強調框：減少最多的一列
- alt：商品毛利兩期差額圖，上半部是減少最多的商品。

**2. 在完整表裡排序、篩選與匯出**（`table`）
- 文字：`{ui:products.sections.productTable}` 可以用 `{ui:products.pageV3.sortLabel}` 換排序、搜尋商品，`{ui:products.pageV3.exportPage}` 匯出目前顯示的商品。
- 截圖：`products-table`｜S1｜明細表工具列與前幾列｜強調框：排序選單
- alt：`{ui:products.sections.productTable}`，上方是排序、欄位與匯出本頁。

**3. 有商品毛利為負的商品時**（`pareto`）
- 文字：有商品毛利為負的商品時，會多一張累計圖，看前幾個商品佔了多少。
- 截圖：`products-pareto`｜S5（D-V41-21＝A）｜累計圖框｜強調框：無；D-V41-21＝C 時這一步沒有截圖
- alt：商品毛利為負的商品由大到小排列，右側是累計佔比。

- 要注意：這一頁只寫「商品毛利為負」，那是還沒扣通路費用與廣告的結果。
- 下一步：`scenarios`、`overview`

### 2.6 假設試算（`scenarios`；標題 `{ui:shell.nav.scenarios.headline}`）

- 回答什麼：`{ui:shell.nav.scenarios.explain}`。
- 開始前：S1；第 3、4 步用 S6。

**1. 選通路與範本**（`setup`）
- 文字：每個方案針對一個通路。可以從範本開始（`{ui:scenarios.buttons.applyTemplate}`），或按 `{ui:scenarios.buttons.addScenario}`。
- 截圖：`scenarios-setup`｜S1｜方案欄上方｜強調框：新增方案
- alt：`{ui:shell.nav.scenarios.headline}`的方案欄，可以選通路與範本。

**2. 填假設並試算**（`inputs`）
- 文字：填 `{ui:scenarios.inputs.volume.label}`、`{ui:scenarios.inputs.discount.label}`、`{ui:scenarios.inputs.fulfillmentUnit.label}`、`{ui:scenarios.inputs.adSpend.label}` 與 `{ui:scenarios.inputs.oneOff.label}`；不變的填 0（`{ui:scenarios.buttons.fillZero}`）。勾選 `{ui:scenarios.inputs.acceptAssumptions}` 後按 `{ui:scenarios.buttons.calculate}`。
- 截圖：`scenarios-inputs`｜S1，範本 `{ui:scenarios.presets.items.keep.name}` 已帶入｜輸入區與勾選框｜強調框：試算按鈕
- alt：方案的五個假設欄位，下方是確認勾選框與試算按鈕。

**3. 並排比較方案**（`compare`）
- 文字：`{ui:scenarios.chartsV4.variance.section}` 把各方案試算後的扣廣告後貢獻和現況比；方案之間不能相加。
- 截圖：`scenarios-compare`｜S6｜方案差額圖框與比較表｜強調框：無
- alt：各方案試算後與現況的差額長條圖。

**4. 看`{ui:scenarios.sections.scenarioBreakeven}`，再`{ui:meeting.buttons.selectForMeeting}`**（`threshold`）
- 文字：`{ui:scenarios.sections.scenarioBreakeven}` 填三個銷量假設，看兩個門檻落在哪裡；決定要討論的方案按 `{ui:meeting.buttons.selectForMeeting}`。
- 截圖：`scenarios-threshold`｜S6，展開門檻區｜門檻圖與選入會議按鈕｜強調框：選入會議
- alt：兩個門檻與三個假設的位置，橫軸是銷量增減。

- 要注意：這是「如果這樣做會變多少」的試算，不是預測；銷量範圍固定在 −90% 到 +100%，系統不外推、不代填。
- 下一步：`meeting`、`actions`

### 2.7 待辦（`actions`；標題 `{ui:shell.nav.actions.headline}`）

- 回答什麼：`{ui:shell.nav.actions.explain}`。
- 開始前：S7。

**1. 看看板或清單**（`board`）
- 文字：`{ui:actions.sections.actionBoard}` 依狀態排列；可以切到 `{ui:actions.board.viewList}`。頁首的計數條顯示多少項快到期。
- 截圖：`actions-board`｜S7｜看板與頁首計數條｜強調框：看板／清單切換
- alt：`{ui:actions.sections.actionBoard}`，頁首是到期分布的計數條。

**2. 編輯一項待辦**（`edit`）
- 文字：打開一張卡，寫具體動作、負責人、到期日、驗證指標與停止條件；跟廣告有關的可以標 `{ui:actions.adDecisionV3.field}`。
- 截圖：`actions-edit`｜S7，開啟第一張卡｜編輯面板｜強調框：廣告決策
- alt：待辦的編輯面板，有負責人、到期日、停止條件與`{ui:actions.adDecisionV3.field}`。

**3. 置頂最重要的三項**（`pin`）
- 文字：按 `{ui:actions.buttons.pin}`；`{ui:actions.workbench.intro}`
- 截圖：`actions-pin`｜S7｜卡片上的置頂按鈕｜強調框：置頂
- alt：待辦卡片右上角的「`{ui:actions.buttons.pin}`」按鈕。

- 要注意：從 `{ui:diagnosis.sections.diagnosisList}` 或會議決議新增的待辦，會帶著當時的數字；資料更新後可以按 `{ui:actions.buttons.rebind}`。
- 下一步：`meeting`

### 2.8 會議紀錄與投影（`meeting`；標題 `{ui:shell.nav.meeting.headline}`與投影）

- 回答什麼：`{ui:shell.nav.meeting.explain}`。
- 開始前：S7；第 4 步用 S8。
- 影片（V41-3）：`meeting-weekly`（§3）

**1. 照議程開會**（`agenda`）
- 文字：`{ui:meeting.sections.meetingAgenda}` 依會議固定的資料與範圍自動組成；點數字打開 `{ui:evidence.sections.evidence}`。
- 截圖：`meeting-agenda`｜S7｜議程目錄與第 1–2 項｜強調框：議程目錄
- alt：`{ui:shell.nav.meeting.headline}`的議程，左側是議程目錄。

**2. 寫決議**（`decision`）
- 文字：在 `{ui:meeting.sections.meetingDecision}` 寫下這次決定的事；`{ui:meeting.form.decisionNote}`。
- 截圖：`meeting-decision`｜S7｜決議欄位｜強調框：決議
- alt：決議欄位與選入的方案。

**3. 投影給大家看**（`present`）
- 文字：按 `{ui:shell.presentV3.enter}`，字放大、只留結論；在 `{ui:shell.nav.overview.headline}` 與 `{ui:shell.nav.meeting.headline}` 之間可以直接切換，按 Esc 或 `{ui:shell.presentV3.exit}` 離開。
- 截圖：`meeting-present`｜S7，投影中的總覽｜整個視窗（例外：投影本來就是整個畫面，靠原尺寸連結）｜強調框：離開投影
- alt：投影模式中的`{ui:shell.nav.overview.headline}`，只留下結論與瀑布圖。

**4. `{ui:meeting.buttons.finalizeMeeting}`並匯出**（`finalize`）
- 文字：按 `{ui:meeting.buttons.finalizeMeeting}`；`{ui:meeting.page.finalizeHint}` 下次會自動 `{ui:meeting.sections.meetingCompare}`。匯出在頁面的 `{ui:meeting.page.outputs}`。
- 截圖：`meeting-finalize`｜S8｜會議歷史與匯出列｜強調框：匯出
- alt：已結束的會議出現在會議歷史，旁邊是匯出選項。

**5. `{ui:overview.snapshotUi.copy}`**（`copy`）
- 文字：頂欄 `{ui:shell.topbarV3.export}` 的 `{ui:overview.snapshotUi.copy}`：`{ui:exports.menuV3.descriptions.copySummary}`。
- 截圖：`meeting-copy`｜S8｜頂欄匯出選單展開｜強調框：複製週會摘要
- alt：匯出選單中的「`{ui:overview.snapshotUi.copy}`」。

- 要注意：決議由人決定；方案或資料改動後，要先 `{ui:meeting.buttons.updateMeetingSource}` 才能 `{ui:meeting.buttons.finalizeMeeting}`。
- 下一步：`export`、`actions`

### 2.9 資料來源（`data`；標題 `{ui:shell.nav.data.headline}`）

- 回答什麼：`{ui:shell.nav.data.explain}`。
- 開始前：S1；第 2、3 步用 S4。

**1. 確認範圍與金額基準**（`scope`）
- 文字：最上方寫資料涵蓋到哪天、金額基準，`{ui:data.sections.dataScope}` 與 `{ui:data.sections.dataPreprocessing}` 寫匯入時做了哪些換算。
- 截圖：`data-scope`｜S1｜狀態列與範圍區｜強調框：狀態列
- alt：`{ui:shell.nav.data.headline}`頁上方，寫著資料到哪天與金額基準。

**2. 看涵蓋時間軸**（`coverage`）
- 文字：`{ui:data.chartsV4.coverage.section}` 畫出三份檔案各自涵蓋的日期；虛線框是缺列的日子，點一下會篩到問題表。
- 截圖：`data-coverage`｜S4｜涵蓋時間軸圖框｜強調框：缺列框
- alt：涵蓋時間軸，廣告檔有一天缺列，以虛線框標出。

**3. 處理資料問題**（`issues`）
- 文字：`{ui:data.sections.dataIssues}` 列出每個問題的檔名、欄位、行號與修法；`{ui:data.chartsV4.issues.section}` 依檔案和原因分組，點格子就篩選。完整清單按 `{ui:exports.downloads.issuesCsv}`。
- 截圖：`data-issues`｜S4｜問題分布與問題表前幾列｜強調框：下載問題清單 CSV
- alt：問題分布表與資料問題清單。

**4. 預覽來源檔與下載範本**（`preview`）
- 文字：`{ui:data.sections.dataPreview}` 顯示每份檔案的前 10 列，不受期間與通路影響；也可以在這裡下載範本。
- 截圖：`data-preview`｜S1｜來源檔案區｜強調框：無
- alt：`{ui:data.sections.dataPreview}`：每份檔案的前 10 列預覽。

- 要注意：缺的列不會當成 0；缺資料的指標會顯示「資料待補」。
- 下一步：`import`、`evidence`

### 2.10 計算與來源、指標定義（`evidence`；標題 `{ui:evidence.sections.evidence}`、`{ui:shell.buttons.basis}`）

- 回答什麼：某個數字是怎麼算出來的、來自哪個檔哪一行；每個名詞是什麼意思。
- 開始前：S1。

**1. 打開`{ui:evidence.sections.evidence}`**（`drawer`）
- 文字：點任一數字、圖上的柱或格，或按 `{ui:evidence.buttons.viewEvidence}`，右側會打開 `{ui:evidence.sections.evidence}`：標題下一行是到分的精確值，下面是一層一層的算法。
- 截圖：`evidence-drawer`｜S1，開 KPI 帶扣廣告後貢獻（同 v4 畫面基準 03）｜抽屜｜強調框：精確值
- alt：`{ui:evidence.sections.evidence}`抽屜，上方是到分的精確值，下方是算法階梯。

**2. 追到原始明細**（`sources`）
- 文字：`{ui:evidence.ladderNote}` 在 `{ui:evidence.sourcesTitle}` 可以 `{ui:evidence.searchLabel}`，每列寫 CSV 檔名與行號。
- 截圖：`evidence-sources`｜S1，抽屜捲到原始明細｜原始明細表｜強調框：檔名與行號欄
- alt：原始明細表，每列有檔名與行號。

**3. 查`{ui:shell.buttons.basis}`與名詞**（`basis`）
- 文字：頂欄 `{ui:shell.buttons.basis}` 列出九條算法規則，下方的 `{ui:glossary.heading}` 輸入舊名也找得到新名。
- 截圖：`evidence-basis`｜S1，開指標定義｜對話框｜強調框：名詞小辭典
- alt：`{ui:shell.buttons.basis}`對話框，九條規則與`{ui:glossary.heading}`。

- 要注意：AI 不計算任何金額；所有金額由固定的算法計算並有測試。
- 下一步：`overview`、`data`

### 2.11 匯出、儲存與備份（`export`）

- 回答什麼：怎麼把結果帶走、怎麼保留工作、怎麼刪掉這台電腦上的資料。
- 開始前：S7。

**1. 匯出**（`export`）
- 文字：頂欄 `{ui:shell.topbarV3.export}` 分成 `{ui:shell.sections.downloadCurrentView}`、`{ui:meeting.sections.meetingSummary}`、`{ui:shell.sections.downloadDecision}`、`{ui:exports.menuV3.groupMeeting}`、`{ui:exports.downloads.templatesHeading}` 五組；一頁摘要有標準版、`{ui:exports.variantsV3.names.boss}`、`{ui:exports.variantsV3.names.client}`。
- 截圖：`export-menu`｜S7｜匯出選單展開｜強調框：一頁摘要的版本選擇
- alt：匯出選單，分成五組。

**2. `{ui:storage.buttons.saveLocal}`**（`save`）
- 文字：`{ui:shell.buttons.save}` 選單的 `{ui:shell.topbarV3.storageGroups.local}`：勾選同意後，每次修改會自動保存。
- 截圖：`export-save`｜S7｜儲存選單展開｜強調框：本機保存
- alt：儲存選單，分成本機保存、備份檔與危險區。

**3. 下載與讀入備份檔**（`backup`）
- 文字：`{ui:storage.buttons.downloadBackup}` 會把資料、方案、待辦與會議歷史存成一個檔；換電腦時從同一個選單讀入。
- 截圖：`export-backup`｜S7｜備份檔區｜強調框：下載備份檔
- alt：儲存選單的備份檔區。

**4. `{ui:storage.buttons.deleteLocal}`**（`delete`）
- 文字：`{ui:shell.topbarV3.storageGroups.danger}` 的 `{ui:storage.buttons.deleteLocal}` 會刪掉存在這個瀏覽器的副本；已下載的檔案不受影響。
- 截圖：`export-delete`｜S7｜危險區｜強調框：刪除按鈕
- alt：儲存選單的危險區與刪除按鈕。

- 要注意：`{ui:storage.replacement.saveOptionsCaution}`
- 下一步：`meeting`、`start`

---

## 3 示範影片（V41-3；v4.1.0 上線後、D-V41-6＝A 時才做）

1280×800、無聲、≤ 45 秒；字幕 `guide.videos.{id}.cues[]`（每個 cue 一句，與上面步驟文字同義，較短；介面字串一樣用 `{ui:…}`，VTT 與逐字稿都渲染成純文字）；poster 用第一步的截圖。每支影片下方先一行 `guide.common.videoNote`，再用 `<ol>` 列出同一組 cues 當逐字稿（PRD §3.6）；逐字稿就是影片的內容，不另說「與步驟文字相同」。

| id | 放在 | 狀態 | 流程（每一個 cue 一句字幕） |
|---|---|---|---|
| `start-30s` | `/guide`（30 秒上手）、`/guide/start` | S0 → S1 | 按 `{ui:shell.buttons.loadDemo}` → 讀 `{ui:overview.snapshotUi.heading}` 與關鍵數字 → 捲到 `{ui:overview.sections.bridge}` → 點扣廣告後貢獻，打開 `{ui:evidence.sections.evidence}` → 關閉 |
| `import-wizard` | `/guide/import` | S3 | 選三個檔 → 確認欄位對照 → 選含稅、確認期間 → 看檢核結果 → `{ui:shell.buttons.apply}`，回到 `{ui:shell.nav.overview.headline}` |
| `meeting-weekly` | `/guide/meeting` | S1 → S8 | `{ui:shell.nav.diagnosis.headline}` 第一項 `{ui:actions.buttons.addToActions}` → `{ui:shell.nav.scenarios.headline}` 用 `{ui:scenarios.presets.items.keep.name}` 試算並 `{ui:meeting.buttons.selectForMeeting}` → `{ui:shell.nav.meeting.headline}` 寫決議 → `{ui:meeting.buttons.finalizeMeeting}` → 開匯出選單 |

`GUIDE_MEDIA=check` 對影片照流程重跑，在每個 cue 擷取一張 PNG，與 `verification/guide-media/baseline/video/{id}-{cue}.png` 比對；全部 0 差異就不重錄。

---

## 4 字串數與檢查（估計）

| 範圍 | 估計葉節點 | 檔案 |
|---|---|---|
| `guide.hub`、`guide.sections`、`guide.why*`、`guide.who`、`guide.unique`、`guide.tradeoffs`、`guide.common`、`guide.groups` | 約 70 | `src/i18n/guide.zh-TW.ts` |
| `guide.areas.*`（11 頁 × 標題、回答、開始前、約 4 步 × 4 欄、要注意、下一步） | 約 250 | 同上 |
| `guide.videos.*`（3 支 × 約 5 句；V41-3 才加） | 約 15 | 同上 |
| `shell.guideV41.*` | 3 | `src/i18n/labels.zh-TW.ts` |

合計約 340 條。審查時實測本檔草稿的 201 條字串原始 19,282 bytes、gzip 8,122 bytes；全部約 340 條估 gzip 12–15 KB。這就是說明文字不放 `labels.zh-TW.ts` 的原因（那個檔整份進工作台 `/` 的首載，B1 只允許多 1,024 bytes；D-V41-12＝A'）。

全部新字串跑 copy-scan（`{ui:…}` 當佔位符剔除，V41-0 調整 copy-scan 的佔位符規則，`scanLabels` 一併掃 `guideLabels`）：L1（`guide.sections.*`、`guide.areas.*.title`、`guide.areas.*.steps.*.title` 每子句 ≤ 14 字）、同義詞黑名單、`guide.*` 範圍的最高級黑名單 `/唯一|最好|最快|最佳|最強|第一名|業界第一/`；另跑 `tests/guide-content.test.ts` 的重打介面字串檢查。起草時以 repo 的 `scripts/lib/copy-scan.mjs` 試掃本檔 §1–§3 的步驟標題、操作文字、`alt` 與介紹文字（`{ui:…}` 先剔除）：copy-style 指標全部為 0，44 個步驟標題的 L1 都 ≤ 14 字；介紹段 L1 最長是「這套服務幫哪些人解決哪些問題？」14 字。「淨利」只出現在「和公司淨利不同」一句，與 README、指標定義的既有寫法一致。本次把介面字串改成 `{ui:…}` 之後，實作時要以 V41-1 的測試重新確認。
