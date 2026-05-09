import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Camera, FileImage, X, AlertCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useCreateAsset } from '@/hooks/useAssets';
import { type AssetCategory } from '@/lib/queries/assets';
import { addAssetPhoto, validateAssetPhotoFile } from '@/lib/queries/asset-photos';
import { useAssetTypes } from '@/hooks/useAssetTypes';
import { cn } from '@/lib/utils';
import type { Asset } from '@/types/database';

// Asset types come from org_asset_types via useAssetTypes (M11).
// Static fallback for the very first render before the fetch resolves
// is provided by lib/pin-types.ts; the hook overlays org-specific
// entries on top.

// M18: only `type` is required (the pin needs a category to render).
// Everything else is optional. Name defaults to a placeholder server-side
// if blank.
const schema = z.object({
  type: z.string().min(1, 'Pick a type'),
  name: z.string().max(80, 'Up to 80 characters').optional(),
  location_notes: z.string().max(280, 'Up to 280 characters').optional(),
  room_number: z.string().max(80, 'Up to 80 characters').optional(),
  notes: z.string().max(4000, 'Up to 4000 characters').optional(),
  vendor_name: z.string().max(120).optional(),
  vendor_email: z.string().max(120).optional(),
  vendor_phone: z.string().max(60).optional(),
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
  const { signage: signageTypes, facility: facilityTypes, list: allTypes } = useAssetTypes();
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [photoErrors, setPhotoErrors] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    watch,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      type: '',
      name: '',
      location_notes: '',
      room_number: '',
      notes: '',
      vendor_name: '',
      vendor_email: '',
      vendor_phone: '',
    },
  });

  const selectedType = watch('type');
  const category: AssetCategory =
    (allTypes.find((t) => t.key === selectedType)?.category as AssetCategory) ?? 'signage';

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
      // M18: assemble vendor_contact JSON from flat form fields.
      const vendorContact =
        values.vendor_name?.trim() || values.vendor_email?.trim() || values.vendor_phone?.trim()
          ? {
              name: values.vendor_name?.trim() || undefined,
              email: values.vendor_email?.trim() || undefined,
              phone: values.vendor_phone?.trim() || undefined,
            }
          : null;

      const asset = await create.mutateAsync({
        floor_id: floorId,
        type: values.type,
        category,
        name: values.name?.trim() || null,
        location_notes: values.location_notes?.trim() || null,
        room_number: values.room_number?.trim() || null,
        notes: values.notes?.trim() || null,
        vendor_contact: vendorContact,
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

            <Field label="Type" htmlFor="asset-type" error={errors.type?.message}>
              <select
                id="asset-type"
                {...register('type')}
                className="h-11 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
              >
                <option value="">Choose a type…</option>
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
              label="Location notes"
              htmlFor="asset-loc"
              error={errors.location_notes?.message}
              hint="Optional. Where on the floor?"
            >
              <textarea
                id="asset-loc"
                rows={2}
                {...register('location_notes')}
                placeholder='e.g. "East elevator lobby, mounted at 5′"'
                className="w-full rounded-md border border-black/10 bg-surface p-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
              />
            </Field>

            {/* M18 — extra metadata fields. All optional; can be filled
                during the audit walk or later from the asset drawer. */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                label="Room number"
                htmlFor="asset-room"
                error={errors.room_number?.message}
                hint="Optional."
              >
                <input
                  id="asset-room"
                  {...register('room_number')}
                  placeholder='e.g. "301"'
                  className="h-11 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
                />
              </Field>
              <Field
                label="Vendor name"
                htmlFor="asset-vendor-name"
                error={errors.vendor_name?.message}
                hint="Optional."
              >
                <input
                  id="asset-vendor-name"
                  {...register('vendor_name')}
                  placeholder='e.g. "Acme Sign Co."'
                  className="h-11 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
                />
              </Field>
              <Field
                label="Vendor email"
                htmlFor="asset-vendor-email"
                error={errors.vendor_email?.message}
                hint="Optional."
              >
                <input
                  id="asset-vendor-email"
                  type="email"
                  {...register('vendor_email')}
                  placeholder="vendor@example.com"
                  className="h-11 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
                />
              </Field>
              <Field
                label="Vendor phone"
                htmlFor="asset-vendor-phone"
                error={errors.vendor_phone?.message}
                hint="Optional."
              >
                <input
                  id="asset-vendor-phone"
                  type="tel"
                  {...register('vendor_phone')}
                  placeholder="(416) 555-0123"
                  className="h-11 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
                />
              </Field>
            </div>

            <Field
              label="Notes"
              htmlFor="asset-notes"
              error={errors.notes?.message}
              hint="Optional. Any additional context, install notes, history."
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
