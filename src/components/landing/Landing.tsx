"use client";

import {
  ChevronDown,
  CircleAlert,
  Combine,
  FileCheck2,
  FileMinus2,
  FileUp,
  Images,
  MousePointerClick,
  Plus,
  Type,
  Download,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { Spinner } from "@/components/ui/Button";
import { LogoMark } from "@/components/ui/Logo";
import { SITE } from "@/config/site";
import { FAQ, STEPS } from "./content";

interface Props {
  loadingFile?: string;
  error?: string;
  dragging: boolean;
  onOpen: () => void;
}

const FEATURES = [
  { icon: Type, label: "Original fonts kept" },
  { icon: FileCheck2, label: "Real, selectable text" },
  { icon: Zap, label: "Free — no sign-up" },
];

const STEP_ICONS = [FileUp, MousePointerClick, Download];

const COMING_SOON = [
  { icon: Combine, title: "Merge PDFs", text: "Combine several PDFs into one, in any order." },
  { icon: Images, title: "Images to PDF", text: "Turn photos and scans into a single PDF." },
  { icon: FileMinus2, title: "Delete & reorder pages", text: "Remove, rotate and rearrange pages." },
];

/**
 * Start screen. The hero fills exactly one screen with the drop zone at its centre;
 * how-it-works, FAQ and footer follow below the fold (and are indexable).
 */
export function Landing({ loadingFile, error, dragging, onOpen }: Props) {
  const busy = !!loadingFile;
  return (
    <div className="thin-scroll relative h-dvh overflow-y-auto overflow-x-hidden bg-zinc-950">
      {/* Background: faint grid + soft glows behind the hero */}
      <div aria-hidden className="landing-grid pointer-events-none absolute inset-x-0 top-0 h-dvh" />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-18vh] h-[520px] w-[900px] max-w-[160vw] -translate-x-1/2 rounded-full bg-indigo-600/25 blur-[120px]"
      />
      <div aria-hidden className="pointer-events-none absolute right-[-10%] top-[55vh] h-[420px] w-[620px] rounded-full bg-violet-600/10 blur-[120px]" />

      {/* ---------- Hero: exactly one screen ---------- */}
      <section className="relative flex min-h-dvh flex-col">
        <header className="relative z-10 flex h-16 shrink-0 items-center px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
            <LogoMark className="size-8" />
            <span className="text-[15px] font-semibold tracking-tight text-white">{SITE.name}</span>
          </Link>
          <nav className="ml-auto hidden items-center gap-1 text-sm text-zinc-400 sm:flex">
            <a href="#how-it-works" className="rounded-lg px-3 py-1.5 hover:bg-white/[0.06] hover:text-white">
              How it works
            </a>
            <a href="#faq" className="rounded-lg px-3 py-1.5 hover:bg-white/[0.06] hover:text-white">
              FAQ
            </a>
          </nav>
        </header>

        <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-5 pb-16 text-center">
          <h1 className="max-w-3xl text-balance text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] text-white sm:text-5xl lg:text-[56px] [@media(max-height:720px)]:text-4xl">
            Edit the text in any PDF.{" "}
            <span className="bg-gradient-to-r from-indigo-300 via-violet-300 to-fuchsia-300 bg-clip-text text-transparent">
              Keep the original look.
            </span>
          </h1>
          <p className="mt-4 max-w-lg text-pretty text-[15px] leading-relaxed text-zinc-400 sm:text-base [@media(max-height:720px)]:mt-3">
            Click any line, type your change, download a perfect PDF — fonts, layout and selectable text preserved.
          </p>

          {/* Drop zone — the whole card is the button */}
          <div
            role="button"
            tabIndex={0}
            aria-label="Choose a PDF to edit"
            aria-busy={busy}
            onClick={() => !busy && onOpen()}
            onKeyDown={(e) => {
              if (!busy && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onOpen();
              }
            }}
            className={`group relative mt-8 w-full max-w-xl cursor-pointer rounded-3xl p-px outline-none transition-transform duration-200 focus-visible:ring-2 focus-visible:ring-indigo-400 sm:mt-10 [@media(max-height:720px)]:mt-6 ${
              dragging ? "scale-[1.02]" : "hover:scale-[1.01]"
            }`}
            style={{
              background: dragging
                ? "linear-gradient(135deg, rgb(129 140 248), rgb(192 132 252))"
                : "linear-gradient(135deg, rgb(255 255 255 / 0.14), rgb(255 255 255 / 0.04) 40%, rgb(255 255 255 / 0.10))",
            }}
          >
            <div
              className={`relative overflow-hidden rounded-[23px] px-6 py-9 backdrop-blur-xl transition-colors sm:px-10 sm:py-12 [@media(max-height:720px)]:py-7 ${
                dragging ? "bg-zinc-900/90" : "bg-zinc-900/70 group-hover:bg-zinc-900/80"
              }`}
            >
              <div
                aria-hidden
                className={`pointer-events-none absolute inset-x-10 -top-24 h-40 rounded-full bg-indigo-500/30 blur-3xl transition-opacity ${
                  dragging ? "opacity-100" : "opacity-0 group-hover:opacity-60"
                }`}
              />
              {busy ? (
                <div className="relative flex flex-col items-center gap-4 py-6">
                  <Spinner className="size-7 text-indigo-400" />
                  <p className="text-sm text-zinc-300">
                    Opening <span className="font-medium text-white">{loadingFile}</span>…
                  </p>
                </div>
              ) : (
                <div className="relative flex flex-col items-center">
                  <div className="animate-float flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-[0_10px_40px_-8px_rgb(99_102_241/0.8)] ring-1 ring-white/20">
                    <FileUp className="size-6 text-white" />
                  </div>
                  <p className="mt-5 text-lg font-medium text-white">{dragging ? "Release to open your PDF" : "Drop your PDF here"}</p>
                  <p className="mt-1 text-sm text-zinc-400">
                    <span className="hidden sm:inline">or </span>
                    <span className="font-medium text-indigo-300 underline-offset-4 group-hover:underline">
                      <span className="sm:hidden">Tap to </span>
                      <span className="hidden sm:inline">click to </span>
                      browse your files
                    </span>
                  </p>
                  <p className="mt-6 text-xs text-zinc-500">Digital PDFs up to 150 MB · scanned documents aren&apos;t supported</p>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="animate-pop-in mt-4 flex w-full max-w-xl items-start gap-2.5 rounded-xl bg-red-500/10 px-4 py-3 text-left text-sm text-red-300 ring-1 ring-red-500/25"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <ul className="mt-8 flex flex-wrap items-center justify-center gap-2 sm:mt-10 [@media(max-height:720px)]:mt-6">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex items-center gap-2 rounded-full bg-white/[0.04] px-3.5 py-1.5 text-[13px] text-zinc-300 ring-1 ring-inset ring-white/[0.08]"
              >
                <Icon className="size-3.5 text-indigo-300" />
                {label}
              </li>
            ))}
          </ul>
        </main>

        <a
          href="#how-it-works"
          className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-zinc-300 [@media(max-height:640px)]:hidden"
        >
          How it works
          <ChevronDown className="size-4 animate-bounce" />
        </a>
      </section>

      {/* ---------- How it works ---------- */}
      <section id="how-it-works" className="relative mx-auto max-w-5xl scroll-mt-8 px-5 py-20 sm:py-28">
        <SectionHeading eyebrow="How it works" title="Three steps. No learning curve." />
        <ol className="mt-12 grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, i) => {
            const Icon = STEP_ICONS[i];
            return (
              <li key={step.title} className="relative rounded-2xl bg-white/[0.03] p-6 ring-1 ring-inset ring-white/[0.07]">
                <div className="flex items-center justify-between">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-500/15 ring-1 ring-inset ring-indigo-400/20">
                    <Icon className="size-5 text-indigo-300" />
                  </div>
                  <span className="text-4xl font-semibold tabular-nums text-white/[0.06]">0{i + 1}</span>
                </div>
                <h3 className="mt-5 text-base font-semibold text-white">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{step.text}</p>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ---------- More tools (roadmap) ---------- */}
      <section className="relative mx-auto max-w-5xl px-5 pb-20 sm:pb-28">
        <SectionHeading eyebrow="More tools" title="A full PDF toolkit is on the way." />
        <ul className="mt-12 grid gap-4 sm:grid-cols-3">
          {COMING_SOON.map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-2xl border border-dashed border-white/10 p-6">
              <div className="flex items-center justify-between">
                <Icon className="size-5 text-zinc-400" />
                <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[11px] font-medium text-zinc-400">Coming soon</span>
              </div>
              <h3 className="mt-5 text-base font-semibold text-zinc-200">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- FAQ ---------- */}
      <section id="faq" className="relative mx-auto max-w-3xl scroll-mt-8 px-5 pb-24 sm:pb-32">
        <SectionHeading eyebrow="FAQ" title="Questions, answered." />
        <div className="mt-12 divide-y divide-white/[0.07] rounded-2xl bg-white/[0.02] ring-1 ring-inset ring-white/[0.07]">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-[15px] font-medium text-zinc-100">
                {q}
                <Plus className="size-4 shrink-0 text-zinc-500 transition-transform group-open:rotate-45" />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="relative border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-zinc-500 sm:flex-row">
          <div className="flex items-center gap-2">
            <LogoMark className="size-5" />
            <span className="text-zinc-400">{SITE.name}</span>
          </div>
          <p>Built with pdf.js and pdf-lib</p>
          {SITE.repoUrl && (
            <a href={SITE.repoUrl} className="hover:text-zinc-200" rel="noopener">
              GitHub
            </a>
          )}
        </div>
      </footer>
    </div>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-300">{eyebrow}</p>
      <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h2>
    </div>
  );
}
