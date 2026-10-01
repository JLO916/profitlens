import Decimal from "decimal.js";
import { AiSnapshotSchema, InsightOutputSchema, type AiFact, type AiSnapshot, type InsightOutput } from "./contracts";
import { formatMoney, formatRate, metricDefinitions } from "../application/presentation";
export interface AllowedObservation { fact_ids: string[]; observation: string; kind: "value" | "change" | "missing" }
export interface GroundingIssue { code: string; path: string; message: string }
export type GroundingResult = { ok: true; output: InsightOutput } | { ok: false; issues: GroundingIssue[] };
const token = (fact: AiFact) => `{{fact:${fact.id}:${fact.metric}}}`;
const refundCaution = "退款按入帳日觀察，不等於 cohort 最終退貨率。";
const suffix = (fact: AiFact) => fact.metric === "refund_ratio" || fact.metric === "refunds" ? refundCaution : fact.metric === "mer" ? "MER 不是 ROAS，不提供媒體歸因。" : "";

/** The model chooses supported language; it never invents scope, direction or financial claims. */
export function observationCatalog(snapshot: AiSnapshot): AllowedObservation[] {
  const parsed = AiSnapshotSchema.parse(snapshot);
  const periodCaution = parsed.comparison.mode === "calendar_months" ? "完整自然月比較；金額為期間合計，不代表日均變化。" : "";
  const entries: AllowedObservation[] = parsed.facts.map(fact => {
    const subject = `${fact.period === "previous" ? "前期" : "本期"}所選通路合計的${metricDefinitions[fact.metric].label}`;
    if (fact.value === null) {
      const missing = fact.reason_codes.some(code => code.startsWith("MISSING_") || code === "SALES_COVERAGE_UNCONFIRMED" || code === "INVALID_OR_MISSING_METRIC");
      return { fact_ids: [fact.id], kind: "missing", observation: `${subject}${missing ? `尚未知（${token(fact)}），需先補齊資料。` : `不適用（${token(fact)}）；分母條件不成立時不顯示比率。`}${suffix(fact)}${periodCaution}` };
    }
    return { fact_ids: [fact.id], kind: "value", observation: `${subject}為 ${token(fact)}。${suffix(fact)}${periodCaution}` };
  });
  for (const current of parsed.facts.filter(fact => fact.period === "current" && fact.value !== null)) {
    const previous = parsed.facts.find(fact => fact.period === "previous" && fact.metric === current.metric && fact.value !== null);
    if (!previous) continue;
    const comparison = new Decimal(current.value!).comparedTo(previous.value!);
    const direction = comparison > 0 ? "上升" : comparison < 0 ? "下降" : "持平";
    entries.push({ fact_ids: [previous.id, current.id], kind: "change", observation: `本期所選通路合計的${metricDefinitions[current.metric].label}較前期${direction}（前期 ${token(previous)}；本期 ${token(current)}）。${suffix(current)}${periodCaution}` });
  }
  // A missing-data option is always presented first when the current aggregate is incomplete.
  return entries.sort((a, b) => Number(parsed.data_quality.missing_fact_ids.some(id => b.fact_ids.includes(id))) - Number(parsed.data_quality.missing_fact_ids.some(id => a.fact_ids.includes(id))));
}

const placeholders = /\{\{fact:(F\d{3}):([a-z_]+)\}\}/g;
const numericClaim = /\p{N}|百分之|百分百|一半|半數|減半|翻倍|倍增|[零〇一二三四五六七八九十百千萬億兆兩壹貳參肆伍陸柒捌玖拾佰仟]+\s*(?:元|圓|成|倍|筆|件|天|週|月|年|點|%|％)|(?:為|達|等於|增加|減少|提升|下降|節省|提高|降低|調至|降至|升至|設定為)[\s：:]*[零〇一二三四五六七八九十百千萬億兆兩壹貳參肆伍陸柒捌玖拾佰仟]+(?:[。，；！!?\s]|$)/u;
const unsafeContent = /忽略.{0,12}(?:規則|指令)|(?:上傳|寄送|傳送).{0,15}(?:所有|原始|檔案|訂單|個資)|(?:讀取|列出|洩漏|取得).{0,15}(?:key|secret|金鑰|密鑰|環境變數)|api[_\s-]?(?:key|token|憑證)|access[_\s-]?token|credentials?|存取權杖|存取令牌|(?:提供|貼上|輸入|告訴|分享|列出|傳送).{0,15}(?:憑證|密碼|金鑰|密鑰|token)|secret|ignore.{0,15}(?:rules|instructions)|system\s*prompt|https?:|javascript:|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|<\/?[a-z][^>]*>|```/i;
const unsafeClaim = /保證|必然|必定|一定|絕對|確定(?:獲利|改善|增加|原因)|可確定|成功率|成功機率|信心|置信|直接導致|(?:造成|導致|歸因於|源於|證明|帶來|驅動|使得).{0,20}(?:成長|增長|增加|下降|提升|降低|營收|收入|貢獻|獲利)|(?:本期|前期|其他通路).{0,20}(?:上升|下降|增加|減少|成長|增長)|(?:預計|預期|預測|預估).{0,15}(?:利潤|收益|營收|貢獻|獲利)|已(?:經)?(?:實現|達成|創造).{0,15}(?:改善|收益|成果|效益)|(?:最終|真實).{0,8}(?:cohort|退貨率|退款率)|(?:SKU|商品).{0,12}(?:行銷後貢獻|廣告歸因|投放歸因)|(?:補|填|視為|當作)零|guarantee|confidence|success\s*rate|definitely|certain(?:ly)?|caused\s+by|due\s+to|proven|realized\s+(?:profit|gain)/i;

function inspectText(text: string, path: string, facts: Map<string, AiFact>, cited: readonly string[], issues: GroundingIssue[], observation = false) {
  const add = (code: string, message: string) => issues.push({ code, path, message });
  for (const match of text.matchAll(placeholders)) {
    const fact = facts.get(match[1]);
    if (!fact || fact.metric !== match[2]) add("INVALID_PLACEHOLDER", "引用的事實或指標不存在或不匹配。");
    if (!cited.includes(match[1])) add("UNCITED_PLACEHOLDER", "文字引用未列入本則 fact_ids 的事實。");
    // Only catalog-validated observations bind a number to its exact period,
    // metric and scope. Free prose must not relabel an otherwise valid value.
    if (!observation) add("FREE_FIELD_NUMERIC_REFERENCE", "數值引用僅可出現在程式觀察模板；其他欄位僅能描述質性核查。");
  }
  const remaining = text.replace(placeholders, "");
  if (/\{\{|\}\}/.test(remaining)) add("INVALID_PLACEHOLDER", "Placeholder 格式不合法。");
  const normalized = remaining.normalize("NFKC");
  if (numericClaim.test(normalized)) add("LITERAL_NUMERIC_CLAIM", "數字主張必須由合法事實 placeholder 提供，不接受自由生成數值。");
  if (unsafeContent.test(normalized)) add("UNSAFE_CONTENT", "不允許越權指令、連結、個資或可執行內容。");
  if (!observation) {
    // Permit explicit non-causal caveats without treating their negated words as a claim.
    const claims = normalized.replace(/不代表因果關係|不是因果分析|不提供媒體歸因|不保證改善收益|不等於 cohort 最終退貨率/g, "");
    if (unsafeClaim.test(claims)) add("UNSAFE_CLAIM", "不允許確定因果、信心評分、保證效益或未支持的財務口徑。");
  }
}

/** Fail closed. No model-supplied observation is shown solely because its schema is valid. */
export function validateInsightOutput(raw: unknown, snapshot: AiSnapshot): GroundingResult {
  const input = AiSnapshotSchema.safeParse(snapshot);
  if (!input.success) return { ok: false, issues: [{ code: "INVALID_SNAPSHOT", path: "snapshot", message: "快照不符合匿名彙總契約。" }] };
  const parsed = InsightOutputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map(issue => ({ code: "OUTPUT_SCHEMA", path: issue.path.join("."), message: "模型輸出格式不符合契約。" })) };
  const output = parsed.data, issues: GroundingIssue[] = [];
  const facts = new Map(input.data.facts.map(fact => [fact.id, fact]));
  const catalog = observationCatalog(input.data);
  if (output.snapshot_id !== input.data.snapshot_id) issues.push({ code: "SNAPSHOT_MISMATCH", path: "snapshot_id", message: "回應不屬於目前同意的快照。" });
  output.insights.forEach((insight, index) => {
    const prefix = `insights.${index}`;
    if (insight.fact_ids.some(id => !facts.has(id))) issues.push({ code: "UNKNOWN_FACT_ID", path: `${prefix}.fact_ids`, message: "回應引用不存在的事實。" });
    if (new Set(insight.fact_ids).size !== insight.fact_ids.length) issues.push({ code: "OBSERVATION_FACT_MISMATCH", path: `${prefix}.fact_ids`, message: "事實引用不可重複。" });
    const selected = catalog.find(item => item.observation === insight.observation);
    if (!selected) issues.push({ code: "UNSUPPORTED_OBSERVATION", path: `${prefix}.observation`, message: "觀察不是此快照可支持的程式觀察模板。" });
    else if (JSON.stringify([...selected.fact_ids].sort()) !== JSON.stringify([...insight.fact_ids].sort())) issues.push({ code: "OBSERVATION_FACT_MISMATCH", path: `${prefix}.fact_ids`, message: "引用須恰好支持本觀察，不能附加無關事實。" });
    inspectText(insight.observation, `${prefix}.observation`, facts, insight.fact_ids, issues, true);
    for (const [key, value] of Object.entries(insight)) {
      if (key === "observation" || key === "fact_ids") continue;
      if (Array.isArray(value)) value.forEach((text, position) => inspectText(text, `${prefix}.${key}.${position}`, facts, insight.fact_ids, issues));
      else inspectText(value, `${prefix}.${key}`, facts, insight.fact_ids, issues);
    }
    if (insight.hypotheses.some(hypothesis => !hypothesis.startsWith("待驗證假說："))) issues.push({ code: "HYPOTHESIS_LABEL_REQUIRED", path: `${prefix}.hypotheses`, message: "假說必須明確以待驗證假說標示。" });
    if (!/核對|確認|檢查|比較|補齊|補充|蒐集|驗證|檢視|追蹤/.test(insight.recommended_action)) issues.push({ code: "VERIFICATION_ACTION_REQUIRED", path: `${prefix}.recommended_action`, message: "建議須包含可由人執行的核查或補資料步驟。" });
    if (input.data.data_quality.status === "partial" && index === 0) {
      if (!selected || selected.kind !== "missing" || !selected.fact_ids.some(id => input.data.data_quality.missing_fact_ids.includes(id))) issues.push({ code: "MISSING_DATA_PRIORITY", path: `${prefix}.observation`, message: "存在未知金額時，首要觀察必須是補資料需求。" });
      if (!/^(?:請)?(?:先)?(?:補齊|補充|核對缺漏|確認缺漏)/.test(insight.recommended_action)) issues.push({ code: "MISSING_DATA_ACTION", path: `${prefix}.recommended_action`, message: "首要行動必須先補齊或核對缺漏資料，不能跳到改善收益。" });
    }
  });
  output.limitations.forEach((text, index) => inspectText(text, `limitations.${index}`, facts, [], issues));
  return issues.length ? { ok: false, issues } : { ok: true, output };
}

function formatFact(fact: AiFact): string {
  if (fact.value === null) return metricDefinitions[fact.metric].unit === "money" ? "未知" : "N/A（未知或不適用）";
  const unit = metricDefinitions[fact.metric].unit;
  if (unit === "money") return `TWD ${formatMoney(fact.value)}`;
  if (unit === "percent") return formatRate(fact.value);
  return `${new Decimal(fact.value).toFixed(2, Decimal.ROUND_HALF_UP)} 倍`;
}

/** Client calls this after server validation too; rendering never trusts a stale or malformed payload. */
export function renderInsightOutput(output: InsightOutput, snapshot: AiSnapshot): InsightOutput {
  const validated = validateInsightOutput(output, snapshot);
  if (!validated.ok) throw new Error("AI_GROUNDING_REJECTED");
  const facts = new Map(snapshot.facts.map(fact => [fact.id, fact]));
  const render = (text: string) => text.replace(placeholders, (_match, id: string) => formatFact(facts.get(id)!));
  return {
    snapshot_id: validated.output.snapshot_id,
    insights: validated.output.insights.map(insight => ({ ...insight, fact_ids: [...insight.fact_ids], observation: render(insight.observation), hypotheses: insight.hypotheses.map(render), recommended_action: render(insight.recommended_action), owner_role: render(insight.owner_role), verification_metric: render(insight.verification_metric), stop_condition: render(insight.stop_condition), additional_data_needed: insight.additional_data_needed.map(render), limitations: insight.limitations.map(render) })),
    limitations: validated.output.limitations.map(render),
  };
}
