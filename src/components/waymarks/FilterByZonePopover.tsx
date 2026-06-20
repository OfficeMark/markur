import * as Popover from '@radix-ui/react-popover';
import { Check, Map as MapIcon, X } from 'lucide-react';

/**
 * Filter-by-zone popover. Unlike the type filter (which pulls from the org
 * catalog), zone values are whatever distinct "Zone or department" strings the
 * pins on THIS floor carry — so the option list is passed in by the floor.
 *
 * `selectedZones` is a Set of zone strings; the empty string '' represents
 * "No zone" (pins with a blank zone). An empty set behaves as "all visible".
 */

export const NO_ZONE = '' as const;

export type FilterByZonePopoverProps = {
  /** Distinct zone values present on the floor; '' (NO_ZONE) if any pin is unzoned. */
  zones: string[];
  selectedZones: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Optional custom trigger so the floor toolbar can render this as a segment. */
  trigger?: React.ReactNode;
};

export function FilterByZonePopover({
  zones,
  selectedZones,
  onChange,
  trigger,
}: FilterByZonePopoverProps) {
  const noneSelected = selectedZones.size === 0;
  const allSelected = zones.length > 0 && selectedZones.size === zones.length;
  const isFiltering = !noneSelected && !allSelected;

  function toggle(value: string) {
    const next = new Set(selectedZones);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        {trigger ?? (
          <button
            type="button"
            aria-label="Filter pins by zone"
            className={
              'inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors ' +
              (isFiltering
                ? 'border-waymarks-gold bg-waymarks-gold-soft text-waymarks-ink'
                : 'border-black/15 bg-surface text-text-muted hover:border-black/25 hover:text-text')
            }
          >
            <MapIcon size={12} aria-hidden />
            <span>Zone</span>
            {isFiltering && (
              <span className="rounded bg-waymarks-ink px-1 font-mono text-[10px] text-white">
                {selectedZones.size}
              </span>
            )}
          </button>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-[min(92vw,320px)] rounded-lg border border-black/10 bg-surface p-4 text-text shadow-sheet outline-none dark:border-white/10"
        >
          <header className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-text-faint">
              Filter by zone
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

          {zones.length === 0 ? (
            <p className="px-2 py-1 text-sm text-text-muted">
              No zones set on this floor yet. Add a zone in a pin's “Where it is”
              section and it'll appear here.
            </p>
          ) : (
            <ul className="max-h-64 space-y-0.5 overflow-y-auto">
              {zones.map((z) => {
                const isOn = selectedZones.has(z) || selectedZones.size === 0;
                return (
                  <li key={z || '__none__'}>
                    <button
                      type="button"
                      onClick={() => toggle(z)}
                      aria-pressed={isOn}
                      className="group flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <span
                        className={
                          'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ' +
                          (isOn
                            ? 'border-waymarks-ink bg-waymarks-ink text-white'
                            : 'border-black/20 bg-surface')
                        }
                        aria-hidden
                      >
                        {isOn && <Check size={10} aria-hidden />}
                      </span>
                      <span className={'flex-1 truncate ' + (z ? 'text-text' : 'italic text-text-muted')}>
                        {z || 'No zone'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {zones.length > 0 && (
            <footer className="mt-3 flex justify-between gap-2 border-t border-black/10 pt-3 dark:border-white/10">
              <button
                type="button"
                onClick={() => onChange(new Set(zones))}
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
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
