# Revamp v4 V4-11 驗收：收尾（不部署）（2026-10-13）

依 `docs/revamp-v4/06_BATCHES.md`「V4-11」與 D-V4-1＝B（版本 4.0.0）。這批不加功能、不加新 key。

使用者 2026-10-13 指示「以上一口氣全部完工」，並選定「只完成程式與文件，不部署」。因此以下四件都**沒有執行**：

- 打 git tag `v4.0.0`
- 推送 `main`
- 部署正式站（preview 在 2026-10-14 經使用者同意另外部署，見文末）
- 開啟 Vercel Skew Protection（D-V4-44 的 C）

正式站仍是 v3.0.0。

**工作方式**：一個代理在 worktree 完成收尾工作（`e65537c`），合併後是 `0ba7708`；主流程在合併後的程式上跑完整驗收。

## 1. 完成項目

| 項目 | 狀態 | 說明 |
|---|---|---|
| 棘輪與 chart-lint 上限調到實測 | 完成 | design-lint 15 項、chart-lint 11 條、copy-density 七頁重測，實測都已等於上限，所以數字不變，只補一句重測紀錄 |
| `chartCategoryColors`、`readChartColors` | 完成（保留） | 不改行為，各加一行註解說明不用的理由：v4 沒有類別色；匯出用 `EXPORT_THEME`，也沒有圖片下載 |
| 版本 4.0.0 | 完成 | `package.json` 與 lockfile 只改 version 欄位；`tests/release-notes.test.ts` 加入 v4.0.0 的斷言，v3.0.0 的斷言照舊 |
| RELEASES、README | 完成 | 新增「## v4.0.0（尚未發布）」，內容有給使用者的說明、不變的事、匯出格式變更、相容性與已知限制；README 只加一點 |
| 功能保留表全表打勾 | 完成 | 原本空白的 72 列逐列核對 locator、testid 與 covering tests 都還在，全部打勾，0 列無法核對 |
| PRD §2.2 填真實值 | 完成 | A1–A4 寫「未執行／待人工（H6）」。<br>B4 寫**未達標**：390 寬切到商品毛利、資料來源、待辦，以及 1440 寬切到待辦時，CLS 是 0.053–0.054，超過 0.05。v3.0.0 就是這樣，v4 沒有改善。<br>其餘都達標，並補上 V4-11 終跑的數字 |
| 13 項 HTTP | 完成 | `node scripts/launch-check.mjs --base http://127.0.0.1:3100` 對本機 PUBLIC_DEMO：13 項全部通過，補充項目全部通過，`live_ai_called: false` |
| tag、正式站、Skew Protection | **未執行** | 使用者 2026-10-13 指示不部署 |

## 2. 驗收命令與結果（`0ba7708`）

| 命令 | 結果 |
|---|---|
| typecheck、lint | exit 0 |
| audit:ui（`verification/revamp-v4/V4-11/ui-audit.json`）、contrast-check | hex 0、字級種類 11、JSX 中文 0；contrast 85／85 |
| `npm test -- --run` | **164 檔、3,379 個測試全過** |
| build | exit 0 |
| `npm run test:e2e`（帶三個 `*_OUT`） | **1,067 passed、0 failed、25 skipped（31.6 分鐘）**；跑完已還原 E2E 改寫的追蹤檔 |
| `CAPTURE_BATCH=V4-11` | 23 passed、5 skipped；52 張與 V4-10 逐位元組相同 |
| launch-check（13 項） | 全部通過（`launch-check-local.json`） |
| Lighthouse × 3（開跑時 1 分鐘負載 2.02、2.44、2.30） | 390 TBT 中位數五項都通過，見下表；a11y 全 100；390 首頁 Performance 95–96；預先載入沒有落入量測區間 |
| 禁區四條命令 | 都是空的 |
| commit 之後 `git diff --stat 625bfa5 HEAD -- （禁區）` | 空（收尾 commit `e861da9`；`82b70df` 那條與 `git status --porcelain` 也是空的） |

**390 TBT 中位數**

| 步驟 | 中位數（ms） | 門檻（ms） |
|---|---|---|
| 載入示範資料 | 1,053.9 | 1,109.1 |
| 健檢 | 797.2 | 832.3 |
| 商品 | 86.8 | 129.9 |
| 會議 | 994.3 | 1,071.2 |
| 資料來源 | 10.8 | 50.0 |

**其他數字**

- First Load JS：519,322 bytes（v3.0.0 是 519,426，門檻 545,397）。
- axe：desktop、laptop、tablet 各 23 個狀態，mobile 21 個，全部 0 問題。
- keyboard-walk、network-log：與 V4-10 相同，下載的五種檔案逐位元組相同。
- testid 刪除數：v2、v3、v4 新增三份基準都是 0。
- labels：v3.0.0 的 2,581 個字串逐字相同。

## 3. 全部 v4 批次一覽

| 批次 | 狀態 | 驗收文件 |
|---|---|---|
| V4-0a、V4-0b、V4-1、V4-2、V4-3a、V4-3b、V4-3c | 完成 | `verification/revamp-v4-V4-{0a,0b,1,2,3a,3b,3c}-acceptance.md` |
| V4-4、V4-5、V4-6、V4-7a、V4-7b、V4-7c | 完成 | `verification/revamp-v4-V4-{4,5,6,7a,7b,7c}-acceptance.md` |
| V4-8a、V4-8b、V4-9a、V4-9b、V4-10、V4-11 | 完成 | `verification/revamp-v4-V4-{8a,8b,9a,9b,10,11}-acceptance.md` |

## 4. 未完成、待人工

- **H6**：5 人可用性複測與 3 位外部盲評，約 1 週。PRD §2.2 A1–A4 要靠它；它擋 v4.0.0 正式上線。
- **匯出開檔檢查**：
  - PPT：標值是否對齊柱子、「編輯資料」裡的輔助系列名稱。
  - PDF：列印截圖。
  - Excel：「圖表資料」工作表。

  樣本在 `verification/revamp-v4/V4-9a/exports/`、`V4-9b/exports/`。
- **上線**：tag `v4.0.0`、合併並推送 `main`（會觸發正式站部署）、Skew Protection。每一項都需要使用者當次明確同意。

## 5. 2026-10-14 preview 部署（使用者當次同意「先部署 preview」）

- **做法**：只推送分支 `revamp/v4` 到 origin。沒有推 `main`、沒有打 tag，正式站不變。由 Vercel Git 整合建置 preview。
- **部署**：`dpl_Cr8gE1EfaMmNwHQQMr8k2B7yXfPt`，target 是 preview，READY。來源是 `revamp/v4` @ `5d07454`。
- **網址**：https://profitlens-git-revamp-v4-jlo916s-projects.vercel.app（另一個網址是 `https://profitlens-hv8v4nbgo-jlo916s-projects.vercel.app`）。
- **環境**：preview 環境變數維持公開示範模式，`/api/insights` 回 `{"available":false,"reason":"PUBLIC_DEMO"}`。
- **13 項 HTTP**：全部通過，補充項目也全部通過，`live_ai_called: false`（`verification/revamp-v4/V4-11/launch-check-preview.json`）。
- **瀏覽器**：用無頭 Chromium 在 1440 與 390 載入示範資料，總覽的 G1 標題是「少賺 59.9 萬，扣最多的一項是商品成本（−157.5 萬）」，`main .chart-frame` 6 個，scrollWidth 分別等於 1440、390。
- **存取**：目前 preview 不需要 Vercel 登入就能開。v3 時專案有 SSO 保護，現在的設定已不同；要不要限制由使用者決定。

## 6. 2026-10-14 正式上線（使用者當次同意「正式上線」）

- **部署**：`main` 從 `21d621c` fast-forward 到 `872662d` 並推送，由 Vercel Git 整合部署正式站。部署是 `dpl_8b48r3atVjzRA49DFHKZyQhao4BC`，target production，READY；`profitlens-tau.vercel.app` 指向它，來源是 `main` @ `872662d`。
- **tag**：annotated tag `v4.0.0` 指向 `872662d`，已推送。
- **正式站檢查**：13 項 HTTP 全部通過，補充項目也全部通過，`live_ai_called: false`（`verification/revamp-v4/V4-11/launch-check-production.json`）。`/api/insights` 回 `PUBLIC_DEMO`。無頭瀏覽器在 1440 與 390 載入示範資料：G1 標題正確，`main .chart-frame` 6 個，scrollWidth 等於視窗寬。
- **未完成**：
  - H6（待人工；使用者決定先上線）。
  - 匯出開檔檢查（待人工）。
  - Skew Protection：開啟的指令被本機自動權限檢查擋下，Hobby 方案；由使用者在 Vercel 設定決定。
- **文件 commit**：RELEASES、README、ENGINEERING、release-notes 測試、STATUS、DECISIONS 更新後推送 `revamp/v4` 與 `main`（fast-forward）。只改文件，正式站會用同樣的程式重建一次，比照 v3.0.0 上線後補文件的做法。

