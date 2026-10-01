# 管理者評閱改善第二批驗收

日期：2026-10-01（Asia/Taipei）。範圍為評閱包第二批 PL-05–09；第一批現有未提交修改保留，第三批未開始。本輪使用合成資料，本機 PUBLIC_DEMO，未推送 GitHub、未部署、未使用 live AI，不宣稱商業成效。

## 起始狀態與版本

- Git HEAD 維持 `04e186bf7be18102e2d23b71b9d4d74fe521a2f1`。沒有重新初始化、重置或覆蓋使用者修改。
- `manager-batch2-starting-state.json` 記錄開工時 189 個非 verification 檔案；第一批 24 個已記錄程式／設定 hash 與開工狀態相符。原 663 tests 本輪先重新執行通過（`manager-batch2-baseline.txt`）。
- 最後修改後先跑 typecheck／lint／751 tests，再凍結來源，完整 E2E 自行重新 build 並使用 production server。`manager-batch2-tested-source.json` 與 `manager-batch2-final-source-check.json` 核對 120 個程式／測試／設定檔完全一致。
- 最終 BUILD_ID：`LSy2XrLTPaOxDuUpKF9iP`；Node 25.8.2、npm 11.11.1。完整當輪變更清單見 `manager-batch2-changes.json`，不能把第一批未提交修改算成本輪新增。

## 逐項驗收

| 項目 | 結果 | 實際驗證 |
|---|---|---|
| PL-05 診斷帶入行動 | pass | 摘要／通路診斷建立未確認草稿，帶入恰好該診斷的 facts；七欄、有效期限與證據均須核對；改欄位撤銷確認。單元測試拒絕不存在的 rule／fact、偽造 scope、SKU/通路混用及空識別。 |
| PL-05 獨立行動與置頂 | pass | 不依賴情境 baseline；可新增第四項以上，最多三項置頂；置頂實際排前、取消回一般群組、提高優先序不穿越群組。人工觀察第二項置頂後移至第一項。 |
| PL-05 歷史來源及恢復 | pass | 切換資料／期間／通路後 stale 不復活；每個 context 保留自己的輸入、期間、facts、版本。歷史 255.00 在目前 DTC270.00 下仍開原全部通路八筆來源。複製只有文字、清空證據且未確認；v1 遷移、v2 多範圍恢復重驗重算。 |
| PL-06 主管摘要 | pass | Golden 收入差 +220.00、貢獻差 -315.00、MARKETPLACE 170.00→-15.00 固定值比對；缺漏先列、同規則跨層分組、不把合計與子通路加總；門檻只控制摘要，完整診斷保留；可點數字看證據。 |
| PL-07 商品兩期比較 | pass | 前／本期通路×SKU 聯集；精確毛利差排序、反向、品類／搜尋、負毛利快速篩選；無列、明確零、完整性未知／缺成本分開。DTC B 毛利250→200、差-50，來源只有 sales第3/7行；不分攤廣告。新比較CSV與原本期CSV皆核對。 |
| PL-08 門檻 | pass | 基於原閉合式推導貢獻為零及維持 baseline 門檻，精確分數附近似百分比。Golden f=-10%、v=0、其餘0：284.00；K20：264.00；維持baseline門檻約-2.527075812274%／+1.083032490975%。上下界、無解、零斜率、負斜率、stale／未同意／無效baseline均有測試。 |
| PL-08 三組敏感度 | pass | 三個銷量假設皆需明填；逐次呼叫既有情境引擎、其餘假設固定。人工輸入-3%、-2.5%、0%，得267.38、270.15、284.00。百分比／百分點分開，不提供預測或最適預算。 |
| PL-09 會議稿及寬表 | pass | 主管Markdown／通路寬表真下載；日期、scope、status、方案／假設、行動負責人／期限／風險保留。目前摘要facts放MD附錄，即使無診斷仍有核心數字證據。歷史行動完整facts及binding另在完整決策三格式。 |
| PL-09 列印 | pass（限 Chromium PDF） | 真 print-media 渲染與 PDF 匯出；Golden 一頁、文字828字元，pdftoppm渲染後目視無截斷。長清單允許續頁。OS列印對話框由測試替代，未測實體印表機。 |
| 既有核心及匯入回歸 | pass | 全套固定golden、費用缺漏、退款、比率、scenario、AI mock、CSV/XSS、stale、分頁隔離；三尺寸真正匯入替代CSV／errors、診斷→試算→行動→下載及工作區備份恢復。 |
| PUBLIC_DEMO／secrets | pass（本機指定檢查） | 最終21個前端JS檔沒有非秘密canary、OPENAI_API_KEY、OPENAI_MODEL標記；GET unavailable、POST403/PUBLIC_DEMO，不進模型。這不是全系統安全認證。 |
| 原資料與套件保留 | pass | 評閱包11檔、fixtures、golden expected、AGENTS、schema、package／lock 共56檔與開工hash一致，未添加依賴。原M1金額／join／metrics口徑未改。 |
| Live AI | not_run | 無真實key；本輪只mock與本機後端關閉驗證，不代表實際模型連線／品質。 |
| production／第三批 | not_run | 本輪交付本機preview；未推送、未重新驗收線上、未部署，第三批未開始。 |

## 實際命令與結果

| 命令 | 最終結果 | 證據 |
|---|---|---|
| `npm run typecheck` | pass，exit0 | `manager-batch2-typecheck.txt` |
| `npm run lint` | pass，exit0，警告亦視為失敗 | `manager-batch2-lint.txt` |
| `npm test -- --run` | pass，32 files／751 tests | `manager-batch2-unit.txt` |
| `npm run build` | pass；standalone及最終E2E webServer各有實際執行 | `manager-batch2-build.txt`；最終以 `manager-batch2-e2e-final.txt` webServer命令的build→start成功鏈與最終BUILD_ID為準 |
| `npm run test:e2e` | pass，exit0，258 passed／0 unexpected／0 skipped／0 flaky，retries0，315.0秒 | `manager-batch2-e2e-final.txt`、`manager-batch2-e2e-results.json` |
| `python3 verification/manager-batch2-check.py` | pass，exit0 | `manager-batch2-security-check.txt`、`manager-batch2-security.json`、`manager-batch2-integrity.json` |
| `git diff --check` | pass，exit0 | 最後文件修改後再執行；`manager-batch2-diff-check.txt` |
| `pdftoppm -scale-to 1300 -png verification/manager-batch2-summary-print.pdf verification/manager-batch2-print-page` | pass，exit0；已目視 | `manager-batch2-print-page-1.png`、`manager-batch2-pdf-render.txt`；pypdf頁數與文字在 `manager-batch2-print-inspection.json` |

先測試後實作的 red／green 記錄：`manager-batch2-actions-*`、`action-backup-*`、`actions-security-*`、`action-pin-*`、`action-export-*`、`summary-*`、`summary-appendix-*`、`products-*`、`sensitivity-*`。新增6個unit/integration檔和4個E2E檔。expected為固定Golden及獨立手算，不修改golden迎合程式。

## 曾失敗、修復及未執行

- 初始受sandbox限制無法listen3100，EPERM，沒有執行瀏覽器測試；`manager-batch2-e2e-initial.txt`。核准本機測試後執行，沒有關閉sandbox或取得全磁碟權限。
- 第一個瀏覽器run：41 passed、5 failed、1 interrupted、211未執行，發現問題後停止（exit130）。修正兩個select缺少明確accessible name；multiple-select DOM順序測試改為集合等同性（匯出仍核對原fact順序）；行動移頁後原AI locator更新；資料載入helper先等ready。初始JSON/log保留為 `manager-batch2-e2e-browser-initial*`，不當作通過。
- 第二個run：120 passed、4 failed、1 interrupted、133未執行，停止後修正原商品CSV的搜尋metadata大小寫回歸，保留原測試斷言。`manager-batch2-e2e-second*`。另外加入置頂實際順序紅→綠及SKU證據顯示通路的修正，才凍結並最終全跑258通過。
- 整合期間typecheck曾發現export binding型別及status union；另一次與build同時產生Next型別造成缺失。初次build碰到尚在red階段的型別缺項。記錄於 `manager-batch2-typecheck-integration-failure.txt`、`typecheck-concurrent-generation.txt`、`build-integration-failure.txt`；修正後序列執行最終檢查均通過。
- PDF檢視第一次嘗試Python `fitz` 缺模組；未安裝新依賴，改用已存在的pdftoppm與pypdf完成視覺與頁數核對。
- 人工CUA：Markdown下載事件10000ms逾時，**沒有取得下載檔路徑／讀回位元**。UI點擊已執行；Playwright真下載及內容核對另為pass。人工三CSV匯入／備份恢復本批未重做，已由最終三尺寸E2E實際走完。不得混稱人工全流程全部通過。
- 未執行：Safari／Firefox／實體手機／輔助讀屏、OS原生列印與實體印表機、50,000列及大量歷史行動壓力測試、真實營運資料／live AI、production部署。沒有對這些項目宣稱通過。

## 真瀏覽器與本機操作

Playwright Chromium：1440×1000、768×1024、390×844，每尺寸86項；E2E server為LOCAL且ENABLE_LIVE_AI=false，AI成功與故障回應由明標mock提供。人工3200及安全HTTP檢查另設PUBLIC_DEMO。screenshots與各spec JSONL保存於 `manager-batch2-*`；JSONL包含迭代run，最終通過數以 `e2e-results.json` 為準。最終來源凍結後，另用Codex in-app browser於3200人工實際點擊與輸入；操作細項、尺寸與限制見 `manager-batch2-manual-browser.json`。

人工目視證據：

- `manager-batch2-manual-desktop-summary.jpg`：1440px總覽、Golden兩個差額及優先問題。
- `manager-batch2-manual-tablet-action.jpg`：768px置頂／歷史行動。
- `manager-batch2-manual-tablet-sensitivity.jpg`：768px明填銷量假設及三組不同結果。
- `manager-batch2-manual-mobile-evidence.jpg`：390px歷史貢獻原來源。
- `manager-batch2-manual-mobile-product.jpg`：390px商品兩期差額及來源；Enter開啟、Escape關閉、方向鍵可水平捲表。

三尺寸document.scrollWidth分別1425／753／375，未超出viewport；寬表採內部捲動。瀏覽器warn/error記錄為空。人工測試草稿已清除，保留乾淨Golden預覽，沒有保存真人資料。

本機服務：[http://127.0.0.1:3200/](http://127.0.0.1:3200/)（運行時有效）。啟動命令：

```sh
NEXT_TELEMETRY_DISABLED=1 APP_MODE=PUBLIC_DEMO PUBLIC_DEMO=true ENABLE_LIVE_AI=false npm start -- --port 3200
```

日後先 `npm run build` 再執行上式；開發可 `npm run dev`。本輪preview server log為 `manager-batch2-preview-server.txt`。

操作：載入Golden → 經營總覽先看優先問題並建立行動草稿 → 核對七欄及原始證據 → 商品毛利比較兩期、點差額 → 選DTC建立有效方案並展開敏感度 → 返回總覽選方案、下載主管稿／寬表或列印 → 主動保存完整工作區。既有行動換scope後是歷史，可複製文字重新選證據；不能直接確認舊稿。

## 變更與限制

- 新增domain `product-comparison.ts`、`scenario-sensitivity.ts`；application `action-workspace.ts`、`manager-summary.ts`、`product-comparison-export.ts`；components `actions-workbench.tsx`、`manager-summary.tsx/.module.css`、`product-comparison-panel.tsx`、`scenario-sensitivity.tsx`。
- 修改工作區備份v2、完整決策匯出、dashboard／情境／診斷／保存整合及print樣式；既有e2e selector與artifact名稱同步，避免覆蓋第一批證據。README、STATUS、PRD、ARCHITECTURE、SCENARIOS、DECISIONS、ACCEPTANCE更新。
- 摘要門檻、摘要所選方案、三個敏感度輸入與商品篩選屬頁內暫存，不納入備份；正式方案／行動需主動保存。完整工作區64MiB上限包含各歷史context原始標準輸入，超限拒絕保存，不靜默截斷。未實測最大負載效能。
- 行動工作稿不限三筆不等於無限容量；最多三項置頂，既有最多三個情境方案不變。完整備份支援有效v1遷移；錯誤／偽造binding拒絕，不以補值修復。
- 所有情境為固定假設下的條件試算；貢獻不等於公司淨利。AI／平台API／雲端同步／多人協作未新增。
- 下一批候選：PL-10 公開AI未啟用說明與進階驗證入口／主管語言收斂，依評閱第三批另行指定；本次停止。
