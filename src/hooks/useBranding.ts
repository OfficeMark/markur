import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteOrgLogo,
  getOrgBranding,
  logoPublicUrl,
  saveOrgBranding,
  uploadOrgLogo,
  type OrgBranding,
  type SaveOrgBrandingInput,
} from '@/lib/queries/branding';
import { useBuildings } from '@/hooks/useBuildings';

export const brandingKeys = {
  all: ['branding'] as const,
  byOrg: (orgId: string | null) => [...brandingKeys.all, 'by-org', orgId] as const,
};

export function useOrgBranding() {
  const { data: buildings } = useBuildings();
  const orgId = useMemo<string | null>(() => {
    if (!buildings) return null;
    const withOrg = buildings.find((b) => b.owner_org_id);
    return withOrg?.owner_org_id ?? null;
  }, [buildings]);

  const query = useQuery<OrgBranding | null>({
    queryKey: brandingKeys.byOrg(orgId),
    queryFn: () => (orgId ? getOrgBranding(orgId) : Promise.resolve(null)),
    enabled: orgId !== null,
    staleTime: 30_000,
  });

  const logoUrl = useMemo(
    () => logoPublicUrl(query.data?.logo_path ?? null),
    [query.data?.logo_path]
  );

  return { ...query, orgId, branding: query.data ?? null, logoUrl };
}

export function useSaveBranding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveOrgBrandingInput) => saveOrgBranding(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: brandingKeys.all }),
  });
}

export function useUploadLogo() {
  return useMutation({
    mutationFn: (vars: { orgId: string; file: File }) => uploadOrgLogo(vars.orgId, vars.file),
  });
}

export function useDeleteLogo() {
  return useMutation({
    mutationFn: (path: string) => deleteOrgLogo(path),
  });
}

export type { OrgBranding };
