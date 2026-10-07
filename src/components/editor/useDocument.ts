"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DocumentModel, PDFPage } from "@/lib/model/types";
import { userMessageOf } from "@/lib/pdf/errors";
import { PdfSession } from "@/lib/pdf/session";

export type DocumentState =
  | { status: "idle" }
  | { status: "loading"; fileName: string }
  | { status: "ready"; session: PdfSession; model: DocumentModel }
  | { status: "error"; fileName?: string; message: string };

/** Pages analysed straight after opening, to detect scanned documents early. */
const EAGER_PAGES = 3;

/**
 * Owns the open PDF session and the analysed (unedited) document model. Pages are
 * analysed when they scroll into view and, in the background, one at a time.
 */
export function useDocument() {
  const [state, setState] = useState<DocumentState>({ status: "idle" });
  const sessionRef = useRef<PdfSession | null>(null);

  const storePage = useCallback((session: PdfSession, page: PDFPage) => {
    setState((s) => {
      if (s.status !== "ready" || s.session !== session) return s;
      const pages = s.model.pages.slice();
      pages[page.pageNumber - 1] = page;
      return { ...s, model: { ...s.model, pages, fonts: session.fontsSnapshot() } };
    });
  }, []);

  const analyze = useCallback(
    async (session: PdfSession, pageNumber: number) => {
      const page = await session.analyzePage(pageNumber);
      if (sessionRef.current === session) storePage(session, page);
      return page;
    },
    [storePage],
  );

  const open = useCallback(
    async (fileName: string, bytes: Uint8Array) => {
      const previous = sessionRef.current;
      sessionRef.current = null;
      void previous?.destroy();
      setState({ status: "loading", fileName });
      try {
        const session = await PdfSession.open(fileName, bytes);
        const model = await session.createModel();
        sessionRef.current = session;
        setState({ status: "ready", session, model });

        for (let n = 1; n <= Math.min(EAGER_PAGES, session.pageCount); n++) await analyze(session, n);
        // Remaining pages in the background, yielding to the UI between pages.
        for (let n = EAGER_PAGES + 1; n <= session.pageCount; n++) {
          await new Promise((resolve) => setTimeout(resolve, 0));
          if (sessionRef.current !== session) return;
          await analyze(session, n);
        }
      } catch (error) {
        setState({ status: "error", fileName, message: userMessageOf(error, "This PDF could not be opened.") });
      }
    },
    [analyze],
  );

  const ensureAnalyzed = useCallback(
    (pageNumber: number) => {
      const session = sessionRef.current;
      if (session) void analyze(session, pageNumber);
    },
    [analyze],
  );

  /** Closes the document and returns to the start screen. */
  const close = useCallback(() => {
    const previous = sessionRef.current;
    sessionRef.current = null;
    void previous?.destroy();
    setState({ status: "idle" });
  }, []);

  useEffect(() => () => void sessionRef.current?.destroy(), []);

  return { state, open, close, ensureAnalyzed };
}
