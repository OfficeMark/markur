import { useQuery } from '@tanstack/react-query';
import { getBuilding, listBuildings } from '@/lib/queries/buildings';

export const buildingKeys = {
  all: ['buildings'] as const,
  list: () => [...buildingKeys.all, 'list'] as const,
  detail: (id: string) => [...buildingKeys.all, 'detail', id] as const,
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
