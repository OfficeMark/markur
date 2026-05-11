import { useQuery } from '@tanstack/react-query';
import { useBuildings } from '@/hooks/useBuildings';
import { useIsSuperAdmin } from '@/lib/permissions-context';
import {
  listAllOrganizations,
  listOrganizationsByIds,
  type OrgOption,
} from '@/lib/queries/organizations';

/**
 * Orgs the signed-in user can assign a new building to (M24).
 *
 * super_admin → every organization in the system.
 * Everyone else → the orgs they already have a building-admin grant on,
 * derived by deduping owner_org_id across their accessible buildings.
 * (RLS on `buildings` already filters to grants the user holds.)
 */
export function useOrgPickerOptions(): {
  options: OrgOption[];
  loading: boolean;
} {
  const isSuper = useIsSuperAdmin();
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
    enabled: !isSuper && buildings.isSuccess && orgIds.length > 0,
  });

  const allOrgs = useQuery({
    queryKey: ['org-picker', 'all'],
    queryFn: listAllOrganizations,
    enabled: isSuper,
  });

  if (isSuper) {
    return { options: allOrgs.data ?? [], loading: allOrgs.isLoading };
  }
  if (!buildings.isSuccess) {
    return { options: [], loading: true };
  }
  if (orgIds.length === 0) {
    return { options: [], loading: false };
  }
  return { options: namedFromBuildings.data ?? [], loading: namedFromBuildings.isLoading };
}
