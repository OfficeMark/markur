import { Building2 } from 'lucide-react';
import { AppShell } from '@/components/waymarks/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions-context';

/**
 * The home (post-sign-in) screen. For M1 it is intentionally minimal:
 *   - signed-in user with zero access_grants → "no buildings yet" empty state
 *   - signed-in user with grants → a placeholder list (real BuildingNav lands in M2)
 *
 * The header is rendered by AppShell so the wordmark / sync chip / user chip
 * are present everywhere.
 */
export function Home() {
  const { profile } = useAuth();
  const { grants, loading } = usePermissions();

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="mb-8 space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-text-faint">
            {profile ? `Welcome back, ${profile.display_name.split(' ')[0]}` : 'Welcome'}
          </p>
          <h1 className="font-serif text-3xl text-text sm:text-4xl">Buildings</h1>
        </header>

        {loading ? (
          <div className="flex h-40 items-center justify-center text-text-faint">
            <div
              className="h-6 w-6 animate-spin rounded-full border-2 border-waymarks-gold/40 border-t-waymarks-gold"
              aria-hidden
            />
            <span className="sr-only">Loading your access…</span>
          </div>
        ) : grants.length === 0 ? (
          <EmptyState
            icon={<Building2 size={32} aria-hidden />}
            title="No buildings yet"
            description="You haven't been granted access to any buildings. Ask your admin to invite you, or contact support if this looks wrong."
          />
        ) : (
          <PlaceholderList grantCount={grants.length} />
        )}
      </div>
    </AppShell>
  );
}

function PlaceholderList({ grantCount }: { grantCount: number }) {
  return (
    <div className="rounded-xl border border-black/10 bg-surface p-6 text-sm text-text-muted dark:border-white/10">
      You have {grantCount} access grant{grantCount === 1 ? '' : 's'}. The building list lands in
      M2 — for now this confirms that auth and permissions are wired up correctly.
    </div>
  );
}
