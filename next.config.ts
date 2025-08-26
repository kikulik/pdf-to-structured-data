import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",

  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      // keep native-canvas out of the client bundle
      canvas: path.resolve(__dirname, "./empty-module.ts"),
      // ✅ if anything asks for the MJS worker, point it to the JS worker we use above
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
