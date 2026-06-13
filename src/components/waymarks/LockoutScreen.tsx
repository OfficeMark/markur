import { Lock, LogOut, Mail } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth-context';
import { PRICING_TIERS, upgradeMailto } from '@/lib/trial';

export type LockoutScreenProps = {
  /** 'expired' subscription vs a lapsed 'trial' — tunes the headline copy. */
  expiredTrial?: boolean;
  orgName?: string | null;
};

/**
 * Full-screen lockout shown when the org's subscription is locked (trial ended
 * or expired). No app chrome — just the brand, why access is paused, the plans,
 * and how to reactivate. Sign-out stays available. A global super_admin never
 * sees this (gated upstream).
 */
export function LockoutScreen({ expiredTrial = true, orgName }: LockoutScreenProps) {
  const { signOut } = useAuth();
  const mailto = upgradeMailto(orgName);

  return (
    <div className="flex min-h-screen min-h-dvh flex-col bg-waymarks-cream text-text">
      <header className="flex h-14 items-center justify-between px-4 sm:px-6">
        <img
          src="/icons/markur-wordmark.png"
          alt="Markur, by Officemark"
          className="h-8 w-auto max-w-[150px]"
          width={1587}
          height={521}
        />
        <Button size="sm" variant="secondary" iconLeft={<LogOut size={14} aria-hidden />} onClick={() => void signOut()}>
          Sign out
        </Button>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-10 sm:px-6">
        <div className="rounded-xl border border-black/10 bg-surface p-6 shadow-sm dark:border-white/10 sm:p-8">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-waymarks-gold">
            <Lock size={12} aria-hidden /> Access paused
          </p>
          <h1 className="mt-2 font-semibold text-3xl text-text">
            {expiredTrial ? 'Your free trial has ended' : 'Your subscription has expired'}
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            {orgName ? <span className="font-medium text-text">{orgName}</span> : 'Your organization'} is
            paused. Your data is safe and untouched — reactivate a plan to pick up right where you
            left off.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {PRICING_TIERS.map((t) => (
              <div key={t.name} className="rounded-lg border border-black/10 p-4 dark:border-white/10">
                <p className="text-sm font-semibold text-text">{t.name}</p>
                <p className="mt-0.5 text-xl font-semibold text-waymarks-gold-deep">{t.price}</p>
                <p className="mt-1 text-xs text-text-muted">{t.blurb}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button variant="gold" iconLeft={<Mail size={16} aria-hidden />} onClick={() => (window.location.href = mailto)}>
              Contact us to upgrade
            </Button>
            <p className="text-xs text-text-faint">
              We'll activate your account and you're back in immediately.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
