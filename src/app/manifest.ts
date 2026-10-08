import type { MetadataRoute } from "next";
import { SITE } from "@/config/site";
import { TOOLS } from "@/config/tools";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.name,
    short_name: SITE.shortName,
    description: SITE.description,
    start_url: "/",
    shortcuts: TOOLS.map((tool) => ({ name: tool.name, short_name: tool.short, description: tool.tagline, url: tool.path })),
    display: "standalone",
    background_color: SITE.themeColor,
    theme_color: SITE.themeColor,
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
