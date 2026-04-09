import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Allow importing from the root convex/ directory
  transpilePackages: ["convex"],
  turbopack: {
    resolveAlias: {
      "@convex": path.resolve(__dirname, "../../convex"),
    },
  },
};

export default nextConfig;
