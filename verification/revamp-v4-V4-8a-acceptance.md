# Revamp v4 V4-8a 驗收：投影與期間列（2026-10-13）

依 `docs/revamp-v4/06_BATCHES.md`「V4-8a 投影與期間列」。V4-8 原為 M，又併入 D-V4-44 B、D-V4-45 B、D-V3-33／34／35 與 G12。開工前用 5 個唯讀代理盤點範圍，含七頁 390 實測，結果約 14 項工作、兩種畫面變動，所以拆成 V4-8a 與 V4-8b（`03dc3a8`；理由見 `docs/DECISIONS.md` 2026-10-13）。V4-8b 的待拍板 D-V4-56–63 已列入 09。

**工作方式**：一個工作流程分四步。
- **實作**：兩個 worktree 平行。
  - 代理 A（`a710df5`）：投影。
  - 代理 B（`690aadb`）：期間列、資料表不利色、G12。
- **整合**：代理 C 在主 checkout 依序合併 A、B（`2182025`、`0c4adce`，沒有衝突），再做以下事項（`3e5d1d0`）：
  - 跑相關的 22 個 E2E。
  - 截投影畫面並量 14px 的文字間距。
  - 畫面基準逐張對齊比對。
  - B1、B2 改新基準。
  - 兩份 CSV 勾銷。
- **審查**：三位唯讀審查同時進行（投影與 a11y；期間列、不利色、G12 與截圖差異；護欄與測試完整性），只回報了 9 個 nit，所以修正代理沒有啟動。
- **主流程**：處理其中 7 個 nit（`e18302d`），再在最終程式上完整驗收（本文件）。

## 1. 完成項目（對照 06_BATCHES V4-8a）

| 項目 | 狀態 | 說明 |
|---|---|---|
| D-V4-8／X39：投影白名單加 `.bridge-section` | 完成 | **改動**：白名單在 `globals.css:2581`（V3-9b C 區段；PRD 寫的 `:2563` 是 v3.0.0 的行號）。<br>**投影中顯示**：拆解區只剩標題、副標與 G1 瀑布，柱上標值是 L1。<br>**投影中隱藏但掛載**：`.frame-aside`、`.bridge-table-wrap`（橋接表與 G6 九條）、平衡檢核、v2 四欄 `<details>`、`.unit-note`。單位說明寫的是「圖：萬元 · 表：元」，表已隱藏，所以一併隱藏（審查 PM-nit-1）。<br>**版面**：單欄，欄與區一起改寫，1024–1440 不會留空的旁欄。<br>**其餘新圖**（G3、G4、G7a、G5 MER、G15m、G19）：維持隱藏但掛載，由 M1 測試從 C 區段解析白名單與隱藏清單逐一斷言 |
| D-V4-9：`--text-12`、`--text-13` 在投影對應 14px | 完成 | 字級與行高成對改：`--leading-12`、`--leading-13` 都改成 22px，與 :root 14px 的行高相同。只改 token 值，字級種類仍是 11。<br>**瀑布排版**：瀑布會量 svg 內文字實際的字級，不是 12px 時才換算估寬、行高與邊界。12px 的輸出逐字不變，由 `tests/fixtures/waterfall-svg-v4-8a.json` 驗證：這是改程式之前在 `03dc3a8` 產生的基準，含 6 份資料 × G1、G2 的 SSR 全文，以及 225 個寬度 × 範圍組合的 SHA-256。<br>**投影實測**（`verification/revamp-v4/V4-8a/present/text-overlap.json`）：1440、1280、768 三種寬度下 G1、G2 的文字全部是 14px，沒有重疊也沒有裁切 |
| D-V3-33＝B：投影按鈕拿掉 `aria-pressed` | 完成 | 字樣本來就是「投影模式／離開投影」，不加 key。相關的單元、SSR、E2E helper 都改成斷言「沒有 aria-pressed」 |
| D-V3-34＝A：投影中「總覽／會議紀錄」互切 | 完成 | **按鈕**：`present-switch`，字樣是另一頁的頁名，沿用 `labels.shell.nav.{overview,meeting}.headline`；放在頁首一行內、投影按鈕之前。<br>**掛載方式**：總覽與會議頁一直掛載，不在投影時 `display: none`。所以 KPI 前的停留點仍是 10，B9 在總覽與會議頁各多 1 個節點。<br>**行為**：按了切到另一頁並留在投影中；Esc 仍回焦到投影按鈕。<br>**驗證**：E2E (g) 用點擊與 Enter 雙向切換；axe 加「投影中的會議頁」 |
| D-V3-35＝A：期間列的去年同期提示 | 完成 | **何時顯示**：`preset-reason-visible-yoy` 保持掛載但隱藏。使用者在本次工作階段按了停用的「去年同期」，才在 ≥ 768 顯示。<br>**何時收起**：選可用的快捷、送出自訂日期、載入或匯入成功、還原、清空。<br>**不算按過**：還原的 `ui_prefs.last_preset`。<br>**其他**：只剩這句理由時，整條提示一起隱藏；390 照 v3 不顯示；停用按鈕的 `aria-describedby` 與 `title` 保留。<br>**驗證**：revamp-r4 E2E 新增「送出自訂日期後收起但仍掛載」（審查 TG-2） |
| D-V4-45＝B：資料表不利色 | 完成 | **G10**：扣廣告後貢獻以 `deltaTone` 判斷；每 100 元以 `isLoss` 判斷，與列右端的「虧」同一個判斷。<br>**G7b**：週值以 `deltaTone` 判斷。<br>**G7a**：只在「有利方向是上升」的指標落到不利側時上色；成本類比率的正值不上色。<br>**示範資料結果**：G10 MARKETPLACE 兩格、G7b MARKETPLACE 六週、G7a 0 格。golden 的 MARKETPLACE −15.00 上色；資料待補不上色 |
| G12 收合列 | 完成 | G10、G11 下方補回 24px 間距（≤ 640 為 18px），摘要列維持靠左，與 H5 設計稿一致 |
| B1、B2 新基準 | 完成 | 只改「不晚於 V4-0a 實測」這類門檻，改成 V4-8a 實測值：<br>• B2 1280 一句話頂：192 → 168<br>• B2 1280 三件事首列底：583 → 559<br>• B1 總覽第一張圖頂：855 → 831<br>• B1 健檢首列底（1440、1280）：888 → 864；390 維持 985<br>• 試算 G15：938＋24 → 914＋24、1,114＋24 → 1,090＋24<br>≤ 900、≤ 420、≤ 295 等絕對預算不動 |
| labels | 完成 | 沒有新 key；`labels.zh-TW.ts` 與 `2b273b4` 逐位元組相同 |
| 測試 | 完成 | 單元測試新增或擴充：<br>• `present-mode`（白名單、隱藏清單、單欄、token 對應 12 ≤ 13 ≤ 14、沒有新字級原值、互切按鈕的 CSS）<br>• `overview-charts-waterfall`（逐字基準、14px 換算、投影寬度下不重疊）<br>• `mounted-testids`（V4-8a A、B 錨點：present-switch、投影 M1、yoy 提示、資料表色、G12 順序）<br>• `period-bar`、`chart-structure`、`diagnosis-v3`、`assist-spark`<br>E2E 擴充：<br>• `present-mode` (a)–(g)<br>• `axe-sweep`（投影中的會議頁；19／17）<br>• `revamp-r4`<br>• `charts-diagnosis`、`charts-overview` |
| 功能保留表 | 完成 | `batch` 含 V4-8a 的 10 列都已打勾：18、20、29、G7a、G7b、G10、G12、MV6，以及新增的 PM1（D-V3-33）、PM2（D-V3-34） |

## 2. 變更檔案

- **新增**
  - 測試：`tests/helpers/waterfall-svg-baseline.tsx`、`tests/fixtures/waterfall-svg-v4-8a.json`
  - 驗收：本文件、`verification/revamp-v4/V4-8a/`（`present/`、`capture-diff.{json,md}`、snapshots、量測檔）
- **修改**
  - 程式：`src/app/globals.css`（C 區段與 V4-8a B 錨點）、`src/components/{dashboard.tsx,shell/page-chrome.tsx,shell/period-bar.tsx,overview/charts/waterfall-svg.tsx,diagnosis/share-section.tsx,channel-table.tsx,overview/assist-spark.tsx}`
  - 單元測試：`tests/{present-mode,mounted-testids,period-bar,overview-charts-waterfall,chart-structure,diagnosis-v3,assist-spark}.test.*`、`tests/helpers/page-states.tsx`
  - E2E：`tests/e2e/{present-mode,present-helpers-v39,axe-sweep,revamp-r4,charts-diagnosis,charts-overview}.*`
  - 量測：`verification/revamp-v4-capture/metrics.spec.ts`
  - 清單：`verification/revamp-v4/{testids-v4-added.txt,feature-retention.csv,e2e-text-assertions.csv}`
  - 文件：`docs/{STATUS.md,DECISIONS.md}`、`docs/revamp-v4/{06_BATCHES.md,09_DECISIONS_PENDING.md,00_README.md,01_PRD.md,CHART_CATALOG.md}`
- **零改動**
  - 財務禁區
  - labels
  - `package.json`、`package-lock.json`
  - 棘輪上限檔、`copy-density`

## 3. 驗收命令與真實結果（最終程式 `e18302d`）

| 命令 | 結果 |
|---|---|
| `npm ci` | 未執行（lockfile 沒有變動） |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0。整合時兩個代理 worktree 留在 `.claude/worktrees/` 會讓 lint 失敗，主流程已移除，兩個分支都已合併 |
| `npm run audit:ui -- --json verification/revamp-v4/V4-8a/ui-audit.json` | hex 0、字級種類 11、JSX 中文 0。資訊欄：靜態 testid 255 → 256（多了 `present-switch`）、class 885 → 889 |
| `npm run contrast-check` | 85／85 通過 |
| `npm test -- --run` | **161 檔、3,267 個測試全過**（V4-7c 是 3,244 個） |
| `npm run build` | exit 0 |
| `npm run test:e2e`（帶三個 `*_OUT`） | **1,004 passed、0 failed、16 skipped（29.1 分鐘）**。跑完已還原 E2E 改寫的追蹤檔 |
| 投影截圖（LOCAL，最終程式重拍） | 1440、1280、768 × 總覽與會議頁，存在 `verification/revamp-v4/V4-8a/present/`。`text-overlap.json` 結果為 pass：G1、G2 14px、0 重疊、0 裁切；互切按鈕與投影按鈕在同一行；沒有橫向溢出。768 的 G1 有一對相鄰標值只差 0.17px，基線不同、沒有重疊 |
| PUBLIC_DEMO build 與伺服器（3100） | exit 0；`GET /` 回 200 |
| `CAPTURE_BATCH=V4-8a …`（V4-7c 的 52 張為基底） | **整合時第一次跑**：差異恰好是允許範圍的 32 張（見下表），逐張對齊比對全部可解釋；更新基準後重跑為 23 passed、5 skipped。<br>**最終程式再跑一次**：23 passed、5 skipped，0 差異 |
| Lighthouse × 3（開跑時 1 分鐘負載 2.38、2.07、2.03） | 390 的五項 TBT 都通過（見下表） |
| `lsof -ti tcp:3100 \| xargs kill`；`lsof -ti tcp:3100` | 已停，沒有輸出 |
| 禁區四條命令 | 四條都是空的 |
| commit 之後 `git diff --stat 625bfa5 HEAD -- （禁區與 assist-kpi、breakeven-mer 路徑）` | 見文末（收尾 commit 之後補記） |
| 隱藏字元掃描 | 0 |

**棘輪與基準數值**

| 項目 | V4-8a | 與基準比較 |
|---|---|---|
| design-lint 15 項、copy-style、copy-density、chart-lint CL-1–CL-11 | 上限檔沒動；字級種類 11；chart-lint 全 0 | 不變 |
| testid 刪除數（v2、v3、v4 新增） | 0、0、0；本批新增 1 個（`present-switch`），累計 330 | — |
| labels 快照 | 2,581 個鍵逐字相同；本批沒有新 key | — |
| First Load JS gzip（B5） | **512,193 bytes**（V4-7c 為 511,610，多 583：瀑布量字級與互切按鈕）；門檻 545,397，**剩 33,204** | 通過 |
| B1、B2 | 1440、1280 的內容上移 24px（例如一句話頂 192 → 168、KPI 帶底 420 → 396）；390 不變 | 新基準見上 |
| B3 | 390 七頁 scrollWidth 都是 390 | 通過 |
| B8（主層否定句，只記錄） | 1440、1280 每頁少 1 句（去年同期理由改成按了才顯示） | 下降 |
| B9 DOM 節點 | 總覽與會議頁各多 1（互切按鈕），其餘不變 | ≤ 基準＋1,500 |
| KPI 前可聚焦 | 1440、1280 為 10，390 為 3 | ≤ 10 |
| Lighthouse Accessibility | 1440、390 各 8 頁，三次全部 100 | 不變 |
| Lighthouse Performance（空狀態首頁） | 1440 為 100；390 為 95、95、95 | ≥ 90 |
| 預先載入 | 三次的 `insideTimespans` 都是空的 | 不在量測區間內 |
| axe 四尺寸 | **19／19／19／17** 個狀態全 0。desktop、laptop、tablet 加了「投影中的會議頁」；mobile 沒有投影 | 通過 |
| keyboard-walk | 除了 `checked_at` 與 V4-7c 完全相同 | 不變 |
| network-log | 下載集合、`checks`、`totals` 與 V4-7c 完全相同 | 不變 |
| 功能保留表 | V4-8a 的 10 列都已打勾 | 完成 |

**390 TBT**（低負載三次，單位 ms）

| 頁面 | 三次 | 中位數 | 門檻 | 結果 |
|---|---|---|---|---|
| 載入示範資料 | 998.2、998.9、979.5 | 998.2 | 1,109.1 | 通過 |
| 通路健檢 | 798.1、808.9、803.5 | 803.5 | 832.3 | 通過 |
| 商品毛利 | 79.9、86.1、80.0 | 80.0 | 129.9 | 通過 |
| 會議紀錄 | 979.2、976.7、987.6 | 979.2 | 1,071.2 | 通過 |
| 資料來源 | 9.7、13.6、9.9 | 9.9 | 50.0 | 通過 |

不需要 D-V4-47 的同場對照。

**畫面基準差異**：只有允許範圍內的 32 張。逐張比對結果見 `verification/revamp-v4/V4-8a/capture-diff.{json,md}`；審查 R2 另外自己重算抽查，結論一致。

| 畫面 | 尺寸 | 變化 | 理由 |
|---|---|---|---|
| 01–09 | desktop、laptop、tablet（27 張） | 期間列下方少 24 列，其下內容整體上移 24px。<br>01、03 是視窗截圖，04 的頁高不足一屏，所以這三張的底部多露出 24 列。<br>對齊後的殘差只有反鋸齒；另有 desktop 01、02 的 hover 換列，只在橋接表欄內，原因是走查時滑鼠沒有移開；03 的抽屜後方是模糊背景的邊緣 | D-V3-35 |
| 05、10 | 四個尺寸（05 的 desktop、laptop、tablet 與上列重疊） | G10、G11 下方各多一條整列都是頁面背景色的帶：≥ 768 寬 24 列，390 寬 18 列 | G12 |
| 11–13（四尺寸）；mobile 的 01–04、06–09 | — | 逐位元組相同 | — |

## 4. 瀏覽器驗收方式與截圖

- **畫面基準**：`verification/revamp-v4/V4-8a/snapshots/{desktop,laptop,tablet,mobile}/`，每個尺寸 13 張。
- **投影截圖**：`verification/revamp-v4/V4-8a/present/overview-{1440,1280,768}.png`、`meeting-{1440,1280,768}.png`。
  - 我看過 1280 的總覽：G1 是單欄、只有瀑布，柱上標值在 14px 下清楚，單位說明已隱藏；「會議紀錄」互切按鈕在「離開投影」左邊。
  - 會議頁投影只顯示議程 1–2。
- **E2E**：四個視窗都用 LOCAL 伺服器；截圖用 PUBLIC_DEMO（0 像素差，threshold 0.02）。
- **量測檔**：`verification/revamp-v4/V4-8a/` 下的 `metrics.json`、`first-load-modules.json`、`ui-audit.json`、`axe.json`、`keyboard-walk.json`、`network-log.json`，以及 `lighthouse/`、`lighthouse-runs/`、`present/`、`capture-diff.*`。

## 5. 已知限制與風險

- **768 投影的 G1**：「−36.1 萬」與「127.0 萬」水平只差 0.17px。兩者基線差約 15px，沒有重疊，但看起來擠。H6 若覺得太擠，再調整。
- **缺廣告資料在 768 投影**：兩個「資料待補」標值的外框在角落相交 2.7×1.0px，字形沒有重疊。12px 一般模式本來就是這樣，不是這批造成的退步（審查 PM-nit-2）。
- **去年同期提示的報讀**：提示從隱藏變成可見時，螢幕閱讀器不一定會念。理由仍寫在停用按鈕的 `aria-describedby` 與 `title`。
- **載入或匯入失敗的情況**：按「返回」回到上一份資料時，先前按出來的去年同期提示還會顯示。收起時機照 V4-7c 匯入時間的前例，是在載入成功後才清。
- **畫面基準的走查沒有移開滑鼠**：版面一位移，hover 底色就會換列，這批的 desktop 01、02 就是這樣。建議 V4-8b 在 baseline.spec 01–09 加 `mouse.move(0, 0)`，但這會改基準流程，要另外拍板。
- **人工關卡**：H6、PPT 人工開檔都未執行。

## 6. 下一步、人工關卡與待拍板

- **待拍板**：D-V4-56–63（V4-8b 的範圍），列在 `docs/revamp-v4/09_DECISIONS_PENDING.md`。各項建議：
  - D-V4-56：A
  - D-V4-57：A
  - D-V4-58：A
  - D-V4-59：A
  - D-V4-60：A
  - D-V4-61：B
  - D-V4-62：A
  - D-V4-63：B

  回覆前，V4-8b 只做不受影響的部分。
- **下一批**：V4-8b 四尺寸總檢與隨頁載入狀態。
- **部署**：本批沒有部署；preview 部署仍需使用者當次明確同意。
