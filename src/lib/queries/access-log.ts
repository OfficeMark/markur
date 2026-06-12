import { supabase } from '@/lib/supabase';

export type AccessAction = 'view' | 'login' | 'logout';

/**
 * Records an access event via the SECURITY DEFINER `log_access` RPC (writes to
 * audit_log). Used for guest viewer page views. Best-effort: a logging failure
 * never blocks the UI.
 */
export async function logAccess(
  action: AccessAction,
  entityType?: string,
  entityId?: string
): Promise<void> {
  const { error } = await supabase.rpc('log_access', {
    p_action: action,
    p_entity_type: entityType,
    p_entity_id: entityId,
  });
  if (error) console.warn('[log_access] failed', error);
}
