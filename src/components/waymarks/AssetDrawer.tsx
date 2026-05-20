import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { format } from 'date-fns';
import { Tooltip } from '@/components/ui/Tooltip';
import {
  X,
  MapPin,
  Calendar,
  Wrench,
  Pencil,
  Plus,
  Trash2,
  ImageOff,
  Check,
  AlertTriangle,
  Flag,
  Save,
  Lock,
  LockOpen,
  Move,
  Eye,
  ShoppingCart,
  Download,
} from 'lucide-react';
import { Chip } from '@/components/ui/Chip';
import { MetricCard } from '@/components/ui/MetricCard';
import { Button } from '@/components/ui/Button';
import { useAsset, useUpdateAsset } from '@/hooks/useAssets';
import { useBuilding } from '@/hooks/useBuildings';
import { useFloor } from '@/hooks/useFloors';
import { useActivity } from '@/hooks/useActivity';
import {
  useAddAssetPhoto,
  useAssetPhotos,
  useDeleteAssetPhoto,
} from '@/hooks/useAssetPhotos';
import {
  assetPhotoDownloadName,
  signedAssetPhotoDownloadUrl,
  signedAssetPhotoUrl,
  validateAssetPhotoFile,
} from '@/lib/queries/asset-photos';
import { computeStatus, statusLabel, type AssetStatus } from '@/lib/asset-status';
import { formatPinNumber } from '@/lib/pin-types';
import { useAssetTypes } from '@/hooks/useAssetTypes';
import { AssetAttachmentsPanel } from './AssetAttachmentsPanel';
import { AuditVideosPanel } from './AuditVideosPanel';
import { AuditVideoRecorderDialog } from './AuditVideoRecorderDialog';
import { useCan } from '@/lib/permissions-context';
import { cn } from '@/lib/utils';
import type { Asset, AssetPhoto, AuditLogEntry } from '@/types/database';

export type AssetDrawerProps = {
  assetId: string | null;
  floorId: string;
  buildingId: string;
  onOpenChange: (open: boolean) => void;
  /**
   * "Reposition pin" — admin-only deliberate move flow (M5). When present,
   * a button surfaces in the drawer that closes the drawer and asks the
   * parent to enter reposition mode on the canvas.
   */
  onStartReposition?: (assetId: string) => void;
  /**
   * "Delete asset" — admin-only soft-delete (M5). Parent handles the
   * StepUpDialog confirmation flow.
   */
  onStartDelete?: (assetId: string) => void;
};

const STATUS_OPTIONS: Array<{ value: AssetStatus; label: string; icon: typeof Check }> = [
  { value: 'good', label: 'Good', icon: Check },
  { value: 'attention', label: 'Needs attention', icon: AlertTriangle },
  { value: 'flagged', label: 'Flagged', icon: Flag },
];

// Asset types come from useAssetTypes (M11). The static fallback lives in
// lib/pin-types.ts so colors and labels render even before the org_asset_types
// fetch resolves.

export function AssetDrawer({
  assetId,
  floorId,
  buildingId,
  onOpenChange,
  onStartReposition,
  onStartDelete,
}: AssetDrawerProps) {
  const open = !!assetId;
  const { data: asset, isLoading } = useAsset(assetId ?? undefined);
  const { data: activity = [] } = useActivity('assets', assetId ?? undefined);
  const canEdit = useCan('edit', { type: 'building', id: buildingId });
  const canReposition = useCan('reposition', { type: 'building', id: buildingId });
  const canDelete = useCan('delete', { type: 'building', id: buildingId });
  const { data: building } = useBuilding(buildingId);
  const { data: floor } = useFloor(floorId);
  const update = useUpdateAsset(floorId);
  const [editing, setEditing] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);

  // Reset edit mode whenever the selected asset changes.
  useEffect(() => {
    setEditing(false);
    setRecordOpen(false);
  }, [assetId]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 flex h-[88vh] flex-col rounded-t-2xl border-t border-black/10 bg-surface text-waymarks-ink shadow-sheet outline-none dark:border-white/10 sm:inset-x-auto sm:right-0 sm:top-0 sm:h-full sm:w-[min(96vw,440px)] sm:rounded-t-none sm:border-l sm:border-t-0"
        >
          <header className="flex items-start justify-between gap-3 border-b border-black/10 p-4 dark:border-white/10">
            <Dialog.Title asChild>
              <div className="min-w-0">
                <p className="truncate font-semibold text-xl">{asset?.name ?? 'Asset'}</p>
                {asset && (
                  <p className="mt-0.5 truncate text-xs text-text-muted">
                    {prettyType(asset.type)} · {asset.category}
                  </p>
                )}
              </div>
            </Dialog.Title>
            <div className="flex items-center gap-1">
              {asset && canEdit && !editing && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-black/10 px-2 text-xs hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
                >
                  <Pencil size={12} aria-hidden />
                  <span>Edit</span>
                </button>
              )}
              <Dialog.Close asChild>
                <button
                  aria-label="Close"
                  className="rounded-md p-1 text-text-muted hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <X size={16} aria-hidden />
                </button>
              </Dialog.Close>
            </div>
          </header>

          <div className="flex-1 space-y-5 overflow-y-auto p-4">
            {isLoading || !asset ? (
              <Skeleton />
            ) : editing ? (
              <EditPanel
                asset={asset}
                saving={update.isPending}
                onCancel={() => setEditing(false)}
                onSave={async (patch) => {
                  await update.mutateAsync({ id: asset.id, patch });
                  setEditing(false);
                }}
              />
            ) : (
              <>
                <PhotoGallery
                  assetId={asset.id}
                  assetName={asset.name ?? 'Asset'}
                  canEdit={canEdit}
                />
                {canEdit && (
                  <>
                    <LockBar
                      asset={asset}
                      busy={update.isPending}
                      onToggleLock={() =>
                        update.mutate({
                          id: asset.id,
                          patch: { is_locked: !asset.is_locked },
                        })
                      }
                    />
                    <QuickActions
                      asset={asset}
                      busy={update.isPending}
                      onChangeStatus={(status) =>
                        update.mutate({ id: asset.id, patch: { status } })
                      }
                    />
                    <AdminActions
                      canReposition={canReposition && !!onStartReposition}
                      canDelete={canDelete && !!onStartDelete}
                      onReposition={() => onStartReposition?.(asset.id)}
                      onDelete={() => onStartDelete?.(asset.id)}
                    />
                  </>
                )}
                <VisualizeRow
                  buildingName={building?.name ?? 'Building'}
                  floorLabel={floor?.label ?? ''}
                  pinValue={asset.room_number?.trim() || asset.name}
                />
                <OrderSignsRow />
                <DetailsSection asset={asset} />
                <StatusRow asset={asset} flagCount={asset.status === 'flagged' ? 1 : 0} />
                <AssetAttachmentsPanel assetId={asset.id} canEdit={canEdit} />
                <AuditVideosPanel
                  buildingId={buildingId}
                  assetId={asset.id}
                  onRecordClick={canEdit ? () => setRecordOpen(true) : undefined}
                />
                <AttributesSection asset={asset} />
                <ActivitySection items={activity} />
                <PermissionsFooter />
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
      {asset && (
        <AuditVideoRecorderDialog
          open={recordOpen}
          onOpenChange={setRecordOpen}
          buildingId={buildingId}
          assetId={asset.id}
          scopeLabel={asset.name?.trim() || 'this asset'}
        />
      )}
    </Dialog.Root>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="h-40 animate-pulse rounded-md bg-black/5 dark:bg-white/5" />
      <div className="h-4 w-2/3 animate-pulse rounded-md bg-black/5 dark:bg-white/5" />
      <div className="h-4 w-1/2 animate-pulse rounded-md bg-black/5 dark:bg-white/5" />
    </div>
  );
}


function LockBar({
  asset,
  busy,
  onToggleLock,
}: {
  asset: Asset;
  busy: boolean;
  onToggleLock: () => void;
}) {
  const locked = asset.is_locked;
  return (
    <div
      className={
        'flex items-center gap-2 rounded-md border px-3 py-2 text-xs ' +
        (locked
          ? 'border-black/10 bg-surface-soft text-text-muted dark:border-white/10'
          : 'border-waymarks-gold bg-waymarks-gold-soft text-waymarks-ink dark:bg-white/5 dark:text-white')
      }
    >
      {locked ? (
        <Lock size={14} aria-hidden />
      ) : (
        <LockOpen size={14} aria-hidden className="text-waymarks-gold" />
      )}
      <span className="flex-1">
        {locked
          ? 'Pin is locked. Unlock to nudge it.'
          : 'Pin is unlocked — drag it on the plan to nudge.'}
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={onToggleLock}
        className={
          'inline-flex h-7 items-center rounded-md border px-2 text-[11px] font-medium transition-colors disabled:opacity-50 ' +
          (locked
            ? 'border-black/10 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5'
            : 'border-waymarks-gold bg-waymarks-gold text-waymarks-ink hover:bg-waymarks-gold-deep')
        }
      >
        {locked ? 'Unlock' : 'Lock pin'}
      </button>
    </div>
  );
}

function QuickActions({
  asset,
  busy,
  onChangeStatus,
}: {
  asset: Asset;
  busy: boolean;
  onChangeStatus: (status: AssetStatus) => void;
}) {
  const current = asset.status as AssetStatus;
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
        Quick actions
      </p>
      <div className="flex flex-wrap gap-1.5">
        {STATUS_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = current === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={busy || active}
              onClick={() => onChangeStatus(opt.value)}
              aria-pressed={active}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
                'disabled:cursor-not-allowed',
                active
                  ? variantClasses(opt.value, 'active')
                  : variantClasses(opt.value, 'idle')
              )}
            >
              <Icon size={12} aria-hidden />
              <span>{opt.label}</span>
              {active && <span className="ml-0.5 text-[10px] uppercase tracking-wide">· current</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function VisualizeRow({
  buildingName,
  floorLabel,
  pinValue,
}: {
  buildingName: string;
  floorLabel: string;
  pinValue: string;
}) {
  const url =
    `https://viewmark-embed.netlify.app/?building=${encodeURIComponent(buildingName)}` +
    `&floor=${encodeURIComponent(floorLabel)}` +
    `&pin=${encodeURIComponent(pinValue)}`;
  // floorLabel arrives async via useFloor — hold the button until it
  // resolves so we never launch the embed with an empty ?floor= param.
  const ready = !!floorLabel;
  const btnClass =
    'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-waymarks-gold px-3 text-xs font-medium text-waymarks-ink hover:bg-waymarks-gold-deep';
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-waymarks-gold/30 bg-waymarks-gold-soft px-3 py-2 text-xs dark:bg-white/5">
      <div className="min-w-0">
        <p className="font-semibold text-waymarks-ink dark:text-white">Visualize a sign here</p>
        <p className="text-text-muted">Open ViewMark to mock up signage on this wall using a wall photo.</p>
      </div>
      {ready ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={btnClass}
        >
          <Eye size={12} aria-hidden />
          Visualize
        </a>
      ) : (
        <button type="button" disabled className={cn(btnClass, 'cursor-not-allowed opacity-50')}>
          <Eye size={12} aria-hidden />
          Visualize
        </button>
      )}
    </div>
  );
}

function OrderSignsRow() {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-waymarks-gold/30 bg-waymarks-gold-soft px-3 py-2 text-xs dark:bg-white/5">
      <div className="min-w-0">
        <p className="font-semibold text-waymarks-ink dark:text-white">Order signs</p>
        <p className="text-text-muted">Order new or replacement signage from Officemark.</p>
      </div>
      <a
        href="https://account.officemark.ca/authentication/login"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-waymarks-gold px-3 text-xs font-medium text-white hover:bg-waymarks-gold-deep"
      >
        <ShoppingCart size={12} aria-hidden />
        Order Signs
      </a>
    </div>
  );
}

function AdminActions({
  canReposition,
  canDelete,
  onReposition,
  onDelete,
}: {
  canReposition: boolean;
  canDelete: boolean;
  onReposition: () => void;
  onDelete: () => void;
}) {
  if (!canReposition && !canDelete) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {canReposition && (
        <Tooltip text="Drag the pin to a new location on the floor plan">
          <button
            type="button"
            onClick={onReposition}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-black/10 bg-surface px-3 text-xs font-medium text-waymarks-ink hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
          >
            <Move size={12} aria-hidden />
            <span>Reposition pin</span>
          </button>
        </Tooltip>
      )}
      {canDelete && (
        <Tooltip text="Soft-delete this asset (recoverable)">
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-danger/30 bg-surface px-3 text-xs font-medium text-danger hover:bg-danger-bg dark:border-danger/40"
          >
            <Trash2 size={12} aria-hidden />
            <span>Delete asset</span>
          </button>
        </Tooltip>
      )}
    </div>
  );
}

function variantClasses(status: AssetStatus, state: 'active' | 'idle'): string {
  if (state === 'active') {
    if (status === 'good') return 'border-success/30 bg-success-bg text-success';
    if (status === 'attention') return 'border-warning/30 bg-warning-bg text-warning';
    return 'border-danger/30 bg-danger-bg text-danger';
  }
  return 'border-black/15 bg-surface text-waymarks-ink-muted hover:border-black/25 hover:text-text dark:border-white/15';
}

function EditPanel({
  asset,
  saving,
  onCancel,
  onSave,
}: {
  asset: Asset;
  saving: boolean;
  onCancel: () => void;
  onSave: (patch: {
    name: string;
    type: string;
    location_notes: string | null;
    manufacturer: string | null;
    installed_at: string | null;
    audit_cycle_days: number | null;
    status: AssetStatus;
  }) => Promise<void>;
}) {
  const { signage: signageTypes, facility: facilityTypes } = useAssetTypes();
  const [name, setName] = useState(asset.name);
  const [type, setType] = useState(asset.type);
  const [notes, setNotes] = useState(asset.location_notes ?? '');
  const [manufacturer, setManufacturer] = useState(asset.manufacturer ?? '');
  const [installed, setInstalled] = useState(asset.installed_at ?? '');
  const [cycle, setCycle] = useState<string>(
    asset.audit_cycle_days != null ? String(asset.audit_cycle_days) : ''
  );
  const [status, setStatus] = useState<AssetStatus>(asset.status as AssetStatus);
  const [error, setError] = useState<string | null>(null);

  const dirty = useMemo(() => {
    return (
      name !== asset.name ||
      type !== asset.type ||
      (notes || '') !== (asset.location_notes || '') ||
      (manufacturer || '') !== (asset.manufacturer || '') ||
      (installed || '') !== (asset.installed_at || '') ||
      (cycle || '') !== (asset.audit_cycle_days != null ? String(asset.audit_cycle_days) : '') ||
      status !== asset.status
    );
  }, [name, type, notes, manufacturer, installed, cycle, status, asset]);

  async function submit() {
    setError(null);
    if (name.trim().length === 0) {
      setError('Name is required.');
      return;
    }
    if (name.trim().length > 80) {
      setError('Name must be 80 characters or fewer.');
      return;
    }
    let cycleNum: number | null = null;
    if (cycle !== '') {
      const n = Number(cycle);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        setError('Audit cycle must be a positive whole number of days.');
        return;
      }
      cycleNum = n;
    }
    try {
      await onSave({
        name: name.trim(),
        type,
        location_notes: notes.trim() === '' ? null : notes.trim(),
        manufacturer: manufacturer.trim() === '' ? null : manufacturer.trim(),
        installed_at: installed === '' ? null : installed,
        audit_cycle_days: cycleNum,
        status,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="space-y-4"
    >
      {error && (
        <div className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <FieldLabel label="Status">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = status === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatus(opt.value)}
                aria-pressed={active}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
                  active
                    ? variantClasses(opt.value, 'active')
                    : variantClasses(opt.value, 'idle')
                )}
              >
                <Icon size={12} aria-hidden />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </FieldLabel>

      <FieldLabel label="Name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-10 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-waymarks-ink outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
        />
      </FieldLabel>

      <FieldLabel label="Type">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="h-10 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-waymarks-ink outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
        >
          <optgroup label="Signage">
            {signageTypes.map((t) => (
              <option key={t.id} value={t.key}>
                {t.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Facility">
            {facilityTypes.map((t) => (
              <option key={t.id} value={t.key}>
                {t.label}
              </option>
            ))}
          </optgroup>
        </select>
      </FieldLabel>

      {/* M32 Step 3: this field maps to `location_notes` (the state variable
          is misleadingly named `notes` — pre-existing). Renaming the label
          to match the NewAssetDialog ("Where on the floor") so users see the
          same wording everywhere. DB column unchanged. The dedicated
          `notes` and `room_number` columns aren't editable here yet — flagged
          as a follow-up for the drawer's edit view. */}
      <FieldLabel label="Where on the floor">
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder='e.g. "East elevator lobby, mounted at 5′"'
          className="w-full rounded-md border border-black/10 bg-surface p-3 text-sm text-waymarks-ink outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
        />
      </FieldLabel>

      <FieldLabel label="Manufacturer">
        <input
          value={manufacturer}
          onChange={(e) => setManufacturer(e.target.value)}
          placeholder="e.g. Officemark"
          className="h-10 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-waymarks-ink outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
        />
      </FieldLabel>

      <div className="grid grid-cols-2 gap-2">
        <FieldLabel label="Installed">
          <input
            type="date"
            value={installed ?? ''}
            onChange={(e) => setInstalled(e.target.value)}
            className="h-10 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-waymarks-ink outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
          />
        </FieldLabel>

        <FieldLabel label="Audit cycle (days)">
          <input
            type="number"
            min={0}
            step={1}
            value={cycle}
            onChange={(e) => setCycle(e.target.value)}
            placeholder="default 90"
            className="h-10 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-waymarks-ink outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
          />
        </FieldLabel>
      </div>

      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-black/10 bg-surface px-4 py-3 dark:border-white/10">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="gold"
          loading={saving}
          disabled={!dirty || saving}
          iconLeft={<Save size={14} aria-hidden />}
        >
          Save
        </Button>
      </div>
    </form>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium uppercase tracking-[0.18em] text-text-faint">
        {label}
      </span>
      {children}
    </label>
  );
}

function PhotoGallery({
  assetId,
  assetName,
  canEdit,
}: {
  assetId: string;
  assetName: string;
  canEdit: boolean;
}) {
  const { data: photos = [], isLoading } = useAssetPhotos(assetId);
  const [active, setActive] = useState(0);
  const add = useAddAssetPhoto(assetId);
  const del = useDeleteAssetPhoto(assetId);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const safeActive = Math.min(active, Math.max(0, photos.length - 1));
  const current: AssetPhoto | undefined = photos[safeActive];

  async function onPickFiles(list: FileList | null) {
    if (!list) return;
    setErrorMsg(null);
    for (const file of Array.from(list)) {
      const v = validateAssetPhotoFile(file);
      if (v) {
        setErrorMsg(v);
        continue;
      }
      try {
        await add.mutateAsync(file);
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : 'Upload failed.');
      }
    }
  }

  async function onDelete(p: AssetPhoto) {
    setErrorMsg(null);
    try {
      await del.mutateAsync(p);
      setActive(0);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Delete failed.');
    }
  }

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border border-black/10 bg-waymarks-gold-soft dark:border-white/10 dark:bg-white/5">
        {isLoading ? (
          <div className="flex h-40 animate-pulse items-center justify-center text-text-faint">
            Loading photos…
          </div>
        ) : current ? (
          <PhotoFrame
            photo={current}
            assetName={assetName}
            index={safeActive}
            canDelete={canEdit}
            onDelete={() => onDelete(current)}
          />
        ) : (
          <div className="flex h-32 flex-col items-center justify-center gap-1 text-text-faint">
            <ImageOff size={20} aria-hidden />
            <span className="text-xs">No photos yet</span>
          </div>
        )}
      </div>

      {photos.length > 1 && (
        <div className="flex gap-1 overflow-x-auto">
          {photos.map((p, i) => (
            <ThumbButton
              key={p.id}
              photo={p}
              active={i === safeActive}
              onSelect={() => setActive(i)}
            />
          ))}
        </div>
      )}

      {canEdit && (
        <div className="flex gap-1">
          <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-black/10 px-2 text-xs hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
            <Plus size={12} aria-hidden />
            <span>{add.isPending ? 'Uploading…' : 'Add photo'}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                void onPickFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
          <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-black/10 px-2 text-xs hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
            <Pencil size={12} aria-hidden />
            <span>Choose files</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="sr-only"
              onChange={(e) => {
                void onPickFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      )}
      {errorMsg && <p className="text-xs text-danger">{errorMsg}</p>}
    </div>
  );
}

function PhotoFrame({
  photo,
  assetName,
  index,
  canDelete,
  onDelete,
}: {
  photo: AssetPhoto;
  assetName: string;
  index: number;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [errored, setErrored] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setErrored(false);
    void signedAssetPhotoUrl(photo.path)
      .then((u) => !cancelled && setUrl(u))
      .catch(() => !cancelled && setErrored(true));
    return () => {
      cancelled = true;
    };
  }, [photo.path]);

  async function handleDownload() {
    setDownloading(true);
    try {
      const dlUrl = await signedAssetPhotoDownloadUrl(
        photo.path,
        assetPhotoDownloadName(assetName, index, photo.path)
      );
      // The signed URL carries Content-Disposition: attachment, so a plain
      // anchor click saves the file — works cross-origin to Supabase Storage.
      const a = document.createElement('a');
      a.href = dlUrl;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      // Fall back to opening the inline photo in a new tab.
      if (url) window.open(url, '_blank', 'noopener');
    } finally {
      setDownloading(false);
    }
  }

  if (errored) {
    return (
      <div className="flex h-40 items-center justify-center text-xs text-danger">
        Could not load photo
      </div>
    );
  }
  if (!url) {
    return (
      <div className="flex h-40 animate-pulse items-center justify-center text-text-faint">
        Loading…
      </div>
    );
  }
  return (
    <div className="relative">
      <img src={url} alt="" className="block w-full object-cover" />
      {/* Download is available to anyone who can view the asset. */}
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        aria-label="Download this photo"
        className="absolute left-2 top-2 inline-flex h-7 items-center gap-1 rounded-md bg-waymarks-ink/80 px-2 text-[11px] font-medium text-white hover:bg-waymarks-ink disabled:opacity-60"
      >
        <Download size={12} aria-hidden />
        {downloading ? 'Saving…' : 'Save'}
      </button>
      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete this photo"
          className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-waymarks-ink/80 text-white hover:bg-danger"
        >
          <Trash2 size={12} aria-hidden />
        </button>
      )}
    </div>
  );
}

function ThumbButton({
  photo,
  active,
  onSelect,
}: {
  photo: AssetPhoto;
  active: boolean;
  onSelect: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void signedAssetPhotoUrl(photo.path)
      .then((u) => !cancelled && setUrl(u))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [photo.path]);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      aria-label={active ? 'Selected photo' : 'View this photo'}
      className={
        'h-12 w-12 shrink-0 overflow-hidden rounded-md border-2 ' +
        (active ? 'border-waymarks-gold' : 'border-transparent hover:border-black/15')
      }
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full animate-pulse bg-black/5 dark:bg-white/5" />
      )}
    </button>
  );
}

function DetailsSection({ asset }: { asset: Asset }) {
  const pinLabel = formatPinNumber(asset.pin_number);
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-1">
        {pinLabel && (
          <span
            className="inline-flex items-center rounded-md bg-waymarks-ink px-2 py-0.5 font-mono text-xs font-semibold text-white"
            title="Pin ID — this asset's reference number on the floor"
          >
            #{pinLabel}
          </span>
        )}
        <Chip variant="gold">{prettyType(asset.type)}</Chip>
        <Chip variant="default">{asset.category}</Chip>
        {asset.room_number && (
          <Chip variant="default" title="Room number">Rm {asset.room_number}</Chip>
        )}
      </div>
      {asset.location_notes && (
        <p className="flex items-start gap-1.5 text-sm text-text-muted">
          <MapPin size={12} aria-hidden className="mt-1 shrink-0" />
          <span>{asset.location_notes}</span>
        </p>
      )}
      {asset.notes && (
        <div className="rounded-md border border-black/10 bg-bg p-2.5 text-xs text-text-muted dark:border-white/10">
          <p className="mb-1 font-medium uppercase tracking-[0.14em] text-[10px] text-text-faint">Install & service notes</p>
          <p className="whitespace-pre-wrap text-sm text-text">{asset.notes}</p>
        </div>
      )}
      <VendorPanel asset={asset} />
    </div>
  );
}

/**
 * Vendor info — collapsed by default, expandable. Per Randy's directive
 * (M17b), vendor data is added during audit or from desk later, not
 * during placement. So this lives in the drawer rather than the
 * NewAssetDialog. Click "Add vendor info" or the edit pencil to open
 * the inline form.
 */
function VendorPanel({ asset }: { asset: Asset }) {
  const update = useUpdateAsset(asset.floor_id);
  const vendor = (asset.vendor_contact ?? null) as
    | { name?: string; email?: string; phone?: string; company?: string }
    | null;
  const hasVendor = !!(vendor && (vendor.name || vendor.email || vendor.phone || vendor.company));

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(vendor?.name ?? '');
  const [draftEmail, setDraftEmail] = useState(vendor?.email ?? '');
  const [draftPhone, setDraftPhone] = useState(vendor?.phone ?? '');
  const [draftCompany, setDraftCompany] = useState(vendor?.company ?? '');

  function startEdit() {
    setDraftName(vendor?.name ?? '');
    setDraftEmail(vendor?.email ?? '');
    setDraftPhone(vendor?.phone ?? '');
    setDraftCompany(vendor?.company ?? '');
    setEditing(true);
  }

  async function save() {
    const next =
      draftName.trim() || draftEmail.trim() || draftPhone.trim() || draftCompany.trim()
        ? {
            name: draftName.trim() || undefined,
            email: draftEmail.trim() || undefined,
            phone: draftPhone.trim() || undefined,
            company: draftCompany.trim() || undefined,
          }
        : null;
    await update.mutateAsync({ id: asset.id, patch: { vendor_contact: next } });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="space-y-2 rounded-md border border-waymarks-gold/40 bg-waymarks-gold-soft p-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-waymarks-gold">Vendor info</p>
        <input
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder="Vendor name (e.g. Acme Sign Co.)"
          maxLength={120}
          className="h-9 w-full rounded-md border border-black/10 bg-surface px-3 text-sm outline-none focus:border-waymarks-gold focus:ring-1 focus:ring-waymarks-gold"
        />
        <input
          value={draftCompany}
          onChange={(e) => setDraftCompany(e.target.value)}
          placeholder="Company (if different)"
          maxLength={120}
          className="h-9 w-full rounded-md border border-black/10 bg-surface px-3 text-sm outline-none focus:border-waymarks-gold focus:ring-1 focus:ring-waymarks-gold"
        />
        <input
          type="email"
          value={draftEmail}
          onChange={(e) => setDraftEmail(e.target.value)}
          placeholder="Email"
          maxLength={120}
          className="h-9 w-full rounded-md border border-black/10 bg-surface px-3 text-sm outline-none focus:border-waymarks-gold focus:ring-1 focus:ring-waymarks-gold"
        />
        <input
          type="tel"
          value={draftPhone}
          onChange={(e) => setDraftPhone(e.target.value)}
          placeholder="Phone"
          maxLength={60}
          className="h-9 w-full rounded-md border border-black/10 bg-surface px-3 text-sm outline-none focus:border-waymarks-gold focus:ring-1 focus:ring-waymarks-gold"
        />
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={update.isPending}
            className="inline-flex h-8 items-center rounded-md border border-black/15 bg-surface px-3 text-xs font-medium hover:bg-black/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={update.isPending}
            className="inline-flex h-8 items-center rounded-md bg-waymarks-gold px-3 text-xs font-medium text-waymarks-ink hover:bg-waymarks-gold-deep disabled:opacity-60"
          >
            {update.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    );
  }

  if (!hasVendor) {
    return (
      <button
        type="button"
        onClick={startEdit}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-dashed border-black/15 bg-bg px-3 text-xs font-medium text-text-muted transition-colors hover:border-waymarks-gold hover:text-waymarks-gold dark:border-white/15"
      >
        <Plus size={12} aria-hidden />
        Add vendor info
      </button>
    );
  }

  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-black/10 bg-bg p-2.5 dark:border-white/10">
      <div className="min-w-0 flex-1">
        <p className="mb-1 font-medium uppercase tracking-[0.14em] text-[10px] text-text-faint">Vendor</p>
        {vendor!.name && <p className="text-sm font-medium text-text">{vendor!.name}</p>}
        {vendor!.company && vendor!.company !== vendor!.name && (
          <p className="text-xs text-text-muted">{vendor!.company}</p>
        )}
        {vendor!.email && (
          <a href={`mailto:${vendor!.email}`} className="block text-sm text-waymarks-gold hover:underline">{vendor!.email}</a>
        )}
        {vendor!.phone && (
          <a href={`tel:${vendor!.phone}`} className="block text-sm text-text-muted hover:text-text">{vendor!.phone}</a>
        )}
      </div>
      <button
        type="button"
        onClick={startEdit}
        aria-label="Edit vendor info"
        className="shrink-0 rounded p-1 text-text-muted hover:bg-black/5 hover:text-text"
      >
        <Pencil size={12} aria-hidden />
      </button>
    </div>
  );
}

function StatusRow({ asset, flagCount }: { asset: Asset; flagCount: number }) {
  const status: AssetStatus = computeStatus({
    asset,
    lastAuditAt: null,
    openFlagCount: flagCount,
  });

  return (
    <div className="grid grid-cols-3 gap-2">
      <MetricCard label="Last audit" value="—" />
      <MetricCard
        label="Status"
        value={statusLabel(status)}
        status={
          status === 'good' ? 'success' : status === 'attention' ? 'warning' : 'danger'
        }
      />
      <MetricCard
        label="Flags"
        value={flagCount}
        status={flagCount > 0 ? 'danger' : 'neutral'}
      />
    </div>
  );
}

function AttributesSection({ asset }: { asset: Asset }) {
  return (
    <dl className="grid grid-cols-3 gap-x-2 gap-y-2 text-sm">
      <Attr term="Manufacturer" value={asset.manufacturer ?? '—'} icon={<Wrench size={12} />} />
      <Attr
        term="Installed"
        value={asset.installed_at ? format(new Date(asset.installed_at), 'PP') : '—'}
        icon={<Calendar size={12} />}
      />
      <Attr term="Cycle" value={asset.audit_cycle_days ? `${asset.audit_cycle_days} d` : 'default'} />
    </dl>
  );
}

function Attr({ term, value, icon }: { term: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-black/10 bg-surface p-2 dark:border-white/10">
      <dt className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.16em] text-text-faint">
        {icon}
        {term}
      </dt>
      <dd className="mt-0.5 truncate text-sm">{value}</dd>
    </div>
  );
}

function ActivitySection({ items }: { items: AuditLogEntry[] }) {
  if (items.length === 0) {
    return (
      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-text-faint">
          Activity
        </h3>
        <p className="rounded-md border border-black/10 bg-surface p-3 text-xs text-text-muted dark:border-white/10">
          No activity yet. Edits, audits, and flags will show up here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-text-faint">
        Activity
      </h3>
      <ol className="space-y-2">
        {items.map((entry) => (
          <li
            key={entry.id}
            className="rounded-md border border-black/10 bg-surface p-2 text-xs dark:border-white/10"
          >
            <p className="font-medium capitalize">{prettyAction(entry.action)}</p>
            <p className="text-text-faint">{format(new Date(entry.created_at), 'PPp')}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PermissionsFooter() {
  return (
    <p className="border-t border-black/10 pt-3 text-[11px] text-text-faint dark:border-white/10">
      Reposition is admin-only. Facilities can flag.
    </p>
  );
}

function prettyType(type: string): string {
  return type
    .split('_')
    .map((part, i) => (i === 0 ? part[0]?.toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function prettyAction(action: string): string {
  if (action === 'pin.move') return 'Pin moved';
  if (action.startsWith('insert.')) return 'Created';
  if (action.startsWith('update.')) return 'Updated';
  if (action.startsWith('delete.')) return 'Deleted';
  return action;
}
