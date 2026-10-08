export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif"] as const;

const extensionOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || extensionOf(file.name) === "pdf";
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") ? file.type !== "image/svg+xml" : (IMAGE_EXTENSIONS as readonly string[]).includes(extensionOf(file.name));
}

export type AcceptKind = "pdf" | "image";

export function splitAccepted(files: readonly File[], kind: AcceptKind): { accepted: File[]; rejected: File[] } {
  const test = kind === "pdf" ? isPdfFile : isImageFile;
  const accepted: File[] = [];
  const rejected: File[] = [];
  for (const file of files) (test(file) ? accepted : rejected).push(file);
  return { accepted, rejected };
}

export function acceptAttribute(kind: AcceptKind): string {
  return kind === "pdf" ? "application/pdf,.pdf" : `image/*,${IMAGE_EXTENSIONS.map((e) => `.${e}`).join(",")}`;
}

/** "That doesn't look like a PDF." — shown when nothing usable was chosen. */
export function rejectionMessage(kind: AcceptKind, rejected: readonly File[], multiple: boolean): string {
  const noun = kind === "pdf" ? (multiple ? "PDFs" : "a PDF") : multiple ? "images" : "an image";
  if (rejected.length === 1) return `“${rejected[0].name}” isn't ${kind === "pdf" ? "a PDF" : "an image"}. Pick ${noun} instead.`;
  return `Those files aren't ${kind === "pdf" ? "PDFs" : "images"}. Pick ${noun} instead.`;
}
