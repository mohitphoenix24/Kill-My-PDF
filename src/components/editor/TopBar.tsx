"use client";

import { Check, Download, FolderOpen, Keyboard, MoreVertical, MousePointer2, PanelRight, Redo2, TextCursor, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { Tool } from "@/components/viewer/PageView";
import { Button, IconButton, Spinner } from "@/components/ui/Button";
import { LogoMark, Wordmark } from "@/components/ui/Logo";
import { SITE } from "@/config/site";

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
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menuOpen]);

  const choose = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-1 border-b border-white/[0.07] bg-ink-950/95 px-1.5 backdrop-blur sm:gap-2 sm:px-3">
      {/* Home + file */}
      <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2 md:flex-none">
        <button
          onClick={p.onHome}
          aria-label={`${SITE.name} — back to home`}
          title="Back to home"
          className="flex shrink-0 items-center gap-2 rounded-xl p-1.5 outline-none transition-colors hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-volt-400"
        >
          <LogoMark className="size-8" />
          <span className="hidden xl:inline">
            <Wordmark />
          </span>
        </button>
        <div className="mx-1 hidden h-6 w-px bg-white/10 sm:block" />
        <div className="min-w-0 px-1">
          <p className="truncate text-sm font-medium leading-tight text-ink-100" title={p.fileName}>
            {p.fileName}
          </p>
          <p className="truncate text-[11px] leading-tight text-ink-500">
            {p.pageCount} page{p.pageCount === 1 ? "" : "s"}
            {p.editCount > 0 && (
              <>
                {" · "}
                <span className={p.dirty ? "text-amber-400" : "text-volt-400"}>
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
        className="absolute left-1/2 hidden -translate-x-1/2 items-center rounded-xl bg-white/[0.05] p-0.5 ring-1 ring-inset ring-white/[0.06] md:flex"
      >
        {TOOLS.map(({ tool, label, icon: Icon }) => (
          <button
            key={tool}
            role="radio"
            aria-checked={p.tool === tool}
            onClick={() => p.onToolChange(tool)}
            className={`flex h-7 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-all ${
              p.tool === tool ? "bg-white/[0.12] text-white shadow-sm" : "text-ink-400 hover:text-ink-100"
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

        {/* Wide screens: everything inline */}
        <div className="hidden items-center gap-1 md:flex">
          <div className="mx-1 h-5 w-px bg-white/10" />
          <span className="hidden lg:inline-flex">
            <IconButton label="Keyboard shortcuts" shortcut="?" onClick={p.onShortcuts}>
              <Keyboard className="size-4" />
            </IconButton>
          </span>
          <IconButton label={p.inspectorOpen ? "Hide properties" : "Show properties"} onClick={p.onToggleInspector} active={p.inspectorOpen}>
            <PanelRight className="size-4" />
          </IconButton>
          <Button variant="ghost" size="sm" onClick={p.onOpen}>
            <FolderOpen className="size-4" /> Open
          </Button>
        </div>

        {/* Phones and small tablets: the rest lives in a menu */}
        <div className="relative md:hidden">
          <IconButton label="More" onClick={() => setMenuOpen((o) => !o)} active={menuOpen}>
            <MoreVertical className="size-4" />
          </IconButton>
          {menuOpen && (
            <>
              <button aria-label="Close menu" className="fixed inset-0 z-40 cursor-default" onClick={() => setMenuOpen(false)} />
              <div role="menu" className="animate-pop-in absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl bg-ink-900 p-1.5 shadow-2xl shadow-black/60 ring-1 ring-white/10">
                {TOOLS.map(({ tool, label, icon: Icon }) => (
                  <MenuItem key={tool} icon={Icon} onClick={choose(() => p.onToolChange(tool))} checked={p.tool === tool}>
                    {tool === "edit" ? "Edit text" : "Select & copy text"}
                    <span className="sr-only"> ({label})</span>
                  </MenuItem>
                ))}
                <div className="my-1 h-px bg-white/[0.07]" />
                <MenuItem icon={PanelRight} onClick={choose(p.onToggleInspector)} checked={p.inspectorOpen}>
                  Properties
                </MenuItem>
                <MenuItem icon={FolderOpen} onClick={choose(p.onOpen)}>
                  Open another PDF
                </MenuItem>
              </div>
            </>
          )}
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={p.onSave}
          disabled={!p.canSave || p.saving}
          aria-label="Download"
          title={p.canSave ? undefined : "Make an edit to enable download"}
          className="ml-0.5 size-10 px-0 sm:ml-1 sm:h-8 sm:w-auto sm:px-3.5 pointer-coarse:size-11 sm:pointer-coarse:h-11 sm:pointer-coarse:w-auto"
        >
          {p.saving ? <Spinner className="size-4" /> : <Download className="size-4" />}
          <span className="hidden sm:inline">{p.saving ? "Preparing…" : "Download"}</span>
        </Button>
      </div>
    </header>
  );
}

function MenuItem({ icon: Icon, children, onClick, checked }: { icon: typeof Check; children: React.ReactNode; onClick: () => void; checked?: boolean }) {
  return (
    <button role="menuitem" onClick={onClick} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-ink-100 hover:bg-white/[0.07] active:bg-white/10">
      <Icon className="size-[18px] text-ink-400" />
      <span className="flex-1">{children}</span>
      {checked && <Check className="size-4 text-volt-400" strokeWidth={3} />}
    </button>
  );
}
