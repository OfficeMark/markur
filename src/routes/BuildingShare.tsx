import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Mail, ShieldCheck, X, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/Button';
import { GuestLayout } from '@/components/waymarks/guest/GuestLayout';
import { GuestBuilding } from '@/components/waymarks/guest/GuestBuilding';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { peekBuildingShare, claimBuildingShare } from '@/lib/queries/building-shares';
import { signedBuildingPhotoUrl } from '@/lib/queries/buildings';

/**
 * Public guest entry for a building share link. Flow:
 *  1. peek (anon) → show "You've been invited to view <Building>" (or an
 *     invalid/expired/revoked state).
 *  2. Not signed in → email field → magic-link OTP (data.guest=true so the
 *     handle_new_user trigger skips org provisioning).
 *  3. Returns authenticated (detectSessionInUrl) → claim → mints/reuses a
 *     time-boxed viewer grant → render the read-only guest experience.
 * The token stays in the URL so a re-visit re-claims idempotently.
 */
export function BuildingShare() {
  const { token } = useParams<{ token: string }>();
  const { user, loading: authLoading } = useAuth();

  const peek = useQuery({
    queryKey: ['building-share', 'peek', token],
    queryFn: () => peekBuildingShare(token!),
    enabled: !!token,
    retry: false,
    staleTime: 0,
  });

  const [email, setEmail] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [claim, setClaim] = useState<
    | { state: 'idle' | 'claiming' }
    | { state: 'done'; buildingId: string }
    | { state: 'error'; message: string }
  >({ state: 'idle' });
  const [formError, setFormError] = useState<string | null>(null);

  // Building hero photo on the claim screen (anon). Resolves only once the peek
  // RPC returns a photo path and anon read is permitted; otherwise stays null.
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const peekPhoto = peek.data?.photo_url ?? null;
  useEffect(() => {
    if (!peekPhoto) {
      setHeroUrl(null);
      return;
    }
    let cancelled = false;
    void signedBuildingPhotoUrl(peekPhoto)
      .then((u) => {
        if (!cancelled) setHeroUrl(u);
      })
      .catch(() => {
        /* no anon read yet (or no photo) — show the card without a hero */
      });
    return () => {
      cancelled = true;
    };
  }, [peekPhoto]);

  // Once authenticated, claim the share (idempotent).
  useEffect(() => {
    if (authLoading || !user || !token) return;
    if (claim.state !== 'idle') return;
    setClaim({ state: 'claiming' });
    claimBuildingShare(token)
      .then((buildingId) => setClaim({ state: 'done', buildingId }))
      .catch((e) =>
        setClaim({ state: 'error', message: e instanceof Error ? e.message : 'Could not open this share.' })
      );
  }, [authLoading, user, token, claim.state]);

  if (!token) return <Navigate to="/" replace />;

  // Claimed → hand off to the read-only guest experience.
  if (claim.state === 'done') {
    return <GuestBuilding buildingId={claim.buildingId} />;
  }

  // Loading the peek (or auth still resolving).
  if (authLoading || (peek.isLoading && !peek.data)) {
    return (
      <GuestLayout>
        <CenterCard>
          <div className="h-7 w-48 animate-pulse rounded-md bg-black/5 dark:bg-white/5" />
          <div className="mt-3 h-4 w-64 animate-pulse rounded-md bg-black/5 dark:bg-white/5" />
        </CenterCard>
      </GuestLayout>
    );
  }

  const status = peek.data?.status ?? 'invalid';
  if (status !== 'ok') {
    return (
      <GuestLayout>
        <CenterCard>
          <UnavailablePanel status={status} />
        </CenterCard>
      </GuestLayout>
    );
  }

  // Authenticated but the claim failed (e.g. revoked between peek and claim).
  if (claim.state === 'error') {
    return (
      <GuestLayout>
        <CenterCard>
          <UnavailablePanel status="revoked" detail={claim.message} />
        </CenterCard>
      </GuestLayout>
    );
  }

  // Authenticated, claim in flight.
  if (user) {
    return (
      <GuestLayout>
        <CenterCard>
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <Eye size={16} aria-hidden /> Opening the shared view…
          </div>
        </CenterCard>
      </GuestLayout>
    );
  }

  const buildingName = peek.data?.building_name ?? 'this building';
  const expires = peek.data?.expires_at ? format(new Date(peek.data.expires_at), 'PP') : null;

  async function sendOtp() {
    setFormError(null);
    const value = email.trim();
    if (!value) {
      setFormError('Enter your email to continue.');
      return;
    }
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: value,
      options: {
        emailRedirectTo: `${window.location.origin}/share/${token}`,
        data: { guest: true },
      },
    });
    setSending(false);
    if (error) setFormError(error.message);
    else setOtpSent(true);
  }

  return (
    <GuestLayout title={peek.data?.building_name}>
      <CenterCard>
        {heroUrl && (
          <img
            src={heroUrl}
            alt=""
            className="mb-5 h-40 w-full rounded-lg border border-black/10 object-cover dark:border-white/10 sm:h-48"
            loading="lazy"
          />
        )}
        <header className="mb-5">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
            <ShieldCheck size={12} aria-hidden /> Shared with you
          </p>
          <h1 className="mt-1 font-semibold text-3xl text-text">
            You've been invited to view <span className="text-waymarks-gold-deep">{buildingName}</span>
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            A view-only walkthrough — floor plans, signs, and photos. Confirm your email to open it.
            {expires ? ` Access is available until ${expires}.` : ''}
          </p>
        </header>

        {otpSent ? (
          <div className="flex items-start gap-2 rounded-md border border-info/30 bg-info-bg p-4 text-sm text-info">
            <Mail size={16} aria-hidden className="mt-0.5 shrink-0" />
            <p>
              Check <span className="font-medium">{email.trim()}</span> for a sign-in link. Open it on
              this device to view the building. You can close this tab.
            </p>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendOtp();
            }}
            className="space-y-3"
          >
            {formError && (
              <div className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">
                {formError}
              </div>
            )}
            <label className="block space-y-1.5">
              <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
                Your email
              </span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-11 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
              />
            </label>
            <Button type="submit" variant="gold" size="lg" fullWidth loading={sending} iconLeft={<Mail size={16} aria-hidden />}>
              Email me a sign-in link
            </Button>
            <p className="text-xs text-text-faint">
              We use your email only to confirm it's you and to keep an access record. No password
              needed.
            </p>
          </form>
        )}
      </CenterCard>
    </GuestLayout>
  );
}

function CenterCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:px-6 sm:py-16">
      <div className="rounded-xl border border-black/10 bg-surface p-6 shadow-sm dark:border-white/10 sm:p-8">
        {children}
      </div>
    </div>
  );
}

function UnavailablePanel({
  status,
  detail,
}: {
  status: 'expired' | 'revoked' | 'invalid';
  detail?: string;
}) {
  const message =
    status === 'expired'
      ? 'This share link has expired. Ask the sender for a new one.'
      : status === 'revoked'
        ? 'This share link has been turned off by the sender.'
        : "We couldn't find that share link. Double-check it, or ask the sender to resend.";
  return (
    <div className="text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-danger-bg text-danger">
        <X size={22} aria-hidden />
      </div>
      <p className="font-semibold text-xl text-text">Link unavailable</p>
      <p className="mt-1 text-sm text-text-muted">{detail ?? message}</p>
    </div>
  );
}
