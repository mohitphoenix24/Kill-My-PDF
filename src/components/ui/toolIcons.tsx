import { Combine, Images, LayoutGrid, Scissors, TextCursorInput, type LucideIcon } from "lucide-react";
import type { ToolSlug } from "@/config/tools";

export const TOOL_ICONS: Record<ToolSlug, LucideIcon> = {
  "edit-pdf": TextCursorInput,
  "merge-pdf": Combine,
  "organize-pdf": LayoutGrid,
  "images-to-pdf": Images,
  "split-pdf": Scissors,
};
