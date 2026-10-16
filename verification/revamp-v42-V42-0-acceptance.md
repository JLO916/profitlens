# v4.2 V42-0 驗收：基準與護欄（2026-10-16）

依 `docs/revamp-v4.2/06_BATCHES.md` 的「V42-0」。使用者 2026-10-16 回覆「其他都依建議」（D-V42-1 到 23 全部依建議值）與「V42-0」開工。基準 v4.1.2＝tag `v4.1.2`＝`e256154`；分支 `revamp/v4.2` 自 `origin/main`（`00584a5`）開出，不 push。

| 步驟 | commit | 內容 |
|---|---|---|
| 開工錨點 | `bcb6c91` | CLAUDE.md 整份換成 v4.2 版（填入拍板）；06、00_README 狀態 |
| 實作 A | `5656517` | labels 第三份快照、`V42_NEW_KEY_PREFIXES`、copy-scan 新規則、第五份 testid 清單 |
| 實作 B | `77123f8` | `verification/revamp-v42.capture.config.ts`、`metrics.spec.ts` 的 V42 預留欄位、`lighthouse-pages.mjs` 第六步留位、`overview-many-channels` 頁面狀態與 M1 測試 |
| 實作 C | `60f6d6f` | 功能保留表 v4.2、`e2e-text-assertions.csv` 延續、子集敏感分支稽核、基準文件骨架、`npm audit` |
| 整合 | `1d55d9e`、`8615252`、`c8ff85d`、`67ee3d2` | 三支分支合併、基準文件 §3–§6 填入、64 張基準自 V41-6 複製 |
| 審查 | — | 兩個面向（規格與規則、測試是否真的會擋），major 1、nit 8，見 §4 |
| 審查修正 | `b384dcd` | overview-many-channels 的 G4 擁擠程度補瀏覽器目視（合成資料寫成 `tests/fixtures/synthetic-many-channels-9x7/`，1440 截圖與幾何量測） |
| 主流程 | 見 §2、§6 | E2E、畫面基準、首載、Lighthouse、媒體比對、launch-check、基準文件 §8、`V42_HOME_FIRST_LOAD_BASELINE` 填入 |

**V42-0 不改 `src/` 任何檔案**：`git diff --stat bcb6c91 HEAD -- src` 為空（整合分支與主檢出各確認一次）；`tests/e2e/` 也沒有改動。

## 1. 完成項目

| 06 項目 | 狀態 | 說明 |
|---|---|---|
| 1 分支與 CLAUDE.md | 完成 | `revamp/v4.2` 自 `00584a5` 開出；CLAUDE.md 以 00_README 末節草案整份取代，〔〕全部填入拍板（錨點 `bcb6c91`） |
| 2 labels | 完成 | `verification/revamp-v42/labels-v41.flat.json`：**3,163** 個葉節點（`labels.zh-TW.ts` 2,842＋`guide.zh-TW.ts` 321），鍵依碼位排序，sha256 `0bc9927d…`；來源兩檔與 `e256154` 逐位元組相同。`tests/labels-structure.test.ts` 加 `V42_NEW_KEY_PREFIXES`（9 個）與「V42-0 labels 護欄」3 個測試：三份快照（v3 2,581、v4 2,839、v4.1 3,163）逐鍵逐字相同、快照以外的新葉節點只能在 V42 前綴或 `guide.` 下、前綴不與舊清單重疊；`LABEL_GROUPS` 24 組不變。負向檢查：改一個既有字串（labels 或 guide）測試都失敗並點名 key |
| 3 掃描規則 | 完成 | `scripts/lib/copy-scan.mjs`：「賠錢」「虧損」範圍加 `products.perspectivesV42.`；`L1_KEY_PATTERNS` 加 `products.perspectivesV42.*.title`（7 → 8 條）；對既有字串 0 違規，棘輪數值不變 |
| 4 testid | 完成 | `verification/revamp-v42/testids-v42-added.txt`（只有表頭）；`tests/testid-baseline.test.ts` 比五份（228／416／343／108／0 列），刪除數 0／0／0／0／0 |
| 5 畫面基準與量測 | 完成 | `verification/revamp-v42.capture.config.ts`（基準存 `verification/revamp-v42/{batch}/snapshots/`）；64 張自 V41-6 逐位元組複製；`metrics.spec.ts` 加 `V42_HOME_FIRST_LOAD_BASELINE`（本批填入實測值，V42-1 起斷言 ≤ 實測＋8,192、取代 v4.1 的 ＋1,024）、`V42_SPLIT_SENTINELS`（空）、`B9_PERSPECTIVE_BASELINE`（空）、`_meta` 指到 V42-0 基準文件；既有斷言與輸出鍵不變 |
| 6 390 TBT | 完成 | 見 §2（三次、低負載、中位數與 loadavg）；`scripts/lighthouse-pages.mjs` 留第六步位置（`SIXTH_STEP_ENABLED=false`，不量） |
| 7 子集敏感分支稽核 | 完成 | `verification/revamp-v42/V42-0-subset-audit.md`：31 條，V42-2a 修 20、V42-1 修 1（`review-session.ts:126`）、不受影響 10；`filter_hash` 使用處 25 個檔都只做相等比對或原樣顯示。`overview-many-channels`（9 通路）頁面狀態＋M1 測試；G4 擁擠程度實測（1440）：每根長條 7.1 px、同列上期／本期間距 0、端點數字互疊、Y 軸只畫 5／9 個通路 → V42-2b 做群組合計列時要處理（PRD §15） |
| 8 功能保留 | 完成 | `verification/revamp-v42/feature-retention.csv`：195 列＝沿用 129（「v4.1.2 已核對；v4.2 未改動」）＋受影響 48（標預計批次）＋新增 18（CS、GR、PV、EX、GS 列）；沿用的 9 欄與 v4.1 逐字相同；`e2e-text-assertions.csv` 延續（1,458 列，與 v4.1 相同） |
| 9 基準紀錄 | 完成 | `verification/revamp-v42/V42-0-baseline.md` §1–§8 |

## 2. 驗收命令與結果（程式 `b384dcd`＋主流程的 `metrics.spec` 常數填入）

| 命令 | 結果 |
|---|---|
| `npm run typecheck`、`npm run lint` | exit 0 |
| `npm run audit:ui -- --json verification/revamp-v42/V42-0/ui-audit.json` | hex 0、字級 11（不變）、JSX 中文 0、元件字串常值中文 0；各項與 V41-6 相同 |
| `npm run contrast-check` | 85／85 |
| `npm test -- --run` | **167 檔、3,577 個測試全過**（比 V41-6 多 7 個：labels-structure 3、testid-baseline 3、mounted-testids 1） |
| `npm run build` | exit 0 |
| `npm run test:e2e`（帶 `NETWORK_LOG_OUT`、`KEYBOARD_WALK_OUT`、`AXE_OUT`、`GUIDE_SHOTS_OUT`） | **1,143 passed、0 failed、29 skipped（35.8 分鐘）**。在錨點 `bcb6c91` 執行；之後合併的 commit 不含 `src/` 與 `tests/e2e/`（`git diff --stat bcb6c91 HEAD -- src tests/e2e` 為空），所以結果適用於本批。跑完已還原 E2E 改寫的追蹤檔 |
| `CAPTURE_BATCH=V42-0`（新設定檔） | **38 passed、0 failed**，64 張全部 0 差異（基準自 V41-6 逐位元組複製，不帶 `--update-snapshots`）；`metrics.json`、`first-load-modules.json` 寫到 `verification/revamp-v42/V42-0/` |
| `GUIDE_MEDIA=check` | 47／47（44 張截圖＋15 個影片 cue），0 差異 |
| launch-check（本機 PUBLIC_DEMO） | 13 項全部通過，補充 19 項全部通過 |
| Lighthouse × 3 | 390 TBT 五項通過（中位數 1,029.4／791.5／89.1／983.0／12.6）；工作台 a11y 全 100；首頁 390 Performance 94–95；說明頁 a11y、SEO 100、Performance 98–100；見下方 |
| 禁區與邊界五條 | 都是空的；`git diff --stat --diff-filter=A bcb6c91 HEAD -- src/application tests` 只有 `tests/fixtures/synthetic-many-channels-9x7/`（5 個檔） |

**量測**：

- **First Load JS**：`/` 是 **519,705**（與 V41-6 相同；`V42_HOME_FIRST_LOAD_BASELINE` 填入 519,705，V42-1 起門檻 **527,897**＝實測＋8,192，取代 v4.1 的 520,451；B5 545,397 照舊）；`SPLIT_SENTINELS` 8 個與 `GUIDE_SENTINELS` 2 個在首載 chunk 都 0 次（對照組 `shell.guideV41.homeHint` 1 次）；`V42_SPLIT_SENTINELS` 0 個（預留）。
- **說明頁 First Load**：404 框架基準 131,465；`/guide` 與 11 個功能區頁都是 131,465（差 0；門檻 136,585）。
- **DOM 節點（B9）**：1440 經營總覽 3,337、通路健檢 2,186、商品毛利 2,522、假設試算 695、待辦 723、會議 1,076、資料來源 1,221（1280 總覽 3,361；390 總覽 3,324、資料來源 1,218）；與 V41-6 相同；`b9Perspectives` 預留欄位為空（V42-3 起）。
- **axe**：28／28／28／26 個狀態，全部 0 問題（與 V41-6 相同）。
- **keyboard-walk**：除 `checked_at` 外與 V41-6 逐位元組相同。
- **network-log**：桌機與手機各 24 個請求，下載集合恰好 5 種（analysis_csv、excel、pptx、decision_json、backup），沒有非 GET、沒有外部網域、CSV 無內容外洩。

**Lighthouse × 3**（`scripts/lighthouse-pages.mjs`，每次開跑前等 1 分鐘負載 < 2.5：三次開跑時 1 分鐘負載 2.33、2.31、2.37，5 分鐘負載 5.5、4.5、4.0——實作代理剛結束，系統尚未完全閒置）：

| 步驟（390 TBT，ms） | 第 1 次 | 第 2 次 | 第 3 次 | 中位數 | 門檻 |
|---|---|---|---|---|---|
| 載入示範資料 | 977.9 | 1,029.4 | 1,080.9 | **1,029.4** | 1,109.1 |
| 健檢 | 788.0 | 791.5 | 822.1 | **791.5** | 832.3 |
| 商品 | 88.3 | 89.1 | 97.9 | **89.1** | 129.9 |
| 會議 | 1,020.9 | 983.0 | 970.6 | **983.0** | 1,071.2 |
| 資料來源 | 11.9 | 12.6 | 17.0 | **12.6** | 50.0 |

- **工作台**：a11y 三次都是全部 100；首頁 Performance 1440 都 100、390 是 95、94、94；所有切頁 CLS ≤ 0.002；預先載入的 10 個 chunk 都沒有落入量測區間。
- **說明頁**：`/guide`、`/guide/overview` 的 a11y、SEO 全部 100；Performance 1440 都 100，390 是 98–99；CLS 0。
- **第一次嘗試**（實作代理同時執行、5 分鐘負載 3–6）：1,035.6／1,089.7／1,087.5、834.3／819.9／819.7、100.0／92.4／92.8、1,038.6／1,016.2／978.8、16.6／16.4／16.2——中位數也都在門檻內，但不當基準（scratchpad `v420-lh-first/`）。
- **證據**：`lighthouse-runs/run1`、`run2` 是第 1、2 次，`metrics.json` 的 Lighthouse 區段與 `lighthouse/` 的報告是第 3 次。
- **第六步**（商品毛利切到品類視角）：留位不量（`SIXTH_STEP_ENABLED=false`），V42-3 起。


## 3. 畫面基準

基準先從 `verification/revamp-v41/V41-6/snapshots/` 逐位元組複製（整合代理 E，`diff -rq` 相同）。`CAPTURE_BATCH=V42-0` 不帶 `--update-snapshots` 跑一次：**38 passed、0 failed**，64 張 0 差異，`git status` 在 `snapshots/` 下沒有任何變動。本批「允許變動畫面」為無，符合。

## 4. 審查

整合分支 `67ee3d2` 由兩個面向審查，只報 blocker、major：

1. **major**：06 第 7 項的「`overview-many-channels` 目視 G4 擁擠程度」只做到 SSR 幾何估算，沒有瀏覽器目視。處置（`b384dcd`）：把 `manyChannelsActive()` 的三份 CSV 與 manifest 原樣寫成 `tests/fixtures/synthetic-many-channels-9x7/`（CLAUDE.md 允許新測試資料放 `tests/fixtures/`；`dataset_hash` 與 SSR 狀態相同），用 Playwright 在 1440 載入後截圖並量 G4 幾何，證據在 `verification/revamp-v42/V42-0/overview-many-channels-*.png`、`-g4-geometry.json`。
2. 第二位審查者對每道護欄做了「改了就會擋」的驗證：改既有字串（labels、guide）、加非允許前綴的 key、第五份 testid 清單加錯誤批次或未渲染的 testid、`products.perspectivesV42` 下放「虧損」與 15 字以上的標題，都在預期的測試失敗；允許的情況（`guide.` 新 key、`products.perspectivesV42.` 新 key）通過。

**nit 只記錄（8 項）**，例如：
- `metrics.spec.ts` 的 `GUIDE_FORBIDDEN` 仍只展開 `SPLIT_SENTINELS`，沒併入 `V42_SPLIT_SENTINELS`（本批是空集合，零影響；V42-1 加第一個 sentinel 時一併改）。
- 基準文件 §4 的批次範圍描述與正規式不一致（v42 寫到 V42-5，正規式允許到 V42-6）；子集稽核引用 `src/application/rules.ts` 應為 `src/domain/rules.ts`。
- `lighthouse-pages.mjs` 的第六步名稱暫用中文字面值（只在 `SIXTH_STEP_ENABLED=true` 時出現在錯誤訊息），V42-3 實作時改由 labels 組成。
- labels-structure 的一個測試名稱還寫「V3、V4 或 V41 新鍵」。
- 子集稽核多了第三種處置「V42-1 修」（12c），V42-1 開工時列入該批清單。

## 5. 已知限制與風險（每批重述）

- 品類與 SKU 只到商品毛利；群組不觸發 `NEGATIVE_CHANNEL_CM`；試算仍單一通路；目標不配群組（D-V42-3、12）。
- G4 在 9 通路時已明顯擁擠（每根 7.1 px、端點數字互疊）；V42-2b 的群組合計列要先決定通路數上限內的畫法（D-V42-28 ≤ 8）。
- `npm audit` 仍 8 個 high（xlsx 1、pptxgenjs→image-size 2、eslint-config-next 鏈 5），與 V41-3 之後相同，lockfile 未動。
- 本批 Lighthouse 的第一次嘗試在實作代理同時執行時量到（5 分鐘負載 3–6），五項都仍在門檻內；基準以閒置狀態重量的三次為準（§2）。

## 6. 下一批

V42-1 通路設定（開工前評估拆 1a／1b；開工前再問 D-V42-1 的補充問題：是否已用自己的 CSV 匯入過多通路資料）。被擋住的人工關卡：H8 在 V42-2a 後；H6 待人工。沒有新的待拍板事項。
