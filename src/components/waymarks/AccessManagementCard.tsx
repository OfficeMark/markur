import { useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  Mail,
  ShieldCheck,

  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { RoleBadge, type Role } from "@/components/waymarks/RoleBadge";
import { NewInvitationDialog } from '@/components/waymarks/NewInvitationDialog';
import {
  useBuildingGrants,
  useCancelInvitation,
  usePendingInvitations,
  useRevokeGrant,
} from '@/hooks/useAccess';
import { format, formatDistanceToNow } from 'date-fns';
import type { GrantWithProfile } from '@/lib/queries/access';
import type { PendingInvitation } from '@/types/database';

/**
 * Building-scoped access management. Visible only to admins
 * (manage_access on the building, gated by the parent route).
 *
 * Sections:
 *  1. Active grants — name + role + scope + expires_at, with Revoke.
 *  2. Pending invitations — email + role + token URL copy + Cancel.
 *  3. "Invite user" CTA opening NewInvitationDialog.
 */

export type AccessManagementCardProps = {
  buildingId: string;
};

export function AccessManagementCard({ buildingId }: AccessManagementCardProps) {
  const grants = useBuildingGrants(buildingId);
  const invites = usePendingInvitations(buildingId);
  const revoke = useRevokeGrant(buildingId);
  const cancelInv = useCancelInvitation(buildingId);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  return (
    <section className="rounded-lg border border-black/10 bg-surface p-4 dark:border-white/10">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
            <ShieldCheck size={12} aria-hidden /> Access management
          </p>
          <h2 className="font-serif text-lg text-text">People with access</h2>
        </div>
        <Button
          size="sm"
          variant="gold"
          iconLeft={<UserPlus size={12} aria-hidden />}
          onClick={() => setInviteOpen(true)}
        >
          Invite user
        </Button>
      </header>

      {grants.isLoading ? (
        <ListSkeleton />
      ) : grants.data && grants.data.length > 0 ? (
        <ul className="space-y-1.5">
          {grants.data.map((g) => (
            <GrantRow
              key={g.id}
              grant={g}
              busy={revoke.isPending && revokingId === g.id}
              onRevoke={() => {
                setRevokingId(g.id);
                revoke.mutate(g.id, { onSettled: () => setRevokingId(null) });
              }}
            />
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-dashed border-black/15 px-3 py-4 text-center text-xs text-text-muted dark:border-white/15">
          No grants yet. Invite the first user to get started.
        </p>
      )}

      <div className="mt-5">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
          <Mail size={12} aria-hidden /> Pending invitations
        </p>
        {invites.isLoading ? (
          <ListSkeleton />
        ) : invites.data && invites.data.length > 0 ? (
          <ul className="space-y-1.5">
            {invites.data.map((inv) => (
              <InvitationRow
                key={inv.id}
                invitation={inv}
                onCancel={() => cancelInv.mutate(inv.id)}
                cancelling={cancelInv.isPending}
              />
            ))}
          </ul>
        ) : (
          <p className="text-xs text-text-faint">No pending invitations.</p>
        )}
      </div>

      <NewInvitationDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        buildingId={buildingId}
      />
    </section>
  );
}

function GrantRow({
  grant,
  busy,
  onRevoke,
}: {
  grant: GrantWithProfile;
  busy: boolean;
  onRevoke: () => void;
}) {
  const expired =
    !!grant.expires_at && new Date(grant.expires_at).getTime() < Date.now();
  const expiresSoon =
    !!grant.expires_at &&
    !expired &&
    new Date(grant.expires_at).getTime() < Date.now() + 7 * 24 * 60 * 60 * 1000;
  return (
    <li
      className={
        'flex flex-col gap-2 rounded-md border border-black/10 p-3 sm:flex-row sm:items-center dark:border-white/10 ' +
        (expired ? 'opacity-50' : '')
      }
    >
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="truncate font-medium text-text">
            {grant.profile?.display_name ?? '(unknown user)'}
          </span>
          <RoleBadge role={grant.role as Role} />
          {expired && <Chip variant="danger">Expired</Chip>}
          {expiresSoon && <Chip variant="gold">Ends soon</Chip>}
        </p>
        <p className="mt-0.5 text-xs text-text-faint">
          <span className="truncate">{grant.profile?.email ?? '—'}</span>
          {' · '}
          <span>{grant.scope_label}</span>
          {grant.expires_at && (
            <>
              {' · '}
              <span title={format(new Date(grant.expires_at), 'PPpp')}>
                {expired ? 'expired ' : 'expires '}
                {formatDistanceToNow(new Date(grant.expires_at), { addSuffix: true })}
              </span>
            </>
          )}
        </p>
      </div>
      <Button
        size="sm"
        variant="secondary"
        iconLeft={<UserMinus size={12} aria-hidden />}
        loading={busy}
        onClick={onRevoke}
      >
        Revoke
      </Button>
    </li>
  );
}

function InvitationRow({
  invitation,
  onCancel,
  cancelling,
}: {
  invitation: PendingInvitation;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const url = inviteUrlFor(invitation.token);
  const [copied, setCopied] = useState(false);
  return (
    <li className="flex flex-col gap-2 rounded-md border border-waymarks-gold/30 bg-waymarks-gold-soft p-3 dark:bg-white/5 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="truncate font-medium text-text">{invitation.email}</span>
          <RoleBadge role={invitation.role as Role} />
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-text-faint">
          <Clock size={11} aria-hidden />
          <span>
            sent{' '}
            <time dateTime={invitation.created_at}>
              {formatDistanceToNow(new Date(invitation.created_at), { addSuffix: true })}
            </time>
            {' · expires '}
            <time dateTime={invitation.expires_at}>
              {formatDistanceToNow(new Date(invitation.expires_at), { addSuffix: true })}
            </time>
          </span>
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          iconLeft={copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1800);
            } catch {
              // Fall back: open a prompt with the URL pre-selected.
              window.prompt('Copy this invitation link', url);
            }
          }}
        >
          {copied ? 'Copied' : 'Copy link'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          iconLeft={<X size={12} aria-hidden />}
          loading={cancelling}
          onClick={onCancel}
          aria-label="Cancel invitation"
        >
          Cancel
        </Button>
      </div>
    </li>
  );
}

function ListSkeleton() {
  return (
    <ul className="space-y-1.5" aria-hidden>
      {[0, 1].map((i) => (
        <li
          key={i}
          className="h-12 animate-pulse rounded-md border border-black/10 dark:border-white/10"
        />
      ))}
    </ul>
  );
}

export function inviteUrlFor(token: string): string {
  if (typeof window === 'undefined') return `/accept/${token}`;
  return `${window.location.origin}/accept/${token}`;
}
