import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardCheck, ClipboardList, ImageOff, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { AppShell } from '@/components/waymarks/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { FloorPlanCanvas } from '@/components/waymarks/FloorPlanCanvas';
import { FloorPlanUploadDialog } from '@/components/waymarks/FloorPlanUploadDialog';
import { PinOverlay } from '@/components/waymarks/PinOverlay';
import { NewAssetDialog } from '@/components/waymarks/NewAssetDialog';
import { AssetDrawer } from '@/components/waymarks/AssetDrawer';
import { RepositionToolbar } from '@/components/waymarks/RepositionToolbar';
import { StepUpDialog } from '@/components/waymarks/StepUpDialog';
import { AuditModeShell } from '@/components/waymarks/AuditModeShell';
import { useFloor } from '@/hooks/useFloors';
import { useBuilding } from '@/hooks/useBuildings';
import { useAssets, useSoftDeleteAsset, useUpdateAsset } from '@/hooks/useAssets';
import {
  useActiveAuditSession,
  useLatestConfirmedByFloor,
  useStartAudit,
} from '@/hooks/useAudit';
import { useAuth } from '@/lib/auth-context';
import { useCan } from '@/lib/permissions-context';
import { planKindForPath, signedUrlForPlan } from '@/lib/upload';
import { computeStatus } from '@/lib/asset-status';
import type { Asset } from '@/types/database';

export function Floor() {
  const { id } = useParams<{ id: string }>();
  const { data: floor, isLoading: fLoading, error: fError } = useFloor(id);
  const { data: building } = useBuilding(floor?.building_id);
  const { data: assets = [] } = useAssets(id);
  const { user } = useAuth();

  const canUploadPlan = useCan('upload_plan', { type: 'building', id: floor?.building_id ?? '' });
  const canCreate = useCan('create', { type: 'building', id: floor?.building_id ?? '' });
  const canEdit = useCan('edit', { type: 'building', id: floor?.building_id ?? '' });
  const canAudit = useCan('audit', { type: 'floor', id: id ?? '' });
  const updateAsset = useUpdateAsset(id);
  const softDelete = useSoftDeleteAsset(id);

  // M6 — audit walkaround
  const { data: lastAuditByAsset } = useLatestConfirmedByFloor(id);
  const { data: activeSession } = useActiveAuditSession(id, user?.id);
  const startAudit = useStartAudit(id, user?.id);
  const [inAudit, setInAudit] = useState(false);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [signedUrlError, setSignedUrlError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placePos, setPlacePos] = useState<{ x: number; y: number } | null>(null);
  const [newAssetOpen, setNewAssetOpen] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  // M8 — audit-due filter (deferred from M6).
  const [auditDueOnly, setAuditDueOnly] = useState(false);

  // Deliberate-reposition state machine (M5).
  const [repositionAssetId, setRepositionAssetId] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<
    { assetId: string; from: { x: number; y: number }; to: { x: number; y: number } } | null
  >(null);

  // Soft-delete confirmation state (M5).
  const [deleteAssetId, setDeleteAssetId] = useState<string | null>(null);

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

  // Esc cancels reposition mode (also clears any pending move).
  useEffect(() => {
    if (!repositionAssetId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setPendingMove(null);
        setRepositionAssetId(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [repositionAssetId]);

  // Reposition mode and placing mode are mutually exclusive — turning one
  // on cancels the other.
  useEffect(() => {
    if (repositionAssetId && placing) setPlacing(false);
  }, [repositionAssetId, placing]);

  function startReposition(assetId: string) {
    setSelectedAssetId(null); // close drawer
    setPendingMove(null);
    setRepositionAssetId(assetId);
  }
  function cancelReposition() {
    setPendingMove(null);
    setRepositionAssetId(null);
  }
  function onRepositionDragEnd(assetId: string, x: number, y: number) {
    const a = assets.find((a) => a.id === assetId);
    if (!a) return;
    if (Math.abs(a.x - x) < 0.0005 && Math.abs(a.y - y) < 0.0005) {
      setPendingMove(null);
      return;
    }
    setPendingMove({ assetId, from: { x: a.x, y: a.y }, to: { x, y } });
  }
  async function confirmMove() {
    if (!pendingMove) return;
    try {
      await updateAsset.mutateAsync({
        id: pendingMove.assetId,
        patch: { x: pendingMove.to.x, y: pendingMove.to.y },
      });
      setPendingMove(null);
      setRepositionAssetId(null);
    } catch {
      setPendingMove(null);
    }
  }
  function dismissPendingMove() {
    setPendingMove(null);
  }

  async function confirmDelete() {
    if (!deleteAssetId) return;
    try {
      await softDelete.mutateAsync(deleteAssetId);
      setDeleteAssetId(null);
      setSelectedAssetId(null);
    } catch {
      // Surface error via the dialog's own error handling later.
    }
  }

  async function startOrResumeAudit() {
    if (activeSession) {
      setInAudit(true);
      return;
    }
    if (!floor?.id) return;
    try {
      await startAudit.mutateAsync({ floor_id: floor.id, assets_total: assets.length });
      setInAudit(true);
    } catch {
      // Errors surface in console; user can tap again.
    }
  }

  const planKind = useMemo(() => planKindForPath(floor?.plan_url), [floor?.plan_url]);

  // Per-asset status (cycle-aware via lastAuditByAsset). Used by the
  // Audit-due chip count and the optional filter.
  const auditDueAssets = useMemo(() => {
    if (!assets.length) return [] as Asset[];
    return assets.filter((a) => {
      const status = computeStatus({
        asset: a,
        lastAuditAt: lastAuditByAsset?.get(a.id) ?? null,
        openFlagCount: a.status === 'flagged' ? 1 : 0,
      });
      return status === 'attention';
    });
  }, [assets, lastAuditByAsset]);

  const visibleAssets = auditDueOnly ? auditDueAssets : assets;

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
  const showAuditCta =
    floor.plan_url && canAudit && assets.length > 0;

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
          <div className="flex flex-wrap items-center gap-2">
            {floor.plan_url && assets.length > 0 && (
              <button
                type="button"
                onClick={() => setAuditDueOnly((v) => !v)}
                aria-pressed={auditDueOnly}
                className={
                  'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors ' +
                  (auditDueOnly
                    ? 'border-warning/40 bg-warning-bg text-warning'
                    : 'border-black/15 bg-surface text-text-muted hover:border-black/25 hover:text-text dark:border-white/15')
                }
              >
                <ClipboardCheck size={12} aria-hidden />
                <span>
                  Audit due
                  <span className="ml-1 rounded bg-black/5 px-1 font-mono text-[11px] dark:bg-white/10">
                    {auditDueAssets.length}
                  </span>
                </span>
              </button>
            )}
            {showAuditCta && (
              <Button
                variant="gold"
                iconLeft={<ClipboardList size={14} aria-hidden />}
                loading={startAudit.isPending}
                onClick={() => void startOrResumeAudit()}
              >
                {activeSession ? 'Resume audit' : 'Audit floor'}
              </Button>
            )}
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

        {activeSession && !inAudit && (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-waymarks-gold/40 bg-waymarks-gold-soft p-3 text-sm dark:bg-white/5"
          >
            <ClipboardList size={14} aria-hidden className="text-waymarks-gold" />
            <p className="flex-1 text-waymarks-ink dark:text-white">
              You have an audit in progress on this floor.
            </p>
            <Button size="sm" variant="gold" onClick={() => setInAudit(true)}>
              Resume
            </Button>
          </div>
        )}

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
            <div className="relative">
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
                    assets={visibleAssets}
                    selectedAssetId={selectedAssetId}
                    canMove={canEdit}
                    onSelectAsset={(a: Asset) => setSelectedAssetId(a.id)}
                    onReposition={(assetId, x, y) =>
                      updateAsset.mutate({ id: assetId, patch: { x, y } })
                    }
                    repositionAssetId={repositionAssetId}
                    onRepositionDragEnd={onRepositionDragEnd}
                    pendingRepositionCoords={
                      pendingMove ? { x: pendingMove.to.x, y: pendingMove.to.y } : null
                    }
                    lastAuditByAsset={lastAuditByAsset ?? null}
                  />
                }
              />
              {repositionAssetId && (
                <RepositionToolbar
                  state={pendingMove ? 'pending' : 'armed'}
                  pending={pendingMove}
                  busy={updateAsset.isPending}
                  onCancel={cancelReposition}
                  onConfirm={() => void confirmMove()}
                  onDismissPending={dismissPendingMove}
                />
              )}
            </div>
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
        onStartReposition={startReposition}
        onStartDelete={(id) => setDeleteAssetId(id)}
      />

      <StepUpDialog
        open={!!deleteAssetId}
        onOpenChange={(o) => {
          if (!o) setDeleteAssetId(null);
        }}
        title="Delete asset"
        description="This soft-deletes the pin. A super admin can restore it from Trash within 30 days; after that it's permanent."
        confirmWord="DELETE"
        confirmLabel="Delete asset"
        confirmVariant="danger"
        confirmIcon={<Trash2 size={14} aria-hidden />}
        busy={softDelete.isPending}
        onConfirm={confirmDelete}
      />

      {inAudit && activeSession && signedUrl && planKind && (
        <AuditModeShell
          session={activeSession}
          floorLabel={floor.label}
          buildingName={building?.name ?? 'Building'}
          assets={assets}
          planUrl={signedUrl}
          planKind={planKind}
          onClose={() => setInAudit(false)}
        />
      )}
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
