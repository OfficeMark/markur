import { supabase } from '@/lib/supabase';
import type { Building } from '@/types/database';

/**
 * Per CLAUDE.md: server data goes through TanStack Query, never raw
 * `await supabase.from(...)` inside components. This file is the only place
 * that talks to public.buildings — components call the wrappers via the
 * useBuildings* hooks.
 */
export async function listBuildings(): Promise<Building[]> {
  const { data, error } = await supabase
    .from('buildings')
    .select('*')
    .is('deleted_at', null)
    .order('name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getBuilding(id: string): Promise<Building | null> {
  const { data, error } = await supabase
    .from('buildings')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data;
}
