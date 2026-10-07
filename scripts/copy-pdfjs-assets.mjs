// Copies the pdf.js worker and its runtime data (CMaps, standard fonts, wasm
// decoders) from node_modules into public/, so the browser loads files that
// always match the installed pdfjs-dist version.
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pdfjsRoot = dirname(require.resolve("pdfjs-dist/package.json"));
const target = join(process.cwd(), "public", "pdfjs");

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

cpSync(join(pdfjsRoot, "legacy", "build", "pdf.worker.min.mjs"), join(target, "pdf.worker.min.mjs"));
for (const dir of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  cpSync(join(pdfjsRoot, dir), join(target, dir), { recursive: true });
}

console.log(`pdf.js assets copied to ${target}`);
