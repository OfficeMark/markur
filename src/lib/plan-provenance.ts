/**
 * Floor plan provenance — how a floor's plan was sourced. Stored as a key in
 * floors.plan_provenance; the frontend owns the display strings (locked
 * wordings). Shown as a quiet caption wherever a plan renders. `not_specified`
 * shows no label.
 */

export const PLAN_PROVENANCE_KEYS = [
  'not_specified',
  'client_provided',
  'recreated_from_reference',
  'recreated_from_scan',
] as const;

export type PlanProvenance = (typeof PLAN_PROVENANCE_KEYS)[number];

export const DEFAULT_PLAN_PROVENANCE: PlanProvenance = 'not_specified';

// LOCKED display strings — do not reword without sign-off.
const LABELS: Record<PlanProvenance, string | null> = {
  not_specified: null,
  client_provided: 'Client-provided plans',
  recreated_from_reference: 'Client plans unavailable — recreated from site reference',
  recreated_from_scan: 'Recreated from client print/scan',
};

/** Display label for a provenance key, or null when nothing should render. */
export function planProvenanceLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return (LABELS as Record<string, string | null>)[key] ?? null;
}

export function isPlanProvenance(v: unknown): v is PlanProvenance {
  return typeof v === 'string' && (PLAN_PROVENANCE_KEYS as readonly string[]).includes(v);
}

/** Options for the setter dropdown (not_specified is selectable = "no label"). */
export const PLAN_PROVENANCE_OPTIONS: ReadonlyArray<{ key: PlanProvenance; label: string }> = [
  { key: 'not_specified', label: 'Not specified' },
  { key: 'client_provided', label: 'Client-provided plans' },
  {
    key: 'recreated_from_reference',
    label: 'Client plans unavailable — recreated from site reference',
  },
  { key: 'recreated_from_scan', label: 'Recreated from client print/scan' },
];
