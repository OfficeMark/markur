import { supabase } from '@/lib/supabase';
import type { Asset, AssetPhoto, AuditSession, Building, Floor } from '@/types/database';
import type { OrgBranding } from '@/lib/queries/branding';
import type { OrgAssetType, OrgAssetTypeOverride } from '@/lib/queries/asset-types';

/**
 * Single-call screen bundles (web Claude's get_*_view DB functions). Each RPC is
 * SECURITY INVOKER + RLS-filtered, so it returns exactly what the caller could
 * already see — it just collapses a whole request cascade into one round trip.
 * The functions return DB rows/metadata only; storage signing (plans, photos)
 * stays separate and short-lived.
 */

// --- get_building_view --------------------------------------------------------

export type BuildingViewFloor = Floor & { pin_count: number };

/** An open session in this building, with the floor label for the resume banner. */
export type BuildingViewResumeSession = AuditSession & {
  floor: { id: string; label: string };
};

export type BuildingView = {
  building: Building | null;
  floors: BuildingViewFloor[];
  tenants: unknown[];
  resume_sessions: BuildingViewResumeSession[];
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
    resume_sessions: v.resume_sessions ?? [],
  };
}

// --- get_app_boot -------------------------------------------------------------

/** A building row with its floors nested (as get_app_boot returns them). */
export type AppBootBuilding = Building & { floors: Floor[] };

/** Org subscription/trial status — feeds useOrgSubscription (lockout gating). */
export type AppBootOrg = {
  id: string;
  name: string;
  plan: string | null;
  subscription_status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
};

export type AppBoot = {
  buildings: AppBootBuilding[];
  branding: OrgBranding[];
  organizations: AppBootOrg[];
  /** Raw catalogue rows (globals + org-specific) — merged client-side with overrides. */
  asset_types: OrgAssetType[];
  asset_type_overrides: OrgAssetTypeOverride[];
};

export async function getAppBoot(): Promise<AppBoot> {
  const { data, error } = await supabase.rpc('get_app_boot');
  if (error) throw error;
  const v = (data ?? {}) as {
    buildings?: AppBootBuilding[];
    branding?: OrgBranding[];
    organizations?: AppBootOrg[];
    asset_types?: OrgAssetType[];
    asset_type_overrides?: OrgAssetTypeOverride[];
  };
  return {
    buildings: v.buildings ?? [],
    branding: v.branding ?? [],
    organizations: v.organizations ?? [],
    asset_types: v.asset_types ?? [],
    asset_type_overrides: v.asset_type_overrides ?? [],
  };
}

// --- get_floor_view -----------------------------------------------------------

export type FloorView = {
  floor: Floor | null;
  assets: Asset[];
  /** Photos grouped per asset id. A pin with no photos has NO key. */
  photos: Record<string, AssetPhoto[]>;
  /** The current user's open session on this floor, or null. */
  active_audit_session?: AuditSession | null;
  /** { asset_id: iso } newest CONFIRMED time per asset; never-confirmed absent. */
  last_confirmed_by_asset?: Record<string, string>;
  /** Asset ids on this floor with >=1 video. */
  asset_video_ids?: string[];
};

export async function getFloorView(floorId: string): Promise<FloorView> {
  const { data, error } = await supabase.rpc('get_floor_view', { p_floor_id: floorId });
  if (error) throw error;
  const v = (data ?? {}) as Partial<FloorView>;
  return {
    floor: v.floor ?? null,
    assets: v.assets ?? [],
    photos: v.photos ?? {},
    active_audit_session: v.active_audit_session ?? null,
    last_confirmed_by_asset: v.last_confirmed_by_asset ?? {},
    asset_video_ids: v.asset_video_ids ?? [],
  };
}
