"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, Check, Download, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { TOOL_ICONS } from "@/components/ui/toolIcons";
import { type ToolSlug, getTool } from "@/config/tools";
import { downloadBytes } from "@/lib/browser/files";
import { setHandoff } from "@/lib/handoff";
import { formatBytes } from "@/lib/pdf/tools/common";

interface Props {
  /** The punchline, e.g. "Boom. Merged." */
  title: string;
  subtitle: string;
  file: { name: string; bytes: Uint8Array; mimeType?: string };
  /** Small facts shown as chips, e.g. "14 pages". */
  stats?: string[];
  /** Other tools that can pick this PDF up next. Only offered when the output is a PDF. */
  next?: ToolSlug[];
  /** Goes back to the tool's editing screen with everything as it was. */
  onTweak?: () => void;
  onStartOver: () => void;
  children?: ReactNode;
}

/** The "it worked" screen: download, and keep going with the result in another tool. */
export function ResultCard({ title, subtitle, file, stats = [], next = [], onTweak, onStartOver, children }: Props) {
  const router = useRouter();
  const mime = file.mimeType ?? "application/pdf";
  const isPdf = mime === "application/pdf";

  const keepGoing = (slug: ToolSlug) => {
    setHandoff(new File([file.bytes as Uint8Array<ArrayBuffer>], file.name, { type: mime }));
    router.push(getTool(slug).path);
  };

  return (
    <div className="thin-scroll flex-1 overflow-y-auto px-4 py-10 sm:py-16">
      <div className="animate-rise mx-auto flex w-full max-w-lg flex-col items-center text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-volt-400 text-ink-950 shadow-[0_16px_50px_-12px_rgb(198_241_53/0.7)]">
          <Check className="size-8" strokeWidth={3} />
        </div>
        <h2 className="mt-6 font-display text-4xl font-extrabold tracking-tight text-white">{title}</h2>
        <p className="mt-2 text-ink-400">{subtitle}</p>

        <div className="mt-8 w-full rounded-2xl bg-ink-900 p-4 ring-1 ring-inset ring-white/[0.08]">
          <p className="truncate text-sm font-medium text-white" title={file.name}>
            {file.name}
          </p>
          <p className="mt-0.5 text-xs text-ink-400">{[...stats, formatBytes(file.bytes.length)].join(" · ")}</p>
          <Button variant="primary" size="lg" className="mt-4 h-12 w-full" onClick={() => downloadBytes(file.bytes, file.name, mime)}>
            <Download className="size-[18px]" /> Download
          </Button>
        </div>

        {children}

        <div className="mt-4 flex w-full gap-2">
          {onTweak && (
            <Button variant="secondary" className="h-11 flex-1" onClick={onTweak}>
              Tweak it
            </Button>
          )}
          <Button variant="secondary" className="h-11 flex-1" onClick={onStartOver}>
            <RotateCcw className="size-4" /> Start over
          </Button>
        </div>

        {isPdf && next.length > 0 && (
          <div className="mt-10 w-full text-left">
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-500">Keep going with this PDF</p>
            <ul className="mt-3 grid gap-2">
              {next.map((slug) => {
                const tool = getTool(slug);
                const Icon = TOOL_ICONS[slug];
                return (
                  <li key={slug}>
                    <button
                      onClick={() => keepGoing(slug)}
                      className="group flex min-h-14 w-full items-center gap-3 rounded-xl bg-ink-900 px-4 py-3 text-left ring-1 ring-inset ring-white/[0.07] transition-colors hover:bg-ink-850 hover:ring-volt-400/40"
                    >
                      <Icon className="size-5 text-volt-400" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-white">{tool.name}</span>
                        <span className="block truncate text-xs text-ink-400">{tool.tagline}</span>
                      </span>
                      <ArrowRight className="size-4 text-ink-500 transition-transform group-hover:translate-x-0.5 group-hover:text-volt-400" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
