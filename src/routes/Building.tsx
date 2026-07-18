import { Link, useNavigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import { ArrowLeft, MapPin, Layers, ImageOff, Trash2, Plus, FileDown, Share2, SlidersHorizontal, Pencil } from 'lucide-react';
import { AppShell } from '@/components/waymarks/AppShell';
import { Tooltip } from '@/components/ui/Tooltip';
import { AccessManagementCard } from '@/components/waymarks/AccessManagementCard';
import { BuildingPhotoUpload } from '@/components/waymarks/BuildingPhotoUpload';
import { EditBuildingNameDialog } from '@/components/waymarks/EditBuildingNameDialog';
import { NewFloorDialog } from '@/components/waymarks/NewFloorDialog';
import { ShareBuildingDialog } from '@/components/waymarks/ShareBuildingDialog';
import { StepUpDialog } from '@/components/waymarks/StepUpDialog';
import { ResumeAuditBanner } from '@/components/waymarks/ResumeAuditBanner';
import { SectionErrorBoundary } from '@/components/waymarks/SectionErrorBoundary';
import { useSoftDeleteBuilding } from '@/hooks/useBuildings';
import { useBuildingView } from '@/hooks/useBundles';
import { useCan, useIsSuperAdmin } from '@/lib/permissions-context';
import type { Floor } from '@/types/database';

export function Building() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // One bundled call replaces the old building-open cascade (building + floors +
  // tenants + access/audit fan-out). Fewer requests = faster on mobile and far
  // less failure surface than ~20 separate sub-requests.
  const { data: view, isLoading: bLoading, error: bError } = useBuildingView(id);
  const building = view?.building ?? null;
  const floors = view?.floors ?? [];
  const [newFloorOpen, setNewFloorOpen] = useState(false);
  const [editNameOpen, setEditNameOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const isSuperAdmin = useIsSuperAdmin();
  const canManageAccess = useCan('manage_access', { type: 'building', id: id ?? '' });
  const canConfigure = useCan('configure', { type: 'building', id: id ?? '' });
  const canEdit = useCan('edit', { type: 'building', id: id ?? '' });
  const canDeleteBuilding = useCan('delete', { type: 'building', id: id ?? '' });
  const softDeleteBuilding = useSoftDeleteBuilding();

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
          <div className="flex items-start gap-2">
            <h1 className="font-semibold text-4xl leading-tight text-text sm:text-5xl">{building.name}</h1>
            {canConfigure && (
              <Tooltip text="Rename this building">
                <button
                  type="button"
                  onClick={() => setEditNameOpen(true)}
                  aria-label={`Rename ${building.name}`}
                  className="mt-1.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-black/10 bg-surface text-text-muted hover:border-black/20 hover:text-text dark:border-white/10 dark:hover:border-white/20 sm:mt-2.5"
                >
                  <Pencil size={14} aria-hidden />
                </button>
              </Tooltip>
            )}
          </div>
          <p className="flex items-center gap-1.5 text-base text-text-muted">
            <MapPin size={15} aria-hidden />
            <span>
              {building.address}, {building.city}
              {building.region ? `, ${building.region}` : ''}
            </span>
          </p>
        </header>

        <SectionErrorBoundary>
          <ResumeAuditBanner buildingId={building.id} />
        </SectionErrorBoundary>

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
          {canManageAccess && (
            <Tooltip text="Create a view-only link to share this building with a client">
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-black/10 bg-surface px-3 text-xs font-medium text-text hover:border-black/20 dark:border-white/10 dark:hover:border-white/20"
              >
                <Share2 size={12} aria-hidden />
                <span>Share building</span>
              </button>
            </Tooltip>
          )}
          {canConfigure && (
            <Tooltip text="Pin appearance, the order/external link, and other building settings">
              <Link
                to={`/buildings/${building.id}/settings`}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-black/10 bg-surface px-3 text-xs font-medium text-text hover:border-black/20 dark:border-white/10 dark:hover:border-white/20"
              >
                <SlidersHorizontal size={12} aria-hidden />
                <span>Settings</span>
              </Link>
            </Tooltip>
          )}
          {isSuperAdmin && (
            <Link
              to={`/buildings/${building.id}/trash`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-black/10 bg-surface px-3 text-xs font-medium text-text-muted hover:border-black/20 hover:text-text dark:border-white/10 dark:hover:border-white/20"
            >
              <Trash2 size={12} aria-hidden />
              <span>Trash</span>
            </Link>
          )}
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
          {floors.length === 0 ? (
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
            <SectionErrorBoundary label="Access management">
              <AccessManagementCard
                buildingId={building.id}
                scopeRefs={{ floors: view?.floors ?? [], tenants: view?.tenants ?? [] }}
              />
            </SectionErrorBoundary>
          </section>
        )}

        {canDeleteBuilding && (
          <section className="mt-10 rounded-lg border border-danger/30 bg-danger-bg/40 p-5 dark:bg-white/5">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.22em] text-danger">
              Danger zone
            </p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-xl text-sm text-text-muted">
                Delete this building and everything in it — all floors, pins, photos, and flags. It
                disappears for everyone, including guest share links and reports. A super admin can
                restore it.
              </p>
              <button
                type="button"
                onClick={() => {
                  setDeleteError(null);
                  setDeleteOpen(true);
                }}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-danger/40 bg-surface px-3 text-xs font-medium text-danger hover:bg-danger-bg dark:bg-white/5"
              >
                <Trash2 size={12} aria-hidden />
                Delete building
              </button>
            </div>
          </section>
        )}
      </div>
      {building && canConfigure && (
        <EditBuildingNameDialog
          open={editNameOpen}
          onOpenChange={setEditNameOpen}
          buildingId={building.id}
          currentName={building.name}
        />
      )}
      {building && (
        <NewFloorDialog
          open={newFloorOpen}
          onOpenChange={setNewFloorOpen}
          buildingId={building.id}
          buildingName={building.name}
        />
      )}
      {building && canManageAccess && (
        <ShareBuildingDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          buildingId={building.id}
          buildingName={building.name}
        />
      )}
      {building && canDeleteBuilding && (
        <StepUpDialog
          open={deleteOpen}
          onOpenChange={(o) => {
            if (!softDeleteBuilding.isPending) setDeleteOpen(o);
          }}
          title={`Delete ${building.name}?`}
          description={
            `This soft-deletes the building and everything in it — ` +
            (floors.length === 0
              ? 'no floors yet'
              : floors.length === 1
                ? '1 floor'
                : `${floors.length} floors`) +
            ` and all their pins, photos, and flags. It vanishes everywhere — lists, the god view, reports, and guest share links. A super admin can restore it from Admin → Deleted buildings. Type the building's name to confirm.`
          }
          confirmWord={building.name}
          confirmLabel="Delete building"
          confirmVariant="danger"
          confirmIcon={<Trash2 size={14} aria-hidden />}
          busy={softDeleteBuilding.isPending}
          errorMessage={deleteError}
          onConfirm={async () => {
            setDeleteError(null);
            try {
              await softDeleteBuilding.mutateAsync(building.id);
              navigate('/');
            } catch (err) {
              setDeleteError(err instanceof Error ? err.message : 'Could not delete the building.');
            }
          }}
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
