# EC ProfitLens — Claude Code 工作指令（Revamp v3）

EC ProfitLens 是「電商獲利診斷與決策工作台」：匯入三份日粒度 CSV（銷售、通路費用、廣告），計算 淨營收 → 商品毛利 → 通路貢獻（v3 起稱「扣廣告前貢獻」，D-V3-1） → 扣廣告後貢獻，做兩期比較、九項金額橋接、規則健檢、假設試算、待辦與會議輸出。所有金額由 `src/domain` 的純函式計算，每個數字可追溯到 CSV 檔名與行號。

產品名稱自 2026-10-05 起為 **EC ProfitLens**（D-V3-25）。使用者看得到的名稱一律寫 EC ProfitLens；技術識別不改：package 名 `profitlens`、下載檔名前綴 `profitlens-`、備份 schema 字串、`dataset_id`、網址 `profitlens-tau.vercel.app`。

本輪目標（Revamp v3，基準 v2.0.0＝commit `82b70df`／tag `v2.0.0`，目標 v3.0.0）：**把「功能齊全但難讀、看起來像 AI 生成」改成「老闆 10 秒看懂、主管 3 分鐘找到原因、執行者 10 分鐘完成匯入與核對」的專業財務工具。不新增財務口徑，也不刪任何功能**（只能搬移、合併、收合、改名）。使用者已於 2026-10-05 授權依 PRD 開工，D-V3-1–24 全部依建議值。

## 先讀什麼（每個 session 都要）
1. `AGENTS.md` — 專案既有規則，**優先級最高**；本檔只補充，不覆蓋。
2. `docs/revamp-v3/00_README.md` — v3 套件的用法、批次順序、人工關卡、驗收命令。
3. 當批任務：`docs/revamp-v3/06_BATCHES.md` 中指定的 V3 批次，以及該批引用的 `docs/revamp-v3/01_PRD.md` 章節（用 Read 的 offset／limit 讀需要的段落）。
4. 名詞與拍板：`docs/revamp-v3/GLOSSARY.md`、`docs/revamp-v3/09_DECISIONS_PENDING.md`。
5. 財務口徑：`docs/METRICS.md`、`docs/DATA_CONTRACT.md`、`docs/SCENARIOS.md`。

v2 的套件 `docs/revamp/*` 保留為歷史紀錄；與 v3 文件衝突時以 v3 為準。

## 本輪的硬規則（補充 AGENTS.md）
- **一次只做一個批次（V3-0–V3-10），一批就是一個工作階段，不跨批。** 批次完成前不開始下一批；每批結束要有可運行、全部檢查通過的狀態。批次太大時要在**開工前**拆成 V3-{n}a／b 並寫進 `06_BATCHES.md`。
- **人工關卡 H1–H4 不屬於任何批次**：H2（設計稿審查）擋 V3-3、H3（`copy-rewrite.csv` 審稿與紙本用語測試）擋 V3-2、H4（v3 複測）擋 v3.0.0 正式上線；H1（v2 基準測試）只擋 V3-10 的前後對照。沒完成時 `docs/STATUS.md` 寫「未執行／待人工」，不可寫成完成。
- **拍板**：以 `docs/revamp-v3/09_DECISIONS_PENDING.md` 的「決定」欄為準。之後新出現的待決事項，沒有使用者明確回覆就不視為核准，拍板前沿用 v2 的行為與用詞。**任何部署（含 Vercel preview）都要使用者當次明確同意**（D-V3-24 只定策略）。
- **財務核心禁區**：`src/domain/*`、`fixtures/golden`、`fixtures/demo`、`fixtures/errors`、`fixtures/refund_only`、`fixtures/zero_ad`、`metric_version = contribution-v1`、`docs/METRICS.md` 的公式。V3-0–V3-8 完全不動。**只有 V3-9 可以新增**，而且只能新增 `06_BATCHES.md` 白名單內的檔案（目前 `fixtures/demo_tw/**`；F12 損益兩平 MER 依 D-V3-17＝C 實作在 `src/application`，版本 `breakeven-mer-v1`），每一項新增都要有獨立手算 golden 的測試；既有 7 個輔助指標維持 `assist-kpi-v1`，不改既有指標的輸入輸出。每批驗收都要跑 `git diff --stat 82b70df -- src/domain fixtures/golden fixtures/demo fixtures/errors fixtures/refund_only fixtures/zero_ad docs/METRICS.md`（或 tag `v2.0.0`），結果寫進驗收文件；**不可用 `main` 比對**。
- **顯示格式只在呈現層**：萬／億、HALF_UP、U+2212 負號、`favorableDirection` 只改 `src/application/presentation.ts`、`copy.ts`。測試的數字斷言改成呼叫格式化函式，不可為了讓測試過而改 golden 數字（本期 255.00、差額 −315.00、試算 284.00／264.00／19.70）。
- **標籤單一來源**：所有使用者看得到的中文（含 aria-label、title、匯出標題列、PDF、PPT、Excel 工作表名、週會摘要、錯誤訊息）集中在 `src/i18n/labels.zh-TW.ts`；元件、匯出、AI 預覽都從這裡取字串，`metricDefinitions.label` 從 labels 讀取。JSX 內不新寫中文。名詞依 `GLOSSARY.md`，一個概念一個詞；舊 key 保留為 alias，V3-10 才移除。
- **測試斷言的字串跟著標籤走**：改名時在**同一批**更新測試，一律改成 `import { labels } from "@/i18n"` 再斷言，不要留硬編碼；`verification/revamp-v3/e2e-text-assertions.csv` 每批勾銷。測試失敗不是「跳過」的理由。
- **棘輪與基準（V3-0 建立，每批都跑）**：`tests/design-lint.test.ts`（上限 `tests/fixtures/design-lint-ceiling.json`）與 `tests/copy-style.test.ts` 的數值只能下降，時程見 `06_BATCHES.md`；`tests/testid-baseline.test.ts` 對 `verification/revamp-v3/testids-v2.txt` 的刪除數必須為 0；**V3-3 起** `tests/mounted-testids.test.tsx` 每批都跑（搬進 popover、`<details>`、bottom sheet 的內容保持掛載；同一控制只有一個 DOM 實例）；`verification/revamp-v3/feature-retention.csv` 每批逐列打勾，任何一列沒打勾該批就不算完成。
- **依賴**：本輪「允許新增依賴」清單為**空**。瀑布圖、bullet 細條、sparkline 用既有的 Recharts 3.10.1 或 inline SVG。需要新依賴時一律先問。
- **隱私與公開站邊界不變**：不加登入、資料庫、伺服器端保存；原始 CSV 不上傳；`APP_MODE=PUBLIC_DEMO`、`ENABLE_LIVE_AI=false`、`/api/insights` 的 server 端封鎖邏輯不動；不碰 `.env*`、`vercel.json`。本機保存仍須使用者同意；分析事件只記事件名（D9、D-V3-15）。
- **可追溯性不變**：每個金額（含新增的瀑布柱、管理損益表格、圖表點）都能開「計算與來源」（v2 名稱「怎麼算的／公式與來源」）看到檔名、原始行號、含稅原值與換算值；摘要層用萬之後，抽屜標題下一行永遠顯示到分的精確值；任何前處理都要寫入匯出與備份。
- **a11y 與 testid 不退步**：既有 `data-testid`、`aria-*`、`role="status"`、`<details>/<summary>` 收合結構要保留；移動區塊時一起搬，不刪。Lighthouse Accessibility 不低於 V3-0 同頁基準且 ≥ 95；四尺寸 axe 0 個 serious。
- **程式風格**：沿用既有風格（Tailwind v4 + `globals.css` 自訂 class、長行 JSX）。不要為了格式化重寫整檔；只改動需要的區塊；新樣式引用 `:root` token，不寫死色碼。
- **文件同步**：每批結束更新 `docs/STATUS.md`（真實執行結果；未執行寫「未執行」）、必要時在 `docs/DECISIONS.md` 加一筆決策、把本批驗收寫到 `verification/revamp-v3-V3-{n}-acceptance.md`，截圖存 `verification/revamp-v3/V3-{n}/`；`06_BATCHES.md` 的進度欄同步。

## 驗收命令（每批都要全部跑，貼真實輸出摘要）
```bash
npm ci                 # 全新環境或 lockfile 變動時
npm run typecheck
npm run lint           # eslint --max-warnings=0
npm run audit:ui       # V3-0 新增：scripts/ui-audit.mjs 的數值寫進驗收文件
npm run contrast-check # V3-0 新增：scripts/contrast-check.mjs
npm test -- --run      # 含 design-lint、copy-style、testid-baseline；V3-3 起含 mounted-testids
npm run build
npm run test:e2e       # 首次需 npx playwright install chromium；佔用 3100 port
git diff --stat 82b70df -- src/domain fixtures/golden fixtures/demo fixtures/errors fixtures/refund_only fixtures/zero_ad docs/METRICS.md
```
本機預覽：`npm run dev` → http://127.0.0.1:3000 。E2E 的四種視窗：1440×1000、1280×900、768×1024、390×844。

## 每批回報格式（繁體中文）
1. 完成項目（對照 `docs/revamp-v3/06_BATCHES.md` 的該批範圍，逐項標 完成／部分／未做＋原因）
2. 變更檔案清單（新增／修改／刪除）
3. 驗收命令與真實結果（通過數、失敗數、未執行），含禁區 diff、棘輪數值、testid 刪除數
4. 瀏覽器驗收方式與截圖路徑（四尺寸至少各一張）
5. 已知限制與風險
6. 下一批建議、被擋住的人工關卡，以及需要人拍板的事項（對照 `docs/revamp-v3/09_DECISIONS_PENDING.md`）

## 檔案地圖（改版會碰到的）
| 位置 | 內容 | v2 動作（已完成） | v3 批次 |
|---|---|---|---|
| `src/components/dashboard.tsx` | 應用殼層：側欄、頂欄、AI 狀態、保存面板、期間列、各頁切換、頁尾 | R1 重排、R2 文案、R6 會議分頁 | V3-3 頂欄單列、側欄分組、期間列、手機底部分頁列 |
| `src/components/overview.tsx` | KPI 卡、期間合計與日均、週趨勢、橋接、通路比較 | R1 順序、R4 輔助指標與目標 | V3-4 本期一句話、KPI 帶、瀑布、其他常用指標表 |
| `src/components/review-workbench.tsx` / `manager-summary.tsx` / `meeting-page.tsx` | 會議設定與決策、主管摘要、三件事、通路寬表、會議紀錄 | R1 收合下移、R5 標題改寫、R6 會議紀錄 | V3-4 三件事警示列、V3-7 會議文件式版面 |
| `src/components/workspace-panels.tsx` | 資料工作區（DataWorkspace）、通路健檢（Diagnosis）、商品毛利（Products） | R2 文案、R5 清單化 | V3-5 健檢與商品、V3-8 資料來源 |
| `src/components/import-panel.tsx` + `src/application/import.ts` / `import-guidance.ts` | 匯入表單與檢核 | R3 精靈化、含稅、對照記憶 | V3-2 錯誤訊息句型、V3-8 全版精靈 |
| `src/components/multi-scenario-workbench.tsx` / `decision-workbench.tsx` / `scenario-sensitivity.tsx` | 情境試算 | R5 流程縮短、範本、絕對值輸入 | V3-6 方案並排、精簡表單 |
| `src/components/actions-workbench.tsx` + `src/application/action-workspace.ts` | 待辦（v2 稱行動） | R5 表單修正、看板 | V3-6 卡片精簡、編輯抽屜 |
| `src/components/evidence-drawer.tsx` | 計算與來源抽屜（v2 稱公式與來源） | R2 中文階梯公式 | V3-5 抽屜重排 |
| `src/application/presentation.ts` / `copy.ts` | `metricDefinitions`、格式化 | R2 接 labels | V3-2 三層尺度、HALF_UP、U+2212、`favorableDirection` |
| `src/application/workspace-backup.ts` / `local-store.ts` | 備份 v4、IndexedDB | R3 對照記憶、R4 v4 schema、R6 自動保存 | V3-9 備份 v5（F13） |
| `src/application/export.ts` / `decision-export.ts` / `workspace-decision-export.ts` | CSV／Markdown／JSON 匯出 | R2 標籤、R6 新格式 | V3-7 匯出版頭、正規化比對 |
| `src/app/globals.css` | 全站樣式（自訂 class） | R1 sticky 期間列、select 高度、下載選單 | V3-1 token 化（棘輪），之後各批收斂 |
| `src/i18n/labels.zh-TW.ts` | 標籤字典 | R0 建立、R2 接線 | V3-2 結構重整與 alias、V3-10 移除 alias |
| `docs/revamp/*` | v2 規格 | 每批對照 | 歷史紀錄（不再更新） |
| `docs/revamp-v3/01_PRD.md` | v3 規格本體 | — | 每批對照 |
| `docs/revamp-v3/00_README.md` / `06_BATCHES.md` / `09_DECISIONS_PENDING.md` / `GLOSSARY.md` | v3 套件說明、批次、拍板、名詞表 | — | V3-0 建立；每批更新進度 |
| `docs/revamp-v3/usability-test.md` | H1／H4 可用性測試與盲評材料 | — | V3-0 建立；H1、H4 使用 |
| `docs/revamp-v3/copy-rewrite.csv` | labels 全量改寫對照（H3 審稿） | — | V3-0 產出、V3-2 依審稿落地 |
| `scripts/ui-audit.mjs` / `scripts/contrast-check.mjs` | UI 靜態掃描與色彩對比 | — | V3-0 建立；每批跑 |
| `tests/design-lint.test.ts` + `tests/fixtures/design-lint-ceiling.json` / `tests/copy-style.test.ts` | 棘輪測試 | — | V3-0 建立；上限逐批下降 |
| `tests/testid-baseline.test.ts` + `verification/revamp-v3/testids-v2.txt` | testid 基準 | — | V3-0 建立；每批刪除數 0 |
| `tests/mounted-testids.test.tsx` | 掛載與唯一性規則（M1、M6） | — | V3-3 建立；之後每批 |
| `verification/revamp-v3/feature-retention.csv` / `backup-schema-v4.json` / `e2e-text-assertions.csv` | 功能保留表、備份欄位、E2E 文字斷言清單 | — | V3-0 建立；每批打勾或勾銷 |
| `verification/revamp-v3/V3-0-baseline.md` / `V3-{n}/` / `verification/revamp-v3-V3-{n}-acceptance.md` | 基準報告、每批截圖、每批驗收 | — | V3-0 起每批 |
