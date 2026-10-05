import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fail the production build on type errors instead of shipping them. Linting
  // runs as its own CI step (next lint was removed in Next.js 16).
  typescript: { ignoreBuildErrors: false },
  // Needed so `pino` and `pg` are not bundled for the server runtime.
  serverExternalPackages: ["pino", "pg", "pg-boss"],
  poweredByHeader: false,
};

export default nextConfig;
