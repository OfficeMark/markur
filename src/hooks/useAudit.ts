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
 * progress bar and pin status flip immediately. Rolls back on error.
 */
export function useCreateAuditEvent(floorId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEventInput) => createEvent(input),
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
    onError: (_err, _vars, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.prev);
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: auditKeys.eventsBySession(vars.session_id) });
      // The asset's activity timeline will now have a new entry.
      qc.invalidateQueries({ queryKey: ['audit-log', 'assets', vars.asset_id] });
      // Confirmed events change the floor's pin colors permanently.
      if (vars.outcome === 'confirmed' && floorId) {
        qc.invalidateQueries({ queryKey: auditKeys.latestConfirmedByFloor(floorId) });
      }
    },
  });
}

/**
 * Map<assetId → ISO timestamp of latest CONFIRMED audit_event>. Drives
 * `lastAuditAt` for the asset-status calculation on the floor.
 */
export function useLatestConfirmedByFloor(floorId: string | undefined) {
  return useQuery({
    queryKey: floorId
      ? auditKeys.latestConfirmedByFloor(floorId)
      : ['audit', 'latest-confirmed', 'by-floor', 'none'],
    queryFn: () =>
      floorId ? latestConfirmedAuditByAssetForFloor(floorId) : Promise.resolve(new Map()),
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

