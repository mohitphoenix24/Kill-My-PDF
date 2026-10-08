"use client";

import { Check, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { selectTappedWord } from "@/components/viewer/InlineTextEditor";
import type { FontInfo, TextElement } from "@/lib/model/types";

interface Props {
  element: TextElement;
  font: FontInfo | undefined;
  /** Where along the line the user tapped (0–1); that word starts out selected. */
  anchor: number | null;
  onChange: (text: string) => void;
  onDone: () => void;
  onCancel: (initialText: string) => void;
}

/**
 * Text entry for touch screens: a bar docked under the top bar, not a field on the page.
 * It stays visible above the on-screen keyboard, its text is a readable 16px (anything
 * smaller makes iOS zoom the whole page), and the page behind keeps showing live changes.
 */
export function MobileEditBar({ element, font, anchor, onChange, onDone, onCancel }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const initialText = useRef(element.content);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    selectTappedWord(input, element, font, anchor);

    // Safety net: for a moment after opening, if something steals focus (a stray compatibility
    // mouse event, a scroll), take it back with the same selection.
    const { selectionStart: start, selectionEnd: end } = input;
    const until = performance.now() + 700;
    const reclaim = () =>
      window.setTimeout(() => {
        if (performance.now() > until || document.activeElement === input) return;
        input.focus({ preventScroll: true });
        input.setSelectionRange(start ?? 0, end ?? 0);
      }, 0);
    input.addEventListener("blur", reclaim);
    const stop = window.setTimeout(() => input.removeEventListener("blur", reclaim), 750);
    return () => {
      window.clearTimeout(stop);
      input.removeEventListener("blur", reclaim);
    };
    // Only on mount: later keystrokes must not move the selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div role="group" aria-label="Edit text" className="animate-pop-in z-30 flex shrink-0 items-center gap-2 border-b border-volt-400/30 bg-ink-900 px-2 py-2">
      <button
        aria-label="Cancel editing"
        onClick={() => onCancel(initialText.current)}
        className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-ink-200 active:bg-white/10"
      >
        <X className="size-5" />
      </button>
      <input
        ref={inputRef}
        aria-label="Edit text"
        value={element.content}
        onChange={(e) => onChange(e.target.value)}
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
  );
}
