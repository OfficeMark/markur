import { useEffect, useState } from 'react';
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
  uploadBuildingPhoto,
  type NewBuildingInput,
} from '@/lib/queries/buildings';
import type { PinShape, PinSize } from '@/lib/queries/branding';
import { accessKeys } from '@/hooks/useAccess';
import { floorKeys } from '@/hooks/useFloors';

export const buildingKeys = {
  all: ['buildings'] as const,
  list: () => [...buildingKeys.all, 'list'] as const,
  detail: (id: string) => [...buildingKeys.all, 'detail', id] as const,
  photoUrl: (path: string) => ['building-photos', 'signed', path] as const,
};

export function useBuildings() {
  return useQuery({
    queryKey: buildingKeys.list(),
    queryFn: listBuildings,
  });
}

export function useBuilding(id: string | undefined) {
  return useQuery({
    queryKey: id ? buildingKeys.detail(id) : ['buildings', 'detail', 'none'],
    queryFn: () => (id ? getBuilding(id) : Promise.resolve(null)),
    enabled: !!id,
  });
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: buildingKeys.list() });
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
      qc.invalidateQueries({ queryKey: accessKeys.all });
    },
  });
}

/**
 * Resolves a signed URL for a building photo path. Returns `null` until the
 * URL arrives so consumers can render a placeholder while loading.
 */
export function useBuildingPhotoUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setUrl(null);
      return;
    }
    void signedBuildingPhotoUrl(path).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return url;
}

export function useUploadBuildingPhoto(buildingId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      if (!buildingId) throw new Error('No building selected');
      return uploadBuildingPhoto(buildingId, file);
    },
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: buildingKeys.detail(b.id) });
      qc.invalidateQueries({ queryKey: buildingKeys.list() });
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: buildingKeys.all });
      qc.invalidateQueries({ queryKey: floorKeys.all });
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
      qc.invalidateQueries({ queryKey: buildingKeys.detail(b.id) });
      qc.invalidateQueries({ queryKey: buildingKeys.list() });
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
      qc.invalidateQueries({ queryKey: buildingKeys.detail(b.id) });
      qc.invalidateQueries({ queryKey: buildingKeys.list() });
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
      qc.invalidateQueries({ queryKey: buildingKeys.detail(b.id) });
      qc.invalidateQueries({ queryKey: buildingKeys.list() });
    },
  });
}
