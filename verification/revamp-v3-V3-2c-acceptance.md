# Revamp v3 V3-2c 驗收：labels 結構重整與清理（2026-10-06）

依 `docs/revamp-v3/06_BATCHES.md` V3-2c 與 PRD §8.10 執行。**本批不改任何畫面文字與版面**：四尺寸截圖對 V3-2b 基準 0 差異；`src/domain`、`fixtures`、`docs/METRICS.md`、`.env*`、`vercel.json` 零改動；無新依賴；golden 不變。

## 1. 完成項目（對照 06_BATCHES V3-2c）

| 項目 | 狀態 | 說明 |
|---|---|---|
| labels 依「頁面 › 區塊 › 元件」重新分組 | 完成 | `scripts/labels-regroup.mjs`＋`scripts/labels-regroup.map.json`（95 條對照規則）由 V3-2b 的 labels 產生新檔：24 個新分組為字串唯一存放處（shell、overview、diagnosis、products、scenarios、actions、meeting、data、importWizard、evidence、exports、storage、empty、errors、glossary、format、summary（weekly 留位）＋跨頁 metrics、rules、assist、targets、events、brand、relaunch）；48 個被互相引用的共用字串提成具名常數 |
| 可讀單元形狀 `{headline, explain?, caution?, technical?}` | 完成（三類） | 規則卡 `{ headline, explain: { cause, nextStep }, caution }`（cause 與 nextStep 不合併，畫面分行顯示）；指標 `{ headline, short, explain, technical: { formula, formulaTechnical } }`；導覽 `{ headline, explain }`；其餘單元保留原葉名放進新分組 |
| 舊 key 保留為 alias（到 V3-10） | 完成 | v2 的 41 個頂層區段全部重生成**只放參照**的型別化 alias 樹（整棵子樹相同時直接參照子樹）；`legacyAliases`（2,221 筆舊路徑 → 新路徑）與 `LEGACY_SECTIONS` 匯出給掃描器；元件與測試的 import 零改動 |
| 驗證 | 完成 | `verification/revamp-v3/labels-v3-2b.flat.json`（V3-2b 展平快照 2,221 葉）；`tests/labels-structure.test.ts` 9 項：新分組經 legacyAliases 反推逐字重建快照、每個舊路徑取到同一字串、alias 宣告以 AST 檢查字串常值為 0、每個 alias 目標存在、掃描器每字串只算一次且指標與快照重建樹逐項相同、三類單元新舊鍵同一字串、檔案已無「由盤點產生」區段與帶引號鍵；`labels-regroup.mjs --check` 一致 |
| 掃描器 | 完成 | `copy-scan.mjs` 新增 `labelScope`：只掃新分組並略過 alias，白名單與 L1 鍵規則同時比對新舊路徑，計數口徑與 V3-2b 相同；`load-labels.mjs` 新增 `loadLabelsModule()`；`ui-audit.mjs`、`copy-style.test.ts` 改傳整個模組 |
| 刪除 R2「由盤點產生」區段與 split 繞道取字 | 完成 | 區段與帶引號鍵已移入新分組（舊 `ui` 為 alias）；split 繞道取字於 V3-2a 清除 |
| 刪除舊格式函式（ASCII 負號） | 完成 | `formatMoney`、`formatSignedMoney`、`formatRate` 與內部 `amount()` 刪除；呼叫端改接新函式：AI grounding 事實用 `asciiMinus(formatAmountL3)`／`asciiMinus(formatRateL3)`（AI 酬載維持 ASCII、到分，輸出逐字相同）、規則卡比率 `asciiMinus(formatRateL3)`、`tests/workspace.test.ts` 斷言同步 |
| 刪除無引用 key | 完成 | `scripts/labels-unused.mjs`（AST 追 `labels` 取值鏈、經 legacyAliases 換新路徑、動態索引物件整棵保留、copy-rewrite 的 removed 列保留）：src 無引用 139 個，刪除 **127 個**（含 v2 單頁匯入表單的 `ui.importPanel.*` 49 個、`excelExport.summary.periodValue`），清單 `verification/revamp-v3/labels-removed-v3-2c.txt`；12 個因 tests／e2e／`make-og.mjs` 直接取用而保留；重跑可刪 0 |

## 2. 變更檔案

- 新增：`scripts/labels-regroup.mjs`、`scripts/labels-regroup.map.json`、`scripts/labels-unused.mjs`、`tests/labels-structure.test.ts`、`verification/revamp-v3/labels-v3-2b.flat.json`、`verification/revamp-v3/labels-removed-v3-2c.txt`、`verification/revamp-v3/V3-2c/`（四尺寸總覽截圖＋Lighthouse）、本檔。
- 修改：`src/i18n/labels.zh-TW.ts`（2,119 → 約 2,750 行；字串常值只在新分組）、`src/i18n/index.ts`（多匯出 MetricUnit、RuleUnit 型別）、`src/application/{presentation,copy}.ts`、`src/ai/grounding.ts`、`scripts/lib/{copy-scan,load-labels}.mjs`、`scripts/ui-audit.mjs`、`tests/{copy-style,workspace}.test.ts`、`tests/glossary.test.tsx`、`tests/fixtures/copy-style-ceiling.json`（禁用詞 4 → 3）、`docs/{STATUS,DECISIONS}.md`、`docs/revamp-v3/06_BATCHES.md`。
- 零改動：所有 `src/components/**`、`tests/e2e/**`、`globals.css`、`src/domain`、`fixtures`、`docs/METRICS.md`。

## 3. 驗收命令與真實結果

| 命令 | 結果 |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | 0 warnings |
| `npm test -- --run` | **87 檔／1,829 測試全過**（V3-2b：86 檔／1,820） |
| `npm run lint:design` | exit 0；ui-audit 設計指標與 V3-2b 完全相同；labels 計數相同（同義詞 13），禁用詞 4 → 3（刪掉含「JSON」的無引用鍵） |
| `npm run build` | pass |
| `npm run test:e2e` | **576 項全過（15.2m）**，四尺寸，E2E spec 零改動 |
| 畫面基準 | 對 **V3-2b** 基準重跑 4/4 通過、**0 差異像素**（本批不改畫面；四尺寸總覽截圖另存 `verification/revamp-v3/V3-2c/`） |
| Lighthouse（示範資料已載入） | 五頁 Accessibility 100／100；空狀態 Performance 100／97（與 V3-2b 相同） |
| 禁區 diff（對 82b70df） | 空 |
| testid 基準 | 刪除數 0 |

## 4. 瀏覽器驗收

畫面與 V3-2b 逐像素相同（四尺寸 `toHaveScreenshot` 0 差異）；`verification/revamp-v3/V3-2c/1-overview-{desktop,laptop,tablet,mobile}-viewport.png`。

## 5. 已知限制與偏離

- 規則卡的 `explain` 是 `{ cause, nextStep }` 物件而非合併字串（PRD 寫 cause＋nextStep → explain）：畫面分行顯示兩段，合併會改文字。
- 只有 metrics、rules、nav 套用新形狀；`assist.items` 等同形狀單元沿用 v2 鍵名。
- alias 樹整棵子樹相同時直接參照子樹，所以 metrics、rules、actions、meeting 四個物件內的鍵順序改變（頂層順序不變，`Object.values` 行為不變）。
- `exports` 分組的變數名是 `exportLabels`（避免與 CommonJS `exports` 衝突），labels 內的鍵仍是 `exports`。
- 規則卡比率（`ruleCopy`）仍用 ASCII 負號以維持本批文字不變；負比率在規則文案極少出現，V3-4 改三件事版面時改為 U+2212。
- `copy-rewrite.csv` 內已刪鍵的列未加註，H3 審稿時以 `labels-removed-v3-2c.txt` 對照。
- labels 檔因 alias 樹變長（約 2,750 行）；V3-10 移除 alias 後縮回。

## 6. 下一批、人工關卡、需要拍板

- **V3-2 全部完成（a／b／c）**。下一批 **V3-3 殼層與導覽**，**被人工關卡 H2（設計稿審查）擋住**：請 2–3 位台灣電商經理人＋1 位設計者依 `verification/revamp-v3/mockups/README.md` 審查並回填評分；若要先行，請明確指示。
- **H3 補審**仍待人工（現稿、7 句試算原因、黑名單殘餘、方向詞）。
- 需要拍板：無新增。
