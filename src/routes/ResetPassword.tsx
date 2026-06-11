import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Check, Lock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

// Mirrors the signup password rule (min 8 + confirm match) so the two flows
// stay consistent. If the signup rule tightens, tighten it here too.
const resetSchema = z
  .object({
    password: z.string().min(8, 'At least 8 characters'),
    confirm_password: z.string().min(1, 'Re-enter your password'),
  })
  .refine((v) => v.password === v.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

type ResetValues = z.infer<typeof resetSchema>;

type Status = 'checking' | 'ready' | 'invalid';

/**
 * Landing page for the Supabase password-recovery email link. When the user
 * clicks the link, supabase-js (detectSessionInUrl) processes the URL and
 * establishes a temporary recovery session, firing a PASSWORD_RECOVERY auth
 * event. We treat that — or an already-present session on mount — as "ready to
 * set a new password." With no recovery session (direct nav / expired / reused
 * link) we show a friendly invalid-link state.
 */
export function ResetPassword() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    let active = true;

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setStatus('ready');
      }
    });

    // The link may already have been processed into a session by the time we
    // mount; pick that up directly.
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) setStatus('ready');
    });

    // detectSessionInUrl can resolve the link a beat after mount. Give it a
    // short grace window before declaring the link invalid so a valid link
    // doesn't flash the error state mid-exchange.
    const timer = window.setTimeout(() => {
      if (!active) return;
      setStatus((s) => (s === 'checking' ? 'invalid' : s));
    }, 2000);

    return () => {
      active = false;
      window.clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <div className="flex min-h-screen min-h-dvh items-center justify-center bg-waymarks-cream px-4 py-12 text-text">
      <div className="w-full max-w-md space-y-6">
        <header className="space-y-3 text-center">
          <Link
            to="/"
            aria-label="Markur home"
            className="inline-flex items-center rounded outline-none focus-visible:ring-2 focus-visible:ring-waymarks-gold focus-visible:ring-offset-2 focus-visible:ring-offset-waymarks-cream"
          >
            <img
              src="/icons/markur-wordmark.png"
              alt="Markur, by Officemark"
              className="h-12 w-auto dark:hidden"
              width={1587}
              height={521}
            />
            <img
              src="/icons/markur-wordmark-light.png"
              alt=""
              aria-hidden
              className="hidden h-12 w-auto dark:block"
              width={1587}
              height={521}
            />
          </Link>
          <p className="text-sm text-text-muted">Set a new password for your account.</p>
        </header>

        {status === 'checking' && <CheckingPanel />}
        {status === 'ready' && (
          <SetPasswordForm onDone={() => navigate('/', { replace: true })} />
        )}
        {status === 'invalid' && <InvalidPanel />}
      </div>
    </div>
  );
}

function CheckingPanel() {
  return (
    <div
      className="flex items-center justify-center gap-2 rounded-md border border-black/10 bg-surface p-6 text-sm text-text-muted dark:border-white/10"
      aria-live="polite"
    >
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-waymarks-gold border-t-transparent" />
      Verifying your reset link…
    </div>
  );
}

function InvalidPanel() {
  return (
    <div className="space-y-3 rounded-md border border-danger/30 bg-danger-bg p-4 text-sm text-danger">
      <div className="flex items-start gap-2">
        <AlertCircle size={16} aria-hidden className="mt-0.5 shrink-0" />
        <p>
          This reset link is invalid or has expired. Reset links can only be used once and
          time out — request a new one to continue.
        </p>
      </div>
      <Link
        to="/login"
        className="inline-block text-xs font-medium underline underline-offset-2"
      >
        Back to sign in
      </Link>
    </div>
  );
}

function SetPasswordForm({ onDone }: { onDone: () => void }) {
  const [authError, setAuthError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const redirectTimer = useRef<number | undefined>(undefined);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    mode: 'onTouched',
  });

  useEffect(() => () => window.clearTimeout(redirectTimer.current), []);

  async function onSubmit(values: ResetValues) {
    setAuthError(null);
    const { error } = await supabase.auth.updateUser({ password: values.password });
    if (error) {
      setAuthError(error.message);
      return;
    }
    // The recovery session signs the user in, so we can send them straight in.
    setDone(true);
    redirectTimer.current = window.setTimeout(onDone, 1200);
  }

  if (done) {
    return (
      <div className="space-y-2 rounded-md border border-success/30 bg-success-bg p-4 text-sm text-success">
        <div className="flex items-start gap-2">
          <Check size={16} aria-hidden className="mt-0.5 shrink-0" />
          <p>Password updated. Signing you in…</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {authError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger"
        >
          <AlertCircle size={16} aria-hidden className="mt-0.5 shrink-0" />
          <span>{authError}</span>
        </div>
      )}
      <Field
        label="New password"
        icon={<Lock size={14} aria-hidden />}
        error={errors.password?.message}
        inputProps={{
          type: 'password',
          autoComplete: 'new-password',
          placeholder: 'At least 8 characters',
          ...register('password'),
        }}
      />
      <Field
        label="Confirm password"
        icon={<Lock size={14} aria-hidden />}
        error={errors.confirm_password?.message}
        inputProps={{
          type: 'password',
          autoComplete: 'new-password',
          placeholder: 'Re-enter your password',
          ...register('confirm_password'),
        }}
      />
      <Button type="submit" variant="gold" size="lg" fullWidth loading={isSubmitting}>
        Set new password
      </Button>
    </form>
  );
}

function Field({
  label,
  icon,
  error,
  inputProps,
}: {
  label: string;
  icon?: React.ReactNode;
  error?: string;
  inputProps: React.InputHTMLAttributes<HTMLInputElement>;
}) {
  const id = inputProps.id ?? `f-${inputProps.name}`;
  const errId = error ? `${id}-err` : undefined;
  return (
    <label htmlFor={id} className="block space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-[0.18em] text-text-faint">
        {label}
      </span>
      <span
        className={cn(
          'flex h-11 items-center gap-2 rounded-md border bg-surface px-3 transition-colors focus-within:border-waymarks-gold focus-within:ring-2 focus-within:ring-waymarks-gold dark:border-white/10',
          error ? 'border-danger' : 'border-black/10'
        )}
      >
        {icon && <span className="text-text-faint">{icon}</span>}
        <input
          id={id}
          {...inputProps}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={errId}
          className="h-full flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-faint"
        />
      </span>
      {error && (
        <span id={errId} className="text-xs text-danger">
          {error}
        </span>
      )}
    </label>
  );
}
