import { supabase } from '@/lib/supabase';
import type { Floor } from '@/types/database';

/**
 * Floor read-side wrappers. RLS is enforced server-side; these wrappers don't
 * pre-filter by user grants. If a user has no access, the query returns [].
 */
export async function listFloorsByBuilding(buildingId: string): Promise<Floor[]> {
  const { data, error } = await supabase
    .from('floors')
    .select('*')
    .eq('building_id', buildingId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getFloor(id: string): Promise<Floor | null> {
  const { data, error } = await supabase
    .from('floors')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data;
}
