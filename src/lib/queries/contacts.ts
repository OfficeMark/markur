import { supabase } from '@/lib/supabase';
import type { Contact } from '@/types/database';

/**
 * All Supabase access for `public.contacts` — the admin-managed directory of
 * people / departments (M34, Phase 0). Org-scoped; RLS restricts rows to the
 * caller's org. Consumed via the hooks in src/hooks/useContacts.ts and by the
 * contact pickers on the pin-edit and flag windows (item 1).
 */

export type ContactKind = 'person' | 'department';

export async function listContactsForOrg(orgId: string | null): Promise<Contact[]> {
  if (!orgId) return [];
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('owner_org_id', orgId)
    .is('deleted_at', null)
    .order('label', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export type NewContactInput = {
  owner_org_id: string;
  kind: ContactKind;
  label: string;
  email?: string | null;
};

export async function createContact(input: NewContactInput): Promise<Contact> {
  const { data, error } = await supabase
    .from('contacts')
    .insert({
      owner_org_id: input.owner_org_id,
      kind: input.kind,
      label: input.label.trim(),
      email: input.email?.trim() || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export type UpdateContactPatch = Partial<{
  kind: ContactKind;
  label: string;
  email: string | null;
}>;

export async function updateContact(id: string, patch: UpdateContactPatch): Promise<Contact> {
  const { data, error } = await supabase
    .from('contacts')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/** Soft delete — contacts referenced by a pin/flag keep that FK (on delete set null). */
export async function deleteContact(id: string): Promise<void> {
  const { error } = await supabase
    .from('contacts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
