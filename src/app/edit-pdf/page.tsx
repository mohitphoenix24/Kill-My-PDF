import { JsonLd } from "@/components/JsonLd";
import { ToolHost } from "@/components/tools/ToolHost";
import { toolJsonLd, toolMetadata } from "@/lib/seo";

export const metadata = toolMetadata("edit-pdf");

export default function Page() {
  return (
    <>
      <JsonLd data={toolJsonLd("edit-pdf")} />
      <ToolHost slug="edit-pdf" />
    </>
  );
}
