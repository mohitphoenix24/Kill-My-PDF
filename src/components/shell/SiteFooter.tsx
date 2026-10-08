import Link from "next/link";
import { SITE } from "@/config/site";
import { TOOLS } from "@/config/tools";
import { LogoMark, Wordmark } from "@/components/ui/Logo";
import { GithubMark } from "./SiteHeader";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-white/[0.06] bg-ink-950">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <LogoMark className="size-7" />
            <Wordmark />
          </div>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-400">
            Made for people with better things to do than fight a PDF.
          </p>
          {SITE.repoUrl && (
            <a href={SITE.repoUrl} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-2 text-sm text-ink-300 hover:text-white">
              <GithubMark /> Star it on GitHub
            </a>
          )}
        </div>

        <nav aria-label="Tools">
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500">Tools</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {TOOLS.map((tool) => (
              <li key={tool.slug}>
                <Link href={tool.path} className="text-ink-300 hover:text-volt-300">
                  {tool.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500">Under the hood</h2>
          <ul className="mt-4 space-y-2.5 text-sm text-ink-400">
            <li>Runs in your browser</li>
            <li>
              Built with{" "}
              <a href="https://mozilla.github.io/pdf.js/" target="_blank" rel="noopener noreferrer" className="text-ink-300 hover:text-volt-300">
                pdf.js
              </a>{" "}
              &{" "}
              <a href="https://pdf-lib.js.org/" target="_blank" rel="noopener noreferrer" className="text-ink-300 hover:text-volt-300">
                pdf-lib
              </a>
            </li>
            <li>Free. No sign-up. No watermarks.</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
