import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createBuilding,
  createBuildingNoReturn,
  getBuilding,
  listBuildings,
  listDeletedBuildings,
  removeBuildingPhoto,
  restoreBuilding,
  setBuildingExternalLink,
  setBuildingPinAppearance,
  signedBuildingPhotoUrl,
  softDeleteBuilding,
  updateBuildingName,
  uploadBuildingPhoto,
  type NewBuildingInput,
} from '@/lib/queries/buildings';
import type { PinShape, PinSize } from '@/lib/queries/branding';
import type { BuildingView } from '@/lib/queries/bundles';
import type { Building } from '@/types/database';
import { accessKeys } from '@/hooks/useAccess';
import { floorKeys } from '@/hooks/useFloors';
import { useAppBootRaw, patchAppBoot } from '@/hooks/useAppBootQuery';
import type { QueryClient } from '@tanstack/react-query';

/** Update one building's row in the cached app_boot, preserving its floors. */
function patchBuildingInBoot(qc: QueryClient, b: Building) {
  patchAppBoot(qc, (boot) => ({
    ...boot,
    buildings: boot.buildings.map((x) => (x.id === b.id ? { ...b, floors: x.floors } : x)),
  }));
}

export const buildingKeys = {
  all: ['buildings'] as const,
  list: () => [...buildingKeys.all, 'list'] as const,
  detail: (id: string) => [...buildingKeys.all, 'detail', id] as const,
  photoUrl: (path: string) => ['building-photos', 'signed', path] as const,
};

/**
 * The buildings list — read straight from the app_boot bundle (which carries
 * every building the user can see). Falls back to its own fetch only if the
 * bundle errored or genuinely lacks it, so this is never worse than fetching.
 * Mutations invalidate ['app-boot'] so the list refreshes after edits.
 */
export function useBuildings() {
  const boot = useAppBootRaw();
  const fromBoot = boot.data ? boot.data.buildings.map(({ floors: _f, ...b }) => b) : null;
  const query = useQuery({
    queryKey: buildingKeys.list(),
    queryFn: listBuildings,
    enabled: !fromBoot && !boot.isLoading,
    staleTime: 5 * 60_000,
  });
  return {
    ...query,
    data: fromBoot ?? query.data,
    isLoading: fromBoot ? false : boot.isLoading || query.isLoading,
  };
}

export function useBuilding(id: string | undefined) {
  const boot = useAppBootRaw();
  const bootRow = id && boot.data ? boot.data.buildings.find((b) => b.id === id) : undefined;
  const fromBoot = bootRow ? (({ floors: _f, ...b }) => b)(bootRow) : null;
  const query = useQuery({
    queryKey: id ? buildingKeys.detail(id) : ['buildings', 'detail', 'none'],
    queryFn: () => (id ? getBuilding(id) : Promise.resolve(null)),
    enabled: !!id && !fromBoot && !boot.isLoading,
  });
  return {
    ...query,
    data: fromBoot ?? query.data,
    isLoading: !id ? false : fromBoot ? false : boot.isLoading || query.isLoading,
  };
}

/**
 * Create a new building (M10h). The trigger on the buildings table also
 * inserts a building_admin grant for the creator, so we invalidate the
 * permissions cache after success.
 */
export function useCreateBuilding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewBuildingInput) => createBuilding(input),
    onSuccess: (b) => {
      // Add the new building to app_boot in place (it has no floors yet).
      patchAppBoot(qc, (boot) => ({
        ...boot,
        buildings: boot.buildings.some((x) => x.id === b.id)
          ? boot.buildings
          : [...boot.buildings, { ...b, floors: [] }],
      }));
      qc.invalidateQueries({ queryKey: accessKeys.all });
    },
  });
}

/**
 * First-run onboarding variant: inserts without the RETURNING read-back that a
 * brand-new org admin can't satisfy under the buildings SELECT policy. Same
 * cache invalidation as useCreateBuilding.
 */
export function useCreateBuildingNoReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewBuildingInput) => createBuildingNoReturn(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: buildingKeys.list() });
      qc.invalidateQueries({ queryKey: ['app-boot'] });
      qc.invalidateQueries({ queryKey: accessKeys.all });
    },
  });
}

/**
 * Resolves a signed URL for a building photo path. Returns `null` until the
 * URL arrives so consumers can render a placeholder while loading.
 *
 * Cached by path through TanStack Query so a photo is signed once and reused
 * across every BuildingCard, re-render, and remount (the signed URL lives 1h;
 * we re-sign at most every 30 min). The previous useState/useEffect version
 * re-minted a fresh signed URL on every mount, which the boot re-render churn
 * turned into a storm of POST-sign + GET round-trips.
 */
export function useBuildingPhotoUrl(path: string | null | undefined): string | null {
  const { data } = useQuery({
    queryKey: path ? buildingKeys.photoUrl(path) : ['building-photos', 'signed', 'none'],
    queryFn: () => signedBuildingPhotoUrl(path),
    enabled: !!path,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
  });
  return data ?? null;
}

export function useUploadBuildingPhoto(buildingId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      if (!buildingId) throw new Error('No building selected');
      return uploadBuildingPhoto(buildingId, file);
    },
    onSuccess: (b) => {
      patchBuildingInBoot(qc, b);
    },
  });
}

/** Soft-deleted buildings (super-admin Trash). */
export function useDeletedBuildings() {
  return useQuery({
    queryKey: [...buildingKeys.all, 'deleted'] as const,
    queryFn: listDeletedBuildings,
  });
}

/** Soft-delete a building + cascade its floors. Invalidates lists/floors/grants. */
export function useSoftDeleteBuilding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => softDeleteBuilding(id),
    onSuccess: (_data, id) => {
      // Drop the building from app_boot in place.
      patchAppBoot(qc, (boot) => ({
        ...boot,
        buildings: boot.buildings.filter((x) => x.id !== id),
      }));
      qc.invalidateQueries({ queryKey: accessKeys.all });
    },
  });
}

/** Restore a soft-deleted building + its cascade-deleted floors. */
export function useRestoreBuilding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; deletedAt: string }) => restoreBuilding(vars.id, vars.deletedAt),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: buildingKeys.all });
      qc.invalidateQueries({ queryKey: floorKeys.all });
      qc.invalidateQueries({ queryKey: ['app-boot'] });
    },
  });
}

/** Save the per-building pin shape/size to buildings.settings. */
export function useSetBuildingPinAppearance(buildingId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (appearance: { pin_shape: PinShape; pin_size: PinSize }) => {
      if (!buildingId) throw new Error('No building selected');
      return setBuildingPinAppearance(buildingId, appearance);
    },
    onSuccess: (b) => {
      patchBuildingInBoot(qc, b);
    },
  });
}

/** Save the per-building external link config to buildings.settings. */
export function useSetBuildingExternalLink(buildingId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (link: { mode: 'default' | 'custom' | 'hidden'; label: string; url: string }) => {
      if (!buildingId) throw new Error('No building selected');
      return setBuildingExternalLink(buildingId, link);
    },
    onSuccess: (b) => {
      patchBuildingInBoot(qc, b);
    },
  });
}

/**
 * Rename a building. The renamed row is patched into every cache that shows the
 * name without a refetch: `patchBuildingInBoot` covers the Home cards, the
 * sidebar nav, and useBuilding(id); the building-view bundle
 * (`['building-view', id]`, keyed separately from app_boot — see useBundles) is
 * patched too so the building detail header + breadcrumb update immediately.
 */
export function useUpdateBuildingName(buildingId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => {
      if (!buildingId) throw new Error('No building selected');
      return updateBuildingName(buildingId, name);
    },
    onSuccess: (b) => {
      patchBuildingInBoot(qc, b);
      qc.setQueryData<BuildingView>(['building-view', b.id], (prev) =>
        prev ? { ...prev, building: b } : prev
      );
    },
  });
}

export function useRemoveBuildingPhoto(buildingId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (!buildingId) throw new Error('No building selected');
      return removeBuildingPhoto(buildingId);
    },
    onSuccess: (b) => {
      patchBuildingInBoot(qc, b);
    },
  });
}
