import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { dataStatus, PRODUCT_HIGHLIGHT_LIMIT, productHighlights, rateAvailability } from "@/application/product-highlights";
import { formatAmountL2, formatCount, formatRateL2, formatSignedDelta, metricDefinitions } from "@/application/presentation";
import { createSnapshot, hashInput } from "@/application/workspace";
import { ProductComparisonPanel } from "@/components/product-comparison-panel";
import { compareProducts, type ProductComparisonRow } from "@/domain/product-comparison";
import { validateDataset } from "@/domain/validation";
import type { Dataset, DatasetInput } from "@/domain/types";
import { fill, labels } from "@/i18n";
import { fixture } from "./helpers/fixtures";

function dataset(input: DatasetInput = fixture()): Dataset {
  const result = validateDataset(input);
  expect(result.classification).not.toBe("blocking");
  return result.dataset!;
}
function withSales(rows: string[], confirmed = true): DatasetInput {
  const input = fixture();
  input.manifest = { ...(input.manifest as object), sales_coverage_confirmed: confirmed };
  input.files["sales_daily.csv"] = "date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency\n" + rows.join("\n") + "\n";
  return input;
}
const sale = (date: string, sku: string, gross: string, cogs: string, channel = "DTC", refund = "0") => `${date},${channel},${sku},HOME,1,${gross},0,${refund},${cogs},TWD`;
const aug1 = "2026-08-01";
const aug2 = "2026-08-02";
const id = (row: ProductComparisonRow) => `${row.channel}/${row.sku}`;

/**
 * fixtures/golden/sales_daily.csv 手算（商品毛利＝原價 − 折扣 − 退款 − 成本）：
 * 上期 2026-08-01：第 2 行 DTC/A 1000−100−0−400＝500.00；第 3 行 DTC/B 500−0−50−200＝250.00；
 *                  第 4 行 MARKETPLACE/A 600−60−0−270＝270.00；第 5 行 MARKETPLACE/B 400−40−0−180＝180.00。
 * 本期 2026-08-02：第 6 行 DTC/A 1400−210−70−580＝540.00；第 7 行 DTC/B 400−20−20−160＝200.00；
 *                  第 8 行 MARKETPLACE/A 800−120−40−360＝280.00；第 9 行 MARKETPLACE/B 500−100−50−225＝125.00。
 * 差額：DTC/A +40.00、DTC/B −50.00、MARKETPLACE/A +10.00、MARKETPLACE/B −55.00。
 * 本期毛利率（毛利 ÷ 淨營收）：DTC/A 540/1120＝48.21%；DTC/B 200/360＝55.56%；MARKETPLACE/A 280/640＝43.75%；MARKETPLACE/B 125/350＝35.71%。
 */
const GOLDEN_CURRENT_GP = { "DTC/A": "540.00", "DTC/B": "200.00", "MARKETPLACE/A": "280.00", "MARKETPLACE/B": "125.00" } as const;
const GOLDEN_GP_CHANGE = { "DTC/A": "40.00", "DTC/B": "-50.00", "MARKETPLACE/A": "10.00", "MARKETPLACE/B": "-55.00" } as const;

describe("R5-6 productHighlights：本期毛利最差／毛利增加最多", () => {
  it("golden：最差依本期毛利由低到高，增加最多只列正差額由高到低（手算值）", () => {
    const rows = compareProducts(dataset()).rows;
    for (const row of rows) {
      expect(row.current.metrics.gross_profit.value).toBe(GOLDEN_CURRENT_GP[id(row) as keyof typeof GOLDEN_CURRENT_GP]);
      expect(row.changes.gross_profit.value).toBe(GOLDEN_GP_CHANGE[id(row) as keyof typeof GOLDEN_GP_CHANGE]);
    }
    const { worstCurrent, bestChange } = productHighlights(rows);
    // 125.00 < 200.00 < 280.00 < 540.00
    expect(worstCurrent.map(id)).toEqual(["MARKETPLACE/B", "DTC/B", "MARKETPLACE/A", "DTC/A"]);
    // +40.00 > +10.00；−50.00、−55.00 不列入
    expect(bestChange.map(id)).toEqual(["DTC/A", "MARKETPLACE/A"]);
    expect(bestChange.map(row => row.changes.gross_profit.value)).toEqual(["40.00", "10.00"]);
  });

  it("預設上限 10；limit 截斷、0 為空、超過列數回傳全部；不改原陣列", () => {
    const rows = compareProducts(dataset()).rows;
    const before = structuredClone(rows);
    expect(PRODUCT_HIGHLIGHT_LIMIT).toBe(10);
    expect(productHighlights(rows, 2).worstCurrent.map(id)).toEqual(["MARKETPLACE/B", "DTC/B"]);
    expect(productHighlights(rows, 1).bestChange.map(id)).toEqual(["DTC/A"]);
    expect(productHighlights(rows, 0)).toEqual({ worstCurrent: [], bestChange: [] });
    expect(productHighlights(rows, 999).worstCurrent).toHaveLength(4);
    expect(productHighlights([])).toEqual({ worstCurrent: [], bestChange: [] });
    expect(rows).toEqual(before);
    // 12 個商品時預設只取 10 個：本期毛利 1..12 元，最差 10 個是 1..10。
    const many = compareProducts(dataset(withSales(Array.from({ length: 12 }, (_, index) => sale(aug2, `S${String(index + 1).padStart(2, "0")}`, String(index + 1), "0"))))).rows;
    expect(productHighlights(many).worstCurrent.map(row => row.sku)).toEqual(["S01", "S02", "S03", "S04", "S05", "S06", "S07", "S08", "S09", "S10"]);
    expect(productHighlights(many).bestChange).toHaveLength(10);
  });

  it("limit 必須是 ≥ 0 的整數：負數、小數、NaN、Infinity 都拒絕", () => {
    const rows = compareProducts(dataset()).rows;
    for (const limit of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => productHighlights(rows, limit)).toThrow(RangeError);
  });

  it("缺成本（null）的列兩張表都不列入，不當成 0 或負數", () => {
    const rows = compareProducts(dataset(fixture("errors/missing_cogs"))).rows;
    const affected = rows.find(row => id(row) === "DTC/A")!;
    expect(affected.current.metrics.gross_profit.value).toBeNull();
    expect(affected.changes.gross_profit.value).toBeNull();
    const { worstCurrent, bestChange } = productHighlights(rows);
    // missing_cogs 只有第 6 行 DTC/A 缺成本；其餘三列同 golden。
    expect(worstCurrent.map(id)).toEqual(["MARKETPLACE/B", "DTC/B", "MARKETPLACE/A"]);
    expect(bestChange.map(id)).toEqual(["MARKETPLACE/A"]);
  });

  it("沒有正差額時增加最多為空陣列；差額 0 不算增加", () => {
    // DOWN：上期 100−40＝60.00、本期 80−40＝40.00（−20.00）；FLAT：兩期 70−10＝60.00（0.00）
    const rows = compareProducts(dataset(withSales([sale(aug1, "DOWN", "100", "40"), sale(aug2, "DOWN", "80", "40"), sale(aug1, "FLAT", "70", "10"), sale(aug2, "FLAT", "70", "10")]))).rows;
    expect(rows.map(row => [row.sku, row.current.metrics.gross_profit.value, row.changes.gross_profit.value])).toEqual([["DOWN", "40.00", "-20.00"], ["FLAT", "60.00", "0.00"]]);
    const { worstCurrent, bestChange } = productHighlights(rows);
    expect(bestChange).toEqual([]);
    expect(worstCurrent.map(row => row.sku)).toEqual(["DOWN", "FLAT"]);
  });

  it("同值依通路、SKU 字典序；負毛利與只在上期出現（本期確認為 0）的列照常比較", () => {
    const rows = compareProducts(dataset(withSales([
      sale(aug2, "B", "100", "40"), sale(aug2, "A", "100", "40", "MARKETPLACE"), sale(aug2, "A", "100", "40"),
      sale(aug2, "LOSS", "10", "30"), sale(aug1, "EXIT", "100", "40"),
    ]))).rows;
    const { worstCurrent, bestChange } = productHighlights(rows);
    // LOSS −20.00 < EXIT 0.00（已確認涵蓋，本期無列＝0）< 三個 60.00（DTC/A、DTC/B、MARKETPLACE/A）
    expect(worstCurrent.map(id)).toEqual(["DTC/LOSS", "DTC/EXIT", "DTC/A", "DTC/B", "MARKETPLACE/A"]);
    // 差額：三個 +60.00 同值依通路、SKU；LOSS −20.00、EXIT −60.00 不列入
    expect(bestChange.map(id)).toEqual(["DTC/A", "DTC/B", "MARKETPLACE/A"]);
  });

  it("用 bigint 分位比較，超過 Number 精度的金額仍排對", () => {
    const rows = compareProducts(dataset(withSales([sale(aug2, "Z", "9007199254740993.01", "0"), sale(aug2, "A", "9007199254740993.02", "0")]))).rows;
    expect(productHighlights(rows).worstCurrent.map(row => row.sku)).toEqual(["Z", "A"]);
    expect(productHighlights(rows).bestChange.map(row => row.sku)).toEqual(["A", "Z"]);
  });
});

describe("R5-6 dataStatus：資料狀態五種", () => {
  it("兩期皆有／僅本期／僅上期", () => {
    expect(compareProducts(dataset()).rows.map(dataStatus)).toEqual(["both", "both", "both", "both"]);
    const rows = compareProducts(dataset(withSales([sale(aug1, "EXIT", "100", "40"), sale(aug2, "ENTER", "50", "10")]))).rows;
    expect(rows.map(row => [row.sku, dataStatus(row)])).toEqual([["ENTER", "current_only"], ["EXIT", "previous_only"]]);
  });

  it("任一期缺成本 → 成本未知，優先於兩期皆有、僅本期與涵蓋未確認", () => {
    const missing = compareProducts(dataset(fixture("errors/missing_cogs"))).rows;
    expect(missing.map(row => [id(row), dataStatus(row)])).toEqual([["DTC/A", "cost_unknown"], ["DTC/B", "both"], ["MARKETPLACE/A", "both"], ["MARKETPLACE/B", "both"]]);
    const previousMissing = compareProducts(dataset(withSales([sale(aug1, "OLD", "100", ""), sale(aug2, "OLD", "100", "40"), sale(aug2, "NEW", "100", "")]))).rows;
    expect(previousMissing.map(row => [row.sku, row.activity, dataStatus(row)])).toEqual([["NEW", "current_only", "cost_unknown"], ["OLD", "both_observed", "cost_unknown"]]);
    const unconfirmed = compareProducts(dataset(withSales([sale(aug2, "NEW", "100", "")], false))).rows[0];
    expect(unconfirmed.activity).toBe("coverage_unknown");
    expect(unconfirmed.current.metrics.gross_profit.reason_codes).toContain("MISSING_COGS");
    expect(dataStatus(unconfirmed)).toBe("cost_unknown");
  });

  it("未確認銷售完整性 → 銷售完整性待確認", () => {
    const row = compareProducts(dataset(withSales([sale(aug2, "ENTER", "50", "10")], false))).rows[0];
    expect(row.activity).toBe("coverage_unknown");
    expect(dataStatus(row)).toBe("coverage_unknown");
  });

  it("每個狀態都有中文標籤；「涵蓋未確認」沿用既有「銷售完整性待確認」語意", () => {
    for (const status of ["both", "current_only", "previous_only", "cost_unknown", "coverage_unknown"] as const) expect(labels.productHighlights.status[status]).toMatch(/\S/);
    expect(labels.productHighlights.status.coverage_unknown).toBe(labels.ui.productComparisonPanel.activity.coverageUnknown);
  });
});

describe("R5-6 rateAvailability：毛利率 null 的兩種顯示", () => {
  it("有值 → value；淨營收 ≤ 0 → 不適用；缺成本、涵蓋未確認、無原因 → 資料待補", () => {
    expect(rateAvailability(compareProducts(dataset()).rows[0].current.metrics.gross_margin)).toBe("value");
    const refundOnly = compareProducts(dataset(withSales([sale(aug1, "REFUND", "100", "40"), sale(aug2, "REFUND", "0", "-40", "DTC", "100")]))).rows[0];
    expect(refundOnly.current.metrics.gross_margin.reason_codes).toContain("NON_POSITIVE_DENOMINATOR");
    expect(rateAvailability(refundOnly.current.metrics.gross_margin)).toBe("not_applicable");
    const exit = compareProducts(dataset(withSales([sale(aug1, "EXIT", "100", "40")]))).rows[0];
    expect(rateAvailability(exit.current.metrics.gross_margin)).toBe("not_applicable");
    const missing = compareProducts(dataset(fixture("errors/missing_cogs"))).rows[0];
    expect(rateAvailability(missing.current.metrics.gross_margin)).toBe("missing");
    const unconfirmed = compareProducts(dataset(withSales([sale(aug2, "ENTER", "50", "10")], false))).rows[0];
    expect(rateAvailability(unconfirmed.previous.metrics.gross_margin)).toBe("missing");
    expect(rateAvailability({ value: null, reason_codes: [] })).toBe("missing");
    expect(rateAvailability({ value: null, reason_codes: ["INVALID_OR_MISSING_METRIC"] })).toBe("missing");
    expect(rateAvailability({ value: "0.000000000000", reason_codes: [] })).toBe("value");
  });
});

describe("R5-6 商品毛利頁版面（伺服器端渲染）", () => {
  async function render(input: DatasetInput = fixture()) {
    const ds = dataset(input);
    const snapshot = await createSnapshot(ds, {}, await hashInput(input));
    return renderToStaticMarkup(createElement(ProductComparisonPanel, { dataset: ds, snapshot, onEvidence: () => undefined }));
  }
  const between = (html: string, start: string, end: string) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
  const headers = (html: string) => [...html.matchAll(/<th scope="col">([^<]*)<\/th>/g)].map(match => match[1]);
  const rowHeaders = (html: string) => [...html.matchAll(/<th scope="row">([^<]*)/g)].map(match => match[1].trim());
  const per = (period: "previous" | "current", label: string) => `${labels.periods[period]}${label}`;
  const change = (name: "gross_profit" | "net_revenue") => `${metricDefinitions[name].label}${labels.csvSuffix.change}`;
  /** V3-2b：表格是 L2，金額欄表頭標一次「（元）」。 */
  const yuan = (label: string) => fill(labels.units.yuanColumn, { label });
  /** 依序出現的格式化字串（中間可夾任何標記）。 */
  const inOrder = (...parts: string[]) => new RegExp(parts.map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s\\S]*"));

  it("兩張小表在完整表之前，最多 10 列，欄位為 SKU、品類、本期毛利、差額、毛利率", async () => {
    const html = await render();
    expect(html.indexOf('data-testid="product-worst"')).toBeGreaterThan(-1);
    expect(html.indexOf('data-testid="product-worst"')).toBeLessThan(html.indexOf('data-testid="product-best"'));
    expect(html.indexOf('data-testid="product-best"')).toBeLessThan(html.indexOf('data-testid="product-table"'));
    expect(html).toContain(labels.sections.productTopBottom);
    const worst = between(html, 'data-testid="product-worst"', "</section>");
    const best = between(html, 'data-testid="product-best"', "</section>");
    expect(worst).toContain(fill(labels.productHighlights.worstTitle, { n: 10 }));
    expect(best).toContain(fill(labels.productHighlights.bestTitle, { n: 10 }));
    const expected = ["SKU", labels.csvColumns.category, yuan(per("current", metricDefinitions.gross_profit.shortLabel)), yuan(change("gross_profit")), per("current", metricDefinitions.gross_margin.shortLabel)];
    expect(headers(worst)).toEqual(expected);
    expect(headers(best)).toEqual(expected);
    expect(rowHeaders(worst)).toEqual(["B", "B", "A", "A"]);
    expect(worst).toMatch(/<th scope="row">B <small>MARKETPLACE<\/small><\/th>/);
    expect(rowHeaders(best)).toEqual(["A", "A"]);
    // 手算：A／DTC 本期毛利 540.00、差額 +40.00、毛利率 540 ÷ 1,120 = 48.21%；B 本期毛利 125.00、差額 −55.00、毛利率 35.71%（L2：整數元、一位小數 %）。
    expect(best).toMatch(inOrder('<th scope="row">A <small>DTC</small></th>', formatAmountL2("540.00"), formatSignedDelta("40.00", "L2"), formatRateL2("0.482142857143")));
    expect(worst).toMatch(inOrder(formatAmountL2("125.00"), formatSignedDelta("-55.00", "L2"), formatRateL2("0.357142857143")));
    expect(worst).toContain('class="table-scroll" tabindex="0" role="region"');
  });

  it("沒有毛利增加的商品時顯示一句說明", async () => {
    const html = await render(withSales([sale(aug1, "DOWN", "100", "40"), sale(aug2, "DOWN", "80", "40")]));
    const best = between(html, 'data-testid="product-best"', "</section>");
    expect(best).toContain(labels.productHighlights.bestEmpty);
    expect(best).not.toContain("<table");
  });

  it("完整表欄位順序、件數與資料狀態；更多欄位預設收起；說明縮為一句", async () => {
    const html = await render();
    const table = between(html, 'data-testid="product-table"', "</table>");
    expect(headers(table)).toEqual([
      labels.csvColumns.channel, "SKU", labels.csvColumns.category, per("current", labels.assist.items.units_sold.label),
      yuan(per("current", metricDefinitions.net_revenue.shortLabel)), yuan(per("current", metricDefinitions.gross_profit.shortLabel)), per("current", metricDefinitions.gross_margin.shortLabel),
      yuan(change("gross_profit")), yuan(change("net_revenue")), yuan(per("previous", metricDefinitions.net_revenue.label)), yuan(per("previous", metricDefinitions.gross_profit.label)), labels.productHighlights.columns.dataStatus,
    ]);
    // 預設排序：商品毛利差額由小到大（MARKETPLACE/B −55 → DTC/B −50 → MARKETPLACE/A +10 → DTC/A +40）
    expect(rowHeaders(table)).toEqual(["B", "B", "A", "A"]);
    // V3-2b：件數欄是 L2（只有數字，單位在表頭「售出件數」）。
    expect(table).toContain(`>${formatCount("3", "L2")}</button>`);
    expect(table).toContain(labels.productHighlights.status.both);
    expect(html).toMatch(/aria-pressed="false" data-testid="product-more-columns"/);
    expect(html).toContain(labels.productHighlights.intro);
    expect(html).not.toContain(labels.ui.productComparisonPanel.intro);
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain(labels.ui.productComparisonPanel.tableCaption);
  });

  it("缺成本列顯示「成本未知」與「資料待補」；淨營收 ≤ 0 的毛利率顯示「不適用」", async () => {
    const missing = between(await render(fixture("errors/missing_cogs")), 'data-testid="product-table"', "</table>");
    expect(missing).toContain(labels.productHighlights.status.cost_unknown);
    expect(missing).toContain(labels.ui.productComparisonPanel.costMissing);
    const refund = between(await render(withSales([sale(aug1, "REFUND", "100", "40"), sale(aug2, "REFUND", "0", "-40", "DTC", "100")])), 'data-testid="product-table"', "</table>");
    expect(refund).toContain(labels.status.notApplicable);
  });
});
