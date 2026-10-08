# Revamp v4 V4-0b 驗收：設計稿、PPT spike 與合成資料（不改任何 UI）（2026-10-08）

依 `docs/revamp-v4/06_BATCHES.md`「V4-0b 設計稿、PPT spike 與合成資料」第 1–4 項與「共同規則」。使用者 2026-10-08 回覆「全都依建議，並下一批 V4-0b」：D-V4-36 定為 A（TBT 門檻＝max(中位數 × 1.1, 中位數＋50 ms)）。H5 是人工關卡，使用者沒有表示略過，所以本批依 D-V4-27＝A 產出設計稿。結果細節寫在 `verification/revamp-v4/V4-0-baseline.md` §14。

工作方式：先提交開工錨點 `c4a2dc1`（D-V4-36 拍板與門檻敘述同步），再由四個 worktree 代理分工：A PPT spike `1f1656f`、B 4 通路合成資料 `5d88044`、C1 設計稿共用基礎與總覽、健檢兩頁 `0b4e65e`，三者並行；C2 在 B、C1 完成後合併兩者，做商品毛利與資料來源兩頁 `bd2fa60`。依序合併（`e356a81`、`d35a033`、`06a8cdc`、`dd9ba00`，無衝突），在主 checkout 的同一份 build 上跑完整驗收，最後收尾提交。

## 1. 完成項目（對照 06_BATCHES V4-0b）

| # | 項目 | 狀態 | 說明 |
|---|---|---|---|
| 1 | pptxgenjs `addChart` spike（D-V4-10、D-V4-34） | 完成；圖形成立，資料標籤另需拍板（D-V4-37） | `tests/pptx-chart-spike.test.ts`（5 個測試，只斷言能產生與解析）；`PPTX_SPIKE_OUT` 給值時才寫 `verification/revamp-v4/V4-0b/pptx-spike.json` 與三個 .pptx（A 版、B 版、合成橋接）。10 個檢查項在示範資料與合成橋接（跨 0、整段在 0 以下、負的本期）都成立。限制：資料標籤設定整張圖只有一份，不利系列的標籤不帶「−」、透明底段也會顯示標籤；`showValue:false` 加固定繪圖區可行，改用文字方塊標值。D-V4-34 試排：A 版第一張與現行輸出逐字相同、第二張瀑布 9.2 × 4.25 英吋；B 版文字被截斷、字級低於規格、瀑布只剩 A 的 15%，維持 A。**不接線** |
| 2 | 4 通路合成資料（D-V4-31） | 完成 | `tests/fixtures/synthetic-4-channel/`（manifest、三份 CSV、README 設計與手算摘要）、`tests/helpers/synthetic-4-channel.ts`、`tests/synthetic-4-channel.test.ts`（10 項手算核對）：4 通路；MARKETPLACE 本期扣廣告後 −5,200.00；LIVE 通路費用缺 9/14–9/19（6 天）、廣告缺 8/30–9/02（4 天，跨月）與 9/22；SOCIAL 平台抽成沖回、本期合計 −2,160.00、淨營收 40,290.00；5 個商品毛利為負的 SKU 跨 MARKETPLACE、SOCIAL；本期 17 天，最後一週 3 天；零貢獻門檻 104.0% 與 144.8% 都在 [−90%, +100%] 以外。`fixtures/` 沒有新增任何檔 |
| 3 | H5 設計稿（D-V4-27＝A） | 完成 | `verification/revamp-v4/mockups/`：總覽、健檢（示範資料）、商品毛利兩種狀態（示範資料、合成資料）、資料來源（合成資料），共用 `tokens.css`、`mockups.css`、`index.html`；數字由產生器 `gen/` 呼叫既有函式算出（重跑命令見 mockups/README.md §3，預設 `npm test` 不執行）；截圖 23 張與 `measure.json` 在 `verification/revamp-v4/V4-0b/mockups-shots/`。實測：G11 在 390 放得下（320 ≤ 324）、768 一列只放得下 1 張月曆（PRD 估 2 張）、`formatHeatCell`「−0.45」放得下；G20 三種記號在 35 天軸四種寬度都分得出，去年同期可用時 390 看不到缺列（D-V4-40）。設計稿不在 build 產物中（`.next` 內 0 個參照） |
| 4 | 紀錄寫進 `V4-0-baseline.md` | 完成 | §14.1 spike、§14.2 合成資料、§14.3 設計稿；設計稿與 PRD 的差異 29 點在 `mockups/README.md` §6 |

人工關卡：**H5（設計稿審查）未執行／待人工**，擋 V4-1；PPT 三個檔的人工開檔檢查（PowerPoint 或 Keynote）**未執行／待人工**（macOS Quick Look 不畫 pptxgenjs 圖表）。H6 未執行。

## 2. 變更檔案

- 新增（61）：`tests/pptx-chart-spike.test.ts`、`tests/synthetic-4-channel.test.ts`、`tests/helpers/synthetic-4-channel.ts`、`tests/fixtures/synthetic-4-channel/{manifest.json,sales_daily.csv,channel_costs_daily.csv,ad_spend_daily.csv,README.md}`、`verification/revamp-v4/mockups/`（`README.md`、`index.html`、`overview.html`、`diagnosis.html`、`products.html`、`products-synthetic.html`、`data.html`、`tokens.css`、`mockups.css`、`mockup-data.json`、`shoot.mjs`，產生器 `gen/` 14 檔）、`verification/revamp-v4/V4-0b/{pptx-spike.json,pptx-spike-A.pptx,pptx-spike-B.pptx,pptx-spike-synthetic.pptx}`、`verification/revamp-v4/V4-0b/mockups-shots/`（23 張截圖與 `measure.json`）。
- 開工錨點（`c4a2dc1`）：`docs/DECISIONS.md`、`docs/STATUS.md`、`docs/revamp-v4/{00_README.md,01_PRD.md,06_BATCHES.md,09_DECISIONS_PENDING.md}`、`verification/revamp-v4/V4-0-baseline.md`。
- 收尾提交：本文件、`docs/STATUS.md`、`docs/DECISIONS.md`、`docs/revamp-v4/{00_README.md,06_BATCHES.md,09_DECISIONS_PENDING.md}`、`verification/revamp-v4/V4-0-baseline.md`、`verification/revamp-v4/V4-0b/`（量測、截圖基準、Lighthouse）。
- 零改動：`src/` 全部、`fixtures/`、`docs/METRICS.md`、`package.json`、`package-lock.json`、`.env*`、`vercel.json`。

## 3. 驗收命令與真實結果

| 命令 | 結果 |
|---|---|
| `npm ci` | 未執行（lockfile 沒有變動） |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run audit:ui -- --json verification/revamp-v4/V4-0b/ui-audit.json` | 與 V4-0a 相同：hex 0（token 定義區 23）、圓角 4、字級 11、字距 0、箭頭 3、eyebrow 0、JSX 中文 0；labels 同義詞 12、其餘 0；靜態 testid 253、class 809 |
| `npm run contrast-check` | 75／75 通過 |
| `npm test -- --run` | **126 檔／2,474 測試全過**（V4-0a 124／2,459；本批新增 spike 5、合成資料 10）；跑完 `git status` 沒有任何證據檔被改寫 |
| `PPTX_SPIKE_OUT=verification/revamp-v4/V4-0b/pptx-spike.json npx vitest run tests/pptx-chart-spike.test.ts` | 5 passed；寫出 JSON 與三個 .pptx（代理 A 執行並提交；重跑時 JSON 逐字相同） |
| `npx vitest run --config verification/revamp-v4/mockups/gen/vitest.mockups.config.mts`（自我檢查）；再加 `MOCKUP_WRITE=1` | 1 passed；重新產生後設計稿與已提交版本逐位元相同 |
| `npm run build` | exit 0；`.next` 內設計稿與合成資料的參照 0 |
| `npm run test:e2e`（四個視窗，帶三個 `*_OUT`） | **791 passed、0 failed、9 skipped（23.4 分鐘）**；跑完還原 `verification/review-v2-a-*` 與 `verification/revamp-R6/` |
| PUBLIC_DEMO build 與伺服器（3100） | exit 0；`GET /` 200 |
| `CAPTURE_BATCH=V4-0b npx playwright test --config verification/revamp-v4.capture.config.ts`（先複製 V4-0a 的 52 張） | **23 passed、5 skipped，52 張 0 差異**；52 張也與 V4-0a 逐位元相同 |
| Lighthouse × 3（`scripts/lighthouse-pages.mjs`，開跑前 1 分鐘負載 3.87、3.71、2.73） | 三次都 exit 0 |
| `lsof -ti tcp:3100 \| xargs kill`；`lsof -ti tcp:3100` | 已停，沒有輸出 |
| `git diff --stat 625bfa5 -- src/domain fixtures docs/METRICS.md` | 空 |
| `git diff --stat 82b70df -- src/domain fixtures/golden fixtures/demo fixtures/errors fixtures/refund_only fixtures/zero_ad docs/METRICS.md` | 空 |
| `git diff --stat 625bfa5 -- src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts` | 空 |
| `git status --porcelain -- src/domain fixtures docs/METRICS.md src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts` | 空 |
| commit 之後 `git diff --stat 625bfa5 HEAD -- （同上第一條與第三條的路徑）` | 收尾提交後執行，結果與 hash 補在本列下方的 STATUS 段 |
| 合併後隱藏字元掃描 | 0 |

**棘輪與基準數值（與 V4-0a 比較）**

| 項目 | V4-0b | 與 V4-0a |
|---|---|---|
| design-lint 15 項、copy-style | 同 V4-0a | 不變 |
| copy-density（七頁） | 試算 1，其餘 0 | 不變 |
| chart-lint CL-1–CL-11 | 全部 0 | 不變 |
| testid 刪除數（v2、v3、v4 新增） | 0、0、0；本批沒有新增 testid | 不變 |
| First Load JS gzip | 519,426 bytes；禁止符號全 0 | 不變 |
| B2 首屏（1440／1280／390） | 一句話頂 192／192／116、KPI 帶底 419／419／555、三件事首列底 561／583／807、扣廣告後貢獻值頂 323／323／295 | 不變 |
| B3 | 七頁 390 寬 scrollWidth 390 | 不變 |
| B9 DOM 節點數 | 總覽 3,075（1440）／3,062（390），其餘頁與 V4-0a 相同 | 不變 |
| Lighthouse Accessibility | 1440、390 各 8 頁全部 100（三次），失敗審核 0 | 不變 |
| Lighthouse Performance（空狀態首頁） | 1440 100、390 94（三次） | 不變 |
| 390 TBT 中位數（ms）與門檻（D-V4-36） | 載入示範資料 1,059.9 ≤ 1,109.1；通路健檢 762.1 ≤ 832.3；商品毛利 82.1 ≤ 129.9；會議紀錄 1,020.1 ≤ 1,071.2；資料來源 6.0 ≤ 50.0 | 五項都通過 |
| CLS | 390 切到商品毛利、資料來源 0.054，切到待辦 0.053 | 不變（v3.0.0 既有） |
| axe 四尺寸 | serious、critical、moderate、minor 全 0 | 不變 |
| keyboard-walk | 里程碑 Tab 數與 V4-0a 完全相同；`aria-hidden` 內停留點 desktop 0、mobile 2（已知，V4-1 修） | 不變 |
| network-log | desktop、mobile 各 15 個請求；外部來源 0、非 GET 0、CSV 內容外洩 0、失敗資源 0、console 錯誤 0 | 不變 |
| 畫面基準 | 本批不允許畫面變動：52 張 0 差異 | 不變 |

## 4. 瀏覽器驗收方式與截圖

- 產品畫面：`verification/revamp-v4/V4-0b/snapshots/{desktop,laptop,tablet,mobile}/`（1440×1000、1280×900、768×1024、390×844 各 13 張，與 V4-0a 逐位元相同）。
- 設計稿：用瀏覽器直接開 `verification/revamp-v4/mockups/index.html`（file://，不需要伺服器）；截圖在 `verification/revamp-v4/V4-0b/mockups-shots/`，例如 `overview-1440-full.png`、`overview-390-full.png`、`diagnosis-768-full.png`、`diagnosis-1280-full.png`、`products-synthetic-390-full.png`、`data-1440-annotated.png`。
- PPT spike：`verification/revamp-v4/V4-0b/pptx-spike-A.pptx`、`pptx-spike-B.pptx`、`pptx-spike-synthetic.pptx`，需用 PowerPoint 或 Keynote 開檔看圖（待人工）。
- 量測檔：`verification/revamp-v4/V4-0b/{metrics.json,first-load-modules.json,ui-audit.json,axe.json,keyboard-walk.json,network-log.json}`、Lighthouse 報告 `verification/revamp-v4/V4-0b/lighthouse/`、第 1、2 次數值 `lighthouse-runs/`。

## 5. 已知限制與風險

- **PPT 資料標籤**：spike 證實圖形可行，但標籤要改用文字方塊（D-V4-37 待拍板）。pptxgenjs 以模組層級計數器命名 chart part，V4-9a 的測試不要寫死 `chart1.xml`；spike 用攔截 `write()` 的方式加第二張，V4-9a 原生產生第二張後若帶環境變數重跑，JSON 的 `twoSlides` 會變成 false（不影響 `npm test`）。
- **設計稿與 PRD 的差異**（`mockups/README.md` §6 共 29 點）：會改變規格的列為 D-V4-37 到 D-V4-41；其餘交 H5 判斷，重點如下。
  - G1、G2 共同尺度讓 G1 變扁約 40%，下界要延伸一個步長才能容納負值（D-V4-41）。
  - G13 的「兩欄並排」在半寬格放不下（D-V4-38）；G14 在 390 只剩 32px（D-V4-39）；去年同期可用時 G20 在 390 看不到缺列（D-V4-40）。
  - 768 寬 G11 一列只放得下 1 張月曆（已寫進 06 V4-3b 段，以實測為準）；G12 在 768 子圖只有 80px；G5 損益兩平 MER 的 bullet 永遠滿格；G9 門檻 0.00 時刻度與零線重疊；G13、G14 在 180px 框只用到 80–160px；G22 成對條幾乎看不出差別，是否保留請 H5 判斷。
  - 示範資料的商品頁兩張前 10 名表上下錯開約 380px，PRD §5.3「兩格等高」做不到。
  - 合成資料直接載入時產品寫「示範資料」（`source_type` synthetic），設計稿照匯入後寫「本機匯入」。
- **設計稿的新字串**：總覽 5、健檢 29、商品 22、資料來源 33 個提案字串，都在頁尾清單與 `mockup-data.json`，H5 一併審；不進 labels，等各批實作時才加。
- **G20 的檔期軌與去年同期是設計稿假設**：合成資料沒有 events.csv，也沒有一年前資料，設計稿另畫示意狀態並標明。
- 人工關卡 H5、H6 與 PPT 人工開檔未執行。

## 6. 下一步、人工關卡與待拍板

- **下一批 V4-1**（總覽拆解與圖表框：G1、G2、G6，含 390 瀑布外框的 `aria-hidden` 停留點修正）。被以下事項擋住：
  - 人工關卡 **H5**（設計稿審查，2–3 位台灣電商經理人看 `verification/revamp-v4/mockups/`）；使用者可比照 v3 略過（D-V4-27）。
  - **D-V4-41**（G1、G2 共同尺度，建議 A：維持共同尺度、下界可延伸一個步長）。
- **本批新增的待拍板**（`docs/revamp-v4/09_DECISIONS_PENDING.md`）：D-V4-37（PPT 資料標籤，建議 A，擋 V4-9a）、D-V4-38（G13 版面，建議 A 各寬度上下排列，擋 V4-4）、D-V4-39（G14 在 390，建議 A 不畫右側累計，擋 V4-4）、D-V4-40（G20 軸範圍，建議 A 固定為兩期範圍，擋 V4-7a）、D-V4-41（擋 V4-1）。
- **部署**：本批沒有部署。
