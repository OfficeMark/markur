import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

export type FeatureSuggestion = Database['public']['Tables']['feature_suggestions']['Row'];

export type NewFeatureSuggestion = {
  body: string;
  orgId?: string | null;
  buildingId?: string | null;
};

/**
 * Submit an in-app feature suggestion. `submitted_by` is filled server-side
 * (column default auth.uid(), enforced by the insert RLS policy) — we never
 * send it from the client. org_id / building_id are optional triage context.
 * For v1 there's no admin pane: Randy reads submissions via web Claude.
 */
export async function submitFeatureSuggestion(input: NewFeatureSuggestion): Promise<void> {
  const { error } = await supabase.from('feature_suggestions').insert({
    body: input.body.trim(),
    org_id: input.orgId ?? null,
    building_id: input.buildingId ?? null,
  });
  if (error) throw error;
}
