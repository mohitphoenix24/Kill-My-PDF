"use client";

import { memo, useEffect, useRef } from "react";
import type { PDFDocumentProxy } from "@/lib/pdf/pdfjs/pdfjs";

/** Browsers refuse canvases much beyond this many pixels. */
const MAX_CANVAS_PIXELS = 16_777_216;

interface Props {
  doc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
}

/**
 * Renders one page with pdf.js. The new canvas replaces the old one only once it
 * has finished drawing, so zooming or a preview refresh never flashes blank.
 * The backing store is scaled by devicePixelRatio; CSS size stays in CSS pixels.
 */
function PageCanvasImpl({ doc, pageNumber, scale }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let task: { cancel(): void } | null = null;

    (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      const area = viewport.width * viewport.height;
      const dpr = Math.min(window.devicePixelRatio || 1, Math.sqrt(MAX_CANVAS_PIXELS / Math.max(area, 1)));
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      canvas.style.display = "block";
      const renderTask = page.render({
        canvas,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      });
      task = renderTask;
      await renderTask.promise;
      if (!cancelled) hostRef.current?.replaceChildren(canvas);
    })().catch((error: unknown) => {
      const name = (error as { name?: string } | null)?.name;
      if (!cancelled && name !== "RenderingCancelledException") {
        console.warn(`Page ${pageNumber} failed to render`, error);
      }
    });

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageNumber, scale]);

  return <div ref={hostRef} className="absolute inset-0" aria-hidden />;
}

export const PageCanvas = memo(PageCanvasImpl);
