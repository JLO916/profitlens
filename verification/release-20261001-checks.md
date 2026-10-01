# 2026-10-01 系統發布：本機工程檢查

本輪依使用者「先做系統發布」執行；Live AI 未執行。全部產品 source、原測試與 golden 均未修改。

| 項目 | 結果 | 實際命令與證據 |
|---|---|---|
| 型別 | pass | `npm run typecheck`，初次及最終均 exit0；`release-20261001-typecheck.txt`、`release-20261001-typecheck-final.txt` |
| Lint | pass | `npm run lint`，初次及最終均 exit0；`release-20261001-lint.txt`、`release-20261001-lint-final.txt` |
| Unit / integration | pass | `npm test -- --run`，exit0，34 files／766 tests；`release-20261001-unit.txt` |
| Production build | pass | E2E webServer 實際執行 `NEXT_TELEMETRY_DISABLED=1 npm run build`，成功後才以 `npm start -- --port 3100` 啟動；`release-20261001-build.txt`；BUILD_ID=`lHUOyzPXNUWjxCt_69L8j` |
| 全部 E2E | pass | `npm run test:e2e -- --config verification/release-20261001-e2e.config.ts`，重跑 exit0，282 passed，0 skipped／unexpected／flaky，286.080秒；`release-20261001-e2e.txt`、`release-20261001-e2e-results.json` |
| 前端秘密邊界 | pass（本機 build） | Python 掃描23個 `.next/static` 檔案，無本輪假的 canary、API key/model 環境變數名稱、server SDK 標記；`release-20261001-bundle-security.json` |
| 來源一致性 | pass | Python SHA-256核對122份產品／測試／設定，全部與第三批已驗證快照一致；`release-20261001-source-check.json` |
| Live model | not_run | 假 canary 僅供資產掃描；全程 `ENABLE_LIVE_AI=false`。AI E2E 中模型成功回覆為 mock，不能當 Live 驗收 |
| 正式站／人工瀏覽器 | 本報告未涵蓋 | 由發布主流程另記；這份是本機自動化工程驗收，不冒稱正式站或人工完成 |

## 瀏覽器範圍與歷史保留

Chromium 實際執行1440×1000、768×1024、390×844，各94項。包括合成替代CSV真匯入、診斷、情境、行動、Markdown／CSV／JSON下載內容、資料缺漏、CSV／XSS、stale與不同browser context隔離。

為不覆蓋歷史輸出，13份完整spec複製到 `verification/release-20261001-e2e/`，只將證據檔名前綴從 `manager-batch3` 改為 `release-20261001`，反向正規化後位元一致；沒有改斷言。獨立config僅改測試位置、輸出位置及假的canary。證據 `release-20261001-e2e-provenance.json`。所有本輪screenshots／browser JSONL均使用此新前綴。

246筆browser記錄（三尺寸各82）含刻意HTTP503案例的3條console error，以及舊請求取消案例的3條requestfailed；均來自既有明確負向測試，非未解釋錯誤。詳見 `release-20261001-browser-summary.json`，不宣稱console完全零錯誤。

## 首次失敗與處理

第一次E2E命令exit1：build完成後sandbox拒絕本機127.0.0.1:3100監聽（EPERM），任何E2E案例尚未執行。保留 `release-20261001-e2e-first.txt` 與 `release-20261001-e2e-first-results.json`。同命令經正常核准提升權限後通過，未關閉sandbox政策、未改產品或測試預期。

第二次build log因Playwright的config位置先寫到巢狀verification目錄；建置完成後原樣移至本輪路徑，並把config webServer cwd明確指定專案根目錄供重跑。此路徑調整後重新typecheck/lint通過，沒有重跑不必要的build／E2E。建置僅有NO_COLOR／FORCE_COLOR顯示設定警告，不影響結果。
