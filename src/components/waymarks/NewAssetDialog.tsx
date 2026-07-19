import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Camera, FileImage, X, AlertCircle, Trash2, Check, Layers, Video, Tag, MapPin, Bell, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Band } from '@/components/ui/Band';
import { useAssets, useCreateAsset, useUpdateAsset } from '@/hooks/useAssets';
import { useContacts } from '@/hooks/useContacts';
import { useFloors } from '@/hooks/useFloors';
import { useAddAuditVideo } from '@/hooks/useAuditVideos';
import { listAssetsByFloor, type AssetCategory } from '@/lib/queries/assets';
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

// M17b: every form field is optional. Type falls back to 'other' (a
// seeded global) so the pin still renders with a category at the DB.
// Vendor info is no longer in this dialog — added later in the drawer
// when the user has the info to fill in.
const schema = z.object({
  type: z.string().max(60).optional(),
  name: z.string().max(80, 'Up to 80 characters').optional(),
  zone: z.string().max(120, 'Up to 120 characters').optional(),
  location_notes: z.string().max(280, 'Up to 280 characters').optional(),
  room_number: z.string().max(80, 'Up to 80 characters').optional(),
  notes: z.string().max(4000, 'Up to 4000 characters').optional(),
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
   * Standalone-only capability folded into main's layout.
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

  // Standalone-only fields folded into main's layout: a directory contact,
  // an installed date, and an audit cycle. Live outside RHF (select / dates).
  const contacts = useContacts();
  const contactsInScope = contacts.list.filter(
    (c) => c.building_id === null || c.building_id === buildingId
  );
  const [contactId, setContactId] = useState('');
  const [installed, setInstalled] = useState('');
  const [cycle, setCycle] = useState('');

  // Zone suggestions: distinct zones already used on this floor (free-text —
  // just speeds re-entry of an existing zone, doesn't constrain).
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

  useEffect(() => {
    if (open) {
      setSelectedFloorIds(new Set([floorId]));
      setResult(null);
    }
  }, [open, floorId]);
  const [customTypeMode, setCustomTypeMode] = useState(false);
  const [customTypeLabel, setCustomTypeLabel] = useState('');
  const [customTypeError, setCustomTypeError] = useState<string | null>(null);
  const [typeQuery, setTypeQuery] = useState('');

  // M18b: filter the dropdown groups by the query string. Case-insensitive
  // substring match on the label. Keeps the catalog discoverable when there
  // are 30+ types.
  const filteredSignage = typeQuery
    ? signageTypes.filter((t) => t.label.toLowerCase().includes(typeQuery.toLowerCase()))
    : signageTypes;
  const filteredFacility = typeQuery
    ? facilityTypes.filter((t) => t.label.toLowerCase().includes(typeQuery.toLowerCase()))
    : facilityTypes;
  const [photos, setPhotos] = useState<File[]>([]);
  // Item: videos are deferred-captured the same way photos are — collected
  // here, then attached to the new asset(s) after create.
  const [videos, setVideos] = useState<CapturedVideo[]>([]);
  const [videoOpen, setVideoOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [photoErrors, setPhotoErrors] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setValue,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      type: '',
      name: '',
      zone: '',
      location_notes: '',
      room_number: '',
      notes: '',
    },
  });

  // Edit mode: hydrate the form from the asset each time the dialog opens.
  // Add mode: clear the folded-in (non-RHF) fields.
  useEffect(() => {
    if (!open) return;
    if (asset) {
      reset({
        type: asset.type,
        name: asset.name ?? '',
        zone: asset.zone ?? '',
        location_notes: asset.location_notes ?? '',
        room_number: asset.room_number ?? '',
        notes: asset.notes ?? '',
      });
      setContactId(asset.contact_id ?? '');
      setInstalled(asset.installed_at ?? '');
      setCycle(asset.audit_cycle_days != null ? String(asset.audit_cycle_days) : '');
    } else {
      setContactId('');
      setInstalled('');
      setCycle('');
    }
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
    setSubmitError(null);
    // M17b: type optional, fallback to seeded 'other' so the pin still has a
    // renderable category. Vendor info is added later from the asset drawer.
    const finalType = (values.type ?? '').trim() || 'other';
    const finalCategory: AssetCategory =
      (allTypes.find((t) => t.key === finalType)?.category as AssetCategory) ?? 'signage';
    const cycleTrimmed = cycle.trim();
    const cycleNum = cycleTrimmed && Number.isFinite(Number(cycleTrimmed)) ? Number(cycleTrimmed) : null;

    // ----- EDIT: update the existing row in place (standalone capability
    // folded into main's layout) -----
    if (isEdit && asset) {
      try {
        await update.mutateAsync({
          id: asset.id,
          patch: {
            type: finalType,
            category: finalCategory,
            name: values.name?.trim() || 'Untitled',
            zone: values.zone?.trim() || null,
            location_notes: values.location_notes?.trim() || null,
            room_number: values.room_number?.trim() || null,
            notes: values.notes?.trim() || null,
            contact_id: contactId || null,
            installed_at: installed || null,
            audit_cycle_days: cycleNum,
          },
        });
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
        reset();
        setPhotos([]);
        setVideos([]);
        setPhotoErrors([]);
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
          zone: values.zone?.trim() || null,
          location_notes: values.location_notes?.trim() || null,
          room_number: values.room_number?.trim() || null,
          notes: values.notes?.trim() || null,
          contact_id: contactId || null,
          installed_at: installed || null,
          audit_cycle_days: cycleNum,
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
        // Clean run — behave like the single-floor path: reset and close.
        reset();
        setPhotos([]);
        setVideos([]);
        setPhotoErrors([]);
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
    reset();
    setPhotos([]);
    setVideos([]);
    setPhotoErrors([]);
    setResult(null);
    onOpenChange(false);
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          setPhotos([]);
          setVideos([]);
          setPhotoErrors([]);
          setSubmitError(null);
          setResult(null);
        }
        onOpenChange(o);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[min(94vw,540px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-black/10 bg-surface p-5 text-text shadow-sheet outline-none dark:border-white/10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="font-semibold text-xl">{isEdit ? 'Edit pin' : 'Add a pin'}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-text-muted">
                {isEdit
                  ? 'Update this pin’s details.'
                  : 'Place a pin at the spot you clicked on the plan.'}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                aria-label="Close"
                className="rounded-md p-1 text-text-muted hover:bg-black/5 dark:hover:bg-white/5"
              >
                <X size={16} aria-hidden />
              </button>
            </Dialog.Close>
          </div>

          {result ? (
            <div className="mt-5 space-y-4">
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
          <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4" noValidate>
            {submitError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger"
              >
                <AlertCircle size={14} aria-hidden className="mt-0.5 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            {/* Banded to match the pin-detail window (S6): Photos & video →
                What it is → Where it is. Presentation only — every field,
                register(), and handler below is unchanged. */}
            <Band
              icon={Camera}
              label="Photos & video"
              hint={
                photos.length > 0
                  ? `${photos.length} photo${photos.length === 1 ? '' : 's'}`
                  : undefined
              }
            >
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

            <Band icon={Tag} label="What it is">
            <Field
              label="Asset type"
              htmlFor="asset-type"
              error={errors.type?.message}
              hint="Optional. Pick from the list, add a custom one, or skip."
            >
              <input
                type="text"
                value={typeQuery}
                onChange={(e) => setTypeQuery(e.target.value)}
                placeholder="Pick a type, or add a new one — Directory, Stairwell ID, Fire extinguisher…"
                className="mb-1.5 h-9 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
              />
              <select
                id="asset-type"
                {...register('type')}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    e.preventDefault();
                    setValue('type', '');
                    setCustomTypeMode(true);
                    return;
                  }
                  setValue('type', e.target.value);
                }}
                className="h-11 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
              >
                <option value="">Choose a type… (optional)</option>
                {filteredSignage.length > 0 && (
                  <optgroup label="Signage">
                    {filteredSignage.map((t) => (
                      <option key={t.id} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </optgroup>
                )}
                {filteredFacility.length > 0 && (
                  <optgroup label="Facility">
                    {filteredFacility.map((t) => (
                      <option key={t.id} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </optgroup>
                )}
                <option value="__custom__">+ Add custom type…</option>
              </select>
              {customTypeMode && (
                <div className="mt-2 space-y-1.5 rounded-md border border-waymarks-gold/40 bg-waymarks-gold-soft p-3">
                  <label htmlFor="custom-type-label" className="block text-[11px] font-medium uppercase tracking-[0.18em] text-waymarks-gold">
                    New custom type
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="custom-type-label"
                      value={customTypeLabel}
                      onChange={(e) => setCustomTypeLabel(e.target.value)}
                      maxLength={60}
                      // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: focuses the field when this inline editor opens
                      autoFocus
                      placeholder="e.g. Memorial bench"
                      className="h-9 flex-1 rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-1 focus:ring-waymarks-gold"
                    />
                    <Button
                      size="sm"
                      variant="gold"
                      loading={createAssetType.isPending}
                      onClick={() => void saveCustomType()}
                      iconLeft={<Check size={12} aria-hidden />}
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setCustomTypeMode(false);
                        setCustomTypeLabel('');
                        setCustomTypeError(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                  {customTypeError && (
                    <p className="text-xs text-danger">{customTypeError}</p>
                  )}
                  <p className="text-[11px] text-text-muted">
                    Saved to your org's catalog and reusable for future assets.
                    Color and category can be tuned in admin later.
                  </p>
                </div>
              )}
            </Field>

            <Field label="Name" htmlFor="asset-name" error={errors.name?.message}>
              <input
                id="asset-name"
                {...register('name')}
                placeholder='e.g. "Lobby directory"'
                className="h-11 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
              />
            </Field>

            <Field
              label="Install & service notes"
              htmlFor="asset-notes"
              error={errors.notes?.message}
              hint="History, vendor info, install details. Anything not about where the pin is."
            >
              <textarea
                id="asset-notes"
                rows={3}
                {...register('notes')}
                placeholder='e.g. "Replaced 2024-03. Brushed aluminum, custom font."'
                className="w-full rounded-md border border-black/10 bg-surface p-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
              />
            </Field>
            </Band>

            <Band icon={MapPin} label="Where it is">
            {/* Feature #3a — free-text zone/department, distinct from the type
                select above. Optional; saved to assets.zone on submit. */}
            <Field
              label="Layer"
              htmlFor="asset-zone"
              error={errors.zone?.message}
              hint="Optional. e.g. Reception, Parkade, Wing B, or a department."
            >
              <input
                id="asset-zone"
                {...register('zone')}
                list="asset-zone-suggestions"
                placeholder="Reception, Parkade, Wing B, or a department"
                className="h-11 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
              />
              {zoneSuggestions.length > 0 && (
                <datalist id="asset-zone-suggestions">
                  {zoneSuggestions.map((z) => (
                    <option key={z} value={z} />
                  ))}
                </datalist>
              )}
            </Field>

            <Field
              label="Room"
              htmlFor="asset-room"
              error={errors.room_number?.message}
              hint='Number, letter, or name — "301", "B12", "Boardroom A".'
            >
              <input
                id="asset-room"
                {...register('room_number')}
                placeholder='e.g. "301"'
                className="h-11 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
              />
            </Field>

            <Field
              label="Where on the floor"
              htmlFor="asset-loc"
              error={errors.location_notes?.message}
              hint="Spatial detail used to find this pin. Filterable."
            >
              <textarea
                id="asset-loc"
                rows={2}
                {...register('location_notes')}
                placeholder='e.g. "East elevator lobby, mounted at 5′"'
                className="w-full rounded-md border border-black/10 bg-surface p-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
              />
            </Field>

            {/* Item 4: place the same pin on multiple floors at once. Each
                selected floor gets an independent copy at this x/y. Add-only. */}
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

            {/* Standalone-only fields folded into main's layout: a directory
                contact for notifications, plus install / audit-cycle service
                details. */}
            <Band icon={Bell} label="Send status changes & flags to">
              <Field
                label="Contact"
                htmlFor="asset-contact"
                hint="Pick a directory contact. Manage the list in Admin → Contacts & Vendors."
              >
                <select
                  id="asset-contact"
                  value={contactId}
                  onChange={(e) => setContactId(e.target.value)}
                  className="h-11 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
                >
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

            <Band icon={Wrench} label="Service">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Installed" htmlFor="asset-installed">
                  <input
                    id="asset-installed"
                    type="date"
                    value={installed}
                    onChange={(e) => setInstalled(e.target.value)}
                    className="h-11 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
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
                    className="h-11 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
                  />
                </Field>
              </div>
            </Band>

            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
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

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-xs font-medium uppercase tracking-[0.18em] text-text-faint"
      >
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-text-faint">{hint}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
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
              {isCurrent && (
                <span className="ml-auto text-[11px] text-text-faint">this floor</span>
              )}
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
              className="inline-flex items-center gap-1.5 rounded-md border border-black/10 bg-bg px-2 py-1 text-xs dark:border-white/10"
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

      <div
        className={cn(
          'flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3',
          'border-black/15 dark:border-white/15'
        )}
      >
        <span className="text-sm text-text-muted">
          {files.length === 0
            ? 'Add one or more photos.'
            : `${files.length} attached. Add more if you want.`}
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
