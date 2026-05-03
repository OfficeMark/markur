import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listInvitationsForOrg,
  resendInvitation,
  revokeInvitation,
  type AdminInvitation,
} from '@/lib/queries/invitations';
import { useBuildings } from '@/hooks/useBuildings';

export const invitationKeys = {
  all: ['invitations'] as const,
  byOrg: (orgId: string | null) => [...invitationKeys.all, 'by-org', orgId] as const,
};

/**
 * Pending invitations across the user's primary org. Same orgId-
 * derivation pattern as useMembers / useAssetTypes.
 */
export function useInvitations() {
  const { data: buildings } = useBuildings();
  const orgId = useMemo<string | null>(() => {
    if (!buildings) return null;
    const withOrg = buildings.find((b) => b.owner_org_id);
    return withOrg?.owner_org_id ?? null;
  }, [buildings]);

  const query = useQuery<AdminInvitation[]>({
    queryKey: invitationKeys.byOrg(orgId),
    queryFn: () => listInvitationsForOrg(orgId),
    enabled: orgId !== null,
    staleTime: 30_000,
  });

  return { ...query, orgId, list: query.data ?? [] };
}

export function useResendInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) => resendInvitation(invitationId),
    onSuccess: () => qc.invalidateQueries({ queryKey: invitationKeys.all }),
  });
}

export function useRevokeInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) => revokeInvitation(invitationId),
    onSuccess: () => qc.invalidateQueries({ queryKey: invitationKeys.all }),
  });
}

export type { AdminInvitation };
