# Review v2 A：工作區 v3 備份

日期：2026-10-01。範圍為備份／恢復相容與所屬回歸測試；未部署、未改 golden 或財務公式。

## 實作

- 新備份版本 `profitlens-workspace-v3`，以來源 SHA-256 去重保存 CSV／manifest；active、行動、各通路方案與會議均引用各自來源。64 MiB 檔案上限保留。
- v1／v2 先按原 wire schema 和 checksum 驗證，再遷移；測試以獨立建立的舊格式資料驗證，不以新格式替換版本字串冒充。
- 恢復重驗所有來源 CSV、dataset/filter hash、唯一識別與引用；方案只保存輸入及計算意圖，恢復時從原始基準重算 284.00／264.00 等值。
- 保存行動 execution status、notes、不可變 binding history，跨通路方案及已算版本、ReviewSession 選用版本與會議範圍；AI 回應、金鑰與同意狀態不納入。
- 已捕捉並修復：active input 與歷史來源的記憶體 alias；偽造 current scenario／review 標籤跨越替換後 active dataset 仍被接受。舊 stale 資料不復活。

## 可核對證據

| 檢查 | 結果 | 紀錄 |
|---|---|---|
| 先寫 v3／legacy 失敗測試 | 7 fail / 2 pass，預期紅測 | `review-v2-a-backup-red.txt` |
| immutable source alias 先驗出錯 | 1 fail / 12 pass，修復前 | `review-v2-a-backup-alias-red.txt` |
| current context 綁定先驗出錯 | 2 fail / 13 pass，修復前 | `review-v2-a-backup-current-status-red.txt` |
| backup／legacy／local-store focused | 4 files / 42 pass | `review-v2-a-backup-final-green.txt` |
| 更新行動選證據也增 binding revision 後，全 unit | 40 files / 816 pass | `review-v2-a-actions-all-unit-green.txt`（由 Action 子任務執行） |
| backup 與兩份所屬 E2E 檔案 lint | exit 0 | `review-v2-a-backup-e2e-lint.txt` |
| production build / 四尺寸 E2E | 本子任務未單獨執行，交主驗收統一執行 | 以主驗收最終紀錄為準 |

第一次 focused run 中 MARKETPLACE 履約 -10% 的新測試錯把結果寫成 -5；已從 fixture 的 baseline -15.00 與履約 85.00 獨立核算為 -6.50。修正僅測試預期，未改 golden。`review-v2-a-backup-first.txt` 保留原失敗紀錄。

## 限制

SHA-256 是完整性檢查，不是作者簽章；合法且重新簽 checksum 的替代資料仍需使用者核對來源。備份是包含原始輸入的本機私有檔案，不能當公開決策摘要分享。真實 live AI 未由此子任務測試。
