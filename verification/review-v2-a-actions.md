# Review v2 A1：行動執行與證據引用

驗證日期：2026-10-01。本文件記錄 A1 子範圍；完整 A 批 build、跨尺寸 E2E 與操作驗收由主線報告彙整。

## 實作邊界

- 行動管理與證據確認分離：新增執行狀態 `not_started / in_progress / blocked / completed` 及進度紀錄。編輯負責角色、期限、管理文字、執行狀態與進度不撤銷引用確認；確認引用不代表已執行或已有商業成效。
- 切換檢視期間／通路不改寫行動原始來源、不鎖住管理欄位。換資料版本後顯示引用舊資料版本，仍保留原始金額與來源。
- 原始資料限制獨立顯示，不自動填入使用者可編輯的「所需額外資料」。
- 重新綁定必須先預覽，再明確確認；沿用原始分析期間及範圍，以 `metric + period + scope` 對應唯一事實。相同 fact ID 不表示相同資料版本或金額。
- 預覽會重新驗證來源 hash、重算原始範圍；提交時再次驗證完整預覽，拒絕預覽後換資料、換 revision、換引用或竄改預覽。元件也以 request token 與最新 workspace/source 檢查阻擋晚到結果。
- 每次修改證據選取或成功重新綁定都新增 binding revision，保留前版引用，包括首次從空白草稿選取證據。如此既有會議草稿引用不會因相同 revision 靜默改變。管理欄位修改不新增證據版號。
- 舊版 stale 是人工核對需求，切換檢視或恢復備份不會自動復活；必須重新確認原始證據或明確重新綁定。
- 決策匯出增加執行狀態、進度、歷史／目前資料關係與完整歷史引用，沿用安全 CSV 與 Markdown escaping。

## 變更檔案

- `src/application/action-workspace.ts`
- `src/components/actions-workbench.tsx`
- `tests/v2-actions.test.ts`
- `tests/action-workspace.test.ts`
- `tests/action-export.test.ts`
- `tests/e2e/action-workspace.spec.ts`

未修改 domain、財務口徑、fixtures 或 golden expected。

## 測試紀錄

| 檢查 | 結果 | 證據與說明 |
| --- | --- | --- |
| 先寫 A1 失敗測試：`npm test -- --run tests/v2-actions.test.ts` | **fail，exit 1** | `review-v2-a-actions-red.txt`；原實作 11/11 失敗。其後新增第 12 個 legacy 同版本重新綁定回歸案例。 |
| A1 與既有 action 回歸初次執行 | **fail，exit 1** | `review-v2-a-actions-regression-first.txt`；23 pass / 5 fail，舊測試仍要求切篩選 stale 或填滿管理欄位才可確認。依核准 A1 語意更新測試，未改 golden。 |
| `npm test -- --run tests/v2-actions.test.ts tests/action-workspace.test.ts tests/action-export.test.ts` | **pass，exit 0** | `review-v2-a-actions-green-final.txt`；3 檔、29 tests。涵蓋 view、管理欄位、legacy stale、資料不可變捕捉、同 ID 異值、null、取消／明確同意、原始 scope/period、競爭／竄改防護、歷史保留與非法歷史拒絕。 |
| A1 加上會議引用整合：`npm test -- --run tests/v2-actions.test.ts tests/action-workspace.test.ts tests/action-export.test.ts tests/v2-review.test.ts` | **pass，exit 0** | `review-v2-a-actions-integration-green.txt`；4 檔、34 tests。修復未確認草稿改 evidence 卻保留相同 binding revision 的問題。 |
| Scoped ESLint，含 A1 E2E 檔 | **pass，exit 0** | `review-v2-a-actions-lint-final.txt` 無錯誤輸出。初次 JSX 括號錯誤保留於 `review-v2-a-actions-lint-first.txt`，已修復。完整命令見下方。 |
| 全部 unit 第一次：`npm test -- --run` | **fail，exit 1** | `review-v2-a-actions-all-unit-first.txt`；812 pass / 2 fail，分別為 backup 當前 baseline 檢核與 meeting 同 revision 引用。前者交由備份負責者修復，後者已修復並通過整合測試。 |
| 全部 unit 第二次：`npm test -- --run` | **fail，exit 1** | `review-v2-a-actions-all-unit-final.txt`；813 pass / 1 fail。備份測試固定預期 revision 2，首次選取證據保留歷史後實際為 3；已回報備份負責者同步新版號與歷史索引斷言。 |
| 全部 unit 修復後：`npm test -- --run` | **pass，exit 0** | `review-v2-a-actions-all-unit-green.txt`；40 檔、816 tests 全部通過。備份負責者已同步引用版號與歷史斷言；另外兩個並行新增回歸案例也納入本次執行。 |
| 暫態 TypeScript 檢查 | **fail，exit 2** | `review-v2-a-actions-typecheck.txt`，當時另有 decision-export、workspace-backup、dashboard 跨檔整合型別錯誤，已回報各負責者。A1 不據此宣稱整體 typecheck 通過；最終結果依主線工程檢查。 |
| A1 browser / E2E | **not_run（本子報告撰寫時）** | 已更新兩個回歸案例、新增管理／filter 與真 CSV 重新綁定取消／成功案例；未自行 build 或宣稱瀏覽器驗收。交由主線統一執行三尺寸測試並記錄結果。 |

Scoped lint 命令：

```sh
npx eslint src/application/action-workspace.ts src/components/actions-workbench.tsx tests/v2-actions.test.ts tests/action-workspace.test.ts tests/action-export.test.ts tests/e2e/action-workspace.spec.ts
```

## 瀏覽器案例交付與限制

`tests/e2e/action-workspace.spec.ts` 檢查以下四個流程：診斷來源與五行動／三置頂／備份恢復；固定會議引用在切檢視後保留；管理欄位與執行進度編輯及安全 CSV；將 golden 複製至瀏覽器匯入欄位、只把 DTC 本期廣告 270 改成 370，驗證原始引用仍為 270、重新綁定預覽為 170、取消不改引用、確認後新值與歷史舊值均可追溯。測試僅建立記憶體匯入 payload，沒有改 fixtures。

本範圍沒有執行 live AI、部署或遠端寫入。執行狀態與進度是使用者紀錄；不推估或宣稱實際成效。歷史保留針對證據引用版本，並非完整管理文字的每次編輯稽核。
