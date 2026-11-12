import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@flagstage/config", "@flagstage/db", "@flagstage/storage", "@flagstage/ui"],
  poweredByHeader: false
};

export default nextConfig;
