import { JsonLd } from "@/components/JsonLd";
import { ToolHost } from "@/components/tools/ToolHost";
import { toolJsonLd, toolMetadata } from "@/lib/seo";

export const metadata = toolMetadata("images-to-pdf");

export default function Page() {
  return (
    <>
      <JsonLd data={toolJsonLd("images-to-pdf")} />
      <ToolHost slug="images-to-pdf" />
    </>
  );
}
