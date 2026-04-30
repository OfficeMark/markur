import { Link, Navigate } from 'react-router-dom';
import { Building2, ChevronRight, MapPin } from 'lucide-react';
import { AppShell } from '@/components/waymarks/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions-context';
import { useBuildingPhotoUrl, useBuildings } from '@/hooks/useBuildings';
import { useTenantRepRedirect } from '@/hooks/useTenantRepRedirect';
import { ResumeAuditBanner } from '@/components/waymarks/ResumeAuditBanner';
import { WelcomeCard } from '@/components/waymarks/WelcomeCard';
import type { Building } from '@/types/database';

/**
 * The home (post-sign-in) screen.
 *
 *   - tenant-rep-only users → redirected to their primary floor (per spec 04)
 *   - signed-in user with zero access_grants → "no buildings yet" empty state
 *   - signed-in user with grants → list of buildings (with photo thumbnails)
 *
 * M10b bumped the type scale and gave each card a hero photo + bigger
 * presence so Home feels like the actual entrance to the product.
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
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <header className="mb-10 space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-waymarks-gold">
            {profile ? `Welcome back, ${profile.display_name.split(' ')[0]}` : 'Welcome'}
          </p>
          <h1 className="font-semibold text-4xl leading-tight text-text sm:text-5xl">Buildings</h1>
          <p className="max-w-xl text-sm text-text-muted">
            Every sign on every floor, accounted for. Pick a building to see its floor plans, audits, and recent activity.
          </p>
        </header>

        <ResumeAuditBanner />
        <WelcomeCard />

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
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
  const photoUrl = useBuildingPhotoUrl(building.photo_url);
  return (
    <li>
      <Link
        to={`/buildings/${building.id}`}
        className="group block overflow-hidden rounded-xl border border-black/10 bg-surface shadow-sm transition-all hover:-translate-y-0.5 hover:border-waymarks-gold hover:shadow-md dark:border-white/10"
      >
        <div className="aspect-[16/9] w-full overflow-hidden bg-waymarks-ink">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt=""
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-waymarks-ink">
              <Building2 size={32} className="text-white/35" aria-hidden />
            </div>
          )}
        </div>
        <div className="space-y-1.5 p-5">
          <p className="font-semibold text-2xl text-text">{building.name}</p>
          <p className="flex items-start gap-1.5 text-sm text-text-muted">
            <MapPin size={13} aria-hidden className="mt-0.5 shrink-0" />
            <span>
              {building.address}, {building.city}
              {building.region ? `, ${building.region}` : ''}
            </span>
          </p>
          <div className="flex items-center justify-between pt-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-text-faint">
              {building.total_floors} {building.total_floors === 1 ? 'floor' : 'floors'}
            </p>
            <span className="inline-flex items-center gap-0.5 text-xs font-medium text-waymarks-gold opacity-0 transition-opacity group-hover:opacity-100">
              Open <ChevronRight size={12} aria-hidden />
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}

function Loading({ inShell }: { inShell?: boolean } = {}) {
  const cards = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-hidden>
      {[0, 1].map((i) => (
        <div
          key={i}
          className="h-72 animate-pulse rounded-xl border border-black/10 bg-surface dark:border-white/10"
        />
      ))}
    </div>
  );
  if (!inShell) return cards;
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">{cards}</div>
    </AppShell>
  );
}
