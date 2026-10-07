/**
 * The only module that imports pdfjs-dist. The legacy build is used in both the
 * browser and Node (tests) so one code path is exercised everywhere.
 */
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";

export const { OPS, AnnotationMode, TextLayer, getDocument, GlobalWorkerOptions } = pdfjs;
export type { PDFDocumentProxy };
export type { PDFPageProxy, TextContent, TextItem } from "pdfjs-dist/types/src/display/api";

export interface PdfjsAssetUrls {
  cMapUrl: string;
  standardFontDataUrl: string;
  wasmUrl: string;
  iccUrl: string;
}

/** Served from public/pdfjs (copied from node_modules by scripts/copy-pdfjs-assets.mjs). */
let assetUrls: PdfjsAssetUrls = {
  cMapUrl: "/pdfjs/cmaps/",
  standardFontDataUrl: "/pdfjs/standard_fonts/",
  wasmUrl: "/pdfjs/wasm/",
  iccUrl: "/pdfjs/iccs/",
};

if (typeof window !== "undefined") {
  GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
}

export function configurePdfjsAssets(urls: PdfjsAssetUrls): void {
  assetUrls = urls;
}

export interface OpenOptions {
  password?: string;
}

/**
 * Opens a PDF with pdf.js. The bytes are copied because pdf.js transfers (and so
 * detaches) the buffer it is given — the caller's original must stay intact.
 */
export function openWithPdfjs(bytes: Uint8Array, options: OpenOptions = {}): Promise<PDFDocumentProxy> {
  return getDocument({
    data: bytes.slice(),
    password: options.password,
    cMapPacked: true,
    isEvalSupported: false,
    enableXfa: false,
    verbosity: 0,
    ...assetUrls,
  }).promise;
}
