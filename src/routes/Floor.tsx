import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ChevronRight, ClipboardCheck, ImageOff, LayoutGrid, Map as MapIcon, Maximize2, MapPin, Minimize2, NotebookPen, Shapes, Trash2 } from 'lucide-react';
import { AppShell } from '@/components/waymarks/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { FloorPlanCanvas } from '@/components/waymarks/FloorPlanCanvas';
import type { FloorPlanUploadDialogProps } from '@/components/waymarks/FloorPlanUploadDialog';

// The plan-prep + pdfjs graph (~400 kB) loads only when the upload dialog is
// actually opened — never on plain floor open (Plan Prep v2 bundling law). We
// load it imperatively (not via React.lazy/Suspense) so we control every
// outcome: a failed import is retryable (React.lazy caches rejections forever),
// a hung import times out into a real error instead of an endless spinner, and
// a cancel fully resets. The module promise is cached only once it RESOLVES —
// a rejection nulls the cache so the next tap re-attempts a clean import.
type UploadDialogComponent = ComponentType<FloorPlanUploadDialogProps>;
type UploadDialogModule = { FloorPlanUploadDialog: UploadDialogComponent };
let uploadDialogPromise: Promise<UploadDialogModule> | null = null;
function loadUploadDialogModule(): Promise<UploadDialogModule> {
  if (!uploadDialogPromise) {
    uploadDialogPromise = import('@/components/waymarks/FloorPlanUploadDialog').catch((err) => {
      uploadDialogPromise = null; // don't cache the failure — allow a clean retry
      throw err;
    });
  }
  return uploadDialogPromise;
}
const UPLOAD_LOAD_TIMEOUT_MS = 15_000;
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
import { AuditPathEditBar } from '@/components/waymarks/AuditPathEditBar';
import { useAssetsWithVideos } from '@/hooks/useAuditVideos';
import {
  useClearFloorAuditPath,
  useFloorAuditPath,
  useSaveFloorAuditPath,
} from '@/hooks/useAuditPath';
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
import { planKindForPath, planRefreshStamp, signedUrlForPlan } from '@/lib/upload';
import { cn, mapWithConcurrency } from '@/lib/utils';
import {
  putAssetsForFloor,
  putBuilding,
  putFloor,
  putLastAudits,
} from '@/lib/offline';
// PERF-5: floor-catalogue pulls in jsPDF; load it only when exporting.
import { listFirstPhotoPaths, signedAssetPhotoUrl } from '@/lib/queries/asset-photos';
import { photoToJpegDataUrl } from '@/lib/photo-to-data-url';
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
  const [exportingPdf, setExportingPdf] = useState(false);

  // M6 — audit walkaround
  const { data: lastAuditByAsset } = useLatestConfirmedByFloor(id);
  const { data: activeSession } = useActiveAuditSession(id, user?.id);
  const startAudit = useStartAudit(id, user?.id);
  const [inAudit, setInAudit] = useState(false);
  // Pin to pre-select when entering Audit Mode (set by the AssetDrawer
  // "Log a flag" CTA; null for a normal audit start).
  const [auditInitialAssetId, setAuditInitialAssetId] = useState<string | null>(null);

  // Feature 1 — audit path (a saved walking order for the floor).
  const { data: savedAuditPath } = useFloorAuditPath(id);
  const savePath = useSaveFloorAuditPath(id ?? '');
  const clearPath = useClearFloorAuditPath(id ?? '');
  const [editingPath, setEditingPath] = useState(false);
  // Working order while editing. May include ids of assets deleted since the
  // path was saved — they render struck-through and are dropped on Save.
  const [pathOrder, setPathOrder] = useState<string[]>([]);

  // The upload/replace dialog is tied to the floor it was opened on, and loaded
  // imperatively on tap. `uploadState` is a small machine — idle → opening
  // (spinner) → open | error — all stamped with the floor id so the request can
  // never surface on a different floor than the one tapped. `uploadReqToken`
  // invalidates any in-flight chunk load on cancel / floor change / reopen, so a
  // slow or stale load can never resolve onto the wrong floor, and a cancel
  // always leaves a clean slate for the next tap.
  type UploadState =
    | { status: 'idle' }
    | { status: 'opening'; floorId: string }
    | { status: 'open'; floorId: string }
    | { status: 'error'; floorId: string; message: string };
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle' });
  const [UploadDialog, setUploadDialog] = useState<UploadDialogComponent | null>(null);
  const uploadReqToken = useRef(0);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [signedUrlError, setSignedUrlError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placePos, setPlacePos] = useState<{ x: number; y: number } | null>(null);
  const [newAssetOpen, setNewAssetOpen] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  // Cancel: bump the token (invalidating any in-flight load) and reset to idle.
  // This is the single reset path — Radix close, the spinner's Cancel button,
  // the error's Cancel, and floor-change all funnel through it, guaranteeing the
  // next tap starts fresh.
  const closeUploadDialog = useCallback(() => {
    uploadReqToken.current += 1;
    setUploadState({ status: 'idle' });
  }, []);

  const openUploadDialog = useCallback(() => {
    if (id == null) return;
    const token = (uploadReqToken.current += 1);
    const floorId = id;
    // Chunk already loaded this session → open immediately, no spinner flash.
    if (UploadDialog) {
      setUploadState({ status: 'open', floorId });
      return;
    }
    // Instant feedback, then load the chunk with a timeout guard.
    setUploadState({ status: 'opening', floorId });
    Promise.race([
      loadUploadDialogModule(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Plan tools took too long to load. Check your connection and try again.')),
          UPLOAD_LOAD_TIMEOUT_MS
        )
      ),
    ]).then(
      (m) => {
        if (uploadReqToken.current !== token) return; // superseded (cancelled / floor changed / reopened)
        setUploadDialog(() => m.FloorPlanUploadDialog);
        setUploadState({ status: 'open', floorId });
      },
      (err: unknown) => {
        if (uploadReqToken.current !== token) return;
        setUploadState({
          status: 'error',
          floorId,
          message: err instanceof Error ? err.message : 'Could not open plan tools.',
        });
      }
    );
  }, [id, UploadDialog]);

  // Cancel a pending/open upload request when the floor changes, so a slow
  // chunk load can never resolve onto — or a loaded dialog linger on — a
  // different floor's plan.
  useEffect(() => {
    if (uploadState.status !== 'idle' && uploadState.floorId !== id) {
      closeUploadDialog();
    }
  }, [id, uploadState, closeUploadDialog]);


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

  // Resolve a signed URL whenever the plan itself changes. plan_url alone is
  // NOT enough: Plan Prep v2 writes every display plate to the floor's
  // canonical slot (`<floorId>.plate.png`), so REPLACING a plan rewrites the
  // same string and this effect never re-ran — the old image stayed on screen
  // until a hard reload. planRefreshStamp (planPrep.processedAt) is rewritten
  // on every upload, so keying on it re-issues a signed URL after each
  // replace. Signed URLs are unique per issue, so the fresh URL also skips the
  // browser + service-worker caches and the canvas redraws with the new plan.
  const planStamp = planRefreshStamp(floor?.plan_metadata);
  useEffect(() => {
    let cancelled = false;
    if (!floor?.plan_url) {
      setSignedUrl(null);
      return;
    }
    setSignedUrl(null);
    setSignedUrlError(null);
    if (import.meta.env.DEV) {
      // Marker distinguishes "re-resolved after replace" from "never re-ran"
      // (the failure mode this effect's key exists to prevent). Dev-only so
      // the prod console stays clean.
      console.log('[plan] resolving signed URL', { planUrl: floor.plan_url, planStamp });
    }
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
  }, [floor?.plan_url, planStamp]);

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

  // ── Audit-path edit helpers (Feature 1) ───────────────────────────────────
  const presentAssetIds = useMemo(() => new Set(assets.map((a) => a.id)), [assets]);
  // 1-based stop number for each present pin in the working order (deleted ids
  // in pathOrder are skipped so the numbers the surveyor sees stay consecutive).
  const pathIndexById = useMemo(() => {
    const m = new Map<string, number>();
    let n = 0;
    for (const pid of pathOrder) {
      if (presentAssetIds.has(pid)) {
        n += 1;
        m.set(pid, n);
      }
    }
    return m;
  }, [pathOrder, presentAssetIds]);

  function startEditPath() {
    setSelectedAssetId(null);
    setPlacing(false);
    setRepositionAssetId(null);
    setViewMode('map');
    setPathOrder(savedAuditPath?.path ?? []);
    setEditingPath(true);
  }
  function exitEditPath() {
    setEditingPath(false);
    setPathOrder([]);
  }
  function togglePathPin(assetId: string) {
    setPathOrder((prev) =>
      prev.includes(assetId) ? prev.filter((x) => x !== assetId) : [...prev, assetId]
    );
  }
  async function saveAuditPath() {
    // Drop ids for pins deleted since the path was saved — re-saving cleans them.
    const cleaned = pathOrder.filter((pid) => presentAssetIds.has(pid));
    try {
      await savePath.mutateAsync(cleaned);
      exitEditPath();
    } catch {
      // Non-fatal; the bar stays open so the user can retry.
    }
  }
  async function clearAuditPath() {
    try {
      await clearPath.mutateAsync();
      exitEditPath();
    } catch {
      // Non-fatal; retry available.
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

  // S7 — surface the existing floor-catalogue PDF generator from the grid.
  // Per-table: one query for first-photo paths, then sign + inline each as a
  // JPEG data URL (same path Report.tsx uses). Photo-less assets render a "No
  // photo" placeholder card. Entries keep the generator's pin-number order;
  // grouping by Layer would need generator changes, so it's left as-is.
  async function exportCatalogue() {
    if (!floor) return;
    const when = new Date();
    const {
      buildCatalogueDoc,
      catalogueDownloadName,
      pickCatalogueSaveTarget,
      prepareCatalogueEntries,
      writeCatalogue,
    } = await import('@/lib/floor-catalogue');
    const fileName = catalogueDownloadName(building?.name ?? 'Building', floor.label, when);
    // pickCatalogueSaveTarget must run on the click's user activation, before
    // the slow photo work — so call it first, then load.
    const target = await pickCatalogueSaveTarget(fileName);
    if (target.kind === 'cancelled') return;
    setExportingPdf(true);
    try {
      const drafts = prepareCatalogueEntries(visibleAssets);
      const photoPaths = await listFirstPhotoPaths(drafts.map((d) => d.assetId));
      // PERF-6: cap concurrency (see Report.tsx).
      const entries = await mapWithConcurrency(drafts, 8, async (d) => {
          const path = photoPaths.get(d.assetId);
          let photoDataUrl: string | null = null;
          if (path) {
            try {
              photoDataUrl = await photoToJpegDataUrl(await signedAssetPhotoUrl(path));
            } catch {
              photoDataUrl = null;
            }
          }
          return { ...d, photoDataUrl };
      });
      const addressLine =
        [building?.address, building?.city].filter(Boolean).join(', ') || null;
      const doc = buildCatalogueDoc({
        buildingName: building?.name ?? 'Building',
        floorLabel: floor.label,
        addressLine,
        generatedOn: when,
        entries,
      });
      await writeCatalogue(doc, target, fileName);
    } catch {
      // Generation/write failed; the button re-enables so the user can retry.
    } finally {
      setExportingPdf(false);
    }
  }

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

  // Two focal actions as standard toolbar buttons (retired the oversized round
  // circles): orange "Add pin" (accent) + dark "Audit" (ink primary). h-9 to
  // line up with the segmented controls beside them.
  const addPinBtn = () => floor.plan_url && canCreate && (
    <Tooltip text={placing ? 'Cancel placing a pin' : 'Place a new pin by clicking the floor plan'}>
      <Button
        variant={placing ? 'primary' : 'accent'}
        size="sm"
        className="h-9 shrink-0"
        onClick={() => setPlacing((p) => !p)}
        aria-label={placing ? 'Cancel placing a pin' : 'Add pin'}
        iconLeft={<MapPin size={14} aria-hidden />}
      >
        <span className="hidden sm:inline">{placing ? 'Cancel' : 'Add pin'}</span>
      </Button>
    </Tooltip>
  );
  const auditBtn = () => showAuditCta && (
    <Tooltip text={activeSession ? 'Resume the audit walkaround you started' : 'Walk the floor and confirm every sign'}>
      <Button
        variant="primary"
        size="sm"
        className="h-9 shrink-0"
        onClick={() => void startOrResumeAudit()}
        loading={startAudit.isPending}
        aria-label={activeSession ? 'Resume audit' : 'Audit'}
        iconLeft={<ClipboardCheck size={14} aria-hidden />}
      >
        <span className="hidden sm:inline">{activeSession ? 'Resume' : 'Audit'}</span>
      </Button>
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

  // "⋯ More" overflow — one variant used at every width now (the toolbar is a
  // single row). It always carries Visualize, plus Take-offline and the plan
  // actions when there's a plan — the secondary controls that used to sprawl
  // across a second toolbar row live in here instead.
  const onVisualize = () => window.open(viewmarkUrl, '_blank', 'noopener,noreferrer');
  const moreMenu = (
    <FloorMoreMenu
      floorId={floor.id}
      buildingId={floor.building_id}
      provenance={floor.plan_provenance}
      allPinsLocked={allPinsLocked}
      hasPins={hasPins}
      canUploadPlan={canUploadPlan}
      canEditPins={canEdit}
      onReplacePlan={openUploadDialog}
      onEditPath={floor.plan_url ? startEditPath : undefined}
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
            : mapFill
              ? // Map view: no width cap — the plan claims the freed area
                // (slim sidebar + one-row toolbar). Tighter padding, full width.
                'h-full min-h-0 max-w-none px-3 py-2 sm:px-4 sm:py-3'
              : // Grid / empty state: keep a comfortable reading width.
                'max-w-5xl px-4 py-3 sm:px-6 sm:py-4 min-h-[calc(100dvh-3.5rem)]'
        )}
      >
        {/* Unified toolbar — ONE compact row at every width: breadcrumb (left,
            truncates) · focal actions + controls (right). No card wrapper and no
            second row, so laptop (1366) and desktop (1920) render identically —
            the row just gets more slack between the two zones as it widens.
            Secondary actions (Take-offline, Visualize, plan ops) live in the "⋯"
            overflow; on phones the Layer/Type filters collapse into one sheet and
            the focal-action labels drop to icons. Hidden entirely in focus mode. */}
        {!focus && (
          <div className="mb-3 flex shrink-0 items-center gap-3">
            <div className="min-w-0 flex-1">{breadcrumb}</div>
            {visibleBadge}
            {hasPrimary && (
              <div className="flex shrink-0 items-center gap-2">
                {addPinBtn()}
                {auditBtn()}
              </div>
            )}
            <div className="flex shrink-0 items-center gap-1.5">
              {viewSeg()}
              {showFilters && <div className="hidden sm:block">{filterSeg()}</div>}
              {showFilters && <div className="sm:hidden">{combinedFilter}</div>}
              {focusBtn()}
              {moreMenu}
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
              onExportPdf={() => void exportCatalogue()}
              exporting={exportingPdf}
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
                    // While editing the path every pin must be reachable, so
                    // bypass the type/layer filters.
                    assets={editingPath ? assets : visibleAssets}
                    selectedAssetId={selectedAssetId}
                    canMove={canEdit && !editingPath}
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
                    onLongPress={canEdit && !editingPath ? startReposition : undefined}
                    pathEditMode={editingPath}
                    pathIndexById={editingPath ? pathIndexById : null}
                    onPathToggle={togglePathPin}
                  />
                }
              />
              {/* Plan provenance moved off its own full-width line into the
                  map card's bottom-left corner (the zoom % + recenter live
                  bottom-right, so this stays clear). pointer-events-none so it
                  never intercepts a pan/place click. */}
              <PlanProvenanceCaption
                provenance={floor.plan_provenance}
                className="pointer-events-none absolute bottom-2 left-2 z-10 max-w-[60%] truncate rounded bg-surface/85 px-1.5 py-0.5 backdrop-blur-sm dark:bg-black/50"
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
              {editingPath && (
                <AuditPathEditBar
                  pathOrder={pathOrder}
                  assets={assets}
                  saving={savePath.isPending}
                  clearing={clearPath.isPending}
                  hasSavedPath={!!savedAuditPath}
                  onRemoveStop={togglePathPin}
                  onSave={() => void saveAuditPath()}
                  onClear={() => void clearAuditPath()}
                  onDone={exitEditPath}
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
                ? { label: 'Upload floor plan', onClick: openUploadDialog }
                : undefined
            }
          />
        )}
      </div>

      {canUploadPlan && uploadState.status === 'opening' && uploadState.floorId === id && (
        <UploadDialogOpening onCancel={closeUploadDialog} />
      )}
      {canUploadPlan && uploadState.status === 'error' && uploadState.floorId === id && (
        <UploadDialogError
          message={uploadState.message}
          onRetry={openUploadDialog}
          onCancel={closeUploadDialog}
        />
      )}
      {canUploadPlan && UploadDialog && uploadState.status === 'open' && uploadState.floorId === id && (
        <UploadDialog
          open
          onOpenChange={(o) => {
            if (!o) closeUploadDialog();
          }}
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
          auditPath={savedAuditPath?.path ?? null}
          onClose={() => setInAudit(false)}
        />
      )}

    </AppShell>
  );
}

/**
 * Instant feedback while the plan-prep chunk loads after tapping Upload /
 * Replace, so the user never sees a dead tap. Cancel resets cleanly.
 */
function UploadDialogOpening({ onCancel }: { onCancel: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 rounded-xl border border-black/10 bg-surface px-5 py-4 text-sm text-text shadow-sheet dark:border-white/10">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-waymarks-gold border-t-transparent" />
        <span>Opening plan tools…</span>
        <button
          type="button"
          onClick={onCancel}
          className="ml-1 rounded-md px-2 py-1 text-xs font-medium text-text-muted hover:bg-black/5 hover:text-text dark:hover:bg-white/5"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * Shown when the plan-prep chunk fails or times out loading (stale build,
 * flaky connection). Retry re-attempts a clean import — never a dead spinner
 * or a silent no-op.
 */
function UploadDialogError({
  message,
  onRetry,
  onCancel,
}: {
  message: string;
  onRetry: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-label="Couldn't open plan tools"
    >
      <div className="w-[min(92vw,420px)] rounded-xl border border-black/10 bg-surface p-5 text-text shadow-sheet dark:border-white/10">
        <div className="flex items-start gap-2 text-sm text-danger">
          <AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0" />
          <span>{message}</span>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="gold" onClick={onRetry}>
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Filter helpers (M22 #6)
// =============================================================================

