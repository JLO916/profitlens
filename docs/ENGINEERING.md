# ProfitLens 工程與驗收

> 給開發者與驗收者。產品介紹、試用方式與口徑說明見 [README](../README.md)；各次發布說明見 [RELEASES](RELEASES.md)；專案規則見 [AGENTS.md](../AGENTS.md)（優先）與 [CLAUDE.md](../CLAUDE.md)。
>
> 本檔前三節（驗收命令、Revamp v2 批次紀錄、文件地圖）於 2026-10-03（Revamp v2 R7）新寫；「原 README 工程內容」以下是 R7 改寫 README 前的原文搬移，資訊未刪，只把相對連結改成從 `docs/` 出發，並以「R7 註記」標出已過時的句子（原句保留）。

## 工程驗收命令

使用 Node.js 24 以上與 npm 10 以上（`package.json` 的 `engines`）；套件固定於 `package.json` 與 `package-lock.json`，請勿刪除 lockfile 重新解析版本。每批都要全部執行並記錄真實結果：

```sh
npm ci                 # 全新環境或 lockfile 變動時
npm run typecheck      # 先 next typegen 再 tsc --noEmit
npm run lint           # eslint . --max-warnings=0，警告也算失敗
npm test -- --run      # Vitest 單元／整合（不加 --run 會進監看模式）
npm run build          # next build --webpack
npm run test:e2e       # Playwright Chromium；首次需 npx playwright install chromium
```

- `npm run test:e2e` 會自行執行正式 build，並在本機 **3100 port** 以 `npm start` 啟動獨立服務、結束後停止；執行前請確認 3100 沒有其他服務，測試／建置期間不要修改程式。
- E2E 以四種視窗執行（`playwright.config.ts` 的四個 project）：`desktop` 1440×1000、`laptop` 1280×900、`tablet` 768×1024、`mobile` 390×844。
- 本機預覽：`npm run dev` → <http://127.0.0.1:3000>（只監聽 127.0.0.1；3000 被占用時 `npm run dev -- --port 3001`）。
- AI 相關的安全檢查另見下方「M5 選配 AI 解釋」的 `node scripts/verify-ai-security.mjs`（本機 3205 port）。

## Revamp v2 批次驗收紀錄

Revamp v2（`docs/revamp/`，R0–R7）把產品從稽核員工具改成經理人每週使用的工具；財務核心（`src/domain`、golden／demo／errors／refund_only／zero_ad fixtures、`contribution-v1`、`docs/METRICS.md` 公式）不改，R4 起只做加法。下表數字是各批結束時的真實執行結果（摘自 [STATUS](STATUS.md)），不是本次重跑；細節、失敗與重跑紀錄以各批驗收檔為準。

| 批次 | 內容 | 單元／整合 | E2E（四尺寸） | 驗收紀錄 |
|---|---|---|---|---|
| R0 | 基線與安全網 | 40 檔／819 | 404 | [revamp-R0-acceptance.md](../verification/revamp-R0-acceptance.md) |
| R1 | 總覽重排與頁首減負 | 42 檔／828 | 428 | [revamp-R1-acceptance.md](../verification/revamp-R1-acceptance.md) |
| R2 | 語言與文案層 | 45 檔／839 | 444（440 過；4 項測試斷言修正後重跑 16/16） | [revamp-R2-acceptance.md](../verification/revamp-R2-acceptance.md) |
| R3 | 匯入精靈與台灣來源 | 51 檔／921 | 472（460 過；12 項測試預期過時，改測試後重跑 60/60） | [revamp-R3-acceptance.md](../verification/revamp-R3-acceptance.md) |
| R4 | 輔助指標、去年同期、目標、檔期、備份 v4 | 57 檔／1,014 | 488 | [revamp-R4-acceptance.md](../verification/revamp-R4-acceptance.md) |
| R5 | 健檢、試算、行動的決策化 | 65 檔／1,207 | 520（516 過；4 項列印測試比對式修正後重跑 12/12） | [revamp-R5-acceptance.md](../verification/revamp-R5-acceptance.md) |
| R6 | 會議紀錄、匯出、預設保存 | 72 檔／1,435 | 576 | [revamp-R6-acceptance.md](../verification/revamp-R6-acceptance.md) |
| R7 | README、示範資料、上線整理 | 73 檔／1,462 | 576 | [revamp-R7-acceptance.md](../verification/revamp-R7-acceptance.md)（含 Lighthouse、13 項 HTTP、鍵盤、v3 恢復、網路紀錄） |

R3 的來源預設查證另見 [revamp-R3-preset-verification.md](../verification/revamp-R3-preset-verification.md)。R7（README、示範資料、上線）的上線檢查紀錄寫在 `verification/revamp-R7-acceptance.md`，並由 [RELEASES](RELEASES.md) 的 v2.0.0 段落連結。

## 文件地圖

| 文件 | 內容 |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | 技術架構、模組邊界、備份與會議資料結構 |
| [METRICS.md](METRICS.md) | 財務口徑與公式（`contribution-v1`，禁區） |
| [DATA_CONTRACT.md](DATA_CONTRACT.md) | 三份日粒度 CSV 與 manifest 的資料契約 |
| [SCENARIOS.md](SCENARIOS.md) | 假設試算的閉合模型（不是預測） |
| [DECISIONS.md](DECISIONS.md) | 決策紀錄（含 Revamp v2 R1–R6 的取捨） |
| [STATUS.md](STATUS.md) | 每批真實執行結果與未執行項目 |
| [revamp/](revamp/) | Revamp v2 規格套件：`00_README`、`01_BRIEF`、`02_IA_LAYOUT`、`03_GLOSSARY_COPY`、`04_IMPORT_TW`、`05_FEATURES`、`06_BATCHES`、`07_PROMPTS`、`08_RELAUNCH`、`09_DECISIONS_PENDING` |
| [ORDER_AGGREGATION.md](ORDER_AGGREGATION.md) | 平台訂單明細彙總成日粒度（`scripts/aggregate_orders.py`） |
| [AI_CONTRACT.md](AI_CONTRACT.md)、[M5_EVALUATION.md](M5_EVALUATION.md) | 選配 AI 的契約與評估 |
| [PRD.md](PRD.md)、[ACCEPTANCE.md](ACCEPTANCE.md)、[TASKS.md](TASKS.md) | 原始產品規格、驗收條件與 M0–M6 關卡 |
| [PILOT_PLAN.md](PILOT_PLAN.md)、[PILOT_WORKSHEET.md](PILOT_WORKSHEET.md) | 真實使用者試用計畫與工作表 |
| [RELEASES.md](RELEASES.md) | 發布紀錄（v2.0.0 與更早的發布） |
| 使用者可見文字 | `src/i18n/labels.zh-TW.ts`（單一來源；元件、匯出、AI 預覽都從這裡取字） |

### 名詞對照（閱讀下方歷史原文用）

下方原文寫於 Revamp v2 R2 之前，使用舊名詞與按鈕名稱。R2 起畫面改為下列新名稱（完整對照見 `docs/revamp/03_GLOSSARY_COPY.md`）；程式 key、CSV 欄位 key 與財務口徑不變。

| 原文名稱 | 現在畫面上的名稱 |
|---|---|
| 商品淨營收 | 淨營收 |
| 行銷前貢獻 | 通路貢獻 |
| 行銷後貢獻 | 扣廣告後貢獻（短名：廣告後貢獻） |
| 履約費用／平台費用／金流費用 | 物流與包材費／平台抽成／金流手續費 |
| 通路診斷／規則診斷 | 通路健檢／自動健檢 |
| 情境試算 | 假設試算 |
| 行動摘要／建立行動草稿 | 待辦與決議／加入待辦 |
| 資料工作區 | 資料來源 |
| 進階驗證 | 開發者驗證（R7 起不在側欄顯示，改由網址 `#validation` 開啟，依決策 D10＝A） |
| 公式與來源 | 怎麼算的 |
| 載入示範資料／匯入標準 CSV | 試試示範資料／匯入資料 |
| 工作區保存與恢復 | 頂欄「儲存 ▾」 |
| 會議設定與決策 | 會議紀錄（R6 起獨立分頁） |
| 前期 | 上期 |

---

# 原 README 工程內容（R7 前原文，搬移保留）

## 原 README 開頭說明（歷史說明）

從 `START_HERE.md` 開始。工作流程：匯入 → 檢核 → 診斷 → 試算 → 行動與匯出。
本產品中的行銷後貢獻為明示成本範圍下的管理指標，不等於淨利；情境試算不是預測或成效承諾。

> **R7 註記**：產品使用現在從 [README](../README.md) 開始；`START_HERE.md` 是 2026-09-30 Codex 開發啟動包的說明，保留作歷史文件。「行銷後貢獻」R2 起改稱「扣廣告後貢獻」、「情境試算」改稱「假設試算」，財務口徑不變。

後續試用進度：已完成合成替代資料的完整操作演練及獨立金額核對，**真實資料與真實使用者試用仍待提供**。請使用 [實務試用工作表](PILOT_WORKSHEET.md) 記錄來源口徑、同範圍對帳、獨立操作及人工回饋；不要把合成答案或自動化時間填作商業成果。先前試用準備的命令、截圖、下載工具限制及9項針對性E2E見 [試用準備驗收](../verification/pilot-rehearsal-acceptance.md)。

## 線上示範與原始碼

- [開啟 ProfitLens 公開合成示範](https://profitlens-tau.vercel.app)
- [GitHub：JLO916/profitlens（私人，須帳號權限）](https://github.com/JLO916/profitlens)
- [Vercel 專案與部署記錄](https://vercel.com/jlo916s-projects/profitlens)
- [首次部署驗證與限制](../verification/deployment-acceptance.md)

Vercel 的 Production、Preview、Development 均設定 `APP_MODE=PUBLIC_DEMO`、`PUBLIC_DEMO=true`、`ENABLE_LIVE_AI=false`；沒有 OpenAI key。可載入合成資料或在自己的分頁匯入標準 CSV、查看診斷與試算；匯入原文預設留在瀏覽器記憶體，重新整理會清空目前工作區。只有明確同意才保存本機副本，恢復仍須預覽及確認，不自動跨分頁共用。公開站的 AI 後端關閉，使用規則診斷。

Vercel 已連接私人 GitHub 的 `main` 分支。後續推送 main 會交給 Vercel 建置，更新前應先執行下方工程驗收；本次沒有新增 CI 測試阻擋規則。`vercel.json` 指定 Next.js、`npm ci` 與 `npm run build`；`.vercelignore` 排除 CLI 上傳的環境檔、測試報告、verification 與本機私人目錄。既有規格及驗收證據留在私人 GitHub。

## 本機啟動

使用 Node.js 24 以上與 npm 10 以上；本輪驗收環境為 Node.js 25.8.2、npm 11.11.1。使用單一 npm workflow；套件固定於 `package.json` 與 `package-lock.json`，請勿刪除 lockfile 重新解析版本。

在此專案資料夾執行：

```sh
npm ci
npm run dev
```

以瀏覽器開啟 [http://127.0.0.1:3000](http://127.0.0.1:3000)。應看到繁體中文 ProfitLens 空工作區。按「載入示範資料」後，三份合成 CSV 經 M1 驗證與計算才顯示結果。終端機按 `Ctrl+C` 停止。

> **R7 註記**：R2 起空工作區標題為「營收漲了，到底多賺還是少賺？」，按鈕為「試試示範資料」。

預設僅監聽本機 `127.0.0.1`。若 3000 已被占用，可執行 `npm run dev -- --port 3001` 並改開對應網址。

基本操作不需要 API key，也不需要複製 `.env.example`。M5 的 `ENABLE_LIVE_AI` 預設關閉；未開啟、未提供金鑰或模型時，計算、圖表、規則診斷、情境及本機匯出均可使用。資料 endpoint 仍只讀白名單合成 fixtures；選配 `/api/insights` 只接收經同意的匿名彙總，不接收原始 CSV。設定與操作見下方「M5 選配 AI 解釋」。

## 工程驗收

```sh
npm run typecheck
npm run lint
npm test -- --run
npm run build
npm start
```

- `typecheck` 先產生 Next.js 路由型別，再執行 TypeScript 嚴格檢查，因此全新安裝不必先啟動開發伺服器。
- `lint` 使用 Next.js 的 ESLint 規則與 TypeScript 規則，警告也視為失敗；build 不取代 lint。
- `test` 使用 Vitest。原 [M3 單元／整合記錄](../verification/m3-tests.txt) 為 12 個測試檔、278 項通過；M4 再加入閉合情境公式、基準適用性、取分對帳、快照過期、行動驗證與三格式安全匯出測試。測試使用固定 golden／手算答案，不從 production 函式產生 expected。M5 再加入匿名化、語意攻防、provider／route／client 與降級測試；當輪最終通過數、失敗及未執行項目以 STATUS 與 `verification/` 為準，不能將先前階段的通過數當成本輪結果。M6 最終為 22 files／615 passed，含 10 個獨立財務 probes 與 19 個安全回歸。`npm test` 可進入監看模式。
- `build` 建置正式模式；建置成功後 `npm start` 同樣在本機 3000 提供服務。請先停止開發伺服器以免連接埠衝突。開發與建置沿用 Webpack；M0 環境曾因 Turbopack CSS 子程序無法開啟通訊埠（`Operation not permitted`）而改用此設定，M3 未重新驗收 Turbopack。
- `npm run test:e2e` 使用 Playwright Chromium，以 1440×1000、1280×900、768×1024、390×844 四種尺寸驗收工作台；實際涵蓋的匯入、情境及行動案例與 screenshots、JSON 結果、browser logs 見 STATUS 和 `verification/`。首次安裝須先執行 `npx playwright install chromium`。測試會自行執行正式 build，於本機 3100 啟動獨立的 npm start 服務並於結束後停止；請確保 3100 沒有其他服務。這可避免開發伺服器的 Fast Refresh 干擾記憶體工作區。測試／建置期間請勿修改程式。M6 瀏覽器驗收的通過、失敗及未執行數量見 STATUS；AI 回應相關測試明標 MOCK，不沿用舊階段結果或當作實際模型驗收。

只驗收 M1 的整合案例可執行：

```sh
npm test -- --run tests/domain-acceptance.test.ts
```

這會讀取原始合成 fixtures 並比對固定答案；測試不寫入 fixtures、不透過 production 函式產生 expected。

## 工作台本機操作

1. 載入「營運示範」：本期商品淨營收 7,850,657.90、行銷後貢獻 1,269,792.73，九項橋接合計 -598,833.95。這些是合成資料計算結果，不是真實成效。
2. 開啟「進階驗證」，選「Golden」並按「載入資料集」：本期貢獻 255.00；通路選 DTC 為 270.00，MARKETPLACE 為 -15.00。前期必須早於本期，選「相同天數」或各一「完整自然月」，且在 coverage／截至日內；無效期間不覆寫已套用範圍。
3. 點 KPI、差額、表格金額或診斷事實，查看公式、期間／通路、來源檔名與 CSV 行號。Esc 關閉並返回原按鈕；Tab 可操作數據表與來源分頁。
4. 「商品毛利」可選品類與搜尋 SKU；只呈現商品收入、成本與毛利，不分攤廣告、不顯示商品行銷後貢獻。
5. 「資料工作區」列出資料口徑、截至日、三檔列數與前 10 列預覽、問題與快照識別。預覽為完整原始資料集的前 10 列，標示不受分析篩選影響；分析均使用全部資料。
6. 在「進階驗證」可載入缺成本／缺廣告日案例觀察 partial；未知金額顯示「—／資料待補」，不補零。重複鍵案例會拒絕載入，並可明確返回前次成功資料。

> **R7 註記**：上列是 R2 前的名稱，財務口徑不變：「商品淨營收」「行銷後貢獻」現稱「淨營收」「扣廣告後貢獻」；「進階驗證」現為「開發者驗證」，R7 起不在側欄顯示，改由網址 `#validation` 開啟（決策 D10＝A）；「資料工作區」現為「資料來源」；「相同天數／完整自然月」現為「等天數比較／整月比較」；「公式與來源」現為「怎麼算的」。

重新整理或「清空工作區」會清空目前分頁記憶體，未保存變更會提示；其他視窗不自動共用工作區。本機副本只有明確保存才建立，恢復必須手動預覽及確認。切換資料會重置期間並關閉目前來源抽屜；既有行動保留原快照，仍可查歷史來源。較慢的舊請求不可覆寫新選擇。週趨勢按各期起日每 7 天分組，最後不足一週另列；圖表只用近似座標繪圖，數據表與證據保留精確金額。

## 管理者改善第一批：比較、保存與匯入

- **比較**：選相同天數或完整自然月，日期變更須按「套用期間」。完整自然月允許八月 31 天與九月 30 天；前期必須早於本期。總覽並列四個核心指標的合計、天數及日均，點日均可查看分母與來源；CSV 另列全部支援金額的日均與差額。bridge、方案及 AI facts 使用實際合計，不把日均當預測。
- **保存**：展開「工作區保存與恢復」。下載「完整工作區備份」後確認檔案已保存，或同意把工作區存在這台電腦（R6 起：首次載入資料時詢問一次；同意後每次修改 2 秒內自動保存，頂欄顯示「已保存 hh:mm」；選「先不要」則維持每次手動儲存）。刷新會清空分頁，需選備份 JSON 或「讀取本機副本預覽」，核對後按「套用備份並取代工作區」。不接受 M4 決策 JSON 或 manifest 充當完整備份。
- **恢復內容**：標準輸入 CSV、manifest、欄位映射、已套用期間／通路、版本、方案、行動與確認狀態。恢復重驗資料並重算；舊稿 stale 保留，不把換回相同範圍當作重新確認。會議名稱、固定範圍、門檻、各通路選定方案修訂、置頂順序、備註與人工決策，以及行動引用歷史／執行狀態也納入備份。不保存未套用日期／匯入草稿、商品搜尋／品類／負毛利／排序設定、三組敏感度輸入、AI 回應、API key 或 AI 同意。備份最多 64 MiB；每份 CSV 仍受 5 MiB／50,000 列限制。
- **隱私**：工作區格式 `profitlens-workspace-v4`（R4 起含含稅換算原值、目標、檔期；R6 起含已結束的會議紀錄）可讀取有效的 v1／v2／v3 備份，先驗原格式與 checksum 再遷移；原行動遷移後保留原始範圍／證據與最多三個置頂。本機副本及下載檔沒有應用程式層加密，同一瀏覽器設定檔的使用者可手動恢復。清空分頁不等於刪除本機副本；「刪除本機副本並關閉保存」移除本工具 IndexedDB，不會刪除其他分頁資料或下載檔。瀏覽器可能限制／清除儲存；請妥善保留備份。校驗碼不是簽章或出處證明。
- **首次匯入**：三檔各有可下載的標準欄位空範本、中文欄位含義及粒度說明。選檔並對照欄位後可核對「從 CSV 提議範圍」並按「確認並帶入日期與通路提議」，確認後才帶入表單；截至日提議需自行核對，已觀察列不證明完整 coverage。訂單級資料需先依規格整理；不在此工具自動猜收入、彙總訂單或換算含稅。
- **對帳**：檢核後顯示完整資料涵蓋範圍的來源欄位合計 → 標準欄位 → 本工具指標，與目前所選兩期合計是不同範圍。缺值顯示未知與已知小計，不以小計代替完整總額。運費收入／平台補貼等未定義收入不包含在商品淨營收。含稅、已扣折扣結算淨額或未知口徑會阻擋，須先在來源整理。換檔或欄位對照後必須重新確認金額口徑。

> **R7 註記**：「工作區保存與恢復」現在是頂欄「儲存 ▾」，「刪除本機副本並關閉保存」現為「刪除本機資料」。R5 起三組敏感度輸入已納入方案與備份 v4（上方「不保存……三組敏感度輸入」為當時原文）。R3 起匯入改為四步精靈，含稅報表可在使用者明確選擇「含稅」後逐列換算成未稅（見下方「匯入精靈」），因此「不在此工具……換算含稅」與「含稅……會阻擋」兩句只適用 R3 以前；訂單級資料仍須先整理（`scripts/aggregate_orders.py`）。

## 管理者改善第三批：可用範圍與進階驗證

- 每頁顯示「規則診斷可用」及即時AI狀態。公開示範模式明示後端已關閉模型連線；設定確認中或不可用時，不顯示不能操作的JSON、同意或送出流程。核心計算、規則、方案與匯出仍可操作。
- 主要頁面使用「載入示範資料」或「匯入標準 CSV」。Golden、缺成本、缺廣告日與重複鍵測試移至側邊「進階驗證」；只切頁不換資料，按「載入資料集」才開始驗證。載入成功回總覽；blocking保留先前資料。
- 規則、fact、快照版本等識別收在可展開的稽核資訊；來源檔、欄位、行號和每個可點金額仍可追溯。重要說明及範圍文字至少12px，寬表保留鍵盤橫捲。
- 若自行正確設定本機AI，可先讀中文前後期40筆彙總值，再按需展開完整JSON、觀察候選與來源對照。只傳所選通路合計，沒有個別通路拆解，不能據此讓模型指定某通路為原因；同意、取消與資料變更後撤銷機制不變。這些可用／故障路徑以mock驗收，**尚未進行live AI測試**。
- 本批沒有新增預錄AI示例。規則診斷與合成資料不冒充模型生成；當下能力提示也不代表已有模型呼叫。未授權公開即時API，部署政策不變。

> **R7 註記**：R1 起 AI 狀態改為頂欄小標籤（「自動健檢可用｜AI 解釋未啟用」）＋說明 popover；R2 起「載入示範資料」「匯入標準 CSV」改為「試試示範資料」「匯入資料」，「稽核資訊」改為「技術細節」；「進階驗證」改為「開發者驗證」，R7 起由網址 `#validation` 開啟、不在側欄顯示（D10＝A）。

## 管理者改善第二批：先看摘要，再形成工作稿

1. **經營總覽**先看本期兩個關鍵差額及三組優先問題；缺漏先列，同規則合計／通路分組，不加總為改善機會。可設定金額重要性門檻；完整診斷仍在「通路診斷」。Golden 為收入差 +220.00、貢獻差 −315.00；MARKETPLACE 貢獻 170.00→−15.00，全部是合成資料固定驗算。
2. **建立行動**：在診斷或摘要按「建立行動草稿」，帶入該診斷原 facts。證據核對、七欄完整性與執行進度分開呈現；可搜尋人類可讀的證據描述，技術 ID 在稽核詳情。可新增超過三項、跨通路工作，最多置頂三項。切換頁面、通路或期間不改原引用；資料更換後標示引用較早資料，仍可更新進度。按「預覽重新綁定目前資料」以原期間／通路重算，核對新舊值後才明確提交；歷史引用保留。改分析範圍須另建行動。
3. **商品毛利**預設按兩期毛利差由低到高；可改排序、反向、品類／SKU 搜尋或只看本期負毛利。未觀察銷售列與明確零分開，不稱為新品／停售；未確認完整性或缺成本仍未知。新「下載商品比較 CSV」含兩期、差額、來源及篩選；原商品明細 CSV 保留本期口徑。
4. **情境門檻／敏感度**：完成有效單通路方案後展開衍生分析。分別顯示貢獻為零、維持原 baseline 兩個銷量門檻；近似百分比附精確分數。三個銷量假設皆明填，其他四項採同一方案，逐一重算；不是預測、成功率或最適預算。Golden 履約單位成本 −10%、其餘0時，維持原貢獻門檻約 −2.527075812274%；另投入20時約 +1.083032490975%。
5. **會議輸出**：回總覽選擇各通路的可用方案修訂後下載主管 Markdown、通路寬表，或列印摘要。會議稿含固定範圍、截至日、人工決策狀態、所選方案假設與行動的負責人／期限／停止條件；目前摘要數值的 facts／來源置於主管 Markdown 附錄；歷史行動的完整 facts、版本與綁定範圍見完整決策輸出。長通路／行動清單可續頁，不截斷。完整決策三格式及完整工作區備份仍各有用途。

會議門檻、各通路選定方案修訂與會議設定已納入完整工作區備份，須主動保存；三組敏感度輸入仍為頁內暫存，切換 context 或刷新可能重置。歷史 context 保留標準輸入，備份按來源 hash 去重，64 MiB 上限包含這些來源；若超限會拒絕保存、不截斷資料。最大資料量與大量行動的瀏覽器效能尚未驗收。

> **R7 註記**：R5 起三組敏感度輸入納入方案、決策匯出與備份 v4，不再是頁內暫存。R6 起會議改為獨立分頁「會議紀錄」，可結束會議並凍結成紀錄（備份 v4 的 `meeting_history`，上限 100 筆）；同意本機保存後可自動保存。

## 匯入精靈（Revamp v2 R3，取代下方 M3 單頁表單）

按「匯入資料」進入四步精靈：**選檔**（拖放或選取三份 CSV，檔名含 sales／cost／ad 自動歸位；每格顯示列數、欄數、編碼，超過 5 MiB／50,000 列直接提示）→ **對照欄位**（欄名全符合標準時自動完成；否則依「標準欄名 → 上次的對照 → 來源預設 → 中文欄名字典」預選，藍色「請確認」要按「確認對照」才算數）→ **口徑與期間**（必選未稅／含稅／我不確定；含稅時逐列 ÷ 1.05 ROUND_HALF_UP 換算成未稅，可改稅率與欄位；期間、通路、資料截至日由檔案提議直接填入，按「我確認口徑與期間，開始檢核」同時確認銷售完整與金額口徑）→ **檢核與套用**（白話問題清單、前處理摘要、對帳表，按「套用這批資料」取代目前資料）。含稅換算的原值在「怎麼算的」抽屜每列以「~~含稅原值~~ → 未稅換算值」顯示，並寫進分析 CSV、主管摘要 Markdown 與資料頁「本次匯入的前處理」。訂單明細請先用 `scripts/aggregate_orders.py` 彙總（見 `docs/ORDER_AGGREGATION.md`）；範本與含三列示範的範例檔在下載選單與第 1 步「沒有檔案？」。舊的單頁表單已於 R4 移除。規格：`docs/revamp/04_IMPORT_TW.md`。

## M3 本機 CSV 匯入（R3 前的單頁表單，保留作歷史說明）

1. 按「匯入標準 CSV」，分別選取商品銷售、通路費用、廣告支出三份檔案。實際檔名可以不同，檔案角色必須選對；只支援 UTF-8／UTF-8 BOM、逗號分隔，每檔最多 5 MiB／50,000 筆。超限或解析錯誤會拒絕，不截斷資料。
2. 手動填寫資料集名稱、資料截至日、涵蓋範圍、比較模式與前期早於本期的兩期、銷售通路與完整性確認；也可以選讀 manifest JSON 帶入表單後核對。固定支援 TWD 與 Asia/Taipei，所有本機匯入標記為使用者提供資料。
3. 明確勾選「我已確認未稅商品金額與費用口徑」。JSON 不能代替本次確認；未確認就不會提交資料。銷售完整性確認與金額口徑確認是不同事項，未確認完整性時相關總計保留未知。
4. 檢查各檔前 10 列、完整列數與欄位對照。系統只按完全相同的標準欄名預選；非標準欄名須逐欄選擇來源並確認，不猜測收入或成本含義。未使用欄位也須確認忽略，其內容不進入分析資料集。預覽只顯示前 10 列，檢核與計算仍使用全部列。
5. 按「檢核匯入資料」。問題清單附實際檔名、標準角色、欄位及原始實體 CSV 行號；非標準欄位對照與跨行文字不改寫來源行號。blocking 不提供提交；partial 可保留已知收入，但相關成本、貢獻及圖表點位為 null，缺值不補零。
6. 確認結果後按「套用匯入資料」，才會取代工作區。新檔、對照或設定一有變更就須重新檢核；取消、錯誤或超限不取代先前成功資料。套用後可在資料工作區、問題清單及公式與來源檢查實際檔名、來源欄名／標準欄名及原始行號。

本機互動分析另有技術上限：前後期各自向上取整的七日區間數合計最多 **1,040 個**，每次最多 **1,000 個通路**。末段不足七日也計一個區間。超限會 blocking／拒絕套用範圍，保留舊資料；不截斷、不改資料完整性或 contribution-v1 金額口徑。這是避免瀏覽器展開過大資料的限制，不是已測得的效能保證；詳見 [決策紀錄](DECISIONS.md)。

空白品類不會產生無作用的下拉選項，也不補成其他品類；其商品仍保留於全部商品明細，可用 SKU 搜尋找到。

原始匯入內容、草稿與計算結果預設只留在目前分頁記憶體，不寫 localStorage、sessionStorage 或資料庫，不跨分頁共享；只有使用者在「存在這台電腦？」提示或儲存選單明確同意後，才會寫入這台電腦瀏覽器的 IndexedDB（可隨時「刪除本機資料」）。只有另行預覽並同意 M5 AI 操作時，明列的匿名彙總 facts 才會經本機伺服器傳至 OpenAI；原始 CSV 不傳送。重新整理、關閉分頁或清空工作區後，須重新匯入或手動恢復已保存的完整工作區。開發模式的 Fast Refresh 也可能清空。請自行保留原始三份 CSV。

## 安全 CSV 與設定下載

- 「下載目前分析 CSV」使用畫面已套用的期間與通路快照，包含前後期合計、通路、週彙總與九項橋接。編輯日期但尚未套用時，仍匯出明確標示的已套用範圍。
- 「下載商品明細 CSV」只匯出當下品類／SKU 搜尋後的可見商品列，標記品類與查詢條件；不產生 SKU 廣告、通路費用或行銷後貢獻。空結果只保留選取範圍與 `NO_MATCHING_PRODUCTS`，不偽造零總計。
- 「下載問題清單 CSV」保留嚴重程度、實際檔名、標準角色、欄位、行號及原因。缺列沒有實體行號，不虛構行號。
- 分析／商品 CSV 含資料集與篩選 SHA-256、指標版本、截至日、期間、scope、來源 references 與限制。金額、長小數及超過 Number 安全整數範圍的數值保留精確字串；null 為空儲存格，旁列 `reason_codes`。比率輸出原始分子／分母值，`unit=ratio`，不是乘以 100 後的百分比。
- CSV 使用 UTF-8 BOM、逗號及 CRLF；引號、逗號和換行正確包覆。所有不可信文字欄，包括 SKU、品類、資料集名稱與檔名，若以前導 `= + - @`、空白、控制字元或 BOM 等開頭，會加單引號防止公式解讀。只有通過嚴格十進位驗證的 typed numeric 值可作數值輸出；合法負金額不加文字逃逸，不轉成零。
- 「下載資料集設定 JSON」只有原始資料集的 manifest 設定，**不是資料備份**，不包含另外套用的期間／通路篩選、三份原始 CSV、完整快照或 UI 草稿；不能單靠它復原工作區。匯出只由瀏覽器產生本機下載，不經伺服器。

上述分析、商品與問題 CSV 為 M3 功能；M4 另有以下決策工作稿三格式匯出。M6 已重跑本機匯出驗收；另已完成公開示範的雲端 build、HTTP 與瀏覽器 smoke checks。Live 模型品質仍未驗收；未把部署 smoke checks 當作全套線上 E2E。

## 用本機替代資料重現匯入

`tests/fixtures/alternative/` 是另一組合成資料，不在示範 endpoint 白名單內；必須經真正的檔案選取流程匯入。

1. 選取該資料夾的 `sales_daily.csv`、`channel_costs_daily.csv`、`ad_spend_daily.csv`，可讀取同資料夾的 `manifest.json`，再手動確認金額口徑並檢核、套用。
2. 或不選 JSON：資料截至日填 `2026-09-05`，coverage 填 `2026-09-01` 至 `2026-09-04`，前期填 `2026-09-01` 至 `2026-09-02`，本期填 `2026-09-03` 至 `2026-09-04`，通路各一行填 DTC、MARKETPLACE；填入資料集名稱並確認完整性與口徑。
3. 固定對帳答案在該資料夾 `expected.json`：本期商品淨營收 **600.00**、行銷後貢獻 **10.00**；DTC 貢獻 **40.00**、MARKETPLACE **-30.00**；橋接合計 **-130.00**。商品 `-TEST()` 毛利 **-100.00**，匯出時 SKU 當安全文字、毛利保留負數。
4. 再匯入原有 `fixtures/errors/` 子資料夾以檢查重複鍵、混幣、缺成本或缺廣告日；不修改錯誤資料去迎合成功結果。這些都是合成驗收資料，非真實業績。

可只執行 M3 單元／匯出測試或匯入瀏覽器情境：

```sh
npm test -- --run tests/import.test.ts tests/export.test.ts tests/analysis-limits.test.ts
npm run test:e2e -- tests/e2e/import.spec.ts
```

命令與操作是重現方式，實際完成的驗收範圍仍以 STATUS 與 `verification/m3-*` 記錄為準。

## M4 情境試算與行動工作稿

1. 載入或匯入資料後，在共用通路篩選選取**單一通路**，確認已套用的本期期間，再開啟「情境試算」。情境使用完整商品集合的本期通路基準，不接受 SKU／品類作為貢獻範圍；可點基準金額查公式與來源。
2. 核對基準適用性：資料完整且銷售 coverage 已確認，折扣前收入及淨營收均大於零，折扣率與入帳退款金額比介於 0（含）至 1（不含），各項商品成本與費用非負。缺資料、純退款或負費用回沖等會停用試算並顯示原因；實際金額診斷仍保留。全部通路畫面只列各通路方案，不建立混合通路基準。基準行銷後貢獻為負不會單獨使模型停用。
3. 建立目前通路的方案工作區，再按「新增方案」；每個工作輪次、期間與單一通路最多三個各自命名的方案。**五個數值初始全部空白**：售出量變化（相對 %）、折扣率變化（百分點）、單位履約成本變化（相對 %）、總廣告支出變化（相對 %）、一次性投入（TWD）。銷量不可由廣告調整推算；`0` 也須明確輸入。使用者可按「填入零變動假設」一次填入五個 `0`，但此按鈕不會替使用者勾選接受假設。
4. 閱讀畫面完整列出的固定假設，再勾選「我接受此方案的全部固定假設」。模型固定平均牌價與商品組合、按入帳日退款金額比、每售出量淨成本及退回結構；平台／金流費按原有效淨營收費率、履約費按量及單位成本、其他變動費按量、廣告按獨立輸入、一次性投入扣一次。入帳退款比不是 cohort 退貨機率；實際最低收費、階梯費率或其他計價不符合模型時，應保留未接受狀態，顯示「此方案暫不適用」。
5. 按「計算方案」後查看條件行銷後貢獻、相對基準差額及全部費用明細。每個方案均從同一不可變基準重算，不能沿用前一方案結果，也不能把三方案差額相加。修改名稱、數值或接受狀態後，舊結果立即撤下，須重新計算；未填銷量不提供增益。
6. 開啟「行動摘要」，按「新增行動」，最多三項置頂，工作項目總數不限；不需先接受情境模型假設。可從診斷按「建立行動草稿」，帶入恰好支持該診斷的證據，或手動新增。問題、具體動作、負責角色、驗證指標、期限、停止條件、所需額外資料七欄用於工作稿完整性；證據確認另行處理，只需選擇至少一項原快照的 fact ID 並核對引用，不要求先填滿管理欄位。期限必須是真實的 `YYYY-MM-DD` 日期；無需補充資料時可明填「無」。按「確認行動與證據」，再用「提高優先序」人工調整順序。引用選擇改變後須重新核對；管理文字、負責人、期限或進度修改保留證據確認。執行狀態為未開始、進行中、受阻、已完成，進度備註最多 2,000 字。證據已確認不代表人工文字成立、因果關係或成果已達成。
7. 使用「下載決策 Markdown」「下載決策 CSV」或「下載決策 JSON」保存本機工作稿。三種格式都含基準、各方案輸入、完整固定假設與公式、條件結果、取分調整、人工行動、fact IDs、來源及快照資料。草稿可匯出，未計算結果保留 null／空值及原因，不補成零。所有下載均在瀏覽器本機產生，不上傳、不呼叫模型。

售出量範圍為 −90% 至 +100%，單位履約成本 −100% 至 +100%，廣告支出 −100% 至 +200%；新折扣率必須在 [0, 1)，一次性投入非負且最多兩位小數。這些是輸入防呆界限，不是業務可能性的估計。折扣率 10% 加 2 百分點等於 12%，不是 10.2%。

### 計算與固定對帳案例

情境引擎沿用 `docs/SCENARIOS.md` 的閉合模型，以高精度 Decimal 計算，不先將中間值取分。為避免循環小數相減影響邊界，程式採代數等價式，例如 `N′=(G′−D′)×N/(G−D)`、`P′=(G′−D′)×P/(G−D)`；沒有改變費率或財務口徑。最後輸出金額才採兩位小數 `ROUND_HALF_UP`。逐項顯示金額可能因取分而差一分，另列 `rounding_adjustment`，使 `G′−D′−R′−C′−P′−Q′−F′−O′−A′−K＋rounding_adjustment` 精確加回顯示的條件貢獻；它不是另一筆成本或收益。

以下皆為合成資料的固定驗收答案：

| Golden 本期通路 | 明示假設 v／δ／f／a／K | 基準貢獻 | 條件貢獻 | 相對基準差額 | 取分調整 |
|---|---|---:|---:|---:|---:|
| DTC | 0%／0 百分點／−10%／0%／0 | 270.00 | 284.00 | 14.00 | 0.00 |
| DTC | 0%／0 百分點／−10%／0%／20 | 270.00 | 264.00 | −6.00 | 0.00 |
| MARKETPLACE | 20%／2 百分點／−10%／−20%／20 | −15.00 | 19.70 | 34.70 | −0.01 |

MARKETPLACE 案例的逐項取分金額相減為 19.71，加入 −0.01 取分調整後為 19.70。這些條件結果不是已實現效益或營收預測。零變動且投入為零應回到原基準。

### 快照過期與重新確認

每次成功重新載入／匯入資料，或真正套用不同期間／比較模式，都建立新的工作輪次。舊通路方案保留歷史，即使切回相同資料或期間也不復活。**只切通路或頁面不換輪次**：DTC、MARKETPLACE 各自保有最多三個可繼續編輯的方案；全部通路只列清單，沒有混合通路 baseline。編輯計算過的方案立即撤下結果並增加修訂，會議所引舊版仍可查核。

在歷史方案按「複製名稱到目前基準（清空假設）」才採用新基準：五個數值與接受假設勾選均清空，必須重新輸入。敏感度三組輸入不持久化；切換 context 不沿用別的通路輸入。行動原引用不受方案重建影響，管理欄位一直可編輯。v1／v2 的既有 stale 標記遷移時仍保留，不倒推解除歷史狀態。

> **R7 註記**：R5 起敏感度三組輸入隨方案保存（備份 v4 欄位加法），方案版本號只在計算成功時遞增。

### 固定會議稿與共用替換保護

- 經營總覽的會議設定保存一份會議稿。先核對固定資料、前後期與通路；視圖不同時有提示。只有按「以目前資料與範圍更新會議來源」才換來源並清空所選方案／決議；名稱、備註、門檻保留。
- 每通路選一個已計算修訂，並列原基準、條件結果、差額與五項假設，各通路改善差額不相加。方案後續修改或行動重綁只提示舊引用，須另行選用新版或更新會議行動引用。資料／範圍／引用改動後決議回草稿。
- 行動工作台與會議共用最多三項有序置頂，主摘要只列這些；其他工作項目放附錄。沒有置頂不自動選三項。Markdown、畫面與列印共用相同投影。
- 決議可選草稿、採用、補資料再議、不採用，僅記錄人工決定。目標版本為 null，沒有目標引擎，也不執行外部操作。
- 載入示範／驗證、新 CSV 套用、備份恢復、清空都經相同未保存檢查，可「先儲存」「不儲存並繼續」「取消」。下載須另確認已保存；本機保存須明確同意且成功才繼續。取消保留目前資料及匯入／恢復預覽；儲存失敗不替換。

> **R7 註記**：R6 起會議稿搬到「會議紀錄」分頁（總覽只留一行入口），「以目前資料與範圍更新會議來源」現為「用目前資料更新會議」；另新增「結束會議」凍結紀錄與上次會議比較。

決策快照使用 `schema_version=decision-v1`、`scenario_version=scenario-v1`、`metric_version=contribution-v1`，保存 dataset ID／hash、filter hash、截至日、revision、snapshot signature、期間、scope、TWD、Asia/Taipei、金額口徑、來源檔名及 fact IDs。JSON 是可讀的決策紀錄，**不是三份 CSV 原檔備份，也沒有匯回並恢復工作區的功能**。CSV 延用 typed text／number／null 防公式注入；負金額維持數值，空值另列原因。Markdown 對使用者文字、檔名及其他不可信內容作 HTML／Markdown 逃逸，不產生使用者控制的連結。

只驗收 M4 引擎、狀態與匯出可執行：

```sh
npm test -- --run tests/scenarios.test.ts tests/decision.test.ts
```

RED／GREEN 過程見 `verification/m4-scenarios-red.txt` 與 `verification/m4-decision-*.txt`；整套測試和瀏覽器操作的最終結果以 STATUS 為準。

## M5 選配 AI 解釋

### 不設定金鑰也能驗收

載入 Golden 並開啟「通路診斷」，既有內容明標「規則診斷」。下方「選配的 AI 解釋」顯示實際可用狀態；未設定時傳送按鈕停用，不用預寫文字冒充 AI。原本的財務計算、來源證據、情境與人工行動仍可操作。只查看預覽不會呼叫模型；產品沒有 mock 模式或假 AI 開關。

### 本機選配設定

若要自行測試真實 API，在不存在 `.env.local` 時複製 `.env.example`，於自己的編輯器填寫 server-side 環境變數，不將金鑰貼進對話或 UI。範本如下，金鑰與模型刻意留空：

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=
ENABLE_LIVE_AI=false
APP_MODE=LOCAL
PUBLIC_DEMO=false
```

選擇帳戶當時可用、支援 Structured Outputs 的模型填入 `OPENAI_MODEL`；程式沒有預設模型。確定要使用 API 後自行將 `ENABLE_LIVE_AI` 改成 `true`，重新啟動本機伺服器。API 使用可能產生帳戶費用；Codex 使用與這個 App 的 API 使用分開。沒有設定費率時只列實際 token metadata，不捏造台幣成本。本輪未提供真實金鑰，**live 呼叫與帳戶模型相容性未執行**。

金鑰只在標記 `server-only` 的模組讀取，不使用 `NEXT_PUBLIC_`，不出現在頁面、回應或日誌。`APP_MODE=PUBLIC_DEMO` 或 `PUBLIC_DEMO=true` 會在 server 讀取 POST body／建立 provider 之前強制禁止 live，即使另設 `ENABLE_LIVE_AI=true` 也不開放。API 限本機 host；POST 另要求同 origin。這是本機的保守入口檢查，**不是公開服務的認證、rate limit 或使用預算機制**；請勿把啟用 live AI 的本機服務暴露到網際網路。已部署的公開示範在 server 強制關閉 live AI，且未設定 OpenAI key。

### 預覽、同意與追溯

1. 在通路診斷查看完整 JSON 預覽與接收端 OpenAI API。傳送資料為 `snapshot` 加程式產生的 `observation_catalog`，另附固定用途／輸出規則；本機 API 的同意 envelope 另有預覽。
2. 每次只含目前選取通路**合計**的前期／本期各 20 個指標，共 40 個 facts。數值沿用核心精確字串或 null；缺漏原因、期間、指標版本、截至日及來源角色／筆數保留。通路用 C01 等代號，facts 用 F001 等代號；真實通路名、資料集名、SKU、品類、實際檔名、原始行號與原始 CSV 不送給模型。可展開「僅本機的別名與來源對照」核對；SKU 分析仍在本機商品頁。
3. 確認欄位與數值後，勾選「我已檢查預覽，並同意將這份彙總資料傳送至 OpenAI」，再按傳送。供應商可能有資料保留政策；雖請求指定 `store:false`，不能承諾供應商絕不儲存。資料／期間／通路變更、同 hash 重載或切回原範圍都撤銷同意及舊回應，須重新確認；取消與較慢的舊回應不可覆寫目前範圍。
4. 只有實際 provider 完成且 server／client 均驗證通過才顯示「即時 AI」。結果分為資料已顯示、待驗證假說、候選行動與限制，並列模型、提示版本、時間、嘗試次數、延遲及可取得的 token 用量。點 fact 代號可在本機查看對應原始來源；建議不自動建立或執行人工行動。
5. 拒絕、截斷、逾時、限流、schema／語意錯誤或取消時，顯示「AI 未完成」與安全原因，保留規則診斷。不把錯誤訊息或未驗證模型文字當結果。

### 限制與本機重現

觀察必須原樣選自此快照的程式目錄，指標、期間、方向及引用集合逐項驗證。模型只能在其餘欄位提供待驗證假說與人工作業建議；不得自行計算金額、補零、自由產生數字／百分比、確定因果、信心／成功率、保證收益，或索取憑證。數值 placeholders 只可出現在原樣選用的 observation；其餘假說、建議、角色、驗證指標、停止條件及限制欄僅描述質性核查，不接受數值 placeholder，避免把合法數值重新標成另一期間、範圍或公司淨利。提示版本為 `profitlens-insights-v3`；`ai-snapshot-v2` 明列比較模式及兩期天數，40 facts 仍是期間實際合計；partial 優先補資料。此設計只拒絕可驗證的不一致與已知惡意主張，**不能證明任意自然語言語義都正確**；live 品質、人工語義驗收、人工修改量及處理時間仍待量測。

AI 邊界另限制每個數值字串最多 256 字元、本機 POST body 最多 64 KiB、輸出最多 4,096 tokens、每次 provider 嘗試最多 15 秒。SDK 自動重試關閉；僅 schema／semantic 失敗最多再嘗試一次，其餘故障直接降級。超限只停用選配 AI，不截斷 facts 或改變 M1／M4 財務口徑。日誌僅含 model、prompt version、attempts、latency、usage、status／error code 等明列 metadata，不記請求／回應內容、facts 或金鑰。

`npm run test:e2e` 的測試伺服器強制停用 live，並在建置環境放入明顯的假金鑰 canary。完成後可執行 `node scripts/verify-ai-security.mjs`：掃描 `.next/static`，再於本機 3205 以正式產物檢查 PUBLIC_DEMO、無 key、停用及未同意封鎖。這些檢查不發送模型請求，不能替代 live 驗收；請保持 3205 未被其他服務使用。結果寫入 `verification/m6-security.json`；須搭配同一 canary 的新建置，不可把舊 build 掃描當成新版本證明。

```sh
npm test -- --run tests/ai-grounding.test.ts tests/ai-config.test.ts tests/ai-provider.test.ts tests/ai-service.test.ts tests/ai-route.test.ts tests/ai-client.test.ts
npm run test:e2e -- tests/e2e/ai.spec.ts
```

上述回應與攻防測試使用合成資料、注入的 mock provider／transport 或 Playwright mock route；MOCK 標籤與驗收紀錄必須保留，不證明真的呼叫模型。固定語意案例、RED／GREEN、實際命令與未執行項目見 STATUS 及 `verification/m5-*`，不要把指令列在這裡當作已通過。下一步的真實 API 測試須另明確記錄模型、prompt version、時間與真實結果。

實作依 [OpenAI Structured Outputs 文件](https://developers.openai.com/api/docs/guides/structured-outputs) 使用 Responses `text.format`、JSON Schema 與 `strict:true`；依 [Responses 遷移文件](https://developers.openai.com/api/docs/guides/migrate-to-responses) 明確設 `store:false`。原 `spec/insight-output.schema.json` 保持不變；應用層另外驗證長度、事實支持與快照。

## M1 核心使用方式

入口為 `src/domain/index.ts`，不依賴 React、Next.js、檔案系統或模型 API。呼叫端先提供已讀取的 manifest 物件及三份 CSV 字串／UTF-8 bytes：

```ts
import { validateDataset, analyzeDataset, analyzeProducts } from "@/domain";

const validation = validateDataset({
  manifest,
  files: {
    "sales_daily.csv": salesCsv,
    "channel_costs_daily.csv": costsCsv,
    "ad_spend_daily.csv": adsCsv,
  },
});

// blocking 時 dataset 為 null；呼叫端保留先前成功的資料集。
if (validation.dataset) {
  const report = analyzeDataset(validation.dataset);
  const products = analyzeProducts(validation.dataset, {
    period: validation.dataset.manifest.current_period,
    channels: ["DTC"],
    sku: "A",
  });
  // report.current.metrics.contribution_after_marketing
  // products.metrics.gross_profit（商品 API 不含通路費用、廣告或貢獻）
}
```

- `classification` 為 `valid`／`partial`／`blocking`；問題含檔名、欄位、原始 CSV 行號、reason code。缺列沒有實體行號，回傳 `line: null` 及日期／通路或範圍。
- 金額以 BigInt 整數分運算，輸出指標為兩位小數字串或 `null`，並帶 `reason_codes`。比率用 decimal.js，回傳小數比例字串至 12 位，採 HALF_UP；`0.10` 代表 10%。`percentagePointChange` 回傳百分點；10% → 12.5% 為 `2.500000000000`。
- Dataset 與 totals 內含 BigInt，不能直接 `JSON.stringify` 整份結果；metrics／facts 是字串格式。M3 提供 typed CSV 與 manifest JSON；M4 的 `createDecisionSession` 另捕捉可序列化基準、metrics facts 與快照 metadata，再由決策匯出函式輸出，不直接序列化原始 Dataset。
- `analyzeDataset` 接受完整通路集合及符合 `same_days` 或 `calendar_months` 的期間；前期早於本期，並在 coverage／data_as_of 內。空、重複、未知通路及 SKU／category 參數會被拒絕；商品篩選須使用 `analyzeProducts`。
- 缺漏只傳播至依賴該金額的指標。若來源尚未確認銷售 coverage，完整範圍的收入與成本合計保守回傳未知，不把已知列偽裝成完整 headline；原始已知列仍保留。
- 未定義 CSV 欄位會先 blocking 並列於 `unknownColumns`；呼叫端取得確認後以 `confirmedUnknownColumns` 列出允許忽略的欄名。忽略後不保留該欄資料。Manifest 的額外 metadata 會剔除，必要欄位仍按契約驗證。
- 每檔最多 5 MiB／50,000 筆資料列；不截斷、不執行文字公式。超過 50,000 個日 × 通路組合時不展開巨大空矩陣，`daily_complete: false` 表示 daily 僅列實際觀察到的組合；完整摘要仍檢查缺漏，費用不足時為 null。
- 八項規則各附 scope、fact IDs、來源與限制，事實、待驗證假說及建議分開。排序使用精確的已觀察金額，缺資料任務優先；不產生預估收益。

## 產品與資料邊界

- 第一版採 TWD 未稅金額、Asia/Taipei 入帳日期、單一企業；前期早於本期，按相同天數或各一完整自然月比較。
- 商品淨營收＝折扣前收入－折扣－入帳退款；商品毛利再扣來源已入帳的淨銷貨成本；行銷前貢獻再扣通路變動費用；行銷後貢獻再扣廣告支出。缺值保留未知，不自動補零或補成本。
- 金額核心使用可測試的精確純函式。銷售先彙總成日 × 通路，再合併費用，避免多 SKU 重複扣費。
- 通路廣告費不分攤給 SKU；商品只呈現商品毛利。退款按入帳日扣除，不據退款自行沖回成本。
- 金額差異拆解必須精確對帳，不能宣稱因果；方案比較必須顯示假設，不能冒稱預測。比率與缺漏傳播詳見 `docs/METRICS.md`。
- 原始匯入資料預設只留於使用者瀏覽器記憶體；可主動保存本機，不建立伺服器全域使用者資料或遠端持久化。M5 選配 AI 僅傳經預覽同意的匿名彙總 facts，原始 CSV、SKU、名稱與來源行號不傳送。

> **R7 註記**：計算口徑仍是 TWD 未稅；R3 起含稅報表可在匯入時由使用者選「含稅」後逐列換算成未稅，原值與換算值保留在「怎麼算的」與匯出。R4 起新增售出件數等輔助指標（`assist-kpi-v1`，與 `contribution-v1` 分開版本）。「商品淨營收／行銷前貢獻／行銷後貢獻」現稱「淨營收／通路貢獻／扣廣告後貢獻」。R6 起同意本機保存後可自動保存。

M1 計算與驗證、M2／M3 工作台及匯入、M4 情境與人工決策工作稿、M5 選配 AI 解釋均已實作。M6 本機獨立驗收已完成，另已部署公開合成示範。M5 live 呼叫及實際模型品質尚未驗收；沒有登入或資料庫。

## 目錄

| 位置 | 用途與目前狀態 |
|---|---|
| `src/app/` | App Router、繁體中文首頁、全域樣式 |
| `src/domain/` | 型別、金額、日期、驗證、日通路彙總、metrics、bridge、rules、分析入口與純情境引擎 |
| `src/lib/csv.ts` | 嚴格 CSV 解析與原始行號；不讀寫檔案 |
| `src/application/` | 快照、匯入、精確呈現、決策狀態與安全匯出、AI 匿名快照、同意綁定與取消／過期回應防護 |
| `src/components/` | 工作台、匯入、診斷、情境與人工行動、AI 預覽／同意／解釋、問題及來源對話框 |
| `src/ai/`、`src/app/api/insights/` | 嚴格契約、觀察目錄、語意驗證、server-only OpenAI provider、有限重試與安全降級 |
| `tests/`、`playwright.config.ts` | 單元、整合及 4 尺寸 E2E；AI 自動化回應明標 MOCK，沒有產品 mock 模式 |
| `docs/`、`prompts/` | 原有產品規格與逐關卡任務 |
| `fixtures/`、`templates/`、`spec/` | 原有合成資料、範本與 schema，保持原樣 |
| `verification/` | 各階段實際命令、RED／GREEN、原檔比對、browser logs、截圖；當輪完成範圍見 STATUS |

> **R7 註記**：Revamp v2 新增 `src/i18n/`（使用者可見文字單一來源 `labels.zh-TW.ts`）；`src/components/import-wizard/` 與 `src/application/{import-wizard,tax-basis,mapping-memory}.ts`（R3 匯入精靈、含稅換算、對照記憶）；`src/application/source-presets/`（九個台灣來源預設）；`src/application/{assist-kpi,period-presets,targets,events}.ts`（R4）；`src/application/{diagnosis-group,scenario-presets}.ts` 與 `src/components/diagnosis-list.tsx`（R5）；`src/application/{meeting,excel-export,pptx-export,auto-save}.ts` 與 `src/components/meeting-page.tsx`（R6）；`scripts/aggregate_orders.py` 與 `scripts/rules/`（訂單明細彙總）；`templates/examples/`（含三列示範的範例檔）；`docs/revamp/`（改版規格）；`docs/images/`（README 截圖）。

`scripts/verify_fixtures.py` 是準備包驗證腳本，會重寫部分驗證產物，不能替代 App 測試；本輪保留原資料，不重跑資料生成。`fixtures/errors` 是故意不良資料，不補值、不清洗成成功案例。

## 依賴與安全

沿用 M0 的 Next.js App Router、React、TypeScript、Tailwind CSS、ESLint 與 Vitest；M1 僅新增 decimal.js 10.6.0 與 Zod 4.6.5，先查核官方 registry 再精確鎖定。M2 精確新增 Recharts 3.10.1、Playwright Test 1.63.0，沒有修改 M1 核心依賴。CSV 使用有邊界測試的純 TypeScript parser。Vitest 4.1.11 支援本輪 Node 25；M0 查詢時的 Vitest 5.0.2 engines 不含 Node 25，因此未升級。

M3／M4 沒有新增依賴；M5 固定新增官方 SDK `openai@7.25.0`，`package.json` 與 lockfile 鎖定版本，既有財務依賴不變。M3 於 2026-10-01 已實際執行 `npm ci`：安裝 441 個套件、audit 442 個套件，當次回報 0 vulnerabilities；這不代表未來不會出現弱點，也不表示 M4 另重跑安裝。

> **R7 註記**：R6 依決策 D4＝A 精確新增 `xlsx@0.18.5` 與 `pptxgenjs@4.0.1`（只以動態 import 載入、只用寫出 API）；`npm audit` 對 `xlsx` 與 `pptxgenjs` 依賴的 `image-size` 回報 3 個 high，都在未使用的讀取／圖片解析路徑，沒有可升級的修正版，記於 [DECISIONS](DECISIONS.md)（2026-10-03 R6）。R7 未新增依賴。

相容性限制：Next.js 使用的 `eslint-plugin-react@7.37.5` peer 範圍尚未接受 ESLint 10，因此鎖定 ESLint 9.39.5；npm 已將此版本標為不再支援，待上游相容後需升級。TypeScript 5.9.3 也保留在目前 TypeScript ESLint parser 支援的版本範圍內。

配置參考：[Next.js 安裝](https://nextjs.org/docs/app/getting-started/installation)、[ESLint](https://nextjs.org/docs/app/api-reference/config/eslint)、[Vitest](https://nextjs.org/docs/app/guides/testing/vitest)、[Tailwind CSS](https://tailwindcss.com/docs/installation/framework-guides/nextjs)。

`.gitignore` 已排除 `.env*`（保留 `.env.example`）、`uploads/`、`data/private/`、`reports/private/`、建置產物與測試產物。真實資料不得放入 `public/` 或公開 repo；API key 不使用 `NEXT_PUBLIC_` 前綴。目前 GitHub 儲存庫為私人；Vercel 只提供公開合成示範與瀏覽器記憶體工作區。沒有登入或資料庫。

`next.config.ts` 設定 `agentRules: false`，避免新版 Next.js 在啟動開發伺服器時自動追加內容到原有 `AGENTS.md`；原專案指示保持不變。

M0–M6 與前三批管理者改善已完成本機及 mock 驗收，並依使用者指示完成 GitHub／Vercel 發布。目前本機新增 Review v2 A 批，尚未推送或部署；live 模型呼叫、模型品質、人工修改量與處理時間均未執行／未量測，不宣稱商業成效。

> **R7 註記**：Review v2 A 批已於 2026-10-02 推送並部署（見 [RELEASES](RELEASES.md)）；之後的改版以 Revamp v2（R0–R7）在 `revamp/v2` 分支進行，見本檔開頭的批次紀錄。

## M6 驗收與公開示範邊界

- [完整驗收報告](../verification/app-acceptance.md) 逐列涵蓋 C01–C18、U01–U11、S01–S07、A01–A08、R01–R05。初始失敗與修復後結果分列；fixtures、golden 答案、財務口徑及 lockfile 保持不變。
- 人工透過實際檔案選取器匯入 alternative，檢查診斷／來源，明填 DTC v=0、δ=0、f=−50%、a=0、K=3，得到條件貢獻 **44.00**（baseline **40.00**）。這是合成資料的閉合公式驗收，不是已實現改善。再建立七欄行動與證據並操作三種匯出。
- 1440／768／390px 均由實際瀏覽器操作與目視截圖確認；390px 表格可方向鍵橫捲。內建瀏覽器的 download 事件等候逾時，未人工讀回下載位元；Playwright 已實際下載並核對 Markdown／CSV／JSON。不可將兩者混稱。
- 全新暫存副本的固定 lockfile 離線 `npm ci`、typecheck、無 key dev 啟動成功。該次使用已存在的 registry cache，沒有做最新漏洞 audit；npm 提示固定 eslint 版本已 deprecated，尚未升級，不宣稱依賴零漏洞。
- 尚未實測 Safari／Firefox、原生手機、螢幕閱讀器、最大量效能與真實模型品質。自然語言檢核只涵蓋可驗證引用及已知攻防案例，仍須人工核查。

公開合成示範前，確認包內沒有真實 CSV、私人截圖或環境檔；後端設 `APP_MODE=PUBLIC_DEMO`（或 `PUBLIC_DEMO=true`）且 `ENABLE_LIVE_AI=false`，公開環境不提供 API key。重新 build 並檢查前端資源與 logs，在實際示範 host 重測 `/api/insights` POST 403。2026-10-01 已在實際公開示範 host 重測 GET 關閉狀態及 POST 403／PUBLIC_DEMO，並核對所有五個白名單資料集的 manifest 與三 CSV 原始位元。Local Host／Origin 限制不是公開服務認證；目前不支援公開 live AI，沒有登入、rate limit 或費用預算控制。GitHub 仍為私人；改為公開 repo、開啟 live AI 或新增付費服務需另行授權。

M4 決策匯出仍不是可還原備份；「完整工作區備份」才支援重驗恢復。正式平台 API、多人共享／雲端同步、SKU 廣告歸因、完整公司淨利與自動預測均不支援。本輪於 Review v2 A 批停止，後續 B–D 批尚未執行。

> **R7 註記**：其後的改版以 Revamp v2（R0–R7）進行，見本檔開頭的批次紀錄與 [STATUS](STATUS.md)。
