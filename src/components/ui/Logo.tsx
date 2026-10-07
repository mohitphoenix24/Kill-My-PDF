export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#logo-g)" />
      <path d="M20 14h17l9 9v25a2 2 0 0 1-2 2H20a2 2 0 0 1-2-2V16a2 2 0 0 1 2-2z" fill="#fff" opacity=".95" />
      <path d="M37 14v8a1 1 0 0 0 1 1h8" fill="#c7d2fe" />
      <rect x="24" y="31" width="16" height="3" rx="1.5" fill="#4f46e5" />
      <rect x="24" y="38" width="10" height="3" rx="1.5" fill="#a5b4fc" />
      <rect x="36" y="36.5" width="2" height="7" rx="1" fill="#4f46e5" />
    </svg>
  );
}

/** Product name shown in the UI and page title — change it here. */
export const APP_NAME = "PDF Text Editor";
