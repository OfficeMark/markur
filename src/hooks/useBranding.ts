import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_PIN_SHAPE,
  DEFAULT_PIN_SIZE,
  deleteOrgLogo,
  getOrgBranding,
  logoPublicUrl,
  saveOrgBranding,
  uploadOrgLogo,
  type OrgBranding,
  type PinShape,
  type PinSize,
  type SaveOrgBrandingInput,
} from '@/lib/queries/branding';
import { useBuildings } from '@/hooks/useBuildings';
import { usePermissions } from '@/lib/permissions-context';
import type { AppBoot } from '@/lib/queries/bundles';

export const brandingKeys = {
  all: ['branding'] as const,
  byOrg: (orgId: string | null) => [...brandingKeys.all, 'by-org', orgId] as const,
};

export function useOrgBranding(orgIdOverride?: string | null) {
  const { data: buildings } = useBuildings();
  const { grants } = usePermissions();
  // Read-only subscription to the app_boot cache (populated by useAppBoot at
  // the app root). enabled:false → never fetches here; just re-renders when the
  // bundle lands. (A direct import of useAppBoot would cycle: useBundles imports
  // brandingKeys from this module.)
  const boot = useQuery<AppBoot>({ queryKey: ['app-boot'], enabled: false });
  // Resolve the org id from the early org-scope grant before falling back to the
  // (late-loading) buildings list, so branding/logo fetches in parallel with
  // boot instead of behind buildings. Same pattern as useAssetTypes.
  //
  // Guests have no org grant and an empty buildings list → null; the guest path
  // passes the viewed building's owner_org_id explicitly via orgIdOverride.
  const derivedOrgId = useMemo<string | null>(() => {
    const fromGrant = grants.find((g) => g.scope_type === 'organization')?.scope_id;
    if (fromGrant) return fromGrant;
    return buildings?.find((b) => b.owner_org_id)?.owner_org_id ?? null;
  }, [grants, buildings]);
  const orgId = orgIdOverride !== undefined ? orgIdOverride : derivedOrgId;

  // Authed path: read this org's branding straight from the app_boot bundle (it
  // carries branding for every org the user can see), so the AppShell logo /
  // pin appearance don't fire a separate org_branding request. The guest path
  // (orgIdOverride set) has no app_boot, so it keeps its own fetch.
  const isGuest = orgIdOverride !== undefined;
  const fromBoot =
    !isGuest && orgId ? boot.data?.branding.find((b) => b.org_id === orgId) ?? null : null;

  const query = useQuery<OrgBranding | null>({
    queryKey: brandingKeys.byOrg(orgId),
    queryFn: () => (orgId ? getOrgBranding(orgId) : Promise.resolve(null)),
    // Only fetch when we can't read it from app_boot (guest, or boot not yet in).
    enabled: orgId !== null && (isGuest || (!fromBoot && !boot.isLoading)),
    staleTime: 30_000,
  });

  const branding = fromBoot ?? query.data ?? null;

  const logoUrl = useMemo(
    () => logoPublicUrl(branding?.logo_path ?? null),
    [branding?.logo_path]
  );

  const pinShape: PinShape = branding?.pin_shape ?? DEFAULT_PIN_SHAPE;
  const pinSize: PinSize = branding?.pin_size ?? DEFAULT_PIN_SIZE;

  return { ...query, orgId, branding, logoUrl, pinShape, pinSize };
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
