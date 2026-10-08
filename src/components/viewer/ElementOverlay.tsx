"use client";

import { memo, useMemo, useRef, useState } from "react";
import { type PageTransform, localBoxCssMatrix, screenDeltaToPdfDelta, toCssMatrix } from "@/lib/geometry/coordinates";
import { changesOf } from "@/lib/editor/operations";
import type { FontInfo, TextElement } from "@/lib/model/types";
import { elementScreenQuad, fractionAlongElement, hitTest, lineSegmentQuad } from "./elementGeometry";
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
  /** Element being edited inline — its outline is hidden under the text field. */
  editingId: string | null;
  /** The word the last tap landed on, marked while its line is selected. */
  anchor: TapAnchor | null;
  /** Measured widths (ems) from the latest export preview, by element id. */
  widths: ReadonlyMap<string, number>;
  onSelect: (id: string | null, fraction?: number) => void;
  onMove: (id: string, dx: number, dy: number) => void;
  onEditRequest: (id: string, fraction?: number) => void;
}

const DRAG_THRESHOLD_PX = 3;
/** A finger covers far more than a mouse pointer, so touch gets a generous margin around text. */
const SLOP_MOUSE_PX = 3;
const SLOP_TOUCH_PX = 14;
/** Movement beyond this, or a press longer than TAP_MS, means "scrolling", not "tapping". */
const TAP_MOVE_PX = 10;
const TAP_MS = 700;

/**
 * The interaction layer over a page: outlines drawn in SVG (so rotated text gets exact quads),
 * with one hit-tester on top. Touch is tap-based — selection happens on release, so starting a
 * scroll on top of text never selects it — and unselected text never blocks panning.
 */
function ElementOverlayImpl({ elements, fonts, transform, selectedId, editingId, anchor, widths, onSelect, onMove, onEditRequest }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const tap = useRef<{ x: number; y: number; at: number; hit: { id: string; fraction: number } | null } | null>(null);

  const widthOf = (e: TextElement) => Math.max(widths.get(e.id) ?? e.width, 0.25);
  const pointOf = (e: { clientX: number; clientY: number }) => {
    const r = rootRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const hitAt = (e: React.PointerEvent) =>
    hitTest(elements, widthOf, transform, pointOf(e), e.pointerType === "mouse" ? SLOP_MOUSE_PX : SLOP_TOUCH_PX);

  const startDrag = (e: React.PointerEvent, id: string) => {
    drag.current = { id, x: e.clientX, y: e.clientY, moved: false };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const moveDrag = (e: React.PointerEvent): boolean => {
    const d = drag.current;
    if (!d) return false;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return true;
    if (!d.moved) setDragging(true);
    d.moved = true;
    d.x = e.clientX;
    d.y = e.clientY;
    const delta = screenDeltaToPdfDelta(transform, dx, dy);
    onMove(d.id, delta.x, delta.y);
    return true;
  };

  /** Ends a drag; returns the id when it was just a press (no movement). */
  const endDrag = (e: React.PointerEvent): string | null => {
    const d = drag.current;
    if (!d) return null;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    drag.current = null;
    setDragging(false);
    return d.moved ? null : d.id;
  };

  const onRootDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const hit = hitAt(e);
    if (e.pointerType === "mouse") {
      if (!hit) return onSelect(null);
      onSelect(hit.element.id, hit.fraction);
      if (hit.element.editability.allowed) startDrag(e, hit.element.id);
      return;
    }
    // Touch / pen: decide on release.
    tap.current = { x: e.clientX, y: e.clientY, at: performance.now(), hit: hit ? { id: hit.element.id, fraction: hit.fraction } : null };
  };

  const onRootMove = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") {
      if (moveDrag(e)) return;
      const hit = hitAt(e);
      setHoveredId((h) => (h === (hit?.element.id ?? null) ? h : (hit?.element.id ?? null)));
    } else if (tap.current && Math.hypot(e.clientX - tap.current.x, e.clientY - tap.current.y) > TAP_MOVE_PX) {
      tap.current = null; // the finger is panning the page
    }
  };

  const onRootUp = (e: React.PointerEvent) => {
    endDrag(e);
    const t = tap.current;
    tap.current = null;
    if (!t || e.pointerType === "mouse") return;
    if (performance.now() - t.at > TAP_MS) return;
    if (!t.hit) return onSelect(null);
    const element = elements.find((el) => el.id === t.hit!.id);
    // Second tap on the selected line → edit, starting at the word that was tapped.
    if (element && element.editability.allowed && element.id === selectedId) onEditRequest(element.id, t.hit.fraction);
    else onSelect(t.hit.id, t.hit.fraction);
  };

  const selected = elements.find((e) => e.id === selectedId && e.id !== editingId);
  const wordQuad = useMemo(() => {
    if (!selected || !anchor || anchor.id !== selected.id) return null;
    const font = selected.fontKey ? fonts[selected.fontKey] : undefined;
    const word = wordAtTap(selected, font, anchor.fraction);
    return word ? lineSegmentQuad(selected, Math.max(widths.get(selected.id) ?? selected.width, 0.25), word.from, word.to, transform) : null;
  }, [selected, anchor, fonts, widths, transform]);

  return (
    <div
      ref={rootRef}
      className="absolute inset-0"
      // Only panning is left to the browser; pinch-zoom is handled by the viewer.
      style={{ touchAction: "pan-x pan-y", cursor: hoveredId ? (elements.find((e) => e.id === hoveredId)?.editability.allowed ? "pointer" : "not-allowed") : undefined }}
      onPointerDown={onRootDown}
      onPointerMove={onRootMove}
      onPointerUp={onRootUp}
      onPointerCancel={(e) => {
        endDrag(e);
        tap.current = null;
      }}
      onPointerLeave={() => setHoveredId(null)}
      // A tap also fires fake mouse events after touchend; their mousedown would pull focus off the
      // text field we just opened (and hide the keyboard). Pointer events already handled the tap.
      onTouchEnd={(e) => e.cancelable && e.preventDefault()}
      onDoubleClick={(e) => {
        const hit = hitAt(e as unknown as React.PointerEvent);
        if (hit?.element.editability.allowed) onEditRequest(hit.element.id, hit.fraction);
      }}
    >
      <svg className="pointer-events-none absolute inset-0" width={transform.width} height={transform.height}>
        {elements.map((element) => {
          if (element.id === editingId) return null;
          const isSelected = element.id === selectedId;
          const hovered = element.id === hoveredId && !dragging;
          const editable = element.editability.allowed;
          const edited = changesOf(element).any;
          let stroke = "transparent";
          let fill = "transparent";
          let dash: string | undefined;
          // Lime marker on white paper: hover highlights, selection adds an ink outline,
          // edited text keeps a dashed olive outline (all readable on a white page).
          if (isSelected) {
            stroke = "#0d0d0f";
            fill = dragging ? "rgba(198, 241, 53, 0.14)" : "rgba(198, 241, 53, 0.22)";
          } else if (hovered) {
            stroke = editable ? "rgba(13, 13, 15, 0.45)" : "#7a7a84";
            fill = editable ? "rgba(198, 241, 53, 0.32)" : "rgba(122, 122, 132, 0.12)";
            dash = editable ? undefined : "4 3";
          } else if (edited) {
            stroke = "#668511";
            dash = "3 3";
          }
          const quad = elementScreenQuad(element, widthOf(element), transform);
          return (
            <polygon
              key={element.id}
              data-element-id={element.id}
              points={quad.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")}
              fill={fill}
              stroke={stroke}
              strokeWidth={isSelected ? 1.5 : 1}
              strokeDasharray={dash}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              style={{ scrollMarginTop: 150, scrollMarginBottom: 40 }}
            >
              <title>{editable ? element.content : `${element.content}\n\n${element.editability.reason ?? "Not editable"}`}</title>
            </polygon>
          );
        })}
        {wordQuad && (
          <polygon
            data-testid="word-marker"
            points={wordQuad.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")}
            fill="rgba(198, 241, 53, 0.7)"
            stroke="#0d0d0f"
            strokeWidth={1}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {selected?.editability.allowed && (
        <div
          aria-hidden
          data-drag-handle={selected.id}
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: widthOf(selected),
            height: selected.ascent - selected.descent,
            transform: toCssMatrix(localBoxCssMatrix(transform, selected.matrix, selected.ascent)),
            touchAction: "none",
            cursor: dragging ? "grabbing" : "grab",
          }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            startDrag(e, selected.id);
          }}
          onPointerMove={(e) => {
            e.stopPropagation();
            moveDrag(e);
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            const pressed = endDrag(e);
            // A touch that didn't move is a tap on the selected line: edit it, at the tapped word.
            if (pressed && e.pointerType !== "mouse") onEditRequest(pressed, fractionAlongElement(selected, widthOf(selected), transform, pointOf(e)));
          }}
          onPointerCancel={(e) => {
            e.stopPropagation();
            endDrag(e);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onEditRequest(selected.id, fractionAlongElement(selected, widthOf(selected), transform, pointOf(e)));
          }}
        />
      )}
    </div>
  );
}

export const ElementOverlay = memo(ElementOverlayImpl);
