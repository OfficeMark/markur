import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { usePermissions } from '@/lib/permissions-context';

/**
 * Tenant-rep-only users land directly on their floor. Per spec 04 §
 * Scoping rules: "The building list is bypassed entirely — they land
 * directly on their floor on login."
 *
 * Returns the floor URL the tenant_rep should be redirected to, or null
 * if the user is not tenant_rep-only (or perms are still loading).
 *
 * Edge cases:
 *   * No active grants → null (the empty-state in Home handles them).
 *   * Mixed grants (tenant_rep + auditor) → null (they're an admin too,
 *     show the normal building/floor list).
 *   * Multiple tenant_rep grants pointing at different floors → pick the
 *     first one. (M10 polish can offer a chooser if this becomes real.)
 *   * Grant points at a tenant whose primary_floor_id is null → null
 *     (we can't direct-link them; fall back to normal navigation).
 */
export function useTenantRepRedirect(): {
  loading: boolean;
  redirectTo: string | null;
} {
  const { grants, loading: pLoading } = usePermissions();

  const now = Date.now();
  const active = grants.filter(
    (g) => !g.expires_at || new Date(g.expires_at).getTime() > now
  );
  const isTenantRepOnly =
    active.length > 0 &&
    active.every((g) => g.role === 'tenant_rep');
  const firstTenantId = isTenantRepOnly
    ? active.find((g) => g.scope_type === 'tenant')?.scope_id ?? null
    : null;

  const { data, isLoading } = useQuery({
    queryKey: firstTenantId
      ? ['tenants', 'primary-floor', firstTenantId]
      : ['tenants', 'primary-floor', 'none'],
    queryFn: async () => {
      if (!firstTenantId) return null;
      const { data, error } = await supabase
        .from('tenants')
        .select('id, primary_floor_id')
        .eq('id', firstTenantId)
        .maybeSingle();
      if (error) throw error;
      return data?.primary_floor_id ?? null;
    },
    enabled: !!firstTenantId,
  });

  return {
    loading: pLoading || (isTenantRepOnly && isLoading),
    redirectTo: data ? `/floors/${data}` : null,
  };
}
