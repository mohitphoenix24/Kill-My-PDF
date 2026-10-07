import { forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-indigo-500 text-white shadow-[0_0_0_1px_rgb(255_255_255/0.08)_inset,0_8px_24px_-8px_rgb(99_102_241/0.7)] hover:bg-indigo-400 active:bg-indigo-600 disabled:bg-indigo-500/30 disabled:text-white/40 disabled:shadow-none",
  secondary:
    "bg-white/[0.06] text-zinc-100 ring-1 ring-inset ring-white/10 hover:bg-white/10 active:bg-white/[0.14] disabled:text-zinc-500 disabled:hover:bg-white/[0.06]",
  ghost: "text-zinc-300 hover:bg-white/[0.07] hover:text-white active:bg-white/10 disabled:text-zinc-600 disabled:hover:bg-transparent",
  danger: "text-red-400 hover:bg-red-500/10 active:bg-red-500/15 disabled:text-red-400/40",
};

const sizes: Record<Size, string> = {
  sm: "h-8 gap-1.5 px-3 text-[13px]",
  md: "h-9 gap-2 px-3.5 text-sm",
  lg: "h-11 gap-2 px-6 text-[15px]",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className = "", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`inline-flex shrink-0 items-center justify-center rounded-lg font-medium transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
});

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name, also shown as a tooltip. */
  label: string;
  shortcut?: string;
  active?: boolean;
  tooltipSide?: "top" | "bottom";
}

/** Square icon button with a styled tooltip (tooltips are hidden on touch screens). */
export function IconButton({ label, shortcut, active, tooltipSide = "bottom", className = "", children, ...props }: IconButtonProps) {
  return (
    <span className="group/tip relative inline-flex">
      <button
        aria-label={label}
        className={`inline-flex size-9 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-400 disabled:cursor-not-allowed disabled:text-zinc-700 disabled:hover:bg-transparent sm:size-8 ${active ? "bg-white/10 text-white" : ""} ${className}`}
        {...props}
      >
        {children}
      </button>
      <Tooltip side={tooltipSide}>
        {label}
        {shortcut && <kbd className="ml-1.5 font-sans text-zinc-500">{shortcut}</kbd>}
      </Tooltip>
    </span>
  );
}

export function Tooltip({ children, side = "bottom" }: { children: React.ReactNode; side?: "top" | "bottom" }) {
  return (
    <span
      role="tooltip"
      className={`pointer-events-none absolute left-1/2 z-50 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-800 px-2 py-1 text-xs font-medium text-zinc-100 opacity-0 shadow-lg ring-1 ring-white/10 transition-opacity group-hover/tip:opacity-100 group-hover/tip:delay-300 [@media(hover:hover)]:block ${side === "bottom" ? "top-full mt-1.5" : "bottom-full mb-1.5"}`}
    >
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-white/10 bg-white/[0.06] px-1 font-sans text-[11px] font-medium text-zinc-300">
      {children}
    </kbd>
  );
}

export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
