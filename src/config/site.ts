/**
 * Product identity and SEO settings — the single place to rename the app.
 *
 * SITE.url comes from Netlify's build-time `URL` variable (see next.config.ts), so canonical
 * links, the sitemap and social images get absolute URLs on deploy.
 */
export const SITE = {
  name: "KillMyPDF",
  /** Used where space is tight (PWA name, tab titles). */
  shortName: "KillMyPDF",
  tagline: "Kill the PDF hassle.",
  description:
    "KillMyPDF is a free set of online PDF tools: edit text in a PDF, merge PDFs, reorder and delete pages, split PDFs and turn images into PDF. No sign-up, no watermarks — everything runs in your browser.",
  keywords: [
    "KillMyPDF",
    "PDF tools",
    "online PDF editor",
    "edit PDF text",
    "merge PDF",
    "split PDF",
    "reorder PDF pages",
    "images to PDF",
    "free PDF tools",
    "PDF editor no sign up",
  ],
  url: (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, ""),
  /** Public repository, linked from the header and footer. */
  repoUrl: process.env.NEXT_PUBLIC_REPO_URL || "https://github.com/mohitphoenix24/Kill-My-PDF",
  themeColor: "#0d0d0f",
} as const;
