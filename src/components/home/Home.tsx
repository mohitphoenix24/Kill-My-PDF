import { CircleCheckBig, Sparkles, Zap } from "lucide-react";
import { SITE } from "@/config/site";
import { HOME_FAQ, TOOLS } from "@/config/tools";
import { SiteFooter } from "@/components/shell/SiteFooter";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { FaqList } from "@/components/tools/FaqList";
import { SectionHeading } from "@/components/tools/SectionHeading";
import { ToolCard } from "@/components/tools/ToolCard";

const PERKS = [
  { icon: CircleCheckBig, title: "Looks the same after", text: "We move the PDF's own pages, fonts and images around — nothing gets flattened into a blurry picture." },
  { icon: Zap, title: "Stupid fast", text: "No uploading, no waiting in a queue. Things happen the moment you click." },
  { icon: Sparkles, title: "No strings", text: "Free. No account, no watermark, no “upgrade to download”." },
];

export function Home() {
  return (
    <div className="thin-scroll relative flex h-dvh flex-col overflow-y-auto overflow-x-hidden bg-ink-950">
      <div aria-hidden className="landing-grid pointer-events-none absolute inset-x-0 top-0 h-dvh" />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-[-26vh] h-[520px] w-[900px] max-w-[170vw] -translate-x-1/2 rounded-full bg-volt-400/[0.13] blur-[130px]" />

      <SiteHeader />

      <section className="relative mx-auto flex w-full max-w-6xl flex-col items-center px-4 pb-16 pt-12 text-center sm:px-6 sm:pt-16 [@media(max-height:760px)]:pt-8">
        <p className="animate-rise inline-flex items-center gap-2 rounded-full bg-white/[0.04] px-3.5 py-1.5 font-mono text-xs text-ink-300 ring-1 ring-inset ring-white/[0.08]">
          <span className="size-1.5 rounded-full bg-volt-400 shadow-[0_0_10px_2px_rgb(198_241_53/0.6)]" />
          free · no sign-up · no watermarks
        </p>
        <h1 className="animate-rise mt-5 max-w-4xl text-balance font-display text-[40px] font-extrabold leading-[1.02] tracking-[-0.04em] text-white [animation-delay:60ms] sm:text-6xl lg:text-7xl [@media(max-height:760px)]:text-5xl">
          Kill the PDF hassle. <span className="text-volt-400">Get on with your day.</span>
        </h1>
        <p className="animate-rise mt-5 max-w-xl text-pretty text-base leading-relaxed text-ink-400 [animation-delay:120ms] sm:text-lg">
          Edit text, merge files, shuffle pages, turn photos into PDFs. Pick a tool and you&apos;re done in seconds — right here in your browser.
        </p>

        <div className="mt-10 grid w-full gap-3 text-left sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 [@media(max-height:760px)]:mt-8">
          {TOOLS.map((tool, i) => (
            <div key={tool.slug} className="animate-rise" style={{ animationDelay: `${160 + i * 50}ms` }}>
              <ToolCard tool={tool} />
            </div>
          ))}
          <div
            className="animate-rise flex flex-col justify-between rounded-2xl border border-dashed border-white/10 p-5 sm:p-6"
            style={{ animationDelay: `${160 + TOOLS.length * 50}ms` }}
          >
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-500">Cooking</p>
            <div className="mt-4">
              <h3 className="font-display text-xl font-bold tracking-tight text-ink-200">More tools on the way</h3>
              <p className="mt-1 text-sm text-ink-500">Compress, sign, protect, convert…</p>
              {SITE.repoUrl && (
                <a href={`${SITE.repoUrl}/issues`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-medium text-volt-300 hover:text-volt-200">
                  Ask for one →
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6 sm:pb-24">
        <ul className="grid gap-4 sm:grid-cols-3">
          {PERKS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-2xl bg-ink-900 p-6 ring-1 ring-inset ring-white/[0.07]">
              <Icon className="size-5 text-volt-400" />
              <h3 className="mt-4 font-display text-lg font-bold text-white">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-400">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="faq" className="relative mx-auto w-full max-w-3xl scroll-mt-4 px-4 pb-24 sm:px-6 sm:pb-28">
        <SectionHeading eyebrow="FAQ" title="The usual questions." />
        <div className="mt-12">
          <FaqList items={HOME_FAQ} />
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
