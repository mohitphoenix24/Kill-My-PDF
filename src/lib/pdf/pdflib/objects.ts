/**
 * Small helpers over pdf-lib's low-level object model. Both the analyser and the
 * exporter read page content through `readPageContent`, so the byte offsets the
 * analyser records are guaranteed to match what the exporter splices.
 */
import {
  PDFArray,
  PDFContentStream,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFObject,
  PDFRawStream,
  PDFRef,
  PDFStream,
  PDFString,
  decodePDFRawStream,
  type PDFContext,
  type PDFPage,
} from "pdf-lib";

export function lookup(context: PDFContext, obj: PDFObject | undefined): PDFObject | undefined {
  return obj instanceof PDFRef ? context.lookup(obj) : obj;
}

export function lookupDict(context: PDFContext, obj: PDFObject | undefined): PDFDict | undefined {
  const v = lookup(context, obj);
  if (v instanceof PDFDict) return v;
  if (v instanceof PDFStream) return v.dict;
  return undefined;
}

export function dictGet(context: PDFContext, dict: PDFDict | undefined, key: string): PDFObject | undefined {
  return dict ? lookup(context, dict.get(PDFName.of(key))) : undefined;
}

export function nameValue(obj: PDFObject | undefined): string | undefined {
  return obj instanceof PDFName ? obj.decodeText() : undefined;
}

export function numberValue(obj: PDFObject | undefined): number | undefined {
  return obj instanceof PDFNumber ? obj.asNumber() : undefined;
}

export function stringValue(obj: PDFObject | undefined): string | undefined {
  return obj instanceof PDFString || obj instanceof PDFHexString ? obj.decodeText() : undefined;
}

export function arrayValues(context: PDFContext, obj: PDFObject | undefined): PDFObject[] {
  const v = lookup(context, obj);
  return v instanceof PDFArray ? v.asArray().map((item) => lookup(context, item)!) : [];
}

export function refKey(ref: PDFRef): string {
  return `${ref.objectNumber} ${ref.generationNumber} R`;
}

/** Decoded bytes of a content stream (applies its /Filter chain). */
export function decodeStream(stream: PDFObject | undefined): Uint8Array {
  if (stream instanceof PDFRawStream) return decodePDFRawStream(stream).decode();
  if (stream instanceof PDFContentStream) return stream.getUnencodedContents();
  if (stream instanceof PDFStream) return stream.getContents();
  throw new Error("Not a stream");
}

export interface PageContent {
  /** All content streams decoded and joined with a newline (they form one logical stream). */
  bytes: Uint8Array;
  streamRefs: PDFRef[];
}

export function readPageContent(page: PDFPage): PageContent {
  const context = page.doc.context;
  const contents = page.node.get(PDFName.of("Contents"));
  const refs: PDFRef[] = [];
  const chunks: Uint8Array[] = [];
  const resolved = lookup(context, contents);
  const entries = resolved instanceof PDFArray ? resolved.asArray() : contents ? [contents] : [];
  for (const entry of entries) {
    if (entry instanceof PDFRef) refs.push(entry);
    chunks.push(decodeStream(lookup(context, entry)));
  }
  const size = chunks.reduce((n, c) => n + c.length + 1, 0);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
    bytes[offset++] = 0x0a;
  }
  return { bytes, streamRefs: refs };
}

/** The page's /Resources, following inheritance from the page tree. */
export function pageResources(page: PDFPage): PDFDict | undefined {
  const context = page.doc.context;
  return lookupDict(context, page.node.Resources() ?? page.node.getInheritableAttribute(PDFName.of("Resources")));
}
