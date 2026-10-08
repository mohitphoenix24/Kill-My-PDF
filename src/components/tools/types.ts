import type { Toast } from "@/components/ui/Toaster";

/** What every tool's work screen receives from its host page. */
export interface WorkProps {
  files: File[];
  toast: (toast: Omit<Toast, "id">) => void;
  /** Leave the work screen (back to the tool's start page), optionally showing an error there. */
  onExit: (error?: string) => void;
}
