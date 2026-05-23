import { supabase } from '@/lib/supabase';
import type { Asset, Building, Flag, Floor } from '@/types/database';
import { listFirstPhotoPaths } from '@/lib/queries/asset-photos';

/**
 * Read-side fetcher for the client-facing building reports (Survey + Audit
 * variants — see `src/lib/audit-report.ts` for the PDF layout). One round trip
 * per concern: building, floors, assets, flags, first photo path per asset.
 *
 * RLS is enforced server-side; nothing here filters by role. If the caller
 * doesn't have access, queries return empty arrays / null and the report
 * page renders an empty-state.
 */

export type ReportBundle = {
  building: Building;
  floors: Floor[];
  /** Live assets grouped by floor_id, sorted by pin_number then name. */
  assetsByFloor: Map<string, Asset[]>;
  /** Open + resolved flags grouped by asset_id (newest first). */
  flagsByAsset: Map<string, Flag[]>;
  /** First photo path per asset_id (for the cover thumbnail per row). */
  firstPhotoByAsset: Map<string, string>;
};

export async function fetchReportBundle(buildingId: string): Promise<ReportBundle | null> {
  // 1. Building (also gates the rest: if RLS denies it, bail early).
  const { data: building, error: bErr } = await supabase
    .from('buildings')
    .select('*')
    .eq('id', buildingId)
    .is('deleted_at', null)
    .maybeSingle();
  if (bErr) throw bErr;
  if (!building) return null;

  // 2. Floors (sorted as Building page renders them).
  const { data: floors, error: fErr } = await supabase
    .from('floors')
    .select('*')
    .eq('building_id', buildingId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });
  if (fErr) throw fErr;

  const floorList = floors ?? [];
  const floorIds = floorList.map((f) => f.id);

  // 3. Assets across every floor in this building, in one round trip.
  let assets: Asset[] = [];
  if (floorIds.length > 0) {
    const { data, error } = await supabase
      .from('assets')
      .select('*')
      .in('floor_id', floorIds)
      .is('deleted_at', null);
    if (error) throw error;
    assets = data ?? [];
  }

  // 4. Flags for those assets (open + resolved both — the report shows
  // resolved ones too, so a reader knows what was raised AND closed).
  let flags: Flag[] = [];
  if (assets.length > 0) {
    const { data, error } = await supabase
      .from('flags')
      .select('*')
      .in(
        'asset_id',
        assets.map((a) => a.id)
      )
      .order('created_at', { ascending: false });
    if (error) throw error;
    flags = data ?? [];
  }

  // 5. First photo per asset (signed lazily in the page).
  const firstPhotoByAsset =
    assets.length > 0
      ? await listFirstPhotoPaths(assets.map((a) => a.id))
      : new Map<string, string>();

  // Group by floor. Per-floor sorting (pinned first, then unpinned by name)
  // lives in buildReportSections so the function is self-contained.
  const assetsByFloor = new Map<string, Asset[]>();
  for (const a of assets) {
    const bucket = assetsByFloor.get(a.floor_id);
    if (bucket) bucket.push(a);
    else assetsByFloor.set(a.floor_id, [a]);
  }

  const flagsByAsset = new Map<string, Flag[]>();
  for (const f of flags) {
    const bucket = flagsByAsset.get(f.asset_id);
    if (bucket) bucket.push(f);
    else flagsByAsset.set(f.asset_id, [f]);
  }

  return {
    building,
    floors: floorList,
    assetsByFloor,
    flagsByAsset,
    firstPhotoByAsset,
  };
}
