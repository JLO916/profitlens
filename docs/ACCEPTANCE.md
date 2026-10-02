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
| C16 | 日期／coverage | 依模式等長或各為完整自然月，前期早於本期；coverage／data_as_of 完整涵蓋；未知 coverage 不當無活動 |
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
| U11 | no persistence surprise | 預設不持久化，重新整理清空目前分頁並事先提醒；只有明確同意才保存本機，手動預覽與確認恢復，兩視窗不自動共用／同步資料 |

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

## 管理者改善第一批（2026-10-01 新增）

| ID | 預期 | 本輪證據位置 |
|---|---|---|
| PL-01 | 主動同意後保存本機／完整工作區 JSON；範圍、映射、方案、行動及版本恢復前重驗重算；錯檔不取代；stale 不復活；未保存提示與刪除本機副本 | `verification/manager-batch1-acceptance.md` |
| PL-02 | 八月 31 天與九月 30 天完整月可比較，合計與日均分開；反向、未完整月、coverage／as_of 外拒絕；AI／匯出包含模式天數；零與缺值正確 | 同上 |
| PL-03 | 三 CSV 中文欄位說明與空範本；日期／通路提議需明確確認，不能以已觀察列推定完整涵蓋；粒度不符說明整理方式 | 同上 |
| PL-04 | 來源欄位合計→標準欄位→指標對帳；缺漏仍未知，運費收入等不在口徑內清楚列出；含稅／已扣折扣淨額／未知來源不自動換算，換檔或映射需再確認 | 同上 |

## 管理者改善第二批（2026-10-01 新增）

| ID | 預期 | 本輪證據位置 |
|---|---|---|
| PL-05 | 診斷帶入原始 fact IDs 的未確認草稿；獨立跨通路工作、最多三項置頂但可超過三項；原第二批為編輯撤銷確認，A 批改為僅引用變更撤銷證據確認、管理欄位不撤銷；每項綁定自己的資料／期間／範圍，歷史來源可查且不復活；v1 備份遷移、v2 跨範圍恢復 | `verification/manager-batch2-acceptance.md` |
| PL-06 | Golden 收入差 +220／貢獻差 -315／MARKETPLACE 170→-15；缺漏優先，同規則分組與重要性門檻；最多三組優先清單，完整規則保留，跨層金額不加總 | 同上 |
| PL-07 | 兩期通路 × SKU 聯集、精確毛利差排序、負毛利篩選、品類／SKU 搜尋；無列／明確零／未知分開，來源可追溯；不分攤 SKU 廣告或通路費用 | 同上 |
| PL-08 | 衍生門檻沿用 scenario-v1；貢獻為零與維持原貢獻分開，近似值附精確分數；三個銷量假設明填並各自重算；超界、不可解、未同意、無效 baseline、stale 不給可用門檻 | 同上 |
| PL-09 | 主管 Markdown／列印稿及通路寬表；日期、範圍、狀態、所選方案／假設、人工行動／期限／風險完整；目前摘要 facts／來源置主管 Markdown 附錄，歷史行動完整 facts／版本／範圍見完整決策輸出；列印依內容續頁，原第二批摘要選擇不納入備份，A 批改納入 ReviewSession／v3；安全文字與不同歷史範圍不混用 | 同上 |

## 管理者改善第三批 PL-10（2026-10-01 新增）

| ID | 預期 | 本輪證據位置 |
|---|---|---|
| PL-10a | 每頁明示規則診斷可用與即時 AI 狀態；未知／設定關閉／缺 key／PUBLIC_DEMO 時沒有 JSON、同意或送出流程；不把無法確認狀態說成已成功關閉或已連線 | `verification/manager-batch3-acceptance.md` |
| PL-10b | 主流程只提供營運示範及三 CSV 匯入；Golden、缺漏、重複鍵移至獨立進階驗證頁；只切頁不變更資料／範圍／稿，錯誤載入仍保留先前資料 | 同上 |
| PL-10c | 指標、期間、範圍及重要限制使用中文可讀文案；主要說明至少12px；公式、fact／rule／版本ID可在稽核展開並鍵盤操作；不刪除追溯來源 | 同上 |
| PL-10d | 可用AI先展示完整40 facts的中文精確值與彙總範圍，完整JSON和技術metadata預設折疊；只在明確同意後POST；取消、錯引用與stale測試保留；所有mock不當作live test | 同上 |

## Review v2 A 批（2026-10-01）

此批修訂先前「只切通路即鎖住行動／情境」的狀態測試；真正換資料／期間／比較方式與 AI stale response 防線仍須成立。財務 C01–C18、S01–S07 原固定答案不變。逐項實跑狀態與命令見 verification/review-v2-a-acceptance.md。

| ID | 驗收 |
|---|---|
| VA01 | 全通路行動切 DTC／商品頁／返回仍原引用，可更新負責人、期限、狀態與備註，證據確認與工作稿完整分開 |
| VA02 | same fact ID 不同資料值；重綁取消／成功／過期預覽／coverage 缺漏／null／連續歷史都驗證，跨範圍不得重綁 |
| VA03 | DTC／MARKETPLACE 各三案，回切可編輯；真正換資料／期間／模式不復活，編輯即撤下結果，歷史複製清空假設 |
| VA04 | 固定會議門檻 1000、每通路選一修訂、三置頂五附錄；離頁／備份恢復一致，沒有置頂不自動挑選 |
| VA05 | 會議引用變更明示差異、不靜默換版；明確更新來源／引用撤回草稿；畫面、Markdown、列印相同投影 |
| VA06 | v1／v2 原格式與 checksum 先驗後遷移；v3 roundtrip 重算、hash 去重、不恢復 AI 同意；非法引用／偽造版本／超限全拒絕 |
| VA07 | demo/validation、CSV、restore、clear 四入口 save/discard/cancel；下載確認、本機同意、保存失敗、非同步競爭不錯置資料 |
| VA08 | Markdown／CSV／JSON 逃逸、XSS、公開 AI 關閉、client 無 key、跨視窗隔離維持 |
| VA09 | production build＋全套 unit/integration/E2E；真瀏覽器 1440／1280／768／390、鍵盤、列印與實際下載內容，留合成證據 |

Live AI、真實營運資料、實體裝置與新部署不在本批；未測必須 not_run。B–D 批不得由此驗收宣稱完成。
