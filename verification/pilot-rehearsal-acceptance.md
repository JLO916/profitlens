# 實務試用準備與合成演練驗收

日期：2026-10-01（Asia/Taipei）。範圍：先完成本機操作演練與可供真人填寫的試用工作表。**沒有取得真實營運資料，沒有真人獨立試用或商業成效。** 既有合成資料不升格為實務證明；未push／部署／連模型。

## 基準與來源

開工先讀AGENTS、PRD、DATA_CONTRACT、METRICS、SCENARIOS、ACCEPTANCE、STATUS及PILOT_PLAN。原122個受測程式／測試／設定hash與第三批相同，production BUILD_ID `p9LCsepxPsSU3ROkD0TCg`。既有dirty工作保留；本輪無產品改動。

演練來源為 `tests/fixtures/alternative/`：16列銷售、8列通路費用、8列廣告，TWD／Asia/Taipei，前期2026-09-01～02、本期09-03～04、截至09-05。SKU／品類內故意含公式與HTML字樣的安全測試文字，完全合成；不是新增的真實試用資料。UI依匯入管道標示「匯入」，不改变本報告的合成分類。

## 金額獨立對帳

Python標準庫csv＋Decimal直接讀原檔，先聚合16筆銷售至8個日通路鍵，再各扣一次費用；沒有import production、沒有從同一函式產生expected。26個固定expected欄位全數相符，逐日及原檔hash見 `pilot-independent-recalculation.json`。

| 合成範圍 | 前期 | 本期 | 差額 |
|---|---:|---:|---:|
| 商品淨營收 | 464.00 | 600.00 | +136.00 |
| 商品毛利 | 244.00 | 260.00 | +16.00 |
| 行銷前貢獻 | 200.00 | 200.00 | 0.00 |
| 行銷後貢獻 | 140.00 | 10.00 | −130.00 |

DTC本期貢獻40.00，MARKETPLACE−30.00；九項橋接合計−130.00，無殘差。負毛利商品N−40.00／GP−100.00，不分攤通路廣告。

DTC條件演練：N400−C200−P10−Q6−F7−O0−A130−K3＝44.00；較基準40.00差4.00。v0、δ0百分點、f−50%、a0、K3及全部固定假設均明填；不代表此假設可在真實物流合約成立，也不是預測或已實現收益。

## 本輪命令與結果

| 實際命令／操作 | 結果 | 證據 |
|---|---|---|
| `npm test -- --run` | pass，34 files／766 tests | `pilot-unit.txt` |
| `npm run lint` | pass，exit0 | `pilot-lint.txt`、`pilot-lint-final.txt` |
| `npm run typecheck` | 初次fail：TS6200／TS2300重複產生宣告；整理後pass，exit0 | `pilot-typecheck.txt`、`pilot-typecheck-final.txt` |
| 產生檔整理 | pass，僅4個`.next/types/* 2.ts`記hash並移至暫存區保留，沒有刪來源 | `pilot-generated-types.json` |
| 獨立Python Decimal對帳 | 26個固定答案pass；初次−0.00字串与0.00不等的格式結果保留，正規化有號零後全過 | `pilot-independent-recalculation.json`，未改expected |
| `npm run test:e2e -- --config verification/pilot-e2e.config.ts` | pass，9 tests，22.176秒，0 unexpected／skipped／flaky，retries0 | `pilot-e2e.txt`、`pilot-e2e-results.json` |
| `git diff --check` | pass | 最終命令結果；不代表財務測試 |
| `npm run build`／全套282 E2E | not_run | 本輪無產品改動；本輪9項E2E使用既有production3200，不宣稱重新build |
| 真實資料、真人獨立操作、live AI、發布 | not_run | 尚無真實資料／參與者，本輪不部署、不連模型 |

E2E驗收副本來自原 `tests/e2e/m6-acceptance.spec.ts`，所有三項測試及斷言保留，只替換證據檔名前綴；設定沿用三尺寸，使用既有3200 PUBLIC_DEMO。`pilot-e2e-provenance.json`記來源hash。報告路徑最初按config目錄解析至多一層verification，已按原始位元搬回本層並修正之後執行的outputFile；没有更改結果或測試斷言。

## 實際瀏覽器

Codex in-app browser獨立分頁、本機3200，未使用既有使用者工作稿。完成：

1. 真正選三CSV及manifest；未確認口徑先被阻擋，錯誤指向manifest的amount_basis、沒有捏造來源行號。勾選後檢核通過，九項來源欄位對帳差額0.00；全coverage N1064.00、CM150.00，與本期600.00／10.00區分。
2. 套用後確認本期KPI、規則診斷與DTC範圍；收入280→400、貢獻100→40，沒有把廣告差額稱為必然可節省金額。
3. 明填四項假設但留銷量空白，計算被拒絕；明填0後結果44.00／+4.00。
4. 從診斷建立行動草稿，保留四項原fact；填入明示「合成演練」的問題、動作、角色、指標、期限2026-10-15、停止條件與缺資料。開40.00證據見8筆原始列，以Escape返回，確認行動。
5. 在主管摘要選擇方案，可見44.00、+4.00、原範圍與已確認的演練行動。沒有實際交辦任何人或執行廣告操作。
6. 操作JSON／CSV／Markdown匯出，UI提示本機下載。CUA的download事件8秒逾時，**沒有取得人工下載路徑或讀回位元**。另由9項E2E真正下載並讀回三格式，檢查快照版本、期間、範圍、公式、假設、金額、證據與草稿狀態；此結果與人工限制分開。

日期欄位第一次工具fill未提交至表單狀態，行動維持草稿；改用原生ArrowUp／ArrowDown完成有效日期輸入後，可確認且期限2026-10-15正確。沒有繞過驗證或更改產品處理邏輯；不以工具填寫失敗宣稱已確認。

| 尺寸 | 人工重點 | 截圖 |
|---|---|---|
| 1440×1000 | 匯入對帳、主管方案與交辦 | `pilot-manual-import-reconciliation.jpg`、`pilot-manual-desktop-action-summary.jpg` |
| 768×1024 | 五項假設、44.00條件結果與明細 | `pilot-manual-tablet-scenario.jpg` |
| 390×844 | Enter開行動證據、公式、來源與Escape返回 | `pilot-manual-mobile-evidence.jpg` |

頁面scrollWidth依序1425／753／375，不超過viewport；寬表限自身容器。最後讀取console warn/error為空。E2E另有三尺寸完整鏈截圖及兩個獨立context隔離、錯檔不取代、舊情境過期測試。詳細記錄在 `pilot-manual-browser.json` 與 `pilot-e2e-*.jsonl`。

## 可交付與下一個必要輸入

新增 `docs/PILOT_WORKSHEET.md`，提供來源授權、去識別、三CSV準備、同範圍對帳、四項不經口頭指引任務、模型適用性及行動紀錄；所有真實結果空白。README／STATUS與本輪verification更新，src、原tests、原規格與fixtures未變。

下一步需提供獲授權且去識別的三份標準CSV本機路徑、比較期間與截至日，以及獨立來源報表同範圍的收入／明示成本總額和口徑依據。不能只以工具自行算的值證明來源正確；也不能用自動化完成時間代替使用者試用時間。真實資料應留在Git排除的私人位置或repo外；填完的敏感試用表亦不提交repo。

沒有真人獨立操作、實際會議採納、重用意願或商業提升證據；沒有基於缺資料自動補零、換算稅、猜廣告歸屬或改模型定義。本輪止於準備與合成演練。
