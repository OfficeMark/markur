import { supabase } from '@/lib/supabase';
import type { AccessGrant, PendingInvitation } from '@/types/database';

/**
 * Read/write helpers for access management (M7) — `access_grants` and
 * `pending_invitations`. UI surfaces in `<AccessManagementCard>` on the
 * Building view (admin only).
 *
 * RLS gating:
 *   - access_grants_admin_read: super_admin globally OR building_admin on
 *     scope. Plus access_grants_self_read for the user's own grants.
 *   - pending_invitations_read: inviter, or admins on the scope.
 *
 * The list-by-building queries fan in across grants whose scope_type is
 * 'building' (with this id) OR 'floor'/'tenant' nested under the building.
 */

export type GrantWithProfile = AccessGrant & {
  profile: { id: string; display_name: string; email: string } | null;
  /** Pretty label for the scope (e.g. "Building" / "Floor B2" / "Tenant Suite 304"). */
  scope_label: string;
};

export async function listGrantsForBuilding(
  buildingId: string
): Promise<GrantWithProfile[]> {
  // We need three fan-ins:
  //   * scope_type='building', scope_id = buildingId
  //   * scope_type='floor', scope_id IN (floors of building)
  //   * scope_type='tenant', scope_id IN (tenants of building)
  // PostgREST can't OR across different filters in one call, so we issue
  // three queries in parallel and merge.

  const [floorsRes, tenantsRes] = await Promise.all([
    supabase.from('floors').select('id, label').eq('building_id', buildingId).is('deleted_at', null),
    supabase.from('tenants').select('id, name, suite_label').eq('building_id', buildingId),
  ]);
  if (floorsRes.error) throw floorsRes.error;
  if (tenantsRes.error) throw tenantsRes.error;

  const floors = floorsRes.data ?? [];
  const tenants = tenantsRes.data ?? [];
  const floorIds = floors.map((f) => f.id);
  const tenantIds = tenants.map((t) => t.id);

  const buildingScope = supabase
    .from('access_grants')
    .select('*')
    .eq('scope_type', 'building')
    .eq('scope_id', buildingId);

  const floorScope = floorIds.length
    ? supabase
        .from('access_grants')
        .select('*')
        .eq('scope_type', 'floor')
        .in('scope_id', floorIds)
    : Promise.resolve({ data: [] as AccessGrant[], error: null });

  const tenantScope = tenantIds.length
    ? supabase
        .from('access_grants')
        .select('*')
        .eq('scope_type', 'tenant')
        .in('scope_id', tenantIds)
    : Promise.resolve({ data: [] as AccessGrant[], error: null });

  const [bRes, fRes, tRes] = await Promise.all([buildingScope, floorScope, tenantScope]);
  if (bRes.error) throw bRes.error;
  if (fRes.error) throw fRes.error;
  if (tRes.error) throw tRes.error;

  const allGrants: AccessGrant[] = [
    ...((bRes.data ?? []) as AccessGrant[]),
    ...((fRes.data ?? []) as AccessGrant[]),
    ...((tRes.data ?? []) as AccessGrant[]),
  ];

  // No FK between access_grants.user_id and profiles.id (both reference
  // auth.users), so we can't embed via PostgREST. Fetch profiles separately
  // and join client-side.
  const userIds = Array.from(new Set(allGrants.map((g) => g.user_id)));
  const profilesById = new Map<string, { id: string; display_name: string; email: string }>();
  if (userIds.length) {
    const { data: profs, error: pErr } = await supabase
      .from('profiles')
      .select('id, display_name, email')
      .in('id', userIds);
    if (pErr) throw pErr;
    for (const p of profs ?? []) profilesById.set(p.id, p);
  }

  const floorLabel = new Map(floors.map((f) => [f.id, f.label]));
  const tenantLabel = new Map(
    tenants.map((t) => [t.id, t.suite_label ? `${t.name} · ${t.suite_label}` : t.name])
  );

  function scopeLabelFor(g: AccessGrant): string {
    if (g.scope_type === 'building') return 'Building (whole building)';
    if (g.scope_type === 'floor') {
      return `Floor ${floorLabel.get(g.scope_id ?? '') ?? '(unknown)'}`;
    }
    if (g.scope_type === 'tenant') {
      return `Tenant ${tenantLabel.get(g.scope_id ?? '') ?? '(unknown)'}`;
    }
    return g.scope_type;
  }

  const all: GrantWithProfile[] = allGrants.map((g) => ({
    ...g,
    profile: profilesById.get(g.user_id) ?? null,
    scope_label: scopeLabelFor(g),
  }));
  return all.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function listPendingInvitationsForBuilding(
  buildingId: string
): Promise<PendingInvitation[]> {
  const [floorsRes, tenantsRes] = await Promise.all([
    supabase.from('floors').select('id').eq('building_id', buildingId).is('deleted_at', null),
    supabase.from('tenants').select('id').eq('building_id', buildingId),
  ]);
  if (floorsRes.error) throw floorsRes.error;
  if (tenantsRes.error) throw tenantsRes.error;
  const floorIds = (floorsRes.data ?? []).map((f) => f.id);
  const tenantIds = (tenantsRes.data ?? []).map((t) => t.id);

  // OR across multiple scope_id sets via PostgREST `or=` filter.
  const orParts: string[] = [`and(scope_type.eq.building,scope_id.eq.${buildingId})`];
  if (floorIds.length) orParts.push(`and(scope_type.eq.floor,scope_id.in.(${floorIds.join(',')}))`);
  if (tenantIds.length) orParts.push(`and(scope_type.eq.tenant,scope_id.in.(${tenantIds.join(',')}))`);

  const { data, error } = await supabase
    .from('pending_invitations')
    .select('*')
    .is('accepted_at', null)
    .or(orParts.join(','));
  if (error) throw error;
  return data ?? [];
}

export type CreateInvitationInput = {
  email: string;
  role: 'super_admin' | 'building_admin' | 'auditor' | 'tenant_rep';
  scope_type: 'global' | 'building' | 'floor' | 'tenant';
  scope_id: string | null;
  expires_at?: string | null;
};

/**
 * Generates a 32-byte random token (url-safe base64). Until M10's email
 * Edge Function lands, the inviter copy/pastes the URL `/accept/<token>`
 * to the recipient.
 */
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // Convert to URL-safe base64 without padding.
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

export async function createInvitation(
  input: CreateInvitationInput
): Promise<PendingInvitation> {
  const { data: userData } = await supabase.auth.getUser();
  const invited_by = userData.user?.id;
  if (!invited_by) throw new Error('Not signed in');

  const token = generateToken();
  // Default the invitation token to expire in 14 days, regardless of
  // the grant's own expires_at (which kicks in only after acceptance).
  const tokenExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('pending_invitations')
    .insert({
      email: input.email.trim().toLowerCase(),
      role: input.role,
      scope_type: input.scope_type,
      scope_id: input.scope_id,
      invited_by,
      token,
      expires_at: tokenExpiresAt,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function revokeGrant(id: string): Promise<void> {
  const { error } = await supabase.from('access_grants').delete().eq('id', id);
  if (error) throw error;
}

export async function cancelInvitation(id: string): Promise<void> {
  const { error } = await supabase.from('pending_invitations').delete().eq('id', id);
  if (error) throw error;
}

export type LookupInvitationResult =
  | { kind: 'ok'; invitation: PendingInvitation; building_name: string | null }
  | { kind: 'expired' }
  | { kind: 'accepted' }
  | { kind: 'invalid' };

export async function lookupInvitation(token: string): Promise<LookupInvitationResult> {
  const { data, error } = await supabase
    .from('pending_invitations')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { kind: 'invalid' };
  if (data.accepted_at) return { kind: 'accepted' };
  if (new Date(data.expires_at).getTime() < Date.now()) return { kind: 'expired' };

  // Resolve a friendly building name for the preview, when possible.
  let buildingName: string | null = null;
  if (data.scope_type === 'building' && data.scope_id) {
    const { data: b } = await supabase.from('buildings').select('name').eq('id', data.scope_id).maybeSingle();
    buildingName = b?.name ?? null;
  } else if (data.scope_type === 'floor' && data.scope_id) {
    const { data: f } = await supabase
      .from('floors')
      .select('label, building:buildings(name)')
      .eq('id', data.scope_id)
      .maybeSingle();
    type FloorJoin = { label: string; building: { name: string } | null };
    const fj = f as unknown as FloorJoin | null;
    buildingName = fj?.building?.name ? `${fj.building.name} · ${fj.label}` : fj?.label ?? null;
  } else if (data.scope_type === 'tenant' && data.scope_id) {
    const { data: t } = await supabase
      .from('tenants')
      .select('name, building:buildings(name)')
      .eq('id', data.scope_id)
      .maybeSingle();
    type TenantJoin = { name: string; building: { name: string } | null };
    const tj = t as unknown as TenantJoin | null;
    buildingName = tj?.building?.name ? `${tj.building.name} · ${tj.name}` : tj?.name ?? null;
  }

  return { kind: 'ok', invitation: data, building_name: buildingName };
}

/**
 * Consume an invitation: insert an access_grant for the current user,
 * mark the invitation accepted. Both writes happen in the same RPC if
 * we ever add one — for now we do them sequentially client-side and
 * rely on idempotency (the unique constraint on access_grants would
 * surface a duplicate, though we don't enforce one yet).
 */
export async function acceptInvitation(token: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Sign in to accept this invitation.');

  const lookup = await lookupInvitation(token);
  if (lookup.kind !== 'ok') {
    throw new Error(
      lookup.kind === 'expired'
        ? 'This invitation has expired.'
        : lookup.kind === 'accepted'
          ? 'This invitation has already been accepted.'
          : 'Invitation not found.'
    );
  }
  const inv = lookup.invitation;

  const { error: grantErr } = await supabase.from('access_grants').insert({
    user_id: userId,
    role: inv.role,
    scope_type: inv.scope_type,
    scope_id: inv.scope_id,
    granted_by: inv.invited_by,
  });
  if (grantErr) throw grantErr;

  const { error: markErr } = await supabase
    .from('pending_invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', inv.id);
  if (markErr) throw markErr;
}
