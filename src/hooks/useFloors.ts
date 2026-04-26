import { useQuery } from '@tanstack/react-query';
import { getFloor, listFloorsByBuilding } from '@/lib/queries/floors';

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
