# M6 AI 與安全獨立審查

審查日期：2026-10-01（Asia/Taipei）。本紀錄由獨立安全審查子工作產生；只使用合成 fixture 與注入的 mock transport，**未呼叫真實模型、未傳送使用者資料、未啟動 HTTP server、未執行 Playwright 或公開部署**。正式建置、HTTP、瀏覽器與兩視窗驗收由 M6 主驗收工作另行記錄。

## 規格與範圍

已讀 AGENTS.md、PRD、完整 ACCEPTANCE、DATA_CONTRACT、METRICS、AI_CONTRACT、ARCHITECTURE、M6_REVIEW 與 STATUS 的目前 M5 結果。未以 M5 綠燈當作本輪通過。重新檢查 `src/ai`、兩個 API routes、AI snapshot/client、CSV／決策匯出、React 輸入輸出與 state。

## 已重現並修正的問題

初始 `tests/m6-security-audit.test.ts` 真正執行 8 案且 8 案失敗，完整原始 RED 留在 `m6-security-red.txt`；不是收集失敗、不是改 golden 值。

| 問題 | 修正前可重現行為 | 影響／修復 |
|---|---|---|
| M6-AI-01：合法數值引用可被自由文字重新標記 | 保留合法本期行銷後貢獻 F033 的 observation 與 fact_ids，只在 verification_metric 改成「前期」「其他通路」「商品淨營收」或「公司淨利」，validator 仍接受。client 會回傳 live 且顯示「本期公司淨利為 TWD 255.00」。 | 違反 A02、AI period/scope 支持及非公司淨利口徑。`src/ai/grounding.ts:44` 起限制 placeholder 僅出現在 catalog 已精確驗證的 observation；其餘欄位拒絕 `FREE_FIELD_NUMERIC_REFERENCE`。此為保守封閉數值重新標記入口，沒有靠擴增 scope 用詞黑名單猜測語意。 |
| M6-AI-02：未附 API 前綴的憑證索取漏網 | 「核對來源前，請提供金鑰。」及「請提供密鑰。」原本通過。 | `src/ai/grounding.ts:35` 將金鑰／密鑰納入已有索取動詞檢查。明確拒絕此次實測的已知案例；不宣稱所有自然語言變體均可辨識。 |
| M6-AI-03：無貨幣後綴的中文數字漏網 | 「核對後，廣告預算應調至三萬。」原本通過。 | `src/ai/grounding.ts:34` 補入調至／降至／升至／設定為的數值主張檢查；固定文字測試涵蓋各變體並保留「同一個」「萬一」正常用語。 |

`src/ai/prompt.ts:8` 同步要求只有 observation 能含數值 placeholder，其他欄位只描述質性核查。主驗收者同步將 `src/ai/provider.ts:3` 的 prompt version 更新為 `profitlens-insights-v2`。所有金額仍由既有 domain 與 renderer 取得，本次沒有更改財務定義、fixture 或 golden expected。

第一次修復後的 6 組 targeted run 為 163 passed／1 failed。唯一失敗是舊測試原本要求自由文字合法 placeholder 可呈現；已明確回報主驗收者，由其確認新版收緊契約後更新該測試為拒絕自由欄數值，並保留 observation 來源不變性的檢查。此中間失敗保留在 `m6-security-first-fix.txt`，未刪除。

最終新增安全回歸共 19 項，含全部七種自由欄位拒絕、中性質性文字正例及 client 端安全降級；與九組既有 AI／匯出／dataset-route 套件合計 **312 passed，10 files，exit 0**，見 `m6-security-green.txt`。這代表本輪已知問題修正與合成回歸通過，不代表任意自然語義與真實模型品質均通過。

## 其他邊界的重新檢查

| 範圍 | 本子工作的證據與結論 |
|---|---|
| 匿名輸入／注入 | `src/application/ai-snapshot.ts:30` 起只選完整所選通路的前本期 40 facts；真實通路／來源／SKU 留本機映射。`src/ai/contracts.ts:64` strict schema 阻擋未知 raw 欄位。既有 grounding、route、service 測試以惡意名稱與額外欄位驗證不送入 provider。 |
| 模型工具／目的端 | `src/ai/openai-provider.ts:17` 固定 OpenAI endpoint、關閉 SDK 日誌與 retry；`src/ai/openai-provider.ts:21` 使用 `store:false`、無工具、固定 system instructions 與 user JSON。Provider 測試注入假 fetch，不接觸真實 API。不能由此保證供應商絕不保留資料。 |
| 同意與 stale | `src/application/ai-client.ts:49` 起綁定複製後完整 payload／revision，回應與 JSON 完成後均查 freshness；`src/components/ai-panel.tsx:14` 以 revision/hash/scope remount，cleanup abort，ticket 過期不採用。已重跑 client 的換資料、慢回應、取消、mutated payload、config race 案例。 |
| PUBLIC_DEMO／本機閘門 | `src/ai/config.ts:6` 先關閉 PUBLIC_DEMO；`src/app/api/insights/route.ts:37` 在 body 讀取與 provider 建構前檢查設定及 Origin/Host。既有 route tests 有 getter 證明 body 未讀、provider 未建構。Host/Origin 僅屬本機使用限制，不是公開部署的使用者認證。 |
| 有限重試／故障 | `src/ai/service.ts:44` 起 no-key／停用／輸入錯誤不呼叫 provider；僅 schema/semantic 最多一次修復。已重跑 timeout、拒絕、429、截斷、取消、錯誤與次數測試。 |
| 日誌與 secrets | `src/ai/service.ts:34` 只建構 metadata 白名單，例外轉固定代碼；所有 server 設定／SDK 模組有 `server-only`。來源搜尋只有 `config.ts` 使用 `process.env`；沒有讀取 `.env.local`。mock key/raw error 未出現在 route/service 回應與日誌的測試通過。編譯後資源隔離需另看主工作的實際 build/canary 掃描，不能只用 source 靜態檢查代替。 |
| CSV／Markdown | `src/application/export.ts:15` 區分不可信文字與嚴格 decimal 數值，公式／前導控制字元文字加 apostrophe，保留真正負數；`src/application/decision-export.ts:57` 對 HTML、Markdown 符號、換行轉義。重跑 export／decision 的公式、HTML／link、metadata、null、偽造結果與 fact 引用測試。 |
| React XSS | 檢查 `src/components` 與 `src/application` 未見 dangerouslySetInnerHTML、innerHTML、eval 或 Function；模型文字、CSV 及手動文字以 JSX 文字节点輸出；可控文字未成為外部 href/src。這是 source review，瀏覽器實際 XSS 驗收由主工作另記。 |
| Session 隔離 | dashboard/import/decision/AI 的資料在元件 state/ref 或函式區域變數；沒有 localStorage/sessionStorage/IndexedDB/BroadcastChannel 或 server 使用者資料 singleton。dataset route 使用固定合成 fixture allowlist，路徑穿越／非 synthetic 測試通過。真正兩視窗測試由主工作另記。 |

## 實際命令與結果

| 命令 | 結果／原始證據 |
|---|---|
| `git status --short` | exit 128，非 Git repository；未 init／commit／push。 |
| `npm test -- --run tests/m6-security-audit.test.ts`（修復前） | exit 1，8 failed；`m6-security-red.txt`。 |
| `npm test -- --run tests/ai-config.test.ts tests/ai-provider.test.ts tests/ai-service.test.ts tests/ai-grounding.test.ts tests/ai-client.test.ts tests/ai-route.test.ts tests/export.test.ts tests/decision.test.ts tests/dataset-route.test.ts`（修復前 baseline） | exit 0，9 files／293 passed；`m6-security-baseline.txt`。 |
| `npm test -- --run tests/m6-security-audit.test.ts tests/ai-grounding.test.ts tests/ai-client.test.ts tests/ai-provider.test.ts tests/ai-service.test.ts tests/ai-route.test.ts`（首次修復） | exit 1，163 passed／1 舊契約衝突；`m6-security-first-fix.txt`。 |
| `npm run lint`（修復後） | exit 0；`m6-security-lint.txt`。 |
| `npm run typecheck`（修復後首次） | exit 2，TS2688 找不到 `d3-array 2`、`d3-scale 2` 的型別定義；`m6-security-typecheck.txt`。未用 tsconfig 跳過錯誤，已交由主工作查核 node_modules 環境。 |
| `npm test -- --run tests/m6-security-audit.test.ts tests/ai-config.test.ts tests/ai-provider.test.ts tests/ai-service.test.ts tests/ai-grounding.test.ts tests/ai-client.test.ts tests/ai-route.test.ts tests/export.test.ts tests/decision.test.ts tests/dataset-route.test.ts`（最終） | exit 0，10 files／312 passed；`m6-security-green.txt`。 |
| `npm run typecheck`（主工作清除已確認空的兩個重複目錄後重跑） | 仍 exit 2，新 TS2688 指向 `d3-color 2`、`d3-ease 2`、`d3-interpolate 2`、`d3-path 2`、`d3-shape 2`、`d3-time 2`、`d3-timer 2`、`use-sync-external-store 2`；`m6-security-typecheck-retry.txt`。已將持續出現的環境問題回報主工作，未宣稱本子工作 typecheck 通過。 |

程式碼修改範圍：`src/ai/grounding.ts`、`src/ai/prompt.ts`、新增 `tests/m6-security-audit.test.ts`。其他版本／既有測試契約與文件由主驗收者統一整合。上述修改完成後凍結，沒有修改 README／STATUS、舊 verification 或原規格。

## 證據可信度與未執行範圍

- 已靜態檢視 `scripts/verify-ai-security.mjs`，未自行執行。它會掃描 `.next/static` 的指定 canary 與 server SDK 標記，再啟四種假 key／未同意本機模式，並檢查回應、no-store 與 logs。它本身不重建 `.next`，所以結果必須搭配本輪明確指定同一假 canary 的乾淨 production build／E2E build 紀錄；已將此限制交給主驗收者。
- 真實模型、帳戶模型支援、實際配額／供應商拒絕／保留政策、模型解釋品質、人工作業時間及商業成效：**未執行**。
- 瀏覽器、production HTTP、完整 E2E、跨視窗 state、編譯後資源與正式 logs 掃描：**本子工作未執行**，以主驗收者的新 M6 證據為準，未引用舊 M5 結果冒充本輪結果。
- 保守 placeholder 規則阻擋本輪重現的數值改標，但 qualitative 自由文字的任意自然語義、所有中文數字／憑證措辭仍不能由有限 regex 完整證明；live 說明仍須人工核查。未將 mock 通過宣稱為真實模型品質通過。
