import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  RotateCcw,
  Tag,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  useAssetCountForType,
  useAssetTypes,
  useClearOverride,
  useCreateAssetType,
  useDeleteAssetType,
  useSetOverride,
  useUpdateAssetType,
} from '@/hooks/useAssetTypes';
import type {
  AssetTypeCategory,
  EffectiveAssetType,
} from '@/lib/queries/asset-types';

/**
 * "Custom asset types" admin card on /settings.
 *
 * M11: org admins could ADD org-specific types but the 17 globals were
 * locked.
 *
 * M14: org admins can hide / rename / recolor / reorder globals (via
 * the org_asset_type_overrides table) and edit (not just delete) their
 * org-specific rows. Globals themselves are never mutated; the hide/
 * rename/etc. is per-org and reversible with one click.
 */

const SWATCHES: Record<AssetTypeCategory, string[]> = {
  signage: [
    '#2563EB',
    '#059669',
    '#16A34A',
    '#EA580C',
    '#DC2626',
    '#7C3AED',
    '#BE185D',
    '#B45309',
    '#1E40AF',
    '#0D9488',
    '#92400E',
    '#9F1239',
  ],
  facility: [
    '#15803D',
    '#334155',
    '#6D28D9',
    '#1F2937',
    '#0E7490',
    '#854D0E',
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
  const types = useAssetTypes();
  const orgId = types.orgId;

  const create = useCreateAssetType();
  const update = useUpdateAssetType();
  const remove = useDeleteAssetType();
  const setOverride = useSetOverride();
  const clearOverride = useClearOverride();

  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<AssetTypeCategory>('signage');
  const [color, setColor] = useState<string>(SWATCHES.signage[0]!);
  const [error, setError] = useState<string | null>(null);
  const [reorderMode, setReorderMode] = useState(false);

  // Pending hide-confirm modal: which type are we about to hide / delete?
  const [pendingAction, setPendingAction] = useState<
    | null
    | {
        kind: 'hide' | 'delete-org-specific';
        type: EffectiveAssetType;
      }
  >(null);

  // Two derived lists — globals (incl overridden) and org-specific —
  // for the management UI. Keep their original ordering from the hook
  // (which respects sort_order) so reorder up/down stays consistent.
  const signageRows = useMemo(
    () => types.list.filter((t) => t.category === 'signage'),
    [types.list]
  );
  const facilityRows = useMemo(
    () => types.list.filter((t) => t.category === 'facility'),
    [types.list]
  );

  function resetAddForm() {
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
      resetAddForm();
      setAdding(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save the type. Try again.'
      );
    }
  }

  async function commitInlineEdit(
    row: EffectiveAssetType,
    patch: { label?: string; color?: string }
  ) {
    if (!orgId) return;
    if (row.source === 'org-specific' && row.org_specific_id) {
      // Update the row directly.
      await update.mutateAsync({
        id: row.org_specific_id,
        patch: {
          label: patch.label,
          color: patch.color,
        },
      });
      return;
    }
    // Global: write/refresh an override.
    await setOverride.mutateAsync({
      org_id: orgId,
      global_key: row.key,
      label_override:
        patch.label !== undefined && patch.label !== row.label
          ? patch.label
          : (types.raw.overrides.find((o) => o.global_key === row.key)
              ?.label_override ?? null),
      color_override:
        patch.color !== undefined && patch.color !== row.color
          ? patch.color
          : (types.raw.overrides.find((o) => o.global_key === row.key)
              ?.color_override ?? null),
      hidden: row.hidden,
      sort_order_override:
        types.raw.overrides.find((o) => o.global_key === row.key)
          ?.sort_order_override ?? null,
    });
  }

  async function moveRow(row: EffectiveAssetType, direction: -1 | 1) {
    // Find the row above/below in the SAME category. Swap their
    // effective sort_order values.
    const rows = (row.category === 'signage' ? signageRows : facilityRows).slice();
    const idx = rows.findIndex((r) => r.key === row.key);
    if (idx < 0) return;
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= rows.length) return;
    const a = rows[idx]!;
    const b = rows[swapIdx]!;

    // Compute new sort_orders: take the two effective sort_orders and
    // swap them. Each side gets stamped via setOverride or updateAssetType.
    const aNew = b.sort_order;
    const bNew = a.sort_order;

    await Promise.all([
      writeSortOrder(a, aNew),
      writeSortOrder(b, bNew),
    ]);
  }

  async function writeSortOrder(row: EffectiveAssetType, newSort: number) {
    if (!orgId) return;
    if (row.source === 'org-specific' && row.org_specific_id) {
      await update.mutateAsync({
        id: row.org_specific_id,
        patch: { sort_order: newSort },
      });
      return;
    }
    const existingOverride = types.raw.overrides.find(
      (o) => o.global_key === row.key
    );
    await setOverride.mutateAsync({
      org_id: orgId,
      global_key: row.key,
      hidden: existingOverride?.hidden ?? row.hidden,
      label_override: existingOverride?.label_override ?? null,
      color_override: existingOverride?.color_override ?? null,
      sort_order_override: newSort,
    });
  }

  async function toggleHide(row: EffectiveAssetType) {
    if (!orgId) return;
    if (row.hidden) {
      // Already hidden - just unhide. No confirm needed.
      const existingOverride = types.raw.overrides.find(
        (o) => o.global_key === row.key
      );
      await setOverride.mutateAsync({
        org_id: orgId,
        global_key: row.key,
        hidden: false,
        label_override: existingOverride?.label_override ?? null,
        color_override: existingOverride?.color_override ?? null,
        sort_order_override: existingOverride?.sort_order_override ?? null,
      });
      return;
    }
    // Hiding - open confirm with assigned-asset count.
    setPendingAction({ kind: 'hide', type: row });
  }

  async function confirmHide(row: EffectiveAssetType) {
    if (!orgId) return;
    const existingOverride = types.raw.overrides.find(
      (o) => o.global_key === row.key
    );
    await setOverride.mutateAsync({
      org_id: orgId,
      global_key: row.key,
      hidden: true,
      label_override: existingOverride?.label_override ?? null,
      color_override: existingOverride?.color_override ?? null,
      sort_order_override: existingOverride?.sort_order_override ?? null,
    });
    setPendingAction(null);
  }

  async function resetOverride(row: EffectiveAssetType) {
    if (!orgId) return;
    await clearOverride.mutateAsync({ orgId, globalKey: row.key });
  }

  async function confirmDelete(row: EffectiveAssetType) {
    if (!row.org_specific_id) return;
    await remove.mutateAsync(row.org_specific_id);
    setPendingAction(null);
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
            Hide, rename, recolor, or reorder any of the built-in types for
            your organization, or add your own. Changes only affect your team.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {!adding && (
            <Button
              size="sm"
              variant="gold"
              iconLeft={<Plus size={12} aria-hidden />}
              onClick={() => setAdding(true)}
              disabled={!orgId}
              className="whitespace-nowrap"
            >
              Add type
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setReorderMode((v) => !v)}
            disabled={!orgId}
          >
            {reorderMode ? 'Done reordering' : 'Reorder'}
          </Button>
        </div>
      </header>

      {!orgId && (
        <p className="mb-3 flex items-start gap-2 rounded-md border border-warning/30 bg-warning-bg px-3 py-2 text-xs text-warning">
          <AlertCircle size={12} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            You don't have an organization yet. Create a building first - we
            attach customizations to the organization that owns it.
          </span>
        </p>
      )}

      {adding && orgId && (
        <AddTypeForm
          label={label}
          setLabel={setLabel}
          category={category}
          setCategory={setCategory}
          color={color}
          setColor={setColor}
          error={error}
          busy={create.isPending}
          onSave={() => void onAdd()}
          onCancel={() => {
            resetAddForm();
            setAdding(false);
          }}
        />
      )}

      {types.isLoading ? (
        <p className="text-xs text-text-faint">Loading...</p>
      ) : (
        <>
          <CategorySection
            heading="Signage"
            rows={signageRows}
            reorderMode={reorderMode}
            onMove={moveRow}
            onToggleHide={toggleHide}
            onCommitEdit={commitInlineEdit}
            onResetOverride={resetOverride}
            onRequestDelete={(row) =>
              setPendingAction({ kind: 'delete-org-specific', type: row })
            }
          />
          <CategorySection
            heading="Facility"
            rows={facilityRows}
            reorderMode={reorderMode}
            onMove={moveRow}
            onToggleHide={toggleHide}
            onCommitEdit={commitInlineEdit}
            onResetOverride={resetOverride}
            onRequestDelete={(row) =>
              setPendingAction({ kind: 'delete-org-specific', type: row })
            }
          />
        </>
      )}

      {pendingAction && orgId && (
        <ConfirmAffectedDialog
          orgId={orgId}
          row={pendingAction.type}
          kind={pendingAction.kind}
          onCancel={() => setPendingAction(null)}
          onConfirm={() =>
            pendingAction.kind === 'hide'
              ? void confirmHide(pendingAction.type)
              : void confirmDelete(pendingAction.type)
          }
        />
      )}
    </section>
  );
}

// ===========================================================================

function AddTypeForm(props: {
  label: string;
  setLabel: (v: string) => void;
  category: AssetTypeCategory;
  setCategory: (v: AssetTypeCategory) => void;
  color: string;
  setColor: (v: string) => void;
  error: string | null;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { label, setLabel, category, setCategory, color, setColor, error, busy } =
    props;
  return (
    <div className="mb-4 space-y-3 rounded-md border border-black/10 bg-bg p-3">
      <label className="block">
        <span className="block text-xs font-medium uppercase tracking-[0.18em] text-text-faint">
          Label
        </span>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: focuses the field when this inline editor opens
          autoFocus
          maxLength={60}
          placeholder="e.g. Memorial bench"
          className="mt-1 h-9 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-waymarks-ink outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold"
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
        <Button size="sm" variant="secondary" onClick={props.onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button size="sm" variant="gold" loading={busy} onClick={props.onSave}>
          Save type
        </Button>
      </div>
    </div>
  );
}

// ===========================================================================

function CategorySection(props: {
  heading: string;
  rows: EffectiveAssetType[];
  reorderMode: boolean;
  onMove: (row: EffectiveAssetType, direction: -1 | 1) => void | Promise<void>;
  onToggleHide: (row: EffectiveAssetType) => void | Promise<void>;
  onCommitEdit: (
    row: EffectiveAssetType,
    patch: { label?: string; color?: string }
  ) => void | Promise<void>;
  onResetOverride: (row: EffectiveAssetType) => void | Promise<void>;
  onRequestDelete: (row: EffectiveAssetType) => void;
}) {
  const { heading, rows, reorderMode } = props;
  if (rows.length === 0) return null;
  return (
    <div className="mb-3">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
        {heading}
      </p>
      <ul className="space-y-1">
        {rows.map((t, idx) => (
          <TypeRow
            key={t.key}
            row={t}
            isFirst={idx === 0}
            isLast={idx === rows.length - 1}
            reorderMode={reorderMode}
            onMove={props.onMove}
            onToggleHide={props.onToggleHide}
            onCommitEdit={props.onCommitEdit}
            onResetOverride={props.onResetOverride}
            onRequestDelete={props.onRequestDelete}
          />
        ))}
      </ul>
    </div>
  );
}

// ===========================================================================

function TypeRow(props: {
  row: EffectiveAssetType;
  isFirst: boolean;
  isLast: boolean;
  reorderMode: boolean;
  onMove: (row: EffectiveAssetType, direction: -1 | 1) => void | Promise<void>;
  onToggleHide: (row: EffectiveAssetType) => void | Promise<void>;
  onCommitEdit: (
    row: EffectiveAssetType,
    patch: { label?: string; color?: string }
  ) => void | Promise<void>;
  onResetOverride: (row: EffectiveAssetType) => void | Promise<void>;
  onRequestDelete: (row: EffectiveAssetType) => void;
}) {
  const { row, isFirst, isLast, reorderMode } = props;
  const [editing, setEditing] = useState<'none' | 'label' | 'color'>('none');
  const [draftLabel, setDraftLabel] = useState(row.label);
  const isOverridden = row.source === 'global-overridden';
  const isOrgSpecific = row.source === 'org-specific';

  function startLabelEdit() {
    setDraftLabel(row.label);
    setEditing('label');
  }

  async function commitLabel() {
    const trimmed = draftLabel.trim();
    if (trimmed.length === 0 || trimmed === row.label) {
      setEditing('none');
      return;
    }
    await props.onCommitEdit(row, { label: trimmed });
    setEditing('none');
  }

  return (
    <li
      className={
        'flex items-center gap-2 rounded-md border border-black/5 bg-bg px-2 py-1.5 text-sm ' +
        (row.hidden ? 'opacity-50' : '')
      }
    >
      {/* color swatch / picker */}
      <button
        type="button"
        onClick={() => setEditing(editing === 'color' ? 'none' : 'color')}
        aria-label={`Change color for ${row.label}`}
        className="inline-block h-4 w-4 shrink-0 rounded-full border border-white shadow-sm transition-transform hover:scale-110"
        style={{ backgroundColor: row.color }}
      />

      {/* color picker popover (inline) */}
      {editing === 'color' && (
        <div className="flex flex-wrap gap-1">
          {SWATCHES[row.category].map((c) => (
            <button
              key={c}
              type="button"
              onClick={async () => {
                await props.onCommitEdit(row, { color: c });
                setEditing('none');
              }}
              aria-label={`Set color ${c}`}
              style={{ backgroundColor: c }}
              className={
                'h-5 w-5 rounded-full border-2 ' +
                (c === row.color ? 'border-waymarks-ink' : 'border-transparent')
              }
            />
          ))}
        </div>
      )}

      {/* label / inline edit */}
      {editing === 'label' ? (
        <input
          // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: focuses the field when this inline editor opens
          autoFocus
          value={draftLabel}
          onChange={(e) => setDraftLabel(e.target.value)}
          onBlur={() => void commitLabel()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commitLabel();
            if (e.key === 'Escape') {
              setDraftLabel(row.label);
              setEditing('none');
            }
          }}
          maxLength={60}
          className="h-6 flex-1 rounded border border-black/10 bg-surface px-2 text-sm outline-none focus:border-waymarks-gold focus:ring-1 focus:ring-waymarks-gold"
        />
      ) : (
        <button
          type="button"
          onClick={startLabelEdit}
          className="flex-1 truncate text-left hover:underline"
        >
          {row.label}
        </button>
      )}

      {/* badges */}
      {isOverridden && (
        <span className="rounded-full bg-waymarks-gold/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-waymarks-gold">
          edited
        </span>
      )}
      {isOrgSpecific && (
        <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
          custom
        </span>
      )}
      {row.hidden && (
        <span className="rounded-full bg-text-muted/20 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
          hidden
        </span>
      )}

      {/* actions: reorder mode swaps controls for arrows */}
      {reorderMode ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void props.onMove(row, -1)}
            disabled={isFirst}
            aria-label="Move up"
            className="rounded p-1 text-text-muted hover:bg-black/5 hover:text-text disabled:opacity-30"
          >
            <ArrowUp size={12} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => void props.onMove(row, 1)}
            disabled={isLast}
            aria-label="Move down"
            className="rounded p-1 text-text-muted hover:bg-black/5 hover:text-text disabled:opacity-30"
          >
            <ArrowDown size={12} aria-hidden />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={startLabelEdit}
            aria-label={`Rename ${row.label}`}
            className="rounded p-1 text-text-muted hover:bg-black/5 hover:text-text"
          >
            <Pencil size={12} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => void props.onToggleHide(row)}
            aria-label={row.hidden ? `Show ${row.label}` : `Hide ${row.label}`}
            className="rounded p-1 text-text-muted hover:bg-black/5 hover:text-text"
          >
            {row.hidden ? (
              <Eye size={12} aria-hidden />
            ) : (
              <EyeOff size={12} aria-hidden />
            )}
          </button>
          {isOverridden && (
            <button
              type="button"
              onClick={() => void props.onResetOverride(row)}
              aria-label={`Reset ${row.label} to default`}
              className="rounded p-1 text-text-muted hover:bg-black/5 hover:text-text"
            >
              <RotateCcw size={12} aria-hidden />
            </button>
          )}
          {isOrgSpecific && (
            <button
              type="button"
              onClick={() => props.onRequestDelete(row)}
              aria-label={`Delete ${row.label}`}
              className="rounded p-1 text-text-muted hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 size={12} aria-hidden />
            </button>
          )}
        </div>
      )}
    </li>
  );
}

// ===========================================================================

function ConfirmAffectedDialog(props: {
  orgId: string;
  row: EffectiveAssetType;
  kind: 'hide' | 'delete-org-specific';
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const count = useAssetCountForType(props.orgId, props.row.key);
  const verb = props.kind === 'hide' ? 'Hide' : 'Delete';
  const aftermath =
    props.kind === 'hide'
      ? "Existing assets of this type will keep showing on floor plans, but you won't be able to create new ones."
      : "This will remove the type from your catalog. Existing assets of this type will keep their type label but won't be selectable for new ones.";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-lg border border-black/10 bg-surface p-5 shadow-lg">
        <h3 className="font-semibold text-lg">
          {verb} "{props.row.label}"?
        </h3>
        <p className="mt-2 text-sm text-text-muted">{aftermath}</p>
        <p className="mt-3 text-sm">
          {count.isLoading ? (
            <span className="text-text-faint">Counting affected assets...</span>
          ) : count.data === -1 ? (
            <span className="text-warning">
              Could not count affected assets. Proceed only if you're sure.
            </span>
          ) : count.data === 0 ? (
            <span className="text-text-muted">
              No existing assets use this type.
            </span>
          ) : (
            <span>
              <strong>{count.data}</strong> existing asset
              {count.data === 1 ? '' : 's'} use this type and will remain on
              your floor plans.
            </span>
          )}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={props.onCancel}>
            Cancel
          </Button>
          <Button size="sm" variant="danger" onClick={props.onConfirm}>
            {verb}
          </Button>
        </div>
      </div>
    </div>
  );
}
