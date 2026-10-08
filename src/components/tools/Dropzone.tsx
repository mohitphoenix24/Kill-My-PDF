"use client";

import { useRef } from "react";
import { CircleAlert, FileUp, Images } from "lucide-react";
import { Spinner } from "@/components/ui/Button";
import { type AcceptKind, acceptAttribute } from "@/lib/browser/fileTypes";

interface Props {
  title: string;
  hint: string;
  accept: AcceptKind;
  multiple: boolean;
  dragging: boolean;
  /** Shown instead of the prompt while a file is opening. */
  busyLabel?: string;
  error?: string;
  onFiles: (files: File[]) => void;
}

/** The big "drop it here" card. The whole card is the button. */
export function Dropzone({ title, hint, accept, multiple, dragging, busyLabel, error, onFiles }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const busy = !!busyLabel;
  const Icon = accept === "image" ? Images : FileUp;

  return (
    <div className="w-full max-w-xl">
      <input
        ref={input}
        type="file"
        hidden
        multiple={multiple}
        accept={acceptAttribute(accept)}
        aria-label={multiple ? "Choose files" : "Choose a file"}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) onFiles(files);
          e.target.value = "";
        }}
      />
      <div
        role="button"
        tabIndex={0}
        aria-label={title}
        aria-busy={busy}
        onClick={() => !busy && input.current?.click()}
        onKeyDown={(e) => {
          if (!busy && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            input.current?.click();
          }
        }}
        className={`group relative w-full cursor-pointer rounded-3xl p-px outline-none transition-transform duration-200 focus-visible:ring-2 focus-visible:ring-volt-400 ${
          dragging ? "scale-[1.02]" : "hover:scale-[1.01]"
        }`}
        style={{
          background: dragging
            ? "linear-gradient(135deg, #d6f857, #aedb1e)"
            : "linear-gradient(135deg, rgb(255 255 255 / 0.16), rgb(255 255 255 / 0.04) 45%, rgb(255 255 255 / 0.1))",
        }}
      >
        <div
          className={`relative overflow-hidden rounded-[23px] px-6 py-9 transition-colors sm:px-10 sm:py-11 [@media(max-height:760px)]:py-7 ${
            dragging ? "bg-ink-850" : "bg-ink-900 group-hover:bg-ink-850"
          }`}
        >
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-x-10 -top-24 h-40 rounded-full bg-volt-400/20 blur-3xl transition-opacity ${
              dragging ? "opacity-100" : "opacity-0 group-hover:opacity-70"
            }`}
          />
          {busy ? (
            <div className="relative flex flex-col items-center gap-4 py-6">
              <Spinner className="size-7 text-volt-400" />
              <p className="text-sm text-ink-300">{busyLabel}</p>
            </div>
          ) : (
            <div className="relative flex flex-col items-center text-center">
              <div className="animate-float flex size-14 items-center justify-center rounded-2xl bg-volt-400 text-ink-950 shadow-[0_12px_40px_-10px_rgb(198_241_53/0.65)]">
                <Icon className="size-6" strokeWidth={2.25} />
              </div>
              <p className="mt-5 font-display text-xl font-semibold tracking-tight text-white">
                {dragging ? "Let go. We've got it." : title}
              </p>
              <p className="mt-1 text-sm text-ink-400">
                <span className="hidden sm:inline">or </span>
                <span className="font-medium text-volt-300 underline-offset-4 group-hover:underline">
                  <span className="sm:hidden">tap to </span>
                  <span className="hidden sm:inline">click to </span>
                  browse
                </span>
              </p>
              <p className="mt-5 text-xs text-ink-500">{hint}</p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="animate-pop-in mt-4 flex items-start gap-2.5 rounded-xl bg-coral-500/10 px-4 py-3 text-left text-sm text-coral-300 ring-1 ring-coral-500/25"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
