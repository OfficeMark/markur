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
import { cn } from '@/lib/utils';
import type { Asset } from '@/types/database';

// Asset types per the CHECK constraint in 0001_init.sql.
const SIGNAGE_TYPES = [
  { value: 'directory', label: 'Directory' },
  { value: 'tenant_id', label: 'Tenant ID' },
  { value: 'wayfinding', label: 'Wayfinding' },
  { value: 'tenant_products', label: 'Tenant products' },
  { value: 'evacuation', label: 'Evacuation' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'egress', label: 'Egress' },
  { value: 'other', label: 'Other' },
] as const;

const FACILITY_TYPES = [
  { value: 'stairwell', label: 'Stairwell' },
  { value: 'service_room', label: 'Service room' },
  { value: 'utility_room', label: 'Utility room' },
] as const;

const FORM_TYPES = [
  ...SIGNAGE_TYPES.map((t) => ({ ...t, category: 'signage' as const })),
  ...FACILITY_TYPES.map((t) => ({ ...t, category: 'facility' as const })),
];

const schema = z.object({
  type: z.string().min(1, 'Pick a type'),
  name: z.string().min(1, 'Name is required').max(80, 'Up to 80 characters'),
  location_notes: z.string().max(280, 'Up to 280 characters').optional(),
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
    defaultValues: { type: '', name: '', location_notes: '' },
  });

  const selectedType = watch('type');
  const category: AssetCategory =
    FORM_TYPES.find((t) => t.value === selectedType)?.category ?? 'signage';

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
      const asset = await create.mutateAsync({
        floor_id: floorId,
        type: values.type,
        category,
        name: values.name,
        location_notes: values.location_notes || null,
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
                  {SIGNAGE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Facility">
                  {FACILITY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
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
