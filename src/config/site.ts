/**
 * Product identity and SEO settings — the single place to rename the app.
 *
 * SITE_URL comes from Netlify's build-time `URL` variable (see next.config.ts),
 * so canonical links, the sitemap and social images get absolute URLs on deploy.
 */
export const SITE = {
  name: "KillMyPDF",
  /** Used where space is tight (PWA name, tab titles). */
  shortName: "KillMyPDF",
  tagline: "Edit the text in any PDF. Keep the original look.",
  description:
    "KillMyPDF is a free online PDF text editor. Click any line in a digital PDF, change the words, and download a real PDF with the original fonts, layout and selectable text — no sign-up, nothing to install, processed in your browser.",
  keywords: [
    "KillMyPDF",
    "PDF editor",
    "edit PDF text",
    "online PDF editor",
    "free PDF editor",
    "change text in PDF",
    "PDF text replace",
    "edit PDF in browser",
    "edit PDF without Acrobat",
    "PDF editor no sign up",
    "keep PDF fonts",
  ],
  url: (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, ""),
  /** Public repository, shown in the footer when set (e.g. "https://github.com/you/repo"). */
  repoUrl: process.env.NEXT_PUBLIC_REPO_URL || "https://github.com/mohitphoenix24/Kill-My-PDF",
  themeColor: "#09090b",
} as const;
