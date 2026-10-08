import type { ReactNode } from "react";

interface Props {
  main: ReactNode;
  /** Desktop: a fixed panel on the right. */
  sidebar: ReactNode;
  /** Mobile: a bar under the content with the main action always in reach. */
  mobileBar: ReactNode;
}

/** Scrolling content with a settings panel — beside it on desktop, under it on phones. */
export function WorkLayout({ main, sidebar, mobileBar }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">{main}</div>
      <aside className="thin-scroll hidden w-80 shrink-0 overflow-y-auto border-l border-white/[0.06] bg-ink-900/60 lg:block">{sidebar}</aside>
      <div className="shrink-0 border-t border-white/[0.08] bg-ink-900/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">{mobileBar}</div>
    </div>
  );
}

export function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-white/[0.06] px-5 py-5 last:border-b-0">
      <h2 className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500">{title}</h2>
      {children}
    </section>
  );
}

/** "Name your file" input with a fixed .pdf suffix. */
export function NameField({ value, onChange, label = "File name", suffix = ".pdf" }: { value: string; onChange: (v: string) => void; label?: string; suffix?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-ink-400">{label}</span>
      <span className="flex h-11 items-center rounded-xl bg-ink-850 ring-1 ring-inset ring-white/10 focus-within:ring-2 focus-within:ring-volt-400">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          className="min-w-0 flex-1 bg-transparent px-3.5 text-sm text-white outline-none"
        />
        <span className="pr-3.5 font-mono text-xs text-ink-500">{suffix}</span>
      </span>
    </label>
  );
}

/** A row of mutually exclusive options (page size, orientation, …). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label}>
      <p className="mb-1.5 text-xs font-medium text-ink-400">{label}</p>
      <div className="flex rounded-xl bg-ink-850 p-1 ring-1 ring-inset ring-white/10">
        {options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={`h-9 flex-1 rounded-lg px-2 text-[13px] font-medium transition-colors ${
              value === o.value ? "bg-volt-400 text-ink-950" : "text-ink-300 hover:bg-white/[0.06] hover:text-white"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
