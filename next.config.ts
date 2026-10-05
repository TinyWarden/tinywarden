import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  // Isolated local phase proof; the serving production build stays untouched.
  distDir: process.env.TW_PROOF_DIST === "1" ? ".next-u1-proof" : ".next",
};

export default nextConfig;
