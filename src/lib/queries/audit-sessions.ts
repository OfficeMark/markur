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
