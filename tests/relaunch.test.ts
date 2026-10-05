import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { analyticsEnabled, ANALYTICS_SCRIPT_SRC, track, type AnalyticsEvent } from "../src/application/analytics";
import { labels } from "../src/i18n";
import { Dashboard } from "../src/components/dashboard";
import RootLayout, { metadata } from "@/app/layout";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { SITE_URL } from "@/app/site";

// R7（08 §3、決策 D8／D9／D10）：分享卡片、robots／sitemap、favicon、使用分析開關與事件內容、空狀態文案、進階驗證頁預設隱藏。
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("D9 analyticsEnabled：只有 Vercel production 且未停用才載入", () => {
  it.each([
    [{}, false],
    [{ VERCEL_ENV: "development" }, false],
    [{ VERCEL_ENV: "preview" }, false],
    [{ VERCEL_ENV: "Production" }, false],
    [{ VERCEL_ENV: "production" }, true],
    [{ VERCEL_ENV: "production", NEXT_PUBLIC_DISABLE_ANALYTICS: "" }, true],
    [{ VERCEL_ENV: "production", NEXT_PUBLIC_DISABLE_ANALYTICS: "0" }, true],
    [{ VERCEL_ENV: "production", NEXT_PUBLIC_DISABLE_ANALYTICS: "false" }, true],
    [{ VERCEL_ENV: "production", NEXT_PUBLIC_DISABLE_ANALYTICS: "1" }, false],
    [{ VERCEL_ENV: "production", NEXT_PUBLIC_DISABLE_ANALYTICS: "true" }, false],
    [{ VERCEL_ENV: "production", NEXT_PUBLIC_DISABLE_ANALYTICS: " TRUE " }, false],
    [{ VERCEL_ENV: "production", NEXT_PUBLIC_DISABLE_ANALYTICS: "yes" }, false],
    [{ VERCEL_ENV: "preview", NEXT_PUBLIC_DISABLE_ANALYTICS: "0" }, false],
  ] as const)("%o → %s", (env, expected) => {
    expect(analyticsEnabled(env)).toBe(expected);
  });
});

describe("D9 track：只送事件名，沒有 window.va 時不做事", () => {
  it("伺服器端（沒有 window）與沒有 window.va 時不丟錯", () => {
    expect(typeof window).toBe("undefined");
    expect(() => track("demo_loaded")).not.toThrow();
    vi.stubGlobal("window", {});
    expect(() => track("export_pdf")).not.toThrow();
    vi.stubGlobal("window", { va: "not-a-function" });
    expect(() => track("export_pdf")).not.toThrow();
  });
  it("有 window.va 時呼叫一次，payload 只有 name", () => {
    const va = vi.fn();
    vi.stubGlobal("window", { va });
    track("meeting_finalized");
    expect(va).toHaveBeenCalledTimes(1);
    expect(va).toHaveBeenCalledWith("event", { name: "meeting_finalized" });
    const [command, payload] = va.mock.calls[0];
    expect(command).toBe("event");
    expect(Object.keys(payload)).toEqual(["name"]);
  });
  it("window.va 自己丟錯時不影響操作", () => {
    vi.stubGlobal("window", { va: () => { throw new Error("blocked"); } });
    expect(() => track("export_excel")).not.toThrow();
  });
  it("十個事件名都是固定代號（不含資料內容）", () => {
    const events: AnalyticsEvent[] = ["demo_loaded", "import_committed", "evidence_opened", "action_added", "scenario_calculated", "meeting_finalized", "export_pdf", "export_excel", "export_pptx", "export_markdown"];
    const va = vi.fn();
    vi.stubGlobal("window", { va });
    for (const name of events) track(name);
    expect(va.mock.calls.map(([, payload]) => payload)).toEqual(events.map(name => ({ name })));
    for (const name of events) expect(name).toMatch(/^[a-z_]+$/);
  });
});

describe("D9 layout 與頁尾揭露", () => {
  const render = (analytics: boolean) => renderToStaticMarkup(createElement(RootLayout, null, createElement(Dashboard, { analytics })));
  it("非 production 不載入分析腳本、頁尾沒有揭露句", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const html = render(false);
    expect(html).not.toContain(ANALYTICS_SCRIPT_SRC);
    expect(html).not.toContain("window.va");
    expect(html).not.toContain(labels.relaunch.analyticsNote);
  });
  it("production 載入 /_vercel/insights/script.js（defer）與事件佇列；頁尾一句揭露", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_DISABLE_ANALYTICS", "");
    const html = render(true);
    expect(html).toContain(`<script defer="" src="${ANALYTICS_SCRIPT_SRC}"></script>`);
    expect(html).toContain("window.vaq");
    expect(html).toMatch(new RegExp(`<footer class="main-footer">.*${labels.relaunch.analyticsNote}.*</footer>`));
  });
  it("production 但以 NEXT_PUBLIC_DISABLE_ANALYTICS 停用時不載入", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_DISABLE_ANALYTICS", "1");
    expect(render(false)).not.toContain(ANALYTICS_SCRIPT_SRC);
  });
});

describe("R7-3 metadata、robots、sitemap、favicon、分享圖", () => {
  it("metadata：metadataBase、Open Graph 與 Twitter 卡片", () => {
    expect(String(metadata.metadataBase)).toBe(`${SITE_URL}/`);
    expect(SITE_URL).toBe("https://profitlens-tau.vercel.app");
    expect(metadata.title).toBe(labels.brand.title);
    expect(metadata.description).toBe(labels.brand.description);
    expect(metadata.openGraph).toMatchObject({ title: labels.brand.title, description: labels.brand.description, url: "/", siteName: labels.brand.name, locale: "zh_TW", type: "website" });
    expect(metadata.openGraph?.images).toEqual([{ url: "/og.png", width: 1200, height: 630, alt: labels.brand.title }]);
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image", title: labels.brand.title, description: labels.brand.description, images: ["/og.png"] });
  });
  it("robots 允許全部並指向 sitemap；sitemap 只有正式站一個網址", () => {
    expect(robots()).toEqual({ rules: { userAgent: "*", allow: "/" }, sitemap: "https://profitlens-tau.vercel.app/sitemap.xml" });
    const before = Date.now();
    const entries = sitemap();
    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe("https://profitlens-tau.vercel.app");
    expect(entries[0].lastModified).toBeInstanceOf(Date);
    expect((entries[0].lastModified as Date).getTime()).toBeGreaterThanOrEqual(before);
  });
  it("src/app/icon.svg：品牌綠底＋白線的 lens 符號（24×24 viewBox）", () => {
    const svg = readFileSync(resolve("src/app/icon.svg"), "utf8");
    expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 24 24"/);
    expect(svg).toContain('fill="#1f4d3f"');
    expect(svg).toContain('stroke="#fff"');
    expect(svg).toContain('d="M4 18V6h5v12 M13 18V3h6v15 M3 21h18"');
  });
  it("public/og.png 是 1200×630 PNG", () => {
    const png = readFileSync(resolve("public/og.png"));
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });
  it("html lang 維持 zh-Hant-TW", () => {
    expect(renderToStaticMarkup(createElement(RootLayout, null, null))).toContain('<html lang="zh-Hant-TW">');
  });
});

describe("R7-3 空狀態文案與 R7-4 進階驗證頁預設隱藏", () => {
  it("空狀態與 README「30 秒試用」一致：載入示範資料 → 本期三件事 → 看明細；標示示範資料是虛構的", () => {
    // V3-2a（copy-rewrite.csv emptyState.*）：首次進入只留標題與一句說明；舊問句改成獨立的 relaunch.ogHeadline（分享圖）。
    expect(labels.emptyState.title).toBe("還沒有資料");
    expect(labels.relaunch.ogHeadline).not.toBe(labels.emptyState.title);
    expect(labels.emptyState.body).toBe("匯入銷售、通路費用、廣告三份日報 CSV，或先用示範資料（虛構）看看。");
    expect(labels.emptyState.body).toContain("示範資料（虛構）");
    // README「30 秒試用」引用畫面上真的有的按鈕與區塊名稱，並標示示範資料是虛構的。
    const readme = readFileSync(resolve("README.md"), "utf8");
    const trial = readme.slice(readme.indexOf("## 30 秒試用"), readme.indexOf("\n## ", readme.indexOf("## 30 秒試用") + 1));
    for (const name of [labels.buttons.loadDemo, labels.sections.topThree, labels.buttons.viewEvidence]) expect(trial).toContain(`「${name}」`);
    expect(trial).toContain("虛構");
    expect(labels.emptyState.steps).toHaveLength(3);
    const html = renderToStaticMarkup(createElement(Dashboard));
    expect(html).toContain(`<p>${labels.emptyState.body}</p>`);
    expect(html).toContain(labels.emptyState.title);
  });
  it("首頁側欄不顯示「開發者驗證」（只有 #validation 才出現），其他七個分頁都在", () => {
    const html = renderToStaticMarkup(createElement(Dashboard));
    expect(html).not.toContain(labels.nav.validation.label);
    expect(html).not.toContain('data-testid="validation-panel"');
    for (const id of ["overview", "diagnosis", "products", "scenarios", "actions", "meeting", "data"] as const) expect(html).toContain(`<span>${labels.nav[id].label}</span>`);
  });
});
