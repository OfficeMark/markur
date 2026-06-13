import { useEffect, useState } from 'react';
import { Layers, MapPin, ImageOff } from 'lucide-react';
import { GuestLayout } from './GuestLayout';
import { GuestFloor } from './GuestFloor';
import { useBuilding } from '@/hooks/useBuildings';
import { useFloors } from '@/hooks/useFloors';
import { logAccess } from '@/lib/queries/access-log';
import { planProvenanceLabel } from '@/lib/plan-provenance';
import type { Floor } from '@/types/database';

/**
 * Guest viewer experience for a shared building. Owns the chrome-free
 * GuestLayout and switches between the floor list and a single floor
 * (GuestFloor) entirely client-side — the share link stays put, no admin
 * chrome, no edit affordances anywhere.
 */
export function GuestBuilding({ buildingId }: { buildingId: string }) {
  const { data: building, isLoading: bLoading } = useBuilding(buildingId);
  const { data: floors = [], isLoading: fLoading } = useFloors(buildingId);
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);

  useEffect(() => {
    void logAccess('view', 'building', buildingId);
  }, [buildingId]);

  if (bLoading) {
    return (
      <GuestLayout>
        <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
          <div className="h-10 w-72 animate-pulse rounded-md bg-black/5 dark:bg-white/5" />
          <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded-md bg-black/5 dark:bg-white/5" />
        </div>
      </GuestLayout>
    );
  }

  if (!building) {
    return (
      <GuestLayout>
        <div className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
          <p className="font-semibold text-xl text-text">Building unavailable</p>
          <p className="mt-1 text-sm text-text-muted">
            This shared building can't be loaded. Your access may have ended.
          </p>
        </div>
      </GuestLayout>
    );
  }

  const selectedFloor = floors.find((f) => f.id === selectedFloorId) ?? null;

  if (selectedFloorId) {
    return (
      <GuestLayout title={`${building.name}${selectedFloor ? ` · Floor ${selectedFloor.label}` : ''}`}>
        <GuestFloor floorId={selectedFloorId} building={building} onBack={() => setSelectedFloorId(null)} />
      </GuestLayout>
    );
  }

  return (
    <GuestLayout title={building.name}>
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-8 space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-waymarks-gold">
            Signage walkthrough
          </p>
          <h1 className="font-semibold text-3xl leading-tight text-text sm:text-4xl">{building.name}</h1>
          <p className="flex items-start gap-1.5 text-sm text-text-muted">
            <MapPin size={15} aria-hidden className="mt-0.5 shrink-0" />
            <span>
              {building.address}, {building.city}
              {building.region ? `, ${building.region}` : ''}
            </span>
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.22em] text-text-faint">
            Floors
          </h2>
          {fLoading ? (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="h-16 animate-pulse rounded-lg border border-black/10 bg-surface dark:border-white/10" />
              ))}
            </ul>
          ) : floors.length === 0 ? (
            <div className="rounded-lg border border-black/10 bg-surface p-4 text-sm text-text-muted dark:border-white/10">
              No floors to view yet.
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {floors.map((f) => (
                <FloorCard key={f.id} floor={f} onOpen={() => setSelectedFloorId(f.id)} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </GuestLayout>
  );
}

function FloorCard({ floor, onOpen }: { floor: Floor; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="group flex w-full items-center gap-3 rounded-lg border border-black/10 bg-surface p-4 text-left transition-all hover:-translate-y-0.5 hover:border-waymarks-gold hover:shadow-sm dark:border-white/10"
      >
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-waymarks-gold-soft text-waymarks-gold dark:bg-white/5 dark:text-white">
          <Layers size={18} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-text">{floor.label}</span>
          <span className="block text-xs text-text-faint">
            {floor.plan_url ? 'View plan' : 'No plan yet'}
          </span>
          {floor.plan_url && planProvenanceLabel(floor.plan_provenance) && (
            <span className="mt-0.5 block text-[11px] italic text-text-faint">
              {planProvenanceLabel(floor.plan_provenance)}
            </span>
          )}
        </span>
        {!floor.plan_url && <ImageOff size={14} aria-hidden className="shrink-0 text-text-faint" />}
      </button>
    </li>
  );
}
