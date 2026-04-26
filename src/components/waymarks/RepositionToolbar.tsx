import { Check, Move, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * Bottom-of-canvas toolbar that drives the deliberate-reposition flow (M5).
 *
 * Two states:
 *   1) "armed"  — user is in reposition mode but hasn't dragged yet. Show a
 *      banner telling them what to do, with a Cancel button to back out.
 *   2) "pending" — user has dragged, awaiting confirmation. Show before/after
 *      coords with Confirm/Cancel buttons.
 *
 * The spec calls this a toast but it's a confirmation gate (must persist
 * until the user acts), so it renders as a banner pinned to the bottom of
 * the canvas region.
 */

export type RepositionToolbarProps = {
  state: 'armed' | 'pending';
  pending?: {
    from: { x: number; y: number };
    to: { x: number; y: number };
  } | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm?: () => void;
  onDismissPending?: () => void;
};

export function RepositionToolbar({
  state,
  pending,
  busy,
  onCancel,
  onConfirm,
  onDismissPending,
}: RepositionToolbarProps) {
  if (state === 'armed') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-lg border border-waymarks-gold/40 bg-waymarks-gold-soft px-3 py-2 text-sm shadow-sheet dark:bg-white/5"
      >
        <Move size={14} aria-hidden className="text-waymarks-gold" />
        <span className="flex-1 text-waymarks-ink dark:text-white">
          Drag the pin to a new location · or press Esc to cancel
        </span>
        <Button
          size="sm"
          variant="secondary"
          onClick={onCancel}
          iconLeft={<X size={12} aria-hidden />}
        >
          Cancel
        </Button>
      </div>
    );
  }

  // state === 'pending'
  if (!pending) return null;
  const { from, to } = pending;
  return (
    <div
      role="dialog"
      aria-label="Confirm pin move"
      className="pointer-events-auto absolute inset-x-3 bottom-3 flex flex-col gap-2 rounded-lg border border-waymarks-gold/60 bg-surface p-3 text-sm shadow-sheet sm:flex-row sm:items-center"
    >
      <div className="flex flex-1 items-center gap-2">
        <Move size={14} aria-hidden className="text-waymarks-gold" />
        <span>
          Move from <code className="rounded bg-black/5 px-1 dark:bg-white/10">{fmtCoord(from)}</code>{' '}
          to <code className="rounded bg-black/5 px-1 dark:bg-white/10">{fmtCoord(to)}</code>?
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          onClick={onDismissPending}
          disabled={busy}
          iconLeft={<X size={12} aria-hidden />}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          variant="gold"
          onClick={onConfirm}
          loading={busy}
          iconLeft={<Check size={12} aria-hidden />}
        >
          Confirm
        </Button>
      </div>
    </div>
  );
}

function fmtCoord(c: { x: number; y: number }): string {
  return `${(c.x * 100).toFixed(1)}%, ${(c.y * 100).toFixed(1)}%`;
}
