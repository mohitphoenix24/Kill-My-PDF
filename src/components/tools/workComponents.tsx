"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { ToolSlug } from "@/config/tools";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import type { WorkProps } from "./types";

/**
 * Each tool's work screen is loaded on demand — it pulls in pdf.js / pdf-lib, which the
 * start pages don't need. `preloaders` lets a start page warm the chunk while idle.
 */
const loading = () => <LoadingScreen label="Getting things ready…" />;

export const preloaders: Record<ToolSlug, () => Promise<unknown>> = {
  "edit-pdf": () => import("./edit/EditWork"),
  "merge-pdf": () => import("./merge/MergeWork"),
  "organize-pdf": () => import("./organize/OrganizeWork"),
  "images-to-pdf": () => import("./images/ImagesWork"),
  "split-pdf": () => import("./split/SplitWork"),
};

export const WORK_COMPONENTS: Record<ToolSlug, ComponentType<WorkProps>> = {
  "edit-pdf": dynamic(() => import("./edit/EditWork"), { ssr: false, loading }),
  "merge-pdf": dynamic(() => import("./merge/MergeWork"), { ssr: false, loading }),
  "organize-pdf": dynamic(() => import("./organize/OrganizeWork"), { ssr: false, loading }),
  "images-to-pdf": dynamic(() => import("./images/ImagesWork"), { ssr: false, loading }),
  "split-pdf": dynamic(() => import("./split/SplitWork"), { ssr: false, loading }),
};
