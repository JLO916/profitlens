# Revamp v4 V4-3a 驗收：通路健檢（一）（G9、G10、G7b）（2026-10-09）

依 `docs/revamp-v4/06_BATCHES.md`「V4-3a 通路健檢（一）」（含 2026-10-09 補充）、`docs/revamp-v4/CHART_CATALOG.md` 的 G7（b）、G9、G10 實作卡、PRD §4、§6（C24 tick、C27）、§7、§8.7。依賴：V4-2 完成；D-V4-6、18、19、32 已拍板；使用者 2026-10-09 回覆「下一批 V4-3a，待拍版的都用建議值」，D-V3-26／27／29–37 依建議值，其中 D-V3-31＝B 併入本批（管理損益表「佔淨營收 %」可開抽屜）。

工作方式：先提交開工錨點 `f785cc4`（v3 拍板紀錄與排程、`--chart-seg-1..3`、`chartColors.seg1..3`、contrast PAIRS 80 組、labels `diagnosis.chartsV4` 錨點、`globals.css` 錨點、`Diagnosis` 的 G10 插入點與 `ChannelWideTable` 的選填 `snapshot`）。代理 A（G10、抽屜 `valueKind`／`percent`／`ladderMetrics` 修正、管理損益表佔比，`fa54918`）、B（G7b，`722f9aa`）、C（G9 與 C24 tick，`896179f`）並行；代理 E 合併三者（labels 的 `diagnosis.chartsV4` 兩處衝突，三方內容都保留）、補合併後才能寫的 SSR 測試、寫 E2E 並跑全套（`327443b`）。主流程合併 E（`63eb0d6`），審查應用層差異後在主 checkout 跑完整驗收並收尾提交。

## 1. 完成項目（對照 06_BATCHES V4-3a）

| 項目 | 狀態 | 說明 |
|---|---|---|
| G9 健檢清單內嵌影響金額條（C24 加 tick 與空心條） | 完成 | 只對 `REV_UP_CM_DOWN`（總差額，空心條）與四個費用負擔規則畫；水準類 `NEGATIVE_CHANNEL_CM`、`SKU_NEGATIVE_GP` 不畫；共用尺度只取差額類；費用規則影響為正時照有利色往右；清單下方一行說明空心與實心條；`chart-diagnosis-impact-bar-{rule}`。條不可點，依 PRD §4.5（條在 `<summary>` 內，點條等於展開或收合該列）。BarCell 既有 variance 輸出逐字不變 |
| C27 ShareStack＋G10 每 100 元淨營收去向 | 完成 | `channelStructure`（`channel-structure-v1`，只管四項費用合計與超過 100 的幾何，用 domain 的 `sumAmounts`、`ratioMetric` 與精確小數）；各通路的剩與段比率直接用 `profitWaterfall(snapshot, channel)`；示範資料 MARKETPLACE 超過 100 照常畫（`…-seg-MARKETPLACE-over`，不利色），合計剩 16.2；`refund_only` 出現「不適用」列並用 `title.notApplicable`；通路 ≤ 5 用 sm、6–8 用 lg、> 8 只留表，svg 高＝（通路數＋2）× 24；相鄰段靠 1px 分隔線（D-V4-19＝B） |
| G7b 通路寬表「近 {n} 週」與「各通路每週」 | 完成 | `channelWeeks`（`channel-weeks-v1`，不放進 `createSnapshot`，健檢頁元件內 `useMemo`）；通路 > 8 時不呼叫，改一句說明（`channel-weeks-too-many`）；格的抽屜 `metric_version` 維持 `contribution-v1`，另列 `channel-weeks-v1`；會議摘要的 default 變體不變 |
| `EvidenceSelection.valueKind`、`unitOverride: "percent"`、`ladderMetrics` 修正 | 完成 | `valueKind` level 時大數字與精確值不帶正負號；`percent` 顯示比率的 L1／L3 與「百分比顯示時乘以 100」；`ladderMetrics` 只在 `evidence.channels` 等於 `report.scope.channels` 時查週與去年同期（單一通路週證據不畫全通路階梯，SSR 斷言；暫時拿掉修正時 2 條測試會失敗） |
| D-V3-31＝B：管理損益表「佔淨營收 %」可開抽屜 | 完成 | 13 格改成 number-link（`pnl-share-{metric}`），開抽屜顯示分子、分母與比率；管理損益表在收合的 `overview-advanced` 內，畫面 02 不變 |
| `--chart-seg-1..3` | 完成 | 開工錨點宣告；對白底 7.68、5.57、3.58；相鄰段 1.38、1.55（依 D-V4-19＝B 只記錄） |
| 同批 labels 與測試 | 完成 | labels 新增 25 個 key（`diagnosis.chartsV4.impact` 1、`share` 16、`channelsSpark` 5、`evidence.chartsV4.percent` 3），既有 2,581 個字串逐字不變。單元新增 `chart-structure.test.ts`、`chart-channel-weeks.test.ts`（含記憶體中 50 通路 × 92 天的 helper）、`diagnosis-g9.test.tsx`，擴 `chart-geometry-v4.test.ts`、`evidence-drawer-v3.test.tsx`、`pnl-table-ui.test.tsx`、`diagnosis-v3.test.tsx`、`workspace.test.ts`、`bar-cell.test.ts`、`chart-theme.test.ts`、`diagnosis-list.test.ts`、`mounted-testids.test.tsx`（V4-3a 四條 M1；新增頁面狀態 `diagnosis-synthetic`、`diagnosis-many-channels`）。E2E 新增 `charts-diagnosis.spec.ts`（11 條 × 4 尺寸），擴 `chart-helpers-v4.ts`，改 `pnl-table.spec.ts`（佔比欄成為 number-link 後的計數）、`revamp-r5.spec.ts`（寬表定位器與群組列）；`metrics.spec.ts` 加第一個 G9 條頂 ≤ 900 與三尺寸健檢首列底的硬斷言 |

## 2. 變更檔案

- 新增：`src/application/{chart-structure.ts,chart-channel-weeks.ts}`、`src/components/charts/share-stack.tsx`、`src/components/diagnosis/share-section.tsx`、上表新測試、`tests/e2e/charts-diagnosis.spec.ts`、本文件、`verification/revamp-v4/V4-3a/`。
- 修改：`src/app/globals.css`（開工錨點的三個 token；V4-3a A、B、C 錨點）、`src/application/chart-theme.ts`、`src/components/{channel-table.tsx,diagnosis-list.tsx,evidence-drawer.tsx,workspace-panels.tsx}`、`src/components/charts/bar-cell.tsx`、`src/components/overview/pnl-table.tsx`、`src/i18n/labels.zh-TW.ts`、`scripts/contrast-check.mjs`、上表擴充的測試、`tests/helpers/page-states.tsx`、`tests/e2e/{chart-helpers-v4.ts,pnl-table.spec.ts,revamp-r5.spec.ts}`、`verification/revamp-v4-capture/metrics.spec.ts`、`verification/revamp-v4/{testids-v4-added.txt,e2e-text-assertions.csv,feature-retention.csv}`、`docs/revamp-v4/{01_PRD.md,CHART_CATALOG.md,06_BATCHES.md,09_DECISIONS_PENDING.md,00_README.md}`、`docs/revamp-v3/09_DECISIONS_PENDING.md`、`docs/{STATUS.md,DECISIONS.md}`。
- 零改動：`src/domain`、`fixtures`、`docs/METRICS.md`、`src/application/{assist-kpi.ts,breakeven-mer.ts}`、`package.json`、`package-lock.json`、`.env*`、`vercel.json`。

## 3. 驗收命令與真實結果

| 命令 | 結果 |
|---|---|
| `npm ci` | 未執行（lockfile 沒有變動） |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run audit:ui -- --json verification/revamp-v4/V4-3a/ui-audit.json` | design 15 項與 V4-2 相同（hex 0、圓角 4、字級 11、字距 0、箭頭 3，其餘 0）；labels 同義詞 12、其餘 0；資訊欄：靜態 testid 相異 252、class 834 |
| `npm run contrast-check` | 80／80 通過 |
| `npm test -- --run` | **137 檔／2,723 測試全過**（V4-2 134／2,629） |
| `npm run build` | exit 0 |
| `npm run test:e2e`（四個視窗，帶三個 `*_OUT`） | **885 passed、0 failed、15 skipped（25.7 分鐘）**；新增 44 條（charts-diagnosis 11 條 × 4 尺寸）；跑完還原 E2E 改寫的追蹤證據檔 |
| PUBLIC_DEMO build 與伺服器（3100） | exit 0；`GET /` 200 |
| `CAPTURE_BATCH=V4-3a npx playwright test --config verification/revamp-v4.capture.config.ts`（先複製 V4-2 的 52 張） | 第 1 次 15 passed、8 failed、5 skipped：差異只有四個尺寸的 05 與 10；其餘 44 張 0 差異（含 01、02、03、11、13） |
| 同上加 `--update-snapshots=changed`（只跑 baseline） | 16 passed；與 V4-2 不同的檔正好是那 8 張 |
| 同上第 2 次（完整） | **23 passed、5 skipped**，52 張全部通過；metrics 硬斷言全部通過 |
| Lighthouse × 3（開跑前 1 分鐘負載 3.99、3.20、3.29） | 三次都 exit 0 |
| `lsof -ti tcp:3100 \| xargs kill`；`lsof -ti tcp:3100` | 已停，沒有輸出 |
| 禁區四條命令（`625bfa5`、`82b70df`、assist-kpi／breakeven-mer 四檔、`git status --porcelain`） | 四條都空 |
| commit 之後 `git diff --stat 625bfa5 HEAD -- （禁區與 assist-kpi、breakeven-mer 路徑）` | 空（收尾 commit `eea57c4`） |
| 合併後隱藏字元掃描 | 0 |

**棘輪與基準數值**

| 項目 | V4-3a | 與基準 |
|---|---|---|
| design-lint 15 項、copy-style、copy-density、chart-lint CL-1–CL-11 | 不變（chart-lint 全 0，掃描範圍多了 ShareStack、G10、兩個新頁面狀態） | 上限檔不動 |
| testid 刪除數（v2、v3、v4 新增） | 0、0、0；`testids-v4-added.txt` 新增 37 列（G10 區塊與表 2、段 12、`pnl-share-*` 13、G7b 3＋表 1、`channel-weeks-too-many`、G9 條 5），累計 59 列 | — |
| labels 快照 | 2,581 個鍵逐字相同；v4 新 key 累計 36 個，都在 `chartsV4` 前綴 | — |
| First Load JS gzip（B5） | 530,878 bytes（V4-0a 519,426，＋11,452；V4-2 524,280，本批＋6,598；門檻 545,397，剩 14,519） | 通過 |
| B2 首屏（1440／1280／390） | 一句話頂 192／192／116、KPI 帶底 419／419／555、三件事首列底 561／583／807、扣廣告後貢獻值頂 323／323／295 | 不變 |
| B1 | 總覽第一張 `.chart-frame` 頂 1440 855（＝上限）；健檢首列底 1440 888、1280 888、390 985（都等於 V4-0a 實測，本批起三尺寸硬斷言）；第一個 G9 條頂 1440 300、390 259（≤ 900） | 通過 |
| B3 | 七頁 390 寬 scrollWidth 390 | 不變 |
| B9 DOM 節點數 | 健檢 1,534（三尺寸，V4-0a＋210；門檻＋1,500）；總覽 1440 3,285（＋13：收合的管理損益表多 13 個佔比 number-link） | 通過 |
| Lighthouse Accessibility | 1440、390 各 8 頁全部 100（三次），失敗審核 0 | 不變 |
| Lighthouse Performance（空狀態首頁） | 1440 100（三次）；390 95、94、94 | ≥ 90 |
| 390 TBT 中位數（ms）與門檻（D-V4-36） | 載入示範資料 941.4 ≤ 1,109.1；通路健檢 791.0 ≤ 832.3；商品毛利 73.8 ≤ 129.9；會議紀錄 969.9 ≤ 1,071.2；資料來源 0 ≤ 50.0 | 五項通過 |
| CLS | 切到通路健檢 390、1440 都是 0；總覽載入 390 0.001 | < 0.05 |
| axe 四尺寸 | serious、critical、moderate、minor 全 0 | 不變 |
| keyboard-walk | `aria-hidden` 內停留點 0；里程碑「健檢第一列」1440 第 8、390 第 2（不變）；健檢 main 內停留點多 2 個（1440 71、390 61：G10 與「各通路每週」兩個資料表的 summary）；G9、G10、G7b 的圖形都不是停留點 | 符合 |
| network-log | desktop、mobile 各 15 個請求；外部來源 0、非 GET 0、CSV 內容外洩 0、失敗資源 0、console 錯誤 0 | 不變 |
| 功能保留表 | `batch` 含 V4-3a 的 7 列（33、34、55、G7b、G9、G10、MV4）全部打勾 | 完成 |

**畫面基準差異（只列允許變動的畫面）**

| 畫面 | 尺寸 | 差異像素 | 理由 |
|---|---|---|---|
| 05 健檢整頁 | desktop、laptop、tablet、mobile | 672,826／598,862／483,289／197,707（約 15%、15%、18%、13%） | 健檢清單每列多 G9 條（≥ 1024 影響金額欄改 `minmax(160px, max-content)`）；清單下多一行說明；新增 G10 區塊；寬表多「近 6 週」欄與「各通路每週」summary；768 有兩個長標題折成兩行 |
| 10 健檢圖區 | desktop、laptop、tablet、mobile | 234,339／204,375／107,258／92,284；圖區由 1172×337 變 1172×773（desktop） | 範圍是健檢清單下緣到通路寬表下緣，G10 與 G7b 正好插在這裡（V4-0a 設計這張圖的用意） |

## 4. 瀏覽器驗收方式與截圖

- 截圖：`verification/revamp-v4/V4-3a/snapshots/{desktop,laptop,tablet,mobile}/`（各 13 張）。看本批變化：`desktop/05-diagnosis.png`、`desktop/10-diagnosis-chart-area.png`、`mobile/05-diagnosis.png`、`mobile/10-diagnosis-chart-area.png`。
- 方式：本機 production build、PUBLIC_DEMO 伺服器；`toHaveScreenshot`（0 像素差、threshold 0.02）；E2E 四個視窗用 LOCAL 伺服器（`charts-diagnosis.spec.ts` 斷言 G9 條的規則範圍與空心條、G10 超過 100、高度公式、段與資料表開同一抽屜、百分比抽屜、G7b 欄與收合掛載、管理損益表佔比抽屜、主層獨立圖區塊＝1、390 無橫向捲動）。
- 量測檔：`verification/revamp-v4/V4-3a/{metrics.json,first-load-modules.json,ui-audit.json,axe.json,keyboard-walk.json,network-log.json}`、`lighthouse/`、`lighthouse-runs/`。

## 5. 已知限制與風險

- **First Load JS 只剩 14,519 bytes**：v4 到目前為止多了 11,452 bytes（三批），後面還有 12 批（V4-3b 到 V4-11，其中健檢、商品、試算、會議、資料來源、抽屜與 P2 各批都會加圖）。V4-3b 開工前要評估把健檢與商品頁的圖改成隨頁面載入（`next/dynamic`），或在 PRD 調整門檻；本批未改。
- **健檢首列底與 390 TBT 都沒有餘裕**：首列底三尺寸都正好等於 V4-0a 實測；切到通路健檢的 TBT 中位數 791.0 ms，門檻 832.3 ms（約 5% 餘裕）。V4-3b 在健檢頁加 G11、G12 時要特別注意。
- **`channelWeeks` 的簽名與 PRD 原規劃不同**：改為 `channelWeeks(snapshot)`，從 `report.current.daily` 逐週加總（健檢頁拿不到 dataset）；單元測試逐格斷言與 `aggregatePeriod(dataset, 週, [通路])` 相同。PRD 與 CHART_CATALOG 已補記。
- **G9 條不可點**：照 PRD §4.5；E2E 斷言點條等於點 summary，抽屜由該列展開內容的影響金額 number-link 開。
- **G10 資料表在 1440 寬有 10 個資料欄**，在 `.table-scroll` 內水平捲動（頁面本身不捲動）。
- **SSR 先以 560 寬繪製 G10**，量到寬度後重畫；框高固定，CLS 0。
- 人工關卡 H6、PPT spike 人工開檔未執行。

## 6. 下一步、人工關卡與待拍板

- **下一批 V4-3b**（通路健檢二：G11 日 × 通路月曆熱表、G12 五項比率小倍數、下鑽加日期與 SKU）。依賴 V4-3a 與 D-V4-17、18（已拍板）；768 一列 1 張月曆以 V4-0b 實測為準。開工前先處理 First Load JS 餘裕的問題（見 §5）。
- **待拍板**：目前沒有（D-V4 全部定案；D-V3-26／27／29–37 已依建議值）。
- **部署**：本批沒有部署；MVP 切線後的 preview 部署仍需使用者當次明確同意。
