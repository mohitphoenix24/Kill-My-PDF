export function SectionHeading({ eyebrow, title, className = "" }: { eyebrow: string; title: string; className?: string }) {
  return (
    <div className={`text-center ${className}`}>
      <p className="font-mono text-xs font-medium uppercase tracking-[0.16em] text-volt-400">{eyebrow}</p>
      <h2 className="mt-3 text-balance font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">{title}</h2>
    </div>
  );
}
