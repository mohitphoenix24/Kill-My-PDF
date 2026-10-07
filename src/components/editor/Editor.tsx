"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileUp, TriangleAlert } from "lucide-react";
import { Landing } from "@/components/landing/Landing";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Toaster, useToasts } from "@/components/ui/Toaster";
import { useMediaQuery } from "@/components/ui/useMediaQuery";
import { PdfViewer, type ScrollRequest } from "@/components/viewer/PdfViewer";
import type { Tool } from "@/components/viewer/PageView";
import { canEditInline } from "@/components/viewer/InlineTextEditor";
import { createPageTransform } from "@/lib/geometry/coordinates";
import { downloadBytes, editedFileName, loadBundledFont, readFileBytes } from "@/lib/browser/files";
import { EMPTY_HISTORY, type EditHistory, appliedOps, canRedo, canUndo, record, redo, undo } from "@/lib/editor/history";
import { type EditOperation, applyOperation, applyOperations, changedElements, findTextElement, pageNumberOf } from "@/lib/editor/operations";
import { exportPdf } from "@/lib/pdf/export/exporter";
import { verifyExport } from "@/lib/pdf/export/verify";
import { userMessageOf } from "@/lib/pdf/errors";
import { SCANNED_PDF_MESSAGE } from "@/lib/pdf/session";
import { Inspector } from "./Inspector";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { ThumbnailRail } from "./ThumbnailRail";
import { TopBar } from "./TopBar";
import { useDocument } from "./useDocument";
import { useExportPreview } from "./useExportPreview";
import { ViewerDock } from "./ViewerDock";

const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const WIDE_SCREEN = "(min-width: 1024px)";
/** History entry pushed while a document is open, so the browser Back button returns home. */
const EDITOR_HISTORY_STATE = { view: "editor" };

type PendingAction = { kind: "open"; file: File } | { kind: "home" };

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD_KEY = isMac ? "⌘" : "Ctrl+";

export default function Editor() {
  const { state, open, close, ensureAnalyzed } = useDocument();
  const { toasts, show: toast, dismiss } = useToasts();
  const wide = useMediaQuery(WIDE_SCREEN);
  const [history, setHistory] = useState<EditHistory>(EMPTY_HISTORY);
  const [savedHistory, setSavedHistory] = useState<EditHistory>(EMPTY_HISTORY);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("edit");
  const [zoom, setZoom] = useState<"fit" | number>("fit");
  const [viewportWidth, setViewportWidth] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scrollRequest, setScrollRequest] = useState<ScrollRequest | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(() => window.matchMedia(WIDE_SCREEN).matches);
  const fileInput = useRef<HTMLInputElement>(null);

  const session = state.status === "ready" ? state.session : null;
  const base = state.status === "ready" ? state.model : null;
  const model = useMemo(() => (base ? applyOperations(base, appliedOps(history)) : null), [base, history]);
  const preview = useExportPreview(session, model);
  const modelRef = useRef(model);
  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  const changed = useMemo(() => (model ? changedElements(model) : []), [model]);
  const editCount = changed.length;
  const editedPages = useMemo(() => new Set(changed.map((e) => e.pageNumber)), [changed]);
  const dirty = editCount > 0 && (savedHistory.ops !== history.ops || savedHistory.cursor !== history.cursor);
  const selected = model && selectedId ? (findTextElement(model, selectedId) ?? null) : null;

  // ---- Opening, closing, navigation -----------------------------------------
  const resetEditorState = useCallback(() => {
    setHistory(EMPTY_HISTORY);
    setSavedHistory(EMPTY_HISTORY);
    setSelectedId(null);
    setEditingId(null);
    setCurrentPage(1);
    setZoom("fit");
    setTool("edit");
  }, []);

  const openNow = useCallback(
    async (file: File) => {
      resetEditorState();
      void open(file.name, await readFileBytes(file));
    },
    [open, resetEditorState],
  );

  const ignoreNextPop = useRef(false);
  const goHome = useCallback(() => {
    resetEditorState();
    close();
    if ((window.history.state as typeof EDITOR_HISTORY_STATE | null)?.view === "editor") {
      ignoreNextPop.current = true;
      window.history.back();
    }
  }, [close, resetEditorState]);

  const requestOpen = useCallback(
    (file: File) => {
      if (dirty) setPending({ kind: "open", file });
      else void openNow(file);
    },
    [dirty, openNow],
  );

  const requestHome = useCallback(() => {
    if (dirty) setPending({ kind: "home" });
    else goHome();
  }, [dirty, goHome]);

  const confirmPending = useCallback(() => {
    const action = pending;
    setPending(null);
    if (action?.kind === "open") void openNow(action.file);
    if (action?.kind === "home") goHome();
  }, [pending, openNow, goHome]);

  // Browser Back from the editor returns to the start screen (asking first if there are unsaved edits).
  useEffect(() => {
    if (session && (window.history.state as typeof EDITOR_HISTORY_STATE | null)?.view !== "editor") {
      window.history.pushState(EDITOR_HISTORY_STATE, "");
    }
  }, [session]);
  const navRef = useRef({ hasDoc: false, dirty: false, goHomeFromBack: () => {} });
  useEffect(() => {
    navRef.current = {
      hasDoc: !!session,
      dirty,
      goHomeFromBack: () => {
        resetEditorState();
        close();
      },
    };
  });
  useEffect(() => {
    const onPop = () => {
      if (ignoreNextPop.current) {
        ignoreNextPop.current = false;
        return;
      }
      const nav = navRef.current;
      if (!nav.hasDoc) return;
      if (nav.dirty) {
        window.history.pushState(EDITOR_HISTORY_STATE, ""); // stay until the user confirms
        setPending({ kind: "home" });
      } else {
        nav.goHomeFromBack();
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Drag and drop anywhere in the window.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) requestOpen(file);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [requestOpen]);

  // Warn before closing the tab with edits that haven't been downloaded.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // ---- Editing ---------------------------------------------------------------
  const applyEdit = useCallback((op: EditOperation) => {
    const current = modelRef.current;
    if (!current || applyOperation(current, op) === current) return; // read-only or no-op
    setHistory((h) => record(h, op, Date.now()));
  }, []);

  const handleMove = useCallback(
    (id: string, dx: number, dy: number) => applyEdit({ type: "move", elementId: id, dx, dy }),
    [applyEdit],
  );

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    setEditingId((editing) => (editing && editing !== id ? null : editing));
  }, []);

  const scaleRef = useRef(1);
  /** Double-click / Enter: type on the page when the text is horizontal, otherwise in the panel. */
  const startEditing = useCallback((id: string) => {
    const current = modelRef.current;
    const element = current && findTextElement(current, id);
    if (!current || !element || !element.editability.allowed) return;
    setSelectedId(id);
    const page = current.pages[pageNumberOf(id) - 1];
    if (canEditInline(element, createPageTransform(page, scaleRef.current))) {
      setEditingId(id);
    } else {
      setInspectorOpen(true);
      setFocusRequest((n) => n + 1);
    }
  }, []);
  const stopEditing = useCallback(() => setEditingId(null), []);
  const showDetails = useCallback(() => setInspectorOpen(true), []);

  const doUndo = useCallback(() => {
    setEditingId(null);
    setHistory(undo);
  }, []);
  const doRedo = useCallback(() => {
    setEditingId(null);
    setHistory(redo);
  }, []);

  // ---- Saving ----------------------------------------------------------------
  const save = useCallback(async () => {
    if (!session || !model || editCount === 0 || saving) return;
    setEditingId(null);
    setSaving(true);
    try {
      const result = await exportPdf({ originalBytes: session.originalBytes, model, loadFontFile: loadBundledFont });
      const verification = await verifyExport(session.originalBytes, result.bytes, model);
      const name = editedFileName(session.fileName);
      downloadBytes(result.bytes, name);
      setSavedHistory(history);
      if (verification.ok) {
        const substituted = result.reports.filter((r) => r.strategy === "redraw-substitute").length;
        toast({
          tone: "success",
          title: `Downloaded ${name}`,
          description:
            `${result.reports.length} change${result.reports.length === 1 ? "" : "s"} saved as real, selectable text` +
            (substituted ? ` (${substituted} with a similar font).` : " in the original fonts."),
        });
      } else {
        toast({ tone: "error", title: `Downloaded ${name} with warnings`, description: verification.problems.join(" ") });
      }
    } catch (error) {
      toast({ tone: "error", title: "Download failed", description: userMessageOf(error, "The edited PDF could not be created.") });
    } finally {
      setSaving(false);
    }
  }, [session, model, editCount, saving, history, toast]);

  // ---- Zoom & navigation -------------------------------------------------------
  const fitScale = useMemo(() => {
    if (!model || viewportWidth <= 0) return 1;
    const padding = viewportWidth < 640 ? 24 : 48; // matches the viewer's px-3 / sm:px-6
    const widest = Math.max(...model.pages.map((p) => createPageTransform(p, 1).width));
    return Math.min(2, Math.max(0.25, (viewportWidth - padding) / widest));
  }, [model, viewportWidth]);
  const scale = zoom === "fit" ? fitScale : zoom;
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  const zoomIn = useCallback(() => setZoom(ZOOM_STEPS.find((s) => s > scale + 1e-6) ?? ZOOM_STEPS.at(-1)!), [scale]);
  const zoomOut = useCallback(() => setZoom([...ZOOM_STEPS].reverse().find((s) => s < scale - 1e-6) ?? ZOOM_STEPS[0]), [scale]);
  const fitWidth = useCallback(() => setZoom("fit"), []);

  const goToPage = useCallback(
    (n: number) => {
      if (!model) return;
      setScrollRequest({ pageNumber: Math.min(model.pageCount, Math.max(1, n)), nonce: Date.now() });
    },
    [model],
  );

  // ---- Keyboard shortcuts ----------------------------------------------------
  const keys = useRef({ doUndo, doRedo, applyEdit, selectedId, save, zoomIn, zoomOut, fitWidth, startEditing, hasDoc: !!model });
  useEffect(() => {
    keys.current = { doUndo, doRedo, applyEdit, selectedId, save, zoomIn, zoomOut, fitWidth, startEditing, hasDoc: !!model };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keys.current;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === "s") {
        e.preventDefault();
        void k.save();
        return;
      }
      if (mod && key === "o") {
        e.preventDefault();
        fileInput.current?.click();
        return;
      }
      if (isTypingTarget(e.target) || !k.hasDoc) return; // inputs keep native undo, caret keys, etc.
      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) k.doRedo();
        else k.doUndo();
      } else if (mod && key === "y") {
        e.preventDefault();
        k.doRedo();
      } else if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        k.zoomIn();
      } else if (mod && e.key === "-") {
        e.preventDefault();
        k.zoomOut();
      } else if (mod && e.key === "0") {
        e.preventDefault();
        k.fitWidth();
      } else if (e.key === "?") {
        setShortcutsOpen(true);
      } else if (e.key === "Escape") {
        setSelectedId(null);
      } else if (k.selectedId && e.key === "Enter") {
        e.preventDefault();
        k.startEditing(k.selectedId);
      } else if (k.selectedId && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        k.applyEdit({ type: "setText", elementId: k.selectedId, text: "" });
      } else if (k.selectedId && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
        const [dx, dy] = delta[e.key] ?? [0, 0];
        k.applyEdit({ type: "move", elementId: k.selectedId, dx, dy });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- Derived UI state ----------------------------------------------------------
  const widths = useMemo(() => new Map([...preview.reports].map(([id, r]) => [id, r.width])), [preview.reports]);

  const docNotice = useMemo(() => {
    if (!model) return null;
    if (!model.editing.allowed) return model.editing.reason ?? null;
    const anyText = model.pages.some((p) => p.contentKind === "text");
    if (!anyText && model.pages.slice(0, 3).every((p) => p.status === "ready")) return SCANNED_PDF_MESSAGE;
    return null;
  }, [model]);

  const analysing = !!model && model.pages.slice(0, 3).some((p) => p.status === "pending");
  const sheet = !wide; // on narrow screens the inspector is a bottom sheet

  const pendingDescription =
    pending?.kind === "open"
      ? `You have ${editCount} change${editCount === 1 ? "" : "s"} that haven't been downloaded. Opening ${pending.file.name} will discard them.`
      : `You have ${editCount} change${editCount === 1 ? "" : "s"} that haven't been downloaded. Leaving will discard them.`;

  // The toaster, dialogs and file input stay mounted across start screen ⇄ editor.
  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        aria-label="Choose PDF"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) requestOpen(file);
          e.target.value = "";
        }}
      />

      {!session || !model ? (
        <Landing
          loadingFile={state.status === "loading" ? state.fileName : undefined}
          error={state.status === "error" ? state.message : undefined}
          dragging={dragging}
          onOpen={() => fileInput.current?.click()}
        />
      ) : (
        <div className="flex h-dvh flex-col bg-zinc-950">
          <TopBar
            fileName={model.fileName}
            pageCount={model.pageCount}
            editCount={editCount}
            dirty={dirty}
            canUndo={canUndo(history)}
            canRedo={canRedo(history)}
            canSave={model.editing.allowed && editCount > 0}
            saving={saving}
            tool={tool}
            inspectorOpen={inspectorOpen}
            modKey={MOD_KEY}
            onHome={requestHome}
            onOpen={() => fileInput.current?.click()}
            onSave={save}
            onUndo={doUndo}
            onRedo={doRedo}
            onToolChange={(t) => {
              setTool(t);
              setEditingId(null);
            }}
            onShortcuts={() => setShortcutsOpen(true)}
            onToggleInspector={() => setInspectorOpen((o) => !o)}
          />

          {(docNotice || preview.status === "error") && (
            <div role="alert" className="flex items-center gap-2.5 border-b border-amber-400/20 bg-amber-400/[0.08] px-4 py-2.5 text-sm text-amber-200">
              <TriangleAlert className="size-4 shrink-0 text-amber-400" />
              {docNotice ?? preview.error}
            </div>
          )}

          <div className="relative flex min-h-0 flex-1">
            {model.pageCount > 1 && (
              <aside className="hidden w-[156px] shrink-0 border-r border-white/[0.07] bg-zinc-950 lg:block">
                <ThumbnailRail
                  model={model}
                  originalDoc={session.pdfjs}
                  previewDoc={preview.doc}
                  previewPages={preview.pages}
                  editedPages={editedPages}
                  currentPage={currentPage}
                  onGoToPage={goToPage}
                />
              </aside>
            )}

            <main className="relative min-w-0 flex-1">
              <PdfViewer
                model={model}
                originalDoc={session.pdfjs}
                previewDoc={preview.doc}
                previewPages={preview.pages}
                scale={scale}
                tool={tool}
                selectedId={selectedId}
                editingId={editingId}
                widths={widths}
                scrollRequest={scrollRequest}
                onSelect={select}
                onMove={handleMove}
                onEdit={applyEdit}
                onEditRequest={startEditing}
                onStopEditing={stopEditing}
                onShowDetails={showDetails}
                onPageVisible={ensureAnalyzed}
                onCurrentPageChange={setCurrentPage}
                onViewportWidth={setViewportWidth}
              />
              {!(sheet && inspectorOpen) && (
                <ViewerDock
                  currentPage={currentPage}
                  pageCount={model.pageCount}
                  scale={scale}
                  fitWidth={zoom === "fit"}
                  previewStatus={editCount > 0 ? preview.status : "idle"}
                  analysing={analysing}
                  modKey={MOD_KEY}
                  onGoToPage={goToPage}
                  onZoomIn={zoomIn}
                  onZoomOut={zoomOut}
                  onFitWidth={fitWidth}
                />
              )}
            </main>

            {inspectorOpen && (
              <aside
                aria-label="Properties"
                className={
                  sheet
                    ? "thin-scroll animate-sheet-in fixed inset-x-0 bottom-0 z-40 max-h-[72dvh] overflow-y-auto rounded-t-2xl border-t border-white/10 bg-zinc-950 pb-[env(safe-area-inset-bottom)] shadow-[0_-24px_60px_-12px_rgb(0_0_0/0.9)]"
                    : "thin-scroll w-[320px] shrink-0 overflow-y-auto border-l border-white/[0.07] bg-zinc-950"
                }
              >
                {sheet && (
                  <div className="flex justify-center bg-zinc-950 pt-2" aria-hidden>
                    <span className="h-1 w-10 rounded-full bg-white/20" />
                  </div>
                )}
                <Inspector
                  model={model}
                  selected={selected}
                  report={selected ? preview.reports.get(selected.id) : undefined}
                  previewUpdating={preview.status === "updating"}
                  focusRequest={focusRequest}
                  onEdit={applyEdit}
                  onSelect={select}
                  onClose={() => setInspectorOpen(false)}
                />
              </aside>
            )}
          </div>

          {dragging && (
            <div className="animate-fade-in pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-indigo-400/70 bg-zinc-900/90 px-14 py-11 shadow-2xl shadow-indigo-500/20">
                <FileUp className="size-8 text-indigo-300" />
                <p className="text-base font-medium text-white">Drop to open this PDF</p>
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title="Discard your changes?"
        description={pendingDescription}
        footer={
          <>
            <Button variant="secondary" size="sm" autoFocus onClick={() => setPending(null)}>
              Keep editing
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="bg-red-500 shadow-[0_8px_24px_-8px_rgb(239_68_68/0.6)] hover:bg-red-400 active:bg-red-600"
              onClick={confirmPending}
            >
              {pending?.kind === "open" ? "Discard & open" : "Discard & leave"}
            </Button>
          </>
        }
      />
      <ShortcutsDialog open={shortcutsOpen} modKey={MOD_KEY} onClose={() => setShortcutsOpen(false)} />
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
