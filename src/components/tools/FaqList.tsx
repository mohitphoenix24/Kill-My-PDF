import { Plus } from "lucide-react";
import type { Faq } from "@/config/tools";

/** Native <details>, so it works without JavaScript and every answer stays in the HTML for search engines. */
export function FaqList({ items }: { items: readonly Faq[] }) {
  return (
    <div className="divide-y divide-white/[0.07] overflow-hidden rounded-2xl bg-ink-900 ring-1 ring-inset ring-white/[0.07]">
      {items.map(({ q, a }) => (
        <details key={q} className="group px-5 py-4 sm:px-6 sm:py-5 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-[15px] font-medium text-ink-100">
            {q}
            <Plus className="size-4 shrink-0 text-ink-500 transition-transform group-open:rotate-45 group-open:text-volt-400" />
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-ink-400">{a}</p>
        </details>
      ))}
    </div>
  );
}
