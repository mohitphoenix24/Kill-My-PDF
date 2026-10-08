"use client";

import { useCallback, useEffect, useState } from "react";
import { Toaster, useToasts } from "@/components/ui/Toaster";
import { type ToolSlug, getTool } from "@/config/tools";
import { rejectionMessage, splitAccepted } from "@/lib/browser/fileTypes";
import { takeHandoff } from "@/lib/handoff";
import { ToolLanding } from "./ToolLanding";
import { useWindowFileDrop } from "./useWindowFileDrop";
import type { WorkProps } from "./types";
import { WORK_COMPONENTS, preloaders } from "./workComponents";

/**
 * One tool's page. Shows the prerendered start page; once files arrive it swaps in the
 * tool's work screen, and swaps back when the work screen exits.
 */
export function ToolHost({ slug }: { slug: ToolSlug }) {
  const tool = getTool(slug);
  const Work = WORK_COMPONENTS[slug];
  const [session, setSession] = useState<{ files: File[]; id: number } | null>(null);
  const [error, setError] = useState<string | undefined>();
  const { toasts, show, dismiss } = useToasts();

  const start = useCallback(
    (files: File[]) => {
      const { accepted, rejected } = splitAccepted(files, tool.accept);
      if (accepted.length === 0) {
        setError(rejectionMessage(tool.accept, rejected, tool.multiple));
        return;
      }
      if (rejected.length > 0 && tool.multiple) {
        show({ tone: "info", title: `Skipped ${rejected.length} file${rejected.length === 1 ? "" : "s"}`, description: "Only the right kind of file can be added here." });
      }
      setError(undefined);
      setSession({ files: tool.multiple ? accepted : accepted.slice(0, 1), id: Date.now() });
    },
    [tool, show],
  );

  const exit = useCallback((message?: string) => {
    setSession(null);
    setError(message);
  }, []);

  const dragging = useWindowFileDrop(start, !session);

  // A finished PDF from another tool ("Keep going →") opens straight away.
  // (Deferred a tick: the file is only known on the client, after hydration.)
  useEffect(() => {
    const id = window.setTimeout(() => {
      const handoff = takeHandoff();
      if (handoff && tool.accept === "pdf") start([handoff]);
    }, 0);
    return () => window.clearTimeout(id);
  }, [start, tool.accept]);

  // Warm up the work screen once the start page is idle, so choosing a file feels instant.
  useEffect(() => {
    const id = window.setTimeout(() => void preloaders[slug](), 1500);
    return () => window.clearTimeout(id);
  }, [slug]);

  const props: WorkProps | null = session ? { files: session.files, toast: show, onExit: exit } : null;

  return (
    <>
      {props && session ? (
        <Work key={session.id} {...props} />
      ) : (
        <ToolLanding tool={tool} dragging={dragging} error={error} onFiles={start} />
      )}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </>
  );
}

