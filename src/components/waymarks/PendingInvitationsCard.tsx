import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  Check,
  Copy,
  Mail,
  MailX,
  Send,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  useInvitations,
  useResendInvitation,
  useRevokeInvitation,
  type AdminInvitation,
} from '@/hooks/useInvitations';
import { ROLE_LABEL, type RoleKey } from '@/lib/queries/members';
import { inviteUrlFor } from '@/components/waymarks/AccessManagementCard';

/**
 * Pending invitations admin card on /settings (M14b).
 *
 * Aggregates open invitations across every building owned by the org.
 * Resend re-invokes the M13 send-invitation-email Edge Function with
 * the same row, so the recipient gets a fresh email pointing at the
 * same /accept/<token> URL. Revoke is a hard delete on
 * pending_invitations.
 */

export function PendingInvitationsCard() {
  const invitations = useInvitations();
  const resend = useResendInvitation();
  const revoke = useRevokeInvitation();

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<AdminInvitation | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendSentId, setResendSentId] = useState<string | null>(null);

  async function handleCopy(token: string, id: string) {
    await navigator.clipboard.writeText(inviteUrlFor(token));
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleResend(id: string) {
    setResendError(null);
    try {
      await resend.mutateAsync(id);
      setResendSentId(id);
      window.setTimeout(() => setResendSentId(null), 2400);
    } catch (err) {
      setResendError(
        err instanceof Error
          ? `Couldn't resend: ${err.message}`
          : "Couldn't resend - check that RESEND_API_KEY is set in Supabase secrets."
      );
    }
  }

  async function handleRevoke() {
    if (!pendingRevoke) return;
    await revoke.mutateAsync(pendingRevoke.invitation.id);
    setPendingRevoke(null);
  }

  return (
    <section className="mt-5 rounded-lg border border-black/10 bg-surface p-5">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
            <Mail size={12} aria-hidden /> Pending invitations
          </p>
          <h2 className="mt-1 font-semibold text-lg">Invitations not yet accepted</h2>
          <p className="mt-1 text-xs text-text-muted">
            Resend the email, copy the accept link, or revoke an invitation
            you sent by mistake. Once accepted, the person moves to the
            Members list above.
          </p>
        </div>
      </header>

      {!invitations.orgId && (
        <p className="mb-3 flex items-start gap-2 rounded-md border border-warning/30 bg-warning-bg px-3 py-2 text-xs text-warning">
          <AlertCircle size={12} aria-hidden className="mt-0.5 shrink-0" />
          <span>You don't have an organization yet.</span>
        </p>
      )}

      {invitations.isLoading && (
        <p className="text-xs text-text-faint">Loading invitations...</p>
      )}

      {!invitations.isLoading && invitations.list.length === 0 && invitations.orgId && (
        <p className="text-xs text-text-faint">No pending invitations.</p>
      )}

      {resendError && (
        <p className="mb-3 flex items-start gap-2 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">
          <AlertCircle size={12} aria-hidden className="mt-0.5 shrink-0" />
          <span>{resendError}</span>
        </p>
      )}

      <ul className="space-y-2">
        {invitations.list.map((row) => (
          <InvitationRow
            key={row.invitation.id}
            row={row}
            copied={copiedId === row.invitation.id}
            sent={resendSentId === row.invitation.id}
            onCopy={() => void handleCopy(row.invitation.token, row.invitation.id)}
            onResend={() => void handleResend(row.invitation.id)}
            onRequestRevoke={() => setPendingRevoke(row)}
          />
        ))}
      </ul>

      {pendingRevoke && (
        <RevokeConfirm
          row={pendingRevoke}
          onCancel={() => setPendingRevoke(null)}
          onConfirm={() => void handleRevoke()}
          busy={revoke.isPending}
        />
      )}
    </section>
  );
}

// ===========================================================================

function InvitationRow(props: {
  row: AdminInvitation;
  copied: boolean;
  sent: boolean;
  onCopy: () => void;
  onResend: () => void;
  onRequestRevoke: () => void;
}) {
  const { row, copied, sent } = props;
  const inv = row.invitation;
  const role = inv.role as RoleKey;
  const expired = row.status === 'expired';

  const expiresLabel = expired
    ? `Expired ${formatDistanceToNow(new Date(inv.expires_at), { addSuffix: true })}`
    : `Expires ${formatDistanceToNow(new Date(inv.expires_at), { addSuffix: true })}`;

  return (
    <li
      className={
        'rounded-md border border-black/5 bg-bg p-2.5 ' +
        (expired ? 'opacity-60' : '')
      }
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{inv.email}</p>
          <p className="mt-0.5 text-[11px] text-text-faint">
            {ROLE_LABEL[role]} · {row.scope_label}
          </p>
          <p className="mt-0.5 text-[11px] text-text-faint">
            Sent {formatDistanceToNow(new Date(inv.created_at), { addSuffix: true })}
            {' · '}
            {expiresLabel}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {expired ? (
            <span className="rounded-full bg-text-muted/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
              expired
            </span>
          ) : (
            <span className="rounded-full bg-waymarks-gold/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-waymarks-gold">
              pending
            </span>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          onClick={props.onCopy}
          iconLeft={
            copied ? (
              <Check size={12} aria-hidden />
            ) : (
              <Copy size={12} aria-hidden />
            )
          }
        >
          {copied ? 'Copied' : 'Copy link'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={props.onResend}
          disabled={expired}
          iconLeft={
            sent ? (
              <Check size={12} aria-hidden />
            ) : (
              <Send size={12} aria-hidden />
            )
          }
        >
          {sent ? 'Sent' : 'Resend email'}
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={props.onRequestRevoke}
          iconLeft={<MailX size={12} aria-hidden />}
        >
          Revoke
        </Button>
      </div>
    </li>
  );
}

// ===========================================================================

function RevokeConfirm(props: {
  row: AdminInvitation;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-lg border border-black/10 bg-surface p-5 shadow-lg">
        <h3 className="font-semibold text-lg">
          Revoke invitation to {props.row.invitation.email}?
        </h3>
        <p className="mt-2 text-sm text-text-muted">
          The accept link will stop working immediately. You can send a fresh
          invitation any time from the building's access panel.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={props.onCancel}
            disabled={props.busy}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            variant="danger"
            loading={props.busy}
            onClick={props.onConfirm}
            iconLeft={<Trash2 size={12} aria-hidden />}
          >
            Revoke
          </Button>
        </div>
      </div>
    </div>
  );
}
