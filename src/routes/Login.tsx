import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, AlertCircle, User as UserIcon, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

type Mode = 'sign-in' | 'sign-up';

const signInSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
});

const signUpSchema = signInSchema
  .extend({
    display_name: z.string().min(1, 'Your name helps us address you'),
    // company drives the organization name (read by the handle_new_user
    // trigger as raw_user_meta_data->>'company'); required so the new org
    // isn't named "<name> Org" by fallback.
    company: z.string().min(1, 'Your company or organization name'),
    confirm_password: z.string().min(1, 'Re-enter your password'),
  })
  .refine((v) => v.password === v.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

type SignInValues = z.infer<typeof signInSchema>;
type SignUpValues = z.infer<typeof signUpSchema>;

export function Login() {
  const [mode, setMode] = useState<Mode>('sign-in');
  return (
    <div className="flex min-h-screen min-h-dvh items-center justify-center bg-waymarks-cream px-4 py-12 text-text">
      <div className="w-full max-w-md space-y-6">
        <header className="space-y-3 text-center">
          <Link
            to="/"
            aria-label="Markur home"
            className="inline-flex items-center outline-none focus-visible:ring-2 focus-visible:ring-waymarks-gold focus-visible:ring-offset-2 focus-visible:ring-offset-waymarks-cream rounded"
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
          <p className="text-sm text-text-muted">
            Sign in to manage signage across your buildings.
          </p>
        </header>

        <div
          role="tablist"
          aria-label="Sign in or sign up"
          className="grid grid-cols-2 rounded-md border border-black/10 bg-surface p-1 text-sm font-medium dark:border-white/10"
        >
          <TabButton selected={mode === 'sign-in'} onClick={() => setMode('sign-in')}>
            Sign in
          </TabButton>
          <TabButton selected={mode === 'sign-up'} onClick={() => setMode('sign-up')}>
            Sign up
          </TabButton>
        </div>

        {mode === 'sign-in' ? <SignInForm /> : <SignUpForm onSwitchToSignIn={() => setMode('sign-in')} />}

        <p className="text-center text-xs text-text-faint">
          By continuing you agree to our terms. We'll never share your email.
        </p>
      </div>
    </div>
  );
}

function TabButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        'h-9 rounded-[5px] transition-colors',
        selected
          ? 'bg-waymarks-ink text-white'
          : 'text-text-muted hover:text-text dark:hover:text-white'
      )}
    >
      {children}
    </button>
  );
}

function FormError({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger"
    >
      <AlertCircle size={16} aria-hidden className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function SignInForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const redirectTo =
    (location.state as { from?: string } | null)?.from ?? params.get('next') ?? '/';
  const [authError, setAuthError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    mode: 'onTouched',
  });

  async function onSubmit(values: SignInValues) {
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });
    if (error) {
      setAuthError(error.message);
      return;
    }
    navigate(redirectTo, { replace: true });
  }

  if (forgot) {
    return <ForgotPasswordForm onBack={() => setForgot(false)} />;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <FormError>{authError}</FormError>
      <Field
        label="Email"
        icon={<Mail size={14} aria-hidden />}
        error={errors.email?.message}
        inputProps={{
          type: 'email',
          autoComplete: 'email',
          placeholder: 'you@example.com',
          ...register('email'),
        }}
      />
      <Field
        label="Password"
        icon={<Lock size={14} aria-hidden />}
        error={errors.password?.message}
        inputProps={{
          type: 'password',
          autoComplete: 'current-password',
          placeholder: 'At least 8 characters',
          ...register('password'),
        }}
      />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setForgot(true)}
          className="rounded text-xs font-medium text-text-muted underline-offset-2 hover:text-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-waymarks-gold dark:hover:text-white"
        >
          Forgot password?
        </button>
      </div>
      <Button type="submit" variant="gold" size="lg" fullWidth loading={isSubmitting}>
        Sign in
      </Button>
    </form>
  );
}

const forgotSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
});
type ForgotValues = z.infer<typeof forgotSchema>;

/**
 * Email-only "forgot password" form. Sends a Supabase recovery email that lands
 * on /reset-password. The confirmation is deliberately neutral — we never reveal
 * whether an account exists for the address (avoids account enumeration), and we
 * swallow the error state into the same message for the same reason.
 */
function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    mode: 'onTouched',
  });

  async function onSubmit(values: ForgotValues) {
    // Fire-and-forget: we surface the same neutral message regardless of outcome.
    await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-3 rounded-md border border-info/30 bg-info-bg p-4 text-sm text-info">
        <p>
          If an account exists for{' '}
          <span className="font-medium">{getValues('email')}</span>, a reset link is on its
          way. Check your inbox (and spam).
        </p>
        <Button variant="secondary" size="sm" onClick={onBack}>
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <p className="text-sm text-text-muted">
        Enter your email and we'll send a link to reset your password.
      </p>
      <Field
        label="Email"
        icon={<Mail size={14} aria-hidden />}
        error={errors.email?.message}
        inputProps={{
          type: 'email',
          autoComplete: 'email',
          placeholder: 'you@example.com',
          ...register('email'),
        }}
      />
      <Button type="submit" variant="gold" size="lg" fullWidth loading={isSubmitting}>
        Send reset link
      </Button>
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onBack}
          className="rounded text-xs font-medium text-text-muted underline-offset-2 hover:text-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-waymarks-gold dark:hover:text-white"
        >
          Back to sign in
        </button>
      </div>
    </form>
  );
}

function SignUpForm({ onSwitchToSignIn }: { onSwitchToSignIn: () => void }) {
  const navigate = useNavigate();
  const [authError, setAuthError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    mode: 'onTouched',
  });

  async function onSubmit(values: SignUpValues) {
    setAuthError(null);
    setConfirmation(null);
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        // display_name → profile + naming fallback; company → org name.
        // The handle_new_user trigger provisions profile + org + admin grant.
        data: { display_name: values.display_name, company: values.company },
      },
    });
    if (error) {
      setAuthError(error.message);
      return;
    }
    if (data.session) {
      // Confirmation-off case: signUp returns an active session immediately, so
      // the user is already signed in. /login isn't a protected route, so nothing
      // redirects them off it automatically — navigate into the app explicitly,
      // same destination as a successful sign-in / the first-building gate.
      navigate('/', { replace: true });
      return;
    }
    // Email confirmation required (data.session is null).
    setConfirmation(
      `Check ${values.email} for a confirmation link. Once confirmed, sign in.`
    );
  }

  if (confirmation) {
    return (
      <div className="space-y-3 rounded-md border border-info/30 bg-info-bg p-4 text-sm text-info">
        <p>{confirmation}</p>
        <Button variant="secondary" size="sm" onClick={onSwitchToSignIn}>
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <FormError>{authError}</FormError>
      <Field
        label="Your name"
        icon={<UserIcon size={14} aria-hidden />}
        error={errors.display_name?.message}
        inputProps={{
          type: 'text',
          autoComplete: 'name',
          placeholder: 'Randy Hough',
          ...register('display_name'),
        }}
      />
      <Field
        label="Company"
        icon={<Building2 size={14} aria-hidden />}
        error={errors.company?.message}
        inputProps={{
          type: 'text',
          autoComplete: 'organization',
          placeholder: 'Acme Property Management',
          ...register('company'),
        }}
      />
      <Field
        label="Email"
        icon={<Mail size={14} aria-hidden />}
        error={errors.email?.message}
        inputProps={{
          type: 'email',
          autoComplete: 'email',
          placeholder: 'you@example.com',
          ...register('email'),
        }}
      />
      <Field
        label="Password"
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
        Create account
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
