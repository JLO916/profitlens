import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // 保留專案既有 AGENTS.md，避免 next dev 自動追加框架規則。
  agentRules: false,
};

export default nextConfig;
