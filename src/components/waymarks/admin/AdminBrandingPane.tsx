import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Image as ImageIcon, MapPin, Save, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { PinMarker } from '@/components/waymarks/PinMarker';
import {
  useDeleteLogo,
  useOrgBranding,
  useSaveBranding,
  useUploadLogo,
} from '@/hooks/useBranding';
import {
  ACCENT_COLOR_PALETTE,
  DEFAULT_PIN_SHAPE,
  DEFAULT_PIN_SIZE,
  PIN_SHAPES,
  PIN_SIZES,
  validateLogoFile,
  type PinShape,
  type PinSize,
} from '@/lib/queries/branding';

/**
 * /admin/branding (M16) — functional branding pane.
 *
 * Lets a building admin upload an org logo, set an accent color, and
 * override how the org name appears in the app. Saved values flow into
 * the top-nav co-branding ("Markur · for [Org Name]") and the PDF export
 * header. Live preview shows how it'll look.
 */
export function AdminBrandingPane() {
  const branding = useOrgBranding();
  const save = useSaveBranding();
  const upload = useUploadLogo();
  const remove = useDeleteLogo();
  const fileInput = useRef<HTMLInputElement | null>(null);

  // Local form state, hydrated from server.
  const [displayName, setDisplayName] = useState('');
  const [accentColor, setAccentColor] = useState<string>(ACCENT_COLOR_PALETTE[0]!.value);
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [pinShape, setPinShape] = useState<PinShape>(DEFAULT_PIN_SHAPE);
  const [pinSize, setPinSize] = useState<PinSize>(DEFAULT_PIN_SIZE);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (branding.branding) {
      setDisplayName(branding.branding.display_name_override ?? '');
      setAccentColor(branding.branding.accent_color ?? ACCENT_COLOR_PALETTE[0]!.value);
      setLogoPath(branding.branding.logo_path ?? null);
      setPinShape(branding.branding.pin_shape);
      setPinSize(branding.branding.pin_size);
    }
  }, [branding.branding]);

  useEffect(() => {
    setPreviewUrl(branding.logoUrl);
  }, [branding.logoUrl]);

  async function onPickFile(file: File) {
    const validation = validateLogoFile(file);
    if (validation) {
      setError(validation);
      return;
    }
    if (!branding.orgId) {
      setError('No organization yet. Create a building first.');
      return;
    }
    setError(null);
    try {
      const result = await upload.mutateAsync({ orgId: branding.orgId, file });
      // Locally show the new logo immediately while we save the path.
      setLogoPath(result.path);
      // Build a preview from the uploaded file before the public URL
      // comes back (avoids a flicker).
      const reader = new FileReader();
      reader.onload = () => setPreviewUrl(reader.result as string);
      reader.readAsDataURL(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    }
  }

  async function onRemoveLogo() {
    if (!logoPath) return;
    setError(null);
    try {
      await remove.mutateAsync(logoPath);
      setLogoPath(null);
      setPreviewUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove logo.');
    }
  }

  async function onSave() {
    if (!branding.orgId) {
      setError('No organization yet. Create a building first.');
      return;
    }
    setError(null);
    try {
      await save.mutateAsync({
        org_id: branding.orgId,
        logo_path: logoPath,
        accent_color: accentColor,
        display_name_override: displayName.trim() || null,
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
    branding.branding.display_name_override !== (displayName.trim() || null) ||
    branding.branding.accent_color !== accentColor ||
    branding.branding.logo_path !== logoPath ||
    branding.branding.pin_shape !== pinShape ||
    branding.branding.pin_size !== pinSize;

  return (
    <div className="space-y-5">
      <header>
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
          <ImageIcon size={12} aria-hidden /> Branding
        </p>
        <h2 className="mt-1 font-semibold text-2xl">Brand Markur for your organization</h2>
        <p className="mt-1.5 text-sm text-text-muted">
          Upload your logo, pick an accent color, and choose how your
          organization name appears. Your team and your customers see your
          brand alongside Markur's.
        </p>
      </header>

      {!branding.orgId && (
        <p className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-bg px-3 py-2 text-xs text-warning">
          <AlertCircle size={12} aria-hidden className="mt-0.5 shrink-0" />
          <span>Create a building first — branding attaches to your organization.</span>
        </p>
      )}

      {error && (
        <p className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">
          <AlertCircle size={12} aria-hidden className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      <section className="rounded-lg border border-black/10 bg-surface p-5">
        <header className="mb-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
            Logo
          </p>
          <h3 className="mt-1 font-semibold text-base">Your organization's mark</h3>
          <p className="mt-1 text-xs text-text-muted">
            PNG, JPG, SVG, or WebP. Up to 2 MB. Looks best as a wordmark or
            small icon — it sits beside the Markur logo in the top nav.
          </p>
        </header>
        <div className="flex items-start gap-4">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-md border border-black/10 bg-bg dark:border-white/10">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Org logo preview"
                className="max-h-20 max-w-20 object-contain"
              />
            ) : (
              <ImageIcon size={28} aria-hidden className="text-text-faint" />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onPickFile(f);
                e.target.value = '';
              }}
            />
            <Button
              size="sm"
              variant="gold"
              loading={upload.isPending}
              iconLeft={<Upload size={12} aria-hidden />}
              onClick={() => fileInput.current?.click()}
              disabled={!branding.orgId}
            >
              {previewUrl ? 'Replace logo' : 'Upload logo'}
            </Button>
            {logoPath && (
              <Button
                size="sm"
                variant="secondary"
                iconLeft={<Trash2 size={12} aria-hidden />}
                onClick={() => void onRemoveLogo()}
                loading={remove.isPending}
              >
                Remove
              </Button>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-black/10 bg-surface p-5">
        <header className="mb-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
            Display name
          </p>
          <h3 className="mt-1 font-semibold text-base">How your name appears</h3>
          <p className="mt-1 text-xs text-text-muted">
            Optional. Leave blank to use your internal organization name.
            Appears as "Markur · for [name]" in the top nav.
          </p>
        </header>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={60}
          placeholder="e.g. ABC Donor Solutions"
          className="h-10 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-waymarks-ink outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold"
        />
      </section>

      <section className="rounded-lg border border-black/10 bg-surface p-5">
        <header className="mb-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
            Accent color
          </p>
          <h3 className="mt-1 font-semibold text-base">Brand accent</h3>
          <p className="mt-1 text-xs text-text-muted">
            Pick from the curated palette. Used for branded touchpoints
            (PDF exports, future invitation emails).
          </p>
        </header>
        <div className="flex flex-wrap gap-2">
          {ACCENT_COLOR_PALETTE.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setAccentColor(c.value)}
              aria-pressed={accentColor === c.value}
              title={c.label}
              className={
                'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs ' +
                (accentColor === c.value
                  ? 'border-waymarks-ink bg-waymarks-ink/5 dark:border-white dark:bg-white/10'
                  : 'border-black/10 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5')
              }
            >
              <span
                aria-hidden
                style={{ backgroundColor: c.value }}
                className="inline-block h-4 w-4 rounded-full border border-white shadow-sm"
              />
              {c.label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-black/10 bg-surface p-5">
        <header className="mb-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
            Pin appearance
          </p>
          <h3 className="mt-1 font-semibold text-base">How your asset pins look</h3>
          <p className="mt-1 text-xs text-text-muted">
            Pick the shape and size used on every floor plan. Status colors,
            type colors, and the audit ring stay the same regardless.
          </p>
        </header>

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
      </section>

      <section className="rounded-lg border border-waymarks-gold/30 bg-waymarks-gold-soft p-5">
        <header className="mb-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-waymarks-gold">
            Live preview
          </p>
          <h3 className="mt-1 font-semibold text-base text-waymarks-ink dark:text-white">
            How your top nav will look
          </h3>
        </header>
        <div className="rounded-md bg-waymarks-ink p-3 text-white">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-base tracking-wide">markur</span>
            <span className="text-xs text-white/55">by OfficeMark</span>
            {(displayName.trim() || previewUrl) && (
              <>
                <span className="mx-2 text-white/30">·</span>
                <span className="text-xs text-white/70">for</span>
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt=""
                    className="h-5 w-auto max-w-[80px] object-contain"
                  />
                )}
                {displayName.trim() && (
                  <span className="text-sm font-medium text-white">
                    {displayName.trim()}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      <div className="flex items-center justify-end gap-2">
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
          Save branding
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Helper components for the Pin appearance section
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
