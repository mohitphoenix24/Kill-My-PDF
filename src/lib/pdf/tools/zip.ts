import { zipSync } from "fflate";

export interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

/** Makes names unique within the archive: "a.pdf", "a (2).pdf", … */
export function uniqueNames(names: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    if (count === 1) return name;
    const dot = name.lastIndexOf(".");
    return dot > 0 ? `${name.slice(0, dot)} (${count})${name.slice(dot)}` : `${name} (${count})`;
  });
}

/** PDFs are already compressed, so entries are stored (level 0) — quick and no bigger. */
export function zipFiles(entries: readonly ZipEntry[]): Uint8Array {
  const names = uniqueNames(entries.map((e) => e.name));
  const files: Record<string, Uint8Array> = {};
  entries.forEach((entry, i) => {
    files[names[i]] = entry.bytes;
  });
  return zipSync(files, { level: 0 });
}
