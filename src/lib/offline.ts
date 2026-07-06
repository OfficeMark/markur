import Dexie, { type EntityTable } from 'dexie';
import type { Asset, Floor, Building, AuditSession } from '@/types/database';

/**
 * Dexie-backed offline cache (M9).
 *
 * Tables:
 *   * `buildings`, `floors`, `assets` — the read cache. Stale-while-revalidate:
 *     UI reads from Dexie immediately, then refreshes from Supabase in the
 *     background. When offline, only Dexie answers.
 *   * `lastAudit` — `{ asset_id, last_at }` records for cycle-aware status.
 *   * `pendingAuditEvents` — the write queue. Drains FIFO when reconnected.
 *   * `meta` — single-row "last sync at" / "last error" diagnostics.
 *
 * We ONLY queue audit_events for now (M9 scope). Asset edits / photos /
 * repositions still require a live connection — they're admin actions that
 * happen at a desk, not in a stairwell. Add to the queue in M10.
 */

export type CachedAsset = Asset;
export type CachedFloor = Floor;
export type CachedBuilding = Building;
export type CachedAuditSession = AuditSession;

export type LastAuditRow = {
  asset_id: string;
  floor_id: string;
  last_at: string;
};

export type PendingAuditEvent = {
  /** Local id — stable across retries. */
  local_id: string;
  session_id: string;
  asset_id: string;
  floor_id: string;
  outcome: 'confirmed' | 'flagged' | 'skipped';
  notes: string | null;
  /** ISO timestamp of when the user took the action. */
  created_at: string;
  /** Number of failed pushes so far. */
  attempts: number;
  /** ISO timestamp of the next allowed retry (exponential backoff). */
  next_attempt_at: string;
  /** Last server error text, if any. */
  last_error: string | null;
};

export type MetaRow = {
  key: 'last-sync' | 'last-error';
  value: string;
};

class OfflineDB extends Dexie {
  buildings!: EntityTable<CachedBuilding, 'id'>;
  floors!: EntityTable<CachedFloor, 'id'>;
  assets!: EntityTable<CachedAsset, 'id'>;
  audit_sessions!: EntityTable<CachedAuditSession, 'id'>;
  last_audit_by_asset!: EntityTable<LastAuditRow, 'asset_id'>;
  pending_audit_events!: EntityTable<PendingAuditEvent, 'local_id'>;
  meta!: EntityTable<MetaRow, 'key'>;

  constructor() {
    super('waymarks-offline');
    this.version(1).stores({
      buildings: 'id',
      floors: 'id, building_id',
      assets: 'id, floor_id',
      audit_sessions: 'id, floor_id, auditor_id',
      last_audit_by_asset: 'asset_id, floor_id',
      pending_audit_events: 'local_id, session_id, asset_id, floor_id, next_attempt_at',
      meta: 'key',
    });
  }
}

export const offlineDB = new OfflineDB();

// =========================================================================
// Read-side helpers
// =========================================================================

export async function putAssetsForFloor(floorId: string, assets: Asset[]): Promise<void> {
  // Replace the floor's snapshot atomically: delete what's no longer there,
  // upsert the rest. We don't try to handle soft-deletes here — anything
  // missing from the Supabase response is treated as gone.
  await offlineDB.transaction('rw', offlineDB.assets, async () => {
    const existing = await offlineDB.assets.where('floor_id').equals(floorId).primaryKeys();
    const fresh = new Set(assets.map((a) => a.id));
    const toDelete = existing.filter((id) => !fresh.has(id));
    if (toDelete.length) await offlineDB.assets.bulkDelete(toDelete);
    if (assets.length) await offlineDB.assets.bulkPut(assets);
  });
}

export async function getAssetsForFloor(floorId: string): Promise<Asset[]> {
  return offlineDB.assets.where('floor_id').equals(floorId).toArray();
}

export async function putFloor(floor: Floor): Promise<void> {
  await offlineDB.floors.put(floor);
}

export async function getFloor(id: string): Promise<Floor | undefined> {
  return offlineDB.floors.get(id);
}

export async function putBuilding(b: Building): Promise<void> {
  await offlineDB.buildings.put(b);
}

export async function getBuilding(id: string): Promise<Building | undefined> {
  return offlineDB.buildings.get(id);
}

export async function putLastAudits(
  floorId: string,
  byAsset: ReadonlyMap<string, string>
): Promise<void> {
  await offlineDB.transaction('rw', offlineDB.last_audit_by_asset, async () => {
    await offlineDB.last_audit_by_asset.where('floor_id').equals(floorId).delete();
    if (byAsset.size === 0) return;
    const rows: LastAuditRow[] = [];
    for (const [asset_id, last_at] of byAsset) {
      rows.push({ asset_id, floor_id: floorId, last_at });
    }
    await offlineDB.last_audit_by_asset.bulkPut(rows);
  });
}

export async function getLastAuditsForFloor(floorId: string): Promise<Map<string, string>> {
  const rows = await offlineDB.last_audit_by_asset.where('floor_id').equals(floorId).toArray();
  const m = new Map<string, string>();
  for (const r of rows) m.set(r.asset_id, r.last_at);
  return m;
}

export async function putAuditSession(s: AuditSession): Promise<void> {
  await offlineDB.audit_sessions.put(s);
}

// =========================================================================
// Write queue helpers
// =========================================================================

function newLocalId(): string {
  // crypto.randomUUID is supported on iOS 15.4+ / Android 12+ / all modern
  // desktop browsers — same baseline we already require for the photo path
  // generator. Falls back to a Date+random if unavailable.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function queueAuditEvent(input: {
  session_id: string;
  asset_id: string;
  floor_id: string;
  outcome: 'confirmed' | 'flagged' | 'skipped';
  notes?: string | null;
}): Promise<PendingAuditEvent> {
  const row: PendingAuditEvent = {
    local_id: newLocalId(),
    session_id: input.session_id,
    asset_id: input.asset_id,
    floor_id: input.floor_id,
    outcome: input.outcome,
    notes: input.notes ?? null,
    created_at: new Date().toISOString(),
    attempts: 0,
    next_attempt_at: new Date().toISOString(),
    last_error: null,
  };
  await offlineDB.pending_audit_events.put(row);
  return row;
}

export async function listPendingAuditEvents(): Promise<PendingAuditEvent[]> {
  // PERF-1 (CODE-REVIEW-2026-07-06): 'created_at' is NOT a Dexie index, so
  // orderBy('created_at') THREW — and the caller's catch(() => []) swallowed
  // it, silently making the offline queue undrainable forever. Sort in JS.
  const rows = await offlineDB.pending_audit_events.toArray();
  return rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function listPendingForSession(sessionId: string): Promise<PendingAuditEvent[]> {
  return offlineDB.pending_audit_events.where('session_id').equals(sessionId).toArray();
}

export async function deletePending(localId: string): Promise<void> {
  await offlineDB.pending_audit_events.delete(localId);
}

export async function markPendingFailed(
  localId: string,
  error: string,
  nextAttemptDelayMs: number
): Promise<void> {
  const row = await offlineDB.pending_audit_events.get(localId);
  if (!row) return;
  await offlineDB.pending_audit_events.put({
    ...row,
    attempts: row.attempts + 1,
    next_attempt_at: new Date(Date.now() + nextAttemptDelayMs).toISOString(),
    last_error: error,
  });
}

export async function pendingCount(): Promise<number> {
  return offlineDB.pending_audit_events.count();
}

export async function setMeta(key: MetaRow['key'], value: string): Promise<void> {
  await offlineDB.meta.put({ key, value });
}

export async function getMeta(key: MetaRow['key']): Promise<string | null> {
  const row = await offlineDB.meta.get(key);
  return row?.value ?? null;
}
