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

/** Apply `fn` to the floor's cached asset list in place (no refetch). */
function patchFloorList(
  qc: ReturnType<typeof useQueryClient>,
  floorId: string | undefined,
  fn: (list: Asset[]) => Asset[]
) {
  if (!floorId) return;
  qc.setQueryData<Asset[]>(assetKeys.byFloor(floorId), (old) => fn(old ?? []));
}

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
 * Supabase), falls back to whatever's in Dexie.
 *
 * The floor page passes enabled:false: there, get_floor_view is the sole fetch
 * and seeds this query's cache, and the mutations below patch it in place — so
 * the floor never double-fetches its assets nor re-fetches them after an edit.
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
      // Patch the floor list in place — no refetch. The new pin appears on the
      // canvas immediately and the floor page (which reads this cache) updates.
      patchFloorList(qc, asset.floor_id, (list) =>
        list.some((a) => a.id === asset.id) ? list : [...list, asset]
      );
      qc.setQueryData(assetKeys.detail(asset.id), asset);
    },
  });
}

/**
 * Optimistically applies the patch to the local caches before the network
 * request lands (critical for drag-to-nudge: without it the pin snaps back),
 * then writes the authoritative server row back IN PLACE on success — no
 * invalidate, so a pin edit never triggers a full-floor refetch.
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
    onSuccess: (asset) => {
      // Write the authoritative returned row into both caches IN PLACE. No
      // invalidate → no GET id, no GET assets?floor_id. The optimistic value
      // already matched; this just reconciles any server-set fields.
      if (!asset) return;
      qc.setQueryData(assetKeys.detail(asset.id), asset);
      patchFloorList(qc, floorId, (list) =>
        list.map((a) => (a.id === asset.id ? asset : a))
      );
    },
  });
}

/**
 * Lock or unlock every live pin on a floor at once (the "Lock all / Unlock all"
 * control). The RPC writes straight to the DB; we patch the floor list + each
 * per-asset detail cache IN PLACE so the canvas re-derives lock styling without
 * a refetch. Resolves to the number of pins changed (for the count toast).
 */
export function useSetFloorPinsLocked(floorId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (locked: boolean) => {
      if (!floorId) throw new Error('No floor');
      return setFloorPinsLocked(floorId, locked);
    },
    onSuccess: (_count, locked) => {
      if (!floorId) return;
      const list = qc.getQueryData<Asset[]>(assetKeys.byFloor(floorId)) ?? [];
      const next = list.map((a) => ({ ...a, is_locked: locked }) as Asset);
      qc.setQueryData(assetKeys.byFloor(floorId), next);
      // Keep the per-asset detail caches an open drawer reads in sync too.
      for (const a of next) qc.setQueryData(assetKeys.detail(a.id), a);
    },
  });
}

export function useSoftDeleteAsset(floorId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => softDeleteAsset(id),
    onSuccess: (_data, id) => {
      // Drop the pin from the floor list in place — no refetch.
      patchFloorList(qc, floorId, (list) => list.filter((a) => a.id !== id));
      qc.removeQueries({ queryKey: assetKeys.detail(id) });
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
      // Restored asset reappears on its floor. We don't know which floor here,
      // so re-seed any open floor via its bundle + refresh the trash list.
      qc.invalidateQueries({ queryKey: ['floor-view'] });
      qc.invalidateQueries({ queryKey: assetKeys.all });
      if (buildingId) {
        qc.invalidateQueries({ queryKey: assetKeys.deletedByBuilding(buildingId) });
      }
    },
  });
}
