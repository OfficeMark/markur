import { supabase } from '@/lib/supabase';
import type { OrgSubscription } from '@/lib/trial';

export type OrgOption = {
  id: string;
  name: string;
};

export type OrgStatus = OrgSubscription & { id: string; name: string };

/**
 * Subscription status for one org. The organizations SELECT policy is
 * `auth.role() = 'authenticated'` (not gated by user_can), so this resolves
 * even for a LOCKED org's admin — exactly what the lockout screen needs.
 */
export async function getOrgStatus(orgId: string): Promise<OrgStatus | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, subscription_status, trial_ends_at')
    .eq('id', orgId)
    .maybeSingle();
  if (error) throw error;
  return (data as OrgStatus | null) ?? null;
}

export async function listOrganizationsByIds(ids: readonly string[]): Promise<OrgOption[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name')
    .in('id', ids as string[])
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as OrgOption[];
}

export async function listAllOrganizations(): Promise<OrgOption[]> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as OrgOption[];
}
