/**
 * Per-type pin colors (M10b feedback). The original Waymarks prototype
 * colored pins by *type* — not by status — and that's what surfaces the
 * floor's identity at a glance ("look at all those Egress signs"). The
 * audit walkaround still flips to status colors via PinOverlay's
 * `statusOverride` map.
 *
 * Palette tuned for readability on a white floor plan backdrop. Colors
 * are bright enough to register on a busy plan, distinct enough to
 * differentiate, and respect color-blindness by also varying the icon
 * shape (set in PinMarker by the asset's status, not type).
 */

export type AssetTypeColor = {
  fill: string;
  label: string;
  category: 'signage' | 'facility';
};

export const TYPE_COLORS: Record<string, AssetTypeColor> = {
  // Signage
  directory: { fill: '#2563EB', label: 'Directory', category: 'signage' }, // blue
  tenant_id: { fill: '#7C3AED', label: 'Tenant ID', category: 'signage' }, // violet
  wayfinding: { fill: '#059669', label: 'Wayfinding', category: 'signage' }, // emerald
  tenant_products: { fill: '#0D9488', label: 'Tenant products', category: 'signage' }, // teal
  evacuation: { fill: '#EA580C', label: 'Evacuation', category: 'signage' }, // amber-orange
  emergency: { fill: '#DC2626', label: 'Emergency', category: 'signage' }, // red
  egress: { fill: '#16A34A', label: 'Egress', category: 'signage' }, // green

  // Recognition / nameplate / decorative (M10d) — visible features property
  // managers also need to track. Tones picked to slot between the existing
  // signage colors without colliding (donor warm gold → bronze, nameplates
  // muted slate-blue, mural pink-magenta, decorative warm rose).
  donor_plaque: { fill: '#B45309', label: 'Donor plaque', category: 'signage' }, // bronze
  donor_wall: { fill: '#92400E', label: 'Donor wall', category: 'signage' }, // dark bronze
  nameplate: { fill: '#1E40AF', label: 'Nameplate', category: 'signage' }, // navy
  wall_mural: { fill: '#BE185D', label: 'Wall mural', category: 'signage' }, // magenta
  decorative_feature: { fill: '#9F1239', label: 'Decorative feature', category: 'signage' }, // rose

  other: { fill: '#475569', label: 'Other', category: 'signage' }, // slate

  // Facility
  stairwell: { fill: '#15803D', label: 'Stairwell', category: 'facility' }, // forest
  service_room: { fill: '#334155', label: 'Service room', category: 'facility' }, // dark slate
  utility_room: { fill: '#6D28D9', label: 'Utility room', category: 'facility' }, // deep violet
};

export function colorForType(type: string): string {
  return TYPE_COLORS[type]?.fill ?? '#475569';
}

export function labelForType(type: string): string {
  return TYPE_COLORS[type]?.label ?? type;
}

/** Convenience: ordered list for filter UIs. */
export const TYPE_LIST = Object.entries(TYPE_COLORS).map(([value, info]) => ({
  value,
  ...info,
}));
