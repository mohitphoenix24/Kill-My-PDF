"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, CircleCheck, Maximize2, Minus, Plus } from "lucide-react";
import { IconButton, Spinner } from "@/components/ui/Button";

interface Props {
  currentPage: number;
  pageCount: number;
  scale: number;
  fitWidth: boolean;
  previewStatus: "idle" | "updating" | "ready" | "error";
  analysing: boolean;
  modKey: string;
  onGoToPage: (page: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth: () => void;
}

/** Floating control dock at the bottom of the canvas: pages, zoom and sync status. */
export function ViewerDock(p: Props) {
  // A typed page number belongs to the page it was typed on; it resets when the page changes.
  const [draftState, setDraftState] = useState<{ page: number; text: string } | null>(null);
  const draft = draftState && draftState.page === p.currentPage ? draftState.text : String(p.currentPage);
  const commit = () => {
    const n = Number.parseInt(draft, 10);
    setDraftState(null);
    if (Number.isFinite(n) && n >= 1 && n <= p.pageCount && n !== p.currentPage) p.onGoToPage(n);
  };
  const busy = p.previewStatus === "updating" || p.analysing;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-10 flex justify-center px-3">
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-2xl bg-zinc-900/90 p-1 shadow-2xl shadow-black/50 ring-1 ring-white/10 backdrop-blur-md">
        {p.pageCount > 1 && (
          <>
            <IconButton label="Previous page" tooltipSide="top" onClick={() => p.onGoToPage(p.currentPage - 1)} disabled={p.currentPage <= 1}>
              <ChevronLeft className="size-4" />
            </IconButton>
            <div className="flex items-center gap-1 px-0.5 text-[13px] text-zinc-500">
              <input
                aria-label="Page number"
                inputMode="numeric"
                value={draft}
                onChange={(e) => setDraftState({ page: p.currentPage, text: e.target.value })}
                onBlur={commit}
                onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur(), commit())}
                className="h-7 w-9 rounded-md bg-white/[0.06] text-center text-[13px] font-medium tabular-nums text-white outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <span className="tabular-nums">/ {p.pageCount}</span>
            </div>
            <IconButton label="Next page" tooltipSide="top" onClick={() => p.onGoToPage(p.currentPage + 1)} disabled={p.currentPage >= p.pageCount}>
              <ChevronRight className="size-4" />
            </IconButton>
            <div className="mx-1 h-5 w-px bg-white/10" />
          </>
        )}
        <IconButton label="Zoom out" shortcut={`${p.modKey}−`} tooltipSide="top" onClick={p.onZoomOut}>
          <Minus className="size-4" />
        </IconButton>
        <span className="w-11 text-center text-[13px] font-medium tabular-nums text-zinc-200">{Math.round(p.scale * 100)}%</span>
        <IconButton label="Zoom in" shortcut={`${p.modKey}+`} tooltipSide="top" onClick={p.onZoomIn}>
          <Plus className="size-4" />
        </IconButton>
        <IconButton label="Fit width" tooltipSide="top" onClick={p.onFitWidth} active={p.fitWidth}>
          <Maximize2 className="size-3.5" />
        </IconButton>
        {(busy || p.previewStatus === "ready") && (
          <>
            <div className="mx-1 h-5 w-px bg-white/10" />
            <span className="flex items-center gap-1.5 px-2 text-xs text-zinc-400" aria-live="polite">
              {busy ? <Spinner className="size-3.5 text-indigo-400" /> : <CircleCheck className="size-3.5 text-emerald-400" />}
              <span className="hidden sm:inline">{p.analysing ? "Analysing…" : busy ? "Updating preview" : "Preview synced"}</span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
