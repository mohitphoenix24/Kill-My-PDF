"use client";

import { memo, useEffect, useRef, useState } from "react";
import { PageCanvas } from "@/components/viewer/PageCanvas";
import type { PDFDocumentProxy } from "@/lib/pdf/pdfjs/pdfjs";

interface Props {
  doc: PDFDocumentProxy;
  /** 1-based. */
  pageNumber: number;
  /** The thumbnail is fitted inside this box (CSS px). */
  maxWidth: number;
  maxHeight: number;
  /** Extra clockwise rotation to preview, in degrees (multiples of 90). */
  rotate?: number;
}

/** A page thumbnail that only renders once it scrolls near the screen. */
function PdfThumbImpl({ doc, pageNumber, maxWidth, maxHeight, rotate = 0 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    doc
      .getPage(pageNumber)
      .then((page) => {
        const v = page.getViewport({ scale: 1 });
        if (!cancelled) setSize({ w: v.width, h: v.height });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [visible, doc, pageNumber]);

  const turned = ((rotate % 180) + 180) % 180 !== 0;
  const scale = size ? Math.min(maxWidth / (turned ? size.h : size.w), maxHeight / (turned ? size.w : size.h)) : 0;

  return (
    <div ref={ref} className="flex items-center justify-center" style={{ width: maxWidth, height: maxHeight }}>
      {size && scale > 0 ? (
        <div
          className="relative bg-white shadow-[0_6px_18px_-6px_rgb(0_0_0/0.7)] ring-1 ring-black/30 transition-transform duration-200"
          style={{ width: size.w * scale, height: size.h * scale, transform: `rotate(${rotate}deg)` }}
        >
          <PageCanvas doc={doc} pageNumber={pageNumber} scale={scale} />
        </div>
      ) : (
        <div className="h-3/4 w-3/5 animate-pulse rounded bg-white/[0.05]" />
      )}
    </div>
  );
}

export const PdfThumb = memo(PdfThumbImpl);
