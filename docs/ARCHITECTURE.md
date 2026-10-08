# Architecture and design decisions

This document explains how KillMyPDF works: the text editor (which reads, edits and writes PDF text), the page-level tools (merge, organize, split, images → PDF), the interface, and the reasoning behind the main decisions. For an overview and setup instructions, see the [README](../README.md).

- [Site structure](#site-structure)
- [Text editor](#text-editor)
- [Page tools](#page-tools)
- [Touch and mobile](#touch-and-mobile)
- [Design system](#design-system)
- [Known limitations](#known-limitations)

## Site structure

```text
/                  Home: tool picker                      (Home.tsx, server-rendered)
/edit-pdf/         Edit PDF text                          ┐
/merge-pdf/        Merge PDF                              │ each is a prerendered start page
/organize-pdf/     Organize pages                         │ (hero + drop zone + how-it-works + FAQ)
/images-to-pdf/    Images to PDF                          │ plus a lazily loaded work screen
/split-pdf/        Split PDF                              ┘
```

Everything about a tool — name, copy, SEO text, FAQ — lives in one registry, [`src/config/tools.ts`](../src/config/tools.ts). The home grid, header nav, tool pages, sitemap, web-manifest shortcuts and structured data all read from it, so **adding a tool is one registry entry plus one work component**:

1. Add an entry to `TOOLS` and a slug to `ToolSlug`.
2. Create `src/components/tools/<slug>/<Name>Work.tsx` (receives `{ files, toast, onExit }`).
3. Register it in `workComponents.tsx`, add an icon in `toolIcons.tsx`, and add `src/app/<slug>/page.tsx` (three lines).

Start pages are static HTML, so they are indexable and instant; the work screens (which pull in pdf.js and pdf-lib, ~1.7 MB) load only once a file is chosen, and are warmed up while the start page is idle.

A finished PDF can be passed on to another tool without a re-upload (`src/lib/handoff.ts`): the result screen's "Keep going with this PDF" buttons hand the file over in memory and navigate. It never touches storage or a server.

## Text editor

## Architecture

```text
PDF bytes (immutable)
   ├─ pdf.js  ── rendering, glyph widths and unicode, font metrics
   └─ pdf-lib ── raw content streams and font dictionaries
          │
          ▼
   Analysis (src/lib/pdf/analysis)     interpreter → runs → line elements
          │
          ▼
   Document model (src/lib/model)      pages, text elements, fonts — plain data
          │
          ▼
   Edit operations (src/lib/editor)    setText / move / setStyle / reset + undo history
          │
          ▼
   Exporter (src/lib/pdf/export)       original bytes + edited model → new PDF
```

| Path | Responsibility |
|---|---|
| `src/lib/geometry/` | Matrices and **all** PDF⇄screen conversion (`pdfToScreenCoordinates`, `pdfRectToScreenRect`, …). Tested against pdf.js's own viewport for every rotation, crop box and zoom level. |
| `src/lib/pdf/content/parser.ts` | Content-stream tokenizer and parser that records the byte range of every operand. |
| `src/lib/pdf/analysis/interpreter.ts` | Tracks graphics and text state (CTM, Tm, Tc, Tw, Tz, Ts, Tr, colour, forms) and emits positioned text runs. |
| `src/lib/pdf/analysis/grouping.ts` | Joins runs into line elements, splitting at large gaps. |
| `src/lib/pdf/fonts/` | Reads font dictionaries, encodes text with an existing font, and chooses substitutes. |
| `src/lib/pdf/session.ts` | Opens a file, analyses pages lazily, handles errors and detects scanned pages. |
| `src/lib/editor/` | Serialisable edit operations, applied purely, and undo/redo as a cursor over the operation log. |
| `src/lib/pdf/export/` | The exporter, plus a verifier that re-opens the output with pdf.js. |
| `src/components/` | React UI: landing page, top bar, page thumbnails, viewer (canvas, text layer, SVG overlay, inline editor, floating toolbar), inspector, dock, and shared UI pieces in `ui/`. |

### How text is matched to the PDF bytes

pdf.js knows glyph widths and unicode, but it doesn't say which bytes in the file drew which text. The analyser runs its own content-stream interpreter and walks pdf.js's operator list alongside it. Each text operator is checked against pdf.js glyph by glyph, using character codes. If anything disagrees, the page falls back to read-only text taken from pdf.js's text layer. The exporter never edits bytes it couldn't positively identify.

### Original stays untouched; edits are operations

The uploaded bytes are never modified. The edited document is always `analysedModel + operations`, and every export starts again from the original bytes. Undo and redo just move a cursor over the operation list.

## Decisions

### Export strategy, from most to least faithful

1. **In place.** The string operand inside the original `Tj`/`TJ`/`'`/`"` is rewritten in the original font. Position, clipping, transparency, z-order and tagging are all untouched. Used when only the text changed and the font can draw every new character.
2. **Redraw with the original font.** Used for moves, size changes and colour changes. The original operator is *neutralised*: it is replaced by a `TJ` kerning value of exactly the same width, so text that continues after it on the same line doesn't shift. The text is then drawn again with the same font resource.
3. **Redraw word by word (mixed).** Used when the original font can't draw *some* words of the new text, for example a subset that never included a capital "G". Words the font can draw stay in it; only the words that need a missing glyph use a substitute font. Neighbouring words of the same kind are drawn together and placed one after another along the baseline, so it reads as one line.
4. **Redraw with a substitute font.** Used when the original font can't draw any word of the new text (or it is a single word).
5. **Removed.** Used when the text is cleared.

The content stream that was replaced is deleted from the file, so the old text doesn't remain anywhere in it. The pixel test confirms nothing outside the edited text changes.

### Spaces that aren't there (Chrome / Skia PDFs)

"Print to PDF" in Chrome is the most commonly edited kind of file, and it differs from most generators: every glyph can be its own text operator, fonts are subsets, and older builds draw **no space glyph at all**: the next word is just positioned further along. Three things follow:

- Grouping tolerates the kerning overlaps those files contain (down to −0.45 em), so a line is never split in the middle of a word.
- Each font learns a `spaceWidth` (the median measured word gap, or the font's own space glyph when the file draws one).
- A space the font can't draw is written as a `TJ` kerning move of that width. A line keeps its original font after an edit instead of being swapped wholesale for a substitute.

The unit tests run every Chrome case twice, once on a real Chromium print and once on the same file with its space glyphs stripped out.

### Width changes

The font size is kept and the text is allowed to get wider or narrower. Shrinking the font to fit the original box would quietly change how the document looks. Text that continues on the same line after an in-place edit reflows by the width difference, as it would in a word processor. Text placed with its own positioning operator doesn't move. The properties panel shows the new width.

### Fonts

A character is written with the original font only when it is **known** to exist:
- the glyph was seen elsewhere in the document, which proves it is in the font file even for a subset, or
- the font is a non-embedded standard font with `WinAnsiEncoding`, where the PDF viewer supplies the glyphs.

Otherwise a substitute is chosen and **always reported** in the UI:
1. bundled DejaVu, if the original font *is* DejaVu;
2. a standard 14 font of the same class (serif, sans or mono, with matching bold and italic), if the text fits WinAnsi;
3. bundled DejaVu Sans, Serif or Mono, embedded as a subset. This covers ₹ and most Unicode.

Helvetica is never assumed to equal Arial except as this reported fallback.

### Values the PDF doesn't expose

These are left `undefined`, never guessed:
- **Alignment.** PDFs store positioned glyphs, not alignment.
- **Colour in Pattern, Separation, DeviceN or Lab colour spaces.**

Bold and italic come from the font descriptor flags where available. Otherwise they are read from the font name, for example `Arial-BoldMT`. The model records which source was used (`styleSource`).

## Page tools

All of them live in `src/lib/pdf/tools/` as plain functions over pdf-lib documents (no DOM), so they're unit-tested in Node. The screens in `src/components/tools/` only collect input and call them.

| Module | What it does |
|---|---|
| `merge.ts` | Appends every page of each document, in order, into a fresh document. |
| `organize.ts` | Builds a new document from a plan: pages can be reordered, dropped, **duplicated** and rotated. |
| `pagePlan.ts` | The state behind the Organize screen: the plan, plus undo/redo, rotate, delete, duplicate, reverse and move-as-a-group. Pure functions. |
| `split.ts`, `ranges.ts` | Extract pages; parse ranges like `1-3, 5, 8-` into friendly errors; chunk every N pages. |
| `zip.ts` | Bundles parts into a store-only `.zip` (PDFs are already compressed) with unique names. |
| `images.ts`, `imageFormat.ts` | Page layout (A4, Letter, fit-to-image, orientation, margins) and byte-level JPEG/PNG sniffing, including EXIF orientation. |
| `imageDecode.ts` | The only browser-specific part: canvas decoding for formats PDF can't embed directly, rotation, thumbnails. |

Decisions worth knowing:

- **Pages are copied into a new file, never deleted in place.** pdf-lib keeps a deleted page's objects in the file unless they're unreferenced; copying only the pages you keep means deleted pages (and anything only they used) are really gone. A test searches every decoded stream to prove it.
- **Rotation is written explicitly** from the source page's own rotation plus the user's, so an inherited `/Rotate` isn't lost.
- **JPEG and PNG go in byte-for-byte** whenever possible (baseline/progressive 8-bit JPEG, non-interlaced 8-bit PNG, no EXIF rotation) — no re-compression, smallest output. Anything else (EXIF-rotated phone photos, CMYK, interlaced, WebP, GIF, BMP, AVIF, or a user rotation) is redrawn on a canvas, as PNG if it has transparency and a 92% JPEG otherwise.
- **Merging does not carry over** bookmarks or fillable form fields. Pages, text, images and fonts are copied intact.
- **Encrypted PDFs are rejected** with a clear message: pdf-lib can copy their still-encrypted streams, producing garbage, so we refuse instead.

## Touch and mobile

Most "tapped one thing, selected another" problems on phones come from treating touch like a mouse. The editor's overlay (`ElementOverlay.tsx`) is built around how fingers actually behave:

- **Selection happens on release, not on touch-down.** Starting a scroll on top of text never selects it; a gesture that moves more than 10 px or lasts over 700 ms is a scroll, not a tap.
- **One hit-tester with a generous margin.** A tap resolves to the *nearest* text box within 14 px (3 px for a mouse), preferring the smaller box when several overlap, so small text at a fit-to-width zoom is hittable.
- **Tap, then tap again.** The first tap selects the line and marks the **word** under the finger; the second tap edits, with exactly that word selected. (The same targeting is used for mouse double-click.) Word position along the line comes from `src/lib/text/words.ts`, which works on proportional character positions, so it doesn't depend on the stand-in browser font matching the PDF font.
- **Typing on touch screens happens in a docked bar** (`MobileEditBar.tsx`), not a field on the page: it uses a 16 px font (iOS zooms the whole page into smaller inputs), stays above the on-screen keyboard, and the page behind updates live. The line being edited is scrolled clear of the keyboard.
- **Browsers fire fake mouse events after `touchend`**, and their `mousedown` pulls focus off the field that was just focused (hiding the keyboard). The overlay cancels them (`touchend` → `preventDefault`), and the edit bar has a short refocus guard as a safety net.
- **Pinch to zoom** is handled in `PdfViewer.tsx`: the pages scale live with a CSS transform, then the real zoom is committed on release with the spot under the fingers kept fixed. `touch-action: pan-x pan-y` hands panning to the browser and leaves pinch to us.
- **Finger-sized targets** use Tailwind's `pointer-coarse:` variant (44 px) — keyed to the input device, not the screen width, so a touch laptop gets them too.
- Reordering in the page tools offers drag (touch drags start after a short press so scrolling still works) **and** explicit arrow buttons, because arrows are more reliable than dragging on a phone.

## Design system

Dark only. Tokens are defined once in `src/app/globals.css`:

| Token | Role |
|---|---|
| `ink-950 … 50` | Neutral surfaces and text. 950 page · 900 panels · 850 cards · 800 inputs. Dark grey rather than black, with elevation shown by lighter surfaces. |
| `volt-400` (#c6f135) | The one accent — an electric lime, like a highlighter. Used for primary actions, focus and "selected / edited". Text on it is always `ink-950`. |
| `coral-*` | Destructive actions and errors, tuned lighter for dark backgrounds. |

On the white PDF page itself, the accent works as a literal highlighter: hover paints a lime marker, selection adds an ink outline, and edited text can be outlined with a dashed olive line. That outline is an editor aid only: it is never written to the PDF, and it is off by default (the eye button in the dock turns it on).

Contrast was checked, not eyeballed: body text on the page is 16.5:1, muted text on cards is 6.9:1, and ink on the lime button is 14.3:1 (all above WCAG AA).

Type: **Bricolage Grotesque** for headlines (casual, with character), **Geist** for the interface, **Geist Mono** for small labels. The voice is deliberately loose — "Glue PDFs together", "Photos in. PDF out." — while error messages stay plain and specific.

## Known limitations

- **Read-only text:**
  - text inside Form XObjects (editing it would change every page that reuses the form);
  - vertical (CJK) text;
  - fonts with non-Identity multi-byte CMaps (codes can't be verified);
  - invisible text (`Tr 3`, usually an OCR layer).
- **Type 3 fonts** can't be reused for new text, so edits are always drawn with a substitute.
- **Substitute fonts change appearance.** The substitute is the same class and weight as the original, but not the same typeface.
- **Redrawn text is placed on top.** A moved, recoloured or substituted element is drawn in a new content block after the original content. It ignores any clipping path the original was under, and it is untagged.
- **Lost on edit:** kerning inside an edited `TJ` segment, any "ActualText" on the edited text, and digital signatures (pdf-lib rewrites the whole file).
- **Not supported:**
  - password-protected PDFs, which are rejected;
  - encrypted PDFs that open without a password, which are view-only (pdf-lib can't re-encrypt);
  - PDFs over 150 MB.
- **CMYK colours** are converted to RGB with a simple formula, not an ICC profile.

## Performance

Measured on a 300-page, 15,000-line PDF in Node:

| Step | Time |
|---|---|
| Open | 170 ms |
| Analyse one page | ~3 ms |
| Analyse all 300 pages | under 1 s |
| Export with one edit | ~110 ms |

Pages render and are analysed lazily as they scroll into view, and the rest are analysed in the background. pdf.js already parses in its own worker. If very large files cause UI stutter, the next step is to move `exportPdf` into a Web Worker. It is pure and only needs the bytes and the model.

## Adding an AI layer later

The AI layer only needs to produce `EditOperation` JSON. It doesn't need to know anything about PDF internals:

```json
{ "type": "setText", "elementId": "p1-t7", "text": "Globex Corporation" }
```

```text
"Change the client name to Globex Corporation"
   → LLM, given the document model's text elements (id, content, bbox, style)
   → EditOperation[]
   → applyOperations(model, ops)        // same path as the UI, same undo history
   → exportPdf(originalBytes, model)
```

## Testing

- `npm test` runs:
  - **Unit tests:** geometry against pdf.js, the content parser, and edit history.
  - **Analysis tests:** fonts, sizes, colours and positions, checked against pdf.js on every text item.
  - **Export round-trip tests:** each export is re-opened and re-analysed, with an independent `pdftotext` check and a pixel diff that requires zero changed pixels outside the edited text.
- `npm run test:e2e` drives the production build in Chromium. It covers hover, select, editing, undo/redo, save and download, verification of the downloaded file, the text layer, zoom, every error case, and page navigation.
