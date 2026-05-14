import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, Layers, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useCreateFloor } from '@/hooks/useFloors';
import { uploadFloorPlan, validatePlanFile } from '@/lib/upload';
import { supabase } from '@/lib/supabase';

/**
 * Add a floor to a building (M17). Closes the gap left after M5 — there
 * was no UI to create floors; only the seed migration made the example
 * floors. This dialog creates the floors row and (optionally) uploads a
 * floor plan in the same flow.
 *
 * Behavior:
 *  - Required: label (e.g. "B2", "Ground", "Floor 14")
 *  - Optional: a floor-plan file (PDF / PNG / JPG). If included, we create
 *    the floor first, then upload the plan, then update the floor row's
 *    plan_url. If the upload fails, the floor still exists — the user can
 *    upload a plan later via the Replace plan button on the floor view.
 *  - sort_order defaults to "highest existing + 10" so new floors land at
 *    the bottom of the list. Editable from a floor's settings later.
 */

const schema = z.object({
  label: z.string().min(1, 'A label is required').max(40, 'Up to 40 characters'),
});
type FormValues = z.infer<typeof schema>;

export type NewFloorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildingId: string;
  buildingName: string;
};

type Stage =
  | { kind: 'form' }
  | { kind: 'creating' }
  | { kind: 'uploading'; floorId: string }
  | { kind: 'error'; message: string };

export function NewFloorDialog({
  open,
  onOpenChange,
  buildingId,
  buildingName,
}: NewFloorDialogProps) {
  const create = useCreateFloor(buildingId);
  const [stage, setStage] = useState<Stage>({ kind: 'form' });
  const [planFile, setPlanFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { label: '' },
  });

  useEffect(() => {
    if (open) {
      reset({ label: '' });
      setStage({ kind: 'form' });
      setPlanFile(null);
      setFileError(null);
    }
  }, [open, reset]);

  function onPickFile(file: File | null) {
    setFileError(null);
    if (!file) {
      setPlanFile(null);
      return;
    }
    const validation = validatePlanFile(file);
    if (validation) {
      setFileError(validation.message);
      return;
    }
    setPlanFile(file);
  }

  async function onSubmit(values: FormValues) {
    setStage({ kind: 'creating' });
    let floorId: string;
    try {
      const floor = await create.mutateAsync({ label: values.label.trim() });
      floorId = floor.id;
    } catch (err) {
      setStage({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Could not create the floor.',
      });
      return;
    }

    if (!planFile) {
      onOpenChange(false);
      return;
    }

    // Upload plan in a second step; failure here doesn't undo the floor.
    setStage({ kind: 'uploading', floorId });
    try {
      await uploadFloorPlan(floorId, planFile);
      // Persist the plan_url path on the floor row.
      const ext = extFromMime(planFile.type);
      const path = `${floorId}.${ext}`;
      const { error } = await supabase
        .from('floors')
        .update({ plan_url: path })
        .eq('id', floorId);
      if (error) throw error;
      onOpenChange(false);
    } catch (err) {
      setStage({
        kind: 'error',
        message:
          (err instanceof Error ? err.message : 'Plan upload failed.') +
          ' The floor was created — you can upload a plan from the floor view.',
      });
    }
  }

  const busy = stage.kind === 'creating' || stage.kind === 'uploading' || isSubmitting;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-black/10 bg-surface p-5 shadow-sheet">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
                <Layers size={12} aria-hidden /> {buildingName}
              </p>
              <Dialog.Title className="mt-1 font-semibold text-lg">Add a floor</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-text-muted">
                Give it a short label like B2, Ground, or Floor 14. You can upload
                the floor plan now, or later.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="rounded p-1 text-text-faint hover:bg-black/5 hover:text-text dark:hover:bg-white/5"
              >
                <X size={16} aria-hidden />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <label className="block">
              <span className="block text-xs font-medium uppercase tracking-[0.18em] text-text-faint">
                Label
              </span>
              <input
                type="text"
                {...register('label')}
                // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: focuses the first field when this focus-trapped dialog opens
                autoFocus
                maxLength={40}
                placeholder="e.g. B2, Ground, Floor 14"
                className="mt-1 h-10 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold"
              />
              {errors.label && (
                <p className="mt-1 text-xs text-danger">{errors.label.message}</p>
              )}
            </label>

            <div>
              <span className="block text-xs font-medium uppercase tracking-[0.18em] text-text-faint">
                Floor plan (optional)
              </span>
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                className="hidden"
                onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
              />
              {planFile ? (
                <div className="mt-1 flex items-center justify-between gap-3 rounded-md border border-black/10 bg-bg p-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{planFile.name}</p>
                    <p className="text-[11px] text-text-faint">
                      {(planFile.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onPickFile(null)}
                    className="text-xs text-text-muted hover:text-danger"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="mt-1 flex h-20 w-full items-center justify-center gap-2 rounded-md border border-dashed border-black/15 bg-bg text-sm text-text-muted hover:border-waymarks-gold hover:text-waymarks-gold dark:border-white/15"
                >
                  <Upload size={14} aria-hidden />
                  Click to add PDF, PNG, or JPG
                </button>
              )}
              {fileError && (
                <p className="mt-1 text-xs text-danger">{fileError}</p>
              )}
              <p className="mt-1 text-[11px] text-text-faint">
                You can also add or replace the plan later from the floor's
                page.
              </p>
            </div>

            {stage.kind === 'error' && (
              <p className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">
                <AlertCircle size={12} aria-hidden className="mt-0.5 shrink-0" />
                <span>{stage.message}</span>
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                variant="gold"
                loading={busy}
              >
                {stage.kind === 'uploading' ? 'Uploading plan...' : 'Add floor'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function extFromMime(mime: string): string {
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
  return 'pdf';
}
