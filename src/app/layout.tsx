import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { labels } from "@/i18n";

export const metadata: Metadata = {
  title: labels.brand.title,
  description: labels.brand.description,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant-TW">
      <body>{children}</body>
    </html>
  );
}
