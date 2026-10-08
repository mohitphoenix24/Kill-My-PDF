"use client";

import { Download, FileArchive, Layers, ListOrdered, Scissors } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Spinner } from "@/components/ui/Button";
import { downloadBytes } from "@/lib/browser/files";
import { userMessageOf } from "@/lib/pdf/errors";
import { baseName, formatBytes, plural, safePdfName } from "@/lib/pdf/tools/common";
import { type PageRange, chunkRanges, describeRange, parsePageRanges, rangeIndices } from "@/lib/pdf/tools/ranges";
import { extractPages } from "@/lib/pdf/tools/split";
import { zipFiles } from "@/lib/pdf/tools/zip";
import { type LoadedPdf, disposePdf, loadPdfFile } from "../shared/pdfSource";
import { PdfThumb } from "../shared/PdfThumb";
import { ResultCard } from "../shared/ResultCard";
import { ToolWorkShell } from "../shared/ToolWorkShell";
import { PanelSection, WorkLayout } from "../shared/WorkLayout";
import type { WorkProps } from "../types";

type Mode = "every" | "ranges" | "each";

interface Part {
  /** "1–3" */
  label: string;
  indices: number[];
  fileName: string;
}

interface BuiltPart extends Part {
  bytes: Uint8Array;
}

const MODES: Array<{ mode: Mode; title: string; text: string; icon: typeof Scissors }> = [
  { mode: "every", title: "Every N pages", text: "Equal chunks, like every 5 pages.", icon: Layers },
  { mode: "ranges", title: "Custom ranges", text: "Pick exactly which pages, like 1-3, 5, 8-.", icon: ListOrdered },
  { mode: "each", title: "Every page", text: "One PDF per page, in a .zip.", icon: Scissors },
];

const PREVIEW_LIMIT = 40;

export default function SplitWork({ files, toast, onExit }: WorkProps) {
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [mode, setMode] = useState<Mode>("every");
  const [every, setEvery] = useState("2");
  const [rangesText, setRangesText] = useState("");
  const [combine, setCombine] = useState(false);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [built, setBuilt] = useState<BuiltPart[] | null>(null);
  const started = useRef(false);
  const pdfRef = useRef<LoadedPdf | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    loadPdfFile(files[0])
      .then((loaded) => {
        pdfRef.current = loaded;
        setPdf(loaded);
      })
      .catch((error) => onExit(userMessageOf(error, "That PDF couldn't be opened.")));
  }, [files, onExit]);
  useEffect(() => () => void (pdfRef.current && disposePdf(pdfRef.current)), []);

  const base = pdf ? baseName(pdf.name) : "document";

  // What the current settings would produce, worked out live so the preview is always honest.
  const plan = useMemo((): { parts: Part[]; error?: string } => {
    if (!pdf) return { parts: [] };
    const pageCount = pdf.pageCount;
    const toParts = (ranges: PageRange[], nameFor: (r: PageRange, i: number) => string): Part[] =>
      ranges.map((r, i) => ({ label: describeRange(r), indices: rangeIndices(r), fileName: nameFor(r, i) }));

    if (mode === "each") {
      return { parts: toParts(chunkRanges(pageCount, 1), (r) => `${base}-page-${r.start}.pdf`) };
    }
    if (mode === "every") {
      const n = Number.parseInt(every, 10);
      if (!Number.isFinite(n) || n < 1) return { parts: [], error: "Type how many pages each piece should have." };
      return { parts: toParts(chunkRanges(pageCount, n), (r, i) => `${base}-part-${i + 1}.pdf`) };
    }
    const parsed = parsePageRanges(rangesText, pageCount);
    if (!parsed.ok) return { parts: [], error: rangesText.trim() ? parsed.error : undefined };
    if (combine) {
      const indices = parsed.ranges.flatMap(rangeIndices);
      return { parts: [{ label: parsed.ranges.map(describeRange).join(", "), indices, fileName: `${base}-selected-pages.pdf` }] };
    }
    return { parts: toParts(parsed.ranges, (r) => `${base}-pages-${describeRange(r).replace("–", "-")}.pdf`) };
  }, [pdf, mode, every, rangesText, combine, base]);

  const split = async () => {
    if (!pdf || plan.parts.length === 0) return;
    setBusy({ done: 0, total: plan.parts.length });
    await new Promise((r) => setTimeout(r, 0));
    try {
      const out: BuiltPart[] = [];
      for (const part of plan.parts) {
        out.push({ ...part, bytes: await extractPages(pdf.doc, part.indices) });
        if (out.length % 4 === 0 || out.length === plan.parts.length) {
          setBusy({ done: out.length, total: plan.parts.length });
          await new Promise((r) => setTimeout(r, 0)); // let the progress paint on big PDFs
        }
      }
      setBuilt(out);
    } catch (error) {
      toast({ tone: "error", title: "Couldn't split", description: userMessageOf(error, "Something went wrong while splitting.") });
    } finally {
      setBusy(null);
    }
  };

  if (!pdf) {
    return (
      <ToolWorkShell slug="split-pdf" subtitle="Reading your PDF…" onBack={onExit}>
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="size-6 text-volt-400" />
        </div>
      </ToolWorkShell>
    );
  }

  if (built) {
    return <SplitResult parts={built} base={base} onTweak={() => setBuilt(null)} onStartOver={() => onExit()} />;
  }

  const count = plan.parts.length;
  const ready = count > 0 && !busy;
  const ctaLabel = busy ? `Slicing… ${busy.done}/${busy.total}` : count === 0 ? "Choose how to split" : count === 1 ? "Extract these pages" : `Split into ${count} files`;
  const cta = (
    <Button variant="primary" size="lg" className="h-12 w-full" disabled={!ready} onClick={split}>
      {busy ? <Spinner /> : <Scissors className="size-[18px]" />}
      {ctaLabel}
    </Button>
  );
  const summary = (
    <p className="text-sm text-ink-300">
      <span className="font-semibold text-white">{count > 0 ? plural(count, "file") : "No files yet"}</span>
      {count > 0 && <> from {plural(pdf.pageCount, "page")}</>}
    </p>
  );

  return (
    <ToolWorkShell slug="split-pdf" subtitle={`${pdf.name} · ${plural(pdf.pageCount, "page")}`} onBack={onExit}>
      <WorkLayout
        main={
          <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
            <div className="flex items-center gap-4 rounded-2xl bg-ink-900 p-3 ring-1 ring-inset ring-white/[0.08]">
              <PdfThumb doc={pdf.pdfjs} pageNumber={1} maxWidth={64} maxHeight={84} />
              <div className="min-w-0">
                <p className="truncate font-medium text-white" title={pdf.name}>
                  {pdf.name}
                </p>
                <p className="text-sm text-ink-400">
                  {plural(pdf.pageCount, "page")} · {formatBytes(pdf.size)}
                </p>
              </div>
            </div>

            <fieldset>
              <legend className="mb-3 font-display text-lg font-bold text-white">How do you want to slice it?</legend>
              <div className="grid gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label="Split mode">
                {MODES.map(({ mode: m, title, text, icon: Icon }) => (
                  <button
                    key={m}
                    role="radio"
                    aria-checked={mode === m}
                    onClick={() => setMode(m)}
                    className={`rounded-2xl p-4 text-left transition-colors ${
                      mode === m ? "bg-volt-400/10 ring-2 ring-volt-400" : "bg-ink-900 ring-1 ring-inset ring-white/[0.08] hover:bg-ink-850"
                    }`}
                  >
                    <Icon className={`size-5 ${mode === m ? "text-volt-400" : "text-ink-400"}`} />
                    <p className="mt-3 text-sm font-semibold text-white">{title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-400">{text}</p>
                  </button>
                ))}
              </div>
            </fieldset>

            {mode === "every" && (
              <label className="flex items-center gap-3 rounded-2xl bg-ink-900 p-4 ring-1 ring-inset ring-white/[0.08]">
                <span className="text-sm text-ink-200">One file for every</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={pdf.pageCount}
                  value={every}
                  onChange={(e) => setEvery(e.target.value)}
                  aria-label="Pages per file"
                  className="h-11 w-20 rounded-xl bg-ink-850 px-3 text-center text-base font-semibold text-white outline-none ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-volt-400"
                />
                <span className="text-sm text-ink-200">pages</span>
              </label>
            )}

            {mode === "ranges" && (
              <div className="rounded-2xl bg-ink-900 p-4 ring-1 ring-inset ring-white/[0.08]">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-ink-400">Pages to pull out</span>
                  <input
                    value={rangesText}
                    onChange={(e) => setRangesText(e.target.value)}
                    placeholder="1-3, 5, 8-"
                    spellCheck={false}
                    autoCapitalize="off"
                    inputMode="text"
                    aria-invalid={!!plan.error}
                    aria-describedby="range-help"
                    className="h-12 w-full rounded-xl bg-ink-850 px-4 font-mono text-base text-white outline-none ring-1 ring-inset ring-white/10 placeholder:text-ink-600 focus:ring-2 focus:ring-volt-400"
                  />
                </label>
                <p id="range-help" className={`mt-2 text-xs ${plan.error ? "text-coral-300" : "text-ink-500"}`}>
                  {plan.error ?? `This PDF has ${plural(pdf.pageCount, "page")}. “8-” means page 8 to the end.`}
                </p>
                <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-sm text-ink-200">
                  <input type="checkbox" checked={combine} onChange={(e) => setCombine(e.target.checked)} className="size-5 accent-volt-400" />
                  Put all of these pages in one PDF
                </label>
              </div>
            )}

            <section aria-live="polite">
              <h2 className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500">What you&apos;ll get</h2>
              {count === 0 ? (
                <p className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-ink-500">Your pieces will show up here.</p>
              ) : (
                <ol className="grid gap-2 sm:grid-cols-2">
                  {plan.parts.slice(0, PREVIEW_LIMIT).map((part, i) => (
                    <li key={part.fileName + i} className="flex items-center gap-3 rounded-xl bg-ink-900 px-3.5 py-2.5 ring-1 ring-inset ring-white/[0.07]">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-volt-400/10 font-mono text-xs font-bold text-volt-300">{i + 1}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-white">{part.fileName}</span>
                        <span className="block text-xs text-ink-400">
                          page{part.indices.length === 1 ? "" : "s"} {part.label} · {plural(part.indices.length, "page")}
                        </span>
                      </span>
                    </li>
                  ))}
                  {count > PREVIEW_LIMIT && <li className="px-3.5 py-2.5 text-sm text-ink-500">…and {count - PREVIEW_LIMIT} more</li>}
                </ol>
              )}
            </section>
          </div>
        }
        sidebar={
          <>
            <PanelSection title="Summary">
              {summary}
              <p className="mt-1 text-xs text-ink-500">{count > 1 ? "You'll get a .zip, and each piece can be downloaded on its own." : "Your original file isn't touched."}</p>
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

function SplitResult({ parts, base, onTweak, onStartOver }: { parts: BuiltPart[]; base: string; onTweak: () => void; onStartOver: () => void }) {
  const zip = useMemo(() => (parts.length > 1 ? zipFiles(parts.map((p) => ({ name: p.fileName, bytes: p.bytes }))) : null), [parts]);

  if (parts.length === 1) {
    const only = parts[0];
    return (
      <ToolWorkShell slug="split-pdf" onBack={onStartOver}>
        <ResultCard
          title="Sliced."
          subtitle={`Pages ${only.label}, on their own`}
          file={{ name: safePdfName(only.fileName), bytes: only.bytes }}
          stats={[plural(only.indices.length, "page")]}
          next={["organize-pdf", "edit-pdf", "merge-pdf"]}
          onTweak={onTweak}
          onStartOver={onStartOver}
        />
      </ToolWorkShell>
    );
  }

  const zipName = `${base}-split.zip`;
  return (
    <ToolWorkShell slug="split-pdf" onBack={onStartOver}>
      <div className="thin-scroll flex-1 overflow-y-auto px-4 py-10 sm:py-14">
        <div className="animate-rise mx-auto w-full max-w-2xl">
          <div className="text-center">
            <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-volt-400 text-ink-950 shadow-[0_16px_50px_-12px_rgb(198_241_53/0.7)]">
              <Scissors className="size-7" strokeWidth={2.5} />
            </div>
            <h2 className="mt-6 font-display text-4xl font-extrabold tracking-tight text-white">Sliced.</h2>
            <p className="mt-2 text-ink-400">{plural(parts.length, "file")}, ready to go.</p>
          </div>

          {zip && (
            <Button variant="primary" size="lg" className="mt-8 h-12 w-full" onClick={() => downloadBytes(zip, zipName, "application/zip")}>
              <FileArchive className="size-[18px]" /> Download all (.zip · {formatBytes(zip.length)})
            </Button>
          )}

          <ul className="mt-5 divide-y divide-white/[0.06] overflow-hidden rounded-2xl bg-ink-900 ring-1 ring-inset ring-white/[0.08]">
            {parts.map((part) => (
              <li key={part.fileName} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{part.fileName}</p>
                  <p className="text-xs text-ink-400">
                    {plural(part.indices.length, "page")} · {formatBytes(part.bytes.length)}
                  </p>
                </div>
                <button
                  aria-label={`Download ${part.fileName}`}
                  onClick={() => downloadBytes(part.bytes, part.fileName)}
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-ink-100 hover:bg-volt-400 hover:text-ink-950 sm:size-9"
                >
                  <Download className="size-4" />
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex gap-2">
            <Button variant="secondary" className="h-11 flex-1" onClick={onTweak}>
              Tweak it
            </Button>
            <Button variant="secondary" className="h-11 flex-1" onClick={onStartOver}>
              Start over
            </Button>
          </div>
        </div>
      </div>
    </ToolWorkShell>
  );
}
