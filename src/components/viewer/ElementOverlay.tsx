"use client";

import { memo, useRef, useState } from "react";
import { type PageTransform, localBoxCssMatrix, screenDeltaToPdfDelta, toCssMatrix } from "@/lib/geometry/coordinates";
import { changesOf } from "@/lib/editor/operations";
import type { TextElement } from "@/lib/model/types";
import { elementScreenQuad } from "./elementGeometry";

interface Props {
  elements: TextElement[];
  transform: PageTransform;
  selectedId: string | null;
  /** Element currently being edited inline (its outline is hidden under the field). */
  editingId: string | null;
  /** Measured widths (ems) from the latest export preview, by element id. */
  widths: ReadonlyMap<string, number>;
  onSelect: (id: string | null) => void;
  onMove: (id: string, dx: number, dy: number) => void;
  onEditRequest: (id: string) => void;
}

const DRAG_THRESHOLD_PX = 3;

/**
 * Outlines for every text element (SVG, so rotated text gets exact quads), plus a
 * drag handle over the selected element. The handle is an HTML element because
 * `touch-action: none` — needed to drag with a finger instead of scrolling — is
 * only reliable on HTML boxes. Unselected text never blocks touch scrolling.
 */
function ElementOverlayImpl({ elements, transform, selectedId, editingId, widths, onSelect, onMove, onEditRequest }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);

  const startDrag = (event: React.PointerEvent, element: TextElement) => {
    drag.current = { id: element.id, x: event.clientX, y: event.clientY, moved: false };
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    if (!d.moved) setDragging(true);
    d.moved = true;
    d.x = event.clientX;
    d.y = event.clientY;
    const delta = screenDeltaToPdfDelta(transform, dx, dy);
    onMove(d.id, delta.x, delta.y);
  };

  const endDrag = (event: React.PointerEvent) => {
    if (!drag.current) return;
    (event.currentTarget as Element).releasePointerCapture?.(event.pointerId);
    drag.current = null;
    setDragging(false);
  };

  const widthOf = (e: TextElement) => Math.max(widths.get(e.id) ?? e.width, 0.25);
  const selected = elements.find((e) => e.id === selectedId && e.id !== editingId);

  return (
    <>
      <svg
        className="absolute inset-0"
        width={transform.width}
        height={transform.height}
        onPointerDown={() => onSelect(null)}
      >
        {elements.map((element) => {
          if (element.id === editingId) return null;
          const isSelected = element.id === selectedId;
          const hovered = element.id === hoveredId;
          const editable = element.editability.allowed;
          const edited = changesOf(element).any;
          let stroke = "transparent";
          let fill = "transparent";
          let dash: string | undefined;
          if (isSelected) {
            stroke = "#6366f1";
            fill = dragging ? "rgba(99, 102, 241, 0.05)" : "rgba(99, 102, 241, 0.10)";
          } else if (hovered) {
            stroke = editable ? "#818cf8" : "#a1a1aa";
            fill = editable ? "rgba(99, 102, 241, 0.07)" : "rgba(161, 161, 170, 0.08)";
            dash = editable ? undefined : "4 3";
          } else if (edited) {
            stroke = "rgba(16, 185, 129, 0.7)";
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
              style={{ cursor: editable ? "pointer" : "not-allowed", pointerEvents: "all" }}
              onPointerEnter={() => setHoveredId(element.id)}
              onPointerLeave={() => setHoveredId((h) => (h === element.id ? null : h))}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                onSelect(element.id);
                // With a mouse, press-and-drag moves text right away; on touch the first tap selects.
                if (editable && e.pointerType === "mouse") startDrag(e, element);
              }}
              onPointerMove={handlePointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onDoubleClick={() => editable && onEditRequest(element.id)}
            >
              <title>{editable ? element.content : `${element.content}\n\n${element.editability.reason ?? "Not editable"}`}</title>
            </polygon>
          );
        })}
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
            startDrag(e, selected);
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={() => onEditRequest(selected.id)}
        />
      )}
    </>
  );
}

export const ElementOverlay = memo(ElementOverlayImpl);
