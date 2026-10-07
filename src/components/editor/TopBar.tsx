"use client";

import { Download, FolderOpen, Keyboard, MousePointer2, PanelRight, Redo2, TextCursor, Undo2 } from "lucide-react";
import type { Tool } from "@/components/viewer/PageView";
import { Button, IconButton, Spinner } from "@/components/ui/Button";
import { APP_NAME, LogoMark } from "@/components/ui/Logo";

interface Props {
  fileName: string;
  pageCount: number;
  editCount: number;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canSave: boolean;
  saving: boolean;
  tool: Tool;
  inspectorOpen: boolean;
  modKey: string;
  onHome: () => void;
  onOpen: () => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToolChange: (tool: Tool) => void;
  onShortcuts: () => void;
  onToggleInspector: () => void;
}

const TOOLS = [
  { tool: "edit", label: "Edit", icon: MousePointer2 },
  { tool: "select", label: "Select text", icon: TextCursor },
] as const;

export function TopBar(p: Props) {
  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.07] bg-zinc-950/90 px-2 backdrop-blur sm:px-3">
      {/* Home + file */}
      <div className="flex min-w-0 items-center gap-1 sm:gap-2">
        <button
          onClick={p.onHome}
          aria-label={`${APP_NAME} — back to home`}
          title="Back to home"
          className="flex shrink-0 items-center gap-2 rounded-lg p-1.5 outline-none transition-colors hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-indigo-400"
        >
          <LogoMark className="size-7" />
          <span className="hidden text-sm font-semibold tracking-tight text-white xl:inline">{APP_NAME}</span>
        </button>
        <div className="mx-1 hidden h-6 w-px bg-white/10 sm:block" />
        <div className="min-w-0 px-1">
          <p className="truncate text-sm font-medium leading-tight text-zinc-100" title={p.fileName}>
            {p.fileName}
          </p>
          <p className="truncate text-[11px] leading-tight text-zinc-500">
            {p.pageCount} page{p.pageCount === 1 ? "" : "s"}
            {p.editCount > 0 && (
              <>
                {" · "}
                <span className={p.dirty ? "text-amber-400" : "text-emerald-400"}>
                  {p.editCount} edit{p.editCount === 1 ? "" : "s"}
                  <span className="hidden sm:inline">{p.dirty ? " · not downloaded" : " · downloaded"}</span>
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Mode switch (centred on wide screens) */}
      <div
        role="radiogroup"
        aria-label="Mode"
        className="absolute left-1/2 hidden -translate-x-1/2 items-center rounded-lg bg-white/[0.05] p-0.5 ring-1 ring-inset ring-white/[0.06] md:flex"
      >
        {TOOLS.map(({ tool, label, icon: Icon }) => (
          <button
            key={tool}
            role="radio"
            aria-checked={p.tool === tool}
            onClick={() => p.onToolChange(tool)}
            className={`flex h-7 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-all ${
              p.tool === tool ? "bg-white/[0.12] text-white shadow-sm" : "text-zinc-400 hover:text-zinc-100"
            }`}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
        <IconButton label="Undo" shortcut={`${p.modKey}Z`} onClick={p.onUndo} disabled={!p.canUndo}>
          <Undo2 className="size-4" />
        </IconButton>
        <IconButton label="Redo" shortcut={`${p.modKey}⇧Z`} onClick={p.onRedo} disabled={!p.canRedo}>
          <Redo2 className="size-4" />
        </IconButton>
        {/* Compact mode toggle on small screens */}
        <span className="md:hidden">
          <IconButton
            label={p.tool === "edit" ? "Switch to text selection" : "Switch to editing"}
            onClick={() => p.onToolChange(p.tool === "edit" ? "select" : "edit")}
            active={p.tool === "select"}
          >
            <TextCursor className="size-4" />
          </IconButton>
        </span>
        <div className="mx-1 hidden h-5 w-px bg-white/10 sm:block" />
        <span className="hidden lg:inline-flex">
          <IconButton label="Keyboard shortcuts" shortcut="?" onClick={p.onShortcuts}>
            <Keyboard className="size-4" />
          </IconButton>
        </span>
        <IconButton label={p.inspectorOpen ? "Hide properties" : "Show properties"} onClick={p.onToggleInspector} active={p.inspectorOpen}>
          <PanelRight className="size-4" />
        </IconButton>
        <span className="hidden sm:inline-flex">
          <Button variant="ghost" size="sm" onClick={p.onOpen}>
            <FolderOpen className="size-4" /> Open
          </Button>
        </span>
        <Button
          variant="primary"
          size="sm"
          onClick={p.onSave}
          disabled={!p.canSave || p.saving}
          aria-label="Download"
          title={p.canSave ? undefined : "Make an edit to enable download"}
          className="ml-1 w-9 px-0 sm:w-auto sm:px-3"
        >
          {p.saving ? <Spinner className="size-4" /> : <Download className="size-4" />}
          <span className="hidden sm:inline">{p.saving ? "Preparing…" : "Download"}</span>
        </Button>
      </div>
    </header>
  );
}
