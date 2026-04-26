import { useDrainPendingAuditEvents } from '@/hooks/useAudit';
import { useOnline } from '@/hooks/useOnline';

/**
 * Mount this once inside the QueryClientProvider tree. It listens for
 * online/offline transitions and drains the audit-event write queue when
 * the connection is healthy. Renders nothing.
 */
export function OfflineSync() {
  const { online } = useOnline();
  useDrainPendingAuditEvents(online);
  return null;
}
