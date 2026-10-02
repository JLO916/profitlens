# ProfitLens Revamp v2 Kit

把這個資料夾的內容放進 `JLO916/profitlens` repo，然後用 Claude Code 依批次執行。

## 放哪裡
```
profitlens/
├── CLAUDE.md                      ← 本套件的 CLAUDE.md（與既有 AGENTS.md 並存，AGENTS.md 優先）
├── docs/revamp/                   ← 本套件的 docs/revamp/ 整個資料夾
│   ├── 00_README.md               用法、批次順序、估時、完成定義
│   ├── 01_BRIEF.md                定位、使用者、原則、審查發現、成功指標
│   ├── 02_IA_LAYOUT.md            資訊架構、每頁版型、元件行為
│   ├── 03_GLOSSARY_COPY.md        名詞對照（含程式 key）、規則卡文案、免責集中、文案改寫
│   ├── 04_IMPORT_TW.md            匯入精靈、含稅換算、台灣來源 preset、對照記憶
│   ├── 05_FEATURES.md             輔助 KPI、去年同期、目標、檔期、情境範本、看板、會議、匯出
│   ├── 06_BATCHES.md              R0–R7 任務、檔案、測試、驗收、允許依賴
│   ├── 07_PROMPTS.md              直接貼進 Claude Code 的提示詞
│   ├── 08_RELAUNCH.md             README 改寫、示範資料、SEO、上線檢查、發布說明
│   └── 09_DECISIONS_PENDING.md    12 個要你拍板的決策（附建議）
└── src/i18n/labels.zh-TW.ts       ← 標籤字典種子（已用 repo 的 MetricName/RuleCode 型別通過 tsc）
```

## 開工三步
1. 填 `docs/revamp/09_DECISIONS_PENDING.md` 的「決定」欄（空白＝採建議值）。
2. 在 repo 根目錄開 Claude Code，貼 `docs/revamp/07_PROMPTS.md` 的「啟動提示」，再貼 R0。
3. 每批通過後才貼下一批；R2 完成後建議先部署 `v2.0.0-beta.1`。

## 這份規劃的依據
- 2026-10-02 實測正式站 `profitlens-tau.vercel.app`（載入示範、KPI 抽屜、通路診斷、商品毛利、情境實際計算、建立行動、匯入流程）。
- 讀取 repo：`AGENTS.md`、`README.md`、`docs/METRICS.md`、`docs/DATA_CONTRACT.md`、`docs/PILOT_WORKSHEET.md`、`src/components/dashboard.tsx`、`src/application/presentation.ts`、`tests/manager-language.test.ts`、`playwright.config.ts`、`package.json`。
- 財務核心（`src/domain`、golden fixtures、`contribution-v1`）在規劃中列為禁區；所有改動在呈現層與應用層，R4 以後只允許加法並要求獨立手算 golden。
