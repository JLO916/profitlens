<!-- V3-10 上線檢查（06_BATCHES V3-10；V3-9a 驗收已知問題「示範資料的決策匯出約 84 MB」）：決策匯出大小調查（代理 C，2026-10-08；只調查、不改 src）。 -->
# 示範資料的決策匯出大小調查（V3-10 代理 C）

## 結論

- **重現了 V3-9a 的數字**：載入示範資料、從第一個健檢加入一個待辦，決策 CSV **84,075,372 bytes（569 列）**、JSON **33,157,890 bytes**、Markdown **18,742,685 bytes**；同一份工作區的備份檔只有 265,670 bytes，原始三份 CSV 合計 254,178 bytes。
- **主因是「來源列清單」被逐列重複**，不是資料量本身：
  - CSV 的 `source_refs` 欄占 **71,500,417 bytes（85.0%）**。
  - 沒有自己來源的列（snapshot／baseline／formula／limitation 等 59 列）一律帶入整個工作區的來源清單（`session.sources`，示範資料 1,848 個來源列，每格 241,053 bytes）→ 14.2 MB。
  - 待辦的每個欄位一列（24 列），每列都帶該待辦引用的 6 個數字的全部來源列（`action.evidence.flatMap(fact => fact.sources)`，約 1.44 MB／格）→ **34.6 MB（41%）**。
  - 480 個 fact 列各帶自己的來源（合計 162,960 個來源列）→ 21.2 MB（25%）。
  - JSON 的 `session.facts`（同一批 162,960 個來源物件，縮排兩格、每個物件 6 行）占 25.8 MB（78%）、124 萬行；Markdown 的「引用的數字與來源」段占 17.4 MB（93%）。
- 試算頁開過一次（多一個 DTC 的試算 context）後再匯出，CSV 會到 **104.6 MB**、JSON 50.6 MB、Markdown 27.2 MB（每個 context 的 session 再帶一份 facts）。
- **同樣的問題也在頂欄「下載目前分析 CSV」**：示範資料 39,772,431 bytes（426 列），`source_refs` 占 33,576,946 bytes（84%）；商品 CSV 2,627,333 bytes（74% 是 `source_refs`）。不在本次任務範圍，一併列出供收尾者判斷。
- **不改輸出內容的優化只能省時間與記憶體，省不了檔案大小**（位元組相同，檔案就一樣大）。要讓檔案變小，一定要改輸出格式（至少 JSON 縮排）或改語意（來源列不重複、改成行號區間）。
- **建議（D-V3-36 草案，見最後一節）**：v3.0.0 不改匯出（維持 D11 與既有基準），在 RELEASES／STATUS 列為已知限制；v3.1 以「來源改行號區間＋不重複」升 `export_version`，CSV 可降到約 0.9 MB（−98.9%）。

## 量測方法（可重現）

Vitest（Node 24，M 系列 Mac，2026-10-08），不經瀏覽器；呼叫的就是畫面「匯出 ▾ → 決策工作稿」用的 `exportWorkspaceDecision`：

```ts
const input = fixture("demo"); const dataset = validateDataset(input).dataset!;
const snapshot = await createSnapshot(dataset, {}, await hashInput(input));
const source = { input, dataset, snapshot, revision: 1, filenames: {} };
// 與畫面「加入待辦」相同的資料面（addActionDraft，第一個健檢）
const actions = addActionDraft(emptyActionWorkspace(), source, "a1", snapshot.report.diagnostics[0].id);
const review = syncReviewPins(createReviewSession(source, "epoch-1", "rev-1"), actions);
for (const format of ["csv", "json", "md"]) exportWorkspaceDecision(format, source, emptyScenarioWorkspace("epoch-1"), actions, review, null, null, "示範資料");
// 「試算頁開過」：scenarios = ensureScenarioContext(emptyScenarioWorkspace("epoch-1"), { ...source, snapshot: DTC 單通路快照 })
```

列數以 RFC 4180 解析（引號內換行不算新列）；各方案的大小是把**實際輸出**重新編碼後量的（不是推算），只有 Markdown 的方案是估計值（標「估」）。

## 實測數字

| 資料 | 狀態 | 決策 CSV | 決策 JSON | 決策 Markdown | 產生時間（Node） |
|---|---|---|---|---|---|
| demo | 加入 1 個待辦 | 84,075,372 bytes，569 列 | 33,157,890 bytes，1,239,506 行 | 18,742,685 bytes，4,020 行 | CSV 0.91 s／JSON 0.76 s／MD 0.59 s |
| demo | ＋試算頁開過（DTC context） | 104,589,222 bytes，888 列 | 50,637,272 bytes | 27,202,865 bytes | 1.46 s／0.94 s／1.00 s |
| golden | 加入 1 個待辦 | 482,178 bytes，243 列 | 219,854 bytes | 125,934 bytes | < 0.02 s |
| golden | ＋試算頁開過 | 699,381 bytes，400 列 | 350,446 bytes | 191,406 bytes | < 0.02 s |

對照：demo 備份檔 265,670 bytes；demo 原始三份 CSV 254,178 bytes；demo 分析 CSV 39,772,431 bytes；E2E（網路紀錄 spec）在 dev 匯入 golden 後下載的決策 JSON 為 204,397 bytes。

### CSV 依 row_type 拆解（demo，加入 1 個待辦）

| row_type | 列數 | 整列 bytes | 其中 source_refs | 來源 |
|---|---:|---:|---:|---|
| snapshot | 6 | 1,626,121 | 1,446,318 | 預設欄＝整個工作區的來源（每格 241,053） |
| baseline | 3 | 724,978 | 723,159 | 同上 |
| baseline_amount | 13 | 3,141,291 | 3,133,689 | 同上 |
| baseline_rate | 4 | 966,554 | 964,212 | 同上 |
| fixed_assumption | 9 | 2,175,647 | 2,169,477 | 同上 |
| formula | 17 | 4,108,399 | 4,097,901 | 同上 |
| rounding | 1 | 241,779 | 241,053 | 同上 |
| limitation | 6 | 1,450,218 | 1,446,318 | 同上 |
| manual_action | 24 | 34,661,525 | 34,620,792 | 待辦每個欄位一列，每列帶 6 個引用數字的全部來源（約 1.44 MB／格） |
| action_fact | 6 | 1,448,006 | 1,442,538 | 引用數字各自的來源 |
| fact | 480 | 21,539,610 | 21,214,960 | 每個 fact 自己的來源（平均 340 個） |
| **合計** | **569** | **84,075,372** | **71,500,417（85.0%）** | |

每個來源物件約 105 字元（`{"file":…,"line":…,"date":…,"channel":…,"actual_filename":…}`），放進 CSV 時每個雙引號再加倍，約 130 bytes。

### JSON 與 Markdown

- JSON（33.2 MB）：`session.facts` 25,785,744 bytes（78%）、`actions[].evidence` 1,893,426、`session.sources` 239,122；縮排兩格讓 162,960 個來源物件各占 6 行。試算頁開過後 `scenario_contexts` 再多 16,315,914 bytes。
- Markdown（18.7 MB）：「引用的數字與來源」17,360,158 bytes（93%，每個 fact 的 `sources` 以跳脫後的 JSON 寫在一行）、「待辦清單」1,177,761（技術細節裡的 evidence）、「資料版本與來源」199,729。

## 方案

### A. 不改輸出內容、只改產生方式（安全；位元組完全相同，所以檔案一樣大）

| # | 做法 | 效果 | 影響 |
|---|---|---|---|
| A1 | `encodeCsv` 對同一個 `CsvCell` 物件快取序列化結果（`metadata` 的預設欄在 59 列重複用同一個物件；manual_action 的 `actionMeta` 在 24 列重複） | 省 CSV 的跳脫與字串複製時間（估 −50% 以上），輸出逐位元相同 | 不影響任何測試或基準；`src/application/export.ts` 一個函式 |
| A2 | `decisionDocument` 的 `structuredClone` 與 workspace JSON 的 `JSON.parse(exportDecisionJson(...))` 來回改成直接組物件 | 省一次 33 MB 的序列化與解析、降低尖峰記憶體 | 要逐鍵保留順序才會位元相同；改動面大於 A1 |
| A3 | 下載改用 `new Blob(parts)`（分段字串）而不是先組成一個 84 MB 字串 | 尖峰記憶體約減半（84 MB 的 UTF-8 內容在 V8 是含中文的雙位元組字串，約 168 MB，再複製進 Blob） | `downloadText` 介面要能收陣列；檔案位元組相同 |

這三項**都不能解決檔案大小**，只能讓手機瀏覽器比較不會在匯出時卡住或當掉。若收尾者只想做「不改輸出」的修正，A1 成本最低、風險最小。

### B. 不改語意、只改格式

| # | 做法 | 實測 | 影響 |
|---|---|---|---|
| B1 | 決策 JSON 不縮排（`JSON.stringify(doc)`） | 33,157,890 → **16,831,451 bytes（−49%）** | 內容與鍵順序完全相同；沒有測試斷言 JSON 縮排（grep 過 tests 與 tests/e2e：都先 `JSON.parse`）；`export-numeric` 的 decision_json 投影不變；缺點是用文字編輯器看不再分行 |

### C. 會改語意或格式（需要拍板、升 `export_version`、更新測試與基準）

| # | 做法 | 實測 CSV | 實測 JSON | 影響 |
|---|---|---|---|---|
| C1 | CSV 沒有自己來源的列（snapshot／baseline／formula／limitation／scenario_*）不再帶整個工作區的來源（只留 `row_type=snapshot, field=sources` 那一列的 value） | 84.08 → **67.78 MB（−19%）** | — | 機器讀取者要改從 snapshot·sources 取工作區來源；目前沒有測試斷言這些列的 source_refs |
| C2 | C1 ＋ manual_action 列不帶 source_refs（改由同一待辦的 `action_fact` 列與 `fact_ids` 追溯） | → **27.40 MB（−67%）** | — | `tests/action-export.test.ts`「every CSV action field uses its own … source filenames」斷言 manual_action 列的 source_refs 含原始檔名，要改成看 action_fact 列 |
| C3 | 來源改成「每檔的行號區間」：`[{"file":"sales_daily.csv","actual_filename":"…","lines":"2-1849,1901"}]`（同列同欄，只改格內格式；不再逐列寫 date／channel，這兩項可由原始 CSV 的行號查回） | 單獨 → **2.12 MB（−97.5%）**；C2＋C3 → **0.88 MB（−98.9%）** | facts 與 evidence 改區間：縮排 1.12 MB（−96.6%）、不縮排 **0.71 MB（−97.9%）** | `tests/helpers/export-numeric.ts` 的 decision_json 投影含 `session.facts[].sources[].line` 數值葉節點 → **基準會變**（違反本批「既有數值輸出不變」，必須另立基準並拍板）；CSV 部分不在 export-numeric 投影內（只投影 value／reason_codes／plan_revision）。E2E：`review-v2-a-export.spec.ts` 只看 `JSON.parse(source_refs).length > 0`、`scenarios.spec.ts` 只看含 `"actual_filename":"sales_daily.csv"`，保留 `actual_filename` 鍵即可照過；`breakeven-mer`（單元與 E2E）讀的是分析 CSV 的 `logical_file`，不受決策 CSV 影響 |
| C4 | 只拿掉 JSON facts 的 sources（保留 `session.sources`） | — | 33.16 → 3.06 MB（−91%） | 失去「每個數字的來源列」，違反 PRD §11.6 可追溯性，**不建議** |
| C5 | Markdown「引用的數字與來源」改寫成每檔的行號區間 | — | 估 18.7 → 約 1.5 MB（−92%，**估**） | `tests/fixtures/export-format-baseline-v3-6.json` 的 `decisionMd`／`workspaceDecisionMd` 逐字比對 → **基準會變**（需重拍基準並拍板） |
| C6 | 分析 CSV（`exportSnapshotCsv`）同樣改行號區間 | 39.77 MB → 估約 1 MB（**估**；source_refs 占 84%） | — | `tests/export.test.ts`、`tests/breakeven-mer.test.ts`、`tests/e2e/breakeven-mer.spec.ts` 讀 `source_refs` 的 `logical_file`／`file`，要一起改 |

D11（CSV 欄名與欄序不變、只能新增欄）：C1–C3、C6 都不動欄名欄序，但改了格內容的意義或格式，對外部讀取者仍是破壞性變更，RELEASES 要寫。

## 對既有測試、E2E 與基準的影響總表

| 方案 | 單元測試 | E2E | export-numeric 基準 | export-normalize 基準（V3-6 格式） |
|---|---|---|---|---|
| A1／A3 | 無 | 無 | 不變 | 不變 |
| A2 | 無（若逐鍵順序相同） | 無 | 不變 | 不變 |
| B1 | 無 | 無 | 不變 | 不變（只比 Markdown／Excel） |
| C1 | 無 | 無 | 不變 | 不變 |
| C2 | `action-export.test.ts` 1 個案例 | 無 | 不變 | 不變 |
| C3（CSV） | `action-export.test.ts` 解析 source_refs 的兩處要改成區間格式 | `review-v2-a-export`、`scenarios` 保留 `actual_filename` 即可 | 不變 | 不變 |
| C3（JSON） | `action-export.test.ts`（`document.actions[n].evidence` 以 `toEqual` 比對整個 fact 物件，sources 改格式就不相等）；其餘案例（例如 `decision.test.ts`）只比 id／金額 | 無 | **會變** | 不變 |
| C5 | `action-ad-decision.test.ts`（Markdown 逐行比對，只要前後同格式仍成立） | `scenarios.spec.ts` 的 Markdown 片段斷言不含來源 | 不變 | **會變** |

## D-V3-36 草案（給收尾者）

| 欄位 | 內容 |
|---|---|
| 編號 | D-V3-36 |
| 事項 | 示範資料（1,848 個來源列、480 個 fact）的決策匯出：CSV 84 MB（試算頁開過後 105 MB）、JSON 33 MB、Markdown 18.7 MB；分析 CSV 也有 40 MB。原因是每一列都重複完整的來源列清單（CSV 的 source_refs 欄占 85%）。手機瀏覽器可能在組字串時記憶體不足；收到檔案的人也難以開啟。 |
| 選項 | **A** v3.0.0 不改輸出，列為已知限制；只做不改位元組的 A1（encodeCsv 快取）與 A3（Blob 分段）降低卡頓。<br>**B** v3.0.0 再加 B1（JSON 不縮排，−49%），其餘不動。<br>**C** v3.1 升 `export_version`（例如 `workspace-decision-v3`、分析 CSV 另升）：C2＋C3（CSV −98.9%）、JSON facts 改區間（−97.9%）、Markdown 來源改區間（C5），同批更新 `action-export` 等測試、重拍 export-numeric 與 V3-6 格式基準，RELEASES 寫破壞性變更。<br>**D** 立即在 v3.0.0 做 C（違反本批「既有數值輸出不變」與 D11 精神，不建議）。 |
| 建議 | **A＋C**：v3.0.0 維持輸出位元組不變（V3-10 是上線檢查，不改匯出格式；export-numeric 與 V3-6 格式基準都不動），把大小寫進 RELEASES／STATUS 的已知限制，可選做 A1／A3；v3.1 依 C 改格式。B1 雖然語意不變，但只省一半、仍是 17 MB，且會讓 v3.0.0 與 v3.1 連續兩次改 JSON 外觀，不建議單獨做。 |
| 拍板前 | 維持 V3-9b 現況（不改匯出）。 |
