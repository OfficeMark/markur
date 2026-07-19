import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, ClipboardCheck, FileDown, ImageOff, LayoutGrid, Map as MapIcon, Maximize2, MapPin, Minimize2, NotebookPen, Shapes, Trash2, Video } from 'lucide-react';
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
import { FilterByTextInput } from '@/components/waymarks/FilterByTextInput';
import { AuditVideoRecorderDialog } from '@/components/waymarks/AuditVideoRecorderDialog';
import { FloorMoreMenu } from '@/components/waymarks/FloorMoreMenu';
import { FloorNotesButton } from '@/components/waymarks/FloorNotesButton';
import { AuditPathEditBar } from '@/components/waymarks/AuditPathEditBar';
import { useQuery } from '@tanstack/react-query';
import {
  useClearFloorAuditPath,
  useFloorAuditPath,
  useSaveFloorAuditPath,
} from '@/hooks/useAuditPath';
import { useFloors, useSoftDeleteFloor } from '@/hooks/useFloors';
import { PlanProvenanceCaption } from '@/components/waymarks/PlanProvenanceCaption';
import { useAssets, useSoftDeleteAsset, useUpdateAsset } from '@/hooks/useAssets';
import { useAssetTypes } from '@/hooks/useAssetTypes';
import { useFloorView, useAppBoot } from '@/hooks/useBundles';
import {
  useActiveAuditSession,
  useLatestConfirmedByFloor,
  useStartAudit,
} from '@/hooks/useAudit';
import { useAuth } from '@/lib/auth-context';
import { useCan } from '@/lib/permissions-context';
import { planKindForPath, planRefreshStamp, signedUrlForPlan } from '@/lib/upload';
import { pinNumberMatchesQuery } from '@/lib/pin-types';
import { pinAppearanceFromSettings } from '@/lib/pin-appearance';
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
  const { user } = useAuth();
  // get_floor_view is the floor's SOLE fetch: floor + assets + per-pin photos +
  // audit data. The floor reads everything off it; the per-table hooks below are
  // disabled (they just read the seeded caches), and pin mutations patch those
  // caches in place — so a cold open fires only the bundles + signing, and a pin
  // action fires a single PATCH with no floor refetch.
  const floorView = useFloorView(id, user?.id);
  const floor = floorView.data?.floor ?? null;
  const fLoading = floorView.isLoading;
  const fError = floorView.error as Error | null;
  // Building comes from the app_boot bundle (it carries every building the user
  // can see, with settings), so the floor doesn't fire its own buildings query.
  const boot = useAppBoot();
  const building = useMemo(
    () => boot.data?.buildings.find((b) => b.id === floor?.building_id) ?? null,
    [boot.data, floor?.building_id]
  );
  const pinAppearance = useMemo(
    () => pinAppearanceFromSettings(building?.settings),
    [building?.settings]
  );
  const { data: assets = [] } = useAssets(id, { enabled: false });
  // Floor-to-floor navigation: the building's floors in sidebar order, so a
  // walkthrough steps Ground -> 2 -> 3 without bouncing out to the building
  // page between floors. Hook lives up here (unconditional) per hooks rules.
  const { data: buildingFloors } = useFloors(floor?.building_id);
  // Subscribe to the org asset-type catalog so the pin layer recolours the
  // instant the colours load (useAssetTypes writes the runtime colour map during
  // render). It now reads the catalogue from app_boot — no separate fetch.
  useAssetTypes();

  const canUploadPlan = useCan('upload_plan', { type: 'building', id: floor?.building_id ?? '' });
  const canCreate = useCan('create', { type: 'building', id: floor?.building_id ?? '' });
  const canEdit = useCan('edit', { type: 'building', id: floor?.building_id ?? '' });
  const canAudit = useCan('audit', { type: 'floor', id: id ?? '' });
  const canDeleteFloor = useCan('delete', { type: 'floor', id: id ?? '' });
  const updateAsset = useUpdateAsset(id);
  const softDelete = useSoftDeleteAsset(id);
  const softDeleteFloor = useSoftDeleteFloor(floor?.building_id);
  const navigate = useNavigate();
  const [exportingPdf, setExportingPdf] = useState(false);

  // Floor-level video walkthrough recorder (floor scope → assetId={null}).
  const [videoRecorderOpen, setVideoRecorderOpen] = useState(false);
  // Delete-floor confirmation (name-typed StepUpDialog, like building delete).
  const [deleteFloorOpen, setDeleteFloorOpen] = useState(false);
  const [deleteFloorError, setDeleteFloorError] = useState<string | null>(null);

  // M6 — audit walkaround. These read the caches get_floor_view seeds above
  // (enabled:false → no own fetch); start/end-audit + the confirm patch keep
  // them live, so the floor no longer fires active-session / last-confirmed
  // requests on open.
  const { data: lastAuditByAsset } = useLatestConfirmedByFloor(id, { enabled: false });
  const { data: activeSession } = useActiveAuditSession(id, user?.id, { enabled: false });
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
  // M22 (#6) — free-text filter that ANDs with the Type + Zone facets. Matches
  // pin #, name, location notes, room number, notes, and vendor name/company.
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

  // Which pins have a video — read from the get_floor_view bundle, so the floor
  // doesn't fire a separate assets-with-videos query. Add/delete-video re-seed it.
  const assetsWithVideos = useMemo(
    () => new Set(floorView.data?.asset_video_ids ?? []),
    [floorView.data?.asset_video_ids]
  );

  // The plan's signed URL, as a CACHED query (25-min staleTime, mirrors the
  // photo PERF-3 pattern). Two jobs at once:
  //   1. REPLACE CORRECTNESS — the key carries planRefreshStamp
  //      (planPrep.processedAt) as well as plan_url, because Plan Prep writes
  //      plates to a canonical slot: a replace rewrites the same plan_url
  //      string, and a path-only key would keep serving the old image until a
  //      hard reload. New stamp → new key → new signed URL → fresh download.
  //   2. RE-OPEN SPEED — within the staleTime, reopening the floor reuses the
  //      SAME signed URL, so the service worker's cache serves the plate
  //      instantly instead of re-downloading it on every visit (the profile
  //      showed each open paying a fresh sign + full plate download).
  // Signed URLs live 30 min; 25-min staleTime keeps handed-out URLs valid.
  const planUrl = floor?.plan_url ?? null;
  const planStamp = planRefreshStamp(floor?.plan_metadata);
  const signedUrlQuery = useQuery({
    queryKey: ['plan-signed-url', planUrl, planStamp],
    queryFn: () => signedUrlForPlan(planUrl as string),
    enabled: !!planUrl,
    staleTime: 25 * 60_000,
    gcTime: 30 * 60_000,
  });
  const signedUrl = planUrl ? (signedUrlQuery.data ?? null) : null;
  const signedUrlError = signedUrlQuery.isError
    ? signedUrlQuery.error instanceof Error
      ? signedUrlQuery.error.message
      : 'Could not load plan URL'
    : null;

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

  // Stable identities so the memoized PinOverlay doesn't re-render every time
  // Floor re-renders for unrelated state (placing, signed-url, cache state, …).
  const startReposition = useCallback((assetId: string) => {
    setSelectedAssetId(null); // close drawer
    setPendingMove(null);
    setRepositionAssetId(assetId);
  }, []);
  function cancelReposition() {
    setPendingMove(null);
    setRepositionAssetId(null);
  }
  const onRepositionDragEnd = useCallback(
    (assetId: string, x: number, y: number) => {
      const a = assets.find((a) => a.id === assetId);
      if (!a) return;
      if (Math.abs(a.x - x) < 0.0005 && Math.abs(a.y - y) < 0.0005) {
        setPendingMove(null);
        return;
      }
      setPendingMove({ assetId, from: { x: a.x, y: a.y }, to: { x, y } });
    },
    [assets]
  );
  const onSelectAsset = useCallback((a: Asset) => setSelectedAssetId(a.id), []);
  const updateAssetMutate = updateAsset.mutate;
  const onReposition = useCallback(
    (assetId: string, x: number, y: number) =>
      updateAssetMutate({ id: assetId, patch: { x, y } }),
    [updateAssetMutate]
  );
  const pendingRepositionCoords = useMemo(
    () => (pendingMove ? { x: pendingMove.to.x, y: pendingMove.to.y } : null),
    [pendingMove]
  );
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
  const trimmedFilterText = filterText.trim().toLowerCase();
  const visibleAssets = useMemo(() => {
    return baseSet.filter((a) => {
      if (filterTypes.size > 0 && !filterTypes.has(a.type)) return false;
      if (filterZones.size > 0 && !filterZones.has((a.zone ?? '').trim())) return false;
      if (trimmedFilterText && !matchesAssetText(a, trimmedFilterText)) return false;
      return true;
    });
  }, [baseSet, filterTypes, filterZones, trimmedFilterText]);
  const filtersActive =
    filterTypes.size > 0 || filterZones.size > 0 || trimmedFilterText.length > 0;

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

  // Prev/next within this building (sidebar order). Ends render dimmed.
  const floorIdx = buildingFloors?.findIndex((f) => f.id === floor.id) ?? -1;
  const prevFloor = floorIdx > 0 ? buildingFloors?.[floorIdx - 1] : undefined;
  const nextFloor =
    floorIdx >= 0 && buildingFloors && floorIdx < buildingFloors.length - 1
      ? buildingFloors[floorIdx + 1]
      : undefined;


  const breadcrumb = (
    <nav
      aria-label="Breadcrumb"
      // overflow-hidden is load-bearing: without it, when the crumb's content
      // is wider than its flex box, the text doesn't truncate — it PAINTS PAST
      // the box and disappears UNDER the opaque buttons rendered after it
      // (Randy's "the words are behind the button, not shorter"). Clipping at
      // the box edge guarantees worst-case is a clean cut inside the crumb.
      className="flex min-w-0 items-center gap-1.5 overflow-hidden text-xs text-text-muted"
    >
      {/* Home + its chevron hide on phones: the hamburger already covers Home,
          and at 390px every pixel here belongs to the building + floor. */}
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
      <span className="truncate font-semibold text-text">{floor.label}</span>
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
      canDeleteFloor={canDeleteFloor}
      onDeleteFloor={() => {
        setDeleteFloorError(null);
        setDeleteFloorOpen(true);
      }}
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

  // Sign catalogue — links to the printable /catalogue page (a separate route
  // from the grid's inline PDF export). Bordered toolbar button, icon + label
  // (label drops on phones like the other controls).
  const catalogueLink = () => assets.length > 0 ? (
    <Tooltip text="View the sign catalogue for this floor (print or download as PDF)">
      <Link
        to={`/floors/${floor.id}/catalogue`}
        aria-label="Floor catalogue"
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-black/15 bg-surface px-2 text-xs font-medium text-text-muted transition-colors hover:bg-black/5 hover:text-text sm:px-3 dark:border-white/15 dark:hover:bg-white/5"
      >
        <FileDown size={14} aria-hidden />
        <span className="hidden sm:inline">Catalogue</span>
      </Link>
    </Tooltip>
  ) : null;

  // Floor-level video walkthrough — a top-level toolbar button (editor-gated),
  // opens the recorder in deferred-capture mode (assetId=null → building scope).
  const recordBtn = () => canEdit ? (
    <Tooltip text="Record a video walkthrough of this floor">
      <button
        type="button"
        onClick={() => setVideoRecorderOpen(true)}
        aria-label="Record walkthrough"
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-black/15 bg-surface px-2 text-xs font-medium text-text-muted transition-colors hover:bg-black/5 hover:text-text sm:px-3 dark:border-white/15 dark:hover:bg-white/5"
      >
        <Video size={14} aria-hidden />
        <span className="hidden sm:inline">Record</span>
      </button>
    </Tooltip>
  ) : null;

  // Free-text pin filter (M22 #6). Fixed-width on desktop (sits in the filter
  // cluster); stretches full-width in the phone filter band below the toolbar.
  const textFilter = showFilters ? (
    <FilterByTextInput value={filterText} onChange={setFilterText} />
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
            {/* sm+: the full trail (Home › building › ‹ floor ›). */}
            <div className="min-w-0 flex-1 max-sm:hidden">{breadcrumb}</div>
            {/* Phones — the control row carries ONLY icons (nothing to trap):
                Back to the building on the left, buttons on the right. The
                floor name + ‹ › steppers live as an overlay on the map window
                itself (top-left), where there's room — Randy's design. */}
            <div className="flex min-w-0 flex-1 items-center sm:hidden">
              <Link
                to={`/buildings/${floor.building_id}`}
                aria-label={`Back to ${building?.name ?? 'building'}`}
                title={building?.name ?? 'Building'}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black/15 bg-surface text-text-muted hover:bg-black/5 hover:text-text dark:border-white/15 dark:hover:bg-white/5"
              >
                <ArrowLeft size={16} aria-hidden />
              </Link>
            </div>
            {visibleBadge}
            {hasPrimary && (
              <div className="flex shrink-0 items-center gap-2">
                {addPinBtn()}
                {auditBtn()}
              </div>
            )}
            <div className="flex shrink-0 items-center gap-1.5">
              {viewSeg()}
              {/* Free-text filter — desktop only; on phones it lives in the
                  full-width band below the toolbar (added after this row). */}
              {showFilters && <div className="hidden w-44 sm:block">{textFilter}</div>}
              {showFilters && <div className="hidden sm:block">{filterSeg()}</div>}
              {showFilters && <div className="sm:hidden">{combinedFilter}</div>}
              {recordBtn()}
              {catalogueLink()}
              {/* Focus is a presentation feature; on phones the map already
                  fills the screen and the width belongs to the breadcrumb. */}
              <div className="hidden sm:block">{focusBtn()}</div>
              {moreMenu}
            </div>
          </div>
        )}

        {/* Phone-tier free-text filter band — the desktop cluster has room for
            the input inline, but on phones the toolbar is icons-only, so the
            text filter drops to its own full-width row beneath it. */}
        {!focus && showFilters && (
          <div className="mb-3 sm:hidden">{textFilter}</div>
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
              onExportPdf={() => void exportCatalogue()}
              exporting={exportingPdf}
            />
          ) : (
            <div className="relative min-h-0 flex-1">
              {/* Floor-hop overlay: ‹ › on the map, at EVERY width — the one
                  place floor stepping lives (the breadcrumb is plain text).
                  The name pill is phone-only; desktop's breadcrumb already
                  says which floor this is. */}
              <div className="absolute left-2 top-2 z-10 flex flex-col items-start gap-1">
                <div className="flex items-center gap-1">
                  {prevFloor ? (
                    <Link
                      to={`/floors/${prevFloor.id}`}
                      aria-label={`Previous floor: ${prevFloor.label}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-waymarks-ink/85 text-white/90 shadow-sm hover:bg-waymarks-ink"
                    >
                      <ChevronLeft size={18} aria-hidden />
                    </Link>
                  ) : (
                    <span aria-hidden className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-waymarks-ink/40 text-white/40">
                      <ChevronLeft size={18} />
                    </span>
                  )}
                  {nextFloor ? (
                    <Link
                      to={`/floors/${nextFloor.id}`}
                      aria-label={`Next floor: ${nextFloor.label}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-waymarks-ink/85 text-white/90 shadow-sm hover:bg-waymarks-ink"
                    >
                      <ChevronRight size={18} aria-hidden />
                    </Link>
                  ) : (
                    <span aria-hidden className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-waymarks-ink/40 text-white/40">
                      <ChevronRight size={18} />
                    </span>
                  )}
                </div>
                <span className="max-w-[60vw] truncate rounded-md bg-waymarks-ink/85 px-2 py-1 text-xs font-semibold text-white shadow-sm sm:hidden">
                  {floor.label}
                </span>
              </div>
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
                    onSelectAsset={onSelectAsset}
                    onReposition={onReposition}
                    repositionAssetId={repositionAssetId}
                    onRepositionDragEnd={onRepositionDragEnd}
                    pendingRepositionCoords={pendingRepositionCoords}
                    lastAuditByAsset={lastAuditByAsset ?? null}
                    onLongPress={canEdit && !editingPath ? startReposition : undefined}
                    pinShape={pinAppearance.pinShape}
                    pinSize={pinAppearance.pinSize}
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
          auditPath={savedAuditPath?.path ?? null}
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

      {canDeleteFloor && (
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

