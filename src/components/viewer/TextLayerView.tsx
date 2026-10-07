"use client";

import { memo, useEffect, useRef } from "react";
import { type PDFDocumentProxy, TextLayer } from "@/lib/pdf/pdfjs/pdfjs";

interface Props {
  doc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
}

/** pdf.js's transparent text layer, giving native browser selection and copy. */
function TextLayerViewImpl({ doc, pageNumber, scale }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let layer: InstanceType<typeof TextLayer> | null = null;

    (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      container.replaceChildren();
      layer = new TextLayer({
        textContentSource: page.streamTextContent(),
        container,
        viewport: page.getViewport({ scale }),
      });
      await layer.render();
    })().catch(() => {
      // Selection is a convenience layer; rendering still works without it.
    });

    return () => {
      cancelled = true;
      layer?.cancel();
    };
  }, [doc, pageNumber, scale]);

  return (
    <div
      ref={containerRef}
      className="textLayer"
      style={{ "--total-scale-factor": scale } as React.CSSProperties}
    />
  );
}

export const TextLayerView = memo(TextLayerViewImpl);
