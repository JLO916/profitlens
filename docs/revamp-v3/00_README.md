# EC ProfitLens Revamp v3 — 套件說明

v3 的目標是把 v2.0.0「功能齊全但難讀、看起來像 AI 生成」改成「老闆 10 秒看懂、主管 3 分鐘找到原因、執行者 10 分鐘完成匯入與核對」的專業財務工具。**v3 不新增財務口徑，也不刪任何功能。**

這個資料夾是給 Claude Code 讀的工作底稿，也是使用者拍板與人工審查用的產品文件。基準版本是 v2.0.0（分支 `revamp/v2`，commit `82b70df`，tag `v2.0.0`），目標版本 v3.0.0。產品名稱自 2026-10-05 起為 **EC ProfitLens**（D-V3-25）。

## 檔案與用途

| 檔案 | 給誰 | 內容 |
|---|---|---|
| `../../CLAUDE.md` | Claude Code | 每個工作階段的規則（補充 `AGENTS.md`，AGENTS.md 優先） |
| `01_PRD.md` | 使用者＋Claude Code | **規格本體**：問題、目標與指標（§2）、三層閱讀（§3）、設計原則與 X1–X25（§5）、功能對照表與掛載規則（§6）、各頁需求（§7）、語言規範（§8）、token 與元件 C1–C23（§9）、新功能（§10）、非功能需求（§11）、批次（§12）、風險與拍板（§13） |
| `06_BATCHES.md` | Claude Code | V3-0–V3-10 分批任務（由 PRD §12 拆出）、人工關卡 H1–H4、棘輪時程、目前進度 |
| `09_DECISIONS_PENDING.md` | 使用者 | D-V3-1–24 拍板表（2026-10-05 全部依建議值）與 D-V3-25 產品改名；需要使用者提供的材料 |
| `GLOSSARY.md` | Claude Code＋審稿者 | 名詞表（v2 → v3 定案用詞、短名、一句定義、英文 key、出現位置）與介面用語對照（PRD §8.3、§14.1） |
| `copy-rewrite.csv` | 審稿者（H3） | labels 全量改寫對照（key、v2 文案、v3 L1／L2／L3、對應規則、需拍板代號）；V3-0 產出，審過之後 V3-2 才動 labels |
| `usability-test.md` | 主持人（H1／H4） | 招募清單、主持腳本、10 秒結論與 30 秒試用、首個洞察計時、任務評分、7 點量表、SUS、名詞查詢計數、盲評流程、結果表 |
| `../market-comparison-2026-10-05.md` | 參考 | 104 個同類產品的市場調研（PRD §4、§10 的來源） |
| `../../verification/revamp-v3/` | Claude Code | V3-0 的基準與護欄產物（見下方「驗收產物」）與每批截圖 `V3-{n}/` |

## 怎麼使用

1. **先看拍板**：`09_DECISIONS_PENDING.md`。使用者已在 2026-10-05 決定全部依建議值；之後若要改某一項，直接改「決定」欄，並在 `docs/DECISIONS.md` 記一筆。沒有明確回覆的事項不視為核准。
2. **一個工作階段只做一批**：照 `06_BATCHES.md` 的順序，開工時告訴 Claude Code「做 V3-{n}」。Claude Code 每次都先讀 `AGENTS.md`、`CLAUDE.md`、本檔、`06_BATCHES.md` 的該批段落，以及該批引用的 PRD 章節。
3. **名詞與文案以 `GLOSSARY.md` 為準**；逐 key 的改寫以審過的 `copy-rewrite.csv` 為準。
4. **人工關卡照表安排**（下一節）；關卡沒過，被擋住的批次不開工。
5. **每批結束看回報**（格式見最後一節）；全部檢查通過、人工關卡就緒，才開下一批。

## 批次順序

| 批次 | 主題 | 大小 | 依賴 | 另需的人工時間 |
|---|---|---|---|---|
| V3-0 | 基準與護欄（不改任何 UI） | M | — | H1：3–5 工作天＋盲評 1 天 |
| V3-1 | Token、基礎元件與設計稿審查 | L | V3-0 | H2：2–3 工作天 |
| V3-2 | 語言與數字格式 | L | V3-1、**H3** | H3：約半天 |
| V3-3 | 殼層與導覽 | M | V3-2、**H2** | — |
| V3-4 | 經營總覽（**MVP 切線**） | L | V3-3 | 內部走查半天 |
| V3-5 | 通路健檢、商品毛利、計算與來源抽屜 | M | V3-4 | — |
| V3-6 | 假設試算與待辦 | M | V3-5 | — |
| V3-7 | 會議紀錄與匯出 | M | V3-6 | 匯出檔人工檢查半天 |
| V3-8 | 資料來源、匯入精靈、空狀態 | M | V3-7 | — |
| V3-9 | P1 新增功能（可整批延到 v3.1） | L | V3-8 | 視 F15、F16 的檔案 |
| V3-10 | 上線檢查 | M | V3-9（延期時 V3-8） | H4：3–5 工作天＋盲評 1 天 |

- 至少 11 個工作階段；L 級批次可能在**開工前**拆成 a／b（寫進 `06_BATCHES.md`）。人工時間合計約 2.5–3.5 週。
- **MVP 切線**＝V3-0–V3-4：完成後老闆就能看到新首屏。依 D-V3-24＝A，只部署 Vercel preview 給老闆試用，正式站到 V3-10 才切；**每一次部署（含 preview）都要使用者當次明確同意**。
- 目前進度：**V3-0 進行中（2026-10-05 開工）**。

## 人工關卡 H1–H4（不屬於任何批次）

| 關卡 | 內容 | 擋住 | 材料 |
|---|---|---|---|
| H1 | v2 基準的 5 人可用性測試與外部盲評 | V3-10 的前後對照（不擋 V3-1） | `usability-test.md` |
| H2 | V3-1 產出的靜態設計稿審查（2–3 位台灣電商經理人＋1 位設計者） | V3-3 開工 | `verification/revamp-v3/mockups/` |
| H3 | `copy-rewrite.csv` 審稿與紙本用語測試（D-V3-2、D-V3-14） | V3-2 開工 | `copy-rewrite.csv`、紙本用語測試材料 |
| H4 | v3 的 5 人複測與外部盲評（同 H1 腳本） | v3.0.0 正式上線 | `usability-test.md` |

人工關卡沒完成時，`docs/STATUS.md` 寫「未執行／待人工」，不可寫成完成；批次驗收只放機器能檢查的項目。

## 驗收命令（每批都要全部跑，貼真實輸出摘要；沒執行的寫「未執行」＋原因）

```bash
npm ci                    # 全新環境或 lockfile 變動時
npm run typecheck
npm run lint              # eslint --max-warnings=0
npm run audit:ui          # scripts/ui-audit.mjs：hex、圓角、字級、字距、「注意：」、箭頭、JSX 中文、testid 數、class 數（V3-0 新增）
npm run contrast-check    # scripts/contrast-check.mjs：文字 token ≥ 4.5:1、非文字 token ≥ 3:1（V3-0 新增）
npm test -- --run         # 含 design-lint、copy-style 棘輪、testid-baseline，V3-3 起含 mounted-testids
npm run build
npm run test:e2e          # 四個視窗：1440×1000、1280×900、768×1024、390×844；首次需 npx playwright install chromium；佔用 3100 port

# 財務核心禁區 diff（結果寫進驗收文件；V3-9 白名單內的新增以外必須為空）
git diff --stat 82b70df -- src/domain fixtures/golden fixtures/demo fixtures/errors fixtures/refund_only fixtures/zero_ad docs/METRICS.md
```

- 禁區 diff 也可用 tag `v2.0.0` 取代 `82b70df`。**不可用 `main` 比對**：`main` 是 `revamp/v2` 的祖先，v2 在 R4 已在 `src/domain` 新增過內容，和 `main` 的 diff 從開工前就不是空的。
- **棘輪**：`tests/design-lint.test.ts`（上限在 `tests/fixtures/design-lint-ceiling.json`）與 `tests/copy-style.test.ts` 的數值只能下降，時程見 `06_BATCHES.md`「design-lint 棘輪時程」。批次中降了數值，要同批把上限檔調低。
- **testid 基準**：`tests/testid-baseline.test.ts` 比對 `verification/revamp-v3/testids-v2.txt`，刪除數必須為 0（新增不限）。
- **掛載規則**：V3-3 起 `tests/mounted-testids.test.tsx` 每批都跑（搬進 popover、`<details>`、bottom sheet 的 testid 仍在 markup 中；§6.3 列出的 testid 與表單 id 各只出現 1 次）。
- **功能保留**：`verification/revamp-v3/feature-retention.csv` 每批逐列打勾；任何一列沒打勾，該批就不算完成。
- **E2E 文字斷言**：`verification/revamp-v3/e2e-text-assertions.csv` 每批勾銷；改名的同一批把斷言改成 `import { labels } from "@/i18n"`。
- **Lighthouse**：Accessibility 不低於 V3-0 同頁基準且 ≥ 95（本機 production build，1440 與 390）；四尺寸 axe 0 個 serious；Performance 記錄並對照 V3-0 基準。
- **Golden 不變**：本期 255.00、差額 −315.00、試算 284.00／264.00／19.70。
- 本機預覽：`npm run dev` → http://127.0.0.1:3000 。

## 驗收產物（V3-0 建立，之後每批更新）

| 路徑 | 內容 |
|---|---|
| `verification/revamp-v3/V3-0-baseline.md` | v2 基準：ui-audit 數值、First Load JS、首屏位置、內容前控制項數、含稅匯入點擊數、Lighthouse a11y／Performance |
| `verification/revamp-v3/testids-v2.txt` | testid 基準（靜態＋運算式＋`testId` 屬性，樣板展開成實際渲染值） |
| `verification/revamp-v3/feature-retention.csv` | 功能保留表（PRD §6.3 的 62 列＋完整下載入口清單） |
| `verification/revamp-v3/backup-schema-v4.json` | 備份 v4 欄位清單（含 `ui_prefs`） |
| `verification/revamp-v3/e2e-text-assertions.csv` | E2E 非 testid 定位器清單（`getByText`／`getByRole`／`locator()`） |
| `verification/revamp-v3/V3-{n}/` | 每批四尺寸截圖 |
| `verification/revamp-v3-V3-{n}-acceptance.md` | 每批驗收文件（命令、真實結果、禁區 diff、未執行項目） |

## 完成定義（每批共用）

- 上面的驗收命令全部真實通過，並附輸出摘要；沒執行的寫「未執行」＋原因。
- 四尺寸截圖存在 `verification/revamp-v3/V3-{n}/`。
- `docs/STATUS.md` 新增該批段落（真實結果；人工關卡寫「未執行／待人工」）；必要時 `docs/DECISIONS.md` 記一筆；驗收寫在 `verification/revamp-v3-V3-{n}-acceptance.md`。
- 批次的「驗收重點」逐條標示通過／未通過，未通過的要有原因與補救批次。
- commit 訊息以 `revamp(V3-{n}): …` 開頭；不混入其他批次的改動。

## 每批回報格式（繁體中文，沿用 CLAUDE.md）

1. 完成項目（對照 `06_BATCHES.md` 的該批範圍，逐項標 完成／部分／未做＋原因）
2. 變更檔案清單（新增／修改／刪除）
3. 驗收命令與真實結果（通過數、失敗數、未執行），含禁區 diff、棘輪數值、testid 刪除數
4. 瀏覽器驗收方式與截圖路徑（四尺寸至少各一張）
5. 已知限制與風險
6. 下一批建議、被擋住的人工關卡，以及需要人拍板的事項（對照 `09_DECISIONS_PENDING.md`）

## 不在本輪範圍（PRD §2.2）

不新增口徑、不改既有指標的輸入輸出、不改 `contribution-v1`；不做 API 串接、雲端同步、帳號、推播或自動寄送；不做 AI 計算金額、健康分數或預測；不追求更多圖表（表格是主角）；不做深色模式、不換字型；不加任何依賴。
