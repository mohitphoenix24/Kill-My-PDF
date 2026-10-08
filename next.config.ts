import type { NextConfig } from "next";

// Static export: all PDF processing runs in the browser, so the build output
// (`out/`) is plain static assets that Netlify can serve without functions.
const nextConfig: NextConfig = {
  output: "export",
  // /tool/ → tool/index.html: works on every static host, and gives each tool a clean canonical URL.
  trailingSlash: true,
  // The floating "N" dev badge overlaps the editor's canvas controls.
  devIndicators: false,
  env: {
    // Netlify sets URL (the site's primary URL) at build time; used for canonical/OG/sitemap URLs.
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || process.env.URL || "",
  },
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
