import type { MetadataRoute } from "next";
import { SITE_URL } from "./site";

// R7-3：robots.txt 允許全部；指向單頁 sitemap。
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/" }, sitemap: `${SITE_URL}/sitemap.xml` };
}
