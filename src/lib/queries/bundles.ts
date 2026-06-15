import { supabase } from '@/lib/supabase';
import type { Building, Floor } from '@/types/database';

/**
 * Single-call screen bundles (web Claude's get_*_view DB functions). Each RPC is
 * SECURITY INVOKER + RLS-filtered, so it returns exactly what the caller could
 * already see — it just collapses a whole request cascade into one round trip.
 * The functions return DB rows/metadata only; storage signing (plans, photos)
 * stays separate and short-lived.
 */

// --- get_building_view --------------------------------------------------------

export type BuildingViewFloor = Floor & { pin_count: number };

export type BuildingView = {
  building: Building | null;
  floors: BuildingViewFloor[];
  tenants: unknown[];
};

export async function getBuildingView(buildingId: string): Promise<BuildingView> {
  const { data, error } = await supabase.rpc('get_building_view', {
    p_building_id: buildingId,
  });
  if (error) throw error;
  const v = (data ?? {}) as Partial<BuildingView>;
  return {
    building: v.building ?? null,
    floors: v.floors ?? [],
    tenants: v.tenants ?? [],
  };
}
