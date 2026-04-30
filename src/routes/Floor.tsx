import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, ClipboardList, Download, ImageOff, LayoutGrid, Map as MapIcon, Plus, RefreshCw, Trash2 } from 'lucide-react';
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
import { AssetGridView } from '@/components/waymarks/AssetGridView';
import { FilterByTypePopover } from '@/components/waymarks/FilterByTypePopover';
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
import {
  putAssetsForFloor,
  putBuilding,
  putFloor,
  putLastAudits,
} from '@/lib/offline';
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

  // M10c — view mode (Map / Grid) + filter-by-type set
  const [viewMode, setViewMode] = useState<'map' | 'grid'>('map');
  const [filterTypes, setFilterTypes] = useState<Set<string>>(new Set());

  // M9 — take this floor offline (pre-cache for the audit walkaround).
  const [cacheState, setCacheState] = useState<'idle' | 'caching' | 'cached' | 'error'>(
    'idle'
  );
  const [cacheError, setCacheError] = useState<string | null>(null);

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

  async function takeOffline() {
    if (!floor || !building) return;
    setCacheError(null);
    setCacheState('caching');
    try {
      // Persist building + floor + assets + last audits to Dexie.
      await putBuilding(building);
      await putFloor(floor);
      await putAssetsForFloor(floor.id, assets);
      await putLastAudits(floor.id, lastAuditByAsset ?? new Map<string, string>());
      // Pre-warm the floor plan in the SW runtime cache by fetching it once.
      if (signedUrl) {
        try {
          await fetch(signedUrl, { cache: 'reload' });
        } catch {
          // Plan caching is best-effort.
        }
      }
      setCacheState('cached');
      window.setTimeout(() => setCacheState('idle'), 3500);
    } catch (e) {
      setCacheError(e instanceof Error ? e.message : 'Cache failed.');
      setCacheState('error');
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
  const statusCounts = useMemo(() => {
    let good = 0;
    let attention = 0;
    let flagged = 0;
    const auditDue: Asset[] = [];
    for (const a of assets) {
      const status = computeStatus({
        asset: a,
        lastAuditAt: lastAuditByAsset?.get(a.id) ?? null,
        openFlagCount: a.status === 'flagged' ? 1 : 0,
      });
      if (status === 'good') good++;
      else if (status === 'attention') {
        attention++;
        auditDue.push(a);
      } else if (status === 'flagged') flagged++;
    }
    return { good, attention, flagged, auditDue };
  }, [assets, lastAuditByAsset]);

  const auditDueAssets = statusCounts.auditDue;
  const baseSet = auditDueOnly ? auditDueAssets : assets;
  const visibleAssets =
    filterTypes.size === 0 ? baseSet : baseSet.filter((a) => filterTypes.has(a.type));

  if (fLoading) return <Skeleton />;

  if (fError || !floor) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
          <h1 className="font-semibold text-2xl">Floor not found</h1>
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
        <header className="mb-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-waymarks-gold">
            {building ? `${building.name} · floor` : 'Floor'}
          </p>
          <h1 className="mt-0.5 font-semibold text-3xl leading-tight text-text sm:text-4xl">
            {floor.label}
          </h1>
        </header>

        {/* Dense toolbar — view toggle + filter on the left, primary actions on the right */}
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-black/10 bg-surface p-2 shadow-sm dark:border-white/10">
          {/* Map / Grid toggle */}
          {floor.plan_url && (
            <div role="group" aria-label="View mode" className="inline-flex rounded-md border border-black/15 bg-surface text-xs font-medium dark:border-white/15">
              <button
                type="button"
                onClick={() => setViewMode('map')}
                aria-pressed={viewMode === 'map'}
                className={
                  'inline-flex h-9 items-center gap-1.5 rounded-l-md px-3 transition-colors ' +
                  (viewMode === 'map'
                    ? 'bg-waymarks-ink text-white'
                    : 'text-text-muted hover:bg-black/5 dark:hover:bg-white/5')
                }
              >
                <MapIcon size={12} aria-hidden /> Map
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                aria-pressed={viewMode === 'grid'}
                className={
                  'inline-flex h-9 items-center gap-1.5 rounded-r-md border-l border-black/10 px-3 transition-colors dark:border-white/10 ' +
                  (viewMode === 'grid'
                    ? 'bg-waymarks-ink text-white'
                    : 'text-text-muted hover:bg-black/5 dark:hover:bg-white/5')
                }
              >
                <LayoutGrid size={12} aria-hidden /> Grid
              </button>
            </div>
          )}

          {/* Filter by type */}
          {floor.plan_url && assets.length > 0 && (
            <FilterByTypePopover selectedTypes={filterTypes} onChange={setFilterTypes} />
          )}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {showAuditCta && (
              <Button
                size="sm"
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
                size="sm"
                variant={placing ? 'gold' : 'secondary'}
                iconLeft={<Plus size={14} aria-hidden />}
                onClick={() => setPlacing((p) => !p)}
              >
                {placing ? 'Cancel placing' : 'Add asset'}
              </Button>
            )}
            {floor.plan_url && (
              <Button
                size="sm"
                variant="secondary"
                iconLeft={
                  cacheState === 'cached' ? (
                    <Check size={14} aria-hidden />
                  ) : (
                    <Download size={14} aria-hidden />
                  )
                }
                loading={cacheState === 'caching'}
                onClick={() => void takeOffline()}
              >
                {cacheState === 'cached' ? 'Cached' : 'Take offline'}
              </Button>
            )}
            {floor.plan_url && canUploadPlan && (
              <Button
                size="sm"
                variant="secondary"
                iconLeft={<RefreshCw size={14} aria-hidden />}
                onClick={() => setUploadOpen(true)}
              >
                Replace plan
              </Button>
            )}
          </div>
        </div>

        {assets.length > 0 && (
          <FloorStatsBar
            total={assets.length}
            good={statusCounts.good}
            attention={statusCounts.attention}
            flagged={statusCounts.flagged}
            auditDueOnly={auditDueOnly}
            onToggleAuditDue={() => setAuditDueOnly((v) => !v)}
          />
        )}

        {cacheError && (
          <div className="mb-4 rounded-md border border-danger/30 bg-danger-bg p-3 text-xs text-danger">
            Could not cache this floor: {cacheError}
          </div>
        )}

        {activeSession && !inAudit && (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-waymarks-gold bg-waymarks-gold-soft p-3 text-sm dark:bg-white/5"
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
            <div className="flex h-[60vh] items-center justify-center rounded-xl border border-black/10 bg-surface text-text-faint dark:border-white/10 dark:bg-white/5">
              <div
                className="h-6 w-6 animate-spin rounded-full border-2 border-waymarks-gold border-t-waymarks-gold"
                aria-hidden
              />
              <span className="sr-only">Loading plan…</span>
            </div>
          ) : viewMode === 'grid' ? (
            <AssetGridView
              assets={visibleAssets}
              selectedAssetId={selectedAssetId}
              onSelectAsset={(a: Asset) => setSelectedAssetId(a.id)}
              lastAuditByAsset={lastAuditByAsset ?? null}
            />
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



function FloorStatsBar({
  total,
  good,
  attention,
  flagged,
  auditDueOnly,
  onToggleAuditDue,
}: {
  total: number;
  good: number;
  attention: number;
  flagged: number;
  auditDueOnly: boolean;
  onToggleAuditDue: () => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-end gap-x-5 gap-y-2 text-sm">
      <Stat label="Total" value={total} accent="ink" />
      <Stat label="Good" value={good} accent="success" />
      <Stat
        label="Audit due"
        value={attention}
        accent="warning"
        active={auditDueOnly}
        onClick={attention > 0 ? onToggleAuditDue : undefined}
      />
      <Stat label="Flagged" value={flagged} accent="danger" />
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  active,
  onClick,
}: {
  label: string;
  value: number;
  accent: 'ink' | 'success' | 'warning' | 'danger';
  active?: boolean;
  onClick?: () => void;
}) {
  const accentNumber =
    accent === 'success'
      ? 'text-success'
      : accent === 'warning'
        ? 'text-warning'
        : accent === 'danger'
          ? 'text-danger'
          : 'text-text';
  const interactive = !!onClick;
  const Tag = interactive ? 'button' : 'span';
  return (
    <Tag
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={interactive ? !!active : undefined}
      className={
        'inline-flex items-baseline gap-1.5 rounded px-1 ' +
        (interactive
          ? 'cursor-pointer transition-colors hover:bg-warning-bg ' +
            (active ? 'bg-warning-bg' : '')
          : '')
      }
    >
      <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-text-faint">
        {label}
      </span>
      <span className={'font-semibold tabular-nums text-base ' + accentNumber}>
        {value}
      </span>
    </Tag>
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
