// Tiny static server for the exported site (`out/`), shared by the e2e and capture scripts.
import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const types = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".json": "application/json", ".wasm": "application/wasm", ".pdf": "application/pdf", ".ttf": "font/ttf",
  ".png": "image/png", ".txt": "text/plain", ".xml": "application/xml", ".webmanifest": "application/manifest+json",
};

export function serveOut(root = process.cwd()) {
  const outDir = join(root, "out");
  const server = createServer((req, res) => {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = normalize(join(outDir, path));
    try {
      if (!file.startsWith(outDir) || !statSync(file).isFile()) throw new Error();
      res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
      res.end(readFileSync(file));
    } catch {
      res.writeHead(404).end("not found");
    }
  }).listen(0);
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}
