# 管理者評閱改善第三批 PL-10 驗收

日期：2026-10-01，Asia/Taipei。使用者要求「繼續進行下一輪」，依評閱包第三批執行。這是本機改善；沒有推送、部署或呼叫即時模型。Git HEAD `04e186bf7be18102e2d23b71b9d4d74fe521a2f1`，前兩批未提交內容保留。開工比對前批120檔受測hash並重跑751項baseline；完整開工209檔hash見 `manager-batch3-starting-state.json`。

## 本批範圍

| ID | 結果 | 證據與限制 |
|---|---|---|
| PL-10a 公開版AI狀態 | pass | 全頁共用只讀能力查詢；公開版、無key、停用、查詢中／失敗各有真實文案。不可用時不提供JSON／同意／傳送流程；規則可操作。ai-presentation單元、ai.spec三尺寸mock及實際PUBLIC_DEMO GET／POST |
| PL-10b 進階驗證入口 | pass | 主流程demo／CSV；進階專頁保留五個原fixture選項。導航不換資料、範圍或行動／情境草稿；成功回總覽，blocking不覆寫。manager-presentation及完整workspace regression；人工Golden／missing-ad／duplicate |
| PL-10c 主管語言與追溯 | pass | 中文metric／period／scope；主要說明至少12px；fact／rule／快照ID在details內，原始檔／欄／行／公式未刪除。manager-language、manager-presentation、人工Enter／Escape與三尺寸截圖 |
| PL-10d 可用時預覽 | pass（mock） | 完整40facts精確字串中文表，前後期與合計範圍、比率單位明示；完整JSON／候選觀察／技術映射可展開。傳送只在同意後；取消、錯引用、timeout／429／拒絕／截斷／schema／注入／stale回歸通過。沒有live test |
| 預錄模型示例 | not_run | 包內選配項；未新增，不把規則結果冒充模型輸出 |
| 匿名個別通路AI拆解 | not_run | 未擴充既有40項合計payload，不把此輪UI分層當新模型分析能力 |

## 實際命令

命令均在專案根目錄；log相對本資料夾。終端機exit0才列pass。

| 命令 | 結果 | 紀錄 |
|---|---|---|
| `npm test -- --run`（開工） | pass，32 files／751 tests | `manager-batch3-baseline.txt` |
| `npm test -- --run tests/ai-presentation.test.ts`（先測） | fail，11 failed，預期red | `manager-batch3-ai-red.txt` |
| `npm test -- --run tests/manager-language.test.ts`（先測） | fail，4 failed，預期red | `manager-batch3-language-red.txt` |
| `npm test -- --run tests/ai-presentation.test.ts tests/ai-client.test.ts` | pass，48 tests；語言聚焦4 tests另pass | `manager-batch3-ai-green.txt`／`manager-batch3-language-green.txt` |
| `npm test -- --run tests/ai-presentation.test.ts`（真實性回歸） | 先fail：2 failed／9 passed；修正文案後pass：11 tests | `manager-batch3-ai-truth-red.txt`／`manager-batch3-ai-truth-green.txt` |
| `npm run typecheck` | pass，最終exit0 | `manager-batch3-typecheck-final.txt` |
| `npm run lint` | pass，最終exit0，max-warnings0 | `manager-batch3-lint-final.txt` |
| `npm test -- --run`（最終程式） | pass，34 files／766 tests | `manager-batch3-unit.txt` |
| `npm run test:e2e`（首次） | fail／主動停止exit130：102 passed、5 failed、1 interrupted、174未執行 | `manager-batch3-e2e-first.txt`／`manager-batch3-e2e-first-results.json` |
| `npm run test:e2e`（修正後全套） | pass，exit0，282 passed、0 unexpected／skipped／flaky、retries0，284.997秒 | `manager-batch3-e2e-final.txt`／`manager-batch3-e2e-results.json` |
| `NEXT_TELEMETRY_DISABLED=1 npm run build && npm start -- --port 3100` | pass，由最終E2E webServer執行；reuseExistingServer=false。並非獨立追加build | 上列JSON的config.webServer；BUILD_ID `p9LCsepxPsSU3ROkD0TCg` |
| `NEXT_TELEMETRY_DISABLED=1 APP_MODE=PUBLIC_DEMO PUBLIC_DEMO=true ENABLE_LIVE_AI=false npm start -- --port 3200` | pass，啟動同一最終build供人工驗收 | `manager-batch3-preview-server-final.txt` |
| `python3 verification/manager-batch3-check.py` | pass，exit0；21個client JS無指定非秘密canary／OPENAI_API_KEY／OPENAI_MODEL文字；GET unavailable、POST403 PUBLIC_DEMO | `manager-batch3-security-check.txt`／`manager-batch3-security.json`／`manager-batch3-integrity.json` |
| pypdf讀取＋`pdftoppm -f 1 -singlefile -scale-to 1400 -png verification/manager-batch3-regression-summary-print.pdf verification/manager-batch3-summary-print-render` | pass，Golden主管摘要1頁，抽字與渲染目視，沒有截字／重疊 | PDF、`manager-batch3-summary-print-render.png`及人工receipt |

最終unit之後只有E2E定位修正，沒有更動production；修正後typecheck／lint重跑，最終E2E重新build全部跑完。受測122檔在驗收後仍一致，沒有未受測的src/tests新增檔。開工／最終hash與檔案清單見 `manager-batch3-final-source-check.json`、`manager-batch3-changes.json`。

## 已重現問題與修復

1. 不可用AI原先仍顯示JSON及不可完成的同意流程；改為能力閘門，未知或失敗時明示規則降級。可用分支保留完整預覽及同意檢查。
2. 顯示層若在重掛後寫「尚未傳送資料」會誤導已傳過資料的使用者；改成每次傳送前需同意的能力說明。查詢失敗則稱「狀態未確認」，不宣稱已關閉；新增2項red→green測試。
3. 首次E2E的5個failure為定位歧義：新卡片含多層heading；新增global status後，原workspace status定位會匹配2個。指定heading level3、工作區testid及卡片稽核details，沒有放寬255／270等金額、stale或安全檢查。該次中断的一項privacy test不列為已確認產品失敗；最終完整282均通過。

## 真瀏覽器與回歸範圍

E2E：Chromium三個project各94項，1440×1000、768×1024、390×844。實際選檔／預覽／欄位確認／partial／blocking、匯入→診斷→情境→行動→三格式下載、來源、跨分頁隔離、本機備份恢復、商品及敏感度、stale、注入與mock AI都重新執行；各spec的`manager-batch3-*.jsonl`保留實際browser metadata。

人工：Codex in-app browser，`http://127.0.0.1:3200/`，PUBLIC_DEMO，同最終build；沒有人工mock live call。詳細操作見 `manager-batch3-manual-browser.json`。

- 1440×1000：首頁只有demo／import主入口、AI未啟用清楚可見；鍵盤進入進階驗證，選Golden得到營收2,470.00、貢獻255.00。實際AI區沒有JSON／同意／送出；最後回Demo，收入7,850,657.90、貢獻1,269,792.73。
- 768×1024：進階頁五選項、切頁保留Golden；缺廣告日partial保留收入2,470.00及未知貢獻，切DTC仍270.00；重複鍵blocking顯示sales_daily原始第10行，返回先前資料仍270.00。
- 390×844：診斷可讀中文period／metric／scope，原fact／rule隱於稽核；Enter展開和收合；Enter開255.00來源，8筆實際來源與公式仍保留，Escape關閉。文檔無橫向溢出，寬表仍在自身容器內捲動。
- 保存6張`manager-batch3-manual-*.jpg`；console warn/error讀取結果為空。這是觀察期間的結果，不是所有環境的無錯誤保證。
- Golden列印PDF由E2E真正生成，1頁，人工目視渲染；沒有開OS列印對話框或實體列印。

## 變更與保留

Production共8檔：`dashboard.tsx`、`ai-panel.tsx`、`workspace-panels.tsx`、`decision-workbench.tsx`、`actions-workbench.tsx`、`issue-list.tsx`、`globals.css`、`ai-client.ts`。新增`tests/ai-presentation.test.ts`、`tests/manager-language.test.ts`、`tests/e2e/manager-presentation.spec.ts`；既有E2E更新導航及本批證據前綴。Playwright配置、README、ACCEPTANCE、AI_CONTRACT、ARCHITECTURE、DECISIONS、STATUS同步更新。

本輪domain15、golden5、schema1、package2均未變；fixtures／review包／AGENTS等56原始檔hash通過。沒有新增依賴、改Golden答案、擴充AI傳送範圍、刪追溯資料或改商業口徑。尚未提交的前兩批工作與歷史verification保留。

## 未執行與已知限制

| 項目 | 狀態／原因 |
|---|---|
| Live OpenAI與真實商業資料 | not_run；沒有真實key，不把mock通過當連線或商業成效 |
| GitHub／Vercel更新與線上三尺寸驗收 | not_run；本輪是本機第三批改善，沒有push／部署／遠端修改 |
| 人工重新選三CSV／完整備份恢復／讀回下載位元 | not_run；人工聚焦改動介面。E2E真實流程另有pass，兩者分開記錄 |
| Safari／實體手機／讀屏 | not_run；此次可用Chromium與Codex瀏覽器，不宣稱全瀏覽器可及性認證 |
| 最大資料量、長時間操作與大量行動效能 | not_run；未新增壓測或聲稱效能上限已證實 |
| 原生列印／實體紙本 | not_run；只驗證Chromium PDF與渲染 |

可用AI仍只看到前後期共40筆所選通路合計，沒有每個匿名通路的獨立明細；不能據此提供通路歸因。能力GET在掛載時取得，設定修改後需重新載入；POST依當下server設定再次驗證，不以client顯示當安全界線。沒有key仍可匯入、計算、診斷、試算與匯出。

三批評閱改善在本機完成。本輪停止，不自行延伸live AI、平台API、雲端同步或部署。
