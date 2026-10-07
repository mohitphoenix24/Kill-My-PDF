import type { NextConfig } from "next";

// Static export: all PDF processing runs in the browser, so the build output
// (`out/`) is plain static assets that Netlify can serve without functions.
const nextConfig: NextConfig = {
  output: "export",
  // The floating "N" dev badge overlaps the editor's canvas controls.
  devIndicators: false,
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
