import { JsonLd } from "@/components/JsonLd";
import { ToolHost } from "@/components/tools/ToolHost";
import { toolJsonLd, toolMetadata } from "@/lib/seo";

export const metadata = toolMetadata("merge-pdf");

export default function Page() {
  return (
    <>
      <JsonLd data={toolJsonLd("merge-pdf")} />
      <ToolHost slug="merge-pdf" />
    </>
  );
}
