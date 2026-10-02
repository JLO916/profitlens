// ProfitLens — 使用者可見文字的單一來源（繁體中文／台灣電商用語）
// 規格：docs/revamp/03_GLOSSARY_COPY.md。R0 放入、R2 接線。
// 規則：元件、匯出、AI 預覽都從這裡取字；技術代號只放在 *.technical 或 basis 內。
import type { MetricName, RuleCode } from "@/domain/types";

export interface MetricLabel {
  label: string;           // 主名稱（頁面、匯出）
  short: string;           // 短名（卡片、表頭）
  plain: string;           // 白話一句（tooltip）
  formula: string;         // 中文階梯公式
  formulaTechnical: string; // 技術公式（技術細節區）
}

export const metrics = {
  gross_sales: { label: "商品原價收入", short: "原價收入", plain: "折扣與退款之前的商品金額", formula: "來源各列原價收入合計", formulaTechnical: "G = Σ gross_sales" },
  discounts: { label: "折扣", short: "折扣", plain: "促銷與優惠券的折讓金額", formula: "來源各列折扣合計", formulaTechnical: "D = Σ discounts" },
  refunds: { label: "退款金額", short: "退款", plain: "依退款日期計算，可能來自上期訂單", formula: "依退款日合計，不回推到原訂單日", formulaTechnical: "R = Σ refunds（by refund date）" },
  cogs_net: { label: "商品成本", short: "商品成本", plain: "進貨或製造成本（來源已入帳淨額）", formula: "來源各列商品成本合計；負值為來源實際沖回", formulaTechnical: "C = Σ cogs_net" },
  platform_fees: { label: "平台抽成", short: "平台抽成", plain: "蝦皮、momo 等平台的成交手續費", formula: "每日每通路只計一次的平台抽成合計", formulaTechnical: "P = Σ platform_fees（date×channel）" },
  payment_fees: { label: "金流手續費", short: "金流費", plain: "刷卡、超商代收等手續費", formula: "每日每通路只計一次的金流手續費合計", formulaTechnical: "Q = Σ payment_fees（date×channel）" },
  fulfillment_costs: { label: "物流與包材費", short: "物流費", plain: "出貨運費、倉儲與包材", formula: "每日每通路只計一次的物流與包材費合計", formulaTechnical: "F = Σ fulfillment_costs（date×channel）" },
  other_variable_costs: { label: "其他變動費用", short: "其他變動費", plain: "隨訂單變動的其他費用", formula: "每日每通路只計一次的其他變動費用合計", formulaTechnical: "O = Σ other_variable_costs（date×channel）" },
  ad_spend: { label: "廣告投放費", short: "廣告費", plain: "按銷售通路歸屬的廣告支出", formula: "每日每通路的廣告投放費合計，不分到商品", formulaTechnical: "A = Σ ad_spend（date×channel）" },
  net_revenue: { label: "淨營收", short: "淨營收", plain: "原價收入 − 折扣 − 退款", formula: "商品原價收入 − 折扣 − 退款金額", formulaTechnical: "N = G − D − R" },
  gross_profit: { label: "商品毛利", short: "商品毛利", plain: "淨營收 − 商品成本", formula: "淨營收 − 商品成本", formulaTechnical: "GP = N − C" },
  contribution_before_marketing: { label: "通路貢獻", short: "通路貢獻", plain: "商品毛利再扣平台抽成、金流費、物流費、其他變動費", formula: "商品毛利 − 平台抽成 − 金流手續費 − 物流與包材費 − 其他變動費用", formulaTechnical: "CM_before = GP − P − Q − F − O" },
  contribution_after_marketing: { label: "扣廣告後貢獻", short: "廣告後貢獻", plain: "通路貢獻再扣廣告投放費；不含固定費與稅", formula: "通路貢獻 − 廣告投放費", formulaTechnical: "CM_after = CM_before − A" },
  gross_margin: { label: "商品毛利率", short: "毛利率", plain: "商品毛利 ÷ 淨營收", formula: "商品毛利 ÷ 淨營收（淨營收 > 0 才計算）", formulaTechnical: "GP / N" },
  contribution_margin: { label: "貢獻率", short: "貢獻率", plain: "扣廣告後貢獻 ÷ 淨營收；每 100 元營收剩多少", formula: "扣廣告後貢獻 ÷ 淨營收（淨營收 > 0 才計算）", formulaTechnical: "CM_after / N" },
  discount_rate: { label: "折扣率", short: "折扣率", plain: "折扣 ÷ 原價收入", formula: "折扣 ÷ 商品原價收入", formulaTechnical: "D / G" },
  refund_ratio: { label: "退款比", short: "退款比", plain: "退款 ÷（原價收入 − 折扣）；是金額比，不是件數退貨率", formula: "退款金額 ÷（原價收入 − 折扣）", formulaTechnical: "R / (G − D)" },
  mer: { label: "廣告投報（MER）", short: "MER", plain: "淨營收 ÷ 廣告費；常被叫 ROAS，但不含媒體歸因", formula: "淨營收 ÷ 廣告投放費（兩者 > 0 才計算）", formulaTechnical: "N / A" },
  fulfillment_burden: { label: "物流費佔比", short: "物流費佔比", plain: "物流與包材費 ÷ 淨營收", formula: "物流與包材費 ÷ 淨營收", formulaTechnical: "F / N" },
  marketing_burden: { label: "廣告佔比", short: "廣告佔比", plain: "廣告投放費 ÷ 淨營收", formula: "廣告投放費 ÷ 淨營收", formulaTechnical: "A / N" },
} satisfies Record<MetricName, MetricLabel>;

export interface RuleLabel {
  title: string;      // 標題模板，占位符：{dNet} {dCM} {cm} {prevRate} {curRate} {dAmount} {channel} {sku} {missing}
  cause: string;      // 可能原因（待確認）
  nextStep: string;   // 下一步
  caution: string;    // 注意（限制一句）
}

export const rules = {
  REV_UP_CM_DOWN: { title: "營收多了 {dNet}，但扣完廣告反而少賺 {dCM}", cause: "折扣加深、退款增加、平台或廣告費上升吃掉了成長", nextStep: "看拆解找出吃掉貢獻的前兩項，到通路健檢確認是哪個通路", caution: "差額是結果，不等於原因" },
  NEGATIVE_CHANNEL_CM: { title: "{channel} 本期扣完廣告是虧的（{cm}）", cause: "該通路抽成或廣告費高於毛利", nextStep: "先確認抽成與廣告費是否正確歸屬，再決定調整投放、價格或商品組合", caution: "不含固定費與稅" },
  DISCOUNT_BURDEN_UP: { title: "折扣率從 {prevRate} 升到 {curRate}，折扣多花 {dAmount}", cause: "促銷檔期更深、折扣券發放更多、商品組合改變", nextStep: "列出本期促銷檔期，核對折扣有沒有換到足夠銷量；評估下一檔折扣深度", caution: "降折扣要先看銷量反應" },
  REFUND_BURDEN_UP: { title: "退款比從 {prevRate} 升到 {curRate}，退款多 {dAmount}", cause: "上期訂單延後退款、品質或尺寸問題、物流損壞", nextStep: "拉退款原因（尺寸／瑕疵／物流），分清是上期訂單還是本期問題", caution: "這是金額比，不是件數退貨率" },
  FULFILLMENT_BURDEN_UP: { title: "物流費佔比從 {prevRate} 升到 {curRate}", cause: "運費單價上漲、小額訂單變多、包材升級", nextStep: "核對物流合約與包材費，確認是單價問題還是訂單結構問題", caution: "比率上升不等於可省下的金額" },
  MARKETING_BURDEN_UP: { title: "廣告佔比從 {prevRate} 升到 {curRate}，廣告多花 {dAmount}", cause: "投放加碼、轉換變差、營收入帳延後", nextStep: "比對各媒體的 ROAS，先縮減表現最差的活動，設定每週檢查點", caution: "廣告增加不等於浪費，先看帶來的營收" },
  SKU_NEGATIVE_GP: { title: "{sku} 本期商品毛利是負的（{cm}）", cause: "成本登錄錯誤、清倉折扣、退款集中", nextStep: "先確認成本是否正確；若正確，考慮調價、停售或改搭售", caution: "只看商品毛利，不含廣告" },
  MISSING_CRITICAL_DATA: { title: "{channel} 缺{missing}，相關數字無法計算", cause: "檔案少列、欄位空白", nextStep: "向財務／營運補齊缺漏，補齊前不下結論", caution: "缺的不是零" },
} satisfies Record<RuleCode, RuleLabel>;

export const nav = {
  overview: { label: "經營總覽", description: "本期關鍵數字、三件事、趨勢與拆解" },
  diagnosis: { label: "通路健檢", description: "自動健檢：哪個通路、哪項費用出了問題" },
  products: { label: "商品毛利", description: "商品賣得好不好、賺不賺" },
  scenarios: { label: "假設試算", description: "如果調廣告、調折扣，貢獻會變多少" },
  actions: { label: "待辦與決議", description: "要做什麼、誰負責、何時檢查" },
  meeting: { label: "會議紀錄", description: "議程、決議、與上次會議比較、匯出" },
  data: { label: "資料來源", description: "匯入資料、確認口徑與完整性" },
  validation: { label: "開發者驗證", description: "合成案例檢查計算與缺漏處理" },
} as const;

export const sections = {
  kpis: "本期關鍵數字",
  assistKpis: "輔助指標",
  topThree: "本期三件事",
  keyDeltas: "兩個關鍵差額",
  trend: "每週淨營收與貢獻",
  bridge: "貢獻變化拆解",
  channelMix: "通路比較",
  periodTotals: "期間合計與日均",
  channelTable: "通路表",
  diagnosisList: "健檢結果",
  productTopBottom: "毛利最差／最好的商品",
  productTable: "商品毛利明細",
  scenarioBaseline: "本期基準",
  scenarioForm: "方案",
  scenarioCompare: "方案比較",
  scenarioAssumptions: "這個試算假設了什麼",
  scenarioBreakeven: "要賣到多少才划算",
  actionBoard: "待辦看板",
  actionList: "待辦清單",
  meetingAgenda: "議程",
  meetingDecision: "決議",
  meetingCompare: "與上次會議比較",
  dataScope: "資料範圍與口徑",
  dataPreprocessing: "本次匯入的前處理",
  dataPreview: "來源檔案",
  dataIssues: "資料完整性問題",
  evidence: "怎麼算的",
  evidenceSources: "來源資料",
  technicalDetails: "技術細節",
  aiExplain: "AI 解釋（選配）",
} as const;

export const buttons = {
  loadDemo: "試試示範資料",
  importData: "匯入資料",
  apply: "套用",
  calculate: "計算",
  addScenario: "新增方案",
  removeScenario: "移除",
  addAction: "新增待辦",
  addToActions: "加入待辦",
  viewEvidence: "看證據",
  confirm: "確認",
  pin: "置頂",
  moveUp: "往上移",
  remove: "移除",
  rebind: "用目前資料重新核對",
  selectForMeeting: "選入會議",
  updateMeetingSource: "用目前資料更新會議",
  finalizeMeeting: "結束會議",
  save: "儲存",
  download: "下載",
  downloadBackup: "下載備份檔",
  saveLocal: "存在這台電腦",
  deleteLocal: "刪除本機資料",
  restorePreview: "讀取本機副本預覽",
  clear: "清空",
  basis: "口徑說明",
  exportPdf: "匯出 PDF",
  exportExcel: "匯出 Excel",
  exportPptx: "匯出 PPT 一頁式",
  exportMarkdown: "下載 Markdown",
  exportCsv: "下載 CSV",
  exportJson: "下載 JSON",
  print: "列印",
  fillZero: "全部填 0（維持現況）",
  applyTemplate: "套用範本",
  next: "下一步",
  back: "上一步",
  cancel: "取消",
} as const;

export const scenario = {
  volume: { label: "銷量增減", hint: "例：多賣 10% 填 +10", absoluteHint: "本期件數 {units} → 目標件數" },
  discount: { label: "折扣率調整", hint: "例：10% 改成 12% 填 +2；改成 8% 填 −2", absoluteHint: "新折扣率 %" },
  fulfillmentUnit: { label: "每件物流費增減", hint: "物流費單價變動，例：漲 5% 填 +5", absoluteHint: "" },
  adSpend: { label: "廣告預算增減", hint: "例：加碼 20% 填 +20", absoluteHint: "本期 {ad} → 新預算（元）" },
  oneOff: { label: "一次性費用（元）", hint: "例：KOL 合作費、新包材開模費", absoluteHint: "" },
  acceptAssumptions: "我了解這是假設試算，不是預測",
  resultTitle: "試算後的扣廣告後貢獻",
  vsBaseline: "與現況相比",
  draft: "草稿（未重新計算）",
  modeRelative: "相對 %",
  modeAbsolute: "絕對值",
  templateNote: "範本數字只是起點，請改成你的假設",
} as const;

export const actions = {
  problem: "問題",
  step: "具體動作",
  owner: "負責人",
  metric: "怎麼看成效",
  due: "期限",
  stop: "何時喊停",
  extraData: "還需要什麼資料",
  status: "狀態",
  progress: "進度紀錄",
  evidence: "引用的數據",
  searchEvidence: "搜尋數據",
  statuses: { not_started: "未開始", in_progress: "進行中", blocked: "受阻", done: "已完成" },
  staleBadge: "引用較早資料",
  confirmedNote: "確認證據只代表數字對得上，不代表結論成立",
} as const;

export const meeting = {
  name: "會議名稱",
  date: "會議日期",
  notes: "備註",
  decision: "決議",
  decisions: { draft: "草稿", adopted: "採用", need_data: "補資料再議", rejected: "不採用" },
  decisionNote: "決議由人決定；方案或門檻改動後請重新確認決議",
  threshold: "金額門檻（元）",
  lastMeeting: "上次會議",
  noComparable: "上次會議使用不同資料，只列出上次決議與待辦狀態",
} as const;

export const status = {
  ready: "資料就緒",
  partial: "部分資料待補",
  empty: "還沒有資料",
  loading: "正在檢核與計算…",
  error: "資料載入失敗",
  demo: "示範資料",
  local: "本機匯入",
  unsaved: "未保存",
  savedAt: "已保存 {time}",
  aiOff: "AI 解釋未啟用（公開版）",
  aiNeedsConsent: "AI 解釋需預覽同意",
  aiUnknown: "AI 狀態確認中",
  dataAsOf: "資料到",
  missing: "資料待補",
  notApplicable: "不適用",
} as const;

export const periods = {
  previous: "上期",
  current: "本期",
  sameDays: "等天數比較",
  calendarMonths: "整月比較",
  presets: { last7: "近 7 天", last4w: "近 4 週", last12w: "近 12 週", monthVsPrev: "本月 vs 上月", yoy: "去年同期" },
  presetUnavailable: "資料只到 {date}，無法取{preset}",
} as const;

export const importWizard = {
  steps: ["選檔", "對照欄位", "口徑與期間", "檢核與套用"],
  files: { sales: "商品銷售", costs: "通路費用", ads: "廣告投放" },
  dropHint: "拖放 CSV 到這裡，或點擊選檔",
  templates: "下載範本（含範例）",
  howTo: "怎麼從平台整理三份檔案",
  basis: { label: "金額口徑", exclusive: "未稅", inclusive: "含稅（5% 營業稅，系統換算成未稅）", unsure: "我不確定" },
  basisUnsureHelp: "看平台報表的欄位說明或發票：若金額等於消費者實付（含稅價），選「含稅」。",
  convertFields: "要換算的欄位",
  suggested: "系統建議，請確認",
  memoryHint: "上次（{date}）用過同樣欄位的對照，已帶入，請確認",
  presetHint: "看起來像 {preset} 的匯出檔，已套用建議對照（請確認）",
  ignoreConfirm: "我知道這些欄位不會進入分析",
  coverageConfirm: "我確認檔案包含這段期間的全部銷售",
  amountConfirm: "我確認這些是商品金額，不含消費者付的運費與平台補貼",
  proposedBy: "由檔案提議，請確認",
  orderLevelDetected: "這是訂單明細，請先用整理工具彙總成日 × 通路 × 商品",
} as const;

export const importErrors: Record<string, string> = {
  // key = validation reason code；R3 以 src/domain/validation.ts 的實際 code 補齊
  DUPLICATE_KEY: "同一天、同通路（、同商品）出現兩列，請在來源合併後再匯入（第 {line} 行）",
  MIXED_CURRENCY: "檔案裡有非 TWD 的幣別（第 {line} 行）；目前只支援 TWD",
  MISSING_COGS: "第 {line} 行沒有商品成本；毛利會顯示「資料待補」，不會當成 0",
  MISSING_AD_DAY: "{date} {channel} 沒有廣告列；沒投放請填 0，不要留空",
  INVALID_DATE: "日期格式要是 2026-08-01（第 {line} 行）",
  INVALID_NUMBER: "金額只能是數字與小數點，不要有 $、逗號（第 {line} 行）",
  UNKNOWN_CHANNEL: "「{channel}」不在你勾選的通路裡，回上一步勾選或修正檔案",
  OUT_OF_COVERAGE: "第 {line} 行的日期超出你設定的涵蓋範圍",
};

export const basis = {
  title: "口徑說明",
  items: [
    "金額都是未稅、依結帳（入帳）日計算。",
    "四層數字：淨營收 → 商品毛利 → 通路貢獻 → 扣廣告後貢獻。",
    "不包含：固定費（房租、人事）、所得稅、消費者付的運費收入、平台補貼。所以扣廣告後貢獻不是公司淨利。",
    "兩期的差額是「發生了什麼」，不是「為什麼」；也不是可以省下的錢。",
    "合計已包含各通路，各通路的差額不能再加總。",
    "退款比是金額比，不是件數退貨率，也不是同批訂單最終退貨率。",
    "假設試算是「如果這樣做會變多少」，不是預測；三個方案不能相加。",
    "MER（淨營收 ÷ 廣告費）常被稱為 ROAS，但沒有媒體歸因；廣告費為 0 時不顯示。",
    "商品頁只看商品毛利；廣告與平台費不分到單一商品。",
  ],
  footer: "扣廣告後貢獻不含固定費與稅；兩期差額不等於原因",
  aliases: { contribution_after_marketing: ["行銷後貢獻", "邊際貢獻"], contribution_before_marketing: ["行銷前貢獻"] },
} as const;

export const demoChannelAlias: Record<string, string> = { DTC: "官網 · DTC", MARKETPLACE: "平台 · MARKETPLACE" };
export const demoCategoryAlias: Record<string, string> = { HOME: "居家", CARE: "保養", ACCESSORIES: "配件", ELECTRONICS: "3C" };

export const emptyState = {
  eyebrow: "先用示範資料看看",
  title: "營收漲了，到底多賺還是少賺？",
  body: "匯入銷售、通路費用與廣告三份報表，從整體變化一路追到每一筆來源。",
  steps: ["匯入資料", "看哪裡賺、哪裡賠", "決定要做什麼"],
} as const;

export const labels = { metrics, rules, nav, sections, buttons, scenario, actions, meeting, status, periods, importWizard, importErrors, basis, demoChannelAlias, demoCategoryAlias, emptyState };
export type Labels = typeof labels;
