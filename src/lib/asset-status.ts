// Pure helper to compute the displayed pin status for an asset.
//
// Inputs:
//   * asset.audit_cycle_days (or fallback from floor / building settings — for
//     M4 we accept just the asset value, which is the most specific override)
//   * lastAuditAt — ISO timestamp of the most recent audit_event for this asset
//   * openFlagCount — number of flags with status in (open, in_progress)
//
// Output: 'good' | 'attention' | 'flagged'
//
// Rules (per spec 06 § Floor map and pin overlay):
//   * `flagged` if any open flag (overrides everything else)
//   * `attention` if outside the audit cycle
//   * `good` otherwise

import type { Asset } from '@/types/database';

export type AssetStatus = 'good' | 'attention' | 'flagged';

export type StatusInputs = {
  asset: Pick<Asset, 'audit_cycle_days' | 'created_at'>;
  lastAuditAt: string | null;
  openFlagCount: number;
  /** Fallback cycle days from floor or building settings. Defaults to 90. */
  fallbackCycleDays?: number;
  /** Override "now" for tests. */
  now?: Date;
};

export function computeStatus({
  asset,
  lastAuditAt,
  openFlagCount,
  fallbackCycleDays = 90,
  now = new Date(),
}: StatusInputs): AssetStatus {
  if (openFlagCount > 0) return 'flagged';

  const cycleDays = asset.audit_cycle_days ?? fallbackCycleDays;
  // If there's no audit yet, treat the asset's creation date as the baseline
  // for the cycle. New pins are 'good' until they age past the cycle.
  const baselineIso = lastAuditAt ?? asset.created_at;
  const baseline = new Date(baselineIso);
  const ageMs = now.getTime() - baseline.getTime();
  const cycleMs = cycleDays * 24 * 60 * 60 * 1000;
  return ageMs > cycleMs ? 'attention' : 'good';
}

/** Tailwind class for the pin dot fill given a status. Mirrors spec 02. */
export function pinFillClass(status: AssetStatus): string {
  switch (status) {
    case 'good':
      return 'bg-pin-good';
    case 'attention':
      return 'bg-pin-due';
    case 'flagged':
      return 'bg-pin-flagged';
  }
}

export function statusLabel(status: AssetStatus): string {
  switch (status) {
    case 'good':
      return 'Good';
    case 'attention':
      return 'Audit due';
    case 'flagged':
      return 'Flagged';
  }
}
