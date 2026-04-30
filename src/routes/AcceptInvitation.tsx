import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Check, ShieldCheck, X } from 'lucide-react';
import { AppShell } from '@/components/waymarks/AppShell';
import { Button } from '@/components/ui/Button';
import { RoleBadge, type Role } from '@/components/waymarks/RoleBadge';
import { useAuth } from '@/lib/auth-context';
import { useAcceptInvitation, useLookupInvitation } from '@/hooks/useAccess';

/**
 * Accepts an invitation token. Flow:
 *  1. Not signed in → redirect to /login?next=/accept/<token>
 *  2. Signed in + valid token → preview "Accept invitation as <role> on <scope>"
 *  3. Click Accept → consume invitation, redirect to /
 *  4. Invalid / expired / already accepted → friendly error
 */

export function AcceptInvitation() {
  const { token } = useParams<{ token: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const lookup = useLookupInvitation(token);
  const accept = useAcceptInvitation();
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect signed-out users to /login with a `next` param. We tell the
  // login screen where to come back to via the URL.
  useEffect(() => {
    if (authLoading) return;
    if (!user && token) {
      navigate(`/login?next=${encodeURIComponent(`/accept/${token}`)}`, { replace: true });
    }
  }, [authLoading, user, token, navigate]);

  if (!token) return <Navigate to="/" replace />;

  if (authLoading || (user && lookup.isLoading)) {
    return (
      <AppShell>
        <div className="mx-auto max-w-lg px-4 py-16 sm:px-6">
          <div className="h-7 w-40 animate-pulse rounded-md bg-black/5 dark:bg-white/5" />
          <div className="mt-3 h-4 w-72 animate-pulse rounded-md bg-black/5 dark:bg-white/5" />
        </div>
      </AppShell>
    );
  }
  if (!user) return null; // redirect is in flight

  const data = lookup.data;
  if (!data || data.kind === 'invalid') return <ErrorPanel reason="invalid" />;
  if (data.kind === 'expired') return <ErrorPanel reason="expired" />;
  if (data.kind === 'accepted') return <ErrorPanel reason="accepted" />;

  if (accepted) {
    return (
      <AppShell>
        <div className="mx-auto max-w-lg px-4 py-16 sm:px-6">
          <div className="rounded-lg border border-success/30 bg-success-bg p-6 text-success">
            <div className="flex items-start gap-2">
              <Check size={18} aria-hidden className="mt-0.5" />
              <div>
                <p className="font-semibold text-xl">Welcome aboard.</p>
                <p className="mt-1 text-sm">
                  Your access is set up. Heading to your dashboard…
                </p>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const inv = data.invitation;
  return (
    <AppShell>
      <div className="mx-auto max-w-lg px-4 py-16 sm:px-6">
        <header className="mb-6">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
            <ShieldCheck size={12} aria-hidden /> Invitation
          </p>
          <h1 className="font-semibold text-3xl text-text sm:text-4xl">You're invited</h1>
        </header>

        <div className="space-y-4 rounded-lg border border-black/10 bg-surface p-5 dark:border-white/10">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-text-faint">
              Role
            </p>
            <p className="mt-1.5">
              <RoleBadge role={inv.role as Role} />
            </p>
          </div>
          {data.building_name && (
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-text-faint">
                Scope
              </p>
              <p className="mt-1 text-sm text-text">{data.building_name}</p>
            </div>
          )}
          {inv.email.toLowerCase() !== (user.email ?? '').toLowerCase() && (
            <div className="rounded-md border border-warning/30 bg-warning-bg p-3 text-sm text-warning">
              This invitation was sent to <span className="font-medium">{inv.email}</span> but
              you're signed in as <span className="font-medium">{user.email}</span>. Continue only
              if that's intentional.
            </div>
          )}
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Link
              to="/"
              className="inline-flex h-9 items-center rounded-md border border-black/10 bg-surface px-3 text-sm text-text-muted hover:text-text dark:border-white/10"
            >
              Cancel
            </Link>
            <Button
              variant="gold"
              loading={accept.isPending}
              iconLeft={<Check size={14} aria-hidden />}
              onClick={async () => {
                setError(null);
                try {
                  await accept.mutateAsync(token);
                  setAccepted(true);
                  window.setTimeout(() => navigate('/', { replace: true }), 900);
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Could not accept the invitation.');
                }
              }}
            >
              Accept invitation
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function ErrorPanel({ reason }: { reason: 'invalid' | 'expired' | 'accepted' }) {
  const message =
    reason === 'invalid'
      ? "We couldn't find that invitation. Double-check the link, or ask the inviter to resend."
      : reason === 'expired'
        ? 'This invitation has expired. Ask the inviter to send a new one.'
        : 'This invitation has already been accepted.';
  return (
    <AppShell>
      <div className="mx-auto max-w-lg px-4 py-16 sm:px-6">
        <div className="rounded-lg border border-danger/30 bg-danger-bg p-6 text-danger">
          <div className="flex items-start gap-2">
            <X size={18} aria-hidden className="mt-0.5" />
            <div>
              <p className="font-semibold text-xl">Invitation unavailable</p>
              <p className="mt-1 text-sm">{message}</p>
              <Link to="/" className="mt-3 inline-block text-sm underline">
                Back to dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
