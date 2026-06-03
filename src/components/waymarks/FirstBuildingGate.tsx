import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useCreateBuildingNoReturn } from '@/hooks/useBuildings';
import { usePermissions } from '@/lib/permissions-context';

/**
 * First-run onboarding (Phase 3). A brand-new org admin lands here instead of an
 * empty dashboard: the handle_new_user trigger gives every signup an
 * organization-scope building_admin grant, but no buildings exist yet.
 *
 * `useOrgPickerOptions` derives orgs from the user's *existing buildings*, so the
 * standard NewBuildingDialog can't resolve an org for a first-timer. Here we read
 * owner_org_id straight from the org-scope grant (the M24 contract:
 * set_building_owner_org requires it for an admin with no building-scoped grant
 * yet) and create the first building with it. The AFTER-INSERT trigger then mints
 * a building_admin grant on the new building, so every later building can go
 * through the normal dialog.
 */

const INPUT =
  'h-10 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10';

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(120, 'Up to 120 characters'),
  address: z.string().min(1, 'Street address is required').max(200, 'Up to 200 characters'),
  city: z.string().min(1, 'City is required').max(80, 'Up to 80 characters'),
  region: z.string().max(80, 'Up to 80 characters').optional(),
});
type FormValues = z.infer<typeof schema>;

export function FirstBuildingGate() {
  const { grants, refreshGrants } = usePermissions();
  const orgId = grants.find((g) => g.scope_type === 'organization')?.scope_id ?? null;
  const create = useCreateBuildingNoReturn();
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', address: '', city: '', region: '' },
  });

  async function onSubmit(values: FormValues) {
    setErrorMessage(null);
    if (!orgId) {
      setErrorMessage('We could not find your organization. Refresh the page and try again.');
      return;
    }
    try {
      // No RETURNING read-back: a brand-new admin can't read the row back under
      // the buildings SELECT policy until the AFTER-INSERT trigger mints their
      // building_admin grant. We insert, refresh grants (so the new grant lands
      // + the buildings list re-fetches), and route to Home, which now shows the
      // building — rather than relying on the returned row's id.
      await create.mutateAsync({
        name: values.name.trim(),
        address: values.address.trim(),
        city: values.city.trim(),
        region: values.region?.trim() || null,
        owner_org_id: orgId,
      });
      await refreshGrants();
      navigate('/');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Could not create the building. Try again.'
      );
    }
  }

  return (
    <section className="mx-auto max-w-xl rounded-xl border border-black/10 bg-surface p-6 shadow-sm sm:p-8 dark:border-white/10">
      <div className="mb-5 flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-waymarks-gold-soft text-waymarks-gold-deep">
          <Building2 size={18} aria-hidden />
        </div>
        <div>
          <h2 className="font-semibold text-2xl text-text">Create your first building</h2>
          <p className="mt-1 text-sm text-text-muted">
            This is where your signage lives. Add your first building to get started — floor
            plans, pins, and photos come next, once it's created.
          </p>
        </div>
      </div>

      <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-3" noValidate>
        <Field
          label="Building name"
          hint="What you call this building — e.g. 161 Bay St., Royal Bank Plaza, North Tower."
          error={errors.name?.message}
        >
          <input {...register('name')} type="text" autoComplete="organization" className={INPUT} />
        </Field>

        <Field label="Street address" error={errors.address?.message}>
          <input {...register('address')} type="text" autoComplete="street-address" className={INPUT} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="City" error={errors.city?.message}>
            <input {...register('city')} type="text" autoComplete="address-level2" className={INPUT} />
          </Field>
          <Field label="Province / state" hint="Optional" error={errors.region?.message}>
            <input {...register('region')} type="text" autoComplete="address-level1" className={INPUT} />
          </Field>
        </div>

        {errorMessage && (
          <p className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">
            <AlertCircle size={12} aria-hidden className="mt-0.5 shrink-0" />
            <span>{errorMessage}</span>
          </p>
        )}

        <div className="flex justify-end pt-1">
          <Button variant="gold" type="submit" loading={isSubmitting}>
            Create building
          </Button>
        </div>
      </form>
    </section>
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
      {hint && !error && <span className="block text-[11px] text-text-faint">{hint}</span>}
      {error && <span className="block text-[11px] text-danger">{error}</span>}
    </label>
  );
}
