# V42-0 子集敏感分支稽核（唯讀清單）

> V42-0 第 7 項（`docs/revamp-v4.2/06_BATCHES.md` V42-0 範圍第 7 項；`docs/revamp-v4.2/01_PRD.md` §4.4）。產生日 2026-10-16；讀的是 HEAD `bcb6c91`（`src/` 與 v4.1.2＝`e256154` 逐位元組相同：`git diff --stat e256154 -- src` 為空），行號都在 HEAD 重新核對過，與 PRD 起草時不同的已更正。**本清單不改任何程式**；標「V42-2a 修」的每一條，V42-2a 每處一條測試，群組範圍與單一通路範圍都跑（06 V42-2a 第 5 項）。
>
> 名詞：「子集」＝ `report.scope.channels` 是 `manifest.channels` 的 2 到 n−1 個通路。v4.1.2 的期間列只給「全部通路」與單一通路兩種選項，子集只會由還原備份（`active.filters` 或會議的 `source_fixed.channels`）、手寫 filters 或 E2E 產生；V42-2a 起「群組範圍」就是子集，所以這些分支會變成每天走到的路。
>
> 事實基礎（讀程式得到，三條都是本清單的前提）：
> 1. `src/domain/analysis.ts:10-12` 的 `selectChannels` 驗證每個代碼都在 `manifest.channels`、不重複，然後 **`[...channels].sort()`**；`analyzeDataset`（`:33、:47`）把排序後的清單放進 `report.scope.channels`。所以不管群組成員用什麼順序傳進 `applyFilters`，快照的 `scope.channels` 永遠是同一個排序後的清單。
> 2. `src/application/workspace.ts:82`：`filter_hash: await digest(report.scope)`，只由 `report.scope` 算（CLAUDE.md 邊界檔規定 v4.2 維持）。由 1，同一組成員的 `filter_hash` 一定相同。
> 3. 沒有 `Scope.kind "group"`（PRD §4.3）：群組範圍的快照、facts、diagnostics、待辦的範圍都是 `kind "all"` 加成員清單。

## 1 處置摘要

| 處置 | 條數 | 條目 |
|---|---|---|
| **V42-2a 修** | 20 | 1、5a、5b、5c、7、8、9、10、11a、11b、12d、13b、14、15、17、18、19、20a、20b、22 |
| **V42-1 修** | 1 | 12c |
| **不受影響＋理由** | 10 | 2、3、4、6、11c、12a、12b、13a、16、21 |
| 合計 | 31 | PRD §4.4 點名的 16 處（第 2 節 1 到 16）＋ grep 找到的同類寫法 6 處（第 3 節 17 到 22） |

「V42-2a 修」的共同做法（PRD §4.1、§4.2）：V42-1 先把 `copy.ts` 的 `channelLabel`、`channelsLabel`、`scopeLabel`、`categoryLabel` 改成收解析器（顯示名稱），V42-2a 再讓解析器認得群組：範圍的通路集合**恰好等於**某個群組的成員集合時寫群組名，單一通路屬於群組時寫「{群組名} · {通路名}」，三者都不符合的子集（還原一份用不同設定做的備份）維持列出成員。人讀匯出在 V42-5 再逐條管道核對（06 V42-5 第 1 項）。

## 2 PRD §4.4 點名的分支

| # | 位置（HEAD 行號） | 現在對 2 到 n−1 子集的行為（讀程式） | 處置 | 應涵蓋的測試 |
|---|---|---|---|---|
| 1 | `src/application/excel-export.ts:473`（`everyChannel`）、`:478`（`channels`） | `everyChannel` 只在 `manifest.channels` 每一個都在 `scope.channels` 裡時為 true；子集時為 false，G13、G14 工作表的範圍副標 `channels` 變成 `channelsLabel(scope.channels, alias)`＝成員代碼（示範資料是別名）以「、」相連，例如「DTC、MARKETPLACE」。數字本身來自子集快照，正確。 | **V42-2a 修**：範圍文字改用解析器（等於群組成員集合時寫群組名；否則維持成員清單）。 | `tests/excel-export.test.ts`（V42-2a 加群組範圍與單一通路範圍的範圍文字；既有輸出位元組不變） |
| 2 | `src/application/decision.ts:93-99` | `channels.length === 1` 才取該通路的 `report.current.channels[c]`，否則取 `report.current`（子集的合計）；`channels.length !== 1` 時 `baseline.eligible = false` 並把 `SINGLE_CHANNEL_REQUIRED` 放到原因第一個。子集（含群組）得到「不可試算：需要單一通路」，基準數字是子集合計但不會被拿去算。 | **不受影響**：這就是預期（PRD §4.3、D-V42-12「試算一次只算一個通路。」）；試算頁在群組範圍下改由第 15 條只列成員。 | `tests/decision.test.ts`（既有 `SINGLE_CHANNEL_REQUIRED` 案例）；V42-2a 加「群組範圍的 session 仍是 `SINGLE_CHANNEL_REQUIRED`、scope.channels＝成員」 |
| 3 | `src/components/channel-table.tsx:92-93`（`channelDiagnosis`） | 對每個通路列找第一個健檢群組：`scope.channels.includes(channel) && (scope.kind !== "all" \|\| scope.channels.length === 1)`。子集快照的 `kind "all"` 範圍有 ≥ 2 個通路，不會被當成任何通路列的健檢；通路列只配到 `kind "channel"`／`"sku"` 的範圍，與全部通路時相同。 | **不受影響**：通路列的健檢對子集與全部通路一致。群組合計列是 V42-2b 新增的列，沒有對應的健檢結果，由 V42-2b 留空並給 sr-only「群組沒有健檢結果」（PRD §3.5）。 | `tests/diagnosis-v3.test.tsx`、`tests/charts-diagnosis-v4.test.tsx`（通路寬表）；V42-2b 加群組合計列健檢欄為空＋sr-only |
| 4 | `src/application/action-workspace.ts:196-198`（`assertBinding`） | `:196` 只接受 `all`／`channel`／`sku`；`:197` 要求綁定範圍的通路非空、不重複、每個都在 session 的 `scope.channels` 裡；`:198` 只對 `kind "channel"` 要求恰好 1 個通路。`kind "all"` 帶多個通路（子集）合法，所以群組範圍下從三件事或健檢「加入待辦」建立的綁定會通過。 | **不受影響**：PRD §4.3 已確認；機器可讀欄位維持成員代碼，畫面上的範圍文字走解析器（第 12d 條）。 | `tests/action-workspace.test.ts`；V42-2a 加「`kind "all"`＋成員子集的綁定通過；成員之外的通路 `ACTION_SCOPE_MISMATCH`」 |
| 5a | `src/components/dashboard.tsx:605`（`channel.value`） | `scope.channels.length > 1 ? "" : scope.channels[0]`：子集也是 `""`，`<select>` 顯示第一個選項「全部通路」，與實際範圍不符（PRD §4.4「子集顯示『全部通路』」）。 | **V42-2a 修**：等於某群組成員集合時選中該群組；等於全部時「全部通路」；只有一個時那個通路；都不符時顯示只讀選項「{n} 個通路」（PRD §4.1）。 | `tests/period-bar.test.tsx`（選取值四種情況）、`tests/e2e/channel-groups.spec.ts`（還原備份後選單與期間摘要） |
| 5b | `src/components/dashboard.tsx:605`（`onChange`） | `value === "" ? manifest.channels : [value]`：只會送出全部或單一通路；沒有任何路徑能從選單選出子集。 | **V42-2a 修**：群組選項的值用含控制字元前綴的 token，元件換成成員清單後 `applyFilters({ ...scope, channels: 成員 })`（A 級，走與單一通路一樣的路 `:356-374`）。 | 同 5a；`tests/channel-groups.test.ts`（群組＝成員、分割＝全部） |
| 5c | `src/components/dashboard.tsx:608`（`channelsText`） | `channelsLabel(scope.channels, alias)`：期間摘要列出成員，例如「目前範圍：…DTC、MARKETPLACE…」；全部通路時也是列全部成員（期間摘要本來就這樣寫）。 | **V42-2a 修**：群組名；成員列在 `title` 與 sr-only 的詳情；單一通路屬於群組時「{群組名} · {通路名}」。 | `tests/period-bar.test.tsx`、`tests/e2e/channel-groups.spec.ts` |
| 6 | `filter_hash` 的全部使用處（`grep -rl filter_hash src`：25 個檔，與 PRD 起草時相同） | 來源只有一處：`src/application/workspace.ts:82` `digest(report.scope)`（型別 `:42`；`:19、:30` 註明 assistWeeks 與 presets 不進 hash）。其餘 24 檔分三類，逐檔如下。**相等比對**（子集只要成員相同就相同，見前提 1、2）：`src/components/dashboard.tsx:367-368`（revision 與 markChanged）、`:560`（找 current context）；`src/components/meeting-entry.tsx:31-34、:52`；`src/components/meeting-page.tsx:83-84、:88、:96、:180`；`src/application/meeting.ts:267、:290`；`src/application/review-session.ts:19、:35、:114、:122`；`src/application/manager-summary.ts:42、:51、:60、:168、:181`；`src/application/action-workspace.ts:32`（context id）、`:210、:230`；`src/application/scenario-workspace.ts:27`（context id）；`src/application/decision.ts:16、:77、:102`；`src/application/excel-export.ts:525`、`src/application/pptx-export.ts:112`（SOURCE_MISMATCH）；`src/application/workspace-backup.ts:87、:122、:251、:283、:451、:470、:522、:532、:553`（BINDING_MISMATCH 與會議對帳）；`src/application/ai-snapshot.ts:48`（snapshot_id）。**顯示或寫出技術細節**（原樣寫出雜湊字串）：`src/components/ai-panel.tsx:19`（identity）、`src/components/diagnosis-list.tsx:246`、`src/components/decision-workbench.tsx:274`、`src/components/workspace-panels.tsx:141`、`src/components/print-summary.tsx:126`、`src/components/action-editor.tsx:93`、`src/application/product-comparison-export.ts:18、:23`、`src/application/export.ts:43、:53`、`src/application/decision-export.ts:205、:238、:251`、`src/application/manager-summary.ts:264、:284、:288`、`src/application/meeting.ts:44、:134、:495`、`src/application/excel-export.ts:297`。**只有註解或標籤**：`src/application/export-variants.ts:119`、`src/i18n/labels.zh-TW.ts:2619`（「範圍版本」）。 | **不受影響**：所有使用處只做相等比對或原樣顯示，沒有任何一處解讀雜湊內容或假設通路數；群組範圍的快照 `scope.channels` 是排序後的成員清單，所以同一群組永遠得到同一個 `filter_hash`，分割成兩個群組的兩份快照 hash 不同（正確）。V42-1 的 `channel_names` 不進 `report.scope`，不改 hash。 | `tests/workspace.test.ts`（`filter_hash` 由 `report.scope` 算）；V42-2a 加「成員任意順序傳入 → 同一 `filter_hash`；成員不同 → 不同」；`tests/backup-restore-matrix.test.ts`（還原後 BINDING_MISMATCH 不觸發） |
| 7 | `src/application/weekly-summary.ts:115-116` | `everyChannel` 要 `input.allChannels` 每一個都在 `scope.channels`；子集時 `channelsText = channelsLabel(scopeChannels, alias)`＝成員清單，進「複製週會摘要」的純文字與 Markdown。 | **V42-2a 修**：群組名（同第 1 條）。 | `tests/weekly-summary.test.ts`（既有 `allChannels` 案例；加群組範圍） |
| 8 | `src/application/waterfall.ts:267-268` | `scope === "all"` 時：`everyChannel` 為 true 寫「全部通路」，子集寫 `labels.overview.sections.total`「合計」（**不是**成員清單，與 PRD §4.4 的描述不同，以程式為準）；單一通路寫 `channelLabel`。子集在 G2 利潤結構瀑布的範圍標籤只看得到「合計」。 | **V42-2a 修**：等於群組成員集合時寫群組名；其他子集維持「合計」。 | `tests/waterfall.test.ts`（既有 `allChannels` 案例；加群組範圍）、`tests/overview-charts-waterfall.test.tsx` |
| 9 | `src/application/pptx-export.ts:134` | `channels: channelsLabel(summary.scope.channels, alias)`，**沒有** `everyChannel` 判斷：全部通路與子集都列出成員清單進 PPT 副標。 | **V42-2a 修**：解析器（群組名）；V42-5 核對 PPT 管道。 | `tests/pptx-export.test.ts`（加群組範圍；全部通路輸出不變） |
| 10 | `src/application/decision-export.ts:204` | 決策工作稿 Markdown 的 `scope` 欄＝`channelsLabel(session.scope.channels, alias)`＝成員清單；CSV（`:238、:251`）與 JSON 寫代碼。 | **V42-2a 修**：Markdown 的 `scope` 改用解析器；CSV、JSON 維持代碼。 | `tests/v2-decision-export.test.ts`、`tests/action-export.test.ts`（加群組範圍；CSV／JSON 位元組不變） |
| 11a | `src/application/meeting.ts:383-385`（`compareWithLastMeeting`） | `:383` 用 `sameSet` 比對目前範圍與上次會議的 `source_fixed.channels`（集合比對，順序無關）；不同時 `:385` 的提醒句用 `channelsLabel` 列出上次與這次的成員清單。 | **V42-2a 修**：提醒句改用解析器（群組名）；`sameSet` 不改。 | `tests/meeting.test.ts`（既有 `differentChannels` 案例；加群組範圍） |
| 11b | `src/application/meeting.ts:443`（會議紀錄 Markdown） | `channels` 欄＝`channelsLabel(fixed.channels, alias)`＝成員清單。 | **V42-2a 修**：解析器；V42-5 核對 Markdown 管道。 | `tests/meeting.test.ts`（Markdown 輸出） |
| 11c | `src/application/meeting.ts:291`（`source_fixed.channels`） | `channels: scope.channels`：會議固定範圍存成員代碼（排序後）；備份還原時 `workspace-backup.ts:443` 原樣接回。 | **不受影響**：機器可讀欄位維持代碼（PRD §3.1、§8）。 | `tests/meeting-backup.test.ts`、`tests/backup-restore-matrix.test.ts` |
| 12a | AI 快照負載：`src/application/ai-snapshot.ts:32-33、:52` | `channels = [...scope.channels].sort()` 後對應到 `C01`、`C02`… 的本機代號；負載的 `filters.channels` 只有代號，facts 只取 `scope.kind "all"` 且通路集合等於整個範圍的 fact（`:39`）。子集的負載＝成員的代號清單，沒有代碼也沒有名稱。 | **不受影響**：負載連代碼都不含；V42-1 另加「負載不含名稱」的單元測試（06 V42-1 第 6 項）。 | `tests/ai-grounding.test.ts`、`tests/ai-client.test.ts`；V42-1 加負載不含 `channel_names` |
| 12b | 會議快照負載：`src/application/review-session.ts:35`（`meeting_filters`）、`:64、:69、:105`（`.includes(ref.channel)`） | `meeting_filters = structuredClone(scope)`（代碼）；選入會議的方案通路必須在 `meeting_filters.channels` 裡：子集時只接受成員，否則 `REVIEW_SCENARIO_SCOPE_MISMATCH`／`INVALID_REVIEW_SCENARIO_REFERENCE`。 | **不受影響**：以成員資格判斷，對子集正確。 | `tests/v2-review.test.ts`（加群組範圍：成員可選入、非成員拒絕） |
| 12c | `src/application/review-session.ts:126`（方案列 `scopeLabel`） | 單一通路：`channelLabel(ref.channel, demoAlias(...))`，只看示範別名，不看任何設定。 | **V42-1 修**：改收解析器（顯示名稱）；V42-2a 再加「{群組名} · {通路名}」。 | `tests/v2-review.test.ts`、`tests/meeting-page-v3.test.tsx` |
| 12d | `src/application/review-session.ts:133`（待辦列 `scopeLabel`） | `channelsLabel(original.scope.channels, …)`＝成員清單。 | **V42-2a 修**：解析器（群組名）。 | 同 12c |
| 13a | 備份還原的範圍：`src/application/workspace-backup.ts:443-446`（會議 `fixed.channels` → `filters` → `createSnapshot`） | 會議的固定範圍原樣接回 `filters.channels`，`createSnapshot` 後 `:451` 用 `filter_hash` 等欄位對帳；子集的會議還原後快照 `scope.channels`＝排序後的成員，對帳通過（前提 1、2）。 | **不受影響**（還原本身）；V42-1 改的是順序：先讀出 `payload.channel_settings` 驗證後再建快照（D-V42-14），對帳不變。 | `tests/backup-restore-matrix.test.ts`、`tests/meeting-backup.test.ts` |
| 13b | 備份還原後的範圍顯示：`src/application/workspace-backup.ts:503-514`（`scoped(active.source_hash, active.filters)`）→ `src/components/dashboard.tsx:605、:608` | `active.filters.channels` 是子集時快照正確，但畫面上期間列選單顯示「全部通路」（5a）、期間摘要列成員（5c）；還原一份用不同通路設定做的備份時，V42-2a 之後選單可能沒有對應群組（critic:105）。 | **V42-2a 修**：由 5a、5c 的選取值邏輯與範圍文字處理（等於群組→群組；不符→「{n} 個通路」並在期間摘要列出成員）。 | `tests/e2e/channel-groups.spec.ts`（還原備份後的選單與摘要）、`tests/workspace-backup.test.ts` |
| 14 | 抽屜副標：`src/components/evidence-drawer.tsx:115-128`（`evidenceSubtitle`；呼叫處 `:214`） | `all`＝排序後的 `allChannels` 與 `evidence.channels` 逐字相同；子集時 `listed = channelsLabel(evidence.channels)`＝成員清單；有 `scopeLabel` 且其中含成員清單時副標只寫 `scopeLabel`，否則另附「通路：成員清單」。`copy.ts:26-30` 的 `scopeLabel` 對 `kind "all"` 寫「合計（成員清單）」，所以子集的副標是「合計（DTC、MARKETPLACE） · 本期 …」。 | **V42-2a 修**：`scopeLabel`（第 20a 條）與 `evidenceSubtitle` 認得群組：「{群組名}」／「{群組名} · {通路名}」（PRD §4.2 第 2 點）；不改 `EvidenceFilter`（PRD §4.3）。 | `tests/evidence-drawer-v3.test.tsx`（`evidenceSubtitle`：全部、群組、群組成員、無對應群組的子集） |
| 15 | 試算頁通路選單：`src/components/multi-scenario-workbench.tsx:41-48`、`:56` | `channels = manifest.channels`（**全部**通路，不看範圍）；`fallback`：範圍只有一個通路時用它，否則 `channels[0]`＝資料集第一個通路，**可能不在子集裡**；非單一通路範圍時 `:56` 自建單一通路快照。子集下使用者看得到並能選到範圍外的通路。 | **V42-2a 修**：群組範圍下只列成員、預設第一個成員（PRD §4.2 第 1 點；D-V42-12「試算一次只算一個通路。」）；無對應群組的子集同樣只列範圍內的通路。 | `tests/scenario-page-v3.test.tsx`（選單選項＝成員；預設第一個成員）、`tests/e2e/channel-groups.spec.ts` |
| 16 | 目標配對：`src/application/targets.ts:132-140`（`scopeChannelKeys`） | 全選 → `ALL`；只選一個 → 該通路；子集 → 空陣列，不配任何目標（不加總、不拆分）。總覽的目標達成行在子集下沒有目標可顯示。 | **不受影響**：D-V42-12 明說「目標只對全部通路或單一通路配對。」，`targets.ts` 是邊界檔不動；V42-2a 在範圍是群組時於目標區塊顯示這一句。 | `tests/targets.test.ts`（既有「部分多選不配對」案例）；V42-2a E2E 群組範圍下目標區塊顯示限制句 |

## 3 grep 找到的同類寫法（PRD §4.4 沒點名；同樣要修或確認）

| # | 位置（HEAD 行號） | 現在對 2 到 n−1 子集的行為 | 處置 | 應涵蓋的測試 |
|---|---|---|---|---|
| 17 | `src/components/shell/present-mode.ts:71-73`（`presentPeriodText`） | 投影的期間文字：有會議時用 `meeting_filters.channels`，否則目前範圍；`everyChannel` 為 false 時列成員清單。 | **V42-2a 修**：解析器（群組名）。 | `tests/present-mode.test.tsx` |
| 18 | `src/components/overview/weekly-snapshot.tsx:49-51`（`snapshotMeta`） | 總覽「本期一句話」下方的範圍行：子集列成員清單。 | **V42-2a 修**：群組名。 | `tests/overview-structure.test.tsx` |
| 19 | `src/components/product-comparison-panel.tsx:152-158`（`chartScope.channels`） | 商品毛利頁範圍副標與 G13、G14 的 ctx：子集列成員清單（與第 1 條 Excel 同一套字）。 | **V42-2a 修**：群組名。 | `tests/product-page-v3.test.tsx`、`tests/charts-products-v4.test.tsx` |
| 20a | `src/application/copy.ts:26-30`（`scopeLabel`） | `kind "all"` → 「合計（成員清單）」；`channel`／`sku` → 通路名或「通路／SKU」。所有健檢列、待辦、抽屜、匯出的範圍文字都經過它。 | **V42-2a 修**：認得群組（PRD §4.1 末段）；V42-1 先改成收解析器（顯示名稱），既有字串逐字不變。 | `tests/copy.test.ts`（加群組範圍的 `scopeLabel`） |
| 20b | `src/application/diagnosis-group.ts:87-88`（`diagnosisScopeLabel`） | `kind "all"` → 「合計」（不列成員），其餘走 `scopeLabel`。健檢清單的範圍 chips 在子集下只寫「合計」。 | **V42-2a 修**：群組範圍寫群組名（PRD §4.1 末段）。 | `tests/diagnosis-group.test.ts`（加群組範圍的 `diagnosisScopeLabel`） |
| 21 | `src/application/manager-summary.ts:174`（`channels` 陣列）、`:284-288`（通路寬表 CSV） | `channels` 依 `report.scope.channels` 每通路一列（代碼），直接寫進 CSV 的 `channel` 欄；子集時只有成員列。 | **不受影響**：CSV 維持代碼與成員列；V42-2b 另加選填 `groups` 欄位給畫面與人讀匯出，`channels` 與 CSV 位元組不變（PRD §3.5）。 | `tests/manager-summary.test.ts`（V42-2b 加「有群組時 CSV 位元組與無群組時相同」） |
| 22 | `src/components/shell/period-bar.tsx:118`（通路 `<select>`） | 單層：「全部通路」＋每個 `manifest.channels` 一個選項；`value` 由 5a 給。子集沒有對應選項時瀏覽器顯示 `value=""` 的「全部通路」。 | **V42-2a 修**：同一個 `<select>` 改兩層 `<optgroup>`（D-V42-10）；沒有群組時與現在完全一樣，行高不變。 | `tests/period-bar.test.tsx`、畫面基準 01 到 09 × 4（選單關閉時 0 差異） |

## 4 沒有列入的分支（讀過，與子集無關）

- `src/domain/*`、`fixtures/*`：禁區，只讀；`selectChannels` 的排序與驗證是前提 1。
- `src/application/evidence-filter.ts:15-38`：F10 的 `filter.channel` 只接受單一通路；群組範圍的快照本身只含成員，抽屜的原始明細就是成員的聯集，不改（PRD §4.3）。
- `src/application/rules.ts:131`：`NEGATIVE_CHANNEL_CM` 只對 `kind "channel"`；群組範圍不觸發，由 D-V42-12 的限制句明說，不是程式缺陷。
- `src/application/targets.ts` 其餘：邊界檔不動。
- `overview-many-channels`（9 通路）頁面狀態（06 V42-0 第 7 項末句）：是 `tests/helpers/page-states.tsx` 的工作，不在本清單；由整合代理處理並在 `V42-0-baseline.md` 記錄目視結果。
