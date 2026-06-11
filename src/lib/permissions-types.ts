// Permission vocabulary. Mirrors the SQL `user_can()` function in
// supabase/migrations/0002_user_can.sql. Keep these two in sync.

export type Capability =
  | 'view'
  | 'edit'
  | 'create'
  | 'delete'
  | 'reposition'
  | 'audit'
  | 'flag'
  | 'resolve_flag'
  | 'upload_plan'
  | 'manage_access'
  | 'configure'
  | 'export'
  | 'view_audit_log';

export type ResourceType = 'asset' | 'floor' | 'building' | 'tenant' | 'organization' | 'global';

export type Resource = { type: ResourceType; id?: string };

export type Role = 'super_admin' | 'building_admin' | 'editor' | 'auditor' | 'tenant_rep' | 'viewer';

export type GrantScopeType = 'global' | 'organization' | 'building' | 'floor' | 'tenant';

export type Grant = {
  id: string;
  role: Role;
  scope_type: GrantScopeType;
  scope_id: string | null;
  expires_at: string | null;
};

const ADMIN_CAPS: ReadonlySet<Capability> = new Set([
  'view',
  'edit',
  'create',
  'delete',
  'reposition',
  'audit',
  'flag',
  'resolve_flag',
  'upload_plan',
  'manage_access',
  'configure',
  'export',
  'view_audit_log',
]);

const AUDITOR_CAPS: ReadonlySet<Capability> = new Set([
  'view',
  'audit',
  'flag',
  'resolve_flag',
]);

const TENANT_CAPS: ReadonlySet<Capability> = new Set(['view', 'flag', 'export']);

// Guest viewer (building share link). Read-only: view the plans/pins/photos and
// export the floor PDF catalogue — nothing else. Mirrors the `viewer` branch in
// private.user_can (returns true only for 'view'/'export' on the shared building).
const VIEWER_CAPS: ReadonlySet<Capability> = new Set(['view', 'export']);

function isExpired(g: Grant, now: number): boolean {
  if (!g.expires_at) return false;
  return new Date(g.expires_at).getTime() <= now;
}

/**
 * Pure function — evaluates whether `grants` includes any grant that authorizes
 * `capability` on `resource`. Mirrors (a simplified version of) the server-side
 * user_can() function. The server is still the source of truth; this is for
 * UI gating.
 *
 * For tenant-scoped resources we check the asset's tenant_scope_id outside this
 * function (the resource ID we're given is the asset id, but the grant is on
 * the tenant). Asset-scope checks happen at the query layer.
 */
export function checkCapability(
  grants: readonly Grant[],
  capability: Capability,
  resource: Resource,
  now: number = Date.now()
): boolean {
  // Super admin short-circuit.
  if (grants.some((g) => g.role === 'super_admin' && !isExpired(g, now))) {
    return true;
  }

  // No further authorization without an active grant.
  const active = grants.filter((g) => !isExpired(g, now));
  if (active.length === 0) return false;

  // For 'global' resource, require a super_admin (already handled above) — for
  // anything else, fall through to a 'view' check that means "do you have any
  // active grant at all?"
  if (resource.type === 'global') {
    return capability === 'view';
  }

  for (const g of active) {
    if (g.role === 'building_admin' && g.scope_type === 'building') {
      // Building admin authority covers their building and its descendants.
      if (resource.type === 'building' && resource.id === g.scope_id) {
        if (ADMIN_CAPS.has(capability)) return true;
      }
      // For floor/asset/tenant resources, the calling code resolves the parent
      // building first and passes resource.type === 'building'. (See useCan
      // wrapper below.)
    }

    if (g.role === 'auditor' && g.scope_type === 'floor') {
      if (resource.type === 'floor' && resource.id === g.scope_id) {
        if (AUDITOR_CAPS.has(capability)) return true;
      }
    }

    if (g.role === 'tenant_rep' && g.scope_type === 'tenant') {
      if (resource.type === 'tenant' && resource.id === g.scope_id) {
        if (TENANT_CAPS.has(capability)) return true;
      }
    }

    if (g.role === 'viewer' && g.scope_type === 'building') {
      // Guest viewer authority covers the shared building (callers resolve
      // floor/asset/tenant to the parent building, same as building_admin).
      if (resource.type === 'building' && resource.id === g.scope_id) {
        if (VIEWER_CAPS.has(capability)) return true;
      }
    }
  }

  return false;
}
