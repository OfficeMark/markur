import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getBuilding,
  listBuildings,
  removeBuildingPhoto,
  signedBuildingPhotoUrl,
  uploadBuildingPhoto,
} from '@/lib/queries/buildings';

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
