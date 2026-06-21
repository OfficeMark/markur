import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Layers, RotateCcw, ShieldAlert, Trash2 } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { AppShell } from '@/components/waymarks/AppShell';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { StepUpDialog } from '@/components/waymarks/StepUpDialog';
import { useBuilding, useSoftDeleteBuilding } from '@/hooks/useBuildings';
import {
  useDeletedFloors,
  useFloors,
  useRestoreFloor,
  useSoftDeleteFloor,
} from '@/hooks/useFloors';
import { useDeletedAssets, useRestoreAsset } from '@/hooks/useAssets';
import { useCan, useIsSuperAdmin } from '@/lib/permissions-context';
import { usePermissions } from '@/lib/permissions-context';
import type { DeletedAsset } from '@/lib/queries/assets';
import type { Floor } from '@/types/database';

const RETENTION_DAYS = 30;
const RESTORE_BANNER_MS = 4000;

/**
 * Building Trash — the single home for destructive actions (Slice 3). Lists the
 * building's active floors with a delete action, soft-deleted floors + assets
 * with restore, and a name-typed "delete building" action. The Building and
 * Floor pages stay clean of delete controls. Super-admin only.
 *
 * Per-table: floors via useFloors/useDeletedFloors, assets via useDeletedAssets,
 * building via useBuilding — no bundle/app_boot hooks.
 */
export function Trash() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { loading: permsLoading } = usePermissions();
  const isSuperAdmin = useIsSuperAdmin();
  const canDeleteBuilding = useCan('delete', { type: 'building', id: id ?? '' });

  const { data: building } = useBuilding(id);
  const { data: floors = [], isLoading: floorsLoading } = useFloors(id);
  const { data: deletedFloors = [], isLoading: deletedFloorsLoading } = useDeletedFloors(id);
  const { data: deletedAssets = [], isLoading: assetsLoading } = useDeletedAssets(id, RETENTION_DAYS);

  const softDeleteFloor = useSoftDeleteFloor(id);
  const restoreFloor = useRestoreFloor(id);
  const restoreAsset = useRestoreAsset(id);
  const softDeleteBuilding = useSoftDeleteBuilding();

  // Inline confirmation banner — shown briefly after a successful restore so
  // the user doesn't wonder whether it landed (without it, the row just
  // disappears, which feels like the screen swallowed the action).
  const [restoredName, setRestoredName] = useState<string | null>(null);

  // Floor-delete confirm (type DELETE). Building-delete confirm (type the name).
  const [floorToDelete, setFloorToDelete] = useState<Floor | null>(null);
  const [floorDeleteError, setFloorDeleteError] = useState<string | null>(null);
  const [buildingDeleteOpen, setBuildingDeleteOpen] = useState(false);
  const [buildingDeleteError, setBuildingDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!restoredName) return;
    const t = window.setTimeout(() => setRestoredName(null), RESTORE_BANNER_MS);
    return () => window.clearTimeout(t);
  }, [restoredName]);

  function handleRestoreAsset(asset: DeletedAsset) {
    restoreAsset.mutate(asset.id, { onSuccess: () => setRestoredName(asset.name) });
  }
  function handleRestoreFloor(floor: Floor) {
    restoreFloor.mutate(floor.id, { onSuccess: () => setRestoredName(`Floor ${floor.label}`) });
  }

  // Wait for permissions before deciding on the redirect.
  if (permsLoading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
          <div className="h-8 w-40 animate-pulse rounded-md bg-black/5 dark:bg-white/5" />
        </div>
      </AppShell>
    );
  }

  if (!isSuperAdmin) {
    // Non-supers should never have landed here; bounce them back to the
    // building view rather than show a 403.
    return <Navigate to={id ? `/buildings/${id}` : '/'} replace />;
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        <Link
          to={id ? `/buildings/${id}` : '/'}
          className="mb-4 inline-flex items-center gap-1 text-xs text-text-muted hover:text-text"
        >
          <ArrowLeft size={12} aria-hidden /> {building?.name ?? 'Building'}
        </Link>
        <header className="mb-6">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-text-faint">
            Trash · super admin
          </p>
          <h1 className="font-semibold text-3xl text-text sm:text-4xl">Trash</h1>
          <p className="mt-1 text-xs text-text-faint">
            Delete floors and this building here, and restore anything removed in the last{' '}
            {RETENTION_DAYS} days. Deletion is soft — restorable until it's purged.
          </p>
        </header>

        {restoredName && (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 flex items-start gap-2 rounded-md border border-success/40 bg-success-bg p-3 text-sm text-success"
          >
            <Check size={14} aria-hidden className="mt-0.5" />
            <p>
              Restored <span className="font-medium">{restoredName}</span> — back with its photos
              and history.
            </p>
          </div>
        )}

        <div className="mb-8 flex items-start gap-2 rounded-md border border-black/10 bg-surface p-3 text-xs text-text-muted dark:border-white/10">
          <ShieldAlert size={14} aria-hidden className="mt-0.5 text-waymarks-gold" />
          <p>
            Deleting a floor or the building hides it for everyone with access, along with its pins,
            photos, and history. Restore brings everything back exactly where it was. The activity
            timeline records both the delete and the restore.
          </p>
        </div>

        {/* ── Delete a floor ───────────────────────────────────────────── */}
        <Section title="Floors" subtitle="Delete a floor to move it to the trash below.">
          {floorsLoading ? (
            <ListSkeleton />
          ) : floors.length === 0 ? (
            <EmptyState
              icon={<Layers size={28} aria-hidden />}
              title="No active floors"
              description="This building has no floors to delete."
            />
          ) : (
            <ul className="space-y-2">
              {floors.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center gap-3 rounded-lg border border-black/10 bg-surface p-3 dark:border-white/10"
                >
                  <Layers size={16} aria-hidden className="shrink-0 text-text-muted" />
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-text">
                    Floor {f.label}
                  </p>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      setFloorDeleteError(null);
                      setFloorToDelete(f);
                    }}
                    iconLeft={<Trash2 size={12} aria-hidden />}
                  >
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* ── Deleted floors (restore) ─────────────────────────────────── */}
        <Section title="Recently deleted floors">
          {deletedFloorsLoading ? (
            <ListSkeleton />
          ) : deletedFloors.length === 0 ? (
            <EmptyState
              icon={<Trash2 size={28} aria-hidden />}
              title="No deleted floors"
              description="Floors you delete appear here, restorable for 30 days."
            />
          ) : (
            <ul className="space-y-2">
              {deletedFloors.map((f) => (
                <DeletedFloorRow
                  key={f.id}
                  floor={f}
                  busy={restoreFloor.isPending && restoreFloor.variables === f.id}
                  onRestore={() => handleRestoreFloor(f)}
                />
              ))}
            </ul>
          )}
        </Section>

        {/* ── Deleted assets (restore) ─────────────────────────────────── */}
        <Section title="Recently deleted pins">
          {assetsLoading ? (
            <ListSkeleton />
          ) : deletedAssets.length === 0 ? (
            <EmptyState
              icon={<Trash2 size={28} aria-hidden />}
              title="No deleted pins"
              description={`No pins in this building have been deleted in the last ${RETENTION_DAYS} days.`}
            />
          ) : (
            <ul className="space-y-2">
              {deletedAssets.map((a) => (
                <DeletedAssetRow
                  key={a.id}
                  asset={a}
                  busy={restoreAsset.isPending && restoreAsset.variables === a.id}
                  onRestore={() => handleRestoreAsset(a)}
                />
              ))}
            </ul>
          )}
        </Section>

        {/* ── Delete this building ─────────────────────────────────────── */}
        {canDeleteBuilding && building && (
          <section className="mt-10 rounded-lg border border-danger/30 bg-danger-bg/40 p-4">
            <h2 className="font-semibold text-base text-text">Delete this building</h2>
            <p className="mt-1 text-sm text-text-muted">
              Removes <span className="font-medium">{building.name}</span> and all its floors, pins,
              photos, and flags everywhere — lists, reports, and guest share links. Recoverable by a
              super admin.
            </p>
            <div className="mt-3">
              <Button
                variant="danger"
                onClick={() => {
                  setBuildingDeleteError(null);
                  setBuildingDeleteOpen(true);
                }}
                iconLeft={<Trash2 size={14} aria-hidden />}
              >
                Delete building
              </Button>
            </div>
          </section>
        )}
      </div>

      <StepUpDialog
        open={!!floorToDelete}
        onOpenChange={(o) => {
          if (!o && !softDeleteFloor.isPending) setFloorToDelete(null);
        }}
        title={floorToDelete ? `Delete Floor ${floorToDelete.label}?` : 'Delete floor'}
        description="This soft-deletes the floor and hides it for everyone with access, along with its pins and audit history. You can restore it from this page within 30 days."
        confirmWord="DELETE"
        confirmLabel="Delete floor"
        confirmVariant="danger"
        confirmIcon={<Trash2 size={14} aria-hidden />}
        busy={softDeleteFloor.isPending}
        errorMessage={floorDeleteError}
        onConfirm={async () => {
          if (!floorToDelete) return;
          setFloorDeleteError(null);
          try {
            await softDeleteFloor.mutateAsync(floorToDelete.id);
            setFloorToDelete(null);
          } catch (err) {
            setFloorDeleteError(
              err instanceof Error ? err.message : 'Could not delete the floor.'
            );
          }
        }}
      />

      {building && (
        <StepUpDialog
          open={buildingDeleteOpen}
          onOpenChange={(o) => {
            if (!softDeleteBuilding.isPending) setBuildingDeleteOpen(o);
          }}
          title={`Delete ${building.name}?`}
          description={
            `This soft-deletes the building and everything in it — ` +
            (floors.length === 0
              ? 'no floors yet'
              : floors.length === 1
                ? '1 floor'
                : `${floors.length} floors`) +
            ` and all their pins, photos, and flags. It vanishes everywhere — lists, reports, and guest share links. A super admin can restore it. Type the building's name to confirm.`
          }
          confirmWord={building.name}
          confirmLabel="Delete building"
          confirmVariant="danger"
          confirmIcon={<Trash2 size={14} aria-hidden />}
          busy={softDeleteBuilding.isPending}
          errorMessage={buildingDeleteError}
          onConfirm={async () => {
            setBuildingDeleteError(null);
            try {
              await softDeleteBuilding.mutateAsync(building.id);
              navigate('/');
            } catch (err) {
              setBuildingDeleteError(
                err instanceof Error ? err.message : 'Could not delete the building.'
              );
            }
          }}
        />
      )}
    </AppShell>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="mb-3">
        <h2 className="font-semibold text-base text-text">{title}</h2>
        {subtitle && <p className="text-xs text-text-faint">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function DeletedFloorRow({
  floor,
  busy,
  onRestore,
}: {
  floor: Floor;
  busy: boolean;
  onRestore: () => void;
}) {
  const deletedAt = floor.deleted_at ? new Date(floor.deleted_at) : null;
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-black/10 bg-surface p-3 sm:flex-row sm:items-center dark:border-white/10">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text">Floor {floor.label}</p>
        {deletedAt && (
          <p className="text-xs text-text-faint">
            deleted{' '}
            <time dateTime={deletedAt.toISOString()} title={format(deletedAt, 'PPpp')}>
              {formatDistanceToNow(deletedAt, { addSuffix: true })}
            </time>
          </p>
        )}
      </div>
      <Button
        size="sm"
        variant="secondary"
        onClick={onRestore}
        loading={busy}
        iconLeft={<RotateCcw size={12} aria-hidden />}
      >
        Restore
      </Button>
    </li>
  );
}

function DeletedAssetRow({
  asset,
  busy,
  onRestore,
}: {
  asset: DeletedAsset;
  busy: boolean;
  onRestore: () => void;
}) {
  const deletedAt = asset.deleted_at ? new Date(asset.deleted_at) : null;
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-black/10 bg-surface p-3 sm:flex-row sm:items-center dark:border-white/10">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text">{asset.name}</p>
        <p className="text-xs text-text-faint">
          {asset.floor_label ? `${asset.floor_label} · ` : ''}
          {prettyType(asset.type)}
          {deletedAt && (
            <>
              {' · deleted '}
              <time dateTime={deletedAt.toISOString()} title={format(deletedAt, 'PPpp')}>
                {formatDistanceToNow(deletedAt, { addSuffix: true })}
              </time>
            </>
          )}
        </p>
      </div>
      <Button
        size="sm"
        variant="secondary"
        onClick={onRestore}
        loading={busy}
        iconLeft={<RotateCcw size={12} aria-hidden />}
      >
        Restore
      </Button>
    </li>
  );
}

function ListSkeleton() {
  return (
    <ul className="space-y-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="h-14 animate-pulse rounded-lg border border-black/10 bg-surface dark:border-white/10"
        />
      ))}
    </ul>
  );
}

function prettyType(type: string): string {
  return type
    .split('_')
    .map((part, i) => (i === 0 ? part[0]?.toUpperCase() + part.slice(1) : part))
    .join(' ');
}
