import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as RPointerEvent,
  type ReactNode,
  type WheelEvent as RWheelEvent,
} from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Loader2, ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';

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
}: FloorPlanCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  // Render whenever src or kind changes.
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setErrorMsg(null);
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
          const doc = await getDocument({ data: buf }).promise;
          const page = await doc.getPage(1);
          const viewport = page.getViewport({ scale });
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas 2D context unavailable');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          await page.render({ canvasContext: ctx, viewport }).promise;
          if (cancelled) return;
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
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            ctx.drawImage(img, 0, 0);
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
        if (cancelled) return;
        setErrorMsg(err instanceof Error ? err.message : 'Failed to render plan');
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [src, kind, scale]);

  const onWheel = useCallback((e: RWheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 4) return;
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => clamp(z * factor, 0.3, 6));
  }, []);

  const onPointerDown = useCallback(
    (e: RPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
        moved: false,
      };
    },
    [pan.x, pan.y]
  );

  const onPointerMove = useCallback((e: RPointerEvent<HTMLDivElement>) => {
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
          setZoom((z) => clamp(z * 1.1, 0.3, 6));
          break;
        case '-':
          e.preventDefault();
          setZoom((z) => clamp(z * 0.9, 0.3, 6));
          break;
        case '0':
          e.preventDefault();
          setZoom(1);
          setPan({ x: 0, y: 0 });
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
  }, []);

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
      className={cn(
        'relative h-[70vh] w-full overflow-hidden rounded-xl border border-black/10 bg-surface outline-none focus-visible:ring-2 focus-visible:ring-waymarks-gold dark:border-white/10 dark:bg-white/5',
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
        style={{
          transform,
          transformOrigin: 'center center',
          transition: isDragging ? 'none' : 'transform 80ms ease-out',
        }}
      >
        <div className="relative">
          <canvas
            ref={canvasRef}
            aria-hidden
            className={cn(
              'block max-h-[70vh] max-w-full select-none shadow-sm',
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
        <div className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-waymarks-ink/80 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-white/80">
          {Math.round(zoom * 100)}%
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

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
