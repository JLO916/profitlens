// V3-10 上線檢查（docs/revamp-v3/06_BATCHES.md「版本 3.0.0；RELEASES（含破壞性變更：Excel 工作表改名）、README」；PRD §8.9 改名溝通、§11.8 相容性）：版本號與發布文件。
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { labels } from "@/i18n";

const read = (path: string) => readFileSync(resolve(path), "utf8");
const releases = read("docs/RELEASES.md");
const readme = read("README.md");
/** RELEASES 的 v3.0.0 段落：從「## v3.0.0」到下一個「## v2.0.0」。 */
const v3 = releases.slice(releases.indexOf("## v3.0.0"), releases.indexOf("## v2.0.0"));
/** README 某個「## 標題」到下一個「## 」之間的內容。 */
const readmeSection = (heading: string) => { const start = readme.indexOf(`## ${heading}`); expect(start, heading).toBeGreaterThan(-1); return readme.slice(start, readme.indexOf("\n## ", start + 1)); };
const sheets = labels.exports.excel.sheets;

describe("版本 3.0.0（package.json 與 lockfile 只改 version，依賴不變）", () => {
  it("package.json、package-lock.json 的根與 packages[\"\"] 都是 3.0.0；名稱仍是 profitlens（技術識別不改，D-V3-25）", () => {
    const pkg = JSON.parse(read("package.json"));
    const lock = JSON.parse(read("package-lock.json"));
    expect(pkg.name).toBe("profitlens");
    expect(pkg.version).toBe("3.0.0");
    expect(lock.version).toBe("3.0.0");
    expect(lock.packages[""].version).toBe("3.0.0");
    expect(lock.packages[""].dependencies).toEqual(pkg.dependencies);
    expect(lock.packages[""].devDependencies).toEqual(pkg.devDependencies);
  });
});

describe("RELEASES v3.0.0 段落（08_RELAUNCH §5 範本＋破壞性變更）", () => {
  it("在 v2.0.0 之前（新的在上），日期寫尚未發布，五個小節依序是給使用者、不變的事、破壞性變更、已知限制、驗收", () => {
    expect(releases.indexOf("## v3.0.0")).toBeGreaterThan(-1);
    expect(releases.indexOf("## v3.0.0")).toBeLessThan(releases.indexOf("## v2.0.0"));
    expect(v3).toContain("尚未發布（待 H4 與正式站檢查）");
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
  it("發布紀錄寫最新 v3.0.0（尚未發布），不再寫「最新：v2.0.0」；正式站仍是 v2.0.0 的事實另寫一句", () => {
    expect(readme).toContain("v3.0.0");
    expect(readme).not.toContain("最新：v2.0.0");
    expect(readmeSection("發布紀錄")).toContain("最新：v3.0.0（尚未發布");
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

describe("ENGINEERING 的版本與備份版本對齊 v3.0.0／v5", () => {
  it("寫出 package.json 3.0.0、備份 profitlens-workspace-v5，並連到 v3 各批驗收", () => {
    const engineering = read("docs/ENGINEERING.md");
    expect(engineering).toContain("**3.0.0**");
    expect(engineering).toContain("profitlens-workspace-v5");
    expect(engineering).toContain("../verification/revamp-v3-V3-9b-acceptance.md");
  });
});
