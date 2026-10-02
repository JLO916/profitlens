# Revamp v2 — R0 基線與安全網 驗收紀錄

- 日期：2026-10-02（Asia/Taipei）
- 分支：`revamp/v2`，自 `origin/main` `5771104`（Add files via upload）建立；R0 期間產品程式零改動
- 環境：macOS（Darwin 25.2.0）、Node v25.8.2、npm 11.11.1、Playwright 1.63.0（chromium 1217 已安裝）
- 對照基準：`main` 的 A 批紀錄（`verification/review-v2-a-acceptance.md`：819 unit、400＋4 E2E）

## 1. 任務對照（`docs/revamp/06_BATCHES.md` R0）
| 任務 | 狀態 | 說明 |
|---|---|---|
| R0-1 建分支 `revamp/v2` | 完成 | 自 `origin/main` 建立並 `git push -u origin revamp/v2`；當時與 main 無差異 |
| R0-2 乾淨環境全套檢查 | 完成 | `rm -rf node_modules .next` 後 `npm ci`，五項命令全部真實執行，結果見 §2 |
| R0-3 四尺寸「改版前」截圖 | 完成 | 40 張存於 `verification/revamp-R0/before/`，見 §3 |
| R0-4 放入規劃文件與標籤字典、建立 `src/i18n/index.ts` | 完成 | `CLAUDE.md`、`docs/revamp/*`、`src/i18n/labels.zh-TW.ts` 已在 main `5771104`；本批新增 `src/i18n/index.ts`（re-export `labels`＋`t(path)`），**未接線**，沒有任何元件引用 |
| R0-5 testid／E2E 選擇器清單 | 完成 | `verification/revamp-R1/testids.txt`，見 §4 |
| R0-6 `docs/STATUS.md`、`docs/DECISIONS.md` | 完成 | STATUS 新增「Revamp v2」章節與 R0 紀錄；DECISIONS 新增「Revamp v2 原則：財務核心零改動、標籤單一來源」 |

## 2. 驗收命令與真實結果
| 命令 | 結果 | 摘要 |
|---|---|---|
| `npm ci` | 通過 | added 442 packages, audited 443 packages in 10s；found 0 vulnerabilities；1 則既有 `npm warn deprecated eslint@9.39.5`（main 既有，STATUS 已記錄，本批不升級） |
| `npm run typecheck` | 通過 | `next typegen` ✓ Types generated successfully；`tsc --noEmit` exit 0 |
| `npm run lint` | 通過 | `eslint . --max-warnings=0` exit 0，0 warnings |
| `npm test -- --run` | 通過 | Vitest 4.1.11：**Test Files 40 passed (40)、Tests 819 passed (819)**，Duration 4.30s |
| `npm run build` | 通過 | Next.js 16.3.7 (webpack)：✓ Compiled successfully in 5.3s；routes `/`、`/_not-found`（static）、`/api/datasets/[id]`、`/api/insights`（dynamic）；**無 warning** |
| `npm run test:e2e` | 通過 | Playwright 1.63.0，`tests/e2e` 15 檔：**404 passed (7.5m)**；expected 404 / unexpected 0 / skipped 0 / flaky 0；desktop 101、laptop 101、tablet 101、mobile 101；webServer 為 production build＋`next start --port 3100` |

與 main 對照：unit 819／819、E2E 404／404（A 批紀錄 400＋4），數量相同；build 無新增警告。

E2E 執行會重寫 87 個已納入版控的 A 批證據檔（`verification/review-v2-a-*` 截圖、jsonl、csv、json、pdf）。這些是 A 批當時的歷史結果，R0 以 `git checkout -- verification/` 還原，不混入本批 commit；本批 E2E 的統計數字取自執行當下的 list reporter 與 `review-v2-a-e2e-results.json`（還原前讀取）。

## 3. 改版前截圖（R0-3）
- 產生方式：`npx playwright test --config verification/revamp-R0-capture.config.ts`（4 passed, 26.6s）。獨立 config 與 `verification/revamp-R0-capture/before.spec.ts`，不放進 `tests/e2e`，不計入 E2E 數量；只拍照，僅斷言示範資料已載入（`kpi-contribution_after_marketing` 含 1,269,792.73）。
- 流程：開首頁 → 載入示範資料 → 依序切到 經營總覽／通路診斷／情境試算／行動摘要／資料工作區 → 捲到頂 → 各拍視窗截圖（PNG）與整頁截圖（JPEG q70）。
- 檔案：`verification/revamp-R0/before/{1-overview,2-diagnosis,3-scenarios,4-actions,5-data}-{desktop,laptop,tablet,mobile}-{viewport.png,full.jpg}`，共 40 張、7.5 MB。
- 尺寸：desktop 1440×1000、laptop 1280×900、tablet 768×1024、mobile 390×844。
- 目視觀察（供 R1 對照，不是本批缺陷）：1440×1000 載入示範後，總覽首屏依序為 AI 狀態橫幅、資料狀態列、工作區保存面板、期間列、下載鈕、會議設定表單，**KPI 卡完全不在首屏**；390×844 首屏只有導覽與頁首。此即 `01_BRIEF.md`／R1-4 要解決的問題。

## 4. testid 與 E2E 選擇器清單（R0-5）
`verification/revamp-R1/testids.txt`，五段：
- A. `src` 靜態 `data-testid`：40 個唯一值（附檔案與行號）
- B. `src` 動態 `data-testid`（樣板字串）：9 個（`action-${n}`、`baseline-${name}`、`import-preview-${role}`、`kpi-${name}`、`manager-priority-${code}`、`reconciliation-${field}`、`reconciliation-metric-${metric}`、`scenario-${n}`、`threshold-${id}`）
- C. E2E `getByTestId`：74 個唯一值（附使用檔案）
- D. E2E CSS／屬性選擇器（`locator`／`$`／`waitForSelector`）：33 個
- E. E2E `getByRole`／`getByLabel`／`getByText`／`getByPlaceholder`／`getByTitle`：247 個

R1 搬移元件時，A＋B 的 testid 與 D、E 的 role／label 文字都要原封保留；D、E 含大量中文按鈕名與 heading，R2 改名詞時需同批更新。

## 5. 變更檔案
- 新增：`src/i18n/index.ts`、`verification/revamp-R0-acceptance.md`、`verification/revamp-R0-capture.config.ts`、`verification/revamp-R0-capture/before.spec.ts`、`verification/revamp-R0/before/*`（40）、`verification/revamp-R1/testids.txt`
- 修改：`docs/STATUS.md`、`docs/DECISIONS.md`
- 未動：`src/domain/*`、`fixtures/*`、`docs/METRICS.md`、`docs/DATA_CONTRACT.md`、`package.json`／`package-lock.json`、`.env*`、所有元件與測試

## 6. 未執行與限制
- Live AI、真實營運資料、Safari／Firefox、實體裝置：**未執行**（R0 範圍外，與 main 相同）。
- `09_DECISIONS_PENDING.md` D1–D12 的「決定」欄全部空白；R0 不需任何決策，後續批次將依建議值執行並在回報標註。
- `src/i18n/index.ts` 的 `t()` 以 scratch 複本在 Node 實際執行確認：`metrics.net_revenue.label` → 淨營收、`metrics.contribution_after_marketing.short` → 廣告後貢獻、不存在路徑回傳路徑本身；尚無單元測試，R2 接線時隨 `labels-coverage.test.ts` 一起補。

## 7. 驗收條件
- [auto] 全套通過且與 main 相同數量：**通過**（819／404）
- [auto] `npm run build` 無警告新增：**通過**
- [manual] 截圖齊全：**通過**（5 頁 × 4 尺寸 × 視窗＋整頁）
