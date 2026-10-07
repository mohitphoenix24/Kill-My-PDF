"use client";

import { CircleAlert, FileCheck2, FileUp, Type, Zap } from "lucide-react";
import { Spinner } from "@/components/ui/Button";
import { APP_NAME, LogoMark } from "@/components/ui/Logo";

interface Props {
  loadingFile?: string;
  error?: string;
  dragging: boolean;
  onOpen: () => void;
}

const FEATURES = [
  { icon: Type, label: "Original fonts kept" },
  { icon: FileCheck2, label: "Real, selectable text" },
  { icon: Zap, label: "Instant — no sign-up" },
];

/** Single-screen landing: headline, a central drop zone and three feature chips. */
export function Landing({ loadingFile, error, dragging, onOpen }: Props) {
  const busy = !!loadingFile;
  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-zinc-950">
      {/* Background: faint grid + two soft glows */}
      <div aria-hidden className="landing-grid pointer-events-none absolute inset-0" />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-18%] h-[520px] w-[900px] max-w-[160vw] -translate-x-1/2 rounded-full bg-indigo-600/25 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-30%] right-[-10%] h-[420px] w-[620px] rounded-full bg-violet-600/15 blur-[120px]"
      />

      <header className="relative z-10 flex h-16 shrink-0 items-center px-5 sm:px-8">
        <div className="flex items-center gap-2.5">
          <LogoMark className="size-8" />
          <span className="text-[15px] font-semibold tracking-tight text-white">{APP_NAME}</span>
        </div>
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-5 pb-10 text-center sm:pb-16">
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
                <p className="mt-5 text-lg font-medium text-white">
                  {dragging ? "Release to open your PDF" : "Drop your PDF here"}
                </p>
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
    </div>
  );
}
