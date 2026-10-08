# Revamp v4 V4-2 驗收：總覽其他圖（G3、G4、G5、G7a）（2026-10-09）

依 `docs/revamp-v4/06_BATCHES.md`「V4-2 總覽其他圖」、`docs/revamp-v4/CHART_CATALOG.md` 的 G3、G4、G5、G7 實作卡、PRD §4、§6（C18、C19、C33）、§7、§8.7。依賴：V4-1 完成；D-V4-6＝A、D-V4-16＝A、D-V4-18＝A；使用者 2026-10-08 回覆「都依建議值繼續推進，並進行下一批 V4-2」，D-V4-37 到 D-V4-41 全部定為 A。D-V3-35 不在這次回覆的範圍，本批不做（期間列與趨勢圖下兩處都保留去年同期不可用的原因）。本批完成後到 MVP 切線。

工作方式：先提交開工錨點 `4871527`（拍板紀錄、共用 token `--chart-target`、`--chart-h-xs`、`chartColors.target`、`chartHeights.xs`、contrast PAIRS 77 組、labels 與 `globals.css` 錨點）。代理 A（G7a：`assistWeeks`、C19 Sparkline、C33 ChartDataTable、`arrangeVersion`，`e48ee6a`）、B（G3 刻度、G4 差額條，`7b78fcc`）、C（C18 Bullet、MER bullet，`f97ffd1`）並行；代理 E 合併三者（labels 的 `overview.chartsV4` 兩處衝突，保留三方內容），擴 E2E 並跑全套（`853b208`）。主流程合併 E（`274e229`），審查應用層差異後在主 checkout 跑完整驗收並收尾提交。

## 1. 完成項目（對照 06_BATCHES V4-2）

| 項目 | 狀態 | 說明 |
|---|---|---|
| C33 ChartDataTable | 完成 | `src/components/charts/chart-data-table.tsx`：`div.table-scroll[role=region][tabindex=0]` 內的 `table.chart-data-table`，caption 同時是捲動區的 aria-label，每格以 `evidenceOf` 回傳抽屜內容（null 時為純文字）；另匯出 `chartDataTable`（給 ChartFrame 的 `dataTable`）與 `ChartDataDetails`（收合時保持掛載、展開記 `chart_table_opened`）。第一個使用者是 G7a 的「各指標每週」 |
| G3 刻度改 `formatAxisWan` | 完成 | 刻度改由 `trendAxis` 自算（1／2／2.5／5 × 10ⁿ、含 0，Recharts 的 tickFormatter 拿不到整組刻度）；示範資料 150 萬、100 萬、50 萬、0，位置與 v3 相同、不再出現「.0 萬」；末點標值、三項圖例、390 的去年同期線與下鑽都不變（`tests/e2e/trend-yoy.spec.ts` 原樣通過） |
| G4 緊湊表差額欄與差額條 | 完成 | 差額欄表頭沿用既有「差額（元）」；BarCell variance（`chart-overview-channels-bar-{channel}`，有利用 `--chart-total`，不利用 `--chart-unfavorable`）；差額 number-link 與差額條用新的 `channelChangeEvidence`（帶兩期組成），長條沿用 `channelEvidence`（大數字不帶正負號、四層階梯）；`metricComparison` 改為匯出、邏輯不變；390 時條在數字上方一行 |
| C18 Bullet 抽成共用元件；`--chart-target` | 完成 | `src/components/overview/charts/bullet.tsx`；KPI 帶 markup 與 v3 `targetBar` 逐字相同（`tests/bullet.test.tsx` 以 v3 版本為對照組比對格點與 2,000 組隨機值），畫面 13 四尺寸與 V4-1 逐像素相同；`.kpi-bullet*` 三個色改引用 `--chart-total`、`--chart-unfavorable`、`--chart-target`（值與原本相同） |
| 損益兩平 MER 段加 bullet | 完成 | `chart-overview-bullet-bar-mer`，放在損益兩平表格之外、一句結論之後（表格 tbody 仍只有 1 列，`revamp-r4`、`breakeven-mer` E2E 不改）；示範資料實際 11.4 倍對損益兩平 4.0 倍（比值 2.84），細條滿格；實際或損益兩平為 null 時整行不出現 |
| C19 Sparkline＋G7a；`assistWeeks`（`assist-weeks-v1`） | 完成 | `src/application/chart-assist-weeks.ts`（只整理 domain 既有每週值，不做新算術；手算 golden：示範資料逐週件數 1,223、1,173、1,248、1,252、1,260、1,264，合計 7,420＝期間件數）；`weeklyRows` 加 `units_sold`（取自 `aggregatePeriod`，不進匯出、備份與 hash，4 組資料的既有匯出逐位元組相同）；`isFullWeek` 改為匯出；欄名「近 6 週」；七條 sparkline（損益兩平 MER 列不畫）；未滿 7 天的週畫空心點，用 4 通路合成資料驗證（X40） |
| `EvidenceSelection.arrangeVersion` | 完成 | 抽屜技術細節在 `metric_version` 之後另列 `evidence-arrange-version`（「圖表整理版本」），有給時才顯示；G7a 各週格的 `metric_version` 維持 `contribution-v1`（件數、件均為 `assist-kpi-v1`），另列 `assist-weeks-v1` |
| `--chart-h-xs` | 完成 | 16px（開工錨點宣告，sparkline 用） |
| D-V3-35 | 不做 | 沒有回覆 |
| 同批 labels 與測試 | 完成 | labels 新增 10 個 key（`overview.chartsV4.assistSpark` 6、`channels` 2、`bullet` 1、`evidence.chartsV4.arrangeVersion` 1），既有 2,581 個字串逐字不變。單元新增 `chart-assist-weeks.test.ts`、`chart-geometry-v4.test.ts`、`assist-spark.test.tsx`、`bullet.test.tsx`、`overview-g4.test.tsx`，擴 `trend-yoy.test.tsx`、`overview-charts-frame.test.tsx`、`overview-structure.test.tsx`、`evidence-drawer-v3.test.tsx`、`workspace.test.ts`、`chart-theme.test.ts`、`mounted-testids.test.tsx`（V4-2 錨點，新增頁面狀態 `overview-synthetic`）。E2E 擴 `charts-overview.spec.ts`（V4-2 七條 × 4 尺寸）與 `chart-helpers-v4.ts` |

## 2. 變更檔案

- 新增：`src/application/chart-assist-weeks.ts`、`src/components/charts/{sparkline.tsx,chart-data-table.tsx}`、`src/components/overview/assist-spark.tsx`、`src/components/overview/charts/bullet.tsx`、`tests/{chart-assist-weeks.test.ts,chart-geometry-v4.test.ts,assist-spark.test.tsx,bullet.test.tsx,overview-g4.test.tsx}`、本文件、`verification/revamp-v4/V4-2/`。
- 修改：`src/app/globals.css`（開工錨點的兩個 token；V4-2 A、B、C 錨點；`.kpi-bullet*` 三個色改引用 token，值不變）、`src/application/{chart-theme.ts,chart-takeaways.ts,manager-summary.ts,workspace.ts}`（只新增或改為匯出）、`src/components/{overview.tsx,evidence-drawer.tsx}`、`src/components/overview/{assist-table.tsx,charts/channel-section.tsx,charts/trend-section.tsx}`、`src/i18n/labels.zh-TW.ts`、`scripts/contrast-check.mjs`、多支測試（見上表）、`tests/e2e/{charts-overview.spec.ts,chart-helpers-v4.ts}`、`tests/helpers/page-states.tsx`、`verification/revamp-v4/{testids-v4-added.txt,e2e-text-assertions.csv,feature-retention.csv}`、`docs/revamp-v4/{CHART_CATALOG.md,01_PRD.md,06_BATCHES.md,09_DECISIONS_PENDING.md,00_README.md}`、`docs/{STATUS.md,DECISIONS.md}`。
- 零改動：`src/domain`、`fixtures`、`docs/METRICS.md`、`src/application/{assist-kpi.ts,breakeven-mer.ts}`、`package.json`、`package-lock.json`、`.env*`、`vercel.json`。

## 3. 驗收命令與真實結果

| 命令 | 結果 |
|---|---|
| `npm ci` | 未執行（lockfile 沒有變動） |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run audit:ui -- --json verification/revamp-v4/V4-2/ui-audit.json` | design 15 項與 V4-1 相同（hex 0、圓角 4、字級 11、字距 0、箭頭 3，其餘 0）；labels 同義詞 12、其餘 0；資訊欄：靜態 testid 相異 252、class 824 |
| `npm run contrast-check` | 77／77 通過（新增 `--chart-target` 對白底與 `--bg-subtle` 兩組） |
| `npm test -- --run` | **134 檔／2,629 測試全過**（V4-1 129／2,539） |
| `npm run build` | exit 0 |
| `npm run test:e2e`（四個視窗，帶三個 `*_OUT`） | **841 passed、0 failed、15 skipped（25.0 分鐘）**；新增 28 條（charts-overview V4-2 七條 × 4 尺寸）；跑完還原 E2E 改寫的追蹤證據檔 |
| PUBLIC_DEMO build 與伺服器（3100） | exit 0；`GET /` 200 |
| `CAPTURE_BATCH=V4-2 npx playwright test --config verification/revamp-v4.capture.config.ts`（先複製 V4-1 的 52 張） | 第 1 次 19 passed、4 failed、5 skipped：差異只有四個尺寸的 02；01、03 與畫面 13（KPI 帶元素截圖）都 0 差異 |
| 同上加 `--update-snapshots=changed`（只跑 baseline） | 16 passed；與 V4-1 不同的檔正好是四張 02 |
| 同上第 2 次（完整） | **23 passed、5 skipped**，52 張全部通過；metrics 硬斷言全部通過 |
| Lighthouse × 3（開跑前 1 分鐘負載 3.25、3.97、3.75） | 三次都 exit 0 |
| `lsof -ti tcp:3100 \| xargs kill`；`lsof -ti tcp:3100` | 已停，沒有輸出 |
| 禁區四條命令（`625bfa5`、`82b70df`、assist-kpi／breakeven-mer 四檔、`git status --porcelain`） | 四條都空 |
| commit 之後 `git diff --stat 625bfa5 HEAD -- （禁區與 assist-kpi、breakeven-mer 路徑）` | 空（收尾 commit `0b980fc`） |
| 合併後隱藏字元掃描 | 0 |

**棘輪與基準數值**

| 項目 | V4-2 | 與基準 |
|---|---|---|
| design-lint 15 項、copy-style、copy-density、chart-lint CL-1–CL-11 | 不變（chart-lint 全 0，掃描範圍多了 `src/components/charts/` 的 sparkline、data table 與新頁面狀態 `overview-synthetic`） | 上限檔不動 |
| testid 刪除數（v2、v3、v4 新增） | 0、0、0；`testids-v4-added.txt` 新增 13 列（sparkline 7、`chart-overview-assist-table`、`evidence-arrange-version`、通路差額條 3、MER bullet 1） | — |
| labels 快照 | 2,581 個鍵逐字相同；新 key 共 11 個（V4-1 的 1 個＋本批 10 個），都在 `chartsV4` 前綴 | — |
| First Load JS gzip（B5） | 524,280 bytes（V4-0a 519,426，＋4,854；V4-1 520,984；門檻 545,397）；禁止符號全 0 | 通過 |
| B2 首屏（1440／1280／390） | 一句話頂 192／192／116、KPI 帶底 419／419／555、三件事首列底 561／583／807、扣廣告後貢獻值頂 323／323／295 | 不變 |
| B1 總覽第一張 `.chart-frame` 頂 | 1440 855（＝上限）、1280 921、390 1,827 | 不變 |
| B3 | 七頁 390 寬 scrollWidth 390 | 不變 |
| B9 總覽 DOM 節點數 | 1440 3,272、1280 3,296、390 3,259（V4-0a＋197；門檻＋1,500）；其餘六頁不變 | 通過 |
| Lighthouse Accessibility | 1440、390 各 8 頁全部 100（三次），失敗審核 0 | 不變 |
| Lighthouse Performance（空狀態首頁） | 1440 100（三次）；390 97、94、97 | ≥ 90 |
| 390 TBT 中位數（ms）與門檻（D-V4-36） | 載入示範資料 1,045.6 ≤ 1,109.1；通路健檢 771.0 ≤ 832.3；商品毛利 78.3 ≤ 129.9；會議紀錄 997.6 ≤ 1,071.2；資料來源 1.7 ≤ 50.0 | 五項通過 |
| CLS | 總覽載入 390 0.001、1440 0 | < 0.05 |
| axe 四尺寸 | serious、critical、moderate、minor 全 0 | 不變 |
| keyboard-walk | `aria-hidden` 內停留點 1440、768、390 都是 0；各頁里程碑 Tab 數與 V4-1 相同（總覽第一張 KPI 1440 第 11、390 第 4）；總覽 main 內停留點各多 3 個（1440 93、768 95、390 80：兩個差額 number-link 與「各指標每週」summary）；sparkline 與差額條不是停留點 | 符合 |
| network-log | desktop、mobile 各 15 個請求；外部來源 0、非 GET 0、CSV 內容外洩 0、失敗資源 0、console 錯誤 0 | 不變 |
| 功能保留表 | `batch` 含 V4-2 的 11 列（24、25、26、28、30、55、56、G3、G4、G5、G7a）全部打勾 | 完成 |

**畫面基準差異（只列允許變動的畫面）**

| 畫面 | 尺寸 | 差異像素 | 理由 |
|---|---|---|---|
| 02 總覽整頁 | desktop、laptop、tablet、mobile | 271,443／239,237／261,148／172,951（約 7%、6%、8%、10%） | G3、G4 刻度改整數萬；G4 緊湊表多差額欄與差額條；其他常用指標表多「近 6 週」sparkline 欄；損益兩平段多 MER bullet 一行；面板最後多收合的「各指標每週」；768 到 1099px 兩張緊湊表改上下一欄 |

01（總覽首屏）、03（抽屜）、畫面 13（KPI 帶，含達成與落後兩種目標細條）四個尺寸都與 V4-1 逐像素相同。

## 4. 瀏覽器驗收方式與截圖

- 截圖：`verification/revamp-v4/V4-2/snapshots/{desktop,laptop,tablet,mobile}/`（各 13 張）。看本批變化：`desktop/02-overview-full.png`、`tablet/02-overview-full.png`、`mobile/02-overview-full.png`（頁面下半的趨勢、各通路、其他常用指標）。
- 方式：本機 production build、PUBLIC_DEMO 伺服器；`toHaveScreenshot`（0 像素差、threshold 0.02）；E2E 四個視窗用 LOCAL 伺服器（`charts-overview.spec.ts` 逐項斷言刻度、差額條、抽屜、MER bullet、sparkline、各指標每週與合成資料的空心點）。
- 量測檔：`verification/revamp-v4/V4-2/{metrics.json,first-load-modules.json,ui-audit.json,axe.json,keyboard-walk.json,network-log.json}`、`lighthouse/`、`lighthouse-runs/`。

## 5. 已知限制與風險

- **MER bullet 在示範資料永遠滿格**：實際 MER 是損益兩平的 2.84 倍，細條夾在 0 到 1；照 PRD 畫，H5 已看過。
- **MER bullet 的落後判斷用到 0.1% 的比值**：沿用 v3 的取位，是 KPI 帶逐字相同的必要條件；實際 MER 落在損益兩平的 99.95% 到 100% 之間時細條不上不利色，但一句結論會寫「低於」。示範資料與 golden 都碰不到。
- **sparkline 在本期值資料待補或不適用時不畫**（CL-1 要求同列有數字）；那幾週的數字仍在「各指標每週」表。
- **B1 仍然沒有餘裕**：1440 總覽第一張 `.chart-frame` 頂 855，等於上限；V4-3a 起各批不能讓總覽首屏變高。
- **新頁面狀態 `overview-synthetic`**：mounted-testids 兩條寫死總覽狀態名單的既有測試加了這個名稱（檢查內容不變）；之後的批次若再寫死名單要算進去。
- **E2E 的合成資料測試經匯入精靈帶 manifest**：之後若改精靈的 manifest 流程，這條會先壞。
- 人工關卡 H6、PPT spike 人工開檔未執行。

## 6. 下一步、人工關卡與待拍板

- **MVP 切線已到**（V4-0a 到 V4-2：總覽改版完整）。依 D-V4-28，經使用者當次明確同意可以把 `revamp/v4` 部署成 Vercel preview 給老闆試用；正式站到 V4-11 才切。沒有同意就不部署。
- **下一批 V4-3a**（通路健檢一：G9 健檢清單影響條、G10 每 100 元淨營收去向、G7b 通路寬表 sparkline）。依賴 V4-2 與 D-V4-6、18、19、32（已拍板）；D-V3-31 只在回覆 B 時一起做。
- **待拍板**：D-V4 系列全部定案；v3 尚待的 D-V3-26／27／29–37 仍待回覆（D-V3-35 與總覽相關，回覆 A 才做）。
- **部署**：本批沒有部署。
