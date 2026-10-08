/**
 * Browser-only image decoding (canvas). Everything byte-level lives in imageFormat.ts;
 * this file only handles what the browser has to do: decode unusual formats, apply EXIF
 * orientation and the user's rotation, and make thumbnails.
 */
import { PdfUserError } from "@/lib/pdf/errors";
import { directEmbed } from "./imageFormat";
import type { PreparedImage } from "./images";

export type ImageRotation = 0 | 90 | 180 | 270;

/** Canvases beyond this edge length fail on some devices. */
const MAX_EDGE = 8192;
const THUMB_EDGE = 360;

function unsupported(name: string, cause?: unknown): PdfUserError {
  return new PdfUserError(
    "unsupported-image",
    `${name} couldn't be read as an image. JPG, PNG, WebP, GIF, BMP and AVIF work in most browsers.`,
    { cause },
  );
}

async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (error) {
    throw unsupported(file.name, error);
  }
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Canvas export failed"))), type, quality),
  );
}

/** True if any pixel of a downscaled copy is not fully opaque. */
function hasTransparency(bitmap: ImageBitmap): boolean {
  const size = 48;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(bitmap, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true;
  return false;
}

export interface ImageInfo {
  width: number;
  height: number;
  thumbnailUrl: string;
}

/** Validates that the browser can decode the file and makes a small preview. */
export async function inspectImage(file: File): Promise<ImageInfo> {
  const bitmap = await decode(file);
  try {
    const scale = Math.min(1, THUMB_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = makeCanvas(bitmap.width * scale, bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw unsupported(file.name);
    ctx.fillStyle = "#fff"; // the thumbnail is a JPEG, so transparent areas would otherwise turn black
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await toBlob(canvas, "image/jpeg", 0.8);
    return { width: bitmap.width, height: bitmap.height, thumbnailUrl: URL.createObjectURL(blob) };
  } finally {
    bitmap.close();
  }
}

/**
 * Produces bytes ready to embed. Plain JPEG/PNG files pass through untouched; anything
 * that needs rotating or isn't JPEG/PNG is redrawn on a canvas (PNG when it has
 * transparency, high-quality JPEG otherwise).
 */
export async function prepareImage(file: File, rotate: ImageRotation): Promise<PreparedImage> {
  const original = new Uint8Array(await file.arrayBuffer());
  const direct = directEmbed(original, rotate);
  if (direct) return { name: file.name, kind: direct.kind, bytes: original, width: direct.width, height: direct.height };

  const bitmap = await decode(file);
  try {
    const swap = rotate === 90 || rotate === 270;
    let width = swap ? bitmap.height : bitmap.width;
    let height = swap ? bitmap.width : bitmap.height;
    const shrink = Math.min(1, MAX_EDGE / Math.max(width, height));
    width *= shrink;
    height *= shrink;

    const canvas = makeCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw unsupported(file.name);
    const alpha = hasTransparency(bitmap);
    if (!alpha) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotate * Math.PI) / 180);
    const drawW = (swap ? canvas.height : canvas.width);
    const drawH = (swap ? canvas.width : canvas.height);
    ctx.drawImage(bitmap, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    const blob = alpha ? await toBlob(canvas, "image/png") : await toBlob(canvas, "image/jpeg", 0.92);
    return {
      name: file.name,
      kind: alpha ? "png" : "jpg",
      bytes: new Uint8Array(await blob.arrayBuffer()),
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    bitmap.close();
  }
}
