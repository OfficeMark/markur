import { SyncChip } from './SyncChip';
import { usePendingAuditCount } from '@/hooks/useAudit';
import { useOnline } from '@/hooks/useOnline';

/**
 * Header sync indicator wired to live state (M9):
 *
 *   * online + queue 0 → 'synced' (green check)
 *   * online + queue >0 → 'syncing' (info spinner — drain hook is working)
 *   * offline + queue 0 → 'offline' (warning)
 *   * offline + queue >0 → 'queued' (warning + count)
 *
 * The 'conflict' state is reserved for M10's conflict resolver. For now we
 * never emit it.
 */
export function LiveSyncChip() {
  const { online } = useOnline();
  const pending = usePendingAuditCount();

  const state = online
    ? pending > 0
      ? ('syncing' as const)
      : ('synced' as const)
    : pending > 0
      ? ('queued' as const)
      : ('offline' as const);

  return <SyncChip state={state} pendingCount={pending} />;
}
