import * as Popover from '@radix-ui/react-popover';
import { Search } from 'lucide-react';
import { FilterByTextInput } from './FilterByTextInput';

/**
 * Collapsed search: an icon button that opens a popover holding the free-text
 * filter input. Used below `lg`, where the inline search box would force the
 * toolbar to wrap/shrink. The trigger shows an active dot when a query is set.
 */
export function SearchPopover({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const active = value.trim().length > 0;
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Search pins"
          className={
            'relative inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ' +
            (active
              ? 'border-waymarks-gold bg-waymarks-gold-soft text-waymarks-ink'
              : 'border-black/15 bg-surface text-text-muted hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5')
          }
        >
          <Search size={15} aria-hidden />
          {active && (
            <span aria-hidden className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-waymarks-gold" />
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 rounded-lg border border-black/10 bg-surface p-2 shadow-sheet outline-none dark:border-white/10"
        >
          <FilterByTextInput value={value} onChange={onChange} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
