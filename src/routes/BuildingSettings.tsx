import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, SlidersHorizontal } from 'lucide-react';
import { AppShell } from '@/components/waymarks/AppShell';
import { PinAppearanceControl } from '@/components/waymarks/PinAppearanceControl';
import { BuildingExternalLinkControl } from '@/components/waymarks/BuildingExternalLinkControl';
import {
  useBuilding,
  useSetBuildingExternalLink,
  useSetBuildingPinAppearance,
} from '@/hooks/useBuildings';
import { useCan } from '@/lib/permissions-context';
import { pinAppearanceFromSettings } from '@/lib/pin-appearance';
import { buildingExternalLinkFromSettings } from '@/lib/building-settings';

/**
 * Per-building settings (/buildings/:id/settings). Consolidates the set-once,
 * forget-it building controls that used to clutter the building page — pin
 * appearance and the order/external link — with room to grow (future Plan Prep
 * re-run, etc.). Admin-only (canConfigure); others are bounced to the building.
 */
export function BuildingSettings() {
  const { id } = useParams<{ id: string }>();
  const { data: building, isLoading, error } = useBuilding(id);
  const canConfigure = useCan('configure', { type: 'building', id: id ?? '' });
  const setPins = useSetBuildingPinAppearance(id);
  const setExtLink = useSetBuildingExternalLink(id);

  if (!canConfigure) return <Navigate to={id ? `/buildings/${id}` : '/'} replace />;

  if (isLoading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
          <div className="h-8 w-48 animate-pulse rounded-md bg-black/5 dark:bg-white/5" />
        </div>
      </AppShell>
    );
  }

  if (error || !building) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
          <h1 className="font-semibold text-3xl">Building not found</h1>
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
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <Link
          to={`/buildings/${building.id}`}
          className="mb-4 inline-flex items-center gap-1 text-xs text-text-muted hover:text-text"
        >
          <ArrowLeft size={12} aria-hidden /> Back to {building.name}
        </Link>

        <header className="mb-8 space-y-1">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.28em] text-waymarks-gold">
            <SlidersHorizontal size={12} aria-hidden /> Building settings
          </p>
          <h1 className="font-semibold text-3xl text-text">{building.name}</h1>
          <p className="text-sm text-text-muted">
            Set-once-and-forget options for this building. Everyone — including clients on a share
            link — sees the same result.
          </p>
        </header>

        <div className="space-y-8">
          <section className="rounded-lg border border-black/10 bg-surface p-5 dark:border-white/10">
            <header className="mb-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-text-faint">
                Pin appearance
              </p>
              <p className="mt-1 text-sm text-text-muted">
                Shape and size of every pin on this building's floor plans. Status and type colors
                are unchanged.
              </p>
            </header>
            <PinAppearanceControl
              shape={pinAppearanceFromSettings(building.settings).pinShape}
              size={pinAppearanceFromSettings(building.settings).pinSize}
              disabled={setPins.isPending}
              onChange={(next) => setPins.mutate(next)}
            />
            {setPins.isError && (
              <p className="mt-2 text-xs text-danger">Couldn't save the pin appearance. Try again.</p>
            )}
          </section>

          <section className="rounded-lg border border-black/10 bg-surface p-5 dark:border-white/10">
            <header className="mb-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-text-faint">
                Order / external link
              </p>
              <p className="mt-1 text-sm text-text-muted">
                The action button on each pin's details. Keep the default Officemark order page, point
                it at your own portal, or hide it. A pin's own vendor or contact link still takes
                priority; clients on a share link never see this button.
              </p>
            </header>
            <BuildingExternalLinkControl
              value={buildingExternalLinkFromSettings(building.settings)}
              saving={setExtLink.isPending}
              savedAt={setExtLink.isSuccess ? 1 : null}
              onSave={(link) => setExtLink.mutate(link)}
            />
            {setExtLink.isError && (
              <p className="mt-2 text-xs text-danger">Couldn't save the link. Try again.</p>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
