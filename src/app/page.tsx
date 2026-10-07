import { App } from "@/components/App";
import { FAQ } from "@/components/landing/content";
import { SITE } from "@/config/site";

/** Structured data so search engines understand this is a free web app, plus the FAQ. */
const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Any (runs in the browser)",
    browserRequirements: "Requires JavaScript and a modern browser",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    featureList: [
      "Edit text in digital PDFs",
      "Keeps original fonts, sizes, colours and positions",
      "Exports real, selectable and searchable text",
      "Move, resize and recolour text",
      "Undo and redo",
      "Works on desktop and mobile",
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  },
];

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        // JSON.stringify output is safe here: the data is static and contains no "</script>".
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <App />
    </>
  );
}
