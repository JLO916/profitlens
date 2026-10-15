# v4.1 V41-5 驗收：收尾與上線（2026-10-15）

依 `docs/revamp-v4.1/06_BATCHES.md` 的「V41-5」。拍板：D-V41-1、17、18、24 依建議值。

使用者 2026-10-15 回覆「H7 通過、V41-5 收尾、正式上線」：

- H7 通過，介紹三段與動機段都沒有改字。
- 這次當次同意正式上線。

| 步驟 | commit | 內容 |
|---|---|---|
| 文件與版本 | `8030877` | 版本 4.1.0；RELEASES v4.1.0 段、README、ENGINEERING、usability-test T5／T6、PRD §2.2 實測值、release-notes 測試 |
| 審查修正 | `313e8b8` | 兩個面向（事實與文案、測試），major 3 項，見 §4 |
| 發布 commit | `5b40d7f` | 驗收證據、本文件上線前的部分、功能保留表一列更正；`main` 與 tag `v4.1.0` 指向這個 commit |
| 上線紀錄 | 見 §6 | 正式站 deployment、正式站檢查、README 改成已是 v4.1.0、STATUS、DECISIONS、進度 |

## 1. 完成項目

| 06 項目 | 狀態 | 說明 |
|---|---|---|
| 1 版本 4.1.0 | 完成 | `package.json` 與 `package-lock.json` 只改三個 version 欄位（git diff 只有這三行）；`GUIDE_MEDIA=check` 44／44、0 差異，版本號改變不需要重拍 |
| 2 文件 | 完成 | RELEASES 新增 v4.1.0 段：給使用者、不變的事、已知限制、驗收。<br>README 發布紀錄改 v4.1.0；「30 秒試用」連到 `/guide`，「用自己的資料」連到 `/guide/import`。<br>ENGINEERING 的文件地圖加 `docs/revamp-v4.1/` 與 v4.1 驗收；驗收命令加 `GUIDE_MEDIA=check／write`。<br>`docs/revamp-v4/usability-test.md` 加 T5、T6（D-V41-17）。<br>STATUS、DECISIONS 在上線後補記 |
| 3 功能保留表與 PRD §2.2 | 完成 | v4.1 新列（影片列 GV1–GV3 除外）與 V41-1、V41-4 重新核對的列都已有狀態。<br>第 7 列 V41-1 的狀態原本寫「D-V41-25 待回覆」，更正為已拍板 A。<br>PRD §2.2：A1、A2 未量測（H6 待人工），A3 H7 通過，B1–B9 填實測值 |
| 4 H7 的修改 | 不需要 | 使用者回覆通過，沒有改字 |
| 5 上線 | 見 §6 | |

## 2. 驗收命令與結果（發布 commit `5b40d7f`；程式與 `313e8b8` 相同）

| 命令 | 結果 |
|---|---|
| `npm ci` | exit 0（lockfile 只改 version 欄位） |
| `npm run typecheck`、`npm run lint` | exit 0 |
| `npm run audit:ui -- --json verification/revamp-v41/V41-5/ui-audit.json` | hex 0、字級 11（不變）、JSX 中文 0、元件字串常值中文 0 |
| `npm run contrast-check` | 85／85 |
| `npm test -- --run` | **166 檔、3,518 個測試全過** |
| `npm run build` | exit 0 |
| `npm run test:e2e`（帶 `NETWORK_LOG_OUT`、`KEYBOARD_WALK_OUT`、`AXE_OUT`、`GUIDE_SHOTS_OUT`） | **1,127 passed、0 failed、29 skipped（34.5 分鐘）**；跑完已還原 E2E 改寫的追蹤檔 |
| `CAPTURE_BATCH=V41-5` | **38 passed、0 failed**，64 張全部 0 差異 |
| `GUIDE_MEDIA=check` | 44／44 通過，0 差異 |
| launch-check（本機 PUBLIC_DEMO） | 13 項全部通過，補充 14 項全部通過 |
| Lighthouse × 3 | 390 TBT 五項通過；說明頁 a11y、SEO 100；見下方 |
| 禁區與邊界五條 | 都是空的 |

**量測**：

- **First Load JS**：`/` 是 519,702（門檻 520,451）；`/guide` 與 11 個功能區頁都是 131,465；`GUIDE_SENTINELS` 0。
- **axe**：25／25／25／23 個狀態，全部 0 問題。

**Lighthouse × 3**：每次開跑前最多等 30 分鐘、負載 < 2.5。第 1、2 次開跑時是 2.48、2.39；第 3 次等滿 30 分鐘仍未降，在 5.58 開跑。

| 步驟（390 TBT，ms） | 第 1 次 | 第 2 次 | 第 3 次 | 中位數 | 門檻 |
|---|---|---|---|---|---|
| 載入示範資料 | 1,088.3 | 1,116.5 | 1,076.3 | **1,088.3** | 1,109.1 |
| 健檢 | 829.6 | 809.2 | 796.3 | **809.2** | 832.3 |
| 商品 | 108.7 | 92.6 | 97.0 | **97.0** | 129.9 |
| 會議 | 1,035.5 | 1,006.4 | 968.6 | **1,006.4** | 1,071.2 |
| 資料來源 | 16.6 | 16.2 | 13.3 | **16.2** | 50.0 |

- **工作台**：
  - a11y 三次都是全部 100。
  - 首頁 Performance：1440 是 99、100、99；390 是 84、91、94。中位數 91 達到 ≥ 90，第 1 次的 84 低於門檻。
  - 所有切頁 CLS ≤ 0.002。
  - 預先載入的 chunk 都沒有落入量測區間。
- **說明頁**：`/guide`、`/guide/overview` 的 a11y、SEO 都是 100，Performance 98–100，CLS 0。
- **證據**：`lighthouse-runs/run1`、`run2` 是第 1、2 次，`metrics.json` 是第 3 次，報告在 `lighthouse/`。

## 3. PRD §2.2 成功指標（最終）

| # | 結果 |
|---|---|
| A1 從首頁 60 秒內找到「使用說明」 | 未量測（H6 待人工；T5 已寫進 usability-test） |
| A2 只看 `/guide/import` 完成匯入 | 未量測（H6 待人工；T6 已寫進 usability-test） |
| A3 H7 介紹文案確認 | 通過（使用者 2026-10-15） |
| B1 `/` First Load | 519,702 ≤ 520,451；`GUIDE_SENTINELS` 0 |
| B2 說明頁 First Load | 12 頁都是 131,465 ≤ 136,585；不含禁用模組 |
| B3 媒體 | 44 張，單張最大 111,950 bytes，每區最大 239,138；21 張在 390 的顯示比例低於 0.45，都有原尺寸連結 |
| B4 說明頁 Lighthouse | a11y、SEO 100；Performance 98–100；CLS 0 |
| B5 說明頁 axe | 0 |
| B6 同步檢查 | `GUIDE_MEDIA=check` 44／44；`{ui:…}` 未解析 0、重打介面字串 0 |
| B7 既有護欄 | 全部通過 |
| B8 CLS | 四個切頁都是 0 |
| B9 launch-check | 本機 13＋14；正式站 13＋14（§6） |

## 4. 審查

文件與測試由兩個面向審查，只報 blocker、major，共 3 項，`313e8b8` 全部修正：

1. **發布 commit 先寫了已上線**：初稿在發布 commit 就寫「正式站已是 v4.1.0」，RELEASES 的發布方式也寫成已推送、已部署。
   - 改成上線前的寫法，上線、檢查通過後的 commit 才改寫，比照 v4.0.0 的做法（`872662d` 寫尚未發布，`59e6f41` 才改）。
2. **測試讓預留字串混過去**：release-notes 測試讓 `PROD_PLACEHOLDER` 與缺少的 V41-5 驗收文件永遠過關。
   - 改成看 README 是否已寫「正式站已是 v4.1.0」。
   - 上線後要求正式站檢查一行有 deployment、引用 `verification/revamp-v41/V41-5/launch-check-production.json` 且檔案存在、本文件存在、不留 PLACEHOLDER。
3. **歷史紀錄讀了會變的資料**：v4.1.0 段的測試讀即時的媒體清單與 guideLabels，之後 V41-3 加影片時會讓歷史紀錄的測試失敗。改成固定發布當時的數字與標題。

**nit 21 項只記錄**，例如：

- README 一句「修正 4 個切頁的版面跳動」比 RELEASES 的說法寬，實際只改了 Lighthouse 的實驗室數字。
- usability-test 的 T5、T6 時間分配寫得比較緊。

## 5. 已知限制

同 RELEASES v4.1.0 的「已知限制」：

- H6（含 T5、T6）待人工。
- 匯出檔開檔檢查待人工。
- Skew Protection 沒有開。
- source-map-js 1.2.2 的修正待同意。
- 影片（V41-3）沒做。
- 21 張截圖在 390 縮得較小。
- 3 張截圖裡的原生控制項是英文。

## 6. 上線（使用者 2026-10-15 當次同意「正式上線」）

- **推送**：`main` 從 `59e6f41` fast-forward 到 `5b40d7f` 並推送；同時推送分支 `revamp/v4.1`（另建一個 preview）。commit 之後的禁區與邊界 diff 都是空的。
- **部署**：
  - 由 Vercel Git 整合部署：`dpl_8gTMCdU9BKTeCJfhTbCvsuGUgan2`，target production，READY；`profitlens-tau.vercel.app` 指向它，來源是 `main` @ `5b40d7f`。
  - 正式站的 `/api/insights` 回 `{"available":false,"reason":"PUBLIC_DEMO"}`。
- **tag**：annotated tag `v4.1.0` 指向 `5b40d7f`，已推送。
- **正式站檢查**：
  - 13 項 HTTP 全部通過，補充 14 項也全部通過，`live_ai_called: false`（`verification/revamp-v41/V41-5/launch-check-production.json`）。
  - sitemap 13 個網址；`/guide` 的 h1 正確。
  - 正式站 `og.png` 的 SHA-256 與 repo 的 `public/og.png` 相同。
- **瀏覽器**：無頭 Chromium，1440 與 390：
  - `/guide` 目錄 11 張卡；`/guide/meeting` 5 張圖都載入；scrollWidth 等於視窗寬。
  - 工作台載入示範資料後，側欄（1440）與頁尾（390）的「使用說明」另開 `/guide`，原分頁的 KPI 帶仍在。
  - 沒有 page error。
- **上線後的文件 commit**：README 改成「正式站已是 v4.1.0」、RELEASES 補正式站檢查一行、本節、STATUS、DECISIONS、06／README 進度。推送 `revamp/v4.1` 與 `main` 後，正式站用同樣的程式重建一次，比照 v4.0.0 上線後補文件的做法；重建後再跑一次 launch-check，結果記在 STATUS。
- **沒有做**：
  - Skew Protection：D-V41-16，由使用者本人在 Vercel 設定決定。
  - source-map-js 修正：待同意。
  - H6 與匯出開檔檢查：待人工。
