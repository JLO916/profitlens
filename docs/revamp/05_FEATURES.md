# 05 功能規格（新增與強化）

> 每項列：目的／規格／資料與相容／驗收。對應批次標在標題。domain 只允許**加法**；既有 `contribution-v1` 指標的輸入輸出不變。

## 1. 輔助指標層（R4）— `src/application/assist-kpi.ts`，版本 `assist-kpi-v1`
**目的**：給經理人熟悉的數字，但明確標示「輔助」，不混入財務核心。
| 指標 | 定義 | 無法計算時 | 來源 |
|---|---|---|---|
| 售出件數 | Σ `units_sold`（期間 × 通路） | 任一列 units_sold 缺 → 顯示「資料待補」 | domain 新增：`Summary.units_sold: bigint \| null`（加法，validation 已解析 units_sold） |
| 件均淨營收 | 淨營收 ÷ 售出件數 | 件數 0 或缺 → 不適用 | application |
| 廣告佔比 | 既有 `marketing_burden` | 既有規則 | domain 既有 |
| MER（廣告投報） | 既有 `mer` | A=0 → 不適用（不是 0 或 ∞） | domain 既有 |
| 商品毛利率 | 既有 `gross_margin` | 既有 | domain 既有 |
| 退款比 | 既有 `refund_ratio` | 既有 | domain 既有 |
| 物流費佔比 | 既有 `fulfillment_burden` | 既有 | domain 既有 |
| 訂單數／客單價／轉換率 | 需 `orders_daily.csv`（§6，可延後） | 無檔 → 整列不顯示 | 選配 |

呈現：總覽 KPI 五卡下方一條「輔助指標」橫列（六格；R4 實作註記：依上表列出七格，含物流費佔比），每格附一句定義 tooltip 與「→ 怎麼算的」。健檢頁的規則列也可用這些數字組標題。匯出：Markdown 摘要加「輔助指標」小節；分析 CSV 加欄位（`unit=ratio` 規則沿用）。

## 2. 期間快捷與去年同期（R4）— `src/application/period-presets.ts`
| 快捷 | 規則（以資料到期日 `data_as_of` 為基準） | 比較方式 |
|---|---|---|
| 近 7 天 | 本期＝到期日往前 7 天；上期＝再往前 7 天 | 等天數 |
| 近 4 週 | 本期 28 天；上期前 28 天 | 等天數 |
| 近 12 週 | 本期 84 天；上期前 84 天 | 等天數 |
| 本月 vs 上月 | 本期＝到期日所在月份（若未滿月則提示改用等天數）；上期＝上一個完整月 | 整月 |
| 去年同期 | 本期維持使用者目前本期；上期＝本期起訖各減一年（整月模式則同月減一年） | 沿用 |
規則：快捷只填入四個日期並捲動到「套用」按鈕（維持明確套用）；超出涵蓋範圍時按鈕停用並顯示「資料只到 2026-06-01，無法取去年同期」。閏年 2/29 → 2/28。單元測試含邊界（月底、閏年、涵蓋邊緣）。

## 3. 目標與達成率（R4）— `targets.csv`（選配）
- 格式：`period_start,period_end,channel,metric,target`；`channel` 可為 `ALL`；`metric` ∈ {net_revenue, gross_profit, contribution_after_marketing, ad_spend}；金額 TWD 未稅。
- 匯入入口：資料來源頁「目標（選填）」；驗證：日期、金額、metric 白名單、通路存在；錯誤列出行號。
- 匹配：本期與目標期間**完全相同**才顯示達成率；部分重疊不按比例折算（避免假精確），顯示「目標期間 8/1–8/31 與本期不一致」。
- 呈現：KPI 卡右下角「目標 8,000,000 · 達成 98.1%」；達成率 = 實際 ÷ 目標（目標 ≤ 0 不定義）。
- 備份 v4 保存 targets；匯出摘要加「目標達成」小節。

## 4. 促銷檔期標記（R4）— `events.csv`（選配）
- 格式：`start,end,label`；例 `2026-07-15,2026-07-20,夏季特賣`。
- 呈現：週趨勢圖以淡色區帶＋標籤標示；三件事列若期間與檔期重疊，標題後加「（夏季特賣期間）」提示，不改計算。
- 備份 v4 保存；可在資料來源頁編輯／刪除。

## 5. 備份 schema v4（R4）— `workspace-backup.ts`
- `WORKSPACE_VERSION = "profitlens-workspace-v4"`；新增 `preprocessing`（含稅換算）、`targets`、`events`、`meeting_history`（R6）、`ui_prefs`（看板／清單、上次快捷）。
- 讀取 v1–v3：沿用現有遷移鏈，新欄位給空值；checksum 規則不變；64 MiB 上限不變。
- 測試：v3 檔讀入 → 保存為 v4 → 再讀入，三份 CSV 與 scenario／action 內容逐位元一致。

## 6. 選配訂單檔（R4 末或延後）— `orders_daily.csv`
- 格式：`date,channel,orders,sessions,currency`；`sessions` 可空。唯一鍵 日 × 通路。
- 指標：訂單數 Σorders；客單價＝淨營收 ÷ 訂單數；轉換率＝訂單數 ÷ sessions（sessions 缺則不顯示）。
- 與三檔同樣的 coverage 檢查；缺列視為 partial（該日通路訂單數未知）。
- 這會動到 `validation.ts` 的檔案清單（加法）；需新 golden fixture `fixtures/orders_sample`（手算 expected.json）。若決策 D6 為「延後」，本節整段跳過。

## 7. 健檢清單化（R5）— `manager-summary.ts` + `workspace-panels.tsx`
- 資料結構：由現有 `Diagnostic[]` 轉成 `DiagnosisGroup[]`：`{ rule, headline, impact_cents, scopes: [{channel|"ALL", facts, impact}], next_step, caution, missing: boolean }`。
- `impact_cents` 定義（呈現用，不是新財務指標，寫入 `docs/DECISIONS.md`）：REV_UP_CM_DOWN → ΔCM；NEGATIVE_CHANNEL_CM → 本期 CM；DISCOUNT/REFUND/FULFILLMENT/MARKETING_BURDEN_UP → −Δ該費用；SKU_NEGATIVE_GP → 本期 GP；MISSING → 無（置頂）。排序：missing 先，再 |impact| 由大到小；門檻套用於 |impact|。
- 三件事＝前三個 group；健檢頁＝全部 group。既有「排序用已觀察金額差」保留在技術細節。

## 8. 情境範本與絕對值輸入（R5）— `src/application/scenario-presets.ts`
- 範本（填入五個欄位，使用者仍要勾假設、按計算）：
  | 範本 | 銷量 | 折扣率 | 每件物流費 | 廣告預算 | 一次性 |
  |---|---|---|---|---|---|
  | 維持現況 | 0 | 0 | 0 | 0 | 0 |
  | 雙 11 檔期 | +60% | +5 點 | 0 | +100% | 0 |
  | 砍廣告一半 | −20% | 0 | 0 | −50% | 0 |
  | 取消免運（物流費自付） | −10% | 0 | −40% | 0 | 0 |
  | 漲價 5%（以降折扣模擬） | −5% | −5 點 | 0 | 0 | 0 |
  | KOL 合作 | +15% | 0 | 0 | 0 | 50,000 |
  範本的數字是「起手假設」，UI 必須標示「範本數字只是起點，請改成你的假設」，且每個範本附一句用途。範本不寫入 domain。
- 絕對值模式：每格可切換；轉換公式（在表單層，送入引擎仍是相對值）：
  - 銷量：`v = 目標件數 ÷ 本期件數 − 1`（需 §1 的售出件數；缺則停用此模式）
  - 折扣率：`δ = 新折扣率 − 本期折扣率`（百分點）
  - 廣告預算：`a = 新預算 ÷ 本期廣告費 − 1`（本期廣告費 0 時停用）
  - 物流費單價：維持相對 %
  - 一次性：本來就是絕對值
  顯示「＝ 相對 +12.3%」讓兩種模式對得上；超出引擎界限（−90%…+200% 等）即時提示。
- 版本號：只在「計算」成功時 +1；表單修改中顯示「草稿（未重新計算）」。
- 敏感度（要賣到多少才划算）：三組輸入納入 scenario state、決策匯出與備份（現為頁內暫存）。

## 9. 行動看板（R5）— `actions-workbench.tsx`
- 視圖切換：看板（四欄依 `status`）／清單。看板卡可拖曳改狀態（可用按鈕替代拖曳以確保 a11y）。
- 表單修正：期限 `type="date"`；負責人 `<input list="owners">`，datalist 由本工作區既有負責人組成；證據選取為可搜尋 checkbox 清單；執行狀態 select 高度修正（CSS）。
- 「引用較早資料」徽章與「用目前資料重新核對」保留現有語意。
- 會議紀錄的「上次決議追蹤」讀取行動的 `status` 與 `updated_at`。

## 10. 會議紀錄物件（R6）— `src/application/meeting.ts`（承接 `review-session.ts`）
- `Meeting { id, name, date, source_fixed: {dataset_hash, periods, channels}, agenda: auto, decisions[], pinned_action_ids[], selected_scenarios, notes, thresholds, created_at, finalized_at }`。
- 「結束會議」= finalize：寫入 `meeting_history[]`（備份 v4），之後只讀；新會議從目前資料建立。
- 上次會議比較：同 dataset_hash 與同通路才比對 KPI（上次 vs 本次）；期間不同時顯示「上次 7/13–8/23，本次 8/24–10/4」並比較；dataset 不同則只列上次決議與行動狀態。
- 總覽頁只顯示「本期會議：草稿／已結束 → 前往會議紀錄」。

## 11. 匯出（R6）
| 格式 | 作法 | 依賴 |
|---|---|---|
| PDF | 強化現有列印樣式（`@media print`，A4 直式一頁摘要＋附錄），按鈕「匯出 PDF」呼叫 `window.print()` 並提示「選擇另存為 PDF」 | 無 |
| Excel | 多工作表（摘要、通路、橋接、商品比較、行動、口徑）；工作表名與欄位用 labels | `xlsx`（SheetJS）或 `exceljs`，見決策 D4 |
| PPT 一頁式 | 16:9 一頁：標題、兩個關鍵差額、三件事、通路表、決議與置頂行動 | `pptxgenjs`，見決策 D4；若不允許則改為「PDF 一頁式」 |
| Markdown／CSV／JSON | 維持，名稱改 labels | 無 |
所有匯出仍在瀏覽器本機產生；CSV 防公式注入規則不變；新格式同樣對不可信文字逃逸。

## 12. 預設保存（R6）— `workspace-storage.tsx` + `local-store.ts`
- 首次載入資料時彈一次「要不要把工作區存在這台電腦？（不上傳）」；同意後：每次變更 2 秒內自動保存，頂欄顯示「已保存 14:32」；不同意則維持現狀（每次手動）。
- 「刪除本機資料」保留；共享電腦提醒移到同意對話框內。
- 恢復流程維持「預覽 → 確認」。

## Phase 2（本輪不做，列出以免被誤加）
帳號與登入、雲端同步與分享連結、多人留言／指派通知（LINE／Slack／Email）、UI 內訂單級自動彙總、SKU 層級廣告歸因、固定費與所得稅到營業利益／淨利、即時 AI 公開開放與費用控管、平台／廣告 API 直連、多店多幣別、異常自動推播。
