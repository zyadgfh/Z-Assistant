import type { NextConfig } from "next";

const config: NextConfig = {
  // The dashboard imports the shared TypeScript core directly from the workspace.
  transpilePackages: ["@maya/core"],
  eslint: { ignoreDuringBuilds: true },
};

export default config;
