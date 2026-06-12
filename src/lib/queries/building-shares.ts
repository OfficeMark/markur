import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

export type BuildingShare = Database['public']['Tables']['building_shares']['Row'];

export type ShareExpiryDays = 7 | 30 | 90;

export type CreatedShare = {
  share: BuildingShare;
  /** Plaintext token — returned ONCE at creation; never stored (only its hash). */
  token: string;
  /** Ready-to-send absolute link. */
  url: string;
};

/** Pre-auth peek shown on the claim screen. Mirrors peek_building_share's jsonb. */
export type SharePeek = {
  status: 'ok' | 'expired' | 'revoked' | 'invalid';
  building_name: string | null;
  expires_at: string | null;
};

/** 32 random bytes, url-safe base64 (same shape as the invitation token). */
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

/**
 * Lowercase hex SHA-256 — MUST match the DB's
 * `encode(digest(token,'sha256'),'hex')` so peek/claim can find the row.
 */
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function createBuildingShare(input: {
  building_id: string;
  expiryDays: ShareExpiryDays;
}): Promise<CreatedShare> {
  const { data: userData } = await supabase.auth.getUser();
  const created_by = userData.user?.id;
  if (!created_by) throw new Error('Not signed in');

  const token = generateToken();
  const token_hash = await sha256Hex(token);
  const expires_at = new Date(Date.now() + input.expiryDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('building_shares')
    .insert({ building_id: input.building_id, token_hash, expires_at, created_by })
    .select('*')
    .single();
  if (error) throw error;

  return { share: data, token, url: `${window.location.origin}/share/${token}` };
}

/** Active = not revoked and not yet expired. Newest first. */
export async function listActiveShares(buildingId: string): Promise<BuildingShare[]> {
  const { data, error } = await supabase
    .from('building_shares')
    .select('*')
    .eq('building_id', buildingId)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Revoke + cascade (expires derived viewer grants immediately) via the RPC. */
export async function revokeBuildingShare(shareId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_building_share', { p_share_id: shareId });
  if (error) throw error;
}

/** Anon-callable pre-auth peek for the claim screen. */
export async function peekBuildingShare(token: string): Promise<SharePeek> {
  const { data, error } = await supabase.rpc('peek_building_share', { p_token: token });
  if (error) throw error;
  const d = (data ?? {}) as Partial<SharePeek>;
  return {
    status: d.status ?? 'invalid',
    building_name: d.building_name ?? null,
    expires_at: d.expires_at ?? null,
  };
}

/**
 * Claim the share for the signed-in user → mints/reuses a time-boxed viewer
 * grant. RAISES on invalid/revoked/expired (no status return). Returns the
 * shared building's id.
 */
export async function claimBuildingShare(token: string): Promise<string> {
  const { data, error } = await supabase.rpc('claim_building_share', { p_token: token });
  if (error) throw error;
  return data as string;
}
