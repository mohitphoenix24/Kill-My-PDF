"use client";

import { useEffect, useRef } from "react";
import type { PageTransform } from "@/lib/geometry/coordinates";
import { rotationDegrees } from "@/lib/geometry/matrix";
import type { FontInfo, TextElement } from "@/lib/model/types";
import type { EditSession } from "@/components/editor/editSession";
import { elementScreenMatrix } from "./elementGeometry";
import { cssFamilyFor } from "./textMeasure";

/** Inline editing works on text that reads horizontally on screen; other text is edited in the panel. */
export function canEditInline(element: TextElement, transform: PageTransform): boolean {
  return Math.abs(rotationDegrees(elementScreenMatrix(element, transform))) < 0.5;
}

interface Props {
  element: TextElement;
  font: FontInfo | undefined;
  transform: PageTransform;
  session: EditSession;
  onTyped: (text: string) => void;
  /** Finish editing, keeping the text. */
  onDone: () => void;
  /** Abandon editing, restoring the original text. */
  onCancel: () => void;
  /** Tab / Shift+Tab: keep the text and move to the next / previous word. */
  onStep: (direction: 1 | -1) => void;
}

/**
 * A text field placed over the word being edited (or the whole line, when asked), sized to the PDF
 * font at the current zoom. The real result is the export preview rendered underneath; this field
 * only approximates the font for typing comfort. Touch devices use the docked MobileEditBar instead.
 */
export function InlineTextEditor({ element, font, transform, session, onTyped, onDone, onCancel, onStep }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    // The field is remounted for each word (it's keyed by the word), so this runs once per word.
  }, []);

  const m = elementScreenMatrix(element, transform);
  const fontPx = Math.hypot(m[2], m[3]);
  const pxPerEm = Math.hypot(m[0], m[1]);
  const padX = 3;
  const left = m[4] + m[0] * session.startEm - padX;
  const top = m[5] - element.ascent * fontPx;
  const height = (element.ascent - element.descent) * fontPx;

  return (
    <input
      ref={inputRef}
      aria-label={session.whole ? "Edit line inline" : "Edit word inline"}
      value={session.typed}
      spellCheck={false}
      onChange={(e) => onTyped(e.target.value)}
      onBlur={onDone}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") onDone();
        else if (e.key === "Escape") onCancel();
        else if (e.key === "Tab" && !session.whole) {
          e.preventDefault();
          onStep(e.shiftKey ? -1 : 1);
        }
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute z-20 rounded-[3px] bg-white text-ink-900 shadow-[0_0_0_2px_#0d0d0f,0_0_0_5px_rgb(198_241_53/0.7),0_12px_30px_-8px_rgb(0_0_0/0.5)] outline-none"
      style={{
        left,
        top,
        height,
        minWidth: Math.max(session.widthEm * pxPerEm, 16) + padX * 2,
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
