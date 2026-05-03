import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listMembersForOrg,
  revokeMember,
  updateMemberRole,
  type Member,
  type RoleKey,
  ROLE_LEVEL,
} from '@/lib/queries/members';
import { useBuildings } from '@/hooks/useBuildings';
import { usePermissions } from '@/lib/permissions-context';

export const memberKeys = {
  all: ['members'] as const,
  byOrg: (orgId: string | null) => [...memberKeys.all, 'by-org', orgId] as const,
};

/**
 * Returns the member roster for the current user's primary org.
 * Same orgId-derivation pattern as useAssetTypes: pulled from the first
 * building the user has admin on.
 */
export function useMembers() {
  const { data: buildings } = useBuildings();
  const orgId = useMemo<string | null>(() => {
    if (!buildings) return null;
    const withOrg = buildings.find((b) => b.owner_org_id);
    return withOrg?.owner_org_id ?? null;
  }, [buildings]);

  const query = useQuery<Member[]>({
    queryKey: memberKeys.byOrg(orgId),
    queryFn: () => listMembersForOrg(orgId),
    enabled: orgId !== null,
    staleTime: 30_000,
  });

  return { ...query, orgId, list: query.data ?? [] };
}

/**
 * Resolves the current user's highest active role level. Used to
 * constrain the MembersCard role-change dropdown so a Manager can't
 * promote anyone to Manager (only Super admin can).
 */
export function useMyHighestRoleLevel(): number {
  const { grants, loading } = usePermissions();
  return useMemo(() => {
    if (loading) return 0;
    const now = Date.now();
    let max = 0;
    for (const g of grants) {
      if (g.expires_at && new Date(g.expires_at).getTime() <= now) continue;
      const lvl = ROLE_LEVEL[g.role as RoleKey] ?? 0;
      if (lvl > max) max = lvl;
    }
    return max;
  }, [grants, loading]);
}

export function useUpdateMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { grantId: string; newRole: RoleKey }) =>
      updateMemberRole(vars.grantId, vars.newRole),
    onSuccess: () => qc.invalidateQueries({ queryKey: memberKeys.all }),
  });
}

export function useRevokeMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (grantId: string) => revokeMember(grantId),
    onSuccess: () => qc.invalidateQueries({ queryKey: memberKeys.all }),
  });
}

export type { Member, RoleKey };
