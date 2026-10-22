# 06 v4.2 分批任務（V42-0 到 V42-6）

> 由 `docs/revamp-v4.2/01_PRD.md` 展開；拍板表在 `09_DECISIONS_PENDING.md`，名詞在 `GLOSSARY.md`。規格以 PRD 為準，PRD 有更新時同步本檔；**允許變動畫面以本檔為準**，PRD §10 的畫面基準列只是本檔清單的摘要。
>
> 每批格式：大小／範圍／依賴（含拍板與人工關卡）／允許變動畫面／驗收重點（共通驗收以外）／同批 labels 與測試。
>
> **目前進度：規劃中，未開工。** 基準：v4.1.2（V41-6 完成並上線後的 tag；D-V42-29）。起草時 `revamp/v4.1`＝`94918fe`，正式站 v4.1.1＝`36659ff`，`origin/main`＝`66c241a`（`understand-governance.md:3`）。V41-6 沒上線就不開 V42-0。

---

## 共同規則（每批都適用）

- **一次只做一批，不跨批；一批就是一個工作階段。** 每批結束時產品可以運行、所有檢查都通過。批次太大時在**開工前**拆成 V42-{n}a／b 並寫進本檔（V42-1 很可能要拆：名稱解析器要碰 35 個檔約 170 個呼叫點，備份與還原矩陣另一組測試；`understand-item3-channel-model.md:286-290、304-306`）。元件、labels、測試與第一個使用它的頁面同批交付。
- **人工關卡不屬於任何批次**：H8、H9、H6 沒完成時，`docs/STATUS.md` 寫「未執行／待人工」。
- **拍板規則**：以 `09_DECISIONS_PENDING.md` 的「決定」欄為準；沒有明確回覆就不視為核准，受影響的批次不開工；拍板前沿用 v4.1.2 的行為與用詞。**任何部署（含 preview）都要使用者當次明確同意**（D-V42-26 只定策略）。**`git push` 任何分支到 origin 都會由 Vercel Git 整合建立 preview，視同部署；沒有使用者當次明確同意不 push（含 `revamp/v4.2`）。**
- **允許新增 npm 依賴：無。** `ffmpeg` 只在重錄影片時當本機工具（D-V41-7＝A 已允許）。其他依賴變動（含只動 lockfile 的傳遞依賴）一律先問。
- **財務核心禁區（沿用 v4，白名單為空）**：`src/domain/*`、`fixtures/*`（只讀，不新增檔）、`contribution-v1`、`assist-kpi-v1`、`breakeven-mer-v1`、`docs/METRICS.md`、`docs/SCENARIOS.md`、`src/application/assist-kpi.ts`、`src/application/breakeven-mer.ts`、`tests/assist-kpi.test.ts`、`tests/breakeven-mer.test.ts` 一個字都不改。新數字全部在 `src/application`：A 級呼叫既有 domain 函式（群組合計走 `aggregatePeriod`，品類與交叉對帳走 `analyzeProducts`），B 級模組每個函式一個版本常數＋手算 golden＋與 domain 對帳（D-V42-16）；C 級（新公式、預測、分攤）禁止。新測試資料只在 `tests/fixtures/`。
- **公開站邊界（D-V42-27，預設沿用；第五條）**：`src/app/api/*`、`vercel.json`、`src/application/analytics.ts` 對 `872662d` 不改；不碰 `.env*`；`APP_MODE=PUBLIC_DEMO`、`ENABLE_LIVE_AI=false` 不動；不新增分析事件；使用者輸入的名稱與群組只留本機，AI 快照與 `/api/*` 的負載維持通路代碼。
- **品類與 SKU 只到商品毛利**：`product-groups.ts` 回傳型別只有 `ProductMetrics`；任何品類、SKU、交叉格不得出現費用、廣告、貢獻、MER、費用負擔；邊界句（PRD §6.2）同批放進介面與說明頁。
- **允許變動畫面取代「工作台不動」**：每批只允許本檔列出的畫面有差異，其餘 0 差異（v4 的做法）。v4.2 會改的頁：商品毛利、期間列、資料來源、通路健檢與總覽的群組列、會議的通路寬表與週會摘要。側欄、手機分頁列、頁尾、首頁空狀態不改（不加第 8 頁）。
- **邊界檔（不在五條命令裡，但只能以指定方式改；驗收文件逐一寫出 diff 範圍）**：`src/application/evidence-ladder.ts` 只加「`category` 有值時回 null」的分支，`tests/evidence-ladder.test.ts` 既有輸出不變；`src/application/workspace.ts` 的 `filter_hash` 仍只由 `report.scope` 算，`createSnapshot` 只加第 4 個選填參數 `settings`、快照只加選填 `channel_names`（D-V42-14；10 個呼叫點見 PRD §3.4）；`src/application/copy.ts` 的四個函式改吃解析器，示範別名變成 `synthetic-demo*` 的預設設定，既有字串逐字不變；`src/application/workspace-backup.ts` 只加 `channel_settings`，`restoreV4` 對未知通路代碼丟棄並提示；`src/application/targets.ts` 不動。
- **標籤單一來源（D-V42-22）**：使用者看得到的中文只在 `src/i18n/labels.zh-TW.ts`（工作台）與 `src/i18n/guide.zh-TW.ts`（說明頁）；新 key 只在 `V42_NEW_KEY_PREFIXES` 下（`data.channelSettingsV42.`、`shell.periodBarV42.`、`shell.scopeV42.`、`overview.channelsV42.`、`diagnosis.channelsV42.`、`meeting.channelsV42.`、`products.perspectivesV42.`、`exports.v42.`、`storage.v42.`；說明頁仍在 `guide.`）；`LABEL_GROUPS` 維持 24 組；既有字串一字不改（v3 2,581、v4 2,839 與 V42-0 產生的 `verification/revamp-v42/labels-v41.flat.json` 三份逐鍵逐字相同）；每批在兩個檔加「── V42-n 錨點」註解；JSX 內不新寫中文；指標名一律取 `metricDefinitions`。
- **棘輪與基準（v4、v4.1 全部沿用）**：design-lint、copy-style、copy-density、chart-lint 只降不升；testid 對 `verification/revamp-v3/testids-v2.txt`、`verification/revamp-v4/testids-v3.txt`、`verification/revamp-v4/testids-v4-added.txt`、`verification/revamp-v41/testids-v41-added.txt`、`verification/revamp-v42/testids-v42-added.txt` 五份的刪除數都是 0；mounted-testids 每批都跑；B2 首屏、B3 390 無橫向捲動、B9 DOM 節點、390 五個 TBT（D-V4-36、D-V4-47）照 v4 斷言；`/` First Load ≤ V42-0 實測＋8,192 bytes（D-V42-20）且 B5 545,397 照舊；`SPLIT_SENTINELS`（含 v4.2 面板）與 `GUIDE_SENTINELS` 在 `/` 首載 chunk 0 次；network-log 下載集合恰好 5 種、無 POST；golden 不變（255.00、−315.00、284.00／264.00／19.70）。
- **畫面基準的跨批比對**：V42-n 開跑前，把前一批的 `verification/revamp-v42/V42-(n−1)/snapshots/`（V42-0 用 V41-6 的 64 張）複製到 `verification/revamp-v42/V42-n/snapshots/`，不帶 `--update-snapshots` 跑一次；只允許該批「允許變動畫面」有差異，確認後只更新允許的畫面，驗收文件逐張寫理由。新畫面（17 起）放新的 spec 檔，不動凍結的 01 到 09 走查。
- **說明媒體同步**：每批 `GUIDE_MEDIA=check` 0 差異；改到被拍到的畫面時同批 `GUIDE_MEDIA=write` 只更新有差異的媒體、逐張寫理由、再 `check` 兩次；影片是否重錄以 cue 比對為準（側欄不動就不重錄）；每次發版 0 差異才能上線。
- **共通驗收**（每批都要全部跑，照 `00_README.md`「驗收命令」的順序，貼真實輸出摘要；沒執行的寫「未執行」＋原因）：typecheck、lint、audit:ui、contrast-check、`npm test -- --run`、build、E2E（三個 `*_OUT`）、PUBLIC_DEMO build 與 start、capture（`METRICS_OUT`、`FIRST_LOAD_MODULES_OUT` 指到 `verification/revamp-v42/V42-{n}/`）、`GUIDE_MEDIA=check`、launch-check（13＋19）、Lighthouse（8 頁＋2 說明頁；V42-3 起含第六個 timespan）、停掉 3100、四尺寸截圖、禁區與邊界五條（皆空；**不可用 `main` 比對**）、新增檔對帳清單、`docs/STATUS.md`、必要時 `docs/DECISIONS.md`、驗收文件、本檔進度欄。
- commit 訊息以 `revamp(V42-{n}): …` 開頭；commit 後跑 `git diff --stat 625bfa5 HEAD -- src/domain fixtures docs/METRICS.md src/application/assist-kpi.ts src/application/breakeven-mer.ts tests/assist-kpi.test.ts tests/breakeven-mer.test.ts` 與 `git diff --stat 872662d HEAD -- src/app/api vercel.json src/application/analytics.ts`，都必須為空，commit hash 寫進驗收文件。commit 只留在本機，不 push。
- 「避免過度微調」（使用者 2026-10-13，`docs/DECISIONS.md:364`）：審查只修 blocker、major；nit 只記錄。不加規格以外的調整。
- **每批都要重述的已知限制**：品類與 SKU 只到商品毛利；群組不觸發 `NEGATIVE_CHANNEL_CM`；試算單一通路；目標不配群組。

---

## 人工關卡（不屬於任何批次）

| 關卡 | 內容 | 擋住 | 估計時間 | 材料 |
|---|---|---|---|---|
| H8 通路設定與群組確認（D-V42-23） | 使用者本人在 preview 上：建兩個群組、改顯示名稱、切到群組、用「只看這個通路」切到成員；確認範圍只有 V42-2a 的 preview 看得到的東西：通路設定區、兩層選單、範圍文字「{群組名} · {通路名}」、「要注意」的限制句（`GLOSSARY.md` §2）的用字；群組合計列到 V42-2b 才做，由 H9 一併看；有修改就在下一個批次或 V42-6 套用 | v4.2.0 正式上線 | 約 30 分鐘 | V42-2a 後的 preview（需當次同意 push） |
| H9 分析視角與邊界句確認（D-V42-23） | 使用者本人在 preview 上看商品毛利頁五個視角：視角名稱、交叉表可讀性、C3 結構表、邊界句用字（PRD §6.2）；另看 V42-2b 的群組合計列（G4 精簡表、通路寬表、週會摘要）的用字「{群組名} 合計」 | v4.2.0 正式上線 | 約 30 分鐘 | V42-4 後的 preview（需當次同意 push；已含 V42-2b） |
| H6 v4 複測與盲評（沿用 v4；D-V41-17） | 沿用 `docs/revamp-v4/usability-test.md`，T5 答案欄已由 V41-6 改成「操作導覽」；本輪加 T7（把工作台切到一個群組）、T8（在商品毛利找到品類視角並說出它到哪一層） | 不擋 v4.2.0 | 約 1 週 | `usability-test.md`（V42-6 加兩題） |

---

## 批次總表

| 批次 | 主題 | 大小 | 依賴（批次、拍板、人工關卡） | 狀態 |
|---|---|---|---|---|
| V42-0 | 基準與護欄（不改畫面；CLAUDE.md 取代；子集稽核清單） | M | V41-6 上線；D-V42-1 到 6、20、22；使用者同意 CLAUDE.md 草案 | 完成（2026-10-16；E2E 1,143／0／29；64 張 0 差異；`/` 首載 519,705（V42-1 起門檻 527,897）；390 TBT 五項通過；labels 快照 3,163；子集稽核 31 條；驗收見 `verification/revamp-v42-V42-0-acceptance.md`） |
| V42-1a | 通路設定：設定模組、名稱套用（`createSnapshot` 第 4 個參數、解析器、35 個檔）與備份（不改畫面） | M | V42-0；D-V42-9、13、14 | 進行中（2026-10-20 開工） |
| V42-1b | 通路設定：編輯器（資料來源頁）、Excel 對照列、頁面狀態、E2E | M | V42-1a；D-V42-8、13、15 | 未開工 |
| V42-G1 | 說明首頁改寫（插入批；使用者 2026-10-20 提供改寫稿）：副標、為什麼、幫哪些人、獨特性（3 主張＋1 前提）、刻意不做的事、30 秒上手引言；只動 `/guide` 一頁，不碰工作台與 `labels.zh-TW.ts` | S | 無（不依賴 V42-1a／1b；D-V42-32、33 依建議值） | 程式與單元測試、說明頁 E2E 完成（2026-10-22；不計入上線前 8 批）；收尾未執行：畫面基準 15 × 4、`GUIDE_MEDIA=check`、Lighthouse、launch-check、contrast-check、`feature-retention.csv` GH1 列、驗收文件；跑完並寫進 `docs/STATUS.md` 與驗收文件後才改「完成」（見本檔 V42-G1 節） |
| V42-2a | 群組層與單一通路層：期間列兩層選單、群組範圍、範圍文字、下鑽、子集稽核修正 | M | V42-1；D-V42-10、12 | 未開工 |
| （preview） | 經使用者當次同意 push `revamp/v4.2` 建 preview，給 **H8** 用（D-V42-26） | — | V42-2a | — |
| V42-2b | 全部通路畫面的群組合計列：`channel-groups.ts`、G4 精簡表、通路寬表、週會摘要的 `groups` 欄位（CSV 不變） | M | V42-2a；D-V42-7（含本批）、11、28 | 未開工 |
| V42-3 | `product-groups.ts`（`product-groups-v1`）、視角切換、P2 品類（X3、X5）、P3 SKU 跨通路合計、證據標記、邊界句 | M | V42-2a（範圍文字）；D-V42-3、4、5、16、18、19、21 | 未開工 |
| V42-4 | P4 交叉表（X1）＋C3 結構表、P5 綜合（C2）；第六步 TBT 基準 | M | V42-3；D-V42-7（含本批）、17、21、28 | 未開工 |
| （preview） | 經使用者當次同意建 preview，給 **H9** 用 | — | V42-4 | — |
| V42-5 | 匯出與說明頁更新：人讀匯出的名稱、Excel `categories` 工作表（選配）、說明頁四個功能區的新步驟與截圖（D-V42-7 底線時只做說明頁部分） | M | V42-1 到 V42-4（底線時 V42-1、2a、3）；D-V42-13、15 | 未開工 |
| V42-6 | 收尾與上線：版本 4.2.0、RELEASES（含備份相容提示）、README、ENGINEERING、release-notes 測試、PRD §2.2 實測值、套用 H8／H9 的修改、上線 | M | 全部批次；D-V42-6、23；**H8、H9**（擋正式上線） | 未開工 |

上線前 8 批、8 到 11 個工作階段（V42-1 拆成 1a／1b 時 9 批；`understand-workbench-budgets.md:106-111` 估 9 到 11，含已移出的 V41-6）。依 v4 經驗，M 批約需 2 到 3 個實作代理與 1 到 2 個 E2E 代理。人工時間：H8、H9 各約 30 分鐘，兩次 preview 的同意。

**MVP 切線（D-V42-7）**：先砍的順序是 V42-5 的匯出部分、V42-2b（群組合計列）、V42-4（交叉與綜合）。底線＝**V42-0、V42-1、V42-2a、V42-3、V42-5（只做說明頁部分）、V42-6**：使用者能自訂通路名稱與群組、能把整個工作台切到群組或單一通路、能看品類與跨通路 SKU 的商品毛利；交叉表與綜合延到 v4.3。新功能的說明步驟全部在 V42-5，所以底線保留的功能（通路設定、群組範圍、品類與 SKU 視角）的說明步驟與截圖仍在 V42-5 做，上線時說明頁與工作台同步；砍掉的批次對應的說明步驟一起延後；**被改到的既有截圖仍每批重拍**（規則不能砍）。

依賴鏈：V42-0、V42-1、V42-2a、（preview、H8）、V42-2b、V42-3、V42-4、（preview、H9）、V42-5、V42-6。

---

## V42-0 基準與護欄（M；不改任何畫面）

**範圍**
1. 分支 `revamp/v4.2` 自 `origin/main`（v4.1.2 發布 commit）開出；不 push。以 `00_README.md` 末節草案整份取代 `CLAUDE.md`（使用者同意開工後，〔〕填入拍板結果）。
2. labels：產生 `verification/revamp-v42/labels-v41.flat.json`（v4.1.2 的 `labels.zh-TW.ts`＋`guide.zh-TW.ts` 全部字串葉節點，鍵依碼位排序；產生方式寫進 `V42-0-baseline.md`）；`tests/labels-structure.test.ts` 加 `V42_NEW_KEY_PREFIXES`（D-V42-22 的清單），三份快照逐鍵逐字比對；`LABEL_GROUPS` 24 組不變。本批不加 key。
3. 掃描規則：`scripts/lib/copy-scan.mjs` 的 `SCOPED_BLACKLIST`「賠錢」「虧損」範圍擴到 `products.perspectivesV42.*`；`L1_KEY_PATTERNS` 加 `products.perspectivesV42.*.title`；本批沒有新 key，違規 0。
4. testid：新增 `verification/revamp-v42/testids-v42-added.txt`（只有表頭）；`tests/testid-baseline.test.ts` 改成比五份。
5. 畫面基準與量測：新增 `verification/revamp-v42.capture.config.ts`（`testDir` 仍是 `revamp-v4-capture`，`snapshotPathTemplate` 改到 `verification/revamp-v42/{batch}/snapshots/`）；複製 V41-6 的 64 張為 V42-0 基準，不帶 `--update-snapshots` 跑，0 差異。`verification/revamp-v4-capture/metrics.spec.ts`：記錄 V42-0 的 `/` First Load（`V42_HOME_FIRST_LOAD_BASELINE`，門檻＝實測＋8,192，V42-1 起斷言）；`SPLIT_SENTINELS` 預留 v4.2 面板 testid 的位置（本批 0 個）；非預設視角的 B9 基準欄位預留。
6. 390 TBT：低負載各 3 次取中位數與 loadavg，五項寫進 `V42-0-baseline.md`；`scripts/lighthouse-pages.mjs` 為第六步留位置，不量。
7. **子集敏感分支稽核（唯讀）**：把 PRD §4.4 列的分支逐一讀過並寫成清單（`excel-export.ts:473`、`decision.ts:94-96`、`channel-table.tsx:93`、`action-workspace.ts:197-198`、`dashboard.tsx:605`、`filter_hash` 的全部使用處、`weekly-summary.ts:115-116`、`waterfall.ts:267-268`、`pptx-export.ts:134`、`decision-export.ts:204`、`meeting.ts:385`、會議與 AI 快照負載、備份還原後的範圍顯示），每一條標「V42-2a 修」或「不受影響＋理由」。不改程式。另補一個 `overview-many-channels` 頁面狀態（9 通路）目視 G4 的擁擠程度（PRD §15）。
8. 功能保留：`verification/revamp-v42/feature-retention.csv` 延續 v4.1 的 177 列並加 `v42_location` 欄；沿用列寫「v4.1.2 已核對；v4.2 未改動（covering_tests 全過）」；會受影響的列（期間列通路篩選、資料來源頁版本與來源資訊、通路寬表、G4、週會摘要、商品頁、備份、匯出）標上預計批次；加 v4.2 新列（通路設定、群組範圍、群組列、單一通路下鑽、品類視角、SKU 視角、交叉表、C3、綜合、Excel 對照列、說明新步驟）。`e2e-text-assertions.csv` 延續。
9. 基準紀錄 `verification/revamp-v42/V42-0-baseline.md`：First Load（`/`、404 頁）、首載 chunk 清單、DOM 節點、390 五個 TBT、8 頁＋2 說明頁 Lighthouse、axe、keyboard-walk、network-log、`npm audit`（8 high 的評估再記一次）、labels 葉節點數（三份）、子集稽核清單。

**依賴**：V41-6 上線（D-V42-29）；D-V42-1 到 6、20、22；使用者同意 CLAUDE.md 草案。

**允許變動畫面**：無。64 張與 V41-6 0 差異。

**驗收重點**：64 張 0 差異；三份 labels 快照逐字相同；testid 五份刪除 0；禁區與邊界五條皆空；`GUIDE_MEDIA=check` 0 差異（V41-6 後的項數以實際為準）；launch-check 13＋19；基準全部寫入 `verification/revamp-v42/V42-0/`；子集稽核清單每條都有處置；copy-scan 新規則對既有字串 0 違規。

**同批 labels 與測試**：labels 值不動；改 `tests/labels-structure.test.ts`、`tests/testid-baseline.test.ts`、`scripts/lib/copy-scan.mjs`、`verification/revamp-v4-capture/metrics.spec.ts`、`scripts/lighthouse-pages.mjs`（留位）、`tests/helpers/page-states.tsx`（`overview-many-channels`）；新增 capture config 與三個 `verification/revamp-v42/` 清單檔。

---

## V42-1 通路設定（M；2026-10-20 開工前拆成 1a／1b）

開工前評估：第 2 項（`createSnapshot` 第 4 個參數、`copy.ts` 四個函式改收解析器、35 個檔約 175 處呼叫點改讀 `snapshot.channel_names`）加第 4 項（備份 schema、還原順序、四份備份測試）本身就是一個 M 批，而且**不改任何畫面**；第 3、5、7、8 項（編輯器、對照列、頁面狀態、E2E、說明頁）才會改畫面。拆開後 1a 的畫面基準 0 差異、驗收簡單，1b 只剩 UI。兩批都依賴 D-V42-8、9、13、14、15。原第 1–8 項的內容原樣分到下面兩節，沒有刪減。

### V42-1a 設定模組、名稱套用與備份（M；不改任何畫面）

**範圍**
1. 新純模組 `src/application/channel-settings.ts`（PRD §3.1）：型別（`version: "channel-settings-v1"`、`channels[] { code, label?, group?, order? }`、`groups[] { id, label, order }`）、對 `manifest.channels` 的驗證與名稱清理（四條規則、NFC、通路與群組之間不重複、可等於自己的代碼）、未知代碼丟棄並回報、`synthetic-demo*` 的預設設定＝既有 `demoChannelAlias`（隱含預設，永遠不寫進備份）、與預設比對後的正規化（等於預設的欄位去掉、剩空就是「沒有設定」）、名稱解析器（代碼 → 顯示名稱；群組依成員集合解析，順序無關）、`order` 穩定排序；`tests/channel-settings.test.ts`。
2. 名稱套用（D-V42-14）：`createSnapshot(dataset, filters, hash, settings?)` 加第 4 個選填參數，解析結果放進 `WorkspaceSnapshot` 的選填 `channel_names`（代碼 → 顯示名稱）與選填 `channel_groups`（群組 id、名稱、成員代碼，給 V42-2a 用），`filter_hash`、`dataset_hash` 不變；repo 的 10 個呼叫點每處都傳入 `Active.channel_settings`（`src/components/dashboard.tsx` 3 處、`meeting-page.tsx`、`multi-scenario-workbench.tsx`、`src/application/action-workspace.ts`、`review-session.ts`、`workspace-backup.ts` 3 處；備份還原在 `restoreV4` 讀出 `payload.channel_settings` 之後才建快照；清單見 PRD §3.4）；`Active` 加選填 `channel_settings`（React state，本批沒有 UI 寫入它）；`copy.ts` 的 `channelLabel`、`channelsLabel`、`scopeLabel`、`categoryLabel` 改收解析器（過渡期同時接受舊的 `alias: boolean`，整合後移除），35 個檔的呼叫點改讀 `snapshot.channel_names`；所有既有字串與示範／golden 的匯出位元組不變；單元測試「試算頁單一通路快照與還原後快照的範圍文字等於設定的顯示名稱」；子集稽核 12c（`review-session.ts:126` 的單一通路 `scopeLabel`）在本批改成解析器；驗收文件列改到的檔數。
3. 儲存（D-V42-9）：v5 信封加選填 `payload.channel_settings`，沒有設定時不寫鍵（「沒有設定」＝與預設沒有差）；還原時丟棄未知代碼並以既有的還原提示機制提示（字串 `storage.v42.*`）；`tests/backup-schema-v5.test.ts`（加「示範資料未改設定時備份文字逐位元組等於 v4.1.2」）、`backup-restore-matrix.test.ts`、`workspace-backup.test.ts`、`auto-save.test.ts` 同批；v1 到 v4 信封帶 `channel_settings` 一律 `INVALID_WORKSPACE_FORMAT`；示範與 golden 的備份輸出位元組不變。
4. 隱私：AI 快照負載不含顯示名稱與群組名（單元測試）；開工時查 `docs/AI_CONTRACT.md` 與現有寫出函式（CSV、XLSX 人讀欄位）的跳脫並記在驗收文件。
5. 人讀匯出的範圍文字改用解析器（Excel 範圍文字、PPT、一頁摘要、週會摘要、會議紀錄）；CSV、JSON 維持代碼；對照列留到 1b。

**依賴**：V42-0；D-V42-9、13、14。

**允許變動畫面**：無。64 張與 V42-0 0 差異（沒有 UI；`channel_settings` 沒有值時所有畫面與匯出逐位元組相同）。

**驗收重點**：既有字串逐字相同（三份快照）；示範／golden 的匯出位元組不變（`export-numeric-baseline` 與備份位元組測試）；備份矩陣 v1 到 v5 全部還原；有設定時備份往返相等；試算頁單一通路快照與還原後快照的範圍文字等於設定的顯示名稱；AI 快照負載不含名稱；`/` First Load 差額只含 `channel-settings.ts` 與 `copy.ts`／`workspace.ts` 的改動（寫出差額組成）；390 五項不退；`GUIDE_MEDIA=check` 0 差異。

**同批 labels 與測試**：`storage.v42.*`（還原提示；「── V42-1a 錨點」）；`testids-v42-added.txt` 不追加（沒有新 testid）；`feature-retention.csv` 中 `batch`＝V42-1 的備份與匯出列打勾（其餘 V42-1 列在 1b）。

### V42-1b 編輯器、對照列與 E2E（M）

**範圍**
1. 編輯器（D-V42-8）：資料來源頁 `DataWorkspace` 的「通路設定」區（`<details>` 收合；每個通路一列：顯示名稱、群組、順序；按鈕「新增群組」「套用設定」；「要注意」`<details>` 放「顯示名稱只改畫面；CSV、備份與 AI 用的仍是通路代碼。」）；在 `workspace-panels` chunk 內，不進 `/` 首載。套用時寫進 `Active.channel_settings` 並重算快照（走既有的 `applyFilters` 路徑）。本批群組只能建立與指派，還不能在期間列選（V42-2a）。
2. 匯出對照列（D-V42-15）：Excel「版本與來源」加「通路設定」對照列（代碼、顯示名稱、群組），只加列；人讀欄位跳脫（含 `=`、`+`、`-`、`@` 開頭）。
3. 頁面狀態 `data-channel-settings`（synthetic-4-channel 加設定：自有＝DTC＋SOCIAL、平台＝MARKETPLACE＋LIVE）；`mounted-testids` M1（收合內容保持掛載）；E2E 四尺寸：在資料來源頁設定名稱與群組、下載備份再還原、顯示名稱出現在總覽與健檢；`keyboard-walk` 加通路設定區的里程碑。
4. 說明頁：`data` 區既有截圖若被改到，同批 `write`；新步驟文字留到 V42-5。

**依賴**：V42-1a；D-V42-8、13、15。

**允許變動畫面**：09 資料來源 × 4（通路設定區預設收合時只多一行 summary）；新 17 通路設定編輯器展開 × 4。其餘 0 差異（期間列本批不改）。

**驗收重點**：B9 資料來源頁 ≤ 2,629；390 資料來源 TBT 不退（會升，要量）；`GUIDE_MEDIA=check` 0 差異或已 `write` 並寫理由；`/` First Load 差額只含新字串（首載 chunk 清單無新元件模組）；備份往返含編輯器寫入的設定。

**同批 labels 與測試**：`data.channelSettingsV42.*`、`exports.v42.*`（「── V42-1b 錨點」）；`testids-v42-added.txt` 追加 `channel-settings`、`channel-settings-row-{code}`、`channel-settings-group-{groupId}`；`feature-retention.csv` 中其餘 `batch`＝V42-1 的列打勾。

---

## V42-G1 說明首頁改寫（插入批；使用者 2026-10-20 提供改寫稿）

使用者 2026-10-20 提供 `/guide` 說明首頁的改寫稿（Claude Docs 文件「EC ProfitLens /guide 改寫稿（行銷角度）」，主流程逐字抄錄到 scratchpad `v42/guide-rewrite-draft.md`；D-V41-10／11：動機段可用使用者提供的文字）並指示套用。這是插入批：不在「上線前 8 批」裡、不依賴 V42-1a／1b、不改工作台任何畫面、不碰 `labels.zh-TW.ts` 與 `src/application`，可以和 V42-1a 平行；一個工作階段。改寫前先做兩份唯讀地圖（M1 結構地圖與實作計畫、M2 逐句事實核對），不屬實或部分屬實的句子依 M2 改成產品裡成立的說法，不留行銷句。

**範圍**（只有 `/guide` 一頁；H1、兩顆按鈕、本頁目錄（含第 3 項「這套服務有什麼獨特性？」）、各功能區索引、示範影片與逐步文字、頁尾、11 個功能區頁都不動）
1. 副標 `guide.hub.intro`（不再引用 `brand.description`，改成說明頁自己的一句；D-V42-32）與 meta description `guide.hub.description`。
2. 「為什麼做這套服務」：`why.lead` 逐字不動（`GUIDE_SENTINELS`）；`why.body.0`、`why.body.1`、`why.status` 改寫（結語的「最快的方法是」因說明頁最高級黑名單改「直接」）。
3. 「幫哪些人解決哪些問題」：引言、三個角色的「以前怎麼做」「在這裡怎麼做」、顧問／財務一句改寫（三句「想知道」與改寫稿逐字相同、不算改動）；欄名、「從哪裡開始」的連結（`GUIDE_WHO`）、「適合誰，還沒涵蓋什麼」不動。
4. 「這套服務有什麼獨特性？」：v4.1 的 7 項改成 3 個主張（有序清單）＋1 個前提（不編號、角色卡樣式），每項固定四段「一般做法／在這裡（幾點）／對你的意義／在哪裡看得到（功能區連結）」；資料常數在新檔 `src/components/guide/guide-hub-data.ts`（`GUIDE_HUB_CLAIMS`、`GUIDE_HUB_PREMISE`、`GUIDE_HUB_UNIQUE_KEYS`、`GUIDE_TRADEOFF_KEYS`、`GUIDE_TRADEOFF_LINKS`），因為本批對 `src/application` 零改動（`guide.ts` 的 `GUIDE_UNIQUE` 留著、V42-G1 起沒有頁面讀它）。連結文字一律是功能區標題（`GuideAreaRef`），`traceable` 仍連 `/guide/overview#bridge`。
5. 「這些做法的代價」改名「刻意不做的事」（改寫稿的「我們刻意不做的事」含語氣黑名單「我們」）：引言、三點、結語；第一點附「相關說明：匯入資料」連到 `/guide/import`（改寫稿的「有整理工具說明 → /docs/ORDER_AGGREGATION.md」含箭頭字元，而且說明首頁的站內連結只有 `/`、`/guide/{area}`；整理工具說明的連結在匯入資料頁的「開始前」）。
6. 「30 秒上手」加一行引言 `quickstart.lead`；四步與影片不動。
7. 依事實改寫（M2 核對；D-V42-33）：後台「只有成交金額和廣告 ROAS」→「看得到」；「欄位自動對照」→「由系統先對照、你再確認」；「要賣到多少才打平」→「才打平（扣廣告後貢獻 = 0）」；「決定有沒有兌現，下週開會時自動對帳」→「決定做到哪裡，下次開會時自動列出上次決議與置頂待辦的狀態」；「匯出 PDF、Excel…」→「匯出成 PDF、Excel…」（「匯出 PDF」是按鈕名）；「一鍵加入待辦」→「可以直接加入待辦」；兩處破折號改逗號；19 處介面字串改 `{ui:}` 引用（渲染後與改寫稿同字）。
8. 護欄例外（D-V42-32）：`tests/labels-structure.test.ts` 加「── V42-G1 錨點」——改值 15 鍵＋新增 31 鍵凍結在 `verification/revamp-v42/labels-guide-rewrite.flat.json`（只含這些鍵），刪除 15 鍵明列在 `V42_G1_REMOVED_KEYS`；例外清單必須恰好等於實際差異，`labels.zh-TW.ts` 的 2,842 鍵與 guide 其餘 291 鍵仍逐字凍結，`GUIDE_SENTINELS` 不在例外裡。

**依賴**：無（D-V42-32、33 依建議值；使用者提供改寫稿即指示）。

**允許變動畫面**：15 說明首頁首屏 × 4（副標在首屏）。其餘 60 張 0 差異；工作台 0 差異（`labels.zh-TW.ts` 不動、`/` 首載不變）。本批在工作樹只跑單元測試與說明頁 E2E，畫面基準的更新與 Lighthouse 留給收尾（下方「執行結果」如實寫）。

**驗收重點**：typecheck、lint 0、`audit:ui`（copy 四項黑名單不升）、`npm test -- --run` 全過（guide-content、guide-routes、labels-structure 三個改過的測試＋copy-style、design-lint、labels-coverage、testid-baseline 五份 0）、build、說明頁 E2E 四尺寸（`guide.spec`、`axe-sweep` 0 serious、`keyboard-walk` 的 `-guide` 鍵；在 3103 埠跑，不佔 3100）；`GUIDE_SENTINELS`（`guide.hub.title`、`guide.why.lead`）逐字不變；邊界：`git diff --stat 4ed65c7 HEAD -- src/domain fixtures docs/METRICS.md src/app/api vercel.json src/application` 必須為空；不加 testid、不加 npm 依賴、不 push。

**同批 labels 與測試**：`guide.zh-TW.ts` 加「── V42-G1 錨點」；新鍵 `guide.unique.fields.{before,after,meaning}`、`guide.unique.items.{traceable,judgment,loop}.{title,before,after.0-2,meaning}`、`guide.unique.items.premise.{title,after.0-1,meaning}`、`guide.tradeoffs.{lead,items.sync,items.accounts,items.judgment,closing}`、`guide.quickstart.lead`（31）；改值 `guide.hub.{intro,description}`、`guide.why.{body.0,body.1,status}`、`guide.who.{lead,also}`、`guide.who.roles.{boss,manager,operator}.{before,after}`、`guide.unique.lead`、`guide.sections.tradeoffs`（15）；刪 `guide.unique.items.{evidence,bridge,rules,scenarios,meeting,local,taiwan}.{title,body}`、`guide.tradeoffs.body`（15）；`tests/guide-content.test.ts`、`tests/guide-routes.test.tsx`、`tests/labels-structure.test.ts`；`testids-v42-added.txt` 不追加；`verification/revamp-v41/e2e-text-assertions.csv` 不加列。

例外快照的產生方式（在 repo 根目錄；只保留和 v4.1.2 快照不同或 v4.1.2 沒有的 `guide.` 鍵）：

```bash
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
import { loadGuideLabels } from "./scripts/lib/load-labels.mjs";
import { labelEntries } from "./scripts/lib/copy-scan.mjs";
const v41 = JSON.parse(readFileSync("verification/revamp-v42/labels-v41.flat.json", "utf8"));
const guide = await loadGuideLabels();
const entries = labelEntries(guide).filter(([path, value]) => v41[path] !== value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
writeFileSync("verification/revamp-v42/labels-guide-rewrite.flat.json", JSON.stringify(Object.fromEntries(entries), null, 2) + "\n");
console.log(`changed ${entries.filter(([p]) => p in v41).length} added ${entries.filter(([p]) => !(p in v41)).length}`);
'
# 輸出：changed 15 added 31
```

**執行結果**（2026-10-22，工作樹 `worktree-wf_4f423fca-ae6-3`，基準 `4ed65c7`；commit hash 見 `git log`）：typecheck 通過；lint 0；`audit:ui`（JSON 在主流程 scratchpad `v42/g1-ui-audit.json`）copy 指標與 V42-0 相同（blacklistSynonym 12、blacklistTone 0、blacklistJargon 0、arrows 0、noticePrefix 0、l1ClauseOverLimit 0；JSX 中文 0）；`npm test -- --run` 167 檔／3,583 全過（V42-0 是 3,577；＋6＝labels-structure 的 V42-G1 護欄 5、guide-routes 1）；`npm run build` 通過；說明頁 E2E（`guide.spec`、`axe-sweep`、`keyboard-walk`，四尺寸，3103 埠，設定檔是 `playwright.config.ts` 只改埠號的副本）83 通過／0 失敗／9 略過（略過的全是 keyboard-walk 既有的尺寸限制：七頁與 `/guide` 走查只跑 1440 與 390、768 走查只跑 tablet）；axe `guide-hub` 四尺寸 serious 0、違規 0；keyboard-walk `/guide`（1440、390 相同）里程碑 開啟工作台 1、本頁目錄第一項 3、影片控制 32，`aria-hidden` 內停留點 0、原生媒體停留點 2；`GUIDE_SENTINELS`（`guide.hub.title`、`guide.why.lead`）逐字不變（labels-structure 斷言）；邊界 `git diff --stat 4ed65c7 -- src/domain fixtures docs/METRICS.md src/app/api vercel.json src/application` 為空；不加 testid、不加依賴、不 push；3103 已停。**未執行**（留給主流程收尾，寫在這裡不視為完成）：contrast-check（本批不加 CSS、不加 token）、PUBLIC_DEMO 3100 的 capture 與 15 說明首頁 × 4 的畫面基準更新、`GUIDE_MEDIA=check`、launch-check、Lighthouse、`feature-retention.csv` GH1 列、驗收文件 `verification/revamp-v42-V42-G1-acceptance.md`。

**審查修正**（2026-10-22，工作樹 `worktree-wf_4f423fca-ae6-6-fix`，自 `9cda00f` 開出）：`guide.unique.lead` 恢復改寫稿的兩個引述問句「這怎麼來的？」「所以要怎麼做？」（沒有護欄要求說明頁字串不用問號；D-V42-33 清單去掉這一項），例外快照重產（changed 15 added 31 不變）；批次總表進度欄改成「程式與單元測試、說明頁 E2E 完成；收尾未執行」，`docs/STATUS.md` 加 V42-G1 一節、`00_README.md` 批次表加一列。重跑結果：typecheck 通過；lint 0；`audit:ui` copy 指標不變（blacklistSynonym 12、blacklistTone 0、blacklistJargon 0、arrows 0、noticePrefix 0、l1ClauseOverLimit 0；JSX 中文 0）；unit 167 檔、3,583 全過（工作樹先 `npm ci`，lockfile 不變）；build 通過；禁區三條與 `4ed65c7` 邊界 diff 為空；說明頁 E2E、畫面基準、`GUIDE_MEDIA=check`、Lighthouse 仍未重跑（留給收尾）；不 push。

---

## V42-2a 群組層與單一通路層（M）

**範圍**
1. 期間列通路選單改成兩層（D-V42-10；PRD §4.1）：`<optgroup>` 每群組一組（群組本身一個選項＋成員通路）、最後一組「未分組」；選項值用碰撞安全的編碼；`dashboard.tsx:605` 的選取值邏輯認得群組子集；沒有對應群組的子集顯示只讀選項「{n} 個通路」；`applyFilters` 直接用群組成員（A 級）。
2. 範圍文字：期間摘要、`scopeLabel`、`diagnosisScopeLabel` 對群組顯示群組名，單一通路屬於群組時寫「{群組名} · {通路名}」；成員列在 `title` 與 sr-only 的詳情；備份還原後的範圍顯示。
3. 從群組看成員（D-V42-2）：通路寬表與 G4 精簡表的通路列加「只看這個通路」動作，**只在目前資料集有至少一個群組時渲染**（示範資料不預設群組，D-V42-13＝A，所以 01、02、05、08 與說明媒體 0 差異；有群組的畫面只在 `*-grouped` 頁面狀態與新畫面 18 出現）；試算頁在群組範圍下的通路選單只列成員。
4. 明說限制（D-V42-12）：「要注意」加「群組的健檢只有合計層的規則；扣廣告後為負的提醒只出現在單一通路列。」「試算一次只算一個通路。」「目標只對全部通路或單一通路配對。」；範圍是群組時目標區塊顯示第三句。
5. 子集稽核的修正：V42-0 清單中標「V42-2a 修」的每一條，每處一條測試，群組範圍與單一通路範圍都跑。
6. 單元：`tests/channel-groups.test.ts` 的精確性部分（群組＝成員 bigint 和、分割＝全部、null 傳遞、橋接 `reconciled`、`INVALID_CHANNEL_FILTER`、`daily_complete`）；`copy.test.ts` 加群組範圍的 `scopeLabel`、`diagnosisScopeLabel`；匯出函式在群組範圍下的範圍文字。
7. 頁面狀態 `overview-grouped`、`diagnosis-grouped`、`meeting-grouped`；E2E 四尺寸 `tests/e2e/channel-groups.spec.ts`（期間列選群組、390 用 `openPeriodSheet`、KPI 文字等於 labels 格式化後的 domain 值、下鑽到成員、範圍文字、還原備份、axe 0 serious、network-log 5 種）。
8. 說明頁：`start-period` 若被拍到期間列展開才 `write`（期間列關閉時外觀不變，預期 0）。
9. 完成後依 D-V42-26 詢問是否 push 建 preview 給 H8。

**依賴**：V42-1；D-V42-10、12。

**允許變動畫面**：01 到 09 × 4（只在期間列控制項的靜態外觀改變時；`<optgroup>` 在選單關閉時不改外觀，預期 0）；13 KPI 帶（只在期間列高度改變時，預期 0）；新 18 期間列群組展開 × 4（用 synthetic-4-channel 加群組的頁面狀態拍）。「只看這個通路」只在有群組時渲染，所以示範資料的 01、02（G4 精簡表）、05（健檢表）、08（會議表）與說明媒體 `overview-*`、`diagnosis-*`、`meeting-*` 預期 0 差異；實測不是 0 時不得更新基準，改回條件渲染。其餘 0 差異。

**驗收重點**：群組範圍下四層金額與 `analyzeDataset(成員)` 逐分相同、分割成兩個群組的合計＝全部通路；示範資料（無群組）的 01、02、05、08 × 4 與 `GUIDE_MEDIA=check` 0 差異；E2E 四尺寸切到群組後七頁都重算、390 底部面板可用；B1、B2 首屏 0 px 餘裕的三處不退；通路健檢 390 TBT 不退（本批不在健檢頁加計算）；子集稽核每條都有測試。

**同批 labels 與測試**：`shell.periodBarV42.*`、`shell.scopeV42.*`、`diagnosis.channelsV42.*`（「只看這個通路」、三句限制）（「── V42-2a 錨點」）；`testids-v42-added.txt` 追加；`feature-retention.csv` 的期間列、試算頁、目標列打勾。

---

## V42-2b 全部通路畫面的群組合計列（M；D-V42-7 可砍）

**範圍**
1. `src/application/channel-groups.ts`：對每個群組呼叫 `aggregatePeriod` 兩期、`compareMoney`、`buildBridge`；在元件內 `useMemo` 懶算、不進 `createSnapshot`；群組數沿用 ≤ 8 的規則，超過只留表、不懶算（D-V42-28）。
2. 群組合計列（D-V42-11；列名「{群組名} 合計」）：G4 精簡表（`channel-section.tsx:136`）、通路健檢與會議的通路寬表（`channel-table.tsx`）各加一列；週會摘要（`manager-summary.ts:174`）的 `channels` 陣列**不變**（它直接寫進 CSV，`:285-290`，群組名不得進 CSV 的 `channel` 欄），另加選填 `groups` 欄位（群組 id、成員代碼、兩期 domain 合計）只給畫面與人讀匯出（Excel、PPT、一頁摘要）使用；長條圖不混層；群組合計列的健檢欄留空並給 sr-only「群組沒有健檢結果」；群組格證據＝成員來源聯集、`scopeLabel` 群組名、`metricVersion` 不改。
3. X38 的測試對群組合計列改寫為「群組合計列取自 domain 群組合計，不是跨列相加」。
4. 頁面狀態沿用 `overview-grouped`、`diagnosis-grouped`、`meeting-grouped`；SSR 結構：群組合計列數＝群組數、每列 number-link 開到同一份證據；`chart-lint` 0。

**依賴**：V42-2a；D-V42-7（含本批）、11、28。

**允許變動畫面**：01、02（G4 精簡表）、05（健檢表）、08（會議表）× 4；10 健檢圖區元素截圖。其餘 0 差異（示範資料不預設群組，所以示範資料的畫面預期 0；差異只在有群組的新頁面狀態，驗收文件寫明）。

**驗收重點**：通路健檢 390 TBT ≤ 832.3（只剩 16.7 ms；超過時先依 D-V4-47 成對 A/B，仍超過就把群組合計列改成展開才算並寫明）；群組合計列的 number-link 開得了「計算與來源」；週會摘要 CSV 在有群組時位元組與無群組時相同（`groups` 欄位不進 CSV）；`chart-lint` 0；`GUIDE_MEDIA=check` 0 差異（示範資料沒有群組，`diagnosis-*` 截圖不變）。

**同批 labels 與測試**：`overview.channelsV42.*`、`meeting.channelsV42.*`、`diagnosis.channelsV42.*` 增補（「── V42-2b 錨點」）；`tests/channel-groups.test.ts` 的群組列部分；`testids-v42-added.txt` 追加。

---

## V42-3 `product-groups.ts` 與品類／SKU 視角（M）

**範圍**
1. B 級 `src/application/product-groups.ts`（`product-groups-v1`；PRD §6.3）：一趟掃過銷售列、依品類／SKU／通路 × 品類分桶、每桶 `aggregateSales` 再 `calculateMetrics` 後**只投影到 `PRODUCT_METRICS`＋件數**；「未填」品類桶（D-V42-18）；空桶帶 `manifest.json` 來源與出現狀態；兩期差額；`tests/product-groups.test.ts`（PRD §11.2 的六條）。
2. 視角切換（D-V42-5）：`products-perspective` 控制（≥ 768px `ui-segmented`、390 `<select>`）；預設視角不變；只渲染目前的視角。**視角本體寫成可直接 import 的元件模組** `src/components/products/perspectives/{category,sku-total,cross,combined}.tsx`（各自的根節點 testid `products-perspective-{view}` 寫成字面值），商品頁只以 `createChunkLoader`／`next/dynamic` 包「載入點」，第一次切換才下載子 chunk＋`useDeferredMount`；SSR 頁面狀態直接 import 視角元件渲染（比照 G24 的資料表照常 SSR），所以 CL-1、CL-2、CL-9、CL-11、copy-density 與 mounted-testids 檢查的是真正的視角內容，不是骨架；`SPLIT_SENTINELS` 加 `"products-perspective"`。
3. P2 品類：主表 `chart-products-category-table`、X3 品類列展開 SKU、X5 差額圖 `chart-products-catvariance`（柱 `-bar-cat-{category}`）（PRD §5.3）。P3 SKU 跨通路合計：表 `chart-products-skutotal-table`（PRD §5.4）。區塊 id 只用 `[a-z][a-z0-9]*`，CL-2 的 `CHART_TESTID_RE` 才過（`scripts/lib/chart-scan.mjs:21-23`）。
4. 證據標記（D-V42-19）：`EvidenceSelection`、`LadderEvidence` 加選填 `category`，`ladderMetrics` 有值時回 null；證據 builder 放 `src/components/product-evidence.ts`；`tests/evidence-ladder.test.ts` 既有輸出不變。
5. 邊界句（D-V42-3；PRD §6.2）：P2、P3 的區塊說明、指標定義的名詞小辭典補充；標題與表頭寫「商品毛利」。
6. 第六步 TBT（D-V42-21）：`scripts/lighthouse-pages.mjs` 加「商品毛利切到品類視角」timespan，低負載三次取中位數當基準、定門檻；非預設視角的 B9 實測記為基準。
7. 頁面狀態 `products-category`、`products-sku-total`（`tests/helpers/page-states.tsx` 直接 import `perspectives/category.tsx`、`perspectives/sku-total.tsx` 渲染）；`mounted-testids`、chart-lint（CL-1、CL-2、CL-9、CL-11）、copy-density 以新狀態檢查；`tests/lazy-panels.test.tsx` 加反向檢查「商品頁 chunk（`product-comparison-panel.tsx` 與它靜態 import 的模組）不靜態 import 四個視角模組」，讓 SSR 護欄與 chunk 邊界同時成立；E2E 四尺寸 `tests/e2e/product-perspectives.spec.ts`（切換視角、品類格開抽屜且沒有階梯、390 `.table-scroll`、axe 0 serious）。
8. 說明頁：`products-*` 截圖若被改到（頁首多一列），同批 `write`；新步驟文字留到 V42-5。

**依賴**：V42-2a（範圍文字）；D-V42-3、4、5、16、18、19、21。

**允許變動畫面**：06 商品毛利 × 4、11 商品圖區元素截圖（視角切換列）；新 19 品類視角 × 4、20 SKU 跨通路合計 × 4。其餘 0 差異。

**驗收重點**：Σ 品類商品毛利＝通路商品毛利到分、Σ 品類差額＝通路差額到分；輸出型別沒有任何費用、廣告、貢獻欄位（PRD §2.2 S3 三條）；SSR 狀態 `products-category`、`products-sku-total` 含真正的視角表（不是骨架）且 CL-2 0 違規；「切到商品毛利」TBT ≤ 129.9（量的是預設視角）；第六步基準與門檻寫進驗收；B9 商品頁預設視角 ≤ 3,322、非預設視角記基準；copy-density 商品頁否定句 0；labels 新 key 只在 `products.perspectivesV42.`；`/` First Load 差額只含字串（新視角元件不在首載 chunk）。

**同批 labels 與測試**：`products.perspectivesV42.*`（「── V42-3 錨點」）；`testids-v42-added.txt` 追加；`feature-retention.csv` 的商品頁列打勾。

---

## V42-4 交叉表與綜合（M；D-V42-7 可砍）

**範圍**
1. P4 交叉表 X1（PRD §5.5）：`by: "channel_category"`；`ChartDataTable` 表模式（D-V42-17）；區塊 `chart-products-cross`（表 `chart-products-cross-table`、格 `chart-products-cross-cell-{channel}-cat-{category}`；視角模組 `perspectives/cross.tsx`，根節點 `products-perspective-cross`）；指標 `<select>`（商品毛利、淨營收、毛利率、商品毛利差額）；列尾「扣廣告後貢獻（通路層；未分攤到品類）」、欄尾品類合計、右下全範圍；上限通路 ≤ 8、品類欄 ≤ 12、格數 ≤ 736（D-V42-28）；390 清單式；空格與覆蓋未確認的呈現。
2. C3 通路獲利結構表（`category-structure-v1`）：交叉表下方 `<details>`，每通路一表，放在 `.chart-frame` 之外、testid `products-structure-{channel}`（不是圖區塊，不進 chart-lint；格仍是 number-link）；恆等式測試對帳到 `report.current.channels[ch].metrics.contribution_after_marketing`；費用或廣告缺列時最後一列「資料待補」。
3. P5 綜合 C2（PRD §5.6）：四塊並列、各標其層、不跨層相加；`<details>` 放邊界句；390 直向堆疊。
4. 頁面狀態 `products-cross`、`products-combined`（直接 import `perspectives/cross.tsx`、`perspectives/combined.tsx` 渲染）；SSR 結構：交叉格 number-link 與證據一致、品類格證據沒有階梯；`tests/lazy-panels.test.tsx` 的反向檢查涵蓋這兩個模組；`SPLIT_SENTINELS` 加 `"products-perspective-cross"`；E2E 四尺寸補交叉表與綜合；第六步 TBT 若以交叉表為準在本批重定。
5. 完成後依 D-V42-26 詢問是否 push 建 preview 給 H9。

**依賴**：V42-3；D-V42-7（含本批）、17、21、28。

**允許變動畫面**：06 × 4（視角切換列多兩個選項）；新 21 交叉表 × 4（390 清單式）、22 綜合 × 4。其餘 0 差異。

**驗收重點**：列合計＝通路商品毛利、欄合計＝品類合計、總計＝總商品毛利（到分）；C3 恆等式到分；交叉格證據不畫通路階梯；CL-9 商品頁主層 ≤ 3 張獨立圖；熱表 token 使用範圍不變；第六步門檻通過或依 D-V4-47 處理；B9 交叉視角記基準。

**同批 labels 與測試**：`products.perspectivesV42.*` 增補（「── V42-4 錨點」）；`tests/product-groups.test.ts` 的交叉與 C3 部分；`testids-v42-added.txt` 追加。

---

## V42-5 匯出與說明頁更新（M；D-V42-7 底線時只做說明頁部分）

**範圍**
1. 匯出（D-V42-15）：人讀匯出（Excel 範圍文字、PPT、一頁摘要、週會摘要、會議紀錄）在群組範圍下帶群組名與顯示名稱（V42-2a 已改解析器，本批核對每一條管道）；**選配** Excel `categories` 工作表（品類桶、交叉格、C3；鍵名進 `export-variants`、`export-normalize`，`tests/fixtures/export-numeric-baseline.json` 不動、新工作表排除於正規化比對）；`network-log` 下載集合維持 5 種；CSV 原始代碼不變；開檔檢查列入人工待辦。
2. 說明頁（PRD §13）：`data` 加「設定通路的顯示名稱與群組」、`start` 改寫「換期間與通路」並加「通路名稱來自你的 CSV」、`overview` 與 `diagnosis` 各加群組列一句、`products` 加「切換視角」「看交叉表」與「要注意」的邊界句；截圖用 `tests/fixtures/synthetic-4-channel`，圖說註明虛構的合成資料（D-V41-21 的先例）；`GUIDE_MEDIA=write` 後連跑兩次 `check` 0 差異；影片依 cue 比對決定是否用本機 `ffmpeg` 重錄（側欄不動，預期不重錄）。
3. `tests/guide-content.test.ts` 的 `labels_hash`、媒體門檻全過；sitemap 仍 13 個網址（不加功能區）。
4. H9 若已在 V42-4 後做，本批不再建 preview。

**依賴**：V42-1 到 V42-4；D-V42-13、15。

**允許變動畫面**：15 說明首頁（目錄卡若變，預期 0）、16 `/guide/overview`（預期 0）；說明媒體清單逐張寫理由。其餘 0 差異。

**驗收重點**：PRD §2.2 S9 的媒體門檻（沿用 v4.1：單張 ≤ 200 KB、每頁 ≤ 1.5 MB、影片 ≤ 2 MB、≤ 45 秒）；`tests/guide-content.test.ts` 全過；匯出開檔檢查列入待人工；`network-log` 5 種；sitemap 13 個。

**同批 labels 與測試**：`guide.*` 新步驟、`exports.v42.*` 增補（「── V42-5 錨點」）；`feature-retention.csv` 的匯出與說明新列打勾。

---

## V42-6 收尾與上線（M）

**範圍**
1. 版本 `4.2.0`（`package.json` 與 lockfile 三行；D-V42-6）；跑 `GUIDE_MEDIA=check`，必須 0 差異（版本號改變不需要重拍）。
2. 文件：`docs/RELEASES.md` 新增 v4.2.0 段（給使用者、不變的事、**備份格式相容提示**「v4.2.0 寫出的備份含通路設定時，舊版本無法讀取」、已知限制：品類與 SKU 只到商品毛利、群組不觸發 `NEGATIVE_CHANNEL_CM`、試算仍單一通路、目標不配群組；上線前寫成步驟、正式站檢查一行 PROD_PLACEHOLDER）；`README.md` 發布紀錄；`docs/ENGINEERING.md`；`tests/release-notes.test.ts`；`docs/STATUS.md`、`docs/DECISIONS.md`；`docs/revamp-v4/usability-test.md` 加 T7、T8（D-V42-23）。
3. `feature-retention.csv`：確認 v4.2 新列與重新核對的列都已打勾；PRD §2.2 填真實值（A 未執行寫「未量測」）。
4. 套用 H8、H9 的修改（如有）；H8、H9 未完成時不上正式站。
5. 上線（每一項都要使用者當次明確同意）：`main` fast-forward 到發布 commit 並推送（正式站）、建立並推送 annotated tag `v4.2.0`、對正式站跑 `node scripts/launch-check.mjs --base https://profitlens-tau.vercel.app --out verification/revamp-v42/V42-6/launch-check-production.json`（13＋19）、推送上線後的文件 commit（README「正式站已是 v4.2.0」、RELEASES 部署行）。Skew Protection 依 D-V41-16（沒開；問同意時再提一次）。一律用 `origin/main`，本機 `main` 過期。

**依賴**：V42-0 到 V42-5；D-V42-6、23；**H8、H9**（擋正式上線）。

**允許變動畫面**：無（`GUIDE_MEDIA=check` 應 0 差異；有差異時逐張寫理由）。

**驗收重點**：PRD §2.2 S1 到 S12 全部達標或誠實列出未達標與原因；`GUIDE_MEDIA=check` 0 差異；sitemap 13 個網址；禁區與邊界五條皆空；testid 五份刪除 0；labels 三份快照逐字相同；正式站 13＋19 通過（上線時）。

**同批 labels 與測試**：不加新 key（H8、H9 的修改只改既有 V42 key 的值）；全套測試。

---

## 護欄與棘輪時程

| 指標 | V42-0 基準 | 規則與時程 |
|---|---|---|
| `/` First Load JS（gzip） | V42-0 實測（v4.1.2） | V42-1 起 ≤ V42-0 實測＋8,192（D-V42-20）；v4 上限 545,397 仍有效；`SPLIT_SENTINELS`（照 `metrics.spec.ts:98` 的寫法是帶引號的 testid 字面值：V42-1 起含 `"channel-settings"`、V42-3 起含 `"products-perspective"`、V42-4 起含 `"products-perspective-cross"`）與 `GUIDE_SENTINELS` 在首載 chunk 0 次；每批列差額組成（字串幾條、期間列程式幾 bytes）；V42-3 量到超過七成就提前回報 |
| 說明頁 First Load JS | 框架基準（404 頁） | 不變：≤ 框架基準＋5,120；不含 `recharts`、`pptxgenjs`、`xlsx`、工作台模組 |
| 390 TBT 五步 | V42-0 低負載三次中位數 | 門檻不變 1,109.1／832.3／129.9／1,071.2／50.0（D-V4-36、D-V4-47）；「切到商品毛利」量預設視角；通路健檢在 V42-2b 是閘門 |
| 390 TBT 第六步 | V42-3 實測 | 「商品毛利切到品類視角」（或 V42-4 改以交叉表為準）：門檻＝max(中位數 × 1.1, 中位數＋50 ms)；V42-4 起斷言 |
| B9 DOM 節點 | v4 上限（商品 3,322、資料來源 2,629 等） | 既有七頁不變；非預設視角 V42-3、V42-4 記基準，之後斷言基準＋1,500 |
| B1、B2 首屏、B3 | V42-0 實測 | 每批照 v4 規則斷言；期間列行高不變 |
| 群組與品類對帳 | — | V42-2a 起群組＝成員 bigint 和、分割＝全部；V42-3 起 Σ 品類＝通路、每桶 `toEqual` `analyzeProducts`；V42-4 起 C3 恆等式；每批驗收文件列結果 |
| 假貢獻擋牆 | — | V42-3 起：鍵集合 ⊆ `PRODUCT_METRICS ∪ {units_sold}`、正規式 0 次、品類證據無階梯 |
| 備份矩陣 | v1 到 v5 | V42-1 起 v1 到 v5 全部還原；沒有設定時位元組與 v4.1.2 相同 |
| labels 既有字串 | v3 2,581、v4 2,839、v41（V42-0 產生） | 每批三份逐鍵逐字相同；新葉節點只在 `V42_NEW_KEY_PREFIXES` 與 `guide.` 下；`LABEL_GROUPS` 24 組。V42-G1（D-V42-32）：說明首頁改寫的 `guide.` 例外鍵（改值 15、新增 31、刪除 15）以 `verification/revamp-v42/labels-guide-rewrite.flat.json` 與 `V42_G1_REMOVED_KEYS` 凍結，例外清單必須等於實際差異；`labels.zh-TW.ts` 沒有任何例外 |
| testid 刪除數 | 五份 | 每批 0；每批把新增的 testid 追加到 `testids-v42-added.txt` |
| design-lint、copy-style、chart-lint、copy-density | v4.1 最終上限 | 每批不升；`products.perspectivesV42.*` 的「賠錢」「虧損」計入黑名單；限制句不進主層 |
| 畫面基準 | 64 張（V41-6） | V42-1 加 17、V42-2a 加 18、V42-3 加 19、20、V42-4 加 21、22，共 88 張；每批只允許該批列出的畫面有差異（清單以本檔各批的「允許變動畫面」為準） |
| 說明媒體 | V41-6 後的項數 | 每批 `GUIDE_MEDIA=check` 0 差異；V42-1、V42-3 被改到的截圖同批 `write`；V42-5 新步驟；影片依 cue 比對 |
| axe 四尺寸、keyboard-walk | V42-0 實測 | 每批 0 serious；V42-1 加通路設定區、V42-2a 加兩層選單、V42-3 加視角切換的里程碑；`aria-hidden` 內停留點 0 |
| network-log | 下載 5 種、無 POST | 每批不變 |
| launch-check | 13 項＋19 項（V41-6） | 每批不變；sitemap 13 個網址 |
| 禁區與邊界 | 五條皆空 | 每批；commit 後兩條也必須為空；新增檔清單對帳 |
| AI 快照 | — | V42-1 起負載不含名稱（單元測試） |

---

## 每批共同產物

| 產物 | 位置 |
|---|---|
| 驗收文件 | `verification/revamp-v42-V42-{n}-acceptance.md`（含邊界檔的 diff 範圍、B 級對帳結果、備份矩陣、媒體的擷取時間與 commit） |
| 截圖與量測 | `verification/revamp-v42/V42-{n}/`（四尺寸截圖、`snapshots/`、`ui-audit.json`、`metrics.json`、`first-load-modules.json`、Lighthouse、`axe.json`、`keyboard-walk.json`、`network-log.json`、`launch-check-local.json`） |
| 說明媒體 | `public/guide/**`、`src/application/guide-media.json`、基準 PNG `verification/guide-media/baseline/**`（只在畫面改變時更新） |
| 功能保留 | `verification/revamp-v42/feature-retention.csv` 中本批的列打勾 |
| 狀態與決策 | `docs/STATUS.md`、必要時 `docs/DECISIONS.md`、本檔進度欄 |
