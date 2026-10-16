# EC ProfitLens v4.2 基準報告（V42-0：v4.1.2 的實測值）

> V42-0 建立（2026-10-16）。依據：`docs/revamp-v4.2/06_BATCHES.md` V42-0 第 2–9 項與「護欄與棘輪時程」表、`docs/revamp-v4.2/00_README.md`「驗收產物」。本文件寫「V42-0 實測」「V42-0 基準」時，指 V42-0 在 v4.1.2 程式碼（`src/` 一個字都沒改）上量到的值；之後各批以這裡的數字為門檻或比對基準（`/` First Load 門檻＝實測＋8,192，D-V42-20＝A）。
>
> **狀態**：第 1、2、4、6、7 節由實作代理 C 填寫（`npm audit`、testid 清單計數、子集稽核、功能保留表）。第 3 節（labels 快照）、第 4 節的測試結果、第 5 節的結果（copy-scan 新規則）與第 6 節的 `overview-many-channels` 由整合代理於合併後填入（已填），其 G4 擁擠程度的瀏覽器目視（1440 截圖與幾何量測）由審查修正補做（已填，見 §6 與 §8 的目視列）；畫面基準 64 張已自 `verification/revamp-v41/V41-6/snapshots/` 逐位元組複製到 `verification/revamp-v42/V42-0/snapshots/`（`diff -rq` 相同），待主流程不帶 `--update-snapshots` 跑；第 8 節的瀏覽器量測（畫面基準 64 張、`metrics.spec` 的 First Load 與 DOM 節點、390 五個 TBT、8 頁＋2 說明頁 Lighthouse、axe、keyboard-walk、network-log、`GUIDE_MEDIA=check`、launch-check）由主流程跑共通驗收後填入；填入前一律是「由主流程填寫」。

## 1 產生日與基準

| 項目 | 值 |
|---|---|
| 產生日 | 2026-10-16 |
| 基準版本 | tag `v4.1.2`＝commit `e256154`（`git log -1 --format=%h v4.1.2` → `e256154`；正式站 https://profitlens-tau.vercel.app 是 v4.1.2） |
| 分支 | `revamp/v4.2`（自 `origin/main`＝`00584a5` 開出；不 push） |
| 開工錨點 | `bcb6c91`（plan(v4.2): V42-0 開工錨點——CLAUDE.md 整份換成 v4.2 版；06 與 00_README 的 V42-0 狀態改為進行中） |
| 程式碼狀態 | V42-0 不改 `src/` 任何檔案（`git diff --stat e256154 -- src` 為空；本報告的代理 C 工作只新增 `verification/revamp-v42/` 下的檔案；§6 的 G4 目視（審查修正）只新增 `tests/fixtures/synthetic-many-channels-9x7/` 與 `verification/revamp-v42/V42-0/overview-many-channels*`，`src/` 仍零改動）；不碰 `package.json`、`package-lock.json`（`git diff --stat e256154 -- package.json package-lock.json` 為空） |
| 整合 | 三個代理的分支以 `--no-ff` 依 A、B、C 順序併入（無衝突；三方改動的檔案不重疊）：`1d55d9e`（A：labels 快照、V42 前綴護欄、copy-scan、第五份 testid 清單）、`8615252`（B：capture config、`metrics.spec` 預留、第六步留位、`overview-many-channels`）、`c8ff85d`（C：功能保留表、子集稽核、本文件骨架、`npm audit`）；整合後 `git diff --stat bcb6c91 HEAD -- src` 為空 |
| 禁區與邊界 | 五條命令由整合代理在合併後跑一次（2026-10-16，整合 commit 之後）：五條全部為空；`git diff --stat bcb6c91 HEAD -- src` 為空（V42-0 不改 `src/` 任何檔）；代理 C 沒有碰 `src/domain`、`fixtures`、`docs/METRICS.md`、`docs/SCENARIOS.md`、`src/application/assist-kpi.ts`、`src/application/breakeven-mer.ts`、`tests/assist-kpi.test.ts`、`tests/breakeven-mer.test.ts`、`src/app/api`、`vercel.json`、`src/application/analytics.ts`、`.env*` |

## 2 `npm audit`（v4.1.2 的依賴，沒有任何變動）

### 2.1 執行

| 步驟 | 結果 |
|---|---|
| `npm ci` | 全新 worktree 安裝成功（lockfile 與 `e256154` 相同） |
| `npm audit --json > verification/revamp-v42/V42-0/npm-audit.json` | 結束碼 1（有回報即非 0，正常）；`metadata.vulnerabilities`：`{"info":0,"low":0,"moderate":0,"high":8,"critical":0,"total":8}` |
| `git diff --stat e256154 -- package-lock.json` | 空（lockfile 與 v4.1.2 逐位元組相同） |
| 與上一次的比較 | **8 high，與 V41-3 之後相同**（V41-3 套用 `source-map-js` 1.2.2 後 9 → 8，`verification/revamp-v41/V41-3/npm-audit-after-source-map-js.json`）；v4.1.2 發布沒有再動依賴，所以數字不變 |

### 2.2 逐項評估（沿用 V41-0 §2.2 與 V41-3 §3 的判斷；套件數 8＝1＋2＋5）

| 套件（直接依賴） | 公告 | 範圍與修正 | 本站的使用方式與評估 | 處理 |
|---|---|---|---|---|
| `next@16.3.8` | （無） | — | V41-0 的 O3 升到 16.3.8 後，`next` 的 6 筆公告（GHSA-cjq9-62q9-8jv4 等）已不在報告中 | **已修（V41-0 O3）** |
| `source-map-js@1.2.2`（傳遞依賴） | （無） | — | V41-3 套用 1.2.2（commit `5072879`，使用者 2026-10-15 同意），GHSA-68fv-2mgg-jv7q 已不在報告中 | **已修（V41-3）** |
| `xlsx@0.18.5`（1 個套件） | GHSA-4r6h-8v6p-xvw6（high，prototype pollution）、GHSA-5pgg-2g8v-p4x9（high，ReDoS） | `range: *`；npm 上沒有修正版（`fixAvailable: false`） | 只在匯出時動態 import，用寫出 API 產生活頁簿；`src/application/excel-export.ts` 的 `CFB.read` 只讀本程式剛寫出的位元組（加表頭樣式），不解析使用者上傳的試算表 | 沿用 R6／V41-0 評估，不處理 |
| `pptxgenjs@4.0.1` → `image-size@1.2.1`（2 個套件） | GHSA-5p2g-fcmc-qvqq、GHSA-w3rx-r6r6-pgpr（high，JXL／HEIF／ICNS 解析 DoS） | 修正是降到 `pptxgenjs@4.0.0`（`isSemVerMajor: true`） | PPT 只用 `addChart`、`addShape`、文字，不用任何圖片 API（`src/application/pptx-export.ts`），不會呼叫 `image-size` | 沿用 R6／V41-0 評估，不處理 |
| `eslint-config-next@16.3.8` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces@3.0.3`（5 個套件） | GHSA-vfj7-8cjw-p6xm（high，`braces` 深層巢狀樣式的堆疊耗盡） | 修正是降到 `eslint-config-next@14.2.35`（主版號降版） | 只在開發時跑 eslint，樣式來自 repo 自己的設定，不處理使用者輸入；不進 production bundle | 沿用 R6／V41-0 評估，不處理 |

v4.2 的「允許新增 npm 依賴」清單為空（CLAUDE.md、06 共同規則）；上表沒有任何一項需要在本輪處理，也沒有執行 `npm audit fix`（含 `--dry-run`）。

## 3 labels 快照（`verification/revamp-v42/labels-v41.flat.json`）

| 項目 | 值 |
|---|---|
| 葉節點數 | **3,163**＝`labels.zh-TW.ts` 2,842＋`guide.zh-TW.ts` 321（三份快照：v3 2,581 → v4 2,839 → v4.1 3,163；比 v4 快照多 324＝`guide.` 321＋`shell.guideV41.` 3，其他 0） |
| 來源 | `src/i18n/labels.zh-TW.ts`（sha256 `ac84a980e95578a4f45822a1bfc59d37f3faf8834c7463c388691648d310dd82`）與 `src/i18n/guide.zh-TW.ts`（sha256 `53cc3953fcff878044098881168150fec8d1de7331102ad213204a856a8a8964`），兩檔與 `git show e256154:` 同值（`git diff e256154 -- src/i18n` 為空） |
| 各分組 | actions 127、assist 37、brand 4、data 142、diagnosis 102、empty 19、errors 85、events 23、evidence 82、exports 292、format 28、glossary 220、importWizard 243、meeting 291、metrics 100、overview 260、products 144、relaunch 3、rules 32、scenarios 216、shell 273、storage 66、summary 19、targets 34（24 組＝`LABEL_GROUPS`）＋ guide 321（`guideLabels` 頂層只有 `guide`，不在 `LABEL_GROUPS`）；頂層共 25 個 |
| 格式 | 同 `verification/revamp-v41/labels-v4.flat.json`：`{ "點分路徑": "字串" }`；鍵依 UTF-16 碼位排序（已驗證 `keys === [...keys].sort()`），2 空格縮排，檔尾一個換行，3,165 行；陣列元素以索引為路徑段；guide 的鍵以 `guide.` 為根 |
| sha256 | `0bc9927dc9ceff9e4c04d766b39011b00262190522823fa31d722ae483269d9f` |
| 與 v3 快照 | v3 快照的 2,581 個鍵都在、字串逐字相同（不符 0） |
| 與 v4 快照 | v4 快照的 2,839 個鍵都在、字串逐字相同（不符 0） |
| V42 前綴 | 快照裡 `V42_NEW_KEY_PREFIXES` 下的鍵 0 個（本批不加 key） |

產生方式（在 repo 根目錄執行一次；與 V41-0 §3 相同，多載入 `loadGuideLabels()` 並合併排序）：

```bash
mkdir -p verification/revamp-v42 && node --input-type=module -e '
import { writeFileSync } from "node:fs";
import { loadLabels, loadGuideLabels } from "./scripts/lib/load-labels.mjs";
import { labelEntries } from "./scripts/lib/copy-scan.mjs";
const labels = await loadLabels(), guide = await loadGuideLabels();
if (!guide) throw new Error("guide labels missing");
const fromLabels = labelEntries(labels), fromGuide = labelEntries(guide);
const entries = [...fromLabels, ...fromGuide].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
const flat = Object.fromEntries(entries);
if (Object.keys(flat).length !== entries.length) throw new Error("duplicate path");
writeFileSync("verification/revamp-v42/labels-v41.flat.json", JSON.stringify(flat, null, 2) + "\n");
console.log(`labels ${fromLabels.length} guide ${fromGuide.length} total ${entries.length}`);
'
# 輸出：labels 2842 guide 321 total 3163
```

護欄（`tests/labels-structure.test.ts`；整合後 19 個測試全過）：
- 新增 `V42_NEW_KEY_PREFIXES`（D-V42-22 的 9 個：`data.channelSettingsV42.`、`shell.periodBarV42.`、`shell.scopeV42.`、`overview.channelsV42.`、`diagnosis.channelsV42.`、`meeting.channelsV42.`、`products.perspectivesV42.`、`exports.v42.`、`storage.v42.`）與 `isV42NewKey`；`V41_FLAT` 讀本快照；`getAny()` 對 `guide.` 路徑取 `guideLabels`（靜態 import，與 `tests/guide-content`、`guide-routes` 相同）、其餘取 `labels`。
- 新 describe「V42-0 labels 護欄」3 個測試：(1) 快照 3,163 個鍵（labels 2,842、guide 321）且已排序，頂層＝`LABEL_GROUPS` 24 組＋`guide`，涵蓋 v3 與 v4 快照且字串相同；V42 前綴 9 個、格式 `/^[A-Za-z]+\.[A-Za-z]*[vV]42\.$/`、頂層都在 `LABEL_GROUPS` 內、快照裡沒有 V42 前綴的鍵、與 V3（38）、V4（11）、V41（2）前綴不重疊；(2) 快照每個鍵都還在（`labels` 或 `guideLabels`）、字串逐字相同；(3) `labels.zh-TW.ts` 快照以外的新葉節點只能在 V42 前綴下、`guide.zh-TW.ts` 快照以外的新葉節點只能在 `guide.` 下、`guideLabels` 頂層只有 `guide`、`LABEL_GROUPS` 維持 24 組且沒有 `guide`。
- 依 V41-0 的做法，既有的 `isNewKey`、V4-0a 的「快照以外的新葉節點」與 V41-0 的「`labels.zh-TW.ts` 快照以外的新葉節點只能在 `shell.guideV41.` 下」三處改成也接受 V42 前綴（否則 V42-1 加第一個 key 時這三個既有測試會失敗）；既有 V3／V4／V41 的字串比對斷言本身一字未改。
- 本批沒有新增任何 key、`LABEL_GROUPS` 維持 24 組。

## 4 testid 五份基準

| 基準 | 列數（不含 `#` 註解與空行） | 刪除數 |
|---|---|---|
| `verification/revamp-v3/testids-v2.txt` | 228 | 0 |
| `verification/revamp-v4/testids-v3.txt` | 416 | 0 |
| `verification/revamp-v4/testids-v4-added.txt` | 343 | 0 |
| `verification/revamp-v41/testids-v41-added.txt` | 108（V41-1 到 V41-6 追加的 v4.1 testid） | 0 |
| `verification/revamp-v42/testids-v42-added.txt`（V42-0 新增） | 0（只有表頭；格式同 v41 新增清單：testid、來源、批次、說明；批次欄 V42-1 到 V42-5，可帶 a／b） | 0 |

計數方式：`grep -v '^#' <檔> | grep -c .`（2026-10-16，HEAD `bcb6c91`；整合後重數相同：228／416／343／108／0）。`tests/testid-baseline.test.ts` 改成比五份（`BASELINES` 加第五筆 `{ label: "v42 新增", file: verification/revamp-v42/testids-v42-added.txt, minRows: 0, batchColumn: true, batchPattern: /^V42-[1-6][ab]?$/ }`；整合後 18 個測試全過：五份各 3 個＝格式正確、ssr 列都在 SSR markup、e2e／cond 列原始碼仍會產生，加「五份清單互相一致」（v42 新增清單不重複 v3、v4、v41 清單）、PRD §11.7 點名來源、V3-0 六組共 3 個）；五份刪除數全部 0。`verification/revamp-v42/testids-v42-added.txt` 只有表頭（10 行註解、0 列；表頭 `^# .+\n# 格式：` 的格式檢查通過）。

## 5 掃描規則（copy-scan 新規則；06 V42-0 第 3 項）

| 檔案 | 改動 | 對既有字串的結果 |
|---|---|---|
| `scripts/lib/copy-scan.mjs` | `SCOPED_BLACKLIST.synonym` 的「賠錢」「虧損」範圍由 `path.startsWith("products.chartsV4.")` 擴到 `\|\| path.startsWith("products.perspectivesV42.")`（v4.1.2 是 `:90-91` 的兩條）；`L1_KEY_PATTERNS`（`:116`）由 7 條加到 8 條：`/^products\.perspectivesV42\.[^.]+\.title(\.\|$)/`（寫法同 `chartsV4`，含 `title.<情境>` 子鍵；每個子句 ≤ 14 字）；兩處 doc 註解各加一行 V42-0 | 16 項指標改前＝改後，逐項相同（整合後 `npm run audit:ui -- --json verification/revamp-v42/V42-0/ui-audit.json`）：noticePrefix 0、noticeAnywhere 0、arrows 0、circledNumbers 0、decorativeChars 0、exclamations 0、emoji 0、allCaps 0、pipes 0、**blacklistSynonym 12**、blacklistJargon 0、blacklistTone 0、blacklistEmotion 0、placeholderMalformed 0、placeholderVariantMismatch 0、**l1ClauseOverLimit 0**；新規則對 `products.perspectivesV42.*` 目前 0 個鍵 → 0 違規。`tests/fixtures/copy-style-ceiling.json` 不動（blacklistSynonym 12、其餘 0）；`tests/copy-style.test.ts` 沒有加合成輸入測試（22 個既有測試全過）。design 15 項同 V41-6：hex 0、圓角 4、字級 11、字距 0、rotate 0、JSX 箭頭 3、其餘 0（含 JSX 中文 0、元件字串常值中文 0）；靜態 `data-testid` 相異 267（出現 270、動態屬性 76、`testId` 屬性 15）；相異 class 選擇器 940 |

## 6 子集敏感分支稽核（06 V42-0 第 7 項；唯讀）

清單：[`verification/revamp-v42/V42-0-subset-audit.md`](V42-0-subset-audit.md)（2026-10-16，HEAD `bcb6c91`，行號逐一核對過）。

| 處置 | 條數 |
|---|---|
| V42-2a 修 | 20 |
| V42-1 修 | 1 |
| 不受影響＋理由 | 10 |
| 合計 | 31（PRD §4.4 點名的 16 處＋grep 找到的同類寫法 6 處；`filter_hash` 的 25 個檔合併成 1 條，逐檔列在該條） |

要點：
- `src/domain/analysis.ts:10-12` 的 `selectChannels` 會排序並驗證成員，所以群組範圍的 `report.scope.channels` 永遠是同一個排序後的清單；`filter_hash`（`workspace.ts:82`，只由 `report.scope` 算）的 25 個使用處全部只做相等比對或原樣顯示，**不受影響**。
- 子集在畫面上的缺口集中在範圍文字與選單：`dashboard.tsx:605` 的選取值對子集顯示「全部通路」、`:608` 與 10 處 `channelsLabel`／`everyChannel` 寫法列出成員清單、`waterfall.ts:268` 與 `diagnosis-group.ts:88` 對子集只寫「合計」、`multi-scenario-workbench.tsx:41-48` 的通路選單列出全部通路且預設可能在範圍外。這些都是「V42-2a 修」，每處一條測試。
- `decision.ts:93-99`（`SINGLE_CHANNEL_REQUIRED`）、`channel-table.tsx:92-93`、`action-workspace.ts:196-198`、`targets.ts:132-140`、AI 與會議快照負載（代碼或 `C01` 代號）、備份還原的對帳，對子集的行為都是預期，列為不受影響並寫明理由。
- PRD §4.4 寫 `waterfall.ts:267-268` 會列出成員代碼，實際是寫「合計」；清單以程式為準。
- `overview-many-channels`（9 通路）頁面狀態（`tests/helpers/page-states.tsx` 的「V42-0 新增頁面狀態」錨點後；與 `diagnosis-many-channels` 共用 `manyChannelsActive()`，輸入 JSON 位元組相同、`dataset_hash` `9e2c8f32ddd659de6282fc858ba08762ba57fa61331e9f1097d79556d4897338`）：`tests/mounted-testids.test.tsx` 的 V42-0 M1 測試（整合後 76 個全過）以 SSR 確認總覽頁掛載（kpi-band、snapshot-sentence、top-three、channel-mix、assist-kpis、overview-advanced 各 1）、主層仍是 4 個圖區塊、G4 框 `.chart-frame.sm` 固定 `height:180px`（不隨通路數變）、`recharts-wrapper` 520×180 共 1 個、精簡表 9 列、`chart-overview-channels-bar-CH01`…`CH09` 各 1 且依通路順序、資料表 `<details>` 收合 9 列。擁擠程度（PRD §15 G4 風險列）：Recharts 在 SSR 不畫 bar，所以用幾何估算——繪圖區高 180 − 4 − 4 − 30（XAxis）＝142 px，9 通路每列 ≈ 15.8 px，低於設計的雙 bar 8（上期）＋18（本期）＋4 間距＝30 px，Recharts 的數值 `barSize` 退回 `useFull` 時兩條 bar 各縮到 ≈ 7.1 px、間距 0，端點數字（~12–13 px 字）會疊到鄰列；示範資料 2 通路每列 ≈ 71 px；PRD §15「約 6 通路」對應每列 ≈ 23.7 px（仍放不下 30 px，6 通路就已觸發退回），4 通路 ≈ 35.5 px 放得下。
- **瀏覽器目視（審查修正補做，2026-10-16，程式碼＝整合 commit `67ee3d2`，`src/` 零改動）**：把 `manyChannelsActive()` 的三份 CSV 與 manifest 原樣寫成 `tests/fixtures/synthetic-many-channels-9x7/`（新測試資料只放 `tests/fixtures/`，`fixtures/` 不動；CSV 沒有檔尾換行，與記憶體版的 `join("\n")` 逐字相同；用 `hashInput` 同樣的 canonical＋SHA-256 算出的 `dataset_hash` 同為 `9e2c8f32ddd659de6282fc858ba08762ba57fa61331e9f1097d79556d4897338`），`NEXT_TELEMETRY_DISABLED=1 npm run build` 後以 `APP_MODE=PUBLIC_DEMO PUBLIC_DEMO=true ENABLE_LIVE_AI=false npm start -- --port 3142` 起伺服器（不用 3100），跑 `verification/revamp-v42/V42-0/overview-many-channels.spec.ts`（`CAPTURE_PORT=3142 npx playwright test -c verification/revamp-v42/V42-0/`；1440×1000、`FIXED_NOW`；從空狀態開匯入精靈載入這個目錄，帶 manifest，檢核結果 `valid`，本機保存提示按「暫時不要」），對 `[data-testid=channel-mix]` 截圖 `verification/revamp-v42/V42-0/overview-many-channels-channel-mix-1440.png`（574×680）、整個視窗 `overview-many-channels-overview-1440.png`（1440×1000），DOM 幾何寫到 `overview-many-channels-g4-geometry.json`。**實際觀察**：`.chart-frame.sm` 180 px、`recharts-wrapper` 524×180；兩組 `Bar` 各 9 根，**每根高 7.1 px、同列上期與本期長條間距 0、列距 15.78 px**（與上面的幾何估算相同）；端點數字 18 個（上期 9、本期 9，字框高 14 px）**互相疊壓**——同一列的「上期 2,716 元」（y 308.9–322.9）與「2,765 元」（y 316.0–330.0）重疊 6.9 px，下一列的「上期 2,723 元」（y 324.7 起）又疊進上一列的本期數字 5.3 px，截圖右側的數字已無法逐列讀出；Y 軸的通路標籤被 Recharts 自動隔列省略，只畫 CH01、CH03、CH05、CH07、CH09（5／9）；X 軸 0／1,000 元／2,000 元三個刻度正常。框下方的精簡表 9 列（本期 2,765 到 2,821 元、差額各 +49）與收合的資料表 9 列都完整可讀。**結論**：PRD §15 的風險列成立——G4 固定 180 px 在 9 通路時長條與端點數字擠成一片、Y 軸少一半標籤，可讀的只剩精簡表與資料表；V42-2a／2b 做群組合計列時以這張截圖為依據（群組列只加在表格，長條圖不混層；PRD §4.3、§15），示範資料（2 通路、每列 ≈ 71 px）的畫面不受影響。這個狀態不在 64 張畫面基準內，截圖只是目視證據，不做 `toHaveScreenshot` 比對。

## 7 功能保留與 E2E 文字斷言（06 V42-0 第 8 項）

| 檔案 | 內容 |
|---|---|
| `verification/revamp-v42/feature-retention.csv` | 表頭 `id,feature,page,v3_location,v4_location,v41_location,v42_location,change_type,locator,batch,status,covering_tests`（比 v4.1 多 `v42_location`，插在 `v41_location` 之後）；**195 列**＝v4.1 的 177 列（`id`、`feature`、`page`、`v3_location`、`v4_location`、`v41_location`、`change_type`、`locator`、`covering_tests` 原樣，以程式逐欄比對）＋v4.2 新增 18 列。產生方式：代理 C 以 Node 腳本解析來源 CSV（含引號欄位）、改寫 `v42_location`／`batch`／`status` 三欄後重新序列化（只在欄位含 `,`、`"`、換行時加引號；腳本先確認同一個寫入器能逐位元組還原來源檔）；LF 行尾。 |
| 沿用列（129 列） | `v42_location`「不變」、`batch`「—」、`status`「v4.1.2 已核對；v4.2 未改動（covering_tests 全過）」，不逐列重新核對；原本 `batch` 為 V41-n 的列（側欄入口、O2、O3、GV1–GV3 等）一併改成沿用，v4.1 的核對結果已在 `verification/revamp-v41/feature-retention.csv` |
| 受影響列（48 列；`status`「v4.1.2 已核對；預計 V42-n 改動（…）」） | **V42-1（7）**：14 儲存選單、51 資料來源 metadata、60 備份 v1–v4 還原、D49、D50 備份 JSON、D09、D29 Excel（對照列）。**V42-2a（14）**：18 期間列、19 期間摘要、25 目標達成行、30 與 G4 通路區塊、33 通路寬表、34 健檢清單、37 試算通路選擇、43 會議固定範圍、47 與上次會議比較、55 計算與來源抽屜、D05／D20／D23 決策工作稿 Markdown。**V42-2b（1）**：44 議程 1–6（通路寬表群組合計列、週會摘要 `groups`）。**V42-3（6）**：36 商品毛利頁、G13、G14、G24、MV2、12 指標定義 dialog（名詞小辭典補充）。**V42-5（20）**：49 會議輸出、50 A4 列印版、D08、D10、D11、D26、D27、D30、D32、D38、D40、D41、EX1、EX2、EX4（人讀匯出核對）、GA1、GA3、GA4、GA5、GA9（說明頁新步驟）。CSV 類（D01、D02、D06、D07、D18、D19、D21、D22、D24、D25、D28、D39、D51）維持代碼，列為沿用。 |
| 新增列（18 列；`status`「未做（V42-n）」、`covering_tests`「（V42-n 加）…」、`locator`＝CLAUDE.md a11y 段的計畫 testid） | **V42-1（5）**：CS1 通路設定區（`channel-settings`）、CS2 顯示名稱與順序（`channel-settings-row-{code}`）、CS3 群組編輯（`channel-settings-group-{groupId}`）、CS4 備份 `channel_settings`、EX5 Excel 通路設定對照列。**V42-2a（4）**：GR1 群組範圍選單（`scope-select`、`scope-option-group-{groupId}`）、GR2 範圍文字「{群組名} · {通路名}」、GR4 只看這個通路（`channel-drill-{code}`）、GR5 試算頁通路選單只列成員。**V42-2b（1）**：GR3 群組合計列（`group-row-{groupId}`；G4 精簡表、通路寬表、週會摘要 `groups`）。**V42-3（3）**：PV1 品類視角（`products-perspective`、`products-perspective-category`、`chart-products-category-table`、`chart-products-catvariance`）、PV2 SKU 跨通路合計視角（`products-perspective-sku-total`、`chart-products-skutotal-table`）、PV6 品類格的計算與來源（無階梯）。**V42-4（3）**：PV3 通路 × 品類交叉表（`products-perspective-cross`、`chart-products-cross-table`、`chart-products-cross-cell-{channel}-cat-{category}`）、PV4 C3 通路獲利結構表（`products-structure-{channel}`）、PV5 綜合區塊（`products-perspective-combined`、`products-combined-{block}`）。**V42-5（2）**：EX6 Excel `categories` 工作表（選配）、GS1 說明頁新步驟（`guide-step-{area}-{stepKey}`、`guide-shot-{mediaId}`）。 |
| `verification/revamp-v42/e2e-text-assertions.csv` | 自 `verification/revamp-v41/e2e-text-assertions.csv` 逐位元組複製（`cmp` 相同；sha256 `f2cbbe209eeb67ebacf7617f6b9f7963d5733d167f25d208678931caf38bccb3`；1,458 列＋表頭，最後一欄 `v41_batch`）；延續，本批不加欄。之後批次新增或改動的定位器在既有欄位登記，需要時再加 `v42_batch` 欄 |

V42-0 沒有任何 `batch`＝V42-0 的列（本批不改畫面）；V42-6 只確認 `batch`＝V42-n 的列都已打勾。

## 8 瀏覽器量測（主流程，由主流程填寫）

| 項目 | 結果 | 證據 |
|---|---|---|
| 完整 E2E（帶三個 `*_OUT`） | 由主流程填寫（V41-6 為 1,143 passed、0 failed、29 skipped） | `verification/revamp-v42/V42-0/axe.json`、`keyboard-walk.json`、`network-log.json` |
| 畫面基準 64 張（`verification/revamp-v42.capture.config.ts`；基準自 V41-6 複製，不帶 `--update-snapshots`） | 由主流程填寫（必須 0 差異） | `verification/revamp-v42/V42-0/snapshots/` |
| overview-many-channels G4 目視（1440 截圖；06 V42-0 第 7 項、PRD §15） | **已做**（審查修正補做，不在共通驗收的 64 張內）：9 通路時 G4 的長條每根 7.1 px、間距 0、端點數字互疊、Y 軸只畫 5／9 個通路標籤；精簡表與資料表各 9 列可讀；PRD §15 風險列成立。細節與結論見 §6 | `verification/revamp-v42/V42-0/overview-many-channels-channel-mix-1440.png`、`overview-many-channels-overview-1440.png`、`overview-many-channels-g4-geometry.json`；腳本 `overview-many-channels.spec.ts`（`CAPTURE_PORT=<埠> npx playwright test -c verification/revamp-v42/V42-0/`，對已啟動的 PUBLIC_DEMO 伺服器跑；資料 `tests/fixtures/synthetic-many-channels-9x7/`） |
| `/` 的 First Load JS（gzip） | 由主流程填寫（V41-6 為 519,705；`V42_HOME_FIRST_LOAD_BASELINE`＝實測，V42-1 起門檻＝實測＋8,192；B5 545,397 照舊） | `metrics.json` 的 `v42.homeFirstLoad` |
| 404 頁的 First Load（框架基準） | 由主流程填寫（V41-6 為 131,465）；說明頁 ≤ 框架基準＋5,120 | `metrics.json` 的 `v41.frameworkBaseline` |
| 首載 chunk 清單 | 由主流程填寫（`SPLIT_SENTINELS` 與 `GUIDE_SENTINELS` 在 `/` 首載 chunk 0 次；本批 `SPLIT_SENTINELS` 預留位置 0 個） | `first-load-modules.json` |
| B2 首屏、B3 390 無橫向捲動 | 由主流程填寫 | `metrics.json` |
| B9 1440 DOM 節點（七頁） | 由主流程填寫（V41-6：總覽 3,325、健檢 2,174、商品 2,510、試算 683、待辦 711、會議 1,064、資料來源 1,209；非預設視角的欄位預留，V42-3 起記基準） | `metrics.json` |
| 390 TBT（五項，低負載各 3 次取中位數與 loadavg） | 由主流程填寫：載入示範資料（門檻 1,109.1）、通路健檢（832.3）、商品毛利（129.9）、會議（1,071.2）、資料來源（50.0）；每次的 1 分鐘 loadavg 一併記；第六步「商品毛利切到品類視角」留位不量（V42-3 起） | `lighthouse/`、`lighthouse-runs/` |
| Lighthouse（8 頁＋2 說明頁，1440 與 390） | 由主流程填寫（Accessibility 不低於同頁基準且 ≥ 95，說明頁目標 100） | 同上 |
| axe 四尺寸 | 由主流程填寫（V41-6 為 28／28／28／26 個狀態，0 serious） | `axe.json` |
| keyboard-walk | 由主流程填寫（除 `checked_at` 外應與 V41-6 相同） | `keyboard-walk.json` |
| network-log | 由主流程填寫（下載集合恰好 5 種、無 POST） | `network-log.json` |
| `GUIDE_MEDIA=check` | 由主流程填寫（V41-6 後 47 項，差異 0） | `verification/guide-media/` 輸出 |
| launch-check（本機 3100） | 由主流程填寫（13 項＋19 項） | `launch-check-local.json` |
| audit:ui、contrast | 由主流程填寫（V41-6：hex 0、字級種類 11、JSX 中文 0；contrast 全過） | `ui-audit.json` |
