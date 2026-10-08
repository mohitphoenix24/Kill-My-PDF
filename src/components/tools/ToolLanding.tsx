import { ChevronDown } from "lucide-react";
import { type ToolDef, otherTools } from "@/config/tools";
import { SiteFooter } from "@/components/shell/SiteFooter";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { Dropzone } from "./Dropzone";
import { FaqList } from "./FaqList";
import { SectionHeading } from "./SectionHeading";
import { ToolCard } from "./ToolCard";

interface Props {
  tool: ToolDef;
  dragging: boolean;
  busyLabel?: string;
  error?: string;
  onFiles: (files: File[]) => void;
}

/**
 * A tool's start page: the hero fills one screen with the drop zone at its centre, and
 * how-it-works, other tools and the FAQ follow below the fold (all in the static HTML).
 */
export function ToolLanding({ tool, dragging, busyLabel, error, onFiles }: Props) {
  return (
    <div className="thin-scroll relative flex h-dvh flex-col overflow-y-auto overflow-x-hidden bg-ink-950">
      <div aria-hidden className="landing-grid pointer-events-none absolute inset-x-0 top-0 h-dvh" />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-[-22vh] h-[480px] w-[820px] max-w-[160vw] -translate-x-1/2 rounded-full bg-volt-400/[0.12] blur-[130px]" />

      <SiteHeader current={tool.slug} />

      {/* Hero: exactly one screen (minus the header) */}
      <section className="relative flex min-h-[calc(100dvh-3.5rem)] sm:min-h-[calc(100dvh-4rem)] flex-col items-center justify-center px-4 pb-20 pt-8 text-center">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.16em] text-volt-400">{tool.name}</p>
        <h1 className="mt-4 max-w-3xl text-balance font-display text-[34px] font-extrabold leading-[1.05] tracking-[-0.035em] text-white sm:text-5xl lg:text-[56px] [@media(max-height:760px)]:text-4xl">
          {tool.headline} <span className="text-volt-400">{tool.headlineAccent}</span>
        </h1>
        <p className="mt-4 max-w-lg text-pretty text-[15px] leading-relaxed text-ink-400 sm:text-base">{tool.lead}</p>

        <div className="mt-8 flex w-full justify-center [@media(max-height:760px)]:mt-6">
          <Dropzone
            title={tool.dropTitle}
            hint={tool.dropHint}
            accept={tool.accept}
            multiple={tool.multiple}
            dragging={dragging}
            busyLabel={busyLabel}
            error={error}
            onFiles={onFiles}
          />
        </div>

        <ul className="mt-8 flex flex-wrap items-center justify-center gap-2 [@media(max-height:760px)]:mt-6">
          {tool.chips.map((chip) => (
            <li key={chip} className="rounded-full bg-white/[0.04] px-3.5 py-1.5 text-[13px] text-ink-300 ring-1 ring-inset ring-white/[0.08]">
              {chip}
            </li>
          ))}
        </ul>

        <a
          href="#how-it-works"
          className="absolute bottom-5 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 text-xs text-ink-500 transition-colors hover:text-ink-200 [@media(max-height:680px)]:hidden"
        >
          How it works
          <ChevronDown className="size-4 animate-bounce" />
        </a>
      </section>

      <section id="how-it-works" className="relative mx-auto w-full max-w-5xl scroll-mt-4 px-4 py-20 sm:px-6 sm:py-24">
        <SectionHeading eyebrow="How it works" title="Three steps. No manual." />
        <ol className="mt-12 grid gap-4 sm:grid-cols-3">
          {tool.steps.map((step, i) => (
            <li key={step.title} className="relative rounded-2xl bg-ink-900 p-6 ring-1 ring-inset ring-white/[0.07]">
              <span className="font-display text-5xl font-extrabold leading-none text-volt-400/25">{i + 1}</span>
              <h3 className="mt-4 font-display text-lg font-bold text-white">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-400">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="relative mx-auto w-full max-w-5xl px-4 pb-20 sm:px-6 sm:pb-24">
        <SectionHeading eyebrow="More tools" title="While you're here" />
        <div className="mt-12 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {otherTools(tool.slug).map((other) => (
            <ToolCard key={other.slug} tool={other} compact />
          ))}
        </div>
      </section>

      <section id="faq" className="relative mx-auto w-full max-w-3xl scroll-mt-4 px-4 pb-24 sm:px-6 sm:pb-28">
        <SectionHeading eyebrow="FAQ" title="Questions, answered." />
        <div className="mt-12">
          <FaqList items={tool.faq} />
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
