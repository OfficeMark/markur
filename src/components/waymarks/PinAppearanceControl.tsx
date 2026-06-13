import { MapPin } from 'lucide-react';
import { PinMarker } from '@/components/waymarks/PinMarker';
import { PIN_SHAPES, PIN_SIZES, type PinShape, type PinSize } from '@/lib/queries/branding';

/**
 * Pin shape (circle / square / diamond / teardrop) + size (small/medium/large)
 * picker with a live preview. Salvaged from the old org-level /admin/branding
 * control (M26) and relocated to per-building settings. Each pick fires
 * `onChange` with the full appearance, so the parent persists immediately.
 */
export type PinAppearanceControlProps = {
  shape: PinShape;
  size: PinSize;
  onChange: (next: { pin_shape: PinShape; pin_size: PinSize }) => void;
  disabled?: boolean;
};

const BTN_BASE = 'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs capitalize disabled:opacity-50';
const BTN_ON = 'border-waymarks-ink bg-waymarks-ink/5 dark:border-white dark:bg-white/10';
const BTN_OFF = 'border-black/10 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5';

// Markur map-pin silhouette with a hollow centre (shared by the swatch + pin).
const TEARDROP_PATH =
  'M12 1.75a7.25 7.25 0 0 0-7.25 7.25c0 5.4 6.2 12.1 6.78 12.72a.64.64 0 0 0 .94 0c.58-.62 6.78-7.32 6.78-12.72A7.25 7.25 0 0 0 12 1.75Zm0 4.6a2.65 2.65 0 1 0 0 5.3 2.65 2.65 0 0 0 0-5.3Z';

export function PinAppearanceControl({ shape, size, onChange, disabled }: PinAppearanceControlProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
      <div className="space-y-3">
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
            Shape
          </p>
          <div className="flex flex-wrap gap-2">
            {PIN_SHAPES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ pin_shape: s, pin_size: size })}
                aria-pressed={shape === s}
                className={BTN_BASE + ' ' + (shape === s ? BTN_ON : BTN_OFF)}
              >
                <PinShapeSwatch shape={s} />
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
            Size
          </p>
          <div className="flex flex-wrap gap-2">
            {PIN_SIZES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ pin_shape: shape, pin_size: s })}
                aria-pressed={size === s}
                className={BTN_BASE + ' ' + (size === s ? BTN_ON : BTN_OFF)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      <PinAppearancePreview shape={shape} size={size} />
    </div>
  );
}

function PinShapeSwatch({ shape }: { shape: PinShape }) {
  if (shape === 'teardrop') {
    return (
      <svg width={14} height={14} viewBox="0 0 24 24" aria-hidden>
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d={TEARDROP_PATH}
          fill="#B8965A"
          stroke="white"
          strokeWidth="1.1"
        />
      </svg>
    );
  }
  const cls =
    shape === 'circle' ? 'rounded-full' : shape === 'square' ? 'rounded-sm' : 'rounded-[2px] rotate-45';
  return (
    <span
      aria-hidden
      className={'inline-block h-3.5 w-3.5 border border-white shadow-sm ' + cls}
      style={{ backgroundColor: '#B8965A' }}
    />
  );
}

function PinAppearancePreview({ shape, size }: { shape: PinShape; size: PinSize }) {
  // Three sample pins in the three statuses — confirms the flagged state stays
  // visible at the chosen shape/size.
  const samples: Array<{ id: string; status: 'good' | 'attention' | 'flagged'; label: string }> = [
    { id: 'preview-good', status: 'good', label: 'Good' },
    { id: 'preview-attention', status: 'attention', label: 'Audit due' },
    { id: 'preview-flagged', status: 'flagged', label: 'Flagged' },
  ];
  return (
    <div className="rounded-md border border-black/10 bg-bg p-4 dark:border-white/10">
      <p className="mb-3 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
        <MapPin size={11} aria-hidden /> Preview
      </p>
      <div className="flex items-center justify-around gap-6 px-4 py-6">
        {samples.map((s) => (
          <div key={s.id} className="flex flex-col items-center gap-3">
            <div className="relative h-10 w-10">
              <div className="absolute left-1/2 top-1/2">
                <PinMarker
                  assetId={s.id}
                  name={s.label}
                  type="directory"
                  status={s.status}
                  shape={shape}
                  size={size}
                />
              </div>
            </div>
            <span className="text-[11px] text-text-muted">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
