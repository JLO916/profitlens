# Review v2 A 最後完整性核對

- 最後 build：`0U3urGYm_9KI-Zel0tOsR`；與指定 BUILD_ID 相符：True。
- 受保護來源：60 件 SHA-256 pass，涵蓋 fixtures（含 golden）、domain、package／lock、AI schema、AGENTS。
- 評閱解壓原件：9 件 SHA-256 pass；原始 ZIP 與九個內含原件：pass。未執行附檔 script。
- `git status --porcelain -- fixtures/golden src/domain package.json package-lock.json`：0 個變更。
- `.next/static`：23 件資產掃描 pass；本輪／舊 fake canary、OPENAI_API_KEY、OPENAI_MODEL、dangerouslyAllowBrowser、直接 OpenAI endpoint 與 key-like pattern 均以有限模式檢查，不輸出匹配內容。
- 掃描期間 asset inventory 與 BUILD_ID 均穩定：True。
- 實際下載檔：26 件合成驗收輸出（JSON／CSV／Markdown／PDF）SHA-256 inventory 已保存至 `verification/review-v2-a-download-inventory.json`；預期檔案缺漏 0 件。未修改任何下載內容。
- 掃描時間 UTC：2026-10-02T02:08:34.850865+00:00 至 2026-10-02T02:08:35.228904+00:00。

JSON 保存逐檔 expected／actual SHA-256 與 client 資產 inventory；下載清單另存檔案格式、大小、mtime 與雜湊。

未讀取任何 `.env` 或真實 key。此掃描不宣稱排除所有未知秘密；後續 rebuild 必須再次核對。下載檔雜湊不取代瀏覽器下載或 PDF 視覺驗收，其結果由主驗收另行記錄。
