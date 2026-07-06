import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { KeyRound, Lock, Mail, ShieldCheck, User as UserIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions-context';
import { useClaimDemoLink, usePeekDemoLink } from '@/hooks/useDemoLinks';
import { demoDaysLeft } from '@/lib/queries/demo-links';

/**
 * S9 — the client side of a demo link (docs/demo-share-flow-mock.html).
 *
 * A prospect opens /welcome/<token>: we peek the link anonymously (building
 * name, sharer, window), then they create a lightweight account (name /
 * work email / password — signUp with data.guest='true' so no empty org is
 * provisioned) or sign in, and claim. The claim RPC mints a building-scoped
 * full-access grant that expires with the link. "Sign up to keep your
 * building" happens later via the in-app conversion CTA.
 */

export function Welcome() {
  const { token } = useParams<{ token: string }>();
  const peek = usePeekDemoLink(token);

  if (!token) {
    return (
      <Frame>
        <ErrorCard message="This link is incomplete. Double-check the URL you were sent." />
      </Frame>
    );
  }
  if (peek.isLoading) {
    return (
      <Frame>
        <div className="mx-auto mt-16 w-full max-w-md space-y-3 px-4">
          <div className="h-8 w-56 animate-pulse rounded-md bg-black/10 dark:bg-white/10" />
          <div className="h-4 w-72 animate-pulse rounded-md bg-black/10 dark:bg-white/10" />
          <div className="h-40 animate-pulse rounded-lg bg-black/10 dark:bg-white/10" />
        </div>
      </Frame>
    );
  }
  if (peek.isError || !peek.data || peek.data.status === 'invalid') {
    return (
      <Frame>
        <ErrorCard message="We couldn't find that link. Double-check the URL, or ask for a fresh one." />
      </Frame>
    );
  }
  if (peek.data.status === 'expired') {
    return (
      <Frame>
        <ErrorCard message="This link has expired. Ask the person who shared it for a new one — your building is still there." />
      </Frame>
    );
  }

  const { building_name, sharer_name, expires_at, grant_days } = peek.data;
  const days = grant_days ?? demoDaysLeft(expires_at);

  return (
    <Frame>
      <div className="mx-auto mt-10 w-full max-w-md px-4 pb-16 sm:mt-16">
        <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-waymarks-gold">
          Welcome
        </p>
        <h1 className="mt-1 font-semibold text-3xl leading-tight text-text sm:text-4xl">
          {building_name ?? 'Your building'}
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          {sharer_name ?? 'Your signage partner'} has shared this building’s signage with you on
          Markur.
        </p>
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success-bg px-3 py-1 text-xs font-medium text-success">
          <KeyRound size={13} aria-hidden /> Full access · {days} days
        </p>
        <p className="mt-3 text-sm text-text-muted">
          View every sign on every floor, edit details, run an audit — it’s your data to use.
        </p>

        <ClaimCard token={token} buildingName={building_name ?? 'your building'} />

        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-text-faint">
          <ShieldCheck size={12} aria-hidden /> Encrypted · your data stays yours
        </p>
      </div>
    </Frame>
  );
}

function ClaimCard({ token, buildingName }: { token: string; buildingName: string }) {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const claim = useClaimDemoLink();
  const { refreshGrants } = usePermissions();

  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmNote, setConfirmNote] = useState<string | null>(null);

  async function claimAndEnter() {
    const buildingId = await claim.mutateAsync(token);
    // The claim minted a fresh grant — refresh the permissions context so
    // the building opens with full access immediately, no reload needed.
    await refreshGrants();
    navigate(`/buildings/${buildingId}`, { replace: true });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setConfirmNote(null);
    setBusy(true);
    try {
      if (mode === 'signup') {
        if (!name.trim()) throw new Error('Enter your name.');
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            // guest='true' → handle_new_user creates a profile only (no empty
            // org): this account's access comes from the claimed demo grant.
            data: { display_name: name.trim(), guest: 'true' },
          },
        });
        if (err) throw err;
        if (!data.session) {
          setConfirmNote(
            `Check ${email.trim()} for a confirmation link, then come back to this page to enter your building.`
          );
          return;
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (err) throw err;
      }
      await claimAndEnter();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) {
    return <div className="mt-6 h-24 animate-pulse rounded-lg bg-black/10 dark:bg-white/10" />;
  }

  // Already signed in (e.g. confirmed email and returned): claim directly.
  if (user) {
    return (
      <div className="mt-6 rounded-lg border border-black/10 bg-surface p-5 dark:border-white/10">
        <p className="text-sm text-text-muted">
          Signed in as <span className="font-medium text-text">{user.email}</span>.
        </p>
        {error && (
          <p className="mt-2 rounded-md border border-danger/30 bg-danger-bg p-2 text-xs text-danger">
            {error}
          </p>
        )}
        <Button
          variant="gold"
          className="mt-3 w-full"
          loading={claim.isPending}
          onClick={() => claimAndEnter().catch((e) => setError(e instanceof Error ? e.message : 'Could not open the building.'))}
        >
          Enter {buildingName}
        </Button>
      </div>
    );
  }

  if (confirmNote) {
    return (
      <div className="mt-6 rounded-lg border border-info/30 bg-info-bg p-5 text-sm text-info">
        {confirmNote}
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="mt-6 space-y-3 rounded-lg border border-black/10 bg-surface p-5 dark:border-white/10"
    >
      {mode === 'signup' && (
        <LabeledInput
          label="Your name"
          icon={<UserIcon size={14} aria-hidden />}
          type="text"
          autoComplete="name"
          value={name}
          onChange={setName}
        />
      )}
      <LabeledInput
        label="Work email"
        icon={<Mail size={14} aria-hidden />}
        type="email"
        autoComplete="email"
        value={email}
        onChange={setEmail}
      />
      <LabeledInput
        label={mode === 'signup' ? 'Choose a password' : 'Password'}
        icon={<Lock size={14} aria-hidden />}
        type="password"
        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
        value={password}
        onChange={setPassword}
      />
      {error && (
        <p className="rounded-md border border-danger/30 bg-danger-bg p-2 text-xs text-danger">
          {error}
        </p>
      )}
      <Button type="submit" variant="gold" className="w-full" loading={busy}>
        Enter {buildingName}
      </Button>
      <button
        type="button"
        className="w-full text-center text-xs text-text-muted underline-offset-2 hover:text-text hover:underline"
        onClick={() => {
          setMode(mode === 'signup' ? 'signin' : 'signup');
          setError(null);
        }}
      >
        {mode === 'signup' ? 'Already have an account? Sign in' : 'New here? Create an account'}
      </button>
    </form>
  );
}

function LabeledInput(props: {
  label: string;
  icon: React.ReactNode;
  type: string;
  autoComplete: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-text-muted">
        {props.icon} {props.label}
      </span>
      <input
        type={props.type}
        autoComplete={props.autoComplete}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        required
        className="h-10 w-full rounded-md border border-black/15 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold dark:border-white/15"
      />
    </label>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen min-h-dvh bg-waymarks-cream text-text">
      <header className="flex h-12 items-center border-b border-black/10 bg-waymarks-ink px-4 dark:border-white/10">
        <Link to="/" className="flex items-center gap-2">
          <img src="/icons/markur-logo.svg" alt="" className="h-5 w-5" />
          <span className="text-sm font-semibold tracking-wide text-white">markur</span>
        </Link>
      </header>
      {children}
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="mx-auto mt-16 w-full max-w-md px-4">
      <div className="rounded-lg border border-danger/30 bg-danger-bg p-6 text-danger">
        <div className="flex items-start gap-2">
          <X size={18} aria-hidden className="mt-0.5" />
          <div>
            <p className="font-semibold text-xl">Link unavailable</p>
            <p className="mt-1 text-sm">{message}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
