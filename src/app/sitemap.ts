import type { MetadataRoute } from "next";
import { GUIDE_AREAS, guideAreaPath } from "@/application/guide";
import { SITE_URL } from "./site";

// R7-3：sitemap.xml 在 build 時靜態產生，lastModified 即 build 當下。
// V41-1（D-V41-13＝A）：加說明首頁 /guide 與已上線的功能區頁（由 GUIDE_AREAS 產生；V41-1 還沒有功能區頁，共 2 個網址）。
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: SITE_URL, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/guide`, lastModified, changeFrequency: "weekly", priority: 0.8 },
    ...GUIDE_AREAS.map(({ area }) => ({ url: `${SITE_URL}${guideAreaPath(area)}`, lastModified, changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}
