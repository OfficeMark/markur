import { Check, CloudOff, Loader2, AlertTriangle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SyncState = 'synced' | 'syncing' | 'offline' | 'queued' | 'conflict';

export type SyncChipProps = {
  state?: SyncState;
  pendingCount?: number;
  conflictCount?: number;
  onClick?: () => void;
};

type Visual = {
  icon: typeof Check;
  label: string;
  className: string;
  spin?: boolean;
};

const VISUALS: Record<SyncState, Visual> = {
  synced: {
    icon: Check,
    label: 'Synced',
    className: 'border-success/30 bg-success-bg text-success',
  },
  syncing: {
    icon: Loader2,
    label: 'Syncing',
    className: 'border-info/30 bg-info-bg text-info',
    spin: true,
  },
  offline: {
    icon: CloudOff,
    label: 'Offline',
    className: 'border-warning/30 bg-warning-bg text-warning',
  },
  queued: {
    icon: Clock,
    label: 'Queued',
    className: 'border-warning/30 bg-warning-bg text-warning',
  },
  conflict: {
    icon: AlertTriangle,
    label: 'Conflict',
    className: 'border-danger/30 bg-danger-bg text-danger',
  },
};

/**
 * Header sync indicator. The full state machine (with pending writes panel,
 * conflict counter, etc.) lands in M9. For M1 this is a static "Synced" pill —
 * enough for the header to feel populated.
 */
export function SyncChip({
  state = 'synced',
  pendingCount = 0,
  conflictCount = 0,
  onClick,
}: SyncChipProps) {
  const v = VISUALS[state];
  const Icon = v.icon;
  const showCount =
    (state === 'queued' || state === 'syncing') && pendingCount > 0
      ? pendingCount
      : state === 'conflict' && conflictCount > 0
        ? conflictCount
        : null;

  const interactive = !!onClick;
  const Tag = interactive ? 'button' : 'span';

  return (
    <Tag
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      aria-label={`Sync state: ${v.label}${showCount ? `, ${showCount} pending` : ''}`}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium',
        v.className,
        interactive && 'cursor-pointer transition-colors hover:bg-black/5'
      )}
    >
      <Icon size={12} className={v.spin ? 'animate-spin' : ''} aria-hidden />
      {/* Mobile: icon-only to keep the AppShell header inside a 375-414px
          viewport. The icon + colour already encode the state (green check
          synced, yellow cloud-off offline, etc.), and the pending-count
          badge below still renders when there's actionable info. aria-label
          carries the full state name for SR users. */}
      <span className="hidden sm:inline">{v.label}</span>
      {showCount !== null && (
        <span className="rounded-full bg-black/10 px-1.5 text-[10px] tabular-nums dark:bg-white/10">
          {showCount}
        </span>
      )}
    </Tag>
  );
}
