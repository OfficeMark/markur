import { useMemo, useState } from 'react';
import { AlertCircle, Plus, Tag, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useBuildings } from '@/hooks/useBuildings';
import {
  useAssetTypes,
  useCreateAssetType,
  useDeleteAssetType,
} from '@/hooks/useAssetTypes';
import type { AssetTypeCategory } from '@/lib/queries/asset-types';

/**
 * "Custom asset types" admin card on /settings (M11).
 *
 * Shows the merged catalog (global defaults + org-specific). Lets a
 * building admin add a new type for their organization and remove the
 * org-specific ones (globals show as locked - admins can't tweak the
 * shared baseline; only super_admin via the API can).
 *
 * The org_id is derived from the first building the user has admin on.
 * If they don't have any building yet, the card prompts them to create
 * one first (we cannot scope a custom type without an organization).
 */

const SWATCHES: Record<AssetTypeCategory, string[]> = {
  signage: [
    '#2563EB', // blue
    '#059669', // emerald
    '#16A34A', // green
    '#EA580C', // amber-orange
    '#DC2626', // red
    '#7C3AED', // violet
    '#BE185D', // magenta
    '#B45309', // bronze
  ],
  facility: [
    '#15803D', // forest
    '#334155', // dark slate
    '#6D28D9', // deep violet
    '#1F2937', // near-black
    '#0E7490', // teal
    '#854D0E', // umber
  ],
};

function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^([0-9])/, '_$1');
}

export function AssetTypesCard() {
  const { data: buildings } = useBuildings();
  const types = useAssetTypes();
  const create = useCreateAssetType();
  const remove = useDeleteAssetType();

  const orgId = useMemo(() => {
    if (!buildings) return null;
    const withOrg = buildings.find((b) => b.owner_org_id);
    return withOrg?.owner_org_id ?? null;
  }, [buildings]);

  const orgTypes = useMemo(
    () => types.list.filter((t) => t.org_id === orgId),
    [types.list, orgId]
  );
  const globalTypes = useMemo(
    () => types.list.filter((t) => t.org_id === null),
    [types.list]
  );

  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<AssetTypeCategory>('signage');
  const [color, setColor] = useState<string>(SWATCHES.signage[0]!);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setLabel('');
    setCategory('signage');
    setColor(SWATCHES.signage[0]!);
    setError(null);
  }

  async function onAdd() {
    if (!orgId) {
      setError('Create a building first - custom types attach to your organization.');
      return;
    }
    const trimmed = label.trim();
    if (trimmed.length < 2) {
      setError('Label must be at least 2 characters.');
      return;
    }
    const key = slugify(trimmed);
    if (!key) {
      setError('Please use letters and numbers in the label.');
      return;
    }
    setError(null);
    try {
      await create.mutateAsync({
        org_id: orgId,
        key,
        label: trimmed,
        color,
        category,
      });
      reset();
      setAdding(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not save the type. Try again.'
      );
    }
  }

  return (
    <section className="mt-5 rounded-lg border border-black/10 bg-surface p-5">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
            <Tag size={12} aria-hidden /> Custom asset types
          </p>
          <h2 className="mt-1 font-semibold text-lg">Asset types your team uses</h2>
          <p className="mt-1 text-xs text-text-muted">
            Add categories that match your business - donor plaques, memorial
            benches, public art, whatever you track. They show up in the Add
            Asset dropdown and the Filter popover for everyone in your
            organization.
          </p>
        </div>
        {!adding && (
          <Button
            size="sm"
            variant="gold"
            iconLeft={<Plus size={12} aria-hidden />}
            onClick={() => setAdding(true)}
            disabled={!orgId}
          >
            Add type
          </Button>
        )}
      </header>

      {!orgId && (
        <p className="mb-3 flex items-start gap-2 rounded-md border border-warning/30 bg-warning-bg px-3 py-2 text-xs text-warning">
          <AlertCircle size={12} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            You don't have an organization yet. Create a building first - we
            attach custom types to the organization that owns it.
          </span>
        </p>
      )}

      {adding && orgId && (
        <div className="mb-4 space-y-3 rounded-md border border-black/10 bg-bg p-3">
          <label className="block">
            <span className="block text-xs font-medium uppercase tracking-[0.18em] text-text-faint">
              Label
            </span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
              maxLength={60}
              placeholder="e.g. Memorial bench"
              className="mt-1 h-9 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold"
            />
            <span className="mt-1 block text-[11px] text-text-faint">
              Internal key: {label ? slugify(label) || '(needs letters)' : '(type a label)'}
            </span>
          </label>

          <fieldset>
            <legend className="block text-xs font-medium uppercase tracking-[0.18em] text-text-faint">
              Category
            </legend>
            <div role="radiogroup" className="mt-1 inline-flex rounded-md border border-black/10 p-0.5">
              {(['signage', 'facility'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={category === c}
                  onClick={() => {
                    setCategory(c);
                    setColor(SWATCHES[c][0]!);
                  }}
                  className={
                    'rounded-[5px] px-3 py-1 text-xs capitalize transition-colors ' +
                    (category === c
                      ? 'bg-waymarks-ink text-white'
                      : 'text-text-muted hover:text-text')
                  }
                >
                  {c}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="block text-xs font-medium uppercase tracking-[0.18em] text-text-faint">
              Pin color
            </legend>
            <div role="radiogroup" className="mt-1 flex flex-wrap gap-1.5">
              {SWATCHES[category].map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={`Color ${c}`}
                  onClick={() => setColor(c)}
                  style={{ backgroundColor: c }}
                  className={
                    'h-7 w-7 rounded-full border-2 transition-transform ' +
                    (color === c
                      ? 'border-waymarks-ink scale-110'
                      : 'border-transparent hover:scale-105')
                  }
                />
              ))}
            </div>
          </fieldset>

          {error && (
            <p className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">
              <AlertCircle size={12} aria-hidden className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                reset();
                setAdding(false);
              }}
              disabled={create.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="gold"
              loading={create.isPending}
              onClick={() => void onAdd()}
            >
              Save type
            </Button>
          </div>
        </div>
      )}

      {types.isLoading ? (
        <p className="text-xs text-text-faint">Loading...</p>
      ) : (
        <>
          {orgTypes.length > 0 && (
            <div className="mb-3">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
                Your organization's types
              </p>
              <ul className="space-y-1">
                {orgTypes.map((t) => (
                  <TypeRow
                    key={t.id}
                    color={t.color}
                    label={t.label}
                    category={t.category}
                    onDelete={() => void remove.mutate(t.id)}
                    busy={remove.isPending}
                  />
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
              Built-in defaults
            </p>
            <ul className="space-y-1">
              {globalTypes.map((t) => (
                <TypeRow
                  key={t.id}
                  color={t.color}
                  label={t.label}
                  category={t.category}
                  locked
                />
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}

function TypeRow({
  color,
  label,
  category,
  locked,
  busy,
  onDelete,
}: {
  color: string;
  label: string;
  category: string;
  locked?: boolean;
  busy?: boolean;
  onDelete?: () => void;
}) {
  return (
    <li className="flex items-center gap-3 rounded-md border border-black/5 bg-bg px-2 py-1.5 text-sm">
      <span
        aria-hidden
        className="inline-block h-3 w-3 shrink-0 rounded-full border border-white shadow-sm"
        style={{ backgroundColor: color }}
      />
      <span className="flex-1 truncate">{label}</span>
      <span className="text-[11px] uppercase tracking-[0.14em] text-text-faint">
        {category}
      </span>
      {!locked && onDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          aria-label={`Delete ${label}`}
          className="rounded p-1 text-text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"
        >
          <Trash2 size={12} aria-hidden />
        </button>
      )}
    </li>
  );
}
