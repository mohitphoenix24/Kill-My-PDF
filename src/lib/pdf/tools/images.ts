import { PageSizes } from "pdf-lib";
import { PdfUserError } from "@/lib/pdf/errors";
import { createOutputDoc } from "./common";

export type PageSizeOption = "auto" | "a4" | "letter";
export type OrientationOption = "auto" | "portrait" | "landscape";
export type MarginOption = "none" | "small" | "large";

export interface ImagePdfOptions {
  pageSize: PageSizeOption;
  /** Only used with a fixed page size. */
  orientation: OrientationOption;
  margin: MarginOption;
}

export const DEFAULT_IMAGE_OPTIONS: ImagePdfOptions = { pageSize: "a4", orientation: "auto", margin: "small" };

export const MARGIN_POINTS: Record<MarginOption, number> = { none: 0, small: 24, large: 54 };

/** When matching the image, the longer side is capped at an A4 length so pages stay printable. */
const AUTO_MAX_SIDE = 842;

/** An image ready to embed: already oriented the way it should appear, as JPEG or PNG bytes. */
export interface PreparedImage {
  name: string;
  kind: "jpg" | "png";
  bytes: Uint8Array;
  width: number;
  height: number;
}

export interface Placement {
  pageWidth: number;
  pageHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Page size (points) and image rectangle for one image. Pure, so it is easy to test. */
export function computePlacement(imageWidth: number, imageHeight: number, options: ImagePdfOptions): Placement {
  const margin = MARGIN_POINTS[options.margin];

  if (options.pageSize === "auto") {
    const scale = Math.min(1, AUTO_MAX_SIDE / Math.max(imageWidth, imageHeight));
    const width = imageWidth * scale;
    const height = imageHeight * scale;
    return { pageWidth: width + margin * 2, pageHeight: height + margin * 2, x: margin, y: margin, width, height };
  }

  const [short, long] = options.pageSize === "a4" ? [PageSizes.A4[0], PageSizes.A4[1]] : [PageSizes.Letter[0], PageSizes.Letter[1]];
  const landscape = options.orientation === "auto" ? imageWidth > imageHeight : options.orientation === "landscape";
  const pageWidth = landscape ? long : short;
  const pageHeight = landscape ? short : long;
  const boxWidth = pageWidth - margin * 2;
  const boxHeight = pageHeight - margin * 2;
  const scale = Math.min(boxWidth / imageWidth, boxHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return { pageWidth, pageHeight, x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height };
}

/** One page per image, in order. */
export async function buildImagesPdf(images: readonly PreparedImage[], options: ImagePdfOptions): Promise<Uint8Array> {
  if (images.length === 0) throw new PdfUserError("invalid-input", "Add at least one image.");
  const out = await createOutputDoc();
  for (const image of images) {
    let embedded;
    try {
      embedded = image.kind === "jpg" ? await out.embedJpg(image.bytes) : await out.embedPng(image.bytes);
    } catch (error) {
      throw new PdfUserError("unsupported-image", `${image.name} couldn't be added to the PDF.`, { cause: error });
    }
    const placement = computePlacement(image.width, image.height, options);
    const page = out.addPage([placement.pageWidth, placement.pageHeight]);
    page.drawImage(embedded, { x: placement.x, y: placement.y, width: placement.width, height: placement.height });
  }
  return out.save();
}
