import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, AlertCircle, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

type Mode = 'sign-in' | 'sign-up';

const signInSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
});

const signUpSchema = signInSchema.extend({
  display_name: z.string().min(1, 'Your name helps us address you'),
});

type SignInValues = z.infer<typeof signInSchema>;
type SignUpValues = z.infer<typeof signUpSchema>;

export function Login() {
  const [mode, setMode] = useState<Mode>('sign-in');
  return (
    <div className="flex min-h-screen items-center justify-center bg-waymarks-cream px-4 py-12 text-text">
      <div className="w-full max-w-md space-y-6">
        <header className="space-y-3 text-center">
          <Link
            to="/"
            className="inline-block font-serif text-3xl text-waymarks-ink outline-none focus-visible:text-waymarks-gold dark:text-white"
          >
            Way<span className="text-waymarks-gold">marks</span>
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
      <Button type="submit" variant="gold" size="lg" fullWidth loading={isSubmitting}>
        Sign in
      </Button>
    </form>
  );
}

function SignUpForm({ onSwitchToSignIn }: { onSwitchToSignIn: () => void }) {
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
        data: { display_name: values.display_name },
      },
    });
    if (error) {
      setAuthError(error.message);
      return;
    }
    if (data.session) {
      // Auto sign-in. The AuthProvider will pick this up via onAuthStateChange
      // and the route guard in App.tsx will redirect us to /.
      return;
    }
    // Email confirmation required.
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
          'flex h-11 items-center gap-2 rounded-md border bg-surface px-3 transition-colors focus-within:border-waymarks-gold focus-within:ring-2 focus-within:ring-waymarks-gold/40 dark:border-white/10',
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
