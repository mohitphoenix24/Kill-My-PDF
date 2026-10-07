"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  CircleCheck,
  Info,
  Lock,
  Minus,
  MousePointerClick,
  Move,
  PencilLine,
  Plus,
  RotateCcw,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button, IconButton, Kbd, Spinner } from "@/components/ui/Button";
import { type EditOperation, changedElements, changesOf } from "@/lib/editor/operations";
import type { DocumentModel, FontInfo, TextElement } from "@/lib/model/types";
import type { ElementExportReport } from "@/lib/pdf/export/exporter";

interface Props {
  model: DocumentModel;
  selected: TextElement | null;
  report: ElementExportReport | undefined;
  previewUpdating: boolean;
  /** Increments when the text field should take focus. */
  focusRequest: number;
  onEdit: (op: EditOperation) => void;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}

const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="border-b border-white/[0.06] px-5 py-4 last:border-b-0">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-zinc-400">{label}</div>
      {children}
    </div>
  );
}

const fieldClass =
  "w-full rounded-lg border-0 bg-white/[0.04] px-3 text-sm text-zinc-100 ring-1 ring-inset ring-white/10 transition placeholder:text-zinc-600 hover:ring-white/20 focus:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:cursor-not-allowed disabled:text-zinc-600 disabled:hover:ring-white/10";
const inputClass = `${fieldClass} h-10 sm:h-9`;

/** Number input that commits on Enter/blur, so typing doesn't create an undo step per keystroke. */
function NumberInput(props: { value: number; disabled?: boolean; label: string; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState<{ source: number; text: string } | null>(null);
  const text = draft && draft.source === props.value ? draft.text : String(round(props.value));
  const commit = () => {
    const v = Number.parseFloat(text);
    setDraft(null);
    if (Number.isFinite(v) && Math.abs(v - props.value) > 1e-9) props.onCommit(v);
  };
  return (
    <input
      type="number"
      inputMode="decimal"
      aria-label={props.label}
      value={text}
      disabled={props.disabled}
      onChange={(e) => setDraft({ source: props.value, text: e.target.value })}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      className={`${inputClass} tabular-nums`}
    />
  );
}

function fontBadge(font: FontInfo | undefined): string | undefined {
  if (!font) return undefined;
  if (font.standardFont) return "Standard font";
  if (!font.embedded) return "System font";
  return font.subset ? "Embedded subset" : "Embedded";
}

export function Inspector({ model, selected, report, previewUpdating, focusRequest, onEdit, onSelect, onClose }: Props) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (focusRequest > 0) {
      textRef.current?.focus();
      textRef.current?.select();
    }
  }, [focusRequest]);

  const header = (title: React.ReactNode, onDismiss: () => void, dismissLabel: string) => (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.06] bg-zinc-950/95 px-5 py-3 backdrop-blur">
      {title}
      <IconButton label={dismissLabel} onClick={onDismiss}>
        <X className="size-4" />
      </IconButton>
    </div>
  );

  if (!selected) {
    return (
      <div className="animate-fade-in">
        {header(<span className="text-sm font-semibold text-white">Document</span>, onClose, "Close panel")}
        <DocumentInspector model={model} onEdit={onEdit} onSelect={onSelect} />
      </div>
    );
  }

  const e = selected;
  const font = e.fontKey ? model.fonts[e.fontKey] : undefined;
  const editable = e.editability.allowed;
  const changes = changesOf(e);
  const origin = { x: e.matrix[4], y: e.matrix[5] };
  const size = e.style.fontSize ?? 0;
  const badge = fontBadge(font);

  return (
    <div className="animate-fade-in">
      {header(
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">Text</span>
          {editable ? (
            changes.any && (
              <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-400/25">
                Edited
              </span>
            )
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-zinc-400">
              <Lock className="size-3" /> Read-only
            </span>
          )}
        </div>,
        () => onSelect(null),
        "Deselect",
      )}

      <Section title="Content">
        <textarea
          ref={textRef}
          value={e.content}
          readOnly={!editable}
          onChange={(ev) => onEdit({ type: "setText", elementId: e.id, text: ev.target.value.replace(/\r?\n/g, " ") })}
          rows={3}
          aria-label="Text content"
          placeholder="(removed)"
          className={`${fieldClass} min-h-24 resize-none py-2.5 leading-relaxed read-only:text-zinc-500`}
        />
        {!editable && (
          <p className="mt-2.5 flex gap-2 rounded-lg bg-white/[0.03] px-3 py-2.5 text-xs leading-relaxed text-zinc-400 ring-1 ring-inset ring-white/[0.08]">
            <Info className="mt-px size-3.5 shrink-0 text-zinc-500" />
            {e.editability.reason}
          </p>
        )}
        {changes.text && (
          <p className="mt-2 truncate text-xs text-zinc-500">
            Originally <span className="text-zinc-300">“{e.source.original.content}”</span>
          </p>
        )}
      </Section>

      <Section title="Typography">
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2.5 ring-1 ring-inset ring-white/[0.08]">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-zinc-100" title={e.style.fontFamily}>
              {e.style.fontFamily ?? "Unknown font"}
            </p>
            <p className="text-xs text-zinc-500">
              {e.style.fontWeight ? (e.style.fontWeight >= 600 ? "Bold" : "Regular") : "Weight unknown"}
              {e.style.fontStyle === "italic" && " · Italic"}
            </p>
          </div>
          {badge && <span className="shrink-0 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">{badge}</span>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Size">
            <div className="flex h-10 items-center rounded-lg bg-white/[0.04] ring-1 ring-inset ring-white/10 sm:h-9">
              <button
                aria-label="Decrease size"
                disabled={!editable || size <= 1}
                onClick={() => onEdit({ type: "setStyle", elementId: e.id, style: { fontSize: Math.max(1, Math.round((size - 1) * 2) / 2) } })}
                className="flex h-full w-9 items-center justify-center rounded-l-lg text-zinc-400 hover:bg-white/[0.06] hover:text-white disabled:opacity-30"
              >
                <Minus className="size-3.5" />
              </button>
              <span className="flex-1 text-center text-sm tabular-nums text-zinc-100">{round(size, 1)}</span>
              <button
                aria-label="Increase size"
                disabled={!editable}
                onClick={() => onEdit({ type: "setStyle", elementId: e.id, style: { fontSize: Math.round((size + 1) * 2) / 2 } })}
                className="flex h-full w-9 items-center justify-center rounded-r-lg text-zinc-400 hover:bg-white/[0.06] hover:text-white disabled:opacity-30"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          </Field>
          <Field label="Colour">
            <label
              className={`flex h-10 items-center gap-2 rounded-lg bg-white/[0.04] px-2.5 ring-1 ring-inset ring-white/10 sm:h-9 ${
                editable ? "cursor-pointer hover:ring-white/20" : "cursor-not-allowed"
              }`}
            >
              <span className="relative size-5 shrink-0 rounded-md ring-1 ring-white/20" style={{ background: e.style.color ?? "#000" }}>
                <input
                  type="color"
                  aria-label="Text colour"
                  disabled={!editable}
                  value={e.style.color ?? "#000000"}
                  onChange={(ev) => onEdit({ type: "setStyle", elementId: e.id, style: { color: ev.target.value } })}
                  className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                />
              </span>
              <span className="font-mono text-xs uppercase text-zinc-400">{e.style.color ?? "unknown"}</span>
            </label>
          </Field>
        </div>
      </Section>

      <Section title="Position" aside={<span className="text-[11px] text-zinc-600">points</span>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="X">
            <NumberInput label="X position" value={origin.x} disabled={!editable} onCommit={(v) => onEdit({ type: "move", elementId: e.id, dx: v - origin.x, dy: 0 })} />
          </Field>
          <Field label="Y">
            <NumberInput label="Y position" value={origin.y} disabled={!editable} onCommit={(v) => onEdit({ type: "move", elementId: e.id, dx: 0, dy: v - origin.y })} />
          </Field>
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            ["W", round(e.bbox.width, 1)],
            ["H", round(e.bbox.height, 1)],
            ["Angle", `${round(e.rotation, 1)}°`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-white/[0.03] py-1.5 ring-1 ring-inset ring-white/[0.05]">
              <dt className="text-[10px] font-medium uppercase tracking-wide text-zinc-600">{k}</dt>
              <dd className="text-xs tabular-nums text-zinc-300">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>

      {changes.any && <ExportStatus report={report} updating={previewUpdating} />}

      {editable && (
        <div className="flex gap-2 px-5 py-4">
          <Button variant="secondary" size="sm" className="h-10 flex-1 sm:h-8" disabled={!changes.any} onClick={() => onEdit({ type: "reset", elementId: e.id })}>
            <RotateCcw className="size-3.5" /> Revert
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="h-10 flex-1 text-red-300 hover:bg-red-500/10 sm:h-8"
            disabled={e.content === ""}
            onClick={() => onEdit({ type: "setText", elementId: e.id, text: "" })}
          >
            <Trash2 className="size-3.5" /> Remove
          </Button>
        </div>
      )}

      <details className="group border-t border-white/[0.06] px-5 py-3.5">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-zinc-500 hover:text-zinc-300">
          Technical details
          <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <dl className="mt-3 space-y-1.5 text-xs">
          {[
            ["Page", e.pageNumber],
            ["Font resource", e.source.fontResource ? `/${e.source.fontResource}` : "—"],
            ["Font type", font ? `${font.subtype}${font.encoding ? ` · ${font.encoding}` : ""}` : "—"],
            ["Operators", e.source.runs.map((r) => r.operator).join(", ") || "—"],
            ["Letter spacing", e.style.letterSpacing !== undefined ? `${round(e.style.letterSpacing)} pt` : "—"],
            ["Word spacing", e.style.wordSpacing !== undefined ? `${round(e.style.wordSpacing)} pt` : "—"],
            ["Render mode", e.source.textState.renderMode],
          ].map(([k, v]) => (
            <div key={String(k)} className="flex justify-between gap-3">
              <dt className="text-zinc-500">{k}</dt>
              <dd className="truncate text-right text-zinc-300">{v}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}

function ExportStatus({ report, updating }: { report: ElementExportReport | undefined; updating: boolean }) {
  if (updating || !report) {
    return (
      <Section title="Output">
        <p className="flex items-center gap-2 text-xs text-zinc-400">
          <Spinner className="size-3.5 text-indigo-400" /> Checking how this edit will be saved…
        </p>
      </Section>
    );
  }
  const exact = report.strategy === "in-place" || report.strategy === "redraw-original";
  return (
    <Section title="Output">
      {report.strategy === "removed" ? (
        <p className="text-xs text-zinc-400">This text will be removed from the PDF.</p>
      ) : exact ? (
        <div className="flex gap-2.5 rounded-lg bg-emerald-400/[0.07] px-3 py-2.5 ring-1 ring-inset ring-emerald-400/20">
          <CircleCheck className="mt-px size-4 shrink-0 text-emerald-400" />
          <div className="text-xs leading-relaxed">
            <p className="font-medium text-emerald-200">Original font preserved</p>
            <p className="text-emerald-200/60">
              {report.strategy === "in-place"
                ? "Saved in place — position and styling stay exactly as they were."
                : `Redrawn with ${report.fontName} at the new position, size or colour.`}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex gap-2.5 rounded-lg bg-amber-400/[0.07] px-3 py-2.5 ring-1 ring-inset ring-amber-400/20">
          <TriangleAlert className="mt-px size-4 shrink-0 text-amber-400" />
          <div className="text-xs leading-relaxed">
            <p className="font-medium text-amber-200">Using a similar font: {report.fontName}</p>
            {report.notes.map((n) => (
              <p key={n} className="text-amber-200/60">
                {n}
              </p>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

function DocumentInspector({ model, onEdit, onSelect }: { model: DocumentModel; onEdit: (op: EditOperation) => void; onSelect: (id: string | null) => void }) {
  const changed = changedElements(model);
  const fonts = Object.values(model.fonts);
  const notices = model.pages.flatMap((p) => p.notices.map((n) => ({ page: p.pageNumber, text: n })));

  return (
    <>
      {model.editing.allowed && (
        <Section title="How to edit">
          <ul className="space-y-3 text-[13px] leading-relaxed text-zinc-400">
            <li className="flex gap-3">
              <MousePointerClick className="mt-0.5 size-4 shrink-0 text-indigo-400" />
              <span>
                <span className="font-medium text-zinc-200">Tap or click</span> any text to select it.{" "}
                <span className="font-medium text-zinc-200">Double-click</span> to type right on the page.
              </span>
            </li>
            <li className="flex gap-3">
              <Move className="mt-0.5 size-4 shrink-0 text-indigo-400" />
              <span>
                <span className="font-medium text-zinc-200">Drag</span> selected text to move it, or nudge with <Kbd>←</Kbd> <Kbd>→</Kbd>.
              </span>
            </li>
            <li className="flex gap-3">
              <PencilLine className="mt-0.5 size-4 shrink-0 text-indigo-400" />
              <span>Edits keep the original fonts. Download when you&apos;re done.</span>
            </li>
          </ul>
        </Section>
      )}

      <Section
        title="Changes"
        aside={
          changed.length > 0 ? (
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-zinc-300">{changed.length}</span>
          ) : undefined
        }
      >
        {changed.length === 0 ? (
          <p className="text-[13px] text-zinc-500">No changes yet.</p>
        ) : (
          <ul className="-mx-2 space-y-0.5">
            {changed.map((e) => (
              <li key={e.id} className="group flex items-center gap-1 rounded-lg hover:bg-white/[0.04]">
                <button className="min-w-0 flex-1 px-2 py-1.5 text-left" onClick={() => onSelect(e.id)}>
                  <p className="truncate text-[13px] text-zinc-100">{e.content || <span className="italic text-zinc-500">Removed</span>}</p>
                  <p className="truncate text-[11px] text-zinc-500">
                    was “{e.source.original.content}” · p.{e.pageNumber}
                  </p>
                </button>
                <span className="transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100">
                  <IconButton label="Revert" tooltipSide="top" onClick={() => onEdit({ type: "reset", elementId: e.id })}>
                    <RotateCcw className="size-3.5" />
                  </IconButton>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {notices.length > 0 && (
        <Section title="Notes">
          <ul className="space-y-2">
            {notices.map((n) => (
              <li key={`${n.page}-${n.text}`} className="flex gap-2 text-xs leading-relaxed text-zinc-400">
                <Info className="mt-px size-3.5 shrink-0 text-zinc-500" />
                <span>
                  {model.pageCount > 1 && <span className="font-medium text-zinc-300">Page {n.page}: </span>}
                  {n.text}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {fonts.length > 0 && (
        <details className="group px-5 py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 hover:text-zinc-300">
            Fonts in this document ({fonts.length})
            <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <ul className="mt-3 space-y-2">
            {fonts.map((f) => (
              <li key={f.key} className="flex items-center justify-between gap-2">
                <span className="truncate text-[13px] text-zinc-200">{f.displayName}</span>
                <span className="shrink-0 text-[11px] text-zinc-500">{fontBadge(f)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
