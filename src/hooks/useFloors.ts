import {
  createFloor,
  getFloor,
  listFloorsByBuilding,
  nextFloorSortOrder,
  setFloorNotes,
  setFloorProvenance,
  softDeleteFloor,
  type NewFloorInput,
} from '@/lib/queries/floors';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export const floorKeys = {
  all: ['floors'] as const,
  byBuilding: (buildingId: string) => [...floorKeys.all, 'by-building', buildingId] as const,
  detail: (id: string) => [...floorKeys.all, 'detail', id] as const,
};

export function useFloors(buildingId: string | undefined) {
  return useQuery({
    queryKey: buildingId ? floorKeys.byBuilding(buildingId) : ['floors', 'by-building', 'none'],
    queryFn: () => (buildingId ? listFloorsByBuilding(buildingId) : Promise.resolve([])),
    enabled: !!buildingId,
    // Stable + invalidated on mutation; a longer staleTime lets the get_app_boot
    // seed (per-building floors) satisfy the sidebar nav instead of re-fetching
    // every building's floors one at a time on each navigation.
    staleTime: 5 * 60_000,
  });
}

/**
 * Thrown when a floor reads back empty right after it (or its parent building's
 * grant) was created. Floors have no grant-minting insert trigger — access is
 * inherited from the building grant — so a brand-new floor can momentarily read
 * back empty while that grant becomes visible to RLS / through the read-after-
 * write window. Same family of race as the building-create read-back. We throw
 * (rather than return null) so the query retries and self-heals; a genuinely
 * missing or no-access floor settles to "not found" after the retries.
 */
export class FloorNotReadyError extends Error {
  constructor() {
    super('Floor not visible yet');
    this.name = 'FloorNotReadyError';
  }
}

export function useFloor(id: string | undefined) {
  return useQuery({
    queryKey: id ? floorKeys.detail(id) : ['floors', 'detail', 'none'],
    queryFn: async () => {
      if (!id) return null;
      const floor = await getFloor(id);
      if (floor === null) throw new FloorNotReadyError();
      return floor;
    },
    enabled: !!id,
    // Retry only the transient "not visible yet" miss, briefly, so the first
    // 60 seconds of a fresh signup (create building → create floor → open it)
    // doesn't dead-end on a hard "floor not found".
    retry: (failureCount, error) =>
      error instanceof FloorNotReadyError && failureCount < 3,
    retryDelay: (attempt) => Math.min(300 * 2 ** attempt, 1200),
  });
}

export function useCreateFloor(buildingId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { label: string; sort_order?: number }) => {
      if (!buildingId) throw new Error('Building id required');
      let sort = input.sort_order;
      if (sort === undefined) sort = await nextFloorSortOrder(buildingId);
      return createFloor({ building_id: buildingId, label: input.label, sort_order: sort });
    },
    onSuccess: () => {
      if (buildingId) qc.invalidateQueries({ queryKey: floorKeys.byBuilding(buildingId) });
      qc.invalidateQueries({ queryKey: floorKeys.all });
    },
  });
}

export function useSoftDeleteFloor(buildingId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => softDeleteFloor(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: floorKeys.detail(id) });
      if (buildingId) qc.invalidateQueries({ queryKey: floorKeys.byBuilding(buildingId) });
      qc.invalidateQueries({ queryKey: floorKeys.all });
    },
  });
}

/** Set the floor's plan provenance (the source label). */
export function useSetFloorProvenance(floorId: string | undefined, buildingId?: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provenance: string) => {
      if (!floorId) throw new Error('No floor');
      return setFloorProvenance(floorId, provenance);
    },
    onSuccess: () => {
      if (floorId) qc.invalidateQueries({ queryKey: floorKeys.detail(floorId) });
      if (buildingId) qc.invalidateQueries({ queryKey: floorKeys.byBuilding(buildingId) });
    },
  });
}

/** Set the floor-wide notes (team-only free text). */
export function useSetFloorNotes(floorId: string | undefined, buildingId?: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (notes: string) => {
      if (!floorId) throw new Error('No floor');
      return setFloorNotes(floorId, notes);
    },
    onSuccess: () => {
      if (floorId) qc.invalidateQueries({ queryKey: floorKeys.detail(floorId) });
      if (buildingId) qc.invalidateQueries({ queryKey: floorKeys.byBuilding(buildingId) });
    },
  });
}

export type { NewFloorInput };
