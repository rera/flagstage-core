import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: [
    "@flagstage/agent",
    "@flagstage/ai",
    "@flagstage/auth",
    "@flagstage/config",
    "@flagstage/core",
    "@flagstage/db",
    "@flagstage/importer",
    "@flagstage/publish",
    "@flagstage/storage",
    "@flagstage/ui"
  ],
  poweredByHeader: false
};

export default nextConfig;
