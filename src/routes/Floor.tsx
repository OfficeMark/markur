import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ImageOff } from 'lucide-react';
import { AppShell } from '@/components/waymarks/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { useFloor } from '@/hooks/useFloors';
import { useBuilding } from '@/hooks/useBuildings';

export function Floor() {
  const { id } = useParams<{ id: string }>();
  const { data: floor, isLoading: fLoading, error: fError } = useFloor(id);
  const { data: building } = useBuilding(floor?.building_id);

  if (fLoading) return <Skeleton />;

  if (fError || !floor) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
          <h1 className="font-serif text-2xl">Floor not found</h1>
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
          to={`/buildings/${floor.building_id}`}
          className="mb-4 inline-flex items-center gap-1 text-xs text-text-muted hover:text-text"
        >
          <ArrowLeft size={12} aria-hidden /> {building?.name ?? 'Building'}
        </Link>
        <header className="mb-8 space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-text-faint">
            {building ? `${building.name} · floor` : 'Floor'}
          </p>
          <h1 className="font-serif text-3xl text-text sm:text-4xl">{floor.label}</h1>
        </header>

        {floor.plan_url ? (
          <div className="rounded-xl border border-black/10 bg-surface p-6 text-sm text-text-muted dark:border-white/10">
            Floor plan rendering arrives in M3.
          </div>
        ) : (
          <EmptyState
            icon={<ImageOff size={32} aria-hidden />}
            title="No plan uploaded yet"
            description="Once a floor plan is uploaded you'll see it here, with pins for every sign placed on it. Plan upload arrives in M3."
          />
        )}
      </div>
    </AppShell>
  );
}

function Skeleton() {
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <div className="h-7 w-40 animate-pulse rounded-md bg-black/5 dark:bg-white/5" />
        <div className="mt-3 h-4 w-32 animate-pulse rounded-md bg-black/5 dark:bg-white/5" />
        <div className="mt-8 h-32 animate-pulse rounded-lg bg-black/5 dark:bg-white/5" />
      </div>
    </AppShell>
  );
}
