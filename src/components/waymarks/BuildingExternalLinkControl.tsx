import { useEffect, useState } from 'react';
import { Check, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  DEFAULT_ORDER_LABEL,
  DEFAULT_ORDER_URL,
  type BuildingExternalLink,
  type ExternalLinkMode,
} from '@/lib/building-settings';
import { cn } from '@/lib/utils';

export type BuildingExternalLinkControlProps = {
  value: BuildingExternalLink;
  onSave: (link: { mode: ExternalLinkMode; label: string; url: string }) => void;
  saving?: boolean;
  savedAt?: number | null;
  disabled?: boolean;
};

const MODE_OPTIONS: { value: ExternalLinkMode; label: string; hint: string }[] = [
  { value: 'default', label: 'Officemark (default)', hint: 'The standard Order / Request button.' },
  { value: 'custom', label: 'Custom link', hint: 'Point it at your own portal.' },
  { value: 'hidden', label: 'Hidden', hint: 'No button on pins.' },
];

const BTN_ON = 'border-waymarks-ink bg-waymarks-ink/5 dark:border-white dark:bg-white/10';
const BTN_OFF = 'border-black/10 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5';

function isValidUrl(url: string): boolean {
  return /^https?:\/\/\S+/i.test(url.trim());
}

/**
 * Sets the per-building "Order signs" action: default (Officemark), a custom
 * label + URL, or hidden. Saved to buildings.settings via the parent. The
 * label/url fields need an explicit Save (unlike the per-click pin appearance),
 * so this control owns local draft state.
 */
export function BuildingExternalLinkControl({
  value,
  onSave,
  saving,
  savedAt,
  disabled,
}: BuildingExternalLinkControlProps) {
  const [mode, setMode] = useState<ExternalLinkMode>(value.mode);
  const [label, setLabel] = useState(value.label);
  const [url, setUrl] = useState(value.url);

  // Re-seed when the persisted value changes (e.g. after a save round-trips).
  useEffect(() => {
    setMode(value.mode);
    setLabel(value.label);
    setUrl(value.url);
  }, [value.mode, value.label, value.url]);

  const dirty = mode !== value.mode || label.trim() !== value.label || url.trim() !== value.url;
  const customInvalid = mode === 'custom' && !isValidUrl(url);
  const canSave = dirty && !customInvalid && !saving && !disabled;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {MODE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => setMode(opt.value)}
            aria-pressed={mode === opt.value}
            title={opt.hint}
            className={cn(
              'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs disabled:opacity-50',
              mode === opt.value ? BTN_ON : BTN_OFF
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {mode === 'custom' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
              Button label
            </span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={40}
              placeholder="e.g. Facilities portal"
              disabled={disabled}
              className="h-10 w-full rounded-md border border-black/10 bg-surface px-3 text-base text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
            />
          </label>
          <label className="block space-y-1">
            <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
              Link URL
            </span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              inputMode="url"
              placeholder="https://…"
              disabled={disabled}
              className="h-10 w-full rounded-md border border-black/10 bg-surface px-3 text-base text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
            />
          </label>
        </div>
      )}

      <p className="flex items-center gap-1.5 text-xs text-text-muted">
        <ExternalLink size={12} aria-hidden className="shrink-0 text-text-faint" />
        {mode === 'default'
          ? `Pins show "${DEFAULT_ORDER_LABEL}" → ${DEFAULT_ORDER_URL.replace(/^https?:\/\//, '')}`
          : mode === 'custom'
            ? customInvalid
              ? 'Enter a full URL starting with http:// or https://.'
              : `Pins show "${label.trim() || 'your link'}" → ${url.trim().replace(/^https?:\/\//, '') || '…'}`
            : 'Pins show no order/external button. A pin’s own vendor or contact link still appears.'}
      </p>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="gold"
          loading={saving}
          disabled={!canSave}
          iconLeft={<Check size={12} aria-hidden />}
          onClick={() => onSave({ mode, label: label.trim(), url: url.trim() })}
        >
          Save link
        </Button>
        {savedAt && !dirty && <span className="text-xs text-success">Saved</span>}
      </div>
    </div>
  );
}
