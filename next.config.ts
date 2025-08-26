import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",

  // Keep the canvas stub to avoid optional native deps in the client.
  // Remove the pdfjs-dist alias: we now import the worker with ?worker&url.
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      canvas: path.resolve(__dirname, "./empty-module.ts"),
    };
    return config;
  },

  experimental: {
    turbo: {
      resolveAlias: {
        canvas: "./empty-module.ts",
      },
      // Turbopack understands ?worker&url out of the box.
    },
  },
};

export default nextConfig;
