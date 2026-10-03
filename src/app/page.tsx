import { Dashboard } from "@/components/dashboard";
import { analyticsEnabled } from "@/application/analytics";

export default function HomePage() {
  // D9＝B：頁尾的使用分析揭露只在實際載入分析腳本時顯示（與 layout 同一判斷）。
  return <Dashboard analytics={analyticsEnabled({ VERCEL_ENV: process.env.VERCEL_ENV, NEXT_PUBLIC_DISABLE_ANALYTICS: process.env.NEXT_PUBLIC_DISABLE_ANALYTICS })} />;
}
