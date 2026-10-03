# Revamp v2 — R6 會議紀錄、匯出、預設保存 驗收紀錄

- 日期：2026-10-03（Asia/Taipei）
- 分支：`revamp/v2`，基於 R5 `c7ac846`（R6 依賴與錨點 `5affda1`）
- 規格：`docs/revamp/06_BATCHES.md` R6-1～R6-7、`05_FEATURES.md §10–§12`、`02_IA_LAYOUT.md §8`
- 決策：D4＝A（`xlsx@0.18.5`＋`pptxgenjs@4.0.1`，精確鎖定、動態 import）、D7＝A（首次詢問一次、同意後自動保存）；細節見 `docs/DECISIONS.md`（2026-10-03 R6）。
- 財務核心：`git diff --stat c7ac846 -- src/domain fixtures docs/METRICS.md` 為空；`metric_version` 不變。
- 執行方式：四個獨立 worktree 代理平行實作（會議物件／Excel／PPT／自動保存）→ 合併 → 會議分頁與殼層整合代理 → E2E 改寫代理 → 四視角對抗式審查（每項 3 位反駁者）→ 修正 → 全套驗收。

## 1. 任務對照
| 任務 | 狀態 | 做法與證據 |
|---|---|---|
| R6-1 `meeting.ts`：Meeting 物件、finalize、`meeting_history`；備份 v4 欄位加法 | 完成 | `Meeting`（`meeting-v1`）含固定範圍、議程快照（KPI、三件事、通路表、選入方案、置頂行動與狀態）、決議、門檻、時間；`finalizeMeeting` 回傳深層凍結物件（寫入擲 TypeError）；`validateMeeting` 以 zod＋差額一致性重驗；`appendMeeting`（id 唯一、上限 100、依結束時間排序）；`compareWithLastMeeting` 三種規則（同範圍比 KPI／期間不同仍比並標示／資料不同只列決議與行動狀態）；`exportMeetingMarkdown`；備份 v4 `meeting_history` 由保留欄位改為 `z.array(meetingSchema)`，還原逐筆重驗；[tests/meeting.test.ts](../tests/meeting.test.ts)、[tests/meeting-backup.test.ts](../tests/meeting-backup.test.ts) |
| R6-2 新分頁「會議紀錄」；總覽只留一行入口 | 完成 | [meeting-page.tsx](../src/components/meeting-page.tsx)：會議基本（名稱、日期 `meeting_date`、固定範圍、用目前資料更新）、議程 ①–⑥（①–③ 重用 `ManagerSummary` 議程模式、④ 上次決議追蹤表、⑤ 每通路選入方案、⑥ 置頂行動）、決議與備註、「結束會議」頁內確認區（非 modal dialog、Esc 取消、焦點管理）、上次會議比較（依 kind 切換）、會議歷史（只讀、逐筆下載 Markdown）、輸出列五鈕；總覽 `overview-meeting-entry` 一行；`ReviewWorkbench` 內容搬入；[tests/meeting-page.test.tsx](../tests/meeting-page.test.tsx) |
| R6-3 列印樣式強化＋「匯出 PDF」 | 完成 | `manager-summary.module.css` A4 直式一頁摘要（9pt、表格緊湊）＋附錄 `break-before: page`、列印頁首；`PrintSummaryPortal` 供會議頁、ManagerSummary、下載選單共用；按鈕旁提示「列印對話框中選擇另存為 PDF」；E2E 以 headless Chromium 產出 A4 PDF 存證 |
| R6-4 Excel 匯出（D4＝A） | 完成 | [excel-export.ts](../src/application/excel-export.ts)：純資料層 `buildExcelWorkbook`（摘要／通路／貢獻變化拆解／商品比較／行動／口徑）＋ `writeExcel`（動態 `import("xlsx")`、文字格 `t:"s"`、不產生公式格、CSV 同一套防注入規則、工作表名規則）；`downloadBinary`；[tests/excel-export.test.ts](../tests/excel-export.test.ts) 以 `XLSX.read` 解析產物驗工作表名、儲存格型別、逃逸與數值 |
| R6-5 PPT 一頁式（D4＝A） | 完成 | [pptx-export.ts](../src/application/pptx-export.ts)：`buildPptxOnePager`（標題、兩個關鍵差額、三件事、通路表、決議與置頂行動、頁尾）＋ `writePptx`（動態 `import("pptxgenjs")`、16:9、無圖片）；[tests/pptx-export.test.ts](../tests/pptx-export.test.ts) 用測試用最小 zip 讀取器解壓 `slide1.xml` 驗文字與 XML 轉義、單張、16:9 |
| R6-6 預設保存（D7＝A） | 完成 | [auto-save.ts](../src/application/auto-save.ts)（`createAutoSaver` debounce 2 秒、保存中排隊、失敗不重試、`formatSavedTime` 臺北時間）；`workspace-storage.tsx` 首次非 modal 提示 `local-save-prompt`（存在這台電腦／先不要、共享電腦提醒）、同意後自動保存、頂欄「已保存 hh:mm」、`autosave-status`／`autosave-error`；`local-store.ts` 同交易寫 `explicitly-saved-at`；[tests/auto-save.test.ts](../tests/auto-save.test.ts)、[tests/workspace-storage-autosave.test.tsx](../tests/workspace-storage-autosave.test.tsx) |
| R6-7 「下載 ▾」整合所有格式 | 完成 | 下載選單新節「會議摘要」：匯出 PDF、匯出 Excel、匯出 PPT 一頁式、下載會議紀錄 Markdown（有已結束會議取最近一筆，否則主管摘要）；開啟選單預載 xlsx |

## 2. 新增／主要修改檔案
- 新增：`src/application/{meeting,excel-export,pptx-export,auto-save}.ts`、`src/components/meeting-page.tsx`、`tests/{meeting,meeting-backup,excel-export,pptx-export,auto-save}.test.ts`、`tests/{workspace-storage-autosave,meeting-page}.test.tsx`、`tests/helpers/zip.ts`、`tests/e2e/revamp-r6.spec.ts`、`verification/revamp-R6-capture*`、`verification/revamp-R6/`
- 修改：`package.json`／`package-lock.json`（`xlsx` 0.18.5、`pptxgenjs` 4.0.1 精確鎖定）、`next.config.ts`（client bundle 以空模組取代 pptxgenjs 的 `node:fs`／`node:https`）、`src/application/{workspace-backup,review-session,local-store,download}.ts`、`src/components/{dashboard,manager-summary,workspace-storage}.tsx`、`manager-summary.module.css`、`src/i18n/labels.zh-TW.ts`（`meetingRecord`／`meetingPage`／`excelExport`／`pptxExport`／`autoSave` 五個區塊）、`globals.css`（R6 錨點）、`docs/{DECISIONS,STATUS,ARCHITECTURE,SCENARIOS}.md`、`README.md`、`docs/revamp/09_DECISIONS_PENDING.md`（D4／D7）、`tests/e2e/*`（流程改寫，見 §3）
- 刪除：`src/components/review-workbench.tsx`（內容搬入會議分頁）

## 3. 驗收命令與真實結果
（待填）

## 4. 瀏覽器驗收與截圖
（待填）

## 4b. 對抗式審查（4 視角 → 每項 3 位反駁者，≥ 2 位不反駁才算確認）
40 項候選、34 項確認（含跨視角重複：同意文案 × 3、上次比較未凍結 × 3、選單匯出混用範圍 × 4、入口不顯示已結束 × 3、議程順序 × 2、歷史上限 × 2、覆寫提醒 × 2）、6 項被反駁。確認項處理（已修＝本批修正階段完成並重跑單元／E2E）：
| 確認項 | 處理 |
|---|---|
| 本機保存同意勾選框文案仍寫「工作區不會自動儲存」（高／中，三個視角） | 已修：`ui.workspaceStorage.consent`／`noLocalNotice`／`downloadConfirmedNotice`／`backupContents` 改為 D7＝A 的說法；刪除沒人用的舊 `savedLocalNotice`；提示框說明補「也會記住欄位對照」 |
| 「不同意則維持現狀（每次手動）」沒有做到：在本機手動保存的唯一入口必定同時開啟自動保存（中） | 已修：「本機保存同意」與「自動保存」拆成兩個狀態（選單內「自動保存」開關，預設開；關閉即回到每次手動） |
| 會議紀錄沒有凍結「④ 上次決議追蹤」與上次比較，還原後 Markdown 誤寫「還沒有已結束的會議」（中，三個視角） | 已修：`Meeting.follow_up`（finalize 時由 compareWithLastMeeting 凍結：上次會議、kind、note、KPI、三件事、決議、行動狀態）；Markdown 只讀紀錄本身；備份 schema 加法並重驗 |
| 「下載 ▾」的 Excel／PPT／PDF 用目前檢視的數字卻冠上會議稿名稱、日期、決議（中／低，四個視角） | 已修：選單的三種格式改為純「目前檢視」（不帶會議名稱／日期／決議／方案），說明文字涵蓋 PDF；會議範圍的版本只在會議分頁輸出列 |
| 總覽一行入口永遠不會顯示「已結束」（低，三個視角） | 已修：最近一筆已結束會議與目前會議稿同資料同範圍且新稿未修改時顯示「已結束（日期）· 新會議稿：草稿」；ReviewSession 加 `created_at` |
| 議程 ⑤⑥ 的內容實際出現在 ④ 之前、⑥ 只有一句說明（低，兩個視角） | 已修：議程模式下 ManagerSummary 不再渲染「方案與待辦」；⑤ 顯示選入方案結果、⑥ 顯示置頂行動清單 |
| 共享電腦提醒是「複製」到同意對話框，而不是「移到」對話框（低） | 已修：選單內那一行移除，只留在首次提示 |
| 還原時沒有拿可取得的來源資料核對 meeting_history 的金額；偽造的 KPI 會被標成「同一份資料、同樣兩期與通路」直接比較，而且這些金額沒有「公式與來源」路徑（中） | 已修：還原時對來源仍在備份裡的會議重算 KPI／通路表／三件事並比對，不一致即 INVALID_WORKSPACE_FORMAT |
| 自動保存會無提醒覆寫 R6 以前的本機副本；選單勾選同意也沒有提醒（中，兩個視角） | 已修：`hasLocalWorkspace()`（不建資料庫）；只要有副本就顯示覆寫提醒（時間不明也提醒）；選單勾選同意且已有副本時先確認再開始自動保存 |
| 會議紀錄與會議 Markdown 沒有記錄含稅換算等前處理（沒有口徑段落），違反「前處理必須寫入匯出」（中） | 已修：`source_fixed.preprocessing`／`basis` 凍結進紀錄；Markdown 加「口徑」段 |
| 本機保存同意只存在記憶體（重新整理或清空後再問），與 05 §12「彈一次」及 CLAUDE.md「一次同意、之後自動」不一致（待確認）（低） | 不改：同意只在本次載入有效（重新整理再問一次）；記於 DECISIONS 與 §5 |
| Excel 文字清理沒有移除 U+FFFE／U+FFFF（XML 1.0 不允許的字元）；而且 _xHHHH_ 跳脫在截斷之後才做，字串可能超過 32,767 字，導致 SheetJS 擲錯（低） | 已修：移除 U+FFFE／U+FFFF 與控制字元；先做 `_x` 跳脫再截斷且不切斷序列 |
| 會議歷史滿 100 筆後永遠無法結束會議，錯誤訊息指錯方向（低，兩個視角） | 已修：`removeMeeting` ＋ 歷史逐筆「移除（請先下載）」；`MEETING_HISTORY_FULL` 對應專屬文案 |
| PDF「一頁摘要」放不下：每個選入方案的完整假設都印在第一頁，決議那一行被擠到第二頁（中） | 已修：第一頁每個方案只印一行、完整假設移到附錄；決議與備註移到關鍵差額之後 |
| 結束會議失敗或匯出時，被點的按鈕自己變成 disabled，焦點掉到 body，Esc 也關不掉確認區（已在 Chromium 實測）（中） | 已修：處理中改 aria-disabled＋guard；失敗／完成後焦點回到確認區或觸發按鈕 |
| 匯出失敗訊息叫使用者「請重新整理後再試」，照做可能清掉還沒保存的工作區（中） | 已修：改為不致遺失資料的指引（先下載備份再重整；其他格式仍可用） |
| 手機版首次保存提示是底部滿版，蓋住 25–33% 的視窗且沒有補 padding，會擋住頁面底部的按鈕（低） | 已修：提示開著時主內容預留底部空間；aria-describedby 併入覆寫提醒；加 live region |
| 會議紀錄 Markdown 的「結束時間」直接輸出 UTC ISO 字串，和全站使用的臺北時間不一致（低） | 已修：主文用臺北時間，ISO 只留技術資訊 |
| 首次保存提示的 a11y 與「只問一次」：標題排在 h1 之前、出現時不通知、說明沒涵蓋覆寫警告，每次新工作階段都會再問（待確認是否為預期設計）（低） | 部分修：aria-describedby／live region 已補；「只問一次」維持每次載入詢問，記於 DECISIONS |
| 結束會議時，已被新版本取代的方案仍被凍結成「本次選入方案」，與會中畫面不一致（中） | 已修：只凍結 status 為 current 的方案，`selected_scenarios` 同步過濾 |
| 上次會議比較：兩次的「本期」相同、只有上期或比較方式不同時，文案顯示兩段一樣的日期（低） | 已修：本期相同時改用上期（或比較方式）組文案 |
| pptxgenjs 需要的 next.config.ts webpack 別名尚未提交；HEAD 本身可能無法 build（server bundle 不受影響）（低） | 已修：隨 R6 收尾 commit 提交；build 結果與 first-load JS 差異記於 §3 |
| 【反駁 6 項】同意不跨頁保存（設計取捨，已記錄）；E2E／驗收文件／建置設定未提交（審查時點問題，收尾 commit 一併提交）；會議稿 Markdown 沒有日期與 ④（已由 follow_up 與 meeting_date 補上）；labels 寫死其他標籤字面（既有做法）；還原關閉自動保存（設計取捨） | 不改／已隨其他項處理 |
| 【E2E 代理發現】會議分頁對 golden 固定的會議套用示範資料的通路別名（T3） | 已修：alias 依會議固定來源的 dataset_id 判斷，不看目前檢視 |
| 【E2E 代理發現】tablet／手機首次提示蓋住頁尾按鈕（T2b） | 已修：同上「預留底部空間」 |
| 【E2E 代理觀察】列印頁三件事清單沒有 1／2／3 編號（T3） | 已修：列印樣式 `list-style: decimal` |

## 5. 已知限制與風險
- `npm audit` 對 `xlsx`（prototype pollution／ReDoS，讀取路徑）與 `pptxgenjs → image-size`（圖片解析 DoS）共 3 個 high：產品碼只用寫出 API、不解析使用者檔案、不嵌圖片；沒有可升級版本，已記錄於 DECISIONS；若要消除告警可改 `exceljs`（D4 選項 B）。
- 會議紀錄不存「上次比較」結果：比較在顯示／下載時由歷史紀錄重算（同一工作階段內用結束當下算好的版本）。
- 本機保存同意只在本次載入有效（重新整理後會再問一次）；同意後每次自動保存都會完整驗證備份，大型資料時可能短暫卡頓。
- 改會議日期與改名稱一樣會讓決議退回草稿、版本 +1。
- Excel 文字欄沿用 CSV 防注入規則（以 = + - @ 開頭的文字前置 `'`，Excel 會原樣顯示撇號）；PPT 一頁式超過 4 個通路只列前 4 列並註明。
- 下載選單的 PDF／Excel／PPT 依目前檢視產生（門檻 0.00，帶入會議稿名稱／日期／決議）；會議頁輸出列依會議固定範圍產生，兩者範圍不同時內容會不同（選單內有說明）。
- 真實資料、Live AI、Safari／Firefox、實體裝置、PowerPoint for Windows：**未執行**。

## 6. 下一批建議與待拍板
見批次回報。
