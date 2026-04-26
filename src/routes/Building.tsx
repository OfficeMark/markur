import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin, Layers, ImageOff, Trash2 } from 'lucide-react';
import { AppShell } from '@/components/waymarks/AppShell';
import { AccessManagementCard } from '@/components/waymarks/AccessManagementCard';
import { ResumeAuditBanner } from '@/components/waymarks/ResumeAuditBanner';
import { useBuilding } from '@/hooks/useBuildings';
import { useFloors } from '@/hooks/useFloors';
import { useCan, useIsSuperAdmin } from '@/lib/permissions-context';
import type { Floor } from '@/types/database';

export function Building() {
  const { id } = useParams<{ id: string }>();
  const { data: building, isLoading: bLoading, error: bError } = useBuilding(id);
  const { data: floors = [], isLoading: fLoading } = useFloors(id);
  const isSuperAdmin = useIsSuperAdmin();
  const canManageAccess = useCan('manage_access', { type: 'building', id: id ?? '' });

  if (bLoading) return <Skeleton />;

  if (bError || !building) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
          <h1 className="font-serif text-2xl">Building not found</h1>
          <p className="mt-2 text-sm text-text-muted">
            It may have been removed or you may not have access.
          </p>
          <Link
            to="/"
            className="mt-4 inline-flex items-center gap-1 text-sm text-waymarks-gold hover:underline"
          >
            <ArrowLeft size={14} aria-hidden /> Back to buildings
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-1 text-xs text-text-muted hover:text-text"
        >
          <ArrowLeft size={12} aria-hidden /> All buildings
        </Link>
        <header className="mb-8 space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-text-faint">Building</p>
          <h1 className="font-serif text-3xl text-text sm:text-4xl">{building.name}</h1>
          <p className="flex items-center gap-1.5 text-sm text-text-muted">
            <MapPin size={14} aria-hidden />
            <span>
              {building.address}, {building.city}
              {building.region ? `, ${building.region}` : ''}
            </span>
          </p>
        </header>

        <ResumeAuditBanner buildingId={building.id} />

        {isSuperAdmin && building && (
          <div className="mb-6 flex flex-wrap gap-2">
            <Link
              to={`/buildings/${building.id}/trash`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-black/10 bg-surface px-3 text-xs font-medium text-text-muted hover:border-black/20 hover:text-text dark:border-white/10 dark:hover:border-white/20"
            >
              <Trash2 size={12} aria-hidden />
              <span>Trash</span>
            </Link>
          </div>
        )}

        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-text-faint">
            Floors
          </h2>
          {fLoading ? (
            <FloorListSkeleton />
          ) : floors.length === 0 ? (
            <p className="rounded-lg border border-black/10 bg-surface p-4 text-sm text-text-muted dark:border-white/10">
              No floors set up yet.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {floors.map((f) => (
                <FloorCard key={f.id} floor={f} />
              ))}
            </ul>
          )}
        </section>

        {canManageAccess && (
          <section className="mt-8">
            <AccessManagementCard buildingId={building.id} />
          </section>
        )}
      </div>
    </AppShell>
  );
}

function FloorCard({ floor }: { floor: Floor }) {
  return (
    <li>
      <Link
        to={`/floors/${floor.id}`}
        className="flex items-center gap-3 rounded-lg border border-black/10 bg-surface p-4 transition-colors hover:border-black/20 hover:bg-waymarks-gold-soft dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/5"
      >
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-waymarks-gold-soft text-waymarks-ink dark:bg-white/5 dark:text-white">
          <Layers size={16} aria-hidden />
        </span>
        <span className="flex-1">
          <span className="block font-medium text-text">{floor.label}</span>
          <span className="block text-xs text-text-faint">
            {floor.plan_url ? 'Plan uploaded' : 'No plan yet'}
          </span>
        </span>
        {!floor.plan_url && <ImageOff size={14} aria-hidden className="text-text-faint" />}
      </Link>
    </li>
  );
}

function FloorListSkeleton() {
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="h-16 animate-pulse rounded-lg border border-black/10 bg-surface dark:border-white/10" />
      ))}
    </ul>
  );
}

function Skeleton() {
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <div className="h-7 w-40 animate-pulse rounded-md bg-black/5 dark:bg-white/5" />
        <div className="mt-3 h-4 w-72 animate-pulse rounded-md bg-black/5 dark:bg-white/5" />
        <div className="mt-8 h-32 animate-pulse rounded-lg bg-black/5 dark:bg-white/5" />
      </div>
    </AppShell>
  );
}
