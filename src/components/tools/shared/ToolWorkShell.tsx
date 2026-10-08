"use client";

import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { TOOL_ICONS } from "@/components/ui/toolIcons";
import { type ToolSlug, getTool } from "@/config/tools";

interface Props {
  slug: ToolSlug;
  /** Short status line under the title, e.g. "3 files · 14 pages". */
  subtitle?: string;
  /** Right side of the title bar (desktop). */
  actions?: ReactNode;
  onBack: () => void;
  children: ReactNode;
}

/** Page chrome for the page-level tools: site header, a title bar with "start over", and the body. */
export function ToolWorkShell({ slug, subtitle, actions, onBack, children }: Props) {
  const tool = getTool(slug);
  const Icon = TOOL_ICONS[slug];
  return (
    <div className="flex h-dvh flex-col bg-ink-950">
      <SiteHeader current={slug} wide />
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] bg-ink-950 px-2 py-1.5 sm:gap-3 sm:px-6 sm:py-2.5">
        <button
          onClick={onBack}
          aria-label="Start over"
          className="flex size-11 shrink-0 items-center justify-center rounded-xl text-ink-300 hover:bg-white/[0.07] hover:text-white sm:size-9"
        >
          <ArrowLeft className="size-[18px]" />
        </button>
        <span className="hidden size-9 shrink-0 items-center justify-center rounded-lg bg-volt-400/10 sm:flex text-volt-400 ring-1 ring-inset ring-volt-400/20">
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-base font-bold leading-tight text-white">{tool.name}</h1>
          {subtitle && <p className="truncate text-xs text-ink-400">{subtitle}</p>}
        </div>
        {actions && <div className="hidden items-center gap-2 sm:flex">{actions}</div>}
      </div>
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
