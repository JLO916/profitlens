# Revamp v4 V4-9a 驗收：匯出（一）PDF 與 PPT（2026-10-13）

依 `docs/revamp-v4/06_BATCHES.md`「V4-9a」，相關拍板是 D-V4-10＝A、D-V4-11＝B、D-V4-34＝A、D-V4-37＝A。使用者指示「以上一口氣全部完工」，並要求避免過度微調，所以審查只回報 blocker 與 major。

工作流程：

1. 先打基礎（`620d20a`）：`EXPORT_THEME` 加 8 個圖表色，`ExportVariantSpec` 加 `charts` 欄位，新增 `exports.chartsV4` 字串。
2. 兩個代理在各自的 worktree 平行實作：代理 A 做 C31 列印圖（`e0e0620`），代理 B 做 C32 PPT 原生瀑布（`2a31433`）。
3. 代理 C 整合兩邊（`d291e3f`、`5fa7cb3`、`66aa75a`）。
4. 一位審查，0 項 blocker 或 major。

## 1. 完成項目

| 項目 | 狀態 | 說明 |
|---|---|---|
| C31 PrintChart | 完成 | 檔案是 `src/components/charts/print-chart.tsx`。<br>內容：G1 三個版本都印，放在關鍵數字與決議行之後、三件事之前；G2 只在標準版與客戶版的附錄頁印，附錄頁另有 G1、G2 的資料表。<br>灰階填色三種，彼此都不同：起訖與小計是 `paper` 底加 `ink` 外框，有利是 `chartFavorable`，不利是 `ink` 實心並帶「−」。<br>圖例用 SVG 畫。數字取自 `bridgeWaterfall`、`profitWaterfall`，沒有算新的數 |
| PDF 頁數（D-V4-11＝B） | 完成 | 老闆版 1 頁、標準版 3 頁、客戶版 3 頁，會議 PDF 2 頁。v3 是 1、2、2，所以標準版與客戶版各多 1 頁附錄。<br>golden 與示範資料兩種資料的頁數相同 |
| C32 PPT 原生瀑布（D-V4-10＝A、D-V4-37＝A、D-V4-34＝A） | 完成 | 三個版本都新增第二張投影片，用 `addChart` 畫堆疊長條：<br>• 透明底段<br>• 起訖與小計<br>• 有利與不利（存柱高）<br>• 0 以下的輔助段<br>其他設定：<br>• `showValue:false`<br>• 用 `layout` 固定繪圖區<br>• 標值改成文字方塊，字取 `bars[].display`<br>• 系列名取自 `exports.chartsV4.pptx.series`<br>• 數值軸的範圍包含 0<br>• 數值用 decimal.js 由精確字串換算<br>第一張投影片三個版本都沒變 |
| 匯出顏色 | 完成 | 只用 `EXPORT_THEME`；8 個新色都對到 `:root` 的 `--chart-*` |
| labels | 完成 | 只新增 `exports.chartsV4.*`，既有字串逐字不變 |

## 2. 驗收命令與結果（最終程式 `66aa75a`，收尾前 HEAD `74c81cc`）

| 命令 | 結果 |
|---|---|
| typecheck、lint | exit 0 |
| audit:ui（`verification/revamp-v4/V4-9a/ui-audit.json`） | hex 0、字級種類 11、JSX 中文 0；靜態 testid 259 → 260 |
| contrast-check | 85／85 |
| `npm test -- --run` | **162 檔、3,300 個測試全過** |
| build | exit 0 |
| `npm run test:e2e`（帶三個 `*_OUT`） | **1,039 passed、0 failed、25 skipped（31.2 分鐘）**；跑完已還原 E2E 改寫的追蹤檔 |
| `CAPTURE_BATCH=V4-9a` | 23 passed、5 skipped；52 張與 V4-8b 逐位元組相同 |
| Lighthouse × 3（開跑時 1 分鐘負載 2.34、1.89、2.27） | 390 TBT 中位數都通過：載入示範資料 1,009.3（門檻 1,109.1）、健檢 789.8（832.3）、商品 86.7（129.9）、會議 981.8（1,071.2）、資料來源 12.9（50.0）。a11y 全 100；390 首頁 Performance 94–95；預先載入不在量測區間內 |
| 禁區四條命令 | 都是空的 |
| commit 之後 `git diff --stat 625bfa5 HEAD -- （禁區）` | 空（收尾 commit `f72e32d`） |

**驗收中的數值**：

- **First Load JS gzip**：515,156 bytes，比 V4-8b 多 1,675。原因是 `print-summary` 被首載靜態匯入，`print-chart` 跟著進了首載。門檻 545,397，還剩 30,241。
- **B1、B2、B3、B9**：與 V4-8b 相同。
- **axe**：22／22／22／20 個狀態，全部 0。
- **keyboard-walk**：除了時間戳記，與 V4-8b 相同。
- **network-log**：下載的檔名集合不變。只有 PPTX 從 85,016 變成 133,318 bytes，是因為多了第二張投影片、chart part 與內嵌活頁簿；其餘四個檔逐位元組相同。
- **PPTX 檢查**：2 張投影片、1 個 chart part、1 個內嵌 xlsx；`ppt/media/` 是空的，沒有 `<p:pic>`。快取值與內嵌值都和 `bars` 一致到分：golden 是 570 → … → 255，示範資料是 1,868,626.68 → … → 1,269,792.73。顏色都來自 `EXPORT_THEME`。
- **棘輪**：都不升。
- **testid 刪除數**：0。
- **功能保留表**：V4-9a 的 10 列都打勾（49、50、D08、D10、D26、D30、D40、D41、EX1、EX2）。

## 3. 給人工開檔檢查的檔案

`verification/revamp-v4/V4-9a/exports/` 共 14 個檔：

- PDF：golden 與示範資料 × 老闆、標準、客戶 3 個一頁摘要，加上 golden 與示範資料的會議 PDF（標準），共 8 個。
- PPTX：golden 與示範資料 × 老闆、標準、客戶，共 6 個。
- 量測：`summary.json`。

**另需的人工時間（未執行，待人工）**：

- 用你的簡報軟體開 PPT，確認文字方塊的標值對齊柱子，並在「編輯資料」裡看到輔助系列名稱。
- 列印 PDF 檢查並截圖。

## 4. 已知限制

- 投影模式中（`--text-12` 是 14px）列印時，列印圖仍照 12px 估寬，標值可能比較擠。
- E2E `export-variants` 的 b、c 兩個測試名稱還寫「PPT 一張」，但內容已經斷言 2 張。這是 nit，沒有改。
- 在 `revamp-r6` 的 d 中，標準版 PDF 的預期頁數從 2 改成 3（D-V4-11＝B）；決議行後面的下一個元素改成 G1 圖。
