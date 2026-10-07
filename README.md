# PDF Text Editor

Edit the native text of digital PDFs in the browser and export a real PDF. The output is not an image: edited text stays selectable and searchable, and everything else on the page is left as it was.

Open a PDF, double-click "Mohit Sharma", type "Rohit Sharma", and click **Download**. The downloaded file contains the text "Rohit Sharma" in the original Helvetica, at the original position. "Mohit Sharma" is removed from the file, not hidden under a white box.

Only native (digital) PDFs are supported. Scanned or image-only PDFs are detected and rejected with a clear message. There is no OCR and no AI.

## Running locally

```bash
npm install
npm run dev          # http://localhost:3000 (copies pdf.js assets into public/ first)
npm test             # unit + integration tests (Vitest, Node)
npm run build        # static export into out/
npm run test:e2e     # browser test against out/ (needs a Playwright Chromium)
npm run fixtures     # regenerate tests/fixtures
```

To try the employee example, open `tests/fixtures/employee-info.pdf`.

### Using the editor

- **Click** text to select it. A floating toolbar offers edit, size, colour, revert and remove.
- **Double-click** text (or press Enter) to type directly on the page. Enter keeps the change and Esc cancels it.
- **Drag** text to move it, or nudge it with the arrow keys (hold Shift for bigger steps).
- The right-hand **inspector** shows the font, size, colour and position, and says whether the edit keeps the original font. With nothing selected, it lists every change, each with a revert button.
- **Download** exports the PDF. You're warned before closing the tab or opening another file with changes you haven't downloaded.
- Press **?** to see all keyboard shortcuts.

## Deploying to Netlify (not done yet)

The app is a static Next.js export (`output: "export"`). Everything runs in the browser, so there are no Netlify Functions, no server state and no storage. `netlify.toml` already sets `npm run build` as the build command and `out/` as the publish directory. Uploaded files never leave the browser.

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
3. **Redraw with a substitute font.** Used when the original font can't draw the new text, for example an embedded subset that lacks the glyph "8".
4. **Removed.** Used when the text is cleared.

The content stream that was replaced is deleted from the file, so the old text doesn't remain anywhere in it. The pixel test confirms nothing outside the edited text changes.

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
{ "type": "setText", "elementId": "p1-t2", "text": "Rohit Sharma" }
```

```text
"Change the employee name to Rohit Sharma"
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
