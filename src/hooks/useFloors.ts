import {
  createFloor,
  getFloor,
  listDeletedFloorsByBuilding,
  listFloorsByBuilding,
  nextFloorSortOrder,
  restoreFloor,
  setFloorNotes,
  setFloorProvenance,
  softDeleteFloor,
  type NewFloorInput,
} from '@/lib/queries/floors';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppBootRaw, patchAppBoot } from '@/hooks/useAppBootQuery';
import type { Floor } from '@/types/database';

export const floorKeys = {
  all: ['floors'] as const,
  byBuilding: (buildingId: string) => [...floorKeys.all, 'by-building', buildingId] as const,
  deletedByBuilding: (buildingId: string) =>
    [...floorKeys.all, 'deleted-by-building', buildingId] as const,
  detail: (id: string) => [...floorKeys.all, 'detail', id] as const,
};

/**
 * Floors for a building — read from the app_boot bundle (buildings carry their
 * floors nested), falling back to a fetch only if the bundle lacks the building.
 * Mutations invalidate ['app-boot'] (+ building-view) so floors refresh.
 */
export function useFloors(buildingId: string | undefined) {
  const boot = useAppBootRaw();
  const fromBoot =
    buildingId && boot.data
      ? boot.data.buildings.find((b) => b.id === buildingId)?.floors ?? null
      : null;
  const query = useQuery({
    queryKey: buildingId ? floorKeys.byBuilding(buildingId) : ['floors', 'by-building', 'none'],
    queryFn: () => (buildingId ? listFloorsByBuilding(buildingId) : Promise.resolve([])),
    enabled: !!buildingId && !fromBoot && !boot.isLoading,
    staleTime: 5 * 60_000,
  });
  return {
    ...query,
    data: fromBoot ?? query.data,
    isLoading: !buildingId ? false : fromBoot ? false : boot.isLoading || query.isLoading,
  };
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
  const boot = useAppBootRaw();
  const qc = useQueryClient();
  const fromBoot =
    id && boot.data
      ? boot.data.buildings.flatMap((b) => b.floors).find((f) => f.id === id) ?? null
      : null;
  const query = useQuery({
    queryKey: id ? floorKeys.detail(id) : ['floors', 'detail', 'none'],
    // Seed from any already-loaded floors list (the sidebar fetches every
    // building's floors). The floor row — plan_url + stamp included — is
    // usually already in cache when the user taps a floor, so the plan's
    // signed-URL query can start immediately instead of waiting a full
    // detail round trip. Placeholder only: the real fetch still runs.
    placeholderData: () => {
      if (!id) return undefined;
      for (const [, rows] of qc.getQueriesData<Floor[]>({
        queryKey: [...floorKeys.all, 'by-building'],
      })) {
        const hit = rows?.find((f) => f.id === id);
        if (hit) return hit;
      }
      return undefined;
    },
    queryFn: async () => {
      if (!id) return null;
      const floor = await getFloor(id);
      if (floor === null) throw new FloorNotReadyError();
      return floor;
    },
    // Read from app_boot when it carries the floor; otherwise fetch (covers the
    // fresh-signup race below, where a brand-new floor isn't in the bundle yet).
    enabled: !!id && !fromBoot && !boot.isLoading,
    retry: (failureCount, error) =>
      error instanceof FloorNotReadyError && failureCount < 3,
    retryDelay: (attempt) => Math.min(300 * 2 ** attempt, 1200),
  });
  return {
    ...query,
    data: fromBoot ?? query.data,
    isLoading: !id ? false : fromBoot ? false : boot.isLoading || query.isLoading,
  };
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
    onSuccess: (floor) => {
      // Add the new floor to its building in app_boot, in place (no refetch).
      patchAppBoot(qc, (boot) => ({
        ...boot,
        buildings: boot.buildings.map((b) =>
          b.id === floor.building_id ? { ...b, floors: [...b.floors, floor] } : b
        ),
      }));
      qc.invalidateQueries({ queryKey: ['building-view'] });
    },
  });
}

export function useSoftDeleteFloor(buildingId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => softDeleteFloor(id),
    onSuccess: (_data, id) => {
      // Remove the floor from app_boot in place.
      patchAppBoot(qc, (boot) => ({
        ...boot,
        buildings: boot.buildings.map((b) => ({
          ...b,
          floors: b.floors.filter((f) => f.id !== id),
        })),
      }));
      qc.invalidateQueries({ queryKey: floorKeys.detail(id) });
      if (buildingId) {
        qc.invalidateQueries({ queryKey: floorKeys.byBuilding(buildingId) });
        qc.invalidateQueries({ queryKey: floorKeys.deletedByBuilding(buildingId) });
      }
      qc.invalidateQueries({ queryKey: floorKeys.all });
      // Building screen reads the building-view bundle — refresh it too.
      qc.invalidateQueries({ queryKey: ['building-view'] });
    },
  });
}

/** Soft-deleted floors for a building (Trash page restore list). Per-table. */
export function useDeletedFloors(buildingId: string | undefined) {
  return useQuery({
    queryKey: buildingId
      ? floorKeys.deletedByBuilding(buildingId)
      : ['floors', 'deleted-by-building', 'none'],
    queryFn: () =>
      buildingId ? listDeletedFloorsByBuilding(buildingId) : Promise.resolve([]),
    enabled: !!buildingId,
  });
}

/** Restore a soft-deleted floor. Invalidates the active + deleted floor lists. */
export function useRestoreFloor(buildingId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreFloor(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: floorKeys.detail(id) });
      if (buildingId) {
        qc.invalidateQueries({ queryKey: floorKeys.byBuilding(buildingId) });
        qc.invalidateQueries({ queryKey: floorKeys.deletedByBuilding(buildingId) });
      }
      qc.invalidateQueries({ queryKey: floorKeys.all });
    },
  });
}

/**
 * Set the floor's plan provenance. Per-table: on success invalidates the floor
 * detail + its building's floor list so the caption re-reads. No bundle keys.
 */
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
      // Provenance shows on the floor + building screens (the view bundles).
      qc.invalidateQueries({ queryKey: ['building-view'] });
      if (floorId) qc.invalidateQueries({ queryKey: ['floor-view', floorId] });
    },
  });
}

/**
 * Set the floor-wide team notes. Per-table: invalidates the floor detail + its
 * building's floor list so the toolbar button re-reads. No bundle keys.
 */
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
      // Notes show on the floor + building screens (the view bundles).
      qc.invalidateQueries({ queryKey: ['building-view'] });
      if (floorId) qc.invalidateQueries({ queryKey: ['floor-view', floorId] });
    },
  });
}

export type { NewFloorInput };
