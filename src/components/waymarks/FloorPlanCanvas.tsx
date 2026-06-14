import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as RPointerEvent,
  type ReactNode,
  type WheelEvent as RWheelEvent,
} from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Loader2, ImageOff, LocateFixed } from 'lucide-react';
import { cn } from '@/lib/utils';
import { clampZoom } from '@/lib/zoom';

if (typeof window !== 'undefined' && !GlobalWorkerOptions.workerSrc) {
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

export type FloorPlanCanvasMode = 'view' | 'placing';

export type FloorPlanCanvasProps = {
  src: string;
  kind: 'pdf' | 'image';
  scale?: number;
  /**
   * Optional pin overlay — rendered inside the same panned/zoomed wrapper as
   * the canvas, so pins follow the plan when it moves. Use percent-based
   * positioning (`left: ${x*100}%`, `top: ${y*100}%`) inside.
   */
  pinOverlay?: ReactNode;
  mode?: FloorPlanCanvasMode;
  /** Fires when the user clicks (not drags) on the canvas in `placing` mode.
   *  Coordinates are 0–1 normalized within the rendered canvas box. */
  onPlaceClick?: (coords: { x: number; y: number }) => void;
  className?: string;
  /**
   * Fill the parent's height (`h-full`) instead of the default fixed `h-[70vh]`.
   * Use inside a height-bounded flex column so the map takes the space left
   * after the toolbars — fixes mobile where the toolbar rows + a 70vh map
   * overflow the screen and clip the floating controls.
   */
  fill?: boolean;
};

type Status = 'idle' | 'loading' | 'ready' | 'error';

const DRAG_THRESHOLD_PX = 4;

export function FloorPlanCanvas({
  src,
  kind,
  scale = 1.5,
  pinOverlay,
  mode = 'view',
  onPlaceClick,
  className,
  fill = false,
}: FloorPlanCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Intrinsic plan dimensions (from the decoded PDF page / image) and the live
  // measured size of the container. We fit the canvas box in pixels from these
  // two — deterministic, instead of relying on `max-h-full`/`max-w-full`
  // percentages that silently resolve to "no constraint" when an ancestor's
  // height is indefinite (which drew the plan at full intrinsic size — ~2x —
  // on desktop). The DB stores no plan dimensions, so intrinsic size always
  // comes from the decoded asset at runtime; re-fit on every container resize.
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    startClientX: number;
    startClientY: number;
    startPanX: number;
    startPanY: number;
    moved: boolean;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // M29: disable the transform transition while a pinch is in flight so
  // pointer-move-driven scale/pan land on the GPU on the very next paint
  // instead of being eased between intermediate values — the easing made
  // the gesture read as jittery on phones.
  const [isPinching, setIsPinching] = useState(false);
  // M22c: multi-touch pinch-zoom. Without this, mobile pinch is handled by the
  // browser (page-level visual zoom) and our --zoom CSS var never updates, so
  // PinMarker's inverse-scale never fires and pins balloon on top of each
  // other. Track every active pointer; once two are down, derive the zoom
  // ratio from their changing distance and feed setZoom — same path the
  // wheel handler uses, so the existing inverse-scale logic just works.
  //
  // M29: anchor the gesture at the pinch focal point so content stays under
  // the user's fingers as they spread/pinch. Without anchoring, scaling
  // happens around the container's geometric centre and the content slides
  // out from under the fingers — that's what was being read as "jitter."
  // We snapshot startFocal/startPan/startZoom/containerCenter when the
  // second finger lands and recompute pan from the closed-form solution
  // each frame (see formula in the move handler).
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<
    | {
        startDist: number;
        startZoom: number;
        startFocal: { x: number; y: number };
        startPan: { x: number; y: number };
        centre: { x: number; y: number };
      }
    | null
  >(null);

  // Render whenever src or kind changes.
  useEffect(() => {
    let cancelled = false;
    // The active PDF render task + document, so a fast src change (e.g. right
    // after a Plan Prep upload swaps plan_url) cancels the in-flight render
    // instead of starting a second render() on the same canvas — which throws
    // "Cannot use the same canvas during multiple render() operations".
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;
    let pdfDoc: { destroy: () => Promise<void> } | null = null;
    setStatus('loading');
    setErrorMsg(null);
    setDims(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });

    const canvas = canvasRef.current;
    if (!canvas) return;

    void (async () => {
      try {
        if (kind === 'pdf') {
          const buf = await fetch(src).then((r) => {
            if (!r.ok) throw new Error(`Failed to load PDF (${r.status})`);
            return r.arrayBuffer();
          });
          if (cancelled) return;
          const doc = await getDocument({ data: buf }).promise;
          pdfDoc = doc;
          if (cancelled) return;
          const page = await doc.getPage(1);
          if (cancelled) return;
          const viewport = page.getViewport({ scale });
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas 2D context unavailable');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          renderTask = page.render({ canvasContext: ctx, viewport });
          await renderTask.promise;
          if (cancelled) return;
          setDims({ w: viewport.width, h: viewport.height });
          setStatus('ready');
        } else {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            if (cancelled) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              setErrorMsg('Canvas 2D context unavailable');
              setStatus('error');
              return;
            }
            // SVG plans that carry only a viewBox (no explicit width/height)
            // can report naturalWidth/Height as 0 in some browsers — fall back
            // to sane defaults so the canvas is never 0×0. Raster images
            // (PNG/JPG) always report real intrinsic dimensions, so the
            // fallback is a no-op for them.
            const w = img.naturalWidth || 1600;
            const h = img.naturalHeight || 1200;
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(img, 0, 0, w, h);
            setDims({ w, h });
            setStatus('ready');
          };
          img.onerror = () => {
            if (cancelled) return;
            setErrorMsg('Failed to load image');
            setStatus('error');
          };
          img.src = src;
        }
      } catch (err) {
        // A cancelled render rejects here (RenderingCancelledException) — that's
        // expected on src change, not a real error.
        if (cancelled) return;
        setErrorMsg(err instanceof Error ? err.message : 'Failed to render plan');
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      void pdfDoc?.destroy();
    };
  }, [src, kind, scale]);

  // Track the container's rendered size so we can fit the plan to it in pixels.
  // Re-measures on every resize (orientation change, mobile address-bar
  // collapse, the dvh/flex height settling after mount) — so sizing never
  // depends on *when* the layout resolves.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Largest box with the plan's aspect ratio that fits inside the container.
  // Centered by the flex wrapper; pins overlay this exact box so they stay
  // registered to the plan.
  const fitted = useMemo(() => {
    if (!dims || !containerSize) return null;
    if (dims.w <= 0 || dims.h <= 0 || containerSize.w <= 0 || containerSize.h <= 0) return null;
    const ar = dims.w / dims.h;
    let w = containerSize.w;
    let h = w / ar;
    if (h > containerSize.h) {
      h = containerSize.h;
      w = h * ar;
    }
    return { w, h };
  }, [dims, containerSize]);

  // Recenter: reset pan + zoom to the initial fit (M12). Used by both the
  // keyboard '0' shortcut and the floating recenter button. Hard to find your
  // way back to the original view after pinch-zooming on a phone, so this is
  // also bound to a button.
  const recenterView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const onWheel = useCallback((e: RWheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 4) return;
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => clampZoom(z * factor));
  }, []);

  const onPointerDown = useCallback(
    (e: RPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Second finger down → switch to pinch mode and abandon any
      // in-progress single-finger pan. Snapshot enough state to anchor
      // the scale at the focal point (M29). Container centre is in
      // viewport coords because that's the space pointer events live in.
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

      dragRef.current = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
        moved: false,
      };
    },
    [pan.x, pan.y, zoom]
  );

  const onPointerMove = useCallback((e: RPointerEvent<HTMLDivElement>) => {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Pinch path: drive the same zoom state the wheel handler uses, so
    // PinMarker's --zoom inverse-scale fires identically on mobile.
    // M29: also recompute pan so the content point under the pinch
    // midpoint stays under the user's fingers across the gesture.
    //
    //   transform applies as: screen = centre + pan + (world - centre) * zoom
    //   so for the world point fixed under the focal point:
    //     newPan = (currentFocal - startFocal)              ← fingers slide
    //              + (1 - ratio) * (startFocal - centre)    ← scale anchor
    //              + ratio * startPan                       ← scaled starting pan
    if (pinchRef.current && activePointersRef.current.size >= 2) {
      const pts = Array.from(activePointersRef.current.values());
      const a = pts[0];
      const b = pts[1];
      if (a && b) {
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        const rawRatio = dist / pinchRef.current.startDist;
        const targetZoom = clampZoom(pinchRef.current.startZoom * rawRatio);
        // Use the clamped ratio so the anchor stays consistent when zoom hits a bound.
        const ratio = targetZoom / pinchRef.current.startZoom;
        const focal = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const { startFocal, startPan, centre } = pinchRef.current;
        const newPanX =
          (focal.x - startFocal.x) + (1 - ratio) * (startFocal.x - centre.x) + ratio * startPan.x;
        const newPanY =
          (focal.y - startFocal.y) + (1 - ratio) * (startFocal.y - centre.y) + ratio * startPan.y;
        setZoom(targetZoom);
        setPan({ x: newPanX, y: newPanY });
      }
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;
    if (!drag.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      drag.moved = true;
      setIsDragging(true);
    }
    if (drag.moved) {
      setPan({ x: drag.startPanX + dx, y: drag.startPanY + dy });
    }
  }, []);

  const onPointerUp = useCallback(
    (e: RPointerEvent<HTMLDivElement>) => {
      activePointersRef.current.delete(e.pointerId);
      if (activePointersRef.current.size < 2) {
        pinchRef.current = null;
        setIsPinching(false);
      }

      const drag = dragRef.current;
      dragRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      setIsDragging(false);

      // Click (no meaningful drag) → if in placing mode, fire onPlaceClick.
      if (drag && !drag.moved && mode === 'placing' && onPlaceClick && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
          onPlaceClick({ x, y });
        }
      }
    },
    [mode, onPlaceClick]
  );

  // Keyboard zoom + pan when the container has focus.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!containerRef.current) return;
      if (document.activeElement !== containerRef.current) return;
      const PAN_STEP = 32;
      switch (e.key) {
        case '+':
        case '=':
          e.preventDefault();
          setZoom((z) => clampZoom(z * 1.1));
          break;
        case '-':
          e.preventDefault();
          setZoom((z) => clampZoom(z * 0.9));
          break;
        case '0':
          e.preventDefault();
          recenterView();
          break;
        case 'ArrowUp':
          setPan((p) => ({ ...p, y: p.y + PAN_STEP }));
          break;
        case 'ArrowDown':
          setPan((p) => ({ ...p, y: p.y - PAN_STEP }));
          break;
        case 'ArrowLeft':
          setPan((p) => ({ ...p, x: p.x + PAN_STEP }));
          break;
        case 'ArrowRight':
          setPan((p) => ({ ...p, x: p.x - PAN_STEP }));
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [recenterView]);

  const transform = useMemo(
    () => `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
    [pan.x, pan.y, zoom]
  );

  const cursor =
    mode === 'placing' ? 'cursor-crosshair' : isDragging ? 'cursor-grabbing' : 'cursor-grab';

  return (
    <div
      ref={containerRef}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the canvas widget captures keyboard input (zoom +/- 0, arrow pan)
      tabIndex={0}
      role="application"
      aria-label="Floor plan canvas. Use mouse wheel + drag to pan, +/- to zoom, 0 to reset."
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      // M22c: the app owns all gestures inside the canvas — without this the
      // browser eats two-finger pinches as page-level visual zoom, which
      // bypasses --zoom and balloons the pins.
      style={{ touchAction: 'none' }}
      className={cn(
        'relative w-full overflow-hidden rounded-xl border border-black/10 bg-surface outline-none focus-visible:ring-2 focus-visible:ring-waymarks-gold dark:border-white/10 dark:bg-white/5',
        fill ? 'h-full' : 'h-[70vh]',
        cursor,
        className
      )}
    >
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center text-text-faint">
          <Loader2 size={24} className="animate-spin" aria-hidden />
          <span className="sr-only">Rendering plan…</span>
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-danger">
          <ImageOff size={28} aria-hidden />
          <p className="text-sm font-medium">Couldn't render the plan</p>
          {errorMsg && <p className="max-w-md text-xs text-text-muted">{errorMsg}</p>}
        </div>
      )}
      <div
        className="absolute inset-0 flex items-center justify-center"
        // M22 #4: PinMarker reads --zoom via CSS to apply an inverse-scale so
        // pins stay roughly constant viewport size at high zoom (zooming in
        // should reveal architecture detail, not blow up the pins).
        style={{
          transform,
          transformOrigin: 'center center',
          transition: isDragging || isPinching ? 'none' : 'transform 80ms ease-out',
          ['--zoom' as string]: String(zoom),
        } as CSSProperties}
      >
        {/* The inner wrapper is sized in pixels to the fitted box (largest
            aspect-correct rectangle inside the measured container). The canvas
            fills it and the pin overlay shares its exact bounds, so pins stay
            registered to the plan. Pixel sizing avoids the percentage-height
            traps that drew the plan at full intrinsic size. Falls back to a
            shrink-to-fit box until the first measure + decode land (canvas is
            invisible until `ready`). */}
        <div
          className="relative max-h-full max-w-full"
          style={fitted ? { width: fitted.w, height: fitted.h } : undefined}
        >
          <canvas
            ref={canvasRef}
            aria-hidden
            className={cn(
              'block h-full w-full select-none shadow-sm',
              status === 'ready' ? 'opacity-100' : 'opacity-0'
            )}
          />
          {/* Pin overlay rendered inside the same transformed/centered wrapper so pins pan + zoom with the plan. */}
          {status === 'ready' && pinOverlay && (
            <div className="pointer-events-none absolute inset-0">{pinOverlay}</div>
          )}
        </div>
      </div>
      {status === 'ready' && (
        <div className="absolute bottom-2 right-2 flex items-center gap-2">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              recenterView();
            }}
            aria-label="Re-center plan"
            title="Re-center (0)"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-waymarks-ink/85 text-white/90 shadow-sm transition-colors hover:bg-waymarks-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-waymarks-gold focus-visible:ring-offset-1 lg:h-7 lg:w-7"
          >
            <LocateFixed size={16} aria-hidden />
          </button>
          <div className="pointer-events-none rounded-md bg-waymarks-ink/80 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-white/80">
            {Math.round(zoom * 100)}%
          </div>
        </div>
      )}
      {mode === 'placing' && status === 'ready' && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-waymarks-ink/85 px-3 py-1 text-xs font-medium text-white">
          Click on the plan to place a pin · Esc to cancel
        </div>
      )}
    </div>
  );
}
