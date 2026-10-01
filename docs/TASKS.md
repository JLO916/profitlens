# Milestones

| 關卡 | 工作 | 完成門檻 |
|---|---|---|
| M0 | 讀規格、檢查環境、初始化 TypeScript/Next.js 與真實測試命令、狀態紀錄 | minimal app/build/typecheck smoke；不做完整 dashboard |
| M1 | types、CSV parse/validate、精確金額、aggregation、metrics、bridge、rules | C01–C18；golden 必须逐項對齊 |
| M2 | 有資料的示範版 UI、證據抽屜、通路／商品分界、狀態 | 真正呼叫 M1 引擎，非硬寫卡片 |
| M3 | 本機三 CSV 匯入、設定表單、欄位對照、錯誤報告、下載 | U01–U11；至少兩個不同有效資料集可更換 |
| M4 | 單通路情境試算、三方案比較、行動卡、快照匯出 | S01–S07；先不接 AI |
| M5 | server-side 選配 AI、schema/semantic gate、facts、故障降級 | A01–A08；live 測試與 mock 分開 |
| M6 | 整合、獨立檢視、瀏覽器驗收、文件、示範模式安全 | R01–R05，實際報告通過／失敗／未執行 |

上一關未通過不得跳下一關。M0 可完成純工程 scaffold，但不依賴 AI API。M1 是最重要的開發前提。
不預設每關需要幾小時或幾天；以可驗收產物而非「看起來完成」推進。
每個 milestone 使用 `prompts/` 對應檔案。禁止一次貼上全部。
