import { JsonLd } from "@/components/JsonLd";
import { Home } from "@/components/home/Home";
import { homeJsonLd } from "@/lib/seo";

export default function HomePage() {
  return (
    <>
      <JsonLd data={homeJsonLd()} />
      <Home />
    </>
  );
}
