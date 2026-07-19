import { useEffect, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { format } from 'date-fns';
import { Tooltip } from '@/components/ui/Tooltip';
import { Band } from '@/components/ui/Band';
import {
  X,
  Calendar,
  Pencil,
  Plus,
  Trash2,
  ImageOff,
  Check,
  AlertTriangle,
  ClipboardList,
  Flag,
  Lock,
  LockOpen,
  Move,
  Eye,
  Download,
  ExternalLink,
  Camera,
  Tag,
  MapPin,
  ClipboardCheck,
  Store,
  History,
  Maximize2,
  Wrench,
  ShoppingCart,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Chip } from '@/components/ui/Chip';
import { useAsset, useUpdateAsset } from '@/hooks/useAssets';
import { useBuilding } from '@/hooks/useBuildings';
import { useFloor } from '@/hooks/useFloors';
import { useActivity } from '@/hooks/useActivity';
import {
  useAddAssetPhoto,
  useAssetPhotos,
  useDeleteAssetPhoto, useSignedAssetPhotoUrl } from '@/hooks/useAssetPhotos';
import {
  assetPhotoDownloadName,
  signedAssetPhotoDownloadUrl,
  validateAssetPhotoFile,
  PHOTO_ACCEPT,
} from '@/lib/queries/asset-photos';
import { prepareForUpload } from '@/lib/image-convert';
import { computeStatus, statusLabel, type AssetStatus } from '@/lib/asset-status';
import { formatPinNumber } from '@/lib/pin-types';
import { useContacts } from '@/hooks/useContacts';
import { NewAssetDialog } from './NewAssetDialog';
import { useAssetVendors, useAddAssetVendor, useRemoveAssetVendor } from '@/hooks/useAssetVendors';
import { useVendors, useCreateVendor } from '@/hooks/useVendors';
import { AssetAttachmentsPanel } from './AssetAttachmentsPanel';
import { PhotoLightbox } from './PhotoLightbox';
import { AuditVideosPanel } from './AuditVideosPanel';
import { AuditVideoRecorderDialog } from './AuditVideoRecorderDialog';
import { ExpensesPanel } from './ExpensesPanel';
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
  /**
   * "Log a flag in Audit Mode" — closes the drawer and switches into Audit
   * Mode with this pin pre-selected, so the auditor can flag it via the
   * capture form. Only wired when the user can run an audit on this floor.
   */
  onLogFlag?: (assetId: string) => void;
  /**
   * "Start audit here" — begins (or resumes) Audit Mode with this pin as the
   * first stop; the walkthrough then proceeds in pin order from here, wrapping
   * to cover the floor. Only wired when the user can run an audit.
   */
  onStartAuditHere?: (assetId: string) => void;
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
  onLogFlag,
  onStartAuditHere,
}: AssetDrawerProps) {
  const open = !!assetId;
  const { data: asset, isLoading } = useAsset(assetId ?? undefined);
  const { data: activity = [] } = useActivity('assets', assetId ?? undefined);
  const canEdit = useCan('edit', { type: 'building', id: buildingId });
  const canReposition = useCan('reposition', { type: 'building', id: buildingId });
  const canDelete = useCan('delete', { type: 'building', id: buildingId });
  const canAudit = useCan('audit', { type: 'floor', id: floorId });
  const { data: building } = useBuilding(buildingId);
  const { data: floor } = useFloor(floorId);
  const update = useUpdateAsset(floorId);
  const [editing, setEditing] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);

  // Photo hero state — lifted here so the hero (primary photo) and the Media
  // band's thumbnail strip share one source + selection (Feature #3d).
  const { data: photos = [], isLoading: photosLoading } = useAssetPhotos(assetId ?? undefined);
  const addPhoto = useAddAssetPhoto(assetId ?? '');
  const delPhoto = useDeleteAssetPhoto(assetId ?? '');
  const [activePhoto, setActivePhoto] = useState(0);
  // Full-screen zoomable viewer for the pin's photos (opened from the hero).
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // Tracks an in-flight upload batch ({done, total}). Uploads are sequential, so
  // a slow batch (esp. HEIC conversion) used to look stuck — picking again while
  // it ran started a SECOND batch and piled extra photos onto the pin. We now
  // ignore + disable new picks until the batch finishes, and show its progress.
  const [uploadBatch, setUploadBatch] = useState<{ done: number; total: number } | null>(null);
  // Instant local previews: show each picked photo from the local File the moment
  // it's added, so the surveyor never waits on the upload round-trip. Cleared (and
  // the object URL revoked) once its upload lands.
  const [pendingPhotos, setPendingPhotos] = useState<{ localId: string; url: string }[]>([]);

  async function onPickPhotos(list: FileList | null) {
    // Re-entrancy guard: ignore new picks while a batch is still uploading.
    if (!list || uploadBatch) return;
    setPhotoError(null);
    const files = Array.from(list);
    setUploadBatch({ done: 0, total: files.length });
    let done = 0;
    for (const raw of files) {
      // S8: HEIC converts to JPEG on-device before upload (image-convert.ts).
      const file = await prepareForUpload(raw);
      const v = validateAssetPhotoFile(file);
      if (v) {
        setPhotoError(v);
        setUploadBatch({ done: (done += 1), total: files.length });
        continue;
      }
      // Show the photo immediately from the local file while it uploads.
      const localId = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(file);
      setPendingPhotos((p) => [...p, { localId, url: previewUrl }]);
      try {
        await addPhoto.mutateAsync(file);
      } catch (e) {
        setPhotoError(e instanceof Error ? e.message : 'Upload failed.');
      } finally {
        setPendingPhotos((p) => p.filter((x) => x.localId !== localId));
        URL.revokeObjectURL(previewUrl);
      }
      setUploadBatch({ done: (done += 1), total: files.length });
    }
    setUploadBatch(null);
  }
  async function onDeletePhoto(p: AssetPhoto) {
    setPhotoError(null);
    try {
      await delPhoto.mutateAsync(p);
      setActivePhoto(0);
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : 'Delete failed.');
    }
  }

  // Reset edit mode whenever the selected asset changes.
  useEffect(() => {
    setEditing(false);
    setRecordOpen(false);
    setActivePhoto(0);
    setPhotoError(null);
  }, [assetId]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 flex h-[88dvh] flex-col rounded-t-2xl border-t border-black/10 bg-surface text-text shadow-sheet outline-none dark:border-white/10 sm:inset-x-auto sm:right-0 sm:top-0 sm:h-full sm:w-[min(96vw,440px)] sm:rounded-t-none sm:border-l sm:border-t-0"
        >
          {/* Feature #3d: thin near-black topbar. The asset name + status badge
              + Edit live on the photo hero below; here we keep just the title
              (for context when scrolled) and Close. */}
          <header className="flex items-center justify-between gap-3 bg-band-ink px-4 py-3 text-white">
            <Dialog.Title asChild>
              <p className="min-w-0 truncate text-sm font-semibold text-white">
                {asset?.name ?? 'Asset'}
              </p>
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                aria-label="Close"
                className="-mr-1 shrink-0 rounded-md p-1 text-white/80 hover:bg-white/10 hover:text-white"
              >
                <X size={18} aria-hidden />
              </button>
            </Dialog.Close>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto bg-band-paper p-4">
            {isLoading || !asset ? (
              <Skeleton />
            ) : (
              (() => {
                const safeActive = Math.min(activePhoto, Math.max(0, photos.length - 1));
                const current = photos[safeActive];
                const pinLabel = formatPinNumber(asset.pin_number);
                const subtitle = [
                  asset.category.charAt(0).toUpperCase() + asset.category.slice(1),
                  asset.room_number?.trim() ? `Rm ${asset.room_number.trim()}` : null,
                  pinLabel ? `Pin #${pinLabel}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ');
                // Slice 2 — narrative flow per the approved mock. The drawer keeps
                // its banded styling; sections are re-ordered/re-grouped into:
                // 1·See it (Photos & video) · 2·What it is (type/name/notes) ·
                // 3·Where it is (room/zone + pin controls) · 4·A problem or a
                // change? (Status & audit, then Vendor, then Activity). Step
                // markers sit above the relevant bands. Presentation only.
                const bands: Array<{
                  step?: string;
                  icon: LucideIcon;
                  label: string;
                  hint?: ReactNode;
                  node: ReactNode;
                }> = [
                  {
                    step: '1 · See it',
                    icon: Camera,
                    label: 'Photos & video',
                    hint:
                      photos.length > 0
                        ? `${photos.length} photo${photos.length === 1 ? '' : 's'}`
                        : undefined,
                    node: (
                      <>
                        <PhotoStrip
                          photos={photos}
                          active={safeActive}
                          loading={photosLoading}
                          canEdit={canEdit}
                          batch={uploadBatch}
                          pending={pendingPhotos}
                          error={photoError}
                          onSelect={setActivePhoto}
                          onPick={onPickPhotos}
                        />
                        <AuditVideosPanel
                          buildingId={buildingId}
                          assetId={asset.id}
                          compact
                          onRecordClick={canEdit ? () => setRecordOpen(true) : undefined}
                        />
                        <AssetAttachmentsPanel assetId={asset.id} canEdit={canEdit} />
                        {/* Visualize-on-a-wall is a signage mock-up tool — not
                            relevant to facility pins (stairwells, service rooms). */}
                        {asset.category === 'signage' && (
                          <VisualizeRow
                            buildingName={building?.name ?? 'Building'}
                            floorLabel={floor?.label ?? ''}
                            pinValue={asset.room_number?.trim() || asset.name}
                          />
                        )}
                      </>
                    ),
                  },
                  {
                    step: '2 · What it is',
                    icon: Tag,
                    label: 'What it is',
                    node: <WhatItIsBody asset={asset} />,
                  },
                  {
                    step: '3 · Where it is',
                    icon: MapPin,
                    label: 'Where it is',
                    node: (
                      <WhereItIsBody
                        asset={asset}
                        canEdit={canEdit}
                        busy={update.isPending}
                        onToggleLock={() =>
                          update.mutate({ id: asset.id, patch: { is_locked: !asset.is_locked } })
                        }
                        canReposition={canReposition && !!onStartReposition}
                        canDelete={canDelete && !!onStartDelete}
                        onReposition={() => onStartReposition?.(asset.id)}
                        onDelete={() => onStartDelete?.(asset.id)}
                      />
                    ),
                  },
                  {
                    step: '4 · A problem or a change?',
                    icon: ClipboardCheck,
                    label: 'Status & audit',
                    node: (
                      <>
                        <QuickActions
                          asset={asset}
                          canAudit={canAudit}
                          canEdit={canEdit}
                          onSetStatus={(status) =>
                            update.mutate({ id: asset.id, patch: { status } })
                          }
                          onLogFlag={onLogFlag ? () => onLogFlag(asset.id) : undefined}
                          onStartAuditHere={
                            onStartAuditHere ? () => onStartAuditHere(asset.id) : undefined
                          }
                        />
                        <AuditAttrs asset={asset} />
                        <ActionCard asset={asset} />
                      </>
                    ),
                  },
                  {
                    icon: Store,
                    label: 'Vendor',
                    node: <VendorPanel asset={asset} canEdit={canEdit} buildingId={buildingId} />,
                  },
                  // Expenses band — editor+ only (RLS hides expenses from
                  // auditors, tenant reps, and guests, so the UI matches).
                  ...(canEdit
                    ? [
                        {
                          icon: ShoppingCart,
                          label: 'Expenses',
                          node: (
                            <ExpensesPanel
                              assetId={asset.id}
                              canEdit={canEdit}
                              canDelete={canDelete}
                            />
                          ),
                        },
                      ]
                    : []),
                  { icon: History, label: 'Activity', node: <ActivitySection items={activity} /> },
                ];
                return (
                  <>
                    {asset.status === 'flagged' && (
                      <div className="flex items-center gap-2 rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm font-semibold text-danger">
                        <AlertTriangle size={15} aria-hidden className="shrink-0" />
                        <span>This asset is flagged</span>
                      </div>
                    )}
                    <Hero
                      photo={current}
                      loading={photosLoading}
                      name={asset.name ?? 'Asset'}
                      subtitle={subtitle}
                      status={asset.status as AssetStatus}
                      assetName={asset.name ?? 'Asset'}
                      photoIndex={safeActive}
                      canEdit={canEdit}
                      onEdit={() => setEditing(true)}
                      onDeletePhoto={canEdit && current ? () => onDeletePhoto(current) : undefined}
                      onOpenViewer={current ? () => setPhotoViewerOpen(true) : undefined}
                    />
                    <StatsStrip asset={asset} flagCount={asset.status === 'flagged' ? 1 : 0} />
                    {bands.map((b) => (
                      <div key={b.label}>
                        {b.step && (
                          <p className="mb-1.5 ml-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-accent">
                            {b.step}
                          </p>
                        )}
                        <Band icon={b.icon} label={b.label} hint={b.hint}>
                          {b.node}
                        </Band>
                      </div>
                    ))}
                    <PermissionsFooter />
                  </>
                );
              })()
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
      {asset && canEdit && (
        // Add/Edit parity: the same banded dialog edits this pin in place.
        <NewAssetDialog
          open={editing}
          onOpenChange={setEditing}
          asset={asset}
          floorId={floorId}
          buildingId={buildingId}
          position={null}
        />
      )}
      {asset && (
        <PhotoLightbox
          open={photoViewerOpen}
          onOpenChange={setPhotoViewerOpen}
          photos={photos}
          index={Math.min(activePhoto, Math.max(0, photos.length - 1))}
          onIndexChange={setActivePhoto}
          assetName={asset.name ?? 'Asset'}
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

/**
 * Read-only status indicators (M33). Status changes happen in Audit Mode --
 * these chips report the current state, they don't set it. The "Start audit
 * here" and "Log a flag" links route the user into Audit Mode on this pin:
 * the former starts the walkthrough here, the latter opens the flag capture
 * form.
 */
function QuickActions({
  asset,
  canAudit,
  canEdit,
  onSetStatus,
  onLogFlag,
  onStartAuditHere,
}: {
  asset: Asset;
  canAudit: boolean;
  canEdit?: boolean;
  onSetStatus?: (status: AssetStatus) => void;
  onLogFlag?: () => void;
  onStartAuditHere?: () => void;
}) {
  const current = asset.status as AssetStatus;
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
        Status
      </p>
      <div className="flex flex-wrap gap-1.5">
        {STATUS_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = current === opt.value;
          const base = cn(
            'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium',
            active
              ? variantClasses(opt.value, 'active')
              : 'border-black/15 bg-surface text-text-muted dark:border-white/15'
          );
          // Read-only (e.g. guest / no edit right): static chips, current marked.
          if (!canEdit) {
            return (
              <span
                key={opt.value}
                aria-current={active ? 'true' : undefined}
                className={cn(base, 'select-none', !active && 'opacity-60')}
              >
                <Icon size={12} aria-hidden />
                <span>{opt.label}</span>
                {active && <span className="ml-0.5 text-[10px] uppercase tracking-wide">· current</span>}
              </span>
            );
          }
          // Editable: the top-of-window status control (click to set).
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSetStatus?.(opt.value)}
              aria-pressed={active}
              className={cn(base, 'transition-colors', !active && 'opacity-70 hover:opacity-100')}
            >
              <Icon size={12} aria-hidden />
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
      {canAudit && (onStartAuditHere || onLogFlag) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {onStartAuditHere && (
            <button
              type="button"
              onClick={onStartAuditHere}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-waymarks-gold hover:underline"
            >
              <ClipboardList size={12} aria-hidden />
              Start audit here
            </button>
          )}
          {onLogFlag && (
            <button
              type="button"
              onClick={onLogFlag}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-waymarks-gold hover:underline"
            >
              <Flag size={12} aria-hidden />
              Log a flag in Audit Mode
            </button>
          )}
        </div>
      )}
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
    'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-medium text-white hover:bg-accent/90';
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
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-black/10 bg-surface px-3 text-xs font-medium text-text hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
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

/**
 * Photo hero (Feature #3d) — the active photo as a banner with a dark bottom
 * scrim (name + subtitle), a status badge, an Edit control, and Save / Delete
 * photo actions. Graceful empty state when there is no photo.
 */
function Hero({
  photo,
  loading,
  name,
  subtitle,
  status,
  assetName,
  photoIndex,
  canEdit,
  onEdit,
  onDeletePhoto,
  onOpenViewer,
}: {
  photo: AssetPhoto | undefined;
  loading: boolean;
  name: string;
  subtitle: string;
  status: AssetStatus;
  assetName: string;
  photoIndex: number;
  canEdit: boolean;
  onEdit: () => void;
  onDeletePhoto?: () => void;
  /** Opens the full-screen zoomable viewer. Absent = plain (no photo). */
  onOpenViewer?: () => void;
}) {
  // PERF-3: cached signed URL (keyed by path) — revisiting the same photo
  // reuses the same URL, so browser/SW caches hit instead of re-downloading.
  const signed = useSignedAssetPhotoUrl(photo?.path);
  const url = signed.data ?? null;
  const errored = signed.isError;
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    if (!photo) return;
    setDownloading(true);
    try {
      const dlUrl = await signedAssetPhotoDownloadUrl(
        photo.path,
        assetPhotoDownloadName(assetName, photoIndex, photo.path)
      );
      const a = document.createElement('a');
      a.href = dlUrl;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      if (url) window.open(url, '_blank', 'noopener');
    } finally {
      setDownloading(false);
    }
  }

  const badge =
    status === 'flagged'
      ? { label: 'Flagged', cls: 'bg-danger', Icon: Flag }
      : status === 'attention'
        ? { label: 'Attention', cls: 'bg-warning', Icon: AlertTriangle }
        : { label: 'Good', cls: 'bg-success', Icon: Check };
  const BadgeIcon = badge.Icon;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-black/10 shadow-sm dark:border-white/10">
      <div className="flex h-40 items-center justify-center bg-band-ink text-white/40">
        {loading ? (
          <div
            className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white/70"
            aria-hidden
          />
        ) : photo && url && !errored ? (
          onOpenViewer ? (
            <button
              type="button"
              onClick={onOpenViewer}
              aria-label="View photo full screen"
              className="block h-40 w-full cursor-zoom-in"
            >
              <img src={url} alt="" className="h-40 w-full object-cover" />
            </button>
          ) : (
            <img src={url} alt="" className="h-40 w-full object-cover" />
          )
        ) : (
          <ImageOff size={32} aria-hidden />
        )}
      </div>

      {/* Edit (top-left) */}
      {canEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label="Edit asset"
          className="absolute left-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-black/45 text-white backdrop-blur-sm hover:bg-black/65"
        >
          <Pencil size={15} aria-hidden />
        </button>
      )}

      {/* Status badge (top-right) */}
      <span
        className={cn(
          'absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold text-white shadow',
          badge.cls
        )}
      >
        <BadgeIcon size={13} aria-hidden />
        {badge.label}
      </span>

      {/* Scrim: name + subtitle (left), photo actions (right) */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-3 pt-10">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-white">{name}</p>
          <p className="truncate text-xs text-white/75">{subtitle}</p>
        </div>
        {photo && !errored && (
          <div className="flex shrink-0 items-center gap-1">
            {onOpenViewer && (
              <button
                type="button"
                onClick={onOpenViewer}
                aria-label="Zoom this photo"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white/15 text-white backdrop-blur-sm hover:bg-white/25"
              >
                <Maximize2 size={12} aria-hidden />
              </button>
            )}
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              aria-label="Download this photo"
              className="inline-flex h-7 items-center gap-1 rounded-md bg-white/15 px-2 text-[11px] font-medium text-white backdrop-blur-sm hover:bg-white/25 disabled:opacity-60"
            >
              <Download size={12} aria-hidden />
              {downloading ? 'Saving…' : 'Save'}
            </button>
            {onDeletePhoto && (
              <button
                type="button"
                onClick={onDeletePhoto}
                aria-label="Delete this photo"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white/15 text-white backdrop-blur-sm hover:bg-danger"
              >
                <Trash2 size={12} aria-hidden />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Dark quick-stats strip under the hero (Last audit · Status · Flags). */
function StatsStrip({ asset, flagCount }: { asset: Asset; flagCount: number }) {
  const status = computeStatus({ asset, lastAuditAt: null, openFlagCount: flagCount });
  return (
    <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-band-ink">
      <Stat k="Last audit" v="—" />
      <Stat k="Status" v={statusLabel(status)} tone={status === 'good' ? 'ok' : 'bad'} />
      <Stat k="Flags" v={String(flagCount)} tone={flagCount > 0 ? 'bad' : 'plain'} />
    </div>
  );
}

function Stat({ k, v, tone = 'plain' }: { k: string; v: string; tone?: 'ok' | 'bad' | 'plain' }) {
  return (
    <div className="bg-band-ink px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-[0.09em] text-white/55">{k}</p>
      <p
        className={cn(
          'mt-0.5 text-lg font-bold',
          tone === 'ok' ? 'text-pin-good' : tone === 'bad' ? 'text-pin-flagged' : 'text-white'
        )}
      >
        {v}
      </p>
    </div>
  );
}

/** Media photo strip — thumbnails (switch the hero) + Add photo / Choose files. */
function PhotoStrip({
  photos,
  active,
  loading,
  canEdit,
  batch,
  pending,
  error,
  onSelect,
  onPick,
}: {
  photos: AssetPhoto[];
  active: number;
  loading: boolean;
  canEdit: boolean;
  batch: { done: number; total: number } | null;
  pending: { localId: string; url: string }[];
  error: string | null;
  onSelect: (i: number) => void;
  onPick: (list: FileList | null) => void;
}) {
  const uploading = !!batch;
  const addLabel = batch
    ? `Uploading ${Math.min(batch.done + 1, batch.total)} of ${batch.total}…`
    : 'Add photo';
  return (
    <div className="space-y-2.5">
      {photos.length > 0 ? (
        <div className="flex gap-1.5 overflow-x-auto">
          {photos.map((p, i) => (
            <ThumbButton key={p.id} photo={p} active={i === active} onSelect={() => onSelect(i)} />
          ))}
        </div>
      ) : (
        !loading && pending.length === 0 && <p className="text-xs text-text-faint">No photos yet.</p>
      )}

      {/* Instant local previews of files still uploading. */}
      {pending.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto">
          {pending.map((p) => (
            <div
              key={p.localId}
              className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-black/10 dark:border-white/10"
            >
              <img src={p.url} alt="" className="h-full w-full object-cover opacity-70" />
              <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              </div>
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <label
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-semibold text-white shadow-sm hover:bg-accent/90',
              uploading ? 'pointer-events-none opacity-60' : 'cursor-pointer'
            )}
          >
            <Plus size={13} aria-hidden />
            <span>{addLabel}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                onPick(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
          <label
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-lg border-[1.5px] border-black/15 bg-surface px-3 text-xs font-medium text-text hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5',
              uploading ? 'pointer-events-none opacity-60' : 'cursor-pointer'
            )}
          >
            <Pencil size={13} aria-hidden />
            <span>Choose files</span>
            <input
              type="file"
              accept={PHOTO_ACCEPT}
              multiple
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                onPick(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
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
  const url = useSignedAssetPhotoUrl(photo.path).data ?? null;

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

/** Pin meta — pin number · type · category. */
function PinMeta({ asset }: { asset: Asset }) {
  const pinLabel = formatPinNumber(asset.pin_number);
  return (
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
    </div>
  );
}

/**
 * Identity — zone / room / manufacturer chips + the Notes block. Renders
 * nothing when none are present (preserves the prior "hidden if empty"
 * behavior). The old "Where on the floor" / location_notes line is gone — the
 * pin position already conveys that (Feature #3b).
 */
/** Read-only labelled value, styled like the mock's field/box. */
function ReadField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-text-faint">
        {label}
      </p>
      <div className="rounded-md border border-black/10 bg-bg px-3 py-2 text-sm leading-relaxed text-text dark:border-white/10">
        <span className="block whitespace-pre-wrap break-words">{children}</span>
      </div>
    </div>
  );
}

/** "What it is" (step 2) — the asset's identity: type, name, notes, maker. */
function WhatItIsBody({ asset }: { asset: Asset }) {
  const category = asset.category
    ? asset.category.charAt(0).toUpperCase() + asset.category.slice(1)
    : '';
  return (
    <>
      <ReadField label="Asset type">
        {[prettyType(asset.type), category].filter(Boolean).join(' · ') || '—'}
      </ReadField>
      <ReadField label="Name">{asset.name?.trim() || '—'}</ReadField>
      {asset.manufacturer?.trim() && (
        <ReadField label="Manufacturer">{asset.manufacturer}</ReadField>
      )}
      {asset.notes?.trim() && <ReadField label="Notes">{asset.notes}</ReadField>}
    </>
  );
}

/** "Where it is" (step 3) — location fields plus the pin controls (folds in the
 *  old "Pin" section). Lock + reposition/delete stay admin-gated. */
function WhereItIsBody({
  asset,
  canEdit,
  busy,
  onToggleLock,
  canReposition,
  canDelete,
  onReposition,
  onDelete,
}: {
  asset: Asset;
  canEdit: boolean;
  busy: boolean;
  onToggleLock: () => void;
  canReposition: boolean;
  canDelete: boolean;
  onReposition: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      {asset.room_number?.trim() && <ReadField label="Room">{asset.room_number}</ReadField>}
      {asset.zone?.trim() && <ReadField label="Layer">{asset.zone}</ReadField>}
      {asset.location_notes?.trim() && (
        <p className="flex items-start gap-1.5 text-sm text-text-muted">
          <MapPin size={12} aria-hidden className="mt-1 shrink-0" />
          <span>{asset.location_notes}</span>
        </p>
      )}
      <PinMeta asset={asset} />
      {canEdit && (
        <>
          <LockBar asset={asset} busy={busy} onToggleLock={onToggleLock} />
          <AdminActions
            canReposition={canReposition}
            canDelete={canDelete}
            onReposition={onReposition}
            onDelete={onDelete}
          />
        </>
      )}
    </>
  );
}

/**
 * Normalize a user-typed vendor URL into a usable href. We deliberately don't
 * validate hard (per the brief) — just prepend https:// when no scheme is
 * present so the link actually resolves.
 */
function vendorUrlHref(raw: string): string {
  const url = raw.trim();
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/**
 * M34 item 2: an asset can reference multiple vendors, chosen from the org's
 * Vendors directory (Admin → Contacts & Vendors). Admins can also inline-add a
 * brand-new vendor, which creates the directory row and links it in one step.
 * Supersedes the old single `vendor_contact` JSON blob (that column is kept in
 * the DB but no longer read/written here; legacy data was migrated forward).
 */
function orderMailto(
  toEmail: string,
  toName: string | undefined,
  asset: Asset,
  intent: 'order' | 'service'
): string {
  const subject =
    intent === 'service' ? `Service request — ${asset.name}` : `Sign order — ${asset.name}`;
  const action =
    intent === 'service'
      ? 'request service or a repair for'
      : 'order a replacement or new sign for';
  const body =
    `Hi${toName ? ` ${toName}` : ''},\n\n` +
    `I'd like to ${action} "${asset.name}"` +
    `${asset.room_number ? ` (room ${asset.room_number})` : ''}.\n\n` +
    `Details:\n\n\nThanks.`;
  return `mailto:${toEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * S4 — action card driven by the asset's CATEGORY:
 *   - signage  → "Order or service": "Order replacement" primary + a
 *                "Request service" secondary.
 *   - facility → "Request service" only — no sign-order framing; the card
 *                still shows as a prompt even when it has no target.
 *
 * Targets come ONLY from the asset's own data — vendor email → contact
 * email → vendor URL ("add any vendor with a link", Randy 2026-07-06).
 * No Officemark fallback, no building-level custom link. Buttons with no
 * resolvable target are dropped.
 */
function ActionCard({ asset }: { asset: Asset }) {
  const { data: vendors } = useAssetVendors(asset.id);
  const contacts = useContacts();

  const vendorEmail = (vendors ?? []).find((v) => v.email?.trim());
  const vendorUrl = (vendors ?? []).find((v) => v.url?.trim());
  const contact = asset.contact_id
    ? contacts.list.find((c) => c.id === asset.contact_id)
    : undefined;

  const isFacility = asset.category === 'facility';

  const emailTarget = vendorEmail?.email?.trim()
    ? { email: vendorEmail.email.trim(), name: vendorEmail.name }
    : contact?.email?.trim()
      ? { email: contact.email.trim(), name: contact.label }
      : null;
  const urlTarget =
    !emailTarget && vendorUrl?.url?.trim() ? vendorUrlHref(vendorUrl.url.trim()) : null;

  const orderHref = emailTarget
    ? orderMailto(emailTarget.email, emailTarget.name, asset, 'order')
    : urlTarget;
  const serviceHref = emailTarget
    ? orderMailto(emailTarget.email, emailTarget.name, asset, 'service')
    : urlTarget;
  const external = !emailTarget;

  const vendorName = emailTarget?.name ?? vendorUrl?.name ?? null;
  const vendorLine = vendorName ? `via ${vendorName}` : null;

  const title = isFacility ? 'Request service' : 'Order or service';
  const body = isFacility
    ? 'Log a service or maintenance request for this location.'
    : 'Order a replacement sign or request service for this sign.';

  type Btn = { label: string; href: string; primary: boolean; service: boolean };
  const buttons: Btn[] = [];
  if (!isFacility && orderHref) {
    buttons.push({ label: 'Order replacement', href: orderHref, primary: true, service: false });
  }
  if (serviceHref) {
    buttons.push({
      label: 'Request service',
      href: serviceHref,
      primary: isFacility,
      service: true,
    });
  }

  // Signage with no target of its own has nothing to offer; a facility pin
  // always shows its prompt (add a vendor/contact to make it actionable).
  if (buttons.length === 0 && !isFacility) return null;

  return (
    <div className="mt-3 rounded-md border border-waymarks-gold/30 bg-waymarks-gold-soft px-3 py-2 text-xs dark:bg-white/5">
      <p className="font-semibold text-waymarks-ink dark:text-white">{title}</p>
      <p className="mt-0.5 text-text-muted">{body}</p>
      {vendorLine && <p className="mt-0.5 text-text-faint">{vendorLine}</p>}
      {buttons.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {buttons.map((b) => {
            const Icon = b.service ? Wrench : ShoppingCart;
            return (
              <a
                key={b.label}
                href={b.href}
                {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className={
                  'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium ' +
                  (b.primary
                    ? 'bg-waymarks-gold text-waymarks-ink hover:bg-waymarks-gold-deep'
                    : 'border border-waymarks-gold text-waymarks-ink hover:bg-waymarks-gold-soft dark:text-white')
                }
              >
                <Icon size={12} aria-hidden />
                {b.label}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

function VendorPanel({
  asset,
  canEdit,
  buildingId,
}: {
  asset: Asset;
  canEdit: boolean;
  buildingId: string;
}) {
  const linked = useAssetVendors(asset.id);
  const directory = useVendors();
  const orgId = directory.orgId;
  const addLink = useAddAssetVendor(asset.id);
  const removeLink = useRemoveAssetVendor(asset.id);
  const createVendor = useCreateVendor();

  const [mode, setMode] = useState<'idle' | 'pick' | 'create'>('idle');
  const [pickId, setPickId] = useState('');
  const [error, setError] = useState<string | null>(null);
  // inline-create fields
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newUrl, setNewUrl] = useState('');

  const linkedVendors = linked.data ?? [];
  const linkedIds = new Set(linkedVendors.map((v) => v.id));
  // M34b: pick from this building's vendors plus org-wide shared ones only.
  const available = directory.list.filter(
    (v) => !linkedIds.has(v.id) && (v.building_id === null || v.building_id === buildingId)
  );

  function resetForms() {
    setMode('idle');
    setPickId('');
    setNewName('');
    setNewEmail('');
    setNewUrl('');
    setError(null);
  }

  async function addExisting() {
    if (!pickId || !orgId) return;
    setError(null);
    try {
      await addLink.mutateAsync({ vendorId: pickId, ownerOrgId: orgId });
      resetForms();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not link the vendor.');
    }
  }

  async function createAndLink() {
    if (!orgId) return;
    if (!newName.trim()) {
      setError('A vendor name is required.');
      return;
    }
    setError(null);
    try {
      const vendor = await createVendor.mutateAsync({
        owner_org_id: orgId,
        name: newName,
        email: newEmail,
        url: newUrl,
        // Inline-added from a pin → scope it to this building (a manager's own
        // supplier). It can be promoted to org-wide later in Admin.
        building_id: buildingId,
      });
      await addLink.mutateAsync({ vendorId: vendor.id, ownerOrgId: orgId });
      resetForms();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the vendor.');
    }
  }

  const busy = addLink.isPending || removeLink.isPending || createVendor.isPending;

  return (
    <div className="space-y-2 rounded-md border border-black/10 bg-bg p-2.5 dark:border-white/10">
      <p className="font-medium uppercase tracking-[0.14em] text-[10px] text-text-faint">
        Vendors
      </p>

      {linkedVendors.length === 0 && (
        <p className="text-xs text-text-faint">No vendors linked.</p>
      )}

      {linkedVendors.map((v) => (
        <div key={v.id} className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text">{v.name}</p>
            {v.email && (
              <a href={`mailto:${v.email}`} className="block text-sm text-waymarks-gold hover:underline">
                {v.email}
              </a>
            )}
            {v.url && (
              <a
                href={vendorUrlHref(v.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 inline-flex items-center gap-1 text-sm text-waymarks-gold hover:underline"
              >
                Supplier link
                <ExternalLink size={11} aria-hidden />
              </a>
            )}
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => void removeLink.mutateAsync(v.id)}
              disabled={busy}
              aria-label={`Unlink ${v.name}`}
              className="shrink-0 rounded p-1 text-text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-40"
            >
              <X size={12} aria-hidden />
            </button>
          )}
        </div>
      ))}

      {canEdit && mode === 'idle' && (
        <button
          type="button"
          onClick={() => setMode(available.length > 0 ? 'pick' : 'create')}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-dashed border-black/15 bg-bg px-3 text-xs font-medium text-text-muted transition-colors hover:border-waymarks-gold hover:text-waymarks-gold dark:border-white/15"
        >
          <Plus size={12} aria-hidden />
          Add vendor
        </button>
      )}

      {canEdit && mode === 'pick' && (
        <div className="space-y-2 rounded-md border border-waymarks-gold/40 bg-waymarks-gold-soft p-2.5">
          <select
            value={pickId}
            onChange={(e) => setPickId(e.target.value)}
            className="h-9 w-full rounded-md border border-black/10 bg-surface px-3 text-sm outline-none focus:border-waymarks-gold focus:ring-1 focus:ring-waymarks-gold"
          >
            <option value="">Choose a vendor…</option>
            {available.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => setMode('create')}
              className="text-xs font-medium text-waymarks-gold hover:underline"
            >
              + New vendor
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={resetForms}
                disabled={busy}
                className="inline-flex h-8 items-center rounded-md border border-black/15 bg-surface px-3 text-xs font-medium hover:bg-black/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void addExisting()}
                disabled={busy || !pickId}
                className="inline-flex h-8 items-center rounded-md bg-waymarks-gold px-3 text-xs font-medium text-waymarks-ink hover:bg-waymarks-gold-deep disabled:opacity-60"
              >
                {busy ? 'Linking…' : 'Link vendor'}
              </button>
            </div>
          </div>
        </div>
      )}

      {canEdit && mode === 'create' && (
        <div className="space-y-2 rounded-md border border-waymarks-gold/40 bg-waymarks-gold-soft p-2.5">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Vendor name (e.g. Acme Sign Co.)"
            maxLength={160}
            className="h-9 w-full rounded-md border border-black/10 bg-surface px-3 text-sm outline-none focus:border-waymarks-gold focus:ring-1 focus:ring-waymarks-gold"
          />
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="Email (optional)"
            maxLength={200}
            className="h-9 w-full rounded-md border border-black/10 bg-surface px-3 text-sm outline-none focus:border-waymarks-gold focus:ring-1 focus:ring-waymarks-gold"
          />
          <input
            type="url"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="Order link / supplier URL (optional)"
            maxLength={500}
            className="h-9 w-full rounded-md border border-black/10 bg-surface px-3 text-sm outline-none focus:border-waymarks-gold focus:ring-1 focus:ring-waymarks-gold"
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => (available.length > 0 ? setMode('pick') : resetForms())}
              disabled={busy}
              className="inline-flex h-8 items-center rounded-md border border-black/15 bg-surface px-3 text-xs font-medium hover:bg-black/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void createAndLink()}
              disabled={busy || !newName.trim()}
              className="inline-flex h-8 items-center rounded-md bg-waymarks-gold px-3 text-xs font-medium text-waymarks-ink hover:bg-waymarks-gold-deep disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Add & link'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


/** Audit attributes — installed date + audit cycle (Status & audit group). */
function AuditAttrs({ asset }: { asset: Asset }) {
  return (
    <dl className="grid grid-cols-2 gap-x-2 gap-y-2 text-sm">
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
