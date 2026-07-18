import { useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Crop, PenTool } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FULL_CROP, clampCrop, type CropRect } from '@/lib/plan-prep';

/**
 * Crop-to-plan (Plan Prep "Enhance"). The user drags a box over the full,
 * content-complete plate to drop the peripheral title block / legend / border.
 * Everything inside the box is kept verbatim — walls, circulation, rooms,
 * labels. Conservative default: the whole plate (nothing cropped); the user
 * shrinks in to exclude clutter, never the reverse. Mobile-first big handles.
 */

type Corner = 'nw' | 'ne' | 'sw' | 'se';

function clamp01(v: number, lo = 0, hi = 1): number {
  return Math.min(hi, Math.max(lo, v));
}

export function PlanCropPanel({
  imageUrl,
  busy,
  redrawHref,
  onCancel,
  onKeepFull,
  onCrop,
}: {
  imageUrl: string;
  busy: boolean;
  redrawHref: string;
  onCancel: () => void;
  onKeepFull: () => void;
  onCrop: (rect: CropRect) => void;
}) {
  const [rect, setRect] = useState<CropRect>(FULL_CROP);
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: 'move' | Corner; startX: number; startY: number; start: CropRect } | null>(
    null
  );

  function begin(e: RPointerEvent, mode: 'move' | Corner) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { mode, startX: e.clientX, startY: e.clientY, start: rect };
  }

  function move(e: RPointerEvent) {
    const d = drag.current;
    const frame = frameRef.current;
    if (!d || !frame) return;
    const box = frame.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    const dx = (e.clientX - d.startX) / box.width;
    const dy = (e.clientY - d.startY) / box.height;
    let { x, y, w, h } = d.start;
    if (d.mode === 'move') {
      x = clamp01(x + dx, 0, 1 - w);
      y = clamp01(y + dy, 0, 1 - h);
    } else {
      let x0 = x;
      let y0 = y;
      let x1 = x + w;
      let y1 = y + h;
      const min = 0.05;
      if (d.mode.includes('w')) x0 = clamp01(x0 + dx, 0, x1 - min);
      if (d.mode.includes('e')) x1 = clamp01(x1 + dx, x0 + min, 1);
      if (d.mode.includes('n')) y0 = clamp01(y0 + dy, 0, y1 - min);
      if (d.mode.includes('s')) y1 = clamp01(y1 + dy, y0 + min, 1);
      x = x0;
      y = y0;
      w = x1 - x0;
      h = y1 - y0;
    }
    setRect({ x, y, w, h });
  }

  function end() {
    drag.current = null;
  }

  const handle =
    'absolute h-5 w-5 rounded-full border-2 border-white bg-waymarks-gold shadow touch-none';
  const corners: Array<{ c: Corner; cls: string }> = [
    { c: 'nw', cls: '-left-2.5 -top-2.5 cursor-nwse-resize' },
    { c: 'ne', cls: '-right-2.5 -top-2.5 cursor-nesw-resize' },
    { c: 'sw', cls: '-bottom-2.5 -left-2.5 cursor-nesw-resize' },
    { c: 'se', cls: '-bottom-2.5 -right-2.5 cursor-nwse-resize' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        {/* The wrapper shrinks to the image's rendered box (inline-block), and
            the img self-sizes preserving aspect ratio (max-w/max-h + intrinsic
            ratio) — contain, never stretch. So the crop overlay's normalized
            rect maps 1:1 to the plate, which cropPlateBlob converts to unscaled
            plate pixels. */}
        <div
          ref={frameRef}
          className="relative inline-block max-w-full touch-none select-none overflow-hidden rounded-lg border border-black/10 bg-white leading-none dark:border-white/10"
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        >
          <img
            src={imageUrl}
            alt="Uploaded plan"
            draggable={false}
            className="pointer-events-none block max-h-[52vh] max-w-full select-none"
          />
          {/* Crop box — the box-shadow dims everything outside it. */}
          <div
            className="absolute cursor-move border-2 border-waymarks-gold"
            style={{
              left: `${rect.x * 100}%`,
              top: `${rect.y * 100}%`,
              width: `${rect.w * 100}%`,
              height: `${rect.h * 100}%`,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
            }}
            onPointerDown={(e) => begin(e, 'move')}
          >
            {corners.map(({ c, cls }) => (
              <button
                key={c}
                type="button"
                aria-label={`Resize ${c} corner`}
                className={`${handle} ${cls}`}
                onPointerDown={(e) => begin(e, c)}
              />
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-text-muted">
        Drag the corners to frame the floor plan. Everything inside the box is kept —
        walls, hallways, stairs, elevators, washrooms, rooms, and labels. Only what's
        outside (title block, legend, border) is dropped.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <a
          href={redrawHref}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-waymarks-gold-deep underline decoration-waymarks-gold/40 underline-offset-2 hover:decoration-waymarks-gold"
        >
          <PenTool size={12} aria-hidden />
          Not clean enough? Have OfficeMark redraw this floor.
        </a>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Pick a different file
          </Button>
          <Button variant="secondary" onClick={onKeepFull} disabled={busy}>
            Keep full plan
          </Button>
          <Button
            variant="gold"
            loading={busy}
            iconLeft={<Crop size={14} aria-hidden />}
            onClick={() => onCrop(clampCrop(rect))}
          >
            Crop to plan
          </Button>
        </div>
      </div>
    </div>
  );
}
