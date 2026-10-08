import { Spinner } from "@/components/ui/Button";
import { LogoMark } from "@/components/ui/Logo";

export function LoadingScreen({ label = "Warming up…" }: { label?: string }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-5 bg-ink-950">
      <LogoMark className="size-12" />
      <p className="flex items-center gap-2.5 text-sm text-ink-400">
        <Spinner className="size-4 text-volt-400" />
        {label}
      </p>
    </div>
  );
}
