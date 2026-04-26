import { useRef, useState } from 'react';
import type { Asset } from '@/types/database';
import { PinMarker } from './PinMarker';
import { computeStatus } from '@/lib/asset-status';

export type PinOverlayProps = {
  assets: Asset[];
  selectedAssetId?: string | null;
  onSelectAsset: (asset: Asset) => void;
  /** Whether the current user can move unlocked pins. */
  canMove: boolean;
  /** Persist a new (x, y) for an asset after a drag. */
  onReposition?: (assetId: string, x: number, y: number) => void;
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
};

export function PinOverlay({
  assets,
  selectedAssetId,
  onSelectAsset,
  canMove,
  onReposition,
}: PinOverlayProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  // dragRef is always-current; the React state below is for visualization only.
  const dragRef = useRef<DragState | null>(null);
  // Used to suppress click-after-drag.
  const justDraggedRef = useRef<string | null>(null);
  const [preview, setPreview] = useState<{ assetId: string; x: number; y: number } | null>(
    null
  );

  function startDrag(asset: Asset, e: React.PointerEvent<HTMLButtonElement>) {
    if (!canMove || !onReposition || asset.is_locked) return;
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
    if (drag.moved && onReposition) {
      // Pull the latest computed coords straight from the ref — no React
      // state closure to go stale.
      onReposition(drag.assetId, drag.curX, drag.curY);
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
        const status = computeStatus({
          asset,
          lastAuditAt: null,
          openFlagCount: asset.status === 'flagged' ? 1 : 0,
        });
        const isPreview = preview?.assetId === asset.id;
        const x = isPreview ? preview.x : asset.x;
        const y = isPreview ? preview.y : asset.y;
        const draggable = canMove && !asset.is_locked;

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
              unlocked={draggable}
              onPointerDownDrag={(e) => {
                startDrag(asset, e);
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
