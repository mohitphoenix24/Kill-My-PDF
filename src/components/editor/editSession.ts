/**
 * What's being typed right now. People edit a *word*, but the model stores whole lines, so a
 * session keeps the text before and after the word fixed and only changes the part in the middle.
 */
import type { FontInfo, TextElement } from "@/lib/model/types";
import { type WordSpan, sliceRange } from "@/lib/text/words";
import { wordAtTap, wordsOf } from "@/components/viewer/textMeasure";

export interface EditSession {
  id: string;
  /** The line's text before and after the part being typed. Fixed while the session lasts. */
  prefix: string;
  suffix: string;
  /** What's in the field: the word, or the whole line. */
  typed: string;
  /** The line as it was when editing began, restored on cancel. */
  original: string;
  /** Editing the whole line rather than one word. */
  whole: boolean;
  /** Where the field starts along the line and how wide the word was, in ems. */
  startEm: number;
  widthEm: number;
}

export const fullText = (s: EditSession) => s.prefix + s.typed + s.suffix;

export function wordSession(element: TextElement, span: WordSpan): EditSession {
  const content = element.content;
  const count = Array.from(content).length;
  return {
    id: element.id,
    prefix: sliceRange(content, 0, span.start),
    typed: sliceRange(content, span.start, span.end),
    suffix: sliceRange(content, span.end, count),
    original: content,
    whole: false,
    startEm: span.from * element.width,
    widthEm: (span.to - span.from) * element.width,
  };
}

export function lineSession(element: TextElement): EditSession {
  return { id: element.id, prefix: "", typed: element.content, suffix: "", original: element.content, whole: true, startEm: 0, widthEm: element.width };
}

/** Starts editing the word `fraction` of the way along the line, or the whole line if there's no such word. */
export function beginEdit(element: TextElement, font: FontInfo | undefined, fraction: number | null): EditSession {
  if (fraction !== null) {
    const span = wordAtTap(element, font, fraction);
    if (span) return wordSession(element, span);
  }
  return lineSession(element);
}

/** Widens a word session to the whole line, keeping what's been typed so far. */
export function toWholeLine(session: EditSession, element: TextElement): EditSession {
  return { ...lineSession(element), original: session.original, typed: fullText(session) };
}

/** The session for the next/previous word on the line (Tab / Shift+Tab), or null at the ends. */
export function adjacentWord(session: EditSession, element: TextElement, font: FontInfo | undefined, direction: 1 | -1): EditSession | null {
  if (session.whole) return null;
  const spans = wordsOf(element, font);
  const here = Array.from(session.prefix).length;
  const index = spans.findIndex((s) => s.start === here);
  const next = spans[index + direction];
  if (index < 0 || !next) return null;
  return { ...wordSession(element, next), original: session.original };
}
