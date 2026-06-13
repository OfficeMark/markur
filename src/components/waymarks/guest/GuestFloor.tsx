import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileDown, ImageOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { FloorPlanCanvas } from '@/components/waymarks/FloorPlanCanvas';
import { PinOverlay } from '@/components/waymarks/PinOverlay';
import { AssetDrawer } from '@/components/waymarks/AssetDrawer';
import { PlanProvenanceCaption } from '@/components/waymarks/PlanProvenanceCaption';
import { useFloor } from '@/hooks/useFloors';
import { useAssets } from '@/hooks/useAssets';
import { useAssetTypes } from '@/hooks/useAssetTypes';
import { planKindForPath, signedUrlForPlan } from '@/lib/upload';
import { pinAppearanceFromSettings } from '@/lib/pin-appearance';
import { logAccess } from '@/lib/queries/access-log';
import { FloorCatalogueView } from '@/components/waymarks/FloorCatalogueView';
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
  // Resolve the asset-type catalogue for the VIEWED building's org, not the
  // (absent) guest session org — this populates the runtime colour/label map
  // so pins, the pin detail, and the PDF catalogue match the admin view.
  useAssetTypes(building.owner_org_id);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [signedUrlError, setSignedUrlError] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [view, setView] = useState<'floor' | 'catalogue'>('floor');

  const planKind = useMemo(() => planKindForPath(floor?.plan_url), [floor?.plan_url]);
  const pinAppearance = useMemo(() => pinAppearanceFromSettings(building.settings), [building.settings]);

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

  // Catalogue is its own view (cards + Print + Download PDF), shown in place of
  // the floor and dismissed back to it — no separate route in the guest SPA.
  if (view === 'catalogue' && floor) {
    return (
      <FloorCatalogueView
        building={building}
        floor={floor}
        assets={assets}
        onBack={() => setView('floor')}
      />
    );
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
              iconLeft={<FileDown size={12} aria-hidden />}
              onClick={() => setView('catalogue')}
            >
              Catalogue
            </Button>
          )}
        </div>
      </div>

      {floor?.plan_url && (
        <PlanProvenanceCaption provenance={floor.plan_provenance} className="mb-2" />
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
              pinShape={pinAppearance.pinShape}
              pinSize={pinAppearance.pinSize}
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
