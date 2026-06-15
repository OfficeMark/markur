/**
 * Pin type catalog (M11 - per-org customizable).
 *
 * The static map below is a fallback that ships in the bundle so the app
 * can render pins even before the per-org catalog is fetched. Once
 * useAssetTypes() loads the merged DB list, it calls
 * `setRuntimeAssetTypes` to overlay the dynamic data on top of these
 * defaults. Sync helpers (`colorForType`, `labelForType`) read the
 * runtime map, so existing call sites keep working without becoming
 * hooks themselves.
 */

export type AssetTypeColor = {
  fill: string;
  label: string;
  category: 'signage' | 'facility';
};

const DEFAULT_TYPES: Record<string, AssetTypeColor> = {
  directory: { fill: '#2563EB', label: 'Directory', category: 'signage' },
  tenant_id: { fill: '#7C3AED', label: 'Tenant ID', category: 'signage' },
  wayfinding: { fill: '#059669', label: 'Wayfinding', category: 'signage' },
  tenant_products: { fill: '#0D9488', label: 'Tenant products', category: 'signage' },
  evacuation: { fill: '#EA580C', label: 'Evacuation', category: 'signage' },
  emergency: { fill: '#DC2626', label: 'Emergency', category: 'signage' },
  egress: { fill: '#16A34A', label: 'Egress', category: 'signage' },
  donor_plaque: { fill: '#B45309', label: 'Donor plaque', category: 'signage' },
  donor_wall: { fill: '#92400E', label: 'Donor wall', category: 'signage' },
  nameplate: { fill: '#1E40AF', label: 'Nameplate', category: 'signage' },
  wall_mural: { fill: '#BE185D', label: 'Wall mural', category: 'signage' },
  decorative_feature: { fill: '#9F1239', label: 'Decorative feature', category: 'signage' },
  other: { fill: '#475569', label: 'Other', category: 'signage' },
  stairwell: { fill: '#15803D', label: 'Stairwell', category: 'facility' },
  service_room: { fill: '#334155', label: 'Service room', category: 'facility' },
  utility_room: { fill: '#6D28D9', label: 'Utility room', category: 'facility' },
};

let RUNTIME_TYPES: Record<string, AssetTypeColor> = { ...DEFAULT_TYPES };

/**
 * Overlay the org's effective asset-type catalog ON TOP of the bundled
 * defaults. Called by useAssetTypes once the org_asset_types fetch resolves.
 *
 * Merging (not replacing) is deliberate: during a cold load the catalog can
 * briefly resolve to an empty map (org id not known until buildings load), and
 * a bare replace would wipe every default colour → pins draw slate/"black"
 * until something forces a repaint. Keeping the defaults underneath means a
 * standard-type pin always has its colour, and org-specific entries override on
 * top. Idempotent — same input produces the same map.
 */
export function setRuntimeAssetTypes(map: Record<string, AssetTypeColor>): void {
  RUNTIME_TYPES = { ...DEFAULT_TYPES, ...map };
}

/** Static defaults for components that need a synchronous list pre-fetch. */
export const TYPE_COLORS = DEFAULT_TYPES;

export function colorForType(type: string): string {
  return RUNTIME_TYPES[type]?.fill ?? '#475569';
}

export function labelForType(type: string): string {
  return RUNTIME_TYPES[type]?.label ?? type;
}

export function categoryForType(type: string): 'signage' | 'facility' | undefined {
  return RUNTIME_TYPES[type]?.category;
}

/** Convenience: ordered list of the runtime catalog for filter UIs. */
export function getTypeList(): Array<{ value: string } & AssetTypeColor> {
  return Object.entries(RUNTIME_TYPES).map(([value, info]) => ({ value, ...info }));
}

/**
 * Static fallback list. Import this only as a last resort - prefer
 * `useAssetTypes()` from hooks for components that should reflect
 * org customizations.
 */
export const TYPE_LIST = Object.entries(DEFAULT_TYPES).map(([value, info]) => ({
  value,
  ...info,
}));

/**
 * Format a stored pin number (a plain integer, sequential per floor) as the
 * zero-padded reference shown on pins, in the asset drawer, and in the
 * catalogue: 1 -> "001", 42 -> "042", 1234 -> "1234".
 *
 * Returns null when the pin has no number yet — e.g. an optimistic/offline
 * insert that hasn't round-tripped through the server-side assignment trigger.
 */
export function formatPinNumber(pinNumber: number | null | undefined): string | null {
  if (pinNumber == null || !Number.isFinite(pinNumber)) return null;
  return String(Math.trunc(pinNumber)).padStart(3, '0');
}

/**
 * Does a pin's number match a free-text search query? Lets users find an asset
 * by typing its pin ID — accepts the query with or without a leading "#" and
 * with or without leading zeros ("3", "003", "#3", "#003"), and also matches
 * partials (typing "12" finds pin 120). `query` should be pre-trimmed; this
 * only inspects the numeric portion.
 */
export function pinNumberMatchesQuery(
  pinNumber: number | null | undefined,
  query: string
): boolean {
  if (pinNumber == null || !Number.isFinite(pinNumber)) return false;
  const needle = query.trim().replace(/^#/, '');
  if (!needle) return false;
  const raw = String(Math.trunc(pinNumber));
  const padded = formatPinNumber(pinNumber) ?? raw;
  if (raw.includes(needle) || padded.includes(needle)) return true;
  return /^\d+$/.test(needle) && Math.trunc(pinNumber) === Number(needle);
}
