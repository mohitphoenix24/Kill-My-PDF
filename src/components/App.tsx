"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Landing } from "@/components/landing/Landing";
import { Toaster, useToasts } from "@/components/ui/Toaster";

// The workspace pulls in pdf.js and pdf-lib, so it only loads once a PDF is chosen.
const loadWorkspace = () => import("@/components/editor/Workspace");
const Workspace = dynamic(loadWorkspace, {
  ssr: false,
  loading: () => <Landing loadingFile="your PDF" dragging={false} onOpen={() => {}} />,
});

/**
 * App shell. The start screen is prerendered into the static HTML (indexable and
 * instant); the editor workspace replaces it when a file is opened.
 */
export function App() {
  const [active, setActive] = useState<{ file: File; id: number } | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [dragging, setDragging] = useState(false);
  const { toasts, show, dismiss } = useToasts();
  const fileInput = useRef<HTMLInputElement>(null);

  const start = useCallback((file: File) => {
    setError(undefined);
    setActive({ file, id: Date.now() });
  }, []);

  const exit = useCallback((message?: string) => {
    setActive(null);
    setError(message);
  }, []);

  // Warm up the editor chunk once the start screen is idle, so opening feels instant.
  useEffect(() => {
    const id = window.setTimeout(() => void loadWorkspace(), 1500);
    return () => window.clearTimeout(id);
  }, []);

  // Drag and drop on the start screen (the workspace handles its own while open).
  useEffect(() => {
    if (active) return;
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) start(file);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [active, start]);

  return (
    <>
      {active ? (
        <Workspace key={active.id} file={active.file} toast={show} onExit={exit} />
      ) : (
        <>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            aria-label="Choose PDF"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) start(file);
              e.target.value = "";
            }}
          />
          <Landing error={error} dragging={dragging} onOpen={() => fileInput.current?.click()} />
        </>
      )}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
