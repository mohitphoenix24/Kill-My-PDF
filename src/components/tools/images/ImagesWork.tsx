"use client";

import { ArrowLeft, ArrowRight, GripVertical, Plus, RotateCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Spinner } from "@/components/ui/Button";
import { splitAccepted } from "@/lib/browser/fileTypes";
import { userMessageOf } from "@/lib/pdf/errors";
import { formatBytes, plural, safePdfName } from "@/lib/pdf/tools/common";
import { type ImageRotation, inspectImage, prepareImage } from "@/lib/pdf/tools/imageDecode";
import {
  DEFAULT_IMAGE_OPTIONS,
  type ImagePdfOptions,
  type MarginOption,
  type OrientationOption,
  type PageSizeOption,
  type PreparedImage,
  buildImagesPdf,
} from "@/lib/pdf/tools/images";
import { ResultCard } from "../shared/ResultCard";
import { SortableGrid } from "../shared/SortableGrid";
import { ToolWorkShell } from "../shared/ToolWorkShell";
import { NameField, PanelSection, Segmented, WorkLayout } from "../shared/WorkLayout";
import { nextPaint } from "../shared/nextPaint";
import type { WorkProps } from "../types";
import { useWindowFileDrop } from "../useWindowFileDrop";

interface ImageItem {
  id: string;
  file: File;
  width: number;
  height: number;
  thumbnailUrl: string;
  rotate: ImageRotation;
}

const PAGE_SIZES: ReadonlyArray<{ value: PageSizeOption; label: string }> = [
  { value: "a4", label: "A4" },
  { value: "letter", label: "Letter" },
  { value: "auto", label: "Fit image" },
];
const ORIENTATIONS: ReadonlyArray<{ value: OrientationOption; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "portrait", label: "Portrait" },
  { value: "landscape", label: "Landscape" },
];
const MARGINS: ReadonlyArray<{ value: MarginOption; label: string }> = [
  { value: "none", label: "None" },
  { value: "small", label: "Small" },
  { value: "large", label: "Large" },
];

export default function ImagesWork({ files, toast, onExit }: WorkProps) {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [reading, setReading] = useState(0);
  const [options, setOptions] = useState<ImagePdfOptions>(DEFAULT_IMAGE_OPTIONS);
  const [outName, setOutName] = useState("images");
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ bytes: Uint8Array; name: string; pages: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const started = useRef(false);
  const itemsRef = useRef<ImageItem[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const addFiles = useCallback(
    async (list: File[]): Promise<{ added: number; lastError?: string }> => {
      const { accepted, rejected } = splitAccepted(list, "image");
      if (rejected.length > 0) toast({ tone: "info", title: `Skipped ${plural(rejected.length, "file")}`, description: "Only images can be added here." });
      let added = 0;
      let lastError: string | undefined;
      setReading((n) => n + accepted.length);
      for (const file of accepted) {
        try {
          const info = await inspectImage(file);
          setItems((prev) => [...prev, { id: crypto.randomUUID(), file, width: info.width, height: info.height, thumbnailUrl: info.thumbnailUrl, rotate: 0 }]);
          added++;
        } catch (error) {
          lastError = userMessageOf(error, `${file.name} couldn't be read as an image.`);
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
      if (added === 0) onExit(lastError ?? "None of those files could be read as images.");
    });
  }, [files, addFiles, onExit]);

  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.thumbnailUrl)), []);

  useWindowFileDrop((dropped) => void addFiles(dropped), !result);

  const remove = (id: string) =>
    setItems((prev) => {
      const gone = prev.find((i) => i.id === id);
      if (gone) URL.revokeObjectURL(gone.thumbnailUrl);
      return prev.filter((i) => i.id !== id);
    });
  const rotate = (id: string) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, rotate: (((i.rotate + 90) % 360) as ImageRotation) } : i)));
  const move = (id: string, delta: number) =>
    setItems((prev) => {
      const from = prev.findIndex((i) => i.id === id);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= prev.length) return prev;
      const next = prev.slice();
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });

  const create = async () => {
    setBusy({ done: 0, total: items.length });
    await nextPaint();
    try {
      const prepared: PreparedImage[] = [];
      for (const item of items) {
        prepared.push(await prepareImage(item.file, item.rotate));
        setBusy({ done: prepared.length, total: items.length });
        await new Promise((r) => setTimeout(r, 0));
      }
      const bytes = await buildImagesPdf(prepared, options);
      setResult({ bytes, name: safePdfName(outName, "images"), pages: prepared.length });
    } catch (error) {
      toast({ tone: "error", title: "Couldn't create the PDF", description: userMessageOf(error, "Something went wrong while creating the PDF.") });
    } finally {
      setBusy(null);
    }
  };

  if (result) {
    return (
      <ToolWorkShell slug="images-to-pdf" onBack={onExit}>
        <ResultCard
          title="Photos in. PDF out."
          subtitle={`${plural(result.pages, "image")} → 1 PDF`}
          file={{ name: result.name, bytes: result.bytes }}
          stats={[plural(result.pages, "page")]}
          next={["organize-pdf", "merge-pdf", "split-pdf"]}
          onTweak={() => setResult(null)}
          onStartOver={() => onExit()}
        />
      </ToolWorkShell>
    );
  }

  const ready = items.length > 0 && reading === 0 && !busy;
  const cta = (
    <Button variant="primary" size="lg" className="h-12 w-full" disabled={!ready} onClick={create}>
      {busy ? <Spinner /> : null}
      {busy ? `Creating… ${busy.done}/${busy.total}` : items.length === 0 ? "Add an image" : `Create PDF · ${plural(items.length, "page")}`}
    </Button>
  );
  const summary = (
    <p className="text-sm text-ink-300">
      <span className="font-semibold text-white">{plural(items.length, "image")}</span> · {formatBytes(items.reduce((n, i) => n + i.file.size, 0))}
    </p>
  );
  const sizeSettings = (
    <div className="space-y-4">
      <Segmented label="Page size" value={options.pageSize} options={PAGE_SIZES} onChange={(pageSize) => setOptions((o) => ({ ...o, pageSize }))} />
      {options.pageSize !== "auto" && (
        <Segmented label="Orientation" value={options.orientation} options={ORIENTATIONS} onChange={(orientation) => setOptions((o) => ({ ...o, orientation }))} />
      )}
      <Segmented label="Margin" value={options.margin} options={MARGINS} onChange={(margin) => setOptions((o) => ({ ...o, margin }))} />
    </div>
  );

  return (
    <ToolWorkShell slug="images-to-pdf" subtitle={reading > 0 ? "Reading your images…" : `${plural(items.length, "image")}`} onBack={onExit}>
      <input
        ref={input}
        type="file"
        hidden
        multiple
        accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif"
        aria-label="Add more images"
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
                <h2 className="font-display text-xl font-bold text-white">Your images</h2>
                <p className="text-sm text-ink-400">One page each, in this order. Drag to rearrange, or use the arrows.</p>
              </div>
              <Button variant="secondary" size="md" className="h-11 shrink-0 sm:h-9" onClick={() => input.current?.click()}>
                <Plus className="size-4" /> Add images
              </Button>
            </div>

            <SortableGrid
              label="Images"
              items={items}
              onReorder={setItems}
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4"
              renderItem={(item, { index, isDragging }) => (
                <ImageCard
                  item={item}
                  index={index}
                  last={index === items.length - 1}
                  dimmed={isDragging}
                  onRotate={() => rotate(item.id)}
                  onRemove={() => remove(item.id)}
                  onMove={(d) => move(item.id, d)}
                />
              )}
            />
            {reading > 0 && (
              <p className="mt-4 flex items-center gap-2 text-sm text-ink-400">
                <Spinner className="size-4 text-volt-400" /> Reading {plural(reading, "image")}…
              </p>
            )}

            <div className="mt-8 space-y-5 lg:hidden">
              <h3 className="font-display text-lg font-bold text-white">Page settings</h3>
              {sizeSettings}
              <NameField value={outName} onChange={setOutName} label="Name your PDF" />
            </div>
          </div>
        }
        sidebar={
          <>
            <PanelSection title="Pages">{sizeSettings}</PanelSection>
            <PanelSection title="Output">
              <NameField value={outName} onChange={setOutName} />
              <p className="mt-2 text-xs text-ink-500">JPG and PNG go in untouched, so there&apos;s no quality loss.</p>
            </PanelSection>
            <PanelSection title="Summary">{summary}</PanelSection>
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

/** The image, fitted inside a fixed box, with the user's rotation previewed. */
function RotatedPreview({ item, maxWidth, maxHeight }: { item: ImageItem; maxWidth: number; maxHeight: number }) {
  const turned = item.rotate % 180 !== 0;
  const scale = Math.min(maxWidth / (turned ? item.height : item.width), maxHeight / (turned ? item.width : item.height));
  const w = item.width * scale;
  const h = item.height * scale;
  return (
    <div className="flex items-center justify-center" style={{ width: maxWidth, height: maxHeight }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview; next/image can't optimise it */}
      <img
        src={item.thumbnailUrl}
        alt=""
        draggable={false}
        className="rounded-sm shadow-[0_6px_18px_-6px_rgb(0_0_0/0.7)] ring-1 ring-black/30 transition-transform duration-200"
        style={{ width: w, height: h, transform: `rotate(${item.rotate}deg)` }}
      />
    </div>
  );
}

function ImageCard({
  item,
  index,
  last,
  dimmed,
  onRotate,
  onRemove,
  onMove,
}: {
  item: ImageItem;
  index: number;
  last: boolean;
  dimmed: boolean;
  onRotate: () => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
}) {
  const stop = (e: React.PointerEvent | React.TouchEvent | React.MouseEvent) => e.stopPropagation();
  const btn =
    "flex size-11 items-center justify-center rounded-xl bg-white/[0.05] text-ink-200 hover:bg-white/10 disabled:opacity-25 sm:size-8 sm:rounded-lg";
  return (
    <div className={`relative rounded-2xl bg-ink-900 p-2.5 ring-1 ring-inset ring-white/[0.08] transition-opacity ${dimmed ? "opacity-30" : ""}`}>
      <div className="relative flex justify-center rounded-xl bg-ink-950/70 py-3">
        <RotatedPreview item={item} maxWidth={130} maxHeight={150} />
        <span className="absolute left-2 top-2 flex size-6 items-center justify-center rounded-md bg-volt-400 font-mono text-xs font-bold text-ink-950 shadow-md shadow-black/40">{index + 1}</span>
        <button
          aria-label={`Remove ${item.file.name}`}
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
        <p className="truncate text-sm font-medium text-white" title={item.file.name}>
          {item.file.name}
        </p>
        <p className="text-xs text-ink-400">
          {item.width}×{item.height} · {formatBytes(item.file.size)}
        </p>
      </div>
      <div className="mt-2 flex items-center justify-between" onPointerDown={stop} onTouchStart={stop} onMouseDown={stop}>
        <GripVertical className="ml-1 size-4 text-ink-600" aria-hidden />
        <div className="flex gap-1">
          <button aria-label={`Rotate ${item.file.name}`} onClick={onRotate} className={btn}>
            <RotateCw className="size-4" />
          </button>
          <button aria-label="Move earlier" disabled={index === 0} onClick={() => onMove(-1)} className={btn}>
            <ArrowLeft className="size-4" />
          </button>
          <button aria-label="Move later" disabled={last} onClick={() => onMove(1)} className={btn}>
            <ArrowRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
