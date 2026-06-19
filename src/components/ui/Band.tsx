import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A color-banded section (ported from standalone's asset dialog): a Mist header
 * strip with a 4px orange left bar, an icon and a small-caps label, over a body
 * tinted Paper or white. Bodies alternate so adjacent bands stay visually
 * distinct. Presentation only.
 */
export function Band({
  icon: Icon,
  label,
  tone,
  children,
}: {
  icon: LucideIcon;
  label: string;
  tone: 'paper' | 'white';
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
      <header className="relative flex items-center gap-2 bg-band-mist py-2 pl-4 pr-3">
        <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-waymarks-gold" />
        <Icon size={13} className="text-waymarks-gold" aria-hidden />
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          {label}
        </span>
      </header>
      <div className={cn('space-y-3 p-4', tone === 'paper' ? 'bg-band-paper' : 'bg-surface')}>
        {children}
      </div>
    </section>
  );
}
