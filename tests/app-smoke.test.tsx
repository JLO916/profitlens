import { createElement } from "react";
import { labels } from "../src/i18n";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RootLayout, { metadata } from "@/app/layout";
import HomePage from "@/app/page";

describe("M4 工作台初始畫面 smoke test", () => {
  it("渲染空工作區、六個頁面入口及財務口徑，沒有硬寫財務結果", () => {
    const html = renderToStaticMarkup(createElement(HomePage));

    expect(html).toContain("ProfitLens");
    for (const label of [
      labels.nav.overview.label,
      labels.nav.diagnosis.label,
      labels.nav.products.label,
      labels.nav.data.label,
      labels.nav.scenarios.label,
      labels.nav.actions.label,
      labels.status.empty,
      labels.buttons.loadDemo,
    ]) expect(html).toContain(label);
    expect(html).toContain(labels.basis.footer);
    expect(html).not.toContain("1,269,792.73");
    expect(html).not.toContain("kpi-contribution_after_marketing");
  });

  it("根版型使用繁體中文語系，且保留傳入的頁面內容", () => {
    const html = renderToStaticMarkup(
      <RootLayout>
        <HomePage />
      </RootLayout>,
    );

    expect(html).toContain('<html lang="zh-Hant-TW">');
    expect(html).toContain('id="main-content"');
    expect(html).toContain("ProfitLens");
    expect(metadata.title).toBe(labels.brand.title);
  });
});
