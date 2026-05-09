import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

/**
 * Free-text filter input for the floor view (M22 / #6).
 *
 * Controlled at the parent level, but debounces locally so the parent's
 * filter pipeline doesn't re-run on every keystroke. The debounced value
 * is what's actually used for filtering — `value` here is the immediate
 * input text so the field stays responsive.
 *
 * Substring matching itself lives in the parent (Floor.tsx) — this
 * component is only the input + clear-button UI.
 */
export type FilterByTextInputProps = {
  value: string;
  onChange: (next: string) => void;
  /** Milliseconds before the parent's onChange is called. Default 150. */
  debounceMs?: number;
  placeholder?: string;
};

export function FilterByTextInput({
  value,
  onChange,
  debounceMs = 150,
  placeholder = 'Filter by name, location, vendor…',
}: FilterByTextInputProps) {
  // Local mirror so the input stays responsive while we debounce upstream.
  const [local, setLocal] = useState(value);
  const lastEmittedRef = useRef(value);

  // If the parent resets the value (e.g. clears all filters), sync down.
  useEffect(() => {
    if (value !== lastEmittedRef.current) {
      setLocal(value);
      lastEmittedRef.current = value;
    }
  }, [value]);

  useEffect(() => {
    if (local === lastEmittedRef.current) return;
    const t = window.setTimeout(() => {
      lastEmittedRef.current = local;
      onChange(local);
    }, debounceMs);
    return () => window.clearTimeout(t);
  }, [local, debounceMs, onChange]);

  const showClear = local.length > 0;

  return (
    <div className="relative inline-flex h-7 items-center">
      <Search
        size={11}
        aria-hidden
        className="pointer-events-none absolute left-2 text-text-faint"
      />
      <input
        type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        aria-label="Filter pins by text"
        className="h-full w-44 rounded-md border border-black/15 bg-surface pl-7 pr-7 text-[11px] text-text outline-none placeholder:text-text-faint focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold/40 dark:border-white/15 dark:bg-white/5 sm:w-56"
      />
      {showClear && (
        <button
          type="button"
          aria-label="Clear text filter"
          onClick={() => setLocal('')}
          className="absolute right-1 inline-flex h-5 w-5 items-center justify-center rounded text-text-muted hover:bg-black/5 hover:text-text dark:hover:bg-white/10"
        >
          <X size={11} aria-hidden />
        </button>
      )}
    </div>
  );
}
