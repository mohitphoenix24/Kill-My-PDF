"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { EditOperation } from "@/lib/editor/operations";
import type { DocumentModel } from "@/lib/model/types";
import type { PDFDocumentProxy } from "@/lib/pdf/pdfjs/pdfjs";
import { PageView, type Tool } from "./PageView";

export interface ScrollRequest {
  pageNumber: number;
  /** Changes on every request so repeated requests for the same page still scroll. */
  nonce: number;
}

interface Props {
  model: DocumentModel;
  originalDoc: PDFDocumentProxy;
  previewDoc: PDFDocumentProxy | null;
  previewPages: ReadonlySet<number>;
  scale: number;
  tool: Tool;
  selectedId: string | null;
  editingId: string | null;
  widths: ReadonlyMap<string, number>;
  scrollRequest: ScrollRequest | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, dx: number, dy: number) => void;
  onEdit: (op: EditOperation) => void;
  onEditRequest: (id: string) => void;
  onStopEditing: () => void;
  onShowDetails: () => void;
  onPageVisible: (pageNumber: number) => void;
  onCurrentPageChange: (pageNumber: number) => void;
  onViewportWidth: (width: number) => void;
}

/**
 * Scrollable list of pages. Pages render lazily: only pages near the viewport get
 * a canvas, and a page is analysed the first time it becomes visible.
 */
export function PdfViewer(props: Props) {
  const { model, scale, onPageVisible, onCurrentPageChange, onViewportWidth, scrollRequest } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const [visible, setVisible] = useState<ReadonlySet<number>>(() => new Set([1]));
  const ratios = useRef(new Map<number, number>());

  // Visibility tracking (with a margin so neighbours are ready before they scroll in).
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        setVisible((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const n = Number((entry.target as HTMLElement).dataset.pageNumber);
            if (entry.isIntersecting) next.add(n);
            else next.delete(n);
          }
          return next;
        });
      },
      { root, rootMargin: "50% 0px" },
    );
    const current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratios.current.set(Number((entry.target as HTMLElement).dataset.pageNumber), entry.intersectionRatio);
        }
        let best = 1;
        let bestRatio = -1;
        for (const [n, r] of ratios.current) {
          if (r > bestRatio || (r === bestRatio && n < best)) [best, bestRatio] = [n, r];
        }
        onCurrentPageChange(best);
      },
      { root, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    for (const el of pageRefs.current.values()) {
      observer.observe(el);
      current.observe(el);
    }
    return () => {
      observer.disconnect();
      current.disconnect();
    };
  }, [model.id, model.pageCount, onCurrentPageChange]);

  useEffect(() => {
    for (const n of visible) onPageVisible(n);
  }, [visible, onPageVisible]);

  // Report the available width for fit-to-width zoom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => onViewportWidth(el.clientWidth));
    observer.observe(el);
    onViewportWidth(el.clientWidth);
    return () => observer.disconnect();
  }, [onViewportWidth]);

  // Keep the same relative scroll position when zooming.
  const lastScale = useRef(scale);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || lastScale.current === scale) return;
    const ratio = el.scrollTop / Math.max(1, el.scrollHeight);
    lastScale.current = scale;
    requestAnimationFrame(() => {
      el.scrollTop = ratio * el.scrollHeight;
    });
  }, [scale]);

  useEffect(() => {
    if (!scrollRequest) return;
    pageRefs.current.get(scrollRequest.pageNumber)?.scrollIntoView({ block: "start" });
  }, [scrollRequest]);

  // One stable ref callback for all pages (memoised pages bail out only if the ref is unchanged).
  const registerPage = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const n = Number(el.dataset.pageNumber);
    pageRefs.current.set(n, el);
    return () => {
      pageRefs.current.delete(n);
    };
  }, []);

  return (
    <div ref={scrollRef} className="thin-scroll canvas-backdrop h-full overflow-auto" data-testid="viewer">
      <div className="flex min-w-fit flex-col gap-4 px-3 pb-28 pt-4 sm:gap-6 sm:px-6 sm:pt-6">
        {model.pages.map((page) => {
          const onThisPage = (id: string | null) => (id?.startsWith(`p${page.pageNumber}-`) ? id : null);
          return (
            <PageView
              key={page.pageNumber}
              ref={registerPage}
              page={page}
              doc={props.previewDoc && props.previewPages.has(page.pageNumber) ? props.previewDoc : props.originalDoc}
              fonts={model.fonts}
              scale={scale}
              tool={props.tool}
              visible={visible.has(page.pageNumber)}
              selectedId={onThisPage(props.selectedId)}
              editingId={onThisPage(props.editingId)}
              widths={props.widths}
              onSelect={props.onSelect}
              onMove={props.onMove}
              onEdit={props.onEdit}
              onEditRequest={props.onEditRequest}
              onStopEditing={props.onStopEditing}
              onShowDetails={props.onShowDetails}
            />
          );
        })}
      </div>
    </div>
  );
}
