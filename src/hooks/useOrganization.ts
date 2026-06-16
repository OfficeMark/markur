import { useQuery } from '@tanstack/react-query';
import { usePermissions } from '@/lib/permissions-context';
import { getOrgStatus, type OrgStatus } from '@/lib/queries/organizations';
import { evaluateOrgTrial, type TrialEvaluation } from '@/lib/trial';

export type OrgSubscriptionState = TrialEvaluation & {
  orgId: string | null;
  /** True when the signed-in user is this org's admin (org-scoped grant). */
  isOrgAdmin: boolean;
  org: OrgStatus | null;
  isLoading: boolean;
};

/**
 * Subscription/trial state for the signed-in user's org. Resolves the org from
 * the user's ORGANIZATION-scoped grant (not from buildings — those go through
 * user_can, which a locked org can't read). Drives the lockout screen + the
 * 7-day banner. Returns not-locked while loading so we never flash a lockout.
 */
export function useOrgSubscription(): OrgSubscriptionState {
  const { grants, loading: grantsLoading } = usePermissions();

  const now = Date.now();
  const orgGrant = grants.find(
    (g) =>
      g.scope_type === 'organization' &&
      g.scope_id &&
      (!g.expires_at || new Date(g.expires_at).getTime() > now)
  );
  const orgId = orgGrant?.scope_id ?? null;
  const isOrgAdmin = orgGrant?.role === 'building_admin';

  const query = useQuery({
    queryKey: ['org-status', orgId],
    queryFn: () => getOrgStatus(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const evald = evaluateOrgTrial(query.data, now);

  return {
    orgId,
    isOrgAdmin,
    org: query.data ?? null,
    isLoading: grantsLoading || (!!orgId && query.isLoading),
    ...evald,
  };
}
