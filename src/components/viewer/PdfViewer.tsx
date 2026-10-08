"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { EditSession } from "@/components/editor/editSession";
import type { EditOperation } from "@/lib/editor/operations";
import type { DocumentModel } from "@/lib/model/types";
import type { PDFDocumentProxy } from "@/lib/pdf/pdfjs/pdfjs";
import type { TapAnchor } from "./ElementOverlay";
import { PageView, type Tool } from "./PageView";

/** Pinch-to-zoom limits, matching the toolbar's zoom steps. */
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;

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
  session: EditSession | null;
  editOnPage: boolean;
  anchor: TapAnchor | null;
  showEdits: boolean;
  widths: ReadonlyMap<string, number>;
  scrollRequest: ScrollRequest | null;
  onSelect: (id: string | null, fraction?: number) => void;
  onMove: (id: string, dx: number, dy: number) => void;
  onEdit: (op: EditOperation) => void;
  onEditRequest: (id: string, fraction?: number) => void;
  onEditLine: (id: string) => void;
  onTyped: (text: string) => void;
  onCancelEditing: () => void;
  onStep: (direction: 1 | -1) => void;
  onZoomTo: (scale: number) => void;
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

  // After a zoom change: a pinch keeps the spot under the fingers fixed; other zooms keep the relative scroll position.
  const lastScale = useRef(scale);
  const pinchAnchor = useRef<{ contentX: number; contentY: number; midX: number; midY: number; factor: number } | null>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || lastScale.current === scale) return;
    lastScale.current = scale;
    const pinch = pinchAnchor.current;
    pinchAnchor.current = null;
    if (pinch) {
      el.scrollLeft = pinch.contentX * pinch.factor - pinch.midX;
      el.scrollTop = pinch.contentY * pinch.factor - pinch.midY;
      return;
    }
    const ratio = el.scrollTop / Math.max(1, el.scrollHeight);
    requestAnimationFrame(() => {
      el.scrollTop = ratio * el.scrollHeight;
    });
  }, [scale]);

  // Two-finger pinch: scale the pages live with a CSS transform, then commit the new zoom on release.
  const contentRef = useRef<HTMLDivElement>(null);
  const liveScale = useRef(scale);
  const zoomTo = useRef(props.onZoomTo);
  useEffect(() => {
    liveScale.current = scale;
    zoomTo.current = props.onZoomTo;
  });
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    let start: { dist: number; scale: number; midX: number; midY: number } | null = null;
    let factor = 1;
    const distance = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const reset = () => {
      content.style.transform = "";
      content.style.transformOrigin = "";
      content.style.willChange = "";
    };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const rect = el.getBoundingClientRect();
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
      start = { dist: distance(e.touches), scale: liveScale.current, midX, midY };
      factor = 1;
      content.style.transformOrigin = `${el.scrollLeft + midX}px ${el.scrollTop + midY}px`;
      content.style.willChange = "transform";
    };
    const onMove = (e: TouchEvent) => {
      if (!start || e.touches.length !== 2) return;
      factor = Math.min(MAX_SCALE / start.scale, Math.max(MIN_SCALE / start.scale, distance(e.touches) / start.dist));
      content.style.transform = `scale(${factor})`;
      e.preventDefault();
    };
    const onEnd = (e: TouchEvent) => {
      if (!start || e.touches.length >= 2) return;
      const gesture = start;
      start = null;
      reset();
      if (Math.abs(factor - 1) < 0.02) return;
      pinchAnchor.current = { contentX: el.scrollLeft + gesture.midX, contentY: el.scrollTop + gesture.midY, midX: gesture.midX, midY: gesture.midY, factor };
      zoomTo.current(gesture.scale * factor);
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      reset();
    };
  }, []);

  // While typing on a touch screen, bring the line being edited near the top, clear of the keyboard.
  const typingElementId = !props.editOnPage ? (props.session?.id ?? null) : null;
  useEffect(() => {
    if (!typingElementId) return;
    const reveal = () =>
      scrollRef.current
        ?.querySelector(`[data-element-id="${typingElementId}"]`)
        ?.scrollIntoView({ block: "start", behavior: "smooth" });
    const timers = [requestAnimationFrame(reveal) as unknown as number, window.setTimeout(reveal, 400)];
    return () => timers.forEach((t) => clearTimeout(t));
  }, [typingElementId]);

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
    <div
      ref={scrollRef}
      className="thin-scroll canvas-backdrop h-full overflow-auto"
      style={{ touchAction: "pan-x pan-y" }}
      data-testid="viewer"
      // Tapping the desk around the pages deselects, like any editor.
      onClick={(e) => (e.target === e.currentTarget || e.target === contentRef.current) && props.onSelect(null)}
    >
      <div ref={contentRef} className={`flex min-w-fit flex-col gap-4 px-3 pt-4 sm:gap-6 sm:px-6 sm:pt-6 ${typingElementId ? "pb-[60dvh]" : "pb-28"}`}>
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
              session={props.session && onThisPage(props.session.id) ? props.session : null}
              editOnPage={props.editOnPage}
              anchor={props.anchor && onThisPage(props.anchor.id) ? props.anchor : null}
              showEdits={props.showEdits}
              widths={props.widths}
              onSelect={props.onSelect}
              onMove={props.onMove}
              onEdit={props.onEdit}
              onEditRequest={props.onEditRequest}
              onEditLine={props.onEditLine}
              onTyped={props.onTyped}
              onStopEditing={props.onStopEditing}
              onCancelEditing={props.onCancelEditing}
              onStep={props.onStep}
              onShowDetails={props.onShowDetails}
            />
          );
        })}
      </div>
    </div>
  );
}
