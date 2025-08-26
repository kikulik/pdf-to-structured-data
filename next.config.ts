import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      // keep native-canvas out of client bundles
      canvas: path.resolve(__dirname, "./empty-module.ts"),
      // ⛔ REMOVE any pdfjs worker alias you added earlier
    };
    return config;
  },
  experimental: {
    turbo: {
      resolveAlias: {
        canvas: "./empty-module.ts",
      },
    },
  },
};

export default nextConfig;
