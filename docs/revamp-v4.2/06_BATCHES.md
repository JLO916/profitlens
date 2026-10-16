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
| V42-0 | 基準與護欄（不改畫面；CLAUDE.md 取代；子集稽核清單） | M | V41-6 上線；D-V42-1 到 6、20、22；使用者同意 CLAUDE.md 草案 | 進行中（2026-10-16 開工，使用者回覆「V42-0」；CLAUDE.md 已換成 v4.2 版） |
| V42-1 | 通路設定：顯示名稱、順序、群組的設定、解析與保存（開工前評估拆 1a 設定模組與備份／1b 編輯器與名稱套用） | M | V42-0；D-V42-8、9、13（示範資料的預設設定）、14、15（對照列） | 未開工 |
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

## V42-1 通路設定（M；開工前評估拆 1a／1b）

**範圍**
1. 新純模組 `src/application/channel-settings.ts`（PRD §3.1）：型別、對 `manifest.channels` 的驗證與名稱清理（四條規則、NFC、不重複）、`resolveChannelLabel`、群組解析（成員集合精確比對）、`synthetic-demo*` 的預設設定＝既有 `demoChannelAlias`；`tests/channel-settings.test.ts`。
2. 名稱套用（D-V42-14）：`createSnapshot(dataset, filters, hash, settings?)` 加第 4 個選填參數，解析結果放進 `WorkspaceSnapshot` 的選填 `channel_names`；repo 的 10 個呼叫點每處都傳入 `Active.channel_settings`（`src/components/dashboard.tsx:277、341、362`、`src/components/meeting-page.tsx:95`、`src/components/multi-scenario-workbench.tsx:56`、`src/application/action-workspace.ts:143`、`src/application/workspace-backup.ts:245、446、508`、`src/application/review-session.ts:113`；備份還原在 `restoreV4` 讀出 `payload.channel_settings` 之後才建快照；呼叫點清單見 PRD §3.4）；`copy.ts` 的 `channelLabel`、`channelsLabel`、`scopeLabel`、`categoryLabel` 改收解析器；35 個檔的呼叫點改讀 `snapshot.channel_names`；所有既有字串與匯出位元組不變；單元測試「試算頁單一通路快照與還原後快照的範圍文字等於設定的顯示名稱」；驗收文件列改到的檔數。
3. 編輯器（D-V42-8）：資料來源頁 `DataWorkspace` 的「通路設定」區（`<details>` 收合；每個通路一列：顯示名稱、群組、順序；按鈕「新增群組」「套用設定」；「要注意」`<details>` 放「顯示名稱只改畫面；CSV、備份與 AI 用的仍是通路代碼。」）；在 `workspace-panels` chunk 內，不進 `/` 首載。設定存在 `Active`（React state），不用模組全域變數。本批群組只能建立與指派，還不能在期間列選（V42-2a）。
4. 儲存（D-V42-9）：v5 信封加選填 `payload.channel_settings`，沒有設定時不寫鍵；「沒有設定」＝使用者的設定與預設沒有差（示範別名是由 `dataset_id` 推出的隱含預設，永遠不寫進 `channel_settings`；寫出前先與預設比對、去掉等於預設的欄位，任一 `label`、`group`、`order` 非預設才寫鍵）；還原時丟棄未知代碼並提示；`tests/backup-schema-v5.test.ts`（加「示範資料未改設定時備份文字逐位元組等於 v4.1.2」）、`backup-restore-matrix.test.ts`、`workspace-backup.test.ts`、`auto-save.test.ts` 同批；示範與 golden 的備份輸出位元組不變。
5. 匯出對照列（D-V42-15）：Excel「版本與來源」加「通路設定」對照列（代碼、顯示名稱、群組），只加列；人讀匯出的範圍文字改用解析器（群組名要到 V42-2a 才會出現）；CSV、JSON 維持代碼；人讀欄位跳脫（含 `=`、`+`、`-`、`@` 開頭）。
6. 隱私：AI 快照負載不含名稱（單元測試）；批次開工時查 `docs/AI_CONTRACT.md` 與現有寫出函式的跳脫。
7. 頁面狀態 `data-channel-settings`（synthetic-4-channel 加設定）；`mounted-testids` M1（收合內容保持掛載）；E2E 四尺寸：在資料來源頁設定名稱與群組、下載備份再還原、顯示名稱出現在總覽與健檢；`keyboard-walk` 加通路設定區的里程碑。
8. 說明頁：`data` 區既有截圖若被改到，同批 `write`；新步驟文字留到 V42-5。

**依賴**：V42-0；D-V42-8、9、13（示範資料的預設設定）、14、15。

**允許變動畫面**：09 資料來源 × 4（通路設定區預設收合時只多一行 summary）；新 17 通路設定編輯器展開 × 4。其餘 0 差異（期間列本批不改）。

**驗收重點**：既有字串與示範／golden 的匯出位元組逐字相同；示範資料未改設定時備份文字逐位元組等於 v4.1.2；備份矩陣 v1 到 v5 全部還原；試算頁單一通路快照與還原後快照的範圍文字等於設定的顯示名稱；`/` First Load 差額只含新字串（首載 chunk 清單無新元件模組）；390 五項不退（資料來源頁會升，要量）；B9 資料來源頁 ≤ 2,629；`GUIDE_MEDIA=check` 0 差異或已 `write` 並寫理由；AI 快照負載不含名稱。

**同批 labels 與測試**：`data.channelSettingsV42.*`、`exports.v42.*`、`storage.v42.*`（「── V42-1 錨點」）；`testids-v42-added.txt` 追加；`feature-retention.csv` 中 `batch`＝V42-1 的列打勾。

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
| labels 既有字串 | v3 2,581、v4 2,839、v41（V42-0 產生） | 每批三份逐鍵逐字相同；新葉節點只在 `V42_NEW_KEY_PREFIXES` 與 `guide.` 下；`LABEL_GROUPS` 24 組 |
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
