import type { NextConfig } from "next";
import path from "path";

// Use process.cwd() — __dirname can be relative (".") when run via pnpm
const projectRoot = process.cwd();
const convexRoot = path.resolve(projectRoot, "../../convex");

const nextConfig: NextConfig = {
  transpilePackages: ["convex"],
  webpack: (config) => {
    config.resolve ??= {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@": projectRoot,
      "@convex": convexRoot,
    };
    return config;
  },
  turbopack: {
    resolveAlias: {
      // The @/* alias maps to the project root (same as tsconfig paths).
      // Explicit here because Turbopack's production bundler on Vercel
      // does not always pick up tsconfig paths for module resolution.
      "@": projectRoot,
      // Convex lives at the monorepo root, outside this app's directory.
      "@convex": convexRoot,
    },
  },
};

export default nextConfig;
