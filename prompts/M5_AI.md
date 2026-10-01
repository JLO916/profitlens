請只做 M5。先讀 AI_CONTRACT、ARCHITECTURE 與 spec/insight-output.schema.json。
以 provider interface 實作選配 server-side 模型接入；依當時官方 OpenAI SDK 文件選用支援 structured outputs 的方式。模型名稱來自 server 環境變數，不硬編過時模型；不要要求使用者把 key 貼到聊天。
只傳預覽後經同意的最小彙總 facts。模型負責說明、假說與行動；所有數字經 fact placeholders 由程式填入。檢查 ID／metric／period／scope；拒絕無根據數字、錯引用、把相關當因果的已知測試案例。
加上 no-key、timeout、429、拒絕、截斷、schema error、prompt injection、stale snapshot 的 mock 測試；核心計算始終可用，fallback 明示規則診斷。
PUBLIC_DEMO 模式後端關閉 live endpoint。key 只在 server，不出現在 client bundle／logs。
沒有 key 時完成 mock 與可配置程式即可；live test 標記未執行，不能冒稱已連線。不得因此阻止其他功能驗收。更新 STATUS，完成即停。
