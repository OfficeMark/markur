import { forwardRef, memo } from 'react';
import { Circle, Triangle, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AssetStatus } from '@/lib/asset-status';
import { statusLabel } from '@/lib/asset-status';
import { colorForType, labelForType } from '@/lib/pin-types';
import {
  DEFAULT_PIN_SHAPE,
  DEFAULT_PIN_SIZE,
  type PinShape,
  type PinSize,
} from '@/lib/queries/branding';

/**
 * Single asset pin (M10b, sized in M10e+, resized in M12, configurable in M26).
 *
 * Default pin color comes from the asset's TYPE (Directory blue, Egress
 * green, etc. - see lib/pin-types). Status (good/attention/flagged) is
 * conveyed by the icon inside the dot AND a thin ring overlay when the
 * pin needs attention or is flagged.
 *
 * Shape + size come from org_branding (M26): admins pick circle/square/
 * diamond and small/medium/large from /admin/branding. Drop-pin/teardrop
 * is intentionally absent — its tip-anchor positioning would require
 * changing the drag math and overlay placement; deferred to a follow-up.
 */

export type PinMarkerProps = {
  assetId: string;
  name: string;
  type: string;
  status: AssetStatus;
  shape?: PinShape;
  size?: PinSize;
  selected?: boolean;
  pendingSync?: boolean;
  unlocked?: boolean;
  repositioning?: boolean;
  faded?: boolean;
  fillColor?: string;
  /**
   * Formatted pin label (e.g. "001"). When provided, it's prepended to the
   * aria-label so SR users still hear the pin number even though the visual
   * label is hidden by default (M32 Step 1 — hover/press to reveal).
   */
  pinLabel?: string | null;
  /**
   * Audit-path edit mode (Feature 1): when set, this pin is stop N in the
   * walking order and shows a gold sequence badge + gold ring. `null` means the
   * pin is not (yet) in the path.
   */
  sequenceNumber?: number | null;
  onPointerDownDrag?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onClick?: () => void;
};

const ICON_BY_STATUS = {
  good: Circle,
  attention: Triangle,
  flagged: Square,
} as const;

const PIN_SIZE_PX: Record<PinSize, number> = {
  small: 18,
  medium: 22,
  large: 30,
};

const PIN_ICON_PX: Record<PinSize, number> = {
  small: 7,
  medium: 9,
  large: 13,
};

/**
 * PERF-4: memoized (CODE-REVIEW-2026-07-06) so dragging one pin does not
 * re-render every pin on the floor at pointermove frequency.
 */
export const PinMarker = memo(forwardRef<HTMLButtonElement, PinMarkerProps>(function PinMarker(
  {
    assetId,
    name,
    type,
    status,
    shape = DEFAULT_PIN_SHAPE,
    size = DEFAULT_PIN_SIZE,
    selected,
    pendingSync,
    unlocked,
    repositioning,
    faded,
    fillColor,
    pinLabel,
    sequenceNumber,
    onPointerDownDrag,
    onClick,
  },
  ref
) {
  const inPath = sequenceNumber != null;
  const Icon = ICON_BY_STATUS[status];
  const dragAccept = unlocked || repositioning;
  const lockSuffix = repositioning
    ? ', repositioning - drag to a new location'
    : unlocked
      ? ', unlocked - drag to move'
      : '';
  // S10: teardrop is the Markur map-pin silhouette (hollow centre), rendered
  // as an SVG instead of a CSS box; same colour rules as the other shapes.
  const isTeardrop = shape === 'teardrop';
  const resolvedFill = fillColor ?? colorForType(type);
  const ariaPrefix = pinLabel ? `Pin ${pinLabel}, ` : '';
  const statusRingClass =
    status === 'flagged'
      ? 'ring-1 ring-danger'
      : status === 'attention'
        ? 'ring-1 ring-warning'
        : '';
  const typeName = labelForType(type);

  const px = PIN_SIZE_PX[size];
  const iconPx = PIN_ICON_PX[size];
  // circle: full radius. square: gentle rounding so it isn't harsh at small sizes.
  // diamond: 45deg body rotation absorbed into the inline transform; inner icon counter-rotates.
  const shapeClass =
    shape === 'circle' ? 'rounded-full' : shape === 'square' ? 'rounded-md' : 'rounded-sm';
  const rotationDeg = shape === 'diamond' ? 45 : 0;
  const iconCounterRotate = shape === 'diamond';

  // State emphasis scales (M5 selection, M5 reposition) folded into the inline
  // transform so a single transform property carries everything that has to
  // compose: anchor centering, shape rotation, state scale, and the M22 #4
  // inverse-zoom scale (so pins stay roughly constant viewport size).
  const stateScale = repositioning ? 1.25 : selected ? 1.1 : 1;
  const transform =
    `translate(-50%, -50%) rotate(${rotationDeg}deg) scale(calc(${stateScale} / var(--zoom, 1)))`;

  return (
    <button
      ref={ref}
      type="button"
      data-asset-id={assetId}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (dragAccept) onPointerDownDrag?.(e);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      aria-label={`${ariaPrefix}${name} (${typeName}, ${statusLabel(status)}${lockSuffix}${
        inPath ? `, audit path stop ${sequenceNumber}` : ''
      })`}
      style={{
        backgroundColor: isTeardrop ? 'transparent' : resolvedFill,
        width: px,
        height: px,
        transform,
        transformOrigin: 'center center',
      }}
      className={cn(
        'group relative inline-flex items-center justify-center',
        !isTeardrop && shapeClass,
        // Hit-area extender (M12): visible body may be small (down to 18px) but the
        // tap target is enlarged by ~6px via a before-pseudo so phones stay easy to hit.
        'before:absolute before:-inset-1.5 before:rounded-full before:content-[""]',
        'transition-transform',
        // Teardrop carries its own white outline in the SVG; the others use a box border.
        !isTeardrop && 'border border-white shadow-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-waymarks-gold focus-visible:ring-offset-1',
        !repositioning && !unlocked && !selected && statusRingClass,
        repositioning && 'cursor-grab touch-none ring-4 ring-waymarks-gold ring-offset-2',
        repositioning &&
          'after:pointer-events-none after:absolute after:-inset-2 after:animate-pulse after:rounded-full after:border-[3px] after:border-dashed after:border-waymarks-gold',
        unlocked && !repositioning &&
          'cursor-grab touch-none ring-4 ring-waymarks-gold ring-offset-1',
        unlocked && !repositioning &&
          'after:pointer-events-none after:absolute after:-inset-1 after:animate-pulse after:rounded-full after:border-2 after:border-dashed after:border-waymarks-gold',
        !unlocked && !repositioning && selected && 'ring-4 ring-waymarks-gold',
        // Audit-path stop: a gold ring so path pins read as a connected set.
        inPath && !repositioning && !unlocked && !selected && 'ring-2 ring-waymarks-gold',
        pendingSync && 'border-dashed',
        faded && 'opacity-40'
      )}
    >
      {isTeardrop ? (
        <svg viewBox="0 0 24 24" width={px} height={px} className="drop-shadow-sm" aria-hidden>
          {/* Markur map-pin: teardrop body with a hollow centre (evenodd cut-out
              so the plan shows through), white outline for definition. */}
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M12 1.75a7.25 7.25 0 0 0-7.25 7.25c0 5.4 6.2 12.1 6.78 12.72a.64.64 0 0 0 .94 0c.58-.62 6.78-7.32 6.78-12.72A7.25 7.25 0 0 0 12 1.75Zm0 4.6a2.65 2.65 0 1 0 0 5.3 2.65 2.65 0 0 0 0-5.3Z"
            fill={resolvedFill}
            stroke="white"
            strokeWidth="1.1"
          />
        </svg>
      ) : (
        <Icon
          size={iconPx}
          className={cn('fill-white text-white', iconCounterRotate && '-rotate-45')}
          aria-hidden
        />
      )}
      {/* Flagged pins get a loud red badge so they stand out on the plan
          without opening the detail panel (M33). */}
      {status === 'flagged' && (
        <span
          aria-hidden
          className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-white bg-danger"
        />
      )}
      {/* Audit-path sequence badge (Feature 1): the pin's stop number in the
          walking order. Fixed size so it stays legible on the smallest pins;
          counter-rotated so it reads upright even on a diamond pin. */}
      {inPath && (
        <span
          aria-hidden
          className={cn(
            'absolute -left-2 -top-2 inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-full border border-white bg-waymarks-gold px-[3px] text-[9px] font-bold leading-none text-white shadow-sm',
            iconCounterRotate && '-rotate-45'
          )}
        >
          {sequenceNumber}
        </span>
      )}
    </button>
  );
}));
