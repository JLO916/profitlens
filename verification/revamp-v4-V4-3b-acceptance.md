# Revamp v4 V4-3b 驗收：通路健檢（二）（G11、G12、下鑽加日期與 SKU）（2026-10-09）

依 `docs/revamp-v4/06_BATCHES.md`「V4-3b 通路健檢（二）」（含 V4-0b 實測說明）、`docs/revamp-v4/CHART_CATALOG.md` 的 G11、G12 實作卡、PRD §4、§6（C16 table 模式、C26、C28）、§7、§8.1、§8.2、§8.7。依賴：V4-3a 完成；D-V4-17＝A、D-V4-18＝A。

工作方式：先提交開工錨點 `54f669e`（`--red-100`、`--chart-heat-1..2`、`--chart-missing` 與 `chartColors`、contrast PAIRS 85 組、`EvidenceFilter` 的 `date`、`sku` 型別欄位、labels 與 `globals.css` 錨點、`Diagnosis` 的 G11、G12 插入點）。代理 A（G11：`dailyHeatmap`、C28 HeatTable、`formatHeatCell`、ChartFrame table 模式，`9a2398d`）與代理 B（下鑽日期與 SKU、C26＋G12，`2cb232d`）並行；代理 E 合併兩者（labels 一處衝突，兩方內容都保留）、補 axe 三個狀態與鍵盤走查、寫 E2E 並跑全套（`bd82e69`）。主流程合併 E（`c35aa19`）、跑完整驗收；Lighthouse 量到 390「切到通路健檢」TBT 超過門檻，主流程修正（`b7fbf4e`，見 §5）後在最終程式上重跑 capture、Lighthouse 與全套 E2E，收尾提交。

## 1. 完成項目（對照 06_BATCHES V4-3b）

| 項目 | 狀態 | 說明 |
|---|---|---|
| ChartFrame `mode="table"` 首次使用 | 完成 | 固定高容器不設 `aria-hidden`、帶 `data-mode="table"`，內含 `.table-scroll[role=region][aria-labelledby]`（沒有 tabindex，表內的熱表自己有 1 個停留點）；其他模式輸出不變 |
| C28 HeatTable＋G11 日 × 通路月曆熱表 | 完成 | `dailyHeatmap`（`daily-heatmap-v1`，取 `report.current.daily` 的日 × 通路扣廣告後貢獻，排名用 Decimal）；列＝snapshot 週、欄＝該週第 1 到 7 天、欄頭標星期；階 1＝取位到元後仍為負，階 2＝該通路最差 3 天（加不利色框線）；正值不上色；null 格虛線框「資料待補」；超過 92 天改週 × 通路（`layout=matrix`）；通路 > 8 或週 × 通路 > 736 格不計算、不渲染；標題所指的通路排第一張（示範：「平台 · MARKETPLACE 有 32 天虧，最差 8/22 −4,511 元」）；grid 型 roving tabindex，整張 1 個 Tab 停留點，方向鍵、Home／End、Ctrl+Home／End 移動，Enter 開當日抽屜（事件代理掛在 `.heat-grid`）；1440 `auto-fill`、768 與 390 一列 1 張 |
| `formatHeatCell` | 完成 | `presentation.ts`：以萬為單位、HALF_UP 兩位、不帶單位；取位到元後仍為負才帶 U+2212（−4,510.74 寫「−0.45」，−30 寫「−0.00」）；null 回傳空字串 |
| `--red-100`、`--chart-heat-1..2`、`--chart-missing` | 完成 | 開工錨點宣告；`--red-100`＝`#ebcecb`（V4-0-baseline §13 試算 t＝0.25，H5 設計稿同值）；熱表只有兩階（X33）；contrast：主文字在階 1、階 2 底色上 ≥ 4.5、階 2 框線 ≥ 3 |
| `EvidenceFilter` 加 `date`、`sku` | 完成 | `date` 只留該日的列；`sku` 條件下沒有 sku 欄位的通路費用與廣告列一律不列入（AGENTS.md：SKU 篩選不可帶入全通路費用）；`filter.sku` 用在非商品層證據時，抽屜以 `scopedEvidenceFilter` 拿掉 sku 條件（`evidenceFilterError` 回報錯誤種類）；`evidenceFilterText` 依週、日期、通路、商品的順序組片語（「篩選：日期 8/22 · 平台 · MARKETPLACE」） |
| C26 SmallMultiples＋G12 五項比率每週走勢 | 完成 | `<details>`「五項比率走勢」，收合時保持掛載；每張子圖各自 Y；標題用區塊名，不做跨比率排名；390 單欄 5 張、框高 sm × 5；子圖都在 `aria-hidden` 容器內，容器內沒有 `<details>`、按鈕或連結；資料表用 C33；C26 以 inline SVG 實作（理由見 §5） |
| axe 三個新狀態 | 完成 | 「資料表展開」「從圖下鑽的抽屜」「4 通路合成資料的健檢頁」；desktop、laptop、tablet 各 14 個狀態，mobile 13 個，全部 0 |
| keyboard-walk：健檢頁經過熱表的 Tab 數 ≤ 3 | 完成 | 熱表內停留點 1、經過熱表的 Tab 數 2（1440 與 390） |
| 同批 labels 與測試 | 完成 | labels 新增 35 個 key（`diagnosis.chartsV4.heat` 25、`rates` 8、`evidence.chartsV4.filter` 2），既有 2,581 個字串逐字不變。單元新增 `chart-heatmap.test.ts`、`charts-diagnosis-v4.test.tsx`、`charts-diagnosis-g12.test.tsx`、`charts-diagnosis-drill.test.tsx`，擴 `evidence-filter.test.ts`、`format-layers.test.ts`、`chart-theme.test.ts`、`chart-structure.test.ts`、`mounted-testids.test.tsx`（V4-3b 兩條 M1；新增頁面狀態 `diagnosis-weekly`）。E2E 擴 `charts-diagnosis.spec.ts`（6 條 × 4 尺寸）、`axe-sweep.spec.ts`、`keyboard-walk.spec.ts`、`chart-helpers-v4.ts` |

## 2. 變更檔案

- 新增：`src/application/chart-heatmap.ts`、`src/components/charts/{heat-table.tsx,small-multiples.tsx,deferred-mount.ts}`、`src/components/diagnosis/{heat-section.tsx,rates-section.tsx}`、上表新測試、本文件、`verification/revamp-v4/V4-3b/`（含代理 B 的 G12 展開目視截圖 4 張）。
- 修改：`src/app/globals.css`（開工錨點的 token；V4-3b A、B 錨點）、`src/application/{chart-theme.ts,copy.ts,evidence-filter.ts,presentation.ts}`、`src/components/{evidence-drawer.tsx,workspace-panels.tsx}`、`src/components/overview/charts/chart-frame.tsx`（只有 table 模式）、`src/i18n/labels.zh-TW.ts`、`scripts/contrast-check.mjs`、上表擴充的測試、`tests/helpers/page-states.tsx`、`tests/e2e/{charts-diagnosis.spec.ts,axe-sweep.spec.ts,keyboard-walk.spec.ts,chart-helpers-v4.ts}`、`verification/revamp-v4/{testids-v4-added.txt,e2e-text-assertions.csv,feature-retention.csv}`、`docs/revamp-v4/{01_PRD.md,CHART_CATALOG.md,06_BATCHES.md,09_DECISIONS_PENDING.md,00_README.md}`、`docs/{STATUS.md,DECISIONS.md}`。
- 零改動：`src/domain`、`fixtures`、`docs/METRICS.md`、`src/application/{assist-kpi.ts,breakeven-mer.ts}`、`package.json`、`package-lock.json`、`.env*`、`vercel.json`。

## 3. 驗收命令與真實結果

| 命令 | 結果 |
|---|---|
| `npm ci` | 未執行（lockfile 沒有變動） |
| `npm run typecheck` | exit 0（修正後再跑一次 exit 0） |
| `npm run lint` | exit 0（修正後再跑一次 exit 0） |
| `npm run audit:ui -- --json verification/revamp-v4/V4-3b/ui-audit.json` | design 15 項與 V4-3a 相同（hex 0，token 定義區 24、圓角 4、字級 11、字距 0、箭頭 3，其餘 0）；labels 同義詞 12、其餘 0；資訊欄：靜態 testid 相異 252、class 848 |
| `npm run contrast-check` | 85／85 通過 |
| `npm test -- --run` | **141 檔／2,793 測試全過**（V4-3a 137／2,723；修正後再跑一次相同） |
| `npm run build` | exit 0 |
| `npm run test:e2e`（四個視窗，帶三個 `*_OUT`；修正前） | 909 passed、0 failed、15 skipped（27.4 分鐘） |
| 同上（最終程式，修正後） | **909 passed、0 failed、15 skipped（27.0 分鐘）**；新增 24 條（charts-diagnosis 6 條 × 4 尺寸）；axe、keyboard-walk、network-log 的輸出由這次覆寫；跑完還原 E2E 改寫的追蹤證據檔 |
| PUBLIC_DEMO build 與伺服器（3100） | exit 0；`GET /` 200 |
| `CAPTURE_BATCH=V4-3b …`（先複製 V4-3a 的 52 張） | 第 1 次 15 passed、8 failed、5 skipped：差異只有四個尺寸的 05 與 10（尺寸也變）；其餘 44 張 0 差異 |
| 同上加 `--update-snapshots=changed`（只跑 baseline） | 16 passed；與 V4-3a 不同的檔正好是那 8 張 |
| 同上第 2 次；修正後第 3 次 | 都是 **23 passed、5 skipped**，52 張全部通過；metrics 硬斷言全部通過 |
| Lighthouse × 3（修正前，1 分鐘負載 3.49、3.50、3.52） | 390「載入示範資料」中位數 1,119.6（門檻 1,109.1）、「切到通路健檢」847.9（門檻 832.3）超過 |
| Lighthouse × 3（修正前，等 1 分鐘負載 < 3.0 重跑：2.99、2.76、2.72） | 「載入示範資料」1,055.8 通過；**「切到通路健檢」853.6 仍超過**，判定是本批的實際退步 |
| Lighthouse × 3（修正後，1 分鐘負載 2.73、2.84、2.63） | **五項都通過**（見下表）；第 3 次的完整報告在 `verification/revamp-v4/V4-3b/lighthouse/`，三次數值在 `lighthouse-runs/` 與 `metrics.json` |
| `lsof -ti tcp:3100 \| xargs kill`；`lsof -ti tcp:3100` | 已停，沒有輸出 |
| 禁區四條命令 | 四條都空 |
| commit 之後 `git diff --stat 625bfa5 HEAD -- （禁區與 assist-kpi、breakeven-mer 路徑）` | 空（收尾 commit `926f0a9`） |
| 合併後隱藏字元掃描 | 0 |

**棘輪與基準數值**

| 項目 | V4-3b | 與基準 |
|---|---|---|
| design-lint 15 項、copy-style、copy-density、chart-lint CL-1–CL-11 | 不變（chart-lint 全 0；健檢頁主層獨立圖區塊＝2：G10、G11） | 上限檔不動 |
| testid 刪除數（v2、v3、v4 新增） | 0、0、0；`testids-v4-added.txt` 新增 181 列（`chart-diagnosis-heat`、178 個熱表格、`chart-diagnosis-rates`、`-rates-table`），累計 240 列 | — |
| labels 快照 | 2,581 個鍵逐字相同；v4 新 key 累計 71 個，都在 `chartsV4` 前綴 | — |
| First Load JS gzip（B5） | **537,331 bytes**（V4-0a 519,426，＋17,905；V4-3a 530,878，本批＋6,453；門檻 545,397，**剩 8,066**） | 通過，餘裕不足（D-V4-42） |
| B2 首屏 | 1440／1280／390 不變 | 不變 |
| B1 健檢 | 首列底 888／888／985（＝V4-0a 實測）、第一個 G9 條頂 300／300／259 | 通過 |
| B3 | 七頁 390 寬 scrollWidth 390 | 不變 |
| B9 健檢 DOM 節點數 | 2,151（三尺寸；V4-0a＋827，門檻＋1,500；本批＋617：G11 約 227、G12 約 390） | 通過 |
| Lighthouse Accessibility | 1440、390 各 8 頁全部 100（修正前後各三次），失敗審核 0 | 不變 |
| Lighthouse Performance（空狀態首頁） | 1440 100；390 94（修正後三次） | ≥ 90 |
| 390 TBT 中位數（ms，修正後、低負載三次） | 載入示範資料 1,090.6 ≤ 1,109.1；**通路健檢 815.4 ≤ 832.3**；商品毛利 86.6 ≤ 129.9；會議紀錄 966.6 ≤ 1,071.2；資料來源 1.6 ≤ 50.0 | 五項通過 |
| CLS | 切到通路健檢 390、1440 都是 0 | < 0.05 |
| axe 四尺寸 | 14／14／14／13 個狀態，serious、critical、moderate、minor 全 0；沒有 aria-hidden-focus | 通過 |
| keyboard-walk | `aria-hidden` 內停留點 0；熱表 1 個停留點、經過熱表 2 個 Tab（門檻 3）；健檢第一列里程碑 1440 第 8、390 第 2（不變）；健檢 main 內停留點 1440 73、390 63（＋2：熱表與 G12 summary） | 通過 |
| network-log | 下載集合 5 種不變；desktop、mobile 各 15 個請求；外部來源 0、非 GET 0、CSV 內容外洩 0 | 不變 |
| 功能保留表 | `batch` 含 V4-3b 的 3 列（55、G11、G12）全部打勾 | 完成 |

**畫面基準差異（只列允許變動的畫面）**

| 畫面 | 尺寸 | 差異像素 | 理由 |
|---|---|---|---|
| 05 健檢整頁 | desktop、laptop、tablet、mobile | 587,651／530,847／352,831／226,426（約 12%、12%、12%、13%），頁面變長 | G10 之後新增 G11 區塊（約 432px）與 G12 收合列；768 與 390 的 G11 副標尾多「其餘通路在框內捲動」 |
| 10 健檢圖區 | desktop、laptop、tablet、mobile | 277,360／244,396／137,480／125,648（約 19%–22%）；desktop 由 1172×773 變 1172×1269 | 範圍是健檢清單下緣到通路寬表下緣，G11 與 G12 正好插在這裡 |

## 4. 瀏覽器驗收方式與截圖

- 截圖：`verification/revamp-v4/V4-3b/snapshots/{desktop,laptop,tablet,mobile}/`（各 13 張）。看本批變化：`desktop/10-diagnosis-chart-area.png`（G10、G11、G12 收合列、通路寬表）、`mobile/10-diagnosis-chart-area.png`、`desktop/05-diagnosis.png`；G12 展開狀態的目視截圖 `verification/revamp-v4/V4-3b/g12-expanded-{1440,1280,768,390}.png`。
- 方式：本機 production build、PUBLIC_DEMO 伺服器；`toHaveScreenshot`（0 像素差、threshold 0.02）；E2E 四個視窗用 LOCAL 伺服器（`charts-diagnosis.spec.ts` 斷言熱表結構、鍵盤、Enter 與點擊開當日抽屜且原始明細每列日期等於該日、合成資料的資料待補格、G12 收合掛載與各自 Y）。
- 量測檔：`verification/revamp-v4/V4-3b/{metrics.json,first-load-modules.json,ui-audit.json,axe.json,keyboard-walk.json,network-log.json}`、`lighthouse/`、`lighthouse-runs/`。

## 5. 已知限制與風險

- **390「切到通路健檢」TBT 的修正與餘裕**：合併版本在低負載下量到 853.6 ms（門檻 832.3），G11（約 227 個節點）與 G12（約 390 個節點，收合時也渲染）讓切頁那一次渲染變長。修正：新 hook `useDeferredMount`（`src/components/charts/deferred-mount.ts`）讓兩者的內容在瀏覽器掛載後的下一個 animation frame 以 transition 渲染，之前由 ChartFrame 同高的 loading 骨架佔位；伺服器與單元測試（沒有 window）不延後，所以 SSR、M1／M6 與 chart-lint 的檢查不變；圖框高度固定，CLS 0。修正後 815.4 ms，餘裕約 2%。之後在健檢頁加內容要先量這一項。
- **First Load JS 只剩 8,066 bytes**：v4 前四批共多 17,905 bytes，全部在頁面 chunk。唯讀分析顯示所有頁面面板與匯出模組都是靜態 import；列為待拍板 D-V4-42（建議新增 V4-3c 首載瘦身批次，約省 45 KB，畫面不變）。V4-4 的 G13、G14 預計會用掉剩下的餘裕。
- **G12 用 inline SVG，不是 Recharts LineChart**：五張 Recharts 會增加切頁主執行緒成本，inline SVG 也讓 SSR 就輸出圖形、單元測試可直接驗 Y 範圍。PRD 與 CHART_CATALOG 已補記。
- **G12 收合列的位置**：「五項比率走勢」的 summary 在面板外、靠頁面左緣，和上下的面板不對齊（截圖 10）。只是版面細節，沒有功能或無障礙問題，列給 V4-8 四尺寸總檢一併處理。
- **390 的 G11 月曆寬 320、捲動區 324**：只有不佔寬度的捲軸（macOS、行動裝置）放得下；在捲軸佔寬的環境下由捲動區內部水平捲動，頁面本身不捲動。
- **`testids-v4-added.txt` 逐一列出 178 個熱表格**：改合成資料或示範資料的期間時要同步改這份清單。
- 人工關卡 H6、PPT spike 人工開檔未執行。

## 6. 下一步、人工關卡與待拍板

- **待拍板 D-V4-42（首載 JS 預算）**：建議 A，在 V4-4 之前新增批次 V4-3c「首載瘦身」（匯出模組按下時載入，會議紀錄、健檢與資料來源、商品、待辦、AI 面板改成隨頁載入；約省 45 KB，畫面不變）。不回覆時，V4-4 開工前只能先做 B（匯出模組按下時載入，約 9.8 KB）。
- **下一批**：D-V4-42 回覆 A 時是 V4-3c，之後 V4-4（商品毛利 G13、G14；依賴 D-V4-38、39，已拍板）。
- **部署**：本批沒有部署；MVP 切線後的 preview 部署仍需使用者當次明確同意。
