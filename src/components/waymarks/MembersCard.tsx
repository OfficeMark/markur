import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ShieldCheck,
  Trash2,
  UserMinus,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import {
  useMembers,
  useMyHighestRoleLevel,
  useRevokeMember,
  useUpdateMemberRole,
} from '@/hooks/useMembers';
import {
  GRANTABLE_ROLES,
  ROLE_LABEL,
  ROLE_LEVEL,
  type Member,
  type RoleKey,
} from '@/lib/queries/members';
import { useAuth } from '@/lib/auth-context';

/**
 * Org-wide members card on /settings (M14a).
 *
 * Shows every person who has access to any building owned by the user's
 * org. Lets Super admin / Manager change roles or revoke access. The
 * role dropdown is constrained by the current user's level (you can
 * only assign roles strictly below your own; Super admin can assign
 * any role).
 *
 * Self-revoke and self-role-change are blocked client-side.
 */

export function MembersCard() {
  const members = useMembers();
  const { user } = useAuth();
  const myLevel = useMyHighestRoleLevel();
  const updateRole = useUpdateMemberRole();
  const revoke = useRevokeMember();

  const [pending, setPending] = useState<
    | null
    | { kind: 'role-change'; member: Member; newRole: RoleKey }
    | { kind: 'revoke'; member: Member }
  >(null);

  const orgId = members.orgId;

  const grouped = useMemo(() => {
    const map = new Map<string, Member[]>();
    for (const m of members.list) {
      const arr = map.get(m.building_name) ?? [];
      arr.push(m);
      map.set(m.building_name, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [members.list]);

  // Roles I am allowed to GRANT - strictly below my own level (super
  // admin gets a free pass to grant anything).
  const grantableRoles = useMemo<RoleKey[]>(() => {
    if (myLevel >= ROLE_LEVEL.super_admin) {
      // Super admin can assign any role except super_admin via UI
      // (super_admin grants happen manually in the DB).
      return GRANTABLE_ROLES;
    }
    return GRANTABLE_ROLES.filter((r) => ROLE_LEVEL[r] < myLevel);
  }, [myLevel]);

  const canManageMembers = grantableRoles.length > 0;

  return (
    <section className="mt-5 rounded-lg border border-black/10 bg-surface p-5">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
            <Users size={12} aria-hidden /> Members
          </p>
          <h2 className="mt-1 font-semibold text-lg">Who has access</h2>
          <p className="mt-1 text-xs text-text-muted">
            People with active access to your buildings. Change someone's role
            or remove their access. Invite new members from any building's
            access panel.
          </p>
        </div>
      </header>

      {!orgId && (
        <p className="mb-3 flex items-start gap-2 rounded-md border border-warning/30 bg-warning-bg px-3 py-2 text-xs text-warning">
          <AlertCircle size={12} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            You don't have an organization yet. Create a building first.
          </span>
        </p>
      )}

      {members.isLoading && (
        <p className="text-xs text-text-faint">Loading members...</p>
      )}

      {!members.isLoading && members.list.length === 0 && orgId && (
        <p className="text-xs text-text-faint">
          No members yet. Use any building's access panel to invite someone.
        </p>
      )}

      {grouped.map(([buildingName, rows]) => (
        <div key={buildingName} className="mb-4">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
            {buildingName}
          </p>
          <ul className="space-y-1.5">
            {rows.map((m) => (
              <MemberRow
                key={m.grant_id}
                member={m}
                isSelf={user?.id === m.user_id}
                grantableRoles={grantableRoles}
                disabled={!canManageMembers}
                onRequestRoleChange={(newRole) =>
                  setPending({ kind: 'role-change', member: m, newRole })
                }
                onRequestRevoke={() =>
                  setPending({ kind: 'revoke', member: m })
                }
              />
            ))}
          </ul>
        </div>
      ))}

      {pending && (
        <ConfirmDialog
          title={
            pending.kind === 'role-change'
              ? `Change ${pending.member.display_name}'s role?`
              : `Remove ${pending.member.display_name}?`
          }
          body={
            pending.kind === 'role-change'
              ? `${pending.member.display_name} will become ${ROLE_LABEL[pending.newRole]} for ${pending.member.scope_label}. They will see this change on their next page load.`
              : `${pending.member.display_name} will lose access to ${pending.member.scope_label} immediately. You can re-invite them later.`
          }
          confirmLabel={pending.kind === 'role-change' ? 'Change role' : 'Remove'}
          onConfirm={async () => {
            if (pending.kind === 'role-change') {
              await updateRole.mutateAsync({
                grantId: pending.member.grant_id,
                newRole: pending.newRole,
              });
            } else {
              await revoke.mutateAsync(pending.member.grant_id);
            }
            setPending(null);
          }}
          onCancel={() => setPending(null)}
          busy={updateRole.isPending || revoke.isPending}
        />
      )}
    </section>
  );
}

// ===========================================================================

function MemberRow(props: {
  member: Member;
  isSelf: boolean;
  grantableRoles: RoleKey[];
  disabled: boolean;
  onRequestRoleChange: (newRole: RoleKey) => void;
  onRequestRevoke: () => void;
}) {
  const { member, isSelf, grantableRoles, disabled } = props;
  const isSuper = member.role === 'super_admin';

  return (
    <li className="flex items-center gap-3 rounded-md border border-black/5 bg-bg p-2">
      <Avatar
        name={member.display_name}
        src={member.avatar_url ?? undefined}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {member.display_name}
          {isSelf && (
            <span className="ml-1.5 text-[11px] font-normal text-text-faint">
              (you)
            </span>
          )}
        </p>
        <p className="truncate text-xs text-text-muted">{member.email}</p>
        <p className="mt-0.5 text-[11px] text-text-faint">{member.scope_label}</p>
      </div>

      {isSuper ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-waymarks-gold/40 bg-waymarks-gold/10 px-2 py-0.5 text-[11px] font-medium text-waymarks-gold">
          <ShieldCheck size={11} aria-hidden />
          Super admin
        </span>
      ) : (
        <select
          value={member.role}
          disabled={disabled || isSelf}
          onChange={(e) => {
            const next = e.target.value as RoleKey;
            if (next !== member.role) props.onRequestRoleChange(next);
          }}
          className="h-8 rounded-md border border-black/10 bg-surface px-2 text-xs text-waymarks-ink outline-none disabled:opacity-60 focus:border-waymarks-gold focus:ring-1 focus:ring-waymarks-gold"
        >
          {/* Always show the current role so it doesn't blank out */}
          {!grantableRoles.includes(member.role) && (
            <option value={member.role}>
              {ROLE_LABEL[member.role]} (current)
            </option>
          )}
          {grantableRoles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      )}

      <button
        type="button"
        onClick={props.onRequestRevoke}
        disabled={disabled || isSelf || isSuper}
        aria-label={`Remove ${member.display_name}`}
        className="rounded p-1.5 text-text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-30"
      >
        <UserMinus size={14} aria-hidden />
      </button>
    </li>
  );
}

// ===========================================================================

function ConfirmDialog(props: {
  title: string;
  body: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-lg border border-black/10 bg-surface p-5 shadow-lg">
        <h3 className="font-semibold text-lg">{props.title}</h3>
        <p className="mt-2 text-sm text-text-muted">{props.body}</p>
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
            {props.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
