import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronRight,
  ClipboardList,
  Flag,
  SkipForward,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FloorPlanCanvas } from '@/components/waymarks/FloorPlanCanvas';
import { PinOverlay } from '@/components/waymarks/PinOverlay';
import { AuditCompleteSummary } from '@/components/waymarks/AuditCompleteSummary';
import { AuditFlagDialog } from '@/components/waymarks/AuditFlagDialog';
import { useAuditEvents, useCreateAuditEvent, useEndAudit, summarizeSession } from '@/hooks/useAudit';
import { useUpdateAsset } from '@/hooks/useAssets';
import { useOrgBranding } from '@/hooks/useBranding';
import { createFlag } from '@/lib/queries/flags';
import type { AssetStatus } from '@/lib/asset-status';
import type { Asset, AuditSession } from '@/types/database';
import { DEFAULT_PIN_SHAPE, DEFAULT_PIN_SIZE, type PinShape, type PinSize } from '@/lib/queries/branding';
// PlanKind isn't exported as a named type yet; use the inline literal
import type { AuditOutcome } from '@/lib/queries/audit-events';

/**
 * Full-screen audit walkaround mode (M6).
 *
 * Top bar = AUDIT badge + floor name + progress + End. Floor plan fills
 * viewport. Pins are color-coded for THIS session: green = audited (last
 * outcome 'confirmed'), red = flagged this session, amber = unvisited or
 * skipped. Bottom sheet shows the current asset with three actions and a
 * Next button to auto-advance to the nearest unvisited pin.
 */

export type AuditModeShellProps = {
  session: AuditSession;
  floorLabel: string;
  buildingName: string;
  assets: Asset[];
  planUrl: string;
  planKind: 'pdf' | 'image';
  /** Pin to pre-select on open (drawer "Log a flag" CTA); null = none. */
  initialAssetId?: string | null;
  pinShape?: PinShape;
  pinSize?: PinSize;
  onClose: () => void;
};

export function AuditModeShell({
  session,
  floorLabel,
  buildingName,
  assets,
  planUrl,
  planKind,
  initialAssetId,
  pinShape = DEFAULT_PIN_SHAPE,
  pinSize = DEFAULT_PIN_SIZE,
  onClose,
}: AuditModeShellProps) {
  const { data: events = [] } = useAuditEvents(session.id);
  const createEvent = useCreateAuditEvent(session.floor_id);
  const endAudit = useEndAudit(session.floor_id, session.auditor_id);
  const [currentId, setCurrentId] = useState<string | null>(initialAssetId ?? null);
  const [showSummary, setShowSummary] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  // Flag capture (M33): tapping "Flag issue" opens a form before any write.
  const [flagAsset, setFlagAsset] = useState<Asset | null>(null);
  const [flagBusy, setFlagBusy] = useState(false);
  const [flagError, setFlagError] = useState<string | null>(null);
  const updateAsset = useUpdateAsset(session.floor_id);
  const { logoUrl: pinLogoUrl } = useOrgBranding();

  const { auditedAssetIds, lastByAsset } = useMemo(() => summarizeSession(events), [events]);
  const total = assets.length;
  const auditedCount = auditedAssetIds.size;
  const missed = Math.max(0, total - auditedCount);

  // Pin status override drives audit-mode coloring (overrides the persistent
  // age-based status). Outcomes:
  //   confirmed → 'good' (green)
  //   flagged   → 'flagged' (red)
  //   skipped   → unchanged (still 'attention' so auditor can come back)
  //   unvisited → 'attention' (amber, so the unaudited pins stand out)
  const statusOverride = useMemo<Map<string, AssetStatus>>(() => {
    const m = new Map<string, AssetStatus>();
    for (const a of assets) {
      const last = lastByAsset.get(a.id);
      if (last?.outcome === 'confirmed') m.set(a.id, 'good');
      else if (last?.outcome === 'flagged') m.set(a.id, 'flagged');
      else m.set(a.id, 'attention');
    }
    return m;
  }, [assets, lastByAsset]);

  const current = currentId ? assets.find((a) => a.id === currentId) ?? null : null;

  // Auto-advance to the nearest unvisited asset.
  function advanceToNext() {
    const remaining = assets.filter((a) => !lastByAsset.has(a.id));
    setCurrentId(remaining[0]?.id ?? null);
  }

  /**
   * Discard the audit entirely without writing a summary or completing the
   * session — the auditor opened audit mode by mistake or wants to bail.
   * Sets completed_at so the partial session doesn't haunt the resume banner;
   * any events already recorded are preserved (they're still part of the
   * audit trail), just the session counter doesn't get final totals.
   */
  const handleDiscardAudit = useCallback(async () => {
    try {
      await endAudit.mutateAsync({
        id: session.id,
        assets_audited: 0,
        assets_missed: total,
        notes: 'Audit cancelled before completion.',
      });
      onClose();
    } catch {
      // Non-fatal — surface in the existing endError region if it ever fails.
    }
  }, [endAudit, session.id, total, onClose]);

  // Esc closes the audit shell — but only if no event has been recorded yet.
  // After the first event, Esc is a no-op so the user has to End Audit
  // deliberately (which writes the completion timestamp).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (events.length === 0) {
        // Quick exit if nothing happened yet — they probably opened it by
        // accident. Discard the empty session so the resume banner doesn't
        // surface it later.
        void handleDiscardAudit();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [events.length, handleDiscardAudit]);

  function handleOutcome(outcome: AuditOutcome) {
    if (!current) return;
    setEndError(null);
    // "Flag issue" opens the capture form (required description + optional
    // photos); the flag + audit event are written on save. Confirm OK and
    // Skip stay one-tap.
    if (outcome === 'flagged') {
      setFlagError(null);
      setFlagAsset(current);
      return;
    }
    void createEvent
      .mutateAsync({ session_id: session.id, asset_id: current.id, outcome })
      .then(() => {
        // After the user acts on the current asset, advance.
        // Do this in a microtask so the lastByAsset map has been refreshed
        // by the optimistic update before we read it.
        setTimeout(advanceToNext, 0);
      });
  }

  /**
   * Save a flag raised from the capture form: write the flag row (with photo
   * evidence), record the matching 'flagged' audit event, and persist the
   * pin's status so it reads as flagged after the audit ends.
   */
  async function handleFlagSubmit(description: string, photos: File[], contactId: string | null) {
    if (!flagAsset) return;
    setFlagBusy(true);
    setFlagError(null);
    try {
      await createFlag({ assetId: flagAsset.id, description, photos, contactId });
      await createEvent.mutateAsync({
        session_id: session.id,
        asset_id: flagAsset.id,
        outcome: 'flagged',
        notes: description,
      });
      await updateAsset.mutateAsync({
        id: flagAsset.id,
        patch: { status: 'flagged' },
      });
      setFlagAsset(null);
      setTimeout(advanceToNext, 0);
    } catch (e) {
      setFlagError(e instanceof Error ? e.message : 'Could not save the flag.');
    } finally {
      setFlagBusy(false);
    }
  }

  async function handleEndAudit() {
    setEndError(null);
    setShowSummary(true);
  }


  async function confirmEnd() {
    try {
      await endAudit.mutateAsync({
        id: session.id,
        assets_audited: auditedCount,
        assets_missed: missed,
      });
      setShowSummary(false);
      onClose();
    } catch (e) {
      setEndError(e instanceof Error ? e.message : 'End-audit failed.');
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-waymarks-cream dark:bg-waymarks-ink">
      {/* Top bar */}
      <header className="flex items-center gap-3 border-b border-black/10 bg-surface px-4 py-3 dark:border-white/10">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-waymarks-gold px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.18em] text-white">
          <ClipboardList size={12} aria-hidden /> Audit
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-text-faint">{buildingName}</p>
          <p className="truncate text-sm font-medium text-text">{floorLabel}</p>
        </div>
        <div className="hidden flex-col items-end sm:flex">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
            Progress
          </p>
          <p className="font-mono text-sm text-text">
            {auditedCount} / {total}
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          iconLeft={<X size={12} aria-hidden />}
          onClick={() => void handleEndAudit()}
          loading={endAudit.isPending}
        >
          End audit
        </Button>
      </header>

      {/* Progress bar */}
      <div className="h-1 w-full bg-black/5 dark:bg-white/10">
        <div
          className="h-full bg-waymarks-gold transition-[width]"
          style={{ width: `${total > 0 ? (auditedCount / total) * 100 : 0}%` }}
        />
      </div>

      {endError && (
        <div className="mx-3 mt-2 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">
          {endError}
        </div>
      )}

      {/* Floor plan */}
      <div className="relative flex-1 overflow-hidden p-3">
        <FloorPlanCanvas
          src={planUrl}
          kind={planKind}
          mode="view"
          pinOverlay={
            <PinOverlay
              assets={assets}
              selectedAssetId={currentId}
              canMove={false}
              statusOverride={statusOverride}
              onSelectAsset={(a) => setCurrentId(a.id)}
              pinShape={pinShape}
              pinSize={pinSize}
              pinLogoUrl={pinLogoUrl}
            />
          }
        />
      </div>

      {/* Bottom action sheet */}
      <BottomSheet
        current={current}
        busy={createEvent.isPending}
        lastOutcome={current ? lastByAsset.get(current.id)?.outcome ?? null : null}
        onOutcome={handleOutcome}
        onNext={advanceToNext}
        hasUnvisited={assets.some((a) => !lastByAsset.has(a.id))}
      />

      <AuditCompleteSummary
        open={showSummary}
        onOpenChange={setShowSummary}
        total={total}
        audited={auditedCount}
        missed={missed}
        missedAssets={assets.filter((a) => !lastByAsset.has(a.id))}
        onJumpTo={(assetId) => {
          setShowSummary(false);
          setCurrentId(assetId);
        }}
        onConfirmEnd={confirmEnd}
        endingBusy={endAudit.isPending}
      />

      <AuditFlagDialog
        open={!!flagAsset}
        asset={flagAsset}
        busy={flagBusy}
        error={flagError}
        onCancel={() => {
          if (!flagBusy) {
            setFlagAsset(null);
            setFlagError(null);
          }
        }}
        onSubmit={(description, photos, contactId) =>
          void handleFlagSubmit(description, photos, contactId)
        }
      />
    </div>
  );
}

function BottomSheet({
  current,
  busy,
  lastOutcome,
  onOutcome,
  onNext,
  hasUnvisited,
}: {
  current: Asset | null;
  busy: boolean;
  lastOutcome: string | null;
  onOutcome: (outcome: AuditOutcome) => void;
  onNext: () => void;
  hasUnvisited: boolean;
}) {
  return (
    <footer className="border-t border-black/10 bg-surface p-3 dark:border-white/10">
      {current ? (
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text">{current.name}</p>
              <p className="truncate text-xs text-text-faint">
                {prettyType(current.type)}
                {current.location_notes ? ` · ${current.location_notes}` : ''}
                {lastOutcome ? ` · last: ${lastOutcome}` : ''}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              iconRight={<ChevronRight size={12} aria-hidden />}
              onClick={onNext}
              disabled={!hasUnvisited}
            >
              Next
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              iconLeft={<Check size={12} aria-hidden />}
              loading={busy}
              onClick={() => onOutcome('confirmed')}
              className="!bg-success hover:!bg-success/90 disabled:!bg-success/40"
            >
              Confirm OK
            </Button>
            <Button
              size="sm"
              variant="danger"
              iconLeft={<Flag size={12} aria-hidden />}
              loading={busy}
              onClick={() => onOutcome('flagged')}
            >
              Flag issue
            </Button>
            <Button
              size="sm"
              variant="ghost"
              iconLeft={<SkipForward size={12} aria-hidden />}
              loading={busy}
              onClick={() => onOutcome('skipped')}
            >
              Skip
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-text-muted">
            {hasUnvisited
              ? 'Tap a pin or press Next to start.'
              : 'All pins visited. End audit when ready.'}
          </p>
          <Button
            size="sm"
            variant="gold"
            iconRight={<ChevronRight size={12} aria-hidden />}
            onClick={onNext}
            disabled={!hasUnvisited}
          >
            Next
          </Button>
        </div>
      )}
    </footer>
  );
}

function prettyType(type: string): string {
  return type
    .split('_')
    .map((p, i) => (i === 0 ? p[0]?.toUpperCase() + p.slice(1) : p))
    .join(' ');
}
