import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers(){return ['/forgot-password','/reset-password','/verify-email'].map(source=>({source,headers:[{key:'Referrer-Policy',value:'no-referrer'},{key:'Cache-Control',value:'no-store'},{key:'X-Robots-Tag',value:'noindex, nofollow'}]}));},
  devIndicators: false,
  // Isolated local phase proof; the serving production build stays untouched.
  distDir: process.env.TW_PROOF_DIST === "1" ? ".next-u1-proof" : ".next",
};

export default nextConfig;
