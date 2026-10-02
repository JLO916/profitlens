# ProfitLens Revamp v2 — 套件說明

這個資料夾是「把 ProfitLens 從稽核員工具改成經理人工具並重新上線」的完整規劃。它是給 Claude Code 讀的工作底稿，也是你拍板用的產品文件。

## 檔案與用途
| 檔案 | 給誰 | 內容 |
|---|---|---|
| `../../CLAUDE.md` | Claude Code | 每個 session 的工作規則（補充 AGENTS.md） |
| `01_BRIEF.md` | 你＋Claude Code | 產品定位、目標使用者、設計原則、審查發現、成功指標 |
| `02_IA_LAYOUT.md` | Claude Code | 目標資訊架構、每頁版型、元件行為規格 |
| `03_GLOSSARY_COPY.md` | Claude Code | 名詞對照（含程式 key）、規則卡文案、免責集中規則、文案改寫 |
| `04_IMPORT_TW.md` | Claude Code | 匯入精靈、含稅換算、台灣來源轉接器、欄位對照記憶 |
| `05_FEATURES.md` | Claude Code | 輔助 KPI、期間預設／去年同期、目標與達成率、促銷檔期、情境範本、行動看板、會議紀錄、匯出 |
| `06_BATCHES.md` | Claude Code | R0–R7 分批任務、檔案、測試、驗收條件、允許依賴 |
| `07_PROMPTS.md` | 你 | 直接貼進 Claude Code 的提示詞（啟動＋每批＋回報） |
| `08_RELAUNCH.md` | 你＋Claude Code | README 改寫、示範資料、SEO/OG、Vercel、上線檢查、發布說明 |
| `09_DECISIONS_PENDING.md` | 你 | 需要你拍板的 12 個決策，每個都附建議答案 |
| `../../src/i18n/labels.zh-TW.ts` | Claude Code | 標籤字典種子檔（R0 放入、R2 接線） |

## 怎麼開始
1. 把整個套件複製進 repo：`CLAUDE.md` 放根目錄（與 `AGENTS.md` 並存）、`docs/revamp/` 整個放入、`src/i18n/labels.zh-TW.ts` 放入。
2. 先讀 `09_DECISIONS_PENDING.md`，把你的答案直接寫在該檔的「決定」欄；沒決定的項目 Claude Code 會採用建議值並在回報中標註。
3. 開 Claude Code，貼 `07_PROMPTS.md` 的「啟動提示」，之後依序貼 R0 → R7。
4. 每批結束看回報；通過才貼下一批。

## 批次順序與估時（單人＋Claude Code）
| 批次 | 主題 | 估時 | 風險 |
|---|---|---|---|
| R0 | 基線、分支、標籤字典骨架、CLAUDE.md | 0.5 天 | 低 |
| R1 | 總覽重排、頁首減負、期間快捷、符號語意、捲動歸零 | 1.5 天 | 低（純呈現） |
| R2 | 名詞與文案全面換成經理人語言、免責集中、口徑說明 | 2 天 | 中（測試字串多） |
| R3 | 匯入精靈、含稅換算、對照記憶、來源預設 | 3 天 | 中（匯入邏輯） |
| R4 | 輔助 KPI、去年同期、目標達成率、促銷檔期、備份 v4 | 3 天 | 中高（碰 domain 新增） |
| R5 | 健檢清單化、情境範本與絕對值輸入、行動表單與看板 | 3 天 | 中 |
| R6 | 會議紀錄物件、上次會議比較、匯出（PDF/XLSX/PPT）、預設保存 | 3 天 | 中（依賴決策） |
| R7 | README、示範資料台灣化、OG/SEO、上線檢查、v2.0.0 | 1.5 天 | 低 |

總計約 17–18 個工作天；R1＋R2 做完就可以先上線一個「看得懂」的版本（建議 tag `v2.0.0-beta.1`），其餘批次持續迭代。

## 完成定義（每批共用）
- `typecheck`／`lint`／`test`／`build`／`test:e2e` 全部真實通過，並附輸出摘要。
- 四尺寸截圖存於 `verification/revamp-R{n}/`。
- `docs/STATUS.md` 新增該批段落；`verification/revamp-R{n}-acceptance.md` 記錄命令、結果、未執行項目。
- 批次內的「驗收條件」逐條標示通過／未通過，未通過的要有原因與補救批次。
- 一個 commit（或一組 commit）以 `revamp(R{n}): …` 開頭；不混入其他批次的改動。

## 不在本輪範圍（已明確延後）
登入與帳號、雲端儲存與多人協作、訂單級資料自動彙總進 UI、SKU 層級廣告歸因、固定費與所得稅的淨利、即時 AI 公開開放、正式電商／廣告 API 串接。這些列在 `05_FEATURES.md` 的「Phase 2」。
