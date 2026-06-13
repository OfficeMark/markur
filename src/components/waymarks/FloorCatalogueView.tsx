import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileDown, ImageOff, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/Button';
import { colorForType } from '@/lib/pin-types';
import { listFirstPhotoPaths, signedAssetPhotoUrl } from '@/lib/queries/asset-photos';
import { photoToJpegDataUrl } from '@/lib/photo-to-data-url';
import {
  abortCatalogueTarget,
  buildCatalogueDoc,
  catalogueDownloadName,
  pickCatalogueSaveTarget,
  prepareCatalogueEntries,
  writeCatalogue,
  type CatalogueEntry,
} from '@/lib/floor-catalogue';
import { PlanProvenanceCaption } from '@/components/waymarks/PlanProvenanceCaption';
import { planProvenanceLabel } from '@/lib/plan-provenance';
import type { Asset, Building, Floor } from '@/types/database';

export type FloorCatalogueViewProps = {
  building: Building;
  floor: Floor;
  assets: Asset[];
  /** Back to the floor view. */
  onBack: () => void;
  generatedOn?: Date;
};

/**
 * On-screen catalogue: one card per sign (pin #, name, type, condition, photo),
 * ordered by pin number. Replaces the old "build a PDF and try to open it"
 * delivery — the page IS the deliverable; the PDF is now a deliberate Download,
 * and Print uses the browser. Shared by admin (a route) and guests (inline).
 */
export function FloorCatalogueView({
  building,
  floor,
  assets,
  onBack,
  generatedOn,
}: FloorCatalogueViewProps) {
  const entries = useMemo(() => prepareCatalogueEntries(assets), [assets]);
  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const [photoUrls, setPhotoUrls] = useState<Map<string, string>>(new Map());
  const [downloadState, setDownloadState] = useState<'idle' | 'building'>('idle');
  const [error, setError] = useState<string | null>(null);

  const addressLine =
    [building.address, building.city, building.region].filter(Boolean).join(', ') || null;

  // Load signed thumbnail URLs for the cards (display only; the PDF path loads
  // its own data URLs).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const paths = await listFirstPhotoPaths(assets.map((a) => a.id)).catch(
        () => new Map<string, string>()
      );
      const next = new Map<string, string>();
      for (const [id, path] of paths) {
        try {
          next.set(id, await signedAssetPhotoUrl(path));
        } catch {
          /* skip a photo that won't sign */
        }
      }
      if (!cancelled) setPhotoUrls(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [assets]);

  async function download() {
    setError(null);
    const when = generatedOn ?? new Date();
    const fileName = catalogueDownloadName(building.name, floor.label, when);
    const target = await pickCatalogueSaveTarget(fileName);
    if (target.kind === 'cancelled') return;
    setDownloadState('building');
    try {
      const drafts = prepareCatalogueEntries(assets);
      const photoPaths = await listFirstPhotoPaths(assets.map((a) => a.id));
      const full: CatalogueEntry[] = await Promise.all(
        drafts.map(async (d) => {
          let photoDataUrl: string | null = null;
          const path = photoPaths.get(d.assetId);
          if (path) {
            try {
              photoDataUrl = await photoToJpegDataUrl(await signedAssetPhotoUrl(path));
            } catch {
              photoDataUrl = null;
            }
          }
          return { ...d, photoDataUrl };
        })
      );
      const doc = buildCatalogueDoc({
        buildingName: building.name,
        floorLabel: floor.label,
        addressLine,
        generatedOn: when,
        entries: full,
        provenanceLabel: planProvenanceLabel(floor.plan_provenance),
      });
      await writeCatalogue(doc, target, fileName);
      setDownloadState('idle');
    } catch (e) {
      abortCatalogueTarget(target);
      setError(e instanceof Error ? e.message : 'Could not build the PDF.');
      setDownloadState('idle');
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-sm text-text-muted hover:text-text"
        >
          <ArrowLeft size={14} aria-hidden /> Back to floor
        </button>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" iconLeft={<Printer size={12} aria-hidden />} onClick={() => window.print()}>
            Print
          </Button>
          <Button
            size="sm"
            variant="gold"
            loading={downloadState === 'building'}
            iconLeft={<FileDown size={12} aria-hidden />}
            onClick={() => void download()}
          >
            Download PDF
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger print:hidden">
          {error}
        </div>
      )}

      <header className="mb-6 border-b border-black/10 pb-4 dark:border-white/10">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-waymarks-gold">
          Sign catalogue
        </p>
        <h1 className="mt-1 font-semibold text-2xl text-text sm:text-3xl">
          {building.name} — Floor {floor.label}
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          {addressLine ? `${addressLine} · ` : ''}
          {entries.length} {entries.length === 1 ? 'sign' : 'signs'} · {format(generatedOn ?? new Date(), 'PP')}
        </p>
        <PlanProvenanceCaption provenance={floor.plan_provenance} className="mt-1" />
      </header>

      {entries.length === 0 ? (
        <p className="text-sm text-text-muted">No signs on this floor yet.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {entries.map((e) => {
            const type = assetById.get(e.assetId)?.type ?? '';
            const url = photoUrls.get(e.assetId);
            return (
              <li
                key={e.assetId}
                className="flex gap-3 rounded-lg border border-black/10 bg-surface p-3 dark:border-white/10"
              >
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-black/10 bg-bg dark:border-white/10">
                  {url ? (
                    <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <ImageOff size={20} aria-hidden className="text-text-faint" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-text-faint">
                    <span>#{e.pinLabel}</span>
                    <span
                      aria-hidden
                      style={{ backgroundColor: colorForType(type) }}
                      className="inline-block h-2 w-2 rounded-full border border-white shadow-sm"
                    />
                    <span className="truncate normal-case tracking-normal">{e.typeLabel}</span>
                  </p>
                  <p className="mt-0.5 truncate font-medium text-text">{e.name}</p>
                  <p className="mt-0.5 text-xs text-text-muted">{e.conditionLabel}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
