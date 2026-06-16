import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  buildingHasAnyAsset,
  createAsset,
  getAsset,
  listAssetsByFloor,
  listDeletedAssetsForBuilding,
  restoreAsset,
  setFloorPinsLocked,
  softDeleteAsset,
  updateAsset,
  type CreateAssetInput,
  type UpdateAssetInput,
} from '@/lib/queries/assets';
import { getAssetsForFloor, putAssetsForFloor } from '@/lib/offline';
import type { Asset } from '@/types/database';

export const assetKeys = {
  all: ['assets'] as const,
  byFloor: (floorId: string) => [...assetKeys.all, 'by-floor', floorId] as const,
  detail: (id: string) => [...assetKeys.all, 'detail', id] as const,
  deletedByBuilding: (buildingId: string) =>
    [...assetKeys.all, 'deleted-by-building', buildingId] as const,
  buildingHasAny: (buildingId: string) =>
    [...assetKeys.all, 'building-has-any', buildingId] as const,
};

// The floor-view bundle key, inlined to avoid a circular import with
// useBundles (which imports assetKeys from here). The non-optimistic asset
// mutations invalidate it so the bundle re-fetches and re-seeds the floor's
// asset list — the floor page reads that seed instead of its own fetch.
const floorViewKey = (floorId: string) => ['floor-view', floorId] as const;

/**
 * True if this building has at least one live pin on any live floor. Used by
 * WelcomeCard to decide whether the "Place your first pin" setup step is
 * complete -- a single cross-table query instead of fanning out per-floor.
 */
export function useBuildingHasAnyAsset(buildingId: string | undefined) {
  return useQuery({
    queryKey: buildingId
      ? assetKeys.buildingHasAny(buildingId)
      : ['assets', 'building-has-any', 'none'],
    queryFn: () =>
      buildingId ? buildingHasAnyAsset(buildingId) : Promise.resolve(false),
    enabled: !!buildingId,
  });
}

/**
 * Stale-while-revalidate read of assets on a floor. Tries the network; on
 * success, writes back to the Dexie cache. On failure (offline, unreachable
 * Supabase), falls back to whatever's in Dexie. The audit walkaround is
 * the highest-value offline surface and depends on this.
 */
export function useAssets(floorId: string | undefined, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: floorId ? assetKeys.byFloor(floorId) : ['assets', 'by-floor', 'none'],
    queryFn: async () => {
      if (!floorId) return [] as Asset[];
      try {
        const fresh = await listAssetsByFloor(floorId);
        // Fire-and-forget cache writeback; failures shouldn't break reads.
        void putAssetsForFloor(floorId, fresh).catch(() => undefined);
        return fresh;
      } catch (err) {
        const cached = await getAssetsForFloor(floorId).catch(() => [] as Asset[]);
        if (cached.length) return cached;
        throw err;
      }
    },
    // The floor page passes enabled:false: there, get_floor_view is the sole
    // fetch and seeds this query's cache (the bundle dedup). This hook then
    // just reads that seed — and the optimistic patches below still apply to
    // it — so the floor no longer double-fetches its assets on open.
    enabled: (opts?.enabled ?? true) && !!floorId,
  });
}

export function useAsset(id: string | undefined) {
  return useQuery({
    queryKey: id ? assetKeys.detail(id) : ['assets', 'detail', 'none'],
    queryFn: () => (id ? getAsset(id) : Promise.resolve(null)),
    enabled: !!id,
  });
}

export function useCreateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAssetInput) => createAsset(input),
    onSuccess: (asset) => {
      qc.invalidateQueries({ queryKey: assetKeys.byFloor(asset.floor_id) });
      // Re-seed the floor page (which reads the bundle, not its own fetch).
      qc.invalidateQueries({ queryKey: floorViewKey(asset.floor_id) });
    },
  });
}

/**
 * Optimistically applies the patch to the local caches before the network
 * request lands. This is critical for the drag-to-nudge UX: without it the
 * pin "snaps back" between releasing the pointer and the refetch completing.
 *
 * If the request fails, the cache is rolled back from the snapshot we took.
 */
export function useUpdateAsset(floorId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateAssetInput }) =>
      updateAsset(id, patch),
    onMutate: async ({ id, patch }) => {
      // Cancel in-flight queries so they don't overwrite our optimistic edit.
      const detailKey = assetKeys.detail(id);
      const listKey = floorId ? assetKeys.byFloor(floorId) : null;
      await qc.cancelQueries({ queryKey: detailKey });
      if (listKey) await qc.cancelQueries({ queryKey: listKey });

      const prevDetail = qc.getQueryData<Asset | null>(detailKey);
      const prevList = listKey ? qc.getQueryData<Asset[]>(listKey) : undefined;

      if (prevDetail) {
        qc.setQueryData<Asset>(detailKey, { ...prevDetail, ...patch } as Asset);
      }
      if (listKey && prevList) {
        qc.setQueryData<Asset[]>(
          listKey,
          prevList.map((a) => (a.id === id ? ({ ...a, ...patch } as Asset) : a))
        );
      }

      return { prevDetail, prevList, detailKey, listKey };
    },
    onError: (_err, _vars, ctx) => {
      // Roll back on failure so the canvas reflects the real server state.
      if (!ctx) return;
      if (ctx.prevDetail !== undefined) {
        qc.setQueryData(ctx.detailKey, ctx.prevDetail);
      }
      if (ctx.listKey && ctx.prevList !== undefined) {
        qc.setQueryData(ctx.listKey, ctx.prevList);
      }
    },
    onSettled: (asset) => {
      // Re-fetch authoritative data; if the mutation succeeded our optimistic
      // value matches and the refetch is a no-op for the user.
      if (asset) {
        qc.invalidateQueries({ queryKey: assetKeys.detail(asset.id) });
      }
      if (floorId) qc.invalidateQueries({ queryKey: assetKeys.byFloor(floorId) });
    },
  });
}

/**
 * Lock or unlock every live pin on a floor at once (the "Lock all / Unlock all"
 * control). The RPC writes straight to the DB, bypassing the per-pin optimistic
 * path, so we invalidate the floor's asset list + the per-asset detail caches on
 * success. That refetch re-derives each pin's lock styling and draggable flag on
 * the canvas — the same live re-render the single-pin toggle gets — with no page
 * reload. Resolves to the number of pins changed (for the count toast).
 */
export function useSetFloorPinsLocked(floorId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (locked: boolean) => {
      if (!floorId) throw new Error('No floor');
      return setFloorPinsLocked(floorId, locked);
    },
    onSuccess: () => {
      if (floorId) {
        qc.invalidateQueries({ queryKey: assetKeys.byFloor(floorId) });
        qc.invalidateQueries({ queryKey: floorViewKey(floorId) });
      }
      // An open AssetDrawer reads the per-asset detail query — refresh those too.
      qc.invalidateQueries({ queryKey: [...assetKeys.all, 'detail'] });
    },
  });
}

export function useSoftDeleteAsset(floorId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => softDeleteAsset(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: assetKeys.detail(id) });
      if (floorId) {
        qc.invalidateQueries({ queryKey: assetKeys.byFloor(floorId) });
        qc.invalidateQueries({ queryKey: floorViewKey(floorId) });
      }
      // Any open Trash view should pick up the new entry.
      qc.invalidateQueries({ queryKey: [...assetKeys.all, 'deleted-by-building'] });
    },
  });
}

/**
 * Soft-deleted assets in a building, within the configurable retention
 * window (default 30 days). Used by the super_admin Trash view (M5).
 */
export function useDeletedAssets(buildingId: string | undefined, withinDays = 30) {
  return useQuery({
    queryKey: buildingId
      ? assetKeys.deletedByBuilding(buildingId)
      : ['assets', 'deleted-by-building', 'none'],
    queryFn: () =>
      buildingId ? listDeletedAssetsForBuilding(buildingId, withinDays) : Promise.resolve([]),
    enabled: !!buildingId,
  });
}

export function useRestoreAsset(buildingId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreAsset(id),
    onSuccess: () => {
      // Restored asset reappears on its floor, so invalidate everything.
      qc.invalidateQueries({ queryKey: assetKeys.all });
      // Re-seed any open floor page (don't know which floor, so all floor-views).
      qc.invalidateQueries({ queryKey: ['floor-view'] });
      if (buildingId) {
        qc.invalidateQueries({ queryKey: assetKeys.deletedByBuilding(buildingId) });
      }
    },
  });
}
