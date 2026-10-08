import { JsonLd } from "@/components/JsonLd";
import { ToolHost } from "@/components/tools/ToolHost";
import { toolJsonLd, toolMetadata } from "@/lib/seo";

export const metadata = toolMetadata("split-pdf");

export default function Page() {
  return (
    <>
      <JsonLd data={toolJsonLd("split-pdf")} />
      <ToolHost slug="split-pdf" />
    </>
  );
}
