# v4.2 V42-G1 驗收：說明首頁改寫（插入批；使用者 2026-10-20 提供改寫稿；2026-10-22）

使用者 2026-10-20 貼出 Claude Docs 文件「EC ProfitLens /guide 改寫稿（行銷角度）」並指示「依以上網站內容改寫稿的方向原則與內容，修改網站內相關的文案段落」。這是使用者本人提供的文字（D-V41-10／11：介紹與動機段可用使用者提供的文字），不在 v4.2 原規劃內，依 CLAUDE.md 的規則當成插入批 V42-G1 處理：範圍只有說明首頁 `/guide`，不碰工作台與 `src/application`。拍板見 `docs/revamp-v4.2/09_DECISIONS_PENDING.md` 的「V42-G1 新出現的待決事項」（D-V42-32、33；依建議值）。

| 步驟 | commit | 內容 |
|---|---|---|
| 盤點（唯讀） | — | M1：說明首頁的結構、鍵與護欄（`g1-map-structure.md`）；M2：改寫稿約 76 條產品事實逐條對照程式與文件（`g1-facts.md`）：0 條不屬實、5 條部分屬實（見 §4） |
| 實作 | `9cda00f` | `guide.zh-TW.ts` 的 hub 到 quickstart 整段重寫（改值 15、新增 31、刪除 15）；`src/app/guide/page.tsx` 的獨特性改成 3 主張＋1 前提與「刻意不做的事」；新 `src/components/guide/guide-hub-data.ts`（純資料：主張的連結常數）；`labels-structure` 的 V42-G1 例外護欄與例外快照 `verification/revamp-v42/labels-guide-rewrite.flat.json`；guide-content、guide-routes 測試；06、09、DECISIONS |
| 審查 | — | 兩個面向（文案、規則、事實；結構、a11y、護欄、測試），major 2、nit 11，見 §5 |
| 審查修正 | `a297175` | `guide.unique.lead` 恢復改寫稿的兩個引述問句（沒有護欄要求說明頁字串不用問號）；06 進度欄改成「程式完成／收尾未執行」；STATUS、00_README 補列 |
| 主流程 | 見 §2 | 合併（在 V42-1a 之後）、說明頁 E2E、畫面基準 15 × 4、媒體比對、launch-check、Lighthouse、對比；驗收文件、進度 |

## 1. 完成項目（對照改寫稿）

| 改寫稿段落 | 狀態 | 說明 |
|---|---|---|
| 頁首副標、meta description | 完成 | `guide.hub.intro` 改成改寫稿的一句（原本引用 `brand.description`，D-V42-32）；`guide.hub.description` 改寫；H1 與兩顆按鈕不動 |
| 目錄第 3 項 | 不改 | 改寫稿標為「可考慮」；維持「這套服務有什麼獨特性？」（主流程決定） |
| 為什麼做這套服務 | 完成 | 三段照改寫稿；末段「最快的方法是載入示範資料」改成「直接載入示範資料」（說明頁最高級黑名單）；第一句（`why.lead`）不變，仍是 `GUIDE_SENTINELS` |
| 幫哪些人解決哪些問題 | 完成 | 三個角色的「以前怎麼做」「在這裡怎麼做」照改寫稿；「想知道」與「從哪裡開始」的連結與現狀相同；代營運與財務一句照改寫稿；「適合誰，還沒涵蓋什麼」原文不動 |
| 有什麼獨特性 | 完成 | 7 項改成 3 主張（每個數字都經得起追問；工具不替你下判斷；檢討直接開在工作台上，數字一路走到決議）＋1 前提（為台灣多通路電商設計，資料不離開你的電腦），每項固定四段：一般做法／在這裡／對你的意義／在哪裡看得到（連到功能區頁） |
| 這些做法的代價 → 刻意不做的事 | 完成 | 小標「我們刻意不做的事」改成「刻意不做的事」（文案黑名單「我們」上限 0；內文「EC ProfitLens 放掉了幾項便利」照原稿）；三點與末句照改寫稿；「有整理工具說明」的連結改成「相關說明：匯入資料」（說明首頁只能連 `/` 與 `/guide/{area}`；訂單彙總說明在匯入資料頁的「開始前」） |
| 30 秒上手 | 完成 | 只加第一行「不用登入、不用準備資料；示範資料是虛構的合成資料。」；四步與影片不動 |
| 各功能區索引、頁尾、影片 | 不動 | 照改寫稿 |

**改寫稿被改掉的字句與理由**（審查者逐段對照後確認其餘逐字相同）：

1. 「最快的方法是載入示範資料」→「直接載入示範資料」：說明頁最高級黑名單。
2. 「我們刻意不做的事」→「刻意不做的事」：語氣黑名單「我們」。
3. 「健檢結果一鍵加入待辦」→「健檢結果可以直接加入待辦」：語氣黑名單「一鍵」。
4. 「（有整理工具說明 → /docs/ORDER_AGGREGATION.md）」→「（整理工具的說明在匯入資料這一頁）」＋「相關說明：匯入資料」連結：箭頭棘輪 0；說明首頁的連結白名單。
5. 老闆「後台只有成交金額和廣告 ROAS」→「後台看得到成交金額和廣告 ROAS」：對第三方後台的絕對句，產品內無法驗證。
6. 執行者「欄位自動對照」→「欄位由系統先對照、你再確認」：只有欄名完全符合標準時才自動對照，其餘標「請確認」。
7. 「要賣到多少才打平」→「才打平（扣廣告後貢獻 = 0）」：畫面上的寫法。
8. 「決定有沒有兌現，下週開會時自動對帳」→「決定做到哪裡，下次開會時自動列出上次決議與置頂待辦的狀態」：系統不判斷兌現；「對帳」站內專指金額對帳。
9. 「匯出 PDF、Excel、PowerPoint、Markdown、CSV」→「匯出成 PDF、…」：「匯出 PDF」逐字是按鈕名，說明頁不得重打介面字串。
10. 「經營總覽的貢獻變化拆解」的連結文字＝功能區標題「經營總覽」，href 仍是 `/guide/overview#bridge`。
11. 兩處破折號「——」改成逗號；19 處介面字串改成 `{ui:…}` 引用（渲染後同字；「最上面一句話」因此渲染成「最上面的本期一句話」）。
12. 「這怎麼來的？」「所以要怎麼做？」兩個引述問句：實作時曾改成陳述句，審查指出沒有護欄要求，已恢復改寫稿原文。

**只記錄不改**（M2 的 nit）：「客戶追問時站得住」「這裡不會滿意」「不用申請帳號，30 秒就能用示範資料試」。

## 2. 驗收命令與結果（程式 `a297175`，併入 `91c8621`；收尾 commit 只加文件與證據）

| 命令 | 結果 |
|---|---|
| `npm run typecheck`、`npm run lint` | exit 0（實作與修正各跑一次） |
| `npm run audit:ui` | copy 16 項與 V42-0 相同（blacklistSynonym 12、blacklistTone 0、arrows 0、l1ClauseOverLimit 0）；JSX 中文 0 |
| `npm run contrast-check` | 85／85 |
| `npm test -- --run` | **172 檔、3,628 個測試全過**（合併後；比 V42-1a 多 6 個：labels-structure 5、guide-routes 1） |
| `npm run build` | exit 0（LOCAL 與 PUBLIC_DEMO 各一次） |
| 說明頁 E2E（guide.spec、axe-sweep、keyboard-walk） | 實作分支（3103 埠）：83 通過、0 失敗、9 略過（keyboard-walk 既有的尺寸限制）；axe guide-hub 四尺寸 0；主檢出完整 E2E **1,143 passed、0 failed、29 skipped（35.0 分鐘）**；axe 四尺寸 28／28／28／26 個狀態全部 0；keyboard-walk 的說明頁里程碑照舊（開啟工作台、目錄第一項、影片控制） |
| `CAPTURE_BATCH=V42-G1` | 第一輪 34 passed、4 failed：差異正好是允許的 15 說明首頁 × 4；以 `--update-snapshots=changed` 更新後重跑 **38 passed、0 failed**，64 張 0 差異 |
| `GUIDE_MEDIA=check` | 47／47，0 差異（媒體的 labels_hash 只雜湊功能區步驟，說明首頁文字不在其中） |
| launch-check（本機 PUBLIC_DEMO） | 13 項全部通過，補充 19 項全部通過（`guide-metadata` 以新的 meta description 比對） |
| Lighthouse × 3 | 說明頁 `/guide`、`/guide/overview` 的 a11y、SEO 三次都 100；Performance 1440 都 100，390 是 98–100；CLS 0；LCP 1440 約 0.5 秒、390 1.9–2.5 秒（與 v4.1.2 相同）。工作台（本批未改）390 TBT 五項中位數 1,016.9／783.9／87.0／963.5／12.8，都在門檻內且回到 V42-0 的水準——同一份程式含 V42-1a 的改動，所以 V42-1a 驗收時高出的 20–60 ms 是主機負載，不是程式 |
| 禁區與邊界五條 | 都是空的；本批對 `src/application`、`src/components/dashboard.tsx` 等工作台檔案的 diff 為空（只動 `src/i18n/guide.zh-TW.ts`、`src/app/guide/page.tsx`、新檔 `src/components/guide/guide-hub-data.ts`） |

**量測**：

- **First Load JS**：`/` 521,487（與 V42-1a 相同；本批不碰工作台）；`/guide` 與 11 個功能區頁都是 131,466（說明頁沒有新增用戶端 JS，HTML 變長不影響 First Load）；`GUIDE_SENTINELS`（`guide.hub.title`、`guide.why.lead`）在 `/` 首載 chunk 0 次，對照組 1 次。
- **axe**：28／28／28／26 個狀態，全部 0（含 guide-hub 四尺寸）。
- **keyboard-walk**（`/guide`）：開啟工作台 @1、本頁目錄第一項 @3、影片控制 @32，與 V42-1a 相同；`aria-hidden` 內的停留點 0。
- **network-log**：下載集合 5 種、非 GET 0（工作台未改）。

## 3. 畫面基準

基準自 `verification/revamp-v42/V42-1a/snapshots/` 複製。`CAPTURE_BATCH=V42-G1` 第一輪：34 passed、4 failed，展開到單張，差異正好是 **15 說明首頁 × 4 尺寸**（desktop、laptop、tablet、mobile），其餘 60 張 0 差異，符合本批的「允許變動畫面」。以 `--update-snapshots=changed` 只更新這 4 張後重跑：**38 passed、0 failed**。

| 尺寸 | 差異原因 |
|---|---|
| 15 × 4 | 副標改寫（兩行）、「為什麼做這套服務」三段與末段改寫；首屏以下的三主張與「刻意不做的事」不在首屏截圖內 |

**瀏覽器驗收截圖**（四尺寸整頁，`verification/revamp-v42/V42-G1/screens/`）：`guide-hub-desktop-1440.png`、`guide-hub-laptop-1280.png`、`guide-hub-tablet-768.png`、`guide-hub-mobile-390.png`；`summary.json` 記每個尺寸的 h2／h3、頁高、無橫向捲動、功能區連結數。

## 4. 事實核對（M2）

約 76 條產品事實逐條對照程式、labels 與文件（`g1-facts.md`）：0 條不屬實；5 條部分屬實，都已依 §1 的清單改寫（欄位自動對照、才打平、自動對帳、後台只有、一鍵）。原本的 8 條誠實揭露（示範資料虛構、只有蝦皮實檔驗證、未扣固定費與所得稅、示範站不用 AI、不預測、不打分數、目前還沒有真實商家的試用結果、資料不上傳）全部保留。

## 5. 審查

major（2 件，`a297175` 修正）：

1. `guide.unique.lead` 把改寫稿的兩個引述問句改成陳述句，沒有護欄要求這樣做，是不必要的偏離：已恢復原文。
2. 06 批次總表寫「完成」但收尾未執行、STATUS 與 00_README 沒有這一批：改成「程式完成／收尾未執行」並補列（本文件完成後再改為完成）。

nit 只記錄（11 項），例如：

- `src/application/guide.ts` 的 `GUIDE_UNIQUE`（v4.1 的 7 項）變成沒有頁面讀取的死資料（本批不碰 `src/application`）；之後碰到 `src/application` 的批次順手移除，`tests/guide-content.test.ts` 的長度 7 斷言一併拿掉。
- `labels-structure` 的 V42-G1 護欄把 guideLabels 葉節點數寫死 337，V42-5 加說明頁新步驟時要改。
- `.guide-where` 兩條 CSS 規則不再被使用。
- 三個主張用 `.guide-summary`、前提卡用 `.guide-role dl`，欄名字級略有不同。
- 「在哪裡看得到」的「經營總覽」連到 `#bridge`、角色卡的「經營總覽」連到頁首，同一可及名稱兩個目標（v4.1 已如此）。
- `boss.after` 因 `{ui:overview.snapshotUi.heading}` 渲染成「最上面的本期一句話說本期多賺…」（「本期」出現兩次）。

## 6. 已知限制與風險

- 說明首頁的字串由 V42-0 的快照護欄凍結，本批用例外清單（46 鍵改值或新增＋15 鍵刪除）與例外快照放行並重新凍結；之後再改說明首頁要再開一次例外。
- 使用者原稿中的三處說法（「客戶追問時站得住」「這裡不會滿意」「30 秒就能用示範資料試」）照原文保留；若要更保守可再調。
- 這一頁是公開站的內容，要上線需使用者當次同意部署；建議先看 preview。

## 7. 下一批

回到 v4.2 的順序：V42-1b。
