import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileDown, ImageOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { FloorPlanCanvas } from '@/components/waymarks/FloorPlanCanvas';
import { PinOverlay } from '@/components/waymarks/PinOverlay';
import { AssetDrawer } from '@/components/waymarks/AssetDrawer';
import { useFloor } from '@/hooks/useFloors';
import { useAssets } from '@/hooks/useAssets';
import { planKindForPath, signedUrlForPlan } from '@/lib/upload';
import { logAccess } from '@/lib/queries/access-log';
import { listFirstPhotoPaths, signedAssetPhotoUrl } from '@/lib/queries/asset-photos';
import { photoToJpegDataUrl } from '@/lib/photo-to-data-url';
import {
  buildCatalogueDoc,
  catalogueDownloadName,
  pickCatalogueSaveTarget,
  prepareCatalogueEntries,
  writeCatalogue,
  type CatalogueEntry,
} from '@/lib/floor-catalogue';
import type { Asset, Building } from '@/types/database';

/**
 * Read-only floor view for a guest viewer. Reuses the exact map primitives
 * (FloorPlanCanvas in 'view' mode, PinOverlay with canMove=false, AssetDrawer
 * in guest mode) — no edit affordances, no audit/placing. Toolbar is just
 * "Back to floors" and the PDF catalogue export (which a guest may use).
 * Content-only: GuestBuilding owns the GuestLayout shell.
 */
export function GuestFloor({
  floorId,
  building,
  onBack,
}: {
  floorId: string;
  building: Building;
  onBack: () => void;
}) {
  const { data: floor, isLoading } = useFloor(floorId);
  const { data: assets = [] } = useAssets(floorId);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [signedUrlError, setSignedUrlError] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [catalogueState, setCatalogueState] = useState<'idle' | 'building' | 'error'>('idle');
  const [catalogueError, setCatalogueError] = useState<string | null>(null);

  const planKind = useMemo(() => planKindForPath(floor?.plan_url), [floor?.plan_url]);

  // Record the guest view.
  useEffect(() => {
    void logAccess('view', 'floor', floorId);
  }, [floorId]);

  // Resolve the signed plan URL whenever the plan changes.
  useEffect(() => {
    let cancelled = false;
    if (!floor?.plan_url) {
      setSignedUrl(null);
      return;
    }
    setSignedUrl(null);
    setSignedUrlError(null);
    void signedUrlForPlan(floor.plan_url)
      .then((url) => {
        if (!cancelled) setSignedUrl(url);
      })
      .catch((err) => {
        if (!cancelled) setSignedUrlError(err instanceof Error ? err.message : 'Could not load plan');
      });
    return () => {
      cancelled = true;
    };
  }, [floor?.plan_url]);

  function openAsset(a: Asset) {
    setSelectedAssetId(a.id);
    void logAccess('view', 'pin', a.id);
  }

  async function exportCatalogue() {
    if (!floor) return;
    setCatalogueError(null);
    const generatedOn = new Date();
    const fileName = catalogueDownloadName(building.name, floor.label, generatedOn);
    const target = await pickCatalogueSaveTarget(fileName);
    if (target.kind === 'cancelled') return;
    setCatalogueState('building');
    try {
      const drafts = prepareCatalogueEntries(assets);
      const photoPaths = await listFirstPhotoPaths(assets.map((a) => a.id));
      const entries: CatalogueEntry[] = await Promise.all(
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
      const addressLine =
        [building.address, building.city, building.region].filter(Boolean).join(', ') || null;
      const doc = buildCatalogueDoc({
        buildingName: building.name,
        floorLabel: floor.label,
        addressLine,
        generatedOn,
        entries,
      });
      await writeCatalogue(doc, target, fileName);
      setCatalogueState('idle');
    } catch (e) {
      setCatalogueError(e instanceof Error ? e.message : 'Could not build the catalogue.');
      setCatalogueState('error');
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 sm:py-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-sm text-text-muted hover:text-text"
        >
          <ArrowLeft size={14} aria-hidden /> All floors
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text">Floor {floor?.label ?? ''}</span>
          {assets.length > 0 && (
            <Button
              size="sm"
              variant="secondary"
              loading={catalogueState === 'building'}
              iconLeft={<FileDown size={12} aria-hidden />}
              onClick={() => void exportCatalogue()}
            >
              Catalogue
            </Button>
          )}
        </div>
      </div>

      {catalogueError && (
        <div className="mb-3 rounded-md border border-danger/30 bg-danger-bg p-3 text-xs text-danger">
          {catalogueError}
        </div>
      )}

      {isLoading ? (
        <div className="h-[60vh] animate-pulse rounded-xl border border-black/10 bg-surface dark:border-white/10" />
      ) : !floor?.plan_url ? (
        <EmptyState
          icon={<ImageOff size={32} aria-hidden />}
          title="No plan for this floor"
          description="This floor doesn't have a plan to view yet."
        />
      ) : signedUrlError ? (
        <div className="rounded-xl border border-danger/30 bg-danger-bg p-4 text-sm text-danger">
          Couldn't load plan: {signedUrlError}
        </div>
      ) : !signedUrl || !planKind ? (
        <div className="flex h-[60vh] items-center justify-center rounded-xl border border-black/10 bg-surface dark:border-white/10">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-waymarks-gold border-t-transparent" aria-hidden />
          <span className="sr-only">Loading plan…</span>
        </div>
      ) : (
        <FloorPlanCanvas
          src={signedUrl}
          kind={planKind}
          mode="view"
          pinOverlay={
            <PinOverlay
              assets={assets}
              selectedAssetId={selectedAssetId}
              canMove={false}
              onSelectAsset={openAsset}
              lastAuditByAsset={null}
            />
          }
        />
      )}

      <AssetDrawer
        assetId={selectedAssetId}
        floorId={floorId}
        buildingId={building.id}
        guest
        onOpenChange={(o) => {
          if (!o) setSelectedAssetId(null);
        }}
      />
    </div>
  );
}
