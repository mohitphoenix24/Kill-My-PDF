"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}

/** Modal dialog on top of the native <dialog> element (focus trap, Esc to close). */
export function Dialog({ open, title, description, onClose, children, footer, width = "max-w-md" }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`m-auto w-[calc(100vw-2rem)] ${width} rounded-2xl bg-zinc-900 p-0 text-zinc-100 shadow-2xl shadow-black/60 ring-1 ring-white/10 backdrop:bg-black/60 backdrop:backdrop-blur-sm open:animate-dialog-in`}
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white">{title}</h2>
            {description && <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="-mr-2 -mt-1 rounded-lg p-1.5 text-zinc-500 outline-none hover:bg-white/10 hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-indigo-400/60"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        {children && <div className="mt-5">{children}</div>}
      </div>
      {footer && <div className="flex justify-end gap-2 rounded-b-2xl border-t border-white/[0.06] bg-white/[0.02] px-6 py-3.5">{footer}</div>}
    </dialog>
  );
}
