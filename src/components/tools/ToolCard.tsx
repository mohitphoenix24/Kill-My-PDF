import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ToolDef } from "@/config/tools";
import { TOOL_ICONS } from "@/components/ui/toolIcons";

/** A tool tile — used on the home grid (large) and as "try another tool" links (compact). */
export function ToolCard({ tool, compact = false }: { tool: ToolDef; compact?: boolean }) {
  const Icon = TOOL_ICONS[tool.slug];
  return (
    <Link
      href={tool.path}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-900 outline-none transition-all duration-200 hover:-translate-y-0.5 hover:border-volt-400/40 hover:bg-ink-850 focus-visible:ring-2 focus-visible:ring-volt-400"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 size-36 rounded-full bg-volt-400/0 blur-2xl transition-colors duration-300 group-hover:bg-volt-400/15"
      />
      <div className={`relative flex flex-1 flex-col ${compact ? "gap-3 p-4" : "gap-4 p-5 sm:p-6"}`}>
        <div className="flex items-start justify-between">
          <span className={`flex items-center justify-center rounded-xl bg-volt-400/10 text-volt-400 ring-1 ring-inset ring-volt-400/20 transition-colors group-hover:bg-volt-400 group-hover:text-ink-950 ${compact ? "size-9" : "size-11"}`}>
            <Icon className={compact ? "size-[18px]" : "size-5"} />
          </span>
          <ArrowUpRight className="size-5 text-ink-600 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-volt-400" />
        </div>
        <div>
          <h3 className={`font-display font-bold tracking-tight text-white ${compact ? "text-base" : "text-xl"}`}>{tool.name}</h3>
          <p className={`mt-1 text-ink-400 ${compact ? "text-[13px]" : "text-sm"}`}>{tool.tagline}</p>
        </div>
      </div>
    </Link>
  );
}
