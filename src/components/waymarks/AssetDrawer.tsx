import { useEffect, useState } from 'react';
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
  ClipboardList,
  Flag,
  Lock,
  LockOpen,
  Move,
  Eye,
  ShoppingCart,
  Download,
  ExternalLink,
} from 'lucide-react';
import { Chip } from '@/components/ui/Chip';
import { MetricCard } from '@/components/ui/MetricCard';
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
import { ensureUploadableImage, PHOTO_ACCEPT } from '@/lib/heic';
import { computeStatus, statusLabel, type AssetStatus } from '@/lib/asset-status';
import { formatPinNumber } from '@/lib/pin-types';
import {
  buildingExternalLinkFromSettings,
  DEFAULT_ORDER_LABEL,
  DEFAULT_ORDER_URL,
  type BuildingExternalLink,
} from '@/lib/building-settings';
import { useContacts } from '@/hooks/useContacts';
import { NewAssetDialog } from './NewAssetDialog';
import { useAssetVendors, useAddAssetVendor, useRemoveAssetVendor } from '@/hooks/useAssetVendors';
import { useVendors, useCreateVendor } from '@/hooks/useVendors';
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
  /**
   * Guest viewer (building share link): hides the optional/internal surfaces a
   * client shouldn't see — Visualize, Order Signs, vendor details, attachments,
   * audit videos, and the activity timeline. Edit affordances are already
   * suppressed via useCan (a viewer grant returns false for every write cap).
   */
  guest?: boolean;
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
  guest = false,
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
          className="fixed inset-x-0 bottom-0 z-50 flex h-[88vh] flex-col rounded-t-2xl border-t border-black/10 bg-surface text-text shadow-sheet outline-none dark:border-white/10 sm:inset-x-auto sm:right-0 sm:top-0 sm:h-full sm:w-[min(96vw,440px)] sm:rounded-t-none sm:border-l sm:border-t-0"
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
            ) : (
              <>
                {asset.status === 'flagged' && (
                  <div className="flex items-center gap-2 rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm font-semibold text-danger">
                    <AlertTriangle size={15} aria-hidden className="shrink-0" />
                    <span>This asset is flagged</span>
                  </div>
                )}
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
                    <AdminActions
                      canReposition={canReposition && !!onStartReposition}
                      canDelete={canDelete && !!onStartDelete}
                      onReposition={() => onStartReposition?.(asset.id)}
                      onDelete={() => onStartDelete?.(asset.id)}
                    />
                  </>
                )}
                <QuickActions
                  asset={asset}
                  canAudit={canAudit}
                  canEdit={canEdit}
                  onSetStatus={(status) => update.mutate({ id: asset.id, patch: { status } })}
                  onLogFlag={onLogFlag ? () => onLogFlag(asset.id) : undefined}
                  onStartAuditHere={
                    onStartAuditHere ? () => onStartAuditHere(asset.id) : undefined
                  }
                />
                {!guest && (
                  <VisualizeRow
                    buildingName={building?.name ?? 'Building'}
                    floorLabel={floor?.label ?? ''}
                    pinValue={asset.room_number?.trim() || asset.name}
                  />
                )}
                {!guest && (
                  <OrderSignsRow
                    asset={asset}
                    externalLink={buildingExternalLinkFromSettings(building?.settings)}
                  />
                )}
                <DetailsSection asset={asset} canEdit={canEdit} buildingId={buildingId} guest={guest} />
                <StatusRow asset={asset} flagCount={asset.status === 'flagged' ? 1 : 0} />
                {!guest && <AssetAttachmentsPanel assetId={asset.id} canEdit={canEdit} />}
                {!guest && (
                  <AuditVideosPanel
                    buildingId={buildingId}
                    assetId={asset.id}
                    onRecordClick={canEdit ? () => setRecordOpen(true) : undefined}
                  />
                )}
                <AttributesSection asset={asset} />
                {!guest && <ActivitySection items={activity} />}
                {!guest && <PermissionsFooter />}
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
 * these chips report the current state, they don't set it. The "Log a flag"
 * link routes the user into Audit Mode on this pin, where the flag capture
 * form lives.
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
  canEdit: boolean;
  onSetStatus: (status: AssetStatus) => void;
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
              onClick={() => onSetStatus(opt.value)}
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

function orderMailto(toEmail: string, toName: string | undefined, asset: Asset): string {
  const subject = `Order / request — ${asset.name}`;
  const body =
    `Hi${toName ? ` ${toName}` : ''},\n\n` +
    `I'd like to order a replacement or request service for "${asset.name}"` +
    `${asset.room_number ? ` (room ${asset.room_number})` : ''}.\n\n` +
    `Details:\n\n\nThanks.`;
  return `mailto:${toEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Item 3: "Order signs" is an action button targeted at the directory the pin
 * references. Priority:
 *   1. a linked vendor with an email → prefilled mailto draft
 *   2. a linked vendor with a URL    → opens the supplier site in a new tab
 *   3. the pin's contact with an email → prefilled mailto draft
 *   4. fallback                       → the Officemark order login
 */
function OrderSignsRow({
  asset,
  externalLink,
}: {
  asset: Asset;
  externalLink: BuildingExternalLink;
}) {
  const { data: vendors } = useAssetVendors(asset.id);
  const contacts = useContacts();

  const vendorEmail = (vendors ?? []).find((v) => v.email?.trim());
  const vendorUrl = (vendors ?? []).find((v) => v.url?.trim());
  const contact = asset.contact_id
    ? contacts.list.find((c) => c.id === asset.contact_id)
    : undefined;

  let href: string;
  let helper: string;
  let opensExternally: boolean;
  let title = 'Order or request';
  let buttonLabel = DEFAULT_ORDER_LABEL;
  let custom = false;
  if (vendorEmail) {
    // A pin's own vendor/contact target always wins over the building default.
    href = orderMailto(vendorEmail.email!.trim(), vendorEmail.name, asset);
    helper = `Email ${vendorEmail.name} to order a replacement or request service.`;
    opensExternally = false;
  } else if (vendorUrl) {
    href = vendorUrlHref(vendorUrl.url!.trim());
    helper = `Open ${vendorUrl.name}'s site to order or request service.`;
    opensExternally = true;
  } else if (contact?.email?.trim()) {
    href = orderMailto(contact.email.trim(), contact.label, asset);
    helper = `Email ${contact.label} to order a replacement or request service.`;
    opensExternally = false;
  } else if (externalLink.mode === 'hidden') {
    // Building opted out of a fallback button and the pin has no own target.
    return null;
  } else if (externalLink.mode === 'custom') {
    href = externalLink.url;
    title = externalLink.label.trim() || 'External link';
    buttonLabel = externalLink.label.trim() || 'Open';
    helper = 'Open this building’s configured link.';
    opensExternally = true;
    custom = true;
  } else {
    href = DEFAULT_ORDER_URL;
    helper = 'Order a replacement or request service for this item.';
    opensExternally = true;
  }

  const Icon = custom ? ExternalLink : ShoppingCart;

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-waymarks-gold/30 bg-waymarks-gold-soft px-3 py-2 text-xs dark:bg-white/5">
      <div className="min-w-0">
        <p className="truncate font-semibold text-waymarks-ink dark:text-white">{title}</p>
        <p className="text-text-muted">{helper}</p>
      </div>
      <a
        href={href}
        {...(opensExternally ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-waymarks-gold px-3 text-xs font-medium text-white hover:bg-waymarks-gold-deep"
      >
        <Icon size={12} aria-hidden />
        <span className="max-w-[120px] truncate">{buttonLabel}</span>
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
  const [converting, setConverting] = useState(false);
  // Tracks an in-flight upload batch ({done, total}). Uploads are sequential, so
  // a slow batch (esp. HEIC conversion) used to look stuck — picking again while
  // it ran started a SECOND batch and piled extra photos onto the pin. We now
  // ignore + disable new picks until the batch finishes, and show its progress.
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);

  const safeActive = Math.min(active, Math.max(0, photos.length - 1));
  const current: AssetPhoto | undefined = photos[safeActive];

  async function onPickFiles(list: FileList | null) {
    if (!list || batch) return;
    setErrorMsg(null);
    const files = Array.from(list);
    setBatch({ done: 0, total: files.length });
    let done = 0;
    for (const raw of files) {
      let file = raw;
      try {
        // HEIC/HEIF → JPEG before validate/upload (never store HEIC).
        file = await ensureUploadableImage(raw, () => setConverting(true));
        setConverting(false);
      } catch {
        setConverting(false);
        setErrorMsg(`${raw.name}: couldn't convert this HEIC photo.`);
        setBatch({ done: (done += 1), total: files.length });
        continue;
      }
      const v = validateAssetPhotoFile(file);
      if (v) {
        setErrorMsg(v);
        setBatch({ done: (done += 1), total: files.length });
        continue;
      }
      try {
        await add.mutateAsync(file);
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : 'Upload failed.');
      }
      setBatch({ done: (done += 1), total: files.length });
    }
    setBatch(null);
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
          <label
            className={
              'inline-flex h-8 items-center gap-1 rounded-md border border-black/10 px-2 text-xs dark:border-white/10 ' +
              (batch ? 'pointer-events-none opacity-60' : 'cursor-pointer hover:bg-black/5 dark:hover:bg-white/5')
            }
          >
            <Plus size={12} aria-hidden />
            <span>
              {batch
                ? `${converting ? 'Converting' : 'Uploading'} ${Math.min(batch.done + 1, batch.total)} of ${batch.total}…`
                : 'Add photo'}
            </span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              disabled={!!batch}
              onChange={(e) => {
                void onPickFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
          <label
            className={
              'inline-flex h-8 items-center gap-1 rounded-md border border-black/10 px-2 text-xs dark:border-white/10 ' +
              (batch ? 'pointer-events-none opacity-60' : 'cursor-pointer hover:bg-black/5 dark:hover:bg-white/5')
            }
          >
            <Pencil size={12} aria-hidden />
            <span>Choose files</span>
            <input
              type="file"
              accept={PHOTO_ACCEPT}
              multiple
              className="sr-only"
              disabled={!!batch}
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

function DetailsSection({
  asset,
  canEdit,
  buildingId,
  guest = false,
}: {
  asset: Asset;
  canEdit: boolean;
  buildingId: string;
  guest?: boolean;
}) {
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
      {!guest && <VendorPanel asset={asset} canEdit={canEdit} buildingId={buildingId} />}
    </div>
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
