// V3-10 上線檢查（docs/revamp-v3/06_BATCHES.md「版本 3.0.0；RELEASES（含破壞性變更：Excel 工作表改名）、README」；PRD §8.9 改名溝通、§11.8 相容性）：版本號與發布文件。
// V4-11 收尾（docs/revamp-v4/06_BATCHES.md「V4-11」；D-V4-1＝B）：版本改為 4.0.0，RELEASES 加 v4.0.0 段，v3.0.0 段的斷言照舊。
// 2026-10-14 使用者同意「正式上線」：v4.0.0 段改為已發布（日期、deployment、tag、正式站檢查；H6、開檔檢查、Skew Protection 據實寫未完成）。
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { labels } from "@/i18n";

const read = (path: string) => readFileSync(resolve(path), "utf8");
const releases = read("docs/RELEASES.md");
const readme = read("README.md");
/** RELEASES 的 v3.0.0 段落：從「## v3.0.0」到下一個「## v2.0.0」。 */
const v3 = releases.slice(releases.indexOf("## v3.0.0"), releases.indexOf("## v2.0.0"));
/** RELEASES 的 v4.0.0 段落（V4-11）：從「## v4.0.0」到下一個「## v3.0.0」。 */
const v4 = releases.slice(releases.indexOf("## v4.0.0"), releases.indexOf("## v3.0.0"));
/** v4.0.0 段落中某個「### 標題」到下一個「### 」（或段落結尾）之間的內容。 */
const v4Section = (heading: string) => { const start = v4.indexOf(`### ${heading}`); expect(start, heading).toBeGreaterThan(-1); const next = v4.indexOf("\n### ", start + 1); return v4.slice(start, next === -1 ? undefined : next); };
/** README 某個「## 標題」到下一個「## 」之間的內容。 */
const readmeSection = (heading: string) => { const start = readme.indexOf(`## ${heading}`); expect(start, heading).toBeGreaterThan(-1); return readme.slice(start, readme.indexOf("\n## ", start + 1)); };
const sheets = labels.exports.excel.sheets;

describe("版本 4.0.0（V4-11，D-V4-1＝B；package.json 與 lockfile 只改 version，依賴不變）", () => {
  it("package.json、package-lock.json 的根與 packages[\"\"] 都是 4.0.0；名稱仍是 profitlens（技術識別不改，D-V3-25）", () => {
    const pkg = JSON.parse(read("package.json"));
    const lock = JSON.parse(read("package-lock.json"));
    expect(pkg.name).toBe("profitlens");
    expect(pkg.version).toBe("4.0.0");
    expect(lock.version).toBe("4.0.0");
    expect(lock.packages[""].version).toBe("4.0.0");
    expect(lock.packages[""].dependencies).toEqual(pkg.dependencies);
    expect(lock.packages[""].devDependencies).toEqual(pkg.devDependencies);
  });
});

describe("RELEASES v4.0.0 段落（2026-10-14 上線）", () => {
  it("在 v3.0.0 之前（新的在上），標題寫發布日期；開頭寫明 deployment、tag、正式站檢查，以及 H6、人工開檔檢查、Skew Protection 未完成，部署要當次同意", () => {
    expect(releases.indexOf("## v4.0.0（2026-10-14，Revamp v4）")).toBeGreaterThan(-1);
    expect(releases.indexOf("## v4.0.0")).toBeLessThan(releases.indexOf("## v3.0.0"));
    const intro = v4.slice(0, v4.indexOf("\n### "));
    for (const text of ["發布日期：2026-10-14", "`dpl_8b48r3atVjzRA49DFHKZyQhao4BC`", "`v4.0.0`", "`872662d`", "13 項 HTTP 全部通過", "Skew Protection", "D-V4-44", "H6", "人工開檔檢查", "D-V4-28", "`625bfa5`"]) expect(intro, text).toContain(text);
    const headings = [...v4.matchAll(/^### (.+)$/gm)].map(match => match[1]);
    expect(headings).toEqual(["給使用者", "不變的事", "匯出格式的變更", "相容性", "已知限制", "驗收"]);
  });

  it("匯出格式的變更：PDF 頁數（老闆 1／標準 3／客戶 3，v3 為 1／2／2）、PPT 每版 2 張、Excel 新工作表與版本列名取自 labels、Markdown 九項差額表", () => {
    const formats = v4Section("匯出格式的變更");
    expect(formats).toContain("老闆一頁版 1、標準版 2、客戶報告版 2");
    expect(formats).toContain("老闆一頁版 1、標準版 3、客戶報告版 3");
    expect(formats).toContain("三個版本各 1 張");
    expect(formats).toContain("三個版本各 2 張");
    expect(formats).toContain("老闆一頁版 2、標準版 8、客戶報告版 8");
    expect(formats).toContain(`「${labels.exports.chartsV4.excel.sheet}」`);
    expect(formats).toContain(`「${labels.exports.variantsV3.pnlSheet}」之前`);
    expect(formats).toContain(`「${labels.exports.chartsV4.excel.versionRow}」`);
    expect(formats).toContain("九項差額表");
    expect(formats).toContain("U+2212");
  });

  it("相容性：備份字串仍是 v5、選填匯入時間；v3.0.0 讀精靈匯入後的備份會拒絕（INVALID_WORKSPACE_FORMAT）且不取代目前資料；CSV、JSON 不變", () => {
    const compat = v4Section("相容性");
    for (const text of ["profitlens-workspace-v5", "v1–v5", "v3.0.0", "INVALID_WORKSPACE_FORMAT", "不會被取代", "D-V4-13"]) expect(compat, text).toContain(text);
    expect(v4Section("給使用者")).toContain("payload.active.imported_at");
  });

  it("不變的事：三個指標版本、golden 固定答案、資料不上傳、AI 公開版未啟用、既有字串與 testid", () => {
    const same = v4Section("不變的事");
    for (const text of ["contribution-v1", "assist-kpi-v1", "breakeven-mer-v1", "`625bfa5`", "255.00", "−315.00", "284.00／264.00", "19.70", "資料不上傳", "ENABLE_LIVE_AI=false", "chart_clicked", "chart_table_opened", "2,581", "data-testid"]) expect(same, text).toContain(text);
  });

  it("已知限制寫出尚未部署、H6、人工開檔檢查、CLS 0.05、不併入 v4 的 D-V3-36／37", () => {
    const known = v4Section("已知限制");
    for (const text of ["尚未部署", "Skew Protection", "H6", "人工開檔檢查", "CLS", "D-V3-36", "D-V3-37"]) expect(known, text).toContain(text);
  });

  it("驗收連到 V4-0a–V4-11 的驗收文件；V4-10、V4-11 之外連結的檔案都存在（這兩份由主流程收尾產生）", () => {
    const links = [...v4.matchAll(/\]\(\.\.\/(verification\/[^)]+)\)/g)].map(match => match[1]);
    for (const batch of ["V4-0a", "V4-0b", "V4-1", "V4-2", "V4-3a", "V4-3b", "V4-3c", "V4-4", "V4-5", "V4-6", "V4-7a", "V4-7b", "V4-7c", "V4-8a", "V4-8b", "V4-9a", "V4-9b", "V4-10", "V4-11"]) expect(links).toContain(`verification/revamp-v4-${batch}-acceptance.md`);
    for (const link of links.filter(path => !/revamp-v4-V4-1[01]-acceptance\.md$/.test(path))) expect(existsSync(resolve(link)), link).toBe(true);
    const docs = [...v4.matchAll(/\]\((revamp-v[34]\/[^)]+)\)/g)].map(match => match[1]);
    expect(docs.length).toBeGreaterThan(0);
    for (const doc of docs) expect(existsSync(resolve("docs", doc)), doc).toBe(true);
  });

  it("v4 段落遵守文案規則：沒有「注意：」前綴、箭頭與驚嘆號", () => {
    for (const banned of ["注意：", "→", "←", "↗", "▸", "⇒", "！", "!"]) expect(v4, banned).not.toContain(banned);
  });
});

describe("RELEASES v3.0.0 段落（08_RELAUNCH §5 範本＋破壞性變更）", () => {
  it("在 v2.0.0 之前（新的在上），日期寫尚未發布，五個小節依序是給使用者、不變的事、破壞性變更、已知限制、驗收", () => {
    expect(releases.indexOf("## v3.0.0")).toBeGreaterThan(-1);
    expect(releases.indexOf("## v3.0.0")).toBeLessThan(releases.indexOf("## v2.0.0"));
    // 2026-10-08 使用者同意後部署正式站；H4 仍未執行，tag 待 H4。
    expect(v3).toContain("發布日期：2026-10-08");
    expect(v3).toContain("H4");
    const headings = [...v3.matchAll(/^### (.+)$/gm)].map(match => match[1]);
    const order = ["給使用者", "不變的事", "破壞性變更", "已知限制", "驗收"].map(name => headings.indexOf(name));
    expect(order.every(index => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("破壞性變更：Excel 工作表舊名與新名的對照（新名取自 labels），新增的管理損益表工作表、備份 v5、分析 CSV 與決策 CSV 的新增列與欄", () => {
    const breaking = v3.slice(v3.indexOf("### 破壞性變更"), v3.indexOf("### ", v3.indexOf("### 破壞性變更") + 1));
    expect(breaking).toContain(`| 行動 | ${sheets.actions} |`);
    expect(breaking).toContain(`| 口徑 | ${sheets.basis} |`);
    for (const unchanged of [sheets.summary, sheets.channels, sheets.bridge, sheets.products]) expect(breaking).toContain(`「${unchanged}」`);
    expect(breaking).toContain(`「${labels.exports.variantsV3.pnlSheet}」`);
    expect(breaking).toContain("profitlens-workspace-v5");
    expect(breaking).toContain("v1–v4");
    expect(breaking).toContain("`breakeven_mer`");
    expect(breaking).toContain("ad_decision");
    expect(breaking).toContain(labels.actions.adDecisionV3.csvColumn);
    // 名詞改名引用名詞表（扣廣告前貢獻、金額基準、計算與來源、待辦）。
    expect(breaking).toContain("revamp-v3/GLOSSARY.md");
    for (const term of ["扣廣告前貢獻", "金額基準", "計算與來源", "待辦", "指標定義"]) expect(breaking).toContain(term);
  });

  it("不變的事：contribution-v1、golden 固定答案、資料不上傳、AI 公開版未啟用、v1–v5 備份都能還原", () => {
    const same = v3.slice(v3.indexOf("### 不變的事"), v3.indexOf("### 破壞性變更"));
    for (const text of ["contribution-v1", "255.00", "−315.00", "284.00／264.00", "19.70", "資料不上傳", "ENABLE_LIVE_AI=false", "v1、v2、v3、v4、v5"]) expect(same).toContain(text);
  });

  it("已知限制列出 F15／F16 延後、待拍板 D-V3-26～35、示範資料看不到去年同期線、決策匯出很大、H4 未執行", () => {
    const known = v3.slice(v3.indexOf("### 已知限制"), v3.indexOf("### 驗收"));
    for (const text of ["F15", "F16", "D-V3-26", "D-V3-35", "去年同期", "決策匯出", "H4"]) expect(known).toContain(text);
  });

  it("驗收連到每一批的驗收文件，連結的檔案都存在（V3-10 的驗收文件在本批收尾產生）", () => {
    const links = [...v3.matchAll(/\]\(\.\.\/(verification\/[^)]+)\)/g)].map(match => match[1]);
    for (const batch of ["V3-0", "V3-1", "V3-2a", "V3-2b", "V3-2c", "V3-3", "V3-4a", "V3-4b", "V3-5", "V3-6", "V3-7", "V3-8", "V3-9a", "V3-9b", "V3-10"]) expect(links).toContain(`verification/revamp-v3-${batch}-acceptance.md`);
    for (const link of links.filter(path => !path.endsWith("revamp-v3-V3-10-acceptance.md"))) expect(existsSync(resolve(link)), link).toBe(true);
  });

  it("v3 段落遵守 §8.4 文案規則：沒有「注意：」前綴、箭頭與驚嘆號", () => {
    for (const banned of ["注意：", "→", "←", "↗", "▸", "⇒", "！", "!"]) expect(v3, banned).not.toContain(banned);
  });
});

describe("README（v3.0.0 尚未發布；步驟對齊 V3-8 的空狀態與匯入精靈）", () => {
  it("發布紀錄寫最新 v3.0.0（2026-10-08），不再寫「最新：v2.0.0」；正式站已是 v3.0.0 另寫一句", () => {
    expect(readme).toContain("v3.0.0");
    expect(readme).not.toContain("最新：v2.0.0");
    expect(readmeSection("發布紀錄")).toContain("最新：v3.0.0（2026-10-08）");
    expect(readmeSection("發布紀錄")).toContain("正式站已是 v3.0.0（2026-10-08）");
  });

  it("首圖是 v3 示範資料截圖，README 引用的本機圖片都存在", () => {
    const images = [...readme.matchAll(/<img src="([^"]+)"/g)].map(match => match[1]);
    expect(images).toContain("docs/images/overview-1440-v3.png");
    for (const image of images) expect(existsSync(resolve(image)), image).toBe(true);
  });

  it("「用自己的資料」寫出空狀態的「匯入資料」按鈕與精靈四步（步驟名取自 labels）", () => {
    const own = readmeSection("用自己的資料");
    expect(own).toContain(`「${labels.shell.buttons.importData}」`);
    expect(own).toContain(`「${labels.shell.dataStatus.importNew}」`);
    for (const step of labels.importWizard.steps) expect(own).toContain(`**${step}**`);
  });

  it("「30 秒試用」用畫面上的按鈕與區塊名稱（載入示範資料、本期三件事、看明細、計算與來源）", () => {
    const trial = readmeSection("30 秒試用");
    for (const name of [labels.shell.buttons.loadDemo, labels.overview.sections.topThree, labels.evidence.buttons.viewEvidence, labels.evidence.sections.evidence]) expect(trial).toContain(`「${name}」`);
    expect(trial).toContain("虛構");
  });

  it("「功能一覽」依側欄四組列出頁面，並寫出 v3 的改名（引用名詞表）", () => {
    const features = readmeSection("功能一覽");
    for (const group of Object.values(labels.shell.sidebarV3.groups).filter(name => name !== labels.shell.sidebarV3.groups.developer)) expect(features).toContain(`| ${group} |`);
    for (const id of ["overview", "diagnosis", "products", "scenarios", "actions", "meeting", "data"] as const) expect(features).toContain(`| ${labels.shell.nav[id].headline} |`);
    expect(features).toContain("docs/revamp-v3/GLOSSARY.md");
    for (const term of ["扣廣告前貢獻", "指標定義", "金額基準", "計算與來源", "待辦", "v5"]) expect(features).toContain(term);
  });
});

describe("README 與 ENGINEERING 的 v4.0.0（2026-10-14 上線）", () => {
  it("「功能一覽」寫 v4.0.0 已上線與正式站網址，並提到 Excel 新工作表（名稱取自 labels）", () => {
    const features = readmeSection("功能一覽");
    expect(features).toContain("v4.0.0（2026-10-14 上線，正式站 https://profitlens-tau.vercel.app）");
    expect(features).toContain(`「${labels.exports.chartsV4.excel.sheet}」`);
  });

  it("ENGINEERING 寫出 V4-11 起的版本 4.0.0 並連到 RELEASES", () => {
    const engineering = read("docs/ENGINEERING.md");
    expect(engineering).toContain("**4.0.0**");
    expect(engineering).toContain("v4.0.0 已於 2026-10-14 上線");
  });
});

describe("ENGINEERING 的版本與備份版本對齊 v3.0.0／v5", () => {
  it("寫出 package.json 3.0.0、備份 profitlens-workspace-v5，並連到 v3 各批驗收", () => {
    const engineering = read("docs/ENGINEERING.md");
    expect(engineering).toContain("**3.0.0**");
    expect(engineering).toContain("profitlens-workspace-v5");
    expect(engineering).toContain("../verification/revamp-v3-V3-9b-acceptance.md");
  });
});
