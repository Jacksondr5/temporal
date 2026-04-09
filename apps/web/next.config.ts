import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Allow importing from the root convex/ directory
  transpilePackages: ["convex"],
  typescript: {
    tsconfigPath: "./tsconfig.json",
  },
  turbopack: {
    resolveAlias: {
      // Convex lives at the monorepo root, outside this app's directory.
      // Turbopack needs an explicit alias since it's outside the project root.
      "@convex": path.resolve(__dirname, "../../convex"),
    },
  },
};

export default nextConfig;
