"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";

export type ToastTone = "success" | "error" | "info";

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

const DURATION_MS = { success: 5000, info: 4000, error: 9000 };

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback((toast: Omit<Toast, "id">) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-2), { ...toast, id }]);
    return id;
  }, []);
  return { toasts, show, dismiss };
}

const icons = {
  success: <CircleCheck className="size-5 text-emerald-400" />,
  error: <CircleAlert className="size-5 text-red-400" />,
  info: <Info className="size-5 text-indigo-400" />,
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), DURATION_MS[toast.tone]);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);
  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      className="animate-toast-in pointer-events-auto flex w-full items-start gap-3 rounded-xl bg-zinc-900/95 p-3.5 shadow-2xl shadow-black/50 ring-1 ring-white/10 backdrop-blur sm:w-[380px]"
    >
      <span className="mt-px">{icons[toast.tone]}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-100">{toast.title}</p>
        {toast.description && <p className="mt-0.5 text-[13px] leading-snug text-zinc-400">{toast.description}</p>}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="rounded-md p-0.5 text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
        aria-label="Dismiss"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

export function Toaster({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-3 top-3 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:top-auto">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
