# Revamp v4 V4-7c 驗收：匯入時間寫進備份（D-V3-30＝A）（2026-10-13）

依 `docs/revamp-v4/06_BATCHES.md`「V4-7c 匯入時間寫進備份」。依賴 V4-7b；允許變動的畫面只有 09（資料來源），而且只限還原備份後的狀態。

**工作方式**：一個工作流程分三步完成，主流程再補兩件事。
- **實作**：代理在主 checkout 實作並提交（`7755050`）。改程式之前，先以 V4-7b 收尾的程式（`1e195ba`）產生備份位元組基準。
- **審查**：三位唯讀審查同時進行，各看一面：
  - 格式與相容：用 v3.0.0 的程式實際讀新備份。
  - 隱私與狀態流程。
  - 測試完整性與護欄：自己在 `1e195ba` 重算位元組基準、跑 E2E、做 40 萬筆 fuzz。
- **修正**：修正代理逐項確認後修正並提交（`97b5726`）。
- **主流程補做**：處理審查細項（`e2b0b82`），再在最終程式上完整驗收（本文件）。

## 1. 決定：v5 加選填欄位，不升 v6

開工時依 `src/application/workspace-backup.ts` 與 PRD §1、§8.8 決定採 06 的建議：**v5 加選填欄位 `payload.active.imported_at`**，版本字串維持 `profitlens-workspace-v5`。

- **格式**：只記到分的 UTC「YYYY-MM-DDTHH:MMZ」，例如 `2026-10-07T06:05Z`。用 zod `z.iso.datetime({ precision: -1 })` 驗證，秒、毫秒、時區位移與不存在的日期都不收。
- **何時寫入**：只有匯入精靈套用後才寫。示範資料、golden 載入、清空、還原沒有此欄位的備份時，匯入時間都是空的，匯出也不會有這個鍵。
- **新程式讀舊備份**：v1–v5 舊檔一律照常還原，匯入時間為 null。v1–v4 信封如果帶這個欄位，以 INVALID_WORKSPACE_FORMAT 拒絕，做法與 V3-9a 的 `ad_decision` 相同。
- **舊程式讀新備份**：以 v3.0.0 正式站的程式（`625bfa5`）實測，結果見 `verification/revamp-v4/V4-7c/old-reads-new.json`。

  | 新備份 | v3.0.0 的結果 |
  |---|---|
  | 精靈匯入 golden 後的備份（有 `imported_at`） | 拒絕：INVALID_WORKSPACE_FORMAT |
  | 含稅匯入後的備份（有） | 拒絕 |
  | 所有選填欄位都有值的備份（有） | 拒絕 |
  | 示範資料備份（沒有） | 照常還原 |
  | golden 載入後的備份（沒有） | 照常還原 |

  - 拒絕時畫面顯示 v3.0.0 既有的「無法讀入：請選擇本工具產生的備份檔（最多 64 MiB）。格式不符、損毀或被改過的檔案不會取代目前資料。」本機副本則是「本機資料無法讀取或驗證，目前資料沒有變更。…」，目前資料都不會被取代。
  - `625bfa5` 與 `1e195ba` 的 `workspace-backup.ts` 完全相同。
  - 如果升 v6，所有新檔在 v3.0.0 都會被拒，所以選 v5 加選填欄位。

## 2. 完成項目（對照 06_BATCHES V4-7c）

| 項目 | 狀態 | 說明 |
|---|---|---|
| 備份加選填 `imported_at` | 完成 | **寫入**：<br>• `src/application/imported-at.ts` 的 `importedAtMinute` 往前取整到 UTC 的分；無效值回傳 null。這是獨立的小模組，不依賴 zod，dashboard 首載不會因此拉進備份模組。<br>• `exportWorkspaceBackup` 只在取整後有值時寫進 `active` 的最後一個鍵。<br>**還原**：`RestoredWorkspace.imported_at` 在 v5 有此欄位時原樣讀回，其餘一律為 null。<br>**dashboard**：<br>• 精靈套用時記 `importedAtMinute(new Date())`。<br>• 還原時帶回 `workspace.imported_at`。<br>• `backupSource` 帶上匯入時間。<br>• 載入示範或 golden 時，改在載入成功後才清空：載入失敗按「回到上次成功的資料」時保留原本的匯入時間，匯入時間永遠屬於目前的資料。 |
| 資料來源頁「版本與來源資訊」在還原後也顯示匯入時間 | 完成 | 畫面沒有改，本來就以 `formatSavedDateTime` 顯示到分（台北時間）。E2E 在四個尺寸驗證：匯入、下載備份、載入示範、還原之後，文字逐字相同 |
| v1–v5 還原照舊 | 完成 | `backup-restore-matrix` 由 16 個測試變成 17 個：golden 加一列「v5（匯入後）」，帶匯入時間並來回保留；其他列都斷言 null 且沒有這個鍵。<br>真正的 v4 檔（`asV4`）與 R0 時代的 v3 備份檔照常還原 |
| 匯入後備份再還原，匯入時間逐字相同 | 完成 | 單元測試 `workspace-backup-imported-at`：再匯出時 `active` 物件相同。<br>E2E 驗證的資料流：<br>• 畫面上的匯入時間 dd 文字。<br>• `formatSavedDateTime(new Date(payload.active.imported_at))`。<br>• 還原後的 dd 文字。<br>以上三者相同 |
| 示範資料備份沒有 `imported_at` | 完成 | E2E：下載示範資料備份，`payload.active` 沒有這個鍵。<br>單元測試：golden、示範資料、`fullBackup` 的位元組與基準相同 |
| 更新 `verification/revamp-v4/backup-schema-*.json` | 完成 | 新增 `verification/revamp-v4/backup-schema-v5.json`：313 個鍵路徑，多了 `payload.active.imported_at` 與 `active_imported_at` 說明區塊。<br>`integrity` 更正了還原順序：先 strict schema，再 checksum；revamp-v3 清單把這兩步寫反了。<br>revamp-v3 的清單保留為歷史紀錄。<br>`backup-schema-v5.test` 釘住兩份清單只差這一個鍵與說明 |
| 既有匯出位元組不變 | 完成 | `tests/fixtures/backup-bytes-v4-7b.json` 是改程式之前在 `1e195ba` 以固定時間產生的四份備份（golden 2,759 bytes、示範 263,439、full 17,395、full＋廣告決策 17,420），記錄位元組數與 SHA-256。<br>V4-7c 沒有匯入時間時四份逐位元組相同。兩位審查各自在 `1e195ba` 的 worktree 重算，結果一致；審查 R3 另在台北、UTC、洛杉磯三個時區重算過。<br>有匯入時間時只差插入的鍵與 checksum。<br>其他匯出（分析 CSV、Excel、PPT、決策 JSON、Markdown、PDF）都拿不到匯入時間：grep 與審查 R2 都已確認 |
| 隱私：只記到分，只存在使用者自己的備份檔 | 完成（範圍見已知限制） | 以下寫入路徑都經 `importedAtMinute`，只會存到分：<br>• dashboard state<br>• 備份下載（儲存選單、取代確認 dialog）<br>• 本機副本（手動、自動保存）<br>分析事件只記事件名，不送出任何時間。<br>審查 R3 用 40 萬筆 fuzz 比對 `importedAtMinute` 與 zod：0 筆輸出被 schema 拒絕、0 筆不冪等 |
| labels | 完成 | 沒有新增字串，沿用 V3-8 的「匯入時間」；`labels.zh-TW.ts` 與 `1e195ba` 逐位元組相同 |
| 測試 | 完成 | **新增**：<br>• `tests/workspace-backup-imported-at.test.ts`（11 個測試）<br>• `tests/helpers/backup-bytes.ts`<br>• `tests/fixtures/backup-bytes-v4-7b.json`<br>• `tests/e2e/backup-imported-at-v47c.spec.ts`（四尺寸；含載入失敗後回到上次成功的資料、還原沒有匯入時間的示範資料備份）<br>**擴充**：<br>• `backup-restore-matrix`<br>• `backup-schema-v5`<br>• `data-workspace-v3`<br>• `tests/helpers/full-backup.ts`（`importedAt` 選項；`asV4` 拿掉此鍵）<br>**改寫**：`tests/e2e/revamp-r4.spec.ts`，原本斷言 V3-8「還原後沒有匯入時間列」，改為還原後有一列且逐字相同（D-V3-30＝A） |
| 功能保留表 | 完成 | `batch` 含 V4-7c 的 3 列（51、D49、D50）都已打勾 |

**錯誤碼對照**（單元測試逐條斷言）：

| 情況 | 結果 |
|---|---|
| v5 改了或刪了 `imported_at`，但沒重算校驗碼 | WORKSPACE_CHECKSUM_MISMATCH |
| 重算校驗碼，值帶秒、毫秒、`+08:00`、沒有 Z、`2026-02-30`、`""`、`null` 或數字 | INVALID_WORKSPACE_FORMAT |
| 鍵放錯位置（`payload.imported_at` 或頂層） | INVALID_WORKSPACE_FORMAT |
| v1–v4 信封帶 `active.imported_at` | INVALID_WORKSPACE_FORMAT（同一個檔拿掉這個鍵就能還原，匯入時間為 null） |

## 3. 變更檔案

- **新增**
  - 程式：`src/application/imported-at.ts`
  - 測試：`tests/workspace-backup-imported-at.test.ts`、`tests/helpers/backup-bytes.ts`、`tests/fixtures/backup-bytes-v4-7b.json`、`tests/e2e/backup-imported-at-v47c.spec.ts`
  - 欄位清單：`verification/revamp-v4/backup-schema-v5.json`
  - 本文件、`verification/revamp-v4/V4-7c/`（含 `old-reads-new.json`）
- **修改**
  - 程式：`src/application/workspace-backup.ts`、`src/components/dashboard.tsx`、`src/components/workspace-panels.tsx`（只改 prop 註解）
  - 測試：`tests/helpers/full-backup.ts`、`tests/backup-restore-matrix.test.ts`、`tests/backup-schema-v5.test.ts`、`tests/data-workspace-v3.test.tsx`、`tests/e2e/revamp-r4.spec.ts`、`tests/e2e/import.spec.ts`（只改註解）
  - 清單：`verification/revamp-v4/{feature-retention.csv,e2e-text-assertions.csv}`（後者登記本批 9 個非 testid 定位器）
  - 文件：
    - `docs/{ARCHITECTURE.md,ENGINEERING.md,STATUS.md,DECISIONS.md}`
    - `docs/revamp-v4/{01_PRD.md,06_BATCHES.md,09_DECISIONS_PENDING.md,00_README.md}`
    - PRD 三處「不改備份 schema」補上 V4-7c 這個唯一例外；09 新增 D-V4-55，D-V3-30 那一列補記完成
- **零改動**
  - 財務禁區
  - labels
  - `package.json`、`package-lock.json`
  - 上限檔、`copy-density`
  - testid 清單：本批沒有新 testid，`testids-v4-added.txt` 仍是 329 列

## 4. 驗收命令與真實結果（最終程式 `e2b0b82`）

| 命令 | 結果 |
|---|---|
| `npm ci` | 未執行（lockfile 沒有變動） |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run audit:ui -- --json verification/revamp-v4/V4-7c/ui-audit.json` | 與 V4-7b 完全相同：design 15 項；class 885；動態 testid 屬性 71 |
| `npm run contrast-check` | 85／85 通過 |
| `npm test -- --run` | **161 檔、3,244 個測試全過**（V4-7b 是 160 檔、3,231 個） |
| `npm run build` | exit 0 |
| `npm run test:e2e`（帶三個 `*_OUT`） | **1,001 passed、0 failed、15 skipped（30.5 分鐘）**。新增 4 條，是新 spec × 4 個尺寸。跑完已還原 E2E 改寫的追蹤檔 |
| PUBLIC_DEMO build 與伺服器（3100） | exit 0；`GET /` 回 200 |
| `CAPTURE_BATCH=V4-7c …`（先複製 V4-7b 的 52 張） | **23 passed、5 skipped，第一次就是 0 差異**。52 張 PNG 與 V4-7b 逐位元組相同（cmp）。09 的示範資料狀態沒有匯入時間，所以不變；這是預期結果。不需要更新基準 |
| Lighthouse × 3（開跑時 1 分鐘負載 2.40、2.28、2.38；門檻 < 2.5） | 390 的五項 TBT 都通過（見下表） |
| `lsof -ti tcp:3100 \| xargs kill`；`lsof -ti tcp:3100` | 已停，沒有輸出 |
| 禁區四條命令 | 四條都是空的 |
| commit 之後 `git diff --stat 625bfa5 HEAD -- （禁區與 assist-kpi、breakeven-mer 路徑）` | 見文末（收尾 commit 之後補記） |
| 隱藏字元掃描 | 0 |

**棘輪與基準數值**

| 項目 | V4-7c | 與基準比較 |
|---|---|---|
| design-lint 15 項、copy-style、copy-density、chart-lint CL-1–CL-11 | 上限檔沒動；chart-lint 全 0 | 不變 |
| testid 刪除數（v2、v3、v4 新增） | 0、0、0；本批沒有新 testid（累計 329） | — |
| labels 快照 | 2,581 個鍵逐字相同；本批沒有新 key（v4 累計 203） | — |
| First Load JS gzip（B5） | **511,610 bytes**（V4-7b 為 511,174，多 436，來自 `imported-at.ts` 與 dashboard 的接線）；門檻 545,397，**剩 33,787** | 通過 |
| B1、B2、B3、B9 | 與 V4-7b 相同（metrics.json 除了首載與 Lighthouse 沒有其他差異） | 不變 |
| Lighthouse Accessibility | 1440、390 各 8 頁，三次全部 100 | 不變 |
| Lighthouse Performance（空狀態首頁） | 1440 為 100；390 為 94、94、94（V4-7b 為 95） | ≥ 90，通過 |
| 預先載入 | 三次的 `insideTimespans` 都是空的 | 不在量測區間內 |
| axe 四尺寸 | 18／18／18／17 個狀態全 0，除了 `checked_at` 與 V4-7b 完全相同 | 通過 |
| keyboard-walk | 除了 `checked_at` 與 V4-7b 完全相同；`aria-hidden` 內的停留點 0 | 不變 |
| network-log | desktop、mobile 的 `checks` 與 `totals` 相同，檔名相同。**備份 266,782 → 266,816（多 34 bytes）**：這個流程有精靈匯入 golden，多出的正好是 `,"imported_at":"YYYY-MM-DDTHH:MMZ"`。分析 CSV 356,738、Excel 22,913、PPT 85,016、決策 JSON 204,397 都與 V4-7b 相同 | 只有備份依設計變動 |
| 功能保留表 | 51、D49、D50 打勾 | 完成 |

**390 TBT**（低負載三次，單位 ms）

| 頁面 | 三次 | 中位數 | 門檻 | 結果 |
|---|---|---|---|---|
| 載入示範資料 | 1,069.4、1,099.7、1,008.0 | 1,069.4 | 1,109.1 | 通過 |
| 通路健檢 | 819.3、831.7、827.0 | 827.0 | 832.3 | 通過 |
| 商品毛利 | 92.3、90.8、96.2 | 92.3 | 129.9 | 通過 |
| 會議紀錄 | 1,002.9、1,000.0、1,012.5 | 1,002.9 | 1,071.2 | 通過 |
| 資料來源 | 15.9、15.7、13.3 | 15.7 | 50.0 | 通過 |

不需要 D-V4-47 的同場對照。本批只改 dashboard 的兩行與備份模組，量測路徑上沒有新的計算。

**畫面基準差異**：無。允許變動的 09 在示範資料下沒有匯入時間，所以 0 差異。還原後的狀態由 E2E 在四個尺寸斷言。

## 5. 瀏覽器驗收方式與截圖

- **截圖**：`verification/revamp-v4/V4-7c/snapshots/{desktop,laptop,tablet,mobile}/`，每個尺寸 13 張，與 V4-7b 相同。
- **方式**：在本機 production build 的 LOCAL 伺服器上，用四個視窗跑 E2E `backup-imported-at-v47c`。流程依序是：
  1. 精靈匯入 golden。
  2. 到資料來源頁讀匯入時間。
  3. 用儲存選單下載備份，檢查格式，並確認 `formatSavedDateTime` 結果與畫面相同。
  4. 載入示範資料：匯入時間列消失；示範資料備份沒有這個鍵。
  5. 示範資料 API 回 500 時，按「回到上次成功的資料」：匯入時間不變。
  6. 還原匯入後的備份：匯入時間一列、逐字相同；再下載一次，值相同。
  7. 還原示範資料備份：匯入時間列消失。

  手機版的儲存選單在頂欄「更多」裡。`revamp-r4` 另外在目標與檔期流程中驗證還原後逐字相同。
- **量測檔**：`verification/revamp-v4/V4-7c/` 下的 `metrics.json`、`first-load-modules.json`、`ui-audit.json`、`axe.json`、`keyboard-walk.json`、`network-log.json`、`old-reads-new.json`，以及 `lighthouse/`、`lighthouse-runs/`。

## 6. 已知限制與風險

- **v3.0.0 讀不了匯入後在 v4 存的備份**：拒絕的方式見 §1。v4 上線後如果回滾到 v3.0.0，使用者在 v4 匯入後存的備份與本機副本，在 v3.0.0 讀不到，目前資料也不會被取代。示範、golden 與還原舊檔後再存的備份不受影響。上線與回滾說明要寫進 RELEASES；預定在 V4-11 寫 v4.0.0 RELEASES 時一起記。
- **「只記到分」只涵蓋 `active.imported_at`（審查 V47C-PRIV-1，列為待拍板 D-V4-55）**：
  - 備份 v5 本來就有幾個到毫秒的時間：`saved_at`、`review_session.created_at`、`meeting_history[].created_at`、`finalized_at`、`assumptions_acknowledged_at`。
  - 工作階段的第一份資料（或清空後的第一份）是精靈匯入時，會議稿在同一次套用時建立，`review_session.created_at` 就是套用當下、精確到毫秒。會議結束後，它會進到會議紀錄 Markdown 的技術細節。
  - 這些時間 v3 就有，也只存在使用者自己的檔案裡。改它們會改變既有匯出的位元組與 R6 會議的語意，所以本批不改。
- **儲存選單「備份內容」的說明沒有提到匯入時間**（審查 V47C-PRIV-2）：這是既有字串，凍結不改。要補需要另外拍板新字串。
- **network-log 的備份多 34 bytes**：這是依設計的結果。
- **首載變化**：First Load JS 多 436 bytes，390 首頁 Performance 由 95 變 94，都還在門檻內。
- **人工關卡**：H6 與 PPT 人工開檔都未執行。

## 7. 下一步、人工關卡與待拍板

- **待拍板**：新增 **D-V4-55**（備份與會議紀錄既有的毫秒時間），建議 **A 維持現況**；B／C 是之後另排批次，把會議稿與會議時間（以及 C 再加 `saved_at`）取整到分。回覆前照 A。
- **下一批**：V4-8 投影與四尺寸總檢。這批要一併做 D-V4-44 B、D-V4-45 B、D-V3-33／34／35，以及 G12 摘要對齊。
- **部署**：本批沒有部署；preview 部署仍需使用者當次明確同意。
