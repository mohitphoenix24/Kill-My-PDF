import type { Metadata } from "next";
import { SITE } from "@/config/site";
import { HOME_FAQ, type ToolSlug, TOOLS, getTool } from "@/config/tools";

const absolute = (path: string) => `${SITE.url}${path}`;

export function toolMetadata(slug: ToolSlug): Metadata {
  const tool = getTool(slug);
  return {
    title: tool.seoTitle,
    description: tool.description,
    keywords: [...tool.keywords, SITE.name],
    alternates: { canonical: tool.path },
    openGraph: { type: "website", url: tool.path, siteName: SITE.name, title: `${tool.seoTitle} · ${SITE.name}`, description: tool.description },
    twitter: { card: "summary_large_image", title: `${tool.seoTitle} · ${SITE.name}`, description: tool.description },
  };
}

const faqSchema = (faq: Array<{ q: string; a: string }>) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faq.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
});

const offer = { "@type": "Offer", price: "0", priceCurrency: "USD" };

export function toolJsonLd(slug: ToolSlug) {
  const tool = getTool(slug);
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: `${tool.name} — ${SITE.name}`,
      url: absolute(tool.path),
      description: tool.description,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Any (runs in the browser)",
      browserRequirements: "Requires JavaScript and a modern browser",
      offers: offer,
      isPartOf: { "@type": "WebSite", name: SITE.name, url: SITE.url },
    },
    faqSchema(tool.faq),
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE.name, item: absolute("/") },
        { "@type": "ListItem", position: 2, name: tool.name, item: absolute(tool.path) },
      ],
    },
  ];
}

export function homeJsonLd() {
  return [
    { "@context": "https://schema.org", "@type": "WebSite", name: SITE.name, url: SITE.url, description: SITE.description },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `${SITE.name} tools`,
      itemListElement: TOOLS.map((tool, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: { "@type": "WebApplication", name: tool.name, url: absolute(tool.path), description: tool.description, applicationCategory: "BusinessApplication", offers: offer },
      })),
    },
    faqSchema(HOME_FAQ),
  ];
}
