import { Link, useParams } from 'react-router-dom';
import { useState } from 'react';
import { ArrowLeft, MapPin, Layers, ImageOff, Trash2, Plus, FileDown } from 'lucide-react';
import { AppShell } from '@/components/waymarks/AppShell';
import { Tooltip } from '@/components/ui/Tooltip';
import { AccessManagementCard } from '@/components/waymarks/AccessManagementCard';
import { BuildingPhotoUpload } from '@/components/waymarks/BuildingPhotoUpload';
import { NewFloorDialog } from '@/components/waymarks/NewFloorDialog';
import { ResumeAuditBanner } from '@/components/waymarks/ResumeAuditBanner';
import { BuildingExternalLinkCard } from '@/components/waymarks/BuildingExternalLinkCard';
import { ExternalLinkButton } from '@/components/waymarks/ExternalLinkButton';
import { getBuildingExternalLink } from '@/lib/building-settings';
import { useBuilding } from '@/hooks/useBuildings';
import { useFloors } from '@/hooks/useFloors';
import { useCan, useIsSuperAdmin } from '@/lib/permissions-context';
import type { Floor } from '@/types/database';

export function Building() {
  const { id } = useParams<{ id: string }>();
  const { data: building, isLoading: bLoading, error: bError } = useBuilding(id);
  const { data: floors = [], isLoading: fLoading } = useFloors(id);
  const [newFloorOpen, setNewFloorOpen] = useState(false);
  const isSuperAdmin = useIsSuperAdmin();
  const canManageAccess = useCan('manage_access', { type: 'building', id: id ?? '' });
  const canConfigure = useCan('configure', { type: 'building', id: id ?? '' });
  const canEdit = useCan('edit', { type: 'building', id: id ?? '' });

  if (bLoading) return <Skeleton />;

  if (bError || !building) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
          <h1 className="font-semibold text-3xl">Building not found</h1>
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

  const externalLink = getBuildingExternalLink(building);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-1 text-xs text-text-muted hover:text-text"
        >
          <ArrowLeft size={12} aria-hidden /> All buildings
        </Link>

        <BuildingPhotoUpload
          buildingId={building.id}
          photoPath={building.photo_url}
          canEdit={canConfigure}
          variant="hero"
        />

        <header className="mt-6 mb-10 space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-waymarks-gold">
            Building
          </p>
          <h1 className="font-semibold text-4xl leading-tight text-text sm:text-5xl">{building.name}</h1>
          <p className="flex items-center gap-1.5 text-base text-text-muted">
            <MapPin size={15} aria-hidden />
            <span>
              {building.address}, {building.city}
              {building.region ? `, ${building.region}` : ''}
            </span>
          </p>
        </header>

        <ResumeAuditBanner buildingId={building.id} />

        <div className="mb-6 flex flex-wrap gap-2">
          <Tooltip text="Survey report: every asset in this building, grouped by floor.">
            <Link
              to={`/reports/${building.id}?mode=survey`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-black/10 bg-surface px-3 text-xs font-medium text-text hover:border-black/20 dark:border-white/10 dark:hover:border-white/20"
            >
              <FileDown size={12} aria-hidden />
              <span>Survey report</span>
            </Link>
          </Tooltip>
          <Tooltip text="Audit report: flagged + needs-attention assets, with descriptions and photos.">
            <Link
              to={`/reports/${building.id}?mode=audit`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-black/10 bg-surface px-3 text-xs font-medium text-text hover:border-black/20 dark:border-white/10 dark:hover:border-white/20"
            >
              <FileDown size={12} aria-hidden />
              <span>Audit report</span>
            </Link>
          </Tooltip>
          {isSuperAdmin && (
            <Link
              to={`/buildings/${building.id}/trash`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-black/10 bg-surface px-3 text-xs font-medium text-text-muted hover:border-black/20 hover:text-text dark:border-white/10 dark:hover:border-white/20"
            >
              <Trash2 size={12} aria-hidden />
              <span>Trash</span>
            </Link>
          )}
          <ExternalLinkButton
            url={externalLink?.url}
            label={externalLink?.label}
            className="ml-auto h-9 rounded-md border border-waymarks-gold/40 bg-surface px-3 text-xs text-waymarks-gold hover:border-waymarks-gold hover:bg-waymarks-gold-soft dark:bg-white/5 dark:hover:bg-white/10"
          />
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.22em] text-text-faint">
              Floors
            </h2>
            {canEdit && (
              <Tooltip text="Add a new floor to this building">
                <button
                  type="button"
                  onClick={() => setNewFloorOpen(true)}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-black/15 bg-surface px-2.5 text-[11px] font-medium text-text hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
                >
                  <Plus size={11} aria-hidden />
                  Add floor
                </button>
              </Tooltip>
            )}
          </div>
          {fLoading ? (
            <FloorListSkeleton />
          ) : floors.length === 0 ? (
            <div className="rounded-lg border border-black/10 bg-surface p-4 dark:border-white/10">
              <p className="text-sm text-text-muted">No floors set up yet.</p>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setNewFloorOpen(true)}
                  className="mt-3 inline-flex h-8 items-center gap-1 rounded-md bg-waymarks-gold px-3 text-xs font-medium text-waymarks-ink hover:bg-waymarks-gold-deep"
                >
                  <Plus size={12} aria-hidden />
                  Add the first floor
                </button>
              )}
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {floors.map((f) => (
                <FloorCard key={f.id} floor={f} />
              ))}
            </ul>
          )}
        </section>

        {canManageAccess && (
          <section className="mt-10">
            <AccessManagementCard buildingId={building.id} />
          </section>
        )}

        {canConfigure && (
          <section className="mt-10">
            <BuildingExternalLinkCard building={building} />
          </section>
        )}
      </div>
      {building && (
        <NewFloorDialog
          open={newFloorOpen}
          onOpenChange={setNewFloorOpen}
          buildingId={building.id}
          buildingName={building.name}
        />
      )}
    </AppShell>
  );
}

function FloorCard({ floor }: { floor: Floor }) {
  return (
    <li>
      <Link
        to={`/floors/${floor.id}`}
        className="group flex items-center gap-3 rounded-lg border border-black/10 bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-waymarks-gold hover:shadow-sm dark:border-white/10"
      >
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-waymarks-gold-soft text-waymarks-gold dark:bg-white/5 dark:text-white">
          <Layers size={18} aria-hidden />
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
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div className="h-48 w-full animate-pulse rounded-xl bg-black/5 dark:bg-white/5 sm:h-64" />
        <div className="mt-6 h-10 w-72 animate-pulse rounded-md bg-black/5 dark:bg-white/5" />
        <div className="mt-3 h-4 w-96 animate-pulse rounded-md bg-black/5 dark:bg-white/5" />
        <div className="mt-8 h-32 animate-pulse rounded-lg bg-black/5 dark:bg-white/5" />
      </div>
    </AppShell>
  );
}
