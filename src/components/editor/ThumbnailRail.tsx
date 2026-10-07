"use client";

import { memo, useEffect, useRef, useState } from "react";
import { PageCanvas } from "@/components/viewer/PageCanvas";
import { createPageTransform } from "@/lib/geometry/coordinates";
import type { DocumentModel } from "@/lib/model/types";
import type { PDFDocumentProxy } from "@/lib/pdf/pdfjs/pdfjs";

const THUMB_WIDTH = 116;

interface Props {
  model: DocumentModel;
  originalDoc: PDFDocumentProxy;
  previewDoc: PDFDocumentProxy | null;
  previewPages: ReadonlySet<number>;
  editedPages: ReadonlySet<number>;
  currentPage: number;
  onGoToPage: (page: number) => void;
}

/** Page thumbnails; each renders only while scrolled into the rail's view. */
function ThumbnailRailImpl({ model, originalDoc, previewDoc, previewPages, editedPages, currentPage, onGoToPage }: Props) {
  const railRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<ReadonlySet<number>>(() => new Set([1, 2, 3, 4, 5]));

  useEffect(() => {
    const root = railRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) =>
        setVisible((prev) => {
          const next = new Set(prev);
          for (const e of entries) {
            const n = Number((e.target as HTMLElement).dataset.thumb);
            if (e.isIntersecting) next.add(n);
            else next.delete(n);
          }
          return next;
        }),
      { root, rootMargin: "200px 0px" },
    );
    root.querySelectorAll("[data-thumb]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [model.id, model.pageCount]);

  // Keep the current page's thumbnail in view while scrolling the document.
  useEffect(() => {
    railRef.current?.querySelector(`[data-thumb="${currentPage}"]`)?.scrollIntoView({ block: "nearest" });
  }, [currentPage]);

  return (
    <nav aria-label="Pages" ref={railRef} className="thin-scroll h-full overflow-y-auto px-4 py-5">
      <ol className="flex flex-col items-center gap-5">
        {model.pages.map((page) => {
          const scale = THUMB_WIDTH / createPageTransform(page, 1).width;
          const t = createPageTransform(page, scale);
          const doc = previewDoc && previewPages.has(page.pageNumber) ? previewDoc : originalDoc;
          const active = page.pageNumber === currentPage;
          return (
            <li key={page.pageNumber} data-thumb={page.pageNumber}>
              <button
                onClick={() => onGoToPage(page.pageNumber)}
                aria-label={`Go to page ${page.pageNumber}`}
                aria-current={active ? "page" : undefined}
                className="group flex flex-col items-center gap-1.5"
              >
                <span
                  className={`relative block overflow-hidden rounded-md bg-white shadow-lg shadow-black/40 transition-all ${
                    active ? "ring-2 ring-indigo-400 ring-offset-2 ring-offset-zinc-950" : "opacity-80 ring-1 ring-white/10 group-hover:opacity-100 group-hover:ring-white/25"
                  }`}
                  style={{ width: t.width, height: t.height }}
                >
                  {visible.has(page.pageNumber) && <PageCanvas doc={doc} pageNumber={page.pageNumber} scale={scale} />}
                  {editedPages.has(page.pageNumber) && (
                    <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-emerald-400 ring-2 ring-zinc-950" title="Edited" />
                  )}
                </span>
                <span className={`text-[11px] font-medium tabular-nums ${active ? "text-indigo-300" : "text-zinc-500"}`}>
                  {page.pageNumber}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export const ThumbnailRail = memo(ThumbnailRailImpl);
