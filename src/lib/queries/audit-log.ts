import { supabase } from '@/lib/supabase';
import type { AuditLogEntry } from '@/types/database';

/**
 * Last N audit_log entries for an entity. Used by the activity timeline.
 */
export async function listAuditLogForEntity(
  entityType: string,
  entityId: string,
  limit = 10
): Promise<AuditLogEntry[]> {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
