import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Camera, FileImage, X, AlertCircle, Trash2, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useCreateAsset } from '@/hooks/useAssets';
import { type AssetCategory } from '@/lib/queries/assets';
import { addAssetPhoto, validateAssetPhotoFile } from '@/lib/queries/asset-photos';
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
  location_notes: z.string().max(280, 'Up to 280 characters').optional(),
  room_number: z.string().max(80, 'Up to 80 characters').optional(),
  notes: z.string().max(4000, 'Up to 4000 characters').optional(),
});

type FormValues = z.infer<typeof schema>;

export type NewAssetDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  floorId: string;
  position: { x: number; y: number } | null;
  onCreated?: (asset: Asset) => void;
};

export function NewAssetDialog({
  open,
  onOpenChange,
  floorId,
  position,
  onCreated,
}: NewAssetDialogProps) {
  const create = useCreateAsset();
  const { signage: signageTypes, facility: facilityTypes, list: allTypes, orgId } = useAssetTypes();
  const createAssetType = useCreateAssetType();
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
      location_notes: '',
      room_number: '',
      notes: '',
    },
  });

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
    if (!position) {
      setSubmitError('No position set — click on the floor plan first.');
      return;
    }
    setSubmitError(null);
    try {
      // M17b: type optional, fallback to seeded 'other' so the pin still
      // has a renderable category. Vendor info is now added later from
      // the asset drawer.
      const finalType = (values.type ?? '').trim() || 'other';
      const finalCategory: AssetCategory =
        (allTypes.find((t) => t.key === finalType)?.category as AssetCategory) ?? 'signage';

      const asset = await create.mutateAsync({
        floor_id: floorId,
        type: finalType,
        category: finalCategory,
        name: values.name?.trim() || null,
        location_notes: values.location_notes?.trim() || null,
        room_number: values.room_number?.trim() || null,
        notes: values.notes?.trim() || null,
        x: position.x,
        y: position.y,
      });

      // Upload photos sequentially so sort_order is deterministic.
      for (const f of photos) {
        await addAssetPhoto(asset.id, f);
      }

      reset();
      setPhotos([]);
      setPhotoErrors([]);
      onCreated?.(asset);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create asset.');
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          setPhotos([]);
          setPhotoErrors([]);
          setSubmitError(null);
        }
        onOpenChange(o);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[min(94vw,540px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-black/10 bg-surface p-5 text-text shadow-sheet outline-none dark:border-white/10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="font-semibold text-xl">Add asset</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-text-muted">
                Place a sign at the spot you clicked on the plan.
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

            <Field
              label="Zone / asset type"
              htmlFor="asset-type"
              error={errors.type?.message}
              hint="Optional. Pick from the list, add a custom one, or skip."
            >
              <input
                type="text"
                value={typeQuery}
                onChange={(e) => setTypeQuery(e.target.value)}
                placeholder="Enter zone or department if applicable"
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

            {/* M32 Step 3: section divider — visually separates "where on
                the floor" from "everything else about the pin." Thin uppercase
                label with a 1px rule above, not a chunky heading. DB columns
                are unchanged (location_notes / room_number / notes). */}
            <SectionDivider label="Where" />

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

            <SectionDivider label="Notes" />

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

            <PhotosPicker
              files={photos}
              onAdd={appendFiles}
              onRemove={(i) => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
              errors={photoErrors}
            />

            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" variant="gold" loading={isSubmitting}>
                {photos.length > 0
                  ? `Place pin + ${photos.length} ${photos.length === 1 ? 'photo' : 'photos'}`
                  : 'Place pin'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
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
 * M32 Step 3: thin section divider used inside the asset form to group
 * "Where" (Room + Where on the floor) and "Notes" (Install & service notes).
 * Tiny uppercase label with a hairline rule above — guidance for the eye,
 * not navigation. Sits at the same vertical rhythm as a regular Field so
 * the form's space-y-4 cadence stays clean.
 */
function SectionDivider({ label }: { label: string }) {
  return (
    <div className="border-t border-black/10 pt-3 dark:border-white/10">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
        {label}
      </p>
    </div>
  );
}

function PhotosPicker({
  files,
  onAdd,
  onRemove,
  errors,
}: {
  files: File[];
  onAdd: (list: FileList | null) => void;
  onRemove: (index: number) => void;
  errors: string[];
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-text-faint">
        Photos (optional)
      </p>

      {files.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {files.map((f, i) => (
            <PhotoTile key={i} file={f} onRemove={() => onRemove(i)} />
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
