import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getBuildingView } from '@/lib/queries/bundles';
import { buildingKeys } from '@/hooks/useBuildings';
import { floorKeys } from '@/hooks/useFloors';

export const bundleKeys = {
  buildingView: (id: string) => ['building-view', id] as const,
};

/**
 * One-call building screen: building + floors (with pin counts) + tenants.
 * Replaces the old building-open cascade (useBuilding + useFloors + access +
 * audit-session + …) — the path that was intermittently throwing "something
 * went wrong". After it resolves we seed the per-entity caches so the sidebar
 * nav and back-navigation read warm data instead of re-fetching.
 */
export function useBuildingView(buildingId: string | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: buildingId ? bundleKeys.buildingView(buildingId) : ['building-view', 'none'],
    queryFn: () => getBuildingView(buildingId!),
    enabled: !!buildingId,
  });

  const data = query.data;
  useEffect(() => {
    if (!buildingId || !data) return;
    if (data.building) qc.setQueryData(buildingKeys.detail(buildingId), data.building);
    qc.setQueryData(floorKeys.byBuilding(buildingId), data.floors);
  }, [buildingId, data, qc]);

  return query;
}
