"use client";

import { forwardRef, memo, useMemo } from "react";
import { createPageTransform } from "@/lib/geometry/coordinates";
import type { EditOperation } from "@/lib/editor/operations";
import { type FontInfo, type PDFPage, isTextElement } from "@/lib/model/types";
import type { PDFDocumentProxy } from "@/lib/pdf/pdfjs/pdfjs";
import { Spinner } from "@/components/ui/Button";
import { ElementOverlay } from "./ElementOverlay";
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
  editingId: string | null;
  widths: ReadonlyMap<string, number>;
  onSelect: (id: string | null) => void;
  onMove: (id: string, dx: number, dy: number) => void;
  onEdit: (op: EditOperation) => void;
  onEditRequest: (id: string) => void;
  onStopEditing: () => void;
  onShowDetails: () => void;
}

const PageViewImpl = forwardRef<HTMLDivElement, Props>(function PageView(
  { page, doc, fonts, scale, tool, visible, selectedId, editingId, widths, onSelect, onMove, onEdit, onEditRequest, onStopEditing, onShowDetails },
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
          transform={transform}
          selectedId={selectedId}
          editingId={editingId}
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
      {editMode && editing && (
        <InlineTextEditor
          key={editing.id}
          element={editing}
          font={editing.fontKey ? fonts[editing.fontKey] : undefined}
          transform={transform}
          width={widthOf(editing.id, editing.width)}
          onChange={(text) => onEdit({ type: "setText", elementId: editing.id, text })}
          onDone={onStopEditing}
          onCancel={(initial) => {
            if (initial !== editing.content) onEdit({ type: "setText", elementId: editing.id, text: initial });
            onStopEditing();
          }}
        />
      )}
      {page.status === "pending" && visible && (
        <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-zinc-900/85 px-2.5 py-1 text-[11px] font-medium text-white ring-1 ring-white/10 backdrop-blur">
          <Spinner className="size-3" /> Analysing
        </div>
      )}
      {page.status === "error" && (
        <div className="absolute inset-x-3 top-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">{page.error}</div>
      )}
    </div>
  );
});

export const PageView = memo(PageViewImpl);
