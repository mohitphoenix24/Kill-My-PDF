import { SITE } from "@/config/site";

/**
 * The mark: a page that's just been sliced. Electric-lime tile, ink page, one clean cut.
 * Keep in sync with src/app/icon.svg.
 */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d6f857" />
          <stop offset="1" stopColor="#aedb1e" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#logo-g)" />
      <path d="M20 13h17l10 10v26a3 3 0 0 1-3 3H20a3 3 0 0 1-3-3V16a3 3 0 0 1 3-3z" fill="#0d0d0f" />
      <path d="M37 13v7a3 3 0 0 0 3 3h7z" fill="#3a3a41" />
      <path d="M22 43 43 27" stroke="#c6f135" strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  );
}

/** Product name shown in the UI — configured in src/config/site.ts. */
export const APP_NAME = SITE.name;

/** "KillMyPDF" with the PDF picked out in lime. Falls back to plain text for other names. */
export function Wordmark({ className = "" }: { className?: string }) {
  const name: string = SITE.name;
  const split = name.endsWith("PDF") ? name.length - 3 : name.length;
  return (
    <span className={`font-display text-[17px] font-extrabold tracking-[-0.02em] text-white ${className}`}>
      {name.slice(0, split)}
      <span className="text-volt-400">{name.slice(split)}</span>
    </span>
  );
}
