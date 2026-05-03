import { supabase } from '@/lib/supabase';
import {
  cancelInvitation,
  listPendingInvitationsForBuilding,
} from '@/lib/queries/access';
import type { PendingInvitation } from '@/types/database';
import type { RoleKey } from '@/lib/queries/members';

/**
 * Org-wide pending invitations admin (M14b).
 *
 * Aggregates open invitations across every building owned by the org.
 * "Resend" re-invokes the M13 send-invitation-email Edge Function; the
 * function looks up the row under the caller's JWT (RLS-gated) and
 * sends another email with the same /accept/<token> link, so it's
 * idempotent.
 */

export type AdminInvitation = {
  invitation: PendingInvitation;
  building_id: string;
  building_name: string;
  status: 'pending' | 'expired';
  scope_label: string;
};

export async function listInvitationsForOrg(
  orgId: string | null
): Promise<AdminInvitation[]> {
  if (!orgId) return [];

  const { data: buildings, error: bErr } = await supabase
    .from('buildings')
    .select('id, name')
    .eq('owner_org_id', orgId)
    .is('deleted_at', null);
  if (bErr) throw bErr;
  const bRows = buildings ?? [];
  if (bRows.length === 0) return [];

  // Concurrent fan-out across buildings.
  const perBuilding = await Promise.all(
    bRows.map((b) =>
      listPendingInvitationsForBuilding(b.id).then((invs) => ({
        b,
        invs,
      }))
    )
  );

  const now = Date.now();
  const out: AdminInvitation[] = [];
  for (const { b, invs } of perBuilding) {
    for (const inv of invs) {
      const expired = new Date(inv.expires_at).getTime() < now;
      out.push({
        invitation: inv,
        building_id: b.id,
        building_name: b.name,
        status: expired ? 'expired' : 'pending',
        scope_label: scopeLabelFor(inv, b.name),
      });
    }
  }

  // Newest first.
  out.sort(
    (a, b) =>
      new Date(b.invitation.created_at).getTime() -
      new Date(a.invitation.created_at).getTime()
  );
  return out;
}

function scopeLabelFor(inv: PendingInvitation, buildingName: string): string {
  if (inv.scope_type === 'building') return `${buildingName} (whole building)`;
  if (inv.scope_type === 'floor') return `${buildingName} (one floor)`;
  if (inv.scope_type === 'tenant') return `${buildingName} (one tenant)`;
  if (inv.scope_type === 'global') return 'Org-wide';
  return inv.scope_type;
}

/**
 * Re-send the invitation email by re-invoking the M13 Edge Function.
 * The function reads the row under the caller's JWT, so RLS still
 * gates this. If RESEND_API_KEY isn't configured in Supabase secrets
 * the function returns an error, surfaced here.
 */
export async function resendInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('send-invitation-email', {
    body: { invitation_id: invitationId },
  });
  if (error) throw error;
}

/** Re-export so the hook layer has one import surface. */
export { cancelInvitation as revokeInvitation };

export type RoleDisplayKey = RoleKey;
