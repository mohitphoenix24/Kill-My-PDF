/** Browser-only file helpers. */

export async function readFileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

export async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url} (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}

const fontFiles = new Map<string, Promise<Uint8Array>>();

/** Loads a bundled substitute font from /public/fonts/dejavu, cached for the session. */
export function loadBundledFont(file: string): Promise<Uint8Array> {
  let pending = fontFiles.get(file);
  if (!pending) {
    pending = fetchBytes(`/fonts/dejavu/${encodeURIComponent(file)}`);
    pending.catch(() => fontFiles.delete(file));
    fontFiles.set(file, pending);
  }
  return pending;
}

export function downloadBytes(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function editedFileName(original: string): string {
  const base = original.replace(/\.pdf$/i, "");
  return `${base}-edited.pdf`;
}
