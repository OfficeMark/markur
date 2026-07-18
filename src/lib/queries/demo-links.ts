import { supabase } from '@/lib/supabase';
import type { PendingInvitation } from '@/types/database';

/**
 * S9 — Demo links ("try Markur on your building").
 *
 * A demo link is a `pending_invitations` row with kind='demo': no pre-set
 * email, a building scope, and an expires_at that defines the whole trial
 * window ("the link IS the trial" — access ends when the link's window
 * ends, whoever claimed it and whenever they claimed).
 *
 * Claiming happens through the SECURITY DEFINER `claim_demo_link` RPC,
 * which mints a building-scoped building_admin grant with the same
 * expires_at. Expiry is then enforced everywhere by `user_can` (verified
 * in CODE-REVIEW-2026-07-06 — every branch excludes expired grants).
 */

export const DEMO_PERIODS = [14, 30, 90] as const;
export type DemoPeriodDays = (typeof DEMO_PERIODS)[number];
export const DEFAULT_DEMO_PERIOD: DemoPeriodDays = 30;

export type DemoLinkClaim = {
  invitation_id: string;
  email: string;
  claimed_at: string;
};

export type PeekDemoLinkResult =
  | {
      status: 'ok';
      building_name: string | null;
      sharer_name: string | null;
      expires_at: string;
      grant_days: number | null;
    }
  | { status: 'expired' }
  | { status: 'invalid' };

/** Whole days remaining until `expiresAt` (floor 0). */
export function demoDaysLeft(expiresAt: string, now: Date = new Date()): number {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

/** Absolute URL a prospect opens to claim the demo. */
export function demoUrlFor(token: string): string {
  if (typeof window === 'undefined') return `/welcome/${token}`;
  return `${window.location.origin}/welcome/${token}`;
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

/** Create a demo link on a building. Caller must hold manage_access (RLS). */
export async function createDemoLink(
  buildingId: string,
  days: DemoPeriodDays
): Promise<PendingInvitation> {
  const { data: userData } = await supabase.auth.getUser();
  const invited_by = userData.user?.id;
  if (!invited_by) throw new Error('Not signed in');

  const expires_at = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('pending_invitations')
    .insert({
      kind: 'demo',
      email: null,
      role: 'building_admin',
      scope_type: 'building',
      scope_id: buildingId,
      invited_by,
      token: generateToken(),
      expires_at,
      grant_days: days,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/** Active (unexpired) demo links for a building. Admin-only via RLS. */
export async function listDemoLinks(buildingId: string): Promise<PendingInvitation[]> {
  const { data, error } = await supabase
    .from('pending_invitations')
    .select('*')
    .eq('kind', 'demo')
    .eq('scope_type', 'building')
    .eq('scope_id', buildingId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Who has claimed demo links on this building (admin-only via RPC). */
export async function listDemoLinkClaims(buildingId: string): Promise<DemoLinkClaim[]> {
  const { data, error } = await supabase.rpc('list_demo_link_claims', {
    p_building_id: buildingId,
  });
  if (error) throw error;
  return (data ?? []) as DemoLinkClaim[];
}

/** Revoke a link AND immediately expire every grant claimed through it. */
export async function revokeDemoLink(invitationId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_demo_link', {
    p_invitation_id: invitationId,
  });
  if (error) throw error;
}

/** Anonymous preview for the claim screen. */
export async function peekDemoLink(token: string): Promise<PeekDemoLinkResult> {
  const { data, error } = await supabase.rpc('peek_demo_link', { p_token: token });
  if (error) throw error;
  const res = data as unknown as {
    status: 'ok' | 'expired' | 'invalid';
    building_name?: string | null;
    sharer_name?: string | null;
    expires_at?: string;
    grant_days?: number | null;
  } | null;
  if (!res || res.status === 'invalid') return { status: 'invalid' };
  if (res.status === 'expired') return { status: 'expired' };
  return {
    status: 'ok',
    building_name: res.building_name ?? null,
    sharer_name: res.sharer_name ?? null,
    expires_at: res.expires_at ?? new Date().toISOString(),
    grant_days: res.grant_days ?? null,
  };
}

/** Claim the demo as the signed-in user. Returns the building id. */
export async function claimDemoLink(token: string): Promise<string> {
  const { data, error } = await supabase.rpc('claim_demo_link', { p_token: token });
  if (error) throw error;
  return data as unknown as string;
}
