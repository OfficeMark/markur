import { supabase } from '@/lib/supabase';
import type { Vendor } from '@/types/database';

/**
 * All Supabase access for `public.vendors` — the admin-managed directory of
 * suppliers (M34, Phase 0). Org-scoped; RLS restricts rows to the caller's
 * org. Consumed via src/hooks/useVendors.ts and the multi-vendor panel on the
 * asset drawer (item 2). `phone` exists only to preserve legacy data migrated
 * out of the old per-asset vendor_contact blob.
 */

export async function listVendorsForOrg(orgId: string | null): Promise<Vendor[]> {
  if (!orgId) return [];
  const { data, error } = await supabase
    .from('vendors')
    .select('*')
    .eq('owner_org_id', orgId)
    .is('deleted_at', null)
    .order('name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export type NewVendorInput = {
  owner_org_id: string;
  name: string;
  email?: string | null;
  url?: string | null;
  phone?: string | null;
};

export async function createVendor(input: NewVendorInput): Promise<Vendor> {
  const { data, error } = await supabase
    .from('vendors')
    .insert({
      owner_org_id: input.owner_org_id,
      name: input.name.trim(),
      email: input.email?.trim() || null,
      url: input.url?.trim() || null,
      phone: input.phone?.trim() || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export type UpdateVendorPatch = Partial<{
  name: string;
  email: string | null;
  url: string | null;
  phone: string | null;
}>;

export async function updateVendor(id: string, patch: UpdateVendorPatch): Promise<Vendor> {
  const { data, error } = await supabase
    .from('vendors')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/** Soft delete — links in asset_vendors cascade on a hard delete, so we keep
 * the row and just hide it from the directory. */
export async function deleteVendor(id: string): Promise<void> {
  const { error } = await supabase
    .from('vendors')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
