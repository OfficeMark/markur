import { supabase } from '@/lib/supabase';
import { listGrantsForBuilding, type GrantWithProfile } from '@/lib/queries/access';

/**
 * Org-wide member admin (M14a). Aggregates grants across all buildings
 * owned by an organization so the /settings MembersCard can show one
 * combined list rather than per-building cards.
 *
 * Access control: RLS on access_grants and listGrantsForBuilding restricts
 * each lookup to scopes the current user manages. A super_admin sees
 * every building's grants; a Manager (building_admin) sees only their
 * building(s). For both, the org-level filter just loops the buildings
 * the user can see for that org.
 */

export type RoleKey = 'super_admin' | 'building_admin' | 'auditor' | 'tenant_rep';

/**
 * UI display name for each role. Database name stays as it was; this
 * is the user-facing string.
 *
 * Note: tenant_rep is displayed as "Facilities" (per Randy's directive
 * that the platform is for building management staff, not tenants).
 */
export const ROLE_LABEL: Record<RoleKey, string> = {
  super_admin: 'Super admin',
  building_admin: 'Manager',
  auditor: 'Auditor',
  tenant_rep: 'Facilities',
};

/** Numeric hierarchy used by the UI to constrain dropdown options. */
export const ROLE_LEVEL: Record<RoleKey, number> = {
  super_admin: 3,
  building_admin: 2,
  auditor: 1,
  tenant_rep: 1,
};

/** Roles the UI lets you GRANT, in display order (excludes super_admin). */
export const GRANTABLE_ROLES: RoleKey[] = [
  'building_admin',
  'auditor',
  'tenant_rep',
];

export type Member = {
  grant_id: string;
  user_id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  role: RoleKey;
  scope_type: string;
  scope_id: string | null;
  scope_label: string;
  expires_at: string | null;
  created_at: string;
  building_id: string;
  building_name: string;
};

export async function listMembersForOrg(orgId: string | null): Promise<Member[]> {
  if (!orgId) return [];

  // Fetch all buildings owned by this org that the current user can see.
  // RLS on buildings filters this naturally.
  const { data: buildings, error: bErr } = await supabase
    .from('buildings')
    .select('id, name')
    .eq('owner_org_id', orgId)
    .is('deleted_at', null);
  if (bErr) throw bErr;
  const bRows = buildings ?? [];
  if (bRows.length === 0) return [];

  // Fan out: get grants per building, merge.
  const perBuilding = await Promise.all(
    bRows.map((b) =>
      listGrantsForBuilding(b.id).then((grants) => ({
        b,
        grants,
      }))
    )
  );

  const out: Member[] = [];
  for (const { b, grants } of perBuilding) {
    for (const g of grants) {
      out.push(grantToMember(g, b.id, b.name));
    }
  }
  // Sort: by building name, then role hierarchy (manager first), then name.
  out.sort((a, b) => {
    if (a.building_name !== b.building_name) {
      return a.building_name.localeCompare(b.building_name);
    }
    const lvlDiff = (ROLE_LEVEL[b.role] ?? 0) - (ROLE_LEVEL[a.role] ?? 0);
    if (lvlDiff !== 0) return lvlDiff;
    return a.display_name.localeCompare(b.display_name);
  });
  return out;
}

function grantToMember(
  g: GrantWithProfile,
  buildingId: string,
  buildingName: string
): Member {
  return {
    grant_id: g.id,
    user_id: g.user_id,
    email: g.profile?.email ?? '(unknown)',
    display_name: g.profile?.display_name ?? g.profile?.email ?? '(unknown)',
    avatar_url: null, // profiles join in access.ts doesn't carry avatar yet
    role: g.role as RoleKey,
    scope_type: g.scope_type,
    scope_id: g.scope_id,
    scope_label: g.scope_label,
    expires_at: g.expires_at,
    created_at: g.created_at,
    building_id: buildingId,
    building_name: buildingName,
  };
}

export async function updateMemberRole(
  grantId: string,
  newRole: RoleKey
): Promise<void> {
  const { error } = await supabase
    .from('access_grants')
    .update({ role: newRole })
    .eq('id', grantId);
  if (error) throw error;
}

/**
 * Revoke a grant. The RLS on access_grants_admin_write already gates
 * who can DELETE; UI prevents self-revoke client-side.
 */
export async function revokeMember(grantId: string): Promise<void> {
  const { error } = await supabase
    .from('access_grants')
    .delete()
    .eq('id', grantId);
  if (error) throw error;
}
