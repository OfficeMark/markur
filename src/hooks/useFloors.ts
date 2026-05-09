import {
  createFloor,
  getFloor,
  listFloorsByBuilding,
  nextFloorSortOrder,
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
  });
}

export function useFloor(id: string | undefined) {
  return useQuery({
    queryKey: id ? floorKeys.detail(id) : ['floors', 'detail', 'none'],
    queryFn: () => (id ? getFloor(id) : Promise.resolve(null)),
    enabled: !!id,
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

export type { NewFloorInput };
