"use client";

import dynamic from "next/dynamic";

// pdf.js and pdf-lib need browser APIs, so the editor is never prerendered.
const Editor = dynamic(() => import("./editor/Editor"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-neutral-500">Loading editor…</div>,
});

export function EditorLoader() {
  return <Editor />;
}
