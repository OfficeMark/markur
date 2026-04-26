import { Link, Navigate } from 'react-router-dom';
import { Building2, MapPin } from 'lucide-react';
import { AppShell } from '@/components/waymarks/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions-context';
import { useBuildings } from '@/hooks/useBuildings';
import { useTenantRepRedirect } from '@/hooks/useTenantRepRedirect';
import { ResumeAuditBanner } from '@/components/waymarks/ResumeAuditBanner';
import type { Building } from '@/types/database';

/**
 * The home (post-sign-in) screen.
 *
 *   - tenant-rep-only users → redirected to their primary floor (per spec 04)
 *   - signed-in user with zero access_grants → "no buildings yet" empty state
 *   - signed-in user with grants → list of buildings, sidebar active
 */
export function Home() {
  const { profile } = useAuth();
  const { grants, loading: pLoading } = usePermissions();
  const { data: buildings, isLoading: bLoading } = useBuildings();
  const { loading: trLoading, redirectTo } = useTenantRepRedirect();

  if (trLoading) return <Loading inShell />;
  if (redirectTo) return <Navigate to={redirectTo} replace />;

  const noGrants = !pLoading && grants.length === 0;

  return (
    <AppShell withSidebar={!noGrants}>
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
        <header className="mb-8 space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-text-faint">
            {profile ? `Welcome back, ${profile.display_name.split(' ')[0]}` : 'Welcome'}
          </p>
          <h1 className="font-serif text-3xl text-text sm:text-4xl">Buildings</h1>
        </header>

        <ResumeAuditBanner />

        {pLoading || bLoading ? (
          <Loading />
        ) : noGrants ? (
          <EmptyState
            icon={<Building2 size={32} aria-hidden />}
            title="No buildings yet"
            description="You haven't been granted access to any buildings. Ask your admin to invite you, or contact support if this looks wrong."
          />
        ) : !buildings || buildings.length === 0 ? (
          <EmptyState
            icon={<Building2 size={32} aria-hidden />}
            title="No buildings to show"
            description="Your access is set up, but no buildings are visible. They may have been removed, or RLS is filtering them out."
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {buildings.map((b) => (
              <BuildingCard key={b.id} building={b} />
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

function BuildingCard({ building }: { building: Building }) {
  return (
    <li>
      <Link
        to={`/buildings/${building.id}`}
        className="block rounded-lg border border-black/10 bg-surface p-5 transition-colors hover:border-black/20 hover:bg-waymarks-gold-soft dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/5"
      >
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-waymarks-gold-soft text-waymarks-ink dark:bg-white/5 dark:text-white">
            <Building2 size={18} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-serif text-xl text-text">{building.name}</p>
            <p className="mt-1 flex items-center gap-1 truncate text-xs text-text-muted">
              <MapPin size={12} aria-hidden className="shrink-0" />
              <span className="truncate">
                {building.address}, {building.city}
                {building.region ? `, ${building.region}` : ''}
              </span>
            </p>
            <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-text-faint">
              {building.total_floors} {building.total_floors === 1 ? 'floor' : 'floors'}
            </p>
          </div>
        </div>
      </Link>
    </li>
  );
}

function Loading({ inShell }: { inShell?: boolean } = {}) {
  const cards = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-hidden>
      {[0, 1].map((i) => (
        <div
          key={i}
          className="h-24 animate-pulse rounded-lg border border-black/10 bg-surface dark:border-white/10"
        />
      ))}
    </div>
  );
  if (!inShell) return cards;
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-12">{cards}</div>
    </AppShell>
  );
}
