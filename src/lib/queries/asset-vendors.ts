import { supabase } from '@/lib/supabase';
import type { Vendor } from '@/types/database';

/**
 * Link layer for `public.asset_vendors` — the many-to-many between assets and
 * vendors (M34, item 2). Supersedes the single per-asset `vendor_contact`
 * blob. Consumed via src/hooks/useAssetVendors.ts.
 */

/** The vendors currently linked to an asset, resolved through the join. */
export async function listVendorsForAsset(assetId: string): Promise<Vendor[]> {
  const { data, error } = await supabase
    .from('asset_vendors')
    .select('vendor:vendors(*)')
    .eq('asset_id', assetId);
  if (error) throw error;
  type Row = { vendor: Vendor | null };
  return ((data ?? []) as unknown as Row[])
    .map((r) => r.vendor)
    .filter((v): v is Vendor => v != null && v.deleted_at == null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function addAssetVendor(
  assetId: string,
  vendorId: string,
  ownerOrgId: string
): Promise<void> {
  const { error } = await supabase
    .from('asset_vendors')
    .upsert(
      { asset_id: assetId, vendor_id: vendorId, owner_org_id: ownerOrgId },
      { onConflict: 'asset_id,vendor_id', ignoreDuplicates: true }
    );
  if (error) throw error;
}

export async function removeAssetVendor(assetId: string, vendorId: string): Promise<void> {
  const { error } = await supabase
    .from('asset_vendors')
    .delete()
    .eq('asset_id', assetId)
    .eq('vendor_id', vendorId);
  if (error) throw error;
}
