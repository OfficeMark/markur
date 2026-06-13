import { describe, it, expect } from 'vitest';
import { evaluateOrgTrial } from '@/lib/trial';

const NOW = Date.parse('2026-06-13T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const inDays = (n: number) => new Date(NOW + n * DAY).toISOString();

describe('evaluateOrgTrial', () => {
  it('active subscription is never locked, no banner', () => {
    expect(evaluateOrgTrial({ subscription_status: 'active', trial_ends_at: null }, NOW)).toEqual({
      locked: false,
      daysLeft: null,
      inFinalWeek: false,
    });
  });

  it('expired subscription is locked', () => {
    expect(evaluateOrgTrial({ subscription_status: 'expired', trial_ends_at: null }, NOW)).toMatchObject({
      locked: true,
    });
  });

  it('trial well in the future: not locked, no banner', () => {
    const e = evaluateOrgTrial({ subscription_status: 'trial', trial_ends_at: inDays(30) }, NOW);
    expect(e).toEqual({ locked: false, daysLeft: 30, inFinalWeek: false });
  });

  it('trial in the final week: not locked, banner on', () => {
    const e = evaluateOrgTrial({ subscription_status: 'trial', trial_ends_at: inDays(5) }, NOW);
    expect(e).toEqual({ locked: false, daysLeft: 5, inFinalWeek: true });
  });

  it('trial at exactly 7 days still counts as final week', () => {
    expect(evaluateOrgTrial({ subscription_status: 'trial', trial_ends_at: inDays(7) }, NOW).inFinalWeek).toBe(true);
  });

  it('trial past its end date is locked', () => {
    const e = evaluateOrgTrial({ subscription_status: 'trial', trial_ends_at: inDays(-1) }, NOW);
    expect(e.locked).toBe(true);
    expect(e.inFinalWeek).toBe(false);
  });

  it('no org / no trial date → not locked', () => {
    expect(evaluateOrgTrial(null, NOW).locked).toBe(false);
    expect(evaluateOrgTrial({ subscription_status: 'trial', trial_ends_at: null }, NOW).locked).toBe(false);
  });
});
