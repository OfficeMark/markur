import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ImageOff, Plus, RefreshCw } from 'lucide-react';
import { AppShell } from '@/components/waymarks/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { FloorPlanCanvas } from '@/components/waymarks/FloorPlanCanvas';
import { FloorPlanUploadDialog } from '@/components/waymarks/FloorPlanUploadDialog';
import { PinOverlay } from '@/components/waymarks/PinOverlay';
import { NewAssetDialog } from '@/components/waymarks/NewAssetDialog';
import { AssetDrawer } from '@/components/waymarks/AssetDrawer';
import { useFloor } from '@/hooks/useFloors';
import { useBuilding } from '@/hooks/useBuildings';
import { useAssets, useUpdateAsset } from '@/hooks/useAssets';
import { useCan } from '@/lib/permissions-context';
import { planKindForPath, signedUrlForPlan } from '@/lib/upload';
import type { Asset } from '@/types/database';

export function Floor() {
  const { id } = useParams<{ id: string }>();
  const { data: floor, isLoading: fLoading, error: fError } = useFloor(id);
  const { data: building } = useBuilding(floor?.building_id);
  const { data: assets = [] } = useAssets(id);

  const canUploadPlan = useCan('upload_plan', { type: 'building', id: floor?.building_id ?? '' });
  const canCreate = useCan('create', { type: 'building', id: floor?.building_id ?? '' });
  const canEdit = useCan('edit', { type: 'building', id: floor?.building_id ?? '' });
  const updateAsset = useUpdateAsset(id);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [signedUrlError, setSignedUrlError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placePos, setPlacePos] = useState<{ x: number; y: number } | null>(null);
  const [newAssetOpen, setNewAssetOpen] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  // Resolve a signed URL whenever the plan_url changes.
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
        if (!cancelled) {
          setSignedUrlError(err instanceof Error ? err.message : 'Could not load plan URL');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [floor?.plan_url]);

  // Esc cancels placing mode.
  useEffect(() => {
    if (!placing) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPlacing(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placing]);

  const planKind = useMemo(() => planKindForPath(floor?.plan_url), [floor?.plan_url]);

  if (fLoading) return <Skeleton />;

  if (fError || !floor) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
          <h1 className="font-serif text-2xl">Floor not found</h1>
          <p className="mt-2 text-sm text-text-muted">
            It may have been removed or you may not have access.
          </p>
          <Link
            to="/"
            className="mt-4 inline-flex items-center gap-1 text-sm text-waymarks-gold hover:underline"
          >
            <ArrowLeft size={14} aria-hidden /> Back to buildings
          </Link>
        </div>
      </AppShell>
    );
  }

  const buildingId = floor.building_id;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <Link
          to={`/buildings/${floor.building_id}`}
          className="mb-4 inline-flex items-center gap-1 text-xs text-text-muted hover:text-text"
        >
          <ArrowLeft size={12} aria-hidden /> {building?.name ?? 'Building'}
        </Link>
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-text-faint">
              {building ? `${building.name} · floor` : 'Floor'}
            </p>
            <h1 className="font-serif text-3xl text-text sm:text-4xl">{floor.label}</h1>
            <p className="mt-1 text-xs text-text-faint">
              {assets.length} {assets.length === 1 ? 'pin' : 'pins'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {floor.plan_url && canCreate && (
              <Button
                variant={placing ? 'gold' : 'secondary'}
                iconLeft={<Plus size={14} aria-hidden />}
                onClick={() => setPlacing((p) => !p)}
              >
                {placing ? 'Cancel placing' : 'Add asset'}
              </Button>
            )}
            {floor.plan_url && canUploadPlan && (
              <Button
                variant="secondary"
                iconLeft={<RefreshCw size={14} aria-hidden />}
                onClick={() => setUploadOpen(true)}
              >
                Replace plan
              </Button>
            )}
          </div>
        </header>

        {floor.plan_url ? (
          signedUrlError ? (
            <div className="rounded-xl border border-danger/30 bg-danger-bg p-4 text-sm text-danger">
              Couldn't load plan: {signedUrlError}
            </div>
          ) : !signedUrl || !planKind ? (
            <div className="flex h-[60vh] items-center justify-center rounded-xl border border-black/10 bg-waymarks-gold-soft text-text-faint dark:border-white/10 dark:bg-white/5">
              <div
                className="h-6 w-6 animate-spin rounded-full border-2 border-waymarks-gold/40 border-t-waymarks-gold"
                aria-hidden
              />
              <span className="sr-only">Loading plan…</span>
            </div>
          ) : (
            <FloorPlanCanvas
              src={signedUrl}
              kind={planKind}
              mode={placing ? 'placing' : 'view'}
              onPlaceClick={(coords) => {
                setPlacing(false);
                setPlacePos(coords);
                setNewAssetOpen(true);
              }}
              pinOverlay={
                <PinOverlay
                  assets={assets}
                  selectedAssetId={selectedAssetId}
                  canMove={canEdit}
                  onSelectAsset={(a: Asset) => setSelectedAssetId(a.id)}
                  onReposition={(assetId, x, y) =>
                    updateAsset.mutate({ id: assetId, patch: { x, y } })
                  }
                />
              }
            />
          )
        ) : (
          <EmptyState
            icon={<ImageOff size={32} aria-hidden />}
            title="No plan uploaded yet"
            description="Once a floor plan is uploaded you'll see it here, ready for pins. PDF, PNG, or JPG."
            primaryAction={
              canUploadPlan
                ? { label: 'Upload floor plan', onClick: () => setUploadOpen(true) }
                : undefined
            }
          />
        )}
      </div>

      {canUploadPlan && (
        <FloorPlanUploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          floorId={floor.id}
          floorLabel={floor.label}
          buildingName={building?.name ?? 'Building'}
          existingPlanUrl={floor.plan_url}
        />
      )}

      {canCreate && (
        <NewAssetDialog
          open={newAssetOpen}
          onOpenChange={(o) => {
            setNewAssetOpen(o);
            if (!o) setPlacePos(null);
          }}
          floorId={floor.id}
          position={placePos}
          onCreated={(asset) => {
            // Open the drawer for the just-created pin so the user sees it landed.
            setSelectedAssetId(asset.id);
          }}
        />
      )}

      <AssetDrawer
        assetId={selectedAssetId}
        floorId={floor.id}
        buildingId={buildingId}
        onOpenChange={(o) => {
          if (!o) setSelectedAssetId(null);
        }}
      />
    </AppShell>
  );
}

function Skeleton() {
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <div className="h-7 w-40 animate-pulse rounded-md bg-black/5 dark:bg-white/5" />
        <div className="mt-3 h-4 w-32 animate-pulse rounded-md bg-black/5 dark:bg-white/5" />
        <div className="mt-8 h-32 animate-pulse rounded-lg bg-black/5 dark:bg-white/5" />
      </div>
    </AppShell>
  );
}
