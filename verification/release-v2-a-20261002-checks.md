# A 批發布前來源與驗收紀錄核對

核對時間：2026-10-02T02:40:30.723299+00:00（UTC）。本輪僅唯讀檢查來源、環境與原始驗收紀錄，並新增本 Markdown／JSON；沒有修改 production、tests、Git、README 或 STATUS。

**結論：pass，可沿用前次真實驗收。** 139 件來源／測試 SHA-256 全部相符，原 60 件 protected 全部相符，包含 5 件 golden。重新掃描 `src`／`tests` 沒有清單外檔案，且核對開始與完成時來源 hash 未變。

## 當前環境與來源

- Node：`v25.8.2`；npm：`11.11.1`；Git：`git version 2.39.5 (Apple Git-154)`，三個版本命令 exit 0。
- Git HEAD：`bb9173edae9a28eb1970c5a968f1165b0ce64bb5`；分支：`main`。目前 A 批為本機待提交變更；此報告不宣稱已 commit、push 或部署。
- 來源清單：`verification/review-v2-a-source-inventory.json`（原記錄 2026-10-02T02:10:27.332936+00:00）。
- 139 件來源／測試聚合 SHA-256：`ed74b07a06c7839a78e1acc764f487a7a0ed80f187a832e8e9e7dec1f5f6e4b6`。方法為排序後相對路徑與當前 hash 的 JSON（UTF-8、逗號／冒號緊縮分隔）再取 SHA-256；逐檔 expected／actual hash 見同名 JSON。
- Golden expected SHA-256：`856994c0e31e83c1ec88f3fa92b2223fc99eedd95358ad64297f3b01937d28a7`，與原 protected 清單相符。
- `git status --porcelain -- fixtures/golden src/domain package.json package-lock.json` 為空，exit 0。

## 沿用的已執行驗收

| 項目 | 本次核對 | 原始證據 |
| --- | --- | --- |
| `npm test -- --run` | pass；40 檔、819 tests 全部通過，log 有完成摘要 | `review-v2-a-unit-final.txt` |
| `npm run typecheck` | pass；實際命令為 `next typegen && tsc --noEmit`，無錯誤輸出；前次驗收記錄 exit 0 | `review-v2-a-typecheck-final.txt` |
| `npm run lint` | pass；實際 `eslint . --max-warnings=0`，無 diagnostics；前次驗收記錄 exit 0 | `review-v2-a-lint-final.txt` |
| 完整 E2E `npm run test:e2e -- --workers=2` | pass；400/400，每 project 100，0 skipped／unexpected／flaky／errors；400 個 test result 均 passed | `review-v2-a-e2e-final.txt`、`review-v2-a-e2e-full-results.json` |
| 最後提示修正回歸 `npm run test:e2e -- tests/e2e/review-v2-a-export.spec.ts --workers=2` | pass；4/4，各 project 1，0 skipped／unexpected／flaky／errors；實際列印及下載 | `review-v2-a-export-e2e-final.txt`、`review-v2-a-export-e2e-results.json` |
| Production build | pass；兩次 Playwright 使用 `npm run build && npm start -- --port 3100` 且 `reuseExistingServer=false`，E2E 已啟動並完成，佐證 build 成功；最後 BUILD_ID 與目前 `.next`、來源清單一致 | 完整 E2E build `OgD227c9M2k_CpLKXiow8`；最後 build `0U3urGYm_9KI-Zel0tOsR` |

400 項完整 E2E 在最後無置頂提示修正之前；提示修正後另一次 production build 跑 4 項列印／真下載回歸。這是 **400 + 4 兩次已完成執行**，不是聲稱同一命令執行 404 項。四 project 為 Chromium 1440／1280／768／390px。

前次 exit 0 的紀錄來源為 `verification/review-v2-a-acceptance.md`；原始 typecheck／lint 文字 log 本身沒有嵌入 shell exit number。本次已閱讀 log，沒有把「本次沒有重跑」寫成重新執行通過。同名 JSON 記錄各原始 log／result 的 SHA-256、統計及這項限制。

## 本次實際執行與未執行

實際執行：`node --version`、`npm --version`、`git --version`、`git rev-parse HEAD`、`git branch --show-current`、`git status --short --untracked-files=no`、上述 protected Git status；Python 標準函式庫逐檔 SHA-256 比對、解析原始 E2E JSON 全部 test results、核對 unit／typecheck／lint log 和 BUILD_ID。以上核對命令成功完成；逐檔完整結果與命令輸出在同名 JSON。

未重跑 typecheck、lint、unit/integration、build、E2E：來源／測試與原驗收快照完全相符，依本輪範圍沿用前次真驗收。沒有讀取 `.env` 或秘密，也沒有呼叫 Live AI、commit、push、部署或新正式站驗收；這些不屬於此子任務。發布後是否成功須由發布主流程另外確認。
