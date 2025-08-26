// next.config.ts (unchanged from the last step)
import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      canvas: path.resolve(__dirname, "./empty-module.ts"),
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
