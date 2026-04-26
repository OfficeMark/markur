import { supabase } from '@/lib/supabase';
import type { AuditSession } from '@/types/database';

/**
 * Read/write helpers for `public.audit_sessions`. RLS only lets the auditor
 * (or building admins via view_audit_log) see their own sessions; we don't
 * pre-filter here.
 */

export async function getActiveSessionForFloor(
  floorId: string,
  userId: string
): Promise<AuditSession | null> {
  const { data, error } = await supabase
    .from('audit_sessions')
    .select('*')
    .eq('floor_id', floorId)
    .eq('auditor_id', userId)
    .is('completed_at', null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getSession(id: string): Promise<AuditSession | null> {
  const { data, error } = await supabase
    .from('audit_sessions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type StartSessionInput = {
  floor_id: string;
  /**
   * Total assets on the floor at session start — used as the denominator
   * in the progress bar. The completed-summary recomputes from events.
   */
  assets_total: number;
};

export async function startSession(input: StartSessionInput): Promise<AuditSession> {
  const { data: userData } = await supabase.auth.getUser();
  const auditor_id = userData.user?.id;
  if (!auditor_id) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('audit_sessions')
    .insert({
      floor_id: input.floor_id,
      auditor_id,
      assets_total: input.assets_total,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export type EndSessionInput = {
  id: string;
  assets_audited: number;
  assets_missed: number;
  notes?: string | null;
};

export async function endSession(input: EndSessionInput): Promise<AuditSession> {
  const { data, error } = await supabase
    .from('audit_sessions')
    .update({
      completed_at: new Date().toISOString(),
      assets_audited: input.assets_audited,
      assets_missed: input.assets_missed,
      notes: input.notes ?? null,
    })
    .eq('id', input.id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Any open audit session for a given user, optionally constrained to a
 * single building. Used by the Home / Building "Resume audit" surface (M8).
 */
export type ActiveSessionWithLabels = {
  id: string;
  floor_id: string;
  floor_label: string;
  building_id: string;
  building_name: string;
  started_at: string;
};

export async function listActiveSessionsForUser(
  userId: string,
  buildingId?: string
): Promise<ActiveSessionWithLabels[]> {
  let q = supabase
    .from('audit_sessions')
    .select('id, floor_id, started_at, floor:floors!inner(id, label, building_id, building:buildings!inner(id, name))')
    .eq('auditor_id', userId)
    .is('completed_at', null)
    .order('started_at', { ascending: false });
  if (buildingId) {
    q = q.eq('floor.building_id', buildingId);
  }
  const { data, error } = await q;
  if (error) throw error;
  type Row = {
    id: string;
    floor_id: string;
    started_at: string;
    floor: {
      id: string;
      label: string;
      building_id: string;
      building: { id: string; name: string } | null;
    } | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  return rows
    .filter((r) => !!r.floor && !!r.floor.building)
    .map((r) => ({
      id: r.id,
      floor_id: r.floor_id,
      floor_label: r.floor!.label,
      building_id: r.floor!.building_id,
      building_name: r.floor!.building!.name,
      started_at: r.started_at,
    }));
}
