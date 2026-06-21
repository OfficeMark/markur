import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, ChevronRight, ClipboardCheck, Download, Eye, ImageOff, LayoutGrid, Map as MapIcon, Maximize2, MapPin, Minimize2, NotebookPen, Shapes, Trash2 } from 'lucide-react';
import { AppShell } from '@/components/waymarks/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
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
import { FilterByZonePopover } from '@/components/waymarks/FilterByZonePopover';
import { FloorFilterSheet } from '@/components/waymarks/FloorFilterSheet';
import { FloorMoreMenu } from '@/components/waymarks/FloorMoreMenu';
import { FloorNotesButton } from '@/components/waymarks/FloorNotesButton';
import { useAssetsWithVideos } from '@/hooks/useAuditVideos';
import { useFloor } from '@/hooks/useFloors';
import { useBuilding } from '@/hooks/useBuildings';
import { PlanProvenanceCaption } from '@/components/waymarks/PlanProvenanceCaption';
import { useAssets, useSoftDeleteAsset, useUpdateAsset } from '@/hooks/useAssets';
import {
  useActiveAuditSession,
  useLatestConfirmedByFloor,
  useStartAudit,
} from '@/hooks/useAudit';
import { useAuth } from '@/lib/auth-context';
import { useCan } from '@/lib/permissions-context';
import { planKindForPath, signedUrlForPlan } from '@/lib/upload';
import { cn } from '@/lib/utils';
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
  // Focus / presentation mode — hides all chrome so the plan gets the full
  // screen (great for client walkthroughs). Only entered from the map view.
  const [focus, setFocus] = useState(false);
  const [filterTypes, setFilterTypes] = useState<Set<string>>(new Set());
  // Reskin: a real zone facet alongside type. '' (NO_ZONE) selects pins with a
  // blank zone. Empty set = all visible.
  const [filterZones, setFilterZones] = useState<Set<string>>(new Set());

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
  // Distinct zone values present on this floor (for the zone filter). '' marks
  // pins with no zone so they can be filtered too; sorted, blank-last.
  const zoneOptions = useMemo(() => {
    const set = new Set<string>();
    for (const a of baseSet) set.add((a.zone ?? '').trim());
    return Array.from(set).sort((x, y) => {
      if (x === '') return 1;
      if (y === '') return -1;
      return x.localeCompare(y);
    });
  }, [baseSet]);
  const visibleAssets = useMemo(() => {
    return baseSet.filter((a) => {
      if (filterTypes.size > 0 && !filterTypes.has(a.type)) return false;
      if (filterZones.size > 0 && !filterZones.has((a.zone ?? '').trim())) return false;
      return true;
    });
  }, [baseSet, filterTypes, filterZones]);
  const filtersActive = filterTypes.size > 0 || filterZones.size > 0;

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

  // Floor-wide pin state for the "⋯ More" menu's Lock all / Unlock all toggle.
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

  // ── Reskinned toolbar controls ────────────────────────────────────────────
  // Defined once and placed in BOTH the desktop two-row layout and the mobile
  // uniform stack, so the two layouts stay in lock-step without duplicating JSX.
  const showFilters = Boolean(floor.plan_url) && assets.length > 0;
  // Mirror FloorNotesButton's own gate so the segment's rounded corner is right.
  const notesVisible = canEdit || !!floor.floor_notes?.trim();

  const segCls = (active: boolean) =>
    'inline-flex h-9 items-center justify-center gap-1.5 px-2 text-xs font-medium transition-colors sm:px-3 ' +
    (active
      ? 'bg-waymarks-ink text-white'
      : 'text-text-muted hover:bg-black/5 dark:hover:bg-white/5');
  const filterSegCls = (active: boolean) =>
    'inline-flex h-9 items-center justify-center gap-1.5 px-2 text-xs font-medium transition-colors sm:px-3 ' +
    (active
      ? 'bg-waymarks-gold-soft text-waymarks-ink'
      : 'text-text-muted hover:bg-black/5 dark:hover:bg-white/5');
  const countBadge = (n: number) => (
    <span className="rounded bg-waymarks-ink px-1 font-mono text-[10px] text-white">{n}</span>
  );

  const breadcrumb = (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 items-center gap-1.5 text-xs text-text-muted"
    >
      <Link
        to="/"
        className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-black/5 hover:text-text dark:hover:bg-white/5"
      >
        Home
      </Link>
      <ChevronRight size={12} aria-hidden className="shrink-0 text-text-faint" />
      <Link
        to={`/buildings/${floor.building_id}`}
        className="truncate rounded px-1 py-0.5 hover:bg-black/5 hover:text-text dark:hover:bg-white/5"
      >
        {building?.name ?? 'Building'}
      </Link>
      <ChevronRight size={12} aria-hidden className="shrink-0 text-text-faint" />
      <span className="truncate font-semibold text-text">Floor {floor.label}</span>
    </nav>
  );

  // Two primary circles — the focal actions (orange Add pin, dark Audit).
  // Slightly smaller on phones but still the prominent focal point.
  const circleCls =
    'flex h-[52px] w-[52px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-full border-[3px] border-white text-[10px] font-bold leading-tight shadow-md transition-colors sm:h-[68px] sm:w-[68px] sm:text-[12px]';
  const addPinCircle = () => floor.plan_url && canCreate && (
    <Tooltip text={placing ? 'Cancel placing a pin' : 'Place a new pin by clicking the floor plan'}>
      <button
        type="button"
        onClick={() => setPlacing((p) => !p)}
        className={
          circleCls +
          ' ' +
          (placing
            ? 'bg-waymarks-ink text-white hover:bg-waymarks-ink/90'
            : 'bg-accent text-white hover:bg-accent/90')
        }
      >
        <MapPin size={18} aria-hidden />
        {placing ? 'Cancel' : 'Add pin'}
      </button>
    </Tooltip>
  );
  const auditCircle = () => showAuditCta && (
    <Tooltip text={activeSession ? 'Resume the audit walkaround you started' : 'Walk the floor and confirm every sign'}>
      <button
        type="button"
        onClick={() => void startOrResumeAudit()}
        disabled={startAudit.isPending}
        className={circleCls + ' bg-waymarks-ink text-white hover:bg-waymarks-ink/90 disabled:opacity-60'}
      >
        <ClipboardCheck size={18} aria-hidden />
        {activeSession ? 'Resume' : 'Audit'}
      </button>
    </Tooltip>
  );
  const hasPrimary = Boolean((floor.plan_url && canCreate) || showAuditCta);

  // View segment — Map / Grid / Notes in one bordered control.
  const viewSeg = () => floor.plan_url ? (
    <div
      role="group"
      aria-label="View mode"
      className="inline-flex h-9 shrink-0 overflow-hidden rounded-lg border border-black/15 dark:border-white/15"
    >
      <button
        type="button"
        onClick={() => setViewMode('map')}
        aria-pressed={viewMode === 'map'}
        aria-label="Map view"
        className={segCls(viewMode === 'map')}
      >
        <MapIcon size={13} aria-hidden /> <span className="hidden sm:inline">Map</span>
      </button>
      <button
        type="button"
        onClick={() => setViewMode('grid')}
        aria-pressed={viewMode === 'grid'}
        aria-label="Grid view"
        className={'border-l border-black/10 dark:border-white/10 ' + segCls(viewMode === 'grid')}
      >
        <LayoutGrid size={13} aria-hidden /> <span className="hidden sm:inline">Grid</span>
      </button>
      {notesVisible && (
        <FloorNotesButton
          floorId={floor.id}
          buildingId={floor.building_id}
          notes={floor.floor_notes}
          canEdit={canEdit}
          trigger={
            <button
              type="button"
              aria-label="Floor notes"
              className={'relative border-l border-black/10 dark:border-white/10 ' + segCls(false)}
            >
              <NotebookPen size={13} aria-hidden /> <span className="hidden sm:inline">Notes</span>
              {!!floor.floor_notes?.trim() && (
                <span aria-hidden className="absolute right-1 top-1 inline-block h-1.5 w-1.5 rounded-full bg-waymarks-gold sm:static" />
              )}
            </button>
          }
        />
      )}
    </div>
  ) : null;

  // "⋯ More" overflow. Two variants:
  //  • base (lg+): Replace plan, Plan source, Lock all, Delete floor.
  //  • narrow (<lg): the above PLUS Offline + Visualize, which collapse in here
  //    as the screen narrows (they sit in the toolbar only at lg+).
  const onVisualize = () => window.open(viewmarkUrl, '_blank', 'noopener,noreferrer');
  const moreMenuBase =
    floor.plan_url && (canUploadPlan || (canEdit && hasPins)) ? (
      <FloorMoreMenu
        floorId={floor.id}
        buildingId={floor.building_id}
        provenance={floor.plan_provenance}
        allPinsLocked={allPinsLocked}
        hasPins={hasPins}
        canUploadPlan={canUploadPlan}
        canEditPins={canEdit}
        onReplacePlan={() => setUploadOpen(true)}
      />
    ) : null;
  // Narrow variant always renders — it carries Visualize (always available) and,
  // when there's a plan, Offline + the plan actions.
  const moreMenuNarrow = (
    <FloorMoreMenu
      floorId={floor.id}
      buildingId={floor.building_id}
      provenance={floor.plan_provenance}
      allPinsLocked={allPinsLocked}
      hasPins={hasPins}
      canUploadPlan={canUploadPlan}
      canEditPins={canEdit}
      onReplacePlan={() => setUploadOpen(true)}
      offline={
        floor.plan_url
          ? { cached: cacheState === 'cached', busy: cacheState === 'caching', onToggle: () => void takeOffline() }
          : undefined
      }
      onVisualize={onVisualize}
    />
  );

  // Filter segment — Zone / Type, each opening its popover.
  const filterSeg = () => showFilters ? (
    <div className="inline-flex h-9 shrink-0 overflow-hidden rounded-lg border border-black/15 dark:border-white/15">
      <FilterByZonePopover
        zones={zoneOptions}
        selectedZones={filterZones}
        onChange={setFilterZones}
        trigger={
          <button type="button" aria-label="Filter pins by layer" className={filterSegCls(filterZones.size > 0)}>
            <MapIcon size={13} aria-hidden /> Layer {filterZones.size > 0 && countBadge(filterZones.size)}
          </button>
        }
      />
      <FilterByTypePopover
        selectedTypes={filterTypes}
        onChange={setFilterTypes}
        trigger={
          <button
            type="button"
            aria-label="Filter pins by type"
            className={'border-l border-black/10 dark:border-white/10 ' + filterSegCls(filterTypes.size > 0)}
          >
            <Shapes size={13} aria-hidden /> Type {filterTypes.size > 0 && countBadge(filterTypes.size)}
          </button>
        }
      />
    </div>
  ) : null;

  // Phone-tier: Zone + Type collapse into one "Filter" sheet.
  const combinedFilter = showFilters ? (
    <FloorFilterSheet
      zones={zoneOptions}
      selectedZones={filterZones}
      onZonesChange={setFilterZones}
      selectedTypes={filterTypes}
      onTypesChange={setFilterTypes}
    />
  ) : null;

  const offlineBtn = floor.plan_url ? (
    <Tooltip text={cacheState === 'cached' ? 'This floor is saved for offline use — tap to refresh' : 'Save this floor and its plan for offline use'}>
      <button
        type="button"
        onClick={() => void takeOffline()}
        disabled={cacheState === 'caching'}
        aria-pressed={cacheState === 'cached'}
        className={
          'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors disabled:opacity-60 ' +
          (cacheState === 'cached'
            ? 'border-success bg-success-bg text-success'
            : 'border-black/15 bg-surface text-text hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5')
        }
      >
        {cacheState === 'cached' ? <Check size={13} aria-hidden /> : <Download size={13} aria-hidden />}
        {cacheState === 'cached' ? 'Cached' : 'Offline'}
      </button>
    </Tooltip>
  ) : null;

  const visualizeBtn = (
    <Tooltip text="Open ViewMark to mock up signage on a wall photo">
      <button
        type="button"
        onClick={() => window.open(viewmarkUrl, '_blank', 'noopener,noreferrer')}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-accent bg-surface px-3 text-xs font-medium text-accent transition-colors hover:bg-waymarks-gold-soft dark:bg-transparent"
      >
        <Eye size={13} aria-hidden />
        Visualize
      </button>
    </Tooltip>
  );

  const filterLabel = showFilters ? (
    <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-text-faint">
      Filter
    </span>
  ) : null;
  const visibleBadge = showFilters && filtersActive ? (
    <span className="inline-flex h-9 shrink-0 items-center rounded-lg bg-waymarks-gold-soft px-2 text-[11px] font-medium text-waymarks-ink">
      {visibleAssets.length} of {assets.length} visible
    </span>
  ) : null;

  // Focus / presentation mode toggle (map only). Hides all chrome.
  const focusBtn = () => floor.plan_url && viewMode === 'map' ? (
    <Tooltip text="Focus mode — present the plan full-screen">
      <button
        type="button"
        onClick={() => setFocus(true)}
        aria-label="Enter focus mode"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black/15 bg-surface text-text-muted transition-colors hover:bg-black/5 hover:text-text dark:border-white/15 dark:hover:bg-white/5"
      >
        <Maximize2 size={15} aria-hidden />
      </button>
    </Tooltip>
  ) : null;

  // Map mode fills the viewport (definite-height chain via AppShell) so the
  // plan canvas's h-full resolves and its recenter/zoom controls stay on-screen.
  // Grid + empty state keep the normal scrolling page.
  const mapFill = Boolean(floor.plan_url) && viewMode === 'map';

  return (
    <AppShell fillViewport={mapFill} hideChrome={focus}>
      <div
        className={cn(
          'mx-auto flex w-full flex-col',
          focus
            ? 'h-full min-h-0 max-w-none px-2 py-2'
            : cn(
                'max-w-5xl px-4 py-3 sm:px-6 sm:py-4',
                mapFill ? 'h-full min-h-0' : 'min-h-[calc(100dvh-3.5rem)]'
              )
        )}
      >
        {/* Slice 1-fix-2 toolbar — a FIXED, compact band with three NON-
            overlapping zones: breadcrumb (left, truncates) · primaries (own
            space) · controls (right). The controls are shrink-0 and collapse by
            breakpoint into the "⋯" overflow so nothing ever sits on top of
            anything else. Hidden entirely in focus mode. Per-table — no bundles. */}
        {!focus && (
          <div className="mb-3 shrink-0 rounded-xl border border-black/10 bg-surface-soft px-2.5 py-2.5 dark:border-white/10 dark:bg-white/5 sm:px-3">
            {/* ── Desktop (xl+): full 2-row right cluster — everything visible.
                breadcrumb flex-1 (truncates); primaries + controls are shrink-0
                so the cluster takes its content width and never overlaps. ── */}
            <div className="hidden items-center gap-4 xl:flex">
              <div className="min-w-0 flex-1">{breadcrumb}</div>
              {hasPrimary && (
                <div className="flex shrink-0 items-center gap-3">
                  {addPinCircle()}
                  {auditCircle()}
                </div>
              )}
              <div className="flex shrink-0 flex-col items-end gap-2">
                <div className="flex flex-nowrap items-center gap-2">
                  {viewSeg()}
                  {focusBtn()}
                  {moreMenuBase}
                </div>
                {(showFilters || floor.plan_url) && (
                  <div className="flex flex-nowrap items-center justify-end gap-2">
                    {filterLabel}
                    {filterSeg()}
                    {visibleBadge}
                    {offlineBtn}
                    {visualizeBtn}
                  </div>
                )}
              </div>
            </div>

            {/* ── <xl (small desktop + tablet + phone): one compact band; the
                sidebar eats ~190px at lg, so the cluster stays collapsed here —
                Offline/Visualize → ⋯; on phone Layer/Type → one Filter sheet
                and the view switcher goes icon-only. ── */}
            <div className="xl:hidden">
              <div className="mb-2 flex items-center gap-2">
                <div className="min-w-0 flex-1">{breadcrumb}</div>
                {visibleBadge}
              </div>
              <div className="flex items-center gap-2">
                {hasPrimary && (
                  <div className="flex shrink-0 items-center gap-2">
                    {addPinCircle()}
                    {auditCircle()}
                  </div>
                )}
                <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
                  {viewSeg()}
                  {showFilters && <div className="hidden sm:block">{filterSeg()}</div>}
                  {showFilters && <div className="sm:hidden">{combinedFilter}</div>}
                  {focusBtn()}
                  {moreMenuNarrow}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Focus mode: a small floating control to restore normal view. */}
        {focus && (
          <button
            type="button"
            onClick={() => setFocus(false)}
            className="fixed right-3 top-3 z-50 inline-flex h-9 items-center gap-1.5 rounded-lg bg-waymarks-ink/85 px-3 text-xs font-medium text-white shadow-sheet backdrop-blur transition-colors hover:bg-waymarks-ink"
          >
            <Minimize2 size={14} aria-hidden />
            Exit focus
          </button>
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
            <ClipboardCheck size={14} aria-hidden className="text-waymarks-gold" />
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
            <div className="relative min-h-0 flex-1">
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
          onClose={() => setInAudit(false)}
        />
      )}

    </AppShell>
  );
}

// =============================================================================
// Filter helpers (M22 #6)
// =============================================================================

