import { forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-volt-400 font-semibold text-ink-950 shadow-[0_8px_24px_-10px_rgb(198_241_53/0.55)] hover:bg-volt-300 active:bg-volt-500 disabled:bg-white/[0.08] disabled:text-ink-500 disabled:shadow-none",
  secondary:
    "bg-white/[0.06] text-ink-100 ring-1 ring-inset ring-white/10 hover:bg-white/10 active:bg-white/[0.14] disabled:text-ink-500 disabled:hover:bg-white/[0.06]",
  ghost: "text-ink-300 hover:bg-white/[0.07] hover:text-white active:bg-white/10 disabled:text-ink-600 disabled:hover:bg-transparent",
  danger: "text-coral-400 hover:bg-coral-500/10 active:bg-coral-500/15 disabled:text-coral-400/40",
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
      className={`inline-flex shrink-0 items-center justify-center rounded-lg font-medium transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt-400 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
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
        className={`inline-flex size-8 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-volt-400 disabled:cursor-not-allowed disabled:text-ink-700 disabled:hover:bg-transparent pointer-coarse:size-11 ${active ? "bg-white/10 text-white" : ""} ${className}`}
        {...props}
      >
        {children}
      </button>
      <Tooltip side={tooltipSide}>
        {label}
        {shortcut && <kbd className="ml-1.5 font-sans text-ink-500">{shortcut}</kbd>}
      </Tooltip>
    </span>
  );
}

export function Tooltip({ children, side = "bottom" }: { children: React.ReactNode; side?: "top" | "bottom" }) {
  return (
    <span
      role="tooltip"
      className={`pointer-events-none absolute left-1/2 z-50 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ink-800 px-2 py-1 text-xs font-medium text-ink-100 opacity-0 shadow-lg ring-1 ring-white/10 transition-opacity group-hover/tip:opacity-100 group-hover/tip:delay-300 [@media(hover:hover)]:block ${side === "bottom" ? "top-full mt-1.5" : "bottom-full mb-1.5"}`}
    >
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-white/10 bg-white/[0.06] px-1 font-sans text-[11px] font-medium text-ink-300">
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
