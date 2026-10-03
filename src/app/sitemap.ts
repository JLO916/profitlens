import type { MetadataRoute } from "next";
import { SITE_URL } from "./site";

// R7-3：單頁 sitemap。sitemap.xml 在 build 時靜態產生，lastModified 即 build 當下。
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: SITE_URL, lastModified: new Date(), changeFrequency: "weekly", priority: 1 }];
}
