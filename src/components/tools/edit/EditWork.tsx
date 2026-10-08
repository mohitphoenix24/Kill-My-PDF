"use client";

import Workspace from "@/components/editor/Workspace";
import type { WorkProps } from "../types";

/** The text editor takes one PDF. */
export default function EditWork({ files, toast, onExit }: WorkProps) {
  return <Workspace file={files[0]} toast={toast} onExit={onExit} />;
}
