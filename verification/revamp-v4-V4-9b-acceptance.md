# Revamp v4 V4-9b 驗收：匯出（二）Excel 與 Markdown（2026-10-13）

依 `docs/revamp-v4/06_BATCHES.md`「V4-9b」，相關拍板是 D-V4-12＝A、D-V4-13＝B。

工作方式：
- **實作**：一個代理在 worktree 完成（`8be4043`）。
- **整合**：在主 checkout 進行（合併 `8b945f4`、證據 `165fad0`），本批正式的完整 E2E 就在這一步跑。
- **審查**：一位，只回報 blocker 與 major，結果 0 項。

## 1. 完成項目

| 項目 | 狀態 | 說明 |
|---|---|---|
| C34「圖表資料」工作表 | 完成 | 只有標準版與客戶版有。每張圖一段，依目錄順序：G1、G2、G4、G7a、G7b、G10、G11、G12、G13，G14 只在有商品毛利為負時出現。<br>每段的結構：標題列寫結論句，欄序與 C33 資料表相同，數值取自畫面用的同一組函式。<br>不放 G15、G16（Excel 匯出的輸入沒有試算資料）。通路超過 8 個時，G7b、G11 不放 |
| 版本列 | 完成 | 依 `spec.appendix.technical` 決定。<br>標準版：每段最後一列是「版本與算法」，basis 工作表列出 4 個 B 級版本常數。<br>客戶版：兩者都沒有 |
| Excel 工作表數 | 完成 | 老闆版 2 張、標準版 8 張、客戶版 8 張 |
| Markdown 九項差額表 | 完成 | 一頁摘要的「## 貢獻變化拆解」下方加 9 列表格，欄位是「項目」與「差額（元）」，負號用 U+2212。三種版本選擇輸出的檔案逐位元組相同 |
| 匯出正規化 | 完成 | 新增 `isChartV4MarkdownLine`、`isChartV4Sheet`、`isChartV4VersionRow`，正規化後的 sha256 與 V3-7 基準相同。<br>`export-numeric-baseline.json` 與 `export-numeric-stability.test.ts` 都沒改，測試通過 |
| CSV、JSON（D-V4-13＝B） | 不變 | 18 個輸出與 `74c81cc` 逐位元組相同，由 `tests/export.test.ts` 鎖住 |
| labels | 完成 | 只新增 `exports.chartsV4.excel.*` |

**與規格不同的一處**：B 級版本列放在 basis 工作表裡另起的「圖表資料」段，不放進「技術細節」段。原因是禁止修改的 `tests/breakeven-mer.test.ts` 要求「技術細節」剛好 8 列。

## 2. 驗收命令與結果（`165fad0`）

| 命令 | 結果 |
|---|---|
| typecheck、lint | exit 0。lint 在主程式碼沒有問題；當時有其他代理的 worktree 留在 `.claude/`，要加 `--ignore-pattern '.claude/**'` 才是 0 |
| audit:ui、contrast-check | 與 V4-9a 相同；contrast 85／85 |
| `npm test -- --run` | **162 檔、3,310 個測試全過** |
| `npm run test:e2e`（帶三個 `*_OUT`） | **1,039 passed、0 failed、25 skipped（31.9 分鐘）** |
| `CAPTURE_BATCH=V4-9b` | 23 passed、5 skipped，與 V4-9a 0 差異 |
| Lighthouse × 3（開跑時 1 分鐘負載 2.30、2.41、1.53） | 390 TBT 中位數都通過：載入示範資料 987.5（門檻 1,109.1）、健檢 776.0（832.3）、商品 82.3（129.9）、會議 984.6（1,071.2）、資料來源 9.0（50.0）。a11y 全 100；390 首頁 Performance 95；預先載入不在量測區間內 |
| 禁區四條命令與 commit 之後的 diff | 都是空的 |

**其他數字**：

- **First Load JS**：516,192 bytes，比 V4-9a 多 1,036，主要是 labels 字串與 Markdown 的橋接程式碼。excel-export 的 chunk 不在首載。
- **axe**：22／22／22／20 個狀態，全部 0 問題。
- **鍵盤走查、下載集合**：與 V4-9a 相同。
- **棘輪**：不升。
- **testid 刪除數**：0。
- **功能保留表**：V4-9b 的 8 列都打勾：49、D09、D11、D27、D29、D38、EX3、EX4。
- **Excel 檔案大小**（同一組輸入，V4-9a → V4-9b）：

  | 資料 | 版本 | 大小（bytes） |
  |---|---|---|
  | golden | 標準 | 22,912 → 30,115（＋7,203） |
  | golden | 客戶 | 22,256 → 28,659（＋6,403） |
  | demo | 標準 | 31,525 → 48,747（＋17,222） |
  | demo | 客戶 | 30,850 → 47,395（＋16,545） |
  | — | 老闆 | 不變 |

- **Markdown 大小**：golden 多 354 bytes，demo 多 398 bytes。

## 3. 人工開檔檢查（未執行，待人工）

樣本放在 `verification/revamp-v4/V4-9b/exports/`：golden 與 demo × 老闆、標準、客戶，各有 xlsx 與 md，量測結果在 `summary.json`。需要用 Excel 開檔檢查，約半天。
