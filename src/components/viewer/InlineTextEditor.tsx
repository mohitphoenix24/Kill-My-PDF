"use client";

import { useEffect, useRef } from "react";
import type { PageTransform } from "@/lib/geometry/coordinates";
import { rotationDegrees } from "@/lib/geometry/matrix";
import type { FontInfo, TextElement } from "@/lib/model/types";
import { toUtf16Range } from "@/lib/text/words";
import { elementScreenMatrix } from "./elementGeometry";
import { cssFamilyFor, wordAtTap } from "./textMeasure";

/** Inline editing works on text that reads horizontally on screen; other text is edited in the panel. */
export function canEditInline(element: TextElement, transform: PageTransform): boolean {
  return Math.abs(rotationDegrees(elementScreenMatrix(element, transform))) < 0.5;
}

/** Puts the caret where the user tapped: the tapped word is selected, or everything when there's no tap. */
export function selectTappedWord(input: HTMLInputElement, element: TextElement, font: FontInfo | undefined, fraction: number | null): void {
  input.focus();
  if (fraction !== null) {
    const word = wordAtTap(element, font, fraction);
    if (word) {
      const [start, end] = toUtf16Range(element.content, word.start, word.end);
      input.setSelectionRange(start, end);
      return;
    }
  }
  input.select();
}

interface Props {
  element: TextElement;
  font: FontInfo | undefined;
  transform: PageTransform;
  width: number;
  /** Where along the line the user tapped (0–1); that word starts out selected. */
  anchor: number | null;
  onChange: (text: string) => void;
  /** Finish editing, keeping the text. */
  onDone: () => void;
  /** Abandon editing, restoring `initialText`. */
  onCancel: (initialText: string) => void;
}

/**
 * A text field placed exactly over the text being edited, sized to the PDF font size at the
 * current zoom. The real result is the export preview rendered underneath; this field only
 * approximates the font for typing comfort. (Touch devices use the docked MobileEditBar instead.)
 */
export function InlineTextEditor({ element, font, transform, width, anchor, onChange, onDone, onCancel }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const initialText = useRef(element.content);

  useEffect(() => {
    if (inputRef.current) selectTappedWord(inputRef.current, element, font, anchor);
    // Only on mount: later keystrokes must not move the selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const m = elementScreenMatrix(element, transform);
  const fontPx = Math.hypot(m[2], m[3]);
  const scaleX = Math.hypot(m[0], m[1]) / (fontPx || 1);
  const padX = 4;
  const top = m[5] - element.ascent * fontPx;
  const height = (element.ascent - element.descent) * fontPx;

  return (
    <input
      ref={inputRef}
      aria-label="Edit text inline"
      value={element.content}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onDone}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") onDone();
        if (e.key === "Escape") onCancel(initialText.current);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute z-20 rounded-[3px] bg-white text-ink-900 shadow-[0_0_0_2px_#0d0d0f,0_0_0_5px_rgb(198_241_53/0.7),0_12px_30px_-8px_rgb(0_0_0/0.5)] outline-none"
      style={{
        left: m[4] - padX,
        top,
        height,
        minWidth: Math.max(width * fontPx * scaleX, 24) + padX * 2,
        paddingInline: padX,
        fontSize: fontPx,
        lineHeight: `${height}px`,
        fontFamily: cssFamilyFor(font),
        fontWeight: element.style.fontWeight ?? 400,
        fontStyle: element.style.fontStyle === "italic" ? "italic" : "normal",
        color: element.style.color ?? "#000",
        fieldSizing: "content",
      } as React.CSSProperties}
    />
  );
}
