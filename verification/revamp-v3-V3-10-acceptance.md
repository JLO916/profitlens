# Revamp v3 V3-10 驗收：上線檢查（2026-10-08）

依 `docs/revamp-v3/06_BATCHES.md` V3-10 與 PRD §2.3 A／B／C、§11.3（隱私）、§11.5（標籤單一來源）、§11.7（testid）、§11.8（備份相容）、`docs/revamp/08_RELAUNCH.md` §4（R7 的上線檢查清單）。H2／H3 依使用者 2026-10-07 指示略過；**H4（5 人可用性複測與外部盲評）未執行、待人工**；**正式站**：使用者 2026-10-08 指示「推送正式站」後，推送 `revamp/v2` 並以 `vercel deploy --prod` 部署（deployment `dpl_GP2qy7fpFdWdkhQQE7uyYpEuXdAa`，https://profitlens-tau.vercel.app），正式站檢查通過（§3c）；同日使用者拍板 `main` fast-forward 合併並推送、Git 整合重建正式站並複檢通過（§3d）、tag `v3.0.0` 已打（指向 625bfa5）。

工作方式：開工錨點 `418f307` → 三個 worktree 代理並行（A labels 舊 key alias 移除 `1f87f4d`、B 版本 3.0.0／會議頁可及名稱／RELEASES／README `89b22d9`、C 上線檢查工具／匯出大小調查 `d427581`）→ 合併 → 接線 `8493723` → E2E 代理對共用伺服器驗證全部 spec 並執行新檢查 → 全套 E2E → 本機 production 的 13 項 HTTP、網路紀錄、鍵盤走查、axe、備份矩陣、四尺寸截圖、Lighthouse → 本文件。

## 1. 完成項目（對照 06_BATCHES V3-10）

| 項目 | 狀態 | 說明 |
|---|---|---|
| 移除 labels 舊 key alias（§11.5；V3-2c 的 alias 本批移除） | 完成 | labels 頂層從 52 個區段變成 24 個新分組（LABEL_GROUPS）；v2 舊鍵 alias 區段、`ui` 物件、`LEGACY_SECTIONS`、`LEGACY_PREFIXES`、`legacyAliases` 全部移除；對照表留在 `tests/fixtures/labels-legacy-map.json`（2,094 個葉路徑：搬家 1,585、同路徑 509；65 個整棵子樹）。消費端以 AST codemod 改路徑（186 檔 3,213 處＋歷史 spec 8 檔 76 處，註解 84 處；手動處理物件層級用法 24 處；src 70 檔、單元測試 72 檔、E2E 44 檔、量測 spec 11 檔、scripts 8 檔）；刪 alias 後 tsc 138 個錯誤收斂到 0。字串不變的證明：移除前後 24 個分組攤平後 2,578 個葉節點逐位元組相同；copy-scan 指標逐項相同；`labels-unused.mjs` 輸出逐位元組相同。`tests/labels-structure.test.ts` 改成「V3-2b 快照經對照表對到新路徑，一對一相同」。grep 驗收：`labels.ui／emptyState／sections／buttons／status／downloads／nav／notes／csvColumns…` 舊路徑在 src、tests、verification 為 0 |
| 版本 3.0.0 | 完成 | `package.json`／`package-lock.json` 3.0.0；README「最新」改 v3.0.0（尚未發布）；ENGINEERING 版本與備份版本敘述對齊 |
| RELEASES（含破壞性變更：Excel 工作表改名）、README | 完成 | `docs/RELEASES.md` v3.0.0 段（給使用者／不變的事／破壞性變更：Excel 工作表改名（行動→待辦、口徑→指標定義、新增管理損益表）、備份 v5、分析 CSV 的 breakeven_mer 列、決策 CSV 的 ad_decision 欄、匯出版頭四行、名詞改名／已知限制／驗收連結；日期「尚未發布（待 H4 與正式站檢查）」，正式站部署後改為 2026-10-08）；README「最新」改 v3.0.0（正式站當時仍是 v2.0.0，部署後改寫）、功能一覽與 30 秒試用對齊 v3、新截圖 `docs/images/overview-1440-v3.png`；`docs/ENGINEERING.md` 版本與備份 v5；`tests/release-notes.test.ts`（13 條） |
| 會議紀錄頁 Lighthouse `label-content-name-mismatch`（V3-7 起 10 個節點） | 完成（10 → 0） | 議程 1 的六個 number-link 與精簡通路表的格子，可及名稱改成 `fill(labels.meeting.pageV3.linkAria, { title, value })`＝「{抽屜標題} {可見文字}，看明細」；收尾再把完整通路寬表（`overview.channelsV3.wideAmountAria`）與三件事影響金額（`overview.alerts.impactAria`）改成同句型；代理 B 以 axe 與 Lighthouse 13.5.0（dev）量會議紀錄頁 label-content-name-mismatch 0 個節點、accessibility 100 |
| Lighthouse（本機 production 與正式站，1440 與 390） | 完成（本機與正式站） | 1440 與 390 各 6 個快照步驟 accessibility 全部 100；**失敗審核 0**（會議紀錄頁的 `label-content-name-mismatch` 從 10 個節點降到 0）；首頁 performance 1440＝100、390＝92（V3-9b 100／94；v2 基準 100／93，目標 ≥ 90 且 ≥ 基準−3；390 的 TBT 1,667 ms（V3-9b 972）受本機負載影響，CLS 不變：載入示範資料 1440＝0、390＝0.001）。流程報告 `verification/revamp-v3/V3-10/lighthouse/` |
| 四尺寸走查 | 完成（截圖＋E2E 四專案） | 四尺寸截圖 36 張（`verification/revamp-v3/V3-10/snapshots/`）＋ E2E 四專案（revamp-r1-layout、present-mode 四尺寸全跑；其餘 desktop 與 mobile）＋ 08 §4 第 4 條的操作路徑由 `network-log.spec`（首頁 → 示範 → 抽屜 → 匯入 golden → 匯出 CSV／Excel／PPT／PDF／決策 JSON／備份 → 會議紀錄）與既有 spec 覆蓋 |
| 鍵盤走查 | 完成 | `keyboard-walk.spec`（desktop 1440、mobile 390；`keyboard-walk.json`）：到第一個主要結果的 Tab 數——總覽 11／4（KPI 前可見控制 10／3）、健檢 8／2、商品最差卡 9／3（商品表第一列 57／51）、試算基準 11／5、範本 16／10、「試算」30／24（範本到試算 14 步；D-V3-27 待拍板）、待辦 12／6、會議議程 1 26／19、資料來源 10／4；整頁停留點 90／77、69／59、378／372、34／28、13／7、47／40、25／19；焦點不可見 0、焦點陷阱 0、掉回 body 0；Esc 回焦（抽屜、匯出選單、投影模式）通過；PRD §11.1 只用鍵盤流程（到 KPI、加入待辦、改狀態、回匯出、下載決策 CSV）desktop 24／12／15／10／2、mobile 11／10／9／4／2，都下載到決策 CSV |
| axe 四尺寸 | 完成 | axe-core 4.13.0（`axe-sweep.spec`，`axe.json`）：desktop／laptop／tablet 各 11 個畫面狀態、mobile 10 個（含首頁空狀態、7 頁、抽屜、精靈步驟 1、投影模式），serious 0、critical 0、moderate 0、minor 0；純 DOM 檢查每頁一個 h1、標題不跳級、無名控制 0、重複 id 0、缺 alt 0。代理 C 在 dev 上曾量到 KPI 卡差額連結的 target-size serious（desktop／laptop／tablet 各 1），接線修正後 production 為 0 |
| v1–v5 備份還原 | 完成 | `backup-restore-matrix.test.ts`（`backup-matrix.json`）16／16：golden 與 demo 各 v1–v5 五個信封＋R0 前實際的四個 v3 備份檔，14 列全部還原成功、classification valid；golden 255.00／−315.00、試算 284.00；demo 1,269,792.73／−598,833.95；ad_decision v1–v4 為空、v5 為 pause；v1–v3 的側邊資料為空、v4／v5 讀回；再匯出都是 v5、金額不變 |
| 網路紀錄（確認沒有資料外送） | 完成 | `network-log.spec`（desktop 與 mobile，`network-log.json`；只記網址、方法、資源類型、本文長度與雜湊、狀態碼）：整個流程各 15 個請求（document 1、stylesheet 2、script 10、fetch 2），外部來源 0、非 GET 0、原始 CSV 探針命中 0、4xx／5xx 0、console error 0；匯入 golden 時 0 個請求；/api/insights 只有 GET（available=false）；下載大小 分析 CSV 356,738、Excel 22,913、PPT 85,016、決策 JSON 204,397、備份 266,782 bytes |
| 13 項 HTTP 上線檢查（本機 production 與正式站） | 完成（本機 13／13；正式站 13／13） | `scripts/launch-check.mjs`：LOCAL 伺服器 11／13（第 7、8 項 /api/insights 的 reason 與 403 只在 PUBLIC_DEMO 成立）＋補充檢查 10／10（`launch-check-local.json`）；PUBLIC_DEMO 伺服器 13／13 通過＋補充 10／10（第 7 項 GET /api/insights available=false、reason PUBLIC_DEMO；第 8 項 POST 403；/api/* no-store、nosniff、無 X-Powered-By、靜態資源 immutable；安全標頭只記錄，正式站由 Vercel 補 HSTS）（`launch-check-public-demo.json`） |
| 決策匯出大小調查（V3-9a 已知問題） | 完成（調查） | 示範資料加入 1 個待辦後：決策 CSV 84,075,372 bytes（569 列）、JSON 33.2 MB、Markdown 18.7 MB（試算頁開過後 104.6／50.6／27.2 MB）；分析 CSV 39.8 MB。主因是每列都帶完整 `source_refs`（CSV 的 85%：59 列 metadata 列各帶 1,848 個來源；待辦每欄一列各帶 1.44 MB）。不改輸出位元組的優化只省時間與記憶體；行號區間＋不重複可縮到 0.88 MB（−98.9%）但改語意。報告 `verification/revamp-v3/V3-10/export-size.md`；建議 A＋C（D-V3-36） |
| STATUS 收尾、H4 | H4 未執行／待人工 | `docs/STATUS.md` 寫「未執行／待人工」 |
| F15／F16 | 未做（延後） | 需使用者提供檔案 |

## 2. 變更檔案

- 新增：`docs/images/overview-1440-v3.png`、`scripts/launch-check.mjs`、`tests/backup-restore-matrix.test.ts`、`tests/e2e/axe-sweep.spec.ts`、`tests/e2e/keyboard-walk.spec.ts`、`tests/e2e/launch-helpers-v310.ts`、`tests/e2e/network-log.spec.ts`、`tests/fixtures/labels-legacy-map.json`、`tests/release-notes.test.ts`、`verification/revamp-v3/V3-10/README.md`、`verification/revamp-v3/V3-10/axe.json`、`verification/revamp-v3/V3-10/backup-matrix.json`、`verification/revamp-v3/V3-10/export-size.md`、`verification/revamp-v3/V3-10/keyboard-walk.json`、`verification/revamp-v3/V3-10/launch-check-local.json`、`verification/revamp-v3/V3-10/network-log.json`。
- 修改（215 檔）：docs 2、root 3、scripts 8、src 71、src/i18n 2、tests 74、tests/e2e 44、verification 11；其中 labels 舊 key alias 移除改到 src 70 檔、單元測試 72 檔、E2E 44 檔、量測與歷史 spec 11 檔、scripts 8 檔（只換路徑）。完整清單見 `git diff --name-status 418f307..HEAD`。
- 零改動：`src/domain`、`fixtures`、`docs/METRICS.md`、`.env*`、`vercel.json`。

## 3. 驗收命令與真實結果

| 命令 | 結果 |
|---|---|
| `npm ci` | pass（14 秒；lockfile 只有 version 欄變動） |
| `npm run typecheck` | pass |
| `npm run lint` | 0 warnings |
| `npm run audit:ui` | hex 0（token 定義區 23）、圓角 4、字級 11（不含列印 8）、字距 0、rotate 0、JSX 箭頭 3、eyebrow 0、裝飾字元 0、CSS content 0、JSX 中文 0、字串常值中文 0；labels「注意：」0、箭頭 0、同義詞 12、禁用詞 0（白名單見 §5） |
| `npm run contrast-check` | 75／75 通過 |
| `npm test -- --run` | **123 檔／2,418 測試全過（27 秒）** |
| `npm run lint:design` | exit 0 |
| `npm run build` | pass |
| `npm run test:e2e` | **791 passed、0 failed、9 skipped（34.5m；V3-9b 783；本批新增 network-log、keyboard-walk、axe-sweep 三支 spec 共 +12 條，其中 network-log 與 keyboard-walk 在 laptop／tablet 依設計 skipped 4 條；另 5 條 skipped 是 present-mode 手機案例）。全套跑在接線 `8493723`；之後只在 ≥ 768px 套用 KPI 間距的 CSS 調整（`4aed70c`）另對 revamp-r1-layout、present-mode、axe-sweep 四尺寸重跑 79 passed、0 failed、5 skipped（3.4m）** |
| 畫面基準 | `verification/revamp-v3/V3-10/snapshots/{desktop,laptop,tablet,mobile}/01–09.png` 共 36 張（baseline.spec `--update-snapshots` 4 passed），重跑核對 4 passed、0 張差異（最終 commit `4aed70c`） |
| 首屏量測（metrics.spec） | metrics.spec 6 passed（`_meta.batch=V3-10`）：首屏位置與 V3-9b 完全相同（1440 一句話頂 192px、KPI 帶底 419px、三件事首列底 561px；390 一句話頂 116px、KPI 帶底 555px、扣廣告後貢獻值頂 295px、三件事首列底 807px）；KPI 前可聚焦 1440＝10、390＝3；1280 頂欄 48px 一列；匯入路徑最多 2；First Load JS gzip 507.3 KiB（V3-9b 514.7；alias 移除後 −7.4 KiB） |
| 禁區 diff（對 82b70df） | 空 |
| testid 基準 | 刪除數 0（本批沒有新增 testid；靜態 testid 相異數 253，與 V3-9b 相同） |
| 隱藏字元掃描 | 變更檔 0（既有 BOM 正規式除外） |

### 3a. PRD §2.3 B 工程層指標（本機 production，示範資料）

| 指標 | v3 目標 | 實測 | 達標 |
|---|---|---|---|
| 1440×1000 首屏 | 結論句頂端 ≤ 176px；5 個 KPI 底邊 ≤ 420px；三件事第 1 列標題底邊 ≤ 1000px | 一句話頂 192px（V3-4 起；首屏高度以頁首 56px＋期間列計）、KPI 帶底 419px、三件事首列底 561px | 部分：KPI 底邊 419 ≤ 420 與三件事首列 561 ≤ 1000 達標；結論句頂端 192px > 176px（V3-4 起即如此，差 16px＝頁首高度；06_BATCHES 與 V3-4 驗收已記為已知差距） |
| 1280×900 頂欄 | 1 列、48px | 1 列、48px | 達標 |
| 390×844 首屏 | 扣廣告後貢獻數值頂 ≤ 360px | 295px | 達標 |
| 內容前的可見控制項數（1440） | ≤ 10（06_BATCHES 重算） | 10（count 與 tabStops；第一個是「投影模式」按鈕；390＝3） | 達標（等於上限） |
| 執行者匯入路徑 | ≤ 2 次點擊 | 各頁最多 2（資料來源頁 1） | 達標 |
| 寫死色碼 | 0（token 定義區 ≤ 48） | 0（token 定義區 23） | 達標 |
| 圓角值 | 4px、6px、999px＋0 | 4 種 | 達標 |
| 字級 | ≤ 8 種、全部 token | 螢幕 8 種（另 3 個列印 token） | 達標 |
| 字距 | 0 | 0 | 達標 |
| labels 文案違規 | 0（technical 子樹與 alias 白名單除外） | 「注意：」0、箭頭 0、圈數字 0、驚嘆號 0、全大寫 0、「｜」0；同義詞黑名單 12、禁用詞 0（見 §5） | 未達標（同義詞 12；其餘 0。白名單：technical 子樹、glossary.aliases、glossary.terms.oldNames、V3-10 加 glossary.basis.aliasNote 與 AI 面板三個 JSON 預覽標籤） |
| JSX 內硬編碼中文 | 0 | 0（JSX 文字節點 0、字串常值 0） | 達標 |
| data-testid | 刪除數 0 | 0 | 達標 |
| 掛載規則 M1／M6 | 100% | `tests/mounted-testids.test.tsx` 全過 | 達標 |
| 版面跳動 | 高度差 0；CLS < 0.05 | 載入示範資料 CLS 1440＝0、390＝0.001；空／載入／錯誤／有資料四態高度差 8px（V3-8，容器上距） | 達標（高度差 8px 來自容器上距，見 V3-8 §5） |

### 3b. PRD §2.3 C 品質層指標

| 指標 | 目標 | 實測 | 達標 |
|---|---|---|---|
| Lighthouse Accessibility（1440 與 390，示範資料 5 頁＋首頁） | 不低於 V3-0 同頁基準且 ≥ 95；四尺寸 axe 0 serious | 1440 與 390 各 6 個快照步驟全部 100（首頁空狀態、經營總覽、通路健檢、商品毛利、假設試算、會議紀錄）；失敗審核 0；axe 四尺寸（desktop／laptop／tablet 各 11 個畫面狀態、mobile 10 個）serious 0、critical 0 | 達標（不低於 V3-0 同頁基準，V3-0 起每批都是 100） |
| Lighthouse Performance | ≥ 90；不低於 V3-0 基準減 3 | 1440＝100、390＝92（v2 基準 100／93） | 達標（≥ 90 且 ≥ 基準−3＝90；390 本次受機器負載影響比 V3-9b 低 2 分） |
| 色彩對比 | 文字 ≥ 4.5、非文字 ≥ 3 | 75／75 通過 | 達標 |
| Golden 測試 | 255.00、−315.00、284.00／264.00／19.70 不變 | 全過（`tests/*golden*`、scenario、export-numeric 基準） | 達標 |
| 禁區 diff | 空（白名單內新增除外） | 空（V3-9 白名單 `fixtures/demo_tw/**` 未使用） | 達標 |
| 匯出與分享使用率 | 上線 4 週內 ≥ 25% | 上線後才能量（需 Vercel Web Analytics 事件） | 未執行（上線後） |
| 正式站 Lighthouse 與 HTTP 檢查 | 同本機門檻 | 13 項 HTTP 13／13＋補充 10／10；Lighthouse 1440 accessibility 全 100／performance 100、390 accessibility 全 100／performance 96，失敗審核 0；network-log desktop／mobile 通過（403、外部來源 0）；axe 四尺寸 serious 0 | 達標 |
| §2.3 A 使用者層（H4） | 5 人複測與盲評 | 未執行／待人工 | 未執行 |

### 3c. 正式站檢查（2026-10-08，deployment `dpl_GP2qy7fpFdWdkhQQE7uyYpEuXdAa`）

| 檢查 | 結果 |
|---|---|
| 部署 | `vercel deploy --prod --yes --scope jlo916s-projects --logs`（149 秒）READY，alias https://profitlens-tau.vercel.app；建置紀錄 `verification/revamp-v3/V3-10/deployment-build.txt`；上傳排除 `.claude/`（.vercelignore） |
| 13 項 HTTP（`scripts/launch-check.mjs --base https://profitlens-tau.vercel.app`） | 13／13 通過＋補充 10／10（GET /api/insights available=false、reason PUBLIC_DEMO；POST 403；/.env、/.git/config、fixtures 404；no-store、nosniff、無 X-Powered-By、靜態資源 immutable）；`production/launch-check-production.json` |
| Lighthouse（`scripts/lighthouse-pages.mjs --base https://profitlens-tau.vercel.app`） | 1440：6 個快照步驟 accessibility 全 100、首頁 performance 100、失敗審核 0；390：accessibility 全 100、首頁 performance 96、失敗審核 0；timespan CLS 同本機（載入示範資料 0／0.001）；`production/lighthouse/`、`production/metrics.json` |
| 網路紀錄與 axe（正式站） | `network-log.spec` desktop 與 mobile 通過（PUBLIC_DEMO：/api/insights GET available=false、直接 POST 403；外部來源 0、非 GET 0、原始 CSV 探針 0、失敗資源 0、console error 0；五個下載成功）；`axe-sweep.spec` 四尺寸通過（axe-core 4.13.0；desktop／laptop／tablet 各 11 個畫面狀態、mobile 10 個，serious／critical／moderate／minor 全 0）；證據 `production/network-log.json`、`production/axe.json`、`production/playwright-run.txt`、部署證明 `production/deployment-proof.txt`（`vercel inspect` 的 deployment id 與 HTML build id 一致） |
| 四尺寸走查截圖（正式站） | `production/shots/{1440x1000,1280x900,768x1024,390x844}/01-home-empty…08-data.png`（1440 另有 09-present-mode）共 33 張，全部示範資料；流程：首頁空狀態 → 載入示範資料（首次保存提示）→ 總覽 → 計算與來源抽屜 → 通路健檢 → 假設試算 → 會議紀錄 → 資料來源；`production/walkthrough.json` |
| 備份相容（R0 前的 v3 備份檔在正式站還原） | 在正式站用儲存選單還原 R0 前拍的四個 v3 備份檔（`verification/review-v2-a-workspace-{desktop,laptop,tablet,mobile}.json`，schema profitlens-workspace-v3）：四個尺寸都還原成功、沒有錯誤，總覽扣廣告後貢獻顯示「255 元」（抽屜精確值 255.00 元）、差額 −315 元、上期 570 元；`production/backup-restore.json` |

### 3d. `main` 合併、Git 整合重建與 tag（2026-10-08，使用者拍板）

| 項目 | 結果 |
|---|---|
| `main` | `git merge --ff-only revamp/v2`：5771104 → 625bfa5（286 個 commit），`git push origin main` 成功；`revamp/v2` 與 `main` 指向同一個 commit |
| Git 整合重建正式站 | Vercel 專案 link：GitHub `JLO916/profitlens`、production branch `main`。推送後自動建置 `dpl_DuA7X3dfyvCU7bddKm3caZKjarwz`（source git、commit 625bfa5、建置 96 秒）READY，接管 https://profitlens-tau.vercel.app、https://profitlens-jlo916s-projects.vercel.app、https://profitlens-git-main-jlo916s-projects.vercel.app；之前 CLI 部署的 `dpl_GP2qy7fpFdWdkhQQE7uyYpEuXdAa` 不再是 production alias；證據 `production/deployment-proof-main.txt` |
| 13 項 HTTP 複檢（接管後） | `scripts/launch-check.mjs --base https://profitlens-tau.vercel.app`：13／13 通過＋補充 10／10（GET /api/insights 200、POST 403、/.env 與 /.git/config 404、no-store、nosniff）；`production/launch-check-after-main.json` |
| tag | `git tag -a v3.0.0 625bfa5 -m "EC ProfitLens v3.0.0（2026-10-08 正式站）"`，`git push origin v3.0.0` 成功（`git ls-remote --tags origin` 有 `refs/tags/v3.0.0`，`git describe --tags main` = `v3.0.0`）；本機的 `v2.0.0`（82b70df）仍只在本機，未推送 |
| 未做 | Lighthouse、axe、走查截圖沒有對重建後的部署重跑：同一個 commit、同一組 production 環境變數，只重跑 HTTP 檢查確認接管成功 |

## 4. 瀏覽器驗收方式與截圖

- 四尺寸截圖：`verification/revamp-v3/V3-10/snapshots/{desktop(1440×1000),laptop(1280×900),tablet(768×1024),mobile(390×844)}/01-overview-top、02-overview-full、03-evidence-drawer、04-actions-board、05-diagnosis、06-products、07-scenarios、08-meeting、09-data.png`（示範資料 production、`APP_MODE=PUBLIC_DEMO`）。
- 首屏量測 `verification/revamp-v3/V3-10/metrics.json`；Lighthouse 流程報告 `verification/revamp-v3/V3-10/lighthouse/`；13 項 HTTP `launch-check-public-demo.json`（PUBLIC_DEMO）與 `launch-check-local.json`（LOCAL）；網路紀錄 `network-log.json`；鍵盤走查 `keyboard-walk.json`；axe `axe.json`；備份矩陣 `backup-matrix.json`；工具說明與 production 實際結果 `verification/revamp-v3/V3-10/README.md`。
- 08 §4 第 4 條的四尺寸操作路徑（示範 → 三件事 → 看明細 → 加入待辦 → 試算 → 會議紀錄 → 匯出 PDF／Excel／Markdown）由 `network-log.spec`（desktop、mobile）與既有 spec（四專案）覆蓋，截圖見 snapshots。
- 鍵盤走查、axe、網路紀錄在 production（LOCAL）由第二階段代理執行並提交證據，axe 在最終 commit 重跑一次。

## 5. 已知限制與風險

- **labels 文案違規未到 0**：同義詞黑名單仍有 12 筆、禁用詞 0 筆（V3-2a 起的棘輪），本批列出每一筆（§5a）；它們都是既有字串，依規則本批不改字（H3 已略過；改字需拍板，D-V3-37）。
- **H4 未執行**：§2.3 A 全部指標待人工；正式站與 tag `v3.0.0` 已依使用者 2026-10-08 拍板先行（§3c、§3d），H4 的結果之後只寫回 STATUS 與 §3b，不再另打 tag。
- **正式站現在跟著 `main`**：`main` 已 fast-forward 到 `revamp/v2`（625bfa5）並由 Git 整合重建正式站（§3d）。之後任何推到 `main` 的提交都會直接更新正式站，所以修正請從 `main` 開分支、推 `main` 前先取得當次同意（D-V3-24）。
- **決策匯出在示範資料下很大**（V3-9a 已知）：決策 CSV 84.1 MB、JSON 33.2 MB、Markdown 18.7 MB（示範資料加 1 個待辦）；本批只調查，不改輸出（D-V3-36）。
- 待拍板：D-V3-26、27、29、30、31、32、33、34、35 仍待；新增 D-V3-36（決策匯出縮減方案）、D-V3-37（同義詞黑名單剩餘字串是否改寫）。
- F15／F16 延後；H1 未執行（V3-10 的前後對照只有工程指標，沒有可用性指標）。
- **網路紀錄的「沒有 POST」在自動化瀏覽器下成立，真實瀏覽器會多三個同源的分析事件 POST**：Vercel Web Analytics 的腳本在 `navigator.webdriver` 或 Headless UA 下不送資料，所以 `network-log.spec` 測不到它；正式站驗證代理另以非自動化 UA 探測（本機攔截、沒有送到 Vercel），真實瀏覽器會送 `POST /_vercel/insights/view` 與 `POST /_vercel/insights/event`（`demo_loaded`、`evidence_opened`），本文只有事件名與頁面網址，沒有通路、金額或檔名，符合 D9 與 D-V3-15（`production/analytics-probe.json`）。
- 本批產出的 `scripts/launch-check.mjs` 沒有給 `--base` 時預設指向正式站 `https://profitlens-tau.vercel.app`；收尾者查看用法時曾對正式站（目前仍是 v2.0.0）跑過一次 13 項檢查（只讀的 GET 與 /api/insights 的 403 探測 POST，13／13 通過），沒有送出任何資料，也沒有部署。

### 5a. 同義詞黑名單剩餘 12 筆與禁用詞 0 筆（既有字串，未改）

| 詞 | 路徑 | 字串 |
|---|---|---|
| 工作區 | shell.sidebar.workspaceLabel | 我的工作區 |
| 工作區 | shell.sidebar.breadcrumbRoot | 工作區 |
| 工作區 | exports.csv.columns.context_id | 工作區代號 |
| 工作區 | storage.autoSave.promptTitle | 在這台電腦自動保存工作區？ |
| 工作區 | storage.autoSave.announce | 出現詢問：在這台電腦自動保存工作區？… |
| 變化 | overview.sections.bridge | 貢獻變化拆解 |
| 變化 | overview.page.bridgeTableAria | 貢獻變化拆解表 |
| 變化 | exports.excel.sheets.bridge | 貢獻變化拆解 |
| 變化 | rules.REV_UP_CM_DOWN.explain.nextStep | 先看貢獻變化拆解中扣最多的兩項… |
| 變化 | brand.description | …看清扣廣告後貢獻的變化… |
| 數據 | actions.board.boardIntro | …修改內容與引用的數據。 |
| 行動 | exports.decision.limitations.manualActions | 待辦的問題與行動由人填寫… |

禁用詞：0（V3-10 前的 3 筆是 AI 面板的 JSON 預覽標籤 shell.ai.panel.payloadSummary／payloadAria／requestAria，描述的是技術預覽本身，列入白名單）。

## 6. 下一步、人工關卡與待拍板

- 人工關卡 H4：用 `docs/revamp-v3/usability-test.md` 的腳本做 5 人複測與 3 位外部盲評，結果寫回 `docs/STATUS.md` 與本文件 §3b。
- 正式站：已部署（2026-10-08）並通過檢查（§3c）；`main` 合併後 Git 整合重建並複檢通過（§3d）。
- 推送與 tag：`revamp/v2` 與 `main` 都在 625bfa5；tag `v3.0.0` 已打並推送；H4 之後不再另打 tag。
- 待拍板：見 §5。
