import type { NextConfig } from "next";

// Set by the GitHub Pages workflow (e.g. "/receipts"); empty for local and root-domain hosting.
const basePath = process.env.PAGES_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  // Every page is static and all analysis runs in the browser, so the site exports to plain files.
  output: "export",
  trailingSlash: true,
  basePath,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
