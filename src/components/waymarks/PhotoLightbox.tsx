import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as RMouseEvent,
  type PointerEvent as RPointerEvent,
  type WheelEvent as RWheelEvent,
} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, ImageOff, Loader2, LocateFixed, X } from 'lucide-react';
import { useSignedAssetPhotoUrl } from '@/hooks/useAssetPhotos';
import type { AssetPhoto } from '@/types/database';

/**
 * Full-screen photo viewer for a pin's photos — built to SEE DETAIL: serial
 * numbers, mounting hardware, hairline cracks. Field photos are the evidence
 * layer of the whole product; a 160px cropped hero can't show what a flag is
 * actually about.
 *
 * Gestures mirror FloorPlanCanvas (M29) so the app has ONE zoom feel:
 *   - two-finger pinch, anchored at the focal point (content stays under the
 *     fingers), wheel zoom on desktop, drag to pan
 *   - double-click / double-tap toggles fit ↔ 2.5× at the pointer
 *   - 0 / Escape via keyboard; ←/→ move between the pin's photos
 * Zoom floor is 1 (fit) — unlike the plan canvas there's nothing to gain from
 * shrinking a photo below fit; ceiling 8× matches the plate cap's usefulness.
 */

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const DBL_ZOOM = 2.5;

function clampPhotoZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

export type PhotoLightboxProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photos: AssetPhoto[];
  index: number;
  onIndexChange: (index: number) => void;
  assetName: string;
};

export function PhotoLightbox({
  open,
  onOpenChange,
  photos,
  index,
  onIndexChange,
  assetName,
}: PhotoLightboxProps) {
  const safeIndex = Math.min(Math.max(index, 0), Math.max(0, photos.length - 1));
  const photo = photos[safeIndex];
  const signed = useSignedAssetPhotoUrl(photo?.path);
  const url = signed.data ?? null;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isPinching, setIsPinching] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(
    null
  );
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{
    startDist: number;
    startZoom: number;
    startFocal: { x: number; y: number };
    startPan: { x: number; y: number };
    centre: { x: number; y: number };
  } | null>(null);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Fresh photo (or reopen) → fresh view.
  useEffect(() => {
    resetView();
  }, [photo?.path, open, resetView]);

  const onWheel = useCallback((e: RWheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => clampPhotoZoom(z * factor));
  }, []);

  const onPointerDown = useCallback(
    (e: RPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointersRef.current.size >= 2) {
        dragRef.current = null;
        setIsDragging(false);
        const pts = Array.from(activePointersRef.current.values());
        const a = pts[0];
        const b = pts[1];
        const rect = containerRef.current?.getBoundingClientRect();
        if (a && b && rect) {
          pinchRef.current = {
            startDist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
            startZoom: zoom,
            startFocal: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
            startPan: { x: pan.x, y: pan.y },
            centre: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
          };
          setIsPinching(true);
        }
        return;
      }

      dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
      setIsDragging(true);
    },
    [pan.x, pan.y, zoom]
  );

  const onPointerMove = useCallback((e: RPointerEvent<HTMLDivElement>) => {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Pinch: same closed-form focal anchoring as FloorPlanCanvas (M29).
    if (pinchRef.current && activePointersRef.current.size >= 2) {
      const pts = Array.from(activePointersRef.current.values());
      const a = pts[0];
      const b = pts[1];
      if (a && b) {
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        const targetZoom = clampPhotoZoom(
          pinchRef.current.startZoom * (dist / pinchRef.current.startDist)
        );
        const ratio = targetZoom / pinchRef.current.startZoom;
        const focal = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const { startFocal, startPan, centre } = pinchRef.current;
        setZoom(targetZoom);
        setPan({
          x: focal.x - startFocal.x + (1 - ratio) * (startFocal.x - centre.x) + ratio * startPan.x,
          y: focal.y - startFocal.y + (1 - ratio) * (startFocal.y - centre.y) + ratio * startPan.y,
        });
      }
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;
    setPan({ x: drag.panX + (e.clientX - drag.startX), y: drag.panY + (e.clientY - drag.startY) });
  }, []);

  const onPointerUp = useCallback((e: RPointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) {
      pinchRef.current = null;
      setIsPinching(false);
    }
    dragRef.current = null;
    setIsDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  // Double-click / double-tap: fit ↔ 2.5×, anchored at the pointer so the
  // detail under the cursor is what gets magnified.
  const onDoubleClick = useCallback(
    (e: RMouseEvent<HTMLDivElement>) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (zoom > 1.01) {
        resetView();
        return;
      }
      const centre = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      const ratio = DBL_ZOOM / zoom;
      setZoom(DBL_ZOOM);
      setPan({
        x: (1 - ratio) * (e.clientX - centre.x) + ratio * pan.x,
        y: (1 - ratio) * (e.clientY - centre.y) + ratio * pan.y,
      });
    },
    [zoom, pan.x, pan.y, resetView]
  );

  const goto = useCallback(
    (next: number) => {
      if (next < 0 || next >= photos.length) return;
      onIndexChange(next);
    },
    [photos.length, onIndexChange]
  );

  // Keyboard: arrows move between photos, 0 recenters. (Radix handles Esc.)
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') goto(safeIndex - 1);
      else if (e.key === 'ArrowRight') goto(safeIndex + 1);
      else if (e.key === '0') resetView();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, safeIndex, goto, resetView]);

  const transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/90" />
        <Dialog.Content
          className="fixed inset-0 z-[60] outline-none"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">{`Photo viewer — ${assetName}`}</Dialog.Title>

          <div
            ref={containerRef}
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the viewer captures keyboard input (arrows, 0) like FloorPlanCanvas
            tabIndex={0}
            role="application"
            aria-label="Photo viewer. Pinch or scroll to zoom, drag to pan, double-tap to zoom in, 0 to reset, arrow keys to change photo."
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={onDoubleClick}
            style={{ touchAction: 'none' }}
            className={cnCursor(isDragging, zoom)}
          >
            {signed.isLoading && (
              <div className="absolute inset-0 flex items-center justify-center text-white/60">
                <Loader2 size={28} className="animate-spin" aria-hidden />
                <span className="sr-only">Loading photo…</span>
              </div>
            )}
            {(signed.isError || (!signed.isLoading && !url)) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/70">
                <ImageOff size={32} aria-hidden />
                <p className="text-sm">Couldn't load this photo</p>
              </div>
            )}
            {url && (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={
                  {
                    transform,
                    transformOrigin: 'center center',
                    transition: isDragging || isPinching ? 'none' : 'transform 80ms ease-out',
                  } as CSSProperties
                }
              >
                <img
                  src={url}
                  alt={`${assetName} — ${safeIndex + 1} of ${photos.length}`}
                  draggable={false}
                  className="max-h-full max-w-full select-none object-contain p-2"
                />
              </div>
            )}
          </div>

          {/* Close (top-right) */}
          <Dialog.Close asChild>
            <button
              type="button"
              aria-label="Close photo viewer"
              className="absolute right-3 top-3 z-[61] inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm hover:bg-white/25"
            >
              <X size={18} aria-hidden />
            </button>
          </Dialog.Close>

          {/* Counter (top-center) */}
          {photos.length > 1 && (
            <div className="pointer-events-none absolute left-1/2 top-4 z-[61] -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 font-mono text-xs text-white/85">
              {safeIndex + 1} / {photos.length}
            </div>
          )}

          {/* Prev / next */}
          {photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => goto(safeIndex - 1)}
                disabled={safeIndex === 0}
                aria-label="Previous photo"
                className="absolute left-3 top-1/2 z-[61] inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm hover:bg-white/25 disabled:opacity-25"
              >
                <ChevronLeft size={20} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => goto(safeIndex + 1)}
                disabled={safeIndex >= photos.length - 1}
                aria-label="Next photo"
                className="absolute right-3 top-1/2 z-[61] inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm hover:bg-white/25 disabled:opacity-25"
              >
                <ChevronRight size={20} aria-hidden />
              </button>
            </>
          )}

          {/* Recenter + zoom % (bottom-right, matches the plan canvas) */}
          <div
            className="absolute right-3 z-[61] flex items-center gap-2"
            style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <button
              type="button"
              onClick={resetView}
              aria-label="Reset zoom"
              title="Reset (0)"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-white/10 text-white/90 backdrop-blur-sm hover:bg-white/25"
            >
              <LocateFixed size={16} aria-hidden />
            </button>
            <div className="pointer-events-none rounded-md bg-black/50 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-white/80">
              {Math.round(zoom * 100)}%
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function cnCursor(dragging: boolean, zoom: number): string {
  const cursor = dragging ? 'cursor-grabbing' : zoom > 1.01 ? 'cursor-grab' : 'cursor-zoom-in';
  return `absolute inset-0 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-waymarks-gold ${cursor}`;
}
