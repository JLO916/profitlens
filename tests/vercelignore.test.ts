import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// V41-6（docs/revamp-v4.1/06_BATCHES.md V41-6 第 1 項；D-V41-26）：.vercelignore 是 gitignore 語法。
// 沒有前導斜線的「docs/」「templates/」會匹配任何深度的同名目錄，所以也把 public/docs/ 與 public/templates/ 一起排除：
// public/templates/examples/ 的 4 個範例檔與 public/docs/ORDER_AGGREGATION.md 從 v2.0.0 起每一次部署都沒上傳（正式站 404）。
// 本機 next start 直接讀工作目錄，所以 tests/templates.test.ts、E2E 與本機 launch-check 都測不到；這裡用 git 自己的 check-ignore
// 以 .vercelignore 當排除清單（core.excludesFile），對所有被追蹤的檔案檢查：要部署的一個都不排除、根目錄的文件與驗收目錄仍排除。
// git 不存在時 spawnSync 會回傳 error，測試直接失敗，不 skip。
//
// 注意：check-ignore 同時會讀 repo 的 .gitignore（優先於 core.excludesFile），而 -v 也會印出被「!」否定樣式匹配到的路徑，
// 所以只採計來源是 .vercelignore、樣式不以「!」開頭的匹配。目前唯一的交集是 .gitignore 的「!.env.example」（Vercel 只看 .vercelignore，
// 仍會因「.env*」排除它），不在下面的斷言範圍內。

const repoRoot = process.cwd();
const vercelignore = join(repoRoot, ".vercelignore");
const DEPLOYED_DIRS = ["public/", "src/", "fixtures/"];
const BUILD_FILES = ["package.json", "package-lock.json", "next.config.ts", "tsconfig.json", "vercel.json", "src/app/globals.css", "postcss.config.mjs", "eslint.config.mjs"];
/** 根目錄的文件、範本、測試、腳本與驗收：部署時仍要排除（只挑 git 有追蹤的）。 */
const ROOT_ONLY_FILES = ["docs/METRICS.md", "templates/examples/sales_daily.csv", "tests/templates.test.ts", "scripts/launch-check.mjs", "verification/revamp-v41-V41-3-acceptance.md"];

function git(args: string[], input?: string): string {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 });
  expect(result.error, `git ${args.join(" ")}`).toBeUndefined();
  // check-ignore：0＝至少一個路徑被排除、1＝都沒被排除；128 才是錯誤。
  expect([0, 1], `git ${args.join(" ")}：${result.stderr}`).toContain(result.status);
  return result.stdout;
}

const tracked = git(["ls-files", "-z"]).split("\0").filter(Boolean);
/** 被 .vercelignore 排除的追蹤檔 → 匹配到的樣式（-z -v 的輸出是 來源、行號、樣式、路徑 四個欄位一組）。 */
const ignored = new Map<string, string>();
{
  const fields = git(["-c", `core.excludesFile=${vercelignore}`, "check-ignore", "--no-index", "--stdin", "-z", "-v"], tracked.join("\0") + "\0").split("\0");
  for (let index = 0; index + 3 < fields.length; index += 4) {
    const [source, , pattern, path] = [fields[index], fields[index + 1], fields[index + 2], fields[index + 3]];
    if (source === vercelignore && !pattern.startsWith("!")) ignored.set(path, pattern);
  }
}

describe("V41-6 .vercelignore：只排除根目錄的文件與驗收，不排除要部署的檔", () => {
  it("git 追蹤的檔案與排除清單都讀得到", () => {
    expect(tracked.length).toBeGreaterThan(1000);
    expect(ignored.size).toBeGreaterThan(100);
    for (const path of ROOT_ONLY_FILES) expect(tracked, path).toContain(path);
  });

  it("public/、src/、fixtures/ 下沒有任何檔案被排除", () => {
    const excluded = tracked.filter((path) => DEPLOYED_DIRS.some((dir) => path.startsWith(dir)) && ignored.has(path)).map((path) => `${path}（${ignored.get(path)}）`);
    expect(excluded).toEqual([]);
  });

  it("建置設定檔都不被排除", () => {
    const present = BUILD_FILES.filter((path) => tracked.includes(path));
    expect(present.length).toBeGreaterThan(0);
    expect(present.filter((path) => ignored.has(path))).toEqual([]);
  });

  it("根目錄的 docs/、templates/、tests/、scripts/、verification/ 仍被排除", () => {
    const present = ROOT_ONLY_FILES.filter((path) => tracked.includes(path));
    expect(present.length).toBeGreaterThan(0);
    expect(present.filter((path) => !ignored.has(path))).toEqual([]);
  });

  it("docs/ 與 templates/ 寫成前導斜線的 /docs/、/templates/（只匹配根目錄，不再匹配 public/ 下的同名目錄）", () => {
    const lines = readFileSync(vercelignore, "utf8").split(/\r?\n/).map((line) => line.trim());
    expect(lines).toContain("/docs/");
    expect(lines).toContain("/templates/");
    expect(lines).not.toContain("docs/");
    expect(lines).not.toContain("templates/");
  });
});
