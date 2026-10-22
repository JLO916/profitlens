# v4.2 V42-1a 驗收：通路設定模組、名稱套用與備份（2026-10-22）

依 `docs/revamp-v4.2/06_BATCHES.md` 的「V42-1a」（2026-10-20 自 V42-1 拆出；不改任何畫面）。拍板：D-V42-9＝A、D-V42-13＝A、D-V42-14＝A（使用者 2026-10-16「其他都依建議」）。D-V42-1 的補充問題（是否已匯入過自己的多通路資料）使用者尚未回答，不擋本批。

| 步驟 | commit | 內容 |
|---|---|---|
| 開工錨點 | `4ed65c7` | 06 把 V42-1 拆成 1a／1b；00_README 批次表 |
| A1 模組與過渡 API | `9029844` | `src/application/channel-settings.ts`（純模組）、`createSnapshot` 第 4 個選填參數與快照的選填 `channel_names`／`channel_groups`、`copy.ts` 四個函式過渡期同時接受 `boolean | NameResolver`、`snapshotResolver`；dashboard、meeting-page、multi-scenario-workbench、action-workspace、review-session（含子集稽核 12c）；`tests/channel-settings.test.ts`（14）、`tests/channel-names-snapshot.test.ts`（4） |
| B 備份與隱私 | `dda045f` | v5 信封選填 `payload.channel_settings`（與預設沒有差時不寫鍵）；`restoreV4` 與兩條 scopeKey 快取路徑先驗設定再建快照；`RestoredWorkspace.dropped_channel_codes`；`storage.v42.droppedChannels` 字串；備份四份測試；`tests/ai-snapshot-channel-names.test.ts` |
| C 呼叫點遷移 | `5605d62` | 65 個檔（34 個 `src/`：10 個 `src/application`、24 個 `src/components`；31 個測試）改用名稱解析器；人讀匯出的範圍文字走解析器；CSV 的 `channel` 欄仍是代碼 |
| E 整合 | `d0da301`、`3fab21a`、`51aa942` | 合併 B、C（0 衝突）；移除 `copy.ts` 的 `alias: boolean` 過渡與 `demoAlias`（規則保留在 `isDemoDataset`）；修 `verification/revamp-v4/mockups/gen/source.ts` 的型別 |
| 審查 | — | 兩個面向（規格與規則；行為與測試是否真的會擋），blocker 0、major 5（兩位各報的合併後）、nit 9，見 §5 |
| 審查修正 | `f22f7c2` | 5 件 major：會議摘要與議程的通路寬表傳 `snapshot`；Excel 待辦工作表的範圍文字與活頁簿同一個解析器；套用還原時以既有的 `storage-notice` 顯示略過的通路代碼（`storage.v42.droppedChannels`）；一頁摘要／會議紀錄／決策 Markdown 與待辦範圍文字改走快照解析器；五個非備份的 `createSnapshot` 呼叫點各加一條「漏傳設定就失敗」的測試（`tests/channel-names-call-sites.test.tsx`、`tests/channel-names-exports.test.ts`） |
| 主流程 | 見 §2、§3 | E2E、畫面基準、首載、Lighthouse、媒體比對、launch-check；STATUS、06 進度、功能保留表 |

**本批不改任何畫面**：沒有 JSX 結構變動（只有參數與 props 的傳遞）；沒有新的使用者看得到的字串，除了還原提示 `storage.v42.droppedChannels`（本批只定義、不渲染）。

## 1. 完成項目

| 06 項目 | 狀態 | 說明 |
|---|---|---|
| 1 設定模組 | 完成 | `channel-settings.ts`：`CHANNEL_SETTINGS_VERSION = "channel-settings-v1"`；型別；`validateChannelSettings`（未知代碼丟棄並回報、四條名稱規則、NFC、通路與群組之間不重複；比規格再嚴一點：顯示名稱可以等於自己的代碼，但不能等於別的通路代碼，避免畫面上兩個通路同名）；`normalizeChannelSettings`（等於預設的欄位去掉、剩空回 null）；`defaultChannelSettings`（`synthetic-demo*` 的預設＝`demoChannelAlias`，永遠不寫進備份）；`resolveChannelNames`、`resolveChannelGroups`（成員集合、順序無關）、`orderedChannels`（同序依代碼）、`makeResolver` |
| 2 名稱套用 | 完成 | `createSnapshot(dataset, filters, hash, settings?)`；快照只在有設定且正規化後非空時才有 `channel_names`／`channel_groups`（沒有設定時快照的鍵集合與 v4.1.2 相同，`filter_hash`、`dataset_hash` 不變，測試斷言）；10 個呼叫點全部傳入設定（匯入精靈與載入示範傳 `null`；`applyFilters`、會議頁、試算頁、待辦重算、會議重算傳 `Active.channel_settings`；還原的三處先讀 `payload.channel_settings`）；`copy.ts` 的 `channelLabel`、`channelsLabel`、`scopeLabel`、`categoryLabel`、`ruleCopy` 改收 `NameResolver`，`demoAlias` 移除；35 個檔的呼叫點改讀 `snapshotResolver(snapshot)`，只有 `dataset_id` 的地方用 `makeResolver(undefined, datasetId)`；快照與獨立的 summary／session 同時存在時先比對 `dataset_id`，不讓別的資料集的名稱套到舊的會議或摘要上。單元測試：試算頁的單一通路快照與還原後的快照，`scopeLabel` 等於設定的顯示名稱 |
| 3 儲存 | 完成 | v5 信封加選填 `payload.channel_settings`（匯出前先驗證再正規化；示範、golden 與「設定等於預設」的六種情況都不寫鍵，備份位元組等於 v4.1.2 的 `tests/fixtures/backup-bytes-v4-7b.json`）；還原時先驗設定（丟棄未知代碼，記在 `RestoredWorkspace.dropped_channel_codes`）再建快照；v1 到 v4 信封帶 `channel_settings` 一律 `INVALID_WORKSPACE_FORMAT`；有設定時往返相等。**差異**：repo 沒有既有的非 JSX 還原提示機制（`imported_at` 只是帶進狀態），所以本批只定義字串 `storage.v42.droppedChannels` 並把代碼帶出來，提示的渲染放到 V42-1b（JSX） |
| 4 隱私 | 完成 | `tests/ai-snapshot-channel-names.test.ts`：帶 `channel_names`／`channel_groups` 的快照做成 AI 負載後，序列化結果不含顯示名稱與群組名；`docs/AI_CONTRACT.md` 不改。CSV／XLSX 人讀欄位的跳脫沿用既有寫出函式（V42-1b 對照列時再確認 `=`、`+`、`-`、`@` 開頭） |
| 5 人讀匯出的範圍文字 | 完成 | Excel 範圍文字、PPT、一頁摘要、週會摘要、會議紀錄走解析器；`manager-summary.ts` 的 CSV 仍寫 `row.channel`；`export-numeric-baseline` 不變 |

## 2. 驗收命令與結果（程式 `f22f7c2`；收尾 commit 只加文件與證據）

| 命令 | 結果 |
|---|---|
| `npm run typecheck`、`npm run lint` | exit 0 |
| `npm run audit:ui -- --json verification/revamp-v42/V42-1a/ui-audit.json` | hex 0、字級 11（不變）、JSX 中文 0、元件字串常值中文 0；copy 16 項與 V42-0 相同（blacklistSynonym 12） |
| `npm run contrast-check` | 85／85 |
| `npm test -- --run` | **172 檔、3,622 個測試全過**（比 V42-0 多 5 檔 45 個：channel-settings 14、channel-names-snapshot 4、ai-snapshot-channel-names、channel-names-call-sites、channel-names-exports，備份四份測試各加案例） |
| `npm run build` | exit 0（LOCAL 與 PUBLIC_DEMO 各一次） |
| `npm run test:e2e`（帶 `NETWORK_LOG_OUT`、`KEYBOARD_WALK_OUT`、`AXE_OUT`、`GUIDE_SHOTS_OUT`） | **1,143 passed、0 failed、29 skipped（38.1 分鐘；開跑時 1 分鐘負載 20.8，說明首頁改寫的審查代理同時在跑）**；跑完已還原 E2E 改寫的追蹤檔 |
| `CAPTURE_BATCH=V42-1a` | **38 passed、0 failed**，64 張全部 0 差異（基準自 V42-0 複製，不帶 `--update-snapshots`） |
| `GUIDE_MEDIA=check` | 47／47（44 張截圖＋15 個影片 cue），0 差異 |
| launch-check（本機 PUBLIC_DEMO） | 13 項全部通過，補充 19 項全部通過 |
| Lighthouse × 3 | 390 TBT 五項通過（第一組中位數 1,093.0／825.4／92.9／993.2／23.8；第二組見下方）；工作台 a11y 全 100；首頁 390 Performance 93–94；說明頁 a11y、SEO 100、Performance 98–100 |
| 禁區與邊界五條 | 都是空的；`evidence-ladder.ts`、`targets.ts` 對錨點的 diff 為空 |
| `git diff --stat --diff-filter=A acd56a9 HEAD -- src/application tests` | `src/application/channel-settings.ts`（167 行）與 5 個測試檔（`ai-snapshot-channel-names`、`channel-names-call-sites`、`channel-names-exports`、`channel-names-snapshot`、`channel-settings`） |

**量測**：

- **First Load JS**：`/` 是 **521,487**（V42-0 519,705，**+1,782**；門檻 527,897，`v42.homeFirstLoad.asserted` 為真）。差額組成（`first-load-modules.json` 逐 chunk 比對）：`app/page` chunk +1,781（`channel-settings.ts` 進首載：`createSnapshot` 經 `snapshotChannelFields` 呼叫驗證與正規化、`copy.ts` 的解析器、35 個呼叫點的參數傳遞；新字串 `storage.v42.droppedChannels` 1 條）、`webpack` +1；其餘 5 個 chunk 0。`SPLIT_SENTINELS` 8 個與 `GUIDE_SENTINELS` 2 個都 0 次。
- **說明頁 First Load**：`/guide` 131,466（+1 byte，webpack runtime；門檻 136,585）；11 個功能區頁同。
- **DOM 節點（B9）**：七頁與 V42-0 完全相同（1440 總覽 3,337、健檢 2,186、商品 2,522、試算 695、待辦 723、會議 1,076、資料來源 1,221）。
- **axe**：28／28／28／26 個狀態，全部 0 問題。
- **network-log**：下載集合 5 種、非 GET 0；**keyboard-walk** 除 `checked_at` 外與 V42-0 相同。

**Lighthouse × 3（第一組）**（`scripts/lighthouse-pages.mjs`，每次開跑前等 1 分鐘負載 < 2.5：三次開跑時 2.47、2.30、2.39，但 5 分鐘負載 3.7–3.8，說明首頁改寫的審查代理在背景）：

| 步驟（390 TBT，ms） | 第 1 次 | 第 2 次 | 第 3 次 | 中位數 | 門檻 | V42-0 |
|---|---|---|---|---|---|---|
| 載入示範資料 | 1,093.0 | 1,106.5 | 1,019.2 | **1,093.0** | 1,109.1 | 1,029.4 |
| 健檢 | 825.4 | 1,069.0 | 797.1 | **825.4** | 832.3 | 791.5 |
| 商品 | 92.9 | 101.3 | 89.1 | **92.9** | 129.9 | 89.1 |
| 會議 | 977.3 | 1,085.3 | 993.2 | **993.2** | 1,071.2 | 983.0 |
| 資料來源 | 38.3 | 23.8 | 15.8 | **23.8** | 50.0 | 12.6 |

五項都在門檻內，但載入示範資料與健檢比 V42-0 高 30–60 ms、第 2 次健檢 1,069 是離群值；依 D-V4-47 的精神在機器較閒時再量一組（第二組）：

| 步驟（390 TBT，ms；第二組，開跑時 1 分鐘負載 2.36、2.35、2.21） | 第 1 次 | 第 2 次 | 第 3 次 | 中位數 | 門檻 | V42-0 |
|---|---|---|---|---|---|---|
| 載入示範資料 | 1,017.4 | 1,130.4 | 1,054.5 | **1,054.5** | 1,109.1 | 1,029.4 |
| 健檢 | 811.1 | 793.3 | 821.2 | **811.1** | 832.3 | 791.5 |
| 商品 | 105.3 | 94.3 | 95.2 | **95.2** | 129.9 | 89.1 |
| 會議 | 991.8 | 992.5 | 1,014.1 | **992.5** | 1,071.2 | 983.0 |
| 資料來源 | 21.9 | 24.9 | 61.8 | **24.9** | 50.0 | 12.6 |

兩組六次的中位數都在門檻內（個別離群：第一組健檢 1,069.0、第二組載入 1,130.4 與資料來源 61.8）。與 V42-0 相比載入示範資料高 25–64 ms、健檢高 20–34 ms；兩組的 5 分鐘負載都在 3–4（V42-0 量測時 3.8–5.5），所以還分不出是本批的解析器與 `createSnapshot` 多做的驗證造成，還是主機負載；本批對這兩步的程式改動只有解析器建立與參數傳遞，`channel_settings` 沒有值時 `snapshotChannelFields` 走的是預設比對。V42-1b 量到時若仍高於 V42-0 20 ms 以上，依 D-V4-47 做成對 A/B。資料來源頁由 12.6 升到 24–25 ms，絕對值小、在門檻 50 內，一併觀察。

**事後補充（2026-10-22，V42-G1 驗收時）**：V42-G1 只改說明首頁，工作台的程式與本批相同；它的三次 Lighthouse（1 分鐘負載 2.27–2.46、5 分鐘 3.3–4.0）量到 390 TBT 中位數 **1,016.9／783.9／87.0／963.5／12.8**，五項都回到 V42-0 的水準。所以上面兩組高出的 20–60 ms 是主機負載，不是本批的程式；V42-1b 不需要成對 A/B。

- **工作台**：a11y 三次都是全部 100；首頁 Performance 1440 都 100、390 是 94、93、94；所有切頁 CLS ≤ 0.002；預先載入的 10 個 chunk 都沒有落入量測區間。
- **說明頁**：`/guide`、`/guide/overview` 的 a11y、SEO 全部 100；Performance 1440 都 100，390 是 98–100；CLS 0。
- **證據**：`lighthouse-runs/run1`、`run2` 是第一組的第 1、2 次，`metrics.json` 的 Lighthouse 區段與 `lighthouse/` 是第 3 次；第二組在 `lighthouse-runs/rerun1`–`rerun3`。


**B 級對帳與備份矩陣**：本批沒有 B 級函式（群組合計在 V42-2b）；備份矩陣 v1 到 v5 golden／demo 全部還原、帶設定的列往返相等、`dropped` 都是空（`BACKUP_MATRIX_OUT`）。

## 3. 畫面基準

基準自 `verification/revamp-v42/V42-0/snapshots/` 複製，`CAPTURE_BATCH=V42-1a` 不帶 `--update-snapshots` 跑一次：**38 passed、0 failed**，64 張 0 差異。本批「允許變動畫面」為無，符合（沒有 UI，`channel_settings` 沒有值時所有畫面逐位元組相同）。

## 4. 邊界檔的 diff 範圍

`git diff 4ed65c7 HEAD` 的範圍（都在 CLAUDE.md 允許的方式內）：

| 邊界檔 | diff | 內容 |
|---|---|---|
| `src/application/copy.ts` | +15／−13 | import `NameResolver`、`makeResolver`；`channelLabel`、`channelsLabel`、`categoryLabel`、`scopeLabel`、`ruleCopy` 的第二個參數由 `alias: boolean` 改成 `NameResolver`；新增 `snapshotResolver(snapshot)`；`demoAlias` 移除（規則留在 `channel-settings.ts` 的 `isDemoDataset`）；模板字串與既有輸出逐字不變 |
| `src/application/workspace.ts` | +10／−1 | import 型別；`WorkspaceSnapshot` 加選填 `channel_names`、`channel_groups`（註解）；`createSnapshot` 第 4 個選填參數 `settings`，只在 `snapshotChannelFields` 回非 null 時以條件展開放進快照；`filter_hash` 仍是 `digest(report.scope)` |
| `src/application/workspace-backup.ts` | +50／−16 | zod：v5 payload 加選填 `channel_settings`（strictObject）；`WorkspaceBackupSource` 加 `channel_settings`；`RestoredWorkspace` 加 `channel_settings`、`dropped_channel_codes`；匯出時先驗證再正規化、非 null 才寫鍵；`restoreV4` 與兩條 scopeKey 快取路徑先讀設定再 `createSnapshot(…, settings)`；v1 到 v3 的還原路徑只加 `null` 參數 |
| `src/application/evidence-ladder.ts`、`targets.ts` | 0 | 未動 |

`src/` 共 46 個檔（`src/application` 18、`src/components` 27、`src/i18n` 1）；呼叫點遷移沒有任何 JSX 結構變動（審查者以標籤多重集合比對刪除／新增行，14 個含 JSX 的檔都是 0 不平衡）。

## 5. 審查

整合分支 `51aa942` 由兩個面向審查（規格與規則；行為與測試是否真的會擋）。審查者在乾淨的 scratch 檢出比對錨點與分支：**64 個摘要（備份文字、Excel 模型與位元組、PPTX、一頁摘要 Markdown、各種 CSV、週會摘要、決策 MD／CSV／JSON、會議 JSON／MD、快照 JSON；golden／demo × 全部／單一通路）在沒有設定時逐位元組相同**。

major（5 件，`f22f7c2` 全部修正）：

1. 總覽與會議的通路寬表沒有傳 `snapshot`，同一個通路在相鄰列顯示名稱、在寬表顯示代碼。
2. Excel 待辦工作表的範圍文字用 `makeResolver(undefined, dataset_id)`，與同一本活頁簿其他工作表的解析器不同。
3. 還原時略過的通路代碼只回傳、沒有顯示：改在既有的 `storage-notice` 元素以 `storage.v42.droppedChannels` 顯示（零畫面差異；06 第 3 項因此完成，不是部分）。
4. 五個非備份的 `createSnapshot` 呼叫點漏傳設定時沒有測試會擋：加五條測試，變異後 5 失敗（已驗證）。
5. 一頁摘要、會議紀錄、決策 Markdown 與待辦的範圍文字仍只用 `dataset_id` 建解析器：改成選填 `resolver`，由呼叫端傳快照解析器，歷史綁定依 `dataset_hash` 判斷。

nit 只記錄（9 項），例如：
- `validateChannelSettings` 的 `invalidNames` 沒有向使用者顯示（規格只要求未知代碼）；V42-1b 做編輯器驗證時一併考慮。
- 兩個 merge commit 沒有 Co-Authored-By 尾行（代理的三個實作 commit 都有）。
- `verification/revamp-v4/mockups/gen/source.ts` 改了型別但沒重產 mockup（示範與合成資料的輸出相同）。
- `guide.zh-TW.ts` 沒有「── V42-1a 錨點」：本批沒有說明頁字串，驗收文件記錄即可。
- 群組 `order` 的預設值用原始索引（略過無效項目後可能不連續；只用相對順序，無害）。

## 6. 已知限制與風險（每批重述）

- 品類與 SKU 只到商品毛利；群組不觸發 `NEGATIVE_CHANNEL_CM`；試算仍單一通路；目標不配群組（D-V42-3、12）。
- 還原時丟棄未知代碼的提示本批只有資料沒有畫面（V42-1b 渲染）。
- 本批沒有 UI 可以寫入 `Active.channel_settings`，所有畫面與匯出在沒有設定時逐位元組相同；有設定的路徑只由單元測試與備份矩陣覆蓋，E2E 在 V42-1b 加。

## 7. 下一批

V42-1b 編輯器、對照列與 E2E（含還原提示的渲染、`invalidNames` 是否要提示）。人工關卡 H8 在 V42-2a 後；H6 待人工。
