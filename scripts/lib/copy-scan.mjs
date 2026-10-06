// V3-0 labels 文案掃描核心（PRD §5.2 X1/X3/X5/X11/X14/X21、§5.4、§8.1、§8.4）。
// 只掃 labels 的字串值（不渲染頁面）；tests/copy-style.test.ts 與 scripts/ui-audit.mjs 共用。純函式，不讀檔。

/**
 * 白名單（L3 技術字串與舊名，PRD §5.4、§8.4）：
 * - 路徑中任一段鍵名為 `technical`，或以 `technical` 開頭、以 `Technical` 結尾（例如 formulaTechnical、technicalVersion）的整個子樹；
 *   V3-2c 起指標的計算方式放在 `metrics.<名>.technical.{formula,formulaTechnical}`，同一條規則涵蓋；
 * - 舊名對照：`glossary.aliases`（V3-2c 新位置）與 v2 舊鍵 `basis.aliases`；
 * - `glossary.terms.<n>.oldNames`（V3-2a 名詞小辭典的 v2 舊名，PRD §8.9；和舊名對照同性質，本來就要寫出舊名）。
 */
export function isWhitelisted(path) {
  const segments = path.split(".");
  if (segments.some(segment => segment === "technical" || /^technical[A-Z]/.test(segment) || /Technical$/.test(segment))) return true;
  if (/^glossary\.terms\.\d+\.oldNames(\.|$)/.test(path)) return true;
  return ["basis.aliases", "glossary.aliases"].some(prefix => path === prefix || path.startsWith(`${prefix}.`));
}

/**
 * V3-2c：labels 同時有新分組（LABEL_GROUPS，字串常值只在這裡）與 v2 舊鍵 alias（LEGACY_SECTIONS 與 legacyAliases，只是參照）。
 * 傳入 meta（labels 模組本身即可）時：
 * - view 只含新分組，並拿掉 legacyAliases 指到別處的舊鍵（例如 metrics.<名>.label），同一個字串只算一次；
 * - matches(path, 規則) 同時比對新路徑與指到它的所有舊路徑，白名單、JSON 例外與 L1 鍵的口徑與 V3-2b 相同。
 * 不傳 meta（合成輸入）時照舊掃整棵樹。
 * @param {Record<string, unknown>} labels
 * @param {{ LABEL_GROUPS: readonly string[], LEGACY_SECTIONS: readonly string[], legacyAliases: Readonly<Record<string, string>> }} [meta]
 */
export function labelScope(labels, meta) {
  if (!meta) return { view: labels, oldPathsOf: () => [], matches: (path, predicate) => predicate(path) };
  const groups = new Set(meta.LABEL_GROUPS);
  const known = new Set([...meta.LABEL_GROUPS, ...meta.LEGACY_SECTIONS]);
  const unknown = Object.keys(labels).filter(key => !known.has(key));
  if (unknown.length) throw new Error(`labels 有不在 LABEL_GROUPS／LEGACY_SECTIONS 的區段：${unknown.join("、")}`);
  const aliases = meta.legacyAliases;
  const oldPaths = new Map();
  for (const [from, to] of Object.entries(aliases)) { if (!oldPaths.has(to)) oldPaths.set(to, []); oldPaths.get(to).push(from); }
  const isAlias = path => Object.hasOwn(aliases, path) && aliases[path] !== path;
  const prune = (node, path) => {
    if (typeof node === "string") return isAlias(path) ? undefined : node;
    if (Array.isArray(node)) return node.map((item, index) => prune(item, `${path}.${index}`));
    if (!node || typeof node !== "object") return node;
    const out = {};
    for (const [key, value] of Object.entries(node)) { const kept = prune(value, `${path}.${key}`); if (kept !== undefined) out[key] = kept; }
    return out;
  };
  const view = {};
  for (const key of Object.keys(labels)) if (groups.has(key)) view[key] = prune(labels[key], key);
  const oldPathsOf = path => oldPaths.get(path) ?? [];
  return { view, oldPathsOf, matches: (path, predicate) => predicate(path) || oldPathsOf(path).some(predicate) };
}

/** 遍歷 labels（含陣列），回傳 [點分路徑, 字串值]。 */
export function labelEntries(labels) {
  const out = [];
  const walk = (node, path) => {
    if (typeof node === "string") out.push([path, node]);
    else if (Array.isArray(node)) node.forEach((item, index) => walk(item, `${path}.${index}`));
    else if (node && typeof node === "object") for (const [key, value] of Object.entries(node)) walk(value, path ? `${path}.${key}` : key);
  };
  walk(labels, "");
  return out;
}

/** §8.4 黑名單。每個詞是 [顯示名, 正規式, { raw }?]（raw：比對原始值，否則先拿掉占位符）；含語境條件的詞以註解說明實作的近似方式。 */
export const BLACKLIST = {
  /** 同義詞（§8.3 有改用詞）。 */
  synonym: [
    ["行動（指待辦）", /行動/g], // 介面上的「行動」都指待辦，v2 已改名，殘留一律計入。
    ["看證據", /看證據/g],
    ["怎麼算的（抽屜名）", /怎麼算的/g],
    ["公式與來源", /公式與來源/g],
    ["數據", /數據/g],
    ["變化（兩期比較）", /變化/g], // 無法判斷語境，全部計入。
    ["N/A", /N\s?\/\s?A/g],
    ["—（空值）", /^\s*—\s*$/g, { raw: true }], // 只有「整個原始值」就是破折號時才算「當空值」（en dash「–」是區間符號，不算）。
    ["通路貢獻", /通路貢獻/g],
    ["口徑", /口徑/g],
    ["工作區", /工作區/g],
    ["資料就緒", /資料就緒/g],
    ["營收（指淨營收）", /(?<!淨)營收/g], // 前面沒有「淨」的「營收」。
  ],
  /** R2 禁用詞（主層不得出現；JSON 只在下載選單 downloads.* 例外）。 */
  jargon: [
    ["取分", /取分/g], ["快照", /快照/g], ["稽核", /稽核/g], ["fact／facts", /\bfacts?\b/gi], ["ID", /\bID\b/g], ["hash", /\bhash\b/gi], ["revision", /\brevision\b/gi], ["schema", /\bschema\b/gi],
    ["metric_version", /metric_version/gi], ["contribution-v1", /contribution-v1/gi], ["cohort", /\bcohort\b/gi], ["blocking", /\bblocking\b/gi], ["partial", /\bpartial\b/gi], ["null", /\bnull\b/gi], ["JSON", /\bJSON\b/g],
  ],
  /** 語氣（驚嘆號與表情符號另有獨立指標）。 */
  tone: [["我們", /我們/g], ["智慧", /智慧/g], ["洞察", /洞察/g], ["AI 建議", /AI\s?建議/g], ["立即", /立即/g], ["馬上", /馬上/g], ["開始吧", /開始吧/g], ["一鍵", /一鍵/g], ["輕鬆", /輕鬆/g], ["強大", /強大/g]],
  /** 情緒詞；「危險」只允許出現在「危險區」。 */
  emotion: [["惡化", /惡化/g], ["爆量", /爆量/g], ["暴跌", /暴跌/g], ["警告", /警告/g], ["危險（危險區以外）", /危險(?!區)/g]],
};

/** JSON 在匯出選單（V3-2c 起 exports.downloads.*；v2 舊鍵 downloads.*）允許。 */
const JARGON_EXEMPT = { JSON: path => path.startsWith("exports.downloads.") || path.startsWith("downloads.") };

/**
 * 同一句話的呈現變體必須使用同一組占位符：同一父物件內 `base` 與 `base + 後綴` 兩個鍵，後綴在下列清單中。
 * 表示「不同資料情境」的後綴（例如 WithYear、UnknownTime、Unavailable）本來就該有不同占位符，不列入。
 */
export const PLACEHOLDER_VARIANT_SUFFIXES = ["Aria", "Short", "Long", "Approx", "Budget", "Plural", "Singular", "Mobile", "Compact"];

/**
 * L1 子句長度（§3.2、§8.1）：去掉占位符、數字、單位、正負號與通路 alias 後，每個子句的 CJK 字數 ≤ 14。
 * PRD 只寫「頁面、區塊、列的標題」，沒有對應到 labels 鍵；V3-0 先限定在下列鍵（標題型字串）。
 * V3-2c 新位置：rules.*.headline、<分組>.sections.*、shell.nav.*.headline、<分組>.buttons.*（v2 舊鍵經 legacyAliases 也會比對）。
 */
export const L1_KEY_PATTERNS = [
  /^rules\.[^.]+\.title$/, /^sections\.[^.]+$/, /^nav\.[^.]+\.label$/, /^buttons\.[^.]+$/,
  /^rules\.[^.]+\.headline$/, /^[^.]+\.sections\.[^.]+$/, /^shell\.nav\.[^.]+\.headline$/, /^[^.]+\.buttons\.[^.]+$/,
];
export const L1_MAX_CJK = 14;

const ARROW_RE = /[→↗▸▾]/g;
const CIRCLED_RE = /[①-⑳]/g;
const DECORATIVE_RE = /[★☆ⓘ●]/g;
const EXCLAMATION_RE = /[！!]/g;
/** 表情符號；箭頭、圈數字與裝飾字元已有各自的指標，不重複計。 */
const EMOJI_RE = /(?![→↗▸▾★☆ⓘ●①-⑳])\p{Extended_Pictographic}/gu;
const ALL_CAPS_RE = /^[A-Z ]{4,}$/;
const CJK_RE = /[㐀-䶿一-鿿豈-﫿]/g;
const NUMBER_UNIT_RE = /[0-9０-９]+(?:[.,][0-9]+)*|個百分點|百分點|萬|億|元|[%％+\-−±]/g;
const CLAUSE_SPLIT_RE = /[，,；;。：:！!？?｜·（）()\n]/;

const count = (text, re) => (text.match(re) ?? []).length;
const placeholders = text => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]))].sort();

/** 通路 alias 的各段（例如「官網 · DTC」→ 官網、DTC），L1 計字時剔除。 */
export function channelAliasTerms(labels) {
  const alias = labels.data?.demoChannelAlias ?? labels.demoChannelAlias ?? {};
  return [...new Set([...Object.keys(alias), ...Object.values(alias).flatMap(value => value.split(/\s*·\s*/))])].filter(Boolean).sort((a, b) => b.length - a.length);
}

/** 單一字串的 L1 子句 CJK 字數。 */
export function l1ClauseLengths(text, aliasTerms = []) {
  let stripped = text.replace(/\{\w+\}/g, " ");
  for (const term of aliasTerms) stripped = stripped.split(term).join(" ");
  stripped = stripped.replace(NUMBER_UNIT_RE, " ");
  return stripped.split(CLAUSE_SPLIT_RE).map(clause => count(clause, CJK_RE)).filter(length => length > 0);
}

/**
 * 掃描 labels。metrics 為棘輪指標（copy-style 逐項比上限；V3-2 目標全部為 0），details 列出每一筆，方便改寫。
 * 傳入 meta（labels 模組）時只掃新分組、略過 v2 alias，見 labelScope。
 * @param {Record<string, unknown>} labels
 * @param {Parameters<typeof labelScope>[1]} [meta]
 */
export function scanLabels(labels, meta) {
  const { view, matches } = labelScope(labels, meta);
  const whitelisted = path => matches(path, isWhitelisted);
  const entries = labelEntries(view).filter(([path]) => !whitelisted(path));
  const aliasTerms = channelAliasTerms(labels);
  const details = { noticePrefix: [], noticeAnywhere: [], arrows: [], circledNumbers: [], decorativeChars: [], exclamations: [], emoji: [], allCaps: [], pipes: [], blacklist: { synonym: [], jargon: [], tone: [], emotion: [] }, placeholderMalformed: [], placeholderVariantMismatch: [], l1ClauseOverLimit: [] };
  const metrics = { noticePrefix: 0, noticeAnywhere: 0, arrows: 0, circledNumbers: 0, decorativeChars: 0, exclamations: 0, emoji: 0, allCaps: 0, pipes: 0, blacklistSynonym: 0, blacklistJargon: 0, blacklistTone: 0, blacklistEmotion: 0, placeholderMalformed: 0, placeholderVariantMismatch: 0, l1ClauseOverLimit: 0 };
  const add = (key, path, value, n = 1) => { if (n > 0) { metrics[key] += n; details[key].push(`${path}: ${value}`); } };

  for (const [path, value] of entries) {
    /** 占位符名稱（例如 {datasetHash}）不是可見文字，黑名單比對前先拿掉。 */
    const visible = value.replace(/\{\w+\}/g, " ");
    if (value.trim().startsWith("注意：")) add("noticePrefix", path, value);
    add("noticeAnywhere", path, value, count(value, /注意：/g));
    add("arrows", path, value, count(value, ARROW_RE));
    add("circledNumbers", path, value, count(value, CIRCLED_RE));
    add("decorativeChars", path, value, count(value, DECORATIVE_RE));
    add("exclamations", path, value, count(value, EXCLAMATION_RE));
    add("emoji", path, value, count(value, EMOJI_RE));
    if (ALL_CAPS_RE.test(value.trim())) add("allCaps", path, value);
    if (value.includes("｜")) add("pipes", path, value);
    for (const [category, terms] of Object.entries(BLACKLIST)) for (const [name, re, options] of terms) {
      if (JARGON_EXEMPT[name] && matches(path, JARGON_EXEMPT[name])) continue;
      const n = count(options?.raw ? value : visible, re);
      if (n > 0) { metrics[`blacklist${category[0].toUpperCase()}${category.slice(1)}`] += n; details.blacklist[category].push(`${name} ×${n} ${path}: ${value}`); }
    }
    if (/[{}｛｝]/.test(value.replace(/\{\w+\}/g, "")) || value.includes("${")) add("placeholderMalformed", path, value);
    if (matches(path, candidate => L1_KEY_PATTERNS.some(re => re.test(candidate)))) {
      const over = l1ClauseLengths(value, aliasTerms).filter(length => length > L1_MAX_CJK);
      if (over.length) add("l1ClauseOverLimit", path, `${value}（子句字數 ${over.join("、")}）`, over.length);
    }
  }

  // 占位符變體一致性：在原始樹上比對兄弟鍵（白名單子樹略過）。
  const visit = (node, path) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    for (const [key, value] of Object.entries(node)) {
      const childPath = path ? `${path}.${key}` : key;
      if (typeof value === "string") {
        if (whitelisted(childPath)) continue;
        for (const suffix of PLACEHOLDER_VARIANT_SUFFIXES) {
          const variant = node[`${key}${suffix}`];
          if (typeof variant === "string" && placeholders(value).join() !== placeholders(variant).join()) add("placeholderVariantMismatch", `${childPath} ↔ ${key}${suffix}`, `{${placeholders(value).join(",")}} ≠ {${placeholders(variant).join(",")}}`);
        }
      } else visit(value, childPath);
    }
  };
  visit(view, "");
  return { metrics, details };
}
