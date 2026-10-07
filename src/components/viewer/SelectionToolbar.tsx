"use client";

import { Lock, Minus, Pencil, Plus, RotateCcw, SlidersHorizontal, Trash2 } from "lucide-react";
import { IconButton } from "@/components/ui/Button";
import type { PageTransform } from "@/lib/geometry/coordinates";
import { type EditOperation, changesOf } from "@/lib/editor/operations";
import type { TextElement } from "@/lib/model/types";
import { elementScreenBounds } from "./elementGeometry";

interface Props {
  element: TextElement;
  transform: PageTransform;
  width: number;
  onEdit: (op: EditOperation) => void;
  onStartInlineEdit: () => void;
  onShowDetails: () => void;
}

const TOOLBAR_HEIGHT = 44;
const GAP = 8;

/** Floating quick actions next to the selected text. */
export function SelectionToolbar({ element, transform, width, onEdit, onStartInlineEdit, onShowDetails }: Props) {
  const bounds = elementScreenBounds(element, width, transform);
  const above = bounds.y - TOOLBAR_HEIGHT - GAP;
  const top = above >= 4 ? above : bounds.y + bounds.height + GAP;
  // Keep the toolbar inside the page horizontally.
  const half = Math.min(170, transform.width / 2);
  const left = Math.min(Math.max(bounds.x + bounds.width / 2, half), transform.width - half);
  const editable = element.editability.allowed;
  const changed = changesOf(element).any;
  const size = element.style.fontSize ?? 0;
  const id = element.id;
  const divider = <div className="mx-0.5 h-5 w-px bg-white/10" />;

  return (
    <div
      role="toolbar"
      aria-label="Text actions"
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className="animate-pop-in absolute z-20 flex -translate-x-1/2 items-center gap-0.5 whitespace-nowrap rounded-xl bg-zinc-900/95 p-1 text-zinc-200 shadow-2xl shadow-black/50 ring-1 ring-white/10 backdrop-blur"
      style={{ left, top, height: TOOLBAR_HEIGHT }}
    >
      {!editable ? (
        <span className="flex max-w-72 items-center gap-1.5 px-2.5 text-xs text-zinc-300" title={element.editability.reason}>
          <Lock className="size-3.5 shrink-0 text-zinc-500" />
          <span className="truncate">Read-only — {element.editability.reason}</span>
        </span>
      ) : (
        <>
          <button
            onClick={onStartInlineEdit}
            className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-white hover:bg-white/10"
          >
            <Pencil className="size-3.5" /> Edit
          </button>
          {divider}
          <IconButton
            label="Smaller"
            tooltipSide="top"
            disabled={size <= 1}
            onClick={() => onEdit({ type: "setStyle", elementId: id, style: { fontSize: Math.max(1, Math.round((size - 1) * 2) / 2) } })}
          >
            <Minus className="size-3.5" />
          </IconButton>
          <span className="w-8 text-center text-xs font-medium tabular-nums text-zinc-200">{Math.round(size * 10) / 10}</span>
          <IconButton
            label="Larger"
            tooltipSide="top"
            onClick={() => onEdit({ type: "setStyle", elementId: id, style: { fontSize: Math.round((size + 1) * 2) / 2 } })}
          >
            <Plus className="size-3.5" />
          </IconButton>
          {divider}
          <label className="relative flex size-9 cursor-pointer items-center justify-center rounded-lg hover:bg-white/10 sm:size-8" aria-label="Text colour">
            <span className="size-4 rounded-full ring-2 ring-white/25" style={{ background: element.style.color ?? "#000" }} />
            <input
              type="color"
              className="absolute inset-0 cursor-pointer opacity-0"
              value={element.style.color ?? "#000000"}
              onChange={(e) => onEdit({ type: "setStyle", elementId: id, style: { color: e.target.value } })}
            />
          </label>
          {changed && (
            <IconButton label="Revert to original" tooltipSide="top" onClick={() => onEdit({ type: "reset", elementId: id })}>
              <RotateCcw className="size-3.5" />
            </IconButton>
          )}
          <IconButton
            label="Remove text"
            tooltipSide="top"
            className="hover:bg-red-500/15 hover:text-red-300"
            onClick={() => onEdit({ type: "setText", elementId: id, text: "" })}
          >
            <Trash2 className="size-3.5" />
          </IconButton>
          {divider}
          <IconButton label="More options" tooltipSide="top" onClick={onShowDetails}>
            <SlidersHorizontal className="size-3.5" />
          </IconButton>
        </>
      )}
    </div>
  );
}
