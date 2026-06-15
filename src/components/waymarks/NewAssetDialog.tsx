import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Camera,
  FileImage,
  X,
  AlertCircle,
  Trash2,
  Check,
  Layers,
  Video,
  MapPin,
  Tag,
  Bell,
  Wrench,
  Images,
  Plus,
  Info,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { useCreateAsset, useAssets, useUpdateAsset } from '@/hooks/useAssets';
import { useFloors } from '@/hooks/useFloors';
import { useContacts } from '@/hooks/useContacts';
import { useAddAuditVideo } from '@/hooks/useAuditVideos';
import { listAssetsByFloor, type AssetCategory } from '@/lib/queries/assets';
import { formatPinNumber } from '@/lib/pin-types';
import { addAssetPhoto, validateAssetPhotoFile } from '@/lib/queries/asset-photos';
import {
  AuditVideoRecorderDialog,
  type CapturedVideo,
} from '@/components/waymarks/AuditVideoRecorderDialog';
import { useAssetTypes, useCreateAssetType } from '@/hooks/useAssetTypes';
import { cn } from '@/lib/utils';
import type { Asset } from '@/types/database';

// Asset types come from org_asset_types via useAssetTypes (M11).
// Static fallback for the very first render before the fetch resolves
// is provided by lib/pin-types.ts; the hook overlays org-specific
// entries on top.

// Asset-dialog redesign: every form field is optional. Type falls back to
// 'other' (a seeded global) so the pin still renders with a category at the
// DB. "Where on the floor" (location_notes) was merged into the single Notes
// field, so it's no longer a separate input here. Vendor info lives in the
// drawer's Vendors list, not this dialog.
const schema = z.object({
  type: z.string().max(60).optional(),
  // All of these store in unlimited Postgres `text` columns, so the caps are
  // purely a front-end guard. The old 80-char caps on name/room_number surfaced
  // as an "Up to 80 characters" save block when longer descriptive text was
  // entered, so they're now generous. Notes is freeform with no practical limit
  // (a high ceiling only to guard against an accidental multi-megabyte paste).
  name: z.string().max(200, 'Up to 200 characters').optional(),
  room_number: z.string().max(200, 'Up to 200 characters').optional(),
  notes: z.string().max(20000, 'Up to 20000 characters').optional(),
});

type FormValues = z.infer<typeof schema>;

export type NewAssetDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  floorId: string;
  /** Building the placement floor belongs to — drives the multi-floor picker (item 4). */
  buildingId: string;
  /** Placement coords — required in add mode, ignored in edit mode. */
  position?: { x: number; y: number } | null;
  onCreated?: (asset: Asset) => void;
  /**
   * When supplied, the dialog is in EDIT mode: fields load from this asset,
   * the footer reads "Save changes", and submit updates the row in place.
   * Add/Edit parity — one component, every field editable in both.
   */
  asset?: Asset | null;
};

export function NewAssetDialog({
  open,
  onOpenChange,
  floorId,
  buildingId,
  position,
  onCreated,
  asset,
}: NewAssetDialogProps) {
  const isEdit = !!asset;
  const create = useCreateAsset();
  const update = useUpdateAsset(floorId);
  const addVideo = useAddAuditVideo();
  const { signage: signageTypes, facility: facilityTypes, list: allTypes, orgId } = useAssetTypes();
  const createAssetType = useCreateAssetType();
  const contacts = useContacts();
  // Only this building's contacts plus org-wide shared ones (M34b scope).
  const contactsInScope = contacts.list.filter(
    (c) => c.building_id === null || c.building_id === buildingId
  );

  // Zone suggestions: distinct zones already used on this floor (free-text,
  // so this just speeds re-entry of an existing zone — it doesn't constrain).
  const { data: floorAssets = [] } = useAssets(floorId);
  const zoneSuggestions = useMemo(() => {
    const seen = new Set<string>();
    for (const a of floorAssets) {
      const z = a.zone?.trim();
      if (z) seen.add(z);
    }
    return [...seen].sort((x, y) => x.localeCompare(y));
  }, [floorAssets]);

  // Item 4: a pin can be placed on several floors of the same building at once.
  // Each selected floor gets an independent asset row at the same x/y.
  const { data: buildingFloors } = useFloors(buildingId);
  const floors = [...(buildingFloors ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const [selectedFloorIds, setSelectedFloorIds] = useState<Set<string>>(() => new Set([floorId]));
  const [result, setResult] = useState<{ created: number; skipped: string[] } | null>(null);

  const [customTypeMode, setCustomTypeMode] = useState(false);
  const [customTypeLabel, setCustomTypeLabel] = useState('');
  const [customTypeError, setCustomTypeError] = useState<string | null>(null);
  const [typeQuery, setTypeQuery] = useState('');

  // Banded-dialog fields that live outside RHF (selects / datalist / chips).
  const [zone, setZone] = useState('');
  const [contactId, setContactId] = useState('');
  const [installed, setInstalled] = useState('');
  const [cycle, setCycle] = useState('');

  const [photos, setPhotos] = useState<File[]>([]);
  // Item: videos are deferred-captured the same way photos are — collected
  // here, then attached to the new asset(s) after create.
  const [videos, setVideos] = useState<CapturedVideo[]>([]);
  const [videoOpen, setVideoOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [photoErrors, setPhotoErrors] = useState<string[]>([]);

  // M18b: filter the type catalog by the query string. Case-insensitive
  // substring match on the label. Keeps it discoverable at 30+ types.
  const filteredSignage = typeQuery
    ? signageTypes.filter((t) => t.label.toLowerCase().includes(typeQuery.toLowerCase()))
    : signageTypes;
  const filteredFacility = typeQuery
    ? facilityTypes.filter((t) => t.label.toLowerCase().includes(typeQuery.toLowerCase()))
    : facilityTypes;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setValue,
    watch,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: { type: '', name: '', room_number: '', notes: '' },
  });

  const selectedType = watch('type');
  const selectedTypeMeta = allTypes.find((t) => t.key === selectedType) ?? null;

  function resetAll() {
    reset();
    setZone('');
    setContactId('');
    setInstalled('');
    setCycle('');
    setTypeQuery('');
    setCustomTypeMode(false);
    setCustomTypeLabel('');
    setCustomTypeError(null);
    setPhotos([]);
    setVideos([]);
    setPhotoErrors([]);
    setSubmitError(null);
  }

  useEffect(() => {
    if (open) {
      setSelectedFloorIds(new Set([floorId]));
      setResult(null);
    }
  }, [open, floorId]);

  // Edit mode: hydrate the form from the asset each time the dialog opens.
  // "Where on the floor" (location_notes) merges into the single Notes field;
  // on save it's written back to `notes` and location_notes is cleared.
  useEffect(() => {
    if (!open || !asset) return;
    const mergedNotes = [asset.location_notes, asset.notes]
      .map((s) => s?.trim())
      .filter(Boolean)
      .join('\n\n');
    reset({
      type: asset.type,
      name: asset.name ?? '',
      room_number: asset.room_number ?? '',
      notes: mergedNotes,
    });
    setZone(asset.zone ?? '');
    setContactId(asset.contact_id ?? '');
    setInstalled(asset.installed_at ?? '');
    setCycle(asset.audit_cycle_days != null ? String(asset.audit_cycle_days) : '');
    setTypeQuery('');
  }, [open, asset, reset]);

  function slugify(label: string): string {
    return label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/^([0-9])/, '_$1');
  }

  async function saveCustomType() {
    setCustomTypeError(null);
    const trimmed = customTypeLabel.trim();
    if (trimmed.length < 2) {
      setCustomTypeError('Label must be at least 2 characters.');
      return;
    }
    if (!orgId) {
      setCustomTypeError('Create a building first - custom types attach to your organization.');
      return;
    }
    const key = slugify(trimmed);
    if (!key) {
      setCustomTypeError('Use letters and numbers in the label.');
      return;
    }
    try {
      await createAssetType.mutateAsync({
        org_id: orgId,
        key,
        label: trimmed,
        color: '#475569', // neutral slate; admin can change later
        category: 'signage',
      });
      // Auto-select the new type and exit custom mode.
      setValue('type', key, { shouldValidate: true });
      setCustomTypeMode(false);
      setCustomTypeLabel('');
    } catch (err) {
      setCustomTypeError(err instanceof Error ? err.message : 'Could not save the custom type.');
    }
  }

  function appendFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const accepted: File[] = [];
    const errors: string[] = [];
    for (const file of Array.from(list)) {
      const v = validateAssetPhotoFile(file);
      if (v) errors.push(v);
      else accepted.push(file);
    }
    setPhotos((prev) => [...prev, ...accepted]);
    if (errors.length > 0) setPhotoErrors(errors);
    else setPhotoErrors([]);
  }

  async function onSubmit(values: FormValues) {
    // Validate the optional audit cycle (positive whole number of days).
    let cycleNum: number | null = null;
    if (cycle.trim() !== '') {
      const n = Number(cycle);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        setSubmitError('Audit cycle must be a positive whole number of days.');
        return;
      }
      cycleNum = n;
    }

    // Type optional, fallback to seeded 'other' so the pin still has a
    // renderable category.
    const finalType = (values.type ?? '').trim() || 'other';
    const finalCategory: AssetCategory =
      (allTypes.find((t) => t.key === finalType)?.category as AssetCategory) ?? 'signage';
    const mergedNotes = values.notes?.trim() || null;

    // ----- EDIT: update the existing row in place -----
    if (isEdit && asset) {
      setSubmitError(null);
      try {
        await update.mutateAsync({
          id: asset.id,
          patch: {
            name: values.name?.trim() || 'Untitled',
            type: finalType,
            category: finalCategory,
            room_number: values.room_number?.trim() || null,
            notes: mergedNotes,
            location_notes: null,
            contact_id: contactId || null,
            installed_at: installed || null,
            audit_cycle_days: cycleNum,
            zone: zone.trim() || null,
          },
        });
        // Attach any newly added photos / clips to the existing asset.
        for (const f of photos) await addAssetPhoto(asset.id, f);
        for (const v of videos) {
          await addVideo.mutateAsync({
            buildingId,
            assetId: asset.id,
            blob: v.blob,
            durationSeconds: v.durationSeconds,
            notes: v.notes,
          });
        }
        resetAll();
        onOpenChange(false);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Failed to save changes.');
      }
      return;
    }

    // ----- ADD: place one pin per selected floor -----
    if (!position) {
      setSubmitError('No position set — click on the floor plan first.');
      return;
    }
    // Always include the floor the pin was placed on, even if the picker isn't shown.
    const targetIds = selectedFloorIds.size > 0 ? [...selectedFloorIds] : [floorId];
    setSubmitError(null);
    try {
      // Item 4: create one independent asset per selected floor at the same
      // x/y. Skip any floor that already has a pin at that exact spot.
      const skipped: string[] = [];
      let firstCreated: Asset | null = null;
      let createdCount = 0;
      const labelFor = (id: string) => floors.find((f) => f.id === id)?.label ?? 'floor';

      for (const targetFloorId of targetIds) {
        const existing = await listAssetsByFloor(targetFloorId);
        const clash = existing.some(
          (a) =>
            Math.abs(Number(a.x) - position.x) < 1e-4 &&
            Math.abs(Number(a.y) - position.y) < 1e-4
        );
        if (clash) {
          skipped.push(labelFor(targetFloorId));
          continue;
        }

        const asset = await create.mutateAsync({
          floor_id: targetFloorId,
          type: finalType,
          category: finalCategory,
          name: values.name?.trim() || null,
          room_number: values.room_number?.trim() || null,
          notes: mergedNotes,
          contact_id: contactId || null,
          installed_at: installed || null,
          audit_cycle_days: cycleNum,
          zone: zone.trim() || null,
          x: position.x,
          y: position.y,
        });
        createdCount += 1;
        if (targetFloorId === floorId || firstCreated === null) firstCreated = asset;

        // Upload photos sequentially so sort_order is deterministic. Each
        // floor's copy gets its own photos (the copies diverge independently).
        for (const f of photos) {
          await addAssetPhoto(asset.id, f);
        }

        // Attach any recorded clips the same deferred way — through the same
        // useAddAuditVideo path the pin-detail recorder uses.
        for (const v of videos) {
          await addVideo.mutateAsync({
            buildingId,
            assetId: asset.id,
            blob: v.blob,
            durationSeconds: v.durationSeconds,
            notes: v.notes,
          });
        }
      }

      // Refresh the current floor view if anything landed there.
      if (firstCreated) onCreated?.(firstCreated);

      if (skipped.length === 0) {
        // Clean run — reset and close.
        resetAll();
        onOpenChange(false);
      } else {
        // Surface what was skipped; the user dismisses with "Done".
        setResult({ created: createdCount, skipped });
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create asset.');
    }
  }

  function finish() {
    resetAll();
    setResult(null);
    onOpenChange(false);
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          resetAll();
          setResult(null);
        }
        onOpenChange(o);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[min(94vw,560px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-black/10 bg-surface text-text shadow-sheet outline-none dark:border-white/10">
          {/* Ink header band with the orange accent bar. */}
          <div className="relative shrink-0 bg-waymarks-ink px-5 py-4 text-white">
            <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-waymarks-gold" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <Dialog.Title className="font-semibold text-xl">
                  {isEdit ? 'Edit asset' : 'Add asset'}
                </Dialog.Title>
                <Dialog.Description className="mt-0.5 text-sm text-white/70">
                  {isEdit
                    ? "Update this pin's details."
                    : 'Place a sign at the spot you clicked on the plan.'}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  aria-label="Close"
                  className="rounded-md p-1 text-white/70 hover:bg-white/10 hover:text-white"
                >
                  <X size={16} aria-hidden />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {result ? (
            <div className="space-y-4 overflow-y-auto p-5">
              <div className="rounded-md border border-black/10 bg-bg p-4 text-sm dark:border-white/10">
                <p className="font-medium text-text">
                  {result.created > 0
                    ? `Placed on ${result.created} floor${result.created === 1 ? '' : 's'}.`
                    : 'Nothing placed.'}
                </p>
                <p className="mt-1 text-text-muted">
                  Skipped {result.skipped.length} floor{result.skipped.length === 1 ? '' : 's'} that
                  already had a pin at this spot: {result.skipped.join(', ')}.
                </p>
              </div>
              <div className="flex justify-end">
                <Button variant="gold" onClick={finish}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="flex min-h-0 flex-1 flex-col"
              noValidate
            >
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                {submitError && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger"
                  >
                    <AlertCircle size={14} aria-hidden className="mt-0.5 shrink-0" />
                    <span>{submitError}</span>
                  </div>
                )}

                {/* ---------------------------------------------------------- LOCATION */}
                <Band icon={MapPin} label="Location" tone="paper">
                  <Field
                    label="Zone or Department"
                    htmlFor="asset-zone"
                    tooltip="A grouping for this sign — e.g. Reception, Parkade, Wing B, or a department name. Optional; filterable later."
                  >
                    <input
                      id="asset-zone"
                      list="asset-zone-suggestions"
                      value={zone}
                      onChange={(e) => setZone(e.target.value)}
                      placeholder="Enter a zone or department"
                      className={inputClass}
                    />
                    <datalist id="asset-zone-suggestions">
                      {zoneSuggestions.map((z) => (
                        <option key={z} value={z} />
                      ))}
                    </datalist>
                  </Field>

                  <Field
                    label="Room number & name"
                    htmlFor="asset-room"
                    error={errors.room_number?.message}
                    hint='Number, letter, or name — "301", "B12", "Boardroom A".'
                  >
                    <input id="asset-room" {...register('room_number')} placeholder='e.g. "301"' className={inputClass} />
                  </Field>

                  {isEdit && asset && (
                    <Field label="Pin number" htmlFor="asset-pin" hint="Assigned automatically — not editable.">
                      <input
                        id="asset-pin"
                        readOnly
                        value={
                          formatPinNumber(asset.pin_number)
                            ? `#${formatPinNumber(asset.pin_number)}`
                            : 'Not yet assigned'
                        }
                        className={cn(inputClass, 'cursor-not-allowed bg-band-mist text-text-muted')}
                      />
                    </Field>
                  )}

                  {/* Item 4: place the same pin on multiple floors at once (add only). */}
                  {!isEdit && floors.length > 1 && (
                    <div className="space-y-1.5">
                      <span className="block text-xs font-medium uppercase tracking-[0.18em] text-text-faint">
                        Floors
                      </span>
                      <FloorPicker
                        floors={floors}
                        currentFloorId={floorId}
                        selected={selectedFloorIds}
                        onChange={setSelectedFloorIds}
                      />
                      <p className="text-xs text-text-faint">
                        Creates a separate, independent pin on each selected floor. Shift-click to
                        select a range. A floor that already has a pin here is skipped.
                      </p>
                    </div>
                  )}
                </Band>

                {/* -------------------------------------------------------------- SIGN */}
                <Band icon={Tag} label="Sign" tone="white">
                  <Field label="Name" htmlFor="asset-name" error={errors.name?.message}>
                    <input
                      id="asset-name"
                      {...register('name')}
                      placeholder='e.g. "Lobby directory"'
                      className={inputClass}
                    />
                  </Field>

                  <TypePicker
                    query={typeQuery}
                    onQuery={setTypeQuery}
                    signage={filteredSignage}
                    facility={filteredFacility}
                    selectedKey={selectedType ?? ''}
                    selectedMeta={selectedTypeMeta}
                    onSelect={(key) => setValue('type', key, { shouldValidate: true })}
                    customMode={customTypeMode}
                    onStartCustom={() => setCustomTypeMode(true)}
                    customLabel={customTypeLabel}
                    onCustomLabel={setCustomTypeLabel}
                    customError={customTypeError}
                    customPending={createAssetType.isPending}
                    onSaveCustom={() => void saveCustomType()}
                    onCancelCustom={() => {
                      setCustomTypeMode(false);
                      setCustomTypeLabel('');
                      setCustomTypeError(null);
                    }}
                  />

                  <Field
                    label="Notes"
                    htmlFor="asset-notes"
                    error={errors.notes?.message}
                    hint="Where it is on the floor, install & service history — anything worth recording."
                  >
                    <textarea
                      id="asset-notes"
                      rows={3}
                      {...register('notes')}
                      placeholder='e.g. "East elevator lobby, mounted at 5′. Replaced 2024-03."'
                      className={textareaClass}
                    />
                  </Field>
                </Band>

                {/* ------------------------------------------- SEND STATUS / FLAGS TO */}
                <Band icon={Bell} label="Send status changes & flags to" tone="paper">
                  <Field
                    label="Contact"
                    htmlFor="asset-contact"
                    hint="Pick a directory contact. Manage the list in Admin → Contacts & Vendors."
                  >
                    <select id="asset-contact" value={contactId} onChange={(e) => setContactId(e.target.value)} className={inputClass}>
                      <option value="">— None —</option>
                      {contactsInScope.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                          {c.email ? ` · ${c.email}` : ''}
                        </option>
                      ))}
                    </select>
                  </Field>
                </Band>

                {/* ----------------------------------------------------------- SERVICE */}
                <Band icon={Wrench} label="Service" tone="white">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Installed" htmlFor="asset-installed">
                      <input
                        id="asset-installed"
                        type="date"
                        value={installed}
                        onChange={(e) => setInstalled(e.target.value)}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Audit cycle (days)" htmlFor="asset-cycle">
                      <input
                        id="asset-cycle"
                        type="number"
                        min={0}
                        step={1}
                        value={cycle}
                        onChange={(e) => setCycle(e.target.value)}
                        placeholder="default 90"
                        className={inputClass}
                      />
                    </Field>
                  </div>
                </Band>

                {/* --------------------------------------------------- PHOTOS & VIDEO */}
                <Band icon={Images} label="Photos & video" tone="paper">
                  <PhotosPicker
                    files={photos}
                    onAdd={appendFiles}
                    onRemove={(i) => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                    errors={photoErrors}
                    videos={videos}
                    onRecord={() => setVideoOpen(true)}
                    onRemoveVideo={(i) => setVideos((prev) => prev.filter((_, idx) => idx !== i))}
                  />
                </Band>
              </div>

              {/* Footer */}
              <div className="flex shrink-0 justify-end gap-2 border-t border-black/10 bg-surface px-4 py-3 dark:border-white/10">
                <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" variant="gold" loading={isSubmitting}>
                  {isEdit
                    ? photos.length > 0
                      ? `Save + ${photos.length} ${photos.length === 1 ? 'photo' : 'photos'}`
                      : 'Save changes'
                    : photos.length > 0
                      ? `Place pin + ${photos.length} ${photos.length === 1 ? 'photo' : 'photos'}`
                      : 'Place pin'}
                </Button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>

      {/* Same recorder the pin-detail window uses, in deferred-capture mode:
          it hands the clip back via onCapture (no asset_id yet) and we attach
          it after the pin is created, exactly like photos. */}
      <AuditVideoRecorderDialog
        open={videoOpen}
        onOpenChange={setVideoOpen}
        buildingId={buildingId}
        assetId={null}
        scopeLabel="the new pin"
        onCapture={(clip) => setVideos((prev) => [...prev, clip])}
      />
    </Dialog.Root>
  );
}

// Shared control classes (>=16px text rides the iOS auto-zoom guard).
const inputClass =
  'h-11 w-full rounded-md border border-black/10 bg-surface px-3 text-base text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10';
const textareaClass =
  'w-full rounded-md border border-black/10 bg-surface p-3 text-base text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10';

/**
 * A color-banded form section: a Mist header strip with a 4px orange left bar,
 * an icon and a small-caps label, over a body tinted Paper or white. Bodies
 * alternate so adjacent bands stay visually distinct.
 */
function Band({
  icon: Icon,
  label,
  tone,
  children,
}: {
  icon: LucideIcon;
  label: string;
  tone: 'paper' | 'white';
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
      <header className="relative flex items-center gap-2 bg-band-mist py-2 pl-4 pr-3">
        <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-waymarks-gold" />
        <Icon size={13} className="text-waymarks-gold" aria-hidden />
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          {label}
        </span>
      </header>
      <div className={cn('space-y-3 p-4', tone === 'paper' ? 'bg-band-paper' : 'bg-surface')}>
        {children}
      </div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  tooltip,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  /** Optional hover note shown via an info icon beside the label. */
  tooltip?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <label
          htmlFor={htmlFor}
          className="block text-xs font-medium uppercase tracking-[0.18em] text-text-faint"
        >
          {label}
        </label>
        {tooltip && (
          <Tooltip text={tooltip}>
            <button
              type="button"
              className="inline-flex cursor-help text-text-faint hover:text-text-muted"
              aria-label={tooltip}
            >
              <Info size={12} aria-hidden />
            </button>
          </Tooltip>
        )}
      </div>
      {children}
      {hint && !error && <p className="text-xs text-text-faint">{hint}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

type TypeMeta = { id: string; key: string; label: string; color: string };

/**
 * Searchable type picker rendered as legend pills — each a color dot + label
 * matching the floor legend, so the user sees exactly which colour their pin
 * will be. Filter narrows the catalog; a "+ Custom" pill opens the inline
 * creator. Replaces the old <select> (which hid the colours).
 */
function TypePicker({
  query,
  onQuery,
  signage,
  facility,
  selectedKey,
  selectedMeta,
  onSelect,
  customMode,
  onStartCustom,
  customLabel,
  onCustomLabel,
  customError,
  customPending,
  onSaveCustom,
  onCancelCustom,
}: {
  query: string;
  onQuery: (q: string) => void;
  signage: TypeMeta[];
  facility: TypeMeta[];
  selectedKey: string;
  selectedMeta: TypeMeta | null;
  onSelect: (key: string) => void;
  customMode: boolean;
  onStartCustom: () => void;
  customLabel: string;
  onCustomLabel: (v: string) => void;
  customError: string | null;
  customPending: boolean;
  onSaveCustom: () => void;
  onCancelCustom: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-medium uppercase tracking-[0.18em] text-text-faint">
        Type
      </span>
      <input
        type="text"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder={
          selectedMeta ? `Selected: ${selectedMeta.label} — search to change…` : 'Search types…'
        }
        className={inputClass}
      />
      <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border border-black/10 p-2 dark:border-white/10">
        <TypePillGroup heading="Signage" types={signage} selectedKey={selectedKey} onSelect={onSelect} />
        <TypePillGroup heading="Facility" types={facility} selectedKey={selectedKey} onSelect={onSelect} />
        {!customMode && (
          <button
            type="button"
            onClick={onStartCustom}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-waymarks-gold/50 px-2.5 py-1 text-xs font-medium text-waymarks-gold hover:bg-waymarks-gold-soft"
          >
            <Plus size={12} aria-hidden /> Custom type
          </button>
        )}
      </div>
      {customMode && (
        <div className="space-y-1.5 rounded-md border border-waymarks-gold/40 bg-waymarks-gold-soft p-3">
          <label
            htmlFor="custom-type-label"
            className="block text-[11px] font-medium uppercase tracking-[0.18em] text-waymarks-gold"
          >
            New custom type
          </label>
          <div className="flex gap-2">
            <input
              id="custom-type-label"
              value={customLabel}
              onChange={(e) => onCustomLabel(e.target.value)}
              maxLength={60}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: focuses the field when this inline editor opens
              autoFocus
              placeholder="e.g. Memorial bench"
              className="h-11 flex-1 rounded-md border border-black/10 bg-surface px-3 text-base text-text outline-none focus:border-waymarks-gold focus:ring-1 focus:ring-waymarks-gold"
            />
            <Button size="sm" variant="gold" loading={customPending} onClick={onSaveCustom} iconLeft={<Check size={12} aria-hidden />}>
              Save
            </Button>
            <Button size="sm" variant="secondary" onClick={onCancelCustom}>
              Cancel
            </Button>
          </div>
          {customError && <p className="text-xs text-danger">{customError}</p>}
          <p className="text-[11px] text-text-muted">
            Saved to your org's catalog and reusable for future assets. Color and category can be
            tuned in admin later.
          </p>
        </div>
      )}
    </div>
  );
}

function TypePillGroup({
  heading,
  types,
  selectedKey,
  onSelect,
}: {
  heading: string;
  types: TypeMeta[];
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  if (types.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.16em] text-text-faint">
        {heading}
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {types.map((t) => {
          const active = t.key === selectedKey;
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onSelect(t.key)}
                aria-pressed={active}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                  active
                    ? 'border-waymarks-ink bg-waymarks-ink/5 font-medium dark:border-white dark:bg-white/10'
                    : 'border-black/10 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5'
                )}
              >
                <span
                  aria-hidden
                  style={{ backgroundColor: t.color }}
                  className="inline-block h-2.5 w-2.5 rounded-full border border-white shadow-sm"
                />
                {t.label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Item 4: multi-floor selector. Checkbox list ordered by sort_order. The
 * placement floor is always checked and locked (you can't deselect the floor
 * you clicked on). Shift-click extends a contiguous range from the last
 * toggled floor, so "floors 3–9" is one gesture.
 */
function FloorPicker({
  floors,
  currentFloorId,
  selected,
  onChange,
}: {
  floors: { id: string; label: string }[];
  currentFloorId: string;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [lastIndex, setLastIndex] = useState<number | null>(null);

  function toggle(index: number, shiftKey: boolean) {
    const clicked = floors[index];
    if (!clicked) return;
    const next = new Set(selected);
    if (shiftKey && lastIndex !== null) {
      const [lo, hi] = lastIndex < index ? [lastIndex, index] : [index, lastIndex];
      const turnOn = !next.has(clicked.id);
      for (let i = lo; i <= hi; i++) {
        const f = floors[i];
        if (!f) continue;
        if (turnOn) next.add(f.id);
        else if (f.id !== currentFloorId) next.delete(f.id);
      }
    } else {
      const id = clicked.id;
      if (next.has(id)) {
        if (id !== currentFloorId) next.delete(id);
      } else {
        next.add(id);
      }
    }
    // The placement floor is always included.
    next.add(currentFloorId);
    setLastIndex(index);
    onChange(next);
  }

  return (
    <ul className="max-h-44 space-y-0.5 overflow-y-auto rounded-md border border-black/10 p-1 dark:border-white/10">
      {floors.map((f, i) => {
        const isCurrent = f.id === currentFloorId;
        const checked = selected.has(f.id);
        return (
          <li key={f.id}>
            <label
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5',
                isCurrent && 'cursor-default'
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={isCurrent}
                onClick={(e) => {
                  if (isCurrent) return;
                  toggle(i, (e as React.MouseEvent).shiftKey);
                }}
                onChange={() => {
                  /* handled in onClick to access shiftKey */
                }}
                className="h-4 w-4 shrink-0 accent-waymarks-gold"
              />
              <Layers size={12} aria-hidden className="shrink-0 text-text-faint" />
              <span className="truncate">{f.label}</span>
              {isCurrent && <span className="ml-auto text-[11px] text-text-faint">this floor</span>}
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function PhotosPicker({
  files,
  onAdd,
  onRemove,
  errors,
  videos,
  onRecord,
  onRemoveVideo,
}: {
  files: File[];
  onAdd: (list: FileList | null) => void;
  onRemove: (index: number) => void;
  errors: string[];
  videos: CapturedVideo[];
  onRecord: () => void;
  onRemoveVideo: (index: number) => void;
}) {
  return (
    <div className="space-y-2">
      {files.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {files.map((f, i) => (
            <PhotoTile key={i} file={f} onRemove={() => onRemove(i)} />
          ))}
        </ul>
      )}

      {videos.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {videos.map((v, i) => (
            <li
              key={i}
              className="inline-flex items-center gap-1.5 rounded-md border border-black/10 bg-surface px-2 py-1 text-xs dark:border-white/10"
            >
              <Video size={12} aria-hidden className="text-waymarks-gold" />
              <span>Clip · {formatClipLength(v.durationSeconds)}</span>
              <button
                type="button"
                onClick={() => onRemoveVideo(i)}
                aria-label={`Remove clip ${i + 1}`}
                className="rounded p-0.5 text-text-muted hover:bg-black/5 hover:text-danger dark:hover:bg-white/5"
              >
                <X size={11} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-black/15 p-3 dark:border-white/15">
        <span className="text-sm text-text-muted">
          {files.length === 0 ? 'Add one or more photos.' : `${files.length} attached. Add more if you want.`}
        </span>
        <div className="ml-auto flex gap-1">
          <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-black/10 px-2 text-xs hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
            <Camera size={12} aria-hidden />
            <span>Take photo</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                onAdd(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
          <button
            type="button"
            onClick={onRecord}
            className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-black/10 px-2 text-xs hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
          >
            <Video size={12} aria-hidden />
            <span>Record video</span>
          </button>
          <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-black/10 px-2 text-xs hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
            <FileImage size={12} aria-hidden />
            <span>Choose files</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="sr-only"
              onChange={(e) => {
                onAdd(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>

      {errors.length > 0 && (
        <ul className="space-y-1 text-xs text-danger">
          {errors.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatClipLength(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function PhotoTile({ file, onRemove }: { file: File; onRemove: () => void }) {
  const url = URL.createObjectURL(file);
  return (
    <li className="group relative aspect-square overflow-hidden rounded-md border border-black/10 dark:border-white/10">
      <img src={url} alt={file.name} className="h-full w-full object-cover" onLoad={() => URL.revokeObjectURL(url)} />
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${file.name}`}
        className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-waymarks-ink/80 text-white opacity-0 transition-opacity hover:bg-danger group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <Trash2 size={12} aria-hidden />
      </button>
    </li>
  );
}
