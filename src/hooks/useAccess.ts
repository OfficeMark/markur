import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acceptInvitation,
  cancelInvitation,
  createInvitation,
  listGrantsForBuilding,
  listPendingInvitationsForBuilding,
  lookupInvitation,
  revokeGrant,
  type BuildingScopeRefs,
  type CreateInvitationInput,
} from '@/lib/queries/access';

export const accessKeys = {
  all: ['access'] as const,
  grantsByBuilding: (id: string) => [...accessKeys.all, 'grants', 'by-building', id] as const,
  pendingByBuilding: (id: string) =>
    [...accessKeys.all, 'pending', 'by-building', id] as const,
  invitation: (token: string) => [...accessKeys.all, 'invitation', token] as const,
};

export function useBuildingGrants(
  buildingId: string | undefined,
  refs?: BuildingScopeRefs
) {
  return useQuery({
    queryKey: buildingId
      ? accessKeys.grantsByBuilding(buildingId)
      : ['access', 'grants', 'by-building', 'none'],
    queryFn: () => (buildingId ? listGrantsForBuilding(buildingId, refs) : Promise.resolve([])),
    enabled: !!buildingId,
  });
}

export function usePendingInvitations(
  buildingId: string | undefined,
  refs?: BuildingScopeRefs
) {
  return useQuery({
    queryKey: buildingId
      ? accessKeys.pendingByBuilding(buildingId)
      : ['access', 'pending', 'by-building', 'none'],
    queryFn: () =>
      buildingId ? listPendingInvitationsForBuilding(buildingId, refs) : Promise.resolve([]),
    enabled: !!buildingId,
  });
}

export function useCreateInvitation(buildingId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInvitationInput) => createInvitation(input),
    onSuccess: () => {
      if (buildingId) {
        qc.invalidateQueries({ queryKey: accessKeys.pendingByBuilding(buildingId) });
      }
    },
  });
}

export function useRevokeGrant(buildingId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokeGrant(id),
    onSuccess: () => {
      if (buildingId) {
        qc.invalidateQueries({ queryKey: accessKeys.grantsByBuilding(buildingId) });
      }
    },
  });
}

export function useCancelInvitation(buildingId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelInvitation(id),
    onSuccess: () => {
      if (buildingId) {
        qc.invalidateQueries({ queryKey: accessKeys.pendingByBuilding(buildingId) });
      }
    },
  });
}

export function useLookupInvitation(token: string | undefined) {
  return useQuery({
    queryKey: token ? accessKeys.invitation(token) : ['access', 'invitation', 'none'],
    queryFn: () => (token ? lookupInvitation(token) : Promise.resolve({ kind: 'invalid' as const })),
    enabled: !!token,
    retry: false,
    staleTime: 0,
  });
}

export function useAcceptInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => acceptInvitation(token),
    onSuccess: () => {
      // The user just got a new grant — every permission-driven query is suspect.
      qc.invalidateQueries();
    },
  });
}
