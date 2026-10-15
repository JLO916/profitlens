# EC ProfitLens v4.1 — 套件說明

v4.1 回應使用者 2026-10-14 的指示：「下一階段優化與強化，優化補充目前版本，新增『服務介紹與使用說明』功能區，內含：我為什麼要開發這套服務？這套服務幫哪些人解決哪些問題？這套服務有什麼獨特性？各功能區段的詳細操作說明與截圖或示範影片」。做法是在工作台旁邊加一個公開、靜態的說明功能區（建議 `/guide`），截圖由腳本從示範資料產生，來源 PNG 當基準提交，每次發版比對、畫面改了才重拍；示範影片排在上線後，使用者明確要時才做（D-V41-6）；另修三項有證據的小問題（過期的分享圖與 README、4 個切頁的 CLS、Next.js 修正版）。**不新增財務口徑、不刪任何功能、不加任何 npm 依賴；工作台 `/` 的首載不變（說明文字放獨立的 `src/i18n/guide.zh-TW.ts`，D-V41-12）。**

這個資料夾是給 Claude Code 讀的工作底稿，也是使用者拍板與人工確認用的產品文件。

| 項目 | 內容 |
|---|---|
| 基準版本 | v4.0.0（tag `v4.0.0`＝`872662d`；`main`＝`59e6f41`，`872662d` 之後只加上線紀錄文件；正式站 https://profitlens-tau.vercel.app 是 v4.0.0） |
| 目標版本 | 依 D-V41-1 建議值暫定 **v4.1.0**（使用者未回覆前不視為核准） |
| 工作分支 | `revamp/v4.1`（已自 `main` 開出；D-V41-2 預設沿用）。**push 任何分支都會由 Vercel Git 整合建 preview，視同部署，沒有當次同意不 push** |
| 狀態 | **全部上線前批次完成，v4.1.0 於 2026-10-15 正式上線（H7 通過；`main`＝`5b40d7f`、tag `v4.1.0`）；V41-3 示範影片完成，v4.1.1 於 2026-10-15 上線（`main`＝`36659ff`、tag `v4.1.1`）；H6 待人工**；D-V41-25＝A：D-V41-1–24 全部依建議值（D-V41-9 用產品口吻草稿，由 Claude 代寫）；CLAUDE.md 已換成 v4.1 版 |
| 產品名稱 | EC ProfitLens；技術識別不改（package 名 `profitlens`、下載檔名前綴 `profitlens-`、備份 schema `profitlens-workspace-v5`、`dataset_id`、網址 `profitlens-tau.vercel.app`） |

## 版本號建議

建議 **v4.1.0**（D-V41-1）：新增使用者看得到的功能區（說明頁與入口）屬次版號；備份、CSV、JSON、PDF、PPT、Excel、Markdown 的格式都不變，沒有破壞性變更，不需要主版號；也不只是修錯，所以不用修正版號。

## 檔案與用途

| 檔案 | 給誰 | 內容 |
|---|---|---|
| `../../CLAUDE.md` | Claude Code | 每個工作階段的規則（補充 `AGENTS.md`，AGENTS.md 優先）。V41-0 開工時以本檔末節「CLAUDE.md 更新草案」整份取代，使用者同意開工後才改 |
| `01_PRD.md` | 使用者＋Claude Code | **規格本體**：決策摘要（§0）、現況與證據（§1）、目標與指標（§2）、說明功能區的位置、頁面結構、內容規則、媒體流程、無障礙、效能、SEO、隱私、labels 與測試（§3）、優化補充三項（§4）、非目標（§5）、風險（§6） |
| `GUIDE_CONTENT.md` | 使用者＋Claude Code | **實際文字草稿**：介紹三段（動機段標「草稿：請使用者改成自己的話」）、30 秒上手、11 個功能區的逐步操作（引用的介面字串路徑、每步的截圖代號、擷取狀態）、3 支影片的流程 |
| `06_BATCHES.md` | Claude Code | V41-0–V41-5 的範圍、依賴、允許變動畫面、驗收重點；人工關卡 H7、H6；護欄與棘輪時程 |
| `09_DECISIONS_PENDING.md` | 使用者 | 拍板表（需要回覆的 19 件、預設沿用的 5 件：選項、建議、影響批次、決定）與需要使用者提供的材料 |
| `../revamp-v4/*` | 參考 | v4 規格與歷史紀錄。v4 PRD 的圖表規範（§7，X26–X40、chart-lint）、v3 PRD 的 X1–X25、§8 語言規範、§9 token 與元件、§11 非功能仍然有效；與 v4.1 衝突時以 v4.1 為準 |
| `../../verification/revamp-v41/` | Claude Code | V41-0 起的基準、清單與每批截圖、量測 `V41-{n}/` |

## 怎麼使用

1. **先看拍板**：`09_DECISIONS_PENDING.md`。擋 V41-0 的是 D-V41-1、12、15；擋 V41-1 的另有 D-V41-4、5、9、10、11、13、19。D-V41-2、3、8、16、23 預設沿用，不需回覆。可以一次回覆「全部依建議值」，或逐項回覆；沒有明確回覆的事項不視為核准。
2. **提供材料**：「我為什麼要開發這套服務？」的 3–6 句自己的話（或回覆「用草稿」），要不要放聯絡管道。這些不擋批次，擋 v4.1.0 正式上線（H7）。
3. **一個工作階段只做一批**：照 `06_BATCHES.md` 的順序，開工時告訴 Claude Code「做 V41-{n}」。Claude Code 每次都先讀 `AGENTS.md`、`CLAUDE.md`、本檔、`06_BATCHES.md` 的該批段落、該批引用的 PRD 章節與 `GUIDE_CONTENT.md` 的對應段落。
4. **每批結束看回報**（格式見本檔「每批回報格式」）；全部檢查通過，才開下一批。
5. **部署**：V41-2b 完成後，可經你當次同意部署 Vercel preview 給 H7 用；正式站到 V41-5 才切（D-V41-24）。**每一次部署（含 preview）都要你當次明確同意；`git push` 任何分支到 origin 都會由 Vercel Git 整合建 preview，同樣要當次同意。**

## 批次順序

| 批次 | 主題 | 大小 | 依賴 | 拍板（擋批） | 另需的人工時間 |
|---|---|---|---|---|---|
| V41-0 | 基準與護欄（不改畫面；含 Next.js 修正版） | M | — | D-V41-1、12、15 | — |
| V41-1 | 說明路由、入口與介紹三段 | M | V41-0 | D-V41-4、5、9、10、11、13、19 | — |
| V41-2a | 媒體管線與前 5 個功能區 | M | V41-1 | D-V41-20、21、22 | — |
| V41-2b | 後 6 個功能區 | M | V41-2a | — | preview（需當次同意）＋H7 約 30 分鐘 |
| V41-4 | 優化補充（分享圖與 README 首圖、CLS） | S | V41-2b | D-V41-14 | — |
| V41-5 | 收尾與上線 | M | V41-0–V41-2b、V41-4、**H7** | D-V41-1、17、18、24 | H6 後補（D-V41-17） |
| V41-3 | 示範影片 3 支（上線後，你明確要影片時才做） | S | V41-5 | D-V41-6＝A、D-V41-7 | — |

- 上線前 6 批、至少 6 個工作階段。依 v4 經驗，M 批約需 2–3 個實作代理與 1–2 個 E2E 代理；本輪沒有圖表與財務計算，量比 v4 的 M 批小。
- **最小可上線範圍**＝V41-0、V41-1、V41-2a、V41-2b、V41-5（說明頁文字與截圖完整）；V41-4 可延後（但 O1 分享圖建議一起上）。V41-3 影片依 D-V41-6 的建議值排在上線後；D-V41-6＝A 時改排在 V41-2b 之後、V41-4 之前。

## 人工關卡（不屬於任何批次）

| 關卡 | 內容 | 擋住 | 材料 |
|---|---|---|---|
| H7 | 介紹文案確認：你本人確認動機段（自己的話或「用草稿」）、幫誰解決什麼、獨特性、聯絡資訊 | v4.1.0 正式上線 | `/guide`（preview 或本機）、`GUIDE_CONTENT.md` §1 |
| H6 | v4 複測與盲評（沿用 v4，上線後補）；加 T5 找到使用說明、T6 照 `/guide/import` 完成匯入 | 依 D-V41-17＝A 不擋 v4.1.0 | `docs/revamp-v4/usability-test.md` |

人工關卡沒完成時，`docs/STATUS.md` 寫「未執行／待人工」，不可寫成完成；批次驗收只放機器能檢查的項目。

## 驗收命令（每批都要全部跑，照這個順序，貼真實輸出摘要；沒執行的寫「未執行」＋原因）

```bash
npm ci                    # 全新環境或 lockfile 變動時（V41-0 升 next 後一定要跑）
npm run typecheck
npm run lint              # eslint --max-warnings=0
npm run audit:ui -- --json verification/revamp-v41/V41-{n}/ui-audit.json
npm run contrast-check
npm test -- --run         # 含 design-lint、copy-style、copy-density、chart-lint、testid-baseline（四份）、mounted-testids、labels-structure、labels-coverage、relaunch、guide-content、guide-routes
npm run build
NETWORK_LOG_OUT=verification/revamp-v41/V41-{n}/network-log.json KEYBOARD_WALK_OUT=verification/revamp-v41/V41-{n}/keyboard-walk.json AXE_OUT=verification/revamp-v41/V41-{n}/axe.json npm run test:e2e
                          # 自己在 3100 埠起 LOCAL 伺服器，必須在下面的 PUBLIC_DEMO 伺服器啟動前跑完

NEXT_TELEMETRY_DISABLED=1 npm run build
APP_MODE=PUBLIC_DEMO PUBLIC_DEMO=true ENABLE_LIVE_AI=false npm start -- --port 3100 &
METRICS_OUT=verification/revamp-v41/V41-{n}/metrics.json FIRST_LOAD_MODULES_OUT=verification/revamp-v41/V41-{n}/first-load-modules.json CAPTURE_BATCH=V41-{n} npx playwright test --config verification/revamp-v41.capture.config.ts
                          # 畫面基準＋metrics（V41-0 建立 config）；不設兩個 *_OUT 時 metrics.spec 會寫到 verification/revamp-v4/V41-{n}/，一定要設
GUIDE_MEDIA=check npx playwright test --config verification/guide-media.config.ts                 # V41-2a 起：與基準 PNG 比對，差異 0 張；不寫檔
node scripts/launch-check.mjs --base http://127.0.0.1:3100 --out verification/revamp-v41/V41-{n}/launch-check-local.json   # V41-1 起
npx -y lighthouse@13.5.0 --version   # 只在第一次：建立 npx 快取
node --no-warnings scripts/lighthouse-pages.mjs --base http://127.0.0.1:3100 --out verification/revamp-v41/V41-{n}   # V41-1 起含說明頁的 navigation（含 SEO）
lsof -ti tcp:3100 | xargs kill      # 停掉 PUBLIC_DEMO 伺服器
lsof -ti tcp:3100                   # 必須沒有輸出

# 財務核心禁區與公開站邊界（D-V41-3；五條都必須為空；不可用 main 比對）
git diff --stat 625bfa5 -- src/domain fixtures docs/METRICS.md
git diff --stat 82b70df -- src/domain fixtures/golden fixtures/demo fixtures/errors fixtures/refund_only fixtures/zero_ad docs/METRICS.md
git diff --stat 625bfa5 -- src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts
git status --porcelain -- src/domain fixtures docs/METRICS.md src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts src/app/api vercel.json src/application/analytics.ts
git diff --stat 872662d -- src/app/api vercel.json src/application/analytics.ts   # v4.1 新增

# commit 之後（完成定義）：兩條都必須為空，commit hash 寫進驗收文件；commit 只留在本機，不 push（push 會建 preview，視同部署）
git diff --stat 625bfa5 HEAD -- src/domain fixtures docs/METRICS.md src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts
git diff --stat 872662d HEAD -- src/app/api vercel.json src/application/analytics.ts
```

- 只有新增媒體或畫面改變時才用 `GUIDE_MEDIA=write`（它只更新比對失敗或新增的媒體，沒變的檔不動）；驗收一律跑 `GUIDE_MEDIA=check`。
- Golden 不變：本期 255.00、差額 −315.00、試算 284.00／264.00／19.70。
- 本機預覽：`npm run dev`，網址 http://127.0.0.1:3000 ；說明頁 http://127.0.0.1:3000/guide 。

## 驗收產物

| 路徑 | 內容 |
|---|---|
| `verification/revamp-v41/V41-0-baseline.md` | v4.0.0（＋O3）基準：`/` 與 404 頁的 First Load、首載 chunk、DOM 節點、390 五個 TBT、8 頁 Lighthouse、axe、keyboard-walk、network-log、`npm audit` 評估、labels 葉節點數、`src/app/**/*.tsx` 掃描結果 |
| `verification/revamp-v41/labels-v4.flat.json` | v4.0.0 `labels.zh-TW.ts` 全部字串葉節點（既有字串逐字核對用） |
| `verification/revamp-v41/testids-v41-added.txt` | v4.1 新增的 testid（V41-0 空檔，之後每批追加） |
| `verification/revamp-v41/feature-retention.csv`、`e2e-text-assertions.csv` | 功能保留（v4 的 155 列沿用為「v4.0.0 已核對；v4.1 未改動」，只重新核對受影響的列＋v4.1 新列）、E2E 文字斷言 |
| `verification/revamp-v41.capture.config.ts` | 畫面基準設定（沿用 `verification/revamp-v4-capture/` 的 spec；基準存 `verification/revamp-v41/V41-{n}/snapshots/`） |
| `verification/guide-media.config.ts`、`verification/guide-media/`、`verification/guide-media/baseline/` | 說明截圖（與影片 cue）的產生、比對與基準 PNG（V41-2a 起；只在畫面改變時更新） |
| `public/guide/**`、`src/application/guide-media.json` | 說明媒體與媒體清單（V41-2a 起；清單只記內容欄位） |
| `verification/revamp-v41/V41-{n}/` | 每批四尺寸截圖、`snapshots/`、`ui-audit.json`、`metrics.json`、`first-load-modules.json`、Lighthouse、`axe.json`、`keyboard-walk.json`、`network-log.json`、`launch-check-local.json` |
| `verification/revamp-v41-V41-{n}-acceptance.md` | 每批驗收文件（含媒體的擷取時間與 commit） |

## 完成定義（每批共用）

- 上面的驗收命令全部真實通過，並附輸出摘要；沒執行的寫「未執行」＋原因。
- 畫面基準只有該批「允許變動畫面」有差異並逐張寫理由；`GUIDE_MEDIA=check`（V41-2a 起）差異 0 張，或有差異時已 `write` 並逐張寫理由。
- `docs/STATUS.md` 新增該批段落；必要時 `docs/DECISIONS.md` 記一筆；驗收寫在 `verification/revamp-v41-V41-{n}-acceptance.md`；`06_BATCHES.md` 進度同步。
- 批次的「驗收重點」逐條標示通過／未通過，未通過的要有原因與補救批次。
- commit 訊息以 `revamp(V41-{n}): …` 開頭；commit 後兩條 diff 為空，commit hash 寫進驗收文件；不 push。
- `feature-retention.csv` 中 `batch` 欄等於本批的列全部打勾。

## 每批回報格式（繁體中文，沿用 CLAUDE.md）

1. 完成項目（對照 `06_BATCHES.md` 的該批範圍，逐項標 完成／部分／未做＋原因）
2. 變更檔案清單（新增／修改／刪除）
3. 驗收命令與真實結果（通過數、失敗數、未執行），含禁區與邊界五條命令與 commit 後的 diff（附 commit hash）、棘輪數值（design-lint、copy-style、copy-density、chart-lint）、testid 刪除數（四份）、`/` 與說明頁的 First Load JS（含 `GUIDE_SENTINELS`）、DOM 節點數、390 的五個 TBT 與 loadavg、說明媒體大小與同步檢查結果、畫面基準差異（只列允許變動的畫面）
4. 瀏覽器驗收方式與截圖路徑（四尺寸至少各一張）
5. 已知限制與風險
6. 下一批建議、被擋住的人工關卡，以及需要人拍板的事項（對照 `09_DECISIONS_PENDING.md`）

## 名詞增補（v4.1；其餘沿用 v3、v4 GLOSSARY）

| 概念 | 用詞 | 不用 | 說明 |
|---|---|---|---|
| 這個功能區 | **服務介紹與使用說明**（頁首 h1）；入口連結寫 **使用說明** | 說明中心、幫助中心、教學、FAQ | 一個功能區兩個名稱：完整名在頁首，短名在入口 |
| 說明的單位 | **功能區** | 模組、章節 | 例如「經營總覽」「匯入資料」各是一個功能區 |
| 快速開始 | **30 秒上手** | 快速入門、新手教學 | 沿用 README「30 秒試用」的意思；說明頁用「上手」強調操作 |
| 影片 | **示範影片** | 教學影片、Demo | 無聲、有字幕與逐字稿；上線後才做（D-V41-6） |
| 截圖上的外框 | 不寫進介面 | — | 只是擷取時的強調，`alt` 寫「框住的是……」 |
| 介紹段落的作者口吻 | 動機段用使用者本人的話；其他段落用產品口吻（「EC ProfitLens 把……」） | 「我們」 | repo 沒有團隊，避免假裝有團隊 |

## 不在本輪範圍（PRD §5）

不改 `src/domain`、fixtures、`contribution-v1`、`assist-kpi-v1`、`breakeven-mer-v1`、`docs/METRICS.md`；不改工作台七頁的版面、功能與文案（入口連結與 CLS 修正除外）；不做互動導覽、說明內搜尋、聊天客服、FAQ、留言、聯絡表單、每頁頁首的「這頁怎麼用」、自動載入示範資料的網址參數；不做旁白、背景音樂、GIF、第三方影片平台；不做結構化資料、多語系、深色模式；不新增分析事件；不改備份、CSV、JSON；不加任何 npm 依賴。F15、F16 仍待使用者提供檔案。

---

## CLAUDE.md 更新草案（V41-0 開工時整份取代；使用者同意開工後才改）

開工時以下列內容**整份取代** `CLAUDE.md`（下方是完整檔案，不是逐段替換）。把拍板日期與結果填入〔〕標示處，填完前不要貼上。

````markdown
# EC ProfitLens — Claude Code 工作指令（v4.1）

EC ProfitLens 是「電商獲利診斷與決策工作台」：匯入三份日粒度 CSV（銷售、通路費用、廣告），依序計算淨營收、商品毛利、扣廣告前貢獻、扣廣告後貢獻四層，做兩期比較、九項金額橋接、規則健檢、假設試算、待辦與會議輸出。所有金額由 `src/domain` 的純函式計算，每個數字可追溯到 CSV 檔名與行號。

產品名稱為 **EC ProfitLens**（D-V3-25）。使用者看得到的名稱一律寫 EC ProfitLens；技術識別不改：package 名 `profitlens`、下載檔名前綴 `profitlens-`、備份 schema 字串、`dataset_id`、網址 `profitlens-tau.vercel.app`。

本輪目標（v4.1，基準 v4.0.0＝tag `v4.0.0`＝commit `872662d`，目標 v4.1.0〔依 D-V41-1 的決定填寫〕）：使用者 2026-10-14 的指示是「下一階段優化與強化，優化補充目前版本，新增『服務介紹與使用說明』功能區，內含：我為什麼要開發這套服務？這套服務幫哪些人解決哪些問題？這套服務有什麼獨特性？各功能區段的詳細操作說明與截圖或示範影片」。**新增公開靜態的說明功能區 `/guide`〔依 D-V41-4〕，截圖由腳本從示範資料產生（來源 PNG 當基準，發版時比對）；示範影片〔依 D-V41-6：上線後才做／本輪做〕；另修三項有證據的小問題（分享圖與 README、4 個切頁的 CLS、Next.js 修正版）。不新增財務口徑、不刪任何功能、不加 npm 依賴、工作台 `/` 的首載不變。** 使用者已於〔日期〕授權依 PRD 開工，D-V41-1–24 的決定（含 5 件預設沿用）見 `docs/revamp-v4.1/09_DECISIONS_PENDING.md`〔填寫：全部依建議值，或列出例外〕。

## 先讀什麼（每個 session 都要）
1. `AGENTS.md` — 專案既有規則，**優先級最高**；本檔只補充，不覆蓋。特別注意 `AGENTS.md:4`：不是履歷頁、行銷落地頁；不包含個人經歷或前雇主資訊。
2. `docs/revamp-v4.1/00_README.md` — v4.1 套件的用法、批次順序、人工關卡、驗收命令。
3. 當批任務：`docs/revamp-v4.1/06_BATCHES.md` 中指定的 V41 批次（含「允許變動畫面」）、該批引用的 `docs/revamp-v4.1/01_PRD.md` 章節，以及 `docs/revamp-v4.1/GUIDE_CONTENT.md` 的對應段落（用 Read 的 offset／limit 讀需要的段落）。
4. 拍板與名詞：`docs/revamp-v4.1/09_DECISIONS_PENDING.md`、`docs/revamp-v4.1/00_README.md` 的名詞增補、`docs/revamp-v4/GLOSSARY.md`、`docs/revamp-v3/GLOSSARY.md`。
5. 財務口徑（只讀）：`docs/METRICS.md`、`docs/DATA_CONTRACT.md`、`docs/SCENARIOS.md`。

v4 套件 `docs/revamp-v4/*` 保留為歷史紀錄；v4 PRD 的圖表規範（§7，含 X26–X40 與 chart-lint）、v3 PRD 的 §5.2 X1–X25、§4.3 刻意不採用、§8 語言規範、§9 token 與元件、§11 非功能仍然有效。與 v4.1 文件衝突時以 v4.1 為準，與 AGENTS.md 衝突時以 AGENTS.md 為準。

## 本輪的硬規則（補充 AGENTS.md）
- **一次只做一個批次（V41-0–V41-5；上線前 6 批，V41-3 影片依 D-V41-6），一批就是一個工作階段，不跨批。** 批次完成前不開始下一批；每批結束要有可運行、全部檢查通過的狀態。批次太大時要在**開工前**拆成 V41-{n}a／b 並寫進 `06_BATCHES.md`。元件、labels、測試與第一個使用它的頁面同批交付。
- **人工關卡不屬於任何批次**：H7（介紹文案確認，使用者本人）擋 v4.1.0 正式上線；H6（v4 複測與盲評，加 T5、T6）依 D-V41-17 上線後補。沒完成時 `docs/STATUS.md` 寫「未執行／待人工」，不可寫成完成。
- **拍板**：以 `docs/revamp-v4.1/09_DECISIONS_PENDING.md` 的「決定」欄為準（預設沿用的 5 件照表上的預設）。之後新出現的待決事項，沒有使用者明確回覆就不視為核准，拍板前沿用 v4.0.0 的行為與用詞。**任何部署（含 Vercel preview）都要使用者當次明確同意**（D-V41-24 只定策略）。**`git push` 任何分支到 origin 都會由 Vercel Git 整合建立 preview，視同部署；沒有使用者當次明確同意不 push（含 `revamp/v4.1`）。**
- **財務核心禁區（沿用 v4，白名單為空）**：`src/domain/*`、`fixtures/*`（只讀，不新增檔）、`metric_version = contribution-v1`、`assist-kpi-v1`、`breakeven-mer-v1`、`docs/METRICS.md` 的公式完全不動；`src/application/assist-kpi.ts`、`src/application/breakeven-mer.ts`、`tests/assist-kpi.test.ts`、`tests/breakeven-mer.test.ts` 一個字都不改。說明頁只呈現示範資料的畫面，不產生任何新數值。
- **公開站邊界（D-V41-3）**：`src/app/api/*`、`vercel.json`、`src/application/analytics.ts` 對 `872662d` 不改（說明頁只呼叫 `analyticsEnabled`）；不碰 `.env*`；`APP_MODE=PUBLIC_DEMO`、`ENABLE_LIVE_AI=false`、`/api/insights` 的 server 端封鎖邏輯不動。每批驗收跑五條命令，結果寫進驗收文件，五條都必須為空；**不可用 `main` 比對**：
  - `git diff --stat 625bfa5 -- src/domain fixtures docs/METRICS.md`
  - `git diff --stat 82b70df -- src/domain fixtures/golden fixtures/demo fixtures/errors fixtures/refund_only fixtures/zero_ad docs/METRICS.md`
  - `git diff --stat 625bfa5 -- src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts`
  - `git status --porcelain -- src/domain fixtures docs/METRICS.md src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts src/app/api vercel.json src/application/analytics.ts`
  - `git diff --stat 872662d -- src/app/api vercel.json src/application/analytics.ts`
  - commit 之後再跑 `git diff --stat 625bfa5 HEAD -- （第一條與第三條的路徑）` 與 `git diff --stat 872662d HEAD -- src/app/api vercel.json src/application/analytics.ts`，必須為空，commit hash 寫進驗收文件
- **工作台不動**：七頁的版面、功能與文案不改；只允許 V41-1 的「使用說明」入口（側欄 `nav` 之後、手機「更多」、首頁空狀態、頁尾，一律 `target="_blank" rel="noopener"`，同分頁換頁會丟掉記憶體裡的資料）與 V41-4 的 CLS 修正。
- **說明頁規範（v4.1 新增，細節見 PRD §3）**：
  - 路由 `src/app/guide/`（`/guide` 與 `/guide/{area}`，`generateStaticParams`、`dynamicParams = false`），全部伺服器元件，共用元件放 `src/components/guide/`（不加 `"use client"`）；**不 import** `src/components/dashboard.tsx`、`src/components/charts/**`、Recharts、pptxgenjs、xlsx；任何 `"use client"` 模組都不 import `@/i18n/guide*`、`@/application/guide`、`@/components/guide/*`。每頁的 metadata 都用 `src/app/guide/metadata.ts` 的 `guideMetadata({ title, description, path })`，回傳完整的 `openGraph`（含 `images: /og.png`、siteName、locale、type）、`twitter` 與 `alternates.canonical`（Next 合併 metadata 時巢狀欄位整組覆蓋，只設 `openGraph.url` 會把根 layout 的分享圖與站名蓋掉；根 layout 的 canonical 是 `/`，不覆寫會全部指回首頁）；sitemap 由 `GUIDE_AREAS` 產生，`tests/relaunch.test.ts` 的 sitemap 斷言同步。
  - 內容：只寫可在產品裡驗證的做法；不寫成效、不寫預測（`docs/PILOT_PLAN.md`）；不點名競品；不用最高級（copy-scan 對 `guide.*` 擋 `/唯一|最好|最快|最佳|最強|第一名|業界第一/`；「第一次」「第一項」這類序數可以用）；不寫作者經歷、前雇主、公司名；動機段只用使用者提供的文字或使用者核可的產品口吻草稿（D-V41-9、10、11）；示範資料一律註明是虛構的合成資料。
  - 媒體：截圖〔與影片〕只由 `verification/guide-media/` 的 Playwright 腳本產生（示範資料與 repo 內既有的合成檔，固定時間 `FIXED_NOW`），不手工截圖、不修圖；來源 PNG 是基準，提交到 `verification/guide-media/baseline/`；公開檔是 WebP（Chromium canvas 品質 0.9）、單張 ≤ 200 KB、每頁合計 ≤ 1.5 MB、桌機截圖寬度盡量 ≤ 800 CSS px、寫 `width`／`height`、首屏以下 `loading="lazy"`；每張圖外包一個連到原尺寸檔的 `<a>`（導覽不是下載）；影片〔依 D-V41-6、7：MP4（H.264，本機 `ffmpeg` 轉檔）／WebM〕無聲、≤ 45 秒、≤ 2 MB、`preload="none"`、不自動播放、不循環、有 `<track kind="captions">`，下方用 `<ol>` 列出同一組 cues 當逐字稿；只放自家網域 `public/guide/`，不嵌第三方平台。不加 PNG／SVG 下載入口。
  - 同步：媒體清單 `src/application/guide-media.json` 只記內容欄位（`id`、檔名、寬高、bytes、基準 PNG 的 SHA-256、`labels_hash`）與 `updated` 日期，擷取時間與 commit 寫進驗收文件；`tests/guide-content.test.ts` 在被引用的介面字串改變時要求重拍；V41-2a 起每批與每次發版跑 `GUIDE_MEDIA=check`（`toHaveScreenshot`，`maxDiffPixels: 0`、`threshold: 0.02`），差異 0 張才能上線；有差異或新增時才 `GUIDE_MEDIA=write`，只更新有差異的媒體，沒變的檔不動；版本號改變不需要重拍。
- **標籤單一來源（D-V41-12＝A'）**：使用者看得到的中文只在兩個檔：工作台（含入口 `shell.guideV41.*` 3 條）在 `src/i18n/labels.zh-TW.ts`；說明頁的所有中文（含 `alt`、`figcaption`、字幕、metadata）在 `src/i18n/guide.zh-TW.ts` 的 `guideLabels`，只給伺服器模組 import（`labels.zh-TW.ts` 會整份進工作台 `/` 的首載，說明文字不能放進去）。`LABEL_GROUPS` 維持 24 組；新 key 只放 `V41_NEW_KEY_PREFIXES` 允許的 `guide.*`（`guide.zh-TW.ts`）與 `shell.guideV41.*`（`labels.zh-TW.ts`），每批在兩個檔加「── V41-n 錨點」註解；labels-structure、copy-scan、ui-audit 涵蓋兩個檔；既有字串一字不改（`verification/revamp-v4/labels-v3.flat.json` 的 2,581 個與 `verification/revamp-v41/labels-v4.flat.json` 的全部葉節點逐鍵逐字相同）；說明文字裡提到的介面字串寫成 `{ui:路徑}` 引用，不重打（`tests/guide-content.test.ts` 擋：`{ui:…}` 之外不得含 `shell.nav.*.headline`、`*.buttons.*`、`*.sections.*` 的值，指標名與 `GUIDE_PLAIN_TERMS` 除外）；`shell.guideV41.*` 不用問句；JSX 內不新寫中文（`src/app/**/*.tsx` 也掃）；指標名一律取 `metricDefinitions`。
- **測試斷言的字串跟著標籤走**：一律 `import { labels } from "@/i18n"`（說明頁另 import `guideLabels`）再斷言；新頁面只用 testid 與 labels 斷言。測試失敗不是「跳過」的理由。
- **顯示格式只在呈現層**（沿用 v4）：萬／億、HALF_UP、U+2212、`favorableDirectionOf`、`formatAxisWan`、`formatHeatCell` 只改 `src/application/presentation.ts`、`copy.ts`。不可為了讓測試過而改 golden 數字（本期 255.00、差額 −315.00、試算 284.00／264.00／19.70）。
- **圖表規範（沿用 v4）**：工作台的圖照 v4 PRD §7 與 X1–X40、chart-lint CL-1–CL-11；說明頁不畫任何圖表（只有截圖），不在說明頁使用 Recharts。
- **棘輪與基準**：`tests/design-lint.test.ts`、`tests/copy-style.test.ts`、`tests/chart-lint.test.ts`、`tests/copy-density.test.ts` 的數值只能下降（design-lint、ui-audit 與 `tests/labels-coverage.test.ts` 的 tsx 範圍含 `src/app/**/*.tsx`）；`tests/testid-baseline.test.ts` 對 `verification/revamp-v3/testids-v2.txt`、`verification/revamp-v4/testids-v3.txt`、`verification/revamp-v4/testids-v4-added.txt`、`verification/revamp-v41/testids-v41-added.txt`（每批追加本批新增的 testid）的刪除數都必須為 0；`tests/mounted-testids.test.tsx` 每批都跑；`verification/revamp-v4-capture/metrics.spec.ts` 的 B2、B3、B5、B9 照 v4 斷言，另加 `/` First Load ≤ V41-0 實測＋1,024 bytes、`GUIDE_SENTINELS` 在 `/` 首載 chunk 出現 0 次（V41-1 起）、說明頁 First Load ≤ 框架基準（404 頁）＋5,120 bytes，執行時一定要設 `METRICS_OUT`、`FIRST_LOAD_MODULES_OUT` 指到 `verification/revamp-v41/V41-{n}/`；390 五個 TBT 依 D-V4-36、D-V4-47；畫面基準每批先複製前一批的 `snapshots/` 再比對，只允許該批「允許變動畫面」有差異；`verification/revamp-v41/feature-retention.csv` 沿用的 v4 列寫「v4.0.0 已核對；v4.1 未改動」，`batch` 欄等於本批的列（v4.1 新列與重新核對的殼層、O2 列）全部打勾，V41-5 只確認這些列。
- **依賴**：本輪「允許新增 npm 依賴」清單為**空**。只有 D-V41-15＝A 時把既有的 `next`、`eslint-config-next` 升到 `16.3.8`（精確版號）；`ffmpeg` 只在 D-V41-7＝A 時當本機轉檔工具，不進 `package.json`。其他依賴變動（含只動 lockfile 的傳遞依賴，例如 `source-map-js`）一律先問。
- **隱私與公開站邊界不變**：不加登入、資料庫、伺服器端保存；原始 CSV 不上傳；說明頁沒有輸入、上傳、表單，不讀寫 `localStorage`，不呼叫 `/api/*`；分析只記既有的頁面瀏覽與事件名，不新增事件（D-V41-23）；說明頁頁尾在分析啟用時顯示既有的揭露句；`network-log.spec` 的下載集合不變（原尺寸連結是導覽，不是下載）。
- **可追溯性不變**：工作台每個金額都能開「計算與來源」；說明頁的截圖只是畫面，不是 number-link。
- **a11y 與 testid 不退步**：既有 `data-testid`、`aria-*`、`role="status"`、`<details>/<summary>` 結構保留。新 testid 用 `guide-hub`、`guide-area-{area}`、`guide-step-{area}-{stepKey}`、`guide-shot-{mediaId}`、`guide-video-{videoId}`、`guide-toc`、`guide-entry-{sidebar|more|home|footer}`，不用陣列索引。說明頁標題層級不跳級、每張圖有 `guideLabels` 來的 `alt`、原尺寸連結的可及名稱＝`alt`＋`guide.common.fullSize`、影片有字幕與逐字稿；任何 Tab 停留點都不在 `[aria-hidden=true]` 內。Lighthouse Accessibility 不低於同頁基準且 ≥ 95（說明頁目標 100）；四尺寸 axe 0 個 serious。
- **程式風格**：沿用既有風格（Tailwind v4 + `globals.css` 自訂 class、長行 JSX）。只改動需要的區塊；新樣式用 `.guide-*` 並引用 `:root` token，不寫死色碼、不加字級種類；新 token 同批加進 `scripts/contrast-check.mjs` 的 PAIRS。
- **避免過度微調**（使用者 2026-10-13）：審查只修 blocker、major；nit 只記錄；不加規格以外的調整。
- **文件同步**：每批結束更新 `docs/STATUS.md`（真實執行結果；未執行寫「未執行」）、必要時在 `docs/DECISIONS.md` 加一筆、把本批驗收寫到 `verification/revamp-v41-V41-{n}-acceptance.md`，截圖與量測存 `verification/revamp-v41/V41-{n}/`；`06_BATCHES.md` 的進度欄同步。

## 驗收命令（每批都要全部跑，照這個順序，貼真實輸出摘要）
```bash
npm ci                 # 全新環境或 lockfile 變動時
npm run typecheck
npm run lint           # eslint --max-warnings=0
npm run audit:ui -- --json verification/revamp-v41/V41-{n}/ui-audit.json
npm run contrast-check
npm test -- --run      # 含 design-lint、copy-style、copy-density、chart-lint、testid-baseline（四份）、mounted-testids、labels-structure、labels-coverage、relaunch、guide-content、guide-routes
npm run build
NETWORK_LOG_OUT=verification/revamp-v41/V41-{n}/network-log.json KEYBOARD_WALK_OUT=verification/revamp-v41/V41-{n}/keyboard-walk.json AXE_OUT=verification/revamp-v41/V41-{n}/axe.json npm run test:e2e
                       # 自己在 3100 埠起 LOCAL 伺服器，必須在下面的 PUBLIC_DEMO 伺服器啟動前跑完
NEXT_TELEMETRY_DISABLED=1 npm run build
APP_MODE=PUBLIC_DEMO PUBLIC_DEMO=true ENABLE_LIVE_AI=false npm start -- --port 3100 &
METRICS_OUT=verification/revamp-v41/V41-{n}/metrics.json FIRST_LOAD_MODULES_OUT=verification/revamp-v41/V41-{n}/first-load-modules.json CAPTURE_BATCH=V41-{n} npx playwright test --config verification/revamp-v41.capture.config.ts
GUIDE_MEDIA=check npx playwright test --config verification/guide-media.config.ts   # V41-2a 起；差異 0 張
node scripts/launch-check.mjs --base http://127.0.0.1:3100 --out verification/revamp-v41/V41-{n}/launch-check-local.json   # V41-1 起
npx -y lighthouse@13.5.0 --version   # 只在第一次：建立 npx 快取
node --no-warnings scripts/lighthouse-pages.mjs --base http://127.0.0.1:3100 --out verification/revamp-v41/V41-{n}
lsof -ti tcp:3100 | xargs kill   # 停掉 PUBLIC_DEMO 伺服器；之後 lsof -ti tcp:3100 必須沒有輸出
git diff --stat 625bfa5 -- src/domain fixtures docs/METRICS.md
git diff --stat 82b70df -- src/domain fixtures/golden fixtures/demo fixtures/errors fixtures/refund_only fixtures/zero_ad docs/METRICS.md
git diff --stat 625bfa5 -- src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts
git status --porcelain -- src/domain fixtures docs/METRICS.md src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts src/app/api vercel.json src/application/analytics.ts
git diff --stat 872662d -- src/app/api vercel.json src/application/analytics.ts
# commit 之後：git diff --stat 625bfa5 HEAD -- （第一條與第三條的路徑）與 git diff --stat 872662d HEAD -- src/app/api vercel.json src/application/analytics.ts，都必須為空，commit hash 寫進驗收文件；不 push
```
本機預覽：`npm run dev`，網址 http://127.0.0.1:3000 （說明頁 `/guide`）。E2E 的四種視窗：1440×1000、1280×900、768×1024、390×844。

## 每批回報格式（繁體中文）
1. 完成項目（對照 `docs/revamp-v4.1/06_BATCHES.md` 的該批範圍，逐項標 完成／部分／未做＋原因）
2. 變更檔案清單（新增／修改／刪除）
3. 驗收命令與真實結果（通過數、失敗數、未執行），含禁區與邊界五條命令與 commit 後的 diff（附 commit hash）、棘輪數值（design-lint、copy-style、copy-density、chart-lint）、testid 刪除數（四份）、`/` 與說明頁的 First Load JS（含 `GUIDE_SENTINELS`）、DOM 節點數、390 的五個 TBT 與 loadavg、說明媒體大小與同步檢查結果、畫面基準差異（只列允許變動的畫面）
4. 瀏覽器驗收方式與截圖路徑（四尺寸至少各一張）
5. 已知限制與風險
6. 下一批建議、被擋住的人工關卡，以及需要人拍板的事項（對照 `docs/revamp-v4.1/09_DECISIONS_PENDING.md`）

## 檔案地圖（本輪會碰到的）
| 位置 | 內容 | v4.1 批次 |
|---|---|---|
| `src/app/guide/layout.tsx`、`page.tsx`、`metadata.ts`、`[area]/page.tsx`（新） | 說明首頁與功能區頁（伺服器元件、靜態產生）；`guideMetadata()` 給完整 openGraph、twitter、canonical | V41-1、V41-2a |
| `src/components/guide/`（新） | `guide-text`（`{ui:…}`：步驟內文粗體、其他純文字）、`guide-card-list`、`guide-step`（含原尺寸連結）、`guide-toc`、`guide-video` | V41-1、V41-2a、V41-3 |
| `src/i18n/guide.zh-TW.ts`（新） | `guideLabels`：說明頁的全部中文（只給伺服器模組 import） | V41-1 起每批 |
| `src/application/guide.ts`（新） | `GUIDE_AREAS`（代號、分組、步驟、`mediaId`）、`resolveUiRefs()`（只給伺服器模組 import） | V41-1 起 |
| `src/application/guide-media.json`（新）、`public/guide/**`（新）、`verification/guide-media/baseline/**`（新） | 媒體清單（只記內容欄位）、截圖與影片、字幕、基準 PNG | V41-2a 起 |
| `src/app/sitemap.ts`、`tests/relaunch.test.ts` | 加說明頁網址（由 `GUIDE_AREAS` 產生）；sitemap 斷言改成 `[SITE_URL, SITE_URL/guide, …]` | V41-1 起 |
| `src/components/shell/shell-frame.tsx`、`page-chrome.tsx`、`page-states.tsx` | 「使用說明」入口（側欄、更多、頁尾、首頁空狀態） | V41-1 |
| `src/i18n/labels.zh-TW.ts` | 只加 `shell.guideV41.*` 3 條；`LABEL_GROUPS` 不變 | V41-1 |
| `src/app/globals.css` | `.guide-*` 樣式（只用既有 token） | V41-1 起 |
| `tests/labels-structure.test.ts`、`verification/revamp-v41/labels-v4.flat.json` | `V41_NEW_KEY_PREFIXES`（兩個檔）、v4.0.0 字串快照 | V41-0、V41-1 |
| `scripts/lib/copy-scan.mjs`、`scripts/ui-audit.mjs` | `guide.*` 標題列入 L1；`guide.*` 最高級黑名單；`scanLabels` 一併掃 `guideLabels` | V41-0 |
| `scripts/lib/ui-scan.mjs`、`tests/labels-coverage.test.ts` | tsx 範圍擴到 `src/app/**/*.tsx` | V41-0 |
| `tests/testid-baseline.test.ts`、`verification/revamp-v41/testids-v41-added.txt` | 第四份 testid 基準 | V41-0 起 |
| `tests/guide-content.test.ts`、`tests/guide-routes.test.tsx`、`tests/e2e/guide.spec.ts`（新） | 說明內容與媒體同步、重打字串、路由與 import 邊界、metadata、四尺寸 E2E | V41-1 起 |
| `verification/revamp-v41.capture.config.ts`（新）、`verification/revamp-v4-capture/metrics.spec.ts` | 畫面基準（64 張）、First Load 量測、`GUIDE_SENTINELS`（輸出用 `METRICS_OUT`、`FIRST_LOAD_MODULES_OUT`） | V41-0 起 |
| `verification/guide-media.config.ts`、`verification/guide-media/`（新） | 說明媒體的比對與產生（`GUIDE_MEDIA=check|write`） | V41-2a 起 |
| `tests/fixtures/synthetic-4-channel/README.md` | 用途段加「說明頁截圖」（D-V41-21 修改 D-V4-31） | V41-2a |
| `scripts/launch-check.mjs` | 補充檢查：sitemap 含說明頁、`/guide` 200 與 og:image、未知功能區 404 | V41-1 |
| `scripts/lighthouse-pages.mjs`、`tests/e2e/keyboard-walk.spec.ts`、`tests/e2e/axe-sweep.spec.ts` | 加說明頁（Lighthouse 另跑 navigation，含 SEO） | V41-1、V41-2a、V41-3 |
| `scripts/make-og.mjs`、`public/og.png`、`docs/images/overview-1440-v4.png`（新） | 分享圖與 README 首圖換成目前畫面；`SOURCE.sidebar` 改 220 | V41-4 |
| 工作台中 CLS 超標的切頁（商品毛利、資料來源、待辦） | O2 修正（只在一批內能修好時） | V41-4 |
| `package.json`、`package-lock.json` | `next`、`eslint-config-next` 16.3.8（D-V41-15）；版本 4.1.0 | V41-0、V41-5 |
| `README.md`、`docs/RELEASES.md`、`docs/ENGINEERING.md`、`tests/release-notes.test.ts` | 發布紀錄、首圖、`/guide` 連結 | V41-4、V41-5 |
| `docs/revamp-v4.1/*` | v4.1 規格、內容、批次、拍板、套件說明 | 每批對照與更新進度 |
````
