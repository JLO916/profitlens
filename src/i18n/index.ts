// 標籤字典入口。R0 建立，尚未接線；R2 起元件、匯出、AI 預覽一律從這裡取字。
import { labels } from "./labels.zh-TW";

export { labels };
export type { Labels, MetricLabel, MetricUnit, RuleLabel, RuleUnit } from "./labels.zh-TW";

type Join<K extends string, P extends string> = `${K}.${P}`;

/** 字典中所有字串葉節點的點分路徑，例如 "metrics.net_revenue.label"。 */
export type LabelPath<T = typeof labels> = {
  [K in keyof T & string]: T[K] extends string ? K : T[K] extends readonly unknown[] ? never : T[K] extends object ? Join<K, LabelPath<T[K]>> : never;
}[keyof T & string];

/** 把 {placeholder} 填入模板；缺的占位符留空字串，方便在畫面上發現漏值。 */
export function fill(template: string, values: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] === null || values[key] === undefined ? "" : String(values[key]));
}

/** 依點分路徑取字串；路徑不存在或不是字串時回傳路徑本身，方便在畫面上發現漏字。 */
export function t(path: LabelPath | (string & {})): string {
  let node: unknown = labels;
  for (const key of path.split(".")) {
    if (node === null || typeof node !== "object" || !Object.hasOwn(node, key)) return path;
    node = (node as Record<string, unknown>)[key];
  }
  return typeof node === "string" ? node : path;
}
