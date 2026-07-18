import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  claimDemoLink,
  createDemoLink,
  listDemoLinkClaims,
  listDemoLinks,
  peekDemoLink,
  revokeDemoLink,
  type DemoPeriodDays,
} from '@/lib/queries/demo-links';

export const demoLinkKeys = {
  all: ['demo-links'] as const,
  byBuilding: (id: string) => [...demoLinkKeys.all, 'by-building', id] as const,
  claimsByBuilding: (id: string) => [...demoLinkKeys.all, 'claims', id] as const,
  peek: (token: string) => [...demoLinkKeys.all, 'peek', token] as const,
};

export function useDemoLinks(buildingId: string | undefined) {
  return useQuery({
    queryKey: buildingId ? demoLinkKeys.byBuilding(buildingId) : ['demo-links', 'none'],
    queryFn: () => (buildingId ? listDemoLinks(buildingId) : Promise.resolve([])),
    enabled: !!buildingId,
  });
}

export function useDemoLinkClaims(buildingId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: buildingId
      ? demoLinkKeys.claimsByBuilding(buildingId)
      : ['demo-links', 'claims', 'none'],
    queryFn: () => (buildingId ? listDemoLinkClaims(buildingId) : Promise.resolve([])),
    enabled: !!buildingId && enabled,
  });
}

export function useCreateDemoLink(buildingId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (days: DemoPeriodDays) => {
      if (!buildingId) throw new Error('No building');
      return createDemoLink(buildingId, days);
    },
    onSuccess: () => {
      if (buildingId) qc.invalidateQueries({ queryKey: demoLinkKeys.byBuilding(buildingId) });
    },
  });
}

export function useRevokeDemoLink(buildingId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) => revokeDemoLink(invitationId),
    onSuccess: () => {
      if (buildingId) {
        qc.invalidateQueries({ queryKey: demoLinkKeys.byBuilding(buildingId) });
        qc.invalidateQueries({ queryKey: demoLinkKeys.claimsByBuilding(buildingId) });
      }
    },
  });
}

export function usePeekDemoLink(token: string | undefined) {
  return useQuery({
    queryKey: token ? demoLinkKeys.peek(token) : ['demo-links', 'peek', 'none'],
    queryFn: () => {
      if (!token) throw new Error('No token');
      return peekDemoLink(token);
    },
    enabled: !!token,
    staleTime: 60_000,
    retry: 1,
  });
}

export function useClaimDemoLink() {
  return useMutation({
    mutationFn: (token: string) => claimDemoLink(token),
  });
}
