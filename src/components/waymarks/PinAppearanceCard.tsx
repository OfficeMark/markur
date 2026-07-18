import { useEffect, useState } from 'react';
import { AlertCircle, Check, MapPin, Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { PinMarker } from '@/components/waymarks/PinMarker';
import { useOrgBranding, useSaveBranding } from '@/hooks/useBranding';
import {
  DEFAULT_PIN_SHAPE,
  DEFAULT_PIN_SIZE,
  PIN_SHAPES,
  PIN_SIZES,
  type PinShape,
  type PinSize,
} from '@/lib/queries/branding';

/**
 * Pin appearance card — shape + size for every asset pin on a floor plan.
 *
 * Lives on /admin/asset-types (alongside the asset-type catalog) since it's
 * about how assets look on the map, not co-branding. Storage is unchanged:
 * pin_shape / pin_size still live on the org_branding row. Because that row
 * is upserted whole, we preserve the other branding fields (logo, accent,
 * display name) on save so editing pins here never wipes them.
 */
export function PinAppearanceCard() {
  const branding = useOrgBranding();
  const save = useSaveBranding();

  const [pinShape, setPinShape] = useState<PinShape>(DEFAULT_PIN_SHAPE);
  const [pinSize, setPinSize] = useState<PinSize>(DEFAULT_PIN_SIZE);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (branding.branding) {
      setPinShape(branding.branding.pin_shape);
      setPinSize(branding.branding.pin_size);
    }
  }, [branding.branding]);

  async function onSave() {
    if (!branding.orgId) {
      setError('No organization yet. Create a building first.');
      return;
    }
    setError(null);
    try {
      await save.mutateAsync({
        org_id: branding.orgId,
        // The org_branding row is upserted whole — carry the existing
        // branding fields through so a pin edit never clears them.
        logo_path: branding.branding?.logo_path ?? null,
        accent_color: branding.branding?.accent_color ?? null,
        display_name_override: branding.branding?.display_name_override ?? null,
        pin_shape: pinShape,
        pin_size: pinSize,
      });
      setSavedAt(Date.now());
      window.setTimeout(() => setSavedAt(null), 2400);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    }
  }

  const dirty =
    branding.branding === null ||
    branding.branding.pin_shape !== pinShape ||
    branding.branding.pin_size !== pinSize;

  return (
    <section className="mt-5 rounded-lg border border-black/10 bg-surface p-5">
      <header className="mb-3">
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
          <MapPin size={12} aria-hidden /> Pin appearance
        </p>
        <h2 className="mt-1 font-semibold text-lg">How your asset pins look</h2>
        <p className="mt-1 text-xs text-text-muted">
          Pick the shape and size used on every floor plan. Status colors,
          type colors, and the audit ring stay the same regardless.
        </p>
      </header>

      {!branding.orgId && (
        <p className="mb-3 flex items-start gap-2 rounded-md border border-warning/30 bg-warning-bg px-3 py-2 text-xs text-warning">
          <AlertCircle size={12} aria-hidden className="mt-0.5 shrink-0" />
          <span>Create a building first — pin appearance attaches to your organization.</span>
        </p>
      )}

      {error && (
        <p className="mb-3 flex items-start gap-2 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">
          <AlertCircle size={12} aria-hidden className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}

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
                  onClick={() => setPinShape(s)}
                  aria-pressed={pinShape === s}
                  className={
                    'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs capitalize ' +
                    (pinShape === s
                      ? 'border-waymarks-ink bg-waymarks-ink/5 dark:border-white dark:bg-white/10'
                      : 'border-black/10 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5')
                  }
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
                  onClick={() => setPinSize(s)}
                  aria-pressed={pinSize === s}
                  className={
                    'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs capitalize ' +
                    (pinSize === s
                      ? 'border-waymarks-ink bg-waymarks-ink/5 dark:border-white dark:bg-white/10'
                      : 'border-black/10 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5')
                  }
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <PinAppearancePreview shape={pinShape} size={pinSize} />
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        {savedAt && (
          <span className="inline-flex items-center gap-1 text-xs text-success">
            <Check size={12} aria-hidden /> Saved
          </span>
        )}
        <Button
          variant="gold"
          loading={save.isPending}
          disabled={!dirty || !branding.orgId}
          iconLeft={<Save size={12} aria-hidden />}
          onClick={() => void onSave()}
        >
          Save pin appearance
        </Button>
      </div>
    </section>
  );
}

// =============================================================================
// Helper components
// =============================================================================

function PinShapeSwatch({ shape }: { shape: PinShape }) {
  const cls =
    shape === 'circle'
      ? 'rounded-full'
      : shape === 'square'
        ? 'rounded-sm'
        : 'rounded-[2px] rotate-45';
  return (
    <span
      aria-hidden
      className={'inline-block h-3.5 w-3.5 border border-white shadow-sm ' + cls}
      style={{ backgroundColor: '#B8965A' }}
    />
  );
}

function PinAppearancePreview({ shape, size }: { shape: PinShape; size: PinSize }) {
  // Three sample pins in the three statuses, rendered with the chosen
  // shape/size against a tile-textured backdrop reminiscent of a floor plan.
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
