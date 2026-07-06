import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEMO_PERIOD,
  DEMO_PERIODS,
  demoDaysLeft,
  demoUrlFor,
} from '@/lib/queries/demo-links';

describe('demo links (S9)', () => {
  it('offers 14/30/90-day periods, defaulting to 30', () => {
    expect(DEMO_PERIODS).toEqual([14, 30, 90]);
    expect(DEFAULT_DEMO_PERIOD).toBe(30);
  });

  it('demoDaysLeft counts whole days remaining, ceiling partial days', () => {
    const now = new Date('2026-07-06T12:00:00Z');
    const in30 = new Date('2026-08-05T12:00:00Z').toISOString();
    expect(demoDaysLeft(in30, now)).toBe(30);
    const in12h = new Date('2026-07-07T00:00:00Z').toISOString();
    expect(demoDaysLeft(in12h, now)).toBe(1);
  });

  it('demoDaysLeft floors at zero once expired', () => {
    const now = new Date('2026-07-06T12:00:00Z');
    const past = new Date('2026-07-01T00:00:00Z').toISOString();
    expect(demoDaysLeft(past, now)).toBe(0);
  });

  it('demoUrlFor builds a /welcome/<token> URL', () => {
    expect(demoUrlFor('abc123')).toContain('/welcome/abc123');
  });
});
