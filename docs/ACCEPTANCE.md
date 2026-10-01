# Acceptance tests

除特別註明外，以下均為「待實作／待驗收」，不是已通過結果。準備包只預先驗證 fixtures。

## Core (M1)
| ID | 檢查 | 預期 |
|---|---|---|
| C01 | golden 前期總計 | N 2250.00 / GP 1200.00 / before 870.00 / after 570.00 |
| C02 | golden 本期總計 | N 2470.00 / GP 1145.00 / before 705.00 / after 255.00 |
| C03 | 本期通路加總 | DTC 270.00 + MARKETPLACE -15.00 = 255.00 |
| C04 | bridge | 九項精確加總 -315.00，無殘差 |
| C05 | 多 SKU join | 日通路費用與廣告只扣一次 |
| C06 | 缺 cogs | 淨營收可算；受影響毛利／貢獻 null，不能補 0 |
| C07 | 重複 sale key | blocking；不靜默 dedup |
| C08 | 缺 ad 日期／通路 | partial，不當作零投放 |
| C09 | mixed currency | blocking，不作匯率猜測 |
| C10 | ad_spend = 0 | MER N/A；貢獻仍可算 |
| C11 | 跨期退款 | 當日退款可以超過當日收入；不得判錯或沖兩次 |
| C12 | 負 cogs 回沖 | 只按已入帳淨額；退款不另推成本 |
| C13 | null／空字串／NaN | 保留未知，不生成可用財務結果 |
| C14 | N<=0 | 比率 N/A，金額不隱藏 |
| C15 | 金額精確性 | 0.10 + 0.20 = 0.30；不同排序不改合計 |
| C16 | 日期／coverage | 期間等長、不重疊、完整；未知 coverage 不當無活動 |
| C17 | rate aggregate | sum(numerator)/sum(denominator)，不平均列比率 |
| C18 | category／SKU filter | 不生成該商品的假行銷後貢獻 |

## Import and UI (M2–M3)
| ID | 檢查 | 預期 |
|---|---|---|
| U01 | fresh local run | README 命令能啟動；無 API key 可操作示範 |
| U02 | 真正換檔 | 匯入不同資料，表格／圖／摘要跟著變，非 hardcode |
| U03 | validation | 問題清單有檔名、欄位、CSV 行號 |
| U04 | shared filters | 總覽／明細／匯出一致 |
| U05 | data evidence | 任一 headline 可點開公式及來源 |
| U06 | responsive | 1440px、768px、390px 可閱讀，表格可水平捲動 |
| U07 | states | empty/loading/error/partial/ready 明確 |
| U08 | keyboard/accessibility | 欄位有 label、焦點可見、圖表有表格替代 |
| U09 | unsafe text | CSV 文字不執行；匯出公式注入防護 |
| U10 | malformed/large CSV | 友善拒絕，不當機、不截斷、不破壞舊資料 |
| U11 | no persistence surprise | 重新整理清空匯入並事先提醒，兩視窗不共用資料 |

## Scenario (M4)
S01：零變動等於 baseline。
S02：golden 本期 DTC，v=0/δ=0/f=-10%/a=0/K=0，284.00；K=20 則 264.00。
S03：v 未輸入不計算；減廣告不得自動假設銷售不變。
S04：不適用 baseline／缺資料時停用，不回傳 NaN。
S05：折扣「百分點」正確、所有費用依 SCENARIOS 重新計算。
S06：相同 baseline 分別算各方案，不疊加前一方案。
S07：換資料／期間時舊情境失效；輸出含全部假設。

## AI (M5)
A01：有效的 structured result 可呈現，所有 fact / metric references 能解析。
A02：虛構 ID、錯 scope、任意數字、無支持觀察不呈現。
A03：資料內惡意指令不改變任務、不讀 secrets。
A04：無 key、timeout、拒絕、schema error、429 都能保留核心功能與規則摘要。
A05：沒有呼叫 API 不貼即時 AI 標籤；mock 與 live 分開記錄。
A06：換 filters 時舊回應不可覆蓋新結果。
A07：上傳僅限預覽同意的彙總 facts；server logs 不含原始資料或 key。
A08：編譯後前端資源沒有 API key；未授權公開 live endpoint 關閉。

## Release (M6)
R01：typecheck、lint、unit/integration、build、E2E 真正執行並記錄。
R02：核心函式變動後整套 golden 重新驗證；不得改答案迎合程式。
R03：Markdown／CSV／JSON 匯出含 snapshot、period、scope、metric_version、as_of、assumptions。
R04：無硬寫商業成效、無假使用者評論、無履歷或前雇主內容。
R05：人工走完匯入→診斷→試算→行動；不能只依測試綠燈發佈。
