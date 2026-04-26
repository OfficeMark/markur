import { describe, expect, it } from 'vitest';
import { computeStatus } from '@/lib/asset-status';

const baseAsset = {
  audit_cycle_days: 30,
  created_at: '2025-01-01T00:00:00Z',
};

describe('computeStatus — cycle days vs lastAuditAt', () => {
  it("a confirmed audit within the cycle keeps the asset 'good'", () => {
    const now = new Date('2026-04-26T00:00:00Z');
    const lastAudit = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 days ago
    expect(
      computeStatus({ asset: baseAsset, lastAuditAt: lastAudit, openFlagCount: 0, now })
    ).toBe('good');
  });

  it("a confirmed audit older than the cycle goes to 'attention'", () => {
    const now = new Date('2026-04-26T00:00:00Z');
    const lastAudit = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 days ago
    expect(
      computeStatus({ asset: baseAsset, lastAuditAt: lastAudit, openFlagCount: 0, now })
    ).toBe('attention');
  });

  it("never audited but freshly created is still 'good'", () => {
    const now = new Date('2026-04-26T00:00:00Z');
    const fresh = {
      audit_cycle_days: 90,
      created_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    };
    expect(
      computeStatus({ asset: fresh, lastAuditAt: null, openFlagCount: 0, now })
    ).toBe('good');
  });

  it('open flag overrides cycle-driven status', () => {
    const now = new Date('2026-04-26T00:00:00Z');
    expect(
      computeStatus({ asset: baseAsset, lastAuditAt: null, openFlagCount: 1, now })
    ).toBe('flagged');
  });

  it('falls back to default 90-day cycle when asset has no override', () => {
    const now = new Date('2026-04-26T00:00:00Z');
    const noCycle = { audit_cycle_days: null, created_at: '2025-01-01T00:00:00Z' };
    // Created >90 days ago, never audited → attention.
    expect(
      computeStatus({ asset: noCycle, lastAuditAt: null, openFlagCount: 0, now })
    ).toBe('attention');
  });
});
