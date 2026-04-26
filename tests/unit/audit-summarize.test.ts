import { describe, expect, it } from 'vitest';
import { summarizeSession } from '@/hooks/useAudit';
import type { AuditEvent } from '@/types/database';

function ev(asset_id: string, outcome: 'confirmed' | 'flagged' | 'skipped', t = 0): AuditEvent {
  return {
    id: `e-${asset_id}-${t}`,
    session_id: 's-1',
    asset_id,
    outcome,
    photo_url: null,
    notes: null,
    created_at: new Date(2026, 3, 26, 10, t).toISOString(),
  };
}

describe('summarizeSession', () => {
  it('treats each asset as audited at most once', () => {
    const { auditedAssetIds } = summarizeSession([
      ev('a-1', 'confirmed', 1),
      ev('a-1', 'confirmed', 2), // re-confirm doesn't double-count
    ]);
    expect(auditedAssetIds.size).toBe(1);
    expect(auditedAssetIds.has('a-1')).toBe(true);
  });

  it('skipped does not count as audited', () => {
    const { auditedAssetIds } = summarizeSession([
      ev('a-1', 'skipped', 1),
      ev('a-2', 'confirmed', 2),
    ]);
    expect(auditedAssetIds.has('a-1')).toBe(false);
    expect(auditedAssetIds.has('a-2')).toBe(true);
  });

  it('flagged counts as audited (the asset has been visited and acted on)', () => {
    const { auditedAssetIds } = summarizeSession([ev('a-3', 'flagged', 1)]);
    expect(auditedAssetIds.has('a-3')).toBe(true);
  });

  it('the last event wins when an asset has multiple outcomes', () => {
    const { auditedAssetIds, lastByAsset } = summarizeSession([
      ev('a-1', 'flagged', 1), // first flagged…
      ev('a-1', 'confirmed', 2), // …then re-checked and confirmed.
    ]);
    expect(lastByAsset.get('a-1')?.outcome).toBe('confirmed');
    expect(auditedAssetIds.has('a-1')).toBe(true);
  });

  it('a confirm followed by a skip should remove the asset from "audited"', () => {
    // Edge case: auditor confirms, then changes their mind to skip.
    const { auditedAssetIds, lastByAsset } = summarizeSession([
      ev('a-1', 'confirmed', 1),
      ev('a-1', 'skipped', 2),
    ]);
    expect(lastByAsset.get('a-1')?.outcome).toBe('skipped');
    expect(auditedAssetIds.has('a-1')).toBe(false);
  });

  it('empty events yield empty sets', () => {
    const { auditedAssetIds, lastByAsset } = summarizeSession([]);
    expect(auditedAssetIds.size).toBe(0);
    expect(lastByAsset.size).toBe(0);
  });
});
