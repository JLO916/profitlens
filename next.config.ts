import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // 保留專案既有 AGENTS.md，避免 next dev 自動追加框架規則。
  agentRules: false,
  // R6：pptxgenjs 的 ES build 在 Node 環境才用的 import("node:fs")／import("node:https") 會讓 webpack 的瀏覽器端建置失敗
  // （Unhandled scheme）。只在 client bundle 把 node: 前綴去掉並以空模組取代；pptxgenjs 本身的 "browser" 欄位也宣告這些模組為 false。
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      config.plugins.push(new webpack.NormalModuleReplacementPlugin(/^node:/, (resource: { request: string }) => { resource.request = resource.request.replace(/^node:/, ""); }));
      config.resolve.fallback = { ...(config.resolve.fallback ?? {}), fs: false, https: false, os: false, path: false };
    }
    return config;
  },
};

export default nextConfig;
