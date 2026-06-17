import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, Copy, Mail, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useFloors } from '@/hooks/useFloors';
import { useCreateInvitation } from '@/hooks/useAccess';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { inviteUrlFor } from '@/lib/utils';
import type { Tenant } from '@/types/database';

/**
 * Invitation form: email + role + scope. Writes a pending_invitations row
 * and surfaces the /accept/<token> URL for the inviter to copy and send.
 *
 * Until M10 wires an Edge Function for emailing, the human inviter is
 * responsible for delivering the link.
 */

type Role = 'super_admin' | 'building_admin' | 'auditor' | 'tenant_rep';

const ROLE_OPTIONS: Array<{ value: Role; label: string; help: string }> = [
  {
    value: 'building_admin',
    label: 'Manager',
    help: 'Full edit on this building. Can invite Facilities and Auditors.',
  },
  {
    value: 'auditor',
    label: 'Auditor',
    help: 'Walks the floor, audits and flags. Cannot edit pin metadata.',
  },
  {
    value: 'tenant_rep',
    label: 'Facilities',
    help: 'Day-to-day building staff. Sees their assigned floor or area; can flag issues.',
  },
];

export type NewInvitationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildingId: string;
};

export function NewInvitationDialog({
  open,
  onOpenChange,
  buildingId,
}: NewInvitationDialogProps) {
  const create = useCreateInvitation(buildingId);
  const floors = useFloors(buildingId);
  const tenants = useQuery({
    queryKey: ['tenants', 'by-building', buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('building_id', buildingId)
        .is('deleted_at', null)
        .order('name');
      if (error) throw error;
      return (data ?? []) as Tenant[];
    },
    enabled: open,
  });

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('building_admin');
  const [floorId, setFloorId] = useState<string>('');
  const [tenantId, setTenantId] = useState<string>('');
  const [expiresInDays, setExpiresInDays] = useState<string>(''); // empty = never
  const [error, setError] = useState<string | null>(null);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // M13 — auto-email outcome. 'idle' before submit, 'sending' while the
  // edge function is in-flight, 'sent' or 'error' after. We always show
  // the copy-link panel as well so the inviter can fall back if email
  // delivery fails.
  const [emailState, setEmailState] = useState<
    | { kind: 'idle' }
    | { kind: 'sending' }
    | { kind: 'sent'; to: string }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  // Reset on close.
  useEffect(() => {
    if (open) return;
    setEmail('');
    setRole('building_admin');
    setFloorId('');
    setTenantId('');
    setExpiresInDays('');
    setError(null);
    setIssuedToken(null);
    setCopied(false);
    setEmailState({ kind: 'idle' });
  }, [open]);

  // Pre-pick scope defaults when role changes.
  useEffect(() => {
    if (role === 'auditor') {
      setExpiresInDays((prev) => prev || '30');
    } else {
      setExpiresInDays('');
    }
  }, [role]);

  const submitDisabled = useMemo(() => {
    if (!email.trim()) return true;
    if (role === 'auditor' && !floorId) return true;
    if (role === 'tenant_rep' && !tenantId) return true;
    return false;
  }, [email, role, floorId, tenantId]);

  async function submit() {
    setError(null);
    let scope_type: 'building' | 'floor' | 'tenant';
    let scope_id: string;
    if (role === 'auditor') {
      scope_type = 'floor';
      scope_id = floorId;
    } else if (role === 'tenant_rep') {
      scope_type = 'tenant';
      scope_id = tenantId;
    } else if (role === 'super_admin') {
      // Super-admin invitations not supported via this UI; we only let
      // building admins invite up to building_admin level.
      setError('Super admin invitations must be issued via the database.');
      return;
    } else {
      scope_type = 'building';
      scope_id = buildingId;
    }

    let expires_at: string | null = null;
    if (expiresInDays.trim()) {
      const n = Number(expiresInDays);
      if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
        setError('Expires (days) must be a positive whole number.');
        return;
      }
      expires_at = new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();
    }

    try {
      const inv = await create.mutateAsync({
        email: email.trim(),
        role,
        scope_type,
        scope_id,
        expires_at,
      });
      setIssuedToken(inv.token);
      setEmailState({ kind: 'sending' });
      try {
        const { data, error: fnError } = await supabase.functions.invoke<{
          ok: boolean;
          error?: string;
          to?: string;
        }>('send-invitation-email', { body: { invitation_id: inv.id } });
        if (fnError) throw fnError;
        if (!data || !data.ok) {
          throw new Error(data?.error ?? 'Email send failed');
        }
        setEmailState({ kind: 'sent', to: data.to ?? email.trim() });
      } catch (e) {
        setEmailState({
          kind: 'error',
          message: e instanceof Error ? e.message : 'Email send failed',
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create invitation.');
    }
  }

  const inviteUrl = issuedToken ? inviteUrlFor(issuedToken) : '';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby="new-invitation-description"
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[min(96vw,520px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-black/10 bg-surface text-text shadow-sheet outline-none dark:border-white/10"
        >
          <header className="flex items-start justify-between gap-3 border-b border-black/10 p-4 dark:border-white/10">
            <Dialog.Title asChild>
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
                  Access management
                </p>
                <p className="font-semibold text-xl">Invite user</p>
              </div>
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                aria-label="Close"
                className="rounded-md p-1 text-text-muted hover:bg-black/5 dark:hover:bg-white/5"
              >
                <X size={16} aria-hidden />
              </button>
            </Dialog.Close>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {issuedToken ? (
              <IssuedPanel
                inviteUrl={inviteUrl}
                emailState={emailState}
                copied={copied}
                onCopy={async () => {
                  try {
                    await navigator.clipboard.writeText(inviteUrl);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1800);
                  } catch {
                    window.prompt('Copy this invitation link', inviteUrl);
                  }
                }}
                onClose={() => onOpenChange(false)}
              />
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
                className="space-y-3"
              >
                <p id="new-invitation-description" className="text-sm text-text-muted">
                  We'll generate a one-time invite link you can copy and send. The recipient signs in or signs up to claim it.
                </p>

                {error && (
                  <div className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">
                    {error}
                  </div>
                )}

                <Field label="Email">
                  <input
                    type="email"
                    // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: focuses the first field when this focus-trapped dialog opens
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="h-10 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
                  />
                </Field>

                <Field label="Role">
                  <div className="space-y-1.5">
                    {ROLE_OPTIONS.map((opt) => (
                      // eslint-disable-next-line jsx-a11y/label-has-associated-control -- the label wraps its radio input and its visible text (opt.label, in the <p> below); the text is just deeper than the rule's static search depth
                      <label
                        key={opt.value}
                        className={
                          'flex cursor-pointer items-start gap-2 rounded-md border p-2 transition-colors ' +
                          (role === opt.value
                            ? 'border-waymarks-gold bg-waymarks-gold-soft dark:bg-white/5'
                            : 'border-black/10 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5')
                        }
                      >
                        <input
                          type="radio"
                          name="role"
                          value={opt.value}
                          checked={role === opt.value}
                          onChange={() => setRole(opt.value)}
                          className="mt-0.5 accent-waymarks-gold"
                        />
                        <div>
                          <p className="text-sm font-medium text-text">{opt.label}</p>
                          <p className="text-xs text-text-faint">{opt.help}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </Field>

                {role === 'auditor' && (
                  <Field label="Floor">
                    <select
                      value={floorId}
                      onChange={(e) => setFloorId(e.target.value)}
                      className="h-10 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
                    >
                      <option value="">— Choose a floor —</option>
                      {(floors.data ?? []).map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}

                {role === 'tenant_rep' && (
                  <Field label="Tenant">
                    <select
                      value={tenantId}
                      onChange={(e) => setTenantId(e.target.value)}
                      className="h-10 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
                    >
                      <option value="">— Choose a tenant —</option>
                      {(tenants.data ?? []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                          {t.suite_label ? ` · ${t.suite_label}` : ''}
                        </option>
                      ))}
                    </select>
                    {(tenants.data ?? []).length === 0 && (
                      <p className="mt-1 text-xs text-text-faint">
                        No tenants set up on this building yet. Add one in the database before inviting Facilities users.
                      </p>
                    )}
                  </Field>
                )}

                <Field label={role === 'auditor' ? 'Expires in (days, default 30)' : 'Expires in (days, leave blank for none)'}>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={expiresInDays}
                    onChange={(e) => setExpiresInDays(e.target.value)}
                    placeholder={role === 'auditor' ? '30' : 'never'}
                    className="h-10 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
                  />
                </Field>
              </form>
            )}
          </div>

          {!issuedToken && (
            <footer className="flex justify-end gap-2 border-t border-black/10 p-3 dark:border-white/10">
              <Dialog.Close asChild>
                <Button size="sm" variant="secondary" disabled={create.isPending}>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                size="sm"
                variant="gold"
                loading={create.isPending}
                disabled={submitDisabled}
                iconLeft={<Mail size={12} aria-hidden />}
                onClick={() => void submit()}
              >
                Create invitation
              </Button>
            </footer>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
        {label}
      </span>
      {children}
    </label>
  );
}

type EmailState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; to: string }
  | { kind: 'error'; message: string };

function IssuedPanel({
  inviteUrl,
  emailState,
  copied,
  onCopy,
  onClose,
}: {
  inviteUrl: string;
  emailState: EmailState;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-3">
      {emailState.kind === 'sending' && (
        <div className="flex items-start gap-2 rounded-md border border-info/30 bg-info-bg p-3 text-sm text-info">
          <Mail size={14} aria-hidden className="mt-0.5" />
          <p>Sending the invitation email...</p>
        </div>
      )}
      {emailState.kind === 'sent' && (
        <div className="flex items-start gap-2 rounded-md border border-success/30 bg-success-bg p-3 text-sm text-success">
          <Check size={14} aria-hidden className="mt-0.5" />
          <p>
            Invitation sent to <strong>{emailState.to}</strong>. The link below
            is also yours to copy if needed.
          </p>
        </div>
      )}
      {emailState.kind === 'error' && (
        <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-bg p-3 text-sm text-warning">
          <Mail size={14} aria-hidden className="mt-0.5" />
          <p>
            Couldn't send the email automatically ({emailState.message}). Copy
            the link below and send it manually.
          </p>
        </div>
      )}
      {emailState.kind === 'idle' && (
        <div className="flex items-start gap-2 rounded-md border border-success/30 bg-success-bg p-3 text-sm text-success">
          <Check size={14} aria-hidden className="mt-0.5" />
          <p>Invitation created. Send the link below to the recipient.</p>
        </div>
      )}
      <Field label="Invitation link">
        <div className="flex items-center gap-1.5 rounded-md border border-black/10 bg-surface p-2 dark:border-white/10">
          <code className="min-w-0 flex-1 truncate font-mono text-xs">{inviteUrl}</code>
          <Button
            size="sm"
            variant="secondary"
            iconLeft={copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
            onClick={onCopy}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </Field>
      <p className="text-xs text-text-faint">
        The link expires in 14 days. Anyone with the link can claim the role
        scoped above, so share it directly with the intended recipient.
      </p>
      <div className="flex justify-end">
        <Button size="sm" variant="gold" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}
