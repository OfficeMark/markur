import { useQuery } from '@tanstack/react-query';
import { useBuildings } from '@/hooks/useBuildings';
import { useAppBootRaw } from '@/hooks/useAppBootQuery';
import { useIsSuperAdmin } from '@/lib/permissions-context';
import {
  listAllOrganizations,
  listOrganizationsByIds,
  type OrgOption,
} from '@/lib/queries/organizations';

/**
 * Orgs the signed-in user can assign a new building to (M24).
 *
 * super_admin → every organization in the system (must fetch; app_boot only
 *   carries the user's own orgs).
 * Everyone else → the orgs they already have a building-admin grant on, read
 *   straight from app_boot.organizations (filtered to the orgs that own a
 *   visible building) — no separate organizations fetch. Falls back to a fetch
 *   only if the bundle failed to load.
 */
export function useOrgPickerOptions(): {
  options: OrgOption[];
  loading: boolean;
} {
  const isSuper = useIsSuperAdmin();
  const boot = useAppBootRaw();
  const buildings = useBuildings();

  const orgIds = Array.from(
    new Set(
      (buildings.data ?? [])
        .map((b) => b.owner_org_id)
        .filter((v): v is string => typeof v === 'string')
    )
  ).sort();

  const namedFromBuildings = useQuery({
    queryKey: ['org-picker', 'by-ids', orgIds],
    queryFn: () => listOrganizationsByIds(orgIds),
    // Only when app_boot can't answer (errored) — otherwise we read it below.
    enabled: !isSuper && !boot.data && !boot.isLoading && orgIds.length > 0,
  });

  const allOrgs = useQuery({
    queryKey: ['org-picker', 'all'],
    queryFn: listAllOrganizations,
    enabled: isSuper,
  });

  if (isSuper) {
    return { options: allOrgs.data ?? [], loading: allOrgs.isLoading };
  }
  if (boot.data) {
    const idSet = new Set(orgIds);
    const options = boot.data.organizations
      .filter((o) => idSet.has(o.id))
      .map((o) => ({ id: o.id, name: o.name }));
    return { options, loading: false };
  }
  if (boot.isLoading) {
    return { options: [], loading: true };
  }
  if (orgIds.length === 0) {
    return { options: [], loading: false };
  }
  return { options: namedFromBuildings.data ?? [], loading: namedFromBuildings.isLoading };
}
