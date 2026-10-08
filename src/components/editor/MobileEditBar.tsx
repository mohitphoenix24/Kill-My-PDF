"use client";

import { Check, TextCursorInput, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { type EditSession } from "./editSession";

interface Props {
  session: EditSession;
  onTyped: (text: string) => void;
  onDone: () => void;
  onCancel: () => void;
  /** Widen the field from one word to the whole line. */
  onWholeLine: () => void;
}

const tail = (s: string, n: number) => (s.length > n ? `…${s.slice(-n)}` : s);
const head = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/**
 * Text entry for touch screens: a bar docked under the top bar, not a field on the page.
 * It stays visible above the on-screen keyboard, its text is a readable 16px (anything
 * smaller makes iOS zoom the whole page), and the page behind keeps showing live changes.
 * It edits the tapped *word* and shows a little of the line around it for orientation.
 */
export function MobileEditBar({ session, onTyped, onDone, onCancel, onWholeLine }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();

    // Safety net: for a moment after opening, if something steals focus (a stray compatibility
    // mouse event, a scroll), take it back with the same selection.
    const until = performance.now() + 700;
    const reclaim = () =>
      window.setTimeout(() => {
        if (performance.now() > until || document.activeElement === input) return;
        input.focus({ preventScroll: true });
        input.select();
      }, 0);
    input.addEventListener("blur", reclaim);
    const stop = window.setTimeout(() => input.removeEventListener("blur", reclaim), 750);
    return () => {
      window.clearTimeout(stop);
      input.removeEventListener("blur", reclaim);
    };
  }, []);

  return (
    <div role="group" aria-label="Edit text" className="animate-pop-in z-30 shrink-0 border-b border-volt-400/30 bg-ink-900 px-2 py-2">
      {!session.whole && (
        <div className="mb-1.5 flex items-center gap-2 px-1">
          <p className="min-w-0 flex-1 truncate text-xs text-ink-400" aria-hidden>
            {tail(session.prefix, 22)}
            <span className="rounded bg-volt-400/20 px-0.5 text-volt-200">{session.typed || "␣"}</span>
            {head(session.suffix, 22)}
          </p>
          <button onClick={onWholeLine} className="flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-medium text-volt-300 active:bg-white/10">
            <TextCursorInput className="size-3.5" /> Whole line
          </button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          aria-label="Cancel editing"
          onClick={onCancel}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-ink-200 active:bg-white/10"
        >
          <X className="size-5" />
        </button>
        <input
          ref={inputRef}
          aria-label={session.whole ? "Edit line" : "Edit word"}
          value={session.typed}
          onChange={(e) => onTyped(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") onDone();
          }}
          enterKeyHint="done"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          // 16px stops iOS zooming into the field.
          className="h-11 min-w-0 flex-1 rounded-xl bg-ink-950 px-3.5 text-[16px] text-white outline-none ring-2 ring-volt-400"
        />
        <button
          aria-label="Done editing"
          onClick={onDone}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-volt-400 text-ink-950 active:bg-volt-300"
        >
          <Check className="size-5" strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}
