import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  // in next.config.ts
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      canvas: require("path").resolve(__dirname, "./empty-module.ts"),
      "pdfjs-dist/build/pdf.worker.min.mjs": "pdfjs-dist/build/pdf.worker.min.js",
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
