import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, ChevronRight, ClipboardList, Download, Eye, FileDown, ImageOff, LayoutGrid, Map as MapIcon, Plus, RefreshCw, Trash2, Video } from 'lucide-react';
import { AppShell } from '@/components/waymarks/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { FloorPlanCanvas } from '@/components/waymarks/FloorPlanCanvas';
import { PlanSettingsMenu } from '@/components/waymarks/PlanSettingsMenu';
import { FloorNotesButton } from '@/components/waymarks/FloorNotesButton';
import { PlanProvenanceCaption } from '@/components/waymarks/PlanProvenanceCaption';
import { FloorPlanUploadDialog } from '@/components/waymarks/FloorPlanUploadDialog';
import { PinOverlay } from '@/components/waymarks/PinOverlay';
import { NewAssetDialog } from '@/components/waymarks/NewAssetDialog';
import { AssetDrawer } from '@/components/waymarks/AssetDrawer';
import { RepositionToolbar } from '@/components/waymarks/RepositionToolbar';
import { StepUpDialog } from '@/components/waymarks/StepUpDialog';
import { AuditModeShell } from '@/components/waymarks/AuditModeShell';
import { AssetGridView } from '@/components/waymarks/AssetGridView';
import { FilterByTypePopover } from '@/components/waymarks/FilterByTypePopover';
import { FilterByTextInput } from '@/components/waymarks/FilterByTextInput';
import { AuditVideoRecorderDialog } from '@/components/waymarks/AuditVideoRecorderDialog';
import { useAssetsWithVideos } from '@/hooks/useAuditVideos';
import { useSoftDeleteFloor } from '@/hooks/useFloors';
import { useBuilding } from '@/hooks/useBuildings';
import { useAssets, useSoftDeleteAsset, useUpdateAsset } from '@/hooks/useAssets';
import { useAssetTypes } from '@/hooks/useAssetTypes';
import { useFloorView } from '@/hooks/useBundles';
import {
  useActiveAuditSession,
  useLatestConfirmedByFloor,
  useStartAudit,
} from '@/hooks/useAudit';
import { useAuth } from '@/lib/auth-context';
import { useCan } from '@/lib/permissions-context';
import { planKindForPath, signedUrlForPlan } from '@/lib/upload';
import { pinAppearanceFromSettings } from '@/lib/pin-appearance';
import { pinNumberMatchesQuery } from '@/lib/pin-types';
import {
  putAssetsForFloor,
  putBuilding,
  putFloor,
  putLastAudits,
} from '@/lib/offline';
import type { Asset } from '@/types/database';

export function Floor() {
  const { id } = useParams<{ id: string }>();
  // One bundled call is the floor's sole fetch: it returns floor + assets +
  // per-pin photo rows + batch-signed thumbnail URLs, and seeds the per-entity
  // caches the drawer + grid read. Floor + assets come straight off it now, so
  // the page no longer fires its own floor / assets / per-pin-photo requests.
  const floorView = useFloorView(id);
  const floor = floorView.data?.floor ?? null;
  const fLoading = floorView.isLoading;
  const fError = floorView.error as Error | null;
  const { data: building } = useBuilding(floor?.building_id);
  const pinAppearance = useMemo(
    () => pinAppearanceFromSettings(building?.settings),
    [building?.settings]
  );
  // Read the floor's assets from the cache the bundle above seeds (enabled:false
  // → no second fetch). The optimistic lock/drag patches still target this same
  // key, so the canvas stays live; create / delete / lock-all re-seed via the
  // bundle (see useAssets mutations).
  const { data: assets = [] } = useAssets(id, { enabled: false });
  // Subscribe the floor to the org asset-type catalog so the pin layer
  // re-renders (and recolours) the instant the colours load. useAssetTypes
  // writes the colour map into pin-types synchronously during its render, so
  // when this query resolves the pins repaint in the same pass — no remount,
  // no "black pins until you leave and come back".
  useAssetTypes();
  const { user } = useAuth();

  const canUploadPlan = useCan('upload_plan', { type: 'building', id: floor?.building_id ?? '' });
  const canCreate = useCan('create', { type: 'building', id: floor?.building_id ?? '' });
  const canEdit = useCan('edit', { type: 'building', id: floor?.building_id ?? '' });
  const canAudit = useCan('audit', { type: 'floor', id: id ?? '' });
  const canDeleteFloor = useCan('delete', { type: 'floor', id: id ?? '' });
  const updateAsset = useUpdateAsset(id);
  const softDelete = useSoftDeleteAsset(id);
  const softDeleteFloor = useSoftDeleteFloor(floor?.building_id);
  const navigate = useNavigate();
  const [deleteFloorOpen, setDeleteFloorOpen] = useState(false);
  const [deleteFloorError, setDeleteFloorError] = useState<string | null>(null);

  // M6 — audit walkaround
  const { data: lastAuditByAsset } = useLatestConfirmedByFloor(id);
  const { data: activeSession } = useActiveAuditSession(id, user?.id);
  const startAudit = useStartAudit(id, user?.id);
  const [inAudit, setInAudit] = useState(false);
  // Pin to pre-select when entering Audit Mode (set by the AssetDrawer
  // "Log a flag" CTA; null for a normal audit start).
  const [auditInitialAssetId, setAuditInitialAssetId] = useState<string | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [signedUrlError, setSignedUrlError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placePos, setPlacePos] = useState<{ x: number; y: number } | null>(null);
  const [newAssetOpen, setNewAssetOpen] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);


  // M10c — view mode (Map / Grid) + filter-by-type set.
  // M22 (#6) — additional free-text filter that ANDs with the type filter.
  const [viewMode, setViewMode] = useState<'map' | 'grid'>('map');
  const [filterTypes, setFilterTypes] = useState<Set<string>>(new Set());
  const [filterText, setFilterText] = useState('');

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

  // M27 — building-level video recording (no asset selected).
  const [videoRecorderOpen, setVideoRecorderOpen] = useState(false);
  const assetIds = useMemo(() => assets.map((a) => a.id), [assets]);
  const { data: assetsWithVideos } = useAssetsWithVideos(floor?.building_id, assetIds);

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

  async function startOrResumeAudit(targetAssetId?: string) {
    // When launched from the drawer's "Log a flag" CTA, pre-select the pin
    // in Audit Mode and close the drawer so it doesn't sit over the shell.
    setAuditInitialAssetId(targetAssetId ?? null);
    if (targetAssetId) setSelectedAssetId(null);
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

  const baseSet = assets;
  const trimmedFilterText = filterText.trim().toLowerCase();
  const visibleAssets = useMemo(() => {
    return baseSet.filter((a) => {
      if (filterTypes.size > 0 && !filterTypes.has(a.type)) return false;
      if (trimmedFilterText && !matchesAssetText(a, trimmedFilterText)) return false;
      return true;
    });
  }, [baseSet, filterTypes, trimmedFilterText]);
  const filtersActive = filterTypes.size > 0 || trimmedFilterText.length > 0;

  if (fLoading) {
    return (
      <AppShell>
        <div className="mx-auto flex w-full max-w-5xl items-center justify-center px-4 py-16">
          <div
            className="h-6 w-6 animate-spin rounded-full border-2 border-waymarks-gold border-t-transparent"
            aria-hidden
          />
          <span className="sr-only">Loading floor…</span>
        </div>
      </AppShell>
    );
  }

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
  const showAuditCta = Boolean(floor.plan_url) && canAudit;

  // Map view fills the viewport below the header + trial banner (definite-height
  // flex chain via AppShell) so the plan canvas's `h-full` resolves at every
  // breakpoint. Grid view (and the no-plan empty state) keep the normal
  // scrolling page so a long grid grows past the fold.
  const fillViewport = Boolean(floor.plan_url) && viewMode === 'map';

  // Floor-wide lock state drives the "Lock all / Unlock all pins" toggle label
  // in Plan settings (and re-derives live after the RPC invalidates the assets).
  const hasPins = assets.length > 0;
  const allPinsLocked = hasPins && assets.every((a) => a.is_locked);

  // Visualize-in-ViewMark URL. The deeper integration (auth bridge,
  // floor-context handoff) lands in a later milestone; for now this
  // is a stub that opens the visualizer with the building name as a
  // hint via query string. Used both in the floor toolbar and inside
  // the AssetDrawer.
  const viewmarkUrl = building?.name
    ? `https://viewmark-app.netlify.app/?building=${encodeURIComponent(building.name)}`
    : 'https://viewmark-app.netlify.app/';

  return (
    <AppShell fillViewport={fillViewport}>
      {/* Flex column for the floor view. In map mode AppShell makes the chain a
          definite height, so `h-full` here fills exactly the space left under
          the header + trial banner (toolbars take their natural height; the map
          flexes to fill the rest) — no hardcoded viewport math, and the
          breadcrumb is never clipped. Grid/empty state fall back to min-h so a
          tall page scrolls normally. */}
      <div
        className={
          'mx-auto flex w-full max-w-5xl flex-col px-4 py-4 sm:px-6 sm:py-5 ' +
          (fillViewport ? 'h-full min-h-0' : 'min-h-[calc(100dvh-3.5rem)]')
        }
      >
        {/* Row 1 - breadcrumb left, Map/Grid + Filter right.
            One row instead of three (was: back link + eyebrow + giant
            H1 + boxed toolbar). The big floor label is duplicative of
            the left sidebar highlight. */}
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <nav aria-label="Breadcrumb" className="mr-auto flex items-center gap-1.5 text-xs text-text-muted">
            <Link
              to="/"
              className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-black/5 hover:text-text dark:hover:bg-white/5"
            >
              Home
            </Link>
            <ChevronRight size={12} aria-hidden className="text-text-faint" />
            <Link
              to={`/buildings/${floor.building_id}`}
              className="rounded px-1 py-0.5 hover:bg-black/5 hover:text-text dark:hover:bg-white/5"
            >
              {building?.name ?? 'Building'}
            </Link>
            <ChevronRight size={12} aria-hidden className="text-text-faint" />
            <span className="font-semibold text-text">Floor {floor.label}</span>
          </nav>
          {/* Map / Grid toggle - sits with the breadcrumb (its own line on
              mobile, inline-right on desktop). 28px tall to match the row. */}
          {floor.plan_url && (
            <div role="group" aria-label="View mode" className="inline-flex h-7 rounded-md border border-black/15 text-[11px] font-medium dark:border-white/15">
              <button
                type="button"
                onClick={() => setViewMode('map')}
                aria-pressed={viewMode === 'map'}
                className={
                  'inline-flex h-full items-center gap-1 rounded-l-md px-2.5 transition-colors ' +
                  (viewMode === 'map'
                    ? 'bg-waymarks-ink text-white'
                    : 'text-text-muted hover:bg-black/5 dark:hover:bg-white/5')
                }
              >
                <MapIcon size={11} aria-hidden /> Map
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                aria-pressed={viewMode === 'grid'}
                className={
                  'inline-flex h-full items-center gap-1 rounded-r-md border-l border-black/10 px-2.5 transition-colors dark:border-white/10 ' +
                  (viewMode === 'grid'
                    ? 'bg-waymarks-ink text-white'
                    : 'text-text-muted hover:bg-black/5 dark:hover:bg-white/5')
                }
              >
                <LayoutGrid size={11} aria-hidden /> Grid
              </button>
            </div>
          )}
          {/* Filtered-count badge — mobile only. On phones the filter input +
              Filter button live in the action grid below (Row 2), so this keeps
              the "X of Y visible" readout up here. The desktop count lives in
              the filter cluster to the right. */}
          {floor.plan_url && filtersActive && assets.length > 0 && (
            <span className="inline-flex h-7 shrink-0 items-center rounded-md bg-waymarks-gold-soft px-2 text-[11px] font-medium text-waymarks-ink sm:hidden">
              {visibleAssets.length} of {assets.length} visible
            </span>
          )}
          {/* Desktop filter cluster (sm+ only). On phones these controls move
              into the Row 2 action grid so all 11 controls share one uniform
              grid. */}
          {floor.plan_url && assets.length > 0 && (
            <div className="hidden w-auto items-center gap-1.5 sm:flex">
              <div className="w-56">
                <FilterByTextInput value={filterText} onChange={setFilterText} />
              </div>
              <FilterByTypePopover selectedTypes={filterTypes} onChange={setFilterTypes} />
              {filtersActive && (
                <span className="inline-flex h-7 shrink-0 items-center rounded-md bg-waymarks-gold-soft px-2 text-[11px] font-medium text-waymarks-ink">
                  {visibleAssets.length} of {assets.length} visible
                </span>
              )}
            </div>
          )}
        </div>

        {/* Name-search — its own full-width band on phones (the zone filter and
            Catalogue are dropped on mobile per the toolbar trim). On sm+ this
            row hides and the search box lives in the Row 1 cluster instead. */}
        {floor.plan_url && assets.length > 0 && (
          <div className="mb-2 sm:hidden">
            <FilterByTextInput value={filterText} onChange={setFilterText} />
          </div>
        )}

        {/* Row 2 - action buttons. On phones a uniform grid: every button the
            same width and height, Catalogue hidden (PDF export is a desk job)
            so what's left tiles evenly. `[&>button]`/`[&>a]` give the controls
            slightly smaller text/padding so the longest labels fit. On sm+ it
            reverts to the natural right-aligned wrap with Catalogue shown, so
            desktop is unchanged. */}
        <div className="mb-3 grid grid-cols-4 gap-1 [&>*]:w-full [&>*]:justify-center [&>*]:whitespace-nowrap [&>a]:px-1.5 [&>a]:text-[10px] [&>button]:px-1.5 [&>button]:text-[10px] sm:flex sm:flex-wrap sm:items-center sm:justify-end sm:gap-1.5 sm:[&>*]:w-auto sm:[&>a]:px-2.5 sm:[&>a]:text-[11px] sm:[&>button]:px-2.5 sm:[&>button]:text-[11px]">
          {showAuditCta && (
            <Tooltip text={activeSession ? 'Resume the audit walkaround you started' : 'Walk the floor and confirm every sign'}>
              <button
                type="button"
                onClick={() => void startOrResumeAudit()}
                disabled={startAudit.isPending}
                className="inline-flex h-7 items-center gap-1 rounded-md bg-waymarks-gold px-2.5 text-[11px] font-medium text-waymarks-ink hover:bg-waymarks-gold-deep disabled:opacity-60"
              >
                <ClipboardList size={11} aria-hidden />
                {activeSession ? 'Resume audit' : 'Audit'}
              </button>
            </Tooltip>
          )}
          {assets.length > 0 && (
            <Tooltip text="View the sign catalogue for this floor (print or download as PDF)">
              <Link
                to={`/floors/${id}/catalogue`}
                // Hidden on phones (PDF export is a desk job); shown on sm+.
                className="hidden h-7 items-center gap-1 rounded-md border border-black/15 bg-surface px-2.5 text-[11px] font-medium text-text hover:bg-black/5 sm:inline-flex dark:border-white/15 dark:hover:bg-white/5"
              >
                <FileDown size={11} aria-hidden />
                Catalogue
              </Link>
            </Tooltip>
          )}
          {canEdit && (
            <Tooltip text="Record a video walkthrough of the building">
              <button
                type="button"
                onClick={() => setVideoRecorderOpen(true)}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-black/15 bg-surface px-2.5 text-[11px] font-medium text-text hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
              >
                <Video size={11} aria-hidden />
                Record
              </button>
            </Tooltip>
          )}
          {floor.plan_url && canCreate && (
            <Tooltip text={placing ? 'Cancel placing a new asset' : 'Place a new asset by clicking on the floor plan'}>
              <button
                type="button"
                onClick={() => setPlacing((p) => !p)}
                className={
                  'inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] font-medium ' +
                  (placing
                    ? 'bg-waymarks-gold text-waymarks-ink hover:bg-waymarks-gold-deep'
                    : 'border border-black/15 bg-surface text-text hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5')
                }
              >
                <Plus size={11} aria-hidden />
                {placing ? 'Cancel' : 'Add asset'}
              </button>
            </Tooltip>
          )}
          {floor.plan_url && (
            <Tooltip text={cacheState === 'cached' ? 'This floor is saved for offline use — tap to refresh' : 'Save this floor and its plan for offline use'}>
              <button
                type="button"
                onClick={() => void takeOffline()}
                disabled={cacheState === 'caching'}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-black/15 bg-surface px-2.5 text-[11px] font-medium text-text hover:bg-black/5 disabled:opacity-60 dark:border-white/15 dark:hover:bg-white/5"
              >
                {cacheState === 'cached' ? <Check size={11} aria-hidden /> : <Download size={11} aria-hidden />}
                {cacheState === 'cached' ? 'Cached' : 'Offline'}
              </button>
            </Tooltip>
          )}
          {floor.plan_url && canUploadPlan && (
            <Tooltip text="Replace the floor plan image">
              <button
                type="button"
                onClick={() => setUploadOpen(true)}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-black/15 bg-surface px-2.5 text-[11px] font-medium text-text hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
              >
                <RefreshCw size={11} aria-hidden />
                Replace
              </button>
            </Tooltip>
          )}
          {floor.plan_url && canUploadPlan && (
            <PlanSettingsMenu
              floorId={floor.id}
              buildingId={floor.building_id}
              provenance={floor.plan_provenance}
              allPinsLocked={allPinsLocked}
              hasPins={hasPins}
            />
          )}
          {/* Floor-wide team notes. Self-gates: editors always see it; viewers
              only when a note exists; never rendered on guest share links. */}
          <FloorNotesButton
            floorId={floor.id}
            buildingId={floor.building_id}
            notes={floor.floor_notes}
            canEdit={canEdit}
          />
          {/* M14c - Visualize in ViewMark. Gold outline so it reads as a
              brand-aligned secondary, distinct from the gold-filled
              Audit primary. */}
          <Tooltip text="Open ViewMark to mock up signage on a wall photo">
            <button
              type="button"
              onClick={() => window.open(viewmarkUrl, '_blank', 'noopener,noreferrer')}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-waymarks-gold bg-surface px-2.5 text-[11px] font-medium text-waymarks-gold hover:bg-waymarks-gold-soft"
            >
              <Eye size={11} aria-hidden />
              Visualize
            </button>
          </Tooltip>
          {canDeleteFloor && (
            <Tooltip text="Soft-delete this floor (recoverable)">
              <button
                type="button"
                onClick={() => {
                  setDeleteFloorError(null);
                  setDeleteFloorOpen(true);
                }}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-black/15 bg-surface px-2.5 text-[11px] font-medium text-text-muted hover:border-danger hover:bg-danger-bg hover:text-danger dark:border-white/15 sm:ml-1"
              >
                <Trash2 size={11} aria-hidden />
                Delete floor
              </button>
            </Tooltip>
          )}
        </div>

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

        {floor.plan_url && (
          <PlanProvenanceCaption provenance={floor.plan_provenance} className="mb-2" />
        )}

        {floor.plan_url ? (
          signedUrlError ? (
            <div className="rounded-xl border border-danger/30 bg-danger-bg p-4 text-sm text-danger">
              Couldn't load plan: {signedUrlError}
            </div>
          ) : !signedUrl || !planKind ? (
            <div className="flex h-[60vh] items-center justify-center rounded-xl border border-black/10 bg-surface text-waymarks-ink-faint dark:border-white/10 dark:bg-white/5">
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
              assetsWithVideos={assetsWithVideos ?? null}
            />
          ) : (
            <div className="relative flex-1 min-h-0">
              <FloorPlanCanvas
                src={signedUrl}
                kind={planKind}
                fill
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
                    onLongPress={canEdit ? startReposition : undefined}
                    pinShape={pinAppearance.pinShape}
                    pinSize={pinAppearance.pinSize}
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
          buildingId={floor.building_id}
          position={placePos}
          // M28: after creation, return the user to the map view without
          // popping the edit drawer. They can tap the new pin to edit it.
          onCreated={() => {
            setSelectedAssetId(null);
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
        onLogFlag={(assetId) => void startOrResumeAudit(assetId)}
        onStartAuditHere={(assetId) => void startOrResumeAudit(assetId)}
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
          initialAssetId={auditInitialAssetId}
          pinShape={pinAppearance.pinShape}
          pinSize={pinAppearance.pinSize}
          onClose={() => setInAudit(false)}
        />
      )}

      {canEdit && floor.building_id && (
        <AuditVideoRecorderDialog
          open={videoRecorderOpen}
          onOpenChange={setVideoRecorderOpen}
          buildingId={floor.building_id}
          assetId={null}
          scopeLabel={`${building?.name ?? 'Building'} · Floor ${floor.label}`}
        />
      )}

      <StepUpDialog
        open={deleteFloorOpen}
        onOpenChange={(o) => {
          if (!softDeleteFloor.isPending) setDeleteFloorOpen(o);
        }}
        title={`Delete Floor ${floor.label}?`}
        description={
          `This soft-deletes the floor and hides it for everyone with access. ` +
          (assets.length === 0
            ? `There are no pins on this floor yet. `
            : assets.length === 1
              ? `1 asset pin and any audit history go with it. `
              : `${assets.length} asset pins and any audit history go with them. `) +
          `Records are kept in the database; support can restore the floor if needed.`
        }
        confirmWord="DELETE"
        confirmLabel="Delete floor"
        confirmVariant="danger"
        confirmIcon={<Trash2 size={14} aria-hidden />}
        busy={softDeleteFloor.isPending}
        errorMessage={deleteFloorError}
        onConfirm={async () => {
          setDeleteFloorError(null);
          try {
            await softDeleteFloor.mutateAsync(floor.id);
            setDeleteFloorOpen(false);
            navigate(`/buildings/${buildingId}`);
          } catch (err) {
            setDeleteFloorError(
              err instanceof Error ? err.message : 'Could not delete the floor.'
            );
          }
        }}
      />
    </AppShell>
  );
}

// =============================================================================
// Filter helpers (M22 #6)
// =============================================================================

/**
 * Case-insensitive substring match against the user-visible text fields
 * we care about: pin ID number, name, location notes, room number, notes,
 * and the two vendor-contact strings. `q` is expected to already be trimmed
 * and lower-cased by the caller.
 */
function matchesAssetText(a: Asset, q: string): boolean {
  if (!q) return true;
  // Pin ID: typing "3", "003", or "#003" finds the asset by its floor number.
  if (pinNumberMatchesQuery(a.pin_number, q)) return true;
  const haystacks: Array<string | null | undefined> = [
    a.name,
    a.location_notes,
    a.room_number,
    a.notes,
  ];
  const v = a.vendor_contact as
    | { name?: string | null; company?: string | null }
    | null
    | undefined;
  if (v) {
    haystacks.push(v.name);
    haystacks.push(v.company);
  }
  for (const h of haystacks) {
    if (h && h.toLowerCase().includes(q)) return true;
  }
  return false;
}
