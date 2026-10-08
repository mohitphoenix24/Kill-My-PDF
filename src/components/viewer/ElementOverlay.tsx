"use client";

import { memo, useMemo, useRef, useState } from "react";
import type { PageTransform } from "@/lib/geometry/coordinates";
import { changesOf } from "@/lib/editor/operations";
import type { FontInfo, TextElement } from "@/lib/model/types";
import { elementScreenQuad, hitTest, lineSegmentQuad } from "./elementGeometry";
import { wordAtTap } from "./textMeasure";

export interface TapAnchor {
  id: string;
  /** How far along the line the tap landed, 0–1. */
  fraction: number;
}

interface Props {
  elements: TextElement[];
  fonts: Record<string, FontInfo>;
  transform: PageTransform;
  selectedId: string | null;
  /** Element being edited inline — its outlines are hidden under the text field. */
  editingId: string | null;
  /** The word that was clicked/tapped, marked while its line is selected. */
  anchor: TapAnchor | null;
  /** Outline text that has been edited (hidden by default — it isn't part of the PDF). */
  showEdits: boolean;
  /** Measured widths (ems) from the latest export preview, by element id. */
  widths: ReadonlyMap<string, number>;
  onSelect: (id: string | null, fraction?: number) => void;
  onEditRequest: (id: string, fraction?: number) => void;
}

/** A finger covers far more than a mouse pointer, so touch gets a generous margin around text. */
const SLOP_MOUSE_PX = 3;
const SLOP_TOUCH_PX = 14;
/** Movement beyond this, or a press longer than TAP_MS, means "scrolling", not "tapping". */
const TAP_MOVE_PX = 10;
const TAP_MS = 700;

const pointsOf = (quad: Array<{ x: number; y: number }>) => quad.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");

/**
 * The interaction layer over a page. The unit people point at is a *word*, even though the
 * model stores lines: hover marks the word under the mouse, a click marks it (and selects its
 * line), and editing starts on that word. Touch is tap-based — selection happens on release,
 * so starting a scroll on top of text never selects it — and unselected text never blocks panning.
 */
function ElementOverlayImpl({ elements, fonts, transform, selectedId, editingId, anchor, showEdits, widths, onSelect, onEditRequest }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ id: string; fraction: number } | null>(null);
  const tap = useRef<{ x: number; y: number; at: number; hit: { id: string; fraction: number } | null } | null>(null);

  const widthOf = (e: TextElement) => Math.max(widths.get(e.id) ?? e.width, 0.25);
  const fontOf = (e: TextElement) => (e.fontKey ? fonts[e.fontKey] : undefined);
  const pointOf = (e: { clientX: number; clientY: number }) => {
    const r = rootRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const hitAt = (e: { clientX: number; clientY: number; pointerType?: string }) =>
    hitTest(elements, widthOf, transform, pointOf(e), e.pointerType && e.pointerType !== "mouse" ? SLOP_TOUCH_PX : SLOP_MOUSE_PX);

  /** The word at `fraction` of `element`'s line, as a screen quad. */
  const wordQuad = (element: TextElement, fraction: number) => {
    const word = wordAtTap(element, fontOf(element), fraction);
    return word ? { word, quad: lineSegmentQuad(element, widthOf(element), word.from, word.to, transform) } : null;
  };

  const onRootDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const hit = hitAt(e);
    if (e.pointerType === "mouse") {
      if (!hit) return onSelect(null);
      onSelect(hit.element.id, hit.fraction);
      return;
    }
    // Touch / pen: decide on release.
    tap.current = { x: e.clientX, y: e.clientY, at: performance.now(), hit: hit ? { id: hit.element.id, fraction: hit.fraction } : null };
  };

  const onRootMove = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") {
      const hit = hitAt(e);
      setHover((h) => (hit ? { id: hit.element.id, fraction: hit.fraction } : h === null ? h : null));
    } else if (tap.current && Math.hypot(e.clientX - tap.current.x, e.clientY - tap.current.y) > TAP_MOVE_PX) {
      tap.current = null; // the finger is panning the page
    }
  };

  const onRootUp = (e: React.PointerEvent) => {
    const t = tap.current;
    tap.current = null;
    if (!t || e.pointerType === "mouse") return;
    if (performance.now() - t.at > TAP_MS) return;
    if (!t.hit) return onSelect(null);
    const element = elements.find((el) => el.id === t.hit!.id);
    if (!element) return;
    // Tapping the word that's already marked edits it; tapping any other word just moves the mark there.
    const marked = anchor && anchor.id === element.id ? wordAtTap(element, fontOf(element), anchor.fraction) : null;
    const tapped = wordAtTap(element, fontOf(element), t.hit.fraction);
    const sameWord = !!marked && !!tapped && marked.start === tapped.start && element.id === selectedId;
    if (element.editability.allowed && sameWord) onEditRequest(element.id, t.hit.fraction);
    else onSelect(element.id, t.hit.fraction);
  };

  const selected = elements.find((e) => e.id === selectedId && e.id !== editingId);
  const marker = useMemo(
    () => (selected && anchor && anchor.id === selected.id ? wordQuad(selected, anchor.fraction) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, anchor, fonts, widths, transform],
  );
  const hovered = hover && hover.id !== editingId ? elements.find((e) => e.id === hover.id) : undefined;
  const hoveredWord = hovered && hovered.editability.allowed ? wordQuad(hovered, hover!.fraction) : null;
  const hoverIsMarked = !!(hoveredWord && marker && hovered!.id === selected?.id && hoveredWord.word.start === marker.word.start);

  return (
    <div
      ref={rootRef}
      className="absolute inset-0"
      // Only panning is left to the browser; pinch-zoom is handled by the viewer.
      style={{ touchAction: "pan-x pan-y", cursor: hovered ? (hovered.editability.allowed ? "text" : "not-allowed") : undefined }}
      onPointerDown={onRootDown}
      onPointerMove={onRootMove}
      onPointerUp={onRootUp}
      onPointerCancel={() => {
        tap.current = null;
      }}
      onPointerLeave={() => setHover(null)}
      // A tap also fires fake mouse events after touchend; their mousedown would pull focus off the
      // text field we just opened (and hide the keyboard). Pointer events already handled the tap.
      onTouchEnd={(e) => e.cancelable && e.preventDefault()}
      onDoubleClick={(e) => {
        const hit = hitAt({ clientX: e.clientX, clientY: e.clientY });
        if (hit?.element.editability.allowed) onEditRequest(hit.element.id, hit.fraction);
      }}
    >
      <svg className="pointer-events-none absolute inset-0" width={transform.width} height={transform.height}>
        {elements.map((element) => {
          if (element.id === editingId) return null;
          const isSelected = element.id === selectedId;
          const editable = element.editability.allowed;
          const edited = changesOf(element).any;
          let stroke = "transparent";
          let fill = "transparent";
          let dash: string | undefined;
          if (isSelected) {
            // With a word marked, the line only gets a quiet outline; without one, the line is the selection.
            stroke = "rgba(13, 13, 15, 0.55)";
            fill = marker ? "transparent" : "rgba(198, 241, 53, 0.22)";
          } else if (hovered?.id === element.id && !editable) {
            stroke = "#7a7a84"; // read-only: shown as a whole line, with a dashed outline
            fill = "rgba(122, 122, 132, 0.12)";
            dash = "4 3";
          } else if (showEdits && edited) {
            stroke = "#668511";
            dash = "3 3";
          }
          if (stroke === "transparent" && fill === "transparent") return null;
          const quad = elementScreenQuad(element, widthOf(element), transform);
          return (
            <polygon
              key={element.id}
              data-element-id={element.id}
              points={pointsOf(quad)}
              fill={fill}
              stroke={stroke}
              strokeWidth={1}
              strokeDasharray={dash}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              style={{ scrollMarginTop: 150, scrollMarginBottom: 40 }}
            />
          );
        })}
        {/* Hit targets for tests and screen readers: invisible, one per element. */}
        {elements.map((element) => (
          <polygon
            key={`t-${element.id}`}
            data-element-id={element.id}
            data-hit-target=""
            points={pointsOf(elementScreenQuad(element, widthOf(element), transform))}
            fill="transparent"
            stroke="none"
          >
            <title>{element.editability.allowed ? element.content : `${element.content}\n\n${element.editability.reason ?? "Not editable"}`}</title>
          </polygon>
        ))}
        {hoveredWord && !hoverIsMarked && (
          <polygon
            data-testid="hover-word"
            points={pointsOf(hoveredWord.quad)}
            fill="rgba(198, 241, 53, 0.34)"
            stroke="rgba(13, 13, 15, 0.45)"
            strokeWidth={1}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {marker && (
          <polygon
            data-testid="word-marker"
            points={pointsOf(marker.quad)}
            fill="rgba(198, 241, 53, 0.7)"
            stroke="#0d0d0f"
            strokeWidth={1.25}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
    </div>
  );
}

export const ElementOverlay = memo(ElementOverlayImpl);
