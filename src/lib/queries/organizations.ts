import { supabase } from '@/lib/supabase';

export type OrgOption = {
  id: string;
  name: string;
};

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
