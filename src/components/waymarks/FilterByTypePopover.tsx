import * as Popover from '@radix-ui/react-popover';
import { Check, Filter, X } from 'lucide-react';
import { TYPE_LIST } from '@/lib/pin-types';

/**
 * Filter-by-type popover (M10c). Modeled on the original Waymarks prototype:
 * two columns (Signage / Facilities) of colored-dot checkboxes, plus All /
 * None shortcuts. Drives the visible-pins set on the Floor view.
 *
 * The selected set is a Set<string> of type values; an empty set behaves as
 * "all types visible" (no active filter). Parent wraps the active state.
 */

export type FilterByTypePopoverProps = {
  selectedTypes: Set<string>;
  onChange: (next: Set<string>) => void;
};

export function FilterByTypePopover({ selectedTypes, onChange }: FilterByTypePopoverProps) {
  const all = TYPE_LIST.map((t) => t.value);
  const signage = TYPE_LIST.filter((t) => t.category === 'signage');
  const facility = TYPE_LIST.filter((t) => t.category === 'facility');

  const noneSelected = selectedTypes.size === 0;
  const allSelected = selectedTypes.size === all.length;
  const isFiltering = !noneSelected && !allSelected;

  function toggle(value: string) {
    const next = new Set(selectedTypes);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Filter pins by type"
          className={
            'inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors ' +
            (isFiltering
              ? 'border-waymarks-gold bg-waymarks-gold-soft text-waymarks-ink'
              : 'border-black/15 bg-surface text-text-muted hover:border-black/25 hover:text-text dark:border-white/15')
          }
        >
          <Filter size={12} aria-hidden />
          <span>Filter</span>
          {isFiltering && (
            <span className="rounded bg-waymarks-ink px-1 font-mono text-[10px] text-white">
              {selectedTypes.size}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-[min(92vw,420px)] rounded-lg border border-black/10 bg-surface p-4 text-text shadow-sheet outline-none dark:border-white/10"
        >
          <header className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-text-faint">
              Filter by type
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

          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <Section label="Signage" items={signage} selected={selectedTypes} onToggle={toggle} />
            <Section label="Facilities" items={facility} selected={selectedTypes} onToggle={toggle} />
          </div>

          <footer className="mt-3 flex justify-between gap-2 border-t border-black/10 pt-3 dark:border-white/10">
            <button
              type="button"
              onClick={() => onChange(new Set(all))}
              className="inline-flex h-8 items-center rounded-md border border-black/10 px-3 text-xs font-medium text-text hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
            >
              All
            </button>
            <button
              type="button"
              onClick={() => onChange(new Set())}
              className="inline-flex h-8 items-center rounded-md border border-black/10 px-3 text-xs font-medium text-text hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
            >
              None
            </button>
          </footer>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Section({
  label,
  items,
  selected,
  onToggle,
}: {
  label: string;
  items: { value: string; label: string; fill: string }[];
  selected: Set<string>;
  onToggle: (value: string) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.22em] text-text-faint">
        {label}
      </p>
      <ul className="space-y-0.5">
        {items.map((t) => {
          const isOn = selected.has(t.value) || selected.size === 0;
          return (
            <li key={t.value}>
              <button
                type="button"
                onClick={() => onToggle(t.value)}
                aria-pressed={isOn}
                className="group flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
              >
                <span
                  className={
                    'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ' +
                    (isOn ? 'border-waymarks-ink bg-waymarks-ink text-white' : 'border-black/20 bg-surface dark:border-white/20')
                  }
                  aria-hidden
                >
                  {isOn && <Check size={10} aria-hidden />}
                </span>
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-white shadow-sm"
                  style={{ backgroundColor: t.fill }}
                />
                <span className="flex-1 truncate text-text">{t.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
