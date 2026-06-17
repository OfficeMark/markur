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
import { usePermissions } from '@/lib/permissions-context';
import { useAppBootRaw, patchAppBoot } from '@/hooks/useAppBootQuery';

export const brandingKeys = {
  all: ['branding'] as const,
  byOrg: (orgId: string | null) => [...brandingKeys.all, 'by-org', orgId] as const,
};

export function useOrgBranding(orgIdOverride?: string | null) {
  const { grants } = usePermissions();
  // The shared app_boot query (real loading state) — carries branding for every
  // org the user can see, so the always-mounted logo / pin appearance don't fire
  // a separate org_branding request.
  const boot = useAppBootRaw();
  // Resolve the org id from the org-scope grant, falling back to the owning org
  // of any visible building (read from app_boot, not a separate buildings fetch).
  //
  // Guests have no org grant → null; the guest path passes the viewed building's
  // owner_org_id explicitly via orgIdOverride.
  const derivedOrgId = useMemo<string | null>(() => {
    const fromGrant = grants.find((g) => g.scope_type === 'organization')?.scope_id;
    if (fromGrant) return fromGrant;
    return boot.data?.buildings.find((b) => b.owner_org_id)?.owner_org_id ?? null;
  }, [grants, boot.data]);
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
    // Fetch only when app_boot can't answer: a guest (no bundle), or the bundle
    // failed to load (no data and not loading). When the bundle IS loaded we
    // trust it fully — an org absent from it simply has no branding row.
    enabled: orgId !== null && (isGuest || (!boot.data && !boot.isLoading)),
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
    onSuccess: (br) => {
      // Patch this org's branding into app_boot in place (no whole-boot refetch).
      patchAppBoot(qc, (boot) => ({
        ...boot,
        branding: boot.branding.some((x) => x.org_id === br.org_id)
          ? boot.branding.map((x) => (x.org_id === br.org_id ? br : x))
          : [...boot.branding, br],
      }));
      qc.invalidateQueries({ queryKey: brandingKeys.all });
    },
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
