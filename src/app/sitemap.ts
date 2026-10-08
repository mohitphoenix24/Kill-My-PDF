import type { MetadataRoute } from "next";
import { SITE } from "@/config/site";
import { TOOLS } from "@/config/tools";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE.url}/`, changeFrequency: "weekly", priority: 1 },
    ...TOOLS.map((tool) => ({ url: `${SITE.url}${tool.path}`, changeFrequency: "monthly" as const, priority: 0.9 })),
  ];
}
