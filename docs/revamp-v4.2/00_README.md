# EC ProfitLens v4.2 — 套件說明

v4.2 回應使用者 2026-10-15 的兩項新功能指示：「現階段所有分析只能分為『DTC』『Marketplace』，這部分需讓使用者能客製化設定為自己擁有的通路來分析，並且要能夠再多一層的單一通路分析」與「分析視角要有『by 通路』『by品類』『by SKU』的個別分析以及綜合分析、交叉分析」。做法是在工作台裡加通路設定（顯示名稱、順序、使用者自己編的群組，跟著備份走）、期間列的兩層通路選單（群組、群組裡的單一通路），以及商品毛利頁的視角切換（品類、SKU 跨通路合計、通路 × 品類交叉表、綜合）。**四層金額全部由既有 `src/domain` 函式以通路子集計算；品類與 SKU 只到商品毛利，通路費用與廣告費不分攤、以「未分攤」整筆呈現；不動 `src/domain`、`fixtures/*`、`docs/METRICS.md`；不加 npm 依賴。** 同一則訊息的第 1、2 項（範例檔 404、入口改名「操作導覽」）由 V41-6 修正批（v4.1.2）處理，不在本套件。

這個資料夾是給 Claude Code 讀的工作底稿，也是使用者拍板與人工確認用的產品文件。

| 項目 | 內容 |
|---|---|
| 基準版本 | v4.1.2（V41-6 完成並上線後的 tag；D-V42-29）。起草時 `revamp/v4.1`＝`94918fe`，正式站 https://profitlens-tau.vercel.app 是 v4.1.1＝`36659ff`，`origin/main`＝`66c241a`；本機 `main` 停在 `59e6f41`，不可用來比對 |
| 目標版本 | **v4.2.0**（D-V42-6＝A，使用者 2026-10-16 依建議值） |
| 工作分支 | `revamp/v4.2`，自 `origin/main`（v4.1.2 發布 commit）開出（D-V42-24）。**push 任何分支都會由 Vercel Git 整合建 preview，視同部署，沒有當次同意不 push** |
| 狀態 | **已拍板（使用者 2026-10-16「其他都依建議」：D-V42-1 到 23 全部依建議值，8 件預設沿用照表）；V42-0 於 2026-10-16 完成；V42-1 於 2026-10-20 開工前拆成 1a（模組、名稱套用、備份）／1b（編輯器、對照列、E2E），1a 進行中。** v4.1.2 已於 2026-10-16 上線（tag `v4.1.2`＝`e256154`），V42-0 可開工；開工時整份取代 CLAUDE.md（本檔末節草案） |
| 產品名稱 | EC ProfitLens；技術識別不改（package 名 `profitlens`、下載檔名前綴 `profitlens-`、備份 schema `profitlens-workspace-v5`、`dataset_id`、網址 `profitlens-tau.vercel.app`） |

## 版本號建議

建議 **v4.2.0**（D-V42-6）：新增使用者看得到的功能（通路設定、群組範圍、分析視角）屬次版號；備份在 v5 信封加一個選填鍵（D-V42-9＝A，V4-7c 的先例），沒有設定時位元組不變，不需要主版號；D-V41-29 已把 4.2.0 留給這一輪。

## 檔案與用途

| 檔案 | 給誰 | 內容 |
|---|---|---|
| `../../CLAUDE.md` | Claude Code | 每個工作階段的規則（補充 `AGENTS.md`，AGENTS.md 優先）。V42-0 開工時以本檔末節「CLAUDE.md 更新草案」整份取代，使用者同意開工後才改 |
| `01_PRD.md` | 使用者＋Claude Code | **規格本體**：決策摘要（§0）、背景與原文（§1）、成功指標（§2）、通路設定與群組（§3）、單一通路層（§4）、分析視角（§5）、口徑邊界與誠實呈現（§6）、版面與入口（§7）、可追溯性（§8）、標籤與文案（§9）、效能預算與棘輪（§10）、測試與驗收（§11）、匯出（§12）、說明頁更新（§13）、不做的事（§14）、風險（§15） |
| `06_BATCHES.md` | Claude Code | V42-0 到 V42-6（含 2a／2b）的範圍、依賴、允許變動畫面、驗收重點；人工關卡 H8、H9、H6；護欄與棘輪時程 |
| `09_DECISIONS_PENDING.md` | 使用者 | 拍板表（需要回覆的 23 件分成 A 範圍與產品 16 件、B 技術做法 7 件；預設沿用的 8 件：選項、建議、影響批次、決定）與需要使用者提供的材料 |
| `GLOSSARY.md` | 使用者＋Claude Code | v4.2 新增名詞（通路代碼、顯示名稱、通路群組、分析視角、交叉表、未分攤到品類、未填、綜合分析等）與不使用的寫法 |
| `../revamp-v4.1/*`、`../revamp-v4/*`、`../revamp-v3/*` | 參考 | 歷史紀錄。v4.1 的說明頁規範（路由、媒體、同步）、v4 PRD 的圖表規範（§7，X26 到 X40、chart-lint）、v3 PRD 的 X1 到 X25、§4.3 刻意不採用、§8 語言規範、§9 token 與元件、§11 非功能仍然有效；與 v4.2 衝突時以 v4.2 為準 |
| `../../verification/revamp-v42/` | Claude Code | V42-0 起的基準、清單與每批截圖、量測 `V42-{n}/` |

調查依據（只讀，不在 repo 內）：2026-10-15 的五份報告 `understand-item3-channel-model.md`、`understand-item4-perspectives.md`、`understand-workbench-budgets.md`、`understand-governance.md`、`understand-critic.md`。PRD 與拍板表引用時寫「報告名:行號」。

## 先讀什麼（每個 session 都要）

1. `AGENTS.md` — 專案既有規則，優先級最高；`AGENTS.md:13-14`「通路層級廣告費不分攤到 SKU。商品畫面只呈現商品毛利」是 v4.2 的硬牆。
2. 本檔 — 套件用法、批次順序、人工關卡、驗收命令。
3. 當批任務：`06_BATCHES.md` 的該批段落（含「允許變動畫面」）、該批引用的 `01_PRD.md` 章節、`GLOSSARY.md` 的對應名詞。
4. 拍板：`09_DECISIONS_PENDING.md` 的「決定」欄。
5. 財務口徑（只讀）：`docs/METRICS.md`、`docs/DATA_CONTRACT.md`、`docs/SCENARIOS.md`。

## 怎麼使用

1. **先看拍板**：`09_DECISIONS_PENDING.md`。表 A「範圍與產品」16 件（D-V42-1 到 13、15、18、23）是有實際取捨的事；表 B「技術做法」7 件（D-V42-14、16、17、19、20、21、22）每件的事項欄是一句白話，可以直接回覆「依建議值」。擋 V42-0 的是 D-V42-1 到 6（範圍與版本）、20、22（表 B：首頁首載的上限、新字串放哪些鍵）；D-V42-1 到 5 是範圍定義（第 3 項的讀法、「再多一層」的做法、品類與 SKU 的深度、綜合與交叉的範圍、放哪裡）。可以一次回覆「全部依建議值」，或逐項回覆；沒有明確回覆的事項不視為核准。D-V42-1 另請回答「是否已用自己的 CSV 匯入過多通路資料」。
2. **V41-6 先上線**：v4.2 的 labels 快照、64 張畫面基準、launch-check 19 項都以 v4.1.2 為準（D-V42-29）。
3. **一個工作階段只做一批**：照 `06_BATCHES.md` 的順序，開工時告訴 Claude Code「做 V42-{n}」。Claude Code 每次都先讀 `AGENTS.md`、`CLAUDE.md`、本檔、`06_BATCHES.md` 的該批段落與該批引用的 PRD 章節。
4. **每批結束看回報**（格式見本檔「每批回報格式」）；全部檢查通過，才開下一批。
5. **人工關卡**：V42-2a 完成後，經你當次同意 push 建 preview 給 H8（通路設定與群組）；V42-4 完成後再一次給 H9（分析視角與邊界句）；正式站到 V42-6 才切（D-V42-26）。**每一次部署（含 preview）都要你當次明確同意；`git push` 任何分支到 origin 都會建 preview，同樣要當次同意。**

## 批次順序

| 批次 | 主題 | 大小 | 依賴 | 拍板（擋批） | 另需的人工時間 |
|---|---|---|---|---|---|
| V42-0 | 基準與護欄（不改畫面；CLAUDE.md 取代；子集稽核清單） | M | V41-6 上線 | D-V42-1 到 6、20、22；同意 CLAUDE.md 草案 | 完成（2026-10-16） |
| V42-1a | 通路設定：設定模組、名稱套用與備份（不改畫面；2026-10-20 拆批） | M | V42-0 | D-V42-9、13、14 | 進行中（2026-10-20） |
| V42-1b | 通路設定：編輯器、Excel 對照列、頁面狀態、E2E | M | V42-1a | D-V42-8、13、15 | — |
| V42-G1 | 說明首頁改寫（插入批；使用者 2026-10-20 改寫稿；只動 `/guide` 一頁，不計入上線前 8 批） | S | 無（可與 V42-1a 平行） | D-V42-32、33（依建議值） | 程式與單元測試、說明頁 E2E 完成（2026-10-22）；收尾未執行：畫面基準 15 × 4、`GUIDE_MEDIA=check`、Lighthouse、launch-check、contrast-check、驗收文件 |
| V42-2a | 群組層與單一通路層：期間列兩層選單、群組範圍、「只看這個通路」、範圍文字 | M | V42-1 | D-V42-10、12 | preview（需當次同意）＋H8 約 30 分鐘 |
| V42-2b | 全部通路畫面的群組合計列（週會摘要用 `groups` 欄位，CSV 不變） | M | V42-2a | D-V42-7、11、28 | — |
| V42-3 | `product-groups.ts`、視角切換、品類與 SKU 跨通路合計視角、證據標記、邊界句 | M | V42-2a | D-V42-3、4、5、16、18、19、21 | — |
| V42-4 | 交叉表（通路 × 品類）＋通路獲利結構表、綜合 | M | V42-3 | D-V42-7、17、21、28 | preview（需當次同意）＋H9 約 30 分鐘 |
| V42-5 | 匯出與說明頁更新（底線時只做說明頁部分） | M | V42-1 到 V42-4 | D-V42-13、15 | — |
| V42-6 | 收尾與上線 | M | 全部；**H8、H9** | D-V42-6、23 | H6 後補（加 T7、T8） |

- 上線前 8 批、8 到 11 個工作階段（V42-1 拆 1a／1b 時 9 批）。依 v4 經驗，M 批約需 2 到 3 個實作代理與 1 到 2 個 E2E 代理。
- **底線（D-V42-7）**＝V42-0、V42-1、V42-2a、V42-3、V42-5（只做說明頁部分）、V42-6：自訂通路名稱與群組、整個工作台切到群組或單一通路、品類與跨通路 SKU 的商品毛利。先砍的順序：V42-5 的匯出部分、V42-2b、V42-4。新功能的說明步驟全部在 V42-5，所以底線保留的功能的說明步驟與截圖仍在 V42-5 做，上線時說明頁與工作台同步；砍掉的批次對應的說明步驟一起延後。

## 人工關卡（不屬於任何批次）

| 關卡 | 內容 | 擋住 | 材料 |
|---|---|---|---|
| H8 | 通路設定與群組確認：你本人在 preview 建兩個群組、改顯示名稱、切到群組、用「只看這個通路」切到成員；確認通路設定區、兩層選單、範圍文字與「要注意」限制句的用字（群組合計列到 V42-2b 才做，這次 preview 看不到，由 H9 一併看） | v4.2.0 正式上線 | V42-2a 後的 preview；`GLOSSARY.md` §2 |
| H9 | 分析視角與邊界句確認：你本人看商品毛利頁五個視角、交叉表、結構表；確認邊界句「品類與 SKU 的分析到商品毛利為止，通路費用與廣告費以「未分攤」整筆呈現。」的用字；另看群組合計列「{群組名} 合計」的用字 | v4.2.0 正式上線 | V42-4 後的 preview（已含 V42-2b）；`01_PRD.md` §6.2、§3.5 |
| H6 | v4 複測與盲評（沿用 v4，上線後補）；加 T7 把工作台切到一個群組、T8 在商品毛利找到品類視角並說出它到哪一層 | 依 D-V41-17＝A 不擋 | `docs/revamp-v4/usability-test.md` |

人工關卡沒完成時，`docs/STATUS.md` 寫「未執行／待人工」，不可寫成完成；批次驗收只放機器能檢查的項目。

## 與 v4.1 套件的差異

| 項目 | v4.1 | v4.2 |
|---|---|---|
| 改動範圍 | 工作台不動，只加說明頁與入口 | 工作台內改五處（商品毛利、期間列、資料來源、通路健檢與總覽的群組列、會議）；側欄、手機分頁列、頁尾、首頁空狀態不改；不加第 8 頁 |
| 財務口徑 | 不新增 | 禁區與白名單仍為空；新數字走 v4 的分級：A 級呼叫既有 domain 函式（群組合計）、B 級 application 模組（`product-groups-v1`、`category-structure-v1`）每個函式一個版本常數＋手算 golden；C 級（新公式、預測、分攤）禁止 |
| 品類與 SKU 的深度 | — | 只到商品毛利；邊界句五處；`product-groups.ts` 回傳型別只有 `ProductMetrics` |
| 備份、CSV、JSON | 不改 | 備份 v5 信封加選填 `channel_settings`（沒有設定時位元組不變）；CSV、JSON 維持通路代碼；人讀匯出用顯示名稱；Excel 加「通路設定」對照列 |
| labels 前綴 | `guide.`、`shell.guideV41.` | 加 `V42_NEW_KEY_PREFIXES` 九個前綴；第三份快照 `labels-v41.flat.json`（v4.1.2，含 `guide.zh-TW.ts`） |
| `/` First Load | ≤ V41-0 實測＋1,024 | ≤ V42-0 實測＋8,192（D-V42-20）；B5 545,397 照舊；`SPLIT_SENTINELS` 加 v4.2 面板 |
| 390 TBT | 五步 | 五步不變，加第六步「商品毛利切到品類視角」（D-V42-21） |
| testid 基準 | 四份 | 五份（`verification/revamp-v42/testids-v42-added.txt`） |
| 畫面基準 | 64 張 | 64 張（V41-6 基準）＋新畫面 17 到 22，共 88 張；每批列允許變動畫面 |
| 人工關卡 | H7 | H8、H9；H6 加 T7、T8 |
| 使用者輸入 | 說明頁沒有輸入 | 通路名稱與群組名是新的使用者輸入：驗證四條規則、只留本機、AI 快照與 `/api/*` 維持代碼、人讀匯出跳脫 |
| 邊界檔 | — | `evidence-ladder.ts`、`workspace.ts`、`copy.ts`、`workspace-backup.ts` 只能以指定方式改，`targets.ts` 不動（`06_BATCHES.md` 共同規則） |

## 禁區與邊界五條不變

沿用 D-V41-3（D-V42-25 預設沿用）；每批都跑，五條都必須為空；**不可用 `main` 比對**：

```bash
git diff --stat 625bfa5 -- src/domain fixtures docs/METRICS.md
git diff --stat 82b70df -- src/domain fixtures/golden fixtures/demo fixtures/errors fixtures/refund_only fixtures/zero_ad docs/METRICS.md
git diff --stat 625bfa5 -- src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts
git status --porcelain -- src/domain fixtures docs/METRICS.md src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts src/app/api vercel.json src/application/analytics.ts
git diff --stat 872662d -- src/app/api vercel.json src/application/analytics.ts
```

commit 之後再跑 `git diff --stat 625bfa5 HEAD -- （第一條與第三條的路徑）` 與 `git diff --stat 872662d HEAD -- src/app/api vercel.json src/application/analytics.ts`，必須為空，commit hash 寫進驗收文件。v4.2 另加一條只給驗收文件對帳用的新增檔清單（不是閘門）：`git diff --stat --diff-filter=A <前一批 commit> HEAD -- src/application tests`。新測試資料只在 `tests/fixtures/`；`fixtures/*` 不新增檔。

## 驗收命令（每批都要全部跑，照這個順序，貼真實輸出摘要；沒執行的寫「未執行」＋原因）

```bash
npm ci                    # 全新環境或 lockfile 變動時
npm run typecheck
npm run lint              # eslint --max-warnings=0
npm run audit:ui -- --json verification/revamp-v42/V42-{n}/ui-audit.json
npm run contrast-check
npm test -- --run         # 含 design-lint、copy-style、copy-density、chart-lint、testid-baseline（五份）、mounted-testids、labels-structure（三份快照）、labels-coverage、relaunch、guide-content、guide-routes、vercelignore；v4.2 新增：channel-settings（V42-1）、channel-groups（V42-2a）、product-groups（V42-3）、backup-schema-v5、backup-restore-matrix、evidence-ladder
npm run build
NETWORK_LOG_OUT=verification/revamp-v42/V42-{n}/network-log.json KEYBOARD_WALK_OUT=verification/revamp-v42/V42-{n}/keyboard-walk.json AXE_OUT=verification/revamp-v42/V42-{n}/axe.json npm run test:e2e
                          # 自己在 3100 埠起 LOCAL 伺服器，必須在下面的 PUBLIC_DEMO 伺服器啟動前跑完

NEXT_TELEMETRY_DISABLED=1 npm run build
APP_MODE=PUBLIC_DEMO PUBLIC_DEMO=true ENABLE_LIVE_AI=false npm start -- --port 3100 &
METRICS_OUT=verification/revamp-v42/V42-{n}/metrics.json FIRST_LOAD_MODULES_OUT=verification/revamp-v42/V42-{n}/first-load-modules.json CAPTURE_BATCH=V42-{n} npx playwright test --config verification/revamp-v42.capture.config.ts
                          # 畫面基準（64 張＋v4.2 新畫面）＋metrics：/ First Load ≤ V42-0 實測＋8,192、SPLIT_SENTINELS（含 v4.2 面板）與 GUIDE_SENTINELS 0 次、B2、B3、B5、B9；不設兩個 *_OUT 時會寫到別的資料夾，一定要設
GUIDE_MEDIA=check npx playwright test --config verification/guide-media.config.ts                 # 每批：與基準 PNG 比對，差異 0 張；有差異時 write、逐張寫理由、再 check 兩次
node scripts/launch-check.mjs --base http://127.0.0.1:3100 --out verification/revamp-v42/V42-{n}/launch-check-local.json   # 13 項＋19 項（V41-6 起）
npx -y lighthouse@13.5.0 --version   # 只在第一次：建立 npx 快取
node --no-warnings scripts/lighthouse-pages.mjs --base http://127.0.0.1:3100 --out verification/revamp-v42/V42-{n}   # 8 頁＋2 說明頁；V42-3 起含第六個 timespan（D-V42-21）
lsof -ti tcp:3100 | xargs kill      # 停掉 PUBLIC_DEMO 伺服器
lsof -ti tcp:3100                   # 必須沒有輸出

# 財務核心禁區與公開站邊界（五條原樣沿用；都必須為空；不可用 main 比對）
git diff --stat 625bfa5 -- src/domain fixtures docs/METRICS.md
git diff --stat 82b70df -- src/domain fixtures/golden fixtures/demo fixtures/errors fixtures/refund_only fixtures/zero_ad docs/METRICS.md
git diff --stat 625bfa5 -- src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts
git status --porcelain -- src/domain fixtures docs/METRICS.md src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts src/app/api vercel.json src/application/analytics.ts
git diff --stat 872662d -- src/app/api vercel.json src/application/analytics.ts

# v4.2 新增（對帳用，不是閘門）：本批新增的 B 級模組與測試清單，寫進驗收文件
git diff --stat --diff-filter=A <前一批 commit> HEAD -- src/application tests

# commit 之後（完成定義）：兩條都必須為空，commit hash 寫進驗收文件；commit 只留在本機，不 push
git diff --stat 625bfa5 HEAD -- src/domain fixtures docs/METRICS.md src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts
git diff --stat 872662d HEAD -- src/app/api vercel.json src/application/analytics.ts
```

- Golden 不變：本期 255.00、差額 −315.00、試算 284.00／264.00／19.70。新 golden 另立（群組對帳、品類與交叉的手算值見 PRD §11.2），不改既有數字。
- 畫面基準跨批比對：V42-n 開跑前把前一批的 `snapshots/`（V42-0 用 V41-6 的 64 張）複製過來，不帶 `--update-snapshots` 跑一次；只允許該批「允許變動畫面」有差異；新畫面第一次出現那一批建基準。
- 本機預覽：`npm run dev`，網址 http://127.0.0.1:3000 ；說明頁 http://127.0.0.1:3000/guide 。E2E 的四種視窗：1440×1000、1280×900、768×1024、390×844。

## 驗收產物

| 路徑 | 內容 |
|---|---|
| `verification/revamp-v42/V42-0-baseline.md` | v4.1.2 基準：`/` 與 404 頁的 First Load、首載 chunk、DOM 節點、390 五個 TBT、8 頁＋2 說明頁 Lighthouse、axe、keyboard-walk、network-log、`npm audit` 評估、labels 葉節點數（三份）、子集敏感分支稽核清單 |
| `verification/revamp-v42/labels-v41.flat.json` | v4.1.2 `labels.zh-TW.ts`＋`guide.zh-TW.ts` 全部字串葉節點 |
| `verification/revamp-v42/testids-v42-added.txt` | v4.2 新增的 testid（V42-0 空檔，之後每批追加） |
| `verification/revamp-v42/feature-retention.csv`、`e2e-text-assertions.csv` | 功能保留（v4.1 的 177 列沿用為「v4.1.2 已核對；v4.2 未改動」，加 `v42_location` 欄，受影響的列重新核對＋v4.2 新列）、E2E 文字斷言 |
| `verification/revamp-v42.capture.config.ts` | 畫面基準設定（沿用 `verification/revamp-v4-capture/` 的 spec；基準存 `verification/revamp-v42/V42-{n}/snapshots/`） |
| `verification/revamp-v42/V42-{n}/` | 每批四尺寸截圖、`snapshots/`、`ui-audit.json`、`metrics.json`、`first-load-modules.json`、Lighthouse、`axe.json`、`keyboard-walk.json`、`network-log.json`、`launch-check-local.json` |
| `verification/revamp-v42-V42-{n}-acceptance.md` | 每批驗收文件（含邊界檔的 diff 範圍、B 級對帳結果、備份矩陣、媒體的擷取時間與 commit） |

## 完成定義（每批共用）

- 上面的驗收命令全部真實通過，並附輸出摘要；沒執行的寫「未執行」＋原因。
- 畫面基準只有該批「允許變動畫面」有差異並逐張寫理由；`GUIDE_MEDIA=check` 差異 0 張，或有差異時已 `write` 並逐張寫理由。
- B 級對帳（群組＝成員合計、分割＝全部、Σ 品類＝通路、恆等式）與假貢獻擋牆的測試通過；備份矩陣 v1 到 v5 通過。
- `docs/STATUS.md` 新增該批段落；必要時 `docs/DECISIONS.md` 記一筆；驗收寫在 `verification/revamp-v42-V42-{n}-acceptance.md`；`06_BATCHES.md` 進度同步。
- 批次的「驗收重點」逐條標示通過／未通過，未通過的要有原因與補救批次。
- commit 訊息以 `revamp(V42-{n}): …` 開頭；commit 後兩條 diff 為空，commit hash 寫進驗收文件；不 push。
- `feature-retention.csv` 中 `batch` 欄等於本批的列全部打勾。

## 每批回報格式（繁體中文，沿用 CLAUDE.md）

1. 完成項目（對照 `06_BATCHES.md` 的該批範圍，逐項標 完成／部分／未做＋原因）
2. 變更檔案清單（新增／修改／刪除；另列邊界檔的 diff 範圍）
3. 驗收命令與真實結果（通過數、失敗數、未執行），含：禁區與邊界五條命令與 commit 後的 diff（附 commit hash）；棘輪數值（design-lint、copy-style、copy-density、chart-lint）；testid 刪除數（五份）；labels 三份快照逐字比對結果與新 key 的前綴；`/` First Load（現值、V42-0 基準、額度、差額的組成）與 `SPLIT_SENTINELS`、`GUIDE_SENTINELS` 計數；說明頁 First Load；DOM 節點數（含商品頁各視角）；390 的五個 TBT 與 loadavg（V42-3 起六個）；B 級對帳結果；備份還原矩陣；`GUIDE_MEDIA=check` 項數與差異（`write` 時逐張理由）；畫面基準差異（只列允許變動的畫面）；AI 快照負載不含名稱的測試結果
4. 瀏覽器驗收方式與截圖路徑（四尺寸至少各一張；新畫面另附）
5. 已知限制與風險（每批都重述：品類與 SKU 只到商品毛利、群組不觸發 `NEGATIVE_CHANNEL_CM`、試算單一通路、目標不配群組）
6. 下一批建議、被擋住的人工關卡（H8、H9、H6），以及需要人拍板的事項（對照 `09_DECISIONS_PENDING.md`）

## 名詞增補（v4.2；其餘沿用 v3、v4、v4.1 GLOSSARY）

完整表在 `GLOSSARY.md`。本輪新詞與不用的寫法摘要：

| 概念 | 用詞 | 不用 |
|---|---|---|
| CSV 裡的通路值 | **通路代碼** | 通路名稱（指代碼時）、原始通路 |
| 使用者改的顯示文字 | **顯示名稱** | 別名、暱稱、自訂名稱 |
| 使用者編的那一層 | **通路群組**（短名：群組） | 通路分組、通路類型、分類、層級 |
| 沒有群組的通路 | **未分組** | 其他、未歸類 |
| 從群組看成員 | **只看這個通路** | 下鑽、鑽取、展開 |
| 「by 通路／品類／SKU」 | **分析視角**（短名：視角） | 檢視、模式、維度、角色視角 |
| 依品類的商品毛利 | **商品毛利（依品類）** | 品類毛利、品類獲利、品類利潤 |
| 一個 SKU 跨通路的合計 | **SKU 跨通路合計** | SKU 總計、合併 SKU |
| 通路 × 品類的表 | **交叉表（通路 × 品類）** | 矩陣、樞紐、熱圖 |
| 費用與廣告在品類視角的呈現 | **未分攤到品類** | 其他費用、分攤後、已扣費用 |
| 品類空白的列 | **未填** | 其他、未分類、N/A |
| 各層並列的視角 | **綜合分析**（短名：綜合） | 總覽（已是頁名）、儀表板 |

## 不在本輪範圍（PRD §14）

不改 `src/domain`、fixtures、`contribution-v1`、`assist-kpi-v1`、`breakeven-mer-v1`、`docs/METRICS.md`、`docs/SCENARIOS.md`；不分攤通路費用與廣告到品類或 SKU；不開 `Scope.kind "group"`、`"category"`；群組沒有自己的規則卡、試算、目標；品類數字不進規則、待辦、會議、AI；不加第 8 頁；不改側欄、手機分頁列、頁尾、首頁空狀態；不做系統預設的通路類型；不做 X2 通路 × SKU 重排、X4 週 × 品類、逐通路橋接、品類佔比；不加品類 CSV；不改 PDF、PPT、JSON、AI 快照、`/api/*`；不新增分析事件；不換示範資料（F15 另開決定）；不加 npm 依賴。

U11（`understand-critic.md:84、126`）：公開的 `docs/ORDER_AGGREGATION.md` 指向公開使用者拿不到的 `scripts/aggregate_orders.py`，v4.2 不處理（D-V42-31 預設沿用）；是否在文件加一句來源說明或提供腳本下載，另開決定（與 V41-6 的範例檔修正相關，該檔已在正式站的 public-file 檢查內）。

## 審查 nit（只記錄）

依「避免過度微調」（使用者 2026-10-13）只修 blocker、major；下列 nit 只記錄不修。其中兩條與已套用的 major 修正重疊（H8 看不到群組合計列：H8 的確認範圍已改、群組合計列併入 H9；PRD §10 與 06 V42-2b 的畫面清單不一致：PRD §10 已同步成 06 的完整清單並寫明以 06 為準），其餘維持原狀。

1. `docs/revamp-v4.2/01_PRD.md`: §3.4 的呼叫點數字與起草時的 commit 已過時：實際 `channelLabel(` 53、`channelsLabel(` 39、`scopeLabel(` 19、`demoAlias(` 55，散在 39 個檔；repo 現在是 `835301c`（V41-6 三個整合 commit 之後），不是 `94918fe`。
2. `docs/revamp-v4.2/09_DECISIONS_PENDING.md`: D-V42-28「格數 ≤ 736」對交叉表沒有約束力：736 是 G11 的 8 通路 × 92 天上限，交叉表最多 8 × 12 ＝ 96 格。
3. `docs/revamp-v4.2/01_PRD.md`: S3（原 B3）第二條「序列化後正規式 `/fee|ad_spend|contribution|mer|burden/` 比對 0 次」會被使用者資料誤觸（SKU 或品類字串含 `mer`，例如 `SUMMER-01`），而且對合成資料的保證來自鍵集合那一條，不是正規式。
4. `docs/revamp-v4.2/01_PRD.md`: §4.1 群組選項值用「含控制字元前綴的 token」放進 `<option value>`，SSR 的 HTML 會含 U+0000–U+001F 字元（HTML 解析錯誤但可容忍），比對與除錯不便；用一個精靈不會接受的可見前綴即可達到防碰撞。
5. `docs/revamp-v4.2/01_PRD.md`: §4.1 選單選取值的三條規則沒有定義優先順序與兩個邊界：只有一個成員的群組（範圍 `[x]` 同時等於群組與單一通路），以及所有通路都在同一個群組（群組成員集合等於全部）。
6. `docs/revamp-v4.2/06_BATCHES.md`: H8 要使用者在 V42-2a 後的 preview 確認「群組列」，但群組列在 V42-2b 才做；依賴鏈 V42-2a →（preview、H8）→ V42-2b 下，H8 看不到群組列。（已隨 major 修正：H8 的確認範圍改為通路設定、兩層選單、範圍文字、限制句；群組合計列併入 H9。）
7. `docs/revamp-v4.2/06_BATCHES.md`: V42-2a 的新畫面 18「期間列群組展開 × 4」無法用畫面基準拍到：原生 `<select>` 的下拉清單由瀏覽器／OS 繪製，headless Chromium 的 `toHaveScreenshot` 不會把它畫進頁面截圖。
8. `docs/revamp-v4.2/01_PRD.md`: §10 的畫面基準列與 06 V42-2b 的允許變動畫面不一致（PRD 寫 01、02、05、10，06 多列了 08 會議表）。（已隨 major 修正：PRD §10 同步成 06 的完整清單，並在 06 寫明允許變動畫面以 06 為準。）
9. `docs/revamp-v4.2/01_PRD.md`: §5.3 X3「每個品類列可展開成通路 × SKU 列」超出 `ChartDataTable` 既有能力（固定欄、每列一個 actionColumn，沒有可展開子列），且 `<tr>` 內不能放 `<details>`。
10. `docs/revamp-v4.2/01_PRD.md`: §5.4 P3「出現在幾個通路（計數，A 級）」與 v4 分級不一致：計數、分桶是 B 級（§6.3 自己引用的 v4 PRD §4.0），而且計數不是金額，不該做成 number-link。
11. `docs/revamp-v4.2/01_PRD.md`: §6.3「`product-groups.ts` 的新 import：`aggregateSales`、`sumUnits`、`uniqueSources`」漏列投影需要的函式：`productMetrics`／`withUnits` 沒有從 `src/domain/analysis.ts` 匯出，模組要自己用 `PRODUCT_METRICS`＋`countMetric`（`@/domain/aggregation`）＋`calculateMetrics` 重做投影。
12. `docs/revamp-v4.2/01_PRD.md`: §4.4 的子集敏感分支清單漏了抽屜副標：`evidenceSubtitle` 在範圍不等於資料集全部通路時列出成員，群組範圍下會顯示成員代碼而不是群組名。
13. `docs/revamp-v4.2/01_PRD.md`: §10「程式全部隨頁載入，只有字串與期間列的少量程式進首載」不準確：D-V42-14 讓 `createSnapshot`／`copy.ts` 吃解析器，`channel-settings.ts` 的驗證與解析程式因此進 `/` 首載。
14. `docs/revamp-v4.2/GLOSSARY.md`: #3 引用 `docs/ENGINEERING.md:225` 的「通路分組」實際在 :227；#6「單一通路」沿用的 key `labels.scenarios.checks.singleChannelRequired` 是一整句提示，不是名詞。
15. `docs/revamp-v4.2/06_BATCHES.md`: V42-2a 與 V42-3 都是 M 卻各含一個新模組＋多頁改動＋四尺寸 E2E＋三個頁面狀態＋說明媒體重拍（V42-3 另加第六步 TBT 與證據標記）；以 v4「商品頁 1 M、健檢 2 M」的經驗，兩批都有拆成 a／b 的風險，06 只對 V42-1 預告拆批。
16. `docs/revamp-v4.2/GLOSSARY.md`: §2 標題「三句限制」但表有 4 列，末句寫「這四句」；06、00_README 的 H8 也寫「三句」。
17. `docs/revamp-v4.2/01_PRD.md`: 文件內文用 GLOSSARY 禁用的詞當概念名：「下鑽」21 次（PRD 8、06 6、00 3、09 2、GLOSSARY 2）、「矩陣」「樞紐」在 PRD 敘述中出現；GLOSSARY #7、#15 把它們列為不使用。
18. `docs/revamp-v4.2/09_DECISIONS_PENDING.md`: D-V42-20 估「150 到 250 條新字串」，PRD §9 估「20 到 40 加 100 到 200 條」（120 到 240）。
19. `docs/revamp-v4.2/09_DECISIONS_PENDING.md`: D-V42-25 列在「預設沿用」卻新增第六條對帳命令（`git diff --stat --diff-filter=A …`），不是純粹沿用；另 06 共同規則把 `docs/SCENARIOS.md` 列入禁區但沒有任何 diff 命令涵蓋它。
20. `docs/revamp-v4.2/09_DECISIONS_PENDING.md`: 邊界句在引號內再用「」巢狀（「…以「未分攤」整筆呈現。」），使用者原話用的是『』內層引號；全套件兩種寫法並存。
21. `docs/revamp-v4.2/GLOSSARY.md`: #11「控制與分頁寫 視角」的「分頁」與 PRD §5.4「沿用完整表的分頁」（翻頁）同字異義；D-V42-5 的控制是 segmented，不是分頁。
22. `docs/revamp-v4.2/01_PRD.md`: §4.4 列的五個子集敏感行號（weekly-summary.ts:115-116、waterfall.ts:267-268、pptx-export.ts:134、decision-export.ts:204、meeting.ts:385）沒有報告出處；審查時在 repo 核對過都成立（都是 everyChannel 或 channelsLabel 寫法），只缺「起草時核對」註記。

---

## CLAUDE.md 更新草案（V42-0 開工時整份取代；使用者同意開工後才改）

開工時以下列內容**整份取代** `CLAUDE.md`（下方是完整檔案，不是逐段替換）。把拍板日期與結果填入〔〕標示處，填完前不要貼上。

````markdown
# EC ProfitLens — Claude Code 工作指令（v4.2）

EC ProfitLens 是「電商獲利診斷與決策工作台」：匯入三份日粒度 CSV（銷售、通路費用、廣告），依序計算淨營收、商品毛利、扣廣告前貢獻、扣廣告後貢獻四層，做兩期比較、九項金額橋接、規則健檢、假設試算、待辦與會議輸出。所有金額由 `src/domain` 的純函式計算，每個數字可追溯到 CSV 檔名與行號。

產品名稱為 **EC ProfitLens**（D-V3-25）。使用者看得到的名稱一律寫 EC ProfitLens；技術識別不改：package 名 `profitlens`、下載檔名前綴 `profitlens-`、備份 schema 字串、`dataset_id`、網址 `profitlens-tau.vercel.app`。

本輪目標（v4.2，基準 v4.1.2＝tag `v4.1.2`＝commit〔填寫〕，目標 v4.2.0〔依 D-V42-6〕）：使用者 2026-10-15 的指示是「現階段所有分析只能分為『DTC』『Marketplace』，這部分需讓使用者能客製化設定為自己擁有的通路來分析，並且要能夠再多一層的單一通路分析」與「分析視角要有『by 通路』『by品類』『by SKU』的個別分析以及綜合分析、交叉分析」。**在工作台裡加通路設定（顯示名稱、順序、使用者自己編的群組，跟著備份走；D-V42-1〔填寫〕）、期間列的兩層通路選單（群組、群組裡的單一通路；D-V42-2〔填寫〕）、商品毛利頁的視角切換（品類、SKU 跨通路合計、通路 × 品類交叉表、綜合；D-V42-4、5〔填寫〕）。四層金額全部由既有 `src/domain` 函式以通路子集計算；品類與 SKU 只到商品毛利，通路費用與廣告費不分攤、以「未分攤」整筆呈現（D-V42-3〔填寫〕）；不動 `src/domain`、`fixtures/*`、`docs/METRICS.md`；不加 npm 依賴。** 同一則訊息的第 1、2 項由 V41-6（v4.1.2）處理，不在本輪。使用者已於〔日期〕授權依 PRD 開工，D-V42-1 到 31 的決定（含 8 件預設沿用）見 `docs/revamp-v4.2/09_DECISIONS_PENDING.md`〔填寫：全部依建議值，或列出例外〕。

## 先讀什麼（每個 session 都要）
1. `AGENTS.md` — 專案既有規則，**優先級最高**；本檔只補充，不覆蓋。`AGENTS.md:13-14`「通路層級廣告費不分攤到 SKU。商品畫面只呈現商品毛利；SKU 篩選不可帶入全通路費用產生假貢獻」是本輪的硬牆。
2. `docs/revamp-v4.2/00_README.md` — v4.2 套件的用法、批次順序、人工關卡、驗收命令。
3. 當批任務：`docs/revamp-v4.2/06_BATCHES.md` 中指定的 V42 批次（含「允許變動畫面」「同批 labels 與測試」）、該批引用的 `docs/revamp-v4.2/01_PRD.md` 章節（用 Read 的 offset／limit 讀需要的段落）。
4. 拍板與名詞：`docs/revamp-v4.2/09_DECISIONS_PENDING.md`、`docs/revamp-v4.2/GLOSSARY.md`、`docs/revamp-v4/GLOSSARY.md`、`docs/revamp-v3/GLOSSARY.md`、`docs/revamp-v4.1/00_README.md` 的名詞增補。
5. 財務口徑（只讀）：`docs/METRICS.md`、`docs/DATA_CONTRACT.md`、`docs/SCENARIOS.md`。

v4.1 套件 `docs/revamp-v4.1/*` 與 v4 套件 `docs/revamp-v4/*` 保留為歷史紀錄；v4.1 的說明頁規範（路由、媒體、同步、import 邊界）、v4 PRD 的圖表規範（§7，含 X26 到 X40 與 chart-lint）、v3 PRD 的 §5.2 X1 到 X25、§4.3 刻意不採用、§8 語言規範、§9 token 與元件、§11 非功能仍然有效。與 v4.2 文件衝突時以 v4.2 為準，與 AGENTS.md 衝突時以 AGENTS.md 為準。

## 本輪的硬規則（補充 AGENTS.md）
- **一次只做一個批次（V42-0 到 V42-6，含 2a／2b；上線前 8 批），一批就是一個工作階段，不跨批。** 批次完成前不開始下一批；每批結束要有可運行、全部檢查通過的狀態。批次太大時要在**開工前**拆成 V42-{n}a／b 並寫進 `06_BATCHES.md`。元件、labels、測試與第一個使用它的頁面同批交付。
- **人工關卡不屬於任何批次**：H8（通路設定、兩層選單、範圍文字、限制句，V42-2a 後）、H9（分析視角、邊界句、群組合計列，V42-4 後）擋 v4.2.0 正式上線、不擋批次；H6（v4 複測與盲評，加 T7、T8）上線後補。沒完成時 `docs/STATUS.md` 寫「未執行／待人工」，不可寫成完成。
- **拍板**：以 `docs/revamp-v4.2/09_DECISIONS_PENDING.md` 的「決定」欄為準（預設沿用的 8 件照表上的預設）。之後新出現的待決事項，沒有使用者明確回覆就不視為核准，拍板前沿用 v4.1.2 的行為與用詞。**任何部署（含 Vercel preview）都要使用者當次明確同意**（D-V42-26 只定策略）。**`git push` 任何分支到 origin 都會由 Vercel Git 整合建立 preview，視同部署；沒有使用者當次明確同意不 push（含 `revamp/v4.2`）。**
- **財務核心禁區（沿用 v4，白名單為空）**：`src/domain/*`、`fixtures/*`（只讀，不新增檔）、`metric_version = contribution-v1`、`assist-kpi-v1`、`breakeven-mer-v1`、`docs/METRICS.md`、`docs/SCENARIOS.md` 完全不動；`src/application/assist-kpi.ts`、`src/application/breakeven-mer.ts`、`tests/assist-kpi.test.ts`、`tests/breakeven-mer.test.ts` 一個字都不改。**新數字只在 `src/application`**：A 級＝呼叫既有 domain 函式取既有值（群組合計走 `aggregatePeriod` 子集、`compareMoney`、`buildBridge`；品類與交叉對帳走 `analyzeProducts`），不加版本常數；B 級＝新分組或新值（`product-groups.ts`＝`product-groups-v1`、`category-structure-v1`），每個函式一個版本常數＋手算 golden＋與 domain 對帳的測試（D-V4-15）；C 級（新公式、預測、分攤、系統代填假設）禁止。新測試資料只在 `tests/fixtures/`。
- **品類與 SKU 只到商品毛利（D-V42-3）**：`product-groups.ts` 的每桶 `metrics` 鍵集合 ⊆ `PRODUCT_METRICS ∪ {units_sold}`，回傳型別只有 `ProductMetrics`，投影在同一個函式內完成（`aggregateSales` 的費用欄是 `0n`，不投影會漏出假貢獻）；序列化後 `/fee|ad_spend|contribution|mer|burden/` 比對 0 次；`EvidenceSelection` 帶 `category` 時 `ladderMetrics` 回 null；交叉表格內永遠不出現費用、廣告、貢獻，通路的扣廣告後貢獻只在列尾並寫「通路層；未分攤到品類」；邊界句「品類與 SKU 的分析到商品毛利為止，通路費用與廣告費以「未分攤」整筆呈現。」放 PRD §6.2 的五處。要求分攤時回覆這是 C 級且需要使用者修改 `AGENTS.md:13-14`，不在實作裡偷做。
- **群組與品類都不開 domain（D-V42-12）**：沒有 `Scope.kind "group"`、`"category"`；群組是 `kind "all"` 加成員清單；群組沒有「扣廣告後為負」規則卡、試算仍單一通路（群組範圍下試算頁的通路選單只列成員）、目標只對全部通路或單一通路配對；三句限制（`GLOSSARY.md` §2）放「要注意」與說明頁，主層不寫否定句。
- **公開站邊界（D-V42-27）**：`src/app/api/*`、`vercel.json`、`src/application/analytics.ts` 對 `872662d` 不改；不碰 `.env*`；`APP_MODE=PUBLIC_DEMO`、`ENABLE_LIVE_AI=false`、`/api/insights` 的 server 端封鎖邏輯不動；不新增分析事件。每批驗收跑五條命令，結果寫進驗收文件，五條都必須為空；**不可用 `main` 比對**：
  - `git diff --stat 625bfa5 -- src/domain fixtures docs/METRICS.md`
  - `git diff --stat 82b70df -- src/domain fixtures/golden fixtures/demo fixtures/errors fixtures/refund_only fixtures/zero_ad docs/METRICS.md`
  - `git diff --stat 625bfa5 -- src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts`
  - `git status --porcelain -- src/domain fixtures docs/METRICS.md src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts src/app/api vercel.json src/application/analytics.ts`
  - `git diff --stat 872662d -- src/app/api vercel.json src/application/analytics.ts`
  - commit 之後再跑 `git diff --stat 625bfa5 HEAD -- （第一條與第三條的路徑）` 與 `git diff --stat 872662d HEAD -- src/app/api vercel.json src/application/analytics.ts`，必須為空，commit hash 寫進驗收文件；另列 `git diff --stat --diff-filter=A <前一批 commit> HEAD -- src/application tests` 當對帳用的新增檔清單
- **允許變動畫面取代「工作台不動」**：每批只允許 `06_BATCHES.md` 列出的畫面有差異，其餘 0 差異。v4.2 會改的頁：商品毛利（視角切換、交叉表）、期間列（兩層通路選單）、資料來源（通路設定區）、通路健檢與總覽（群組合計列）、會議（通路寬表與週會摘要的 `groups` 欄位，CSV 不變）；側欄、手機分頁列、頁尾、首頁空狀態不改，不加第 8 頁。期間列行高不變（B1、B2 首屏 0 px 餘裕）。「只看這個通路」只在資料集有群組時渲染，示範資料的畫面與說明截圖不變。
- **邊界檔（不在五條命令裡，只能以指定方式改，驗收文件逐一寫出 diff 範圍）**：`src/application/evidence-ladder.ts` 只加「`category` 有值時回 null」，`tests/evidence-ladder.test.ts` 既有輸出不變；`src/application/workspace.ts` 的 `filter_hash` 仍只由 `report.scope` 算，`createSnapshot` 只加第 4 個選填參數 `settings`、快照只加選填 `channel_names`（10 個呼叫點每處都傳入 `Active.channel_settings`，清單見 PRD §3.4）；`src/application/copy.ts` 的 `channelLabel`、`channelsLabel`、`scopeLabel`、`categoryLabel` 改收解析器，示範別名變成 `synthetic-demo*` 的隱含預設（永遠不寫進 `channel_settings`），既有字串逐字不變；`src/application/workspace-backup.ts` 只加選填 `channel_settings`〔依 D-V42-9〕（設定與預設沒有差時不寫鍵），`restoreV4` 讀出設定後才建快照、對未知通路代碼丟棄並提示；`src/application/manager-summary.ts` 的 `channels` 陣列不變（CSV），群組合計只加選填 `groups`；`src/application/targets.ts` 不動。
- **使用者輸入的名稱**：顯示名稱與群組名比照 `import-guidance.ts:58` 驗證（去頭尾空白後非空、前後沒有空格、≤ 200 字、沒有控制字元），NFC 正規化後在通路與群組之間不重複；只進人讀的文字；CSV 的 `channel` 欄、AI facts、備份的 `active.filters`、`filter_hash`、`dataset_hash` 一律維持通路代碼；寫進 CSV 與 XLSX 的人讀欄位時跳脫（含 `=`、`+`、`-`、`@` 開頭）；AI 快照負載不含名稱（單元測試）；不存 `localStorage`、不用模組全域變數。
- **標籤單一來源（D-V42-22）**：使用者看得到的中文只在兩個檔：工作台在 `src/i18n/labels.zh-TW.ts`，說明頁在 `src/i18n/guide.zh-TW.ts`（只給伺服器模組 import）。新 key 只放 `V42_NEW_KEY_PREFIXES`：`data.channelSettingsV42.`、`shell.periodBarV42.`、`shell.scopeV42.`、`overview.channelsV42.`、`diagnosis.channelsV42.`、`meeting.channelsV42.`、`products.perspectivesV42.`、`exports.v42.`、`storage.v42.`（`labels.zh-TW.ts`）與 `guide.`（`guide.zh-TW.ts`）；`LABEL_GROUPS` 維持 24 組；每批在兩個檔加「── V42-n 錨點」註解；既有字串一字不改（`verification/revamp-v4/labels-v3.flat.json` 2,581 個、`verification/revamp-v41/labels-v4.flat.json` 2,839 個、`verification/revamp-v42/labels-v41.flat.json` 的全部葉節點逐鍵逐字相同）；`products.perspectivesV42.*` 計入「賠錢」「虧損」黑名單與 L1 子句長度；JSX 內不新寫中文；指標名一律取 `metricDefinitions`；新字串都是陳述句，不含問號、驚嘆號、箭頭字元、「注意：」，用詞照 `docs/revamp-v4.2/GLOSSARY.md`。
- **測試斷言的字串跟著標籤走**：一律 `import { labels } from "@/i18n"`（說明頁另 import `guideLabels`）再斷言；新畫面只用 testid 與 labels 斷言。測試失敗不是「跳過」的理由。
- **顯示格式只在呈現層**（沿用 v4）：萬／億、HALF_UP、U+2212、`favorableDirectionOf`、`formatAxisWan`、`formatHeatCell` 只改 `src/application/presentation.ts`、`copy.ts`。不可為了讓測試過而改 golden 數字（本期 255.00、差額 −315.00、試算 284.00／264.00／19.70）；新 golden 另立（PRD §11.2）。
- **圖表規範（沿用 v4）**：照 v4 PRD §7 與 X1 到 X40、chart-lint CL-1 到 CL-11；交叉表用 `ChartDataTable` 表模式（D-V42-17），熱表 token 維持只用在 G11、G21，類別色不用；X38：群組列取自 domain 群組合計，不是跨列相加；品類視角每視角主層 ≤ 1 張圖，商品頁主層 ≤ 3 張；排名只列前 N 加「另 n 個」；真正的 0.00 畫 0。
- **效能**：群組合計列與視角表在元件內 `useMemo` 懶算，不進 `createSnapshot`、`applyFilters`；非預設視角的本體是可直接 import 的模組 `src/components/products/perspectives/{category,sku-total,cross,combined}.tsx`（SSR 頁面狀態直接 import 它們渲染），商品頁只以 `createChunkLoader`／`next/dynamic` 包載入點成子 chunk＋`useDeferredMount`，`tests/lazy-panels.test.tsx` 反向檢查商品頁 chunk 不靜態 import 它們；只渲染目前的視角（M1 不適用於視角切換，D-V42-5）；通路設定區在 `workspace-panels` chunk；`PRELOAD_CHUNKS` 的 `insideTimespans` 必須為空；上限：通路 ≤ 8（群組列、交叉表）、品類欄 ≤ 12、格數 ≤ 736，超過退清單式表（D-V42-28）。
- **棘輪與基準**：`tests/design-lint.test.ts`、`tests/copy-style.test.ts`、`tests/chart-lint.test.ts`、`tests/copy-density.test.ts` 的數值只能下降；`tests/testid-baseline.test.ts` 對 `verification/revamp-v3/testids-v2.txt`、`verification/revamp-v4/testids-v3.txt`、`verification/revamp-v4/testids-v4-added.txt`、`verification/revamp-v41/testids-v41-added.txt`、`verification/revamp-v42/testids-v42-added.txt`（每批追加本批新增的 testid）五份的刪除數都必須為 0；`tests/mounted-testids.test.tsx` 每批都跑；`verification/revamp-v4-capture/metrics.spec.ts` 的 B2、B3、B5、B9 照 v4 斷言，另加 `/` First Load ≤ V42-0 實測＋〔依 D-V42-20：8,192〕bytes、`SPLIT_SENTINELS`（帶引號的 testid 字面值：`"channel-settings"`、`"products-perspective"`、`"products-perspective-cross"`）與 `GUIDE_SENTINELS` 在 `/` 首載 chunk 0 次、說明頁 First Load ≤ 框架基準＋5,120、非預設視角的 B9 ≤ 首批基準＋1,500，執行時一定要設 `METRICS_OUT`、`FIRST_LOAD_MODULES_OUT` 指到 `verification/revamp-v42/V42-{n}/`；390 五個 TBT 依 D-V4-36、D-V4-47，〔依 D-V42-21〕V42-3 起加第六步「商品毛利切到品類視角」；畫面基準每批先複製前一批的 `snapshots/`（V42-0 用 V41-6 的 64 張）再比對，只允許該批「允許變動畫面」有差異；`verification/revamp-v42/feature-retention.csv` 沿用的列寫「v4.1.2 已核對；v4.2 未改動」，`batch` 欄等於本批的列全部打勾，V42-6 只確認這些列；B 級對帳（群組＝成員合計、分割＝全部、Σ 品類＝通路、恆等式）與備份矩陣 v1 到 v5 每批列結果。
- **說明頁與媒體同步（沿用 v4.1）**：每批 `GUIDE_MEDIA=check` 0 差異；改到被拍到的畫面時同批 `GUIDE_MEDIA=write` 只更新有差異的媒體、逐張寫理由、再 `check` 兩次；影片是否重錄以 cue 比對為準（側欄不動就不重錄；要重錄時用本機 `ffmpeg`，D-V41-7＝A）；說明頁截圖用示範資料或 `tests/fixtures/synthetic-4-channel`，圖說註明虛構的合成資料；不新增功能區，sitemap 仍 13 個網址；每次發版 0 差異才能上線。
- **依賴**：本輪「允許新增 npm 依賴」清單為**空**。`ffmpeg` 只在重錄影片時當本機工具，不進 `package.json`。其他依賴變動（含只動 lockfile 的傳遞依賴）一律先問。
- **隱私與公開站邊界不變**：不加登入、資料庫、伺服器端保存；原始 CSV 不上傳；通路設定只在記憶體、備份與同意後的本機保存；`network-log.spec` 的下載集合維持 5 種、無 POST。
- **可追溯性不變**：工作台每個金額都能開「計算與來源」；群組格的來源＝成員通路來源的聯集；品類桶、SKU 桶、交叉格的來源只有 `sales_daily.csv` 的列（空桶加 `manifest.json`）；抽屜欄位照 PRD §8；`daily_complete` 的差異寫進驗收。
- **a11y 與 testid 不退步**：既有 `data-testid`、`aria-*`、`role="status"`、`<details>/<summary>` 結構保留。新 testid 用 `channel-settings`、`channel-settings-row-{code}`、`channel-settings-group-{groupId}`、`scope-select`、`scope-option-group-{groupId}`、`group-row-{groupId}`、`channel-drill-{code}`、`products-perspective`、`products-perspective-{view}`、`chart-products-{id}`（id 只用 `[a-z][a-z0-9]*`：`category`、`catvariance`、`skutotal`、`cross`；資料表 `-table`、柱 `-bar-cat-{category}`、格 `-cell-{channel}-cat-{category}`，`-table` 之後不再接任何東西，CL-2 的 `CHART_TESTID_RE`）、`products-structure-{channel}`（C3 結構表，在 `.chart-frame` 之外）、`products-combined-{block}`，不用陣列索引；交叉表是原生 `<table>` 有 `caption` 與 `th scope`；視角切換鍵盤可達；任何 Tab 停留點都不在 `[aria-hidden=true]` 內。Lighthouse Accessibility 不低於同頁基準且 ≥ 95；四尺寸 axe 0 個 serious。
- **程式風格**：沿用既有風格（Tailwind v4 + `globals.css` 自訂 class、長行 JSX）。只改動需要的區塊；新樣式用既有 token，不寫死色碼、不加字級種類；新 token 同批加進 `scripts/contrast-check.mjs` 的 PAIRS。
- **避免過度微調**（使用者 2026-10-13）：審查只修 blocker、major；nit 只記錄；不加規格以外的調整。
- **文件同步**：每批結束更新 `docs/STATUS.md`（真實執行結果；未執行寫「未執行」）、必要時在 `docs/DECISIONS.md` 加一筆、把本批驗收寫到 `verification/revamp-v42-V42-{n}-acceptance.md`，截圖與量測存 `verification/revamp-v42/V42-{n}/`；`06_BATCHES.md` 的進度欄同步。

## 驗收命令（每批都要全部跑，照這個順序，貼真實輸出摘要）
```bash
npm ci                 # 全新環境或 lockfile 變動時
npm run typecheck
npm run lint           # eslint --max-warnings=0
npm run audit:ui -- --json verification/revamp-v42/V42-{n}/ui-audit.json
npm run contrast-check
npm test -- --run      # 含 design-lint、copy-style、copy-density、chart-lint、testid-baseline（五份）、mounted-testids、labels-structure（三份快照）、labels-coverage、relaunch、guide-content、guide-routes、vercelignore、channel-settings、channel-groups、product-groups、backup-schema-v5、backup-restore-matrix、evidence-ladder
npm run build
NETWORK_LOG_OUT=verification/revamp-v42/V42-{n}/network-log.json KEYBOARD_WALK_OUT=verification/revamp-v42/V42-{n}/keyboard-walk.json AXE_OUT=verification/revamp-v42/V42-{n}/axe.json npm run test:e2e
                       # 自己在 3100 埠起 LOCAL 伺服器，必須在下面的 PUBLIC_DEMO 伺服器啟動前跑完
NEXT_TELEMETRY_DISABLED=1 npm run build
APP_MODE=PUBLIC_DEMO PUBLIC_DEMO=true ENABLE_LIVE_AI=false npm start -- --port 3100 &
METRICS_OUT=verification/revamp-v42/V42-{n}/metrics.json FIRST_LOAD_MODULES_OUT=verification/revamp-v42/V42-{n}/first-load-modules.json CAPTURE_BATCH=V42-{n} npx playwright test --config verification/revamp-v42.capture.config.ts
GUIDE_MEDIA=check npx playwright test --config verification/guide-media.config.ts   # 每批；差異 0 張
node scripts/launch-check.mjs --base http://127.0.0.1:3100 --out verification/revamp-v42/V42-{n}/launch-check-local.json   # 13＋19
npx -y lighthouse@13.5.0 --version   # 只在第一次：建立 npx 快取
node --no-warnings scripts/lighthouse-pages.mjs --base http://127.0.0.1:3100 --out verification/revamp-v42/V42-{n}   # V42-3 起含第六個 timespan
lsof -ti tcp:3100 | xargs kill   # 停掉 PUBLIC_DEMO 伺服器；之後 lsof -ti tcp:3100 必須沒有輸出
git diff --stat 625bfa5 -- src/domain fixtures docs/METRICS.md
git diff --stat 82b70df -- src/domain fixtures/golden fixtures/demo fixtures/errors fixtures/refund_only fixtures/zero_ad docs/METRICS.md
git diff --stat 625bfa5 -- src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts
git status --porcelain -- src/domain fixtures docs/METRICS.md src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts src/app/api vercel.json src/application/analytics.ts
git diff --stat 872662d -- src/app/api vercel.json src/application/analytics.ts
git diff --stat --diff-filter=A <前一批 commit> HEAD -- src/application tests   # 對帳用，不是閘門
# commit 之後：git diff --stat 625bfa5 HEAD -- （第一條與第三條的路徑）與 git diff --stat 872662d HEAD -- src/app/api vercel.json src/application/analytics.ts，都必須為空，commit hash 寫進驗收文件；不 push
```
本機預覽：`npm run dev`，網址 http://127.0.0.1:3000 （說明頁 `/guide`）。E2E 的四種視窗：1440×1000、1280×900、768×1024、390×844。

## 每批回報格式（繁體中文）
1. 完成項目（對照 `docs/revamp-v4.2/06_BATCHES.md` 的該批範圍，逐項標 完成／部分／未做＋原因）
2. 變更檔案清單（新增／修改／刪除；另列邊界檔的 diff 範圍）
3. 驗收命令與真實結果（通過數、失敗數、未執行），含禁區與邊界五條命令與 commit 後的 diff（附 commit hash）、棘輪數值（design-lint、copy-style、copy-density、chart-lint）、testid 刪除數（五份）、labels 三份快照的比對結果、`/` 與說明頁的 First Load JS（含差額組成、`SPLIT_SENTINELS`、`GUIDE_SENTINELS`）、DOM 節點數（含商品頁各視角）、390 的五個 TBT 與 loadavg（V42-3 起六個）、B 級對帳結果、備份還原矩陣、說明媒體同步檢查結果、畫面基準差異（只列允許變動的畫面）、AI 快照負載不含名稱的測試結果
4. 瀏覽器驗收方式與截圖路徑（四尺寸至少各一張；新畫面另附）
5. 已知限制與風險（每批重述：品類與 SKU 只到商品毛利、群組不觸發 `NEGATIVE_CHANNEL_CM`、試算單一通路、目標不配群組）
6. 下一批建議、被擋住的人工關卡（H8、H9、H6），以及需要人拍板的事項（對照 `docs/revamp-v4.2/09_DECISIONS_PENDING.md`）

## 檔案地圖（本輪會碰到的）
| 位置 | 內容 | v4.2 批次 |
|---|---|---|
| `src/application/channel-settings.ts`（新）、`tests/channel-settings.test.ts`（新） | 通路設定的型別、驗證、解析器、群組解析；`channel-settings-v1` | V42-1 |
| `src/application/channel-groups.ts`（新）、`tests/channel-groups.test.ts`（新） | 群組合計（A 級：`aggregatePeriod`、`compareMoney`、`buildBridge`）；精確性測試 | V42-2a（測試）、V42-2b（模組） |
| `src/application/product-groups.ts`（新）、`tests/product-groups.test.ts`（新） | B 級 `product-groups-v1`：品類桶、SKU 桶、交叉格，只投影到 `PRODUCT_METRICS`；`category-structure-v1` | V42-3、V42-4 |
| `src/application/copy.ts`、`workspace.ts`、`workspace-backup.ts`、`evidence-ladder.ts`（邊界檔） | 解析器、`channel_names`、`channel_settings`、`category` 標記 | V42-1、V42-3 |
| `src/components/workspace-panels.tsx` | 資料來源頁「通路設定」區 | V42-1 |
| `src/components/shell/period-bar.tsx`、`dashboard.tsx` | 兩層通路選單、選取值邏輯、範圍文字 | V42-2a |
| `src/components/channel-table.tsx`、`overview/charts/channel-section.tsx`、`src/application/manager-summary.ts` | 群組合計列、「只看這個通路」（只在有群組時渲染）；`manager-summary` 只加選填 `groups`，`channels` 與 CSV 不變 | V42-2a、V42-2b |
| `src/components/multi-scenario-workbench.tsx` | 群組範圍下的通路選單只列成員 | V42-2a |
| `src/components/product-comparison-panel.tsx`、`src/components/products/perspectives/{category,sku-total,cross,combined}.tsx`（新）、`src/components/product-evidence.ts`、`src/components/lazy-panels.tsx`、`tests/lazy-panels.test.tsx` | 視角切換、P2 到 P5 的視角模組（可直接 import，給 SSR 狀態）、證據 builder、載入點與子 chunk、反向 import 檢查 | V42-3、V42-4 |
| `src/components/evidence-drawer.tsx` | `EvidenceSelection.category` | V42-3 |
| `src/application/excel-export.ts`、`pptx-export.ts`、`weekly-summary.ts`、`meeting.ts`、`decision-export.ts`、`waterfall.ts` | 群組範圍的範圍文字、「通路設定」對照列、`categories` 工作表（選配） | V42-1、V42-2a、V42-5 |
| `src/i18n/labels.zh-TW.ts`、`src/i18n/guide.zh-TW.ts` | `V42_NEW_KEY_PREFIXES` 下的新 key；說明頁新步驟 | V42-1 起每批 |
| `src/application/guide.ts`、`verification/guide-media/`、`public/guide/**` | 說明頁新步驟與截圖 | V42-5 |
| `tests/labels-structure.test.ts`、`verification/revamp-v42/labels-v41.flat.json` | `V42_NEW_KEY_PREFIXES`、v4.1.2 字串快照 | V42-0 |
| `scripts/lib/copy-scan.mjs` | `products.perspectivesV42.*` 的黑名單與 L1 | V42-0 |
| `tests/testid-baseline.test.ts`、`verification/revamp-v42/testids-v42-added.txt` | 第五份 testid 基準 | V42-0 起 |
| `tests/helpers/page-states.tsx`、`tests/mounted-testids.test.tsx` | `overview-many-channels`、`data-channel-settings`、`*-grouped`、`products-*` 狀態 | V42-0 起 |
| `tests/e2e/channel-groups.spec.ts`、`tests/e2e/product-perspectives.spec.ts`（新） | 四尺寸 E2E | V42-1 起、V42-3 起 |
| `verification/revamp-v42.capture.config.ts`（新）、`verification/revamp-v4-capture/metrics.spec.ts`、`scripts/lighthouse-pages.mjs` | 畫面基準（64＋新畫面）、First Load 門檻、`SPLIT_SENTINELS`、第六步 timespan | V42-0 起 |
| `tests/backup-schema-v5.test.ts`、`backup-restore-matrix.test.ts`、`workspace-backup.test.ts`、`auto-save.test.ts` | `channel_settings` 的矩陣 | V42-1 |
| `package.json`、`package-lock.json` | 版本 4.2.0 | V42-6 |
| `README.md`、`docs/RELEASES.md`、`docs/ENGINEERING.md`、`tests/release-notes.test.ts`、`docs/revamp-v4/usability-test.md` | 發布紀錄（含備份相容提示）、T7、T8 | V42-6 |
| `docs/revamp-v4.2/*` | v4.2 規格、批次、拍板、名詞、套件說明 | 每批對照與更新進度 |
````
