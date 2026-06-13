import { supabase } from '@/lib/supabase';

/**
 * Org branding (M16). One row per organization in `org_branding`,
 * plus one logo file per org in the `org-logos` storage bucket.
 *
 * Branding is intentionally minimal at this stage: a logo, an
 * accent color (constrained to a hex string), and a display-name
 * override. Per-org accent color cascading to UI buttons + full
 * white-label mode (Markur branding hidden) are deferred to a
 * later milestone.
 */

export const PIN_SHAPES = ['circle', 'square', 'diamond', 'teardrop'] as const;
export type PinShape = typeof PIN_SHAPES[number];

export const PIN_SIZES = ['small', 'medium', 'large'] as const;
export type PinSize = typeof PIN_SIZES[number];

export const DEFAULT_PIN_SHAPE: PinShape = 'circle';
// Small by default: dense walls (multiple assets per wall) crowd at medium.
export const DEFAULT_PIN_SIZE: PinSize = 'small';

export function isPinShape(v: unknown): v is PinShape {
  return typeof v === 'string' && (PIN_SHAPES as readonly string[]).includes(v);
}
export function isPinSize(v: unknown): v is PinSize {
  return typeof v === 'string' && (PIN_SIZES as readonly string[]).includes(v);
}

export type OrgBranding = {
  org_id: string;
  logo_path: string | null;
  accent_color: string | null;
  display_name_override: string | null;
  pin_shape: PinShape;
  pin_size: PinSize;
  created_at: string;
  updated_at: string;
};

/**
 * Returns null if the org has no branding row yet.
 */
export async function getOrgBranding(orgId: string): Promise<OrgBranding | null> {
  const { data, error } = await supabase
    .from('org_branding')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeBranding(data) : null;
}

export type SaveOrgBrandingInput = {
  org_id: string;
  logo_path?: string | null;
  accent_color?: string | null;
  display_name_override?: string | null;
  pin_shape?: PinShape;
  pin_size?: PinSize;
};

export async function saveOrgBranding(input: SaveOrgBrandingInput): Promise<OrgBranding> {
  const { data, error } = await supabase
    .from('org_branding')
    .upsert(
      {
        org_id: input.org_id,
        logo_path: input.logo_path ?? null,
        accent_color: input.accent_color ?? null,
        display_name_override: input.display_name_override ?? null,
        pin_shape: input.pin_shape ?? DEFAULT_PIN_SHAPE,
        pin_size: input.pin_size ?? DEFAULT_PIN_SIZE,
      },
      { onConflict: 'org_id' }
    )
    .select('*')
    .single();
  if (error) throw error;
  return normalizeBranding(data);
}

// DB columns are plain text; clamp to the known enum sets at the boundary
// so anything unexpected falls back to defaults instead of leaking into UI.
function normalizeBranding(row: Record<string, unknown>): OrgBranding {
  const shape = row.pin_shape;
  const size = row.pin_size;
  return {
    org_id: row.org_id as string,
    logo_path: (row.logo_path as string | null) ?? null,
    accent_color: (row.accent_color as string | null) ?? null,
    display_name_override: (row.display_name_override as string | null) ?? null,
    pin_shape: isPinShape(shape) ? shape : DEFAULT_PIN_SHAPE,
    pin_size: isPinSize(size) ? size : DEFAULT_PIN_SIZE,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

/**
 * Public URL for a logo path. Returns null if no path. The bucket
 * is public so we can build URLs without a server round-trip.
 */
export function logoPublicUrl(logoPath: string | null | undefined): string | null {
  if (!logoPath) return null;
  const { data } = supabase.storage.from('org-logos').getPublicUrl(logoPath);
  return data.publicUrl;
}

export type UploadLogoResult = {
  path: string;
};

export async function uploadOrgLogo(
  orgId: string,
  file: File
): Promise<UploadLogoResult> {
  const ext = inferExt(file);
  // Adding a cache-busting suffix lets the same org_id slot be
  // overwritten on re-upload while invalidating any stale CDN copies.
  const stamp = Date.now();
  const path = `${orgId}.${stamp}.${ext}`;

  const { error } = await supabase.storage
    .from('org-logos')
    .upload(path, file, {
      contentType: file.type,
      upsert: true,
      cacheControl: '3600',
    });
  if (error) throw error;
  return { path };
}

export async function deleteOrgLogo(path: string): Promise<void> {
  const { error } = await supabase.storage.from('org-logos').remove([path]);
  if (error) throw error;
}

function inferExt(file: File): string {
  const type = file.type;
  if (type === 'image/png') return 'png';
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/svg+xml') return 'svg';
  if (type === 'image/webp') return 'webp';
  // Fallback to filename extension if MIME is generic
  const m = file.name.match(/\.(png|jpe?g|svg|webp)$/i);
  const captured: string | undefined = m?.[1];
  if (captured) return captured.toLowerCase().replace('jpeg', 'jpg');
  return 'png';
}

export type ValidateLogoResult = string | null;

export function validateLogoFile(file: File): ValidateLogoResult {
  const allowed = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
  if (!allowed.includes(file.type)) {
    return 'File must be PNG, JPG, SVG, or WebP.';
  }
  if (file.size > 2 * 1024 * 1024) {
    return 'File must be under 2 MB.';
  }
  return null;
}

/**
 * Constrained accent color palette. Open-ended hex picker is on the
 * roadmap; for now we give admins curated brand-friendly choices so
 * "neon green logo" never happens by accident.
 */
export const ACCENT_COLOR_PALETTE: Array<{ value: string; label: string }> = [
  { value: '#B8965A', label: 'OfficeMark gold (default)' },
  { value: '#0F4C75', label: 'Deep blue' },
  { value: '#1B5E20', label: 'Forest green' },
  { value: '#7C3AED', label: 'Plum' },
  { value: '#B91C1C', label: 'Crimson' },
  { value: '#0F766E', label: 'Teal' },
  { value: '#1F2937', label: 'Graphite' },
];
