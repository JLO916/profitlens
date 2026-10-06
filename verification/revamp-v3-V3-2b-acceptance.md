# Revamp v3 V3-2b 驗收：數字格式（2026-10-06）

依 `docs/revamp-v3/06_BATCHES.md` V3-2b 與 PRD §8.5（數字格式）、§8.6（日期）、§8.7（標點）、§3.2–3.3（三層與各畫面層級）、§7.8（抽屜精確值行）執行。格式化只在 `src/application/presentation.ts`、`copy.ts`；`src/domain`、`fixtures`、`docs/METRICS.md`、`.env*`、`vercel.json` 零改動；golden 數字不變（本期 255.00、差額 −315.00、試算 284.00／264.00／19.70）；無新依賴。

## 1. 完成項目（對照 06_BATCHES V3-2b）

| 項目 | 狀態 | 說明 |
|---|---|---|
| 三層格式化函式 | 完成 | `formatAmountL1/L2/L3`（1.25 億／785.1 萬／8,420 元；7,850,658；7,850,657.90）、`formatSignedDelta`、`formatRateL1/L2/L3`、`formatRatePoints`（L1「降 14.3 個百分點」）、`formatRateChange`、`formatGrowth`（上期 ≤ 0 回 null）、`formatMultiple`、`formatCount`、`formatPerUnit`、`formatEmpty`（資料待補／不適用，L3 附原因碼）、`formatMetric`／`formatMetricDelta`、`formatPercentNumber`／`formatPointsValue`（已是百分數或百分點的值）、`formatDateL1`／`formatPeriodL1`（7/13–8/23（42 天）；跨年 YYYY/M/D）、`formatPeriodExport`（2026-07-13 至 2026-08-23（42 天））、`MINUS`＝U+2212、`asciiMinus`；全部用 decimal.js 從精確字串 HALF_UP 取位 |
| HALF_UP 兩個規則 1 案例 | 完成 | −598,833.95 ÷ 1,868,626.68 → 「−32.0%」（不是先取兩位再取一位的 −32.1%）；貢獻率差由精確值取位為「降 14.3 個百分點」（顯示值相減會是 14.2）；`tests/format-layers.test.ts` 31 項涵蓋 §8.5 表格每一列、HALF_UP 邊界（9,999.995 元 → 1.0 萬）、零值不帶符號、缺值、U+2212／ASCII |
| `favorableDirection` | 完成 | `MetricDefinition.favorableDirection`（費用與費用佔比為 down）、`deltaTone`（favorable／unfavorable／neutral，可依顯示取位判斷）、`deltaWord`（多／少、多花／少花、多賺／少賺、升／降、持平、由負轉正、轉為虧損，文字在 `labels.format`）；呈現層屬性，不進 domain；元件顏色由 deltaTone 決定，只有不利上色（D-V3-7） |
| 接到元件（§3.3） | 完成 | 總覽：KPI 卡 L1（785.1 萬、上期 614.2 萬、+170.9 萬（+27.8%）、比率卡「降 14.3 個百分點」）、其他常用指標 L1（7,420 件、1,058 元／件、11.4 倍）、目標行 L1、期間合計與日均／每週表／通路表 L2（單位只在 caption）、橋接 L3 到分＋取位說明列；三件事與健檢：影響金額 L1 同列同尺度（−118.8 萬）、展開 L2、技術細節 L3；一頁摘要與會議：關鍵數字 L1「少賺 59.9 萬（−32.0%）」、議程表 L2；試算：基準與結果 L1、方案比較表 L2（項目（元））、取位調整列 L3、「尚未試算」取代「—」；待辦卡片與引用 L1；商品表 L2；抽屜：全部 L3，標題下新增精確值行 `evidence-precise-value`（1,269,792.73 元）與取位說明；匯入第 4 步對帳表與前處理摘要 L3（本批後段修正）；會議假設文字改用格式化值（U+2212、百分點、元） |
| 接到匯出（§3.3、§6.5） | 完成 | CSV／JSON 維持 L3 到分、ASCII 負號、欄名欄序不變（`tests/export-numeric-stability.test.ts` 以位元組比對五份 golden 匯出的數值欄）；Markdown（一頁摘要、決策、會議）正文與表格 L2、附錄與技術段 L3、期間用匯出格式；Excel：數字格維持數值型別，以儲存格顯示格式套 L2（摘要、通路）與 L3（拆解、商品比較）並用 U+2212；PPT 一頁式 L1＋L2 |
| 單元測試同步 | 完成 | 新增 `format-layers`、`overview-format`、`format-surfaces`、`export-layers`、`export-numeric-stability`；既有數字斷言全部改為格式化函式輸出；**86 檔／1,820 全過** |
| E2E 斷言遷移 | 完成 | 六個代理對共用伺服器逐 spec 將數字斷言改為 `formatAmountL1("255.00")` 等格式化輸出（golden 仍是真相來源）；代理回報的兩個產品問題本批修正：匯入第 4 步對帳表與前處理摘要未套 L3（`step-review.tsx`）、會議假設文字含 ASCII 連字號（`review-session.ts`）；驗證 38／38（六個受影響 spec × desktop、mobile） |

## 2. 變更檔案

- 修改：`src/application/{presentation,copy,review-session,assist-kpi,targets,scenario-presets,manager-summary,decision-export,excel-export,pptx-export,meeting}.ts`、`src/components/{overview,top-three,diagnosis-list,channel-table,manager-summary,meeting-page,decision-workbench,multi-scenario-workbench,scenario-sensitivity,actions-workbench,product-comparison-panel,workspace-panels,evidence-drawer}.tsx`、`src/components/import-wizard/step-review.tsx`、`src/components/manager-summary.module.css`（關鍵差額按鈕可折行）、`src/i18n/labels.zh-TW.ts`（units 擴充、`format` 區塊、會議假設樣板）、單元測試 20 餘檔、`tests/e2e/*.spec.ts` 21 個、`docs/{STATUS,DECISIONS}.md`、`docs/revamp-v3/06_BATCHES.md`。
- 新增：`tests/{format-layers,overview-format,export-layers,export-numeric-stability}.test.ts`、`tests/format-surfaces.test.tsx`、`tests/helpers/export-numeric.ts`、`tests/fixtures/export-numeric-baseline.json`、`verification/revamp-v3/V3-2b/**`、本檔。
- 零改動：`src/domain/*`、`fixtures/*`、`docs/METRICS.md`、`globals.css`（沒有新樣式）。

## 3. 驗收命令與真實結果

| 命令 | 結果 |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | 0 warnings |
| `npm test -- --run` | **86 檔／1,820 測試全過**（V3-2a：81 檔／1,763） |
| `npm run lint:design` | exit 0（對比 75／75；JSX 中文 0） |
| `npm run build` | pass |
| `npm run test:e2e` | **576／576 全過（15.5 分，四尺寸）**。第一輪 570／576：匯入精靈 spec 的前處理與對帳表仍斷言未格式化的「4725.00」（本批後段把該畫面接上 L3 後需同步）、會議紀錄頁在 768 寬出現水平捲動（關鍵差額「少賺 59.9 萬（−32.0%）」按鈕不折行）；斷言改為 `formatAmountL3`、`manager-summary.module.css` 讓該按鈕可折行後重跑全過 |
| 畫面基準 | `verification/revamp-v3/V3-2b/snapshots` 36 張（`CAPTURE_BATCH=V3-2b --update-snapshots`），重跑 4/4 通過、0 差異 |
| Lighthouse（示範資料已載入，1440 與 390） | 五頁 Accessibility 100／100；空狀態 Performance desktop 100／mobile 97；`verification/revamp-v3/V3-2b/lighthouse/` |
| 禁區 diff（對 82b70df） | 空 |
| testid 基準 | 刪除數 0（新增 evidence-precise-value、threshold-pct 等） |
| 棘輪 | design-lint／copy-style 數值不變（hex 0、圓角 4、字級 13、字距 0；labels 黑名單 13／4） |

## 4. 瀏覽器驗收

- 示範資料總覽（1440）：KPI 卡「785.1 萬／上期 614.2 萬／+170.9 萬（+27.8%）」、扣廣告後貢獻「127.0 萬／−59.9 萬（−32.0%）」、貢獻率「降 14.3 個百分點」、常用指標「7,420 件、1,058 元／件、8.8%、11.4 倍」、三件事「折扣多花 118.8 萬 · 影響金額 −118.8 萬」；抽屜「127.0 萬」＋精確值「1,269,792.73 元」＋到分階梯公式。
- 四尺寸截圖 `verification/revamp-v3/V3-2b/snapshots/{desktop,laptop,tablet,mobile}/01–09-*.png`；與 V3-2a 的差異只有數字格式與對應的方向詞／顏色（KPI 卡、常用指標、三件事影響金額、試算結果、會議關鍵數字、抽屜精確值行），版面未變；768 寬七頁 `scrollWidth` 等於視窗寬。

## 5. 已知限制與偏離

- 舊函式 `formatMoney`／`formatSignedMoney`／`formatRate`（ASCII 負號）保留給 AI grounding 與少數呼叫端，V3-2c 清理；`labels.excelExport.summary.periodValue` 已無引用，V3-2c 一併刪。
- 抽屜「計算方式」階梯每列仍帶「元」（§8.5 規則 5 單位只標一次），V3-5 抽屜重排時改為區段標一次。
- 待辦卡片與引用數字用 L1（PRD §3.3 將「編輯抽屜的內容」列為 L2）：v2 的編輯是內嵌表單，V3-6 做編輯抽屜時改 L2。
- 敏感度「要賣到多少才划算」的門檻只有 `threshold_pct`，顯示為帶號百分比（+12.3%），不換算成件數（需新增計算，不在本批）。
- 門檻輸入（金額門檻）顯示 L3，和使用者輸入值一致；試算比較表的取位調整列用 L3（L2 永遠是 0）。
- 日期格式 §8.6（主層 M/D）只接到會議與匯出的期間行；趨勢提示框、每週表、抽屜範圍行仍是 ISO（抽屜屬 L3 本就 ISO），總覽的期間列由 V3-3／V3-4 重排時改。
- Excel 以數值型別＋儲存格顯示格式呈現層級（可加總、排序），而非文字格；位元組比對基準 `export-numeric-baseline.json` 取自格式化函式提交（dbcb1b0），不是 v2.0.0。
- `verification/revamp-v3/e2e-text-assertions.csv` 未逐列勾銷（該清單針對文字定位器；本批遷移的是數字斷言），改以本檔與各 spec 的提交紀錄為準。
- E2E 測試標題仍含 v2 數字字樣（例如「仍得 19.70」），只是標題，不影響斷言。

## 6. 下一批、人工關卡、需要拍板

- **下一批 V3-2c**：labels 依頁面重新分組、`{headline, explain?, caution?, technical?}` 形狀、舊 key alias（到 V3-10）、刪除舊格式函式與無引用 key、split 繞道取字清理。
- **H3 補審**：現稿、7 句試算原因、黑名單殘餘 17 筆（V3-2a）；本批新增的方向詞（`labels.format`）一併審。
- **H2（擋 V3-3）**：設計稿審查仍待人工。
- 需要拍板：無新增。
