import { useRef, useState } from 'react';
import type { Asset } from '@/types/database';
import { PinMarker } from './PinMarker';
import { computeStatus, type AssetStatus } from '@/lib/asset-status';

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
};

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
}: PinOverlayProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  // dragRef is always-current; the React state below is for visualization only.
  const dragRef = useRef<DragState | null>(null);
  // Used to suppress click-after-drag.
  const justDraggedRef = useRef<string | null>(null);
  const [preview, setPreview] = useState<{ assetId: string; x: number; y: number } | null>(
    null
  );

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
        const draggable = isRepositionTarget
          ? true
          : !repositionAssetId && canMove && !asset.is_locked;
        const faded = !!repositionAssetId && !isRepositionTarget;

        return (
          <div
            key={asset.id}
            className="pointer-events-auto absolute"
            style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
          >
            <PinMarker
              assetId={asset.id}
              name={asset.name}
              type={asset.type}
              status={status}
              selected={asset.id === selectedAssetId}
              unlocked={draggable && !isRepositionTarget}
              repositioning={isRepositionTarget}
              faded={faded}
              onPointerDownDrag={(e) => {
                if (!draggable) return;
                startDrag(asset, isRepositionTarget, e);
                const button = e.currentTarget;
                // Native pointer event listeners — `pointermove` fires after
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
              }}
              onClick={() => {
                if (justDraggedRef.current === asset.id) return;
                // While a reposition is active, suppress click-to-open-drawer
                // — the user is mid-action and the drawer would interrupt.
                if (repositionAssetId) return;
                onSelectAsset(asset);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
