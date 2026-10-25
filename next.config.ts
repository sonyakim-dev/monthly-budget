import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // E2E runs its own dev server; a separate build folder lets it run alongside `pnpm dev`.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  async redirects() {
    return [
      { source: "/home", destination: "/", permanent: true },
      { source: "/activity", destination: "/summary", permanent: true },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
