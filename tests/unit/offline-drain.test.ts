// PERF-1 regression test: the offline audit queue must be listable (the old
// orderBy('created_at') threw on the non-indexed key and the caller's
// catch(() => []) swallowed it — the queue silently never drained).
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  listPendingAuditEvents,
  offlineDB,
  queueAuditEvent,
} from '@/lib/offline';

describe('offline audit queue (PERF-1 regression)', () => {
  beforeEach(async () => {
    await offlineDB.pending_audit_events.clear();
  });

  it('lists queued events oldest-first instead of throwing', async () => {
    const base = { session_id: 's1', asset_id: 'a1', floor_id: 'f1' } as const;
    const first = await queueAuditEvent({ ...base, outcome: 'confirmed' });
    // Force distinct, out-of-insert-order timestamps.
    await offlineDB.pending_audit_events.update(first.local_id, {
      created_at: '2026-07-06T10:00:00.000Z',
    });
    const second = await queueAuditEvent({ ...base, asset_id: 'a2', outcome: 'skipped' });
    await offlineDB.pending_audit_events.update(second.local_id, {
      created_at: '2026-07-06T09:00:00.000Z',
    });

    const rows = await listPendingAuditEvents();
    expect(rows).toHaveLength(2);
    // FIFO by created_at: the 09:00 event drains before the 10:00 one.
    expect(rows[0]?.asset_id).toBe('a2');
    expect(rows[1]?.asset_id).toBe('a1');
  });

  it('returns an empty array (not an error) for an empty queue', async () => {
    await expect(listPendingAuditEvents()).resolves.toEqual([]);
  });
});
