import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAppBoot, getBuildingView } from '@/lib/queries/bundles';
import { buildingKeys } from '@/hooks/useBuildings';
import { floorKeys } from '@/hooks/useFloors';
import { brandingKeys } from '@/hooks/useBranding';
import { setRuntimeAssetTypes, type AssetTypeColor } from '@/lib/pin-types';
import { useAuth } from '@/lib/auth-context';

export const bundleKeys = {
  appBoot: ['app-boot'] as const,
  buildingView: (id: string) => ['building-view', id] as const,
};

/**
 * One-call app boot: buildings (with nested floors) + org branding + the colour
 * catalogue. Seeds the per-entity caches the sidebar nav and lists read, so
 * BuildingNav stops re-fetching every building's floors one at a time (the
 * "buildings + floors-per-building" cascade) — that work now rides this single
 * RPC. Profile + grants stay in their own (deduped) context fetches.
 */
export function useAppBoot() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const query = useQuery({
    queryKey: bundleKeys.appBoot,
    queryFn: getAppBoot,
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  const data = query.data;
  useEffect(() => {
    if (!data) return;
    // Buildings list (drop the nested floors to keep the plain Building[] shape).
    qc.setQueryData(
      buildingKeys.list(),
      data.buildings.map(({ floors: _floors, ...b }) => b)
    );
    // Per-building floors — what the nav otherwise fetches one building at a time.
    for (const b of data.buildings) {
      qc.setQueryData(floorKeys.byBuilding(b.id), b.floors);
    }
    // Org branding per org (logo + pin appearance).
    for (const br of data.branding) {
      if (br.org_id) qc.setQueryData(brandingKeys.byOrg(br.org_id), br);
    }
    // Colour catalogue up front so pins have colours from the first paint.
    if (data.asset_types.length) {
      const map: Record<string, AssetTypeColor> = {};
      for (const t of data.asset_types) {
        map[t.key] = { fill: t.color, label: t.label, category: t.category };
      }
      setRuntimeAssetTypes(map);
    }
  }, [data, qc]);

  return query;
}

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
