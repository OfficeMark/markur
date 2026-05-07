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

export type OrgBranding = {
  org_id: string;
  logo_path: string | null;
  accent_color: string | null;
  display_name_override: string | null;
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
  return (data as OrgBranding | null) ?? null;
}

export type SaveOrgBrandingInput = {
  org_id: string;
  logo_path?: string | null;
  accent_color?: string | null;
  display_name_override?: string | null;
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
      },
      { onConflict: 'org_id' }
    )
    .select('*')
    .single();
  if (error) throw error;
  return data as OrgBranding;
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
  if (m) return m[1].toLowerCase().replace('jpeg', 'jpg');
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
