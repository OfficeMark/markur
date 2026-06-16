import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAppBoot, getBuildingView, getFloorView } from '@/lib/queries/bundles';
import { buildingKeys } from '@/hooks/useBuildings';
import { floorKeys } from '@/hooks/useFloors';
import { assetKeys } from '@/hooks/useAssets';
import { assetPhotoKeys } from '@/hooks/useAssetPhotos';
import { brandingKeys } from '@/hooks/useBranding';
import { auditKeys } from '@/hooks/useAudit';
import { signedAssetPhotoUrls } from '@/lib/queries/asset-photos';
import { setRuntimeAssetTypes, type AssetTypeColor } from '@/lib/pin-types';
import { useAuth } from '@/lib/auth-context';
import {
  getAssetsForFloor,
  getFloor,
  getLastAuditsForFloor,
  putAssetsForFloor,
  putFloor,
  putLastAudits,
} from '@/lib/offline';
import type { FloorView } from '@/lib/queries/bundles';

export const bundleKeys = {
  appBoot: ['app-boot'] as const,
  buildingView: (id: string) => ['building-view', id] as const,
  floorView: (id: string) => ['floor-view', id] as const,
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

/**
 * One-call floor screen: floor + assets + per-pin photos (grouped) + catalogue.
 * Seeds the per-entity caches the floor view and its drawer read, and — the main
 * win — collapses the per-pin photo N+1: the grid otherwise fetches every pin's
 * photo rows separately AND signs each thumbnail one at a time. Here we seed all
 * the photo rows from the bundle and batch-sign every path in a single pass.
 */
export function useFloorView(floorId: string | undefined, userId?: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: floorId ? bundleKeys.floorView(floorId) : ['floor-view', 'none'],
    queryFn: async (): Promise<FloorView> => {
      try {
        const view = await getFloorView(floorId!);
        // Mirror floor + assets + last-confirmed into Dexie so the audit
        // walkaround has them offline even without an explicit "take offline"
        // tap — the same background writeback useAssets / useLatestConfirmed did
        // before those reads moved here.
        if (view.floor) void putFloor(view.floor).catch(() => undefined);
        void putAssetsForFloor(floorId!, view.assets).catch(() => undefined);
        void putLastAudits(
          floorId!,
          new Map(Object.entries(view.last_confirmed_by_asset ?? {}))
        ).catch(() => undefined);
        return view;
      } catch (err) {
        // Offline / RPC unreachable — rebuild floor + assets + last-confirmed
        // from the Dexie cache so the audit walkaround still works offline.
        // Photos aren't cached offline (signed-URL only); active session and
        // video flags stay undefined so the seed below leaves their caches be.
        const [floor, assets, lastConfirmed] = await Promise.all([
          getFloor(floorId!).catch(() => undefined),
          getAssetsForFloor(floorId!).catch(() => [] as never[]),
          getLastAuditsForFloor(floorId!).catch(() => new Map<string, string>()),
        ]);
        if (!floor && assets.length === 0) throw err; // nothing cached → surface it
        return {
          floor: floor ?? null,
          assets,
          photos: {},
          last_confirmed_by_asset: Object.fromEntries(lastConfirmed),
        };
      }
    },
    enabled: !!floorId,
  });

  const data = query.data;
  useEffect(() => {
    if (!floorId || !data) return;
    if (data.floor) qc.setQueryData(floorKeys.detail(floorId), data.floor);
    qc.setQueryData(assetKeys.byFloor(floorId), data.assets);
    for (const a of data.assets) {
      qc.setQueryData(assetKeys.detail(a.id), a);
      qc.setQueryData(assetPhotoKeys.forAsset(a.id), data.photos[a.id] ?? []);
    }
    // Audit data folded into the bundle (expanded get_floor_view). Seed the
    // per-entity caches the floor's (now disabled) audit hooks read. Each is
    // seeded only when present so the offline Dexie fallback — which omits the
    // active session + video flags — doesn't clobber a warmer cached value.
    if (userId && data.active_audit_session !== undefined) {
      qc.setQueryData(auditKeys.activeForFloor(floorId, userId), data.active_audit_session);
    }
    if (data.last_confirmed_by_asset !== undefined) {
      qc.setQueryData(
        auditKeys.latestConfirmedByFloor(floorId),
        new Map(Object.entries(data.last_confirmed_by_asset))
      );
    }
    // Batch-sign every photo path on the floor in one request, then seed the
    // per-path URL cache so the grid thumbnails read warm (no per-pin signing).
    // Skip paths already signed in cache so a floor-view re-seed (after a pin
    // create / delete / lock-all) doesn't re-sign the whole floor's photos.
    const paths = Object.values(data.photos)
      .flat()
      .map((p) => p.path)
      .filter((p) => qc.getQueryData(assetPhotoKeys.signedUrl(p)) === undefined);
    if (paths.length) {
      void signedAssetPhotoUrls(paths)
        .then((map) => {
          for (const [path, url] of Object.entries(map)) {
            qc.setQueryData(assetPhotoKeys.signedUrl(path), url);
          }
        })
        .catch(() => undefined);
    }
  }, [floorId, userId, data, qc]);

  return query;
}
