import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createBuilding,
  getBuilding,
  listBuildings,
  removeBuildingPhoto,
  signedBuildingPhotoUrl,
  updateBuildingSettings,
  uploadBuildingPhoto,
  type NewBuildingInput,
} from '@/lib/queries/buildings';
import { accessKeys } from '@/hooks/useAccess';
import type { Building } from '@/types/database';

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

/** Persist the building's settings jsonb (e.g. the configurable external link). */
export function useUpdateBuildingSettings(buildingId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: Building['settings']) => {
      if (!buildingId) throw new Error('No building selected');
      return updateBuildingSettings(buildingId, settings);
    },
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: buildingKeys.detail(b.id) });
      qc.invalidateQueries({ queryKey: buildingKeys.list() });
    },
  });
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
