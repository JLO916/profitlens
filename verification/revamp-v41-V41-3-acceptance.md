# v4.1 V41-3 驗收：示範影片與 v4.1.1（2026-10-15）

v4.1.0 上線後，使用者 2026-10-15 回覆：

1. 「source-map-js 修正、製作示範影片含字幕」：同意 lockfile 修正，並要影片。D-V41-6 因此由 B 改成 A，D-V41-7＝A、D-V41-8 沿用。
2. 「好，影片做完後部署正式上線」：當次同意部署，並選定版本 4.1.1。

| 步驟 | commit | 內容 |
|---|---|---|
| 依賴修正 | `5072879` | source-map-js 1.2.1 → 1.2.2，只改 lockfile 這一個項目 |
| 開工錨點 | `b4177bc` | D-V41-6 改 A；`GUIDE_VIDEOS`（三支影片、各 5 個 cue、放置頁） |
| 實作 A：錄影管線 | `0410c37` | `video.spec.ts`、`vtt.ts`（`buildVtt`）、ffmpeg 轉檔、cue 比對基準 15 張、poster 3 張、清單加 `videos`、guide-content 影片同步檢查 |
| 實作 B：播放元件與字幕 | `c4942ee` | `guide-video.tsx`、`guide.videos.*` 字幕文字、`guide.common.videoNote`、放置、測試 |
| 整合 | `c151097`、`0823caa`、`1808ead` | 合併兩支分支；逐段抽影格比對，改寫 4 句字幕；只重寫 `.vtt` 與 labels_hash，不重錄 |
| 審查 | — | 四個面向（規格、字幕內容、影片品質、無障礙／測試／效能），major 2 項，見 §4 |
| 審查修正 | `23ba6a2` | 影片圖說加資料來源註記；axe-sweep 加有影片的功能區頁 |
| 驗收修正 | `9530a5c` | 影片 poster 縮到 800×500（§2 Lighthouse） |
| v4.1.1 發布文件 | `da978ae` | 版本 4.1.1；RELEASES v4.1.1 段、README、ENGINEERING、release-notes 測試；審查 0 項 major |
| 發布 commit | `36659ff` | 驗收證據與本文件上線前的部分；`main` 與 tag `v4.1.1` 指向這個 commit |

## 1. 完成項目

| 06 項目 | 狀態 | 說明 |
|---|---|---|
| 1 三支影片 | 完成 | Playwright 錄影（1280×800），本機 ffmpeg 轉 MP4（H.264、無音軌、`+faststart`）；每個 cue 開始時用片頭片尾的對時色塊記錄時間點 |
| 2 字幕與 poster | 完成 | `guide.videos.{id}.cues` → `public/guide/video/{id}.vtt`（`buildVtt` 是唯一來源）；poster 取第一個 cue 的畫面，縮到 800×500 再轉 WebP |
| 3 播放元件 | 完成 | `<video controls preload="none" playsInline poster>`、MP4 `<source>`、預設開啟的中文字幕 `<track kind="captions" srclang="zh-Hant-TW">`；不自動播放、不循環。<br>影片下方先一行「影片沒有聲音；下方是影片的逐步文字。」，再用 `<ol>` 列出同一組字幕當逐字稿，另加資料來源註記。<br>放在說明首頁「30 秒上手」4 步之後，以及 start、import、meeting 三頁的步驟之前 |
| 4 清單與同步檢查 | 完成 | 清單加 `videos`；單元測試檢查：<br>• 檔案存在、MP4 ≤ 2 MB、mvhd 長度 ≤ 45 秒且與清單相符、H.264、無音軌、faststart。<br>• cue 基準 PNG 的 SHA-256；`.vtt` 等於 `buildVtt` 的輸出、段數等於 cue 數。<br>• 沒有孤兒檔；labels_hash。<br>`GUIDE_MEDIA=check` 照流程重跑、每個 cue 比對；`write` 在 cue 都相同時不重錄 |

**三支影片**：

| 影片 | 放在 | 長度 | MP4 | poster | cue（開始，ms） |
|---|---|---|---|---|---|
| start-30s | `/guide`「30 秒上手」、`/guide/start` | 25.6 秒 | 706,627 bytes | 47,408 bytes | 載入 0、本期一句話 5,027、貢獻變化拆解 10,531、計算與來源 15,552、關閉 20,576 |
| import-wizard | `/guide/import` | 27.6 秒 | 549,898 bytes | 28,220 bytes | 選檔 0、對照欄位 5,503、金額基準 10,807、檢核 16,702、套用 21,710 |
| meeting-weekly | `/guide/meeting` | 33.7 秒 | 1,133,113 bytes | 20,490 bytes | 加入待辦 0、試算並選入會議 6,233、決議 15,402、結束會議 20,479、匯出 27,467 |

- **畫面上的提示**：Playwright 錄影沒有滑鼠游標，所以每次點擊前，目標上會先出現約 0.8 秒的強調框。
- **資料**：import-wizard 用 `tests/fixtures/inclusive_tax`，圖說註明「畫面為虛構的合成資料」；另外兩支是示範資料。

## 2. 驗收命令與結果（程式 `9530a5c`；發布 commit 只多文件與證據）

| 命令 | 結果 |
|---|---|
| `npm run typecheck`、`npm run lint` | exit 0 |
| `npm run audit:ui -- --json verification/revamp-v41/V41-3/ui-audit.json` | hex 0、字級 11（不變）、JSX 中文 0、元件字串常值中文 0 |
| `npm run contrast-check` | 85／85 |
| `npm test -- --run` | **166 檔、3,557 個測試全過**（含 v4.1.1 發布文件後） |
| `npm run build` | exit 0 |
| `npm run test:e2e`（帶 `NETWORK_LOG_OUT`、`KEYBOARD_WALK_OUT`、`AXE_OUT`、`GUIDE_SHOTS_OUT`） | **1,143 passed、0 failed、29 skipped（34.8 分鐘）**（`23ba6a2`）；poster 修正後重跑 guide.spec 與 axe-sweep 76 passed、0 failed；跑完都已還原 E2E 改寫的追蹤檔 |
| `CAPTURE_BATCH=V41-3` | **38 passed、0 failed**，64 張全部 0 差異：影片在「30 秒上手」，位置在首屏以下，所以 15 也沒變 |
| `GUIDE_MEDIA=check` × 2 | 兩次都 47／47 通過：44 張截圖，加上 3 支影片共 15 個 cue 比對；poster 修正後再連兩次，也都 47／47 |
| `GUIDE_MEDIA=write` | 47 項都是 unchanged，影片不重錄，`git status` 沒有任何變動。poster 修正那次只重做 3 張 poster（影片不重錄）；之後再跑一次，沒有改任何檔 |
| launch-check（本機 PUBLIC_DEMO） | 13 項全部通過，補充 14 項全部通過；`/guide/video/start-30s.mp4` 回 200、`video/mp4`，`.vtt` 回 `text/vtt` |
| Lighthouse × 3 | 390 TBT 五項通過；說明頁 a11y、SEO 100；`/guide` 在 390 的 Performance 98–99（v4.1.0 是 100），見下方 |
| 禁區與邊界五條 | 都是空的 |
| `package.json`、`package-lock.json` | 依賴修正只改 source-map-js 一個項目；版本號只改三個 version 欄位 |

**量測**：

- **First Load JS**：`/` 是 519,702，`/guide` 與 11 個功能區頁都是 131,465，與 v4.1.0 相同。
  - 影片元件是伺服器元件，不增加頁面 JS。
  - source-map-js 只在 build 時處理 CSS，產物大小不變。
- **axe**：desktop、laptop、tablet 各 28 個狀態，mobile 26 個，全部 0 問題。
  - 多的 3 個是 start、import、meeting 三頁。
  - video-caption 規則通過。
- **keyboard-walk**：
  - `/guide`：影片控制在第 27 步，main 內 40 個停留點。
  - `/guide/start`：影片控制在第 6 步，在第一個步驟（第 9 步）之前。
  - 兩頁都沒有 `aria-hidden` 內的停留點。
- **network-log**：工作台走查沒有請求任何 `/guide/` 或 `/guide/video/`；下載 5 種、沒有 POST。
- **E2E 影片檢查**（4 頁 × 4 尺寸）：
  - 載入、捲動、按 Tab 時都沒有下載 MP4（`preload="none"`）。
  - 不自動播放、不循環；字幕軌預設顯示，內容與逐字稿 `<ol>` 相同。
  - 原生控制可以用 Tab 到達，也離得開。

**Lighthouse**：每次開跑前最多等 30 分鐘、負載 < 2.5。

**第一組三次**（`23ba6a2`，poster 1280×800；開跑負載 2.25、2.48、2.32）：

- 390 TBT 五項都通過：1,054.5／796.9／91.7／974.9／11.9。
- `/guide` 在 390 的 Performance 98、98、98，LCP 2,328／2,328／2,478 ms。v4.1.0（V41-5）是 100、約 1,870 ms。
- 原因：「30 秒上手」影片的 poster（97 KB）在頁面載入時一起下載。它雖然在首屏以下，但在 Lighthouse 模擬的慢速網路下，與 CSS、JS 搶頻寬。

**poster 縮到 800×500 之後重跑三次**（`9530a5c`；開跑負載 2.33、2.39、2.20）：

| 步驟（390 TBT，ms） | 第 1 次 | 第 2 次 | 第 3 次 | 中位數 | 門檻 |
|---|---|---|---|---|---|
| 載入示範資料 | 1,033.6 | 1,052.8 | 1,029.4 | **1,033.6** | 1,109.1 |
| 健檢 | 807.5 | 815.6 | 845.7 | **815.6** | 832.3 |
| 商品 | 87.6 | 87.1 | 88.7 | **87.6** | 129.9 |
| 會議 | 980.0 | 1,015.6 | 957.2 | **980.0** | 1,071.2 |
| 資料來源 | 16.4 | 13.4 | 10.0 | **13.4** | 50.0 |

| 頁面 | 尺寸 | Accessibility | Performance | SEO | CLS | LCP |
|---|---|---|---|---|---|---|
| `/guide` | 1440 | 100 | 100 | 100 | 0 | 502–506 ms |
| `/guide` | 390 | 100 | 98、98、99 | 100 | 0 | 2,326／2,321／1,953 ms |
| `/guide/overview` | 1440 | 100 | 100 | 100 | 0 | 521–523 ms |
| `/guide/overview` | 390 | 100 | 98 | 100 | 0 | 2,472–2,476 ms（與 v4.1.0 相同） |

- **工作台**：a11y 三次都是全部 100；首頁 Performance 1440 是 100、390 是 94–95；所有切頁 CLS ≤ 0.002；預先載入的 chunk 都沒有落入量測區間。
- **`/guide` 的判定**：390 的 Performance 由 100 降到 98–99，仍高於門檻 90，LCP 也在 2.5 秒以內。
  - 原因是規格要求的影片 poster：poster 屬性沒有延後載入。
  - 要完全回到 100，只能拿掉 poster，或用用戶端 JS 延後載入。兩者都不符規格：PRD §3.5 要 poster，說明頁不加用戶端 JS。
  - 所以 poster 縮到 800×500 之後，就記為已知差異，不再調整。
- **證據**：`lighthouse-runs/before-poster-run{1,2,3}-metrics.json` 是第一組，`run1`、`run2` 是重跑的第 1、2 次，`metrics.json` 是重跑的第 3 次。

## 3. npm audit（依賴修正之後）

high 9 → 8，source-map-js 已解決（`verification/revamp-v41/V41-3/npm-audit-after-source-map-js.json`）。剩下 8 項是 V41-0 已評估的：`xlsx`、`pptxgenjs`／`image-size`、`eslint-config-next` 鏈（`@next/eslint-plugin-next`、`fast-glob`、`micromatch`、`braces`），以及 `eslint-config-next` 本身。這些沒有修正版或修正是降版，本站只用寫出 API，或只在開發時使用。

## 4. 審查

影片批次由四個面向審查，只報 blocker、major，共 2 項，`23ba6a2` 都修正：

1. **axe-sweep 沒有涵蓋有影片的功能區頁**：06 護欄表寫「V41-3 加有影片的頁」。已加 start、import、meeting 三頁，狀態數 25／23 → 28／26，都是 0。
2. **影片圖說沒有註明資料是虛構的**：截圖都有這句，影片沒有；import-wizard 的畫面是合成資料。已在影片圖說加上與截圖相同的註記。

**整合時另外改的**：逐段抽影格，對照字幕和畫面，改寫 4 句。例如：

- 計算與來源那一段畫面只看得到算法與精確值，看不到檔名與行號。
- 決議是用選單選「採用」，不是打字。

v4.1.1 發布文件另由一位審查看過，0 項 major。

**nit 只記錄**，主要有：

- start-30s 的 poster 是載入後的總覽畫面，影片本身從空的首頁開始。
- 影片沒有滑鼠游標，改用強調框提示要點的位置。

## 5. 已知限制

- 重錄影片需要本機 `ffmpeg`（不在 `package.json`）；`GUIDE_MEDIA=check` 不需要。
- 影片沒有聲音，靠字幕與逐字稿說明。
- `/guide` 在 390 的 Lighthouse Performance 是 98–99（v4.1.0 是 100）：影片 poster 在載入時一起下載，已縮到 800×500。
- 其餘同 v4.1.0：H6 與匯出開檔檢查待人工；Skew Protection 沒有開。

## 6. 上線（使用者 2026-10-15 當次同意「影片做完後部署正式上線」，版本 4.1.1）

- **推送**：`main` 從 `9bc2241` fast-forward 到 `36659ff` 並推送；同時推送分支 `revamp/v4.1`（另建一個 preview）。commit 之後的禁區與邊界 diff 都是空的。
- **部署**：
  - 由 Vercel Git 整合部署：`dpl_9Fy3evkGfJUcStEci3YaKnr6Z8X2`，target production，READY；`profitlens-tau.vercel.app` 指向它，來源是 `main` @ `36659ff`。
  - `/api/insights` 回 `PUBLIC_DEMO`。
- **tag**：annotated tag `v4.1.1` 指向 `36659ff`，已推送。
- **正式站檢查**：
  - 13 項 HTTP 全部通過，補充 14 項也全部通過，`live_ai_called: false`（`verification/revamp-v41/V41-3/launch-check-production.json`）。
  - 正式站送出的檔：
    - `start-30s.mp4` 706,627 bytes、`video/mp4`。
    - `meeting-weekly.mp4` 1,133,113 bytes。
    - `.vtt` 是 `text/vtt`。
    - poster `start-30s-poster.webp` 47,408 bytes。
- **瀏覽器**：無頭 Chromium，1440 與 390（`verification/revamp-v41/V41-3/production-video-check.json`）：
  - `/guide`、`/guide/start`、`/guide/import`、`/guide/meeting` 的影片都是 `preload="none"`、不自動播放、不循環。
  - 字幕軌 `captions:zh-Hant-TW` 預設顯示，逐字稿 5 段。
  - 開頁並捲到底，都沒有下載 MP4。
  - scrollWidth 等於視窗寬，沒有 page error。
  - 說明首頁 11 張卡、工作台入口另開分頁、原分頁資料仍在。
- **上線後的文件 commit**：README 改成「正式站已是 v4.1.1」、RELEASES 補正式站檢查一行、本節、STATUS、DECISIONS、06／README 進度。推送後，正式站用同樣的程式重建一次，比照 v4.1.0。
- **沒有做**：Skew Protection（D-V41-16，使用者決定）；H6 與匯出開檔檢查待人工。
