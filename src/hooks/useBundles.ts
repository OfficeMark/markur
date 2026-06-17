import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAppBoot, getBuildingView, getFloorView } from '@/lib/queries/bundles';
import type { FloorView } from '@/lib/queries/bundles';
import { buildingKeys } from '@/hooks/useBuildings';
import { floorKeys } from '@/hooks/useFloors';
import { assetKeys } from '@/hooks/useAssets';
import { assetPhotoKeys } from '@/hooks/useAssetPhotos';
import { brandingKeys } from '@/hooks/useBranding';
import { auditKeys } from '@/hooks/useAudit';
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

export const bundleKeys = {
  appBoot: ['app-boot'] as const,
  buildingView: (id: string) => ['building-view', id] as const,
  floorView: (id: string) => ['floor-view', id] as const,
};

/**
 * One-call app boot: buildings (with nested floors) + branding + org status +
 * the asset-type catalogue. Seeds the per-entity caches the rest of the app
 * reads, so a cold load fires this ONE call instead of the buildings / floors /
 * branding / organizations / asset-type cascade. Profile + grants still come
 * from their own providers (they gate auth, so we don't move them).
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
    const plainBuildings = data.buildings.map(({ floors: _floors, ...b }) => b);
    qc.setQueryData(buildingKeys.list(), plainBuildings);
    // Per-building detail + floors — what the building page / nav otherwise
    // fetch one at a time. Seeding detail keeps useBuilding(id) warm on the
    // floor page so it doesn't fire its own buildings request.
    for (const b of data.buildings) {
      const { floors: floorsOfB, ...plain } = b;
      qc.setQueryData(buildingKeys.detail(b.id), plain);
      qc.setQueryData(floorKeys.byBuilding(b.id), floorsOfB);
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
 * One-call building screen: building + floors (with pin counts) + tenants +
 * the user's open sessions (resume banner). Seeds the per-entity caches so the
 * sidebar nav and back-navigation read warm data instead of re-fetching.
 */
export function useBuildingView(buildingId: string | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: buildingId ? bundleKeys.buildingView(buildingId) : ['building-view', 'none'],
    queryFn: () => getBuildingView(buildingId!),
    enabled: !!buildingId,
    // Cache for the session so navigating away and back doesn't re-fetch and
    // re-seed the whole building view every time (kills the navigation churn).
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
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
 * One-call floor screen: floor + assets + per-pin photos (grouped) + the audit
 * data (active session, last-confirmed map, video flags). The floor page reads
 * everything off this bundle (its per-table hooks are disabled there) and the
 * pin mutations patch the seeded caches IN PLACE — so a pin action never
 * re-fetches the floor. Offline-resilient: rebuilds floor + assets +
 * last-confirmed from Dexie when the RPC is unreachable.
 */
export function useFloorView(floorId: string | undefined, userId?: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: floorId ? bundleKeys.floorView(floorId) : ['floor-view', 'none'],
    queryFn: async (): Promise<FloorView> => {
      try {
        const view = await getFloorView(floorId!);
        // Mirror into Dexie so the audit walkaround works offline even without
        // an explicit "take offline" tap (the writeback the per-table hooks
        // used to do, now that the floor reads from here).
        if (view.floor) void putFloor(view.floor).catch(() => undefined);
        void putAssetsForFloor(floorId!, view.assets).catch(() => undefined);
        void putLastAudits(
          floorId!,
          new Map(Object.entries(view.last_confirmed_by_asset ?? {}))
        ).catch(() => undefined);
        return view;
      } catch (err) {
        // Offline / RPC unreachable — rebuild from Dexie. Photos are signed-URL
        // only (not cached); active session + video flags stay undefined so the
        // seed below leaves those caches untouched.
        const [floor, assets, lastConfirmed] = await Promise.all([
          getFloor(floorId!).catch(() => undefined),
          getAssetsForFloor(floorId!).catch(() => [] as never[]),
          getLastAuditsForFloor(floorId!).catch(() => new Map<string, string>()),
        ]);
        if (!floor && assets.length === 0) throw err;
        return {
          floor: floor ?? null,
          assets,
          photos: {},
          last_confirmed_by_asset: Object.fromEntries(lastConfirmed),
        };
      }
    },
    enabled: !!floorId,
    // Cache for the session so re-opening / navigating back to a floor doesn't
    // re-fetch and re-seed the whole floor view (kills the navigation churn).
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
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
    // Audit caches the (disabled) floor hooks read. Seed only when present so
    // the offline fallback — which omits the active session + video flags —
    // doesn't clobber a warmer cached value.
    if (userId && data.active_audit_session !== undefined) {
      qc.setQueryData(auditKeys.activeForFloor(floorId, userId), data.active_audit_session);
    }
    if (data.last_confirmed_by_asset !== undefined) {
      qc.setQueryData(
        auditKeys.latestConfirmedByFloor(floorId),
        new Map(Object.entries(data.last_confirmed_by_asset))
      );
    }
    // Photo thumbnails are NO LONGER pre-signed on floor open. They now need a
    // per-photo transform (HEIC → web format), which the batch signer can't do,
    // and pre-signing every floor's photos on open is wasted work when the grid
    // isn't the default view. The grid signs each thumbnail lazily on grid-open
    // (useSignedAssetPhotoUrl, with a thumbnail transform), keeping floor-open
    // lean.
  }, [floorId, userId, data, qc]);

  return query;
}
