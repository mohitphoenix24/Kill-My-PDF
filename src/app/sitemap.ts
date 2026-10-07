import type { MetadataRoute } from "next";
import { SITE } from "@/config/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  // Add each tool page here as it ships (e.g. /merge-pdf, /images-to-pdf).
  return [{ url: `${SITE.url}/`, changeFrequency: "weekly", priority: 1 }];
}
