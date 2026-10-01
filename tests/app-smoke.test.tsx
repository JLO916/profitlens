import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RootLayout, { metadata } from "@/app/layout";
import HomePage from "@/app/page";

describe("M4 工作台初始畫面 smoke test", () => {
  it("渲染空工作區、六個頁面入口及財務口徑，沒有硬寫財務結果", () => {
    const html = renderToStaticMarkup(createElement(HomePage));

    expect(html).toContain("ProfitLens");
    for (const label of ["經營總覽", "通路診斷", "商品毛利", "資料工作區", "情境試算", "行動摘要", "尚未載入資料", "載入示範資料"]) expect(html).toContain(label);
    expect(html).toContain("行銷後貢獻不等於公司淨利");
    expect(html).not.toContain("1,269,792.73");
    expect(html).not.toContain("kpi-contribution_after_marketing");
  });

  it("根版型使用繁體中文語系，且保留傳入的頁面內容", () => {
    const html = renderToStaticMarkup(
      <RootLayout>
        <HomePage />
      </RootLayout>,
    );

    expect(html).toContain('<html lang="zh-Hant">');
    expect(html).toContain('id="main-content"');
    expect(html).toContain("ProfitLens");
    expect(metadata.title).toBe("ProfitLens｜電商獲利診斷工作台");
  });
});
