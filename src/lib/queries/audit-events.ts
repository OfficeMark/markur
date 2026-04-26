import { supabase } from '@/lib/supabase';
import type { AuditEvent } from '@/types/database';

/**
 * Read/write helpers for `public.audit_events`.
 */

export type AuditOutcome = 'confirmed' | 'flagged' | 'skipped';

export async function listEventsForSession(sessionId: string): Promise<AuditEvent[]> {
  const { data, error } = await supabase
    .from('audit_events')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export type CreateEventInput = {
  session_id: string;
  asset_id: string;
  outcome: AuditOutcome;
  notes?: string | null;
};

export async function createEvent(input: CreateEventInput): Promise<AuditEvent> {
  const { data, error } = await supabase
    .from('audit_events')
    .insert(input)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Latest CONFIRMED audit event per asset on a floor. The status computation
 * resets the cycle on a confirmed audit; skipped/flagged events do not.
 *
 * Returns a Map keyed by asset_id with the ISO timestamp of the most recent
 * confirmed audit. Used by PinOverlay / AssetDrawer to drive `lastAuditAt`.
 */
export async function latestConfirmedAuditByAssetForFloor(
  floorId: string
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('audit_events')
    .select('asset_id, created_at, outcome, asset:assets!inner(floor_id)')
    .eq('asset.floor_id', floorId)
    .eq('outcome', 'confirmed')
    .order('created_at', { ascending: false });
  if (error) throw error;
  type Row = { asset_id: string; created_at: string };
  const rows = (data ?? []) as unknown as Row[];
  const out = new Map<string, string>();
  for (const r of rows) {
    if (!out.has(r.asset_id)) out.set(r.asset_id, r.created_at);
  }
  return out;
}
