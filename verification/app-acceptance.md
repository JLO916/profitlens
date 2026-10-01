# ProfitLens M6 獨立驗收

日期：2026-10-01（Asia/Taipei）。範圍僅 M6，本機驗收與已重現問題修復；沒有雲端專案、公開 repo、部署或 live 模型呼叫。

結論：**本機、合成資料與 mock 邊界內通過**。本輪重新執行 615 個 unit/integration、186 個 Chromium E2E，typecheck、lint、production build 均成功；人工完成匯入→診斷→試算→行動→匯出按鈕操作。真實模型、正式公開環境、其他瀏覽器引擎及商業成效未驗收。本文件的 `pass` 只適用於各列明示的證據範圍，不代表完整安全認證或正式上線批准。

## 驗收方法與版本

- 先讀 AGENTS、完整 ACCEPTANCE、目前 STATUS、PRD、DATA_CONTRACT、METRICS、SCENARIOS、AI_CONTRACT、ARCHITECTURE、M6_REVIEW 與 PILOT_PLAN；前輪紀錄只當背景。本輪初始 586 tests、typecheck、lint、build 確實重跑成功。
- 財務、安全、UI 三份獨立審查分別記於 [財務](m6-financial-review.md)、[安全](m6-security-review.md)、[UI](m6-ui-review.md)。子審查的「未執行」不冒充主流程結果；主流程最終結果如下。
- Node 25.8.2、npm 11.11.1、Git 2.39.5、Next 16.3.7、TypeScript 5.9.3、Vitest 4.1.11、Playwright 1.63.0。非 Git repository，`git status --short` 實際失敗；未 init 或建立遠端。
- 財務口徑 `contribution-v1`、情境 `scenario-v1`、AI schema `ai-snapshot-v1` 不變；提示版本因安全收緊改為 `profitlens-insights-v2`。沒有新增依賴或修改 lockfile。
- 正式瀏覽器伺服器由 `npm run test:e2e` 先 build，再於 `127.0.0.1:3100` 啟動。強制 live 關閉、模型為測試字串，build 注入明顯非秘密的 canary。設定、source、lockfile、BUILD_ID 與靜態檔 SHA-256 見 [建置來源](m6-build-provenance.json)。

## 實際命令與結果

| 命令／操作 | 狀態 | 實際結果／證據 |
|---|---|---|
| `npm run typecheck`（初始、最終） | pass | 最終 exit 0；[m6-typecheck.txt](m6-typecheck.txt) |
| `npm run lint`（初始、最終） | pass | 最終 exit 0，0 errors / warnings；[m6-lint.txt](m6-lint.txt) |
| `npm test -- --run`（初始） | pass | 20 files / 586 tests；[m6-tests-initial.txt](m6-tests-initial.txt) |
| `npm test -- --run`（最終） | pass | **22 files / 615 tests**，無 skipped/todo；[m6-tests.txt](m6-tests.txt) |
| `NEXT_TELEMETRY_DISABLED=1 ENABLE_LIVE_AI=false OPENAI_API_KEY=sk-PROFITLENS-M6-NONSECRET-BUNDLE-CANARY OPENAI_MODEL=verification-only-never-called APP_MODE=LOCAL npm run build` | pass | 初始獨立 build exit 0；[m6-build-initial.txt](m6-build-initial.txt)。修正後 full E2E 另外重新 build 成功，沒有沿用初始產物 |
| `npm run test:e2e` | pass | **186 passed**，195.9 秒，0 skipped / unexpected / flaky，retries=0；[原始 log](m6-e2e.txt)、[JSON](m6-e2e-results.json) |
| `node scripts/verify-ai-security.mjs` | pass | 22 靜態資源無指定 canary / server SDK 標記；4 種 production HTTP 模式與 log 檢查成功；[原始 log](m6-security-check.txt)、[結果](m6-security.json) |
| `npm ci --offline --no-audit --cache /tmp/profitlens-npm-cache`（全新暫存副本） | pass | 無 node_modules / .next / .env.local / next-env.d.ts 的副本，固定 lockfile 安裝 442 packages；[log](m6-clean-install.txt)。使用已存在 registry cache，不代表本輪線上供應鏈 audit |
| `npm run typecheck`（全新副本） | pass | exit 0，不需先 build；[log](m6-clean-typecheck.txt) |
| `NEXT_TELEMETRY_DISABLED=1 ENABLE_LIVE_AI=false OPENAI_API_KEY= OPENAI_MODEL= npm run dev -- --port 3210`（全新副本） | pass | 326 ms ready；首頁 HTTP 200、有空工作區；AI capability available=false；[結果](m6-clean-start.json)。驗收後停止測試 server，SIGTERM exit 143 是主動清理 |
| CUA 內建瀏覽器，`127.0.0.1:3000` | pass | 真正選檔、三尺寸、鍵盤、行動與匯出控制；[人工紀錄](m6-manual-browser.json) |
| CUA 下載檔案位元讀回 | not_run | Markdown 下載事件等候 30 秒逾時；UI 顯示已下載，後續 CSV/JSON 按鈕也實際操作。未取得 CUA 檔案路徑，不宣稱人工讀回檔案。Playwright 的實際 download 位元與三格式內容另已通過 |
| 真實 OpenAI API / live 品質 | not_run | 沒有真實 key，無實際模型請求、配額或帳戶模型支援驗證 |

本機測試服務的 listen 使用既有 Codex 核准流程；未停用 sandbox。既有 3000 dev 保留，3100 E2E、3205 HTTP 檢查、3210 fresh-run 服務均已停止。

## 已驗證問題、修復與中間失敗

| 問題／步驟 | 修復前狀態 | 修復後狀態 |
|---|---|---|
| 合法 F033 數值被自由文字改稱前期、其他通路、其他 metric 或公司淨利 | fail；client 確實接受並顯示錯誤口徑 | pass；只有 catalog 精確驗證的 observation 可含數值 placeholder，所有自由欄位拒絕 `FREE_FIELD_NUMERIC_REFERENCE`；client 亦降級 |
| 「請提供金鑰／密鑰」沒有 API 前綴 | fail；文字漏網 | pass；納入既有憑證索取防線，固定負例與正常文字正例通過 |
| 「廣告預算應調至三萬」無貨幣單位 | fail；中文數字漏網 | pass；補調至／降至／升至／設定為等已重現變體；不宣稱可窮盡所有自然語言 |
| 第一輪安全修復與舊測試衝突 | fail；163 passed / 1 failed，舊測試要求自由欄位可含 placeholder | pass；主驗收者審核後將該項改為新版拒絕規則，保留 observation 數值來源不變斷言；並將 prompt 升 v2，沒有改 golden |
| 子審查 typecheck：空的重複 type 目錄 | fail；先 2 個、再 8 個 `@types/* 2` 被 TypeScript 當型別套件而 TS2688 | pass；逐一確認空目錄才 rmdir，原套件保留，沒有改 tsconfig。最終主流程及全新安裝 typecheck 均通過；產生原因不明 |

安全修復前 **8 failed** 的 [RED](m6-security-red.txt)、首次 [失敗](m6-security-first-fix.txt)、最終 targeted **312 passed** 的 [GREEN](m6-security-green.txt) 均保留。新增共 19 安全回歸與 10 獨立財務 probes。財務審查沒有重現 production bug，因此沒有虛構財務 RED。型別環境錯誤保留於 [首次](m6-security-typecheck.txt)、[重跑](m6-security-typecheck-retry.txt)，清理清單見 [environment-repair](m6-environment-repair.json)。

新增 E2E 3 情境 × 3 尺寸：alternative 完整決策鏈、兩個真正獨立 browser context 的雙向隔離、檢核成功後改設定／換錯檔撤銷候選。既有 177 回歸全部保留，共 186。本輪未以 retry、skip 或修改固定答案遮掩失敗。

## Acceptance 逐項結果

以下 unit/integration 均由最終全套命令執行；E2E 均由最終 186 項執行。證據中的 mock 不等同 live。

| ID | 狀態 | 本輪結果／證據範圍 |
|---|---|---|
| C01 | pass | golden 前期 N2250 / GP1200 / before870 / after570，`domain-acceptance.test.ts` 固定 expected |
| C02 | pass | golden 本期 N2470 / GP1145 / before705 / after255 |
| C03 | pass | DTC270 + MARKETPLACE(-15) =255；E2E 切通路亦驗證 |
| C04 | pass | 九項 bridge 精確 -315、無殘差；另獨立帳 298→330，bridge +32 |
| C05 | pass | 先彙總日通路再 join；多 SKU 及無銷售費用日 probes，費用不倍增 |
| C06 | pass | 缺 cogs 保留收入，影響 GP/CM 為 null；未受影響通路保持可算 |
| C07 | pass | 重複 sale key blocking；fixture 真匯入保留舊資料，無 dedup |
| C08 | pass | 缺廣告日 partial；before 可算、after null；無銷售日缺 ad 亦傳遞未知 |
| C09 | pass | mixed currency fixture blocking，不猜匯率 |
| C10 | pass | 零 ad 金額仍可算，MER null |
| C11 | pass | 跨期／純退款可超過當日收入，保留負金額，不重扣或另推成本 |
| C12 | pass | 來源負 cogs／費用抵扣按帳列淨額；獨立退款日 N-100 / GP-75 / CM-84 |
| C13 | pass | null／空字串／NaN 不生成已知財務結果，validation／money 負例 |
| C14 | pass | N<=0 時金額留存，毛利率／貢獻率／MER 不適用 |
| C15 | pass | 精確分金額 0.10+0.20=0.30、排序無關；Decimal 正負半分回歸 |
| C16 | pass | 日期、等長、不重疊、coverage、未知活動與技術上限拒絕；不截斷 |
| C17 | pass | sum(numerator)/sum(denominator)，獨立帳 GP485/N970=.5，不平均列比率 |
| C18 | pass | SKU/category 僅商品毛利與銷售來源；無 ad/CM；E2E 商品篩選後全通路基準仍正確 |
| U01 | pass | 全新副本 npm ci、typecheck、dev HTTP smoke；主工作區示範的無 key 三尺寸操作另經 E2E/CUA。非全新 OS 或網路安裝驗收 |
| U02 | pass | 真正選取 alternative 與 golden，表／圖表替代資料／KPI／診斷重算；人工 alternative N600、CM10 |
| U03 | pass | errors fixture 的檔名、欄位、實體 CSV 行號與問題清單下載；缺列不捏造行號 |
| U04 | pass | 期間／通路同步總覽、明細、診斷與匯出；未套用日期不影響已套用範圍 |
| U05 | pass | 代表性 KPI、百分點差額、排序金額、scenario baseline、fact 開公式與來源；人工核對 DTC40、8 筆來源 |
| U06 | pass | 真實 Chromium 三尺寸與 CUA 1440/768/390；無頁面水平溢出，表格容器可橫捲；截圖已目視 |
| U07 | pass | empty/loading/error/partial/ready、HTTP故障、保留前次資料；檢核後修改撤銷候選 |
| U08 | pass | labels、focus、Enter/Tab/Escape、modal 返回、圖表表格替代；非完整螢幕閱讀器／WCAG 認證 |
| U09 | pass | 合成 HTML/SKU/行動文字不執行；CSV formula/control chars escape、合法負數保留；未用 Excel/Numbers 開啟執行 |
| U10 | pass | malformed、無效UTF8、>5MiB、50,001 rows 拒絕且保留舊資料；非最大量效能基準 |
| U11 | pass | 重整清空、匯入前提醒、零預設持久化／匯入上傳；兩個獨立 context 各自匯入、試算、清空與重整互不影響 |
| S01 | pass | 零變動等於 baseline，golden DTC270；五個 0 由使用者明確填入 |
| S02 | pass | DTC v0/δ0/f-10/a0/K0→284；K20→264；unit與三尺寸E2E |
| S03 | pass | v空白拒絕；降低廣告不自動補 v0 或保證收入不變 |
| S04 | pass | 缺資料、多通路、非正N/G、負成本／費用或無效比率停用並解釋；不出NaN |
| S05 | pass | 百分點與相對%不同；逐成本閉合、取分調整；獨立compound 242/13→18.62 |
| S06 | pass | 最多3方案各自同baseline，不串接、不加總收益 |
| S07 | pass | 換檔／期間／通路／同hash重載撤銷舊情境與行動；重新確認清空假設，匯出保留stale與原範圍 |
| A01 | pass | 合成/mock structured result經server/client schema+grounding並解析placeholder；**live not_run** |
| A02 | pass | 固定錯ID/metric/period/scope、字面數字、因果與缺漏案例拒絕；本輪新增數值偷換口徑也拒絕 |
| A03 | pass | 惡意原文不進payload，無工具權限；已知越權/索取憑證回應拒絕；非任意prompt injection保證 |
| A04 | pass | no-key/timeout/429/拒絕/截斷/schema/semantic/取消 mock保留核心與規則；真實本機no-key也驗證 |
| A05 | pass | 未呼叫的實際UI明示規則，mock證據明標MOCK；未宣稱已連線或模型品質通過 |
| A06 | pass | dataset/channel/period改變再回原值、慢回應忽略abort、config競態均不能復活舊同意與結果 |
| A07 | pass | 40匿名facts完整預覽與逐快照同意、POST對帳；未同意不送；logs metadata白名單，原始檔不傳 |
| A08 | pass | 同canary新build的22資源掃描無洩漏；production PUBLIC_DEMO即使有假key也403；未授權公開環境not_run |
| R01 | pass | 五個真命令均執行，615 unit/integration、186 E2E；中間fail與未執行另列 |
| R02 | pass | 核心未改，仍重跑全套golden；fixture/expected/schema SHA-256核對未變 |
| R03 | pass | Markdown/CSV/JSON實際下載內容含snapshot、period、scope、metric_version、as_of與全部假設；alternative手算40→44；[下載JSON例](m6-desktop-e2e-decision.json) |
| R04 | pass | 介面/來源查閱與三尺寸畫面是工具流程；無假見證、履歷/前雇主或實際商業提升宣稱；合成數值明示來源 |
| R05 | pass | CUA人工實際走完選檔→口徑確認→診斷來源→明填試算→七欄行動→三格式按鈕。人工下載位元讀回not_run，另有E2E真下載；沒有以綠燈自動發佈 |

## 人工與瀏覽器證據

人工使用 `tests/fixtures/alternative` 三 CSV＋manifest；沒有寫入 DOM 或以內部函式注入資料。預覽16筆銷售（只展示前10列）、8筆費用、8筆廣告，再勾口徑並檢核／套用。商品 `-TEST()` 的 N=-40、C=60、GP=-100 保留；`<img ...>` 以文字顯示。

DTC 本期 G440−D40−R0−C200−P10−Q6−F14−O0−A130=40。明填 v0、δ0、f−50%、a0、K3，F′7，條件CM44、差額4；這只證明條件公式，**不是已達成收益**。人工行動引用本期 DTC 履約費14並附角色、期限、停止條件與額外資料。原生日期使用方向鍵完成輸入後確認成功。

| 實際尺寸／證據 | 觀察 |
|---|---|
| [1440px試算](m6-manual-scenario-1440.jpg)、[來源](m6-manual-evidence-1440.jpg)、[行動與匯出](m6-manual-action-export-1440.jpg) | 五項假設、44.00條件結果、fact與匯出狀態可讀；document scrollWidth1425≤1440 |
| [768px試算](m6-manual-scenario-768.jpg) | 兩欄表單、Enter重算、焦點外框可見；scrollWidth753≤768 |
| [390px總覽](m6-manual-overview-390.jpg)、[來源](m6-manual-evidence-390.jpg)、[鍵盤橫捲表格](m6-manual-table-scrolled-390.jpg) | 導覽換行、單欄表單；scrollWidth375≤390。表格容器client311/scroll382，ArrowRight後scrollLeft67.5；Enter/Escape可操作公式視窗 |

[人工browser logs](m6-manual-browser.json) 的 warn/error為空。自動化的 [完整鏈紀錄](m6-ui-flow-meta.jsonl) 三尺寸browser_errors皆空；[獨立context](m6-context-isolation-meta.jsonl)各有2context通過。既有故障注入案例的HTTP503／取消log保留在 `m6-regression-*`，不宣稱所有注入測試沒有任何console事件。內建瀏覽器下載事件逾時已明記，不以UI成功訊息冒稱取得下載檔。

## 原檔保留與變更

開工時373既有檔案逐檔SHA-256；最終結果見 [保留核對](m6-preservation.json)。原fixtures（含errors/golden）、spec、財務規格、domain核心、package/lockfile與M0–M5 verification均未變、無刪除。M5曾記載的M4 JSON遺失仍屬歷史限制，本輪沒有重建或冒稱恢復。

Production只修改 `src/ai/{grounding,prompt,provider}.ts`：數值引用入口收緊、已知文字漏洞修復、prompt v2。測試新增 `tests/m6-{financial,security}-audit.test.ts`、`tests/e2e/m6-acceptance.spec.ts`；既有AI測試同步收緊契約／版本。Playwright與security script改M6 artifact/canary，避免覆寫前輪證據。README、STATUS、DECISIONS與本報告記錄操作及限制；沒有改商業定義或新大功能。

## 產品操作與公開示範前安全檢查

1. `npm ci` → `npm run dev`，開 `http://127.0.0.1:3000`；無key即可載入demo/golden或匯入三CSV。
2. 匯入先查檔案角色、manifest、前10列、欄位對照、未稅口徑及coverage；檢核後才套用。blocking回去修來源；partial可分析已知收入，但相關貢獻未知，不補值。
3. 以通路與等長前後期讀KPI、週表、精確bridge及規則。點數值核對公式／來源；SKU頁只讀商品毛利。
4. 試算選本期單一通路，接受全部模型假設並明填五個數值；最多三方案獨立比較。建立人工行動、選fact、確認後匯出。換資料或範圍須重新確認，舊稿仍標過期。
5. 下載工作稿保留快照、假設與證據，但不是原始三CSV備份，也沒有匯回復原功能。重新整理會清空分頁；請保留來源檔。

| 示範前檢查 | 此次狀態／後續條件 |
|---|---|
| 使用合成資料、沒有把真實CSV放public/repo | pass（此次）；任何公開包仍須由發佈者複核資料與截圖 |
| 後端設定 `APP_MODE=PUBLIC_DEMO`（或 `PUBLIC_DEMO=true`），且 `ENABLE_LIVE_AI=false` | pass（本機production gate）；在公開host仍須重測POST403，不能只藏按鈕 |
| 公開環境不放API key，不用NEXT_PUBLIC秘密 | pass（來源／canary）；正式環境secrets盤點not_run，尚未建立環境 |
| 編譯資源與server logs無key/raw facts | pass（假canary與固定mock）；不代表未來設定或代理log自動安全 |
| 下載CSV防公式與UI文字escape | pass（固定攻防與瀏覽器）；再次轉存試算表或編輯CSV可能改變防護，外部軟體not_run |
| 公開live模型認證／限流／費用預算 | not_run／不支援；Local Host/Origin不是使用者認證，不可據此公開開live |
| Registry最新依賴漏洞audit、正式host安全headers/代理/TLS | not_run；本次離線clean install提示eslint9.39.5已deprecated，未擅自升級固定依賴；不宣稱0漏洞 |
| 真實live品質、人工修改量、理解時間、業務收益 | not_run；需另有key、明確資料同意與試行設計，不由合成mock推論 |
| 雲端專案、公開repo、部署 | not_run；未獲授權，未建立或發佈 |

已可真實操作的是標準CSV檢核與本機計算、可追溯診斷、固定假設試算、人工行動與下載。仍不支援正式平台API、登入/多人共享、資料庫或跨session保存、匯入決策JSON復原、SKU廣告歸因、完整公司淨利、預測或最適預算。Safari/Firefox、原生行動裝置、螢幕閱讀器與最大量效能基準未執行。M6結束於本機驗收；下一步如需真實資料試行或公開展示，另行授權與驗證，不自動部署。
