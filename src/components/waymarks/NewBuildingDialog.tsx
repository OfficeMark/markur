import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, Building2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useCreateBuilding } from '@/hooks/useBuildings';
import { usePermissions } from '@/lib/permissions-context';

/**
 * Add a building (M10h). Used from the BuildingNav sidebar's "New building"
 * CTA. The Postgres trigger in 0016 auto-grants the creator building_admin
 * on the new row, and we refresh the in-memory grants on success so the
 * AccessManagementCard / canEdit checks immediately reflect the new
 * permission. We then navigate to the new /buildings/:id route.
 *
 * Optional photo upload is deferred to M10h-photo (post-launch polish) -
 * users can add the hero photo from the Building view's existing
 * BuildingPhotoUpload component once they're inside.
 */

const schema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(120, 'Up to 120 characters'),
  address: z
    .string()
    .min(1, 'Street address is required')
    .max(200, 'Up to 200 characters'),
  city: z
    .string()
    .min(1, 'City is required')
    .max(80, 'Up to 80 characters'),
  region: z.string().max(80, 'Up to 80 characters').optional(),
});

type FormValues = z.infer<typeof schema>;

export type NewBuildingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function NewBuildingDialog({ open, onOpenChange }: NewBuildingDialogProps) {
  const create = useCreateBuilding();
  const { refreshGrants } = usePermissions();
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', address: '', city: '', region: '' },
  });

  // Reset the form whenever the dialog opens so a previous attempt's values
  // do not leak in.
  useEffect(() => {
    if (open) {
      reset({ name: '', address: '', city: '', region: '' });
      setErrorMessage(null);
    }
  }, [open, reset]);

  async function onSubmit(values: FormValues) {
    setErrorMessage(null);
    try {
      const b = await create.mutateAsync({
        name: values.name.trim(),
        address: values.address.trim(),
        city: values.city.trim(),
        region: values.region?.trim() || null,
      });
      // The trigger minted a building_admin grant for this user. Pull the
      // fresh grants into the in-memory context so subsequent useCan checks
      // return true without a page reload.
      await refreshGrants();
      onOpenChange(false);
      navigate(`/buildings/${b.id}`);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Could not create the building. Try again.'
      );
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby="new-building-description"
          className="fixed left-1/2 top-1/2 z-50 w-[min(96vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-black/10 bg-surface p-5 text-text shadow-sheet outline-none"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-waymarks-gold-soft text-waymarks-gold-deep">
                <Building2 size={16} aria-hidden />
              </div>
              <div>
                <Dialog.Title className="font-semibold text-lg">Add a building</Dialog.Title>
                <p
                  id="new-building-description"
                  className="mt-0.5 text-xs text-text-muted"
                >
                  You will be the first admin on this building. You can add a
                  hero photo, floor plans, and pins after it is created.
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
            <Field
              label="Name"
              hint="What you call this building - e.g. 161 Bay St., Royal Bank Plaza, North Tower."
              error={errors.name?.message}
            >
              <input
                {...register('name')}
                type="text"
                autoFocus
                autoComplete="organization"
                className="h-10 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold"
              />
            </Field>

            <Field label="Street address" error={errors.address?.message}>
              <input
                {...register('address')}
                type="text"
                autoComplete="street-address"
                className="h-10 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold"
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="City" error={errors.city?.message}>
                <input
                  {...register('city')}
                  type="text"
                  autoComplete="address-level2"
                  className="h-10 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold"
                />
              </Field>
              <Field
                label="Province / state"
                hint="Optional"
                error={errors.region?.message}
              >
                <input
                  {...register('region')}
                  type="text"
                  autoComplete="address-level1"
                  className="h-10 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold"
                />
              </Field>
            </div>

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
                Create building
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
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium uppercase tracking-[0.18em] text-text-faint">
        {label}
      </span>
      {children}
      {hint && !error && (
        <span className="block text-[11px] text-text-faint">{hint}</span>
      )}
      {error && (
        <span className="block text-[11px] text-danger">{error}</span>
      )}
    </label>
  );
}
