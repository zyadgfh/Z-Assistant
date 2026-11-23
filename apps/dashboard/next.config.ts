import type { NextConfig } from "next";

const config: NextConfig = {
  // The dashboard imports the shared TypeScript core via tsconfig paths
  // (../../packages/core) so Vercel builds it without workspace-root installs.
  eslint: { ignoreDuringBuilds: true },
};

export default config;
