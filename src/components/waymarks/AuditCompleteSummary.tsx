import * as Dialog from '@radix-ui/react-dialog';
import { CheckCircle2, ListChecks, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { MetricCard } from '@/components/ui/MetricCard';
import type { Asset } from '@/types/database';

/**
 * Modal shown when the user taps "End audit" — confirms the totals before
 * we commit completed_at to the session, and surfaces the missed assets so
 * the user can hop back into Audit mode and pick them off.
 */

export type AuditCompleteSummaryProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  total: number;
  audited: number;
  missed: number;
  missedAssets: Asset[];
  onJumpTo: (assetId: string) => void;
  onConfirmEnd: () => void;
  endingBusy: boolean;
};

export function AuditCompleteSummary({
  open,
  onOpenChange,
  total,
  audited,
  missed,
  missedAssets,
  onJumpTo,
  onConfirmEnd,
  endingBusy,
}: AuditCompleteSummaryProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby="audit-summary-description"
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[min(96vw,520px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-black/10 bg-surface text-text shadow-sheet outline-none dark:border-white/10"
        >
          <header className="flex items-start justify-between gap-3 border-b border-black/10 p-4 dark:border-white/10">
            <Dialog.Title asChild>
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
                  Audit complete
                </p>
                <p className="font-semibold text-xl">Review session</p>
              </div>
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                aria-label="Close"
                className="rounded-md p-1 text-text-muted hover:bg-black/5 dark:hover:bg-white/5"
              >
                <X size={16} aria-hidden />
              </button>
            </Dialog.Close>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <p id="audit-summary-description" className="text-sm text-text-muted">
              Confirm to record the session and lock the completion time. You
              can still review missed assets afterwards from the floor view.
            </p>

            <div className="grid grid-cols-3 gap-2">
              <MetricCard label="Total" value={total} />
              <MetricCard
                label="Audited"
                value={audited}
                status={audited === total ? 'success' : 'neutral'}
              />
              <MetricCard
                label="Missed"
                value={missed}
                status={missed > 0 ? 'warning' : 'success'}
              />
            </div>

            {missedAssets.length > 0 && (
              <section className="space-y-1.5">
                <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.18em] text-text-faint">
                  <ListChecks size={12} aria-hidden /> Missed
                </h3>
                <ul className="space-y-1.5">
                  {missedAssets.map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => onJumpTo(a.id)}
                        className="flex w-full items-center justify-between gap-2 rounded-md border border-black/10 bg-surface px-3 py-2 text-left text-xs hover:bg-waymarks-gold-soft dark:border-white/10 dark:hover:bg-white/5"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-medium text-text">{a.name}</span>{' '}
                          <span className="text-text-faint">· {prettyType(a.type)}</span>
                        </span>
                        <span className="text-[11px] text-waymarks-gold">Jump to →</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {missedAssets.length === 0 && audited > 0 && (
              <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success-bg px-3 py-2 text-sm text-success">
                <CheckCircle2 size={14} aria-hidden />
                <span>Every pin on this floor was audited. Nicely done.</span>
              </div>
            )}
          </div>

          <footer className="flex justify-end gap-2 border-t border-black/10 p-3 dark:border-white/10">
            <Dialog.Close asChild>
              <Button size="sm" variant="secondary" disabled={endingBusy}>
                Review floor
              </Button>
            </Dialog.Close>
            <Button
              size="sm"
              variant="gold"
              loading={endingBusy}
              onClick={onConfirmEnd}
              iconLeft={<CheckCircle2 size={12} aria-hidden />}
            >
              End audit
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function prettyType(type: string): string {
  return type
    .split('_')
    .map((p, i) => (i === 0 ? p[0]?.toUpperCase() + p.slice(1) : p))
    .join(' ');
}
