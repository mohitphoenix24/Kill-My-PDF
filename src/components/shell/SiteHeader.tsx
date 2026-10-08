"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import { SITE } from "@/config/site";
import { TOOLS, type ToolSlug } from "@/config/tools";
import { LogoMark, Wordmark } from "@/components/ui/Logo";
import { TOOL_ICONS } from "@/components/ui/toolIcons";

export function GithubMark({ className = "size-[18px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.18 1.83 1.18 3.09 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

interface Props {
  /** Highlights this tool in the nav. */
  current?: ToolSlug;
  /** Where the logo goes. Overridden by pages that want to confirm before leaving. */
  onHome?: () => void;
  /** Span the full width (work screens, whose content is full-bleed) instead of the centred column. */
  wide?: boolean;
}

export function SiteHeader({ current, onHome, wide = false }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  const logo = (
    <>
      <LogoMark className="size-8" />
      <Wordmark />
    </>
  );

  return (
    <header className="relative z-40 shrink-0 border-b border-white/[0.06] bg-ink-950/85 backdrop-blur-md">
      <div className={`mx-auto flex h-14 items-center gap-2 px-4 sm:h-16 sm:px-6 ${wide ? "" : "max-w-6xl"}`}>
        {onHome ? (
          <button onClick={onHome} aria-label={`${SITE.name} — back to home`} className="flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-volt-400">
            {logo}
          </button>
        ) : (
          <Link href="/" aria-label={`${SITE.name} — home`} className="flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-volt-400">
            {logo}
          </Link>
        )}

        <nav aria-label="Tools" className="ml-6 hidden items-center gap-0.5 md:flex">
          {TOOLS.map((tool) => {
            const active = tool.slug === current;
            return (
              <Link
                key={tool.slug}
                href={tool.path}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  active ? "bg-white/[0.08] font-medium text-white" : "text-ink-400 hover:bg-white/[0.05] hover:text-white"
                }`}
              >
                {tool.short}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          {SITE.repoUrl && (
            <a
              href={SITE.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="KillMyPDF on GitHub"
              className="flex size-9 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <GithubMark />
            </a>
          )}
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-tools"
            className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-ink-300 hover:bg-white/[0.06] md:hidden"
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
            Tools
            <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-tools" aria-label="All tools" className="animate-pop-in absolute inset-x-0 top-full border-b border-white/[0.08] bg-ink-900/98 px-3 pb-3 pt-1 shadow-2xl shadow-black/60 backdrop-blur md:hidden">
          <ul className="mx-auto grid max-w-md gap-1">
            {TOOLS.map((tool) => {
              const Icon = TOOL_ICONS[tool.slug];
              return (
                <li key={tool.slug}>
                  <Link
                    href={tool.path}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${tool.slug === current ? "bg-white/[0.07]" : "hover:bg-white/[0.05]"}`}
                  >
                    <span className="flex size-9 items-center justify-center rounded-lg bg-volt-400/10 text-volt-400">
                      <Icon className="size-[18px]" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-white">{tool.name}</span>
                      <span className="block truncate text-xs text-ink-400">{tool.tagline}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </header>
  );
}
