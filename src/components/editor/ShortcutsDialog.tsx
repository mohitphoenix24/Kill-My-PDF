"use client";

import { Dialog } from "@/components/ui/Dialog";
import { Kbd } from "@/components/ui/Button";

export function ShortcutsDialog({ open, modKey, onClose }: { open: boolean; modKey: string; onClose: () => void }) {
  const groups: Array<[string, Array<[string, string[]]>]> = [
    [
      "Editing",
      [
        ["Edit selected text", ["Enter"]],
        ["Finish typing", ["Enter"]],
        ["Cancel typing", ["Esc"]],
        ["Move selected text", ["←", "↑", "→", "↓"]],
        ["Move faster", ["⇧", "Arrow"]],
        ["Remove selected text", ["Delete"]],
        ["Deselect", ["Esc"]],
      ],
    ],
    [
      "History & file",
      [
        ["Undo", [modKey, "Z"]],
        ["Redo", [modKey, "⇧", "Z"]],
        ["Download PDF", [modKey, "S"]],
        ["Open PDF", [modKey, "O"]],
      ],
    ],
    [
      "View",
      [
        ["Zoom in / out", [modKey, "+ / −"]],
        ["Fit width", [modKey, "0"]],
        ["Show shortcuts", ["?"]],
      ],
    ],
  ];
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts" width="max-w-lg">
      <div className="grid gap-5 sm:grid-cols-2">
        {groups.map(([title, items]) => (
          <div key={title} className={title === "Editing" ? "sm:row-span-2" : ""}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">{title}</h3>
            <ul className="space-y-2">
              {items.map(([label, keys]) => (
                <li key={label} className="flex items-center justify-between gap-3 text-[13px] text-ink-300">
                  <span>{label}</span>
                  <span className="flex shrink-0 gap-1">
                    {keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
