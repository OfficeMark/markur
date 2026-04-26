import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Camera, FileImage, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useCreateAsset } from '@/hooks/useAssets';
import { uploadAssetPhoto, type AssetCategory } from '@/lib/queries/assets';
import { supabase } from '@/lib/supabase';
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
  /** Floor we're placing on. */
  floorId: string;
  /** Click coordinates as 0–1 normalized values. */
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
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

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

      if (photoFile) {
        const path = await uploadAssetPhoto(asset.id, photoFile);
        await supabase.from('assets').update({ photo_url: path }).eq('id', asset.id);
      }

      reset();
      setPhotoFile(null);
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
          setPhotoFile(null);
          setSubmitError(null);
        }
        onOpenChange(o);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(94vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-black/10 bg-surface p-5 text-text shadow-sheet outline-none dark:border-white/10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="font-serif text-xl">Add asset</Dialog.Title>
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
              label="Type"
              htmlFor="asset-type"
              error={errors.type?.message}
            >
              <select
                id="asset-type"
                {...register('type')}
                className="h-11 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold/40 dark:border-white/10"
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
                className="h-11 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold/40 dark:border-white/10"
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
                className="w-full rounded-md border border-black/10 bg-surface p-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold/40 dark:border-white/10"
              />
            </Field>

            <PhotoPicker file={photoFile} onChange={setPhotoFile} />

            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" variant="gold" loading={isSubmitting}>
                Place pin
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

function PhotoPicker({
  file,
  onChange,
}: {
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  const previewUrl = file ? URL.createObjectURL(file) : null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-text-faint">
        Photo (optional)
      </p>
      <div
        className={cn(
          'flex items-center gap-3 rounded-md border border-dashed p-3',
          file ? 'border-waymarks-gold/50 bg-waymarks-gold-soft' : 'border-black/15 dark:border-white/15'
        )}
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Selected"
            className="h-14 w-14 rounded-md object-cover"
            onLoad={() => URL.revokeObjectURL(previewUrl)}
          />
        ) : (
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-md bg-waymarks-gold-soft text-text-faint dark:bg-white/5">
            <FileImage size={18} aria-hidden />
          </span>
        )}
        <div className="flex-1 space-y-1 text-sm">
          {file ? (
            <>
              <p className="truncate font-medium">{file.name}</p>
              <p className="text-xs text-text-faint">{(file.size / 1024).toFixed(0)} KB</p>
            </>
          ) : (
            <p className="text-text-muted">Capture or pick an image of this sign.</p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-black/10 px-2 text-xs hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
            <Camera size={12} aria-hidden />
            <span>Take photo</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => onChange(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-black/10 px-2 text-xs hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
            <FileImage size={12} aria-hidden />
            <span>Choose file</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => onChange(e.target.files?.[0] ?? null)}
            />
          </label>
          {file && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-xs text-text-faint hover:text-danger"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
