import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  endSession,
  getActiveSessionForFloor,
  getSession,
  listActiveSessionsForUser,
  startSession,
  type ActiveSessionWithLabels,
  type EndSessionInput,
  type StartSessionInput,
} from '@/lib/queries/audit-sessions';
import {
  createEvent,
  latestConfirmedAuditByAssetForFloor,
  listEventsForSession,
  type CreateEventInput,
} from '@/lib/queries/audit-events';
import {
  deletePending,
  getLastAuditsForFloor,
  listPendingAuditEvents,
  listPendingForSession,
  markPendingFailed,
  pendingCount,
  putLastAudits,
  queueAuditEvent,
  type PendingAuditEvent,
} from '@/lib/offline';
import { useEffect, useState } from 'react';
import type { AuditEvent, AuditSession } from '@/types/database';

/**
 * Audit walkaround hooks (M6).
 *
 * Convention:
 *  - Sessions are scoped (floor, auditor); the partial unique index in
 *    migration 0012 enforces only-one-open-per-pair.
 *  - Events are inserted with optimistic patches so the progress bar advances
 *    without waiting for the round trip — critical on flaky building Wi-Fi.
 */

export const auditKeys = {
  all: ['audit'] as const,
  activeForFloor: (floorId: string, userId: string) =>
    [...auditKeys.all, 'active', floorId, userId] as const,
  session: (id: string) => [...auditKeys.all, 'session', id] as const,
  eventsBySession: (sessionId: string) =>
    [...auditKeys.all, 'events', 'by-session', sessionId] as const,
  latestConfirmedByFloor: (floorId: string) =>
    [...auditKeys.all, 'latest-confirmed', 'by-floor', floorId] as const,
  activeForUser: (userId: string, buildingId: string | null) =>
    [...auditKeys.all, 'active', 'for-user', userId, buildingId ?? 'all'] as const,
};

export function useActiveAuditSession(floorId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey:
      floorId && userId
        ? auditKeys.activeForFloor(floorId, userId)
        : ['audit', 'active', 'none'],
    queryFn: () =>
      floorId && userId ? getActiveSessionForFloor(floorId, userId) : Promise.resolve(null),
    enabled: !!floorId && !!userId,
  });
}

export function useAuditSession(sessionId: string | undefined) {
  return useQuery({
    queryKey: sessionId ? auditKeys.session(sessionId) : ['audit', 'session', 'none'],
    queryFn: () => (sessionId ? getSession(sessionId) : Promise.resolve(null)),
    enabled: !!sessionId,
  });
}

export function useStartAudit(floorId: string | undefined, userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StartSessionInput) => startSession(input),
    onSuccess: (session) => {
      if (floorId && userId) {
        qc.setQueryData(auditKeys.activeForFloor(floorId, userId), session);
      }
      qc.setQueryData(auditKeys.session(session.id), session);
    },
  });
}

export function useEndAudit(floorId: string | undefined, userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EndSessionInput) => endSession(input),
    onSuccess: (session) => {
      qc.setQueryData(auditKeys.session(session.id), session);
      // Active query should now return null.
      if (floorId && userId) {
        qc.setQueryData(auditKeys.activeForFloor(floorId, userId), null);
      }
      // Refresh latest-confirmed cache so the floor pin colors update.
      qc.invalidateQueries({
        queryKey: floorId ? auditKeys.latestConfirmedByFloor(floorId) : auditKeys.all,
      });
    },
  });
}

export function useAuditEvents(sessionId: string | undefined) {
  return useQuery({
    queryKey: sessionId
      ? auditKeys.eventsBySession(sessionId)
      : ['audit', 'events', 'by-session', 'none'],
    queryFn: () => (sessionId ? listEventsForSession(sessionId) : Promise.resolve([])),
    enabled: !!sessionId,
  });
}

/**
 * Optimistically appends the new event to the session's events cache so the
 * progress bar and pin status flip immediately, AND queues the write to
 * Dexie if the network call fails (offline mid-stairwell). The drain hook
 * (`useDrainPendingAuditEvents`) replays the queue when the user returns
 * online.
 */
export function useCreateAuditEvent(floorId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateEventInput) => {
      try {
        return await createEvent(input);
      } catch (err) {
        // Queue and treat as success — the user shouldn't be blocked because
        // their phone lost LTE in a basement.
        await queueAuditEvent({
          session_id: input.session_id,
          asset_id: input.asset_id,
          floor_id: floorId ?? '',
          outcome: input.outcome,
          notes: input.notes ?? null,
        });
        // Re-throw so onError fires? No — we return a synthetic event so the
        // optimistic patch sticks and the UI doesn't roll back.
        const synthetic: AuditEvent = {
          id: crypto.randomUUID(),
          asset_id: input.asset_id,
          session_id: input.session_id,
          outcome: input.outcome,
          notes: input.notes ?? null,
          photo_url: null,
          created_at: new Date().toISOString(),
        };
        // Also: surface the failure as a meta entry the SyncChip can show.
        void (async () => {
          const { setMeta } = await import('@/lib/offline');
          await setMeta('last-error', err instanceof Error ? err.message : String(err));
        })();
        return synthetic;
      }
    },
    onMutate: async (input) => {
      const key = auditKeys.eventsBySession(input.session_id);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<AuditEvent[]>(key);
      const provisional: AuditEvent = {
        id: crypto.randomUUID(),
        asset_id: input.asset_id,
        session_id: input.session_id,
        outcome: input.outcome,
        notes: input.notes ?? null,
        photo_url: null,
        created_at: new Date().toISOString(),
      };
      qc.setQueryData<AuditEvent[]>(key, [...(prev ?? []), provisional]);
      return { key, prev };
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: auditKeys.eventsBySession(vars.session_id) });
      qc.invalidateQueries({ queryKey: ['audit-log', 'assets', vars.asset_id] });
      if (vars.outcome === 'confirmed' && floorId) {
        qc.invalidateQueries({ queryKey: auditKeys.latestConfirmedByFloor(floorId) });
      }
      // Pending count powers SyncChip; bump the surface even on success so
      // the chip can recompute (cheap query).
      qc.invalidateQueries({ queryKey: ['audit', 'pending-count'] });
    },
  });
}

/**
 * Polls the Dexie pending count for the SyncChip. Cheap because Dexie
 * answers in <1ms.
 */
export function usePendingAuditCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let mounted = true;
    function refresh() {
      void pendingCount().then((n) => {
        if (mounted) setCount(n);
      });
    }
    refresh();
    const t = window.setInterval(refresh, 2_000);
    function onStorage() {
      refresh();
    }
    window.addEventListener('storage', onStorage);
    return () => {
      mounted = false;
      window.clearInterval(t);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return count;
}

/**
 * Drains the audit-event write queue. Mount once at app root (or in
 * AuditModeShell) to keep the queue warm and replay events FIFO when
 * the network returns. Exponential backoff caps at ~10 minutes.
 */
export function useDrainPendingAuditEvents(online: boolean): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    let timer: number | undefined;

    async function drain() {
      if (cancelled) return;
      const queue: PendingAuditEvent[] = await listPendingAuditEvents().catch(() => []);
      const now = Date.now();
      const eligible = queue.filter((e) => new Date(e.next_attempt_at).getTime() <= now);
      for (const e of eligible) {
        if (cancelled) return;
        try {
          // M12: pin the original queue time as created_at. Without this,
          // an event queued at 09:00 and drained at 11:00 gets stamped
          // 11:00, which scrambles the audit trail when devices drain
          // out of order.
          await createEvent({
            session_id: e.session_id,
            asset_id: e.asset_id,
            outcome: e.outcome,
            notes: e.notes,
            created_at: e.created_at,
          });
          await deletePending(e.local_id);
          // Refresh the visible session's events.
          qc.invalidateQueries({ queryKey: auditKeys.eventsBySession(e.session_id) });
          if (e.outcome === 'confirmed') {
            qc.invalidateQueries({
              queryKey: auditKeys.latestConfirmedByFloor(e.floor_id),
            });
          }
        } catch (err) {
          const next = Math.min(10 * 60_000, 2 ** Math.min(8, e.attempts) * 1_000);
          await markPendingFailed(
            e.local_id,
            err instanceof Error ? err.message : String(err),
            next
          ).catch(() => undefined);
          // If one fails, stop draining for this pass — likely systemic.
          break;
        }
      }
      qc.invalidateQueries({ queryKey: ['audit', 'pending-count'] });
      // PERF-8: re-poll fast only while the queue is non-empty; an idle queue
      // re-checks lazily so the app isn't spinning a 5s loop forever.
      timer = window.setTimeout(drain, queue.length > 0 ? 5_000 : 30_000);
    }
    void drain();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [online, qc]);
}

/**
 * Pending events for a session, used by AuditModeShell to merge them into
 * the visible event list (so the user sees the +1 immediately even when
 * offline).
 */
export function useSessionPendingEvents(sessionId: string | undefined): PendingAuditEvent[] {
  const [rows, setRows] = useState<PendingAuditEvent[]>([]);
  useEffect(() => {
    if (!sessionId) {
      setRows([]);
      return;
    }
    const sid = sessionId;
    let mounted = true;
    function refresh() {
      void listPendingForSession(sid).then((r) => {
        if (mounted) setRows(r);
      });
    }
    refresh();
    const t = window.setInterval(refresh, 2_000);
    return () => {
      mounted = false;
      window.clearInterval(t);
    };
  }, [sessionId]);
  return rows;
}

/**
 * Map<assetId → ISO timestamp of latest CONFIRMED audit_event>. Drives
 * `lastAuditAt` for the asset-status calculation on the floor. M9 layered
 * stale-while-revalidate on top: writes back to Dexie on success, falls
 * back to the cache offline.
 */
export function useLatestConfirmedByFloor(floorId: string | undefined) {
  return useQuery<Map<string, string>>({
    queryKey: floorId
      ? auditKeys.latestConfirmedByFloor(floorId)
      : ['audit', 'latest-confirmed', 'by-floor', 'none'],
    queryFn: async () => {
      if (!floorId) return new Map<string, string>();
      try {
        const fresh = await latestConfirmedAuditByAssetForFloor(floorId);
        void putLastAudits(floorId, fresh).catch(() => undefined);
        return fresh;
      } catch (err) {
        const cached = await getLastAuditsForFloor(floorId).catch(
          () => new Map<string, string>()
        );
        if (cached.size) return cached;
        throw err;
      }
    },
    enabled: !!floorId,
  });
}

/**
 * Convenience: progress derived from a session's events. Counts each asset
 * once even if it was visited twice (re-confirmation), per spec § Validation.
 */
export function summarizeSession(
  events: AuditEvent[]
): { auditedAssetIds: Set<string>; lastByAsset: Map<string, AuditEvent> } {
  const lastByAsset = new Map<string, AuditEvent>();
  for (const e of events) {
    lastByAsset.set(e.asset_id, e);
  }
  const auditedAssetIds = new Set<string>();
  for (const [assetId, e] of lastByAsset) {
    // 'skipped' counts as visited but not audited.
    if (e.outcome !== 'skipped') auditedAssetIds.add(assetId);
  }
  return { auditedAssetIds, lastByAsset };
}

export type AuditEventInput = CreateEventInput;
export type AuditSessionType = AuditSession;
/**
 * Any open audit sessions for the signed-in user, optionally constrained
 * to a single building. Drives the Home / Building "Resume audit" banner.
 */
export function useActiveAuditSessionsForUser(
  userId: string | undefined,
  buildingId?: string
): { data: ActiveSessionWithLabels[] | undefined; isLoading: boolean } {
  return useQuery({
    queryKey: userId
      ? auditKeys.activeForUser(userId, buildingId ?? null)
      : ['audit', 'active', 'for-user', 'none'],
    queryFn: () =>
      userId ? listActiveSessionsForUser(userId, buildingId) : Promise.resolve([]),
    enabled: !!userId,
  });
}

