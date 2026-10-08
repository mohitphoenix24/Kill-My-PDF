"use client";

import { forwardRef, memo, useMemo } from "react";
import { createPageTransform } from "@/lib/geometry/coordinates";
import type { EditOperation } from "@/lib/editor/operations";
import { type FontInfo, type PDFPage, isTextElement } from "@/lib/model/types";
import type { PDFDocumentProxy } from "@/lib/pdf/pdfjs/pdfjs";
import { Spinner } from "@/components/ui/Button";
import { ElementOverlay, type TapAnchor } from "./ElementOverlay";
import { InlineTextEditor } from "./InlineTextEditor";
import { PageCanvas } from "./PageCanvas";
import { SelectionToolbar } from "./SelectionToolbar";
import { TextLayerView } from "./TextLayerView";

export type Tool = "edit" | "select";

interface Props {
  page: PDFPage;
  /** Document this page renders from: the original, or the export preview if the page has edits. */
  doc: PDFDocumentProxy;
  fonts: Record<string, FontInfo>;
  scale: number;
  tool: Tool;
  visible: boolean;
  selectedId: string | null;
  /** The element being edited (on touch screens the docked edit bar types into it). */
  editingId: string | null;
  /** True when typing happens on the page itself (mouse); false when the docked bar is used (touch). */
  editOnPage: boolean;
  anchor: TapAnchor | null;
  widths: ReadonlyMap<string, number>;
  onSelect: (id: string | null, fraction?: number) => void;
  onMove: (id: string, dx: number, dy: number) => void;
  onEdit: (op: EditOperation) => void;
  onEditRequest: (id: string, fraction?: number) => void;
  onStopEditing: () => void;
  onShowDetails: () => void;
}

const PageViewImpl = forwardRef<HTMLDivElement, Props>(function PageView(
  { page, doc, fonts, scale, tool, visible, selectedId, editingId, editOnPage, anchor, widths, onSelect, onMove, onEdit, onEditRequest, onStopEditing, onShowDetails },
  ref,
) {
  const transform = useMemo(
    () => createPageTransform({ viewBox: page.viewBox, rotation: page.rotation, userUnit: page.userUnit }, scale),
    [page.viewBox, page.rotation, page.userUnit, scale],
  );
  const textElements = useMemo(() => page.elements.filter(isTextElement), [page.elements]);
  const selected = selectedId ? textElements.find((e) => e.id === selectedId) : undefined;
  const editing = editingId ? textElements.find((e) => e.id === editingId) : undefined;
  const widthOf = (id: string, fallback: number) => widths.get(id) ?? fallback;
  const editMode = visible && tool === "edit" && page.status === "ready";
  const typingOnPage = !!editing && editOnPage;

  return (
    <div
      ref={ref}
      data-page-number={page.pageNumber}
      aria-label={`Page ${page.pageNumber}`}
      className="relative mx-auto rounded-[3px] bg-white shadow-[0_0_0_1px_rgb(255_255_255/0.04),0_20px_50px_-12px_rgb(0_0_0/0.8)]"
      style={{ width: transform.width, height: transform.height }}
    >
      {visible && <PageCanvas doc={doc} pageNumber={page.pageNumber} scale={scale} />}
      {visible && tool === "select" && <TextLayerView doc={doc} pageNumber={page.pageNumber} scale={scale} />}
      {editMode && (
        <ElementOverlay
          elements={textElements}
          fonts={fonts}
          transform={transform}
          selectedId={selectedId}
          editingId={typingOnPage ? editingId : null}
          anchor={anchor}
          widths={widths}
          onSelect={onSelect}
          onMove={onMove}
          onEditRequest={onEditRequest}
        />
      )}
      {editMode && selected && !editing && (
        <SelectionToolbar
          element={selected}
          transform={transform}
          width={widthOf(selected.id, selected.width)}
          onEdit={onEdit}
          onStartInlineEdit={() => onEditRequest(selected.id)}
          onShowDetails={onShowDetails}
        />
      )}
      {editMode && typingOnPage && editing && (
        <InlineTextEditor
          key={editing.id}
          element={editing}
          font={editing.fontKey ? fonts[editing.fontKey] : undefined}
          transform={transform}
          width={widthOf(editing.id, editing.width)}
          anchor={anchor && anchor.id === editing.id ? anchor.fraction : null}
          onChange={(text) => onEdit({ type: "setText", elementId: editing.id, text })}
          onDone={onStopEditing}
          onCancel={(initial) => {
            if (initial !== editing.content) onEdit({ type: "setText", elementId: editing.id, text: initial });
            onStopEditing();
          }}
        />
      )}
      {page.status === "pending" && visible && (
        <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-ink-900/90 px-2.5 py-1 text-[11px] font-medium text-white ring-1 ring-white/10 backdrop-blur">
          <Spinner className="size-3" /> Analysing
        </div>
      )}
      {page.status === "error" && (
        <div className="absolute inset-x-3 top-3 rounded-lg bg-coral-500/10 px-3 py-2 text-xs text-coral-300 ring-1 ring-coral-500/25">{page.error}</div>
      )}
    </div>
  );
});

export const PageView = memo(PageViewImpl);
