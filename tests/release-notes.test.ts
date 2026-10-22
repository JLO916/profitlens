// V3-10 上線檢查（docs/revamp-v3/06_BATCHES.md「版本 3.0.0；RELEASES（含破壞性變更：Excel 工作表改名）、README」；PRD §8.9 改名溝通、§11.8 相容性）：版本號與發布文件。
// V4-11 收尾（docs/revamp-v4/06_BATCHES.md「V4-11」；D-V4-1＝B）：版本改為 4.0.0，RELEASES 加 v4.0.0 段，v3.0.0 段的斷言照舊。
// 2026-10-14 使用者同意「正式上線」：v4.0.0 段改為已發布（日期、deployment、tag、正式站檢查；H6、開檔檢查、Skew Protection 據實寫未完成）。
// V41-5 收尾（docs/revamp-v4.1/06_BATCHES.md「V41-5」；D-V41-1＝A；使用者 2026-10-15「H7 通過、V41-5 收尾、正式上線」）：版本改為 4.1.0，RELEASES 加 v4.1.0 段，
// README 發布紀錄改成 v4.1.0、「30 秒試用」與「用自己的資料」加說明頁連結（連結文字取自 guideLabels），ENGINEERING 加 4.1.0、docs/revamp-v4.1/ 與 v4.1 驗收；v4.0.0、v3、v2 的斷言照舊。
// 發布 commit（main 與 tag 指向的 commit）寫上線前的狀態：README 寫正式站仍是 v4.0.0、RELEASES 的發布方式寫成步驟、正式站檢查一行是 PROD_PLACEHOLDER；
// 部署與正式站檢查通過後的收尾 commit（9bc2241）一起改寫 README 那一句，當時以那一句判斷是否已上線，測試要求正式站檢查一行有 deployment 與 launch-check-production.json、V41-5 驗收文件存在。
// v4.1.0 段落記的是發布當時的事實（11 個功能區、44 張截圖、18／21 張、標題文字），直接寫數字與字串，不讀之後會變的媒體清單與 guideLabels。
// V41-3（docs/revamp-v4.1/06_BATCHES.md「V41-3」；D-V41-6 由 B 改 A；使用者 2026-10-15「製作示範影片含字幕」「好，影片做完後部署正式上線」，版本號選 4.1.1）：版本改為 4.1.1，RELEASES 加 v4.1.1 段，
// README 發布紀錄改成 v4.1.1、「30 秒試用」加一行示範影片（標題取自 guideLabels），ENGINEERING 加 4.1.1、V41-3 驗收與影片的 GUIDE_MEDIA=check／write。
// v4.1.0 已於 2026-10-15 上線（9bc2241），v4.1.1 起它的段落一律照上線後的寫法斷言，不再看 README 的正式站那一句（那一句改寫成 v4.1.1 的上線前後）。
// v4.1.1 的上線前後照 v4.1.0 的做法：發布 commit 寫上線前的狀態（README 寫正式站仍是 v4.1.0、發布方式寫成步驟、正式站檢查一行是 PROD_PLACEHOLDER）；
// 部署與正式站檢查通過後的收尾 commit 改寫 README 那一句，這時 v411Launched 為真，要求正式站檢查一行有 deployment 與 V41-3 的 launch-check-production.json、V41-3 驗收文件存在。
// v4.1.1 段落記的也是發布當時的事實（3 支影片的長度與大小、44 張截圖），直接寫數字與字串，不讀之後會變的媒體清單。
// V41-6（docs/revamp-v4.1/06_BATCHES.md「V41-6」；D-V41-26–30 依建議值；使用者 2026-10-15 在 v4.1.1 上線後回報範例檔無法下載、側欄入口改名「操作導覽」並加問號圖示；版本號依 D-V41-29 為 4.1.2）：版本改為 4.1.2，RELEASES 加 v4.1.2 段，
// README 發布紀錄改成 v4.1.2、正式站那一句改寫成 v4.1.2 的上線前後，ENGINEERING 加 4.1.2、V41-6 驗收、tests/vercelignore.test.ts 的護欄與 launch-check 補充 19 項。
// v4.1.1 已於 2026-10-15 上線（66c241a），V41-6 起它的段落一律照上線後的寫法斷言，不再看 README 的正式站那一句（那一句改寫成 v4.1.2 的上線前後）。
// v4.1.2 的上線前後照 v4.1.1 的做法：發布 commit 寫上線前的狀態（README 寫正式站仍是 v4.1.1、發布方式寫成步驟、正式站檢查一行是 PROD_PLACEHOLDER）；
// 部署與正式站檢查通過後的收尾 commit 改寫 README 那一句（正式站已是 v4.1.2（日期）），這時 v412Launched 為真，要求正式站檢查一行有 deployment 與 V41-6 的 launch-check-production.json、V41-6 驗收文件存在。
// v4.1.2 段落記的是發布當時的事實（5 個檔、.vercelignore 的兩行、補充 19 項、3 張截圖與 3 支影片重拍、42 張允許變動的畫面），直接寫數字與字串；「使用說明」「操作導覽」是改名前後的值，直接寫字串，不讀 labels（labels 之後再改名也不該改這一段）。
// v4.1.3（使用者 2026-10-22「目前的進度先做正式推送上線」；D-V42-34＝A，版本號 4.1.3 修正版）：v4.2 進行中的分支 revamp/v4.2 的現況（V42-0 基準與護欄、V42-1a 通路設定模組與備份的選填鍵、插入批 V42-G1 說明首頁改寫）做成 v4.1.3，
// 版本改為 4.1.3，RELEASES 加 v4.1.3 段，README 發布紀錄改成 v4.1.3、正式站那一句改寫成 v4.1.3 的上線前後，ENGINEERING 加 4.1.3、docs/revamp-v4.2/ 與 V42-0、V42-1a、V42-G1 驗收；沒有 src 改動。
// v4.1.2 已於 2026-10-16 上線（00584a5），v4.1.3 起它的段落一律照上線後的寫法斷言，不再看 README 的正式站那一句（那一句改寫成 v4.1.3 的上線前後）。
// v4.1.3 的上線前後照 v4.1.2 的做法：發布 commit 寫上線前的狀態（README 寫正式站仍是 v4.1.2、發布方式寫成步驟、正式站檢查一行是 PROD_PLACEHOLDER）；
// 部署與正式站檢查通過後的收尾 commit 改寫 README 那一句（正式站已是 v4.1.3（2026-10-22）），這時 v413Launched 為真，要求正式站檢查一行有 deployment 與 V42-G1 的 launch-check-production.json；三份驗收文件（V42-0、V42-1a、V42-G1）由主流程寫，上線前後都要存在。
// v4.1.3 段落記的是發布當時的事實（改寫稿被改掉的 12 處、單元測試 172 檔 3,628 個、E2E 1,143／0／29、64 張中說明首頁 4 張、47 件、13＋19、首載 521,487 與門檻 527,897、說明頁 131,466、390 五個 TBT 中位數），直接寫數字與字串，不讀之後會變的 guideLabels。
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { labels } from "@/i18n";
import { guideLabels } from "@/i18n/guide.zh-TW";
import { GUIDE_AREA_CODES, GUIDE_AREAS, resolveUiRefs } from "@/application/guide";

const read = (path: string) => readFileSync(resolve(path), "utf8");
const releases = read("docs/RELEASES.md");
const readme = read("README.md");
/** RELEASES 的 v3.0.0 段落：從「## v3.0.0」到下一個「## v2.0.0」。 */
const v3 = releases.slice(releases.indexOf("## v3.0.0"), releases.indexOf("## v2.0.0"));
/** RELEASES 的 v4.0.0 段落（V4-11）：從「## v4.0.0」到下一個「## v3.0.0」。 */
const v4 = releases.slice(releases.indexOf("## v4.0.0"), releases.indexOf("## v3.0.0"));
/** RELEASES 的 v4.1.0 段落（V41-5）：從「## v4.1.0」到下一個「## v4.0.0」。 */
const v41 = releases.slice(releases.indexOf("## v4.1.0"), releases.indexOf("## v4.0.0"));
/** RELEASES 的 v4.1.1 段落（V41-3）：從「## v4.1.1」到下一個「## v4.1.0」。 */
const v411 = releases.slice(releases.indexOf("## v4.1.1"), releases.indexOf("## v4.1.0"));
/** v4.1.1 段落中某個「### 標題」到下一個「### 」（或段落結尾）之間的內容。 */
const v411Section = (heading: string) => { const start = v411.indexOf(`### ${heading}`); expect(start, heading).toBeGreaterThan(-1); const next = v411.indexOf("\n### ", start + 1); return v411.slice(start, next === -1 ? undefined : next); };
/** RELEASES 的 v4.1.2 段落（V41-6）：從「## v4.1.2」到下一個「## v4.1.1」。 */
const v412 = releases.slice(releases.indexOf("## v4.1.2"), releases.indexOf("## v4.1.1"));
/** v4.1.2 段落中某個「### 標題」到下一個「### 」（或段落結尾）之間的內容。 */
const v412Section = (heading: string) => { const start = v412.indexOf(`### ${heading}`); expect(start, heading).toBeGreaterThan(-1); const next = v412.indexOf("\n### ", start + 1); return v412.slice(start, next === -1 ? undefined : next); };
/** RELEASES 的 v4.1.3 段落（V42-0、V42-1a、V42-G1 的現況上線）：從「## v4.1.3」到下一個「## v4.1.2」。 */
const v413 = releases.slice(releases.indexOf("## v4.1.3"), releases.indexOf("## v4.1.2"));
/** v4.1.3 段落中某個「### 標題」到下一個「### 」（或段落結尾）之間的內容。 */
const v413Section = (heading: string) => { const start = v413.indexOf(`### ${heading}`); expect(start, heading).toBeGreaterThan(-1); const next = v413.indexOf("\n### ", start + 1); return v413.slice(start, next === -1 ? undefined : next); };
/** v4.1.0 段落中某個「### 標題」到下一個「### 」（或段落結尾）之間的內容。 */
const v41Section = (heading: string) => { const start = v41.indexOf(`### ${heading}`); expect(start, heading).toBeGreaterThan(-1); const next = v41.indexOf("\n### ", start + 1); return v41.slice(start, next === -1 ? undefined : next); };
/** v4.1.0 發布時 11 個功能區頁的標題（{ui:…} 已換成介面原字串；GUIDE_AREAS 的順序）。 */
const V41_AREA_TITLES = ["開始使用：看懂畫面與期間", "匯入資料", "經營總覽", "通路健檢", "商品毛利", "假設試算", "待辦", "會議紀錄與投影", "資料來源", "計算與來源、指標定義", "匯出、儲存與備份"];
/** 正式站檢查的輸出（docs/revamp-v4.1/06_BATCHES.md V41-5 第 5 項）與 V41-5 驗收文件：上線後的收尾 commit 才產生。 */
const V41_PROD_LAUNCH_CHECK = "verification/revamp-v41/V41-5/launch-check-production.json";
const V41_5_ACCEPTANCE = "verification/revamp-v41-V41-5-acceptance.md";
/** 正式站檢查的輸出與 V41-3 驗收文件（v4.1.1）：V41-3 驗收文件由主流程寫，正式站檢查的輸出在上線後的收尾 commit 才產生。 */
const V411_PROD_LAUNCH_CHECK = "verification/revamp-v41/V41-3/launch-check-production.json";
const V41_3_ACCEPTANCE = "verification/revamp-v41-V41-3-acceptance.md";
/** source-map-js 修正後的 npm audit（commit 5072879 一起提交的證據，之後不再改）。 */
const V411_AUDIT = "verification/revamp-v41/V41-3/npm-audit-after-source-map-js.json";
/** 正式站檢查的輸出與 V41-6 驗收文件（v4.1.2）：V41-6 驗收文件由主流程寫，正式站檢查的輸出在上線後的收尾 commit 才產生。 */
const V412_PROD_LAUNCH_CHECK = "verification/revamp-v41/V41-6/launch-check-production.json";
const V41_6_ACCEPTANCE = "verification/revamp-v41-V41-6-acceptance.md";
/** 正式站檢查的輸出（v4.1.3；上線後的收尾 commit 才產生）與 v4.1.3 的三份驗收文件（V42-0、V42-1a、V42-G1 由主流程寫，上線前就存在）。 */
const V413_PROD_LAUNCH_CHECK = "verification/revamp-v42/V42-G1/launch-check-production.json";
const V42_0_ACCEPTANCE = "verification/revamp-v42-V42-0-acceptance.md";
const V42_1A_ACCEPTANCE = "verification/revamp-v42-V42-1a-acceptance.md";
const V42_G1_ACCEPTANCE = "verification/revamp-v42-V42-G1-acceptance.md";
/** README 已寫「正式站已是 v4.1.3（日期）」＝v4.1.3 部署與正式站檢查通過後的收尾 commit。v4.1.2 已於 2026-10-16 上線（00584a5），不再有上線前的狀態。 */
const v413Launched = readme.includes("正式站已是 v4.1.3（2026-10-22）");
/** 功能區頁的標題（{ui:…} 換成介面原字串），例如 import＝「匯入資料」。 */
const areaTitle = (code: (typeof GUIDE_AREA_CODES)[number]) => resolveUiRefs(guideLabels.guide.areas[code].title, labels);
/** v3、v4、v4.1、v4.1.1 段落共用的文案規則：沒有「注意：」前綴、箭頭與驚嘆號。 */
const BANNED_MARKS = ["注意：", "→", "←", "↗", "▸", "⇒", "！", "!"];
/** 說明頁（guide.*）的最高級黑名單（scripts/lib/copy-scan.mjs；CLAUDE.md「說明頁規範」），v4.1.0、v4.1.1 段落比照。 */
const SUPERLATIVES = /唯一|最好|最快|最佳|最強|第一名|業界第一/;
/** v4.0.0 段落中某個「### 標題」到下一個「### 」（或段落結尾）之間的內容。 */
const v4Section = (heading: string) => { const start = v4.indexOf(`### ${heading}`); expect(start, heading).toBeGreaterThan(-1); const next = v4.indexOf("\n### ", start + 1); return v4.slice(start, next === -1 ? undefined : next); };
/** README 某個「## 標題」到下一個「## 」之間的內容。 */
const readmeSection = (heading: string) => { const start = readme.indexOf(`## ${heading}`); expect(start, heading).toBeGreaterThan(-1); return readme.slice(start, readme.indexOf("\n## ", start + 1)); };
const sheets = labels.exports.excel.sheets;

describe("版本 4.1.3（v4.2 進行中先把現況上線；D-V42-34＝A；package.json 與 lockfile 的根只改 version 三行，依賴不變；lockfile 的 source-map-js 仍是 V41-3 的 1.2.2）", () => {
  it("package.json、package-lock.json 的根與 packages[\"\"] 都是 4.1.3；名稱仍是 profitlens（技術識別不改，D-V3-25）；next、eslint-config-next 是 16.3.8（D-V41-15）；source-map-js 是 1.2.2", () => {
    const pkg = JSON.parse(read("package.json"));
    const lock = JSON.parse(read("package-lock.json"));
    expect(pkg.name).toBe("profitlens");
    expect(pkg.version).toBe("4.1.3");
    expect(lock.version).toBe("4.1.3");
    expect(lock.packages[""].version).toBe("4.1.3");
    expect(lock.packages["node_modules/source-map-js"].version).toBe("1.2.2");
    expect(pkg.dependencies.next).toBe("16.3.8");
    expect(pkg.devDependencies["eslint-config-next"]).toBe("16.3.8");
    expect(lock.packages[""].dependencies).toEqual(pkg.dependencies);
    expect(lock.packages[""].devDependencies).toEqual(pkg.devDependencies);
  });
});

describe("RELEASES v4.1.3 段落（V42-0、V42-1a、V42-G1 的現況上線，2026-10-22；上線前後由 README 的正式站那一句判斷）", () => {
  it("在 v4.1.2 之前（新的在上）且是第一個段落，標題寫發布日期與主題；開頭寫明使用者的指示、三批、拍板、上線步驟、正式站檢查那一行、未完成的事（含 v4.2 其餘批次與 H8、H9）、上一版與部署要當次同意；小節依序是給使用者、不變的事、已知限制、驗收", () => {
    expect(releases.indexOf("## v4.1.3（2026-10-22，說明首頁改寫與通路設定基礎）")).toBeGreaterThan(-1);
    expect(releases.indexOf("## v4.1.3")).toBeLessThan(releases.indexOf("## v4.1.2"));
    expect(releases.indexOf("## v4.1.3")).toBe(releases.indexOf("\n## ") + 1);
    const intro = v413.slice(0, v413.indexOf("\n### "));
    for (const text of ["發布日期：2026-10-22", "「目前的進度先做正式推送上線」", "V42-0", "V42-1a", "V42-G1", "D-V42-34", "4.1.3", "`revamp/v4.2`", "`main`", "`00584a5` fast-forward", "`v4.1.3`", "13 項 HTTP", "補充 19 項", "**正式站檢查**：", "H6", "T5、T6", "D-V41-17", "人工開檔檢查", "Skew Protection", "D-V41-16", "V42-1b 到 V42-6", "H8、H9", "v4.1.2（發布 commit `e256154`", "`v4.1.2`", "`dpl_J5A1SGdB13av7anqtCjsf4bKUeEj`", "`00584a5`", "`dpl_AYmy3y9E8j2ggMg8bBK4BSvg2kUa`", "D-V41-24", "D-V42-26", "`channel_settings`", "沒有新增依賴"]) expect(intro, text).toContain(text);
    const headings = [...v413.matchAll(/^### (.+)$/gm)].map(match => match[1]);
    expect(headings).toEqual(["給使用者", "不變的事", "已知限制", "驗收"]);
  });

  it("正式站檢查一行與 README 的正式站版本一致：上線前是 PROD_PLACEHOLDER、發布方式寫成上線步驟、README 寫正式站仍是 v4.1.2；README 改成已是 v4.1.3 後，要有 deployment 與 V42-G1 正式站檢查的輸出檔，不留 PLACEHOLDER 與上線步驟；三份驗收文件上線前後都要存在", () => {
    const intro = v413.slice(0, v413.indexOf("\n### "));
    const prodLine = intro.split("\n").find(line => line.startsWith("**正式站檢查**："));
    expect(prodLine).toBeDefined();
    for (const doc of [V42_0_ACCEPTANCE, V42_1A_ACCEPTANCE, V42_G1_ACCEPTANCE]) expect(existsSync(resolve(doc)), doc).toBe(true);
    const record = readmeSection("發布紀錄");
    if (v413Launched) {
      expect(v413).not.toContain("PLACEHOLDER");
      expect(intro).not.toContain("上線步驟：");
      expect(prodLine).toMatch(/`dpl_[A-Za-z0-9]+`/);
      expect(prodLine).toContain(`\`${V413_PROD_LAUNCH_CHECK}\``);
      expect(existsSync(resolve(V413_PROD_LAUNCH_CHECK)), V413_PROD_LAUNCH_CHECK).toBe(true);
      expect(record).toContain("正式站已是 v4.1.3（2026-10-22）；H6 可用性複測尚未執行。");
      expect(record).not.toContain("正式站仍是");
    } else {
      expect(prodLine).toBe("**正式站檢查**：PROD_PLACEHOLDER");
      expect(intro).toContain("上線步驟：");
      expect(record).toContain("正式站仍是 v4.1.2（2026-10-16 上線），v4.1.3 部署並通過正式站檢查後才改寫這一句；H6 可用性複測尚未執行。");
      expect(record).not.toContain("正式站已是");
    }
  });

  it("給使用者：說明首頁改寫（改了哪些段、不變的部分、12 處被改掉的字句、媒體不重拍）與通路設定只是底層準備（模組、快照欄位、備份選填鍵；沒有介面、畫面與匯出不變；之後的版本在資料來源頁加設定區）", () => {
    const users = v413Section("給使用者");
    expect(users).toContain("**說明首頁改寫了**");
    expect(users).toContain("**通路設定：這一版沒有介面，只是底層準備**");
    for (const text of ["https://profitlens-tau.vercel.app/guide", "2026-10-20", "V42-G1", "D-V42-32", "D-V42-33", "副標", "「為什麼做這套服務」", "「以前怎麼做」", "「在這裡怎麼做」", "3 個主張加 1 個前提", "一般做法、在這裡、對你的意義、在哪裡看得到", "「這些做法的代價」", "「刻意不做的事」", "「30 秒上手」", "本頁目錄", "11 個功能區頁", "3 支示範影片", "頁尾", "12 處", "(1)", "(12)", "「直接載入示範資料」", "「我們」", "「一鍵」", "「相關說明：匯入資料」", "「後台看得到成交金額和廣告 ROAS」", "「欄位由系統先對照、你再確認」", "（扣廣告後貢獻 = 0）", "「決定做到哪裡，下次開會時自動列出上次決議與置頂待辦的狀態」", "「匯出成 PDF、…」", "「經營總覽」", "破折號", "19 處", "「這怎麼來的？」", "「所以要怎麼做？」", "44 張截圖", "`GUIDE_MEDIA=check`", "47 件 0 差異"]) expect(users, text).toContain(text);
    for (const text of ["`src/application/channel-settings.ts`", "`channel-settings-v1`", "`channel_names`", "`channel_groups`", "`channel_settings`", "V42-1a", "D-V42-9", "名稱解析器", "通路代碼", "沒有任何畫面可以建立或修改設定", "和 v4.1.2 相同", "資料來源頁加設定區", "V42-1b", "v4.2.0"]) expect(users, text).toContain(text);
  });

  it("不變的事：三個指標版本、golden 固定答案、labels 的 2,842 個既有字串、testid、畫面基準與匯出摘要在沒有設定時相同、匯入流程、備份 v5 與沒有設定時的位元組、沒有新增依賴、資料不上傳與 AI 負載、公開站邊界、匯出 5 種", () => {
    const same = v413Section("不變的事");
    for (const text of ["contribution-v1", "assist-kpi-v1", "breakeven-mer-v1", "`625bfa5`", "255.00", "−315.00", "284.00／264.00", "19.70", "不產生任何新數字", "`src/i18n/labels.zh-TW.ts`", "2,842", "`storage.v42.droppedChannels`", "data-testid", "64 張畫面基準", "64 個匯出摘要", "1,782", "匯入流程不變", "profitlens-workspace-v5", "v1–v5", "`tests/fixtures/backup-bytes-v4-7b.json`", "有設定介面的版本", "沒有新增依賴", "只改版本號", "資料不上傳", "D-V42-27", "不含通路顯示名稱", "APP_MODE=PUBLIC_DEMO", "ENABLE_LIVE_AI=false", "`872662d`", "5 種"]) expect(same, text).toContain(text);
  });

  it("已知限制：H6（T5、T6）、開檔檢查、Skew Protection、說明頁截圖（3 張英文、21 張寬截圖）、說明首頁的三句原稿用語、備份的向前相容（channel_settings 與 INVALID_WORKSPACE_FORMAT）、其他沿用 v4.1.2 與更早", () => {
    const known = v413Section("已知限制");
    for (const text of ["H6", "T5", "T6", "D-V41-17", "[usability-test](revamp-v4/usability-test.md)", "人工開檔檢查", "Skew Protection", "D-V41-16", "共 3 張", "Choose File", "mm/dd/yyyy", "21 張", "0.45", "「客戶追問時站得住」", "「這裡不會滿意」", "「30 秒就能用示範資料試」", "`channel_settings`", "`INVALID_WORKSPACE_FORMAT`", "不取代目前資料", "v4.1.2、v4.1.1 與 v4.1.0 段落"]) expect(known, text).toContain(text);
  });

  it("驗收連到 V42-0、V42-1a、V42-G1 的驗收文件（三份都已存在），寫要過的關卡與發布當時的數字；連到的規格文件都存在", () => {
    const links = [...v413.matchAll(/\]\(\.\.\/(verification\/[^)]+)\)/g)].map(match => match[1]);
    for (const doc of [V42_0_ACCEPTANCE, V42_1A_ACCEPTANCE, V42_G1_ACCEPTANCE]) expect(links).toContain(doc);
    for (const link of links) expect(existsSync(resolve(link)), link).toBe(true);
    const acceptance = v413Section("驗收");
    for (const text of ["數字見驗收文件", "禁區與邊界五條", "`a297175`", "`91c8621`", "`a69d5ce`", "172 檔、3,628 個", "1,143 passed、0 failed、29 skipped", "64 張", "15 × 4", "`GUIDE_MEDIA=check`", "47 件 0 差異", "13 項與補充 19 項", "521,487", "527,897", "`SPLIT_SENTINELS`", "`GUIDE_SENTINELS`", "131,466", "1,016.9／783.9／87.0／963.5／12.8", "28／28／28／26", "SEO 100", "AI 快照", "備份矩陣"]) expect(acceptance, text).toContain(text);
    const docs = [...v413.matchAll(/\]\((revamp-v4(?:\.[12])?\/[^)]+)\)/g)].map(match => match[1]);
    for (const name of ["06_BATCHES.md", "09_DECISIONS_PENDING.md"]) expect(docs).toContain(`revamp-v4.2/${name}`);
    expect(docs).toContain("revamp-v4/usability-test.md");
    for (const doc of docs) expect(existsSync(resolve("docs", doc)), doc).toBe(true);
  });

  it("v4.1.3 段落遵守文案規則：沒有「注意：」前綴、箭頭與驚嘆號，也沒有說明頁黑名單裡的最高級", () => {
    for (const banned of BANNED_MARKS) expect(v413, banned).not.toContain(banned);
    expect(v413).not.toMatch(SUPERLATIVES);
  });
});

describe("RELEASES v4.1.2 段落（V41-6，2026-10-16 上線；v4.1.3 起一律照上線後的寫法斷言）", () => {
  it("在 v4.1.1 之前（新的在上），標題寫發布日期與主題；開頭寫明使用者的回報、批次與拍板、發布方式、正式站檢查那一行、未完成的事、上一版與部署要當次同意；小節依序是給使用者、不變的事、已知限制、驗收", () => {
    expect(releases.indexOf("## v4.1.2（2026-10-16，範例檔修正與操作導覽入口）")).toBeGreaterThan(-1);
    expect(releases.indexOf("## v4.1.2")).toBeLessThan(releases.indexOf("## v4.1.1"));
    const intro = v412.slice(0, v412.indexOf("\n### "));
    for (const text of ["發布日期：2026-10-16", "V41-6", "D-V41-26", "D-V41-29", "4.1.2", "「操作導覽」", "`.vercelignore`", "`revamp/v4.1`", "`main`", "`v4.1.2`", "補充 19 項", "**正式站檢查**：", "H6", "T5、T6", "D-V41-17", "人工開檔檢查", "Skew Protection", "D-V41-16", "v4.1.1（發布 commit `36659ff`", "`v4.1.1`", "`dpl_9Fy3evkGfJUcStEci3YaKnr6Z8X2`", "`66c241a`", "`dpl_Hfh6Nv7vbvmghP4P2LJXCvVWEbbL`", "D-V41-24"]) expect(intro, text).toContain(text);
    const headings = [...v412.matchAll(/^### (.+)$/gm)].map(match => match[1]);
    expect(headings).toEqual(["給使用者", "不變的事", "已知限制", "驗收"]);
  });

  it("已上線（2026-10-16，上線紀錄 commit 00584a5）：發布方式寫實際的 commit 與 tag，正式站檢查一行有 deployment 與 V41-6 正式站檢查的輸出檔，V41-6 驗收文件存在，不留 PLACEHOLDER 與上線步驟（不再看 README 的正式站那一句）", () => {
    const intro = v412.slice(0, v412.indexOf("\n### "));
    const prodLine = intro.split("\n").find(line => line.startsWith("**正式站檢查**："));
    expect(prodLine).toBeDefined();
    expect(v412).not.toContain("PLACEHOLDER");
    expect(intro).not.toContain("上線步驟：");
    expect(intro).toContain("發布 commit `e256154`");
    expect(prodLine).toContain("`dpl_J5A1SGdB13av7anqtCjsf4bKUeEj`");
    expect(prodLine).toContain(`\`${V412_PROD_LAUNCH_CHECK}\``);
    expect(existsSync(resolve(V412_PROD_LAUNCH_CHECK)), V412_PROD_LAUNCH_CHECK).toBe(true);
    expect(existsSync(resolve(V41_6_ACCEPTANCE)), V41_6_ACCEPTANCE).toBe(true);
  });

  it("給使用者：範例檔（5 個檔與放置處、根因是 .vercelignore 兩行沒有前導斜線、從 v2.0.0 起 404、本機 next start 測不到、修法只動兩行、兩道護欄、內容逐位元組相同）與入口（四處由「使用說明」改「操作導覽」、首頁空狀態那一行、側欄問號圖示、頁尾與首頁空狀態不加、說明首頁標題不變、3 張截圖與 3 支影片重拍）", () => {
    const users = v412Section("給使用者");
    expect(users).toContain("**範例檔可以下載了**");
    expect(users).toContain("**入口改名「操作導覽」，側欄加問號圖示**");
    for (const text of [`「${labels.exports.downloads.templatesHeading}」`, `「${labels.shell.topbarV3.templateColumns.example}」`, `「${labels.shell.topbarV3.templateColumns.blank}」`, "`manifest.json`", "`/docs/ORDER_AGGREGATION.md`", "404", "v2.0.0", "`.vercelignore`", "`docs/`", "`templates/`", "前導斜線", "`public/`", "5 個檔", "`next start`", "D-V41-26", "`/docs/`", "`/templates/`", "只動這兩行", "`git check-ignore`", "`tests/vercelignore.test.ts`", "`scripts/launch-check.mjs`", "14 項增為 19 項", "D-V41-30", "`templates/examples/`", "逐位元組相同", "`tests/templates.test.ts`"]) expect(users, text).toContain(text);
    for (const text of ["「使用說明」", "「操作導覽」", "`shell.guideV41.entry`", "D-V41-27", "「使用說明：每一頁怎麼用」", "「操作導覽：每一頁怎麼用」", "問號圓圈圖示", "20px", "D-V41-28", "「操作導覽（另開分頁）」", "「服務介紹與使用說明」不變", "另開分頁", "`start-nav`", "`start-mobile-m`", "`start-load`", "3 支影片", "41 張", "見驗收文件"]) expect(users, text).toContain(text);
  });

  it("不變的事：三個指標版本、golden 固定答案、labels 只改 shell.guideV41 的兩個值、testid、沒有新增依賴（lockfile 只改版本號）、.vercelignore 其餘樣式不動、資料不上傳、公開站邊界、匯出與備份 v5", () => {
    const same = v412Section("不變的事");
    for (const text of ["contribution-v1", "assist-kpi-v1", "breakeven-mer-v1", "`625bfa5`", "255.00", "−315.00", "284.00／264.00", "19.70", "不產生任何新數字", "`src/i18n/labels.zh-TW.ts`", "`shell.guideV41.entry`", "`shell.guideV41.homeHint`", "key 名不變", "data-testid", "沒有新增依賴", "只改版本號", "`.vercelignore`", "資料不上傳", "D-V41-23", "APP_MODE=PUBLIC_DEMO", "ENABLE_LIVE_AI=false", "`872662d`", "5 種", "profitlens-workspace-v5"]) expect(same, text).toContain(text);
  });

  it("已知限制：H6（T5、T6，答案鍵的入口名已改「操作導覽」）、開檔檢查、Skew Protection、截圖裡的英文（3 張）、手機上的寬截圖（21 張）、其他沿用 v4.1.1 與 v4.1.0", () => {
    const known = v412Section("已知限制");
    for (const text of ["H6", "T5", "T6", "D-V41-17", "[usability-test](revamp-v4/usability-test.md)", "「操作導覽」", "人工開檔檢查", "Skew Protection", "D-V41-16", "共 3 張", "Choose File", "mm/dd/yyyy", "21 張", "0.45", "`ffmpeg`", "游標", "v4.1.1 與 v4.1.0 段落"]) expect(known, text).toContain(text);
  });

  it("驗收連到 V41-6 的驗收文件（上線前可以還沒有，上線後一定要有），寫「數字見驗收文件」與要過的關卡；連到的規格文件都存在", () => {
    const links = [...v412.matchAll(/\]\(\.\.\/(verification\/[^)]+)\)/g)].map(match => match[1]);
    expect(links).toContain(V41_6_ACCEPTANCE);
    for (const link of links) expect(existsSync(resolve(link)), link).toBe(true);
    const acceptance = v412Section("驗收");
    for (const text of ["數字見驗收文件", "禁區與邊界五條", "`tests/vercelignore.test.ts`", "13 項與補充 19 項", "520,451", "`GUIDE_SENTINELS`", "`GUIDE_MEDIA=check`", "47 件 0 差異", "64 張", "42 張", "E2E 四尺寸", "axe", "TBT", "SEO 100"]) expect(acceptance, text).toContain(text);
    const docs = [...v412.matchAll(/\]\((revamp-v4(?:\.1)?\/[^)]+)\)/g)].map(match => match[1]);
    for (const name of ["06_BATCHES.md", "09_DECISIONS_PENDING.md"]) expect(docs).toContain(`revamp-v4.1/${name}`);
    expect(docs).toContain("revamp-v4/usability-test.md");
    for (const doc of docs) expect(existsSync(resolve("docs", doc)), doc).toBe(true);
  });

  it("v4.1.2 段落遵守文案規則：沒有「注意：」前綴、箭頭與驚嘆號，也沒有說明頁黑名單裡的最高級", () => {
    for (const banned of BANNED_MARKS) expect(v412, banned).not.toContain(banned);
    expect(v412).not.toMatch(SUPERLATIVES);
  });
});

describe("RELEASES v4.1.1 段落（V41-3，2026-10-15 上線；V41-6 起一律照上線後的寫法斷言）", () => {
  it("在 v4.1.0 之前（新的在上），標題寫發布日期與主題；開頭寫明使用者的同意、發布方式、正式站檢查那一行、未完成的事、上一版與部署要當次同意；小節依序是給使用者、不變的事、依賴修正、已知限制、驗收", () => {
    expect(releases.indexOf("## v4.1.1（2026-10-15，示範影片與依賴修正）")).toBeGreaterThan(-1);
    expect(releases.indexOf("## v4.1.1")).toBeLessThan(releases.indexOf("## v4.1.0"));
    const intro = v411.slice(0, v411.indexOf("\n### "));
    for (const text of ["發布日期：2026-10-15", "「製作示範影片含字幕」", "「好，影片做完後部署正式上線」", "D-V41-6", "V41-3", "`source-map-js`", "`5072879`", "`main` 從 `9bc2241` fast-forward", "`v4.1.1`", "**正式站檢查**：", "H6", "T5、T6", "D-V41-17", "人工開檔檢查", "Skew Protection", "D-V41-16", "v4.1.0（發布 commit `5b40d7f`", "`dpl_8gTMCdU9BKTeCJfhTbCvsuGUgan2`", "`dpl_12xGwYGK9LHcuiczj517PjoPTWsn`", "D-V41-24"]) expect(intro, text).toContain(text);
    const headings = [...v411.matchAll(/^### (.+)$/gm)].map(match => match[1]);
    expect(headings).toEqual(["給使用者", "不變的事", "依賴修正", "已知限制", "驗收"]);
  });

  it("已上線（2026-10-15）：發布方式寫實際的 commit 與 tag，正式站檢查一行有 deployment 與 V41-3 正式站檢查的輸出檔，V41-3 驗收文件存在，不留 PLACEHOLDER 與上線步驟（不再看 README 的正式站那一句）", () => {
    const intro = v411.slice(0, v411.indexOf("\n### "));
    const prodLine = intro.split("\n").find(line => line.startsWith("**正式站檢查**："));
    expect(prodLine).toBeDefined();
    expect(v411).not.toContain("PLACEHOLDER");
    expect(intro).not.toContain("上線步驟：");
    expect(intro).toContain("發布 commit `36659ff`");
    expect(prodLine).toContain("`dpl_9Fy3evkGfJUcStEci3YaKnr6Z8X2`");
    expect(prodLine).toContain(`\`${V411_PROD_LAUNCH_CHECK}\``);
    expect(existsSync(resolve(V411_PROD_LAUNCH_CHECK)), V411_PROD_LAUNCH_CHECK).toBe(true);
    expect(existsSync(resolve(V41_3_ACCEPTANCE)), V41_3_ACCEPTANCE).toBe(true);
  });

  it("給使用者：3 支影片（發布時的標題、長度、大小與放置頁）、預設開啟的字幕與逐步文字、資料來源註記、preload=\"none\"、只放本站 public/guide/video/", () => {
    const users = v411Section("給使用者");
    for (const [title, seconds, bytes] of [["示範影片：30 秒上手", "25.6 秒", "706,627"], ["示範影片：匯入資料", "27.6 秒", "549,898"], ["示範影片：週會流程", "33.7 秒", "1,133,113"]]) {
      expect(users, title).toContain(`「${title}」（${seconds}）`);
      expect(users, bytes).toContain(bytes);
    }
    for (const page of ["30 秒上手", "開始使用：看懂畫面與期間", "匯入資料", "會議紀錄與投影"]) expect(users, page).toContain(`「${page}」`);
    for (const text of ["3 支無聲", "1280×800", "預設開啟的中文字幕", "「影片沒有聲音；下方是影片的逐步文字。」", "編號清單", "「畫面為示範資料（虛構）」", "「畫面為虛構的合成資料」", "`tests/fixtures/inclusive_tax`", "不自動播放、不循環", "`preload=\"none\"`", "2 MB、45 秒", "`public/guide/video/`", "第三方", "WebVTT", "H.264", "沒有音軌", "不手工剪輯"]) expect(users, text).toContain(text);
  });

  it("不變的事：三個指標版本、golden 固定答案、工作台不變、44 張截圖逐位元組相同、只有 source-map-js 一項 lockfile 變動、ffmpeg 不進 package.json、公開站邊界、匯出與備份 v5", () => {
    const same = v411Section("不變的事");
    for (const text of ["contribution-v1", "assist-kpi-v1", "breakeven-mer-v1", "`625bfa5`", "255.00", "−315.00", "284.00／264.00", "19.70", "不產生任何新數字", "`src/i18n/labels.zh-TW.ts`", "`src/i18n/guide.zh-TW.ts`", "44 張截圖", "逐位元組相同", "沒有新增依賴", "`source-map-js`", "`ffmpeg`", "D-V41-7", "資料不上傳", "D-V41-23", "APP_MODE=PUBLIC_DEMO", "ENABLE_LIVE_AI=false", "`872662d`", "profitlens-workspace-v5"]) expect(same, text).toContain(text);
  });

  it("依賴修正：source-map-js 1.2.1 到 1.2.2（commit、公告、只動 lockfile 的這一項）；npm audit high 9 筆降為 8 筆，剩下的每個套件都寫出來（取自修正後的 audit 證據檔），並連到 V41-0 的基準評估", () => {
    const deps = v411Section("依賴修正");
    for (const text of ["`source-map-js` 由 1.2.1 升到 1.2.2", "`5072879`", "GHSA-68fv-2mgg-jv7q", "`postcss`", "`@tailwindcss/node`", "high 由 9 筆降為 8 筆", "low、moderate、critical 都是 0", `\`${V411_AUDIT}\``, "[V41-0 基準評估](../verification/revamp-v41/V41-0-baseline.md)"]) expect(deps, text).toContain(text);
    const audit = JSON.parse(read(V411_AUDIT));
    expect(audit.metadata.vulnerabilities).toMatchObject({ low: 0, moderate: 0, high: 8, critical: 0 });
    const remaining = Object.keys(audit.vulnerabilities);
    expect(remaining).toHaveLength(8);
    expect(remaining).not.toContain("source-map-js");
    for (const name of remaining) expect(deps, name).toContain(`\`${name}\``);
    expect(existsSync(resolve("verification/revamp-v41/V41-0-baseline.md"))).toBe(true);
  });

  it("已知限制：H6（T5、T6）、開檔檢查、Skew Protection、重錄影片要本機 ffmpeg（check 不需要）、影片沒有游標而用強調框、其他沿用 v4.1.0", () => {
    const known = v411Section("已知限制");
    for (const text of ["H6", "T5", "T6", "D-V41-17", "人工開檔檢查", "Skew Protection", "D-V41-16", "`ffmpeg`", "`GUIDE_MEDIA=check`", "`GUIDE_MEDIA=write`", "D-V41-7", "游標", "強調框", "v4.1.0 段落", "示範影片還沒做"]) expect(known, text).toContain(text);
  });

  it("驗收連到 V41-3 的驗收文件（已上線，一定要有）與 V41-0 基準評估，連結的檔案都存在；連到的規格文件都存在", () => {
    const links = [...v411.matchAll(/\]\(\.\.\/(verification\/[^)]+)\)/g)].map(match => match[1]);
    expect(links).toContain(V41_3_ACCEPTANCE);
    expect(links).toContain("verification/revamp-v41/V41-0-baseline.md");
    for (const link of links) expect(existsSync(resolve(link)), link).toBe(true);
    expect(v411Section("驗收")).toContain(`\`${V411_AUDIT}\``);
    expect(existsSync(resolve(V411_AUDIT))).toBe(true);
    const docs = [...v411.matchAll(/\]\((revamp-v4(?:\.1)?\/[^)]+)\)/g)].map(match => match[1]);
    for (const name of ["01_PRD.md", "GUIDE_CONTENT.md", "06_BATCHES.md", "09_DECISIONS_PENDING.md"]) expect(docs).toContain(`revamp-v4.1/${name}`);
    for (const doc of docs) expect(existsSync(resolve("docs", doc)), doc).toBe(true);
  });

  it("v4.1.1 段落遵守文案規則：沒有「注意：」前綴、箭頭與驚嘆號，也沒有說明頁黑名單裡的最高級", () => {
    for (const banned of BANNED_MARKS) expect(v411, banned).not.toContain(banned);
    expect(v411).not.toMatch(SUPERLATIVES);
  });
});

describe("RELEASES v4.1.0 段落（V41-5，2026-10-15 上線；v4.1.1 起一律照上線後的寫法斷言）", () => {
  it("在 v4.0.0 之前（新的在上），標題寫發布日期與主題；開頭寫明發布方式、正式站檢查那一行、preview 與 H7、未完成的事、上一版與部署要當次同意；小節依序是給使用者、不變的事、已知限制、驗收", () => {
    expect(releases.indexOf("## v4.1.0（2026-10-15，服務介紹與使用說明）")).toBeGreaterThan(-1);
    expect(releases.indexOf("## v4.1.0")).toBeLessThan(releases.indexOf("## v4.0.0"));
    const intro = v41.slice(0, v41.indexOf("\n### "));
    for (const text of ["發布日期：2026-10-15", "「H7 通過、V41-5 收尾、正式上線」", "`main` 從 `59e6f41` fast-forward", "`v4.1.0`", "**正式站檢查**：", "`revamp/v4.1`", "`dpl_D6NNP4Lo9pRAAXMYz5tjUWfW4S7V`", "13 項 HTTP 與補充 14 項全部通過", "H7", "H6", "T5、T6", "D-V41-17", "人工開檔檢查", "Skew Protection", "D-V41-16", "v4.0.0（`872662d`）", "D-V41-24"]) expect(intro, text).toContain(text);
    const headings = [...v41.matchAll(/^### (.+)$/gm)].map(match => match[1]);
    expect(headings).toEqual(["給使用者", "不變的事", "已知限制", "驗收"]);
  });

  it("已上線（2026-10-15）：發布方式寫實際的 commit 與 tag，正式站檢查一行有 deployment 與正式站檢查的輸出檔，不留 PLACEHOLDER 與上線步驟（不再看 README 的正式站那一句）", () => {
    const intro = v41.slice(0, v41.indexOf("\n### "));
    const prodLine = intro.split("\n").find(line => line.startsWith("**正式站檢查**："));
    expect(prodLine).toBeDefined();
    expect(v41).not.toContain("PLACEHOLDER");
    expect(intro).not.toContain("上線步驟：");
    expect(intro).toContain("發布 commit `5b40d7f`");
    expect(prodLine).toContain("`dpl_8gTMCdU9BKTeCJfhTbCvsuGUgan2`");
    expect(prodLine).toContain(`\`${V41_PROD_LAUNCH_CHECK}\``);
    expect(existsSync(resolve(V41_PROD_LAUNCH_CHECK)), V41_PROD_LAUNCH_CHECK).toBe(true);
  });

  it("給使用者：說明首頁與 11 個功能區頁（發布時的標題）、截圖共 44 張、四個入口另開分頁、分享圖、CLS、Next.js 16.3.8", () => {
    const users = v41Section("給使用者");
    expect(users).toContain("**服務介紹與使用說明**");
    expect(users).toContain("https://profitlens-tau.vercel.app/guide");
    expect(V41_AREA_TITLES).toHaveLength(11);
    expect(users).toContain("11 個功能區頁");
    for (const title of V41_AREA_TITLES) expect(users, title).toContain(`「${title}」`);
    expect(users).toContain("共 44 張");
    expect(users).toContain("「開啟工作台」");
    expect(users).toContain("「使用說明」");
    for (const text of ["另開分頁", "虛構", "`public/og.png`", "CLS", "16.3.8"]) expect(users, text).toContain(text);
  });

  it("不變的事：三個指標版本、golden 固定答案、公開站邊界、既有字串（兩份快照的鍵數）與 testid、依賴、匯出與備份 v5", () => {
    const same = v41Section("不變的事");
    const v3Flat = Object.keys(JSON.parse(read("verification/revamp-v4/labels-v3.flat.json"))).length;
    const v4Flat = Object.keys(JSON.parse(read("verification/revamp-v41/labels-v4.flat.json"))).length;
    for (const text of ["contribution-v1", "assist-kpi-v1", "breakeven-mer-v1", "`625bfa5`", "255.00", "−315.00", "284.00／264.00", "19.70", "資料不上傳", "D-V41-23", "ENABLE_LIVE_AI=false", "`872662d`", v3Flat.toLocaleString("en-US"), v4Flat.toLocaleString("en-US"), "data-testid", "16.3.8", "profitlens-workspace-v5"]) expect(same, text).toContain(text);
  });

  it("已知限制：H6（T5、T6）、動機段是產品口吻（D-V41-9、H7）、寬截圖（發布時 44 張中 18 張寬於 800、21 張比例低於 0.45）、截圖裡的英文、開檔檢查、Skew Protection、source-map-js、影片", () => {
    const known = v41Section("已知限制");
    expect(known).toContain("桌機截圖有 18 張寬度超過 800 CSS px");
    expect(known).toContain("44 張中有 21 張的顯示比例低於 0.45");
    for (const text of ["H6", "T5", "T6", "D-V41-17", "D-V41-9", "H7", "Choose File", "人工開檔檢查", "Skew Protection", "D-V41-16", "source-map-js", "D-V41-6", "V41-3"]) expect(known, text).toContain(text);
  });

  it("驗收連到 V41-0–V41-5 的驗收文件，連結的檔案都存在（含 V41-5）；連到的規格文件都存在", () => {
    const links = [...v41.matchAll(/\]\(\.\.\/(verification\/[^)]+)\)/g)].map(match => match[1]);
    for (const batch of ["V41-0", "V41-1", "V41-2a", "V41-2b", "V41-4", "V41-5"]) expect(links).toContain(`verification/revamp-v41-${batch}-acceptance.md`);
    expect(links).toContain(V41_5_ACCEPTANCE);
    for (const link of links) expect(existsSync(resolve(link)), link).toBe(true);
    const docs = [...v41.matchAll(/\]\((revamp-v4(?:\.1)?\/[^)]+)\)/g)].map(match => match[1]);
    for (const name of ["00_README.md", "01_PRD.md", "GUIDE_CONTENT.md", "06_BATCHES.md", "09_DECISIONS_PENDING.md"]) expect(docs).toContain(`revamp-v4.1/${name}`);
    expect(docs).toContain("revamp-v4/usability-test.md");
    for (const doc of docs) expect(existsSync(resolve("docs", doc)), doc).toBe(true);
  });

  it("v4.1 段落遵守文案規則：沒有「注意：」前綴、箭頭與驚嘆號，也沒有說明頁黑名單裡的最高級", () => {
    for (const banned of BANNED_MARKS) expect(v41, banned).not.toContain(banned);
    expect(v41).not.toMatch(SUPERLATIVES);
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
    for (const banned of BANNED_MARKS) expect(v4, banned).not.toContain(banned);
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
    for (const banned of BANNED_MARKS) expect(v3, banned).not.toContain(banned);
  });
});

describe("README（步驟對齊 V3-8 的空狀態與匯入精靈；v4.1.3 起發布紀錄是 v4.1.3）", () => {
  it("發布紀錄寫最新 v4.1.3（2026-10-22），不再寫「最新：v4.1.2」與更早的，保留 v4.1.2、v4.1.1 與 v4.1.0 的一句；正式站版本另寫一句：上線前寫仍是 v4.1.2，上線後的收尾 commit 才改成已是 v4.1.3（日期）；v4.1.2 已上線，不再寫正式站仍是 v4.1.1 或更早、說明頁尚未發布", () => {
    for (const version of ["v4.1.0", "v4.1.1", "v4.1.2"]) expect(readme, version).toContain(version);
    for (const old of ["最新：v2.0.0", "最新：v3.0.0", "最新：v4.1.0", "最新：v4.1.1", "最新：v4.1.2"]) expect(readme, old).not.toContain(old);
    const record = readmeSection("發布紀錄");
    const features = readmeSection("功能一覽");
    expect(record).toContain("最新：v4.1.3（2026-10-22）");
    for (const text of ["`/guide`", "改寫稿", "「刻意不做的事」", "通路設定", "`channel_settings`", "沒有設定介面", "逐位元組相同", "v4.1.2（2026-10-16）", "範例檔", "`public/`", "v2.0.0", "404", "「使用說明」", "「操作導覽」", "問號圖示", "v4.1.1（2026-10-15）", "3 支無聲示範影片", "`source-map-js`", "v4.1.0（2026-10-15）"]) expect(record, text).toContain(text);
    for (const old of ["正式站仍是 v4.0.0", "正式站仍是 v4.1.0", "正式站仍是 v4.1.1"]) expect(record, old).not.toContain(old);
    expect(features).not.toContain("尚未發布");
    if (v413Launched) {
      expect(record).toContain("正式站已是 v4.1.3（2026-10-22）；H6 可用性複測尚未執行。");
      expect(record).not.toContain("正式站仍是");
    } else {
      expect(record).toContain("正式站仍是 v4.1.2（2026-10-16 上線），v4.1.3 部署並通過正式站檢查後才改寫這一句；H6 可用性複測尚未執行。");
      expect(record).not.toContain("正式站已是");
    }
  });

  it("「30 秒試用」寫出 v4.1.1 起說明首頁有 30 秒上手的示範影片（標題取自 guideLabels）", () => {
    const trial = readmeSection("30 秒試用");
    expect(trial).toContain(`「${guideLabels.guide.videos["start-30s"].title}」`);
    expect(trial).toContain("v4.1.1 起");
    expect(trial).toContain("中文字幕");
  });

  it("「30 秒試用」連到說明首頁、「用自己的資料」連到說明頁「匯入資料」，連結文字取自 guideLabels；「功能一覽」寫出 /guide", () => {
    expect(GUIDE_AREAS.map(({ area }) => area)).toContain("import");
    expect(readmeSection("30 秒試用")).toContain(`[${guideLabels.guide.hub.title}](https://profitlens-tau.vercel.app/guide)`);
    expect(readmeSection("用自己的資料")).toContain(`[${labels.shell.guideV41.entry}：${areaTitle("import")}](https://profitlens-tau.vercel.app/guide/import)`);
    const features = readmeSection("功能一覽");
    expect(features).toContain("https://profitlens-tau.vercel.app/guide");
    expect(features).toContain("v4.1.0");
  });

  it("首圖是 v4.1 示範資料截圖（V41-4 O1：取 V41-4 畫面基準的總覽首屏；v3 的舊圖保留），README 引用的本機圖片都存在", () => {
    const images = [...readme.matchAll(/<img src="([^"]+)"/g)].map(match => match[1]);
    expect(images).toContain("docs/images/overview-1440-v4.png");
    expect(existsSync(resolve("docs/images/overview-1440-v3.png"))).toBe(true);
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

describe("ENGINEERING 的 v4.1.0（V41-5）、v4.1.1（V41-3）、v4.1.2（V41-6）與 v4.1.3（V42-G1 之後的現況上線）", () => {
  it("寫出 V41-5 起的版本 4.1.0、文件地圖的 docs/revamp-v4.1/ 五份文件與 v4.1 各批驗收（檔案都存在），以及說明頁媒體的 GUIDE_MEDIA=check／write", () => {
    const engineering = read("docs/ENGINEERING.md");
    expect(engineering).toContain("**4.1.0**");
    expect(engineering).toContain("[revamp-v4.1/](revamp-v4.1/)");
    for (const name of ["00_README.md", "01_PRD.md", "GUIDE_CONTENT.md", "06_BATCHES.md", "09_DECISIONS_PENDING.md"]) {
      expect(engineering, name).toContain(`(revamp-v4.1/${name})`);
      expect(existsSync(resolve("docs/revamp-v4.1", name)), name).toBe(true);
    }
    const links = [...engineering.matchAll(/\]\(\.\.\/(verification\/revamp-v41-[^)]+)\)/g)].map(match => match[1]);
    for (const batch of ["V41-0", "V41-1", "V41-2a", "V41-2b", "V41-4", "V41-5", "V41-3"]) expect(links).toContain(`verification/revamp-v41-${batch}-acceptance.md`);
    for (const link of links) expect(existsSync(resolve(link)), link).toBe(true);
    expect(engineering).toContain("GUIDE_MEDIA=check npx playwright test --config verification/guide-media.config.ts");
    expect(engineering).toContain("GUIDE_MEDIA=write npx playwright test --config verification/guide-media.config.ts");
  });

  it("寫出 V41-3 起的版本 4.1.1（連到 RELEASES 的 v4.1.1 段落）、V41-3 驗收的連結，以及影片的比對與重錄（video.spec.ts；重錄要本機 ffmpeg，check 不需要）", () => {
    const engineering = read("docs/ENGINEERING.md");
    expect(engineering).toContain("V41-3 起為 **4.1.1**（見 [RELEASES](RELEASES.md) 的 v4.1.1 段落");
    expect(engineering).toContain("v4.1.1 已於 2026-10-15 上線，示範影片與依賴修正；v4.1.0 已於 2026-10-15 上線");
    const links = [...engineering.matchAll(/\]\(\.\.\/(verification\/revamp-v41-[^)]+)\)/g)].map(match => match[1]);
    expect(links).toContain(V41_3_ACCEPTANCE);
    for (const text of ["`verification/guide-media/video.spec.ts`", "`verification/guide-media/baseline/video/", "`public/guide/video/{id}.mp4`", "`ffmpeg`", "D-V41-7", "只跑 `check` 不需要"]) expect(engineering, text).toContain(text);
    expect(existsSync(resolve("verification/guide-media/video.spec.ts"))).toBe(true);
  });

  it("寫出 V41-6 起的版本 4.1.2（連到 RELEASES 的 v4.1.2 段落）、V41-6 驗收的連結、tests/vercelignore.test.ts 的護欄（git check-ignore）、launch-check 補充由 14 項增為 19 項，以及 .vercelignore 在 CLI 上傳與 Git 整合建置都生效", () => {
    const engineering = read("docs/ENGINEERING.md");
    expect(engineering).toContain("V41-6 起為 **4.1.2**（見 [RELEASES](RELEASES.md) 的 v4.1.2 段落");
    expect(engineering).toContain("v4.1.2 已於 2026-10-16 上線，範例檔修正與操作導覽入口；v4.1.1 已於 2026-10-15 上線");
    const links = [...engineering.matchAll(/\]\(\.\.\/(verification\/revamp-v41-[^)]+)\)/g)].map(match => match[1]);
    expect(links).toContain(V41_6_ACCEPTANCE);
    for (const text of ["`tests/vercelignore.test.ts`", "`git check-ignore --no-index`", "`.vercelignore`", "補充檢查由 14 項增為 19 項", "`ORDER_AGGREGATION.md`", "D-V41-26", "D-V41-30", "Git 整合建置", "`/docs/`、`/templates/`"]) expect(engineering, text).toContain(text);
  });

  it("寫出 V42-G1 起的版本 4.1.3（連到 RELEASES 的 v4.1.3 段落；說明首頁改寫與通路設定基礎）、發布紀錄那一列以 v4.1.3 開頭、文件地圖的 docs/revamp-v4.2/ 五份文件與 V42-0、V42-1a、V42-G1 驗收的連結（檔案都存在）", () => {
    const engineering = read("docs/ENGINEERING.md");
    expect(engineering).toContain("V42-G1 起為 **4.1.3**（見 [RELEASES](RELEASES.md) 的 v4.1.3 段落；說明首頁改寫與通路設定基礎）");
    expect(engineering).toContain("發布紀錄（v4.1.3，2026-10-22，說明首頁改寫與通路設定基礎；v4.1.2 已於 2026-10-16 上線");
    expect(engineering).toContain("[revamp-v4.2/](revamp-v4.2/)");
    for (const name of ["00_README.md", "01_PRD.md", "06_BATCHES.md", "09_DECISIONS_PENDING.md", "GLOSSARY.md"]) {
      expect(engineering, name).toContain(`(revamp-v4.2/${name})`);
      expect(existsSync(resolve("docs/revamp-v4.2", name)), name).toBe(true);
    }
    const links = [...engineering.matchAll(/\]\(\.\.\/(verification\/revamp-v42-[^)]+)\)/g)].map(match => match[1]);
    for (const doc of [V42_0_ACCEPTANCE, V42_1A_ACCEPTANCE, V42_G1_ACCEPTANCE]) expect(links).toContain(doc);
    for (const link of links) expect(existsSync(resolve(link)), link).toBe(true);
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
