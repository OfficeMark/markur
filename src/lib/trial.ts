/**
 * Trial / subscription evaluation (client mirror of the DB's private.org_is_locked).
 *
 * An org is LOCKED when its subscription is 'expired', or it's a 'trial' whose
 * end date has passed. The DB enforces this in user_can (locked org → deny for
 * everyone except a global super_admin); this module drives the matching UI —
 * the lockout screen and the 7-day pre-expiry banner.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type OrgSubscription = {
  subscription_status: string;
  trial_ends_at: string | null;
};

export type TrialEvaluation = {
  /** True when access is locked (expired, or trial past its end date). */
  locked: boolean;
  /** Whole days until the trial ends (ceil); null unless an active trial. */
  daysLeft: number | null;
  /** True for an active trial in its final 7 days (banner trigger). */
  inFinalWeek: boolean;
};

export function evaluateOrgTrial(org: OrgSubscription | null | undefined, nowMs: number): TrialEvaluation {
  if (!org) return { locked: false, daysLeft: null, inFinalWeek: false };
  const { subscription_status: status, trial_ends_at } = org;

  if (status === 'expired') return { locked: true, daysLeft: null, inFinalWeek: false };

  if (status === 'trial' && trial_ends_at) {
    const end = new Date(trial_ends_at).getTime();
    if (!Number.isFinite(end)) return { locked: false, daysLeft: null, inFinalWeek: false };
    if (end <= nowMs) return { locked: true, daysLeft: 0, inFinalWeek: false };
    const daysLeft = Math.ceil((end - nowMs) / DAY_MS);
    return { locked: false, daysLeft, inFinalWeek: daysLeft <= 7 };
  }

  // 'active' (or anything else non-expired, e.g. no trial date) → not locked.
  return { locked: false, daysLeft: null, inFinalWeek: false };
}

/** v1 pricing shown on the lockout screen. Manual conversion (admin flips status). */
export const PRICING_TIERS: ReadonlyArray<{ name: string; price: string; blurb: string }> = [
  { name: 'Building', price: '$79', blurb: 'A single building.' },
  { name: 'Portfolio', price: '$199', blurb: 'Multiple buildings under one org.' },
  { name: 'Enterprise', price: 'from $499', blurb: 'Large portfolios, custom terms.' },
];

// v1 conversion is manual: the customer emails OfficeMark, who flips the org's
// subscription_status to 'active'.
export const UPGRADE_EMAIL = 'hello@officemark.ca';

export function upgradeMailto(orgName?: string | null): string {
  const subject = 'Markur subscription' + (orgName ? ` — ${orgName}` : '');
  const body = "Hi — I'd like to activate our Markur subscription.";
  return `mailto:${UPGRADE_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
