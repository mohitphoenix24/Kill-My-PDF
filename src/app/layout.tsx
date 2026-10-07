import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { APP_NAME } from "@/components/ui/Logo";
import "./globals.css";

export const metadata: Metadata = {
  title: `${APP_NAME} — Edit text in PDFs, privately`,
  description:
    "Edit the text in digital PDFs right in your browser. Original fonts and layout are preserved, the result stays real, selectable text, and your files never leave your device.",
  applicationName: APP_NAME,
};

export const viewport: Viewport = {
  themeColor: "#09090b",
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
