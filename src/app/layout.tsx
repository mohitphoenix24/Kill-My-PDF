import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { SITE } from "@/config/site";
import "./globals.css";

const title = `${SITE.name} — Edit PDF text online, free & keep the original fonts`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: title, template: `%s · ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [...SITE.keywords],
  category: "productivity",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
  // opengraph-image.png / twitter-image.png in this folder are picked up automatically.
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE.name,
    title,
    description: SITE.description,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description: SITE.description,
  },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: SITE.themeColor,
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} dark h-full`}>
      {/* The className sets Geist directly, so it applies even before Tailwind's theme resolves. */}
      <body className={`${GeistSans.className} h-full overflow-hidden bg-zinc-950 text-zinc-100 antialiased`}>{children}</body>
    </html>
  );
}
