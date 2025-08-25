import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  webpack: (config) => {
    // Make sure optional 'canvas' never gets required server-side.
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      canvas: path.resolve(__dirname, "./empty-module.ts"),
      // Some bundlers fail on the ESM worker path; alias it to the JS worker.
      "pdfjs-dist/build/pdf.worker.min.mjs":
        "pdfjs-dist/build/pdf.worker.min.js",
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
