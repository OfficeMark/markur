import { useRef, useState } from 'react';
import type { Asset } from '@/types/database';
import { PinMarker } from './PinMarker';
import { computeStatus, type AssetStatus } from '@/lib/asset-status';
import { useOrgBranding } from '@/hooks/useBranding';
import { formatPinNumber } from '@/lib/pin-types';
import { cn } from '@/lib/utils';

export type PinOverlayProps = {
  assets: Asset[];
  selectedAssetId?: string | null;
  onSelectAsset: (asset: Asset) => void;
  /** Whether the current user can move unlocked pins via the M4 quick-drag. */
  canMove: boolean;
  /** Persist a new (x, y) for an asset after a quick-drag (M4 inline path). */
  onReposition?: (assetId: string, x: number, y: number) => void;

  // Deliberate reposition (M5) ---------------------------------------------
  /**
   * When set, this pin is in deliberate-reposition mode: it is the only
   * draggable pin (lock state ignored), other pins fade out, and the
   * pointer-up handler reports the candidate coordinates instead of
   * persisting them. The parent shows a confirmation toast and then either
   * commits via the regular update path or cancels.
   */
  repositionAssetId?: string | null;
  /** Drag-end callback in reposition mode. Parent decides what to do next. */
  onRepositionDragEnd?: (assetId: string, x: number, y: number) => void;
  /**
   * If the parent is showing a confirm-or-cancel toast for a pending move,
   * keep the pin pinned at these coords (overrides asset.x/y). Cleared by
   * the parent on confirm or cancel.
   */
  pendingRepositionCoords?: { x: number; y: number } | null;

  // Status drivers (M6) ----------------------------------------------------
  /**
   * Map<assetId → ISO timestamp of latest CONFIRMED audit_event>. Drives the
   * default age-based status (asset is "good" until the cycle elapses since
   * the last confirmed audit; "attention" after).
   */
  lastAuditByAsset?: ReadonlyMap<string, string> | null;
  /**
   * Direct override of the per-pin status. When provided, takes precedence
   * over the computed status. Used by AuditModeShell so pins reflect
   * *this session's* progress (green = audited this session, amber =
   * unvisited, red = flagged this session) instead of their persistent
   * status.
   */
  statusOverride?: ReadonlyMap<string, AssetStatus> | null;

  // Long-press reposition (M12) -------------------------------------------
  /**
   * Touch-only: 500ms press-and-hold on a pin invokes this with the
   * asset's id. Parent uses it to enter the deliberate-reposition flow
   * (same as the desktop "Move pin" button in the drawer). Only fires
   * when the user's finger has not moved beyond the drag threshold and
   * no reposition is already in progress.
   */
  onLongPress?: (assetId: string) => void;

  // Audit-path edit mode (Feature 1) --------------------------------------
  /**
   * When true, tapping a pin toggles its membership in the audit path
   * (instead of opening the drawer). Pins already in the path show a gold
   * sequence badge; others stay visible and tappable so they can be added.
   */
  pathEditMode?: boolean;
  /**
   * Map<assetId → 1-based stop number> for pins currently in the path.
   * Drives the sequence badge in path-edit mode.
   */
  pathIndexById?: ReadonlyMap<string, number> | null;
  /** Toggle a pin in/out of the path (path-edit mode only). */
  onPathToggle?: (assetId: string) => void;
};

const LONG_PRESS_MS = 500;

const DRAG_THRESHOLD_PX = 4;

type DragState = {
  assetId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  rectLeft: number;
  rectTop: number;
  rectWidth: number;
  rectHeight: number;
  moved: boolean;
  /** Latest clamped 0–1 coords while dragging. */
  curX: number;
  curY: number;
  /** Whether this drag is the deliberate-reposition path (vs. M4 quick-nudge). */
  reposition: boolean;
};

export function PinOverlay({
  assets,
  selectedAssetId,
  onSelectAsset,
  canMove,
  onReposition,
  repositionAssetId,
  onRepositionDragEnd,
  pendingRepositionCoords,
  lastAuditByAsset,
  statusOverride,
  onLongPress,
  pathEditMode,
  pathIndexById,
  onPathToggle,
}: PinOverlayProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const { pinShape, pinSize } = useOrgBranding();
  // dragRef is always-current; the React state below is for visualization only.
  const dragRef = useRef<DragState | null>(null);
  // Used to suppress click-after-drag.
  const justDraggedRef = useRef<string | null>(null);
  // Long-press timer (M12 - touch only). Cleared on movement / pointerup /
  // when it fires.
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearLongPress() {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }
  const [preview, setPreview] = useState<{ assetId: string; x: number; y: number } | null>(
    null
  );
  // M32 Step 1: pin labels are hidden by default and revealed on desktop
  // hover (via the `group` class on the per-pin container) and on
  // touch press-and-hold. We track the currently-touched pin id here so the
  // label fades in only on that one — capture-phase pointerdown beats the
  // PinMarker's e.stopPropagation in its own handler.
  const [touchedAssetId, setTouchedAssetId] = useState<string | null>(null);

  function startDrag(
    asset: Asset,
    isReposition: boolean,
    e: React.PointerEvent<HTMLButtonElement>
  ) {
    const layer = layerRef.current;
    if (!layer) return;
    const rect = layer.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    dragRef.current = {
      assetId: asset.id,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: asset.x,
      startY: asset.y,
      rectLeft: rect.left,
      rectTop: rect.top,
      rectWidth: rect.width,
      rectHeight: rect.height,
      moved: false,
      curX: asset.x,
      curY: asset.y,
      reposition: isReposition,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function updateDrag(e: PointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;
    if (!drag.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      drag.moved = true;
      // Movement past threshold cancels any pending long-press; the user
      // is dragging, not holding still.
      clearLongPress();
    }
    if (!drag.moved) return;
    const x = clamp01(drag.startX + dx / drag.rectWidth);
    const y = clamp01(drag.startY + dy / drag.rectHeight);
    drag.curX = x;
    drag.curY = y;
    setPreview({ assetId: drag.assetId, x, y });
  }

  function finishDrag(e: PointerEvent, button: HTMLButtonElement | null) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    clearLongPress();
    dragRef.current = null;
    if (button && button.hasPointerCapture(e.pointerId)) {
      button.releasePointerCapture(e.pointerId);
    }
    if (drag.moved) {
      // Pull the latest computed coords straight from the ref — no React
      // state closure to go stale (lesson from M4 drag-closure incident).
      if (drag.reposition) {
        onRepositionDragEnd?.(drag.assetId, drag.curX, drag.curY);
      } else {
        onReposition?.(drag.assetId, drag.curX, drag.curY);
      }
      // Suppress the click that follows a drag (the browser fires one after
      // pointerup if the press + release land on the same element).
      justDraggedRef.current = drag.assetId;
      setTimeout(() => {
        if (justDraggedRef.current === drag.assetId) justDraggedRef.current = null;
      }, 50);
    }
    setPreview(null);
  }

  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0">
      {assets.map((asset) => {
        const status: AssetStatus =
          statusOverride?.get(asset.id) ??
          computeStatus({
            asset,
            lastAuditAt: lastAuditByAsset?.get(asset.id) ?? null,
            openFlagCount: asset.status === 'flagged' ? 1 : 0,
          });
        const isRepositionTarget = repositionAssetId === asset.id;
        // While the parent is showing the confirmation toast, keep the pin
        // pinned at the candidate coords. Otherwise fall back to the live
        // drag preview, then to the asset's persisted coords.
        const isPreview = preview?.assetId === asset.id;
        const x =
          isRepositionTarget && pendingRepositionCoords
            ? pendingRepositionCoords.x
            : isPreview
              ? preview.x
              : asset.x;
        const y =
          isRepositionTarget && pendingRepositionCoords
            ? pendingRepositionCoords.y
            : isPreview
              ? preview.y
              : asset.y;

        // Drag eligibility:
        //   - if a deliberate reposition is active, only the targeted pin can
        //     be dragged (lock state intentionally ignored);
        //   - otherwise the M4 quick-nudge path applies: canMove + unlocked.
        // In path-edit mode pins are never draggable — taps toggle path
        // membership (mobile-first, no drag-and-drop for ordering).
        const draggable = pathEditMode
          ? false
          : isRepositionTarget
            ? true
            : !repositionAssetId && canMove && !asset.is_locked;
        const faded = !!repositionAssetId && !isRepositionTarget;
        const sequenceNumber = pathEditMode ? pathIndexById?.get(asset.id) ?? null : null;

        const pinLabel = formatPinNumber(asset.pin_number);

        const labelVisible = touchedAssetId === asset.id;

        return (
          <div
            key={asset.id}
            className="group pointer-events-auto absolute"
            style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
            // M32 Step 1: capture-phase pointerdown beats PinMarker's
            // e.stopPropagation in its own handler, so we can flag this pin
            // as "touched" for the duration of the press without breaking
            // the existing tap/drag/long-press flow. Cleared on pointerup
            // / cancel / leave so the label fades back out.
            onPointerDownCapture={(e) => {
              if (e.pointerType === 'touch') setTouchedAssetId(asset.id);
            }}
            onPointerUp={() => setTouchedAssetId(null)}
            onPointerCancel={() => setTouchedAssetId(null)}
            onPointerLeave={() => setTouchedAssetId(null)}
          >
            {/* Floor-scoped pin ID, shown just below the pin. Inverse-scaled by
                --zoom (same trick PinMarker uses) so it stays a constant
                viewport size as the plan zooms. Hidden while fading other pins
                during a reposition so it doesn't clutter the focus pin's area.
                M32 Step 1: visually hidden by default — revealed on desktop
                hover (group-hover), keyboard focus inside the container
                (focus-within), or touch press-and-hold (touchedAssetId state).
                Screen readers still hear the pin number via PinMarker's
                aria-label (the pinLabel prop). */}
            {pinLabel && !faded && (
              <span
                aria-hidden
                className={cn(
                  'pointer-events-none absolute left-1/2 top-1/2 select-none whitespace-nowrap rounded-[3px] bg-waymarks-ink/85 px-1 font-mono text-[9px] font-semibold leading-[1.45] text-white shadow-sm',
                  'opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100 group-focus-within:opacity-100',
                  labelVisible && 'opacity-100'
                )}
                style={{
                  transform: 'translate(-50%, 17px) scale(calc(1 / var(--zoom, 1)))',
                  transformOrigin: 'center top',
                }}
              >
                {pinLabel}
              </span>
            )}
            <PinMarker
              assetId={asset.id}
              name={asset.name}
              type={asset.type}
              status={status}
              shape={pinShape}
              size={pinSize}
              pinLabel={pinLabel}
              sequenceNumber={sequenceNumber}
              fillColor={statusOverride ? statusFillColor(status) : undefined}
              selected={!pathEditMode && asset.id === selectedAssetId}
              unlocked={draggable && !isRepositionTarget}
              repositioning={isRepositionTarget}
              faded={faded}
              onPointerDownDrag={(e) => {
                if (!draggable) return;
                startDrag(asset, isRepositionTarget, e);
                const button = e.currentTarget;
                const pointerId = e.pointerId;
                // Native pointer event listeners - `pointermove` fires after
                // setPointerCapture even when the cursor leaves the button.
                const onMove = (ev: PointerEvent) => updateDrag(ev);
                const onEnd = (ev: PointerEvent) => {
                  button.removeEventListener('pointermove', onMove);
                  button.removeEventListener('pointerup', onEnd);
                  button.removeEventListener('pointercancel', onEnd);
                  finishDrag(ev, button);
                };
                button.addEventListener('pointermove', onMove);
                button.addEventListener('pointerup', onEnd);
                button.addEventListener('pointercancel', onEnd);

                // M12: long-press on touch enters the deliberate reposition
                // flow. Skipped if we're already a reposition target (the
                // user is mid-drag inside that mode), or if the parent
                // didn't wire a callback. Movement past threshold cancels
                // the timer (handled in updateDrag).
                if (
                  e.pointerType === 'touch' &&
                  onLongPress &&
                  !repositionAssetId &&
                  !isRepositionTarget
                ) {
                  clearLongPress();
                  longPressTimerRef.current = setTimeout(() => {
                    longPressTimerRef.current = null;
                    const drag = dragRef.current;
                    // Fire only if the user is still holding still on this pin.
                    if (!drag || drag.pointerId !== pointerId || drag.moved) return;
                    if (drag.assetId !== asset.id) return;
                    // Tear down the in-flight quick-drag before flipping
                    // modes - the next press will start a fresh drag inside
                    // reposition mode with confirm-toast semantics.
                    dragRef.current = null;
                    setPreview(null);
                    if (button.hasPointerCapture(pointerId)) {
                      button.releasePointerCapture(pointerId);
                    }
                    button.removeEventListener('pointermove', onMove);
                    button.removeEventListener('pointerup', onEnd);
                    button.removeEventListener('pointercancel', onEnd);
                    // Optional haptic (no-op if unsupported).
                    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                      try {
                        navigator.vibrate?.(20);
                      } catch {
                        /* iOS Safari throws on vibrate; ignore */
                      }
                    }
                    onLongPress(asset.id);
                  }, LONG_PRESS_MS);
                }
              }}
              onClick={() => {
                if (justDraggedRef.current === asset.id) return;
                // While a reposition is active, suppress click-to-open-drawer
                // — the user is mid-action and the drawer would interrupt.
                if (repositionAssetId) return;
                // Path-edit mode: a tap adds/removes this pin from the walking
                // order instead of opening the detail drawer.
                if (pathEditMode) {
                  onPathToggle?.(asset.id);
                  return;
                }
                onSelectAsset(asset);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}


function statusFillColor(status: AssetStatus): string {
  // Audit-mode pin colors: green = audited+confirmed, red = flagged this
  // session, amber = unvisited or skipped. Matches the spec 06 § Audit
  // walkaround color treatment.
  switch (status) {
    case 'good':
      return '#16A34A';
    case 'flagged':
      return '#DC2626';
    case 'attention':
    default:
      return '#D97706';
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
