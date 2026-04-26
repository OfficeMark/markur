import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as RPointerEvent,
  type WheelEvent as RWheelEvent,
} from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Loader2, ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';

if (typeof window !== 'undefined' && !GlobalWorkerOptions.workerSrc) {
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

export type FloorPlanCanvasProps = {
  /** A signed Storage URL or a blob: URL pointing at the plan file. */
  src: string;
  /** "pdf" | "image" — picks the renderer. */
  kind: 'pdf' | 'image';
  /** Optional render-quality knob (devicePixelRatio multiplier). */
  scale?: number;
  /** Called once we know the rendered pixel dimensions. M4+ uses these to
   *  position pins (assets store coords as 0–1 normalized). */
  onDimensions?: (dims: { width: number; height: number }) => void;
  className?: string;
};

type Status = 'idle' | 'loading' | 'ready' | 'error';

export function FloorPlanCanvas({
  src,
  kind,
  scale = 1.5,
  onDimensions,
  className,
}: FloorPlanCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Pan + zoom state (CSS transform; doesn't trigger re-render of the canvas
  // bitmap, just the wrapper).
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const draggingRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(
    null
  );

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
          onDimensions?.({ width: canvas.width, height: canvas.height });
          setStatus('ready');
        } else {
          // Image path.
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
            onDimensions?.({ width: canvas.width, height: canvas.height });
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
  }, [src, kind, scale, onDimensions]);

  const onWheel = useCallback((e: RWheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 4) return;
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => clamp(z * factor, 0.3, 6));
  }, []);

  const onPointerDown = useCallback((e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = { x: e.clientX, y: e.clientY, startX: pan.x, startY: pan.y };
  }, [pan.x, pan.y]);

  const onPointerMove = useCallback((e: RPointerEvent<HTMLDivElement>) => {
    const drag = draggingRef.current;
    if (!drag) return;
    setPan({
      x: drag.startX + (e.clientX - drag.x),
      y: drag.startY + (e.clientY - drag.y),
    });
  }, []);

  const endDrag = useCallback((e: RPointerEvent<HTMLDivElement>) => {
    draggingRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  // Keyboard zoom + pan.
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
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={cn(
        'relative h-[70vh] w-full overflow-hidden rounded-xl border border-black/10 bg-waymarks-gold-soft outline-none focus-visible:ring-2 focus-visible:ring-waymarks-gold dark:border-white/10 dark:bg-white/5',
        draggingRef.current ? 'cursor-grabbing' : 'cursor-grab',
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
          transition: draggingRef.current ? 'none' : 'transform 80ms ease-out',
        }}
      >
        <canvas
          ref={canvasRef}
          aria-hidden
          className={cn(
            'max-h-full max-w-full select-none shadow-sm',
            status === 'ready' ? 'opacity-100' : 'opacity-0'
          )}
        />
      </div>
      {status === 'ready' && (
        <div className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-waymarks-ink/80 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-white/80">
          {Math.round(zoom * 100)}%
        </div>
      )}
    </div>
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
