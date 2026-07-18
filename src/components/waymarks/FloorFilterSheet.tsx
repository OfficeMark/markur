import * as Popover from '@radix-ui/react-popover';
import { Check, Filter, X } from 'lucide-react';
import { useAssetTypes } from '@/hooks/useAssetTypes';

/**
 * Phone-tier combined filter: a single "Filter" funnel button that opens a
 * popover with BOTH the Zone and Type facets (which sit as a segmented control
 * on larger screens). Keeps the toolbar to one short band on phones while
 * still exposing every facet. Same selection state as the segmented controls.
 */
export function FloorFilterSheet({
  zones,
  selectedZones,
  onZonesChange,
  selectedTypes,
  onTypesChange,
}: {
  zones: string[];
  selectedZones: Set<string>;
  onZonesChange: (next: Set<string>) => void;
  selectedTypes: Set<string>;
  onTypesChange: (next: Set<string>) => void;
}) {
  const { signage, facility, list } = useAssetTypes();
  const allTypeKeys = list.map((t) => t.key);
  const activeCount = selectedZones.size + selectedTypes.size;
  const isFiltering = activeCount > 0;

  function toggle<T>(set: Set<T>, value: T, apply: (n: Set<T>) => void) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    apply(next);
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Filter pins"
          className={
            'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ' +
            (isFiltering
              ? 'border-waymarks-gold bg-waymarks-gold-soft text-waymarks-ink'
              : 'border-black/15 bg-surface text-text-muted hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5')
          }
        >
          <Filter size={14} aria-hidden />
          {isFiltering && (
            <span className="rounded bg-waymarks-ink px-1 font-mono text-[10px] text-white">
              {activeCount}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 max-h-[70vh] w-[min(92vw,22rem)] overflow-y-auto rounded-lg border border-black/10 bg-surface p-4 text-text shadow-sheet outline-none dark:border-white/10"
        >
          <header className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-text-faint">
              Filter pins
            </p>
            <Popover.Close asChild>
              <button
                aria-label="Close filter"
                className="rounded-md p-1 text-text-muted hover:bg-black/5 dark:hover:bg-white/5"
              >
                <X size={14} aria-hidden />
              </button>
            </Popover.Close>
          </header>

          {/* Layer */}
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.22em] text-text-faint">
            Layer
          </p>
          {zones.length === 0 ? (
            <p className="px-2 pb-2 text-sm text-text-muted">No layers set on this floor yet.</p>
          ) : (
            <ul className="space-y-0.5">
              {zones.map((z) => {
                const on = selectedZones.has(z) || selectedZones.size === 0;
                return (
                  <li key={z || '__none__'}>
                    <Row
                      on={on}
                      onClick={() => toggle(selectedZones, z, onZonesChange)}
                      label={z || 'No layer'}
                      muted={!z}
                    />
                  </li>
                );
              })}
            </ul>
          )}

          {/* Type */}
          <p className="mb-1.5 mt-4 text-[10px] font-medium uppercase tracking-[0.22em] text-text-faint">
            Type
          </p>
          <div className="grid grid-cols-2 gap-x-4">
            <TypeCol label="Signage" items={signage} selected={selectedTypes} onToggle={(k) => toggle(selectedTypes, k, onTypesChange)} />
            <TypeCol label="Facilities" items={facility} selected={selectedTypes} onToggle={(k) => toggle(selectedTypes, k, onTypesChange)} />
          </div>

          <footer className="mt-3 flex justify-end gap-2 border-t border-black/10 pt-3 dark:border-white/10">
            <button
              type="button"
              onClick={() => {
                onZonesChange(new Set());
                onTypesChange(new Set());
              }}
              className="inline-flex h-8 items-center rounded-md border border-black/10 px-3 text-xs font-medium text-text hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
            >
              Clear all
            </button>
            <button
              type="button"
              onClick={() => {
                onZonesChange(new Set(zones));
                onTypesChange(new Set(allTypeKeys));
              }}
              className="inline-flex h-8 items-center rounded-md border border-black/10 px-3 text-xs font-medium text-text hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
            >
              Select all
            </button>
          </footer>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Row({
  on,
  onClick,
  label,
  muted,
  color,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  muted?: boolean;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="group flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
    >
      <span
        className={
          'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ' +
          (on ? 'border-waymarks-ink bg-waymarks-ink text-white' : 'border-black/20 bg-surface')
        }
        aria-hidden
      >
        {on && <Check size={10} aria-hidden />}
      </span>
      {color && (
        <span
          aria-hidden
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-white shadow-sm"
          style={{ backgroundColor: color }}
        />
      )}
      <span className={'flex-1 truncate ' + (muted ? 'italic text-text-muted' : 'text-text')}>{label}</span>
    </button>
  );
}

function TypeCol({
  label,
  items,
  selected,
  onToggle,
}: {
  label: string;
  items: { id: string; key: string; label: string; color: string }[];
  selected: Set<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-text-faint">{label}</p>
      <ul className="space-y-0.5">
        {items.map((t) => (
          <li key={t.id}>
            <Row
              on={selected.has(t.key) || selected.size === 0}
              onClick={() => onToggle(t.key)}
              label={t.label}
              color={t.color}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
