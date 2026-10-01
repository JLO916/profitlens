# M6 獨立財務與情境審查

日期：2026-10-01（Asia/Taipei）。此紀錄只涵蓋財務與情境子範圍；完整 M6 驗收另由主流程記錄。

已讀 `AGENTS.md`、`docs/PRD.md`、`docs/DATA_CONTRACT.md`、`docs/METRICS.md`、`docs/SCENARIOS.md`、`docs/ACCEPTANCE.md` 全文、`prompts/M6_REVIEW.md` 與 `docs/STATUS.md` 當前 M5 段。審查先核對實作與資料契約，再使用獨立固定答案測試，沒有將前輪通過紀錄當成本輪證明。

## 結論與實際變更

本次審查與 10 個新增獨立 probes 未發現可重現的財務核心錯誤。沒有修改 production、既有 golden、既有 expected、README、STATUS 或 M0–M5 證據。新增 `tests/m6-financial-audit.test.ts` 與本輪專屬證據檔。沒有先出現失敗測試，因此沒有建立或宣稱存在 `m6-financial-red.txt`。

測試使用獨立的 4 日、2 通路、3 SKU 合成帳：包含多 SKU 銷售、無銷售但有費用的日期、純退款日、來源實際負 cogs、負平台／金流抵扣。固定答案直接來自帳列手算，不以 production 函式產生 expected，也不修改 `fixtures/golden/expected.json`。

| 審查項目 | 結果／獨立固定答案 | 實作位置 | 本輪測試位置 |
|---|---|---|---|
| 多 SKU join 與無銷售費用日 | PASS；本期廣告只扣 60.00；無銷售 MARKETPLACE 日貢獻 -12.00 | `src/domain/aggregation.ts:41–71` | `tests/m6-financial-audit.test.ts:69–98` |
| 退款與實際成本／費用回沖 | PASS；退款日 N=-100.00、GP=-75.00、CM=-84.00；退款沒有額外推算成本回沖 | `src/domain/metrics.ts:7–18` | `tests/m6-financial-audit.test.ts:84–90` |
| 九項 bridge 精確閉合 | PASS；前期 CM=298.00、本期 CM=330.00；九項合計 +32.00 | `src/domain/bridge.ts:7–31` | `tests/m6-financial-audit.test.ts:91–97` |
| 比率合計 | PASS；毛利率 485/970=0.5、折扣率 230/1300、退款比 100/1070；不平均日或通路比率 | `src/domain/aggregation.ts:73–94`、`src/domain/money.ts:32–39` | `tests/m6-financial-audit.test.ts:100–108` |
| 非正淨營收比率 | PASS；純退款日保留負金額，毛利率／貢獻率／MER 為 null | `src/domain/metrics.ts:19–25`、`src/domain/money.ts:32–39` | `tests/m6-financial-audit.test.ts:84–90` |
| SKU/category 範圍 | PASS；DTC A 只有 N=20.00、C=25.00、GP=-5.00 及銷售來源；無廣告或 SKU 貢獻；完整 DTC CM 仍為 -25.00 | `src/domain/analysis.ts:25–35,49–78` | `tests/m6-financial-audit.test.ts:110–121` |
| 無銷售日缺成本／廣告列 | PASS；N/GP 留存，依缺漏欄位使 before/after 為 null；未受影響 DTC 仍為 -25.00；bridge 不宣稱閉合；情境停用 | `src/domain/aggregation.ts:63–64,81–94` | `tests/m6-financial-audit.test.ts:123–142`（2 案例） |
| 退款日缺 cogs | PASS；收入仍為 970.00；受影響 A／DTC／全體 GP 未知；B GP=40.00、MARKETPLACE GP=450.00 保持可算 | `src/domain/aggregation.ts:14–26`、`src/domain/money.ts:20–31` | `tests/m6-financial-audit.test.ts:144–156` |
| 情境百分點、閉合成本與明確銷量 | PASS；DTC 折扣率 .35 減 10 百分點成 .25；v=25%、f=-20%、a=-25%、K=3；CM=242/13→18.62，差額 43.62；清空 v 不計算 | `src/domain/scenarios.ts:123–185` | `tests/m6-financial-audit.test.ts:160–178` |
| 正負半分及明細對帳 | PASS；未取分 CM=.015→.02、取分調整 .01；K=.02 時 CM=-.005→-.01、delta=-.015→-.02；證實最終 HALF_UP | `src/domain/scenarios.ts:148–185` | `tests/m6-financial-audit.test.ts:180–193`（2 案例） |
| 同 ID 換資料後情境過期 | PASS；實際重建 hash/snapshot，舊基準 -25.00 保留且拒絕計算、歷史 JSON 標 stale；確認新快照後基準 75.00、所有假設回空白、結果清除 | `src/application/decision.ts:63–102,154–161` | `tests/m6-financial-audit.test.ts:195–217` |

額外 read-only 核對：`src/domain/validation.ts` 在新資料集形成前拒絕重複鍵；費用／廣告缺列與空值保留 partial。`src/domain/scenarios.ts:84–102` 拒絕缺必要金額、非正 G/N、不適用折扣／退款比與負合計成本。`src/application/decision.ts:63–80` 在應用邊界限制單通路、擷取並凍結 baseline；`src/components/decision-workbench.tsx:43–97` 顯示過期狀態及停止操作。這些 read-only 核對沒有取代全套既有負例與瀏覽器驗收。

## 實際命令與結果

| 實際命令 | 結果 | 證據 |
|---|---|---|
| `npm test -- --run tests/m6-financial-audit.test.ts` | exit 0；1 file、10 passed；Vitest 4.1.11；306 ms | `verification/m6-financial-probes.txt` |
| `npx --no-install eslint tests/m6-financial-audit.test.ts --max-warnings=0` | exit 0；無 warning/error 輸出 | `verification/m6-financial-lint.txt`（空輸出為實際結果，退出碼由工具回傳確認） |
| `git status --short` | 失敗；`fatal: not a git repository (or any of the parent directories): .git` | 審查工具原始輸出；未 init、未 commit、未建立遠端 |

## 範圍與限制

- 本子任務未執行完整 typecheck、lint、全部 unit/integration、build 或 E2E；由主流程統一執行並保存當輪證據。沒有用此處 10 passed 宣稱完整 R01/R02 通過。
- 本子任務瀏覽器人工驗收：**未執行**。未使用 Playwright `--list`，未覆寫舊 reporter 證據。R05 三尺寸匯入→診斷→試算→行動→匯出由主流程完成。
- AI 真實引用／傳輸與安全邊界、CSV/XSS、secrets、公開 endpoint、跨視窗隔離由其他 M6 範圍審查；本文件不對其提出通過宣稱。
- 資料完整性仍依提供者確認；負費用／cogs 的帳列真實性不在合成測試證明範圍。情境是契約指定的固定比率條件計算，未驗證實際平台收費機制、銷量反應或商業效益。
- 沒有 live AI、外部資料傳送或部署。下一步為主流程匯整 M6 全套驗收，不新增下一階段功能。
