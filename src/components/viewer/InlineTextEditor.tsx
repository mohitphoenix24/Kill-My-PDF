"use client";

import { useEffect, useRef } from "react";
import type { PageTransform } from "@/lib/geometry/coordinates";
import { rotationDegrees } from "@/lib/geometry/matrix";
import type { FontInfo, TextElement } from "@/lib/model/types";
import { elementScreenMatrix } from "./elementGeometry";

const CSS_FAMILY: Record<NonNullable<FontInfo["family"]>, string> = {
  serif: '"Times New Roman", Times, serif',
  sans: "Helvetica, Arial, sans-serif",
  mono: '"Courier New", Courier, monospace',
};

/** Inline editing works on text that reads horizontally on screen; other text is edited in the panel. */
export function canEditInline(element: TextElement, transform: PageTransform): boolean {
  return Math.abs(rotationDegrees(elementScreenMatrix(element, transform))) < 0.5;
}

interface Props {
  element: TextElement;
  font: FontInfo | undefined;
  transform: PageTransform;
  width: number;
  onChange: (text: string) => void;
  /** Finish editing, keeping the text. */
  onDone: () => void;
  /** Abandon editing, restoring `initialText`. */
  onCancel: (initialText: string) => void;
}

/**
 * A text field placed exactly over the text being edited, sized to the PDF font
 * size at the current zoom. The real result is the export preview rendered
 * underneath; this field only approximates the font for typing comfort.
 */
export function InlineTextEditor({ element, font, transform, width, onChange, onDone, onCancel }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const initialText = useRef(element.content);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
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
      className="absolute z-20 rounded-[3px] bg-white text-zinc-900 shadow-[0_0_0_2px_rgb(99_102_241),0_8px_24px_-6px_rgb(0_0_0/0.25)] outline-none"
      style={{
        left: m[4] - padX,
        top,
        height,
        minWidth: Math.max(width * fontPx * scaleX, 24) + padX * 2,
        paddingInline: padX,
        fontSize: fontPx,
        lineHeight: `${height}px`,
        fontFamily: CSS_FAMILY[font?.family ?? "sans"],
        fontWeight: element.style.fontWeight ?? 400,
        fontStyle: element.style.fontStyle === "italic" ? "italic" : "normal",
        color: element.style.color ?? "#000",
        fieldSizing: "content",
      } as React.CSSProperties}
    />
  );
}
