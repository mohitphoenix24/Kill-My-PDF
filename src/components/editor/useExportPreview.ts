"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { changedElements } from "@/lib/editor/operations";
import type { DocumentModel } from "@/lib/model/types";
import { loadBundledFont } from "@/lib/browser/files";
import { type ElementExportReport, exportPdf } from "@/lib/pdf/export/exporter";
import { userMessageOf } from "@/lib/pdf/errors";
import { type PDFDocumentProxy, openWithPdfjs } from "@/lib/pdf/pdfjs/pdfjs";
import type { PdfSession } from "@/lib/pdf/session";

export interface ExportPreview {
  /** The exported PDF opened in pdf.js, or null when there are no edits. */
  doc: PDFDocumentProxy | null;
  /** Pages whose rendering should come from `doc`. */
  pages: ReadonlySet<number>;
  reports: ReadonlyMap<string, ElementExportReport>;
  status: "idle" | "updating" | "ready" | "error";
  error?: string;
}

const EMPTY: ExportPreview = { doc: null, pages: new Set(), reports: new Map(), status: "idle" };
const DEBOUNCE_MS = 300;

/**
 * Keeps a rendered preview of the *actual export*: after each edit (debounced) the
 * PDF is exported exactly as Save would, re-opened with pdf.js, and edited pages
 * render from it. What you see is the file you will download.
 */
export function useExportPreview(session: PdfSession | null, model: DocumentModel | null): ExportPreview {
  const [preview, setPreview] = useState<ExportPreview>(EMPTY);
  const generation = useRef(0);
  const currentDoc = useRef<PDFDocumentProxy | null>(null);

  const replaceDoc = (next: PDFDocumentProxy | null) => {
    const old = currentDoc.current;
    currentDoc.current = next;
    // Destroy after React has switched pages over to the new document.
    if (old && old !== next) setTimeout(() => void old.destroy(), 1000);
  };
  const changedKey = useMemo(() => {
    if (!model) return "";
    return JSON.stringify(
      changedElements(model).map((e) => [e.id, e.content, e.matrix, e.style.color]),
    );
  }, [model]);

  useEffect(() => {
    const gen = ++generation.current;
    const timer = setTimeout(
      async () => {
        if (!session || !model || changedKey === "" || changedKey === "[]") {
          replaceDoc(null);
          setPreview(EMPTY);
          return;
        }
        setPreview((p) => ({ ...p, status: "updating" }));
        try {
          const result = await exportPdf({ originalBytes: session.originalBytes, model, loadFontFile: loadBundledFont });
          const doc = await openWithPdfjs(result.bytes);
          if (gen !== generation.current) {
            void doc.destroy();
            return;
          }
          replaceDoc(doc);
          setPreview({
            doc,
            pages: new Set(result.reports.map((r) => r.pageNumber)),
            reports: new Map(result.reports.map((r) => [r.elementId, r])),
            status: "ready",
          });
        } catch (error) {
          if (gen !== generation.current) return;
          setPreview((p) => ({ ...p, status: "error", error: userMessageOf(error, "The preview could not be updated.") }));
        }
      },
      changedKey === "[]" ? 0 : DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
    // `model` is read through changedKey; re-exporting on unrelated model changes
    // (e.g. a background page finishing analysis) would be wasted work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, changedKey]);

  return preview;
}
