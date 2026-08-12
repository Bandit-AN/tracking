import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  turbopack: {
    root: process.cwd(),
  },
  typescript: {
    tsconfigPath: "./tsconfig.vercel.json",
  },
};

export default nextConfig;
