import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  LogOut,
  Mail,
  Moon,
  Save,
  ShieldCheck,
  Sun,
  Trash2,
} from 'lucide-react';
import { AppShell } from '@/components/waymarks/AppShell';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions-context';
import { updateMyProfile } from '@/lib/queries/profile';
import { useTheme } from '@/components/waymarks/theme-context';
// M15: AssetTypes / Members / PendingInvitations have moved to /admin.
// /settings is now personal-only (profile, theme, account).

export function Settings() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const { grants } = usePermissions();
  const email = user?.email ?? '';

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(profile?.display_name ?? '');
  }, [profile?.display_name]);

  const dirty =
    displayName.trim().length > 0 && displayName !== (profile?.display_name ?? '');

  const now = Date.now();
  const active = grants.filter(
    (g) => !g.expires_at || new Date(g.expires_at).getTime() > now
  );
  const isSuper = active.some((g) => g.role === 'super_admin');
  const isAdmin = active.some((g) => g.role === 'building_admin');
  const isAuditor = active.some((g) => g.role === 'auditor');
  const isFacility = active.some((g) => g.role === 'tenant_rep');
  const roleLabel = isSuper
    ? 'Super admin'
    : isAdmin
      ? 'Manager'
      : isAuditor
        ? 'Auditor'
        : isFacility
          ? 'Facilities'
          : 'No active role';

  async function onSave() {
    if (!user) return;
    if (!dirty) return;
    setSaving(true);
    setError(null);
    try {
      await updateMyProfile(user.id, { display_name: displayName.trim() });
      await refreshProfile();
      setSavedAt(Date.now());
      window.setTimeout(() => setSavedAt(null), 2400);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell withSidebar={false}>
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-8">
        <div className="mb-4 flex items-center gap-2 text-xs text-text-muted">
          <Link
            to="/"
            className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-black/5 hover:underline"
          >
            <ArrowLeft size={12} aria-hidden />
            Home
          </Link>
          <span aria-hidden>/</span>
          <span>Settings</span>
        </div>

        <h1 className="font-semibold text-3xl">Account settings</h1>
        <p className="mt-1 text-sm text-text-muted">
          Manage your name, theme, sign out, or request account deletion.
        </p>

        <section className="mt-6 rounded-lg border border-black/10 bg-surface p-5">
          <header className="mb-4 flex items-center gap-3">
            <Avatar
              name={profile?.display_name ?? email ?? 'You'}
              src={profile?.avatar_url ?? undefined}
              size="lg"
            />
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
                Profile
              </p>
              <p className="truncate text-base font-semibold">{email}</p>
            </div>
          </header>

          <label className="block">
            <span className="block text-xs font-medium uppercase tracking-[0.18em] text-text-faint">
              Display name
            </span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={80}
              autoComplete="name"
              className="mt-1 h-10 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold"
            />
            <span className="mt-1 block text-[11px] text-text-faint">
              Shown to other people on your buildings.
            </span>
          </label>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <ReadOnlyField label="Email" value={email} icon={<Mail size={12} aria-hidden />} />
            <ReadOnlyField
              label="Role"
              value={roleLabel}
              icon={<ShieldCheck size={12} aria-hidden />}
            />
          </div>

          {error && (
            <p className="mt-3 flex items-start gap-2 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">
              <AlertCircle size={12} aria-hidden className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </p>
          )}

          <div className="mt-4 flex items-center justify-end gap-2">
            {savedAt && (
              <span className="inline-flex items-center gap-1 text-xs text-success">
                <Check size={12} aria-hidden /> Saved
              </span>
            )}
            <Button
              variant="gold"
              disabled={!dirty}
              loading={saving}
              onClick={onSave}
              iconLeft={<Save size={12} aria-hidden />}
            >
              Save changes
            </Button>
          </div>
        </section>

        <ThemeSection />

        <ActionHintsSection />

        <AdminLink isAdmin={isSuper || isAdmin} />

        <section className="mt-5 rounded-lg border border-black/10 bg-surface p-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
            Account
          </p>
          <h2 className="mt-1 font-semibold text-lg">Sign out or close your account</h2>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-text-muted">
              Sign out of this device. Your data stays on your buildings.
            </p>
            <Button
              variant="secondary"
              onClick={() => void signOut()}
              iconLeft={<LogOut size={12} aria-hidden />}
            >
              Sign out
            </Button>
          </div>

          <div className="mt-5 flex flex-col gap-2 rounded-md border border-danger/30 bg-danger-bg p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <p className="font-medium text-danger">Delete my account</p>
              <p className="mt-0.5 text-xs text-text-muted">
                We do not have self-serve deletion yet. Email us and we will
                process the deletion within 30 days, per our{' '}
                <Link to="/legal/privacy" className="underline">
                  privacy policy
                </Link>
                .
              </p>
            </div>
            <a
              href="mailto:support@officemark.ca?subject=Delete%20my%20Markur%20account"
              className="inline-flex items-center gap-1.5 self-end rounded-md border border-danger/40 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/10 sm:self-center"
            >
              <Trash2 size={12} aria-hidden />
              Email support
            </a>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function ReadOnlyField({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
        {icon}
        {label}
      </p>
      <p className="mt-1 truncate rounded-md border border-black/10 bg-bg px-3 py-2 text-sm text-text">
        {value || '-'}
      </p>
    </div>
  );
}

function ThemeSection() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <section className="mt-5 rounded-lg border border-black/10 bg-surface p-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
        Appearance
      </p>
      <h2 className="mt-1 font-semibold text-lg">Theme</h2>
      <p className="mt-1 text-sm text-text-muted">
        Light mode is the default. Dark mode swaps the page background to a
        soft grey and keeps the content cards white.
      </p>
      <div
        role="radiogroup"
        aria-label="Theme"
        className="mt-3 inline-flex rounded-md border border-black/10 p-0.5"
      >
        <button
          type="button"
          role="radio"
          aria-checked={!isDark}
          onClick={() => setTheme('light')}
          className={
            'inline-flex items-center gap-1.5 rounded-[5px] px-3 py-1.5 text-sm transition-colors ' +
            (!isDark
              ? 'bg-waymarks-ink text-white'
              : 'text-text-muted hover:text-text')
          }
        >
          <Sun size={14} aria-hidden />
          Light
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={isDark}
          onClick={() => setTheme('dark')}
          className={
            'inline-flex items-center gap-1.5 rounded-[5px] px-3 py-1.5 text-sm transition-colors ' +
            (isDark
              ? 'bg-waymarks-ink text-white'
              : 'text-text-muted hover:text-text')
          }
        >
          <Moon size={14} aria-hidden />
          Dark
        </button>
      </div>
    </section>
  );
}

/**
 * M32 Step 2B — per-user toggle for the new tooltip ("action hints") system.
 * Stored on profiles.show_action_hints (migration 0029). Read via the
 * ActionHintsProvider context at the app root; the <Tooltip> primitive
 * short-circuits when this is off.
 */
function ActionHintsSection() {
  const { user, profile, refreshProfile } = useAuth();
  const enabled = profile?.show_action_hints ?? true;
  const [busy, setBusy] = useState(false);

  async function setHints(value: boolean) {
    if (!user || value === enabled || busy) return;
    setBusy(true);
    try {
      await updateMyProfile(user.id, { show_action_hints: value });
      await refreshProfile();
    } catch {
      // Network/RLS failures are rare for a single-column self-update;
      // keep the previous toggle state visible if it happens.
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-5 rounded-lg border border-black/10 bg-surface p-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
        Hints
      </p>
      <h2 className="mt-1 font-semibold text-lg">Show button hints</h2>
      <p className="mt-1 text-sm text-text-muted">
        Small tooltips that pop up on hover describing what each button does.
        Turn this off once you know your way around.
      </p>
      <div
        role="radiogroup"
        aria-label="Show button hints"
        className="mt-3 inline-flex rounded-md border border-black/10 p-0.5"
      >
        <button
          type="button"
          role="radio"
          aria-checked={enabled}
          disabled={busy}
          onClick={() => void setHints(true)}
          className={
            'inline-flex items-center gap-1.5 rounded-[5px] px-3 py-1.5 text-sm transition-colors disabled:opacity-60 ' +
            (enabled
              ? 'bg-waymarks-ink text-white'
              : 'text-text-muted hover:text-text')
          }
        >
          On
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={!enabled}
          disabled={busy}
          onClick={() => void setHints(false)}
          className={
            'inline-flex items-center gap-1.5 rounded-[5px] px-3 py-1.5 text-sm transition-colors disabled:opacity-60 ' +
            (!enabled
              ? 'bg-waymarks-ink text-white'
              : 'text-text-muted hover:text-text')
          }
        >
          Off
        </button>
      </div>
    </section>
  );
}

function AdminLink({ isAdmin }: { isAdmin: boolean }) {
  if (!isAdmin) return null;
  return (
    <Link
      to="/admin"
      className="mt-5 flex items-center justify-between gap-3 rounded-lg border border-waymarks-gold/40 bg-waymarks-gold-soft p-4 transition-colors hover:bg-waymarks-gold/15 dark:bg-white/5 dark:hover:bg-white/10"
    >
      <div>
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-waymarks-gold">
          <ShieldCheck size={12} aria-hidden /> Admin
        </p>
        <p className="mt-1 font-semibold text-base text-waymarks-ink dark:text-white">
          Team, asset types, security, and branding
        </p>
        <p className="mt-0.5 text-xs text-text-muted">
          Manage who has access, customize asset types, review your security
          posture, and brand the app for your org.
        </p>
      </div>
      <ArrowRight size={18} aria-hidden className="shrink-0 text-waymarks-gold" />
    </Link>
  );
}
