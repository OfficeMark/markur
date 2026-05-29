import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ExternalLinkButton } from './ExternalLinkButton';
import { useUpdateBuildingSettings } from '@/hooks/useBuildings';
import { getBuildingExternalLink, withExternalLink } from '@/lib/building-settings';
import type { Building } from '@/types/database';

/**
 * Admin editor for the building's configurable outbound link (Task 2, revised).
 * Writes `{ url, label }` into `buildings.settings.external_link`. Both fields are
 * required together: a URL with no button text fails validation; clearing the URL
 * removes the link. The live preview uses the same ExternalLinkButton the
 * customer sees, so there's one source of styling truth.
 */
const schema = z
  .object({
    url: z.string().trim().max(2048, 'That URL is too long.'),
    label: z.string().trim().max(80, 'Keep the button text short.'),
  })
  .refine((v) => v.url.length === 0 || v.label.length > 0, {
    message: 'Add button text to go with the link.',
    path: ['label'],
  });

type FormValues = z.infer<typeof schema>;

const fieldClass =
  'w-full rounded-md border border-black/15 bg-surface px-3 py-2 text-sm text-text outline-none placeholder:text-text-faint focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold/40 dark:border-white/15 dark:bg-white/5';

const previewClass =
  'h-8 rounded-md border border-waymarks-gold/40 bg-surface px-3 text-xs text-waymarks-gold dark:bg-white/5';

export function BuildingExternalLinkCard({ building }: { building: Building }) {
  const update = useUpdateBuildingSettings(building.id);
  const current = getBuildingExternalLink(building);
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { url: current?.url ?? '', label: current?.label ?? '' },
  });

  const url = watch('url');
  const label = watch('label');

  const onSubmit = handleSubmit(async (values) => {
    const link = values.url ? { url: values.url, label: values.label } : null;
    const updated = await update.mutateAsync(withExternalLink(building.settings, link));
    const saved = getBuildingExternalLink(updated);
    reset({ url: saved?.url ?? '', label: saved?.label ?? '' });
  });

  return (
    <section className="rounded-xl border border-black/10 bg-surface p-6 shadow-sm dark:border-white/10">
      <div className="mb-1 flex items-center gap-2">
        <Link2 size={16} className="text-waymarks-gold" aria-hidden />
        <h2 className="font-semibold text-lg text-text">Custom link</h2>
      </div>
      <p className="mb-4 max-w-prose text-sm text-text-muted">
        Add an outbound link for this building — an ordering portal, tenant handbook,
        service desk, intranet, anything. It appears as a button on the building card,
        the building header, and each asset's panel. Leave the URL empty to hide it.
      </p>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="ext-link-url" className="mb-1 block text-xs font-medium text-text-muted">
              Link URL
            </label>
            <input
              id="ext-link-url"
              type="text"
              placeholder="https://…"
              className={fieldClass}
              aria-invalid={errors.url ? 'true' : undefined}
              {...register('url')}
            />
            {errors.url && <p className="mt-1 text-xs text-danger">{errors.url.message}</p>}
          </div>
          <div>
            <label
              htmlFor="ext-link-label"
              className="mb-1 block text-xs font-medium text-text-muted"
            >
              Button text
            </label>
            <input
              id="ext-link-label"
              type="text"
              placeholder="Order signs"
              className={fieldClass}
              aria-invalid={errors.label ? 'true' : undefined}
              {...register('label')}
            />
            {errors.label && <p className="mt-1 text-xs text-danger">{errors.label.message}</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="gold" size="sm" loading={isSubmitting} disabled={!isDirty}>
            Save link
          </Button>
          <span className="text-xs text-text-faint">This will appear as:</span>
          {url.trim() && label.trim() ? (
            <ExternalLinkButton url={url} label={label} className={previewClass} />
          ) : (
            <span className="text-xs text-text-faint">— nothing yet</span>
          )}
        </div>

        {update.isError && (
          <p className="text-xs text-danger">Couldn't save the link. Please try again.</p>
        )}
      </form>
    </section>
  );
}
