# Revamp v4 V4-7b 驗收：匯入精靈與抽屜（G22、G23、`ladderMetrics` 搬移）（2026-10-12）

依 `docs/revamp-v4/06_BATCHES.md`「V4-7b 匯入精靈與抽屜」、`docs/revamp-v4/CHART_CATALOG.md` §7 的 G22、G23 實作卡、PRD 的 C24 BarCell 與 §8.7 例外。依賴 V4-7a。允許變動的畫面是 03（抽屜）與 12（匯入精靈步驟 4）。

**工作方式**：用一個工作流程依序完成以下五步。

1. **開工錨點**（`3ea161b`）：labels 加 `importWizard.chartsV4`，CSS 加 V4-7b A、C 錨點。
2. **第一段**：兩個 worktree 平行做，再由合併代理併回 `revamp/v4`。合併沒有衝突，分支已刪。
   - 代理 A 做 C24 的 share 與 pair 模式（`a2b81b2`）。
   - 代理 B 把 `ladderMetrics` 搬到 `src/application/evidence-ladder.ts`（`bcce6ca`）。
   - 兩人各配一位對抗審查。
3. **第二段**：代理 C 整合 G22、G23，並補 E2E（`b8fcc1a`）。
4. **驗證**：四尺寸完整 E2E 與兩位唯讀審查同時跑。共 1 項發現，已修：對帳表「相符」與 0.00 之間沒有分隔，報讀會念成「相符0.00」（`8f67026`）。
5. **主流程**：補修第一段審查 B-1，測試標題原本寫「每一種證據」，改成實際涵蓋範圍（`2e98855`），再在最終程式上完整驗收（本文件）。

## 1. 完成項目（對照 06_BATCHES V4-7b）

| 項目 | 狀態 | 說明 |
|---|---|---|
| C24 BarCell 的 share 與 pair 模式 | 完成 | **share**：條長＝\|值\| ÷ 基準，最多 100%。`signed` 時零線在中間，負值往左。基準 ≤ 0 或沒有值時不畫條。<br>**pair**：上方 4px 是原值，用 `chartColors.previous`；下方 6px 是換算值，用 `chartColors.total`；兩條共用尺度。<br>**variance**：輸出逐位元組不變，265 筆基準比對，涵蓋 G4、G6、G9 與元件矩陣。<br>條寬 768 以上為 96、767 以下為 64。都在 `aria-hidden` 內，不可點 |
| G22 對帳表與前處理表的內嵌條 | 完成 | **精靈步驟 4 對帳表**：差額不等於 0 的列才畫 C24 variance 條，共用零線，尺度取 \|差額\| 的最大值；差額等於 0 時不畫條，改標「相符」（新 key `importWizard.chartsV4.reconciliation.match`），0.00 照舊顯示。<br>**資料來源頁前處理表**：換算值的格加 C24 pair，上方含稅原值、下方未稅換算值。<br>testid 為 `chart-import-reconciliation-bar-{field}`、`chart-data-preprocess-bar-{field}`。匯入路徑的點擊數與 `import.spec` 步驟 4 的定位器都不變 |
| G23 抽屜階梯表的佔比條 | 完成 | 只畫淨營收那一列與其下各列；條長＝\|值\| ÷ 淨營收，負值往左。<br>顏色依列的角色：扣項（商品成本、四項通路費用、廣告費）為負時用 `chartColors.favorable`；小計與結果列（淨營收、商品毛利、扣廣告前貢獻、扣廣告後貢獻）為負時用 `chartColors.unfavorable`。<br>以下情況不畫條：淨營收 ≤ 0 或沒有值時整張表都不畫；值為 null 的列不畫；比率證據、商品層證據也不畫（已補記在 CHART_CATALOG）。<br>testid 為 `chart-evidence-ladder-bar-{metric}`；沒有新增 key。抽屜的寬高規則、焦點圈與 Esc 回焦都不變 |
| `ladderMetrics` 搬到 `src/application/evidence-ladder.ts` 並匯出 | 完成（只搬移） | 函式本體與原本逐字相同，只有簽名的型別寫開。<br>21 個匯出的 evidence builder 組出的證據，加上期間 × 通路範圍 × 排除條件的 grid，在 11 份資料上回傳同一個物件（toBe）。<br>grid 摘要等於開工錨點以原函式產生的基準。<br>144 個抽屜的 SSR 前後逐字相同。<br>application 層不匯入元件 |
| 同批 labels 與測試 | 完成 | labels：`importWizard.chartsV4` 新增 1 個 key（「相符」），v4 累計 203 個。<br>新增測試：`evidence-ladder.test.ts`。<br>擴充測試：`bar-cell.test.ts`（share、pair）、`import-wizard-v3`、`evidence-drawer-v3`、`data-workspace-v3`、`mounted-testids`（V4-7b M1）。<br>E2E 擴充：`charts-data.spec`（G22 pair、G23 抽屜、合成資料的有利與不利色）、`import-wizard.spec`（含稅匯入的點擊數不變） |

## 2. 變更檔案

- **新增**
  - 程式：`src/application/evidence-ladder.ts`。
  - 測試：`tests/evidence-ladder.test.ts`。
  - 測試輔助：`tests/helpers/{evidence-ladder-cases.ts,bar-cell-variance-baseline.tsx,reconciliation-mismatch.ts}`。
  - 基準資料：`tests/fixtures/{evidence-ladder-v4-7a.json,bar-cell-variance-v4-7a.json}`。
  - 本文件、`verification/revamp-v4/V4-7b/`。
- **修改**
  - 程式：`src/components/{charts/bar-cell.tsx,evidence-drawer.tsx,import-wizard/step-review.tsx,workspace-panels.tsx}`。
  - 樣式與字串：`src/app/globals.css`、`src/i18n/labels.zh-TW.ts`，都只動 V4-7b 錨點內。
  - 測試：見上表。
  - 清單：`verification/revamp-v4/{testids-v4-added.txt,feature-retention.csv,e2e-text-assertions.csv}`。
  - 文件：`docs/revamp-v4/{CHART_CATALOG.md,06_BATCHES.md,00_README.md}`、`docs/{STATUS.md,DECISIONS.md}`。
- **零改動**
  - 財務禁區：`src/domain`、`fixtures`、`docs/METRICS.md`、`src/application/{assist-kpi.ts,breakeven-mer.ts}`。
  - 依賴：`package.json`、`package-lock.json`。
  - 棘輪與快照：上限檔、`tests/copy-density.test.ts`、`labels-v3.flat.json`。

## 3. 驗收命令與真實結果

| 命令 | 結果 |
|---|---|
| `npm ci` | 未執行（lockfile 沒有變動） |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run audit:ui -- --json verification/revamp-v4/V4-7b/ui-audit.json` | design 15 項與 V4-7a 相同；只有資訊欄有差：class 884 → 885、動態 testid 屬性 69 → 71 |
| `npm run contrast-check` | 85／85 通過（沒有新增顏色 token） |
| `npm test -- --run` | **160 檔、3,231 個測試全過**（V4-7a 是 159 檔、3,178 個） |
| `npm run test:e2e`（整合後 `b8fcc1a`，四個視窗） | 997 passed、0 failed、15 skipped（30.9 分鐘） |
| 同上（最終程式 `2e98855`，帶三個 `*_OUT`） | **997 passed、0 failed、15 skipped（30.3 分鐘）**。新增 12 條（`charts-data` 新的 3 條 × 4 尺寸）；跑完已還原 E2E 改寫的追蹤檔 |
| PUBLIC_DEMO build 與伺服器（3100） | exit 0；`GET /` 回 200 |
| `CAPTURE_BATCH=V4-7b …`（先複製 V4-7a 的 52 張） | 第 1 次 21 passed、2 failed、5 skipped：差異**只有 desktop、laptop 的 12**，各 1,314 像素，是對帳表差額格的「相符」（允許）。<br>tablet、mobile 的 12 沒有差異：768 與 390 的差額欄在表格捲動區之外，元素截圖拍不到。<br>03 四個尺寸都沒有差異：截圖開的是三件事「看證據」的影響金額抽屜，它有組成項目，不畫階梯（G23 由 E2E 在四個尺寸驗證）。<br>其餘 48 張都是 0 差異 |
| 加 `--update-snapshots=changed`（只跑 baseline）後完整重跑 | **23 passed、5 skipped**；與 V4-7a 不同的只有 desktop、laptop 的 12；metrics 的硬斷言全部通過 |
| Lighthouse × 3（開跑時 1 分鐘負載都 < 2.5：2.45、2.33、2.03） | **390 的五項 TBT 都通過**（見下表）。第 3 次的完整報告在 `verification/revamp-v4/V4-7b/lighthouse/`，三次的數值在 `lighthouse-runs/` 與 `metrics.json` |
| `lsof -ti tcp:3100 \| xargs kill`；`lsof -ti tcp:3100` | 已停，沒有輸出 |
| 禁區四條命令 | 四條都是空的 |
| commit 之後 `git diff --stat 625bfa5 HEAD -- （禁區與 assist-kpi、breakeven-mer 路徑）` | 空（收尾 commit `7edb25c`；`82b70df` 那條與 `git status --porcelain` 也是空的） |
| 隱藏字元掃描 | 0 |

**棘輪與基準數值**

| 項目 | V4-7b | 與基準 |
|---|---|---|
| design-lint 15 項、copy-style、copy-density、chart-lint CL-1–CL-11 | 不變（上限檔沒動；chart-lint 全 0） | 不變 |
| testid 刪除數（v2、v3、v4 新增） | 0、0、0；`testids-v4-added.txt` 新增 21 列，累計 329 列 | — |
| labels 快照 | 2,581 個鍵逐字相同；本批新 key 1 個（`importWizard.chartsV4.reconciliation.match`） | — |
| First Load JS gzip（B5） | **511,174 bytes**（V4-7a 為 510,564，多 610；BarCell 的新模式與抽屜都在首載）；門檻 545,397，**剩 34,223** | 通過 |
| B1、B2、B3、B9 | 與 V4-7a 相同（各頁 DOM 節點數一樣） | 不變 |
| Lighthouse Accessibility | 1440、390 各 8 頁，三次全部 100 | 不變 |
| Lighthouse Performance（空狀態首頁） | 1440 為 100；390 為 95、95、95 | ≥ 90 |
| 390 TBT 中位數（ms，低負載三次） | 載入示範資料 1,061.9 ≤ 1,109.1<br>通路健檢 815.9 ≤ 832.3<br>商品毛利 86.9 ≤ 129.9<br>會議紀錄 992.6 ≤ 1,071.2<br>資料來源 10.0 ≤ 50.0 | 五項通過（不需要 D-V4-47 的同場對照） |
| 預先載入 | 三次的 `insideTimespans` 都是空的 | 不在量測區間內 |
| axe 四尺寸 | 18／18／18／17 個狀態，serious、critical、moderate、minor 都是 0 | 通過 |
| keyboard-walk | 與 V4-7a 逐項相同（各頁里程碑與停留點）；`aria-hidden` 內的停留點 0 | 不變 |
| network-log | desktop、mobile 的下載集合（5 種檔名與位元組）與 `checks` 都相同 | 不變 |
| 功能保留表 | `batch` 含 V4-7b 的 7 列（51、54、55、D33、G22、G23、MV5）全部打勾 | 完成 |

**畫面基準差異（只列允許變動的畫面）**

| 畫面 | 尺寸 | 變化 | 理由 |
|---|---|---|---|
| 12 匯入精靈步驟 4 | desktop、laptop | 1,314 像素（約 1%） | 對帳表 9 列差額都是 0，每列在 0.00 之前多一個「相符」。tablet、mobile 的差額欄在捲動區之外，所以沒有差異 |

## 4. 瀏覽器驗收方式與截圖

- **截圖**：`verification/revamp-v4/V4-7b/snapshots/{desktop,laptop,tablet,mobile}/`，每個尺寸 13 張。本批的變化看 `desktop/12-import-step-4.png`。
- **目視檢查**：我看過 1440 的步驟 4，對帳表 9 列都是「相符 0.00」。整合代理另外截了示範資料抽屜階梯表在 1440 與 390 的圖，條的長度與對齊都正常。
- **E2E 在四個尺寸斷言的內容**：
  - 含稅匯入後，前處理表的成對條。
  - 從總覽 KPI 開扣廣告後貢獻的抽屜：`chart-evidence-ladder-bar-net_revenue` 最寬，`gross_sales` 沒有條。
  - 合成資料：SOCIAL 扣項為負，用有利色；MARKETPLACE 扣廣告後貢獻為負，用不利色。
  - 含稅匯入的點擊數不變。
  - 抽屜寬高、沒有橫向溢出、Esc 回焦。
- **方式**：截圖用本機 production build 的 PUBLIC_DEMO 伺服器，`toHaveScreenshot`（0 像素差、threshold 0.02）；E2E 四個視窗都用 LOCAL 伺服器。
- **量測檔**：`verification/revamp-v4/V4-7b/` 下的 `metrics.json`、`first-load-modules.json`、`ui-audit.json`、`axe.json`、`keyboard-walk.json`、`network-log.json`，以及 `lighthouse/`、`lighthouse-runs/`。

## 5. 已知限制與風險

- **真實匯入的對帳差額幾乎都是 0**：使用者通常只會看到每列「相符」，差額條只在測試資料裡出現。「相符」放在條的位置，0.00 照舊顯示。PRD 寫的是「標相符」，如果希望只顯示「相符」、不再顯示 0.00，需要另外拍板，目前沒有列入。
- **768、390 的對帳表差額欄**：要在表格捲動區內橫向捲動才看得到，v3 就是如此。
- **抽屜階梯表在 390 時條寬 64px**：示範資料目視與 E2E 量測都沒有溢出。金額很長時，列名欄會變窄並換行。
- **G22 的成對條只加在資料來源頁的前處理表**：照目錄卡的「位置」欄，精靈步驟 4 的前處理摘要表沒有加。
- **First Load JS 多 610 bytes**：還剩 34,223 bytes。
- **人工關卡**：H6、PPT spike 人工開檔都未執行。

## 6. 下一步、人工關卡與待拍板

- **待拍板**：本批沒有新增。
- **下一批**：V4-7c 匯入時間寫進備份（S；D-V3-30＝A），之後是 V4-8 投影與四尺寸總檢。V4-8 要一併做的項目：
  - D-V4-44 B：等待骨架與失敗重試。
  - D-V4-45 B：健檢頁資料表的不利色。
  - D-V3-33、34、35。
  - G12 的 summary 位置。
- **部署**：本批沒有部署；preview 部署仍需使用者當次明確同意。
