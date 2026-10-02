import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { labels } from "@/i18n";

export const metadata: Metadata = {
  title: labels.brand.title,
  description: "從銷售、成本與廣告資料，理解行銷後貢獻的變化。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
