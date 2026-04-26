import { describe, it, expect } from 'vitest';
import { computeStatus, statusLabel, pinFillClass } from '@/lib/asset-status';

const baseAsset = {
  audit_cycle_days: 90 as number | null,
  created_at: '2026-01-01T00:00:00Z',
};

describe('computeStatus', () => {
  it('flagged whenever there are open flags, regardless of cycle', () => {
    expect(
      computeStatus({
        asset: baseAsset,
        lastAuditAt: null,
        openFlagCount: 1,
        now: new Date('2026-04-01T00:00:00Z'),
      })
    ).toBe('flagged');
    expect(
      computeStatus({
        asset: baseAsset,
        lastAuditAt: '2026-03-30T00:00:00Z',
        openFlagCount: 5,
        now: new Date('2026-04-01T00:00:00Z'),
      })
    ).toBe('flagged');
  });

  it("good when last audit is within cycle", () => {
    expect(
      computeStatus({
        asset: baseAsset,
        lastAuditAt: '2026-03-15T00:00:00Z',
        openFlagCount: 0,
        now: new Date('2026-04-01T00:00:00Z'),
      })
    ).toBe('good');
  });

  it('attention when last audit is older than the cycle', () => {
    expect(
      computeStatus({
        asset: baseAsset,
        lastAuditAt: '2025-12-01T00:00:00Z',
        openFlagCount: 0,
        now: new Date('2026-04-01T00:00:00Z'),
      })
    ).toBe('attention');
  });

  it('falls back to created_at when no audit yet', () => {
    expect(
      computeStatus({
        asset: { ...baseAsset, created_at: '2026-03-31T00:00:00Z' },
        lastAuditAt: null,
        openFlagCount: 0,
        now: new Date('2026-04-01T00:00:00Z'),
      })
    ).toBe('good');
    expect(
      computeStatus({
        asset: { ...baseAsset, created_at: '2025-09-01T00:00:00Z' },
        lastAuditAt: null,
        openFlagCount: 0,
        now: new Date('2026-04-01T00:00:00Z'),
      })
    ).toBe('attention');
  });

  it('respects per-asset audit_cycle_days override', () => {
    expect(
      computeStatus({
        asset: { ...baseAsset, audit_cycle_days: 30 },
        lastAuditAt: '2026-02-15T00:00:00Z',
        openFlagCount: 0,
        now: new Date('2026-04-01T00:00:00Z'),
      })
    ).toBe('attention');
  });

  it('uses fallback when audit_cycle_days is null', () => {
    expect(
      computeStatus({
        asset: { ...baseAsset, audit_cycle_days: null },
        lastAuditAt: '2025-12-01T00:00:00Z',
        openFlagCount: 0,
        fallbackCycleDays: 200,
        now: new Date('2026-04-01T00:00:00Z'),
      })
    ).toBe('good');
  });
});

describe('statusLabel', () => {
  it('returns user-facing strings', () => {
    expect(statusLabel('good')).toBe('Good');
    expect(statusLabel('attention')).toBe('Audit due');
    expect(statusLabel('flagged')).toBe('Flagged');
  });
});

describe('pinFillClass', () => {
  it('maps to tailwind tokens', () => {
    expect(pinFillClass('good')).toContain('bg-pin-good');
    expect(pinFillClass('attention')).toContain('bg-pin-due');
    expect(pinFillClass('flagged')).toContain('bg-pin-flagged');
  });
});
