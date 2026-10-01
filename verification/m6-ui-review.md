# M6 匯入、介面狀態、匯出與資料隔離獨立審查

審查日期：2026-10-01（Asia/Taipei）。審查者為本輪 M6 的獨立子工作；未將 M5 STATUS 的測試通過紀錄直接視為本輪結果。此檔記錄程式與測試覆蓋審查；最終實際執行結果以 `verification/app-acceptance.md` 及本輪 runner artifacts 為準。

## 範圍與結果

已讀取完整 `docs/ACCEPTANCE.md`，以及 AGENTS、PRD、DATA_CONTRACT、METRICS、SCENARIOS、M6_REVIEW 與 STATUS 當前 M5 區段。檢查 `dashboard.tsx`、`import-panel.tsx`、`decision-workbench.tsx`、application 的 import／workspace／export／decision／decision-export，以及既有 workspace／import／scenarios E2E。

本次靜態審查未發現需要修改金融口徑或 production 程式的確定缺陷。發現三個證據覆蓋缺口，新增 `tests/e2e/m6-acceptance.spec.ts` 的三條真瀏覽器測試，依既有設定在 1440／768／390px 各跑一次，共 9 個案例：

1. 原先完整情境及行動匯出鏈以內建 golden 載入為主，真本機 alternative 匯入另有測試。新增從 alternative 三檔選取、明確口徑確認、通路診斷、情境、人工行動至 Markdown／CSV／JSON 的同一條操作鏈。
2. 原先隔離用例使用同一 context 的 `newPage()`。新增真正 `browser.newContext()`，兩方各自匯入不同資料、建立不同假設，再雙向檢查內容、清空及重整互不影響；也檢查另一 context 沒有產生 cookie 或 localStorage 持久資料。
3. 原先 malformed CSV 保留舊資料已有覆蓋。新增「先檢核成功，再改設定或換錯檔」必須撤銷可提交候選，以及取消後原資料／已計算決策保持 current；真正成功套用新資料後舊決策轉為 stale 且保留原 scope 與金額。

上述新增測試沒有匯入 production parser、calculator 或 exporter 來生成 expected；CSV 讀取器只用於核對下載位元內容，不計算預期金融答案。未更動既有 fixtures、golden expected、業務公式、README 或 STATUS。

## 手算錨點

alternative 本期 DTC 為 2026-09-03 至 2026-09-04，共兩日：G=440、D=40、R=0、N=400、C=200、P=10、Q=6、F=14、O=0、A=130。基準行銷後貢獻為 `400−200−10−6−14−0−130 = 40.00`。

明填 v=0、δ=0、f=−50%、a=0、K=3，接受全部固定假設：F′=7，條件貢獻 `400−200−10−6−7−0−130−3 = 44.00`，相對基準差額 `4.00`。這是合成資料的條件計算，不是實際成果或預測。

JSON／CSV／Markdown 斷言核對 dataset hash、filter hash、period、DTC scope、metric_version、data_as_of/as_of、五個數值與假設確認、固定假設、44.00／4.00，以及人工行動引用的本期 DTC 40.00 系統 fact。金額來源及 fact ID 由 UI 已顯示的合法選項取得後，對照下載內容，沒有硬編內部 fact 序號。

## Acceptance 覆蓋審查

下表「已覆蓋」表示已查閱實際測試斷言，不代表本子工作已重新執行該用例。最終 pass/fail/not_run 應由本輪執行結果回填主 acceptance 報告。

| ID | 已覆蓋的真操作與檢查 | 剩餘驗收邊界 |
|---|---|---|
| U01 | workspace 測試以空狀態載入示範並檢查 KPI；E2E server 強制 live disabled | 本子工作未執行 fresh `npm ci` 或 README 手動啟動；需依主工作實際命令列明 |
| U02 | import 實際選取 golden 與 alternative，核對變更後 KPI、週表、bridge、商品與診斷 | 新增 alternative 完整決策鏈；等待 runner 結果 |
| U03 | duplicate、mixed currency 與缺漏案例核對實際檔名、欄位、CSV 行號及下載問題清單 | 已覆蓋標準檔、重新命名及映射；非每種資料錯誤皆有人工瀏覽器操作 |
| U04 | 通路切換共用 KPI、診斷、商品、分析 CSV；自訂期間更新 KPI／週資料／來源；商品篩選匯出無廣告或貢獻 | 新增決策三格式共享 hash／期間／scope；商品過濾不被誤當通路貢獻 scope |
| U05 | 金額、貢獻率百分點差、排序金額、情境 baseline、行動 fact 以 modal 開啟公式／来源 | 自動用例抽查代表性 headline，沒有逐一人工點擊每個可能指標 |
| U06 | 三個實際 Chromium viewport；整頁 overflow、表格替代、截圖 | 本子工作未操作 CUA、未視覺複查新增截圖；人工 3 尺寸由主工作驗收 |
| U07 | 空、載入中、HTTP error、blocking、partial、ready；錯誤返回前次資料 | 新增 checked candidate 改設定／改錯檔撤銷與取消回復 |
| U08 | 標籤定位、Tab skip link、鍵盤啟動、modal 焦點圈限與 Escape 返回、圖表資料表 | 未使用螢幕閱讀器，不代表完整 WCAG 認證 |
| U09 | import、商品、scenario／action XSS 文本與 CSV 公式防護；數值負數不加文字前綴 | 新增合成惡意 SKU 所在資料集完整鏈；不聲稱能執行所有試算表軟體的安全驗證 |
| U10 | malformed、無效 UTF-8、>5 MiB、50,001 rows、過大期間，拒絕且保留原資料 | 產品界限測試不代表 5 MiB／50,000 rows 效能保證 |
| U11 | 匯入前提醒；無網路／持久化檢查；同 context 新頁與 reload 清空 | 新增真正雙 context 各自載入與雙向變動隔離；未測跨裝置或不同瀏覽器引擎 |
| R01 | 新測試檔 ESLint 已執行；其他全套命令由主工作統一跑 | 不能將本審查的靜態覆蓋當作本輪全套已通過 |
| R02 | 本子工作未更動金融核心與 golden expected | 全套 golden 執行結果由主工作記錄 |
| R03 | 既有三種決策匯出包含快照、period、scope、版本、as_of、固定及使用者假設 | 新增 alternative 完整鏈逐欄驗證；analysis/product CSV 是實績匯出，沒有情境假設欄，勿與決策匯出混稱 |
| R04 | 已查閱介面程式，為繁中操作工具，無人物履歷或商業成果數字宣稱 | 全 repo 內容與 build 搜尋由主工作統整 |
| R05 | 新增完整真 browser 操作鏈，可作人工驗收前回歸 | 自動 E2E 不能替代人工匯入→診斷→情境→行動→下載；人工結果由主工作記錄 |

## 本子工作實際命令

| 命令／操作 | 結果 |
|---|---|
| `npx eslint tests/e2e/m6-acceptance.spec.ts --max-warnings=0` | 已執行，exit 0；無 warnings |
| `npx tsc --noEmit` | 已執行，exit 2；TS2688 找不到 `d3-array 2`、`d3-scale 2` 型別定義。錯誤位於 `node_modules/@types` 的環境目錄，已回報主工作；本子工作未刪除／修改依賴 |
| 全套 typecheck／lint／unit／build／E2E | 本子工作未執行；主工作統一執行，避免 server 衝突及重複覆寫報告 |
| CUA、server 啟動、Playwright `--list` | 未執行 |

新測試執行成功時才會產生 `verification/m6-*-complete-flow.png`、`m6-ui-flow-meta.jsonl`、`m6-context-isolation-meta.jsonl`；JSON 決策下載另附在 Playwright test attachment，內容全部為明確合成 fixture。檔案不存在不能被當成通過。

## 可操作後續

- 將新 spec 納入本輪 full E2E，既有 177 加新增 9，預期應收集 186 項，實際以 runner 為準；不得以 `--list` 覆寫既有結果。
- 對新增完整鏈在三尺寸的截图進行視覺檢查；人工走實際 file input、確認口徑、診斷、五項假設、人工行動與三下載，將觀察及未執行部分寫入主 acceptance。
- 若 TS2688 環境問題仍存在，先檢查該空目錄狀態再處理；不要透過更改 tsconfig、略過型別檢查或調低測試門檻掩蓋。
- 維持本機與合成公開展示的界限：此次跨 context 驗證不構成可公開 live AI 後端的認證；API 金鑰、公開模式封鎖及真實模型未執行狀態由專門安全驗收記錄。
