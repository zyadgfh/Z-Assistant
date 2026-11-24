import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
];

const config: NextConfig = {
  // The dashboard imports the shared TypeScript core via tsconfig paths
  // (../../packages/core) so Vercel builds it without workspace-root installs.
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
