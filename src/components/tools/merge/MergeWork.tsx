"use client";

import { ArrowLeft, ArrowRight, GripVertical, Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Spinner } from "@/components/ui/Button";
import { splitAccepted } from "@/lib/browser/fileTypes";
import { userMessageOf } from "@/lib/pdf/errors";
import { formatBytes, plural, safePdfName } from "@/lib/pdf/tools/common";
import { mergePdfs } from "@/lib/pdf/tools/merge";
import { type LoadedPdf, disposePdf, loadPdfFile } from "../shared/pdfSource";
import { PdfThumb } from "../shared/PdfThumb";
import { ResultCard } from "../shared/ResultCard";
import { SortableGrid } from "../shared/SortableGrid";
import { ToolWorkShell } from "../shared/ToolWorkShell";
import { NameField, PanelSection, WorkLayout } from "../shared/WorkLayout";
import { nextPaint } from "../shared/nextPaint";
import type { WorkProps } from "../types";
import { useWindowFileDrop } from "../useWindowFileDrop";

interface Item {
  id: string;
  pdf: LoadedPdf;
}

export default function MergeWork({ files, toast, onExit }: WorkProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [reading, setReading] = useState(0);
  const [outName, setOutName] = useState("merged");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ bytes: Uint8Array; name: string; pages: number; count: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const started = useRef(false);
  const itemsRef = useRef<Item[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const addFiles = useCallback(
    async (list: File[]): Promise<{ added: number; lastError?: string }> => {
      const { accepted, rejected } = splitAccepted(list, "pdf");
      if (rejected.length > 0) {
        toast({ tone: "info", title: `Skipped ${plural(rejected.length, "file")}`, description: "Only PDFs can be merged here." });
      }
      let added = 0;
      let lastError: string | undefined;
      setReading((n) => n + accepted.length);
      for (const file of accepted) {
        try {
          const pdf = await loadPdfFile(file);
          setItems((prev) => [...prev, { id: pdf.id, pdf }]);
          added++;
        } catch (error) {
          lastError = userMessageOf(error, `${file.name} couldn't be opened.`);
          toast({ tone: "error", title: `Couldn't add ${file.name}`, description: lastError });
        } finally {
          setReading((n) => n - 1);
        }
      }
      return { added, lastError };
    },
    [toast],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void addFiles(files).then(({ added, lastError }) => {
      if (added === 0) onExit(lastError ?? "None of those files could be opened.");
    });
  }, [files, addFiles, onExit]);

  useEffect(() => () => itemsRef.current.forEach((i) => disposePdf(i.pdf)), []);

  useWindowFileDrop((dropped) => void addFiles(dropped), !result);

  const remove = (id: string) => {
    setItems((prev) => {
      const gone = prev.find((i) => i.id === id);
      if (gone) disposePdf(gone.pdf);
      return prev.filter((i) => i.id !== id);
    });
  };
  const move = (id: string, delta: number) =>
    setItems((prev) => {
      const from = prev.findIndex((i) => i.id === id);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= prev.length) return prev;
      const next = prev.slice();
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });

  const totals = useMemo(
    () => ({ pages: items.reduce((n, i) => n + i.pdf.pageCount, 0), size: items.reduce((n, i) => n + i.pdf.size, 0) }),
    [items],
  );

  const merge = async () => {
    setBusy(true);
    await nextPaint();
    try {
      const bytes = await mergePdfs(items.map((i) => ({ doc: i.pdf.doc })));
      setResult({ bytes, name: safePdfName(outName, "merged"), pages: totals.pages, count: items.length });
    } catch (error) {
      toast({ tone: "error", title: "Couldn't merge", description: userMessageOf(error, "Something went wrong while merging.") });
    } finally {
      setBusy(false);
    }
  };

  const canMerge = items.length >= 1 && reading === 0 && !busy;
  const mergeLabel = items.length < 2 ? "Add another PDF to merge" : `Merge ${items.length} PDFs`;

  if (result) {
    return (
      <ToolWorkShell slug="merge-pdf" onBack={onExit}>
        <ResultCard
          title="Boom. Merged."
          subtitle={`${plural(result.count, "file")} → 1 PDF`}
          file={{ name: result.name, bytes: result.bytes }}
          stats={[plural(result.pages, "page")]}
          next={["organize-pdf", "edit-pdf", "split-pdf"]}
          onTweak={() => setResult(null)}
          onStartOver={() => onExit()}
        />
      </ToolWorkShell>
    );
  }

  const summary = (
    <p className="text-sm text-ink-300">
      <span className="font-semibold text-white">{plural(items.length, "file")}</span> · {plural(totals.pages, "page")} · {formatBytes(totals.size)}
    </p>
  );
  const cta = (
    <Button variant="primary" size="lg" className="h-12 w-full" disabled={!canMerge || items.length < 2} onClick={merge}>
      {busy ? <Spinner /> : null}
      {busy ? "Merging…" : mergeLabel}
    </Button>
  );

  return (
    <ToolWorkShell slug="merge-pdf" subtitle={reading > 0 ? "Reading your files…" : `${plural(items.length, "file")} · ${plural(totals.pages, "page")}`} onBack={onExit}>
      <input
        ref={input}
        type="file"
        hidden
        multiple
        accept="application/pdf,.pdf"
        aria-label="Add more PDFs"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (picked.length > 0) void addFiles(picked);
        }}
      />
      <WorkLayout
        main={
          <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold text-white">Your files</h2>
                <p className="text-sm text-ink-400">Drag cards, or use the arrows, to set the order. They&apos;re merged top-left to bottom-right.</p>
              </div>
              <Button variant="secondary" size="md" className="h-11 shrink-0 sm:h-9" onClick={() => input.current?.click()}>
                <Plus className="size-4" /> Add PDFs
              </Button>
            </div>

            <SortableGrid
              label="Files to merge"
              items={items}
              onReorder={setItems}
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4"
              renderItem={(item, { index, isDragging }) => (
                <FileCard
                  item={item}
                  index={index}
                  last={index === items.length - 1}
                  dimmed={isDragging}
                  onRemove={() => remove(item.id)}
                  onMove={(d) => move(item.id, d)}
                />
              )}
            />
            {reading > 0 && (
              <p className="mt-4 flex items-center gap-2 text-sm text-ink-400">
                <Spinner className="size-4 text-volt-400" /> Reading {plural(reading, "file")}…
              </p>
            )}

            <div className="mt-8 lg:hidden">
              <NameField value={outName} onChange={setOutName} label="Name your merged file" />
            </div>
          </div>
        }
        sidebar={
          <>
            <PanelSection title="Summary">
              {summary}
              <p className="mt-1 text-xs text-ink-500">Everything stays in the order shown.</p>
            </PanelSection>
            <PanelSection title="Output">
              <NameField value={outName} onChange={setOutName} />
            </PanelSection>
            <div className="p-5">{cta}</div>
          </>
        }
        mobileBar={
          <div className="space-y-2.5 px-4 pt-3">
            {summary}
            {cta}
          </div>
        }
      />
    </ToolWorkShell>
  );
}

function FileCard({
  item,
  index,
  last,
  dimmed,
  onRemove,
  onMove,
}: {
  item: Item;
  index: number;
  last: boolean;
  dimmed: boolean;
  onRemove: () => void;
  onMove: (delta: number) => void;
}) {
  const stop = (e: React.PointerEvent | React.TouchEvent | React.MouseEvent) => e.stopPropagation();
  return (
    <div className={`relative rounded-2xl bg-ink-900 p-2.5 ring-1 ring-inset ring-white/[0.08] transition-opacity ${dimmed ? "opacity-30" : ""}`}>
      <div className="relative flex justify-center rounded-xl bg-ink-950/70 py-3">
        <PdfThumb doc={item.pdf.pdfjs} pageNumber={1} maxWidth={130} maxHeight={170} />
        <span className="absolute left-2 top-2 flex size-6 items-center justify-center rounded-md bg-volt-400 font-mono text-xs font-bold text-ink-950 shadow-md shadow-black/40">{index + 1}</span>
        <button
          aria-label={`Remove ${item.pdf.name}`}
          onPointerDown={stop}
          onTouchStart={stop}
          onMouseDown={stop}
          onClick={onRemove}
          className="absolute right-1 top-1 flex size-10 items-center justify-center rounded-xl bg-ink-950/90 text-ink-100 ring-1 ring-inset ring-white/10 hover:bg-coral-500 hover:text-white sm:right-1.5 sm:top-1.5 sm:size-7 sm:rounded-lg"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-2.5 px-1">
        <p className="truncate text-sm font-medium text-white" title={item.pdf.name}>
          {item.pdf.name}
        </p>
        <p className="text-xs text-ink-400">
          {plural(item.pdf.pageCount, "page")} · {formatBytes(item.pdf.size)}
        </p>
      </div>
      <div className="mt-2 flex items-center justify-between" onPointerDown={stop} onTouchStart={stop} onMouseDown={stop}>
        <GripVertical className="ml-1 size-4 text-ink-600" aria-hidden />
        <div className="flex gap-1">
          <button
            aria-label="Move earlier"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            className="flex size-11 items-center justify-center rounded-xl bg-white/[0.05] text-ink-200 hover:bg-white/10 disabled:opacity-25 sm:size-8 sm:rounded-lg"
          >
            <ArrowLeft className="size-4" />
          </button>
          <button
            aria-label="Move later"
            disabled={last}
            onClick={() => onMove(1)}
            className="flex size-11 items-center justify-center rounded-xl bg-white/[0.05] text-ink-200 hover:bg-white/10 disabled:opacity-25 sm:size-8 sm:rounded-lg"
          >
            <ArrowRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
