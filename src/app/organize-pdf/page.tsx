import { JsonLd } from "@/components/JsonLd";
import { ToolHost } from "@/components/tools/ToolHost";
import { toolJsonLd, toolMetadata } from "@/lib/seo";

export const metadata = toolMetadata("organize-pdf");

export default function Page() {
  return (
    <>
      <JsonLd data={toolJsonLd("organize-pdf")} />
      <ToolHost slug="organize-pdf" />
    </>
  );
}
