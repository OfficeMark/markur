import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useUpdateBuildingName } from '@/hooks/useBuildings';

/**
 * Rename a building (name only — address/city stay out of scope for now).
 * Opened from the pencil affordance on the building detail header. Admin-gated
 * in the caller (canConfigure, matching the buildings UPDATE RLS policy). The
 * name field mirrors NewBuildingDialog's rule: required, trimmed, ≤120 chars.
 */

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(120, 'Up to 120 characters'),
});

type FormValues = z.infer<typeof schema>;

export type EditBuildingNameDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildingId: string;
  currentName: string;
};

export function EditBuildingNameDialog({
  open,
  onOpenChange,
  buildingId,
  currentName,
}: EditBuildingNameDialogProps) {
  const update = useUpdateBuildingName(buildingId);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: currentName },
  });

  // Reset to the current name whenever the dialog opens so a prior edit or a
  // name changed elsewhere doesn't leave a stale value in the field.
  useEffect(() => {
    if (open) {
      reset({ name: currentName });
      setErrorMessage(null);
    }
  }, [open, currentName, reset]);

  async function onSubmit(values: FormValues) {
    setErrorMessage(null);
    const name = values.name.trim();
    // No-op if unchanged — just close.
    if (name === currentName.trim()) {
      onOpenChange(false);
      return;
    }
    try {
      await update.mutateAsync(name);
      onOpenChange(false);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Could not rename the building. Try again.'
      );
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby="edit-building-name-description"
          className="fixed left-1/2 top-1/2 z-50 w-[min(96vw,480px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-black/10 bg-surface p-5 text-text shadow-sheet outline-none"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-waymarks-gold-soft text-waymarks-gold-deep">
                <Pencil size={16} aria-hidden />
              </div>
              <div>
                <Dialog.Title className="font-semibold text-lg">Rename building</Dialog.Title>
                <p
                  id="edit-building-name-description"
                  className="mt-0.5 text-xs text-text-muted"
                >
                  Update the building name. This changes it everywhere — lists,
                  the building page, reports, and shared links.
                </p>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                aria-label="Close"
                className="rounded-md p-1 text-text-muted hover:bg-black/5"
              >
                <X size={16} aria-hidden />
              </button>
            </Dialog.Close>
          </div>

          <form
            onSubmit={(e) => {
              void handleSubmit(onSubmit)(e);
            }}
            className="space-y-3"
          >
            <label className="block space-y-1.5">
              <span className="block text-xs font-medium uppercase tracking-[0.18em] text-text-faint">
                Name
              </span>
              <input
                {...register('name')}
                type="text"
                // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: focuses the field when this focus-trapped dialog opens
                autoFocus
                autoComplete="organization"
                className="h-10 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold"
              />
              {errors.name?.message ? (
                <span className="block text-[11px] text-danger">{errors.name.message}</span>
              ) : (
                <span className="block text-[11px] text-text-faint">
                  What you call this building — e.g. 161 Bay St., Royal Bank Plaza, North Tower.
                </span>
              )}
            </label>

            {errorMessage && (
              <p className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">
                <AlertCircle size={12} aria-hidden className="mt-0.5 shrink-0" />
                <span>{errorMessage}</span>
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Dialog.Close asChild>
                <Button variant="secondary" disabled={isSubmitting}>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button variant="gold" type="submit" loading={isSubmitting}>
                Save name
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
