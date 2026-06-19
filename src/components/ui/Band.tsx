import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * Feature #3d "dynamic" high-contrast section band: a near-black header strip
 * (`band-ink`) with an orange icon chip and a white reversed-out label, over a
 * clean white (`surface`) body. Optional small `hint` on the right of the
 * header. Presentation only. Theme-aware via the band-ink / surface tokens.
 */
export function Band({
  icon: Icon,
  label,
  hint,
  children,
}: {
  icon: LucideIcon;
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-black/10 shadow-sm dark:border-white/10">
      <header className="flex items-center gap-2.5 bg-band-ink px-3 py-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-waymarks-gold text-white">
          <Icon size={16} aria-hidden />
        </span>
        <h3 className="flex-1 text-sm font-bold text-white">{label}</h3>
        {hint != null && <span className="text-[11px] text-white/60">{hint}</span>}
      </header>
      <div className="space-y-3 bg-surface p-4">{children}</div>
    </section>
  );
}
