/**
 * Byte-level image sniffing, so photos can usually be embedded into the PDF untouched
 * (no re-compression), and only odd ones (EXIF-rotated, CMYK, interlaced, WebP, …) go
 * through a canvas. Pure functions — no DOM.
 */

export interface JpegInfo {
  width: number;
  height: number;
  components: number;
  precision: number;
  /** SOF marker byte: 0xC0 baseline, 0xC1 extended, 0xC2 progressive, … */
  sof: number;
  /** EXIF orientation 1–8, or 1 when there is none. */
  orientation: number;
}

export interface PngInfo {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlaced: boolean;
}

const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

export function isJpeg(b: Uint8Array): boolean {
  return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

export function isPng(b: Uint8Array): boolean {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return b.length > 24 && sig.every((v, i) => b[i] === v);
}

/** Reads the EXIF orientation tag from an APP1 segment starting at `start` (after the length bytes). */
function readExifOrientation(b: Uint8Array, start: number, end: number): number {
  // "Exif\0\0" then a TIFF header.
  if (b[start] !== 0x45 || b[start + 1] !== 0x78 || b[start + 2] !== 0x69 || b[start + 3] !== 0x66) return 1;
  const tiff = start + 6;
  const little = b[tiff] === 0x49; // "II"
  const r16 = (o: number) => (little ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
  const r32 = (o: number) => (little ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0 : u32(b, o));
  if (r16(tiff + 2) !== 0x2a) return 1;
  const ifd = tiff + r32(tiff + 4);
  if (ifd + 2 > end) return 1;
  const entries = r16(ifd);
  for (let i = 0; i < entries; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) break;
    if (r16(entry) === 0x0112) {
      const value = r16(entry + 8);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

export function inspectJpeg(b: Uint8Array): JpegInfo | null {
  if (!isJpeg(b)) return null;
  let orientation = 1;
  let offset = 2;
  while (offset + 4 <= b.length) {
    if (b[offset] !== 0xff) return null;
    while (b[offset + 1] === 0xff) offset++; // fill bytes
    const marker = b[offset + 1];
    if (marker === 0xd9 || marker === 0xda) return null; // end of image / start of scan before any frame header
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      offset += 2;
      continue;
    }
    const length = u16(b, offset + 2);
    if (length < 2) return null;
    if (marker === 0xe1) orientation = readExifOrientation(b, offset + 4, offset + 2 + length);
    if (SOF_MARKERS.has(marker)) {
      return {
        sof: marker,
        precision: b[offset + 4],
        height: u16(b, offset + 5),
        width: u16(b, offset + 7),
        components: b[offset + 9],
        orientation,
      };
    }
    offset += 2 + length;
  }
  return null;
}

export function inspectPng(b: Uint8Array): PngInfo | null {
  if (!isPng(b)) return null;
  // IHDR is always the first chunk: length(4) "IHDR"(4) width(4) height(4) depth(1) colour(1) comp(1) filter(1) interlace(1)
  if (b[12] !== 0x49 || b[13] !== 0x48 || b[14] !== 0x44 || b[15] !== 0x52) return null;
  return {
    width: u32(b, 16),
    height: u32(b, 20),
    bitDepth: b[24],
    colorType: b[25],
    interlaced: b[28] === 1,
  };
}

export interface DirectEmbed {
  kind: "jpg" | "png";
  width: number;
  height: number;
}

/**
 * Whether the file can go into the PDF byte-for-byte (best quality, smallest output).
 * `rotate` is the user's extra rotation; any rotation or EXIF orientation needs a canvas.
 */
export function directEmbed(bytes: Uint8Array, rotate: number): DirectEmbed | null {
  if (rotate % 360 !== 0) return null;
  const jpeg = inspectJpeg(bytes);
  if (jpeg) {
    const supportedFrame = jpeg.sof === 0xc0 || jpeg.sof === 0xc1 || jpeg.sof === 0xc2;
    if (supportedFrame && jpeg.precision === 8 && (jpeg.components === 1 || jpeg.components === 3) && jpeg.orientation === 1) {
      return { kind: "jpg", width: jpeg.width, height: jpeg.height };
    }
    return null;
  }
  const png = inspectPng(bytes);
  if (png && !png.interlaced && png.bitDepth === 8 && [0, 2, 3, 4, 6].includes(png.colorType)) {
    return { kind: "png", width: png.width, height: png.height };
  }
  return null;
}
