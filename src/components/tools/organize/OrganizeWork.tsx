"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  FlipVertical2,
  Redo2,
  RotateCcw,
  RotateCw,
  Trash2,
  Undo2,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Spinner } from "@/components/ui/Button";
import { userMessageOf } from "@/lib/pdf/errors";
import { baseName, plural, safePdfName } from "@/lib/pdf/tools/common";
import { organizePdf } from "@/lib/pdf/tools/organize";
import {
  type PlanHistory,
  type PlanPage,
  canRedo,
  canUndo,
  commit,
  deletePages,
  duplicatePages,
  initialPlan,
  isUnchanged,
  movePages,
  redo,
  reversePages,
  rotatePages,
  toPlanItems,
  undo,
} from "@/lib/pdf/tools/pagePlan";
import { type LoadedPdf, disposePdf, loadPdfFile } from "../shared/pdfSource";
import { PdfThumb } from "../shared/PdfThumb";
import { ResultCard } from "../shared/ResultCard";
import { SortableGrid } from "../shared/SortableGrid";
import { ToolWorkShell } from "../shared/ToolWorkShell";
import { NameField, PanelSection, WorkLayout } from "../shared/WorkLayout";
import { nextPaint } from "../shared/nextPaint";
import type { WorkProps } from "../types";

type Loaded = { pdf: LoadedPdf };

export default function OrganizeWork({ files, toast, onExit }: WorkProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [history, setHistory] = useState<PlanHistory>({ present: [], past: [], future: [] });
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [outName, setOutName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ bytes: Uint8Array; name: string; pages: number } | null>(null);
  const started = useRef(false);
  const pdfRef = useRef<LoadedPdf | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    loadPdfFile(files[0])
      .then((pdf) => {
        pdfRef.current = pdf;
        setLoaded({ pdf });
        setHistory(initialPlan(pdf.pageCount));
        setOutName(`${baseName(pdf.name)}-organized`);
      })
      .catch((error) => onExit(userMessageOf(error, "That PDF couldn't be opened.")));
  }, [files, onExit]);
  useEffect(() => () => void (pdfRef.current && disposePdf(pdfRef.current)), []);

  const pages = history.present;
  const pdf = loaded?.pdf;

  // Run an edit and keep the selection pointing at pages that still exist.
  const apply = useCallback((edit: (pages: PlanPage[]) => PlanPage[], keepSelection = true) => {
    setHistory((h) => {
      const next = edit(h.present);
      if (next !== h.present) {
        const alive = new Set(next.map((p) => p.id));
        setSelected((sel) => (keepSelection ? new Set([...sel].filter((id) => alive.has(id))) : new Set()));
      }
      return commit(h, next);
    });
  }, []);

  const hasSelection = selected.size > 0;
  const toggle = (id: string) =>
    setSelected((sel) => {
      const next = new Set(sel);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const selectAll = () => setSelected(new Set(pages.map((p) => p.id)));
  const clearSelection = () => setSelected(new Set());

  const rotateSel = (delta: number) => apply((p) => rotatePages(p, selected, delta));
  const deleteSel = () => apply((p) => deletePages(p, selected));
  const duplicateSel = () => apply((p) => duplicatePages(p, selected));
  const moveSel = (dir: -1 | 1) => apply((p) => movePages(p, selected, dir));
  const doUndo = () => setHistory((h) => undo(h));
  const doRedo = () => setHistory((h) => redo(h));
  const doReset = () => {
    if (pdf) apply(() => initialPlan(pdf.pageCount).present, false);
  };

  // Keyboard: Delete, Ctrl/⌘ + Z / Shift+Z / Y / A.
  const keys = useRef({ deleteSel, doUndo, doRedo, selectAll, hasSelection });
  useEffect(() => {
    keys.current = { deleteSel, doUndo, doRedo, selectAll, hasSelection };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = keys.current;
      const key = e.key.toLowerCase();
      if ((e.key === "Delete" || e.key === "Backspace") && k.hasSelection) {
        e.preventDefault();
        k.deleteSel();
      } else if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) k.doRedo();
        else k.doUndo();
      } else if (mod && key === "y") {
        e.preventDefault();
        k.doRedo();
      } else if (mod && key === "a") {
        e.preventDefault();
        k.selectAll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const build = async (subset: PlanPage[], name: string) => {
    if (!pdf) return;
    setBusy(true);
    await nextPaint();
    try {
      const bytes = await organizePdf(pdf.doc, toPlanItems(subset));
      setResult({ bytes, name: safePdfName(name, "organized"), pages: subset.length });
    } catch (error) {
      toast({ tone: "error", title: "Couldn't save", description: userMessageOf(error, "Something went wrong while building the PDF.") });
    } finally {
      setBusy(false);
    }
  };
  const save = () => void build(pages, outName);
  const saveSelected = () => void build(pages.filter((p) => selected.has(p.id)), `${outName}-selected`);

  const changed = pdf ? !isUnchanged(pages, pdf.pageCount) : false;
  const canSave = !!pdf && pages.length > 0 && !busy;

  const selectionTools = useMemo(
    () => [
      { label: "Rotate left", icon: RotateCcw, run: () => rotateSel(-90) },
      { label: "Rotate right", icon: RotateCw, run: () => rotateSel(90) },
      { label: "Move earlier", icon: ArrowLeft, run: () => moveSel(-1) },
      { label: "Move later", icon: ArrowRight, run: () => moveSel(1) },
      { label: "Duplicate", icon: Copy, run: duplicateSel },
      { label: "Delete", icon: Trash2, run: deleteSel, danger: true },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected],
  );

  if (!pdf) {
    return (
      <ToolWorkShell slug="organize-pdf" subtitle="Reading your PDF…" onBack={onExit}>
        <div className="flex flex-1 items-center justify-center text-ink-400">
          <Spinner className="size-6 text-volt-400" />
        </div>
      </ToolWorkShell>
    );
  }

  if (result) {
    return (
      <ToolWorkShell slug="organize-pdf" onBack={onExit}>
        <ResultCard
          title="Sorted."
          subtitle={`${plural(result.pages, "page")} · exactly how you left them`}
          file={{ name: result.name, bytes: result.bytes }}
          stats={[plural(result.pages, "page")]}
          next={["edit-pdf", "split-pdf", "merge-pdf"]}
          onTweak={() => setResult(null)}
          onStartOver={() => onExit()}
        />
      </ToolWorkShell>
    );
  }

  // On phones the bar shows "Save N selected" beside this button, so the label shortens to "Save all".
  const saveButton = (shortLabel: boolean) => (
    <Button variant="primary" size="lg" className="h-12 w-full" disabled={!canSave} onClick={save}>
      {busy ? <Spinner /> : null}
      {busy ? "Saving…" : pages.length === 0 ? "No pages left" : shortLabel ? "Save all" : `Save ${plural(pages.length, "page")}`}
    </Button>
  );

  return (
    <ToolWorkShell slug="organize-pdf" subtitle={`${pdf.name} · ${plural(pages.length, "page")}${changed ? " · edited" : ""}`} onBack={onExit}>
      <WorkLayout
        main={
          <div className="mx-auto w-full max-w-6xl p-3 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <ToolbarButton label="Undo" disabled={!canUndo(history)} onClick={doUndo}>
                <Undo2 className="size-4" />
              </ToolbarButton>
              <ToolbarButton label="Redo" disabled={!canRedo(history)} onClick={doRedo}>
                <Redo2 className="size-4" />
              </ToolbarButton>
              <ToolbarButton label="Reverse order" disabled={pages.length < 2} onClick={() => apply(reversePages)}>
                <FlipVertical2 className="size-4" />
              </ToolbarButton>
              <span className="mx-1 hidden h-6 w-px bg-white/10 sm:block" />
              <Button variant="secondary" size="sm" className="h-11 sm:h-8" onClick={hasSelection && selected.size === pages.length ? clearSelection : selectAll}>
                {selected.size === pages.length && pages.length > 0 ? "Clear selection" : "Select all"}
              </Button>
              {changed && (
                <Button variant="ghost" size="sm" className="h-11 sm:h-8" onClick={doReset}>
                  Reset
                </Button>
              )}
              <p className="ml-auto text-xs text-ink-400">{hasSelection ? `${selected.size} selected` : "Tap pages to select them"}</p>
            </div>

            {pages.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 px-6 py-16 text-center">
                <p className="font-display text-xl font-bold text-white">That&apos;s every page deleted.</p>
                <p className="mt-1 text-sm text-ink-400">Bold move. Undo to bring them back.</p>
                <Button variant="secondary" className="mt-5" onClick={doUndo}>
                  <Undo2 className="size-4" /> Undo
                </Button>
              </div>
            ) : (
              <SortableGrid
                label="Pages"
                items={pages}
                onReorder={(next) => apply(() => next)}
                className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 xl:grid-cols-5"
                renderItem={(page, { index, isDragging }) => (
                  <PageTile
                    pdf={pdf}
                    page={page}
                    position={index + 1}
                    selected={selected.has(page.id)}
                    dimmed={isDragging}
                    onToggle={() => toggle(page.id)}
                    onRotate={() => apply((p) => rotatePages(p, new Set([page.id]), 90))}
                    onDelete={() => apply((p) => deletePages(p, new Set([page.id])))}
                  />
                )}
              />
            )}
            <div className="mt-8 lg:hidden">
              <NameField value={outName} onChange={setOutName} label="Name your file" />
            </div>
          </div>
        }
        sidebar={
          <>
            <PanelSection title="Selection">
              <p className="mb-3 text-xs text-ink-400">{hasSelection ? plural(selected.size, "page") + " selected" : "Click pages to select them. Drag any page to move it."}</p>
              <div className="grid grid-cols-2 gap-2">
                {selectionTools.map(({ label, icon: Icon, run, danger }) => (
                  <Button key={label} variant="secondary" size="sm" disabled={!hasSelection} onClick={run} className={`h-9 justify-start ${danger ? "text-coral-300 hover:bg-coral-500/10" : ""}`}>
                    <Icon className="size-4" /> {label}
                  </Button>
                ))}
              </div>
              <Button variant="ghost" size="sm" className="mt-2 h-9 w-full" disabled={!hasSelection} onClick={saveSelected}>
                Save only the selected pages
              </Button>
            </PanelSection>
            <PanelSection title="Output">
              <NameField value={outName} onChange={setOutName} />
              <p className="mt-2 text-xs text-ink-500">Deleted pages aren&apos;t just hidden — they&apos;re not in the new file.</p>
            </PanelSection>
            <div className="p-5">{saveButton(false)}</div>
          </>
        }
        mobileBar={
          <div className="space-y-2.5 px-3 pt-2.5">
            <div className="thin-scroll -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" role="toolbar" aria-label="Selected pages">
              {selectionTools.map(({ label, icon: Icon, run, danger }) => (
                <button
                  key={label}
                  aria-label={label}
                  disabled={!hasSelection}
                  onClick={run}
                  className={`flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] disabled:opacity-30 ${danger ? "text-coral-300" : "text-ink-100"}`}
                >
                  <Icon className="size-[18px]" />
                </button>
              ))}
            </div>
            {hasSelection ? (
              <div className="flex gap-2">
                <Button variant="secondary" size="lg" className="h-12 flex-1 px-3" disabled={busy} onClick={saveSelected}>
                  Save {selected.size} selected
                </Button>
                <div className="flex-1">{saveButton(true)}</div>
              </div>
            ) : (
              saveButton(false)
            )}
          </div>
        }
      />
    </ToolWorkShell>
  );
}

function ToolbarButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-xl bg-white/[0.06] text-ink-100 hover:bg-white/10 disabled:opacity-30 sm:size-8 sm:rounded-lg"
    >
      {children}
    </button>
  );
}

function PageTile({
  pdf,
  page,
  position,
  selected,
  dimmed,
  onToggle,
  onRotate,
  onDelete,
}: {
  pdf: LoadedPdf;
  page: PlanPage;
  position: number;
  selected: boolean;
  dimmed: boolean;
  onToggle: () => void;
  onRotate: () => void;
  onDelete: () => void;
}) {
  const stop = (e: React.PointerEvent | React.TouchEvent | React.MouseEvent) => e.stopPropagation();
  const moved = page.source + 1 !== position;
  return (
    <div
      onClick={onToggle}
      className={`group relative cursor-pointer select-none rounded-2xl bg-ink-900 p-2 ring-inset transition-all ${
        selected ? "ring-2 ring-volt-400" : "ring-1 ring-white/[0.08] hover:ring-white/20"
      } ${dimmed ? "opacity-30" : ""}`}
    >
      <div className="relative flex justify-center rounded-xl bg-ink-950/70 py-2.5">
        <PdfThumb doc={pdf.pdfjs} pageNumber={page.source + 1} maxWidth={130} maxHeight={170} rotate={page.rotate} />
        <button
          aria-label={`${selected ? "Deselect" : "Select"} page ${position}`}
          aria-pressed={selected}
          onPointerDown={stop}
          onTouchStart={stop}
          onMouseDown={stop}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className={`absolute left-1 top-1 flex size-8 items-center justify-center rounded-full transition-colors sm:size-6 ${
            selected ? "bg-volt-400 text-ink-950 shadow-md shadow-black/40" : "bg-ink-950 text-transparent ring-1 ring-inset ring-white/40 group-hover:text-white/60"
          }`}
        >
          <Check className="size-4" strokeWidth={3} />
        </button>
        {/* Quick actions for mouse users; phones use the action bar. */}
        <div className="absolute right-1 top-1 hidden gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 [@media(hover:hover)]:flex" onPointerDown={stop} onMouseDown={stop}>
          <button
            aria-label={`Rotate page ${position}`}
            onClick={(e) => {
              e.stopPropagation();
              onRotate();
            }}
            className="flex size-7 items-center justify-center rounded-lg bg-ink-950/85 text-ink-100 hover:bg-ink-800"
          >
            <RotateCw className="size-3.5" />
          </button>
          <button
            aria-label={`Delete page ${position}`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="flex size-7 items-center justify-center rounded-lg bg-ink-950/85 text-ink-100 hover:bg-coral-500/20 hover:text-coral-300"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between px-1 text-xs">
        <span className="font-mono font-semibold text-white">{position}</span>
        <span className="truncate text-ink-500">
          {moved ? `was ${page.source + 1}` : ""}
          {page.rotate ? `${moved ? " · " : ""}${page.rotate}°` : ""}
        </span>
      </div>
    </div>
  );
}
